/**
 * Payroll Processing's transaction store, status machine and context builder.
 *
 * `payrollEngine.js` computes; this module is what a browser session needs
 * around that: where a run is kept, which actions its current status allows,
 * who holds it open, and how the company's other modules are gathered into the
 * context the engine consumes.
 *
 * The context is the interesting part. A payroll run is not a form somebody
 * fills in — it is the point where Core, HRM and Timekeeping meet:
 *
 *   Core       → the 201 file (roster), pay codes, earning / deduction / bonus
 *                registers, the REF-011 deduction hierarchy, the payout calendar
 *   HRM        → salary information, approved loan schedules, leave balances
 *   Timekeeping→ the punch record for the run's own cutoff
 *   Settings   → the effective statutory and tax versions, the computation library
 *   Policies   → Take-Home Pay, Gross-Up, Deferred Deductions, Retirement, Final Pay
 *
 * `buildPayrollContext` is the single place those are collected, so a figure on
 * a payslip can always be traced back to the module that owns it.
 */

import { readHrmData } from './hrmData.js';
import { employeeRoster, YTD_AS_OF } from './employeeRoster.js';
import { seedComputations } from './computationCatalog.js';
import { effectiveStatutorySet } from './statutoryService.js';
import { graduatedTax } from './statutorySchedules.js';
import { readCorrections } from './payrollCorrections.js';
import { bankFileFor, journalFor, round2, runPayroll, ytdContributionOf } from './payrollEngine.js';

export const PAYROLL_RUNS_KEY = 'atlas-payroll-runs-v1';

const clone = value => JSON.parse(JSON.stringify(value));
const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

/* ------------------------------------------------------------ status machine */

/**
 * The statuses Annex C 5a names, and what each one permits.
 *
 * `Open` is editable and computable. `Draft` locks the figures so reports can
 * be generated against a stable set. Review and approval levels can still edit
 * — that is what "can edit the transaction" means on those rows — but only the
 * final approval can post. A posted run is locked on its lock date and, from
 * then on, only reports and the bank file come out of it.
 */
export const PAYROLL_STATUSES = Object.freeze([
  'Open', 'Draft', 'For Review', 'For Approval', 'Approved', 'Posted', 'Locked', 'Cancelled',
]);

export const PAYROLL_STATUS_TABS = Object.freeze(['All', 'Open', 'Draft', 'For Review', 'For Approval', 'Approved', 'Posted', 'Locked', 'Cancelled']);

const CAPABILITIES = {
  Open: { edit: true, recalculate: true, updateTransaction: true, reports: true, next: 'Draft' },
  Draft: { edit: false, recalculate: false, updateTransaction: false, reports: true, next: 'For Review' },
  'For Review': { edit: true, recalculate: true, updateTransaction: false, reports: true, next: 'For Approval' },
  'For Approval': { edit: true, recalculate: true, updateTransaction: false, reports: true, next: 'Approved' },
  Approved: { edit: false, recalculate: false, updateTransaction: false, reports: true, next: 'Posted' },
  Posted: { edit: false, recalculate: false, updateTransaction: false, reports: true, next: 'Locked' },
  Locked: { edit: false, recalculate: false, updateTransaction: false, reports: true, next: '' },
  Cancelled: { edit: false, recalculate: false, updateTransaction: false, reports: false, next: '' },
};

export function capabilitiesOf(run) {
  return CAPABILITIES[run?.status] || CAPABILITIES.Cancelled;
}

/**
 * The actions a run offers right now.
 *
 * Re-opening is deliberately asymmetric: a regular run may only be re-opened if
 * it is the most recent regular run, because re-opening an earlier one would
 * invalidate every run posted after it. A special run carries no such ordering,
 * so any of them may be re-opened.
 */
export function actionsFor(run, runs = [], actor = {}) {
  const capability = capabilitiesOf(run);
  const actions = [];
  const isMostRecentRegular = () => {
    const regular = runs.filter(row => row.payrollType === 'Regular' && row.status !== 'Cancelled')
      .sort((a, b) => String(b.payoutDate).localeCompare(String(a.payoutDate)));
    return regular[0]?.id === run.id;
  };

  const awaitingBackdate = backdatedApprovalPending(run);
  if (awaitingBackdate && actor.isPaAdmin) {
    actions.push({ key: 'approveBackdate', label: 'Approve Backdating', hint: 'Let this backdated transaction move forward' });
    actions.push({ key: 'rejectBackdate', label: 'Reject Backdating', tone: 'danger', hint: 'Cancel this backdated transaction' });
  }
  if (capability.edit) actions.push({ key: 'updateEntry', label: 'Update Entry', hint: 'View and edit the transaction per employee' });
  if (capability.recalculate) actions.push({ key: 'recalculate', label: 'Recalculate', hint: 'Recompute against the current masterfile, timekeeping and configuration' });
  if (capability.updateTransaction) actions.push({ key: 'updateTransaction', label: 'Update Transaction', hint: 'Change the run configuration, then recompute' });
  if (run.status === 'Open') actions.push(awaitingBackdate
    ? { key: 'postDraft', label: 'Save as Draft', hint: 'Waiting for P&A to approve the backdating', disabled: true }
    : { key: 'postDraft', label: 'Save as Draft', hint: 'Lock the figures so reports can be generated' });
  if (run.status === 'Draft') actions.push({ key: 'submitReview', label: 'Submit for Review', hint: 'Send to the next level of review' });
  if (run.status === 'For Review') actions.push({ key: 'submitApproval', label: 'Submit for Approval', hint: 'Send to the approver' });
  if (run.status === 'For Approval') actions.push({ key: 'approve', label: 'Approve', hint: 'Approve this payroll' });
  if (['For Review', 'For Approval'].includes(run.status)) actions.push({ key: 'reject', label: 'Reject', hint: 'Return the transaction to Open with remarks', tone: 'danger' });
  if (run.status === 'Approved') actions.push({ key: 'generateBankFile', label: 'Generate Bank File', hint: 'Produce the crediting instructions before posting' });
  if (run.status === 'Approved') {
    const earlier = earlierUnposted(run, runs);
    actions.push({
      key: 'post', label: 'Post',
      hint: earlier.length
        ? `Warning: ${earlier[0].transactionNumber} (an earlier ${run.paymentMode} period) is not posted yet`
        : 'Post the payroll and release the payslips',
    });
  }
  if (run.status === 'Posted') actions.push({ key: 'lock', label: 'Lock', hint: `Lock on ${run.lockDate || 'the configured lock date'}` });
  if (['Draft', 'For Review', 'For Approval', 'Approved', 'Posted', 'Locked'].includes(run.status)) {
    const closed = ['Posted', 'Locked'].includes(run.status);
    const allowed = (run.payrollType === 'Regular' ? isMostRecentRegular() : true) && (!closed || actor.isPaAdmin);
    actions.push({
      key: 'reopen', label: 'Re-open Transaction',
      hint: allowed ? 'Return the transaction to Open for editing' : (closed && !actor.isPaAdmin ? 'A posted or locked transaction is closed — only the super admin (P&A) can re-open it' : 'Only the most recent regular transaction can be re-opened'),
      disabled: !allowed || !actor.canReopen,
    });
  }
  if (!['Posted', 'Locked', 'Cancelled'].includes(run.status)) actions.push({ key: 'cancel', label: 'Cancel Transaction', tone: 'danger', hint: 'Cancel this run and release the statutory tables it held' });
  return actions;
}

/* -------------------------------------------------------------- backdating */

const POSTED_STATUSES = ['Posted', 'Locked'];

/**
 * The company's latest posted run that this run falls before, or null.
 *
 * A run is backdated when its payout date, or the start of its payroll period,
 * is earlier than the latest posted run's: payroll already released to
 * employees would be followed by one for an earlier date. Runs are stored per
 * company, so `runs` is always one company's register.
 */
export function backdatedAgainst(run, runs = []) {
  if (!run?.payoutDate) return null;
  const latest = runs
    .filter(row => row.id !== run.id && POSTED_STATUSES.includes(row.status) && row.payoutDate)
    .sort((left, right) => String(right.payoutDate).localeCompare(String(left.payoutDate)))[0];
  if (!latest) return null;
  const earlierPayout = run.payoutDate < latest.payoutDate;
  const earlierPeriod = Boolean(run.periodStart && latest.periodStart && run.periodStart < latest.periodStart);
  if (!earlierPayout && !earlierPeriod) return null;
  return { transactionNumber: latest.transactionNumber, payoutDate: latest.payoutDate, periodStart: latest.periodStart, periodEnd: latest.periodEnd };
}

export function backdatedApprovalPending(run) {
  return run?.backdated?.approval?.status === 'Pending';
}

/**
 * Stamps a new run with who filed it and, when it is backdated, the reason and
 * the approval it needs. A P&A Admin filing a backdated run approves it by
 * filing it; a Client Admin's waits for P&A when the company requires that.
 */
export function fileRun(draft, { runs = [], actor = '', isPaAdmin = false, requiresApproval = true } = {}) {
  const at = stamp();
  const against = backdatedAgainst(draft, runs);
  const { backdatedReason = '', ...rest } = draft;
  let run = { ...rest, createdBy: actor, createdAt: at, updatedBy: actor, updatedAt: at, backdated: null };
  if (against) {
    const approval = !requiresApproval ? { status: 'Not required' }
      : isPaAdmin ? { status: 'Approved', by: actor, at, remarks: 'Filed by P&A' }
        : { status: 'Pending' };
    run = { ...run, backdated: { against, reason: backdatedReason.trim(), approval } };
  }
  run = withAudit(run, { action: 'Filed', actor, detail: draft.remarks || '' });
  if (against) {
    run = withAudit(run, {
      action: 'Backdated run filed',
      actor,
      detail: `Earlier than ${against.transactionNumber} (payout ${against.payoutDate}). Reason: ${run.backdated.reason}${run.backdated.approval.status === 'Pending' ? ' · waiting for P&A approval' : ''}`,
    });
  }
  return run;
}

/* ------------------------------------------------------------------- store */

const storageKey = companyId => `${PAYROLL_RUNS_KEY}:${companyId || 'default'}`;

export function readPayrollRuns(companyId, storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(storageKey(companyId)) || 'null');
    if (!Array.isArray(saved)) return [];
    const currentDate = today();
    let changed = false;
    const normalized = saved.map(run => {
      if (run.status !== 'Posted' || !run.lockDate || run.lockDate > currentDate) return run;
      changed = true;
      return withAudit({ ...run, status: 'Locked' }, {
        action: 'Automatically locked',
        actor: 'System',
        detail: `Configured lock date ${run.lockDate} reached`,
      });
    });
    if (changed) storage?.setItem(storageKey(companyId), JSON.stringify(normalized));
    return normalized;
  } catch { return []; }
}

export function writePayrollRuns(companyId, runs, storage = globalThis.localStorage) {
  try { storage?.setItem(storageKey(companyId), JSON.stringify(runs)); } catch { /* quota */ }
  return runs;
}

export function savePayrollRun(companyId, run, storage = globalThis.localStorage) {
  const runs = readPayrollRuns(companyId, storage);
  const existing = runs.findIndex(row => row.id === run.id);
  const next = existing >= 0 ? runs.map(row => (row.id === run.id ? run : row)) : [run, ...runs];
  return writePayrollRuns(companyId, next, storage);
}

export function deletePayrollRun(companyId, runId, storage = globalThis.localStorage) {
  return writePayrollRuns(companyId, readPayrollRuns(companyId, storage).filter(row => row.id !== runId), storage);
}

/**
 * The next transaction number for a year, in the Dorado format the register
 * shows: `PR-2025-11-002`. It is generated, never typed.
 */
export function nextTransactionNumber(runs, year, month) {
  const prefix = `PR-${year}-${String(month).padStart(2, '0')}`;
  const used = runs.filter(row => String(row.transactionNumber || '').startsWith(prefix)).length;
  return `${prefix}-${String(used + 1).padStart(3, '0')}`;
}

/** The BRD default is one calendar day after payout unless a calendar supplies one. */
export function defaultLockDate(payoutDate, daysAfter = 1) {
  const iso = String(payoutDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + Number(daysAfter || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function blockingPayrollExceptions(run) {
  return (run?.result?.exceptions || []).filter(item => item.severity === 'Error');
}

function blockingExceptionMessage(run) {
  const errors = blockingPayrollExceptions(run);
  if (!errors.length) return '';
  const first = errors[0];
  return `Resolve ${errors.length} blocking payroll ${errors.length === 1 ? 'error' : 'errors'} before continuing. ${first.name ? `${first.name}: ` : ''}${first.message}`;
}

/* -------------------------------------------------------------- the record */

export const MONTHS = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);

/** A new transaction, with the defaults Annex C 3.g specifies for each switch. */
export function newPayrollRun({ runs = [], companyId, year = 2025, month = 'November', payrollType = 'Regular', paymentMode = 'Semi-monthly' } = {}) {
  const monthNumber = MONTHS.indexOf(month) + 1 || 11;
  const special = payrollType !== 'Regular';
  return {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    companyId,
    transactionNumber: nextTransactionNumber(runs, year, monthNumber),
    payrollType,
    transactionMode: 'Single',
    paymentMode,
    calendarCode: '',
    year,
    month,
    frequency: 'Second Half',
    periodStart: '',
    periodEnd: '',
    timekeepingStart: '',
    timekeepingEnd: '',
    payoutDate: '',
    lockDate: '',
    currency: 'PHP',
    multiCurrency: false,
    conversionRate: 1,
    // The currencies this transaction pays in, each at the rate typed here.
    currencies: [{ code: 'PHP', symbol: '₱', rate: 1 }],
    remarks: '',
    status: 'Open',
    config: {
      workDaysPerYear: 261,
      workHoursPerDay: 8,
      hoursInPeriod: 0,
      daysInPeriod: 0,
      // "By default, checkboxes are ticked" for allowable deductions; the rest
      // start unticked, and Zero Basic Pay starts ticked on a special run.
      computeAllowableDeduction: true,
      // Copied from Payroll Controls when the run is created (ECOLA Treatment).
      ecolaTreatment: 'Part of Basic Pay',
      // Order the non-taxable bonus ceiling is used up in (Bonus Ceiling Order reference table).
      bonusCeilingOrder: [],
      // Provident and pension funds from Payroll Controls, copied when the run is created.
      funds: [],
      statutoryAgencies: { sss: true, philhealth: true, pagibig: true, sssWisp: true },
      // Employee and employer shares are switched on separately, per agency.
      statutoryShares: { sss: { employee: true, employer: true }, sssWisp: { employee: true, employer: true }, philhealth: { employee: true, employer: true }, pagibig: { employee: true, employer: true } },
      statutorySchedule: 'Every payroll (split)',
      zeroBasicPay: special,
      zeroVariableAllowance: special,
      computeBasicPayAdjustment: true,
      computeVariableAllowanceAdjustment: true,
      // Forecast tax withheld in advance, typed per employee on the transaction.
      taxForecast: { enabled: false },
      // Year-to-date also counts the payrolls already posted inside this window (blank dates = the default window).
      ytd: { includePosted: true, startDate: '', endDate: '' },
      computeOvertimeAdjustment: true,
      computeAttendanceAdjustment: { absences: true, late: true, undertime: true },
      // Blank start and end dates mean the window from Leave Configuration applies.
      leaveConversion: { enabled: false, leaveTypes: [], startDate: '', endDate: '' },
      thirteenthMonth: { enabled: false, basis: 'Pre-defined (Computational Basis)', ntThreshold: 90000, bonusTypes: ['13th Month Pay'], employeeGroups: ['All Employees'] },
      // Eligibility, direction, hierarchy and per-earning cap live on each Earning Configuration;
      // the run switches the step on and may limit the total moved (blank = no pool limit).
      reclassification: { enabled: false, poolLimit: '', poolSource: 'amount' },
      computeFinalPay: false,
      // Year-end adjustment: annualise every employee's tax on this run.
      annualizeTax: false,
      recomputeFinalPay: false,
      computeTax: true,
      taxFormulaType: 'Government Table',
      grossUpAll: false,
      payslipTemplate: 'Standard Atlas Payslip',
    },
    population: { mode: 'Active/Inactive in 201', includeOnHold: false, included: [], excluded: [] },
    appliedPolicies: [],
    overrides: {},
    result: null,
    batches: [],
    approvals: [],
    audit: [],
    lock: null,
    createdBy: '',
    createdAt: stamp(),
    updatedBy: '',
    updatedAt: stamp(),
  };
}

/** Appends one audit entry; every status change and every edit writes one. */
export function withAudit(run, { action, actor, detail }) {
  return {
    ...run,
    updatedBy: actor || run.updatedBy,
    updatedAt: stamp(),
    audit: [{ at: stamp(), actor: actor || 'System', action, detail: detail || '' }, ...(run.audit || [])],
  };
}

/**
 * Record-level locking (the mock's "This payroll entry is currently locked
 * because another user is viewing or editing it").
 *
 * A lock is held by one session and expires, so a browser closed mid-edit does
 * not strand the transaction.
 */
export const LOCK_MINUTES = 15;

export function lockHeldBy(run, sessionId, now = Date.now()) {
  const lock = run?.lock;
  if (!lock) return null;
  if (now - Number(lock.at || 0) > LOCK_MINUTES * 60000) return null;
  return lock.sessionId === sessionId ? null : lock;
}

export function acquireLock(run, sessionId, actor) {
  return { ...run, lock: { sessionId, actor, at: Date.now() } };
}

export function releaseLock(run, sessionId) {
  return run?.lock?.sessionId === sessionId ? { ...run, lock: null } : run;
}

/* ---------------------------------------------------------- the transition */

/**
 * Apply one action to a run. Returns `{ run, message, error }` — an action the
 * status does not allow is refused with a reason rather than silently ignored.
 */
export function applyAction(run, action, { actor = 'P&A Admin', remarks = '', runs = [], context, isPaAdmin = false } = {}) {
  const capability = capabilitiesOf(run);
  const refuse = error => ({ run, error });
  const forwardActions = ['postDraft', 'submitReview', 'submitApproval', 'approve', 'post'];
  if (forwardActions.includes(action)) {
    const blocking = blockingExceptionMessage(run);
    if (blocking) return refuse(blocking);
    if (backdatedApprovalPending(run)) return refuse(`${run.transactionNumber} is backdated and waiting for P&A approval. It can be recalculated, but not moved forward until P&A approves it.`);
  }

  switch (action) {
    case 'recalculate': {
      if (!capability.recalculate) return refuse(`${run.transactionNumber} is ${run.status} and can no longer be recalculated.`);
      let result;
      try { result = runPayroll({ transaction: run, context }); }
      catch (error) { return refuse(error.message || 'Payroll computation failed.'); }
      return {
        run: withAudit({ ...run, result }, { action: 'Recalculated', actor, detail: `${result.totals.headcount} employees, net pay ₱${result.totals.netPay.toLocaleString()}` }),
        message: `${run.transactionNumber} recalculated — ${result.totals.headcount} employees, net pay ₱${result.totals.netPay.toLocaleString()}.`,
      };
    }
    case 'approveBackdate':
    case 'rejectBackdate': {
      if (!isPaAdmin) return refuse('Only P&A can decide on a backdated transaction.');
      if (!backdatedApprovalPending(run)) return refuse(`${run.transactionNumber} has no backdating approval waiting.`);
      const approved = action === 'approveBackdate';
      const approval = { status: approved ? 'Approved' : 'Rejected', by: actor, at: stamp(), remarks };
      const next = { ...run, backdated: { ...run.backdated, approval }, ...(approved ? {} : { status: 'Cancelled' }) };
      return {
        run: withAudit(next, { action: approved ? 'Backdating approved' : 'Backdating rejected — cancelled', actor, detail: remarks }),
        message: approved ? `${run.transactionNumber} backdating approved. It can now move forward.` : `${run.transactionNumber} backdating rejected. The transaction is cancelled.`,
      };
    }
    case 'postDraft': {
      if (run.status !== 'Open') return refuse('Only an open transaction can be posted as draft.');
      if (!run.result) return refuse('Recalculate the transaction before posting it as draft.');
      return { run: withAudit({ ...run, status: 'Draft' }, { action: 'Posted as draft', actor, detail: remarks }), message: `${run.transactionNumber} is now Draft — the figures are locked and reports can be generated.` };
    }
    case 'submitReview':
      if (run.status !== 'Draft') return refuse('Post the transaction as draft before sending it for review.');
      return {
        run: withAudit({ ...run, status: 'For Review', approvals: [...(run.approvals || []), { level: 'Review', actor, at: stamp(), decision: 'Submitted', remarks }] }, { action: 'Submitted for review', actor, detail: remarks }),
        message: `${run.transactionNumber} sent for review.`,
      };
    case 'submitApproval':
      if (run.status !== 'For Review') return refuse('The transaction must be under review before it can go for approval.');
      return {
        run: withAudit({ ...run, status: 'For Approval', approvals: [...(run.approvals || []), { level: 'Second review', actor, at: stamp(), decision: 'Reviewed', remarks }] }, { action: 'Submitted for approval', actor, detail: remarks }),
        message: `${run.transactionNumber} sent for approval.`,
      };
    case 'approve':
      if (run.status !== 'For Approval') return refuse('Only a transaction awaiting approval can be approved.');
      return {
        run: withAudit({ ...run, status: 'Approved', approvals: [...(run.approvals || []), { level: 'Approval', actor, at: stamp(), decision: 'Approved', remarks }] }, { action: 'Approved', actor, detail: remarks }),
        message: `${run.transactionNumber} approved.`,
      };
    case 'reject':
      if (!['For Review', 'For Approval'].includes(run.status)) return refuse('Only a transaction under review or approval can be rejected.');
      return {
        run: withAudit({ ...run, status: 'Open', approvals: [...(run.approvals || []), { level: run.status, actor, at: stamp(), decision: 'Rejected', remarks }] }, { action: 'Rejected', actor, detail: remarks }),
        message: `${run.transactionNumber} returned to Open.`,
      };
    case 'generateBankFile': {
      if (run.status !== 'Approved') return refuse('The bank file is generated only after payroll approval.');
      if (!run.result) return refuse('This transaction has no computed result for a bank file.');
      const rows = bankFileFor(run.result);
      return {
        run: withAudit(run, { action: 'Bank file generated', actor, detail: `${rows.length} crediting instructions in ${run.result.currency || 'PHP'}` }),
        message: `${run.transactionNumber} bank file generated — ${rows.length} crediting instructions in ${run.result.currency || 'PHP'}.`,
      };
    }
    case 'post': {
      if (run.status !== 'Approved') return refuse('Only an approved transaction can be posted.');
      if (!run.result) return refuse('This transaction has no computed result to post.');
      // Posting ahead of an earlier period is allowed, with a warning: the later run's year to
      // date left that period out, so it says so in its audit trail and in the confirmation.
      const earlier = earlierUnposted(run, runs);
      const ahead = earlier.length
        ? ` Warning: ${earlier.map(item => item.transactionNumber).join(', ')} (an earlier ${run.paymentMode} period) is not posted yet — year to date for this run leaves it out.`
        : '';
      let posted = withAudit({ ...run, status: 'Posted', postedAt: stamp(), postedBy: actor }, { action: 'Posted', actor, detail: `Net pay ₱${run.result.totals.netPay.toLocaleString()} released` });
      if (earlier.length) posted = withAudit({ ...posted, postedAhead: earlier.map(item => item.transactionNumber) }, { action: 'Posted ahead of an earlier period', actor, detail: `${earlier.map(item => item.transactionNumber).join(', ')} was not posted when this transaction was.` });
      return {
        run: posted,
        message: `${run.transactionNumber} posted. Payslips are available to employees and the year-to-date balances have moved.${ahead}`,
      };
    }
    case 'lock':
      if (run.status !== 'Posted') return refuse('Only a posted transaction can be locked.');
      return { run: withAudit({ ...run, status: 'Locked' }, { action: 'Locked', actor, detail: `Lock date ${run.lockDate || today()}` }), message: `${run.transactionNumber} is locked. Its figures are final.` };
    case 'reopen': {
      if (run.status === 'Cancelled') return refuse('A cancelled transaction cannot be re-opened.');
      if (['Posted', 'Locked'].includes(run.status) && !isPaAdmin) return refuse(`A ${run.status.toLowerCase()} transaction is closed — only the super admin (P&A) can re-open it.`);
      if (run.payrollType === 'Regular') {
        const regular = runs.filter(row => row.payrollType === 'Regular' && row.status !== 'Cancelled')
          .sort((a, b) => String(b.payoutDate).localeCompare(String(a.payoutDate)));
        if (regular[0]?.id !== run.id) return refuse('Only the most recent regular transaction can be re-opened.');
      }
      return { run: withAudit({ ...run, status: 'Open' }, { action: 'Re-opened', actor, detail: remarks }), message: `${run.transactionNumber} re-opened for editing.` };
    }
    case 'cancel':
      if (['Posted', 'Locked'].includes(run.status)) return refuse(`A ${run.status.toLowerCase()} transaction cannot be cancelled.`);
      return { run: withAudit({ ...run, status: 'Cancelled' }, { action: 'Cancelled', actor, detail: remarks }), message: `${run.transactionNumber} cancelled. The statutory versions it held are released.` };
    default:
      return refuse(`Unknown action "${action}".`);
  }
}

/* ------------------------------------------------------------- the context */

/**
 * Every dependency the engine needs, gathered from the modules that own them.
 *
 * `asOf` is the run's payout date, so a run dated last year computes on last
 * year's statutory tables even after this year's are published.
 */
/**
 * The formula library a transaction must be explained with.
 *
 * A run that can still be recalculated computes against the current library —
 * that is the point of recalculating. A run that can no longer be recalculated
 * has already fixed its figures, so it resolves its codes through the snapshot
 * it captured. August payroll keeps showing `ERN-002 v1.3` after the live
 * formula becomes v1.4, instead of being re-explained with a formula that did
 * not exist when it ran.
 */
/**
 * A formula version dated after the payout date is not yet in force: the run
 * computes with the latest version already effective on its payout date.
 */
export function computationsInForce(library = [], asOf, versions = []) {
  if (!asOf) return library;
  return library.map(item => {
    if (!item.effectiveDate || item.effectiveDate <= asOf) return item;
    const earlier = versions
      .filter(version => String(version.code).toUpperCase() === String(item.code).toUpperCase() && version.effectiveDate && version.effectiveDate <= asOf)
      .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate) || Number(right.version) - Number(left.version))[0];
    return earlier ? { ...item, expression: earlier.expression, parameters: earlier.parameters || item.parameters, version: earlier.version, effectiveDate: earlier.effectiveDate, scheduledVersion: item.version } : item;
  });
}

const readStandardVersions = storage => {
  try { return JSON.parse(storage?.getItem('atlas-standard-computation-versions-v4') || '[]') || []; } catch { return []; }
};

export function libraryForRun(run, current = []) {
  const entries = run?.result?.computationSnapshot?.entries || run?.computationSnapshot?.entries;
  if (!entries?.length || capabilitiesOf(run).recalculate) return current;
  const frozen = entries.map(entry => ({
    ...entry,
    id: entry.code,
    status: 'Active',
    isBuiltIn: entry.owner !== 'Company-defined',
    scope: entry.owner === 'Client-specific' || entry.owner === 'Company-defined' ? 'Client-specific' : 'Atlas standard',
    description: entry.description || `Version ${entry.version} as applied by ${run.transactionNumber}.`,
  }));
  const known = new Set(frozen.map(item => item.code));
  return [...frozen, ...current.filter(item => !known.has(item.code))];
}

export function buildPayrollContext({ companyId, run, hrmData, registers = {}, hierarchy = [], policies = {}, computations, serviceConfig = {}, references = [], staggeredRequests = [], variableAllowances = [], storage } = {}) {
  const data = hrmData || readHrmData(companyId, storage);
  const asOf = run?.payoutDate || today();
  // A loan's balance is what it was when the schedule was written, less every
  // amortization a posted payroll has since collected — payroll is the source
  // of truth for the balance, not a field someone types.
  const storedRuns = readPayrollRuns(companyId, storage);
  const paid = loanPaymentsCollected(storedRuns, run);
  const library = computationsInForce(libraryForRun(run, computations || seedComputations()), run?.payoutDate, readStandardVersions(storage || globalThis.localStorage));
  return {
    // What earlier payrolls this month already collected, for the maximum-first schedule.
    statutoryCollected: statutoryCollectedFor(storedRuns, run),
    // Year-to-date is the employee record plus what posted payrolls in the window collected.
    employees: run?.config?.ytd?.includePosted === false ? employeeRoster : withPostedYtd(employeeRoster, storedRuns, run),
    earlierUnposted: earlierUnposted(run, storedRuns).map(item => item.transactionNumber),
    salaryInformation: data.salaryInformation || [],
    timeLogs: data.timeLogs || [],
    // Shift assignments from Timekeeping: they set each employee's hours per day.
    shiftAssignments: (data.shiftAssignments || []).map(item => ({ employeeId: item.employeeId, startDate: item.startDate, endDate: item.endDate, workHours: item.workHours, name: item.shiftName })),
    loanSchedules: !paid.size ? data.loanInquiries || [] : (data.loanInquiries || []).map(row => {
      const collected = paid.get(row.transactionNumber || row.id) || 0;
      return collected ? { ...row, balance: round2(Math.max(0, Number(row.balance || 0) - collected)), collectedThroughPayroll: collected } : row;
    }),
    corrections: readCorrections(companyId, storage),
    deferralHistory: deferralHistory(storedRuns, run),
    leaveBalances: data.leaveBalances || [],
    registers: {
      earnings: registers.earnings || [],
      deductions: registers.deductions || [],
      bonuses: registers.bonuses || [],
      payCodes: registers.payCodes || [],
    },
    statutory: effectiveStatutorySet(asOf),
    policies,
    staggeredRequests,
    hierarchy,
    computations: library,
    // The payout date a bound value is resolved at: a client's dated change to
    // an approved value applies only from its own effective date.
    asOf,
    // The Services Information configurations that bind a formula, and the
    // reference sources those bindings resolve rows from. Both travel with the
    // context so the engine stays pure: it applies a binding, it never goes
    // looking for one.
    serviceConfig,
    references,
    variableAllowances,
    bonusCeiling: 90000,
  };
}

/** Amortizations each loan has had collected by posted payroll before this run. */
/**
 * How often each employee's deduction or loan has been deferred by posted
 * payroll before this run: the number of times, the total deferred, the last
 * period it was deferred in and the first due date it missed (its original
 * due date). Keyed `employeeId|code`.
 */
export function deferralHistory(runs = [], current) {
  const history = {};
  runs.filter(run => ['Posted', 'Locked'].includes(run.status) && run.result && run.id !== current?.id)
    .filter(run => !current?.payoutDate || String(run.payoutDate) < String(current.payoutDate))
    .sort((left, right) => String(left.payoutDate).localeCompare(String(right.payoutDate)))
    .forEach(run => run.result.lines.forEach(line => (line.deferred || []).forEach(item => {
      const id = `${line.employeeId}|${item.code || item.name}`;
      const entry = history[id] || { times: 0, total: 0, originalDueDate: run.payoutDate };
      history[id] = { ...entry, times: entry.times + 1, total: round2(entry.total + Number(item.deferredAmount ?? item.deferred ?? 0)), lastPeriod: `${run.periodStart} to ${run.periodEnd}`, lastTransaction: run.transactionNumber };
    })));
  return history;
}

function loanPaymentsCollected(runs = [], current) {
  const totals = new Map();
  runs.filter(run => ['Posted', 'Locked'].includes(run.status) && run.result && run.id !== current?.id)
    .filter(run => !current?.payoutDate || String(run.payoutDate) <= String(current.payoutDate))
    .forEach(run => run.result.lines.forEach(line => (line.loans || []).forEach(loan => {
      totals.set(loan.code, round2((totals.get(loan.code) || 0) + Number(loan.deducted || 0)));
    })));
  return totals;
}

/**
 * The payment matrix for one loan: every posted payroll that collected on it,
 * what was scheduled, what was actually paid, what was deferred, and the
 * balance after each payout.
 */
export function loanPaymentHistory(runs = [], loanCode) {
  const rows = runs
    .filter(run => ['Posted', 'Locked'].includes(run.status) && run.result)
    .sort((left, right) => String(left.payoutDate).localeCompare(String(right.payoutDate)))
    .flatMap(run => run.result.lines.flatMap(line => (line.loans || []).filter(loan => loan.code === loanCode).map(loan => ({
      key: `${run.id}-${loan.code}`, payoutDate: run.payoutDate, transactionNumber: run.transactionNumber,
      scheduled: round2(loan.originalDue ?? loan.due), paid: round2(loan.deducted), deferred: round2(loan.deferred || 0), balanceAfter: round2(loan.remaining ?? 0),
    }))));
  return { rows, paid: round2(rows.reduce((total, row) => total + row.paid, 0)), deferred: round2(rows.reduce((total, row) => total + row.deferred, 0)) };
}

/* -------------------------------------------------------------- reporting */

/**
 * The payroll sub-schedules Annex C 7 lists, each derived from the computed
 * lines. A report is a catalogue entry, never a bespoke screen — adding one
 * means adding an entry here.
 */
export const payrollReportCatalog = Object.freeze([
  {
    key: 'register', label: 'Detailed Payroll Register', group: 'Payroll',
    description: 'Every employee with basic pay, earnings, statutory contributions, tax, deductions and net pay.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' }, { key: 'department', label: 'Department' },
      { key: 'basicPayValue', label: 'Basic Pay', money: true }, { key: 'earningsValue', label: 'Earnings', money: true },
      { key: 'grossPayValue', label: 'Gross Pay', money: true }, { key: 'statutoryValue', label: 'Statutory (EE)', money: true },
      { key: 'taxValue', label: 'Withholding Tax', money: true }, { key: 'deductionsValue', label: 'Deductions & Loans', money: true },
      { key: 'netPayValue', label: 'Net Pay', money: true },
    ],
    build: result => result.lines.filter(line => line.status === 'Computed').map(line => ({
      key: line.employeeId, employeeCode: line.employeeCode, name: line.name, department: line.department,
      basicPayValue: line.basicPay,
      earningsValue: round2(line.taxableEarnings + line.nonTaxableEarnings + line.taxableBonus + line.nonTaxableBonus),
      grossPayValue: line.grossPay, statutoryValue: line.statutory.employeeTotal, taxValue: line.withholdingTax, taxForecastValue: line.taxForecast || 0,
      deductionsValue: round2(line.totalDeductions - line.statutory.employeeTotal - line.withholdingTax - (line.taxForecast || 0)),
      netPayValue: line.netPay,
    })),
  },
  {
    key: 'net-pay', label: 'Schedule of Net Pay', group: 'Payroll',
    description: 'The crediting instruction per employee and bank account.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' },
      { key: 'bankName', label: 'Bank' }, { key: 'accountNumber', label: 'Account Number' },
      { key: 'share', label: 'Share of Net Pay' }, { key: 'amountValue', label: 'Amount', money: true },
    ],
    build: result => bankFileFor(result).map((row, index) => ({ key: `${row.employeeCode}-${index}`, ...row, amountValue: row.amount })),
  },
  {
    key: 'basic-pay', label: 'Schedule of Basic Pay', group: 'Payroll',
    description: 'Basic pay with the rate and the days or hours it was priced from.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' }, { key: 'payType', label: 'Pay Type' },
      { key: 'monthlyRateValue', label: 'Monthly Rate', money: true }, { key: 'dailyRateValue', label: 'Daily Rate', money: true },
      { key: 'daysWorked', label: 'Days Rendered' }, { key: 'basicPayValue', label: 'Basic Pay', money: true },
    ],
    build: result => result.lines.filter(line => line.status === 'Computed').map(line => ({
      key: line.employeeId, employeeCode: line.employeeCode, name: line.name, payType: line.payType,
      monthlyRateValue: line.rates.monthlyRate, dailyRateValue: line.rates.dailyRate,
      daysWorked: line.attendance.daysWorked, basicPayValue: line.basicPay,
    })),
  },
  {
    key: 'statutory', label: 'Statutory Contributions Schedule', group: 'Statutory',
    description: 'Employee and employer shares per agency, the basis for every remittance return.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' },
      { key: 'sssEeValue', label: 'SSS EE', money: true }, { key: 'sssErValue', label: 'SSS ER', money: true },
      { key: 'ecValue', label: 'EC', money: true },
      { key: 'phicEeValue', label: 'PhilHealth EE', money: true }, { key: 'phicErValue', label: 'PhilHealth ER', money: true },
      { key: 'hdmfEeValue', label: 'Pag-IBIG EE', money: true }, { key: 'hdmfErValue', label: 'Pag-IBIG ER', money: true },
      { key: 'mwe', label: 'MWE' }, { key: 'mweIncomeValue', label: 'MWE Compensation (exempt)', money: true },
    ],
    build: result => result.lines.filter(line => line.status === 'Computed').map(line => ({
      key: line.employeeId, employeeCode: line.employeeCode, name: line.name, mwe: line.mwe ? 'Yes' : 'No', mweIncomeValue: line.mweIncome || 0,
      sssEeValue: line.statutory.sssEmployee, sssErValue: line.statutory.sssEmployer, ecValue: line.statutory.ec,
      phicEeValue: line.statutory.philhealthEmployee, phicErValue: line.statutory.philhealthEmployer,
      hdmfEeValue: line.statutory.hdmfEmployee, hdmfErValue: line.statutory.hdmfEmployer,
    })),
  },
  {
    key: 'tax', label: 'Withholding Tax Schedule (BIR 1601-C basis)', group: 'Statutory',
    description: 'Taxable income, the table applied and the tax withheld per employee.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' }, { key: 'tin', label: 'TIN' },
      { key: 'grossPayValue', label: 'Gross Pay', money: true }, { key: 'nonTaxableValue', label: 'Non-taxable', money: true },
      { key: 'mwe', label: 'MWE' }, { key: 'mweIncomeValue', label: 'MWE Compensation (exempt)', money: true },
      { key: 'taxableIncomeValue', label: 'Taxable Income', money: true }, { key: 'taxBasis', label: 'Tax Table' },
      { key: 'taxValue', label: 'Tax Withheld', money: true },
    ],
    build: (result, context = {}) => result.lines.filter(line => line.status === 'Computed').map(line => ({
      key: line.employeeId, employeeCode: line.employeeCode, name: line.name,
      tin: (context.employees || []).find(row => row.employeeId === line.employeeId)?.government?.tin || '',
      grossPayValue: line.grossPay, nonTaxableValue: round2(line.nonTaxableEarnings + line.nonTaxableBonus),
      mwe: line.mwe ? 'Yes' : 'No', mweIncomeValue: line.mweIncome || 0,
      taxableIncomeValue: line.taxableIncome, taxBasis: `${line.taxBasis}${line.taxTable ? ` (${line.taxTable.code})` : ''}`, taxValue: line.withholdingTax,
    })),
  },
  {
    key: 'loans', label: 'Employee Loan Balance Report', group: 'Payroll',
    description: 'What each loan collected this run and what remains outstanding.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' },
      { key: 'loanName', label: 'Loan' }, { key: 'kind', label: 'Type' },
      { key: 'dueValue', label: 'Scheduled', money: true }, { key: 'collectedValue', label: 'Collected', money: true },
      { key: 'deferredValue', label: 'Deferred', money: true }, { key: 'balanceValue', label: 'Remaining Balance', money: true },
    ],
    build: result => result.lines.filter(line => line.status === 'Computed').flatMap(line => line.loans.map(loan => ({
      key: `${line.employeeId}-${loan.code}`, employeeCode: line.employeeCode, name: line.name,
      loanName: loan.name, kind: loan.kind, dueValue: loan.due, collectedValue: loan.deducted,
      deferredValue: loan.deferred, balanceValue: loan.remaining,
    }))),
  },
  {
    key: 'lates-absences', label: 'Schedule of Lates and Absences', group: 'Timekeeping',
    description: 'The attendance units this run priced, straight from the punch record.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' },
      { key: 'absentDays', label: 'Absent Days' }, { key: 'tardinessMinutes', label: 'Late Minutes' },
      { key: 'undertimeMinutes', label: 'Undertime Minutes' }, { key: 'unpaidLeaveDays', label: 'Unpaid Leave Days' },
      { key: 'amountValue', label: 'Total Deducted', money: true },
    ],
    build: result => result.lines.filter(line => line.status === 'Computed').map(line => ({
      key: line.employeeId, employeeCode: line.employeeCode, name: line.name,
      absentDays: line.attendance.absentDays, tardinessMinutes: line.attendance.tardinessMinutes,
      undertimeMinutes: line.attendance.undertimeMinutes, unpaidLeaveDays: line.attendance.unpaidLeaveDays,
      amountValue: round2(line.deductions.filter(item => item.kind === 'Attendance').reduce((total, item) => total + item.deducted, 0)),
    })),
  },
  {
    key: 'overtime', label: 'Schedule of Overtime', group: 'Timekeeping',
    description: 'Approved overtime hours and the premium each type was paid at.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' },
      { key: 'otType', label: 'Overtime Type' }, { key: 'hours', label: 'Hours' },
      { key: 'multiplier', label: 'Premium' }, { key: 'amountValue', label: 'Overtime Pay', money: true },
    ],
    build: result => result.lines.filter(line => line.status === 'Computed').flatMap(line => line.earnings
      .filter(item => item.hours)
      .map(item => ({
        key: `${line.employeeId}-${item.code}`, employeeCode: line.employeeCode, name: line.name,
        otType: item.name.replace('Overtime — ', ''), hours: item.hours, multiplier: `${item.multiplier}×`, amountValue: item.amount,
      }))),
  },
  {
    key: 'journal', label: 'Payroll Entry (Journal)', group: 'Accounting',
    description: 'The balanced accounting entry generated from the pay codes\' GL mapping.',
    columns: [
      { key: 'account', label: 'GL Account' }, { key: 'description', label: 'Description' },
      { key: 'debitValue', label: 'Debit', money: true }, { key: 'creditValue', label: 'Credit', money: true },
    ],
    build: (result, context = {}) => journalFor(result, context.registers?.payCodes || []).entries
      .map((entry, index) => ({ key: `je-${index}`, ...entry, debitValue: entry.debit, creditValue: entry.credit })),
  },
  {
    key: 'exceptions', label: 'Exception Report', group: 'Payroll',
    description: 'Everything the run flagged: deferrals, reclassifications, missing authorities and negative pay.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' },
      { key: 'severity', label: 'Severity' }, { key: 'message', label: 'Exception' },
    ],
    build: result => result.exceptions.map((row, index) => ({
      key: `exc-${index}`, employeeCode: result.lines.find(line => line.employeeId === row.employeeId)?.employeeCode || '',
      name: row.name, severity: row.severity, message: row.message,
    })),
  },
  {
    key: 'ytd', label: 'Year-to-Date Balances', group: 'Payroll',
    description: 'What this run adds to each employee\'s year-to-date record and BIR 2316.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' },
      { key: 'openingValue', label: 'Taxable YTD (opening)', money: true }, { key: 'taxableEarningsValue', label: 'Taxable This Run', money: true },
      { key: 'closingValue', label: 'Taxable YTD (closing)', money: true }, { key: 'taxWithheldValue', label: 'Tax Withheld This Run', money: true },
    ],
    build: (result, context = {}) => result.lines.filter(line => line.status === 'Computed').map(line => {
      const opening = (context.employees || []).find(row => row.employeeId === line.employeeId)?.ytd?.taxableEarnings || 0;
      const contribution = ytdContributionOf(line);
      return {
        key: line.employeeId, employeeCode: line.employeeCode, name: line.name,
        openingValue: opening, taxableEarningsValue: contribution.taxableEarnings,
        closingValue: round2(opening + contribution.taxableEarnings), taxWithheldValue: contribution.taxWithheld,
      };
    }),
  },
]);


/* ------------------------------------------------- government and annual reports */

const computed = result => result.lines.filter(line => line.status === 'Computed');
const employeeOf = (context, line) => (context.employees || []).find(row => row.employeeId === line.employeeId) || {};
const monthOf = context => String(context.asOf || '').slice(0, 7);
const quarterOf = context => { const [year, month] = String(context.asOf || '').split('-').map(Number); return year ? `${year}-Q${Math.ceil((month || 1) / 3)}` : ''; };
const isMp2 = item => /MP2/i.test(item.name || '');

/**
 * The year's tax position for one employee, from the opening year-to-date on
 * their record plus what the posted runs in the window added. Used by the
 * annual clearance, the annual alphalist and the BIR 1700 support schedule,
 * which all answer the same question: was enough tax withheld for the year?
 */
function annualTaxPosition(row, context = {}) {
  const annualTaxable = round2(row.openingTaxableValue + row.taxableValue);
  const taxDue = context.statutory?.annualTax ? graduatedTax(context.statutory.annualTax, annualTaxable, 'Annual').tax : 0;
  const withheld = round2(row.openingTaxWithheldValue + row.taxWithheldValue);
  const difference = round2(taxDue - withheld);
  return {
    ...row,
    annualTaxableValue: annualTaxable,
    taxDueValue: round2(taxDue),
    totalWithheldValue: withheld,
    differenceValue: difference,
    outcome: Math.abs(difference) < 0.01 ? 'Balanced' : difference > 0 ? 'Tax still due — collect on the last payroll' : 'Over-withheld — refund due',
  };
}

const annualTaxBuild = (result, context = {}) => computed(result)
  .filter(line => !['Expanded', 'Final'].includes(employeeOf(context, line).payroll?.taxType))
  .map(line => {
    const employee = employeeOf(context, line);
    return {
      key: line.employeeId, employeeCode: line.employeeCode, name: line.name, tin: employee.government?.tin || '',
      grossValue: line.grossPay,
      nonTaxableValue: round2(line.nonTaxableEarnings + line.nonTaxableBonus),
      contributionsValue: line.statutory.employeeTotal,
      taxableValue: line.taxableIncome,
      taxWithheldValue: line.withholdingTax,
      schedule: line.mwe ? 'Schedule 2 (MWE)' : 'Schedule 1',
      mweIncomeValue: line.mweIncome || 0,
      mweDailyRate: line.mwe ? line.rates.dailyRate : '',
      mweMonthlyRate: line.mwe ? line.rates.monthlyRate : '',
      openingTaxableValue: Number(employee.ytd?.taxableEarnings) || 0,
      openingTaxWithheldValue: Number(employee.ytd?.taxWithheld) || 0,
    };
  });

const flatTaxBuild = kind => (result, context = {}) => computed(result)
  .filter(line => String(line.taxBasis || '').startsWith(kind))
  .map(line => {
    const employee = employeeOf(context, line);
    return {
      key: `${line.employeeId}-${monthOf(context)}`, month: monthOf(context), quarter: quarterOf(context),
      employeeCode: line.employeeCode, name: line.name, tin: employee.government?.tin || '',
      atc: line.taxAtc || employee.payroll?.atc || '', rate: line.taxRate == null ? '' : `${round2(line.taxRate * 100)}%`,
      incomeValue: line.taxableIncome, taxValue: line.withholdingTax,
    };
  });

const AGENCY_FORMS = [
  ['SSS', 'SSS R-3 / R-5 contribution collection', line => line.statutory.sssEmployee, line => round2(line.statutory.sssEmployer + line.statutory.ec)],
  ['PhilHealth', 'PhilHealth RF-1 premium remittance', line => line.statutory.philhealthEmployee, line => line.statutory.philhealthEmployer],
  ['Pag-IBIG', 'Pag-IBIG MCRF membership contribution', line => line.statutory.hdmfEmployee, line => line.statutory.hdmfEmployer],
  ['BIR', 'BIR 1601-C compensation withholding', line => line.withholdingTax, () => 0],
];

export const governmentReportCatalog = Object.freeze([
  {
    key: 'earnings-balance', label: 'Earnings with Balance', group: 'Payroll', perEmployee: true,
    description: 'Earnings paid over several runs: the total entitlement set in Earning Management, what the posted runs in the window paid, and what is left.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' }, { key: 'earning', label: 'Earning' },
      { key: 'entitlementValue', label: 'Total Entitlement', money: true, keep: true }, { key: 'paidValue', label: 'Paid in Window', money: true },
      { key: 'balanceValue', label: 'Balance', money: true, keep: true },
    ],
    build: (result, context = {}) => computed(result).flatMap(line => line.earnings
      .map(item => ({ item, register: (context.registers?.earnings || []).find(row => row.code === item.code && String(row.employee || '').startsWith(line.employeeCode)) }))
      .filter(({ register }) => Number(register?.totalAmount) > 0)
      .map(({ item, register }) => ({
        key: `${line.employeeId}-${item.code}`, employeeCode: line.employeeCode, name: line.name, earning: item.name,
        entitlementValue: Number(register.totalAmount), paidValue: item.amount,
      }))),
    finalize: row => ({ ...row, balanceValue: round2(Math.max(0, row.entitlementValue - row.paidValue)) }),
  },
  {
    key: 'accruals', label: 'Payroll Accruals', group: 'Accounting', perEmployee: true,
    description: 'What the posted runs accrue but have not yet paid: 13th month pay at one-twelfth of basic pay, and the employer share of SSS, EC, PhilHealth and Pag-IBIG.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' }, { key: 'costCenter', label: 'Cost Center' },
      { key: 'thirteenthValue', label: '13th Month Accrual', money: true }, { key: 'sssErValue', label: 'SSS ER', money: true },
      { key: 'ecValue', label: 'EC', money: true }, { key: 'phicErValue', label: 'PhilHealth ER', money: true },
      { key: 'hdmfErValue', label: 'Pag-IBIG ER', money: true }, { key: 'totalValue', label: 'Total Accrued', money: true },
    ],
    build: result => computed(result).map(line => {
      const thirteenth = round2(line.basicPay / 12);
      return {
        key: line.employeeId, employeeCode: line.employeeCode, name: line.name, costCenter: line.costCenter || '',
        thirteenthValue: thirteenth, sssErValue: line.statutory.sssEmployer, ecValue: line.statutory.ec,
        phicErValue: line.statutory.philhealthEmployer, hdmfErValue: line.statutory.hdmfEmployer,
        totalValue: round2(thirteenth + line.statutory.employerTotal),
      };
    }),
  },
  {
    key: 'annual-clearance', label: 'Annual Tax Clearance', group: 'Statutory', perEmployee: true,
    description: 'Year-end tax reconciliation per employee: annual taxable compensation against the annual table, less everything withheld, showing tax still due or the refund.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' }, { key: 'tin', label: 'TIN' },
      { key: 'openingTaxableValue', label: 'Taxable YTD Before Window', money: true, keep: true }, { key: 'taxableValue', label: 'Taxable in Window', money: true },
      { key: 'annualTaxableValue', label: 'Annual Taxable', money: true, keep: true }, { key: 'taxDueValue', label: 'Annual Tax Due', money: true, keep: true },
      { key: 'openingTaxWithheldValue', label: 'Withheld Before Window', money: true, keep: true }, { key: 'taxWithheldValue', label: 'Withheld in Window', money: true },
      { key: 'differenceValue', label: 'Still Due / (Refund)', money: true, keep: true }, { key: 'outcome', label: 'Outcome' },
    ],
    build: annualTaxBuild,
    finalize: annualTaxPosition,
  },
  {
    key: 'alphalist-annual', label: 'Annual Alphalist of Employees (1604-C Schedule 1)', group: 'Statutory', perEmployee: true, dat: 'ALPHA1604C',
    description: 'The annual alphalist BIR 1604-C asks for: gross compensation, non-taxable pay and contributions, taxable compensation, tax due and tax withheld per employee.',
    columns: [
      { key: 'schedule', label: 'Alphalist Schedule' }, { key: 'tin', label: 'TIN' }, { key: 'name', label: 'Employee Name' },
      { key: 'mweDailyRate', label: 'Statutory Minimum Wage / Day', keep: true }, { key: 'mweMonthlyRate', label: 'Statutory Minimum Wage / Month', keep: true },
      { key: 'mweIncomeValue', label: 'MWE Compensation (SMW, holiday, OT, ND — exempt)', money: true },
      { key: 'grossValue', label: 'Gross Compensation', money: true }, { key: 'nonTaxableValue', label: 'Non-taxable 13th Month, Benefits and De Minimis', money: true },
      { key: 'contributionsValue', label: 'SSS, PhilHealth, Pag-IBIG (EE)', money: true }, { key: 'annualTaxableValue', label: 'Taxable Compensation', money: true, keep: true },
      { key: 'taxDueValue', label: 'Tax Due', money: true, keep: true }, { key: 'totalWithheldValue', label: 'Tax Withheld', money: true, keep: true },
      { key: 'differenceValue', label: 'Adjustment', money: true, keep: true },
    ],
    build: annualTaxBuild,
    finalize: annualTaxPosition,
  },
  {
    key: 'bir-1700', label: 'BIR 1700 Support Schedule', group: 'Statutory', perEmployee: true,
    description: 'The compensation figures an employee needs for BIR Form 1700: taxable compensation from this employer, tax due and tax withheld. Also what the employee sees in self-service.',
    columns: [
      { key: 'tin', label: 'TIN' }, { key: 'name', label: 'Employee Name' },
      { key: 'annualTaxableValue', label: 'Taxable Compensation', money: true, keep: true }, { key: 'taxDueValue', label: 'Tax Due', money: true, keep: true },
      { key: 'totalWithheldValue', label: 'Tax Withheld by Employer', money: true, keep: true }, { key: 'differenceValue', label: 'Tax Still Due / (Overpaid)', money: true, keep: true },
    ],
    build: annualTaxBuild,
    finalize: annualTaxPosition,
  },
  {
    key: 'alphalist-monthly', label: 'Monthly Alphalist of Payees', group: 'Statutory', perEmployee: true, dat: 'MAP',
    description: 'Per month and employee: compensation, taxable amount and tax withheld — the monthly schedule that feeds the annual clearance.',
    columns: [
      { key: 'month', label: 'Month' }, { key: 'tin', label: 'TIN' }, { key: 'name', label: 'Employee Name' }, { key: 'mwe', label: 'MWE' },
      { key: 'grossValue', label: 'Gross Compensation', money: true }, { key: 'mweIncomeValue', label: 'MWE Compensation (exempt)', money: true },
      { key: 'taxableValue', label: 'Taxable', money: true }, { key: 'taxValue', label: 'Tax Withheld', money: true },
    ],
    build: (result, context = {}) => computed(result).map(line => ({
      key: `${line.employeeId}-${monthOf(context)}`, month: monthOf(context), tin: employeeOf(context, line).government?.tin || '', name: line.name,
      mwe: line.mwe ? 'Yes' : 'No', grossValue: line.grossPay, mweIncomeValue: line.mweIncome || 0, taxableValue: line.taxableIncome, taxValue: line.withholdingTax,
    })),
  },
  {
    key: 'final-tax', label: 'BIR Final Tax Text File (1601-F / 1604-F)', group: 'Statutory', perEmployee: true, dat: 'QAP1601F',
    description: 'Income subject to final tax: payee TIN, ATC, rate, income and tax withheld, in the BIR alphalist text file layout.',
    columns: [
      { key: 'month', label: 'Month' }, { key: 'tin', label: 'TIN' }, { key: 'name', label: 'Payee' }, { key: 'atc', label: 'ATC' }, { key: 'rate', label: 'Rate' },
      { key: 'incomeValue', label: 'Income Payment', money: true }, { key: 'taxValue', label: 'Final Tax Withheld', money: true },
    ],
    build: flatTaxBuild('Final tax'),
  },
  {
    key: 'expanded-tax', label: 'BIR Expanded Tax Text File (QAP)', group: 'Statutory', perEmployee: true, dat: 'QAP1601EQ',
    description: 'Payees subject to expanded withholding: TIN, ATC, rate, income payment and tax withheld, in the BIR quarterly alphalist of payees text file layout.',
    columns: [
      { key: 'month', label: 'Month' }, { key: 'tin', label: 'TIN' }, { key: 'name', label: 'Payee' }, { key: 'atc', label: 'ATC' }, { key: 'rate', label: 'Rate' },
      { key: 'incomeValue', label: 'Income Payment', money: true }, { key: 'taxValue', label: 'Tax Withheld', money: true },
    ],
    build: flatTaxBuild('Expanded'),
  },
  {
    key: 'bir-1601eq', label: 'BIR 1601-EQ Quarterly Expanded Withholding', group: 'Statutory', perEmployee: true,
    description: 'The quarterly return: tax withheld per ATC for the quarter, from the posted runs.',
    columns: [
      { key: 'quarter', label: 'Quarter' }, { key: 'atc', label: 'ATC' }, { key: 'rate', label: 'Rate' }, { key: 'payees', label: 'Payees' },
      { key: 'incomeValue', label: 'Income Payments', money: true }, { key: 'taxValue', label: 'Tax Withheld', money: true },
    ],
    build: (result, context = {}) => flatTaxBuild('Expanded')(result, context).map(row => ({ ...row, key: `${row.quarter}-${row.atc}`, payees: 1 })),
  },
  {
    key: 'gov-remittances', label: 'Monthly Government Remittance Returns', group: 'Remittance', perEmployee: true,
    description: 'What each agency is owed for the month: employee and employer shares for SSS, PhilHealth and Pag-IBIG, and the tax withheld for BIR 1601-C.',
    columns: [
      { key: 'month', label: 'Month' }, { key: 'agency', label: 'Agency' }, { key: 'form', label: 'Return' }, { key: 'employees', label: 'Employees' },
      { key: 'eeValue', label: 'Employee Share / Tax', money: true }, { key: 'erValue', label: 'Employer Share', money: true }, { key: 'totalValue', label: 'Total to Remit', money: true },
    ],
    build: (result, context = {}) => computed(result).flatMap(line => AGENCY_FORMS.map(([agency, form, ee, er]) => ({
      key: `${monthOf(context)}-${agency}`, month: monthOf(context), agency, form, employees: 1,
      eeValue: round2(ee(line)), erValue: round2(er(line)), totalValue: round2(ee(line) + er(line)),
    }))).filter(row => row.totalValue > 0),
    finalize: row => row,
  },
  {
    key: 'hdmf-receipts', label: 'Pag-IBIG Summary of Receipts and Remittance Schedule (with MP2)', group: 'Remittance', perEmployee: true,
    description: 'Per employee and month: Pag-IBIG employee and employer shares and MP2 savings, so MP2 appears in the same remittance schedule.',
    columns: [
      { key: 'month', label: 'Month' }, { key: 'mid', label: 'Pag-IBIG MID' }, { key: 'name', label: 'Employee Name' },
      { key: 'eeValue', label: 'EE Share', money: true }, { key: 'erValue', label: 'ER Share', money: true }, { key: 'mp2Value', label: 'MP2 Savings', money: true }, { key: 'totalValue', label: 'Total', money: true },
    ],
    build: (result, context = {}) => computed(result).map(line => {
      const mp2 = round2(line.deductions.filter(isMp2).reduce((total, item) => total + item.deducted, 0));
      return {
        key: `${line.employeeId}-${monthOf(context)}`, month: monthOf(context), mid: employeeOf(context, line).government?.hdmf || '', name: line.name,
        eeValue: line.statutory.hdmfEmployee, erValue: line.statutory.hdmfEmployer, mp2Value: mp2,
        totalValue: round2(line.statutory.hdmfEmployee + line.statutory.hdmfEmployer + mp2),
      };
    }).filter(row => row.totalValue > 0),
  },
  {
    key: 'mp2-remittance', label: 'HDMF MP2 Remittance File (Excel converter)', group: 'Remittance', perEmployee: true,
    description: 'MP2 savings collected through payroll, in the columns Pag-IBIG\'s MP2 upload template uses.',
    columns: [
      { key: 'mp2Account', label: 'MP2 Account No.' }, { key: 'mid', label: 'Pag-IBIG MID' }, { key: 'name', label: 'Member Name' },
      { key: 'period', label: 'Period Covered' }, { key: 'amountValue', label: 'Amount', money: true },
    ],
    build: (result, context = {}) => computed(result).flatMap(line => line.deductions.filter(isMp2).map(item => ({
      key: `${line.employeeId}-${monthOf(context)}`, mp2Account: employeeOf(context, line).government?.mp2 || '', mid: employeeOf(context, line).government?.hdmf || '',
      name: line.name, period: monthOf(context), amountValue: item.deducted,
    }))),
  },
  {
    key: 'mp2-accounts', label: 'HDMF MP2 Account Numbers', group: 'Remittance', perEmployee: true,
    description: 'Every employee saving in MP2 through payroll: MP2 account number, Pag-IBIG MID and what the window collected.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' }, { key: 'mp2Account', label: 'MP2 Account No.' },
      { key: 'mid', label: 'Pag-IBIG MID' }, { key: 'amountValue', label: 'Collected in Window', money: true },
    ],
    build: (result, context = {}) => computed(result).filter(line => line.deductions.some(isMp2)).map(line => ({
      key: line.employeeId, employeeCode: line.employeeCode, name: line.name,
      mp2Account: employeeOf(context, line).government?.mp2 || 'Not on file', mid: employeeOf(context, line).government?.hdmf || '',
      amountValue: round2(line.deductions.filter(isMp2).reduce((total, item) => total + item.deducted, 0)),
    })),
  },
  {
    key: 'deductions-schedule', label: 'Deductions', group: 'Payroll', perEmployee: true,
    description: 'Every company deduction and loan per employee: what was scheduled, collected, deferred and what is still owed.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' }, { key: 'item', label: 'Deduction / Loan' }, { key: 'kind', label: 'Type' },
      { key: 'dueValue', label: 'Scheduled', money: true }, { key: 'collectedValue', label: 'Collected', money: true },
      { key: 'deferredValue', label: 'Deferred', money: true }, { key: 'timesDeferred', label: 'Times Deferred' }, { key: 'lastDeferredPeriod', label: 'Last Deferred' },
      { key: 'originalDueDate', label: 'Original Due Date' }, { key: 'balanceValue', label: 'Balance', money: true, keep: true },
    ],
    build: result => computed(result).flatMap(line => [...line.deductions, ...line.loans].filter(item => item.kind !== 'Attendance').map(item => ({
      timesDeferred: item.timesDeferred || 0, lastDeferredPeriod: item.lastDeferredPeriod || '', originalDueDate: item.originalDueDate || '',
      key: `${line.employeeId}-${item.code || item.name}`, employeeCode: line.employeeCode, name: line.name, item: item.name,
      kind: item.group === 'Loan' ? `${item.kind} loan` : 'Company deduction',
      dueValue: item.due, collectedValue: item.deducted, deferredValue: item.deferred || 0, balanceValue: item.remaining ?? 0,
    }))),
  },
  {
    key: 'monthly-deductions', label: 'Monthly Deductions', group: 'Payroll', perEmployee: true,
    description: 'Per month, every deduction collected across the company, tagged as withholding tax, other statutory deduction, loan or company deduction.',
    columns: [
      { key: 'month', label: 'Month' }, { key: 'item', label: 'Deduction' }, { key: 'tag', label: 'Tag' },
      { key: 'employees', label: 'Employees' }, { key: 'amountValue', label: 'Collected', money: true },
    ],
    build: (result, context = {}) => {
      const tagOf = name => (context.serviceConfig?.deductions || []).find(row => row.name === name)?.deductionTag || 'Company Deduction';
      return computed(result).flatMap(line => [
        { item: 'Withholding tax', tag: 'Withholding Tax', amount: line.withholdingTax },
        { item: 'SSS (employee)', tag: 'Other Statutory Deduction', amount: line.statutory.sssEmployee },
        { item: 'PhilHealth (employee)', tag: 'Other Statutory Deduction', amount: line.statutory.philhealthEmployee },
        { item: 'Pag-IBIG (employee)', tag: 'Other Statutory Deduction', amount: line.statutory.hdmfEmployee },
        ...line.loans.map(loan => ({ item: loan.name, tag: `${loan.kind} Loan`, amount: loan.deducted })),
        ...line.deductions.filter(item => item.kind !== 'Attendance').map(item => ({ item: item.name, tag: tagOf(item.name), amount: item.deducted })),
      ].filter(row => row.amount > 0).map(row => ({ key: `${monthOf(context)}-${row.item}`, month: monthOf(context), item: row.item, tag: row.tag, employees: 1, amountValue: row.amount })));
    },
  },
  {
    key: 'compliance', label: 'Payroll Compliance', group: 'Payroll', perEmployee: true,
    description: 'Per employee: whether the government numbers are on file and whether each contribution and the tax were computed as the 201 file says they should be.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' },
      { key: 'ids', label: 'TIN / SSS / PhilHealth / Pag-IBIG on file' }, { key: 'sss', label: 'SSS' }, { key: 'phic', label: 'PhilHealth' },
      { key: 'hdmf', label: 'Pag-IBIG' }, { key: 'tax', label: 'Withholding Tax' }, { key: 'issues', label: 'Issues' },
    ],
    build: (result, context = {}) => computed(result).map(line => {
      const employee = employeeOf(context, line);
      const gov = employee.government || {};
      const pay = employee.payroll || {};
      const check = (switchOn, amount, label) => (switchOn === 'No' ? 'Not required' : amount > 0 ? 'Collected' : `Missing ${label}`);
      const cells = {
        sss: check(pay.withSss, line.statutory.sssEmployee, 'SSS'),
        phic: check(pay.withPhilhealth, line.statutory.philhealthEmployee, 'PhilHealth'),
        hdmf: check(pay.withHdmf, line.statutory.hdmfEmployee, 'Pag-IBIG'),
        tax: pay.mwe === 'Yes' ? 'MWE exempt' : pay.withWithholdingTax === 'No' ? 'Not required' : `Computed (${line.taxBasis})`,
      };
      const missingIds = [['TIN', gov.tin], ['SSS', pay.withSss !== 'No' && gov.sss], ['PhilHealth', pay.withPhilhealth !== 'No' && gov.philhealth], ['Pag-IBIG', pay.withHdmf !== 'No' && gov.hdmf]]
        .filter(([label, value]) => value === '' || value === undefined).map(([label]) => label);
      const issues = [...missingIds.map(label => `${label} number missing`), ...Object.values(cells).filter(value => /Missing|Check/.test(value))];
      return { key: line.employeeId, employeeCode: line.employeeCode, name: line.name, ids: missingIds.length ? `Missing: ${missingIds.join(', ')}` : 'Complete', ...cells, issues: issues.join('; ') || 'None' };
    }),
  },
  ...['Provident Fund', 'Pension Fund'].map(fundType => ({
    key: fundType === 'Provident Fund' ? 'provident-fund' : 'pension-fund', label: fundType, group: 'Payroll', perEmployee: true,
    description: `${fundType} members: the basis, the employee share withheld and the employer share accrued.`,
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' }, { key: 'fund', label: 'Fund' },
      { key: 'basisValue', label: 'Basis', money: true }, { key: 'employeeValue', label: 'Employee Share', money: true },
      { key: 'employerValue', label: 'Employer Share', money: true }, { key: 'totalValue', label: 'Total Contribution', money: true },
    ],
    build: result => computed(result).flatMap(line => (line.funds || []).filter(fund => fund.fundType === fundType).map(fund => ({
      key: `${line.employeeId}-${fund.code}`, employeeCode: line.employeeCode, name: line.name, fund: `${fund.code} · ${fund.name}`,
      basisValue: fund.basisAmount, employeeValue: fund.employee, employerValue: fund.employer, totalValue: round2(fund.employee + fund.employer),
    }))),
  })),
  {
    key: 'gross-up', label: 'Gross-up', group: 'Payroll', perEmployee: true,
    description: 'Employees whose pay was grossed up: the target taxable pay, the grossed-up amount and the tax the employer absorbed.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' },
      { key: 'targetValue', label: 'Target Taxable Pay', money: true }, { key: 'grossedValue', label: 'Grossed-up Amount', money: true },
      { key: 'upliftValue', label: 'Uplift', money: true }, { key: 'employerTaxValue', label: 'Tax Absorbed by Employer', money: true },
    ],
    build: result => computed(result).filter(line => line.grossUp).map(line => ({
      key: line.employeeId, employeeCode: line.employeeCode, name: line.name, targetValue: round2(line.grossUp.grossedUp - line.grossUp.uplift),
      grossedValue: line.grossUp.grossedUp, upliftValue: line.grossUp.uplift, employerTaxValue: line.grossUp.employerTax,
    })),
  },
  {
    key: 'final-pay', label: 'Final Pay', group: 'Payroll', perEmployee: true,
    description: 'Separated employees paid on a final-pay run: gross, annualised tax, deductions and net final pay.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' }, { key: 'separated', label: 'Separation Date' },
      { key: 'grossValue', label: 'Gross Final Pay', money: true }, { key: 'taxValue', label: 'Tax (annualised)', money: true },
      { key: 'deductionsValue', label: 'Deductions and Offsets', money: true }, { key: 'netValue', label: 'Net Final Pay', money: true }, { key: 'taxBasis', label: 'Tax Basis' },
    ],
    build: (result, context = {}) => computed(result).filter(line => line.finalPay).map(line => ({
      key: line.employeeId, employeeCode: line.employeeCode, name: line.name, separated: employeeOf(context, line).dateSeparated || employeeOf(context, line).separationDate || '',
      grossValue: line.grossPay, taxValue: line.withholdingTax, deductionsValue: round2(line.totalDeductions - line.withholdingTax), netValue: line.netPay, taxBasis: line.taxBasis,
    })),
  },
  {
    key: 'remittance-converter', label: 'Remittance Converter', group: 'Remittance', perEmployee: true,
    description: 'The rows each agency\'s upload template expects: SSS R-3 (SS number, EE, ER, EC), PhilHealth RF-1 (PIN, EE, ER) and Pag-IBIG MCRF (MID, EE, ER), per employee and month.',
    columns: [
      { key: 'agency', label: 'Agency File' }, { key: 'month', label: 'Applicable Month' }, { key: 'memberId', label: 'Member ID' }, { key: 'name', label: 'Member Name' },
      { key: 'eeValue', label: 'EE Share', money: true }, { key: 'erValue', label: 'ER Share', money: true }, { key: 'ecValue', label: 'EC', money: true },
    ],
    build: (result, context = {}) => computed(result).flatMap(line => {
      const gov = employeeOf(context, line).government || {};
      return [
        { agency: 'SSS R-3', memberId: gov.sss, ee: line.statutory.sssEmployee, er: line.statutory.sssEmployer, ec: line.statutory.ec },
        { agency: 'PhilHealth RF-1', memberId: gov.philhealth, ee: line.statutory.philhealthEmployee, er: line.statutory.philhealthEmployer, ec: 0 },
        { agency: 'Pag-IBIG MCRF', memberId: gov.hdmf, ee: line.statutory.hdmfEmployee, er: line.statutory.hdmfEmployer, ec: 0 },
      ].filter(row => row.ee + row.er > 0).map(row => ({
        key: `${row.agency}-${monthOf(context)}-${line.employeeId}`, agency: row.agency, month: monthOf(context), memberId: row.memberId || 'Not on file', name: line.name,
        eeValue: row.ee, erValue: row.er, ecValue: row.ec,
      }));
    }),
  },
  {
    key: 'loan-remittances', label: 'SSS and Pag-IBIG Loan Remittances', group: 'Remittance', perEmployee: true,
    description: 'Government loan amortisations collected through payroll, per employee and month, for the SSS and Pag-IBIG loan remittance files.',
    columns: [
      { key: 'agency', label: 'Agency' }, { key: 'month', label: 'Month' }, { key: 'memberId', label: 'Member ID' }, { key: 'name', label: 'Member Name' },
      { key: 'loan', label: 'Loan' }, { key: 'amountValue', label: 'Amortisation Collected', money: true }, { key: 'balanceValue', label: 'Balance After', money: true, keep: true },
    ],
    build: (result, context = {}) => computed(result).flatMap(line => line.loans.filter(loan => loan.kind === 'Government' && loan.deducted > 0).map(loan => {
      const agency = /pag-?ibig|hdmf/i.test(loan.name) ? 'Pag-IBIG' : 'SSS';
      const gov = employeeOf(context, line).government || {};
      return {
        key: `${agency}-${monthOf(context)}-${line.employeeId}-${loan.code}`, agency, month: monthOf(context), memberId: (agency === 'SSS' ? gov.sss : gov.hdmf) || 'Not on file',
        name: line.name, loan: loan.name, amountValue: loan.deducted, balanceValue: loan.remaining ?? 0,
      };
    })),
  },
  {
    key: 'payroll-summary', label: 'High Level Payroll Report', group: 'Payroll', perEmployee: true,
    description: 'One line per month: headcount, gross pay, statutory contributions, tax, net pay and employer cost across the posted runs.',
    columns: [
      { key: 'month', label: 'Month' }, { key: 'headcount', label: 'Employee Lines' },
      { key: 'grossValue', label: 'Gross Pay', money: true }, { key: 'statutoryValue', label: 'Statutory (EE)', money: true },
      { key: 'employerValue', label: 'Statutory (ER)', money: true }, { key: 'taxValue', label: 'Withholding Tax', money: true },
      { key: 'netValue', label: 'Net Pay', money: true }, { key: 'costValue', label: 'Employer Cost', money: true },
    ],
    build: (result, context = {}) => [{
      key: monthOf(context), month: monthOf(context), headcount: result.totals.headcount,
      grossValue: result.totals.grossPay, statutoryValue: result.totals.statutoryEmployee, employerValue: result.totals.statutoryEmployer,
      taxValue: result.totals.withholdingTax, netValue: result.totals.netPay, costValue: result.totals.employerCost,
    }],
  },
  {
    key: 'phic-pmrf', label: 'PhilHealth PMRF (Member Registration)', group: 'Statutory', perEmployee: true,
    description: 'Employees PhilHealth still needs a Member Registration Form for: no PhilHealth number on file, or hired in the payout month.',
    columns: [
      { key: 'employeeCode', label: 'Employee No.' }, { key: 'name', label: 'Employee Name' }, { key: 'birthDate', label: 'Date of Birth' },
      { key: 'pin', label: 'PhilHealth PIN' }, { key: 'dateHired', label: 'Date Hired' }, { key: 'tin', label: 'TIN' }, { key: 'reason', label: 'Why listed' },
    ],
    build: (result, context = {}) => computed(result).map(line => ({ line, employee: employeeOf(context, line) }))
      .filter(({ employee }) => employee.payroll?.withPhilhealth !== 'No' && (!employee.government?.philhealth || String(employee.dateHired || '').slice(0, 7) === monthOf(context)))
      .map(({ line, employee }) => ({
        key: line.employeeId, employeeCode: line.employeeCode, name: line.name, birthDate: employee.dateOfBirth || '',
        pin: employee.government?.philhealth || 'For registration', dateHired: employee.dateHired || '', tin: employee.government?.tin || '',
        reason: employee.government?.philhealth ? 'Hired this month' : 'No PhilHealth number on file',
      })),
  },
  {
    key: 'phic-er2', label: 'PhilHealth ER-2 (Report of Employee-Members)', group: 'Statutory', perEmployee: true,
    description: 'New employees reported to PhilHealth: those hired in the payout month, with position, salary and date of employment.',
    columns: [
      { key: 'pin', label: 'PhilHealth PIN' }, { key: 'name', label: 'Employee Name' }, { key: 'position', label: 'Position' },
      { key: 'salaryValue', label: 'Monthly Salary', money: true, keep: true }, { key: 'dateHired', label: 'Date of Employment' },
    ],
    build: (result, context = {}) => computed(result).map(line => ({ line, employee: employeeOf(context, line) }))
      .filter(({ employee }) => employee.payroll?.withPhilhealth !== 'No' && String(employee.dateHired || '').slice(0, 7) === monthOf(context))
      .map(({ line, employee }) => ({
        key: line.employeeId, pin: employee.government?.philhealth || 'For registration', name: line.name, position: employee.position || '',
        salaryValue: Number(employee.payroll?.monthlyRate || employee.monthlyBasic) || 0, dateHired: employee.dateHired || '',
      })),
  },
]);

export function payrollReport(key) {
  return payrollReportCatalog.find(entry => entry.key === key) || governmentReportCatalog.find(entry => entry.key === key) || payrollReportCatalog[0];
}

/**
 * Rows from several runs rolled up per key, for reports that answer per
 * employee (or per month, per agency) rather than per run. Money columns and
 * counts add up; a column marked `keep` is carried from the first row, and
 * `finalize` derives what depends on the totals.
 */
export function aggregateReportRows(definition, rows, context = {}) {
  const byKey = new Map();
  rows.forEach(row => {
    const current = byKey.get(row.key);
    if (!current) { byKey.set(row.key, { ...row, runs: 1 }); return; }
    const next = { ...current, runs: current.runs + 1 };
    definition.columns.forEach(column => {
      if (column.keep) return;
      if (column.money || typeof row[column.key] === 'number') next[column.key] = round2((Number(current[column.key]) || 0) + (Number(row[column.key]) || 0));
    });
    Object.keys(row).filter(field => field.endsWith('Value') && !definition.columns.some(column => column.key === field))
      .forEach(field => { next[field] = current[field]; });
    byKey.set(row.key, next);
  });
  return [...byKey.values()].map(row => (definition.finalize ? definition.finalize(row, context) : row));
}

/** The grand-total row a schedule closes with; money columns sum, text stays blank. */
export function reportTotals(definition, rows) {
  if (!rows.length) return null;
  const totals = { key: 'total', name: 'GRAND TOTAL' };
  definition.columns.forEach(column => {
    if (column.key === 'name') return;
    if (column.money || rows.every(row => typeof row[column.key] === 'number')) {
      totals[column.key] = round2(rows.reduce((sum, row) => sum + (Number(row[column.key]) || 0), 0));
    } else totals[column.key] = '';
  });
  return totals;
}

export { bankFileFor, journalFor, runPayroll, ytdContributionOf };

/* ------------------------------------------------- leave conversion window */

/**
 * The window in which leave credits are converted on a transaction.
 *
 * A start and end date typed on the transaction win. When both are blank the
 * window comes from the leave conversion setup (Benefits & Leave Configuration):
 * the cash-convertible, Active policies for the selected leave types, from the
 * earliest effective-from to the latest effective-to (open-ended when a policy
 * has no end). One date without the other is a mistake, not a fallback.
 */
export function leaveConversionWindow(conversion = {}, leaveSetup = []) {
  const start = conversion.startDate || '';
  const end = conversion.endDate || '';
  if (start || end) {
    if (!start || !end) return { source: 'Transaction', start, end, problem: 'Give both a start date and an end date, or leave both blank to use the leave conversion setup.' };
    if (end < start) return { source: 'Transaction', start, end, problem: 'The conversion end date cannot fall before its start date.' };
    return { source: 'Transaction', start, end, problem: '' };
  }
  const selected = conversion.leaveTypes || [];
  const policies = (leaveSetup || []).filter(row => (row.status || 'Active') === 'Active'
    && row.cashConvertible === 'Yes'
    && (!selected.length || selected.includes(row.type) || selected.includes(row.name)));
  if (!policies.length) return { source: 'Leave Configuration', start: '', end: '', problem: 'No cash-convertible leave policy is set up for the selected leave types, so there is no window to fall back on. Enter a start and end date.' };
  const starts = policies.map(row => row.effectiveDate).filter(Boolean).sort();
  const ends = policies.map(row => row.effectiveTo).filter(Boolean).sort();
  const open = policies.some(row => !row.effectiveTo);
  return { source: 'Leave Configuration', start: starts[0] || '', end: open ? '' : (ends[ends.length - 1] || ''), problem: '' };
}

/* ------------------------------------------------- several transactions at once */

const WINDOW_FIELDS = ['calendarCode', 'month', 'year', 'frequency', 'paymentMode', 'periodStart', 'periodEnd', 'timekeepingStart', 'timekeepingEnd', 'payoutDate', 'lockDate', 'remarks'];

/** The fields a payout calendar fills on a transaction (the same ones for the first and every extra). */
export function calendarFields(calendar, fallback = {}) {
  return {
    calendarCode: calendar.calendarCode,
    year: Number(calendar.year) || fallback.year,
    month: calendar.month || fallback.month,
    frequency: calendar.frequency || fallback.frequency,
    periodStart: calendar.periodStart || '',
    periodEnd: calendar.periodEnd || '',
    timekeepingStart: calendar.cutoffStart || '',
    timekeepingEnd: calendar.cutoffEnd || '',
    payoutDate: calendar.payoutDate || '',
    lockDate: calendar.lockDate || defaultLockDate(calendar.payoutDate || ''),
  };
}

/**
 * Tick or untick a calendar in a Multiple batch. The first transaction and the
 * extra ones are one list of calendars: ticking adds a transaction filled from the
 * calendar, unticking removes it (the first is replaced by the next one down).
 */
export function toggleBatchCalendar(draft, calendar, checked, key) {
  const extras = draft.additional || [];
  if (checked) {
    if (!draft.calendarCode) return { ...draft, ...calendarFields(calendar, draft) };
    if (draft.calendarCode === calendar.calendarCode || extras.some(row => row.calendarCode === calendar.calendarCode)) return draft;
    return { ...draft, additional: [...extras, { ...newBatchRow(draft, key), ...calendarFields(calendar, draft) }] };
  }
  if (draft.calendarCode === calendar.calendarCode) {
    const [next, ...rest] = extras;
    if (!next) return { ...draft, calendarCode: '', periodStart: '', periodEnd: '', timekeepingStart: '', timekeepingEnd: '', payoutDate: '', lockDate: '' };
    const { key: dropped, ...promoted } = next;
    return { ...draft, ...promoted, additional: rest };
  }
  return { ...draft, additional: extras.filter(row => row.calendarCode !== calendar.calendarCode) };
}

/** A blank extra transaction for a Multiple batch, starting from the first one's settings. */
export function newBatchRow(draft, key = `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`) {
  return { key, calendarCode: '', paymentMode: draft.paymentMode, month: draft.month, year: draft.year, frequency: draft.frequency, periodStart: '', periodEnd: '', timekeepingStart: '', timekeepingEnd: '', payoutDate: '', lockDate: '', remarks: '' };
}

const overlapping = (left, right) => Boolean(left.periodStart && left.periodEnd && right.periodStart && right.periodEnd
  && left.periodStart <= right.periodEnd && right.periodStart <= left.periodEnd);

/**
 * Everything wrong with creating these transactions together, in the words the
 * wizard shows. `draft` is the first transaction; `draft.additional` the rest.
 * One employee is never paid twice for a period: two transactions of the same
 * payment mode may not cover overlapping periods, whether both are in this batch
 * or one is already filed (Cancelled ones free their period).
 */
export function batchProblems(draft) {
  const all = [draft, ...(draft.transactionMode === 'Multiple' ? (draft.additional || []) : [])];
  const problems = [];
  all.slice(1).forEach((row, index) => {
    const name = `Transaction ${index + 2}`;
    if (!row.paymentMode) problems.push(`${name}: choose a payment mode.`);
    if (!row.periodStart || !row.periodEnd) problems.push(`${name}: the payroll period start and end are required.`);
    else if (row.periodEnd < row.periodStart) problems.push(`${name}: the payroll period end cannot fall before its start.`);
    if (!row.timekeepingStart || !row.timekeepingEnd) problems.push(`${name}: a timekeeping cut-off is required.`);
    if (!row.payoutDate) problems.push(`${name}: a payout date is required.`);
    if (row.lockDate && row.payoutDate && row.lockDate < row.payoutDate) problems.push(`${name}: the lock date cannot fall before its payout date.`);
  });
  return problems;
}

/**
 * Where this draft could pay an employee twice: another transaction of the same payment
 * mode and type with an overlapping period, in this batch or already filed (Cancelled ones
 * free their period). A warning, never a block — clients do file extra and backdated
 * transactions for a period — and the warning stays on the transaction it was filed with.
 */
export function overlapWarnings(draft, runs = []) {
  const all = [draft, ...(draft.transactionMode === 'Multiple' ? (draft.additional || []) : [])];
  const warnings = [];
  all.forEach((row, index) => {
    all.slice(index + 1).forEach((other, offset) => {
      if (row.paymentMode === other.paymentMode && overlapping(row, other)) {
        warnings.push(`Transaction ${index + 1} and Transaction ${index + offset + 2} are both ${row.paymentMode} and cover overlapping periods — an employee could be paid twice.`);
      }
    });
    runs.filter(existing => existing.status !== 'Cancelled' && existing.paymentMode === row.paymentMode && existing.payrollType === draft.payrollType && overlapping(row, existing))
      .forEach(existing => warnings.push(`${all.length > 1 ? `Transaction ${index + 1}` : 'This transaction'} overlaps ${existing.transactionNumber}, which already covers ${row.paymentMode} employees for that period.`));
  });
  return warnings;
}

/** The transactions a draft stands for: itself, plus one per extra row, sharing a batch id. */
export function batchDrafts(draft, batchId = `batch-${Date.now()}`) {
  const { additional = [], ...first } = draft;
  if (first.transactionMode !== 'Multiple' || !additional.length) return [{ ...first, additional: undefined }];
  const size = additional.length + 1;
  return [
    { ...first, batchId, batchSize: size },
    ...additional.map(row => ({
      ...first,
      ...Object.fromEntries(WINDOW_FIELDS.map(field => [field, row[field]])),
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      batchId, batchSize: size,
    })),
  ].map(item => ({ ...item, additional: undefined }));
}

/** Transaction numbers for a batch, counting the ones earlier in the batch as already taken. */
export function numberBatch(drafts, runs = []) {
  const taken = [...runs];
  return drafts.map(item => {
    const number = nextTransactionNumber(taken, item.year, MONTHS.indexOf(item.month) + 1 || 1);
    taken.push({ transactionNumber: number });
    return number;
  });
}

/* --------------------------------------------- year-to-date from posted payrolls */

const dayBefore = iso => { const date = new Date(`${iso}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); };
const dayAfter = iso => { const date = new Date(`${iso}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); };

/**
 * The payout-date window whose posted payrolls count towards year to date.
 * Dates typed on the transaction win. Blank means: from 1 January of the payout
 * year — or the day after the employee record's own balance runs through, when
 * that falls in the same year — to the day before this payout.
 */
export function ytdWindow(ytd = {}, run = {}) {
  const start = ytd.startDate || '';
  const end = ytd.endDate || '';
  if (start || end) {
    if (!start || !end) return { source: 'Transaction', start, end, problem: 'Give both a start date and an end date, or leave both blank to use the default window.' };
    if (end < start) return { source: 'Transaction', start, end, problem: 'The year-to-date end date cannot fall before its start date.' };
    return { source: 'Transaction', start, end, problem: '' };
  }
  const payout = String(run.payoutDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payout)) return { source: 'Default', start: '', end: '', problem: '' };
  const year = payout.slice(0, 4);
  return {
    source: 'Default',
    start: YTD_AS_OF.slice(0, 4) === year ? dayAfter(YTD_AS_OF) : `${year}-01-01`,
    end: dayBefore(payout),
    problem: '',
  };
}

/** Earlier regular transactions of the same payment mode that are not posted yet. */
export function earlierUnposted(run, runs = []) {
  if (!run || run.payrollType !== 'Regular' || !run.paymentMode) return [];
  return runs
    .filter(row => row.id !== run.id && row.payrollType === 'Regular' && row.paymentMode === run.paymentMode && row.status !== 'Cancelled' && !POSTED_STATUSES.includes(row.status))
    .filter(row => row.periodEnd && run.periodStart && row.periodEnd < run.periodStart)
    .sort((left, right) => String(left.periodEnd).localeCompare(String(right.periodEnd)));
}

/** What each employee's posted payrolls collected inside the window, keyed by employee id. */
export function postedYtdFor(runs = [], run = {}) {
  const window = ytdWindow(run.config?.ytd, run);
  const totals = new Map();
  runs
    .filter(row => row.id !== run.id && POSTED_STATUSES.includes(row.status) && row.result && row.payoutDate)
    .filter(row => (!window.start || row.payoutDate >= window.start) && (!window.end || row.payoutDate <= window.end))
    .filter(row => !run.payoutDate || row.payoutDate < run.payoutDate)
    .forEach(row => row.result.lines.filter(line => line.status === 'Computed').forEach(line => {
      const add = ytdContributionOf(line);
      const current = totals.get(line.employeeId) || {};
      Object.entries(add).forEach(([key, value]) => { current[key] = round2((current[key] || 0) + (Number(value) || 0)); });
      totals.set(line.employeeId, current);
    }));
  return totals;
}

/** The roster with each employee's year to date topped up by posted payrolls in the window. */
export function withPostedYtd(employees = [], runs = [], run = {}) {
  const posted = postedYtdFor(runs, run);
  if (!posted.size) return employees;
  const keys = ['taxableEarnings', 'basicEarnings', 'nonTaxableEarnings', 'bonusPaid', 'taxWithheld', 'sss', 'philhealth', 'hdmf'];
  return employees.map(employee => {
    const add = posted.get(employee.employeeId);
    if (!add) return employee;
    const ytd = { ...(employee.ytd || {}) };
    keys.forEach(key => { ytd[key] = round2((Number(ytd[key]) || 0) + (add[key] || 0)); });
    return { ...employee, ytd, ytdPosted: add };
  });
}

/* ------------------------------------------ leave conversion out of the HRM balance */

/**
 * The HRM leave balances once a posted run's conversions are taken out of them.
 *
 * Days HRM already holds as converted are left alone — HRM is where they were converted. What
 * payroll adds is the rest: every remaining credit converted on a final pay, and an uploaded
 * conversion for an employee whose HRM row has none yet. An upload never overrides days HRM
 * already converted, and no more than the available balance leaves it.
 */
export function leaveBalancesAfterConversion(balances = [], run = {}) {
  const next = balances.map(row => ({ ...row }));
  const deducted = [];
  ((run.result && run.result.lines) || []).filter(line => line.status === 'Computed').forEach(line => (line.leaveConversions || []).forEach(item => {
    if (item.source === 'HRM leave balance') return;
    const row = next.find(entry => entry.employeeId === line.employeeId && entry.leaveType === item.leaveType);
    if (!row) return;
    if (item.source === 'Uploaded' && Number(row.converted) > 0) return;
    const days = Math.min(Number(item.days) || 0, Math.max(0, Number(row.available) || 0));
    if (!(days > 0)) return;
    row.converted = round2((Number(row.converted) || 0) + days);
    row.available = round2((Number(row.available) || 0) - days);
    row.conversionDate = run.payoutDate || row.conversionDate || '';
    deducted.push({ employeeId: line.employeeId, leaveType: item.leaveType, days });
  }));
  return { balances: next, deducted };
}

/* ------------------------------------------- contributions already taken this month */

/**
 * What each employee's earlier payrolls in the same month and payment mode collected, keyed by
 * employee id: the run's own earlier periods, whether posted or still open, never a cancelled one.
 * The maximum-first schedule takes the month's figure less this.
 */
export function statutoryCollectedFor(runs = [], run = {}) {
  const month = String(run.periodEnd || '').slice(0, 7);
  const totals = {};
  runs
    .filter(row => row.id !== run.id && row.status !== 'Cancelled' && row.paymentMode === run.paymentMode && row.result)
    .filter(row => month && String(row.periodEnd || '').slice(0, 7) === month && (!run.periodStart || String(row.periodEnd) < String(run.periodStart)))
    .forEach(row => row.result.lines.filter(line => line.status === 'Computed').forEach(line => {
      const current = totals[line.employeeId] || {};
      Object.entries(line.statutory || {}).forEach(([key, value]) => { if (typeof value === 'number') current[key] = round2((current[key] || 0) + value); });
      totals[line.employeeId] = current;
    }));
  return totals;
}
