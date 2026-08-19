/**
 * The Timekeeping module shell (P&A Timekeeping Module Part 1).
 *
 * Renders the dashboard widgets, the gradient Timekeeping banner and the tile
 * grid, then routes into the screens in `TimekeepingScreens.jsx`.  Like HRM,
 * this is a real signed-in experience: the identity comes from the application
 * session and the Client / P&A Admin switch in the shared top bar is the only
 * thing that changes what the module shows.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  ChartBar,
  ChartLine,
  ClockCounterClockwise,
  Coffee,
  FileText,
  Receipt,
  SquaresFour,
  Star,
  Suitcase,
  Timer,
  HourglassMedium,
  UserMinus,
} from '@phosphor-icons/react';
import { BrandRail, Topbar } from './AppChrome';
import { useRole } from './RoleContext';
import { BarChart, DataTable, SearchInput, Toasts, Widget, paginate, useTableState, useToasts } from './HRMKit.jsx';
import { accessFor, readHrmData, signedInUser, updateHrmData, visibleEmployeeIds } from './hrmData.js';
import { canViewReportsTile } from './moduleAccess.js';
import { TimekeepingWorkspace } from './TimekeepingScreens.jsx';
import { ChargeCodesSidebar, ChargeCodesWorkspace } from './TimekeepingChargeCodes.jsx';
import {
  attendanceKpis,
  hoursToClock,
  logsFor,
  workHoursSeries,
  workHoursSummary,
  ytdAbsences,
  ytdHoursWorked,
  ytdLeaves,
  ytdTardiness,
} from './timekeepingData.js';

/** The tiles the Timekeeping landing grid offers. */
const moduleTiles = [
  { key: 'time-in-out', label: 'Time In & Time Out', icon: Timer },
  { key: 'attendance-summary', label: 'Time & Attendance Summary', icon: ClockCounterClockwise },
  { key: 'shift-schedule', label: 'Shift Schedule Tracking', icon: CalendarCheck },
  { key: 'work-hours', label: 'Work Hours Comparison', icon: ChartBar },
  { key: 'ytd-metrics', label: 'Year-to-Date Metrics', icon: ChartLine },
  { key: 'charge-code', label: 'Charge Code', icon: Receipt },
  { key: 'absence', label: 'Absence Management', icon: UserMinus },
  { key: 'leaves', label: 'Leaves Management', icon: Suitcase },
  { key: 'tardiness', label: 'Tardiness/Undertime Management', icon: HourglassMedium },
  { key: 'overtime', label: 'Overtime Summary', icon: Coffee },
  { key: 'ot-earning', label: 'OT With Earning Condition', icon: Star },
  // The TK Reports Module BRD rows are 100% "P&A Admin, Client Admin" — the
  // bulk/export reporting suite is a separate feature from the DTR Summary and
  // leave-ledger self-inquiry every actor already keeps under Time & Attendance
  // Summary, which the BRD marks "All users" / "Client Approver, P&A Admin,
  // Client Admin" in its own module.
  { key: 'reports', label: 'Reports', icon: FileText, adminOnly: true },
  { key: 'others', label: 'Others', icon: SquaresFour },
];

export function timekeepingTilesFor(access) {
  return moduleTiles.filter(tile => !tile.adminOnly || canViewReportsTile(access));
}

function TimekeepingLanding({ user, access, onOpen }) {
  return <div className="hrm-landing">
    <div className="hrm-banner">
      <h1>Timekeeping</h1>
      <p>
        {access.canApproveTeamRequests
          ? `Team attendance logs, missing punches, charge codes and overtime for the reports of ${user.displayName}.`
          : `Punch in and out, review worked hours, absences, overtime and charge codes for ${user.displayName}.`}
      </p>
    </div>
    <div className="hrm-tile-grid">
      {timekeepingTilesFor(access).map(tile => {
        const Icon = tile.icon;
        return <button key={tile.key} type="button" className="hrm-tile" onClick={() => onOpen(tile.key)}>
          <Icon size={28} />
          <span>{tile.label}</span>
        </button>;
      })}
    </div>
  </div>;
}

/* -------------------------------------------------------------- dashboard */

function TimekeepingDashboard({ data, user, onOpen }) {
  const logs = useMemo(() => logsFor(data, user.employeeId), [data, user.employeeId]);
  const summary = useMemo(() => workHoursSummary(logs), [logs]);
  const weekly = useMemo(() => workHoursSeries(logs, 'Week'), [logs]);
  const kpis = useMemo(() => attendanceKpis(logs), [logs]);
  const table = useTableState(5);

  const recent = useMemo(
    () => logs.filter(row => {
      const term = table.search.trim().toLowerCase();
      return !term || [row.date, row.status, row.workLocation].some(value => String(value).toLowerCase().includes(term));
    }),
    [logs, table.search],
  );
  const pageRows = paginate(recent, table.page, table.pageSize);

  const ytdCards = [
    { label: 'Absent', value: ytdAbsences(logs).filter(row => row.absenceType === 'Excused' || row.absenceType === 'Unexcused').length, unit: 'days' },
    { label: 'Tardiness', value: ytdTardiness(logs).length, unit: 'days' },
    { label: 'Leaves', value: ytdLeaves(logs).length, unit: 'days' },
    { label: 'Hours Worked', value: Math.round(ytdHoursWorked(logs).reduce((total, row) => total + row.workedHours, 0)), unit: 'hours' },
  ];

  return <section className="hrm-dashboard">
    <h1 className="hrm-greeting">Welcome, {user.displayName}!</h1>
    <div className="hrm-dash-grid">
      <div className="hrm-dash-col">
      <Widget title="Work Hours Comparison" onExpand={() => onOpen('work-hours')}>
        <div className="tk-summary-metrics">
          <div><span>Total Hours Worked</span><strong>{summary.totalHoursWorked.toLocaleString()}</strong></div>
          <div><span>Average Hours Worked</span><strong>{summary.averageHoursWorked}</strong></div>
          <div><span>Productivity Change</span><strong className={summary.productivityUp ? 'tone-up' : 'tone-down'}>{summary.productivityChange}</strong></div>
        </div>
        <BarChart
          series={[{ label: 'Worked hours', color: '#4c1d95', points: weekly.points }]}
          labels={weekly.labels}
          showLegend={false}
        />
      </Widget>

      <Widget title="Year-to-Date Metrics" onExpand={() => onOpen('ytd-metrics')}>
        <div className="tk-kpi-row">
          {ytdCards.map(card => <div key={card.label} className="tk-kpi-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.unit}</small>
          </div>)}
        </div>
      </Widget>
      </div>
      <div className="hrm-dash-col">
      <Widget title="Time In & Time Out" onExpand={() => onOpen('time-in-out')}>
        <div className="tk-punch-grid compact">
          <div className="tk-punch-card active">
            <span>Time In &amp; Time Out</span>
            <strong>{hoursToClock(0)}:00</strong>
            <button type="button" onClick={() => onOpen('time-in-out')}>Punch In</button>
          </div>
          <div className="tk-punch-card break">
            <span>Break Time</span>
            <strong>{hoursToClock(0)}:00</strong>
            <button type="button" onClick={() => onOpen('time-in-out')}>Start Break</button>
          </div>
        </div>
      </Widget>

      <Widget title="Time & Attendance Summary" onExpand={() => onOpen('attendance-summary')}>
        <SearchInput value={table.search} onChange={table.setSearch} />
        <DataTable
          columns={[
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'timeIn', label: 'Time In' },
            { key: 'timeOut', label: 'Time Out' },
            { key: 'breakIn', label: 'Break In' },
            { key: 'breakOut', label: 'Break Out' },
          ]}
          rows={pageRows}
          total={recent.length}
          rowKey={row => row.logId}
          page={table.page}
          pageSize={table.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          empty="No punches recorded yet."
        />
      </Widget>
      </div>
    </div>
    <p className="tk-dashboard-note">Totals read {kpis.totalWorkedHours} worked hours across the punch record.</p>
  </section>;
}

/* ----------------------------------------------------------------- module */

export function TimekeepingPortal({ company, companies = [], companyId, onSelectCompany, onExit, onOpenHrm, notify }) {
  const { role } = useRole();
  const [route, setRoute] = useState({ view: 'home' });
  const [data, setDataState] = useState(() => readHrmData(companyId));
  const { toasts, push, dismiss } = useToasts();

  const user = useMemo(() => signedInUser(data), [data]);
  const access = useMemo(() => accessFor(role, data), [role, data]);
  const teamEmployeeIds = useMemo(() => visibleEmployeeIds(data, role), [data, role]);
  const employees = data.employees || [];

  const flash = (message, tone = 'ok') => {
    push(message, tone);
    notify?.({ type: tone === 'ok' ? 'success' : 'error', message });
  };

  useEffect(() => {
    setDataState(readHrmData(companyId));
    setRoute({ view: 'home' });
  }, [companyId]);

  // Switching experience returns to the tile grid: the employee and approver
  // grids do not resolve the same screens.
  useEffect(() => { setRoute({ view: 'home' }); }, [role]);

  const setData = updater => {
    const next = updateHrmData(companyId, typeof updater === 'function' ? updater : () => updater);
    setDataState(next);
    return next;
  };

  const goHome = () => setRoute({ view: 'home' });
  const inChargeCodes = route.view === 'charge-code';
  const openTile = moduleTiles.find(tile => tile.key === route.view);

  return <div className="app-shell core-screen hrm-shell">
    <BrandRail onHome={onExit} onCore={onExit} onHrm={onOpenHrm} onTime={goHome} onPayroll={() => onExit?.()} onSettings={() => onExit?.()} active="time" />
    {inChargeCodes && <ChargeCodesSidebar
      subView={route.subView || 'time-report-application'}
      access={access}
      onSelectSubView={subView => setRoute({ view: 'charge-code', subView })}
      onBack={goHome}
    />}
    <main className="shell-main hrm-main">
      <Topbar
        company={company}
        companies={companies}
        onSelectCompany={onSelectCompany}
        profileName={user.displayName}
        profileInitials={user.initials}
        onAnnouncements={() => setRoute({ view: 'announcements' })}
      />
      <div className="hrm-content">
        {route.view === 'home' && <>
          <TimekeepingDashboard
            data={data}
            user={user}
            onOpen={key => setRoute(key === 'charge-code' ? { view: 'charge-code', subView: 'time-report-application' } : { view: key })}
          />
          <TimekeepingLanding
            user={user}
            access={access}
            onOpen={key => setRoute(key === 'charge-code' ? { view: 'charge-code', subView: 'time-report-application' } : { view: key })}
          />
        </>}

        {inChargeCodes && <ChargeCodesWorkspace
          data={data}
          setData={setData}
          user={user}
          access={access}
          subView={route.subView || 'time-report-application'}
          onBack={goHome}
          onNotify={flash}
        />}

        {!inChargeCodes && route.view !== 'home' && <>
          <button type="button" className="hrm-btn ghost tk-back" onClick={goHome}>← Back to Timekeeping</button>
          <TimekeepingWorkspace
            screenKey={route.view}
            data={data}
            setData={setData}
            user={user}
            access={access}
            employees={employees}
            teamEmployeeIds={teamEmployeeIds}
            onNotify={flash}
          />
        </>}
      </div>
    </main>
    <Toasts toasts={toasts} onDismiss={dismiss} />
  </div>;
}

export { moduleTiles as timekeepingTiles };
