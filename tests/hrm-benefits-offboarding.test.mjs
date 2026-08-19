import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultHrmData,
  seedSalaryInformation,
  seedEmployeeBenefits,
  seedEmployeeAllowances,
  seedOffboardingChecklistTemplates,
  seedClearanceApplications,
  seedFinalQuitClaims,
  seedEmployees,
} from '../src/hrmData.js';

test('Part 6 Benefits - Salary Information seeds with all 8 sub-sections', () => {
  const employees = seedEmployees();
  const salaries = seedSalaryInformation(employees);

  assert.ok(Array.isArray(salaries));
  assert.ok(salaries.length >= 6);

  const first = salaries[0];
  assert.ok(first.id);
  assert.ok(first.employeeCode);
  assert.ok(first.employeeName);
  assert.ok(first.department);
  assert.ok(first.division);
  assert.ok(first.jobTitle);
  assert.ok(first.dateHired);
  assert.ok(first.employeeGroup);

  // 1. Basic Pay
  assert.ok(Array.isArray(first.basicPay));
  assert.ok(first.basicPay.length > 0);
  assert.ok(first.basicPay[0].basicPayAmount > 0);
  assert.equal(first.basicPay[0].annualRate, first.basicPay[0].basicPayAmount * 12);
  assert.ok(first.basicPay[0].dailyRate > 0);
  assert.ok(first.basicPay[0].hourlyRate > 0);
  assert.ok(first.basicPay[0].perMinuteRate > 0);

  // 2. Earnings
  assert.ok(Array.isArray(first.earnings));
  assert.ok(first.earnings.length >= 4);
  assert.ok(first.earnings.some(e => e.earningCode === 'EXA-001'));
  assert.ok(first.earnings.some(e => e.earningName === 'Salary'));

  // 3. Bonuses
  assert.ok(Array.isArray(first.bonuses));
  assert.ok(first.bonuses.some(b => b.name === '13th Month Pay (T)'));

  // 4. Statutory Deductions
  assert.ok(Array.isArray(first.statutoryDeductions));
  assert.ok(first.statutoryDeductions[0].sssEmployee > 0);
  assert.ok(first.statutoryDeductions[0].phicEmployee > 0);
  assert.ok(first.statutoryDeductions[0].hdmfEmployee > 0);

  // 5. Company Deductions
  assert.ok(Array.isArray(first.companyDeductions));
  assert.ok(first.companyDeductions.length > 0);

  // 6. Loans
  assert.ok(Array.isArray(first.loans));
  assert.ok(first.loans.length > 0);
  assert.ok(first.loans[0].totalLoan > 0);

  // 7. HDMF Contribution
  assert.ok(Array.isArray(first.hdmfContributions));
  assert.ok(first.hdmfContributions[0].employeeContribution > 0);

  // 8. Variable Allowances
  assert.ok(Array.isArray(first.variableAllowances));
  assert.ok(first.variableAllowances.length > 0);
});

test('Part 6 Benefits - Employee Benefits & Allowances seed structure', () => {
  const employees = seedEmployees();
  const benefits = seedEmployeeBenefits(employees);
  const allowances = seedEmployeeAllowances();

  assert.ok(Array.isArray(benefits));
  assert.ok(benefits.length >= 6);
  assert.ok(benefits[0].benefitsAssigned.length > 0);
  assert.ok(Array.isArray(benefits[0].benefits));
  assert.ok(benefits[0].benefits.some(b => b.status === 'Active'));

  assert.ok(Array.isArray(allowances));
  assert.equal(allowances.length, 5);
  assert.ok(allowances.some(a => a.code === 'ALW-MEAL'));
  assert.ok(allowances.some(a => a.taxTreatment.includes('De Minimis')));
});

test('Part 6 Offboarding - Clearance Applications and Checklists', () => {
  const employees = seedEmployees();
  const templates = seedOffboardingChecklistTemplates();
  const clearances = seedClearanceApplications(employees);

  assert.ok(Array.isArray(templates));
  assert.equal(templates.length, 8);

  assert.ok(Array.isArray(clearances));
  assert.ok(clearances.length >= 6);

  const statuses = clearances.map(c => c.status);
  assert.ok(statuses.includes('Approved'));
  assert.ok(statuses.includes('Pending'));
  assert.ok(statuses.includes('For Completion'));
  assert.ok(statuses.includes('For Review'));
  assert.ok(statuses.includes('Rejected'));

  const reviewItem = clearances.find(c => c.status === 'For Review');
  assert.ok(reviewItem);
  assert.ok(Array.isArray(reviewItem.submittedFiles));
  assert.ok(reviewItem.submittedFiles.length > 0);
});

test('Part 6 Offboarding - Final Quit Claims lifecycle', () => {
  const employees = seedEmployees();
  const quitClaims = seedFinalQuitClaims(employees);

  assert.ok(Array.isArray(quitClaims));
  assert.ok(quitClaims.length >= 6);

  const statuses = quitClaims.map(q => q.quitClaimStatus);
  assert.ok(statuses.includes('Pending'));
  assert.ok(statuses.includes('For Action'));
  assert.ok(statuses.includes('Accepted'));
  assert.ok(statuses.includes('For Release'));
  assert.ok(statuses.includes('Released'));

  const released = quitClaims.find(q => q.quitClaimStatus === 'Released');
  assert.ok(released);
  assert.equal(released.finalClaimStatus, 'Completed');
  assert.ok(released.signedFile);

  const first = quitClaims[0];
  assert.ok(first.documentTitle);
  assert.ok(first.author);
  assert.ok(first.recipient?.fullName);
  assert.ok(first.recipient?.email);
  assert.ok(first.recipient?.birthday);
  assert.ok(first.recipient?.acknowledgementNotice);
});

test('defaultHrmData registers Part 6 data collections', () => {
  const data = defaultHrmData('test-company');
  assert.ok(Array.isArray(data.salaryInformation));
  assert.ok(Array.isArray(data.employeeBenefits));
  assert.ok(Array.isArray(data.employeeAllowances));
  assert.ok(Array.isArray(data.offboardingChecklistTemplates));
  assert.ok(Array.isArray(data.clearanceApplications));
  assert.ok(Array.isArray(data.finalQuitClaims));
});
