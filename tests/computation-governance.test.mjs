import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

/**
 * The governance module reads and writes `localStorage`, so the suite installs
 * a minimal in-memory one before importing it. Everything else is exercised
 * through the real exports — the point of these tests is that the delete,
 * deactivate and historical-version rules hold, not that a mock returns what it
 * was told to.
 */
class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const {
  appendVersion,
  applicabilityFor,
  computationGuards,
  diffComputation,
  newCompanyComputation,
  readAppliedStandards,
  readComputationLibrary,
  readStandardLibrary,
  referenceVersionHistory,
  resolveComputationVersion,
  resolveReferenceVersion,
  setApplicability,
  usageFromRuns,
  usageIndexFromRuns,
  withReferenceVersion,
  writeCompanyComputations,
} = await import('../src/computationGovernance.js');

const { nextComputationCode, prefixForCategory } = await import('../src/computationCatalog.js');
const { computationSnapshotFor } = await import('../src/payrollEngine.js');
const { libraryForRun } = await import('../src/payrollRuns.js');

const COMPANY = 'company-a';
const OTHER = 'company-b';

const runWith = (transactionNumber, status, steps) => ({
  id: transactionNumber,
  transactionNumber,
  status,
  month: 'August',
  year: 2026,
  payoutDate: '2026-08-31',
  result: {
    lines: [{ status: 'Computed', steps }],
    computationSnapshot: computationSnapshotFor([{ steps }], { computations: [] }),
  },
});

beforeEach(() => { globalThis.localStorage.clear(); });

/* ------------------------------------------------------------- code naming */

test('a new computation takes its code from the category, not a generic CUS prefix', () => {
  assert.equal(prefixForCategory('Earnings'), 'ERN');
  assert.equal(prefixForCategory('Deductions'), 'DED');
  assert.equal(prefixForCategory('Bonus'), 'BON');
  assert.equal(nextComputationCode('Earnings', [{ code: 'ERN-001' }, { code: 'ERN-002' }]), 'ERN-003');
  assert.equal(nextComputationCode('Deductions', []), 'DED-001');
});

test('a category outside the controlled list still produces a unique code', () => {
  assert.equal(nextComputationCode('Something New', [{ code: 'CUS-001' }]), 'CUS-002');
});

test('a new company computation is created Inactive and needs no description', () => {
  const draft = newCompanyComputation({ category: 'Earnings', library: [], companyId: COMPANY });
  assert.equal(draft.status, 'Inactive');
  assert.equal(draft.description, '');
  assert.equal(draft.code, 'ERN-001');
  assert.equal(draft.isBuiltIn, false);
});

/* ------------------------------------------------------- company isolation */

test('two companies never read each other\'s computations', () => {
  writeCompanyComputations(COMPANY, [{ code: 'ERN-051', name: 'A allowance', expression: '{{basic_pay}}', status: 'Active', version: '1.0' }]);
  writeCompanyComputations(OTHER, [{ code: 'ERN-052', name: 'B allowance', expression: '{{basic_pay}}', status: 'Active', version: '1.0' }]);
  const a = readComputationLibrary(COMPANY).filter(item => item.isBuiltIn === false).map(item => item.code);
  const b = readComputationLibrary(OTHER).filter(item => item.isBuiltIn === false).map(item => item.code);
  assert.deepEqual(a, ['ERN-051']);
  assert.deepEqual(b, ['ERN-052']);
});

test('an Atlas standard exists once and is applied to a company, never copied into it', () => {
  const central = readStandardLibrary();
  assert.ok(central.some(item => item.code === 'BAS-001'));
  // Applied by default — the confirmed model is centrally available, activated per company.
  assert.deepEqual(applicabilityFor('BAS-001', COMPANY), { applied: true, status: 'Active' });

  setApplicability('BAS-001', OTHER, { applied: false });
  assert.ok(readAppliedStandards(COMPANY).some(item => item.code === 'BAS-001'));
  assert.ok(!readAppliedStandards(OTHER).some(item => item.code === 'BAS-001'));
  // Withdrawing it from one company does not touch the single central record.
  assert.equal(readStandardLibrary().filter(item => item.code === 'BAS-001').length, 1);
});

test('a company deactivating a standard does not deactivate it elsewhere', () => {
  setApplicability('BAS-001', COMPANY, { status: 'Inactive' });
  assert.equal(readAppliedStandards(COMPANY).find(item => item.code === 'BAS-001').status, 'Inactive');
  assert.equal(readAppliedStandards(OTHER).find(item => item.code === 'BAS-001').status, 'Active');
});

/* ----------------------------------------------------------- payroll usage */

test('usage names the transactions a code was applied by, and which were posted', () => {
  const runs = [
    runWith('PR-2026-08-001', 'Posted', [{ code: 'ERN-002', version: '1.3', expression: '{{hourly_rate}} * {{ot_hours}} * 1.25', label: 'Overtime Pay' }]),
    runWith('PR-2026-09-001', 'Open', [{ code: 'ERN-002', version: '1.4', expression: '{{hourly_rate}} * {{ot_hours}} * {{ot_rate}}', label: 'Overtime Pay' }]),
    runWith('PR-2026-09-002', 'Cancelled', [{ code: 'ERN-002', version: '1.4', expression: 'x', label: 'Overtime Pay' }]),
  ];
  const usage = usageFromRuns('ERN-002', runs);
  assert.equal(usage.transactions.length, 2, 'a cancelled transaction is not usage');
  assert.equal(usage.posted.length, 1);
  assert.deepEqual(usage.versions.sort(), ['1.3', '1.4']);
});

test('the usage index covers every code the transactions touched, in one pass', () => {
  const index = usageIndexFromRuns([runWith('PR-2026-08-001', 'Posted', [
    { code: 'BAS-001', version: '1.0', expression: 'x', label: 'Daily Rate' },
    { code: 'ERN-002', version: '1.3', expression: 'y', label: 'Overtime Pay' },
  ])]);
  assert.deepEqual(Object.keys(index).sort(), ['BAS-001', 'ERN-002']);
  assert.equal(index['BAS-001'].posted.length, 1);
});

/* ------------------------------------------------------------- protections */

test('a company computation used by a posted transaction can be neither edited nor deleted', () => {
  const record = { code: 'ERN-051', name: 'Shift allowance', isBuiltIn: false, version: '1.2', status: 'Active' };
  const usage = usageFromRuns('ERN-051', [runWith('PR-2026-08-001', 'Posted', [{ code: 'ERN-051', version: '1.2', expression: 'x', label: 'Shift allowance' }])]);
  const guard = computationGuards(record, { companyId: COMPANY, usage, versions: [] });
  assert.equal(guard.canEdit, false);
  assert.equal(guard.canDelete, false);
  assert.match(guard.deleteReason, /Inactive/);
  assert.match(guard.deleteReason, /PR-2026-08-001/);
});

test('an unused company computation may still be edited and deleted', () => {
  const record = { code: 'ERN-052', name: 'Unused', isBuiltIn: false, version: '1.0', status: 'Inactive' };
  const guard = computationGuards(record, { companyId: COMPANY, usage: usageFromRuns('ERN-052', []), versions: [] });
  assert.equal(guard.canEdit, true);
  assert.equal(guard.canDelete, true);
  assert.equal(guard.canDeactivate, true);
});

test('a computation linked to any transaction cannot be deactivated, posted or not', () => {
  const record = { code: 'ERN-053', name: 'Linked', isBuiltIn: false, version: '1.0', status: 'Active' };
  const usage = usageFromRuns('ERN-053', [runWith('PR-2026-09-001', 'Open', [{ code: 'ERN-053', version: '1.0', expression: 'x', label: 'Linked' }])]);
  const guard = computationGuards(record, { companyId: COMPANY, usage, versions: [] });
  assert.equal(guard.canDeactivate, false);
  assert.match(guard.deactivateReason, /PR-2026-09-001/);
  // Not posted, so deletion is refused with the "set it Inactive" wording rather than allowed.
  assert.equal(guard.canDelete, false);
});

test('an Atlas standard is read-only inside a company but editable centrally while unused', () => {
  const record = { code: 'BAS-001', name: 'Daily Rate', isBuiltIn: true, version: '1.0', status: 'Active' };
  const inCompany = computationGuards(record, { companyId: COMPANY, usage: usageFromRuns('BAS-001', []), versions: [] });
  assert.equal(inCompany.canEdit, false);
  assert.equal(inCompany.canDelete, false);
  assert.match(inCompany.editReason, /activated or deactivated/);

  const centrally = computationGuards(record, { context: 'standard', usage: usageFromRuns('BAS-001', []), versions: [] });
  assert.equal(centrally.canEdit, true);
  assert.equal(centrally.canDelete, true);
});

test('a standard a posted transaction used is locked even for a P&A Admin', () => {
  const record = { code: 'BAS-001', name: 'Daily Rate', isBuiltIn: true, version: '1.0', status: 'Active' };
  const usage = usageFromRuns('BAS-001', [runWith('PR-2026-08-001', 'Posted', [{ code: 'BAS-001', version: '1.0', expression: 'x', label: 'Daily Rate' }])]);
  const centrally = computationGuards(record, { context: 'standard', usage, versions: [] });
  assert.equal(centrally.canEdit, false);
  assert.equal(centrally.canDelete, false);
});

test('a code with published version history is retired, not deleted', () => {
  const record = { code: 'ERN-054', name: 'Versioned', isBuiltIn: false, version: '1.2', status: 'Active' };
  const guard = computationGuards(record, {
    companyId: COMPANY,
    usage: usageFromRuns('ERN-054', []),
    versions: [{ version: '1.2' }, { version: '1.1' }, { version: '1.0' }],
  });
  assert.equal(guard.canDelete, false);
  assert.match(guard.deleteReason, /version history/);
});

test('an assigned computation cannot be deleted while the assignment stands', () => {
  const record = { code: 'ERN-055', name: 'Assigned', isBuiltIn: false, version: '1.0', status: 'Active' };
  const guard = computationGuards(record, {
    companyId: COMPANY,
    usage: usageFromRuns('ERN-055', []),
    versions: [],
    assignments: [{ computationCode: 'ERN-055', employeeGroup: 'Monthly' }],
  });
  assert.equal(guard.canDelete, false);
  assert.match(guard.deleteReason, /Monthly/);
});

/* -------------------------------------------------- historical resolution */

test('a payroll line records the version of the formula it applied', () => {
  const snapshot = computationSnapshotFor([{
    steps: [{ code: 'ERN-002', label: 'Overtime Pay', category: 'Earnings', version: '1.3', expression: '{{hourly_rate}} * {{ot_hours}} * 1.25', effectiveDate: '2026-01-01', formulaOwner: 'Atlas standard', evaluated: true }],
  }], { computations: [] });
  assert.equal(snapshot.entries.length, 1);
  assert.deepEqual(
    { code: snapshot.entries[0].code, version: snapshot.entries[0].version },
    { code: 'ERN-002', version: '1.3' },
  );
});

test('a posted transaction keeps resolving the version it used after the formula moves on', () => {
  const posted = runWith('PR-2026-08-001', 'Posted', [{
    code: 'ERN-002', label: 'Overtime Pay', category: 'Earnings', version: '1.3',
    expression: '{{hourly_rate}} * {{ot_hours}} * 1.25', effectiveDate: '2026-01-01', formulaOwner: 'Atlas standard',
  }]);
  const current = [{ code: 'ERN-002', name: 'Overtime Pay', version: '1.4', expression: '{{hourly_rate}} * {{ot_hours}} * {{ot_rate}}', status: 'Active' }];
  const resolved = libraryForRun(posted, current).find(item => item.code === 'ERN-002');
  assert.equal(resolved.version, '1.3');
  assert.equal(resolved.expression, '{{hourly_rate}} * {{ot_hours}} * 1.25');
});

test('a transaction that can still be recalculated uses the current formula', () => {
  const open = runWith('PR-2026-09-001', 'Open', [{ code: 'ERN-002', label: 'Overtime Pay', category: 'Earnings', version: '1.3', expression: 'old' }]);
  const current = [{ code: 'ERN-002', name: 'Overtime Pay', version: '1.4', expression: 'new', status: 'Active' }];
  assert.equal(libraryForRun(open, current).find(item => item.code === 'ERN-002').version, '1.4');
});

test('a published version snapshot resolves ahead of the current definition', () => {
  const record = { code: 'ERN-056', name: 'Allowance', category: 'Earnings', expression: 'v1', status: 'Active', version: '1.0', effectiveDate: '2026-01-01', isBuiltIn: false };
  appendVersion(COMPANY, record, { note: 'first' });
  appendVersion(COMPANY, { ...record, version: '1.1', expression: 'v2' }, { note: 'second' });
  writeCompanyComputations(COMPANY, [{ ...record, version: '1.1', expression: 'v2' }]);

  assert.equal(resolveComputationVersion('ERN-056', '1.0', COMPANY).expression, 'v1');
  assert.equal(resolveComputationVersion('ERN-056', '1.1', COMPANY).expression, 'v2');
  assert.equal(resolveComputationVersion('ERN-056', '', COMPANY).resolvedFrom, 'current definition');
});

/* -------------------------------------------------------- test evidence */

test('test evidence is stored with the published version, not recomputed on open', () => {
  const record = { code: 'ERN-057', name: 'Unit allowance', category: 'Earnings', expression: '{{allowance_units}} * {{allowance_unit_rate}}', status: 'Active', version: '1.2', effectiveDate: '2026-01-01', isBuiltIn: false };
  const evidence = { inputs: { allowance_units: 8, allowance_unit_rate: 250 }, expected: 2000, actual: 2000, result: 'Passed', testedBy: 'Client Admin', testedAt: '2026-08-27T02:00:00.000Z' };
  appendVersion(COMPANY, record, { test: evidence });
  const stored = resolveComputationVersion('ERN-057', '1.2', COMPANY);
  assert.deepEqual(stored.test, evidence);
  assert.equal(stored.test.result, 'Passed');
});

/* ------------------------------------------------------- change history */

test('a change is recorded with its before and after value', () => {
  const before = { expression: '{{hourly_rate}} * {{ot_hours}} * 1.25', status: 'Inactive', effectiveDate: '2026-01-01', name: 'Overtime Pay', category: 'Earnings', description: '' };
  const after = { ...before, expression: '{{hourly_rate}} * {{ot_hours}} * {{ot_rate}}', status: 'Active', effectiveDate: '2026-07-01' };
  const changes = diffComputation(before, after);
  assert.deepEqual(changes.map(change => change.field).sort(), ['Effective date', 'Expression', 'Status']);
  const expression = changes.find(change => change.field === 'Expression');
  assert.equal(expression.from, '{{hourly_rate}} * {{ot_hours}} * 1.25');
  assert.equal(expression.to, '{{hourly_rate}} * {{ot_hours}} * {{ot_rate}}');
});

test('an unchanged save records no change', () => {
  const record = { expression: 'x', status: 'Active', effectiveDate: '2026-01-01', name: 'n', category: 'Earnings', description: 'd' };
  assert.deepEqual(diffComputation(record, { ...record }), []);
});

/* --------------------------------------------- reference source versions */

test('publishing a reference version keeps the version it supersedes', () => {
  const january = { code: 'REF-006', name: 'De Minimis Ceiling', version: '1.0', effectiveDate: '2025-01-01', entries: [{ id: 1, key: 'Rice Subsidy', value: '24000' }], versions: [] };
  const july = withReferenceVersion(january, { entries: [{ id: 1, key: 'Rice Subsidy', value: '26000' }], effectiveDate: '2026-01-01', version: '1.1', note: 'BIR update' });
  const history = referenceVersionHistory(july);
  assert.deepEqual(history.map(item => item.version), ['1.0', '1.1']);
  assert.equal(history[0].entries[0].value, '24000', 'the superseded version keeps its own rows');
  assert.equal(history[1].entries[0].value, '26000');
});

test('payroll resolves the reference version effective on its payout date', () => {
  let reference = { code: 'REF-006', name: 'De Minimis Ceiling', version: '1.0', effectiveDate: '2025-01-01', entries: [{ id: 1, key: 'Ceiling', value: '24000' }], versions: [] };
  reference = withReferenceVersion(reference, { entries: [{ id: 1, key: 'Ceiling', value: '26000' }], effectiveDate: '2026-01-01', version: '1.1' });
  reference = withReferenceVersion(reference, { entries: [{ id: 1, key: 'Ceiling', value: '28000' }], effectiveDate: '2027-01-01', version: '1.2' });

  assert.equal(resolveReferenceVersion(reference, '2025-08-31').version, '1.0');
  assert.equal(resolveReferenceVersion(reference, '2026-08-31').version, '1.1');
  assert.equal(resolveReferenceVersion(reference, '2027-08-31').version, '1.2');
  assert.equal(resolveReferenceVersion(reference, '2026-08-31').entries[0].value, '26000');
});
