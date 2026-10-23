import assert from 'node:assert/strict';
import test from 'node:test';
import { MWE_COLUMNS, MWE_LOCALITY_ROWS, MWE_RATE_ROWS, MWE_REGIONS, mweChoices, mweLocalityChoices, mweRegionHasClassification, mweRateOn, splitLocalityNames, withComputedMweRates, withMwePlace } from '../src/mweRates.js';

/**
 * Annex A, Sub Module 1, sheet "D2. MWE 2026 Updated Table": the rows, the
 * place a Minimum Wage Earner is described by, and the tranche in force.
 */
const rows = MWE_RATE_ROWS.map(row => withComputedMweRates(Object.fromEntries(MWE_COLUMNS.map((key, index) => [key, row[index]]))));
const place = (mweRegion, mweLocality, mweLocalityName, mweSector, mweClassification = '') => ({ mweRegion, mweLocality, mweLocalityName, mweSector, mweClassification });

test('every region of the 2026 table is loaded, each row with a wage order and an active rate', () => {
  assert.equal(MWE_REGIONS.length, 17);
  assert.ok(MWE_REGIONS.includes('NCR') && MWE_REGIONS.includes('BARMM'));
  rows.forEach(row => {
    assert.ok(Number(row.dailyRate) > 0, row.code);
    assert.ok(row.wageOrder.startsWith('Wage Order'), row.code);
    assert.ok(['City', 'Municipality', 'Province'].includes(row.locality), row.code);
  });
});

test('New Rate is the 1st tranche and Increase Rate is New less Old', () => {
  const ncr = rows.find(row => row.region === 'NCR' && row.localityName.includes('Manila') && row.sector === 'Non-Agriculture');
  assert.equal(ncr.newRate, '695');
  assert.equal(ncr.increaseRate, '50');
});

test('each place field only offers what has a rate under the choices above it', () => {
  assert.deepEqual(mweChoices(rows, 'mweLocality', { mweRegion: 'NCR' }), ['City', 'Municipality']);
  const names = mweChoices(rows, 'mweLocalityName', { mweRegion: 'NCR', mweLocality: 'City' });
  assert.ok(names.includes('Manila') && names.includes('Taguig') && !names.includes('Pateros'));
  assert.deepEqual(mweChoices(rows, 'mweClassification', { mweRegion: 'NCR', mweLocality: 'City', mweLocalityName: 'Manila' }), []);
  const calabarzon = { mweRegion: 'Region IV A – CALABARZON', mweLocality: 'Province', mweLocalityName: 'Cavite' };
  assert.equal(mweChoices(rows, 'mweClassification', calabarzon).length, 5);
});

test('a place listed with commas inside brackets stays one name', () => {
  assert.deepEqual(splitLocalityNames('North Cotabato (except the 63 barangays, now BARMM), Sarangani'), ['North Cotabato (except the 63 barangays, now BARMM)', 'Sarangani']);
});

test('the 2nd tranche replaces the 1st from its own effective date, and the old rate applies before the 1st', () => {
  const angeles = place('Region III – Central Luzon', 'City', 'Angeles', 'Non-Agriculture');
  assert.equal(mweRateOn(rows, angeles, '2025-10-29').dailyRate, 550);
  assert.equal(mweRateOn(rows, angeles, '2025-10-30').dailyRate, 570);
  assert.equal(mweRateOn(rows, angeles, '2026-04-15').dailyRate, 570);
  const second = mweRateOn(rows, angeles, '2026-04-16');
  assert.equal(second.dailyRate, 600);
  assert.equal(second.tranche, '2nd tranche');
});

test('the sector decides the rate for the same place', () => {
  const manila = sector => mweRateOn(rows, place('NCR', 'City', 'Manila', sector), '2026-01-01').dailyRate;
  assert.equal(manila('Non-Agriculture'), 695);
  assert.equal(manila('Agriculture (Plantation and Non-Plantation); Service/Retail employing 15 workers or less; Manufacturing employing less than 10 workers'), 658);
});

test('where the rate depends on Classification, none is guessed without one', () => {
  const cavite = classification => place('Region IV A – CALABARZON', 'Province', 'Cavite', 'Non-Agriculture', classification);
  assert.equal(mweRateOn(rows, cavite(''), '2026-10-06'), null);
  assert.equal(mweRateOn(rows, cavite('Extended Metropolitan Area'), '2026-10-06').dailyRate, 600);
  assert.equal(mweRateOn(rows, cavite('2nd to 5th Class Municipalities'), '2026-10-06').dailyRate, 525);
});

test('an entry saved with the earlier single Location keeps its place', () => {
  assert.deepEqual(withMwePlace({ mwe: 'Yes', location: 'NCR' }, rows), { mwe: 'Yes', mweRegion: 'NCR' });
  assert.deepEqual(withMwePlace({ mwe: 'Yes', location: 'Baguio' }, rows), { mwe: 'Yes', mweRegion: 'CAR', mweLocality: 'City', mweLocalityName: 'Baguio' });
});

test('the MWE Locality reference table lists each D2 place once, with None where there is no classification', () => {
  const keys = MWE_LOCALITY_ROWS.map(row => [row.region, row.locality, row.localityName, row.classification].join('|'));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(MWE_LOCALITY_ROWS.map(row => row.code)).size, MWE_LOCALITY_ROWS.length);
  assert.deepEqual(new Set(MWE_LOCALITY_ROWS.map(row => row.region)), new Set(MWE_REGIONS));
  const manila = MWE_LOCALITY_ROWS.find(row => row.region === 'NCR' && row.localityName === 'Manila');
  assert.deepEqual([manila.locality, manila.classification], ['City', 'None']);
  assert.ok(MWE_LOCALITY_ROWS.some(row => row.localityName === 'Cavite' && row.classification === 'Extended Metropolitan Area'));
});

test('Basic Pay place choices come from the reference table, and None finds an unclassified rate', () => {
  assert.deepEqual(mweLocalityChoices(MWE_LOCALITY_ROWS, 'mweLocality', { mweRegion: 'NCR' }), ['City', 'Municipality']);
  assert.ok(mweLocalityChoices(MWE_LOCALITY_ROWS, 'mweLocalityName', { mweRegion: 'NCR', mweLocality: 'City' }).includes('Taguig'));
  assert.equal(mweRegionHasClassification(MWE_LOCALITY_ROWS, 'NCR'), false);
  assert.equal(mweRegionHasClassification(MWE_LOCALITY_ROWS, 'Region IV A – CALABARZON'), true);
  const cavite = { mweRegion: 'Region IV A – CALABARZON', mweLocality: 'Province', mweLocalityName: 'Cavite' };
  assert.ok(mweLocalityChoices(MWE_LOCALITY_ROWS, 'mweClassification', cavite).includes('None'));
  const retail = 'Retail and Service Establishments Regularly Employing not more than 10 Workers';
  assert.deepEqual(mweChoices(rows, 'mweSector', { ...cavite, mweClassification: 'None' }), [retail]);
  assert.equal(mweRateOn(rows, { ...cavite, mweClassification: 'None', mweSector: retail }, '2026-10-06').dailyRate, 508);
  const inactive = MWE_LOCALITY_ROWS.map(row => (row.localityName === 'Pateros' ? { ...row, status: 'Inactive' } : row));
  assert.deepEqual(mweLocalityChoices(inactive, 'mweLocality', { mweRegion: 'NCR' }), ['City']);
});

test('Basic Pay has no Sector, so the place is checked against its lowest sector rate', () => {
  const manila = mweRateOn(rows, { mweRegion: 'NCR', mweLocality: 'City', mweLocalityName: 'Manila' }, '2026-01-01');
  assert.equal(manila.dailyRate, 658);
  const angeles = mweRateOn(rows, { mweRegion: 'Region III – Central Luzon', mweLocality: 'City', mweLocalityName: 'Angeles' }, '2026-04-16');
  assert.equal(angeles.dailyRate, 570);
  assert.equal(mweRateOn(rows, { mweRegion: 'Region IV A – CALABARZON', mweLocality: 'Province', mweLocalityName: 'Cavite', mweClassification: 'None' }, '2026-10-06').dailyRate, 508);
  assert.equal(mweRateOn(rows, { mweRegion: 'Region IV A – CALABARZON', mweLocality: 'Province', mweLocalityName: 'Cavite', mweClassification: 'Extended Metropolitan Area' }, '2026-10-06').dailyRate, 525);
});

test('a Sector saved on a Basic Pay entry is kept when it is opened', () => {
  assert.deepEqual(withMwePlace({ mwe: 'Yes', mweRegion: 'NCR', mweSector: 'Non-Agriculture' }, rows), { mwe: 'Yes', mweRegion: 'NCR', mweSector: 'Non-Agriculture' });
});
