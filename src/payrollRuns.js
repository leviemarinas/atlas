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
import { employeeRoster } from './employeeRoster.js';
import { seedComputations } from './computationCatalog.js';
import { effectiveStatutorySet } from './statutoryService.js';
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

  if (capability.edit) actions.push({ key: 'updateEntry', label: 'Update Entry', hint: 'View and edit the transaction per employee' });
  if (capability.recalculate) actions.push({ key: 'recalculate', label: 'Recalculate', hint: 'Recompute against the current masterfile, timekeeping and configuration' });
  if (capability.updateTransaction) actions.push({ key: 'updateTransaction', label: 'Update Transaction', hint: 'Change the run configuration, then recompute' });
  if (run.status === 'Open') actions.push({ key: 'postDraft', label: 'Post as Draft', hint: 'Lock the figures so reports can be generated' });
  if (run.status === 'Draft') actions.push({ key: 'submitReview', label: 'Submit for Review', hint: 'Send to the next level of review' });
  if (run.status === 'For Review') actions.push({ key: 'submitApproval', label: 'Submit for Approval', hint: 'Send to the approver' });
  if (run.status === 'For Approval') actions.push({ key: 'approve', label: 'Approve', hint: 'Approve this payroll' });
  if (['For Review', 'For Approval'].includes(run.status)) actions.push({ key: 'reject', label: 'Reject', hint: 'Return the transaction to Open with remarks', tone: 'danger' });
  if (run.status === 'Approved') actions.push({ key: 'generateBankFile', label: 'Generate Bank File', hint: 'Produce the crediting instructions before posting' });
  if (run.status === 'Approved') actions.push({ key: 'post', label: 'Post', hint: 'Post the payroll and release the payslips' });
  if (run.status === 'Posted') actions.push({ key: 'lock', label: 'Lock', hint: `Lock on ${run.lockDate || 'the configured lock date'}` });
  if (['Draft', 'For Review', 'For Approval', 'Approved', 'Posted'].includes(run.status)) {
    const allowed = run.payrollType === 'Regular' ? isMostRecentRegular() : true;
    actions.push({
      key: 'reopen', label: 'Re-open Transaction',
      hint: allowed ? 'Return the transaction to Open for editing' : 'Only the most recent regular transaction can be re-opened',
      disabled: !allowed || !actor.canReopen,
    });
  }
  if (!['Posted', 'Locked', 'Cancelled'].includes(run.status)) actions.push({ key: 'cancel', label: 'Cancel Transaction', tone: 'danger', hint: 'Cancel this run and release the statutory tables it held' });
  return actions;
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
      statutoryAgencies: { sss: true, philhealth: true, pagibig: true, sssWisp: true },
      statutorySchedule: 'Every payroll (split)',
      zeroBasicPay: special,
      zeroVariableAllowance: special,
      computeBasicPayAdjustment: true,
      computeOvertimeAdjustment: true,
      computeAttendanceAdjustment: { absences: true, late: true, undertime: true },
      leaveConversion: { enabled: false, leaveTypes: [] },
      thirteenthMonth: { enabled: false, basis: 'Pre-defined (Computational Basis)', ntThreshold: 90000, bonusTypes: ['13th Month Pay'], employeeGroups: ['All Employees'] },
      reclassification: { enabled: false, toTaxable: [], toNonTaxable: [] },
      computeFinalPay: false,
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
export function applyAction(run, action, { actor = 'P&A Admin', remarks = '', runs = [], context } = {}) {
  const capability = capabilitiesOf(run);
  const refuse = error => ({ run, error });
  const forwardActions = ['postDraft', 'submitReview', 'submitApproval', 'approve', 'post'];
  if (forwardActions.includes(action)) {
    const blocking = blockingExceptionMessage(run);
    if (blocking) return refuse(blocking);
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
      return {
        run: withAudit({ ...run, status: 'Posted', postedAt: stamp(), postedBy: actor }, { action: 'Posted', actor, detail: `Net pay ₱${run.result.totals.netPay.toLocaleString()} released` }),
        message: `${run.transactionNumber} posted. Payslips are available to employees and the year-to-date balances have moved.`,
      };
    }
    case 'lock':
      if (run.status !== 'Posted') return refuse('Only a posted transaction can be locked.');
      return { run: withAudit({ ...run, status: 'Locked' }, { action: 'Locked', actor, detail: `Lock date ${run.lockDate || today()}` }), message: `${run.transactionNumber} is locked. Its figures are final.` };
    case 'reopen': {
      if (['Locked', 'Cancelled'].includes(run.status)) return refuse(`A ${run.status.toLowerCase()} transaction cannot be re-opened.`);
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
export function libraryForRun(run, current = []) {
  const entries = run?.result?.computationSnapshot?.entries || run?.computationSnapshot?.entries;
  if (!entries?.length || capabilitiesOf(run).recalculate) return current;
  const frozen = entries.map(entry => ({
    ...entry,
    id: entry.code,
    status: 'Active',
    isBuiltIn: entry.owner !== 'Company-defined',
    description: entry.description || `Version ${entry.version} as applied by ${run.transactionNumber}.`,
  }));
  const known = new Set(frozen.map(item => item.code));
  return [...frozen, ...current.filter(item => !known.has(item.code))];
}

export function buildPayrollContext({ companyId, run, hrmData, registers = {}, hierarchy = [], policies = {}, computations, serviceConfig = {}, references = [], staggeredRequests = [], storage } = {}) {
  const data = hrmData || readHrmData(companyId, storage);
  const asOf = run?.payoutDate || today();
  const library = libraryForRun(run, computations || seedComputations());
  return {
    employees: employeeRoster,
    salaryInformation: data.salaryInformation || [],
    timeLogs: data.timeLogs || [],
    loanSchedules: data.loanInquiries || [],
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
    // The Services Information configurations that bind a formula, and the
    // reference sources those bindings resolve rows from. Both travel with the
    // context so the engine stays pure: it applies a binding, it never goes
    // looking for one.
    serviceConfig,
    references,
    bonusCeiling: 90000,
  };
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
      grossPayValue: line.grossPay, statutoryValue: line.statutory.employeeTotal, taxValue: line.withholdingTax,
      deductionsValue: round2(line.totalDeductions - line.statutory.employeeTotal - line.withholdingTax),
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
    ],
    build: result => result.lines.filter(line => line.status === 'Computed').map(line => ({
      key: line.employeeId, employeeCode: line.employeeCode, name: line.name,
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
      { key: 'taxableIncomeValue', label: 'Taxable Income', money: true }, { key: 'taxBasis', label: 'Tax Table' },
      { key: 'taxValue', label: 'Tax Withheld', money: true },
    ],
    build: (result, context = {}) => result.lines.filter(line => line.status === 'Computed').map(line => ({
      key: line.employeeId, employeeCode: line.employeeCode, name: line.name,
      tin: (context.employees || []).find(row => row.employeeId === line.employeeId)?.government?.tin || '',
      grossPayValue: line.grossPay, nonTaxableValue: round2(line.nonTaxableEarnings + line.nonTaxableBonus),
      taxableIncomeValue: line.taxableIncome, taxBasis: line.taxBasis, taxValue: line.withholdingTax,
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

export function payrollReport(key) {
  return payrollReportCatalog.find(entry => entry.key === key) || payrollReportCatalog[0];
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
