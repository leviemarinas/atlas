import { useEffect, useMemo, useState } from 'react';
import {
  ArrowsDownUp,
  Calculator,
  CheckCircle,
  Info,
  Plus,
  Scales,
  ShieldCheck,
  Trash,
  Warning,
} from '@phosphor-icons/react';

const STORAGE_KEY = 'atlas-payroll-policy-engines-v2';

const seedPolicies = {
  takeHome: {
    enabled: true,
    employeeGroup: 'All Employees',
    base: 'Gross Pay less reimbursements / receivables',
    thresholdType: 'Percentage',
    threshold: 30,
    priorityChoice: 'Take-Home Pay',
    loanCapType: 'Percentage of Gross Pay',
    loanCap: 25,
    attendanceCapType: 'Number of Days',
    attendanceCap: 3,
    autoDefer: true,
    carryForward: true,
    payslipTagging: true,
    notifyEmployee: true,
    deductionItems: [
      { id: 1, name: 'HMO', type: 'Loan', rank: 1, due: 1200 },
      { id: 2, name: 'Educational Loan', type: 'Loan', rank: 2, due: 1500 },
      { id: 3, name: 'Salary Loan', type: 'Loan', rank: 3, due: 2500 },
      { id: 4, name: 'SSS Salary Loan', type: 'Loan', rank: 4, due: 1000 },
      { id: 5, name: 'Pag-IBIG Salary Loan', type: 'Loan', rank: 5, due: 800 },
      { id: 6, name: 'Lates, Absences & Undertime', type: 'Attendance', rank: 6, due: 900 },
      { id: 7, name: 'Optional deductions', type: 'Optional', rank: 7, due: 750 },
    ],
    test: { basicPay: 30000, grossPay: 36500, reimbursements: 2000, statutory: 6500, attendanceDays: 4 },
  },
  retirement: {
    enabled: true,
    employeeGroup: 'All Employees',
    planType: 'Best of statutory and company plan',
    salaryBasis: 'Latest monthly basic pay',
    dailyRateDivisor: 30,
    statutoryDays: 22.5,
    companyDays: 30,
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
      monthlyBasic: 60000, average36Months: 55000, additionalBenefits: 15000,
      reason: 'Retirement', memberPlan: 'Company plan member',
    },
  },
};

function readPolicies() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || seedPolicies; } catch { return seedPolicies; }
}

const money = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = value => Number(value || 0);

const FIELD_HELP = {
  employeeGroup: ['Employee group', 'Limits the rule to a defined employee population.', 'Example: Rank and File'],
  protectedBase: ['Protected base', 'The earnings amount used to calculate the minimum take-home threshold.', 'Example: Gross Pay less reimbursements / receivables'],
  thresholdType: ['Threshold type', 'Chooses whether the protected minimum is a percentage or a fixed peso amount.', 'Example: Percentage'],
  threshold: ['Threshold', 'The protected minimum value applied to the selected base.', 'Example: 30% of PHP 34,500'],
  conflictPriority: ['Conflict priority', 'Determines which company protection rule wins when two controls limit a deduction.', 'Example: Take-Home Pay'],
  loanCapType: ['Loan cap type', 'Sets the unit used to limit controllable loan deductions in one payroll.', 'Example: Percentage of Gross Pay'],
  loanCap: ['Loan cap', 'Maximum loan amount that can be deducted in the current payroll after the cap is applied.', 'Example: 25% of gross pay'],
  attendanceCapType: ['Attendance cap type', 'Sets whether the attendance adjustment limit is measured in days, percentage, or amount.', 'Example: Number of Days'],
  attendanceCap: ['Attendance cap', 'Maximum attendance-related adjustment allowed for the current payroll.', 'Example: 3 days'],
  autoDefer: ['Auto-defer or stagger deductions', 'Moves eligible lower-priority deductions to a later payroll when the protected minimum would be breached.', 'Example: Defer optional deductions first'],
  carryForward: ['Carry forward to next payroll', 'Stores the outstanding amount, next schedule, and remaining balance for the next payroll.', 'Example: PHP 750 deferred to the next cutoff'],
  payslipTagging: ['Payslip tagging', 'Shows the original due amount, deducted amount, and deferred amount on the payslip.', 'Example: Deferred Deduction'],
  notifyEmployee: ['Admin and employee notification', 'Creates an alert when a deduction is deferred or an exception remains.', 'Example: Notify after payroll validation'],
  basicPay: ['Basic pay', 'The employee basic pay amount used in the take-home scenario.', 'Example: PHP 30,000'],
  grossPay: ['Gross pay', 'Total earnings before statutory deductions and controllable deductions.', 'Example: PHP 36,500'],
  reimbursements: ['Reimbursements / receivables', 'Amounts excluded from the protected-base calculation when the selected basis removes them.', 'Example: PHP 2,000'],
  statutory: ['Mandatory statutory deductions', 'BIR, SSS, PhilHealth, and Pag-IBIG deductions that remain applied in full.', 'Example: PHP 6,500'],
  attendanceDays: ['LAUT days', 'Late, absence, and undertime units used to test the attendance cap.', 'Example: 4 days'],
  deductionHierarchy: ['Deduction hierarchy', 'Ranks controllable deductions so the engine knows which item to adjust first.', 'Example: Rank 1 is adjusted before Rank 2'],
  planType: ['Retirement plan type', 'Chooses the statutory plan, company plan, or more beneficial qualifying value.', 'Example: Best of statutory and company plan'],
  salaryBasis: ['Company salary basis', 'Salary measure used to calculate the company retirement-plan value.', 'Example: Latest monthly basic pay'],
  dailyRateDivisor: ['Daily rate divisor', 'Divides monthly basic pay to derive the daily retirement rate.', 'Example: 30 days'],
  statutoryDays: ['Statutory days per service year', 'The statutory retirement-day equivalent applied for every rounded service year.', 'Example: 22.5 days'],
  companyDays: ['Company-plan days per service year', 'Company plan days applied for each qualifying service year.', 'Example: 30 days'],
  minimumAge: ['Minimum retirement age', 'Earliest statutory age used for normal retirement eligibility.', 'Example: 60 years'],
  compulsoryAge: ['Compulsory retirement age', 'Age at which compulsory retirement eligibility is reached.', 'Example: 65 years'],
  minimumServiceYears: ['Minimum service', 'Minimum completed service required before the retirement benefit qualifies.', 'Example: 5 years'],
  earlyRetirementAge: ['Company early-retirement age', 'Optional earlier age allowed when the employee is a qualifying company-plan member.', 'Example: 55 years'],
  minimumGuarantee: ['Minimum guarantee', 'Floor applied to the company-plan value when configured.', 'Example: PHP 100,000'],
  maximumCap: ['Maximum cap', 'Optional ceiling applied to the company-plan value; zero means no ceiling.', 'Example: 0 = none'],
  serviceRounding: ['Service rounding', 'Counts six months or more of a fractional service year as one full year.', 'Example: 12 years 6 months becomes 13 years'],
  taxationRule: ['Taxation rule', 'Determines which prototype exemption conditions are evaluated for the retirement output.', 'Example: RA 7641 / NIRC and RA 4917'],
  companyPlanApproved: ['BIR-approved company retirement plan', 'Marks whether the company plan meets the configured approval condition for the prototype exemption check.', 'Example: Enabled'],
  dateOfBirth: ['Date of birth', 'Employee birth date used to compute age at the retirement date.', 'Example: 15 Jan 1964'],
  dateHired: ['Date hired', 'Start date used to calculate completed service and the six-month rounding rule.', 'Example: 1 Feb 2014'],
  retirementDate: ['Retirement date', 'Date on which eligibility and retirement value are tested.', 'Example: 31 Aug 2026'],
  reason: ['Reason', 'Separates retirement from resignation or termination scenarios.', 'Example: Retirement'],
  memberPlan: ['Plan membership', 'Identifies whether the employee belongs to the statutory or company plan.', 'Example: Company plan member'],
  monthlyBasic: ['Monthly basic pay', 'Salary base used for the statutory retirement calculation.', 'Example: PHP 60,000'],
  average36Months: ['Average last 36 months', 'Alternative salary basis when the company plan uses a 36-month average.', 'Example: PHP 55,000'],
  additionalBenefits: ['Additional benefits', 'Configured qualifying benefits added to the company-plan value.', 'Example: PHP 15,000'],
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

function takeHomeResult(policy) {
  const test = policy.test;
  const gross = number(test.grossPay);
  const baseValue = policy.base === 'Basic Pay' ? number(test.basicPay) : policy.base === 'Gross Pay' ? gross : Math.max(0, gross - number(test.reimbursements));
  const protectedMinimum = policy.thresholdType === 'Fixed Amount' ? number(policy.threshold) : baseValue * number(policy.threshold) / 100;
  const deductions = policy.deductionItems.map(item => ({ ...item, due: number(item.due), deducted: number(item.due), deferred: 0 }));
  const deferFrom = (candidates, requested) => {
    let remaining = Math.max(0, requested);
    [...candidates].sort((a, b) => number(a.rank) - number(b.rank)).forEach(item => {
      if (remaining <= 0) return;
      const amount = Math.min(item.deducted, remaining);
      item.deducted -= amount; item.deferred += amount; remaining -= amount;
    });
    return remaining;
  };

  const loanItems = deductions.filter(item => item.type === 'Loan');
  const totalLoans = loanItems.reduce((sum, item) => sum + item.deducted, 0);
  const loanCapAmount = policy.loanCapType === 'Fixed Amount' ? number(policy.loanCap) : gross * number(policy.loanCap) / 100;
  deferFrom(loanItems, Math.max(0, totalLoans - loanCapAmount));

  const attendance = deductions.filter(item => item.type === 'Attendance');
  if (attendance.length) {
    const attendanceDue = attendance.reduce((sum, item) => sum + item.deducted, 0);
    let cap = attendanceDue;
    if (policy.attendanceCapType === 'Fixed Amount') cap = number(policy.attendanceCap);
    if (policy.attendanceCapType === 'Percentage of Gross Pay') cap = gross * number(policy.attendanceCap) / 100;
    if (policy.attendanceCapType === 'Number of Days' && number(test.attendanceDays) > number(policy.attendanceCap)) cap = attendanceDue * number(policy.attendanceCap) / Math.max(1, number(test.attendanceDays));
    deferFrom(attendance, Math.max(0, attendanceDue - cap));
  }

  const mandatory = number(test.statutory);
  let deducted = deductions.reduce((sum, item) => sum + item.deducted, 0);
  let preliminaryNet = gross - mandatory - deducted;
  if (policy.enabled && policy.autoDefer && preliminaryNet < protectedMinimum) deferFrom(deductions, protectedMinimum - preliminaryNet);
  deducted = deductions.reduce((sum, item) => sum + item.deducted, 0);
  const finalNet = gross - mandatory - deducted;
  const deferred = deductions.reduce((sum, item) => sum + item.deferred, 0);
  return { baseValue, protectedMinimum, mandatory, deductions, finalNet, deferred, exception: finalNet + 0.005 < protectedMinimum, shortfall: Math.max(0, protectedMinimum - finalNet), originalDeductions: deductions.reduce((sum, item) => sum + item.due, 0) };
}

function retirementResult(policy) {
  const test = policy.test;
  const age = difference(test.dateOfBirth, test.retirementDate);
  const service = difference(test.dateHired, test.retirementDate);
  const roundedYears = service.years + (service.months >= 6 ? 1 : 0);
  const eligibleAge = age.years >= number(policy.minimumAge) || age.years >= number(policy.compulsoryAge) || (number(policy.earlyRetirementAge) > 0 && age.years >= number(policy.earlyRetirementAge) && test.memberPlan === 'Company plan member');
  const eligibleService = roundedYears >= number(policy.minimumServiceYears);
  const eligible = policy.enabled && test.reason === 'Retirement' && eligibleAge && eligibleService;
  const statutoryBasis = number(test.monthlyBasic);
  const companyBasis = policy.salaryBasis === 'Average of last 36 months' ? number(test.average36Months) : number(test.monthlyBasic);
  const statutoryDaily = statutoryBasis / Math.max(1, number(policy.dailyRateDivisor));
  const companyDaily = companyBasis / Math.max(1, number(policy.dailyRateDivisor));
  const statutory = statutoryDaily * number(policy.statutoryDays) * roundedYears;
  let company = companyDaily * number(policy.companyDays) * roundedYears + number(test.additionalBenefits);
  if (number(policy.minimumGuarantee) > 0) company = Math.max(company, number(policy.minimumGuarantee));
  if (number(policy.maximumCap) > 0) company = Math.min(company, number(policy.maximumCap));
  const selected = policy.planType === 'Statutory RA 7641' ? statutory : policy.planType === 'Company retirement plan' ? company : Math.max(statutory, company);
  const taxExempt = eligible && (policy.companyPlanApproved || policy.taxExemption.includes('RA 7641'));
  return { age, service, roundedYears, eligibleAge, eligibleService, eligible, statutoryDaily, companyDaily, statutory, company, selected: eligible ? selected : 0, taxExempt };
}

function Toggle({ value, onChange, label, hint, helpKey = label }) {
  return <label className="policy-toggle"><span><strong>{label}<FieldHelp helpKey={helpKey} /></strong>{hint && <small>{hint}</small>}</span><button type="button" className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)}><span /></button></label>;
}

function NumberField({ label, value, onChange, suffix, helpKey = label }) {
  return <FieldLabel label={label} helpKey={helpKey}><div className="suffix-input"><input type="number" min="0" step="0.01" value={value} onChange={event => onChange(number(event.target.value))} />{suffix && <span>{suffix}</span>}</div></FieldLabel>;
}

function TakeHomeEngine({ policy, setPolicy, notify }) {
  const result = useMemo(() => takeHomeResult(policy), [policy]);
  const update = (key, value) => setPolicy(previous => ({ ...previous, [key]: value }));
  const updateTest = (key, value) => setPolicy(previous => ({ ...previous, test: { ...previous.test, [key]: value } }));
  const updateItem = (id, key, value) => setPolicy(previous => ({ ...previous, deductionItems: previous.deductionItems.map(item => item.id === id ? { ...item, [key]: value } : item) }));
  const addItem = () => setPolicy(previous => ({ ...previous, deductionItems: [...previous.deductionItems, { id: Date.now(), name: 'New deduction', type: 'Optional', rank: previous.deductionItems.length + 1, due: 0 }] }));
  return <div className="policy-engine-grid">
    <section className="policy-config-card">
      <header><span><ShieldCheck weight="duotone" /></span><div><h2>Minimum Take-Home Pay</h2><p>Company policy controls; formula execution remains in Computational Basis.</p></div><button className={`switch ${policy.enabled ? 'on' : ''}`} onClick={() => update('enabled', !policy.enabled)}><span /></button></header>
      <div className="policy-form-grid">
        <FieldLabel label="Employee group" helpKey="employeeGroup"><select value={policy.employeeGroup} onChange={event => update('employeeGroup', event.target.value)}><option>All Employees</option><option>Rank and File</option><option>Managers</option><option>Project-based Employees</option></select></FieldLabel>
        <FieldLabel label="Protected base" helpKey="protectedBase"><select value={policy.base} onChange={event => update('base', event.target.value)}><option>Basic Pay</option><option>Gross Pay</option><option>Gross Pay less reimbursements / receivables</option></select></FieldLabel>
        <FieldLabel label="Threshold type" helpKey="thresholdType"><select value={policy.thresholdType} onChange={event => update('thresholdType', event.target.value)}><option>Percentage</option><option>Fixed Amount</option></select></FieldLabel>
        <NumberField label="Threshold" helpKey="threshold" value={policy.threshold} onChange={value => update('threshold', value)} suffix={policy.thresholdType === 'Percentage' ? '%' : 'PHP'} />
        <FieldLabel label="Conflict priority" helpKey="conflictPriority"><select value={policy.priorityChoice} onChange={event => update('priorityChoice', event.target.value)}><option>Take-Home Pay</option><option>Loan Deduction Cap</option></select></FieldLabel>
        <FieldLabel label="Loan cap type" helpKey="loanCapType"><select value={policy.loanCapType} onChange={event => update('loanCapType', event.target.value)}><option>Percentage of Gross Pay</option><option>Fixed Amount</option></select></FieldLabel>
        <NumberField label="Loan cap" helpKey="loanCap" value={policy.loanCap} onChange={value => update('loanCap', value)} suffix={policy.loanCapType.startsWith('Percentage') ? '%' : 'PHP'} />
        <FieldLabel label="Attendance cap type" helpKey="attendanceCapType"><select value={policy.attendanceCapType} onChange={event => update('attendanceCapType', event.target.value)}><option>Number of Days</option><option>Percentage of Gross Pay</option><option>Fixed Amount</option></select></FieldLabel>
        <NumberField label="Attendance cap" helpKey="attendanceCap" value={policy.attendanceCap} onChange={value => update('attendanceCap', value)} suffix={policy.attendanceCapType === 'Number of Days' ? 'days' : policy.attendanceCapType.startsWith('Percentage') ? '%' : 'PHP'} />
      </div>
      <div className="policy-toggle-list">
        <Toggle value={policy.autoDefer} onChange={value => update('autoDefer', value)} helpKey="autoDefer" label="Auto-defer or stagger deductions" hint="Trim lower-priority deductions when earnings are insufficient." />
        <Toggle value={policy.carryForward} onChange={value => update('carryForward', value)} helpKey="carryForward" label="Carry forward to next payroll" hint="Store outstanding amount, rescheduled date and new balance." />
        <Toggle value={policy.payslipTagging} onChange={value => update('payslipTagging', value)} helpKey="payslipTagging" label="Payslip tagging" hint="Show original, deducted, deferred and accumulated balances." />
        <Toggle value={policy.notifyEmployee} onChange={value => update('notifyEmployee', value)} helpKey="notifyEmployee" label="Admin and employee notification" hint="Send an alert when a deduction is deferred or an exception remains." />
      </div>
      <div className="deduction-rank-heading"><div><h3>Deduction hierarchy <FieldHelp helpKey="deductionHierarchy" /></h3><p>Rank 1 is adjusted first. Mandatory statutory deductions are always applied in full.</p></div><button className="button secondary small" onClick={addItem}><Plus /> Add item</button></div>
      <div className="deduction-rank-table"><table><thead><tr><th>Rank</th><th>Deduction / Loan</th><th>Type</th><th>Due</th><th /></tr></thead><tbody>{[...policy.deductionItems].sort((a, b) => a.rank - b.rank).map(item => <tr key={item.id}><td><input type="number" min="1" value={item.rank} onChange={event => updateItem(item.id, 'rank', number(event.target.value))} /></td><td><input value={item.name} onChange={event => updateItem(item.id, 'name', event.target.value)} /></td><td><select value={item.type} onChange={event => updateItem(item.id, 'type', event.target.value)}><option>Loan</option><option>Attendance</option><option>Optional</option></select></td><td><input type="number" min="0" value={item.due} onChange={event => updateItem(item.id, 'due', number(event.target.value))} /></td><td><button className="text-danger" onClick={() => setPolicy(previous => ({ ...previous, deductionItems: previous.deductionItems.filter(row => row.id !== item.id) }))}><Trash /></button></td></tr>)}</tbody></table></div>
      <div className="policy-save"><button className="button primary" onClick={() => notify({ type: 'success', message: 'Take-home policy saved and assigned to the selected employee group.' })}>Save take-home policy</button></div>
    </section>
    <aside className="policy-simulator">
      <header><Calculator weight="duotone" /><div><h2>Scenario simulator</h2><p>Run the BRD decision sequence before using it in payroll.</p></div></header>
      <div className="policy-test-grid">
        <NumberField label="Basic pay" helpKey="basicPay" value={policy.test.basicPay} onChange={value => updateTest('basicPay', value)} />
        <NumberField label="Gross pay" helpKey="grossPay" value={policy.test.grossPay} onChange={value => updateTest('grossPay', value)} />
        <NumberField label="Reimbursements / receivables" helpKey="reimbursements" value={policy.test.reimbursements} onChange={value => updateTest('reimbursements', value)} />
        <NumberField label="Mandatory statutory deductions" helpKey="statutory" value={policy.test.statutory} onChange={value => updateTest('statutory', value)} />
        <NumberField label="LAUT days" helpKey="attendanceDays" value={policy.test.attendanceDays} onChange={value => updateTest('attendanceDays', value)} />
      </div>
      <div className="policy-results"><span><small>Protected minimum</small><strong>{money(result.protectedMinimum)}</strong></span><span><small>Final take-home</small><strong>{money(result.finalNet)}</strong></span><span><small>Deferred this cutoff</small><strong>{money(result.deferred)}</strong></span><span><small>Mandatory deducted</small><strong>{money(result.mandatory)}</strong></span></div>
      <div className={`policy-outcome ${result.exception ? 'error' : 'success'}`}>{result.exception ? <Warning weight="fill" /> : <CheckCircle weight="fill" />}<span><strong>{result.exception ? 'Exception requires approval' : 'Protected minimum satisfied'}</strong><small>{result.exception ? `${money(result.shortfall)} shortfall remains after all eligible deductions were adjusted.` : 'Statutory deductions stayed intact and the hierarchy stopped once the threshold was met.'}</small></span></div>
      <div className="simulation-ledger"><table><thead><tr><th>Item</th><th>Due</th><th>Deducted</th><th>Deferred</th></tr></thead><tbody>{result.deductions.map(item => <tr key={item.id}><td><strong>{item.name}</strong><small>Rank {item.rank}</small></td><td>{money(item.due)}</td><td>{money(item.deducted)}</td><td className={item.deferred ? 'deferred-copy' : ''}>{money(item.deferred)}</td></tr>)}</tbody></table></div>
      {policy.payslipTagging && result.deferred > 0 && <div className="payslip-note"><Info /><span><strong>Payslip tag: Deferred Deduction</strong><small>Reason: Below Net Pay Requirement · Next payroll amount: {money(result.deferred)}</small></span></div>}
    </aside>
  </div>;
}

function RetirementEngine({ policy, setPolicy, notify }) {
  const result = useMemo(() => retirementResult(policy), [policy]);
  const update = (key, value) => setPolicy(previous => ({ ...previous, [key]: value }));
  const updateTest = (key, value) => setPolicy(previous => ({ ...previous, test: { ...previous.test, [key]: value } }));
  return <div className="policy-engine-grid retirement-engine">
    <section className="policy-config-card">
      <header><span><Scales weight="duotone" /></span><div><h2>Retirement Pay</h2><p>Eligibility and company-policy inputs around the controlled retirement formulas.</p></div><button className={`switch ${policy.enabled ? 'on' : ''}`} onClick={() => update('enabled', !policy.enabled)}><span /></button></header>
      <div className="policy-form-grid">
        <FieldLabel label="Employee group" helpKey="employeeGroup"><select value={policy.employeeGroup} onChange={event => update('employeeGroup', event.target.value)}><option>All Employees</option><option>Rank and File</option><option>Managers</option></select></FieldLabel>
        <FieldLabel label="Retirement plan type" helpKey="planType"><select value={policy.planType} onChange={event => update('planType', event.target.value)}><option>Statutory RA 7641</option><option>Company retirement plan</option><option>Best of statutory and company plan</option></select></FieldLabel>
        <FieldLabel label="Company salary basis" helpKey="salaryBasis"><select value={policy.salaryBasis} onChange={event => update('salaryBasis', event.target.value)}><option>Latest monthly basic pay</option><option>Average of last 36 months</option></select></FieldLabel>
        <NumberField label="Daily rate divisor" helpKey="dailyRateDivisor" value={policy.dailyRateDivisor} onChange={value => update('dailyRateDivisor', value)} suffix="days" />
        <NumberField label="Statutory days per service year" helpKey="statutoryDays" value={policy.statutoryDays} onChange={value => update('statutoryDays', value)} suffix="days" />
        <NumberField label="Company-plan days per service year" helpKey="companyDays" value={policy.companyDays} onChange={value => update('companyDays', value)} suffix="days" />
        <NumberField label="Minimum retirement age" helpKey="minimumAge" value={policy.minimumAge} onChange={value => update('minimumAge', value)} suffix="years" />
        <NumberField label="Compulsory retirement age" helpKey="compulsoryAge" value={policy.compulsoryAge} onChange={value => update('compulsoryAge', value)} suffix="years" />
        <NumberField label="Minimum service" helpKey="minimumServiceYears" value={policy.minimumServiceYears} onChange={value => update('minimumServiceYears', value)} suffix="years" />
        <NumberField label="Company early-retirement age" helpKey="earlyRetirementAge" value={policy.earlyRetirementAge} onChange={value => update('earlyRetirementAge', value)} suffix="years" />
        <NumberField label="Minimum guarantee" helpKey="minimumGuarantee" value={policy.minimumGuarantee} onChange={value => update('minimumGuarantee', value)} suffix="PHP" />
        <NumberField label="Maximum cap (0 = none)" helpKey="maximumCap" value={policy.maximumCap} onChange={value => update('maximumCap', value)} suffix="PHP" />
        <FieldLabel className="wide" label="Service rounding" helpKey="serviceRounding"><select value={policy.rounding} onChange={event => update('rounding', event.target.value)}><option>Six months or more counts as one year</option></select></FieldLabel>
        <FieldLabel className="wide" label="Taxation rule" helpKey="taxationRule"><select value={policy.taxExemption} onChange={event => update('taxExemption', event.target.value)}><option>Evaluate RA 7641 / NIRC and RA 4917</option><option>Taxable company benefit</option></select></FieldLabel>
      </div>
      <div className="policy-toggle-list"><Toggle value={policy.companyPlanApproved} onChange={value => update('companyPlanApproved', value)} helpKey="companyPlanApproved" label="BIR-approved company retirement plan" hint="Enables the RA 4917 exemption condition in the scenario result." /></div>
      <div className="formula-flow"><span><small>Statutory value</small><code>daily rate × 22.5 × rounded service years</code></span><ArrowsDownUp /><span><small>Company-plan value</small><code>configured daily rate × plan days × years + benefits</code></span><strong>Use the more beneficial value</strong></div>
      <div className="policy-save"><button className="button primary" onClick={() => notify({ type: 'success', message: 'Retirement policy saved and assigned to the selected employee group.' })}>Save retirement policy</button></div>
    </section>
    <aside className="policy-simulator">
      <header><Calculator weight="duotone" /><div><h2>Retirement scenario</h2><p>Eligibility, formula and tax trace. Final Pay workflow is intentionally outside this prototype.</p></div></header>
      <div className="policy-test-grid retirement-test">
        <FieldLabel label="Date of birth" helpKey="dateOfBirth"><input type="date" value={policy.test.dateOfBirth} onChange={event => updateTest('dateOfBirth', event.target.value)} /></FieldLabel>
        <FieldLabel label="Date hired" helpKey="dateHired"><input type="date" value={policy.test.dateHired} onChange={event => updateTest('dateHired', event.target.value)} /></FieldLabel>
        <FieldLabel label="Retirement date" helpKey="retirementDate"><input type="date" value={policy.test.retirementDate} onChange={event => updateTest('retirementDate', event.target.value)} /></FieldLabel>
        <FieldLabel label="Reason" helpKey="reason"><select value={policy.test.reason} onChange={event => updateTest('reason', event.target.value)}><option>Retirement</option><option>Resignation</option><option>Termination</option></select></FieldLabel>
        <FieldLabel label="Plan membership" helpKey="memberPlan"><select value={policy.test.memberPlan} onChange={event => updateTest('memberPlan', event.target.value)}><option>Statutory plan member</option><option>Company plan member</option></select></FieldLabel>
        <NumberField label="Monthly basic pay" helpKey="monthlyBasic" value={policy.test.monthlyBasic} onChange={value => updateTest('monthlyBasic', value)} />
        <NumberField label="Average last 36 months" helpKey="average36Months" value={policy.test.average36Months} onChange={value => updateTest('average36Months', value)} />
        <NumberField label="Additional benefits" helpKey="additionalBenefits" value={policy.test.additionalBenefits} onChange={value => updateTest('additionalBenefits', value)} />
      </div>
      <div className="eligibility-strip"><span className={result.eligibleAge ? 'pass' : 'fail'}>{result.eligibleAge ? <CheckCircle /> : <Warning />} Age {result.age.years}y {result.age.months}m</span><span className={result.eligibleService ? 'pass' : 'fail'}>{result.eligibleService ? <CheckCircle /> : <Warning />} Service {result.service.years}y {result.service.months}m</span><span className={result.eligible ? 'pass' : 'fail'}>{result.eligible ? <CheckCircle /> : <Warning />} {result.eligible ? 'Eligible' : 'Not eligible'}</span></div>
      <div className="policy-results retirement-results"><span><small>Rounded service years</small><strong>{result.roundedYears}</strong></span><span><small>Statutory value</small><strong>{money(result.statutory)}</strong></span><span><small>Company-plan value</small><strong>{money(result.company)}</strong></span><span className="highlight"><small>Retirement pay</small><strong>{money(result.selected)}</strong></span></div>
      <div className={`policy-outcome ${result.eligible ? 'success' : 'error'}`}>{result.eligible ? <CheckCircle weight="fill" /> : <Warning weight="fill" />}<span><strong>{result.eligible ? 'Eligibility passed' : 'Eligibility not met'}</strong><small>{result.eligible ? `${result.taxExempt ? 'Tax-exempt conditions passed for prototype evaluation.' : 'Taxable based on the configured rule.'} The higher qualifying benefit is selected.` : 'Check age, service years, retirement reason and plan membership.'}</small></span></div>
      <div className="calculation-trace"><h3>Calculation trace</h3><p>Statutory daily rate: <strong>{money(result.statutoryDaily)}</strong></p><p>Company-plan daily rate: <strong>{money(result.companyDaily)}</strong></p><p>Rounding: {result.service.months} fractional month(s) {result.service.months >= 6 ? 'added one full year' : 'did not add a year'}.</p><p>Output: Payroll retirement earning and Retirement Report. Final Pay is not implemented.</p></div>
    </aside>
  </div>;
}

export function PolicyComputations({ notify, initialTab = 'take-home' }) {
  const [policies, setPolicies] = useState(readPolicies);
  const [tab, setTab] = useState(initialTab);
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(policies)), [policies]);
  return <section className="policy-workspace">
    <div className="policy-tabs"><button className={tab === 'take-home' ? 'active' : ''} onClick={() => setTab('take-home')}>Take-Home Pay <span>THP-001</span></button><button className={tab === 'retirement' ? 'active' : ''} onClick={() => setTab('retirement')}>Retirement Pay <span>RET-001</span></button></div>
    <div className="policy-brd-note"><Info weight="fill" /><span><strong>BRD integration</strong><small>Policy qualifiers are editable here and represented in Company Rules. Controlled formulas remain versioned in the Computational Basis library. Final Pay is excluded as requested.</small></span></div>
    {tab === 'take-home' ? <TakeHomeEngine policy={policies.takeHome} setPolicy={value => setPolicies(previous => ({ ...previous, takeHome: typeof value === 'function' ? value(previous.takeHome) : value }))} notify={notify} /> : <RetirementEngine policy={policies.retirement} setPolicy={value => setPolicies(previous => ({ ...previous, retirement: typeof value === 'function' ? value(previous.retirement) : value }))} notify={notify} />}
  </section>;
}
