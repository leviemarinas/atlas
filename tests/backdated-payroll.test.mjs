/**
 * Backdated payroll: a run whose payout date or period starts before the
 * company's latest posted run is flagged, carries a reason, and — when the
 * company requires it — cannot move forward until P&A approves it. Every run
 * also records the named person who filed it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: index => [...store.keys()][index],
};

const { actionsFor, applyAction, backdatedAgainst, backdatedApprovalPending, fileRun, newPayrollRun } = await import('../src/payrollRuns.js');

const COMPANY = 'ABC-PH-001';
const CLIENT = 'John Doe (Client Admin)';
const PA = 'John Doe (P&A Admin)';

const posted = {
  ...newPayrollRun({ runs: [], companyId: COMPANY }),
  id: 'run-posted-nov',
  transactionNumber: 'PR-2025-11-001',
  status: 'Posted',
  periodStart: '2025-11-01',
  periodEnd: '2025-11-15',
  payoutDate: '2025-11-15',
};

const draftFor = (periodStart, periodEnd, payoutDate, extra = {}) => ({
  ...newPayrollRun({ runs: [posted], companyId: COMPANY }),
  periodStart, periodEnd, payoutDate,
  result: { totals: {}, lines: [] },
  ...extra,
});

test('a run is backdated when its payout date or period start falls before the latest posted run', () => {
  assert.equal(backdatedAgainst(draftFor('2025-11-16', '2025-11-30', '2025-11-30'), [posted]), null);
  assert.equal(backdatedAgainst(draftFor('2025-10-16', '2025-10-31', '2025-10-31'), [posted]).transactionNumber, 'PR-2025-11-001');
  // A special run paid later but covering an earlier period is still backdated.
  assert.ok(backdatedAgainst(draftFor('2025-10-01', '2025-10-31', '2025-11-20'), [posted]));
  // Open, draft or cancelled runs are not a reference point — only posted payroll.
  assert.equal(backdatedAgainst(draftFor('2025-10-16', '2025-10-31', '2025-10-31'), [{ ...posted, status: 'Open' }]), null);
});

test('filing records the named person and date, and a clean run carries no backdating', () => {
  const run = fileRun(draftFor('2025-11-16', '2025-11-30', '2025-11-30'), { runs: [posted], actor: CLIENT });
  assert.equal(run.createdBy, CLIENT);
  assert.match(run.createdAt, /^\d{4}-\d{2}-\d{2} /);
  assert.equal(run.backdated, null);
  assert.deepEqual(run.audit.map(entry => [entry.action, entry.actor]), [['Filed', CLIENT]]);
});

test("a Client Admin's backdated run waits for P&A and cannot be posted as draft", () => {
  const run = fileRun(draftFor('2025-10-16', '2025-10-31', '2025-10-31', { backdatedReason: 'Missed October adjustments' }), { runs: [posted], actor: CLIENT });
  assert.equal(run.backdated.reason, 'Missed October adjustments');
  assert.equal(run.backdated.approval.status, 'Pending');
  assert.ok(backdatedApprovalPending(run));
  assert.equal(run.audit[0].action, 'Backdated run filed');
  assert.match(applyAction(run, 'postDraft', { actor: CLIENT }).error, /waiting for P&A approval/);
  assert.ok(actionsFor(run, [posted], {}).find(action => action.key === 'postDraft').disabled);
  assert.ok(!actionsFor(run, [posted], {}).some(action => action.key === 'approveBackdate'), 'a client is not offered the P&A decision');
});

test('only P&A can approve or reject, and rejecting cancels the run', () => {
  const run = fileRun(draftFor('2025-10-16', '2025-10-31', '2025-10-31', { backdatedReason: 'Late timekeeping' }), { runs: [posted], actor: CLIENT });
  assert.match(applyAction(run, 'approveBackdate', { actor: CLIENT }).error, /Only P&A/);
  assert.deepEqual(actionsFor(run, [posted], { isPaAdmin: true }).filter(action => action.key.endsWith('Backdate')).map(action => action.key), ['approveBackdate', 'rejectBackdate']);

  const approved = applyAction(run, 'approveBackdate', { actor: PA, isPaAdmin: true, remarks: 'Checked with payroll' }).run;
  assert.equal(approved.backdated.approval.status, 'Approved');
  assert.equal(approved.backdated.approval.by, PA);
  assert.equal(approved.status, 'Open');
  assert.equal(applyAction(approved, 'postDraft', { actor: CLIENT }).run.status, 'Draft');

  const rejected = applyAction(run, 'rejectBackdate', { actor: PA, isPaAdmin: true, remarks: 'File as a special run instead' }).run;
  assert.equal(rejected.backdated.approval.status, 'Rejected');
  assert.equal(rejected.status, 'Cancelled');
});

test('P&A filing a backdated run approves it, and a company can turn the approval off', () => {
  const byPa = fileRun(draftFor('2025-10-16', '2025-10-31', '2025-10-31', { backdatedReason: 'Correction' }), { runs: [posted], actor: PA, isPaAdmin: true });
  assert.equal(byPa.backdated.approval.status, 'Approved');
  assert.ok(!backdatedApprovalPending(byPa));

  const noApproval = fileRun(draftFor('2025-10-16', '2025-10-31', '2025-10-31', { backdatedReason: 'Correction' }), { runs: [posted], actor: CLIENT, requiresApproval: false });
  assert.equal(noApproval.backdated.approval.status, 'Not required');
  assert.equal(applyAction(noApproval, 'postDraft', { actor: CLIENT }).run.status, 'Draft');
});
