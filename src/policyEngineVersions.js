/**
 * Version history for the policy engines (Take-Home Pay, Retirement, Gross Up,
 * Final Pay). Every save becomes a numbered version with a status and an
 * effective date:
 *
 * - Draft      saved for review, not used by payroll
 * - Scheduled  approved, takes effect on a future date
 * - Active     the version payroll uses from its effective date
 * - Superseded replaced by a later Active version (kept for audit and re-runs)
 *
 * A payroll run reads the version in force on its payout date, so a change
 * dated next month does not alter this month's run.
 */

const key = companyId => `atlas-policy-engine-versions-v1:${companyId || 'default'}`;
const today = () => new Date().toISOString().slice(0, 10);

export function readEngineVersions(companyId, storage = globalThis.localStorage) {
  try { return JSON.parse(storage?.getItem(key(companyId)) || '{}') || {}; } catch { return {}; }
}

function write(companyId, all, storage = globalThis.localStorage) {
  storage?.setItem(key(companyId), JSON.stringify(all));
  return all;
}

export const engineHistory = (all, section) => all[section] || [];

/**
 * Records a save. `mode` is 'draft', or 'activate' with an effective date —
 * a future date schedules the version instead of making it Active now.
 */
export function recordEngineVersion(companyId, section, { values, mode = 'activate', effectiveDate = today(), by, reason, changes = [] }, storage) {
  const all = readEngineVersions(companyId, storage);
  const history = engineHistory(all, section);
  const number = (Math.max(0, ...history.map(item => Number.parseFloat(item.version) || 0)) + 1).toFixed(1);
  const status = mode === 'draft' ? 'Draft' : effectiveDate > today() ? 'Scheduled' : 'Active';
  const version = { version: number, status, effectiveDate: mode === 'draft' ? '' : effectiveDate, savedAt: new Date().toISOString(), by, reason, changes, values };
  const next = status === 'Active'
    ? history.map(item => (item.status === 'Active' ? { ...item, status: 'Superseded', supersededBy: number } : item))
    : history;
  write(companyId, { ...all, [section]: [version, ...next] }, storage);
  return version;
}

/** Moves a Draft to Active (or Scheduled when its date is still ahead). */
export function activateEngineVersion(companyId, section, versionNumber, { effectiveDate = today(), by } = {}, storage) {
  const all = readEngineVersions(companyId, storage);
  const status = effectiveDate > today() ? 'Scheduled' : 'Active';
  const history = engineHistory(all, section).map(item => {
    if (item.version === versionNumber) return { ...item, status, effectiveDate, activatedBy: by, activatedAt: new Date().toISOString() };
    if (status === 'Active' && item.status === 'Active') return { ...item, status: 'Superseded', supersededBy: versionNumber };
    return item;
  });
  write(companyId, { ...all, [section]: history }, storage);
  return history.find(item => item.version === versionNumber);
}

/** The values in force on a date: the latest Active or Scheduled version dated on or before it. */
export function engineValuesAsOf(all, section, asOf = today()) {
  const inForce = engineHistory(all, section)
    .filter(item => ['Active', 'Scheduled', 'Superseded'].includes(item.status) && item.effectiveDate && item.effectiveDate <= asOf)
    .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate) || Number(right.version) - Number(left.version));
  return inForce[0] || null;
}
