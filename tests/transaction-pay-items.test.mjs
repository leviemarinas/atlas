/**
 * Changing pay items inside one payroll transaction: leaving an earning,
 * bonus, deduction or loan out of the run, or paying a different amount for
 * one employee, this run only — and overriding the take-home policy the same
 * way. Setup and the registers are never touched.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultHrmData } from '../src/hrmData.js';
import { employeeRoster } from '../src/employeeRoster.js';
import { adjustPayItems, payItemKey, runPayroll, takeHomePolicyForLine } from '../src/payrollEngine.js';
import { buildPayrollContext, newPayrollRun } from '../src/payrollRuns.js';

const COMPANY = 'ABC-PH-001';

function transaction(extra = {}) {
  const run = newPayrollRun({ companyId: COMPANY, year: 2026, month: 'August' });
  return {
    ...run,
    periodStart: '2026-08-16', periodEnd: '2026-08-31',
    timekeepingStart: '2026-08-01', timekeepingEnd: '2026-08-15', payoutDate: '2026-08-31',
    ...extra,
    config: { ...run.config, ...(extra.config || {}) },
  };
}
const employee = employeeRoster[0];
// Register rows in the shape Earning and Deduction Management store them.
const registers = {
  earnings: [{ code: 'ERN-TRN', name: 'Transportation Allowance', employee: `${employee.code} - ${employee.name}`, amount: 2000, frequency: 'Semi-monthly', basis: 'Fixed Amount', status: 'Active', effectiveDate: '2026-01-01' }],
  deductions: [{ code: 'DED-HMO', name: 'HMO Dependent', employee: `${employee.code} - ${employee.name}`, amount: 800, balance: 4000, status: 'Active' }],
  bonuses: [], payCodes: [],
};
const compute = run => {
  const context = buildPayrollContext({ companyId: COMPANY, run, hrmData: defaultHrmData(COMPANY) });
  return runPayroll({ transaction: run, context: { ...context, registers } });
};

test('adjustPayItems skips, changes and caps items, and leaves encoded ones alone', () => {
  const items = [
    { code: 'LN-1', name: 'Company loan', due: 1000, outstanding: 1500 },
    { code: 'HMO', name: 'HMO', due: 500, outstanding: 0 },
    { code: 'MAN', name: 'Typed', due: 50, source: 'Encoded on the transaction' },
  ];
  const { items: kept, adjustments } = adjustPayItems(items, 'Deduction', {
    amountField: 'due',
    excluded: ['Deduction:HMO'],
    changes: { 'Deduction:LN-1': { amount: 2000, reason: 'Pay off early' } },
  });
  assert.deepEqual(kept.map(item => [item.code, item.due]), [['LN-1', 1500], ['MAN', 50]]);
  assert.equal(kept[0].computedAmount, 1000);
  const byKey = Object.fromEntries(adjustments.map(change => [change.key, change]));
  assert.equal(byKey['Deduction:HMO'].scope, 'run');
  assert.ok(byKey['Deduction:HMO'].excluded);
  assert.equal(byKey['Deduction:LN-1'].capped, true);
  assert.equal(byKey['Deduction:LN-1'].reason, 'Pay off early');
  assert.equal(payItemKey('Earning', { code: '', name: 'Rice Subsidy' }), 'Earning:Rice Subsidy');
});

test('a run can leave an earning out for everyone, and one employee can be paid a different amount', () => {
  const base = compute(transaction());
  const line = base.lines.find(item => item.employeeId === employee.employeeId);
  const earning = line.earnings.find(item => item.key === 'Earning:ERN-TRN');
  assert.equal(earning.amount, 2000);

  const excluded = compute(transaction({ config: { excludedPayItems: [earning.key] } }));
  const excludedLine = excluded.lines.find(item => item.employeeId === line.employeeId);
  assert.ok(!excludedLine.earnings.some(item => item.key === earning.key));
  assert.ok(excludedLine.payItemAdjustments.some(change => change.key === earning.key && change.excluded && change.scope === 'run'));
  assert.ok(excludedLine.grossPay < line.grossPay);

  const changed = compute(transaction({ overrides: { [line.employeeId]: { payItems: { [earning.key]: { amount: earning.amount + 1000, reason: 'Adjusted for August' } } } } }));
  const changedLine = changed.lines.find(item => item.employeeId === line.employeeId);
  const paid = changedLine.earnings.find(item => item.key === earning.key);
  assert.equal(paid.amount, earning.amount + 1000);
  assert.equal(paid.computedAmount, earning.amount);
  assert.ok(changedLine.exceptions.some(item => /Adjusted for August/.test(item.message)));
});

test('skipping a deduction or loan lowers what is collected but not what is owed', () => {
  const base = compute(transaction());
  const line = base.lines.find(item => item.employeeId === employee.employeeId);
  const item = line.deductions.find(entry => entry.key === 'Deduction:DED-HMO');
  assert.equal(item.deducted, 800);
  const run = transaction({ overrides: { [line.employeeId]: { payItems: { [item.key]: { exclude: true, reason: 'Hardship' } } } } });
  const after = compute(run).lines.find(entry => entry.employeeId === line.employeeId);
  assert.ok(![...after.deductions, ...after.loans].some(entry => entry.key === item.key));
  assert.ok(after.netPay > line.netPay);
  assert.ok(after.exceptions.some(entry => /carries to the next run/.test(entry.message)));
});

test('take-home protection can keep the policy, use another minimum, or be off — the employee choice wins', () => {
  const policy = { enabled: true, autoDefer: true, thresholdType: 'Percentage', threshold: 30, loanCapType: 'Percentage', loanCap: 20 };
  assert.equal(takeHomePolicyForLine(policy).override, null);
  const minimum = takeHomePolicyForLine(policy, {}, { mode: 'minimum', minimum: 8000, reason: 'Agreed with employee' });
  assert.equal(minimum.policy.thresholdType, 'Fixed Amount');
  assert.equal(minimum.policy.threshold, 8000);
  assert.equal(minimum.override.scope, 'employee');
  const off = takeHomePolicyForLine(policy, { mode: 'off', reason: 'Bonus-only run' });
  assert.equal(off.policy.autoDefer, false);
  assert.equal(off.policy.loanCapType, 'None');
  assert.equal(off.override.scope, 'run');
  assert.equal(takeHomePolicyForLine(policy, { mode: 'off' }, { mode: 'minimum', minimum: 5000 }).override.mode, 'minimum');
});

test('turning take-home protection off on a run collects what the policy would have deferred', () => {
  const heavy = { ...registers, deductions: [{ code: 'DED-BIG', name: 'Salary loan offset', employee: `${employee.code} - ${employee.name}`, amount: 60000, balance: 60000, status: 'Active' }] };
  const computeHeavy = run => {
    const context = buildPayrollContext({ companyId: COMPANY, run, hrmData: defaultHrmData(COMPANY) });
    return runPayroll({ transaction: run, context: { ...context, registers: heavy, policies: { takeHome: { enabled: true, autoDefer: true, thresholdType: 'Percentage', threshold: 30, base: 'Gross Pay' } } } }).lines.find(line => line.employeeId === employee.employeeId);
  };
  const protectedLine = computeHeavy(transaction());
  assert.ok(protectedLine.takeHome.deferred > 0, 'the policy defers part of the deduction');
  const off = computeHeavy(transaction({ config: { takeHome: { mode: 'off', reason: 'Test' } } }));
  assert.equal(off.takeHome.deferred, 0);
  assert.ok(off.netPay < protectedLine.netPay);
  assert.equal(off.takeHomeOverride.mode, 'off');
  const lower = computeHeavy(transaction({ overrides: { [employee.employeeId]: { takeHome: { mode: 'minimum', minimum: 1000, reason: 'Agreed' } } } }));
  assert.equal(lower.takeHome.protectedMinimum, 1000);
  assert.ok(lower.netPay < protectedLine.netPay && lower.netPay >= 1000 - 0.01);
});
