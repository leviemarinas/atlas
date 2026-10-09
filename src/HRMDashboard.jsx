/**
 * The HRM dashboard.
 *
 * The masterfile's landing screen: the greeting, the module chips, the punch
 * clock, and a two-column widget grid.  Employee and Administrator see the
 * same widgets with different scope — an employee sees their own balances as
 * cards, an administrator sees the roster as a table — so each widget takes
 * the scope rather than being written twice.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Eye,
  Gear,
  Timer,
} from '@phosphor-icons/react';
import {
  DASHBOARD_WIDGETS,
  LEAVE_TYPES,
  findEmployee,
  leaveBalancesFor,
  mdoBalanceFor,
  toggleDashboardWidget,
} from './hrmData.js';
import {
  BarChart,
  Field,
  Gauge,
  GhostButton,
  LineChart,
  Modal,
  SearchInput,
  SegmentedTabs,
  StatCard,
  StatCardRow,
  Widget,
  formatDate,
  formatLongDate,
  initialsOf,
  shortStatus,
} from './HRMKit.jsx';

/* ------------------------------------------------------------- punch clock */

const pad = value => String(value).padStart(2, '0');

function elapsed(fromIso, now) {
  if (!fromIso) return '00:00:00';
  const seconds = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

/**
 * The time clock ticks from the stored punch timestamps, so the elapsed
 * figures survive a reload instead of restarting from zero.
 */
function TimeClock({ clock, onPunch }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const isIn = Boolean(clock.punchedInAt);
  const onBreak = Boolean(clock.breakStartedAt);
  return <div className="hrm-clock-row">
    <div className="hrm-clock primary">
      <span>Time Logged In</span>
      <strong><Timer size={19} weight="bold" /> {elapsed(clock.punchedInAt, now)}</strong>
      <button type="button" onClick={() => onPunch(isIn ? 'out' : 'in')}>{isIn ? 'Punch Out' : 'Punch In'}</button>
    </div>
    <div className="hrm-clock">
      <span>Break Time In</span>
      <strong><Timer size={19} weight="bold" /> {elapsed(clock.breakStartedAt, now)}</strong>
      <button type="button" disabled={!isIn} onClick={() => onPunch(onBreak ? 'break-end' : 'break-start')}>
        {onBreak ? 'Break Out' : 'Break In'}
      </button>
    </div>
  </div>;
}

/* ---------------------------------------------------------------- widgets */

function ProfileWidget({ user, employee, attendance, onPunch, onOpen201 }) {
  return <>
    <div className="hrm-profile-card">
      <span className="hrm-avatar-lg">{user.initials}</span>
      <div>
        <h2>{user.displayName}</h2>
        <p><strong>{employee?.position}</strong> | {employee?.department}</p>
        <p className="muted">Employee ID: {employee?.employeeCode}</p>
        {attendance.lastLoggedInAt && <p className="muted">Last logged in at {formatDate(attendance.lastLoggedInAt.slice(0, 10))} {new Date(attendance.lastLoggedInAt).toLocaleTimeString('en-PH')}</p>}
        <button type="button" className="hrm-201-button" onClick={onOpen201}><Eye size={14} /> View 201 File</button>
      </div>
    </div>
    <TimeClock clock={attendance.clock} onPunch={onPunch} />
  </>;
}

function AttendanceWidget({ attendance }) {
  const [range, setRange] = useState('Monthly');
  const monthly = attendance.monthly || [];
  return <Widget title="My Attendance Summary" actions={<SegmentedTabs tabs={['Monthly', 'Yearly']} value={range} onChange={setRange} ariaLabel="Attendance range" />}>
    <BarChart
      labels={monthly.map(row => row.month)}
      series={[
        { label: 'Absent', color: '#4c1d95', points: monthly.map(row => row.absent) },
        { label: 'Late', color: '#a97bf0', points: monthly.map(row => row.late) },
      ]}
    />
  </Widget>;
}

/** Employee sees their own balance cards; an administrator sees the roster. */
function LeaveWidget({ data, requests = [], employeeId, isAdmin, onSeeMore }) {
  if (isAdmin) {
    const types = LEAVE_TYPES.slice(0, 3);
    return <Widget title="YTD Leave Balances" onExpand={onSeeMore}>
      <table className="hrm-table compact">
        <thead><tr><th>Name</th>{types.map(type => <th key={type} className="align-right">{type}</th>)}</tr></thead>
        <tbody>
          {(data.employees || []).slice(0, 5).map(employee => {
            const balances = leaveBalancesFor(data, employee.employeeId, requests);
            return <tr key={employee.employeeId}>
              <td><span className="hrm-approver"><span className="hrm-avatar-sm">{employee.initials}</span>{employee.name}</span></td>
              {types.map(type => <td key={type} className="align-right">{balances.find(row => row.leaveType === type)?.remaining ?? 0}</td>)}
            </tr>;
          })}
        </tbody>
      </table>
      <button type="button" className="hrm-see-more" onClick={onSeeMore}>See more</button>
    </Widget>;
  }
  const balances = leaveBalancesFor(data, employeeId, requests);
  return <Widget title="YTD Leave Balances" onExpand={onSeeMore}>
    <StatCardRow>
      {balances.map(balance => <StatCard key={balance.leaveType} label={balance.leaveType} value={balance.remaining} unit="days" />)}
    </StatCardRow>
  </Widget>;
}

function MdoWidget({ data, employeeId, isAdmin, onSeeMore }) {
  if (isAdmin) {
    return <Widget title="Mandatory Time Off Balances" onExpand={onSeeMore}>
      <table className="hrm-table compact">
        <thead><tr><th>Name</th><th className="align-right">Earned</th><th className="align-right">Used</th><th className="align-right">Remaining</th></tr></thead>
        <tbody>
          {(data.employees || []).slice(0, 5).map(employee => {
            const balance = mdoBalanceFor(data, employee.employeeId) || {};
            return <tr key={employee.employeeId}>
              <td><span className="hrm-approver"><span className="hrm-avatar-sm">{employee.initials}</span>{employee.name}</span></td>
              <td className="align-right">{balance.earned ?? 0}</td>
              <td className="align-right">{balance.used ?? 0}</td>
              <td className="align-right">{balance.remaining ?? 0}</td>
            </tr>;
          })}
        </tbody>
      </table>
      <button type="button" className="hrm-see-more" onClick={onSeeMore}>See more</button>
    </Widget>;
  }
  const balance = mdoBalanceFor(data, employeeId) || {};
  return <Widget title="Mandatory Time Off Balances" onExpand={onSeeMore}>
    <StatCardRow>
      {[['Total', balance.earned], ['Used', balance.used], ['Remaining', balance.remaining], ['Scheduled', balance.scheduled], ['Forfeited', balance.forfeited]]
        .map(([label, value]) => <StatCard key={label} label={label} value={value ?? 0} unit="days" />)}
    </StatCardRow>
  </Widget>;
}

function MetricsWidget({ attendance }) {
  const metrics = attendance.yearToDate || {};
  return <Widget title="Year-to-Date Metrics">
    <div className="hrm-stat-grid three">
      <StatCard label="Absent" value={metrics.absent ?? 0} unit="Days" />
      <StatCard label="Tardiness" value={metrics.tardiness ?? 0} unit="Days" />
      <StatCard label="Leaves" value={metrics.leaves ?? 0} unit="Days" />
    </div>
  </Widget>;
}

function WorkHoursWidget({ attendance }) {
  const work = attendance.workHours || {};
  const weekly = work.weekly || [];
  const down = Number(work.productivityChange) < 0;
  return <Widget title="Work Hours Comparison">
    <div className="hrm-inline-metrics">
      <div><span>Total Work Time (in Hrs)</span><strong>{work.totalHours}</strong></div>
      <div><span>Avg. Work Time (in Hrs)</span><strong>{work.averageHours}</strong></div>
      <div><span>Productivity Change</span><strong className={down ? 'down' : 'up'}>{work.productivityChange}% {down ? '▼' : '▲'}</strong></div>
    </div>
    <BarChart
      showLegend={false}
      labels={weekly.map(row => row.label)}
      series={[{ label: 'Hours', color: '#6d3bd4', points: weekly.map(row => row.hours) }]}
    />
  </Widget>;
}

function HappinessWidget({ attendance, onRate }) {
  const mood = attendance.happiness || {};
  return <Widget title="Happiness Meter">
    <div className="hrm-gauge-row">
      <Gauge title="My Daily Mood" rating={mood.dailyRating} label={mood.dailyLabel} caption={`Rating: ${mood.dailyRating}`} />
      <Gauge title="My Monthly Average Mood" rating={mood.monthlyAverage} label={String(mood.monthlyAverage)} caption={mood.monthlyLabel} />
    </div>
    <div className="hrm-mood-picker">
      <span>How is your day going?</span>
      <div>
        {[1, 2, 3, 4, 5].map(rating => <button key={rating} type="button" onClick={() => onRate(rating)} aria-label={`Rate ${rating} of 5`}>
          {['😭', '🙁', '😐', '🙂', '🤩'][rating - 1]}
        </button>)}
      </div>
    </div>
  </Widget>;
}

function TasksWidget({ tasks, onToggle }) {
  const [search, setSearch] = useState('');
  const shown = tasks.filter(task => !search || task.title.toLowerCase().includes(search.toLowerCase()));
  const pending = tasks.filter(task => !task.done);
  const todayIso = new Date().toISOString().slice(0, 10);
  return <Widget title="All Pending Tasks" count={pending.length}>
    <div className="hrm-widget-toolbar"><SearchInput value={search} onChange={setSearch} /></div>
    <ul className="hrm-task-list">
      {shown.length === 0 && <li className="hrm-task-empty">No tasks match that search.</li>}
      {shown.map(task => {
        const overdue = !task.done && task.dueDate < todayIso;
        return <li key={task.taskId} className={task.done ? 'done' : ''}>
          <label>
            <input type="checkbox" checked={task.done} onChange={() => onToggle(task.taskId)} />
            <span className="hrm-task-title">{task.title}</span>
          </label>
          <span className={`hrm-task-due ${overdue ? 'overdue' : ''}`}>
            <CalendarBlank size={12} /> {task.dueLabel || formatDate(task.dueDate)}
          </span>
        </li>;
      })}
    </ul>
  </Widget>;
}

function ApprovalsWidget({ requests, data, onOpen }) {
  const [search, setSearch] = useState('');
  const pending = requests.filter(request => shortStatus(request.status) === 'Pending');
  const shown = pending.filter(request => !search || request.requestTypeLabel.toLowerCase().includes(search.toLowerCase()));
  return <Widget title="All Pending Approvals" count={pending.length} onExpand={onOpen}>
    <div className="hrm-widget-toolbar"><SearchInput value={search} onChange={setSearch} /></div>
    <table className="hrm-table compact">
      <thead><tr><th>Title</th><th>Approval Type</th></tr></thead>
      <tbody>
        {shown.length === 0 && <tr><td colSpan={2} className="hrm-table-empty">Nothing is awaiting a decision.</td></tr>}
        {shown.slice(0, 8).map(request => <tr key={request.requestId}>
          <td><button type="button" className="hrm-link" onClick={onOpen}>{findEmployee(data, request.employeeId)?.name || request.employeeId}</button></td>
          <td>{request.requestTypeLabel}</td>
        </tr>)}
      </tbody>
    </table>
  </Widget>;
}

function WellnessWidget({ data, isAdmin, onOpen }) {
  const events = data.wellness?.events || [];
  const engagement = data.wellness?.engagement || [];
  const [range, setRange] = useState('Weekly');
  if (isAdmin) {
    const weekly = engagement.length ? engagement[engagement.length - 1].may : 0;
    const monthly = engagement.length ? engagement.reduce((sum, row) => sum + row.may, 0) / engagement.length : 0;
    return <Widget title="Health and Wellness" onExpand={onOpen}>
      <div className="hrm-stat-grid two">
        <StatCard label="Avg Weekly Participation Rate" value={`${weekly.toFixed(2)}%`} />
        <StatCard label="Avg Monthly Participation Rate" value={`${monthly.toFixed(2)}%`} />
      </div>
      <SegmentedTabs tabs={['Weekly', 'Monthly']} value={range} onChange={setRange} ariaLabel="Participation range" />
      <LineChart
        labels={engagement.map(row => row.period)}
        series={[
          { label: 'Apr', color: '#a97bf0', points: engagement.map(row => row.apr) },
          { label: 'May', color: '#4c1d95', points: engagement.map(row => row.may) },
        ]}
      />
    </Widget>;
  }
  return <Widget title="Health and Wellness" onExpand={onOpen}>
    <ul className="hrm-wellness-mini">
      {events.slice(0, 3).map(event => <li key={event.id}>
        <p className="hrm-wellness-kind">{event.kind}</p>
        <button type="button" className="hrm-link" onClick={onOpen}>{event.title}</button>
        <p className="hrm-wellness-meta">
          <span className="hrm-avatar-sm">{initialsOf(event.department)}</span>{event.department}
          {event.startDate && <><span className="hrm-dot" /><CalendarBlank size={12} /> {formatLongDate(event.startDate)} - {formatLongDate(event.endDate)}</>}
        </p>
        <p className="hrm-wellness-body clamp">{event.body}</p>
        {event.kind === 'Event' && <button type="button" className="hrm-btn primary tiny" onClick={onOpen}>Join Event</button>}
      </li>)}
    </ul>
  </Widget>;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function CalendarWidget({ data, onOpen }) {
  const [cursor, setCursor] = useState({ year: 2026, month: 9 });
  const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const cells = Array.from({ length: 35 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return { iso: day.toISOString().slice(0, 10), day: day.getUTCDate(), inMonth: day.getUTCMonth() === cursor.month };
  });
  const monthName = new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric' }).format(first);
  const dated = new Set((data.calendarEvents || []).map(event => event.date));
  const shift = delta => setCursor(current => {
    const next = new Date(Date.UTC(current.year, current.month + delta, 1));
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
  });
  return <Widget title="Calendar" onExpand={onOpen}>
    <div className="hrm-mini-cal-bar">
      <button type="button" onClick={() => shift(-1)} aria-label="Previous month"><CaretLeft size={13} weight="bold" /></button>
      <strong>{monthName}</strong>
      <button type="button" onClick={() => shift(1)} aria-label="Next month"><CaretRight size={13} weight="bold" /></button>
    </div>
    <div className="hrm-mini-cal">
      {WEEKDAYS.map(day => <span key={day} className="hrm-mini-cal-weekday">{day}</span>)}
      {cells.map(cell => <button
        key={cell.iso}
        type="button"
        className={`hrm-mini-cal-day ${cell.inMonth ? '' : 'muted'} ${dated.has(cell.iso) ? 'has-event' : ''}`}
        onClick={onOpen}
      >{cell.day}</button>)}
    </div>
  </Widget>;
}

/* -------------------------------------------------------------- dashboard */

export function HRMDashboard({ data, setData, requests, user, access, onOpenWorkspace, onNotify }) {
  const [managing, setManaging] = useState(false);
  const [viewing201, setViewing201] = useState(false);

  const employee = findEmployee(data, user.employeeId);
  const attendance = data.attendance || {};
  const selected = data.dashboardWidgets || [];
  const isAdmin = access.canViewCompanyData;
  const scopedRequests = useMemo(
    () => requests.filter(request => isAdmin || request.employeeId !== user.employeeId),
    [requests, isAdmin, user.employeeId],
  );

  const shows = key => selected.includes(key);

  function punch(action) {
    const stamp = new Date().toISOString();
    setData(current => {
      const clock = { ...current.attendance.clock };
      if (action === 'in') { clock.punchedInAt = stamp; clock.breakStartedAt = ''; }
      if (action === 'out') { clock.punchedInAt = ''; clock.breakStartedAt = ''; clock.lastPunchOutAt = stamp; }
      if (action === 'break-start') clock.breakStartedAt = stamp;
      if (action === 'break-end') clock.breakStartedAt = '';
      return { ...current, attendance: { ...current.attendance, clock } };
    });
    onNotify(action === 'in' ? 'Punched in.' : action === 'out' ? 'Punched out.' : action === 'break-start' ? 'Break started.' : 'Break ended.');
  }

  function toggleTask(taskId) {
    setData(current => ({ ...current, tasks: current.tasks.map(task => task.taskId === taskId ? { ...task, done: !task.done } : task) }));
  }

  function rateMood(rating) {
    const labels = { 1: 'Very low', 2: 'Low', 3: 'Neutral', 4: 'Good', 5: 'Perfect' };
    setData(current => ({ ...current, attendance: { ...current.attendance, happiness: { ...current.attendance.happiness, dailyRating: rating, dailyLabel: labels[rating] } } }));
    onNotify('Mood recorded for today.');
  }

  return <div className="hrm-dashboard">
    <h1 className="hrm-greeting">Welcome, {user.displayName.split(' ')[0]} {user.displayName.split(' ').slice(-1)}!</h1>
    <div className="hrm-dash-bar">
      <button type="button" className="hrm-link-button" onClick={() => setManaging(true)}><Gear size={15} /> Manage widgets</button>
    </div>

    <div className="hrm-dash-grid">
      <div className="hrm-dash-col">
        {shows('profile') && <ProfileWidget user={user} employee={employee} attendance={attendance} onPunch={punch} onOpen201={() => setViewing201(true)} />}
        {shows('attendance') && <AttendanceWidget attendance={attendance} />}
        {shows('metrics') && <MetricsWidget attendance={attendance} />}
        {shows('workHours') && <WorkHoursWidget attendance={attendance} />}
        {shows('leave') && <LeaveWidget data={data} requests={requests} employeeId={user.employeeId} isAdmin={isAdmin} onSeeMore={() => onOpenWorkspace('self-inquiry')} />}
        {shows('mdo') && <MdoWidget data={data} employeeId={user.employeeId} isAdmin={isAdmin} onSeeMore={() => onOpenWorkspace('mdo')} />}
        {shows('happiness') && <HappinessWidget attendance={attendance} onRate={rateMood} />}
      </div>
      <div className="hrm-dash-col">
        {shows('tasks') && <TasksWidget tasks={data.tasks || []} onToggle={toggleTask} />}
        {shows('approvals') && <ApprovalsWidget requests={scopedRequests} data={data} onOpen={() => onOpenWorkspace('approvals')} />}
        {shows('wellness') && <WellnessWidget data={data} isAdmin={isAdmin} onOpen={() => onOpenWorkspace('wellness')} />}
        {shows('calendar') && <CalendarWidget data={data} onOpen={() => onOpenWorkspace('calendar')} />}
      </div>
    </div>

    {managing && <Modal title="Manage widgets" onClose={() => setManaging(false)} footer={<GhostButton onClick={() => setManaging(false)}>Done</GhostButton>}>
      <p className="hrm-modal-message">Choose the widgets shown on your dashboard. Your profile and time clock always stay visible.</p>
      <ul className="hrm-widget-picker">
        {DASHBOARD_WIDGETS.map(widget => <li key={widget.key}>
          <label>
            <input
              type="checkbox"
              checked={selected.includes(widget.key)}
              disabled={widget.locked}
              onChange={() => setData(current => ({ ...current, dashboardWidgets: toggleDashboardWidget(current.dashboardWidgets, widget.key) }))}
            />
            <span>{widget.label}</span>
          </label>
          {widget.locked && <em>Always shown</em>}
        </li>)}
      </ul>
    </Modal>}

    {viewing201 && <Modal title="201 File" onClose={() => setViewing201(false)} footer={<GhostButton onClick={() => setViewing201(false)}>Close</GhostButton>}>
      <div className="hrm-form-grid">
        <Field label="Employee Name"><input value={employee?.name || ''} readOnly disabled /></Field>
        <Field label="Employee Code"><input value={employee?.employeeCode || ''} readOnly disabled /></Field>
        <Field label="Position"><input value={employee?.position || ''} readOnly disabled /></Field>
        <Field label="Department"><input value={employee?.department || ''} readOnly disabled /></Field>
        <Field label="Employment Type"><input value={employee?.employmentType || ''} readOnly disabled /></Field>
        <Field label="Status"><input value={employee?.status || ''} readOnly disabled /></Field>
      </div>
      <p className="hrm-modal-message">The full 201 file lives in Employee Masterfile; this summary is read-only here.</p>
    </Modal>}
  </div>;
}
