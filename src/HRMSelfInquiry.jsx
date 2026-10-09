/**
 * Employee Self-Inquiry Suite (Part 5):
 * - Loan Inquiry (List & View Loan Details with Deduction Matrix)
 * - Leave Balances & Ledger (Admin Roster with Personal Toggle & View Leave Balance)
 * - Attendance Summary (Daily Time Records, Tardiness / Undertime, Worked Hours Per Day, Top KPIs, Cut-off selector)
 * - Payslips & Payroll History (the employee's own posted payroll lines)
 *
 * Payslips belong here rather than in Payroll because Payroll is an
 * administrator module: not one Phase 2 Payroll row grants an employee a
 * payroll register, and the employee's own payslip, statutory-contribution and
 * payroll-history inquiries are BRD rows served by HRM. The payslip is the same
 * line the payroll transaction computed, rendered by the same component the
 * administrator sees, so there is no second calculation behind it.
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
import { employeeRoster } from './employeeRoster.js';
import { loanPaymentHistory, readPayrollRuns } from './payrollRuns.js';
import { PayslipDocument, peso } from './PayrollLineDetail.jsx';
import { CERTIFICATE_TYPES, buildCertificate, certificateYears, contributionSummary } from './payrollCertificates.js';
import { effectiveStatutorySet } from './statutoryService.js';
import { readActiveCompany, readActiveCompanyId } from './companyRepository.js';

const toCsv = (headers, rows) => [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

/* ------------------------------------------------------------- 1. Loan Inquiry */

function LoanInquiryScreen({ data, setData, user, access, onNavigateSelfService, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Holding only the id — not the row itself — is what keeps the detail
  // screen live: authorising a deduction mutates `data`, and a snapshot
  // object taken at click time would never see that update.
  const [viewingLoanId, setViewingLoanId] = useState(null);

  // A schedule belongs to one employee, so an employee sees their own and an
  // approver or administrator sees the people they may see. Showing the whole
  // company's loans to everyone was the defect an unkeyed seed produced.
  const visible = new Set(access?.visibleEmployeeIds || [user?.employeeId]);
  const loans = (data.loanInquiries || []).filter(row => !row.employeeId || visible.has(row.employeeId));
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

function LoanPaymentsFromPayroll({ loanCode, totalLoan }) {
  const history = useMemo(() => loanPaymentHistory(readPayrollRuns(readActiveCompanyId()), loanCode), [loanCode]);
  const money = value => `₱${(Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <div className="loan-payment-matrix">
    <div className="loan-payment-totals">
      <span>Accumulated payment (from posted payroll) <strong>{money(history.paid)}</strong></span>
      {Number(totalLoan) > 0 && <span>Balance <strong>{money(Math.max(0, Number(totalLoan) - history.paid))}</strong></span>}
      {history.deferred > 0 && <span>Deferred <strong>{money(history.deferred)}</strong></span>}
    </div>
    <table className="hrm-table">
      <thead><tr><th>Payout Period</th><th>Payroll Transaction</th><th className="align-right">Amortization Amount</th><th className="align-right">Paid</th><th className="align-right">Deferred</th><th className="align-right">Balance After</th></tr></thead>
      <tbody>{history.rows.length ? history.rows.map(row => <tr key={row.key}><td>{row.payoutDate}</td><td>{row.transactionNumber}</td><td className="align-right">{money(row.scheduled)}</td><td className="align-right">{money(row.paid)}</td><td className="align-right">{row.deferred ? money(row.deferred) : '—'}</td><td className="align-right">{money(row.balanceAfter)}</td></tr>)
        : <tr><td colSpan={6}>No posted payroll has collected on this loan yet.</td></tr>}</tbody>
    </table>
    <small>Balance and accumulated payment are computed from posted payroll and cannot be edited.</small>
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
    const headers = ['Payout Period', 'Amortization Amount'];
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
          { key: 'deductionAmount', label: 'Amortization Amount', type: 'currency' },
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

    {/* Payment matrix: what posted payroll actually collected */}
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '18px 20px', marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 14px' }}>Payments from Payroll</h3>
      <LoanPaymentsFromPayroll loanCode={loan.transactionNumber || loan.id} totalLoan={loan.totalLoan} />
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

/* ---------------------------------------- 4. Payslips & Payroll History */

/**
 * The employee's own payroll history.
 *
 * Only posted and locked runs appear: a transaction still open, in review or
 * awaiting approval is not yet the employee's pay, and showing it would let
 * them read a figure that can still change. Scope follows the rest of the
 * module - an employee sees their own lines, an approver or administrator sees
 * the people they may see.
 */
function PayslipInquiryScreen({ user, access, companyId, onNotify }) {
  const table = useTableState();
  const [openPayslip, setOpenPayslip] = useState(null);

  const visible = useMemo(() => new Set(access?.visibleEmployeeIds || [user?.employeeId]), [access, user]);
  const rows = useMemo(() => readPayrollRuns(companyId)
    .filter(run => ['Posted', 'Locked'].includes(run.status) && run.result)
    .flatMap(run => run.result.lines
      .filter(line => line.status === 'Computed' && visible.has(line.employeeId))
      .map(line => ({
        key: `${run.id}-${line.employeeId}`,
        run,
        line,
        transactionNumber: run.transactionNumber,
        period: `${run.periodStart} to ${run.periodEnd}`,
        payoutDate: run.payoutDate,
        employeeName: line.name,
        grossPay: peso(line.grossPay),
        statutory: peso(line.statutory.employeeTotal),
        tax: peso(line.withholdingTax),
        deductions: peso(line.totalDeductions - line.statutory.employeeTotal - line.withholdingTax),
        netPay: peso(line.netPay),
        status: run.status,
      })))
    .sort((left, right) => String(right.payoutDate).localeCompare(String(left.payoutDate))), [companyId, visible]);

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return rows.filter(row => !term || `${row.transactionNumber} ${row.employeeName} ${row.period}`.toLowerCase().includes(term));
  }, [rows, table.search]);

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    gross: sum.gross + row.line.grossPay,
    tax: sum.tax + row.line.withholdingTax,
    net: sum.net + row.line.netPay,
  }), { gross: 0, tax: 0, net: 0 }), [rows]);

  const columns = [
    { key: 'transactionNumber', label: 'Payroll Transaction' },
    ...(access?.canApproveTeamRequests ? [{ key: 'employeeName', label: 'Employee' }] : []),
    { key: 'period', label: 'Payroll Period' },
    { key: 'payoutDate', label: 'Payout Date' },
    { key: 'grossPay', label: 'Gross Pay', align: 'right' },
    { key: 'statutory', label: 'Statutory', align: 'right' },
    { key: 'tax', label: 'Withholding Tax', align: 'right' },
    { key: 'deductions', label: 'Other Deductions', align: 'right' },
    { key: 'netPay', label: 'Net Pay', align: 'right' },
    { key: 'status', label: 'Status' },
  ];

  return <div className="hrm-ss-screen">
    <PageHeading title="Payslips & Payroll History" info="Your posted payroll lines. A transaction still open or awaiting approval is not shown, because its figures can still change." />

    <StatCardRow>
      <StatCard label="Payslips available" value={String(rows.length)} />
      <StatCard label="Gross pay to date" value={peso(totals.gross)} />
      <StatCard label="Tax withheld to date" value={peso(totals.tax)} />
      <StatCard label="Net pay received" value={peso(totals.net)} />
    </StatCardRow>

    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left"><SearchInput value={table.search} onChange={table.setSearch} placeholder="Search payslips..." /></div>
      <div className="hrm-toolbar-right">
        <ExportMenu
          disabled={!filtered.length}
          onExport={() => {
            downloadFile('my-payroll-history.csv', toCsv(columns.map(column => column.label), filtered.map(row => columns.map(column => row[column.key]))), 'text/csv');
            onNotify?.('Payroll history exported.');
          }}
        />
      </div>
    </div>

    <DataTable
      columns={columns}
      rows={paginate(filtered, table.page, table.pageSize)}
      rowKey={row => row.key}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      total={filtered.length}
      empty="No payroll has been posted for you yet."
      actions={row => [{ label: 'View payslip', kind: 'view', onSelect: () => setOpenPayslip(row) }]}
    />

    {openPayslip && <Modal
      title={`Payslip - ${openPayslip.transactionNumber}`}
      onClose={() => setOpenPayslip(null)}
      width="lg"
      footer={<GhostButton onClick={() => setOpenPayslip(null)}>Close</GhostButton>}
    >
      <PayslipDocument
        line={openPayslip.line}
        run={openPayslip.run}
        employee={employeeRoster.find(employee => employee.employeeId === openPayslip.line.employeeId)}
      />
    </Modal>}
  </div>;
}

/* ------------------------------------------ Statutory contributions & certificates */

/**
 * Whose records a screen may open: an employee sees their own; an approver or
 * administrator picks from the people they may see (the "management" half of
 * each inquiry in the BRD).
 */
function useInquiryEmployee(user, access) {
  const canPick = Boolean(access?.canApproveTeamRequests);
  const people = useMemo(() => {
    const visible = new Set(access?.visibleEmployeeIds || [user?.employeeId]);
    return employeeRoster.filter(employee => visible.has(employee.employeeId));
  }, [access, user]);
  const [employeeId, setEmployeeId] = useState(user?.employeeId || people[0]?.employeeId || '');
  const employee = employeeRoster.find(item => item.employeeId === employeeId) || people[0] || null;
  return { canPick, people, employee, setEmployeeId };
}

function InquiryPicker({ canPick, people, employee, setEmployeeId, year, years, setYear, children }) {
  return <div className="hrm-toolbar">
    <div className="hrm-toolbar-left inquiry-pickers">
      {canPick && <label className="payroll-field inline"><span>Employee</span>
        <select value={employee?.employeeId || ''} onChange={event => setEmployeeId(event.target.value)}>{people.map(item => <option key={item.employeeId} value={item.employeeId}>{item.name} ({item.employeeCode})</option>)}</select>
      </label>}
      <label className="payroll-field inline"><span>Year</span>
        <select value={year} onChange={event => setYear(event.target.value)}>{(years.length ? years : [year]).map(value => <option key={value}>{value}</option>)}</select>
      </label>
    </div>
    <div className="hrm-toolbar-right">{children}</div>
  </div>;
}

/** Summary statutory contribution inquiry (HTP166) and its management view (HTP167). */
function ContributionInquiryScreen({ user, access, companyId, onNotify }) {
  const runs = useMemo(() => readPayrollRuns(companyId), [companyId]);
  const years = useMemo(() => certificateYears(runs), [runs]);
  const [year, setYear] = useState(years[0] || String(new Date().getFullYear()));
  const pick = useInquiryEmployee(user, access);
  const { rows, totals } = useMemo(() => (pick.employee ? contributionSummary(runs, pick.employee.employeeId, year) : { rows: [], totals: {} }), [runs, pick.employee, year]);
  const columns = [
    { key: 'month', label: 'Month' }, { key: 'transactions', label: 'Payroll Transactions' },
    { key: 'sssEe', label: 'SSS EE', align: 'right' }, { key: 'sssEr', label: 'SSS ER', align: 'right' }, { key: 'ec', label: 'EC', align: 'right' },
    { key: 'phicEe', label: 'PhilHealth EE', align: 'right' }, { key: 'phicEr', label: 'PhilHealth ER', align: 'right' },
    { key: 'hdmfEe', label: 'Pag-IBIG EE', align: 'right' }, { key: 'hdmfEr', label: 'Pag-IBIG ER', align: 'right' },
    { key: 'tax', label: 'Tax Withheld', align: 'right' },
  ];
  const money = new Set(columns.slice(2).map(column => column.key));
  const display = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, money.has(key) ? peso(value) : value])));
  return <div className="hrm-ss-screen">
    <PageHeading title="Statutory Contributions" info="SSS, PhilHealth and Pag-IBIG employee and employer shares, and the tax withheld, per month from posted payroll." />
    <InquiryPicker {...pick} year={year} years={years} setYear={setYear}>
      <ExportMenu disabled={!rows.length} onExport={() => {
        downloadFile(`statutory-contributions-${pick.employee?.employeeCode}-${year}.csv`, toCsv(columns.map(column => column.label), rows.map(row => columns.map(column => row[column.key]))), 'text/csv');
        onNotify?.('Statutory contributions exported.');
      }} />
    </InquiryPicker>
    <StatCardRow>
      <StatCard label="SSS (EE + ER + EC)" value={peso((totals.sssEe || 0) + (totals.sssEr || 0) + (totals.ec || 0))} />
      <StatCard label="PhilHealth (EE + ER)" value={peso((totals.phicEe || 0) + (totals.phicEr || 0))} />
      <StatCard label="Pag-IBIG (EE + ER)" value={peso((totals.hdmfEe || 0) + (totals.hdmfEr || 0))} />
      <StatCard label="Tax withheld" value={peso(totals.tax || 0)} />
    </StatCardRow>
    <DataTable columns={columns} rows={display} rowKey={row => row.key} page={1} pageSize={24} total={display.length} empty={`No posted payroll for ${pick.employee?.name || 'this employee'} in ${year}.`} />
  </div>;
}

/** Payroll certificates generated from posted payroll (HTP171-177). */
function PayrollCertificatesScreen({ user, access, companyId, onNotify }) {
  const runs = useMemo(() => readPayrollRuns(companyId), [companyId]);
  const years = useMemo(() => certificateYears(runs), [runs]);
  const [year, setYear] = useState(years[0] || String(new Date().getFullYear()));
  const [type, setType] = useState(CERTIFICATE_TYPES[0].key);
  const pick = useInquiryEmployee(user, access);
  const certificate = useMemo(() => (pick.employee ? buildCertificate({
    type, employee: pick.employee, runs, year, company: readActiveCompany() || {}, statutory: effectiveStatutorySet(`${year}-12-31`),
  }) : null), [type, pick.employee, runs, year]);
  const format = (column, value) => (column.money && typeof value === 'number' ? peso(value) : value);
  const download = () => {
    const lines = [
      [certificate.title], [`Employer: ${certificate.header.employer} (TIN ${certificate.header.employerTin})`],
      [`Employee: ${certificate.header.employee} (${certificate.header.employeeCode}) · TIN ${certificate.header.tin} · SSS ${certificate.header.sss} · PhilHealth ${certificate.header.philhealth} · Pag-IBIG ${certificate.header.hdmf}`],
      [`Year: ${certificate.header.year} · From posted payroll: ${certificate.transactions.join(', ')}`], [],
    ].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','));
    const table = toCsv(certificate.columns.map(column => column.label), [
      ...certificate.rows.map(row => certificate.columns.map(column => row[column.key])),
      ...(certificate.totals ? [certificate.columns.map((column, index) => (index === 0 ? 'TOTAL' : certificate.totals[column.key] ?? ''))] : []),
    ]);
    downloadFile(`${certificate.key}-${certificate.header.employeeCode}-${year}.csv`, [...lines, table].join('\n'), 'text/csv');
    onNotify?.(`${certificate.title} downloaded.`);
  };
  return <div className="hrm-ss-screen">
    <PageHeading title="Payroll Certificates" info="BIR 2316 and 2307, and SSS, PhilHealth and Pag-IBIG contribution and loan certificates, generated from posted payroll." />
    <InquiryPicker {...pick} year={year} years={years} setYear={setYear}>
      <PrimaryButton onClick={download} disabled={!certificate?.rows.length}>Download certificate</PrimaryButton>
    </InquiryPicker>
    <div className="hrm-toolbar"><div className="hrm-toolbar-left">
      <label className="payroll-field inline"><span>Certificate</span>
        <select value={type} onChange={event => setType(event.target.value)}>{CERTIFICATE_TYPES.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
      </label>
    </div></div>
    {certificate && <section className="hrm-section payroll-certificate">
      <h3 className="hrm-section-title">{certificate.title}</h3>
      <DetailList groups={[
        { label: 'Employer', value: `${certificate.header.employer}${certificate.header.employerTin ? ` · TIN ${certificate.header.employerTin}` : ''}` },
        { label: 'Employee', value: `${certificate.header.employee} (${certificate.header.employeeCode})` },
        { label: 'TIN', value: certificate.header.tin || '—' },
        { label: 'SSS / PhilHealth / Pag-IBIG', value: [certificate.header.sss, certificate.header.philhealth, certificate.header.hdmf].map(value => value || '—').join(' / ') },
        { label: 'Year', value: certificate.header.year },
        { label: 'From posted payroll', value: certificate.transactions.join(', ') || '—' },
      ]} />
      {certificate.note && <EmptyState title="Nothing to certify" icon={FileText}>{certificate.note}</EmptyState>}
      {!certificate.note && <div className="hrm-table-block"><div className="hrm-table-scroll"><table className="hrm-table">
        <thead><tr>{certificate.columns.map(column => <th key={column.key} className={column.money ? 'align-right' : ''}>{column.label}</th>)}</tr></thead>
        <tbody>{certificate.rows.map(row => <tr key={row.key}>{certificate.columns.map(column => <td key={column.key} className={column.money ? 'align-right' : ''}>{format(column, row[column.key])}</td>)}</tr>)}</tbody>
        {certificate.totals && <tfoot><tr>{certificate.columns.map((column, index) => <td key={column.key} className={column.money ? 'align-right' : ''}><strong>{index === 0 ? 'Total' : column.key in certificate.totals ? peso(certificate.totals[column.key]) : ''}</strong></td>)}</tr></tfoot>}
      </table></div></div>}
    </section>}
  </div>;
}

/* -------------------------------------------------- Root Workspace & Dispatcher */

export function SelfInquirySidebar({ subView = 'loan-inquiry', onSelectSubView, onBack }) {
  const menuItems = [
    { key: 'loan-inquiry', label: 'Loan Inquiry', icon: Bank },
    { key: 'leave-ledger', label: 'Leave Balances & Ledger', icon: Suitcase },
    { key: 'attendance-summary', label: 'Attendance Summary', icon: Clock },
    { key: 'payslips', label: 'Payslips & Payroll History', icon: Coins },
    { key: 'contributions', label: 'Statutory Contributions', icon: ListNumbers },
    { key: 'certificates', label: 'Payroll Certificates', icon: FileText },
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

export function SelfInquiryWorkspace({ data, setData, requests = [], user, access, companyId, subView = 'loan-inquiry', onNavigateSelfService, onBack, onNotify }) {
  return <div className="hrm-ss-content">
    {subView === 'loan-inquiry' && <LoanInquiryScreen data={data} setData={setData} user={user} access={access} onNavigateSelfService={onNavigateSelfService} onNotify={onNotify} />}
    {subView === 'leave-ledger' && <LeaveLedgerScreen data={data} requests={requests} user={user} access={access} onNavigateSelfService={onNavigateSelfService} onNotify={onNotify} />}
    {subView === 'attendance-summary' && <AttendanceSummaryScreen data={data} user={user} access={access} onNotify={onNotify} />}
    {subView === 'payslips' && <PayslipInquiryScreen user={user} access={access} companyId={companyId} onNotify={onNotify} />}
    {subView === 'contributions' && <ContributionInquiryScreen user={user} access={access} companyId={companyId} onNotify={onNotify} />}
    {subView === 'certificates' && <PayrollCertificatesScreen user={user} access={access} companyId={companyId} onNotify={onNotify} />}
  </div>;
}
