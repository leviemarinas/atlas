/**
 * One employee's payroll result.
 *
 * This is the answer to "where do I see the payroll of one employee, and how do
 * I know the figure is right?". It has two audiences and one source:
 *
 *   - the administrator opens it from inside a payroll transaction, and sees
 *     the full computation trail — every step, the Computational Basis code it
 *     applied, the expression that code publishes, the values substituted into
 *     it, and the module the values came from;
 *   - the employee opens the payslip from HRM ▸ Employee Self-Inquiry, which is
 *     the same line rendered as the document they receive.
 *
 * Both read the line the engine produced. There is no second calculation and no
 * stored copy of the totals, so a recalculated run restates the payslip.
 */

import { useState } from 'react';
import { Printer } from '@phosphor-icons/react';
import {
  DataTable,
  EmployeeBanner,
  EmptyState,
  GhostButton,
  Modal,
  SegmentedTabs,
} from './HRMKit.jsx';
import { downloadFile } from './fileDownload.js';
import { buildPayrollAuditTrail, traceabilityForStep } from './payrollTraceability.js';

export const peso = amount => `₱${(Number(amount) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = amount => (Number(amount) < 0 ? `(${peso(Math.abs(amount))})` : peso(amount));

const simple = (columns, rows, rowKey = 'key') => ({ columns, rows, rowKey });

function MiniTable({ columns, rows, empty = 'Nothing on this line.' }) {
  return <div className="hrm-table-block">
    <div className="hrm-table-scroll">
      <table className="hrm-table">
        <thead><tr>{columns.map(column => <th key={column.key} className={column.align ? `align-${column.align}` : ''}>{column.label}</th>)}</tr></thead>
        <tbody>
          {!rows.length && <tr><td colSpan={columns.length} className="hrm-table-empty">{empty}</td></tr>}
          {rows.map((row, index) => <tr key={row.key || index}>
            {columns.map(column => <td key={column.key} className={column.align ? `align-${column.align}` : ''}>
              {column.render ? column.render(row) : row[column.key] ?? '—'}
            </td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

/* ------------------------------------------------------------ computation */

/**
 * The computation trail. Each row is one step: what it produced, the published
 * formula it applied, the values it substituted, and where those came from.
 * A step whose code carries an evaluable expression is marked as evaluated, so
 * it is visible which figures the library computed and which were table lookups.
 */
/**
 * The formula versions this transaction was computed with.
 *
 * Captured when the run was calculated, so the transaction keeps explaining
 * itself with the versions it applied even after the library moves on. A run
 * calculated before versions were captured says so rather than showing a
 * version it cannot prove.
 */
export function FormulaVersionsApplied({ run }) {
  const snapshot = run?.result?.computationSnapshot;
  if (!snapshot?.entries?.length) {
    return <section className="hrm-section">
      <h3 className="hrm-section-title">Formula versions applied</h3>
      <EmptyState title="No version snapshot was captured">Recalculate this transaction to capture the exact computation version behind every figure.</EmptyState>
    </section>;
  }
  return <section className="hrm-section">
    <h3 className="hrm-section-title">Formula versions applied</h3>
    <p className="page-description">Captured on {new Date(snapshot.capturedAt).toLocaleString()}. {run?.transactionNumber || 'This transaction'} resolves these versions, not the versions the library publishes today.</p>
    <MiniTable
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Computation' },
        { key: 'version', label: 'Version', render: row => (row.version ? `v${row.version}` : 'Not recorded') },
        { key: 'effectiveDate', label: 'Effective', render: row => row.effectiveDate || '—' },
        { key: 'owner', label: 'Owner' },
        { key: 'expression', label: 'Expression as applied', render: row => <code className="table-formula">{row.expression || 'Table lookup'}</code> },
      ]}
      rows={snapshot.entries.map(entry => ({ ...entry, key: entry.code }))}
      empty="No computation was applied to this transaction."
    />
  </section>;
}

export function ComputationTrail({ steps = [] }) {
  const [openStep, setOpenStep] = useState(null);
  if (!steps.length) return <EmptyState title="Nothing computed yet">Recalculate the transaction to produce this employee's line.</EmptyState>;
  return <>
    <div className="payroll-trail">
      {steps.map(step => {
        const trace = traceabilityForStep(step);
        return <button
        key={`${step.seq}-${step.code}`}
        type="button"
        className={`payroll-trail-step ${openStep === step.seq ? 'open' : ''} ${trace.policyApplied ? 'policy-applied' : ''}`}
        onClick={() => setOpenStep(openStep === step.seq ? null : step.seq)}
      >
        <span className="payroll-trail-seq">{step.seq}</span>
        <span className="payroll-trail-body">
          <span className="payroll-trail-head">
            <code className="policy-code-chip">{step.code}</code>
            {/* The version this line actually applied. Payroll must stay
                explainable with the formula that was in force when it ran, not
                with whatever the library publishes today. */}
            {step.version && <code className="version-code-chip" title={`Computation version applied by this payroll line${step.effectiveDate ? `, effective ${step.effectiveDate}` : ''}`}>v{step.version}</code>}
            <strong>{step.label}</strong>
            <em>{step.category}</em>
          </span>
          <small>{step.detail || step.description}</small>
          {openStep === step.seq && <span className="payroll-trail-expand">
            {step.expression
              ? <span className="payroll-trail-formula"><span>Formula</span><code>{step.expression}</code></span>
              : <span className="payroll-trail-formula"><span>Formula</span><code>Table lookup — no expression is published for this code</code></span>}
            <span className="payroll-trail-inputs">
              {Object.entries(step.inputs || {}).map(([key, value]) => <span key={key}><b>{key}</b>{typeof value === 'number' ? value.toLocaleString() : String(value)}</span>)}
              {!Object.keys(step.inputs || {}).length && <span><b>inputs</b>none</span>}
            </span>
            <span className="payroll-trail-source">
              {step.evaluated ? 'Evaluated from the Computational Basis library' : 'Resolved by lookup'} · Source: {step.source}
              {step.version && ` · ${step.code} version ${step.version}${step.effectiveDate ? ` effective ${step.effectiveDate}` : ''}${step.formulaOwner ? ` · ${step.formulaOwner}` : ''}`}
              {step.fallbackReason && ` · Library expression not used: ${step.fallbackReason}`}
            </span>
            <span className="payroll-trail-references">
              <b>{trace.policyApplied ? 'Policy and UI audit references' : 'UI audit references'}</b>
              {trace.references.map(reference => <span key={`${reference.role}-${reference.path.join('-')}`}>
                <em>{reference.role}</em>
                <strong>{reference.feature}</strong>
                <code>{reference.path.join(' › ')}</code>
              </span>)}
            </span>
          </span>}
        </span>
        <span className="payroll-trail-result"><small>{trace.kind}</small><strong>{peso(step.amount)}</strong></span>
      </button>;
      })}
    </div>
  </>;
}

export function SourcePolicyTrail({ line, run }) {
  const nodes = buildPayrollAuditTrail(line, run);
  return <div className="payroll-source-trail" aria-label="Payroll source and policy audit trail">
    {nodes.map((node, index) => <article key={node.id} className={node.type.includes('Policy') ? 'policy' : ''}>
      <div className="payroll-source-order"><span>{index + 1}</span>{index < nodes.length - 1 && <i />}</div>
      <div className="payroll-source-card">
        <header><span>{node.type}</span><strong>{node.title}</strong><em>{node.status}</em></header>
        <code className="payroll-ui-path">{node.path.join(' › ')}</code>
        <div><span><b>Reads</b>{node.reads}</span><span><b>Produces</b>{node.produces}</span></div>
        {/* One source can be read by several steps, so the same code appears
            more than once in a node's list and cannot key on its own value. */}
        {!!node.codes.length && <footer>{node.codes.map((code, position) => <code key={`${code}-${position}`}>{code}</code>)}</footer>}
      </div>
    </article>)}
  </div>;
}

/* ---------------------------------------------------------------- payslip */

/**
 * The payslip document. It is generated from the line rather than stored, and
 * printing writes the same rows the screen shows.
 */
export function PayslipDocument({ line, run, company = 'ABC Company Ltd', employee }) {
  const earnings = [
    { key: 'basic', label: 'Basic Pay', amount: line.basicPay },
    ...line.earnings.map((item, index) => ({ key: `e-${index}`, label: item.name, amount: item.amount })),
    ...line.bonuses.map((item, index) => ({ key: `b-${index}`, label: item.name, amount: item.amount })),
  ].filter(row => row.amount);
  const deductions = [
    line.statutory.sssEmployee && { key: 'sss', label: 'SSS (employee share)', amount: line.statutory.sssEmployee },
    line.statutory.philhealthEmployee && { key: 'phic', label: 'PhilHealth (employee share)', amount: line.statutory.philhealthEmployee },
    line.statutory.hdmfEmployee && { key: 'hdmf', label: 'Pag-IBIG (employee share)', amount: line.statutory.hdmfEmployee },
    line.withholdingTax && { key: 'tax', label: 'Withholding tax', amount: line.withholdingTax },
    ...line.deductions.filter(item => item.deducted).map((item, index) => ({ key: `d-${index}`, label: item.name, amount: item.deducted })),
    ...line.loans.filter(item => item.deducted).map((item, index) => ({ key: `l-${index}`, label: item.name, amount: item.deducted })),
  ].filter(Boolean);

  return <div className="payslip">
    <header className="payslip-head">
      <div>
        <strong>{company}</strong>
        <span>Payslip · {run.transactionNumber}</span>
      </div>
      <div className="payslip-period">
        <span>Payroll period</span>
        <strong>{run.periodStart} to {run.periodEnd}</strong>
        <span>Payout {run.payoutDate}</span>
      </div>
    </header>
    <section className="payslip-identity">
      <div><span>Employee</span><strong>{line.name}</strong></div>
      <div><span>Employee no.</span><strong>{line.employeeCode}</strong></div>
      <div><span>Position</span><strong>{line.position}</strong></div>
      <div><span>Department</span><strong>{line.department}</strong></div>
      <div><span>Pay type</span><strong>{line.payType}</strong></div>
      <div><span>TIN</span><strong>{employee?.government?.tin || '—'}</strong></div>
    </section>
    <div className="payslip-columns">
      <section>
        <h4>Earnings</h4>
        <MiniTable
          columns={[{ key: 'label', label: 'Pay item' }, { key: 'amount', label: 'Amount', align: 'right', render: row => peso(row.amount) }]}
          rows={earnings}
        />
        <p className="payslip-total"><span>Gross pay</span><strong>{peso(line.grossPay)}</strong></p>
      </section>
      <section>
        <h4>Deductions</h4>
        <MiniTable
          columns={[{ key: 'label', label: 'Deduction' }, { key: 'amount', label: 'Amount', align: 'right', render: row => peso(row.amount) }]}
          rows={deductions}
        />
        <p className="payslip-total"><span>Total deductions</span><strong>{peso(line.totalDeductions)}</strong></p>
      </section>
    </div>
    <p className="payslip-net"><span>Net pay</span><strong>{peso(line.netPay)}</strong></p>
    {line.bankSplits.length > 0 && <section className="payslip-banks">
      <h4>Credited to</h4>
      <MiniTable
        columns={[
          { key: 'bankName', label: 'Bank' },
          { key: 'accountNumber', label: 'Account' },
          { key: 'percentOfNetPay', label: 'Share', render: row => `${row.percentOfNetPay}%` },
          { key: 'amount', label: 'Amount', align: 'right', render: row => peso(row.amount) },
        ]}
        rows={line.bankSplits.map((row, index) => ({ ...row, key: `bank-${index}` }))}
      />
    </section>}
    <footer className="payslip-foot">
      <span>Employer statutory cost this period: {peso(line.statutory.employerTotal)}</span>
      <span>Tax basis: {line.taxBasis}</span>
    </footer>
  </div>;
}

export function PayslipModal({ line, run, employee, onClose }) {
  const download = () => {
    const rows = [
      ['Payslip', run.transactionNumber],
      ['Employee', `${line.employeeCode} ${line.name}`],
      ['Period', `${run.periodStart} to ${run.periodEnd}`],
      [],
      ['Earnings', ''],
      ['Basic Pay', line.basicPay],
      ...line.earnings.map(item => [item.name, item.amount]),
      ...line.bonuses.map(item => [item.name, item.amount]),
      ['Gross Pay', line.grossPay],
      [],
      ['Deductions', ''],
      ['SSS', line.statutory.sssEmployee],
      ['PhilHealth', line.statutory.philhealthEmployee],
      ['Pag-IBIG', line.statutory.hdmfEmployee],
      ['Withholding Tax', line.withholdingTax],
      ...line.deductions.map(item => [item.name, item.deducted]),
      ...line.loans.map(item => [item.name, item.deducted]),
      ['Total Deductions', line.totalDeductions],
      [],
      ['Net Pay', line.netPay],
    ];
    downloadFile(`payslip-${line.employeeCode}-${run.transactionNumber}.csv`, rows.map(row => row.map(cell => `"${String(cell ?? '')}"`).join(',')).join('\n'), 'text/csv');
  };
  return <Modal
    title={`Payslip — ${line.name}`}
    onClose={onClose}
    width="lg"
    footer={<>
      <GhostButton onClick={download}>Download</GhostButton>
      <button type="button" className="hrm-btn primary" onClick={() => window.print()}><Printer size={15} /> Print</button>
    </>}
  >
    <PayslipDocument line={line} run={run} employee={employee} />
  </Modal>;
}

/* ------------------------------------------------------------ the detail */

const DETAIL_TABS = [
  { key: 'computation', label: 'How it was computed' },
  { key: 'earnings', label: 'Earnings & bonuses' },
  { key: 'statutory', label: 'Statutory & tax' },
  { key: 'deductions', label: 'Deductions & loans' },
  { key: 'attendance', label: 'Timekeeping' },
  { key: 'payout', label: 'Payout & YTD' },
];

/**
 * The administrator's per-employee view inside a transaction.
 *
 * The KPI strip is the line's own totals; every tab beneath it opens one part
 * of the same line. Nothing here recomputes — if a figure looks wrong the fix
 * is upstream (masterfile, punch record, register, statutory table), and the
 * trail names which one.
 */
export function PayrollLineDetail({ line, run, employee, ytdOpening, onBack, onEdit, canEdit }) {
  const [tab, setTab] = useState('computation');
  const [payslipOpen, setPayslipOpen] = useState(false);

  if (line.status !== 'Computed') {
    return <div className="payroll-line-detail">
      <EmployeeBanner employee={{ name: line.name, employeeCode: line.employeeCode, position: line.position, department: line.department, employmentType: '' }} />
      <EmptyState title="This employee was not paid in this transaction">{line.exclusionReason}</EmptyState>
      <div className="hrm-toolbar end"><GhostButton onClick={onBack}>Back to the employee list</GhostButton></div>
    </div>;
  }

  const kpis = [
    { label: 'Basic pay', value: peso(line.basicPay) },
    { label: 'Gross pay', value: peso(line.grossPay) },
    { label: 'Statutory (EE)', value: peso(line.statutory.employeeTotal) },
    { label: 'Withholding tax', value: peso(line.withholdingTax) },
    { label: 'Deductions & loans', value: peso(line.totalDeductions - line.statutory.employeeTotal - line.withholdingTax) },
    { label: 'Net pay', value: peso(line.netPay), tone: 'up' },
  ];

  return <div className="payroll-line-detail">
    <EmployeeBanner employee={{ name: line.name, employeeCode: line.employeeCode, position: line.position, department: line.department, employmentType: `${line.employeeGroup} · ${line.payType} paid` }} />

    <div className="tk-kpi-row">
      {kpis.map(card => <div key={card.label} className="tk-kpi-card">
        <span>{card.label}</span>
        <strong className={card.tone ? `tone-${card.tone}` : ''}>{card.value}</strong>
      </div>)}
    </div>

    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SegmentedTabs tabs={DETAIL_TABS} value={tab} onChange={setTab} ariaLabel="Payroll line detail" />
      </div>
      <div className="hrm-toolbar-right">
        {canEdit && <GhostButton onClick={onEdit}>Edit this line</GhostButton>}
        <button type="button" className="hrm-btn outline" onClick={() => setPayslipOpen(true)}>View payslip</button>
        <GhostButton onClick={onBack}>Back</GhostButton>
      </div>
    </div>

    {(line.proration || line.finalPay || line.onHold || line.grossUp) && <div className="payroll-flags">
      {line.proration && <span className="status-pill">Pro-rated: {line.proration.payableDays} of {line.proration.periodWorkingDays} working days payable</span>}
      {line.finalPay && <span className="status-pill locked">Final pay — annualised tax table</span>}
      {line.onHold && <span className="status-pill draft">Included while on hold</span>}
      {line.grossUp && <span className="status-pill">Grossed up: employer absorbs {peso(line.grossUp.employerTax)}</span>}
    </div>}

    {tab === 'computation' && <section className="hrm-section">
      <h3 className="hrm-section-title">Source, policy, and output trail</h3>
      <p className="page-description">Follow the exact Atlas UI path from transaction settings, employee configuration, time, registers, references, and policy engines to this payroll line, payslip, and company report.</p>
      <SourcePolicyTrail line={line} run={run} />
      <h3 className="hrm-section-title payroll-execution-heading">Calculation execution</h3>
      <p className="page-description">Every amount names the Computational Basis code it applied and the version it applied it at. Open a step to see its formula or lookup, captured inputs, owning feature, policy references, and reproducible UI paths.</p>
      <ComputationTrail steps={line.steps} />
      <FormulaVersionsApplied run={run} />
    </section>}

    {tab === 'earnings' && <>
      <section className="hrm-section">
        <h3 className="hrm-section-title">Earnings</h3>
        <MiniTable
          columns={[
            { key: 'code', label: 'Code' },
            { key: 'name', label: 'Pay item' },
            { key: 'classification', label: 'Classification' },
            { key: 'source', label: 'Source' },
            { key: 'ceiling', label: 'Ceiling', render: row => (row.ceiling ? `${peso(row.ceiling)} annual · ${peso(row.usedToDate)} used` : '—') },
            { key: 'amount', label: 'Amount', align: 'right', render: row => peso(row.amount) },
          ]}
          rows={line.earnings.map((item, index) => ({ ...item, key: `earn-${index}` }))}
          empty="No earnings on this line."
        />
      </section>
      <section className="hrm-section">
        <h3 className="hrm-section-title">13th month pay and bonuses</h3>
        <MiniTable
          columns={[
            { key: 'name', label: 'Bonus' },
            { key: 'source', label: 'Source' },
            { key: 'ceilingBefore', label: 'Ceiling available', align: 'right', render: row => peso(row.ceilingBefore) },
            { key: 'nonTaxable', label: 'Non-taxable', align: 'right', render: row => peso(row.nonTaxable) },
            { key: 'taxable', label: 'Taxable', align: 'right', render: row => peso(row.taxable) },
            { key: 'amount', label: 'Total', align: 'right', render: row => peso(row.amount) },
          ]}
          rows={line.bonuses.map((item, index) => ({ ...item, key: `bon-${index}` }))}
          empty="This run does not compute 13th month pay or bonuses."
        />
      </section>
    </>}

    {tab === 'statutory' && <>
      <section className="hrm-section">
        <h3 className="hrm-section-title">Statutory contributions</h3>
        <p className="page-description">
          Computed on a monthly basis of {peso(line.statutory.basis)}
          {line.statutory.collectedShare < 1 && `, of which ${Math.round(line.statutory.collectedShare * 100)}% is collected on this cutoff`}.
        </p>
        <MiniTable
          columns={[
            { key: 'agency', label: 'Agency' },
            { key: 'employee', label: 'Employee share', align: 'right', render: row => peso(row.employee) },
            { key: 'employer', label: 'Employer share', align: 'right', render: row => peso(row.employer) },
          ]}
          rows={[
            { key: 'sss', agency: 'SSS — regular fund', employee: line.statutory.sssRegularEmployee, employer: line.statutory.sssEmployer - line.statutory.sssMpfEmployer - line.statutory.ec },
            { key: 'wisp', agency: 'SSS — Mandatory Provident Fund (WISP)', employee: line.statutory.sssMpfEmployee, employer: line.statutory.sssMpfEmployer },
            { key: 'ec', agency: 'Employees’ Compensation', employee: 0, employer: line.statutory.ec },
            { key: 'phic', agency: 'PhilHealth', employee: line.statutory.philhealthEmployee, employer: line.statutory.philhealthEmployer },
            { key: 'hdmf', agency: 'Pag-IBIG', employee: line.statutory.hdmfEmployee, employer: line.statutory.hdmfEmployer },
          ]}
        />
      </section>
      <section className="hrm-section">
        <h3 className="hrm-section-title">Withholding tax</h3>
        <MiniTable
          columns={[{ key: 'label', label: 'Item' }, { key: 'value', label: 'Value', align: 'right' }]}
          rows={[
            { key: 't1', label: 'Taxable gross', value: peso(line.basicPay + line.taxableEarnings + line.taxableBonus) },
            { key: 't2', label: 'Less non-taxable earnings and bonuses', value: signed(-(line.nonTaxableEarnings + line.nonTaxableBonus)) },
            { key: 't3', label: 'Less allowable statutory deductions', value: signed(-line.statutory.employeeTotal) },
            { key: 't4', label: 'Taxable income', value: peso(line.taxableIncome) },
            { key: 't5', label: 'Tax table applied', value: line.taxBasis },
            { key: 't6', label: 'Withholding tax', value: peso(line.withholdingTax) },
          ]}
        />
      </section>
    </>}

    {tab === 'deductions' && <>
      <section className="hrm-section">
        <h3 className="hrm-section-title">Deductions</h3>
        <p className="page-description">
          Collected in the order the REF-011 deduction hierarchy publishes. The Take-Home Pay policy protects {peso(line.takeHome.protectedMinimum)}
          {line.takeHome.deferred > 0 && `, so ${peso(line.takeHome.deferred)} was deferred to the next payroll`}.
        </p>
        <MiniTable
          columns={[
            { key: 'rank', label: 'Order' },
            { key: 'name', label: 'Deduction' },
            { key: 'kind', label: 'Type' },
            { key: 'source', label: 'Source module' },
            { key: 'due', label: 'Scheduled', align: 'right', render: row => peso(row.due) },
            { key: 'deducted', label: 'Collected', align: 'right', render: row => peso(row.deducted) },
            { key: 'deferred', label: 'Deferred', align: 'right', render: row => peso(row.deferred) },
            { key: 'remaining', label: 'Balance after', align: 'right', render: row => peso(row.remaining) },
          ]}
          rows={line.deductions.map((item, index) => ({ ...item, key: `ded-${index}` }))}
          empty="No company deductions on this line."
        />
      </section>
      <section className="hrm-section">
        <h3 className="hrm-section-title">Loans</h3>
        <MiniTable
          columns={[
            { key: 'name', label: 'Loan' },
            { key: 'kind', label: 'Type' },
            { key: 'source', label: 'Source module' },
            { key: 'outstanding', label: 'Balance before', align: 'right', render: row => peso(row.outstanding) },
            { key: 'due', label: 'Amortisation', align: 'right', render: row => peso(row.due) },
            { key: 'deducted', label: 'Collected', align: 'right', render: row => peso(row.deducted) },
            { key: 'remaining', label: 'Balance after', align: 'right', render: row => peso(row.remaining) },
          ]}
          rows={line.loans.map((item, index) => ({ ...item, key: `loan-${index}` }))}
          empty="No loan schedules are active for this employee."
        />
      </section>
    </>}

    {tab === 'attendance' && <section className="hrm-section">
      <h3 className="hrm-section-title">Timekeeping for {run.timekeepingStart} to {run.timekeepingEnd}</h3>
      <p className="page-description">Derived from the punch record. Correcting a punch and recalculating this transaction restates the line.</p>
      <div className="tk-summary-metrics">
        <div><span>Days covered</span><strong>{line.attendance.daysCovered}</strong></div>
        <div><span>Days rendered</span><strong>{line.attendance.daysWorked}</strong></div>
        <div><span>Absences</span><strong>{line.attendance.absentDays}</strong></div>
        <div><span>Late minutes</span><strong>{line.attendance.tardinessMinutes}</strong></div>
        <div><span>Undertime minutes</span><strong>{line.attendance.undertimeMinutes}</strong></div>
        <div><span>Overtime hours</span><strong>{line.attendance.overtimeHours}</strong></div>
        <div><span>Paid leave days</span><strong>{line.attendance.paidLeaveDays}</strong></div>
        <div><span>Unpaid leave days</span><strong>{line.attendance.unpaidLeaveDays}</strong></div>
      </div>
      <MiniTable
        columns={[
          { key: 'date', label: 'Date' },
          { key: 'status', label: 'Status' },
          { key: 'timeIn', label: 'Time in' },
          { key: 'timeOut', label: 'Time out' },
          { key: 'workedHours', label: 'Worked hours', align: 'right' },
          { key: 'tardinessMinutes', label: 'Late (min)', align: 'right' },
          { key: 'undertimeMinutes', label: 'Undertime (min)', align: 'right' },
          { key: 'overtimeHours', label: 'OT hours', align: 'right' },
          { key: 'overtimeStatus', label: 'OT status' },
          { key: 'leaveType', label: 'Leave type' },
        ]}
        rows={line.attendance.rows.map(row => ({ ...row, key: row.logId }))}
        empty="No punches fall inside this timekeeping cut-off."
      />
    </section>}

    {tab === 'payout' && <>
      <section className="hrm-section">
        <h3 className="hrm-section-title">Crediting instruction</h3>
        <MiniTable
          columns={[
            { key: 'bankName', label: 'Bank' },
            { key: 'accountNumber', label: 'Account number' },
            { key: 'percentOfNetPay', label: 'Share of net pay', render: row => `${row.percentOfNetPay}%` },
            { key: 'amount', label: 'Amount', align: 'right', render: row => peso(row.amount) },
          ]}
          rows={line.bankSplits.map((row, index) => ({ ...row, key: `split-${index}` }))}
          empty="No bank account is recorded on this employee's masterfile."
        />
      </section>
      <section className="hrm-section">
        <h3 className="hrm-section-title">Year to date</h3>
        <MiniTable
          columns={[
            { key: 'label', label: 'Balance' },
            { key: 'opening', label: 'Opening', align: 'right' },
            { key: 'thisRun', label: 'This run', align: 'right' },
            { key: 'closing', label: 'Closing', align: 'right' },
          ]}
          rows={[
            { key: 'y1', label: 'Taxable earnings', opening: peso(ytdOpening?.taxableEarnings), thisRun: peso(line.basicPay + line.taxableEarnings + line.taxableBonus), closing: peso((ytdOpening?.taxableEarnings || 0) + line.basicPay + line.taxableEarnings + line.taxableBonus) },
            { key: 'y2', label: 'Tax withheld', opening: peso(ytdOpening?.taxWithheld), thisRun: peso(line.withholdingTax), closing: peso((ytdOpening?.taxWithheld || 0) + line.withholdingTax) },
            { key: 'y3', label: 'SSS contributions', opening: peso(ytdOpening?.sss), thisRun: peso(line.statutory.sssEmployee), closing: peso((ytdOpening?.sss || 0) + line.statutory.sssEmployee) },
            { key: 'y4', label: 'PhilHealth contributions', opening: peso(ytdOpening?.philhealth), thisRun: peso(line.statutory.philhealthEmployee), closing: peso((ytdOpening?.philhealth || 0) + line.statutory.philhealthEmployee) },
            { key: 'y5', label: 'Pag-IBIG contributions', opening: peso(ytdOpening?.hdmf), thisRun: peso(line.statutory.hdmfEmployee), closing: peso((ytdOpening?.hdmf || 0) + line.statutory.hdmfEmployee) },
            { key: 'y6', label: 'Bonuses against the ₱90,000 ceiling', opening: peso(ytdOpening?.bonusPaid), thisRun: peso(line.nonTaxableBonus), closing: peso((ytdOpening?.bonusPaid || 0) + line.nonTaxableBonus) },
          ]}
        />
      </section>
    </>}

    {line.exceptions.length > 0 && <section className="hrm-section">
      <h3 className="hrm-section-title">Exceptions on this line</h3>
      <MiniTable
        columns={[{ key: 'severity', label: 'Severity' }, { key: 'message', label: 'Exception' }]}
        rows={line.exceptions.map((row, index) => ({ ...row, key: `exc-${index}` }))}
      />
    </section>}

    {payslipOpen && <PayslipModal line={line} run={run} employee={employee} onClose={() => setPayslipOpen(false)} />}
  </div>;
}

export { MiniTable, simple, DataTable };
