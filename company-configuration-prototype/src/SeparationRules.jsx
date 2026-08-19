import { Scales } from '@phosphor-icons/react';
import { money, number, roundServiceYears } from './PolicyFields';

/**
 * Reason for Leaving is not informational text: it selects which separation-pay
 * formula and which service-year rounding rule apply, so Final Pay maps every
 * reason to a governed computation instead of using one universal formula.
 */
export const separationFormulas = [
  'Not applicable',
  'One-half month pay per year of service',
  'One month pay per year of service',
  'Company separation plan',
];

export const roundingRules = [
  'Six months or more counts as one year',
  'Completed years only (round down)',
  'Any fraction counts as one year',
];

export const taxTreatments = ['Tax exempt — cause beyond employee control', 'Taxable', 'Evaluate against the final tax rule'];

const multiplierFor = formula => (formula === 'One month pay per year of service' ? 1 : formula === 'One-half month pay per year of service' ? 0.5 : 0);

const rule = (reason, formula, minimumMonths, taxTreatment, computationCode) => ({
  reason,
  formula,
  multiplier: multiplierFor(formula),
  minimumMonths,
  rounding: 'Six months or more counts as one year',
  taxTreatment,
  computationCode,
});

/**
 * Default mapping. The amounts follow the authorized-cause pattern in the Labor
 * Code, but the transcript flagged the exact statutory parameters as a business
 * and legal confirmation point, so every value here stays editable.
 */
export const seedSeparationRules = () => [
  rule('Retirement', 'Not applicable', 0, 'Evaluate against the final tax rule', 'RET-002'),
  rule('Redundancy', 'One month pay per year of service', 1, 'Tax exempt — cause beyond employee control', 'SEP-001'),
  rule('Retrenchment', 'One-half month pay per year of service', 1, 'Tax exempt — cause beyond employee control', 'SEP-002'),
  rule('Installation of labor-saving devices', 'One month pay per year of service', 1, 'Tax exempt — cause beyond employee control', 'SEP-001'),
  rule('Closure not due to serious losses', 'One-half month pay per year of service', 1, 'Tax exempt — cause beyond employee control', 'SEP-002'),
  rule('Disease or health grounds', 'One-half month pay per year of service', 1, 'Tax exempt — cause beyond employee control', 'SEP-002'),
  rule('Resignation', 'Not applicable', 0, 'Taxable', ''),
  rule('Termination for just cause', 'Not applicable', 0, 'Taxable', ''),
  rule('End of project or contract', 'Company separation plan', 0, 'Evaluate against the final tax rule', 'SEP-003'),
];

export function ruleForReason(rules, reason) {
  return rules.find(item => item.reason === reason) || seedSeparationRules().find(item => item.reason === reason) || seedSeparationRules()[0];
}

/**
 * Separation pay for one employee. The reason selects the rule, the rule
 * selects the rounding, and the rounded service years drive the amount.
 */
export function separationPayResult(rules, { reasonForLeaving, monthlyBasic, service }) {
  const applied = ruleForReason(rules, reasonForLeaving);
  const roundedYears = roundServiceYears(service, applied.rounding);
  const months = number(applied.multiplier) * roundedYears;
  const guaranteedMonths = Math.max(months, applied.formula === 'Not applicable' ? 0 : number(applied.minimumMonths));
  const amount = number(monthlyBasic) * guaranteedMonths;
  return {
    applied,
    roundedYears,
    months,
    guaranteedMonths,
    amount,
    minimumApplied: guaranteedMonths > months,
    taxExempt: applied.taxTreatment === 'Tax exempt — cause beyond employee control',
  };
}

/** Editable Reason for Leaving to computation mapping. */
export function SeparationRuleTable({ rules, onChange }) {
  const update = (reason, key, value) => onChange(rules.map(item => {
    if (item.reason !== reason) return item;
    const next = { ...item, [key]: value };
    if (key === 'formula' && value !== 'Company separation plan') next.multiplier = multiplierFor(value);
    return next;
  }));

  return <div className="separation-rule-table">
    <div className="separation-rule-heading">
      <div><h3><Scales weight="duotone" /> Reason for leaving to separation-pay rule</h3><p>Reason for Leaving comes from the Employee Masterfile. In a bulk transaction each employee resolves their own row, so one final-pay run can apply several formulas.</p></div>
      <span className="applicability-count">{rules.filter(item => item.formula !== 'Not applicable').length} of {rules.length} pay separation</span>
    </div>
    <table>
      <thead><tr><th>Reason for leaving</th><th>Formula</th><th>Months per year</th><th>Minimum</th><th>Service rounding</th><th>Tax treatment</th><th>Computation</th></tr></thead>
      <tbody>{rules.map(item => <tr key={item.reason}>
        <td><strong>{item.reason}</strong></td>
        <td><select value={item.formula} onChange={event => update(item.reason, 'formula', event.target.value)}>{separationFormulas.map(option => <option key={option}>{option}</option>)}</select></td>
        <td><input type="number" min="0" step="0.25" value={item.multiplier} disabled={item.formula === 'Not applicable'} onChange={event => update(item.reason, 'multiplier', Number(event.target.value))} /></td>
        <td><div className="suffix-input"><input type="number" min="0" step="0.5" value={item.minimumMonths} disabled={item.formula === 'Not applicable'} onChange={event => update(item.reason, 'minimumMonths', Number(event.target.value))} /><span>mo</span></div></td>
        <td><select value={item.rounding} onChange={event => update(item.reason, 'rounding', event.target.value)}>{roundingRules.map(option => <option key={option}>{option}</option>)}</select></td>
        <td><select value={item.taxTreatment} onChange={event => update(item.reason, 'taxTreatment', event.target.value)}>{taxTreatments.map(option => <option key={option}>{option}</option>)}</select></td>
        <td>{item.computationCode ? <code>{item.computationCode}</code> : <small>No separation pay</small>}</td>
      </tr>)}</tbody>
    </table>
    <p className="separation-rule-note">Formulas stay in Computational Basis. This mapping only records which approved computation a separation reason resolves to, and the parameters it may vary.</p>
  </div>;
}

/** Compact trace used in the final-pay simulator. */
export function separationTrace(result, monthlyBasic) {
  if (result.applied.formula === 'Not applicable') return `${result.applied.reason} carries no separation pay under the current mapping.`;
  return `${result.applied.reason} → ${result.applied.formula}: ${money(monthlyBasic)} × ${result.applied.multiplier} × ${result.roundedYears} year(s) = ${money(result.amount)}${result.minimumApplied ? ` after the ${result.applied.minimumMonths}-month minimum was applied` : ''}.`;
}
