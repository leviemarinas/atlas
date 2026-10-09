/**
 * Phase 2 completion items promised to P&A in the slide comments and asked for
 * in the Payroll Transaction review: the tax table on the line, corrections
 * after posting, the loan balance from posted payroll, the bonus ceiling split
 * and MWE income reported separately.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: index => [...store.keys()][index],
};

const { defaultHrmData } = await import('../src/hrmData.js');
const { employeeRoster } = await import('../src/employeeRoster.js');
const { runPayroll } = await import('../src/payrollEngine.js');
const { buildPayrollContext, loanPaymentHistory, newPayrollRun, payrollReport, savePayrollRun } = await import('../src/payrollRuns.js');
const { correctionProblem, markCorrectionsApplied, raiseCorrection, readCorrections, writeCorrections } = await import('../src/payrollCorrections.js');
const { splitBonusCeiling } = await import('../src/bonusCeiling.js');

const COMPANY = 'cmp-test-phase2';
const hrmData = defaultHrmData(COMPANY);
const john = employeeRoster.find(employee => employee.employeeId === 'EMP-1001');

function run(id, extra = {}) {
  const base = newPayrollRun({ companyId: COMPANY, year: 2026, month: 'August' });
  return { ...base, id, transactionNumber: id, periodStart: '2026-08-16', periodEnd: '2026-08-31', timekeepingStart: '2026-08-01', timekeepingEnd: '2026-08-15', payoutDate: '2026-08-31', ...extra };
}
const compute = transaction => runPayroll({ transaction, context: buildPayrollContext({ companyId: COMPANY, run: transaction, hrmData }) });

test('each line names the tax table version it used, and every table version it read', () => {
  const line = compute(run('PR-T1')).lines.find(entry => entry.employeeId === john.employeeId);
  assert.match(line.taxTable.code, /-\d{4}-\d{3}$/);
  assert.equal(line.taxTable.effectiveDate.slice(0, 4), '2026');
  assert.ok(line.tablesUsed.sss.code && line.tablesUsed.philhealth.code && line.tablesUsed.pagibig.code);
  assert.match(line.rounding, /2 decimals/);
});

test('a correction to a posted run is carried into the next run as an adjustment, and is applied when that run posts', () => {
  store.clear();
  const posted = { ...run('PR-POSTED'), status: 'Posted' };
  posted.result = compute(posted);
  const line = posted.result.lines.find(entry => entry.employeeId === john.employeeId);
  assert.match(correctionProblem({ run: { status: 'Open' }, amount: 10, item: 'x', reason: 'y' }), /posted or locked/);
  const pay = raiseCorrection([], { run: posted, line, item: 'Unpaid overtime', amount: 1500, taxable: true, reason: 'OT approved late', actor: 'John Doe (Client Admin)' });
  const recover = raiseCorrection(pay.corrections, { run: posted, line, item: 'Overpaid allowance', amount: -400, reason: 'Allowance paid twice', actor: 'John Doe (Client Admin)' });
  writeCorrections(COMPANY, recover.corrections);

  const next = run('PR-NEXT', { periodStart: '2026-09-01', periodEnd: '2026-09-15', payoutDate: '2026-09-15', frequency: 'First Half' });
  const nextLine = compute(next).lines.find(entry => entry.employeeId === john.employeeId);
  const adjustment = nextLine.earnings.find(item => item.correctionId === pay.correction.id);
  assert.equal(adjustment.amount, 1500);
  assert.match(adjustment.name, /Adjustment for PR-POSTED \(2026-08-16 to 2026-08-31\)/);
  assert.ok(nextLine.deductions.some(item => item.correctionId === recover.correction.id && item.deducted === 400));
  assert.equal(nextLine.corrections.length, 2);

  const applied = markCorrectionsApplied(readCorrections(COMPANY), nextLine.corrections, 'PR-NEXT');
  assert.ok(applied.every(item => item.status === 'Applied' && item.appliedTo === 'PR-NEXT'));
  writeCorrections(COMPANY, applied);
  const after = compute(run('PR-LATER', { payoutDate: '2026-09-30' })).lines.find(entry => entry.employeeId === john.employeeId);
  assert.equal(after.corrections.length, 0, 'an applied correction is not paid twice');
});

test('a loan balance is reduced by what posted payroll collected, and the payment matrix lists each payout', () => {
  store.clear();
  const withLoan = { ...hrmData, loanInquiries: [{ id: 'LN-T', transactionNumber: 'LN-T', employeeId: john.employeeId, loanName: 'Company Loan T', loanType: 'Company Loan', status: 'ACTIVE', balance: 10000, deductionAmount: 1000, authorityToDeduct: { acknowledged: true } }] };
  const computeWith = transaction => runPayroll({ transaction, context: buildPayrollContext({ companyId: COMPANY, run: transaction, hrmData: withLoan }) });
  const loan = computeWith(run('PR-L1')).lines.find(line => line.employeeId === john.employeeId).loans.find(item => item.code === 'LN-T');
  assert.equal(loan.deducted, 1000);
  const first = { ...run('PR-L1'), status: 'Posted', result: computeWith(run('PR-L1')) };
  savePayrollRun(COMPANY, first);
  const second = run('PR-L2', { periodStart: '2026-09-01', periodEnd: '2026-09-15', payoutDate: '2026-09-15' });
  const context = buildPayrollContext({ companyId: COMPANY, run: second, hrmData: withLoan });
  assert.equal(context.loanSchedules[0].balance, 9000, 'the second payroll starts from 10,000 less the 1,000 posted');
  const history = loanPaymentHistory([first], loan.code);
  assert.equal(history.rows.length, 1);
  assert.equal(history.paid, loan.deducted);
  assert.equal(history.rows[0].transactionNumber, 'PR-L1');
});

test('MWE compensation is reported separately on the 1601-C schedule and the alphalist', () => {
  const mweEmployee = employeeRoster.find(employee => employee.payroll.mwe === 'Yes');
  const transaction = run('PR-MWE', { population: { ...newPayrollRun({ companyId: COMPANY }).population, includeOnHold: true } });
  const result = compute(transaction);
  const line = result.lines.find(entry => entry.employeeId === mweEmployee.employeeId);
  assert.equal(line.mwe, true);
  assert.ok(line.mweIncome >= line.basicPay);
  const context = buildPayrollContext({ companyId: COMPANY, run: transaction, hrmData });
  const taxRow = payrollReport('tax').build(result, context).find(row => row.key === mweEmployee.employeeId);
  assert.equal(taxRow.mwe, 'Yes');
  const alphalist = payrollReport('alphalist-annual').build(result, context).find(row => row.key === mweEmployee.employeeId);
  assert.equal(alphalist.schedule, 'Schedule 2 (MWE)');
  assert.equal(alphalist.mweDailyRate, line.rates.dailyRate);
});

test('bonuses use the 90,000 ceiling first, in effectivity order, per employee and year', () => {
  const rows = splitBonusCeiling([
    { code: 'B2', employee: 'A', amount: '50000', effectiveDate: '2026-12-01', status: 'Active' },
    { code: 'B1', employee: 'A', amount: '60000', effectiveDate: '2026-06-01', status: 'Active' },
    { code: 'B3', employee: 'B', amount: '20000', effectiveDate: '2026-12-01', status: 'Active' },
  ]);
  const byCode = Object.fromEntries(rows.map(row => [row.code, row]));
  assert.deepEqual([byCode.B1.nonTaxableAmount, byCode.B1.taxableAmount], ['60000', '0']);
  assert.deepEqual([byCode.B2.nonTaxableAmount, byCode.B2.taxableAmount], ['30000', '20000']);
  assert.deepEqual([byCode.B3.nonTaxableAmount, byCode.B3.taxableAmount], ['20000', '0']);
});
