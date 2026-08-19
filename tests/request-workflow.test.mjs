import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUEST_PERMISSIONS,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  buildRequest,
  resolveEffectiveCorrection,
  scopeRequests,
  sourceSnapshotMismatches,
  transitionRequest,
  validateRequestPayload,
} from '../src/requestWorkflow.js';
import {
  approveRequest,
  createMemoryRequestStorage,
  flushPendingRequestOutbox,
  flushRequestOutbox,
  readRequests,
  submitRequest,
} from '../src/requestService.js';
import { defaultNotificationRules, notificationEventCatalog } from '../src/notificationServices.js';

const requesterActor = {
  actorId: 'employee-1042',
  displayName: 'John Doe',
  role: 'Employee',
  employeeId: 'E-1042',
  employeeCode: 'E-1042',
  permissions: [REQUEST_PERMISSIONS.SUBMIT],
};
const clientAdminActor = {
  actorId: 'client-admin-001',
  displayName: 'Client Admin',
  role: 'Client Admin',
  permissions: [REQUEST_PERMISSIONS.SUBMIT, REQUEST_PERMISSIONS.SUBMIT_ON_BEHALF],
};
const approverActor = {
  actorId: 'manager-001',
  displayName: 'Maria Santos',
  role: 'Manager',
  permissions: [REQUEST_PERMISSIONS.APPROVE, REQUEST_PERMISSIONS.REJECT],
};
const overrideActor = {
  actorId: 'pa-admin-001',
  displayName: 'P&A Admin',
  role: 'P&A Admin',
  permissions: [REQUEST_PERMISSIONS.OVERRIDE],
};

const baseInput = {
  requestType: REQUEST_TYPES.TIME_IN_OUT_CORRECTION,
  companyId: 'cmp-a',
  company: { companyId: 'cmp-a', companyCode: 'ABC-PH-001' },
  employeeId: 'E-1042',
  employee: { code: 'E-1042', name: 'Ana Reyes' },
  workDate: '2026-08-14',
  originalPunchSnapshot: {
    punchId: 'TP-1',
    companyId: 'cmp-a',
    employeeId: 'E-1042',
    employeeCode: 'E-1042',
    workDate: '2026-08-14',
    clockIn: '08:27',
    clockOut: '17:02',
  },
  requestedCorrection: { clockIn: '08:00', clockOut: '17:02' },
  requesterRemarks: 'The timekeeping import was delayed.',
  idempotencyKey: 'submit-001',
};

const authoritativeResolver = ({ originalPunchSnapshot }) => ({ ...originalPunchSnapshot });

function serviceOptions(storage, overrides = {}) {
  return {
    storage,
    activeCompanyId: 'cmp-a',
    actor: requesterActor,
    now: '2026-08-17T02:00:00.000Z',
    authoritativePunchResolver: authoritativeResolver,
    appendAuditEvent: () => {},
    publishNotificationEvent: () => {},
    ...overrides,
  };
}

test('validates a correction against the immutable original punch', () => {
  assert.equal(validateRequestPayload(baseInput).valid, true);
  assert.equal(validateRequestPayload({ ...baseInput, requestedCorrection: { clockIn: '08:27', clockOut: '17:02' } }).valid, false);
  assert.equal(validateRequestPayload({ ...baseInput, requestedCorrection: { clockIn: '18:00', clockOut: '17:02' } }).valid, false);
  assert.equal(validateRequestPayload({ ...baseInput, companyId: '', requesterRemarks: '' }).valid, false);
  assert.equal(validateRequestPayload({ ...baseInput, requestedCorrection: { clockIn: '', clockOut: '08:00' } }).valid, false);
});

test('blank effective values preserve originals and missing-original edges are explicit', () => {
  const onlyOut = { ...baseInput, requestedCorrection: { clockIn: '', clockOut: '17:10' } };
  assert.equal(validateRequestPayload(onlyOut).valid, true);
  assert.deepEqual(resolveEffectiveCorrection(baseInput.originalPunchSnapshot, onlyOut.requestedCorrection), { clockIn: '08:27', clockOut: '17:10' });

  const missingIn = {
    ...baseInput,
    originalPunchSnapshot: { ...baseInput.originalPunchSnapshot, clockIn: '' },
    requestedCorrection: { clockIn: '', clockOut: '18:00' },
  };
  assert.equal(validateRequestPayload(missingIn).valid, true);
  assert.deepEqual(resolveEffectiveCorrection(missingIn.originalPunchSnapshot, missingIn.requestedCorrection), { clockIn: '', clockOut: '18:00' });
  assert.equal(validateRequestPayload({ ...missingIn, requestedCorrection: { clockIn: '', clockOut: '17:02' } }).valid, false, 'blank values must not turn an unchanged missing punch into a correction');
  assert.equal(validateRequestPayload({ ...baseInput, originalPunchSnapshot: { ...baseInput.originalPunchSnapshot, clockOut: '' }, requestedCorrection: { clockIn: '08:00', clockOut: '' } }).valid, true);
  assert.equal(validateRequestPayload({ ...baseInput, originalPunchSnapshot: { ...baseInput.originalPunchSnapshot, clockIn: '' }, requestedCorrection: { clockIn: '', clockOut: '' } }).valid, false);
});

test('builds and submits a versioned request with approval history', () => {
  const draft = buildRequest(baseInput, { requestId: 'req-001', now: '2026-08-17T01:00:00.000Z' });
  assert.equal(draft.status, REQUEST_STATUSES.DRAFT);
  assert.equal(draft.version, 1);
  assert.equal(draft.originalPunchSnapshot.clockIn, '08:27');
  const result = transitionRequest(draft, 'submit', { actor: requesterActor, idempotencyKey: 'submit-001', now: '2026-08-17T01:01:00.000Z' });
  assert.equal(result.request.status, REQUEST_STATUSES.PENDING_APPROVAL);
  assert.equal(result.request.version, 2);
  assert.equal(result.request.approvalHistory.length, 1);
  assert.equal(result.request.approvalHistory[0].action, 'Submitted');
  assert.equal(result.request.requesterRemarks, baseInput.requesterRemarks);
  assert.equal(result.request.approvalSteps[0].assignedTo, 'manager-001');
});

test('approval is version-checked, idempotent, and never overwrites the original punch snapshot', () => {
  const draft = buildRequest(baseInput, { requestId: 'req-002', now: '2026-08-17T01:00:00.000Z' });
  const submitted = transitionRequest(draft, 'submit', { actor: requesterActor, idempotencyKey: 'submit-002', now: '2026-08-17T01:01:00.000Z' }).request;
  assert.throws(() => transitionRequest(submitted, 'approve', { actor: approverActor, idempotencyKey: 'approve-stale', expectedVersion: 1 }), error => error.code === 'REQUEST_VERSION_CONFLICT');
  assert.throws(() => transitionRequest(submitted, 'approve', { actor: approverActor, idempotencyKey: 'approve-missing' }), error => error.code === 'REQUEST_VERSION_CONFLICT');
  const approved = transitionRequest(submitted, 'approve', { actor: approverActor, idempotencyKey: 'approve-002', expectedVersion: submitted.version, now: '2026-08-17T01:02:00.000Z' }).request;
  const retry = transitionRequest(approved, 'approve', { actor: approverActor, idempotencyKey: 'approve-002', expectedVersion: submitted.version, now: '2026-08-17T01:03:00.000Z' });
  assert.equal(approved.status, REQUEST_STATUSES.APPROVED);
  assert.equal(approved.originalPunchSnapshot.clockIn, '08:27');
  assert.equal(approved.requestedCorrection.clockIn, '08:00');
  assert.equal(approved.approvalHistory.length, 2);
  assert.equal(retry.changed, false);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.request.approvalHistory.length, 2);
});

test('rejection requires a remark and keeps requester remarks separate from decision remarks', () => {
  const draft = buildRequest(baseInput, { requestId: 'req-003' });
  const submitted = transitionRequest(draft, 'submit', { actor: requesterActor, idempotencyKey: 'submit-003' }).request;
  assert.throws(() => transitionRequest(submitted, 'reject', { actor: approverActor, expectedVersion: submitted.version, idempotencyKey: 'reject-003' }), /rejection remark/i);
  const rejected = transitionRequest(submitted, 'reject', { actor: approverActor, expectedVersion: submitted.version, remarks: 'Please attach the supervisor confirmation.', idempotencyKey: 'reject-003' }).request;
  const retry = transitionRequest(rejected, 'reject', { actor: approverActor, expectedVersion: submitted.version, remarks: 'same', idempotencyKey: 'reject-003' });
  assert.equal(rejected.status, REQUEST_STATUSES.REJECTED);
  assert.equal(rejected.approvalSteps[0].status, 'Rejected');
  assert.equal(rejected.requesterRemarks, baseInput.requesterRemarks);
  assert.equal(rejected.decisionRemarks, 'Please attach the supervisor confirmation.');
  assert.equal(retry.changed, false);
});

test('source snapshots are cross-checked against an authoritative resolver', () => {
  assert.deepEqual(sourceSnapshotMismatches(baseInput.originalPunchSnapshot, { ...baseInput.originalPunchSnapshot, companyId: 'cmp-b' }), ['companyId']);
  const storage = createMemoryRequestStorage();
  assert.throws(() => submitRequest({ ...baseInput, idempotencyKey: 'source-mismatch-001' }, serviceOptions(storage, {
    authoritativePunchResolver: () => ({ ...baseInput.originalPunchSnapshot, punchId: 'TP-other' }),
  })), error => error.code === 'SOURCE_SNAPSHOT_MISMATCH' && error.mismatches.includes('punchId'));
  assert.throws(() => submitRequest({ ...baseInput, idempotencyKey: 'source-missing-001' }, serviceOptions(storage, { authoritativePunchResolver: () => null })), error => error.code === 'REQUEST_VALIDATION_FAILED');
});

test('submission ownership permits an employee own request and rejects cross-employee filing', () => {
  const ownStorage = createMemoryRequestStorage();
  const own = submitRequest({ ...baseInput, idempotencyKey: 'ownership-own-001' }, serviceOptions(ownStorage, { actor: requesterActor }));
  assert.equal(own.request.requester.employeeId, 'E-1042');
  assert.equal(own.request.filedBy.actorId, requesterActor.actorId);

  const crossEmployeeInput = {
    ...baseInput,
    employeeId: 'E-2288',
    employee: { code: 'E-2288', name: 'Jane Doe' },
    originalPunchSnapshot: { ...baseInput.originalPunchSnapshot, punchId: 'TP-2', employeeId: 'E-2288', employeeCode: 'E-2288' },
    idempotencyKey: 'ownership-cross-001',
  };
  assert.throws(() => submitRequest(crossEmployeeInput, serviceOptions(createMemoryRequestStorage(), { actor: requesterActor })), error => error.code === 'EMPLOYEE_OWNERSHIP_MISMATCH');
});

test('authorized on-behalf submission persists auditable acting-for metadata and unauthorized filing is rejected', () => {
  const input = {
    ...baseInput,
    employeeId: 'E-2288',
    employee: { code: 'E-2288', name: 'Jane Doe' },
    originalPunchSnapshot: { ...baseInput.originalPunchSnapshot, punchId: 'TP-3', employeeId: 'E-2288', employeeCode: 'E-2288' },
    onBehalfOf: { employeeId: 'E-2288', employeeName: 'Jane Doe' },
    onBehalfReason: 'HR desk coverage during leave.',
    idempotencyKey: 'ownership-on-behalf-001',
  };
  const storage = createMemoryRequestStorage();
  const result = submitRequest(input, serviceOptions(storage, { actor: clientAdminActor }));
  assert.equal(result.request.status, REQUEST_STATUSES.PENDING_APPROVAL);
  assert.equal(result.request.requester.employeeId, 'E-2288');
  assert.equal(result.request.filedBy.actorId, clientAdminActor.actorId);
  assert.equal(result.request.onBehalfOf.employeeId, 'E-2288');
  assert.equal(result.request.onBehalfOf.submittedBy.actorId, clientAdminActor.actorId);
  assert.equal(result.request.actingFor.actorId, clientAdminActor.actorId);
  assert.equal(result.request.onBehalfReason, 'HR desk coverage during leave.');

  assert.throws(() => submitRequest({ ...input, onBehalfOf: undefined, idempotencyKey: 'ownership-on-behalf-rationale-only-001' }, serviceOptions(createMemoryRequestStorage(), { actor: clientAdminActor })), error => error.code === 'ON_BEHALF_METADATA_REQUIRED');
  assert.throws(() => submitRequest({ ...input, onBehalfReason: '', onBehalfOf: { employeeId: 'E-2288' }, idempotencyKey: 'ownership-on-behalf-metadata-only-001' }, serviceOptions(createMemoryRequestStorage(), { actor: clientAdminActor })), error => error.code === 'ON_BEHALF_RATIONALE_REQUIRED');
  assert.throws(() => submitRequest({ ...input, onBehalfOf: { employeeId: 'E-9999' }, onBehalfReason: 'Wrong target regression.', idempotencyKey: 'ownership-on-behalf-mismatch-001' }, serviceOptions(createMemoryRequestStorage(), { actor: clientAdminActor })), error => error.code === 'ON_BEHALF_TARGET_MISMATCH');

  const unauthorizedActor = { actorId: 'client-admin-002', displayName: 'Limited Admin', role: 'Client Admin', permissions: [REQUEST_PERMISSIONS.SUBMIT] };
  assert.throws(() => submitRequest({ ...input, idempotencyKey: 'ownership-on-behalf-unauthorized-001' }, serviceOptions(createMemoryRequestStorage(), { actor: unauthorizedActor })), error => error.code === 'SUBMIT_ON_BEHALF_NOT_AUTHORIZED');
});

test('service requires explicit permissions and blocks self or unassigned approval', () => {
  const storage = createMemoryRequestStorage();
  assert.throws(() => submitRequest({ ...baseInput, idempotencyKey: 'auth-missing-001' }, serviceOptions(storage, { actor: 'Client Admin' })), error => error.code === 'ACTOR_NOT_AUTHORIZED');
  const first = submitRequest({ ...baseInput, idempotencyKey: 'auth-self-001' }, serviceOptions(storage));
  const selfActor = { ...requesterActor, permissions: [REQUEST_PERMISSIONS.SUBMIT, REQUEST_PERMISSIONS.APPROVE, REQUEST_PERMISSIONS.REJECT] };
  assert.throws(() => approveRequest(first.request.requestId, serviceOptions(storage, { actor: selfActor, expectedVersion: first.request.version, idempotencyKey: 'auth-self-approve-001' })), error => error.code === 'SELF_APPROVAL_NOT_ALLOWED');
  assert.throws(() => approveRequest(first.request.requestId, serviceOptions(storage, { actor: { actorId: 'manager-999', displayName: 'Other Manager', role: 'Manager', permissions: [REQUEST_PERMISSIONS.APPROVE] }, expectedVersion: first.request.version, idempotencyKey: 'auth-unassigned-001' })), error => error.code === 'APPROVER_NOT_ASSIGNED');
});

test('recorded authorized override can permit a self decision', () => {
  const storage = createMemoryRequestStorage();
  const selfApprover = { ...requesterActor, permissions: [REQUEST_PERMISSIONS.SUBMIT, REQUEST_PERMISSIONS.APPROVE] };
  const input = {
    ...baseInput,
    idempotencyKey: 'override-submit-001',
    overrideMetadata: { authorizedOverride: true, authorizedBy: overrideActor, overrideReason: 'P&A emergency coverage' },
  };
  const submitted = submitRequest(input, serviceOptions(storage, { actor: selfApprover }));
  const result = approveRequest(submitted.request.requestId, serviceOptions(storage, { actor: selfApprover, expectedVersion: submitted.request.version, idempotencyKey: 'override-approve-001' }));
  assert.equal(result.request.status, REQUEST_STATUSES.APPROVED);
});

test('company scoping excludes another company from request reads', () => {
  const rows = [
    { requestId: 'req-a', companyId: 'cmp-a' },
    { requestId: 'req-b', companyId: 'cmp-b' },
  ];
  assert.deepEqual(scopeRequests(rows, 'cmp-a').map(row => row.requestId), ['req-a']);
});

test('service persistence is company-scoped and submit/approve retries are idempotent', () => {
  const storage = createMemoryRequestStorage();
  const sideEffects = [];
  const options = serviceOptions(storage, {
    now: '2026-08-17T02:00:00.000Z',
    appendAuditEvent: event => { assert.equal(storage.read().length, 1); sideEffects.push(`audit:${event.action}`); },
    publishNotificationEvent: event => { assert.equal(storage.read().length, 1); sideEffects.push(`notification:${event.eventKey}`); },
  });
  const first = submitRequest({ ...baseInput, idempotencyKey: 'service-submit-001' }, options);
  const retry = submitRequest({ ...baseInput, idempotencyKey: 'service-submit-001' }, options);
  assert.equal(first.request.status, REQUEST_STATUSES.PENDING_APPROVAL);
  assert.equal(retry.idempotent, true);
  assert.equal(storage.read().length, 1);
  assert.equal(readRequests('cmp-b', { storage, activeCompanyId: 'cmp-a' }).length, 0);
  const approved = approveRequest(first.request.requestId, { ...options, actor: approverActor, expectedVersion: first.request.version, idempotencyKey: 'service-approve-001' });
  const approveRetry = approveRequest(first.request.requestId, { ...options, actor: approverActor, expectedVersion: first.request.version, idempotencyKey: 'service-approve-001' });
  assert.equal(approved.request.status, REQUEST_STATUSES.APPROVED);
  assert.equal(approveRetry.idempotent, true);
  assert.deepEqual(sideEffects, [
    'audit:HrmRequestSubmitted', 'notification:TimeCorrectionSubmitted',
    'audit:HrmRequestApproved', 'notification:TimeCorrectionApproved',
  ]);
});

test('audit and notification failures leave a pending outbox while the business action succeeds, then flush', () => {
  const storage = createMemoryRequestStorage();
  const failed = submitRequest({ ...baseInput, idempotencyKey: 'outbox-001' }, serviceOptions(storage, {
    appendAuditEvent: () => { throw new Error('audit temporarily unavailable'); },
    publishNotificationEvent: () => { throw new Error('notification temporarily unavailable'); },
  }));
  assert.equal(failed.request.status, REQUEST_STATUSES.PENDING_APPROVAL);
  assert.equal(failed.pendingSideEffects.length, 2);
  assert.equal(storage.read()[0].outbox.every(entry => entry.status === 'Pending'), true);
  const flushed = flushRequestOutbox(failed.request.requestId, serviceOptions(storage, {
    appendAuditEvent: event => event,
    publishNotificationEvent: event => event,
  }));
  assert.equal(flushed.pendingSideEffects.length, 0);
  assert.equal(storage.read()[0].outbox.every(entry => entry.status === 'Delivered'), true);
  assert.equal(flushPendingRequestOutbox(serviceOptions(storage)).pendingSideEffects.length, 0);
});

test('notification catalog and defaults contain all TimeCorrection events', () => {
  const keys = notificationEventCatalog.map(event => event.key);
  for (const key of ['TimeCorrectionDraftSaved', 'TimeCorrectionSubmitted', 'TimeCorrectionApproved', 'TimeCorrectionRejected']) assert.ok(keys.includes(key));
  for (const key of ['TimeCorrectionSubmitted', 'TimeCorrectionApproved', 'TimeCorrectionRejected']) assert.ok(defaultNotificationRules.some(rule => rule.eventKey === key));
});
