import assert from 'node:assert/strict';
import test from 'node:test';
import { checkVersionDates, dateForBasis, dayAfter, dayBefore, pickVersion, versionOn, versionTimeline } from '../src/formulaVersioning.js';
import { computationsInForce } from '../src/payrollRuns.js';

/**
 * Effective From / To on formula versions, no overlapping versions, future-dated versions that leave
 * earlier payrolls alone, and the date a formula uses to choose its version (Gen Olan's comments).
 */
const v10 = { code: 'ERN-001', version: '1.0', expression: 'a', effectiveDate: '2026-01-01' };
const v11 = { code: 'ERN-001', version: '1.1', expression: 'b', effectiveDate: '2026-06-01' };
const live = (patch = {}) => ({ ...v11, status: 'Active', ...patch });

test('a version runs until the day before the next one starts', () => {
  const rows = versionTimeline(live(), [v10, v11], '2026-07-01');
  assert.deepEqual(rows.map(row => [row.version, row.from, row.to, row.state]), [['1.0', '2026-01-01', '2026-05-31', 'Superseded'], ['1.1', '2026-06-01', '', 'In force']]);
  assert.equal(rows[1].openEnded, true);
});

test('an Effective To ends a version even when nothing replaces it', () => {
  const rows = versionTimeline(live({ effectiveTo: '2026-12-31' }), [v10, v11], '2027-02-01');
  assert.equal(rows[1].to, '2026-12-31');
  assert.equal(rows[1].state, 'Ended');
});

test('a version dated in the future is Scheduled', () => {
  const rows = versionTimeline(live({ effectiveDate: '2027-01-01' }), [v10], '2026-10-12');
  assert.equal(rows[1].state, 'Scheduled');
  assert.equal(versionOn(rows, '2026-10-12').version, '1.0');
});

test('day helpers cross month and year boundaries', () => {
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayAfter('2026-12-31'), '2027-01-01');
});

test('a new version cannot start on or before the one it replaces', () => {
  const timeline = versionTimeline(live(), [v10, v11], '2026-07-01');
  assert.match(checkVersionDates({ from: '2026-06-01', previous: live(), timeline, today: '2026-07-01' }).errors[0], /cannot overlap/);
  assert.match(checkVersionDates({ from: '2026-05-01', previous: live(), timeline, today: '2026-07-01' }).errors[0], /cannot overlap/);
  assert.equal(checkVersionDates({ from: '2026-07-02', previous: live(), timeline, today: '2026-07-01' }).errors.length, 0);
});

test('Effective to cannot be before Effective from, and dates are required', () => {
  assert.match(checkVersionDates({ from: '', today: '2026-07-01' }).errors[0], /Effective from/);
  assert.match(checkVersionDates({ from: '2026-08-01', to: '2026-07-01', today: '2026-07-01' }).errors[0], /before Effective from/);
});

test('warnings explain a scheduled, backdated or gap-leaving version', () => {
  const timeline = versionTimeline(live(), [v10, v11], '2026-07-01');
  assert.match(checkVersionDates({ from: '2026-09-01', previous: live(), timeline, today: '2026-07-01' }).warnings.join(' '), /Scheduled/);
  assert.match(checkVersionDates({ from: '2026-06-15', previous: live(), timeline, today: '2026-07-01' }).warnings.join(' '), /starts in the past/);
  const ended = live({ effectiveTo: '2026-08-31' });
  assert.match(checkVersionDates({ from: '2026-10-01', previous: ended, timeline: versionTimeline(ended, [v10, v11], '2026-07-01'), today: '2026-07-01' }).warnings.join(' '), /no version is in force from 2026-09-01 to 2026-09-30/);
});

test('each formula picks its version by the date it names', () => {
  const run = { payoutDate: '2026-06-05', periodStart: '2026-05-16', periodEnd: '2026-05-31', timekeepingEnd: '2026-05-25' };
  assert.equal(dateForBasis(run, 'Payout date'), '2026-06-05');
  assert.equal(dateForBasis(run, 'Payroll period end'), '2026-05-31');
  assert.equal(dateForBasis(run, 'Timekeeping cut-off'), '2026-05-25');
  // v1.1 starts on 1 June: paid on 5 June but earned in May.
  assert.equal(pickVersion(live(), [v10, v11], run).item.version, '1.1');
  const byPeriod = pickVersion(live({ dateBasis: 'Payroll period end' }), [v10, v11], run);
  assert.equal(byPeriod.item.version, '1.0');
  assert.equal(byPeriod.usedDate, '2026-05-31');
  assert.equal(byPeriod.state, 'earlier version');
});

test('a blank basis date falls back to the payout date', () => {
  assert.equal(dateForBasis({ payoutDate: '2026-06-05' }, 'Payroll period end'), '2026-06-05');
});

test('payroll uses the version in force and drops a formula whose period has ended', () => {
  const run = { payoutDate: '2027-02-01', periodEnd: '2027-01-31' };
  const ended = live({ effectiveTo: '2026-12-31' });
  const [item] = computationsInForce([ended], run.payoutDate, [v10, v11], run);
  assert.equal(item.status, 'Inactive');
  assert.equal(item.endedOn, '2026-12-31');
  const [open] = computationsInForce([live()], run.payoutDate, [v10, v11], run);
  assert.equal(open.status, 'Active');
  assert.equal(open.appliedOn, '2027-02-01');
});

test('a posted payroll keeps the formulas it captured', () => {
  const frozen = { ...v10, frozen: true, status: 'Active' };
  const [item] = computationsInForce([frozen], '2026-09-01', [v10, v11], { payoutDate: '2026-09-01' });
  assert.equal(item.version, '1.0');
});

test('a formula with no dated version covering the date keeps working', () => {
  const [item] = computationsInForce([live({ effectiveDate: '2027-01-01' })], '2026-02-01', [], { payoutDate: '2026-02-01' });
  assert.equal(item.version, '1.1');
});
