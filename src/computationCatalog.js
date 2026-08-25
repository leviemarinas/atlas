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


export const fieldMap = Object.fromEntries(fields.map(([code, label, sample]) => [code, { code, label, sample }]));

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
