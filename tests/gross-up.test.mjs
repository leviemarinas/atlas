import assert from 'node:assert/strict';
import test from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: index => [...store.keys()][index],
};

const { CUSTOM_INCOME, DEDUCTION_TREATMENTS, GROSS_UP_METHODS, approvedRate, convertTarget, grossUpResult, normalizeGrossUpPolicy } = await import('../src/grossUp.js');

/**
 * Gross Up (Gen Olan's comments on slides 49 to 55): four methods, a target that names what is grossed up,
 * a tax share between employee and employer, a treatment for contributions, a foreign-currency target, and a
 * proof that gross less employee tax and deductions equals the agreed net.
 */
const base = {
  enabled: true,
  targetType: 'Total net pay',
  method: 'Periodic Compensation',
  frequency: 'Monthly',
  effectiveDate: '2026-08-31',
  employerSharePercent: 100,
  includeStatutoryInTaxable: true,
  roundingMode: 'Round to centavo',
  tolerance: 0.01,
  maxIterations: 50,
  deductionTreatment: 'Added to the required gross',
  test: { targetNet: 50000, statutoryEmployee: 1875, nonTaxableAllowance: 0, ytdTaxableIncome: 0 },
};
const policy = (patch = {}, testPatch = {}) => ({ ...base, ...patch, test: { ...base.test, ...testPatch } });

test('there are four separate methods and three treatments of contributions', () => {
  assert.deepEqual(GROSS_UP_METHODS, ['Periodic Compensation', 'Annualized Compensation', 'Final Tax', 'Expanded Tax']);
  assert.equal(DEDUCTION_TREATMENTS.length, 3);
});

test('periodic gross up on the monthly table proves out and the employer takes all of the tax', () => {
  const result = grossUpResult(policy());
  assert.equal(result.converged, true);
  assert.equal(result.tableMissing, false);
  assert.equal(result.grossTaxable, 51875, 'target 50,000 plus 1,875 contributions');
  assert.equal(Math.round(result.withholdingTax * 100) / 100, Math.round((result.employerTaxShare) * 100) / 100, 'the employer carries all of it');
  assert.equal(result.employeeTaxShare, 0);
  assert.ok(result.proof.holds, 'gross less contributions equals the agreed net');
  assert.ok(Math.abs(result.employerCost - (result.grossTaxable + result.employerTaxShare)) < 0.005);
});

test('a 50/50 shared gross up shows both tax shares, the employee net and the employer cost', () => {
  const result = grossUpResult(policy({ employerSharePercent: 50 }));
  assert.equal(result.converged, true);
  assert.ok(result.employeeTaxShare > 0 && result.employerTaxShare > 0);
  assert.ok(Math.abs(result.employeeTaxShare - result.employerTaxShare) < 0.005, 'split evenly');
  assert.ok(Math.abs(result.employeeTaxShare + result.employerTaxShare - result.withholdingTax) < 0.005);
  assert.equal(result.employeeSharePercent, 50);
  assert.ok(result.proof.holds);
  assert.ok(Math.abs(result.employeeNet - 50000) <= 0.01);
  assert.ok(Math.abs(result.employerCost - (result.grossTaxable + result.employerTaxShare)) < 0.005);
});

test('a final tax gross up uses the approved rate for the income type and proves gross less tax equals net', () => {
  const result = grossUpResult(policy({ method: 'Final Tax', incomeType: 'FT-001', employerSharePercent: 0 }, { statutoryEmployee: 0 }));
  assert.equal(result.rate, 35);
  assert.equal(result.incomeName.startsWith('Fringe benefit'), true);
  assert.ok(Math.abs(result.grossTaxable - 50000 / 0.65) < 0.01);
  assert.ok(Math.abs(result.grossTaxable - result.withholdingTax - 50000) < 0.01);
  assert.ok(result.proof.holds);
});

test('an expanded tax gross up reads its rate from the income or recipient type', () => {
  assert.equal(approvedRate('Expanded Tax', 'EX-001'), 5);
  assert.equal(approvedRate('Expanded Tax', 'EX-002'), 10);
  assert.equal(approvedRate('Expanded Tax', 'FT-001'), null, 'a final tax code is not an expanded tax rate');
  const result = grossUpResult(policy({ method: 'Expanded Tax', incomeType: 'EX-002', employerSharePercent: 0 }, { statutoryEmployee: 0 }));
  assert.ok(Math.abs(result.grossTaxable - 50000 / 0.9) < 0.01);
  assert.ok(result.proof.holds);
  assert.equal(normalizeGrossUpPolicy({ method: 'Expanded Tax', incomeType: '' }).incomeType, 'EX-001', 'a missing income type defaults to the first approved one');
  assert.equal(normalizeGrossUpPolicy({ method: 'Expanded Tax', incomeType: 'FT-001' }).incomeType, 'EX-001', 'a final tax code is not an expanded tax income type');
});

test('an annualized gross up uses year-to-date income, tax withheld and allowable deductions', () => {
  const result = grossUpResult(policy({ method: 'Annualized Compensation', employerSharePercent: 0 }, { ytdTaxableIncome: 500000, ytdTaxWithheld: 40000, allowableDeductions: 20000, statutoryEmployee: 0 }));
  assert.equal(result.method, 'Annualized Compensation');
  assert.ok(result.annualized, 'the trace carries the annualized inputs');
  assert.equal(result.annualized.ytdTaxableIncome, 500000);
  assert.equal(result.annualized.ytdTaxWithheld, 40000);
  assert.equal(result.annualized.allowableDeductions, 20000);
  assert.ok(Math.abs(result.annualized.remaining - result.withholdingTax) < 0.01, 'tax this payroll is the remaining tax due');
  assert.equal(result.converged, true);
  assert.ok(result.proof.holds);
});

test('contributions can be added to the gross, included in the target, or left outside', () => {
  const added = grossUpResult(policy({ employerSharePercent: 100 }));
  const included = grossUpResult(policy({ deductionTreatment: 'Included in the target net' }));
  const outside = grossUpResult(policy({ deductionTreatment: 'Handled outside the Gross Up' }));
  // Added: the employee still gets 50,000 after the contributions, so the gross covers them.
  assert.equal(added.grossTaxable, 51875);
  assert.equal(added.employeeNet, 50000);
  // Included: 50,000 is guaranteed before contributions, so the employee takes home less.
  assert.equal(included.grossTaxable, 50000);
  assert.equal(included.employeeNet, 50000 - 1875);
  assert.equal(included.proof.guaranteed, 50000);
  // Outside: contributions play no part.
  assert.equal(outside.statutory, 0);
  assert.equal(outside.employeeNet, outside.grossTaxable);
  assert.ok([added, included, outside].every(result => result.proof.holds));
});

test('a target in a foreign currency is converted and its rate, date and source are kept', () => {
  const conversion = convertTarget({ targetNet: 1000, targetCurrency: 'USD', exchangeRate: 56.5, rateDate: '2026-10-01', rateSource: 'BSP reference rate' });
  assert.deepEqual([conversion.code, conversion.source, conversion.rate, conversion.converted, conversion.rateDate, conversion.rateSource], ['USD', 1000, 56.5, 56500, '2026-10-01', 'BSP reference rate']);
  const result = grossUpResult(policy({}, { targetNet: 1000, targetCurrency: 'USD', exchangeRate: 56.5, rateDate: '2026-10-01', rateSource: 'BSP reference rate', statutoryEmployee: 0 }));
  assert.equal(result.targetNet, 56500);
  assert.equal(result.currency.foreign, true);
  assert.equal(result.problems.length, 0);
  assert.ok(result.proof.holds);
});

test('a foreign-currency target without a rate, date or source is refused', () => {
  const result = grossUpResult(policy({}, { targetNet: 1000, targetCurrency: 'USD', exchangeRate: 0, rateDate: '', rateSource: '' }));
  assert.equal(result.problems.length, 3);
  assert.equal(result.proof.holds, false, 'nothing is proven on an unconverted target');
});

test('a specific earning has to be named, so it is not confused with total net pay', () => {
  const result = grossUpResult(policy({ targetType: 'Specific earning or allowance', targetEarning: '' }));
  assert.match(result.problems[0], /earning or allowance/);
  const named = grossUpResult(policy({ targetType: 'Specific earning or allowance', targetEarning: 'Rice subsidy' }));
  assert.equal(named.problems.length, 0);
  assert.equal(named.targetEarning, 'Rice subsidy');
});

test('a policy saved before these options keeps its meaning', () => {
  const legacy = normalizeGrossUpPolicy({ taxMethod: 'Flat / final tax rate', flatRate: 25, targetType: 'Net benefit', employerSharePercent: 50 });
  assert.equal(legacy.method, 'Final Tax');
  assert.equal(legacy.incomeType, CUSTOM_INCOME);
  assert.equal(legacy.targetType, 'Specific earning or allowance');
  const result = grossUpResult({ ...legacy, test: { targetNet: 75000 } });
  assert.equal(result.rate, 25);
  assert.ok(result.proof.holds === false || result.problems.length > 0, 'a specific earning still has to be named');
  assert.equal(normalizeGrossUpPolicy({ taxMethod: 'Graduated withholding table' }).method, 'Periodic Compensation');
});

test('a method that cannot converge says so instead of looping', () => {
  const result = grossUpResult(policy({ maxIterations: 1, tolerance: 0.0001, employerSharePercent: 0 }, { targetNet: 123456.78 }));
  assert.equal(result.iterations.length, 1);
  assert.equal(result.converged, false);
});
