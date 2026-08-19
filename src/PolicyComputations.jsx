import { useEffect, useMemo, useState } from 'react';
import { useRef } from 'react';
import {
  ArrowsDownUp,
  Calculator,
  CaretRight,
  CheckCircle,
  Info,
  Lock,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  ShieldCheck,
  Table,
  Trash,
  Warning,
  X,
} from '@phosphor-icons/react';
import { companyRuleTaxonomy } from './requirementsCatalog';
import { getPolicyLinkage, policyCoverageCatalog } from './policyGovernance';
import { withholdingTax } from './statutoryService';
import { codeParameterScopes, completeParameterSchema, defaultParameterSchema, defaultParameterValues, hydratePolicyCode, parameterSchemaError, PolicyParameterFields } from './PolicyParameters';
import { configuredCollectionByCode } from './payrollIntegration';
import {
  BASE_OPTIONS, baseAmount, EngineScope, FieldHelp, FieldLabel, money, number, NumberField, Toggle,
} from './PolicyFields';
import { describeAssignment, normalizeAssignment, seedAssignment, ApplicabilityPanel } from './PolicyApplicability';
import { DeferredRecoveryPanel, seedRecovery } from './DeferredDeductions';
import { RetirementEngine, retirementResult } from './RetirementEngine';
import { FinalPayEngine, finalPayResult, HIERARCHY_SOURCES, statutoryRules } from './FinalPayEngine';
import { seedSeparationRules } from './SeparationRules';

export { retirementResult, finalPayResult };
export { roundServiceYears } from './PolicyFields';

// v4: engines gained applicability assignments, staggered recovery, reason-for-leaving
// mapping and a final-pay hierarchy, so a v3 record is not shape-compatible.
const STORAGE_KEY = 'atlas-payroll-policy-engines-v4';
const CODE_STORAGE_KEY = 'atlas-policy-engine-codes-v1';

const baseSeedPolicyCodes = [
  { code: 'THP-001', name: 'Minimum Take-Home Pay', category: 'Pay and Earnings', subcategory: 'Take-Home Pay', engine: 'Take-Home Pay', description: 'Protects the configured minimum net pay after mandatory deductions.', status: 'Active' },
  { code: 'THP-002', name: 'Maximum Controllable Deductions', category: 'Pay and Earnings', subcategory: 'Take-Home Pay', engine: 'Take-Home Pay', description: 'Caps controllable deductions after statutory deductions are applied.', status: 'Active' },
  { code: 'RET-001', name: 'Statutory Retirement Benefit', category: 'Pay and Earnings', subcategory: 'Retirement Pay', engine: 'Retirement Pay', description: 'Calculates the statutory retirement benefit basis.', status: 'Active' },
  { code: 'RET-002', name: 'More Beneficial Retirement Benefit', category: 'Pay and Earnings', subcategory: 'Retirement Pay', engine: 'Retirement Pay', description: 'Selects the higher qualifying statutory or company-plan value.', status: 'Active' },
  { code: 'RET-003', name: 'Retirement Salary Basis and Service History', category: 'Pay and Earnings', subcategory: 'Retirement Pay', engine: 'Retirement Pay', description: 'Identifies the earnings that widen the retirement salary basis and how rehires and breaks in service are credited.', status: 'Active' },
  { code: 'FIN-001', name: 'Final Pay Net Result', category: 'Pay and Earnings', subcategory: 'Final Pay', engine: 'Final Pay', description: 'Computes the net final-pay result from enabled components, selected earnings and authorized offsets.', status: 'Active' },
  { code: 'FIN-002', name: 'Separation Pay by Reason for Leaving', category: 'Pay and Earnings', subcategory: 'Final Pay', engine: 'Final Pay', description: 'Maps each separation reason to its approved separation-pay computation, minimum, rounding and tax treatment.', status: 'Active' },
  { code: 'FIN-003', name: 'Final Pay Hierarchy and Statutory Treatment', category: 'Pay and Earnings', subcategory: 'Final Pay', engine: 'Final Pay', description: 'Controls the final-pay adjustment order and whether statutory contributions are computed on separation.', status: 'Active' },
  { code: 'ERN-001', name: 'Basic Pay for Period', category: 'Pay and Earnings', subcategory: 'Basic Pay', engine: 'Earnings', description: 'Computes basic pay for the active payroll period.', status: 'Active' },
  { code: 'ERN-003', name: 'Night Differential', category: 'Pay and Earnings', subcategory: 'Earnings and Allowances', engine: 'Earnings', description: 'Computes night differential earnings using the assigned premium multiplier.', status: 'Active' },
  { code: 'DED-001', name: 'Absence Deduction', category: 'Attendance & Timekeeping', subcategory: 'Absences', engine: 'Deductions', description: 'Computes unpaid absence deductions from the daily rate.', status: 'Active' },
  { code: 'DED-002', name: 'Tardiness Deduction', category: 'Attendance & Timekeeping', subcategory: 'Tardiness', engine: 'Deductions', description: 'Computes tardiness using the assigned minute rate.', status: 'Active' },
  { code: 'SCH-001', name: 'Standard Workday Hours', category: 'Time Management & Scheduling', subcategory: 'Shift Schedule Creation', engine: 'Time', description: 'Returns the required work hours for the selected shift policy.', status: 'Active' },
  { code: 'BAS-001', name: 'Derived Pay Rates', category: 'Pay and Earnings', subcategory: 'Basic Pay', engine: 'Earnings', description: 'Derives annual, monthly, daily, hourly, and minute rates.', status: 'Active' },
  { code: 'BAS-004', name: 'Effective-Dated Pay Adjustment', category: 'Pay and Earnings', subcategory: 'Pay Rate Adjustments', engine: 'Earnings', description: 'Prorates effective-dated salary changes inside a payroll cutoff.', status: 'Active' },
  { code: 'ERN-004', name: 'Variable Allowance Adjustment', category: 'Pay and Earnings', subcategory: 'Variable Allowances', engine: 'Earnings', description: 'Adjusts allowances using approved days or hours worked.', status: 'Active' },
  { code: 'BON-003', name: 'Annual Bonus Ceiling', category: 'Pay and Earnings', subcategory: '13th Month Pay and Bonuses', engine: 'Bonus', description: 'Applies the shared annual non-taxable bonus ceiling to current and YTD values.', status: 'Active' },
  { code: 'BON-004', name: 'Bonus Priority Allocation', category: 'Pay and Earnings', subcategory: '13th Month Pay and Bonuses', engine: 'Bonus', description: 'Allocates remaining non-taxable ceiling by configured bonus priority.', status: 'Active' },
  { code: 'DMN-001', name: 'De Minimis Ceiling', category: 'Pay and Earnings', subcategory: 'De Minimis Benefits', engine: 'Earnings', description: 'Limits each benefit to its effective de minimis ceiling.', status: 'Active' },
  { code: 'RCL-001', name: 'Earning Reclassification', category: 'Pay and Earnings', subcategory: 'Earning Reclassification', engine: 'Earnings', description: 'Moves YTD earning values between taxable and non-taxable codes.', status: 'Active' },
  { code: 'GUP-001', name: 'Guaranteed Net Gross-Up', category: 'Pay and Earnings', subcategory: 'Gross Up', engine: 'Tax', description: 'Iterates gross and withholding tax until the required net is reached.', status: 'Active' },
  { code: 'PRT-001', name: 'Part-Time Pay', category: 'Pay and Earnings', subcategory: 'Part-Timers', engine: 'Earnings', description: 'Computes part-time pay from approved units and assigned rates.', status: 'Active' },
  { code: 'OJT-001', name: 'OJT Allowance', category: 'Pay and Earnings', subcategory: 'OJT Allowance', engine: 'Earnings', description: 'Computes OJT allowance from approved attendance units.', status: 'Active' },
  { code: 'PCE-001', name: 'Piece-Rate Earnings', category: 'Pay and Earnings', subcategory: 'Piece Rate', engine: 'Earnings', description: 'Computes earnings from approved production units.', status: 'Active' },
  { code: 'DED-003', name: 'Undertime Deduction', category: 'Attendance & Timekeeping', subcategory: 'Undertime', engine: 'Deductions', description: 'Computes undertime using the per-minute rate.', status: 'Active' },
  { code: 'ERN-002', name: 'Overtime Pay', category: 'Attendance & Timekeeping', subcategory: 'Overtime', engine: 'Earnings', description: 'Computes overtime using the assigned type, basis, and multiplier.', status: 'Active' },
  { code: 'HOL-002', name: 'Holiday Adjacency Eligibility', category: 'Attendance & Timekeeping', subcategory: 'Holiday Adjacency', engine: 'Time', description: 'Evaluates attendance or leave immediately before and after holidays.', status: 'Active' },
  { code: 'CAL-001', name: 'Frequency-Aware Payroll Cutoff', category: 'Time Management & Scheduling', subcategory: 'Payroll Cutoffs', engine: 'Time', description: 'Limits period choices to the employee payroll frequency.', status: 'Active' },
  { code: 'LEV-001', name: 'Leave Accrual', category: 'Leave Management', subcategory: 'Leave Accrual', engine: 'Leave', description: 'Evaluates leave accrual eligibility, frequency, and rate.', status: 'Active' },
  { code: 'LVC-001', name: 'Leave Conversion', category: 'Leave Management', subcategory: 'Leave Conversion', engine: 'Leave', description: 'Converts eligible unused leave under the active tax rule.', status: 'Active' },
  { code: 'LEV-003', name: 'Leave Forfeiture', category: 'Leave Management', subcategory: 'Leave Forfeiture', engine: 'Leave', description: 'Forfeits expiring balances and raises advance notifications.', status: 'Active' },
  { code: 'LOA-001', name: 'Company Loan Amortization', category: 'Loans & Deductions', subcategory: 'Company Loans', engine: 'Deductions', description: 'Maintains amortization and outstanding company-loan balances.', status: 'Active' },
  { code: 'GLO-001', name: 'Government Loan Amortization', category: 'Loans & Deductions', subcategory: 'Government Loans', engine: 'Deductions', description: 'Maintains scheduled government-loan deductions and balances.', status: 'Active' },
  { code: 'HIE-001', name: 'Deduction and Loan Hierarchy', category: 'Loans & Deductions', subcategory: 'Deduction Hierarchy', engine: 'Take-Home Pay', description: 'Applies the company adjustment order while preserving statutory items.', status: 'Active' },
  { code: 'DEF-001', name: 'Deferred and Staggered Deduction Recovery', category: 'Loans & Deductions', subcategory: 'Deferred Deductions', engine: 'Take-Home Pay', description: 'Carries outstanding amounts forward with their original and revised due dates, and controls when recovery is staggered, approved and authorized.', status: 'Active' },
  { code: 'GOV-001', name: 'Mandatory Statutory Deductions', category: 'Government & Company Compliance', subcategory: 'Statutory Deductions', engine: 'Government', description: 'Applies withholding tax and mandatory contributions in full.', status: 'Active' },
  { code: 'TAX-008', name: 'Annualized Withholding Tax', category: 'Government & Company Compliance', subcategory: 'Tax Annualization', engine: 'Tax', description: 'Projects tax from current and previous-employer YTD values.', status: 'Active' },
  { code: 'BNK-001', name: 'Bank Allocation Validation', category: 'Government & Company Compliance', subcategory: 'Multiple Bank Accounts', engine: 'Payroll', description: 'Validates unique bank records and net-pay allocation limits.', status: 'Active' },
  { code: 'TIN-001', name: 'Duplicate TIN Validation', category: 'Government & Company Compliance', subcategory: 'Duplicate TIN Validation', engine: 'Compliance', description: 'Warns when a TIN is already assigned to another employee.', status: 'Active' },
  { code: 'MWE-001', name: 'Minimum Wage and ECOLA', category: 'Government & Company Compliance', subcategory: 'Minimum Wage and ECOLA', engine: 'Government', description: 'Applies the effective regional minimum wage and ECOLA.', status: 'Active' },
  { code: 'CST-001', name: 'Cost Allocation Validation', category: 'Payroll Administration & Controls', subcategory: 'Cost Allocation', engine: 'Payroll', description: 'Requires payroll allocation percentages to total 100%.', status: 'Active' },
  { code: 'CUR-001', name: 'Effective Exchange Rate', category: 'Payroll Administration & Controls', subcategory: 'Multi-Currency', engine: 'Payroll', description: 'Converts payroll using the effective processing or payout-date rate.', status: 'Active' },
  { code: 'CAL-002', name: 'Company Payroll Calendar', category: 'Payroll Administration & Controls', subcategory: 'Payroll Calendar', engine: 'Payroll', description: 'Controls payout, processing, cutoff, statutory, and billing dates.', status: 'Active' },
  { code: 'NOT-001', name: 'Payroll Exception Notification', category: 'Payroll Administration & Controls', subcategory: 'Notifications', engine: 'Payroll', description: 'Notifies the configured audience about payroll exceptions and deadlines.', status: 'Active' },
  { code: 'APR-001', name: 'Payroll Approval Hierarchy', category: 'Payroll Administration & Controls', subcategory: 'Approval Hierarchy', engine: 'Payroll', description: 'Routes overrides and exceptions to the configured approvers.', status: 'Active' },
  { code: 'SEC-001', name: 'Inactive Session Timeout', category: 'Security & Access Controls', subcategory: 'Session Timeout', engine: 'Compliance', description: 'Signs out inactive users and records the event.', status: 'Active' },
  { code: 'SEC-002', name: 'Sensitive Action Passphrase', category: 'Security & Access Controls', subcategory: 'Passphrase', engine: 'Compliance', description: 'Requires passphrase verification for sensitive payroll actions.', status: 'Active' },
  { code: 'SEC-003', name: 'Role-Based Access Control', category: 'Security & Access Controls', subcategory: 'Role-Based Access', engine: 'Compliance', description: 'Evaluates assigned role privileges for modules and features.', status: 'Active' },
  { code: 'SEC-004', name: 'Single Sign-On Policy', category: 'Security & Access Controls', subcategory: 'Single Sign-On', engine: 'Compliance', description: 'Applies company SSO and identity status requirements.', status: 'Active' },
];

const supplementalPolicyCodes = [
  ['REI-001', 'Reimbursement and Receivable Classification', 'Pay and Earnings', 'Reimbursements and Receivables', 'Classifies reimbursements and receivables and controls their gross-pay and take-home treatment.'],
  ['BEN-006', 'Configured Employee Benefits', 'Pay and Earnings', 'Benefits', 'Connects configured maternity, sickness, provident, pension, and other benefits to their approved basis.'],
  ['BRK-001', 'Paid Break Control', 'Attendance & Timekeeping', 'Break Hours', 'Applies paid-break duration and excess-break handling.'],
  ['TIM-001', 'Time Punch Validation', 'Time Management & Scheduling', 'Time In & Time Out', 'Validates missing or incomplete time punches against assigned schedules.'],
  ['WRK-001', 'Standard Work Hours', 'Time Management & Scheduling', 'Work Hours', 'Provides the standard daily work-hour basis used by derived payroll rates.'],
  ['RST-001', 'Rest Day Eligibility', 'Time Management & Scheduling', 'Rest Days', 'Determines rest-day eligibility and the applicable premium reference.'],
  ['HOL-001', 'Holiday Eligibility and Premium', 'Time Management & Scheduling', 'Holidays', 'Resolves the effective holiday type, calendar, and premium rate.'],
  ['LEV-002', 'Leave Balance Validation', 'Leave Management', 'Leave Balances', 'Validates available and negative leave balances before payroll.'],
  ['SIL-001', 'Service Incentive Leave', 'Leave Management', 'Service Incentive Leave', 'Applies service eligibility, annual credits, conversion, and ceiling rules.'],
  ['LWP-001', 'Paid Leave Earnings', 'Leave Management', 'Leave with Pay', 'Computes approved paid leave from the configured leave and earning basis.'],
  ['LWO-001', 'Unpaid Leave Deduction', 'Leave Management', 'Leave without Pay', 'Computes approved unpaid leave using the assigned deduction basis.'],
  ['DED-004', 'Company Deduction Schedule', 'Loans & Deductions', 'Company Deductions', 'Schedules company deductions by code, frequency, period, hold rule, and priority.'],
  ['GOV-004', 'Government Contribution Basis', 'Government & Company Compliance', 'Government Contributions', 'Selects the effective SSS, PhilHealth, and Pag-IBIG contribution versions.'],
  ['FMT-001', 'Payroll Date and Number Format', 'Payroll Administration & Controls', 'Date and Number Formats', 'Applies company date, currency, and decimal display rules.'],
  ['ALT-001', 'Net Pay Allotment Validation', 'Payroll Administration & Controls', 'Allotments', 'Validates allotment accounts and prevents allocations above net pay.'],
  ['PAY-003', 'Payslip Disclosure Rules', 'Payroll Administration & Controls', 'Payslip Rules', 'Controls the active payslip template, YTD values, and deferred-deduction disclosure.'],
  ['INT-001', 'Connected System Payroll Gate', 'Payroll Administration & Controls', 'Connected Systems', 'Applies synchronization timing and failed-integration posting controls.'],
].map(([code, name, category, subcategory, description]) => ({
  code, name, category, subcategory, description, status: 'Active',
  engine: getPolicyLinkage({ category, subcategory }).engine,
}));

const seedPolicyCodes = [...baseSeedPolicyCodes, ...supplementalPolicyCodes];

function currentEngineParameterValues(item) {
  const policies = readPolicies();
  const policy = item.subcategory === 'Take-Home Pay'
    ? policies.takeHome
    : item.subcategory === 'Retirement Pay'
      ? policies.retirement
      : item.subcategory === 'Final Pay'
        ? policies.finalPay
        : item.subcategory === 'Deferred Deductions'
          ? { ...policies.takeHome, ...policies.takeHome.recovery }
          : null;
  if (!policy) return defaultParameterValues(defaultParameterSchema(item));
  // Engine state that a policy code exposes under a different key than the
  // engine stores it: component checkboxes, multi-selects, and applicability.
  const derived = {
    employeeGroup: normalizeAssignment(policy.assignment).scope,
    includeUnpaidSalary: policy.components?.['Unpaid Salary'],
    includeProratedThirteenth: policy.components?.['Prorated 13th month pay'],
    includeSILConversion: policy.components?.['SIL conversion'],
    includeSeparationPay: policy.components?.['Separation pay'],
    includeRetirementPay: policy.components?.['Retirement pay'],
    includeFinalTax: policy.components?.['Final tax computation'],
    includeConvertibleLeave: policy.optionalComponents?.['Convertible VL / SL beyond SIL'],
    includeCashBondReturn: policy.optionalComponents?.['Cash bond return'],
    includeGratuity: policy.optionalComponents?.['Gratuity pay'],
    includedEarnings: policy.includedEarnings?.join(', '),
    includedDeductions: policy.includedDeductions?.join(', '),
    salaryBasisEarnings: policy.salaryBasisEarnings?.join(', '),
    separationRules: policy.separationRules ? `${policy.separationRules.filter(rule => rule.formula !== 'Not applicable').length} of ${policy.separationRules.length} reasons pay separation` : undefined,
  };
  return Object.fromEntries(defaultParameterSchema(item).map(parameter => {
    const value = derived[parameter.key] !== undefined ? derived[parameter.key] : policy[parameter.key];
    return [parameter.key, typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value ?? parameter.defaultValue ?? ''];
  }));
}

export function readPolicyCodes() {
  try {
    const saved = JSON.parse(localStorage.getItem(CODE_STORAGE_KEY));
    const seeds = seedPolicyCodes.map(item => ({ ...hydratePolicyCode({ ...item, isBuiltIn: true }), isBuiltIn: true, parameterValues: currentEngineParameterValues(item) }));
    if (!Array.isArray(saved)) return seeds;
    return [...seeds, ...saved.filter(item => !seedPolicyCodes.some(seed => seed.code === item.code)).map(item => ({ ...hydratePolicyCode(item), isBuiltIn: false }))];
  } catch { return seedPolicyCodes.map(item => ({ ...hydratePolicyCode({ ...item, isBuiltIn: true }), isBuiltIn: true, parameterValues: currentEngineParameterValues(item) })); }
}

export function savePolicyCode(record) {
  const custom = readPolicyCodes().filter(item => !seedPolicyCodes.some(seed => seed.code === item.code));
  const next = [...custom.filter(item => item.code !== record.code), record];
  localStorage.setItem(CODE_STORAGE_KEY, JSON.stringify(next));
  return readPolicyCodes();
}

export function deletePolicyCode(code) {
  const custom = readPolicyCodes().filter(item => !item.isBuiltIn && item.code !== code);
  localStorage.setItem(CODE_STORAGE_KEY, JSON.stringify(custom));
  return readPolicyCodes();
}

/** Reference table that owns the deduction and loan adjustment order (BRD row 47). */
export const HIERARCHY_REFERENCE_CODE = 'REF-011';

const seedPolicies = {
  takeHome: {
    enabled: true,
    assignment: seedAssignment(),
    recovery: seedRecovery(),
    base: 'Gross Pay less reimbursements / receivables',
    thresholdType: 'Percentage',
    threshold: 30,
    priorityChoice: 'Take-Home Pay',
    deductionCapEnabled: true,
    deductionCapBase: 'Gross Pay',
    deductionCapType: 'Percentage',
    deductionCap: 40,
    loanCapBase: 'Gross Pay',
    loanCapType: 'Percentage',
    loanCap: 25,
    attendanceCapBase: 'Gross Pay',
    attendanceCapType: 'Number of Days',
    attendanceCap: 3,
    autoDefer: true,
    carryForward: true,
    payslipTagging: true,
    notifyEmployee: true,
    scenario: {
      'HMO': { due: 1200, priorDeferred: 0, outstanding: 7200 },
      'Educational Loan': { due: 1500, priorDeferred: 0, outstanding: 18000 },
      'Salary Loan': { due: 2500, priorDeferred: 500, outstanding: 30000 },
      'SSS Salary Loan': { due: 1000, priorDeferred: 0, outstanding: 12000 },
      'HDMF Salary Loan': { due: 800, priorDeferred: 0, outstanding: 9600 },
      'SSS Calamity Loan': { due: 700, priorDeferred: 0, outstanding: 8400 },
      'Optional deductions': { due: 750, priorDeferred: 250, outstanding: 750 },
      'Lates, Absences & Undertime': { due: 900, priorDeferred: 0, outstanding: 900 },
    },
    test: { basicPay: 30000, grossPay: 36500, reimbursements: 2000, statutory: 6500, attendanceDays: 4, currentPayrollDate: '2026-08-15', nextPayrollDate: '2026-08-31' },
  },
  retirement: {
    enabled: true,
    assignment: seedAssignment(),
    planType: 'Best of statutory and company plan',
    salaryBasis: 'Latest monthly basic pay',
    salaryBasisSource: 'Earnings classified as Retirement',
    salaryBasisEarnings: [],
    serviceHistoryRule: 'Credit prior service, exclude the break',
    dailyRateDivisor: 30,
    statutoryDays: 22.5,
    companyDays: 30,
    additionalBenefits: 15000,
    rounding: 'Six months or more counts as one year',
    minimumAge: 60,
    compulsoryAge: 65,
    minimumServiceYears: 5,
    earlyRetirementAge: 55,
    minimumGuarantee: 0,
    maximumCap: 0,
    taxExemption: 'Evaluate RA 7641 / NIRC and RA 4917',
    companyPlanApproved: true,
    transaction: { method: 'Calculate using the Retirement Pay engine', selected: ['E-1042', 'E-2288'], overrides: {} },
    test: {
      dateOfBirth: '1964-01-15', dateHired: '2014-02-01', retirementDate: '2026-08-31',
      monthlyBasic: 60000, average36Months: 55000,
      priorServiceYears: 0, breakMonths: 0,
      earningAmounts: { 47218663: 3000, 47218664: 1500 },
      reason: 'Retirement', memberPlan: 'Company plan member',
    },
  },
  grossUp: {
    enabled: true,
    assignment: seedAssignment(),
    targetType: 'Net pay',
    taxMethod: 'Graduated withholding table',
    frequency: 'Monthly',
    effectiveDate: '2026-08-31',
    flatRate: 25,
    employerSharePercent: 100,
    includeStatutoryInTaxable: true,
    roundingMode: 'Round to centavo',
    tolerance: 0.01,
    maxIterations: 50,
    test: { targetNet: 50000, statutoryEmployee: 1875, nonTaxableAllowance: 0, ytdTaxableIncome: 0 },
  },
  finalPay: {
    enabled: true,
    assignment: seedAssignment(),
    components: {
      'Unpaid Salary': true,
      'Prorated 13th month pay': true,
      'SIL conversion': true,
      'Separation pay': true,
      'Retirement pay': true,
      'Final tax computation': true,
    },
    optionalComponents: {
      'Convertible VL / SL beyond SIL': true,
      'Cash bond return': true,
      'Gratuity pay': false,
    },
    includedEarnings: ['47218656', '47218661'],
    includedDeductions: ['CL-001', 'GL-001', 'DED-001'],
    separationRules: seedSeparationRules(),
    hierarchySource: HIERARCHY_SOURCES[1],
    finalPayRanks: {},
    statutoryRule: statutoryRules[2],
    leaveConversionRule: 'Use the convertible leave types and caps in Leave Configuration',
    dailyRateDivisor: 30,
    advanceThirteenthRule: 'Deduct any advanced 13th month release',
    lastCutoffRule: 'Include the unposted last cutoff',
    governmentLoanRule: 'Offset the full outstanding balance',
    companyLoanRule: 'Offset the full outstanding balance',
    negativeNetPayRule: 'Raise for approval and bill the employee',
    autoOffsetDeductions: true,
    notifyAdmin: true,
    transaction: { method: 'Calculate using the Final Pay engine', selected: ['E-3391', 'E-6613'] },
    test: {
      // Seeded from E-3391 so the scenario carries the same masterfile inputs
      // the Retirement engine needs when it is asked for a qualifying benefit.
      employeeCode: 'E-3391',
      dateHired: '2016-03-01', dateOfBirth: '1972-09-20', separationDate: '2026-07-31',
      reasonForLeaving: 'Redundancy', reason: 'Redundancy', memberPlan: 'Company plan member',
      monthlyBasic: 78000, average36Months: 74000, priorServiceYears: 0, breakMonths: 0,
      unpaidSalary: 26000, thirteenthMonth: 32000, silConversion: 9100,
      convertibleLeave: 7300, cashBond: 5000, gratuity: 0,
      advanceThirteenth: 8000, statutoryContributions: 2400, finalTax: 4300,
      computeStatutory: false,
      earningAmounts: { 47218656: 2500, 47218661: 1800 },
      offsetAmounts: { 'GL-001': 0, 'CL-001': 14000, 'DED-001': 500 },
    },
  },
};

/** Adjustment order used when the REF-011 reference table has no usable rows. */
const fallbackHierarchy = [
  { name: 'Statutory deductions', rank: 0, group: 'Statutory', kind: 'Statutory' },
  { name: 'HMO', rank: 1, group: 'Loan', kind: 'Company-mandated' },
  { name: 'Educational Loan', rank: 2, group: 'Loan', kind: 'Company-mandated' },
  { name: 'Salary Loan', rank: 3, group: 'Loan', kind: 'Company-mandated' },
  { name: 'SSS Salary Loan', rank: 4, group: 'Loan', kind: 'Government' },
  { name: 'HDMF Salary Loan', rank: 5, group: 'Loan', kind: 'Government' },
  { name: 'SSS Calamity Loan', rank: 6, group: 'Loan', kind: 'Government' },
  { name: 'Optional deductions', rank: 7, group: 'Deduction', kind: 'Optional' },
  { name: 'Lates, Absences & Undertime', rank: 8, group: 'Deduction', kind: 'Attendance' },
];

/**
 * Reads the adjustment order out of the REF-011 reference table. Each entry
 * stores the item name in `key`, the rank in `value`, and "Group · Kind" in
 * `note` (for example "Loan · Government").
 */
export function readHierarchy(references) {
  const table = references?.find(item => item.code === HIERARCHY_REFERENCE_CODE);
  const rows = (table?.entries || [])
    .map(entry => {
      const [group = 'Deduction', kind = '', code = '', sourceLabel = 'Reference table'] = String(entry.note || '').split(/\s*(?:·|Â·)\s*/).map(part => part.trim());
      const configured = configuredCollectionByCode(code);
      return {
        name: entry.key,
        rank: Number(entry.value),
        group,
        kind,
        code,
        sourceLabel,
        sourceModule: configured?.sourceModule,
        due: configured?.due || 0,
        outstanding: configured?.outstanding || configured?.due || 0,
        treatment: configured?.treatment || (group === 'Statutory' ? 'Deduct in Full' : 'Partial Deduction'),
        canAdjust: configured ? configured.canAdjust : group !== 'Statutory',
      };
    })
    .filter(entry => entry.name && Number.isFinite(entry.rank));
  return rows.length ? rows.sort((a, b) => a.rank - b.rank) : fallbackHierarchy;
}

/** Merges one saved section over its seed, keeping nested blocks addable. */
const mergeSection = (seed, saved = {}) => ({
  ...seed,
  ...saved,
  assignment: normalizeAssignment(saved.assignment || seed.assignment),
  test: { ...seed.test, ...saved.test },
  ...(seed.recovery ? { recovery: { ...seed.recovery, ...saved.recovery } } : {}),
  ...(seed.transaction ? { transaction: { ...seed.transaction, ...saved.transaction } } : {}),
  ...(seed.scenario ? { scenario: { ...seed.scenario, ...saved.scenario } } : {}),
  ...(seed.separationRules ? { separationRules: saved.separationRules?.length ? saved.separationRules : seed.separationRules } : {}),
});

export function readPolicies() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return seedPolicies;
    return Object.fromEntries(Object.entries(seedPolicies).map(([key, seed]) => [key, mergeSection(seed, saved[key])]));
  } catch { return seedPolicies; }
}

export function takeHomeResult(policy, hierarchy) {
  const test = policy.test;
  const gross = number(test.grossPay);
  const protectedBase = baseAmount(policy.base, test);
  const protectedMinimum = policy.thresholdType === 'Fixed Amount' ? number(policy.threshold) : protectedBase * number(policy.threshold) / 100;

  const items = hierarchy
    .filter(entry => entry.group !== 'Statutory')
    .map(entry => {
      const scenario = policy.scenario?.[entry.code] || policy.scenario?.[entry.name] || {};
      const due = scenario.due === undefined ? number(entry.due) : number(scenario.due);
      return {
        ...entry,
        due,
        deducted: due,
        deferred: 0,
        priorDeferred: number(scenario.priorDeferred),
        outstanding: scenario.outstanding === undefined ? number(entry.outstanding) || due : number(scenario.outstanding),
        // The date the amount was originally due stays on the record even after
        // the item is rescheduled.
        originalDueDate: scenario.originalDueDate || test.currentPayrollDate,
      };
    })
    .sort((a, b) => a.rank - b.rank);

  // Rank 1 is adjusted first, so deferrals walk the hierarchy in ascending rank.
  const deferFrom = (candidates, requested) => {
    let remaining = Math.max(0, requested);
    [...candidates].filter(item => item.canAdjust !== false).sort((a, b) => a.rank - b.rank).forEach(item => {
      if (remaining <= 0) return;
      const amount = Math.min(item.deducted, remaining);
      item.deducted -= amount; item.deferred += amount; remaining -= amount;
    });
    return remaining;
  };
  const capAmount = (type, base, value, fallback) => {
    if (type === 'Fixed Amount') return number(value);
    if (type === 'Percentage') return baseAmount(base, test) * number(value) / 100;
    return fallback;
  };

  const loans = items.filter(item => item.group === 'Loan');
  const attendance = items.filter(item => item.kind === 'Attendance');
  const otherDeductions = items.filter(item => item.group === 'Deduction' && item.kind !== 'Attendance');

  if (policy.deductionCapEnabled) {
    const capped = [...otherDeductions, ...attendance];
    const total = capped.reduce((sum, item) => sum + item.deducted, 0);
    deferFrom(capped, total - capAmount(policy.deductionCapType, policy.deductionCapBase, policy.deductionCap, total));
  }

  const loanTotal = loans.reduce((sum, item) => sum + item.deducted, 0);
  deferFrom(loans, loanTotal - capAmount(policy.loanCapType, policy.loanCapBase, policy.loanCap, loanTotal));

  if (attendance.length) {
    const attendanceDue = attendance.reduce((sum, item) => sum + item.deducted, 0);
    let cap = attendanceDue;
    if (policy.attendanceCapType === 'Number of Days') {
      const days = number(test.attendanceDays);
      if (days > number(policy.attendanceCap)) cap = attendanceDue * number(policy.attendanceCap) / Math.max(1, days);
    } else {
      cap = capAmount(policy.attendanceCapType, policy.attendanceCapBase, policy.attendanceCap, attendanceDue);
    }
    deferFrom(attendance, attendanceDue - cap);
  }

  const mandatory = number(test.statutory);
  const preliminaryNet = gross - mandatory - items.reduce((sum, item) => sum + item.deducted, 0);
  // Conflict rule: protecting the loan cap means loans keep collecting and the
  // shortfall becomes an exception instead of a deeper loan deferral.
  const adjustable = policy.priorityChoice === 'Loan Deduction Cap' ? items.filter(item => item.group !== 'Loan') : items;
  if (policy.enabled && policy.autoDefer && preliminaryNet < protectedMinimum) deferFrom(adjustable, protectedMinimum - preliminaryNet);

  const deducted = items.reduce((sum, item) => sum + item.deducted, 0);
  const finalNet = gross - mandatory - deducted;
  const deferred = items.reduce((sum, item) => sum + item.deferred, 0);
  const ledger = items.map(item => ({
    ...item,
    accumulated: item.priorDeferred + item.deferred,
    remaining: Math.max(0, item.outstanding - item.deducted),
  }));
  return {
    protectedBase, protectedMinimum, mandatory, ledger, finalNet, deferred, deducted,
    originalDeductions: items.reduce((sum, item) => sum + item.due, 0),
    exception: finalNet + 0.005 < protectedMinimum,
    shortfall: Math.max(0, protectedMinimum - finalNet),
    capBlocked: policy.priorityChoice === 'Loan Deduction Cap' && finalNet + 0.005 < protectedMinimum,
  };
}

export function grossUpResult(policy, test = policy.test) {
  const targetNet = number(test.targetNet);
  const statutory = number(test.statutoryEmployee);
  const nonTaxable = number(test.nonTaxableAllowance);
  const ytd = number(test.ytdTaxableIncome);
  const employerShare = Math.min(100, Math.max(0, number(policy.employerSharePercent))) / 100;
  const tolerance = Math.max(0.0001, number(policy.tolerance));
  const maxIterations = Math.max(1, Math.round(number(policy.maxIterations)));
  const flat = policy.taxMethod === 'Flat / final tax rate';

  // Withholding on a candidate gross, using the effective table or a flat rate.
  const taxOn = gross => {
    const taxable = Math.max(0, gross + (policy.includeStatutoryInTaxable ? 0 : statutory) - (policy.includeStatutoryInTaxable ? statutory : 0));
    if (flat) return { tax: Math.max(0, taxable * number(policy.flatRate) / 100), bracket: null, taxable };
    const period = withholdingTax(taxable + ytd, policy.frequency, policy.effectiveDate);
    const base = ytd > 0 ? withholdingTax(ytd, policy.frequency, policy.effectiveDate).tax : 0;
    return { tax: Math.max(0, period.tax - base), bracket: period.bracket, taxable };
  };

  // Net the employee actually receives for a candidate gross.
  const netOf = gross => {
    const { tax } = taxOn(gross);
    return gross + nonTaxable - statutory - tax * (1 - employerShare);
  };

  const iterations = [];
  let gross = targetNet + statutory - nonTaxable;
  let converged = false;
  for (let step = 0; step < maxIterations; step += 1) {
    const { tax, bracket, taxable } = taxOn(gross);
    const net = gross + nonTaxable - statutory - tax * (1 - employerShare);
    const gap = targetNet - net;
    iterations.push({ step: step + 1, gross, taxable, tax, net, gap, bracket });
    if (Math.abs(gap) <= tolerance) { converged = true; break; }
    // Newton-style step using the local slope of net with respect to gross.
    const probe = gross + 1;
    const slope = netOf(probe) - net;
    gross += Math.abs(slope) > 1e-9 ? gap / slope : gap;
    if (gross < 0) gross = 0;
  }

  const rounded = policy.roundingMode === 'Round to peso' ? Math.round(gross) : Math.round(gross * 100) / 100;
  const final = taxOn(rounded);
  const employerAbsorbed = final.tax * employerShare;
  const employeeWithheld = final.tax - employerAbsorbed;
  return {
    targetNet,
    grossTaxable: rounded,
    taxableCompensation: final.taxable,
    withholdingTax: final.tax,
    employerAbsorbed,
    employeeWithheld,
    statutory,
    nonTaxable,
    employeeNet: rounded + nonTaxable - statutory - employeeWithheld,
    employerCost: rounded + nonTaxable + employerAbsorbed,
    bracket: final.bracket,
    iterations,
    converged,
    method: flat ? 'Flat / final tax rate' : 'Graduated withholding table',
    tableMissing: !flat && !final.bracket,
  };
}

function HierarchyPanel({ hierarchy, scenario, onScenario, onManageHierarchy, onOpenService, sourced }) {
  const groups = [
    ['Hierarchy of Deductions', hierarchy.filter(item => item.group === 'Deduction')],
    ['Hierarchy of Loans', hierarchy.filter(item => item.group === 'Loan')],
  ];
  return <>
    <div className="deduction-rank-heading">
      <div>
        <h3>Deduction and loan hierarchy <FieldHelp helpKey="deductionHierarchy" /></h3>
        <p>Rank 1 is adjusted first. Statutory deductions are always applied in full and never deferred.</p>
      </div>
      <div className="hierarchy-actions"><button className="button secondary small" onClick={onManageHierarchy}><Table /> Manage ranks in {HIERARCHY_REFERENCE_CODE}</button><button className="button secondary small" onClick={() => onOpenService?.('deductions')}>Deductions</button><button className="button secondary small" onClick={() => onOpenService?.('loans')}>Company Loans</button><button className="button secondary small" onClick={() => onOpenService?.('governmentLoans')}>Government Loans</button></div>
    </div>
    <div className={`hierarchy-source ${sourced ? 'linked' : 'fallback'}`}>
      <Lock weight="duotone" />
      <span>{sourced
        ? <>Active codes and collection settings come from their owning modules; <strong>{HIERARCHY_REFERENCE_CODE} Deduction and Loan Hierarchy</strong> owns only the adjustment order.</>
        : <>The <strong>{HIERARCHY_REFERENCE_CODE}</strong> reference table has no usable rows, so the Atlas default order is in use.</>}</span>
    </div>
    {groups.map(([title, rows]) => rows.length > 0 && <div className="deduction-rank-table" key={title}>
      <h4>{title}</h4>
      <table>
        <thead><tr><th>Priority</th><th>Collection</th><th>Amount due</th><th>Carry-forward balance</th></tr></thead>
        <tbody>{rows.map(item => {
          const scenarioKey = item.code || item.name;
          const values = scenario[scenarioKey] || scenario[item.name] || {};
          return <tr key={scenarioKey}>
            <td><span className="rank-chip">{item.rank}</span></td>
            <td><strong>{item.name}</strong><small>{item.code || 'System-calculated'} · {item.kind || 'Unclassified'} · {item.treatment || 'Partial Deduction'}</small></td>
            <td><input type="number" min="0" value={values.due ?? item.due ?? 0} onChange={event => onScenario(scenarioKey, 'due', number(event.target.value))} /></td>
            <td><div className="balance-inputs"><label><span>Deferred</span><input type="number" min="0" value={values.priorDeferred ?? 0} onChange={event => onScenario(scenarioKey, 'priorDeferred', number(event.target.value))} /></label><label><span>Outstanding</span><input type="number" min="0" value={values.outstanding ?? item.outstanding ?? 0} onChange={event => onScenario(scenarioKey, 'outstanding', number(event.target.value))} /></label></div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>)}
  </>;
}

function TakeHomeEngine({ policy, setPolicy, hierarchy, sourced, onManageHierarchy, onOpenService, onSave }) {
  const result = useMemo(() => takeHomeResult(policy, hierarchy), [policy, hierarchy]);
  const update = (key, value) => setPolicy(previous => ({ ...previous, [key]: value }));
  const updateTest = (key, value) => setPolicy(previous => ({ ...previous, test: { ...previous.test, [key]: value } }));
  const updateScenario = (name, key, value) => setPolicy(previous => ({ ...previous, scenario: { ...previous.scenario, [name]: { ...previous.scenario[name], [key]: value } } }));
  const deferredRows = result.ledger.filter(item => item.deferred > 0);
  // Recovery covers anything still owed, including balances deferred by an
  // earlier payroll that were not collected this cutoff either.
  const outstandingRows = result.ledger.filter(item => item.deferred > 0 || item.priorDeferred > 0);
  return <div className="policy-engine-grid">
    <section className="policy-config-card">
      <header><span><ShieldCheck weight="duotone" /></span><div><h2>Minimum Take-Home Pay</h2><p>Company policy controls; formula execution remains in Computational Basis.</p></div><button className={`switch ${policy.enabled ? 'on' : ''}`} onClick={() => update('enabled', !policy.enabled)}><span /></button></header>

      <ApplicabilityPanel assignment={normalizeAssignment(policy.assignment)} onChange={value => update('assignment', value)} engineLabel="Take-Home Pay" />

      <h3 className="policy-subheading">Protected minimum</h3>
      <div className="policy-form-grid">
        <FieldLabel label="Protected base" helpKey="protectedBase" scopeKey="base"><select value={policy.base} onChange={event => update('base', event.target.value)}>{BASE_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
        <FieldLabel label="Threshold type" helpKey="thresholdType"><select value={policy.thresholdType} onChange={event => update('thresholdType', event.target.value)}><option>Percentage</option><option>Fixed Amount</option></select></FieldLabel>
        <NumberField label="Threshold" helpKey="threshold" value={policy.threshold} onChange={value => update('threshold', value)} suffix={policy.thresholdType === 'Percentage' ? '%' : 'PHP'} />
        <FieldLabel className="wide" label="Conflict priority" helpKey="conflictPriority" scopeKey="priorityChoice"><select value={policy.priorityChoice} onChange={event => update('priorityChoice', event.target.value)}><option>Take-Home Pay</option><option>Loan Deduction Cap</option></select></FieldLabel>
      </div>

      <h3 className="policy-subheading">Deductions cap</h3>
      <div className="policy-toggle-list"><Toggle value={policy.deductionCapEnabled} onChange={value => update('deductionCapEnabled', value)} helpKey="deductionCapEnabled" label="Apply a total deductions cap" hint="Limit non-loan deductions collected in one payroll period." /></div>
      {policy.deductionCapEnabled && <div className="policy-form-grid">
        <FieldLabel label="Deductions cap base" helpKey="deductionCapBase"><select value={policy.deductionCapBase} onChange={event => update('deductionCapBase', event.target.value)}>{BASE_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
        <FieldLabel label="Deductions cap type" helpKey="deductionCapType"><select value={policy.deductionCapType} onChange={event => update('deductionCapType', event.target.value)}><option>Percentage</option><option>Fixed Amount</option></select></FieldLabel>
        <NumberField label="Deductions cap" helpKey="deductionCap" value={policy.deductionCap} onChange={value => update('deductionCap', value)} suffix={policy.deductionCapType === 'Percentage' ? '%' : 'PHP'} />
      </div>}

      <h3 className="policy-subheading">Loan cap</h3>
      <div className="policy-form-grid">
        <FieldLabel label="Loan cap base" helpKey="loanCapBase"><select value={policy.loanCapBase} onChange={event => update('loanCapBase', event.target.value)}>{BASE_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
        <FieldLabel label="Loan cap type" helpKey="loanCapType"><select value={policy.loanCapType} onChange={event => update('loanCapType', event.target.value)}><option>Percentage</option><option>Fixed Amount</option></select></FieldLabel>
        <NumberField label="Loan cap" helpKey="loanCap" value={policy.loanCap} onChange={value => update('loanCap', value)} suffix={policy.loanCapType === 'Percentage' ? '%' : 'PHP'} />
      </div>

      <h3 className="policy-subheading">Lates, absences and undertime cap</h3>
      <div className="policy-form-grid">
        <FieldLabel label="Attendance cap base" helpKey="attendanceCapBase"><select value={policy.attendanceCapBase} disabled={policy.attendanceCapType === 'Number of Days'} onChange={event => update('attendanceCapBase', event.target.value)}>{BASE_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
        <FieldLabel label="Attendance cap type" helpKey="attendanceCapType"><select value={policy.attendanceCapType} onChange={event => update('attendanceCapType', event.target.value)}><option>Number of Days</option><option>Percentage</option><option>Fixed Amount</option></select></FieldLabel>
        <NumberField label="Attendance cap" helpKey="attendanceCap" value={policy.attendanceCap} onChange={value => update('attendanceCap', value)} suffix={policy.attendanceCapType === 'Number of Days' ? 'days' : policy.attendanceCapType === 'Percentage' ? '%' : 'PHP'} />
      </div>

      <div className="policy-toggle-list">
        <Toggle value={policy.autoDefer} onChange={value => update('autoDefer', value)} helpKey="autoDefer" label="Auto-defer or stagger deductions" hint="Trim lower-priority deductions when earnings are insufficient." />
        <Toggle value={policy.carryForward} onChange={value => update('carryForward', value)} helpKey="carryForward" label="Carry forward to next payroll" hint="Store outstanding amount, rescheduled date and new balance." />
        <Toggle value={policy.payslipTagging} onChange={value => update('payslipTagging', value)} helpKey="payslipTagging" label="Payslip tagging" hint="Show original, deducted, deferred and accumulated balances." />
        <Toggle value={policy.notifyEmployee} onChange={value => update('notifyEmployee', value)} helpKey="notifyEmployee" label="Admin and employee notification" hint="Send an alert when a deduction is deferred or an exception remains." />
      </div>

      <HierarchyPanel hierarchy={hierarchy} scenario={policy.scenario} onScenario={updateScenario} onManageHierarchy={onManageHierarchy} onOpenService={onOpenService} sourced={sourced} />

      {policy.carryForward && <DeferredRecoveryPanel
        rows={outstandingRows}
        recovery={policy.recovery}
        onRecovery={value => update('recovery', value)}
        payrollDate={policy.test.nextPayrollDate}
      />}

      <div className="policy-save"><button className="button primary" onClick={() => onSave(result)}>Save take-home policy</button></div>
    </section>

    <aside className="policy-simulator">
      <header><Calculator weight="duotone" /><div><h2>Scenario simulator</h2><p>Run the BRD decision sequence before using it in payroll.</p></div></header>
      <div className="policy-test-grid">
        <NumberField label="Basic pay" helpKey="basicPay" value={policy.test.basicPay} onChange={value => updateTest('basicPay', value)} />
        <NumberField label="Gross pay" helpKey="grossPay" value={policy.test.grossPay} onChange={value => updateTest('grossPay', value)} />
        <NumberField label="Reimbursements / receivables" helpKey="reimbursements" value={policy.test.reimbursements} onChange={value => updateTest('reimbursements', value)} />
        <NumberField label="Mandatory statutory deductions" helpKey="statutory" value={policy.test.statutory} onChange={value => updateTest('statutory', value)} />
        <NumberField label="LAUT days" helpKey="attendanceDays" value={policy.test.attendanceDays} onChange={value => updateTest('attendanceDays', value)} />
        <FieldLabel label="Current payroll date"><input type="date" value={policy.test.currentPayrollDate} onChange={event => updateTest('currentPayrollDate', event.target.value)} /></FieldLabel>
        <FieldLabel label="Next payroll date" helpKey="nextPayrollDate"><input type="date" value={policy.test.nextPayrollDate} onChange={event => updateTest('nextPayrollDate', event.target.value)} /></FieldLabel>
      </div>
      <div className="protected-base-note"><Info /><span>Gross pay {money(policy.test.grossPay)} includes basic pay {money(policy.test.basicPay)} and the rest of the period earnings. The protected base is <strong>{policy.base}</strong> = {money(result.protectedBase)}, and the protected minimum is <strong>{money(result.protectedMinimum)}</strong>.</span></div>
      <div className="policy-results"><span><small>Protected minimum</small><strong>{money(result.protectedMinimum)}</strong></span><span><small>Final take-home</small><strong>{money(result.finalNet)}</strong></span><span><small>Deferred this cutoff</small><strong>{money(result.deferred)}</strong></span><span><small>Mandatory deducted</small><strong>{money(result.mandatory)}</strong></span></div>
      <div className={`policy-outcome ${result.exception ? 'error' : 'success'}`}>{result.exception ? <Warning weight="fill" /> : <CheckCircle weight="fill" />}<span><strong>{result.exception ? 'Exception requires approval' : 'Protected minimum satisfied'}</strong><small>{result.exception
        ? `${money(result.shortfall)} shortfall remains${result.capBlocked ? ' because the loan deduction cap was prioritised over take-home pay' : ' after all eligible deductions were adjusted'}.`
        : 'Statutory deductions stayed intact and the hierarchy stopped once the threshold was met.'}</small></span></div>

      <div className="simulation-ledger">
        <h3>Deduction ledger</h3>
        <table>
          <thead><tr><th>Item</th><th>Due</th><th>Deducted</th><th>Deferred</th><th>Accumulated</th><th>Remaining</th></tr></thead>
          <tbody>{result.ledger.map(item => <tr key={item.code || item.name}>
            <td><strong>{item.name}</strong><small>{item.code || 'Calculated'} · Rank {item.rank} · {item.group}</small></td>
            <td>{money(item.due)}</td>
            <td>{money(item.deducted)}</td>
            <td className={item.deferred ? 'deferred-copy' : ''}>{money(item.deferred)}</td>
            <td>{money(item.accumulated)}</td>
            <td>{money(item.remaining)}</td>
          </tr>)}</tbody>
        </table>
      </div>

      {policy.carryForward && deferredRows.length > 0 && <div className="carry-forward-card">
        <h3>Carried forward to the next payroll</h3>
        <table>
          <thead><tr><th>Deduction</th><th>Outstanding amount</th><th>Original due date</th><th>Rescheduled date</th><th>New balance</th></tr></thead>
          <tbody>{deferredRows.map(item => <tr key={item.code || item.name}><td>{item.name}<small>{item.code}</small></td><td>{money(item.deferred)}</td><td>{item.originalDueDate}</td><td>{policy.test.nextPayrollDate}</td><td>{money(item.remaining)}</td></tr>)}</tbody>
        </table>
      </div>}

      {policy.payslipTagging && deferredRows.length > 0 && <div className="payslip-note">
        <Info />
        <div>
          <strong>Payslip tag: Deferred Deduction</strong>
          <table className="payslip-tag-table">
            <thead><tr><th>Deduction</th><th>Originally due</th><th>Deducted</th><th>Deferred</th><th>Accumulated</th><th>Remaining</th><th>Reason</th></tr></thead>
            <tbody>{deferredRows.map(item => <tr key={item.code || item.name}><td>{item.name}<small>{item.code}</small></td><td>{money(item.due)}</td><td>{money(item.deducted)}</td><td>{money(item.deferred)}</td><td>{money(item.accumulated)}</td><td>{money(item.remaining)}</td><td>Below Net Pay Requirement</td></tr>)}</tbody>
          </table>
        </div>
      </div>}
    </aside>
  </div>;
}

/** Small roster used to demonstrate automatic identification of eligible retirees. */
function GrossUpEngine({ policy, setPolicy, onSave }) {
  const result = useMemo(() => grossUpResult(policy), [policy]);
  const update = (key, value) => setPolicy(previous => ({ ...previous, [key]: value }));
  const updateTest = (key, value) => setPolicy(previous => ({ ...previous, test: { ...previous.test, [key]: value } }));
  return <div className="policy-engine-grid gross-up-engine">
    <section className="policy-config-card">
      <header><span><Calculator weight="duotone" /></span><div><h2>Gross Up</h2><p>Guarantees a net amount by solving the gross taxable pay and the withholding the employer absorbs.</p></div><button className={`switch ${policy.enabled ? 'on' : ''}`} onClick={() => update('enabled', !policy.enabled)}><span /></button></header>
      <ApplicabilityPanel assignment={normalizeAssignment(policy.assignment)} onChange={value => update('assignment', value)} engineLabel="Gross Up" />
      <div className="policy-form-grid">
        <FieldLabel label="Guaranteed target" helpKey="targetType"><select value={policy.targetType} onChange={event => update('targetType', event.target.value)}><option>Net pay</option><option>Net benefit</option></select></FieldLabel>
        <FieldLabel label="Tax method" helpKey="taxMethod"><select value={policy.taxMethod} onChange={event => update('taxMethod', event.target.value)}><option>Graduated withholding table</option><option>Flat / final tax rate</option></select></FieldLabel>
        <FieldLabel label="Payroll frequency" helpKey="grossUpFrequency"><select value={policy.frequency} onChange={event => update('frequency', event.target.value)}><option>Weekly</option><option>Semi-monthly</option><option>Monthly</option><option>Annual</option></select></FieldLabel>
        <FieldLabel label="Table effective date" helpKey="grossUpEffectiveDate"><input type="date" value={policy.effectiveDate} onChange={event => update('effectiveDate', event.target.value)} /></FieldLabel>
        <NumberField label="Flat / final tax rate" helpKey="flatRate" value={policy.flatRate} onChange={value => update('flatRate', value)} suffix="%" />
        <NumberField label="Employer-absorbed share" helpKey="employerSharePercent" value={policy.employerSharePercent} onChange={value => update('employerSharePercent', value)} suffix="%" />
        <NumberField label="Convergence tolerance" helpKey="tolerance" value={policy.tolerance} onChange={value => update('tolerance', value)} suffix="PHP" />
        <NumberField label="Maximum iterations" helpKey="maxIterations" value={policy.maxIterations} onChange={value => update('maxIterations', value)} />
        <FieldLabel className="wide" label="Rounding" helpKey="roundingMode"><select value={policy.roundingMode} onChange={event => update('roundingMode', event.target.value)}><option>Round to centavo</option><option>Round to peso</option></select></FieldLabel>
      </div>
      <div className="policy-toggle-list"><Toggle value={policy.includeStatutoryInTaxable} onChange={value => update('includeStatutoryInTaxable', value)} helpKey="includeStatutoryInTaxable" label="Deduct mandatory contributions before tax" hint="Employee statutory share reduces taxable compensation before the bracket is applied." /></div>
      <div className="formula-flow"><span><small>Solve for</small><code>gross taxable pay</code></span><ArrowsDownUp /><span><small>Constraint</small><code>gross + non-taxable − statutory − employee-borne tax = target net</code></span><strong>{policy.taxMethod === 'Flat / final tax rate' ? 'Single rate' : 'Iterated against the effective BIR table'}</strong></div>
      <div className="policy-save"><button className="button primary" onClick={() => onSave(result)}>Save gross-up policy</button></div>
    </section>

    <aside className="policy-simulator">
      <header><Calculator weight="duotone" /><div><h2>Gross-up scenario</h2><p>The iteration trace shows each candidate gross until the net converges within tolerance.</p></div></header>
      <div className="policy-test-grid">
        <NumberField label="Target net" helpKey="targetNet" value={policy.test.targetNet} onChange={value => updateTest('targetNet', value)} />
        <NumberField label="Employee statutory share" helpKey="statutoryEmployee" value={policy.test.statutoryEmployee} onChange={value => updateTest('statutoryEmployee', value)} />
        <NumberField label="Non-taxable allowance" helpKey="nonTaxableAllowance" value={policy.test.nonTaxableAllowance} onChange={value => updateTest('nonTaxableAllowance', value)} />
        <NumberField label="YTD taxable income" helpKey="ytdTaxableIncome" value={policy.test.ytdTaxableIncome} onChange={value => updateTest('ytdTaxableIncome', value)} />
      </div>
      <div className="policy-results"><span><small>Gross taxable pay</small><strong>{money(result.grossTaxable)}</strong></span><span><small>Withholding tax</small><strong>{money(result.withholdingTax)}</strong></span><span><small>Employer absorbs</small><strong>{money(result.employerAbsorbed)}</strong></span><span className="highlight"><small>Employee net</small><strong>{money(result.employeeNet)}</strong></span></div>
      <div className={`policy-outcome ${result.converged && !result.tableMissing ? 'success' : 'error'}`}>{result.converged && !result.tableMissing ? <CheckCircle weight="fill" /> : <Warning weight="fill" />}<span><strong>{result.tableMissing ? 'No effective tax table' : result.converged ? `Converged in ${result.iterations.length} iteration${result.iterations.length === 1 ? '' : 's'}` : `Did not converge within ${policy.maxIterations} iterations`}</strong><small>{result.tableMissing ? `Publish an Active BIR withholding table for ${policy.frequency} payroll before using the graduated method.` : `Employer cost ${money(result.employerCost)} to guarantee ${money(result.targetNet)} net.`}</small></span></div>
      <div className="calculation-trace">
        <h3>Calculation trace</h3>
        <p>Method: <strong>{result.method}</strong>{result.bracket && <> using the bracket from <strong>{money(result.bracket.minimum)}</strong> with fixed tax {money(result.bracket.fixedTax)} plus {result.bracket.excessRate}% on the excess</>}.</p>
        <p>Taxable compensation after mandatory contributions: <strong>{money(result.taxableCompensation)}</strong>.</p>
        <p>Employer absorbs <strong>{policy.employerSharePercent}%</strong> of the withholding ({money(result.employerAbsorbed)}); the employee bears {money(result.employeeWithheld)}.</p>
        <table className="iteration-table">
          <thead><tr><th>#</th><th>Candidate gross</th><th>Tax</th><th>Net</th><th>Gap to target</th></tr></thead>
          <tbody>{result.iterations.map(row => <tr key={row.step}><td>{row.step}</td><td>{money(row.gross)}</td><td>{money(row.tax)}</td><td>{money(row.net)}</td><td>{money(row.gap)}</td></tr>)}</tbody>
        </table>
      </div>
    </aside>
  </div>;
}

const codeSubcategories = companyRuleTaxonomy;

/**
 * The governance chain the configuration travels, from the business policy to
 * the recorded payroll result. Rendered once above the engines so the split
 * between "what applies and to whom" and "how it is calculated" is visible
 * rather than implied.
 */
const governanceFlow = [
  ['Business policy', 'What the company has decided'],
  ['Company rule', 'Which policy applies, and to whom'],
  ['Policy engine', 'The approved code and its configurable parameters'],
  ['Computational basis', 'The controlled formula'],
  ['Reference tables', 'Versioned statutory values the formula reads'],
  ['Payroll transaction', 'The employees, the trigger and the period'],
  ['Payroll result', 'The calculated, traceable outcome'],
];

function GovernanceFlow() {
  return <section className="governance-flow">
    <header><div><h2>How a payroll policy becomes a payroll result</h2><p>Configurable values vary by company, employee group and employee. The formulas themselves stay controlled and versioned.</p></div></header>
    <ol>{governanceFlow.map(([label, detail], index) => <li key={label}>
      <span className="governance-step-index">{index + 1}</span>
      <div><strong>{label}</strong><small>{detail}</small></div>
      {index < governanceFlow.length - 1 && <CaretRight weight="bold" />}
    </li>)}</ol>
  </section>;
}

/**
 * The engines this module ships. Every count, tab and code-to-engine route is
 * derived from this list, so adding an engine cannot leave a badge, a tab or a
 * routing rule behind.
 */
export const policyEngines = [
  { key: 'take-home', section: 'takeHome', label: 'Take-Home Pay', code: 'THP-001' },
  { key: 'retirement', section: 'retirement', label: 'Retirement Pay', code: 'RET-001' },
  { key: 'final-pay', section: 'finalPay', label: 'Final Pay', code: 'FIN-001' },
  { key: 'gross-up', section: 'grossUp', label: 'Gross Up', code: 'GUP-001' },
];

const policyEngineTabForCode = item =>
  policyEngines.find(engine => item?.subcategory === engine.label || item?.engine === engine.label)?.key || '';

function PolicyCodeLibrary({ codes, onCreate, onDelete, onOpenEngine }) {
  const [open, setOpen] = useState(false);
  const [editingCode, setEditingCode] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const templateCodes = codes.filter(item => item.isBuiltIn && item.parameterSchema?.length);
  const initialDraft = (template = templateCodes[0]) => {
    const schema = template ? completeParameterSchema(template) : completeParameterSchema({ subcategory: 'Take-Home Pay', engine: 'Take-Home Pay' });
    const base = template ? {
      code: '', name: '', category: template.category, subcategory: template.subcategory,
      engine: template.engine, description: template.description, status: 'Active',
      templateCode: template.code,
      parameterSchema: schema,
      parameterValues: { ...defaultParameterValues(schema), ...(template.parameterValues || {}) },
    } : { code: '', name: '', category: 'Pay and Earnings', subcategory: 'Take-Home Pay', engine: 'Take-Home Pay', description: '', status: 'Active', templateCode: '', parameterSchema: schema, parameterValues: defaultParameterValues(schema) };
    return base;
  };
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState('');
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const openCreator = template => { setDraft(initialDraft(template)); setEditingCode(''); setError(''); setOpen(true); };
  const openEditor = item => {
    const template = templateCodes.find(candidate => candidate.code === item.templateCode)
      || templateCodes.find(candidate => candidate.subcategory === item.subcategory && candidate.engine === item.engine)
      || item;
    const schema = (item.parameterSchema?.length ? item.parameterSchema : template.parameterSchema).map(parameter => ({ ...parameter, options: [...(parameter.options || [])] }));
    setDraft({ ...item, templateCode: item.templateCode || template.code, parameterSchema: schema, parameterValues: { ...defaultParameterValues(schema), ...(item.parameterValues || {}) } });
    setEditingCode(item.code); setError(''); setOpen(true);
  };
  const selectTemplate = templateCode => {
    const template = templateCodes.find(item => item.code === templateCode);
    if (!template) return;
    const schema = completeParameterSchema(template);
    setDraft(previous => ({
      ...previous,
      templateCode: template.code,
      category: template.category,
      subcategory: template.subcategory,
      engine: template.engine,
      description: template.description,
      parameterSchema: schema,
      parameterValues: { ...defaultParameterValues(schema), ...(template.parameterValues || {}) },
    }));
  };
  const submit = event => {
    event.preventDefault();
    const normalized = draft.code.trim().toUpperCase();
    const template = templateCodes.find(item => item.code === draft.templateCode);
    if (!template) return setError('Choose an existing policy-engine template before creating a code.');
    if (codes.some(item => item.code === normalized && item.code !== editingCode)) return setError('That code already exists. Use a unique policy-engine code.');
    const schema = completeParameterSchema(template);
    const schemaError = parameterSchemaError(schema);
    if (schemaError) return setError(schemaError);
    const missing = schema.find(item => item.required && String(draft.parameterValues?.[item.key] ?? '').trim() === '');
    if (missing) return setError(`Complete the required parameter: ${missing.label}.`);
    onCreate({
      ...draft,
      code: normalized,
      name: draft.name.trim(),
      description: draft.description.trim(),
      templateCode: template.code,
      category: template.category,
      subcategory: template.subcategory,
      engine: template.engine,
      parameterSchema: schema.map(item => ({ ...item, options: [...(item.options || [])] })),
      parameterValues: { ...defaultParameterValues(schema), ...(draft.parameterValues || {}) },
      isBuiltIn: false,
    });
    setOpen(false);
    setError('');
  };
  const filteredCodes = codes.filter(item => {
    const linkage = getPolicyLinkage(item);
    const haystack = `${item.code} ${item.name} ${item.category} ${item.subcategory} ${item.engine} ${linkage.computations.join(' ')} ${linkage.references.join(' ')}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (category === 'All categories' || item.category === category);
  });
  const mappedSubcategories = new Set(codes.map(item => item.subcategory));
  const coverageComplete = policyCoverageCatalog.every(item => mappedSubcategories.has(item.subcategory));

  return <>
    <section className="policy-code-library">
      <header>
        <div><span className="policy-code-icon"><Table weight="duotone" /></span><div><h2>Policy engine codes</h2><p>Create reusable codes once, then assign them to Company Rules by sub-category.</p></div></div>
        <button className="button primary" onClick={() => openCreator()}><Plus /> Create policy code</button>
      </header>
      <div className="policy-code-summary">
        <span><strong>{codes.length}</strong><small>Available codes</small></span>
        <span><strong>{new Set(codes.map(item => item.engine)).size}</strong><small>Engine families</small></span>
        <span><strong>{new Set(codes.map(item => item.subcategory)).size}</strong><small>Mapped sub-categories</small></span>
        <span className={coverageComplete ? 'coverage-complete' : 'coverage-gap'}><strong>{mappedSubcategories.size}/{policyCoverageCatalog.length}</strong><small>Template coverage</small></span>
      </div>
      <div className={`policy-coverage-notice ${coverageComplete ? 'complete' : 'gap'}`}><CheckCircle weight="fill" /><div><strong>{coverageComplete ? 'Every Company Rules sub-category has a governed template.' : 'Template coverage needs attention.'}</strong><span>Codes inherit the full approved parameter schema; arithmetic formulas and reference sources remain versioned in Computational Basis.</span></div></div>
      <div className="policy-library-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search code, sub-category, computation, or reference..." /><MagnifyingGlass /></div><select className="compact-select" value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{Object.keys(codeSubcategories).map(value => <option key={value}>{value}</option>)}</select><span>{filteredCodes.length} code{filteredCodes.length === 1 ? '' : 's'}</span></div>
      <div className="policy-code-table-wrap"><table className="policy-code-table">
        <thead><tr><th>Code</th><th>Policy code</th><th>Applies to</th><th>Governs</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{filteredCodes.map(item => {
          const completeSchema = completeParameterSchema(item);
          // Several codes can inherit one sub-category schema, so the row shows
          // what this code owns as well as the schema it inherits. Without the
          // governed count, siblings on one engine read as duplicates.
          const governs = codeParameterScopes[item.code];
          const owned = governs?.keys?.length;
          const label = owned ? `${owned} of ${completeSchema.length} parameters — ${governs.governs}` : `${completeSchema.length} configurable parameters`;
          return <tr key={item.code}><td><code>{item.code}</code></td><td><strong>{item.name}</strong><small>{item.description}</small></td><td><strong>{item.subcategory}</strong><small>{item.category}</small></td><td><span className="policy-count" title={label} aria-label={label}>{owned ? `${owned}/${completeSchema.length}` : completeSchema.length}</span>{governs?.governs && <small className="policy-governs">{governs.governs}</small>}</td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></td><td><div className="policy-code-actions"><button type="button" className="policy-code-open" onClick={() => policyEngineTabForCode(item) ? onOpenEngine?.(item) : openCreator(item)}>{policyEngineTabForCode(item) ? 'Open engine' : 'Create variant'}</button>{item.isBuiltIn ? <span className="policy-code-lock"><Lock /> Standard</span> : <div className="row-actions always"><button type="button" onClick={() => openEditor(item)} aria-label={`Edit ${item.code}`}><PencilSimple /></button><button type="button" onClick={() => onDelete(item)} aria-label={`Delete ${item.code}`}><Trash /></button></div>}</div></td></tr>; })}</tbody>
      </table></div>
    </section>
    {open && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="modal policy-code-modal" role="dialog" aria-modal="true" aria-label="Create policy engine code">
        <header><div><small>Policy engine library</small><h2>{editingCode ? `Edit ${editingCode}` : 'Create policy code'}</h2></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close"><X /></button></header>
        <form onSubmit={submit}>
          <div className="policy-code-form">
            <label>Code<span className="required">*</span><input value={draft.code} onChange={event => update('code', event.target.value.toUpperCase())} placeholder="e.g. THP-003" required readOnly={Boolean(editingCode)} /></label>
            <label>Name<span className="required">*</span><input value={draft.name} onChange={event => update('name', event.target.value)} placeholder="Clear policy code name" required /></label>
            <label className="wide">Existing policy template<span className="required">*</span><select disabled={Boolean(editingCode)} value={draft.templateCode} onChange={event => selectTemplate(event.target.value)} required><option value="">Choose an existing governed code</option>{Object.entries(codeSubcategories).map(([group, subcategories]) => <optgroup key={group} label={group}>{templateCodes.filter(item => subcategories.includes(item.subcategory)).map(item => <option key={item.code} value={item.code}>{item.code} - {item.name} ({item.subcategory})</option>)}</optgroup>)}</select><small className="policy-template-help">Start from a standard code. Atlas copies the complete approved sub-category schema; only the configured values can vary.</small></label>
            <div className="policy-template-meta wide"><span><small>Category</small><strong>{draft.category}</strong></span><span><small>Sub-category</small><strong>{draft.subcategory}</strong></span><span><small>Policy engine</small><strong>{draft.engine}</strong></span><span><small>Template</small><strong>{draft.templateCode || 'Not selected'}</strong></span></div>
            <label>Status<select value={draft.status} onChange={event => update('status', event.target.value)}><option>Active</option><option>Draft</option></select></label>
            <label className="wide">Description<span className="required">*</span><textarea value={draft.description} onChange={event => update('description', event.target.value)} placeholder="Describe what this code computes or controls." required /></label>
            <div className="wide policy-template-parameters"><div className="policy-template-parameters-heading"><div><strong>Configure a copy of the template</strong><span>These are the approved parameters for {draft.templateCode || 'the selected engine'}.</span></div><span className="policy-template-locked"><Lock /> Definitions locked</span></div><PolicyParameterFields schema={draft.parameterSchema} values={draft.parameterValues || {}} onChange={parameterValues => update('parameterValues', parameterValues)} /></div>
            {error && <p className="basis-error wide">{error}</p>}
          </div>
          <div className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button primary">{editingCode ? 'Save configured code' : 'Create code from template'}</button></div>
        </form>
      </section>
    </div>}
  </>;
}

export function PolicyComputations({ notify, addHistory, references, onManageHierarchy, onOpenService, initialTab = 'take-home' }) {
  const [policies, setPolicies] = useState(readPolicies);
  const [codes, setCodes] = useState(readPolicyCodes);
  const [tab, setTab] = useState(initialTab);
  const [openedFrom, setOpenedFrom] = useState('');
  const [showWholeEngine, setShowWholeEngine] = useState(false);

  const engineSectionRef = useRef(null);
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(policies)), [policies]);

  const hierarchyTable = references?.find(item => item.code === HIERARCHY_REFERENCE_CODE);
  const hierarchy = useMemo(() => readHierarchy(references), [references]);
  const sourced = hierarchy !== fallbackHierarchy;

  const setSection = key => value => setPolicies(previous => ({ ...previous, [key]: typeof value === 'function' ? value(previous[key]) : value }));

  const savePolicy = (label, summary) => {
    addHistory?.({ item: label, type: 'Policy', action: summary, version: '—' });
    notify({ type: 'success', message: `${label} saved and recorded in Change history.` });
  };

  const createCode = record => {
    const exists = codes.some(item => item.code === record.code && !item.isBuiltIn);
    setCodes(savePolicyCode(record));
    addHistory?.({ item: record.name, type: 'Policy code', action: `${record.code} ${exists ? 'updated' : 'created'} for ${record.subcategory}`, version: exists ? '1.1' : '1.0' });
    notify({ type: 'success', message: `${record.code} ${exists ? 'updated and remains' : 'is now'} available when applying Company Rules.` });
  };
  const removeCode = record => {
    let rules = [];
    try { rules = JSON.parse(localStorage.getItem('atlas-company-rules-v3')) || []; } catch { /* no saved rules */ }
    if (rules.some(rule => (rule.policyCode || rule.parameter) === record.code)) { notify({ type: 'error', message: `${record.code} is assigned to a company rule and cannot be deleted.` }); return; }
    setCodes(deletePolicyCode(record.code));
    addHistory?.({ item: record.name, type: 'Policy code', action: `${record.code} deleted`, version: '—' });
    notify({ type: 'success', message: `${record.code} deleted from the policy-code library.` });
  };

  const openEngine = item => {
    const nextTab = policyEngineTabForCode(item);
    if (!nextTab) {
      notify({ type: 'info', message: `${item.code} uses the governed ${item.engine} template. Configure its values from the code editor.` });
      return;
    }
    setTab(nextTab);
    setOpenedFrom(item.code);
    setShowWholeEngine(false);
    window.requestAnimationFrame(() => engineSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const activeEngine = policyEngines.find(engine => engine.key === tab);
  // Codes that sit on the engine currently shown. Several codes can govern one
  // engine, so name them rather than leaving two identical-looking rows.
  const engineCodes = codes.filter(item => policyEngineTabForCode(item) === tab);
  const scopedCode = engineCodes.find(item => item.code === openedFrom && codeParameterScopes[item.code]?.keys?.length);
  const engineScope = scopedCode && !showWholeEngine
    ? { code: scopedCode.code, keys: codeParameterScopes[scopedCode.code].keys, governs: codeParameterScopes[scopedCode.code].governs }
    : null;

  return <section className="policy-workspace">
    <GovernanceFlow />
    <PolicyCodeLibrary codes={codes} onCreate={createCode} onDelete={removeCode} onOpenEngine={openEngine} />
    <div className="policy-engine-detail" ref={engineSectionRef}>
      <div className="policy-tabs">
      {policyEngines.map(engine => <button key={engine.key} className={tab === engine.key ? 'active' : ''} onClick={() => setTab(engine.key)}>{engine.label} <span>{engine.code}</span></button>)}
      </div>

      {engineCodes.length > 0 && tab !== 'take-home' && <div className="engine-code-note">
        <Info weight="fill" />
        <div>
          <strong>{engineCodes.length === 1 ? `${engineCodes[0].code} configures this engine.` : `${engineCodes.length} codes share this ${activeEngine?.label} engine.`}</strong>
          <span>A company keeps one {activeEngine?.label} policy.{engineCodes.length > 1 ? ' Each code below governs a different part of it and can be assigned to its own Company Rule — they are not separate copies, so a change here is reflected wherever those codes are used.' : ' This code carries its values into every Company Rule it is assigned to.'}</span>
          <ul>{engineCodes.map(item => <li key={item.code} className={item.code === openedFrom ? 'opened' : ''}><code>{item.code}</code> {codeParameterScopes[item.code]?.governs || item.name}{item.code === openedFrom ? ' — opened from the library' : ''}</li>)}</ul>
          {scopedCode && <div className="engine-scope-toggle">
            <span>{engineScope ? `Highlighting the ${engineScope.keys.length} parameters ${scopedCode.code} governs.` : `Showing all parameters in the ${activeEngine?.label} engine.`}</span>
            <button type="button" className="button secondary" onClick={() => setShowWholeEngine(value => !value)}>{engineScope ? 'Show whole engine' : `Highlight ${scopedCode.code} only`}</button>
          </div>}
        </div>
      </div>}

      {tab === 'take-home' && scopedCode && <div className="engine-context-bar"><span><strong>{scopedCode.code}</strong> · {codeParameterScopes[scopedCode.code].governs}</span><button type="button" onClick={() => setShowWholeEngine(value => !value)}>{engineScope ? 'Show all take-home settings' : `Show ${scopedCode.code} settings`}</button></div>}

      <EngineScope.Provider value={engineScope}>
      {tab === 'take-home' && <TakeHomeEngine
      policy={policies.takeHome}
      setPolicy={setSection('takeHome')}
      hierarchy={hierarchy}
      sourced={sourced && Boolean(hierarchyTable)}
      onManageHierarchy={onManageHierarchy}
      onOpenService={onOpenService}
      onSave={result => savePolicy('Minimum Take-Home Pay policy', `Threshold ${policies.takeHome.thresholdType === 'Percentage' ? `${policies.takeHome.threshold}%` : money(policies.takeHome.threshold)} · ${describeAssignment(policies.takeHome.assignment)} · ${money(result.deferred)} deferred in the saved scenario`)}
    />}

      {tab === 'retirement' && <RetirementEngine
      policy={policies.retirement}
      setPolicy={setSection('retirement')}
      onSave={result => savePolicy('Retirement Pay policy', `${policies.retirement.planType} · ${describeAssignment(policies.retirement.assignment)} · scenario ${money(result.selected)} · ${result.taxExempt ? 'tax exempt' : 'taxable'} (${result.taxBasis})`)}
    />}

      {tab === 'gross-up' && <GrossUpEngine
      policy={policies.grossUp}
      setPolicy={setSection('grossUp')}
      onSave={result => savePolicy('Gross Up policy', `${policies.grossUp.taxMethod} · ${describeAssignment(policies.grossUp.assignment)} · gross ${money(result.grossTaxable)} for ${money(result.targetNet)} net`)}
      />}

      {tab === 'final-pay' && <FinalPayEngine
      policy={policies.finalPay}
      setPolicy={setSection('finalPay')}
      retirementPolicy={policies.retirement}
      onSave={result => savePolicy('Final Pay policy', `${describeAssignment(policies.finalPay.assignment)} · ${result.separation.applied.reason} → ${result.separation.applied.formula} · net ${money(result.netFinalPay)} · retirement pay ${policies.finalPay.components['Retirement pay'] ? 'included' : 'excluded'}`)}
      />}
      </EngineScope.Provider>
    </div>
  </section>;
}
