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

async function load(t) {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  t.after(() => server.close());
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  const seed = await server.ssrLoadModule('/src/scenarioSeed.js');
  const runs = await server.ssrLoadModule('/src/payrollRuns.js');
  const catalog = await server.ssrLoadModule('/src/scenarioCatalog.js');
  return { seed, runs, catalog, storage, companyId: 'cmp-atlas-sandbox-001' };
}

test('every declared data need has a provider and a reason a person can read', async t => {
  const { seed, catalog } = await load(t);
  const ids = new Set(catalog.SCENARIOS.map(item => item.id));
  Object.entries(seed.SCENARIO_DATA_NEEDS).forEach(([scenarioId, needs]) => {
    assert.ok(ids.has(scenarioId), `${scenarioId} is not a catalog story`);
    assert.ok(needs.length, `${scenarioId} declares no need`);
    needs.forEach(key => {
      const need = seed.DATA_NEEDS[key];
      assert.ok(need, `${scenarioId} needs unknown data "${key}"`);
      assert.ok(need.label && need.why, `${key} must explain itself`);
    });
  });
});

test('the payroll stories that showed an empty register now have one to work on', async t => {
  const { seed, runs, storage, companyId } = await load(t);
  assert.equal(runs.readPayrollRuns(companyId, storage).length, 0, 'the sandbox starts with no payroll');

  // "Compare payroll history" needs something to compare against, so one
  // posted run is not enough.
  const payslips = seed.ensureScenarioData('emp-payslip-history', companyId, storage);
  assert.equal(payslips.failed.length, 0, JSON.stringify(payslips.failed));
  const posted = runs.readPayrollRuns(companyId, storage).filter(run => ['Posted', 'Locked'].includes(run.status));
  assert.ok(posted.length >= 2, 'payroll history needs at least two posted periods');
  assert.equal(new Set(posted.map(run => run.periodStart)).size, posted.length, 'the periods must be distinct');
  posted.forEach(run => {
    assert.ok(run.result, `${run.transactionNumber} must carry a calculated result`);
    assert.ok(run.result.lines.some(line => line.employeeId === seed.SEED_EMPLOYEE_ID && line.status === 'Computed'),
      `${run.transactionNumber} must include a computed line for the signed-in employee`);
    assert.ok(run.result.totals.netPay > 0, `${run.transactionNumber} should pay something`);
  });
});

test('each payroll story gets a run in the state its steps actually need', async t => {
  const { seed, runs, storage, companyId } = await load(t);
  seed.ensureScenarioData('client-payroll-edit', companyId, storage);
  seed.ensureScenarioData('client-payroll-approve', companyId, storage);
  const all = runs.readPayrollRuns(companyId, storage);

  const editable = all.find(run => run.id === 'run-studio-open');
  assert.ok(editable, 'editing needs an open transaction');
  assert.ok(['Open', 'Draft'].includes(editable.status), `editable run was ${editable.status}`);

  const review = all.find(run => run.id === 'run-studio-review');
  assert.ok(review, 'approval needs a submitted transaction');
  assert.equal(review.status, 'For Approval');
});

test('preparation is idempotent, so re-running a story does not pile up payroll', async t => {
  const { seed, runs, storage, companyId } = await load(t);
  seed.ensureScenarioData('emp-payslip', companyId, storage);
  const first = runs.readPayrollRuns(companyId, storage).map(run => run.transactionNumber).sort();

  const second = seed.ensureScenarioData('emp-payslip', companyId, storage);
  assert.equal(second.prepared.length, 0, 'nothing should be created the second time');
  assert.deepEqual(runs.readPayrollRuns(companyId, storage).map(run => run.transactionNumber).sort(), first);
  assert.match(seed.describePreparation(second), /already present/);
});

test('the negative-net story gets an employee genuinely below the protected minimum', async t => {
  const { seed, runs, storage, companyId } = await load(t);
  const result = seed.ensureScenarioData('pa-negative-net', companyId, storage);
  assert.equal(result.failed.length, 0, JSON.stringify(result.failed));

  // The deduction has to be in the register *before* payroll is calculated, or
  // the exception queue stays empty however large the deduction is.
  const exception = runs.readPayrollRuns(companyId, storage).find(run => run.id === 'run-studio-exception');
  assert.ok(exception, 'the story needs a run calculated after the deduction exists');
  const line = exception.result.lines.find(item => item.employeeId === seed.SEED_EMPLOYEE_ID);
  assert.ok(line, 'the deduction was assigned to this employee');
  assert.ok(Number(line.takeHome.deferred) > 0, 'the policy should have deferred part of the deduction');
  assert.ok(line.netPay >= line.takeHome.protectedMinimum, 'protected take-home must survive the deduction');
});

test('a prepared run never posts with a blocking payroll error', async t => {
  const { seed, runs, storage, companyId } = await load(t);
  ['emp-payslip-history', 'client-payroll-edit', 'client-payroll-approve', 'pa-negative-net']
    .forEach(id => seed.ensureScenarioData(id, companyId, storage));

  const prepared = runs.readPayrollRuns(companyId, storage);
  assert.ok(prepared.length >= 4);
  prepared.forEach(run => {
    assert.equal(runs.blockingPayrollExceptions(run).length, 0,
      `${run.transactionNumber} still carries a blocking error: ${JSON.stringify(runs.blockingPayrollExceptions(run))}`);
    // An employee with no compensation is left out rather than posted at a
    // negative net, and the run says so.
    (run.result?.lines || []).filter(line => line.status === 'Computed')
      .forEach(line => assert.ok(line.netPay >= 0, `${run.transactionNumber} pays ${line.name} a negative net`));
  });
});

test('a story with no declared need reports nothing rather than inventing data', async t => {
  const { seed, runs, storage, companyId } = await load(t);
  const result = seed.ensureScenarioData('emp-leave', companyId, storage);
  assert.deepEqual(result.needs, []);
  assert.deepEqual(result.prepared, []);
  assert.equal(seed.describePreparation(result), null);
  assert.equal(runs.readPayrollRuns(companyId, storage).length, 0, 'no payroll should be invented for a leave story');
});
