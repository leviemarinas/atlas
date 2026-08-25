import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canEditPolicy,
  createPolicyVersion,
  policiesConflict,
  policySelectionConflicts,
  policySnapshot,
} from '../src/policyManagement.js';
import { collectionItemsFor } from '../src/payrollEngine.js';
import { minimumTakeHomeNotifications, notificationEventKeys } from '../src/notificationServices.js';

const policy = {
  id: 11, policyCode: 'THP-001', parameter: 'THP-001', version: '1.0', status: 'Active',
  effectiveFrom: '2026-01-01', effectiveTo: '', groupBy: 'All Employees', groupValue: 'ABC Company Ltd',
  category: 'Pay and Earnings', subcategory: 'Take-Home Pay', rule: 'Protect minimum take-home pay.',
};

test('an active unused policy is editable and a payroll reference locks it', () => {
  assert.equal(canEditPolicy(policy, []), true);
  const run = { id: 'run-1', status: 'Open', appliedPolicies: [policySnapshot(policy)] };
  assert.equal(canEditPolicy(policy, [run]), false);
  const next = createPolicyVersion(policy, [policy]);
  assert.equal(next.id, undefined);
  assert.equal(next.version, '2.0');
  assert.equal(next.supersedesPolicyId, policy.id);
});

test('only overlapping versions of the same code and applicability conflict', () => {
  const overlap = { ...policy, id: 12, version: '2.0', effectiveFrom: '2026-06-01' };
  const complementary = { ...overlap, id: 13, policyCode: 'THP-002', parameter: 'THP-002' };
  assert.equal(policiesConflict(policy, overlap), true);
  assert.equal(policySelectionConflicts([policy, overlap]).length, 1);
  assert.equal(policiesConflict(policy, complementary), false);
});

test('an approved staggered request reduces the matching loan installment', () => {
  const [item] = collectionItemsFor({
    salary: {},
    employee: { employeeId: 'emp-1', code: 'EMP-001' },
    transaction: { payoutDate: '2026-10-15' },
    loanSchedules: [{ id: 'loan-1', transactionNumber: 'TRX-00001', loanName: 'Company Loan', loanType: 'Company Loan', status: 'ACTIVE', balance: 9000, deductionAmount: 3000 }],
    staggeredRequests: [{ requestId: 'SPR-1', employeeId: 'emp-1', requestDetails: { eligibleDeduction: 'TRX-00001 · Company Loan', installments: 3, applicablePayroll: '2026-10-01 to 2026-10-15' } }],
  });
  assert.equal(item.originalDue, 3000);
  assert.equal(item.due, 1000);
  assert.equal(item.staggeredRequestId, 'SPR-1');
});

test('a staggered arrangement is ignored outside its approved payroll period', () => {
  const [item] = collectionItemsFor({
    salary: {},
    employee: { employeeId: 'emp-1', code: 'EMP-001' },
    transaction: { periodStart: '2026-11-01', periodEnd: '2026-11-15', payoutDate: '2026-11-15' },
    loanSchedules: [{ id: 'loan-1', transactionNumber: 'TRX-00001', loanName: 'Company Loan', loanType: 'Company Loan', status: 'ACTIVE', balance: 9000, deductionAmount: 3000 }],
    staggeredRequests: [{ requestId: 'SPR-1', employeeId: 'emp-1', requestDetails: { eligibleDeduction: 'TRX-00001 · Company Loan', installments: 3, applicablePayroll: '2026-10-01 to 2026-10-15' } }],
  });
  assert.equal(item.due, 3000);
  assert.equal(item.staggeredRequestId, '');
});

test('minimum take-home warnings honor the configurable cutoff lead time', () => {
  const rules = [{ eventKey: notificationEventKeys.MinimumTakeHomePayRisk, status: 'Active', leadTimeDays: 5 }];
  const run = { id: 'run-1', timekeepingEnd: '2026-10-15' };
  const result = { lines: [{ employeeId: 'emp-1', name: 'Ada', netPay: 4500, takeHome: { protectedMinimum: 6000, deferred: 1500 } }] };
  assert.equal(minimumTakeHomeNotifications({ run, result, rules, today: '2026-10-10' }).length, 1);
  assert.equal(minimumTakeHomeNotifications({ run, result, rules, today: '2026-10-09' }).length, 0);
});
