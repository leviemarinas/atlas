import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, length: 0, key: () => null };
const { defaultHrmData } = await import('../src/hrmData.js');
const { employeeRoster, findRosterEmployee, YTD_AS_OF } = await import('../src/employeeRoster.js');
const { computeEmployeeLine } = await import('../src/payrollEngine.js');
const { buildPayrollContext } = await import('../src/payrollRuns.js');
const bridge = await import('../src/employeePayrollBridge.js');

/**
 * Employee Masterfile › Payroll & Allocation: Statutory Deductions and Shares, HDMF Contribution, Payroll Records (YTD)
 * and Previous Employer Data. What is entered there replaces what the roster holds; an employee nobody edited is paid as before.
 */
const hrm = defaultHrmData('ABC-PH-001');
const run = (patch = {}, config = {}) => ({
  id: 'r1', companyId: 'default', transactionNumber: 'PR-2025-11-001', payrollType: 'Regular', paymentMode: 'Semi-monthly', year: 2025, month: 'November', frequency: 'Second Half',
  periodStart: '2025-11-16', periodEnd: '2025-11-30', timekeepingStart: '2025-11-01', timekeepingEnd: '2025-11-15', payoutDate: '2025-11-30',
  config: { workDaysPerYear: 261, workHoursPerDay: 8, computeAllowableDeduction: true, statutoryAgencies: { sss: true, philhealth: true, pagibig: true, sssWisp: true }, statutorySchedule: 'Every payroll (split)', computeTax: true, thirteenthMonth: { enabled: false }, ...config },
  population: { mode: 'Active/Inactive in 201', includeOnHold: false, included: [], excluded: [] }, overrides: {}, ...patch,
});
const storageWith = store => ({ getItem: key => (key === bridge.EMPLOYEE_PAYROLL_KEY ? JSON.stringify(store) : key.startsWith('atlas-payroll-runs-v1') ? '[]' : null), setItem() {}, removeItem() {} });
const contextFor = (store, r) => buildPayrollContext({ companyId: 'default', run: r, hrmData: hrm, storage: storageWith(store), serviceConfig: {}, registers: {} });
const lineFor = (employeeId, store = {}, r = run()) => {
  const context = contextFor(store, r);
  return computeEmployeeLine({ employee: context.employees.find(item => item.employeeId === employeeId), transaction: r, context });
};
const ethan = findRosterEmployee('EMP-1002');
const only = (rows, key) => ({ [ethan.code]: { [key]: rows } });
const sss = (patch = {}) => ({ id: 1, statutoryCode: 'SSS', frequency: 'Every Payroll', effectiveDate: '2025-01-01', employee: '1000', employer: '2000', ...patch });
const bonusRun = (types = ['Performance Bonus']) => run({}, { thirteenthMonth: { enabled: true, basis: 'Pre-defined (Computational Basis)', ntThreshold: 90000, bonusTypes: types } });

test('rows the Masterfile shows for these sections, once stored, change nobody\'s pay', () => {
  for (const person of employeeRoster) {
    const store = { [person.code]: bridge.masterfileRowsFromRoster(person, YTD_AS_OF) };
    const base = lineFor(person.employeeId);
    const stored = lineFor(person.employeeId, store);
    for (const key of ['basicPay', 'grossPay', 'taxableIncome', 'withholdingTax', 'netPay', 'totalDeductions']) assert.equal(stored[key], base[key], `${person.name} ${key}`);
    assert.deepEqual(stored.statutory, base.statutory, `${person.name} contributions`);
  }
});

test('a Statutory entry replaces the table for that agency and respects the cut-off', () => {
  const split = lineFor('EMP-1002', only([sss()], 'statutory'));
  assert.equal(split.statutory.sssEmployee, 500, 'Every Payroll takes the run\'s share (half) of the month\'s 1,000.00');
  assert.equal(split.statutory.sssEmployer, 1000 + split.statutory.ec - split.statutory.ec);
  assert.equal(lineFor('EMP-1002', only([sss({ frequency: 'Second Half' })], 'statutory')).statutory.sssEmployee, 1000, 'collected in full in the second half');
  const firstRun = run({ frequency: 'First Half', periodStart: '2025-11-01', periodEnd: '2025-11-15', payoutDate: '2025-11-15', timekeepingStart: '2025-10-16', timekeepingEnd: '2025-10-31' });
  assert.equal(lineFor('EMP-1002', only([sss({ frequency: 'Second Half' })], 'statutory'), firstRun).statutory.sssEmployee, 0, 'not in the first half');
  assert.equal(lineFor('EMP-1002', only([sss({ frequency: 'First Half' })], 'statutory'), firstRun).statutory.sssEmployee, 1000, 'in full in the first half');
  assert.equal(lineFor('EMP-1002', only([sss({ frequency: 'Monthly' })], 'statutory'), firstRun).statutory.sssEmployee, 0, 'Monthly is collected in the last cut-off');
});

test('a Statutory entry counts only inside its dates and until its hold date', () => {
  const sssOf = patch => lineFor('EMP-1002', only([sss(patch)], 'statutory')).statutory.sssEmployee;
  const table = lineFor('EMP-1002').statutory.sssEmployee;
  assert.equal(sssOf({ effectiveDate: '2025-11-30' }), 500, 'effective on the payout date');
  assert.equal(sssOf({ effectiveDate: '2025-12-01' }), table, 'effective after the payout date: the table');
  assert.equal(sssOf({ endDate: '2025-11-29' }), table, 'ended the day before');
  assert.equal(sssOf({ endDate: '2025-11-30' }), 500, 'ends on the payout date');
  assert.equal(sssOf({ holdDate: '2025-11-30' }), 0, 'on hold from the period end');
  assert.equal(sssOf({ holdDate: '2025-12-01' }), 500, 'on hold from the day after');
  assert.equal(sssOf({ employee: '', employer: '2000' }), table, 'a blank employee amount leaves the table\'s');
});

test('the 201 setting and the run\'s switches still decide whether an agency is computed', () => {
  const olivia = findRosterEmployee('EMP-1006');
  const entry = { [olivia.code]: { statutory: [{ id: 1, statutoryCode: 'HDMF', frequency: 'Every Payroll', effectiveDate: '2025-01-01', employee: '300', employer: '300' }] } };
  assert.equal(lineFor('EMP-1006', entry).statutory.hdmfEmployee, 0, 'Pag-IBIG is excluded in the 201 file');
  const off = run({}, { statutoryAgencies: { sss: false, philhealth: true, pagibig: true, sssWisp: true } });
  assert.equal(lineFor('EMP-1002', only([sss()], 'statutory'), off).statutory.sssEmployee, 0, 'SSS is off for the run');
});

test('an HDMF entry sets the voluntary share and the employer share, and a hold date stops it', () => {
  const hdmf = (patch = {}) => ({ id: 1, effectiveDate: '2025-01-01', holdDate: '', employee: '500', employer: '200', ...patch });
  const base = lineFor('EMP-1002');
  const more = lineFor('EMP-1002', only([hdmf({ employee: '1000' })], 'hdmf'));
  assert.equal(Math.round((base.netPay - more.netPay) * 100) / 100, 400, 'the 800.00 above the 200.00 mandatory share, half in a split run');
  assert.equal(lineFor('EMP-1002', only([hdmf({ employer: '350' })], 'hdmf')).statutory.hdmfEmployer, 175, 'the employer\'s amount, half in a split run');
  const held = lineFor('EMP-1002', only([hdmf({ holdDate: '2025-11-30' })], 'hdmf'));
  assert.equal(held.statutory.hdmfEmployee, 0);
  assert.equal(held.statutory.hdmfEmployer, 0);
  assert.ok(held.exceptions.some(item => /on hold from 2025-11-30 in the Employee Masterfile/.test(item.message)));
  assert.ok(lineFor('EMP-1002', only([hdmf({ holdDate: '2025-12-01' })], 'hdmf')).statutory.hdmfEmployee > 0, 'on hold from the day after');
});

test('Payroll Records (YTD) replace the opening balances for the payout year, and posted payrolls are added on top', () => {
  const row = { id: 1, year: '2025', basicPay: '300000', taxableIncome: '320000', nonTaxableBonus: '25000', deMinimis: '10000', otherNonTaxable: '5000', taxWithheld: '40000' };
  const ytd = contextFor(only([row], 'ytd'), run()).employees.find(item => item.employeeId === 'EMP-1002').ytd;
  assert.equal(ytd.basicEarnings, 300000);
  assert.equal(ytd.taxableEarnings, 320000);
  assert.equal(ytd.bonusPaid, 25000);
  assert.equal(ytd.deMinimisPaid, 10000);
  assert.equal(ytd.nonTaxableEarnings, 40000);
  assert.equal(ytd.taxWithheld, 40000);
  assert.deepEqual(bridge.ytdFromRows([row], { sss: 7 }, { basicEarnings: 100, taxWithheld: 5 }, '2025').basicEarnings, 300100);
  assert.equal(bridge.ytdFromRows([row], { sss: 7 }, {}, '2025').sss, 7, 'the contributions the roster holds are kept');
  const other = contextFor(only([{ ...row, year: '2024' }], 'ytd'), run()).employees.find(item => item.employeeId === 'EMP-1002').ytd;
  assert.equal(other.basicEarnings, ethan.ytd.basicEarnings, 'a row for another year is not used');
});

test('bonuses already paid this year, from Payroll Records (YTD), use up the non-taxable ceiling', () => {
  const bonus = { id: 1, name: 'Performance Bonus', amount: '20000', effectiveDate: '2025-01-01' };
  const store = patch => ({ [ethan.code]: { bonuses: [bonus], ...patch } });
  const fresh = lineFor('EMP-1002', store({}), bonusRun());
  assert.equal(fresh.bonuses[0].taxable, 0);
  const used = lineFor('EMP-1002', store({ ytd: [{ id: 1, year: '2025', nonTaxableBonus: '90000' }] }), bonusRun());
  assert.equal(used.bonuses[0].taxable, 20000, 'the ceiling is used up');
  const partly = lineFor('EMP-1002', store({ ytd: [{ id: 1, year: '2025', nonTaxableBonus: '80000' }] }), bonusRun());
  assert.equal(partly.bonuses[0].nonTaxable, 10000);
  assert.equal(partly.bonuses[0].taxable, 10000);
});

test('Previous Employer Data counts for the payout year and feeds the bonus ceiling', () => {
  const prev = (patch = {}) => ({ id: 1, hasPreviousBalance: 'Yes', employerName: 'ABC Company', tin: '123', startDate: '2025-01-01', endDate: '2025-06-30', basicPay: '200000', taxableBonus: '0', otherTaxable: '0', grossTaxable: '200000', nonTaxableBonus: '50000', taxWithheld: '12000', ...patch });
  const from = rows => bridge.previousEmployerFromRows(rows, '2025');
  assert.equal(from([prev()]).grossTaxableIncome, 200000);
  assert.equal(from([prev({ hasPreviousBalance: 'No' })]), null, 'no balance');
  assert.equal(from([prev({ endDate: '2024-12-31' })]), null, 'ended in another year');
  assert.equal(from([prev({ grossTaxable: '' })]).grossTaxableIncome, 200000, 'blank gross is basic + bonus + other taxable');
  const two = from([prev(), prev({ id: 2, employerName: 'XYZ', basicPay: '100000', grossTaxable: '100000', nonTaxableBonus: '10000', taxWithheld: '3000' })]);
  assert.equal(two.grossTaxableIncome, 300000);
  assert.equal(two.nontaxableBonus, 60000);
  assert.equal(two.taxWithheld, 15000);
  const bonus = { id: 1, name: 'Performance Bonus', amount: '50000', effectiveDate: '2025-01-01' };
  const line = lineFor('EMP-1002', { [ethan.code]: { bonuses: [bonus], previousEmployer: [prev({ nonTaxableBonus: '70000' })] } }, bonusRun());
  assert.equal(line.bonuses[0].nonTaxable, 20000, '90,000.00 less the 70,000.00 the previous employer paid');
  assert.equal(line.bonuses[0].taxable, 30000);
  const cleared = contextFor({ [findRosterEmployee('EMP-1005').code]: { previousEmployer: [] } }, run()).employees.find(item => item.employeeId === 'EMP-1005');
  assert.equal(cleared.previousEmployer, null, 'deleting every row clears it');
});
