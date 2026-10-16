/**
 * The payroll transaction applies the company's Gross Up policy (Oct 2026): the policy decides who is
 * grossed up, by which method, what is guaranteed and who bears the tax; an Earning Configuration marks the
 * earnings a "specific earning" gross up applies to. Without a policy the original rule still applies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultHrmData } from '../src/hrmData.js';
import { employeeRoster, findRosterEmployee } from '../src/employeeRoster.js';
import { effectiveVersionIn, graduatedTax, seedStatutoryData } from '../src/statutorySchedules.js';
import { seedComputations } from '../src/computationCatalog.js';
import { computeEmployeeLine } from '../src/payrollEngine.js';

const hrm = defaultHrmData('ABC-PH-001');
const statutoryData = seedStatutoryData();
const taxVersion = effectiveVersionIn(statutoryData, 'tax', '2025-11-30');
const tableTax = amount => graduatedTax(taxVersion, amount, 'Semi-monthly').tax;

const transaction = (config = {}) => ({
  transactionNumber: 'PR-2025-11-001', payrollType: 'Regular', paymentMode: 'Semi-monthly', year: 2025, month: 'November', frequency: 'Second Half',
  periodStart: '2025-11-16', periodEnd: '2025-11-30', timekeepingStart: '2025-11-01', timekeepingEnd: '2025-11-15', payoutDate: '2025-11-30',
  config: {
    workDaysPerYear: 261, workHoursPerDay: 8, computeAllowableDeduction: true,
    statutoryAgencies: { sss: true, philhealth: true, pagibig: true, sssWisp: true }, statutorySchedule: 'Every payroll (split)',
    computeTax: true, computeBasicPayAdjustment: true, computeOvertimeAdjustment: true,
    computeAttendanceAdjustment: { absences: true, late: true, undertime: true },
    thirteenthMonth: { enabled: false, basis: 'Pre-defined (Computational Basis)', ntThreshold: 90000, bonusTypes: ['13th Month Pay'] },
    ...config,
  },
  population: { mode: 'Active/Inactive in 201', includeOnHold: false, included: [], excluded: [] },
  overrides: {},
});

const subsidy = employee => [{ code: 'ERN-901', name: 'Housing Subsidy', employee: `${employee.code} - ${employee.name}`, amount: 3000, frequency: 'Semi-monthly', status: 'Active', periodStart: '2025-01-01', periodEnd: '' }];
const policy = (patch = {}) => ({
  enabled: true, method: 'Periodic Compensation', targetType: 'Total net pay', employerSharePercent: 100, roundingMode: 'Round to centavo',
  tolerance: 0.01, maxIterations: 50, assignment: { scope: 'All Employees', group: 'All Employees', department: '', employees: [] }, ...patch,
});
const context = ({ grossUp, setups = [], withSubsidy = false } = {}) => ({
  employees: employeeRoster, salaryInformation: hrm.salaryInformation, timeLogs: hrm.timeLogs, loanSchedules: hrm.loanInquiries,
  registers: { earnings: withSubsidy ? subsidy(findRosterEmployee('EMP-1002')) : [], deductions: [], bonuses: [], payCodes: [] },
  statutory: Object.fromEntries(Object.keys(statutoryData).map(agency => [agency, effectiveVersionIn(statutoryData, agency, '2025-11-30')])),
  policies: { takeHome: { enabled: false }, ...(grossUp ? { grossUp } : {}) },
  serviceConfig: { earnings: setups },
  hierarchy: [], computations: seedComputations(), bonusCeiling: 90000,
});
const employee = () => findRosterEmployee('EMP-1002');
const run = (grossUp, { config = { grossUpAll: true }, ...rest } = {}) => computeEmployeeLine({ employee: employee(), transaction: transaction(config), context: context({ grossUp, ...rest }) });
const without = (rest = {}) => run(policy(), { config: {}, ...rest });
const markedSetup = { code: 'ERN-901', name: 'Housing Subsidy', status: 'Active', grossUp: 'Yes' };

test('with no Gross Up policy the original rule still applies', () => {
  const line = computeEmployeeLine({ employee: employee(), transaction: transaction({ grossUpAll: true }), context: context() });
  assert.ok(line.grossUp);
  assert.equal(line.withholdingTax, 0);
  assert.equal(line.grossUp.method, undefined);
});

test('a policy with the employer paying all the tax leaves the employee whole', () => {
  const base = without();
  assert.ok(base.withholdingTax > 0);
  const line = run(policy());
  assert.equal(line.grossUp.method, 'Periodic Compensation');
  assert.equal(line.withholdingTax, 0, 'the employer absorbs the whole tax');
  assert.ok(Math.abs(line.grossUp.employerTax - tableTax(line.taxableIncome)) < 0.01, 'the tax is read from the same table');
  assert.equal(line.grossUp.uplift, 0, 'with no employee share there is nothing to pay on top');
  assert.ok(Math.abs(line.netPay - (base.netPay + base.withholdingTax)) < 0.05, 'net pay is what it would be with no tax');
});

test('a 50/50 split pays the employee enough on top for the share they bear', () => {
  const base = without();
  const line = run(policy({ employerSharePercent: 50 }));
  assert.ok(line.grossUp.uplift > 0);
  assert.ok(Math.abs(line.grossPay - (base.grossPay + line.grossUp.uplift)) < 0.01, 'the uplift is part of gross pay');
  assert.ok(line.earnings.some(item => item.code === 'GUP-001' && item.amount === line.grossUp.uplift), 'it shows as its own earning');
  assert.ok(Math.abs(line.grossUp.employerTax - line.grossUp.employeeTax) < 0.02, 'tax is shared evenly');
  assert.ok(Math.abs(line.withholdingTax - line.grossUp.employeeTax) < 0.02, 'only the employee share is withheld');
  assert.ok(Math.abs(line.netPay - (base.netPay + base.withholdingTax)) < 0.05, 'the guaranteed net is kept');
  assert.equal(line.grossUp.employerSharePercent, 50);
});

test('a specific earning is grossed up only when its Earning Configuration is marked', () => {
  const base = without({ withSubsidy: true });
  const marked = run(policy({ targetType: 'Specific earning or allowance' }), { withSubsidy: true, setups: [markedSetup] });
  assert.equal(marked.grossUp.targetEarning, 'Housing Subsidy');
  assert.equal(marked.grossUp.target, 3000);
  assert.ok(Math.abs(marked.grossUp.employerTax - (tableTax(base.taxableIncome) - tableTax(base.taxableIncome - 3000))) < 0.01, 'the employer pays the tax the subsidy adds');
  assert.ok(Math.abs(marked.withholdingTax - tableTax(base.taxableIncome - 3000)) < 0.02, 'the rest of the pay is taxed as usual');

  const unmarked = run(policy({ targetType: 'Specific earning or allowance' }), { withSubsidy: true, setups: [{ ...markedSetup, grossUp: 'No' }] });
  assert.equal(unmarked.grossUp, null);
  assert.ok(unmarked.exceptions.some(item => /marked "Gross up this earning"/.test(item.message)));
  assert.ok(Math.abs(unmarked.withholdingTax - base.withholdingTax) < 0.01);
});

test('a Final Tax gross up applies the approved rate to the marked earning', () => {
  const base = without({ withSubsidy: true });
  const line = run(policy({ method: 'Final Tax', incomeType: 'FT-003', targetType: 'Specific earning or allowance', employerSharePercent: 0 }), { withSubsidy: true, setups: [markedSetup] });
  assert.equal(line.grossUp.rate, 20);
  assert.ok(Math.abs(line.grossUp.grossedUp - 3000 / 0.8) < 0.01, 'gross less final tax equals the 3,000 guaranteed');
  assert.ok(Math.abs(line.grossUp.employeeTax - line.grossUp.grossedUp * 0.2) < 0.01);
  assert.ok(Math.abs(line.withholdingTax - (tableTax(base.taxableIncome - 3000) + line.grossUp.employeeTax)) < 0.02);
  assert.ok(Math.abs((line.grossUp.grossedUp - line.grossUp.employeeTax) - 3000) < 0.01);
});

test('an annualized gross up settles tax against the year to date', () => {
  const line = run(policy({ method: 'Annualized Compensation', employerSharePercent: 0 }));
  assert.equal(line.grossUp.method, 'Annualized Compensation');
  assert.match(line.taxBasis, /Annualised.*gross up/);
  assert.ok(line.grossUp.converged);
  assert.ok(Math.abs(line.grossUp.grossedUp - line.grossUp.employeeTax - line.grossUp.target) < 0.02, 'gross less the employee tax equals the target');
});

test('the policy decides who is covered and whether it is on', () => {
  const named = run(policy({ assignment: { scope: 'Specific Employees', group: 'All Employees', department: '', employees: ['NOT-THIS-ONE'] } }));
  assert.equal(named.grossUp, null);
  assert.ok(named.exceptions.some(item => /Gross Up policy covers/.test(item.message)));
  assert.ok(named.withholdingTax > 0, 'an employee the policy does not cover is taxed as usual');

  const off = run(policy({ enabled: false }));
  assert.equal(off.grossUp, null);
  assert.ok(off.exceptions.some(item => /switched off/.test(item.message)));

  const nobody = run(policy(), { config: {} });
  assert.equal(nobody.grossUp, null, 'nobody is grossed up unless the run or the employee asks for it');
});

test('rounding and the iteration limit come from the policy', () => {
  const peso = run(policy({ employerSharePercent: 50, roundingMode: 'Round to peso' }));
  assert.equal(peso.grossUp.grossedUp, Math.round(peso.grossUp.grossedUp));
  const stuck = run(policy({ employerSharePercent: 50, maxIterations: 1, tolerance: 0.0001 }));
  assert.equal(stuck.grossUp.converged, false);
  assert.ok(stuck.exceptions.some(item => /did not converge/.test(item.message)));
});

test('a direct-tax employee is still not grossed up on the compensation table', () => {
  const direct = { ...employee(), payroll: { ...employee().payroll, taxType: 'Direct', directTaxRate: 10 } };
  const line = computeEmployeeLine({ employee: direct, transaction: transaction({ grossUpAll: true }), context: context({ grossUp: policy() }) });
  assert.equal(line.grossUp, null);
  assert.ok(line.exceptions.some(item => /Gross up covers periodic compensation tax only/.test(item.message)));
});
