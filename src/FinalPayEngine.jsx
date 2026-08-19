import { useMemo } from 'react';
import { ArrowsDownUp, Calculator, CheckCircle, Table, Users, Warning } from '@phosphor-icons/react';
import { readServiceConfiguration } from './serviceModules';
import { readPayrollCollectionDefinitions } from './payrollIntegration';
import { ApplicabilityPanel, coveredEmployees, describeAssignment, employeeDirectory, normalizeAssignment, separationReasons } from './PolicyApplicability';
import { CheckList, difference, FieldLabel, money, number, NumberField, SourceMultiSelect, Toggle, useFieldScope } from './PolicyFields';
import { SeparationRuleTable, separationPayResult, separationTrace } from './SeparationRules';
import { retirementResult } from './RetirementEngine';
import { plural } from './textFormat';

export const HIERARCHY_SOURCES = ['Regular payroll hierarchy (REF-011)', 'Dedicated final pay hierarchy'];

export const statutoryRules = [
  'Compute statutory contributions in final pay',
  'Do not compute — already collected in the last regular payroll',
  'Decide on the payroll transaction',
];

export const transactionMethods = [
  'Calculate using the Final Pay engine',
  'Manual input',
  'Upload / import',
  'Override the calculated amount',
];

/** Earnings available to final pay, owned by Earning Configuration. */
export function finalPayEarningOptions() {
  return readServiceConfiguration('earnings')
    .filter(record => (record.status || 'Active') === 'Active')
    .map(record => ({ value: record.code, label: record.name, detail: `${record.code} · ${record.type} · ${record.taxability}` }));
}

/** Deductions and loans available to final pay, owned by their service modules. */
export function finalPayDeductionOptions() {
  return readPayrollCollectionDefinitions().map(record => ({
    value: record.code,
    label: record.name,
    detail: `${record.code} · ${record.group} · ${record.sourceLabel}`,
    outstanding: record.outstanding,
    rank: record.rank,
    group: record.group,
  }));
}

/** Offsets in the order the applicable hierarchy adjusts them. */
export function finalPayOffsets(policy) {
  const selected = policy.includedDeductions || [];
  return finalPayDeductionOptions()
    .filter(option => selected.includes(option.value))
    .map(option => ({ ...option, rank: policy.hierarchySource === HIERARCHY_SOURCES[1] ? number(policy.finalPayRanks?.[option.value] ?? option.rank) : option.rank }))
    .sort((left, right) => left.rank - right.rank);
}

const line = (label, value, on, type = 'Earning') => ({ label, value: on ? number(value) : 0, on: Boolean(on), type });

export function finalPayResult(policy, { retirementValue = 0, test = policy.test } = {}) {
  const service = difference(test.dateHired, test.separationDate);
  const separation = separationPayResult(policy.separationRules, {
    reasonForLeaving: test.reasonForLeaving,
    monthlyBasic: test.monthlyBasic,
    service,
  });

  const selectedEarnings = finalPayEarningOptions().filter(option => (policy.includedEarnings || []).includes(option.value));
  const earnings = [
    line('Unpaid Salary', test.unpaidSalary, policy.components['Unpaid Salary']),
    line('Prorated 13th month pay', test.thirteenthMonth, policy.components['Prorated 13th month pay']),
    line('SIL conversion', test.silConversion, policy.components['SIL conversion']),
    line('Separation pay', separation.amount, policy.components['Separation pay']),
    line('Retirement pay', retirementValue, policy.components['Retirement pay']),
    line('Convertible VL / SL beyond SIL', test.convertibleLeave, policy.optionalComponents['Convertible VL / SL beyond SIL']),
    line('Cash bond return', test.cashBond, policy.optionalComponents['Cash bond return']),
    line('Gratuity pay', test.gratuity, policy.optionalComponents['Gratuity pay']),
    ...selectedEarnings.map(option => line(option.label, test.earningAmounts?.[option.value], true, 'Configured earning')),
  ];
  const grossFinalPay = earnings.reduce((sum, item) => sum + item.value, 0);

  // Statutory treatment can be settled in configuration or left to the payroll
  // transaction, because another payroll may already have collected the month.
  const statutoryDecidedAtTransaction = policy.statutoryRule === statutoryRules[2];
  const computeStatutory = statutoryDecidedAtTransaction
    ? Boolean(test.computeStatutory)
    : policy.statutoryRule === statutoryRules[0];

  const configuredOffsets = finalPayOffsets(policy).map(option => ({
    label: option.label, code: option.value, rank: option.rank, type: 'Offset',
    value: number(test.offsetAmounts?.[option.value] ?? option.outstanding),
  }));
  // Statutory contributions and final tax keep the highest priority: they are
  // never the items left unrecovered when the settlement runs short.
  const deductions = [
    ...(computeStatutory ? [{ label: 'Statutory contributions (SSS, PhilHealth, Pag-IBIG)', code: 'STATUTORY', rank: -2, type: 'Statutory', value: number(test.statutoryContributions) }] : []),
    ...(policy.components['Final tax computation'] ? [{ label: 'Final tax', code: 'TAX', rank: -1, type: 'Tax', value: number(test.finalTax) }] : []),
    ...configuredOffsets,
    ...(policy.advanceThirteenthRule !== 'Do not recover' ? [{ label: 'Advance 13th month recovery', code: 'ADV-13', rank: 90, type: 'Offset', value: number(test.advanceThirteenth) }] : []),
  ].sort((left, right) => left.rank - right.rank);

  // Offsets are applied in hierarchy order; anything the final pay cannot cover
  // stays as an unrecovered balance instead of silently disappearing.
  let available = grossFinalPay;
  const applied = deductions.map(item => {
    const recovered = Math.min(item.value, Math.max(0, available));
    available -= recovered;
    return { ...item, recovered, unrecovered: Math.round((item.value - recovered) * 100) / 100 };
  });

  const totalDeductions = applied.reduce((sum, item) => sum + item.value, 0);
  const totalRecovered = applied.reduce((sum, item) => sum + item.recovered, 0);
  const unrecovered = applied.reduce((sum, item) => sum + item.unrecovered, 0);
  const netFinalPay = grossFinalPay - totalDeductions;

  return {
    service, separation, earnings, deductions: applied,
    grossFinalPay, totalDeductions, totalRecovered, unrecovered,
    netFinalPay, negative: netFinalPay < 0,
    computeStatutory, statutoryDecidedAtTransaction,
    retirementValue: policy.components['Retirement pay'] ? retirementValue : 0,
  };
}

/** Component checkboxes map one-to-one onto the parameters FIN-001 governs. */
const mandatoryScopeKeys = {
  'Unpaid Salary': 'includeUnpaidSalary',
  'Prorated 13th month pay': 'includeProratedThirteenth',
  'SIL conversion': 'includeSILConversion',
  'Separation pay': 'includeSeparationPay',
  'Retirement pay': 'includeRetirementPay',
  'Final tax computation': 'includeFinalTax',
};

const optionalScopeKeys = {
  'Convertible VL / SL beyond SIL': 'includeConvertibleLeave',
  'Cash bond return': 'includeCashBondReturn',
  'Gratuity pay': 'includeGratuity',
};

export function FinalPayEngine({ policy, setPolicy, retirementPolicy, onSave }) {
  const separationScope = useFieldScope('separationRules');
  const assignment = normalizeAssignment(policy.assignment);
  // Final pay asks the Retirement engine for this employee's benefit instead of
  // re-entering an amount. Only a retirement separation can qualify.
  const scenarioRetirement = useMemo(
    () => retirementResult(retirementPolicy, { ...policy.test, retirementDate: policy.test.separationDate, reason: policy.test.reasonForLeaving }),
    [policy.test, retirementPolicy],
  );
  const result = useMemo(() => finalPayResult(policy, { retirementValue: scenarioRetirement.selected }), [policy, scenarioRetirement.selected]);

  const roster = useMemo(() => coveredEmployees(assignment).map(employee => {
    const retirement = retirementResult(retirementPolicy, employee);
    const outcome = finalPayResult(policy, {
      retirementValue: retirement.selected,
      test: { ...policy.test, ...employee.finalPay, dateHired: employee.dateHired, separationDate: employee.separationDate, reasonForLeaving: employee.reasonForLeaving, monthlyBasic: employee.monthlyBasic, earningAmounts: employee.earningAmounts },
    });
    return { employee, retirement, outcome };
  }), [policy, retirementPolicy, assignment]);
  const selectedCodes = policy.transaction?.selected || [];
  const selectedRows = roster.filter(row => selectedCodes.includes(row.employee.code));

  const earningOptions = useMemo(finalPayEarningOptions, []);
  const deductionOptions = useMemo(finalPayDeductionOptions, []);
  const offsets = useMemo(() => finalPayOffsets(policy), [policy]);

  const update = (key, value) => setPolicy(previous => ({ ...previous, [key]: value }));
  const updateTest = (key, value) => setPolicy(previous => ({ ...previous, test: { ...previous.test, [key]: value } }));
  const updateTransaction = (key, value) => setPolicy(previous => ({ ...previous, transaction: { ...previous.transaction, [key]: value } }));
  const toggleComponent = (bucket, label) => setPolicy(previous => ({ ...previous, [bucket]: { ...previous[bucket], [label]: !previous[bucket][label] } }));
  const toggleList = (key, value) => update(key, (policy[key] || []).includes(value) ? policy[key].filter(item => item !== value) : [...(policy[key] || []), value]);
  const setRank = (code, value) => update('finalPayRanks', { ...(policy.finalPayRanks || {}), [code]: value });
  /** Pulls one employee's masterfile record into the scenario. */
  const loadEmployee = code => {
    const employee = employeeDirectory.find(item => item.code === code);
    if (!employee) return;
    setPolicy(previous => ({
      ...previous,
      test: {
        ...previous.test, ...employee.finalPay,
        employeeCode: employee.code,
        dateHired: employee.dateHired, dateOfBirth: employee.dateOfBirth, separationDate: employee.separationDate,
        reasonForLeaving: employee.reasonForLeaving, reason: employee.reason, memberPlan: employee.memberPlan,
        monthlyBasic: employee.monthlyBasic, average36Months: employee.average36Months,
        priorServiceYears: employee.priorServiceYears, breakMonths: employee.breakMonths,
        earningAmounts: { ...employee.earningAmounts },
      },
    }));
  };
  const toggleSelected = code => updateTransaction('selected', selectedCodes.includes(code) ? selectedCodes.filter(item => item !== code) : [...selectedCodes, code]);

  return <div className="policy-engine-grid final-pay-engine">
    <section className="policy-config-card">
      <header><span><Table weight="duotone" /></span><div><h2>Final Pay</h2><p>Consolidates the components that apply on separation and the offsets recovered against them.</p></div><button className={`switch ${policy.enabled ? 'on' : ''}`} onClick={() => update('enabled', !policy.enabled)}><span /></button></header>

      <ApplicabilityPanel assignment={assignment} onChange={value => update('assignment', value)} engineLabel="Final Pay" />

      <h3 className="policy-subheading">Components</h3>
      <div className="component-checklist-row">
        <CheckList title="Mandatory components" helpKey="finalPayComponents" values={policy.components} onToggle={label => toggleComponent('components', label)} keys={mandatoryScopeKeys} />
        <CheckList title="Optional company components" helpKey="optionalComponents" values={policy.optionalComponents} onToggle={label => toggleComponent('optionalComponents', label)} keys={optionalScopeKeys} />
      </div>
      <SourceMultiSelect
        title="Included earnings"
        helpKey="includedEarnings"
        scopeKey="includedEarnings"
        hint="Allowances, commissions and other company earnings come from Earning Configuration. Final Pay selects them; it does not duplicate their definitions."
        options={earningOptions}
        selected={policy.includedEarnings || []}
        onToggle={value => toggleList('includedEarnings', value)}
        emptyMessage="No active earnings are configured."
      />
      <SourceMultiSelect
        title="Included deductions and loans"
        helpKey="includedDeductions"
        scopeKey="includedDeductions"
        hint="Recoverable balances come from the Deduction, Company Loan and Government Loan modules. Earnings and deductions stay separately configured."
        options={deductionOptions}
        selected={policy.includedDeductions || []}
        onToggle={value => toggleList('includedDeductions', value)}
        emptyMessage="No active deductions or loans are configured."
      />

      <h3 className="policy-subheading">Separation treatment</h3>
      <div className={separationScope}><SeparationRuleTable rules={policy.separationRules} onChange={value => update('separationRules', value)} /></div>

      <h3 className="policy-subheading">Deduction hierarchy for final pay</h3>
      <div className="policy-form-grid">
        <FieldLabel className="wide" label="Applicable hierarchy" helpKey="finalPayHierarchy" scopeKey="hierarchySource"><select value={policy.hierarchySource} onChange={event => update('hierarchySource', event.target.value)}>{HIERARCHY_SOURCES.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
      </div>
      <div className={`hierarchy-source ${policy.hierarchySource === HIERARCHY_SOURCES[1] ? 'fallback' : 'linked'}`}>
        <ArrowsDownUp weight="duotone" />
        <span>{policy.hierarchySource === HIERARCHY_SOURCES[1]
          ? <>Final pay uses its own order. A regular payroll hierarchy is <strong>not</strong> assumed to apply to a final settlement.</>
          : <>Final pay reuses the regular payroll order from <strong>REF-011</strong>. Change this if the settlement collects balances in a different sequence.</>}</span>
      </div>
      {policy.hierarchySource === HIERARCHY_SOURCES[1] && offsets.length > 0 && <div className="deduction-rank-table">
        <h4>Final pay adjustment order</h4>
        <table>
          <thead><tr><th>Priority</th><th>Collection</th><th>Outstanding balance</th><th>Source</th></tr></thead>
          <tbody>{offsets.map(option => <tr key={option.value}>
            <td><input type="number" min="1" value={policy.finalPayRanks?.[option.value] ?? option.rank} onChange={event => setRank(option.value, Number(event.target.value))} /></td>
            <td><strong>{option.label}</strong><small>{option.detail}</small></td>
            <td>{money(option.outstanding)}</td>
            <td><small>{option.group}</small></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {policy.hierarchySource === HIERARCHY_SOURCES[1] && !offsets.length && <p className="applicability-empty">Select the deductions and loans final pay recovers before ranking them.</p>}

      <h3 className="policy-subheading">Statutory contributions</h3>
      <div className="policy-form-grid">
        <FieldLabel className="wide" label="Statutory contribution treatment" helpKey="statutoryRule"><select value={policy.statutoryRule} onChange={event => update('statutoryRule', event.target.value)}>{statutoryRules.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
      </div>
      <p className="policy-inline-note">Whether a separated employee still owes a monthly contribution depends on the separation date and on what an earlier payroll already collected, so the decision can stay with the payroll transaction rather than being fixed here. Contributions are never collected twice for the same period.</p>

      <h3 className="policy-subheading">Company rules</h3>
      <div className="policy-form-grid">
        <FieldLabel className="wide" label="Leave conversion rule" scopeKey="leaveConversionRule"><select value={policy.leaveConversionRule} onChange={event => update('leaveConversionRule', event.target.value)}><option>Use the convertible leave types and caps in Leave Configuration</option><option>Convert SIL only</option><option>No leave conversion on separation</option></select></FieldLabel>
        <NumberField label="Daily rate divisor" helpKey="dailyRateDivisor" value={policy.dailyRateDivisor} onChange={value => update('dailyRateDivisor', value)} suffix="days" />
        <FieldLabel label="Advance 13th month rule" scopeKey="advanceThirteenthRule"><select value={policy.advanceThirteenthRule} onChange={event => update('advanceThirteenthRule', event.target.value)}><option>Deduct any advanced 13th month release</option><option>Do not recover</option></select></FieldLabel>
        <FieldLabel label="Last cutoff rule" scopeKey="lastCutoffRule"><select value={policy.lastCutoffRule} onChange={event => update('lastCutoffRule', event.target.value)}><option>Include the unposted last cutoff</option><option>Process the last cutoff separately</option></select></FieldLabel>
        <FieldLabel label="Government loan balance" scopeKey="governmentLoanRule"><select value={policy.governmentLoanRule} onChange={event => update('governmentLoanRule', event.target.value)}><option>Offset the full outstanding balance</option><option>Endorse the balance to the agency</option></select></FieldLabel>
        <FieldLabel label="Company loan balance" scopeKey="companyLoanRule"><select value={policy.companyLoanRule} onChange={event => update('companyLoanRule', event.target.value)}><option>Offset the full outstanding balance</option><option>Convert to a receivable</option></select></FieldLabel>
        <FieldLabel className="wide" label="Net pay rule when negative" helpKey="negativeNetPayRule"><select value={policy.negativeNetPayRule} onChange={event => update('negativeNetPayRule', event.target.value)}><option>Raise for approval and bill the employee</option><option>Write off the difference</option><option>Hold the final pay release</option></select></FieldLabel>
      </div>
      <p className="policy-inline-note">Leave conversion eligibility and any maximum convertible days stay in Leave Configuration. Final Pay consumes the resulting eligible amount instead of restating the leave rules.</p>
      <div className="policy-toggle-list">
        <Toggle value={policy.autoOffsetDeductions} onChange={value => update('autoOffsetDeductions', value)} helpKey="autoOffsetDeductions" label="Auto-offset authorized deductions" hint="Offset loan balances and property accountabilities before net final pay." />
        <Toggle value={policy.notifyAdmin} onChange={value => update('notifyAdmin', value)} scopeKey="notifyAdmin" label="Notify admin on release" hint="Alert payroll administrators when a final pay breakdown is ready." />
      </div>
      <div className="policy-save"><button className="button primary" onClick={() => onSave(result)}>Save final pay policy</button></div>
    </section>

    <aside className="policy-simulator">
      <header><Calculator weight="duotone" /><div><h2>Final pay breakdown</h2><p>Separation date and reason drive the computation; retirement pay is consumed from the Retirement engine.</p></div></header>
      <div className="policy-test-grid">
        <FieldLabel className="wide" label="Load from Employee Masterfile"><select value={policy.test.employeeCode || ''} onChange={event => loadEmployee(event.target.value)}>{employeeDirectory.map(employee => <option key={employee.code} value={employee.code}>{employee.code} — {employee.name} ({employee.reasonForLeaving})</option>)}</select></FieldLabel>
        <FieldLabel label="Date hired" helpKey="dateHired"><input type="date" value={policy.test.dateHired} onChange={event => updateTest('dateHired', event.target.value)} /></FieldLabel>
        <FieldLabel label="Separation date" helpKey="separationDate"><input type="date" value={policy.test.separationDate} onChange={event => updateTest('separationDate', event.target.value)} /></FieldLabel>
        <FieldLabel className="wide" label="Reason for leaving" helpKey="reasonForLeaving"><select value={policy.test.reasonForLeaving} onChange={event => updateTest('reasonForLeaving', event.target.value)}>{separationReasons.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
        <NumberField label="Monthly basic pay" helpKey="monthlyBasic" value={policy.test.monthlyBasic} onChange={value => updateTest('monthlyBasic', value)} />
        <NumberField label="Unpaid salary" value={policy.test.unpaidSalary} onChange={value => updateTest('unpaidSalary', value)} />
        <NumberField label="Prorated 13th month" value={policy.test.thirteenthMonth} onChange={value => updateTest('thirteenthMonth', value)} />
        <NumberField label="SIL conversion" value={policy.test.silConversion} onChange={value => updateTest('silConversion', value)} />
        <NumberField label="Convertible VL / SL" value={policy.test.convertibleLeave} onChange={value => updateTest('convertibleLeave', value)} />
        <NumberField label="Cash bond return" value={policy.test.cashBond} onChange={value => updateTest('cashBond', value)} />
        <NumberField label="Advance 13th month" value={policy.test.advanceThirteenth} onChange={value => updateTest('advanceThirteenth', value)} />
        <NumberField label="Statutory contributions" value={policy.test.statutoryContributions} onChange={value => updateTest('statutoryContributions', value)} />
        <NumberField label="Final tax" value={policy.test.finalTax} onChange={value => updateTest('finalTax', value)} />
      </div>

      {result.statutoryDecidedAtTransaction && <div className="transaction-decision">
        <Toggle value={Boolean(policy.test.computeStatutory)} onChange={value => updateTest('computeStatutory', value)} label="Compute statutory contributions in this transaction" hint={`Separation date ${policy.test.separationDate}. Skip this when the last regular payroll already collected the month.`} />
      </div>}

      <div className="policy-results"><span><small>Gross final pay</small><strong>{money(result.grossFinalPay)}</strong></span><span><small>Authorized offsets</small><strong>{money(result.totalDeductions)}</strong></span><span><small>Retirement pay included</small><strong>{money(result.retirementValue)}</strong></span><span className="highlight"><small>Net final pay</small><strong>{money(result.netFinalPay)}</strong></span></div>
      <div className={`policy-outcome ${result.negative ? 'error' : 'success'}`}>{result.negative ? <Warning weight="fill" /> : <CheckCircle weight="fill" />}<span><strong>{result.negative ? 'Negative net final pay' : 'Final pay ready for release'}</strong><small>{result.negative ? `Company rule applied: ${policy.negativeNetPayRule}.` : 'All enabled components were computed and authorized offsets were applied in hierarchy order.'}</small></span></div>

      <div className="calculation-trace">
        <h3>Calculation trace</h3>
        <p>Service from {policy.test.dateHired} to {policy.test.separationDate}: <strong>{result.service.years}y {result.service.months}m</strong>, rounded to <strong>{result.separation.roundedYears} year(s)</strong> by the rule mapped to {result.separation.applied.reason}.</p>
        <p>{separationTrace(result.separation, policy.test.monthlyBasic)}</p>
        <p>Separation pay tax treatment: <strong>{result.separation.applied.taxTreatment}</strong>.</p>
        <p>Retirement pay from the Retirement engine: <strong>{money(scenarioRetirement.selected)}</strong> — {scenarioRetirement.eligible ? `qualifying and ${scenarioRetirement.taxExempt ? 'tax exempt' : 'taxable'}` : 'no qualifying retirement benefit for this scenario'}.</p>
        <p>Statutory contributions: <strong>{result.computeStatutory ? 'computed in this final pay' : 'not computed'}</strong> — {result.statutoryDecidedAtTransaction ? 'decided on the payroll transaction' : policy.statutoryRule}.</p>
      </div>

      <div className="simulation-ledger">
        <h3>Breakdown</h3>
        <table>
          <thead><tr><th>Component</th><th>Type</th><th>Amount</th><th>Recovered</th></tr></thead>
          <tbody>
            {result.earnings.filter(item => item.on && item.value !== 0).map(item => <tr key={item.label}><td>{item.label}</td><td><small>{item.type}</small></td><td>{money(item.value)}</td><td>—</td></tr>)}
            {result.deductions.filter(item => item.value !== 0).map(item => <tr key={item.code}><td>{item.label}<small>Rank {item.rank}</small></td><td><small>{item.type}</small></td><td className="deferred-copy">−{money(item.value)}</td><td>{money(item.recovered)}{item.unrecovered > 0 && <small className="deferred-copy">{money(item.unrecovered)} unrecovered</small>}</td></tr>)}
          </tbody>
        </table>
      </div>
      {result.unrecovered > 0 && <div className="payslip-note"><Warning /><div><strong>{money(result.unrecovered)} could not be recovered from this final pay</strong><span>The balance stays outstanding under the negative net pay rule: {policy.negativeNetPayRule}.</span></div></div>}

      <div className="eligible-roster">
        <header><Users weight="duotone" /><div><h3>Final pay payroll transaction</h3><p>{describeAssignment(assignment)} · only separated employees are processed. Each row resolves its own separation date, reason and rule.</p></div></header>
        <div className="policy-form-grid transaction-controls">
          <FieldLabel className="wide" label="Transaction method" helpKey="transactionMethod"><select value={policy.transaction?.method} onChange={event => updateTransaction('method', event.target.value)}>{transactionMethods.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
        </div>
        <table>
          <thead><tr><th /><th>Employee</th><th>Separation date</th><th>Reason for leaving</th><th>Separation pay</th><th>Retirement pay</th><th>Net final pay</th></tr></thead>
          <tbody>{roster.map(({ employee, retirement, outcome }) => <tr key={employee.code} className={selectedCodes.includes(employee.code) ? 'selected' : ''}>
            <td><input type="checkbox" checked={selectedCodes.includes(employee.code)} onChange={() => toggleSelected(employee.code)} aria-label={`Include ${employee.name} in the transaction`} /></td>
            <td><strong>{employee.name}</strong><small>{employee.code} · {employee.group}</small></td>
            <td>{employee.separationDate}</td>
            <td><small>{employee.reasonForLeaving}</small><small className="deferred-copy">{outcome.separation.applied.formula}</small></td>
            <td>{money(outcome.separation.amount)}</td>
            <td>{money(retirement.selected)}</td>
            <td>{money(outcome.netFinalPay)}</td>
          </tr>)}</tbody>
        </table>
        <div className="transaction-summary">
          <span><small>Employees in this transaction</small><strong>{selectedRows.length}</strong></span>
          <span><small>Separation reasons applied</small><strong>{new Set(selectedRows.map(row => row.employee.reasonForLeaving)).size}</strong></span>
          <span className="highlight"><small>Total net final pay</small><strong>{money(selectedRows.reduce((sum, row) => sum + row.outcome.netFinalPay, 0))}</strong></span>
        </div>
        <p className="policy-inline-note">{selectedRows.length} of {roster.length} covered {plural(roster.length, 'employee')} selected. Separation date and Reason for Leaving come from the Employee Masterfile, so an uploaded batch carries the same information.</p>
      </div>
    </aside>
  </div>;
}
