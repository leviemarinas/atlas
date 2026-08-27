/**
 * The controlled computation library (Computational Basis).
 *
 * Formula codes, the mapped field palette and the expression evaluator live
 * here as plain data and pure functions, because more than one module needs
 * them: `ComputationalBasis.jsx` renders and edits the library, and
 * `payrollEngine.js` resolves and evaluates the very same formulas when it
 * computes a payroll line. Keeping one definition is what makes the code a
 * payroll step prints (`BAS-001`, `TAX-002`, …) provably the code the library
 * publishes, rather than a label copied into calculation code.
 */

export const FIELD_OWNERS = Object.freeze([
  'Employee Masterfile',
  'Payroll Transaction',
  'Timekeeping',
  'HRM Benefits',
  'Company Configuration',
  'Reference Source',
  'Statutory Reference',
  'Policy Engine',
  'Another Computation',
  'System-generated',
  'External API',
]);

export const MISSING_VALUE_BEHAVIOURS = Object.freeze([
  'Treat as zero',
  'Required — block payroll',
  'Use default',
  'Use latest available value',
  'Not applicable',
]);

/**
 * The approved field palette, with the metadata a payroll reviewer needs to
 * know where a runtime value comes from and what happens when it is absent.
 *
 *   [code, label, sample, owner, dataType, unit, timing, missingBehaviour]
 *
 * `owner` answers "which module produces this at run time" — the question the
 * meeting kept returning to. `missingBehaviour` is what the engine does when
 * the owning module supplies nothing: a value that may legitimately be absent
 * is treated as zero, one payroll cannot be computed without blocks the run.
 */
const fieldCatalog = [
  ['basic_pay', 'Current basic pay', 30000, 'Employee Masterfile', 'Currency', '₱', 'Effective on payout date', 'Required — block payroll'],
  ['monthly_basic', 'Monthly basic pay', 30000, 'Employee Masterfile', 'Currency', '₱', 'Effective on payout date', 'Required — block payroll'],
  ['factor_days', 'Factor days', 261, 'Company Configuration', 'Decimal', 'days per year', 'Static — configured', 'Use default'],
  ['work_hours', 'Hours per workday', 8, 'Company Configuration', 'Decimal', 'hours', 'Static — configured', 'Use default'],
  ['ecola_amount', 'ECOLA amount', 30, 'Reference Source', 'Currency', '₱ per day', 'Effective on payout date', 'Treat as zero'],
  ['basic_pay_adjustment', 'Effective basic pay adjustment', 2500, 'Employee Masterfile', 'Currency', '₱', 'Per payroll cutoff', 'Treat as zero'],
  ['days_worked', 'Days worked', 20, 'Timekeeping', 'Decimal', 'days', 'Per timekeeping cutoff', 'Required — block payroll'],
  ['absent_days', 'Absent days', 1, 'Timekeeping', 'Decimal', 'days', 'Per timekeeping cutoff', 'Treat as zero'],
  ['late_minutes', 'Late minutes', 25, 'Timekeeping', 'Integer', 'minutes', 'Per timekeeping cutoff', 'Treat as zero'],
  ['undertime_minutes', 'Undertime minutes', 40, 'Timekeeping', 'Integer', 'minutes', 'Per timekeeping cutoff', 'Treat as zero'],
  ['ot_hours', 'Overtime hours', 6, 'Timekeeping', 'Decimal', 'hours', 'Per timekeeping cutoff', 'Treat as zero'],
  ['ot_rate', 'Overtime multiplier', 1.25, 'Reference Source', 'Rate', 'multiplier', 'Effective on payout date', 'Use default'],
  ['holiday_hours', 'Holiday hours', 8, 'Timekeeping', 'Decimal', 'hours', 'Per timekeeping cutoff', 'Treat as zero'],
  ['holiday_rate', 'Holiday multiplier', 2, 'Reference Source', 'Rate', 'multiplier', 'Effective on payout date', 'Use default'],
  ['allowance_units', 'Allowance units', 20, 'Payroll Transaction', 'Decimal', 'units', 'Per payroll cutoff', 'Treat as zero'],
  ['allowance_unit_rate', 'Allowance unit rate', 150, 'Employee Masterfile', 'Currency', '₱ per unit', 'Effective on payout date', 'Required — block payroll'],
  ['taxable_earnings', 'Taxable earnings', 4500, 'Payroll Transaction', 'Currency', '₱', 'Computed in this run', 'Treat as zero'],
  ['non_taxable_earnings', 'Non-taxable earnings', 2000, 'Payroll Transaction', 'Currency', '₱', 'Computed in this run', 'Treat as zero'],
  ['other_bonus', 'Other bonus', 12000, 'Payroll Transaction', 'Currency', '₱', 'Per payroll cutoff', 'Treat as zero'],
  ['basic_earnings_ytd', 'Basic earnings YTD', 300000, 'Payroll Transaction', 'Currency', '₱', 'Year to date', 'Use latest available value'],
  ['statutory_deductions', 'Statutory deductions', 2500, 'Another Computation', 'Currency', '₱', 'Computed in this run', 'Treat as zero'],
  ['other_deductions', 'Other deductions', 1200, 'Payroll Transaction', 'Currency', '₱', 'Per payroll cutoff', 'Treat as zero'],
  ['loan_amortizations', 'Loan amortizations', 1800, 'Payroll Transaction', 'Currency', '₱', 'Per payroll cutoff', 'Treat as zero'],
  ['tax_rate', 'Tax table rate', 0.2, 'Statutory Reference', 'Rate', 'decimal rate', 'Effective on payout date', 'Required — block payroll'],
  ['tax_offset', 'Tax table offset', 2083.33, 'Statutory Reference', 'Currency', '₱', 'Effective on payout date', 'Required — block payroll'],
  ['sss_rate', 'SSS employee rate', 0.05, 'Statutory Reference', 'Rate', 'decimal rate', 'Effective on payout date', 'Required — block payroll'],
  ['sss_ceiling', 'SSS compensation ceiling', 35000, 'Statutory Reference', 'Currency', '₱', 'Effective on payout date', 'Required — block payroll'],
  ['philhealth_rate', 'PhilHealth employee rate', 0.025, 'Statutory Reference', 'Rate', 'decimal rate', 'Effective on payout date', 'Required — block payroll'],
  ['philhealth_ceiling', 'PhilHealth compensation ceiling', 100000, 'Statutory Reference', 'Currency', '₱', 'Effective on payout date', 'Required — block payroll'],
  ['hdmf_rate', 'HDMF employee rate', 0.02, 'Statutory Reference', 'Rate', 'decimal rate', 'Effective on payout date', 'Required — block payroll'],
  ['hdmf_ceiling', 'HDMF compensation ceiling', 10000, 'Statutory Reference', 'Currency', '₱', 'Effective on payout date', 'Required — block payroll'],
  ['bonus_tax_ceiling', '13th month and bonus tax ceiling', 90000, 'Reference Source', 'Currency', '₱', 'Effective on payout date', 'Use default'],
  ['bonus_paid_ytd', '13th month and bonuses paid YTD', 50000, 'Payroll Transaction', 'Currency', '₱', 'Year to date', 'Treat as zero'],
  ['de_minimis_ceiling', 'De Minimis annual ceiling', 24000, 'Statutory Reference', 'Currency', '₱', 'Effective on payout date', 'Use default'],
  ['de_minimis_paid_ytd', 'De Minimis paid YTD', 12000, 'Payroll Transaction', 'Currency', '₱', 'Year to date', 'Treat as zero'],
  ['minimum_take_home_rate', 'Minimum take-home percentage', 0.2, 'Policy Engine', 'Rate', 'decimal rate', 'Static — configured', 'Use default'],
  ['take_home_base', 'Protected take-home basis', 34500, 'Another Computation', 'Currency', '₱', 'Computed in this run', 'Treat as zero'],
  ['target_net_pay', 'Target net pay', 30000, 'Payroll Transaction', 'Currency', '₱', 'Per payroll cutoff', 'Not applicable'],
  ['years_service', 'Years of service', 8, 'Employee Masterfile', 'Decimal', 'years', 'Effective on payout date', 'Required — block payroll'],
  ['forecasted_annual_income', 'Forecasted annual income', 720000, 'Another Computation', 'Currency', '₱', 'Computed in this run', 'Treat as zero'],
  ['previous_employer_taxable', 'Previous-employer taxable income', 180000, 'Employee Masterfile', 'Currency', '₱', 'Year to date', 'Treat as zero'],
  ['previous_employer_tax_withheld', 'Previous-employer tax withheld', 18000, 'Employee Masterfile', 'Currency', '₱', 'Year to date', 'Treat as zero'],
  ['tax_schedule_periods', 'Remaining tax collection periods', 4, 'Payroll Transaction', 'Integer', 'periods', 'Per payroll cutoff', 'Use default'],
  ['provident_rate', 'Provident fund rate', 0.05, 'Reference Source', 'Rate', 'decimal rate', 'Static — configured', 'Use default'],
  ['pension_rate', 'Pension fund rate', 0.03, 'Reference Source', 'Rate', 'decimal rate', 'Static — configured', 'Use default'],
  ['sickness_days', 'Approved sickness reimbursement days', 7, 'HRM Benefits', 'Decimal', 'days', 'Per payroll cutoff', 'Treat as zero'],
  ['maternity_days', 'Approved maternity benefit days', 105, 'HRM Benefits', 'Decimal', 'days', 'Per payroll cutoff', 'Treat as zero'],
  ['rounded_years_service', 'Rounded years of service', 8, 'System-generated', 'Decimal', 'years', 'Computed in this run', 'Required — block payroll'],
  ['retirement_days_per_year', 'Retirement days per service year', 22.5, 'Reference Source', 'Decimal', 'days per year', 'Static — configured', 'Use default'],
  ['retirement_company_value', 'Company retirement plan value', 300000, 'Employee Masterfile', 'Currency', '₱', 'Effective on payout date', 'Treat as zero'],
  ['daily_rate', 'Daily rate', 1379.31, 'Another Computation', 'Currency', '₱', 'Computed in this run', 'Required — block payroll'],
  ['hourly_rate', 'Hourly rate', 172.41, 'Another Computation', 'Currency', '₱', 'Computed in this run', 'Required — block payroll'],
  ['piece_units', 'Completed piece-rate units', 120, 'Timekeeping', 'Decimal', 'units', 'Per timekeeping cutoff', 'Treat as zero'],
  ['piece_unit_rate', 'Piece rate per unit', 35, 'Employee Masterfile', 'Currency', '₱ per unit', 'Effective on payout date', 'Required — block payroll'],
  ['ojt_days', 'OJT days rendered', 20, 'Timekeeping', 'Decimal', 'days', 'Per timekeeping cutoff', 'Treat as zero'],
  ['ojt_daily_allowance', 'OJT daily allowance', 300, 'Employee Masterfile', 'Currency', '₱ per day', 'Effective on payout date', 'Required — block payroll'],
  ['part_time_hours', 'Part-time hours rendered', 60, 'Timekeeping', 'Decimal', 'hours', 'Per timekeeping cutoff', 'Treat as zero'],
  ['unused_leave_days', 'Unused leave days', 5, 'HRM Benefits', 'Decimal', 'days', 'Effective on payout date', 'Treat as zero'],
  ['gross_pay', 'Gross pay', 36500, 'Another Computation', 'Currency', '₱', 'Computed in this run', 'Required — block payroll'],
  ['taxable_income', 'Taxable income', 34000, 'Another Computation', 'Currency', '₱', 'Computed in this run', 'Required — block payroll'],
  ['withholding_tax', 'Withholding tax', 4716.67, 'Another Computation', 'Currency', '₱', 'Computed in this run', 'Required — block payroll'],
];

/**
 * `fields` stays a `[code, label, sample]` tuple list because every caller that
 * builds a sample-value palette destructures it that way. The metadata is
 * reached through `fieldMap`, which is what the Map Fields table renders.
 */
export const fields = fieldCatalog.map(([code, label, sample]) => [code, label, sample]);

export const fieldMap = Object.fromEntries(fieldCatalog.map(
  ([code, label, sample, owner, dataType, unit, timing, missingBehaviour]) =>
    [code, { code, label, sample, owner, dataType, unit, timing, missingBehaviour }]));

/**
 * Where a mapped token gets its runtime value — for a referenced computation
 * code as well as an approved field, so the Map Fields table can describe every
 * row it shows rather than only the field rows.
 */
export function fieldOrigin(code) {
  const field = fieldMap[code];
  if (field) return field;
  if (isComputationToken(code)) return {
    code,
    label: code,
    owner: 'Another Computation',
    dataType: 'Currency',
    unit: '₱',
    timing: 'Computed in this run',
    missingBehaviour: 'Required — block payroll',
  };
  return null;
}

export const coreComputations = [
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


/**
 * Categories and the code prefix each one generates.
 *
 * This is the seed for the `computation-category` reference table; the screens
 * read the controlled table so a category can be governed without a code
 * change, and fall back to this list when the table has not been seeded yet.
 * The prefixes are the ones the published library already uses (`ERN-002`,
 * `DED-001`, `BON-003`), so a generated code sorts and reads beside the
 * standards rather than beside a `CUS-00n` that says nothing about the record.
 */
export const categoryPrefixes = [
  ['Basic Pay', 'BAS'],
  ['Earnings', 'ERN'],
  ['Deductions', 'DED'],
  ['Government', 'GOV'],
  ['Tax', 'TAX'],
  ['Bonus', 'BON'],
  ['Year to Date', 'YTD'],
  ['Benefits', 'BEN'],
  ['Take-Home Pay', 'THP'],
  ['Retirement', 'RET'],
  ['Payroll Result', 'PAY'],
  ['Separation', 'FIN'],
  ['Incentives', 'INC'],
];

export const categoryCycle = categoryPrefixes.map(([category]) => category);

/** The code prefix a category generates. Unknown categories fall back to CUS. */
export function prefixForCategory(category, catalogue = categoryPrefixes) {
  return catalogue.find(([name]) => name === category)?.[1] || 'CUS';
}

/**
 * The next free code for a category, following the agreed naming convention:
 * the category's prefix, then the first three-digit sequence no record in the
 * library already holds. The code is generated once and locked after save, so
 * it never renumbers when the category changes later.
 */
export function nextComputationCode(category, library = [], catalogue = categoryPrefixes) {
  const prefix = prefixForCategory(category, catalogue);
  const used = new Set(library.map(item => String(item.code || '').toUpperCase()));
  let sequence = 1;
  while (used.has(`${prefix}-${String(sequence).padStart(3, '0')}`)) sequence += 1;
  return `${prefix}-${String(sequence).padStart(3, '0')}`;
}

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

/**
 * A `{{token}}` is either an approved field (`monthly_basic`) or another
 * computation's code (`BAS-001`). Codes carry a hyphen and a numeric suffix,
 * which is what tells the two apart everywhere below.
 */
export function isComputationToken(code) {
  return /^[a-z]{2,5}-\d{2,4}$/i.test(String(code || ''));
}

function lexExpression(expression) {
  const cleaned = expression.replace(/\s+/g, '');
  const matches = cleaned.match(/\{\{[a-z0-9_-]+\}\}|\d+(?:\.\d+)?|MAX|MIN|ROUND|[()+\-*/,]/gi) || [];
  if (matches.join('').toUpperCase() !== cleaned.toUpperCase()) throw new Error('Only mapped fields, published computations, numbers, parentheses, and available operators are allowed.');
  return matches;
}

/**
 * Evaluate an expression.
 *
 * `options.library` lets a `{{BAS-001}}` token resolve to that computation's
 * own result, so a formula can build on a published one instead of repeating
 * its arithmetic. `options.trail` carries the codes already being resolved, so
 * a reference that loops back on itself is reported rather than hanging.
 *
 * A value supplied in `values` always wins, which is how the test tab can pin a
 * referenced computation to a chosen figure.
 */
export function evaluateExpression(expression, values, options = {}) {
  const { library = null, trail = [] } = options;
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
      if (code in values) return Number(values[code]) || 0;
      if (isComputationToken(code)) {
        const referenced = computationByCode(code.toUpperCase(), library || []);
        if (!referenced) throw new Error(`${code.toUpperCase()} is not a published computation.`);
        if (trail.includes(referenced.code)) throw new Error(`${referenced.code} refers back to itself through ${trail.join(' → ')}.`);
        return evaluateExpression(referenced.expression, values, { library, trail: [...trail, referenced.code] });
      }
      throw new Error(`No test value is mapped for ${code}.`);
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


function allTokens(expression) {
  return [...new Set([...String(expression || '').matchAll(/\{\{([a-z0-9_-]+)\}\}/gi)].map(match => match[1]))];
}

/** Approved-field tokens used directly by this expression. */
export function usedFields(expression) {
  return allTokens(expression).filter(code => !isComputationToken(code));
}

/** Computation codes this expression references directly. */
export function usedComputations(expression) {
  return allTokens(expression).filter(isComputationToken).map(code => code.toUpperCase());
}

/**
 * Every approved field the expression needs once referenced computations are
 * followed through. This is the list the test tab asks for values for: pull in
 * Daily Rate and you are asked for monthly basic and factor days, not for a
 * daily rate you would otherwise have to work out by hand.
 */
export function resolvedFields(expression, library = [], trail = []) {
  const direct = usedFields(expression);
  const nested = usedComputations(expression).flatMap(code => {
    if (trail.includes(code)) return [];
    const referenced = computationByCode(code, library);
    return referenced ? resolvedFields(referenced.expression, library, [...trail, code]) : [];
  });
  return [...new Set([...direct, ...nested])];
}

/**
 * The referenced computations, with everything the mapped-field table shows:
 * whether the code resolves, whether it is still active, and whether following
 * it would loop back to where it started.
 */
export function computationDependencies(expression, library = [], selfCode = '', trail = []) {
  return usedComputations(expression).map(code => {
    const referenced = computationByCode(code, library);
    const circular = code === String(selfCode).toUpperCase() || trail.includes(code);
    return {
      code,
      name: referenced?.name || '',
      expression: referenced?.expression || '',
      category: referenced?.category || '',
      version: referenced?.version || '',
      status: referenced?.status || '',
      missing: !referenced,
      inactive: Boolean(referenced) && referenced.status === 'Inactive',
      circular,
    };
  });
}

/**
 * Why an expression cannot be published yet, in the words a finance user needs.
 * Returns an empty array when the references are all sound.
 */
export function referenceProblems(expression, library = [], selfCode = '') {
  const problems = [];
  for (const dependency of computationDependencies(expression, library, selfCode)) {
    if (dependency.circular) problems.push(`${dependency.code} cannot refer to itself.`);
    else if (dependency.missing) problems.push(`${dependency.code} is not a published computation.`);
    else if (dependency.inactive) problems.push(`${dependency.code} is inactive, so it cannot be used in a new formula.`);
    else {
      try {
        resolvedFields(expression, library);
        evaluateExpression(expression, Object.fromEntries(fields.map(([code, , sample]) => [code, sample])), { library });
      } catch (error) {
        problems.push(error.message);
      }
    }
  }
  return [...new Set(problems)];
}

/** One library record by code, from the seeded catalogue or a saved library. */
export function computationByCode(code, library = seedComputations()) {
  return library.find(item => item.code === code) || null;
}
