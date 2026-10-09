/**
 * The government and annual reports the Phase 2 gap tracker listed as
 * missing (HTP210-261): each is built from posted payroll lines, and the
 * annual and monthly ones roll several runs up per employee.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultHrmData } from '../src/hrmData.js';
import { employeeRoster } from '../src/employeeRoster.js';
import { runPayroll } from '../src/payrollEngine.js';
import { aggregateReportRows, buildPayrollContext, governmentReportCatalog, newPayrollRun, payrollReport } from '../src/payrollRuns.js';

const COMPANY = 'ABC-PH-001';
const john = employeeRoster.find(employee => employee.employeeId === 'EMP-1001');
const consultant = employeeRoster.find(employee => employee.payroll.taxType === 'Expanded');

function run(extra = {}) {
  const base = newPayrollRun({ companyId: COMPANY, year: 2026, month: 'August' });
  return {
    ...base,
    periodStart: '2026-08-16', periodEnd: '2026-08-31', timekeepingStart: '2026-08-01', timekeepingEnd: '2026-08-15', payoutDate: '2026-08-31',
    ...extra,
  };
}
const registers = {
  earnings: [{ code: 'ERN-ARR', name: 'Adjustments', employee: `${john.code} - ${john.name}`, amount: 1500, frequency: 'Semi-monthly', basis: 'Fixed amount', status: 'Active', totalAmount: 6000 }],
  deductions: [{ code: 'DED-MP2', name: 'MP2 Savings', employee: `${john.code} - ${john.name}`, amount: 500, status: 'Active' }],
  bonuses: [], payCodes: [],
};
function computeWith(transaction) {
  const context = { ...buildPayrollContext({ companyId: COMPANY, run: transaction, hrmData: defaultHrmData(COMPANY) }), registers };
  return { result: runPayroll({ transaction, context }), context };
}
const rowsOf = (key, { result, context }) => payrollReport(key).build(result, context);

test('every missing Must report has a builder', () => {
  const keys = governmentReportCatalog.map(entry => entry.key);
  ['earnings-balance', 'accruals', 'annual-clearance', 'alphalist-annual', 'bir-1700', 'alphalist-monthly', 'final-tax', 'expanded-tax', 'bir-1601eq', 'gov-remittances', 'hdmf-receipts', 'mp2-remittance', 'mp2-accounts', 'phic-pmrf', 'phic-er2']
    .forEach(key => assert.ok(keys.includes(key), key));
});

test('monthly remittance returns add up to the statutory shares and the tax withheld', () => {
  const computed = computeWith(run());
  const rows = aggregateReportRows(payrollReport('gov-remittances'), rowsOf('gov-remittances', computed), computed.context);
  const byAgency = Object.fromEntries(rows.map(row => [row.agency, row]));
  const lines = computed.result.lines.filter(line => line.status === 'Computed');
  const sum = pick => Math.round(lines.reduce((total, line) => total + pick(line), 0) * 100) / 100;
  assert.equal(byAgency.BIR.eeValue, sum(line => line.withholdingTax));
  assert.equal(byAgency.PhilHealth.totalValue, sum(line => line.statutory.philhealthEmployee + line.statutory.philhealthEmployer));
  assert.equal(byAgency.SSS.employees, lines.filter(line => line.statutory.sssEmployee + line.statutory.sssEmployer > 0).length);
});

test('MP2 savings show in the Pag-IBIG remittance schedule, the converter and the account list', () => {
  const computed = computeWith(run());
  const receipts = rowsOf('hdmf-receipts', computed).find(row => row.name === john.name);
  assert.equal(receipts.mp2Value, 500);
  const converter = rowsOf('mp2-remittance', computed);
  assert.deepEqual(converter.map(row => [row.mp2Account, row.amountValue]), [['1040-0012-3456', 500]]);
  assert.equal(rowsOf('mp2-accounts', computed)[0].mid, john.government.hdmf);
});

test('annual clearance and the alphalist roll two runs up and compare tax due with tax withheld', () => {
  const first = computeWith(run());
  const second = computeWith(run({ periodStart: '2026-09-01', periodEnd: '2026-09-15', payoutDate: '2026-09-15', frequency: 'First Half' }));
  const definition = payrollReport('annual-clearance');
  const rows = aggregateReportRows(definition, [...rowsOf('annual-clearance', first), ...rowsOf('annual-clearance', second)], second.context);
  const johnRow = rows.find(row => row.name === john.name);
  assert.equal(johnRow.runs, 2);
  assert.equal(johnRow.openingTaxableValue, john.ytd.taxableEarnings, 'the opening balance is not added twice');
  assert.equal(johnRow.annualTaxableValue, Math.round((johnRow.openingTaxableValue + johnRow.taxableValue) * 100) / 100);
  assert.ok(johnRow.taxDueValue > 0);
  assert.match(johnRow.outcome, /Balanced|still due|refund/);
  assert.ok(!rows.some(row => row.name === consultant.name), 'a consultant is not on the compensation alphalist');
});

test('a consultant on expanded withholding is taxed at the ATC rate and appears on the expanded reports', () => {
  const monthly = run({ paymentMode: 'Monthly', frequency: 'Monthly', periodStart: '2026-08-01' });
  const computed = computeWith(monthly);
  const line = computed.result.lines.find(entry => entry.employeeId === consultant.employeeId);
  assert.equal(line.status, 'Computed');
  assert.equal(line.taxAtc, 'WI010');
  assert.equal(line.taxRate, 0.05, 'WI010 professional fees is 5% in the expanded tax table');
  assert.equal(line.withholdingTax, Math.round(line.taxableIncome * 0.05 * 100) / 100);
  assert.equal(line.statutory.employeeTotal, 0);
  const [row] = rowsOf('expanded-tax', computed);
  assert.equal(row.atc, 'WI010');
  assert.equal(row.rate, '5%');
  const [quarter] = aggregateReportRows(payrollReport('bir-1601eq'), rowsOf('bir-1601eq', computed), computed.context);
  assert.equal(quarter.quarter, '2026-Q3');
  assert.equal(rowsOf('final-tax', computed).length, 0);
});

test('earnings with balance shows the entitlement, what was paid and what is left', () => {
  const computed = computeWith(run());
  const rows = aggregateReportRows(payrollReport('earnings-balance'), rowsOf('earnings-balance', computed), computed.context);
  assert.deepEqual(rows.map(row => [row.earning, row.entitlementValue, row.paidValue, row.balanceValue]), [['Adjustments', 6000, 1500, 4500]]);
});

test('accruals are one-twelfth of basic pay plus the employer shares', () => {
  const computed = computeWith(run());
  const row = rowsOf('accruals', computed).find(entry => entry.name === john.name);
  const line = computed.result.lines.find(entry => entry.employeeId === john.employeeId);
  assert.equal(row.thirteenthValue, Math.round(line.basicPay / 12 * 100) / 100);
  assert.equal(row.totalValue, Math.round((row.thirteenthValue + line.statutory.employerTotal) * 100) / 100);
});

test('a year-end adjustment run annualises every employee on the BIR annual table', () => {
  const regular = computeWith(run()).result.lines.find(line => line.employeeId === john.employeeId);
  const yearEnd = computeWith(run({ config: { ...run().config, annualizeTax: true } })).result.lines.find(line => line.employeeId === john.employeeId);
  assert.match(yearEnd.taxBasis, /year-end adjustment/);
  assert.ok(yearEnd.steps.some(step => step.code === 'TAX-008'));
  assert.notEqual(yearEnd.withholdingTax, regular.withholdingTax);
});

test('deductions, monthly deductions and loan remittances read the collected items', () => {
  const computed = computeWith(run());
  const schedule = aggregateReportRows(payrollReport('deductions-schedule'), rowsOf('deductions-schedule', computed), computed.context);
  assert.ok(schedule.some(row => row.item === 'MP2 Savings' && row.collectedValue === 500));
  const monthly = aggregateReportRows(payrollReport('monthly-deductions'), rowsOf('monthly-deductions', { ...computed, context: { ...computed.context, serviceConfig: { deductions: [{ name: 'MP2 Savings', deductionTag: 'Other Statutory Deduction' }] } } }), computed.context);
  assert.equal(monthly.find(row => row.item === 'Withholding tax').tag, 'Withholding Tax');
  assert.equal(monthly.find(row => row.item === 'MP2 Savings').tag, 'Other Statutory Deduction');
  const lines = computed.result.lines.filter(line => line.status === 'Computed');
  assert.equal(monthly.find(row => row.item === 'Withholding tax').amountValue, Math.round(lines.reduce((total, line) => total + line.withholdingTax, 0) * 100) / 100);
  rowsOf('loan-remittances', computed).forEach(row => assert.ok(['SSS', 'Pag-IBIG'].includes(row.agency)));
});

test('the compliance report flags missing government numbers and the remittance converter writes one row per agency', () => {
  const monthly = computeWith(run({ paymentMode: 'Monthly', frequency: 'Monthly', periodStart: '2026-08-01' }));
  const [consultantRow] = rowsOf('compliance', monthly).filter(row => row.name === consultant.name);
  assert.equal(consultantRow.sss, 'Not required');
  assert.equal(consultantRow.ids, 'Complete', 'numbers a consultant is not required to have are not flagged');
  const computed = computeWith(run());
  const converter = rowsOf('remittance-converter', computed).filter(row => row.name === john.name);
  assert.deepEqual(converter.map(row => row.agency), ['SSS R-3', 'PhilHealth RF-1', 'Pag-IBIG MCRF']);
  assert.equal(converter[0].memberId, john.government.sss);
});
