/**
 * Benefits Suite (Part 6):
 * - Salary Information (Master Roster, Custom Export 2-step wizard, and Detail View with 8 sub-tabs: Basic Pay, Earnings, 13th Month Pay & Bonuses, Statutory Deductions, Company Deductions, Loans, HDMF Contribution, Variable Allowances)
 * - Employee Allowances (Company allowances table & details)
 * - Employee Benefits (Employee personal view vs Admin roster view, drilling into Benefit Details with 4 status tabs: All, Upcoming, Active, Expired)
 */

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bank,
  CalendarBlank,
  CaretDown,
  CheckCircle,
  CurrencyCircleDollar,
  DownloadSimple,
  Eye,
  FileDoc,
  FilePdf,
  FileText,
  FileXls,
  Funnel,
  Gift,
  HandCoins,
  IdentificationCard,
  ListNumbers,
  MagnifyingGlass,
  Money,
  PencilSimple,
  Plus,
  Receipt,
  User,
  Users,
  Wallet,
  X,
} from '@phosphor-icons/react';
import {
  Breadcrumbs,
  DataTable,
  DetailList,
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

const toCsv = (headers, rows) => [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

/* ----------------------------------------------------------------- Sidebar */

export function BenefitsSidebar({ subView = 'salary-information', onSelectSubView, onBack }) {
  const menuItems = [
    { key: 'salary-information', label: 'Salary Information', icon: CurrencyCircleDollar },
    { key: 'employee-allowances', label: 'Employee Allowances', icon: HandCoins },
    { key: 'employee-benefits', label: 'Employee Benefits', icon: Gift },
  ];

  return <aside className="hrm-ss-sidebar">
    <button type="button" className="hrm-ss-back" onClick={onBack}><ArrowLeft size={14} /> Back to HRM</button>
    <h2>Benefits</h2>
    <nav aria-label="Benefits navigation">
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

/* ------------------------------------------------ 1. Salary Information */

function CustomExportModal({ employees, onExport, onClose }) {
  const [step, setStep] = useState(1);
  const [selectedGroups, setSelectedGroups] = useState(['All']);
  const [dateHired, setDateHired] = useState('01-Jul-2023');
  const [selectedEmployees, setSelectedEmployees] = useState(['Jane Collins Doe', 'Jandee Robins Fisher']);
  const [exportFormat, setExportFormat] = useState('Excel');
  const [selectedSections, setSelectedSections] = useState(['Basic Pay']);

  const allSections = [
    'Basic Pay',
    'Earnings',
    '13th Month Pay and Bonuses',
    'Statutory Deductions',
    'Loans',
    'HDMF Contributions',
  ];

  function toggleSection(sec) {
    if (selectedSections.includes(sec)) {
      setSelectedSections(selectedSections.filter(s => s !== sec));
    } else {
      setSelectedSections([...selectedSections, sec]);
    }
  }

  function handleExport() {
    onExport(exportFormat, selectedSections);
    onClose();
  }

  return <div className="hrm-modal-backdrop" role="dialog" aria-modal="true">
    <div className="hrm-modal-card" style={{ maxWidth: 540 }}>
      <div className="hrm-modal-header">
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--violet)' }}>Custom Export</h3>
        <button type="button" className="hrm-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>

      {/* Step Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '16px 0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--violet)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>1</div>
        </div>
        <div style={{ width: 80, height: 2, background: step === 2 ? 'var(--violet)' : '#e2e8f0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: step === 2 ? 'var(--violet)' : '#cbd5e1', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>2</div>
        </div>
      </div>

      <div className="hrm-modal-body" style={{ padding: '0 8px 16px' }}>
        {step === 1 ? (
          <div>
            <p style={{ fontSize: 11, color: '#475569', marginBottom: 14 }}>Choose which salary information data to export:</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Employee Group *</label>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 6, maxHeight: 150, overflowY: 'auto', padding: 6 }}>
                  {['Absence Classification', 'Age', 'Date Hired', 'Date Hired After', 'Date Hired On and After', 'Date Hired Prior', 'Date Hired Upto'].map(grp => (
                    <label key={grp} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', fontSize: 11, color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedGroups.includes(grp)}
                        onChange={() => {
                          setSelectedGroups(prev => prev.includes(grp) ? prev.filter(g => g !== grp) : [...prev, grp]);
                        }}
                      />
                      <span>{grp}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Date Hired</label>
                <input
                  type="text"
                  value={dateHired}
                  onChange={e => setDateHired(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Employee Names</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 8, border: '1px solid var(--border-color)', borderRadius: 6, minHeight: 38 }}>
                {selectedEmployees.map(name => (
                  <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 10.5, color: '#334155' }}>
                    {name}
                    <button type="button" onClick={() => setSelectedEmployees(prev => prev.filter(n => n !== name))} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: '#64748b' }}>×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Export File Format</label>
              <select
                value={exportFormat}
                onChange={e => setExportFormat(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
              >
                <option value="Excel">Excel (.xlsx)</option>
                <option value="CSV">CSV (.csv)</option>
                <option value="PDF">PDF (.pdf)</option>
                <option value="DOCX">DOCX (.docx)</option>
              </select>
            </div>
          </div>
        ) : (
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginBottom: 14 }}>Select Sections for Inclusion</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedSections.length === allSections.length}
                  onChange={e => setSelectedSections(e.target.checked ? [...allSections] : [])}
                />
                <span>All Sections</span>
              </label>

              {allSections.map(sec => (
                <label key={sec} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#334155', cursor: 'pointer', paddingLeft: 12 }}>
                  <input
                    type="checkbox"
                    checked={selectedSections.includes(sec)}
                    onChange={() => toggleSection(sec)}
                  />
                  <span>{sec}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
        <GhostButton onClick={step === 1 ? onClose : () => setStep(1)}>
          {step === 1 ? 'Cancel' : 'Back'}
        </GhostButton>
        {step === 1 ? (
          <PrimaryButton onClick={() => setStep(2)}>Next</PrimaryButton>
        ) : (
          <PrimaryButton onClick={handleExport}>Export</PrimaryButton>
        )}
      </div>
    </div>
  </div>;
}

function SalaryInformationDetailScreen({ record, onBack, onNotify }) {
  const [subTab, setSubTab] = useState('basic-pay');
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const subTabs = [
    { key: 'basic-pay', label: 'Basic Pay' },
    { key: 'earnings', label: 'Earnings' },
    { key: 'bonuses', label: '13th Month Pay and Bonuses' },
    { key: 'statutory', label: 'Statutory Deductions' },
    { key: 'company-deductions', label: 'Company Deductions' },
    { key: 'loans', label: 'Loans' },
    { key: 'hdmf', label: 'HDMF Contribution' },
    { key: 'variable-allowances', label: 'Variable Allowances' },
  ];

  function exportSubTab(format) {
    onNotify(`${subTabs.find(s => s.key === subTab)?.label} exported to ${format}.`);
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs items={[
      { label: 'Salary Information', onClick: onBack },
      { label: record.employeeName },
    ]} />

    <PageHeading title="Salary Information" />

    {/* Employee Banner */}
    <div style={{ background: 'linear-gradient(135deg, #441a6b, #6b21a8)', borderRadius: 10, padding: '20px 24px', color: '#fff', display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700 }}>
        {initialsOf(record.employeeName)}
      </div>
      <div>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{record.employeeName} ({record.employeeCode})</h3>
        <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.9 }}>{record.jobTitle} | {record.department}</p>
        <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, opacity: 0.8 }}>{record.employmentType}</span>
      </div>
    </div>

    {/* Sub-Tabs */}
    <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border-color)', marginBottom: 16, overflowX: 'auto' }}>
      {subTabs.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => { setSubTab(t.key); table.setPage(1); }}
          style={{
            padding: '8px 14px',
            border: 'none',
            background: 'none',
            fontSize: 11,
            fontWeight: subTab === t.key ? 700 : 500,
            color: subTab === t.key ? 'var(--violet)' : '#64748b',
            borderBottom: subTab === t.key ? '2px solid var(--violet)' : '2px solid transparent',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {t.label}
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
        <ExportMenu onExport={exportSubTab} />
      </div>
    </div>

    {/* 1. Basic Pay */}
    {subTab === 'basic-pay' && (
      <DataTable
        columns={[
          { key: 'dateCreated', label: 'Date Created', type: 'date' },
          { key: 'payType', label: 'Pay Type' },
          { key: 'basicPayAmount', label: 'Basic Pay Amount', type: 'currency' },
          { key: 'workDays', label: 'Work Days' },
          { key: 'workDaysType', label: 'Work Days Type' },
          { key: 'annualRate', label: 'Annual Rate', type: 'currency' },
          { key: 'monthlyRate', label: 'Monthly Rate', type: 'currency' },
          { key: 'dailyRate', label: 'Daily Rate', type: 'currency' },
          { key: 'hourlyRate', label: 'Hourly Rate', type: 'currency' },
          { key: 'perMinuteRate', label: 'Per Minute Rate', type: 'currency' },
          { key: 'mwe', label: 'MWE' },
          { key: 'location', label: 'Location' },
          { key: 'effectivityDate', label: 'Effectivity Date', type: 'date' },
          { key: 'startMonth', label: 'Start Month' },
          { key: 'startYear', label: 'Start Year' },
        ]}
        rows={record.basicPay || []}
        total={(record.basicPay || []).length}
        rowKey={(row, i) => `bp-${i}`}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />
    )}

    {/* 2. Earnings */}
    {subTab === 'earnings' && (
      <DataTable
        columns={[
          { key: 'dateCreated', label: 'Date Created', type: 'date' },
          { key: 'earningCode', label: 'Earning Code' },
          { key: 'earningName', label: 'Earning Name' },
          { key: 'earningsAmount', label: 'Earnings Amount', type: 'currency' },
          { key: 'classification', label: 'Classification' },
          { key: 'frequency', label: 'Frequency' },
          { key: 'taxability', label: 'Taxability' },
          { key: 'effectivityDate', label: 'Effectivity Date', type: 'date' },
          { key: 'periodStart', label: 'Period Start', type: 'date' },
          { key: 'periodEnd', label: 'Period End', type: 'date' },
          { key: 'holdDate', label: 'Hold Date' },
        ]}
        rows={record.earnings || []}
        total={(record.earnings || []).length}
        rowKey={(row, i) => `earn-${i}`}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />
    )}

    {/* 3. 13th Month Pay and Bonuses */}
    {subTab === 'bonuses' && (
      <DataTable
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'type', label: 'Type' },
          { key: 'taxability', label: 'Taxability' },
          { key: 'amount', label: 'Amount', type: 'currency' },
        ]}
        rows={record.bonuses || []}
        total={(record.bonuses || []).length}
        rowKey={(row, i) => `bon-${i}`}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />
    )}

    {/* 4. Statutory Deductions */}
    {subTab === 'statutory' && (
      <DataTable
        columns={[
          { key: 'payPeriod', label: 'Pay Period' },
          { key: 'effectivityDate', label: 'Effectivity Date', type: 'date' },
          { key: 'holdDate', label: 'Hold Date' },
          { key: 'sssEmployee', label: 'SSS Employee Contribution', type: 'currency' },
          { key: 'sssEmployer', label: 'SSS Employer Contribution', type: 'currency' },
          { key: 'ecc', label: 'ECC', type: 'currency' },
          { key: 'sssMpfEmployee', label: 'SSS MPF Employee', type: 'currency' },
          { key: 'sssMpfEmployer', label: 'SSS MPF Employer', type: 'currency' },
          { key: 'phicEmployee', label: 'PHIC Employee', type: 'currency' },
          { key: 'phicEmployer', label: 'PHIC Employer', type: 'currency' },
          { key: 'hdmfEmployee', label: 'HDMF Employee', type: 'currency' },
          { key: 'hdmfEmployer', label: 'HDMF Employer', type: 'currency' },
        ]}
        rows={record.statutoryDeductions || []}
        total={(record.statutoryDeductions || []).length}
        rowKey={(row, i) => `stat-${i}`}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />
    )}

    {/* 5. Company Deductions */}
    {subTab === 'company-deductions' && (
      <DataTable
        columns={[
          { key: 'deductionName', label: 'Deduction Name' },
          { key: 'amountOfDeduction', label: 'Amount of Deduction', type: 'currency' },
          { key: 'startDate', label: 'Start Date', type: 'date' },
          { key: 'endDate', label: 'End Date', type: 'date' },
          { key: 'numberOfDeductions', label: 'Number of Deductions' },
          { key: 'totalDeductionAmount', label: 'Total Deduction Amount', type: 'currency' },
          { key: 'accumulatedAmount', label: 'Accumulated Amount', type: 'currency' },
          { key: 'totalBalance', label: 'Total Balance', type: 'currency' },
        ]}
        rows={record.companyDeductions || []}
        total={(record.companyDeductions || []).length}
        rowKey={(row, i) => `cd-${i}`}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />
    )}

    {/* 6. Loans */}
    {subTab === 'loans' && (
      <DataTable
        columns={[
          { key: 'payItem', label: 'Pay Item' },
          { key: 'amount', label: 'Amount', type: 'currency' },
          { key: 'startDate', label: 'Start Date', type: 'date' },
          { key: 'endDate', label: 'End Date', type: 'date' },
          { key: 'dateGranted', label: 'Date Granted', type: 'date' },
          { key: 'referenceNumber', label: 'Reference Number' },
          { key: 'principal', label: 'Principal', type: 'currency' },
          { key: 'interest', label: 'Interest', type: 'currency' },
          { key: 'totalLoan', label: 'Total Loan', type: 'currency' },
          { key: 'accumulatedManual', label: 'Accumulated Payment (Manual)', type: 'currency' },
          { key: 'accumulatedComputed', label: 'Accumulated Payment (Computed)', type: 'currency' },
          { key: 'balance', label: 'Balance', type: 'currency' },
          { key: 'holdDate', label: 'Hold Date' },
        ]}
        rows={record.loans || []}
        total={(record.loans || []).length}
        rowKey={(row, i) => `ln-${i}`}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />
    )}

    {/* 7. HDMF Contribution */}
    {subTab === 'hdmf' && (
      <DataTable
        columns={[
          { key: 'effectivityDate', label: 'Effectivity Date', type: 'date' },
          { key: 'holdDate', label: 'Hold Date' },
          { key: 'employeeContribution', label: 'Employee Contribution', type: 'currency' },
          { key: 'employerContribution', label: 'Employer Contribution', type: 'currency' },
        ]}
        rows={record.hdmfContributions || []}
        total={(record.hdmfContributions || []).length}
        rowKey={(row, i) => `hdmf-${i}`}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />
    )}

    {/* 8. Variable Allowances */}
    {subTab === 'variable-allowances' && (
      <DataTable
        columns={[
          { key: 'dateCreated', label: 'Date Created', type: 'date' },
          { key: 'amount', label: 'Amount', type: 'currency' },
          { key: 'unitBasis', label: 'Unit Basis' },
          { key: 'workDays', label: 'Work Days' },
          { key: 'workDaysType', label: 'Work Days Type' },
          { key: 'workHoursPerDay', label: 'Work Hours per Day' },
          { key: 'annualRate', label: 'Annual Rate', type: 'currency' },
          { key: 'monthlyRate', label: 'Monthly Rate', type: 'currency' },
          { key: 'dailyRate', label: 'Daily Rate', type: 'currency' },
          { key: 'hourlyRate', label: 'Hourly Rate', type: 'currency' },
          { key: 'perMinuteRate', label: 'Per Minute Rate', type: 'currency' },
          { key: 'effectivityDate', label: 'Effectivity Date', type: 'date' },
          { key: 'startMonth', label: 'Start Month' },
          { key: 'startYear', label: 'Start Year' },
          { key: 'periodStart', label: 'Period Start', type: 'date' },
        ]}
        rows={record.variableAllowances || []}
        total={(record.variableAllowances || []).length}
        rowKey={(row, i) => `va-${i}`}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />
    )}

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'effectivityDate', label: 'Effectivity Date', type: 'date' },
        { key: 'holdDate', label: 'Hold Date', type: 'date' },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

function SalaryInformationScreen({ data, user, access, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [customExportOpen, setCustomExportOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const rawSalaries = data.salaryInformation || [];
  const isEmployee = access?.role === 'employee';
  const salaries = isEmployee
    ? rawSalaries.filter(r => r.employeeCode === user?.employeeCode || r.employeeName === user?.displayName)
    : rawSalaries;

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return salaries.filter(row => {
      if (term) {
        const matches = [row.employeeCode, row.employeeName, row.department, row.division, row.jobTitle, row.employeeGroup]
          .some(v => String(v ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return Object.entries(table.filters).every(([key, value]) => {
        if (!value) return true;
        return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
      });
    });
  }, [salaries, table.search, table.filters]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  const columns = [
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'employeeName', label: 'Employee Name' },
    { key: 'department', label: 'Department' },
    { key: 'division', label: 'Division' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'dateHired', label: 'Date Hired' },
    { key: 'employeeGroup', label: 'Employee Group' },
  ];

  function exportRows(format) {
    const headers = ['Employee Code', 'Employee Name', 'Department', 'Division', 'Job Title', 'Date Hired', 'Employee Group'];
    const rows = filtered.map(row => [row.employeeCode, row.employeeName, row.department, row.division, row.jobTitle, row.dateHired, row.employeeGroup]);
    downloadFile(`salary-information.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Salary information exported to ${format}.`);
  }

  function handleCustomExport(fmt, sections) {
    onNotify(`Custom export (${sections.join(', ')}) generated in ${fmt}.`);
  }

  if (selectedRecord) {
    return <SalaryInformationDetailScreen record={selectedRecord} onBack={() => setSelectedRecord(null)} onNotify={onNotify} />;
  }

  return <div className="hrm-ss-content">
    <PageHeading title="Salary Information" />

    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right" style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="hrm-btn outline"
          onClick={() => setCustomExportOpen(true)}
        >
          <DownloadSimple size={14} /> Custom...
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
      empty="No salary records found."
      actions={row => [
        { kind: 'view', label: 'View', onSelect: () => setSelectedRecord(row) },
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department', options: [...new Set(salaries.map(r => r.department))] },
        { key: 'division', label: 'Division', options: [...new Set(salaries.map(r => r.division))] },
        { key: 'employeeGroup', label: 'Employee Group', options: ['Management', 'Staff'] },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {customExportOpen && <CustomExportModal
      employees={salaries}
      onExport={handleCustomExport}
      onClose={() => setCustomExportOpen(false)}
    />}
  </div>;
}

/* -------------------------------------------------- 2. Employee Benefits */

function ViewBenefitModal({ benefit, onClose }) {
  return <div className="hrm-modal-backdrop" role="dialog" aria-modal="true">
    <div className="hrm-modal-card" style={{ maxWidth: 440 }}>
      <div className="hrm-modal-header">
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--violet)' }}>View Official Business</h3>
        <button type="button" className="hrm-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <div className="hrm-modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '16px 0' }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Benefit Code</label>
          <span style={{ fontSize: 11, color: '#64748b' }}>{benefit.code}</span>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Benefit Name</label>
          <span style={{ fontSize: 11, color: '#64748b' }}>{benefit.name}</span>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Benefit Start Date</label>
          <span style={{ fontSize: 11, color: '#64748b' }}>{benefit.startDate}</span>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Benefit End Date</label>
          <span style={{ fontSize: 11, color: '#64748b' }}>{benefit.endDate}</span>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155' }}>Benefit Amount</label>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>₱ {Number(benefit.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
      <div className="hrm-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <GhostButton onClick={onClose}>Close</GhostButton>
      </div>
    </div>
  </div>;
}

function EmployeeBenefitDetailsScreen({ employeeBenefit, onBack, onNotify }) {
  const [statusTab, setStatusTab] = useState('All');
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const statusTabs = ['All', 'Upcoming', 'Active', 'Expired'];

  const benefits = employeeBenefit.benefits || [];

  const filtered = useMemo(() => {
    return benefits.filter(b => {
      if (statusTab !== 'All' && b.status !== statusTab) return false;
      if (table.search.trim()) {
        const term = table.search.trim().toLowerCase();
        if (!b.code.toLowerCase().includes(term) && !b.name.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [benefits, statusTab, table.search]);

  function exportBenefits(format) {
    const headers = ['Benefit Code', 'Benefit Name', 'Benefit Amount', 'Benefit Start Date', 'Benefit End Date', 'Status'];
    const rows = filtered.map(b => [b.code, b.name, b.amount, b.startDate, b.endDate, b.status]);
    downloadFile(`employee-benefits-${employeeBenefit.employeeCode}.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Benefits exported to ${format}.`);
  }

  return <div className="hrm-ss-content">
    <Breadcrumbs items={[
      { label: 'Employee Benefits', onClick: onBack },
      { label: 'Employee Benefit Details' },
    ]} />

    <PageHeading title="Employee Benefit Details" />

    {/* Employee Banner */}
    <div style={{ background: 'linear-gradient(135deg, #441a6b, #6b21a8)', borderRadius: 10, padding: '20px 24px', color: '#fff', display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700 }}>
        {initialsOf(employeeBenefit.employeeName)}
      </div>
      <div>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{employeeBenefit.employeeName} ({employeeBenefit.employeeCode})</h3>
        <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.9 }}>{employeeBenefit.jobTitle} | {employeeBenefit.department}</p>
        <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, opacity: 0.8 }}>Full Time Philippines</span>
      </div>
    </div>

    {/* Status Tabs */}
    <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
      {statusTabs.map(st => (
        <button
          key={st}
          type="button"
          onClick={() => { setStatusTab(st); table.setPage(1); }}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            fontSize: 11,
            fontWeight: statusTab === st ? 700 : 500,
            color: statusTab === st ? 'var(--violet)' : '#64748b',
            borderBottom: statusTab === st ? '2px solid var(--violet)' : '2px solid transparent',
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
        <ExportMenu onExport={exportBenefits} disabled={filtered.length === 0} />
      </div>
    </div>

    <DataTable
      columns={[
        { key: 'code', label: 'Benefit Code' },
        { key: 'name', label: 'Benefit Name' },
        { key: 'amount', label: 'Benefit Amount', type: 'currency' },
        { key: 'startDate', label: 'Benefit Start Date', type: 'date' },
        { key: 'endDate', label: 'Benefit End Date', type: 'date' },
        { key: 'status', label: 'Status' },
      ]}
      rows={filtered}
      total={filtered.length}
      rowKey={row => row.code}
      page={1}
      pageSize={10}
      onPageChange={() => {}}
      onPageSizeChange={() => {}}
      empty="No benefits in this status."
    />

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'code', label: 'Benefit Code' },
        { key: 'name', label: 'Benefit Name' },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}
  </div>;
}

function EmployeeBenefitsScreen({ data, user, access, onNotify }) {
  const table = useTableState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewingBenefit, setViewingBenefit] = useState(null);
  const [selectedEmployeeBenefit, setSelectedEmployeeBenefit] = useState(null);

  const isAdmin = access?.isPaAdmin || access?.canApproveTeamRequests;
  const list = data.employeeBenefits || [];

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return list.filter(row => {
      if (term) {
        const matches = [row.employeeCode, row.employeeName, row.department, row.division, row.benefitsAssigned]
          .some(v => String(v ?? '').toLowerCase().includes(term));
        if (!matches) return false;
      }
      return Object.entries(table.filters).every(([key, value]) => {
        if (!value) return true;
        return String(row[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
      });
    });
  }, [list, table.search, table.filters]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  function exportBenefits(format) {
    const headers = ['Employee Code', 'Employee Name', 'Department', 'Division', 'Job Title', 'Benefits Assigned'];
    const rows = filtered.map(row => [row.employeeCode, row.employeeName, row.department, row.division, row.jobTitle, row.benefitsAssigned]);
    downloadFile(`employee-benefits-roster.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Employee benefits exported to ${format}.`);
  }

  if (selectedEmployeeBenefit) {
    return <EmployeeBenefitDetailsScreen employeeBenefit={selectedEmployeeBenefit} onBack={() => setSelectedEmployeeBenefit(null)} onNotify={onNotify} />;
  }

  return <div className="hrm-ss-content">
    <PageHeading title="Employee Benefits" />

    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu onExport={exportBenefits} disabled={filtered.length === 0} />
      </div>
    </div>

    {isAdmin ? (
      <DataTable
        columns={[
          { key: 'employeeCode', label: 'Employee Code' },
          { key: 'employeeName', label: 'Employee Name' },
          { key: 'department', label: 'Department' },
          { key: 'division', label: 'Division' },
          { key: 'jobTitle', label: 'Job Title' },
          { key: 'benefitsAssigned', label: 'Benefits Assigned' },
        ]}
        rows={pageRows}
        total={filtered.length}
        rowKey={row => row.id}
        page={table.page}
        pageSize={table.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        empty="No employee benefit records found."
        actions={row => [
          { kind: 'view', label: 'View', onSelect: () => setSelectedEmployeeBenefit(row) },
        ]}
      />
    ) : (
      <DataTable
        columns={[
          { key: 'code', label: 'Benefit Code' },
          { key: 'name', label: 'Benefit Name' },
          { key: 'startDate', label: 'Benefit Start Date', type: 'date' },
          { key: 'endDate', label: 'Benefit End Date', type: 'date' },
          { key: 'amount', label: 'Benefit Amount', type: 'currency' },
        ]}
        rows={list[0]?.benefits || []}
        total={(list[0]?.benefits || []).length}
        rowKey={row => row.code}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        actions={row => [
          { kind: 'view', label: 'View', onSelect: () => setViewingBenefit(row) },
        ]}
      />
    )}

    {drawerOpen && <FilterDrawer
      fields={[
        { key: 'employeeCode', label: 'Employee Code' },
        { key: 'department', label: 'Department', options: [...new Set(list.map(r => r.department))] },
        { key: 'division', label: 'Division', options: [...new Set(list.map(r => r.division))] },
      ]}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {viewingBenefit && <ViewBenefitModal
      benefit={viewingBenefit}
      onClose={() => setViewingBenefit(null)}
    />}
  </div>;
}

/* ------------------------------------------------ 3. Employee Allowances */

function EmployeeAllowancesScreen({ data, onNotify }) {
  const table = useTableState();
  const allowances = data.employeeAllowances || [];

  return <div className="hrm-ss-content">
    <PageHeading title="Employee Allowances" />
    <StatCardRow>
      <StatCard label="Total Allowances Types" value={String(allowances.length)} unit="Configured" />
      <StatCard label="Enrolled Employees" value="85" unit="Active" />
      <StatCard label="Monthly Budget" value="₱680,000.00" unit="PHP / Month" />
      <StatCard label="Tax Classification" value="100% De Minimis" unit="Non-taxable" />
    </StatCardRow>

    <div className="hrm-toolbar" style={{ marginTop: 20 }}>
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
      </div>
      <div className="hrm-toolbar-right">
        <ExportMenu onExport={fmt => onNotify(`Allowances exported to ${fmt}.`)} />
      </div>
    </div>

    <DataTable
      columns={[
        { key: 'code', label: 'Allowance Code' },
        { key: 'name', label: 'Allowance Name' },
        { key: 'amount', label: 'Monthly Amount', type: 'currency' },
        { key: 'frequency', label: 'Frequency' },
        { key: 'taxTreatment', label: 'Tax Treatment' },
        { key: 'recipients', label: 'Recipients Count' },
      ]}
      rows={allowances}
      total={allowances.length}
      rowKey={row => row.id}
      page={1}
      pageSize={10}
      onPageChange={() => {}}
      onPageSizeChange={() => {}}
    />
  </div>;
}

/* ------------------------------------------------- Root Benefits Workspace */

export function BenefitsWorkspace({ data, setData, user, access, subView = 'salary-information', onBack, onNotify }) {
  return <div className="hrm-ss-content">
    {subView === 'salary-information' && <SalaryInformationScreen data={data} user={user} access={access} onNotify={onNotify} />}
    {subView === 'employee-allowances' && <EmployeeAllowancesScreen data={data} onNotify={onNotify} />}
    {subView === 'employee-benefits' && <EmployeeBenefitsScreen data={data} user={user} access={access} onNotify={onNotify} />}
  </div>;
}
