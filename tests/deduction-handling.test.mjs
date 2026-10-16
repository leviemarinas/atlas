import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, length: 0, key: () => null };
const { applyTakeHomePolicy, collectionItemsFor } = await import('../src/payrollEngine.js');

/**
 * The "Insufficient Net Pay Handling" a deduction or loan is set up with decides what happens on a payroll line
 * when net pay would fall below the protected minimum: Deduct in Full is never adjusted, Defer Balance is
 * deferred whole, Partial Deduction gives up only what is needed.
 */
const employee = { code: '0011223345', employeeId: 'EMP-1001' };
const transaction = { paymentMode: 'Semi-monthly', frequency: 'Second Half', periodStart: '2025-11-16', periodEnd: '2025-11-30', payoutDate: '2025-11-30' };
const items = hierarchy => collectionItemsFor({
  salary: { companyDeductions: [{ deductionName: 'Uniform', amountOfDeduction: 500, totalBalance: 5000 }, { deductionName: 'Cooperative Dues', amountOfDeduction: 750, totalBalance: 9000 }] },
  transaction, employee, hierarchy,
});
const policy = { enabled: true, autoDefer: true, thresholdType: 'Fixed Amount', threshold: 1000, priorityChoice: 'Take-Home Pay' };
const apply = list => applyTakeHomePolicy({ policy, items: list, gross: 2500, statutory: 500, protectedBase: 2500 });

test('a line carries the handling its setup names', () => {
  const list = items([{ name: 'Uniform', rank: 21, group: 'Deduction', canAdjust: false, treatment: 'Deduct in Full' }, { name: 'Cooperative Dues', rank: 22, group: 'Deduction', canAdjust: true, treatment: 'Defer Balance' }]);
  assert.deepEqual(list.map(item => [item.name, item.canAdjust, item.treatment]), [['Uniform', false, 'Deduct in Full'], ['Cooperative Dues', true, 'Defer Balance']]);
});

test('an item not in the hierarchy can be adjusted and gives up only what is needed', () => {
  const list = items([]);
  assert.ok(list.every(item => item.canAdjust === true && item.treatment === 'Partial Deduction'));
});

test('Deduct in Full is never deferred', () => {
  const list = items([{ name: 'Uniform', rank: 21, group: 'Deduction', canAdjust: false, treatment: 'Deduct in Full' }, { name: 'Cooperative Dues', rank: 22, group: 'Deduction', canAdjust: true, treatment: 'Partial Deduction' }]);
  const result = apply(list);
  const byName = Object.fromEntries(result.items.map(item => [item.name, item]));
  assert.equal(byName.Uniform.deducted, 500);
  assert.equal(byName.Uniform.deferred, 0);
  // 2,500 - 500 statutory - 1,250 due = 750 is below the 1,000 minimum, so 250 is deferred from the adjustable item.
  assert.equal(byName['Cooperative Dues'].deferred, 250);
  assert.equal(result.netPay, 1000);
});

test('Defer Balance moves the whole instalment, not only the shortfall', () => {
  const list = items([{ name: 'Uniform', rank: 21, group: 'Deduction', canAdjust: true, treatment: 'Partial Deduction' }, { name: 'Cooperative Dues', rank: 22, group: 'Deduction', canAdjust: true, treatment: 'Defer Balance' }]);
  const result = apply(list);
  const byName = Object.fromEntries(result.items.map(item => [item.name, item]));
  assert.equal(byName.Uniform.deferred, 250, 'rank 21 is adjusted first and gives up the 250 it needs to');
  assert.equal(result.netPay, 1000);
  const whole = apply(items([{ name: 'Uniform', rank: 21, group: 'Deduction', canAdjust: true, treatment: 'Defer Balance' }, { name: 'Cooperative Dues', rank: 22, group: 'Deduction', canAdjust: true, treatment: 'Partial Deduction' }]));
  const first = Object.fromEntries(whole.items.map(item => [item.name, item])).Uniform;
  assert.equal(first.deducted, 0, 'the whole 500 is deferred');
  assert.equal(first.deferred, 500);
  assert.equal(whole.netPay, 1250);
});

test('when every adjustable item has been deferred and the minimum is still missed, an exception is raised', () => {
  const list = items([{ name: 'Uniform', rank: 21, group: 'Deduction', canAdjust: false, treatment: 'Deduct in Full' }, { name: 'Cooperative Dues', rank: 22, group: 'Deduction', canAdjust: false, treatment: 'Deduct in Full' }]);
  const result = apply(list);
  assert.equal(result.deferred, 0);
  assert.equal(result.exception, true);
  assert.equal(result.shortfall, 250);
});

test('a posted payroll moves the balance of a company deduction, so it stops when it is settled', async () => {
  const { buildPayrollContext } = await import('../src/payrollRuns.js');
  const hrm = { salaryInformation: [{ employeeId: 'EMP-1001', companyDeductions: [{ deductionName: 'Uniform', amountOfDeduction: 500, totalBalance: 1200 }] }], loanInquiries: [] };
  const run = { id: 'r2', payoutDate: '2025-12-15' };
  const posted = (id, deducted, status = 'Posted', payoutDate = '2025-11-30') => ({ id, status, payoutDate, result: { lines: [{ employeeId: 'EMP-1001', deductions: [{ code: 'DED-UNIFOR', deducted, source: 'Employee salary record' }], loans: [] }] } });
  const store = runs => ({ getItem: key => (key.startsWith('atlas-payroll-runs-v1') ? JSON.stringify(runs) : null), setItem() {}, removeItem() {} });
  const balance = runs => buildPayrollContext({ companyId: 'default', run, hrmData: hrm, storage: store(runs) }).salaryInformation[0].companyDeductions[0].totalBalance;
  assert.equal(balance([]), 1200, 'nothing posted yet');
  assert.equal(balance([posted('r1', 500)]), 700);
  assert.equal(balance([posted('r1', 500), posted('r0', 500, 'Posted', '2025-11-15')]), 200);
  assert.equal(balance([posted('r1', 1200)]), 0);
  assert.equal(balance([posted('r1', 1500)]), 0, 'never below zero');
  assert.equal(balance([posted('r1', 500, 'Open')]), 1200, 'only a posted or locked run counts');
  assert.equal(balance([posted('r1', 500, 'Posted', '2026-01-15')]), 1200, 'a payroll paid after this one does not count');
});
