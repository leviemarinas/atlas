/**
 * When a formula version is in force, and which date payroll uses to choose it.
 *
 * Gen Olan's comments on the Computational Basis slides asked for:
 *   • Effective From and Effective To on every formula version, with overlapping versions prevented;
 *   • future-dated activation that never touches a payroll before the version takes effect;
 *   • the date used to pick a version to depend on the requirement — "the system should not always
 *     use the payout date" — so each formula says whether payroll picks its version by the payout
 *     date, the payroll period start or end, or the timekeeping cut-off.
 *
 * The module is pure (dates in, answers out) so the library screen, the payroll engine and the
 * tests all read the same rules.
 */

export const DATE_BASES = Object.freeze(['Payout date', 'Payroll period start', 'Payroll period end', 'Timekeeping cut-off']);
export const DEFAULT_DATE_BASIS = 'Payout date';

const BASIS_FIELD = {
  'Payout date': 'payoutDate',
  'Payroll period start': 'periodStart',
  'Payroll period end': 'periodEnd',
  'Timekeeping cut-off': 'timekeepingEnd',
};

export const BASIS_HINT = Object.freeze({
  'Payout date': 'The date the payroll is paid. This is the usual choice for rates that apply when the money is released.',
  'Payroll period start': 'The first day of the pay period. Use it when the period as a whole is governed by what was in force when it began.',
  'Payroll period end': 'The last day of the pay period. Use it for values that apply to what was earned in the period.',
  'Timekeeping cut-off': 'The last day of the attendance cut-off. Use it for formulas driven by attendance.',
});

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIso = value => ISO.test(String(value || ''));

export function dayBefore(iso) {
  if (!isIso(iso)) return '';
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export const basisOf = record => (DATE_BASES.includes(record?.dateBasis) ? record.dateBasis : DEFAULT_DATE_BASIS);

/** The date of a payroll transaction that a formula's basis points at; the payout date when that one is blank. */
export function dateForBasis(run = {}, basis = DEFAULT_DATE_BASIS) {
  const field = BASIS_FIELD[basis] || 'payoutDate';
  return run?.[field] || run?.payoutDate || '';
}

const byVersion = (left, right) => Number(left.version) - Number(right.version);

/**
 * Every version of one formula as a dated timeline, oldest first.
 *
 * A version runs from its Effective From until the day before the next version starts, or until
 * its own Effective To when that is earlier. `current` is the live record; `snapshots` are the
 * published versions kept for payroll. A version in both is shown once, as the live one.
 */
export function versionTimeline(current, snapshots = [], today = '') {
  const code = String(current?.code || '').toUpperCase();
  const rows = new Map();
  snapshots.filter(item => String(item.code).toUpperCase() === code).forEach(item => rows.set(String(item.version), item));
  if (current) rows.set(String(current.version), { ...rows.get(String(current.version)), ...current });
  const ordered = [...rows.values()].sort(byVersion);
  return ordered.map((item, index) => {
    const next = ordered[index + 1];
    const from = item.effectiveDate || '';
    const ownEnd = item.effectiveTo || '';
    const replacedOn = next?.effectiveDate ? dayBefore(next.effectiveDate) : '';
    const to = [ownEnd, replacedOn].filter(Boolean).sort()[0] || '';
    let state = 'In force';
    if (from && today && from > today) state = 'Scheduled';
    else if (to && today && to < today) state = next ? 'Superseded' : 'Ended';
    return { ...item, from, to, openEnded: !to, state, supersededBy: next?.version || '' };
  });
}

/** The version whose period contains a date, or null when none does. */
export function versionOn(timeline = [], date) {
  if (!date) return null;
  return timeline.find(item => (!item.from || item.from <= date) && (!item.to || date <= item.to)) || null;
}

/** What a formula's current period looks like in one line, for tables. */
export function periodLabel(item) {
  const from = item?.from ?? item?.effectiveDate ?? '';
  const to = item?.to ?? item?.effectiveTo ?? '';
  return { from: from || '—', to: to || 'No end date' };
}

/**
 * Checks a new version's dates before it is submitted.
 *
 * `previous` is the version being replaced (the live record). `timeline` is the formula's existing
 * versions. Errors stop the save; warnings explain a consequence the maker should know about.
 */
export function checkVersionDates({ from, to, previous = null, timeline = [], today = '' } = {}) {
  const errors = [];
  const warnings = [];
  if (!isIso(from)) { errors.push('Give the date this version takes effect (Effective from).'); return { errors, warnings }; }
  if (to && !isIso(to)) errors.push('Effective to is not a valid date.');
  if (to && isIso(to) && to < from) errors.push('Effective to cannot be before Effective from.');
  if (previous) {
    const latest = timeline[timeline.length - 1];
    const latestFrom = latest?.from || previous.effectiveDate || '';
    if (latestFrom && from <= latestFrom) errors.push(`Version ${previous.version} already takes effect on ${latestFrom}. Two versions cannot overlap, so this one has to start after that date.`);
    else if (previous.effectiveTo && previous.effectiveTo < dayBefore(from)) warnings.push(`Version ${previous.version} ends on ${previous.effectiveTo}, so no version is in force from ${dayAfter(previous.effectiveTo)} to ${dayBefore(from)}. Payroll with a date in that gap has no formula.`);
    else if (latestFrom) warnings.push(`Version ${previous.version} will end on ${dayBefore(from)}, the day before this one starts.`);
  }
  if (!errors.length && today && from > today) warnings.push(`Scheduled: payroll with a date before ${from} keeps the version in force now.`);
  if (!errors.length && today && from < today && previous) warnings.push(`This starts in the past (${from}). Payrolls already processed keep the version they used; an open one picks this version up when it is recalculated.`);
  if (!errors.length && to) warnings.push(`This version stops applying after ${to}. Payroll dated later will not use it unless another version starts by then.`);
  return { errors, warnings };
}

export function dayAfter(iso) {
  if (!isIso(iso)) return '';
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The formula payroll should use for one run: the version in force on the date the formula's basis
 * points at. Falls back to the live record when no dated version covers that date, which is how
 * formulas that predate dating keep working.
 *
 * Returns { item, usedDate, basis, state } where `state` is 'current' | 'earlier version' | 'ended'.
 */
export function pickVersion(item, snapshots = [], run = null, fallbackDate = '') {
  const basis = basisOf(item);
  // A posted run's formulas come from the snapshot it captured; they are never re-chosen.
  if (item?.frozen) return { item, usedDate: '', basis, state: 'current' };
  const usedDate = run ? dateForBasis(run, basis) : fallbackDate;
  if (!usedDate) return { item, usedDate: '', basis, state: 'current' };
  const timeline = versionTimeline(item, snapshots);
  const found = versionOn(timeline, usedDate);
  if (found && String(found.version) === String(item.version)) return { item, usedDate, basis, state: 'current' };
  if (found) {
    return {
      item: { ...item, expression: found.expression, parameters: found.parameters || item.parameters, version: found.version, effectiveDate: found.from, effectiveTo: found.to, scheduledVersion: item.version },
      usedDate, basis, state: 'earlier version',
    };
  }
  // Nothing covers the date. After the last version has ended the formula no longer applies; before the
  // first one starts, keep the live record as before so undated history is not stranded.
  const last = timeline[timeline.length - 1];
  if (last?.to && usedDate > last.to) return { item: { ...item, status: 'Inactive', endedOn: last.to }, usedDate, basis, state: 'ended' };
  return { item, usedDate, basis, state: 'current' };
}
