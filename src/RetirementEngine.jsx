import { useMemo } from 'react';
import { ArrowsDownUp, Calculator, CheckCircle, Table, Users, Warning } from '@phosphor-icons/react';
import { readServiceConfiguration } from './serviceModules';
import { ApplicabilityPanel, coveredEmployees, describeAssignment, normalizeAssignment } from './PolicyApplicability';
import { difference, FieldLabel, money, number, NumberField, roundServiceYears, SourceMultiSelect, Toggle } from './PolicyFields';
import { plural } from './textFormat';

export const salaryBasisSources = ['Monthly basic pay only', 'Earnings classified as Retirement', 'Selected earnings'];

export const serviceHistoryRules = [
  'Continuous service from the original hire date',
  'Credit prior service, exclude the break',
  'Latest hire date only',
];

export const transactionMethods = [
  'Calculate using the Retirement Pay engine',
  'Manual input',
  'Upload / import',
  'Override the calculated amount',
];

/** Active earnings, read from Earning Configuration rather than redefined here. */
export function retirementEarningOptions() {
  return readServiceConfiguration('earnings')
    .filter(record => (record.status || 'Active') === 'Active')
    .map(record => ({
      value: record.code,
      label: record.name,
      detail: `${record.code} · ${record.type} · ${record.classification}`,
      classification: record.classification,
    }));
}

/** The earning codes a policy adds to monthly basic pay for the retirement salary basis. */
export function retirementBasisEarnings(policy) {
  const options = retirementEarningOptions();
  if (policy.salaryBasisSource === 'Earnings classified as Retirement') return options.filter(option => option.classification === 'Retirement');
  if (policy.salaryBasisSource === 'Selected earnings') return options.filter(option => (policy.salaryBasisEarnings || []).includes(option.value));
  return [];
}

const earningTotal = (earnings, test) => earnings.reduce((sum, earning) => sum + number(test.earningAmounts?.[earning.value]), 0);

/**
 * Credited service. A rehire with a break cannot be assumed to be continuous,
 * so the configured service-history rule decides whether prior service and the
 * break itself are credited.
 */
export function creditedService(policy, test) {
  const base = difference(test.dateHired, test.retirementDate);
  let months = base.years * 12 + base.months;
  if (policy.serviceHistoryRule !== 'Latest hire date only') months += Math.round(number(test.priorServiceYears) * 12);
  if (policy.serviceHistoryRule === 'Continuous service from the original hire date') months += Math.round(number(test.breakMonths));
  return { years: Math.floor(months / 12), months: months % 12, latest: base };
}

export function retirementResult(policy, test = policy.test) {
  const age = difference(test.dateOfBirth, test.retirementDate);
  const service = creditedService(policy, test);
  const roundedYears = roundServiceYears(service, policy.rounding);
  const eligibleAge = age.years >= number(policy.minimumAge)
    || age.years >= number(policy.compulsoryAge)
    || (number(policy.earlyRetirementAge) > 0 && age.years >= number(policy.earlyRetirementAge) && test.memberPlan === 'Company plan member');
  const eligibleService = roundedYears >= number(policy.minimumServiceYears);
  const eligible = Boolean(policy.enabled && test.reason === 'Retirement' && eligibleAge && eligibleService);

  const basisEarnings = retirementBasisEarnings(policy);
  const includedEarnings = earningTotal(basisEarnings, test);
  // The statutory basis stays on basic pay; only the company plan may widen the
  // salary basis to the earnings the company tagged for retirement.
  const statutoryBasis = number(test.monthlyBasic);
  const companySalary = policy.salaryBasis === 'Latest monthly basic pay' ? number(test.monthlyBasic) : number(test.average36Months);
  const companyBasis = companySalary + includedEarnings;
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
  return {
    age, service, roundedYears, eligibleAge, eligibleService, eligible,
    basisEarnings, includedEarnings, companyBasis,
    statutoryDaily, companyDaily, statutory, company,
    selected: eligible ? selected : 0, taxExempt, taxBasis,
    creditedBreak: policy.serviceHistoryRule === 'Continuous service from the original hire date' && number(test.breakMonths) > 0,
  };
}

/** Amount the payroll transaction posts for one employee under the chosen method. */
export function transactionAmount(policy, employee) {
  const outcome = retirementResult(policy, employee);
  const override = policy.transaction?.overrides?.[employee.code];
  const manual = policy.transaction?.method !== 'Calculate using the Retirement Pay engine' && override !== undefined && override !== '';
  return { outcome, amount: manual ? number(override) : outcome.selected, manual };
}

export function RetirementEngine({ policy, setPolicy, onSave }) {
  const result = useMemo(() => retirementResult(policy), [policy]);
  const assignment = normalizeAssignment(policy.assignment);
  const roster = useMemo(() => coveredEmployees(assignment).map(employee => ({ employee, ...transactionAmount(policy, employee) })), [policy, assignment]);
  const selectedCodes = policy.transaction?.selected || [];
  const selectedRows = roster.filter(row => selectedCodes.includes(row.employee.code));
  const eligibleCount = roster.filter(row => row.outcome.eligible).length;
  const earningOptions = useMemo(retirementEarningOptions, []);

  const update = (key, value) => setPolicy(previous => ({ ...previous, [key]: value }));
  const updateTest = (key, value) => setPolicy(previous => ({ ...previous, test: { ...previous.test, [key]: value } }));
  const updateEarningAmount = (code, value) => setPolicy(previous => ({ ...previous, test: { ...previous.test, earningAmounts: { ...previous.test.earningAmounts, [code]: value } } }));
  const updateTransaction = (key, value) => setPolicy(previous => ({ ...previous, transaction: { ...previous.transaction, [key]: value } }));
  const toggleEarning = code => update('salaryBasisEarnings', (policy.salaryBasisEarnings || []).includes(code)
    ? policy.salaryBasisEarnings.filter(item => item !== code)
    : [...(policy.salaryBasisEarnings || []), code]);
  const toggleSelected = code => updateTransaction('selected', selectedCodes.includes(code) ? selectedCodes.filter(item => item !== code) : [...selectedCodes, code]);
  const setOverride = (code, value) => updateTransaction('overrides', { ...(policy.transaction?.overrides || {}), [code]: value });

  const engineCalculated = policy.transaction?.method === 'Calculate using the Retirement Pay engine';
  const transactionTotal = selectedRows.reduce((sum, row) => sum + row.amount, 0);

  return <div className="policy-engine-grid retirement-engine">
    <section className="policy-config-card">
      <header><span><Table weight="duotone" /></span><div><h2>Retirement Pay</h2><p>Eligibility, salary basis and company-plan inputs around the controlled retirement formulas.</p></div><button className={`switch ${policy.enabled ? 'on' : ''}`} onClick={() => update('enabled', !policy.enabled)}><span /></button></header>

      <ApplicabilityPanel assignment={assignment} onChange={value => update('assignment', value)} engineLabel="Retirement Pay" />

      <h3 className="policy-subheading">Plan and eligibility</h3>
      <div className="policy-form-grid">
        <FieldLabel label="Retirement plan type" helpKey="planType"><select value={policy.planType} onChange={event => update('planType', event.target.value)}><option>Statutory RA 7641</option><option>Company retirement plan</option><option>Best of statutory and company plan</option></select></FieldLabel>
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
        <FieldLabel className="wide" label="Taxation rule" helpKey="taxationRule" scopeKey="taxExemption"><select value={policy.taxExemption} onChange={event => update('taxExemption', event.target.value)}><option>Evaluate RA 7641 / NIRC and RA 4917</option><option>Taxable company benefit</option></select></FieldLabel>
      </div>
      <div className="policy-toggle-list"><Toggle value={policy.companyPlanApproved} onChange={value => update('companyPlanApproved', value)} helpKey="companyPlanApproved" label="BIR-approved company retirement plan" hint="Enables the RA 4917 exemption condition." /></div>
      <div className="statutory-floor-note">
        <Warning weight="fill" />
        <span>{number(policy.companyDays) >= number(policy.statutoryDays)
          ? <>The company plan grants <strong>{policy.companyDays} days</strong> per service year against the statutory <strong>{policy.statutoryDays} days</strong>. The statutory value stays controlled; only the company value is configurable.</>
          : <>The company plan grants <strong>{policy.companyDays} days</strong>, which is below the statutory <strong>{policy.statutoryDays} days</strong>. A company plan may exceed the statutory minimum but must not fall below it.</>}</span>
      </div>

      <h3 className="policy-subheading">Salary basis</h3>
      <div className="policy-form-grid">
        <FieldLabel label="Company salary basis" helpKey="salaryBasis"><select value={policy.salaryBasis} onChange={event => update('salaryBasis', event.target.value)}><option>Latest monthly basic pay</option><option>Average salary</option><option>Average of last 36 months</option></select></FieldLabel>
        <FieldLabel label="Earnings source" helpKey="salaryBasisSource" scopeKey="salaryBasisSource"><select value={policy.salaryBasisSource} onChange={event => update('salaryBasisSource', event.target.value)}>{salaryBasisSources.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
      </div>
      {policy.salaryBasisSource === 'Earnings classified as Retirement' && <div className="hierarchy-source linked">
        <Table weight="duotone" />
        <span>Earning Configuration decides membership. {result.basisEarnings.length} {plural(result.basisEarnings.length, 'earning')} currently carry the <strong>Retirement</strong> classification: {result.basisEarnings.map(item => item.label).join(', ') || 'none'}.</span>
      </div>}
      {policy.salaryBasisSource === 'Selected earnings' && <SourceMultiSelect
        title="Included earnings"
        helpKey="salaryBasisEarnings"
        scopeKey="salaryBasisEarnings"
        hint="Selected from Earning Configuration. Retirement does not redefine an earning, it only identifies which existing earnings widen the salary basis."
        options={earningOptions}
        selected={policy.salaryBasisEarnings || []}
        onToggle={toggleEarning}
        emptyMessage="No active earnings are configured."
      />}

      <h3 className="policy-subheading">Service history</h3>
      <div className="policy-form-grid">
        <FieldLabel className="wide" label="Rehire and break-in-service rule" helpKey="serviceHistoryRule" scopeKey="serviceHistoryRule"><select value={policy.serviceHistoryRule} onChange={event => update('serviceHistoryRule', event.target.value)}>{serviceHistoryRules.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
        <FieldLabel className="wide" label="Service rounding" helpKey="serviceRounding" scopeKey="rounding"><select value={policy.rounding} onChange={event => update('rounding', event.target.value)}><option>Six months or more counts as one year</option><option>Completed years only (round down)</option><option>Any fraction counts as one year</option></select></FieldLabel>
      </div>
      <p className="policy-inline-note">Service data comes from the Employee Masterfile. The rule above only decides how prior service and a break between engagements are credited — it does not restate the employment record.</p>

      <div className="formula-flow"><span><small>Statutory value</small><code>daily rate × {policy.statutoryDays} × rounded service years</code></span><ArrowsDownUp /><span><small>Company-plan value</small><code>(basic pay + included earnings) ÷ divisor × {policy.companyDays} × years + benefits</code></span><strong>{policy.planType}</strong></div>
      <div className="policy-save"><button className="button primary" onClick={() => onSave(result)}>Save retirement policy</button></div>
    </section>

    <aside className="policy-simulator">
      <header><Calculator weight="duotone" /><div><h2>Retirement scenario</h2><p>Eligibility, salary basis and tax trace. The qualifying result is what Final Pay consumes.</p></div></header>
      <div className="policy-test-grid retirement-test">
        <FieldLabel label="Date of birth" helpKey="dateOfBirth"><input type="date" value={policy.test.dateOfBirth} onChange={event => updateTest('dateOfBirth', event.target.value)} /></FieldLabel>
        <FieldLabel label="Date hired" helpKey="dateHired"><input type="date" value={policy.test.dateHired} onChange={event => updateTest('dateHired', event.target.value)} /></FieldLabel>
        <FieldLabel label="Retirement date" helpKey="retirementDate"><input type="date" value={policy.test.retirementDate} onChange={event => updateTest('retirementDate', event.target.value)} /></FieldLabel>
        <FieldLabel label="Reason" helpKey="reason"><select value={policy.test.reason} onChange={event => updateTest('reason', event.target.value)}><option>Retirement</option><option>Resignation</option><option>Termination</option></select></FieldLabel>
        <FieldLabel label="Plan membership" helpKey="memberPlan"><select value={policy.test.memberPlan} onChange={event => updateTest('memberPlan', event.target.value)}><option>Statutory plan member</option><option>Company plan member</option></select></FieldLabel>
        <NumberField label="Monthly basic pay" helpKey="monthlyBasic" value={policy.test.monthlyBasic} onChange={value => updateTest('monthlyBasic', value)} />
        <NumberField label="Average salary" helpKey="average36Months" value={policy.test.average36Months} onChange={value => updateTest('average36Months', value)} />
        <NumberField label="Prior service years" helpKey="priorServiceYears" value={policy.test.priorServiceYears} onChange={value => updateTest('priorServiceYears', value)} suffix="years" />
        <NumberField label="Break in service" helpKey="breakMonths" value={policy.test.breakMonths} onChange={value => updateTest('breakMonths', value)} suffix="months" />
      </div>

      {result.basisEarnings.length > 0 && <div className="basis-earning-table">
        <h3>Earnings in the retirement salary basis</h3>
        <table>
          <thead><tr><th>Earning</th><th>Source</th><th>Monthly amount</th></tr></thead>
          <tbody>{result.basisEarnings.map(earning => <tr key={earning.value}>
            <td><strong>{earning.label}</strong><small>{earning.detail}</small></td>
            <td><small>Earning Configuration</small></td>
            <td><input type="number" min="0" value={policy.test.earningAmounts?.[earning.value] ?? 0} onChange={event => updateEarningAmount(earning.value, number(event.target.value))} /></td>
          </tr>)}</tbody>
          <tfoot><tr><td colSpan="2">Added to the company salary basis</td><td>{money(result.includedEarnings)}</td></tr></tfoot>
        </table>
      </div>}

      <div className="eligibility-strip"><span className={result.eligibleAge ? 'pass' : 'fail'}>{result.eligibleAge ? <CheckCircle /> : <Warning />} Age {result.age.years}y {result.age.months}m</span><span className={result.eligibleService ? 'pass' : 'fail'}>{result.eligibleService ? <CheckCircle /> : <Warning />} Credited service {result.service.years}y {result.service.months}m</span><span className={result.eligible ? 'pass' : 'fail'}>{result.eligible ? <CheckCircle /> : <Warning />} {result.eligible ? 'Eligible' : 'Not eligible'}</span></div>
      <div className="policy-results retirement-results"><span><small>Rounded service years</small><strong>{result.roundedYears}</strong></span><span><small>Statutory value</small><strong>{money(result.statutory)}</strong></span><span><small>Company-plan value</small><strong>{money(result.company)}</strong></span><span className="highlight"><small>Retirement pay</small><strong>{money(result.selected)}</strong></span></div>
      <div className={`policy-outcome ${result.eligible ? 'success' : 'error'}`}>{result.eligible ? <CheckCircle weight="fill" /> : <Warning weight="fill" />}<span><strong>{result.eligible ? 'Eligibility passed' : 'Eligibility not met'}</strong><small>{result.eligible ? `Stored as ${result.taxExempt ? 'tax exempt' : 'taxable'} based on ${result.taxBasis}.` : 'Check age, credited service, retirement reason and plan membership.'}</small></span></div>
      <div className="calculation-trace">
        <h3>Calculation trace</h3>
        <p>Statutory daily rate: <strong>{money(result.statutoryDaily)}</strong> from monthly basic pay only.</p>
        <p>Company-plan daily rate: <strong>{money(result.companyDaily)}</strong> from a salary basis of <strong>{money(result.companyBasis)}</strong>{result.includedEarnings > 0 ? <> ({money(result.companyBasis - result.includedEarnings)} salary plus {money(result.includedEarnings)} in tagged earnings)</> : ''}.</p>
        <p>Service rule &ldquo;{policy.serviceHistoryRule}&rdquo; credited {result.service.years}y {result.service.months}m against {result.service.latest.years}y {result.service.latest.months}m since the latest hire date{result.creditedBreak ? ', including the break between engagements' : ''}.</p>
        <p>Rounding rule &ldquo;{policy.rounding}&rdquo; turned that into <strong>{result.roundedYears} year(s)</strong>.</p>
        <p>Tax status stored on the record: <strong>{result.taxExempt ? 'Tax exempt' : 'Taxable'}</strong> based on {result.taxBasis}.</p>
      </div>

      <div className="eligible-roster">
        <header><Users weight="duotone" /><div><h3>Retirement payroll transaction</h3><p>{describeAssignment(assignment)} · {eligibleCount} of {roster.length} covered {plural(roster.length, 'employee')} meet the configured conditions.</p></div></header>
        <div className="policy-form-grid transaction-controls">
          <FieldLabel className="wide" label="Transaction method" helpKey="transactionMethod"><select value={policy.transaction?.method} onChange={event => updateTransaction('method', event.target.value)}>{transactionMethods.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
        </div>
        <table>
          <thead><tr><th /><th>Employee</th><th>Age</th><th>Service</th><th>Plan</th><th>Tax</th><th>{engineCalculated ? 'Retirement pay' : 'Amount to post'}</th><th>Status</th></tr></thead>
          <tbody>{roster.map(({ employee, outcome, amount, manual }) => <tr key={employee.code} className={selectedCodes.includes(employee.code) ? 'selected' : ''}>
            <td><input type="checkbox" checked={selectedCodes.includes(employee.code)} onChange={() => toggleSelected(employee.code)} aria-label={`Include ${employee.name} in the transaction`} /></td>
            <td><strong>{employee.name}</strong><small>{employee.code} · {employee.group}</small></td>
            <td>{outcome.age.years}y</td>
            <td>{outcome.roundedYears}y</td>
            <td><small>{employee.memberPlan}</small></td>
            <td><small>{outcome.eligible ? (outcome.taxExempt ? 'Exempt' : 'Taxable') : '—'}</small></td>
            <td>{engineCalculated
              ? money(outcome.selected)
              : <input type="number" min="0" value={policy.transaction?.overrides?.[employee.code] ?? ''} placeholder={String(Math.round(outcome.selected))} onChange={event => setOverride(employee.code, event.target.value)} />}
              {manual && <small className="deferred-copy">Overrides {money(outcome.selected)}</small>}</td>
            <td><span className={`status-pill ${outcome.eligible ? 'active' : 'inactive'}`}>{outcome.eligible ? 'Eligible' : employee.reason !== 'Retirement' ? employee.reason : 'Not eligible'}</span></td>
          </tr>)}</tbody>
        </table>
        <div className="transaction-summary">
          <span><small>Employees in this transaction</small><strong>{selectedRows.length}</strong></span>
          <span><small>Ineligible in the selection</small><strong>{selectedRows.filter(row => !row.outcome.eligible).length}</strong></span>
          <span className="highlight"><small>Total to post</small><strong>{money(transactionTotal)}</strong></span>
        </div>
        <p className="policy-inline-note">Every selected employee is evaluated individually against eligibility, the applicable engine, taxability and their own assignment. A bulk transaction never gives every employee the same result.{engineCalculated ? '' : ' Manual, uploaded and overridden amounts stay marked against the engine-calculated value for audit.'}</p>
      </div>
    </aside>
  </div>;
}
