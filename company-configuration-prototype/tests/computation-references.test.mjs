import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computationDependencies,
  evaluateExpression,
  fields,
  isComputationToken,
  referenceProblems,
  resolvedFields,
  seedComputations,
  usedComputations,
  usedFields,
} from '../src/computationCatalog.js';

const library = seedComputations();
const samples = Object.fromEntries(fields.map(([code, , sample]) => [code, sample]));

test('a computation code is told apart from an approved field', () => {
  assert.equal(isComputationToken('BAS-001'), true);
  assert.equal(isComputationToken('CUS-900'), true);
  assert.equal(isComputationToken('monthly_basic'), false);
  assert.equal(isComputationToken('ot_hours'), false);
});

test('an expression can build on a published computation instead of repeating it', () => {
  const direct = evaluateExpression('{{daily_rate}} / {{work_hours}} * {{ot_hours}}',
    { daily_rate: 1600, work_hours: 8, ot_hours: 10 });
  const viaReference = evaluateExpression('{{BAS-002}} * {{ot_hours}}',
    { daily_rate: 1600, work_hours: 8, ot_hours: 10 }, { library });
  assert.equal(viaReference, 2000);
  assert.equal(viaReference, direct);
});

test('token kinds are reported separately so the mapped-field table stays correct', () => {
  const expression = '{{BAS-002}} * {{ot_hours}}';
  assert.deepEqual(usedFields(expression), ['ot_hours']);
  assert.deepEqual(usedComputations(expression), ['BAS-002']);
});

test('the test tab asks for the whole chain, not for a figure the user must derive', () => {
  const needed = resolvedFields('{{BAS-002}} * {{ot_hours}}', library);
  assert.deepEqual(needed.sort(), ['daily_rate', 'ot_hours', 'work_hours']);
});

test('a supplied value overrides a referenced computation', () => {
  const pinned = evaluateExpression('{{BAS-002}} * {{ot_hours}}',
    { ...samples, 'BAS-002': 500, ot_hours: 2 }, { library });
  assert.equal(pinned, 1000);
});

test('a dependency carries what the mapped-field table needs to show', () => {
  const [dependency] = computationDependencies('{{BAS-002}} * 2', library, 'CUS-910');
  assert.equal(dependency.code, 'BAS-002');
  assert.equal(dependency.name, 'Hourly Rate');
  assert.equal(dependency.missing, false);
  assert.equal(dependency.circular, false);
  assert.equal(dependency.inactive, false);
});

test('a formula may not refer to itself', () => {
  assert.deepEqual(referenceProblems('{{CUS-910}} + 1', library, 'CUS-910'),
    ['CUS-910 cannot refer to itself.']);
});

test('an unpublished code is refused rather than silently evaluating to zero', () => {
  assert.deepEqual(referenceProblems('{{ZZZ-999}} + 1', library, 'CUS-910'),
    ['ZZZ-999 is not a published computation.']);
});

test('an inactive computation cannot be built on', () => {
  const withInactive = library.map(item => (item.code === 'BAS-002' ? { ...item, status: 'Inactive' } : item));
  assert.deepEqual(referenceProblems('{{BAS-002}} * 2', withInactive, 'CUS-910'),
    ['BAS-002 is inactive, so it cannot be used in a new formula.']);
});

test('a reference loop is reported instead of hanging', () => {
  const looping = [
    { code: 'CYC-001', name: 'A', expression: '{{CYC-002}} + 1', status: 'Active' },
    { code: 'CYC-002', name: 'B', expression: '{{CYC-001}} + 1', status: 'Active' },
  ];
  assert.throws(() => evaluateExpression('{{CYC-001}}', {}, { library: looping }),
    /refers back to itself/);
});

test('references resolve through more than one level', () => {
  // BAS-003 minute rate reads the hourly rate field; wrap it to prove the chain
  const chained = [...library, { code: 'CUS-920', name: 'Minute value', expression: '{{BAS-003}} * 60', status: 'Active' }];
  assert.equal(evaluateExpression('{{CUS-920}}', { hourly_rate: 480 }, { library: chained }), 480);
});

test('every seeded formula still evaluates against the sample palette', () => {
  for (const record of library) {
    assert.doesNotThrow(() => evaluateExpression(record.expression, samples, { library }),
      `${record.code} ${record.expression}`);
  }
});
