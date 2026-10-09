import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

class MemoryStorage {
  #rows = new Map();
  getItem(key) { return this.#rows.has(key) ? this.#rows.get(key) : null; }
  setItem(key, value) { this.#rows.set(key, String(value)); }
  removeItem(key) { this.#rows.delete(key); }
  clear() { this.#rows.clear(); }
}

test('every end-to-end step has conversational guidance and a four-part lineage', async t => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  t.after(() => server.close());
  globalThis.localStorage = new MemoryStorage();
  const demo = await server.ssrLoadModule('/src/endToEndDemo.js');

  assert.deepEqual(Object.keys(demo.E2E_JOURNEYS), [
    'payroll', 'computation', 'payroll-rejection', 'earning-deduction', 'time-correction',
    'formula-trace', 'statutory-trace', 'deduction-protection',
  ]);
  for (const journey of Object.values(demo.E2E_JOURNEYS)) {
    assert.ok(journey.stages.length >= 6, `${journey.id} needs a complete multi-actor path`);
    for (const stage of journey.stages) {
      for (const key of ['guide', 'why', 'input', 'rule', 'output', 'proof']) {
        assert.ok(stage[key], `${journey.id}/${stage.id} is missing ${key}`);
      }
    }
  }
});

test('formula, statutory, and take-home journeys produce real payroll evidence', async t => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  t.after(() => server.close());
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  const demo = await server.ssrLoadModule('/src/endToEndDemo.js');

  const runJourney = id => {
    demo.resetEndToEndSandbox(storage);
    demo.E2E_JOURNEYS[id].stages.forEach((_, stageIndex) => demo.applyEndToEndStage({ journeyId: id, stageIndex, storage }));
    return demo.readEndToEndState(demo.SANDBOX_COMPANY_ID, storage);
  };

  const formula = runJourney('formula-trace');
  assert.equal(formula.metrics.payrollStatus, 'Posted');
  assert.ok(formula.metrics.computationTrail.some(step => step.code === 'ERN-002' && step.evaluated));
  assert.ok(formula.metrics.auditTrail.length >= 18);
  assert.ok(formula.metrics.auditTrail.some(node => node.id === 'basic-config' && node.path.join(' › ').endsWith('Basic Pay & Pay Rates')));
  assert.ok(formula.metrics.computationTrail.every(step => step.references.length >= 3));

  const statutory = runJourney('statutory-trace');
  assert.equal(statutory.metrics.payrollStatus, 'Posted');
  assert.ok(statutory.metrics.statutoryEmployee > 0);
  assert.ok(['GOV-001', 'GOV-002', 'GOV-003'].every(code => statutory.metrics.computationTrail.some(step => step.code === code)));

  const protection = runJourney('deduction-protection');
  assert.equal(protection.metrics.payrollStatus, 'Posted');
  assert.ok(protection.metrics.employeeDeferred > 0);
  const protectionStep = protection.metrics.computationTrail.find(step => step.code === 'THP-002');
  assert.ok(protectionStep);
  assert.equal(protectionStep.policyApplied, true);
  assert.ok(protectionStep.references.some(reference => reference.path.join(' › ').endsWith('Policy Engines › Deduction and Loan Hierarchy')));
  assert.equal(protection.metrics.auditTrail.find(node => node.id === 'hierarchy').status, 'Applied');
  assert.equal(protection.metrics.auditTrail.find(node => node.id === 'policy').status, 'Applied');
});
