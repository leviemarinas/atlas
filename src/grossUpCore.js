/**
 * The pure rules of Gross Up: what the policy can say, the approved rates, and the solver.
 *
 * No imports and no storage, so the payroll engine and the policy screen apply exactly the same rules.
 * `grossUp.js` adds the scenario calculator the setup screen shows; `payrollEngine.js` applies the policy
 * to a real payroll line.
 */

export const GROSS_UP_METHODS = Object.freeze(['Periodic Compensation', 'Annualized Compensation', 'Final Tax', 'Expanded Tax']);
export const GROSS_UP_TARGETS = Object.freeze(['Total net pay', 'Specific earning or allowance']);
export const DEDUCTION_TREATMENTS = Object.freeze(['Added to the required gross', 'Included in the target net', 'Handled outside the Gross Up']);

export const TREATMENT_HINT = Object.freeze({
  'Added to the required gross': 'Gross Up also covers the contributions: the employee still receives the target after SSS, PhilHealth and Pag-IBIG are taken.',
  'Included in the target net': 'The target is what is guaranteed before contributions. They come out of it, so the employee takes home the target less the contributions.',
  'Handled outside the Gross Up': 'Contributions are ignored by the Gross Up and collected as usual elsewhere in the payroll.',
});

/**
 * Approved rates by income type, maintained by P&A. A client picks the income type; it never types a rate.
 * The "Rate set by P&A" row carries a rate P&A set on the policy itself, for an income type not listed here.
 */
export const FINAL_TAX_INCOMES = Object.freeze([
  { code: 'FT-001', name: 'Fringe benefit — managerial or supervisory employee', rate: 35 },
  { code: 'FT-002', name: 'Fringe benefit — non-resident alien not engaged in trade or business', rate: 25 },
  { code: 'FT-003', name: 'Royalties', rate: 20 },
]);
export const EXPANDED_TAX_INCOMES = Object.freeze([
  { code: 'EX-001', name: 'Professional fee — individual, income up to ₱3,000,000', rate: 5 },
  { code: 'EX-002', name: 'Professional fee — individual above ₱3,000,000, or VAT-registered', rate: 10 },
  { code: 'EX-003', name: 'Rental of real property', rate: 5 },
  { code: 'EX-004', name: 'Contractor', rate: 2 },
]);
export const CUSTOM_INCOME = 'CUSTOM';

/** A number from a field, or the fallback when the field is blank, missing or not a number. */
export const numberOr = (value, fallback) => (value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) ? fallback : Number(value));

export const number = value => (Number.isFinite(Number(value)) ? Number(value) : 0);
export const round2 = value => Math.round((number(value) + Number.EPSILON) * 100) / 100;

export const incomesFor = method => (method === 'Final Tax' ? FINAL_TAX_INCOMES : method === 'Expanded Tax' ? EXPANDED_TAX_INCOMES : []);

/** The approved rate for an income type; null when the method has none or the type is unknown. */
export function approvedRate(method, incomeType, policyRate = 0) {
  if (incomeType === CUSTOM_INCOME) return number(policyRate);
  const found = incomesFor(method).find(row => row.code === incomeType);
  return found ? found.rate : null;
}

export function normalizeTest(test = {}) {
  return {
    targetNet: number(test.targetNet),
    statutoryEmployee: number(test.statutoryEmployee),
    nonTaxableAllowance: number(test.nonTaxableAllowance),
    ytdTaxableIncome: number(test.ytdTaxableIncome),
    ytdTaxWithheld: number(test.ytdTaxWithheld),
    allowableDeductions: number(test.allowableDeductions),
    targetCurrency: test.targetCurrency || 'PHP',
    exchangeRate: test.exchangeRate === undefined || test.exchangeRate === '' ? 1 : number(test.exchangeRate),
    rateDate: test.rateDate || '',
    rateSource: test.rateSource || '',
  };
}

/**
 * Brings a saved policy up to the current shape. Older policies kept a "tax method" of graduated or flat
 * and a "target" of net pay or net benefit; they keep their meaning.
 */
export function normalizeGrossUpPolicy(policy = {}) {
  const legacyFlat = policy.taxMethod === 'Flat / final tax rate';
  const method = GROSS_UP_METHODS.includes(policy.method) ? policy.method : legacyFlat ? 'Final Tax' : 'Periodic Compensation';
  const targetType = GROSS_UP_TARGETS.includes(policy.targetType) ? policy.targetType : policy.targetType === 'Net benefit' ? 'Specific earning or allowance' : 'Total net pay';
  const incomes = incomesFor(method);
  const incomeType = policy.incomeType === CUSTOM_INCOME || incomes.some(row => row.code === policy.incomeType) ? policy.incomeType : (legacyFlat ? CUSTOM_INCOME : incomes[0]?.code || '');
  return {
    ...policy,
    method,
    targetType,
    targetEarning: policy.targetEarning || '',
    incomeType,
    deductionTreatment: DEDUCTION_TREATMENTS.includes(policy.deductionTreatment) ? policy.deductionTreatment : 'Added to the required gross',
    employerSharePercent: Math.min(100, Math.max(0, numberOr(policy.employerSharePercent, 100))),
    tolerance: Math.max(0.0001, numberOr(policy.tolerance, 0.01)),
    maxIterations: Math.max(1, Math.round(numberOr(policy.maxIterations, 50))),
    test: normalizeTest(policy.test),
  };
}

/** What the target is, in pesos, and what has to be recorded when it was typed in another currency. */
export function convertTarget(test) {
  const code = test.targetCurrency || 'PHP';
  if (code === 'PHP') return { code, source: round2(test.targetNet), rate: 1, rateDate: '', rateSource: '', converted: round2(test.targetNet), foreign: false };
  return { code, source: round2(test.targetNet), rate: number(test.exchangeRate), rateDate: test.rateDate, rateSource: test.rateSource, converted: round2(test.targetNet * number(test.exchangeRate)), foreign: true };
}

/**
 * Finds the gross that leaves `target` after the employee's share of the tax.
 *
 * `describe(gross)` returns the tax on a candidate gross (and anything the caller wants to show);
 * `netOf(gross, info)` is what the employee nets for it. The step follows the local slope of net with respect
 * to gross, which converges in a few steps against a graduated table.
 */
export function solveGross({ target, start, netOf, describe, tolerance = 0.01, maxIterations = 50 }) {
  const iterations = [];
  let gross = Math.max(0, start);
  let converged = false;
  for (let step = 0; step < maxIterations; step += 1) {
    const info = describe(gross);
    const net = netOf(gross, info);
    const gap = target - net;
    iterations.push({ step: step + 1, gross, taxable: info.taxable, tax: info.tax, net, gap, bracket: info.bracket });
    if (Math.abs(gap) <= tolerance) { converged = true; break; }
    const slope = netOf(gross + 1, describe(gross + 1)) - net;
    gross += Math.abs(slope) > 1e-9 ? gap / slope : gap;
    if (gross < 0) gross = 0;
  }
  return { gross, iterations, converged };
}

/**
 * What is wrong with the policy's own fields. A value that is out of range or not a number is refused here
 * rather than quietly clamped, so the screen can say so and hold the save.
 */
export function grossUpFieldProblems(policy = {}) {
  const problems = [];
  const present = value => value !== undefined && value !== null;
  const bad = (value, test) => present(value) && (value === '' || !Number.isFinite(Number(value)) || !test(Number(value)));
  if (bad(policy.employerSharePercent, value => value >= 0 && value <= 100)) problems.push('Employer-absorbed share must be a number from 0 to 100.');
  if (bad(policy.tolerance, value => value > 0 && value <= 1)) problems.push('Convergence tolerance must be more than 0 and no more than 1 peso.');
  if (bad(policy.maxIterations, value => Number.isInteger(value) && value >= 1 && value <= 200)) problems.push('Maximum iterations must be a whole number from 1 to 200.');
  const method = GROSS_UP_METHODS.includes(policy.method) ? policy.method : 'Periodic Compensation';
  if ((method === 'Final Tax' || method === 'Expanded Tax') && policy.incomeType === CUSTOM_INCOME && !(Number(policy.flatRate) > 0 && Number(policy.flatRate) <= 100)) {
    problems.push('The rate set by P&A must be more than 0 and no more than 100.');
  }
  if (policy.targetType === 'Specific earning or allowance' && !String(policy.targetEarning || '').trim()) problems.push('Name the earning or allowance that is being grossed up.');
  return problems;
}

/**
 * Makes sure the guarantee is never short. The solver stops within its tolerance and the gross is then
 * rounded, either of which can leave the employee a centavo (or up to a peso) under the guaranteed net, so the
 * gross steps up by one rounding unit until the net reaches the target.
 */
export function settleGross({ gross, target, netAt, unit = 0.01, maxSteps = 200 }) {
  let value = gross;
  for (let step = 0; step < maxSteps; step += 1) {
    if (round2(netAt(value)) >= round2(target)) return value;
    value = round2(value + unit);
  }
  return value;
}
