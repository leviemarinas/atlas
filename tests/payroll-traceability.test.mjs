import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPayrollAuditTrail, PAYROLL_UI_PATHS, traceabilityForStep } from '../src/payrollTraceability.js';

const pathText = value => value.join(' › ');

test('a computation step identifies its source screen, governed code, library, and company assignment', () => {
  const trace = traceabilityForStep({
    code: 'ERN-001',
    label: 'Basic salary per cutoff',
    category: 'Basic Pay',
    source: 'Employee salary record',
  });

  assert.equal(trace.kind, 'Configuration + computation');
  assert.equal(trace.policyApplied, false);
  assert.ok(trace.references.some(item => pathText(item.path) === 'HRM › Benefits › Salary Information › Employee › Basic Pay'));
  assert.ok(trace.references.some(item => pathText(item.path) === 'Core › Company Configuration › Services Information › Basic Pay & Pay Rates'));
  assert.ok(trace.references.some(item => pathText(item.path).endsWith('Computational Basis › Computations › ERN-001')));
  assert.ok(trace.references.some(item => pathText(item.path).endsWith('Standard Computation Library › ERN-001')));
  assert.ok(trace.references.some(item => pathText(item.path).endsWith('Client computation assignments › ERN-001')));
});

test('timekeeping basic pay does not incorrectly point to the overtime screen', () => {
  const trace = traceabilityForStep({
    code: 'ERN-001',
    label: 'Rendered daily pay',
    category: 'Basic Pay',
    source: 'Timekeeping approved days',
  });
  const input = trace.references.find(item => item.role === 'Input record');
  assert.deepEqual(input.path, PAYROLL_UI_PATHS.attendance);
});

test('policy steps expose the minimum take-home and REF-011 policy paths', () => {
  const trace = traceabilityForStep({
    code: 'THP-002',
    label: 'Deferred controllable deductions',
    category: 'Take-Home Pay',
    source: 'Take-Home Pay policy engine',
  });

  assert.equal(trace.kind, 'Policy engine');
  assert.equal(trace.policyApplied, true);
  assert.ok(trace.references.some(item => pathText(item.path).endsWith('Policy Engines › Minimum Take-Home Pay')));
  assert.ok(trace.references.some(item => pathText(item.path).endsWith('Policy Engines › Deduction and Loan Hierarchy')));
});

test('the ordered payroll audit covers input ownership, references, policies, and downstream proof', () => {
  const line = {
    status: 'Computed',
    name: 'John Collins Doe',
    employeeGroup: 'Regular Employees',
    payType: 'Monthly',
    rates: { monthlyRate: 30000, dailyRate: 1379.31, hourlyRate: 172.41, factorDays: 261, workHours: 8 },
    attendance: { daysWorked: 11, overtimeHours: 2, tardinessMinutes: 0 },
    basicPay: 15000,
    earnings: [{ code: 'ERN-MOBILE', name: 'Mobile allowance', amount: 1000 }],
    deductions: [{ code: 'DED-EQUIP', name: 'Equipment recovery', due: 25000, source: 'Deduction Management' }],
    loans: [],
    grossPay: 16000,
    taxableIncome: 14500,
    withholdingTax: 650,
    statutory: { basis: 16000, employeeTotal: 1300, employerTotal: 1800 },
    takeHome: { protectedMinimum: 4800, deferred: 15750 },
    netPay: 4800,
    steps: [
      { code: 'ERN-001' }, { code: 'GOV-001' }, { code: 'TAX-001' },
      { code: 'THP-001' }, { code: 'THP-002' }, { code: 'PAY-002' },
    ],
  };
  const run = {
    status: 'Posted', transactionNumber: 'PR-2025-11-001', paymentMode: 'Semi-monthly', payoutDate: '2025-11-30',
    timekeepingStart: '2025-11-01', timekeepingEnd: '2025-11-15',
  };

  const trail = buildPayrollAuditTrail(line, run);
  const ids = trail.map(item => item.id);
  assert.deepEqual(ids, [
    'run', 'basic-config', 'basic', 'time', 'earnings', 'deductions', 'loans', 'references',
    'reference-register', 'assignment', 'basis', 'statutory', 'tax', 'hierarchy', 'policy', 'output', 'payslip', 'reports',
  ]);
  assert.equal(trail.find(item => item.id === 'loans').status, 'No active schedule');
  assert.deepEqual(trail.find(item => item.id === 'loans').path, PAYROLL_UI_PATHS.loanManagement);
  assert.equal(trail.find(item => item.id === 'policy').status, 'Applied');
  assert.deepEqual(trail.find(item => item.id === 'hierarchy').path, PAYROLL_UI_PATHS.deductionHierarchy);
  assert.equal(trail.find(item => item.id === 'payslip').status, 'Visible');
  assert.equal(trail.find(item => item.id === 'reports').status, 'Available');
  assert.ok(trail.every(item => item.path.length >= 2 && item.reads && item.produces));
});
