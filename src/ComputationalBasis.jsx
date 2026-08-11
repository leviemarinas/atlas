import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CaretDown,
  Check,
  ClockCounterClockwise,
  DownloadSimple,
  Eye,
  FileCsv,
  FilePdf,
  Flask,
  Function,
  Lock,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Table,
  Trash,
  UploadSimple,
  X,
} from '@phosphor-icons/react';
import { downloadFile } from './fileDownload';
import { PolicyComputations, policyEngines } from './PolicyComputations';
import { PAYROLL_REFERENCE_CODES, synchronizePayrollReference } from './payrollIntegration';
import { useRole } from './RoleContext';

/**
 * Built-in standard formulas are maintained in Settings > Standard Computation
 * Library. Client-created computations stay company-specific, use only the
 * approved field/operator palette, and never overwrite an Atlas standard.
 */
export function canEditComputation(record, isAdmin) {
  return isAdmin || record.isBuiltIn === false;
}

const STORAGE = {
  computations: 'atlas-computational-basis-library-v3',
  assignments: 'atlas-computational-basis-assignments-v3',
  references: 'atlas-computational-basis-references-v3',
  history: 'atlas-computational-basis-history-v3',
};

export const COMPUTATION_STORAGE_KEY = STORAGE.computations;

export const fields = [
  ['basic_pay', 'Current basic pay', 30000],
  ['monthly_basic', 'Monthly basic pay', 30000],
  ['factor_days', 'Factor days', 261],
  ['work_hours', 'Hours per workday', 8],
  ['ecola_amount', 'ECOLA amount', 30],
  ['basic_pay_adjustment', 'Effective basic pay adjustment', 2500],
  ['days_worked', 'Days worked', 20],
  ['absent_days', 'Absent days', 1],
  ['late_minutes', 'Late minutes', 25],
  ['undertime_minutes', 'Undertime minutes', 40],
  ['ot_hours', 'Overtime hours', 6],
  ['ot_rate', 'Overtime multiplier', 1.25],
  ['holiday_hours', 'Holiday hours', 8],
  ['holiday_rate', 'Holiday multiplier', 2],
  ['allowance_units', 'Allowance units', 20],
  ['allowance_unit_rate', 'Allowance unit rate', 150],
  ['taxable_earnings', 'Taxable earnings', 4500],
  ['non_taxable_earnings', 'Non-taxable earnings', 2000],
  ['other_bonus', 'Other bonus', 12000],
  ['basic_earnings_ytd', 'Basic earnings YTD', 300000],
  ['statutory_deductions', 'Statutory deductions', 2500],
  ['other_deductions', 'Other deductions', 1200],
  ['loan_amortizations', 'Loan amortizations', 1800],
  ['tax_rate', 'Tax table rate', 0.2],
  ['tax_offset', 'Tax table offset', 2083.33],
  ['sss_rate', 'SSS employee rate', 0.05],
  ['sss_ceiling', 'SSS compensation ceiling', 35000],
  ['philhealth_rate', 'PhilHealth employee rate', 0.025],
  ['philhealth_ceiling', 'PhilHealth compensation ceiling', 100000],
  ['hdmf_rate', 'HDMF employee rate', 0.02],
  ['hdmf_ceiling', 'HDMF compensation ceiling', 10000],
  ['bonus_tax_ceiling', '13th month and bonus tax ceiling', 90000],
  ['bonus_paid_ytd', '13th month and bonuses paid YTD', 50000],
  ['de_minimis_ceiling', 'De Minimis annual ceiling', 24000],
  ['de_minimis_paid_ytd', 'De Minimis paid YTD', 12000],
  ['minimum_take_home_rate', 'Minimum take-home percentage', 0.2],
  ['take_home_base', 'Protected take-home basis', 34500],
  ['target_net_pay', 'Target net pay', 30000],
  ['years_service', 'Years of service', 8],
  ['forecasted_annual_income', 'Forecasted annual income', 720000],
  ['previous_employer_taxable', 'Previous-employer taxable income', 180000],
  ['previous_employer_tax_withheld', 'Previous-employer tax withheld', 18000],
  ['tax_schedule_periods', 'Remaining tax collection periods', 4],
  ['provident_rate', 'Provident fund rate', 0.05],
  ['pension_rate', 'Pension fund rate', 0.03],
  ['sickness_days', 'Approved sickness reimbursement days', 7],
  ['maternity_days', 'Approved maternity benefit days', 105],
  ['rounded_years_service', 'Rounded years of service', 8],
  ['retirement_days_per_year', 'Retirement days per service year', 22.5],
  ['retirement_company_value', 'Company retirement plan value', 300000],
  ['daily_rate', 'Daily rate', 1379.31],
  ['hourly_rate', 'Hourly rate', 172.41],
  ['piece_units', 'Completed piece-rate units', 120],
  ['piece_unit_rate', 'Piece rate per unit', 35],
  ['ojt_days', 'OJT days rendered', 20],
  ['ojt_daily_allowance', 'OJT daily allowance', 300],
  ['part_time_hours', 'Part-time hours rendered', 60],
  ['unused_leave_days', 'Unused leave days', 5],
  ['gross_pay', 'Gross pay', 36500],
  ['taxable_income', 'Taxable income', 34000],
  ['withholding_tax', 'Withholding tax', 4716.67],
];

const fieldMap = Object.fromEntries(fields.map(([code, label, sample]) => [code, { code, label, sample }]));

const coreComputations = [
  ['BAS-001', 'Daily Rate', 'Basic Pay', '{{monthly_basic}} * 12 / {{factor_days}}', 'Converts monthly basic pay to the company daily rate.'],
  ['BAS-002', 'Hourly Rate', 'Basic Pay', '{{daily_rate}} / {{work_hours}}', 'Derives the hourly rate from the daily rate and standard work hours.'],
  ['BAS-003', 'Minute Rate', 'Basic Pay', '{{hourly_rate}} / 60', 'Derives the per-minute rate for tardiness and undertime.'],
  ['BAS-004', 'Effective Pay Adjustment', 'Basic Pay', '{{basic_pay}} + {{basic_pay_adjustment}}', 'Applies an effective-dated basic pay adjustment within the selected payroll cutoff.'],
  ['MWE-001', 'MWE Pay with ECOLA', 'Basic Pay', '{{daily_rate}} * {{days_worked}} + {{ecola_amount}} * {{days_worked}}', 'Computes minimum wage pay together with the applicable daily ECOLA.'],
  ['ERN-001', 'Basic Pay for Period', 'Earnings', '{{monthly_basic}} / 2', 'Computes semi-monthly basic pay.'],
  ['ERN-002', 'Overtime Pay', 'Earnings', '{{hourly_rate}} * {{ot_hours}} * {{ot_rate}}', 'Computes overtime pay using the applicable premium multiplier.'],
  ['ERN-003', 'Night Differential', 'Earnings', '{{hourly_rate}} * {{ot_hours}} * 0.10', 'Computes night differential earnings.'],
  ['ERN-004', 'Variable Allowance Adjustment', 'Earnings', '{{taxable_earnings}} / {{days_worked}}', 'Adjusts a variable allowance using payroll attendance units.'],
  ['ERN-005', 'Variable Allowance by Unit', 'Earnings', '{{allowance_units}} * {{allowance_unit_rate}}', 'Computes variable allowance from uploaded or timekeeping-derived units.'],
  ['ERN-006', 'Holiday Premium Pay', 'Earnings', '{{hourly_rate}} * {{holiday_hours}} * {{holiday_rate}}', 'Computes holiday and rest-day premiums using the assigned reference rate.'],
  ['DED-001', 'Absence Deduction', 'Deductions', '{{daily_rate}} * {{absent_days}}', 'Computes the deduction for unpaid absences.'],
  ['DED-002', 'Tardiness Deduction', 'Deductions', '{{hourly_rate}} / 60 * {{late_minutes}}', 'Computes tardiness using the minute rate.'],
  ['DED-003', 'Undertime Deduction', 'Deductions', '{{hourly_rate}} / 60 * {{undertime_minutes}}', 'Computes undertime using the minute rate.'],
  ['THP-001', 'Minimum Take-Home Pay', 'Take-Home Pay', '{{take_home_base}} * {{minimum_take_home_rate}}', 'Computes the protected minimum using the assigned basic, gross, or gross-less-reimbursements basis.'],
  ['THP-002', 'Maximum Controllable Deductions', 'Take-Home Pay', 'MAX(0, {{gross_pay}} - {{statutory_deductions}} - {{take_home_base}} * {{minimum_take_home_rate}})', 'Calculates the amount available to controllable deductions after mandatory statutory items are applied in full.'],
  ['GOV-001', 'SSS Employee Contribution', 'Government', 'MIN({{monthly_basic}}, {{sss_ceiling}}) * {{sss_rate}}', 'Computes employee SSS contribution from the active statutory reference values.'],
  ['GOV-002', 'PhilHealth Employee Contribution', 'Government', 'MIN({{monthly_basic}}, {{philhealth_ceiling}}) * {{philhealth_rate}}', 'Computes the employee PhilHealth share.'],
  ['GOV-003', 'HDMF Employee Contribution', 'Government', 'MIN({{monthly_basic}}, {{hdmf_ceiling}}) * {{hdmf_rate}}', 'Computes the employee HDMF share.'],
  ['TAX-001', 'Taxable Income', 'Tax', '{{gross_pay}} - {{non_taxable_earnings}} - {{statutory_deductions}}', 'Determines taxable income before the withholding tax lookup.'],
  ['TAX-002', 'Withholding Tax', 'Tax', 'MAX(0, {{taxable_income}} * {{tax_rate}} - {{tax_offset}})', 'Computes withholding tax using mapped values from the active tax table.'],
  ['TAX-003', 'Gross Up', 'Tax', '{{taxable_income}} / (1 - {{tax_rate}})', 'Computes grossed-up income using the mapped tax rate.'],
  ['GUP-001', 'Target Net Gross Up', 'Tax', '{{target_net_pay}} / (1 - {{tax_rate}})', 'Back-solves gross taxable pay from the target net pay.'],
  ['TAX-004', 'Fringe Benefit Tax', 'Tax', '{{taxable_earnings}} / 0.65 * 0.35', 'Computes fringe benefit tax for taxable fringe benefits.'],
  ['TAX-005', 'Final Tax', 'Tax', '{{taxable_earnings}} * {{tax_rate}}', 'Computes final tax based on the assigned tax rate.'],
  ['TAX-006', 'Expanded Withholding Tax', 'Tax', '{{taxable_earnings}} * 0.02', 'Computes expanded withholding tax for configured pay items.'],
  ['TAX-008', 'Annualized Withholding Tax', 'Tax', 'MAX(0, ({{basic_earnings_ytd}} + {{taxable_earnings}}) * {{tax_rate}} - {{tax_offset}} - {{withholding_tax}})', 'Projects remaining annual tax from current and previous-employer year-to-date values.'],
  ['TAX-009', 'Tax Projection with Previous Employer', 'Tax', 'MAX(0, ({{forecasted_annual_income}} + {{previous_employer_taxable}}) * {{tax_rate}} - {{tax_offset}} - {{previous_employer_tax_withheld}})', 'Projects correct annual tax using the employee 2316 and previous-employer balances.'],
  ['TAX-010', 'Scheduled Projected Tax', 'Tax', 'MAX(0, ({{forecasted_annual_income}} + {{previous_employer_taxable}}) * {{tax_rate}} - {{tax_offset}} - {{previous_employer_tax_withheld}}) / {{tax_schedule_periods}}', 'Spreads projected tax across the configured remaining payroll periods or year-end collection.'],
  ['BON-001', 'Standard 13th Month Pay', 'Bonus', '{{basic_earnings_ytd}} / 12', 'Computes the standard thirteenth-month benefit.'],
  ['BON-002', 'Pro-rated 13th Month Pay', 'Bonus', '{{basic_earnings_ytd}} / 12', 'Computes pro-rated thirteenth-month pay from eligible earnings.'],
  ['BON-003', 'Taxable Bonus Excess', 'Bonus', 'MAX(0, {{other_bonus}} - {{bonus_tax_ceiling}})', 'Applies the single exemption ceiling across thirteenth-month pay and other bonuses.'],
  ['BON-004', 'Remaining Bonus Exemption', 'Bonus', 'MAX(0, {{bonus_tax_ceiling}} - {{bonus_paid_ytd}})', 'Tracks the remaining annual non-taxable bonus ceiling before taxable reclassification.'],
  ['DMN-001', 'Remaining De Minimis Ceiling', 'Benefits', 'MAX(0, {{de_minimis_ceiling}} - {{de_minimis_paid_ytd}})', 'Tracks the remaining annual ceiling for the assigned De Minimis benefit.'],
  ['RCL-001', 'Taxable De Minimis Excess', 'Tax', 'MAX(0, {{de_minimis_paid_ytd}} + {{non_taxable_earnings}} - {{de_minimis_ceiling}})', 'Reclassifies De Minimis amounts above the annual ceiling as taxable earnings.'],
  ['PAY-001', 'Gross Pay', 'Payroll Result', '{{basic_pay}} + {{taxable_earnings}} + {{non_taxable_earnings}} + {{other_bonus}}', 'Computes gross pay from the configured earning groups.'],
  ['PAY-002', 'Net Pay', 'Payroll Result', '{{gross_pay}} - {{withholding_tax}} - {{statutory_deductions}} - {{other_deductions}} - {{loan_amortizations}}', 'Computes net pay after taxes, deductions, and loan amortizations.'],
  ['YTD-001', 'YTD Taxable Earnings', 'Year to Date', '{{taxable_earnings}} + {{basic_earnings_ytd}}', 'Accumulates taxable earnings for the year.'],
  ['RET-001', 'Statutory Retirement Benefit', 'Retirement', '{{daily_rate}} * {{retirement_days_per_year}} * {{rounded_years_service}}', 'Computes the RA 7641 statutory retirement benefit basis using the configured divisor, 22.5-day equivalent, and six-month rounding rule.'],
  ['RET-002', 'More Beneficial Retirement Benefit', 'Retirement', 'MAX({{daily_rate}} * {{retirement_days_per_year}} * {{rounded_years_service}}, {{retirement_company_value}})', 'Selects the higher qualifying value between the statutory and company retirement plans.'],
  ['FIN-001', 'Unused Leave Conversion', 'Separation', '{{daily_rate}} * {{unused_leave_days}}', 'Computes unused leave conversion for final pay using the assigned daily rate.'],
  ['BEN-001', 'Maternity Benefit Reimbursement', 'Benefits', '{{daily_rate}} * {{maternity_days}}', 'Computes the standard maternity benefit reimbursement basis.'],
  ['BEN-002', 'Provident Fund Contribution', 'Benefits', '{{monthly_basic}} * {{provident_rate}}', 'Computes the configured government-backed provident fund contribution.'],
  ['BEN-003', 'Pension Fund Contribution', 'Benefits', '{{monthly_basic}} * {{pension_rate}}', 'Computes the configured employer or government pension contribution.'],
  ['BEN-004', 'SSS Sickness Reimbursement', 'Benefits', '{{daily_rate}} * {{sickness_days}}', 'Computes the sickness reimbursement basis from approved benefit days.'],
  ['BEN-005', 'Expanded Maternity Reimbursement', 'Benefits', '{{daily_rate}} * {{maternity_days}}', 'Computes expanded maternity benefit reimbursement from approved days.'],
  ['INC-001', 'Commission', 'Incentives', '{{taxable_earnings}} * 0.05', 'Computes commission using the configured eligible earnings.'],
  ['PCE-001', 'Piece Rate', 'Incentives', '{{piece_units}} * {{piece_unit_rate}}', 'Computes piece-rate earnings using completed units and the configured unit rate.'],
  ['OJT-001', 'OJT Allowance', 'Incentives', '{{ojt_days}} * {{ojt_daily_allowance}}', 'Computes OJT allowance from eligible rendered days.'],
  ['PRT-001', 'Part-Time Pay', 'Incentives', '{{part_time_hours}} * {{hourly_rate}}', 'Computes part-time pay from approved hours and the assigned hourly rate.'],
];

export const categoryCycle = ['Basic Pay', 'Earnings', 'Deductions', 'Government', 'Tax', 'Bonus', 'Year to Date', 'Benefits', 'Take-Home Pay', 'Retirement', 'Payroll Result', 'Separation', 'Incentives'];

export function seedComputations() {
  const known = coreComputations.map((item, index) => ({
    id: index + 1,
    code: item[0],
    name: item[1],
    category: item[2],
    expression: item[3],
    description: item[4],
    status: 'Active',
    isBuiltIn: true,
    version: '1.0',
    effectiveDate: '2026-01-01',
    updatedBy: index % 4 === 0 ? 'P&A Admin' : 'System Standard',
    updatedAt: index % 4 === 0 ? 'Aug 8, 2026' : 'Jan 1, 2026',
  }));
  const generated = Array.from({ length: 219 - known.length }, (_, index) => {
    const number = index + known.length + 1;
    const category = categoryCycle[index % categoryCycle.length];
    return {
      id: number,
      code: `STD-${String(number).padStart(3, '0')}`,
      name: `${category} Standard Computation ${String(index + 1).padStart(3, '0')}`,
      category,
      expression: '{{basic_pay}}',
      description: `Standard ${category.toLowerCase()} computation included in the controlled Atlas library.`,
      status: index % 17 === 0 ? 'Inactive' : 'Active',
      isBuiltIn: true,
      version: '1.0',
      effectiveDate: '2026-01-01',
      updatedBy: 'System Standard',
      updatedAt: 'Jan 1, 2026',
    };
  });
  return [...known, ...generated];
}

const initialAssignments = [
  { id: 1, type: 'Government deduction', table: 'SSS Contribution Table 2026', computationCode: 'GOV-001', employeeGroup: 'All Employees', frequency: 'Every payroll', status: 'Active' },
  { id: 2, type: 'Government deduction', table: 'PhilHealth Contribution Table 2026', computationCode: 'GOV-002', employeeGroup: 'All Employees', frequency: 'Every payroll', status: 'Active' },
  { id: 3, type: 'Government deduction', table: 'HDMF Contribution Table 2026', computationCode: 'GOV-003', employeeGroup: 'All Employees', frequency: 'Every payroll', status: 'Active' },
  { id: 4, type: 'Tax computation', table: 'BIR Withholding Tax Table 2026', computationCode: 'TAX-002', employeeGroup: 'Monthly', frequency: 'Every payroll', status: 'Active' },
  { id: 5, type: 'Take-home protection', table: 'Deduction and Loan Hierarchy', computationCode: 'THP-001', employeeGroup: 'All Employees', frequency: 'Every payroll', status: 'Active' },
  { id: 6, type: 'Retirement benefit', table: 'Employee Groups', computationCode: 'RET-002', employeeGroup: 'All Employees', frequency: 'On retirement', status: 'Active' },
];

function refRows(type) {
  // BRD row 47 keeps the deduction/loan adjustment order in a reference table.
  // `note` carries "Group · Classification"; `value` is the rank (0 = never adjusted).
  if (type === 'hierarchy') return [
    { id: 1, key: 'Statutory deductions', value: '0', note: 'Statutory · Never adjusted' },
    { id: 2, key: 'HMO', value: '1', note: 'Loan · Company-mandated' },
    { id: 3, key: 'Educational Loan', value: '2', note: 'Loan · Company-mandated' },
    { id: 4, key: 'Salary Loan', value: '3', note: 'Loan · Company-mandated' },
    { id: 5, key: 'SSS Salary Loan', value: '4', note: 'Loan · Government' },
    { id: 6, key: 'HDMF Salary Loan', value: '5', note: 'Loan · Government' },
    { id: 7, key: 'SSS Calamity Loan', value: '6', note: 'Loan · Government' },
    { id: 8, key: 'Optional deductions', value: '7', note: 'Deduction · Optional' },
    { id: 9, key: 'Lates, Absences & Undertime', value: '8', note: 'Deduction · Attendance' },
  ];
  if (type === 'rate') return [
    { id: 1, key: 'Employee rate', value: '5.00%', note: 'Effective January 2025' },
    { id: 2, key: 'Employer rate', value: '10.00%', note: 'Effective January 2025' },
    { id: 3, key: 'Compensation ceiling', value: '35,000.00', note: 'Monthly compensation' },
  ];
  if (type === 'tax') return [
    { id: 1, key: '0.00 - 20,833.00', value: '0%', note: 'No withholding tax' },
    { id: 2, key: '20,833.01 - 33,332.00', value: '15% of excess', note: 'Monthly bracket' },
    { id: 3, key: '33,332.01 - 66,666.00', value: '1,875 + 20%', note: 'Monthly bracket' },
  ];
  return [
    { id: 1, key: 'Default', value: 'Enabled', note: 'Company standard' },
    { id: 2, key: 'Special case', value: 'By assignment', note: 'Requires employee group mapping' },
  ];
}

const referenceSeeds = [
  ['REF-001', 'BIR Withholding Tax Table 2026', 'Tax', 'tax'],
  ['REF-002', 'SSS Contribution Table 2026', 'Linked Statutory', 'rate'],
  ['REF-003', 'PhilHealth Contribution Table 2026', 'Linked Statutory', 'rate'],
  ['REF-004', 'HDMF Contribution Table 2026', 'Linked Statutory', 'rate'],
  ['REF-005', 'Minimum Wage Table', 'Payroll', 'default'],
  ['REF-006', 'De Minimis Ceiling', 'Tax', 'default'],
  ['REF-007', 'Bonus Tax Exemption Ceiling', 'Tax', 'default'],
  ['REF-008', 'Overtime Premium Rates', 'Earnings', 'rate'],
  ['REF-009', 'Holiday Premium Rates', 'Earnings', 'rate'],
  ['REF-010', 'Factor Days', 'Basic Pay', 'default'],
  ['REF-011', 'Deduction and Loan Hierarchy', 'Deductions', 'hierarchy'],
  ['REF-012', 'Minimum Take Home Pay', 'Deductions', 'default'],
  ['REF-013', 'Bank Codes', 'Accounting', 'default'],
  ['REF-014', 'General Ledger Mapping', 'Accounting', 'default'],
  ['REF-015', 'Departments', 'Organization', 'default'],
  ['REF-016', 'Positions', 'Organization', 'default'],
  ['REF-017', 'Locations', 'Organization', 'default'],
  ['REF-018', 'Employee Groups', 'Organization', 'default'],
  ['REF-019', 'Earnings and Allowance Codes', 'Payroll', 'default'],
  ['REF-020', 'Bonus Codes and Priority', 'Payroll', 'default'],
  ['REF-021', 'De Minimis Benefit Types', 'Tax', 'default'],
  ['REF-022', 'Deduction Codes', 'Deductions', 'default'],
  ['REF-023', 'Loan Types', 'Deductions', 'default'],
  ['REF-024', 'Holiday Calendar and Types', 'Time', 'default'],
  ['REF-025', 'Shift and Work Schedule Codes', 'Time', 'default'],
  ['REF-026', 'Leave Types and Conversion Rules', 'Leave', 'default'],
  ['REF-027', 'Currency and Exchange Rates', 'Payroll', 'rate'],
  ['REF-028', 'Cost Centers and Allocation Dimensions', 'Accounting', 'default'],
  ['REF-029', 'Payment Frequencies and Payroll Periods', 'Payroll', 'default'],
  ['REF-030', 'Separation Reasons and Final Pay Treatments', 'Separation', 'default'],
];

function seedReferences() {
  return referenceSeeds.map((row, index) => ({
    id: index + 1,
    code: row[0],
    name: row[1],
    category: row[2],
    version: index < 4 ? '2026.1' : '1.0',
    effectiveDate: index < 4 ? '2026-01-01' : '2025-01-01',
    enabled: index !== 16,
    entries: refRows(row[3]),
  }));
}

const initialHistory = [
  { id: 1, item: 'BIR Withholding Tax Table 2026', type: 'Reference table', action: 'Version uploaded', version: '2026.1', user: 'P&A Admin', date: 'Aug 8, 2026 · 3:42 PM' },
  { id: 2, item: 'Minimum Take Home Pay', type: 'Computation', action: 'Formula updated', version: '1.1', user: 'Client Admin', date: 'Aug 8, 2026 · 2:17 PM' },
  { id: 3, item: 'SSS Employee Contribution', type: 'Computation', action: 'Test calculation passed', version: '1.0', user: 'P&A Admin', date: 'Aug 7, 2026 · 11:05 AM' },
  { id: 4, item: 'Locations', type: 'Reference table', action: 'Disabled for company', version: '1.0', user: 'Client Admin', date: 'Aug 6, 2026 · 4:20 PM' },
];

function readStored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

function readReferenceLibrary() {
  const seeds = seedReferences();
  const stored = readStored(STORAGE.references, seeds);
  if (!Array.isArray(stored)) return seeds;
  const reconciled = seeds.map(seed => ({ ...seed, ...(stored.find(item => item.code === seed.code) || {}) }));
  const custom = stored.filter(item => !seeds.some(seed => seed.code === item.code));
  return [...reconciled, ...custom].map(reference => ({
    ...reference,
    entries: synchronizePayrollReference(reference.code, reference.entries),
  }));
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { values.push(value.trim()); value = ''; }
    else value += character;
  }
  values.push(value.trim());
  return values;
}

function exportCsv(filename, rows, columns) {
  const csv = [columns.map(([, label]) => csvCell(label)).join(','), ...rows.map(row => columns.map(([key]) => csvCell(row[key])).join(','))].join('\n');
  downloadFile(filename, csv, 'text/csv');
}

function printReport(title, rows, columns) {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) return false;
  const body = rows.map(row => `<tr>${columns.map(([key]) => `<td>${String(row[key] ?? '')}</td>`).join('')}</tr>`).join('');
  popup.document.write(`<html><head><title>${title}</title><style>body{font-family:Arial;padding:24px;color:#332d38}h1{color:#54248f}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#f3edf9}</style></head><body><h1>${title}</h1><p>ABC Company Ltd · Generated ${new Date().toLocaleString()}</p><table><thead><tr>${columns.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
  popup.document.close();
  return true;
}

function lexExpression(expression) {
  const cleaned = expression.replace(/\s+/g, '');
  const matches = cleaned.match(/\{\{[a-z0-9_]+\}\}|\d+(?:\.\d+)?|MAX|MIN|ROUND|[()+\-*/,]/gi) || [];
  if (matches.join('').toUpperCase() !== cleaned.toUpperCase()) throw new Error('Only mapped fields, numbers, parentheses, and available operators are allowed.');
  return matches;
}

export function evaluateExpression(expression, values) {
  const tokens = lexExpression(expression);
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const parsePrimary = () => {
    const token = take();
    if (token === undefined) throw new Error('The formula is incomplete.');
    if (token === '(') {
      const value = parseSum();
      if (take() !== ')') throw new Error('A closing parenthesis is missing.');
      return value;
    }
    if (token === '-') return -parsePrimary();
    if (/^(MAX|MIN|ROUND)$/i.test(token)) {
      if (take() !== '(') throw new Error(`${token.toUpperCase()} needs parentheses.`);
      const first = parseSum();
      let second;
      if (peek() === ',') { take(); second = parseSum(); }
      if (take() !== ')') throw new Error(`${token.toUpperCase()} is incomplete.`);
      if (/^MAX$/i.test(token)) return Math.max(first, second);
      if (/^MIN$/i.test(token)) return Math.min(first, second);
      return Math.round(first);
    }
    if (/^\{\{/.test(token)) {
      const code = token.slice(2, -2);
      if (!(code in values)) throw new Error(`No test value is mapped for ${code}.`);
      return Number(values[code]) || 0;
    }
    if (/^\d/.test(token)) return Number(token);
    throw new Error(`Unexpected token ${token}.`);
  };
  const parseProduct = () => {
    let value = parsePrimary();
    while (peek() === '*' || peek() === '/') {
      const operator = take();
      const next = parsePrimary();
      if (operator === '/' && next === 0) throw new Error('Division by zero is not allowed.');
      value = operator === '*' ? value * next : value / next;
    }
    return value;
  };
  const parseSum = () => {
    let value = parseProduct();
    while (peek() === '+' || peek() === '-') {
      const operator = take();
      const next = parseProduct();
      value = operator === '+' ? value + next : value - next;
    }
    return value;
  };
  const result = parseSum();
  if (position !== tokens.length) throw new Error(`Unexpected token ${peek()}.`);
  if (!Number.isFinite(result)) throw new Error('The formula did not produce a valid number.');
  return result;
}

function usedFields(expression) {
  return [...new Set([...expression.matchAll(/\{\{([a-z0-9_]+)\}\}/gi)].map(match => match[1]))];
}

function Modal({ title, onClose, children, className = '' }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
      {children}
    </section>
  </div>;
}

function ReportMenu({ onCsv, onPdf }) {
  const [open, setOpen] = useState(false);
  return <div className="menu-anchor">
    <button className="button secondary" onClick={() => setOpen(value => !value)}><DownloadSimple /> Download report <CaretDown /></button>
    {open && <div className="export-menu">
      <button onClick={() => { onCsv(); setOpen(false); }}><FileCsv /> Excel / CSV</button>
      <button onClick={() => { onPdf(); setOpen(false); }}><FilePdf /> PDF / Print</button>
    </div>}
  </div>;
}

function SummaryCards({ computations, references, assignments }) {
  const active = computations.filter(item => item.status === 'Active').length;
  return <section className="basis-summary" aria-label="Computational Basis summary">
    <div><Function weight="duotone" /><span><strong>{computations.length}</strong><small>governed computations</small></span></div>
    <div><Table weight="duotone" /><span><strong>{references.length}</strong><small>formula reference sources</small></span></div>
    <div><Check weight="bold" /><span><strong>{active}</strong><small>active computations</small></span></div>
    <div><ClockCounterClockwise weight="duotone" /><span><strong>{assignments.length}</strong><small>client assignments</small></span></div>
  </section>;
}

function FormulaEditor({ record, onClose, onSave, onTestHistory }) {
  const isCreating = record.isNew === true;
  const [draft, setDraft] = useState({ ...record });
  const [tab, setTab] = useState('formula');
  const [fieldCode, setFieldCode] = useState(fields[0][0]);
  const [testValues, setTestValues] = useState(() => Object.fromEntries(fields.map(([code, , sample]) => [code, sample])));
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');
  const [changeNote, setChangeNote] = useState('Updated through the Computational Basis workspace.');
  const append = token => setDraft(previous => ({ ...previous, expression: `${previous.expression}${previous.expression && !/[ (]$/.test(previous.expression) ? ' ' : ''}${token}` }));
  const runTest = () => {
    try {
      const value = evaluateExpression(draft.expression, testValues);
      setTestResult(value);
      setError('');
      onTestHistory?.(draft, value);
    } catch (testError) {
      setTestResult(null);
      setError(testError.message);
    }
  };
  const submit = event => {
    event.preventDefault();
    try {
      evaluateExpression(draft.expression, testValues);
      onSave({ ...draft, changeNote });
    } catch (saveError) { setError(saveError.message); setTab('formula'); }
  };
  const mapped = usedFields(draft.expression);
  return <Modal title={isCreating ? 'Create company computation' : `Edit computation · ${record.code}`} onClose={onClose} className="basis-editor-modal">
    <form onSubmit={submit}>
      <div className="basis-editor-tabs">
        <button type="button" className={tab === 'formula' ? 'active' : ''} onClick={() => setTab('formula')}>Formula setup</button>
        <button type="button" className={tab === 'test' ? 'active' : ''} onClick={() => setTab('test')}>Test calculation</button>
        <button type="button" className={tab === 'change' ? 'active' : ''} onClick={() => setTab('change')}>Change details</button>
      </div>
      <div className="basis-editor-body">
        {tab === 'formula' && <>
          <div className="basis-form-grid">
            <label>Computation code<input value={draft.code} disabled={!isCreating} onChange={event => setDraft({ ...draft, code: event.target.value.toUpperCase() })} placeholder="e.g. CUS-001" required /></label>
            <label>Computation name<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required /></label>
            <label>Category<select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>{categoryCycle.map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option>Active</option><option>Inactive</option></select></label>
            <label className="wide">Description<textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} required /></label>
          </div>
          <section className="formula-builder">
            <div className="formula-builder-heading"><div><h3>Expression builder</h3><p>Build a company calculation from approved payroll fields and operators. Atlas validates the expression before it can be saved.</p></div><span className="version-chip">{isCreating ? 'Company-defined' : `Version ${draft.version}`}</span></div>
            <textarea className="formula-expression" value={draft.expression} onChange={event => setDraft({ ...draft, expression: event.target.value })} aria-label="Formula expression" required />
            <div className="formula-insert-row">
              <select value={fieldCode} onChange={event => setFieldCode(event.target.value)}>{fields.map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select>
              <button type="button" className="button secondary" onClick={() => append(`{{${fieldCode}}}`)}><Plus /> Insert field</button>
              <div className="operator-palette" aria-label="Available operators">{['+', '−', '×', '÷', '(', ')', 'MIN(', 'MAX('].map(operator => <button type="button" key={operator} onClick={() => append(operator.replace('−', '-').replace('×', '*').replace('÷', '/'))}>{operator}</button>)}</div>
            </div>
            <div className="mapping-table-wrap">
              <table className="mapping-table"><thead><tr><th>Mapped field</th><th>Atlas source</th><th>Sample value</th></tr></thead><tbody>
                {mapped.map(code => <tr key={code}><td><code>{`{{${code}}}`}</code></td><td>{fieldMap[code]?.label || 'Unrecognized field'}</td><td>{fieldMap[code]?.sample?.toLocaleString?.() ?? '—'}</td></tr>)}
              </tbody></table>
            </div>
          </section>
        </>}
        {tab === 'test' && <div className="test-workspace">
          <div className="test-copy"><Flask weight="duotone" /><div><h3>Test calculation</h3><p>Run the draft formula with controlled values before saving it.</p></div></div>
          <div className="test-input-grid">{mapped.map(code => <label key={code}>{fieldMap[code]?.label || code}<input type="number" step="any" value={testValues[code] ?? 0} onChange={event => setTestValues({ ...testValues, [code]: event.target.value })} /></label>)}</div>
          <div className="test-result-row"><button type="button" className="button primary" onClick={runTest}><Flask /> Run test</button>{testResult !== null && <div className="test-result passed"><Check weight="bold" /><span><small>Formula passed</small><strong>₱ {testResult.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span></div>}</div>
        </div>}
        {tab === 'change' && <div className="change-workspace">
          <h3>Change details</h3><p>Saving creates a new controlled version and records the change in history.</p>
          <label>Effective date<input type="date" value={draft.effectiveDate} onChange={event => setDraft({ ...draft, effectiveDate: event.target.value })} required /></label>
          <label>Change note<textarea value={changeNote} onChange={event => setChangeNote(event.target.value)} required /></label>
          <div className="change-summary"><span>{isCreating ? 'Initial version' : 'Current version'} <strong>{isCreating ? '1.0' : draft.version}</strong></span><span>{isCreating ? 'Ownership' : 'Next version'} <strong>{isCreating ? 'Company' : (Number(draft.version) + 0.1).toFixed(1)}</strong></span><span>{isCreating ? 'Created by' : 'Changed by'} <strong>Client Admin</strong></span></div>
        </div>}
        {error && <div className="basis-error">{error}</div>}
      </div>
      <div className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{isCreating ? 'Validate and create' : 'Validate and save'}</button></div>
    </form>
  </Modal>;
}

function ComputationDrawer({ record, onClose, onEdit, canEdit }) {
  const mapped = usedFields(record.expression);
  let result = null;
  try { result = evaluateExpression(record.expression, Object.fromEntries(fields.map(([code, , sample]) => [code, sample]))); } catch { /* validated on edit */ }
  return <div className="modal-backdrop view-drawer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="record-drawer basis-record-drawer" role="dialog" aria-modal="true" aria-label={record.name}>
      <header><div><p>{record.code} · Version {record.version}</p><h2>{record.name}</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>
      <div className="record-drawer-body">
        <section><div className="detail-grid"><div><strong>Category</strong><span>{record.category}</span></div><div><strong>Source</strong><span className={`computation-source ${record.isBuiltIn !== false ? 'built-in' : 'admin-defined'}`}><Function weight="duotone" />{record.isBuiltIn !== false ? 'Built-in standard' : 'Admin-defined'}</span></div><div><strong>Status</strong><span className={`status-pill ${record.status.toLowerCase()}`}>{record.status}</span></div><div><strong>Effective date</strong><span>{record.effectiveDate}</span></div><div><strong>Updated by</strong><span>{record.updatedBy}</span></div></div></section>
        <section><h3>Description</h3><p className="drawer-paragraph">{record.description}</p></section>
        <section><h3>Formula expression</h3><div className="formula-preview">{record.expression}</div></section>
        <section><h3>Mapped fields</h3><div className="mapped-chip-list">{mapped.map(code => <span key={code}>{fieldMap[code]?.label || code}</span>)}</div></section>
        <section><h3>Standard test result</h3><div className="drawer-test"><Check weight="bold" /><span><small>Passed using sample values</small><strong>₱ {result?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'}</strong></span></div></section>
      </div>
      <footer><button className="button secondary" onClick={onClose}>Close</button>{canEdit
        ? <button className="button primary" onClick={() => onEdit(record)}><PencilSimple /> Edit computation</button>
        : <span className="drawer-lock-note"><Lock weight="duotone" /> Built-in formula — edit in Settings › Standard Computation Library</span>}</footer>
    </aside>
  </div>;
}

function AssignmentModal({ record, computations, references, onClose, onSave }) {
  const enabledReferences = references.filter(item => item.enabled);
  const [draft, setDraft] = useState(record || { type: 'Government deduction', table: enabledReferences[0]?.name, computationCode: 'GOV-001', employeeGroup: 'All Employees', frequency: 'Every payroll', status: 'Active' });
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  return <Modal title={record ? 'Edit computation assignment' : 'Add computation assignment'} onClose={onClose} className="assignment-modal">
    <form onSubmit={event => { event.preventDefault(); onSave(draft); }}>
      <div className="modal-body basis-form-grid">
        <label>Assignment type<select value={draft.type} onChange={event => update('type', event.target.value)}><option>Government deduction</option><option>Tax computation</option><option>Bonus computation</option><option>Earnings computation</option><option>Take-home protection</option><option>Retirement benefit</option></select></label>
        <label>Reference table<select value={draft.table} onChange={event => update('table', event.target.value)}>{enabledReferences.map(item => <option key={item.id}>{item.name}</option>)}</select></label>
        <label className="wide">Basis of computation<select value={draft.computationCode} onChange={event => update('computationCode', event.target.value)}>{computations.filter(item => item.status === 'Active').map(item => <option value={item.code} key={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label>Employee group<select value={draft.employeeGroup} onChange={event => update('employeeGroup', event.target.value)}><option>All Employees</option><option>Monthly</option><option>Rank and File</option><option>Managers</option><option>Retirement Eligible</option></select></label>
        <label>Frequency<select value={draft.frequency} onChange={event => update('frequency', event.target.value)}><option>Every payroll</option><option>Monthly</option><option>Quarterly</option><option>Annually</option><option>On retirement</option></select></label>
        <label>Status<select value={draft.status} onChange={event => update('status', event.target.value)}><option>Active</option><option>Inactive</option></select></label>
      </div>
      <div className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Save assignment</button></div>
    </form>
  </Modal>;
}

function ReferenceEditor({ table: reference, onClose, onSave, onExport }) {
  const [draft, setDraft] = useState({ ...reference, entries: reference.entries.map(item => ({ ...item })) });
  const [newEntry, setNewEntry] = useState({ key: '', value: '', note: '' });
  const payrollDerived = [PAYROLL_REFERENCE_CODES.deductions, PAYROLL_REFERENCE_CODES.loans].includes(reference.code);
  const hierarchy = reference.code === PAYROLL_REFERENCE_CODES.hierarchy;
  const hierarchyRanks = hierarchy ? draft.entries.filter(item => !/statutory/i.test(item.key)).map(item => Number(item.value)) : [];
  const hierarchyError = hierarchy && (hierarchyRanks.some(rank => !Number.isInteger(rank) || rank < 1) || new Set(hierarchyRanks).size !== hierarchyRanks.length);
  const updateEntry = (id, key, value) => setDraft(previous => ({ ...previous, entries: previous.entries.map(item => item.id === id ? { ...item, [key]: value } : item) }));
  const removeEntry = id => setDraft(previous => ({ ...previous, entries: previous.entries.filter(item => item.id !== id) }));
  const addEntry = () => {
    if (!newEntry.key.trim() || !newEntry.value.trim()) return;
    setDraft(previous => ({ ...previous, entries: [...previous.entries, { ...newEntry, id: Math.max(0, ...previous.entries.map(item => item.id)) + 1 }] }));
    setNewEntry({ key: '', value: '', note: '' });
  };
  return <Modal title={`Manage reference table · ${reference.name}`} onClose={onClose} className="reference-modal">
    <div className="reference-modal-body">
      <div className="reference-meta">
        <span><small>Code</small><strong>{draft.code}</strong></span><span><small>Version</small><strong>{draft.version}</strong></span><span><small>Effective</small><strong>{draft.effectiveDate}</strong></span>
        <button className={`switch ${draft.enabled ? 'on' : ''}`} onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}><span /></button>
      </div>
      {(payrollDerived || hierarchy) && <div className="linked-reference-note"><Lock weight="duotone" /><span>{hierarchy ? 'Item codes and classifications come from the active Deduction and Loan modules. Only the adjustment rank is maintained here.' : 'This source is generated from active module definitions. Edit the originating Deduction or Loan module instead of duplicating values here.'}</span></div>}
      {hierarchyError && <div className="warning-copy">Each adjustable item needs a unique whole-number rank of 1 or greater.</div>}
      <div className="reference-entry-table"><table><thead><tr><th>Key / Range</th><th>{hierarchy ? 'Adjustment rank' : 'Value'}</th><th>Notes / source</th><th>Action</th></tr></thead><tbody>
        {draft.entries.map(item => <tr key={item.id}><td><input value={item.key} readOnly={payrollDerived || hierarchy} onChange={event => updateEntry(item.id, 'key', event.target.value)} /></td><td><input value={item.value} readOnly={payrollDerived || (hierarchy && /statutory/i.test(item.key))} onChange={event => updateEntry(item.id, 'value', event.target.value)} /></td><td><input value={item.note} readOnly={payrollDerived || hierarchy} onChange={event => updateEntry(item.id, 'note', event.target.value)} /></td><td>{payrollDerived || hierarchy ? <Lock /> : <button className="text-danger" onClick={() => removeEntry(item.id)}>Remove</button>}</td></tr>)}
        {!payrollDerived && !hierarchy && <tr className="new-reference-row"><td><input value={newEntry.key} onChange={event => setNewEntry({ ...newEntry, key: event.target.value })} placeholder="New key or range" /></td><td><input value={newEntry.value} onChange={event => setNewEntry({ ...newEntry, value: event.target.value })} placeholder="Value" /></td><td><input value={newEntry.note} onChange={event => setNewEntry({ ...newEntry, note: event.target.value })} placeholder="Optional note" /></td><td><button className="button secondary small" onClick={addEntry}><Plus /> Add</button></td></tr>}
      </tbody></table></div>
    </div>
    <div className="modal-actions sticky-actions"><button className="button secondary" onClick={() => onExport(draft)}><DownloadSimple /> Download CSV</button><span className="toolbar-spacer" /><button className="button secondary" onClick={onClose}>{payrollDerived ? 'Close' : 'Cancel'}</button>{!payrollDerived && <button className="button primary" disabled={hierarchyError} onClick={() => onSave(draft)}>Save table</button>}</div>
  </Modal>;
}

export function ComputationalBasis({ onBack, onOpenStatutory, onOpenService, notify, initialTab = 'computations' }) {
  const { isAdmin } = useRole();
  const [computations, setComputations] = useState(() => readStored(STORAGE.computations, seedComputations()).map(item => ({ ...item, isBuiltIn: item.isBuiltIn !== false })));
  const [assignments, setAssignments] = useState(() => readStored(STORAGE.assignments, initialAssignments));
  const [references, setReferences] = useState(readReferenceLibrary);
  const [history, setHistory] = useState(() => readStored(STORAGE.history, initialHistory));
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [status, setStatus] = useState('All statuses');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [assignmentEditing, setAssignmentEditing] = useState(undefined);
  const [referenceEditing, setReferenceEditing] = useState(null);
  const computationUploadRef = useRef(null);
  const referenceUploadRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null);
  const pageSize = 10;

  useEffect(() => localStorage.setItem(STORAGE.computations, JSON.stringify(computations)), [computations]);
  useEffect(() => localStorage.setItem(STORAGE.assignments, JSON.stringify(assignments)), [assignments]);
  useEffect(() => localStorage.setItem(STORAGE.references, JSON.stringify(references)), [references]);
  useEffect(() => localStorage.setItem(STORAGE.history, JSON.stringify(history)), [history]);

  const addHistory = entry => setHistory(previous => [{ id: Date.now(), user: 'Client Admin', date: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }), ...entry }, ...previous]);
  const filteredComputations = useMemo(() => computations.filter(item => {
    const matchQuery = `${item.code} ${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase());
    const matchCategory = category === 'All categories' || item.category === category;
    const matchStatus = status === 'All statuses' || item.status === status;
    return matchQuery && matchCategory && matchStatus;
  }), [computations, query, category, status]);
  const pages = Math.max(1, Math.ceil(filteredComputations.length / pageSize));
  const visibleComputations = filteredComputations.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [query, category, status, tab]);

  const saveComputation = draft => {
    if (!canEditComputation(draft, isAdmin)) {
      notify({ type: 'error', message: `${draft.code} is a built-in formula. Edit it in Settings › Standard Computation Library.` });
      return;
    }
    const normalizedCode = draft.code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{1,7}-\d{3}$/.test(normalizedCode)) {
      notify({ type: 'error', message: 'Use a unique code such as CUS-001 (letters, then a three-digit number).' });
      return;
    }
    if (computations.some(item => item.code === normalizedCode && item.id !== draft.id)) {
      notify({ type: 'error', message: `${normalizedCode} already exists. Choose a unique computation code.` });
      return;
    }
    if (draft.isNew) {
      const saved = {
        ...draft,
        id: Math.max(0, ...computations.map(item => Number(item.id) || 0)) + 1,
        code: normalizedCode,
        isBuiltIn: false,
        version: '1.0',
        updatedBy: isAdmin ? 'P&A Admin' : 'Client Admin',
        updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      };
      delete saved.isNew;
      delete saved.changeNote;
      setComputations(previous => [saved, ...previous]);
      addHistory({ item: saved.name, type: 'Computation', action: draft.changeNote || 'Company computation created', version: '1.0' });
      setEditing(null);
      notify({ type: 'success', message: `${saved.code} was validated and added to company computations.` });
      return;
    }
    const version = (Number(draft.version) + 0.1).toFixed(1);
    const saved = { ...draft, version, updatedBy: isAdmin ? 'P&A Admin' : 'Client Admin', updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) };
    delete saved.changeNote;
    setComputations(previous => previous.map(item => item.id === saved.id ? saved : item));
    addHistory({ item: saved.name, type: 'Computation', action: draft.changeNote || 'Formula updated', version });
    setEditing(null);
    notify({ type: 'success', message: `${saved.code} was validated and saved as version ${version}.` });
  };

  const createComputation = () => {
    let sequence = 1;
    while (computations.some(item => item.code === `CUS-${String(sequence).padStart(3, '0')}`)) sequence += 1;
    setEditing({
      id: null,
      code: `CUS-${String(sequence).padStart(3, '0')}`,
      name: '',
      category: 'Payroll Result',
      expression: '',
      description: '',
      status: 'Active',
      isBuiltIn: false,
      isNew: true,
      version: '0.0',
      effectiveDate: new Date().toISOString().slice(0, 10),
      updatedBy: isAdmin ? 'P&A Admin' : 'Client Admin',
      updatedAt: 'Not saved',
    });
  };

  const deleteComputation = record => {
    if (record.isBuiltIn !== false) return;
    if (assignments.some(item => item.computationCode === record.code)) {
      notify({ type: 'error', message: `${record.code} is assigned to an employee group. Remove that assignment before deleting it.` });
      return;
    }
    setDeleting(record);
  };

  const confirmDeleteComputation = () => {
    if (!deleting) return;
    const record = deleting;
    setComputations(previous => previous.filter(item => item.id !== record.id));
    addHistory({ item: record.name, type: 'Computation', action: `${record.code} company computation deleted`, version: record.version });
    setDeleting(null);
    notify({ type: 'success', message: `${record.code} was removed from company computations.` });
  };

  const saveAssignment = draft => {
    if (draft.id) setAssignments(previous => previous.map(item => item.id === draft.id ? draft : item));
    else setAssignments(previous => [{ ...draft, id: Math.max(0, ...previous.map(item => item.id)) + 1 }, ...previous]);
    addHistory({ item: `${draft.type} · ${draft.employeeGroup}`, type: 'Assignment', action: draft.id ? 'Assignment updated' : 'Assignment created', version: '—' });
    setAssignmentEditing(undefined);
    notify({ type: 'success', message: `Computation assignment ${draft.id ? 'updated' : 'added'} successfully.` });
  };

  const saveReference = draft => {
    const version = (Number.parseFloat(draft.version) + 0.1).toFixed(1);
    const saved = { ...draft, version };
    setReferences(previous => previous.map(item => item.id === saved.id ? saved : item));
    addHistory({ item: saved.name, type: 'Reference table', action: 'Entries edited', version });
    setReferenceEditing(null);
    notify({ type: 'success', message: `${saved.name} saved as version ${version}.` });
  };

  const updateComputationList = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      const headers = parseCsvLine(lines.shift() || '').map(value => value.trim().toLowerCase());
      const codeIndex = headers.indexOf('code');
      const expressionIndex = headers.indexOf('expression');
      if (codeIndex < 0 || expressionIndex < 0) { notify({ type: 'error', message: 'Use the Atlas template with Code and Expression columns.' }); return; }
      let updated = 0;
      let skipped = 0;
      let locked = 0;
      const incoming = new Map(lines.map(line => {
        const values = parseCsvLine(line);
        return [values[codeIndex], values];
      }));
      setComputations(previous => previous.map(item => {
        const values = incoming.get(item.code);
        if (!values) return item;
        if (!canEditComputation(item, isAdmin)) { locked += 1; return item; }
        try { evaluateExpression(values[expressionIndex], Object.fromEntries(fields.map(([code, , sample]) => [code, sample]))); } catch { skipped += 1; return item; }
        updated += 1;
        return { ...item, expression: values[expressionIndex], version: (Number(item.version) + 0.1).toFixed(1), updatedBy: isAdmin ? 'P&A Admin' : 'Client Admin', updatedAt: new Date().toLocaleDateString('en-US') };
      }));
      const lockedNote = locked ? ` ${locked} built-in formulas were left unchanged.` : '';
      addHistory({ item: file.name, type: 'Computation', action: `Bulk update · ${updated} matched, ${skipped} invalid, ${locked} locked`, version: 'Multiple' });
      notify({ type: updated ? 'success' : 'error', message: updated ? `${updated} computations updated. ${skipped} invalid rows skipped.${lockedNote}` : `No computations were updated.${lockedNote}` });
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const uploadReferenceVersion = event => {
    const file = event.target.files?.[0];
    if (!file || !uploadTarget) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { notify({ type: 'error', message: 'The reference file needs a header and at least one row.' }); return; }
      const entries = lines.slice(1).map((line, index) => {
        const [key = '', value = '', note = ''] = parseCsvLine(line);
        return { id: index + 1, key, value, note };
      }).filter(item => item.key && item.value);
      if (!entries.length) { notify({ type: 'error', message: 'No valid Key and Value rows were found.' }); return; }
      const version = (Number.parseFloat(uploadTarget.version) + 0.1).toFixed(1);
      setReferences(previous => previous.map(item => item.id === uploadTarget.id ? { ...item, entries, version, effectiveDate: new Date().toISOString().slice(0, 10) } : item));
      addHistory({ item: uploadTarget.name, type: 'Reference table', action: `Version uploaded from ${file.name}`, version });
      setUploadTarget(null);
      notify({ type: 'success', message: `${uploadTarget.name} version ${version} uploaded with ${entries.length} rows.` });
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const toggleReference = reference => {
    setReferences(previous => previous.map(item => item.id === reference.id ? { ...item, enabled: !item.enabled } : item));
    addHistory({ item: reference.name, type: 'Reference table', action: `${reference.enabled ? 'Disabled' : 'Enabled'} for company`, version: reference.version });
    notify({ type: 'success', message: `${reference.name} ${reference.enabled ? 'disabled' : 'enabled'} for ABC Company Ltd.` });
  };

  const computationColumns = [['code', 'Code'], ['name', 'Computation'], ['category', 'Category'], ['expression', 'Formula'], ['version', 'Version'], ['status', 'Status']];
  const assignmentColumns = [['type', 'Assignment Type'], ['table', 'Reference Table'], ['computationCode', 'Computation'], ['employeeGroup', 'Employee Group'], ['frequency', 'Frequency'], ['status', 'Status']];
  const referenceColumns = [['code', 'Code'], ['name', 'Reference Table'], ['category', 'Category'], ['version', 'Version'], ['effectiveDate', 'Effective Date']];

  return <div className="page-content computational-page">
    <button className="inline-back" onClick={onBack}><ArrowLeft /> Services Information</button>
    <div className="page-heading basis-heading"><div><p className="breadcrumb">Company Information / Services Information / Computational Basis</p><h1>Computational Basis</h1><p className="page-description">Manage Atlas standard formulas, client assignments, policy scenarios, and linked reference sources used by automatic payroll calculation.</p></div><span className="controlled-badge"><Check weight="bold" /> Controlled standard library</span></div>
    <SummaryCards computations={computations} references={references} assignments={assignments} />
    <div className="basis-tabs" role="tablist">
      <button className={tab === 'computations' ? 'active' : ''} onClick={() => setTab('computations')}>Computations <span>{computations.length}</span></button>
      <button className={tab === 'assignments' ? 'active' : ''} onClick={() => setTab('assignments')}>Client assignments <span>{assignments.length}</span></button>
      <button className={tab === 'policies' ? 'active' : ''} onClick={() => setTab('policies')}>Policy engines <span>{policyEngines.length}</span></button>
      <button className={tab === 'references' ? 'active' : ''} onClick={() => setTab('references')}>Reference sources <span>{references.length}</span></button>
      <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Change history</button>
    </div>

    {tab === 'computations' && <>
      <div className="config-toolbar basis-toolbar">
        <div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search code, computation, or description..." /><MagnifyingGlass /></div>
        <select className="compact-select" value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{[...new Set(computations.map(item => item.category))].map(value => <option key={value}>{value}</option>)}</select>
        <select className="compact-select" value={status} onChange={event => setStatus(event.target.value)}><option>All statuses</option><option>Active</option><option>Inactive</option></select>
        <div className="toolbar-spacer" />
        <div className="basis-toolbar-actions"><button className="button primary" onClick={createComputation}><Plus /> Create computation</button>
          <button className="button secondary" onClick={() => computationUploadRef.current?.click()}><UploadSimple /> Import CSV</button>
          <input ref={computationUploadRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={updateComputationList} />
          <ReportMenu onCsv={() => { exportCsv('atlas-computational-basis.csv', filteredComputations, computationColumns); notify({ type: 'success', message: 'Computational Basis CSV report downloaded.' }); }} onPdf={() => { printReport('Atlas Computational Basis', filteredComputations, computationColumns); notify({ type: 'success', message: 'Computational Basis print report prepared.' }); }} /></div>
      </div>
      <div className="library-notice">{isAdmin ? <Function weight="duotone" /> : <Lock weight="duotone" />}<span>{isAdmin
        ? <><strong>P&amp;A Admin view — every formula is editable.</strong> Changes here update the controlled library for this company and are recorded in Change history.</>
        : <><strong>Built-in formulas are read-only; company calculations are editable here.</strong> Create a governed computation with the approved field and operator palette, then assign it to the applicable employee group.</>}</span></div>
      <div className="table-card config-table-card basis-table-card"><table className="config-table basis-table"><thead><tr><th>Code</th><th>Type</th><th>Computation</th><th>Category</th><th>Formula</th><th>Version</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {visibleComputations.map(item => <tr key={item.id}><td><strong>{item.code}</strong></td><td><span className={`computation-source ${item.isBuiltIn !== false ? 'built-in' : 'admin-defined'}`} title={item.isBuiltIn !== false ? 'Built-in standard computation' : 'Admin-defined computation'}><Function weight="duotone" />{item.isBuiltIn !== false ? 'Built-in' : 'Admin-defined'}</span></td><td><div className="table-title-cell"><strong>{item.name}</strong><small>Updated {item.updatedAt} by {item.updatedBy}</small></div></td><td>{item.category}</td><td><code className="table-formula">{item.expression}</code></td><td>{item.version}</td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></td><td><div className="row-actions always"><button onClick={() => setViewing(item)} aria-label={`View ${item.name}`}><Eye /></button>{canEditComputation(item, isAdmin)
          ? <><button onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}><PencilSimple /></button>{item.isBuiltIn === false && <button onClick={() => deleteComputation(item)} aria-label={`Delete ${item.name}`}><Trash /></button>}</>
          : <span className="row-lock" title="Built-in formula — edit in Settings › Standard Computation Library"><Lock weight="duotone" /></span>}</div></td></tr>)}
      </tbody></table></div>
      <div className="pagination"><span>Displaying <strong>{visibleComputations.length}</strong> of {filteredComputations.length} computations</span><div><button disabled={page === 1} onClick={() => setPage(1)}>«</button><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>‹</button><strong>{page}</strong><span>of {pages}</span><button disabled={page === pages} onClick={() => setPage(value => value + 1)}>›</button><button disabled={page === pages} onClick={() => setPage(pages)}>»</button></div></div>
    </>}

    {tab === 'assignments' && <>
      <div className="config-toolbar basis-toolbar"><div className="workspace-copy"><h2>Client computation assignments</h2><p>Connect a standard computation and reference table to an employee group and payroll frequency.</p></div><div className="toolbar-spacer" /><button className="button primary" onClick={() => setAssignmentEditing(null)}><Plus /> Add assignment</button><ReportMenu onCsv={() => exportCsv('atlas-computation-assignments.csv', assignments, assignmentColumns)} onPdf={() => printReport('Atlas Computation Assignments', assignments, assignmentColumns)} /></div>
      <div className="table-card config-table-card"><table className="config-table"><thead><tr><th>Assignment type</th><th>Reference table</th><th>Basis of computation</th><th>Employee group</th><th>Frequency</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {assignments.map(item => <tr key={item.id}><td>{item.type}</td><td>{item.table}</td><td><strong>{item.computationCode}</strong><small className="block-caption">{computations.find(record => record.code === item.computationCode)?.name}</small></td><td>{item.employeeGroup}</td><td>{item.frequency}</td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></td><td><div className="row-actions always"><button onClick={() => setAssignmentEditing(item)} aria-label="Edit assignment"><PencilSimple /></button></div></td></tr>)}
      </tbody></table></div>
    </>}

    {tab === 'policies' && <PolicyComputations notify={notify} addHistory={addHistory} references={references} onManageHierarchy={() => setTab('references')} onOpenService={onOpenService} />}

    {tab === 'references' && <>
      <div className="config-toolbar basis-toolbar"><div className="workspace-copy"><h2>Formula reference sources</h2><p>Maintain formula reference sources. Statutory contribution versions are linked here but managed in Settings, then consumed read-only in Payroll.</p></div><div className="toolbar-spacer" /><ReportMenu onCsv={() => exportCsv('atlas-reference-tables.csv', references.map(item => ({ ...item, enabled: item.enabled ? 'Enabled' : 'Disabled' })), [...referenceColumns, ['enabled', 'Company Status']])} onPdf={() => printReport('Atlas Reference Tables', references.map(item => ({ ...item, enabled: item.enabled ? 'Enabled' : 'Disabled' })), [...referenceColumns, ['enabled', 'Company Status']])} /></div>
      <input ref={referenceUploadRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={uploadReferenceVersion} />
      <div className="reference-grid">{references.map(item => <article className="reference-card" key={item.id}>
        <header><span className="reference-icon"><Table weight="duotone" /></span><button className={`switch ${item.enabled ? 'on' : ''}`} onClick={() => toggleReference(item)} aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`}><span /></button></header>
        <div><small>{item.code} · {item.category}</small><h3>{item.name}</h3><p>{item.entries.length} configured rows</p></div>
        <dl><div><dt>Version</dt><dd>{item.version}</dd></div><div><dt>Effective</dt><dd>{item.effectiveDate}</dd></div><div><dt>Company</dt><dd className={item.enabled ? 'enabled-copy' : 'disabled-copy'}>{item.enabled ? 'Enabled' : 'Disabled'}</dd></div></dl>
        <footer>{item.category === 'Linked Statutory' ? <button onClick={onOpenStatutory}><Table /> Manage in Settings</button> : <><button onClick={() => setReferenceEditing(item)}><PencilSimple /> Manage</button><button onClick={() => { setUploadTarget(item); window.setTimeout(() => referenceUploadRef.current?.click(), 0); }}><UploadSimple /> Upload version</button></>}</footer>
      </article>)}</div>
    </>}

    {tab === 'history' && <>
      <div className="config-toolbar basis-toolbar"><div className="workspace-copy"><h2>Change history</h2><p>Review formula edits, table versions, tests, and client enablement changes.</p></div><div className="toolbar-spacer" /><ReportMenu onCsv={() => exportCsv('atlas-computational-basis-history.csv', history, [['date', 'Date'], ['item', 'Item'], ['type', 'Type'], ['action', 'Action'], ['version', 'Version'], ['user', 'User']])} onPdf={() => printReport('Atlas Computational Basis Change History', history, [['date', 'Date'], ['item', 'Item'], ['type', 'Type'], ['action', 'Action'], ['version', 'Version'], ['user', 'User']])} /></div>
      <div className="history-list">{history.map(item => <article key={item.id}><span className="history-dot"><ClockCounterClockwise /></span><div><header><strong>{item.item}</strong><span>{item.type}</span></header><p>{item.action}</p><small>{item.date} · {item.user} · Version {item.version}</small></div></article>)}</div>
    </>}

    {editing && <FormulaEditor record={editing} onClose={() => setEditing(null)} onSave={saveComputation} onTestHistory={(draft) => addHistory({ item: draft.name, type: 'Computation', action: 'Test calculation passed', version: draft.version })} />}
    {deleting && <Modal title="Delete company computation" onClose={() => setDeleting(null)} className="delete-computation-modal"><div className="modal-body"><p>Delete <strong>{deleting.code} · {deleting.name}</strong> from this company’s computation library?</p><small>It will no longer be available for new assignments. Atlas standard computations are not affected.</small></div><div className="modal-actions"><button className="button secondary" onClick={() => setDeleting(null)}>Cancel</button><button className="button danger" onClick={confirmDeleteComputation}><Trash /> Delete computation</button></div></Modal>}
    {viewing && <ComputationDrawer record={viewing} canEdit={canEditComputation(viewing, isAdmin)} onClose={() => setViewing(null)} onEdit={record => { setViewing(null); setEditing(record); }} />}
    {assignmentEditing !== undefined && <AssignmentModal record={assignmentEditing} computations={computations} references={references} onClose={() => setAssignmentEditing(undefined)} onSave={saveAssignment} />}
    {referenceEditing && <ReferenceEditor table={referenceEditing} onClose={() => setReferenceEditing(null)} onSave={saveReference} onExport={table => exportCsv(`${table.code.toLowerCase()}-${table.version}.csv`, table.entries, [['key', 'Key'], ['value', 'Value'], ['note', 'Note']])} />}
  </div>;
}
