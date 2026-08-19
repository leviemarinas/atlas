/**
 * Shift Schedule Tracking and Monitoring (BRD HT259).
 *
 * This is the monitoring view, not an assignment workflow — Assign Subordinate
 * in HRM's Management & Approvals still owns creating and editing an
 * assignment.  Here an administrator watches which schedule each employee is
 * on over a chosen period, so the row actions are View and Export only.
 *
 * The rows are the `shiftAssignments` the HRM module already stores; nothing
 * is duplicated.  An assignment appears when its own effectivity window
 * overlaps the period on screen, and its Upcoming / Active / Expired status
 * comes from `shiftAssignmentStatus` — the same helper the assignment register
 * uses, so the two screens can never disagree about a schedule.
 */

import { useMemo, useState } from 'react';
import {
  DataTable,
  DetailList,
  ExportMenu,
  GhostButton,
  Modal,
  PageHeading,
  SearchInput,
  SegmentedTabs,
  formatCell,
  formatDate,
  paginate,
  useTableState,
} from './HRMKit.jsx';
import { downloadFile } from './fileDownload.js';
import { SHIFT_SCHEDULE_CATALOG, shiftAssignmentStatus } from './hrmData.js';

const toCsv = (headers, rows) => [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

const ALL = 'All';

/** The period the monitor covers. Each view resolves to one date window. */
const PERIOD_VIEWS = Object.freeze(['Date Range', 'Per Week', 'Monthly']);

const SHIFT_TYPES = Object.freeze([ALL, ...new Set(SHIFT_SCHEDULE_CATALOG.map(schedule => schedule.shiftType))]);

const STATUS_TABS = Object.freeze(['All', 'Active', 'Upcoming', 'Expired']);

/**
 * Local calendar date as ISO.  `toISOString` would convert local midnight to
 * UTC and hand back the previous day everywhere east of Greenwich, which put
 * the monthly window on 30 April - 30 May instead of 1 - 31 May in Manila.
 */
const isoOf = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** The window a view resolves to, anchored on the chosen date. */
function periodWindow(view, anchor, from, to) {
  if (view === 'Date Range') return { from, to };
  const base = anchor ? new Date(`${anchor}T00:00:00`) : new Date();
  if (view === 'Per Week') {
    const start = new Date(base);
    start.setDate(base.getDate() - base.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: isoOf(start), to: isoOf(end) };
  }
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { from: isoOf(start), to: isoOf(end) };
}

/** An assignment counts when its own effectivity overlaps the window. */
function overlapsPeriod(assignment, from, to) {
  const start = assignment.startDate || '';
  const end = assignment.endDate || '';
  if (to && start && start > to) return false;
  if (from && end && end < from) return false;
  return true;
}

export function ShiftScheduleScreen({ data, user, access, employees, teamEmployeeIds, onNotify }) {
  const isApprover = access.canApproveTeamRequests;
  const table = useTableState();
  const [view, setView] = useState('Date Range');
  const [anchor, setAnchor] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [shiftType, setShiftType] = useState(ALL);
  const [department, setDepartment] = useState(ALL);
  const [statusTab, setStatusTab] = useState('All');
  const [viewing, setViewing] = useState(null);

  const departments = useMemo(() => [ALL, ...new Set(employees.map(employee => employee.department).filter(Boolean))], [employees]);
  const period = periodWindow(view, anchor, dateFrom, dateTo);

  const rows = useMemo(() => {
    const byId = new Map(employees.map(employee => [employee.employeeId, employee]));
    const visible = isApprover ? teamEmployeeIds : [user.employeeId];
    const allowed = new Set(visible);
    return (data.shiftAssignments || [])
      .filter(assignment => allowed.has(assignment.employeeId))
      .filter(assignment => overlapsPeriod(assignment, period.from, period.to))
      .map(assignment => {
        const employee = byId.get(assignment.employeeId);
        return {
          ...assignment,
          key: assignment.assignmentId,
          employeeCode: employee?.employeeCode || '',
          name: employee?.name || '',
          department: employee?.department || '',
          dayRange: `${assignment.shiftDaysPerWeek} days/week · Rest: ${assignment.restDays}`,
          effectivity: `${formatDate(assignment.startDate)} — ${assignment.endDate ? formatDate(assignment.endDate) : 'Open-ended'}`,
          status: shiftAssignmentStatus(assignment),
        };
      })
      .filter(row => (shiftType === ALL || row.shiftType === shiftType))
      .filter(row => (department === ALL || row.department === department))
      .filter(row => (statusTab === 'All' || row.status === statusTab))
      .filter(row => {
        const term = table.search.trim().toLowerCase();
        if (!term) return true;
        return ['employeeCode', 'name', 'department', 'shiftName', 'shiftType', 'timezone'].some(key => String(row[key] ?? '').toLowerCase().includes(term));
      })
      .sort((left, right) => (left.name === right.name ? (left.startDate < right.startDate ? 1 : -1) : left.name < right.name ? -1 : 1));
  }, [data.shiftAssignments, employees, teamEmployeeIds, isApprover, user.employeeId, period.from, period.to, shiftType, department, statusTab, table.search]);

  const pageRows = paginate(rows, table.page, table.pageSize);

  const counts = useMemo(() => ({
    Active: rows.filter(row => row.status === 'Active').length,
    Upcoming: rows.filter(row => row.status === 'Upcoming').length,
    Expired: rows.filter(row => row.status === 'Expired').length,
  }), [rows]);

  const columns = [
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'name', label: 'Employee Name' },
    { key: 'department', label: 'Department' },
    { key: 'shiftScheduleCode', label: 'Shift Code' },
    { key: 'shiftType', label: 'Type of Shift' },
    { key: 'shiftHours', label: 'Time Range' },
    { key: 'dayRange', label: 'Day Range' },
    { key: 'timezone', label: 'Timezone' },
    { key: 'effectivity', label: 'Effectivity' },
    { key: 'status', label: 'Status' },
  ];

  function exportRows(format) {
    downloadFile(
      `shift-schedule-monitoring.${format === 'PDF' ? 'txt' : 'csv'}`,
      toCsv(columns.map(column => column.label), rows.map(row => columns.map(column => row[column.key]))),
    );
    onNotify(`Shift schedule monitoring exported to ${format}.`);
  }

  return <div className="hrm-workspace tk-screen">
    <PageHeading
      title="Shift Schedule Tracking and Monitoring"
      eyebrow={`${rows.length} ${rows.length === 1 ? 'schedule' : 'schedules'} in view · ${counts.Active} active, ${counts.Upcoming} upcoming, ${counts.Expired} expired`}
    />

    <div className="tk-view-strip">
      <span>View:</span>
      <select value={view} onChange={event => { setView(event.target.value); table.setPage(1); }} aria-label="Period view">
        {PERIOD_VIEWS.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
      {view === 'Date Range'
        ? <>
            <input type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); table.setPage(1); }} aria-label="Period from" />
            <span>to</span>
            <input type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); table.setPage(1); }} aria-label="Period to" />
          </>
        : <>
            <span>Anchor date</span>
            <input type="date" value={anchor} onChange={event => { setAnchor(event.target.value); table.setPage(1); }} aria-label="Anchor date" />
            <span className="tk-period-hint">{formatDate(period.from)} — {formatDate(period.to)}</span>
          </>}
    </div>

    <SegmentedTabs tabs={STATUS_TABS} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} ariaLabel="Shift status" />

    <div className="hrm-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
      <div className="hrm-toolbar-left" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchInput value={table.search} onChange={table.setSearch} />
        <label className="tk-report-filter">
          <span>Type of shift</span>
          <select value={shiftType} onChange={event => { setShiftType(event.target.value); table.setPage(1); }}>
            {SHIFT_TYPES.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        {isApprover && <label className="tk-report-filter">
          <span>Department</span>
          <select value={department} onChange={event => { setDepartment(event.target.value); table.setPage(1); }}>
            {departments.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>}
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu onExport={exportRows} disabled={rows.length === 0} />
      </div>
    </div>

    <DataTable
      columns={columns}
      rows={pageRows}
      total={rows.length}
      rowKey={row => row.key}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No shift schedules fall inside this period."
      renderCell={(row, column) => {
        if (column.key === 'status') return <span className={`tk-shift-status ${row.status.toLowerCase()}`}>{row.status}</span>;
        return formatCell(row[column.key], column.type);
      }}
      actions={row => [{ label: 'View', kind: 'view', onSelect: () => setViewing(row) }]}
    />

    {viewing && <Modal
      title="Shift Schedule Details"
      onClose={() => setViewing(null)}
      footer={<GhostButton onClick={() => setViewing(null)}>Close</GhostButton>}
    >
      <DetailList groups={[
        { pair: [{ label: 'Employee', value: `${viewing.name} (${viewing.employeeCode})` }, { label: 'Department', value: viewing.department }] },
        { pair: [{ label: 'Shift Code', value: viewing.shiftScheduleCode }, { label: 'Type of Shift', value: viewing.shiftType }] },
        { label: 'Shift Name', value: viewing.shiftName },
        { pair: [{ label: 'Time Range', value: viewing.shiftHours }, { label: 'Timezone', value: viewing.timezone }] },
        { pair: [{ label: 'Work Hours', value: `${viewing.workHours} hours` }, { label: 'Days Per Week', value: String(viewing.shiftDaysPerWeek) }] },
        { label: 'Rest Days', value: viewing.restDays },
        { pair: [{ label: 'Effectivity', value: viewing.effectivity }, { label: 'Status', value: viewing.status }] },
        { pair: [{ label: 'Grace Period', value: `${viewing.gracePeriod} ${viewing.gracePeriodUnit} (${viewing.gracePeriodCondition})` }, { label: 'Auto-deduct Break', value: viewing.autoDeductBreak }] },
        { pair: [{ label: 'Flexible Time', value: viewing.flexibleTime }, { label: 'Repeat Shift', value: viewing.repeatShift }] },
      ]} />
    </Modal>}
  </div>;
}
