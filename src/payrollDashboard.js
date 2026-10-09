/**
 * The Payroll dashboard (HTP324), Tasks for the Day (HTP321), Payroll
 * Issues/Notes (HTP325) and the payroll calculator (HTP316).
 *
 * Everything here is derived on read from the payroll runs and the company
 * calendar; only the issues and notes are stored, because they are the one
 * thing people write rather than compute.
 */

import { graduatedTax, rateContribution, sssContribution } from './statutorySchedules.js';

const round2 = value => Math.round((Number(value) || 0) * 100) / 100;
const DAY = 86400000;
const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / DAY);
const isoToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

const OPEN_STATUSES = ['Open', 'Draft', 'For Review', 'For Approval', 'Approved'];

/** The headline figures: what is in flight, what is waiting, what was paid this month. */
export function dashboardKpis(runs = [], today = isoToday()) {
  const month = today.slice(0, 7);
  const posted = runs.filter(run => ['Posted', 'Locked'].includes(run.status) && run.result);
  const inFlight = runs.filter(run => OPEN_STATUSES.includes(run.status));
  const blocking = inFlight.reduce((total, run) => total + (run.result?.exceptions || []).filter(item => item.severity === 'Error').length, 0);
  const postedThisMonth = posted.filter(run => String(run.payoutDate).startsWith(month));
  const lastPosted = [...posted].sort((left, right) => String(right.payoutDate).localeCompare(String(left.payoutDate)))[0];
  return {
    inFlight: inFlight.length,
    awaitingDecision: runs.filter(run => ['For Review', 'For Approval'].includes(run.status)).length,
    blocking,
    postedThisMonth: postedThisMonth.length,
    netPayThisMonth: round2(postedThisMonth.reduce((total, run) => total + (run.result?.totals.netPay || 0), 0)),
    headcountThisMonth: postedThisMonth.reduce((total, run) => Math.max(total, run.result?.totals.headcount || 0), 0),
    lastPosted: lastPosted ? { transactionNumber: lastPosted.transactionNumber, payoutDate: lastPosted.payoutDate, netPay: round2(lastPosted.result.totals.netPay) } : null,
  };
}

const RUN_NEXT_STEP = {
  Open: 'Compute and post as draft',
  Draft: 'Submit for review',
  'For Review': 'Review and submit for approval',
  'For Approval': 'Approve the payroll',
  Approved: 'Generate the bank file and post',
};

/**
 * What needs doing today, most urgent first: every payroll transaction's
 * next step, blocking errors, backdating waiting for P&A, runs due to lock,
 * and calendar deadlines in the next week (or missed in the last month).
 */
export function payrollTasks({ runs = [], calendars = [], today = isoToday(), isPaAdmin = false } = {}) {
  const tasks = [];
  runs.forEach(run => {
    const errors = (run.result?.exceptions || []).filter(item => item.severity === 'Error').length;
    if (run.status === 'Open' && run.backdated?.approval?.status === 'Pending') {
      tasks.push({ key: `${run.id}-backdate`, kind: 'Approval', priority: 1, due: run.payoutDate, transactionNumber: run.transactionNumber, runId: run.id,
        text: isPaAdmin ? `Approve or reject the backdating of ${run.transactionNumber}` : `${run.transactionNumber} is waiting for P&A to approve its backdating` });
    }
    if (OPEN_STATUSES.includes(run.status) && errors) {
      tasks.push({ key: `${run.id}-errors`, kind: 'Exception', priority: 1, due: run.payoutDate, transactionNumber: run.transactionNumber, runId: run.id,
        text: `Resolve ${errors} blocking payroll ${errors === 1 ? 'error' : 'errors'} on ${run.transactionNumber}` });
    }
    if (RUN_NEXT_STEP[run.status]) {
      tasks.push({ key: `${run.id}-next`, kind: 'Payroll', priority: ['For Approval', 'Approved'].includes(run.status) ? 2 : 3, due: run.payoutDate, transactionNumber: run.transactionNumber, runId: run.id,
        text: `${RUN_NEXT_STEP[run.status]} — ${run.transactionNumber} (${run.status})` });
    }
    if (run.status === 'Posted' && run.lockDate && daysBetween(today, run.lockDate) <= 3) {
      tasks.push({ key: `${run.id}-lock`, kind: 'Payroll', priority: 3, due: run.lockDate, transactionNumber: run.transactionNumber, runId: run.id,
        text: `Lock ${run.transactionNumber} (lock date ${run.lockDate})` });
    }
  });
  calendars.filter(row => row.status === 'Active').forEach(row => {
    const date = row.calendarType === 'Payout' ? row.processDate || row.payoutDate : row.calendarType === 'Billing Cutoff' ? row.releaseDate : row.processDate;
    if (!date || row.calendarType === 'Holiday') return;
    const inDays = daysBetween(today, date);
    if (inDays > 7 || inDays < -30) return;
    if (row.calendarType === 'Payout' && runs.some(run => run.calendarCode === row.calendarCode && run.status !== 'Cancelled')) return;
    const overdue = inDays < 0;
    const text = row.calendarType === 'Payout' ? `Process the ${row.month || ''} ${row.frequency || ''} payroll (${row.calendarCode}), paying out ${row.payoutDate}`
      : row.calendarType === 'Billing Cutoff' ? `Release billing for ${row.calendarCode}`
        : `File the statutory return for ${row.calendarCode}`;
    tasks.push({ key: `cal-${row.id || row.calendarCode}`, kind: row.calendarType === 'Payout' ? 'Calendar' : row.calendarType, priority: overdue ? 1 : 2, due: date, overdue, text: `${text.replace(/\s+/g, ' ')}${overdue ? ` — ${-inDays} ${-inDays === 1 ? 'day' : 'days'} overdue` : inDays === 0 ? ' — due today' : ` — due in ${inDays} ${inDays === 1 ? 'day' : 'days'}`}` });
  });
  return tasks.sort((left, right) => left.priority - right.priority || String(left.due || '').localeCompare(String(right.due || '')));
}

/* --------------------------------------------------------- issues and notes */

const notesKey = companyId => `atlas-payroll-notes-v1:${companyId || 'default'}`;

export function readPayrollNotes(companyId, storage = globalThis.localStorage) {
  try { const saved = JSON.parse(storage?.getItem(notesKey(companyId)) || '[]'); return Array.isArray(saved) ? saved : []; } catch { return []; }
}

export function writePayrollNotes(companyId, notes, storage = globalThis.localStorage) {
  try { storage?.setItem(notesKey(companyId), JSON.stringify(notes)); } catch { /* quota */ }
  return notes;
}

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 16);

/** Adds an issue or a note; an issue stays Open until somebody resolves it. */
export function addPayrollNote(notes, { kind = 'Note', text, transactionNumber = '', actor }) {
  const clean = String(text || '').trim();
  if (!clean) return { notes, error: 'Write the issue or note first.' };
  const note = { id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind, text: clean, transactionNumber, status: kind === 'Issue' ? 'Open' : 'Noted', createdBy: actor, createdAt: stamp(), resolvedBy: '', resolvedAt: '', resolution: '' };
  return { notes: [note, ...notes], note };
}

export function resolvePayrollNote(notes, id, { actor, resolution = '' }) {
  return notes.map(note => (note.id === id ? { ...note, status: 'Resolved', resolvedBy: actor, resolvedAt: stamp(), resolution } : note));
}

export function reopenPayrollNote(notes, id) {
  return notes.map(note => (note.id === id ? { ...note, status: 'Open', resolvedBy: '', resolvedAt: '', resolution: '' } : note));
}

/* --------------------------------------------------------------- calculator */

const PERIODS = { Monthly: 1, 'Semi-monthly': 2, Weekly: 52 / 12 };

/**
 * A quick what-if for one employee and one pay period, against the effective
 * statutory tables. It is an estimate for planning — it is not a payroll
 * transaction and nothing is saved.
 */
export function calculatePay({ monthlyBasic = 0, frequency = 'Semi-monthly', taxableAllowances = 0, nonTaxableAllowances = 0, otherDeductions = 0, minimumWage = false }, statutory = {}) {
  const periods = PERIODS[frequency] || 2;
  const basis = Number(monthlyBasic) || 0;
  const sss = statutory.sss ? sssContribution(statutory.sss, basis) : { employee: 0, employer: 0, ec: 0 };
  const phic = statutory.philhealth ? rateContribution(statutory.philhealth, basis) : { employee: 0, employer: 0 };
  const hdmf = statutory.pagibig ? rateContribution(statutory.pagibig, basis) : { employee: 0, employer: 0 };
  const per = value => round2((Number(value) || 0) / periods);
  const basic = per(basis);
  const taxableAllowance = per(taxableAllowances);
  const nonTaxableAllowance = per(nonTaxableAllowances);
  const statutoryEe = round2(per(sss.employee) + per(phic.employee) + per(hdmf.employee));
  const taxable = round2(Math.max(0, basic + taxableAllowance - statutoryEe));
  const tax = minimumWage ? 0 : (statutory.tax ? graduatedTax(statutory.tax, taxable, frequency).tax : 0);
  const gross = round2(basic + taxableAllowance + nonTaxableAllowance);
  const deductions = round2(Number(otherDeductions) || 0);
  return {
    frequency, basic, taxableAllowance, nonTaxableAllowance, gross,
    sss: per(sss.employee), philhealth: per(phic.employee), pagibig: per(hdmf.employee), statutoryEe,
    taxable, tax: round2(tax), otherDeductions: deductions,
    netPay: round2(gross - statutoryEe - tax - deductions),
    employerCost: round2(gross + per(sss.employer) + per(sss.ec) + per(phic.employer) + per(hdmf.employer)),
  };
}
