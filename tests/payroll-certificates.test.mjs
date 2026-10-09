/**
 * Payroll certificates and the statutory contribution summary (HTP166-177),
 * built only from an employee's posted payroll.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultHrmData } from '../src/hrmData.js';
import { employeeRoster } from '../src/employeeRoster.js';
import { runPayroll } from '../src/payrollEngine.js';
import { buildPayrollContext, newPayrollRun } from '../src/payrollRuns.js';
import { effectiveStatutorySet } from '../src/statutoryService.js';
import { CERTIFICATE_TYPES, buildCertificate, certificateYears, contributionSummary } from '../src/payrollCertificates.js';

const COMPANY = 'ABC-PH-001';
const john = employeeRoster.find(employee => employee.employeeId === 'EMP-1001');
const consultant = employeeRoster.find(employee => employee.payroll.taxType === 'Expanded');

function postedRun(id, extra = {}) {
  const base = newPayrollRun({ companyId: COMPANY, year: 2026, month: 'August' });
  const transaction = { ...base, id, transactionNumber: id, status: 'Posted', periodStart: '2026-08-16', periodEnd: '2026-08-31', timekeepingStart: '2026-08-01', timekeepingEnd: '2026-08-15', payoutDate: '2026-08-31', ...extra };
  const context = buildPayrollContext({ companyId: COMPANY, run: transaction, hrmData: defaultHrmData(COMPANY) });
  return { ...transaction, result: runPayroll({ transaction, context }) };
}

const runs = [
  postedRun('PR-A'),
  postedRun('PR-B', { periodStart: '2026-09-01', periodEnd: '2026-09-15', payoutDate: '2026-09-15', frequency: 'First Half' }),
  { ...postedRun('PR-OPEN', { payoutDate: '2026-09-30' }), status: 'Open' },
  postedRun('PR-M', { paymentMode: 'Monthly', frequency: 'Monthly', periodStart: '2026-08-01', payoutDate: '2026-08-31' }),
];

test('seven certificate types, one per BRD feature', () => {
  assert.deepEqual(CERTIFICATE_TYPES.map(item => item.feature), ['HTP171', 'HTP172', 'HTP173', 'HTP174', 'HTP175', 'HTP176', 'HTP177']);
  assert.deepEqual(certificateYears(runs), ['2026']);
});

test('the contribution summary groups posted runs by month and ignores open ones', () => {
  const { rows, totals } = contributionSummary(runs, john.employeeId, 2026);
  assert.deepEqual(rows.map(row => row.month), ['August 2026', 'September 2026']);
  const posted = runs.filter(run => run.status === 'Posted').flatMap(run => run.result.lines).filter(line => line.employeeId === john.employeeId && line.status === 'Computed');
  assert.equal(totals.sssEe, Math.round(posted.reduce((total, line) => total + line.statutory.sssEmployee, 0) * 100) / 100);
});

test('BIR 2316 reconciles taxable compensation, tax due and tax withheld', () => {
  const certificate = buildCertificate({ type: 'bir-2316', employee: john, runs, year: 2026, statutory: effectiveStatutorySet('2026-12-31') });
  const item = label => certificate.rows.find(row => row.item.startsWith(label)).amount;
  assert.equal(certificate.transactions.length, 2);
  assert.ok(item('Taxable compensation — present employer') > item('Taxable compensation before'));
  assert.ok(item('Tax due') > 0);
  assert.equal(certificate.header.tin, john.government.tin);
});

test('BIR 2307 is for expanded withholding only', () => {
  assert.match(buildCertificate({ type: 'bir-2307', employee: john, runs, year: 2026 }).note, /does not apply/);
  const certificate = buildCertificate({ type: 'bir-2307', employee: consultant, runs, year: 2026 });
  assert.equal(certificate.rows[0].atc, 'WI010');
  assert.equal(certificate.totals.tax, Math.round(certificate.rows.reduce((total, row) => total + row.tax, 0) * 100) / 100);
});

test('contribution and loan certificates, and an honest note when there is nothing to certify', () => {
  const sss = buildCertificate({ type: 'sss-contribution', employee: john, runs, year: 2026 });
  assert.deepEqual(sss.columns.map(column => column.key), ['month', 'sssEe', 'sssEr', 'ec', 'total']);
  assert.ok(sss.totals.total > 0);
  assert.match(buildCertificate({ type: 'phic-contribution', employee: consultant, runs, year: 2026 }).note, /No contribution/);
  assert.match(buildCertificate({ type: 'sss-contribution', employee: john, runs, year: 2025 }).note, /No posted payroll/);
  const loan = buildCertificate({ type: 'hdmf-loan', employee: john, runs, year: 2026 });
  assert.ok(loan.rows.length > 0 || /No Pag-IBIG loan/.test(loan.note));
});
