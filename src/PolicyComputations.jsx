import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRef } from 'react';
import {
  ArrowsDownUp,
  Calculator,
  CheckCircle,
  Info,
  Lock,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Scales,
  ShieldCheck,
  Table,
  Trash,
  Users,
  Warning,
  X,
} from '@phosphor-icons/react';
import { companyRuleTaxonomy } from './requirementsCatalog';
import { getPolicyLinkage, policyCoverageCatalog } from './policyGovernance';
import { withholdingTax } from './statutoryService';
import { codeParameterScopes, completeParameterSchema, defaultParameterSchema, defaultParameterValues, hydratePolicyCode, parameterSchemaError, PolicyParameterFields } from './PolicyParameters';
import { configuredCollectionByCode } from './payrollIntegration';

const STORAGE_KEY = 'atlas-payroll-policy-engines-v3';
const CODE_STORAGE_KEY = 'atlas-policy-engine-codes-v1';

const baseSeedPolicyCodes = [
  { code: 'THP-001', name: 'Minimum Take-Home Pay', category: 'Pay and Earnings', subcategory: 'Take-Home Pay', engine: 'Take-Home Pay', description: 'Protects the configured minimum net pay after mandatory deductions.', status: 'Active' },
  { code: 'THP-002', name: 'Maximum Controllable Deductions', category: 'Pay and Earnings', subcategory: 'Take-Home Pay', engine: 'Take-Home Pay', description: 'Caps controllable deductions after statutory deductions are applied.', status: 'Active' },
  { code: 'RET-001', name: 'Statutory Retirement Benefit', category: 'Pay and Earnings', subcategory: 'Retirement Pay', engine: 'Retirement Pay', description: 'Calculates the statutory retirement benefit basis.', status: 'Active' },
  { code: 'RET-002', name: 'More Beneficial Retirement Benefit', category: 'Pay and Earnings', subcategory: 'Retirement Pay', engine: 'Retirement Pay', description: 'Selects the higher qualifying statutory or company-plan value.', status: 'Active' },
  { code: 'FIN-001', name: 'Final Pay Net Result', category: 'Pay and Earnings', subcategory: 'Final Pay', engine: 'Final Pay', description: 'Computes the net final-pay result from enabled components and offsets.', status: 'Active' },
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
  { code: 'DEF-001', name: 'Deferred Deduction Carry-Forward', category: 'Loans & Deductions', subcategory: 'Deferred Deductions', engine: 'Take-Home Pay', description: 'Carries deferred amounts, dates, reasons, and balances to the next payroll.', status: 'Active' },
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
        : null;
  if (!policy) return defaultParameterValues(defaultParameterSchema(item));
  const finalComponents = {
    includeUnpaidSalary: policy.components?.['Unpaid Salary'],
    includeProratedThirteenth: policy.components?.['Prorated 13th month pay'],
    includeSILConversion: policy.components?.['SIL conversion'],
    includeSeparationPay: policy.components?.['Separation pay'],
    includeRetirementPay: policy.components?.['Retirement pay'],
    includeFinalTax: policy.components?.['Final tax computation'],
    includeConvertibleLeave: policy.optionalComponents?.['Convertible VL / SL beyond SIL'],
    includeAllowances: policy.optionalComponents?.Allowances,
    includeCommissions: policy.optionalComponents?.Commissions,
    includeCashBondReturn: policy.optionalComponents?.['Cash bond return'],
    includeGratuity: policy.optionalComponents?.['Gratuity pay'],
  };
  return Object.fromEntries(defaultParameterSchema(item).map(parameter => {
    const value = Object.prototype.hasOwnProperty.call(finalComponents, parameter.key) ? finalComponents[parameter.key] : policy[parameter.key];
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
    employeeGroup: 'All Employees',
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
    test: { basicPay: 30000, grossPay: 36500, reimbursements: 2000, statutory: 6500, attendanceDays: 4, nextPayrollDate: '2026-08-31' },
  },
  retirement: {
    enabled: true,
    employeeGroup: 'All Employees',
    planType: 'Best of statutory and company plan',
    salaryBasis: 'Latest monthly basic pay',
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
    test: {
      dateOfBirth: '1964-01-15', dateHired: '2014-02-01', retirementDate: '2026-08-31',
      monthlyBasic: 60000, average36Months: 55000,
      reason: 'Retirement', memberPlan: 'Company plan member',
    },
  },
  grossUp: {
    enabled: true,
    employeeGroup: 'All Employees',
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
    employeeGroup: 'All Employees',
    components: {
      'Unpaid Salary': true,
      'Prorated 13th month pay': true,
      'SIL conversion': true,
      'Separation pay': false,
      'Retirement pay': true,
      'Final tax computation': true,
    },
    optionalComponents: {
      'Convertible VL / SL beyond SIL': true,
      'Allowances': true,
      'Commissions': false,
      'Cash bond return': true,
      'Gratuity pay': false,
    },
    leaveConversionRule: 'Convert unused VL and SIL at the current daily rate',
    separationPayRule: 'Not applicable — retirement',
    dailyRateDivisor: 30,
    serviceRounding: 'Six months or more counts as one year',
    advanceThirteenthRule: 'Deduct any advanced 13th month release',
    lastCutoffRule: 'Include the unposted last cutoff',
    governmentLoanRule: 'Offset the full outstanding balance',
    companyLoanRule: 'Offset the full outstanding balance',
    negativeNetPayRule: 'Raise for approval and bill the employee',
    autoOffsetDeductions: true,
    notifyAdmin: true,
    test: {
      unpaidSalary: 18000, thirteenthMonth: 24500, silConversion: 6800, separationPay: 0,
      convertibleLeave: 4200, allowances: 3000, commissions: 0, cashBond: 5000, gratuity: 0,
      advanceThirteenth: 8000, governmentLoanBalance: 12000, companyLoanBalance: 21000,
      propertyAccountability: 2500, finalTax: 4300,
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

export function readPolicies() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return seedPolicies;
    return {
      takeHome: { ...seedPolicies.takeHome, ...saved.takeHome, test: { ...seedPolicies.takeHome.test, ...saved.takeHome?.test }, scenario: { ...seedPolicies.takeHome.scenario, ...saved.takeHome?.scenario } },
      retirement: { ...seedPolicies.retirement, ...saved.retirement, test: { ...seedPolicies.retirement.test, ...saved.retirement?.test } },
      finalPay: { ...seedPolicies.finalPay, ...saved.finalPay, test: { ...seedPolicies.finalPay.test, ...saved.finalPay?.test } },
      grossUp: { ...seedPolicies.grossUp, ...saved.grossUp, test: { ...seedPolicies.grossUp.test, ...saved.grossUp?.test } },
    };
  } catch { return seedPolicies; }
}

const money = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = value => Number(value || 0);

const BASE_OPTIONS = ['Basic Pay', 'Gross Pay', 'Gross Pay less reimbursements / receivables'];

function baseAmount(option, test) {
  const gross = number(test.grossPay);
  if (option === 'Basic Pay') return number(test.basicPay);
  if (option === 'Gross Pay') return gross;
  return Math.max(0, gross - number(test.reimbursements));
}

const FIELD_HELP = {
  employeeGroup: ['Employee group', 'Limits the rule to a defined employee population.', 'Example: Rank and File'],
  protectedBase: ['Protected base', 'The earnings amount used to calculate the minimum take-home threshold.', 'Example: Gross Pay less reimbursements / receivables'],
  thresholdType: ['Threshold type', 'Chooses whether the protected minimum is a percentage or a fixed peso amount.', 'Example: Percentage'],
  threshold: ['Threshold', 'The protected minimum value applied to the selected base.', 'Example: 30% of PHP 34,500'],
  conflictPriority: ['Conflict priority', 'Decides what happens when loans are already at their cap but net pay is still below the protected minimum. "Take-Home Pay" keeps deferring loans below the cap; "Loan Deduction Cap" protects loan collection and raises an exception instead.', 'Example: Take-Home Pay'],
  deductionCapEnabled: ['Deductions cap', 'Limits the total non-loan deductions that may be collected in one payroll period.', 'Example: Enabled'],
  deductionCapBase: ['Deductions cap base', 'Earnings amount the deductions cap percentage is measured against.', 'Example: Gross Pay'],
  deductionCapType: ['Deductions cap type', 'Whether the deductions cap is a percentage of the base or a fixed amount.', 'Example: Percentage'],
  deductionCap: ['Deductions cap', 'Maximum total non-loan deduction allowed for the payroll period.', 'Example: 40% of gross pay'],
  loanCapBase: ['Loan cap base', 'Earnings amount the loan cap percentage is measured against.', 'Example: Gross Pay'],
  loanCapType: ['Loan cap type', 'Whether the loan cap is a percentage of the base or a fixed amount.', 'Example: Percentage'],
  loanCap: ['Loan cap', 'Maximum total loan repayment that can be deducted in the current payroll.', 'Example: 25% of gross pay'],
  attendanceCapBase: ['Attendance cap base', 'Earnings amount the attendance cap percentage is measured against.', 'Example: Gross Pay'],
  attendanceCapType: ['Attendance cap type', 'Whether the attendance limit is measured in days, a percentage, or a fixed amount.', 'Example: Number of Days'],
  attendanceCap: ['Attendance cap', 'Maximum attendance-related adjustment allowed for the current payroll.', 'Example: 3 days'],
  autoDefer: ['Auto-defer or stagger deductions', 'Moves eligible lower-priority deductions to a later payroll when the protected minimum would be breached.', 'Example: Defer optional deductions first'],
  carryForward: ['Carry forward to next payroll', 'Stores the outstanding amount, next schedule, and remaining balance for the next payroll.', 'Example: PHP 750 deferred to the next cutoff'],
  payslipTagging: ['Payslip tagging', 'Shows the original due, deducted, deferred, accumulated, and remaining balance on the payslip.', 'Example: Deferred Deduction'],
  notifyEmployee: ['Admin and employee notification', 'Creates an alert when a deduction is deferred or an exception remains.', 'Example: Notify after payroll validation'],
  basicPay: ['Basic pay', 'The employee basic pay amount used in the take-home scenario.', 'Example: PHP 30,000'],
  grossPay: ['Gross pay', 'Total earnings before statutory deductions and controllable deductions.', 'Example: PHP 36,500'],
  reimbursements: ['Reimbursements / receivables', 'Amounts excluded from the protected base when the selected basis removes them.', 'Example: PHP 2,000'],
  statutory: ['Mandatory statutory deductions', 'BIR, SSS, PhilHealth, and Pag-IBIG deductions that remain applied in full.', 'Example: PHP 6,500'],
  attendanceDays: ['LAUT days', 'Late, absence, and undertime units used to test the attendance cap.', 'Example: 4 days'],
  nextPayrollDate: ['Next payroll date', 'Rescheduled deduction date recorded against every deferred item.', 'Example: 31 Aug 2026'],
  deductionHierarchy: ['Deduction and loan hierarchy', 'Ranks controllable items so the engine knows which to adjust first. Maintained in the REF-011 reference table.', 'Example: Rank 1 is adjusted before Rank 2'],
  planType: ['Retirement plan type', 'Chooses the statutory plan, company plan, or more beneficial qualifying value.', 'Example: Best of statutory and company plan'],
  salaryBasis: ['Company salary basis', 'Salary measure used to calculate the company retirement-plan value.', 'Example: Latest monthly basic pay'],
  dailyRateDivisor: ['Daily rate divisor', 'Divides monthly basic pay to derive the daily retirement rate.', 'Example: 30 days'],
  statutoryDays: ['Statutory days per service year', 'The statutory retirement-day equivalent applied for every rounded service year.', 'Example: 22.5 days'],
  companyDays: ['Company-plan days per service year', 'Company plan days applied for each qualifying service year.', 'Example: 30 days'],
  additionalBenefits: ['Additional benefits', 'Qualifying lump sum, gratuity, or similar benefits added to the company-plan value.', 'Example: PHP 15,000'],
  minimumAge: ['Minimum retirement age', 'Earliest statutory age used for normal retirement eligibility.', 'Example: 60 years'],
  compulsoryAge: ['Compulsory retirement age', 'Age at which compulsory retirement eligibility is reached.', 'Example: 65 years'],
  minimumServiceYears: ['Minimum service', 'Minimum completed service required before the retirement benefit qualifies.', 'Example: 5 years'],
  earlyRetirementAge: ['Company early-retirement age', 'Optional earlier age allowed when the employee is a qualifying company-plan member.', 'Example: 55 years'],
  minimumGuarantee: ['Minimum guarantee', 'Floor applied to the company-plan value when configured.', 'Example: PHP 100,000'],
  maximumCap: ['Maximum cap', 'Optional ceiling applied to the company-plan value; zero means no ceiling.', 'Example: 0 = none'],
  serviceRounding: ['Service rounding', 'How a fractional final year of service is converted into whole years.', 'Example: Six months or more counts as one year'],
  taxationRule: ['Taxation rule', 'Determines which exemption conditions are evaluated for the retirement output.', 'Example: RA 7641 / NIRC and RA 4917'],
  companyPlanApproved: ['BIR-approved company retirement plan', 'Marks whether the company plan meets the RA 4917 approval condition.', 'Example: Enabled'],
  dateOfBirth: ['Date of birth', 'Employee birth date used to compute age at the retirement date.', 'Example: 15 Jan 1964'],
  dateHired: ['Date hired', 'Start date used to calculate completed service and the rounding rule.', 'Example: 1 Feb 2014'],
  retirementDate: ['Retirement date', 'Date on which eligibility and retirement value are tested.', 'Example: 31 Aug 2026'],
  reason: ['Reason', 'Separates retirement from resignation or termination scenarios.', 'Example: Retirement'],
  memberPlan: ['Plan membership', 'Identifies whether the employee belongs to the statutory or company plan.', 'Example: Company plan member'],
  monthlyBasic: ['Monthly basic pay', 'Salary base used for the statutory retirement calculation.', 'Example: PHP 60,000'],
  average36Months: ['Average salary', 'Alternative salary basis when the company plan averages recent salary.', 'Example: PHP 55,000'],
  finalPayComponents: ['Mandatory components', 'Pay items that always form part of final pay when applicable.', 'Example: Unpaid salary'],
  optionalComponents: ['Optional components', 'Company-specific items added to final pay.', 'Example: Cash bond return'],
  negativeNetPayRule: ['Negative net pay rule', 'What happens when deductions exceed the final pay earnings.', 'Example: Raise for approval'],
  autoOffsetDeductions: ['Auto-offset deductions', 'Offsets authorized deductions, accountabilities, and loan balances before net final pay.', 'Example: Enabled'],
  targetType: ['Guaranteed target', 'Whether the company guarantees a net pay figure or a net benefit amount.', 'Example: Net pay'],
  taxMethod: ['Tax method', 'Graduated iterates against the effective BIR withholding table; flat applies a single final/expanded rate.', 'Example: Graduated withholding table'],
  grossUpFrequency: ['Payroll frequency', 'Selects which frequency of the effective withholding table the iteration reads.', 'Example: Monthly'],
  grossUpEffectiveDate: ['Table effective date', 'Date used to pick the statutory table version in force for the run.', 'Example: 31 Aug 2026'],
  flatRate: ['Flat / final tax rate', 'Single rate used when the gross-up is a final or expanded tax scenario instead of compensation withholding.', 'Example: 25%'],
  employerSharePercent: ['Employer-absorbed share', 'Portion of the withholding the employer shoulders. 50% models a shared gross-up.', 'Example: 100%'],
  tolerance: ['Convergence tolerance', 'How close the computed net must come to the target before the iteration stops.', 'Example: PHP 0.01'],
  maxIterations: ['Maximum iterations', 'Safety limit so a non-converging configuration fails visibly instead of looping.', 'Example: 50'],
  roundingMode: ['Rounding', 'Rounding stage applied to the solved gross before the final tax is computed.', 'Example: Round to centavo'],
  includeStatutoryInTaxable: ['Mandatory contributions', 'Deducts the employee statutory share from taxable compensation before the bracket is applied.', 'Example: Enabled'],
  targetNet: ['Target net', 'The guaranteed amount the employee must receive.', 'Example: PHP 50,000'],
  statutoryEmployee: ['Employee statutory share', 'SSS, PhilHealth and Pag-IBIG employee contributions for the period.', 'Example: PHP 1,875'],
  nonTaxableAllowance: ['Non-taxable allowance', 'De Minimis or other non-taxable pay already forming part of the net.', 'Example: PHP 0'],
  ytdTaxableIncome: ['YTD taxable income', 'Prior taxable compensation, used when the table is annualized.', 'Example: PHP 0'],
};

function FieldHelp({ helpKey }) {
  const inferredKey = String(helpKey || '').replace(/[^a-zA-Z0-9 ]/g, '').split(' ').filter(Boolean).map((part, index) => index ? `${part[0].toUpperCase()}${part.slice(1)}` : part.toLowerCase()).join('');
  const help = FIELD_HELP[helpKey] || FIELD_HELP[inferredKey];
  const [open, setOpen] = useState(false);
  if (!help) return null;
  return <span className="field-help"><button type="button" aria-label={`Help for ${help[0]}`} title={`${help[1]} ${help[2]}`} onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(value => !value); }}><Info weight="bold" /></button>{open && <span className="field-help-popover"><strong>{help[0]}</strong><small>{help[1]}</small><em>{help[2]}</em></span>}</span>;
}

/**
 * The scope of the policy code the engine was opened from. When a code governs
 * part of an engine, the fields it owns are highlighted and the rest are dimmed
 * so the parameter count in the code library is something you can actually
 * count on screen.
 */
const EngineScope = createContext(null);

function useFieldScope(helpKey) {
  const scope = useContext(EngineScope);
  if (!scope?.keys?.length) return '';
  return scope.keys.includes(helpKey) ? 'in-scope' : 'out-of-scope';
}

function FieldLabel({ label, helpKey = label, scopeKey = helpKey, children, className = '' }) {
  const scopeClass = useFieldScope(scopeKey);
  return <label className={`policy-field ${className} ${scopeClass}`}><span className="policy-field-label">{label}<FieldHelp helpKey={helpKey} /></span>{children}</label>;
}

function difference(startValue, endValue) {
  const start = new Date(startValue); const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return { years: 0, months: 0 };
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  if (end.getDate() < start.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  return { years, months };
}

/** Applies the configured rounding rule to a completed-service duration. */
export function roundServiceYears(service, rule) {
  if (rule === 'Completed years only (round down)') return service.years;
  if (rule === 'Any fraction counts as one year') return service.years + (service.months > 0 ? 1 : 0);
  return service.years + (service.months >= 6 ? 1 : 0);
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

export function retirementResult(policy, test = policy.test) {
  const age = difference(test.dateOfBirth, test.retirementDate);
  const service = difference(test.dateHired, test.retirementDate);
  const roundedYears = roundServiceYears(service, policy.rounding);
  const eligibleAge = age.years >= number(policy.minimumAge)
    || age.years >= number(policy.compulsoryAge)
    || (number(policy.earlyRetirementAge) > 0 && age.years >= number(policy.earlyRetirementAge) && test.memberPlan === 'Company plan member');
  const eligibleService = roundedYears >= number(policy.minimumServiceYears);
  const eligible = Boolean(policy.enabled && test.reason === 'Retirement' && eligibleAge && eligibleService);
  const statutoryBasis = number(test.monthlyBasic);
  const companyBasis = policy.salaryBasis === 'Latest monthly basic pay' ? number(test.monthlyBasic) : number(test.average36Months);
  const divisor = Math.max(1, number(policy.dailyRateDivisor));
  const statutoryDaily = statutoryBasis / divisor;
  const companyDaily = companyBasis / divisor;
  const statutory = statutoryDaily * number(policy.statutoryDays) * roundedYears;
  let company = companyDaily * number(policy.companyDays) * roundedYears + number(policy.additionalBenefits);
  if (number(policy.minimumGuarantee) > 0) company = Math.max(company, number(policy.minimumGuarantee));
  if (number(policy.maximumCap) > 0) company = Math.min(company, number(policy.maximumCap));
  const selected = policy.planType === 'Statutory RA 7641' ? statutory
    : policy.planType === 'Company retirement plan' ? company
      : Math.max(statutory, company);
  // An explicit "Taxable company benefit" rule must win over the RA 4917 flag.
  const taxExempt = eligible
    && policy.taxExemption !== 'Taxable company benefit'
    && (policy.companyPlanApproved || age.years >= number(policy.minimumAge));
  const taxBasis = !eligible ? 'no qualifying retirement benefit'
    : policy.taxExemption === 'Taxable company benefit' ? 'the company rule overrides the exemption'
      : policy.companyPlanApproved ? 'RA 4917, BIR-approved company plan'
        : age.years >= number(policy.minimumAge) ? 'RA 7641 / NIRC 32(B)(6)(a)'
          : 'the statutory age condition was not met';
  return { age, service, roundedYears, eligibleAge, eligibleService, eligible, statutoryDaily, companyDaily, statutory, company, selected: eligible ? selected : 0, taxExempt, taxBasis };
}

/**
 * Gross-up: solve for the gross taxable amount whose withholding leaves the
 * employee the guaranteed net.
 *
 * Master requirements §9 warns that `net / (1 - rate)` only holds for a single
 * flat rate, so the graduated method iterates against the effective BIR table
 * (§7.2) until the net converges within the configured tolerance instead of
 * assuming one bracket. Statutory employee share is treated as part of the
 * package when the policy says so, and the employer may absorb only part of the
 * withholding.
 */
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

export function finalPayResult(policy, retirementValue) {
  const test = policy.test;
  const line = (label, value, on) => ({ label, value: on ? number(value) : 0, on: Boolean(on) });
  const earnings = [
    line('Unpaid Salary', test.unpaidSalary, policy.components['Unpaid Salary']),
    line('Prorated 13th month pay', test.thirteenthMonth, policy.components['Prorated 13th month pay']),
    line('SIL conversion', test.silConversion, policy.components['SIL conversion']),
    line('Separation pay', test.separationPay, policy.components['Separation pay']),
    line('Retirement pay', retirementValue, policy.components['Retirement pay']),
    line('Convertible VL / SL beyond SIL', test.convertibleLeave, policy.optionalComponents['Convertible VL / SL beyond SIL']),
    line('Allowances', test.allowances, policy.optionalComponents['Allowances']),
    line('Commissions', test.commissions, policy.optionalComponents['Commissions']),
    line('Cash bond return', test.cashBond, policy.optionalComponents['Cash bond return']),
    line('Gratuity pay', test.gratuity, policy.optionalComponents['Gratuity pay']),
  ];
  const grossFinalPay = earnings.reduce((sum, item) => sum + item.value, 0);
  const deductions = [
    line('Advance 13th month recovery', test.advanceThirteenth, policy.advanceThirteenthRule !== 'Do not recover'),
    line('Government loan balance', test.governmentLoanBalance, policy.autoOffsetDeductions),
    line('Company loan balance', test.companyLoanBalance, policy.autoOffsetDeductions),
    line('Property accountability', test.propertyAccountability, policy.autoOffsetDeductions),
    line('Final tax', test.finalTax, policy.components['Final tax computation']),
  ];
  const totalDeductions = deductions.reduce((sum, item) => sum + item.value, 0);
  const netFinalPay = grossFinalPay - totalDeductions;
  return { earnings, deductions, grossFinalPay, totalDeductions, netFinalPay, negative: netFinalPay < 0 };
}

function Toggle({ value, onChange, label, hint, helpKey = label, scopeKey = helpKey }) {
  const scopeClass = useFieldScope(scopeKey);
  return <label className={`policy-toggle ${scopeClass}`}><span><strong>{label}<FieldHelp helpKey={helpKey} /></strong>{hint && <small>{hint}</small>}</span><button type="button" className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)}><span /></button></label>;
}

function NumberField({ label, value, onChange, suffix, helpKey = label, scopeKey = helpKey }) {
  return <FieldLabel label={label} helpKey={helpKey} scopeKey={scopeKey}><div className="suffix-input"><input type="number" min="0" step="0.01" value={value} onChange={event => onChange(number(event.target.value))} />{suffix && <span>{suffix}</span>}</div></FieldLabel>;
}

function CheckList({ title, helpKey, values, onToggle }) {
  return <div className="component-checklist"><h3>{title}<FieldHelp helpKey={helpKey} /></h3><div>{Object.entries(values).map(([label, on]) => <label key={label}><input type="checkbox" checked={on} onChange={() => onToggle(label)} /> {label}</label>)}</div></div>;
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
  return <div className="policy-engine-grid">
    <section className="policy-config-card">
      <header><span><ShieldCheck weight="duotone" /></span><div><h2>Minimum Take-Home Pay</h2><p>Company policy controls; formula execution remains in Computational Basis.</p></div><button className={`switch ${policy.enabled ? 'on' : ''}`} onClick={() => update('enabled', !policy.enabled)}><span /></button></header>
      <div className="policy-form-grid">
        <FieldLabel label="Employee group" helpKey="employeeGroup"><select value={policy.employeeGroup} onChange={event => update('employeeGroup', event.target.value)}><option>All Employees</option><option>Rank and File</option><option>Managers</option><option>Project-based Employees</option></select></FieldLabel>
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
        <FieldLabel label="Next payroll date" helpKey="nextPayrollDate"><input type="date" value={policy.test.nextPayrollDate} onChange={event => updateTest('nextPayrollDate', event.target.value)} /></FieldLabel>
      </div>
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
          <thead><tr><th>Deduction</th><th>Outstanding amount</th><th>Rescheduled date</th><th>New balance</th></tr></thead>
          <tbody>{deferredRows.map(item => <tr key={item.code || item.name}><td>{item.name}<small>{item.code}</small></td><td>{money(item.deferred)}</td><td>{policy.test.nextPayrollDate}</td><td>{money(item.remaining)}</td></tr>)}</tbody>
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
const retirementRoster = [
  { id: 'E-1042', name: 'Ana Reyes', dateOfBirth: '1964-01-15', dateHired: '2014-02-01', retirementDate: '2026-08-31', monthlyBasic: 60000, average36Months: 55000, reason: 'Retirement', memberPlan: 'Company plan member' },
  { id: 'E-2288', name: 'Ben Cruz', dateOfBirth: '1961-05-02', dateHired: '2019-06-15', retirementDate: '2026-08-31', monthlyBasic: 42000, average36Months: 40000, reason: 'Retirement', memberPlan: 'Statutory plan member' },
  { id: 'E-3391', name: 'Carla Lim', dateOfBirth: '1972-09-20', dateHired: '2005-03-01', retirementDate: '2026-08-31', monthlyBasic: 78000, average36Months: 74000, reason: 'Retirement', memberPlan: 'Company plan member' },
  { id: 'E-4417', name: 'Diego Santos', dateOfBirth: '1958-11-08', dateHired: '2023-01-09', retirementDate: '2026-08-31', monthlyBasic: 51000, average36Months: 51000, reason: 'Retirement', memberPlan: 'Statutory plan member' },
  { id: 'E-5502', name: 'Elena Uy', dateOfBirth: '1965-07-30', dateHired: '2010-08-16', retirementDate: '2026-08-31', monthlyBasic: 66000, average36Months: 63000, reason: 'Resignation', memberPlan: 'Company plan member' },
];

function RetirementEngine({ policy, setPolicy, onSave }) {
  const result = useMemo(() => retirementResult(policy), [policy]);
  const roster = useMemo(() => retirementRoster.map(employee => ({ employee, outcome: retirementResult(policy, employee) })), [policy]);
  const eligibleCount = roster.filter(row => row.outcome.eligible).length;
  const update = (key, value) => setPolicy(previous => ({ ...previous, [key]: value }));
  const updateTest = (key, value) => setPolicy(previous => ({ ...previous, test: { ...previous.test, [key]: value } }));
  return <div className="policy-engine-grid retirement-engine">
    <section className="policy-config-card">
      <header><span><Scales weight="duotone" /></span><div><h2>Retirement Pay</h2><p>Eligibility and company-plan inputs around the controlled retirement formulas.</p></div><button className={`switch ${policy.enabled ? 'on' : ''}`} onClick={() => update('enabled', !policy.enabled)}><span /></button></header>
      <div className="policy-form-grid">
        <FieldLabel label="Employee group" helpKey="employeeGroup"><select value={policy.employeeGroup} onChange={event => update('employeeGroup', event.target.value)}><option>All Employees</option><option>Rank and File</option><option>Managers</option></select></FieldLabel>
        <FieldLabel label="Retirement plan type" helpKey="planType"><select value={policy.planType} onChange={event => update('planType', event.target.value)}><option>Statutory RA 7641</option><option>Company retirement plan</option><option>Best of statutory and company plan</option></select></FieldLabel>
        <FieldLabel label="Company salary basis" helpKey="salaryBasis"><select value={policy.salaryBasis} onChange={event => update('salaryBasis', event.target.value)}><option>Latest monthly basic pay</option><option>Average salary</option><option>Average of last 36 months</option></select></FieldLabel>
        <NumberField label="Daily rate divisor" helpKey="dailyRateDivisor" value={policy.dailyRateDivisor} onChange={value => update('dailyRateDivisor', value)} suffix="days" />
        <NumberField label="Statutory days per service year" helpKey="statutoryDays" value={policy.statutoryDays} onChange={value => update('statutoryDays', value)} suffix="days" />
        <NumberField label="Company-plan days per service year" helpKey="companyDays" value={policy.companyDays} onChange={value => update('companyDays', value)} suffix="days" />
        <NumberField label="Additional benefits" helpKey="additionalBenefits" value={policy.additionalBenefits} onChange={value => update('additionalBenefits', value)} suffix="PHP" />
        <NumberField label="Minimum retirement age" helpKey="minimumAge" value={policy.minimumAge} onChange={value => update('minimumAge', value)} suffix="years" />
        <NumberField label="Compulsory retirement age" helpKey="compulsoryAge" value={policy.compulsoryAge} onChange={value => update('compulsoryAge', value)} suffix="years" />
        <NumberField label="Minimum service" helpKey="minimumServiceYears" value={policy.minimumServiceYears} onChange={value => update('minimumServiceYears', value)} suffix="years" />
        <NumberField label="Company early-retirement age" helpKey="earlyRetirementAge" value={policy.earlyRetirementAge} onChange={value => update('earlyRetirementAge', value)} suffix="years" />
        <NumberField label="Minimum guarantee" helpKey="minimumGuarantee" value={policy.minimumGuarantee} onChange={value => update('minimumGuarantee', value)} suffix="PHP" />
        <NumberField label="Maximum cap (0 = none)" helpKey="maximumCap" value={policy.maximumCap} onChange={value => update('maximumCap', value)} suffix="PHP" />
        <FieldLabel className="wide" label="Service rounding" helpKey="serviceRounding" scopeKey="rounding"><select value={policy.rounding} onChange={event => update('rounding', event.target.value)}><option>Six months or more counts as one year</option><option>Completed years only (round down)</option><option>Any fraction counts as one year</option></select></FieldLabel>
        <FieldLabel className="wide" label="Taxation rule" helpKey="taxationRule" scopeKey="taxExemption"><select value={policy.taxExemption} onChange={event => update('taxExemption', event.target.value)}><option>Evaluate RA 7641 / NIRC and RA 4917</option><option>Taxable company benefit</option></select></FieldLabel>
      </div>
      <div className="policy-toggle-list"><Toggle value={policy.companyPlanApproved} onChange={value => update('companyPlanApproved', value)} helpKey="companyPlanApproved" label="BIR-approved company retirement plan" hint="Enables the RA 4917 exemption condition." /></div>
      <div className="formula-flow"><span><small>Statutory value</small><code>daily rate × {policy.statutoryDays} × rounded service years</code></span><ArrowsDownUp /><span><small>Company-plan value</small><code>configured daily rate × {policy.companyDays} × years + benefits</code></span><strong>Use the more beneficial value</strong></div>
      <div className="policy-save"><button className="button primary" onClick={() => onSave(result)}>Save retirement policy</button></div>
    </section>

    <aside className="policy-simulator">
      <header><Calculator weight="duotone" /><div><h2>Retirement scenario</h2><p>Eligibility, formula and tax trace. The result feeds the Final Pay engine.</p></div></header>
      <div className="policy-test-grid retirement-test">
        <FieldLabel label="Date of birth" helpKey="dateOfBirth"><input type="date" value={policy.test.dateOfBirth} onChange={event => updateTest('dateOfBirth', event.target.value)} /></FieldLabel>
        <FieldLabel label="Date hired" helpKey="dateHired"><input type="date" value={policy.test.dateHired} onChange={event => updateTest('dateHired', event.target.value)} /></FieldLabel>
        <FieldLabel label="Retirement date" helpKey="retirementDate"><input type="date" value={policy.test.retirementDate} onChange={event => updateTest('retirementDate', event.target.value)} /></FieldLabel>
        <FieldLabel label="Reason" helpKey="reason"><select value={policy.test.reason} onChange={event => updateTest('reason', event.target.value)}><option>Retirement</option><option>Resignation</option><option>Termination</option></select></FieldLabel>
        <FieldLabel label="Plan membership" helpKey="memberPlan"><select value={policy.test.memberPlan} onChange={event => updateTest('memberPlan', event.target.value)}><option>Statutory plan member</option><option>Company plan member</option></select></FieldLabel>
        <NumberField label="Monthly basic pay" helpKey="monthlyBasic" value={policy.test.monthlyBasic} onChange={value => updateTest('monthlyBasic', value)} />
        <NumberField label="Average salary" helpKey="average36Months" value={policy.test.average36Months} onChange={value => updateTest('average36Months', value)} />
      </div>
      <div className="eligibility-strip"><span className={result.eligibleAge ? 'pass' : 'fail'}>{result.eligibleAge ? <CheckCircle /> : <Warning />} Age {result.age.years}y {result.age.months}m</span><span className={result.eligibleService ? 'pass' : 'fail'}>{result.eligibleService ? <CheckCircle /> : <Warning />} Service {result.service.years}y {result.service.months}m</span><span className={result.eligible ? 'pass' : 'fail'}>{result.eligible ? <CheckCircle /> : <Warning />} {result.eligible ? 'Eligible' : 'Not eligible'}</span></div>
      <div className="policy-results retirement-results"><span><small>Rounded service years</small><strong>{result.roundedYears}</strong></span><span><small>Statutory value</small><strong>{money(result.statutory)}</strong></span><span><small>Company-plan value</small><strong>{money(result.company)}</strong></span><span className="highlight"><small>Retirement pay</small><strong>{money(result.selected)}</strong></span></div>
      <div className={`policy-outcome ${result.eligible ? 'success' : 'error'}`}>{result.eligible ? <CheckCircle weight="fill" /> : <Warning weight="fill" />}<span><strong>{result.eligible ? 'Eligibility passed' : 'Eligibility not met'}</strong><small>{result.eligible ? `Stored as ${result.taxExempt ? 'tax exempt' : 'taxable'} based on ${result.taxBasis}.` : 'Check age, service years, retirement reason and plan membership.'}</small></span></div>
      <div className="calculation-trace">
        <h3>Calculation trace</h3>
        <p>Statutory daily rate: <strong>{money(result.statutoryDaily)}</strong></p>
        <p>Company-plan daily rate: <strong>{money(result.companyDaily)}</strong></p>
        <p>Rounding rule &ldquo;{policy.rounding}&rdquo; turned {result.service.years}y {result.service.months}m into <strong>{result.roundedYears} year(s)</strong>.</p>
        <p>Tax status stored on the record: <strong>{result.taxExempt ? 'Tax exempt' : 'Taxable'}</strong> based on {result.taxBasis}.</p>
      </div>
      <div className="eligible-roster">
        <header><Users weight="duotone" /><div><h3>Automatically identified retirees</h3><p>{eligibleCount} of {roster.length} employees meet the configured conditions.</p></div></header>
        <table>
          <thead><tr><th>Employee</th><th>Age</th><th>Service</th><th>Plan</th><th>Retirement pay</th><th>Status</th></tr></thead>
          <tbody>{roster.map(({ employee, outcome }) => <tr key={employee.id}>
            <td><strong>{employee.name}</strong><small>{employee.id}</small></td>
            <td>{outcome.age.years}y</td>
            <td>{outcome.roundedYears}y</td>
            <td><small>{employee.memberPlan}</small></td>
            <td>{money(outcome.selected)}</td>
            <td><span className={`status-pill ${outcome.eligible ? 'active' : 'inactive'}`}>{outcome.eligible ? 'Eligible' : employee.reason !== 'Retirement' ? employee.reason : 'Not eligible'}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    </aside>
  </div>;
}

function GrossUpEngine({ policy, setPolicy, onSave }) {
  const result = useMemo(() => grossUpResult(policy), [policy]);
  const update = (key, value) => setPolicy(previous => ({ ...previous, [key]: value }));
  const updateTest = (key, value) => setPolicy(previous => ({ ...previous, test: { ...previous.test, [key]: value } }));
  return <div className="policy-engine-grid gross-up-engine">
    <section className="policy-config-card">
      <header><span><Calculator weight="duotone" /></span><div><h2>Gross Up</h2><p>Guarantees a net amount by solving the gross taxable pay and the withholding the employer absorbs.</p></div><button className={`switch ${policy.enabled ? 'on' : ''}`} onClick={() => update('enabled', !policy.enabled)}><span /></button></header>
      <div className="policy-form-grid">
        <FieldLabel label="Employee group" helpKey="employeeGroup"><select value={policy.employeeGroup} onChange={event => update('employeeGroup', event.target.value)}><option>All Employees</option><option>Rank and File</option><option>Managers</option></select></FieldLabel>
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

function FinalPayEngine({ policy, setPolicy, retirementValue, onSave }) {
  const result = useMemo(() => finalPayResult(policy, retirementValue), [policy, retirementValue]);
  const update = (key, value) => setPolicy(previous => ({ ...previous, [key]: value }));
  const updateTest = (key, value) => setPolicy(previous => ({ ...previous, test: { ...previous.test, [key]: value } }));
  const toggleComponent = (bucket, label) => setPolicy(previous => ({ ...previous, [bucket]: { ...previous[bucket], [label]: !previous[bucket][label] } }));
  return <div className="policy-engine-grid final-pay-engine">
    <section className="policy-config-card">
      <header><span><Table weight="duotone" /></span><div><h2>Final Pay</h2><p>Component selection and company rules applied when an employee is separated.</p></div><button className={`switch ${policy.enabled ? 'on' : ''}`} onClick={() => update('enabled', !policy.enabled)}><span /></button></header>
      <div className="policy-form-grid">
        <FieldLabel className="wide" label="Employee group" helpKey="employeeGroup"><select value={policy.employeeGroup} onChange={event => update('employeeGroup', event.target.value)}><option>All Employees</option><option>Rank and File</option><option>Managers</option></select></FieldLabel>
      </div>
      <div className="component-checklist-row">
        <CheckList title="Mandatory components" helpKey="finalPayComponents" values={policy.components} onToggle={label => toggleComponent('components', label)} />
        <CheckList title="Optional company components" helpKey="optionalComponents" values={policy.optionalComponents} onToggle={label => toggleComponent('optionalComponents', label)} />
      </div>
      <h3 className="policy-subheading">Company rules</h3>
      <div className="policy-form-grid">
        <FieldLabel className="wide" label="Leave conversion rule"><select value={policy.leaveConversionRule} onChange={event => update('leaveConversionRule', event.target.value)}><option>Convert unused VL and SIL at the current daily rate</option><option>Convert SIL only</option><option>No leave conversion on separation</option></select></FieldLabel>
        <FieldLabel className="wide" label="Separation pay rule by cause"><select value={policy.separationPayRule} onChange={event => update('separationPayRule', event.target.value)}><option>Not applicable — retirement</option><option>One month pay per year of service (redundancy)</option><option>Half month pay per year of service (retrenchment)</option><option>No separation pay (resignation or just cause)</option></select></FieldLabel>
        <NumberField label="Daily rate divisor" helpKey="dailyRateDivisor" value={policy.dailyRateDivisor} onChange={value => update('dailyRateDivisor', value)} suffix="days" />
        <FieldLabel label="Rounding of service years" helpKey="serviceRounding"><select value={policy.serviceRounding} onChange={event => update('serviceRounding', event.target.value)}><option>Six months or more counts as one year</option><option>Completed years only (round down)</option><option>Any fraction counts as one year</option></select></FieldLabel>
        <FieldLabel label="Advance 13th month rule"><select value={policy.advanceThirteenthRule} onChange={event => update('advanceThirteenthRule', event.target.value)}><option>Deduct any advanced 13th month release</option><option>Do not recover</option></select></FieldLabel>
        <FieldLabel label="Last cutoff rule"><select value={policy.lastCutoffRule} onChange={event => update('lastCutoffRule', event.target.value)}><option>Include the unposted last cutoff</option><option>Process the last cutoff separately</option></select></FieldLabel>
        <FieldLabel label="Government loan balance"><select value={policy.governmentLoanRule} onChange={event => update('governmentLoanRule', event.target.value)}><option>Offset the full outstanding balance</option><option>Endorse the balance to the agency</option></select></FieldLabel>
        <FieldLabel label="Company loan balance"><select value={policy.companyLoanRule} onChange={event => update('companyLoanRule', event.target.value)}><option>Offset the full outstanding balance</option><option>Convert to a receivable</option></select></FieldLabel>
        <FieldLabel className="wide" label="Net pay rule when negative" helpKey="negativeNetPayRule"><select value={policy.negativeNetPayRule} onChange={event => update('negativeNetPayRule', event.target.value)}><option>Raise for approval and bill the employee</option><option>Write off the difference</option><option>Hold the final pay release</option></select></FieldLabel>
      </div>
      <div className="policy-toggle-list">
        <Toggle value={policy.autoOffsetDeductions} onChange={value => update('autoOffsetDeductions', value)} helpKey="autoOffsetDeductions" label="Auto-offset authorized deductions" hint="Offset loan balances and property accountabilities before net final pay." />
        <Toggle value={policy.notifyAdmin} onChange={value => update('notifyAdmin', value)} label="Notify admin on release" hint="Alert payroll administrators when a final pay breakdown is ready." />
      </div>
      <div className="policy-save"><button className="button primary" onClick={() => onSave(result)}>Save final pay policy</button></div>
    </section>

    <aside className="policy-simulator">
      <header><Calculator weight="duotone" /><div><h2>Final pay breakdown</h2><p>Retirement pay is pulled from the Retirement engine result.</p></div></header>
      <div className="policy-test-grid">
        <NumberField label="Unpaid salary" value={policy.test.unpaidSalary} onChange={value => updateTest('unpaidSalary', value)} />
        <NumberField label="Prorated 13th month" value={policy.test.thirteenthMonth} onChange={value => updateTest('thirteenthMonth', value)} />
        <NumberField label="SIL conversion" value={policy.test.silConversion} onChange={value => updateTest('silConversion', value)} />
        <NumberField label="Separation pay" value={policy.test.separationPay} onChange={value => updateTest('separationPay', value)} />
        <NumberField label="Convertible VL / SL" value={policy.test.convertibleLeave} onChange={value => updateTest('convertibleLeave', value)} />
        <NumberField label="Allowances" value={policy.test.allowances} onChange={value => updateTest('allowances', value)} />
        <NumberField label="Cash bond return" value={policy.test.cashBond} onChange={value => updateTest('cashBond', value)} />
        <NumberField label="Advance 13th month" value={policy.test.advanceThirteenth} onChange={value => updateTest('advanceThirteenth', value)} />
        <NumberField label="Government loan balance" value={policy.test.governmentLoanBalance} onChange={value => updateTest('governmentLoanBalance', value)} />
        <NumberField label="Company loan balance" value={policy.test.companyLoanBalance} onChange={value => updateTest('companyLoanBalance', value)} />
        <NumberField label="Property accountability" value={policy.test.propertyAccountability} onChange={value => updateTest('propertyAccountability', value)} />
        <NumberField label="Final tax" value={policy.test.finalTax} onChange={value => updateTest('finalTax', value)} />
      </div>
      <div className="policy-results"><span><small>Gross final pay</small><strong>{money(result.grossFinalPay)}</strong></span><span><small>Total offsets</small><strong>{money(result.totalDeductions)}</strong></span><span><small>Retirement pay included</small><strong>{money(policy.components['Retirement pay'] ? retirementValue : 0)}</strong></span><span className="highlight"><small>Net final pay</small><strong>{money(result.netFinalPay)}</strong></span></div>
      <div className={`policy-outcome ${result.negative ? 'error' : 'success'}`}>{result.negative ? <Warning weight="fill" /> : <CheckCircle weight="fill" />}<span><strong>{result.negative ? 'Negative net final pay' : 'Final pay ready for release'}</strong><small>{result.negative ? `Company rule applied: ${policy.negativeNetPayRule}.` : 'All enabled components were computed and authorized deductions were offset.'}</small></span></div>
      <div className="simulation-ledger">
        <h3>Breakdown</h3>
        <table>
          <thead><tr><th>Component</th><th>Type</th><th>Amount</th></tr></thead>
          <tbody>
            {result.earnings.filter(item => item.on).map(item => <tr key={item.label}><td>{item.label}</td><td><small>Earning</small></td><td>{money(item.value)}</td></tr>)}
            {result.deductions.filter(item => item.on).map(item => <tr key={item.label}><td>{item.label}</td><td><small>Offset</small></td><td className="deferred-copy">−{money(item.value)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </aside>
  </div>;
}

const codeSubcategories = companyRuleTaxonomy;

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
        <thead><tr><th>Code</th><th>Policy code</th><th>Applies to</th><th>Parameters</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{filteredCodes.map(item => { const completeSchema = completeParameterSchema(item); return <tr key={item.code}><td><code>{item.code}</code></td><td><strong>{item.name}</strong><small>{item.description}</small></td><td><strong>{item.subcategory}</strong><small>{item.category}</small></td><td><span className="policy-count" title={`${completeSchema.length} configurable parameters`} aria-label={`${completeSchema.length} configurable parameters`}>{completeSchema.length}</span></td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></td><td><div className="policy-code-actions"><button type="button" className="policy-code-open" onClick={() => policyEngineTabForCode(item) ? onOpenEngine?.(item) : openCreator(item)}>{policyEngineTabForCode(item) ? 'Open engine' : 'Create variant'}</button>{item.isBuiltIn ? <span className="policy-code-lock"><Lock /> Standard</span> : <div className="row-actions always"><button type="button" onClick={() => openEditor(item)} aria-label={`Edit ${item.code}`}><PencilSimple /></button><button type="button" onClick={() => onDelete(item)} aria-label={`Delete ${item.code}`}><Trash /></button></div>}</div></td></tr>; })}</tbody>
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
  const retirementValue = useMemo(() => retirementResult(policies.retirement).selected, [policies.retirement]);

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
      onSave={result => savePolicy('Minimum Take-Home Pay policy', `Threshold ${policies.takeHome.thresholdType === 'Percentage' ? `${policies.takeHome.threshold}%` : money(policies.takeHome.threshold)} · ${policies.takeHome.employeeGroup} · ${money(result.deferred)} deferred in the saved scenario`)}
    />}

      {tab === 'retirement' && <RetirementEngine
      policy={policies.retirement}
      setPolicy={setSection('retirement')}
      onSave={result => savePolicy('Retirement Pay policy', `${policies.retirement.planType} · ${policies.retirement.employeeGroup} · scenario ${money(result.selected)} · ${result.taxExempt ? 'tax exempt' : 'taxable'} (${result.taxBasis})`)}
    />}

      {tab === 'gross-up' && <GrossUpEngine
      policy={policies.grossUp}
      setPolicy={setSection('grossUp')}
      onSave={result => savePolicy('Gross Up policy', `${policies.grossUp.taxMethod} · ${policies.grossUp.employeeGroup} · gross ${money(result.grossTaxable)} for ${money(result.targetNet)} net`)}
      />}

      {tab === 'final-pay' && <FinalPayEngine
      policy={policies.finalPay}
      setPolicy={setSection('finalPay')}
      retirementValue={retirementValue}
      onSave={result => savePolicy('Final Pay policy', `${policies.finalPay.employeeGroup} · net ${money(result.netFinalPay)} · retirement pay ${policies.finalPay.components['Retirement pay'] ? 'included' : 'excluded'}`)}
      />}
      </EngineScope.Provider>
    </div>
  </section>;
}
