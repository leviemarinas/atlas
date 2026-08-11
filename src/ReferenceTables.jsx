import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  CaretDown,
  CaretRight,
  Clock,
  Cube,
  DownloadSimple,
  Gear,
  House,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  PuzzlePiece,
  SignOut,
  Sparkle,
  SquaresFour,
  Table,
  Trash,
  UploadSimple,
  Users,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { RoleSwitch, useRole } from './RoleContext';
import { BrandRail, Topbar } from './AppChrome';
import { readPayrollCollectionDefinitions, synchronizePayrollReference } from './payrollIntegration';

const groups = [
  { id: 'generic', label: 'Generic', description: 'Shared reference values maintained by P&A Administration.' },
  { id: 'hybrid', label: 'Generic and Specific', description: 'Shared defaults with company-specific additions.' },
  { id: 'specific', label: 'Specific', description: 'Company-isolated values managed within this company.' },
  { id: 'others', label: 'Other Reference Tables', description: 'Supporting reference values used by Atlas modules.' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const listRows = (values, source) => values.map((name, index) => ({ id: `${source || 'seed'}-${index + 1}`, name, status: 'Active', ...(source ? { source } : {}) }));
const tableRows = (values, source) => values.map((row, index) => ({ id: `${source || 'seed'}-${index + 1}`, status: 'Active', ...row, ...(source ? { source } : {}) }));

const seedTables = [
  { id: 'bir-form', group: 'generic', scope: 'generic', name: 'BIR Form', description: 'Bureau of Internal Revenue forms available for payroll and statutory reporting.', columns: [['code', 'Form Code'], ['name', 'Form Name'], ['purpose', 'Purpose'], ['status', 'Status']], rows: tableRows([{ code: 'BIR-1601C', name: 'Monthly Remittance Return of Income Taxes Withheld', purpose: 'Monthly withholding remittance' }, { code: 'BIR-2316', name: 'Certificate of Compensation Payment / Tax Withheld', purpose: 'Annual employee tax certificate' }, { code: 'BIR-1604C', name: 'Annual Information Return of Income Taxes Withheld', purpose: 'Annual withholding information return' }]) },
  { id: 'transaction-mode', group: 'generic', scope: 'generic', name: 'Transaction Mode', description: 'Approved modes for payroll disbursement, collection, and settlement.', columns: [['code', 'Mode Code'], ['name', 'Transaction Mode'], ['status', 'Status']], rows: tableRows([{ code: 'BANK', name: 'Bank Transfer' }, { code: 'CASH', name: 'Cash' }, { code: 'CHECK', name: 'Check' }, { code: 'EWALLET', name: 'Electronic Wallet' }]) },
  { id: 'statutory-name', group: 'generic', scope: 'generic', name: 'Statutory Name', description: 'Government agencies used for contributions, taxes, loans, and remittances.', columns: [['code', 'Statutory Code'], ['name', 'Statutory Name'], ['agency', 'Agency'], ['status', 'Status']], rows: tableRows([{ code: 'BIR', name: 'Bureau of Internal Revenue', agency: 'BIR' }, { code: 'SSS', name: 'Social Security System', agency: 'SSS' }, { code: 'PHIC', name: 'PhilHealth', agency: 'PhilHealth' }, { code: 'HDMF', name: 'Home Development Mutual Fund', agency: 'Pag-IBIG' }]) },
  { id: 'multi-currency-activity', group: 'generic', scope: 'generic', name: 'Multi-Currency Activity', description: 'Activities that may be processed in a currency other than the company base currency.', columns: [['code', 'Activity Code'], ['name', 'Activity'], ['status', 'Status']], rows: tableRows([{ code: 'PAYROLL', name: 'Payroll Processing' }, { code: 'REIMBURSEMENT', name: 'Employee Reimbursement' }, { code: 'DISBURSEMENT', name: 'Payroll Disbursement' }, { code: 'BILLING', name: 'Client Billing' }]) },
  { id: 'de-minimis-benefits', group: 'generic', scope: 'generic', name: 'De Minimis Benefits', description: 'Shared benefit names used by the effective De Minimis statutory table.', columns: [['code', 'Benefit Code'], ['name', 'Benefit Name'], ['classification', 'Classification'], ['status', 'Status']], rows: tableRows([{ code: 'DM-RICE', name: 'Rice Subsidy', classification: 'Non-taxable ceiling' }, { code: 'DM-UNIFORM', name: 'Uniform and Clothing Allowance', classification: 'Non-taxable ceiling' }, { code: 'DM-MED', name: 'Medical Cash Allowance to Dependents', classification: 'Non-taxable ceiling' }, { code: 'DM-LOA', name: 'Laundry Allowance', classification: 'Non-taxable ceiling' }]) },
  { id: 'civil-status', group: 'generic', scope: 'generic', name: 'Civil Status', description: 'Civil status values used in employee personal details.', mode: 'list', columns: [['name', 'Civil Status']], rows: listRows(['Single', 'Married', 'Divorced', 'Separated', 'Widowed']) },
  { id: 'countries', group: 'generic', scope: 'generic', name: 'Country', description: 'ISO-aligned country values for addresses and employee origin.', columns: [['code', 'Country Code'], ['name', 'Country Name'], ['status', 'Status']], rows: tableRows([{ code: 'PH', name: 'Philippines', status: 'Active' }, { code: 'SG', name: 'Singapore', status: 'Active' }, { code: 'US', name: 'United States', status: 'Active' }]) },
  { id: 'nationality', group: 'generic', scope: 'generic', name: 'Nationality', description: 'Nationality values shared by employee and compliance records.', mode: 'list', columns: [['name', 'Nationality']], rows: listRows(['Filipino', 'Singaporean', 'American']) },
  { id: 'employment-status', group: 'generic', scope: 'generic', name: 'Employment Status', description: 'Employment classifications used throughout Employee Masterfile.', mode: 'list', columns: [['name', 'Employment Status']], rows: listRows(['Full-time', 'Part-time', 'Probationary', 'Project-based', 'Separated']) },
  { id: 'pay-frequency', group: 'generic', scope: 'generic', name: 'Pay Frequency', description: 'Payroll frequencies available to company assignments.', mode: 'list', columns: [['name', 'Pay Frequency']], rows: listRows(['Weekly', 'Semi-monthly', 'Monthly', 'Quarterly']) },
  { id: 'banks', group: 'generic', scope: 'generic', name: 'Bank', description: 'Supported disbursement banks and bank codes.', columns: [['code', 'Bank Code'], ['name', 'Bank Name'], ['status', 'Status']], rows: tableRows([{ code: 'BDO', name: 'BDO Unibank', status: 'Active' }, { code: 'BPI', name: 'Bank of the Philippine Islands', status: 'Active' }, { code: 'UBP', name: 'UnionBank', status: 'Active' }]) },
  { id: 'currency', group: 'generic', scope: 'generic', name: 'Currency', description: 'Currencies available to payroll and employee banking.', columns: [['code', 'Currency Code'], ['name', 'Currency Name'], ['status', 'Status']], rows: tableRows([{ code: 'PHP', name: 'Philippine Peso', status: 'Active' }, { code: 'USD', name: 'US Dollar', status: 'Active' }]) },
  { id: 'exchange-rates', group: 'generic', scope: 'generic', name: 'Exchange Rate', description: 'Effective-dated conversion rates used by multi-currency payroll.', columns: [['code', 'Currency Pair'], ['rate', 'Exchange Rate'], ['effectiveDate', 'Effective Date'], ['status', 'Status']], rows: tableRows([{ code: 'USD-PHP', rate: '57.20', effectiveDate: '2026-08-01', status: 'Active' }, { code: 'SGD-PHP', rate: '44.10', effectiveDate: '2026-08-01', status: 'Active' }]) },
  { id: 'government-branches', group: 'generic', scope: 'generic', name: 'Government Branch', description: 'BIR, SSS, PhilHealth, and HDMF branch codes used by company and employee registrations.', columns: [['code', 'Branch Code'], ['name', 'Agency / Branch Name'], ['status', 'Status']], rows: tableRows([{ code: 'BIR-047', name: 'BIR RDO 047', status: 'Active' }, { code: 'SSS-NCR', name: 'SSS NCR', status: 'Active' }, { code: 'PHIC-NCR', name: 'PhilHealth NCR', status: 'Active' }, { code: 'HDMF-NCR', name: 'HDMF NCR', status: 'Active' }]) },
  { id: 'relationships', group: 'generic', scope: 'generic', name: 'Relationship Type', description: 'Relationship values for contacts, dependents, and allottees.', mode: 'list', columns: [['name', 'Relationship Type']], rows: listRows(['Spouse', 'Child', 'Parent', 'Sibling', 'Guardian', 'Other']) },
  { id: 'thirteenth-bonus-type', group: 'hybrid', scope: 'hybrid', name: '13th Month and Bonus Type', description: 'Shared bonus classifications with company-specific additions for payroll setup.', columns: [['code', 'Bonus Code'], ['name', 'Bonus Type'], ['classification', 'Classification'], ['status', 'Status']], rows: tableRows([{ code: '13TH', name: '13th Month Pay', classification: 'Statutory / taxable ceiling' }, { code: 'PERF', name: 'Performance Bonus', classification: 'Company bonus' }, { code: 'SIGN', name: 'Signing Bonus', classification: 'Company bonus' }], 'generic').concat(tableRows([{ code: 'ABC-SPOT', name: 'ABC Spot Award', classification: 'Company bonus' }], 'specific')) },
  { id: 'gl-name', group: 'specific', scope: 'specific', name: 'GL Name', description: 'Company-specific general ledger names used by payroll and journal mappings.', columns: [['code', 'GL Code'], ['name', 'GL Name'], ['classification', 'Classification'], ['status', 'Status']], rows: tableRows([{ code: '610100', name: 'Salaries and Wages', classification: 'Expense', status: 'Active' }, { code: '610200', name: 'Employee Benefits', classification: 'Expense', status: 'Active' }, { code: '210100', name: 'Payroll Payable', classification: 'Liability', status: 'Active' }]) },
  { id: 'departments', group: 'specific', scope: 'specific', name: 'Department', description: 'ABC Company organizational departments.', columns: [['code', 'Department Code'], ['name', 'Department Name'], ['status', 'Status']], rows: tableRows([{ code: 'HR', name: 'Human Resources', status: 'Active' }, { code: 'FIN', name: 'Finance', status: 'Active' }, { code: 'OPS', name: 'Operations', status: 'Active' }]) },
  { id: 'cost-centers', group: 'specific', scope: 'specific', name: 'Cost Center', description: 'Client-owned cost centers available to payroll allocation.', columns: [['code', 'Cost Center Code'], ['name', 'Cost Center Name'], ['status', 'Status']], rows: tableRows([{ code: 'CC-100', name: 'Corporate Services', status: 'Active' }, { code: 'CC-220', name: 'Payroll Operations', status: 'Active' }]) },
  { id: 'job-titles', group: 'specific', scope: 'specific', name: 'Job Title', description: 'Approved job titles used in employee assignments.', columns: [['code', 'Job Code'], ['name', 'Job Title'], ['status', 'Status']], rows: tableRows([{ code: 'PAY-01', name: 'Payroll Specialist', status: 'Active' }, { code: 'PAY-02', name: 'Payroll Analyst', status: 'Active' }, { code: 'PAY-03', name: 'Team Lead', status: 'Active' }]) },
  { id: 'work-locations', group: 'specific', scope: 'specific', name: 'Work Location', description: 'Office and remote work locations for assignments and statutory handling.', columns: [['code', 'Location Code'], ['name', 'Location Name'], ['status', 'Status']], rows: tableRows([{ code: 'MKT', name: 'Makati', status: 'Active' }, { code: 'MNL', name: 'Manila', status: 'Active' }]) },
  { id: 'payroll-groups', group: 'specific', scope: 'specific', name: 'Payroll Group', description: 'Company payroll population groupings.', columns: [['code', 'Payroll Group Code'], ['name', 'Payroll Group Name'], ['status', 'Status']], rows: tableRows([{ code: 'SM-REG', name: 'Semi-monthly Regular', status: 'Active' }, { code: 'MN-PROJ', name: 'Monthly Project-based', status: 'Active' }]) },
  { id: 'chart-of-accounts', group: 'specific', scope: 'specific', name: 'Chart of Accounts', description: 'Payroll expense, liability, cash, and receivable accounts used by journal-entry generation.', columns: [['code', 'Account Code'], ['name', 'Account Name'], ['classification', 'Classification'], ['status', 'Status']], rows: tableRows([{ code: '610100', name: 'Salaries and Wages', classification: 'Expense', status: 'Active' }, { code: '210100', name: 'Payroll Payable', classification: 'Liability', status: 'Active' }, { code: '110200', name: 'Employee Receivable', classification: 'Asset', status: 'Active' }]) },
  { id: 'gl-mapping', group: 'specific', scope: 'specific', name: 'GL Code Mapping', description: 'Maps payroll pay items and statutory entries to debit and credit accounts.', columns: [['code', 'Mapping Code'], ['name', 'Pay Item / Transaction'], ['debitAccount', 'Debit Account'], ['creditAccount', 'Credit Account'], ['status', 'Status']], rows: tableRows([{ code: 'GL-BASIC', name: 'Basic Pay', debitAccount: '610100', creditAccount: '210100', status: 'Active' }, { code: 'GL-SSS', name: 'SSS Payable', debitAccount: '610100', creditAccount: '220110', status: 'Active' }]) },
  { id: 'tax-tables', group: 'specific', scope: 'specific', name: 'Tax Table', description: 'Effective tax brackets and rates used by regular withholding and annualization.', columns: [['code', 'Bracket Code'], ['minimum', 'Minimum Taxable Income'], ['maximum', 'Maximum Taxable Income'], ['rate', 'Excess Rate'], ['status', 'Status']], rows: tableRows([{ code: 'BIR-M01', minimum: '0', maximum: '20833', rate: '0%', status: 'Active' }, { code: 'BIR-M02', minimum: '20833.01', maximum: '33332', rate: '15%', status: 'Active' }, { code: 'BIR-M03', minimum: '33333', maximum: '66666', rate: '20%', status: 'Active' }]) },
  { id: 'earning-types', group: 'specific', scope: 'specific', name: 'Earning Type', description: 'Earning and allowance references available to payroll and employee records.', columns: [['code', 'Earning Code'], ['name', 'Earning Name'], ['classification', 'Classification'], ['status', 'Status']], rows: tableRows([{ code: 'ERN-REG', name: 'Regular Earning', classification: 'Taxable', status: 'Active' }, { code: 'ERN-SAL', name: 'Salary', classification: 'Taxable', status: 'Active' }, { code: 'ERN-LEC', name: 'Lecture Fee', classification: 'Taxable', status: 'Active' }, { code: 'ERN-CLO', name: 'Uniform and Clothing Allowance', classification: 'Non-taxable', status: 'Active' }, { code: 'ERN-RICE', name: 'Rice Subsidy', classification: 'Non-taxable', status: 'Active' }, { code: 'ERN-DMN', name: 'De Minimis Benefit', classification: 'Non-taxable', status: 'Active' }, { code: 'ERN-RMB', name: 'Reimbursement', classification: 'Non-taxable', status: 'Active' }]) },
  { id: 'deduction-types', group: 'specific', scope: 'specific', name: 'Deduction Type', description: 'Company deduction references (MP2, health insurance, cash bond and similar) available to employee payroll records.', columns: [['code', 'Deduction Code'], ['name', 'Deduction Name'], ['classification', 'Classification'], ['status', 'Status']], rows: tableRows([{ code: 'DED-MP2', name: 'Pag-IBIG MP2 Savings', classification: 'Voluntary', status: 'Active' }, { code: 'DED-HMO', name: 'Health Insurance', classification: 'Voluntary', status: 'Active' }, { code: 'DED-BOND', name: 'Cash Bond', classification: 'Company', status: 'Active' }, { code: 'DED-CANTEEN', name: 'Canteen Charges', classification: 'Company', status: 'Active' }]) },
  { id: 'loan-types', group: 'specific', scope: 'specific', name: 'Loan Type', description: 'Government and company loan references available to employee payroll records.', columns: [['code', 'Loan Code'], ['name', 'Loan Name'], ['agency', 'Agency'], ['status', 'Status']], rows: tableRows([{ code: 'SSS-SAL', name: 'SSS Salary Loan', agency: 'SSS', status: 'Active' }, { code: 'SSS-CAL', name: 'SSS Calamity Loan', agency: 'SSS', status: 'Active' }, { code: 'HDMF-MPL', name: 'HDMF Multi-Purpose Loan', agency: 'HDMF', status: 'Active' }, { code: 'COM-SAL', name: 'Company Salary Loan', agency: 'Company', status: 'Active' }]) },
  { id: 'overtime-types', group: 'specific', scope: 'specific', name: 'Overtime and Premium Type', description: 'Rate factors for overtime, rest day, holiday, and night differential calculations.', columns: [['code', 'Premium Code'], ['name', 'Premium Name'], ['rate', 'Rate Factor'], ['status', 'Status']], rows: tableRows([{ code: 'OT-REG', name: 'Regular Day Overtime', rate: '1.25', status: 'Active' }, { code: 'OT-RD', name: 'Rest Day Overtime', rate: '1.69', status: 'Active' }, { code: 'OT-RH', name: 'Regular Holiday Overtime', rate: '2.60', status: 'Active' }, { code: 'ND', name: 'Night Differential', rate: '0.10', status: 'Active' }]) },
  { id: 'holiday-groups', group: 'specific', scope: 'specific', name: 'Holiday Group', description: 'Holiday calendars assignable by company, location, and employee group.', columns: [['code', 'Holiday Group Code'], ['name', 'Holiday Group Name'], ['location', 'Location'], ['status', 'Status']], rows: tableRows([{ code: 'PH-NAT', name: 'Philippines National Holidays', location: 'Philippines', status: 'Active' }, { code: 'MKT-LOC', name: 'Makati Local Holidays', location: 'Makati', status: 'Active' }]) },
  { id: 'de-minimis-ceilings', group: 'specific', scope: 'specific', name: 'De Minimis Ceiling', description: 'Annual and periodic non-taxable ceilings used by earning classification and tax annualization.', columns: [['code', 'Benefit Code'], ['name', 'Benefit Name'], ['ceiling', 'Annual Ceiling'], ['status', 'Status']], rows: tableRows([{ code: 'DM-RICE', name: 'Rice Subsidy', ceiling: '24000', status: 'Active' }, { code: 'DM-UNIFORM', name: 'Uniform and Clothing Allowance', ceiling: '7000', status: 'Active' }, { code: 'DM-MED', name: 'Medical Cash Allowance to Dependents', ceiling: '3000', status: 'Active' }]) },
  { id: 'bonus-ceilings', group: 'specific', scope: 'specific', name: 'Bonus Ceiling', description: 'Non-taxable 13th month pay and other benefit ceilings used per transaction and year to date.', columns: [['code', 'Bonus Ceiling Code'], ['name', 'Ceiling Name'], ['ceiling', 'Annual Ceiling'], ['status', 'Status']], rows: tableRows([{ code: 'BON-NT', name: '13th Month Pay and Other Benefits', ceiling: '90000', status: 'Active' }]) },
  { id: 'deduction-hierarchy', group: 'specific', scope: 'specific', name: 'Deduction Hierarchy', description: 'Priority order for statutory, loan, and company deductions when net pay is constrained.', columns: [['code', 'Priority Code'], ['name', 'Deduction Group'], ['priority', 'Priority'], ['status', 'Status']], rows: tableRows([{ code: 'DH-001', name: 'Statutory Deductions', priority: '1', status: 'Active' }, { code: 'DH-002', name: 'Government Loans', priority: '2', status: 'Active' }, { code: 'DH-003', name: 'Company Deductions', priority: '3', status: 'Active' }]) },
  { id: 'document-types', group: 'others', scope: 'specific', name: 'Document Type', description: 'Document labels available to employee records.', mode: 'list', columns: [['name', 'Document Type']], rows: listRows(['Birth Certificate', 'Employment Contract', 'Government ID', 'Medical Certificate']) },
  { id: 'license-types', group: 'others', scope: 'specific', name: 'License Type', description: 'Professional license types used in Employee Record.', mode: 'list', columns: [['name', 'License Type']], rows: listRows(['Professional License', 'Driver License', 'Safety Accreditation']) },
  { id: 'training-types', group: 'others', scope: 'specific', name: 'Training Type', description: 'Training classifications used in Employee Record.', mode: 'list', columns: [['name', 'Training Type']], rows: listRows(['Orientation', 'Compliance', 'Technical', 'Leadership']) },
];

function normaliseTable(table) {
  const group = table.group === 'client' ? 'specific' : table.group || 'generic';
  const scope = table.scope || (group === 'client' ? 'specific' : group === 'hybrid' ? 'hybrid' : group === 'generic' ? 'generic' : 'specific');
  return { ...table, group, scope, rows: (table.rows || []).map(row => scope === 'hybrid' ? { ...row, status: row.status || 'Active', source: row.source || 'generic' } : { ...row, status: row.status || 'Active' }) };
}

function loadTables() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('atlas-reference-tables-v4') || localStorage.getItem('atlas-reference-tables-v3') || '[]'); } catch { saved = []; }
  const savedById = new Map(saved.map(table => [table.id, normaliseTable(table)]));
  const merged = seedTables.map(seed => {
    const old = savedById.get(seed.id);
    if (!old) return seed;
    return { ...seed, ...old, group: seed.group, scope: seed.scope, columns: seed.columns, rows: old.rows?.length ? normaliseTable({ ...seed, ...old }).rows : seed.rows };
  });
  const known = new Set(merged.map(table => table.id));
  return merged.concat(saved.filter(table => !known.has(table.id)).map(normaliseTable)).map(table => {
    const definitions = readPayrollCollectionDefinitions();
    if (table.id === 'deduction-types') return {
      ...table,
      rows: definitions.filter(item => item.group === 'Deduction').map((item, index) => ({ id: index + 1, code: item.code, name: item.name, classification: item.kind, status: 'Active', source: item.sourceLabel })),
    };
    if (table.id === 'loan-types') return {
      ...table,
      rows: definitions.filter(item => item.group === 'Loan').map((item, index) => ({ id: index + 1, code: item.code, name: item.name, agency: item.kind, status: 'Active', source: item.sourceLabel })),
    };
    if (table.id === 'deduction-hierarchy') {
      let basisEntries = [];
      try { basisEntries = (JSON.parse(localStorage.getItem('atlas-computational-basis-references-v3')) || []).find(item => item.code === 'REF-011')?.entries || []; } catch { /* use module priorities */ }
      const entries = synchronizePayrollReference('REF-011', basisEntries);
      return { ...table, rows: entries.map((entry, index) => ({ id: index + 1, code: String(entry.note).split(/\s*(?:·|Â·)\s*/)[2] || `DH-${String(index + 1).padStart(3, '0')}`, name: entry.key, priority: entry.value, status: 'Active' })) };
    }
    return table;
  });
}

/**
 * Active values from a reference table, so employee and payroll dropdowns bind
 * to the canonical Reference Table module instead of drifting hard-coded lists.
 */
export function referenceValues(tableId, column = 'name') {
  const table = loadTables().find(item => item.id === tableId);
  return (table?.rows || []).filter(row => (row.status || 'Active') === 'Active').map(row => row[column]).filter(Boolean);
}

function csvEscape(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

const textEncoder = new TextEncoder();
const u16 = value => [value & 255, (value >>> 8) & 255];
const u32 = value => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
const concatBytes = chunks => { const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0); const output = new Uint8Array(total); let offset = 0; chunks.forEach(chunk => { output.set(chunk, offset); offset += chunk.length; }); return output; };
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipStore(entries) {
  const locals = []; const central = []; let offset = 0;
  entries.forEach(([name, content]) => {
    const nameBytes = textEncoder.encode(name); const data = content instanceof Uint8Array ? content : textEncoder.encode(content); const checksum = crc32(data);
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(checksum), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...nameBytes, ...data]);
    locals.push(local);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(checksum), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes]));
    offset += local.length;
  });
  const localBytes = concatBytes(locals); const centralBytes = concatBytes(central);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(centralBytes.length), ...u32(localBytes.length), ...u16(0)]);
  return concatBytes([localBytes, centralBytes, end]);
}
function xmlEscape(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
function makeXlsx(name, headers, values) {
  const rows = [headers, ...values];
  const columnName = index => { let result = ''; let value = index + 1; while (value) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26); } return result; };
  const sheetRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, colIndex) => `<c r="${columnName(colIndex)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join('')}</row>`).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(name).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  return zipStore([['[Content_Types].xml', types], ['_rels/.rels', rels], ['xl/workbook.xml', workbook], ['xl/_rels/workbook.xml.rels', workbookRels], ['xl/worksheets/sheet1.xml', sheet]]);
}
function makeDocx(name, headers, values) {
  const cell = value => `<w:tc><w:p><w:r><w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r></w:p></w:tc>`;
  const table = [headers, ...values].map(row => `<w:tr>${row.map(cell).join('')}</w:tr>`).join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${xmlEscape(name)}</w:t></w:r></w:p><w:tbl>${table}</w:tbl><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  return zipStore([['[Content_Types].xml', types], ['_rels/.rels', rels], ['word/document.xml', document]]);
}
function makePdf(name, headers, values) {
  const escapePdf = value => String(value ?? '').replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const lines = [name, headers.join(' | '), ...values.map(row => row.join(' | '))].slice(0, 48);
  const commands = ['BT', '/F1 15 Tf', '40 760 Td', `(${escapePdf(lines[0])}) Tj`, '/F1 8 Tf', '0 -24 Td', ...lines.slice(1).flatMap(line => [`(${escapePdf(line)}) Tj`, '0 -14 Td']), 'ET'].join('\n');
  const objects = [`<< /Type /Catalog /Pages 2 0 R >>`, `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`, `<< /Length ${textEncoder.encode(commands).length} >>\nstream\n${commands}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0]; objects.forEach((object, index) => { offsets.push(textEncoder.encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }); const xref = textEncoder.encode(pdf).length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return textEncoder.encode(pdf);
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && text[i + 1] === '"' && quoted) { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(values => values.some(value => value.trim()));
}

function scopeLabel(table) {
  if (table.scope === 'generic') return 'Shared generic values';
  if (table.scope === 'hybrid') return 'Hybrid: shared defaults + company additions';
  return 'Company-specific values';
}


function ReferenceSidebar({ activeGroup, setActiveGroup, onBack, closeTable }) {
  return <aside className="company-sidebar reference-sidebar"><button className="back-link" onClick={onBack}><ArrowLeft /> Back to Core</button><h2>Reference<br />Tables</h2><nav>{groups.map(group => { const Icon = group.id === 'generic' ? Table : group.id === 'specific' ? Users : group.id === 'hybrid' ? SquaresFour : Cube; return <button key={group.id} className={`side-link ${activeGroup === group.id ? 'selected' : ''}`} onClick={() => { setActiveGroup(group.id); closeTable(); }}><Icon weight={activeGroup === group.id ? 'fill' : 'regular'} /><span>{group.label}</span></button>; })}</nav></aside>;
}

function SearchBox({ value, onChange, placeholder = 'Search...' }) {
  return <label className="reference-search"><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /><MagnifyingGlass /></label>;
}

function ConfirmModal({ onClose, onConfirm }) {
  return <div className="modal-backdrop"><section className="modal delete-modal" role="dialog" aria-modal="true" aria-label="Discard unsaved changes"><header><h2>Discard changes?</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header><div className="modal-body"><p>Your unsaved changes will be lost.</p><div className="modal-actions"><button className="button secondary" onClick={onClose}>Continue editing</button><button className="button danger" onClick={onConfirm}>Discard changes</button></div></div></section></div>;
}

function EntryModal({ table, record, isAdmin, onClose, onSave }) {
  const initial = record || Object.fromEntries(table.columns.map(([key]) => [key, key === 'status' ? 'Active' : '']));
  const [draft, setDraft] = useState({ ...initial, ...(table.scope === 'hybrid' ? { source: initial.source || (isAdmin ? 'generic' : 'specific') } : {}) });
  const [error, setError] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify({ ...initial, ...(table.scope === 'hybrid' ? { source: initial.source || (isAdmin ? 'generic' : 'specific') } : {}) });
  const requestClose = () => (dirty ? setConfirmClose(true) : onClose());
  const sourceEditable = table.scope === 'hybrid' && isAdmin;
  return <>
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}><section className="modal reference-entry-modal" role="dialog" aria-modal="true" aria-label={`${record ? 'Edit' : 'Add'} ${table.name}`}><header><div><p className="modal-kicker">{scopeLabel(table)}</p><h2>{record ? 'Edit' : 'Add'} {table.name}</h2></div><button className="icon-button" onClick={requestClose} aria-label="Close"><X /></button></header><form onSubmit={event => { event.preventDefault(); const result = onSave(draft); if (result) setError(result); }}><div className="modal-body reference-form-grid">
      {table.scope === 'hybrid' && <label>Value scope<span className="required">*</span><select required disabled={!sourceEditable} value={draft.source || 'specific'} onChange={event => setDraft({ ...draft, source: event.target.value })}><option value="generic">Shared generic</option><option value="specific">Company-specific</option></select>{!sourceEditable && <small>Client Admin additions are company-specific.</small>}</label>}
      {table.columns.map(([key, label]) => <label key={key}>{label}<span className="required">*</span>{key === 'status' ? <select required value={draft[key] || 'Active'} onChange={event => setDraft({ ...draft, [key]: event.target.value })}><option>Active</option><option>Inactive</option></select> : <input required value={draft[key] || ''} onChange={event => setDraft({ ...draft, [key]: event.target.value })} placeholder={`Input ${label.toLowerCase()}`} />}</label>)}
      {error && <p className="form-error"><WarningCircle weight="fill" />{error}</p>}
    </div><footer className="modal-actions"><button type="button" className="button secondary" onClick={requestClose}>Cancel</button><button className="button primary">{record ? 'Save changes' : 'Add entry'}</button></footer></form></section></div>
    {confirmClose && <ConfirmModal onClose={() => setConfirmClose(false)} onConfirm={onClose} />}
  </>;
}

function DeleteModal({ table, record, onClose, onDelete }) {
  const label = record[table.columns[0][0]] || record.name || record.code;
  return <div className="modal-backdrop"><section className="modal delete-modal" role="dialog" aria-modal="true" aria-label="Delete entry"><header><h2>Delete entry</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header><div className="modal-body"><p>Delete “{label}” from {table.name}? This cannot be undone.</p><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" onClick={onDelete}>Delete</button></div></div></section></div>;
}

function ExportMenu({ table, onExport, disabled }) {
  const [open, setOpen] = useState(false);
  const formats = ['CSV', 'XLSX', 'PDF', 'DOCX'];
  return <div className="export-menu"><button className="button secondary" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)}><DownloadSimple /> Export <CaretDown /></button>{open && <div className="export-menu-popover" role="menu">{formats.map(format => <button key={format} role="menuitem" onClick={() => { setOpen(false); onExport(format.toLowerCase()); }}>{format}</button>)}</div>}</div>;
}

function ReferenceOverview({ tables, activeGroup, onOpen }) {
  const [query, setQuery] = useState('');
  const group = groups.find(item => item.id === activeGroup);
  const visible = tables.filter(table => table.group === activeGroup && `${table.name} ${table.description}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="reference-page"><div className="page-heading"><div><p className="breadcrumb">Core / Reference Tables / {group.label}</p><h1>{/Reference Tables$/.test(group.label) ? group.label : `${group.label} Reference Tables`}</h1><p className="page-description">{group.description}</p></div></div><SearchBox value={query} onChange={setQuery} placeholder={`Search ${group.label.toLowerCase()} tables...`} /><section className="reference-overview-card">{visible.map(table => { const activeCount = table.rows.filter(row => row.status !== 'Inactive').length; return <button key={table.id} onClick={() => onOpen(table)}><span><strong>{table.name}</strong><small>{activeCount} active value{activeCount === 1 ? '' : 's'} · {scopeLabel(table)}</small></span><CaretRight /></button>; })}{!visible.length && <div className="empty-state compact"><h3>No reference tables found</h3><p>Try another search term or category.</p></div>}</section></div>;
}

function ReferenceDetail({ table, updateTable, notify }) {
  const { isAdmin } = useRole();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('data');
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const uploadRef = useRef(null);
  const canAdd = isAdmin || table.scope === 'specific' || table.scope === 'hybrid';
  const canEdit = record => isAdmin || table.scope === 'specific' || (table.scope === 'hybrid' && record?.source === 'specific');
  const filteredRows = useMemo(() => table.rows.filter(row => Object.entries(row).filter(([key]) => key !== 'source').map(([, value]) => value).join(' ').toLowerCase().includes(query.toLowerCase())), [table.rows, query]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const first = filteredRows.length ? (safePage - 1) * pageSize + 1 : 0;
  const last = Math.min(safePage * pageSize, filteredRows.length);
  useEffect(() => { setPage(1); }, [query, pageSize, table.id]);

  const validate = draft => {
    if (!canAdd && !draft.id) return 'Client Admins can view generic reference tables but cannot add shared values.';
    if (draft.id && !canEdit(draft)) return 'This shared value is maintained by P&A Administration. Add a company-specific value instead.';
    const missing = table.columns.find(([key]) => !String(draft[key] ?? '').trim());
    if (missing) return `${missing[1]} is required.`;
    const uniqueKey = table.columns[0][0];
    const duplicate = table.rows.some(row => row.id !== draft.id && String(row[uniqueKey] ?? '').trim().toLowerCase() === String(draft[uniqueKey] ?? '').trim().toLowerCase());
    if (duplicate) return `${table.columns.find(([key]) => key === uniqueKey)?.[1] || uniqueKey} already exists.`;
    return '';
  };

  const save = draft => {
    const error = validate(draft);
    if (error) return error;
    const next = { ...draft, id: draft.id || `${table.id}-${Date.now()}`, ...(table.scope === 'hybrid' ? { source: draft.source || (isAdmin ? 'generic' : 'specific') } : {}) };
    const rows = draft.id ? table.rows.map(row => row.id === draft.id ? next : row) : [...table.rows, next];
    updateTable({ ...table, rows });
    setEditing(undefined);
    notify({ type: 'success', message: `${table.name} entry ${draft.id ? 'updated' : 'added'} successfully.` });
    return '';
  };

  const buildExport = format => {
    const headers = table.columns.map(([, label]) => label);
    const values = filteredRows.map(row => table.columns.map(([key]) => row[key] ?? ''));
    const csv = [headers, ...values].map(row => row.map(csvEscape).join(',')).join('\r\n');
    const extension = format === 'csv' ? 'csv' : format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'docx';
    const mime = format === 'csv' ? 'text/csv;charset=utf-8' : format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const content = format === 'csv' ? textEncoder.encode(csv) : format === 'xlsx' ? makeXlsx(table.name, headers, values) : format === 'pdf' ? makePdf(table.name, headers, values) : makeDocx(table.name, headers, values);
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement('a'); link.href = url; link.download = `${table.id}.${extension}`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
    notify({ type: 'success', message: `${table.name} ${format.toUpperCase()} export prepared with ${filteredRows.length} data row${filteredRows.length === 1 ? '' : 's'}.` });
  };

  const importRows = event => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!canAdd) { notify({ type: 'error', message: 'Client Admins cannot upload shared generic values.' }); event.target.value = ''; return; }
    const reader = new FileReader(); reader.onload = () => {
      const parsed = parseCSV(String(reader.result));
      const headers = parsed.shift()?.map(value => value.trim().toLowerCase()) || [];
      const lookup = Object.fromEntries(table.columns.flatMap(([key, label]) => [[key.toLowerCase(), key], [label.toLowerCase(), key]]));
      const source = table.scope === 'hybrid' && !isAdmin ? 'specific' : table.scope === 'hybrid' ? 'generic' : undefined;
      const imported = parsed.map((values, index) => { const row = { id: `${table.id}-import-${Date.now()}-${index}` }; headers.forEach((header, i) => { if (lookup[header]) row[lookup[header]] = values[i] ?? ''; }); if (table.scope === 'hybrid') row.source = source; return row; });
      const errors = imported.map(row => validate(row)).filter(Boolean);
      if (errors.length) notify({ type: 'error', message: errors[0] });
      else { updateTable({ ...table, rows: [...table.rows, ...imported] }); notify({ type: 'success', message: `${imported.length} ${table.name} entries imported.` }); }
    }; reader.readAsText(file); event.target.value = '';
  };

  return <div className="reference-page reference-detail-page"><div className="page-heading"><div><p className="breadcrumb">{groups.find(group => group.id === table.group)?.label} / {table.name}</p><h1>{table.name}</h1><p className="page-description">{table.description}</p></div></div><div className="reference-scope-note"><span><strong>{scopeLabel(table)}</strong>{table.scope === 'generic' ? (isAdmin ? ' Maintained by P&A Administration and shared across companies.' : ' View-only access for Client Admin.') : table.scope === 'hybrid' ? ' P&A Admin maintains shared defaults; Client Admin manages company-specific additions.' : ' P&A Admin and Client Admin can manage this company’s values.'}</span></div><nav className="reference-detail-tabs"><button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>Data</button><button className={tab === 'usage' ? 'active' : ''} onClick={() => setTab('usage')}>Usage</button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Audit Log</button></nav>
    {tab === 'data' && <><div className="reference-detail-toolbar"><SearchBox value={query} onChange={value => { setQuery(value); setPage(1); }} /><span className="toolbar-spacer" />{canAdd && <button className="button primary" onClick={() => setEditing(null)}><Plus /> Add</button>}<button className="button secondary" onClick={() => uploadRef.current?.click()} disabled={!canAdd}><UploadSimple /> Upload</button><ExportMenu table={table} onExport={buildExport} disabled={false} /><input ref={uploadRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={importRows} /></div><section className="reference-editor-card"><div className="reference-data-table"><table><thead><tr>{table.columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Action</th></tr></thead><tbody>{visibleRows.map(row => <tr key={row.id}>{table.columns.map(([key]) => <td key={key}>{row[key] || '—'}</td>)}<td><div className="row-actions always">{canEdit(row) && <><button onClick={() => setEditing(row)} aria-label="Edit"><PencilSimple /></button><button onClick={() => setDeleting(row)} aria-label="Delete"><Trash /></button></>}</div></td></tr>)}</tbody></table>{!filteredRows.length && <div className="empty-state compact"><h3>No entries found</h3><p>Try another search or export the column headers for a clean template.</p></div>}<div className="reference-pagination"><span>Displaying <strong>{first}-{last}</strong> of <strong>{filteredRows.length}</strong> items</span><label>Rows <select aria-label="Rows per page" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</select></label><div className="pagination-controls"><button aria-label="First page" disabled={safePage === 1} onClick={() => setPage(1)}>«</button><button aria-label="Previous page" disabled={safePage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>‹</button><label>Page <input aria-label="Page number" type="number" min="1" max={pageCount} value={safePage} onChange={event => setPage(Math.min(pageCount, Math.max(1, Number(event.target.value) || 1)))} /> of {pageCount}</label><button aria-label="Next page" disabled={safePage === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>›</button><button aria-label="Last page" disabled={safePage === pageCount} onClick={() => setPage(pageCount)}>»</button></div></div></div></section></>}
    {tab === 'usage' && <section className="reference-info-card"><h2>Used by Atlas</h2><p>This reference table is available to Employee Masterfile forms, company configuration, payroll allocation, statutory processing, and reporting filters. Updates apply to new selections while historical records retain their saved value.</p><div className="reference-usage-grid"><span>Employee Masterfile<strong>Synced</strong></span><span>Company Configuration<strong>Synced</strong></span><span>Payroll and Reports<strong>Synced</strong></span></div></section>}
    {tab === 'history' && <section className="reference-info-card"><h2>Audit Log</h2><div className="reference-audit-row"><span>10 Aug 2026 · John Doe</span><strong>Reference table reviewed</strong></div><div className="reference-audit-row"><span>09 Aug 2026 · System migration</span><strong>{table.rows.length} values loaded</strong></div></section>}
    {editing !== undefined && <EntryModal table={table} record={editing || null} isAdmin={isAdmin} onClose={() => setEditing(undefined)} onSave={save} />}{deleting && <DeleteModal table={table} record={deleting} onClose={() => setDeleting(null)} onDelete={() => { updateTable({ ...table, rows: table.rows.filter(item => item.id !== deleting.id) }); setDeleting(null); notify({ type: 'success', message: `${table.name} entry deleted.` }); }} />}
  </div>;
}

export function ReferenceTables({ onBack, onNavigate, notify, company, companies, onSelectCompany }) {
  const [tables, setTables] = useState(loadTables);
  const [activeGroup, setActiveGroup] = useState('generic');
  const [activeId, setActiveId] = useState(null);
  useEffect(() => localStorage.setItem('atlas-reference-tables-v4', JSON.stringify(tables)), [tables]);
  const activeTable = useMemo(() => tables.find(table => table.id === activeId), [activeId, tables]);
  const updateTable = next => setTables(previous => previous.map(table => table.id === next.id ? next : table));
  return <div className="app-shell reference-screen"><BrandRail onHome={onBack} onCore={onBack} onPayroll={() => onNavigate?.('payroll')} onSettings={() => onNavigate?.('settings')} active="core" /><ReferenceSidebar activeGroup={activeGroup} setActiveGroup={setActiveGroup} onBack={onBack} closeTable={() => setActiveId(null)} /><main className="reference-main"><Topbar company={company} companies={companies} onSelectCompany={onSelectCompany} /><div className="mobile-reference-navigation"><label htmlFor="mobile-reference-group">Reference table group</label><select id="mobile-reference-group" value={activeGroup} onChange={event => { setActiveGroup(event.target.value); setActiveId(null); }}>{groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></div>{activeTable ? <ReferenceDetail table={activeTable} updateTable={updateTable} notify={notify} /> : <ReferenceOverview tables={tables} activeGroup={activeGroup} onOpen={table => setActiveId(table.id)} />}</main></div>;
}
