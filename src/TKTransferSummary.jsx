/**
 * Timekeeping ▸ Transfer Request Summary, as in Atlas Core: every transfer
 * request filed in the company (from Employee Self-Service ▸ Work and Shift ▸
 * Transfer Request Application), with a filter, export and a view.
 */
import { useMemo, useState } from 'react';
import { DataTable, ExportMenu, FilterButton, GhostButton, Modal, PageHeading, SearchInput, StatusPill, formatDate, paginate, shortStatus, useTableState } from './HRMKit.jsx';
import { findEmployee } from './hrmData.js';
import { readRequests, seedRequestsIfEmpty } from './requestService.js';
import { seedApplications } from './hrmApplications.js';
import { REQUEST_TYPES } from './requestWorkflow.js';
import { readActiveCompanyId } from './companyRepository.js';
import { downloadFile } from './fileDownload.js';

const COLUMNS = [
  { key: 'employeeName', label: 'Employee Name' },
  { key: 'applicationDate', label: 'Application Date', type: 'date' },
  { key: 'transferType', label: 'Transfer Type' },
  { key: 'currentAssignment', label: 'Current Assignment' },
  { key: 'currentJobTitle', label: 'Current Job Title' },
  { key: 'newAssignment', label: 'New Assignment' },
  { key: 'effectivityDate', label: 'Effectivity Date', type: 'date' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'reason', label: 'Reason' },
];
const FILTERS = [
  ['applicationDate', 'Application Date', 'date'],
  ['transferType', 'Transfer Type'],
  ['currentAssignment', 'Current Assignment'],
  ['currentJobTitle', 'Current Job Title'],
  ['newAssignment', 'New Assignment'],
  ['effectivityDate', 'Effective Date', 'date'],
  ['status', 'Status'],
];

export function TransferRequestSummaryScreen({ data, onNotify }) {
  const companyId = data.companyId || readActiveCompanyId();
  const table = useTableState();
  const [filters, setFilters] = useState({});
  const [draftFilters, setDraftFilters] = useState({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewing, setViewing] = useState(null);

  const rows = useMemo(() => {
    seedRequestsIfEmpty(companyId, seedApplications(data.employees || []));
    return readRequests(companyId, { activeCompanyId: companyId })
      .filter(request => request.requestType === REQUEST_TYPES.TRANSFER)
      .map(request => ({ ...request.requestDetails, id: request.requestId, employeeName: findEmployee(data, request.employeeId)?.name || request.employeeId, status: shortStatus(request.status), applicationDate: request.requestDetails?.applicationDate || String(request.createdAt || '').slice(0, 10) }))
      .sort((a, b) => String(b.applicationDate).localeCompare(String(a.applicationDate)));
  }, [companyId, data]);

  const options = key => [...new Set(rows.map(row => row[key]).filter(Boolean))];
  const filtered = rows.filter(row => {
    if (table.search && !Object.values(row).join(' ').toLowerCase().includes(table.search.toLowerCase())) return false;
    return Object.entries(filters).every(([key, value]) => !value || String(row[key] ?? '') === value);
  });
  const exportRows = format => {
    if (format !== 'Excel') return onNotify('This summary exports to Excel only.', 'bad');
    const csv = [COLUMNS.map(column => column.label), ...filtered.map(row => COLUMNS.map(column => row[column.key]))].map(line => line.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile('transfer-request-summary.csv', csv, 'text/csv');
    onNotify(`${filtered.length} transfer request(s) exported.`);
  };
  const activeFilters = Object.values(filters).filter(Boolean).length;

  return <div className="hrm-workspace">
    <PageHeading title="Transfer Request Summary" actions={<ExportMenu onExport={exportRows} disabled={!filtered.length} />} />
    <div className="hrm-toolbar">
      <SearchInput value={table.search} onChange={table.setSearch} />
      <FilterButton active={activeFilters > 0} onClick={() => { setDraftFilters(filters); setFilterOpen(true); }} />
    </div>
    <DataTable
      columns={COLUMNS}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={row => row.id}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No transfer requests filed yet."
      renderCell={(row, column) => column.type === 'status' ? <StatusPill status={row.status} /> : column.type === 'date' ? formatDate(row[column.key]) : (row[column.key] || '—')}
      actions={row => [{ kind: 'view', label: 'View', onSelect: () => setViewing(row) }]}
    />
    {filterOpen && <Modal title="Filter" onClose={() => setFilterOpen(false)} footer={<><GhostButton onClick={() => { setDraftFilters({}); setFilters({}); table.setPage(1); setFilterOpen(false); }}>Reset</GhostButton><button type="button" className="hrm-btn primary" onClick={() => { setFilters(draftFilters); table.setPage(1); setFilterOpen(false); }}>Apply Filter</button></>}>
      <div className="hrm-form"><div className="hrm-form-grid">{FILTERS.map(([key, label]) => <label key={key} className="hrm-form-field"><span className="hrm-form-label">{label}</span><select value={draftFilters[key] || ''} onChange={event => setDraftFilters({ ...draftFilters, [key]: event.target.value })}><option value="">All</option>{options(key).map(value => <option key={value} value={value}>{key.endsWith('Date') ? formatDate(value) : value}</option>)}</select></label>)}</div></div>
    </Modal>}
    {viewing && <Modal title="View Transfer Request" onClose={() => setViewing(null)} footer={<GhostButton onClick={() => setViewing(null)}>Close</GhostButton>}>
      <dl className="hrm-detail-list">{[...COLUMNS, { key: 'newJobTitle', label: 'New Job Title' }, { key: 'statusDate', label: 'Status Date', type: 'date' }].map(column => <div key={column.key} style={{ display: 'contents' }}><dt>{column.label}</dt><dd>{column.type === 'date' ? formatDate(viewing[column.key]) : (viewing[column.key] || '—')}</dd></div>)}</dl>
    </Modal>}
  </div>;
}
