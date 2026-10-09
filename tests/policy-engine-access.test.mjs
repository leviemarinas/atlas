import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The Controlled Hybrid split on the policy engines: a client changes only an
 * engine's approved values; the basis, method, conditions, statutory
 * treatment, deduction order and on/off switch stay with P&A.
 */
const {
  CLIENT_EDITABLE_ENGINE_PARAMETERS,
  clientEditViolations,
  diffPolicySection,
  engineAccessFor,
  engineSectionForCode,
  isClientEditableEngineParameter,
} = await import('../src/policyEngineAccess.js');

test('a client may change a cap or threshold but not the basis or the method', () => {
  assert.equal(isClientEditableEngineParameter('takeHome', 'threshold'), true);
  assert.equal(isClientEditableEngineParameter('takeHome', 'loanCap'), true);
  assert.equal(isClientEditableEngineParameter('takeHome', 'base'), false);
  assert.equal(isClientEditableEngineParameter('takeHome', 'priorityChoice'), false);
  assert.equal(isClientEditableEngineParameter('retirement', 'statutoryDays'), false, 'a statutory value stays with P&A');
  assert.equal(isClientEditableEngineParameter('retirement', 'companyDays'), true);
});

test('turning an engine on or off is never a client parameter', () => {
  Object.keys(CLIENT_EDITABLE_ENGINE_PARAMETERS).forEach(section => {
    assert.equal(isClientEditableEngineParameter(section, 'enabled'), false, section);
  });
});

test('a setting nobody listed is P&A\'s', () => {
  assert.equal(isClientEditableEngineParameter('finalPay', 'someNewRule'), false);
  assert.equal(isClientEditableEngineParameter('unknownEngine', 'threshold'), false);
});

test('the P&A view is unrestricted and the client view carries the allow-list', () => {
  assert.equal(engineAccessFor('takeHome', { isPaAdmin: true }), null);
  assert.deepEqual(engineAccessFor('grossUp', { isPaAdmin: false }).clientEditable, CLIENT_EDITABLE_ENGINE_PARAMETERS.grossUp);
});

test('a save records policy settings before and after, never simulator data', () => {
  const before = {
    threshold: 30,
    base: 'Gross Pay',
    recovery: { staggerThreshold: 1000, method: 'Scheduled installments' },
    test: { grossPay: 36500 },
  };
  const after = { ...before, threshold: 35, recovery: { ...before.recovery, staggerThreshold: 1500 }, test: { grossPay: 40000 } };
  const changes = diffPolicySection(before, after);
  assert.deepEqual(changes.map(change => change.key).sort(), ['staggerThreshold', 'threshold']);
  assert.deepEqual(changes.find(change => change.key === 'threshold'), { key: 'threshold', field: 'Threshold', from: '30', to: '35' });
});

test('a client change to a P&A setting is refused at save, whatever the screen allowed', () => {
  const before = { threshold: 30, base: 'Gross Pay', enabled: true };
  assert.deepEqual(clientEditViolations('takeHome', before, { ...before, threshold: 25 }), []);
  const refused = clientEditViolations('takeHome', before, { ...before, base: 'Basic Pay', enabled: false });
  assert.deepEqual(refused.map(change => change.key).sort(), ['base', 'enabled']);
});

test('an applicability change reads as who the engine covers', () => {
  const [change] = diffPolicySection(
    { assignment: { scope: 'All Employees', group: 'Rank and File', employees: [] } },
    { assignment: { scope: 'Employee Group', group: 'Managers', employees: [] } });
  assert.equal(change.from, 'All Employees');
  assert.equal(change.to, 'Employee Group · Managers');
  assert.equal(isClientEditableEngineParameter('takeHome', change.key), true, 'who a policy covers is a client decision');
});

test('a policy code maps to the engine whose settings it carries', () => {
  assert.equal(engineSectionForCode({ subcategory: 'Take-Home Pay' }), 'takeHome');
  assert.equal(engineSectionForCode({ subcategory: 'Deferred Deductions' }), 'takeHome');
  assert.equal(engineSectionForCode({ subcategory: 'Retirement Pay' }), 'retirement');
  assert.equal(engineSectionForCode({ subcategory: 'Final Pay' }), 'finalPay');
  assert.equal(engineSectionForCode({ subcategory: 'Gross Up' }), 'grossUp');
  assert.equal(engineSectionForCode({ subcategory: 'Leave Accrual' }), '');
});
