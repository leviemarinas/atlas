import { useEffect, useMemo, useState } from 'react';
import {
  ArrowsDownUp,
  Calculator,
  CheckCircle,
  Info,
  Lock,
  Scales,
  ShieldCheck,
  Table,
  Users,
  Warning,
} from '@phosphor-icons/react';

const STORAGE_KEY = 'atlas-payroll-policy-engines-v3';

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
      const [group = 'Deduction', kind = ''] = String(entry.note || '').split('·').map(part => part.trim());
      return { name: entry.key, rank: Number(entry.value), group, kind };
    })
    .filter(entry => entry.name && Number.isFinite(entry.rank));
  return rows.length ? rows.sort((a, b) => a.rank - b.rank) : fallbackHierarchy;
}

function readPolicies() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return seedPolicies;
    return {
      takeHome: { ...seedPolicies.takeHome, ...saved.takeHome, test: { ...seedPolicies.takeHome.test, ...saved.takeHome?.test }, scenario: { ...seedPolicies.takeHome.scenario, ...saved.takeHome?.scenario } },
      retirement: { ...seedPolicies.retirement, ...saved.retirement, test: { ...seedPolicies.retirement.test, ...saved.retirement?.test } },
      finalPay: { ...seedPolicies.finalPay, ...saved.finalPay, test: { ...seedPolicies.finalPay.test, ...saved.finalPay?.test } },
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
};

function FieldHelp({ helpKey }) {
  const inferredKey = String(helpKey || '').replace(/[^a-zA-Z0-9 ]/g, '').split(' ').filter(Boolean).map((part, index) => index ? `${part[0].toUpperCase()}${part.slice(1)}` : part.toLowerCase()).join('');
  const help = FIELD_HELP[helpKey] || FIELD_HELP[inferredKey];
  const [open, setOpen] = useState(false);
  if (!help) return null;
  return <span className="field-help"><button type="button" aria-label={`Help for ${help[0]}`} title={`${help[1]} ${help[2]}`} onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(value => !value); }}><Info weight="bold" /></button>{open && <span className="field-help-popover"><strong>{help[0]}</strong><small>{help[1]}</small><em>{help[2]}</em></span>}</span>;
}

function FieldLabel({ label, helpKey = label, children, className = '' }) {
  return <label className={`policy-field ${className}`}><span className="policy-field-label">{label}<FieldHelp helpKey={helpKey} /></span>{children}</label>;
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
      const scenario = policy.scenario?.[entry.name] || {};
      const due = number(scenario.due);
      return {
        ...entry,
        due,
        deducted: due,
        deferred: 0,
        priorDeferred: number(scenario.priorDeferred),
        outstanding: number(scenario.outstanding) || due,
      };
    })
    .sort((a, b) => a.rank - b.rank);

  // Rank 1 is adjusted first, so deferrals walk the hierarchy in ascending rank.
  const deferFrom = (candidates, requested) => {
    let remaining = Math.max(0, requested);
    [...candidates].sort((a, b) => a.rank - b.rank).forEach(item => {
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

function Toggle({ value, onChange, label, hint, helpKey = label }) {
  return <label className="policy-toggle"><span><strong>{label}<FieldHelp helpKey={helpKey} /></strong>{hint && <small>{hint}</small>}</span><button type="button" className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)}><span /></button></label>;
}

function NumberField({ label, value, onChange, suffix, helpKey = label }) {
  return <FieldLabel label={label} helpKey={helpKey}><div className="suffix-input"><input type="number" min="0" step="0.01" value={value} onChange={event => onChange(number(event.target.value))} />{suffix && <span>{suffix}</span>}</div></FieldLabel>;
}

function CheckList({ title, helpKey, values, onToggle }) {
  return <div className="component-checklist"><h3>{title}<FieldHelp helpKey={helpKey} /></h3><div>{Object.entries(values).map(([label, on]) => <label key={label}><input type="checkbox" checked={on} onChange={() => onToggle(label)} /> {label}</label>)}</div></div>;
}

function HierarchyPanel({ hierarchy, scenario, onScenario, onManageHierarchy, sourced }) {
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
      <button className="button secondary small" onClick={onManageHierarchy}><Table /> Manage in {HIERARCHY_REFERENCE_CODE}</button>
    </div>
    <div className={`hierarchy-source ${sourced ? 'linked' : 'fallback'}`}>
      <Lock weight="duotone" />
      <span>{sourced
        ? <>Order is read from the <strong>{HIERARCHY_REFERENCE_CODE} Deduction and Loan Hierarchy</strong> reference table. Edit it there to change the adjustment sequence.</>
        : <>The <strong>{HIERARCHY_REFERENCE_CODE}</strong> reference table has no usable rows, so the Atlas default order is in use.</>}</span>
    </div>
    {groups.map(([title, rows]) => rows.length > 0 && <div className="deduction-rank-table" key={title}>
      <h4>{title}</h4>
      <table>
        <thead><tr><th>Rank</th><th>Item</th><th>Classification</th><th>Amount due</th><th>Previously deferred</th><th>Outstanding balance</th></tr></thead>
        <tbody>{rows.map(item => {
          const values = scenario[item.name] || {};
          return <tr key={item.name}>
            <td><span className="rank-chip">{item.rank}</span></td>
            <td>{item.name}</td>
            <td><small>{item.kind || '—'}</small></td>
            <td><input type="number" min="0" value={values.due ?? 0} onChange={event => onScenario(item.name, 'due', number(event.target.value))} /></td>
            <td><input type="number" min="0" value={values.priorDeferred ?? 0} onChange={event => onScenario(item.name, 'priorDeferred', number(event.target.value))} /></td>
            <td><input type="number" min="0" value={values.outstanding ?? 0} onChange={event => onScenario(item.name, 'outstanding', number(event.target.value))} /></td>
          </tr>;
        })}</tbody>
      </table>
    </div>)}
  </>;
}

function TakeHomeEngine({ policy, setPolicy, hierarchy, sourced, onManageHierarchy, onSave }) {
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
        <FieldLabel label="Protected base" helpKey="protectedBase"><select value={policy.base} onChange={event => update('base', event.target.value)}>{BASE_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
        <FieldLabel label="Threshold type" helpKey="thresholdType"><select value={policy.thresholdType} onChange={event => update('thresholdType', event.target.value)}><option>Percentage</option><option>Fixed Amount</option></select></FieldLabel>
        <NumberField label="Threshold" helpKey="threshold" value={policy.threshold} onChange={value => update('threshold', value)} suffix={policy.thresholdType === 'Percentage' ? '%' : 'PHP'} />
        <FieldLabel className="wide" label="Conflict priority" helpKey="conflictPriority"><select value={policy.priorityChoice} onChange={event => update('priorityChoice', event.target.value)}><option>Take-Home Pay</option><option>Loan Deduction Cap</option></select></FieldLabel>
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

      <HierarchyPanel hierarchy={hierarchy} scenario={policy.scenario} onScenario={updateScenario} onManageHierarchy={onManageHierarchy} sourced={sourced} />
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
          <tbody>{result.ledger.map(item => <tr key={item.name}>
            <td><strong>{item.name}</strong><small>Rank {item.rank} · {item.group}</small></td>
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
          <tbody>{deferredRows.map(item => <tr key={item.name}><td>{item.name}</td><td>{money(item.deferred)}</td><td>{policy.test.nextPayrollDate}</td><td>{money(item.remaining)}</td></tr>)}</tbody>
        </table>
      </div>}

      {policy.payslipTagging && deferredRows.length > 0 && <div className="payslip-note">
        <Info />
        <div>
          <strong>Payslip tag: Deferred Deduction</strong>
          <table className="payslip-tag-table">
            <thead><tr><th>Deduction</th><th>Originally due</th><th>Deducted</th><th>Deferred</th><th>Accumulated</th><th>Remaining</th><th>Reason</th></tr></thead>
            <tbody>{deferredRows.map(item => <tr key={item.name}><td>{item.name}</td><td>{money(item.due)}</td><td>{money(item.deducted)}</td><td>{money(item.deferred)}</td><td>{money(item.accumulated)}</td><td>{money(item.remaining)}</td><td>Below Net Pay Requirement</td></tr>)}</tbody>
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
        <FieldLabel className="wide" label="Service rounding" helpKey="serviceRounding"><select value={policy.rounding} onChange={event => update('rounding', event.target.value)}><option>Six months or more counts as one year</option><option>Completed years only (round down)</option><option>Any fraction counts as one year</option></select></FieldLabel>
        <FieldLabel className="wide" label="Taxation rule" helpKey="taxationRule"><select value={policy.taxExemption} onChange={event => update('taxExemption', event.target.value)}><option>Evaluate RA 7641 / NIRC and RA 4917</option><option>Taxable company benefit</option></select></FieldLabel>
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

export function PolicyComputations({ notify, addHistory, references, onManageHierarchy, initialTab = 'take-home' }) {
  const [policies, setPolicies] = useState(readPolicies);
  const [tab, setTab] = useState(initialTab);
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

  return <section className="policy-workspace">
    <div className="policy-tabs">
      <button className={tab === 'take-home' ? 'active' : ''} onClick={() => setTab('take-home')}>Take-Home Pay <span>THP-001</span></button>
      <button className={tab === 'retirement' ? 'active' : ''} onClick={() => setTab('retirement')}>Retirement Pay <span>RET-001</span></button>
      <button className={tab === 'final-pay' ? 'active' : ''} onClick={() => setTab('final-pay')}>Final Pay <span>FIN-001</span></button>
    </div>

    {tab === 'take-home' && <TakeHomeEngine
      policy={policies.takeHome}
      setPolicy={setSection('takeHome')}
      hierarchy={hierarchy}
      sourced={sourced && Boolean(hierarchyTable)}
      onManageHierarchy={onManageHierarchy}
      onSave={result => savePolicy('Minimum Take-Home Pay policy', `Threshold ${policies.takeHome.thresholdType === 'Percentage' ? `${policies.takeHome.threshold}%` : money(policies.takeHome.threshold)} · ${policies.takeHome.employeeGroup} · ${money(result.deferred)} deferred in the saved scenario`)}
    />}

    {tab === 'retirement' && <RetirementEngine
      policy={policies.retirement}
      setPolicy={setSection('retirement')}
      onSave={result => savePolicy('Retirement Pay policy', `${policies.retirement.planType} · ${policies.retirement.employeeGroup} · scenario ${money(result.selected)} · ${result.taxExempt ? 'tax exempt' : 'taxable'} (${result.taxBasis})`)}
    />}

    {tab === 'final-pay' && <FinalPayEngine
      policy={policies.finalPay}
      setPolicy={setSection('finalPay')}
      retirementValue={retirementValue}
      onSave={result => savePolicy('Final Pay policy', `${policies.finalPay.employeeGroup} · net ${money(result.netFinalPay)} · retirement pay ${policies.finalPay.components['Retirement pay'] ? 'included' : 'excluded'}`)}
    />}
  </section>;
}
