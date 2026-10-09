/**
 * The Payroll dashboard on the Payroll hub, like HRM's and Timekeeping's:
 * the figures that matter today, Tasks for the Day, Payroll Issues/Notes and
 * the payroll calculator. See payrollDashboard.js for the rules.
 */

import { useMemo, useState } from 'react';
import { Calculator, CheckCircle, ListChecks, NotePencil, Warning } from '@phosphor-icons/react';
import { useRole } from './RoleContext';
import { appendAuditEvent, readActiveCompanyId } from './companyRepository';
import { readPayrollRuns } from './payrollRuns.js';
import { readCalendars } from './CanonicalWorkspaces';
import { effectiveStatutorySet } from './statutoryService';
import { addPayrollNote, calculatePay, dashboardKpis, payrollTasks, readPayrollNotes, reopenPayrollNote, resolvePayrollNote, writePayrollNotes } from './payrollDashboard.js';
import { GhostButton, Modal } from './HRMKit.jsx';
import { plural } from './textFormat';

const peso = value => `₱${(Number(value) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PayrollCalculator({ onClose }) {
  const [input, setInput] = useState({ monthlyBasic: 30000, frequency: 'Semi-monthly', taxableAllowances: 0, nonTaxableAllowances: 2000, otherDeductions: 0, minimumWage: false });
  const today = new Date().toISOString().slice(0, 10);
  const result = useMemo(() => calculatePay(input, effectiveStatutorySet(today)), [input, today]);
  const set = (key, value) => setInput(previous => ({ ...previous, [key]: value }));
  const number = key => <input type="number" min="0" step="0.01" value={input[key]} onChange={event => set(key, event.target.value === '' ? '' : Number(event.target.value))} />;
  const rows = [
    ['Basic pay', result.basic], ['Taxable allowances', result.taxableAllowance], ['Non-taxable allowances', result.nonTaxableAllowance], ['Gross pay', result.gross, true],
    ['SSS (employee)', -result.sss], ['PhilHealth (employee)', -result.philhealth], ['Pag-IBIG (employee)', -result.pagibig],
    ['Withholding tax', -result.tax], ['Other deductions', -result.otherDeductions], ['Estimated net pay', result.netPay, true], ['Employer cost', result.employerCost],
  ];
  return <Modal title="Payroll calculator" onClose={onClose} width="md" footer={<GhostButton onClick={onClose}>Close</GhostButton>}>
    <p className="hrm-modal-message">A quick estimate for one pay period against today's statutory and tax tables. Nothing is saved and no payroll transaction is created.</p>
    <div className="payroll-calculator">
      <div className="payroll-field-grid">
        <label className="payroll-field"><span>Monthly basic pay</span>{number('monthlyBasic')}</label>
        <label className="payroll-field"><span>Pay frequency</span><select value={input.frequency} onChange={event => set('frequency', event.target.value)}>{['Semi-monthly', 'Monthly', 'Weekly'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="payroll-field"><span>Taxable allowances (monthly)</span>{number('taxableAllowances')}</label>
        <label className="payroll-field"><span>Non-taxable allowances (monthly)</span>{number('nonTaxableAllowances')}</label>
        <label className="payroll-field"><span>Other deductions (this period)</span>{number('otherDeductions')}</label>
        <label className="payroll-field"><span>Minimum wage earner</span><select value={input.minimumWage ? 'Yes' : 'No'} onChange={event => set('minimumWage', event.target.value === 'Yes')}><option>No</option><option>Yes</option></select></label>
      </div>
      <table className="hrm-table payroll-calculator-result"><tbody>
        {rows.map(([label, value, strong]) => <tr key={label} className={strong ? 'strong' : ''}><td>{label}</td><td className="align-right">{value < 0 ? `(${peso(-value)})` : peso(value)}</td></tr>)}
      </tbody></table>
    </div>
  </Modal>;
}

export function PayrollDashboard({ onOpenWorkspace }) {
  const { actor, isPaAdmin } = useRole();
  const companyId = readActiveCompanyId();
  const runs = useMemo(() => readPayrollRuns(companyId), [companyId]);
  const calendars = useMemo(() => readCalendars(companyId), [companyId]);
  const kpis = useMemo(() => dashboardKpis(runs), [runs]);
  const tasks = useMemo(() => payrollTasks({ runs, calendars, isPaAdmin }), [runs, calendars, isPaAdmin]);
  const [notes, setNotes] = useState(() => readPayrollNotes(companyId));
  const [draft, setDraft] = useState({ kind: 'Issue', text: '', transactionNumber: '' });
  const [error, setError] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [calculator, setCalculator] = useState(false);

  const save = next => { setNotes(writePayrollNotes(companyId, next)); };
  const add = event => {
    event.preventDefault();
    const outcome = addPayrollNote(notes, { ...draft, actor });
    if (outcome.error) { setError(outcome.error); return; }
    setError('');
    save(outcome.notes);
    appendAuditEvent?.({ companyId, entity: 'Payroll Issues/Notes', entityId: outcome.note.id, action: `${outcome.note.kind} added`, actor, detail: outcome.note.text });
    setDraft({ kind: draft.kind, text: '', transactionNumber: '' });
  };
  const resolve = note => { save(resolvePayrollNote(notes, note.id, { actor })); appendAuditEvent?.({ companyId, entity: 'Payroll Issues/Notes', entityId: note.id, action: 'Issue resolved', actor, detail: note.text }); };
  const reopen = note => save(reopenPayrollNote(notes, note.id));
  const openIssues = notes.filter(note => note.status === 'Open');
  const visibleNotes = notes.filter(note => showResolved || note.status !== 'Resolved');
  const transactionNumbers = runs.filter(run => run.status !== 'Cancelled').map(run => run.transactionNumber);

  return <section className="payroll-dashboard">
    <div className="tk-kpi-row">
      <div className="tk-kpi-card"><span>Transactions in progress</span><strong>{kpis.inFlight}</strong><small>{kpis.awaitingDecision} awaiting review or approval</small></div>
      <div className="tk-kpi-card"><span>Blocking errors</span><strong className={kpis.blocking ? 'tone-down' : ''}>{kpis.blocking}</strong><small>on transactions not yet posted</small></div>
      <div className="tk-kpi-card"><span>Posted this month</span><strong>{kpis.postedThisMonth}</strong><small>net pay {peso(kpis.netPayThisMonth)}</small></div>
      <div className="tk-kpi-card"><span>Last posted payroll</span><strong>{kpis.lastPosted ? kpis.lastPosted.transactionNumber : '—'}</strong><small>{kpis.lastPosted ? `paid ${kpis.lastPosted.payoutDate} · ${peso(kpis.lastPosted.netPay)}` : 'nothing posted yet'}</small></div>
      <div className="tk-kpi-card"><span>Open issues</span><strong>{openIssues.length}</strong><small>in Payroll Issues/Notes</small></div>
    </div>

    <div className="payroll-dashboard-grid">
      <article className="payroll-dashboard-card">
        <header><ListChecks /><h3>Tasks for the day</h3><span className="status-pill">{tasks.length}</span></header>
        {tasks.length ? <ul className="payroll-task-list">
          {tasks.slice(0, 8).map(task => <li key={task.key} className={task.priority === 1 ? 'urgent' : ''}>
            {task.priority === 1 ? <Warning weight="fill" /> : <CheckCircle />}
            <div><strong>{task.text}</strong><small>{task.kind}{task.due ? ` · ${task.due}` : ''}</small></div>
            {task.runId && <button type="button" className="hrm-btn outline" onClick={() => { try { sessionStorage.setItem('atlas-payroll-open-run', task.runId); } catch { /* the register still opens */ } onOpenWorkspace?.('transactions'); }}>Open</button>}
          </li>)}
          {tasks.length > 8 && <li className="more">{tasks.length - 8} more {plural(tasks.length - 8, 'task')} in Payroll Processing</li>}
        </ul> : <p className="payroll-note">Nothing needs doing today.</p>}
      </article>

      <article className="payroll-dashboard-card">
        <header><NotePencil /><h3>Payroll issues and notes</h3><span className="status-pill">{openIssues.length} open</span></header>
        <form className="payroll-note-form" onSubmit={add}>
          <select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value })}><option>Issue</option><option>Note</option></select>
          <select value={draft.transactionNumber} onChange={event => setDraft({ ...draft, transactionNumber: event.target.value })}><option value="">No transaction</option>{transactionNumbers.map(value => <option key={value}>{value}</option>)}</select>
          <input value={draft.text} onChange={event => setDraft({ ...draft, text: event.target.value })} placeholder="e.g. Waiting for October timekeeping from the Marikina depot" />
          <button className="hrm-btn primary" type="submit">Add</button>
        </form>
        {error && <div className="wizard-error">{error}</div>}
        <ul className="payroll-note-list">
          {visibleNotes.slice(0, 8).map(note => <li key={note.id} className={note.status === 'Resolved' ? 'resolved' : ''}>
            <span className={`status-pill ${note.kind === 'Issue' ? (note.status === 'Resolved' ? 'active' : 'draft') : ''}`}>{note.kind === 'Issue' ? note.status : 'Note'}</span>
            <div><strong>{note.text}</strong><small>{note.createdBy}, {note.createdAt}{note.transactionNumber ? ` · ${note.transactionNumber}` : ''}{note.resolvedBy ? ` · resolved by ${note.resolvedBy}, ${note.resolvedAt}` : ''}</small></div>
            {note.kind === 'Issue' && (note.status === 'Open'
              ? <button type="button" className="hrm-btn outline" onClick={() => resolve(note)}>Resolve</button>
              : <button type="button" className="hrm-btn outline" onClick={() => reopen(note)}>Reopen</button>)}
          </li>)}
          {!visibleNotes.length && <li className="more">No issues or notes yet.</li>}
        </ul>
        {notes.some(note => note.status === 'Resolved') && <button type="button" className="table-link" onClick={() => setShowResolved(value => !value)}>{showResolved ? 'Hide resolved' : 'Show resolved'}</button>}
      </article>
    </div>

    <div className="payroll-dashboard-actions">
      <button type="button" className="hrm-btn outline" onClick={() => setCalculator(true)}><Calculator size={14} /> Payroll calculator</button>
    </div>
    {calculator && <PayrollCalculator onClose={() => setCalculator(false)} />}
  </section>;
}
