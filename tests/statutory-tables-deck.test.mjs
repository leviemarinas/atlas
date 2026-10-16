import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, length: 0, key: () => null };
const { seedStatutoryData, effectiveVersionIn, rateContribution, agencyDefinitions, graduatedTax } = await import('../src/statutorySchedules.js');

/** The Statutory Tables deck (flow V3, 21 July 2026) and the UI approval comments of July 22. */
const data = seedStatutoryData();

test('PhilHealth gives the odd centavo to the employer, and the total is exact', () => {
  const version = effectiveVersionIn(data, 'philhealth', '2026-06-15');
  const odd = rateContribution(version, 12347);
  assert.equal(odd.employee + odd.employer, 617.35, 'the total premium is 5% of 12,347.00');
  assert.equal(odd.employee, 308.67);
  assert.equal(odd.employer, 308.68, 'the 0.01 rounding difference is the employer\'s');
  const even = rateContribution(version, 20000);
  assert.deepEqual([even.employee, even.employer], [500, 500]);
});

test('Pag-IBIG and PhilHealth units are Percentage (%) or Amount (Php)', () => {
  const units = new Set(['philhealth', 'pagibig'].flatMap(agency => effectiveVersionIn(data, agency, '2026-06-15').rows.map(row => row.unit)));
  assert.deepEqual([...units].sort(), ['Amount (Php)', 'Percentage (%)']);
});

test('the version in force is chosen by the payroll cut-off against the Effectivity Date', () => {
  const sss = data.sss;
  const future = { ...sss[0], id: 'sss-future', code: 'SSS-2026-002', effectiveDate: '2026-08-01', status: 'Active' };
  const set = { sss: [future, ...sss] };
  assert.equal(effectiveVersionIn(set, 'sss', '2026-07-15').code, 'SSS-2026-001', 'case 1: period July 1-15 uses the January table');
  assert.equal(effectiveVersionIn(set, 'sss', '2026-08-15').code, 'SSS-2026-002', 'case 2: period August 1-15 uses the August table');
  assert.equal(effectiveVersionIn(set, 'sss', '2026-08-01').code, 'SSS-2026-002', 'a cut-off on the effective date uses the new table');
  assert.equal(effectiveVersionIn(set, 'sss', '2026-07-31').code, 'SSS-2026-001', 'the day before uses the old one');
});

test('the tax tables carry Payment Mode and Bi-weekly, and the codes follow the approved prefixes', () => {
  const compensation = agencyDefinitions.tax.fields.find(([key]) => key === 'frequency');
  assert.equal(compensation[1], 'Payment Mode');
  assert.deepEqual(compensation[3], ['Daily', 'Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly', 'Annual']);
  assert.deepEqual(['sss', 'philhealth', 'pagibig', 'annualTax', 'tax', 'expandedTax', 'finalTax'].map(key => agencyDefinitions[key].prefix), ['SSS', 'PHIC', 'HDMF', 'WTA', 'WTC', 'WTE', 'WTF']);
  const biweekly = graduatedTax(effectiveVersionIn(data, 'tax', '2026-06-15'), 20000, 'Bi-weekly');
  assert.ok(biweekly.tax > 0 && biweekly.brackets.length > 0, 'a bi-weekly employee has a tax bracket');
});

test('Expanded and Final tax rows carry a locked Tax Type and both ATC code fields', () => {
  for (const [agency, type] of [['expandedTax', 'WE'], ['finalTax', 'WF']]) {
    const keys = agencyDefinitions[agency].fields.map(([key]) => key);
    assert.deepEqual(keys.slice(0, 5), ['taxType', 'incomePayment', 'atcClass', 'excessRate', 'atcCode']);
    assert.ok(effectiveVersionIn(data, agency, '2026-06-15').rows.every(row => row.taxType === type));
  }
});
