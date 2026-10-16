import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, length: 0, key: () => null };
const { basicPayUsage, basicPayInForce } = await import('../src/employeePayrollBridge.js');
const { entryProblems } = await import('../src/configValidation.js');

/**
 * The Basic Pay slides (updated deck, slides 5 to 8): a Basic Pay entry already used in a payroll is locked, a change is a new
 * Effectivity Date, the year is a four-digit whole number, and payroll uses the entry effective for the payout.
 */
const rows = [
  { id: 1, effectiveDate: '2026-01-01', amount: '50000' },
  { id: 2, effectiveDate: '2026-07-01', amount: '55000' },
  { id: 3, effectiveDate: '2026-12-01', amount: '60000' },
];

test('an entry is used by the payrolls it was in force for, and only those', () => {
  const used = basicPayUsage(rows, [
    { transactionNumber: 'PR-1', status: 'Posted', payoutDate: '2026-01-15' },
    { transactionNumber: 'PR-2', status: 'Open', payoutDate: '2026-07-01' },
    { transactionNumber: 'PR-3', status: 'Cancelled', payoutDate: '2026-12-15' },
  ]);
  assert.deepEqual(used.get(1), ['PR-1']);
  assert.deepEqual(used.get(2), ['PR-2'], 'an entry effective on the payout date is the one used');
  assert.equal(used.has(3), false, 'a cancelled run uses nothing');
});

test('a payout the day before an entry takes effect does not use it', () => {
  const used = basicPayUsage(rows, [{ transactionNumber: 'PR-4', status: 'Posted', payoutDate: '2026-06-30' }]);
  assert.deepEqual([...used.keys()], [1]);
  assert.equal(basicPayInForce(rows, '2026-06-30').id, 1);
  assert.equal(basicPayInForce(rows, '2026-07-01').id, 2);
});

test('an unused entry has no usage', () => {
  assert.equal(basicPayUsage(rows, []).size, 0);
});

test('Start Year is a whole four-digit number', () => {
  const fields = [['startYear', 'Start Year', 'number']];
  const problems = value => entryProblems('basicPay', { startYear: value }, fields, []);
  assert.deepEqual(problems('2026'), []);
  assert.deepEqual(problems('1000'), []);
  assert.deepEqual(problems('9999'), []);
  for (const bad of ['26', '999', '10000', '20266', '2026.5', '-2026', '0']) assert.ok(problems(bad).length, `${bad} is refused`);
  assert.match(problems('26')[0], /Start Year must be a whole number from 1000 to 9999\./);
});

const { basicPayPeriodProblems, periodsForFrequency } = await import('../src/employeePayrollBridge.js');

test('the period lists follow the payment frequency (Annex B, Dorado Basic Pay)', () => {
  assert.deepEqual(periodsForFrequency('Semi-monthly'), ['Every Payroll', 'First Half', 'Second Half']);
  assert.deepEqual(periodsForFrequency('Monthly'), ['Every Payroll']);
  assert.deepEqual(periodsForFrequency('Weekly'), ['Every Payroll']);
});

test('Start Month, Start Year and the periods are consistent with the Effectivity Date and the pay frequency', () => {
  const entry = (patch = {}) => ({ effectiveDate: '2026-01-15', startMonth: 'January', startYear: '2026', periodStart: 'Second Half', periodEnd: 'Second Half', ...patch });
  assert.deepEqual(basicPayPeriodProblems(entry(), 'Semi-monthly'), [], 'the annex example row is accepted');
  assert.match(basicPayPeriodProblems(entry({ periodStart: 'First Half' }), 'Monthly')[0], /Period Start First Half is not available for Monthly pay\. Choose Every Payroll\./);
  assert.match(basicPayPeriodProblems(entry({ startMonth: 'December', startYear: '2025' }), 'Semi-monthly')[0], /cannot be earlier than the month of the Effectivity Date/);
  assert.deepEqual(basicPayPeriodProblems(entry({ startMonth: 'January', startYear: '2026', effectiveDate: '2026-01-31' }), 'Semi-monthly'), [], 'the same month is accepted');
  assert.deepEqual(basicPayPeriodProblems(entry({ startMonth: 'February' }), 'Semi-monthly'), [], 'a later start is accepted');
  assert.match(basicPayPeriodProblems(entry({ periodStart: 'Second Half', periodEnd: 'First Half' }), 'Semi-monthly')[0], /Period End cannot be before Period Start\./);
  assert.deepEqual(basicPayPeriodProblems(entry({ periodStart: 'Every Payroll', periodEnd: 'Second Half' }), 'Semi-monthly'), []);
});

/** Annex B (Dorado Basic Pay): a raise from 100,000.00 to 120,000.00 on 08/10 inside the cut-off 08/01 to 08/15. */
const { defaultHrmData } = await import('../src/hrmData.js');
const { computeEmployeeLine } = await import('../src/payrollEngine.js');
const { buildPayrollContext } = await import('../src/payrollRuns.js');
const bridge = await import('../src/employeePayrollBridge.js');
const hrm = defaultHrmData('ABC-PH-001');
const augustRun = (patch = {}) => ({
  id: 'r1', companyId: 'default', transactionNumber: 'PR-2026-08-001', payrollType: 'Regular', paymentMode: 'Semi-monthly', year: 2026, month: 'August', frequency: 'First Half',
  periodStart: '2026-08-01', periodEnd: '2026-08-15', timekeepingStart: '2026-07-16', timekeepingEnd: '2026-07-31', payoutDate: '2026-08-15',
  config: { workDaysPerYear: 261, workHoursPerDay: 8, computeAllowableDeduction: true, statutoryAgencies: { sss: true, philhealth: true, pagibig: true, sssWisp: true }, statutorySchedule: 'Every payroll (split)', computeTax: true, computeBasicPayAdjustment: true, thirteenthMonth: { enabled: false } },
  population: { mode: 'Active/Inactive in 201', includeOnHold: false, included: [], excluded: [] }, overrides: {}, ...patch,
});
const entry = (id, amount, date) => ({ id, payType: 'Monthly', amount, workDays: '261', workHours: '8', mwe: 'No', ecola: '0', effectiveDate: date });
const lineWith = (rows, run = augustRun()) => {
  const storage = { getItem: key => (key === bridge.EMPLOYEE_PAYROLL_KEY ? JSON.stringify({ '0000112345': { basicPay: rows } }) : key.startsWith('atlas-payroll-runs-v1') ? '[]' : null), setItem() {}, removeItem() {} };
  const context = buildPayrollContext({ companyId: 'default', run, hrmData: hrm, storage, serviceConfig: {}, registers: {} });
  return computeEmployeeLine({ employee: context.employees.find(item => item.employeeId === 'EMP-1002'), transaction: run, context });
};

test('a raise inside the cut-off is paid as the old rate plus a Basic Pay Adjustment for the days from the new date', () => {
  const line = lineWith([entry(1, '100000', '2026-01-01'), entry(2, '120000', '2026-08-10')]);
  assert.equal(line.basicPay, 50000, 'the cut-off is paid at the rate in force on its first day');
  const adjustment = line.earnings.find(item => item.name === 'Basic Pay Adjustment');
  assert.equal(adjustment.amount, 4597.7, '20,000.00 x 12 / 261 x 5 working days (Aug 10 to 14)');
});

test('a raise on the first day of the cut-off, or after it, needs no adjustment', () => {
  const first = lineWith([entry(1, '100000', '2026-01-01'), entry(2, '120000', '2026-08-01')]);
  assert.equal(first.basicPay, 60000);
  assert.equal(first.earnings.some(item => item.name === 'Basic Pay Adjustment'), false);
  const later = lineWith([entry(1, '100000', '2026-01-01'), entry(2, '120000', '2026-08-16')]);
  assert.equal(later.basicPay, 50000);
  assert.equal(later.earnings.some(item => item.name === 'Basic Pay Adjustment'), false);
});

test('the Basic Pay Adjustment can be switched off for the run', () => {
  const run = augustRun();
  run.config.computeBasicPayAdjustment = false;
  const line = lineWith([entry(1, '100000', '2026-01-01'), entry(2, '120000', '2026-08-10')], run);
  assert.equal(line.earnings.some(item => item.name === 'Basic Pay Adjustment'), false);
});

test('a pay cut inside the cut-off gives a negative adjustment, so the old rate is not overpaid', () => {
  const line = lineWith([entry(1, '120000', '2026-01-01'), entry(2, '100000', '2026-08-10')]);
  assert.equal(line.basicPay, 60000);
  assert.equal(line.earnings.find(item => item.name === 'Basic Pay Adjustment').amount, -4597.7);
});
