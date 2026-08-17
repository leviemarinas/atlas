import { createContext, useContext, useState } from 'react';
import { Info } from '@phosphor-icons/react';

export const money = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const number = value => Number(value || 0);

export const BASE_OPTIONS = ['Basic Pay', 'Gross Pay', 'Gross Pay less reimbursements / receivables'];

export function baseAmount(option, test) {
  const gross = number(test.grossPay);
  if (option === 'Basic Pay') return number(test.basicPay);
  if (option === 'Gross Pay') return gross;
  return Math.max(0, gross - number(test.reimbursements));
}

export function difference(startValue, endValue) {
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

export const FIELD_HELP = {
  employeeGroup: ['Employee group', 'Limits the rule to a defined employee population.', 'Example: Rank and File'],
  applicability: ['Applicability', 'Whether the configuration covers all employees, one employee group, a department, or named individuals.', 'Example: Specific Employees — E-1042, E-3391'],
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
  recoveryMethod: ['Recovery method', 'How an outstanding amount is collected in later payrolls. Carrying a balance forward and staggering it are separate decisions.', 'Example: Scheduled installments'],
  staggerThreshold: ['Staggering threshold', 'Outstanding amounts at or below this value are recovered in full on the next payroll instead of being staggered.', 'Example: PHP 1,000'],
  basicPay: ['Basic pay', 'The employee basic pay amount used in the take-home scenario.', 'Example: PHP 30,000'],
  grossPay: ['Gross pay', 'Total earnings before statutory deductions and controllable deductions. Basic pay is only one of its components.', 'Example: PHP 36,500'],
  reimbursements: ['Reimbursements / receivables', 'Amounts excluded from the protected base when the selected basis removes them.', 'Example: PHP 2,000'],
  statutory: ['Mandatory statutory deductions', 'BIR, SSS, PhilHealth, and Pag-IBIG deductions that remain applied in full.', 'Example: PHP 6,500'],
  attendanceDays: ['LAUT days', 'Late, absence, and undertime units used to test the attendance cap.', 'Example: 4 days'],
  nextPayrollDate: ['Next payroll date', 'Rescheduled deduction date recorded against every deferred item.', 'Example: 31 Aug 2026'],
  deductionHierarchy: ['Deduction and loan hierarchy', 'Ranks controllable items so the engine knows which to adjust first. Maintained in the REF-011 reference table.', 'Example: Rank 1 is adjusted before Rank 2'],
  planType: ['Retirement plan type', 'Chooses the statutory plan, company plan, or more beneficial qualifying value.', 'Example: Best of statutory and company plan'],
  salaryBasis: ['Company salary basis', 'Salary measure used to calculate the company retirement-plan value.', 'Example: Latest monthly basic pay'],
  salaryBasisSource: ['Retirement earnings source', 'Whether the retirement salary basis is basic pay only, every earning classified as Retirement in Earning Configuration, or an explicit selection.', 'Example: Earnings classified as Retirement'],
  salaryBasisEarnings: ['Included earnings', 'Earnings added to monthly basic pay when the retirement salary basis is more than basic pay.', 'Example: Transportation and communication allowance'],
  dailyRateDivisor: ['Daily rate divisor', 'Divides monthly basic pay to derive the daily retirement rate.', 'Example: 30 days'],
  statutoryDays: ['Statutory days per service year', 'The statutory retirement-day equivalent applied for every rounded service year.', 'Example: 22.5 days'],
  companyDays: ['Company-plan days per service year', 'Company plan days applied for each qualifying service year. A company plan may exceed the statutory 22.5 days but never falls below it.', 'Example: 30 days'],
  additionalBenefits: ['Additional benefits', 'Qualifying lump sum, gratuity, or similar benefits added to the company-plan value.', 'Example: PHP 15,000'],
  minimumAge: ['Minimum retirement age', 'Earliest statutory age used for normal retirement eligibility.', 'Example: 60 years'],
  compulsoryAge: ['Compulsory retirement age', 'Age at which compulsory retirement eligibility is reached.', 'Example: 65 years'],
  minimumServiceYears: ['Minimum service', 'Minimum completed service required before the retirement benefit qualifies.', 'Example: 5 years'],
  earlyRetirementAge: ['Company early-retirement age', 'Optional earlier age allowed when the employee is a qualifying company-plan member.', 'Example: 55 years'],
  minimumGuarantee: ['Minimum guarantee', 'Floor applied to the company-plan value when configured.', 'Example: PHP 100,000'],
  maximumCap: ['Maximum cap', 'Optional ceiling applied to the company-plan value; zero means no ceiling.', 'Example: 0 = none'],
  serviceRounding: ['Service rounding', 'How a fractional final year of service is converted into whole years.', 'Example: Six months or more counts as one year'],
  serviceHistoryRule: ['Service history rule', 'How rehires and breaks in service are credited when years of service are computed.', 'Example: Credit prior service, exclude the break'],
  taxationRule: ['Taxation rule', 'Determines which exemption conditions are evaluated for the retirement output.', 'Example: RA 7641 / NIRC and RA 4917'],
  companyPlanApproved: ['BIR-approved company retirement plan', 'Marks whether the company plan meets the RA 4917 approval condition.', 'Example: Enabled'],
  dateOfBirth: ['Date of birth', 'Employee birth date used to compute age at the retirement date.', 'Example: 15 Jan 1964'],
  dateHired: ['Date hired', 'Start date used to calculate completed service and the rounding rule.', 'Example: 1 Feb 2014'],
  retirementDate: ['Retirement date', 'Date on which eligibility and retirement value are tested.', 'Example: 31 Aug 2026'],
  reason: ['Reason', 'Separates retirement from resignation or termination scenarios.', 'Example: Retirement'],
  memberPlan: ['Plan membership', 'Identifies whether the employee belongs to the statutory or company plan.', 'Example: Company plan member'],
  monthlyBasic: ['Monthly basic pay', 'Salary base used for the statutory retirement calculation.', 'Example: PHP 60,000'],
  average36Months: ['Average salary', 'Alternative salary basis when the company plan averages recent salary.', 'Example: PHP 55,000'],
  priorServiceYears: ['Prior service years', 'Completed service before the break, credited when the service history rule allows it.', 'Example: 6 years'],
  breakMonths: ['Break in service', 'Months between separation and rehire, excluded from credited service.', 'Example: 14 months'],
  finalPayComponents: ['Mandatory components', 'Pay items that always form part of final pay when applicable.', 'Example: Unpaid salary'],
  optionalComponents: ['Optional components', 'Company-specific items added to final pay.', 'Example: Cash bond return'],
  includedEarnings: ['Included earnings', 'Earnings from Earning Configuration that form part of final pay. Final Pay selects existing earnings; it does not redefine them.', 'Example: Clothing and meal allowance'],
  includedDeductions: ['Included deductions and loans', 'Deductions and loans recoverable during final pay, taken from their owning modules.', 'Example: Company salary loan'],
  reasonForLeaving: ['Reason for leaving', 'Separation reason from the Employee Masterfile. It selects which separation-pay formula applies, so it is not informational text.', 'Example: Retrenchment'],
  separationDate: ['Separation date', 'Employee separation date from the masterfile. It drives proration, statutory contribution handling, and final tax.', 'Example: 31 Aug 2026'],
  statutoryRule: ['Statutory contribution treatment', 'Whether SSS, PhilHealth and Pag-IBIG are computed during final pay, skipped, or decided on the payroll transaction.', 'Example: Decide on the payroll transaction'],
  finalPayHierarchy: ['Final pay deduction hierarchy', 'Final pay may need a different adjustment order from regular payroll, so it does not inherit REF-011 unless the rule says so.', 'Example: Dedicated final pay hierarchy'],
  negativeNetPayRule: ['Negative net pay rule', 'What happens when deductions exceed the final pay earnings.', 'Example: Raise for approval'],
  autoOffsetDeductions: ['Auto-offset deductions', 'Offsets authorized deductions, accountabilities, and loan balances before net final pay.', 'Example: Enabled'],
  transactionMethod: ['Transaction method', 'How the payroll transaction produces the amount: engine calculation, manual input, upload, or an approved override.', 'Example: Calculate using the engine'],
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

export function FieldHelp({ helpKey }) {
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
export const EngineScope = createContext(null);

/**
 * One hook call that resolves any number of parameter keys, so a control that
 * owns several parameters (a checklist, a mapping table) can still show exactly
 * which of them the opened code governs.
 */
export function useScopeResolver() {
  const scope = useContext(EngineScope);
  return key => (!scope?.keys?.length ? '' : scope.keys.includes(key) ? 'in-scope' : 'out-of-scope');
}

export function useFieldScope(helpKey) {
  return useScopeResolver()(helpKey);
}

export function FieldLabel({ label, helpKey = label, scopeKey = helpKey, children, className = '' }) {
  const scopeClass = useFieldScope(scopeKey);
  return <label className={`policy-field ${className} ${scopeClass}`}><span className="policy-field-label">{label}<FieldHelp helpKey={helpKey} /></span>{children}</label>;
}

export function Toggle({ value, onChange, label, hint, helpKey = label, scopeKey = helpKey }) {
  const scopeClass = useFieldScope(scopeKey);
  return <label className={`policy-toggle ${scopeClass}`}><span><strong>{label}<FieldHelp helpKey={helpKey} /></strong>{hint && <small>{hint}</small>}</span><button type="button" className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)}><span /></button></label>;
}

export function NumberField({ label, value, onChange, suffix, helpKey = label, scopeKey = helpKey }) {
  return <FieldLabel label={label} helpKey={helpKey} scopeKey={scopeKey}><div className="suffix-input"><input type="number" min="0" step="0.01" value={value} onChange={event => onChange(number(event.target.value))} />{suffix && <span>{suffix}</span>}</div></FieldLabel>;
}

/**
 * `keys` maps each checkbox label to the policy parameter it configures, so a
 * checklist of six components highlights six governed parameters rather than
 * reading as one field.
 */
export function CheckList({ title, helpKey, values, onToggle, keys = {} }) {
  const resolve = useScopeResolver();
  return <div className="component-checklist"><h3>{title}<FieldHelp helpKey={helpKey} /></h3><div>{Object.entries(values).map(([label, on]) => <label key={label} className={resolve(keys[label])}><input type="checkbox" checked={on} onChange={() => onToggle(label)} /> {label}</label>)}</div></div>;
}

/**
 * Multi-select over records that another module already owns. Used wherever a
 * policy engine has to identify existing earnings, deductions, or loans instead
 * of recreating their definitions.
 */
export function SourceMultiSelect({ title, hint, options, selected, onToggle, emptyMessage, helpKey, scopeKey = helpKey }) {
  const scopeClass = useFieldScope(scopeKey);
  return <div className={`source-multiselect ${scopeClass}`}>
    <header><div><strong>{title}<FieldHelp helpKey={helpKey} /></strong><small>{hint}</small></div><span>{selected.length} of {options.length} selected</span></header>
    {options.length === 0 && <p className="applicability-empty">{emptyMessage}</p>}
    <div className="source-multiselect-options">{options.map(option => <label key={option.value} className={selected.includes(option.value) ? 'selected' : ''}>
      <input type="checkbox" checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} />
      <span><strong>{option.label}</strong><small>{option.detail}</small></span>
    </label>)}</div>
  </div>;
}
