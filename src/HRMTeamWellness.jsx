/**
 * The two Management & Approvals groups the sidebar advertises but had no
 * screens behind them: Validation of Team Members and Health and Wellness
 * Approval.
 *
 * Both are approver screens, so they follow the same anatomy as the rest of
 * Management & Approvals — breadcrumb, status tabs, search, export, a table
 * with row actions and a decision modal.
 */

import { useMemo, useState } from 'react';
import { managementGroupByKey } from './hrmManagement.js';
import { findEmployee } from './hrmData.js';
import { REQUEST_STATUSES } from './requestWorkflow.js';
import { downloadFile } from './fileDownload.js';
import {
  Breadcrumbs,
  DataTable,
  DetailList,
  ExportMenu,
  Field,
  formatCell,
  GhostButton,
  Modal,
  PageHeading,
  PrimaryButton,
  SearchInput,
  StatusTabs,
  StatusText,
  formatDate,
  paginate,
  useTableState,
} from './HRMKit.jsx';

const today = () => new Date().toISOString().slice(0, 10);

const toCsv = (headers, rows) => [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

/* --------------------------------------------- validation of team members */

/**
 * Validation of Team Members (BRD HT100).
 *
 * The reporting line is what every approval routes on, so an approver has to
 * be able to see and confirm it.  Each row is one person whose requests reach
 * this approver, and validating the row records that the line and its
 * authorities were checked rather than assumed.
 */
export function TeamValidationScreen({ screen, data, setData, requests = [], actor, teamEmployeeIds = [], onBack, onNotify }) {
  const table = useTableState();
  const [statusTab, setStatusTab] = useState('All');
  const [confirming, setConfirming] = useState(null);
  const [remarks, setRemarks] = useState('');

  const rows = useMemo(() => {
    const validations = data.teamValidations || [];
    return (data.employees || [])
      .filter(employee => employee.employeeId !== actor.employeeId)
      .filter(employee => employee.managerId === actor.employeeId || teamEmployeeIds.includes(employee.employeeId))
      .map(employee => {
        const validation = validations.find(entry => entry.employeeId === employee.employeeId);
        const openRequests = requests.filter(request => request.employeeId === employee.employeeId
          && request.status === REQUEST_STATUSES.PENDING_APPROVAL).length;
        return {
          ...employee,
          openRequests,
          // Authority follows the reporting line: a direct report's leave,
          // timesheets and overtime route to whoever manages them.
          authority: employee.managerId === actor.employeeId
            ? 'Leave, Timesheets, Overtime of direct report'
            : 'Assigned employee — view only',
          status: validation ? 'Validated' : 'For Validation',
          validatedOn: validation?.validatedOn || '',
          validatedBy: validation?.validatedBy || '',
          validationRemarks: validation?.remarks || '',
        };
      });
  }, [data.employees, data.teamValidations, requests, actor.employeeId, teamEmployeeIds]);

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return rows.filter(row => {
      if (statusTab !== 'All' && row.status !== statusTab) return false;
      if (term && !`${row.name} ${row.employeeCode} ${row.position}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, statusTab, table.search]);

  const columns = [
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'name', label: 'Employee Full Name' },
    { key: 'position', label: 'Job Title' },
    { key: 'department', label: 'Department' },
    { key: 'authority', label: 'Approval Authority' },
    { key: 'openRequests', label: 'Open Requests', align: 'right' },
    { key: 'status', label: 'Validation Status' },
    { key: 'validatedOn', label: 'Validated On', type: 'date' },
  ];

  function validate() {
    const employee = confirming;
    setData(current => ({
      ...current,
      teamValidations: [
        ...(current.teamValidations || []).filter(entry => entry.employeeId !== employee.employeeId),
        { employeeId: employee.employeeId, validatedOn: today(), validatedBy: actor.displayName, remarks },
      ],
    }));
    onNotify('Status updated successfully!');
    setConfirming(null);
    setRemarks('');
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[{ label: managementGroupByKey(screen.group)?.label, onClick: onBack }, { label: screen.title }]} />
    <PageHeading title={screen.title} />
    <StatusTabs tabs={['All', 'For Validation', 'Validated']} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} />
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu
          disabled={filtered.length === 0}
          onExport={format => {
            downloadFile(
              `team-validation.${format === 'PDF' ? 'txt' : 'csv'}`,
              toCsv(columns.map(column => column.label), filtered.map(row => columns.map(column => row[column.key]))),
            );
            onNotify(`${screen.title} exported to ${format}.`);
          }}
        />
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
      empty="Nobody reports to you in this company."
      renderCell={(row, column) => {
        if (column.key === 'name') return <span className="hrm-approver"><span className="hrm-avatar-sm">{row.initials}</span>{row.name}</span>;
        if (column.key === 'status') return <span className={`hrm-badge ${row.status === 'Validated' ? 'ok' : 'warn'}`}>{row.status}</span>;
        if (column.key === 'validatedOn') return row.validatedOn ? formatDate(row.validatedOn) : '-';
        // Every other column (code, title, department, authority, count) has
        // no custom rendering — falling through to `undefined` here would
        // render nothing, so the default formatter has to be called explicitly.
        return formatCell(row[column.key], column.type);
      }}
      actions={row => [{
        kind: 'view',
        label: row.status === 'Validated' ? 'Re-validate' : 'Validate',
        onSelect: () => { setConfirming(row); setRemarks(row.validationRemarks || ''); },
      }]}
    />

    {confirming && <Modal
      title="Validate Team Member"
      onClose={() => setConfirming(null)}
      footer={<>
        <GhostButton onClick={() => setConfirming(null)}>Cancel</GhostButton>
        <PrimaryButton icon={false} onClick={validate}>Confirm</PrimaryButton>
      </>}
    >
      <DetailList groups={[
        { pair: [{ label: 'Employee', value: confirming.name }, { label: 'Employee Code', value: confirming.employeeCode }] },
        { pair: [{ label: 'Job Title', value: confirming.position }, { label: 'Department', value: confirming.department }] },
        { label: 'Approval Authority', value: confirming.authority },
        { label: 'Open Requests Routed to You', value: String(confirming.openRequests) },
      ]} />
      <Field label="Remarks">
        <textarea rows={3} value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Confirm the reporting line and approval authority" />
      </Field>
    </Modal>}
  </div>;
}

/* ----------------------------------------------- health and wellness */

/**
 * Health and Wellness participation approval (BRD HT072).
 *
 * Employees opt into wellness programmes from their dashboard.  A programme
 * with a headcount or a budget needs those joins confirmed, so each one is a
 * decision here rather than an automatic enrolment.
 */
export function WellnessApprovalScreen({ screen, data, setData, actor, teamEmployeeIds = [], onBack, onNotify }) {
  const table = useTableState();
  const [statusTab, setStatusTab] = useState('Pending');
  const [decision, setDecision] = useState(null);
  const [remarks, setRemarks] = useState('');

  const rows = useMemo(() => {
    const events = data.wellness?.events || [];
    const scope = new Set(teamEmployeeIds);
    return (data.wellness?.participation || [])
      .filter(entry => entry.joined && scope.has(entry.employeeId))
      .map(entry => {
        const employee = findEmployee(data, entry.employeeId);
        const event = events.find(row => row.id === entry.eventId);
        return {
          ...entry,
          employeeName: employee?.name || entry.employeeId,
          initials: employee?.initials || '',
          department: employee?.department || '',
          programme: event?.title || '',
          startDate: event?.startDate || '',
          endDate: event?.endDate || '',
          // A join nobody has decided on yet is waiting on this approver.
          status: entry.approvalStatus || 'Pending',
          statusDate: entry.statusDate || '',
        };
      })
      .filter(row => row.programme);
  }, [data, teamEmployeeIds]);

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return rows.filter(row => {
      if (statusTab !== 'All' && row.status !== statusTab) return false;
      if (term && !`${row.employeeName} ${row.programme}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, statusTab, table.search]);

  const columns = [
    { key: 'employeeName', label: 'Employee Full Name' },
    { key: 'department', label: 'Department' },
    { key: 'programme', label: 'Programme' },
    { key: 'startDate', label: 'Start Date', type: 'date' },
    { key: 'endDate', label: 'End Date', type: 'date' },
    { key: 'status', label: 'Status' },
    { key: 'statusDate', label: 'Status Date', type: 'date' },
  ];

  function decide(kind) {
    const target = decision.row;
    setData(current => ({
      ...current,
      wellness: {
        ...current.wellness,
        participation: (current.wellness?.participation || []).map(entry => entry.participationId === target.participationId
          ? {
              ...entry,
              approvalStatus: kind === 'approve' ? 'Approved' : 'Rejected',
              statusDate: today(),
              approverRemarks: remarks,
              actionedBy: actor.displayName,
            }
          : entry),
      },
    }));
    onNotify('Status updated successfully!');
    setDecision(null);
    setRemarks('');
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[{ label: managementGroupByKey(screen.group)?.label, onClick: onBack }, { label: screen.title }]} />
    <PageHeading title={screen.title} />
    <StatusTabs tabs={['All', 'Pending', 'Approved', 'Rejected']} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} />
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu
          disabled={filtered.length === 0}
          onExport={format => {
            downloadFile(
              `wellness-approval.${format === 'PDF' ? 'txt' : 'csv'}`,
              toCsv(columns.map(column => column.label), filtered.map(row => columns.map(column => row[column.key]))),
            );
            onNotify(`${screen.title} exported to ${format}.`);
          }}
        />
      </div>
    </div>
    <DataTable
      columns={columns}
      rows={paginate(filtered, table.page, table.pageSize)}
      total={filtered.length}
      rowKey={row => row.participationId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No wellness participation is waiting on this approver."
      renderCell={(row, column) => {
        if (column.key === 'employeeName') return <span className="hrm-approver"><span className="hrm-avatar-sm">{row.initials}</span>{row.employeeName}</span>;
        if (column.key === 'status') return <StatusText status={row.status} />;
        if (column.key === 'startDate' || column.key === 'endDate' || column.key === 'statusDate') {
          return row[column.key] ? formatDate(row[column.key]) : '-';
        }
        // Department and Programme have no custom rendering; falling
        // through to `undefined` would render nothing, since DataTable only
        // falls back to the default formatter when no renderCell is passed.
        return formatCell(row[column.key], column.type);
      }}
      actions={row => row.status !== 'Pending' ? [] : [
        { kind: 'view', label: 'Approve', onSelect: () => { setDecision({ row, mode: 'approve' }); setRemarks(''); } },
        { kind: 'cancel', label: 'Reject', onSelect: () => { setDecision({ row, mode: 'reject' }); setRemarks(''); } },
      ]}
    />

    {decision && <Modal
      title={decision.mode === 'approve' ? 'Approve Participation' : 'Reject Participation'}
      onClose={() => setDecision(null)}
      footer={<>
        <GhostButton onClick={() => setDecision(null)}>Cancel</GhostButton>
        <PrimaryButton icon={false} onClick={() => decide(decision.mode)}>Confirm</PrimaryButton>
      </>}
    >
      <DetailList groups={[
        { pair: [{ label: 'Employee', value: decision.row.employeeName }, { label: 'Department', value: decision.row.department }] },
        { label: 'Programme', value: decision.row.programme },
        { pair: [
          { label: 'Start Date', value: formatDate(decision.row.startDate) || '—' },
          { label: 'End Date', value: formatDate(decision.row.endDate) || '—' },
        ] },
      ]} />
      <Field label="Remarks">
        <textarea rows={3} value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Input remarks" />
      </Field>
    </Modal>}
  </div>;
}
