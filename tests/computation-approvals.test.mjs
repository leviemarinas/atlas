import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

/**
 * Maker-checker for the central formula library: a P&A Admin makes a change, a P&A SuperAdmin
 * approves it, nobody approves their own change, and a client takes no part. Until a change is
 * approved the version in force stays in force.
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
  canApprove, canMake, changeNote, publishesDirectly, checkDecision, decideRequest, lifecycleStatus, openRequestFor,
  personOf, readRequests, submitRequest, withdrawRequest, writeRequests,
} = await import('../src/computationApprovals.js');

const MAKER = { role: 'pa_admin', actor: 'John Doe (P&A Admin)' };
const APPROVER = { role: 'pa_superadmin', actor: 'Maria Santos (P&A SuperAdmin)' };
const record = (patch = {}) => ({ code: 'ERN-001', name: 'Daily Rate', status: 'Active', version: '1.1', ...patch });
const versionChange = (patch = {}) => ({ kind: 'version', record: record({ version: '1.2' }), previous: record(), changes: [{ field: 'Expression', from: 'a', to: 'b' }], note: 'Rounded to 2 decimals', ...patch });

beforeEach(() => globalThis.localStorage.clear());

test('a P&A SuperAdmin is above a P&A Admin: both make changes, only the SuperAdmin approves', () => {
  assert.equal(canMake('pa_admin'), true);
  assert.equal(canMake('pa_superadmin'), true, 'the SuperAdmin can do everything an Admin can');
  assert.equal(publishesDirectly('pa_superadmin'), true);
  assert.equal(publishesDirectly('pa_admin'), false);
  assert.equal(canMake('client_admin'), false);
  assert.equal(canMake('employee'), false);
  assert.equal(canApprove('pa_superadmin'), true);
  assert.equal(canApprove('pa_admin'), false);
  assert.equal(canApprove('client_admin'), false);
});

test('a client cannot submit a formula change', () => {
  const outcome = submitRequest([], versionChange(), { role: 'client_admin', actor: 'Pat Client (Client Admin)' });
  assert.equal(outcome.ok, false);
  assert.match(outcome.reason, /Only P&A/);
});

test('a submitted change waits for approval and the formula keeps its approved status', () => {
  const outcome = submitRequest([], versionChange(), MAKER);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.request.status, 'For Approval');
  assert.equal(outcome.request.fromVersion, '1.1');
  assert.equal(outcome.request.toVersion, '1.2');
  // The version in force is untouched: the formula is still Active while 1.2 waits.
  assert.equal(lifecycleStatus(record(), outcome.list), 'Active');
  assert.equal(changeNote(record(), outcome.list), 'Version 1.2 for approval');
});

test('a formula waiting to be switched on shows For Approval, and a never-approved one is a Draft', () => {
  const draft = record({ status: 'Inactive', version: '1.0', approval: { state: 'Draft' } });
  assert.equal(lifecycleStatus(draft, []), 'Draft');
  const outcome = submitRequest([], { kind: 'activate', record: draft, previous: draft, changes: [{ field: 'Status', from: 'Inactive', to: 'Active' }] }, MAKER);
  assert.equal(lifecycleStatus(draft, outcome.list), 'For Approval');
  assert.equal(lifecycleStatus(record({ status: 'Inactive', approval: { state: 'Approved' } }), []), 'Inactive');
});

test('only one change can wait for a formula at a time', () => {
  const first = submitRequest([], versionChange(), MAKER);
  const second = submitRequest(first.list, versionChange({ record: record({ version: '1.3' }) }), MAKER);
  assert.equal(second.ok, false);
  assert.match(second.reason, /already has a change waiting/);
  assert.ok(openRequestFor('ern-001', first.list), 'the lookup ignores case');
});

test('the SuperAdmin approves, and the decision is recorded with who and when', () => {
  const { list, request } = submitRequest([], versionChange(), MAKER);
  const outcome = decideRequest(list, request.id, 'approve', { ...APPROVER, now: '2026-10-13 09:00:00' });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.request.status, 'Approved');
  assert.equal(outcome.request.decidedBy, APPROVER.actor);
  assert.equal(outcome.request.decidedAt, '2026-10-13 09:00:00');
  assert.equal(openRequestFor('ERN-001', outcome.list), undefined);
});

test('nobody approves a change they made themselves', () => {
  const { request } = submitRequest([], versionChange(), MAKER);
  const sameName = checkDecision(request, { role: 'pa_superadmin', actor: 'John Doe (P&A SuperAdmin)' });
  assert.equal(sameName.ok, false);
  assert.match(sameName.reason, /someone else/);
  // A different person in the approver role is allowed.
  assert.equal(checkDecision(request, APPROVER).ok, true);
});

test('a P&A Admin and a client cannot approve', () => {
  const { list, request } = submitRequest([], versionChange(), MAKER);
  for (const actor of [{ role: 'pa_admin', actor: 'Another Admin (P&A Admin)' }, { role: 'client_admin', actor: 'Pat Client (Client Admin)' }]) {
    const outcome = decideRequest(list, request.id, 'approve', actor);
    assert.equal(outcome.ok, false);
    assert.match(outcome.reason, /P&A SuperAdmin/);
  }
});

test('a rejection needs a reason, and a rejected Inactive formula shows Rejected', () => {
  const inactive = record({ status: 'Inactive', approval: { state: 'Draft' } });
  const { list, request } = submitRequest([], { kind: 'activate', record: inactive, previous: inactive, changes: [] }, MAKER);
  assert.equal(decideRequest(list, request.id, 'reject', APPROVER).ok, false);
  const outcome = decideRequest(list, request.id, 'reject', { ...APPROVER, reason: 'Test case for zero hours is missing' });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.request.decisionReason, 'Test case for zero hours is missing');
  assert.equal(lifecycleStatus(inactive, outcome.list), 'Rejected');
});

test('a rejected change to an Active formula leaves it Active with a note', () => {
  const { list, request } = submitRequest([], versionChange(), MAKER);
  const outcome = decideRequest(list, request.id, 'reject', { ...APPROVER, reason: 'Wrong rounding' });
  assert.equal(lifecycleStatus(record(), outcome.list), 'Active');
  assert.equal(changeNote(record(), outcome.list), 'Last change rejected');
});

test('a decided change cannot be decided again', () => {
  const { list, request } = submitRequest([], versionChange(), MAKER);
  const decided = decideRequest(list, request.id, 'approve', APPROVER);
  const again = decideRequest(decided.list, request.id, 'reject', { ...APPROVER, reason: 'Too late' });
  assert.equal(again.ok, false);
  assert.match(again.reason, /already approved/);
});

test('the maker can withdraw a waiting change, nobody else can', () => {
  const { list, request } = submitRequest([], versionChange(), MAKER);
  assert.equal(withdrawRequest(list, request.id, { actor: APPROVER.actor }).ok, false);
  const outcome = withdrawRequest(list, request.id, { actor: MAKER.actor });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.request.status, 'Withdrawn');
  // Once withdrawn, a new change can be submitted for the same formula.
  assert.equal(submitRequest(outcome.list, versionChange(), MAKER).ok, true);
});

test('the queue survives a reload and the person is read from the actor label', () => {
  const { list } = submitRequest([], versionChange(), MAKER);
  writeRequests(list);
  assert.equal(readRequests().length, 1);
  assert.equal(readRequests()[0].madeBy, MAKER.actor);
  assert.equal(personOf('Maria Santos (P&A SuperAdmin)'), 'Maria Santos');
  assert.equal(personOf('John Doe'), 'John Doe');
});

test('a SuperAdmin approves their own change, and nobody else can approve their own', () => {
  const { list, request } = submitRequest([], versionChange(), APPROVER);
  assert.equal(request.madeByRole, 'pa_superadmin');
  // Without the SuperAdmin's own-change step the same-person rule still stops it.
  assert.equal(checkDecision(request, APPROVER).ok, false);
  const outcome = decideRequest(list, request.id, 'approve', { ...APPROVER, own: true });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.request.status, 'Approved');
  // An Admin's change is never approved by the Admin who made it, whatever the flag says.
  const adminChange = submitRequest([], versionChange(), MAKER);
  assert.equal(decideRequest(adminChange.list, adminChange.request.id, 'approve', { role: 'pa_admin', actor: MAKER.actor, own: true }).ok, false);
});
