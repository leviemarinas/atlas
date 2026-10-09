/**
 * Payroll transaction updates (Oct 2026): statutory EE / ER switches, variable
 * allowance adjustment, earning reclassification with a hierarchy and caps, the
 * leave conversion window, the tax forecast and the mm/dd/yyyy display.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultHrmData } from '../src/hrmData.js';
import { employeeRoster, findRosterEmployee } from '../src/employeeRoster.js';
import { effectiveVersionIn, seedStatutoryData } from '../src/statutorySchedules.js';
import { seedComputations } from '../src/computationCatalog.js';
import { computeEmployeeLine } from '../src/payrollEngine.js';
import { leaveConversionWindow, newPayrollRun } from '../src/payrollRuns.js';
import { formatUsDate, parseUsDate, stampUs } from '../src/textFormat.js';

const hrm = defaultHrmData('ABC-PH-001');
const statutoryData = seedStatutoryData();

const transaction = (config = {}, overrides = {}) => ({
  transactionNumber: 'PR-2025-11-001',
  payrollType: 'Regular',
  paymentMode: 'Semi-monthly',
  year: 2025,
  month: 'November',
  frequency: 'Second Half',
  periodStart: '2025-11-16',
  periodEnd: '2025-11-30',
  timekeepingStart: '2025-11-01',
  timekeepingEnd: '2025-11-15',
  payoutDate: '2025-11-30',
  ...overrides,
  config: {
    workDaysPerYear: 261,
    workHoursPerDay: 8,
    computeAllowableDeduction: true,
    statutoryAgencies: { sss: true, philhealth: true, pagibig: true, sssWisp: true },
    statutorySchedule: 'Every payroll (split)',
    computeTax: true,
    computeBasicPayAdjustment: true,
    computeOvertimeAdjustment: true,
    computeAttendanceAdjustment: { absences: true, late: true, undertime: true },
    thirteenthMonth: { enabled: false, basis: 'Pre-defined (Computational Basis)', ntThreshold: 90000, bonusTypes: ['13th Month Pay'] },
    ...config,
  },
  population: { mode: 'Active/Inactive in 201', includeOnHold: false, included: [], excluded: [] },
  overrides: {},
});

const context = (overrides = {}) => ({
  employees: employeeRoster,
  salaryInformation: hrm.salaryInformation,
  timeLogs: hrm.timeLogs,
  loanSchedules: hrm.loanInquiries,
  registers: { earnings: [], deductions: [], bonuses: [], payCodes: [] },
  statutory: Object.fromEntries(Object.keys(statutoryData).map(agency => [agency, effectiveVersionIn(statutoryData, agency, '2025-11-30')])),
  policies: { takeHome: { enabled: false } },
  hierarchy: [],
  computations: seedComputations(),
  bonusCeiling: 90000,
  ...overrides,
});

const lineFor = (employee, tx = transaction(), ctx = context()) => computeEmployeeLine({ employee, transaction: tx, context: ctx });
const sample = () => findRosterEmployee('EMP-1002');

/* ------------------------------------------------- statutory EE and ER */

test('the employee and employer shares of an agency switch off separately', () => {
  const both = lineFor(sample());
  assert.ok(both.statutory.philhealthEmployee > 0 && both.statutory.philhealthEmployer > 0);

  const eeOnly = lineFor(sample(), transaction({ statutoryShares: { philhealth: { employee: true, employer: false } } }));
  assert.equal(eeOnly.statutory.philhealthEmployee, both.statutory.philhealthEmployee);
  assert.equal(eeOnly.statutory.philhealthEmployer, 0);

  const erOnly = lineFor(sample(), transaction({ statutoryShares: { philhealth: { employee: false, employer: true } } }));
  assert.equal(erOnly.statutory.philhealthEmployee, 0);
  assert.equal(erOnly.statutory.philhealthEmployer, both.statutory.philhealthEmployer);
  // Taxable income reads the employee share, so dropping it raises taxable income.
  assert.ok(erOnly.taxableIncome >= both.taxableIncome);
});

test('SSS regular and WISP/MPF shares keep their own EE and ER switches, and the defaults change nothing', () => {
  const baseline = lineFor(sample());
  const explicit = lineFor(sample(), transaction({ statutoryShares: { sss: { employee: true, employer: true }, sssWisp: { employee: true, employer: true } } }));
  assert.equal(explicit.statutory.sssEmployee, baseline.statutory.sssEmployee);
  assert.equal(explicit.statutory.sssEmployer, baseline.statutory.sssEmployer);

  const noMpfEmployee = lineFor(sample(), transaction({ statutoryShares: { sssWisp: { employee: false, employer: true } } }));
  assert.equal(noMpfEmployee.statutory.sssMpfEmployee, 0);
  assert.equal(noMpfEmployee.statutory.sssEmployee, Number((baseline.statutory.sssEmployee - baseline.statutory.sssMpfEmployee).toFixed(2)));
  assert.equal(noMpfEmployee.statutory.sssEmployer, baseline.statutory.sssEmployer);
});

test('a new transaction carries the new switches with the old behaviour on', () => {
  const run = newPayrollRun({ runs: [], companyId: 'ABC-PH-001' });
  assert.equal(run.config.computeVariableAllowanceAdjustment, true);
  for (const agency of ['sss', 'sssWisp', 'philhealth', 'pagibig']) {
    assert.deepEqual(run.config.statutoryShares[agency], { employee: true, employer: true });
  }
  assert.deepEqual(run.config.leaveConversion, { enabled: false, leaveTypes: [], startDate: '', endDate: '' });
});

/* ---------------------------------------------- variable allowance adjustment */

test('variable allowances are pro-rated for a new hire unless the adjustment is switched off', () => {
  const hired = { ...sample(), dateHired: '2025-11-24' };
  const on = lineFor(hired, transaction({ computeVariableAllowanceAdjustment: true }));
  const off = lineFor(hired, transaction({ computeVariableAllowanceAdjustment: false }));
  const variable = line => line.earnings.filter(item => item.source === 'Employee salary record' && item.classification === 'Taxable Allowance');
  if (!variable(off).length) return; // the sample carries no variable allowance in this period
  assert.ok(variable(on)[0].amount < variable(off)[0].amount, 'pro-rated amount is smaller');
  assert.ok(on.steps.some(step => step.code === 'ERN-004' && /payable/.test(step.detail)));
  assert.ok(!off.steps.some(step => step.code === 'ERN-004' && /payable/.test(step.detail)));
});

/* ----------------------------------------------------------- reclassification */

const mealRegister = employee => [{ code: 'ERN-901', name: 'Housing Subsidy', employee: `${employee.code} - ${employee.name}`, amount: 3000, frequency: 'Semi-monthly', status: 'Active', periodStart: '2025-01-01', periodEnd: '' }];
const mealSetup = overrides => ({ code: 'ERN-901', name: 'Housing Subsidy', status: 'Active', eligibleForReclassification: 'Yes', reclassDirection: 'Taxable to non-taxable', reclassPriority: '1', reclassCapBasis: 'No limit', reclassCap: '0', ...overrides });
const reclassCtx = (setups, extra = {}) => context({ registers: { earnings: mealRegister(sample()), deductions: [], bonuses: [], payCodes: [] }, serviceConfig: { earnings: setups }, ...extra });
const reclassOn = (pool = '') => transaction({ reclassification: { enabled: true, poolLimit: pool } });
const moved = line => line.earnings.find(item => item.code === 'ERN-901-R');

test('an eligible earning is reclassified up to its own cap and the hierarchy decides who draws first', () => {
  const baseline = lineFor(sample(), transaction(), reclassCtx([]));
  assert.ok(baseline.earnings.find(item => item.code === 'ERN-901'), 'the meal allowance is paid');

  const capped = lineFor(sample(), reclassOn(), reclassCtx([mealSetup({ reclassCapBasis: 'Amount per payroll', reclassCap: '500' })]));
  assert.equal(moved(capped).amount, 500);
  assert.equal(moved(capped).classification, 'Non-taxable');
  assert.equal(capped.earnings.find(item => item.code === 'ERN-901').amount, 2500);
  assert.equal(Number((capped.nonTaxableEarnings - baseline.nonTaxableEarnings).toFixed(2)), 500);
  assert.equal(Number((baseline.taxableEarnings - capped.taxableEarnings).toFixed(2)), 500);
  assert.ok(capped.steps.some(step => step.code === 'RCL-001' && /Taxable to non-taxable/.test(step.detail)));

  const percent = lineFor(sample(), reclassOn(), reclassCtx([mealSetup({ reclassCapBasis: 'Percent of the earning', reclassCap: '10' })]));
  assert.equal(moved(percent).amount, 300);
});

test('the run pool is drawn down in hierarchy order', () => {
  const second = { code: 'ERN-902', name: 'Fuel Subsidy', status: 'Active', eligibleForReclassification: 'Yes', reclassDirection: 'Taxable to non-taxable', reclassPriority: '2', reclassCapBasis: 'No limit', reclassCap: '0' };
  const register = [...mealRegister(sample()), { ...mealRegister(sample())[0], code: 'ERN-902', name: 'Fuel Subsidy', amount: 2000 }];
  const ctx = pool => context({ registers: { earnings: register, deductions: [], bonuses: [], payCodes: [] }, serviceConfig: { earnings: pool } });

  const firstWins = lineFor(sample(), reclassOn('3500'), ctx([mealSetup({ reclassPriority: '1' }), second]));
  assert.equal(firstWins.earnings.find(item => item.code === 'ERN-901-R').amount, 3000, 'rank 1 takes all it can');
  assert.equal(firstWins.earnings.find(item => item.code === 'ERN-902-R').amount, 500, 'rank 2 gets what the pool has left');

  const swapped = lineFor(sample(), reclassOn('3500'), ctx([mealSetup({ reclassPriority: '2' }), { ...second, reclassPriority: '1' }]));
  assert.equal(swapped.earnings.find(item => item.code === 'ERN-902-R').amount, 2000);
  assert.equal(swapped.earnings.find(item => item.code === 'ERN-901-R').amount, 1500);
});

test('nothing is reclassified when the run switch is off, the earning is not eligible, or the direction does not fit', () => {
  const setup = mealSetup({ reclassCapBasis: 'Amount per payroll', reclassCap: '500' });
  assert.equal(moved(lineFor(sample(), transaction({ reclassification: { enabled: false, poolLimit: '' } }), reclassCtx([setup]))), undefined);
  assert.equal(moved(lineFor(sample(), reclassOn(), reclassCtx([{ ...setup, eligibleForReclassification: 'No' }]))), undefined);
  assert.equal(moved(lineFor(sample(), reclassOn(), reclassCtx([{ ...setup, reclassDirection: 'Non-taxable to taxable' }]))), undefined, 'a taxable earning cannot be moved to taxable');
});

/* ------------------------------------------------------ leave conversion window */

test('typed conversion dates win; blank dates fall back to the leave conversion setup', () => {
  const setup = [
    { type: 'Vacation Leave', name: 'Vacation Leave', status: 'Active', cashConvertible: 'Yes', effectiveDate: '2026-01-01', effectiveTo: '2026-12-31' },
    { type: 'Sick Leave', name: 'Sick Leave', status: 'Active', cashConvertible: 'Yes', effectiveDate: '2026-02-01', effectiveTo: '2027-01-31' },
    { type: 'Emergency Leave', name: 'Emergency Leave', status: 'Active', cashConvertible: 'No', effectiveDate: '2026-01-01', effectiveTo: '' },
  ];
  const typed = leaveConversionWindow({ enabled: true, leaveTypes: ['Vacation Leave'], startDate: '2026-03-01', endDate: '2026-03-31' }, setup);
  assert.deepEqual([typed.source, typed.start, typed.end, typed.problem], ['Transaction', '2026-03-01', '2026-03-31', '']);

  const fallback = leaveConversionWindow({ enabled: true, leaveTypes: ['Vacation Leave', 'Sick Leave'], startDate: '', endDate: '' }, setup);
  assert.deepEqual([fallback.source, fallback.start, fallback.end, fallback.problem], ['Leave Configuration', '2026-01-01', '2027-01-31', '']);

  const open = leaveConversionWindow({ enabled: true, leaveTypes: ['Vacation Leave'] }, [{ ...setup[0], effectiveTo: '' }]);
  assert.equal(open.end, '', 'a policy with no end date leaves the window open-ended');
});

test('one conversion date alone, a reversed window, or no setup to fall back on is refused', () => {
  assert.match(leaveConversionWindow({ startDate: '2026-03-01', endDate: '' }, []).problem, /both/);
  assert.match(leaveConversionWindow({ startDate: '', endDate: '2026-03-01' }, []).problem, /both/);
  assert.match(leaveConversionWindow({ startDate: '2026-04-01', endDate: '2026-03-01' }, []).problem, /before/);
  assert.match(leaveConversionWindow({ leaveTypes: ['Vacation Leave'] }, []).problem, /No cash-convertible/);
});

/* ------------------------------------------------------------------ date format */

test('dates print and parse as mm/dd/yyyy whatever form the store holds them in', () => {
  assert.equal(formatUsDate('2026-10-07'), '10/07/2026');
  assert.equal(formatUsDate('10/7/2026'), '10/07/2026');
  assert.equal(formatUsDate(''), '');
  assert.equal(formatUsDate(undefined), '');
  assert.equal(parseUsDate('10/07/2026'), '2026-10-07');
  assert.equal(parseUsDate('2/29/2024'), '2024-02-29');
  assert.equal(parseUsDate('2/29/2026'), '', 'not a real date');
  assert.equal(parseUsDate('13/01/2026'), '');
  assert.equal(parseUsDate('2026-10-07'), '');
  assert.equal(stampUs('2026-09-28 06:14:02'), '09/28/2026 06:14:02');
  assert.equal(stampUs('2026-09-28T06:14:02.123Z'), '09/28/2026 06:14:02');
});

/* ------------------------------------- per-run reclassification order and limits */

test('a run can reorder the hierarchy and lower a limit without touching the setup, and never raise one', () => {
  const second = { code: 'ERN-902', name: 'Fuel Subsidy', status: 'Active', eligibleForReclassification: 'Yes', reclassDirection: 'Taxable to non-taxable', reclassPriority: '2', reclassCapBasis: 'No limit', reclassCap: '0' };
  const first = mealSetup({ reclassPriority: '1', reclassCapBasis: 'Amount per payroll', reclassCap: '1000' });
  const register = [...mealRegister(sample()), { ...mealRegister(sample())[0], code: 'ERN-902', name: 'Fuel Subsidy', amount: 2000 }];
  const setups = [first, second];
  const ctx = context({ registers: { earnings: register, deductions: [], bonuses: [], payCodes: [] }, serviceConfig: { earnings: setups } });
  const run = reclassification => lineFor(sample(), transaction({ reclassification: { enabled: true, poolLimit: '2500', ...reclassification } }), ctx);
  const amountOf = (line, code) => line.earnings.find(item => item.code === code)?.amount;

  const asConfigured = run({});
  assert.equal(amountOf(asConfigured, 'ERN-901-R'), 1000);
  assert.equal(amountOf(asConfigured, 'ERN-902-R'), 1500);

  const reordered = run({ runOrder: ['ERN-902', 'ERN-901'] });
  assert.equal(amountOf(reordered, 'ERN-902-R'), 2000, 'the run puts Fuel first');
  assert.equal(amountOf(reordered, 'ERN-901-R'), 500, 'Housing gets what the pool has left');

  const lowered = run({ runLimits: { 'ERN-901': 400 } });
  assert.equal(amountOf(lowered, 'ERN-901-R'), 400);

  const raised = run({ runLimits: { 'ERN-901': 5000 } });
  assert.equal(amountOf(raised, 'ERN-901-R'), 1000, 'a run limit cannot exceed the configured one');

  assert.deepEqual(setups[0], first, 'the setup is untouched');
});

/* ------------------------------------------- rate divisors: pay record and shift */

test('hours per day come from the assigned shift in the period, then the pay record', () => {
  const employee = sample();
  const standard = lineFor(employee);
  assert.equal(standard.rates.hourlyRate, Number((standard.rates.dailyRate / 8).toFixed(2)));

  const shifts = [
    { employeeId: employee.employeeId, startDate: '2025-06-01', endDate: '2025-12-31', workHours: 10, name: 'Compressed' },
    { employeeId: employee.employeeId, startDate: '2026-04-01', endDate: '', workHours: 4, name: 'Later half day' },
    { employeeId: 'someone-else', startDate: '2025-01-01', endDate: '', workHours: 6, name: 'Other' },
  ];
  const onShift = lineFor(employee, transaction(), context({ shiftAssignments: shifts }));
  assert.equal(onShift.rates.hourlyRate, Number((onShift.rates.dailyRate / 10).toFixed(2)), 'the shift that covers the period decides');
  assert.ok(onShift.steps.some(step => step.code === 'BAS-002' && /Compressed/.test(step.detail)));

  const noShift = lineFor(employee, transaction(), context({ shiftAssignments: [shifts[2]] }));
  assert.equal(noShift.rates.hourlyRate, standard.rates.hourlyRate, 'with no shift the pay record applies');
});

test('a new run is created without typed work days or hours, and the engine still prices rates', () => {
  const run = newPayrollRun({ runs: [], companyId: 'ABC-PH-001' });
  assert.equal(run.config.workDaysPerYear, 261);
  assert.equal(run.config.workHoursPerDay, 8);
});

/* ---------------------------------------------------------- leave conversion pay */

import { applyPayrollBatch, parsePayrollBatch, rollbackPayrollBatch } from '../src/payrollBatch.js';

const conversionConfig = (extra = {}) => ({ leaveConversion: { enabled: true, leaveTypes: ['Vacation Leave'], window: { start: '2025-11-01', end: '2025-11-30' }, ...extra } });
const hrmBalance = (employee, days, conversionDate = '2025-11-10') => ({ employeeId: employee.employeeId, leaveType: 'Vacation Leave', converted: days, conversionDate });
const conversionPay = line => line.earnings.filter(item => /^LVC-/.test(item.code));

test('converted leave credits from HRM are paid at the daily rate inside the window only', () => {
  const employee = sample();
  const base = lineFor(employee, transaction(conversionConfig()), context());
  assert.equal(conversionPay(base).length, 0, 'nothing converted, nothing paid');

  const paid = lineFor(employee, transaction(conversionConfig()), context({ leaveBalances: [hrmBalance(employee, 4)] }));
  assert.equal(conversionPay(paid).reduce((sum, item) => sum + item.amount, 0), Number((paid.rates.dailyRate * 4).toFixed(2)));
  assert.ok(paid.steps.some(step => step.code === 'FIN-001' && /HRM leave balance/.test(step.detail)));

  const outside = lineFor(employee, transaction(conversionConfig()), context({ leaveBalances: [hrmBalance(employee, 4, '2025-09-01')] }));
  assert.equal(conversionPay(outside).length, 0, 'a conversion dated outside the window is not paid');

  const off = lineFor(employee, transaction({ leaveConversion: { enabled: false, leaveTypes: [] } }), context({ leaveBalances: [hrmBalance(employee, 4)] }));
  assert.equal(conversionPay(off).length, 0, 'the switch is off');
});

test('an uploaded conversion pays an employee with no HRM engagement and replaces HRM where both exist', () => {
  const employee = sample();
  const withUpload = (days, hrm = []) => lineFor(
    employee,
    { ...transaction(conversionConfig()), overrides: { [employee.employeeId]: { leaveConversions: [{ leaveType: 'Vacation Leave', days, date: '2025-11-15', source: 'Batch leave.csv' }] } } },
    context({ leaveBalances: hrm }),
  );
  const none = withUpload(3);
  assert.equal(conversionPay(none).reduce((sum, item) => sum + item.amount, 0), Number((none.rates.dailyRate * 3).toFixed(2)));
  assert.ok(none.exceptions.some(item => /no HRM conversion on record/.test(item.message)));

  const replaced = withUpload(3, [hrmBalance(employee, 8)]);
  assert.equal(conversionPay(replaced).reduce((sum, item) => sum + item.amount, 0), Number((replaced.rates.dailyRate * 3).toFixed(2)), 'the upload wins, HRM days are not added on top');
  assert.ok(replaced.exceptions.some(item => /replace the 8 days HRM holds/.test(item.message)));
});

test('converted days are non-taxable up to ten, and the excess is taxable', () => {
  const employee = sample();
  const line = lineFor(employee, transaction(conversionConfig()), context({ leaveBalances: [hrmBalance(employee, 13)] }));
  const nonTaxable = line.earnings.find(item => item.code === 'LVC-NT');
  const taxable = line.earnings.find(item => item.code === 'LVC-TX');
  assert.equal(nonTaxable.amount, Number((line.rates.dailyRate * 10).toFixed(2)));
  assert.equal(taxable.amount, Number((line.rates.dailyRate * 3).toFixed(2)));
});

test('a leave conversion batch is validated against the switch, leave types and window, applied and rolled back', () => {
  const csv = 'Employee Code,Pay Item Type,Pay Item,Amount,Conversion Date\n0011223345,Leave Conversion,Vacation Leave,5,11/15/2025\n';
  const conversion = { enabled: true, leaveTypes: ['Vacation Leave'], window: { start: '2025-11-01', end: '2025-11-30' } };
  const ok = parsePayrollBatch(csv, { employees: employeeRoster, conversion });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.entries[0].date, '2025-11-15');

  assert.match(parsePayrollBatch(csv, { employees: employeeRoster, conversion: { ...conversion, enabled: false } }).errors[0], /turn on Convert leave credits/);
  assert.match(parsePayrollBatch(csv.replace('Vacation Leave', 'Sick Leave'), { employees: employeeRoster, conversion }).errors[0], /not one of the leave types/);
  assert.match(parsePayrollBatch(csv.replace('11/15/2025', '12/15/2025'), { employees: employeeRoster, conversion }).errors[0], /outside the conversion window/);
  assert.match(parsePayrollBatch(csv.replace(',5,', ',0,'), { employees: employeeRoster, conversion }).errors[0], /days greater than zero/);

  const employee = employeeRoster.find(row => row.code === '0011223345');
  const applied = applyPayrollBatch({}, ok.entries, employeeRoster, 'leave.csv');
  assert.deepEqual(applied[employee.employeeId].leaveConversions, [{ leaveType: 'Vacation Leave', days: 5, date: '2025-11-15', source: 'Batch leave.csv' }]);
  assert.deepEqual(rollbackPayrollBatch(applied, 'leave.csv')[employee.employeeId].leaveConversions, []);
});

/* ------------------------------------------------ multiple transactions at once */

import { batchDrafts, batchProblems, overlapWarnings, newBatchRow, numberBatch } from '../src/payrollRuns.js';

const batch = (rows = [], first = {}) => ({
  ...newPayrollRun({ runs: [], companyId: 'ABC-PH-001', year: 2025, month: 'November' }),
  transactionMode: 'Multiple', paymentMode: 'Semi-monthly', periodStart: '2025-11-01', periodEnd: '2025-11-15', timekeepingStart: '2025-10-16', timekeepingEnd: '2025-10-31', payoutDate: '2025-11-15', lockDate: '2025-11-16',
  ...first,
  additional: rows.map((row, index) => ({ ...newBatchRow({ paymentMode: 'Semi-monthly', month: 'November', year: 2025, frequency: 'Second Half' }, `row-${index}`), ...row })),
});
const monthly = { paymentMode: 'Monthly', periodStart: '2025-11-01', periodEnd: '2025-11-30', timekeepingStart: '2025-11-01', timekeepingEnd: '2025-11-30', payoutDate: '2025-11-30', lockDate: '2025-12-01' };

test('Multiple creates one transaction per row, each with its own payment mode and period', () => {
  const draft = batch([monthly]);
  assert.deepEqual(batchProblems(draft), []);
  const drafts = batchDrafts(draft, 'batch-1');
  assert.equal(drafts.length, 2);
  assert.deepEqual(drafts.map(item => item.paymentMode), ['Semi-monthly', 'Monthly']);
  assert.deepEqual(drafts.map(item => item.periodEnd), ['2025-11-15', '2025-11-30']);
  assert.ok(drafts.every(item => item.batchId === 'batch-1' && item.batchSize === 2 && item.additional === undefined));
  assert.notEqual(drafts[0].id, drafts[1].id);
  assert.deepEqual(numberBatch(drafts, []), ['PR-2025-11-001', 'PR-2025-11-002']);
  assert.deepEqual(numberBatch(drafts, [{ transactionNumber: 'PR-2025-11-001' }]), ['PR-2025-11-002', 'PR-2025-11-003']);
});

test('Single mode stays one transaction, whatever rows were left behind', () => {
  const draft = { ...batch([monthly]), transactionMode: 'Single' };
  assert.deepEqual(batchProblems(draft), []);
  assert.equal(batchDrafts(draft).length, 1);
});

test('a batch warns, but does not block, when one payment mode overlaps itself or a filed transaction', () => {
  const same = batch([{ paymentMode: 'Semi-monthly', periodStart: '2025-11-10', periodEnd: '2025-11-25', timekeepingStart: '2025-11-01', timekeepingEnd: '2025-11-09', payoutDate: '2025-11-25' }]);
  assert.match(overlapWarnings(same, [])[0], /paid twice/);
  assert.deepEqual(batchProblems(same), [], 'a warning never stops the wizard');

  const existing = [{ transactionNumber: 'PR-2025-11-009', status: 'Open', paymentMode: 'Monthly', payrollType: 'Regular', periodStart: '2025-11-01', periodEnd: '2025-11-30' }];
  assert.match(overlapWarnings(batch([monthly]), existing)[0], /already covers Monthly/);
  assert.deepEqual(overlapWarnings(batch([monthly]), [{ ...existing[0], status: 'Cancelled' }]), [], 'a cancelled transaction frees its period');
  assert.deepEqual(overlapWarnings(batch([monthly]), [{ ...existing[0], payrollType: 'Special' }]), [], 'a special run does not block a regular one');
});

test('each extra transaction needs its own period, cut-off and payout date', () => {
  const problems = batchProblems(batch([{ paymentMode: 'Monthly' }]), []);
  assert.ok(problems.some(item => /Transaction 2: the payroll period/.test(item)));
  assert.ok(problems.some(item => /Transaction 2: a timekeeping cut-off/.test(item)));
  assert.ok(problems.some(item => /Transaction 2: a payout date/.test(item)));
  assert.match(batchProblems(batch([{ ...monthly, periodEnd: '2025-10-01' }]), [])[0], /period end cannot fall before/);
  assert.match(batchProblems(batch([{ ...monthly, lockDate: '2025-11-01' }]), [])[0], /lock date/);
});

import { toggleBatchCalendar } from '../src/payrollRuns.js';

const calendar = (code, month, start, end, payout) => ({ calendarCode: code, month, year: '2025', frequency: 'First Half', periodStart: start, periodEnd: end, cutoffStart: start, cutoffEnd: end, payoutDate: payout });
const nov1 = calendar('C1', 'November', '2025-11-01', '2025-11-15', '2025-11-15');
const nov2 = calendar('C2', 'November', '2025-11-16', '2025-11-30', '2025-11-30');
const dec1 = calendar('C3', 'December', '2025-12-01', '2025-12-15', '2025-12-15');

test('ticking several calendars makes one transaction each, and unticking removes it', () => {
  const start = { ...newPayrollRun({ runs: [], companyId: 'ABC-PH-001' }), transactionMode: 'Multiple', additional: [] };
  const one = toggleBatchCalendar(start, nov1, true);
  assert.equal(one.calendarCode, 'C1');
  assert.equal(one.payoutDate, '2025-11-15');
  assert.deepEqual(one.additional, []);

  const three = toggleBatchCalendar(toggleBatchCalendar(one, nov2, true, 'a'), dec1, true, 'b');
  assert.deepEqual(batchDrafts(three, 'x').map(item => item.calendarCode), ['C1', 'C2', 'C3']);
  assert.equal(batchDrafts(three, 'x')[2].month, 'December');
  assert.deepEqual(toggleBatchCalendar(three, nov2, true), three, 'ticking twice changes nothing');

  const withoutMiddle = toggleBatchCalendar(three, nov2, false);
  assert.deepEqual(batchDrafts(withoutMiddle, 'x').map(item => item.calendarCode), ['C1', 'C3']);

  const withoutFirst = toggleBatchCalendar(three, nov1, false);
  assert.equal(withoutFirst.calendarCode, 'C2');
  assert.equal(withoutFirst.periodStart, '2025-11-16');
  assert.deepEqual(withoutFirst.additional.map(row => row.calendarCode), ['C3']);

  const empty = toggleBatchCalendar(one, nov1, false);
  assert.equal(empty.calendarCode, '');
  assert.equal(empty.periodStart, '');
});

/* ------------------------------------- year to date from posted payrolls, posting order */

import { applyAction, actionsFor, earlierUnposted, postedYtdFor, withPostedYtd, ytdWindow } from '../src/payrollRuns.js';

const postedRun = (id, payout, taxable = 10000, tax = 800, extra = {}) => ({
  id, transactionNumber: id, payrollType: 'Regular', paymentMode: 'Semi-monthly', status: 'Posted', payoutDate: payout, periodStart: payout.slice(0, 8) + '01', periodEnd: payout,
  result: { lines: [{ employeeId: 'EMP-1002', status: 'Computed', basicPay: taxable, taxableEarnings: 0, taxableBonus: 0, nonTaxableEarnings: 0, nonTaxableBonus: 0, withholdingTax: tax, netPay: 0, statutory: { sssEmployee: 100, philhealthEmployee: 50, hdmfEmployee: 25 } }] },
  ...extra,
});
const thisRun = (extra = {}) => ({ id: 'cur', transactionNumber: 'cur', payrollType: 'Regular', paymentMode: 'Semi-monthly', status: 'Open', payoutDate: '2025-12-15', periodStart: '2025-12-01', periodEnd: '2025-12-15', config: { ytd: { includePosted: true, startDate: '', endDate: '' } }, ...extra });

test('the default year-to-date window starts after the employee record ends and stops before this payout', () => {
  assert.deepEqual([ytdWindow({}, thisRun()).start, ytdWindow({}, thisRun()).end, ytdWindow({}, thisRun()).source], ['2025-11-01', '2025-12-14', 'Default']);
  assert.equal(ytdWindow({}, thisRun({ payoutDate: '2026-03-15' })).start, '2026-01-01', 'a different year starts on 1 January');
  const typed = ytdWindow({ startDate: '2025-01-01', endDate: '2025-06-30' }, thisRun());
  assert.deepEqual([typed.source, typed.start, typed.end, typed.problem], ['Transaction', '2025-01-01', '2025-06-30', '']);
  assert.match(ytdWindow({ startDate: '2025-01-01', endDate: '' }, thisRun()).problem, /both/);
  assert.match(ytdWindow({ startDate: '2025-06-01', endDate: '2025-01-01' }, thisRun()).problem, /before/);
});

test('posted payrolls inside the window top up year to date, and nothing outside it does', () => {
  const runs = [postedRun('a', '2025-11-15'), postedRun('b', '2025-11-30', 20000, 1600), postedRun('old', '2025-10-15'), postedRun('later', '2025-12-30'), postedRun('open', '2025-11-20', 5000, 0, { status: 'Open' })];
  const totals = postedYtdFor(runs, thisRun()).get('EMP-1002');
  assert.equal(totals.taxableEarnings, 30000, 'a + b only: before the window, after this payout and unposted are left out');
  assert.equal(totals.taxWithheld, 2400);

  const employee = findRosterEmployee('EMP-1002');
  const merged = withPostedYtd([employee], runs, thisRun())[0];
  assert.equal(merged.ytd.taxableEarnings, Number((employee.ytd.taxableEarnings + 30000).toFixed(2)));
  assert.equal(merged.ytd.taxWithheld, Number((employee.ytd.taxWithheld + 2400).toFixed(2)));
  assert.equal(employee.ytd.taxableEarnings, findRosterEmployee('EMP-1002').ytd.taxableEarnings, 'the roster itself is not mutated');

  const typed = postedYtdFor(runs, thisRun({ config: { ytd: { includePosted: true, startDate: '2025-11-20', endDate: '2025-12-14' } } })).get('EMP-1002');
  assert.equal(typed.taxableEarnings, 20000, 'typed dates narrow the window');
  assert.equal(withPostedYtd([employee], [], thisRun())[0], employee, 'nothing posted, nothing changed');
});

test('an earlier unposted period warns when posting, but does not stop it', () => {
  const earlier = { id: 'nov', transactionNumber: 'PR-2025-11-001', payrollType: 'Regular', paymentMode: 'Semi-monthly', status: 'Open', periodStart: '2025-11-16', periodEnd: '2025-11-30', payoutDate: '2025-11-30' };
  const approved = thisRun({ status: 'Approved', result: { totals: { netPay: 1 }, lines: [] } });
  assert.deepEqual(earlierUnposted(approved, [earlier]).map(item => item.transactionNumber), ['PR-2025-11-001']);

  const posted = applyAction(approved, 'post', { runs: [earlier] });
  assert.equal(posted.error, undefined);
  assert.equal(posted.run.status, 'Posted');
  assert.ok(posted.message.includes('Warning: PR-2025-11-001 (an earlier Semi-monthly period) is not posted yet'));
  assert.deepEqual(posted.run.postedAhead, ['PR-2025-11-001']);
  assert.ok(posted.run.audit.some(entry => entry.action === 'Posted ahead of an earlier period'));
  const post = actionsFor(approved, [earlier], { isPaAdmin: true }).find(item => item.key === 'post');
  assert.equal(post.disabled, undefined);
  assert.match(post.hint, /^Warning: PR-2025-11-001/);

  const clean = applyAction(approved, 'post', { runs: [{ ...earlier, status: 'Posted' }] });
  assert.equal(clean.run.postedAhead, undefined, 'nothing earlier is open, so no warning');
  assert.doesNotMatch(clean.message, /Warning/);
  assert.deepEqual(earlierUnposted(approved, [{ ...earlier, status: 'Cancelled' }]), [], 'cancelled does not count');
  assert.deepEqual(earlierUnposted(approved, [{ ...earlier, paymentMode: 'Monthly' }]), [], 'another payment mode does not count');
  assert.deepEqual(earlierUnposted(approved, [{ ...earlier, payrollType: 'Special' }]), [], 'special does not count');
  assert.deepEqual(earlierUnposted(approved, [{ ...earlier, periodStart: '2025-12-16', periodEnd: '2025-12-31' }]), [], 'a later period does not count');
});

test('a line says its year to date leaves out an earlier unposted period', () => {
  const employee = sample();
  const warned = lineFor(employee, transaction(), context({ earlierUnposted: ['PR-2025-11-001'] }));
  assert.ok(warned.exceptions.some(item => /Year-to-date excludes PR-2025-11-001/.test(item.message)));
  const quiet = lineFor(employee, transaction({ ytd: { includePosted: false } }), context({ earlierUnposted: ['PR-2025-11-001'] }));
  assert.ok(!quiet.exceptions.some(item => /Year-to-date excludes/.test(item.message)));
});

/* ------------------------------------------------------- forecast tax, variable allowances */

import { journalFor, runPayroll, ytdContributionOf } from '../src/payrollEngine.js';

const forecastTx = (extra = {}) => transaction({ taxForecast: { enabled: true }, ...extra });
const withOverride = (tx, employee, override) => ({ ...tx, overrides: { [employee.employeeId]: override } });

test('forecast tax is an editable per-employee amount withheld on top of the computed tax, in its own column', () => {
  const employee = sample();
  const plain = lineFor(employee, forecastTx());
  assert.equal(plain.taxForecast, 0, 'nothing typed, nothing withheld');

  const forecast = lineFor(employee, withOverride(forecastTx(), employee, { taxForecast: 1500 }));
  assert.equal(forecast.taxForecast, 1500);
  assert.equal(forecast.withholdingTax, plain.withholdingTax, 'the computed tax is untouched');
  assert.equal(forecast.netPay, Number((plain.netPay - 1500).toFixed(2)), 'it comes out of net pay');
  assert.equal(forecast.totalDeductions, Number((plain.totalDeductions + 1500).toFixed(2)));
  assert.ok(forecast.steps.some(step => /Forecast tax withheld in advance/.test(step.label || step.detail)));
  assert.equal(ytdContributionOf(forecast).taxWithheld, Number((plain.withholdingTax + 1500).toFixed(2)), 'year to date counts what was withheld');

  const off = lineFor(employee, withOverride(transaction(), employee, { taxForecast: 1500 }));
  assert.equal(off.taxForecast, 0, 'the run switch is off');
});

test('forecast tax is not withheld where the line annualizes the year, and totals and the journal carry it', () => {
  const employee = sample();
  const annualizing = lineFor(employee, withOverride(forecastTx({ annualizeTax: true }), employee, { taxForecast: 1500 }));
  assert.equal(annualizing.taxForecast, 0);
  assert.ok(annualizing.exceptions.some(item => /Forecast tax of .* was not withheld/.test(item.message)));

  const tx = withOverride(forecastTx(), employee, { taxForecast: 1500 });
  const result = runPayroll({ transaction: { ...tx, population: { mode: 'Selected Employees', included: [employee.employeeId], excluded: [] } }, context: context() });
  assert.equal(result.totals.taxForecast, 1500);
  const journal = journalFor(result);
  assert.equal(journal.balanced, true);
  assert.equal(journal.entries.find(entry => entry.account === '2110-100').credit, Number((result.totals.withholdingTax + 1500).toFixed(2)));
});

const vaTable = [{ code: 'VA-LEC', name: 'Lecture Fee', taxable: 'Yes' }, { code: 'VA-TRN', name: 'Transportation Allowance (per hour)', taxable: 'No' }];
const vaCtx = () => context({ variableAllowances: vaTable });

test('a variable allowance pays rate × hours, from the hours entered or from timekeeping', () => {
  const employee = sample();
  const base = lineFor(employee, transaction(), vaCtx());
  const typed = lineFor(employee, withOverride(transaction(), employee, { variableAllowances: [{ code: 'VA-LEC', rate: 100, hours: 12 }] }), vaCtx());
  const lecture = typed.earnings.find(item => item.code === 'VA-LEC');
  assert.equal(lecture.amount, 1200);
  assert.equal(lecture.classification, 'Taxable Allowance');
  assert.equal(Number((typed.taxableEarnings - base.taxableEarnings).toFixed(2)), 1200);

  const fromTimekeeping = lineFor(employee, withOverride(transaction(), employee, { variableAllowances: [{ code: 'VA-LEC', rate: 100, hours: '' }] }), vaCtx());
  const hours = fromTimekeeping.attendance.hoursWorked;
  assert.equal(fromTimekeeping.earnings.find(item => item.code === 'VA-LEC')?.amount ?? 0, Number((hours * 100).toFixed(2)));

  const nonTaxable = lineFor(employee, withOverride(transaction(), employee, { variableAllowances: [{ code: 'VA-TRN', rate: 20, hours: 10 }] }), vaCtx());
  assert.equal(nonTaxable.earnings.find(item => item.code === 'VA-TRN').classification, 'Non-taxable');
  assert.equal(Number((nonTaxable.nonTaxableEarnings - base.nonTaxableEarnings).toFixed(2)), 200);

  const blank = lineFor(employee, withOverride(transaction(), employee, { variableAllowances: [{ code: '', rate: 100, hours: 5 }] }), vaCtx());
  assert.equal(blank.grossPay, base.grossPay, 'a row with no allowance chosen pays nothing');
  const zeroed = lineFor(employee, withOverride(transaction({ zeroVariableAllowance: true }), employee, { variableAllowances: [{ code: 'VA-LEC', rate: 100, hours: 12 }] }), vaCtx());
  assert.equal(zeroed.earnings.find(item => item.code === 'VA-LEC').amount, 1200, 'an allowance typed on the transaction is an instruction, so Zero variable allowances does not remove it');
});

test('forecast tax and hourly variable allowances can be uploaded, and roll back with the batch', () => {
  const csv = 'Employee Code,Pay Item Type,Pay Item,Amount,Conversion Date,Rate\n0011223345,Variable Allowance,VA-LEC,12,,100\n0011223345,Tax Forecast,Forecast tax,1500,,\n';
  const parsed = parsePayrollBatch(csv, { employees: employeeRoster });
  assert.deepEqual(parsed.errors, []);
  const applied = applyPayrollBatch({}, parsed.entries, employeeRoster, 'va.csv');
  const employee = employeeRoster.find(row => row.code === '0011223345');
  assert.deepEqual(applied[employee.employeeId].variableAllowances, [{ code: 'VA-LEC', rate: 100, hours: 12, source: 'Batch va.csv' }]);
  assert.equal(applied[employee.employeeId].taxForecast, 1500);
  assert.deepEqual(rollbackPayrollBatch(applied, 'va.csv')[employee.employeeId].variableAllowances, []);
  assert.match(parsePayrollBatch(csv.replace('VA-LEC,12,,100', 'VA-LEC,12,,'), { employees: employeeRoster }).errors[0], /Rate per hour/);
});

test('a single transaction that overlaps a filed one is warned about and still allowed', () => {
  const draft = { ...batch(), transactionMode: 'Single' };
  const filed = [{ transactionNumber: 'PR-2025-11-001', status: 'Open', paymentMode: 'Semi-monthly', payrollType: 'Regular', periodStart: '2025-11-01', periodEnd: '2025-11-15' }];
  assert.match(overlapWarnings(draft, filed)[0], /This transaction overlaps PR-2025-11-001/);
  assert.deepEqual(batchProblems(draft), []);
  assert.deepEqual(overlapWarnings(draft, [{ ...filed[0], periodStart: '2025-10-01', periodEnd: '2025-10-15' }]), [], 'a different period is fine, even while the earlier one is still open');
  assert.deepEqual(overlapWarnings(draft, [{ ...filed[0], status: 'Cancelled' }]), []);
});

/* ------------------------------------------------ special overrides, tax types, final pay, ceiling */

import { leaveBalancesAfterConversion } from '../src/payrollRuns.js';

const special = (config = {}, extra = {}) => transaction(config, { payrollType: 'Special', ...extra });
const withStatutory = (tx, employee, statutory) => ({ ...tx, overrides: { [employee.employeeId]: { statutory } } });

test('a special transaction can enter contribution amounts for an employee; a regular one cannot', () => {
  const employee = sample();
  const computed = lineFor(employee, special());
  const entered = lineFor(employee, withStatutory(special(), employee, { philhealthEmployee: 111, philhealthEmployer: 222, sssEmployee: 500, ec: 10 }));
  assert.equal(entered.statutory.philhealthEmployee, 111);
  assert.equal(entered.statutory.philhealthEmployer, 222);
  assert.equal(entered.statutory.sssEmployee, 500);
  assert.equal(entered.statutory.ec, 10);
  assert.equal(entered.statutory.hdmfEmployee, computed.statutory.hdmfEmployee, 'the others stay computed');
  assert.equal(entered.statutory.employeeTotal, Number((500 + 111 + computed.statutory.hdmfEmployee).toFixed(2)));
  assert.ok(entered.exceptions.some(item => /entered on this special transaction/.test(item.message)));

  const regular = lineFor(employee, withStatutory(transaction(), employee, { philhealthEmployee: 111 }));
  assert.equal(regular.statutory.philhealthEmployee, lineFor(employee, transaction()).statutory.philhealthEmployee, 'a regular transaction ignores it');
});

test('employee tax types: Direct is a flat percentage, Annualized projects the year', () => {
  const base = sample();
  const as = payroll => ({ ...base, payroll: { ...base.payroll, ...payroll } });
  const direct = lineFor(as({ taxType: 'Direct', directTaxRate: 10 }));
  assert.equal(direct.withholdingTax, Number((direct.taxableIncome * 0.10).toFixed(2)));
  assert.match(direct.taxBasis, /Direct 10%/);
  assert.ok(lineFor(as({ taxType: 'Direct' })).exceptions.some(item => /no direct tax rate/.test(item.message)));

  const graduated = lineFor(base);
  const annualized = lineFor(as({ taxType: 'Annualized' }));
  assert.match(annualized.taxBasis, /^Annualized/);
  assert.ok(annualized.steps.some(step => step.code === 'TAX-008'));
  assert.ok(annualized.withholdingTax >= 0);
  assert.notEqual(annualized.taxBasis, graduated.taxBasis);
  const yearEnd = lineFor(as({ taxType: 'Annualized' }), transaction({ annualizeTax: true }));
  assert.match(yearEnd.taxBasis, /year-end adjustment/, 'a year-end run still annualizes the whole year');
});

test('final pay converts every credit still left, and posting takes it out of the HRM balance', () => {
  const employee = findRosterEmployee('EMP-1007');
  const balances = [
    { employeeId: employee.employeeId, leaveType: 'Vacation Leave', accrued: 15, used: 3, forfeited: 0, converted: 0, available: 12 },
    { employeeId: employee.employeeId, leaveType: 'Sick Leave', accrued: 10, used: 1, forfeited: 0, converted: 0, available: 9 },
  ];
  const tx = transaction({ computeFinalPay: true, leaveConversion: { enabled: true, leaveTypes: ['Vacation Leave', 'Sick Leave'], window: { start: '2025-11-01', end: '2025-11-30' } } });
  const line = lineFor(employee, tx, context({ leaveBalances: balances }));
  assert.equal(line.status, 'Computed', 'the separated employee is in a final-pay run');
  const paid = line.leaveConversions.filter(item => item.source === 'HRM leave balance (final pay)');
  assert.deepEqual(paid.map(item => [item.leaveType, item.days]), [['Vacation Leave', 12], ['Sick Leave', 9]]);

  const run = { payoutDate: '2025-11-30', result: { lines: [line] } };
  const { balances: after, deducted } = leaveBalancesAfterConversion(balances, run);
  assert.equal(deducted.length, 2);
  assert.deepEqual([after[0].converted, after[0].available, after[0].conversionDate], [12, 0, '2025-11-30']);
  assert.deepEqual([balances[0].converted, balances[0].available], [0, 12], 'the input balances are not mutated');
  assert.equal(leaveBalancesAfterConversion(after, run).deducted.length, 0, 'posting twice takes nothing more');
});

test('uploaded conversions leave the HRM balance only where HRM holds no conversion, and never beyond what is available', () => {
  const employeeId = 'E1';
  const run = { payoutDate: '2025-11-30', result: { lines: [{ status: 'Computed', employeeId, leaveConversions: [{ leaveType: 'Vacation Leave', days: 5, source: 'Uploaded' }, { leaveType: 'Sick Leave', days: 4, source: 'Uploaded' }, { leaveType: 'Emergency Leave', days: 2, source: 'HRM leave balance' }] }] } };
  const balances = [
    { employeeId, leaveType: 'Vacation Leave', converted: 0, available: 3 },
    { employeeId, leaveType: 'Sick Leave', converted: 6, available: 10 },
    { employeeId, leaveType: 'Emergency Leave', converted: 2, available: 4 },
  ];
  const { balances: after, deducted } = leaveBalancesAfterConversion(balances, run);
  assert.deepEqual(deducted, [{ employeeId, leaveType: 'Vacation Leave', days: 3 }], 'capped at the 3 days available');
  assert.equal(after[1].converted, 6, 'HRM already converted Sick Leave, so the upload does not touch it');
  assert.equal(after[2].converted, 2, 'days HRM converted are already out of the balance');
});

test('reclassification can draw on the remaining 13th month and other benefits ceiling', () => {
  const employee = sample();
  const register = mealRegister(employee);
  const setups = [mealSetup({ reclassPriority: '1' })];
  const ctxWith = () => context({ registers: { earnings: register, deductions: [], bonuses: [], payCodes: [] }, serviceConfig: { earnings: setups } });
  const typed = lineFor(employee, transaction({ reclassification: { enabled: true, poolLimit: '', poolSource: 'amount' } }), ctxWith());
  assert.equal(typed.earnings.find(item => item.code === 'ERN-901-R').amount, 3000, 'no typed limit, no cap: everything moves');
  assert.equal(typed.reclassifiedNonTaxable, 0, 'a typed pool does not touch the ceiling');

  const usedUp = lineFor({ ...employee, ytd: { ...employee.ytd, bonusPaid: 89000 } }, transaction({ reclassification: { enabled: true, poolLimit: '', poolSource: 'ceiling' } }), ctxWith());
  assert.equal(usedUp.earnings.find(item => item.code === 'ERN-901-R').amount, 1000, 'only the 1,000 left under 90,000 can move');
  assert.equal(usedUp.reclassifiedNonTaxable, 1000);
  assert.equal(ytdContributionOf(usedUp).bonusPaid, 1000, 'it counts as ceiling used for later runs');

  const full = lineFor({ ...employee, ytd: { ...employee.ytd, bonusPaid: 90000 } }, transaction({ reclassification: { enabled: true, poolLimit: '', poolSource: 'ceiling' } }), ctxWith());
  assert.equal(full.earnings.find(item => item.code === 'ERN-901-R'), undefined, 'nothing left under the ceiling, nothing moves');
});

/* ------------------------------------------ maximum first, balance in the next payroll */

import { statutoryCollectedFor } from '../src/payrollRuns.js';
import { STATUTORY_MAX_FIRST } from '../src/payrollEngine.js';

const maxFirst = (extra = {}) => transaction({ statutorySchedule: STATUTORY_MAX_FIRST, ...extra });
const protect = (policy = {}) => context({ policies: { takeHome: { enabled: true, autoDefer: true, thresholdType: 'Fixed Amount', threshold: 0, base: 'Gross Pay', ...policy } } });
const employeeShare = line => line.statutory.sssEmployee + line.statutory.philhealthEmployee + line.statutory.hdmfEmployee;

test('the first payroll of the month takes the whole month when take-home pay allows it', () => {
  const employee = sample();
  const split = lineFor(employee);
  const first = lineFor(employee, maxFirst(), protect({ threshold: 0 }));
  const periods = 2;
  assert.equal(Number(employeeShare(first).toFixed(2)), Number((employeeShare(split) * periods).toFixed(2)), 'the month, not half of it');
  assert.ok(first.steps.some(step => /maximum first, balance next/.test(step.label || '')));
  assert.ok(!first.exceptions.some(item => /were held to/.test(item.message)));
});

test('the first payroll is held back to the protected take-home pay, and says how much is left for the next', () => {
  const employee = sample();
  const open = lineFor(employee, maxFirst(), protect({ threshold: 0 }));
  const gross = open.grossPay;
  const tight = lineFor(employee, maxFirst(), protect({ threshold: Number((gross - employeeShare(open) / 2 - open.withholdingTax).toFixed(2)) }));
  assert.ok(employeeShare(tight) < employeeShare(open), 'less is collected than the month needs');
  assert.ok(employeeShare(tight) > 0, 'but some is');
  assert.ok(tight.exceptions.some(item => /left for the next payroll/.test(item.message)));
  const none = lineFor(employee, maxFirst(), protect({ threshold: gross }));
  assert.equal(employeeShare(none), 0, 'no headroom, no collection');
});

test('the next payroll takes the balance, and nothing more than the month needs', () => {
  const employee = sample();
  const open = lineFor(employee, maxFirst(), protect({ threshold: 0 }));
  const tight = lineFor(employee, maxFirst(), protect({ threshold: Number((open.grossPay - employeeShare(open) / 2 - open.withholdingTax).toFixed(2)) }));
  const collected = { [employee.employeeId]: tight.statutory };

  const second = lineFor(employee, maxFirst(), context({ policies: { takeHome: { enabled: false } }, statutoryCollected: collected }));
  assert.equal(Number((employeeShare(tight) + employeeShare(second)).toFixed(2)), Number(employeeShare(open).toFixed(2)), 'the two payrolls together are the month');

  const alreadyAll = lineFor(employee, maxFirst(), context({ policies: { takeHome: { enabled: false } }, statutoryCollected: { [employee.employeeId]: open.statutory } }));
  assert.equal(employeeShare(alreadyAll), 0, 'a month already collected in full takes nothing again');
});

test('what earlier payrolls collected is read from the same month and payment mode, ignoring cancelled and later ones', () => {
  const lineOf = value => ({ status: 'Computed', employeeId: 'E1', statutory: { sssEmployee: value, philhealthEmployee: 10 } });
  const mk = (id, extra) => ({ id, status: 'Posted', paymentMode: 'Semi-monthly', periodStart: '2025-11-01', periodEnd: '2025-11-15', result: { lines: [lineOf(100)] }, ...extra });
  const run = { id: 'cur', paymentMode: 'Semi-monthly', periodStart: '2025-11-16', periodEnd: '2025-11-30' };
  const runs = [
    mk('a'), mk('b', { status: 'Open', periodStart: '2025-11-01', periodEnd: '2025-11-08', result: { lines: [lineOf(50)] } }),
    mk('cancelled', { status: 'Cancelled' }), mk('other-mode', { paymentMode: 'Monthly' }), mk('last-month', { periodStart: '2025-10-16', periodEnd: '2025-10-31' }), mk('later', { periodStart: '2025-12-01', periodEnd: '2025-12-15' }),
  ];
  assert.deepEqual(statutoryCollectedFor(runs, run), { E1: { sssEmployee: 150, philhealthEmployee: 20 } });
});

/* ----------------------------------- walkthrough deck: prior employer ceiling, gross up scope */

test('the non-taxable ceiling is used up by what the previous employer already gave, as well as this year', () => {
  const employee = sample();
  const ctx = context();
  const bonusRun = employee2 => lineFor(employee2, transaction({ thirteenthMonth: { enabled: true, basis: 'Pre-defined (Computational Basis)', ntThreshold: 90000, bonusTypes: ['13th Month Pay'] } }), ctx);
  const own = bonusRun({ ...employee, previousEmployer: null });
  const withPrior = bonusRun({ ...employee, previousEmployer: { nontaxableBonus: 40000, grossTaxableIncome: 0, taxWithheld: 0 } });
  assert.ok(own.bonuses.length > 0, 'the 13th month is paid');
  assert.ok(withPrior.bonuses[0].ceilingBefore <= own.bonuses[0].ceilingBefore - 40000 + 0.01, 'the ceiling left is smaller by the previous employer\'s 40,000');
  assert.ok(withPrior.bonuses[0].taxable >= own.bonuses[0].taxable);
  assert.ok(withPrior.steps.some(step => step.code === 'BON-004' && /previous employer/.test(step.detail)));

  const register = mealRegister(employee);
  const reclass = previousEmployer => lineFor({ ...employee, previousEmployer }, transaction({ reclassification: { enabled: true, poolLimit: '', poolSource: 'ceiling' } }), context({ registers: { earnings: register, deductions: [], bonuses: [], payCodes: [] }, serviceConfig: { earnings: [mealSetup({})] } }));
  const heavy = reclass({ nontaxableBonus: 89500, grossTaxableIncome: 0, taxWithheld: 0 });
  assert.equal(heavy.earnings.find(item => item.code === 'ERN-901-R').amount, 500, 'only what the previous employer left of the 90,000 can be reclassified');
});

test('gross up covers periodic compensation tax only, and a grossed-up line carries no forecast tax', () => {
  const base = sample();
  const as = payroll => ({ ...base, payroll: { ...base.payroll, grossUp: 'Yes', ...payroll } });

  const periodic = lineFor(as({}));
  assert.ok(periodic.grossUp, 'a compensation-tax employee is grossed up');
  assert.equal(periodic.withholdingTax, 0);

  const direct = lineFor(as({ taxType: 'Direct', directTaxRate: 10 }));
  assert.equal(direct.grossUp, null, 'a direct-tax employee is not grossed up on the compensation table');
  assert.ok(direct.withholdingTax > 0);
  assert.ok(direct.exceptions.some(item => /Gross up covers periodic compensation tax only/.test(item.message)));

  const annualizing = lineFor(as({}), transaction({ annualizeTax: true }));
  assert.equal(annualizing.grossUp, null, 'a year-end adjustment is not grossed up on the periodic table');

  const forecast = lineFor(as({}), withOverride(forecastTx(), base, { taxForecast: 1500 }));
  assert.equal(forecast.taxForecast, 0);
  assert.ok(forecast.exceptions.some(item => /grossed up, so the employer carries the tax/.test(item.message)));
});
