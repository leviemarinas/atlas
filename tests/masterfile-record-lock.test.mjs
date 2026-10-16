import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, length: 0, key: () => null };
const { recordUsage } = await import('../src/employeePayrollBridge.js');

/** Slides 15, 21, 24 and 26: a record a payroll has used cannot be edited or deleted. */
const run = (number, status, periodEnd, items) => ({ transactionNumber: number, status, periodEnd, payoutDate: periodEnd, items });

test('an earning is used by the runs whose line names it', () => {
  const rows = [{ id: 1, name: 'Rice Subsidy', effectiveDate: '2026-01-01' }, { id: 2, name: 'Meal Allowance', effectiveDate: '2026-01-01' }];
  const used = recordUsage('earnings', rows, [run('PR-1', 'Posted', '2026-08-15', { earnings: ['Rice Subsidy'] })]);
  assert.deepEqual(used.get(1), ['PR-1']);
  assert.equal(used.has(2), false);
});

test('a cancelled run and a run before the record started do not count', () => {
  const rows = [{ id: 1, name: 'Performance Bonus', effectiveDate: '2026-09-01' }];
  assert.equal(recordUsage('bonuses', rows, [run('PR-2', 'Cancelled', '2026-10-15', { bonuses: ['Performance Bonus'] })]).size, 0);
  assert.equal(recordUsage('bonuses', rows, [run('PR-3', 'Posted', '2026-08-15', { bonuses: ['Performance Bonus'] })]).size, 0, 'the record started after that period');
  assert.deepEqual(recordUsage('bonuses', rows, [run('PR-4', 'Open', '2026-09-15', { bonuses: ['Performance Bonus'] })]).get(1), ['PR-4']);
});

test('deductions and loans are matched by name and by loan reference', () => {
  assert.deepEqual(recordUsage('deductions', [{ id: 7, name: 'Cooperative Dues', startDate: '2026-01-01' }], [run('PR-5', 'Posted', '2026-02-15', { deductions: ['Cooperative Dues'] })]).get(7), ['PR-5']);
  assert.deepEqual(recordUsage('loans', [{ id: 9, payItem: 'SSS Salary Loan', startDate: '2026-01-01' }], [run('PR-6', 'Posted', '2026-02-15', { loans: ['SSS Salary Loan'] })]).get(9), ['PR-6']);
  assert.equal(recordUsage('loans', [{ id: 9, payItem: 'Company Salary Loan', startDate: '2026-01-01' }], [run('PR-6', 'Posted', '2026-02-15', { loans: ['SSS Salary Loan'] })]).size, 0);
});

test('a section the slides do not lock has no usage', () => {
  assert.equal(recordUsage('statutory', [{ id: 1 }], [run('PR-7', 'Posted', '2026-02-15', {})]).size, 0);
});
