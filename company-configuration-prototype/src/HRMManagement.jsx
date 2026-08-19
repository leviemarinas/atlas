/**
 * Management & Approvals — Part 2 of the P&A HRM masterfile.
 *
 * The approver's module: a secondary sidebar of management areas, group
 * landing pages, the request approval queues, the shift assignment register,
 * and the expense screens (reimbursement, cash advance and liquidation).
 * Each screen is selected by the `kind` on its registry entry.
 */

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowsLeftRight,
  Bank,
  Briefcase,
  CalendarBlank,
  CalendarX,
  CheckCircle,
  CheckSquare,
  ClipboardText,
  Clock,
  ClockClockwise,
  ClockCounterClockwise,
  CurrencyCircleDollar,
  FileText,
  Heart,
  Medal,
  Receipt,
  Suitcase,
  UploadSimple,
  UserMinus,
  Users,
  ArrowRight,
} from '@phosphor-icons/react';
import {
  applicationForScreen,
  managementGroupByKey,
  managementGroups,
  managementScreenByKey,
  screenColumnsForGroup,
  screensForGroup,
} from './hrmManagement.js';
import {
  BIR_SEPARATION_REASONS,
  CASH_ADVANCE_TYPES,
  CASH_STATUS_TABS,
  COE_PURPOSES,
  COMPANY_LOAN_TYPES,
  EXPENSE_STATUS_TABS,
  GOVERNMENT_AGENCIES,
  GOVERNMENT_LOAN_TYPES,
  LOAN_STATUS_TABS,
  PAYMENT_MODES,
  SHIFT_CATALOG,
  findEmployee,
  liquidationSummary,
  reimbursementTotal,
  shiftAssignmentStatus,
} from './hrmData.js';
import { approvalLogFor } from './hrmApplications.js';
import { TeamValidationScreen, WellnessApprovalScreen } from './HRMTeamWellness.jsx';
import { REQUEST_PERMISSIONS, REQUEST_STATUSES } from './requestWorkflow.js';
import { approveRequest, isActorAuthorizedForDecision, rejectRequest } from './requestService.js';
import { applyRequestDecision, openClearanceForSeparation, openLoanScheduleForLoan, openQuitClaimForClearance } from './hrmPosting.js';
import { downloadFile } from './fileDownload.js';
import {
  ApprovalLogModal,
  Breadcrumbs,
  BulkSelectionBar,
  ConfirmCancelModal,
  DataTable,
  DetailList,
  DocumentViewerModal,
  EmployeeBanner,
  EmptyState,
  ExportMenu,
  Field,
  FilterButton,
  FilterDrawer,
  GhostButton,
  Modal,
  PageHeading,
  Pagination,
  PrimaryButton,
  SearchInput,
  StatusPill,
  StatusTabs,
  StatusText,
  UploadArea,
  formatCell,
  formatDate,
  initialsOf,
  paginate,
  shortStatus,
  useTableState,
} from './HRMKit.jsx';

const groupIcons = {
  'time-management': Clock,
  'leave-management': Suitcase,
  'work-shift-management': CalendarBlank,
  'expense-management': Receipt,
  'loan-management': Bank,
  'employee-requests-management': ClipboardText,
  'validation-team-members': Users,
  'health-wellness-approval': Heart,
};

const screenIcons = {
  'clock-clockwise': ClockClockwise,
  'clock-plus': Clock,
  'clock-counter': ClockCounterClockwise,
  suitcase: Suitcase,
  'calendar-x': CalendarX,
  'calendar-clock': CalendarBlank,
  briefcase: Briefcase,
  'arrows-left-right': ArrowsLeftRight,
  receipt: Receipt,
  cash: CurrencyCircleDollar,
  'check-square': CheckSquare,
  'user-minus': UserMinus,
  medal: Medal,
  'file-text': FileText,
  users: Users,
  heart: Heart,
};

const today = () => new Date().toISOString().slice(0, 10);

/** Philippine peso, as every amount in the masterfile is presented. */
const peso = value => `₱ ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const toCsv = (headers, rows) => [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

/* --------------------------------------------------------------- navigation */

export function ManagementSidebar({ group, onSelectGroup, onBack }) {
  return <aside className="hrm-ss-sidebar">
    <button type="button" className="hrm-ss-back" onClick={onBack}><ArrowLeft size={14} /> Back to HRM</button>
    <h2>Management &amp;<br />Approvals</h2>
    <nav aria-label="Management and approvals">
      {managementGroups.map(entry => {
        const Icon = groupIcons[entry.key] || ClipboardText;
        return <button key={entry.key} type="button" className={group === entry.key ? 'selected' : ''} onClick={() => onSelectGroup(entry.key)}>
          <Icon size={15} /><span>{entry.label}</span>
        </button>;
      })}
    </nav>
  </aside>;
}

/** Group landing page; Expense Management splits into Approvals / Management. */
export function ManagementGroupHome({ groupKey, onOpenScreen }) {
  const group = managementGroupByKey(groupKey);
  const columns = screenColumnsForGroup(groupKey);
  return <div className="hrm-ss-home">
    <h1>{group?.label}</h1>
    {screensForGroup(groupKey).length === 0
      ? <p className="hrm-ss-placeholder">No screens are configured for {group?.label} in this release.</p>
      : <div className={columns.length > 1 ? 'hrm-mgmt-columns' : ''}>
          {columns.map(column => <section key={column.name || 'all'}>
            {column.name && <h2 className="hrm-mgmt-column-title">{column.name}</h2>}
            <div className="hrm-ss-card-grid single">
              {column.screens.map(screen => {
                const Icon = screenIcons[screen.icon] || ClipboardText;
                return <button key={screen.key} type="button" className="hrm-ss-card" onClick={() => onOpenScreen(screen.key)}>
                  <Icon size={22} />
                  <span>{screen.cardLabel || screen.title}</span>
                  <ArrowRight size={16} className="hrm-ss-card-arrow" />
                </button>;
              })}
            </div>
          </section>)}
        </div>}
  </div>;
}

/* ------------------------------------------------------- request approvals */

/**
 * The approval queue for one self-service application type.  Columns come
 * from the same definition the employee filed against, so the approver sees
 * exactly the fields the employee submitted.
 */
function RequestApprovalScreen({ screen, requests, data, setData, actor, teamEmployeeIds, onBack, onRefresh, onNotify }) {
  const definition = applicationForScreen(screen);
  const table = useTableState();
  const [statusTab, setStatusTab] = useState('Pending');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [decision, setDecision] = useState(null);
  const [approvalLog, setApprovalLog] = useState(null);
  const [remarks, setRemarks] = useState('');

  const scope = new Set(teamEmployeeIds);
  const scoped = useMemo(() => requests.filter(request => {
    if (request.requestType !== definition.requestType) return false;
    const filedUnder = request.requestDetails?.definitionKey;
    if (filedUnder && filedUnder !== definition.key) return false;
    return scope.has(request.employeeId);
  }), [requests, definition, teamEmployeeIds]);

  const filtered = scoped.filter(request => {
    if (statusTab !== 'All' && shortStatus(request.status) !== statusTab) return false;
    const details = request.requestDetails || {};
    const employee = findEmployee(data, request.employeeId);
    if (table.search && !`${employee?.name ?? ''} ${Object.values(details).join(' ')}`.toLowerCase().includes(table.search.toLowerCase())) return false;
    return Object.entries(table.filters).every(([key, value]) => !value || String(details[key] ?? '').toLowerCase().includes(String(value).toLowerCase()));
  });

  const columns = [{ key: 'employeeName', label: 'Employee Full Name' }, ...definition.columns];

  function decide(kind) {
    const request = decision.request;
    try {
      if (!isActorAuthorizedForDecision(request, actor, kind === 'approve' ? REQUEST_PERMISSIONS.APPROVE : REQUEST_PERMISSIONS.REJECT)) {
        onNotify('You are not the assigned approver for that request.', 'bad');
        return;
      }
      const options = { actor, expectedVersion: request.version, remarks };
      const result = kind === 'approve'
        ? approveRequest(request.requestId, options)
        : rejectRequest(request.requestId, options);
      // A decision has to reach the register the transaction lives in, and an
      // approved resignation additionally opens the clearance case that Final
      // Pay and the quit claim wait on.
      if (result?.request) setData?.(current => applyRequestDecision(current, result.request));
      onNotify('Status updated successfully!');
      setDecision(null);
      setRemarks('');
      onRefresh();
    } catch (error) {
      onNotify(error.message || 'Status not updated.', 'bad');
    }
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[{ label: managementGroupByKey(screen.group)?.label, onClick: onBack }, { label: screen.title }]} />
    <PageHeading title={screen.title} />
    <StatusTabs tabs={['All', 'Pending', 'Approved', 'Rejected']} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} />
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu
          disabled={filtered.length === 0}
          onExport={format => {
            downloadFile(`${screen.key}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(columns.map(column => column.label), filtered.map(request => columns.map(column => column.key === 'status' ? shortStatus(request.status) : request.requestDetails?.[column.key]))));
            onNotify(`${screen.title} exported to ${format}.`);
          }}
        />
      </div>
    </div>
    <DataTable
      columns={columns}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={request => request.requestId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="Nothing is waiting on this approver."
      renderCell={(request, column) => {
        if (column.key === 'employeeName') {
          const employee = findEmployee(data, request.employeeId);
          return <span className="hrm-approver"><span className="hrm-avatar-sm">{employee?.initials || initialsOf(request.employee?.name)}</span>{employee?.name || request.employeeId}</span>;
        }
        if (column.key === 'status') return <StatusText status={request.status} />;
        return formatCell(request.requestDetails?.[column.key], column.type);
      }}
      actions={request => [
        ...(request.status === REQUEST_STATUSES.PENDING_APPROVAL ? [
          { kind: 'view', label: 'Approve', onSelect: () => { setDecision({ request, mode: 'approve' }); setRemarks(''); } },
          { kind: 'cancel', label: 'Reject', onSelect: () => { setDecision({ request, mode: 'reject' }); setRemarks(''); } },
        ] : []),
        { kind: 'view', label: 'View', onSelect: () => { setDecision({ request, mode: 'view' }); setRemarks(''); } },
        { kind: 'view', label: 'Approval log', onSelect: () => setApprovalLog(request) },
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={definition.columns.map(column => ({ key: column.key, label: column.label, type: column.type }))}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {decision && <Modal
      title={decision.mode === 'approve' ? 'Approve Request' : decision.mode === 'reject' ? 'Reject Request' : 'View Request'}
      onClose={() => setDecision(null)}
      footer={decision.mode === 'view' ? <GhostButton onClick={() => setDecision(null)}>Close</GhostButton> : <>
        <GhostButton onClick={() => setDecision(null)}>Cancel</GhostButton>
        <button type="button" className={`hrm-btn ${decision.mode === 'approve' ? 'primary' : 'danger'}`} onClick={() => decide(decision.mode)}>
          {decision.mode === 'approve' ? 'Approve' : 'Reject'}
        </button>
      </>}
    >
      <DetailList groups={[
        { pair: [
          { label: 'Employee Full Name', value: findEmployee(data, decision.request.employeeId)?.name || decision.request.employeeId },
          { label: 'Request Type', value: decision.request.requestTypeLabel },
        ] },
        ...definition.columns.filter(column => column.key !== 'status').map(column => ({ label: column.label, value: formatCell(decision.request.requestDetails?.[column.key], column.type) })),
        { label: 'Status', node: <StatusText status={decision.request.status} /> },
      ]} />
      {decision.mode !== 'view' && <Field label="Approver Remarks">
        <textarea rows={3} value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Input approver remarks" />
      </Field>}
    </Modal>}

    {approvalLog && <ApprovalLogModal entries={approvalLogFor(approvalLog)} onClose={() => setApprovalLog(null)} />}
  </div>;
}

/* --------------------------------------------------- shift assignment register */

const SHIFT_TABS = ['All', 'Upcoming', 'Active', 'Expired'];

function ShiftAssignmentScreen({ screen, data, setData, teamEmployeeIds, onBack, onNotify }) {
  const table = useTableState();
  const [statusTab, setStatusTab] = useState('All');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const scope = new Set(teamEmployeeIds);
  const rows = (data.shiftAssignments || [])
    .filter(assignment => scope.has(assignment.employeeId))
    .map(assignment => {
      const employee = findEmployee(data, assignment.employeeId);
      return { ...assignment, employee, employeeCode: employee?.employeeCode || '', employeeName: employee?.name || '', status: shiftAssignmentStatus(assignment) };
    });

  const filtered = rows.filter(row => {
    if (statusTab !== 'All' && row.status !== statusTab) return false;
    if (table.search && !`${row.employeeCode} ${row.employeeName} ${row.shiftScheduleCode}`.toLowerCase().includes(table.search.toLowerCase())) return false;
    return Object.entries(table.filters).every(([key, value]) => !value || String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase()));
  });

  const columns = [
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'employeeName', label: 'Employee Full Name' },
    { key: 'shiftScheduleCode', label: 'Shift Schedule Code' },
    { key: 'shiftHours', label: 'Shift Hours' },
    { key: 'shiftName', label: 'Shift Name' },
    { key: 'startDate', label: 'Start Date', type: 'date' },
    { key: 'endDate', label: 'End Date', type: 'date' },
    { key: 'status', label: 'Status', type: 'status' },
  ];

  const subordinates = (data.employees || []).filter(employee => scope.has(employee.employeeId));

  function openAssign() {
    setForm({ mode: 'assign', values: { employeeId: '', shiftName: '', startDate: '', endDate: '' }, errors: {} });
  }

  function openEdit(row) {
    setForm({ mode: 'edit', assignmentId: row.assignmentId, values: { employeeId: row.employeeId, shiftName: row.shiftName, startDate: row.startDate, endDate: row.endDate }, errors: {} });
  }

  /** A schedule may not start before the assignment's own valid start date. */
  function validate(values) {
    const errors = {};
    if (!values.employeeId) errors.employeeId = 'Employee Name is required.';
    if (!values.shiftName) errors.shiftName = 'Shift Name is required.';
    if (!values.startDate) errors.startDate = 'Start Date is required.';
    else if (values.startDate < today()) errors.startDate = 'Start date cannot be earlier than valid start date.';
    if (values.endDate && values.startDate && values.endDate < values.startDate) errors.endDate = 'End date cannot be earlier than the start date.';
    return errors;
  }

  function save() {
    const errors = validate(form.values);
    if (Object.keys(errors).length) {
      setForm(current => ({ ...current, errors }));
      return;
    }
    const catalogue = data.shifts || SHIFT_CATALOG;
    const shift = catalogue.find(entry => entry.name === form.values.shiftName);
    setData(current => {
      const assignments = [...(current.shiftAssignments || [])];
      if (form.mode === 'edit') {
        const index = assignments.findIndex(entry => entry.assignmentId === form.assignmentId);
        if (index >= 0) assignments[index] = { ...assignments[index], ...form.values };
      } else {
        assignments.push({
          assignmentId: `asg-${form.values.employeeId}-${Date.now()}`,
          employeeId: form.values.employeeId,
          shiftScheduleCode: shift?.shiftId?.slice(-3) || '001',
          shiftName: form.values.shiftName,
          shiftHours: shift ? `${shift.window} (${shift.days})` : form.values.shiftName,
          startDate: form.values.startDate,
          endDate: form.values.endDate,
          repeatShift: 'No',
          holidayPayPartOfOt: 'Yes',
          otHolidayPayBasedOnCalendar: 'Yes',
          flexibleTime: 'No',
          gracePeriod: 15,
          gracePeriodUnit: 'Minutes',
          gracePeriodCondition: 'Before Start',
          breakHoursCode: 'BREAK_001',
          autoDeductBreak: 'Yes',
          workHours: 8,
          shiftDaysPerWeek: 5,
          halfDayShiftDay: 'No',
          restDays: 'Saturdays, Sundays',
        });
      }
      return { ...current, shiftAssignments: assignments };
    });
    onNotify(form.mode === 'edit' ? 'Details saved successfully!' : 'Shift schedule assigned.');
    setForm(null);
  }

  function confirmDelete() {
    setData(current => ({ ...current, shiftAssignments: (current.shiftAssignments || []).filter(entry => entry.assignmentId !== deleting.assignmentId) }));
    onNotify('Assignment deleted.');
    setDeleting(null);
  }

  const shiftOptions = (data.shifts || SHIFT_CATALOG).map(shift => shift.name);

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[{ label: managementGroupByKey(screen.group)?.label, onClick: onBack }, { label: screen.title }]} />
    <PageHeading title={screen.title} />
    <StatusTabs tabs={SHIFT_TABS} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} />
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <PrimaryButton onClick={openAssign}>Assign</PrimaryButton>
        <button type="button" className="hrm-btn outline" onClick={() => onNotify('Bulk upload accepts the shift assignment template.')}><UploadSimple size={15} /> Upload</button>
        <ExportMenu
          disabled={filtered.length === 0}
          onExport={format => {
            downloadFile(`shift-assignments.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(columns.map(column => column.label), filtered.map(row => columns.map(column => row[column.key]))));
            onNotify(`Shift assignments exported to ${format}.`);
          }}
        />
      </div>
    </div>
    <DataTable
      columns={columns}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={row => row.assignmentId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No shift assignments yet."
      renderCell={(row, column) => {
        if (column.key === 'employeeCode') return <button type="button" className="hrm-link" onClick={() => setViewing(row)}>{row.employeeCode}</button>;
        if (column.key === 'status') return <StatusText status={row.status} />;
        if (column.key === 'endDate') return row.endDate ? formatDate(row.endDate) : 'On going';
        return formatCell(row[column.key], column.type);
      }}
      actions={row => [
        { kind: 'view', label: 'View', onSelect: () => setViewing(row) },
        { kind: 'edit', label: 'Edit', onSelect: () => openEdit(row) },
        { kind: 'cancel', label: 'Delete', onSelect: () => setDeleting(row) },
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'employeeName', label: 'Employee Full Name' },
        { key: 'shiftScheduleCode', label: 'Shift Schedule Code' },
        { key: 'shiftHours', label: 'Shift Hour' },
        { key: 'shiftName', label: 'Shift Name' },
        { key: 'startDate', label: 'Start Date', type: 'date' },
        { key: 'endDate', label: 'End Date', type: 'date' },
        { key: 'status', label: 'Status', options: SHIFT_TABS.filter(tab => tab !== 'All') },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {form && <Modal
      title={form.mode === 'edit' ? 'Edit Assigned Shift Schedule' : 'Assign Shift Schedule'}
      onClose={() => setForm(null)}
      footer={<>
        <GhostButton onClick={() => setForm(null)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn primary" onClick={save}>{form.mode === 'edit' ? 'Save' : 'Submit'}</button>
      </>}
    >
      <div className="hrm-form-grid">
        <div className="hrm-form-cell span-2">
          <Field label="Employee Name" required error={form.errors.employeeId}>
            <select value={form.values.employeeId} onChange={event => setForm(current => ({ ...current, values: { ...current.values, employeeId: event.target.value }, errors: { ...current.errors, employeeId: undefined } }))}>
              <option value="">Please select</option>
              {subordinates.map(employee => <option key={employee.employeeId} value={employee.employeeId}>{employee.name} · {employee.employeeCode}</option>)}
            </select>
          </Field>
        </div>
        <div className="hrm-form-cell span-2">
          <Field label="Shift Name" required error={form.errors.shiftName}>
            <select value={form.values.shiftName} onChange={event => setForm(current => ({ ...current, values: { ...current.values, shiftName: event.target.value }, errors: { ...current.errors, shiftName: undefined } }))}>
              <option value="">Please select</option>
              {shiftOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Start Date" required error={form.errors.startDate}>
          <input type="date" value={form.values.startDate} onChange={event => setForm(current => ({ ...current, values: { ...current.values, startDate: event.target.value }, errors: { ...current.errors, startDate: undefined } }))} />
        </Field>
        <Field label="End Date" error={form.errors.endDate}>
          <input type="date" value={form.values.endDate} onChange={event => setForm(current => ({ ...current, values: { ...current.values, endDate: event.target.value }, errors: { ...current.errors, endDate: undefined } }))} />
        </Field>
      </div>
    </Modal>}

    {viewing && <Modal title="View Details" onClose={() => setViewing(null)}>
      <DetailList groups={[
        { pair: [{ label: 'Employee Name', value: viewing.employeeName }, { label: 'Employee Code', value: viewing.employeeCode }] },
        { pair: [{ label: 'Shift Schedule Code', value: viewing.shiftScheduleCode }, { label: 'Shift Name', value: viewing.shiftName }] },
        { label: 'Shift Hours', value: viewing.shiftHours },
        { pair: [{ label: 'Start Date', value: formatDate(viewing.startDate) }, { label: 'End Date', value: viewing.endDate ? formatDate(viewing.endDate) : 'On going' }] },
        { label: 'Repeat Shift', value: viewing.repeatShift },
        { label: 'Holiday Pay Part of OT', value: viewing.holidayPayPartOfOt },
        { label: 'OT/Holiday Pay Based on Calendar', value: viewing.otHolidayPayBasedOnCalendar },
        { label: 'Flexible Time', value: viewing.flexibleTime },
        { pair: [{ label: 'No. of Grace Period', value: String(viewing.gracePeriod) }, { label: 'Grace Period Unit', value: viewing.gracePeriodUnit }] },
        { label: 'Grace Period Condition', value: viewing.gracePeriodCondition },
        { pair: [{ label: 'Break Hours Code', value: viewing.breakHoursCode }, { label: 'Auto Deduct Break', value: viewing.autoDeductBreak }] },
        { pair: [{ label: 'Work Hours', value: String(viewing.workHours) }, { label: 'Shift Days Per Week', value: String(viewing.shiftDaysPerWeek) }] },
        { pair: [{ label: 'Half Day Shift Day', value: viewing.halfDayShiftDay }, { label: 'Rest Days', value: viewing.restDays }] },
        { label: 'Status', node: <StatusText status={viewing.status} /> },
      ]} />
    </Modal>}

    {deleting && <ConfirmCancelModal
      title="Delete Assignment"
      message="Are you sure you want to delete this assignment? This action is irreversible."
      backLabel="Cancel"
      confirmLabel="Confirm"
      onBack={() => setDeleting(null)}
      onConfirm={confirmDelete}
    />}
  </div>;
}

/* -------------------------------------------------------- expense screens */

/** Decide an expense record in place; these are not request-workflow rows. */
function decideExpense(rows, matchKey, id, status, remarks, actorName) {
  return rows.map(row => row[matchKey] !== id ? row : {
    ...row,
    status,
    statusDate: today(),
    approverRemarks: remarks,
    approver: actorName,
    actionedBy: actorName,
    dateApproved: status === 'Approved' ? today() : row.dateApproved,
  });
}

function ReimbursementScreen({ screen, data, setData, teamEmployeeIds, actor, onBack, onNotify }) {
  const isApproval = screen.kind === 'reimbursement-approval';
  const table = useTableState();
  const [statusTab, setStatusTab] = useState(isApproval ? 'Pending' : 'All');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [decision, setDecision] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [itemDetail, setItemDetail] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [selected, setSelected] = useState([]);

  const scope = new Set(teamEmployeeIds);
  const rows = (data.reimbursements || [])
    .filter(row => scope.has(row.employeeId))
    .map(row => {
      const employee = findEmployee(data, row.employeeId);
      return { ...row, employee, employeeName: employee?.name || '', employeeCode: employee?.employeeCode || '', department: employee?.department || '', totalAmount: reimbursementTotal(row) };
    });

  const filtered = rows.filter(row => {
    if (statusTab !== 'All' && shortStatus(row.status) !== statusTab) return false;
    if (table.search && !`${row.employeeName} ${row.transactionNo} ${row.type}`.toLowerCase().includes(table.search.toLowerCase())) return false;
    return Object.entries(table.filters).every(([key, value]) => !value || String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase()));
  });

  const approvalColumns = [
    { key: 'employeeName', label: 'Employee Full Name' },
    { key: 'transactionNo', label: 'Transaction No.' },
    { key: 'type', label: 'Type of Reimbursement' },
    { key: 'totalAmount', label: 'Total Amount', align: 'right' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'dateApplied', label: 'Date Applied', type: 'date' },
  ];
  const managementColumns = [
    { key: 'dateApplied', label: 'Application Date', type: 'date' },
    { key: 'transactionNo', label: 'Transaction No.' },
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'employeeName', label: 'Employee Name' },
    { key: 'department', label: 'Department' },
  ];
  const columns = isApproval ? approvalColumns : managementColumns;

  function decide(kind) {
    setData(current => ({ ...current, reimbursements: decideExpense(current.reimbursements, 'transactionNo', decision.row.transactionNo, kind === 'approve' ? 'Approved' : 'Rejected', remarks, actor.displayName) }));
    onNotify('Status updated successfully!');
    setDecision(null);
    setRemarks('');
  }

  function detailGroups(row) {
    return [
      { pair: [{ label: 'Employee Full Name', value: row.employeeName }, { label: 'Transaction Number', value: row.transactionNo }] },
      { pair: [{ label: 'Type of Reimbursement', value: row.type }, { label: 'Total Amount', value: peso(row.totalAmount) }] },
      { pair: [{ label: 'Date Applied', value: formatDate(row.dateApplied) }, { label: 'Date of Approval', value: row.dateApproved ? formatDate(row.dateApproved) : '-' }] },
      { pair: [{ label: 'Approver', value: row.approver || '-' }, { label: 'Remarks', value: row.approverRemarks || '-' }] },
      { pair: [{ label: 'Delegated To', value: row.delegatedTo || '-' }, { label: 'Reason', value: row.delegationReason || '-' }] },
      { label: 'Status', node: <StatusText status={row.status} /> },
      // Each expense record inside the claim, as the masterfile lists them.
      ...(row.records || []).flatMap((record, index) => [
        { label: `Record #${index + 1}`, node: <span className="hrm-record-divider" /> },
        { pair: [{ label: 'Date of Expense', value: formatDate(record.dateOfExpense) }, { label: 'Currency', value: record.currency }] },
        { pair: [{ label: 'Total Amount', value: peso(record.amount) }, { label: 'OR Number', value: record.orNumber }] },
        { label: 'Description', value: record.description },
        { label: 'Uploaded Attachments', node: <ul className="hrm-file-list readonly">{(record.attachments || []).map(file => <li key={file.name}><span className="hrm-file-name">{file.name}</span><span className="hrm-file-size">{file.size}</span></li>)}</ul> },
      ]),
    ];
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[{ label: 'Expense Management', onClick: onBack }, { label: screen.title }]} />
    <PageHeading title={screen.title} />
    <StatusTabs tabs={isApproval ? EXPENSE_STATUS_TABS : CASH_STATUS_TABS} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} />
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu
          disabled={filtered.length === 0}
          onExport={format => {
            downloadFile(`${screen.key}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(columns.map(column => column.label), filtered.map(row => columns.map(column => column.key === 'totalAmount' ? row.totalAmount : row[column.key]))));
            onNotify(`${screen.title} exported to ${format}.`);
          }}
        />
      </div>
    </div>
    <DataTable
      columns={isApproval ? [{ key: 'select', label: '' }, ...columns] : columns}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={row => row.transactionNo}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No expense claims in this view."
      renderCell={(row, column) => {
        if (column.key === 'select') {
          return <input
            type="checkbox"
            aria-label={`Select ${row.transactionNo}`}
            checked={selected.includes(row.transactionNo)}
            onChange={() => setSelected(current => current.includes(row.transactionNo) ? current.filter(id => id !== row.transactionNo) : [...current, row.transactionNo])}
          />;
        }
        if (column.key === 'status') return <StatusText status={row.status} />;
        if (column.key === 'totalAmount') return peso(row.totalAmount);
        if (column.key === 'employeeName' && isApproval) return <span className="hrm-approver"><span className="hrm-avatar-sm">{row.employee?.initials}</span>{row.employeeName}</span>;
        return formatCell(row[column.key], column.type);
      }}
      actions={row => isApproval
        ? [
            ...(shortStatus(row.status) === 'Pending' ? [
              { kind: 'view', label: 'Approve', onSelect: () => { setDecision({ row, mode: 'approve' }); setRemarks(''); } },
              { kind: 'cancel', label: 'Reject', onSelect: () => { setDecision({ row, mode: 'reject' }); setRemarks(''); } },
            ] : []),
            { kind: 'view', label: 'View', onSelect: () => setViewing(row) },
          ]
        : [{ kind: 'view', label: 'View Full Details', onSelect: () => setItemDetail(row) }]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'employeeName', label: 'Employee Full Name' },
        { key: 'transactionNo', label: 'Transaction No.' },
        { key: 'type', label: 'Type of Reimbursement' },
        { key: 'dateApplied', label: 'Application Date', type: 'date' },
        { key: 'status', label: 'Status', options: EXPENSE_STATUS_TABS.filter(tab => tab !== 'All') },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {decision && <Modal
      title={decision.mode === 'approve' ? 'Approve Request' : 'Reject Request'}
      onClose={() => setDecision(null)}
      width="sm"
      footer={<>
        <GhostButton onClick={() => setDecision(null)}>Cancel</GhostButton>
        <button type="button" className={`hrm-btn ${decision.mode === 'approve' ? 'primary' : 'danger'}`} onClick={() => decide(decision.mode)}>
          {decision.mode === 'approve' ? 'Approve' : 'Reject'}
        </button>
      </>}
    >
      <Field label="Remarks">
        <textarea rows={3} value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Input additional notes" />
      </Field>
    </Modal>}

    {viewing && <Modal title="View Details" onClose={() => setViewing(null)}>
      <DetailList groups={detailGroups(viewing)} />
    </Modal>}

    {itemDetail && <Modal title="View Transaction Item Details" onClose={() => setItemDetail(null)}>
      <DetailList groups={[
        { pair: [{ label: 'Application Date', value: formatDate(itemDetail.dateApplied) }, { label: 'Transaction No.', value: itemDetail.transactionNo }] },
        { pair: [{ label: 'Employee Name', value: itemDetail.employeeName }, { label: 'Employee Code', value: itemDetail.employeeCode }] },
        { label: 'Department', value: itemDetail.department },
        { pair: [{ label: 'Type of Reimbursement', value: itemDetail.type }, { label: 'Date of Expense', value: formatDate(itemDetail.records?.[0]?.dateOfExpense) }] },
        { pair: [{ label: 'Currency', value: itemDetail.records?.[0]?.currency }, { label: 'Amount', value: peso(itemDetail.records?.[0]?.amount) }] },
        { label: 'Description', value: itemDetail.records?.[0]?.description },
        { pair: [{ label: 'Receipt Date', value: formatDate(itemDetail.records?.[0]?.receiptDate) }, { label: 'OR Number', value: itemDetail.records?.[0]?.orNumber }] },
        { label: 'Attachments', node: <ul className="hrm-file-list readonly">{(itemDetail.records?.[0]?.attachments || []).map(file => <li key={file.name}><span className="hrm-file-name">{file.name}</span><span className="hrm-file-size">{file.size}</span></li>)}</ul> },
      ]} />
    </Modal>}
  </div>;
}

function CashAdvanceScreen({ screen, data, setData, teamEmployeeIds, actor, onBack, onNotify }) {
  const isApproval = screen.kind === 'cash-advance-approval';
  const table = useTableState();
  const [statusTab, setStatusTab] = useState(isApproval ? 'Pending' : 'All');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [decision, setDecision] = useState(null);
  const [remarks, setRemarks] = useState('');

  const scope = new Set(teamEmployeeIds);
  const rows = (data.cashAdvances || [])
    .filter(row => scope.has(row.employeeId))
    .map(row => {
      const employee = findEmployee(data, row.employeeId);
      return { ...row, employee, employeeName: employee?.name || '', employeeCode: employee?.employeeCode || '', department: employee?.department || '' };
    });

  const filtered = rows.filter(row => {
    if (statusTab !== 'All' && shortStatus(row.status) !== statusTab) return false;
    if (table.search && !`${row.employeeName} ${row.transactionNo} ${row.cashAdvanceType}`.toLowerCase().includes(table.search.toLowerCase())) return false;
    return Object.entries(table.filters).every(([key, value]) => !value || String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase()));
  });

  const columns = [
    { key: 'applicationDate', label: 'Application Date', type: 'date' },
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'employeeName', label: 'Employee Name' },
    { key: 'department', label: 'Department' },
    { key: 'division', label: 'Division' },
    { key: 'transactionNo', label: 'Transaction Number' },
    { key: 'cashAdvanceType', label: 'Cash Advance Type' },
    { key: 'amountRequested', label: 'Amount Requested', align: 'right' },
    { key: 'status', label: 'Status', type: 'status' },
  ];

  function decide(kind) {
    setData(current => ({ ...current, cashAdvances: decideExpense(current.cashAdvances, 'transactionNo', decision.row.transactionNo, kind === 'approve' ? 'Approved' : 'Rejected', remarks, actor.displayName) }));
    onNotify('Status updated successfully!');
    setDecision(null);
    setRemarks('');
  }

  function advanceGroups(row) {
    return [
      { label: 'Application Date', value: formatDate(row.applicationDate) },
      { label: 'Employee Name', value: row.employeeName },
      { label: 'Employee Code', value: row.employeeCode },
      { label: 'Department', value: row.department },
      { label: 'Division', value: row.division },
      { label: 'Transaction Number', value: row.transactionNo },
      { label: 'Cash Advance Type', value: row.cashAdvanceType },
      { label: 'Charge Code', value: row.chargeCode },
      { label: 'Amount Requested', value: peso(row.amountRequested) },
      { label: 'Purpose', value: row.purpose },
      { label: 'Employee Remarks', value: row.employeeRemarks },
    ];
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[{ label: 'Expense Management', onClick: onBack }, { label: screen.title }]} />
    <PageHeading title={screen.title} />
    <StatusTabs tabs={CASH_STATUS_TABS} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} />
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu
          disabled={filtered.length === 0}
          onExport={format => {
            downloadFile(`${screen.key}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(columns.map(column => column.label), filtered.map(row => columns.map(column => row[column.key]))));
            onNotify(`${screen.title} exported to ${format}.`);
          }}
        />
      </div>
    </div>
    <DataTable
      columns={columns}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={row => row.transactionNo}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No cash advances in this view."
      renderCell={(row, column) => {
        if (column.key === 'status') return <StatusText status={row.status} />;
        if (column.key === 'amountRequested') return peso(row.amountRequested);
        return formatCell(row[column.key], column.type);
      }}
      actions={row => [
        ...(isApproval && shortStatus(row.status) === 'Pending' ? [
          { kind: 'view', label: 'Approve', onSelect: () => { setDecision({ row, mode: 'approve' }); setRemarks(''); } },
          { kind: 'cancel', label: 'Reject', onSelect: () => { setDecision({ row, mode: 'reject' }); setRemarks(''); } },
        ] : []),
        { kind: 'view', label: 'View', onSelect: () => { setDecision({ row, mode: 'view' }); setRemarks(''); } },
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'transactionNo', label: 'Transaction Number' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department' },
        { key: 'division', label: 'Division' },
        { key: 'applicationDate', label: 'Application Date', type: 'date' },
        { key: 'cashAdvanceType', label: 'Cash Advance Type', options: [...CASH_ADVANCE_TYPES] },
        { key: 'chargeCode', label: 'Charge Code' },
        { key: 'status', label: 'Status', options: CASH_STATUS_TABS.filter(tab => tab !== 'All') },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {decision && <Modal
      title={decision.mode === 'approve' ? 'Approve Request' : decision.mode === 'reject' ? 'Reject Request' : 'View Cash Advance'}
      onClose={() => setDecision(null)}
      footer={decision.mode === 'view' ? <GhostButton onClick={() => setDecision(null)}>Close</GhostButton> : <>
        <GhostButton onClick={() => setDecision(null)}>Cancel</GhostButton>
        <button type="button" className={`hrm-btn ${decision.mode === 'approve' ? 'primary' : 'danger'}`} onClick={() => decide(decision.mode)}>
          {decision.mode === 'approve' ? 'Approve' : 'Reject'}
        </button>
      </>}
    >
      <DetailList groups={advanceGroups(decision.row)} />
      {decision.mode !== 'view' && <Field label="Approver Remarks">
        <textarea rows={3} value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Input approver remarks" />
      </Field>}
    </Modal>}
  </div>;
}

function LiquidationScreen({ screen, data, setData, teamEmployeeIds, actor, onBack, onNotify }) {
  const isApproval = screen.kind === 'liquidation-approval';
  const table = useTableState();
  const [statusTab, setStatusTab] = useState(isApproval ? 'Pending' : 'All');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openLiquidation, setOpenLiquidation] = useState(null);

  const scope = new Set(teamEmployeeIds);
  const rows = (data.liquidations || [])
    .filter(row => scope.has(row.employeeId))
    .map(row => {
      const employee = findEmployee(data, row.employeeId);
      return { ...row, employee, employeeName: employee?.name || '', employeeCode: employee?.employeeCode || '', department: employee?.department || '', ...liquidationSummary(row) };
    });

  const filtered = rows.filter(row => {
    if (statusTab !== 'All' && shortStatus(row.status) !== statusTab) return false;
    if (table.search && !`${row.liquidationNumber} ${row.employeeName}`.toLowerCase().includes(table.search.toLowerCase())) return false;
    return Object.entries(table.filters).every(([key, value]) => !value || String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase()));
  });

  if (openLiquidation) {
    const current = rows.find(row => row.liquidationNumber === openLiquidation) || null;
    if (current) {
      return <LiquidationDetail
        screen={screen}
        liquidation={current}
        isApproval={isApproval}
        actor={actor}
        setData={setData}
        onBack={() => setOpenLiquidation(null)}
        onNotify={onNotify}
      />;
    }
  }

  const columns = [
    { key: 'liquidationNumber', label: 'Liquidation Number' },
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'employeeName', label: 'Employee Name' },
    { key: 'department', label: 'Department' },
    { key: 'cashAdvanceNo', label: 'Cash Advance Number' },
    { key: 'totalExpense', label: 'Total Expense', align: 'right' },
    { key: 'amountDue', label: 'Balance', align: 'right' },
    { key: 'status', label: 'Liquidation Status', type: 'status' },
  ];

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[{ label: 'Expense Management', onClick: onBack }, { label: screen.title }]} />
    <PageHeading title={screen.title} />
    <StatusTabs tabs={CASH_STATUS_TABS} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} />
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu
          disabled={filtered.length === 0}
          onExport={format => {
            downloadFile(`${screen.key}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(columns.map(column => column.label), filtered.map(row => columns.map(column => row[column.key]))));
            onNotify(`${screen.title} exported to ${format}.`);
          }}
        />
      </div>
    </div>
    <DataTable
      columns={columns}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={row => row.liquidationNumber}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No liquidations in this view."
      renderCell={(row, column) => {
        if (column.key === 'liquidationNumber') return <button type="button" className="hrm-link" onClick={() => setOpenLiquidation(row.liquidationNumber)}>{row.liquidationNumber}</button>;
        if (column.key === 'status') return <StatusText status={row.status} />;
        if (column.key === 'totalExpense' || column.key === 'amountDue') return peso(row[column.key]);
        return formatCell(row[column.key], column.type);
      }}
      actions={row => [{ kind: 'view', label: 'View', onSelect: () => setOpenLiquidation(row.liquidationNumber) }]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'liquidationNumber', label: 'Liquidation Number' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'cashAdvanceNo', label: 'Cash Advance Number' },
        { key: 'department', label: 'Department' },
        { key: 'division', label: 'Division' },
        { key: 'applicationDate', label: 'Application Date', type: 'date' },
        { key: 'cashAdvanceType', label: 'Cash Advance Type', options: [...CASH_ADVANCE_TYPES] },
        { key: 'chargeCode', label: 'Charge Code' },
        { key: 'status', label: 'Liquidation Status', options: CASH_STATUS_TABS.filter(tab => tab !== 'All') },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

/** The full-page liquidation application the liquidation number opens. */
function LiquidationDetail({ screen, liquidation, isApproval, actor, setData, onBack, onNotify }) {
  const [decision, setDecision] = useState('');
  const [remarks, setRemarks] = useState('');
  const table = useTableState();
  const records = liquidation.records || [];

  function decide(kind) {
    setData(current => ({ ...current, liquidations: decideExpense(current.liquidations, 'liquidationNumber', liquidation.liquidationNumber, kind === 'approve' ? 'Approved' : 'Rejected', remarks, actor.displayName) }));
    onNotify('Status updated successfully!');
    setDecision('');
    setRemarks('');
    onBack();
  }

  const summaryGroups = [
    { label: 'Liquidation Number', value: liquidation.liquidationNumber },
    { label: 'Employee Full Name', value: liquidation.employeeName },
    { label: 'Employee Code', value: liquidation.employeeCode },
    { label: 'Department', value: liquidation.department },
    { label: 'Division', value: liquidation.division },
    { label: 'Application Date', value: formatDate(liquidation.applicationDate) },
    { label: 'Cash Advance Number', value: liquidation.cashAdvanceNo },
    { label: 'Cash Advance Type', value: liquidation.cashAdvanceType },
    { label: 'Charge Code', value: liquidation.chargeCode },
    { label: 'Total Expense', value: peso(liquidation.totalExpense) },
    { label: 'Cash Advance Amount', value: peso(liquidation.cashAdvanceAmount) },
    { label: 'Cash Returned', value: peso(liquidation.cashReturned) },
    { label: 'Balance', value: peso(liquidation.amountDue) },
    { label: 'Cash Return OR No.', value: liquidation.cashReturnOrNumber || '-' },
    { label: 'Liquidation Due', value: formatDate(liquidation.liquidationDue) },
  ];

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[{ label: 'Expense Management' }, { label: screen.title, onClick: onBack }, { label: 'View Liquidation Application' }]} />
    <PageHeading title="View Liquidation Application" onBack={onBack} />
    <EmployeeBanner employee={liquidation.employee} />

    <section className="hrm-panel hrm-liquidation-head">
      <div><span>Cash Advance Number</span><strong>{liquidation.cashAdvanceNo}</strong></div>
      <div><span>Application Date</span><strong>{formatDate(liquidation.applicationDate)}</strong></div>
      <div><span>Cash Advance Type</span><strong>{liquidation.cashAdvanceType}</strong></div>
      <div><span>Charge Code</span><strong>{liquidation.chargeCode}</strong></div>
    </section>

    <section className="hrm-panel">
      <h2 className="hrm-section-title">Liquidation Records</h2>
      <div className="hrm-toolbar"><div className="hrm-toolbar-left"><SearchInput value={table.search} onChange={table.setSearch} /></div></div>
      <div className="hrm-table-scroll">
        <table className="hrm-table">
          <thead><tr><th>Date of Expense</th><th>Currency</th><th className="align-right">Amount</th><th>Description</th></tr></thead>
          <tbody>
            {records.length === 0 && <tr><td colSpan={4} className="hrm-table-empty">No liquidation records.</td></tr>}
            {records
              .filter(record => !table.search || record.description.toLowerCase().includes(table.search.toLowerCase()))
              .map(record => <tr key={record.recordId}>
                <td>{formatDate(record.dateOfExpense)}</td>
                <td>{record.currency}</td>
                <td className="align-right">{peso(record.amount)}</td>
                <td>{record.description}</td>
              </tr>)}
          </tbody>
        </table>
      </div>
      <Pagination shown={records.length} total={records.length} page={1} pageSize={table.pageSize} onPageChange={() => {}} onPageSizeChange={table.setPageSize} />
    </section>

    <section className="hrm-panel">
      <h2 className="hrm-section-title">Summary</h2>
      <div className="hrm-liquidation-summary">
        <div><span>Total Expense</span><strong>{peso(liquidation.totalExpense)}</strong></div>
        <div><span>Cash Advance Amount</span><strong>{peso(liquidation.cashAdvanceAmount)}</strong></div>
        <div><span>Cash Returned</span><strong>{peso(liquidation.cashReturned)}</strong></div>
        <div><span>Amount Due</span><strong>{peso(liquidation.amountDue)}</strong></div>
      </div>
      <DetailList groups={[
        { label: 'Cash Return OR Number', value: liquidation.cashReturnOrNumber || '-' },
        { pair: [{ label: 'Filed By', value: liquidation.employeeName }, { label: 'Actioned By', value: liquidation.actionedBy || '-' }] },
        { label: 'Approver Remarks', value: liquidation.approverRemarks || '-' },
        { pair: [
          { label: 'Status', node: <StatusText status={liquidation.status} /> },
          { label: 'Status Date', value: liquidation.statusDate ? formatDate(liquidation.statusDate) : '-' },
        ] },
      ]} />
      {isApproval && shortStatus(liquidation.status) === 'Pending' && <div className="hrm-form-actions">
        <button type="button" className="hrm-btn primary" onClick={() => setDecision('approve')}>Approve</button>
        <button type="button" className="hrm-btn danger" onClick={() => setDecision('reject')}>Reject</button>
      </div>}
    </section>

    {decision && <Modal
      title={decision === 'approve' ? 'Approve Request' : 'Reject Request'}
      onClose={() => setDecision('')}
      footer={<>
        <GhostButton onClick={() => setDecision('')}>Cancel</GhostButton>
        <button type="button" className={`hrm-btn ${decision === 'approve' ? 'primary' : 'danger'}`} onClick={() => decide(decision)}>
          {decision === 'approve' ? 'Approve' : 'Reject'}
        </button>
      </>}
    >
      <DetailList groups={summaryGroups} />
      <Field label="Approver Remarks">
        <textarea rows={3} value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Input approver remarks" />
      </Field>
    </Modal>}
  </div>;
}

/* ---------------------------------------------------------- loan management */

function CompanyLoanScreen({ screen, data, setData, teamEmployeeIds, actor, onBack, onNotify }) {
  const isApproval = screen.kind === 'company-loan-approval';
  const table = useTableState();
  const [statusTab, setStatusTab] = useState(isApproval ? 'Pending' : 'All');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [decision, setDecision] = useState(null);
  const [interest, setInterest] = useState('');
  const [remarks, setRemarks] = useState('');
  const [approvalLog, setApprovalLog] = useState(null);
  const [applying, setApplying] = useState(false);
  const [ownOnly, setOwnOnly] = useState(false);

  const scope = new Set(teamEmployeeIds);
  const rows = (data.companyLoans || [])
    .filter(row => scope.has(row.employeeId) && (!ownOnly || row.employeeId === actor.employeeId))
    .map(row => {
      const employee = findEmployee(data, row.employeeId);
      return { ...row, employee, employeeName: employee?.name || '', employeeCode: employee?.employeeCode || '', department: employee?.department || '' };
    });

  const filtered = rows.filter(row => {
    if (statusTab !== 'All' && shortStatus(row.status) !== statusTab) return false;
    if (table.search && !`${row.employeeName} ${row.transactionNo} ${row.loanType}`.toLowerCase().includes(table.search.toLowerCase())) return false;
    return Object.entries(table.filters).every(([key, value]) => !value || String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase()));
  });

  const columns = [
    { key: 'applicationDate', label: 'Application Date', type: 'date' },
    { key: 'transactionNo', label: 'Transaction Number' },
    { key: 'employeeName', label: 'Employee Full Name' },
    { key: 'loanType', label: 'Loan Type' },
    { key: 'loanAmount', label: 'Loan Amount', align: 'right' },
    { key: 'loanTerms', label: 'Loan Terms (Months)', align: 'right' },
    { key: 'status', label: 'Status', type: 'status' },
  ];

  function openDecision(row, mode) {
    setDecision({ row, mode });
    setInterest(row.interestRate ?? '');
    setRemarks('');
  }

  function decide(kind) {
    const row = decision.row;
    setData(current => {
      const loans = current.companyLoans.map(entry => {
        if (entry.transactionNo !== row.transactionNo) return entry;
        if (kind === 'reject') {
          return { ...entry, status: 'Rejected', statusDate: today(), approverRemarks: remarks, actionedBy: actor.displayName };
        }
        const rate = Number(interest) || 0;
        const interestAmount = Math.round(entry.loanAmount * (rate / 100));
        return {
          ...entry,
          status: 'Approved',
          statusDate: today(),
          approverRemarks: remarks,
          actionedBy: actor.displayName,
          interestRate: rate,
          interestAmount,
          totalLoan: entry.loanAmount + interestAmount,
          // Nothing has been collected yet — a loan starts owing its total.
          accumulatedPayments: 0,
        };
      });
      const next = { ...current, companyLoans: loans };
      // Approving a loan is what creates the obligation, so the deduction
      // schedule the employee acknowledges and payroll collects against is
      // written here rather than left for someone to raise by hand.
      const approved = loans.find(entry => entry.transactionNo === row.transactionNo);
      return kind === 'approve' ? openLoanScheduleForLoan(next, approved, 'Company Loan') : next;
    });
    onNotify('Status updated successfully!');
    setDecision(null);
  }

  function detailGroups(row) {
    return [
      { pair: [{ label: 'Transaction Number', value: row.transactionNo }, { label: 'Application Date', value: formatDate(row.applicationDate) }] },
      { pair: [{ label: 'Loan Type', value: row.loanType }, { label: 'Loan Amount', value: peso(row.loanAmount) }] },
      { pair: [{ label: 'Loan Terms', value: `${row.loanTerms} months` }, { label: 'Total Loan', value: row.totalLoan ? peso(row.totalLoan) : '-' }] },
      { label: 'Purpose', value: row.purpose },
      { label: 'Employee Remarks', value: row.employeeRemarks },
      { label: 'Interest Rate', value: row.interestRate !== null && row.interestRate !== undefined ? `${row.interestRate}%` : '-' },
      { pair: [{ label: 'Payroll Cutoff Start Date', value: formatDate(row.payrollCutoffStart) }, { label: 'Payroll Cutoff End Date', value: formatDate(row.payrollCutoffEnd) }] },
      { label: 'Deduction Amount', value: peso(row.deductionAmount) },
      { pair: [{ label: 'Payment Mode', value: row.paymentMode }, { label: 'Frequency', value: row.frequency }] },
      { label: 'Accumulated Payments', value: row.accumulatedPayments ? peso(row.accumulatedPayments) : '-' },
      { label: 'Attachments', node: <ul className="hrm-file-list readonly">{(row.attachments || []).map(file => <li key={file.name}><span className="hrm-file-name">{file.name}</span><span className="hrm-file-size">{file.size}</span></li>)}</ul> },
      { pair: [{ label: 'Filed By', value: row.employeeName }, { label: 'Actioned By', value: row.actionedBy || '-' }] },
      { label: 'Remarks', value: row.approverRemarks || '-' },
      { pair: [{ label: 'Status', node: <StatusText status={row.status} /> }, { label: 'Status Date', value: row.statusDate ? formatDate(row.statusDate) : '-' }] },
    ];
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[{ label: 'Loan Management', onClick: onBack }, { label: screen.title }]} />
    <PageHeading title={screen.title} />
    <StatusTabs tabs={LOAN_STATUS_TABS} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} />
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
        {!isApproval && <label className="hrm-toggle">
          <input type="checkbox" checked={ownOnly} onChange={event => setOwnOnly(event.target.checked)} />
          <span className="hrm-toggle-track"><span className="hrm-toggle-thumb" /></span>
          <span>View Personal Records</span>
        </label>}
      </div>
      <div className="hrm-toolbar-right">
        {!isApproval && <>
          <PrimaryButton onClick={() => setApplying(true)}>Apply</PrimaryButton>
          <button type="button" className="hrm-btn outline" onClick={() => onNotify('Bulk upload accepts the company loan template.')}><UploadSimple size={15} /> Upload</button>
        </>}
        <ExportMenu
          disabled={filtered.length === 0}
          onExport={format => {
            downloadFile(`${screen.key}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(columns.map(column => column.label), filtered.map(row => columns.map(column => row[column.key]))));
            onNotify(`${screen.title} exported to ${format}.`);
          }}
        />
      </div>
    </div>
    <DataTable
      columns={columns}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={row => row.transactionNo}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No company loan applications in this view."
      renderCell={(row, column) => {
        if (column.key === 'status') return <StatusText status={row.status} />;
        if (column.key === 'loanAmount') return peso(row.loanAmount);
        return formatCell(row[column.key], column.type);
      }}
      actions={row => isApproval
        ? [
            ...(shortStatus(row.status) === 'Pending' ? [
              { kind: 'view', label: 'Approve', onSelect: () => openDecision(row, 'approve') },
              { kind: 'cancel', label: 'Reject', onSelect: () => openDecision(row, 'reject') },
            ] : []),
            { kind: 'view', label: 'View', onSelect: () => openDecision(row, 'view') },
            { kind: 'view', label: 'Approval log', onSelect: () => setApprovalLog(row) },
          ]
        : [
            { kind: 'view', label: 'View', onSelect: () => openDecision(row, 'view') },
            ...(shortStatus(row.status) === 'Pending' ? [{ kind: 'edit', label: 'Edit', onSelect: () => onNotify('Editing a pending loan application.') }] : []),
          ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'transactionNo', label: 'Transaction Number' },
        { key: 'employeeName', label: 'Employee Full Name' },
        { key: 'loanType', label: 'Loan Type', options: [...COMPANY_LOAN_TYPES] },
        { key: 'applicationDate', label: 'Application Date', type: 'date' },
        { key: 'status', label: 'Status', options: LOAN_STATUS_TABS.filter(tab => tab !== 'All') },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {decision && <Modal
      title={decision.mode === 'approve' ? 'Approve Request' : decision.mode === 'reject' ? 'Reject Request' : 'View Company Loan Application'}
      onClose={() => setDecision(null)}
      footer={decision.mode === 'view' ? <GhostButton onClick={() => setDecision(null)}>Close</GhostButton> : <>
        <GhostButton onClick={() => setDecision(null)}>Cancel</GhostButton>
        <button type="button" className={`hrm-btn ${decision.mode === 'approve' ? 'primary' : 'danger'}`} onClick={() => decide(decision.mode)}>
          {decision.mode === 'approve' ? 'Approve' : 'Reject'}
        </button>
      </>}
    >
      <DetailList groups={decision.mode === 'view' ? detailGroups(decision.row) : [
        { pair: [{ label: 'Application Date', value: formatDate(decision.row.applicationDate) }, { label: 'Employee Name', value: decision.row.employeeName }] },
        { pair: [{ label: 'Employee Code', value: decision.row.employeeCode }, { label: 'Department', value: decision.row.department }] },
        { pair: [{ label: 'Division', value: decision.row.division }, { label: 'Transaction Number', value: decision.row.transactionNo }] },
        { pair: [{ label: 'Company Loan Type', value: decision.row.loanType }, { label: 'Loan Amount', value: peso(decision.row.loanAmount) }] },
        { pair: [{ label: 'Loan Terms', value: `${decision.row.loanTerms} years` }, { label: 'Purpose', value: decision.row.purpose }] },
        { label: 'Employee Remarks', value: decision.row.employeeRemarks },
      ]} />
      {decision.mode === 'approve' && <Field label="Interest" required>
        <input type="number" min="0" max="100" value={interest} onChange={event => setInterest(event.target.value)} placeholder="0 %" />
      </Field>}
      {decision.mode !== 'view' && <Field label="Approver Remarks">
        <textarea rows={3} value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Input approver remarks" />
      </Field>}
    </Modal>}

    {approvalLog && <ApprovalLogModal entries={approvalLogFor(approvalLog)} onClose={() => setApprovalLog(null)} />}

    {applying && <LoanApplyModal
      title="Apply for Company Loan"
      loanTypes={COMPANY_LOAN_TYPES}
      loanTypeLabel="Loan Type"
      onClose={() => setApplying(null)}
      onSubmit={values => {
        setData(current => ({ ...current, companyLoans: [{
          transactionNo: `TRX-${String(current.companyLoans.length + 1).padStart(5, '0')}`,
          employeeId: actor.employeeId,
          division: 'Product Department',
          applicationDate: today(),
          loanType: values.loanType,
          loanAmount: Number(values.loanAmount) || 0,
          loanTerms: Number(values.loanTerms) || 0,
          purpose: values.purpose,
          employeeRemarks: values.remarks,
          interestRate: null,
          interestAmount: null,
          totalLoan: Number(values.loanAmount) || 0,
          accumulatedPayments: null,
          payrollCutoffStart: values.payrollCutoffStart,
          payrollCutoffEnd: values.payrollCutoffEnd,
          deductionAmount: Number(values.deductionAmount) || 0,
          paymentMode: values.paymentMode,
          frequency: values.frequency,
          approverRemarks: '',
          actionedBy: '',
          attachments: [],
          status: 'Pending Approval',
          statusDate: '',
        }, ...current.companyLoans] }));
        onNotify('Request sent successfully!');
        setApplying(false);
      }}
    />}
  </div>;
}

/** Shared apply form for company loans; government loans are encoded instead. */
function LoanApplyModal({ title, loanTypes, loanTypeLabel, onClose, onSubmit }) {
  const [values, setValues] = useState({ loanType: '', loanAmount: '', loanTerms: '', purpose: '', remarks: '', payrollCutoffStart: '', payrollCutoffEnd: '', deductionAmount: '', paymentMode: 'Weekly', frequency: '' });
  const set = (key, value) => setValues(current => ({ ...current, [key]: value }));
  return <Modal title={title} onClose={onClose} footer={<>
    <GhostButton onClick={onClose}>Cancel</GhostButton>
    <button type="button" className="hrm-btn primary" onClick={() => onSubmit(values)}>Submit</button>
  </>}>
    <div className="hrm-form-grid">
      <Field label={loanTypeLabel} required>
        <select value={values.loanType} onChange={event => set('loanType', event.target.value)}>
          <option value="">Please select</option>
          {loanTypes.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
      </Field>
      <Field label="Loan Amount" required>
        <input type="number" min="0" value={values.loanAmount} onChange={event => set('loanAmount', event.target.value)} placeholder="Input amount" />
      </Field>
      <Field label="Loan Terms (Months)" required>
        <input type="number" min="1" value={values.loanTerms} onChange={event => set('loanTerms', event.target.value)} placeholder="Input months" />
      </Field>
      <Field label="Deduction Amount">
        <input type="number" min="0" value={values.deductionAmount} onChange={event => set('deductionAmount', event.target.value)} placeholder="Input amount" />
      </Field>
      <Field label="Payroll Cutoff Start Date">
        <input type="date" value={values.payrollCutoffStart} onChange={event => set('payrollCutoffStart', event.target.value)} />
      </Field>
      <Field label="Payroll Cutoff End Date">
        <input type="date" value={values.payrollCutoffEnd} onChange={event => set('payrollCutoffEnd', event.target.value)} />
      </Field>
      <Field label="Payment Mode">
        <select value={values.paymentMode} onChange={event => set('paymentMode', event.target.value)}>
          {PAYMENT_MODES.map(mode => <option key={mode} value={mode}>{mode}</option>)}
        </select>
      </Field>
      <Field label="Frequency">
        <input value={values.frequency} onChange={event => set('frequency', event.target.value)} placeholder="e.g. 1st Week, 3rd Week" />
      </Field>
      <div className="hrm-form-cell span-2">
        <Field label="Purpose" required>
          <textarea rows={2} value={values.purpose} onChange={event => set('purpose', event.target.value)} placeholder="Input purpose" />
        </Field>
      </div>
      <div className="hrm-form-cell span-2">
        <Field label="Employee Remarks">
          <textarea rows={2} value={values.remarks} onChange={event => set('remarks', event.target.value)} placeholder="Input remarks" />
        </Field>
      </div>
    </div>
  </Modal>;
}

function GovernmentLoanScreen({ screen, data, setData, teamEmployeeIds, actor, onBack, onNotify }) {
  const isApproval = screen.kind === 'government-loan-approval';
  const table = useTableState();
  const [statusTab, setStatusTab] = useState(isApproval ? 'Pending' : 'All');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [decision, setDecision] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [approvalLog, setApprovalLog] = useState(null);
  const [encoding, setEncoding] = useState(false);
  const [ownOnly, setOwnOnly] = useState(false);

  const scope = new Set(teamEmployeeIds);
  const rows = (data.governmentLoans || [])
    .filter(row => scope.has(row.employeeId) && (!ownOnly || row.employeeId === actor.employeeId))
    .map(row => {
      const employee = findEmployee(data, row.employeeId);
      return { ...row, employee, employeeName: employee?.name || '', employeeCode: employee?.employeeCode || '', department: employee?.department || '' };
    });

  const filtered = rows.filter(row => {
    if (statusTab !== 'All' && shortStatus(row.status) !== statusTab) return false;
    if (table.search && !`${row.employeeName} ${row.transactionNo} ${row.governmentLoanType}`.toLowerCase().includes(table.search.toLowerCase())) return false;
    return Object.entries(table.filters).every(([key, value]) => !value || String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase()));
  });

  const columns = [
    { key: 'transactionNo', label: 'Transaction number' },
    { key: 'applicationDate', label: 'Application Date', type: 'date' },
    { key: 'employeeName', label: 'Employee Full Name' },
    { key: 'formSubmissionDate', label: 'Form Submission Date', type: 'date' },
    { key: 'governmentLoanType', label: 'Government Loan' },
    { key: 'status', label: 'Status', type: 'status' },
  ];

  function openDecision(row, mode) {
    setDecision({ row, mode });
    setRemarks('');
  }

  function decide(kind) {
    const row = decision.row;
    setData(current => {
      const loans = current.governmentLoans.map(entry => entry.transactionNo !== row.transactionNo ? entry : {
        ...entry,
        status: kind === 'approve' ? 'Approved' : 'Rejected',
        statusDate: today(),
        approverRemarks: remarks,
        actionedBy: actor.displayName,
        // The agency has already granted the loan, so accepting the encoding
        // is what dates it in Atlas.
        dateGranted: kind === 'approve' ? (entry.dateGranted || today()) : entry.dateGranted,
      });
      const next = { ...current, governmentLoans: loans };
      const approved = loans.find(entry => entry.transactionNo === row.transactionNo);
      return kind === 'approve' ? openLoanScheduleForLoan(next, approved, 'Government Loan') : next;
    });
    onNotify('Status updated successfully!');
    setDecision(null);
  }

  function detailGroups(row) {
    return [
      { pair: [{ label: 'Application Date', value: formatDate(row.applicationDate) }, { label: 'Employee name', value: row.employeeName }] },
      { pair: [{ label: 'Transaction Number', value: row.transactionNo }, { label: 'Government Loan Type', value: row.governmentLoanType }] },
      { pair: [{ label: 'Government Agency', value: row.governmentAgency }, { label: 'Form Submission Date', value: formatDate(row.formSubmissionDate) }] },
      { pair: [{ label: 'Date Granted', value: row.dateGranted ? formatDate(row.dateGranted) : '-' }, { label: 'Loan Amount', value: peso(row.loanAmount) }] },
      { pair: [{ label: 'Loan Terms (Months)', value: `${row.loanTerms} months` }, { label: 'Total Loan', value: peso(row.totalLoan) }] },
      { label: 'Loan Purpose', value: row.purpose },
      { pair: [{ label: 'Interest Rate', value: row.interestRate !== null && row.interestRate !== undefined ? `${row.interestRate}%` : '-' }, { label: 'Interest Amount', value: row.interestAmount ? peso(row.interestAmount) : '-' }] },
      { pair: [{ label: 'Period Start Date', value: row.periodStartDate ? formatDate(row.periodStartDate) : '-' }, { label: 'Period End Date', value: row.periodEndDate ? formatDate(row.periodEndDate) : '-' }] },
      { label: 'Accumulated Payment', value: row.accumulatedPayment ? peso(row.accumulatedPayment) : '-' },
      { label: 'Employee Remarks', value: row.employeeRemarks },
      { label: 'Attachments', node: <ul className="hrm-file-list readonly">{(row.attachments || []).map(file => <li key={file.name}><span className="hrm-file-name">{file.name}</span><span className="hrm-file-size">{file.size}</span></li>)}</ul> },
      { pair: [{ label: 'Filed By', value: row.filedBy }, { label: 'Actioned By', value: row.actionedBy || '-' }] },
      { label: 'Remarks', value: row.approverRemarks || '-' },
      { pair: [{ label: 'Status', node: <StatusText status={row.status} /> }, { label: 'Status Date', value: row.statusDate ? formatDate(row.statusDate) : '-' }] },
    ];
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[{ label: 'Loan Management', onClick: onBack }, { label: screen.title }]} />
    <PageHeading title={screen.title} />
    <StatusTabs tabs={LOAN_STATUS_TABS} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} />
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
        {!isApproval && <label className="hrm-toggle">
          <input type="checkbox" checked={ownOnly} onChange={event => setOwnOnly(event.target.checked)} />
          <span className="hrm-toggle-track"><span className="hrm-toggle-thumb" /></span>
          <span>View Personal Records</span>
        </label>}
      </div>
      <div className="hrm-toolbar-right">
        {!isApproval && <>
          <PrimaryButton onClick={() => setEncoding(true)}>Encode</PrimaryButton>
          <button type="button" className="hrm-btn outline" onClick={() => onNotify('Bulk upload accepts the government loan template.')}><UploadSimple size={15} /> Upload</button>
        </>}
        <ExportMenu
          disabled={filtered.length === 0}
          onExport={format => {
            downloadFile(`${screen.key}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(columns.map(column => column.label), filtered.map(row => columns.map(column => row[column.key]))));
            onNotify(`${screen.title} exported to ${format}.`);
          }}
        />
      </div>
    </div>
    <DataTable
      columns={columns}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={row => row.transactionNo}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No government loan records in this view."
      renderCell={(row, column) => {
        if (column.key === 'status') return <StatusText status={row.status} />;
        return formatCell(row[column.key], column.type);
      }}
      actions={row => isApproval
        ? [
            ...(shortStatus(row.status) === 'Pending' ? [
              { kind: 'view', label: 'Approve', onSelect: () => openDecision(row, 'approve') },
              { kind: 'cancel', label: 'Reject', onSelect: () => openDecision(row, 'reject') },
            ] : []),
            { kind: 'view', label: 'View', onSelect: () => openDecision(row, 'view') },
            { kind: 'view', label: 'Approval log', onSelect: () => setApprovalLog(row) },
          ]
        : [
            { kind: 'view', label: 'View', onSelect: () => openDecision(row, 'view') },
            { kind: 'edit', label: 'Edit', onSelect: () => onNotify('Editing an encoded government loan record.') },
          ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'transactionNo', label: 'Transaction Number' },
        { key: 'governmentLoanType', label: 'Government Loan Type', options: [...GOVERNMENT_LOAN_TYPES] },
        { key: 'governmentAgency', label: 'Government Agency', options: [...GOVERNMENT_AGENCIES] },
        { key: 'formSubmissionDate', label: 'Form Submission Date', type: 'date' },
        { key: 'status', label: 'Status', options: LOAN_STATUS_TABS.filter(tab => tab !== 'All') },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {decision && <Modal
      title={decision.mode === 'approve' ? 'Approve Request' : decision.mode === 'reject' ? 'Reject Request' : 'View Government Loan Application'}
      onClose={() => setDecision(null)}
      footer={decision.mode === 'view' ? <GhostButton onClick={() => setDecision(null)}>Close</GhostButton> : <>
        <GhostButton onClick={() => setDecision(null)}>Cancel</GhostButton>
        <button type="button" className={`hrm-btn ${decision.mode === 'approve' ? 'primary' : 'danger'}`} onClick={() => decide(decision.mode)}>
          {decision.mode === 'approve' ? 'Approve' : 'Reject'}
        </button>
      </>}
    >
      <DetailList groups={decision.mode === 'view' ? detailGroups(decision.row) : [
        { pair: [{ label: 'Application Date', value: formatDate(decision.row.applicationDate) }, { label: 'Employee Name', value: decision.row.employeeName }] },
        { pair: [{ label: 'Employee Code', value: decision.row.employeeCode }, { label: 'Department', value: decision.row.department }] },
        { pair: [{ label: 'Transaction Number', value: decision.row.transactionNo }, { label: 'Government Loan Type', value: decision.row.governmentLoanType }] },
        { pair: [{ label: 'Government Agency', value: decision.row.governmentAgency }, { label: 'Loan Amount', value: peso(decision.row.loanAmount) }] },
        { label: 'Purpose', value: decision.row.purpose },
        { label: 'Employee Remarks', value: decision.row.employeeRemarks },
      ]} />
      {decision.mode !== 'view' && <Field label="Approver Remarks">
        <textarea rows={3} value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Input approver remarks" />
      </Field>}
    </Modal>}

    {approvalLog && <ApprovalLogModal entries={approvalLogFor(approvalLog)} onClose={() => setApprovalLog(null)} />}

    {encoding && <GovernmentLoanEncodeModal
      onClose={() => setEncoding(false)}
      onSubmit={values => {
        setData(current => ({ ...current, governmentLoans: [{
          transactionNo: `TRX-${String(current.governmentLoans.length + 1).padStart(5, '0')}`,
          employeeId: actor.employeeId,
          applicationDate: today(),
          formSubmissionDate: values.formSubmissionDate || today(),
          governmentLoanType: values.governmentLoanType,
          governmentAgency: values.governmentAgency,
          dateGranted: values.dateGranted,
          loanAmount: Number(values.loanAmount) || 0,
          loanTerms: Number(values.loanTerms) || 0,
          totalLoan: Number(values.loanAmount) || 0,
          purpose: values.purpose,
          employeeRemarks: values.remarks,
          interestRate: values.interestRate === '' ? null : Number(values.interestRate),
          interestAmount: values.interestAmount === '' ? null : Number(values.interestAmount),
          periodStartDate: values.periodStartDate,
          periodEndDate: values.periodEndDate,
          accumulatedPayment: null,
          approverRemarks: '',
          actionedBy: '',
          filedBy: actor.displayName,
          attachments: [],
          status: 'Pending Approval',
          statusDate: '',
        }, ...current.governmentLoans] }));
        onNotify('Government loan record encoded.');
        setEncoding(false);
      }}
    />}
  </div>;
}

/** The Encode form: government loan details are already known when entered. */
function GovernmentLoanEncodeModal({ onClose, onSubmit }) {
  const [values, setValues] = useState({ governmentLoanType: '', governmentAgency: '', formSubmissionDate: '', dateGranted: '', loanAmount: '', loanTerms: '', interestRate: '', interestAmount: '', periodStartDate: '', periodEndDate: '', purpose: '', remarks: '' });
  const set = (key, value) => setValues(current => ({ ...current, [key]: value }));
  return <Modal title="Encode Government Loan" onClose={onClose} footer={<>
    <GhostButton onClick={onClose}>Cancel</GhostButton>
    <button type="button" className="hrm-btn primary" onClick={() => onSubmit(values)}>Submit</button>
  </>}>
    <div className="hrm-form-grid">
      <Field label="Government Loan Type" required>
        <select value={values.governmentLoanType} onChange={event => set('governmentLoanType', event.target.value)}>
          <option value="">Please select</option>
          {GOVERNMENT_LOAN_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
      </Field>
      <Field label="Government Agency" required>
        <select value={values.governmentAgency} onChange={event => set('governmentAgency', event.target.value)}>
          <option value="">Please select</option>
          {GOVERNMENT_AGENCIES.map(agency => <option key={agency} value={agency}>{agency}</option>)}
        </select>
      </Field>
      <Field label="Form Submission Date">
        <input type="date" value={values.formSubmissionDate} onChange={event => set('formSubmissionDate', event.target.value)} />
      </Field>
      <Field label="Date Granted">
        <input type="date" value={values.dateGranted} onChange={event => set('dateGranted', event.target.value)} />
      </Field>
      <Field label="Loan Amount" required>
        <input type="number" min="0" value={values.loanAmount} onChange={event => set('loanAmount', event.target.value)} placeholder="Input amount" />
      </Field>
      <Field label="Loan Terms (Months)" required>
        <input type="number" min="1" value={values.loanTerms} onChange={event => set('loanTerms', event.target.value)} placeholder="Input months" />
      </Field>
      <Field label="Interest Rate (%)">
        <input type="number" min="0" max="100" value={values.interestRate} onChange={event => set('interestRate', event.target.value)} placeholder="0 %" />
      </Field>
      <Field label="Interest Amount">
        <input type="number" min="0" value={values.interestAmount} onChange={event => set('interestAmount', event.target.value)} placeholder="Input amount" />
      </Field>
      <Field label="Period Start Date">
        <input type="date" value={values.periodStartDate} onChange={event => set('periodStartDate', event.target.value)} />
      </Field>
      <Field label="Period End Date">
        <input type="date" value={values.periodEndDate} onChange={event => set('periodEndDate', event.target.value)} />
      </Field>
      <div className="hrm-form-cell span-2">
        <Field label="Loan Purpose" required>
          <textarea rows={2} value={values.purpose} onChange={event => set('purpose', event.target.value)} placeholder="Input purpose" />
        </Field>
      </div>
      <div className="hrm-form-cell span-2">
        <Field label="Remarks">
          <textarea rows={2} value={values.remarks} onChange={event => set('remarks', event.target.value)} placeholder="Input remarks" />
        </Field>
      </div>
    </div>
  </Modal>;
}
/* ------------------------------------------- employee requests management (Part 4) */

/**
 * Resignation Screen: handles both Approval and Management views.
 * Part 4: Employee Resignation Approval & Management.
 */
function ResignationScreen({ screen, data, setData, actor, teamEmployeeIds, onBack, onNotify }) {
  const isApproval = screen.kind === 'resignation-approval';
  const table = useTableState();
  const [statusTab, setStatusTab] = useState('All');
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [birReason, setBirReason] = useState('Termination');
  const [approverRemarks, setApproverRemarks] = useState('');
  const [approvalLog, setApprovalLog] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const resignations = data.resignations || [];

  const scoped = useMemo(() => resignations.filter(row => {
    if (actor.permissions?.includes(REQUEST_PERMISSIONS.VIEW_COMPANY_REQUESTS)) return true;
    if (actor.permissions?.includes(REQUEST_PERMISSIONS.VIEW_TEAM_REQUESTS)) return teamEmployeeIds.includes(row.employeeId);
    return true;
  }), [resignations, actor, teamEmployeeIds]);

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return scoped.filter(row => {
      if (statusTab !== 'All' && shortStatus(row.status) !== statusTab) return false;
      if (term) {
        const matches = [row.employeeCode, row.employeeName, row.department, row.division, row.reason]
          .some(value => String(value ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return Object.entries(table.filters).every(([key, value]) => {
        if (!value) return true;
        if (key === 'status') return shortStatus(row.status) === value;
        return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
      });
    });
  }, [scoped, statusTab, table.search, table.filters]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  const columns = [
    { key: 'applicationDate', label: 'Application Date', type: 'date' },
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'employeeName', label: 'Employee Name' },
    { key: 'department', label: 'Department' },
    { key: 'division', label: 'Division' },
  ];

  function toggleRow(id, checked) {
    setSelectedKeys(current => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked) {
    if (checked) setSelectedKeys(new Set(pageRows.map(row => row.id)));
    else setSelectedKeys(new Set());
  }

  function handleSingleDecision(status) {
    const target = approving || rejecting;
    if (!target) return;
    setData(current => {
      const rows = (current.resignations || []).map(row => {
        if (row.id !== target.id) return row;
        return {
          ...row,
          status,
          statusDate: today(),
          actionedBy: actor.displayName || 'Mark Santos',
          separationReasonBir: birReason,
          approverRemarks,
        };
      });
      // An approved separation opens its clearance case, so offboarding
      // starts from the approval rather than from someone remembering to
      // raise it.
      const decided = rows.find(row => row.id === target.id);
      return openClearanceForSeparation({ ...current, resignations: rows }, decided);
    });
    onNotify('Status updated successfully!');
    setApproving(null);
    setRejecting(null);
    setApproverRemarks('');
    setBirReason('Termination');
  }

  function handleBulkDecision(status) {
    setData(current => {
      const rows = (current.resignations || []).map(row => {
        if (!selectedKeys.has(row.id)) return row;
        return {
          ...row,
          status,
          statusDate: today(),
          actionedBy: actor.displayName || 'Mark Santos',
          approverRemarks: approverRemarks || (status === 'Approved' ? 'Bulk approved.' : 'Bulk rejected.'),
        };
      });
      // Each employee in a bulk decision gets their own clearance case.
      return rows
        .filter(row => selectedKeys.has(row.id))
        .reduce((next, row) => openClearanceForSeparation(next, row), { ...current, resignations: rows });
    });
    onNotify('Status updated successfully!');
    setSelectedKeys(new Set());
    setBulkApproving(false);
    setBulkRejecting(false);
    setApproverRemarks('');
  }

  function exportRows(format) {
    const headers = ['Application Date', 'Employee Code', 'Employee Name', 'Department', 'Division', 'Reason for Resignation', 'Effectivity Date', 'Status', 'Status Date'];
    const rows = filtered.map(row => [row.applicationDate, row.employeeCode, row.employeeName, row.department, row.division, row.reason, row.effectivityDate, shortStatus(row.status), row.statusDate]);
    downloadFile(`resignation-${isApproval ? 'approvals' : 'records'}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Resignation records exported to ${format}.`);
  }

  const detailGroups = row => [
    { label: 'Application Date', value: formatDate(row.applicationDate) },
    { pair: [
      { label: 'Employee Name', value: row.employeeName },
      { label: 'Employee Code', value: row.employeeCode },
    ] },
    { pair: [
      { label: 'Department', value: row.department },
      { label: 'Division', value: row.division },
    ] },
    { label: 'Reason for Resignation', value: row.reason },
    { label: 'Effectivity Date', value: formatDate(row.effectivityDate) },
    { label: 'Employee Remarks', value: row.employeeRemarks || row.remarks || '—' },
    { label: 'Submission Type', value: row.submissionType || 'System-generated' },
    { label: 'Submitted File', node: row.submittedFile ? (
      <div className="hrm-file-pill">
        <FileText size={15} />
        <span>{row.submittedFile.name}</span>
        <button type="button" className="hrm-link-inline" onClick={() => setPreviewDoc({ fileName: row.submittedFile.name, details: row, title: 'Notice of Resignation' })}>
          Preview
        </button>
        <span className="hrm-file-size">({row.submittedFile.size})</span>
      </div>
    ) : '—' },
    { pair: [
      { label: 'Filed By', value: row.filedBy || row.employeeName || '—' },
      { label: 'Actioned By', value: row.actionedBy || '—' },
    ] },
    ...(row.separationReasonBir ? [{ label: 'Reason for Separation (BIR Reporting)', value: row.separationReasonBir }] : []),
    { label: 'Approver Remarks', value: row.approverRemarks || '—' },
    { pair: [
      { label: 'Status', node: <StatusText status={row.status} /> },
      { label: 'Status Date', value: formatDate(row.statusDate) },
    ] },
  ];

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[
      { label: 'Employee Requests Management', onClick: onBack },
      { label: screen.title },
    ]} />
    <PageHeading title={screen.title} />

    {isApproval && selectedKeys.size > 0 && (
      <BulkSelectionBar
        selectedCount={selectedKeys.size}
        onApprove={() => setBulkApproving(true)}
        onReject={() => setBulkRejecting(true)}
      />
    )}

    <StatusTabs tabs={LOAN_STATUS_TABS} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} />

    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu onExport={exportRows} disabled={filtered.length === 0} />
      </div>
    </div>

    <DataTable
      columns={columns}
      rows={pageRows}
      total={filtered.length}
      rowKey={row => row.id}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No resignation records found."
      selectedKeys={isApproval ? selectedKeys : undefined}
      onSelectRow={isApproval ? toggleRow : undefined}
      onSelectAll={isApproval ? toggleAll : undefined}
      renderCell={(row, column) => {
        if (column.key === 'employeeName') {
          return <span className="hrm-approver"><span className="hrm-avatar-sm">{initialsOf(row.employeeName)}</span>{row.employeeName}</span>;
        }
        return formatCell(row[column.key], column.type);
      }}
      actions={row => isApproval ? [
        { kind: 'view', label: 'View Details', onSelect: () => setViewing(row) },
        { kind: 'view', label: 'Approval Log', onSelect: () => setApprovalLog(row) },
        ...(row.status === 'Pending Approval' ? [
          { kind: 'edit', label: 'Approve', onSelect: () => { setApproving(row); setBirReason('Termination'); setApproverRemarks(''); } },
          { kind: 'cancel', label: 'Reject', onSelect: () => { setRejecting(row); setBirReason('Termination'); setApproverRemarks(''); } },
        ] : []),
      ] : [
        { kind: 'view', label: 'View Full Details', onSelect: () => setViewing(row) },
        { kind: 'view', label: 'Approval Log', onSelect: () => setApprovalLog(row) },
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'applicationDate', label: 'Application Date', type: 'date' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department', options: [...new Set(scoped.map(row => row.department))] },
        { key: 'division', label: 'Division', options: [...new Set(scoped.map(row => row.division))] },
        { key: 'reason', label: 'Reason for Resignation', options: [...new Set(scoped.map(row => row.reason))] },
        { key: 'effectivityDate', label: 'Effectivity Date', type: 'date' },
        { key: 'submissionType', label: 'Submission Type', options: ['System-generated', 'Employee Submission'] },
        { key: 'status', label: 'Status', options: LOAN_STATUS_TABS.filter(tab => tab !== 'All') },
        { key: 'statusDate', label: 'Status Date', type: 'date' },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {/* Single Approve Modal */}
    {approving && <Modal
      title="Approve Request"
      width="lg"
      onClose={() => setApproving(null)}
      footer={<>
        <GhostButton onClick={() => setApproving(null)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn success" onClick={() => handleSingleDecision('Approved')}>
          <CheckCircle size={15} weight="bold" /> Approve
        </button>
      </>}
    >
      <div className="hrm-form-grid" style={{ marginBottom: 16 }}>
        <Field label="Application Date"><input value={formatDate(approving.applicationDate)} readOnly disabled /></Field>
        <Field label="Employee Name"><input value={approving.employeeName} readOnly disabled /></Field>
        <Field label="Employee Code"><input value={approving.employeeCode} readOnly disabled /></Field>
        <Field label="Department"><input value={approving.department} readOnly disabled /></Field>
        <Field label="Division"><input value={approving.division} readOnly disabled /></Field>
        <Field label="Reason for Resignation"><input value={approving.reason} readOnly disabled /></Field>
        <Field label="Effectivity Date"><input value={formatDate(approving.effectivityDate)} readOnly disabled /></Field>
        <div className="hrm-form-cell span-2">
          <Field label="Employee Remarks"><textarea rows={2} value={approving.employeeRemarks || approving.remarks || ''} readOnly disabled /></Field>
        </div>
      </div>
      <hr className="hrm-divider" />
      <div className="hrm-form-grid" style={{ marginTop: 16 }}>
        <Field label="Reason for Separation (BIR Reporting)" required>
          <select value={birReason} onChange={e => setBirReason(e.target.value)}>
            {BIR_SEPARATION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <div className="hrm-form-cell span-2">
          <Field label="Approver Remarks">
            <textarea rows={3} value={approverRemarks} onChange={e => setApproverRemarks(e.target.value)} placeholder="Input approver remarks" />
          </Field>
        </div>
      </div>
    </Modal>}

    {/* Single Reject Modal */}
    {rejecting && <Modal
      title="Reject Request"
      width="lg"
      onClose={() => setRejecting(null)}
      footer={<>
        <GhostButton onClick={() => setRejecting(null)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn danger" onClick={() => handleSingleDecision('Rejected')}>
          Reject
        </button>
      </>}
    >
      <div className="hrm-form-grid" style={{ marginBottom: 16 }}>
        <Field label="Application Date"><input value={formatDate(rejecting.applicationDate)} readOnly disabled /></Field>
        <Field label="Employee Name"><input value={rejecting.employeeName} readOnly disabled /></Field>
        <Field label="Employee Code"><input value={rejecting.employeeCode} readOnly disabled /></Field>
        <Field label="Department"><input value={rejecting.department} readOnly disabled /></Field>
        <Field label="Division"><input value={rejecting.division} readOnly disabled /></Field>
        <Field label="Reason for Resignation"><input value={rejecting.reason} readOnly disabled /></Field>
        <Field label="Effectivity Date"><input value={formatDate(rejecting.effectivityDate)} readOnly disabled /></Field>
        <div className="hrm-form-cell span-2">
          <Field label="Employee Remarks"><textarea rows={2} value={rejecting.employeeRemarks || rejecting.remarks || ''} readOnly disabled /></Field>
        </div>
      </div>
      <hr className="hrm-divider" />
      <div className="hrm-form-grid" style={{ marginTop: 16 }}>
        <Field label="Reason for Separation (BIR Reporting)" required>
          <select value={birReason} onChange={e => setBirReason(e.target.value)}>
            {BIR_SEPARATION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <div className="hrm-form-cell span-2">
          <Field label="Approver Remarks">
            <textarea rows={3} value={approverRemarks} onChange={e => setApproverRemarks(e.target.value)} placeholder="Input approver remarks" />
          </Field>
        </div>
      </div>
    </Modal>}

    {/* Bulk Approve Modal */}
    {bulkApproving && <Modal
      title="Approve Request"
      width="md"
      onClose={() => setBulkApproving(false)}
      footer={<>
        <GhostButton onClick={() => setBulkApproving(false)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn success" onClick={() => handleBulkDecision('Approved')}>
          <CheckCircle size={15} weight="bold" /> Approve ({selectedKeys.size})
        </button>
      </>}
    >
      <p style={{ marginBottom: 16 }}>Are you sure you want to approve the <strong>{selectedKeys.size}</strong> selected resignation {plural(selectedKeys.size, 'request')}?</p>
      <Field label="Approver Remarks">
        <textarea rows={3} value={approverRemarks} onChange={e => setApproverRemarks(e.target.value)} placeholder="Input approver remarks" />
      </Field>
    </Modal>}

    {/* Bulk Reject Modal */}
    {bulkRejecting && <Modal
      title="Reject Request"
      width="md"
      onClose={() => setBulkRejecting(false)}
      footer={<>
        <GhostButton onClick={() => setBulkRejecting(false)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn danger" onClick={() => handleBulkDecision('Rejected')}>
          Reject ({selectedKeys.size})
        </button>
      </>}
    >
      <p style={{ marginBottom: 16 }}>Are you sure you want to reject the <strong>{selectedKeys.size}</strong> selected resignation {plural(selectedKeys.size, 'request')}?</p>
      <Field label="Approver Remarks">
        <textarea rows={3} value={approverRemarks} onChange={e => setApproverRemarks(e.target.value)} placeholder="Input approver remarks" />
      </Field>
    </Modal>}

    {/* View Modal */}
    {viewing && <Modal
      title="View Resignation Request"
      width="lg"
      onClose={() => setViewing(null)}
      footer={<GhostButton onClick={() => { setApprovalLog(viewing); setViewing(null); }}>View approval log</GhostButton>}
    >
      <DetailList groups={detailGroups(viewing)} />
    </Modal>}

    {approvalLog && <ApprovalLogModal entries={approvalLogFor(approvalLog)} onClose={() => setApprovalLog(null)} />}
    {previewDoc && <DocumentViewerModal fileName={previewDoc.fileName} details={previewDoc.details} title={previewDoc.title || 'Notice of Resignation'} onClose={() => setPreviewDoc(null)} />}
  </div>;
}

/**
 * COE Screen: handles both Approval and Management views.
 * Part 4: Certificate of Employment (COE) Request Approval & Management.
 */
function CoeScreen({ screen, data, setData, actor, teamEmployeeIds, onBack, onNotify }) {
  const isApproval = screen.kind === 'coe-approval';
  const table = useTableState();
  const [statusTab, setStatusTab] = useState('All');
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [addingCoe, setAddingCoe] = useState(null);
  const [editingCoe, setEditingCoe] = useState(null);
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [approverRemarks, setApproverRemarks] = useState('');
  const [coeType, setCoeType] = useState('System-generated');
  const [coeFileName, setCoeFileName] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [approvalLog, setApprovalLog] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const coeRequests = data.coeRequests || [];

  const scoped = useMemo(() => coeRequests.filter(row => {
    if (actor.permissions?.includes(REQUEST_PERMISSIONS.VIEW_COMPANY_REQUESTS)) return true;
    if (actor.permissions?.includes(REQUEST_PERMISSIONS.VIEW_TEAM_REQUESTS)) return teamEmployeeIds.includes(row.employeeId);
    return true;
  }), [coeRequests, actor, teamEmployeeIds]);

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return scoped.filter(row => {
      if (statusTab !== 'All' && shortStatus(row.status) !== statusTab) return false;
      if (term) {
        const matches = [row.employeeCode, row.employeeName, row.jobTitle, row.department, row.division, row.purpose]
          .some(value => String(value ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return Object.entries(table.filters).every(([key, value]) => {
        if (!value) return true;
        if (key === 'status') return shortStatus(row.status) === value;
        return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
      });
    });
  }, [scoped, statusTab, table.search, table.filters]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  const columns = [
    { key: 'dateRequested', label: 'Date Requested', type: 'date' },
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'employeeName', label: 'Employee Name' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'department', label: 'Department' },
    { key: 'division', label: 'Division' },
  ];

  function toggleRow(id, checked) {
    setSelectedKeys(current => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked) {
    if (checked) setSelectedKeys(new Set(pageRows.map(row => row.id)));
    else setSelectedKeys(new Set());
  }

  function openAddCoe(row) {
    setAddingCoe(row);
    setCoeType('System-generated');
    setCoeFileName(`Certificate-of-Employment-${row.employeeCode}.docx`);
    setUploadedFiles([]);
  }

  function openEditCoe(row) {
    setEditingCoe(row);
    setUploadedFiles([]);
  }

  function saveAddCoe() {
    if (!addingCoe) return;
    const file = coeType === 'System-generated'
      ? { name: coeFileName || `Certificate-of-Employment-${addingCoe.employeeCode}.docx`, size: '1.7MB' }
      : uploadedFiles[0] || { name: `COE_Upload_${addingCoe.employeeCode}.docx`, size: '1.5MB' };

    setData(current => {
      const rows = (current.coeRequests || []).map(row => {
        if (row.id !== addingCoe.id) return row;
        return {
          ...row,
          coeType,
          coeFile: file,
        };
      });
      return { ...current, coeRequests: rows };
    });
    onNotify('COE file added successfully!');
    setAddingCoe(null);
  }

  function saveEditCoe() {
    if (!editingCoe) return;
    const nextFile = uploadedFiles[0] || editingCoe.coeFile || { name: 'Updated_Certificate.docx', size: '1.8MB' };
    setData(current => {
      const rows = (current.coeRequests || []).map(row => {
        if (row.id !== editingCoe.id) return row;
        return {
          ...row,
          coeFile: nextFile,
        };
      });
      return { ...current, coeRequests: rows };
    });
    onNotify('COE file added successfully!');
    setEditingCoe(null);
  }

  function handleDecision(status) {
    const target = approving || rejecting;
    if (!target) return;
    setData(current => {
      const rows = (current.coeRequests || []).map(row => {
        if (row.id !== target.id) return row;
        return {
          ...row,
          status,
          statusDate: today(),
          actionedBy: actor.displayName || 'Mark Santos',
          approverRemarks,
        };
      });
      return { ...current, coeRequests: rows };
    });
    onNotify('Status updated successfully!');
    setApproving(null);
    setRejecting(null);
    setApproverRemarks('');
  }

  function exportRows(format) {
    const headers = ['Date Requested', 'Employee Code', 'Employee Name', 'Job Title', 'Department', 'Division', 'Date Needed', 'Purpose', 'Status', 'Status Date'];
    const rows = filtered.map(row => [row.dateRequested, row.employeeCode, row.employeeName, row.jobTitle, row.department, row.division, row.dateNeeded, row.purpose, shortStatus(row.status), row.statusDate]);
    downloadFile(`coe-requests-${isApproval ? 'approvals' : 'records'}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Certificate of Employment records exported to ${format}.`);
  }

  const detailGroups = row => [
    { label: 'Date Requested', value: formatDate(row.dateRequested) },
    { pair: [
      { label: 'Employee Name', value: row.employeeName },
      { label: 'Employee Code', value: row.employeeCode },
    ] },
    { pair: [
      { label: 'Department', value: row.department },
      { label: 'Division', value: row.division },
    ] },
    { label: 'Job Title', value: row.jobTitle },
    { pair: [
      { label: 'Date Needed', value: formatDate(row.dateNeeded) },
      { label: 'Purpose', value: row.purpose },
    ] },
    { label: row.purpose === 'Credit Card' ? 'Bank Name' : 'Company / Institution Name', value: row.companyInstitutionName || 'ClearView Cable Services Ltd.' },
    { label: 'Recipient Address', value: row.recipientAddress || '—' },
    { label: 'With Salary Information', value: row.withSalaryInfo || 'Yes' },
    { label: 'Employee Remarks', value: row.employeeRemarks || row.remarks || '—' },
    { label: 'COE Document', node: row.coeFile ? (
      <div className="hrm-file-pill">
        <FileText size={15} />
        <span>{row.coeFile.name}</span>
        <button type="button" className="hrm-link-inline" onClick={() => setPreviewDoc({ fileName: row.coeFile.name, details: row, title: 'Certificate of Employment' })}>
          Preview
        </button>
        <span className="hrm-file-size">({row.coeFile.size})</span>
      </div>
    ) : <span className="muted">No COE file attached</span> },
    { pair: [
      { label: 'Filed By', value: row.filedBy || row.employeeName || '—' },
      { label: 'Actioned By', value: row.actionedBy || '—' },
    ] },
    { label: 'Approver Remarks', value: row.approverRemarks || '—' },
    { pair: [
      { label: 'Status', node: <StatusText status={row.status} /> },
      { label: 'Status Date', value: formatDate(row.statusDate) },
    ] },
  ];

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[
      { label: 'Employee Requests Management', onClick: onBack },
      { label: screen.title },
    ]} />
    <PageHeading title={screen.title} />

    <StatusTabs tabs={LOAN_STATUS_TABS} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} />

    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu onExport={exportRows} disabled={filtered.length === 0} />
      </div>
    </div>

    <DataTable
      columns={columns}
      rows={pageRows}
      total={filtered.length}
      rowKey={row => row.id}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No COE records found."
      selectedKeys={isApproval ? selectedKeys : undefined}
      onSelectRow={isApproval ? toggleRow : undefined}
      onSelectAll={isApproval ? toggleAll : undefined}
      renderCell={(row, column) => {
        if (column.key === 'employeeName') {
          return <span className="hrm-approver"><span className="hrm-avatar-sm">{initialsOf(row.employeeName)}</span>{row.employeeName}</span>;
        }
        return formatCell(row[column.key], column.type);
      }}
      actions={row => isApproval ? [
        { kind: 'view', label: 'View Details', onSelect: () => setViewing(row) },
        { kind: 'view', label: 'Approval Log', onSelect: () => setApprovalLog(row) },
        ...(row.status === 'Pending Approval' && !row.coeFile ? [
          { kind: 'edit', label: 'Add COE', onSelect: () => openAddCoe(row) },
        ] : []),
        ...(row.status === 'Pending Approval' && row.coeFile ? [
          { kind: 'edit', label: 'Edit COE', onSelect: () => openEditCoe(row) },
          { kind: 'edit', label: 'Approve', onSelect: () => { setApproving(row); setApproverRemarks(''); } },
          { kind: 'cancel', label: 'Reject', onSelect: () => { setRejecting(row); setApproverRemarks(''); } },
        ] : []),
      ] : [
        { kind: 'view', label: 'View Full Details', onSelect: () => setViewing(row) },
        { kind: 'view', label: 'Approval Log', onSelect: () => setApprovalLog(row) },
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'dateRequested', label: 'Date Requested', type: 'date' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department', options: [...new Set(scoped.map(row => row.department))] },
        { key: 'division', label: 'Division', options: [...new Set(scoped.map(row => row.division))] },
        { key: 'dateNeeded', label: 'Date Needed', type: 'date' },
        { key: 'purpose', label: 'Purpose', options: [...new Set(scoped.map(row => row.purpose))] },
        { key: 'status', label: 'Status', options: LOAN_STATUS_TABS.filter(tab => tab !== 'All') },
        { key: 'statusDate', label: 'Status Date', type: 'date' },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {/* Add Certificate of Employment Modal */}
    {addingCoe && <Modal
      title="Add Certificate of Employment"
      width="lg"
      onClose={() => setAddingCoe(null)}
      footer={<>
        <GhostButton onClick={() => setAddingCoe(null)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn primary" onClick={saveAddCoe}>Add</button>
      </>}
    >
      <fieldset className="hrm-radio-group" style={{ marginBottom: 16 }}>
        <legend>COE Type <em aria-hidden="true">*</em></legend>
        <div>
          <label className="hrm-radio">
            <input type="radio" name="coeType" value="System-generated" checked={coeType === 'System-generated'} onChange={() => setCoeType('System-generated')} />
            <span>System-generated</span>
          </label>
          <label className="hrm-radio">
            <input type="radio" name="coeType" value="File Upload" checked={coeType === 'File Upload'} onChange={() => setCoeType('File Upload')} />
            <span>File Upload</span>
          </label>
        </div>
      </fieldset>

      {coeType === 'System-generated' ? (
        <div className="hrm-form-grid">
          <div className="hrm-form-cell span-2">
            <Field label="File Name" required>
              <input value={coeFileName} onChange={e => setCoeFileName(e.target.value)} placeholder="Input file name" />
            </Field>
          </div>
          <Field label="Date Requested"><input value={formatDate(addingCoe.dateRequested)} readOnly disabled /></Field>
          <Field label="Employee Name"><input value={addingCoe.employeeName} readOnly disabled /></Field>
          <Field label="Job Title"><input value={addingCoe.jobTitle} readOnly disabled /></Field>
          <Field label="Division"><input value={addingCoe.division} readOnly disabled /></Field>
          <Field label="Department"><input value={addingCoe.department} readOnly disabled /></Field>
          <Field label="Purpose"><input value={addingCoe.purpose} readOnly disabled /></Field>
          <Field label="With Salary Information"><input value={addingCoe.withSalaryInfo || 'Yes'} readOnly disabled /></Field>
        </div>
      ) : (
        <Field label="Upload COE" required hint="Supports .docx files. Maximum file size 2MB.">
          <UploadArea
            files={uploadedFiles}
            onAdd={files => setUploadedFiles(files)}
            onRemove={() => setUploadedFiles([])}
            hint="Supports .docx files. Maximum file size 2MB."
          />
        </Field>
      )}
    </Modal>}

    {/* Edit Certificate of Employment Modal */}
    {editingCoe && <Modal
      title="Edit Certificate of Employment"
      width="lg"
      onClose={() => setEditingCoe(null)}
      footer={<>
        <GhostButton onClick={() => setEditingCoe(null)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn primary" onClick={saveEditCoe}>Save</button>
      </>}
    >
      <div style={{ marginBottom: 16 }}>
        <p className="hrm-form-label" style={{ marginBottom: 6 }}>Current COE File</p>
        <div className="hrm-file-pill" style={{ display: 'inline-flex', padding: '6px 12px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
          <FileText size={16} />
          <span>{editingCoe.coeFile?.name || 'Document example.csv'}</span>
          <button type="button" className="hrm-link-inline" onClick={() => setPreviewDoc({ fileName: editingCoe.coeFile?.name || 'Document example.csv', details: editingCoe, title: 'Certificate of Employment' })}>Preview</button>
          <span className="hrm-file-size">({editingCoe.coeFile?.size || '5.7MB'})</span>
        </div>
      </div>

      <Field label="Upload Updated COE File" required hint="Supports .docx files. Maximum file size 2MB.">
        <UploadArea
          files={uploadedFiles}
          onAdd={files => setUploadedFiles(files)}
          onRemove={() => setUploadedFiles([])}
          hint="Supports .docx files. Maximum file size 2MB."
        />
      </Field>
    </Modal>}

    {/* Approve Request Modal */}
    {approving && <Modal
      title="Approve Request"
      width="lg"
      onClose={() => setApproving(null)}
      footer={<>
        <GhostButton onClick={() => setApproving(null)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn success" onClick={() => handleDecision('Approved')}>
          <CheckCircle size={15} weight="bold" /> Approve
        </button>
      </>}
    >
      <div className="hrm-form-grid" style={{ marginBottom: 16 }}>
        <Field label="Date Requested"><input value={formatDate(approving.dateRequested)} readOnly disabled /></Field>
        <Field label="Employee Name"><input value={approving.employeeName} readOnly disabled /></Field>
        <Field label="Employee Code"><input value={approving.employeeCode} readOnly disabled /></Field>
        <Field label="Job Title"><input value={approving.jobTitle} readOnly disabled /></Field>
        <Field label="Department"><input value={approving.department} readOnly disabled /></Field>
        <Field label="Division"><input value={approving.division} readOnly disabled /></Field>
        <Field label="Date Needed"><input value={formatDate(approving.dateNeeded)} readOnly disabled /></Field>
        <Field label="Purpose"><input value={approving.purpose} readOnly disabled /></Field>
        <Field label="Company / Institution Name"><input value={approving.companyInstitutionName || 'ClearView Cable Services Ltd.'} readOnly disabled /></Field>
        <Field label="Recipient Address"><input value={approving.recipientAddress || '—'} readOnly disabled /></Field>
        <div className="hrm-form-cell span-2">
          <Field label="Employee Remarks"><textarea rows={2} value={approving.employeeRemarks || approving.remarks || ''} readOnly disabled /></Field>
        </div>
      </div>
      <hr className="hrm-divider" />
      <div style={{ marginTop: 16 }}>
        <Field label="Approver Remarks">
          <textarea rows={3} value={approverRemarks} onChange={e => setApproverRemarks(e.target.value)} placeholder="Input approver remarks" />
        </Field>
      </div>
    </Modal>}

    {/* Reject Request Modal */}
    {rejecting && <Modal
      title="Reject Request"
      width="lg"
      onClose={() => setRejecting(null)}
      footer={<>
        <GhostButton onClick={() => setRejecting(null)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn danger" onClick={() => handleDecision('Rejected')}>
          Reject
        </button>
      </>}
    >
      <div className="hrm-form-grid" style={{ marginBottom: 16 }}>
        <Field label="Date Requested"><input value={formatDate(rejecting.dateRequested)} readOnly disabled /></Field>
        <Field label="Employee Name"><input value={rejecting.employeeName} readOnly disabled /></Field>
        <Field label="Employee Code"><input value={rejecting.employeeCode} readOnly disabled /></Field>
        <Field label="Job Title"><input value={rejecting.jobTitle} readOnly disabled /></Field>
        <Field label="Department"><input value={rejecting.department} readOnly disabled /></Field>
        <Field label="Division"><input value={rejecting.division} readOnly disabled /></Field>
        <Field label="Date Needed"><input value={formatDate(rejecting.dateNeeded)} readOnly disabled /></Field>
        <Field label="Purpose"><input value={rejecting.purpose} readOnly disabled /></Field>
        <Field label="Company / Institution Name"><input value={rejecting.companyInstitutionName || 'ClearView Cable Services Ltd.'} readOnly disabled /></Field>
        <Field label="Recipient Address"><input value={rejecting.recipientAddress || '—'} readOnly disabled /></Field>
        <div className="hrm-form-cell span-2">
          <Field label="Employee Remarks"><textarea rows={2} value={rejecting.employeeRemarks || rejecting.remarks || ''} readOnly disabled /></Field>
        </div>
      </div>
      <hr className="hrm-divider" />
      <div style={{ marginTop: 16 }}>
        <Field label="Approver Remarks">
          <textarea rows={3} value={approverRemarks} onChange={e => setApproverRemarks(e.target.value)} placeholder="Input approver remarks" />
        </Field>
      </div>
    </Modal>}

    {/* View Modal */}
    {viewing && <Modal
      title="View COE Request"
      width="lg"
      onClose={() => setViewing(null)}
      footer={<GhostButton onClick={() => { setApprovalLog(viewing); setViewing(null); }}>View approval log</GhostButton>}
    >
      <DetailList groups={detailGroups(viewing)} />
    </Modal>}

    {approvalLog && <ApprovalLogModal entries={approvalLogFor(approvalLog)} onClose={() => setApprovalLog(null)} />}
    {previewDoc && <DocumentViewerModal fileName={previewDoc.fileName} details={previewDoc.details} title={previewDoc.title || 'Certificate of Employment'} onClose={() => setPreviewDoc(null)} />}
  </div>;
}

/**
 * Onboarding Documents Approval Screen (Part 5):
 * Full Part 5 specification supporting Job Description and Employment Contracts sub-tabs,
 * + Add document modal (System Content vs File Upload), 2-step Remarks -> Review modals,
 * Undo Approval, multi-select bulk bar, and document preview.
 */
function OnboardingDocumentsApprovalScreen({ screen, data, setData, actor, teamEmployeeIds, onBack, onNotify }) {
  const table = useTableState();
  const [subTab, setSubTab] = useState('job-description'); // 'job-description' | 'employment-contract'
  const [statusTab, setStatusTab] = useState('All');
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [addingDoc, setAddingDoc] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  // 2-step decision state: { doc, step: 1 | 2, action: 'Approve' | 'Reject' | 'Undo' }
  const [decision, setDecision] = useState(null);
  const [decisionRemarks, setDecisionRemarks] = useState('');
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [bulkRemarks, setBulkRemarks] = useState('');

  // Add form state
  const [addForm, setAddForm] = useState({
    title: '',
    type: 'Job Description',
    submissionType: 'System Content',
    effectivityDate: today(),
    jobTitle: 'Senior Software Developer',
    aboutCompany: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    jobSummary: 'Lead development of enterprise HRM workflows and architecture.',
    responsibilities: 'Develop high quality scalable modules\nConduct peer reviews and testing',
    files: [],
  });

  const docs = data.onboardingDocuments || [];

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return docs.filter(row => {
      if (row.category && row.category !== subTab) return false;
      if (statusTab !== 'All' && shortStatus(row.status) !== statusTab && (statusTab !== 'All Documents')) {
        if (statusTab === 'Pending' && row.status !== 'Pending') return false;
        if (statusTab === 'Approved' && row.status !== 'Approved') return false;
        if (statusTab === 'Rejected' && row.status !== 'Rejected') return false;
      }
      if (term) {
        const matches = [row.documentTitle, row.onboardingDocId, row.author, row.documentType]
          .some(value => String(value ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return Object.entries(table.filters).every(([key, value]) => {
        if (!value) return true;
        if (key === 'status') return row.status === value;
        return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
      });
    });
  }, [docs, subTab, statusTab, table.search, table.filters]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  const columns = [
    { key: 'submissionDate', label: 'Submission Date', type: 'date' },
    { key: 'onboardingDocId', label: 'Onboarding Document ID' },
    { key: 'documentTitle', label: 'Document Title' },
    { key: 'author', label: 'Author' },
    { key: 'dateCreated', label: 'Date Created', type: 'date' },
  ];

  function toggleRow(id, checked) {
    setSelectedKeys(current => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked) {
    if (checked) setSelectedKeys(new Set(pageRows.map(row => row.id)));
    else setSelectedKeys(new Set());
  }

  function startDecision(doc, action) {
    setDecision({ doc, action, step: 1 });
    setDecisionRemarks('');
  }

  function proceedToStep2() {
    if (!decision) return;
    setDecision(current => ({ ...current, step: 2 }));
  }

  function commitDecision() {
    if (!decision) return;
    const { doc, action } = decision;
    const targetStatus = action === 'Approve' ? 'Approved' : action === 'Reject' ? 'Rejected' : 'Pending';

    setData(current => {
      const rows = (current.onboardingDocuments || []).map(row => {
        if (row.id !== doc.id) return row;
        return {
          ...row,
          status: targetStatus,
          statusDate: today(),
          actionedBy: actor.displayName || 'John Collins Doe',
          remarks: decisionRemarks || (action === 'Approve' ? 'Approved.' : action === 'Reject' ? 'Rejected.' : 'Approval undone.'),
        };
      });
      return { ...current, onboardingDocuments: rows };
    });

    onNotify('Status updated successfully!');
    setDecision(null);
    setDecisionRemarks('');
    if (viewing && viewing.id === doc.id) {
      setViewing(null);
    }
  }

  function handleBulkDecision(status) {
    setData(current => {
      const rows = (current.onboardingDocuments || []).map(row => {
        if (!selectedKeys.has(row.id)) return row;
        return {
          ...row,
          status,
          statusDate: today(),
          actionedBy: actor.displayName || 'John Collins Doe',
          remarks: bulkRemarks || (status === 'Approved' ? 'Bulk approved.' : 'Bulk rejected.'),
        };
      });
      return { ...current, onboardingDocuments: rows };
    });
    onNotify('Status updated successfully!');
    setSelectedKeys(new Set());
    setBulkApproving(false);
    setBulkRejecting(false);
    setBulkRemarks('');
  }

  function handleSaveAddDoc() {
    if (!addForm.title) return;
    const newDocId = `${Math.floor(1000 + Math.random() * 9000)}`;
    const isJd = addForm.type === 'Job Description';
    const category = isJd ? 'job-description' : 'employment-contract';

    const newEntry = {
      id: `ONB-DOC-${newDocId}`,
      onboardingDocId: newDocId,
      documentTitle: addForm.title,
      category,
      documentType: addForm.type,
      author: actor.displayName || 'Ethan Collins',
      submissionDate: today(),
      dateCreated: today(),
      effectivityDate: addForm.effectivityDate,
      status: 'Pending',
      submissionType: addForm.submissionType,
      attachments: [{ name: `${addForm.title}.pdf`, size: '1.7MB' }],
      content: {
        jobTitle: addForm.jobTitle,
        aboutCompany: addForm.aboutCompany,
        jobSummary: addForm.jobSummary,
        keyResponsibilities: addForm.responsibilities.split('\n').filter(Boolean),
      },
      remarks: '',
      actionedBy: '',
    };

    setData(current => ({
      ...current,
      onboardingDocuments: [newEntry, ...(current.onboardingDocuments || [])],
    }));

    onNotify('Onboarding document added successfully!');
    setAddingDoc(false);
  }

  function exportRows(format) {
    const headers = ['Submission Date', 'Onboarding Document ID', 'Document Title', 'Author', 'Date Created', 'Status', 'Effectivity Date'];
    const rows = filtered.map(row => [row.submissionDate, row.onboardingDocId, row.documentTitle, row.author, row.dateCreated, row.status, row.effectivityDate]);
    downloadFile(`onboarding-documents-${subTab}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Onboarding documents exported to ${format}.`);
  }

  const ONBOARDING_STATUS_TABS = ['All Documents', 'Pending', 'Approved', 'Rejected'];

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[
      { label: 'Employee Requests Management', onClick: onBack },
      { label: 'Employee Onboarding Documents' },
    ]} />
    <PageHeading title="Employee Onboarding Documents" />

    {/* Sub-tabs for Job Description vs Employment Contracts */}
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      <button
        type="button"
        className={`hrm-btn ${subTab === 'job-description' ? 'primary' : 'outline'}`}
        style={{ padding: '6px 18px', borderRadius: 6, fontWeight: 600, fontSize: 12 }}
        onClick={() => { setSubTab('job-description'); setSelectedKeys(new Set()); table.setPage(1); }}
      >
        Job Description
      </button>
      <button
        type="button"
        className={`hrm-btn ${subTab === 'employment-contract' ? 'primary' : 'outline'}`}
        style={{ padding: '6px 18px', borderRadius: 6, fontWeight: 600, fontSize: 12 }}
        onClick={() => { setSubTab('employment-contract'); setSelectedKeys(new Set()); table.setPage(1); }}
      >
        Employment Contracts
      </button>
    </div>

    {selectedKeys.size > 0 && (
      <BulkSelectionBar
        selectedCount={selectedKeys.size}
        onApprove={() => setBulkApproving(true)}
        onReject={() => setBulkRejecting(true)}
      />
    )}

    <StatusTabs tabs={ONBOARDING_STATUS_TABS} value={statusTab === 'All' ? 'All Documents' : statusTab} onChange={value => { setStatusTab(value === 'All Documents' ? 'All' : value); table.setPage(1); }} />

    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <ExportMenu onExport={exportRows} disabled={filtered.length === 0} />
        <button
          type="button"
          className="hrm-btn primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => {
            setAddForm({
              title: `${subTab === 'job-description' ? 'Job-Description' : 'Employment-Contract'}-${Math.floor(10 + Math.random() * 90)}-2025`,
              type: subTab === 'job-description' ? 'Job Description' : 'Employment Contract',
              submissionType: 'System Content',
              effectivityDate: today(),
              jobTitle: 'Senior Software Developer',
              aboutCompany: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
              jobSummary: 'Lead development of enterprise HRM workflows and architecture.',
              responsibilities: 'Develop high quality scalable modules\nConduct peer reviews and testing',
              files: [],
            });
            setAddingDoc(true);
          }}
        >
          + Add
        </button>
      </div>
    </div>

    <DataTable
      columns={columns}
      rows={pageRows}
      total={filtered.length}
      rowKey={row => row.id}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No onboarding document records found."
      selectedKeys={selectedKeys}
      onSelectRow={toggleRow}
      onSelectAll={toggleAll}
      renderCell={(row, column) => {
        if (column.key === 'documentTitle') {
          return (
            <button
              type="button"
              className="hrm-link-inline"
              style={{ fontWeight: 600, textAlign: 'left', color: 'var(--violet)' }}
              onClick={() => setViewing(row)}
            >
              {row.documentTitle}
            </button>
          );
        }
        return formatCell(row[column.key], column.type);
      }}
      actions={row => [
        { kind: 'view', label: 'View', onSelect: () => setViewing(row) },
        ...(row.status === 'Pending' ? [
          { kind: 'edit', label: 'Approve', onSelect: () => startDecision(row, 'Approve') },
          { kind: 'cancel', label: 'Reject', onSelect: () => startDecision(row, 'Reject') },
        ] : []),
        ...(row.status === 'Approved' ? [
          { kind: 'edit', label: 'Undo Approval', onSelect: () => startDecision(row, 'Undo') },
        ] : []),
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'submissionDate', label: 'Submission Date', type: 'date' },
        { key: 'onboardingDocId', label: 'Onboarding Document ID' },
        { key: 'author', label: 'Author', options: [...new Set(docs.map(row => row.author))] },
        { key: 'dateCreated', label: 'Date Created', type: 'date' },
        { key: 'submissionType', label: 'Submission Type', options: ['File Upload', 'System Content'] },
        { key: 'status', label: 'Status', options: ['Pending', 'Approved', 'Rejected'] },
        { key: 'effectivityDate', label: 'Effectivity Date', type: 'date' },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {/* ---------------- 2-Step Decision Modals (Single Row) ---------------- */}
    {decision && decision.step === 1 && (
      <Modal
        title={`${decision.action === 'Undo' ? 'Undo Approval' : decision.action === 'Approve' ? 'Approve Request' : 'Reject Request'}`}
        width="md"
        onClose={() => setDecision(null)}
        footer={<>
          <GhostButton onClick={() => setDecision(null)}>Cancel</GhostButton>
          <PrimaryButton onClick={proceedToStep2}>Continue</PrimaryButton>
        </>}
      >
        <Field label="Remarks">
          <textarea
            rows={4}
            value={decisionRemarks}
            onChange={e => setDecisionRemarks(e.target.value)}
            placeholder="Input additional notes"
          />
        </Field>
      </Modal>
    )}

    {decision && decision.step === 2 && (
      <Modal
        title={`${decision.action === 'Undo' ? 'Undo Approval' : decision.action === 'Approve' ? 'Approve Request' : 'Reject Request'}`}
        width="lg"
        onClose={() => setDecision(null)}
        footer={<>
          <GhostButton onClick={() => setDecision(null)}>Cancel</GhostButton>
          <button
            type="button"
            className={`hrm-btn ${decision.action === 'Approve' ? 'success' : decision.action === 'Reject' ? 'danger' : 'primary'}`}
            style={{ padding: '6px 18px', fontWeight: 600 }}
            onClick={commitDecision}
          >
            {decision.action === 'Approve' ? 'Approve' : decision.action === 'Reject' ? 'Reject' : 'Undo'}
          </button>
        </>}
      >
        <p style={{ marginBottom: 14, fontSize: 12 }}>
          You are about to <strong style={{ color: decision.action === 'Approve' ? '#166534' : decision.action === 'Reject' ? '#b91c1c' : 'inherit' }}>{decision.action.toLowerCase()}</strong> this request:
        </p>

        <div className="hrm-form-grid" style={{ marginBottom: 16 }}>
          <Field label="Onboarding Document ID"><input value={decision.doc.onboardingDocId} readOnly disabled /></Field>
          <Field label="Document Type"><input value={decision.doc.documentType} readOnly disabled /></Field>
          <Field label="Author"><input value={decision.doc.author} readOnly disabled /></Field>
          <Field label="Effectivity Date"><input value={formatDate(decision.doc.effectivityDate)} readOnly disabled /></Field>
        </div>

        {decision.doc.content && decision.doc.submissionType === 'System Content' ? (
          <div style={{ marginBottom: 16 }}>
            <p className="hrm-form-label" style={{ marginBottom: 6 }}>Content</p>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '14px 16px', fontSize: 11 }}>
              <h3 style={{ textAlign: 'center', fontSize: 13, marginBottom: 10 }}>{decision.doc.content.jobTitle}</h3>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>About The Company</p>
              <p style={{ color: '#475569', marginBottom: 10 }}>{decision.doc.content.aboutCompany}</p>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>Job Summary</p>
              <p style={{ color: '#475569', marginBottom: 10 }}>{decision.doc.content.jobSummary}</p>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>Key Responsibilities</p>
              <ul style={{ paddingLeft: 18, color: '#475569', margin: 0 }}>
                {(decision.doc.content.keyResponsibilities || []).map((resp, i) => <li key={i}>{resp}</li>)}
              </ul>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <p className="hrm-form-label" style={{ marginBottom: 6 }}>Attachments</p>
            <div className="hrm-file-pill" style={{ display: 'inline-flex', padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              <FileText size={16} />
              <span>{decision.doc.attachments?.[0]?.name || 'Job-Description-1-2025.pdf'}</span>
              <span className="hrm-file-size">(1.7MB)</span>
            </div>
          </div>
        )}

        <Field label="Remarks">
          <input value={decisionRemarks || 'Lorem ipsum dolor sit amet.'} readOnly disabled />
        </Field>

        <p style={{ marginTop: 16, fontSize: 11, color: '#64748b' }}>Do you want to continue with the action?</p>
      </Modal>
    )}

    {/* ---------------- Bulk Modals ---------------- */}
    {bulkApproving && <Modal
      title="Approve Request"
      width="md"
      onClose={() => setBulkApproving(false)}
      footer={<>
        <GhostButton onClick={() => setBulkApproving(false)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn success" onClick={() => handleBulkDecision('Approved')}>
          <CheckCircle size={15} weight="bold" /> Approve ({selectedKeys.size})
        </button>
      </>}
    >
      <p style={{ marginBottom: 16 }}>Are you sure you want to approve the <strong>{selectedKeys.size}</strong> selected onboarding documents?</p>
      <Field label="Remarks">
        <textarea rows={3} value={bulkRemarks} onChange={e => setBulkRemarks(e.target.value)} placeholder="Input additional notes" />
      </Field>
    </Modal>}

    {bulkRejecting && <Modal
      title="Reject Request"
      width="md"
      onClose={() => setBulkRejecting(false)}
      footer={<>
        <GhostButton onClick={() => setBulkRejecting(false)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn danger" onClick={() => handleBulkDecision('Rejected')}>
          Reject ({selectedKeys.size})
        </button>
      </>}
    >
      <p style={{ marginBottom: 16 }}>Are you sure you want to reject the <strong>{selectedKeys.size}</strong> selected onboarding documents?</p>
      <Field label="Remarks">
        <textarea rows={3} value={bulkRemarks} onChange={e => setBulkRemarks(e.target.value)} placeholder="Input additional notes" />
      </Field>
    </Modal>}

    {/* ---------------- Document Detail Inspection View ---------------- */}
    {viewing && <Modal
      title={viewing.documentTitle}
      width="lg"
      onClose={() => setViewing(null)}
      footer={<>
        <GhostButton onClick={() => setViewing(null)}>Close</GhostButton>
        {viewing.status === 'Pending' && <>
          <button type="button" className="hrm-btn danger" onClick={() => startDecision(viewing, 'Reject')}>Reject</button>
          <button type="button" className="hrm-btn success" onClick={() => startDecision(viewing, 'Approve')}>Approve</button>
        </>}
      </>}
    >
      <div className="hrm-form-grid" style={{ marginBottom: 16 }}>
        <Field label="Onboarding Document ID"><input value={viewing.onboardingDocId} readOnly disabled /></Field>
        <Field label="Document Type"><input value={viewing.documentType} readOnly disabled /></Field>
        <Field label="Author"><input value={viewing.author} readOnly disabled /></Field>
        <Field label="Date Created"><input value={formatDate(viewing.dateCreated)} readOnly disabled /></Field>
        <Field label="Status"><span style={{ display: 'inline-block', marginTop: 6 }}><StatusText status={viewing.status} /></span></Field>
        <Field label="Effectivity Date"><input value={formatDate(viewing.effectivityDate)} readOnly disabled /></Field>
      </div>

      {viewing.content && viewing.submissionType === 'System Content' ? (
        <div style={{ marginBottom: 16 }}>
          <p className="hrm-form-label" style={{ marginBottom: 6 }}>Content</p>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '16px 20px', fontSize: 11 }}>
            <h3 style={{ textAlign: 'center', fontSize: 13, marginBottom: 12 }}>{viewing.content.jobTitle}</h3>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>About The Company</p>
            <p style={{ color: '#475569', marginBottom: 12 }}>{viewing.content.aboutCompany}</p>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>Job Summary</p>
            <p style={{ color: '#475569', marginBottom: 12 }}>{viewing.content.jobSummary}</p>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>Key Responsibilities</p>
            <ul style={{ paddingLeft: 18, color: '#475569', margin: 0 }}>
              {(viewing.content.keyResponsibilities || []).map((resp, i) => <li key={i}>{resp}</li>)}
            </ul>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <p className="hrm-form-label" style={{ marginBottom: 6 }}>Attachments</p>
          <div className="hrm-file-pill" style={{ display: 'inline-flex', padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
            <FileText size={16} />
            <span>{viewing.attachments?.[0]?.name || 'Job-Description-1-2025.pdf'}</span>
            <button
              type="button"
              className="hrm-link-inline"
              onClick={() => setPreviewDoc({ fileName: viewing.attachments?.[0]?.name || 'Job-Description-1-2025.pdf', title: viewing.documentTitle })}
            >
              Preview
            </button>
            <span className="hrm-file-size">(1.7MB)</span>
          </div>
        </div>
      )}
    </Modal>}

    {/* ---------------- + Add Document Modal ---------------- */}
    {addingDoc && <Modal
      title="Add Onboarding Document"
      width="lg"
      onClose={() => setAddingDoc(false)}
      footer={<>
        <GhostButton onClick={() => setAddingDoc(false)}>Cancel</GhostButton>
        <PrimaryButton onClick={handleSaveAddDoc}>Add Document</PrimaryButton>
      </>}
    >
      <fieldset className="hrm-radio-group" style={{ marginBottom: 16 }}>
        <legend>Submission Mode <em aria-hidden="true">*</em></legend>
        <div>
          <label className="hrm-radio">
            <input type="radio" name="submissionMode" value="System Content" checked={addForm.submissionType === 'System Content'} onChange={() => setAddForm(f => ({ ...f, submissionType: 'System Content' }))} />
            <span>System Content Form</span>
          </label>
          <label className="hrm-radio">
            <input type="radio" name="submissionMode" value="File Upload" checked={addForm.submissionType === 'File Upload'} onChange={() => setAddForm(f => ({ ...f, submissionType: 'File Upload' }))} />
            <span>File Upload</span>
          </label>
        </div>
      </fieldset>

      <div className="hrm-form-grid" style={{ marginBottom: 16 }}>
        <Field label="Document Title" required>
          <input value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Job-Description-11-2025" />
        </Field>
        <Field label="Document Type" required>
          <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}>
            <option value="Job Description">Job Description</option>
            <option value="Employment Contract">Employment Contract</option>
          </select>
        </Field>
        <Field label="Effectivity Date" required>
          <input type="date" value={addForm.effectivityDate} onChange={e => setAddForm(f => ({ ...f, effectivityDate: e.target.value }))} />
        </Field>
      </div>

      {addForm.submissionType === 'System Content' ? (
        <div className="hrm-form-grid">
          <div className="hrm-form-cell span-2">
            <Field label="Job Title" required>
              <input value={addForm.jobTitle} onChange={e => setAddForm(f => ({ ...f, jobTitle: e.target.value }))} />
            </Field>
          </div>
          <div className="hrm-form-cell span-2">
            <Field label="About The Company">
              <textarea rows={2} value={addForm.aboutCompany} onChange={e => setAddForm(f => ({ ...f, aboutCompany: e.target.value }))} />
            </Field>
          </div>
          <div className="hrm-form-cell span-2">
            <Field label="Job Summary">
              <textarea rows={2} value={addForm.jobSummary} onChange={e => setAddForm(f => ({ ...f, jobSummary: e.target.value }))} />
            </Field>
          </div>
          <div className="hrm-form-cell span-2">
            <Field label="Key Responsibilities (One per line)">
              <textarea rows={3} value={addForm.responsibilities} onChange={e => setAddForm(f => ({ ...f, responsibilities: e.target.value }))} />
            </Field>
          </div>
        </div>
      ) : (
        <Field label="Upload Document" required hint="Supports .pdf and .docx files. Maximum file size 5MB.">
          <UploadArea
            files={addForm.files}
            onAdd={files => setAddForm(f => ({ ...f, files }))}
            onRemove={() => setAddForm(f => ({ ...f, files: [] }))}
            hint="Supports .pdf and .docx files. Maximum file size 5MB."
          />
        </Field>
      )}
    </Modal>}

    {previewDoc && <DocumentViewerModal fileName={previewDoc.fileName} title={previewDoc.title || 'Onboarding Document Preview'} onClose={() => setPreviewDoc(null)} />}
  </div>;
}

/* -------------------------------------------------------------- dispatcher */

export function ManagementScreen(props) {
  const screen = managementScreenByKey(props.screenKey);
  if (!screen) return null;
  if (screen.kind === 'request') return <RequestApprovalScreen {...props} screen={screen} />;
  if (screen.kind === 'shift-assignment') return <ShiftAssignmentScreen {...props} screen={screen} />;
  if (screen.kind.startsWith('reimbursement')) return <ReimbursementScreen {...props} screen={screen} />;
  if (screen.kind.startsWith('cash-advance')) return <CashAdvanceScreen {...props} screen={screen} />;
  if (screen.kind.startsWith('liquidation')) return <LiquidationScreen {...props} screen={screen} />;
  if (screen.kind.startsWith('company-loan')) return <CompanyLoanScreen {...props} screen={screen} />;
  if (screen.kind.startsWith('government-loan')) return <GovernmentLoanScreen {...props} screen={screen} />;
  if (screen.kind === 'resignation-approval' || screen.kind === 'resignation-management') return <ResignationScreen {...props} screen={screen} />;
  if (screen.kind === 'coe-approval' || screen.kind === 'coe-management') return <CoeScreen {...props} screen={screen} />;
  if (screen.kind === 'onboarding-documents-approval') return <OnboardingDocumentsApprovalScreen {...props} screen={screen} />;
  if (screen.kind === 'team-validation') return <TeamValidationScreen {...props} screen={screen} />;
  if (screen.kind === 'wellness-approval') return <WellnessApprovalScreen {...props} screen={screen} />;
  return <EmptyState title={`${screen.title} is not available`}>This screen has no implementation registered.</EmptyState>;
}
