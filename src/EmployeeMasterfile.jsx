import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CaretDown,
  CaretUp,
  Check,
  CheckCircle,
  Clock,
  Cube,
  DotsThreeVertical,
  DownloadSimple,
  FileCsv,
  Gear,
  House,
  IdentificationCard,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  PuzzlePiece,
  SignOut,
  ShieldCheck,
  Sparkle,
  Trash,
  UploadSimple,
  Warning,
  ArrowRight,
  UserCircle,
  Users,
  X,
} from '@phosphor-icons/react';
import {
  AccountSettings,
  Benefits,
  Contacts,
  EmployeeDirectory,
  EmployeeRecord,
  PersonalDetails,
  TimeOff,
} from './EmployeeMasterfileModules';
import { RoleSwitch } from './RoleContext';
import { appendAuditEvent } from './companyRepository';
import { chargeCodeNames, chargeCodeTypes } from './chargeCodeService';
import { referenceValues } from './ReferenceTables';
import { deMinimisSplit } from './statutoryService';
import { BrandRail, Topbar } from './AppChrome';

const today = '2026-01-01';

const sectionDefinitions = [
  {
    key: 'basicPay', title: 'Basic Pay', upload: true,
    columns: [['effectiveDate', 'Effective Date'], ['payType', 'Pay Type'], ['amount', 'Entered Rate'], ['monthlyRate', 'Monthly Rate'], ['dailyRate', 'Daily Rate'], ['ecola', 'ECOLA']],
    fields: [
      ['dateCreated', 'Date Created', 'date'], ['effectiveDate', 'Effectivity Date', 'date'], ['payType', 'Pay Type', 'select', ['Monthly', 'Daily', 'Hourly']], ['amount', 'Entered Basic Pay Rate', 'number'], ['workDays', 'Work Days', 'number'], ['workDaysType', 'Work Days Type', 'select', ['Per Year', 'Per Month']], ['workHours', 'Work Hours per Day', 'number'], ['mwe', 'Minimum Wage Earner', 'boolean'], ['ecola', 'ECOLA Amount', 'number'], ['location', 'Minimum Wage Region / Location', 'select', () => referenceValues('work-locations'), draft => draft.mwe === 'Yes'], ['annualRate', 'Annual Rate', 'computed'], ['monthlyRate', 'Monthly Rate', 'computed'], ['dailyRate', 'Daily Rate', 'computed'], ['hourlyRate', 'Hourly Rate', 'computed'], ['minuteRate', 'Minute Rate', 'computed'], ['startMonth', 'Start Month', 'date'], ['startYear', 'Start Year', 'date'], ['periodStart', 'Period Start', 'select', ['Every Payroll', 'First Half', 'Second Half']], ['periodEnd', 'Period End', 'select', ['Every Payroll', 'First Half', 'Second Half']],
    ],
    rows: [
      { dateCreated: '01/01/2026', effectiveDate: '01/01/2026', payType: 'Monthly', amount: '50000', workDays: '261', workDaysType: 'Per Year', workHours: '8', mwe: 'No', ecola: '0', location: 'NCR', annualRate: '600000', monthlyRate: '50000', dailyRate: '2298.85' },
      { dateCreated: '01/01/2025', effectiveDate: '01/01/2025', payType: 'Daily', amount: '645', workDays: '313', workDaysType: 'Per Year', workHours: '8', mwe: 'Yes', ecola: '30', location: 'NCR', annualRate: '201885', monthlyRate: '16823.75', dailyRate: '645' },
    ],
  },
  {
    key: 'earnings', title: 'Earnings', upload: true,
    columns: [['dateCreated', 'Date Created'], ['code', 'Earning Code'], ['name', 'Earning Name'], ['amount', 'Earnings Amount'], ['classification', 'Classification'], ['nonTaxableAmount', 'Non-Taxable'], ['taxableAmount', 'Taxable']],
    fields: [['dateCreated', 'Date Created', 'date'], ['code', 'Earning Code'], ['name', 'Earning Name', 'select', () => referenceValues('earning-types')], ['amount', 'Earning Amount', 'number'], ['frequency', 'Payment Frequency', 'select', ['One-time', 'Weekly', 'Semi-monthly', 'Monthly']], ['taxability', 'Taxability', 'select', ['Taxable', 'Non-taxable']], ['classification', 'Classification', 'select', ['Regular', 'De Minimis', 'Reimbursement']], ['effectiveDate', 'Effectivity Date', 'date'], ['start', 'Start Month / Year', 'date'], ['end', 'End Month / Year', 'date'], ['periodStart', 'Period Start', 'select', ['Every Payroll', 'First Half', 'Second Half']], ['periodEnd', 'Period End', 'select', ['Every Payroll', 'First Half', 'Second Half']], ['holdDate', 'Hold Date', 'date'], ['remarks', 'Remarks', 'textarea']],
    rows: [
      { dateCreated: '01/01/2026', code: 'EXA-001', name: 'Salary', amount: '50000', frequency: 'Semi-monthly', taxability: 'Taxable', classification: 'Taxable' },
      { dateCreated: '01/01/2026', code: 'EXA-002', name: 'Lecture Fee', amount: '7500', frequency: 'One-time', taxability: 'Non-taxable', classification: 'Non-Taxable' },
      { dateCreated: '01/01/2026', code: 'EXA-003', name: 'Uniform and Clothing Allowance', amount: '3000', frequency: 'Monthly', taxability: 'Non-taxable', classification: 'De Minimis' },
      { dateCreated: '01/01/2026', code: 'EXA-004', name: 'Rice Subsidy', amount: '26000', frequency: 'Monthly', taxability: 'Non-taxable', classification: 'De Minimis' },
    ],
  },
  {
    key: 'bonuses', title: '13th Month Pay and Bonuses', upload: true,
    columns: [['name', 'Name'], ['type', 'Type'], ['taxability', 'Taxability'], ['amount', 'Amount'], ['nonTaxableAmount', 'Non-Taxable'], ['taxableAmount', 'Taxable'], ['remainingCeiling', 'Remaining Ceiling']],
    fields: [['name', 'Bonus Name'], ['type', 'Bonus Type', 'select', ['13th Month Pay', 'Performance Bonus', 'Signing Bonus', 'Other Bonus']], ['computationBasis', 'Computation Basis', 'select', ['Basic Pay', 'Basic Pay + Taxable Earnings', 'Eligible Earnings', 'Custom Policy Code']], ['employeeGroup', 'Eligible Employee Group'], ['hierarchyPriority', 'Bonus Hierarchy Priority', 'number'], ['releaseMonth', 'Release Month', 'select', ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']], ['taxability', 'Taxability', 'select', ['Taxable Bonus', 'Non-taxable Bonus']], ['amount', 'Manual / Override Amount', 'number'], ['transactionThreshold', 'Per Transaction Non-Taxable Threshold', 'number'], ['annualThreshold', 'Annual Non-Taxable Threshold', 'number'], ['source', 'Entry Source', 'select', ['Computed', 'Manual', 'Upload']], ['remarks', 'Remarks', 'textarea']],
    rows: [{ name: '13th Month Pay', type: '13th Month Pay', taxability: 'Taxable Bonus', amount: '50000' }, { name: 'Performance Bonus', type: 'Performance Bonus', taxability: 'Non-taxable Bonus', amount: '10000' }],
  },
  {
    key: 'statutory', title: 'Statutory Deductions and Shares', upload: true,
    columns: [['statutoryCode', 'Statutory Code'], ['frequency', 'Frequency'], ['effectiveDate', 'Effective Date'], ['employee', 'Employee Share'], ['employer', 'Employer Share']],
    fields: [['statutoryCode', 'Statutory Code', 'select', () => referenceValues('statutory-name', 'code')], ['frequency', 'Payment Frequency', 'select', ['Every Payroll', 'First Half', 'Second Half', 'Monthly']], ['effectiveDate', 'Effectivity Date', 'date'], ['startDate', 'Start Date', 'date'], ['endDate', 'End Date', 'date'], ['periodStart', 'Period Start', 'select', ['Every Payroll', 'First Half', 'Second Half']], ['periodEnd', 'Period End', 'select', ['Every Payroll', 'First Half', 'Second Half']], ['employee', 'Employee Contribution', 'number'], ['employer', 'Employer Contribution', 'number'], ['holdDate', 'Hold Date', 'date'], ['remarks', 'Remarks', 'textarea']],
    rows: [{ statutoryCode: 'SSS', frequency: 'Second Half', effectiveDate: '04/30/2026', employee: '2250', employer: '4950' }],
  },
  {
    key: 'deductions', title: 'Company Deductions', upload: false,
    columns: [['name', 'Deduction Name'], ['amount', 'Amount of Deduction'], ['startDate', 'Start Date'], ['endDate', 'End Date'], ['count', 'Number of Deductions'], ['total', 'Total Deduction'], ['balance', 'Balance'], ['scheduledDeduction', 'Scheduled This Payroll'], ['deductionStatus', 'Status']],
    fields: [['code', 'Deduction Code'], ['name', 'Deduction Name', 'select', () => referenceValues('deduction-types')], ['frequency', 'Payment Frequency', 'select', ['Every Payroll', 'First Half', 'Second Half', 'Monthly']], ['amount', 'Amount of Deduction', 'number'], ['effectiveDate', 'Effectivity Date', 'date'], ['startDate', 'Start Date', 'date'], ['endDate', 'End Date', 'date'], ['periodStart', 'Period Start', 'select', ['Every Payroll', 'First Half', 'Second Half']], ['periodEnd', 'Period End', 'select', ['Every Payroll', 'First Half', 'Second Half']], ['count', 'Number of Deductions', 'number'], ['total', 'Total Deduction Amount', 'number'], ['accumulated', 'Accumulated Amount', 'number'], ['balance', 'Total Balance', 'number'], ['holdDate', 'Hold Date', 'date'], ['remarks', 'Remarks', 'textarea']],
    rows: [{ name: 'Cooperative Dues', amount: '500', startDate: '01/01/2026', endDate: '12/31/2026', count: '24', total: '12000', accumulated: '3000', balance: '9000' }],
  },
  {
    key: 'loans', title: 'Loans', upload: true,
    columns: [['payItem', 'Pay Item'], ['frequency', 'Payment Frequency'], ['amount', 'Amount'], ['startDate', 'Start Date'], ['endDate', 'End Date'], ['balance', 'Balance'], ['scheduledDeduction', 'Scheduled This Payroll'], ['loanStatus', 'Loan Status']],
    fields: [['payItem', 'Loan Reference', 'select', () => referenceValues('loan-types')], ['frequency', 'Payment Frequency', 'select', ['Every Payroll', 'First Half', 'Second Half', 'Monthly']], ['amount', 'Amortization Amount', 'number'], ['startDate', 'Start Date', 'date'], ['endDate', 'End Date', 'date'], ['description', 'Description'], ['dateGranted', 'Date Granted', 'date'], ['reference', 'Reference Number'], ['principal', 'Principal', 'number'], ['interest', 'Interest Amount', 'number'], ['totalLoan', 'Total Loan', 'computed'], ['accumulatedManual', 'Accumulated Payment (Manual)', 'number'], ['accumulatedComputed', 'Accumulated Payment (Computed)', 'number'], ['balance', 'Balance', 'computed'], ['periodStart', 'Period Start', 'select', ['Every Payroll', 'First Half', 'Second Half']], ['periodEnd', 'Period End', 'select', ['Every Payroll', 'First Half', 'Second Half']], ['holdDate', 'Hold Date', 'date'], ['remarks', 'Remarks', 'textarea']],
    rows: [{ payItem: 'SSS Salary Loan', frequency: 'Monthly', amount: '2500', startDate: '01/01/2026', endDate: '12/31/2026', principal: '30000', interest: '1500', accumulatedComputed: '17500', accumulatedManual: '0' }, { payItem: 'Company Salary Loan', frequency: 'Monthly', amount: '1000', startDate: '01/01/2026', endDate: '06/30/2026', principal: '9500', interest: '500', accumulatedComputed: '9400', accumulatedManual: '0' }],
  },
  {
    key: 'hdmf', title: 'HDMF Contribution', upload: true,
    columns: [['effectiveDate', 'Effectivity Date'], ['holdDate', 'Hold Date'], ['employee', 'Employee Contribution'], ['employer', 'Employer Contribution']],
    fields: [['effectiveDate', 'Effectivity Date', 'date'], ['holdDate', 'Hold Date', 'date'], ['employee', 'Employee Contribution Amount', 'number'], ['employer', 'Employer Contribution Amount', 'number']],
    rows: [{ effectiveDate: '01/01/2026', holdDate: '01/01/2026', employee: '240', employer: '480' }],
  },
  {
    key: 'allowances', title: 'Variable Allowances', upload: true,
    columns: [['dateCreated', 'Date Created'], ['amount', 'Amount'], ['unitBasis', 'Unit Basis'], ['workDays', 'Work Days'], ['workDaysType', 'Work Days Type']],
    fields: [['dateCreated', 'Date Created', 'date'], ['code', 'Allowance Reference Code'], ['name', 'Allowance Name'], ['amount', 'Amount', 'number'], ['unitBasis', 'Unit Basis', 'select', ['Monthly', 'Daily', 'Hourly', 'Per Minute']], ['workDays', 'Work Days', 'number'], ['workDaysType', 'Work Days Type', 'select', ['Work Days per Year', 'Work Days per Month']], ['workHours', 'Work Hours per Day', 'number'], ['annualRate', 'Annual Rate', 'computed'], ['monthlyRate', 'Monthly Rate', 'computed'], ['dailyRate', 'Daily Rate', 'computed'], ['hourlyRate', 'Hourly Rate', 'computed'], ['minuteRate', 'Minute Rate', 'computed'], ['effectiveDate', 'Effectivity Date', 'date'], ['startMonth', 'Start Month', 'date'], ['startYear', 'Start Year', 'date'], ['periodStart', 'Period Start', 'select', ['Every Payroll', 'First Half', 'Second Half']], ['periodEnd', 'Period End', 'select', ['Every Payroll', 'First Half', 'Second Half']]],
    rows: [{ dateCreated: '01/01/2026', amount: '35000', unitBasis: 'Monthly', workDays: '261', workDaysType: 'Work Days per Year' }, { dateCreated: '01/01/2026', amount: '500', unitBasis: 'Daily', workDays: '313', workDaysType: 'Work Days per Year' }],
  },
  {
    key: 'ytd', title: 'Payroll Records (YTD)', upload: true,
    columns: [['year', 'Year'], ['grossPay', 'Gross Pay'], ['taxableIncome', 'Taxable Income'], ['taxWithheld', 'Tax Withheld'], ['netPay', 'Net Pay']],
    fields: [['year', 'Year', 'number'], ['grossPay', 'Gross Pay', 'number'], ['basicPay', 'Basic Pay', 'number'], ['taxableIncome', 'Taxable Income', 'number'], ['taxableBonus', 'Taxable Bonus', 'number'], ['nonTaxableBonus', 'Non-Taxable Bonus', 'number'], ['deMinimis', 'De Minimis', 'number'], ['otherTaxable', 'Other Taxable Earnings', 'number'], ['otherNonTaxable', 'Other Non-Taxable Earnings', 'number'], ['statutoryEmployee', 'Employee Statutory Contributions', 'number'], ['companyDeductions', 'Company Deductions', 'number'], ['loanPayments', 'Loan Payments', 'number'], ['taxWithheld', 'Tax Withheld', 'number'], ['netPay', 'Net Pay', 'number']],
    rows: [{ year: '2025', grossPay: '685000', taxableIncome: '612000', taxWithheld: '58500', netPay: '564400' }],
  },
  {
    key: 'previousEmployer', title: 'Previous Employer Data', upload: true,
    columns: [['employerName', 'Employer Name'], ['employerAddress', 'Employer Address'], ['tin', 'Taxpayer Identification No.'], ['startDate', 'Employment Start'], ['endDate', 'Employment End']],
    fields: [['hasPreviousBalance', 'Has Previous Employer Balance', 'boolean'], ['employerName', 'Employer Name'], ['employerAddress', 'Employer Address'], ['employmentYear', 'Employment Year', 'number'], ['tin', 'Taxpayer Identification No.'], ['supervisor', 'Supervisor Name'], ['contact', 'Employer Contact Details'], ['position', 'Position'], ['workDescription', 'Work Description', 'textarea'], ['reasonForLeaving', 'Reason for Leaving'], ['startDate', 'Date Hired', 'date'], ['endDate', 'Date Separated', 'date'], ['lastSalary', 'Last Salary', 'number'], ['taxType', 'Tax Type', 'select', ['Normal', 'Minimum Wage']], ['minimumWage', 'Is Minimum Wage', 'boolean'], ['basicPay', 'Basic Pay', 'number'], ['taxableBonus', 'Taxable Bonus', 'number'], ['otherTaxable', 'Other Taxable Income', 'number'], ['grossTaxable', 'Gross Taxable Income', 'number'], ['nonTaxableBonus', 'Non-Taxable Bonus', 'number'], ['deMinimis', 'De Minimis', 'number'], ['allowableDeductions', 'Allowable Deductions', 'number'], ['otherNonTaxable', 'Other Non-Taxable Income', 'number'], ['insurancePremium', 'Insurance Premium', 'number'], ['taxWithheld', 'Tax Withheld', 'number']],
    rows: [{ employerName: 'ABC Company', employerAddress: 'Manila, Philippines', tin: '123456789012', startDate: '01/01/2019', endDate: '12/31/2024', taxType: 'Normal', minimumWage: 'No' }],
  },
  {
    key: 'previousPayroll', title: 'Previous Payroll Data', upload: true,
    columns: [['taxType', 'Tax Type'], ['minimumWage', 'Is Minimum Wage'], ['nonTaxableBonus', 'Non-Taxable Bonus'], ['deMinimis', 'De Minimis'], ['allowableDeductions', 'Allowable Deductions']],
    fields: [['taxType', 'Tax Type', 'select', ['Normal', 'Minimum Wage']], ['minimumWage', 'Is Minimum Wage', 'boolean'], ['nonTaxableBonus', 'Non-Taxable Bonus', 'number'], ['deMinimis', 'De Minimis', 'number'], ['allowableDeductions', 'Allowable Deductions', 'number'], ['otherNonTaxable', 'Other Non-Taxable Income', 'number'], ['basicPay', 'Basic Pay', 'number'], ['taxableBonus', 'Taxable Bonus', 'number'], ['otherTaxable', 'Other Taxable Income', 'number'], ['grossTaxable', 'Gross Taxable Income', 'number'], ['insurancePremium', 'Insurance Premium', 'number'], ['taxWithheld', 'Tax Withheld', 'number']],
    rows: [{ taxType: 'Normal', minimumWage: 'Yes', nonTaxableBonus: '90000', deMinimis: '18000', allowableDeductions: '25000', basicPay: '450000', taxableBonus: '35000', taxWithheld: '49000' }],
  },
  {
    key: 'payrollEntry', title: 'Payroll Entry Related Information', upload: true,
    columns: [['companyCode', 'Company Code'], ['subAccount', 'Local sub-account'], ['project', 'Business / Activity'], ['costLevel', 'Cost Level'], ['intercompany', 'Intercompany']],
    fields: [['companyCode', 'Company Code'], ['subAccount', 'Local sub-account'], ['costLevel', 'Cost Level', 'select', ['Company', 'Department', 'Project']], ['intercompany', 'Intercompany'], ['project', 'Project', 'select', ['Payroll Operations', 'Client Services']], ['statutoryCode', 'Statutory Code'], ['reserved', 'Reserved', 'boolean'], ['management', 'Management', 'select', ['Operations', 'Corporate']], ['costAllocation', 'Cost allocation', 'select', ['Default allocation', 'Custom allocation']]],
    rows: [{ companyCode: 'COMP00123', subAccount: 'Payroll Services', project: 'Payroll Operations', costLevel: 'Company', intercompany: 'No', statutoryCode: 'STAT-001', reserved: 'No' }],
  },
  {
    key: 'costAllocation', title: 'Cost Allocation', upload: true,
    columns: [['type', 'Type'], ['name', 'Name'], ['percentage', 'Percentage']],
    fields: [['type', 'Type', 'select', chargeCodeTypes], ['name', 'Name', 'select', draft => chargeCodeNames(draft.type)], ['percentage', 'Percentage (all rows must total 100%)', 'number']],
    rows: [{ type: 'Department', name: 'Marketing', percentage: '35' }, { type: 'Job Title', name: 'Payroll Specialist', percentage: '20' }, { type: 'Site', name: 'Makati', percentage: '45' }],
  },
  {
    key: 'bankInformation', title: 'Bank Information', upload: true,
    columns: [['bank', 'Bank Name'], ['accountNumber', 'Account Number'], ['accountType', 'Account Type'], ['companyCode', 'Company Code'], ['defaultBank', 'Default']],
    fields: [['bankReference', 'Bank Reference Code'], ['bank', 'Bank Name', 'select', () => referenceValues('banks')], ['accountNumber', 'Account Number'], ['branchName', 'Branch Name'], ['branchLocation', 'Branch Location'], ['accountType', 'Account Type', 'select', ['Savings', 'Checking', 'Payroll']], ['rate', 'Bank Rate', 'number'], ['companyCode', 'Bank Company Code'], ['swiftCode', 'Swift Code'], ['defaultBank', 'Set as Default Bank', 'boolean']],
    rows: [{ bankReference: 'BNK-001', bank: 'BDO Unibank', accountNumber: '0000000000', accountType: 'Payroll', companyCode: 'ABC-PAY', defaultBank: 'Yes' }],
  },
  {
    key: 'allotment', title: 'Allotment Information', upload: true,
    columns: [['name', 'Allottee Name'], ['relationship', 'Relationship to Allottee'], ['percentage', 'Percentage of Net Pay'], ['amount', 'Specified Amount'], ['bank', 'Bank Name']],
    fields: [['name', 'Allottee Name'], ['relationship', 'Relationship to the Allottee', 'select', () => referenceValues('relationships')], ['amount', 'Disbursement Amount', 'number'], ['percentage', 'Percentage of Net Pay', 'number'], ['bank', 'Bank Name', 'select', () => referenceValues('banks')], ['accountNumber', 'Account Number'], ['branchName', 'Branch Name'], ['branchLocation', 'Branch Location'], ['accountType', 'Account Type', 'select', ['Savings', 'Checking']], ['swiftCode', 'Swift Code'], ['defaultBank', 'Set as default bank', 'boolean']],
    rows: [{ name: 'Jane Doe', relationship: 'Spouse', percentage: '5', amount: '0', bank: 'BDO Unibank', accountNumber: '0000000000' }],
  },
];

const employees = [
  { id: '0000112345', employeeCode: '0000112345', firstName: 'John', middleName: 'Michael', lastName: 'Doe', name: 'John Michael Doe', role: 'Payroll Specialist', status: 'Full-time', origin: 'Philippines', hireDate: '2024-05-30', location: 'PBS | Makati', initials: 'JD' },
  { id: '0000112451', employeeCode: '0000112451', firstName: 'Jane', middleName: 'Collins', lastName: 'Doe', name: 'Jane Collins Doe', role: 'Payroll Analyst', status: 'Full-time', origin: 'Philippines', hireDate: '2025-01-12', location: 'PBS | Makati', initials: 'JC' },
  { id: '0000112608', employeeCode: '0000112608', firstName: 'Jandee', middleName: 'Robins', lastName: 'Fisher', name: 'Jandee Robins Fisher', role: 'Team Lead', status: 'Full-time', origin: 'Philippines', hireDate: '2023-03-14', location: 'PBS | Manila', initials: 'JF' },
];

function formatCell(key, value) {
  if (['scheduledDeduction', 'nonTaxableAmount', 'taxableAmount', 'remainingCeiling'].includes(key)) return value === '' || value === undefined || value === null ? '—' : `₱ ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  if (['amount', 'total', 'balance', 'principal', 'grossPay', 'taxableIncome', 'taxWithheld', 'netPay', 'employee', 'employer', 'basicPay', 'taxableBonus', 'nonTaxableBonus', 'deMinimis', 'allowableDeductions', 'annualRate', 'monthlyRate', 'dailyRate', 'hourlyRate', 'minuteRate', 'ecola'].includes(key)) return `₱ ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  if (key === 'percentage') return `${value}%`;
  return value || '—';
}

function download(filename, content, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
}


function EmployeeSidebar({ onBack, module, setModule, closeDetail }) {
  return <aside className="company-sidebar employee-sidebar"><button className="back-link" onClick={onBack}>← Back to Core</button><h2>Employee<br />Masterfile</h2><nav><button className={`side-link ${module === 'employees' ? 'selected' : ''}`} onClick={() => { setModule('employees'); closeDetail(); }}><UserCircle weight={module === 'employees' ? 'fill' : 'regular'} /> Employee Information</button><button className={`side-link ${module === 'accounts' ? 'selected' : ''}`} onClick={() => setModule('accounts')}><IdentificationCard weight={module === 'accounts' ? 'fill' : 'regular'} /> Account Settings Information</button></nav></aside>;
}

function InputField({ field, value, onChange, draft = {} }) {
  const [key, label, type = 'text', options = []] = field;
  // Options may be a function so a field can be sourced from another module's
  // register (cost allocation reads the company charge codes, for example).
  const sourced = typeof options === 'function' ? options(draft) : options;
  // Keep a stored value selectable even if the reference row was retired or the
  // record came from an upload, so editing a row never silently clears it.
  const choices = value && !sourced.includes(value) ? [...sourced, value] : sourced;
  if (type === 'computed') return <input value={value ?? ''} readOnly aria-label={`${label} (computed)`} />;
  if (type === 'select') return <select value={value ?? ''} onChange={e => onChange(e.target.value)} required><option value="">{choices.length ? 'Please select' : 'No active reference values'}</option>{choices.map(item => <option key={item}>{item}</option>)}</select>;
  if (type === 'boolean') return <div className="radio-group">{['Yes', 'No'].map(item => <label key={item}><input type="radio" name={key} checked={(value || 'No') === item} onChange={() => onChange(item)} /> {item}</label>)}</div>;
  if (type === 'textarea') return <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="Enter remarks" />;
  return <input type={type} min={type === 'number' ? '0' : undefined} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={type === 'number' ? '0.00' : `Input ${label.toLowerCase()}`} required />;
}

/** Employee payroll records mix MM/DD/YYYY seed values with ISO date inputs. */
function toIsoDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parts = text.split(/[/-]/);
  if (parts.length === 3 && parts[2].length === 4) return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  return '';
}

function normalizePayrollRecord(section, draft) {
  if (section.key === 'basicPay' || section.key === 'allowances') {
    const amount = Number(draft.amount || 0);
    const workDays = Math.max(1, Number(draft.workDays || 261));
    const workHours = Math.max(1, Number(draft.workHours || 8));
    let annualRate = 0; let monthlyRate = 0; let dailyRate = 0; let hourlyRate = 0;
    const basis = section.key === 'basicPay' ? draft.payType : draft.unitBasis;
    if (basis === 'Daily') { dailyRate = amount; annualRate = dailyRate * workDays; monthlyRate = annualRate / 12; hourlyRate = dailyRate / workHours; }
    else if (basis === 'Hourly') { hourlyRate = amount; dailyRate = hourlyRate * workHours; annualRate = dailyRate * workDays; monthlyRate = annualRate / 12; }
    else if (basis === 'Per Minute') { hourlyRate = amount * 60; dailyRate = hourlyRate * workHours; annualRate = dailyRate * workDays; monthlyRate = annualRate / 12; }
    else { monthlyRate = amount; annualRate = monthlyRate * 12; dailyRate = annualRate / workDays; hourlyRate = dailyRate / workHours; }
    return { ...draft, annualRate: annualRate.toFixed(2), monthlyRate: monthlyRate.toFixed(2), dailyRate: dailyRate.toFixed(2), hourlyRate: hourlyRate.toFixed(2), minuteRate: (hourlyRate / 60).toFixed(4) };
  }
  if (section.key === 'loans') {
    const totalLoan = Number(draft.principal || 0) + Number(draft.interest || 0);
    const accumulated = Number(draft.accumulatedManual || 0) + Number(draft.accumulatedComputed || 0);
    const balance = Math.max(0, totalLoan - accumulated);
    // Master requirements §5.6: a scheduled amortization may never collect more
    // than the remaining balance, so the last instalment is the balance itself.
    const scheduled = draft.holdDate ? 0 : Math.min(Number(draft.amount || 0), balance);
    return {
      ...draft,
      totalLoan: totalLoan.toFixed(2),
      balance: balance.toFixed(2),
      scheduledDeduction: scheduled.toFixed(2),
      loanStatus: balance <= 0 ? 'Fully paid' : draft.holdDate ? 'On hold' : scheduled < Number(draft.amount || 0) ? 'Final instalment' : 'Active',
    };
  }
  if (section.key === 'deductions') {
    // §6.2: a deduction terminates when the outstanding balance reaches zero or
    // the end date passes, so total and balance are derived rather than typed.
    const amount = Number(draft.amount || 0);
    const count = Number(draft.count || 0);
    const total = count > 0 ? amount * count : Number(draft.total || 0);
    const accumulated = Number(draft.accumulated || 0);
    const balance = Math.max(0, total - accumulated);
    const endIso = toIsoDate(draft.endDate);
    const ended = Boolean(endIso) && endIso < new Date().toISOString().slice(0, 10);
    const scheduled = draft.holdDate || ended ? 0 : Math.min(amount, total > 0 ? balance : amount);
    return {
      ...draft,
      total: total.toFixed(2),
      balance: balance.toFixed(2),
      scheduledDeduction: scheduled.toFixed(2),
      deductionStatus: total > 0 && balance <= 0 ? 'Terminated — balance settled' : ended ? 'Terminated — end date reached' : draft.holdDate ? 'On hold' : 'Active',
    };
  }
  return draft;
}

/**
 * Section-level recalculation for rules that depend on sibling rows or on YTD
 * utilisation rather than on a single record.
 *
 * §10.1 bonus non-taxable ceiling and §10.2 De Minimis ceilings are both
 * consumed in priority order across the whole set, so they cannot be resolved
 * one row at a time.
 */
function recalculateSection(section, rows, context = {}) {
  if (section.key === 'bonuses') {
    const ytdNonTaxable = Number(context.ytdNonTaxableBonus || 0);
    // §10.1: the ceiling is effective-dated configuration, read from the Bonus
    // Ceiling reference table rather than written into the calculation.
    const configuredCeiling = Number(referenceValues('bonus-ceilings', 'ceiling')[0] || 0);
    const ordered = [...rows].sort((a, b) => Number(a.hierarchyPriority || 99) - Number(b.hierarchyPriority || 99));
    let used = ytdNonTaxable;
    const resolved = new Map();
    ordered.forEach(row => {
      const amount = Number(row.amount || 0);
      const annualCeiling = Number(row.annualThreshold || 0) || configuredCeiling;
      const perTransaction = Number(row.transactionThreshold || 0);
      const remainingAnnual = annualCeiling > 0 ? Math.max(0, annualCeiling - used) : amount;
      const cap = perTransaction > 0 ? Math.min(remainingAnnual, perTransaction) : remainingAnnual;
      const nonTaxable = row.taxability === 'Taxable Bonus' ? 0 : Math.min(amount, Math.max(0, cap));
      used += nonTaxable;
      resolved.set(row.id, {
        nonTaxableAmount: nonTaxable.toFixed(2),
        taxableAmount: Math.max(0, amount - nonTaxable).toFixed(2),
        remainingCeiling: annualCeiling > 0 ? Math.max(0, annualCeiling - used).toFixed(2) : '',
        thresholdNote: annualCeiling > 0 && nonTaxable < amount && row.taxability !== 'Taxable Bonus' ? 'Ceiling exhausted — excess taxable' : '',
      });
    });
    return rows.map(row => ({ ...row, ...(resolved.get(row.id) || {}) }));
  }
  if (section.key === 'earnings') {
    // De Minimis rows consume their configured ceiling in entry order.
    const used = new Map();
    return rows.map(row => {
      if (row.classification !== 'De Minimis') return { ...row, nonTaxableAmount: '', taxableAmount: '', thresholdNote: '' };
      const key = row.name || row.code;
      const consumed = used.get(key) || 0;
      const split = deMinimisSplit(key, row.amount, consumed, row.effectiveDate);
      used.set(key, consumed + split.nonTaxable);
      return {
        ...row,
        nonTaxableAmount: split.nonTaxable.toFixed(2),
        taxableAmount: split.taxable.toFixed(2),
        thresholdNote: !split.rule ? 'No De Minimis ceiling configured' : split.taxable > 0 ? `Excess ${split.rule.excessTreatment.toLowerCase()}` : '',
      };
    });
  }
  return rows;
}

function EntryModal({ section, record, onClose, onSave }) {
  const [draft, setDraft] = useState({ dateCreated: today, ...record });
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="modal employee-entry-modal" role="dialog" aria-modal="true" aria-label={`${record?.id ? 'Edit' : 'Add'} ${section.title.replace('13th Month Pay and ', '')}`}><header><h2>{record?.id ? 'Edit' : 'Add'} {section.title.replace('13th Month Pay and ', '')}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header><form onSubmit={e => { e.preventDefault(); onSave(normalizePayrollRecord(section, draft)); }}><div className="employee-form-grid">{section.fields.filter(field => typeof field[4] !== 'function' || field[4](draft)).map(field => <label key={field[0]}>{field[1]} {field[2] !== 'computed' && <span className="required">*</span>}<InputField field={field} draft={draft} value={draft[field[0]]} onChange={value => setDraft(prev => ({ ...prev, [field[0]]: value }))} /></label>)}</div><footer className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{record?.id ? 'Save' : 'Add'}</button></footer></form></section></div>;
}

function ConfirmDelete({ name, onClose, onDelete }) {
  return <div className="modal-backdrop"><section className="modal delete-modal" role="dialog" aria-modal="true" aria-label="Delete entry"><header><h2>Delete entry</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header><div className="modal-body"><div className="delete-copy"><div className="delete-icon"><Trash /></div><div><h3>Delete “{name}”?</h3><p>This employee payroll entry will be removed.</p></div></div><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" onClick={onDelete}>Delete</button></div></div></section></div>;
}

function EmployeeSection({ section, rows, setRows, notify, initiallyOpen, onOpenBulk, context = {} }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const uploadRef = useRef(null);
  const save = draft => {
    let completionNote = '';
    if (section.key === 'bankInformation' && rows.some(row => row.id !== draft.id && row.accountNumber && row.accountNumber === draft.accountNumber)) {
      notify({ type: 'error', message: 'This bank account number is already registered for the employee.' }); return;
    }
    const nextRows = draft.id ? rows.map(row => row.id === draft.id ? draft : row) : [{ ...draft, id: Math.max(0, ...rows.map(row => row.id)) + 1 }, ...rows];
    if (section.key === 'costAllocation') {
      const totalPercentage = nextRows.reduce((total, row) => total + Number(row.percentage || 0), 0);
      if (totalPercentage > 100) { notify({ type: 'error', message: 'Cost allocation cannot exceed 100%.' }); return; }
      if (totalPercentage < 100) completionNote = ` ${100 - totalPercentage}% remains unallocated.`;
    }
    if (section.key === 'allotment' && nextRows.reduce((total, row) => total + Number(row.percentage || 0), 0) > 100) {
      notify({ type: 'error', message: 'Net-pay allotment percentages cannot exceed 100%.' }); return;
    }
    const recalculated = recalculateSection(section, nextRows, context);
    const thresholdNote = recalculated.find(row => row.id === draft.id)?.thresholdNote;
    setRows(recalculated);
    setEditing(null); notify({ type: 'success', message: `${section.title} entry ${draft.id ? 'updated' : 'added'} successfully.${completionNote}${thresholdNote ? ` ${thresholdNote}.` : ''}` });
  };
  const importRows = e => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      const headers = lines[0]?.split(',').map(value => value.replaceAll('"', '').trim().toLowerCase()) || [];
      const labels = Object.fromEntries(section.fields.map(field => [field[1].toLowerCase(), field[0]]));
      const added = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(value => value.replace(/^"|"$/g, '').trim()); const row = { id: Date.now() + index };
        headers.forEach((header, i) => { if (labels[header]) row[labels[header]] = values[i]; }); return normalizePayrollRecord(section, row);
      }).filter(row => Object.keys(row).length > 1);
      if (!added.length) notify({ type: 'error', message: `No matching ${section.title} rows were found.` });
      else if (section.key === 'costAllocation' && [...added, ...rows].reduce((total, row) => total + Number(row.percentage || 0), 0) > 100) notify({ type: 'error', message: 'Imported cost allocation would exceed 100%.' });
      else if (section.key === 'allotment' && [...added, ...rows].reduce((total, row) => total + Number(row.percentage || 0), 0) > 100) notify({ type: 'error', message: 'Imported net-pay allotments would exceed 100%.' });
      else if (section.key === 'bankInformation' && new Set([...added, ...rows].map(row => row.accountNumber).filter(Boolean)).size !== [...added, ...rows].map(row => row.accountNumber).filter(Boolean).length) notify({ type: 'error', message: 'The import contains a duplicate bank account number.' });
      else { setRows(recalculateSection(section, [...added, ...rows], context)); notify({ type: 'success', message: `${added.length} ${section.title} entries imported.` }); }
    };
    reader.readAsText(file); e.target.value = '';
  };
  return <section className="employee-data-section">
    <button className="employee-section-heading" onClick={() => setOpen(!open)}><span>{section.title}</span>{open ? <CaretUp /> : <CaretDown />}</button>
    {open && <div className="employee-section-body"><div className="employee-section-actions"><button className="button secondary" onClick={() => setEditing({})}><Plus /> Add entry</button>{section.upload && <button className="button secondary" onClick={() => onOpenBulk?.(section.key)}><UploadSimple /> Bulk Actions</button>}</div>
      <div className="employee-table-wrap"><table className="employee-table"><thead><tr>{section.columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Action</th></tr></thead><tbody>{rows.length ? rows.map(row => <tr key={row.id}>{section.columns.map(([key]) => <td key={key}>{formatCell(key, row[key])}</td>)}<td><div className="row-actions always"><button onClick={() => setEditing(row)} aria-label="Edit"><PencilSimple /></button><button onClick={() => setDeleting(row)} aria-label="Delete"><Trash /></button></div></td></tr>) : <tr><td colSpan={section.columns.length + 1}><div className="empty-state compact"><h3>No entries yet</h3><p>Add or upload this employee’s payroll data.</p></div></td></tr>}</tbody></table></div>
      <div className="employee-pagination"><span>Displaying <strong>{rows.length}</strong> item{rows.length === 1 ? '' : 's'}</span><span>1 of 1</span></div>
    </div>}
    {editing && <EntryModal section={section} record={editing.id ? editing : null} onClose={() => setEditing(null)} onSave={save} />}
    {deleting && <ConfirmDelete name={deleting.name || deleting.payItem || deleting.type || section.title} onClose={() => setDeleting(null)} onDelete={() => { setRows(rows.filter(row => row.id !== deleting.id)); setDeleting(null); notify({ type: 'success', message: `${section.title} entry deleted.` }); }} />}
  </section>;
}

function CustomExport({ sections, onClose, onExport }) {
  const [selected, setSelected] = useState([sections[0].key]); const [format, setFormat] = useState('csv');
  return <div className="modal-backdrop"><section className="modal custom-export-modal" role="dialog" aria-modal="true" aria-label="Custom Export"><header><h2>Custom Export</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header><div className="modal-body"><p className="form-intro">Choose which sections to export.</p><div className="export-checklist">{sections.map(section => <label key={section.key}><input type="checkbox" checked={selected.includes(section.key)} onChange={() => setSelected(prev => prev.includes(section.key) ? prev.filter(key => key !== section.key) : [...prev, section.key])} /> {section.title}</label>)}</div><label className="export-format">Export File Format<select value={format} onChange={e => setFormat(e.target.value)}><option value="csv">Excel / CSV</option><option value="word">Word</option><option value="pdf">PDF / Print</option></select></label><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!selected.length} onClick={() => onExport(selected, format)}>Export</button></div></div></section></div>;
}

function exportEmployeeData(data, selectedKeys, format) {
  const selected = sectionDefinitions.filter(section => selectedKeys.includes(section.key));
  const csv = selected.map(section => {
    const headers = section.columns.map(([, label]) => `"${label}"`).join(',');
    const rows = data[section.key].map(row => section.columns.map(([key]) => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    return `${section.title}\n${headers}\n${rows}`;
  }).join('\n\n');
  if (format === 'pdf') {
    const popup = window.open('', '_blank', 'noopener,noreferrer'); if (!popup) return false;
    popup.document.write(`<html><head><title>Employee Payroll and Allocation</title><style>body{font-family:Arial;padding:24px;white-space:pre-wrap}h1{color:#54248f}</style></head><body><h1>John Doe — Payroll and Allocation</h1>${csv}<script>window.onload=()=>window.print()<\/script></body></html>`); popup.document.close(); return true;
  }
  if (format === 'word') download('john-doe-payroll.doc', `<html><body><pre>${csv}</pre></body></html>`, 'application/msword'); else download('john-doe-payroll.csv', csv);
  return true;
}

const bulkFieldRegistry = [
  { key: 'firstName', label: 'First Name', type: 'text', required: true },
  { key: 'lastName', label: 'Last Name', type: 'text', required: true },
  { key: 'middleName', label: 'Middle Name', type: 'text' },
  { key: 'birthdate', label: 'Birthdate', type: 'date' },
  { key: 'employmentStatus', label: 'Employment Status', type: 'select', options: ['Full-time', 'Part-time', 'Probationary', 'Inactive'] },
  { key: 'department', label: 'Department', type: 'text' },
  { key: 'jobTitle', label: 'Job Title', type: 'text' },
  { key: 'jobLevel', label: 'Job Level', type: 'text' },
  { key: 'costCenter', label: 'Cost Center', type: 'reference' },
  { key: 'officeLocation', label: 'Office Location', type: 'reference' },
  { key: 'reportingManager', label: 'Reporting Manager', type: 'reference' },
  { key: 'employeeGroup', label: 'Employee Group', type: 'reference' },
  { key: 'payFrequency', label: 'Pay Frequency', type: 'select', options: ['Weekly', 'Semi-monthly', 'Monthly'] },
  { key: 'payType', label: 'Pay Type', type: 'select', options: ['Monthly', 'Daily', 'Hourly'] },
  { key: 'bankCompanyCode', label: 'Bank Company Code', type: 'reference', sensitive: true },
  { key: 'paymentMode', label: 'Payment Mode', type: 'select', options: ['Bank Transfer', 'Check', 'Cash'] },
  { key: 'holidayGroup', label: 'Holiday Group', type: 'reference' },
];
const bulkStorageKey = 'atlas-employee-bulk-jobs-v1';
const bulkCompanyId = 'cmp-abc-001';

function parseBulkCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < String(text || '').length; index += 1) {
    const character = text[index];
    if (character === '"' && text[index + 1] === '"' && quoted) { cell += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((character === '\n' || character === '\r') && !quoted) { if (character === '\r' && text[index + 1] === '\n') index += 1; row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = ''; continue; }
    cell += character;
  }
  if (cell || row.length) { row.push(cell); if (row.some(value => value.trim())) rows.push(row); }
  return rows;
}

function contentHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < String(text || '').length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `fnv-${(hash >>> 0).toString(16)}`;
}

function readBulkJobs() {
  try { const saved = JSON.parse(localStorage.getItem(bulkStorageKey)); return Array.isArray(saved) ? saved.filter(item => item.companyId === bulkCompanyId) : []; } catch { return []; }
}

function saveBulkJob(job) {
  const existing = readBulkJobs();
  localStorage.setItem(bulkStorageKey, JSON.stringify([job, ...existing.filter(item => item.jobId !== job.jobId)].slice(0, 50)));
  return job;
}

function BulkActions({ employees, setEmployees, notify }) {
  const [step, setStep] = useState(0);
  const [operation, setOperation] = useState('Update existing employees');
  const [selectedFields, setSelectedFields] = useState(['firstName', 'lastName', 'employmentStatus', 'department']);
  const [job, setJob] = useState(null);
  const [history, setHistory] = useState(readBulkJobs);
  const toggleField = field => setSelectedFields(previous => previous.includes(field) ? previous.filter(item => item !== field) : [...previous, field]);
  const updateJob = next => { saveBulkJob(next); setJob(next); setHistory(readBulkJobs()); };
  const downloadTemplate = () => {
    const headers = ['employeeCode', ...selectedFields];
    const sample = ['0000112345', ...selectedFields.map(key => key === 'employmentStatus' ? 'Full-time' : '')];
    download('employee-bulk-update-template.csv', `${headers.join(',')}\n${sample.join(',')}\n`);
    notify({ type: 'success', message: 'Bulk update template downloaded. Employee Code is immutable and must remain in the file.' });
  };
  const stageFile = event => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || ''); const rows = parseBulkCsv(raw); const headers = (rows.shift() || []).map(value => value.trim());
      const selectedHeaders = ['employeeCode', ...selectedFields]; const errors = []; const warnings = [];
      const unknown = headers.filter(header => !selectedHeaders.includes(header));
      const missing = selectedHeaders.filter(header => !headers.includes(header));
      if (unknown.length) errors.push({ row: 1, employeeCode: '', field: unknown.join(', '), code: 'UNKNOWN_FIELD', reason: 'Header is not in the selected field set.', rejectedValue: '[header]' });
      if (missing.length) errors.push({ row: 1, employeeCode: '', field: missing.join(', '), code: 'MISSING_FIELD', reason: 'Selected field is missing from the template.', rejectedValue: '' });
      const entries = []; const seen = new Set();
      rows.forEach((values, index) => {
        const rowNumber = index + 2; const record = Object.fromEntries(headers.map((header, position) => [header, String(values[position] || '').trim()])); const employeeCode = record.employeeCode;
        if (!employeeCode) { errors.push({ row: rowNumber, employeeCode: '', field: 'employeeCode', code: 'MISSING_EMPLOYEE', reason: 'Employee Code is required and immutable.', rejectedValue: '' }); return; }
        if (seen.has(employeeCode)) { errors.push({ row: rowNumber, employeeCode, field: 'employeeCode', code: 'DUPLICATE_EMPLOYEE', reason: 'Employee Code appears more than once in this attempt.', rejectedValue: employeeCode }); return; }
        seen.add(employeeCode);
        const current = employees.find(item => item.employeeCode === employeeCode || item.id === employeeCode);
        if (!current) { errors.push({ row: rowNumber, employeeCode, field: 'employeeCode', code: 'EMPLOYEE_NOT_FOUND', reason: 'Employee is outside the selected company or does not exist.', rejectedValue: employeeCode }); return; }
        selectedFields.forEach(fieldKey => {
          const metadata = bulkFieldRegistry.find(field => field.key === fieldKey); const value = record[fieldKey];
          if (metadata?.required && !value) errors.push({ row: rowNumber, employeeCode, field: fieldKey, code: 'REQUIRED_VALUE', reason: `${metadata.label} cannot be blank.`, rejectedValue: metadata.sensitive ? '[masked]' : value });
          if (metadata?.type === 'date' && value && Number.isNaN(Date.parse(value))) errors.push({ row: rowNumber, employeeCode, field: fieldKey, code: 'INVALID_DATE', reason: 'Use an unambiguous ISO date (YYYY-MM-DD).', rejectedValue: metadata.sensitive ? '[masked]' : value });
          if (metadata?.options && value && !metadata.options.includes(value)) errors.push({ row: rowNumber, employeeCode, field: fieldKey, code: 'INVALID_REFERENCE', reason: `Use one of: ${metadata.options.join(', ')}.`, rejectedValue: metadata.sensitive ? '[masked]' : value });
          if (!value && !metadata?.required) warnings.push({ row: rowNumber, employeeCode, field: fieldKey, code: 'BLANK_UPDATE', reason: 'Blank means retain the existing value.', rejectedValue: '' });
        });
        entries.push({ employeeCode, values: Object.fromEntries(selectedFields.map(fieldKey => [fieldKey, record[fieldKey] || ''])), snapshotVersion: Number(current.version || 1) });
      });
      const next = { jobId: `bulk-${Date.now()}`, companyId: bulkCompanyId, operation, fileName: file.name, fileHash: contentHash(raw), attemptNo: 1, selectedFields, uploadedAt: new Date().toISOString(), validatedAt: new Date().toISOString(), totalRows: rows.length, validRows: entries.filter(entry => !errors.some(error => error.employeeCode === entry.employeeCode && error.row > 1)).length, invalidRows: errors.filter(error => error.row > 1).length, status: errors.length ? 'Validation Failed' : 'Ready to Commit', errors, warnings, rows: entries, committedRows: 0 };
      updateJob(next); setStep(2); event.target.value = '';
      notify({ type: errors.length ? 'error' : 'success', message: errors.length ? `${errors.length} validation issue${errors.length === 1 ? '' : 's'} found. No employee data was changed.` : 'File validated. Review the preview before committing.' });
    };
    reader.readAsText(file);
  };
  const commit = () => {
    if (!job || job.status !== 'Ready to Commit') return notify({ type: 'error', message: 'Resolve validation issues before committing.' });
    const conflicts = job.rows.filter(entry => { const current = employees.find(item => item.employeeCode === entry.employeeCode || item.id === entry.employeeCode); return !current || Number(current.version || 1) !== Number(entry.snapshotVersion || 1); });
    if (conflicts.length) { const next = { ...job, status: 'Validation Failed', errors: conflicts.map(entry => ({ row: 0, employeeCode: entry.employeeCode, field: 'version', code: 'CONCURRENCY_CONFLICT', reason: 'Employee changed after validation; re-upload a fresh attempt.', rejectedValue: '' })) }; updateJob(next); notify({ type: 'error', message: 'Commit blocked because employee data changed after validation.' }); return; }
    const nextEmployees = employees.map(employee => { const change = job.rows.find(entry => entry.employeeCode === employee.employeeCode || entry.employeeCode === employee.id); if (!change) return employee; const next = { ...employee, ...Object.fromEntries(Object.entries(change.values).filter(([, value]) => value !== '')), version: Number(employee.version || 1) + 1, updatedAt: new Date().toISOString() }; if (next.firstName || next.lastName) { next.name = [next.firstName, next.middleName, next.lastName].filter(Boolean).join(' '); next.initials = `${next.firstName?.[0] || ''}${next.lastName?.[0] || ''}`.toUpperCase(); } return next; });
    setEmployees(nextEmployees); const completed = { ...job, status: 'Completed', committedAt: new Date().toISOString(), committedRows: job.rows.length, errors: [], warnings: job.warnings || [] }; updateJob(completed); appendAuditEvent({ companyId: bulkCompanyId, actor: 'Client Admin', action: 'EmployeeBulkJobCommitted', entityType: 'BulkJob', entityId: job.jobId, summary: `${job.rows.length} employee records updated from ${job.fileName}.` }); setStep(3); notify({ type: 'success', message: `${job.rows.length} employee records committed to the canonical masterfile.` });
  };
  const downloadErrors = () => { if (!job?.errors?.length) return; const csv = ['row,employeeCode,field,code,reason,rejectedValue', ...job.errors.map(error => [error.row, error.employeeCode, error.field, error.code, error.reason, error.rejectedValue].map(value => `"${String(value || '').replaceAll('"', '""')}"`).join(','))].join('\n'); download(`${job.jobId}-errors.csv`, csv); };
  const reset = () => { setJob(null); setStep(0); };
  return <div className="employee-bulk"><div className="bulk-hero"><div><p className="eyebrow">Employee Masterfile / governed write channel</p><h1>Bulk Actions</h1><p>Stage, validate, preview and commit employee updates without writing directly from an uploaded file.</p></div><span className="controlled-badge"><ShieldCheck /> Company-scoped · {bulkCompanyId}</span></div><div className="bulk-stepper">{['Select fields', 'Upload', 'Validate & preview', 'Commit & history'].map((label, index) => <div key={label} className={`${step === index ? 'active' : ''} ${step > index ? 'complete' : ''}`}><span>{step > index ? <Check /> : index + 1}</span>{label}</div>)}</div>{step === 0 && <section className="bulk-card"><div className="bulk-card-heading"><div><h2>1. Choose a controlled operation</h2><p>Employee Code is immutable. Select only whitelisted fields that the actor is allowed to update.</p></div></div><label className="bulk-operation">Operation<select value={operation} onChange={event => setOperation(event.target.value)}><option>Update existing employees</option><option>Correct employee data</option></select></label><div className="bulk-field-list"><div className="bulk-field locked"><input type="checkbox" checked readOnly /><div><strong>employeeCode</strong><small>Employee Code · immutable identifier</small></div><span>Required</span></div>{bulkFieldRegistry.map(field => <label className="bulk-field" key={field.key}><input type="checkbox" checked={selectedFields.includes(field.key)} onChange={() => toggleField(field.key)} /><div><strong>{field.key}</strong><small>{field.label} · {field.type === 'reference' ? 'reference code required' : field.type}</small></div>{field.required && <span>Required</span>}</label>)}</div><div className="bulk-actions"><button className="button secondary" onClick={downloadTemplate}><FileCsv /> Download template</button><button className="button primary" disabled={!selectedFields.length} onClick={() => setStep(1)}>Continue <ArrowRight /></button></div></section>}{step === 1 && <section className="bulk-card"><div className="bulk-card-heading"><div><h2>2. Upload a staged attempt</h2><p>Upload the generated template. The file is hashed, scoped to this company, and validated before any canonical write.</p></div></div><div className="bulk-upload-box"><FileCsv /><strong>Upload CSV</strong><span>Headers must match the selected field keys. Reference values use codes, not display labels.</span><label className="button primary">Choose CSV<input className="sr-only" type="file" accept=".csv,text/csv" onChange={stageFile} /></label><button className="button secondary" onClick={downloadTemplate}><FileCsv /> Download template</button></div><div className="bulk-actions"><button className="button secondary" onClick={() => setStep(0)}>Back</button></div></section>}{step === 2 && <section className="bulk-card"><div className="bulk-card-heading"><div><h2>3. Validate and preview</h2><p>Review the exact row-level result. Invalid files never write to the masterfile.</p></div><span className={`status-pill ${job?.status === 'Ready to Commit' ? 'active' : 'inactive'}`}>{job?.status}</span></div>{job && <><div className="bulk-summary"><span><strong>{job.totalRows}</strong><small>Total rows</small></span><span><strong>{job.validRows}</strong><small>Valid rows</small></span><span><strong>{job.invalidRows}</strong><small>Invalid rows</small></span><span><strong>{job.warnings?.length || 0}</strong><small>Warnings</small></span><span><strong>{job.fileHash}</strong><small>Content hash</small></span></div>{job.errors?.length ? <div className="bulk-errors"><div><Warning /><strong>Resolve validation errors before commit.</strong><button className="button secondary" onClick={downloadErrors}>Download errors</button></div><ul>{job.errors.slice(0, 12).map((error, index) => <li key={`${error.code}-${index}`}>Row {error.row || '—'} · {error.employeeCode || '—'} · <strong>{error.code}</strong> · {error.reason}</li>)}</ul></div> : <div className="bulk-success"><CheckCircle /><span><strong>All rows are valid.</strong> Blank optional cells retain the existing value.</span></div>}<div className="table-card bulk-preview"><table><thead><tr><th>Row</th><th>Employee</th>{selectedFields.map(field => <th key={field}>{field}</th>)}</tr></thead><tbody>{job.rows.map((entry, index) => <tr key={entry.employeeCode}><td>{index + 2}</td><td><code>{entry.employeeCode}</code></td>{selectedFields.map(field => <td key={field}>{entry.values[field] || 'Retain existing'}</td>)}</tr>)}</tbody></table></div></>}{job?.status === 'Ready to Commit' && <div className="bulk-actions"><button className="button secondary" onClick={() => setStep(1)}>Re-upload</button><button className="button primary" onClick={commit}>Commit {job.validRows} rows</button></div>}{job?.status !== 'Ready to Commit' && <div className="bulk-actions"><button className="button secondary" onClick={() => setStep(1)}>Re-upload corrected file</button></div>}</section>}{step === 3 && <section className="bulk-card"><div className="bulk-card-heading"><div><h2>4. Commit result and history</h2><p>The canonical Employee Masterfile was updated once. A second commit of the same job is not available.</p></div><span className="status-pill active">Completed</span></div>{job && <div className="bulk-success"><CheckCircle /><span><strong>{job.committedRows} rows committed.</strong> Audit event recorded with job ID {job.jobId}.</span></div>}<div className="bulk-actions"><button className="button primary" onClick={reset}><Plus /> Start another bulk action</button></div></section>}{history.length > 0 && <section className="bulk-card bulk-history"><div className="bulk-card-heading"><div><h2>Bulk job history</h2><p>Attempts, hashes, validation results and commits are retained per company.</p></div></div><div className="table-card bulk-preview"><table><thead><tr><th>Job</th><th>File</th><th>Operation</th><th>Rows</th><th>Status</th><th>Attempt</th><th>Updated</th></tr></thead><tbody>{history.map(item => <tr key={item.jobId}><td><code>{item.jobId}</code><small>{item.fileHash}</small></td><td>{item.fileName}</td><td>{item.operation}</td><td>{item.committedRows || item.validRows || 0}/{item.totalRows}</td><td><span className={`status-pill ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{item.status}</span></td><td>{item.attemptNo}</td><td>{String(item.committedAt || item.validatedAt || item.uploadedAt || '').replace('T', ' ').slice(0, 16)}</td></tr>)}</tbody></table></div></section>}</div>;
}

export function EmployeeMasterfile({ onBack, onNavigate, notify, company, companies, onSelectCompany }) {
  const storageKey = 'atlas-employee-payroll-data-v3';
  const [data, setData] = useState(() => {
    let base = null;
    try { base = JSON.parse(localStorage.getItem(storageKey)); } catch { base = null; }
    if (!base) base = Object.fromEntries(sectionDefinitions.map(section => [section.key, section.rows.map((row, index) => normalizePayrollRecord(section, { ...row, id: index + 1 }))]));
    // Derived ceiling/balance columns are recomputed on load so stored rows and
    // seeded rows always reflect the current statutory tables and YTD position.
    const latestYtd = [...(base.ytd || [])].sort((a, b) => String(b.year).localeCompare(String(a.year)))[0] || {};
    const context = { ytdNonTaxableBonus: Number(latestYtd.nonTaxableBonus || 0) };
    return Object.fromEntries(sectionDefinitions.map(section => {
      const rows = (base[section.key] || []).map(row => normalizePayrollRecord(section, row));
      return [section.key, recalculateSection(section, rows, context)];
    }));
  });
  const [employeeList, setEmployeeList] = useState(() => {
    try { return JSON.parse(localStorage.getItem('atlas-employee-directory-v2')) || employees; } catch { return employees; }
  });
  const [module, setModule] = useState('employees');
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Personal Details');
  const [employeeId, setEmployeeId] = useState(employees[0].id);
  const [employeePicker, setEmployeePicker] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [customExport, setCustomExport] = useState(false);
  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(data)), [data]);
  useEffect(() => localStorage.setItem('atlas-employee-directory-v2', JSON.stringify(employeeList)), [employeeList]);
  const employee = useMemo(() => employeeList.find(item => item.id === employeeId) || employeeList[0] || employees[0], [employeeId, employeeList]);
  const updateRows = (key, rows) => setData(previous => ({ ...previous, [key]: rows }));
  // YTD utilisation the ceiling rules consume (§10.1). The latest recorded
  // year is what the current payroll year draws its remaining threshold from.
  const payrollContext = useMemo(() => {
    const latestYtd = [...(data.ytd || [])].sort((a, b) => String(b.year).localeCompare(String(a.year)))[0] || {};
    return { ytdNonTaxableBonus: Number(latestYtd.nonTaxableBonus || 0), ytdDeMinimis: Number(latestYtd.deMinimis || 0), ytdYear: latestYtd.year };
  }, [data.ytd]);
  const runExport = (keys, format) => { if (exportEmployeeData(data, keys, format)) notify({ type: 'success', message: 'Employee payroll export prepared.' }); setCustomExport(false); setExportMenu(false); };
  const selectEmployee = item => { setEmployeeId(item.id); setActiveTab('Personal Details'); setDetailOpen(true); };
  const tabs = ['Personal Details', 'Employee Record', 'Benefits', 'Time Off', 'Payroll & Allocation', 'Contacts'];

  return <div className="app-shell employee-screen">
    <BrandRail onHome={onBack} onCore={onBack} onPayroll={() => onNavigate?.('payroll')} onSettings={() => onNavigate?.('settings')} active="core" /><EmployeeSidebar onBack={onBack} module={module} setModule={setModule} closeDetail={() => setDetailOpen(false)} />
    <main className="employee-main"><Topbar company={company} companies={companies} onSelectCompany={onSelectCompany} /><div className="employee-page">
      <div className="employee-module-shortcuts"><button className="button secondary" onClick={() => { setModule('bulk'); setDetailOpen(false); }}><FileCsv /> Bulk Actions</button></div>
      {module === 'bulk' ? <BulkActions employees={employeeList} setEmployees={setEmployeeList} notify={notify} /> : module === 'accounts' ? <AccountSettings notify={notify} /> : !detailOpen ? <EmployeeDirectory employees={employeeList} setEmployees={setEmployeeList} onSelect={selectEmployee} onBulk={() => setModule('bulk')} notify={notify} /> : <>
        <button className="inline-back" onClick={() => setDetailOpen(false)}>← Employee Information</button>
        <p className="breadcrumb">Employee Information / {employee.name}</p>
        <section className="employee-hero"><div className="employee-photo">{employee.initials}</div><div><div className="employee-title-row"><h1>{employee.name} <span>[{employee.id}]</span></h1><button onClick={() => setEmployeePicker(!employeePicker)}><PencilSimple /></button></div><p>{employee.role} | {employee.location}</p><small>Hire date: {employee.hireDate || '2024-05-30'}</small><span className="employee-active">ACTIVE</span></div>
          {employeePicker && <div className="employee-picker"><div><MagnifyingGlass /><input placeholder="Search employee" /></div>{employeeList.map(item => <button key={item.id} onClick={() => { setEmployeeId(item.id); setEmployeePicker(false); }}><span>{item.initials}</span><div><strong>{item.name}</strong><small>{item.id}</small></div>{item.id === employeeId && <CheckCircle weight="fill" />}</button>)}</div>}
        </section>
        <nav className="employee-tabs">{tabs.map(tab => <button key={tab} className={tab === activeTab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>
        {activeTab === 'Personal Details' && <PersonalDetails employee={employee} notify={notify} />}
        {activeTab === 'Employee Record' && <EmployeeRecord employee={employee} notify={notify} />}
        {activeTab === 'Benefits' && <Benefits employee={employee} notify={notify} />}
        {activeTab === 'Time Off' && <TimeOff employee={employee} notify={notify} />}
        {activeTab === 'Contacts' && <Contacts employee={employee} notify={notify} />}
        {activeTab === 'Payroll & Allocation' && <>
          <div className="employee-export-row"><div className="menu-anchor"><button className="button secondary" onClick={() => setExportMenu(!exportMenu)}><DownloadSimple /> Export <CaretDown /></button>{exportMenu && <div className="export-menu employee-export-menu"><button onClick={() => runExport(sectionDefinitions.map(section => section.key), 'csv')}>Export All — Excel / CSV</button><button onClick={() => runExport(sectionDefinitions.map(section => section.key), 'pdf')}>Export All — PDF / Print</button><button onClick={() => { setCustomExport(true); setExportMenu(false); }}>Custom export…</button></div>}</div></div>
          <section className="employee-data-stack">{sectionDefinitions.map((section, index) => <EmployeeSection key={section.key} section={section} rows={data[section.key] || []} setRows={rows => updateRows(section.key, rows)} notify={notify} context={payrollContext} onOpenBulk={() => { setModule('bulk'); setDetailOpen(false); }} initiallyOpen={index < 3 || ['loans', 'allowances', 'previousPayroll', 'costAllocation'].includes(section.key)} />)}</section>
        </>}
      </>}
    </div></main>
    {customExport && <CustomExport sections={sectionDefinitions} onClose={() => setCustomExport(false)} onExport={runExport} />}
  </div>;
}
