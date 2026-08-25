import { PAYROLL_RUNS_KEY } from './payrollRuns.js';

export const LEGACY_OPERATIONAL_COMPANY_ID = 'cmp-abc-001';

const parseRows = (storage, key) => {
  try {
    const rows = JSON.parse(storage?.getItem(key) || 'null');
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
};

export const operationalStorageKey = (workspaceKey, version = 1) => `atlas-operational-${workspaceKey}-v${version}`;

/**
 * Read only the active company's register rows. Historical unscoped prototype
 * rows belong to the original ABC company and are claimed lazily when read.
 */
export function readOperationalRowsForCompany(workspaceKey, companyId, storage = globalThis.localStorage, versions = [3, 2, 1]) {
  for (const version of versions) {
    const rows = parseRows(storage, operationalStorageKey(workspaceKey, version));
    const owned = rows.filter(row => row?.companyId === companyId);
    if (owned.length) return owned;
    if (companyId === LEGACY_OPERATIONAL_COMPANY_ID) {
      const legacy = rows.filter(row => row && !row.companyId);
      if (legacy.length) return legacy.map(row => ({ ...row, companyId }));
    }
  }
  return [];
}

/** Merge one company's register without deleting records owned by another. */
export function writeOperationalRowsForCompany(key, companyId, rows, storage = globalThis.localStorage) {
  const existing = parseRows(storage, key);
  const preserved = existing.filter(row => row?.companyId
    ? row.companyId !== companyId
    : companyId !== LEGACY_OPERATIONAL_COMPANY_ID);
  const owned = rows.map(row => ({ ...row, companyId }));
  try { storage?.setItem(key, JSON.stringify([...owned, ...preserved])); } catch { /* quota */ }
  return owned;
}

/** Remittance and journal links must resolve to this company's posted payroll. */
export function postedPayrollOptionsForCompany(companyId, storage = globalThis.localStorage) {
  const runs = parseRows(storage, `${PAYROLL_RUNS_KEY}:${companyId || 'default'}`);
  const posted = runs
    .filter(run => ['Posted', 'Locked'].includes(run.status))
    .map(run => run.transactionNumber)
    .filter(Boolean);
  return posted.length ? posted : ['No posted payroll transaction yet'];
}
