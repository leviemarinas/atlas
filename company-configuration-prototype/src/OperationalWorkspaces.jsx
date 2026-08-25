import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle, DownloadSimple, Eye, FileCsv, MagnifyingGlass, PencilSimple, Plus, ShieldCheck, Trash, UploadSimple, Warning, X } from '@phosphor-icons/react';
import {
  activateCompany,
  appendAuditEvent,
  companyCodeExists,
  companyReadiness,
  createDraftCompany,
  createLifecycleCase,
  defaultCompanyRecord,
  deactivateCompany,
  onboardingChecklist,
  offboardingChecklist,
  readActiveCompany,
  readActiveCompanyId,
  readAuditEvents,
  readCompanies,
  readImportBatches,
  readLifecycleCases,
  saveCompany,
  saveImportBatch,
  saveLifecycleCase,
  serviceCatalog,
} from './companyRepository';
import { AccessRightsWorkspace, CalendarWorkspace, OvertimeGateway, SecurityWorkspace, SettingsConfigurationWorkspace } from './CanonicalWorkspaces';
import { ChargeCodesWorkspace, EmployeeOnboardingWorkspace, HappinessWorkspace, NotificationsWorkspace, TicketingWorkspace, WellnessWorkspace } from './InheritedCapabilities';
import { EnhancedReportShellWorkspace } from './EnhancedReports';
import { PayrollProcessingWorkspace } from './PayrollProcessing';
import { TimeCorrectionWorkspace } from './TimeCorrectionWorkspace';
import { employeeDirectory } from './PolicyApplicability';
import { downloadFile } from './fileDownload';
import { plural } from './textFormat';
import {
  operationalStorageKey,
  postedPayrollOptionsForCompany,
  readOperationalRowsForCompany,
  writeOperationalRowsForCompany,
} from './operationalStore';

const f = (key, label, type = 'text', options = [], required = true) => ({ key, label, type, options, required });
const employeeOptions = () => employeeDirectory.map(employee => `${employee.code} - ${employee.name}`);
/**
 * Posted payroll payouts, read from Payroll Processing's own run store — the
 * register that actually posts a payroll. Remittance and Journal bind to this,
 * so a remittance can only be recorded against a payout that really exists.
 */
const postedPayrollOptions = () => postedPayrollOptionsForCompany(readActiveCompanyId());
const calendarOptions = (type, fallback) => {
  try {
    const rows = JSON.parse(localStorage.getItem('atlas-operational-calendar-v1')) || [];
    const activeCompanyId = readActiveCompanyId();
    const active = rows.filter(row => row.companyId === activeCompanyId && row.calendarType === type && row.status === 'Active').map(row => row.calendarCode);
    return active.length ? active : [fallback];
  } catch { return [fallback]; }
};

const legacyOperationalDefinitions = {
  payCodes: { title: 'Pay Code Library', description: 'Maintain payroll codes, classifications, taxability, and accounting mappings.', fields: [f('code', 'Pay Code'), f('name', 'Pay Item Name'), f('type', 'Type', 'select', ['Basic Pay', 'Earning', 'Bonus', 'Deduction', 'Loan', 'Statutory']), f('taxability', 'Taxability', 'select', ['Taxable', 'Non-taxable', 'Not applicable']), f('glMapping', 'GL Mapping'), f('status', 'Status', 'select', ['Active', 'Inactive'])], rows: [['PAY-BASIC', 'Basic Pay', 'Basic Pay', 'Taxable', 'GL-BASIC', 'Active'], ['ERN-DMN', 'De Minimis Benefit', 'Earning', 'Non-taxable', 'GL-BENEFIT', 'Active']] },
  connectedSystems: { title: 'Connected Systems', description: 'Manage timekeeping, banking, accounting, HR, and identity integrations.', fields: [f('code', 'Connection Code'), f('name', 'System Name'), f('type', 'System Type', 'select', ['Timekeeping', 'Banking', 'Accounting', 'HRM', 'Identity / SSO']), f('syncFrequency', 'Sync Frequency', 'select', ['Real-time', 'Hourly', 'Daily', 'Per Payroll']), f('lastSync', 'Last Sync'), f('failureAction', 'Failure Action', 'select', ['Warn Only', 'Block Payroll', 'Retry Automatically']), f('status', 'Status', 'select', ['Connected', 'Disconnected', 'Error'])], rows: [['SYS-TK', 'Atlas Time', 'Timekeeping', 'Hourly', '2026-08-10 09:00', 'Block Payroll', 'Connected'], ['SYS-BANK', 'BDO Payroll File', 'Banking', 'Per Payroll', '2026-08-09 17:20', 'Warn Only', 'Connected']] },
  remittance: { title: 'Remittance Monitoring', description: 'Record government receipts against posted payouts and monitor payment status.', fields: [f('code', 'Remittance Code'), f('agency', 'Agency', 'select', ['BIR', 'SSS', 'PhilHealth', 'HDMF']), f('month', 'Remittance Month'), f('year', 'Year', 'number'), f('receipt', 'Receipt / Reference No.'), f('amount', 'Amount', 'number'), f('payoutStatus', 'Linked Payout', 'select', ['Posted', 'Not posted']), f('status', 'Status', 'select', ['Draft', 'For Payment', 'Paid', 'Posted'])], rows: [['REM-001', 'SSS', 'July', '2026', 'SSS-OR-00819', '485000', 'Posted', 'Paid']] },
  billing: { title: 'Billing Configuration and Transactions', description: 'Configure recurring billing and move generated bills through three review levels.', fields: [f('code', 'Billing Code'), f('basis', 'Billing Basis', 'select', ['Straight', 'Headcount', 'Bracket', 'Percentage', 'Custom']), f('service', 'Service', 'select', ['Payroll', 'HRM', 'Timekeeping']), f('period', 'Billing Period'), f('cutoffDate', 'Cutoff Date', 'date'), f('amount', 'Amount', 'number'), f('reviewStage', 'Review Stage', 'select', ['Preparer', 'Checker', 'Reviewer']), f('status', 'Status', 'select', ['Draft', 'For Review', 'Approved', 'Generated'])], rows: [['BIL-2026-08', 'Headcount', 'Payroll', 'August 2026', '2026-08-31', '125000', 'Reviewer', 'Approved']] },
  payslip: { title: 'Payslip Designer', description: 'Configure branded payslip templates, visible fields, signatures, and printing details.', fields: [f('code', 'Template Code'), f('name', 'Template Name'), f('logo', 'Logo / Letterhead'), f('visibleFields', 'Visible Fields'), f('showYtd', 'Show YTD', 'select', ['Yes', 'No']), f('eSignature', 'E-signature'), f('status', 'Status', 'select', ['Draft', 'Active', 'Inactive'])], rows: [['PSL-001', 'Standard Atlas Payslip', 'ABC Company Logo', 'Earnings, Deductions, Net Pay, Bank', 'Yes', 'CFO Signature', 'Active']] },
  journal: { title: 'Journal Entries', description: 'Review balanced payroll accounting entries generated from GL mappings.', fields: [f('code', 'Journal Code'), f('period', 'Payroll Period'), f('description', 'Description'), f('debit', 'Total Debit', 'number'), f('credit', 'Total Credit', 'number'), f('status', 'Status', 'select', ['Draft', 'Balanced', 'Posted'])], rows: [['JE-2026-08-2', '16–31 Aug 2026', 'Semi-monthly payroll', '4250000', '4250000', 'Balanced']] },
};

export const operationalDefinitions = {
  ...legacyOperationalDefinitions,
  payCodes: {
    version: 2,
    title: 'Paycode Management',
    description: 'Maintain payroll codes, computation ownership, taxability, and balanced accounting mappings used by payroll and journals.',
    fields: [f('code', 'Pay Code'), f('name', 'Pay Item Name'), f('type', 'Type', 'select', ['Basic Pay', 'Earning', 'Bonus', 'Deduction', 'Loan', 'Statutory']), f('taxability', 'Taxability', 'select', ['Taxable', 'Non-taxable', 'De Minimis', 'Not applicable']), f('computationBasis', 'Computation Basis'), f('debitGl', 'Debit GL Account'), f('creditGl', 'Credit GL Account'), f('allocationDimension', 'Allocation Dimension', 'select', ['Employee', 'Department', 'Cost Center', 'Client / Charge Code']), f('status', 'Status', 'select', ['Active', 'Inactive'])],
    rows: [['PAY-BASIC', 'Basic Pay', 'Basic Pay', 'Taxable', 'Basic monthly rate / factor days', '5100-100', '2100-100', 'Cost Center', 'Active'], ['ERN-DMN', 'De Minimis Benefit', 'Earning', 'De Minimis', 'Effective statutory ceiling', '5200-200', '2100-100', 'Employee', 'Active']],
  },
  earnings: {
    // v3: the seed rows now name employees from the one company roster; v2 rows
    // point at a roster that no longer exists, so the dropdown could not offer them.
    version: 3,
    title: 'Earning Management',
    description: 'Assign recurring and one-time earnings to employees with their effectivity window, frequency, basis and payroll period.',
    statusTabs: ['All', 'Active', 'Inactive', 'Expired'],
    fields: [f('code', 'Earning Code'), f('name', 'Earning Name', 'select', ['13th Month Pay', 'Allowance', 'Adjustments', 'Bonuses', 'Incentives', 'De Minimis Benefit']), f('employee', 'Employee', 'select', employeeOptions), f('frequency', 'Earning Frequency', 'select', ['One-time', 'Monthly', 'Quarterly', 'Semi-monthly', 'Annual']), f('basis', 'Basis/Unit', 'select', ['Fixed amount', 'Hourly', 'Daily', 'Percentage', 'Current Basic Rate']), f('amount', 'Amount', 'number'), f('effectiveDate', 'Effectivity Date', 'date'), f('periodStart', 'Period Start', 'date'), f('periodEnd', 'Period End', 'date', [], false), f('endDate', 'End Date', 'date', [], false), f('holdDate', 'Hold Date', 'date', [], false), f('remarks', 'Remarks', 'text', [], false), f('status', 'Status', 'select', ['Active', 'Inactive', 'Expired'])],
    rows: [
      ['ERN-2025-050', 'Allowance', '0011223345 - John Collins Doe', 'Monthly', 'Fixed amount', '4000', '2025-01-01', '2025-01-01', '2025-12-31', '', '', 'Managerial allowance', 'Active'],
      ['ERN-2025-054', 'Incentives', '0000112345 - Ethan Collins', 'Monthly', 'Fixed amount', '2500', '2025-01-01', '2025-01-01', '2025-12-31', '', '', 'Delivery incentive', 'Active'],
      ['ERN-2024-058', 'Incentives', '0000112346 - Sophia Ramirez', 'Quarterly', 'Percentage', '5', '2024-01-01', '2024-01-01', '2024-12-31', '2024-12-31', '', 'Prior plan year', 'Expired'],
    ],
  },
  deductions: {
    // v3: re-keyed to the one company roster, like Earning Management.
    version: 3,
    title: 'Deduction Management',
    description: 'Track company deductions against each employee with their frequency, recovery window and outstanding balance.',
    fields: [f('code', 'Deduction Code'), f('name', 'Deduction Name', 'select', ['Cash Advance', 'Loan Repayment', 'Tax', 'Late Penalty', 'Allotment', 'Other']), f('employee', 'Employee', 'select', employeeOptions), f('amount', 'Deduction Amount', 'number'), f('frequency', 'Deduction Frequency', 'select', ['Once', 'Monthly', 'Semi-monthly', 'Bi-monthly', 'Quarterly']), f('startDate', 'Start Date', 'date'), f('endDate', 'End Date', 'date', [], false), f('balance', 'Balance', 'number', [], false), f('remarks', 'Remarks', 'text', [], false), f('status', 'Status', 'select', ['Active', 'Settled', 'On Hold'])],
    rows: [
      ['DED-2025-050', 'Cash Advance', '0011223345 - John Collins Doe', '1837.33', 'Once', '2025-01-01', '2025-12-31', '8662.67', '', 'Active'],
      ['DED-2025-053', 'Loan Repayment', '0000112345 - Ethan Collins', '1837.33', 'Bi-monthly', '2025-01-01', '2025-12-31', '14698.64', '', 'Active'],
      ['DED-2025-058', 'Late Penalty', '0000112346 - Sophia Ramirez', '500', 'Monthly', '2025-01-01', '', '0', 'Fully recovered', 'Settled'],
    ],
  },
  bonuses: {
    // v3: re-keyed to the one company roster, like Earning Management.
    version: 3,
    title: 'Bonus Management',
    description: 'Schedule 13th month, performance and retention bonuses and follow each one from active through processed to completed.',
    statusTabs: ['All', 'Active', 'Scheduled', 'Processed', 'Completed'],
    fields: [f('code', 'Bonus Code'), f('name', 'Bonus Name', 'select', ['13th Month Pay', 'Performance Bonus', 'Retention Bonus', 'Signing Bonus', 'Mid-year Bonus']), f('employee', 'Employee', 'select', employeeOptions), f('amount', 'Bonus Amount', 'number'), f('effectiveDate', 'Effective Date', 'date'), f('taxability', 'Taxability', 'select', ['Taxable', 'Non-taxable up to ceiling']), f('statusDate', 'Status Date', 'date', [], false), f('remarks', 'Remarks', 'text', [], false), f('status', 'Status', 'select', ['Active', 'Scheduled', 'Processed', 'Completed'])],
    rows: [
      ['BON-2025-050', 'Performance Bonus', '0011223345 - John Collins Doe', '45000', '2025-11-30', 'Non-taxable up to ceiling', '2025-12-01', '', 'Active'],
      ['BON-2025-053', 'Performance Bonus', '0000112345 - Ethan Collins', '30000', '2025-11-30', 'Non-taxable up to ceiling', '2025-12-01', '', 'Scheduled'],
      ['BON-2025-056', 'Retention Bonus', '0000112347 - Liam Johnson', '25000', '2025-11-30', 'Taxable', '2025-12-01', '', 'Processed'],
      ['BON-2025-058', 'Retention Bonus', '0000112349 - Olivia Carter', '20000', '2025-11-30', 'Taxable', '2025-12-01', '', 'Completed'],
    ],
  },
  mweRates: {
    version: 2,
    title: 'MWE Rate Tables',
    description: 'Regional minimum wage rates by sector and municipality, with the wage order each rate was issued under.',
    fields: [f('code', 'Code'), f('effectiveDate', 'Effective Date', 'date'), f('region', 'MWE Region', 'select', ['NCR', 'Region I', 'Region III', 'Region IV-A', 'Region VI', 'Region VII', 'Region XI']), f('sector', 'MWE Sector', 'select', ['Non-agriculture', 'Agriculture (Plantation)', 'Agriculture (Non-plantation)', 'Retail/Service Establishments']), f('municipality', 'Municipality'), f('classification', 'MWE Municipalities Classification', 'select', ['1st', '2nd', '3rd', '4th', '5th', '6th']), f('dailyRate', 'MWE Daily Rate', 'number'), f('wageOrder', 'Wage Order'), f('remarks', 'Remarks', 'text', [], false), f('status', 'Status', 'select', ['Active', 'Inactive'])],
    rows: [
      ['MWE-2026-001', '2026-01-01', 'NCR', 'Non-agriculture', 'Manila', '1st', '700', 'Wage Order NCR-25', '', 'Active'],
      ['MWE-2026-002', '2026-01-01', 'NCR', 'Retail/Service Establishments', 'Marikina', '1st', '663', 'Wage Order NCR-25', '', 'Active'],
      ['MWE-2025-001', '2025-01-01', 'NCR', 'Non-agriculture', 'Manila', '1st', '645', 'Wage Order NCR-24', 'Superseded by NCR-25', 'Inactive'],
    ],
  },
  remittance: {
    // v3: the register now records the filing itself (who filed and paid, the
    // filing reference, O.R. details), so v2 rows cannot satisfy its fields.
    version: 3,
    title: 'Remittance Monitoring',
    description: 'Record filing and payment evidence against posted payroll payouts for BIR, SSS, PhilHealth and HDMF.',
    statusTabs: ['All', 'Pending', 'Draft', 'Verified'],
    fields: [f('code', 'Remittance Code'), f('year', 'Year', 'number'), f('month', 'Month', 'select', ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']), f('linkedPayout', 'Posted Payroll Payout', 'select', postedPayrollOptions), f('filedBy', 'Filed By'), f('paidBy', 'Paid By'), f('transactionMode', 'Transaction Mode', 'select', ['Online', 'Over-the-counter', 'Bank Debit', 'Check', 'Cash']), f('agency', 'Statutory Agency', 'select', ['BIR', 'SSS', 'PhilHealth', 'HDMF']), f('statutoryType', 'Statutory Type', 'select', ['Contribution', 'Loan', 'Tax']), f('remittanceType', 'Remittance Type', 'select', ['Contribution', 'Loan', 'Withholding Tax', 'Expanded Tax', 'Final Tax', 'Other']), f('governmentLoanType', 'Government Loan Type', 'select', ['Not applicable', 'SSS Salary Loan', 'SSS Calamity Loan', 'HDMF Multi-Purpose Loan', 'HDMF Calamity Loan'], false), f('loanName', 'Loan Name', 'text', [], false), f('dateFiled', 'Date Filed / Authorized', 'date'), f('filingReference', 'Filing Reference Number'), f('receipt', 'O.R. Number'), f('orDate', 'O.R. Date', 'date', [], false), f('datePaid', 'Date Paid / Posted', 'date', [], false), f('amount', 'Amount Paid', 'number'), f('remarks', 'Remarks', 'text', [], false), f('status', 'Status', 'select', ['Pending', 'Draft', 'Verified'])],
    rows: [
      ['REM-2026-001', '2026', 'July', 'PAY-2026-07-2', 'John Doe', 'Ethan Collins', 'Online', 'SSS', 'Contribution', 'Contribution', 'Not applicable', '', '2026-08-08', 'SSS-FIL-2026-0731', 'SSS-OR-00819', '2026-08-09', '2026-08-10', '485000', '', 'Verified'],
      ['REM-2026-002', '2026', 'July', 'PAY-2026-07-2', 'John Doe', 'Ethan Collins', 'Online', 'BIR', 'Tax', 'Withholding Tax', 'Not applicable', '', '2026-08-10', 'BIR-1601C-2026-07', 'BIR-OR-11204', '2026-08-10', '2026-08-10', '612400', '', 'Pending'],
      ['REM-2026-003', '2026', 'July', 'PAY-2026-07-2', 'John Doe', 'Ethan Collins', 'Bank Debit', 'HDMF', 'Loan', 'Loan', 'HDMF Multi-Purpose Loan', 'MPL Amortization', '2026-08-11', 'HDMF-FIL-2026-0715', 'HDMF-OR-77120', '', '', '96500', 'Awaiting O.R. copy', 'Draft'],
    ],
  },
  billing: {
    version: 2,
    title: 'Billing Configuration and Transactions',
    description: 'Configure billing basis and cutoff dependencies, calculate the fee, and move each bill through preparer, checker and reviewer stages.',
    fields: [f('code', 'Billing Code'), f('basis', 'Billing Basis', 'select', ['Straight', 'Headcount', 'Bracket', 'Percentage', 'Custom']), f('service', 'Service', 'select', ['Payroll', 'HRM', 'Timekeeping']), f('calendarCode', 'Billing Cutoff Calendar', 'select', () => calendarOptions('Billing Cutoff', 'BILL-AUG')), f('period', 'Billing Period'), f('quantity', 'Headcount / Quantity', 'number', [], false), f('unitRate', 'Unit / Bracket Rate', 'number', [], false), f('baseAmount', 'Percentage Base Amount', 'number', [], false), f('percentageRate', 'Percentage Rate', 'number', [], false), f('amount', 'Calculated Billing Amount', 'number'), f('reviewStage', 'Current Review Stage', 'select', ['Preparer', 'Checker', 'Reviewer']), f('status', 'Status', 'select', ['Draft', 'For Review', 'Approved', 'Generated'])],
    rows: [['BIL-2026-08', 'Headcount', 'Payroll', 'BILL-AUG', 'August 2026', '1250', '100', '', '', '125000', 'Reviewer', 'Approved']],
  },
  payslip: {
    version: 2,
    title: 'Payslip Designer',
    description: 'Choose a standard or custom template, configure branded fields and signatures, and publish one active company layout.',
    fields: [f('code', 'Template Code'), f('name', 'Template Name'), f('templateType', 'Template Type', 'select', ['Standard', 'Custom']), f('layout', 'Layout', 'select', ['Classic', 'Compact', 'Detailed']), f('logo', 'Logo / Letterhead'), f('visibleFields', 'Visible Fields'), f('showYtd', 'Show YTD', 'select', ['Yes', 'No']), f('eSignature', 'E-signature'), f('status', 'Status', 'select', ['Draft', 'Active', 'Inactive'])],
    rows: [['PSL-001', 'Standard Atlas Payslip', 'Standard', 'Detailed', 'ABC Company Logo', 'Earnings, Deductions, Net Pay, Bank', 'Yes', 'CFO Signature', 'Active']],
  },
  journal: {
    version: 2,
    title: 'Journal Entries',
    description: 'Review balanced accounting entries generated from a posted payroll and its pay-code GL and cost-allocation mappings.',
    fields: [f('code', 'Journal Code'), f('linkedPayout', 'Posted Payroll Payout', 'select', postedPayrollOptions), f('period', 'Payroll Period'), f('description', 'Description'), f('glSegment', 'GL Segment / Company Code'), f('costBreakdown', 'Cost Center Breakdown'), f('debit', 'Total Debit', 'number'), f('credit', 'Total Credit', 'number'), f('status', 'Status', 'select', ['Draft', 'Balanced', 'Posted'])],
    rows: [['JE-2026-07-2', 'PAY-2026-07-2', '16-31 Jul 2026', 'Semi-monthly payroll', 'ABC-01', 'By employee cost allocation', '4250000', '4250000', 'Balanced']],
  },
};

const recordFromRow = (definition, row, index, companyId) => ({ companyId, id: index + 1, ...Object.fromEntries(definition.fields.map((field, fieldIndex) => [field.key, row[fieldIndex] ?? ''])) });

/**
 * A register's rows, for a module that needs them without opening the screen.
 *
 * A register only writes its rows to storage once somebody has visited it, so a
 * payroll run that read storage alone saw nothing from a register nobody had
 * opened — the seeded bonuses and deductions were invisible to the computation.
 * Falling back to the definition's own seed is what makes the register the
 * single source whether or not its screen has been mounted.
 */
export function readRegisterRows(workspaceKey, companyId = readActiveCompanyId()) {
  const definition = operationalDefinitions[workspaceKey];
  if (!definition) return [];
  const stored = readOperationalRowsForCompany(workspaceKey, companyId, globalThis.localStorage, [definition.version || 1]);
  if (stored.length) return stored;
  return (definition.rows || []).map((row, index) => recordFromRow(definition, row, index, companyId));
}

function EntryModal({ definition, record, onClose, onSave }) {
  const optionsFor = field => typeof field.options === 'function' ? field.options() : field.options;
  const [draft, setDraft] = useState(record || Object.fromEntries(definition.fields.map(field => [field.key, field.key === 'status' ? optionsFor(field)[0] : ''])));
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal operational-entry-modal"><header><h2>{record ? 'Edit' : 'Add'} {definition.title}</h2><button className="icon-button" onClick={onClose}><X /></button></header><form onSubmit={event => { event.preventDefault(); onSave(draft); }}><div className="employee-form-grid">{definition.fields.map(field => <label key={field.key}>{field.label}{field.required && <span className="required">*</span>}{field.type === 'select' ? <select required={field.required} value={draft[field.key] || ''} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })}><option value="">Please select</option>{optionsFor(field).map(option => <option key={option}>{option}</option>)}</select> : field.type === 'textarea' ? <textarea required={field.required} value={draft[field.key] || ''} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} /> : <input required={field.required} type={field.type} step={field.type === 'number' ? '0.01' : undefined} value={draft[field.key] || ''} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} />}</label>)}</div><footer className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Save record</button></footer></form></section></div>;
}

/** Steps in the company onboarding wizard; the counters read their length. */
const onboardingSteps = ['Identity', 'Profile', 'Services', 'Startup / YTD', 'Review'];

const today = () => new Date().toISOString().slice(0, 10);
const clone = value => JSON.parse(JSON.stringify(value));
const lifecycleClass = value => String(value || '').toLowerCase().replaceAll(' ', '-');
const emptyCompany = () => ({
  ...clone(defaultCompanyRecord), companyId: '', companyCode: '', legalName: '', displayName: '', tradeName: '',
  industry: '', businessType: 'Corporation', tin: '', lifecycleStatus: 'Draft', activationDate: '', offboardingStatus: 'Not scheduled',
  profile: { ...clone(defaultCompanyRecord.profile), registrationStatus: 'Pending', secDtiNumber: '', birRdo: '', sssBranchCode: '', philHealthBranchCode: '', hdmfBranchCode: '', address: '', zip: '', telephone: '', mobile: '', email: '', website: '', payrollContact: '', billingContact: '', remittanceContact: '' },
  bankAccounts: [], authorizedContacts: [], signatories: [], documents: [], serviceEnrollments: [],
});

const lifecycleServiceOptions = serviceCatalog;

function Checklist({ items, onToggle }) {
  return <div className="lifecycle-checklist">{items.map(item => <div key={item.itemCode} className={`lifecycle-checklist-item ${item.status === 'Complete' ? 'complete' : ''}`}><button type="button" className="checklist-mark" onClick={() => onToggle?.(item)} aria-label={`${item.status === 'Complete' ? 'Reopen' : 'Complete'} ${item.section}`}>{item.status === 'Complete' ? <Check weight="bold" /> : <span />}</button><div><strong>{item.section}{item.required && <span className="required">*</span>}</strong><small>{item.label}</small>{item.evidence && <em>{item.evidence}</em>}</div><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></div>)}</div>;
}

function OnboardingWizard({ company, lifecycle, onClose, onSaved, notify }) {
  const [draft, setDraft] = useState(() => clone(company || emptyCompany()));
  const [caseDraft, setCaseDraft] = useState(() => clone(lifecycle || { caseId: '', companyId: company?.companyId || '', type: 'ONBOARDING', status: 'Draft', checklist: onboardingChecklist(), importBatchId: '' }));
  const [step, setStep] = useState(0);
  const [importType, setImportType] = useState(lifecycle?.importType || 'Startup configuration');
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');

  const imports = readImportBatches(draft.companyId);
  const readiness = companyReadiness(draft, caseDraft, imports);
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const updateProfile = (key, value) => setDraft(previous => ({ ...previous, profile: { ...previous.profile, [key]: value } }));
  const updateBank = (key, value) => setDraft(previous => ({ ...previous, bankAccounts: [{ ...(previous.bankAccounts[0] || {}), bankAccountId: previous.bankAccounts[0]?.bankAccountId || `bank-${Date.now()}`, [key]: value }] }));
  const updateContact = (key, value) => setDraft(previous => ({ ...previous, authorizedContacts: [{ ...(previous.authorizedContacts[0] || {}), contactPersonId: previous.authorizedContacts[0]?.contactPersonId || `contact-${Date.now()}`, [key]: value, status: previous.authorizedContacts[0]?.status || 'Active' }] }));
  const updateSignatory = (key, value) => setDraft(previous => ({ ...previous, signatories: [{ ...(previous.signatories[0] || {}), signatoryId: previous.signatories[0]?.signatoryId || `signatory-${Date.now()}`, [key]: value, status: previous.signatories[0]?.status || 'Active' }] }));

  const ensureSaved = () => {
    if (!draft.companyCode.trim() || !draft.legalName.trim() || !draft.tin.trim() || !draft.industry.trim()) {
      setError('Company Code, Legal Name, TIN, and Industry are required before continuing.'); return null;
    }
    if (companyCodeExists(draft.companyCode, draft.companyId)) { setError('Company Code already exists. It cannot collide with an active or historical company.'); return null; }
    if (!draft.companyId) {
      try {
        const created = createDraftCompany({ ...draft, companyCode: draft.companyCode.trim().toUpperCase(), legalName: draft.legalName.trim(), displayName: draft.displayName.trim() || draft.legalName.trim() }, 'P&A Admin');
        setDraft(created.company); setCaseDraft(created.lifecycle); onSaved?.(); return created;
      } catch (cause) { setError(cause.message); return null; }
    }
    const savedCompany = saveCompany(draft, 'P&A Admin');
    const savedCase = caseDraft.caseId ? saveLifecycleCase(caseDraft, 'P&A Admin') : createLifecycleCase(savedCompany.companyId, 'ONBOARDING', 'P&A Admin');
    setDraft(savedCompany); setCaseDraft(savedCase); onSaved?.(); return { company: savedCompany, lifecycle: savedCase };
  };

  const next = () => {
    setError('');
    const saved = ensureSaved();
    if (!saved) return;
    if (step < 4 && (saved.lifecycle || caseDraft).status === 'Draft') {
      const progressed = { ...(saved.lifecycle || caseDraft), status: 'Setup In Progress' };
      setCaseDraft(progressed);
      saveLifecycleCase(progressed, 'P&A Admin');
    }
    if (step < 4) setStep(value => value + 1);
  };

  const updateServices = serviceCode => setDraft(previous => {
    const existing = previous.serviceEnrollments || [];
    const current = existing.find(item => item.serviceCode === serviceCode);
    const next = current?.enabled === true ? existing.map(item => item.serviceCode === serviceCode ? { ...item, enabled: false, status: 'Not selected' } : item) : lifecycleServiceOptions.map(option => {
      const saved = existing.find(item => item.serviceCode === option.serviceCode);
      return saved?.serviceCode === serviceCode ? { ...saved, enabled: true, status: saved.status === 'Not selected' ? option.status : saved.status } : saved || { ...option, enabled: option.serviceCode === serviceCode, effectiveFrom: today() };
    });
    return { ...previous, serviceEnrollments: next };
  });

  const downloadTemplate = () => {
    const headers = importType === 'Historical / YTD' ? ['Employee Code', 'Tax Year', 'Basic Earnings YTD', 'Tax Withheld YTD', 'Previous Employer Taxable'] : ['Employee Code', 'Company Code', 'Effective Date', 'Basic Pay', 'Payroll Frequency'];
    downloadFile(`${importType.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-template.csv`, `${headers.join(',')}\n${headers.map(() => '').join(',')}\n`, 'text/csv');
    notify({ type: 'success', message: `${importType} template downloaded.` });
  };

  const importFile = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result || '').split(/\r?\n/).filter(Boolean);
      const headers = (lines.shift() || '').split(',').map(value => value.replaceAll('"', '').trim());
      const requiredHeaders = importType === 'Historical / YTD' ? ['Employee Code', 'Tax Year'] : ['Employee Code', 'Company Code'];
      const missingHeaders = requiredHeaders.filter(header => !headers.some(value => value.toLowerCase() === header.toLowerCase()));
      const rows = lines.map((line, index) => ({ row: index + 2, values: line.split(',').map(value => value.replace(/^"|"$/g, '').trim()) }));
      const errors = missingHeaders.length ? [`Missing required columns: ${missingHeaders.join(', ')}`] : !rows.length ? ['The file must contain at least one data row.'] : rows.filter(item => !item.values[0] || (importType !== 'Historical / YTD' && item.values[1] !== draft.companyCode)).map(item => `Row ${item.row}: Employee Code is required and Company Code must be ${draft.companyCode}.`);
      const batch = saveImportBatch({ companyId: draft.companyId, importType, templateVersion: 'v1.0', filename: file.name, status: errors.length ? 'Rejected' : 'Validated', accepted: errors.length ? 0 : rows.length, rejected: errors.length, warnings: 0, errors, rowCount: rows.length }, 'P&A Admin');
      setImportResult(batch);
      setCaseDraft(previous => ({ ...previous, importType, importBatchId: batch.batchId, checklist: previous.checklist.map(item => item.itemCode === 'STARTUP_YTD' ? { ...item, status: errors.length ? 'Blocked' : 'Complete', evidence: `${batch.accepted} accepted / ${batch.rejected} rejected` } : item) }));
      notify({ type: errors.length ? 'error' : 'success', message: errors.length ? `${file.name} needs correction before it can be committed.` : `${file.name} validated. ${rows.length} rows are ready for controlled commit.` });
    };
    reader.readAsText(file); event.target.value = '';
  };

  const commitImport = () => {
    if (!importResult || importResult.status !== 'Validated') return setError('Validate a startup/YTD file with no blocking errors before committing.');
    const committed = saveImportBatch({ ...importResult, status: 'Completed', committedAt: new Date().toISOString() }, 'P&A Admin');
    setImportResult(committed);
    setCaseDraft(previous => ({ ...previous, checklist: previous.checklist.map(item => item.itemCode === 'STARTUP_YTD' ? { ...item, status: 'Complete', evidence: `${committed.accepted} rows committed` } : item) }));
    notify({ type: 'success', message: `${committed.accepted} startup/YTD rows committed atomically.` });
  };

  const submitReview = () => {
    const saved = ensureSaved();
    if (!saved) return;
    const currentReadiness = companyReadiness(saved.company || saved, saved.lifecycle || caseDraft, readImportBatches(draft.companyId));
    if (currentReadiness.blockers.length) return setError(`Resolve the required onboarding blockers first: ${currentReadiness.blockers.slice(0, 3).join('; ')}${currentReadiness.blockers.length > 3 ? '…' : ''}`);
    const nextCase = { ...(saved.lifecycle || caseDraft), status: 'For Review', checklist: currentReadiness.checklist.map(item => item.itemCode === 'FINAL_REVIEW' ? { ...item, status: 'Complete' } : item) };
    setCaseDraft(nextCase); saveLifecycleCase(nextCase, 'P&A Admin'); notify({ type: 'success', message: `${draft.companyCode} submitted for onboarding review.` }); onSaved?.();
  };

  const approve = () => {
    if (caseDraft.status !== 'For Review') return setError('The onboarding case must be submitted for review before approval.');
    const nextCase = { ...caseDraft, status: 'Ready for Activation' }; setCaseDraft(nextCase); saveLifecycleCase(nextCase, 'Reviewer'); notify({ type: 'success', message: 'Onboarding approved and ready for activation.' }); onSaved?.();
  };

  const activate = () => {
    if (caseDraft.status !== 'Ready for Activation') return setError('The case must be Ready for Activation before it can become Active.');
    const result = activateCompany(draft, caseDraft, 'Approver'); setDraft(result.company); setCaseDraft(result.lifecycle); notify({ type: 'success', message: `${result.company.companyCode} is active and available to operational selectors.` }); onSaved?.();
  };

  const toggleChecklist = item => {
    const nextChecklist = caseDraft.checklist.map(candidate => candidate.itemCode === item.itemCode ? { ...candidate, status: candidate.status === 'Complete' ? 'Pending' : 'Complete' } : candidate);
    const nextCase = { ...caseDraft, checklist: nextChecklist }; setCaseDraft(nextCase); saveLifecycleCase(nextCase, 'P&A Admin'); onSaved?.();
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal lifecycle-modal" role="dialog" aria-modal="true" aria-label="Company onboarding wizard">
    <header><div><small>Company lifecycle</small><h2>{draft.companyId ? `Onboard ${draft.companyCode || 'company'}` : 'Add New Company'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
    <div className="lifecycle-steps">{onboardingSteps.map((label, index) => <div key={label} className={`${step === index ? 'active' : ''} ${step > index ? 'complete' : ''}`}><span>{step > index ? <Check weight="bold" /> : index + 1}</span><strong>{label}</strong></div>)}</div>
    <div className="lifecycle-body">
      {step === 0 && <section className="lifecycle-panel"><div className="lifecycle-heading"><span>Step {1} of {onboardingSteps.length}</span><h3>Enter company identity</h3><p>Create one draft company record. The Company Code stays unique across active and historical companies.</p></div><div className="lifecycle-grid"><label>Company Code<span className="required">*</span><input value={draft.companyCode} onChange={event => update('companyCode', event.target.value.toUpperCase())} placeholder="e.g. ABC-PH-001" required /></label><label>Legal Company Name<span className="required">*</span><input value={draft.legalName} onChange={event => update('legalName', event.target.value)} required /></label><label>Display / Trade Name<input value={draft.displayName} onChange={event => update('displayName', event.target.value)} /></label><label>Industry<span className="required">*</span><input value={draft.industry} onChange={event => update('industry', event.target.value)} placeholder="e.g. Professional Services" required /></label><label>Business Type<select value={draft.businessType} onChange={event => update('businessType', event.target.value)}><option>Corporation</option><option>Partnership</option><option>Sole Proprietorship</option><option>Non-profit</option></select></label><label>TIN<span className="required">*</span><input value={draft.tin} onChange={event => update('tin', event.target.value)} required /></label></div></section>}
      {step === 1 && <section className="lifecycle-panel"><div className="lifecycle-heading"><span>Step {2} of {onboardingSteps.length}</span><h3>Complete the company profile</h3><p>These values remain owned by Company Information. The onboarding case only references the companyId.</p></div><div className="lifecycle-subheading">Employer registrations</div><div className="lifecycle-grid"><label>SEC / DTI registration no.<input value={draft.profile.secDtiNumber} onChange={event => updateProfile('secDtiNumber', event.target.value)} /></label><label>BIR RDO<input value={draft.profile.birRdo} onChange={event => updateProfile('birRdo', event.target.value)} /></label><label>SSS branch code<input value={draft.profile.sssBranchCode} onChange={event => updateProfile('sssBranchCode', event.target.value)} /></label><label>PhilHealth branch code<input value={draft.profile.philHealthBranchCode} onChange={event => updateProfile('philHealthBranchCode', event.target.value)} /></label><label>HDMF branch code<input value={draft.profile.hdmfBranchCode} onChange={event => updateProfile('hdmfBranchCode', event.target.value)} /></label><label>Registration status<select value={draft.profile.registrationStatus} onChange={event => updateProfile('registrationStatus', event.target.value)}><option>Pending</option><option>Verified</option></select></label></div><div className="lifecycle-subheading">Contact and payout profile</div><div className="lifecycle-grid"><label>Business address<span className="required">*</span><input value={draft.profile.address} onChange={event => updateProfile('address', event.target.value)} required /></label><label>ZIP<input value={draft.profile.zip} onChange={event => updateProfile('zip', event.target.value)} /></label><label>Telephone<input value={draft.profile.telephone} onChange={event => updateProfile('telephone', event.target.value)} /></label><label>Mobile<input value={draft.profile.mobile} onChange={event => updateProfile('mobile', event.target.value)} /></label><label>Primary email<span className="required">*</span><input type="email" value={draft.profile.email} onChange={event => updateProfile('email', event.target.value)} required /></label><label>Website<input value={draft.profile.website} onChange={event => updateProfile('website', event.target.value)} /></label><label>Payroll contact<input value={draft.profile.payrollContact} onChange={event => updateProfile('payrollContact', event.target.value)} /></label><label>Billing contact<input value={draft.profile.billingContact} onChange={event => updateProfile('billingContact', event.target.value)} /></label><label>Remittance contact<input value={draft.profile.remittanceContact} onChange={event => updateProfile('remittanceContact', event.target.value)} /></label></div><div className="lifecycle-subheading">Default bank account and authorized people</div><div className="lifecycle-grid"><label>Bank reference<span className="required">*</span><input value={draft.bankAccounts[0]?.bankReference || ''} onChange={event => updateBank('bankReference', event.target.value)} required /></label><label>Bank name<span className="required">*</span><input value={draft.bankAccounts[0]?.bankName || ''} onChange={event => updateBank('bankName', event.target.value)} required /></label><label>Account name<span className="required">*</span><input value={draft.bankAccounts[0]?.accountName || ''} onChange={event => updateBank('accountName', event.target.value)} required /></label><label>Account number<span className="required">*</span><input value={draft.bankAccounts[0]?.accountNumber || ''} onChange={event => updateBank('accountNumber', event.target.value)} required /></label><label>Payment mode<select value={draft.bankAccounts[0]?.paymentMode || 'Bank Transfer'} onChange={event => updateBank('paymentMode', event.target.value)}><option>Bank Transfer</option><option>Check</option><option>Cash</option></select></label><label>Authorized contact<input value={draft.authorizedContacts[0]?.person || ''} onChange={event => updateContact('person', event.target.value)} /></label><label>Contact responsibility<input value={draft.authorizedContacts[0]?.responsibility || ''} onChange={event => updateContact('responsibility', event.target.value)} /></label><label>Authorized signatory<input value={draft.signatories[0]?.person || ''} onChange={event => updateSignatory('person', event.target.value)} /></label><label>Approval role<input value={draft.signatories[0]?.approvalRole || ''} onChange={event => updateSignatory('approvalRole', event.target.value)} /></label></div><div className="lifecycle-callout"><ShieldCheck /><div><strong>Permanent company documents stay in Company Information.</strong><span>Open Setup &amp; Verification to upload and verify registration evidence. This readiness gate reads the validated document register without duplicating the files here.</span></div></div></section>}
      {step === 2 && <section className="lifecycle-panel"><div className="lifecycle-heading"><span>Step {3} of {onboardingSteps.length}</span><h3>Select service modules</h3><p>Enrollment is stored on the company master; service configuration and readiness stay in the owning modules.</p></div><div className="lifecycle-service-list">{lifecycleServiceOptions.map(option => { const enrolled = draft.serviceEnrollments?.find(item => item.serviceCode === option.serviceCode); return <button type="button" key={option.serviceCode} className={`lifecycle-service-card ${enrolled?.enabled ? 'selected' : ''}`} onClick={() => updateServices(option.serviceCode)}><span className="service-check">{enrolled?.enabled ? <Check weight="bold" /> : <span />}</span><div><strong>{option.name}</strong><small>{enrolled?.enabled ? `Enrolled · ${enrolled.status}` : 'Not selected'}</small></div><ArrowRight /></button>; })}</div><div className="lifecycle-callout"><ShieldCheck /><div><strong>Access and approvals are checked, not duplicated here.</strong><span>Configure company users, roles and approval levels in Access & Approvals. The checklist will refresh from that source.</span></div></div></section>}
      {step === 3 && <section className="lifecycle-panel"><div className="lifecycle-heading"><span>Step {4} of {onboardingSteps.length}</span><h3>Import startup or YTD data</h3><p>Download the published template, upload it for row-level validation, then commit only after errors are resolved.</p></div><div className="import-workflow-card"><label>Import type<select value={importType} onChange={event => setImportType(event.target.value)}><option>Startup configuration</option><option>Historical / YTD</option><option>Other approved template</option></select></label><div className="import-actions"><button type="button" className="button secondary" onClick={downloadTemplate}><DownloadSimple /> Download template</button><label className="button secondary upload-button"><UploadSimple /> Upload file<input className="sr-only" type="file" accept=".csv,text/csv" onChange={importFile} /></label></div>{importResult && <div className={`import-result ${importResult.status.toLowerCase()}`}><div><strong>{importResult.filename}</strong><span>{importResult.status} · {importResult.accepted || 0} accepted · {importResult.rejected || 0} rejected</span></div>{importResult.errors?.length ? <ul>{importResult.errors.slice(0, 5).map(item => <li key={item}>{item}</li>)}</ul> : <p>Structure and row checks passed. Commit the batch to complete the checklist item.</p>}{importResult.status === 'Validated' && <button type="button" className="button primary" onClick={commitImport}>Commit validated batch</button>}</div>}</div></section>}
      {step === 4 && <section className="lifecycle-panel"><div className="lifecycle-heading"><span>Step {5} of {onboardingSteps.length}</span><h3>Review readiness and activate</h3><p>Required items are computed from Company Information, service modules, calendars, imports, access, billing and connections.</p></div><div className="readiness-summary"><span><strong>{readiness.checklist.filter(item => item.status === 'Complete').length}</strong><small>Complete</small></span><span><strong>{readiness.blockers.length}</strong><small>Blocking</small></span><span><strong>{readiness.warnings.length}</strong><small>Warnings</small></span><span><strong className={`status-text ${lifecycleClass(caseDraft.status)}`}>{caseDraft.status}</strong><small>Case state</small></span></div><Checklist items={readiness.checklist} onToggle={toggleChecklist} />{readiness.blockers.length > 0 && <div className="lifecycle-warning"><Warning /><span><strong>Activation is blocked.</strong> Resolve the required checklist items before submitting this case for review.</span></div>}{caseDraft.status === 'For Review' && <div className="lifecycle-callout"><CheckCircle /><div><strong>Ready for an authorized approval.</strong><span>The requester has submitted the case; an approver can move it to Ready for Activation.</span></div></div>}{caseDraft.status === 'Active' && <div className="lifecycle-success"><CheckCircle /><span>Company is active. Changes after activation will recalculate readiness and create a new audit event.</span></div>}</section>}
    </div>
    {error && <p className="lifecycle-error">{error}</p>}
    <footer className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={step === 0 ? onClose : () => { setError(''); setStep(value => value - 1); }}>{step === 0 ? 'Cancel' : 'Back'}</button>{step < 4 ? <button type="button" className="button primary" onClick={next}>Save and continue <ArrowRight /></button> : <div className="lifecycle-footer-actions">{caseDraft.status !== 'Active' && caseDraft.status !== 'For Review' && caseDraft.status !== 'Ready for Activation' && <button type="button" className="button primary" onClick={submitReview}>Submit for review</button>}{caseDraft.status === 'For Review' && <button type="button" className="button primary" onClick={approve}>Approve setup</button>}{caseDraft.status === 'Ready for Activation' && <button type="button" className="button primary" onClick={activate}>Activate company</button>}{caseDraft.status === 'Active' && <button type="button" className="button secondary" onClick={onClose}>Close</button>}</div>}</footer>
  </section></div>;
}

function OffboardingModal({ caseRecord, onClose, onSaved, notify }) {
  const companies = readCompanies().filter(company => ['Active', 'Ready for Activation'].includes(company.lifecycleStatus));
  const [draft, setDraft] = useState(() => clone(caseRecord || { caseId: '', companyId: companies[0]?.companyId || '', type: 'OFFBOARDING', status: 'Requested', requestedAt: today(), exportScope: ['All Company Data'], handoffRecipient: '', acknowledgement: '', checklist: [] }));
  const company = companies.find(item => item.companyId === draft.companyId) || readCompanies().find(item => item.companyId === draft.companyId);
  const checklist = draft.checklist?.length ? draft.checklist : offboardingChecklist();
  const setCase = changes => setDraft(previous => ({ ...previous, ...changes }));
  const persist = (changes = {}) => {
    const next = { ...draft, ...changes, companyId: draft.companyId };
    const saved = next.caseId ? saveLifecycleCase(next, 'P&A Admin') : createLifecycleCase(next.companyId, 'OFFBOARDING', 'P&A Admin', next);
    setDraft(saved); onSaved?.(); return saved;
  };
  const submitForApproval = () => { if (!draft.companyId || !draft.exportScope?.length) return notify({ type: 'error', message: 'Select a company and at least one export scope.' }); const nextChecklist = (draft.checklist?.length ? draft.checklist : clone(checklist)).map(item => item.itemCode === 'DEPENDENCIES' ? { ...item, status: 'Complete' } : item); const saved = persist({ status: 'For Approval', checklist: nextChecklist }); notify({ type: 'success', message: `${company?.companyCode || 'Company'} offboarding submitted for approval.` }); setDraft(saved); };
  const prepareExport = () => {
    if (!company) return notify({ type: 'error', message: 'Select an active company before preparing an export.' });
    const manifest = { packageReference: `EXP-${company.companyCode}-${Date.now()}`, companyId: company.companyId, companyCode: company.companyCode, generatedAt: new Date().toISOString(), scope: draft.exportScope, datasets: { companyProfile: 1, bankAccounts: company.bankAccounts?.length || 0, authorizedContacts: company.authorizedContacts?.length || 0, signatories: company.signatories?.length || 0, documents: company.documents?.length || 0 }, note: 'Historical and audit records remain retained in Atlas.' };
    downloadFile(`${manifest.packageReference}.json`, JSON.stringify(manifest, null, 2), 'application/json');
    const nextChecklist = (draft.checklist?.length ? draft.checklist : clone(checklist)).map(item => ['EXPORT_SCOPE', 'EXPORT_VALIDATION'].includes(item.itemCode) ? { ...item, status: 'Complete', evidence: manifest.packageReference } : item);
    const saved = persist({ status: 'Export Ready', packageReference: manifest.packageReference, packagePreparedAt: manifest.generatedAt, checklist: nextChecklist }); notify({ type: 'success', message: `${manifest.packageReference} prepared and downloaded.` }); setDraft(saved);
  };
  const complete = () => {
    if (!company || draft.status !== 'Export Ready') return;
    if (!draft.handoffRecipient?.trim() || !draft.acknowledgement?.trim()) return notify({ type: 'error', message: 'Record the handoff recipient and acknowledgement before deactivation.' });
    if (!window.confirm(`Deactivate ${company.companyCode}? Historical and audit records will be retained.`)) return;
    const nextChecklist = (draft.checklist?.length ? draft.checklist : clone(checklist)).map(item => ['HANDOFF_APPROVAL', 'DELIVERY_ACK', 'DEACTIVATION'].includes(item.itemCode) ? { ...item, status: 'Complete' } : item);
    const result = deactivateCompany(company, { ...draft, checklist: nextChecklist }, 'Approver'); setDraft(result.lifecycle); notify({ type: 'success', message: `${company.companyCode} deactivated without deleting historical data.` }); onSaved?.();
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal lifecycle-modal offboarding-modal" role="dialog" aria-modal="true" aria-label="Company offboarding workflow"><header><div><small>Company lifecycle</small><h2>{draft.caseId ? `Offboarding ${company?.companyCode || ''}` : 'Start offboarding request'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header><div className="lifecycle-body"><section className="lifecycle-panel"><div className="lifecycle-heading"><span>Export and deactivation workflow</span><h3>Preserve history while handing off the company</h3><p>Offboarding moves through Requested → For Approval → Export Ready → Completed. It never deletes company, payroll or audit history.</p></div><div className="lifecycle-grid"><label>Company<span className="required">*</span><select value={draft.companyId} onChange={event => setCase({ companyId: event.target.value })} disabled={Boolean(draft.caseId)}><option value="">Choose active company</option>{companies.map(item => <option key={item.companyId} value={item.companyId}>{item.companyCode} — {item.legalName}</option>)}</select></label><label>Request date<span className="required">*</span><input type="date" value={String(draft.requestedAt || '').slice(0, 10)} onChange={event => setCase({ requestedAt: event.target.value })} disabled={Boolean(draft.caseId)} /></label><label className="wide">Handoff recipient<input value={draft.handoffRecipient || ''} onChange={event => setCase({ handoffRecipient: event.target.value })} placeholder="Receiving vendor or authorized recipient" /></label><label className="wide">Acknowledgement / notes<textarea value={draft.acknowledgement || ''} onChange={event => setCase({ acknowledgement: event.target.value })} placeholder="Record handoff notes or approval evidence" /></label></div><div className="lifecycle-subheading">Export scope<span className="required">*</span></div><div className="scope-checks">{['All Company Data', 'Payroll and YTD', 'Employee Masterfile', 'Configuration Snapshots', 'Company Documents', 'Audit Manifest'].map(scope => <label key={scope}><input type="checkbox" checked={draft.exportScope?.includes(scope)} onChange={() => setCase({ exportScope: draft.exportScope?.includes(scope) ? draft.exportScope.filter(item => item !== scope) : [...(draft.exportScope || []), scope] })} disabled={draft.status !== 'Requested'} />{scope}</label>)}</div><div className="readiness-summary"><span><strong className={`status-text ${lifecycleClass(draft.status)}`}>{draft.status}</strong><small>Case state</small></span><span><strong>{draft.packageReference || 'Not prepared'}</strong><small>Export package</small></span><span><strong>{draft.exportScope?.length || 0}</strong><small>Scope items</small></span></div><Checklist items={draft.checklist?.length ? draft.checklist : checklist} /><div className="lifecycle-warning"><Warning /><span>Open payrolls, approvals, remittances, billing and sync errors should be reviewed by the owning modules before export approval.</span></div></section></div><footer className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>Close</button><div className="lifecycle-footer-actions">{draft.status === 'Requested' && <button type="button" className="button primary" onClick={submitForApproval}>Submit for approval</button>}{draft.status === 'For Approval' && <button type="button" className="button primary" onClick={prepareExport}>Prepare export package <DownloadSimple /></button>}{draft.status === 'Export Ready' && <button type="button" className="button danger" onClick={complete}>Complete and deactivate</button>}</div></footer></section></div>;
}

function LifecycleWorkspace({ workspaceKey, onBack, notify }) {
  const onboarding = workspaceKey === 'onboarding';
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(null);
  const companies = readCompanies();
  const cases = readLifecycleCases();
  const rows = onboarding ? companies.map(company => ({ company, lifecycle: cases.find(item => item.type === 'ONBOARDING' && item.companyId === company.companyId) })).filter(item => item.company.lifecycleStatus !== 'Completed' || item.lifecycle?.status !== 'Completed') : cases.filter(item => item.type === 'OFFBOARDING').map(lifecycle => ({ company: companies.find(item => item.companyId === lifecycle.companyId), lifecycle })).filter(item => item.company);
  const refreshPage = () => setRefresh(value => value + 1);
  return <div className="page-content operational-workspace lifecycle-workspace" key={refresh}><button className="inline-back" onClick={onBack}><ArrowLeft /> Back</button><div className="page-heading"><div><p className="breadcrumb">Settings / Company Lifecycle</p><h1>{onboarding ? 'Company Onboarding' : 'Company Offboarding'}</h1><p className="page-description">{onboarding ? 'Create a draft company, complete readiness, validate startup/YTD data, and activate through an auditable workflow.' : 'Prepare a controlled export handoff and deactivate a company without deleting history.'}</p></div><span className="controlled-badge"><ShieldCheck /> Company-scoped lifecycle</span></div><div className="lifecycle-toolbar"><div className="lifecycle-toolbar-note"><strong>{rows.length}</strong><span>{onboarding ? `company ${plural(rows.length, 'record')} in scope` : `offboarding ${plural(rows.length, 'case')}`}</span></div><div className="toolbar-spacer" />{onboarding ? <button className="button primary" onClick={() => setEditing({ company: null, lifecycle: null })}><Plus /> Add New Company</button> : <button className="button primary" onClick={() => setEditing({ company: null, lifecycle: null })}><Plus /> Start offboarding</button>}<button className="button secondary" onClick={() => { const events = readAuditEvents(); downloadFile(`${onboarding ? 'onboarding' : 'offboarding'}-audit.csv`, ['Event ID,Company ID,Action,Timestamp,Summary', ...events.filter(event => onboarding ? event.action.includes('Onboarding') : event.action.includes('Offboarding') || event.action.includes('Deactivated')).map(event => [event.eventId, event.companyId, event.action, event.timestamp, event.summary].map(value => `"${String(value || '').replaceAll('"', '""')}"`).join(','))].join('\n'), 'text/csv'); notify({ type: 'success', message: 'Lifecycle audit export prepared.' }); }}><FileCsv /> Export audit</button></div><div className="table-card lifecycle-table-card"><table><thead><tr>{onboarding ? <><th>Company Code</th><th>Legal Name</th><th>Lifecycle Status</th><th>Readiness</th><th>Startup / YTD</th><th>Action</th></> : <><th>Request</th><th>Company</th><th>Export Scope</th><th>Status</th><th>Package</th><th>Action</th></>}</tr></thead><tbody>{rows.length ? rows.map(({ company, lifecycle }) => { const readiness = companyReadiness(company, lifecycle, readImportBatches(company.companyId)); return <tr key={lifecycle?.caseId || company.companyId}>{onboarding ? <><td><code>{company.companyCode}</code></td><td><strong>{company.legalName}</strong><small>{company.industry}</small></td><td><span className={`status-pill ${lifecycleClass(lifecycle?.status || company.lifecycleStatus)}`}>{lifecycle?.status || company.lifecycleStatus}</span></td><td><strong>{readiness.checklist.filter(item => item.status === 'Complete').length}/{readiness.checklist.length}</strong><small>{readiness.blockers.length ? `${readiness.blockers.length} blocker${readiness.blockers.length === 1 ? '' : 's'}` : 'Ready to review'}</small></td><td>{readiness.latestImport ? <span className={`status-pill ${readiness.latestImport.status.toLowerCase()}`}>{readiness.latestImport.status}</span> : <span className="status-pill pending">Pending</span>}</td><td><div className="row-actions always"><button onClick={() => setEditing({ company, lifecycle })} aria-label={`Open ${company.companyCode}`}><Eye /></button></div></td></> : <><td><code>{lifecycle.caseId}</code><small>{String(lifecycle.requestedAt || '').slice(0, 10)}</small></td><td><strong>{company.companyCode}</strong><small>{company.legalName}</small></td><td>{lifecycle.exportScope?.length || 0} scope item{lifecycle.exportScope?.length === 1 ? '' : 's'}</td><td><span className={`status-pill ${lifecycleClass(lifecycle.status)}`}>{lifecycle.status}</span></td><td>{lifecycle.packageReference || 'Not prepared'}</td><td><div className="row-actions always"><button onClick={() => setEditing({ company, lifecycle })} aria-label={`Open ${lifecycle.caseId}`}><Eye /></button></div></td></>}</tr>; }) : <tr><td colSpan="6"><div className="empty-state"><ShieldCheck /><h3>{onboarding ? 'No company onboarding records' : 'No offboarding requests'}</h3><p>{onboarding ? 'Start with Add New Company to create a draft company and onboarding case.' : 'Offboarding cases appear here after an authorized administrator starts a request.'}</p></div></td></tr>}</tbody></table></div>{editing && (onboarding ? <OnboardingWizard company={editing.company} lifecycle={editing.lifecycle} onClose={() => setEditing(null)} onSaved={refreshPage} notify={notify} /> : <OffboardingModal caseRecord={editing.lifecycle} onClose={() => setEditing(null)} onSaved={refreshPage} notify={notify} />)}</div>;
}

function AuditLogWorkspace({ onBack, notify }) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('This company');
  const company = readActiveCompany();
  const events = readAuditEvents(scope === 'This company' ? readActiveCompanyId() : '');
  const visible = useMemo(() => events.filter(event => [event.eventId, event.actor, event.action, event.entityType, event.entityId, event.summary].join(' ').toLowerCase().includes(query.toLowerCase())), [events, query]);
  const exportEvents = () => {
    downloadFile('audit-log.csv', ['Event ID,Timestamp,Actor,Action,Entity Type,Entity ID,Company,Summary', ...visible.map(event => [event.eventId, event.timestamp, event.actor, event.action, event.entityType, event.entityId, event.companyId, event.summary].map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))].join('\n'), 'text/csv');
    notify({ type: 'success', message: `${visible.length} audit events exported.` });
  };
  return <div className="page-content operational-workspace"><button className="inline-back" onClick={onBack}><ArrowLeft /> Back</button><div className="page-heading"><div><p className="breadcrumb">Atlas / Audit Log</p><h1>Audit Log</h1><p className="page-description">Chronological sign-in, configuration and transaction events emitted by every Atlas module. Entries are append-only and cannot be edited or deleted.</p></div><span className="controlled-badge"><ShieldCheck /> Append-only audit service</span></div>
    <div className="config-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search actor, module, event or record..." /><MagnifyingGlass /></div><label className="toolbar-select">Scope<select value={scope} onChange={event => setScope(event.target.value)}><option>This company</option><option>All companies</option></select></label><div className="toolbar-spacer" /><button className="button secondary" onClick={exportEvents}><FileCsv /> Export</button></div>
    <div className="table-card"><table><thead><tr><th>Event ID</th><th>Date and time</th><th>User</th><th>Module / feature</th><th>Record</th><th>Details</th></tr></thead><tbody>{visible.map(event => <tr key={event.eventId}><td><code>{event.eventId}</code></td><td>{String(event.timestamp || '').replace('T', ' ').slice(0, 19)}</td><td>{event.actor || '—'}</td><td>{event.entityType || '—'}<small>{event.action}</small></td><td>{event.entityId || '—'}</td><td>{event.summary || '—'}</td></tr>)}</tbody></table>{!visible.length && <div className="empty-state"><Eye /><h3>No audit events yet</h3><p>Events appear here as soon as a module saves a company, rule, calendar, grant, ticket, report or lifecycle change.</p></div>}</div>
    <div className="pagination"><span>Displaying <strong>{visible.length}</strong> of {events.length} events{scope === 'This company' && company ? ` for ${company.companyCode}` : ''}</span><span>1 of 1</span></div></div>;
}

const delegatedWorkspaces = {
  // Payroll Processing is the payroll transaction itself, not a record table:
  // it computes, reviews, approves, posts and locks a run, so it owns its own
  // screen rather than an entry in `operationalDefinitions`.
  transactions: ({ onBack, notify, companyId }) => <PayrollProcessingWorkspace key={companyId} companyId={companyId} onBack={onBack} notify={notify} readRegister={readRegisterRows} />,
  security: ({ onBack, notify, companyId }) => <SecurityWorkspace key={companyId} companyId={companyId} onBack={onBack} notify={notify} />,
  accessRights: ({ onBack, notify, companyId }) => <AccessRightsWorkspace key={companyId} companyId={companyId} onBack={onBack} notify={notify} />,
  calendar: ({ onBack, notify, companyId }) => <CalendarWorkspace key={companyId} companyId={companyId} onBack={onBack} notify={notify} />,
  overtime: ({ onBack, notify }) => <OvertimeGateway onBack={onBack} notify={notify} />,
  reports: ({ onBack, notify }) => <EnhancedReportShellWorkspace onBack={onBack} notify={notify} />,
  ticketing: ({ onBack, notify }) => <TicketingWorkspace onBack={onBack} notify={notify} />,
  audit: ({ onBack, notify }) => <AuditLogWorkspace onBack={onBack} notify={notify} />,
  employeeOnboarding: ({ onBack, notify }) => <EmployeeOnboardingWorkspace onBack={onBack} notify={notify} />,
  timeCorrections: ({ onBack, notify, companyId, company }) => <TimeCorrectionWorkspace onBack={onBack} notify={notify} companyId={companyId} company={company} />,
  chargeCodes: ({ onBack, notify }) => <ChargeCodesWorkspace onBack={onBack} notify={notify} />,
  happiness: ({ onBack, notify }) => <HappinessWorkspace onBack={onBack} notify={notify} />,
  wellness: ({ onBack, notify }) => <WellnessWorkspace onBack={onBack} notify={notify} />,
  notifications: ({ onBack, notify }) => <NotificationsWorkspace onBack={onBack} notify={notify} />,
  navigation: ({ onBack, notify }) => <SettingsConfigurationWorkspace kind="navigation" onBack={onBack} notify={notify} />,
  faq: ({ onBack, notify }) => <SettingsConfigurationWorkspace kind="faq" onBack={onBack} notify={notify} />,
  tickets: ({ onBack, notify }) => <SettingsConfigurationWorkspace kind="tickets" onBack={onBack} notify={notify} />,
  onboarding: ({ onBack, notify }) => <LifecycleWorkspace workspaceKey="onboarding" onBack={onBack} notify={notify} />,
  offboarding: ({ onBack, notify }) => <LifecycleWorkspace workspaceKey="offboarding" onBack={onBack} notify={notify} />,
};

function UnknownWorkspace({ workspaceKey, onBack }) {
  return <div className="page-content operational-workspace"><button className="inline-back" onClick={onBack}><ArrowLeft /> Back</button><div className="empty-state"><Warning /><h3>This workspace is not configured</h3><p>No Atlas module is registered for “{workspaceKey}”. Return to the hub and choose an available module.</p></div></div>;
}

/**
 * Dispatcher only — it must not own hooks, because the record workspace below
 * declares its own and switching between a delegated and a record workspace
 * would otherwise change the hook count on a mounted component.
 */
export function OperationalWorkspace({ workspaceKey, onBack, notify, companyId, company }) {
  const delegate = delegatedWorkspaces[workspaceKey];
  if (delegate) return delegate({ onBack, notify, companyId, company });
  const definition = operationalDefinitions[workspaceKey];
  if (!definition) return <UnknownWorkspace workspaceKey={workspaceKey} onBack={onBack} />;
  return <RecordWorkspace key={`${workspaceKey}:${companyId}`} workspaceKey={workspaceKey} definition={definition} onBack={onBack} notify={notify} companyId={companyId} />;
}

function RecordWorkspace({ workspaceKey, definition, onBack, notify, companyId }) {
  const storageKey = operationalStorageKey(workspaceKey, definition.version || 1);
  const seedRows = () => definition.rows.map((row, index) => recordFromRow(definition, row, index, companyId));
  const [rows, setRows] = useState(() => {
    const saved = readOperationalRowsForCompany(workspaceKey, companyId, globalThis.localStorage, [definition.version || 1]);
    if (!saved.length) return seedRows();
    const empty = Object.fromEntries(definition.fields.map(field => [field.key, '']));
    return saved.map(row => ({ ...empty, ...row, companyId }));
  });
  const [query, setQuery] = useState('');
  const [statusTab, setStatusTab] = useState('All');
  const [editing, setEditing] = useState(undefined);
  const [viewing, setViewing] = useState(null);
  const uploadRef = useRef(null);
  useEffect(() => { writeOperationalRowsForCompany(storageKey, companyId, rows); }, [rows, storageKey, companyId]);
  const visible = useMemo(() => rows
    .filter(row => statusTab === 'All' || row.status === statusTab)
    .filter(row => Object.values(row).join(' ').toLowerCase().includes(query.toLowerCase())), [rows, query, statusTab]);
  const emitAudit = (action, record, summary) => appendAuditEvent({ companyId, actor: 'Client Admin', action, entityType: definition.title, entityId: record.code, summary });

  const save = draft => {
    const existing = rows.find(row => row.id === draft.id);
    if (workspaceKey === 'remittance' && !postedPayrollOptions().includes(draft.linkedPayout)) return notify({ type: 'error', message: 'Choose a posted or locked payroll payout before saving the remittance.' });
    if (workspaceKey === 'journal' && !postedPayrollOptions().includes(draft.linkedPayout)) return notify({ type: 'error', message: 'A journal entry must be generated from a posted or locked payroll payout.' });
    if (workspaceKey === 'journal' && Number(draft.debit) !== Number(draft.credit)) return notify({ type: 'error', message: 'Journal debit and credit totals must balance.' });
    if (workspaceKey === 'payCodes' && (!draft.debitGl || !draft.creditGl)) return notify({ type: 'error', message: 'Both debit and credit GL accounts are required for a payroll pay code.' });
    // An effectivity window that closes before it opens would silently pay or
    // collect nothing, so it is rejected rather than stored.
    const window = { earnings: ['periodStart', 'endDate'], deductions: ['startDate', 'endDate'], mweRates: ['effectiveDate', ''] }[workspaceKey];
    if (window && draft[window[1]] && draft[window[0]] && String(draft[window[1]]) < String(draft[window[0]])) return notify({ type: 'error', message: 'The end date cannot fall before the start date.' });
    if (['earnings', 'bonuses'].includes(workspaceKey) && Number(draft.amount) <= 0) return notify({ type: 'error', message: 'Enter an amount greater than zero.' });
    if (workspaceKey === 'deductions' && Number(draft.amount) <= 0) return notify({ type: 'error', message: 'Enter a deduction amount greater than zero.' });
    if (workspaceKey === 'deductions' && Number(draft.balance) < 0) return notify({ type: 'error', message: 'An outstanding balance cannot be negative — a deduction stops once the balance clears.' });
    if (workspaceKey === 'mweRates' && Number(draft.dailyRate) <= 0) return notify({ type: 'error', message: 'Enter a minimum wage daily rate greater than zero.' });
    // One region, sector and municipality can only have one rate in force, or
    // payroll would have two minimum wages to choose between for the same day.
    if (workspaceKey === 'mweRates' && draft.status === 'Active' && rows.some(row => row.id !== draft.id && row.status === 'Active' && row.region === draft.region && row.sector === draft.sector && row.municipality === draft.municipality)) return notify({ type: 'error', message: `${draft.municipality} already has an active ${draft.sector} rate. Set the superseded row to Inactive first.` });
    if (rows.some(row => row.id !== draft.id && row.code === draft.code)) return notify({ type: 'error', message: `${draft.code} already exists.` });

    let prepared = { ...draft };
    if (workspaceKey === 'billing') {
      if (['Headcount', 'Bracket'].includes(prepared.basis) && Number(prepared.quantity) > 0 && Number(prepared.unitRate) > 0) prepared.amount = String(Number(prepared.quantity) * Number(prepared.unitRate));
      if (prepared.basis === 'Percentage' && Number(prepared.baseAmount) > 0 && Number(prepared.percentageRate) > 0) prepared.amount = String(Number(prepared.baseAmount) * Number(prepared.percentageRate) / 100);
      if (Number(prepared.amount) <= 0) return notify({ type: 'error', message: 'Enter the billing values needed to calculate a positive amount.' });
    }

    setRows(previous => {
      let next = previous;
      if (workspaceKey === 'payslip' && prepared.status === 'Active') next = next.map(row => row.id === prepared.id ? row : { ...row, status: 'Inactive' });
      return prepared.id ? next.map(row => row.id === prepared.id ? prepared : row) : [{ ...prepared, id: Date.now() }, ...next];
    });
    emitAudit(prepared.id ? 'RecordUpdated' : 'RecordCreated', prepared, `${prepared.code} saved in ${definition.title}.`);
    setEditing(undefined);
    notify({ type: 'success', message: workspaceKey === 'billing' ? `${prepared.code} saved with a calculated amount of PHP ${Number(prepared.amount).toLocaleString()}.` : `${definition.title} record saved.` });
  };

  const workflowAction = record => {
    const maps = {
      billing: { Draft: ['For Review', 'Submit for review'], 'For Review': ['Approved', 'Approve bill'], Approved: ['Generated', 'Generate bill'] },
      journal: { Balanced: ['Posted', 'Post journal'] },
    };
    const transition = maps[workspaceKey]?.[record.status];
    if (!transition) return null;
    return { status: transition[0], label: transition[1] };
  };

  const advanceWorkflow = record => {
    const action = workflowAction(record);
    if (!action) return;
    const updated = { ...record, status: action.status };
    if (workspaceKey === 'billing') updated.reviewStage = action.status === 'For Review' ? 'Checker' : 'Reviewer';
    setRows(previous => previous.map(row => row.id === record.id ? updated : row));
    emitAudit('WorkflowAdvanced', updated, `${record.code} moved to ${action.status}.`);
    notify({ type: 'success', message: `${record.code} moved to ${action.status}.` });
  };

  const removeRecord = record => {
    if (['Posted', 'Generated'].includes(record.status)) return notify({ type: 'error', message: `${record.code} is ${record.status.toLowerCase()} and must be retained.` });
    setRows(previous => previous.filter(item => item.id !== record.id));
    emitAudit('RecordDeleted', record, `${record.code} removed from ${definition.title}.`);
    notify({ type: 'success', message: `${record.code} deleted.` });
  };

  const exportRows = () => {
    const csv = [definition.fields.map(field => `"${field.label}"`).join(','), ...visible.map(row => definition.fields.map(field => `"${String(row[field.key] || '').replaceAll('"', '""')}"`).join(','))].join('\n');
    downloadFile(`${workspaceKey}.csv`, csv, 'text/csv');
    notify({ type: 'success', message: `${definition.title} export prepared.` });
  };
  const downloadTemplate = () => {
    const csv = `${definition.fields.map(field => `"${field.label}"`).join(',')}\n${definition.fields.map(() => '').join(',')}\n`;
    downloadFile(`${workspaceKey}-upload-template.csv`, csv, 'text/csv');
    notify({ type: 'success', message: `${definition.title} upload template downloaded.` });
  };
  const importRows = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      const headers = (lines.shift() || '').split(',').map(value => value.replaceAll('"', '').trim().toLowerCase());
      const missingHeaders = definition.fields.filter(field => field.required).filter(field => !headers.includes(field.key.toLowerCase()) && !headers.includes(field.label.toLowerCase()));
      if (missingHeaders.length) return notify({ type: 'error', message: `Missing required columns: ${missingHeaders.map(field => field.label).join(', ')}.` });
      const imported = lines.map((line, index) => {
        const values = line.split(',').map(value => value.replace(/^"|"$/g, '').trim());
        const row = { id: Date.now() + index };
        definition.fields.forEach(field => { const position = headers.findIndex(header => header === field.key.toLowerCase() || header === field.label.toLowerCase()); if (position >= 0) row[field.key] = values[position]; });
        return row;
      }).filter(row => row.code && !rows.some(existing => existing.code === row.code));
      if (!imported.length) return notify({ type: 'error', message: 'No new valid records were found in the upload.' });
      setRows(previous => [...imported, ...previous]);
      imported.forEach(record => emitAudit('RecordsImported', record, `${record.code} imported into ${definition.title} for review.`));
      notify({ type: 'success', message: `${imported.length} ${plural(imported.length, 'record')} imported for review.` });
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return <div className="page-content operational-workspace">
    <button className="inline-back" onClick={onBack}><ArrowLeft /> Back</button>
    <div className="page-heading"><div><p className="breadcrumb">Atlas / {definition.title}</p><h1>{definition.title}</h1><p className="page-description">{definition.description}</p></div></div>
    {definition.statusTabs && <div className="record-status-tabs" role="tablist">{definition.statusTabs.map(tab => <button key={tab} role="tab" aria-selected={statusTab === tab} className={statusTab === tab ? 'selected' : ''} onClick={() => setStatusTab(tab)}>{tab}<span>{tab === 'All' ? rows.length : rows.filter(row => row.status === tab).length}</span></button>)}</div>}
    <div className="config-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${definition.title.toLowerCase()}...`} /><MagnifyingGlass /></div><div className="toolbar-spacer" /><button className="button primary" onClick={() => setEditing(null)}><Plus /> Add</button><button className="button secondary" onClick={downloadTemplate}><FileCsv /> Template</button><button className="button secondary" onClick={() => uploadRef.current?.click()}><UploadSimple /> Upload</button><input className="sr-only" ref={uploadRef} type="file" accept=".csv" onChange={importRows} /><button className="button secondary" onClick={exportRows}><DownloadSimple /> Export</button></div>
    <div className="table-card"><table><thead><tr>{definition.fields.slice(0, 6).map(field => <th key={field.key}>{field.label}</th>)}<th>Action</th></tr></thead><tbody>{visible.map(row => {
      const workflow = workflowAction(row);
      return <tr key={row.id}>{definition.fields.slice(0, 6).map(field => <td key={field.key}>{row[field.key] || '—'}</td>)}<td><div className="row-actions always">{workflow && <button onClick={() => advanceWorkflow(row)} aria-label={workflow.label} title={workflow.label}><CheckCircle /></button>}<button onClick={() => setViewing(row)} aria-label="View"><Eye /></button><button onClick={() => setEditing(row)} aria-label="Edit"><PencilSimple /></button><button disabled={['Posted', 'Generated'].includes(row.status)} onClick={() => removeRecord(row)} aria-label="Delete"><Trash /></button></div></td></tr>;
    })}</tbody></table>{!visible.length && <div className="empty-state"><h3>No records found</h3><p>Add a record or adjust the search.</p></div>}</div>
    <div className="pagination"><span>Displaying <strong>{visible.length}</strong> of {rows.length} {plural(rows.length, 'record')}</span><span>1 of 1</span></div>
    {editing !== undefined && <EntryModal definition={definition} record={editing || null} onClose={() => setEditing(undefined)} onSave={save} />}
    {viewing && <div className="drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setViewing(null); }}><aside className="record-drawer"><header><div><p>Record details</p><h2>{viewing.code}</h2></div><button className="icon-button" onClick={() => setViewing(null)}><X /></button></header><div className="record-drawer-body"><section><h3>{definition.title}</h3><div className="detail-grid">{definition.fields.map(field => <div key={field.key}><strong>{field.label}</strong><span>{viewing[field.key] || '—'}</span></div>)}</div></section></div><footer><button className="button secondary" onClick={() => setViewing(null)}>Close</button><button className="button primary" onClick={() => { setEditing(viewing); setViewing(null); }}><PencilSimple /> Edit</button></footer></aside></div>}
  </div>;
}
