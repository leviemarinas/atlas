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
import { MiniTable, PayrollLineDetail, payslipTemplates, peso } from './PayrollLineDetail.jsx';
import { downloadFile } from './fileDownload.js';
import { applyPayrollBatch, parsePayrollBatch, rollbackPayrollBatch } from './payrollBatch.js';
import { simpleTablePdf, spreadsheetXml } from './payrollExports.js';
import { readHrmData, updateHrmData } from './hrmData.js';
import { readCalendars } from './CanonicalWorkspaces';
import { readActiveCompany, readActiveCompanyId, appendAuditEvent } from './companyRepository';
import { employeeRoster } from './employeeRoster.js';
import { readHierarchy, readPolicies } from './PolicyComputations';
import { readComputationLibrary, readReferences, resolveReferenceVersion } from './computationGovernance.js';
import { BINDABLE_MODULES } from './computationBindings.js';
import { toIsoDate, STATUTORY_OVERRIDE_LABELS, STATUTORY_MAX_FIRST } from './payrollEngine.js';
import { readServiceConfiguration } from './serviceModules.jsx';
import { payItemKey } from './payrollEngine.js';
import { effectiveStatutorySet } from './statutoryService';
import { cancelCorrection, markCorrectionsApplied, raiseCorrection, readCorrections, writeCorrections } from './payrollCorrections.js';

/** The tax and statutory table versions a payout date resolves to. */
/** A payout calendar by what it is — month, year and cut — never by its code. */
function calendarName(row) {
  const name = [row.month && row.year ? `${row.month} ${row.year}` : '', row.frequency].filter(Boolean).join(' · ');
  return name || row.calendarCode;
}

function tablesFor(payoutDate) {
  if (!payoutDate) return [];
  const set = effectiveStatutorySet(payoutDate);
  return [['Tax (compensation)', set.tax], ['Tax (annual)', set.annualTax], ['SSS', set.sss], ['PhilHealth', set.philhealth], ['Pag-IBIG', set.pagibig]]
    .filter(([, version]) => version).map(([label, version]) => ({ label, code: version.code, effectiveDate: version.effectiveDate }));
}
import { MAX_RUN_CURRENCIES, availableCurrencies, currencyDecimals, currencySymbol, formatCurrency, runCurrenciesOf, runCurrencyProblem } from './payrollCurrencies.js';
import { synchronizePayrollReference } from './payrollIntegration.js';
import { minimumTakeHomeNotifications, notificationEventKeys, publishNotificationEvent, readNotificationRules } from './notificationServices';
import { readRequests } from './requestService.js';
import { REQUEST_STATUSES, REQUEST_TYPES } from './requestWorkflow.js';
import { useRole } from './RoleContext';
import { plural, formatUsDate, stampUs } from './textFormat';
import { DateInput } from './DateInput.jsx';
import { leaveBalancesAfterConversion, leaveConversionWindow, ytdWindow, overlapWarnings, batchProblems, batchDrafts, newBatchRow, numberBatch, toggleBatchCalendar } from './payrollRuns.js';
import { policyAppliesToRun, policySelectionConflicts, policySnapshot, readManagedPolicies } from './policyManagement';
import { rejectUpload } from './uploadErrorLog.js';
import { referenceRows } from './ReferenceTables';
import {
  MONTHS,
  PAYROLL_STATUS_TABS,
  acquireLock,
  actionsFor,
  applyAction,
  backdatedAgainst,
  buildPayrollContext,
  capabilitiesOf,
  defaultLockDate,
  fileRun,
  lockHeldBy,
  newPayrollRun,
  nextTransactionNumber,
  payrollReportCatalog,
  readPayrollRuns,
  releaseLock,
  reportTotals,
  savePayrollRun,
  withAudit,
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

const BACKDATE_APPROVAL_LABEL = { Pending: 'waiting for P&A approval', Approved: 'approved', Rejected: 'rejected', 'Not required': 'no approval required' };

function BackdatedBadge({ run }) {
  if (!run?.backdated) return null;
  const status = run.backdated.approval?.status;
  return <span className={`status-pill backdated ${status === 'Pending' ? 'pending' : ''}`} title={`Backdated — ${BACKDATE_APPROVAL_LABEL[status] || ''}`}>Backdated</span>;
}

/** "09/28/2026" from a stored "2026-09-28 06:14:02" (UTC) timestamp. */
function filedOn(stampValue) {
  if (!stampValue) return '';
  const date = new Date(`${String(stampValue).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return String(stampValue).slice(0, 10);
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

const sentence = text => (/[.!?—]$/.test(text) ? text : `${text}.`);

/**
 * The currencies a transaction pays in: PHP at 1.00, plus up to two more with
 * the rate used for this transaction typed in. The choices are the Active rows
 * of the Currency reference table; a currency the run already holds stays
 * selectable even after its row is made Inactive.
 */
function CurrencyListEditor({ currencies = [], onChange }) {
  const catalogue = availableCurrencies();
  const others = currencies.filter(item => item.code !== 'PHP');
  const used = ['PHP', ...others.map(item => item.code)];
  const emit = next => onChange([{ code: 'PHP', symbol: '₱', rate: 1 }, ...next]);
  const setRow = (index, patchValue) => emit(others.map((row, position) => (position === index ? { ...row, ...patchValue } : row)));
  const add = () => {
    const code = catalogue.find(item => !used.includes(item.code))?.code;
    if (code) emit([...others, { code, symbol: currencySymbol(code), decimals: currencyDecimals(code), rate: '' }]);
  };
  return <div className="payroll-currency-list">
    <MiniTable
      columns={[
        { key: 'code', label: 'Currency', render: row => (row.base ? <strong>PHP — Philippine Peso</strong> : <select value={row.code} onChange={event => setRow(row.index, { code: event.target.value, symbol: currencySymbol(event.target.value), decimals: currencyDecimals(event.target.value) })}>
          {[...catalogue, ...(catalogue.some(item => item.code === row.code) ? [] : [{ code: row.code, name: `${row.code} (inactive)` }])].filter(item => item.code !== 'PHP' && (item.code === row.code || !used.includes(item.code))).map(item => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}
        </select>) },
        { key: 'symbol', label: 'Symbol' },
        { key: 'rate', label: 'Rate to PHP', render: row => (row.base ? '1.00 (base)' : <input type="number" min="0" step="0.0001" value={row.rate ?? ''} placeholder="e.g. 56.20" onChange={event => setRow(row.index, { rate: event.target.value === '' ? '' : Number(event.target.value) })} />) },
        { key: 'remove', label: '', render: row => (row.base ? '' : <button type="button" className="hrm-btn outline" onClick={() => emit(others.filter((_, position) => position !== row.index))}>Remove</button>) },
      ]}
      rows={[{ key: 'PHP', base: true, code: 'PHP', symbol: '₱' }, ...others.map((row, index) => ({ ...row, index, key: `cur-${index}` }))]}
    />
    {used.length < MAX_RUN_CURRENCIES && <button type="button" className="hrm-btn outline" onClick={add}>+ Add currency</button>}
  </div>;
}

const withBase = currencies => [{ code: 'PHP', symbol: '₱', rate: 1 }, ...(currencies || []).filter(item => item.code !== 'PHP')];
const currencySummary = currencies => runCurrenciesOf({ currencies }).map(item => (item.code === 'PHP' ? 'PHP (₱)' : `${item.code} (${item.symbol}) at ${item.rate}`)).join(', ');

/**
 * Every pay item on a computed line that came from setup — earnings, bonuses,
 * deductions and loans — with the amount setup produced, plus the ones this
 * run or this employee left out. Items typed on the transaction are edited in
 * their own sections, not here.
 */
function payItemsOfLine(line) {
  const adjustments = new Map((line.payItemAdjustments || []).map(change => [change.key, change]));
  const rows = [
    ...(line.earnings || []).filter(item => item.key).map(item => ({ key: item.key, group: 'Earning', name: item.name, current: item.amount })),
    ...(line.bonuses || []).map(item => ({ key: payItemKey('Bonus', { name: item.name }), group: 'Bonus', name: item.name, current: item.amount })),
    ...(line.loans || []).filter(item => item.key).map(item => ({ key: item.key, group: 'Loan', name: item.name, current: item.due })),
    ...(line.deductions || []).filter(item => item.key).map(item => ({ key: item.key, group: 'Deduction', name: item.name, current: item.due })),
  ];
  const seen = new Set(rows.map(row => row.key));
  (line.payItemAdjustments || []).filter(change => change.excluded && !seen.has(change.key))
    .forEach(change => rows.push({ key: change.key, group: change.group, name: change.name, current: 0 }));
  return rows.map(row => ({ ...row, computed: adjustments.get(row.key)?.computed ?? row.current, runExcluded: adjustments.get(row.key)?.scope === 'run' }));
}

const TAKE_HOME_MODES = [
  { value: 'policy', label: 'Apply the policy engine' },
  { value: 'minimum', label: 'Use a different protected minimum for this run' },
  { value: 'off', label: "Don't apply take-home protection this run", paOnly: true },
];

function filedByText(run) {
  if (!run?.createdBy) return '';
  return `${run.createdBy}, ${filedOn(run.createdAt)}`;
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

/** Set by the Payroll dashboard so "Open" lands on the transaction, not just the register. */
export const OPEN_RUN_KEY = 'atlas-payroll-open-run';

/* ---------------------------------------------------------------- register */

const REGISTER_COLUMNS = [
  { key: 'transactionNumber', label: 'Transaction No.' },
  { key: 'year', label: 'Year' },
  { key: 'month', label: 'Month' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'payrollType', label: 'Transaction Type' },
  { key: 'transactionMode', label: 'Transaction Mode' },
  { key: 'paymentMode', label: 'Payment Mode' },
  { key: 'currency', label: 'Currency' },
  { key: 'period', label: 'Payroll Period' },
  { key: 'timekeeping', label: 'Timekeeping Cut-off' },
  { key: 'payoutDate', label: 'Payout Date' },
  { key: 'remarks', label: 'Payout Remark' },
  { key: 'headcount', label: 'No. of Employees', align: 'right' },
  { key: 'netPay', label: 'Total Net Pay', align: 'right' },
  { key: 'status', label: 'Status' },
  { key: 'filedBy', label: 'Filed by' },
];

function RegisterScreen({ runs, onOpen, onCreate, onAction, onNotify, canCreate, isPaAdmin, bulk, autoCompute, onToggleAutoCompute, onRecalculateOpen }) {
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
    transactionMode: run.transactionMode || 'Single',
    paymentMode: run.paymentMode,
    currency: Array.isArray(run.currencies) ? runCurrenciesOf(run).map(item => item.code).join(', ') : run.currency || 'PHP',
    period: run.periodStart ? `${formatUsDate(run.periodStart)} – ${formatUsDate(run.periodEnd)}` : '—',
    timekeeping: run.timekeepingStart ? `${formatUsDate(run.timekeepingStart)} – ${formatUsDate(run.timekeepingEnd)}` : '—',
    payoutDate: formatUsDate(run.payoutDate) || '—',
    remarks: run.remarks || '—',
    headcount: run.result?.totals.headcount ?? 0,
    netPay: run.result?.currency && run.result.currency !== 'PHP'
      ? `${money(run.result.settlementTotals?.netPay, run.result.currency)} (PHP ${peso(run.result.totals.netPay)})`
      : peso(run.result?.totals.netPay || 0),
    status: run.status,
    backdated: run.backdated ? 'Backdated' : '',
    filedBy: filedByText(run) || '—',
  })), [runs]);

  const recalculable = useMemo(() => runs.filter(run => capabilitiesOf(run).recalculate), [runs]);

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
        <label className="payroll-auto-compute" title="Recalculate every open transaction automatically when Payroll Processing opens, so figures follow the latest timekeeping and masterfile changes">
          <input type="checkbox" checked={autoCompute} onChange={event => onToggleAutoCompute(event.target.checked)} /> Auto-compute
        </label>
        <button type="button" className="hrm-btn outline" disabled={Boolean(bulk) || !recalculable.length} onClick={() => onRecalculateOpen(recalculable)}>Recalculate open ({recalculable.length})</button>
        {canCreate && <PrimaryButton onClick={onCreate}>Create Transaction</PrimaryButton>}
        <ExportMenu onExport={exportRows} disabled={!filtered.length} />
      </div>
    </div>

    {bulk && <div className="payroll-bulk-progress" role="status">
      <div><strong>{bulk.auto ? 'Auto-compute' : 'Recalculating'} {bulk.done} of {bulk.total} {plural(bulk.total, 'transaction')}</strong><small>{bulk.current ? `Computing ${bulk.current} · ` : ''}{bulk.employees} employee {plural(bulk.employees, 'line')} processed</small></div>
      <span className="payroll-bulk-bar"><span style={{ width: `${Math.round((bulk.done / Math.max(1, bulk.total)) * 100)}%` }} /></span>
    </div>}

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
      renderCell={(row, column) => (column.key === 'status'
        ? <span className="payroll-status-cell"><StatusBadge status={row.status} /><BackdatedBadge run={row.run} /></span>
        : column.key === 'transactionNumber'
          ? <button type="button" className="link-button" onClick={() => onOpen(row.run)} title="Open this transaction">{row.transactionNumber}</button>
          : row[column.key])}
      actions={row => [
        { label: capabilitiesOf(row.run).edit ? 'Update Entry' : 'View Transaction', kind: 'view', onSelect: () => onOpen(row.run) },
        ...actionsFor(row.run, runs, { canReopen: true, isPaAdmin })
          .filter(action => !['updateEntry', 'approveBackdate', 'rejectBackdate'].includes(action.key))
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
        { key: 'payrollType', label: 'Transaction Type', options: ['Regular', 'Special'] },
        { key: 'transactionMode', label: 'Transaction Mode', options: ['Single', 'Multiple'] },
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

function CreateWizard({ runs, calendars, policies: managedPolicies, onCancel, onCreate, requiresApproval, isPaAdmin }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(() => newPayrollRun({ runs, companyId: readActiveCompanyId() }));
  const monthNumber = MONTHS.indexOf(draft.month) + 1 || 1;
  const transactionNumber = nextTransactionNumber(runs, draft.year, monthNumber);
  const availablePolicies = useMemo(() => managedPolicies.filter(policy => draft.periodStart && draft.periodEnd ? policyAppliesToRun(policy, draft) : policy.status === 'Active'), [managedPolicies, draft.periodStart, draft.periodEnd, draft.payoutDate]);
  const selectedPolicies = useMemo(() => availablePolicies.filter(policy => (draft.appliedPolicies || []).some(applied => applied.policyId === policy.id)), [availablePolicies, draft.appliedPolicies]);
  const policyConflicts = useMemo(() => policySelectionConflicts(selectedPolicies), [selectedPolicies]);
  const backdated = useMemo(() => backdatedAgainst(draft, runs), [draft.payoutDate, draft.periodStart, runs]);
  const multiple = draft.transactionMode === 'Multiple';
  const extraRows = multiple ? (draft.additional || []) : [];
  const backdatedIndex = backdated ? 0 : extraRows.findIndex(row => backdatedAgainst(row, runs)) + 1;
  const backdatedRow = backdatedIndex > 0 && !backdated ? extraRows[backdatedIndex - 1] : draft;
  const backdatedNote = backdated || (backdatedIndex > 0 ? backdatedAgainst(extraRows[backdatedIndex - 1], runs) : null);
  const anyBackdated = Boolean(backdatedNote);
  const setRow = (index, patch) => setDraft(previous => ({ ...previous, additional: (previous.additional || []).map((row, at) => (at === index ? { ...row, ...patch } : row)) }));
  const applyRowCalendar = (index, code) => {
    const calendar = calendars.find(row => row.calendarCode === code);
    if (!calendar) { setRow(index, { calendarCode: code }); return; }
    setRow(index, {
      calendarCode: code, year: Number(calendar.year) || draft.year, month: calendar.month || draft.month, frequency: calendar.frequency || draft.frequency,
      periodStart: calendar.periodStart || '', periodEnd: calendar.periodEnd || '', timekeepingStart: calendar.cutoffStart || '', timekeepingEnd: calendar.cutoffEnd || '',
      payoutDate: calendar.payoutDate || '', lockDate: calendar.lockDate || defaultLockDate(calendar.payoutDate || ''),
    });
  };
  const setMode = value => setDraft(previous => ({ ...previous, transactionMode: value, additional: value === 'Multiple' && !(previous.additional || []).length ? [newBatchRow(previous)] : previous.additional }));
  const overlaps = useMemo(() => overlapWarnings(draft, runs), [draft, runs]);
  const batchPreview = useMemo(() => {
    const drafts = batchDrafts({ ...draft }, 'preview');
    return drafts.map((item, index) => ({ item, number: numberBatch(drafts, runs)[index] }));
  }, [draft, runs]);

  const set = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const setShare = (agency, side, value) => setDraft(previous => ({
    ...previous,
    config: { ...previous.config, statutoryShares: { ...previous.config.statutoryShares, [agency]: { ...previous.config.statutoryShares?.[agency], [side]: value } } },
  }));
  const wizardCompanyId = readActiveCompanyId();
  const leaveSetup = useMemo(() => readServiceConfiguration('leaveBenefits', wizardCompanyId), [wizardCompanyId]);
  const ytdRange = useMemo(() => ytdWindow(draft.config.ytd, draft), [draft.config.ytd, draft.payoutDate]);
  const conversionWindow = useMemo(() => leaveConversionWindow(draft.config.leaveConversion, leaveSetup), [draft.config.leaveConversion, leaveSetup]);
  // Earnings that opted in on their Earning Configuration, in the order they draw on the pool.
  const reclassifiable = useMemo(() => readServiceConfiguration('earnings', wizardCompanyId)
    .filter(item => item.eligibleForReclassification === 'Yes' && item.status !== 'Inactive')
    .sort((left, right) => (Number(left.reclassPriority) || 999) - (Number(right.reclassPriority) || 999)), [wizardCompanyId]);
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

  const batchModes = useMemo(() => [...new Set([draft.paymentMode, ...(draft.transactionMode === 'Multiple' ? (draft.additional || []).map(row => row.paymentMode) : [])])], [draft.paymentMode, draft.transactionMode, draft.additional]);
  const eligible = useMemo(() => employeeRoster.filter(employee => batchModes.includes(employee.payroll.paymentMode)), [batchModes]);
  const included = eligible.filter(employee => !draft.population.excluded.includes(employee.employeeId));
  const excluded = eligible.filter(employee => draft.population.excluded.includes(employee.employeeId));

  const validate = () => {
    if (step === 0) {
      if (!draft.periodStart || !draft.periodEnd) return 'Payroll period start and end are required.';
      if (draft.periodEnd < draft.periodStart) return 'The payroll period end cannot fall before its start.';
      if (!draft.timekeepingStart || !draft.timekeepingEnd) return 'A timekeeping cut-off is required — the run prices attendance from it.';
      if (!draft.payoutDate) return 'A payout date is required; it selects the statutory version the run computes on.';
      if (draft.lockDate && draft.lockDate < draft.payoutDate) return 'The transaction lock date cannot fall before its payout date.';
      { const currencyProblem = runCurrencyProblem(withBase(draft.currencies)); if (currencyProblem) return currencyProblem; }
      { const problem = batchProblems(draft)[0]; if (problem) return problem; }
      if (anyBackdated && !(draft.backdatedReason || '').trim()) return `${multiple ? `Transaction ${backdatedIndex + 1}` : 'This run'} is backdated — it falls before ${backdatedNote.transactionNumber}, which is already posted. Give the reason for backdating.`;
      if (policyConflicts.length) return `${policyConflicts[0][0].policyCode} has overlapping active versions. Remove one policy or correct its effective period before continuing.`;
    }
    if (step === 1) {
      if (draft.config.leaveConversion.enabled && conversionWindow.source === 'Transaction' && conversionWindow.problem) return conversionWindow.problem;
      if (draft.config.ytd?.includePosted !== false && ytdRange.problem) return ytdRange.problem;
      { const pool = draft.config.reclassification.poolLimit; if (draft.config.reclassification.enabled && pool !== '' && pool != null && !(Number(pool) >= 0)) return 'The reclassification pool must be zero or more, or left blank for no limit.'; }
    }
    if (step === 2 && !included.length) return 'At least one employee must be included in the transaction.';
    return '';
  };

  const next = () => {
    const message = validate();
    if (message) { setError(message); return; }
    setError('');
    if (step < WIZARD_STEPS.length - 1) setStep(step + 1);
    else {
      const currencies = withBase(draft.currencies).map(item => ({ ...item, rate: Number(item.rate) }));
      onCreate({ ...draft, additional: multiple ? draft.additional : undefined, transactionNumber, currency: 'PHP', conversionRate: 1, currencies, multiCurrency: currencies.length > 1 });
    }
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
          <FieldRow label={multiple ? 'Payroll calendars' : 'Payroll calendar'} hint={multiple ? 'Tick every payout to create. Each ticked calendar becomes its own transaction, filled from the calendar' : 'From Calendar Settings ▸ Payout calendars'}>
            {multiple
              ? <div className="payroll-checkrow payroll-calendar-multi" role="group" aria-label="Payroll calendars">
                {calendars.map(row => <label key={row.calendarCode}>
                  <input type="checkbox" checked={draft.calendarCode === row.calendarCode || extraRows.some(item => item.calendarCode === row.calendarCode)} onChange={event => setDraft(previous => toggleBatchCalendar(previous, row, event.target.checked))} />
                  {calendarName(row)}
                </label>)}
              </div>
              : <select value={draft.calendarCode} onChange={event => applyCalendar(event.target.value)}>
                <option value="">Select a payout — or enter the dates below</option>
                {calendars.map(row => <option key={row.calendarCode} value={row.calendarCode}>{calendarName(row)}</option>)}
              </select>}
          </FieldRow>
          <FieldRow label="Payroll transaction type" required hint="Regular pays the cycle and can be overridden per employee; Special covers bonus, final pay, adjustments and out-of-system payroll">
            <select value={draft.payrollType} onChange={event => {
              const value = event.target.value;
              setDraft(previous => ({ ...previous, payrollType: value, config: { ...previous.config, zeroBasicPay: value !== 'Regular', zeroVariableAllowance: value !== 'Regular' } }));
            }}>
              {['Regular', 'Special'].map(value => <option key={value}>{value}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Transaction mode" hint="Single creates one transaction. Multiple creates several together, each with its own payment mode, cut-off and payout date">
            <select value={draft.transactionMode} onChange={event => setMode(event.target.value)}>
              <option>Single</option>
              <option>Multiple</option>
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
          <FieldRow label="Payout / payment date" required hint="Selects the effective statutory and tax version"><DateInput value={draft.payoutDate} onChange={value => setDraft(previous => ({ ...previous, payoutDate: value, lockDate: previous.lockDate || defaultLockDate(value) }))} /></FieldRow>
          <FieldRow label="Payroll period start" required><DateInput value={draft.periodStart} onChange={value => set('periodStart', value)} /></FieldRow>
          <FieldRow label="Payroll period end" required><DateInput value={draft.periodEnd} onChange={value => set('periodEnd', value)} /></FieldRow>
          <FieldRow label="Timekeeping cut-off start" required hint="Attendance is priced from the punches inside this window"><DateInput value={draft.timekeepingStart} onChange={value => set('timekeepingStart', value)} /></FieldRow>
          <FieldRow label="Timekeeping cut-off end" required><DateInput value={draft.timekeepingEnd} onChange={value => set('timekeepingEnd', value)} /></FieldRow>
          <FieldRow label="Transaction lock date" hint="After this date only a Super Admin can change the posted run"><DateInput value={draft.lockDate} onChange={value => set('lockDate', value)} /></FieldRow>
          <FieldRow label="Remarks"><textarea value={draft.remarks} onChange={event => set('remarks', event.target.value)} placeholder="Describe this payout" /></FieldRow>
        </div>
        {multiple && <fieldset className="payroll-fieldset">
          <legend>Additional transactions in this batch</legend>
          <p className="payroll-note">The details above are Transaction 1. Each one added here is filed as its own transaction with its own number, lock date and approvals. They share the computation settings, currencies, policies and excluded employees chosen in this wizard. An employee is never covered twice for an overlapping period of the same payment mode.</p>
          {extraRows.map((row, index) => <div key={row.key} className="payroll-batch-row">
            <div className="payroll-batch-row-head">
              <strong>Transaction {index + 2}</strong>
              <button type="button" className="hrm-btn outline" onClick={() => setDraft(previous => ({ ...previous, additional: previous.additional.filter((_, at) => at !== index) }))}>Remove</button>
            </div>
            <div className="payroll-field-grid">
              <FieldRow label="Payment mode" required>
                <select value={row.paymentMode} onChange={event => setRow(index, { paymentMode: event.target.value })}>
                  {['Daily', 'Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly'].map(value => <option key={value}>{value}</option>)}
                </select>
              </FieldRow>
              <FieldRow label="Payroll calendar" hint="From Calendar Settings ▸ Payout calendars">
                <select value={row.calendarCode} onChange={event => applyRowCalendar(index, event.target.value)}>
                  <option value="">Select a payout — or enter the dates below</option>
                  {calendars.map(item => <option key={item.calendarCode} value={item.calendarCode}>{calendarName(item)}</option>)}
                </select>
              </FieldRow>
              <FieldRow label="Payout / payment date" required><DateInput value={row.payoutDate} onChange={value => setRow(index, { payoutDate: value, lockDate: row.lockDate || defaultLockDate(value) })} /></FieldRow>
              <FieldRow label="Payroll period start" required><DateInput value={row.periodStart} onChange={value => setRow(index, { periodStart: value })} /></FieldRow>
              <FieldRow label="Payroll period end" required><DateInput value={row.periodEnd} onChange={value => setRow(index, { periodEnd: value })} /></FieldRow>
              <FieldRow label="Timekeeping cut-off start" required><DateInput value={row.timekeepingStart} onChange={value => setRow(index, { timekeepingStart: value })} /></FieldRow>
              <FieldRow label="Timekeeping cut-off end" required><DateInput value={row.timekeepingEnd} onChange={value => setRow(index, { timekeepingEnd: value })} /></FieldRow>
              <FieldRow label="Transaction lock date"><DateInput value={row.lockDate} onChange={value => setRow(index, { lockDate: value })} /></FieldRow>
              <FieldRow label="Remarks"><input value={row.remarks} onChange={event => setRow(index, { remarks: event.target.value })} placeholder="Describe this payout" /></FieldRow>
            </div>
          </div>)}
          <div className="hrm-toolbar"><button type="button" className="hrm-btn outline" onClick={() => setDraft(previous => ({ ...previous, additional: [...(previous.additional || []), newBatchRow(previous)] }))}>+ Add another transaction</button></div>
        </fieldset>}
        {draft.payoutDate && <div className="payroll-tables-note">
          <strong>Tables for payout date {formatUsDate(draft.payoutDate)}</strong>
          <span>{tablesFor(draft.payoutDate).map(table => `${table.label}: ${table.code} (effective ${formatUsDate(table.effectiveDate)})`).join(' · ')}</span>
        </div>}
        <fieldset className="payroll-fieldset">
          <legend>Currencies in this run</legend>
          <p className="payroll-note">PHP is always included. Add up to {MAX_RUN_CURRENCIES - 1} more currencies and type the rate used for this transaction. Pay in another currency is entered per employee on the transaction (Edit payroll) — hours and amount — and is converted at this rate. Statutory contributions and tax are still computed in PHP.</p>
          <CurrencyListEditor currencies={withBase(draft.currencies)} onChange={value => set('currencies', value)} />
        </fieldset>
        {backdatedNote && <div className="payroll-backdate-note">
          <div>
            <strong><span className="status-pill backdated">Backdated</span> This run falls before the latest posted payroll</strong>
            <p>{backdatedNote.transactionNumber} was posted with payout date {formatUsDate(backdatedNote.payoutDate)} (period {formatUsDate(backdatedNote.periodStart)} to {formatUsDate(backdatedNote.periodEnd)}). {multiple ? `Transaction ${backdatedIndex + 1}` : 'This run'} pays out on {formatUsDate(backdatedRow.payoutDate)}{backdatedRow.periodStart ? `, period starting ${formatUsDate(backdatedRow.periodStart)}` : ''}.
              {requiresApproval && !isPaAdmin && ' P&A must approve the backdating before it can be posted as draft.'}
              {requiresApproval && isPaAdmin && ' As P&A, filing it records your approval.'}</p>
          </div>
          <FieldRow label="Reason for backdating" required><textarea value={draft.backdatedReason || ''} onChange={event => set('backdatedReason', event.target.value)} placeholder="Why this payroll is filed after a later one was posted" /></FieldRow>
        </div>}
        {overlaps.length > 0 && <div className="payroll-overlap-note" role="alert">
          <strong>Overlapping period</strong>
          <ul>{overlaps.map(message => <li key={message}>{message}</li>)}</ul>
          <p>You can still continue. The transaction is filed with this warning, so check that nobody is paid twice for the period.</p>
        </div>}
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

        <fieldset className="payroll-fieldset">
          <legend>Statutory contributions</legend>
          <Switch label="Compute allowable deduction" hint="Ticked by default. Employees whose 201 file says no are still excluded." checked={draft.config.computeAllowableDeduction} onChange={value => setConfig('computeAllowableDeduction', value)} />
          <table className="payroll-share-grid">
            <thead><tr><th scope="col">Agency</th><th scope="col">Compute</th><th scope="col">Employee share (EE)</th><th scope="col">Employer share (ER)</th></tr></thead>
            <tbody>
              {[['sss', 'SSS'], ['sssWisp', 'SSS WISP / MPF'], ['philhealth', 'PhilHealth'], ['pagibig', 'Pag-IBIG']].map(([key, label]) => {
                const on = draft.config.computeAllowableDeduction && draft.config.statutoryAgencies[key];
                return <tr key={key}>
                  <th scope="row">{label}</th>
                  <td><input type="checkbox" aria-label={`Compute ${label}`} disabled={!draft.config.computeAllowableDeduction} checked={draft.config.statutoryAgencies[key]} onChange={event => setNested('statutoryAgencies', key, event.target.checked)} /></td>
                  <td><input type="checkbox" aria-label={`${label} employee share`} disabled={!on} checked={draft.config.statutoryShares?.[key]?.employee !== false} onChange={event => setShare(key, 'employee', event.target.checked)} /></td>
                  <td><input type="checkbox" aria-label={`${label} employer share`} disabled={!on} checked={draft.config.statutoryShares?.[key]?.employer !== false} onChange={event => setShare(key, 'employer', event.target.checked)} /></td>
                </tr>;
              })}
            </tbody>
          </table>
          <p className="payroll-note">Switch the employee and employer shares on separately. An unticked employee share is not deducted from pay; an unticked employer share is not booked as employer cost. The employee's 201 file still has the last word.</p>
          <FieldRow label="Collection schedule" hint="A monthly contribution can be split across cut-offs, taken whole on one of them, or taken at the most take-home pay allows in the first payroll with the balance in the next">
            <select value={draft.config.statutorySchedule} onChange={event => setConfig('statutorySchedule', event.target.value)}>
              {['Every payroll (split)', 'First cutoff only', 'Second cutoff only', STATUTORY_MAX_FIRST].map(value => <option key={value}>{value}</option>)}
            </select>
          </FieldRow>
        </fieldset>

        <fieldset className="payroll-fieldset">
          <legend>Basic pay and attendance</legend>
          <Switch label="Zero basic pay" hint="Pays earnings only. Unticked by default on a regular run, ticked on a special one." checked={draft.config.zeroBasicPay} onChange={value => setConfig('zeroBasicPay', value)} />
          <Switch label="Zero variable allowances" checked={draft.config.zeroVariableAllowance} onChange={value => setConfig('zeroVariableAllowance', value)} />
          <Switch label="Compute basic pay adjustment" hint="Pro-rates new hires, separations, salary increases and end-of-hold from their effective dates" checked={draft.config.computeBasicPayAdjustment} onChange={value => setConfig('computeBasicPayAdjustment', value)} />
          <Switch label="Compute variable allowance adjustment" hint="Pro-rates variable allowances for new hires and separations from the same effective dates as basic pay" checked={draft.config.computeVariableAllowanceAdjustment !== false} onChange={value => setConfig('computeVariableAllowanceAdjustment', value)} />
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
          </div>
          <Switch label="Compute final pay" hint="Brings in separated employees and puts them on the annualised tax table" checked={draft.config.computeFinalPay} onChange={value => setConfig('computeFinalPay', value)} />
          <Switch label="Annualize tax (year-end adjustment)" hint="Computes each employee's tax for the whole year on the BIR annual table — year-to-date plus this run — and withholds the difference, or refunds an over-withholding. Use on the last payroll of the year." checked={draft.config.annualizeTax} onChange={value => setConfig('annualizeTax', value)} />
          <Switch label="Withhold forecast tax in advance" hint="Adds an editable forecast tax amount per employee, as its own column, withheld on top of the computed tax — for example after a previous employer. Not applied on annualizing lines" checked={Boolean(draft.config.taxForecast?.enabled)} onChange={value => setNested('taxForecast', 'enabled', value)} />
          <Switch label="Gross up every employee" hint="Otherwise only employees tagged for gross-up in the 201 file are grossed up" checked={draft.config.grossUpAll} onChange={value => setConfig('grossUpAll', value)} />
        </fieldset>

        <fieldset className="payroll-fieldset">
          <legend>Year to date</legend>
          <Switch label="Include posted payrolls in year to date" hint="Adds what earlier posted payrolls collected to each employee's year-to-date balances, which tax annualization, final pay, the 13th month and the bonus ceiling read" checked={draft.config.ytd?.includePosted !== false} onChange={value => setNested('ytd', 'includePosted', value)} />
          {draft.config.ytd?.includePosted !== false && <>
            <div className="payroll-field-grid">
              <FieldRow label="Year-to-date start date" hint="Leave both dates blank to use the default window"><DateInput value={draft.config.ytd?.startDate || ''} onChange={value => setNested('ytd', 'startDate', value)} /></FieldRow>
              <FieldRow label="Year-to-date end date"><DateInput value={draft.config.ytd?.endDate || ''} onChange={value => setNested('ytd', 'endDate', value)} /></FieldRow>
            </div>
            <p className={`payroll-note${ytdRange.problem ? ' payroll-note-warn' : ''}`}>
              {ytdRange.problem
                ? ytdRange.problem
                : ytdRange.source === 'Transaction'
                  ? `Counting payrolls posted with a payout date from ${formatUsDate(ytdRange.start)} to ${formatUsDate(ytdRange.end)}, on top of each employee's own balance.`
                  : ytdRange.start ? `No dates entered, so the default applies: payouts from ${formatUsDate(ytdRange.start)} to ${formatUsDate(ytdRange.end)} — after the employee records' balances end and before this payout.` : 'Enter a payout date in step 1 to see the default window.'}
            </p>
          </>}
        </fieldset>

        <fieldset className="payroll-fieldset">
          <legend>Leave conversion and reclassification</legend>
          <Switch label="Convert leave credits" hint="Pays converted credits from HRM. Where there is no HRM engagement, upload the days in Batch uploads (Pay Item Type: Leave Conversion); an upload replaces HRM for that leave type" checked={draft.config.leaveConversion.enabled} onChange={value => setNested('leaveConversion', 'enabled', value)} />
          {draft.config.leaveConversion.enabled && <div className="payroll-checkrow">
            {LEAVE_TYPES.map(type => <label key={type}>
              <input type="checkbox" checked={draft.config.leaveConversion.leaveTypes.includes(type)} onChange={event => setNested('leaveConversion', 'leaveTypes', event.target.checked
                ? [...draft.config.leaveConversion.leaveTypes, type]
                : draft.config.leaveConversion.leaveTypes.filter(value => value !== type))} />
              {type}
            </label>)}
          </div>}
          {draft.config.leaveConversion.enabled && <>
            <div className="payroll-field-grid">
              <FieldRow label="Conversion start date" hint="Leave both dates blank to use the leave conversion setup"><DateInput value={draft.config.leaveConversion.startDate || ''} onChange={value => setNested('leaveConversion', 'startDate', value)} /></FieldRow>
              <FieldRow label="Conversion end date"><DateInput value={draft.config.leaveConversion.endDate || ''} onChange={value => setNested('leaveConversion', 'endDate', value)} /></FieldRow>
            </div>
            <p className={`payroll-note${conversionWindow.problem ? ' payroll-note-warn' : ''}`}>
              {conversionWindow.problem
                ? conversionWindow.problem
                : conversionWindow.source === 'Transaction'
                  ? `Converting leave credits from ${formatUsDate(conversionWindow.start)} to ${formatUsDate(conversionWindow.end)} — the dates entered on this transaction.`
                  : `No dates entered, so the leave conversion setup applies: ${conversionWindow.start ? formatUsDate(conversionWindow.start) : 'its first effective date'} to ${conversionWindow.end ? formatUsDate(conversionWindow.end) : 'open-ended'} (Benefits & Leave Configuration).`}
            </p>
          </>}
          <Switch label="Include earning reclassification and threshold utilisation" hint="Moves earnings between taxable and non-taxable against the remaining ceilings" checked={draft.config.reclassification.enabled} onChange={value => setNested('reclassification', 'enabled', value)} />
          {draft.config.reclassification.enabled && <>
            <div className="payroll-field-grid">
              <FieldRow label="What the pool is" hint="The remaining ceiling is the non-taxable 13th month and other benefits cap (₱90,000 unless the 13th month threshold says otherwise) less what the employee has already used this year">
                <select value={draft.config.reclassification.poolSource || 'amount'} onChange={event => setNested('reclassification', 'poolSource', event.target.value)}>
                  <option value="amount">A typed amount</option>
                  <option value="ceiling">The remaining 13th month and other benefits ceiling</option>
                </select>
              </FieldRow>
              <FieldRow label="Total that may be reclassified per employee" hint="Blank means no typed limit; each earning is still held to its own cap">
                <input type="number" min="0" value={draft.config.reclassification.poolLimit} onChange={event => setNested('reclassification', 'poolLimit', event.target.value)} placeholder="No limit" />
              </FieldRow>
            </div>
            <MiniTable
              columns={[
                { key: 'priority', label: 'Rank', render: row => row.reclassPriority || '—' },
                { key: 'name', label: 'Earning', render: row => `${row.code} · ${row.name}` },
                { key: 'direction', label: 'Moves', render: row => row.reclassDirection || 'Taxable to non-taxable' },
                { key: 'cap', label: 'Limit', render: row => (row.reclassCapBasis === 'Amount per payroll' ? `${peso(Number(row.reclassCap) || 0)} per payroll` : row.reclassCapBasis === 'Percent of the earning' ? `${Number(row.reclassCap) || 0}% of the earning` : 'No limit') },
              ]}
              rows={reclassifiable.map(item => ({ ...item, key: item.code }))}
              empty="No earning is marked Eligible for reclassification yet. Mark them in Services Information ▸ Earning Configuration."
            />
            <p className="payroll-note">Earnings draw on the pool in rank order, each up to its own limit, so a lower-ranked earning only reclassifies what the higher-ranked ones left. Rank, direction and limit are set on the Earning Configuration, not here.</p>
          </>}
        </fieldset>

        <div className="payroll-field-grid">
          <FieldRow label="Payslip template">
            <select value={draft.config.payslipTemplate} onChange={event => setConfig('payslipTemplate', event.target.value)}>
              {[...new Set([...payslipTemplates().filter(item => item.status !== 'Inactive').map(item => item.name), draft.config.payslipTemplate].filter(Boolean))].map(name => <option key={name}>{name}</option>)}
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
                { key: 'r1', label: multiple ? 'Transaction numbers' : 'Transaction number', value: multiple ? batchPreview.map(entry => entry.number).join(', ') : transactionNumber },
                ...(multiple ? batchPreview.map(({ item, number }, index) => ({ key: `rb${index}`, label: `Transaction ${index + 1}`, value: `${number} · ${item.paymentMode} · ${formatUsDate(item.periodStart)} to ${formatUsDate(item.periodEnd)} · payout ${formatUsDate(item.payoutDate)}` })) : []),
                { key: 'r2', label: 'Type / mode', value: `${draft.payrollType} · ${draft.transactionMode} · ${draft.paymentMode}` },
                { key: 'r3', label: 'Period', value: `${formatUsDate(draft.periodStart)} to ${formatUsDate(draft.periodEnd)}` },
                { key: 'r4', label: 'Timekeeping cut-off', value: `${formatUsDate(draft.timekeepingStart)} to ${formatUsDate(draft.timekeepingEnd)}` },
                { key: 'r5', label: 'Payout date', value: formatUsDate(draft.payoutDate) },
                { key: 'r6', label: 'Lock date', value: formatUsDate(draft.lockDate) || 'Not set' },
                { key: 'r7', label: 'Currencies', value: currencySummary(withBase(draft.currencies)) },
                { key: 'r7b', label: 'Statutory shares', value: draft.config.computeAllowableDeduction ? [['sss', 'SSS'], ['sssWisp', 'WISP/MPF'], ['philhealth', 'PhilHealth'], ['pagibig', 'Pag-IBIG']].filter(([key]) => draft.config.statutoryAgencies[key]).map(([key, label]) => `${label}: ${[draft.config.statutoryShares?.[key]?.employee !== false && 'EE', draft.config.statutoryShares?.[key]?.employer !== false && 'ER'].filter(Boolean).join(' + ') || 'none'}`).join(' · ') || 'None' : 'Not computed' },
                ...(overlaps.length ? [{ key: 'r0w', label: 'Overlap warning', value: overlaps.join(' ') }] : []),
                { key: 'r7e', label: 'Forecast tax', value: draft.config.taxForecast?.enabled ? 'Withheld in advance, entered per employee' : 'Off' },
                { key: 'r7d', label: 'Year to date', value: draft.config.ytd?.includePosted === false ? 'Employee record only' : (ytdRange.problem ? 'Needs attention' : `Employee record + posted payouts ${ytdRange.start ? `${formatUsDate(ytdRange.start)} to ${formatUsDate(ytdRange.end)}` : '(set the payout date)'}`) },
                { key: 'r7c', label: 'Leave conversion', value: draft.config.leaveConversion.enabled ? (conversionWindow.problem ? 'Needs attention' : conversionWindow.source === 'Transaction' ? `${formatUsDate(conversionWindow.start)} to ${formatUsDate(conversionWindow.end)}` : 'Leave conversion setup window') : 'Off' },
                { key: 'r8', label: 'Remarks', value: draft.remarks.trim() || 'None' },
                ...(backdated ? [{ key: 'r8b', label: 'Backdated', value: `Before ${backdated.transactionNumber} (payout ${formatUsDate(backdated.payoutDate)}) — ${(draft.backdatedReason || '').trim()}${requiresApproval && !isPaAdmin ? ' · needs P&A approval' : ''}` }] : []),
                { key: 'r9', label: 'Policies', value: draft.appliedPolicies?.length ? draft.appliedPolicies.map(policy => `${policy.code} v${policy.version}`).join(', ') : 'No optional policies selected' },
              ]}
            />
          </section>
          <section>
            <h4>Payroll computation</h4>
            <MiniTable
              columns={[{ key: 'label', label: 'Setting' }, { key: 'value', label: 'Value' }]}
              rows={[
                { key: 'c1', label: 'Rate divisors', value: "Work days per year from each employee's pay record, hours per day from their assigned shift; company defaults apply where neither is set" },
                { key: 'c2', label: 'Allowable deduction', value: draft.config.computeAllowableDeduction ? Object.entries(draft.config.statutoryAgencies).filter(([, on]) => on).map(([key]) => key.toUpperCase()).join(', ') : 'Not computed' },
                { key: 'c3', label: 'Collection schedule', value: draft.config.statutorySchedule },
                { key: 'c4', label: 'Zero basic pay', value: draft.config.zeroBasicPay ? 'Yes' : 'No' },
                { key: 'c5', label: '13th month / bonus', value: draft.config.thirteenthMonth.enabled ? `${draft.config.thirteenthMonth.bonusTypes.join(', ')} · ceiling ${peso(draft.config.thirteenthMonth.ntThreshold)}` : 'Not computed' },
                { key: 'c6', label: 'Tax', value: draft.config.computeTax ? 'Per employee tax type, on the tax table effective on the payout date' : 'Not computed' },
                { key: 'c6b', label: 'Tables applied', value: tablesFor(draft.payoutDate).map(table => `${table.label} ${table.code}`).join(' · ') || 'Choose a payout date' },
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
  { key: 'taxForecast', label: 'Forecast Tax', align: 'right' },
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
function EditLineModal({ line, run, onClose, onSave, isPaAdmin }) {
  const existing = run.overrides?.[line.employeeId] || {};
  const [draft, setDraft] = useState({
    zeroBasicPay: existing.zeroBasicPay ?? run.config.zeroBasicPay,
    computeAllowableDeduction: existing.computeAllowableDeduction ?? run.config.computeAllowableDeduction,
    computeFinalPay: existing.computeFinalPay ?? run.config.computeFinalPay,
    withholdingTax: existing.withholdingTax,
    taxForecast: existing.taxForecast,
    statutory: existing.statutory || {},
    variableAllowances: existing.variableAllowances || [],
    earnings: existing.earnings || [],
    deductions: existing.deductions || [],
    bonuses: existing.bonuses || [],
    currencyLines: existing.currencyLines || [],
    payItems: existing.payItems || {},
    takeHome: existing.takeHome || { mode: 'policy' },
  });
  const [confirming, setConfirming] = useState(false);
  const [editError, setEditError] = useState('');
  const lineItems = useMemo(() => payItemsOfLine(line), [line]);
  const itemChange = key => draft.payItems[key] || {};
  const setItem = (key, patchValue) => setDraft(previous => ({ ...previous, payItems: { ...previous.payItems, [key]: { ...(previous.payItems[key] || {}), ...patchValue } } }));
  const itemChanged = key => { const change = itemChange(key); return Boolean(change.exclude) || (change.amount !== undefined && change.amount !== ''); };
  const requestSave = () => {
    const missingReason = lineItems.find(row => itemChanged(row.key) && !String(itemChange(row.key).reason || '').trim());
    if (missingReason) { setEditError(`Give the reason for changing ${missingReason.name} on this run.`); return; }
    if (draft.takeHome.mode !== 'policy' && !String(draft.takeHome.reason || '').trim()) { setEditError('Give the reason for changing the take-home pay protection on this run.'); return; }
    if (draft.takeHome.mode === 'minimum' && !(Number(draft.takeHome.minimum) >= 0 && draft.takeHome.minimum !== '' && draft.takeHome.minimum !== undefined)) { setEditError('Enter the protected minimum take-home pay for this run.'); return; }
    if (draft.takeHome.mode === 'off' && !isPaAdmin) { setEditError('Only P&A can switch take-home pay protection off.'); return; }
    setEditError('');
    // Keep only the items somebody actually changed.
    const payItems = Object.fromEntries(Object.entries(draft.payItems).filter(([key]) => itemChanged(key)));
    setDraft(previous => ({ ...previous, payItems }));
    setConfirming(true);
  };
  const foreignCurrencies = runCurrenciesOf(run).slice(1);

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
        <button type="button" className="hrm-btn primary" onClick={() => onSave({ ...draft, takeHome: draft.takeHome.mode === 'policy' ? undefined : draft.takeHome })}>Save</button>
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
      <button type="button" className="hrm-btn primary" onClick={requestSave}>Save</button>
    </>}
  >
    <div className="payroll-edit">
      <p className="payroll-edit-name"><span>Employee name</span><strong>{line.name}</strong></p>
      {editError && <div className="wizard-error">{editError}</div>}

      <fieldset className="payroll-fieldset">
        <legend>Pay items on this line</legend>
        <p className="payroll-note">The earnings, bonuses, deductions and loans setup produced for this employee. Change the amount or skip an item for this run only — setup and the Earning, Deduction and Bonus Management lists stay as they are, and a skipped deduction or loan keeps its balance for the next run. A reason is required.</p>
        <MiniTable
          columns={[
            { key: 'group', label: 'Type' },
            { key: 'name', label: 'Pay item' },
            { key: 'computed', label: 'From setup', align: 'right', render: row => peso(row.computed) },
            { key: 'amount', label: 'This run', align: 'right', render: row => (row.runExcluded ? <span className="payroll-muted">Left out of the run</span> : <input type="number" min="0" step="0.01" disabled={itemChange(row.key).exclude} value={itemChange(row.key).amount ?? ''} placeholder={String(row.computed)} onChange={event => setItem(row.key, { amount: event.target.value === '' ? '' : Number(event.target.value) })} />) },
            { key: 'exclude', label: 'Skip', render: row => (row.runExcluded ? '—' : <input type="checkbox" checked={Boolean(itemChange(row.key).exclude)} onChange={event => setItem(row.key, { exclude: event.target.checked })} aria-label={`Skip ${row.name} this run`} />) },
            { key: 'reason', label: 'Reason', render: row => (row.runExcluded ? '' : <input value={itemChange(row.key).reason || ''} disabled={!itemChanged(row.key)} placeholder={itemChanged(row.key) ? 'Required' : ''} onChange={event => setItem(row.key, { reason: event.target.value })} />) },
          ]}
          rows={lineItems.map(row => ({ ...row, key: row.key }))}
          empty="No earnings, bonuses, deductions or loans from setup on this line."
        />
      </fieldset>

      <fieldset className="payroll-fieldset">
        <legend>Take-home pay protection</legend>
        <p className="payroll-note">The policy engine protects a minimum take-home pay of {peso(line.takeHome?.protectedMinimum)}{line.takeHomeOverride ? ' (already changed on this run)' : ''} and deferred {peso(line.takeHome?.deferred)} on this line. You can change it for this employee on this run only.</p>
        <div className="payroll-field-grid">
          <FieldRow label="Protection">
            <select value={draft.takeHome.mode} onChange={event => setDraft({ ...draft, takeHome: { ...draft.takeHome, mode: event.target.value } })}>
              {TAKE_HOME_MODES.map(option => <option key={option.value} value={option.value} disabled={option.paOnly && !isPaAdmin}>{option.label}{option.paOnly && !isPaAdmin ? ' (P&A only)' : ''}</option>)}
            </select>
          </FieldRow>
          {draft.takeHome.mode === 'minimum' && <FieldRow label="Protected minimum for this run" required>
            <input type="number" min="0" step="0.01" value={draft.takeHome.minimum ?? ''} onChange={event => setDraft({ ...draft, takeHome: { ...draft.takeHome, minimum: event.target.value === '' ? '' : Number(event.target.value) } })} />
          </FieldRow>}
          {draft.takeHome.mode !== 'policy' && <FieldRow label="Reason" required>
            <input value={draft.takeHome.reason || ''} onChange={event => setDraft({ ...draft, takeHome: { ...draft.takeHome, reason: event.target.value } })} />
          </FieldRow>}
        </div>
      </fieldset>

      <fieldset className="payroll-fieldset">
        <legend>Per-employee computation switches</legend>
        <Switch label="No computation of basic pay" hint="Zeroes basic pay for this employee only" checked={draft.zeroBasicPay} onChange={value => setDraft({ ...draft, zeroBasicPay: value })} />
        <Switch label="Compute allowable deduction" hint="Statutory contributions for this employee" checked={draft.computeAllowableDeduction} onChange={value => setDraft({ ...draft, computeAllowableDeduction: value })} />
        <Switch label="Compute final pay" hint="Puts this employee on the annualised tax table" checked={draft.computeFinalPay} onChange={value => setDraft({ ...draft, computeFinalPay: value })} />
      </fieldset>

      {run.config?.taxForecast?.enabled && <fieldset className="payroll-fieldset">
        <legend>Forecast tax</legend>
        <FieldRow label="Forecast tax amount" hint="Withheld in advance on top of the computed tax — for example after a previous employer. Leave blank for none. Not applied when this line annualizes the year's tax">
          <input type="number" min="0" step="0.01" value={draft.taxForecast ?? ''} onChange={event => setDraft({ ...draft, taxForecast: event.target.value === '' ? undefined : Number(event.target.value) })} />
        </FieldRow>
      </fieldset>}

      <fieldset className="payroll-fieldset">
        <legend>Variable allowances (per hour)</legend>
        <p className="payroll-note">Choose an allowance from the Variable Allowance table, give the rate per hour, and leave Hours blank to use the hours Timekeeping recorded for the cut-off. The taxable flag on the table decides how it is treated.</p>
        {(draft.variableAllowances || []).map((row, index) => <div key={index} className="payroll-field-grid">
          <FieldRow label="Allowance">
            <select value={row.code} onChange={event => setDraft({ ...draft, variableAllowances: draft.variableAllowances.map((item, at) => (at === index ? { ...item, code: event.target.value } : item)) })}>
              <option value="">Select an allowance</option>
              {referenceRows('variable-allowances').map(item => <option key={item.code} value={item.code}>{item.name}{item.taxable === 'No' ? ' (non-taxable)' : ''}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Rate per hour (₱)"><input type="number" min="0" step="0.01" value={row.rate ?? ''} onChange={event => setDraft({ ...draft, variableAllowances: draft.variableAllowances.map((item, at) => (at === index ? { ...item, rate: event.target.value } : item)) })} /></FieldRow>
          <FieldRow label="Hours" hint="Blank = hours from Timekeeping"><input type="number" min="0" step="0.25" value={row.hours ?? ''} onChange={event => setDraft({ ...draft, variableAllowances: draft.variableAllowances.map((item, at) => (at === index ? { ...item, hours: event.target.value } : item)) })} /></FieldRow>
          <FieldRow label=" "><button type="button" className="hrm-btn outline" onClick={() => setDraft({ ...draft, variableAllowances: draft.variableAllowances.filter((_, at) => at !== index) })}>Remove</button></FieldRow>
        </div>)}
        <div className="hrm-toolbar"><button type="button" className="hrm-btn outline" onClick={() => setDraft({ ...draft, variableAllowances: [...(draft.variableAllowances || []), { code: '', rate: '', hours: '' }] })}>+ Add variable allowance</button></div>
      </fieldset>

      {run.payrollType === 'Special' && <fieldset className="payroll-fieldset">
        <legend>Override contributions</legend>
        <p className="payroll-note">A special transaction can carry contribution amounts typed for this employee instead of the computed ones. Leave a box blank to keep the computed amount. The contribution tables are not changed, and the line records that these were entered.</p>
        <div className="payroll-field-grid">
          {Object.entries(STATUTORY_OVERRIDE_LABELS).map(([key, label]) => <FieldRow key={key} label={label}>
            <input type="number" min="0" step="0.01" placeholder={`Computed: ${peso(line.statutory?.[key] ?? 0)}`} value={draft.statutory?.[key] ?? ''} onChange={event => setDraft({ ...draft, statutory: Object.fromEntries(Object.entries({ ...(draft.statutory || {}), [key]: event.target.value }).filter(([, value]) => value !== '')) })} />
          </FieldRow>)}
        </div>
      </fieldset>}

      <fieldset className="payroll-fieldset">
        <legend>Override tax</legend>
        <FieldRow label="Withholding tax" hint="Leave blank to use the computed tax. A figure here replaces it for this employee on this transaction.">
          <input type="number" min="0" step="0.01" value={draft.withholdingTax ?? ''} onChange={event => setDraft({ ...draft, withholdingTax: event.target.value === '' ? undefined : Number(event.target.value) })} />
        </FieldRow>
      </fieldset>

      {Array.isArray(run.currencies) && <fieldset className="payroll-fieldset">
        <legend>Pay in other currencies</legend>
        {foreignCurrencies.length ? <>
          <p className="payroll-note">The hours and amount paid in each currency. The amount is converted at the transaction's rate, added to gross pay, and paid out in that currency; the rest of net pay is paid in PHP.</p>
          <MiniTable
            columns={[
              { key: 'currency', label: 'Currency', render: row => <select value={row.currency} onChange={event => patchRow('currencyLines', row.index, { currency: event.target.value })}>{foreignCurrencies.map(item => <option key={item.code} value={item.code}>{item.code} ({item.symbol})</option>)}</select> },
              { key: 'description', label: 'Description', render: row => <input value={row.description || ''} placeholder="e.g. Project work" onChange={event => patchRow('currencyLines', row.index, { description: event.target.value })} /> },
              { key: 'hours', label: 'Hours', align: 'right', render: row => <input type="number" min="0" step="0.25" value={row.hours ?? ''} onChange={event => patchRow('currencyLines', row.index, { hours: event.target.value === '' ? '' : Number(event.target.value) })} /> },
              { key: 'amount', label: 'Amount', align: 'right', render: row => <input type="number" min="0" step="0.01" value={row.amount ?? ''} onChange={event => patchRow('currencyLines', row.index, { amount: event.target.value === '' ? '' : Number(event.target.value) })} /> },
              { key: 'rate', label: 'Rate used', align: 'right', render: row => foreignCurrencies.find(item => item.code === row.currency)?.rate ?? '—' },
              { key: 'php', label: 'PHP equivalent', align: 'right', render: row => peso((Number(row.amount) || 0) * (foreignCurrencies.find(item => item.code === row.currency)?.rate || 0)) },
              { key: 'remove', label: '', render: row => <button type="button" className="hrm-btn outline" onClick={() => removeRow('currencyLines', row.index)}>Remove</button> },
            ]}
            rows={draft.currencyLines.map((row, index) => ({ ...row, index, key: `fx-${index}` }))}
            empty="Paid in PHP only."
          />
          <button type="button" className="hrm-btn outline" onClick={() => addRow('currencyLines', { currency: foreignCurrencies[0].code, description: '', hours: '', amount: '' })}>+ Add currency pay</button>
        </> : <p className="payroll-note">This transaction pays in PHP only. Add a currency to the transaction (Currencies in this run › Edit currencies) to pay part of this employee's pay in it.</p>}
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
        <span>Last edited on</span><strong>{stampUs(run.updatedAt)}</strong>
      </p>
    </div>
  </Modal>;
}

/**
 * The pay items across the whole run, and which of them the run includes.
 * Leaving one out applies to every employee on this run only; take-home pay
 * protection can be switched off for the run by P&A.
 */
/**
 * Reclassification order and limits for this run only. The Earning Configuration
 * keeps the default rank and limit; a reorder or a lowered limit lives on the
 * transaction, needs a reason, and is audited. P&A may reorder; a client may
 * only lower a limit, never raise it above the configured one.
 */
function RunReclassificationPanel({ run, editable, isPaAdmin, onNotify, onSave }) {
  const companyId = readActiveCompanyId();
  const setups = useMemo(() => readServiceConfiguration('earnings', companyId)
    .filter(item => item.eligibleForReclassification === 'Yes' && item.status !== 'Inactive')
    .sort((left, right) => (Number(left.reclassPriority) || 999) - (Number(right.reclassPriority) || 999)), [companyId]);
  const defaultOrder = setups.map(item => item.code);
  const savedOrder = run.config?.reclassification?.runOrder || [];
  const savedLimits = run.config?.reclassification?.runLimits || {};
  const startOrder = () => [...savedOrder.filter(code => defaultOrder.includes(code)), ...defaultOrder.filter(code => !savedOrder.includes(code))];
  const [order, setOrder] = useState(startOrder);
  const [limits, setLimits] = useState(savedLimits);
  const [reason, setReason] = useState('');
  useEffect(() => { setOrder(startOrder()); setLimits(run.config?.reclassification?.runLimits || {}); }, [run.config?.reclassification?.runOrder, run.config?.reclassification?.runLimits]);
  if (!run.config?.reclassification?.enabled) return null;

  const byCode = Object.fromEntries(setups.map(item => [item.code, item]));
  const reordered = JSON.stringify(order) !== JSON.stringify(defaultOrder);
  const cleanLimits = Object.fromEntries(Object.entries(limits).filter(([, value]) => value !== '' && value != null));
  const dirty = JSON.stringify(reordered ? order : []) !== JSON.stringify(savedOrder) || JSON.stringify(cleanLimits) !== JSON.stringify(savedLimits);
  const move = (code, step) => setOrder(previous => {
    const at = previous.indexOf(code);
    const to = at + step;
    if (to < 0 || to >= previous.length) return previous;
    const next = [...previous];
    [next[at], next[to]] = [next[to], next[at]];
    return next;
  });
  const limitProblem = code => {
    const setup = byCode[code];
    const value = cleanLimits[code];
    if (value === undefined) return '';
    if (!(Number(value) >= 0)) return 'Enter zero or more.';
    if (setup.reclassCapBasis === 'Amount per payroll' && Number(value) > Number(setup.reclassCap)) return `Cannot exceed the configured ${peso(Number(setup.reclassCap))}.`;
    if (setup.reclassCapBasis === 'Percent of the earning' && Number(value) > Number(setup.reclassCap)) return `Cannot exceed the configured ${Number(setup.reclassCap)}%.`;
    return '';
  };
  const save = () => {
    if (!reason.trim()) { onNotify('Give the reason for changing the reclassification on this run.', 'bad'); return; }
    if (reordered && !isPaAdmin) { onNotify('Only P&A can reorder the reclassification hierarchy on a run.', 'bad'); return; }
    const problem = Object.keys(cleanLimits).map(limitProblem).find(Boolean);
    if (problem) { onNotify(problem, 'bad'); return; }
    onSave({ runReclass: { runOrder: reordered ? order : [], runLimits: cleanLimits, reason: reason.trim(), names: Object.fromEntries(setups.map(item => [item.code, item.name])), defaultOrder } });
    setReason('');
  };
  const unit = setup => (setup.reclassCapBasis === 'Percent of the earning' ? '%' : '₱');

  return <section className="hrm-section payroll-currency-panel">
    <div className="payroll-currency-panel-head"><h3 className="hrm-section-title">Reclassification order in this run</h3></div>
    <p className="payroll-note">The Earning Configuration sets the default order and limit. Reordering or lowering a limit here applies to this transaction only and is recorded with your reason. {isPaAdmin ? '' : 'Only P&A can reorder; you can lower a limit.'}</p>
    <MiniTable
      columns={[
        { key: 'rank', label: 'Rank', render: row => order.indexOf(row.code) + 1 },
        { key: 'name', label: 'Earning', render: row => `${row.code} · ${row.name}` },
        { key: 'direction', label: 'Moves', render: row => row.reclassDirection || 'Taxable to non-taxable' },
        { key: 'cap', label: 'Configured limit', render: row => (row.reclassCapBasis === 'Amount per payroll' ? `${peso(Number(row.reclassCap) || 0)} per payroll` : row.reclassCapBasis === 'Percent of the earning' ? `${Number(row.reclassCap) || 0}% of the earning` : 'No limit') },
        { key: 'run', label: 'Limit for this run', render: row => <span><input type="number" min="0" style={{ width: 90 }} disabled={!editable} value={limits[row.code] ?? ''} placeholder="Same" aria-label={`${row.name} limit for this run`} onChange={event => setLimits(previous => ({ ...previous, [row.code]: event.target.value }))} /> {row.reclassCapBasis === 'No limit' ? '₱' : unit(row)}{limitProblem(row.code) && <small className="payroll-note-warn"> {limitProblem(row.code)}</small>}</span> },
        { key: 'order', label: 'Order', render: row => <span><button type="button" className="hrm-btn outline" disabled={!editable || !isPaAdmin || order.indexOf(row.code) === 0} aria-label={`Move ${row.name} up`} onClick={() => move(row.code, -1)}>↑</button> <button type="button" className="hrm-btn outline" disabled={!editable || !isPaAdmin || order.indexOf(row.code) === order.length - 1} aria-label={`Move ${row.name} down`} onClick={() => move(row.code, 1)}>↓</button></span> },
      ]}
      rows={order.map(code => byCode[code]).filter(Boolean).map(item => ({ ...item, key: item.code }))}
      empty="No earning is marked Eligible for reclassification."
    />
    {dirty && <div className="payroll-field-grid payroll-run-items-controls"><FieldRow label="Reason" required><input value={reason} onChange={event => setReason(event.target.value)} placeholder="Why this run differs from the Earning Configuration" /></FieldRow></div>}
    {dirty && <div className="hrm-toolbar end"><button type="button" className="hrm-btn primary" onClick={save}>Save and recalculate</button></div>}
    {!editable && <p className="payroll-note">Reclassification can be changed while the transaction is Open.</p>}
  </section>;
}

function RunPayItemsPanel({ run, result, editable, isPaAdmin, onNotify, onSave }) {
  const items = useMemo(() => {
    const byKey = new Map();
    result.lines.filter(line => line.status === 'Computed').forEach(line => payItemsOfLine(line).forEach(row => {
      const entry = byKey.get(row.key) || { key: row.key, group: row.group, name: row.name, employees: 0, total: 0 };
      byKey.set(row.key, { ...entry, employees: entry.employees + 1, total: entry.total + (row.runExcluded ? 0 : row.current) });
    }));
    return [...byKey.values()].sort((left, right) => left.group.localeCompare(right.group) || left.name.localeCompare(right.name));
  }, [result]);
  const saved = run.config?.excludedPayItems || [];
  const savedTakeHome = run.config?.takeHome?.mode || 'policy';
  const [excluded, setExcluded] = useState(saved);
  const [takeHomeMode, setTakeHomeMode] = useState(savedTakeHome);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(saved.length > 0 || savedTakeHome !== 'policy');
  useEffect(() => { setExcluded(run.config?.excludedPayItems || []); setTakeHomeMode(run.config?.takeHome?.mode || 'policy'); }, [run.config?.excludedPayItems, run.config?.takeHome?.mode]);
  const dirty = JSON.stringify([...excluded].sort()) !== JSON.stringify([...saved].sort()) || takeHomeMode !== savedTakeHome;
  const save = () => {
    if (!reason.trim()) { onNotify('Give the reason for changing the pay items on this run.', 'bad'); return; }
    if (takeHomeMode === 'off' && !isPaAdmin) { onNotify('Only P&A can switch take-home pay protection off.', 'bad'); return; }
    onSave({ runItems: { excludedPayItems: excluded, takeHome: takeHomeMode === 'policy' ? undefined : { mode: takeHomeMode, reason: reason.trim() }, reason: reason.trim() } });
    setReason('');
  };
  return <section className="hrm-section payroll-currency-panel">
    <div className="payroll-currency-panel-head">
      <h3 className="hrm-section-title">Pay items in this run</h3>
      <button type="button" className="hrm-btn outline" onClick={() => setOpen(value => !value)}>{open ? 'Hide' : `Show ${items.length} ${plural(items.length, 'item')}`}</button>
    </div>
    {open && <>
      <p className="payroll-note">Untick an item to leave it out of this run for every employee. It stays in setup, and a deduction or loan keeps its balance for the next run. To change one employee's amount, use Edit payroll on their line.</p>
      <MiniTable
        columns={[
          { key: 'include', label: 'Include', render: row => <input type="checkbox" disabled={!editable} checked={!excluded.includes(row.key)} onChange={event => setExcluded(previous => (event.target.checked ? previous.filter(key => key !== row.key) : [...previous, row.key]))} aria-label={`Include ${row.name}`} /> },
          { key: 'group', label: 'Type' },
          { key: 'name', label: 'Pay item' },
          { key: 'employees', label: 'Employees', align: 'right' },
          { key: 'total', label: 'Total this run', align: 'right', render: row => (excluded.includes(row.key) ? '—' : peso(row.total)) },
        ]}
        rows={items}
        empty="No earnings, bonuses, deductions or loans from setup on this run."
      />
      <div className="payroll-field-grid payroll-run-items-controls">
        <FieldRow label="Take-home pay protection on this run">
          <select disabled={!editable} value={takeHomeMode} onChange={event => setTakeHomeMode(event.target.value)}>
            <option value="policy">Apply the policy engine</option>
            <option value="off" disabled={!isPaAdmin}>Don't apply take-home protection{isPaAdmin ? '' : ' (P&A only)'}</option>
          </select>
        </FieldRow>
        {dirty && <FieldRow label="Reason" required><input value={reason} onChange={event => setReason(event.target.value)} placeholder="Why this run differs from setup" /></FieldRow>}
      </div>
      {dirty && <div className="hrm-toolbar end"><button type="button" className="hrm-btn primary" onClick={save}>Save and recalculate</button></div>}
      {!editable && <p className="payroll-note">Pay items can be changed while the transaction is Open.</p>}
    </>}
  </section>;
}

function RunDetail({ run, runs, context, hrmData, onBack, onAction, onNotify, onSaveOverride, actor, isPaAdmin, onRaiseCorrection, onCancelCorrection }) {
  const [tab, setTab] = useState('employees');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [editing, setEditing] = useState(null);
  const [reportKey, setReportKey] = useState(payrollReportCatalog[0].key);
  const [remarksFor, setRemarksFor] = useState(null);
  const [editingCurrencies, setEditingCurrencies] = useState(null);
  const [correcting, setCorrecting] = useState(null);
  const [correctionDraft, setCorrectionDraft] = useState({ item: '', direction: 'Pay the employee', amount: '', taxable: 'Yes', reason: '' });
  const [correctionsVersion, setCorrectionsVersion] = useState(0);
  const correctionsHere = useMemo(() => readCorrections(readActiveCompanyId()), [correctionsVersion, run.id, run.status]);
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
    taxForecast: line.status === 'Computed' ? peso(line.taxForecast || 0) : '—',
    deductions: line.status === 'Computed' ? peso(line.deductions.reduce((sum, item) => sum + item.deducted, 0)) : '—',
    loans: line.status === 'Computed' ? peso(line.loans.reduce((sum, item) => sum + item.deducted, 0)) : '—',
    netPay: line.status === 'Computed' ? peso(line.netPay) : '—',
    flags: line.status === 'Computed'
      ? [line.finalPay && 'Final pay', line.onHold && 'On hold', line.proration && 'Pro-rated', line.grossUp && 'Grossed up', run.overrides?.[line.employeeId] && 'Manually edited', (line.payItemAdjustments || []).some(change => change.scope === 'employee') && 'Pay items changed', line.takeHomeOverride && 'Take-home changed', ...(line.currencyPayouts || []).slice(1).map(payout => `${formatCurrency(payout.amount, payout.currency, payout.symbol)} in ${payout.currency}${payout.hours ? ` (${payout.hours} hrs)` : ''}`)].filter(Boolean).join(' · ') || '—'
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
      const { entries: parsed, errors } = parsePayrollBatch(String(reader.result || ''), { employees: employeeRoster, payrollType: run.payrollType, conversion: { enabled: Boolean(run.config?.leaveConversion?.enabled), leaveTypes: run.config?.leaveConversion?.leaveTypes || [], window: run.config?.leaveConversion?.window || {} } });
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
      if (errors.length) { rejectUpload(file.name, errors, () => {}); onNotify(`${file.name}: ${errors.length} ${plural(errors.length, 'problem')} found, nothing was committed. The error log has been downloaded — ${errors[0]}`, 'bad'); return; }
      onNotify(`${file.name} validated — ${parsed.length} ${plural(parsed.length, 'row')} ready to commit.`, 'ok');
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
      isPaAdmin={isPaAdmin}
      onClose={() => setEditing(null)}
      onSave={draft => { onSaveOverride({ employeeId: editing.employeeId, override: draft }); setEditing(null); }}
    />}
    {correcting && <Modal
      title={`Raise a correction — ${correcting.name}`}
      onClose={() => setCorrecting(null)}
      width="md"
      footer={<>
        <GhostButton onClick={() => setCorrecting(null)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn primary" onClick={() => {
          const signed = (correctionDraft.direction === 'Pay the employee' ? 1 : -1) * Math.abs(Number(correctionDraft.amount) || 0);
          const outcome = onRaiseCorrection(run, correcting, { item: correctionDraft.item, amount: signed, taxable: correctionDraft.taxable === 'Yes', reason: correctionDraft.reason });
          if (outcome) { setCorrecting(null); setCorrectionDraft({ item: '', direction: 'Pay the employee', amount: '', taxable: 'Yes', reason: '' }); setCorrectionsVersion(value => value + 1); }
        }}>Raise correction</button>
      </>}
    >
      <p className="hrm-modal-message">{run.transactionNumber} is {run.status.toLowerCase()} and will not change. The correction waits as Pending and the next payroll for {correcting.name} carries it as an adjustment line naming this transaction and period. It is Applied when that payroll is posted.</p>
      <div className="payroll-field-grid">
        <FieldRow label="What is being corrected" required><input value={correctionDraft.item} onChange={event => setCorrectionDraft({ ...correctionDraft, item: event.target.value })} placeholder="e.g. Unpaid overtime on 12 Nov" /></FieldRow>
        <FieldRow label="Direction"><select value={correctionDraft.direction} onChange={event => setCorrectionDraft({ ...correctionDraft, direction: event.target.value })}><option>Pay the employee</option><option>Recover from the employee</option></select></FieldRow>
        <FieldRow label="Amount" required><input type="number" min="0" step="0.01" value={correctionDraft.amount} onChange={event => setCorrectionDraft({ ...correctionDraft, amount: event.target.value })} /></FieldRow>
        {correctionDraft.direction === 'Pay the employee' && <FieldRow label="Taxable"><select value={correctionDraft.taxable} onChange={event => setCorrectionDraft({ ...correctionDraft, taxable: event.target.value })}><option>Yes</option><option>No</option></select></FieldRow>}
        <FieldRow label="Reason" required><input value={correctionDraft.reason} onChange={event => setCorrectionDraft({ ...correctionDraft, reason: event.target.value })} /></FieldRow>
      </div>
    </Modal>}
    {editingCurrencies && <Modal
      title="Currencies in this run"
      onClose={() => setEditingCurrencies(null)}
      width="md"
      footer={<>
        <GhostButton onClick={() => setEditingCurrencies(null)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn primary" onClick={() => {
          const problem = runCurrencyProblem(editingCurrencies);
          if (problem) { onNotify(problem, 'bad'); return; }
          onSaveOverride({ currencies: editingCurrencies.map(item => ({ ...item, rate: Number(item.rate) })) });
          setEditingCurrencies(null);
        }}>Save and recalculate</button>
      </>}
    >
      <p className="hrm-modal-message">Type the rate used for this transaction. Changing a rate reprices every employee's pay in that currency; removing a currency flags any employee still paid in it.</p>
      <CurrencyListEditor currencies={editingCurrencies} onChange={setEditingCurrencies} />
    </Modal>}
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
          <BackdatedBadge run={run} />
          <span className="status-pill">{run.payrollType}</span>
          <span className="status-pill">{run.paymentMode}</span>
          <span className="status-pill">{Array.isArray(run.currencies) ? runCurrenciesOf(run).map(item => item.code).join(' · ') : run.currency || 'PHP'}</span>
        </div>
        <p className="page-description">
          {run.month} {run.year} · {run.frequency} · payroll period {formatUsDate(run.periodStart)} to {formatUsDate(run.periodEnd)} · timekeeping cut-off {formatUsDate(run.timekeepingStart)} to {formatUsDate(run.timekeepingEnd)} · payout {formatUsDate(run.payoutDate)}
          {run.lockDate && ` · locks ${formatUsDate(run.lockDate)}`}
        </p>
        {run.batchId && <p className="payroll-filed-by">Created together with {runs.filter(row => row.batchId === run.batchId && row.id !== run.id).map(row => row.transactionNumber).join(', ') || 'other transactions (since removed)'}.</p>}
        {run.createdBy && <p className="payroll-filed-by">Filed by <strong>{run.createdBy}</strong>, {filedOn(run.createdAt)}</p>}
      </div>
      <div className="payroll-run-actions">
        {actionsFor(run, runs, { canReopen: true, isPaAdmin }).filter(action => action.key !== 'updateEntry').map(action => <button
          key={action.key}
          type="button"
          className={`hrm-btn ${action.tone === 'danger' ? 'danger' : action.key === 'recalculate' ? 'primary' : 'outline'}`}
          title={action.hint}
          disabled={action.disabled}
          onClick={() => {
            if (['reject', 'cancel', 'submitReview', 'submitApproval', 'approve', 'approveBackdate', 'rejectBackdate'].includes(action.key)) { setRemarksFor(action); return; }
            onAction(run, action.key);
          }}
        >
          {action.key === 'recalculate' && <ArrowClockwise size={14} />}{action.label}
        </button>)}
      </div>
    </div>

    {(run.overlapWarnings || []).length > 0 && <div className="payroll-overlap-note" role="alert">
      <strong>Filed with an overlap warning</strong>
      <ul>{run.overlapWarnings.map(message => <li key={message}>{message}</li>)}</ul>
    </div>}
    {(run.postedAhead || []).length > 0 && <div className="payroll-overlap-note" role="alert">
      <strong>Posted ahead of an earlier period</strong>
      <p>{run.postedAhead.join(', ')} was not posted when this transaction was, so this run's year to date leaves it out. Recalculating after it posts is not possible once this run is posted — review the difference before closing the period.</p>
    </div>}
    {run.backdated && <div className={`payroll-backdate-note ${run.backdated.approval?.status === 'Pending' ? 'pending' : ''}`}>
      <div>
        <strong>Backdated · {BACKDATE_APPROVAL_LABEL[run.backdated.approval?.status] || ''}</strong>
        <p>Filed after {run.backdated.against.transactionNumber} was posted (payout {formatUsDate(run.backdated.against.payoutDate)}). Reason: {sentence(run.backdated.reason || '—')}
          {run.backdated.approval?.by && ` ${run.backdated.approval.status} by ${run.backdated.approval.by}, ${filedOn(run.backdated.approval.at)}${run.backdated.approval.remarks ? ` — ${sentence(run.backdated.approval.remarks)}` : '.'}`}
          {run.backdated.approval?.status === 'Pending' && (isPaAdmin ? ' Approve or reject the backdating above.' : ' It can be recalculated, but not posted as draft until P&A approves it.')}</p>
      </div>
    </div>}

    {result && <div className="tk-kpi-row">
      <div className="tk-kpi-card"><span>Employees paid</span><strong>{result.totals.headcount}</strong><small>{result.totals.excluded} excluded</small></div>
      <div className="tk-kpi-card"><span>Gross pay</span><strong>{peso(result.totals.grossPay)}</strong><small>basic {peso(result.totals.basicPay)}</small></div>
      <div className="tk-kpi-card"><span>Statutory (EE)</span><strong>{peso(result.totals.statutoryEmployee)}</strong><small>employer {peso(result.totals.statutoryEmployer)}</small></div>
      <div className="tk-kpi-card"><span>Withholding tax</span><strong>{peso(result.totals.withholdingTax)}</strong></div>
      <div className="tk-kpi-card"><span>Deductions & loans</span><strong>{peso(result.totals.deductions + result.totals.loans)}</strong><small>{peso(result.totals.deferred)} deferred</small></div>
      <div className="tk-kpi-card"><span>Net pay</span><strong className="tone-up">{result.currency !== 'PHP' ? money(result.settlementTotals.netPay, result.currency) : peso(result.totals.netPay)}</strong><small>{result.currency !== 'PHP' ? `PHP base ${peso(result.totals.netPay)} · rate ${result.conversionRate}` : `employer cost ${peso(result.totals.employerCost)}`}</small></div>
    </div>}

    {!result && <EmptyState title="This transaction has not been computed yet" icon={Warning}>Use Recalculate to compute it against the current masterfile, timekeeping and configuration.</EmptyState>}

    {Array.isArray(run.currencies) && <section className="hrm-section payroll-currency-panel">
      <div className="payroll-currency-panel-head">
        <h3 className="hrm-section-title">Currencies in this run</h3>
        {capability.updateTransaction && <button type="button" className="hrm-btn outline" onClick={() => setEditingCurrencies(withBase(run.currencies))}>Edit currencies</button>}
      </div>
      <MiniTable
        columns={[
          { key: 'code', label: 'Currency', render: row => `${row.code} (${row.symbol})` },
          { key: 'rate', label: 'Rate to PHP', align: 'right', render: row => (row.code === 'PHP' ? '1.00' : row.rate) },
          { key: 'employees', label: 'Employees', align: 'right' },
          { key: 'hours', label: 'Hours', align: 'right', render: row => row.hours || '—' },
          { key: 'amount', label: 'Net pay in currency', align: 'right', render: row => formatCurrency(row.amount, row.code, row.symbol) },
          { key: 'phpAmount', label: 'PHP equivalent', align: 'right', render: row => peso(row.phpAmount) },
        ]}
        rows={(result?.currencyTotals || runCurrenciesOf(run).map(item => ({ ...item, employees: 0, hours: 0, amount: 0, phpAmount: 0 }))).map(row => ({ ...row, key: row.code }))}
      />
    </section>}

    {result && <RunReclassificationPanel run={run} editable={capability.updateTransaction} isPaAdmin={isPaAdmin} onNotify={onNotify} onSave={onSaveOverride} />}
    {result && <RunPayItemsPanel run={run} result={result} editable={capability.updateTransaction} isPaAdmin={isPaAdmin} onNotify={onNotify} onSave={onSaveOverride} />}

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
          ...(['Posted', 'Locked'].includes(run.status) && row.line.status === 'Computed' ? [{ label: 'Raise correction', kind: 'edit', onSelect: () => setCorrecting(row.line) }] : []),
          ...(capability.edit && row.line.status === 'Computed' ? [{ label: 'Edit payroll', kind: 'edit', onSelect: () => setEditing(row.line) }] : []),
        ]}
      />
    </>}

    {tab === 'timekeeping' && <section className="hrm-section">
      <h3 className="hrm-section-title">Timekeeping and HRM data for this transaction</h3>
      <p className="page-description">
        Imported from the punch record for {formatUsDate(run.timekeepingStart)} to {formatUsDate(run.timekeepingEnd)}. Nothing is copied into the transaction — the run reads the punches directly, so a corrected punch changes the payroll line the next time it is recalculated.
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
            downloadFile('payroll-batch-template.csv', 'Employee Code,Pay Item Type,Pay Item,Amount,Conversion Date,Rate\n0011223345,Earning,Sample allowance,0,,\n0011223345,Leave Conversion,Vacation Leave,5,11/15/2025,\n0011223345,Variable Allowance,Lecture Fee,12,,100\n0011223345,Tax Forecast,Forecast tax,1500,,\n', 'text/csv');
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
          { key: 'uploadedAt', label: 'Date uploaded', render: row => stampUs(row.uploadedAt) },
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
        <h3 className="hrm-section-title">Corrections</h3>
        <MiniTable
          columns={[
            { key: 'employeeName', label: 'Employee' }, { key: 'item', label: 'Correction' },
            { key: 'amount', label: 'Amount', align: 'right', render: row => (row.amount < 0 ? `(${peso(-row.amount)}) recover` : peso(row.amount)) },
            { key: 'direction', label: 'Relation' }, { key: 'status', label: 'Status' }, { key: 'reason', label: 'Reason' },
            { key: 'raisedBy', label: 'Raised by' },
            { key: 'action', label: '', render: row => (row.status === 'Pending' && row.relation === 'from' ? <button type="button" className="hrm-btn outline" onClick={() => { onCancelCorrection(row.id); setCorrectionsVersion(value => value + 1); }}>Cancel</button> : '') },
          ]}
          rows={correctionsHere
            .filter(item => item.originRunId === run.id || (run.result?.lines || []).some(line => (line.corrections || []).includes(item.id)) || item.appliedTo === run.transactionNumber)
            .map(item => ({ ...item, key: item.id, relation: item.originRunId === run.id ? 'from' : 'into', direction: item.originRunId === run.id ? `Raised on this run${item.appliedTo ? ` → applied in ${item.appliedTo}` : ''}` : `Carried in from ${item.originTransaction}` }))}
          empty="No correction was raised on or carried into this transaction."
        />
      </section>
      <section className="hrm-section">
        <h3 className="hrm-section-title">Review and approval</h3>
        <MiniTable
          columns={[
            { key: 'level', label: 'Level' },
            { key: 'actor', label: 'Actor' },
            { key: 'decision', label: 'Decision' },
            { key: 'remarks', label: 'Remarks' },
            { key: 'at', label: 'Timestamp', render: row => stampUs(row.at) },
          ]}
          rows={(run.approvals || []).map((row, index) => ({ ...row, key: `ap-${index}` }))}
          empty="This transaction has not entered review yet."
        />
      </section>
      <section className="hrm-section">
        <h3 className="hrm-section-title">Change log</h3>
        <MiniTable
          columns={[
            { key: 'at', label: 'Timestamp', render: row => stampUs(row.at) },
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
  const { role, actor, isPaAdmin } = useRole();
  const companyId = scopedCompanyId || readActiveCompanyId();
  const company = readActiveCompany();
  const { toasts, push, dismiss } = useToasts();
  const [runs, setRuns] = useState(() => readPayrollRuns(companyId));
  // The dashboard's "Open" names the transaction it means; it is read once, then forgotten.
  const requestedRun = useMemo(() => {
    try {
      const id = sessionStorage.getItem(OPEN_RUN_KEY) || '';
      sessionStorage.removeItem(OPEN_RUN_KEY);
      return runs.some(run => run.id === id) ? id : '';
    } catch { return ''; }
  }, []);
  const [view, setView] = useState(requestedRun ? 'run' : 'register');
  const [openRunId, setOpenRunId] = useState(requestedRun);
  const [bulk, setBulk] = useState(null);
  const autoKey = `atlas-payroll-autocompute-v1:${companyId}`;
  const [autoCompute, setAutoCompute] = useState(() => { try { return localStorage.getItem(autoKey) === 'on'; } catch { return false; } });

  // The company decides in Payroll Controls whether a backdated run waits for
  // P&A; with no approval-hierarchy control saying otherwise, it does.
  const requiresBackdateApproval = useMemo(() => {
    const controls = readServiceConfiguration('payrollControls', companyId)
      .filter(item => item.type === 'Approval Hierarchy' && item.status !== 'Inactive');
    return !controls.length || controls.some(item => item.backdatedApproval !== 'No');
  }, [companyId]);
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
  // Each run reads the policy engine versions in force on its payout date.
  const contextFor = run => buildPayrollContext({
    companyId, run, hrmData, registers, hierarchy, policies: run.payoutDate ? readPolicies(companyId, run.payoutDate) : policies, computations, staggeredRequests,
    serviceConfig,
    variableAllowances: referenceRows('variable-allowances').map(row => ({ code: row.code, name: row.name, taxable: row.taxable })),
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
    const outcome = applyAction(run, actionKey, { actor, remarks, runs, isPaAdmin, context: contextFor(run) });
    if (outcome.error) { toast(outcome.error, 'bad'); return; }
    if (actionKey === 'generateBankFile') {
      const file = bankFileFor(outcome.run.result);
      downloadFile(`${run.transactionNumber}-bank-file.csv`, toCsv(['Employee Code', 'Name', 'Bank', 'Account Number', 'Share', 'Currency', 'Amount', 'PHP Base Amount'], file.map(row => [row.employeeCode, row.name, row.bankName, row.accountNumber, row.share, row.currency, row.amount, row.baseAmount])), 'text/csv');
    }
    commit(outcome.run);
    if (actionKey === 'recalculate') publishTakeHomeWarnings(outcome.run);
    if (actionKey === 'post') {
      // Converted leave leaves the HRM balance when the payroll that paid it is posted.
      const { balances, deducted } = leaveBalancesAfterConversion(readHrmData(companyId).leaveBalances || [], outcome.run);
      if (deducted.length) {
        updateHrmData(companyId, data => ({ ...data, leaveBalances: balances }));
        commit(withAudit(outcome.run, { action: 'Leave credits converted', actor, detail: `${deducted.length} ${deducted.length === 1 ? 'balance' : 'balances'} reduced in HRM: ${deducted.map(item => `${employeeRoster.find(employee => employee.employeeId === item.employeeId)?.name || item.employeeId} ${item.leaveType} ${item.days} days`).join('; ')}` }));
      }
    }
    toast(outcome.message);
    appendAuditEvent?.({ entity: 'Payroll Transaction', entityId: run.transactionNumber, action: actionKey, actor, detail: outcome.message });
    if (actionKey === 'post') {
      const carried = (outcome.run.result?.lines || []).flatMap(line => line.corrections || []);
      if (carried.length) writeCorrections(companyId, markCorrectionsApplied(readCorrections(companyId), carried, run.transactionNumber));
      publishNotificationEvent?.({ eventKey: 'PayrollPosted', companyId, correlationId: run.id, summary: outcome.message, actor });
    }
  };

  /**
   * Recalculates several transactions one after another, yielding between
   * runs so a large payroll shows its progress instead of freezing the page
   * (Large Data Processing). The auto-compute "bot" uses the same runner when
   * Payroll Processing opens.
   */
  const recalculateMany = async (targets, { auto = false } = {}) => {
    if (!targets.length) return;
    const by = auto ? `Auto-compute (on behalf of ${actor})` : actor;
    let employees = 0;
    let failed = 0;
    setBulk({ auto, done: 0, total: targets.length, employees: 0, current: targets[0].transactionNumber });
    for (let index = 0; index < targets.length; index += 1) {
      await new Promise(resolve => setTimeout(resolve, 40));
      const current = readPayrollRuns(companyId).find(run => run.id === targets[index].id);
      if (current && capabilitiesOf(current).recalculate) {
        const outcome = applyAction(current, 'recalculate', { actor: by, runs: readPayrollRuns(companyId), isPaAdmin, context: contextFor(current) });
        if (outcome.error) failed += 1;
        else { savePayrollRun(companyId, outcome.run); employees += outcome.run.result?.lines.length || 0; }
      }
      setBulk({ auto, done: index + 1, total: targets.length, employees, current: targets[index + 1]?.transactionNumber || '' });
    }
    setRuns(readPayrollRuns(companyId).slice());
    setBulk(null);
    appendAuditEvent?.({ entity: 'Payroll Transaction', entityId: targets.map(run => run.transactionNumber).join(', '), action: auto ? 'autoCompute' : 'bulkRecalculate', actor: by, detail: `${targets.length - failed} of ${targets.length} transactions recalculated, ${employees} employee lines` });
    toast(`${auto ? 'Auto-compute recalculated' : 'Recalculated'} ${targets.length - failed} of ${targets.length} open ${plural(targets.length, 'transaction')} (${employees} employee lines).${failed ? ` ${failed} could not be computed.` : ''}`, failed ? 'bad' : 'ok');
  };

  const toggleAutoCompute = on => {
    setAutoCompute(on);
    try { localStorage.setItem(autoKey, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
    toast(on ? 'Auto-compute is on: open transactions recalculate whenever Payroll Processing opens.' : 'Auto-compute is off.');
  };

  // The bot: once per visit, recalculate what is still open.
  useEffect(() => {
    if (!autoCompute) return;
    const open = readPayrollRuns(companyId).filter(run => capabilitiesOf(run).recalculate);
    if (open.length) recalculateMany(open, { auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const raiseCorrectionFor = (run, line, values) => {
    const outcome = raiseCorrection(readCorrections(companyId), { run, line, ...values, actor });
    if (outcome.error) { toast(outcome.error, 'bad'); return false; }
    writeCorrections(companyId, outcome.corrections);
    appendAuditEvent?.({ entity: 'Payroll Correction', entityId: outcome.correction.id, action: 'Correction raised', actor, detail: `${line.name} · ${values.item} · ₱${Number(values.amount).toLocaleString()} against ${run.transactionNumber} — ${values.reason}` });
    toast(`Correction raised for ${line.name}. The next payroll carries it as an adjustment.`);
    return true;
  };
  const cancelCorrectionFor = id => {
    writeCorrections(companyId, cancelCorrection(readCorrections(companyId), id, actor));
    toast('Correction cancelled.');
  };

  // A run filed with an overlap warning says so in its audit trail as well as on its screen.
  const withWarnings = (run, warnings) => (warnings.length
    ? withAudit(run, { action: 'Filed with an overlap warning', actor, detail: warnings.join(' ') })
    : run);

  const handleCreate = draft => {
    // Company-level settings the run keeps a copy of, so a later change to
    // Payroll Controls or the reference table does not alter a filed run.
    const controls = readServiceConfiguration('payrollControls', companyId).filter(item => item.status !== 'Inactive');
    const ecolaTreatment = controls.find(item => item.ecolaTreatment)?.ecolaTreatment || 'Part of Basic Pay';
    // Company defaults for the rate divisors; the employee's pay record and shift still win.
    const conversionWindow = draft.config.leaveConversion.enabled ? leaveConversionWindow(draft.config.leaveConversion, readServiceConfiguration('leaveBenefits', companyId)) : null;
    const workDaysPerYear = Number(controls.find(item => Number(item.factorDays) > 0)?.factorDays) || draft.config.workDaysPerYear;
    const workHoursPerDay = Number(controls.find(item => Number(item.workHoursPerDay) > 0)?.workHoursPerDay) || draft.config.workHoursPerDay;
    const bonusCeilingOrder = referenceRows('bonus-ceiling-order').sort((left, right) => Number(left.priority) - Number(right.priority)).map(row => row.name);
    const funds = controls.filter(item => item.type === 'Provident / Pension Fund').map(item => ({ code: item.code, name: item.name, fundType: item.fundType || 'Provident Fund', basis: item.fundBasis || 'Basic Pay', employeeRate: item.employeeRate || 0, employerRate: item.employerRate || 0 }));
    const drafts = batchDrafts(draft);
    const numbers = numberBatch(drafts, runs);
    const filed = [];
    const failures = [];
    drafts.forEach((item, index) => {
    const warnings = overlapWarnings({ ...item, transactionMode: 'Single', additional: undefined }, [...runs, ...filed]);
    const created = withWarnings(fileRun({ ...item, transactionNumber: numbers[index], companyId, overlapWarnings: warnings, config: { ...draft.config, leaveConversion: conversionWindow ? { ...draft.config.leaveConversion, window: { start: conversionWindow.start, end: conversionWindow.end, source: conversionWindow.source } } : draft.config.leaveConversion, workDaysPerYear, workHoursPerDay, ecolaTreatment, bonusCeilingOrder, funds } }, { runs, actor, isPaAdmin, requiresApproval: requiresBackdateApproval }), warnings);
    const outcome = applyAction(created, 'recalculate', { actor, runs: [...runs, ...filed], context: contextFor(created) });
    const stored = outcome.error ? created : outcome.run;
    commit(stored);
    filed.push(stored);
    if (!outcome.error) publishTakeHomeWarnings(stored);
    if (outcome.error) failures.push(`${stored.transactionNumber}: ${outcome.error}`);
    });
    const first = filed[0];
    setOpenRunId(first.id);
    setView('run');
    if (filed.length > 1) toast(`${filed.length} transactions created together: ${filed.map(item => item.transactionNumber).join(', ')}${failures.length ? `. Not computed — ${failures.join('; ')}` : '. Each is computed and can be opened from the transaction list.'}`, failures.length ? 'bad' : 'ok');
    else toast(failures.length ? `${first.transactionNumber} created, but it could not be computed: ${failures[0].split(': ').slice(1).join(': ')}` : `${first.transactionNumber} created and computed. Review the figures before drafting.`, failures.length ? 'bad' : 'ok');
  };

  const handleOverride = payload => {
    if (!openRun) return;
    let next = openRun;
    if (payload.employeeId) {
      if (payload.override?.takeHome?.mode === 'off' && !isPaAdmin) { toast('Only P&A can switch take-home pay protection off.', 'bad'); return; }
      next = { ...next, overrides: { ...(next.overrides || {}), [payload.employeeId]: payload.override } };
      const currentLine = openRun.result?.lines.find(line => line.employeeId === payload.employeeId);
      const itemNames = new Map(currentLine ? payItemsOfLine(currentLine).map(row => [row.key, row.name]) : []);
      const changes = Object.entries(payload.override?.payItems || {}).map(([key, change]) => `${itemNames.get(key) || key.split(':').slice(1).join(':')}: ${change.exclude ? 'skipped' : `₱${Number(change.amount).toLocaleString()}`} (${change.reason})`);
      const entered = Object.keys(payload.override?.statutory || {});
      if (entered.length) {
        const name = employeeRoster.find(employee => employee.employeeId === payload.employeeId)?.name || payload.employeeId;
        next = withAudit(next, { action: 'Contributions entered for one employee', actor, detail: `${name} — ${entered.map(key => `${STATUTORY_OVERRIDE_LABELS[key]} ₱${Number(payload.override.statutory[key]).toLocaleString()}`).join(', ')}` });
      }
      const takeHome = payload.override?.takeHome;
      if (changes.length || takeHome) {
        const name = employeeRoster.find(employee => employee.employeeId === payload.employeeId)?.name || payload.employeeId;
        next = withAudit(next, { action: 'Pay items changed for one employee', actor, detail: `${name} — ${[...changes, takeHome ? `take-home: ${takeHome.mode === 'off' ? 'not applied' : `minimum ₱${Number(takeHome.minimum).toLocaleString()}`} (${takeHome.reason})` : ''].filter(Boolean).join('; ')}` });
      }
    }
    if (payload.runItems) {
      const { excludedPayItems, takeHome, reason } = payload.runItems;
      if (takeHome?.mode === 'off' && !isPaAdmin) { toast('Only P&A can switch take-home pay protection off.', 'bad'); return; }
      next = withAudit({ ...next, config: { ...next.config, excludedPayItems, takeHome } }, {
        action: 'Pay items changed for the run',
        actor,
        detail: `${excludedPayItems.length ? `Left out: ${excludedPayItems.map(key => (openRun.result?.lines || []).flatMap(payItemsOfLine).find(row => row.key === key)?.name || key.split(':').slice(1).join(':')).join(', ')}` : 'All pay items included'}; take-home protection ${takeHome?.mode === 'off' ? 'not applied' : 'per policy'} — ${reason}`,
      });
      toast('Pay items saved and the transaction recalculated.');
    }
    if (payload.runReclass) {
      const { runOrder, runLimits, reason, names, defaultOrder } = payload.runReclass;
      if (runOrder.length && !isPaAdmin) { toast('Only P&A can reorder the reclassification hierarchy on a run.', 'bad'); return; }
      const label = codes => codes.map(code => names[code] || code).join(' › ');
      const limitText = Object.entries(runLimits).map(([code, value]) => `${names[code] || code} limited to ${value}`).join('; ');
      next = withAudit({ ...next, config: { ...next.config, reclassification: { ...next.config.reclassification, runOrder, runLimits } } }, {
        action: 'Reclassification changed for the run',
        actor,
        detail: `Order: ${runOrder.length ? `${label(runOrder)} (was ${label(defaultOrder)})` : 'as configured'}; ${limitText || 'limits as configured'} — ${reason}`,
      });
      toast('Reclassification saved and the transaction recalculated.');
    }
    if (payload.batch) next = { ...next, batches: [payload.batch, ...(next.batches || [])] };
    if (payload.currencies) {
      next = withAudit({ ...next, currencies: payload.currencies, multiCurrency: payload.currencies.length > 1 }, { action: 'Currencies updated', actor, detail: currencySummary(payload.currencies) });
      toast('Currencies saved and the transaction recalculated.');
    }
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
      isPaAdmin={isPaAdmin}
      bulk={bulk}
      autoCompute={autoCompute}
      onToggleAutoCompute={toggleAutoCompute}
      onRecalculateOpen={targets => recalculateMany(targets)}
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
      requiresApproval={requiresBackdateApproval}
      isPaAdmin={isPaAdmin}
    />}

    {view === 'run' && openRun && <RunDetail
      run={openRun}
      runs={runs}
      context={contextFor(openRun)}
      hrmData={hrmData}
      actor={actor}
      isPaAdmin={isPaAdmin}
      onRaiseCorrection={raiseCorrectionFor}
      onCancelCorrection={cancelCorrectionFor}
      onBack={() => setView('register')}
      onAction={handleAction}
      onNotify={toast}
      onSaveOverride={handleOverride}
    />}

    <Toasts toasts={toasts} onDismiss={dismiss} />
  </div>;
}

export default PayrollProcessingWorkspace;
