import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, length: 0, key: () => null };
const { defaultHrmData } = await import('../src/hrmData.js');
const { findRosterEmployee } = await import('../src/employeeRoster.js');
const { computeEmployeeLine } = await import('../src/payrollEngine.js');
const { buildPayrollContext } = await import('../src/payrollRuns.js');
const bridge = await import('../src/employeePayrollBridge.js');

/**
 * Employee Masterfile › Payroll Allocation is where earnings, deductions, loans and bonuses are assigned
 * (ATLAS-1419, ATLAS-1420), so the payroll transaction reads them from there. An employee with no entries keeps
 * the HR record; one with entries gets exactly what the Masterfile holds.
 */
const hrm = defaultHrmData('ABC-PH-001');
const person = findRosterEmployee('EMP-1002');
const salary = hrm.salaryInformation.find(row => row.employeeId === 'EMP-1002');
const loans = hrm.loanInquiries.filter(row => row.employeeId === 'EMP-1002');
const baseRun = (patch = {}) => ({
  id: 'r1', companyId: 'default', transactionNumber: 'PR-2025-11-001', payrollType: 'Regular', paymentMode: 'Semi-monthly', year: 2025, month: 'November', frequency: 'Second Half',
  periodStart: '2025-11-16', periodEnd: '2025-11-30', timekeepingStart: '2025-11-01', timekeepingEnd: '2025-11-15', payoutDate: '2025-11-30',
  config: { workDaysPerYear: 261, workHoursPerDay: 8, computeAllowableDeduction: true, statutoryAgencies: { sss: true, philhealth: true, pagibig: true, sssWisp: true }, statutorySchedule: 'Every payroll (split)', computeTax: true, thirteenthMonth: { enabled: false } },
  population: { mode: 'Active/Inactive in 201', includeOnHold: false, included: [], excluded: [] }, overrides: {}, ...patch,
});
const storageWith = store => ({ getItem: key => (key === bridge.EMPLOYEE_PAYROLL_KEY ? JSON.stringify(store) : key.startsWith('atlas-payroll-runs-v1') ? '[]' : null), setItem() {}, removeItem() {} });
const lineFor = ({ store = {}, run = baseRun(), serviceConfig = {}, registers = {} } = {}) => {
  const context = buildPayrollContext({ companyId: 'default', run, hrmData: hrm, storage: storageWith(store), serviceConfig, registers });
  const employee = context.employees.find(item => item.employeeId === 'EMP-1002');
  return computeEmployeeLine({ employee, transaction: run, context });
};
const derived = () => bridge.masterfileRowsFromHrm(salary, loans, person.payroll);
const money = value => Math.round(value * 100) / 100;

test('what the Masterfile shows for an employee with no entries is the HR record, and storing it changes nothing', () => {
  const without = lineFor();
  const rows = derived();
  const withStore = lineFor({ store: { [person.code]: { basicPay: rows.basicPay, earnings: rows.earnings, deductions: rows.deductions, loans: rows.loans } } });
  for (const key of ['basicPay', 'grossPay', 'taxableIncome', 'withholdingTax', 'netPay', 'totalDeductions']) assert.equal(withStore[key], without[key], key);
  assert.deepEqual(withStore.deductions.map(item => [item.name, item.due]), without.deductions.map(item => [item.name, item.due]));
  assert.deepEqual(withStore.loans.map(item => [item.name, item.due, item.remaining]), without.loans.map(item => [item.name, item.due, item.remaining]));
  assert.deepEqual(withStore.earnings.map(item => [item.name, item.amount]), without.earnings.map(item => [item.name, item.amount]));
});

test('an earning added in the Masterfile is paid, by its taxability', () => {
  const rows = derived();
  const base = lineFor();
  const add = patch => lineFor({ store: { [person.code]: { earnings: [...rows.earnings, { id: 99, code: 'ERN-900', name: 'Housing Allowance', amount: '2000', paymentMode: 'Monthly', frequency: 'Every Payroll', taxability: 'Taxable', classification: 'Regular Earning', effectiveDate: '2025-01-01', start: '2025-01-01', ...patch }] } } });
  const taxable = add({});
  assert.equal(money(taxable.grossPay - base.grossPay), 1000, 'a monthly 2,000.00 earning is 1,000.00 in a semi-monthly payroll');
  assert.equal(money(taxable.taxableIncome - base.taxableIncome), 1000);
  const nonTaxable = add({ taxability: 'Non-taxable', classification: 'Receivable' });
  assert.equal(money(nonTaxable.grossPay - base.grossPay), 1000);
  assert.equal(nonTaxable.taxableIncome, base.taxableIncome, 'a receivable is not taxable');
  assert.equal(add({ paymentMode: 'One-time' }).grossPay - base.grossPay, 2000, 'a one-time earning is paid whole');
});

test('an entry that has ended, not started, is on hold or belongs to the other half is not paid', () => {
  const withEntry = patch => lineFor({ store: { [person.code]: { earnings: [{ id: 1, code: 'ERN-901', name: 'Test', amount: '1000', paymentMode: 'Semi-monthly', frequency: 'Every Payroll', taxability: 'Taxable', classification: 'Regular Earning', start: '2025-01-01', ...patch }] } } });
  const none = lineFor({ store: { [person.code]: { earnings: [] } } }).earnings.length;
  assert.equal(withEntry({}).earnings.length, none + 1);
  assert.equal(withEntry({ end: '2025-11-29' }).earnings.length, none, 'ended the day before the period end');
  assert.equal(withEntry({ end: '2025-11-30' }).earnings.length, none + 1, 'ends on the period end');
  assert.equal(withEntry({ start: '2025-12-01' }).earnings.length, none, 'starts after the period end');
  assert.equal(withEntry({ holdDate: '2025-11-30' }).earnings.length, none, 'on hold from the period end');
  assert.equal(withEntry({ frequency: 'First Half' }).earnings.length, none, 'first half only, in a second-half payroll');
  assert.equal(withEntry({ frequency: 'Second Half' }).earnings.length, none + 1);
});

test('the basic pay in force on the payout date is the one used', () => {
  const entries = [
    { id: 1, payType: 'Monthly', amount: '62000', workDays: '261', workHours: '8', mwe: 'No', effectiveDate: '2025-01-01' },
    { id: 2, payType: 'Monthly', amount: '80000', workDays: '261', workHours: '8', mwe: 'No', effectiveDate: '2025-12-01' },
  ];
  const november = lineFor({ store: { [person.code]: { basicPay: entries } } });
  assert.equal(november.basicPay, 31000, 'before the second entry takes effect');
  const december = lineFor({ store: { [person.code]: { basicPay: entries } }, run: baseRun({ periodStart: '2025-12-16', periodEnd: '2025-12-31', payoutDate: '2025-12-31', month: 'December' }) });
  assert.equal(december.basicPay, 40000, 'from the day the second entry takes effect');
  assert.equal(lineFor({ store: { [person.code]: { basicPay: [entries[1]] } } }).basicPay, 40000, 'a single entry dated in the future is used rather than none');
});

test('the rates of an entry follow its pay type, factor days and hours', () => {
  const rates = row => bridge.ratesOfBasicPay(row);
  assert.deepEqual([rates({ payType: 'Monthly', amount: '50000', workDays: '261', workHours: '8' }).dailyRate, rates({ payType: 'Monthly', amount: '50000', workDays: '261', workHours: '8' }).hourlyRate], [2298.85, 287.36]);
  assert.equal(rates({ payType: 'Daily', amount: '645', workDays: '313', workHours: '8' }).monthlyRate, 16823.75);
  assert.equal(rates({ payType: 'Hourly', amount: '250', workDays: '261', workHours: '8' }).monthlyRate, 43500);
  const daily = lineFor({ store: { [person.code]: { basicPay: [{ id: 1, payType: 'Daily', amount: '1000', workDays: '261', workHours: '8', mwe: 'No', effectiveDate: '2025-01-01' }] } }, run: baseRun({ config: { ...baseRun().config } }) });
  assert.equal(daily.payType, 'Daily');
});

test('a deduction and a loan from the Masterfile collect no more than their balance', () => {
  const deduction = (count, accumulated) => lineFor({ store: { [person.code]: { deductions: [{ id: 1, name: 'Cooperative Dues', amount: '500', startDate: '2025-01-01', endDate: '', count: String(count), total: '', accumulated: String(accumulated) }] } } }).deductions.filter(item => item.name === 'Cooperative Dues').map(item => item.due);
  assert.deepEqual(deduction(10, 0), [500]);
  assert.deepEqual(deduction(10, 4800), [200], 'the last instalment is the balance');
  assert.deepEqual(deduction(10, 5000), [], 'a settled deduction is not collected');
  const loan = (accumulatedComputed, extra = {}) => lineFor({ store: { [person.code]: { loans: [{ id: 1, code: 'LN-T-1', loanSource: 'Company Loan', payItem: 'Test Loan', amount: '2500', principal: '30000', interest: '1500', accumulatedManual: '0', accumulatedComputed: String(accumulatedComputed), startDate: '2025-01-01', endDate: '2026-12-31', ...extra }] } } }).loans.map(item => [item.name, item.due, item.remaining]);
  assert.deepEqual(loan(17500), [['Test Loan', 2500, 11500]]);
  assert.deepEqual(loan(29000), [['Test Loan', 2500, 0]]);
  assert.deepEqual(loan(29000.01), [['Test Loan', 2499.99, 0]]);
  assert.deepEqual(loan(31500), [], 'fully paid');
  assert.deepEqual(loan(0, { endDate: '2025-11-29' }), [], 'ended before the payout date');
  assert.deepEqual(loan(0, { holdDate: '2025-11-30' }), [], 'on hold');
});

test('a bonus in the Masterfile reaches the 13th month and bonus step', () => {
  const run = baseRun({ config: { ...baseRun().config, thirteenthMonth: { enabled: true, basis: 'Pre-defined (Computational Basis)', ntThreshold: 90000, bonusTypes: ['Performance Bonus'] } } });
  const without = lineFor({ run });
  const withBonus = lineFor({ run, store: { [person.code]: { bonuses: [{ id: 1, name: 'Performance Bonus', amount: '20000', effectiveDate: '2025-01-01' }] } } });
  assert.equal(without.bonuses.length, 0);
  assert.deepEqual(withBonus.bonuses.map(item => [item.name, item.amount, item.nonTaxable]), [['Performance Bonus', 20000, 20000]]);
});

test('the company setups give an employee what they cover, unless the employee already holds it', () => {
  const config = patch => ({ code: 'ERN-X1', name: 'Housing Subsidy', status: 'Active', defaultAmount: '3000', paymentMode: 'Monthly', taxability: 'Taxable', classification: 'Regular Earning', startDate: '2025-01-01', ...patch });
  const base = lineFor();
  assert.equal(money(lineFor({ serviceConfig: { earnings: [config()] } }).grossPay - base.grossPay), 1500);
  assert.equal(lineFor({ serviceConfig: { earnings: [config({ status: 'Inactive' })] } }).grossPay, base.grossPay, 'Inactive');
  assert.equal(lineFor({ serviceConfig: { earnings: [config({ defaultAmount: '0' })] } }).grossPay, base.grossPay, 'no default amount');
  assert.equal(lineFor({ serviceConfig: { earnings: [config({ applicability: { scope: 'Department', department: 'Finance' } })] } }).grossPay, base.grossPay, 'another department');
  assert.equal(lineFor({ serviceConfig: { earnings: [config({ startDate: '2025-12-01' })] } }).grossPay, base.grossPay, 'not started');
  const held = salary.earnings.find(row => row.earningName === 'Meal Allowance');
  assert.equal(lineFor({ serviceConfig: { earnings: [config({ code: 'ERN-MEAL', name: held.earningName })] } }).grossPay, base.grossPay, 'the employee already holds it');
});

test('overtime rates come from Overtime Rate Management, and a run can set its own', () => {
  const records = [
    { code: 'OT-001', type: 'Regular Workday', status: 'Active', effectiveDate: '2025-01-01', regularOvertime: '150', nightShiftDifferential: '120' },
    { code: 'OT-002', type: 'Rest Day', status: 'Active', effectiveDate: '2025-01-01', regularOvertime: '130' },
    { code: 'OT-003', type: 'Regular Holiday', status: 'Active', effectiveDate: '2025-01-01', regularOvertime: '200' },
  ];
  assert.deepEqual(bridge.overtimeMultipliersFor(records, person, '2025-11-30'), { Regular: 1.5, 'Night Differential': 1.2, 'Rest Day': 1.3, Holiday: 2 });
  assert.deepEqual(bridge.overtimeMultipliersFor(records, person, '2024-12-31'), {}, 'before the policy takes effect');
  assert.deepEqual(bridge.overtimeMultipliersFor([{ ...records[0], status: 'Inactive' }], person, '2025-11-30'), {});
  assert.deepEqual(bridge.overtimeMultipliersFor([{ ...records[0], effectiveTo: '2025-06-30' }], person, '2025-11-30'), {}, 'ended');
  assert.deepEqual(bridge.overtimeMultipliersFor([{ ...records[0], applicability: { scope: 'Department', department: 'Finance' } }], person, '2025-11-30'), {}, 'another department');
  const later = { ...records[0], code: 'OT-009', effectiveDate: '2025-10-01', regularOvertime: '175' };
  assert.equal(bridge.overtimeMultipliersFor([...records, later], person, '2025-11-30').Regular, 1.75, 'the latest effective policy wins');
});
