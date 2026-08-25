import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultHrmData } from '../src/hrmData.js';
import { employeeRoster } from '../src/employeeRoster.js';
import { applyPayrollBatch, parsePayrollBatch, rollbackPayrollBatch } from '../src/payrollBatch.js';
import { simpleTablePdf, spreadsheetXml } from '../src/payrollExports.js';
import { bankFileFor, runPayroll } from '../src/payrollEngine.js';
import {
  PAYROLL_RUNS_KEY,
  applyAction,
  buildPayrollContext,
  defaultLockDate,
  newPayrollRun,
  nextTransactionNumber,
  readPayrollRuns,
} from '../src/payrollRuns.js';

const COMPANY = 'ABC-PH-001';

function transaction(overrides = {}) {
  const run = newPayrollRun({ companyId: COMPANY, year: 2026, month: 'August', payrollType: overrides.payrollType || 'Regular' });
  return {
    ...run,
    periodStart: '2026-08-16', periodEnd: '2026-08-31',
    timekeepingStart: '2026-08-01', timekeepingEnd: '2026-08-15', payoutDate: '2026-08-31',
    ...overrides,
    config: { ...run.config, ...(overrides.config || {}) },
    population: { ...run.population, ...(overrides.population || {}) },
    overrides: overrides.overrides || {},
  };
}

function contextFor(run) {
  return buildPayrollContext({ companyId: COMPANY, run, hrmData: defaultHrmData(COMPANY) });
}

test('calendar period controls the generated transaction number and default lock date', () => {
  assert.equal(nextTransactionNumber([], 2026, 8), 'PR-2026-08-001');
  assert.equal(defaultLockDate('2026-08-31'), '2026-09-01');
});

test('blocking payroll errors cannot advance into the approval workflow', () => {
  const run = { ...transaction(), status: 'Open', result: { exceptions: [{ severity: 'Error', name: 'Sample Employee', message: 'Negative net pay.' }] } };
  assert.match(applyAction(run, 'postDraft').error, /resolve 1 blocking payroll error/i);
  const legacyDraft = { ...run, status: 'Draft' };
  assert.match(applyAction(legacyDraft, 'submitReview').error, /negative net pay/i);
});

test('approved payroll generates an auditable bank file before posting', () => {
  const run = transaction({ status: 'Approved' });
  run.result = runPayroll({ transaction: run, context: contextFor(run) });
  const outcome = applyAction(run, 'generateBankFile', { actor: 'Client Admin' });
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.run.status, 'Approved');
  assert.equal(outcome.run.audit[0].action, 'Bank file generated');
});

test('a posted transaction auto-locks when its configured date is reached', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, String(value)) };
  const run = { ...transaction(), status: 'Posted', lockDate: '2020-01-01', audit: [] };
  storage.setItem(`${PAYROLL_RUNS_KEY}:${COMPANY}`, JSON.stringify([run]));
  const [locked] = readPayrollRuns(COMPANY, storage);
  assert.equal(locked.status, 'Locked');
  assert.equal(locked.audit[0].action, 'Automatically locked');
});

test('batch validation supports typed items and prevents duplicates or regular-run tax overrides', () => {
  const valid = parsePayrollBatch('Employee Code,Pay Item Type,Pay Item,Amount\n0011223345,Earning,Meal allowance,500\n0011223345,Deduction,Uniform,100', { employees: employeeRoster });
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.entries.length, 2);
  const invalid = parsePayrollBatch('Employee Code,Pay Item Type,Pay Item,Amount\n0011223345,Withholding Tax,Tax,100\n0011223345,Withholding Tax,Tax,100', { employees: employeeRoster, payrollType: 'Regular' });
  assert.ok(invalid.errors.some(error => /only on an Override/.test(error)));
  assert.ok(invalid.errors.some(error => /duplicate/.test(error)));
});

test('committing and rolling back a typed batch changes only that batch', () => {
  const entries = parsePayrollBatch('Employee Code,Pay Item Type,Pay Item,Amount\n0011223345,Bonus,Retention Bonus,5000\n0011223345,Work Days,Rendered days,10', { employees: employeeRoster }).entries;
  const applied = applyPayrollBatch({}, entries, employeeRoster, 'test.csv');
  const employee = employeeRoster.find(row => row.code === '0011223345');
  assert.equal(applied[employee.employeeId].bonuses[0].amount, 5000);
  assert.equal(applied[employee.employeeId].daysInPeriod, 10);
  const rolledBack = rollbackPayrollBatch(applied, 'test.csv');
  assert.equal(rolledBack[employee.employeeId].bonuses.length, 0);
  assert.equal(rolledBack[employee.employeeId].daysInPeriod, undefined);
});

test('override payroll may replace withholding tax and records the source', () => {
  const employee = employeeRoster[0];
  const run = transaction({ payrollType: 'Override', population: { mode: 'Selected Employees', included: [employee.employeeId] }, overrides: { [employee.employeeId]: { withholdingTax: 1234.56 } } });
  const result = runPayroll({ transaction: run, context: contextFor(run) });
  const line = result.lines.find(row => row.employeeId === employee.employeeId);
  assert.equal(line.withholdingTax, 1234.56);
  assert.equal(line.taxBasis, 'Manual override transaction');
});

test('multi-currency payroll keeps PHP base values and converts settlement and bank amounts', () => {
  const employee = employeeRoster[0];
  const run = transaction({ currency: 'USD', conversionRate: 50, population: { mode: 'Selected Employees', included: [employee.employeeId] } });
  const result = runPayroll({ transaction: run, context: contextFor(run) });
  assert.equal(result.currency, 'USD');
  assert.equal(result.settlementTotals.netPay, Number((result.totals.netPay / 50).toFixed(2)));
  const bank = bankFileFor(result);
  assert.equal(bank[0].currency, 'USD');
  assert.equal(bank.reduce((sum, row) => sum + row.amount, 0).toFixed(2), result.settlementTotals.netPay.toFixed(2));
});

test('Excel and PDF exports have real document signatures', () => {
  assert.match(spreadsheetXml('Payroll', ['Employee', 'Net'], [['A', 100]]), /<Workbook/);
  const pdf = simpleTablePdf('Payroll', ['Employee', 'Net'], [['A', 100]]);
  assert.equal(new TextDecoder().decode(pdf.slice(0, 8)), '%PDF-1.4');
});
