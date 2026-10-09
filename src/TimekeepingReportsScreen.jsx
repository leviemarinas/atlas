/**
 * Timekeeping Reports (BRD HT266-HT287).
 *
 * One screen serves all eight reports: the selector picks an entry from
 * `timekeepingReportCatalog` and this component renders that entry's columns,
 * rows and grand total.  Adding a report means adding a catalog entry, never
 * editing this file.
 *
 * Scope follows the rest of the module — `access.canApproveTeamRequests` is
 * what turns the roster on, and the "View Personal Records" toggle narrows it
 * back to the signed-in user.  The period, department and employee-group
 * selectors are the BRD's "report selector", and the grand total and headcount
 * restate themselves from whatever survives the filters.
 */

import { useMemo, useState } from 'react';
import {
  DataTable,
  ExportMenu,
  PageHeading,
  SearchInput,
  paginate,
  useTableState,
} from './HRMKit.jsx';
import { downloadFile } from './fileDownload.js';
import { logsForMany } from './timekeepingData.js';
import {
  logsInPeriod,
  rateForEmployee,
  reportHeadcount,
  reportTotals,
  timekeepingReportCatalog,
} from './timekeepingReports.js';

const toCsv = (headers, rows) => [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

const ALL = 'All';

function PersonalToggle({ checked, onChange }) {
  return <label className="hrm-toggle">
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    <span className="hrm-toggle-track"><span className="hrm-toggle-thumb" /></span>
    <span>View Personal Records</span>
  </label>;
}

export function TimekeepingReportsScreen({ data, user, access, employees, teamEmployeeIds, onNotify }) {
  const isApprover = access.canApproveTeamRequests;
  const table = useTableState();
  const [selectedKey, setSelectedKey] = useState(timekeepingReportCatalog[0].key);
  const [viewPersonal, setViewPersonal] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [department, setDepartment] = useState(ALL);
  const [employeeGroup, setEmployeeGroup] = useState(ALL);

  const definition = timekeepingReportCatalog.find(entry => entry.key === selectedKey) || timekeepingReportCatalog[0];

  const departments = useMemo(() => [ALL, ...new Set(employees.map(employee => employee.department).filter(Boolean))], [employees]);
  const employeeGroups = useMemo(() => [ALL, ...new Set(employees.map(employee => employee.employmentType).filter(Boolean))], [employees]);

  /** The roster the report covers, after the report selector narrows it. */
  const scopedEmployees = useMemo(() => {
    const withinTeam = employees.filter(employee => teamEmployeeIds.includes(employee.employeeId));
    const personal = !isApprover || viewPersonal;
    return withinTeam.filter(employee => {
      if (personal && employee.employeeId !== user.employeeId) return false;
      if (department !== ALL && employee.department !== department) return false;
      if (employeeGroup !== ALL && employee.employmentType !== employeeGroup) return false;
      return true;
    });
  }, [employees, teamEmployeeIds, isApprover, viewPersonal, user.employeeId, department, employeeGroup]);

  const rows = useMemo(() => {
    const scopedIds = scopedEmployees.map(employee => employee.employeeId);
    const logs = logsInPeriod(logsForMany(data, scopedIds), dateFrom, dateTo);
    const built = definition.build({ logs, employees: scopedEmployees, rateFor: id => rateForEmployee(data, id) });
    const term = table.search.trim().toLowerCase();
    if (!term) return built;
    return built.filter(row => definition.columns.some(column => String(row[column.key] ?? '').toLowerCase().includes(term)));
  }, [data, scopedEmployees, dateFrom, dateTo, definition, table.search]);

  const totals = useMemo(() => reportTotals(definition, rows), [definition, rows]);
  const headcount = reportHeadcount(rows);
  const pageRows = paginate(rows, table.page, table.pageSize);

  function exportRows(format) {
    const headers = definition.columns.map(column => column.label);
    const body = rows.map(row => definition.columns.map(column => row[column.key]));
    if (totals) body.push(definition.columns.map(column => totals[column.key]));
    const period = dateFrom || dateTo ? `${dateFrom || 'start'}_to_${dateTo || 'today'}` : 'all-periods';
    downloadFile(`${definition.key}-${period}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, body));
    onNotify(`${definition.label} exported to ${format}.`);
  }

  return <div className="hrm-workspace tk-screen">
    <PageHeading
      title="Timekeeping Reports"
      eyebrow={`${definition.brdId} · ${headcount} ${headcount === 1 ? 'employee' : 'employees'} in scope`}
    />

    <div className="hrm-report-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
      {timekeepingReportCatalog.map(entry => <button
        key={entry.key}
        type="button"
        className={`hrm-report-card ${selectedKey === entry.key ? 'selected' : ''}`}
        onClick={() => { setSelectedKey(entry.key); table.setPage(1); }}
      >
        <strong>{entry.label}</strong>
        <span>{entry.description}</span>
      </button>)}
    </div>

    <section className="hrm-panel">
      <div className="hrm-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="hrm-toolbar-left" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 className="hrm-section-title" style={{ margin: 0 }}>{definition.label}</h2>
          <SearchInput value={table.search} onChange={table.setSearch} />
          <label className="tk-report-filter">
            <span>Period</span>
            <input type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); table.setPage(1); }} aria-label="Period from" />
            <span>to</span>
            <input type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); table.setPage(1); }} aria-label="Period to" />
          </label>
          <label className="tk-report-filter">
            <span>Department</span>
            <select value={department} onChange={event => { setDepartment(event.target.value); table.setPage(1); }}>
              {departments.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="tk-report-filter">
            <span>Employee group</span>
            <select value={employeeGroup} onChange={event => { setEmployeeGroup(event.target.value); table.setPage(1); }}>
              {employeeGroups.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <div className="hrm-toolbar-right">
          {isApprover && <PersonalToggle checked={viewPersonal} onChange={value => { setViewPersonal(value); table.setPage(1); }} />}
          <ExportMenu onExport={exportRows} disabled={rows.length === 0} />
        </div>
      </div>

      <DataTable
        columns={definition.columns}
        rows={pageRows}
        footerRow={totals}
        total={rows.length}
        rowKey={row => row.key}
        page={table.page}
        pageSize={table.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        empty="No timekeeping records match this report and period."
      />
    </section>
  </div>;
}
