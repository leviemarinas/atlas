/**
 * The statutory and tax schedules.
 *
 * These are the numbers every payroll figure ultimately rests on, so they are
 * checked against the published schedules rather than against themselves: the
 * SSS contribution table, the PhilHealth premium, the Pag-IBIG cap and the
 * TRAIN brackets. A rounding change or a wrong ceiling shows up here first.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TAX_PERIODS_PER_YEAR,
  agencyDefinitions,
  agencyGroups,
  bracketFor,
  bracketsForFrequency,
  deMinimisRules,
  effectiveVersionIn,
  graduatedTax,
  rateContribution,
  seedStatutoryData,
  splitDeMinimis,
  sssContribution,
} from '../src/statutorySchedules.js';

const data = seedStatutoryData();
const at = (agency, date = '2025-11-30') => effectiveVersionIn(data, agency, date);

test('every agency in the two tiles has a seeded, effective version', () => {
  const agencies = [...agencyGroups.statutory.agencies, ...agencyGroups.tax.agencies];
  assert.deepEqual([...agencies].sort(), Object.keys(agencyDefinitions).sort());
  agencies.forEach(agency => {
    const version = at(agency);
    assert.ok(version, `${agency} has an effective version`);
    assert.ok(version.rows.length > 0, `${agency} publishes rows`);
  });
});

test('a version is selected by effective date, so a past run keeps its own table', () => {
  assert.equal(at('philhealth', '2023-06-30').code, 'PHIC-2023-001');
  assert.equal(at('philhealth', '2025-06-30').code, 'PHIC-2025-001');
  // The 2023 premium was 4.5% total (2.25% each); 2025 is 5% (2.5% each).
  assert.equal(rateContribution(at('philhealth', '2023-06-30'), 50000).employee, 1000);
  assert.equal(rateContribution(at('philhealth', '2025-06-30'), 50000).employee, 1250);
});

test('SSS splits the regular fund and the provident fund at MSC 20,000', () => {
  const version = at('sss');
  // Contribution rate 15%, employee share one third of it.
  const low = sssContribution(version, 12000);
  assert.equal(low.bracket.mscRegular, 12000);
  assert.equal(low.bracket.mscMpf, 0);
  assert.equal(low.employee, 600);
  assert.equal(low.mpfEmployee, 0);

  // At and above the ceiling the MSC is 35,000: 20,000 regular + 15,000 MPF.
  const high = sssContribution(version, 90000);
  assert.equal(high.bracket.mscRegular, 20000);
  assert.equal(high.bracket.mscMpf, 15000);
  assert.equal(high.regularEmployee, 1000);
  assert.equal(high.mpfEmployee, 750);
  assert.equal(high.employee, 1750);
  // Employer carries the other two thirds plus EC.
  assert.equal(high.employer, 2000 + 30 + 1500);
});

test('EC is 10 pesos below MSC 15,000 and 30 at or above it', () => {
  const version = at('sss');
  assert.equal(sssContribution(version, 14000).ec, 10);
  assert.equal(sssContribution(version, 16000).ec, 30);
});

test('PhilHealth floors at 10,000 and ceilings at 100,000 of compensation', () => {
  const version = at('philhealth');
  assert.equal(rateContribution(version, 8000).employee, 250);
  assert.equal(rateContribution(version, 45000).employee, 1125);
  assert.equal(rateContribution(version, 250000).employee, 2500);
});

test('Pag-IBIG is 1% below 1,500 and 2% above, capped at 10,000 of compensation', () => {
  const version = at('pagibig');
  assert.equal(rateContribution(version, 1400).employee, 14);
  assert.equal(rateContribution(version, 1400).employer, 28);
  assert.equal(rateContribution(version, 5000).employee, 100);
  assert.equal(rateContribution(version, 45000).employee, 200);
  assert.equal(rateContribution(version, 45000).employer, 200);
});

test('the compensation table carries every payroll frequency, derived from the annual brackets', () => {
  const version = at('tax');
  Object.keys(TAX_PERIODS_PER_YEAR).filter(frequency => frequency !== 'Annual').forEach(frequency => {
    assert.equal(bracketsForFrequency(version, frequency).length, 6, `${frequency} has six brackets`);
  });
  // Semi-monthly: the second bracket opens at 250,000 / 24.
  const semi = bracketsForFrequency(version, 'Semi-monthly');
  assert.equal(semi[1].minimum, 10416.67);
  assert.equal(semi[1].excessRate, 15);
});

test('graduated tax is the bracket fixed amount plus its rate on the excess', () => {
  const version = at('tax');
  // 30,000 semi-monthly sits in 16,666.67 - 33,333.33: 937.50 + 20% of 13,333.33
  assert.equal(graduatedTax(version, 30000, 'Semi-monthly').tax, 3604.17);
  // Below the first taxable bracket there is no tax at all.
  assert.equal(graduatedTax(version, 9000, 'Semi-monthly').tax, 0);
  // Monthly 50,000: 1,875 + 20% of 16,667
  assert.equal(graduatedTax(version, 50000, 'Monthly').tax, 5208.33);
});

test('the annual table matches the TRAIN schedule used by annualisation', () => {
  const version = at('annualTax');
  assert.equal(graduatedTax(version, 250000, 'Annual').tax, 0);
  assert.equal(graduatedTax(version, 1000000, 'Annual').tax, 152500);
  assert.equal(graduatedTax(version, 8000000, 'Annual').tax, 2202500);
});

test('a De Minimis benefit is non-taxable only up to its own ceiling', () => {
  const version = at('deMinimis');
  const rules = deMinimisRules(version);
  assert.ok(rules.find(rule => rule.name === 'Rice Subsidy').ceiling === 24000);
  assert.ok(rules.find(rule => rule.name === 'Uniform and Clothing Allowance').ceiling === 7000);

  const fresh = splitDeMinimis(version, 'Rice Subsidy', 2000, 0);
  assert.equal(fresh.nonTaxable, 2000);
  assert.equal(fresh.taxable, 0);

  const exhausted = splitDeMinimis(version, 'Uniform and Clothing Allowance', 700, 7000);
  assert.equal(exhausted.nonTaxable, 0);
  assert.equal(exhausted.taxable, 700);

  const partial = splitDeMinimis(version, 'Uniform and Clothing Allowance', 700, 6500);
  assert.equal(partial.nonTaxable, 500);
  assert.equal(partial.taxable, 200);
});

test('a benefit with no published ceiling stays wholly non-taxable rather than failing', () => {
  const split = splitDeMinimis(at('deMinimis'), 'Something Unlisted', 1200, 0);
  assert.equal(split.nonTaxable, 1200);
  assert.equal(split.rule, null);
});

test('a compensation above the top bracket still resolves to the top bracket', () => {
  const row = bracketFor(at('sss'), 10000000);
  assert.equal(row.mscRegular, 20000);
});
