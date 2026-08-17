import { ClockCounterClockwise, Info, Warning } from '@phosphor-icons/react';
import { FieldLabel, NumberField, Toggle } from './PolicyFields';
import { plural } from './textFormat';

/**
 * A deduction that could not be collected in full does not disappear: it stays
 * outstanding, keeps its original due date, gains a revised due date, and is
 * recovered under a configured recovery plan. Staggering is a separate decision
 * from carrying a balance forward, so it only applies above a configured
 * amount and can require approval and employee authorization.
 */
export const recoveryMethods = [
  'Deduct in full on the next payroll',
  'Partial deduction up to the available amount',
  'Fixed staggered amount per payroll',
  'Scheduled installments',
];

export const recoveryFrequencies = ['Every payroll', 'First half only', 'Second half only', 'Monthly'];

export const approvalRoles = ['Payroll Administrator', 'Finance', 'HR', 'Department Head'];

export const authorizationModes = ['Employee authorization required', 'Notify employee only', 'Not required'];

export const notificationChannels = ['Payslip note and email', 'Payslip note only', 'Email only', 'Employee self-service request'];

export const seedRecovery = () => ({
  method: 'Scheduled installments',
  installments: 3,
  fixedAmount: 500,
  frequency: 'Every payroll',
  staggerThreshold: 500,
  requiresApproval: true,
  approvalRole: 'Finance',
  authorization: 'Employee authorization required',
  notificationChannel: 'Payslip note and email',
  keepOriginalDueDate: true,
});

const money = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const stepDays = frequency => (frequency === 'Monthly' ? 30 : frequency === 'Every payroll' ? 15 : 30);

function advance(dateValue, frequency, steps) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '—';
  date.setDate(date.getDate() + stepDays(frequency) * steps);
  return date.toISOString().slice(0, 10);
}

/**
 * Builds the recovery schedule for one deferred item. Returns the installments,
 * the revised due date, and why the item was or was not staggered so the
 * decision is visible rather than implied.
 */
export function recoveryPlan(item, recovery, startDate) {
  const outstanding = Math.max(0, Number(item.deferred || 0) + Number(item.priorDeferred || 0));
  const threshold = Number(recovery.staggerThreshold || 0);
  const belowThreshold = outstanding <= threshold;
  const method = belowThreshold ? 'Deduct in full on the next payroll' : recovery.method;

  let amounts = [];
  if (method === 'Deduct in full on the next payroll') {
    amounts = [outstanding];
  } else if (method === 'Partial deduction up to the available amount') {
    amounts = [Math.min(outstanding, Number(recovery.fixedAmount || 0) || outstanding), Math.max(0, outstanding - (Number(recovery.fixedAmount || 0) || outstanding))].filter(value => value > 0);
  } else if (method === 'Fixed staggered amount per payroll') {
    const perPayroll = Math.max(1, Number(recovery.fixedAmount || 0));
    let remaining = outstanding;
    while (remaining > 0.005 && amounts.length < 60) { const amount = Math.min(perPayroll, remaining); amounts.push(amount); remaining -= amount; }
  } else {
    const count = Math.max(1, Math.round(Number(recovery.installments || 1)));
    const even = Math.floor((outstanding / count) * 100) / 100;
    amounts = Array.from({ length: count }, (_, index) => (index === count - 1 ? Math.round((outstanding - even * (count - 1)) * 100) / 100 : even));
  }

  let balance = outstanding;
  const schedule = amounts.filter(amount => amount > 0).map((amount, index) => {
    balance = Math.round((balance - amount) * 100) / 100;
    return { sequence: index + 1, date: advance(startDate, recovery.frequency, index), amount, balance: Math.max(0, balance) };
  });

  return {
    outstanding,
    method,
    belowThreshold,
    staggered: schedule.length > 1,
    schedule,
    revisedDueDate: schedule.length ? schedule[schedule.length - 1].date : startDate,
    approvalStatus: !recovery.requiresApproval || belowThreshold ? 'Not required' : `Pending ${recovery.approvalRole} approval`,
    authorizationStatus: recovery.authorization === 'Not required' || belowThreshold ? 'Not required' : recovery.authorization,
    reason: belowThreshold
      ? `Outstanding amount is at or below the ${money(threshold)} staggering threshold, so it is recovered in full on the next payroll.`
      : `Outstanding amount is above the ${money(threshold)} staggering threshold, so the configured recovery plan applies.`,
  };
}

/** Audit entries every deferred item keeps, in the order they occur. */
export function recoveryAuditTrail(item, plan, recovery, payrollDate) {
  const entries = [
    [payrollDate, `${item.name} deferred ${money(item.deferred)} of ${money(item.due)} due`, 'Below Net Pay Requirement'],
    [item.originalDueDate || payrollDate, 'Original due date retained', recovery.keepOriginalDueDate ? 'Retained on the record' : 'Replaced by the revised due date'],
    [plan.revisedDueDate, 'Revised due date set', `${plan.method}${plan.staggered ? ` over ${plan.schedule.length} ${plural(plan.schedule.length, 'payroll')}` : ''}`],
  ];
  if (plan.approvalStatus !== 'Not required') entries.push([payrollDate, 'Approval requested', plan.approvalStatus]);
  if (plan.authorizationStatus !== 'Not required') entries.push([payrollDate, 'Employee authorization requested', `${plan.authorizationStatus} · ${recovery.notificationChannel}`]);
  return entries.map(([date, event, detail]) => ({ date, event, detail }));
}

/**
 * Deferred and staggered recovery for every item the take-home engine could not
 * collect in full.
 */
export function DeferredRecoveryPanel({ rows, recovery, onRecovery, payrollDate }) {
  const plans = rows.map(item => ({ item, plan: recoveryPlan(item, recovery, payrollDate) }));
  const staggeredCount = plans.filter(entry => entry.plan.staggered).length;
  const update = (key, value) => onRecovery({ ...recovery, [key]: value });

  return <section className="deferred-recovery">
    <div className="deferred-recovery-heading">
      <div><h3><ClockCounterClockwise weight="duotone" /> Deferred and staggered recovery</h3><p>An amount that could not be collected stays outstanding with its original due date. Staggering is a separate decision from carrying the balance forward.</p></div>
      <span className="applicability-count">{staggeredCount} of {plans.length} staggered</span>
    </div>

    <div className="policy-form-grid">
      <FieldLabel label="Recovery method" helpKey="recoveryMethod" scopeKey="method"><select value={recovery.method} onChange={event => update('method', event.target.value)}>{recoveryMethods.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
      <FieldLabel label="Recovery frequency" scopeKey="frequency"><select value={recovery.frequency} onChange={event => update('frequency', event.target.value)}>{recoveryFrequencies.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
      <NumberField label="Number of installments" scopeKey="installments" value={recovery.installments} onChange={value => update('installments', value)} suffix="payrolls" />
      <NumberField label="Fixed amount per payroll" scopeKey="fixedAmount" value={recovery.fixedAmount} onChange={value => update('fixedAmount', value)} suffix="PHP" />
      <NumberField label="Staggering threshold" helpKey="staggerThreshold" scopeKey="staggerThreshold" value={recovery.staggerThreshold} onChange={value => update('staggerThreshold', value)} suffix="PHP" />
      <FieldLabel label="Approving role" scopeKey="approvalRole"><select value={recovery.approvalRole} disabled={!recovery.requiresApproval} onChange={event => update('approvalRole', event.target.value)}>{approvalRoles.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
      <FieldLabel className="wide" label="Employee authorization" scopeKey="authorization"><select value={recovery.authorization} onChange={event => update('authorization', event.target.value)}>{authorizationModes.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
      <FieldLabel className="wide" label="Notification channel" scopeKey="notificationChannel"><select value={recovery.notificationChannel} onChange={event => update('notificationChannel', event.target.value)}>{notificationChannels.map(option => <option key={option}>{option}</option>)}</select></FieldLabel>
    </div>
    <div className="policy-toggle-list">
      <Toggle value={recovery.requiresApproval} onChange={value => update('requiresApproval', value)} scopeKey="requiresApproval" label="Require approval before staggering" hint="A staggered agreement is routed to the configured role before it takes effect." />
      <Toggle value={recovery.keepOriginalDueDate} onChange={value => update('keepOriginalDueDate', value)} scopeKey="keepOriginalDueDate" label="Retain the original due date" hint="The record keeps both the original due date and the revised due date for audit." />
    </div>

    {!plans.length && <p className="applicability-empty">Nothing was deferred in the current scenario, so there is no outstanding amount to recover.</p>}

    {plans.map(({ item, plan }) => <article className="recovery-card" key={item.code || item.name}>
      <header>
        <div><strong>{item.name}</strong><small>{item.code || 'System-calculated'} · Rank {item.rank}</small></div>
        <div className="recovery-status">
          <span className={`status-pill ${plan.staggered ? 'active' : 'inactive'}`}>{plan.staggered ? `Staggered over ${plan.schedule.length} ${plural(plan.schedule.length, 'payroll')}` : 'Full recovery next payroll'}</span>
          <span className={`status-pill ${plan.approvalStatus === 'Not required' ? 'inactive' : 'draft'}`}>{plan.approvalStatus}</span>
          <span className={`status-pill ${plan.authorizationStatus === 'Not required' ? 'inactive' : 'draft'}`}>{plan.authorizationStatus}</span>
        </div>
      </header>
      <div className="recovery-figures">
        <span><small>Original amount due</small><strong>{money(item.due)}</strong></span>
        <span><small>Amount deducted</small><strong>{money(item.deducted)}</strong></span>
        <span><small>Deferred this payroll</small><strong>{money(item.deferred)}</strong></span>
        <span><small>Total outstanding</small><strong>{money(plan.outstanding)}</strong></span>
        <span><small>Original due date</small><strong>{item.originalDueDate || payrollDate}</strong></span>
        <span><small>Revised due date</small><strong>{plan.revisedDueDate}</strong></span>
      </div>
      <div className={`recovery-reason ${plan.belowThreshold ? 'info' : 'warn'}`}>{plan.belowThreshold ? <Info weight="fill" /> : <Warning weight="fill" />}<span>{plan.reason}</span></div>
      <div className="recovery-schedule">
        <table>
          <thead><tr><th>#</th><th>Scheduled payroll</th><th>Amount to deduct</th><th>Remaining balance</th></tr></thead>
          <tbody>{plan.schedule.map(row => <tr key={row.sequence}><td>{row.sequence}</td><td>{row.date}</td><td>{money(row.amount)}</td><td>{money(row.balance)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="recovery-audit">
        <h4>Audit trail</h4>
        <ul>{recoveryAuditTrail(item, plan, recovery, payrollDate).map((entry, index) => <li key={index}><span>{entry.date}</span><strong>{entry.event}</strong><small>{entry.detail}</small></li>)}</ul>
      </div>
    </article>)}
  </section>;
}
