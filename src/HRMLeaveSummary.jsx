/**
 * Manage Approvals ▸ Leave Management ▸ Management and Approval, as in Atlas
 * Core: one row per team member with the leave codes assigned to them, the
 * days they applied for and the days approved, and a per-leave breakdown.
 */
import { useMemo, useState } from 'react';
import { DataTable, ExportMenu, GhostButton, Modal, PageHeading, SearchInput, paginate, useTableState } from './HRMKit.jsx';
import { leaveBalancesFor } from './hrmData.js';
import { downloadFile } from './fileDownload.js';

export function LeaveSummaryScreen({ screen, data, requests, teamEmployeeIds, onBack, onNotify }) {
  const table = useTableState();
  const [department, setDepartment] = useState('');
  const [viewing, setViewing] = useState(null);

  const rows = useMemo(() => {
    const team = new Set(teamEmployeeIds);
    return (data.employees || []).filter(employee => team.has(employee.employeeId)).map(employee => {
      const balances = leaveBalancesFor(data, employee.employeeId, requests);
      const approved = balances.reduce((total, row) => total + Number(row.used || 0), 0);
      const applied = approved + balances.reduce((total, row) => total + Number(row.pending || 0), 0);
      return { employeeId: employee.employeeId, employeeCode: employee.employeeCode, name: employee.name, department: employee.department, leaveCodes: balances.map(row => row.leaveType).join(', ') || '—', applied, approved, balances };
    });
  }, [data, requests, teamEmployeeIds]);

  const departments = [...new Set(rows.map(row => row.department).filter(Boolean))];
  const filtered = rows.filter(row => (!department || row.department === department) && `${row.employeeCode} ${row.name}`.toLowerCase().includes(table.search.toLowerCase()));
  const columns = [
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'name', label: 'Employee Name' },
    { key: 'department', label: 'Department' },
    { key: 'leaveCodes', label: 'Leave Codes Assigned' },
    { key: 'applied', label: 'Leave Applied', align: 'right' },
    { key: 'approved', label: 'Leave Approved', align: 'right' },
  ];
  const exportRows = format => {
    if (format !== 'Excel') return onNotify('This summary exports to Excel only.', 'bad');
    const csv = [columns.map(column => column.label), ...filtered.map(row => columns.map(column => row[column.key]))].map(line => line.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile('leave-management-summary.csv', csv, 'text/csv');
    onNotify(`${filtered.length} employee(s) exported.`);
  };

  return <div className="hrm-workspace">
    <PageHeading title={screen.title} eyebrow="Leave Management" onBack={onBack} actions={<ExportMenu onExport={exportRows} disabled={!filtered.length} />} />
    <div className="hrm-toolbar">
      <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search employee code or name..." />
      <select value={department} onChange={event => { setDepartment(event.target.value); table.setPage(1); }} aria-label="Department">
        <option value="">All departments</option>
        {departments.map(name => <option key={name}>{name}</option>)}
      </select>
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
      empty="No team members with leave assigned."
      actions={row => [{ kind: 'view', label: 'View', onSelect: () => setViewing(row) }]}
    />
    {viewing && <Modal title={`${viewing.name} — Leave Summary`} width="lg" onClose={() => setViewing(null)} footer={<GhostButton onClick={() => setViewing(null)}>Close</GhostButton>}>
      <DataTable
        columns={[{ key: 'leaveType', label: 'Leave Type' }, { key: 'accrued', label: 'Credits', align: 'right' }, { key: 'used', label: 'Approved', align: 'right' }, { key: 'pending', label: 'For Approval', align: 'right' }, { key: 'converted', label: 'Converted', align: 'right' }, { key: 'forfeited', label: 'Forfeited', align: 'right' }, { key: 'remaining', label: 'Balance', align: 'right' }]}
        rows={viewing.balances}
        total={viewing.balances.length}
        rowKey={row => row.leaveType}
        page={1}
        pageSize={Math.max(10, viewing.balances.length)}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        empty="No leave assigned."
      />
    </Modal>}
  </div>;
}
