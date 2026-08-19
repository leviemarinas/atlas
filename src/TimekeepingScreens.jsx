/**
 * Timekeeping screens (P&A Timekeeping Module Part 1).
 *
 * Every screen is one component here and `TimekeepingWorkspace` dispatches the
 * tile the portal opened.  The employee and the approver see the same screen —
 * the approver simply gets the roster, the "View Personal Records" toggle and
 * the drill-down the masterfile shows, decided by `access.canApproveTeamRequests`
 * rather than by a second copy of the screen.
 */

import { useEffect, useMemo, useState } from 'react';
import { LockSimple, MapPin, Path } from '@phosphor-icons/react';
import {
  BarChart,
  Breadcrumbs,
  DataTable,
  EmployeeBanner,
  EmptyState,
  ExportMenu,
  Field,
  FilterButton,
  FilterDrawer,
  GhostButton,
  Modal,
  PageHeading,
  PrimaryButton,
  SearchInput,
  SegmentedTabs,
  StatusText,
  formatCell,
  formatDate,
  paginate,
  useTableState,
} from './HRMKit.jsx';
import { downloadFile } from './fileDownload.js';
import { createHrmId, findEmployee } from './hrmData.js';
import { ShiftScheduleScreen } from './TimekeepingShiftSchedule.jsx';
import { TimekeepingReportsScreen } from './TimekeepingReportsScreen.jsx';
import {
  TK_DISPUTE_TYPES,
  TK_GRANULARITIES,
  TK_HOUR_TYPES,
  TK_LEAVE_TYPES,
  TK_MISSING_LOG_STATUS,
  TK_MISSING_LOG_TYPES,
  TK_OT_TYPES,
  TK_SERIES_COLORS,
  TK_TEAMS,
  TK_TOOLS,
  TK_WORK_LOCATIONS,
  absenceRows,
  attendanceKpis,
  chargeCodeSummaryRows,
  costAllocationRows,
  hoursToClock,
  leaveBalanceRows,
  logsFor,
  logsForMany,
  otEarningRows,
  overtimeRows,
  peso,
  tardinessKpis,
  tardinessRows,
  teamAttendanceKpis,
  toClockSeconds,
  workHoursSeries,
  workHoursSummary,
  ytdAbsences,
  ytdHoursWorked,
  ytdLeaves,
  ytdOvertime,
  ytdTardiness,
} from './timekeepingData.js';

const toCsv = (headers, rows) => [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

const today = () => new Date().toISOString().slice(0, 10);

/* -------------------------------------------------------------- small parts */

/** KPI card strip. The values are always passed in already derived. */
function KpiRow({ items = [] }) {
  return <div className="tk-kpi-row">
    {items.map(item => <div key={item.label} className="tk-kpi-card">
      <span>{item.label}</span>
      <strong className={item.tone ? `tone-${item.tone}` : ''}>{item.value}</strong>
    </div>)}
  </div>;
}

function PersonalToggle({ checked, onChange, label = 'View Personal Records' }) {
  return <label className="hrm-toggle">
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    <span className="hrm-toggle-track"><span className="hrm-toggle-thumb" /></span>
    <span>{label}</span>
  </label>;
}

/** Search + filter on the left, whatever the screen owns on the right. */
function TkToolbar({ table, onFilter, children }) {
  return <div className="hrm-toolbar">
    <div className="hrm-toolbar-left">
      <SearchInput value={table.search} onChange={table.setSearch} />
      <FilterButton onClick={onFilter} active={Object.values(table.filters).some(Boolean)} />
    </div>
    <div className="hrm-toolbar-right">{children}</div>
  </div>;
}

/** Free-text + option matching shared by every list on this module. */
function matches(row, table, searchKeys) {
  const term = table.search.trim().toLowerCase();
  if (term && !searchKeys.some(key => String(row[key] ?? '').toLowerCase().includes(term))) return false;
  return Object.entries(table.filters).every(([key, value]) => {
    if (!value) return true;
    return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
  });
}

/**
 * Rows the screen should show: the whole visible team, or only the signed-in
 * user's when the personal toggle is on (or the user has no team at all).
 */
function scopeRows(rows, { access, user, viewPersonal, selectedEmployeeId }) {
  if (selectedEmployeeId) return rows.filter(row => row.employeeId === selectedEmployeeId);
  if (!access.canApproveTeamRequests || viewPersonal) return rows.filter(row => row.employeeId === user.employeeId);
  return rows;
}

function employeeColumns(employees) {
  const byId = new Map(employees.map(employee => [employee.employeeId, employee]));
  return {
    byId,
    decorate: row => {
      const employee = byId.get(row.employeeId);
      return {
        ...row,
        employeeCode: employee?.employeeCode || '',
        name: employee?.name || '',
        position: employee?.position || '',
        department: employee?.department || '',
        division: employee?.department ? 'Product Development' : '',
      };
    },
  };
}

/* ------------------------------------------------------- 1. Time In/Time Out */

function TimeInOutScreen({ data, setData, user, access, employees, teamEmployeeIds, onNotify }) {
  const [tab, setTab] = useState('my-logs');
  const settings = data.timekeeping || {};
  const tabs = access.canApproveTeamRequests
    ? [{ key: 'my-logs', label: 'My Time Logs' }, { key: 'team-logs', label: 'Team Attendance Logs' }, { key: 'missing-logs', label: 'Missing Logs' }]
    : [];

  return <div className="hrm-workspace tk-screen">
    <PageHeading title="Time In/Time Out" />
    {tabs.length > 0 && <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Time logs" />}
    {(!tabs.length || tab === 'my-logs') && <MyTimeLogsPanel data={data} setData={setData} user={user} settings={settings} onNotify={onNotify} />}
    {tab === 'team-logs' && <TeamAttendanceLogsPanel data={data} user={user} access={access} employees={employees} teamEmployeeIds={teamEmployeeIds} onNotify={onNotify} />}
    {tab === 'missing-logs' && <MissingLogsPanel data={data} setData={setData} employees={employees} onNotify={onNotify} />}
  </div>;
}

function MyTimeLogsPanel({ data, setData, user, settings, onNotify }) {
  const table = useTableState(5);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [session, setSession] = useState({ punchedInAt: null, breakStartedAt: null });

  // One interval drives both running clocks; the displayed value is always
  // recomputed from the start timestamp so it cannot drift from the record.
  useEffect(() => {
    if (!session.punchedInAt && !session.breakStartedAt) return undefined;
    const id = window.setInterval(() => setTick(value => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [session.punchedInAt, session.breakStartedAt]);

  const elapsed = startedAt => (startedAt ? toClockSeconds((Date.now() - startedAt) / 3600000) : '00:00:00');
  const logs = useMemo(() => logsFor(data, user.employeeId), [data, user.employeeId]);
  const filtered = useMemo(() => logs.filter(row => matches(row, table, ['date', 'tool', 'workLocation', 'status'])), [logs, table.search, table.filters]);
  const pageRows = paginate(filtered, table.page, table.pageSize);

  function upsertTodayLog(patch) {
    const workDate = today();
    setData(current => {
      const rows = current.timeLogs || [];
      const existing = rows.find(row => row.employeeId === user.employeeId && row.date === workDate);
      const base = existing || {
        logId: `TKL-${user.employeeId}-${workDate}`,
        employeeId: user.employeeId,
        date: workDate,
        tool: 'Web',
        workLocation: settings.workLocation || 'Office HQ',
        geotag: settings.geotagging ? 'Liwasang Kalayaan, Marikina, 1810 Metro Manila' : '',
        timeIn: '', timeOut: '', breakIn: '', breakOut: '', breakHours: 0,
        workedHours: 0, overtimeHours: 0, overtimeStatus: '', overtimeType: '',
        tardinessMinutes: 0, undertimeMinutes: 0, leaveType: '', leaveHours: 0, reason: '', status: 'Present',
      };
      const next = { ...base, ...patch };
      return { ...current, timeLogs: existing ? rows.map(row => (row.logId === next.logId ? next : row)) : [next, ...rows] };
    });
  }

  function punchIn() {
    const now = new Date();
    setSession({ punchedInAt: now.getTime(), breakStartedAt: null });
    upsertTodayLog({ timeIn: now.toTimeString().slice(0, 8), status: 'Present' });
    onNotify('Punched in successfully!');
  }

  function punchOut() {
    const now = new Date();
    const workedHours = session.punchedInAt ? (now.getTime() - session.punchedInAt) / 3600000 : 0;
    setSession({ punchedInAt: null, breakStartedAt: null });
    upsertTodayLog({ timeOut: now.toTimeString().slice(0, 8), workedHours: Number(workedHours.toFixed(2)) });
    onNotify('Punched out successfully!');
  }

  function breakIn() {
    const now = new Date();
    setSession(current => ({ ...current, breakStartedAt: now.getTime() }));
    upsertTodayLog({ breakIn: now.toTimeString().slice(0, 8) });
    onNotify('Break started.');
  }

  function breakOut() {
    const now = new Date();
    const breakHours = session.breakStartedAt ? (now.getTime() - session.breakStartedAt) / 3600000 : 0;
    setSession(current => ({ ...current, breakStartedAt: null }));
    upsertTodayLog({ breakOut: now.toTimeString().slice(0, 8), breakHours: Number(breakHours.toFixed(2)) });
    onNotify('Break ended.');
  }

  function exportLogs(format) {
    const headers = ['Date', 'Time In', 'Time Out', 'Duration', 'Break In', 'Break Out', 'Total Break Duration', 'Overtime Hours', 'Tool Used', 'Work Location'];
    downloadFile(`my-time-logs.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, filtered.map(row => [
      formatDate(row.date), row.timeIn, row.timeOut, hoursToClock(row.workedHours), row.breakIn, row.breakOut,
      hoursToClock(row.breakHours), hoursToClock(row.overtimeHours), row.tool, row.workLocation,
    ])));
    onNotify(`Time logs exported to ${format}.`);
  }

  return <>
    <div className="tk-punch-layout">
      <div className="tk-punch-grid">
        <div className={`tk-punch-card ${session.punchedInAt ? 'active' : ''}`}>
          <span>Time Logged In</span>
          <strong>{elapsed(session.punchedInAt)}</strong>
          <button type="button" onClick={session.punchedInAt ? punchOut : punchIn}>{session.punchedInAt ? 'Punch Out' : 'Punch In'}</button>
        </div>
        <div className={`tk-punch-card break ${session.breakStartedAt ? 'active' : ''}`}>
          <span>Break Time In</span>
          <strong>{elapsed(session.breakStartedAt)}</strong>
          <button type="button" disabled={!session.punchedInAt} onClick={session.breakStartedAt ? breakOut : breakIn}>{session.breakStartedAt ? 'Break Out' : 'Punch In'}</button>
        </div>
      </div>
      <aside className="tk-side-panel">
        <dl>
          <dt>Range of Work Hours Start</dt><dd>{settings.workHoursStart}</dd>
          <dt>Range of Work Hours End</dt><dd>{settings.workHoursEnd}</dd>
          <dt>Break Hours Range</dt><dd>{settings.breakHoursRange}</dd>
        </dl>
        <Field label="Set Work Location">
          <select value={settings.workLocation || ''} onChange={event => setData(current => ({ ...current, timekeeping: { ...current.timekeeping, workLocation: event.target.value } }))}>
            {TK_WORK_LOCATIONS.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        {settings.geotagging
          ? <div className="tk-geotag">
              <p className="tk-geotag-head"><MapPin size={14} weight="fill" /> Geotagged Location</p>
              <p className="tk-geotag-value">Logged in at <strong>Liwasang Kalayaan, Marikina, 1810 Metro Manila</strong></p>
              <div className="tk-map" role="img" aria-label="Map of the geotagged punch location"><MapPin size={22} weight="fill" /></div>
            </div>
          : <div className="tk-geotag">
              <p className="tk-geotag-head"><MapPin size={14} weight="fill" /> Pin Location</p>
              <div className="tk-pin-row">
                <input
                  value={settings.pinnedLocation || ''}
                  placeholder="e.g. Manila"
                  aria-label="Pin location"
                  onChange={event => setData(current => ({ ...current, timekeeping: { ...current.timekeeping, pinnedLocation: event.target.value } }))}
                />
              </div>
              <GhostButton onClick={() => onNotify(settings.pinnedLocation ? `Work location pinned to ${settings.pinnedLocation}.` : 'Enter a location to pin.', settings.pinnedLocation ? 'ok' : 'error')}>Set Location</GhostButton>
            </div>}
        <label className="hrm-toggle" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={Boolean(settings.geotagging)}
            onChange={event => setData(current => ({ ...current, timekeeping: { ...current.timekeeping, geotagging: event.target.checked } }))}
          />
          <span className="hrm-toggle-track"><span className="hrm-toggle-thumb" /></span>
          <span>Geotagging</span>
        </label>
      </aside>
    </div>

    <h3 className="hrm-section-title">Summary</h3>
    <TkToolbar table={table} onFilter={() => setDrawerOpen(true)}>
      <PrimaryButton onClick={() => setManualOpen(true)}>Add</PrimaryButton>
      <ExportMenu onExport={exportLogs} disabled={filtered.length === 0} />
    </TkToolbar>

    <DataTable
      columns={[
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'timeIn', label: 'Time In' },
        { key: 'timeOut', label: 'Time Out' },
        { key: 'duration', label: 'Duration' },
        { key: 'breakIn', label: 'Break In' },
        { key: 'breakOut', label: 'Break Out' },
        { key: 'totalBreakDuration', label: 'Total Break Duration' },
        { key: 'overtimeHours', label: 'Overtime Hours' },
        { key: 'tool', label: 'Tool Used' },
        { key: 'workLocation', label: 'Work Location' },
      ]}
      rows={pageRows}
      total={filtered.length}
      rowKey={row => row.logId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No time logs for this filter."
      renderCell={(row, column) => {
        if (column.key === 'duration') return hoursToClock(row.workedHours);
        if (column.key === 'totalBreakDuration') return hoursToClock(row.breakHours);
        if (column.key === 'overtimeHours') return row.overtimeHours ? `${hoursToClock(row.overtimeHours)} (${row.overtimeStatus})` : '—';
        if (column.key === 'workLocation') return <span className="tk-location">{row.workLocation}{row.geotag && <MapPin size={12} weight="fill" />}</span>;
        return formatCell(row[column.key], column.type);
      }}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'timeIn', label: 'Time In' },
        { key: 'timeOut', label: 'Time Out' },
        { key: 'status', label: 'Status', options: ['Present', 'Late', 'Undertime', 'Absent', 'On Leave'] },
        { key: 'tool', label: 'Tool Used', options: [...TK_TOOLS] },
        { key: 'workLocation', label: 'Work Location', options: [...TK_WORK_LOCATIONS] },
      ]}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {manualOpen && <ManualTimeLogModal
      settings={settings}
      onClose={() => setManualOpen(false)}
      onSubmit={entry => {
        setData(current => ({
          ...current,
          timeLogs: [{
            logId: createHrmId('tkl'),
            employeeId: user.employeeId,
            date: entry.date,
            timeIn: entry.timeIn,
            timeOut: entry.timeOut,
            breakIn: entry.breakIn,
            breakOut: entry.breakOut,
            breakHours: 1,
            workedHours: 8,
            overtimeHours: 0,
            overtimeStatus: '',
            overtimeType: '',
            tardinessMinutes: 0,
            undertimeMinutes: 0,
            leaveType: '',
            leaveHours: 0,
            reason: 'Manual entry',
            status: 'Present',
            tool: 'Web',
            workLocation: entry.workLocation,
            geotag: '',
          }, ...(current.timeLogs || [])],
        }));
        setManualOpen(false);
        onNotify('Manual time log added successfully!');
      }}
    />}
  </>;
}

function ManualTimeLogModal({ settings, onClose, onSubmit }) {
  const [form, setForm] = useState({ date: today(), timeIn: '09:00:00', timeOut: '18:00:00', breakIn: '12:00:00', breakOut: '13:00:00', workLocation: settings.workLocation || TK_WORK_LOCATIONS[0] });
  const [errors, setErrors] = useState({});
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  function submit() {
    const next = {};
    ['timeIn', 'timeOut', 'breakIn', 'breakOut'].forEach(key => { if (!form[key]) next[key] = 'Required'; });
    if (!form.date) next.date = 'Required';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit(form);
  }

  return <Modal
    title="Add Manual Time In/Out"
    onClose={onClose}
    footer={<><GhostButton onClick={onClose}>Cancel</GhostButton><button type="button" className="hrm-btn primary" onClick={submit}>Add</button></>}
  >
    <div className="hrm-form-grid">
      <Field label="Date" required error={errors.date}><input type="date" value={form.date} onChange={event => set('date', event.target.value)} /></Field>
      <Field label="Time In" required error={errors.timeIn}><input type="time" step="1" value={form.timeIn} onChange={event => set('timeIn', event.target.value)} /></Field>
      <Field label="Time Out" required error={errors.timeOut}><input type="time" step="1" value={form.timeOut} onChange={event => set('timeOut', event.target.value)} /></Field>
      <Field label="Break In" required error={errors.breakIn}><input type="time" step="1" value={form.breakIn} onChange={event => set('breakIn', event.target.value)} /></Field>
      <Field label="Break Out" required error={errors.breakOut}><input type="time" step="1" value={form.breakOut} onChange={event => set('breakOut', event.target.value)} /></Field>
      <Field label="Work Location">
        <select value={form.workLocation} onChange={event => set('workLocation', event.target.value)}>
          {TK_WORK_LOCATIONS.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </Field>
    </div>
  </Modal>;
}

function TeamAttendanceLogsPanel({ data, user, access, employees, teamEmployeeIds, onNotify }) {
  const table = useTableState(5);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewPersonal, setViewPersonal] = useState(false);

  const logs = useMemo(() => logsForMany(data, teamEmployeeIds), [data, teamEmployeeIds]);
  const kpis = useMemo(() => teamAttendanceKpis(logs, teamEmployeeIds), [logs, teamEmployeeIds]);
  const { decorate } = employeeColumns(employees);

  const rows = useMemo(() => {
    const day = kpis.onDate;
    const scoped = scopeRows(logs.filter(row => row.date === day), { access, user, viewPersonal });
    return scoped.map(decorate).filter(row => matches(row, table, ['employeeCode', 'name', 'department', 'date']));
  }, [logs, kpis.onDate, access, user, viewPersonal, table.search, table.filters]);
  const pageRows = paginate(rows, table.page, table.pageSize);

  function exportRows(format) {
    const headers = ['Employee Code', 'Employee Full Name', 'Department/Division', 'Date', 'Time In', 'Time Out', 'Duration', 'Break In'];
    downloadFile(`team-attendance-logs.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows.map(row => [row.employeeCode, row.name, row.department, formatDate(row.date), row.timeIn, row.timeOut, hoursToClock(row.workedHours), row.breakIn])));
    onNotify(`Team attendance logs exported to ${format}.`);
  }

  return <>
    <KpiRow items={[
      { label: 'Total Team Members', value: kpis.totalTeamMembers },
      { label: 'Total Present Today', value: kpis.totalPresentToday },
      { label: 'Total Absent Today', value: kpis.totalAbsentToday },
      { label: 'Total of On-Leave Today', value: kpis.totalOnLeaveToday },
    ]} />
    <TkToolbar table={table} onFilter={() => setDrawerOpen(true)}>
      <PersonalToggle checked={viewPersonal} onChange={setViewPersonal} />
      <ExportMenu onExport={exportRows} disabled={rows.length === 0} />
    </TkToolbar>
    <DataTable
      columns={[
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'name', label: 'Employee Full Name' },
        { key: 'department', label: 'Department/Division' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'timeIn', label: 'Time In' },
        { key: 'timeOut', label: 'Time Out' },
        { key: 'duration', label: 'Duration' },
        { key: 'breakIn', label: 'Break In' },
      ]}
      rows={pageRows}
      total={rows.length}
      rowKey={row => row.logId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No attendance recorded for this day."
      renderCell={(row, column) => {
        if (column.key === 'employeeCode') return <span className="tk-code-link">{row.employeeCode}</span>;
        if (column.key === 'duration') return hoursToClock(row.workedHours);
        return formatCell(row[column.key], column.type);
      }}
    />
    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'department', label: 'Department/Division' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'tool', label: 'Tool', options: [...TK_TOOLS] },
        { key: 'workLocation', label: 'Work Location', options: [...TK_WORK_LOCATIONS] },
      ]}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </>;
}

function MissingLogsPanel({ data, setData, employees, onNotify }) {
  const table = useTableState(5);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { decorate } = employeeColumns(employees);

  const rows = useMemo(
    () => (data.tkMissingLogs || []).map(decorate).filter(row => matches(row, table, ['employeeCode', 'name', 'department', 'missingLogType', 'status'])),
    [data.tkMissingLogs, table.search, table.filters],
  );
  const pageRows = paginate(rows, table.page, table.pageSize);

  function updateStatus(missingLogId, status, message) {
    setData(current => ({
      ...current,
      tkMissingLogs: (current.tkMissingLogs || []).map(row => (row.missingLogId === missingLogId ? { ...row, status } : row)),
    }));
    onNotify(message);
  }

  function exportRows(format) {
    const headers = ['Employee Code', 'Employee Full Name', 'Department/Division', 'Date', 'Missing Log Type', 'Status', 'Last Recorded Time'];
    downloadFile(`missing-logs.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows.map(row => [row.employeeCode, row.name, row.department, formatDate(row.date), row.missingLogType, row.status, row.lastRecordedTime])));
    onNotify(`Missing logs exported to ${format}.`);
  }

  return <>
    <TkToolbar table={table} onFilter={() => setDrawerOpen(true)}>
      <ExportMenu onExport={exportRows} disabled={rows.length === 0} />
    </TkToolbar>
    <DataTable
      columns={[
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'name', label: 'Employee Full Name' },
        { key: 'department', label: 'Department/Division' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'missingLogType', label: 'Missing Log Type' },
        { key: 'status', label: 'Status' },
        { key: 'lastRecordedTime', label: 'Last Recorded Time' },
      ]}
      rows={pageRows}
      total={rows.length}
      rowKey={row => row.missingLogId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No missing logs."
      renderCell={(row, column) => {
        if (column.key === 'employeeCode') return <span className="tk-code-link">{row.employeeCode}</span>;
        return formatCell(row[column.key], column.type);
      }}
      actions={row => [
        { label: 'Follow-up', kind: 'view', onSelect: () => updateStatus(row.missingLogId, TK_MISSING_LOG_STATUS[1], 'Follow-up sent successfully!') },
        { label: 'Resolve', kind: 'edit', onSelect: () => updateStatus(row.missingLogId, TK_MISSING_LOG_STATUS[2], 'Status updated successfully!') },
      ]}
    />
    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'department', label: 'Department/Division' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'tool', label: 'Tool', options: [...TK_TOOLS] },
        { key: 'workLocation', label: 'Work Location', options: [...TK_WORK_LOCATIONS] },
        { key: 'missingLogType', label: 'Missing Log Type', options: [...TK_MISSING_LOG_TYPES] },
        { key: 'status', label: 'Status', options: [...TK_MISSING_LOG_STATUS] },
      ]}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </>;
}

/* ------------------------------------------ 2. Time and Attendance Summary */

function TimeAttendanceSummaryScreen({ data, user, access, employees, teamEmployeeIds, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewPersonal, setViewPersonal] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const isApprover = access.canApproveTeamRequests;
  const allLogs = useMemo(() => logsForMany(data, teamEmployeeIds), [data, teamEmployeeIds]);
  const scoped = useMemo(() => scopeRows(allLogs, { access, user, viewPersonal, selectedEmployeeId }), [allLogs, access, user, viewPersonal, selectedEmployeeId]);
  const kpis = useMemo(() => attendanceKpis(scoped), [scoped]);
  const { decorate } = employeeColumns(employees);
  const showRoster = isApprover && !viewPersonal && !selectedEmployeeId;

  const rows = useMemo(
    () => scoped.map(decorate).filter(row => matches(row, table, ['employeeCode', 'name', 'department', 'date'])),
    [scoped, table.search, table.filters],
  );
  const pageRows = paginate(rows, table.page, table.pageSize);
  const selectedEmployee = selectedEmployeeId ? findEmployee(data, selectedEmployeeId) : null;

  function exportRows(format) {
    const headers = ['Date', 'Time In', 'Time Out', 'Worked Hours', 'Break In', 'Break Out', 'Break Hours', 'Overtime Hours', 'Status'];
    downloadFile(`time-attendance-summary.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows.map(row => [
      formatDate(row.date), row.timeIn, row.timeOut, hoursToClock(row.workedHours), row.breakIn, row.breakOut, hoursToClock(row.breakHours), hoursToClock(row.overtimeHours), row.status,
    ])));
    onNotify(`Time and attendance summary exported to ${format}.`);
  }

  const rosterColumns = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'name', label: 'Employee Full Name' },
    { key: 'department', label: 'Department/Division' },
    { key: 'totalWorkedHours', label: 'Total Worked Hours' },
    { key: 'totalOvertimeHours', label: 'Total Overtime Hours' },
    { key: 'status', label: 'Status' },
  ];
  const personalColumns = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'timeIn', label: 'Time In' },
    { key: 'timeOut', label: 'Time Out' },
    { key: 'workedHours', label: 'Worked Hours' },
    { key: 'breakIn', label: 'Break In' },
    { key: 'breakOut', label: 'Break Out' },
    { key: 'breakHours', label: 'Break Hours' },
    { key: 'overtimeHours', label: 'Overtime Hours' },
    { key: 'status', label: 'Status' },
  ];

  return <div className="hrm-workspace tk-screen">
    <PageHeading title="Time and Attendance Summary" />
    <KpiRow items={[
      { label: 'Total Worked Hours', value: kpis.totalWorkedHours },
      { label: 'Total Overtime Hours', value: kpis.totalOvertimeHours },
      { label: 'Total Absences', value: kpis.totalAbsences },
      { label: 'Total Leave Days', value: kpis.totalLeaveDays },
      { label: 'Total Tardiness/Undertime', value: kpis.totalTardinessUndertime },
    ]} />

    {selectedEmployee && <Breadcrumbs trail={[
      { label: 'All Employees', onClick: () => setSelectedEmployeeId('') },
      { label: selectedEmployee.name },
    ]} />}

    <TkToolbar table={table} onFilter={() => setDrawerOpen(true)}>
      {isApprover && <PersonalToggle checked={viewPersonal} onChange={value => { setViewPersonal(value); setSelectedEmployeeId(''); }} />}
      <ExportMenu onExport={exportRows} disabled={rows.length === 0} />
    </TkToolbar>

    <DataTable
      columns={showRoster ? rosterColumns : personalColumns}
      rows={pageRows}
      total={rows.length}
      rowKey={row => row.logId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No attendance rows for this filter."
      renderCell={(row, column) => {
        if (column.key === 'employeeCode') return <button type="button" className="tk-code-link" onClick={() => setSelectedEmployeeId(row.employeeId)}>{row.employeeCode}</button>;
        if (column.key === 'totalWorkedHours' || column.key === 'workedHours') return hoursToClock(row.workedHours);
        if (column.key === 'totalOvertimeHours' || column.key === 'overtimeHours') return row.overtimeHours ? `${hoursToClock(row.overtimeHours)} (${row.overtimeStatus})` : '—';
        if (column.key === 'breakHours') return hoursToClock(row.breakHours);
        if (column.key === 'status') return <StatusText status={row.status} />;
        return formatCell(row[column.key], column.type);
      }}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'name', label: 'Employee Full Name' },
        { key: 'department', label: 'Department/Division' },
        { key: 'tool', label: 'Tools Used', options: [...TK_TOOLS] },
        { key: 'workLocation', label: 'Work Location', options: [...TK_WORK_LOCATIONS] },
        { key: 'status', label: 'Status', options: ['Present', 'Late', 'Undertime', 'Absent', 'On Leave'] },
      ]}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

/* -------------------------------------------- 3. Work Hours Comparison */

function WorkHoursComparisonScreen({ data, user, access, employees, teamEmployeeIds, onNotify }) {
  const isApprover = access.canApproveTeamRequests;
  const [granularity, setGranularity] = useState('Year');
  const [range, setRange] = useState({ year: '2025', from: '2025-01-01', to: '2025-12-31' });
  const [team, setTeam] = useState(TK_TEAMS[0]);
  const [viewPersonal, setViewPersonal] = useState(false);
  const [picked, setPicked] = useState(() => teamEmployeeIds.slice(0, 2));

  const selectedIds = !isApprover || viewPersonal ? [user.employeeId] : picked.length ? picked : [user.employeeId];
  const byId = new Map(employees.map(employee => [employee.employeeId, employee]));

  const series = selectedIds.map((employeeId, index) => {
    const logs = logsFor(data, employeeId);
    const bucket = workHoursSeries(logs, granularity, range);
    return {
      employeeId,
      label: byId.get(employeeId)?.name || employeeId,
      color: TK_SERIES_COLORS[index % TK_SERIES_COLORS.length],
      points: bucket.points,
      labels: bucket.labels,
      summary: workHoursSummary(logs),
    };
  });
  const labels = series[0]?.labels || [];

  function exportSeries(format) {
    const headers = ['Employee', ...labels];
    downloadFile(`work-hours-comparison.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, series.map(entry => [entry.label, ...entry.points])));
    onNotify(`Work hours comparison exported to ${format}.`);
  }

  return <div className="hrm-workspace tk-screen">
    <PageHeading title="Work Hours Comparison" />

    {isApprover && <div className="tk-comparison-bar">
      <select value={team} onChange={event => setTeam(event.target.value)} aria-label="Team">
        {TK_TEAMS.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
      <div className="tk-chip-list">
        {picked.map(employeeId => <span key={employeeId} className="tk-chip">
          {byId.get(employeeId)?.name || employeeId}
          <button type="button" aria-label={`Remove ${byId.get(employeeId)?.name || employeeId}`} onClick={() => setPicked(current => current.filter(id => id !== employeeId))}>×</button>
        </span>)}
        <select
          value=""
          aria-label="Add employee to comparison"
          onChange={event => { if (event.target.value) setPicked(current => (current.includes(event.target.value) ? current : [...current, event.target.value])); }}
        >
          <option value="">Add employee…</option>
          {teamEmployeeIds.filter(id => !picked.includes(id)).map(id => <option key={id} value={id}>{byId.get(id)?.name || id}</option>)}
        </select>
      </div>
      <div className="tk-comparison-bar-right">
        <PersonalToggle checked={viewPersonal} onChange={setViewPersonal} label="View Personal Data" />
        <ExportMenu onExport={exportSeries} disabled={series.length === 0} />
      </div>
    </div>}

    {!isApprover && <div className="hrm-toolbar"><div className="hrm-toolbar-left"><h3 className="hrm-section-title">Summary</h3></div><div className="hrm-toolbar-right"><ExportMenu onExport={exportSeries} /></div></div>}

    <div className="tk-summary-cards">
      {series.map(entry => <div key={entry.employeeId} className="tk-summary-card">
        <h4>{isApprover && !viewPersonal ? entry.label : 'Personal Data'}</h4>
        <div className="tk-summary-metrics">
          <div><span>Total Hours Worked</span><strong>{entry.summary.totalHoursWorked.toLocaleString()}</strong></div>
          <div><span>Average Hours Worked</span><strong>{entry.summary.averageHoursWorked}</strong></div>
          <div><span>Productivity Change</span><strong className={entry.summary.productivityUp ? 'tone-up' : 'tone-down'}>{entry.summary.productivityChange}</strong></div>
        </div>
      </div>)}
    </div>

    <section className="hrm-panel tk-chart-panel">
      <div className="tk-chart-head">
        <h3>Work Hours Comparison</h3>
        <div className="tk-chart-controls">
          <select value={granularity} onChange={event => setGranularity(event.target.value)} aria-label="Granularity">
            {TK_GRANULARITIES.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          {granularity === 'Month' && <select value={range.year} onChange={event => setRange(current => ({ ...current, year: event.target.value }))} aria-label="Year">
            {['2024', '2025'].map(year => <option key={year} value={year}>{year}</option>)}
          </select>}
          {granularity === 'Date Range' && <>
            <input type="date" value={range.from} onChange={event => setRange(current => ({ ...current, from: event.target.value }))} aria-label="Start date" />
            <input type="date" value={range.to} onChange={event => setRange(current => ({ ...current, to: event.target.value }))} aria-label="End date" />
          </>}
        </div>
      </div>
      {labels.length === 0
        ? <EmptyState title="No worked hours in this range">Widen the range or pick another granularity.</EmptyState>
        : <BarChart series={series.map(entry => ({ label: entry.label, color: entry.color, points: entry.points }))} labels={labels} showLegend={series.length > 1} />}
    </section>
  </div>;
}

/* ------------------------------------------------ 4. Year-to-Date Metrics */

const YTD_TABS = [
  { key: 'absences', label: 'Absences' },
  { key: 'tardiness', label: 'Tardiness' },
  { key: 'overtime', label: 'Overtime' },
  { key: 'hours-worked', label: 'Hours Worked' },
  { key: 'leaves', label: 'Leaves' },
];

function YearToDateMetricsScreen({ data, user, access, teamEmployeeIds, onNotify }) {
  const [tab, setTab] = useState('absences');
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Year-to-date metrics are the signed-in user's own record in both
  // experiences — an approver reads a report's YTD from their profile.
  const logs = useMemo(() => scopeRows(logsForMany(data, teamEmployeeIds), { access, user, viewPersonal: true }), [data, teamEmployeeIds, access, user]);

  const view = useMemo(() => {
    if (tab === 'absences') {
      const rows = ytdAbsences(logs);
      return {
        rows,
        cards: [
          { label: 'Sick Leave Days', value: rows.filter(row => row.absenceType === 'Sick Leave').reduce((total, row) => total + row.days, 0).toFixed(1) },
          { label: 'Excused', value: rows.filter(row => row.absenceType === 'Excused').reduce((total, row) => total + row.days, 0).toFixed(1) },
          { label: 'Unexcused', value: rows.filter(row => row.absenceType === 'Unexcused').reduce((total, row) => total + row.days, 0).toFixed(1) },
        ],
        columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'absenceType', label: 'YTD Absence Type' }, { key: 'days', label: 'Days' }],
        filters: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'absenceType', label: 'Absence Types', options: ['Unexcused', 'Excused', ...TK_LEAVE_TYPES] }],
        searchKeys: ['date', 'absenceType'],
      };
    }
    if (tab === 'tardiness') {
      const rows = ytdTardiness(logs);
      const totalMinutes = rows.reduce((total, row) => total + row.minutesLate, 0);
      return {
        rows,
        cards: [
          { label: 'Total Instances', value: rows.length },
          { label: 'Average Mins/Instance', value: rows.length ? (totalMinutes / rows.length).toFixed(1) : '0.0' },
          { label: 'Total Minutes Late', value: totalMinutes },
          { label: 'Average Hours/Instance', value: rows.length ? (totalMinutes / rows.length / 60).toFixed(1) : '0.0' },
          { label: 'Total Hours Late', value: (totalMinutes / 60).toFixed(1) },
        ],
        columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'minutesLate', label: 'Minutes Late' }, { key: 'hoursLate', label: 'Hours Late' }],
        filters: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'minutesLate', label: 'Minutes Late' }, { key: 'hoursLate', label: 'Hours Late' }],
        searchKeys: ['date', 'minutesLate'],
      };
    }
    if (tab === 'overtime') {
      const rows = ytdOvertime(logs);
      return {
        rows,
        cards: [{ label: 'Total Overtime Hours', value: rows.reduce((total, row) => total + row.overtimeHours, 0).toFixed(1) }],
        columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'overtimeHours', label: 'Overtime Hours' }],
        filters: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'overtimeHours', label: 'Overtime Hours' }],
        searchKeys: ['date', 'overtimeHours'],
      };
    }
    if (tab === 'hours-worked') {
      const rows = ytdHoursWorked(logs);
      return {
        rows,
        cards: [{ label: 'Total Hours Worked', value: rows.reduce((total, row) => total + row.workedHours, 0).toFixed(1) }],
        columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'workedHours', label: 'Worked Hours' }],
        filters: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'workedHours', label: 'Worked Hours' }],
        searchKeys: ['date', 'workedHours'],
      };
    }
    const rows = ytdLeaves(logs);
    const daysFor = leaveType => rows.filter(row => row.leaveType === leaveType).reduce((total, row) => total + row.days, 0).toFixed(1);
    return {
      rows,
      cards: [
        { label: 'YTD Sick Leave (days)', value: daysFor('Sick Leave') },
        { label: 'YTD Personal Leave (days)', value: daysFor('Personal Leave') },
        { label: 'YTD Vacation Leave (days)', value: daysFor('Vacation Leave') },
        { label: 'YTD Bereavement (days)', value: daysFor('Bereavement Leave') },
      ],
      columns: [
        { key: 'startDate', label: 'Start Date', type: 'date' },
        { key: 'endDate', label: 'End Date', type: 'date' },
        { key: 'leaveType', label: 'YTD Leave Type' },
        { key: 'days', label: 'YTD Days' },
      ],
      filters: [{ key: 'startDate', label: 'Date', type: 'date' }, { key: 'leaveType', label: 'YTD Leave Types', options: [...TK_LEAVE_TYPES] }, { key: 'days', label: 'YTD Days' }],
      searchKeys: ['startDate', 'leaveType'],
    };
  }, [tab, logs]);

  const filtered = useMemo(() => view.rows.filter(row => matches(row, table, view.searchKeys)), [view, table.search, table.filters]);
  const pageRows = paginate(filtered, table.page, table.pageSize);

  function exportRows(format) {
    const headers = view.columns.map(column => column.label);
    downloadFile(`ytd-${tab}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, filtered.map(row => view.columns.map(column => row[column.key]))));
    onNotify(`Year-to-date ${tab.replace('-', ' ')} exported to ${format}.`);
  }

  return <div className="hrm-workspace tk-screen">
    <PageHeading title="Year-to-Date Metrics" />
    <SegmentedTabs tabs={YTD_TABS} value={tab} onChange={key => { setTab(key); table.setFilters({}); table.setPage(1); }} ariaLabel="Year-to-date metric" />
    <KpiRow items={view.cards} />
    <TkToolbar table={table} onFilter={() => setDrawerOpen(true)}>
      <ExportMenu onExport={exportRows} disabled={filtered.length === 0} />
    </TkToolbar>
    <DataTable
      columns={view.columns}
      rows={pageRows}
      total={filtered.length}
      rowKey={row => row.key}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No records for this metric."
    />
    {drawerOpen && <FilterDrawer
      fields={view.filters}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

/* ------------------------------------------------------------ 5. Charge Codes */

import { ChargeCodesWorkspace } from './TimekeepingChargeCodes.jsx';

function ChargeCodesScreen({ data, setData, user, access, onNotify }) {
  return <ChargeCodesWorkspace
    data={data}
    setData={setData}
    user={user}
    access={access}
    subView="time-report-application"
    onBack={() => {}}
    onNotify={onNotify}
  />;
}

function EmployeeChargeCodesPanel({ data, setData, user, access, employees, teamEmployeeIds, onNotify }) {
  const isApprover = access.canApproveTeamRequests;
  const settings = data.timekeeping || {};
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewPersonal, setViewPersonal] = useState(!isApprover);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [detail, setDetail] = useState(false);
  const [period, setPeriod] = useState(settings.currentPeriod);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const reports = useMemo(
    () => scopeRows((data.timeReports || []).filter(row => teamEmployeeIds.includes(row.employeeId)), { access, user, viewPersonal, selectedEmployeeId }),
    [data.timeReports, teamEmployeeIds, access, user, viewPersonal, selectedEmployeeId],
  );
  const { decorate } = employeeColumns(employees);
  const summary = useMemo(() => chargeCodeSummaryRows(reports).map(decorate), [reports, employees]);
  const details = useMemo(() => reports.map(decorate), [reports, employees]);

  const rows = detail
    ? details.filter(row => matches(row, table, ['date', 'chargeCode', 'projectName', 'team', 'employeeCode', 'name']))
    : summary.filter(row => matches(row, table, ['date', 'employeeCode', 'name', 'department']));
  const pageRows = paginate(rows, table.page, table.pageSize);
  const selectedEmployee = selectedEmployeeId ? findEmployee(data, selectedEmployeeId) : null;
  const canAdd = viewPersonal || !isApprover;

  function exportRows(format) {
    const headers = detail
      ? ['Time Report Date', 'Start Time', 'End Time', 'Duration (Hours)', 'Charge Account/Charge Code', 'Client/Project', 'Team', 'Type of Hours']
      : ['Date', 'Employee Code', 'Employee Full Name', 'Total Mandatory Hours - Filed on Time', 'Total Mandatory Hours - Not Filed on Time', 'Total Mandatory Hours - Unaccounted', 'Total Overtime - Approved Time'];
    const body = detail
      ? rows.map(row => [formatDate(row.date), row.startTime, row.endTime, row.durationHours, row.chargeCode, row.projectName, row.team, row.typeOfHours])
      : rows.map(row => [formatDate(row.date), row.employeeCode, row.name, row.mandatoryFiledOnTime, row.mandatoryNotFiledOnTime, row.mandatoryUnaccounted, row.overtimeApproved]);
    downloadFile(`charge-codes-${detail ? 'details' : 'summary'}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, body));
    onNotify(`Time report ${detail ? 'details' : 'summary'} exported to ${format}.`);
  }

  const summaryColumns = [
    { key: 'date', label: 'Date', type: 'date' },
    ...(isApprover && !viewPersonal ? [{ key: 'employeeCode', label: 'Employee Code' }, { key: 'name', label: 'Employee Full Name' }, { key: 'department', label: 'Department/Division' }] : []),
    { key: 'mandatoryFiledOnTime', label: 'Total Mandatory Hours - Filed on Time' },
    { key: 'mandatoryNotFiledOnTime', label: 'Total Mandatory Hours - Not Filed on Time' },
    { key: 'mandatoryUnaccounted', label: 'Total Mandatory Hours - Unaccounted' },
    { key: 'overtimeApproved', label: 'Total Overtime - Approved Time' },
    { key: 'overtimePending', label: 'Total Overtime - Pending' },
  ];

  const detailColumns = [
    { key: 'date', label: 'Time Report Date', type: 'date' },
    { key: 'startTime', label: 'Start Time' },
    { key: 'endTime', label: 'End Time' },
    { key: 'durationHours', label: 'Duration (Hours)' },
    { key: 'chargeCode', label: 'Charge Account/Charge Code' },
    { key: 'projectName', label: 'Client/Project' },
    { key: 'team', label: 'Team' },
    { key: 'typeOfHours', label: 'Type of Hours' },
    { key: 'status', label: 'Status' },
  ];

  return <>
    <div className="tk-period-strip">
      <h3 className="hrm-section-title">Time Report Summary</h3>
      <div>
        <span>Cut-off: <strong>{settings.cutoffLabel}</strong></span>
        <label><span>Current Period:</span>
          <select value={period} onChange={event => setPeriod(event.target.value)}>
            {(settings.periods || []).map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </div>
    </div>

    <TkToolbar table={table} onFilter={() => setDrawerOpen(true)}>
      {isApprover && <PersonalToggle checked={viewPersonal} onChange={value => { setViewPersonal(value); setSelectedEmployeeId(''); setDetail(false); }} />}
      {canAdd && <PrimaryButton onClick={() => setEditing({ mode: 'add', form: emptyTimeReport(settings) })}>Add Time Report</PrimaryButton>}
      <GhostButton onClick={() => onNotify('Time report upload accepted for processing.')}>Upload</GhostButton>
      <ExportMenu onExport={exportRows} disabled={rows.length === 0} />
    </TkToolbar>

    <Breadcrumbs trail={[
      ...(selectedEmployee ? [{ label: 'All Employees', onClick: () => { setSelectedEmployeeId(''); setDetail(false); } }, { label: selectedEmployee.name, onClick: detail ? () => setDetail(false) : undefined }] : [{ label: 'Summary', onClick: detail ? () => setDetail(false) : undefined }]),
      ...(detail ? [{ label: 'View Details' }] : []),
    ]} />

    <DataTable
      columns={detail ? detailColumns : summaryColumns}
      rows={pageRows}
      total={rows.length}
      rowKey={row => row.key || row.reportId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No time reports filed for this period."
      renderCell={(row, column) => {
        if (column.key === 'employeeCode') return <button type="button" className="tk-code-link" onClick={() => setSelectedEmployeeId(row.employeeId)}>{row.employeeCode}</button>;
        return formatCell(row[column.key], column.type);
      }}
      actions={detail
        ? row => [
            { label: 'Edit', kind: 'edit', onSelect: () => setEditing({ mode: 'edit', form: { ...row } }) },
            { label: 'Delete', kind: 'cancel', onSelect: () => setDeleting(row) },
          ]
        : row => [{ label: 'View Details', kind: 'view', onSelect: () => { setSelectedEmployeeId(row.employeeId); setDetail(true); } }]}
    />

    {drawerOpen && <FilterDrawer
      fields={detail
        ? [
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'startTime', label: 'Start Time' },
            { key: 'endTime', label: 'End Time' },
            { key: 'chargeCode', label: 'Charge Account/Charge Code' },
            { key: 'projectName', label: 'Client/Project Name' },
            { key: 'team', label: 'Team' },
            { key: 'typeOfHours', label: 'Type of Hours', options: [...TK_HOUR_TYPES] },
            { key: 'status', label: 'Status', options: ['Filed on Time', 'Not Filed on Time', 'Unaccounted'] },
          ]
        : [
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'employeeCode', label: 'Employee Code' },
            { key: 'name', label: 'Employee Full Name' },
            { key: 'department', label: 'Department/Division' },
          ]}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {editing && <TimeReportModal
      mode={editing.mode}
      form={editing.form}
      onClose={() => setEditing(null)}
      onSubmit={form => {
        setData(current => {
          const list = current.timeReports || [];
          if (editing.mode === 'add') {
            const record = { ...form, reportId: createHrmId('tkr'), employeeId: user.employeeId, status: 'Filed on Time' };
            return { ...current, timeReports: [record, ...list] };
          }
          return { ...current, timeReports: list.map(row => (row.reportId === form.reportId ? { ...row, ...form } : row)) };
        });
        setEditing(null);
        onNotify(editing.mode === 'add' ? 'Time report added successfully!' : 'Time report saved successfully!');
      }}
    />}

    {deleting && <Modal
      title="Delete Item"
      onClose={() => setDeleting(null)}
      width="sm"
      footer={<><GhostButton onClick={() => setDeleting(null)}>Cancel</GhostButton><button type="button" className="hrm-btn danger" onClick={() => {
        setData(current => ({ ...current, timeReports: (current.timeReports || []).filter(row => row.reportId !== deleting.reportId) }));
        setDeleting(null);
        onNotify('Time report deleted successfully!');
      }}>Delete</button></>}
    >
      <p>Are you sure you want to delete this item? This action is irreversible.</p>
    </Modal>}
  </>;
}

function emptyTimeReport(settings) {
  return {
    date: today(),
    dateCreated: today(),
    startTime: '09:00:00',
    endTime: '13:00:00',
    durationHours: 4,
    chargeCode: '',
    projectName: '',
    team: '',
    activityDescription: '',
    approverName: 'Ethan Caldwell',
    typeOfHours: TK_HOUR_TYPES[0],
    projectAllocation: 1,
    period: settings.currentPeriod,
  };
}

function TimeReportModal({ mode, form: initial, onClose, onSubmit }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  function submit() {
    const next = {};
    if (!form.startTime) next.startTime = 'Required';
    if (!form.endTime) next.endTime = 'Required';
    if (!form.chargeCode) next.chargeCode = 'Required';
    if (!form.team) next.team = 'Required';
    if (!form.typeOfHours) next.typeOfHours = 'Required';
    if (!form.projectAllocation) next.projectAllocation = 'Required';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({ ...form, durationHours: Number(form.durationHours) || 0 });
  }

  return <Modal
    title={mode === 'add' ? 'Add Time Report' : 'Edit Time Report'}
    onClose={onClose}
    width="lg"
    footer={<><GhostButton onClick={onClose}>Cancel</GhostButton><button type="button" className="hrm-btn primary" onClick={submit}>{mode === 'add' ? 'Add' : 'Save'}</button></>}
  >
    <div className="hrm-form-grid">
      <Field label="Time Report Date"><input type="date" value={form.date} onChange={event => set('date', event.target.value)} /></Field>
      <Field label="Date Created"><input type="date" value={form.dateCreated} disabled /></Field>
      <Field label="Start Time" required error={errors.startTime}><input type="time" step="1" value={form.startTime} onChange={event => set('startTime', event.target.value)} /></Field>
      <Field label="End Time" required error={errors.endTime}><input type="time" step="1" value={form.endTime} onChange={event => set('endTime', event.target.value)} /></Field>
      <Field label="Charge Code" required error={errors.chargeCode}>
        <select value={form.chargeCode} onChange={event => set('chargeCode', event.target.value)}>
          <option value="">Please select</option>
          <option value="P&A Clients> P&A Client Name / Employee Group> Employee Subgroup - Department Name/Division Name">P&amp;A Clients&gt; Client Name / Employee Group</option>
          <option value="Internal> Product Development">Internal&gt; Product Development</option>
          <option value="Internal> Training &amp; Development">Internal&gt; Training &amp; Development</option>
        </select>
      </Field>
      <Field label="Project Name"><input value={form.projectName} placeholder="Project Name" onChange={event => set('projectName', event.target.value)} /></Field>
      <Field label="Team" required error={errors.team}>
        <select value={form.team} onChange={event => set('team', event.target.value)}>
          <option value="">Please select</option>
          {TK_TEAMS.filter(option => option !== 'All Teams').map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </Field>
      <Field label="Duration (Hours)"><input type="number" min="0" step="0.5" value={form.durationHours} onChange={event => set('durationHours', event.target.value)} /></Field>
      <Field label="Activity Description"><input value={form.activityDescription} placeholder="Brief Description" onChange={event => set('activityDescription', event.target.value)} /></Field>
      <Field label="Approver Name"><input value={form.approverName} disabled /></Field>
      <Field label="Type of Hours" required error={errors.typeOfHours}>
        <select value={form.typeOfHours} onChange={event => set('typeOfHours', event.target.value)}>
          {TK_HOUR_TYPES.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </Field>
      <Field label="Project Allocation" required error={errors.projectAllocation}><input type="number" min="0" max="1" step="0.1" value={form.projectAllocation} onChange={event => set('projectAllocation', event.target.value)} /></Field>
    </div>
  </Modal>;
}

function CostAllocationPanel({ data, employees, teamEmployeeIds, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const rows = useMemo(() => {
    const reports = (data.timeReports || []).filter(row => teamEmployeeIds.includes(row.employeeId));
    return costAllocationRows(reports, employees).filter(row => matches(row, table, ['employeeCode', 'name', 'category', 'chargeCode', 'clientProject']));
  }, [data.timeReports, teamEmployeeIds, employees, table.search, table.filters]);
  const pageRows = paginate(rows, table.page, table.pageSize);

  function exportRows(format) {
    const headers = ['Date', 'Employee Code', 'Full Name', 'Category', 'Charge Account/Charge Code', 'Client/Project', 'Allocation'];
    downloadFile(`cost-allocation.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows.map(row => [formatDate(row.date), row.employeeCode, row.name, row.category, row.chargeCode, row.clientProject, row.allocation])));
    onNotify(`Cost allocation exported to ${format}.`);
  }

  return <>
    <TkToolbar table={table} onFilter={() => setDrawerOpen(true)}>
      <GhostButton onClick={() => onNotify('Cost allocation upload accepted for processing.')}>Upload</GhostButton>
      <ExportMenu onExport={exportRows} disabled={rows.length === 0} />
    </TkToolbar>
    <DataTable
      columns={[
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'name', label: 'Full Name' },
        { key: 'category', label: 'Category' },
        { key: 'chargeCode', label: 'Charge Account/Charge Code' },
        { key: 'clientProject', label: 'Client/Project' },
        { key: 'allocation', label: 'Allocation' },
      ]}
      rows={pageRows}
      total={rows.length}
      rowKey={row => row.key}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No cost allocation rows."
      renderCell={(row, column) => {
        if (column.key === 'employeeCode') return <span className="tk-code-link">{row.employeeCode}</span>;
        return formatCell(row[column.key], column.type);
      }}
    />
    {drawerOpen && <FilterDrawer
      fields={[{ key: 'date', label: 'Date Range', type: 'date' }, { key: 'chargeCode', label: 'Charge Codes' }, { key: 'clientProject', label: 'Project Name' }]}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </>;
}

/* -------------------------------------------------------- 6. Absence Management */

function AbsenceScreen({ data, user, access, employees, teamEmployeeIds, onNotify }) {
  const isApprover = access.canApproveTeamRequests;
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewPersonal, setViewPersonal] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const logs = useMemo(() => scopeRows(logsForMany(data, teamEmployeeIds), { access, user, viewPersonal, selectedEmployeeId }), [data, teamEmployeeIds, access, user, viewPersonal, selectedEmployeeId]);
  const { decorate } = employeeColumns(employees);
  const showRoster = isApprover && !viewPersonal && !selectedEmployeeId;
  const rows = useMemo(() => absenceRows(logs).map(decorate).filter(row => matches(row, table, ['date', 'leaveType', 'employeeCode', 'name', 'department'])), [logs, employees, table.search, table.filters]);
  const pageRows = paginate(rows, table.page, table.pageSize);
  const selectedEmployee = selectedEmployeeId ? findEmployee(data, selectedEmployeeId) : null;

  function exportRows(format) {
    const headers = ['Date', 'Leave Type', 'Total in Hours', 'Reason'];
    downloadFile(`absence-summary.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows.map(row => [formatDate(row.date), row.leaveType, row.totalInHours, row.reason])));
    onNotify(`Absence summary exported to ${format}.`);
  }

  return <div className="hrm-workspace tk-screen">
    <PageHeading title={showRoster ? 'Absence Management' : selectedEmployee ? 'Employee Absenteeism Logs' : 'Absence Summary'} />
    {selectedEmployee && <>
      <Breadcrumbs trail={[{ label: 'Absence Management', onClick: () => setSelectedEmployeeId('') }, { label: 'Employee Absenteeism Logs' }]} />
      <EmployeeBanner employee={selectedEmployee} />
    </>}
    <TkToolbar table={table} onFilter={() => setDrawerOpen(true)}>
      {isApprover && <PersonalToggle checked={viewPersonal} onChange={value => { setViewPersonal(value); setSelectedEmployeeId(''); }} />}
      <ExportMenu onExport={exportRows} disabled={rows.length === 0} />
    </TkToolbar>
    <DataTable
      columns={showRoster
        ? [
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'employeeCode', label: 'Employee Code' },
            { key: 'name', label: 'Employee Full Name' },
            { key: 'position', label: 'Job Title' },
            { key: 'department', label: 'Department' },
            { key: 'division', label: 'Division' },
            { key: 'totalInHours', label: 'Total in Hours' },
          ]
        : [
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'leaveType', label: 'Leave Type' },
            { key: 'totalInHours', label: 'Total in Hours' },
            { key: 'reason', label: 'Reason' },
          ]}
      rows={pageRows}
      total={rows.length}
      rowKey={row => row.key}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No absences recorded."
      renderCell={(row, column) => {
        if (column.key === 'employeeCode') return <button type="button" className="tk-code-link" onClick={() => setSelectedEmployeeId(row.employeeId)}>{row.employeeCode}</button>;
        return formatCell(row[column.key], column.type);
      }}
    />
    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'leaveType', label: 'Leave Type', options: [...TK_LEAVE_TYPES] },
        { key: 'totalInHours', label: 'Total (in Hours)' },
      ]}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

/* --------------------------------------------------------- 7. Leave Management */

function LeavesScreen({ data, user, access, teamEmployeeIds, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const logs = useMemo(() => scopeRows(logsForMany(data, teamEmployeeIds), { access, user, viewPersonal: true }), [data, teamEmployeeIds, access, user]);
  const rows = useMemo(
    () => leaveBalanceRows(data.tkLeaveAccruals || [], logs).filter(row => matches(row, table, ['leaveType', 'accrualFrequency'])),
    [data.tkLeaveAccruals, logs, table.search, table.filters],
  );
  const pageRows = paginate(rows, table.page, table.pageSize);

  function exportRows(format) {
    const headers = ['Leave Type', 'Current Balance', 'Accrual Frequency', 'Accrual Rate', 'Entitlement (Accrual)', 'Adjustment', 'Forfeiture', 'Taken', 'Available', 'Expiry Date'];
    downloadFile(`leave-balance-summary.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows.map(row => [row.leaveType, row.currentBalance, row.accrualFrequency, row.accrualRate, row.entitlement, row.adjustment, row.forfeiture, row.taken, row.available, row.expiryDate])));
    onNotify(`Leave balance summary exported to ${format}.`);
  }

  return <div className="hrm-workspace tk-screen">
    <PageHeading title="Leave Balance Summary" />
    <TkToolbar table={table} onFilter={() => setDrawerOpen(true)}>
      <ExportMenu onExport={exportRows} disabled={rows.length === 0} />
    </TkToolbar>
    <DataTable
      columns={[
        { key: 'leaveType', label: 'Leave Type' },
        { key: 'currentBalance', label: 'Current Balance' },
        { key: 'accrualFrequency', label: 'Accrual Frequency' },
        { key: 'accrualRate', label: 'Accrual Rate' },
        { key: 'entitlement', label: 'Entitlement (Accrual)' },
        { key: 'adjustment', label: 'Adjustment' },
        { key: 'forfeiture', label: 'Forfeiture' },
        { key: 'taken', label: 'Taken' },
        { key: 'available', label: 'Available' },
        { key: 'expiryDate', label: 'Expiry Date' },
        { key: 'lastUpdated', label: 'Last Updated', type: 'date' },
      ]}
      rows={pageRows}
      total={rows.length}
      rowKey={row => row.key}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No leave types configured."
      renderCell={(row, column) => {
        if (column.key === 'currentBalance' || column.key === 'entitlement' || column.key === 'available') return `${row[column.key]} days`;
        if (column.key === 'adjustment' || column.key === 'forfeiture' || column.key === 'taken') return `${row[column.key]} days`;
        return formatCell(row[column.key], column.type);
      }}
    />
    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'leaveType', label: 'Leave Type', options: [...TK_LEAVE_TYPES] },
        { key: 'accrualFrequency', label: 'Accrual Frequency', options: ['Monthly', 'Yearly', 'Fixed Rate'] },
        { key: 'entitlement', label: 'Entitlement (Accrual)' },
        { key: 'taken', label: 'Taken' },
        { key: 'available', label: 'Available' },
      ]}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

/* ------------------------------------------- 8. Tardiness/Undertime Management */

function TardinessUndertimeScreen({ data, user, access, employees, teamEmployeeIds, onNotify }) {
  const isApprover = access.canApproveTeamRequests;
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewPersonal, setViewPersonal] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [view, setView] = useState('Date Range');

  const logs = useMemo(() => scopeRows(logsForMany(data, teamEmployeeIds), { access, user, viewPersonal, selectedEmployeeId }), [data, teamEmployeeIds, access, user, viewPersonal, selectedEmployeeId]);
  const kpis = useMemo(() => tardinessKpis(logs), [logs]);
  const { decorate } = employeeColumns(employees);
  const showRoster = isApprover && !viewPersonal && !selectedEmployeeId;
  const rows = useMemo(() => tardinessRows(logs).map(decorate).filter(row => matches(row, table, ['date', 'employeeCode', 'name', 'department', 'remarks'])), [logs, employees, table.search, table.filters]);
  const pageRows = paginate(rows, table.page, table.pageSize);
  const selectedEmployee = selectedEmployeeId ? findEmployee(data, selectedEmployeeId) : null;

  function exportRows(format) {
    const headers = ['Date', 'Time In', 'Time Out', 'Tardiness in Hours', 'Tardiness in Minutes', 'Undertime in Hours', 'Undertime in Minutes', 'Remarks'];
    downloadFile(`tardiness-undertime.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows.map(row => [formatDate(row.date), row.timeIn, row.timeOut, row.tardinessHours, row.tardinessMinutes, row.undertimeHours, row.undertimeMinutes, row.remarks])));
    onNotify(`Tardiness/undertime exported to ${format}.`);
  }

  return <div className="hrm-workspace tk-screen">
    <PageHeading title={showRoster ? 'Tardiness/Undertime Management' : selectedEmployee ? 'Employee Tardiness/Undertime Logs' : 'Tardiness/Undertime Summary'} />
    <KpiRow items={[
      { label: 'Tardiness (in Hours)', value: kpis.tardinessHours },
      { label: 'Tardiness (in Mins)', value: kpis.tardinessMinutes },
      { label: 'Undertime (in Hours)', value: kpis.undertimeHours },
      { label: 'Undertime (in Mins)', value: kpis.undertimeMinutes },
    ]} />
    {isApprover && <div className="tk-view-strip">
      <span>View:</span>
      <select value={view} onChange={event => setView(event.target.value)} aria-label="View">
        {TK_GRANULARITIES.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>}
    {selectedEmployee && <>
      <Breadcrumbs trail={[{ label: 'Tardiness/Undertime Management', onClick: () => setSelectedEmployeeId('') }, { label: 'Employee Tardiness/Undertime Logs' }]} />
      <EmployeeBanner employee={selectedEmployee} />
    </>}
    <TkToolbar table={table} onFilter={() => setDrawerOpen(true)}>
      {isApprover && <PersonalToggle checked={viewPersonal} onChange={value => { setViewPersonal(value); setSelectedEmployeeId(''); }} />}
      <ExportMenu onExport={exportRows} disabled={rows.length === 0} />
    </TkToolbar>
    <DataTable
      columns={showRoster
        ? [
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'employeeCode', label: 'Employee Code' },
            { key: 'name', label: 'Employee Full Name' },
            { key: 'position', label: 'Job Title' },
            { key: 'department', label: 'Department' },
            { key: 'division', label: 'Division' },
          ]
        : [
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'timeIn', label: 'Time In' },
            { key: 'timeOut', label: 'Time Out' },
            { key: 'tardinessHours', label: 'Tardiness in Hours' },
            { key: 'tardinessMinutes', label: 'Tardiness in Minutes' },
            { key: 'undertimeHours', label: 'Undertime in Hours' },
            { key: 'undertimeMinutes', label: 'Undertime in Minutes' },
            { key: 'remarks', label: 'Remarks' },
          ]}
      rows={pageRows}
      total={rows.length}
      rowKey={row => row.key}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No tardiness or undertime recorded."
      renderCell={(row, column) => {
        if (column.key === 'employeeCode') return <button type="button" className="tk-code-link" onClick={() => setSelectedEmployeeId(row.employeeId)}>{row.employeeCode}</button>;
        return formatCell(row[column.key], column.type);
      }}
    />
    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'name', label: 'Employee Full Name' },
        { key: 'department', label: 'Department' },
        { key: 'tardinessHours', label: 'Tardiness in Hours' },
        { key: 'tardinessMinutes', label: 'Tardiness in Minutes' },
        { key: 'undertimeHours', label: 'Undertime in Hours' },
        { key: 'undertimeMinutes', label: 'Undertime in Minutes' },
      ]}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

/* ------------------------------------------------------- 9. Overtime Summary */

function OvertimeScreen({ data, user, access, employees, teamEmployeeIds, onNotify }) {
  const isApprover = access.canApproveTeamRequests;
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewPersonal, setViewPersonal] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const logs = useMemo(() => scopeRows(logsForMany(data, teamEmployeeIds), { access, user, viewPersonal, selectedEmployeeId }), [data, teamEmployeeIds, access, user, viewPersonal, selectedEmployeeId]);
  const { decorate } = employeeColumns(employees);
  const showRoster = isApprover && !viewPersonal && !selectedEmployeeId;
  const rows = useMemo(() => overtimeRows(logs).map(decorate).filter(row => matches(row, table, ['date', 'employeeCode', 'name', 'department', 'otType'])), [logs, employees, table.search, table.filters]);
  const pageRows = paginate(rows, table.page, table.pageSize);
  const selectedEmployee = selectedEmployeeId ? findEmployee(data, selectedEmployeeId) : null;

  function exportRows(format) {
    const headers = ['Date', 'Hourly Rate', 'OT Type', 'OT Rate', 'OT Start Time', 'OT End Time', 'Total OT Hours', 'Reason'];
    downloadFile(`overtime-summary.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows.map(row => [formatDate(row.date), row.hourlyRate, row.otType, row.otRate, row.otStartTime, row.otEndTime, row.totalOtHours, row.reason])));
    onNotify(`Overtime summary exported to ${format}.`);
  }

  return <div className="hrm-workspace tk-screen">
    <PageHeading title={showRoster ? 'Overtime Management' : selectedEmployee ? 'Employee Overtime Logs' : 'Overtime Summary'} />
    {selectedEmployee && <>
      <Breadcrumbs trail={[{ label: 'Overtime Management', onClick: () => setSelectedEmployeeId('') }, { label: 'Employee Overtime Logs' }]} />
      <EmployeeBanner employee={selectedEmployee} />
    </>}
    <TkToolbar table={table} onFilter={() => setDrawerOpen(true)}>
      {isApprover && <PersonalToggle checked={viewPersonal} onChange={value => { setViewPersonal(value); setSelectedEmployeeId(''); }} />}
      <ExportMenu onExport={exportRows} disabled={rows.length === 0} />
    </TkToolbar>
    <DataTable
      columns={showRoster
        ? [
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'employeeCode', label: 'Employee Code' },
            { key: 'name', label: 'Employee Full Name' },
            { key: 'position', label: 'Job Title' },
            { key: 'department', label: 'Department' },
            { key: 'division', label: 'Division' },
            { key: 'hourlyRate', label: 'Hourly Rate' },
            { key: 'totalOtHours', label: 'Total OT Hours' },
          ]
        : [
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'hourlyRate', label: 'Hourly Rate' },
            { key: 'otType', label: 'OT Type' },
            { key: 'otRate', label: 'OT Rate' },
            { key: 'otStartTime', label: 'OT Start Time' },
            { key: 'otEndTime', label: 'OT End Time' },
            { key: 'totalOtHours', label: 'Total OT Hours' },
            { key: 'reason', label: 'Reason' },
          ]}
      rows={pageRows}
      total={rows.length}
      rowKey={row => row.key}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No overtime recorded."
      renderCell={(row, column) => {
        if (column.key === 'employeeCode') return <button type="button" className="tk-code-link" onClick={() => setSelectedEmployeeId(row.employeeId)}>{row.employeeCode}</button>;
        return formatCell(row[column.key], column.type);
      }}
    />
    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'otType', label: 'OT Type', options: [...TK_OT_TYPES] },
        { key: 'otRate', label: 'OT Rate' },
        { key: 'otStartTime', label: 'OT Start Time' },
        { key: 'otEndTime', label: 'OT End Time' },
        { key: 'totalOtHours', label: 'Total OT Hours' },
      ]}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

/* ------------------------------------------------ 10. OT With Earning Condition */

function OtEarningConditionScreen({ data, user, access, employees, teamEmployeeIds, onNotify }) {
  const isApprover = access.canApproveTeamRequests;
  const [tab, setTab] = useState('summary');
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewPersonal, setViewPersonal] = useState(false);

  const logs = useMemo(() => scopeRows(logsForMany(data, teamEmployeeIds), { access, user, viewPersonal }), [data, teamEmployeeIds, access, user, viewPersonal]);
  const { decorate } = employeeColumns(employees);
  const rows = useMemo(() => otEarningRows(logs).map(decorate).filter(row => matches(row, table, ['date', 'employeeCode', 'name', 'department'])), [logs, employees, table.search, table.filters]);
  const pageRows = paginate(rows, table.page, table.pageSize);
  const withEmployee = isApprover;

  function exportRows(format) {
    const headers = ['Date', 'Overtime Hours', 'OT Meal Allowance', 'OT Transportation Allowance (Home Location)', 'OT Allowance', 'OT Meal and Transpo Allowance', 'Hazard Pay', 'Snack', 'Fixed Transportation Allowance', 'Total OT Earnings'];
    downloadFile(`ot-with-earning-condition.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows.map(row => [
      formatDate(row.date), row.overtimeHours, row.otMealAllowance, row.otTransportationAllowance, row.otAllowance, row.otMealAndTranspo, row.hazardPay, row.snack, row.fixedTransportationAllowance, row.totalOtEarnings,
    ])));
    onNotify(`OT with earning condition exported to ${format}.`);
  }

  const moneyKeys = ['otMealAllowance', 'otTransportationAllowance', 'otAllowance', 'otMealAndTranspo', 'hazardPay', 'snack', 'fixedTransportationAllowance', 'totalOtEarnings'];

  return <div className="hrm-workspace tk-screen">
    <PageHeading title={isApprover ? 'OT With Earning Condition Management' : 'OT With Earning Condition Summary'} />
    {isApprover && <SegmentedTabs
      tabs={[{ key: 'summary', label: 'Summary' }, { key: 'logs', label: 'OT with Earning Logs' }]}
      value={tab}
      onChange={setTab}
      ariaLabel="OT with earning condition"
    />}
    <TkToolbar table={table} onFilter={() => setDrawerOpen(true)}>
      {isApprover && <PersonalToggle checked={viewPersonal} onChange={setViewPersonal} />}
      <ExportMenu onExport={exportRows} disabled={rows.length === 0} />
    </TkToolbar>
    <DataTable
      columns={[
        { key: 'date', label: 'Date', type: 'date' },
        ...(withEmployee ? [{ key: 'employeeCode', label: 'Employee Code' }, { key: 'name', label: 'Full Name' }, { key: 'department', label: 'Department/Division' }] : []),
        { key: 'overtimeHours', label: tab === 'logs' ? 'Total OT Hours' : 'Overtime Hours' },
        { key: 'otMealAllowance', label: 'OT Meal Allowance' },
        { key: 'otTransportationAllowance', label: 'OT Transportation Allowance (Home Location)' },
        { key: 'otAllowance', label: 'OT Allowance' },
        { key: 'otMealAndTranspo', label: 'OT Meal and Transpo Allowance' },
        { key: 'hazardPay', label: 'Hazard Pay' },
        { key: 'snack', label: 'Snack' },
        { key: 'fixedTransportationAllowance', label: 'Fixed Transportation Allowance' },
        { key: 'totalOtEarnings', label: 'Total OT Earnings' },
      ]}
      rows={pageRows}
      total={rows.length}
      rowKey={row => row.key}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No approved overtime earned an allowance in this range."
      renderCell={(row, column) => {
        if (column.key === 'employeeCode') return <span className="tk-code-link">{row.employeeCode}</span>;
        if (moneyKeys.includes(column.key)) return peso(row[column.key]);
        if (column.key === 'overtimeHours') return row.overtimeHours.toFixed(2);
        return formatCell(row[column.key], column.type);
      }}
    />
    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'overtimeHours', label: 'Overtime Hours' },
        { key: 'otMealAllowance', label: 'OT Meal Allowance' },
        { key: 'otTransportationAllowance', label: 'OT Transportation Allowance (Home Location)' },
        { key: 'otAllowance', label: 'OT Allowance' },
        { key: 'otMealAndTranspo', label: 'OT Meal and Transpo Allowance' },
        { key: 'hazardPay', label: 'Hazard Pay' },
        { key: 'snack', label: 'Snack' },
        { key: 'fixedTransportationAllowance', label: 'Fixed Transportation Allowance' },
        { key: 'totalOtEarnings', label: 'Total OT Earnings' },
      ]}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

/* ------------------------------------------- 11. Others (timekeeping disputes) */

function OthersScreen({ data, setData, user, access, teamEmployeeIds, onNotify }) {
  const settings = data.timekeeping || {};
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [disputing, setDisputing] = useState(null);
  const [viewingLogsFor, setViewingLogsFor] = useState('');

  const rows = useMemo(() => {
    const scoped = scopeRows((data.tkDisputes || []).filter(row => teamEmployeeIds.includes(row.employeeId)), { access, user, viewPersonal: !access.canApproveTeamRequests });
    return scoped.filter(row => matches(row, table, ['originalDate', 'type', 'status', 'remarks']));
  }, [data.tkDisputes, teamEmployeeIds, access, user, table.search, table.filters]);
  const pageRows = paginate(rows, table.page, table.pageSize);
  const viewing = viewingLogsFor ? (data.tkDisputes || []).find(row => row.disputeId === viewingLogsFor) : null;

  return <div className="hrm-workspace tk-screen">
    <PageHeading title="Others" />
    <div className="tk-cutoff-banner">
      <p><strong>Current Cut-off Date:</strong> {settings.currentCutoffDate}</p>
      <p><strong>Locked Cut-off Periods:</strong> {(settings.lockedCutoffPeriods || []).join(', ')}</p>
      <p>Entries submitted beyond the current cut-off are automatically carried over. The last two cut-off periods are locked for regular edits.</p>
    </div>
    <TkToolbar table={table} onFilter={() => setDrawerOpen(true)} />
    <DataTable
      columns={[
        { key: 'originalDate', label: 'Original Date', type: 'date' },
        { key: 'type', label: 'Type' },
        { key: 'hoursAmount', label: 'Hours/Amount' },
        { key: 'remarks', label: 'Remarks' },
        { key: 'status', label: 'Status' },
        { key: 'carryOverStatus', label: 'Carry-over Status' },
      ]}
      rows={pageRows}
      total={rows.length}
      rowKey={row => row.disputeId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No timekeeping entries for this cut-off."
      renderCell={(row, column) => {
        if (column.key === 'originalDate') return <span className="tk-locked">{row.locked ? <LockSimple size={13} weight="fill" /> : <Path size={13} />}{formatDate(row.originalDate)}</span>;
        if (column.key === 'hoursAmount') return row.hoursAmount.toFixed(2);
        if (column.key === 'status') return <span className={`tk-dispute-status ${row.status.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{row.status}</span>;
        return formatCell(row[column.key], column.type);
      }}
      actions={row => (row.status === 'Disputed' || row.status === 'Dispute Approved' || row.status === 'Dispute Rejected'
        ? [{ label: 'View Logs', kind: 'view', onSelect: () => setViewingLogsFor(row.disputeId) }]
        : [
            { label: 'Dispute', kind: 'edit', onSelect: () => setDisputing(row) },
            { label: 'View Logs', kind: 'view', onSelect: () => setViewingLogsFor(row.disputeId) },
          ])}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'originalDate', label: 'Original Date', type: 'date' },
        { key: 'type', label: 'Type', options: [...TK_DISPUTE_TYPES] },
        { key: 'hoursAmount', label: 'Hours/Amount' },
        { key: 'status', label: 'Status', options: ['Approved', 'Carried Over', 'Disputed', 'Dispute Approved', 'Dispute Rejected'] },
      ]}
      value={table.filters}
      onApply={value => { table.setFilters(value); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {disputing && <SubmitDisputeModal
      entry={disputing}
      onClose={() => setDisputing(null)}
      onSubmit={reason => {
        setData(current => ({
          ...current,
          tkDisputes: (current.tkDisputes || []).map(row => (row.disputeId === disputing.disputeId
            ? {
                ...row,
                status: 'Disputed',
                remarks: reason,
                logs: [...(row.logs || []), { at: new Date().toLocaleString(), actor: user.displayName, action: 'Dispute Submitted', remarks: reason }],
              }
            : row)),
        }));
        setDisputing(null);
        onNotify('Dispute submitted successfully!');
      }}
    />}

    {viewing && <Modal title="View Logs" onClose={() => setViewingLogsFor('')} footer={<GhostButton onClick={() => setViewingLogsFor('')}>Close</GhostButton>}>
      <ul className="tk-log-list">
        {(viewing.logs || []).map((entry, index) => <li key={`${entry.at}-${index}`}>
          <span className="tk-log-at">{entry.at}</span>
          <div>
            <strong>{entry.actor}</strong>
            <p>{entry.action}</p>
            <p className="muted"><strong>Remarks:</strong> {entry.remarks}</p>
          </div>
        </li>)}
      </ul>
    </Modal>}
  </div>;
}

function SubmitDisputeModal({ entry, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [files, setFiles] = useState([]);
  return <Modal
    title="Submit Dispute"
    onClose={onClose}
    footer={<><GhostButton onClick={onClose}>Cancel</GhostButton><button type="button" className="hrm-btn primary" onClick={() => {
      if (!reason.trim()) { setError('Required'); return; }
      onSubmit(reason.trim());
    }}>Submit</button></>}
  >
    <p>You are submitting a dispute for the transaction on {formatDate(entry.originalDate)} (Type: {entry.type}, Hours: {entry.hoursAmount.toFixed(2)}).</p>
    <Field label="Reason for Dispute" required error={error}>
      <input value={reason} placeholder="e.g., Initial submission of overtime dispute" onChange={event => { setReason(event.target.value); setError(''); }} />
    </Field>
    <Field label="Supporting Documents">
      <input
        type="file"
        multiple
        onChange={event => setFiles(Array.from(event.target.files || []).map(file => file.name))}
      />
    </Field>
    {files.length > 0 && <p className="muted">{files.join(', ')}</p>}
  </Modal>;
}

/* ---------------------------------------------------------- 12. Announcements */

function AnnouncementsScreen({ data, setData }) {
  const announcements = data.announcements || [];
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(announcements[0]?.announcementId || '');

  const shown = announcements
    .filter(row => (tab === 'Unread' ? !row.read : true))
    .filter(row => row.title.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = announcements.find(row => row.announcementId === selectedId) || shown[0];

  return <div className="hrm-workspace tk-screen">
    <PageHeading title="Announcements" />
    <SearchInput value={search} onChange={setSearch} />
    <div className="tk-announcements">
      <div className="tk-announcement-list">
        <SegmentedTabs tabs={['All', 'Unread']} value={tab} onChange={setTab} ariaLabel="Announcements" />
        {shown.length === 0 && <EmptyState title="No announcements">Nothing has been published for this filter.</EmptyState>}
        {shown.map(row => <button
          key={row.announcementId}
          type="button"
          className={`tk-announcement-item ${selected?.announcementId === row.announcementId ? 'selected' : ''}`}
          onClick={() => {
            setSelectedId(row.announcementId);
            setData(current => ({ ...current, announcements: (current.announcements || []).map(item => (item.announcementId === row.announcementId ? { ...item, read: true } : item)) }));
          }}
        >
          {!row.read && <span className="tk-unread-dot" aria-label="Unread" />}
          <span className="tk-announcement-title">{row.title}</span>
          <span className="tk-announcement-meta">{row.author}</span>
          <span className="tk-announcement-excerpt">{row.excerpt}</span>
          <span className="tk-announcement-date">{formatDate(row.publishedAt)}</span>
        </button>)}
      </div>
      <article className="tk-announcement-body">
        {selected
          ? <>
              <h2>{selected.title}</h2>
              <p className="muted">by <strong>{selected.author}</strong> · Published {formatDate(selected.publishedAt)} {selected.publishedTime}</p>
              {selected.body.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </>
          : <EmptyState title="Select an announcement">Pick an item on the left to read it.</EmptyState>}
      </article>
    </div>
  </div>;
}

/* -------------------------------------------------------------- dispatcher */

/** Route key → screen. The portal's tile grid reads the same map. */
export const timekeepingScreens = Object.freeze({
  'time-in-out': TimeInOutScreen,
  'attendance-summary': TimeAttendanceSummaryScreen,
  'shift-schedule': ShiftScheduleScreen,
  reports: TimekeepingReportsScreen,
  'work-hours': WorkHoursComparisonScreen,
  'ytd-metrics': YearToDateMetricsScreen,
  'charge-code': ChargeCodesScreen,
  absence: AbsenceScreen,
  leaves: LeavesScreen,
  tardiness: TardinessUndertimeScreen,
  overtime: OvertimeScreen,
  'ot-earning': OtEarningConditionScreen,
  others: OthersScreen,
  announcements: AnnouncementsScreen,
});

export function TimekeepingWorkspace({ screenKey, ...props }) {
  const Screen = timekeepingScreens[screenKey];
  if (!Screen) return <EmptyState title="Screen not found">This Timekeeping screen has no route.</EmptyState>;
  return <Screen {...props} />;
}
