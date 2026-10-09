/**
 * Timekeeping Charge Codes Suite (P&A Timekeeping Module Part 2):
 * - Time Report Application (Daily Roster & Configure Time Report Screen)
 * - Time Report Approval (Multi-status Approver Queue with Approve/Reject Modals & Email Preview)
 * - Time Report Management (Charge Code Reports with 15-field Filter Drawer)
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CaretDown,
  Check,
  CheckCircle,
  Clock,
  ClockAfternoon,
  DownloadSimple,
  Envelope,
  Eye,
  FileText,
  Funnel,
  PencilSimple,
  Plus,
  Receipt,
  Trash,
  UploadSimple,
  X,
  XCircle,
} from '@phosphor-icons/react';
import {
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
  Modal,
  PageHeading,
  Pagination,
  PrimaryButton,
  SearchInput,
  StatCard,
  StatCardRow,
  StatusPill,
  StatusTabs,
  StatusText,
  formatCell,
  formatDate,
  initialsOf,
  paginate,
  shortStatus,
  useTableState,
} from './HRMKit.jsx';
import { downloadFile } from './fileDownload.js';
import {
  deriveDailyTimeReports,
  parseTimeToMinutes,
  validateTimeOverlap,
} from './timekeepingData.js';

const toCsv = (headers, rows) =>
  [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

const CHARGE_ACCOUNTS = [
  { code: 'CC-00001', name: 'ABC Development Corp', project: 'Social Media', team: 'Creatives Team', activity: 'Art Card Development' },
  { code: 'CC-00002', name: 'ABC Development Corp', project: 'Internal Systems', team: 'Product Development', activity: 'Sprint Planning' },
  { code: 'CC-00003', name: 'Point Brooke Resort and Events', project: 'Brand Campaign', team: 'Creatives Team', activity: 'Art Card Development' },
  { code: 'CC-00004', name: 'Point Brooke Resort and Events', project: 'Infrastructure Modernization', team: 'Quality Assurance', activity: 'QA Automation' },
  { code: 'CC-00005', name: 'XYZ Global Solutions', project: 'Client Presentation', team: 'Operations', activity: 'Client Presentation' },
];

const PROJECTS = ['Social Media', 'Internal Systems', 'Brand Campaign', 'Infrastructure Modernization', 'Client Presentation'];
const TEAMS = ['Creatives Team', 'Product Development', 'Quality Assurance', 'Operations', 'Marketing'];
const ACTIVITIES = ['Art Card Development', 'Sprint Planning', 'Code Review', 'QA Automation', 'Client Presentation', 'Architecture Review'];
const HOUR_TYPES = ['Regular Hours', 'Overtime', 'Night Differential', 'Rest Day'];

/* --------------------------------------------------------------- 1. Sidebar */

export function ChargeCodesSidebar({ subView = 'time-report-application', access, onSelectSubView, onBack }) {
  const isApprover = access?.canApproveTeamRequests || access?.isPaAdmin || access?.isClientAdmin;

  const menuItems = [
    { key: 'time-report-application', label: 'Time Report Application', icon: Clock },
    ...(isApprover ? [{ key: 'time-report-approval', label: 'Time Report Approval', icon: CheckCircle }] : []),
    { key: 'charge-code-reports', label: 'Charge Code Reports', icon: Receipt },
  ];

  return <aside className="hrm-ss-sidebar">
    <button type="button" className="hrm-ss-back" onClick={onBack}>
      <ArrowLeft size={14} /> Back to Timekeeping
    </button>
    <h2>Charge Codes</h2>
    <nav aria-label="Charge codes navigation">
      {menuItems.map(item => {
        const Icon = item.icon;
        const isActive = subView === item.key || (subView === 'configure-time-report' && item.key === 'time-report-application');
        return (
          <button
            key={item.key}
            type="button"
            className={isActive ? 'selected' : ''}
            onClick={() => onSelectSubView(item.key)}
          >
            <Icon size={15} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  </aside>;
}

/* -------------------------------------- 2. Time Report Application (Master) */

function ViewTimeReportSummaryModal({ dailyReport, onClose }) {
  return <Modal title={`Time Report Summary - ${dailyReport.date}`} onClose={onClose} width={650}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
      <div><small className="muted" style={{ fontSize: 11 }}>Time Report Date</small><div style={{ fontWeight: 600, fontSize: 13 }}>{dailyReport.date}</div></div>
      <div><small className="muted" style={{ fontSize: 11 }}>Time Range</small><div style={{ fontWeight: 600, fontSize: 13 }}>{dailyReport.timeStart} - {dailyReport.timeEnd}</div></div>
      <div><small className="muted" style={{ fontSize: 11 }}>Total Duration</small><div style={{ fontWeight: 600, fontSize: 13, color: 'var(--violet)' }}>{dailyReport.totalDuration} Hours</div></div>
    </div>

    <h4 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 10px', color: '#1e293b' }}>Detailed Entries ({dailyReport.entries?.length || 0})</h4>
    <table className="hrm-table" style={{ fontSize: 11 }}>
      <thead>
        <tr>
          <th>Charge Code</th>
          <th>Charge Account</th>
          <th>Start Time</th>
          <th>End Time</th>
          <th>Duration</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {(dailyReport.entries || []).map(entry => (
          <tr key={entry.reportId}>
            <td><span style={{ fontWeight: 600, color: 'var(--violet)' }}>{entry.chargeCode}</span></td>
            <td>{entry.chargeAccount}</td>
            <td>{entry.startTime}</td>
            <td>{entry.endTime}</td>
            <td>{entry.durationHours} hrs</td>
            <td><StatusText status={entry.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>

    <div className="hrm-modal-footer" style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
      <PrimaryButton onClick={onClose}>Close</PrimaryButton>
    </div>
  </Modal>;
}

function TimeReportApplicationScreen({ data, setData, user, onConfigureDate, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewingDaily, setViewingDaily] = useState(null);
  const [addDateModalOpen, setAddDateModalOpen] = useState(false);
  const [newReportDate, setNewReportDate] = useState(new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }));

  const reports = data.timeReports || [];
  const dailyRows = useMemo(() => deriveDailyTimeReports(reports, user.employeeId), [reports, user.employeeId]);

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return dailyRows.filter(row => {
      if (term) {
        const matches = [row.date, row.timeReportDate, row.dateCreated, row.timeStart, row.timeEnd, String(row.totalDuration)]
          .some(v => String(v ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return Object.entries(table.filters).every(([key, value]) => {
        if (!value) return true;
        return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
      });
    });
  }, [dailyRows, table.search, table.filters]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  const columns = [
    { key: 'dateCreated', label: 'Date Created' },
    { key: 'timeReportDate', label: 'Time Report Date' },
    { key: 'timeStart', label: 'Time Start' },
    { key: 'timeEnd', label: 'Time End' },
    { key: 'totalDuration', label: 'Total Duration' },
  ];

  function exportDaily(format) {
    const headers = ['Date Created', 'Time Report Date', 'Time Start', 'Time End', 'Total Duration'];
    const rows = filtered.map(r => [r.dateCreated, r.timeReportDate, r.timeStart, r.timeEnd, `${r.totalDuration} hrs`]);
    downloadFile(`time-report-applications.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Time report applications exported to ${format}.`);
  }

  function handleCreateNewDate() {
    setAddDateModalOpen(false);
    onConfigureDate(newReportDate);
  }

  return <div className="hrm-ss-content">
    <PageHeading title="Time Report Application" />

    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right" style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="hrm-btn primary" onClick={() => setAddDateModalOpen(true)}>
          <Plus size={14} /> Add
        </button>
        <button type="button" className="hrm-btn outline" onClick={() => onNotify('Batch time report template uploaded.')}>
          <UploadSimple size={14} /> Upload
        </button>
        <ExportMenu onExport={exportDaily} disabled={filtered.length === 0} />
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
      empty="No time reports filed yet."
      renderCell={(row, col) => {
        if (col.key === 'timeReportDate') {
          return (
            <button
              type="button"
              className="hrm-link-inline"
              style={{ fontWeight: 600, color: 'var(--violet)' }}
              onClick={() => onConfigureDate(row.date)}
            >
              {row.timeReportDate}
            </button>
          );
        }
        if (col.key === 'totalDuration') {
          return `${row.totalDuration.toFixed(2)}`;
        }
        return formatCell(row[col.key], col.type);
      }}
      actions={row => [
        { kind: 'view', label: 'View', onSelect: () => setViewingDaily(row) },
        { kind: 'edit', label: 'Configure', onSelect: () => onConfigureDate(row.date) },
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'dateCreated', label: 'Date Created' },
        { key: 'timeReportDate', label: 'Time Report Date' },
        { key: 'timeStart', label: 'Time Start' },
        { key: 'timeEnd', label: 'Time End' },
        { key: 'totalDuration', label: 'Duration in Hours' },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {viewingDaily && <ViewTimeReportSummaryModal dailyReport={viewingDaily} onClose={() => setViewingDaily(null)} />}

    {addDateModalOpen && <Modal title="New Time Report" onClose={() => setAddDateModalOpen(false)} width={450}>
      <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>Select the date for which you want to configure time report entries.</p>
      <Field label="Time Report Date" required>
        <input
          type="text"
          value={newReportDate}
          onChange={e => setNewReportDate(e.target.value)}
          placeholder="MM/DD/YYYY"
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
        />
      </Field>
      <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <GhostButton onClick={() => setAddDateModalOpen(false)}>Cancel</GhostButton>
        <PrimaryButton onClick={handleCreateNewDate}>Continue to Configure</PrimaryButton>
      </div>
    </Modal>}
  </div>;
}

/* --------------------------------- 3. Configure Time Report (Day Entries) */

function AddEditTimeReportModal({ entry, existingEntries, targetDate, user, onSave, onClose }) {
  const [chargeAccount, setChargeAccount] = useState(entry?.chargeAccount || CHARGE_ACCOUNTS[0].name);
  const [project, setProject] = useState(entry?.project || CHARGE_ACCOUNTS[0].project);
  const [team, setTeam] = useState(entry?.team || CHARGE_ACCOUNTS[0].team);
  const [activity, setActivity] = useState(entry?.activity || CHARGE_ACCOUNTS[0].activity);
  const [reportDate, setReportDate] = useState(entry?.date || targetDate);
  const [startTime, setStartTime] = useState(entry?.startTime || '08:30:00 AM');
  const [endTime, setEndTime] = useState(entry?.endTime || '10:30:00 AM');
  const [typeOfHours, setTypeOfHours] = useState(entry?.typeOfHours || 'Regular Hours');
  const [approver, setApprover] = useState(entry?.approverName || 'John Collins Doe');
  const [overlapError, setOverlapError] = useState(false);

  // Auto derive charge code based on account
  const selectedAcc = CHARGE_ACCOUNTS.find(a => a.name === chargeAccount) || CHARGE_ACCOUNTS[0];
  const chargeCode = selectedAcc.code;

  // Auto calculate duration in hours
  const startMins = parseTimeToMinutes(startTime);
  const endMins = parseTimeToMinutes(endTime);
  const diffHours = Math.max(0, (endMins - startMins) / 60);

  function handleAccountChange(accName) {
    setChargeAccount(accName);
    const matched = CHARGE_ACCOUNTS.find(a => a.name === accName);
    if (matched) {
      setProject(matched.project);
      setTeam(matched.team);
      setActivity(matched.activity);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const newEntry = {
      date: reportDate,
      timeReportDate: reportDate,
      startTime,
      endTime,
      durationHours: Number(diffHours.toFixed(2)),
      chargeCode,
      chargeAccount,
      project,
      team,
      activity,
      typeOfHours,
      approverName: approver,
    };

    // Check time overlap
    const hasOverlap = validateTimeOverlap(existingEntries, newEntry, entry?.reportId);
    if (hasOverlap) {
      setOverlapError(true);
      return;
    }

    setOverlapError(false);
    onSave(newEntry);
  }

  return <Modal title={entry ? 'Edit Time Report Application' : 'Add Time Report Application'} onClose={onClose} width={580}>
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Charge Code">
          <input
            type="text"
            readOnly
            value={chargeCode}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 600, color: 'var(--violet)' }}
          />
        </Field>
        <Field label="Charge Account" required>
          <select
            value={chargeAccount}
            onChange={e => handleAccountChange(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          >
            {CHARGE_ACCOUNTS.map(acc => <option key={acc.code} value={acc.name}>{acc.name} ({acc.code})</option>)}
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 10 }}>
        <Field label="Project" required>
          <select
            value={project}
            onChange={e => setProject(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          >
            {PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Team" required>
          <select
            value={team}
            onChange={e => setTeam(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          >
            {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ marginTop: 10 }}>
        <Field label="Activity" required>
          <select
            value={activity}
            onChange={e => setActivity(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          >
            {ACTIVITIES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ marginTop: 10 }}>
        <Field label="Time Report Date" required>
          <input
            type="text"
            value={reportDate}
            onChange={e => setReportDate(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 10 }}>
        <Field label="Time Start" required>
          <input
            type="text"
            value={startTime}
            onChange={e => { setStartTime(e.target.value); setOverlapError(false); }}
            placeholder="08:30:00 AM"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          />
        </Field>
        <Field label="Time End" required>
          <input
            type="text"
            value={endTime}
            onChange={e => { setEndTime(e.target.value); setOverlapError(false); }}
            placeholder="10:30:00 AM"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          />
        </Field>
        <Field label="Duration in Hours">
          <input
            type="text"
            readOnly
            value={diffHours.toFixed(2)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 600 }}
          />
        </Field>
      </div>

      {overlapError && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, color: '#b91c1c', fontSize: 11 }}>
          ⚠️ The selected time overlaps with an existing time report. Please adjust the start or end time.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 10 }}>
        <Field label="Type of Hours" required>
          <select
            value={typeOfHours}
            onChange={e => setTypeOfHours(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          >
            {HOUR_TYPES.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>
        <Field label="Approver" required>
          <select
            value={approver}
            onChange={e => setApprover(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          >
            <option value="John Collins Doe">John Collins Doe (Manager)</option>
            <option value="Ethan Caldwell">Ethan Caldwell (Director)</option>
          </select>
        </Field>
      </div>

      <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton type="submit">{entry ? 'Save Changes' : 'Add'}</PrimaryButton>
      </div>
    </form>
  </Modal>;
}

function ConfigureTimeReportScreen({ targetDate, data, setData, user, onBack, onNotify }) {
  const table = useTableState();
  const [modalMode, setModalMode] = useState(null); // 'add' | { mode: 'edit', entry }
  const [deletingEntry, setDeletingEntry] = useState(null);

  const allReports = data.timeReports || [];
  const entriesForDate = useMemo(() => {
    return allReports.filter(r => (r.employeeId === user.employeeId || !r.employeeId) && (r.date === targetDate || r.timeReportDate === targetDate));
  }, [allReports, targetDate, user.employeeId]);

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return entriesForDate.filter(row => {
      if (term) {
        return [row.chargeCode, row.chargeAccount, row.startTime, row.endTime, row.status]
          .some(v => String(v ?? '').toLowerCase().includes(term));
      }
      return true;
    });
  }, [entriesForDate, table.search]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  function handleSaveEntry(entryData) {
    if (modalMode?.entry) {
      // Edit
      setData(prev => ({
        ...prev,
        timeReports: (prev.timeReports || []).map(r => (r.reportId === modalMode.entry.reportId ? { ...r, ...entryData } : r)),
      }));
      onNotify('Details updated successfully!');
    } else {
      // Add
      const newRecord = {
        reportId: `TKR-${Date.now().toString().slice(-5)}`,
        employeeId: user.employeeId,
        employeeCode: user.employeeCode || '0011223345',
        employeeName: user.displayName,
        department: user.department || 'IT Department',
        dateCreated: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
        status: 'Pending',
        ...entryData,
      };
      setData(prev => ({
        ...prev,
        timeReports: [newRecord, ...(prev.timeReports || [])],
      }));
      onNotify('Details added successfully!');
    }
    setModalMode(null);
  }

  function handleDeleteEntry() {
    if (!deletingEntry) return;
    setData(prev => ({
      ...prev,
      timeReports: (prev.timeReports || []).filter(r => r.reportId !== deletingEntry.reportId),
    }));
    setDeletingEntry(null);
    onNotify('Time report entry removed.');
  }

  function handleSubmitAllForApproval() {
    setData(prev => ({
      ...prev,
      timeReports: (prev.timeReports || []).map(r => {
        if ((r.employeeId === user.employeeId || !r.employeeId) && (r.date === targetDate || r.timeReportDate === targetDate)) {
          return { ...r, status: 'Pending' };
        }
        return r;
      }),
    }));
    onNotify('Request sent successfully!');
    onBack();
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[
      { label: 'Time Report Application', onClick: onBack },
      { label: 'Configure Time Report Application' },
    ]} />

    <PageHeading title="Configure Time Report Application" />

    {/* Top Header Card */}
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 20px', marginBottom: 18 }}>
      <small className="muted" style={{ fontSize: 11 }}>Time Report Date</small>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginTop: 2 }}>{targetDate}</div>
    </div>

    {/* Toolbar */}
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
      </div>
      <div className="hrm-toolbar-right" style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="hrm-btn primary" onClick={() => setModalMode('add')}>
          <Plus size={14} /> Add
        </button>
        <button type="button" className="hrm-btn outline" onClick={() => onNotify('Batch timesheet entries imported.')}>
          <UploadSimple size={14} /> Upload
        </button>
      </div>
    </div>

    <DataTable
      columns={[
        { key: 'dateCreated', label: 'Date Created' },
        { key: 'chargeCode', label: 'Charge Code' },
        { key: 'chargeAccount', label: 'Charge Account' },
        { key: 'startTime', label: 'Time Start' },
        { key: 'endTime', label: 'Time End' },
        { key: 'durationHours', label: 'Duration in Hours' },
        { key: 'status', label: 'Status' },
      ]}
      rows={pageRows}
      total={filtered.length}
      rowKey={row => row.reportId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No entries recorded for this date yet. Click + Add to configure."
      renderCell={(row, col) => {
        if (col.key === 'chargeCode') {
          return <span style={{ fontWeight: 600, color: 'var(--violet)' }}>{row.chargeCode}</span>;
        }
        if (col.key === 'status') {
          return <StatusText status={row.status} />;
        }
        return formatCell(row[col.key], col.type);
      }}
      actions={row => [
        { kind: 'edit', label: 'Edit', onSelect: () => setModalMode({ mode: 'edit', entry: row }) },
        { kind: 'delete', label: 'Delete', onSelect: () => setDeletingEntry(row) },
      ]}
    />

    <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 10, marginTop: 24 }}>
      <GhostButton onClick={onBack}>Cancel</GhostButton>
      <PrimaryButton onClick={handleSubmitAllForApproval} disabled={entriesForDate.length === 0}>
        Submit
      </PrimaryButton>
    </div>

    {modalMode && <AddEditTimeReportModal
      entry={modalMode?.entry}
      existingEntries={entriesForDate}
      targetDate={targetDate}
      user={user}
      onSave={handleSaveEntry}
      onClose={() => setModalMode(null)}
    />}

    {deletingEntry && <Modal title="Confirm Delete" onClose={() => setDeletingEntry(null)} width={420}>
      <p style={{ fontSize: 12, color: '#475569', marginTop: 0 }}>
        Are you sure you want to remove charge code entry <strong>{deletingEntry.chargeCode} ({deletingEntry.chargeAccount})</strong> for {targetDate}?
      </p>
      <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <GhostButton onClick={() => setDeletingEntry(null)}>Cancel</GhostButton>
        <button type="button" className="hrm-btn danger" onClick={handleDeleteEntry}>Delete Entry</button>
      </div>
    </Modal>}
  </div>;
}

/* -------------------------------------- 4. Time Report Approval (Approver) */

function TimeReportEmailModal({ event, onClose }) {
  return <Modal title="Email Notification Preview" onClose={onClose} width={580}>
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Subject: <strong>Pending Time Report Request for Approval</strong></div>
      <div style={{ fontSize: 11, color: '#64748b' }}>Recipient: <strong>{event.approverName || 'John Collins Doe'}</strong></div>
    </div>

    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '24px 28px', color: '#1e293b' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f1f5f9', paddingBottom: 14, marginBottom: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 6, background: '#441a6b', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 14 }}>
          P&amp;A
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Time Report for Approval</h4>
          <span style={{ fontSize: 10, color: '#64748b' }}>P&amp;A Grant Thornton HRIS System</span>
        </div>
      </div>

      <p style={{ fontSize: 12, margin: '0 0 12px' }}>Dear Approver,</p>
      <p style={{ fontSize: 12, margin: '0 0 16px', color: '#475569' }}>
        A new <strong>Time Report Request</strong> has been submitted by <strong>{event.employeeName}</strong> and is awaiting your approval.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, background: '#f8fafc', padding: 14, borderRadius: 6, fontSize: 11, marginBottom: 20 }}>
        <div><span style={{ color: '#64748b' }}>Date Created:</span> <strong>{event.dateCreated}</strong></div>
        <div><span style={{ color: '#64748b' }}>Time Report Date:</span> <strong>{event.date}</strong></div>
        <div><span style={{ color: '#64748b' }}>Employee Code:</span> <strong>{event.employeeCode}</strong></div>
        <div><span style={{ color: '#64748b' }}>Employee Name:</span> <strong>{event.employeeName}</strong></div>
        <div><span style={{ color: '#64748b' }}>Department:</span> <strong>{event.department}</strong></div>
        <div><span style={{ color: '#64748b' }}>Time Start:</span> <strong>{event.startTime}</strong></div>
        <div><span style={{ color: '#64748b' }}>Time End:</span> <strong>{event.endTime}</strong></div>
        <div><span style={{ color: '#64748b' }}>Duration in Hours:</span> <strong>{event.durationHours} hrs</strong></div>
        <div><span style={{ color: '#64748b' }}>Charge Code:</span> <strong>{event.chargeCode}</strong></div>
        <div><span style={{ color: '#64748b' }}>Charge Account:</span> <strong>{event.chargeAccount}</strong></div>
        <div><span style={{ color: '#64748b' }}>Project:</span> <strong>{event.project || event.projectName}</strong></div>
        <div><span style={{ color: '#64748b' }}>Activity:</span> <strong>{event.activity}</strong></div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <button type="button" className="hrm-btn primary" onClick={onClose} style={{ padding: '8px 24px', fontSize: 12 }}>
          Review for Approval
        </button>
      </div>
    </div>

    <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
      <GhostButton onClick={onClose}>Close</GhostButton>
    </div>
  </Modal>;
}

function TimeReportApprovalScreen({ data, setData, user, onNotify }) {
  const [tab, setTab] = useState('All');
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [approvingItem, setApprovingItem] = useState(null);
  const [rejectingItem, setRejectingItem] = useState(null);
  const [viewingItem, setViewingItem] = useState(null);
  const [emailPreviewItem, setEmailPreviewItem] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const reports = data.timeReports || [];

  const filtered = useMemo(() => {
    return reports.filter(row => {
      if (tab !== 'All' && row.status !== tab) return false;
      const term = table.search.trim().toLowerCase();
      if (term) {
        const matches = [row.chargeCode, row.chargeAccount, row.employeeCode, row.employeeName, row.date, row.status]
          .some(v => String(v ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return Object.entries(table.filters).every(([key, value]) => {
        if (!value) return true;
        return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
      });
    });
  }, [reports, tab, table.search, table.filters]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  function exportApprovalRows(format) {
    const headers = ['Date Created', 'Charge Code', 'Charge Account', 'Employee Code', 'Employee Name', 'Time Start', 'Time End', 'Duration in Hours', 'Status'];
    const rows = filtered.map(r => [r.dateCreated, r.chargeCode, r.chargeAccount, r.employeeCode, r.employeeName, r.startTime, r.endTime, `${r.durationHours} hrs`, r.status]);
    downloadFile(`time-report-approvals.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Time report approvals exported to ${format}.`);
  }

  function handleDecision(item, newStatus) {
    setData(prev => ({
      ...prev,
      timeReports: (prev.timeReports || []).map(r => (r.reportId === item.reportId ? { ...r, status: newStatus, approverRemarks: remarks || '-' } : r)),
    }));
    setApprovingItem(null);
    setRejectingItem(null);
    setRemarks('');
    onNotify('Status updated successfully!');
  }

  return <div className="hrm-ss-content">
    <PageHeading title="Time Report Approval" />

    {/* Status Tabs */}
    <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e2e8f0', marginBottom: 16 }}>
      {['All', 'Pending', 'Approved', 'Rejected'].map(st => (
        <button
          key={st}
          type="button"
          onClick={() => { setTab(st); table.setPage(1); }}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            fontSize: 12,
            fontWeight: tab === st ? 700 : 500,
            color: tab === st ? 'var(--violet)' : '#64748b',
            borderBottom: tab === st ? '2px solid var(--violet)' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          {st}
        </button>
      ))}
    </div>

    {/* Toolbar */}
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right" style={{ display: 'flex', gap: 8 }}>
        <ExportMenu onExport={exportApprovalRows} disabled={filtered.length === 0} />
      </div>
    </div>

    <DataTable
      columns={[
        { key: 'dateCreated', label: 'Date Created' },
        { key: 'chargeCode', label: 'Charge Code' },
        { key: 'chargeAccount', label: 'Charge Account' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'employeeName', label: 'Employee Name' },
        { key: 'startTime', label: 'Time Start' },
        { key: 'endTime', label: 'Time End' },
        { key: 'durationHours', label: 'Duration in Hours' },
        { key: 'status', label: 'Status' },
      ]}
      rows={pageRows}
      total={filtered.length}
      rowKey={row => row.reportId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No time report approval requests."
      renderCell={(row, col) => {
        if (col.key === 'chargeCode') {
          return <span style={{ fontWeight: 600, color: 'var(--violet)' }}>{row.chargeCode}</span>;
        }
        if (col.key === 'status') {
          return <StatusText status={row.status} />;
        }
        return formatCell(row[col.key], col.type);
      }}
      actions={row => [
        ...(row.status === 'Pending' ? [
          { kind: 'approve', label: 'Approve', onSelect: () => { setApprovingItem(row); setRemarks(''); } },
          { kind: 'reject', label: 'Reject', onSelect: () => { setRejectingItem(row); setRemarks(''); } },
        ] : []),
        { kind: 'view', label: 'View', onSelect: () => setViewingItem(row) },
        { kind: 'preview', label: 'Email Preview', onSelect: () => setEmailPreviewItem(row) },
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'chargeCode', label: 'Charge Code', options: [...new Set(reports.map(r => r.chargeCode))] },
        { key: 'chargeAccount', label: 'Charge Account', options: [...new Set(reports.map(r => r.chargeAccount))] },
        { key: 'employeeName', label: 'Employee Name' },
        { key: 'employeeCode', label: 'Employee Code' },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {/* Approve Request Modal */}
    {approvingItem && <Modal title="Approve Request" onClose={() => setApprovingItem(null)} width={520}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#f8fafc', padding: 14, borderRadius: 6, fontSize: 11, marginBottom: 16 }}>
        <div><span style={{ color: '#64748b' }}>Date Created:</span> <strong>{approvingItem.dateCreated}</strong></div>
        <div><span style={{ color: '#64748b' }}>Time Report Date:</span> <strong>{approvingItem.date}</strong></div>
        <div><span style={{ color: '#64748b' }}>Employee Code:</span> <strong>{approvingItem.employeeCode}</strong></div>
        <div><span style={{ color: '#64748b' }}>Employee Name:</span> <strong>{approvingItem.employeeName}</strong></div>
        <div><span style={{ color: '#64748b' }}>Department:</span> <strong>{approvingItem.department}</strong></div>
        <div><span style={{ color: '#64748b' }}>Time Start:</span> <strong>{approvingItem.startTime}</strong></div>
        <div><span style={{ color: '#64748b' }}>Time End:</span> <strong>{approvingItem.endTime}</strong></div>
        <div><span style={{ color: '#64748b' }}>Duration:</span> <strong>{approvingItem.durationHours} hrs</strong></div>
        <div><span style={{ color: '#64748b' }}>Charge Code:</span> <strong>{approvingItem.chargeCode}</strong></div>
        <div><span style={{ color: '#64748b' }}>Charge Account:</span> <strong>{approvingItem.chargeAccount}</strong></div>
      </div>

      <Field label="Approver Remarks">
        <textarea
          rows={3}
          value={remarks}
          onChange={e => setRemarks(e.target.value)}
          placeholder="Input approver remarks"
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
        />
      </Field>

      <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <GhostButton onClick={() => setApprovingItem(null)}>Cancel</GhostButton>
        <button
          type="button"
          className="hrm-btn primary"
          style={{ background: '#16a34a', borderColor: '#16a34a', color: '#fff' }}
          onClick={() => handleDecision(approvingItem, 'Approved')}
        >
          ✓ Approve
        </button>
      </div>
    </Modal>}

    {/* Reject Request Modal */}
    {rejectingItem && <Modal title="Reject Request" onClose={() => setRejectingItem(null)} width={520}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#f8fafc', padding: 14, borderRadius: 6, fontSize: 11, marginBottom: 16 }}>
        <div><span style={{ color: '#64748b' }}>Date Created:</span> <strong>{rejectingItem.dateCreated}</strong></div>
        <div><span style={{ color: '#64748b' }}>Time Report Date:</span> <strong>{rejectingItem.date}</strong></div>
        <div><span style={{ color: '#64748b' }}>Employee Code:</span> <strong>{rejectingItem.employeeCode}</strong></div>
        <div><span style={{ color: '#64748b' }}>Employee Name:</span> <strong>{rejectingItem.employeeName}</strong></div>
        <div><span style={{ color: '#64748b' }}>Department:</span> <strong>{rejectingItem.department}</strong></div>
        <div><span style={{ color: '#64748b' }}>Duration:</span> <strong>{rejectingItem.durationHours} hrs</strong></div>
        <div><span style={{ color: '#64748b' }}>Charge Code:</span> <strong>{rejectingItem.chargeCode}</strong></div>
        <div><span style={{ color: '#64748b' }}>Charge Account:</span> <strong>{rejectingItem.chargeAccount}</strong></div>
      </div>

      <Field label="Approver Remarks" required>
        <textarea
          rows={3}
          value={remarks}
          onChange={e => setRemarks(e.target.value)}
          placeholder="Input approver rejection reason"
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
        />
      </Field>

      <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <GhostButton onClick={() => setRejectingItem(null)}>Cancel</GhostButton>
        <button
          type="button"
          className="hrm-btn danger"
          onClick={() => handleDecision(rejectingItem, 'Rejected')}
          disabled={!remarks.trim()}
        >
          ✕ Reject
        </button>
      </div>
    </Modal>}

    {/* View Item Modal */}
    {viewingItem && <Modal title="Time Report Entry Details" onClose={() => setViewingItem(null)} width={520}>
      <DetailList rows={[
        { label: 'Date Created', value: viewingItem.dateCreated },
        { label: 'Time Report Date', value: viewingItem.date },
        { label: 'Employee', value: `${viewingItem.employeeName} (${viewingItem.employeeCode})` },
        { label: 'Department', value: viewingItem.department },
        { label: 'Charge Code', value: viewingItem.chargeCode },
        { label: 'Charge Account', value: viewingItem.chargeAccount },
        { label: 'Project', value: viewingItem.project || viewingItem.projectName },
        { label: 'Team', value: viewingItem.team },
        { label: 'Activity', value: viewingItem.activity },
        { label: 'Time Start - End', value: `${viewingItem.startTime} - ${viewingItem.endTime}` },
        { label: 'Duration in Hours', value: `${viewingItem.durationHours} hrs` },
        { label: 'Type of Hours', value: viewingItem.typeOfHours },
        { label: 'Status', value: <StatusText status={viewingItem.status} /> },
        { label: 'Approver Remarks', value: viewingItem.approverRemarks || '-' },
      ]} />
      <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <PrimaryButton onClick={() => setViewingItem(null)}>Close</PrimaryButton>
      </div>
    </Modal>}

    {emailPreviewItem && <TimeReportEmailModal event={emailPreviewItem} onClose={() => setEmailPreviewItem(null)} />}
  </div>;
}

/* --------------------------------- 5. Time Report Management (Reports Tab) */

function TimeReportManagementScreen({ data, onNotify }) {
  const [tab, setTab] = useState('All');
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reports = data.timeReports || [];

  const filtered = useMemo(() => {
    return reports.filter(row => {
      if (tab !== 'All' && row.status !== tab) return false;
      const term = table.search.trim().toLowerCase();
      if (term) {
        const matches = [row.chargeCode, row.chargeAccount, row.employeeCode, row.employeeName, row.project, row.activity, row.team, row.status]
          .some(v => String(v ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return Object.entries(table.filters).every(([key, value]) => {
        if (!value) return true;
        return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
      });
    });
  }, [reports, tab, table.search, table.filters]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  function exportManagementRows(format) {
    const headers = ['Charge Code', 'Charge Account', 'Date Created', 'Employee Code', 'Employee Name', 'Project', 'Activity', 'Team', 'Time Start', 'Time End', 'Duration in Hours', 'Status'];
    const rows = filtered.map(r => [r.chargeCode, r.chargeAccount, r.dateCreated, r.employeeCode, r.employeeName, r.project, r.activity, r.team, r.startTime, r.endTime, `${r.durationHours} hrs`, r.status]);
    downloadFile(`time-report-management.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Time report management exported to ${format}.`);
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[
      { label: 'Charge Code Reports' },
      { label: 'Time Report Management' },
    ]} />

    <PageHeading title="Time Report Management" />

    {/* Status Tabs */}
    <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e2e8f0', marginBottom: 16 }}>
      {['All', 'Pending', 'Approved', 'Rejected'].map(st => (
        <button
          key={st}
          type="button"
          onClick={() => { setTab(st); table.setPage(1); }}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            fontSize: 12,
            fontWeight: tab === st ? 700 : 500,
            color: tab === st ? 'var(--violet)' : '#64748b',
            borderBottom: tab === st ? '2px solid var(--violet)' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          {st}
        </button>
      ))}
    </div>

    {/* Toolbar */}
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu onExport={exportManagementRows} disabled={filtered.length === 0} />
      </div>
    </div>

    <DataTable
      columns={[
        { key: 'chargeCode', label: 'Charge Code' },
        { key: 'chargeAccount', label: 'Charge Account' },
        { key: 'dateCreated', label: 'Date Created' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'employeeName', label: 'Employee Name' },
        { key: 'project', label: 'Project' },
        { key: 'activity', label: 'Activity' },
        { key: 'team', label: 'Team' },
        { key: 'startTime', label: 'Time Start' },
        { key: 'endTime', label: 'Time End' },
        { key: 'durationHours', label: 'Duration in Hours' },
        { key: 'status', label: 'Status' },
      ]}
      rows={pageRows}
      total={filtered.length}
      rowKey={row => row.reportId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No time report management records found."
      renderCell={(row, col) => {
        if (col.key === 'chargeCode') {
          return <span style={{ fontWeight: 600, color: 'var(--violet)' }}>{row.chargeCode}</span>;
        }
        if (col.key === 'status') {
          return <StatusText status={row.status} />;
        }
        return formatCell(row[col.key], col.type);
      }}
    />

    {/* 15-field Comprehensive Filter Drawer */}
    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'dateCreated', label: 'Date Created' },
        { key: 'chargeCode', label: 'Charge Code', options: [...new Set(reports.map(r => r.chargeCode))] },
        { key: 'chargeAccount', label: 'Charge Account', options: [...new Set(reports.map(r => r.chargeAccount))] },
        { key: 'employeeName', label: 'Employee' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'startTime', label: 'Time Start' },
        { key: 'endTime', label: 'Time End' },
        { key: 'durationHours', label: 'Duration in Hours' },
        { key: 'project', label: 'Project', options: PROJECTS },
        { key: 'activity', label: 'Activity', options: ACTIVITIES },
        { key: 'team', label: 'Team', options: TEAMS },
        { key: 'approverName', label: 'Approver' },
        { key: 'approvalTimeliness', label: 'Approval Timeliness', options: ['On Time', 'Delayed'] },
        { key: 'applicationTimeliness', label: 'Application Timeliness', options: ['On Time', 'Late Filing'] },
        { key: 'status', label: 'Status', options: ['Pending', 'Approved', 'Rejected'] },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

/* ------------------------------------------- 6. Root Charge Codes Workspace */

export function ChargeCodesWorkspace({
  data,
  setData,
  user,
  access,
  subView = 'time-report-application',
  onBack,
  onNotify,
}) {
  const [activeSubView, setActiveSubView] = useState(subView);
  const [targetConfigureDate, setTargetConfigureDate] = useState(null);
  // useState(subView) only seeds the initial render — it does not resync when
  // the sidebar's onSelectSubView changes the subView prop on an already-
  // mounted workspace, which left Time Report Approval and Charge Code
  // Reports permanently unreachable once Time Report Application had mounted
  // first. The configure-time-report drill-down stays local: it is entered by
  // clicking a row, not by the subView prop changing, so this effect never
  // fires during that transition.
  useEffect(() => setActiveSubView(subView), [subView]);

  function handleConfigureDate(dateStr) {
    setTargetConfigureDate(dateStr);
    setActiveSubView('configure-time-report');
  }

  return <div className="hrm-ss-content">
    {activeSubView === 'time-report-application' && (
      <TimeReportApplicationScreen
        data={data}
        setData={setData}
        user={user}
        onConfigureDate={handleConfigureDate}
        onNotify={onNotify}
      />
    )}

    {activeSubView === 'configure-time-report' && (
      <ConfigureTimeReportScreen
        targetDate={targetConfigureDate || '08/16/2026'}
        data={data}
        setData={setData}
        user={user}
        onBack={() => setActiveSubView('time-report-application')}
        onNotify={onNotify}
      />
    )}

    {activeSubView === 'time-report-approval' && (
      <TimeReportApprovalScreen
        data={data}
        setData={setData}
        user={user}
        onNotify={onNotify}
      />
    )}

    {activeSubView === 'charge-code-reports' && (
      <TimeReportManagementScreen
        data={data}
        onNotify={onNotify}
      />
    )}
  </div>;
}
