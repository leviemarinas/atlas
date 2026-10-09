/**
 * Governance for the Computational Basis: who owns a computation, which company
 * it applies to, which version a payroll transaction actually used, and what
 * that usage then forbids.
 *
 * The shape this module enforces is P&A's Controlled Hybrid approach, agreed on
 * 1 September 2026:
 *
 *   One central library — every formula is held once, in Settings › Standard
 *        Computation Library, and authored only by P&A. Its scope is either an
 *        Atlas standard (assignable to any company) or client-specific (built
 *        by P&A for one client and only ever assigned to that client).
 *   Assigned, never copied — a company sees and uses only the formulas P&A
 *        assigned to it. The company record says whether a formula is assigned
 *        there and whether it is Active there.
 *   Parameters, not logic — a client changes only the values a formula marks as
 *        client-editable, inside the approved range, on its own pay items. It
 *        never edits an expression.
 *
 * A formula a company authored before that rule is moved into the central
 * library as a client-specific formula owned by that company.
 *
 * Everything a company owns — its own computations, applicability decisions,
 * assignments, formula reference sources, published versions and change history
 * — is stored under a key suffixed with the company id, so two companies on the
 * same browser never read each other's configuration.
 *
 * `payrollUsage` is what makes the delete and deactivate rules provable rather
 * than advisory: it reads the company's payroll transactions and reports which
 * ones referenced a code, and which of those were posted.
 */

import {
  LEGACY_EXPRESSIONS,
  categoryPrefixes,
  coreComputations,
  coreParameters,
  describeParameters,
  nextComputationCode,
  normalizeParameters,
  prefixForCategory,
  seedComputations,
} from './computationCatalog.js';
import { BINDABLE_MODULES } from './computationBindings.js';
import { PAYROLL_RUNS_KEY } from './payrollRuns.js';
import { seedReferences } from './referenceSources.js';

/* ------------------------------------------------------------------ storage */

/** Global — the single central Atlas standard library. Never company-scoped. */
export const STANDARD_LIBRARY_KEY = 'atlas-standard-computation-library-v4';
/** Global — which companies each standard is applied to, and its status there. */
export const APPLICABILITY_KEY = 'atlas-standard-computation-applicability-v4';
/** Global — published version snapshots of the standard library. */
export const STANDARD_VERSIONS_KEY = 'atlas-standard-computation-versions-v4';

const COMPANY_KEYS = {
  computations: 'atlas-company-computations-v4',
  assignments: 'atlas-computation-assignments-v4',
  references: 'atlas-computation-references-v4',
  history: 'atlas-computation-history-v4',
  versions: 'atlas-computation-versions-v4',
};

/** The v3 keys, read once so an existing preview keeps the data it had. */
const LEGACY_KEYS = {
  computations: 'atlas-computational-basis-library-v3',
  assignments: 'atlas-computational-basis-assignments-v3',
  references: 'atlas-computational-basis-references-v3',
  history: 'atlas-computational-basis-history-v3',
};

const store = () => globalThis.localStorage;

const companyKey = (part, companyId) => `${COMPANY_KEYS[part]}:${companyId || 'default'}`;

function readJson(key, fallback) {
  try {
    const raw = store()?.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch { return fallback; }
}

function writeJson(key, value) {
  try { store()?.setItem(key, JSON.stringify(value)); } catch { /* preview quota */ }
  return value;
}

const stamp = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const displayDate = () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const displayStamp = () => new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const normalizeCode = code => String(code || '').trim().toUpperCase();

/* --------------------------------------------------- the standard library */

export const FORMULA_SCOPES = Object.freeze(['Atlas standard', 'Client-specific']);

/**
 * Atlas standard or client-specific. A record from before the Controlled
 * Hybrid decision that a company authored itself reads as client-specific.
 */
export function computationScope(record) {
  return record?.scope === 'Client-specific' || record?.isBuiltIn === false ? 'Client-specific' : 'Atlas standard';
}

export const companyLabel = company => company?.displayName || company?.legalName || company?.companyCode || company?.companyId || '';

const asStandard = record => ({ ...record, isBuiltIn: true, scope: computationScope(record), parameters: record.parameters || {} });

const clone = value => JSON.parse(JSON.stringify(value));

/**
 * Bring a stored library up to the published standards.
 *
 * Three standards used to carry a rate typed into the expression (night
 * differential 10 %, commission 5 %, expanded withholding 2 %), which a client
 * could only change by editing the formula. Those rates are now named
 * parameters, so a stored library still holding the old expression is moved on
 * once — as a new version, with the old one kept for the payrolls that used it.
 * Parameter definitions a stored core standard lacks are filled in.
 */
function upgradeStandardLibrary(list) {
  let changed = false;
  const upgraded = list.map(record => {
    const code = normalizeCode(record.code);
    const seed = coreComputations.find(([seedCode]) => seedCode === code);
    let next = record;
    if (!next.scope) { next = { ...next, scope: computationScope(next) }; changed = true; }
    const legacy = LEGACY_EXPRESSIONS[code];
    if (seed && legacy && computationScope(next) === 'Atlas standard'
      && String(next.expression || '').replace(/\s+/g, '') === legacy.replace(/\s+/g, '')) {
      const previous = { ...next, isBuiltIn: true };
      next = {
        ...next,
        expression: seed[3],
        description: seed[4],
        version: (Number(next.version || '1.0') + 0.1).toFixed(1),
        parameters: clone(coreParameters[code] || {}),
        updatedBy: 'P&A Admin',
        updatedAt: displayDate(),
      };
      publishUpgrade(previous, { ...next, isBuiltIn: true });
      changed = true;
    }
    if (seed && coreParameters[code] && !Object.keys(next.parameters || {}).length) {
      const parameters = normalizeParameters(next.expression, coreParameters[code]);
      if (Object.keys(parameters).length) { next = { ...next, parameters }; changed = true; }
    }
    if (!next.parameters) { next = { ...next, parameters: {} }; changed = true; }
    return next;
  });
  return { list: upgraded, changed };
}

/** Both ends of an upgrade go into version history, so the old expression stays resolvable. */
function publishUpgrade(previous, next) {
  const code = normalizeCode(previous.code);
  if (!readVersions('standard', true).some(item => item.code === code && item.version === previous.version)) {
    appendVersion('standard', previous, { note: 'Published version before its rate became a named parameter.', actor: 'System Standard' });
  }
  appendVersion('standard', next, {
    note: 'Atlas standard update: the rate typed into the expression is now a named parameter with an approved range.',
    changes: diffComputation(previous, next),
    actor: 'P&A Admin',
  });
}

/**
 * The central library — every formula, Atlas standard and client-specific
 * alike. Seeded from `seedComputations()` the first time it is read, and
 * migrated from the v3 combined library when one exists so a preview that
 * already had edited standards does not lose them.
 */
export function readStandardLibrary() {
  const saved = readJson(STANDARD_LIBRARY_KEY, null);
  if (Array.isArray(saved) && saved.length) {
    const { list, changed } = upgradeStandardLibrary(saved);
    if (changed) writeJson(STANDARD_LIBRARY_KEY, list.map(asStandard));
    return list.map(asStandard);
  }
  const legacy = readJson(LEGACY_KEYS.computations, null);
  const migrated = Array.isArray(legacy) && legacy.length
    ? legacy.filter(item => item.isBuiltIn !== false).map(asStandard)
    : seedComputations();
  const stored = upgradeStandardLibrary(migrated).list.map(asStandard);
  writeJson(STANDARD_LIBRARY_KEY, stored);
  return stored;
}

export function writeStandardLibrary(library) {
  return writeJson(STANDARD_LIBRARY_KEY, library.map(asStandard));
}

/* ---------------------------------------------------------- applicability */

/**
 * `{ [code]: { [companyId]: { applied, status, updatedBy, updatedAt } } }`.
 *
 * `applied` is P&A's assignment of a formula to a company. Under the
 * Controlled Hybrid approach a company sees and uses only what P&A assigned,
 * so an absent entry means *not assigned*. A company's onboarding baseline is
 * written as explicit entries by `ensureOnboardingBaseline`.
 */
export const DEFAULT_APPLICABILITY = Object.freeze({ applied: false, status: 'Active' });

export function readApplicability() {
  const saved = readJson(APPLICABILITY_KEY, {});
  return saved && typeof saved === 'object' ? saved : {};
}

export function writeApplicability(map) {
  return writeJson(APPLICABILITY_KEY, map);
}

export function applicabilityFor(code, companyId, map = readApplicability()) {
  const entry = map?.[normalizeCode(code)]?.[companyId || 'default'];
  return { ...DEFAULT_APPLICABILITY, ...(entry || {}) };
}

export function setApplicability(code, companyId, patch, actor = 'P&A Admin') {
  const key = normalizeCode(code);
  const scope = companyId || 'default';
  const map = readApplicability();
  const current = applicabilityFor(key, scope, map);
  // Status history: every change to an assignment, who made it and when.
  const changed = Object.entries(patch).filter(([field, value]) => field !== 'history' && String(current[field] ?? '') !== String(value ?? ''));
  const history = changed.length
    ? [{ at: stamp(), by: actor, changes: changed.map(([field, value]) => ({ field, from: current[field] ?? '', to: value })) }, ...(current.history || [])]
    : current.history || [];
  const next = {
    ...map,
    [key]: {
      ...(map[key] || {}),
      [scope]: { ...current, ...patch, history, updatedBy: actor, updatedAt: stamp() },
    },
  };
  writeApplicability(next);
  return applicabilityFor(key, scope, next);
}

const BASELINE_KEY = 'atlas-computation-onboarding-baseline-v1';

/** Every formula code a company's own payroll, pipeline or pay items already use. */
function codesInUse(companyId) {
  const fromRuns = Object.keys(usageIndexFromRuns(readCompanyRuns(companyId)));
  const assignments = readJson(companyKey('assignments', companyId), []);
  const fromAssignments = Array.isArray(assignments) ? assignments.map(item => item?.computationCode) : [];
  const fromConfigurations = Object.keys(BINDABLE_MODULES).flatMap(moduleKey => {
    const records = readJson(`atlas-service-${moduleKey}:${companyId}`, []);
    return Array.isArray(records) ? records.map(record => record?.computationCode) : [];
  });
  return [...fromRuns, ...fromAssignments, ...fromConfigurations].filter(Boolean);
}

/**
 * The formulas a company is assigned at onboarding.
 *
 * A company opened for the first time — or one that predates the Controlled
 * Hybrid rule — is given its baseline once: the core Atlas payroll set the
 * engine computes with, plus any code its own payroll, pipeline assignments or
 * pay items already use. Nothing it relies on today is withdrawn; the optional
 * standards arrive only when P&A assigns them. The baseline is recorded, so a
 * formula P&A later withdraws is not assigned again on the next read, and an
 * explicit decision already on file is never overwritten.
 */
export function ensureOnboardingBaseline(companyId) {
  const scope = companyId || 'default';
  const key = `${BASELINE_KEY}:${scope}`;
  if (readJson(key, null)) return false;
  const map = readApplicability();
  const next = { ...map };
  const wanted = new Set([...coreComputations.map(([code]) => code), ...codesInUse(scope)].map(normalizeCode));
  let assigned = 0;
  wanted.forEach(code => {
    if (next[code]?.[scope]) return;
    next[code] = { ...(next[code] || {}), [scope]: { applied: true, status: 'Active', updatedBy: 'Onboarding baseline', updatedAt: stamp() } };
    assigned += 1;
  });
  writeApplicability(next);
  writeJson(key, { recordedAt: stamp(), assigned });
  return true;
}

/* ------------------------------------------------- company-defined records */

/**
 * Migration runs once per company and is recorded, so a company that has since
 * deleted a migrated record does not have it resurrected from the v3 key on the
 * next read.
 */
const MIGRATION_KEY = 'atlas-computation-migrated-v4';

function migrated(part, companyId) {
  return readJson(`${MIGRATION_KEY}:${part}:${companyId || 'default'}`, false) === true;
}

function markMigrated(part, companyId) {
  writeJson(`${MIGRATION_KEY}:${part}:${companyId || 'default'}`, true);
}

export function readCompanyComputations(companyId) {
  const saved = readJson(companyKey('computations', companyId), null);
  if (Array.isArray(saved) || migrated('computations', companyId)) {
    return (saved || []).map(item => ({ ...item, isBuiltIn: false, companyId }));
  }
  const legacy = readJson(LEGACY_KEYS.computations, null);
  const carried = Array.isArray(legacy)
    ? legacy.filter(item => item.isBuiltIn === false).map(item => ({ ...item, isBuiltIn: false, companyId }))
    : [];
  writeJson(companyKey('computations', companyId), carried);
  markMigrated('computations', companyId);
  return carried;
}

export function writeCompanyComputations(companyId, list) {
  return writeJson(companyKey('computations', companyId), list.map(item => ({ ...item, isBuiltIn: false, companyId })));
}

/**
 * Move a company's own formulas into the central library.
 *
 * Before the Controlled Hybrid decision a company could author formulas in its
 * own store. Every formula now lives once, centrally, owned by P&A, so each of
 * those records becomes a client-specific formula owned by that company and
 * assigned only to it — same code, same versions, same status. A code another
 * formula already holds centrally is renumbered from the category and keeps
 * `formerCode`. It runs on every read and is idempotent: the company store is
 * emptied as its records move.
 */
export function migrateCompanyComputations(companyId) {
  const scope = companyId || 'default';
  const own = readCompanyComputations(scope);
  if (!own.length) return [];
  const central = readStandardLibrary();
  const taken = new Set(central.map(item => normalizeCode(item.code)));
  const renamed = new Map();
  const moved = own.map(record => {
    const original = normalizeCode(record.code);
    let code = original;
    if (taken.has(code)) code = nextComputationCode(record.category, [...taken].map(item => ({ code: item })));
    taken.add(code);
    renamed.set(original, code);
    return {
      ...record,
      code,
      ...(code !== original ? { formerCode: original } : {}),
      id: record.id ?? `${scope}-${code}`,
      isBuiltIn: true,
      scope: 'Client-specific',
      ownerCompanyId: scope,
      parameters: record.parameters || {},
    };
  });
  writeStandardLibrary([...moved, ...central]);

  const companyVersions = readVersions(scope, false);
  const carried = companyVersions
    .filter(item => renamed.has(item.code))
    .map(item => ({ ...item, code: renamed.get(item.code), isBuiltIn: true, scope: 'Client-specific', ownerCompanyId: scope }));
  writeJson(STANDARD_VERSIONS_KEY, [...carried, ...readVersions(scope, true)]);
  writeJson(companyKey('versions', scope), companyVersions.filter(item => !renamed.has(item.code)));

  const map = readApplicability();
  moved.forEach(record => {
    map[record.code] = { ...(map[record.code] || {}), [scope]: { applied: true, status: record.status === 'Inactive' ? 'Inactive' : 'Active', updatedBy: 'Moved to the central library', updatedAt: stamp() } };
  });
  writeApplicability(map);
  writeCompanyComputations(scope, []);
  return moved;
}

/**
 * The formulas assigned to one company, carrying that company's own
 * Active/Inactive status. The central record is shared, never copied.
 */
export function readAppliedStandards(companyId) {
  ensureOnboardingBaseline(companyId);
  const applicability = readApplicability();
  const owner = companyId || 'default';
  return readStandardLibrary()
    // A client-specific formula is only ever visible to the client it was built
    // for, whatever an assignment record might say.
    .filter(record => computationScope(record) !== 'Client-specific' || record.ownerCompanyId === owner)
    .map(record => ({ record, scope: applicabilityFor(record.code, companyId, applicability) }))
    .filter(({ scope }) => scope.applied)
    .map(({ record, scope }) => ({
      ...record,
      isBuiltIn: true,
      // The company's own activation decision wins over the central status; a
      // standard the company switched off must not compute here, and one the
      // central library retired must not compute anywhere.
      status: record.status === 'Inactive' ? 'Inactive' : scope.status,
      centralStatus: record.status,
      companyStatus: scope.status,
    }));
}

/**
 * The library one company computes against: the standards applied to it plus
 * the computations the company defined itself. This is the list the screens
 * render and the list the payroll engine resolves codes against.
 */
export function readComputationLibrary(companyId) {
  migrateCompanyComputations(companyId);
  return [...readCompanyComputations(companyId), ...readAppliedStandards(companyId)];
}

/* ------------------------------------------------------------ assignments */

export function readAssignments(companyId, fallback = []) {
  const saved = readJson(companyKey('assignments', companyId), null);
  if (Array.isArray(saved) || migrated('assignments', companyId)) {
    return (saved || []).map(item => ({ effectiveDate: '2026-01-01', ...item }));
  }
  const legacy = readJson(LEGACY_KEYS.assignments, null);
  const seeded = (Array.isArray(legacy) && legacy.length ? legacy : fallback)
    .map(item => ({ effectiveDate: '2026-01-01', ...item }));
  writeJson(companyKey('assignments', companyId), seeded);
  markMigrated('assignments', companyId);
  return seeded;
}

export function writeAssignments(companyId, assignments) {
  return writeJson(companyKey('assignments', companyId), assignments);
}

/* ------------------------------------------------------- reference sources */

/**
 * A reference source keeps its superseded versions rather than overwriting
 * them, because a payroll computed in January must still resolve the ceiling
 * that was effective in January after a new one is published in July.
 */
export function withReferenceVersion(reference, { entries, effectiveDate, version, note, actor }) {
  const history = Array.isArray(reference.versions) ? reference.versions : [];
  const current = {
    version: reference.version,
    effectiveDate: reference.effectiveDate,
    entries: (reference.entries || []).map(entry => ({ ...entry })),
    publishedAt: reference.publishedAt || stamp(),
    publishedBy: reference.publishedBy || 'System Standard',
    note: reference.versionNote || 'Initial published version',
  };
  const superseded = history.some(item => item.version === current.version) ? history : [...history, current];
  return {
    ...reference,
    version,
    effectiveDate: effectiveDate || reference.effectiveDate,
    entries,
    publishedAt: stamp(),
    publishedBy: actor || 'Client Admin',
    versionNote: note || '',
    versions: superseded.sort((left, right) => String(left.effectiveDate).localeCompare(String(right.effectiveDate))),
  };
}

/** Every published version of a source, current one included, oldest first. */
export function referenceVersionHistory(reference) {
  const history = Array.isArray(reference?.versions) ? reference.versions : [];
  const current = {
    version: reference?.version,
    effectiveDate: reference?.effectiveDate,
    entries: reference?.entries || [],
    publishedAt: reference?.publishedAt || '',
    publishedBy: reference?.publishedBy || '',
    note: reference?.versionNote || '',
    current: true,
  };
  return [...history.map(item => ({ ...item, current: false })), current]
    .sort((left, right) => String(left.effectiveDate).localeCompare(String(right.effectiveDate)));
}

/**
 * The version of a reference source that was in force on a date. Payroll
 * resolves through this, so re-opening an August transaction shows the August
 * values even after a newer version is published.
 */
export function resolveReferenceVersion(reference, asOf = today()) {
  const history = referenceVersionHistory(reference);
  const effective = history.filter(item => !item.effectiveDate || String(item.effectiveDate) <= String(asOf));
  return effective[effective.length - 1] || history[0] || null;
}

export function readReferences(companyId, fallback = seedReferences()) {
  const saved = readJson(companyKey('references', companyId), null);
  const base = Array.isArray(saved) && saved.length ? saved : null;
  if (base) return base.map(item => ({ versions: [], publishedBy: 'System Standard', ...item }));
  const legacy = readJson(LEGACY_KEYS.references, null);
  const seeded = (Array.isArray(legacy) && legacy.length ? legacy : fallback)
    .map(item => ({ versions: [], publishedBy: 'System Standard', publishedAt: stamp(), ...item }));
  if (seeded.length) writeJson(companyKey('references', companyId), seeded);
  return seeded;
}

export function writeReferences(companyId, references) {
  return writeJson(companyKey('references', companyId), references);
}

/* --------------------------------------------------------- change history */

export function readHistory(companyId, fallback = []) {
  const saved = readJson(companyKey('history', companyId), null);
  if (Array.isArray(saved) || migrated('history', companyId)) return saved || [];
  const legacy = readJson(LEGACY_KEYS.history, null);
  const seeded = Array.isArray(legacy) && legacy.length ? legacy : fallback;
  writeJson(companyKey('history', companyId), seeded);
  markMigrated('history', companyId);
  return seeded;
}

export function writeHistory(companyId, history) {
  return writeJson(companyKey('history', companyId), history);
}

/**
 * The fields whose before/after values a reviewer needs to see. Change history
 * records the change itself, not only that something changed, so "who changed
 * what, when, and which version was affected" is answerable from the log.
 */
const TRACKED_FIELDS = [
  ['expression', 'Expression'],
  ['status', 'Status'],
  ['effectiveDate', 'Effective date'],
  ['name', 'Computation name'],
  ['category', 'Category'],
  ['description', 'Description'],
  ['parameters', 'Parameters'],
];

// Parameters are an object, so they are compared and shown as one readable line.
const trackedValue = (key, record) => (key === 'parameters' ? describeParameters(record?.parameters || {}) : record?.[key] ?? '');

export function diffComputation(previous, next) {
  if (!previous) return [];
  return TRACKED_FIELDS
    .map(([key, label]) => ({ field: label, from: trackedValue(key, previous), to: trackedValue(key, next) }))
    .filter(change => String(change.from) !== String(change.to));
}

export function historyEntry({ item, type, action, version, user, changes = [], code = '' }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    item,
    code,
    type,
    action,
    version,
    user: user || 'Client Admin',
    date: displayStamp(),
    changes,
  };
}

/* -------------------------------------------------------- version snapshots */

const versionsKey = (companyId, isBuiltIn) => (isBuiltIn ? STANDARD_VERSIONS_KEY : companyKey('versions', companyId));

/**
 * One immutable snapshot per published version, carrying the expression that
 * version published and the test evidence recorded for it. Payroll points at a
 * snapshot rather than at the live record, which is what lets an August
 * transaction keep reproducing `ERN-002 v1.3` after the formula becomes v1.4.
 */
export function readVersions(companyId, isBuiltIn = false) {
  const saved = readJson(versionsKey(companyId, isBuiltIn), []);
  return Array.isArray(saved) ? saved : [];
}

export function appendVersion(companyId, record, { test = null, changes = [], note = '', actor = 'Client Admin', source = 'Screen', approvalRef = '' } = {}) {
  const isBuiltIn = record.isBuiltIn !== false;
  const key = versionsKey(companyId, isBuiltIn);
  const existing = readVersions(companyId, isBuiltIn);
  const snapshot = {
    code: normalizeCode(record.code),
    version: record.version,
    name: record.name,
    category: record.category,
    expression: record.expression,
    description: record.description || '',
    status: record.status,
    effectiveDate: record.effectiveDate,
    isBuiltIn,
    scope: computationScope(record),
    ownerCompanyId: record.ownerCompanyId || '',
    parameters: record.parameters || {},
    publishedAt: stamp(),
    publishedBy: actor,
    note,
    changes,
    test,
    // Where the change came from and the approval it was made under.
    source,
    approvalRef,
    testCases: record.testCases || [],
  };
  const next = [snapshot, ...existing.filter(item => !(item.code === snapshot.code && item.version === snapshot.version))];
  writeJson(key, next);
  return snapshot;
}

/** Every published version of one code, newest first. */
export function versionsOf(code, companyId) {
  const wanted = normalizeCode(code);
  return [...readVersions(companyId, true), ...readVersions(companyId, false)]
    .filter(item => item.code === wanted)
    .sort((left, right) => Number(right.version) - Number(left.version));
}

/**
 * The exact record a payroll transaction should compute with.
 *
 * A transaction that recorded a version resolves to that snapshot even when the
 * live record has moved on. Only when no snapshot was kept does it fall back to
 * the current definition, and the caller is told which happened.
 */
export function resolveComputationVersion(code, version, companyId, library = null) {
  const wanted = normalizeCode(code);
  const snapshot = version
    ? versionsOf(wanted, companyId).find(item => String(item.version) === String(version))
    : null;
  if (snapshot) return { ...snapshot, resolvedFrom: 'version snapshot' };
  const current = (library || readComputationLibrary(companyId)).find(item => normalizeCode(item.code) === wanted);
  return current ? { ...current, resolvedFrom: 'current definition' } : null;
}

/* ------------------------------------------------------------ payroll usage */

const POSTED_STATUSES = ['Posted', 'Locked'];
// The statuses whose `recalculate` capability is on in payrollRuns.js: a run in
// one of them computes against the current library the next time it is run.
const RECALCULABLE_STATUSES = ['Open', 'For Review', 'For Approval'];

/**
 * The pay items, across the given companies, that compute with a formula.
 * A new version that adds a variable leaves each of them to be told where the
 * new value comes from, so the formula editor names them.
 */
export function payItemsUsing(code, companies = []) {
  const wanted = normalizeCode(code);
  return companies.flatMap(company => Object.keys(BINDABLE_MODULES).flatMap(moduleKey => {
    const records = readJson(`atlas-service-${moduleKey}:${company.companyId}`, []);
    return (Array.isArray(records) ? records : [])
      .filter(record => normalizeCode(record?.computationCode) === wanted)
      .map(record => ({ companyId: company.companyId, companyName: companyLabel(company), moduleKey, code: record.code, name: record.name || record.code }));
  }));
}

/**
 * Which payroll transactions referenced a computation code.
 *
 * A code is "used" when a computed line printed a step for it, or when the run
 * captured it in its computation snapshot. Cancelled transactions do not count
 * — nothing was ever released from them.
 */
export function usageFromRuns(code, runs = []) {
  const wanted = normalizeCode(code);
  const touched = runs
    .filter(run => run.status !== 'Cancelled')
    .filter(run => {
      const snapshot = run.result?.computationSnapshot || run.computationSnapshot;
      if (snapshot?.entries?.some(entry => normalizeCode(entry.code) === wanted)) return true;
      return (run.result?.lines || []).some(line => (line.steps || []).some(step => normalizeCode(step.code) === wanted));
    })
    .map(run => {
      const snapshot = run.result?.computationSnapshot || run.computationSnapshot;
      const entry = snapshot?.entries?.find(item => normalizeCode(item.code) === wanted);
      const step = (run.result?.lines || [])
        .flatMap(line => line.steps || [])
        .find(item => normalizeCode(item.code) === wanted);
      return {
        runId: run.id,
        transactionNumber: run.transactionNumber,
        status: run.status,
        payoutDate: run.payoutDate || '',
        period: `${run.month || ''} ${run.year || ''}`.trim(),
        version: entry?.version || step?.version || '',
        expression: entry?.expression || step?.expression || '',
        posted: POSTED_STATUSES.includes(run.status),
      };
    })
    .sort((left, right) => String(right.payoutDate).localeCompare(String(left.payoutDate)));
  return {
    code: wanted,
    transactions: touched,
    posted: touched.filter(item => item.posted),
    versions: [...new Set(touched.map(item => item.version).filter(Boolean))],
  };
}

/**
 * Usage for every code a register shows, built from one pass over the
 * transactions. A 200-row register must not re-read the transaction store once
 * per row.
 */
export function usageIndexFromRuns(runs = []) {
  const codes = new Set();
  runs.filter(run => run.status !== 'Cancelled').forEach(run => {
    (run.result?.computationSnapshot?.entries || run.computationSnapshot?.entries || [])
      .forEach(entry => codes.add(normalizeCode(entry.code)));
    (run.result?.lines || []).forEach(line => (line.steps || []).forEach(step => codes.add(normalizeCode(step.code))));
  });
  return Object.fromEntries([...codes].map(code => [code, usageFromRuns(code, runs)]));
}

const EMPTY_USAGE = Object.freeze({ transactions: [], posted: [], versions: [] });

export function usageOf(code, index = {}) {
  return index[normalizeCode(code)] || { ...EMPTY_USAGE, code: normalizeCode(code) };
}

/**
 * Published versions grouped by code, for the same reason.
 *
 * `standardOnly` is what Settings asks for: the central library's own versions,
 * without any one company's company-defined ones mixed in.
 */
export function versionIndex(companyId, { standardOnly = false } = {}) {
  const all = standardOnly
    ? readVersions(companyId, true)
    : [...readVersions(companyId, true), ...readVersions(companyId, false)];
  return all.reduce((grouped, snapshot) => {
    const list = grouped[snapshot.code] || [];
    grouped[snapshot.code] = [...list, snapshot].sort((left, right) => Number(right.version) - Number(left.version));
    return grouped;
  }, {});
}

export function readCompanyRuns(companyId) {
  const saved = readJson(`${PAYROLL_RUNS_KEY}:${companyId || 'default'}`, []);
  return Array.isArray(saved) ? saved : [];
}

export function payrollUsage(code, companyId) {
  return usageFromRuns(code, readCompanyRuns(companyId));
}

/**
 * An Atlas standard is one central record shared by every company, so what it
 * may still be changed to depends on every company's payroll, not one. Each
 * transaction is labelled with the company it came from, because "used by
 * Northstar" is the answer a P&A Admin needs before editing a standard.
 */
export function usageAcrossCompanies(code, companies = []) {
  const perCompany = companies.map(company => ({
    company,
    usage: usageFromRuns(code, readCompanyRuns(company.companyId)),
  }));
  const transactions = perCompany.flatMap(({ company, usage }) =>
    usage.transactions.map(item => ({ ...item, companyId: company.companyId, companyName: company.displayName || company.legalName || company.companyCode || company.companyId })));
  return {
    code: normalizeCode(code),
    transactions,
    posted: transactions.filter(item => item.posted),
    versions: [...new Set(transactions.map(item => item.version).filter(Boolean))],
    companies: perCompany.filter(({ usage }) => usage.transactions.length).map(({ company }) => company),
  };
}

/** The same index shape as `usageIndexFromRuns`, aggregated over all companies. */
export function standardUsageIndex(companies = []) {
  const merged = {};
  companies.forEach(company => {
    const runs = readCompanyRuns(company.companyId);
    const index = usageIndexFromRuns(runs);
    Object.entries(index).forEach(([code, usage]) => {
      const named = usage.transactions.map(item => ({ ...item, companyId: company.companyId, companyName: company.displayName || company.legalName || company.companyCode || company.companyId }));
      const existing = merged[code] || { code, transactions: [], posted: [], versions: [] };
      const transactions = [...existing.transactions, ...named];
      merged[code] = {
        code,
        transactions,
        posted: transactions.filter(item => item.posted),
        versions: [...new Set(transactions.map(item => item.version).filter(Boolean))],
      };
    });
  });
  return merged;
}

/* ------------------------------------------------------------------ guards */

/**
 * What may be done to one computation right now, and why not when it may not.
 *
 * The rules the meeting settled on:
 *
 *   Built-in standard   Formula edits belong to Settings › Standard Computation
 *                       Library. Inside a company, the only action is activate
 *                       or deactivate, and deactivating is refused once any
 *                       payroll transaction has referenced the code.
 *   Company-defined     Editable and deletable, until a posted transaction has
 *                       used it. After that the record is history and the way
 *                       to retire it is Inactive, not Delete.
 *   Version history     A code with published versions is never deleted, even
 *                       by a P&A Admin, because those versions are what past
 *                       payrolls resolve against.
 *
 * `usage` and `versions` may be passed in when a caller already has them, so a
 * table of 200 rows does not re-read the transaction store for each one.
 */
export function computationGuards(record, {
  companyId,
  isPaAdmin = false,
  assignments = [],
  usage = null,
  versions = null,
  // 'company' is the Computational Basis screen, where a standard is read-only.
  // 'standard' is Settings › Standard Computation Library, where the central
  // definition itself is edited. Once a posted transaction in any company has
  // applied it, a save publishes a new version rather than being refused.
  context = 'company',
} = {}) {
  const code = normalizeCode(record?.code);
  const built = record?.isBuiltIn !== false;
  const central = context === 'standard';
  const use = usage || payrollUsage(code, companyId);
  const published = versions || versionsOf(code, companyId);
  const assigned = assignments.filter(item => normalizeCode(item.computationCode) === code);

  const editReasons = [];
  if (built && !central) {
    editReasons.push(isPaAdmin
      ? `${code} is edited in Settings › Standard Computation Library, where every formula is maintained once, centrally — a company never holds its own copy.`
      : `${code} is maintained by P&A. You can see the formula and the values you may change, but you can't change its logic — for a new formula or a change in logic, contact P&A.`);
  }
  // Inside a company, a formula a posted payroll used is history. Centrally it
  // is not frozen: saving publishes a new version, and every posted run keeps
  // explaining itself with the version it captured (`libraryForRun`), so a new
  // version can never change a payroll already released.
  const runLabel = item => (item.companyName ? `${item.transactionNumber} · ${item.companyName}` : item.transactionNumber);
  const postedRuns = use.posted.map(runLabel).join(', ');
  const postedCount = `${use.posted.length} posted payroll ${use.posted.length === 1 ? 'transaction' : 'transactions'}`;
  if (use.posted.length && !central) {
    editReasons.push(`${code} was used by ${postedCount} (${postedRuns}). Publish a new version instead of changing the one payroll already applied.`);
  }
  const versionNotice = central && use.posted.length
    ? `${code} was used by ${postedCount} (${postedRuns}). Saving publishes version ${(Number(record?.version || 1) + 0.1).toFixed(1)}; posted payrolls keep the version they ran on.`
    : '';
  // A run still open or in review computes against the current library, so a
  // recalculation after this save picks the new version up.
  const recalculableRuns = central
    ? use.transactions.filter(item => RECALCULABLE_STATUSES.includes(item.status)).map(runLabel)
    : [];

  const deleteReasons = [];
  if (built && !central) deleteReasons.push(`${code} is never deleted from a company. P&A withdraws its assignment in Settings › Standard Computation Library instead.`);
  if (use.posted.length) deleteReasons.push(`${code} appears in ${use.posted.length} posted payroll ${use.posted.length === 1 ? 'transaction' : 'transactions'} (${use.posted.map(item => item.transactionNumber).join(', ')}). Set it Inactive instead — historical payroll must keep resolving it.`);
  else if (use.transactions.length) deleteReasons.push(`${code} is referenced by payroll ${use.transactions.map(item => item.transactionNumber).join(', ')}. Set it Inactive instead of deleting it.`);
  if (published.length > 1) deleteReasons.push(`${code} has ${published.length} published versions. A code with version history is retired by deactivating it, not by deleting it.`);
  if (assigned.length) deleteReasons.push(`${code} is assigned to ${assigned.map(item => item.employeeGroup).join(', ')}. Remove the assignment first.`);

  const deactivateReasons = [];
  if (use.transactions.length) {
    deactivateReasons.push(`${code} is linked to payroll ${use.transactions.map(item => item.transactionNumber).join(', ')}. Deactivation is available only while a computation is linked to no transaction.`);
  }

  return {
    code,
    isBuiltIn: built,
    usage: use,
    versions: published,
    assignments: assigned,
    canEdit: !editReasons.length,
    canDelete: !deleteReasons.length,
    canDeactivate: !deactivateReasons.length,
    versionNotice,
    recalculableRuns,
    editReason: editReasons[0] || '',
    deleteReason: deleteReasons[0] || '',
    deactivateReason: deactivateReasons[0] || '',
  };
}

/* ------------------------------------------------------------ code helpers */

export { categoryPrefixes, nextComputationCode, prefixForCategory };

/** A freshly created computation: category-driven code, Inactive until reviewed. */
export function newCompanyComputation({ category = 'Earnings', library = [], catalogue = categoryPrefixes, actor = 'Client Admin', companyId } = {}) {
  return {
    id: null,
    companyId,
    code: nextComputationCode(category, library, catalogue),
    name: '',
    category,
    expression: '',
    description: '',
    // A rule stays Inactive while it is being created and reviewed; somebody
    // activates it deliberately once it is ready to compute.
    status: 'Inactive',
    isBuiltIn: false,
    isNew: true,
    version: '0.0',
    effectiveDate: today(),
    updatedBy: actor,
    updatedAt: 'Not saved',
    lastTest: null,
  };
}

/**
 * A formula P&A is about to add to the central library: category-driven code,
 * Inactive until reviewed, and either an Atlas standard or built for one client.
 */
export function newStandardComputation({ category = 'Earnings', library = [], catalogue = categoryPrefixes, scope = 'Atlas standard', ownerCompanyId = '', actor = 'P&A Admin' } = {}) {
  return {
    id: null,
    code: nextComputationCode(category, library, catalogue),
    name: '',
    category,
    expression: '',
    description: '',
    status: 'Inactive',
    isBuiltIn: true,
    isNew: true,
    scope,
    ownerCompanyId,
    parameters: {},
    version: '0.0',
    effectiveDate: today(),
    updatedBy: actor,
    updatedAt: 'Not saved',
    lastTest: null,
  };
}

export const governanceStamps = { stamp, today, displayDate, displayStamp };
