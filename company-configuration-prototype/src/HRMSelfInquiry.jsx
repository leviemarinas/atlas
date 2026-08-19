/**
 * Employee Self-Inquiry Suite (Part 5):
 * - Loan Inquiry (List & View Loan Details with Deduction Matrix)
 * - Leave Balances & Ledger (Admin Roster with Personal Toggle & View Leave Balance)
 * - Attendance Summary (Daily Time Records, Tardiness / Undertime, Worked Hours Per Day, Top KPIs, Cut-off selector)
 */

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bank,
  CalendarBlank,
  CaretDown,
  Clock,
  ClockAfternoon,
  Coins,
  FileText,
  Funnel,
  Hourglass,
  ListNumbers,
  Plus,
  Question,
  Suitcase,
  TrendUp,
  User,
  Users,
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
import { findEmployee } from './hrmData.js';
import { acknowledgeAuthorityToDeduct, leaveLedgerFor } from './hrmPosting.js';

const toCsv = (headers, rows) => [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

/* ------------------------------------------------------------- 1. Loan Inquiry */

function LoanInquiryScreen({ data, setData, user, onNavigateSelfService, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Holding only the id — not the row itself — is what keeps the detail
  // screen live: authorising a deduction mutates `data`, and a snapshot
  // object taken at click time would never see that update.
  const [viewingLoanId, setViewingLoanId] = useState(null);

  const loans = data.loanInquiries || [];
  const viewingLoan = viewingLoanId ? loans.find(row => row.id === viewingLoanId) : null;

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return loans.filter(row => {
      if (term) {
        const matches = [row.transactionNumber, row.loanName, row.loanType, String(row.principalAmount)]
          .some(v => String(v ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return Object.entries(table.filters).every(([key, value]) => {
        if (!value) return true;
        return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
      });
    });
  }, [loans, table.search, table.filters]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  const columns = [
    { key: 'applicationDate', label: 'Application Date', type: 'date' },
    { key: 'transactionNumber', label: 'Transaction Number' },
    { key: 'loanName', label: 'Loan Name' },
    { key: 'loanType', label: 'Loan Type' },
    { key: 'principalAmount', label: 'Principal Amount', type: 'currency' },
  ];

  function exportRows(format) {
    const headers = ['Application Date', 'Transaction Number', 'Loan Name', 'Loan Type', 'Principal Amount', 'Interest Rate', 'Total Loan', 'Balance', 'Status'];
    const rows = filtered.map(row => [row.applicationDate, row.transactionNumber, row.loanName, row.loanType, row.principalAmount, `${row.interestRate}%`, row.totalLoan, row.balance, row.status]);
    downloadFile(`loan-inquiries.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Loan inquiries exported to ${format}.`);
  }

  if (viewingLoan) {
    return <ViewLoanDetailsScreen loan={viewingLoan} setData={setData} onBack={() => setViewingLoanId(null)} onNotify={onNotify} />;
  }

  return <div className="hrm-ss-content">
    <PageHeading title="Loan Inquiry" />

    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right" style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="hrm-btn primary"
          onClick={() => onNavigateSelfService?.({ group: 'loans', application: 'company-loan' })}
        >
          <Plus size={14} /> Apply for Loan
        </button>
        <ExportMenu onExport={exportRows} disabled={filtered.length === 0} />
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
      empty="No loan records found."
      actions={row => [
        { kind: 'view', label: 'View', onSelect: () => setViewingLoanId(row.id) },
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'applicationDate', label: 'Application Date', type: 'date' },
        { key: 'transactionNumber', label: 'Transaction Number' },
        { key: 'loanName', label: 'Loan Name', options: [...new Set(loans.map(row => row.loanName))] },
        { key: 'loanType', label: 'Loan Type', options: ['Government Loan', 'Company Loan'] },
        { key: 'status', label: 'Status', options: ['ACTIVE', 'CLOSED'] },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

/**
 * The employee's authority to deduct.
 *
 * A schedule exists as soon as a loan is approved, but payroll may only
 * collect against it once the employee has agreed, so the acknowledgement is
 * its own recorded step rather than something implied by the approval.
 */
function AuthorityToDeductPanel({ loan, setData, onNotify }) {
  const authority = loan.authorityToDeduct;
  if (!authority) return null;

  const totalScheduled = (loan.deductionMatrix || []).reduce((sum, row) => sum + Number(row.deductionAmount || 0), 0);

  return <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '18px 20px', marginBottom: 20 }}>
    <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 14px' }}>Authority to Deduct</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'end' }}>
      <div><small className="muted" style={{ fontSize: 11 }}>Date Advised</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{formatDate(authority.advisedOn) || '-'}</div></div>
      <div><small className="muted" style={{ fontSize: 11 }}>Payroll Cut-off for Deduction</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{loan.frequency} · {loan.paymentMode}</div></div>
      <div><small className="muted" style={{ fontSize: 11 }}>Total Authorised</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>₱ {totalScheduled.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
      <div>
        <small className="muted" style={{ fontSize: 11 }}>Status</small>
        <div style={{ marginTop: 4 }}>
          {authority.acknowledged
            ? <span className="hrm-badge ok">Authorised on {formatDate(authority.acknowledgedAt)}</span>
            : <button
                type="button"
                className="hrm-btn tiny"
                onClick={() => {
                  setData?.(current => acknowledgeAuthorityToDeduct(current, loan.id));
                  onNotify('Authority to deduct recorded successfully!');
                }}
              >I authorise this deduction</button>}
        </div>
      </div>
    </div>
  </div>;
}

function ViewLoanDetailsScreen({ loan, setData, onBack, onNotify }) {
  const table = useTableState();
  const matrixRows = loan.deductionMatrix || [];

  const filteredMatrix = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return matrixRows.filter(row => {
      if (term) return row.payoutPeriod.toLowerCase().includes(term);
      return true;
    });
  }, [matrixRows, table.search]);

  const pageMatrix = paginate(filteredMatrix, table.page, table.pageSize);

  function exportMatrix(format) {
    const headers = ['Payout Period', 'Deduction Amount'];
    const rows = filteredMatrix.map(row => [row.payoutPeriod, row.deductionAmount]);
    downloadFile(`loan-${loan.transactionNumber}-deductions.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Deduction matrix exported to ${format}.`);
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[
      { label: 'Loan Inquiry', onClick: onBack },
      { label: 'View Loan Details' },
    ]} />
    <PageHeading title="View Loan Details" />

    {/* Top Summary Grid (3 rows) */}
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <div><small className="muted" style={{ fontSize: 11 }}>Application Date</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{formatDate(loan.applicationDate)}</div></div>
        <div><small className="muted" style={{ fontSize: 11 }}>Transaction Number</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{loan.transactionNumber}</div></div>
        <div><small className="muted" style={{ fontSize: 11 }}>Loan Name</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{loan.loanName}</div></div>
        <div><small className="muted" style={{ fontSize: 11 }}>Loan Type</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{loan.loanType}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <div><small className="muted" style={{ fontSize: 11 }}>Principal Amount</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>₱ {loan.principalAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
        <div><small className="muted" style={{ fontSize: 11 }}>Interest Rate</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{loan.interestRate}%</div></div>
        <div><small className="muted" style={{ fontSize: 11 }}>Interest Amount</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>₱ {loan.interestAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
        <div><small className="muted" style={{ fontSize: 11 }}>Total Loan</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>₱ {loan.totalLoan?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <div><small className="muted" style={{ fontSize: 11 }}>Loan Terms (Months)</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{loan.loanTerms}</div></div>
        <div><small className="muted" style={{ fontSize: 11 }}>Period Start Date</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{formatDate(loan.periodStartDate)}</div></div>
        <div><small className="muted" style={{ fontSize: 11 }}>Period End Date</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{formatDate(loan.periodEndDate)}</div></div>
        <div></div>
      </div>
    </div>

    {/* Deduction Matrix Section */}
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '18px 20px', marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 14px' }}>Deduction Matrix</h3>

      <div className="hrm-toolbar" style={{ marginBottom: 12 }}>
        <div className="hrm-toolbar-left">
          <SearchInput value={table.search} onChange={table.setSearch} />
        </div>
        <div className="hrm-toolbar-right">
          <ExportMenu onExport={exportMatrix} disabled={filteredMatrix.length === 0} />
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'payoutPeriod', label: 'Payout Period', type: 'date' },
          { key: 'deductionAmount', label: 'Deduction Amount', type: 'currency' },
        ]}
        rows={pageMatrix}
        total={filteredMatrix.length}
        rowKey={row => row.payoutPeriod}
        page={table.page}
        pageSize={table.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        empty="No deduction matrix items."
      />
    </div>

    {/* Authority to Deduct (HT130 / HT141) */}
    <AuthorityToDeductPanel loan={loan} setData={setData} onNotify={onNotify} />

    {/* Bottom Summary Grid */}
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '18px 20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <div><small className="muted" style={{ fontSize: 11 }}>Payment Mode</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{loan.paymentMode}</div></div>
        <div><small className="muted" style={{ fontSize: 11 }}>Frequency</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{loan.frequency}</div></div>
        <div><small className="muted" style={{ fontSize: 11 }}>Accum. Amount (Manual)</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>₱ {loan.accumulatedPaymentManual?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
        <div><small className="muted" style={{ fontSize: 11 }}>Accum. Amount (Computed)</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>₱ {loan.accumulatedPaymentComputed?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <div><small className="muted" style={{ fontSize: 11 }}>Balance</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2, color: 'var(--violet)' }}>₱ {loan.balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
        <div><small className="muted" style={{ fontSize: 11 }}>Status</small><div style={{ marginTop: 2 }}><span className={`hrm-badge ${loan.status === 'ACTIVE' ? 'ok' : 'draft'}`}>{loan.status}</span></div></div>
        <div><small className="muted" style={{ fontSize: 11 }}>Status Date</small><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{formatDate(loan.statusDate)}</div></div>
        <div></div>
      </div>
    </div>
  </div>;
}

/* ---------------------------------------------------- 2. Leave Balances & Ledger */

function LeaveLedgerScreen({ data, requests = [], user, access, onNavigateSelfService, onNotify }) {
  const isAdmin = access?.role === 'P&A Admin' || access?.isLineManager;
  const [viewPersonal, setViewPersonal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const employees = data.employees || [];
  const currentEmp = findEmployee(data, user.employeeId) || employees[0];

  const filteredEmployees = useMemo(() => {
    if (viewPersonal) {
      return employees.filter(e => e.employeeId === currentEmp?.employeeId);
    }
    const term = table.search.trim().toLowerCase();
    return employees.filter(row => {
      if (term) {
        const matches = [row.employeeCode, row.name, row.position, row.department]
          .some(v => String(v ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return Object.entries(table.filters).every(([key, value]) => {
        if (!value) return true;
        return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
      });
    });
  }, [employees, viewPersonal, currentEmp, table.search, table.filters]);

  const pageEmployees = paginate(filteredEmployees, table.page, table.pageSize);

  function exportEmployees(format) {
    const headers = ['Employee Code', 'Employee Name', 'Job Title', 'Department'];
    const rows = filteredEmployees.map(e => [e.employeeCode, e.name, e.position, e.department]);
    downloadFile(`leave-ledger-employees.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Leave ledger exported to ${format}.`);
  }

  if (selectedEmployee) {
    return <ViewLeaveBalanceScreen employee={selectedEmployee} data={data} requests={requests} onNavigateSelfService={onNavigateSelfService} onBack={() => setSelectedEmployee(null)} onNotify={onNotify} />;
  }

  // If simple employee without admin role, show their personal leave ledger directly
  if (!isAdmin) {
    return <ViewLeaveBalanceScreen employee={currentEmp} data={data} requests={requests} onNavigateSelfService={onNavigateSelfService} onBack={null} onNotify={onNotify} />;
  }

  return <div className="hrm-ss-content">
    <PageHeading title="Leave Balances & Ledger" />

    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label className="hrm-toggle">
          <input
            type="checkbox"
            checked={viewPersonal}
            onChange={e => {
              setViewPersonal(e.target.checked);
              table.setPage(1);
            }}
          />
          <span className="hrm-toggle-track"><span className="hrm-toggle-thumb" /></span>
          <span>View Personal Records</span>
        </label>
        <ExportMenu onExport={exportEmployees} disabled={filteredEmployees.length === 0} />
      </div>
    </div>

    <DataTable
      columns={[
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'name', label: 'Employee Name' },
        { key: 'position', label: 'Job Title' },
        { key: 'department', label: 'Department' },
      ]}
      rows={pageEmployees}
      total={filteredEmployees.length}
      rowKey={row => row.employeeId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No employee records found."
      renderCell={(row, column) => {
        if (column.key === 'employeeCode') {
          return (
            <button
              type="button"
              className="hrm-link-inline"
              style={{ fontWeight: 600, color: 'var(--violet)' }}
              onClick={() => setSelectedEmployee(row)}
            >
              {row.employeeCode}
            </button>
          );
        }
        return formatCell(row[column.key], column.type);
      }}
      actions={row => [
        { kind: 'view', label: 'View Leave Balance', onSelect: () => setSelectedEmployee(row) },
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'name', label: 'Employee Name' },
        { key: 'department', label: 'Department', options: [...new Set(employees.map(e => e.department))] },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

function ViewLeaveBalanceScreen({ employee, data, requests = [], onNavigateSelfService, onBack, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The ledger is this employee's own, derived from their accrual and every
  // leave they have filed — not one table shared by the whole company.
  const ledgerRows = useMemo(
    () => leaveLedgerFor(data, requests, employee?.employeeId),
    [data, requests, employee?.employeeId],
  );

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return ledgerRows.filter(row => {
      if (term) return row.leaveType.toLowerCase().includes(term);
      return Object.entries(table.filters).every(([key, value]) => {
        if (!value) return true;
        return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
      });
    });
  }, [ledgerRows, table.search, table.filters]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  const columns = [
    { key: 'leaveType', label: 'Leave Type' },
    { key: 'balanceToday', label: 'Leave Balance as of Today' },
    { key: 'openingBalance', label: 'Opening Balance' },
    { key: 'approvedLeave', label: 'Approved Leave' },
    { key: 'leaveForApproval', label: 'Leave for Approval' },
    { key: 'leaveConverted', label: 'Leave Converted' },
    { key: 'forfeitedLeave', label: 'Forfeited Leave' },
  ];

  function exportRows(format) {
    const headers = ['Leave Type', 'Leave Balance as of Today', 'Opening Balance', 'Approved Leave', 'Leave for Approval', 'Leave Converted', 'Forfeited Leave'];
    const rows = filtered.map(r => [r.leaveType, r.balanceToday, r.openingBalance, r.approvedLeave, r.leaveForApproval, r.leaveConverted, r.forfeitedLeave]);
    downloadFile(`leave-balance-${employee?.employeeCode || 'personal'}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Leave balances exported to ${format}.`);
  }

  return <div className="hrm-ss-content">
    {onBack && (
      <Breadcrumbs trail={[
        { label: 'Leave Balances & Ledger', onClick: onBack },
        { label: 'View Leave Balance' },
      ]} />
    )}
    <PageHeading title="View Leave Balance" />

    <EmployeeBanner employee={employee} />

    <div className="hrm-toolbar" style={{ marginTop: 16 }}>
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right" style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="hrm-btn primary"
          onClick={() => onNavigateSelfService?.({ group: 'leave-application', application: 'leave' })}
        >
          <Plus size={14} /> Apply for Leave
        </button>
        <ExportMenu onExport={exportRows} disabled={filtered.length === 0} />
      </div>
    </div>

    <DataTable
      columns={columns}
      rows={pageRows}
      total={filtered.length}
      rowKey={row => row.leaveType}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No leave balance records."
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'leaveType', label: 'Leave Type', options: ledgerRows.map(r => r.leaveType) },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

/* ---------------------------------------------------- 3. Attendance Summary */

function AttendanceSummaryScreen({ data, user, access, onNotify }) {
  const isAdmin = access?.role === 'P&A Admin' || access?.isLineManager;
  const [subTab, setSubTab] = useState('dtr'); // 'dtr' | 'tardiness' | 'worked-hours'
  const [viewPersonal, setViewPersonal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const attSummary = data.attendanceSummaries || {
    cutoffLabel: 'January 15, 2025',
    currentPeriod: 'January 1-15, 2025',
    periods: ['January 1-15, 2025', 'January 16-31, 2025', 'February 1-15, 2025'],
    kpi: {
      totalWorkedHours: '100.00',
      totalOvertimeHours: '0.75',
      totalAbsences: '1',
      totalLeaveDays: '1',
      tardinessHours: '1.67',
      tardinessMins: '100',
      undertimeHours: '3.33',
      undertimeMins: '200',
      workedHoursTotal: '80.50',
    },
    logs: [],
  };

  const [period, setPeriod] = useState(attSummary.currentPeriod);
  const employees = data.employees || [];
  const currentEmp = findEmployee(data, user.employeeId) || employees[0];

  const filteredEmployees = useMemo(() => {
    if (viewPersonal) {
      return employees.filter(e => e.employeeId === currentEmp?.employeeId);
    }
    const term = table.search.trim().toLowerCase();
    return employees.filter(row => {
      if (term) {
        const matches = [row.employeeCode, row.name, row.position, row.department]
          .some(v => String(v ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return Object.entries(table.filters).every(([key, value]) => {
        if (!value) return true;
        return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
      });
    });
  }, [employees, viewPersonal, currentEmp, table.search, table.filters]);

  const pageEmployees = paginate(filteredEmployees, table.page, table.pageSize);

  function exportEmployees(format) {
    const headers = ['Date', 'Employee Code', 'Employee Full Name', 'Job Title', 'Department'];
    const rows = filteredEmployees.map(e => ['11/2/2025', e.employeeCode, e.name, e.position, e.department]);
    downloadFile(`attendance-roster-${subTab}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Attendance roster exported to ${format}.`);
  }

  if (selectedEmployee) {
    return <ViewEmployeeAttendanceScreen
      employee={selectedEmployee}
      subTab={subTab}
      setSubTab={setSubTab}
      data={data}
      period={period}
      setPeriod={setPeriod}
      onBack={() => setSelectedEmployee(null)}
      onNotify={onNotify}
    />;
  }

  return <div className="hrm-ss-content">
    <PageHeading title="Attendance Summary" />

    {/* Sub-tabs: Daily Time Records, Tardiness / Undertime, Worked Hours Per Day */}
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      <button
        type="button"
        className={`hrm-btn ${subTab === 'dtr' ? 'primary' : 'outline'}`}
        style={{ padding: '6px 18px', borderRadius: 6, fontWeight: 600, fontSize: 12 }}
        onClick={() => { setSubTab('dtr'); table.setPage(1); }}
      >
        Daily Time Records
      </button>
      <button
        type="button"
        className={`hrm-btn ${subTab === 'tardiness' ? 'primary' : 'outline'}`}
        style={{ padding: '6px 18px', borderRadius: 6, fontWeight: 600, fontSize: 12 }}
        onClick={() => { setSubTab('tardiness'); table.setPage(1); }}
      >
        Tardiness / Undertime
      </button>
      <button
        type="button"
        className={`hrm-btn ${subTab === 'worked-hours' ? 'primary' : 'outline'}`}
        style={{ padding: '6px 18px', borderRadius: 6, fontWeight: 600, fontSize: 12 }}
        onClick={() => { setSubTab('worked-hours'); table.setPage(1); }}
      >
        Worked Hours Per Day
      </button>
    </div>

    {/* Top 4 KPI Cards per Tab */}
    {subTab === 'dtr' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Total Worked Hours</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>{attSummary.kpi.totalWorkedHours}</strong>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Total Overtime Hours</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>{attSummary.kpi.totalOvertimeHours}</strong>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Total Absences</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>{attSummary.kpi.totalAbsences}</strong>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Total Leave Days</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>{attSummary.kpi.totalLeaveDays}</strong>
        </div>
      </div>
    )}

    {subTab === 'tardiness' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Tardiness (in Hours)</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>{attSummary.kpi.tardinessHours}</strong>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Tardiness (in Mins)</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>{attSummary.kpi.tardinessMins}</strong>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Undertime (in Hours)</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>{attSummary.kpi.undertimeHours}</strong>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Undertime (in Mins)</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>{attSummary.kpi.undertimeMins}</strong>
        </div>
      </div>
    )}

    {subTab === 'worked-hours' && (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 20px', marginBottom: 16, width: 280 }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>Worked Hours</span>
        <strong style={{ display: 'block', fontSize: 28, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>{attSummary.kpi.workedHoursTotal}</strong>
      </div>
    )}

    {/* Cutoff / Period Selector Strip */}
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginBottom: 14 }}>
      <span style={{ fontSize: 11, color: '#64748b' }}>Cut-off: <strong>{attSummary.cutoffLabel}</strong></span>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>Current Period:</span>
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 11 }}
        >
          {attSummary.periods.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
    </div>

    {/* Toolbar */}
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label className="hrm-toggle">
          <input
            type="checkbox"
            checked={viewPersonal}
            onChange={e => {
              setViewPersonal(e.target.checked);
              table.setPage(1);
            }}
          />
          <span className="hrm-toggle-track"><span className="hrm-toggle-thumb" /></span>
          <span>View Personal Records</span>
        </label>
        <ExportMenu onExport={exportEmployees} disabled={filteredEmployees.length === 0} />
      </div>
    </div>

    {/* Roster Table */}
    <DataTable
      columns={[
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'name', label: 'Employee Full Name' },
        { key: 'position', label: 'Job Title' },
        { key: 'department', label: 'Department' },
      ]}
      rows={pageEmployees.map(e => ({ ...e, date: '11/2/2025' }))}
      total={filteredEmployees.length}
      rowKey={row => row.employeeId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No employee attendance records."
      renderCell={(row, column) => {
        if (column.key === 'employeeCode') {
          return (
            <button
              type="button"
              className="hrm-link-inline"
              style={{ fontWeight: 600, color: 'var(--violet)' }}
              onClick={() => setSelectedEmployee(row)}
            >
              {row.employeeCode}
            </button>
          );
        }
        if (column.key === 'name') {
          return `${row.name}${row.employeeId === currentEmp?.employeeId ? ' (Me)' : ''}`;
        }
        return formatCell(row[column.key], column.type);
      }}
      actions={row => [
        { kind: 'view', label: 'View Records', onSelect: () => setSelectedEmployee(row) },
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'name', label: 'Employee Name' },
        { key: 'department', label: 'Department', options: [...new Set(employees.map(e => e.department))] },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

function ViewEmployeeAttendanceScreen({ employee, subTab, setSubTab, data, period, setPeriod, onBack, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const logs = data.attendanceSummaries?.logs || [];

  const filteredLogs = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return logs.filter(row => {
      if (term) return row.date.includes(term) || row.status.toLowerCase().includes(term);
      return true;
    });
  }, [logs, table.search]);

  const pageLogs = paginate(filteredLogs, table.page, table.pageSize);

  const dtrColumns = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'timeIn', label: 'Time In' },
    { key: 'timeOut', label: 'Time Out' },
    { key: 'workedHours', label: 'Worked Hours' },
    { key: 'breakIn', label: 'Break In' },
    { key: 'breakOut', label: 'Break Out' },
    { key: 'breakHours', label: 'Break Hours' },
    { key: 'ot', label: 'Overtime Hours' },
    { key: 'tool', label: 'Tool Used' },
    { key: 'loc', label: 'Work Location' },
    { key: 'status', label: 'Status', type: 'status' },
  ];

  const tardinessColumns = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'timeIn', label: 'Time In' },
    { key: 'timeOut', label: 'Time Out' },
    { key: 'tardHours', label: 'Tardiness in Hours' },
    { key: 'tardMins', label: 'Tardiness in Minutes' },
    { key: 'underHours', label: 'Undertime in Hours' },
    { key: 'underMins', label: 'Undertime in Minutes' },
  ];

  const workedHoursColumns = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'timeIn', label: 'Time In' },
    { key: 'timeOut', label: 'Time Out' },
    { key: 'workedHours', label: 'Worked Hours' },
    { key: 'breakIn', label: 'Break In' },
    { key: 'breakOut', label: 'Break Out' },
    { key: 'breakHours', label: 'Break Hours' },
    { key: 'ot', label: 'Overtime Hours' },
  ];

  const currentColumns = subTab === 'dtr' ? dtrColumns : subTab === 'tardiness' ? tardinessColumns : workedHoursColumns;

  function exportLogs(format) {
    const headers = currentColumns.map(c => c.label);
    const rows = filteredLogs.map(r => currentColumns.map(c => r[c.key] ?? ''));
    downloadFile(`attendance-${employee.employeeCode}-${subTab}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Attendance records exported to ${format}.`);
  }

  const titleForTab = subTab === 'dtr' ? 'View Daily Time Record' : subTab === 'tardiness' ? 'Employee Tardiness/Undertime Log' : 'View Worked Hours';

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[
      { label: 'Attendance Summary', onClick: onBack },
      { label: titleForTab },
    ]} />
    <PageHeading title={titleForTab} />

    <EmployeeBanner employee={employee} />

    {/* Top Summary KPI Cards */}
    {subTab === 'dtr' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, margin: '16px 0' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Total Worked Hours</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>100.00</strong>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Total Overtime Hours</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>0.75</strong>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Total Absences</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>1</strong>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Total Leave Days</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>1</strong>
        </div>
      </div>
    )}

    {subTab === 'worked-hours' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, margin: '16px 0' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Total Approved Hours</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>120.00</strong>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Approved Overtime</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>0.75</strong>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Total Absences</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>2</strong>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Total Leave Days</span>
          <strong style={{ display: 'block', fontSize: 24, fontWeight: 700, color: '#1e1b4b', marginTop: 4 }}>1</strong>
        </div>
      </div>
    )}

    {/* Cut-off selection */}
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginBottom: 14 }}>
      <span style={{ fontSize: 11, color: '#64748b' }}>Cut-off: <strong>January 15, 2025</strong></span>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>Current Period:</span>
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 11 }}
        >
          {['January 1-15, 2025', 'January 16-31, 2025', 'February 1-15, 2025'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
    </div>

    {/* Toolbar */}
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu onExport={exportLogs} disabled={filteredLogs.length === 0} />
      </div>
    </div>

    <DataTable
      columns={currentColumns}
      rows={pageLogs}
      total={filteredLogs.length}
      rowKey={(row, i) => `${row.date}-${i}`}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty="No logs found."
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'status', label: 'Status', options: ['Present', 'Late', 'Undertime', 'Absent', 'Holiday'] },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

/* -------------------------------------------------- Root Workspace & Dispatcher */

export function SelfInquirySidebar({ subView = 'loan-inquiry', onSelectSubView, onBack }) {
  const menuItems = [
    { key: 'loan-inquiry', label: 'Loan Inquiry', icon: Bank },
    { key: 'leave-ledger', label: 'Leave Balances & Ledger', icon: Suitcase },
    { key: 'attendance-summary', label: 'Attendance Summary', icon: Clock },
  ];

  return <aside className="hrm-ss-sidebar">
    <button type="button" className="hrm-ss-back" onClick={onBack}><ArrowLeft size={14} /> Back to HRM</button>
    <h2>Employee<br />Self-inquiry</h2>
    <nav aria-label="Employee self-inquiry">
      {menuItems.map(item => {
        const Icon = item.icon;
        const isActive = subView === item.key;
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

export function SelfInquiryWorkspace({ data, setData, requests = [], user, access, subView = 'loan-inquiry', onNavigateSelfService, onBack, onNotify }) {
  return <div className="hrm-ss-content">
    {subView === 'loan-inquiry' && <LoanInquiryScreen data={data} setData={setData} user={user} onNavigateSelfService={onNavigateSelfService} onNotify={onNotify} />}
    {subView === 'leave-ledger' && <LeaveLedgerScreen data={data} requests={requests} user={user} access={access} onNavigateSelfService={onNavigateSelfService} onNotify={onNotify} />}
    {subView === 'attendance-summary' && <AttendanceSummaryScreen data={data} user={user} access={access} onNotify={onNotify} />}
  </div>;
}
