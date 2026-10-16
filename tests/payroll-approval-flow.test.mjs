import assert from 'node:assert/strict';
import test from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: index => [...store.keys()][index],
};

const { actionsFor, applyAction } = await import('../src/payrollRuns.js');
const flow = await import('../src/payrollApprovalFlow.js');
const { MAX_ACROSS, MAX_DOWN, defaultHierarchy, flowFor, hierarchyProblems, normalizeHierarchy, signaturesAt } = flow;

/**
 * Who signs each level (HTP027/028: up to 6 levels down, 3 across; Annex C: approval based on the approval
 * hierarchy). The hierarchy is copied onto a run when it is filed, and the status machine enforces it.
 */
const rows = (...levels) => [{ level: 1, mode: 'Sequential', approvers: ['Preparer'] }, ...levels.map(([mode, approvers]) => ({ mode, approvers }))];
const draft = (hierarchy = defaultHierarchy(), levels = hierarchy.length) => ({
  id: 'r1', transactionNumber: 'PR-2026-10-001', status: 'Draft', payrollType: 'Regular', approvals: [], audit: [],
  approvalLevels: levels, approvalFlow: flowFor(hierarchy, levels),
});
const act = (run, action, actor, role) => applyAction(run, action, { actor, role, runs: [run] });
const ANA = ['Ana (Client Admin)', 'client_admin'];
const BEN = ['Ben (P&A Admin)', 'pa_admin'];
const CARA = ['Cara (Client Admin)', 'client_admin'];
const MARIA = ['Maria (P&A SuperAdmin)', 'pa_superadmin'];
const submitted = run => act(run, 'submitReview', ...ANA).run;

test('a hierarchy has at most six levels down and three approvers across', () => {
  const big = normalizeHierarchy(Array.from({ length: 9 }, () => ({ mode: 'Parallel', approvers: ['Client Admin', 'P&A Admin', 'P&A SuperAdmin', 'Client Admin'] })));
  assert.equal(big.length, MAX_DOWN);
  assert.ok(big.slice(1).every(row => row.approvers.length <= MAX_ACROSS));
  assert.deepEqual(big[0], { level: 1, mode: 'Sequential', approvers: ['Preparer'] }, 'level 1 is always the preparer');
  assert.deepEqual(hierarchyProblems(rows(['Any one of them', []])), ['Level 2 needs at least one approver.']);
  assert.match(hierarchyProblems(rows())[0], /at least two levels/);
  assert.deepEqual(hierarchyProblems(defaultHierarchy()), []);
});

test('free text from the first version keeps the roles it names and drops the rest', () => {
  const legacy = normalizeHierarchy([{ level: 1, mode: 'Sequential', approvers: 'Preparer' }, { level: 2, mode: 'Parallel', approvers: 'Checker, Reviewer, P&A Admin' }, { level: 3, mode: 'Sequential', approvers: 'Client Admin' }]);
  assert.deepEqual(legacy[1].approvers, ['P&A Admin']);
  assert.deepEqual(legacy[2].approvers, ['Client Admin']);
});

test('a run takes its levels from the hierarchy, and a level the hierarchy lacks is open', () => {
  const stages = flowFor(defaultHierarchy(), 4);
  assert.equal(stages.length, 4);
  assert.deepEqual(stages[1], { level: 2, mode: 'Any one of them', approvers: ['Client Admin', 'P&A Admin'] });
  assert.deepEqual(stages[2].approvers, ['P&A SuperAdmin']);
  assert.equal(stages[3].open, true);
  assert.equal(flowFor(defaultHierarchy(), 2).length, 2);
});

test('only the approvers a level lists may sign it, and a SuperAdmin may sign any level', () => {
  const run = submitted(draft());
  assert.equal(run.status, 'For Review');
  // Level 2: a Client Admin or a P&A Admin.
  assert.match(act(run, 'submitApproval', 'Dee (P&A SuperAdmin)', 'employee').error, /Only a Client Admin, a P&A Admin or a P&A SuperAdmin/);
  const reviewed = act(run, 'submitApproval', ...BEN);
  assert.equal(reviewed.error, undefined);
  assert.equal(reviewed.run.status, 'For Approval');
  assert.ok(act(run, 'submitApproval', ...CARA).run, 'a different Client Admin may also sign level 2');
  assert.equal(act(run, 'submitApproval', ...MARIA).run.status, 'For Approval', 'a SuperAdmin may sign any level');
  // Level 3 (final): the SuperAdmin only.
  const refused = act(reviewed.run, 'approve', ...CARA);
  assert.match(refused.error, /Level 3 is signed by P&A SuperAdmin\. A Client Admin is not one of them/);
  assert.equal(act(reviewed.run, 'approve', ...MARIA).run.status, 'Approved');
});

test('an Admin cannot be a different person only by role, so the same person still cannot sign twice', () => {
  const run = submitted(draft());
  assert.match(act(run, 'submitApproval', ...ANA).error, /already took part/);
});

test('a parallel level needs every approver, in any order', () => {
  const run = submitted(draft(rows(['Parallel', ['Client Admin', 'P&A Admin']], ['Sequential', ['P&A SuperAdmin']])));
  const first = act(run, 'submitApproval', ...BEN);
  assert.equal(first.error, undefined);
  assert.equal(first.run.status, 'For Review', 'one of two is not enough');
  assert.match(first.message, /1 of 2 signed\. Waiting for Client Admin/);
  assert.deepEqual(first.notice, { kind: 'waiting', level: 2, total: 3, labels: ['Client Admin'] });
  assert.match(act(first.run, 'submitApproval', 'Bea (P&A Admin)', 'pa_admin').error, /already signed level 2/);
  const second = act(first.run, 'submitApproval', ...CARA);
  assert.equal(second.run.status, 'For Approval', 'both have signed');
  assert.equal(signaturesAt(second.run, 2).length, 2);
  assert.deepEqual(signaturesAt(second.run, 2).map(item => item.decision), ['Signed', 'Reviewed']);
});

test('a sequential level is signed in the order listed, and a SuperAdmin fills whichever slot is next', () => {
  const run = submitted(draft(rows(['Sequential', ['P&A Admin', 'Client Admin']], ['Sequential', ['P&A SuperAdmin']])));
  assert.match(act(run, 'submitApproval', ...CARA).error, /signed in order\. The P&A Admin signs next/);
  const first = act(run, 'submitApproval', ...BEN);
  assert.equal(first.run.status, 'For Review');
  assert.match(act(first.run, 'submitApproval', 'Bea (P&A Admin)', 'pa_admin').error, /already signed|signed in order/);
  assert.equal(act(first.run, 'submitApproval', ...CARA).run.status, 'For Approval');

  const bySuper = act(run, 'submitApproval', ...MARIA);
  assert.equal(bySuper.run.status, 'For Review', 'the SuperAdmin took the first slot only');
  assert.equal(act(bySuper.run, 'submitApproval', ...CARA).run.status, 'For Approval');
});

test('"any one of them" is complete at the first signature', () => {
  const run = submitted(draft(rows(['Any one of them', ['Client Admin', 'P&A Admin', 'P&A SuperAdmin']], ['Sequential', ['P&A SuperAdmin']])));
  assert.equal(act(run, 'submitApproval', ...BEN).run.status, 'For Approval');
});

test('the final level can need several approvers too', () => {
  const run = draft(rows(['Any one of them', ['P&A Admin']], ['Parallel', ['P&A Admin', 'P&A SuperAdmin']]));
  let current = submitted(run);
  current = act(current, 'submitApproval', ...BEN).run;
  assert.equal(current.status, 'For Approval');
  const partial = act(current, 'approve', 'Bea (P&A Admin)', 'pa_admin');
  assert.equal(partial.run.status, 'For Approval');
  assert.match(partial.message, /final approval: 1 of 2 signed/);
  assert.equal(act(partial.run, 'approve', ...MARIA).run.status, 'Approved');
});

test('only someone who could sign a level can send it back, and a rejection starts a new round', () => {
  const run = submitted(draft());
  assert.match(act(run, 'reject', 'Eli (P&A Admin)', 'employee').error, /Only|signed by/);
  const atFinal = act(run, 'submitApproval', ...BEN).run;
  assert.match(act(atFinal, 'reject', ...CARA).error, /Level 3 is signed by P&A SuperAdmin, so only they can send it back/);
  const rejected = act(atFinal, 'reject', ...MARIA);
  assert.equal(rejected.run.status, 'Open');
  assert.deepEqual(rejected.notice.kind, 'returned');
  assert.deepEqual(rejected.run.approvalFlow, run.approvalFlow, 'the flow stays with the run');
  assert.equal(signaturesAt(rejected.run, 2).length, 0, 'earlier sign-offs do not carry into the next round');
});

test('the buttons say who is next and are off for a role that cannot sign', () => {
  const run = submitted(draft(rows(['Parallel', ['Client Admin', 'P&A Admin']], ['Sequential', ['P&A SuperAdmin']])));
  const labelsFor = (target, role) => actionsFor(target, [target], { canReopen: true, isPaAdmin: true, role }).find(item => item.key === 'submitApproval');
  const sign = labelsFor(run, 'pa_admin');
  assert.equal(sign.label, 'Sign off Level 2');
  assert.match(sign.hint, /0 of 2 signed\. Waiting for Client Admin or P&A Admin/);
  assert.equal(sign.disabled, undefined);
  const first = act(run, 'submitApproval', ...BEN).run;
  assert.equal(labelsFor(first, 'pa_admin').disabled, true, 'the P&A Admin has already signed');
  assert.match(labelsFor(first, 'pa_admin').hint, /already signed/);
  assert.match(labelsFor(first, 'client_admin').hint, /1 of 2 signed\. Waiting for Client Admin/);

  const atFinal = act(act(run, 'submitApproval', ...BEN).run, 'submitApproval', ...CARA).run;
  const approve = actionsFor(atFinal, [atFinal], { canReopen: true, isPaAdmin: true, role: 'client_admin' }).find(item => item.key === 'approve');
  assert.equal(approve.disabled, true);
  assert.match(approve.hint, /signed by P&A SuperAdmin/);
  const reject = actionsFor(atFinal, [atFinal], { role: 'client_admin' }).find(item => item.key === 'reject');
  assert.equal(reject.disabled, true);
});

test('submitting tells the first reviewers they are wanted, and the last review tells the approvers', () => {
  const submit = act(draft(), 'submitReview', ...ANA);
  assert.deepEqual(submit.notice, { kind: 'requested', level: 2, total: 3, final: false, labels: ['Client Admin', 'P&A Admin'] });
  const reviewed = act(submit.run, 'submitApproval', ...BEN);
  assert.deepEqual(reviewed.notice, { kind: 'requested', level: 3, total: 3, final: true, labels: ['P&A SuperAdmin'] });
});

test('a run filed without a hierarchy, or an action without a role, behaves as before', () => {
  const plain = { id: 'r2', transactionNumber: 'PR-1', status: 'Draft', payrollType: 'Regular', approvals: [], audit: [], approvalLevels: 3 };
  let run = act(plain, 'submitReview', 'Ana (Client Admin)', 'client_admin').run;
  run = act(run, 'submitApproval', 'Ben (Client Admin)', 'client_admin').run;
  assert.equal(act(run, 'approve', 'Cara (Client Admin)', 'client_admin').run.status, 'Approved', 'with no flow any payroll role may sign');
  const withFlow = submitted(draft());
  assert.equal(act(withFlow, 'submitApproval', 'Someone Else').run.status, 'For Approval', 'no role given, so no role check');
});
