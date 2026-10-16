/**
 * Calculation boundaries (Oct 2026). The client is testing every field and has said the boundaries of the
 * calculations are critical, so each rule is pinned at its edges: the value on the edge, one centavo either
 * side, zero, a negative, and a value far above the top. Expected figures are the ones in the 2026 tables
 * (SSS 15%, PhilHealth 5% shared equally with a ₱10,000 floor and ₱100,000 ceiling, Pag-IBIG ₱10,000 fund
 * salary cap, the TRAIN withholding brackets) and can be worked out by hand.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: index => [...store.keys()][index],
};

const statutory = await import('../src/statutorySchedules.js');
const { grossUpFieldProblems, grossUpResult, normalizeGrossUpPolicy } = await import('../src/grossUp.js');
const { batchProblems, levelsForCalendar } = await import('../src/payrollRuns.js');
const { checkVersionDates, dayAfter, dayBefore, pickVersion, versionOn, versionTimeline } = await import('../src/formulaVersioning.js');
const { MAX_ACROSS, MAX_DOWN, hierarchyProblems, normalizeHierarchy } = await import('../src/payrollApprovalFlow.js');

const AS_OF = '2026-10-13';
const data = statutory.seedStatutoryData();
const version = agency => statutory.effectiveVersionIn(data, agency, AS_OF);
const sss = amount => statutory.sssContribution(version('sss'), amount);
const phic = amount => statutory.rateContribution(version('philhealth'), amount);
const hdmf = amount => statutory.rateContribution(version('pagibig'), amount);
const tax = (amount, frequency = 'Monthly') => statutory.graduatedTax(version(frequency === 'Annual' ? 'annualTax' : 'tax'), amount, frequency).tax;
const shares = result => [result.employee, result.employer];

/* ------------------------------------------------------------------ SSS */

test('SSS: each bracket starts on the peso and ends on x.99', () => {
  assert.deepEqual(shares(sss(0)), [250, 510], 'zero pay is in the first bracket');
  assert.deepEqual(shares(sss(5249.99)), [250, 510], 'the last centavo of the first bracket');
  assert.deepEqual(shares(sss(5250)), [275, 560], 'the first peso of the second');
  assert.deepEqual(shares(sss(5749.99)), [275, 560]);
  assert.deepEqual(shares(sss(5750)), [300, 610]);
});

test('SSS: the top bracket is the cap, however high the pay', () => {
  assert.deepEqual(shares(sss(34749.99)), [1725, 3480]);
  assert.deepEqual(shares(sss(34750)), [1750, 3530], 'the cap starts at 34,750');
  assert.deepEqual(shares(sss(1000000)), [1750, 3530]);
  assert.deepEqual(shares(sss(99999999)), [1750, 3530]);
});

test('SSS: a value between two brackets belongs to the lower one, and a negative to the first', () => {
  assert.deepEqual(shares(sss(5249.995)), [250, 510], 'inside the centavo gap, not the top bracket');
  assert.deepEqual(shares(sss(34749.995)), [1725, 3480]);
  assert.deepEqual(shares(sss(-1)), [250, 510], 'a negative is never charged the maximum');
});

/* ------------------------------------------------------------ PhilHealth */

test('PhilHealth: the floor premium applies up to and including 10,000', () => {
  assert.deepEqual(shares(phic(0)), [250, 250]);
  assert.deepEqual(shares(phic(10000)), [250, 250]);
  assert.deepEqual(shares(phic(10000.005)), [250, 250], 'inside the gap, still the floor');
  assert.deepEqual(shares(phic(10000.01)), [250, 250], '2.5% of 10,000.01 is 250.00 each');
});

test('PhilHealth: between the floor and the ceiling it is 2.5% each', () => {
  assert.deepEqual(shares(phic(20000)), [500, 500]);
  assert.deepEqual(shares(phic(50000)), [1250, 1250]);
  assert.deepEqual(shares(phic(99999.99)), [2500, 2500], '2.5% of 99,999.99 rounds to 2,500.00');
});

test('PhilHealth: the ceiling is a fixed 2,500 each, however high the pay', () => {
  assert.deepEqual(shares(phic(100000)), [2500, 2500]);
  assert.deepEqual(shares(phic(250000)), [2500, 2500]);
  assert.deepEqual(shares(phic(99999999)), [2500, 2500]);
});

test('PhilHealth: a negative is charged the floor, not the ceiling', () => {
  assert.deepEqual(shares(phic(-1)), [250, 250]);
});

/* -------------------------------------------------------------- Pag-IBIG */

test('Pag-IBIG: 1% employee and 2% employer up to 1,500, then 2% each, then a fixed 200', () => {
  assert.deepEqual(shares(hdmf(0)), [0, 0]);
  assert.deepEqual(shares(hdmf(1000)), [10, 20]);
  assert.deepEqual(shares(hdmf(1500)), [15, 30], 'the last peso of the 1% bracket');
  assert.deepEqual(shares(hdmf(1500.005)), [15, 30], 'inside the gap, the lower bracket');
  assert.deepEqual(shares(hdmf(1500.01)), [30, 30], 'the first centavo of the 2% bracket');
  assert.deepEqual(shares(hdmf(5000)), [100, 100]);
  assert.deepEqual(shares(hdmf(9999.99)), [200, 200], '2% of 9,999.99 rounds to 200.00');
});

test('Pag-IBIG: the fund salary cap makes it 200 each from 10,000 up', () => {
  assert.deepEqual(shares(hdmf(10000)), [200, 200]);
  assert.deepEqual(shares(hdmf(50000)), [200, 200]);
  assert.deepEqual(shares(hdmf(99999999)), [200, 200]);
});

test('Pag-IBIG: a negative pay never produces a negative contribution or the cap', () => {
  assert.deepEqual(shares(hdmf(-1)), [0, 0]);
  assert.deepEqual(shares(hdmf(-5000)), [0, 0]);
});

/* ------------------------------------------------------- withholding tax */

test('monthly withholding: nothing is withheld up to 20,833.33', () => {
  assert.equal(tax(-5), 0, 'a negative is never a refund');
  assert.equal(tax(0), 0);
  assert.equal(tax(0.01), 0);
  assert.equal(tax(20833.32), 0);
  assert.equal(tax(20833.33), 0);
  assert.equal(tax(20833.34), 0, '15% of one centavo rounds to zero');
});

test('monthly withholding: each bracket starts where the one below ends, with no jump', () => {
  assert.equal(tax(33333.33), 1875, '15% of the 12,500 above 20,833.33');
  assert.equal(tax(33333.32), 1875, 'one centavo below the edge rounds to the same');
  assert.equal(tax(33333.34), 1875, '20% of one centavo rounds to zero');
  assert.equal(tax(66666.67), 8541.67);
  assert.equal(tax(166666.67), 33541.67);
  assert.equal(tax(666666.67), 183541.67);
  assert.equal(tax(8333333.33), 2866875);
});

test('monthly withholding: above the top bracket the top rate keeps applying', () => {
  assert.equal(tax(9000000), 3100208.34, '183,541.67 + 35% of what is above 666,666.67');
});

test('semi-monthly withholding is the monthly table halved', () => {
  assert.equal(tax(10416.66, 'Semi-monthly'), 0);
  assert.equal(tax(10416.67, 'Semi-monthly'), 0);
  assert.equal(tax(16666.67, 'Semi-monthly'), 937.5);
  assert.equal(tax(33333.34, 'Semi-monthly'), 4270.83);
});

test('annual withholding follows the TRAIN brackets', () => {
  assert.equal(tax(250000, 'Annual'), 0);
  assert.equal(tax(250000.01, 'Annual'), 0, '15% of one centavo rounds to zero');
  assert.equal(tax(400000, 'Annual'), 22500);
  assert.equal(tax(800000, 'Annual'), 102500);
  assert.equal(tax(2000000, 'Annual'), 402500);
  assert.equal(tax(8000000, 'Annual'), 2202500);
  assert.equal(tax(8000001, 'Annual'), 2202500.35);
});

/* ------------------------------------------------------------ de minimis */

test('de minimis: up to the ceiling is non-taxable, and the excess is taxable from the first centavo', () => {
  const split = (amount, used) => statutory.splitDeMinimis(version('deMinimis'), 'Rice Subsidy', amount, used);
  assert.deepEqual([split(30000, 0).nonTaxable, split(30000, 0).taxable], [30000, 0]);
  assert.deepEqual([split(30000.01, 0).nonTaxable, split(30000.01, 0).taxable], [30000, 0.01]);
  assert.deepEqual([split(2000, 28000).nonTaxable, split(2000, 28000).taxable], [2000, 0], 'exactly fills the ceiling');
  assert.deepEqual([split(2000.01, 28000).nonTaxable, split(2000.01, 28000).taxable], [2000, 0.01]);
  assert.deepEqual([split(100, 30000).nonTaxable, split(100, 30000).taxable], [0, 100], 'the ceiling is already used');
  assert.deepEqual([split(100, 31000).nonTaxable, split(100, 31000).taxable], [0, 100], 'used above the ceiling');
  assert.deepEqual([split(0, 0).nonTaxable, split(0, 0).taxable], [0, 0]);
});

/* -------------------------------------------------------------- gross up */

const policy = (patch = {}, test = {}) => ({
  enabled: true, method: 'Periodic Compensation', targetType: 'Total net pay', frequency: 'Monthly', effectiveDate: '2026-08-31',
  employerSharePercent: 100, includeStatutoryInTaxable: true, roundingMode: 'Round to centavo', tolerance: 0.01, maxIterations: 50,
  deductionTreatment: 'Added to the required gross', test: { targetNet: 50000, statutoryEmployee: 1875, nonTaxableAllowance: 0, ytdTaxableIncome: 0, ...test }, ...patch,
});

test('gross up: the guaranteed net is never short, at any share, tolerance or rounding', () => {
  for (const employerSharePercent of [0, 10, 25, 50, 75, 90, 100]) {
    for (const tolerance of [0.0001, 0.01, 1]) {
      for (const roundingMode of ['Round to centavo', 'Round to peso']) {
        const result = grossUpResult(policy({ employerSharePercent, tolerance, roundingMode }));
        assert.ok(result.employeeNet >= 50000 - 0.0001, `share ${employerSharePercent}% tolerance ${tolerance} ${roundingMode}: net ${result.employeeNet}`);
        assert.ok(result.employeeNet - 50000 <= (roundingMode === 'Round to peso' ? 1.005 : 0.015), `not over by more than one rounding step: ${result.employeeNet}`);
        assert.ok(result.proof.holds);
      }
    }
  }
});

test('gross up: the worked example, 50,000 net with the employer paying all the tax', () => {
  const result = grossUpResult(policy());
  assert.equal(result.grossTaxable, 51875);
  assert.equal(Math.round(result.withholdingTax * 100) / 100, 5208.33);
  assert.equal(Math.round(result.employerCost * 100) / 100, 57083.33);
});

test('gross up: amounts at the edges of the tax table', () => {
  for (const [target, gross] of [[0.01, 0.01], [20833.33, 20833.33], [20833.34, 20833.34]]) {
    const result = grossUpResult(policy({ employerSharePercent: 0 }, { targetNet: target, statutoryEmployee: 0 }));
    assert.equal(result.grossTaxable, gross, `${target} needs no gross up: it is not above the zero-tax bracket`);
    assert.ok(result.proof.holds);
  }
  const high = grossUpResult(policy({ employerSharePercent: 50 }, { targetNet: 1000000, statutoryEmployee: 0 }));
  assert.ok(high.employeeNet >= 1000000);
  assert.ok(high.proof.holds);
});

test('gross up: a target of zero or less is refused, and says so', () => {
  for (const targetNet of [0, -100]) {
    const result = grossUpResult(policy({}, { targetNet, statutoryEmployee: 0 }));
    assert.ok(result.problems.some(message => /above zero/.test(message)), `target ${targetNet}`);
    assert.equal(result.proof.holds, false);
    assert.equal(result.tableMissing, false, 'a zero target is not a missing tax table');
  }
});

test('gross up: the policy fields are refused outside their range rather than quietly corrected', () => {
  const problems = patch => grossUpFieldProblems(patch);
  assert.deepEqual(problems({ employerSharePercent: 0, tolerance: 0.01, maxIterations: 1 }), []);
  assert.deepEqual(problems({ employerSharePercent: 100, tolerance: 1, maxIterations: 200 }), []);
  assert.match(problems({ employerSharePercent: 100.01 })[0], /0 to 100/);
  assert.match(problems({ employerSharePercent: -0.01 })[0], /0 to 100/);
  assert.match(problems({ employerSharePercent: '' })[0], /0 to 100/);
  assert.match(problems({ employerSharePercent: 'abc' })[0], /0 to 100/);
  assert.match(problems({ tolerance: 0 })[0], /more than 0/);
  assert.match(problems({ tolerance: 1.01 })[0], /no more than 1/);
  assert.match(problems({ maxIterations: 0 })[0], /1 to 200/);
  assert.match(problems({ maxIterations: 201 })[0], /1 to 200/);
  assert.match(problems({ maxIterations: 2.5 })[0], /whole number/);
  assert.match(problems({ method: 'Expanded Tax', incomeType: 'CUSTOM', flatRate: 0 })[0], /more than 0/);
  assert.match(problems({ method: 'Final Tax', incomeType: 'CUSTOM', flatRate: 100.5 })[0], /no more than 100/);
  assert.deepEqual(problems({ method: 'Final Tax', incomeType: 'CUSTOM', flatRate: 100 }), []);
  assert.match(problems({ targetType: 'Specific earning or allowance', targetEarning: '   ' })[0], /Name the earning/);
});

test('gross up: a blank or non-numeric field falls back to its default for the calculation, and is flagged', () => {
  const normalized = normalizeGrossUpPolicy({ employerSharePercent: '', tolerance: 'abc', maxIterations: '' });
  assert.equal(normalized.employerSharePercent, 100, 'a blank share is not read as 0%');
  assert.equal(normalized.tolerance, 0.01);
  assert.equal(normalized.maxIterations, 50);
  assert.ok(grossUpResult(policy({ employerSharePercent: '' })).problems.length > 0);
});

test('gross up: a foreign-currency target needs all three of rate, date and source', () => {
  const missing = grossUpResult(policy({}, { targetNet: 1000, targetCurrency: 'USD', exchangeRate: 0, rateDate: '', rateSource: '', statutoryEmployee: 0 }));
  assert.equal(missing.problems.length, 3);
  const noRate = grossUpResult(policy({}, { targetNet: 1000, targetCurrency: 'USD', exchangeRate: 0, rateDate: '2026-10-01', rateSource: 'BSP', statutoryEmployee: 0 }));
  assert.equal(noRate.problems.length, 1);
  const ok = grossUpResult(policy({}, { targetNet: 1000, targetCurrency: 'USD', exchangeRate: 56.5, rateDate: '2026-10-01', rateSource: 'BSP', statutoryEmployee: 0 }));
  assert.equal(ok.targetNet, 56500);
  assert.equal(ok.problems.length, 0);
});

/* ------------------------------------------------- dates, versions, levels */

test('formula dates: the day-before and day-after helpers cross month, leap-day and year ends', () => {
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayBefore('2028-03-01'), '2028-02-29', 'a leap year');
  assert.equal(dayBefore('2026-01-01'), '2025-12-31');
  assert.equal(dayAfter('2026-12-31'), '2027-01-01');
  assert.equal(dayAfter('2028-02-28'), '2028-02-29');
  assert.equal(dayBefore('not a date'), '');
});

test('formula dates: a new version must start the day after the one it replaces, or later', () => {
  const current = { code: 'X-001', version: '1.0', effectiveDate: '2026-06-01', status: 'Active' };
  const timeline = versionTimeline(current, [], '2026-10-13');
  const check = (from, to = '') => checkVersionDates({ from, to, previous: current, timeline, today: '2026-10-13' });
  assert.match(check('2026-06-01').errors[0], /cannot overlap/, 'the same day as the current version');
  assert.match(check('2026-05-31').errors[0], /cannot overlap/, 'the day before it');
  assert.deepEqual(check('2026-06-02').errors, [], 'the day after is allowed');
  assert.match(check('').errors[0], /Effective from/);
  assert.match(check('2026-11-01', '2026-10-31').errors[0], /before Effective from/, 'ends the day before it starts');
  assert.deepEqual(check('2026-11-01', '2026-11-01').errors, [], 'a one-day version');
});

test('formula dates: the version in force on a date, at the edges of its period', () => {
  const v10 = { code: 'X-002', version: '1.0', effectiveDate: '2026-01-01', expression: 'a' };
  const v11 = { code: 'X-002', version: '1.1', effectiveDate: '2026-06-01', expression: 'b', status: 'Active' };
  const timeline = versionTimeline(v11, [v10, v11], '2026-10-13');
  assert.equal(versionOn(timeline, '2025-12-31'), null, 'before the first version');
  assert.equal(versionOn(timeline, '2026-01-01').version, '1.0');
  assert.equal(versionOn(timeline, '2026-05-31').version, '1.0', 'the last day of the old version');
  assert.equal(versionOn(timeline, '2026-06-01').version, '1.1', 'the first day of the new one');
  const ended = { ...v11, effectiveTo: '2026-12-31' };
  const endedLine = versionTimeline(ended, [v10, ended], '2027-01-01');
  assert.equal(versionOn(endedLine, '2026-12-31').version, '1.1');
  assert.equal(versionOn(endedLine, '2027-01-01'), null, 'the day after the end');
  assert.equal(pickVersion(ended, [v10], { payoutDate: '2027-01-01' }).state, 'ended');
});

test('payout calendar approval levels: 2 to 6 are accepted, anything else is not', () => {
  const calendars = ['0', '1', '2', '3', '6', '7', '3.5', 'abc', '', ' ', '-1'].map(value => ({ calendarCode: `L${value}`, approvalLevels: value }));
  const accepted = calendars.map(row => [row.approvalLevels, levelsForCalendar(calendars, row.calendarCode)]);
  assert.deepEqual(accepted, [['0', undefined], ['1', undefined], ['2', 2], ['3', 3], ['6', 6], ['7', undefined], ['3.5', undefined], ['abc', undefined], ['', undefined], [' ', undefined], ['-1', undefined]]);
});

test('approval hierarchy: six levels down and three across, and no more', () => {
  const rows = count => Array.from({ length: count }, (_, index) => (index === 0 ? { approvers: ['Preparer'] } : { mode: 'Any one of them', approvers: ['Client Admin'] }));
  assert.equal(normalizeHierarchy(rows(MAX_DOWN)).length, 6);
  assert.equal(normalizeHierarchy(rows(7)).length, 6, 'a seventh level is dropped');
  assert.deepEqual(hierarchyProblems(rows(1).map((row, index) => ({ ...row, level: index + 1 })))[0].includes('at least two levels'), true);
  assert.deepEqual(hierarchyProblems(rows(2).map((row, index) => ({ ...row, level: index + 1 }))), []);
  const wide = approvers => normalizeHierarchy([{ approvers: ['Preparer'] }, { mode: 'Parallel', approvers }])[1].approvers;
  assert.equal(wide(['Client Admin', 'P&A Admin', 'P&A SuperAdmin']).length, MAX_ACROSS);
  assert.equal(wide(['Client Admin', 'P&A Admin', 'P&A SuperAdmin', 'Client Admin']).length, MAX_ACROSS, 'a fourth, even a repeat, is dropped');
  assert.deepEqual(wide([]), [], 'and a level with none is reported, not invented');
});

/* ------------------------------------------------------- payroll wizard */

test('payroll transaction dates: the timekeeping cut-off cannot end before it starts', () => {
  const row = patch => ({ paymentMode: 'Semi-monthly', periodStart: '2026-10-01', periodEnd: '2026-10-15', timekeepingStart: '2026-09-16', timekeepingEnd: '2026-09-30', payoutDate: '2026-10-15', lockDate: '2026-10-16', ...patch });
  const draft = patch => ({ transactionMode: 'Multiple', additional: [row(patch)] });
  const first = patch => batchProblems({ ...draft(patch), additional: [row(), row(patch)] });
  assert.deepEqual(first({}), []);
  assert.match(first({ timekeepingEnd: '2026-09-15' })[0], /timekeeping cut-off end cannot fall before its start/);
  assert.deepEqual(first({ timekeepingEnd: '2026-09-16' }), [], 'a one-day cut-off is fine');
  assert.match(first({ periodEnd: '2026-09-30' })[0], /period end cannot fall before its start/);
  assert.deepEqual(first({ periodEnd: '2026-10-01' }), [], 'a one-day period is fine');
  assert.match(first({ lockDate: '2026-10-14' })[0], /lock date cannot fall before its payout date/);
  assert.deepEqual(first({ lockDate: '2026-10-15' }), [], 'locked on the payout date itself');
  assert.match(first({ payoutDate: '' })[0], /payout date is required/);
});
