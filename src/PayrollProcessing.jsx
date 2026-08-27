/**
 * Payroll Processing (Annex C — Sub Module 3).
 *
 * The mock in `Payroll Processing.docx` is a register plus a two-step "Add
 * Payroll" form, which is the shape of the screen but not the shape of the
 * work: Annex C's own step list runs from prerequisites through creating a
 * transaction, importing timekeeping and HRM data, updating entries, review,
 * approval, posting, locking and reporting. This module implements that
 * process, and keeps the mock's register, wizard, per-employee edit modal,
 * record lock and success/failure messages where they fit it.
 *
 * Three screens:
 *   `register`  — every transaction, its status and the actions that status allows
 *   `wizard`    — create a transaction: details, computation switches, population, review
 *   `run`       — one transaction: employees, timekeeping, batches, exceptions,
 *                 reports, journal and bank file, approvals and audit
 *
 * The computation itself is not here. `payrollEngine.js` computes and
 * `payrollRuns.js` gathers the dependencies, so this file only ever renders a
 * result somebody else produced — which is what lets the same result be shown
 * to an employee on their payslip without a second calculation.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowClockwise, ArrowLeft, LockKey, Warning } from '@phosphor-icons/react';
import {
  DangerButton,
  DataTable,
  EmptyState,
  ExportMenu,
  FilterButton,
  FilterDrawer,
  GhostButton,
  Modal,
  PageHeading,
  PrimaryButton,
  SearchInput,
  SegmentedTabs,
  StatusTabs,
  Toasts,
  paginate,
  useTableState,
  useToasts,
} from './HRMKit.jsx';
import { MiniTable, PayrollLineDetail, peso } from './PayrollLineDetail.jsx';
import { downloadFile } from './fileDownload.js';
import { applyPayrollBatch, parsePayrollBatch, rollbackPayrollBatch } from './payrollBatch.js';
import { simpleTablePdf, spreadsheetXml } from './payrollExports.js';
import { readHrmData } from './hrmData.js';
import { readCalendars } from './CanonicalWorkspaces';
import { readActiveCompany, readActiveCompanyId, appendAuditEvent } from './companyRepository';
import { employeeRoster } from './employeeRoster.js';
import { readHierarchy, readPolicies } from './PolicyComputations';
import { readComputationLibrary, readReferences, resolveReferenceVersion } from './computationGovernance.js';
import { BINDABLE_MODULES } from './computationBindings.js';
import { toIsoDate } from './payrollEngine.js';
import { readServiceConfiguration } from './serviceModules.jsx';
import { synchronizePayrollReference } from './payrollIntegration.js';
import { minimumTakeHomeNotifications, notificationEventKeys, publishNotificationEvent, readNotificationRules } from './notificationServices';
import { readRequests } from './requestService.js';
import { REQUEST_STATUSES, REQUEST_TYPES } from './requestWorkflow.js';
import { useRole } from './RoleContext';
import { plural } from './textFormat';
import { policyAppliesToRun, policySelectionConflicts, policySnapshot, readManagedPolicies } from './policyManagement';
import {
  MONTHS,
  PAYROLL_STATUS_TABS,
  acquireLock,
  actionsFor,
  applyAction,
  buildPayrollContext,
  capabilitiesOf,
  defaultLockDate,
  lockHeldBy,
  newPayrollRun,
  nextTransactionNumber,
  payrollReportCatalog,
  readPayrollRuns,
  releaseLock,
  reportTotals,
  savePayrollRun,
  bankFileFor,
  journalFor,
} from './payrollRuns.js';

/** The Services Information modules whose records may bind a formula. */
const BINDABLE_MODULE_KEYS = Object.keys(BINDABLE_MODULES);

/**
 * Reference sources flattened to the version effective on a payout date.
 *
 * A binding resolves a row, not a source, so it needs the rows as they stood
 * when the run was paid — an August transaction must keep reading August's
 * ceiling after a new version is published in October.
 */
function referencesAsOf(references, payoutDate) {
  const asOf = toIsoDate(payoutDate);
  return references.map(item => {
    const version = resolveReferenceVersion(item, asOf || undefined) || item;
    return {
      code: item.code,
      name: item.name,
      version: version.version || item.version || '',
      entries: version.entries || item.entries || [],
    };
  });
}

const toCsv = (headers, rows) => [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
const sessionId = `payroll-session-${Math.random().toString(36).slice(2, 9)}`;
const money = (amount, currency = 'PHP') => new Intl.NumberFormat('en-PH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(Number(amount) || 0);

function downloadTable(format, filename, title, columns, rows) {
  if (format === 'PDF') {
    downloadFile(`${filename}.pdf`, simpleTablePdf(title, columns, rows), 'application/pdf');
  } else {
    downloadFile(`${filename}.xls`, spreadsheetXml(title, columns, rows), 'application/vnd.ms-excel');
  }
}

/**
 * The company's formula reference sources, with the module-owned rows (the
 * REF-011 deduction order, deduction and loan codes) resolved from the active
 * service modules rather than from a stale copy.
 */
function readReferenceEntries(companyId) {
  return readReferences(companyId).map(reference => ({
    ...reference,
    entries: synchronizePayrollReference(reference.code, reference.entries),
  }));
}

/* ------------------------------------------------------------------ shared */

function StatusBadge({ status }) {
  const tone = {
    Open: 'draft', Draft: 'draft', 'For Review': 'inactive', 'For Approval': 'inactive',
    Approved: 'active', Posted: 'active', Locked: 'locked', Cancelled: 'disabled',
  }[status] || 'draft';
  return <span className={`status-pill ${tone}`}>{status}</span>;
}

function Switch({ label, hint, checked, onChange, disabled }) {
  return <label className={`payroll-switch ${disabled ? 'disabled' : ''}`}>
    <input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={event => onChange(event.target.checked)} />
    <span className="payroll-switch-track"><span className="payroll-switch-thumb" /></span>
    <span className="payroll-switch-copy"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
  </label>;
}

function FieldRow({ label, required, hint, children }) {
  return <label className="payroll-field">
    <span>{label}{required && <em> *</em>}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>;
}

/* ---------------------------------------------------------------- register */

const REGISTER_COLUMNS = [
  { key: 'transactionNumber', label: 'Transaction No.' },
  { key: 'year', label: 'Year' },
  { key: 'month', label: 'Month' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'payrollType', label: 'Transaction Type' },
  { key: 'paymentMode', label: 'Payment Mode' },
  { key: 'currency', label: 'Currency' },
  { key: 'period', label: 'Payroll Period' },
  { key: 'timekeeping', label: 'Timekeeping Cut-off' },
  { key: 'payoutDate', label: 'Payout Date' },
  { key: 'remarks', label: 'Payout Remark' },
  { key: 'headcount', label: 'No. of Employees', align: 'right' },
  { key: 'netPay', label: 'Total Net Pay', align: 'right' },
  { key: 'status', label: 'Status' },
];

function RegisterScreen({ runs, onOpen, onCreate, onAction, onNotify, canCreate }) {
  const table = useTableState();
  const [tab, setTab] = useState('All');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const rows = useMemo(() => runs.map(run => ({
    id: run.id,
    run,
    transactionNumber: run.transactionNumber,
    year: run.year,
    month: run.month,
    frequency: run.frequency,
    payrollType: run.payrollType,
    paymentMode: run.paymentMode,
    currency: run.currency || 'PHP',
    period: run.periodStart ? `${run.periodStart} – ${run.periodEnd}` : '—',
    timekeeping: run.timekeepingStart ? `${run.timekeepingStart} – ${run.timekeepingEnd}` : '—',
    payoutDate: run.payoutDate || '—',
    remarks: run.remarks || '—',
    headcount: run.result?.totals.headcount ?? 0,
    netPay: run.result?.currency && run.result.currency !== 'PHP'
      ? `${money(run.result.settlementTotals?.netPay, run.result.currency)} (PHP ${peso(run.result.totals.netPay)})`
      : peso(run.result?.totals.netPay || 0),
    status: run.status,
  })), [runs]);

  const counts = useMemo(() => Object.fromEntries(PAYROLL_STATUS_TABS.map(status => [
    status, status === 'All' ? rows.length : rows.filter(row => row.status === status).length,
  ])), [rows]);

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return rows.filter(row => {
      if (tab !== 'All' && row.status !== tab) return false;
      if (term && !Object.values(row).some(value => String(value ?? '').toLowerCase().includes(term))) return false;
      return Object.entries(table.filters).every(([key, value]) => !value || String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase()));
    });
  }, [rows, tab, table.search, table.filters]);

  const totals = useMemo(() => ({
    headcount: filtered.reduce((sum, row) => sum + row.headcount, 0),
    netPay: peso(filtered.reduce((sum, row) => sum + (row.run.result?.totals.netPay || 0), 0)),
  }), [filtered]);

  const exportRows = format => {
    downloadTable(format, 'payroll-transactions', 'Payroll Transactions', REGISTER_COLUMNS.map(column => column.label), filtered.map(row => REGISTER_COLUMNS.map(column => row[column.key])));
    onNotify(`${filtered.length} ${plural(filtered.length, 'transaction')} exported.`);
  };

  return <>
    <div className="tk-kpi-row">
      <div className="tk-kpi-card"><span>Transactions</span><strong>{rows.length}</strong><small>this company</small></div>
      <div className="tk-kpi-card"><span>Open / Draft</span><strong>{counts.Open + counts.Draft}</strong><small>still editable or in draft</small></div>
      <div className="tk-kpi-card"><span>Awaiting decision</span><strong>{counts['For Review'] + counts['For Approval']}</strong><small>in review or approval</small></div>
      <div className="tk-kpi-card"><span>Posted</span><strong>{counts.Posted + counts.Locked}</strong><small>released to employees</small></div>
      <div className="tk-kpi-card"><span>Net pay in view</span><strong>{totals.netPay}</strong><small>{totals.headcount} employee {plural(totals.headcount, 'line')}</small></div>
    </div>

    <StatusTabs tabs={PAYROLL_STATUS_TABS} value={tab} onChange={setTab} counts={counts} />

    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search transactions..." />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        {canCreate && <PrimaryButton onClick={onCreate}>Create Transaction</PrimaryButton>}
        <ExportMenu onExport={exportRows} disabled={!filtered.length} />
      </div>
    </div>

    <DataTable
      columns={REGISTER_COLUMNS}
      rows={paginate(filtered, table.page, table.pageSize)}
      rowKey={row => row.id}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      total={filtered.length}
      empty="No payroll transaction has been created yet. Create one to begin the payroll process."
      renderCell={(row, column) => (column.key === 'status' ? <StatusBadge status={row.status} /> : row[column.key])}
      actions={row => [
        { label: capabilitiesOf(row.run).edit ? 'Update Entry' : 'View Transaction', kind: 'view', onSelect: () => onOpen(row.run) },
        ...actionsFor(row.run, runs, { canReopen: true })
          .filter(action => !['updateEntry'].includes(action.key))
          .map(action => ({
            label: action.label,
            kind: action.tone === 'danger' ? 'cancel' : 'edit',
            onSelect: () => (action.disabled ? onNotify(action.hint, 'bad') : onAction(row.run, action.key)),
          })),
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'year', label: 'Year', options: [...new Set(rows.map(row => String(row.year)))] },
        { key: 'month', label: 'Month', options: MONTHS },
        { key: 'payrollType', label: 'Transaction Type', options: ['Regular', 'Special', 'Override'] },
        { key: 'paymentMode', label: 'Payment Mode', options: ['Daily', 'Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly'] },
        { key: 'payoutDate', label: 'Payout Date', type: 'date' },
      ]}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </>;
}

/* ------------------------------------------------------------------ wizard */

const WIZARD_STEPS = ['Payroll details', 'Payroll computation', 'Employees', 'Review'];

const BONUS_TYPES = ['13th Month Pay', '14th Month Pay', 'Performance Bonus', 'Retention Bonus', 'Mid-year Bonus', 'Signing Bonus'];
const LEAVE_TYPES = ['Vacation Leave', 'Sick Leave', 'Service Incentive Leave'];

function CreateWizard({ runs, calendars, policies: managedPolicies, onCancel, onCreate }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(() => newPayrollRun({ runs, companyId: readActiveCompanyId() }));
  const monthNumber = MONTHS.indexOf(draft.month) + 1 || 1;
  const transactionNumber = nextTransactionNumber(runs, draft.year, monthNumber);
  const availablePolicies = useMemo(() => managedPolicies.filter(policy => draft.periodStart && draft.periodEnd ? policyAppliesToRun(policy, draft) : policy.status === 'Active'), [managedPolicies, draft.periodStart, draft.periodEnd, draft.payoutDate]);
  const selectedPolicies = useMemo(() => availablePolicies.filter(policy => (draft.appliedPolicies || []).some(applied => applied.policyId === policy.id)), [availablePolicies, draft.appliedPolicies]);
  const policyConflicts = useMemo(() => policySelectionConflicts(selectedPolicies), [selectedPolicies]);

  const set = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const setConfig = (key, value) => setDraft(previous => ({ ...previous, config: { ...previous.config, [key]: value } }));
  const setNested = (group, key, value) => setDraft(previous => ({ ...previous, config: { ...previous.config, [group]: { ...previous.config[group], [key]: value } } }));
  const setPopulation = (key, value) => setDraft(previous => ({ ...previous, population: { ...previous.population, [key]: value } }));

  // Choosing a payout from the calendar fills the period, cut-off and payout
  // date, exactly as Annex C 3.d describes — the calendar is the reference, so
  // these fields are never typed twice.
  const applyCalendar = code => {
    const calendar = calendars.find(row => row.calendarCode === code);
    set('calendarCode', code);
    if (!calendar) return;
    setDraft(previous => ({
      ...previous,
      calendarCode: code,
      year: Number(calendar.year) || previous.year,
      month: calendar.month || previous.month,
      frequency: calendar.frequency || previous.frequency,
      periodStart: calendar.periodStart || previous.periodStart,
      periodEnd: calendar.periodEnd || previous.periodEnd,
      timekeepingStart: calendar.cutoffStart || previous.timekeepingStart,
      timekeepingEnd: calendar.cutoffEnd || previous.timekeepingEnd,
      payoutDate: calendar.payoutDate || previous.payoutDate,
      lockDate: calendar.lockDate || defaultLockDate(calendar.payoutDate || previous.payoutDate),
      remarks: previous.remarks || calendar.remarks || '',
    }));
  };

  const eligible = useMemo(() => employeeRoster.filter(employee => employee.payroll.paymentMode === draft.paymentMode), [draft.paymentMode]);
  const included = eligible.filter(employee => !draft.population.excluded.includes(employee.employeeId));
  const excluded = eligible.filter(employee => draft.population.excluded.includes(employee.employeeId));

  const validate = () => {
    if (step === 0) {
      if (!draft.periodStart || !draft.periodEnd) return 'Payroll period start and end are required.';
      if (draft.periodEnd < draft.periodStart) return 'The payroll period end cannot fall before its start.';
      if (!draft.timekeepingStart || !draft.timekeepingEnd) return 'A timekeeping cut-off is required — the run prices attendance from it.';
      if (!draft.payoutDate) return 'A payout date is required; it selects the statutory version the run computes on.';
      if (draft.lockDate && draft.lockDate < draft.payoutDate) return 'The transaction lock date cannot fall before its payout date.';
      if (draft.currency !== 'PHP' && (!Number.isFinite(Number(draft.conversionRate)) || Number(draft.conversionRate) <= 0)) return `A positive ${draft.currency}-to-PHP conversion rate is required.`;
      if (!draft.remarks.trim()) return 'Remarks are required.';
      if (policyConflicts.length) return `${policyConflicts[0][0].policyCode} has overlapping active versions. Remove one policy or correct its effective period before continuing.`;
      if (draft.payrollType === 'Regular') {
        const openRegular = runs.find(run => run.payrollType === 'Regular' && !['Posted', 'Locked', 'Cancelled'].includes(run.status));
        if (openRegular) return `${openRegular.transactionNumber} is still ${openRegular.status}. The previous regular transaction must be posted before a new one is created.`;
      }
    }
    if (step === 1) {
      if (!draft.config.workDaysPerYear) return 'Work days per year is required — every rate is derived from it.';
      if (!draft.config.workHoursPerDay) return 'Work hours per day is required.';
    }
    if (step === 2 && !included.length) return 'At least one employee must be included in the transaction.';
    return '';
  };

  const next = () => {
    const message = validate();
    if (message) { setError(message); return; }
    setError('');
    if (step < WIZARD_STEPS.length - 1) setStep(step + 1);
    else onCreate({ ...draft, transactionNumber, multiCurrency: draft.currency !== 'PHP' });
  };

  const toggleExcluded = (employeeId, exclude) => setPopulation('excluded', exclude
    ? [...new Set([...draft.population.excluded, employeeId])]
    : draft.population.excluded.filter(id => id !== employeeId));

  const togglePolicy = policy => setDraft(previous => ({
    ...previous,
    appliedPolicies: (previous.appliedPolicies || []).some(item => item.policyId === policy.id)
      ? previous.appliedPolicies.filter(item => item.policyId !== policy.id)
      : [...(previous.appliedPolicies || []), policySnapshot(policy)],
  }));

  return <div className="payroll-wizard">
    <div className="wizard-steps">
      {WIZARD_STEPS.map((label, index) => <div key={label} className={index === step ? 'active' : index < step ? 'complete' : ''}>
        <span>{index + 1}</span><strong>{label}</strong>
      </div>)}
    </div>

    <div className="wizard-panel">
      {step === 0 && <>
        <div className="wizard-heading">
          <span>Step 1</span>
          <h3>Payroll details</h3>
          <p>The payout calendar is the reference for the period, the cut-off and the payout date. The payout date decides which statutory and tax version this run computes on.</p>
        </div>
        <div className="payroll-field-grid">
          <FieldRow label="Payroll calendar" hint="From Calendar Settings ▸ Payout calendars">
            <select value={draft.calendarCode} onChange={event => applyCalendar(event.target.value)}>
              <option value="">Select a payout — or enter the dates below</option>
              {calendars.map(row => <option key={row.calendarCode} value={row.calendarCode}>{row.calendarCode} · {row.month} {row.year} {row.frequency}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Payroll transaction type" required hint="Regular pays the cycle; Special covers bonus, final pay, adjustments and out-of-system payroll">
            <select value={draft.payrollType} onChange={event => {
              const value = event.target.value;
              setDraft(previous => ({ ...previous, payrollType: value, config: { ...previous.config, zeroBasicPay: value !== 'Regular', zeroVariableAllowance: value !== 'Regular' } }));
            }}>
              {['Regular', 'Special', 'Override'].map(value => <option key={value}>{value}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Transaction mode" hint="Only single-mode creation is supported: one payment mode, one cut-off, one tax table per transaction">
            <select value={draft.transactionMode} onChange={event => set('transactionMode', event.target.value)}>
              <option>Single</option>
            </select>
          </FieldRow>
          <FieldRow label="Payment mode" required hint="Only employees set up on this payment mode appear in the transaction">
            <select value={draft.paymentMode} onChange={event => set('paymentMode', event.target.value)}>
              {['Daily', 'Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly'].map(value => <option key={value}>{value}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Year" required><input type="number" value={draft.year} onChange={event => set('year', Number(event.target.value))} /></FieldRow>
          <FieldRow label="Month" required>
            <select value={draft.month} onChange={event => set('month', event.target.value)}>{MONTHS.map(value => <option key={value}>{value}</option>)}</select>
          </FieldRow>
          <FieldRow label="Frequency" required>
            <select value={draft.frequency} onChange={event => set('frequency', event.target.value)}>
              {['First Half', 'Second Half', 'Every Payroll', 'Weekly', 'Monthly'].map(value => <option key={value}>{value}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Payout / payment date" required hint="Selects the effective statutory and tax version"><input type="date" value={draft.payoutDate} onChange={event => setDraft(previous => ({ ...previous, payoutDate: event.target.value, lockDate: previous.lockDate || defaultLockDate(event.target.value) }))} /></FieldRow>
          <FieldRow label="Payroll period start" required><input type="date" value={draft.periodStart} onChange={event => set('periodStart', event.target.value)} /></FieldRow>
          <FieldRow label="Payroll period end" required><input type="date" value={draft.periodEnd} onChange={event => set('periodEnd', event.target.value)} /></FieldRow>
          <FieldRow label="Timekeeping cut-off start" required hint="Attendance is priced from the punches inside this window"><input type="date" value={draft.timekeepingStart} onChange={event => set('timekeepingStart', event.target.value)} /></FieldRow>
          <FieldRow label="Timekeeping cut-off end" required><input type="date" value={draft.timekeepingEnd} onChange={event => set('timekeepingEnd', event.target.value)} /></FieldRow>
          <FieldRow label="Transaction lock date" hint="After this date only a Super Admin can change the posted run"><input type="date" value={draft.lockDate} onChange={event => set('lockDate', event.target.value)} /></FieldRow>
          <FieldRow label="Currency">
            <select value={draft.currency} onChange={event => set('currency', event.target.value)}>{['PHP', 'USD', 'SGD', 'EUR'].map(value => <option key={value}>{value}</option>)}</select>
          </FieldRow>
          {draft.currency !== 'PHP' && <FieldRow label="Conversion rate to PHP" hint="Stored on the transaction so the historical rate stays reproducible">
            <input type="number" step="0.0001" value={draft.conversionRate} onChange={event => set('conversionRate', Number(event.target.value))} />
          </FieldRow>}
          <FieldRow label="Remarks" required><textarea value={draft.remarks} onChange={event => set('remarks', event.target.value)} placeholder="Describe this payout" /></FieldRow>
        </div>
        <fieldset className="payroll-fieldset policy-selection-fieldset">
          <legend>Applicable policies</legend>
          <p className="payroll-note">Select any number of Active policies. Atlas blocks overlapping versions of the same policy code and stores the selected versions on this transaction.</p>
          <div className="payroll-policy-list">
            {availablePolicies.map(policy => <label key={policy.id} className={(draft.appliedPolicies || []).some(item => item.policyId === policy.id) ? 'selected' : ''}>
              <input type="checkbox" checked={(draft.appliedPolicies || []).some(item => item.policyId === policy.id)} onChange={() => togglePolicy(policy)} />
              <span><strong>{policy.policyCode} · v{policy.version}</strong><small>{policy.subcategory} · {policy.effectiveFrom} – {policy.effectiveTo || 'Open-ended'}</small></span>
            </label>)}
          </div>
          {policyConflicts.length > 0 && <div className="wizard-error">Conflicting policy versions: {policyConflicts.map(([left, right]) => `${left.policyCode} v${left.version} / v${right.version}`).join(', ')}</div>}
        </fieldset>
      </>}

      {step === 1 && <>
        <div className="wizard-heading">
          <span>Step 2</span>
          <h3>Payroll computation</h3>
          <p>Each switch decides whether a whole family of computations runs. Where the 201 file also carries a switch, the employee's own setting still applies — turning a computation on here never overrides an employee excluded from it.</p>
        </div>

        <div className="payroll-field-grid">
          <FieldRow label="Work days per year (factor days)" required hint="Every derived rate reads this"><input type="number" value={draft.config.workDaysPerYear} onChange={event => setConfig('workDaysPerYear', Number(event.target.value))} /></FieldRow>
          <FieldRow label="Work hours per day" required><input type="number" value={draft.config.workHoursPerDay} onChange={event => setConfig('workHoursPerDay', Number(event.target.value))} /></FieldRow>
          <FieldRow label="Total hours in this period" hint="Fallback for hourly-paid employees with no timekeeping engagement"><input type="number" value={draft.config.hoursInPeriod} onChange={event => setConfig('hoursInPeriod', Number(event.target.value))} /></FieldRow>
          <FieldRow label="Total days in this period" hint="Fallback for daily-paid employees with no timekeeping engagement"><input type="number" value={draft.config.daysInPeriod} onChange={event => setConfig('daysInPeriod', Number(event.target.value))} /></FieldRow>
        </div>

        <fieldset className="payroll-fieldset">
          <legend>Statutory contributions</legend>
          <Switch label="Compute allowable deduction" hint="Ticked by default. Employees whose 201 file says no are still excluded." checked={draft.config.computeAllowableDeduction} onChange={value => setConfig('computeAllowableDeduction', value)} />
          <div className="payroll-checkrow">
            {[['sss', 'SSS'], ['sssWisp', 'SSS WISP / MPF'], ['philhealth', 'PhilHealth'], ['pagibig', 'Pag-IBIG']].map(([key, label]) => <label key={key}>
              <input type="checkbox" disabled={!draft.config.computeAllowableDeduction} checked={draft.config.statutoryAgencies[key]} onChange={event => setNested('statutoryAgencies', key, event.target.checked)} />
              {label}
            </label>)}
          </div>
          <FieldRow label="Collection schedule" hint="A monthly contribution can be split across cut-offs or taken whole on one of them">
            <select value={draft.config.statutorySchedule} onChange={event => setConfig('statutorySchedule', event.target.value)}>
              {['Every payroll (split)', 'First cutoff only', 'Second cutoff only'].map(value => <option key={value}>{value}</option>)}
            </select>
          </FieldRow>
        </fieldset>

        <fieldset className="payroll-fieldset">
          <legend>Basic pay and attendance</legend>
          <Switch label="Zero basic pay" hint="Pays earnings only. Unticked by default on a regular run, ticked on a special one." checked={draft.config.zeroBasicPay} onChange={value => setConfig('zeroBasicPay', value)} />
          <Switch label="Zero variable allowances" checked={draft.config.zeroVariableAllowance} onChange={value => setConfig('zeroVariableAllowance', value)} />
          <Switch label="Compute basic pay adjustment" hint="Pro-rates new hires, separations, salary increases and end-of-hold from their effective dates" checked={draft.config.computeBasicPayAdjustment} onChange={value => setConfig('computeBasicPayAdjustment', value)} />
          <Switch label="Compute overtime" hint="Approved overtime hours in the cut-off, at the premium for each type" checked={draft.config.computeOvertimeAdjustment} onChange={value => setConfig('computeOvertimeAdjustment', value)} />
          <div className="payroll-checkrow">
            {[['absences', 'Absences'], ['late', 'Tardiness'], ['undertime', 'Undertime']].map(([key, label]) => <label key={key}>
              <input type="checkbox" checked={draft.config.computeAttendanceAdjustment[key]} onChange={event => setNested('computeAttendanceAdjustment', key, event.target.checked)} />
              Compute {label}
            </label>)}
          </div>
        </fieldset>

        <fieldset className="payroll-fieldset">
          <legend>13th month pay and bonuses</legend>
          <Switch label="Compute 13th month pay / bonus" hint="Unticked by default" checked={draft.config.thirteenthMonth.enabled} onChange={value => setNested('thirteenthMonth', 'enabled', value)} />
          {draft.config.thirteenthMonth.enabled && <>
            <div className="payroll-field-grid">
              <FieldRow label="Basis" hint="A custom basis takes the uploaded amount and locks the bonus selection">
                <select value={draft.config.thirteenthMonth.basis} onChange={event => setNested('thirteenthMonth', 'basis', event.target.value)}>
                  <option>Pre-defined (Computational Basis)</option>
                  <option>Custom / uploaded value</option>
                </select>
              </FieldRow>
              <FieldRow label="Non-taxable threshold for the period" hint="₱90,000 is the statutory ceiling; 0 makes every bonus taxable">
                <input type="number" value={draft.config.thirteenthMonth.ntThreshold} onChange={event => setNested('thirteenthMonth', 'ntThreshold', Number(event.target.value))} />
              </FieldRow>
            </div>
            <div className="payroll-checkrow">
              {BONUS_TYPES.map(type => <label key={type}>
                <input
                  type="checkbox"
                  disabled={draft.config.thirteenthMonth.basis === 'Custom / uploaded value'}
                  checked={draft.config.thirteenthMonth.bonusTypes.includes(type)}
                  onChange={event => setNested('thirteenthMonth', 'bonusTypes', event.target.checked
                    ? [...draft.config.thirteenthMonth.bonusTypes, type]
                    : draft.config.thirteenthMonth.bonusTypes.filter(value => value !== type))}
                />
                {type}
              </label>)}
            </div>
            <p className="payroll-note">Bonuses consume the remaining ceiling in the order selected above, so the first type listed is covered first and any excess becomes taxable.</p>
          </>}
        </fieldset>

        <fieldset className="payroll-fieldset">
          <legend>Tax</legend>
          <Switch label="Compute tax" hint="Employees whose 201 file switches withholding tax off stay excluded" checked={draft.config.computeTax} onChange={value => setConfig('computeTax', value)} />
          <div className="payroll-field-grid">
            <FieldRow label="Tax formula type">
              <select value={draft.config.taxFormulaType} onChange={event => setConfig('taxFormulaType', event.target.value)}>
                <option>Government Table</option>
                <option>Custom Forecast Formula</option>
              </select>
            </FieldRow>
          </div>
          <Switch label="Compute final pay" hint="Brings in separated employees and puts them on the annualised tax table" checked={draft.config.computeFinalPay} onChange={value => setConfig('computeFinalPay', value)} />
          <Switch label="Gross up every employee" hint="Otherwise only employees tagged for gross-up in the 201 file are grossed up" checked={draft.config.grossUpAll} onChange={value => setConfig('grossUpAll', value)} />
        </fieldset>

        <fieldset className="payroll-fieldset">
          <legend>Leave conversion and reclassification</legend>
          <Switch label="Convert leave credits" hint="Converted days are deducted from the HRM balance" checked={draft.config.leaveConversion.enabled} onChange={value => setNested('leaveConversion', 'enabled', value)} />
          {draft.config.leaveConversion.enabled && <div className="payroll-checkrow">
            {LEAVE_TYPES.map(type => <label key={type}>
              <input type="checkbox" checked={draft.config.leaveConversion.leaveTypes.includes(type)} onChange={event => setNested('leaveConversion', 'leaveTypes', event.target.checked
                ? [...draft.config.leaveConversion.leaveTypes, type]
                : draft.config.leaveConversion.leaveTypes.filter(value => value !== type))} />
              {type}
            </label>)}
          </div>}
          <Switch label="Include earning reclassification and threshold utilisation" hint="Moves earnings between taxable and non-taxable against the remaining ceilings" checked={draft.config.reclassification.enabled} onChange={value => setNested('reclassification', 'enabled', value)} />
        </fieldset>

        <div className="payroll-field-grid">
          <FieldRow label="Payslip template">
            <select value={draft.config.payslipTemplate} onChange={event => setConfig('payslipTemplate', event.target.value)}>
              <option>Standard Atlas Payslip</option>
              <option>Compact Payslip</option>
              <option>Detailed Payslip with YTD</option>
            </select>
          </FieldRow>
        </div>
      </>}

      {step === 2 && <>
        <div className="wizard-heading">
          <span>Step 3</span>
          <h3>Employees</h3>
          <p>Only employees whose 201 file carries the <strong>{draft.paymentMode}</strong> payment mode can appear here. Move anyone who should not be paid this cycle to the excluded list.</p>
        </div>
        <div className="payroll-field-grid">
          <FieldRow label="Population">
            <select value={draft.population.mode} onChange={event => setPopulation('mode', event.target.value)}>
              <option>Active/Inactive in 201</option>
              <option>Selected Employees</option>
            </select>
          </FieldRow>
          <FieldRow label="Include employees on hold" hint="An employee with a hold date and no end date is otherwise left out">
            <label className="payroll-inline-check">
              <input type="checkbox" checked={draft.population.includeOnHold} onChange={event => setPopulation('includeOnHold', event.target.checked)} />
              Include on-hold employees
            </label>
          </FieldRow>
        </div>
        <div className="payroll-transfer">
          <div>
            <h4>Excluded ({excluded.length})</h4>
            <MiniTable
              columns={[
                { key: 'code', label: 'Employee' , render: row => `${row.code} · ${row.name}` },
                { key: 'status', label: 'Status', render: row => row.employmentStatus },
                { key: 'action', label: '', render: row => <button type="button" className="hrm-btn outline" onClick={() => toggleExcluded(row.employeeId, false)}>Include →</button> },
              ]}
              rows={excluded.map(employee => ({ ...employee, key: employee.employeeId }))}
              empty="Nobody is excluded."
            />
          </div>
          <div>
            <h4>Included ({included.length})</h4>
            <MiniTable
              columns={[
                { key: 'code', label: 'Employee', render: row => `${row.code} · ${row.name}` },
                { key: 'status', label: 'Status', render: row => row.employmentStatus },
                { key: 'action', label: '', render: row => <button type="button" className="hrm-btn outline" onClick={() => toggleExcluded(row.employeeId, true)}>← Exclude</button> },
              ]}
              rows={included.map(employee => ({ ...employee, key: employee.employeeId }))}
              empty="No employee is set up on this payment mode."
            />
          </div>
        </div>
        <p className="payroll-note">Eligibility is still checked per employee when the run computes: a separated employee needs Compute Final Pay, an on-hold employee needs the switch above, and a record tagged as a dummy is never paid.</p>
      </>}

      {step === 3 && <>
        <div className="wizard-heading">
          <span>Step 4</span>
          <h3>Review</h3>
          <p>Creating the transaction computes it immediately, so the figures can be checked before anything is drafted or posted.</p>
        </div>
        <div className="payroll-review">
          <section>
            <h4>Payroll details</h4>
            <MiniTable
              columns={[{ key: 'label', label: 'Field' }, { key: 'value', label: 'Value' }]}
              rows={[
                { key: 'r1', label: 'Transaction number', value: transactionNumber },
                { key: 'r2', label: 'Type / mode', value: `${draft.payrollType} · ${draft.transactionMode} · ${draft.paymentMode}` },
                { key: 'r3', label: 'Period', value: `${draft.periodStart} to ${draft.periodEnd}` },
                { key: 'r4', label: 'Timekeeping cut-off', value: `${draft.timekeepingStart} to ${draft.timekeepingEnd}` },
                { key: 'r5', label: 'Payout date', value: draft.payoutDate },
                { key: 'r6', label: 'Lock date', value: draft.lockDate || 'Not set' },
                { key: 'r7', label: 'Currency', value: `${draft.currency}${draft.currency === 'PHP' ? '' : ` at ${draft.conversionRate}`}` },
                { key: 'r8', label: 'Remarks', value: draft.remarks },
                { key: 'r9', label: 'Policies', value: draft.appliedPolicies?.length ? draft.appliedPolicies.map(policy => `${policy.code} v${policy.version}`).join(', ') : 'No optional policies selected' },
              ]}
            />
          </section>
          <section>
            <h4>Payroll computation</h4>
            <MiniTable
              columns={[{ key: 'label', label: 'Setting' }, { key: 'value', label: 'Value' }]}
              rows={[
                { key: 'c1', label: 'Factor days / hours per day', value: `${draft.config.workDaysPerYear} · ${draft.config.workHoursPerDay}` },
                { key: 'c2', label: 'Allowable deduction', value: draft.config.computeAllowableDeduction ? Object.entries(draft.config.statutoryAgencies).filter(([, on]) => on).map(([key]) => key.toUpperCase()).join(', ') : 'Not computed' },
                { key: 'c3', label: 'Collection schedule', value: draft.config.statutorySchedule },
                { key: 'c4', label: 'Zero basic pay', value: draft.config.zeroBasicPay ? 'Yes' : 'No' },
                { key: 'c5', label: '13th month / bonus', value: draft.config.thirteenthMonth.enabled ? `${draft.config.thirteenthMonth.bonusTypes.join(', ')} · ceiling ${peso(draft.config.thirteenthMonth.ntThreshold)}` : 'Not computed' },
                { key: 'c6', label: 'Tax', value: draft.config.computeTax ? draft.config.taxFormulaType : 'Not computed' },
                { key: 'c7', label: 'Final pay', value: draft.config.computeFinalPay ? 'Computed on the annualised table' : 'Not computed' },
                { key: 'c8', label: 'Employees', value: `${included.length} included, ${excluded.length} excluded` },
              ]}
            />
          </section>
        </div>
      </>}
    </div>

    {error && <div className="wizard-error">{error}</div>}

    <div className="wizard-actions hrm-toolbar end">
      <GhostButton onClick={step === 0 ? onCancel : () => { setError(''); setStep(step - 1); }}>{step === 0 ? 'Cancel' : 'Back'}</GhostButton>
      <button type="button" className="hrm-btn primary" onClick={next}>{step === WIZARD_STEPS.length - 1 ? 'Create transaction' : 'Next'}</button>
    </div>
  </div>;
}

/* --------------------------------------------------------------- run detail */

const RUN_TABS = [
  { key: 'employees', label: 'Employees' },
  { key: 'timekeeping', label: 'Timekeeping & HRM' },
  { key: 'batches', label: 'Batch uploads' },
  { key: 'exceptions', label: 'Exceptions' },
  { key: 'reports', label: 'Reports' },
  { key: 'accounting', label: 'Journal & bank file' },
  { key: 'audit', label: 'Approvals & audit' },
];

const EMPLOYEE_COLUMNS = [
  { key: 'employeeCode', label: 'Employee No.' },
  { key: 'name', label: 'Employee Name' },
  { key: 'department', label: 'Department' },
  { key: 'daysWorked', label: 'Days', align: 'right' },
  { key: 'basicPay', label: 'Basic Pay', align: 'right' },
  { key: 'attendance', label: 'Lates / Absences', align: 'right' },
  { key: 'overtime', label: 'Overtime', align: 'right' },
  { key: 'earnings', label: 'Earnings', align: 'right' },
  { key: 'bonus', label: 'Bonus', align: 'right' },
  { key: 'grossPay', label: 'Gross Pay', align: 'right' },
  { key: 'statutory', label: 'Statutory (EE)', align: 'right' },
  { key: 'tax', label: 'Withholding Tax', align: 'right' },
  { key: 'deductions', label: 'Deductions', align: 'right' },
  { key: 'loans', label: 'Loans', align: 'right' },
  { key: 'netPay', label: 'Net Pay', align: 'right' },
  { key: 'flags', label: 'Notes' },
];

/**
 * The mock's "Edit payroll" modal, as an override editor.
 *
 * An override is stored against the employee on the transaction rather than
 * written into the figures, so recalculating keeps it and the line can always
 * say which amounts were entered by hand.
 */
function EditLineModal({ line, run, onClose, onSave }) {
  const existing = run.overrides?.[line.employeeId] || {};
  const [draft, setDraft] = useState({
    zeroBasicPay: existing.zeroBasicPay ?? run.config.zeroBasicPay,
    computeAllowableDeduction: existing.computeAllowableDeduction ?? run.config.computeAllowableDeduction,
    computeFinalPay: existing.computeFinalPay ?? run.config.computeFinalPay,
    withholdingTax: existing.withholdingTax,
    earnings: existing.earnings || [],
    deductions: existing.deductions || [],
    bonuses: existing.bonuses || [],
  });
  const [confirming, setConfirming] = useState(false);

  const addRow = (group, row) => setDraft(previous => ({ ...previous, [group]: [...previous[group], row] }));
  const removeRow = (group, index) => setDraft(previous => ({ ...previous, [group]: previous[group].filter((_, position) => position !== index) }));
  const patchRow = (group, index, patch) => setDraft(previous => ({
    ...previous,
    [group]: previous[group].map((row, position) => (position === index ? { ...row, ...patch } : row)),
  }));

  if (confirming) {
    return <Modal
      title="Save changes"
      onClose={() => setConfirming(false)}
      width="sm"
      footer={<>
        <GhostButton onClick={() => setConfirming(false)}>Back</GhostButton>
        <button type="button" className="hrm-btn primary" onClick={() => onSave(draft)}>Save</button>
      </>}
    >
      <p className="hrm-modal-message">You are about to make some changes to this payroll line. Kindly verify all details before submitting — the transaction will be recalculated with them.</p>
    </Modal>;
  }

  return <Modal
    title="Edit payroll"
    onClose={onClose}
    width="lg"
    footer={<>
      <GhostButton onClick={onClose}>Cancel</GhostButton>
      <button type="button" className="hrm-btn primary" onClick={() => setConfirming(true)}>Save</button>
    </>}
  >
    <div className="payroll-edit">
      <p className="payroll-edit-name"><span>Employee name</span><strong>{line.name}</strong></p>

      <fieldset className="payroll-fieldset">
        <legend>Per-employee computation switches</legend>
        <Switch label="No computation of basic pay" hint="Zeroes basic pay for this employee only" checked={draft.zeroBasicPay} onChange={value => setDraft({ ...draft, zeroBasicPay: value })} />
        <Switch label="Compute allowable deduction" hint="Statutory contributions for this employee" checked={draft.computeAllowableDeduction} onChange={value => setDraft({ ...draft, computeAllowableDeduction: value })} />
        <Switch label="Compute final pay" hint="Puts this employee on the annualised tax table" checked={draft.computeFinalPay} onChange={value => setDraft({ ...draft, computeFinalPay: value })} />
      </fieldset>

      {run.payrollType === 'Override' && <fieldset className="payroll-fieldset">
        <legend>Override transaction tax</legend>
        <FieldRow label="Withholding tax" hint="Annex C permits this field only on an Override transaction">
          <input type="number" min="0" step="0.01" value={draft.withholdingTax ?? ''} onChange={event => setDraft({ ...draft, withholdingTax: event.target.value === '' ? undefined : Number(event.target.value) })} />
        </FieldRow>
      </fieldset>}

      {[
        { group: 'earnings', title: 'One-time earnings and allowances', blank: { code: 'MAN-ERN', name: '', classification: 'Taxable Allowance', amount: 0, frequency: 'One-time' }, classes: ['Taxable Allowance', 'Non-taxable', 'De Minimis', 'Reimbursement'] },
        { group: 'bonuses', title: 'One-time bonuses', blank: { name: '13th Month Pay', amount: 0 } },
        { group: 'deductions', title: 'One-time deductions and loan collections', blank: { code: 'MAN-DED', name: '', group: 'Deduction', kind: 'Company', due: 0, outstanding: 0, rank: 55, canAdjust: true, source: 'Encoded on the transaction' } },
      ].map(section => <fieldset key={section.group} className="payroll-fieldset">
        <legend>{section.title}</legend>
        <MiniTable
          columns={[
            { key: 'name', label: 'Pay item', render: row => <input value={row.name} placeholder="Name" onChange={event => patchRow(section.group, row.index, { name: event.target.value })} /> },
            ...(section.classes ? [{ key: 'classification', label: 'Classification', render: row => <select value={row.classification} onChange={event => patchRow(section.group, row.index, { classification: event.target.value })}>{section.classes.map(value => <option key={value}>{value}</option>)}</select> }] : []),
            { key: 'amount', label: 'Amount', align: 'right', render: row => <input type="number" step="0.01" value={section.group === 'deductions' ? row.due : row.amount} onChange={event => patchRow(section.group, row.index, section.group === 'deductions' ? { due: Number(event.target.value), outstanding: Number(event.target.value) } : { amount: Number(event.target.value) })} /> },
            { key: 'remove', label: '', render: row => <button type="button" className="hrm-btn outline" onClick={() => removeRow(section.group, row.index)}>Remove</button> },
          ]}
          rows={draft[section.group].map((row, index) => ({ ...row, index, key: `${section.group}-${index}` }))}
          empty="Nothing encoded."
        />
        <button type="button" className="hrm-btn outline" onClick={() => addRow(section.group, { ...section.blank })}>+ Add</button>
      </fieldset>)}

      <p className="payroll-edit-meta">
        <span>Last edited by</span><strong>{run.updatedBy || '—'}</strong>
        <span>Last edited on</span><strong>{run.updatedAt}</strong>
      </p>
    </div>
  </Modal>;
}

function RunDetail({ run, runs, context, hrmData, onBack, onAction, onNotify, onSaveOverride, actor }) {
  const [tab, setTab] = useState('employees');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [editing, setEditing] = useState(null);
  const [reportKey, setReportKey] = useState(payrollReportCatalog[0].key);
  const [remarksFor, setRemarksFor] = useState(null);
  const table = useTableState();
  const uploadRef = useRef(null);

  const capability = capabilitiesOf(run);
  const result = run.result;
  const lock = lockHeldBy(run, sessionId);
  const selectedLine = result?.lines.find(line => line.employeeId === selectedEmployeeId) || null;
  const selectedEmployee = employeeRoster.find(employee => employee.employeeId === selectedEmployeeId) || null;

  const rows = useMemo(() => (result?.lines || []).map(line => ({
    id: line.employeeId,
    line,
    employeeCode: line.employeeCode,
    name: line.name,
    department: line.department,
    daysWorked: line.status === 'Computed' ? line.attendance.daysWorked : '—',
    basicPay: line.status === 'Computed' ? peso(line.basicPay) : '—',
    attendance: line.status === 'Computed' ? peso(line.deductions.filter(item => item.kind === 'Attendance').reduce((sum, item) => sum + item.deducted, 0)) : '—',
    overtime: line.status === 'Computed' ? peso(line.earnings.filter(item => item.hours).reduce((sum, item) => sum + item.amount, 0)) : '—',
    earnings: line.status === 'Computed' ? peso(line.taxableEarnings + line.nonTaxableEarnings) : '—',
    bonus: line.status === 'Computed' ? peso(line.taxableBonus + line.nonTaxableBonus) : '—',
    grossPay: line.status === 'Computed' ? peso(line.grossPay) : '—',
    statutory: line.status === 'Computed' ? peso(line.statutory.employeeTotal) : '—',
    tax: line.status === 'Computed' ? peso(line.withholdingTax) : '—',
    deductions: line.status === 'Computed' ? peso(line.deductions.reduce((sum, item) => sum + item.deducted, 0)) : '—',
    loans: line.status === 'Computed' ? peso(line.loans.reduce((sum, item) => sum + item.deducted, 0)) : '—',
    netPay: line.status === 'Computed' ? peso(line.netPay) : '—',
    flags: line.status === 'Computed'
      ? [line.finalPay && 'Final pay', line.onHold && 'On hold', line.proration && 'Pro-rated', line.grossUp && 'Grossed up', run.overrides?.[line.employeeId] && 'Manually edited'].filter(Boolean).join(' · ') || '—'
      : line.exclusionReason,
  })), [result, run.overrides]);

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return rows.filter(row => !term || `${row.employeeCode} ${row.name} ${row.department}`.toLowerCase().includes(term));
  }, [rows, table.search]);

  const report = payrollReportCatalog.find(entry => entry.key === reportKey) || payrollReportCatalog[0];
  const reportRows = useMemo(() => (result ? report.build(result, context) : []), [result, report, context]);
  const reportTotalRow = useMemo(() => reportTotals(report, reportRows), [report, reportRows]);

  const exportReport = format => {
    downloadTable(format, `${run.transactionNumber}-${report.key}`, `${report.label} — ${run.transactionNumber}`, report.columns.map(column => column.label), reportRows.map(row => report.columns.map(column => row[column.key])));
    onNotify(`${report.label} exported for ${run.transactionNumber}.`);
  };

  const uploadBatch = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { entries: parsed, errors } = parsePayrollBatch(String(reader.result || ''), { employees: employeeRoster, payrollType: run.payrollType });
      onSaveOverride({
        batch: {
          id: `batch-${Date.now()}`,
          name: file.name,
          source: 'Manual upload',
          uploadedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
          uploadedBy: actor,
          rowCount: parsed.length,
          status: errors.length ? 'Rejected' : 'Validated',
          errors,
          committedAt: '',
          committedBy: '',
          entries: errors.length ? [] : parsed,
        },
      });
      onNotify(errors.length ? `${file.name} needs correction: ${errors[0]}` : `${file.name} validated — ${parsed.length} ${plural(parsed.length, 'row')} ready to commit.`, errors.length ? 'bad' : 'ok');
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // The dialogs belong to the whole screen, not to one of its views: the edit
  // modal is opened from the employee list *and* from the drill-down, so it has
  // to render in both — returning the drill-down early without it is what made
  // "Edit this line" do nothing.
  const dialogs = <>
    {editing && <EditLineModal
      line={editing}
      run={run}
      onClose={() => setEditing(null)}
      onSave={draft => { onSaveOverride({ employeeId: editing.employeeId, override: draft }); setEditing(null); }}
    />}
    {remarksFor && <RemarksModal
      action={remarksFor}
      onClose={() => setRemarksFor(null)}
      onConfirm={remarks => { onAction(run, remarksFor.key, remarks); setRemarksFor(null); }}
    />}
  </>;

  if (selectedLine) {
    return <>
      <PayrollLineDetail
        line={selectedLine}
        run={run}
        employee={selectedEmployee}
        ytdOpening={selectedEmployee?.ytd}
        canEdit={capability.edit}
        onEdit={() => setEditing(selectedLine)}
        onBack={() => setSelectedEmployeeId('')}
      />
      {dialogs}
    </>;
  }

  return <>
    {lock && <div className="payroll-lock-note">
      <LockKey weight="fill" />
      <span>This payroll entry is currently locked because another user is viewing or editing it — {lock.actor} since {new Date(lock.at).toLocaleTimeString()}.</span>
    </div>}

    <div className="payroll-run-head">
      <div>
        <div className="payroll-run-title">
          <h2>{run.transactionNumber}</h2>
          <StatusBadge status={run.status} />
          <span className="status-pill">{run.payrollType}</span>
          <span className="status-pill">{run.paymentMode}</span>
          <span className="status-pill">{run.currency || 'PHP'}</span>
        </div>
        <p className="page-description">
          {run.month} {run.year} · {run.frequency} · payroll period {run.periodStart} to {run.periodEnd} · timekeeping cut-off {run.timekeepingStart} to {run.timekeepingEnd} · payout {run.payoutDate}
          {run.lockDate && ` · locks ${run.lockDate}`}
        </p>
      </div>
      <div className="payroll-run-actions">
        {actionsFor(run, runs, { canReopen: true }).filter(action => action.key !== 'updateEntry').map(action => <button
          key={action.key}
          type="button"
          className={`hrm-btn ${action.tone === 'danger' ? 'danger' : action.key === 'recalculate' ? 'primary' : 'outline'}`}
          title={action.hint}
          disabled={action.disabled}
          onClick={() => {
            if (['reject', 'cancel', 'submitReview', 'submitApproval', 'approve'].includes(action.key)) { setRemarksFor(action); return; }
            onAction(run, action.key);
          }}
        >
          {action.key === 'recalculate' && <ArrowClockwise size={14} />}{action.label}
        </button>)}
      </div>
    </div>

    {result && <div className="tk-kpi-row">
      <div className="tk-kpi-card"><span>Employees paid</span><strong>{result.totals.headcount}</strong><small>{result.totals.excluded} excluded</small></div>
      <div className="tk-kpi-card"><span>Gross pay</span><strong>{peso(result.totals.grossPay)}</strong><small>basic {peso(result.totals.basicPay)}</small></div>
      <div className="tk-kpi-card"><span>Statutory (EE)</span><strong>{peso(result.totals.statutoryEmployee)}</strong><small>employer {peso(result.totals.statutoryEmployer)}</small></div>
      <div className="tk-kpi-card"><span>Withholding tax</span><strong>{peso(result.totals.withholdingTax)}</strong></div>
      <div className="tk-kpi-card"><span>Deductions & loans</span><strong>{peso(result.totals.deductions + result.totals.loans)}</strong><small>{peso(result.totals.deferred)} deferred</small></div>
      <div className="tk-kpi-card"><span>Net pay</span><strong className="tone-up">{result.currency !== 'PHP' ? money(result.settlementTotals.netPay, result.currency) : peso(result.totals.netPay)}</strong><small>{result.currency !== 'PHP' ? `PHP base ${peso(result.totals.netPay)} · rate ${result.conversionRate}` : `employer cost ${peso(result.totals.employerCost)}`}</small></div>
    </div>}

    {!result && <EmptyState title="This transaction has not been computed yet" icon={Warning}>Use Recalculate to compute it against the current masterfile, timekeeping and configuration.</EmptyState>}

    <SegmentedTabs tabs={RUN_TABS} value={tab} onChange={setTab} ariaLabel="Transaction" />

    {tab === 'employees' && result && <>
      <div className="hrm-toolbar">
        <div className="hrm-toolbar-left"><SearchInput value={table.search} onChange={table.setSearch} placeholder="Search employees..." /></div>
        <div className="hrm-toolbar-right">
          <ExportMenu onExport={format => {
            downloadTable(format, `${run.transactionNumber}-employees`, `${run.transactionNumber} Employee Payroll Lines`, EMPLOYEE_COLUMNS.map(column => column.label), filtered.map(row => EMPLOYEE_COLUMNS.map(column => row[column.key])));
            onNotify('Employee list exported.');
          }} />
        </div>
      </div>
      <DataTable
        columns={EMPLOYEE_COLUMNS}
        rows={paginate(filtered, table.page, table.pageSize)}
        rowKey={row => row.id}
        page={table.page}
        pageSize={table.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        total={filtered.length}
        renderCell={(row, column) => (column.key === 'name'
          ? <button type="button" className="table-link" onClick={() => setSelectedEmployeeId(row.id)}>{row.name}</button>
          : row[column.key])}
        actions={row => [
          { label: 'View payroll result', kind: 'view', onSelect: () => setSelectedEmployeeId(row.id) },
          ...(capability.edit && row.line.status === 'Computed' ? [{ label: 'Edit payroll', kind: 'edit', onSelect: () => setEditing(row.line) }] : []),
        ]}
      />
    </>}

    {tab === 'timekeeping' && <section className="hrm-section">
      <h3 className="hrm-section-title">Timekeeping and HRM data for this transaction</h3>
      <p className="page-description">
        Imported from the punch record for {run.timekeepingStart} to {run.timekeepingEnd}. Nothing is copied into the transaction — the run reads the punches directly, so a corrected punch changes the payroll line the next time it is recalculated.
      </p>
      <MiniTable
        columns={[
          { key: 'name', label: 'Employee' },
          { key: 'daysCovered', label: 'Days covered', align: 'right' },
          { key: 'daysWorked', label: 'Days rendered', align: 'right' },
          { key: 'absentDays', label: 'Absences', align: 'right' },
          { key: 'tardinessMinutes', label: 'Late (min)', align: 'right' },
          { key: 'undertimeMinutes', label: 'Undertime (min)', align: 'right' },
          { key: 'overtimeHours', label: 'Approved OT hours', align: 'right' },
          { key: 'paidLeaveDays', label: 'Paid leave', align: 'right' },
          { key: 'unpaidLeaveDays', label: 'Unpaid leave', align: 'right' },
        ]}
        rows={(result?.lines || []).filter(line => line.status === 'Computed').map(line => ({ key: line.employeeId, name: line.name, ...line.attendance }))}
        empty="Recalculate the transaction to import timekeeping."
      />
      <h3 className="hrm-section-title">HRM records feeding this run</h3>
      <MiniTable
        columns={[
          { key: 'employeeName', label: 'Employee' },
          { key: 'loanName', label: 'Loan' },
          { key: 'loanType', label: 'Type' },
          { key: 'deductionAmount', label: 'Amortisation', align: 'right', render: row => peso(row.deductionAmount) },
          { key: 'balance', label: 'Outstanding', align: 'right', render: row => peso(row.balance) },
          { key: 'authority', label: 'Authority to deduct', render: row => (row.authorityToDeduct?.acknowledged === false ? 'Not acknowledged' : 'Acknowledged') },
          { key: 'status', label: 'Status' },
        ]}
        rows={(hrmData.loanInquiries || []).map(row => ({ ...row, key: row.id, employeeName: employeeRoster.find(employee => employee.employeeId === row.employeeId)?.name || '—' }))}
        empty="No loan schedules are recorded in HRM."
      />
    </section>}

    {tab === 'batches' && <section className="hrm-section">
      <div className="hrm-toolbar">
        <div className="hrm-toolbar-left"><h3 className="hrm-section-title">Batch uploads</h3></div>
        <div className="hrm-toolbar-right">
          <GhostButton onClick={() => {
            downloadFile('payroll-batch-template.csv', 'Employee Code,Pay Item Type,Pay Item,Amount\n0011223345,Earning,Sample allowance,0\n', 'text/csv');
            onNotify('Batch template downloaded.');
          }}>Download template</GhostButton>
          <button type="button" className="hrm-btn outline" disabled={!capability.edit} onClick={() => uploadRef.current?.click()}>Upload batch</button>
          <input ref={uploadRef} type="file" accept=".csv" hidden onChange={uploadBatch} />
        </div>
      </div>
      <p className="page-description">A batch is validated before it is committed, and a committed batch can be rolled back while the transaction is still open — which is exactly the condition Annex C's rollback rules set.</p>
      <MiniTable
        columns={[
          { key: 'name', label: 'Batch name' },
          { key: 'source', label: 'Source' },
          { key: 'uploadedAt', label: 'Date uploaded' },
          { key: 'uploadedBy', label: 'Uploaded by' },
          { key: 'rowCount', label: 'Rows', align: 'right' },
          { key: 'status', label: 'Status' },
          { key: 'committedAt', label: 'Date committed' },
          { key: 'committedBy', label: 'Committed by' },
          { key: 'errors', label: 'Errors', render: row => (row.errors?.length ? row.errors[0] : '—') },
          {
            key: 'actions',
            label: 'Actions',
            render: row => <span className="payroll-batch-actions">
              {row.status === 'Validated' && capability.edit && <button type="button" className="hrm-btn outline" onClick={() => onSaveOverride({ commitBatch: row.id })}>Commit</button>}
              {row.status === 'Committed' && capability.edit && row.uploadedBy === actor && <button type="button" className="hrm-btn outline" onClick={() => onSaveOverride({ rollbackBatch: row.id })}>Rollback</button>}
              {row.errors?.length > 0 && <button type="button" className="hrm-btn outline" onClick={() => downloadFile(`${row.name}-errors.txt`, row.errors.join('\n'), 'text/plain')}>Download errors</button>}
            </span>,
          },
        ]}
        rows={(run.batches || []).map(row => ({ ...row, key: row.id }))}
        empty="No batch has been uploaded to this transaction."
      />
    </section>}

    {tab === 'exceptions' && <section className="hrm-section">
      <h3 className="hrm-section-title">Exceptions</h3>
      <p className="page-description">Everything this run flagged while computing. An exception is not an error — it records a decision the configuration made, so a reviewer can confirm it was intended.</p>
      <MiniTable
        columns={[
          { key: 'name', label: 'Employee' },
          { key: 'severity', label: 'Severity' },
          { key: 'message', label: 'Exception' },
        ]}
        rows={(result?.exceptions || []).map((row, index) => ({ ...row, key: `exc-${index}` }))}
        empty="No exceptions were raised."
      />
    </section>}

    {tab === 'reports' && result && <section className="hrm-section">
      <div className="hrm-toolbar">
        <div className="hrm-toolbar-left">
          <label className="payroll-field inline">
            <span>Report</span>
            <select value={reportKey} onChange={event => setReportKey(event.target.value)}>
              {Object.entries(payrollReportCatalog.reduce((groups, entry) => ({ ...groups, [entry.group]: [...(groups[entry.group] || []), entry] }), {}))
                .map(([group, entries]) => <optgroup key={group} label={group}>
                  {entries.map(entry => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
                </optgroup>)}
            </select>
          </label>
        </div>
        <div className="hrm-toolbar-right"><ExportMenu onExport={exportReport} disabled={!reportRows.length} /></div>
      </div>
      <p className="page-description">{report.description} · Transaction status: <strong>{run.status}</strong></p>
      <DataTable
        columns={report.columns}
        rows={reportRows}
        rowKey={row => row.key}
        page={1}
        pageSize={Math.max(reportRows.length, 1)}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        total={reportRows.length}
        renderCell={(row, column) => (column.money ? peso(row[column.key]) : row[column.key])}
        footerRow={reportTotalRow ? Object.fromEntries(report.columns.map(column => [column.key, column.money ? peso(reportTotalRow[column.key]) : reportTotalRow[column.key]])) : undefined}
        empty="This report has no rows for the transaction."
      />
    </section>}

    {tab === 'accounting' && result && <>
      <section className="hrm-section">
        <h3 className="hrm-section-title">Journal entry</h3>
        {(() => {
          const journal = journalFor(result, context.registers?.payCodes || []);
          return <>
            <p className="page-description">Generated from the pay codes' GL mapping. Debits {peso(journal.debit)} · credits {peso(journal.credit)} — <strong>{journal.balanced ? 'balanced' : 'out of balance'}</strong>.</p>
            <MiniTable
              columns={[
                { key: 'account', label: 'GL account' },
                { key: 'description', label: 'Description' },
                { key: 'debit', label: 'Debit', align: 'right', render: row => (row.debit ? peso(row.debit) : '—') },
                { key: 'credit', label: 'Credit', align: 'right', render: row => (row.credit ? peso(row.credit) : '—') },
              ]}
              rows={journal.entries.map((row, index) => ({ ...row, key: `je-${index}` }))}
            />
          </>;
        })()}
      </section>
      <section className="hrm-section">
        <div className="hrm-toolbar">
          <div className="hrm-toolbar-left"><h3 className="hrm-section-title">Bank file</h3></div>
          <div className="hrm-toolbar-right">
            <GhostButton onClick={() => {
              const file = bankFileFor(result);
              downloadFile(`${run.transactionNumber}-bank-file.csv`, toCsv(['Employee Code', 'Name', 'Bank', 'Account Number', 'Share', 'Currency', 'Amount', 'PHP Base Amount'], file.map(row => [row.employeeCode, row.name, row.bankName, row.accountNumber, row.share, row.currency, row.amount, row.baseAmount])), 'text/csv');
              onNotify('Bank file generated.');
            }}>Download bank file</GhostButton>
          </div>
        </div>
        <p className="page-description">One row per crediting instruction, which is per bank account and not per employee — an employee who splits their net pay produces two rows.</p>
        <MiniTable
          columns={[
            { key: 'employeeCode', label: 'Employee No.' },
            { key: 'name', label: 'Employee Name' },
            { key: 'bankName', label: 'Bank' },
            { key: 'accountNumber', label: 'Account number' },
            { key: 'share', label: 'Share' },
            { key: 'currency', label: 'Currency' },
            { key: 'amount', label: 'Amount', align: 'right', render: row => money(row.amount, row.currency) },
            ...(result.currency !== 'PHP' ? [{ key: 'baseAmount', label: 'PHP Base Amount', align: 'right', render: row => peso(row.baseAmount) }] : []),
          ]}
          rows={bankFileFor(result).map((row, index) => ({ ...row, key: `bank-${index}` }))}
        />
      </section>
    </>}

    {tab === 'audit' && <>
      <section className="hrm-section">
        <h3 className="hrm-section-title">Review and approval</h3>
        <MiniTable
          columns={[
            { key: 'level', label: 'Level' },
            { key: 'actor', label: 'Actor' },
            { key: 'decision', label: 'Decision' },
            { key: 'remarks', label: 'Remarks' },
            { key: 'at', label: 'Timestamp' },
          ]}
          rows={(run.approvals || []).map((row, index) => ({ ...row, key: `ap-${index}` }))}
          empty="This transaction has not entered review yet."
        />
      </section>
      <section className="hrm-section">
        <h3 className="hrm-section-title">Change log</h3>
        <MiniTable
          columns={[
            { key: 'at', label: 'Timestamp' },
            { key: 'actor', label: 'Actor' },
            { key: 'action', label: 'Action' },
            { key: 'detail', label: 'Detail' },
          ]}
          rows={(run.audit || []).map((row, index) => ({ ...row, key: `au-${index}` }))}
          empty="Nothing has happened to this transaction yet."
        />
      </section>
    </>}

    {dialogs}
  </>;
}

function RemarksModal({ action, onClose, onConfirm }) {
  const [remarks, setRemarks] = useState('');
  const destructive = action.tone === 'danger';
  return <Modal
    title={action.label}
    onClose={onClose}
    width="sm"
    footer={<>
      <GhostButton onClick={onClose}>Back</GhostButton>
      {destructive
        ? <DangerButton onClick={() => onConfirm(remarks)}>{action.label}</DangerButton>
        : <button type="button" className="hrm-btn primary" onClick={() => onConfirm(remarks)}>{action.label}</button>}
    </>}
  >
    <p className="hrm-modal-message">{action.hint}</p>
    <label className="payroll-field"><span>Remarks</span><textarea value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Recorded on the approval trail" /></label>
  </Modal>;
}

/* --------------------------------------------------------------- workspace */

/**
 * `readRegister` comes from the dispatcher rather than being imported, because
 * `OperationalWorkspaces` already imports this component to register it — taking
 * the reader as a prop keeps the dependency pointing one way.
 */
export function PayrollProcessingWorkspace({ companyId: scopedCompanyId, onBack, notify, readRegister = () => [] }) {
  const { role } = useRole();
  const companyId = scopedCompanyId || readActiveCompanyId();
  const company = readActiveCompany();
  const { toasts, push, dismiss } = useToasts();
  const [runs, setRuns] = useState(() => readPayrollRuns(companyId));
  const [view, setView] = useState('register');
  const [openRunId, setOpenRunId] = useState('');

  const actor = role === 'pa_admin' || role === 'admin' ? 'P&A Admin' : 'Client Admin';
  const canCreate = ['pa_admin', 'admin', 'client_admin'].includes(role);

  const hrmData = useMemo(() => readHrmData(companyId), [companyId]);
  const calendars = useMemo(() => readCalendars(companyId, 'Payout'), [companyId]);
  const registers = useMemo(() => ({
    earnings: readRegister('earnings', companyId),
    deductions: readRegister('deductions', companyId),
    bonuses: readRegister('bonuses', companyId),
    payCodes: readRegister('payCodes', companyId),
  }), [companyId, readRegister]);
  const hierarchy = useMemo(() => readHierarchy(readReferenceEntries(companyId)), [companyId]);
  const policies = useMemo(() => readPolicies(companyId), [companyId]);
  const managedPolicies = useMemo(() => readManagedPolicies(companyId), [companyId]);
  const staggeredRequests = useMemo(() => readRequests(companyId, { activeCompanyId: companyId }).filter(request => request.requestType === REQUEST_TYPES.STAGGERED_PAYMENT && request.status === REQUEST_STATUSES.APPROVED), [companyId]);
  // The company's own Computational Basis: the Atlas standards applied to this
  // company with its own activation decisions, plus its company-defined codes.
  const computations = useMemo(() => readComputationLibrary(companyId), [companyId]);
  // The Services Information configurations that bind one of those formulas —
  // an earning type, an allowance, a deduction, a bonus or a loan that says
  // which computation produces its amount and where each variable comes from.
  const serviceConfig = useMemo(() => Object.fromEntries(BINDABLE_MODULE_KEYS
    .map(key => [key, readServiceConfiguration(key, companyId)])), [companyId]);
  // Bindings resolve reference rows at the version effective on the payout
  // date, so the sources travel with their whole version history.
  const references = useMemo(() => readReferences(companyId).filter(item => item.enabled !== false), [companyId]);

  const openRun = runs.find(run => run.id === openRunId) || null;
  const contextFor = run => buildPayrollContext({
    companyId, run, hrmData, registers, hierarchy, policies, computations, staggeredRequests,
    serviceConfig,
    references: referencesAsOf(references, run?.payoutDate),
  });

  // Holding the transaction open takes the record lock the mock warns about,
  // and leaving the screen releases it. Both ends re-read the stored run rather
  // than writing back the snapshot this effect captured: the transaction is
  // recalculated and re-saved while the screen is open, so releasing a stale
  // copy on the way out would discard everything that happened in between.
  useEffect(() => {
    if (!openRunId) return undefined;
    const stored = readPayrollRuns(companyId).find(run => run.id === openRunId);
    if (!stored) return undefined;
    setRuns(savePayrollRun(companyId, acquireLock(stored, sessionId, actor)).slice());
    return () => {
      const current = readPayrollRuns(companyId).find(run => run.id === openRunId);
      if (current) setRuns(savePayrollRun(companyId, releaseLock(current, sessionId)).slice());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRunId]);

  const toast = (message, tone = 'ok') => { push(message, tone); notify?.({ type: tone === 'ok' ? 'success' : 'error', message }); };

  const commit = next => { setRuns(savePayrollRun(companyId, next).slice()); return next; };
  const publishTakeHomeWarnings = run => minimumTakeHomeNotifications({ run, result: run.result, rules: readNotificationRules(companyId) }).forEach(event => publishNotificationEvent({ eventKey: notificationEventKeys.MinimumTakeHomePayRisk, companyId, actor: 'Payroll Engine', ...event }));

  const handleAction = (run, actionKey, remarks = '') => {
    const outcome = applyAction(run, actionKey, { actor, remarks, runs, context: contextFor(run) });
    if (outcome.error) { toast(outcome.error, 'bad'); return; }
    if (actionKey === 'generateBankFile') {
      const file = bankFileFor(outcome.run.result);
      downloadFile(`${run.transactionNumber}-bank-file.csv`, toCsv(['Employee Code', 'Name', 'Bank', 'Account Number', 'Share', 'Currency', 'Amount', 'PHP Base Amount'], file.map(row => [row.employeeCode, row.name, row.bankName, row.accountNumber, row.share, row.currency, row.amount, row.baseAmount])), 'text/csv');
    }
    commit(outcome.run);
    if (actionKey === 'recalculate') publishTakeHomeWarnings(outcome.run);
    toast(outcome.message);
    appendAuditEvent?.({ entity: 'Payroll Transaction', entityId: run.transactionNumber, action: actionKey, actor, detail: outcome.message });
    if (actionKey === 'post') {
      publishNotificationEvent?.({ eventKey: 'PayrollPosted', companyId, correlationId: run.id, summary: outcome.message, actor });
    }
  };

  const handleCreate = draft => {
    const created = { ...draft, companyId, createdBy: actor, updatedBy: actor };
    const outcome = applyAction(created, 'recalculate', { actor, runs, context: contextFor(created) });
    const stored = outcome.error ? created : outcome.run;
    commit(stored);
    if (!outcome.error) publishTakeHomeWarnings(stored);
    setOpenRunId(stored.id);
    setView('run');
    toast(outcome.error ? `${stored.transactionNumber} created, but it could not be computed: ${outcome.error}` : `${stored.transactionNumber} created and computed. ${outcome.message}`, outcome.error ? 'bad' : 'ok');
  };

  const handleOverride = payload => {
    if (!openRun) return;
    let next = openRun;
    if (payload.employeeId) {
      next = { ...next, overrides: { ...(next.overrides || {}), [payload.employeeId]: payload.override } };
    }
    if (payload.batch) next = { ...next, batches: [payload.batch, ...(next.batches || [])] };
    if (payload.commitBatch) {
      const batch = (next.batches || []).find(row => row.id === payload.commitBatch);
      if (!batch) { toast('The selected batch no longer exists.', 'bad'); return; }
      const overrides = applyPayrollBatch(next.overrides || {}, batch.entries || [], employeeRoster, batch.name);
      next = {
        ...next,
        overrides,
        batches: next.batches.map(row => (row.id === payload.commitBatch ? { ...row, status: 'Committed', committedAt: new Date().toISOString().slice(0, 19).replace('T', ' '), committedBy: actor } : row)),
      };
      toast(`${batch?.name} committed to the transaction.`);
    }
    if (payload.rollbackBatch) {
      const batch = (next.batches || []).find(row => row.id === payload.rollbackBatch);
      if (!batch) { toast('The selected batch no longer exists.', 'bad'); return; }
      if (batch.uploadedBy !== actor) { toast(`Only ${batch.uploadedBy} can roll back this uploaded batch.`, 'bad'); return; }
      const overrides = rollbackPayrollBatch(next.overrides || {}, batch.name);
      next = {
        ...next,
        overrides,
        batches: next.batches.map(row => (row.id === payload.rollbackBatch ? { ...row, status: 'Rolled back', committedAt: '', committedBy: '' } : row)),
      };
      toast(`${batch?.name} rolled back.`);
    }
    const outcome = applyAction(next, 'recalculate', { actor, runs, context: contextFor(next) });
    commit(outcome.error ? next : outcome.run);
    if (payload.employeeId) toast('Payroll changes saved and the transaction recalculated.');
  };

  return <div className="page-content payroll-processing">
    <button className="inline-back" onClick={view === 'register' ? onBack : () => { setView('register'); setOpenRunId(''); }}>
      <ArrowLeft /> {view === 'register' ? 'Back to Payroll' : 'Back to Payroll Processing'}
    </button>

    <PageHeading
      eyebrow={company?.displayName || 'ABC Company Ltd'}
      title={view === 'wizard' ? 'Add Payroll' : 'Payroll Processing'}
      info="Create, compute, review, approve, post and lock payroll transactions. Every figure is traced to the module that owns it."
    />

    {view === 'register' && <RegisterScreen
      runs={runs}
      canCreate={canCreate}
      onCreate={() => setView('wizard')}
      onOpen={run => { setOpenRunId(run.id); setView('run'); }}
      onAction={handleAction}
      onNotify={toast}
    />}

    {view === 'wizard' && <CreateWizard
      runs={runs}
      calendars={calendars}
      policies={managedPolicies}
      onCancel={() => setView('register')}
      onCreate={handleCreate}
    />}

    {view === 'run' && openRun && <RunDetail
      run={openRun}
      runs={runs}
      context={contextFor(openRun)}
      hrmData={hrmData}
      actor={actor}
      onBack={() => setView('register')}
      onAction={handleAction}
      onNotify={toast}
      onSaveOverride={handleOverride}
    />}

    <Toasts toasts={toasts} onDismiss={dismiss} />
  </div>;
}

export default PayrollProcessingWorkspace;
