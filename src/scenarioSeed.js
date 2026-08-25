/**
 * Prerequisite data for Scenario Studio walkthroughs.
 *
 * A story cannot demonstrate "compare payroll history" against a company that
 * has never run payroll, and nine of the catalog's stories landed on an empty
 * register for exactly that reason. Rather than weaken those stories, each one
 * declares what it needs on screen and the matching provider creates it.
 *
 * Everything is written to the resettable simulator sandbox, never to a real
 * client company: preparing a demonstration must not add invented payroll to
 * a tenant somebody is actually configuring. Providers are idempotent, so a
 * repeated run reuses the records it prepared the first time.
 */
import { readHrmData } from './hrmData.js';
import { readRegisterRows } from './OperationalWorkspaces.jsx';
import { readHierarchy, readPolicies } from './PolicyComputations.jsx';
import { applyAction, buildPayrollContext, newPayrollRun, readPayrollRuns, savePayrollRun } from './payrollRuns.js';
import { operationalStorageKey, writeOperationalRowsForCompany } from './operationalStore.js';
import { SANDBOX_COMPANY_ID } from './endToEndDemo.js';

export const SEED_EMPLOYEE_ID = 'EMP-1001';
/** The register stores the employee as "code - name", and matches on the code. */
export const SEED_EMPLOYEE_CODE = '0011223345';

/** What a screen has to already contain for a story to be demonstrable. */
export const DATA_NEEDS = Object.freeze({
  postedPayroll: {
    id: 'postedPayroll',
    label: 'Two posted payroll periods',
    why: 'Payslips, payroll history and company reports read posted runs only, so an unpaid company shows an empty screen.',
  },
  editablePayroll: {
    id: 'editablePayroll',
    label: 'An open payroll transaction',
    why: 'Editing earnings and deductions needs a transaction that has not been frozen by review yet.',
  },
  payrollForApproval: {
    id: 'payrollForApproval',
    label: 'A payroll awaiting approval',
    why: 'Review and approval steps need a run already submitted through the workflow.',
  },
  deferredDeduction: {
    id: 'deferredDeduction',
    label: 'An employee below the protected minimum',
    why: 'The exception queue and the negative-net story are both empty unless a deduction actually breaches the take-home policy.',
  },
});

/**
 * Only the stories the audit found landing on an empty screen. A story whose
 * screen is already populated by the app's own seed data is deliberately
 * absent — seeding it again would add noise, not clarity.
 */
export const SCENARIO_DATA_NEEDS = Object.freeze({
  'emp-payslip': ['postedPayroll'],
  'emp-payslip-history': ['postedPayroll'],
  'client-payroll-edit': ['editablePayroll'],
  'client-payroll-review': ['deferredDeduction'],
  'client-payroll-approve': ['payrollForApproval'],
  'client-reports': ['postedPayroll'],
  'client-remittance': ['postedPayroll'],
  'pa-multi-company': ['postedPayroll'],
  'pa-payroll-reopen': ['postedPayroll'],
  'pa-negative-net': ['postedPayroll', 'deferredDeduction'],
  'pa-audit': ['postedPayroll'],
});

export function needsFor(scenarioId) {
  return (SCENARIO_DATA_NEEDS[scenarioId] || []).map(key => DATA_NEEDS[key]).filter(Boolean);
}

/* -------------------------------------------------- payroll construction */

const STATUS_ORDER = ['Open', 'Draft', 'For Review', 'For Approval', 'Approved', 'Posted', 'Locked'];
const NEXT_ACTION = { Open: 'postDraft', Draft: 'submitReview', 'For Review': 'submitApproval', 'For Approval': 'approve', Approved: 'post' };

function registersFor(companyId) {
  return Object.fromEntries(['earnings', 'deductions', 'bonuses', 'payCodes'].map(key => [key, readRegisterRows(key, companyId)]));
}

/** Build one calculated run for a named period, without saving it. */
function computeRun({ companyId, storage, id, transactionNumber, year, month, periodStart, periodEnd, timekeepingStart, timekeepingEnd, payoutDate, remarks }) {
  const existing = readPayrollRuns(companyId, storage).filter(item => item.id !== id);
  const base = newPayrollRun({ runs: existing, companyId, year, month });
  const run = {
    ...base,
    id,
    transactionNumber,
    calendarCode: `CAL-${month.slice(0, 3).toUpperCase()}`,
    periodStart,
    periodEnd,
    timekeepingStart,
    timekeepingEnd,
    payoutDate,
    // Far enough out that a prepared run stays reopenable for the walkthrough.
    lockDate: '2099-12-31',
    remarks,
    createdBy: 'Client Admin',
  };
  const context = buildPayrollContext({
    companyId,
    run,
    hrmData: readHrmData(companyId, storage),
    registers: registersFor(companyId),
    hierarchy: readHierarchy(),
    policies: readPolicies(companyId),
    storage,
  });
  const calculate = candidate => {
    const outcome = applyAction(candidate, 'recalculate', { actor: 'Client Admin', runs: existing, context });
    if (outcome.error) throw new Error(outcome.error);
    return outcome.run;
  };

  let computed = calculate(run);

  /*
   * An employee with no effective compensation still accrues statutory
   * deductions, so their line lands negative and blocks the whole run from
   * posting. That is the engine behaving correctly — it is a real payroll
   * error — but it is a gap in the sandbox's own employee data, not something
   * the story is about. A prepared run covers the employees who actually have
   * pay set up, and records why the rest were left out.
   */
  const unpaid = (computed.result?.lines || [])
    .filter(line => line.status === 'Computed' && !(Number(line.grossPay) > 0))
    .map(line => line.employeeId);
  if (unpaid.length) {
    computed = calculate({
      ...run,
      population: { ...run.population, excluded: [...(run.population?.excluded || []), ...unpaid] },
      remarks: `${remarks} · excludes ${unpaid.length} employee${unpaid.length === 1 ? '' : 's'} with no effective compensation`,
    });
  }
  return computed;
}

/** Walk a run up the workflow ladder to the state a story needs it in. */
function advanceTo(run, target, actor = 'Client Admin') {
  let current = run;
  let guard = STATUS_ORDER.length + 1;
  while (STATUS_ORDER.indexOf(current.status) < STATUS_ORDER.indexOf(target) && guard > 0) {
    guard -= 1;
    const action = NEXT_ACTION[current.status];
    if (!action) break;
    const outcome = applyAction(current, action, { actor, remarks: 'Scenario Studio prepared demonstration data', runs: [current] });
    if (outcome.error) throw new Error(outcome.error);
    current = outcome.run;
  }
  return current;
}

const PREPARED_PERIODS = Object.freeze([
  { id: 'run-studio-jul', transactionNumber: 'PR-2026-07-STUDIO', year: 2026, month: 'July', periodStart: '2026-07-16', periodEnd: '2026-07-31', timekeepingStart: '2026-07-01', timekeepingEnd: '2026-07-15', payoutDate: '2026-07-31' },
  { id: 'run-studio-aug', transactionNumber: 'PR-2026-08-STUDIO', year: 2026, month: 'August', periodStart: '2026-08-01', periodEnd: '2026-08-15', timekeepingStart: '2026-07-16', timekeepingEnd: '2026-07-31', payoutDate: '2026-08-15' },
]);

const existingRun = (companyId, storage, id) => readPayrollRuns(companyId, storage).find(item => item.id === id);

/* -------------------------------------------------------------- providers */

const PROVIDERS = {
  /**
   * Two posted periods, not one. "Compare payroll history" needs something to
   * compare against, and a single run makes the comparison step meaningless.
   */
  postedPayroll(companyId, storage) {
    const prepared = [];
    PREPARED_PERIODS.forEach(period => {
      const already = existingRun(companyId, storage, period.id);
      if (already && ['Posted', 'Locked'].includes(already.status)) return;
      const run = advanceTo(computeRun({ ...period, companyId, storage, remarks: `Scenario Studio prepared ${period.month} payroll` }), 'Posted', 'P&A Admin');
      savePayrollRun(companyId, run, storage);
      prepared.push(run.transactionNumber);
    });
    return prepared;
  },

  editablePayroll(companyId, storage) {
    const id = 'run-studio-open';
    const already = existingRun(companyId, storage, id);
    if (already?.status === 'Draft') return [];
    const run = computeRun({
      companyId, storage, id, transactionNumber: 'PR-2026-08-STUDIO-2', year: 2026, month: 'August',
      periodStart: '2026-08-16', periodEnd: '2026-08-31', timekeepingStart: '2026-08-01', timekeepingEnd: '2026-08-15',
      payoutDate: '2026-08-31', remarks: 'Scenario Studio editable payroll',
    });
    // The story's first step opens a *Draft* transaction, so stopping at Open
    // would leave it looking for a row that is not there.
    const draft = advanceTo(run, 'Draft');
    savePayrollRun(companyId, draft, storage);
    return [draft.transactionNumber];
  },

  payrollForApproval(companyId, storage) {
    const id = 'run-studio-review';
    const already = existingRun(companyId, storage, id);
    if (already?.status === 'For Approval') return [];
    const run = advanceTo(computeRun({
      companyId, storage, id, transactionNumber: 'PR-2026-09-STUDIO', year: 2026, month: 'September',
      periodStart: '2026-09-01', periodEnd: '2026-09-15', timekeepingStart: '2026-08-16', timekeepingEnd: '2026-08-31',
      payoutDate: '2026-09-15', remarks: 'Scenario Studio payroll awaiting approval',
    }), 'For Approval');
    savePayrollRun(companyId, run, storage);
    return [run.transactionNumber];
  },

  /**
   * A deduction large enough to breach the protected minimum, and a payroll
   * calculated *after* it exists. Writing the register row alone was not
   * enough: the runs prepared earlier were already computed, so the exception
   * queue stayed empty and the story had nothing to open.
   */
  deferredDeduction(companyId, storage) {
    /*
     * These are the Deduction Management register's own field names, not the
     * form labels. The engine matches a row to an employee with
     * `row.employee.startsWith(employee.code)` and reads `code`, `name`,
     * `amount` and `balance` — a row keyed as `deductionCode` / `employeeId`
     * is stored happily and then silently never collected.
     */
    const row = {
      id: 'ded-studio-protect',
      code: 'DED-STUDIO-PROTECT',
      name: 'Other',
      employee: `${SEED_EMPLOYEE_CODE} - John Collins Doe`,
      amount: 25000,
      frequency: 'Once',
      startDate: '2026-08-01',
      endDate: '2026-10-31',
      balance: 25000,
      remarks: 'Scenario Studio prepared equipment recovery',
      status: 'Active',
    };
    const key = operationalStorageKey('deductions', 3);
    const rows = readRegisterRows('deductions', companyId).filter(item => item.id !== row.id);
    writeOperationalRowsForCompany(key, companyId, [row, ...rows], storage);

    const id = 'run-studio-exception';
    const already = existingRun(companyId, storage, id);
    if (already?.result?.lines?.some(line => Number(line.takeHome?.deferred || 0) > 0)) return [];
    const run = computeRun({
      companyId, storage, id, transactionNumber: 'PR-2026-10-STUDIO', year: 2026, month: 'October',
      periodStart: '2026-10-01', periodEnd: '2026-10-15', timekeepingStart: '2026-09-16', timekeepingEnd: '2026-09-30',
      payoutDate: '2026-10-15', remarks: 'Scenario Studio take-home protection exception',
    });
    const deferred = (run.result?.lines || []).some(line => Number(line.takeHome?.deferred || 0) > 0);
    if (!deferred) throw new Error('The prepared deduction did not breach the protected minimum, so there is no exception to show.');
    savePayrollRun(companyId, run, storage);
    return [row.code, run.transactionNumber];
  },
};

/* ------------------------------------------------------------------ entry */

/**
 * Create whatever the story needs that the company does not already have.
 * Returns what was prepared so the player can say so rather than silently
 * changing the data under the viewer.
 */
export function ensureScenarioData(scenarioId, companyId = SANDBOX_COMPANY_ID, storage = globalThis.localStorage) {
  const needs = SCENARIO_DATA_NEEDS[scenarioId] || [];
  const prepared = [];
  const failed = [];
  needs.forEach(key => {
    const provider = PROVIDERS[key];
    if (!provider) return;
    try {
      const created = provider(companyId, storage);
      if (created.length) prepared.push({ need: DATA_NEEDS[key], created });
    } catch (error) {
      failed.push({ need: DATA_NEEDS[key], message: error.message });
    }
  });
  return { companyId, needs: needsFor(scenarioId), prepared, failed };
}

/** A one-line summary for the run status, or null when nothing was needed. */
export function describePreparation(result) {
  if (!result?.needs?.length) return null;
  if (result.failed.length) return `Could not prepare ${result.failed[0].need.label.toLowerCase()}: ${result.failed[0].message}`;
  if (!result.prepared.length) return `${result.needs.map(need => need.label).join(' and ')} already present in the sandbox.`;
  const created = result.prepared.flatMap(item => item.created);
  return `Prepared ${result.prepared.map(item => item.need.label.toLowerCase()).join(' and ')} (${created.join(', ')}).`;
}
