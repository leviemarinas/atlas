import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultHrmData,
  seedOnboardingDocuments,
  seedLoanInquiries,
  seedLeaveBalances,
  seedAttendanceSummaries,
  seedEmployees,
} from '../src/hrmData.js';

test('Part 5 Onboarding Documents seeds both Job Descriptions and Employment Contracts', () => {
  const employees = seedEmployees();
  const docs = seedOnboardingDocuments(employees);

  assert.ok(Array.isArray(docs));
  assert.ok(docs.length > 0);

  const jds = docs.filter(d => d.category === 'job-description');
  const contracts = docs.filter(d => d.category === 'employment-contract');

  assert.ok(jds.length >= 10);
  assert.ok(contracts.length >= 10);

  const pending = docs.filter(d => d.status === 'Pending');
  const approved = docs.filter(d => d.status === 'Approved');
  const rejected = docs.filter(d => d.status === 'Rejected');

  assert.ok(pending.length > 0);
  assert.ok(approved.length > 0);
  assert.ok(rejected.length > 0);

  // Check content and attachment properties for Part 5 review
  const firstJd = jds[0];
  assert.ok(firstJd.onboardingDocId);
  assert.ok(firstJd.documentTitle.startsWith('Job-Description'));
  assert.ok(firstJd.author);
  assert.ok(firstJd.submissionDate);
  assert.ok(firstJd.effectivityDate);
  assert.ok(firstJd.content?.aboutCompany);
  assert.ok(firstJd.content?.jobSummary);
  assert.ok(Array.isArray(firstJd.content?.keyResponsibilities));
  assert.ok(Array.isArray(firstJd.attachments));
});

test('Part 5 Loan Inquiry generates Government and Company loans with deduction matrices', () => {
  const employees = seedEmployees();
  const loans = seedLoanInquiries(employees);

  assert.ok(Array.isArray(loans));
  assert.ok(loans.length >= 10);

  const govLoans = loans.filter(l => l.loanType === 'Government Loan');
  const compLoans = loans.filter(l => l.loanType === 'Company Loan');

  assert.ok(govLoans.length > 0);
  assert.ok(compLoans.length > 0);

  // Check deduction matrix and repayment properties
  const pagIbigLoan = govLoans.find(l => l.loanName === 'PAG-IBIG Housing Loan');
  assert.ok(pagIbigLoan);
  assert.equal(pagIbigLoan.transactionNumber, 'LN-GOV-001');
  assert.equal(pagIbigLoan.principalAmount, 2000000);
  assert.equal(pagIbigLoan.interestRate, 5);
  assert.equal(pagIbigLoan.interestAmount, 100000);
  assert.equal(pagIbigLoan.totalLoan, 2100000);
  assert.equal(pagIbigLoan.balance, 2080000);
  assert.equal(pagIbigLoan.status, 'ACTIVE');
  assert.ok(Array.isArray(pagIbigLoan.deductionMatrix));
  assert.ok(pagIbigLoan.deductionMatrix.length >= 12);
  assert.equal(pagIbigLoan.deductionMatrix[0].deductionAmount, 5000);
});

test('Part 5 Leave Balances populate statutory and company leave matrices', () => {
  const balances = seedLeaveBalances();
  assert.ok(Array.isArray(balances));
  assert.ok(balances.length > 0);

  const types = balances.map(l => l.leaveType);
  assert.ok(types.includes('Emergency'));
  assert.ok(types.includes('Sick'));
  assert.ok(types.includes('Vacation'));
  assert.ok(types.includes('Bereavement'));
  assert.ok(types.includes('Magna Carta'));
  assert.ok(types.includes('Solo Parent'));
  assert.ok(types.includes('Terminal'));

  for (const row of balances) {
    assert.ok(typeof row.accrued === 'number');
    assert.ok(typeof row.used === 'number');
    assert.ok(typeof row.forfeited === 'number');
    assert.ok(typeof row.pending === 'number');
    assert.ok(typeof row.available === 'number');
    assert.ok(row.available <= row.accrued);
  }
});

test('Part 5 Attendance Summary calculates KPIs and contains multi-period time records', () => {
  const att = seedAttendanceSummaries();
  assert.ok(att);
  assert.equal(att.cutoffLabel, 'January 15, 2025');
  assert.equal(att.currentPeriod, 'January 1-15, 2025');
  assert.ok(Array.isArray(att.periods));

  // Verify KPI cards
  assert.equal(att.kpi.totalWorkedHours, '100.00');
  assert.equal(att.kpi.totalOvertimeHours, '0.75');
  assert.equal(att.kpi.totalAbsences, '1');
  assert.equal(att.kpi.totalLeaveDays, '1');
  assert.equal(att.kpi.tardinessHours, '1.67');
  assert.equal(att.kpi.tardinessMins, '100');
  assert.equal(att.kpi.undertimeHours, '3.33');
  assert.equal(att.kpi.undertimeMins, '200');
  assert.equal(att.kpi.workedHoursTotal, '80.50');

  // Verify daily logs
  assert.ok(Array.isArray(att.logs));
  assert.ok(att.logs.length > 0);
  assert.ok(att.logs.some(l => l.tool === 'Web'));
  assert.ok(att.logs.some(l => l.tool === 'Biometrics'));
  assert.ok(att.logs.some(l => l.tool === 'Mobile'));
});

test('defaultHrmData initializes all Part 5 data models properly', () => {
  const hrm = defaultHrmData('ABC-CORP');
  assert.ok(Array.isArray(hrm.onboardingDocuments));
  assert.ok(Array.isArray(hrm.loanInquiries));
  // There is deliberately no stored `leaveLedgers` table: a ledger is derived
  // per employee from `leaveBalances` and the request store on read.
  assert.equal(hrm.leaveLedgers, undefined);
  assert.ok(Array.isArray(hrm.leaveBalances));
  assert.ok(hrm.attendanceSummaries);
  assert.equal(hrm.attendanceSummaries.kpi.totalWorkedHours, '100.00');
});
