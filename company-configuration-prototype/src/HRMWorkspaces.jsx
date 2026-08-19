/**
 * The HRM feature workspaces reached from the module tile grid.
 *
 * Each one renders the employee view and the P&A Admin view of the same
 * dataset — the masterfile shows an admin roster that drills into exactly the
 * screen the employee sees for themselves, so both share one detail component.
 */

import { useMemo, useState } from 'react';
import {
  Bank,
  Briefcase,
  Buildings,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Certificate,
  CheckCircle,
  CheckSquare,
  Circle,
  CircleNotch,
  CurrencyCircleDollar,
  Door,
  DownloadSimple,
  Eye,
  FilePdf,
  FileText,
  Gift,
  Hand,
  Heart,
  Heartbeat,
  IdentificationCard,
  Medal,
  Paperclip,
  Question,
  Receipt,
  ShieldCheck,
  Suitcase,
  ThumbsDown,
  ThumbsUp,
  Trash,
  Umbrella,
  UserMinus,
  UserPlus,
} from '@phosphor-icons/react';
import {
  CALENDAR_CATEGORIES,
  LEAVE_TYPES,
  findEmployee,
  leaveBalancesFor,
  leaveHistoryFor,
  mdoBalanceFor,
  mdoHistoryFor,
  onboardingProgress,
  wellnessAnalyticsFor,
} from './hrmData.js';
import { approvalLogFor } from './hrmApplications.js';
import { REQUEST_STATUSES } from './requestWorkflow.js';
import { approveRequest, isActorAuthorizedForDecision, rejectRequest } from './requestService.js';
import { REQUEST_PERMISSIONS } from './requestWorkflow.js';
import { downloadFile } from './fileDownload.js';
import { peso } from './timekeepingData.js';
import {
  ApprovalLogModal,
  Breadcrumbs,
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
  LineChart,
  Modal,
  PageHeading,
  Pagination,
  PrimaryButton,
  SearchInput,
  SegmentedTabs,
  StatCard,
  StatCardRow,
  StatusTabs,
  StatusText,
  UploadArea,
  formatCell,
  formatDate,
  formatLongDate,
  formatTime,
  initialsOf,
  paginate,
  shortStatus,
  useTableState,
} from './HRMKit.jsx';

/** Stored request fields that route or identify a record rather than describe it. */
const INTERNAL_DETAIL_KEYS = new Set(['attachments', 'employeeName', 'statusDate', 'definitionKey', 'subordinateId', 'applyFor']);

const toCsv = (headers, rows) => [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

/* =============================================================== wellness == */

export function HealthWellnessWorkspace({ data, setData, user, access, onBack, onNotify }) {
  const isAdmin = access.canViewCompanyData;
  const [tab, setTab] = useState(isAdmin ? 'summary' : 'programs');
  const [openEvent, setOpenEvent] = useState(null);
  const [openEmployee, setOpenEmployee] = useState(null);

  const events = data.wellness?.events || [];
  const analytics = wellnessAnalyticsFor(data, user.employeeId);

  const employeeTabs = [{ key: 'programs', label: 'Programs' }, { key: 'analytics', label: 'My Analytics' }];
  const adminTabs = [{ key: 'summary', label: 'Summary' }, { key: 'engagement', label: 'Engagement' }, { key: 'events', label: 'Events' }];

  if (openEmployee) {
    return <EngagementAnalytics data={data} employeeId={openEmployee} onBack={() => setOpenEmployee(null)} onNotify={onNotify} />;
  }
  if (openEvent) {
    return <WellnessEventDetail data={data} setData={setData} event={openEvent} user={user} isAdmin={isAdmin} onBack={() => setOpenEvent(null)} onNotify={onNotify} />;
  }

  return <div className="hrm-workspace">
    <PageHeading title="Health and Wellness" onBack={onBack} />
    <SegmentedTabs tabs={isAdmin ? adminTabs : employeeTabs} value={tab} onChange={setTab} />

    {!isAdmin && tab === 'programs' && <WellnessFeed data={data} setData={setData} user={user} onOpen={setOpenEvent} onNotify={onNotify} />}
    {!isAdmin && tab === 'analytics' && <MyWellnessAnalytics analytics={analytics} data={data} />}
    {isAdmin && tab === 'summary' && <WellnessSummary data={data} onNotify={onNotify} />}
    {isAdmin && tab === 'engagement' && <WellnessEngagement data={data} onOpenEmployee={setOpenEmployee} onNotify={onNotify} />}
    {isAdmin && tab === 'events' && <WellnessEvents data={data} onOpen={setOpenEvent} onNotify={onNotify} />}
  </div>;
}

function interestFor(data, employeeId, eventId) {
  return (data.wellness?.interests || []).find(row => row.employeeId === employeeId && row.eventId === eventId) || null;
}

function WellnessFeed({ data, setData, user, onOpen }) {
  const events = data.wellness?.events || [];
  const table = useTableState();
  const pageRows = paginate(events, table.page, table.pageSize);
  return <div className="hrm-wellness-feed">
    {pageRows.map(event => {
      const interest = interestFor(data, user.employeeId, event.id);
      const interestedCount = (data.wellness?.interests || []).filter(row => row.eventId === event.id && row.interested).length;
      return <article key={event.id} className="hrm-wellness-card">
        <button type="button" className="hrm-wellness-card-open" onClick={() => onOpen(event)} aria-label={`Open ${event.title}`}><CaretRight size={16} /></button>
        <p className="hrm-wellness-kind">{event.kind}</p>
        <h3>{event.title}</h3>
        <p className="hrm-wellness-meta">
          <span className="hrm-avatar-sm">{initialsOf(event.department)}</span>{event.department}
          <span className="hrm-dot" /><CalendarBlank size={13} /> Posted {formatDate(event.publishedAt.slice(0, 10))}
          {interest && (interest.interested
            ? <span className="hrm-interest ok"><ThumbsUp size={13} /> Interested</span>
            : <span className="hrm-interest muted"><ThumbsDown size={13} /> Not Interested</span>)}
        </p>
        <p className="hrm-wellness-body">{event.body}</p>
        {event.kind === 'Event' && <p className="hrm-wellness-count"><Heart size={13} /> {interestedCount} interested</p>}
      </article>;
    })}
    <Pagination
      shown={pageRows.length}
      total={events.length}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
    />
  </div>;
}

function WellnessEventDetail({ data, setData, event, user, isAdmin, onBack, onNotify }) {
  const interest = interestFor(data, user.employeeId, event.id);
  const participants = (data.wellness?.participation || [])
    .filter(row => row.eventId === event.id && row.joined)
    .map(row => ({ ...row, employee: findEmployee(data, row.employeeId) }))
    .filter(row => row.employee);
  const table = useTableState();
  const filteredParticipants = participants.filter(row => !table.search || row.employee.name.toLowerCase().includes(table.search.toLowerCase()));

  function setInterest(interested) {
    setData(current => {
      const rows = (current.wellness?.interests || []).filter(row => !(row.employeeId === user.employeeId && row.eventId === event.id));
      if (interested !== null) rows.push({ interestId: `int-${user.employeeId}-${event.id}`, employeeId: user.employeeId, eventId: event.id, interested, at: new Date().toISOString() });
      return { ...current, wellness: { ...current.wellness, interests: rows } };
    });
    onNotify(interested === null ? 'Interest removed.' : interested ? "You're interested in this event!" : 'Marked as not interested.');
  }

  return <div className="hrm-workspace">
    <Breadcrumbs trail={[{ label: 'Health and Wellness', onClick: onBack }, { label: isAdmin ? 'Event Details' : 'Event' }]} />
    <PageHeading title={isAdmin ? 'Event Details' : event.title} onBack={onBack} />
    <div className={isAdmin ? 'hrm-event-layout' : ''}>
      <article className="hrm-panel hrm-event-body">
        {isAdmin && <h2 className="hrm-event-title">{event.title}</h2>}
        <p className="hrm-wellness-meta">
          <span className="hrm-avatar-sm">{initialsOf(event.department)}</span>
          <span><strong>by {event.department}</strong><br />Published {formatDate(event.publishedAt.slice(0, 10))}</span>
        </p>
        <hr />
        <p>{event.body}</p>
        <h4>How It Works:</h4>
        <p>Track your daily activity, nutrition, and progress through the Health &amp; Wellness widget on your dashboard. Each week we share tips, mini-goals and encouragement to keep you going.</p>
        <h4>Get Involved:</h4>
        <p>The programme runs {event.startDate ? `${formatLongDate(event.startDate)} to ${formatLongDate(event.endDate)}` : 'throughout the year'}. All participants receive a completion certificate, and top achievers earn special wellness rewards.</p>
        {/* Three states, as the masterfile shows them: undecided, interested,
            and declined — a declined event can always be re-joined. */}
        {!isAdmin && event.kind === 'Event' && <div className={`hrm-interest-panel ${interest?.interested ? 'joined' : ''}`}>
          {interest?.interested && <>
            <strong><CheckCircle size={15} weight="fill" /> You&rsquo;re interested in this event!</strong>
            <GhostButton onClick={() => setInterest(null)}>Remove interest</GhostButton>
          </>}
          {interest && !interest.interested && <>
            <div className="hrm-interest-copy">
              <strong><ThumbsDown size={14} /> You&rsquo;ve marked this event as &ldquo;Not interested&rdquo;.</strong>
              <span>You can change this anytime.</span>
            </div>
            <button type="button" className="hrm-btn outline ok" onClick={() => setInterest(true)}><ThumbsUp size={14} /> I&rsquo;m interested</button>
          </>}
          {!interest && <>
            <span>Interested in joining the event?</span>
            <div>
              <button type="button" className="hrm-btn outline ok" onClick={() => setInterest(true)}><ThumbsUp size={14} /> I&rsquo;m interested</button>
              <button type="button" className="hrm-btn outline" onClick={() => setInterest(false)}><ThumbsDown size={14} /> Not interested</button>
            </div>
          </>}
        </div>}
      </article>
      {isAdmin && <aside className="hrm-panel hrm-event-side">
        <h3>Event Details</h3>
        <DetailList groups={[
          { label: 'Total Employees', value: String(event.totalEmployees) },
          { label: 'Participants', value: String(event.participants) },
          { label: 'Participation Rate', value: `${((event.participants / event.totalEmployees) * 100).toFixed(2)}%` },
        ]} />
      </aside>}
    </div>

    {isAdmin && <section className="hrm-section">
      <h2 className="hrm-section-title">Participant List</h2>
      <div className="hrm-toolbar">
        <div className="hrm-toolbar-left"><SearchInput value={table.search} onChange={table.setSearch} /></div>
      </div>
      <DataTable
        columns={[
          { key: 'name', label: 'Employee Name' },
          { key: 'employeeCode', label: 'Employee Code' },
          { key: 'department', label: 'Department' },
          { key: 'position', label: 'Position' },
        ]}
        rows={paginate(filteredParticipants, table.page, table.pageSize)}
        total={filteredParticipants.length}
        rowKey={row => row.participationId}
        page={table.page}
        pageSize={table.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        empty="No participants have joined yet."
        renderCell={(row, column) => column.key === 'name'
          ? <span className="hrm-approver"><span className="hrm-avatar-sm">{row.employee.initials}</span>{row.employee.name}</span>
          : row.employee[column.key]}
      />
    </section>}
  </div>;
}

function MyWellnessAnalytics({ analytics, data }) {
  const [range, setRange] = useState('Week');
  const engagement = data.wellness?.engagement || [];
  return <>
    <div className="hrm-stat-grid three">
      <StatCard label="Total Events Joined" value={analytics.totalJoined} unit="programs" />
      <StatCard label="Participation this Month" value={analytics.joinedThisMonth} unit="programs" />
      <StatCard label="Participation this Year" value={analytics.joinedThisYear} unit="programs" />
    </div>
    <div className="hrm-split">
      <section className="hrm-panel">
        <h2 className="hrm-section-title">Participation History</h2>
        <label className="hrm-inline-filter">
          <span>Filter by:</span>
          <select value={range} onChange={event => setRange(event.target.value)}>
            <option>Week</option><option>Month</option><option>Year</option>
          </select>
        </label>
        <table className="hrm-table">
          <thead><tr><th>Date</th><th>Event Name</th></tr></thead>
          <tbody>
            {analytics.history.length === 0 && <tr><td colSpan={2} className="hrm-table-empty">You have not joined a programme yet.</td></tr>}
            {analytics.history.map(row => <tr key={row.participationId}><td>{formatDate(row.joinedAt)}</td><td>{row.event.title}</td></tr>)}
          </tbody>
        </table>
      </section>
      <section className="hrm-panel">
        <h2 className="hrm-section-title">Engagement Graph</h2>
        <LineChart
          labels={engagement.map(row => row.period)}
          series={[{ label: 'Participation', color: '#6d3bd4', points: engagement.map(row => row.may) }]}
        />
      </section>
    </div>
  </>;
}

function participationRate(event) {
  return event.totalEmployees ? (event.participants / event.totalEmployees) * 100 : 0;
}

function WellnessSummary({ data, onNotify }) {
  const events = (data.wellness?.events || []).filter(event => event.kind === 'Event');
  const engagement = data.wellness?.engagement || [];
  const overall = events.length ? events.reduce((sum, event) => sum + participationRate(event), 0) / events.length : 0;
  return <>
    <div className="hrm-toolbar end">
      <ExportMenu onExport={format => { downloadFile(`wellness-summary.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(['Event', 'Participants', 'Rate'], events.map(event => [event.title, event.participants, `${participationRate(event).toFixed(2)}%`]))); onNotify(`Wellness summary exported to ${format}.`); }} />
    </div>
    <StatCardRow>
      <StatCard label="Total Events Held" value={events.length} />
      <StatCard label="Overall Participation Rate" value={`${overall.toFixed(2)}%`} />
      <StatCard label="Events Held This Week" value={events.filter(event => event.startDate >= '2026-05-10').length} />
      <StatCard label="Weekly Participation Rate" value={`${(engagement[engagement.length - 1]?.may ?? 0).toFixed(2)}%`} />
      <StatCard label="Total Participants" value={events.reduce((sum, event) => sum + event.participants, 0)} />
    </StatCardRow>
    <div className="hrm-split">
      <section className="hrm-panel">
        <h2 className="hrm-section-title">Engagement Graph</h2>
        <LineChart
          labels={engagement.map(row => row.period)}
          series={[
            { label: 'Apr', color: '#a97bf0', points: engagement.map(row => row.apr) },
            { label: 'May', color: '#4c1d95', points: engagement.map(row => row.may) },
          ]}
        />
      </section>
      <section className="hrm-panel">
        <h2 className="hrm-section-title">Most Engaged Departments</h2>
        <table className="hrm-table">
          <thead><tr><th /><th>Name</th><th className="align-right">Participation Rate</th></tr></thead>
          <tbody>
            {(data.wellness?.departmentEngagement || []).map((row, index) => <tr key={row.department}>
              <td className="hrm-rank">{index + 1}</td><td>{row.department}</td><td className="align-right">{row.rate.toFixed(2)}%</td>
            </tr>)}
          </tbody>
        </table>
      </section>
    </div>
  </>;
}

function WellnessEngagement({ data, onOpenEmployee, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const rows = (data.employees || []).map(employee => {
    const joined = (data.wellness?.participation || []).filter(row => row.employeeId === employee.employeeId && row.joined);
    return { ...employee, totalEventsJoined: joined.length };
  });
  const filtered = rows.filter(row => {
    if (table.search && !row.name.toLowerCase().includes(table.search.toLowerCase())) return false;
    return Object.entries(table.filters).every(([key, value]) => !value || String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase()));
  });
  return <>
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu onExport={format => { downloadFile(`wellness-engagement.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(['Employee', 'Code', 'Department', 'Position', 'Events Joined'], filtered.map(row => [row.name, row.employeeCode, row.department, row.position, row.totalEventsJoined]))); onNotify(`Engagement exported to ${format}.`); }} />
      </div>
    </div>
    <DataTable
      columns={[
        { key: 'name', label: 'Employee Name' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department' },
        { key: 'position', label: 'Position' },
        { key: 'totalEventsJoined', label: 'Total Events Joined', align: 'right' },
      ]}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={row => row.employeeId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      renderCell={(row, column) => column.key === 'name'
        ? <button type="button" className="hrm-link" onClick={() => onOpenEmployee(row.employeeId)}><span className="hrm-avatar-sm">{row.initials}</span>{row.name}</button>
        : String(row[column.key] ?? '—')}
    />
    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'name', label: 'Employee Name' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department', options: [...new Set(rows.map(row => row.department))] },
        { key: 'position', label: 'Position', options: [...new Set(rows.map(row => row.position))] },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </>;
}

function WellnessEvents({ data, onOpen, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const events = (data.wellness?.events || []).filter(event => event.kind === 'Event');
  const filtered = events.filter(event => {
    if (table.search && !event.title.toLowerCase().includes(table.search.toLowerCase())) return false;
    return Object.entries(table.filters).every(([key, value]) => !value || String(event[key] ?? '').toLowerCase().includes(String(value).toLowerCase()));
  });
  return <>
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu onExport={format => { downloadFile(`wellness-events.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(['Event', 'Duration', 'Total Employees', 'Participants', 'Rate'], filtered.map(event => [event.title, `${event.startDate} - ${event.endDate}`, event.totalEmployees, event.participants, `${participationRate(event).toFixed(2)}%`]))); onNotify(`Events exported to ${format}.`); }} />
      </div>
    </div>
    <DataTable
      columns={[
        { key: 'title', label: 'Event Name' },
        { key: 'duration', label: 'Event Duration' },
        { key: 'totalEmployees', label: 'Total Employees', align: 'right' },
        { key: 'participants', label: 'Participants', align: 'right' },
        { key: 'rate', label: 'Participation Rate', align: 'right' },
      ]}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={event => event.id}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      renderCell={(event, column) => {
        if (column.key === 'title') return <button type="button" className="hrm-link" onClick={() => onOpen(event)}>{event.title}</button>;
        if (column.key === 'duration') return event.startDate === event.endDate ? formatDate(event.startDate) : `${formatDate(event.startDate)} - ${formatDate(event.endDate)}`;
        if (column.key === 'rate') return `${participationRate(event).toFixed(2)}%`;
        return String(event[column.key] ?? '—');
      }}
      actions={event => [{ kind: 'view', label: 'View Details', onSelect: () => onOpen(event) }]}
    />
    {drawerOpen && <FilterDrawer
      fields={[{ key: 'title', label: 'Event Name' }, { key: 'startDate', label: 'Event Duration', type: 'date' }]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </>;
}

function EngagementAnalytics({ data, employeeId, onBack, onNotify }) {
  const employee = findEmployee(data, employeeId);
  const analytics = wellnessAnalyticsFor(data, employeeId);
  return <div className="hrm-workspace">
    <Breadcrumbs trail={[{ label: 'Health and Wellness', onClick: onBack }, { label: employee?.name }, { label: 'Engagement Analytics' }]} />
    <EmployeeBanner employee={employee} />
    <PageHeading title="Engagement Analytics" onBack={onBack} actions={<ExportMenu onExport={format => { downloadFile(`engagement-${employeeId}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(['Date', 'Event'], analytics.history.map(row => [row.joinedAt, row.event.title]))); onNotify(`Engagement exported to ${format}.`); }} />} />
    <MyWellnessAnalytics analytics={analytics} data={data} />
  </div>;
}

/* ============================================================== leave ===== */

export function LeaveBalancesWorkspace({ data, requests = [], user, access, onBack, onNotify }) {
  const [openEmployee, setOpenEmployee] = useState(null);
  const isAdmin = access.canViewCompanyData || access.canViewTeamData;
  if (!isAdmin || openEmployee) {
    return <LeaveBalanceDetail
      data={data}
      employeeId={openEmployee || user.employeeId}
      showBanner={Boolean(openEmployee)}
      onBack={openEmployee ? () => setOpenEmployee(null) : onBack}
      onNotify={onNotify}
    />;
  }
  return <LeaveRoster data={data} onOpen={setOpenEmployee} onBack={onBack} onNotify={onNotify} />;
}

function LeaveRoster({ data, onOpen, onBack, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const rows = (data.employees || []).map(employee => {
    const balances = leaveBalancesFor(data, employee.employeeId, requests);
    const byType = Object.fromEntries(balances.map(balance => [balance.leaveType, balance.remaining]));
    return { ...employee, ...byType };
  });
  const filtered = rows.filter(row => {
    if (table.search && !`${row.name} ${row.employeeCode}`.toLowerCase().includes(table.search.toLowerCase())) return false;
    return Object.entries(table.filters).every(([key, value]) => !value || String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase()));
  });
  const columns = [
    { key: 'name', label: 'Employee Name' },
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'department', label: 'Department' },
    { key: 'position', label: 'Position' },
    ...LEAVE_TYPES.slice(0, 6).map(type => ({ key: type, label: type, align: 'right' })),
  ];
  return <div className="hrm-workspace">
    <PageHeading title="Leave Balances" onBack={onBack} info="Balances are maintained by Leave Configuration and are read-only here." />
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu onExport={format => { downloadFile(`leave-balances.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(columns.map(column => column.label), filtered.map(row => columns.map(column => row[column.key])))); onNotify(`Leave balances exported to ${format}.`); }} />
      </div>
    </div>
    <DataTable
      columns={columns}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={row => row.employeeId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      renderCell={(row, column) => column.key === 'name'
        ? <button type="button" className="hrm-link" onClick={() => onOpen(row.employeeId)}><span className="hrm-avatar-sm">{row.initials}</span>{row.name}</button>
        : String(row[column.key] ?? '—')}
      actions={row => [{ kind: 'view', label: 'View Records', onSelect: () => onOpen(row.employeeId) }]}
    />
    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'name', label: 'Employee Name' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department', options: [...new Set(rows.map(row => row.department))] },
        { key: 'position', label: 'Position', options: [...new Set(rows.map(row => row.position))] },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

function LeaveBalanceDetail({ data, employeeId, showBanner, onBack, onNotify }) {
  const balances = leaveBalancesFor(data, employeeId, requests);
  const [selected, setSelected] = useState(balances[0]?.leaveType || '');
  const employee = findEmployee(data, employeeId);
  const active = balances.find(balance => balance.leaveType === selected) || balances[0];
  const history = leaveHistoryFor(data, employeeId, active?.leaveType);
  return <div className="hrm-workspace">
    {showBanner && <>
      <Breadcrumbs trail={[{ label: 'YTD Leave Balances', onClick: onBack }, { label: employee?.name }]} />
      <EmployeeBanner employee={employee} />
    </>}
    <PageHeading
      title="Leave Balances"
      onBack={onBack}
      info="Balances are view-only. Corrections are made in Leave Configuration."
      actions={<ExportMenu onExport={format => { downloadFile(`leave-${employeeId}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(['Leave Type', 'Accrued', 'Used', 'Remaining', 'Forfeited'], balances.map(balance => [balance.leaveType, balance.accrued, balance.used, balance.remaining, balance.forfeited]))); onNotify(`Leave balances exported to ${format}.`); }} />}
    />
    <StatCardRow>
      {balances.map(balance => <StatCard
        key={balance.leaveType}
        label={balance.leaveType}
        value={balance.remaining}
        unit="days"
        selected={balance.leaveType === active?.leaveType}
        onClick={() => setSelected(balance.leaveType)}
      />)}
    </StatCardRow>
    <div className="hrm-split wide-left">
      <section className="hrm-panel">
        <h2 className="hrm-section-title">History</h2>
        <table className="hrm-table">
          <thead><tr><th>Date</th><th>Leaves Taken</th><th>Status</th><th>Remarks</th></tr></thead>
          <tbody>
            {history.length === 0 && <tr><td colSpan={4} className="hrm-table-empty">No {active?.leaveType} history yet.</td></tr>}
            {history.map(row => <tr key={row.historyId} className={row.status === 'Forfeited' ? 'is-forfeited' : ''}>
              <td>{formatLongDate(row.from)} - {formatLongDate(row.to).replace(/^\w+ /, '')}</td>
              <td>{row.days} Days</td>
              <td><StatusText status={row.status} /></td>
              <td>{row.remarks || '-'}</td>
            </tr>)}
          </tbody>
        </table>
      </section>
      <aside className="hrm-panel">
        <h2 className="hrm-section-title">Leave Type Details</h2>
        <dl className="hrm-kv">
          <div><dt>Accrued</dt><dd>{active?.accrued ?? 0}</dd></div>
          <div><dt>Used</dt><dd>{active?.used ?? 0}</dd></div>
          <div><dt>Remaining</dt><dd>{active?.remaining ?? 0}</dd></div>
          <div><dt>Forfeited</dt><dd>{active?.forfeited ?? 0}</dd></div>
        </dl>
      </aside>
    </div>
  </div>;
}

/* ================================================================ MDO ===== */

const MDO_CARDS = [
  { key: 'earned', label: 'Earned' },
  { key: 'used', label: 'Used' },
  { key: 'remaining', label: 'Remaining' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'forfeited', label: 'Forfeited' },
];

/** Each card narrows the ledger to the statuses that card represents. */
const MDO_CARD_STATUSES = {
  earned: null,
  used: ['Used'],
  remaining: ['Ready for Scheduling'],
  scheduled: ['Scheduled'],
  forfeited: ['Forfeited'],
};

export function MdoBalancesWorkspace({ data, user, access, onBack, onNotify }) {
  const [openEmployee, setOpenEmployee] = useState(null);
  const isAdmin = access.canViewCompanyData || access.canViewTeamData;
  if (!isAdmin || openEmployee) {
    return <MdoDetail
      data={data}
      employeeId={openEmployee || user.employeeId}
      showBanner={Boolean(openEmployee)}
      onBack={openEmployee ? () => setOpenEmployee(null) : onBack}
      onNotify={onNotify}
    />;
  }
  return <MdoRoster data={data} onOpen={setOpenEmployee} onBack={onBack} onNotify={onNotify} />;
}

function MdoRoster({ data, onOpen, onBack, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const rows = (data.employees || []).map(employee => ({ ...employee, ...(mdoBalanceFor(data, employee.employeeId) || {}) }));
  const filtered = rows.filter(row => {
    if (table.search && !`${row.name} ${row.employeeCode}`.toLowerCase().includes(table.search.toLowerCase())) return false;
    return Object.entries(table.filters).every(([key, value]) => !value || String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase()));
  });
  const columns = [
    { key: 'name', label: 'Employee Name' },
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'department', label: 'Department' },
    { key: 'position', label: 'Position' },
    ...MDO_CARDS.map(card => ({ key: card.key, label: card.label, align: 'right' })),
  ];
  return <div className="hrm-workspace">
    <PageHeading title="Mandatory Time-off Balances" onBack={onBack} info="Mandatory Day Off balances are view-only for administrators." />
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu onExport={format => { downloadFile(`mdo-balances.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(columns.map(column => column.label), filtered.map(row => columns.map(column => row[column.key])))); onNotify(`MDO balances exported to ${format}.`); }} />
      </div>
    </div>
    <DataTable
      columns={columns}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={row => row.employeeId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      renderCell={(row, column) => column.key === 'name'
        ? <button type="button" className="hrm-link" onClick={() => onOpen(row.employeeId)}><span className="hrm-avatar-sm">{row.initials}</span>{row.name}</button>
        : String(row[column.key] ?? '—')}
      actions={row => [{ kind: 'view', label: 'View Records', onSelect: () => onOpen(row.employeeId) }]}
    />
    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'name', label: 'Employee Name' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department', options: [...new Set(rows.map(row => row.department))] },
        ...MDO_CARDS.map(card => ({ key: card.key, label: card.label })),
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

function MdoDetail({ data, employeeId, showBanner, onBack, onNotify }) {
  const balance = mdoBalanceFor(data, employeeId);
  const employee = findEmployee(data, employeeId);
  const [selected, setSelected] = useState('');
  const history = mdoHistoryFor(data, employeeId);
  const statuses = MDO_CARD_STATUSES[selected];
  const shown = statuses ? history.filter(row => statuses.includes(row.status)) : history;
  return <div className="hrm-workspace">
    {showBanner && <>
      <Breadcrumbs trail={[{ label: 'YTD Leave Balances', onClick: onBack }, { label: employee?.name }]} />
      <EmployeeBanner employee={employee} />
    </>}
    <PageHeading
      title={showBanner ? 'Mandatory Day Off Balances' : 'YTD Mandatory Day Off Balances'}
      onBack={onBack}
      info="Forfeited days are shown in red and cannot be recovered."
      actions={<ExportMenu onExport={format => { downloadFile(`mdo-${employeeId}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(['Type', 'Date Earned', 'Days', 'Effective Date', 'Expiry Date', 'Status'], history.map(row => [row.type, row.dateEarned, row.days, row.effectiveFrom, row.expiry, row.status]))); onNotify(`MDO balances exported to ${format}.`); }} />}
    />
    <div className="hrm-stat-grid five">
      {MDO_CARDS.map(card => <StatCard
        key={card.key}
        label={card.label}
        value={balance?.[card.key] ?? 0}
        unit="days"
        selected={selected === card.key}
        onClick={() => setSelected(selected === card.key ? '' : card.key)}
      />)}
    </div>
    <section className="hrm-panel">
      <h2 className="hrm-section-title">History</h2>
      <div className="hrm-table-scroll">
        <table className="hrm-table">
          <thead><tr><th>Type</th><th>Date Earned</th><th>Days</th><th>Effective Date</th><th>Expiry Date</th><th>Status</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="hrm-table-empty">No matching mandatory day off records.</td></tr>}
            {shown.map(row => <tr key={row.historyId} className={row.status === 'Forfeited' ? 'is-forfeited' : ''}>
              <td>{row.type}</td>
              <td>{formatLongDate(row.dateEarned)}</td>
              <td>{row.days} Days</td>
              <td>{row.effectiveFrom ? `${formatLongDate(row.effectiveFrom)} - ${formatLongDate(row.effectiveTo).replace(/^\w+ /, '')}` : '-'}</td>
              <td>{formatLongDate(row.expiry)}</td>
              <td><StatusText status={row.status} /></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}

/* =========================================================== calendar ===== */

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function monthMatrix(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return { iso: day.toISOString().slice(0, 10), day: day.getUTCDate(), inMonth: day.getUTCMonth() === month };
  });
}

export function CalendarWorkspace({ data, onBack, onNotify }) {
  const [cursor, setCursor] = useState({ year: 2026, month: 9 });
  const [category, setCategory] = useState('all');
  const [openEvent, setOpenEvent] = useState(null);
  const [openDay, setOpenDay] = useState('');
  const [exporting, setExporting] = useState(false);

  const events = data.calendarEvents || [];
  const visible = category === 'all' ? events : events.filter(event => event.category === category);
  const cells = monthMatrix(cursor.year, cursor.month);
  const monthName = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(cursor.year, cursor.month, 1)));

  function shift(delta) {
    setCursor(current => {
      const next = new Date(Date.UTC(current.year, current.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
  }

  const eventsOn = iso => visible.filter(event => iso >= event.date && iso <= (event.endDate || event.date));
  const dayEvents = openDay ? eventsOn(openDay) : [];

  return <div className="hrm-workspace">
    <PageHeading title="Calendar & Events" onBack={onBack} />
    <div className="hrm-chip-row">
      <button type="button" className={category === 'all' ? 'selected' : ''} onClick={() => setCategory('all')}>All</button>
      {CALENDAR_CATEGORIES.map(entry => <button
        key={entry.key}
        type="button"
        className={`accent-${entry.accent} ${category === entry.key ? 'selected' : ''}`}
        onClick={() => setCategory(entry.key)}
      ><i /> {entry.label}</button>)}
    </div>
    <div className="hrm-calendar-bar">
      <div className="hrm-calendar-nav">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month"><CaretLeft size={15} weight="bold" /></button>
        <button type="button" onClick={() => shift(1)} aria-label="Next month"><CaretRight size={15} weight="bold" /></button>
        <strong>{monthName}</strong>
      </div>
      <div className="hrm-calendar-actions">
        <button type="button" className="hrm-btn outline" onClick={() => setExporting(true)}><DownloadSimple size={15} /> Export</button>
      </div>
    </div>
    <div className="hrm-calendar" role="grid" aria-label={`Calendar for ${monthName}`}>
      {WEEKDAYS.map(day => <div key={day} className="hrm-calendar-weekday">{day}</div>)}
      {cells.map(cell => {
        const cellEvents = eventsOn(cell.iso);
        return <div key={cell.iso} className={`hrm-calendar-cell ${cell.inMonth ? '' : 'muted'}`} role="gridcell">
          <button type="button" className="hrm-calendar-date" onClick={() => setOpenDay(cell.iso)}>{String(cell.day).padStart(2, '0')}</button>
          {cellEvents.slice(0, 3).map(event => <button
            key={event.id}
            type="button"
            className={`hrm-calendar-event accent-${CALENDAR_CATEGORIES.find(entry => entry.key === event.category)?.accent}`}
            onClick={() => setOpenEvent(event)}
            title={event.title}
          >{event.title}</button>)}
          {cellEvents.length > 3 && <button type="button" className="hrm-calendar-more" onClick={() => setOpenDay(cell.iso)}>+{cellEvents.length - 3} more</button>}
        </div>;
      })}
    </div>

    {openDay && <Modal title={`${formatLongDate(openDay)} (${new Intl.DateTimeFormat('en-PH', { weekday: 'long' }).format(new Date(`${openDay}T00:00:00`))})`} onClose={() => setOpenDay('')} width="sm">
      {dayEvents.length === 0
        ? <EmptyState title="Nothing scheduled">No events fall on this day.</EmptyState>
        : <ul className="hrm-day-list">
            {dayEvents.map(event => <li key={event.id} className={`accent-${CALENDAR_CATEGORIES.find(entry => entry.key === event.category)?.accent}`}>
              <button type="button" onClick={() => { setOpenEvent(event); setOpenDay(''); }}>
                <strong>{event.title}</strong>
                {event.startTime && <span>{formatTime(event.startTime)} - {formatTime(event.endTime)}</span>}
                {event.deadlineType && <span>Deadline Type: {event.deadlineType}</span>}
              </button>
            </li>)}
          </ul>}
    </Modal>}

    {openEvent && <Modal title="Event Details" onClose={() => setOpenEvent(null)}>
      <h3 className="hrm-event-title">{openEvent.title}</h3>
      <DetailList groups={[
        { pair: [
          { label: 'Date', value: openEvent.endDate && openEvent.endDate !== openEvent.date ? `${formatLongDate(openEvent.date)} - ${formatLongDate(openEvent.endDate)}` : formatLongDate(openEvent.date) },
          openEvent.startTime
            ? { label: 'Time', value: `${formatTime(openEvent.startTime)} - ${formatTime(openEvent.endTime)}` }
            : { label: 'Deadline Type', value: openEvent.deadlineType || '—' },
        ] },
        { label: 'Employee Group', value: openEvent.audience },
        { label: 'Remarks', value: openEvent.remarks },
      ]} />
    </Modal>}

    {exporting && <ExportCalendarModal onClose={() => setExporting(false)} onExport={(fileType, range) => {
      downloadFile(`calendar-${range}.${fileType === 'PDF' ? 'txt' : 'csv'}`, toCsv(['Title', 'Category', 'Date', 'Audience'], visible.map(event => [event.title, event.category, event.date, event.audience])));
      setExporting(false);
      onNotify(`Calendar exported to ${fileType}.`);
    }} />}
  </div>;
}

function ExportCalendarModal({ onClose, onExport }) {
  const [fileType, setFileType] = useState('Excel');
  const [filterBy, setFilterBy] = useState('By Month');
  const [from, setFrom] = useState('2026-08');
  const [to, setTo] = useState('2026-10');
  return <Modal title="Export Calendar" onClose={onClose} width="sm" footer={<>
    <GhostButton onClick={onClose}>Cancel</GhostButton>
    <button type="button" className="hrm-btn primary" onClick={() => onExport(fileType, `${from}_${to}`)}>Export</button>
  </>}>
    <Field label="File Type">
      <select value={fileType} onChange={event => setFileType(event.target.value)}><option>Excel</option><option>PDF</option></select>
    </Field>
    <fieldset className="hrm-radio-group">
      <legend>Filter By</legend>
      <div>
        {['By Month', 'By Year'].map(option => <label key={option} className="hrm-radio">
          <input type="radio" name="calendar-range" checked={filterBy === option} onChange={() => setFilterBy(option)} />
          <span>{option}</span>
        </label>)}
      </div>
    </fieldset>
    <div className="hrm-form-grid">
      <Field label="From"><input type={filterBy === 'By Month' ? 'month' : 'number'} value={filterBy === 'By Month' ? from : from.slice(0, 4)} onChange={event => setFrom(event.target.value)} /></Field>
      <Field label="To"><input type={filterBy === 'By Month' ? 'month' : 'number'} value={filterBy === 'By Month' ? to : to.slice(0, 4)} onChange={event => setTo(event.target.value)} /></Field>
    </div>
  </Modal>;
}

/* ========================================================= pre-boarding === */

const TASK_STATE_ICON = { Completed: CheckCircle, Attended: CheckCircle, 'In progress': CircleNotch, 'Not started': Circle };

export function PreboardingWorkspace({ data, setData, user, access, onBack, onNotify }) {
  const records = data.onboarding?.records || [];
  const own = records.find(record => record.employeeId === user.employeeId);
  const [openEmployee, setOpenEmployee] = useState(null);
  const [openTask, setOpenTask] = useState(null);
  const isAdmin = access.canManageOnboarding;

  const record = openEmployee ? records.find(item => item.employeeId === openEmployee) : own;

  function updateTask(recordId, taskId, patch) {
    setData(current => ({
      ...current,
      onboarding: {
        ...current.onboarding,
        records: current.onboarding.records.map(item => item.recordId !== recordId ? item : {
          ...item,
          tasks: item.tasks.map(task => task.taskId === taskId ? { ...task, ...patch } : task),
        }),
      },
    }));
  }

  if (isAdmin && !openEmployee) {
    return <PreboardingRoster data={data} records={records} onOpen={setOpenEmployee} onBack={onBack} />;
  }

  if (!record) {
    return <div className="hrm-workspace">
      <PageHeading title="Pre-boarding Requirements" onBack={onBack} />
      <EmptyState title="No pre-boarding assigned">This user has no onboarding checklist in the current company.</EmptyState>
    </div>;
  }

  const progress = onboardingProgress(record);

  if (openTask) {
    const task = record.tasks.find(item => item.taskId === openTask);
    return <PreboardingTask
      task={task}
      record={record}
      progress={progress}
      readOnly={isAdmin}
      onBack={() => setOpenTask(null)}
      onSave={patch => { updateTask(record.recordId, task.taskId, patch); onNotify('Details saved successfully.'); setOpenTask(null); }}
      onSubmit={patch => { updateTask(record.recordId, task.taskId, { ...patch, status: 'Completed', completedAt: new Date().toISOString().slice(0, 10) }); onNotify('Task successfully completed.'); setOpenTask(null); }}
    />;
  }

  const employee = findEmployee(data, record.employeeId);
  return <div className="hrm-workspace">
    {openEmployee && <Breadcrumbs trail={[{ label: 'Employee Onboarding', onClick: () => setOpenEmployee(null) }, { label: employee?.name }]} />}
    <PageHeading title="Pre-boarding Requirements" onBack={openEmployee ? () => setOpenEmployee(null) : onBack} />
    <p className="hrm-lead">Complete your onboarding to enable all features assigned to you.</p>
    <section className="hrm-panel">
      <div className="hrm-progress-head">
        <span>Employee Progress</span>
        <span className="hrm-progress-value">{progress.percent}%</span>
      </div>
      <span className="hrm-progress"><i style={{ width: `${progress.percent}%` }} /></span>
      <ol className="hrm-checklist">
        {record.tasks.map((task, index) => {
          const Icon = TASK_STATE_ICON[task.status] || Circle;
          return <li key={task.taskId} className={`state-${task.status.replace(/\s+/g, '-').toLowerCase()}`}>
            <Icon size={18} weight={task.status === 'Completed' || task.status === 'Attended' ? 'fill' : 'regular'} />
            <div>
              <button type="button" className="hrm-link" onClick={() => setOpenTask(task.taskId)}>{index + 1}. {task.title}</button>
              {task.completedAt && <small>{task.status} {formatDate(task.completedAt)}</small>}
              {task.status === 'In progress' && <small className="progressing">In progress</small>}
            </div>
          </li>;
        })}
      </ol>
    </section>
  </div>;
}

function PreboardingRoster({ data, records, onOpen, onBack }) {
  const table = useTableState();
  const rows = records
    .map(item => ({ ...item, employee: findEmployee(data, item.employeeId), progress: onboardingProgress(item) }))
    .filter(row => row.employee);
  const filtered = rows.filter(row => !table.search || row.employee.name.toLowerCase().includes(table.search.toLowerCase()));
  return <div className="hrm-workspace">
    <PageHeading title="Employee Onboarding" onBack={onBack} />
    <div className="hrm-toolbar"><div className="hrm-toolbar-left"><SearchInput value={table.search} onChange={table.setSearch} /></div></div>
    <DataTable
      columns={[
        { key: 'name', label: 'Employee Name' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department' },
        { key: 'startedAt', label: 'Started', type: 'date' },
        { key: 'dueAt', label: 'Due', type: 'date' },
        { key: 'progress', label: 'Progress' },
        { key: 'status', label: 'Status', type: 'status' },
      ]}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={row => row.recordId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      renderCell={(row, column) => {
        if (column.key === 'name') return <button type="button" className="hrm-link" onClick={() => onOpen(row.employeeId)}><span className="hrm-avatar-sm">{row.employee.initials}</span>{row.employee.name}</button>;
        if (column.key === 'progress') return <span className="hrm-progress-inline"><span className="hrm-progress"><i style={{ width: `${row.progress.percent}%` }} /></span>{row.progress.completed}/{row.progress.total}</span>;
        if (column.key === 'status') return <StatusText status={row.status} />;
        if (['employeeCode', 'department'].includes(column.key)) return row.employee[column.key];
        return formatCell(row[column.key], column.type);
      }}
      actions={row => [{ kind: 'view', label: 'View Progress', onSelect: () => onOpen(row.employeeId) }]}
    />
  </div>;
}

function PreboardingTask({ task, record, progress, readOnly, onBack, onSave, onSubmit }) {
  const [files, setFiles] = useState(task.attachments || []);
  const [remarks, setRemarks] = useState(task.remarks || '');
  const isEdit = (task.attachments || []).length > 0 || task.status === 'Completed';
  return <div className="hrm-workspace">
    <PageHeading title={isEdit ? 'Edit Pre-boarding Task' : 'Pre-boarding Task'} onBack={onBack} />
    <div className="hrm-split wide-left">
      <section className="hrm-panel">
        <p className="hrm-task-eyebrow">Task {record.tasks.findIndex(item => item.taskId === task.taskId) + 1}</p>
        <h2 className="hrm-task-title">{task.title}</h2>
        {isEdit && record.editingEndsInDays > 0 && <p className="hrm-task-note">Editing access ends in {record.editingEndsInDays} days</p>}
        {task.requiresUpload && <>
          <h3 className="hrm-form-section-title">Submit files</h3>
          <Field label="Upload required forms">
            <UploadArea files={files} onAdd={added => setFiles([...files, ...added])} onRemove={index => setFiles(files.filter((_, position) => position !== index))} />
          </Field>
        </>}
        <h3 className="hrm-form-section-title">Remarks</h3>
        <Field label="Remarks">
          <textarea rows={3} value={remarks} onChange={event => setRemarks(event.target.value)} disabled={readOnly} placeholder="Add a note for the People team" />
        </Field>
        {!readOnly && <div className="hrm-form-actions">
          {isEdit
            ? <button type="button" className="hrm-btn primary" onClick={() => onSave({ attachments: files, remarks })}>Save</button>
            : <button type="button" className="hrm-btn primary" onClick={() => onSubmit({ attachments: files, remarks })}>Submit</button>}
        </div>}
      </section>
      <aside className="hrm-panel">
        <div className="hrm-progress-head"><span>Employee Progress</span><span className="hrm-progress-value">{progress.percent}%</span></div>
        <span className="hrm-progress"><i style={{ width: `${progress.percent}%` }} /></span>
        <ol className="hrm-checklist compact">
          {record.tasks.map((item, index) => {
            const Icon = TASK_STATE_ICON[item.status] || Circle;
            return <li key={item.taskId} className={`state-${item.status.replace(/\s+/g, '-').toLowerCase()}`}>
              <Icon size={16} weight={item.status === 'Completed' || item.status === 'Attended' ? 'fill' : 'regular'} />
              <div>
                <span>{index + 1}. {item.title}</span>
                {item.completedAt && <small>{item.status} {formatDate(item.completedAt)}</small>}
                {item.status === 'In progress' && <small className="progressing">In progress</small>}
              </div>
            </li>;
          })}
        </ol>
      </aside>
    </div>
  </div>;
}

/* ========================================================== approvals ===== */

export function ApprovalsWorkspace({ requests, data, actor, teamEmployeeIds, onBack, onRefresh, onNotify }) {
  const table = useTableState();
  const [statusTab, setStatusTab] = useState('Pending');
  const [decision, setDecision] = useState(null);
  const [approvalLog, setApprovalLog] = useState(null);
  const [remarks, setRemarks] = useState('');

  const scope = new Set(teamEmployeeIds);
  const scoped = requests.filter(request => scope.has(request.employeeId));
  const filtered = scoped.filter(request => {
    if (statusTab !== 'All' && shortStatus(request.status) !== statusTab) return false;
    if (!table.search) return true;
    const employee = findEmployee(data, request.employeeId);
    return `${employee?.name ?? ''} ${request.requestTypeLabel}`.toLowerCase().includes(table.search.toLowerCase());
  });

  function decide(kind) {
    const request = decision.request;
    try {
      if (!isActorAuthorizedForDecision(request, actor, kind === 'approve' ? REQUEST_PERMISSIONS.APPROVE : REQUEST_PERMISSIONS.REJECT)) {
        onNotify('You are not the assigned approver for that request.', 'bad');
        return;
      }
      const options = { actor, expectedVersion: request.version, remarks };
      if (kind === 'approve') approveRequest(request.requestId, options);
      else rejectRequest(request.requestId, options);
      onNotify(kind === 'approve' ? 'Request approved.' : 'Request rejected.');
      setDecision(null);
      setRemarks('');
      onRefresh();
    } catch (error) {
      onNotify(error.message || 'The decision could not be recorded.', 'bad');
    }
  }

  return <div className="hrm-workspace">
    <PageHeading title="Manage Approvals" onBack={onBack} />
    <StatusTabs
      tabs={['All', 'Pending', 'Approved', 'Rejected']}
      value={statusTab}
      onChange={value => { setStatusTab(value); table.setPage(1); }}
      counts={Object.fromEntries(['All', 'Pending', 'Approved', 'Rejected'].map(tab => [tab, tab === 'All' ? scoped.length : scoped.filter(request => shortStatus(request.status) === tab).length]))}
    />
    <div className="hrm-toolbar"><div className="hrm-toolbar-left"><SearchInput value={table.search} onChange={table.setSearch} placeholder="Search employee or request type..." /></div></div>
    <DataTable
      columns={[
        { key: 'employee', label: 'Employee' },
        { key: 'requestTypeLabel', label: 'Approval Type' },
        { key: 'workDate', label: 'Date Filed', type: 'date' },
        { key: 'reason', label: 'Reason' },
        { key: 'status', label: 'Status', type: 'status' },
      ]}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={request => request.requestId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="Nothing is waiting on this user."
      renderCell={(request, column) => {
        if (column.key === 'employee') {
          const employee = findEmployee(data, request.employeeId);
          return <span className="hrm-approver"><span className="hrm-avatar-sm">{employee?.initials || initialsOf(request.employee?.name)}</span>{employee?.name || request.employee?.name || request.employeeId}</span>;
        }
        if (column.key === 'status') return <StatusText status={request.status} />;
        if (column.key === 'reason') return request.requesterRemarks || '—';
        return formatCell(request[column.key], column.type);
      }}
      actions={request => [
        { kind: 'view', label: 'Review', onSelect: () => { setDecision({ request }); setRemarks(''); } },
        { kind: 'view', label: 'Approval log', onSelect: () => setApprovalLog(request) },
      ]}
    />

    {decision && <Modal
      title={`Review ${decision.request.requestTypeLabel}`}
      onClose={() => setDecision(null)}
      footer={decision.request.status === REQUEST_STATUSES.PENDING_APPROVAL ? <>
        <GhostButton onClick={() => setDecision(null)}>Close</GhostButton>
        <button type="button" className="hrm-btn danger" onClick={() => decide('reject')}>Reject</button>
        <button type="button" className="hrm-btn primary" onClick={() => decide('approve')}>Approve</button>
      </> : <GhostButton onClick={() => setDecision(null)}>Close</GhostButton>}
    >
      <DetailList groups={[
        { pair: [
          { label: 'Employee', value: findEmployee(data, decision.request.employeeId)?.name || decision.request.employeeId },
          { label: 'Request Type', value: decision.request.requestTypeLabel },
        ] },
        { label: 'Reason', value: decision.request.requesterRemarks },
        // Detail keys are the stored field names; the routing and plumbing
        // keys are not part of the request the approver is deciding on.
        ...Object.entries(decision.request.requestDetails || {})
          .filter(([key, value]) => !INTERNAL_DETAIL_KEYS.has(key) && value !== '' && value !== undefined)
          .map(([key, value]) => ({ label: key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase()), value: String(value) })),
        { pair: [
          { label: 'Status', node: <StatusText status={decision.request.status} /> },
          { label: 'Version', value: String(decision.request.version) },
        ] },
      ]} />
      {decision.request.status === REQUEST_STATUSES.PENDING_APPROVAL && <Field label="Approver remarks" hint="A remark is required to reject.">
        <textarea rows={3} value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Explain the decision" />
      </Field>}
    </Modal>}

    {approvalLog && <ApprovalLogModal entries={approvalLogFor(approvalLog)} onClose={() => setApprovalLog(null)} />}
  </div>;
}

/* ============================================================ reports ===== */

const reportCatalog = [
  { key: 'headcount', label: 'Headcount Report', description: 'Total headcount breakdown by department, division, and employment status (HT184).' },
  { key: 'masterfile', label: 'Employee Masterfile Report', description: 'Comprehensive employee profile and demographic data extract (HT185).' },
  { key: 'movement', label: 'History of Movement', description: 'Promotions, department transfers, rate changes, and position movements (HT186).' },
  { key: 'exception', label: 'Exception Report', description: 'Masterfile changes and field updates between periods with previous vs. new values (HT198).' },
  { key: 'analytical', label: 'Analytical & Turnover Report', description: 'Annual hires, resignations, turnover rates, and leave/attendance metrics (HT199).' },
  { key: 'cgi_config', label: 'CGI Configuration Report', description: 'System setup, statutory rate tables, approval levels, and company policies (HT203).' },
  { key: 'earnings', label: 'Earnings Report', description: 'Basic pay, taxable and non-taxable earnings, bonuses and allowances per employee (HT187).' },
  { key: 'deductions', label: 'Deductions Report', description: 'Statutory and company deductions, loans and HDMF contributions per employee (HT188).' },
  { key: 'certifications', label: 'Certifications Report', description: 'Employee certificates, issuing bodies, release and expiry dates with validity status (HT189).' },
  { key: 'leave', label: 'Leave Balances Report', description: 'Accrued, used, remaining, converted, and forfeited balances per leave type (HT146).' },
  { key: 'leave_conversion', label: 'Leave Conversion Report', description: 'Leave credits cashed out per employee and leave type, with conversion dates (HT192).' },
  { key: 'medical', label: 'Medical Profiles Report', description: 'Blood type, past and present conditions, findings and medical contacts (HT194).' },
  { key: 'compliance', label: 'Compliance Report', description: 'Statutory registration, contribution and filing compliance per employee (HT195).' },
  { key: 'contracts', label: 'Employment Contracts Report', description: 'Contract documents per employee with author, effectivity and approval status (HT196).' },
  { key: 'policies', label: 'Company Policies Report', description: 'Uploaded company policies with version, effectivity and publishing metadata (HT197).' },
  { key: 'mdo', label: 'Mandatory Day Off (MDO)', description: 'Earned, used, scheduled, and forfeited mandatory days off.' },
  { key: 'applications', label: 'Self-Service Applications', description: 'Status summary of all filed leaves, overtime, time adjustments, and requests (HT152).' },
  { key: 'wellness', label: 'Wellness Engagement', description: 'Participation rates, event logs, and wellness check-in summaries (HT056).' },
  { key: 'onboarding', label: 'Onboarding Progress', description: 'Pre-boarding task completion percentage per new hire (HT112).' },
];

export function ReportsWorkspace({ data, requests, access, teamEmployeeIds, onBack, onNotify }) {
  const [selected, setSelected] = useState(reportCatalog[0].key);
  const [deptFilter, setDeptFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('2026-01-01');
  const [dateTo, setDateTo] = useState('2026-12-31');
  const [search, setSearch] = useState('');
  const [bulkZipModal, setBulkZipModal] = useState(false);

  const scope = new Set(teamEmployeeIds);
  const allEmployees = (data.employees || []).filter(employee => scope.has(employee.employeeId));
  const employees = allEmployees.filter(emp => {
    if (deptFilter !== 'All' && emp.department !== deptFilter) return false;
    if (search && !`${emp.name} ${emp.employeeCode} ${emp.position}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const departments = ['All', ...new Set((data.employees || []).map(e => e.department).filter(Boolean))];

  function buildReport() {
    if (selected === 'headcount') {
      const depts = [...new Set(employees.map(e => e.department))];
      const rows = depts.map(dept => {
        const inDept = employees.filter(e => e.department === dept);
        const fullTime = inDept.filter(e => e.employmentType?.includes('Full Time')).length;
        const probationary = inDept.filter(e => !e.employmentType?.includes('Full Time')).length;
        const active = inDept.filter(e => e.status === 'Active').length;
        return [dept, inDept.length, fullTime, probationary, active];
      });
      return {
        headers: ['Department', 'Total Headcount', 'Full-Time Regular', 'Probationary / Others', 'Active Employees'],
        rows,
      };
    }
    if (selected === 'masterfile') {
      return {
        headers: ['Employee Code', 'Full Name', 'Department', 'Position', 'Employment Type', 'Date Hired', 'Status'],
        rows: employees.map(e => [e.employeeCode, e.name, e.department, e.position, e.employmentType || 'Full Time Philippines', e.dateHired || '2024-01-15', e.status || 'Active']),
      };
    }
    if (selected === 'movement') {
      const movements = [
        { code: '0011223345', name: 'John Collins Doe', type: 'Promotion', from: 'Sr. IT Supervisor', to: 'IT Manager', dept: 'IT Department', date: '2025-06-01', remarks: 'Annual Performance Appraisal' },
        { code: '0000112345', name: 'Ethan Collins', type: 'Salary Adjustment', from: '₱65,000.00', to: '₱75,000.00', dept: 'IT Department', date: '2026-01-01', remarks: 'Merit Increase' },
        { code: '0000112346', name: 'Sophia Ramirez', type: 'Position Reclassification', from: 'Jr. QA Tester', to: 'QA Analyst', dept: 'IT Department', date: '2025-10-15', remarks: 'Regularization' },
        { code: '0000112349', name: 'Olivia Carter', type: 'Department Transfer', from: 'Human Resources', to: 'Learning & Development', dept: 'Learning & Development', date: '2026-02-01', remarks: 'Internal Reassignment' },
      ];
      const filtered = movements.filter(m => employees.some(e => e.employeeCode === m.code));
      return {
        headers: ['Employee Code', 'Employee Name', 'Movement Type', 'Previous State', 'New State', 'Department', 'Effective Date', 'Remarks'],
        rows: filtered.map(m => [m.code, m.name, m.type, m.from, m.to, m.dept, m.date, m.remarks]),
      };
    }
    if (selected === 'exception') {
      const exceptions = [
        { code: '0000112345', name: 'Ethan Collins', field: 'Civil Status', prev: 'Single', curr: 'Married', date: '2026-03-12', actor: 'Client Admin (HR)' },
        { code: '0000112346', name: 'Sophia Ramirez', field: 'Bank Account Number', prev: '****-1102', curr: '****-9941', date: '2026-02-28', actor: 'Client Admin (Payroll)' },
        { code: '0000112348', name: 'John Doe Jr.', field: 'Tax Status (Dependents)', prev: '0', curr: '1', date: '2026-04-05', actor: 'John Collins Doe' },
        { code: '0000112347', name: 'Liam Johnson', field: 'SSS Number', prev: '34-8891023-1', curr: '34-8891023-9', date: '2026-01-20', actor: 'P&A Admin' },
      ];
      const filtered = exceptions.filter(ex => employees.some(e => e.employeeCode === ex.code));
      return {
        headers: ['Employee Code', 'Employee Name', 'Field Modified', 'Previous Value', 'New / Updated Value', 'Modification Date', 'Changed By (Actor)'],
        rows: filtered.map(ex => [ex.code, ex.name, ex.field, ex.prev, ex.curr, ex.date, ex.actor]),
      };
    }
    if (selected === 'analytical') {
      return {
        headers: ['Metric / Indicator', 'YTD Q1 2026', 'YTD Q2 2026', 'Annual Projected', 'Benchmark Target'],
        rows: [
          ['Total Active Headcount', employees.length, employees.length, employees.length, '100% Target'],
          ['New Hires Count', '2 Employees', '1 Employee', '5 Employees', 'On Track'],
          ['Separations / Resignations', '0 Employees', '0 Employees', '1 Employee', '< 3% Turnover'],
          ['Turnover Rate (%)', '0.00%', '0.00%', '1.50%', '< 5.00%'],
          ['Leave Utilization Rate', '22.4%', '38.1%', '85.0%', '90.0%'],
          ['Overtime Incident Rate', '14.2 hrs/emp', '11.8 hrs/emp', '12.5 hrs/emp', 'Controlled'],
        ],
      };
    }
    if (selected === 'cgi_config') {
      return {
        headers: ['Configuration Item', 'Standard Setting', 'Client Overrides', 'Effective Version', 'Governing Policy'],
        rows: [
          ['BIR Withholding Tax Matrix', 'TRAIN Law 2023+ Bracket', 'Standard P&A Table', 'v2026.1 (Locked)', 'National Internal Revenue Code'],
          ['SSS Contribution Ceiling', '₱35,000.00 Max MSC', 'Standard Table', 'v2025.1 (Active)', 'RA 11199 Social Security Act'],
          ['PhilHealth Premium Rate', '5.00% Income Share', '50/50 EE/ER Split', 'v2026.1 (Active)', 'Universal Health Care Act'],
          ['HDMF / Pag-IBIG Fund', '₱200 EE / ₱200 ER', 'Voluntary Upgrade Active', 'v2024.1 (Active)', 'Pag-IBIG Fund Circular 460'],
          ['13th Month Non-Tax Ceiling', '₱90,000.00 Exemption', 'Standard Ceiling', 'Statutory Standard', 'P.D. 851 & Tax Reform'],
          ['Approval Hierarchy Rules', '5-Level Reporting Line', 'Immediate Manager + HR', 'Atlas Phase 1 BRD', 'Internal Delegation of Authority'],
        ],
      };
    }
    if (selected === 'leave') {
      return {
        headers: ['Employee Code', 'Employee Name', 'Leave Type', 'Accrued', 'Used', 'Converted', 'Forfeited', 'Remaining'],
        rows: employees.flatMap(employee => leaveBalancesFor(data, employee.employeeId, requests).map(balance => [employee.employeeCode, employee.name, balance.leaveType, balance.accrued, balance.used, balance.converted, balance.forfeited, balance.remaining])),
      };
    }
    if (selected === 'leave_conversion') {
      return {
        headers: ['Employee Code', 'Employee Name', 'Leave Type', 'Leave Credits', 'Used Leaves', 'Leave Conversion', 'Date of Conversion', 'Leave Balance', 'Remarks'],
        rows: employees.flatMap(employee => leaveBalancesFor(data, employee.employeeId, requests)
          .filter(balance => Number(balance.converted) > 0)
          .map(balance => [employee.employeeCode, employee.name, balance.leaveType, balance.accrued, balance.used, balance.converted, balance.conversionDate || '—', balance.remaining, 'Cash conversion of unused credits'])),
      };
    }
    if (selected === 'earnings') {
      return {
        headers: ['Employee Code', 'Employee Name', 'Earning Code', 'Earning Name', 'Classification', 'Taxability', 'Frequency', 'Amount', 'Effectivity Date'],
        rows: employees.flatMap(employee => {
          const record = (data.salaryInformation || []).find(row => row.employeeId === employee.employeeId);
          return (record?.earnings || []).map(earning => [employee.employeeCode, employee.name, earning.earningCode, earning.earningName, earning.classification, earning.taxability, earning.frequency, peso(earning.earningsAmount), earning.effectivityDate]);
        }),
      };
    }
    if (selected === 'deductions') {
      /** Statutory rows hold one column per agency, so each becomes its own line. */
      const statutoryShares = [
        ['SSS Contribution', 'sssEmployee'],
        ['SSS MPF (WISP)', 'sssMpfEmployee'],
        ['PhilHealth Contribution', 'phicEmployee'],
        ['Pag-IBIG (HDMF)', 'hdmfEmployee'],
      ];
      return {
        headers: ['Employee Code', 'Employee Name', 'Deduction Type', 'Deduction Name', 'Employee Amount', 'Effectivity Date', 'Outstanding Balance'],
        rows: employees.flatMap(employee => {
          const record = (data.salaryInformation || []).find(row => row.employeeId === employee.employeeId);
          if (!record) return [];
          const line = (type, name, amount, effectivity, balance) => [employee.employeeCode, employee.name, type, name, peso(amount), effectivity || '—', balance === undefined ? '—' : peso(balance)];
          return [
            ...(record.statutoryDeductions || []).flatMap(row => statutoryShares
              .filter(([, field]) => Number(row[field]) > 0)
              .map(([label, field]) => line('Statutory', label, row[field], row.effectivityDate))),
            ...(record.companyDeductions || []).map(row => line('Company', row.deductionName, row.amountOfDeduction, row.startDate, row.totalBalance)),
            ...(record.loans || []).map(row => line('Loan', `${row.payItem} (${row.referenceNumber})`, row.amount, row.startDate, row.balance)),
            ...(record.hdmfContributions || []).map(row => line('HDMF', 'Pag-IBIG Contribution', row.employeeContribution, row.effectivityDate)),
          ];
        }),
      };
    }
    if (selected === 'certifications') {
      const today = new Date().toISOString().slice(0, 10);
      return {
        headers: ['Employee Code', 'Employee Name', 'Certificate Name', 'Issuing Body', 'Certificate Number', 'Date Taken', 'Date Released', 'Expiration Date', 'Validity'],
        rows: (data.employeeCertifications || [])
          .filter(row => employees.some(employee => employee.employeeId === row.employeeId))
          .map(row => {
            const employee = employees.find(entry => entry.employeeId === row.employeeId);
            const validity = !row.expirationDate ? 'No expiry' : row.expirationDate < today ? 'Expired' : 'Valid';
            return [employee.employeeCode, employee.name, row.certificateName, row.issuingBody, row.certificateNumber, row.dateTaken, row.dateReleased, row.expirationDate, validity];
          }),
      };
    }
    if (selected === 'medical') {
      return {
        headers: ['Employee Code', 'Employee Name', 'Blood Type', 'Date Recorded', 'Medical Condition', 'Current Diagnosis', 'Results / Findings', 'Medical Care Contact', 'Remarks'],
        rows: (data.medicalRecords || [])
          .filter(row => employees.some(employee => employee.employeeId === row.employeeId))
          .map(row => {
            const employee = employees.find(entry => entry.employeeId === row.employeeId);
            return [employee.employeeCode, employee.name, row.bloodType, row.dateRecorded, row.condition, row.diagnosis, row.findings, row.contact, row.remarks];
          }),
      };
    }
    if (selected === 'compliance') {
      return {
        headers: ['Employee Code', 'Employee Name', 'Department', 'SSS Registered', 'PhilHealth Registered', 'Pag-IBIG Registered', 'TIN on File', 'Contract on File', 'Compliance Status'],
        rows: employees.map(employee => {
          const record = (data.salaryInformation || []).find(row => row.employeeId === employee.employeeId);
          const hasStatutory = Boolean((record?.statutoryDeductions || []).length);
          const hasHdmf = Boolean((record?.hdmfContributions || []).length);
          const hasContract = (data.onboardingDocuments || []).some(doc => doc.category === 'employment-contract' && doc.status === 'Approved');
          const checks = [hasStatutory, hasStatutory, hasHdmf, Boolean(record), hasContract];
          const yes = value => (value ? 'Yes' : 'No');
          return [
            employee.employeeCode,
            employee.name,
            employee.department,
            yes(hasStatutory),
            yes(hasStatutory),
            yes(hasHdmf),
            yes(Boolean(record)),
            yes(hasContract),
            checks.every(Boolean) ? 'Compliant' : 'Action required',
          ];
        }),
      };
    }
    if (selected === 'contracts') {
      return {
        headers: ['Document No.', 'Document Title', 'Document Type', 'Author', 'Date Created', 'Effectivity Date', 'Submission Type', 'Status'],
        rows: (data.onboardingDocuments || [])
          .filter(row => row.category === 'employment-contract')
          .map(row => [row.onboardingDocId, row.documentTitle, row.documentType, row.author, row.dateCreated, row.effectivityDate, row.submissionType, row.status]),
      };
    }
    if (selected === 'policies') {
      return {
        headers: ['Policy Code', 'Policy Title', 'Category', 'Version', 'Date Uploaded', 'Effectivity Date', 'Uploaded By', 'File Name', 'Status'],
        rows: (data.companyPolicies || [])
          .filter(row => (!dateFrom || row.dateUploaded >= dateFrom) && (!dateTo || row.dateUploaded <= dateTo))
          .map(row => [row.policyCode, row.title, row.category, row.version, row.dateUploaded, row.effectivityDate, row.uploadedBy, row.fileName, row.status]),
      };
    }
    if (selected === 'mdo') {
      return {
        headers: ['Employee Code', 'Employee Name', 'Earned', 'Used', 'Remaining', 'Scheduled', 'Forfeited'],
        rows: employees.map(employee => {
          const balance = mdoBalanceFor(data, employee.employeeId) || {};
          return [employee.employeeCode, employee.name, balance.earned, balance.used, balance.remaining, balance.scheduled, balance.forfeited];
        }),
      };
    }
    if (selected === 'applications') {
      return {
        headers: ['Employee Code', 'Employee Name', 'Application Type', 'Date Filed', 'Status', 'Requester Remarks'],
        rows: requests.filter(request => scope.has(request.employeeId)).map(request => {
          const emp = findEmployee(data, request.employeeId);
          return [emp?.employeeCode || '—', emp?.name || request.employeeId, request.requestTypeLabel, request.workDate, shortStatus(request.status), request.requesterRemarks];
        }),
      };
    }
    if (selected === 'wellness') {
      // Participation is joined-against-offered; `wellnessAnalyticsFor` reports
      // the joins, and the events on offer are what turn that into a rate.
      const offered = (data.wellness?.events || []).length;
      return {
        headers: ['Employee Code', 'Employee Name', 'Department', 'Programmes Offered', 'Programmes Joined', 'Participation Rate'],
        rows: employees.map(employee => {
          const stats = wellnessAnalyticsFor(data, employee.employeeId);
          const rate = offered ? Math.round((stats.totalJoined / offered) * 100) : 0;
          return [employee.employeeCode, employee.name, employee.department, offered, stats.totalJoined, `${rate}%`];
        }),
      };
    }
    return {
      headers: ['Employee Code', 'Employee Name', 'Completed Tasks', 'Total Tasks', 'Completion Rate'],
      rows: (data.onboarding?.records || []).filter(record => scope.has(record.employeeId)).map(record => {
        const emp = findEmployee(data, record.employeeId);
        const progress = onboardingProgress(record);
        return [emp?.employeeCode || '—', emp?.name || record.employeeId, progress.completed, progress.total, `${progress.percent}%`];
      }),
    };
  }

  const report = buildReport();
  const definition = reportCatalog.find(entry => entry.key === selected) || reportCatalog[0];

  const handleExport = format => {
    const ext = format.toLowerCase();
    const fileName = `${selected}-report-${new Date().toISOString().slice(0, 10)}.${ext === 'pdf' ? 'txt' : ext === 'excel' ? 'csv' : 'csv'}`;
    downloadFile(fileName, toCsv(report.headers, report.rows));
    onNotify(`${definition.label} exported to ${format} successfully!`);
  };

  return <div className="hrm-workspace">
    <PageHeading
      title="HRM &amp; Timekeeping Reports Suite"
      onBack={onBack}
      eyebrow={`Actor Scope: ${access.reportScope.toUpperCase()} (${access.isPaAdmin ? 'P&A Admin' : access.isClientAdmin ? 'Client Admin' : access.isApprover ? 'Client Approver' : 'Client Employee'})`}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="hrm-btn secondary" onClick={() => setBulkZipModal(true)}>
            📦 Bulk ZIP Export (HT205)
          </button>
        </div>
      }
    />

    {/* Report Selector Grid */}
    <div className="hrm-report-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
      {reportCatalog.map(entry => <button
        key={entry.key}
        type="button"
        className={`hrm-report-card ${selected === entry.key ? 'selected' : ''}`}
        onClick={() => setSelected(entry.key)}
      >
        <strong>{entry.label}</strong>
        <span>{entry.description}</span>
      </button>)}
    </div>

    {/* Filter & Toolbar */}
    <section className="hrm-panel">
      <div className="hrm-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="hrm-toolbar-left" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 className="hrm-section-title" style={{ margin: 0 }}>{definition.label}</h2>
          <SearchInput value={search} onChange={setSearch} placeholder="Search employees..." />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Dept:</label>
            <select className="hrm-select-compact" value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 12 }}>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Range:</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: '3px 6px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4 }} />
            <span style={{ fontSize: 12 }}>to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: '3px 6px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4 }} />
          </div>
        </div>

        <div className="hrm-toolbar-right">
          <ExportMenu
            disabled={report.rows.length === 0}
            onExport={handleExport}
          />
        </div>
      </div>

      <div className="hrm-table-scroll">
        <table className="hrm-table">
          <thead><tr>{report.headers.map(header => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>
            {report.rows.length === 0 && <tr><td colSpan={report.headers.length} className="hrm-table-empty">No report rows found within the current scope and filter parameters.</td></tr>}
            {report.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{String(cell ?? '—')}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {/* Bulk ZIP Export Modal (HT205, HT282) */}
    {bulkZipModal && <Modal
      title="Bulk Reports Export (ZIP Package)"
      onClose={() => setBulkZipModal(false)}
      footer={<>
        <GhostButton onClick={() => setBulkZipModal(false)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn primary" onClick={() => {
          downloadFile(`atlas-reports-bundle-${dateTo}.zip`, `[Atlas Compressed Archive]\nIncluded Reports:\n- Headcount Report\n- Masterfile Report\n- Movement Report\n- Exception Report\n- Analytical Report\n- CGI Configuration Report\nDate Range: ${dateFrom} to ${dateTo}\nExported by: ${access.role}`);
          onNotify('All standard reports bundled into ZIP archive and downloaded.');
          setBulkZipModal(false);
        }}>
          Generate &amp; Download ZIP
        </button>
      </>}
    >
      <p className="hrm-modal-message">
        Generate and package all selected reports for the active client into a single compressed ZIP archive with optional multi-tab Excel formatting (BRD HT200–HT207).
      </p>
      <div className="hrm-form-grid">
        <Field label="Target File Format">
          <select defaultValue="zip_excel">
            <option value="zip_excel">ZIP Archive containing individual .CSV / .XLSX files</option>
            <option value="single_excel">Single Multi-Tab Workbook (.XLSX with multiple sheets)</option>
            <option value="zip_pdf">ZIP Archive of PDF Summaries</option>
          </select>
        </Field>
        <Field label="Password Protection (Optional)">
          <input placeholder="Leave empty for unencrypted ZIP" type="password" />
        </Field>
        <Field label="Date Filter Window">
          <input value={`${dateFrom} to ${dateTo}`} readOnly disabled />
        </Field>
        <Field label="Applicable Scope">
          <input value={`${access.reportScope.toUpperCase()} (${allEmployees.length} employees)`} readOnly disabled />
        </Field>
      </div>
    </Modal>}
  </div>;
}

/* ====================================================== self-inquiry ====== */

export { SelfInquiryWorkspace } from './HRMSelfInquiry.jsx';

/* ========================================================== benefits ====== */

export { BenefitsWorkspace } from './HRMBenefits.jsx';

/* ============================================================ loans ======= */

export function LoansWorkspace({ data, user, onBack, onNotify }) {
  const [applyModal, setApplyModal] = useState(false);
  const [loanType, setLoanType] = useState('Company Emergency Loan');
  const [principal, setPrincipal] = useState('');
  const [term, setTerm] = useState('12');

  const loans = [
    { id: 'LN-2025-01', type: 'Company Emergency Loan', principal: '₱25,000.00', term: '12 Mos', deduction: '₱2,083.33', remaining: '₱8,333.33', status: 'Active', progress: 67 },
    { id: 'SSS-SL-9482', type: 'SSS Salary Loan', principal: '₱20,000.00', term: '24 Mos', deduction: '₱1,050.00', remaining: '₱12,600.00', status: 'Active', progress: 37 },
    { id: 'HDMF-MPL-301', type: 'HDMF Pag-IBIG MPL', principal: '₱15,000.00', term: '12 Mos', deduction: '₱1,320.00', remaining: '₱0.00', status: 'Fully Paid', progress: 100 },
  ];

  return <div className="hrm-workspace">
    <PageHeading title="Loan Management" onBack={onBack} actions={<PrimaryButton onClick={() => setApplyModal(true)}>+ Apply for Company Loan</PrimaryButton>} />
    <StatCardRow>
      <StatCard label="Total Remaining Balance" value="20,933.33" unit="PHP" />
      <StatCard label="Monthly Payroll Deduction" value="3,133.33" unit="PHP / Month" />
      <StatCard label="Active Loans" value="2" unit="Accounts" />
      <StatCard label="Settled Loans" value="1" unit="Closed" />
    </StatCardRow>

    <section className="hrm-panel" style={{ marginTop: 20 }}>
      <div className="hrm-toolbar">
        <div className="hrm-toolbar-left"><h2 className="hrm-section-title">Active &amp; Historical Loans Ledger</h2></div>
        <div className="hrm-toolbar-right">
          <ExportMenu onExport={fmt => onNotify(`Loans ledger exported to ${fmt}.`)} />
        </div>
      </div>
      <div className="hrm-table-scroll">
        <table className="hrm-table">
          <thead><tr><th>Loan Account</th><th>Loan Description</th><th>Principal Amount</th><th>Term</th><th>Monthly Amortization</th><th>Remaining Balance</th><th>Progress</th><th>Status</th></tr></thead>
          <tbody>
            {loans.map(row => <tr key={row.id}>
              <td><code>{row.id}</code></td>
              <td><strong>{row.type}</strong></td>
              <td>{row.principal}</td>
              <td>{row.term}</td>
              <td>{row.deduction}</td>
              <td><strong>{row.remaining}</strong></td>
              <td><span className="hrm-progress-inline"><span className="hrm-progress"><i style={{ width: `${row.progress}%` }} /></span>{row.progress}%</span></td>
              <td><span className={`hrm-badge ${row.status === 'Active' ? 'ok' : 'muted'}`}>{row.status}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {applyModal && <Modal title="Apply for Company Loan" onClose={() => setApplyModal(false)} footer={<>
      <GhostButton onClick={() => setApplyModal(false)}>Cancel</GhostButton>
      <button type="button" className="hrm-btn primary" onClick={() => { onNotify('Company loan application submitted for approval.'); setApplyModal(false); }}>Submit Application</button>
    </>}>
      <div className="hrm-form-grid">
        <Field label="Loan Type">
          <select value={loanType} onChange={e => setLoanType(e.target.value)}>
            <option>Company Emergency Loan</option>
            <option>Educational Loan</option>
            <option>Salary Advance Loan</option>
            <option>Calamity Assistance Loan</option>
          </select>
        </Field>
        <Field label="Principal Amount (PHP)">
          <input type="number" value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="e.g. 20000.00" />
        </Field>
        <Field label="Repayment Term (Months)">
          <select value={term} onChange={e => setTerm(e.target.value)}>
            <option value="6">6 Months</option>
            <option value="12">12 Months</option>
            <option value="18">18 Months</option>
            <option value="24">24 Months</option>
          </select>
        </Field>
        <Field label="Estimated Monthly Deduction">
          <input value={principal && term ? `₱${(Number(principal) / Number(term)).toFixed(2)}` : '₱0.00'} readOnly disabled />
        </Field>
        <div className="hrm-form-cell span-2">
          <Field label="Loan Purpose &amp; Justification">
            <textarea rows={3} placeholder="Explain reason for loan request" />
          </Field>
        </div>
      </div>
    </Modal>}
  </div>;
}

/* ====================================================== resignation ===== */

export function ResignationWorkspace({ data, user, onBack, onNotify }) {
  const [submitted, setSubmitted] = useState(false);
  const [lastDay, setLastDay] = useState('2026-09-30');
  const [reason, setReason] = useState('Career advancement');
  const [handover, setHandover] = useState('');

  const steps = [
    { title: 'Submit Notice of Resignation', done: true, date: '08/17/2026' },
    { title: 'Manager Consultation & Acknowledgment', done: true, date: '08/18/2026' },
    { title: 'Knowledge Transfer & Project Turnover', done: false, date: 'Pending' },
    { title: 'IT & Hardware Turnover', done: false, date: 'Pending' },
    { title: 'HR Exit Interview', done: false, date: 'Pending' },
    { title: 'Finance & Clearance Approval / Final Pay', done: false, date: 'Target 10/15/2026' },
  ];

  return <div className="hrm-workspace">
    <PageHeading title="Resignation &amp; Career Transition" onBack={onBack} />
    {!submitted ? <section className="hrm-panel">
      <h2 className="hrm-section-title">Submit Notice of Resignation</h2>
      <p className="hrm-lead">As per company policy, a 30-calendar-day notice period is required to ensure orderly turnover.</p>
      <div className="hrm-form-grid">
        <Field label="Intended Last Day of Employment">
          <input type="date" value={lastDay} onChange={e => setLastDay(e.target.value)} />
        </Field>
        <Field label="Primary Reason for Leaving">
          <select value={reason} onChange={e => setReason(e.target.value)}>
            <option>Career advancement / New opportunity</option>
            <option>Relocation / Overseas employment</option>
            <option>Higher education / Personal development</option>
            <option>Health or family reasons</option>
            <option>Retirement</option>
          </select>
        </Field>
        <div className="hrm-form-cell span-2">
          <Field label="Turnover &amp; Handover Plan">
            <textarea rows={4} value={handover} onChange={e => setHandover(e.target.value)} placeholder="Detail pending tasks, transition notes, and designated peer receiver" />
          </Field>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <button type="button" className="hrm-btn danger" onClick={() => { setSubmitted(true); onNotify('Notice of resignation submitted.'); }}>
          Submit Formal Resignation Notice
        </button>
      </div>
    </section> : <div className="hrm-split wide-left">
      <section className="hrm-panel">
        <div className="hrm-alert ok" style={{ marginBottom: 18 }}>
          <strong>Notice of Resignation Acknowledged</strong>
          <p>Your transition is tracked with target last day on <strong>{formatDate(lastDay)}</strong>.</p>
        </div>
        <h2 className="hrm-section-title">Turnover &amp; Exit Milestones</h2>
        <ol className="hrm-checklist">
          {steps.map((step, idx) => <li key={idx} className={step.done ? 'state-completed' : 'state-in-progress'}>
            <CheckCircle size={18} weight={step.done ? 'fill' : 'regular'} />
            <div>
              <span>{idx + 1}. {step.title}</span>
              <small>{step.date}</small>
            </div>
          </li>)}
        </ol>
      </section>
      <aside className="hrm-panel">
        <h3 className="hrm-section-title">Notice Countdown</h3>
        <StatCard label="Days Remaining" value="30" unit="Days to Last Day" />
        <div style={{ marginTop: 16 }}>
          <p className="muted" style={{ fontSize: 11 }}>For questions regarding clearance, contact your HR Business Partner at <strong>hr@abccompany.com</strong>.</p>
        </div>
      </aside>
    </div>}
  </div>;
}

/* ====================================================== offboarding ======= */

export { OffboardingWorkspace } from './HRMOffboarding.jsx';

/* ==================================================== certification ====== */

export function CertificationWorkspace({ data, user, onBack, onNotify }) {
  const [certType, setCertType] = useState('Standard COE');
  const [purpose, setPurpose] = useState('Bank / Loan Application');
  const [withCompensation, setWithCompensation] = useState('Yes');
  const [previewing, setPreviewing] = useState(false);
  const employee = findEmployee(data, user.employeeId);

  const history = [
    { id: 'COE-2026-001', type: 'Certificate of Employment (With Compensation)', purpose: 'Housing Loan Pre-approval', requestedAt: '04/23/2026', status: 'Ready for Download' },
    { id: 'COE-2025-089', type: 'Certificate of Employment (Standard)', purpose: 'Tourist Visa Application (Japan Embassy)', requestedAt: '11/15/2025', status: 'Downloaded' },
  ];

  return <div className="hrm-workspace">
    <PageHeading title="Certification Request" onBack={onBack} />
    <div className="hrm-split wide-left">
      <section className="hrm-panel">
        <h2 className="hrm-section-title">Request Official Certificate</h2>
        <div className="hrm-form-grid">
          <Field label="Certificate Type">
            <select value={certType} onChange={e => setCertType(e.target.value)}>
              <option>Standard Certificate of Employment (COE)</option>
              <option>Certificate of Employment &amp; Compensation (COEC)</option>
              <option>PhilHealth Certificate of Contributions</option>
              <option>Tax Clearance / BIR Form 2316 Certified Copy</option>
            </select>
          </Field>
          <Field label="Purpose">
            <select value={purpose} onChange={e => setPurpose(e.target.value)}>
              <option>Bank / Loan Application</option>
              <option>Visa / Embassy Requirement</option>
              <option>Credit Card Application</option>
              <option>Rental / Lease Requirement</option>
              <option>Personal Reference</option>
            </select>
          </Field>
          <Field label="Include Compensation Breakdown?">
            <select value={withCompensation} onChange={e => setWithCompensation(e.target.value)}>
              <option value="Yes">Yes - Include monthly basic + fixed allowances</option>
              <option value="No">No - Standard tenure and position only</option>
            </select>
          </Field>
          <Field label="Date Needed">
            <input type="date" defaultValue="2026-05-01" />
          </Field>
          <div className="hrm-form-cell span-2">
            <Field label="Addressed To / Recipient Organization">
              <input placeholder="e.g. The Consular Officer, Embassy of Japan / BDO Unibank Inc." />
            </Field>
          </div>
        </div>
        <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
          <button type="button" className="hrm-btn primary" onClick={() => { onNotify('Certificate request generated successfully!'); setPreviewing(true); }}>
            Generate &amp; Preview Certificate
          </button>
        </div>
      </section>

      <section className="hrm-panel">
        <h3 className="hrm-section-title">Request History</h3>
        <ul className="hrm-notification-list">
          {history.map(item => <li key={item.id}>
            <span className="hrm-notification-dot" />
            <div>
              <strong>{item.type}</strong>
              <p>{item.purpose} · Requested {item.requestedAt}</p>
              <button type="button" className="hrm-link" onClick={() => setPreviewing(true)} style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <DownloadSimple size={13} /> Download Official PDF ({item.id})
              </button>
            </div>
          </li>)}
        </ul>
      </section>
    </div>

    {previewing && <DocumentViewerModal fileName={`Official-COE-${employee?.employeeCode || '001'}.pdf`} title="Certificate of Employment" onClose={() => setPreviewing(false)} />}
  </div>;
}

/* ============================================================ others ====== */

export function OthersWorkspace({ data, onBack, onNotify }) {
  const [ticketModal, setTicketModal] = useState(false);
  const [category, setCategory] = useState('HR Policy Inquiry');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const tickets = [
    { id: 'TKT-9481', category: 'ID Card Replacement', subject: 'Lost company RFID badge', date: '04/20/2026', status: 'In Progress' },
    { id: 'TKT-8920', category: 'Workplace Accommodation', subject: 'Ergonomic chair request', date: '03/10/2026', status: 'Resolved' },
  ];

  return <div className="hrm-workspace">
    <PageHeading title="Other HR Requests &amp; Inquiries" onBack={onBack} actions={<PrimaryButton onClick={() => setTicketModal(true)}>+ Create HR Helpdesk Ticket</PrimaryButton>} />
    <section className="hrm-panel">
      <h2 className="hrm-section-title">HR Helpdesk &amp; Support Tickets</h2>
      <div className="hrm-table-scroll">
        <table className="hrm-table">
          <thead><tr><th>Ticket ID</th><th>Category</th><th>Subject</th><th>Date Filed</th><th>Status</th></tr></thead>
          <tbody>
            {tickets.map(t => <tr key={t.id}>
              <td><code>{t.id}</code></td>
              <td>{t.category}</td>
              <td><strong>{t.subject}</strong></td>
              <td>{t.date}</td>
              <td><span className={`hrm-badge ${t.status === 'Resolved' ? 'ok' : 'warn'}`}>{t.status}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {ticketModal && <Modal title="Submit HR Helpdesk Ticket" onClose={() => setTicketModal(false)} footer={<>
      <GhostButton onClick={() => setTicketModal(false)}>Cancel</GhostButton>
      <button type="button" className="hrm-btn primary" onClick={() => { onNotify('HR Helpdesk ticket submitted.'); setTicketModal(false); }}>Submit Ticket</button>
    </>}>
      <div className="hrm-form-grid">
        <Field label="Category">
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option>HR Policy Inquiry</option>
            <option>ID Card Replacement</option>
            <option>Workplace Accommodation</option>
            <option>Data Privacy Inquiry</option>
            <option>General Employee Support</option>
          </select>
        </Field>
        <Field label="Subject">
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Summary of request" />
        </Field>
        <div className="hrm-form-cell span-2">
          <Field label="Description">
            <textarea rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Detailed explanation" />
          </Field>
        </div>
      </div>
    </Modal>}
  </div>;
}

