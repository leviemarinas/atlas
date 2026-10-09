import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

/**
 * P&A's Controlled Hybrid approach for the Computational Basis (agreed
 * 1 September 2026): every formula is authored once, centrally, by P&A; a
 * company sees and uses only the formulas assigned to it; and a client changes
 * only the approved values a formula marks as client-editable, inside the
 * approved range, with each change dated rather than overwritten.
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
  STANDARD_LIBRARY_KEY,
  computationGuards,
  computationScope,
  readCompanyComputations,
  readComputationLibrary,
  readStandardLibrary,
  setApplicability,
  usageFromRuns,
  versionsOf,
  writeCompanyComputations,
} = await import('../src/computationGovernance.js');
const {
  LEGACY_EXPRESSIONS,
  evaluateExpression,
  parameterDefaults,
  parameterDefinitionProblems,
  parameterValueProblem,
  seedComputations,
} = await import('../src/computationCatalog.js');
const {
  evaluateBinding,
  fixedValueAsOf,
  parameterValueProblems,
  withFixedValueChange,
} = await import('../src/computationBindings.js');
const { runtimeFieldsFor } = await import('../src/payrollEngine.js');

const COMPANY = 'company-a';
const OTHER = 'company-b';

beforeEach(() => { globalThis.localStorage.clear(); });

/* ------------------------------------------------ visibility and assignment */

test('a company sees only the formulas assigned to it', () => {
  const library = readComputationLibrary(COMPANY);
  assert.ok(library.some(item => item.code === 'BAS-001'), 'the core payroll set is the onboarding baseline');
  assert.ok(!library.some(item => item.code.startsWith('STD-')), 'an optional standard is not visible until P&A assigns it');

  setApplicability('STD-060', COMPANY, { applied: true }, 'P&A Admin');
  assert.ok(readComputationLibrary(COMPANY).some(item => item.code === 'STD-060'));
  assert.ok(!readComputationLibrary(OTHER).some(item => item.code === 'STD-060'), 'assigning to one company assigns to nobody else');
});

test('a formula P&A withdrew is not re-assigned by the onboarding baseline', () => {
  readComputationLibrary(COMPANY);
  setApplicability('DED-001', COMPANY, { applied: false }, 'P&A Admin');
  assert.ok(!readComputationLibrary(COMPANY).some(item => item.code === 'DED-001'));
});

test('a formula a company authored moves into the central library as its client-specific formula', () => {
  writeCompanyComputations(COMPANY, [{ code: 'ERN-051', name: 'Shift allowance', category: 'Earnings', expression: '{{basic_pay}}', status: 'Active', version: '1.0' }]);
  const mine = readComputationLibrary(COMPANY).find(item => item.code === 'ERN-051');
  assert.equal(computationScope(mine), 'Client-specific');
  assert.equal(mine.ownerCompanyId, COMPANY);
  assert.ok(readStandardLibrary().some(item => item.code === 'ERN-051'), 'it lives once, centrally');
  assert.equal(readCompanyComputations(COMPANY).length, 0, 'the company store no longer holds formulas');

  // Another company can never see it, even if an assignment says otherwise.
  setApplicability('ERN-051', OTHER, { applied: true }, 'P&A Admin');
  assert.ok(!readComputationLibrary(OTHER).some(item => item.code === 'ERN-051'));
});

test('inside a company no formula can be edited, only viewed', () => {
  const record = readComputationLibrary(COMPANY).find(item => item.code === 'ERN-005');
  const guard = computationGuards(record, { companyId: COMPANY, usage: usageFromRuns('ERN-005', []), versions: [] });
  assert.equal(guard.canEdit, false);
  assert.match(guard.editReason, /maintained by P&A/);
});

/* ---------------------------------------------------------------- parameters */

test('the rates that were typed into expressions are now parameters with a range', () => {
  const library = seedComputations();
  const nightDifferential = library.find(item => item.code === 'ERN-003');
  assert.equal(nightDifferential.expression, '{{hourly_rate}} * {{night_hours}} * {{night_diff_rate}}');
  assert.deepEqual(nightDifferential.parameters.night_diff_rate, { clientEditable: true, min: 0.1, max: 0.3, default: 0.1 });
  assert.equal(library.find(item => item.code === 'TAX-006').parameters.ewt_rate.clientEditable, false, 'a statutory rate stays with P&A');
  Object.keys(LEGACY_EXPRESSIONS).forEach(code => {
    assert.doesNotMatch(library.find(item => item.code === code).expression, /\*\s*0\.\d/, `${code} no longer types a rate into its expression`);
  });
});

test('a formula default keeps the figure the old typed-in rate produced', () => {
  const formula = seedComputations().find(item => item.code === 'ERN-003');
  const values = { ...parameterDefaults(formula), hourly_rate: 200, night_hours: 8 };
  assert.equal(evaluateExpression(formula.expression, values), evaluateExpression(LEGACY_EXPRESSIONS['ERN-003'], { hourly_rate: 200, ot_hours: 8 }));
});

test('a stored library still holding an old expression is upgraded once, as a new version', () => {
  const stored = seedComputations().map(item => (item.code === 'ERN-003' ? { ...item, expression: LEGACY_EXPRESSIONS['ERN-003'], parameters: undefined } : item));
  globalThis.localStorage.setItem(STANDARD_LIBRARY_KEY, JSON.stringify(stored));

  const upgraded = readStandardLibrary().find(item => item.code === 'ERN-003');
  assert.equal(upgraded.expression, '{{hourly_rate}} * {{night_hours}} * {{night_diff_rate}}');
  assert.equal(upgraded.version, '1.1');
  const history = versionsOf('ERN-003', COMPANY);
  assert.deepEqual(history.map(item => item.version), ['1.1', '1.0']);
  assert.equal(history[1].expression, LEGACY_EXPRESSIONS['ERN-003'], 'the old expression stays resolvable');
  assert.equal(readStandardLibrary().find(item => item.code === 'ERN-003').version, '1.1', 'and it happens once');
});

test('a parameter value outside the approved range is refused, and one inside it accepted', () => {
  const definition = { clientEditable: true, min: 0.1, max: 0.3, default: 0.1 };
  assert.equal(parameterValueProblem('night_diff_rate', definition, 0.15), '');
  assert.match(parameterValueProblem('night_diff_rate', definition, 0.35), /10% to 30%/);
  assert.match(parameterValueProblem('night_diff_rate', definition, ''), /Enter a number/);
});

test('a client-editable parameter cannot be published without both bounds', () => {
  assert.match(parameterDefinitionProblems({ commission_rate: { clientEditable: true, min: 0 } })[0], /minimum and a maximum/);
  assert.match(parameterDefinitionProblems({ commission_rate: { clientEditable: false, min: 0.5, max: 0.1 } })[0], /minimum is above/);
  assert.deepEqual(parameterDefinitionProblems({ commission_rate: { clientEditable: true, min: 0, max: 0.5, default: 0.05 } }), []);
});

test('a pay item value outside the range is refused at save', () => {
  const library = seedComputations();
  const record = {
    computationCode: 'ERN-003',
    computationBindings: {
      hourly_rate: { kind: 'runtime' },
      night_hours: { kind: 'runtime' },
      night_diff_rate: { kind: 'fixed', value: '0.5' },
    },
  };
  assert.match(parameterValueProblems({ record, library })[0], /outside the range/);
  const inRange = { ...record, computationBindings: { ...record.computationBindings, night_diff_rate: { kind: 'fixed', value: '0.15' } } };
  assert.deepEqual(parameterValueProblems({ record: inRange, library }), []);
});

/* ------------------------------------------------------------- dated values */

test('a changed value applies from its effective date and earlier payrolls keep the old one', () => {
  const changed = withFixedValueChange({ kind: 'fixed', value: '0.1' }, { value: '0.15', effectiveDate: '2026-10-01' });
  assert.equal(changed.value, '0.15');
  assert.equal(fixedValueAsOf(changed, '2026-09-30'), '0.1');
  assert.equal(fixedValueAsOf(changed, '2026-10-01'), '0.15');

  const library = seedComputations();
  const record = {
    computationCode: 'ERN-003',
    computationBindings: {
      hourly_rate: { kind: 'fixed', value: '200' },
      night_hours: { kind: 'fixed', value: '10' },
      night_diff_rate: changed,
    },
  };
  assert.equal(evaluateBinding({ record, library, asOf: '2026-09-15' }).amount, 200, 'September keeps 10%');
  assert.equal(evaluateBinding({ record, library, asOf: '2026-10-15' }).amount, 300, 'October uses 15%');
});

test('the payroll runtime supplies night differential hours', () => {
  const runtime = runtimeFieldsFor({ attendance: { overtimeByType: { 'Night Differential': 6, Regular: 2 } } });
  assert.equal(runtime.night_hours, 6);
});
