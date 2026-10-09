/**
 * Employee-level change audit for the pay-affecting masterfile sections
 * (Basic Pay, Earnings, Bonuses, Loans): who changed what, from and to which
 * value, when, and why. Edits and deletes need a reason; adds may carry one.
 */

const KEY = 'atlas-employee-change-log-v1';

export const AUDITED_SECTIONS = Object.freeze(['basicPay', 'earnings', 'bonuses', 'loans']);

const read = (storage = globalThis.localStorage) => {
  try { return JSON.parse(storage?.getItem(KEY) || '[]'); } catch { return []; }
};

/** Field-by-field differences between two versions of a record, labelled from the section's fields. */
export function recordChanges(fields, before = {}, after = {}) {
  return fields
    .filter(([key, , type]) => type !== 'computed' && String(before[key] ?? '') !== String(after[key] ?? ''))
    .map(([key, label]) => ({ field: key, label, from: String(before[key] ?? ''), to: String(after[key] ?? '') }));
}

export function readEmployeeChanges(employeeId, sectionKey, storage) {
  return read(storage).filter(entry => entry.employeeId === employeeId && (!sectionKey || entry.section === sectionKey));
}

export function logEmployeeChange({ employeeId, section, action, item, reason = '', changes = [], actor }, storage = globalThis.localStorage) {
  const entry = { id: `chg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), employeeId, section, action, item, reason, changes, by: actor };
  storage?.setItem(KEY, JSON.stringify([entry, ...read(storage)].slice(0, 2000)));
  return entry;
}
