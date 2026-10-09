/**
 * Phase 2 controls: the upload error log, the employee change audit, ECOLA
 * treatment, bonus ceiling order, policy engine versions, deferral tracking
 * and per-loan final pay treatment.
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

const { errorLogCsv } = await import('../src/uploadErrorLog.js');
const { logEmployeeChange, readEmployeeChanges, recordChanges } = await import('../src/employeeChangeLog.js');
const { activateEngineVersion, engineValuesAsOf, readEngineVersions, recordEngineVersion } = await import('../src/policyEngineVersions.js');
const { defaultHrmData } = await import('../src/hrmData.js');
const { employeeRoster } = await import('../src/employeeRoster.js');
const { runPayroll } = await import('../src/payrollEngine.js');
const { buildPayrollContext, deferralHistory, newPayrollRun } = await import('../src/payrollRuns.js');

const COMPANY = 'cmp-test-controls';
const hrmData = defaultHrmData(COMPANY);
const run = (id, extra = {}) => ({ ...newPayrollRun({ companyId: COMPANY, year: 2026, month: 'August' }), id, transactionNumber: id, periodStart: '2026-08-16', periodEnd: '2026-08-31', timekeepingStart: '2026-08-01', timekeepingEnd: '2026-08-15', payoutDate: '2026-08-31', ...extra });
const compute = transaction => runPayroll({ transaction, context: buildPayrollContext({ companyId: COMPANY, run: transaction, hrmData }) });

test('the upload error log lists row, field, rejected value and reason, quoting commas and quotes', () => {
  const csv = errorLogCsv([{ row: 3, field: 'Amount', value: '1,000"x', reason: 'Must be a number.' }, 'The file has no data rows.']);
  const lines = csv.split('\n');
  assert.equal(lines[0], '"Row","Field","Rejected value","Reason"');
  assert.equal(lines[1], '"3","Amount","1,000""x","Must be a number."');
  assert.equal(lines[2], '"—","","","The file has no data rows."');
});

test('an employee pay change is logged with the fields changed, who changed them and why', () => {
  store.clear();
  const fields = [['amount', 'Earning Amount', 'number'], ['code', 'Earning Code', 'computed'], ['frequency', 'Frequency', 'select']];
  const changes = recordChanges(fields, { amount: '1000', code: 'A', frequency: 'Monthly' }, { amount: '1500', code: 'B', frequency: 'Monthly' });
  assert.deepEqual(changes, [{ field: 'amount', label: 'Earning Amount', from: '1000', to: '1500' }], 'computed fields are not reported as edits');
  logEmployeeChange({ employeeId: 'EMP-1', section: 'earnings', action: 'Changed', item: 'Rice Subsidy', reason: 'Approved increase', changes, actor: 'John Doe (Client Admin)' });
  logEmployeeChange({ employeeId: 'EMP-1', section: 'loans', action: 'Deleted', item: 'Salary Loan', reason: 'Paid off', actor: 'John Doe (Client Admin)' });
  assert.equal(readEmployeeChanges('EMP-1', 'earnings').length, 1);
  assert.equal(readEmployeeChanges('EMP-1').length, 2);
  assert.equal(readEmployeeChanges('EMP-1', 'earnings')[0].reason, 'Approved increase');
});

test('ECOLA is part of basic pay by default, or its own non-taxable earning when the company says so', () => {
  store.clear();
  const mwe = employeeRoster.find(employee => employee.payroll.mwe === 'Yes' && Number(employee.payroll.ecolaPerDay) > 0);
  assert.ok(mwe, 'the sample roster has an MWE with ECOLA');
  const population = { ...newPayrollRun({ companyId: COMPANY }).population, includeOnHold: true };
  const draft = run('PR-E1', { population });
  const base = { ...draft, config: { ...draft.config, daysInPeriod: 11 } };
  const inBasic = compute(base).lines.find(line => line.employeeId === mwe.employeeId);
  const separate = compute({ ...base, config: { ...base.config, ecolaTreatment: 'Separate earning' } }).lines.find(line => line.employeeId === mwe.employeeId);
  const ecola = separate.earnings.find(item => item.code === 'ECOLA');
  assert.ok(ecola && ecola.amount > 0);
  assert.equal(inBasic.earnings.some(item => item.code === 'ECOLA'), false);
  assert.equal(Math.round((inBasic.basicPay - separate.basicPay) * 100) / 100, ecola.amount);
  assert.equal(inBasic.grossPay, separate.grossPay, 'only the presentation changes, not the pay');
});

test('the bonus ceiling order decides which bonus stays non-taxable first', () => {
  store.clear();
  const base = run('PR-B1');
  const thirteenth = { enabled: true, basis: 'Custom / uploaded value', bonusTypes: ['13th Month Pay', 'Performance Bonus'], ntThreshold: 50000 };
  const bonuses = [{ name: '13th Month Pay', amount: 40000 }, { name: 'Performance Bonus', amount: 30000 }];
  const computeWith = order => {
    const transaction = { ...base, config: { ...base.config, thirteenthMonth: thirteenth, bonusCeilingOrder: order }, overrides: { 'EMP-1001': { bonuses } } };
    return runPayroll({ transaction, context: buildPayrollContext({ companyId: COMPANY, run: transaction, hrmData }) }).lines.find(entry => entry.employeeId === 'EMP-1001');
  };
  const first = computeWith(['13th Month Pay', 'Performance Bonus']);
  const reversed = computeWith(['Performance Bonus', '13th Month Pay']);
  assert.equal(first.bonuses.length, 2);
  const taxableOf = (line, name) => line.bonuses.find(item => item.name === name)?.taxable ?? 0;
  assert.equal(taxableOf(first, '13th Month Pay'), 0);
  assert.equal(taxableOf(reversed, 'Performance Bonus'), 0);
  assert.ok(taxableOf(reversed, '13th Month Pay') > 0);
});

test('policy engine versions: draft is not used, a future version is scheduled, a backdated run reads the version then in force', () => {
  store.clear();
  recordEngineVersion(COMPANY, 'takeHome', { values: { threshold: 30 }, effectiveDate: '2026-01-01', by: 'P&A', reason: 'Initial' });
  recordEngineVersion(COMPANY, 'takeHome', { values: { threshold: 40 }, mode: 'draft', by: 'P&A', reason: 'Proposal' });
  const scheduled = recordEngineVersion(COMPANY, 'takeHome', { values: { threshold: 50 }, effectiveDate: '2099-01-01', by: 'P&A', reason: 'Next year' });
  assert.equal(scheduled.status, 'Scheduled');
  const all = readEngineVersions(COMPANY);
  assert.equal(engineValuesAsOf(all, 'takeHome', '2026-06-30').values.threshold, 30);
  assert.equal(engineValuesAsOf(all, 'takeHome', '2099-02-01').values.threshold, 50);
  const activated = activateEngineVersion(COMPANY, 'takeHome', '2.0', { effectiveDate: '2026-07-01', by: 'P&A' });
  assert.equal(activated.status, 'Active');
  const after = readEngineVersions(COMPANY);
  assert.equal(after.takeHome.find(item => item.version === '1.0').status, 'Superseded');
  assert.equal(engineValuesAsOf(after, 'takeHome', '2026-06-30').values.threshold, 30, 'a June run still reads v1.0');
  assert.equal(engineValuesAsOf(after, 'takeHome', '2026-07-15').values.threshold, 40);
});

test('deferral history counts how often an item was deferred, when last and its original due date', () => {
  const posted = (id, payoutDate, deferred) => ({ id, transactionNumber: id, status: 'Posted', payoutDate, periodStart: `${payoutDate.slice(0, 8)}01`, periodEnd: payoutDate, result: { lines: [{ employeeId: 'EMP-1', deferred }] } });
  const runs = [
    posted('PR-1', '2026-07-15', [{ code: 'HMO', deferredAmount: 500 }]),
    posted('PR-2', '2026-07-31', [{ code: 'HMO', deferredAmount: 300 }]),
    posted('PR-3', '2026-08-15', []),
  ];
  const history = deferralHistory(runs, { id: 'PR-4', payoutDate: '2026-08-31' })['EMP-1|HMO'];
  assert.equal(history.times, 2);
  assert.equal(history.total, 800);
  assert.equal(history.originalDueDate, '2026-07-15');
  assert.equal(history.lastTransaction, 'PR-2');
});
