import {
  REQUEST_PERMISSIONS,
  REQUEST_STATUSES,
  actorHasPermission,
  buildRequest,
  findRequestByIdempotency,
  normalizeActor,
  scopeRequests,
  sourceSnapshotMismatches,
  transitionRequest,
  validateRequestPayload,
} from './requestWorkflow.js';
import {
  appendAuditEvent,
  readActiveCompany,
  readActiveCompanyId,
} from './companyRepository.js';
import { publishNotificationEvent } from './notificationServices.js';

/**
 * Replaceable persistence boundary for HRM requests.  The UI only depends on
 * this module's methods; replacing this adapter with HTTP calls does not
 * require changing the request form, list, or approval detail view.
 */
export const REQUEST_STORAGE_KEY = 'atlas-hrm-requests-v1';
export const REQUEST_OUTBOX_STATUSES = Object.freeze({ PENDING: 'Pending', DELIVERED: 'Delivered' });

const browserStorage = {
  read() {
    try {
      const value = JSON.parse(localStorage.getItem(REQUEST_STORAGE_KEY));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  },
  write(value) {
    localStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify(value));
    return value;
  },
};

export function createMemoryRequestStorage(initial = []) {
  let rows = Array.isArray(initial) ? JSON.parse(JSON.stringify(initial)) : [];
  return {
    read: () => JSON.parse(JSON.stringify(rows)),
    write: value => { rows = JSON.parse(JSON.stringify(value)); return JSON.parse(JSON.stringify(rows)); },
  };
}

const storageFor = options => options.storage || browserStorage;
const now = () => new Date().toISOString();
const text = value => String(value ?? '').trim();

function resolveCompanyId(inputCompanyId, options = {}) {
  const requested = text(inputCompanyId || options.companyId);
  const active = text(options.activeCompanyId || readActiveCompanyId());
  if (requested && active && requested !== active) {
    const error = new Error('The request company does not match the active company scope.');
    error.code = 'COMPANY_SCOPE_MISMATCH';
    throw error;
  }
  return requested || active;
}

function resolveCompany(companyId, inputCompany, options = {}) {
  if (inputCompany) return inputCompany;
  if (options.company) return options.company;
  const active = readActiveCompany();
  return active?.companyId === companyId ? active : { companyId };
}

function assertCompanySnapshot(company, companyId) {
  if (company?.companyId && company.companyId !== companyId) {
    const error = new Error('The company snapshot does not match the active company scope.');
    error.code = 'COMPANY_SCOPE_MISMATCH';
    throw error;
  }
}

function authorizationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireActor(actor, permission) {
  const normalized = normalizeActor(actor);
  if (!normalized.actorId || !normalized.displayName) throw authorizationError('ACTOR_IDENTITY_REQUIRED', 'An explicit actor identity is required.');
  if (!actorHasPermission(normalized, permission)) throw authorizationError('ACTOR_NOT_AUTHORIZED', `${normalized.displayName} is not authorized for ${permission}.`);
  return normalized;
}

function employeeIdFor(value) {
  return text(value?.employeeId || value?.employeeCode || value?.employee?.employeeId || value?.employee?.code);
}

function actorSnapshot(actor) {
  return {
    actorId: actor.actorId,
    displayName: actor.displayName,
    role: actor.role,
  };
}

function filedByActor(input, actor) {
  if (!input.filedBy) return actor;
  const provided = normalizeActor(input.filedBy);
  if (provided.actorId && provided.actorId !== actor.actorId) {
    throw authorizationError('ACTOR_IDENTITY_MISMATCH', 'Filed-by metadata must match the authenticated actor.');
  }
  return actor;
}

function ownershipError(code, message) {
  return authorizationError(code, message);
}

/**
 * Enforce requester ownership at the service boundary. Employee actors may
 * only file for their own employee record; non-employee actors must carry the
 * explicit on-behalf permission and metadata when targeting another person.
 */
function assertSubmissionOwnership(input, actor, employeeId) {
  const targetEmployeeId = text(employeeId);
  if (!targetEmployeeId) return { requester: actor };
  const actorEmployeeId = employeeIdFor(actor);
  const role = text(actor.role).toLowerCase();
  const isEmployeeActor = role === 'employee' || role === 'staff';
  const ownsTarget = Boolean(actorEmployeeId && actorEmployeeId === targetEmployeeId);
  const onBehalfCandidate = input.onBehalfOf;
  const hasOnBehalfObject = Boolean(onBehalfCandidate && typeof onBehalfCandidate === 'object' && !Array.isArray(onBehalfCandidate) && Object.keys(onBehalfCandidate).length > 0);
  const onBehalfObject = hasOnBehalfObject ? onBehalfCandidate : {};
  const metadataEmployeeId = text(onBehalfObject.employeeId || onBehalfObject.employee?.employeeId);
  const metadataEmployeeCode = text(onBehalfObject.employeeCode || onBehalfObject.employee?.employeeCode || onBehalfObject.employee?.code);
  const onBehalfRequested = Boolean(input.onBehalfOf || input.actingFor || input.onBehalfReason || input.onBehalfRationale);
  const rationale = text(input.onBehalfReason || input.onBehalfRationale || onBehalfObject.rationale || input.actingFor?.rationale);

  if (isEmployeeActor && !ownsTarget) {
    throw ownershipError('EMPLOYEE_OWNERSHIP_MISMATCH', 'An Employee actor may only submit a request for their own employee record.');
  }
  if (!ownsTarget && !actorHasPermission(actor, REQUEST_PERMISSIONS.SUBMIT_ON_BEHALF)) {
    throw ownershipError('SUBMIT_ON_BEHALF_NOT_AUTHORIZED', 'Submitting for another employee requires the HRM submit-on-behalf permission.');
  }
  if (!ownsTarget || onBehalfRequested) {
    if (!hasOnBehalfObject || (!metadataEmployeeId && !metadataEmployeeCode)) {
      throw ownershipError('ON_BEHALF_METADATA_REQUIRED', 'An on-behalf submission must include an onBehalfOf object with the target employee ID or code.');
    }
    // The metadata code is checked against the target's employee code, not its
    // id. Comparing a code to an id only ever agreed when a record happened to
    // use one string for both, which rejected every real on-behalf filing.
    const targetEmployeeCode = text(input.employee?.employeeCode || input.employee?.code || input.employeeCode);
    if ((metadataEmployeeId && metadataEmployeeId !== targetEmployeeId)
      || (metadataEmployeeCode && metadataEmployeeCode !== (targetEmployeeCode || targetEmployeeId))) {
      throw ownershipError('ON_BEHALF_TARGET_MISMATCH', 'On-behalf metadata does not match the request employee.');
    }
    if (!rationale) throw ownershipError('ON_BEHALF_RATIONALE_REQUIRED', 'An on-behalf submission must include a non-empty rationale.');
  }

  const employee = input.employee || {};
  const requester = ownsTarget && !onBehalfRequested
    ? actor
    : {
      actorId: text(employee.actorId || employee.employeeId || `employee-${targetEmployeeId}`),
      displayName: text(employee.name || employee.displayName || targetEmployeeId),
      role: 'Employee',
      employeeId: targetEmployeeId,
      employeeCode: text(employee.code || employee.employeeCode || targetEmployeeId),
      permissions: [REQUEST_PERMISSIONS.SUBMIT],
    };
  if (!onBehalfRequested) return { requester };

  const submittedBy = actorSnapshot(actor);
  const target = {
    ...onBehalfObject,
    employeeId: targetEmployeeId,
    employeeCode: text(employee.code || employee.employeeCode || targetEmployeeId),
    employeeName: text(employee.name || employee.displayName || targetEmployeeId),
    submittedBy,
    rationale,
  };
  const actingFor = {
    ...(input.actingFor && typeof input.actingFor === 'object' ? input.actingFor : {}),
    actorId: actor.actorId,
    displayName: actor.displayName,
    role: actor.role,
    employeeId: targetEmployeeId,
    employeeCode: target.employeeCode,
    employeeName: target.employeeName,
    rationale,
  };
  return { requester, onBehalfOf: target, actingFor, onBehalfReason: rationale };
}

function isAuthorizedOverride(request, actor) {
  const override = request.overrideMetadata || request.override || {};
  const authorizedBy = normalizeActor(override.authorizedBy || {});
  return Boolean(
    override.authorizedOverride === true
      && authorizedBy.actorId
      && authorizedBy.actorId !== actor.actorId
      && actorHasPermission(authorizedBy, REQUEST_PERMISSIONS.OVERRIDE),
  );
}

function assertCanDecide(request, actor, permission) {
  const normalized = requireActor(actor, permission);
  const override = isAuthorizedOverride(request, normalized);
  const administrativeApprover = /admin/i.test(normalized.role) && actorHasPermission(normalized, REQUEST_PERMISSIONS.OVERRIDE);
  const requesterIds = [request.filedBy?.actorId, request.requester?.actorId, request.onBehalfOf?.employeeActorId].filter(Boolean);
  const assignedId = request.assignedApprover?.actorId || request.approvalSteps?.[0]?.assignedTo;
  if (requesterIds.includes(normalized.actorId) && !override) throw authorizationError('SELF_APPROVAL_NOT_ALLOWED', 'The requester cannot approve or reject their own request without a recorded authorized override.');
  if (assignedId && assignedId !== normalized.actorId && !override && !administrativeApprover) throw authorizationError('APPROVER_NOT_ASSIGNED', 'This request is assigned to another approver.');
  return normalized;
}

/** Read-only authorization check for the UI; the service still rechecks it. */
export function isActorAuthorizedForDecision(request, actor, permission = REQUEST_PERMISSIONS.APPROVE) {
  try {
    assertCanDecide(request, actor, permission);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the source punch through a replaceable authoritative adapter. The
 * bundled UI supplies a local resolver; a server adapter can inject its own
 * timekeeping lookup without changing workflow validation.
 */
export function resolveAuthoritativePunch(payload, options = {}) {
  const resolver = options.authoritativePunchResolver || options.resolveAuthoritativePunch || options.punchResolver;
  if (typeof resolver !== 'function') return payload.originalPunchSnapshot;
  const source = resolver({
    companyId: payload.companyId,
    employeeId: payload.employeeId,
    workDate: payload.workDate,
    punchId: payload.originalPunchSnapshot?.punchId,
    requestType: payload.requestType,
    originalPunchSnapshot: payload.originalPunchSnapshot,
  });
  if (source && typeof source.then === 'function') throw validationError(['The authoritative punch resolver must be synchronous in this prototype.']);
  if (!source) throw validationError(['The original punch could not be resolved from the authoritative time source.']);
  const mismatches = sourceSnapshotMismatches(payload.originalPunchSnapshot || {}, source);
  if (mismatches.length) {
    const error = validationError([`The original punch snapshot does not match the authoritative source (${mismatches.join(', ')}).`]);
    error.code = 'SOURCE_SNAPSHOT_MISMATCH';
    error.mismatches = mismatches;
    throw error;
  }
  return source;
}

function eventKeyForAction(request, action) {
  return request.requestType === 'TIME_IN_OUT_CORRECTION'
    ? `TimeCorrection${action}`
    : `HrmRequest${action}`;
}

function buildOutbox(request, action, actor, summary, timestamp) {
  const actorName = normalizeActor(actor).displayName || 'System';
  return [
    {
      outboxId: `${request.requestId}:${action}:audit`,
      kind: 'audit',
      status: REQUEST_OUTBOX_STATUSES.PENDING,
      attempts: 0,
      createdAt: timestamp,
      deliveredAt: '',
      lastError: '',
      payload: {
        companyId: request.companyId,
        actor: actorName,
        action: `HrmRequest${action}`,
        entityType: 'HrmRequest',
        entityId: request.requestId,
        correlationId: request.requestId,
        summary,
      },
    },
    {
      outboxId: `${request.requestId}:${action}:notification`,
      kind: 'notification',
      status: REQUEST_OUTBOX_STATUSES.PENDING,
      attempts: 0,
      createdAt: timestamp,
      deliveredAt: '',
      lastError: '',
      payload: {
        eventKey: eventKeyForAction(request, action),
        companyId: request.companyId,
        correlationId: request.requestId,
        summary,
        actor: actorName,
        actorId: normalizeActor(actor).actorId,
        employeeId: request.employeeId,
        recipientEmployeeId: request.employeeId,
      },
    },
  ];
}

function sideEffectHandlers(options = {}) {
  return {
    audit: options.appendAuditEvent || (typeof localStorage !== 'undefined' ? appendAuditEvent : null),
    notification: options.publishNotificationEvent || (typeof localStorage !== 'undefined' ? publishNotificationEvent : null),
  };
}

function deliverOutbox(request, options = {}) {
  const handlers = sideEffectHandlers(options);
  const next = JSON.parse(JSON.stringify(request));
  next.outbox = (Array.isArray(next.outbox) ? next.outbox : []).map(entry => {
    if (entry.status === REQUEST_OUTBOX_STATUSES.DELIVERED) return entry;
    const updated = { ...entry, attempts: Number(entry.attempts || 0) + 1 };
    const handler = handlers[entry.kind];
    if (!handler) {
      updated.lastError = 'No delivery handler is configured in this runtime.';
      return updated;
    }
    try {
      handler(entry.payload);
      updated.status = REQUEST_OUTBOX_STATUSES.DELIVERED;
      updated.deliveredAt = options.now || now();
      updated.lastError = '';
    } catch (error) {
      // The request decision has already been persisted. Keep delivery
      // pending and expose the error for retry without failing the decision.
      updated.lastError = error?.message || String(error);
    }
    return updated;
  });
  return next;
}

function persistWithOutbox(rows, request, action, actor, summary, options = {}) {
  const timestamp = options.now || now();
  const queued = { ...request, outbox: [...(request.outbox || []), ...buildOutbox(request, action, actor, summary, timestamp)] };
  const queuedRows = rows.map(row => row.requestId === request.requestId ? queued : row);
  writeAll(queuedRows, options);
  const delivered = deliverOutbox(queued, options);
  let deliveryPersisted = true;
  try {
    writeAll(queuedRows.map(row => row.requestId === request.requestId ? delivered : row), options);
  } catch {
    // The queued request write succeeded; a second write failure leaves the
    // persisted entries pending for a later flush.
    deliveryPersisted = false;
  }
  const result = deliveryPersisted ? delivered : queued;
  return {
    request: result,
    pendingSideEffects: result.outbox.filter(entry => entry.status === REQUEST_OUTBOX_STATUSES.PENDING),
    deliveryPersisted,
    localStorageAtomicityWarning: deliveryPersisted ? '' : 'The business request was persisted, but the local side-effect delivery update could not be atomically committed. Retry the pending outbox.',
  };
}

function validationError(errors) {
  const error = new Error(errors.join(' '));
  error.code = 'REQUEST_VALIDATION_FAILED';
  error.errors = errors;
  return error;
}

function readAll(options = {}) {
  const rows = storageFor(options).read();
  return Array.isArray(rows) ? rows : [];
}

function writeAll(rows, options = {}) {
  return storageFor(options).write(rows);
}

function makeId(options = {}) {
  if (options.requestId) return options.requestId;
  if (globalThis.crypto?.randomUUID) return `req-${globalThis.crypto.randomUUID()}`;
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readRequests(companyId = '', options = {}) {
  const activeCompanyId = text(options.activeCompanyId || readActiveCompanyId());
  const requestedCompanyId = text(companyId) || activeCompanyId;
  // Reads never expose another tenant's rows, even when a caller passes an
  // explicit company ID.  A future API adapter can turn this into a 403.
  if (requestedCompanyId !== activeCompanyId) return [];
  return scopeRequests(readAll(options), requestedCompanyId);
}

export function readRequest(requestId, companyId = '', options = {}) {
  return readRequests(companyId, options).find(request => request.requestId === requestId) || null;
}

export function saveDraftRequest(input = {}, options = {}) {
  const companyId = resolveCompanyId(input.companyId, options);
  const company = resolveCompany(companyId, input.company, options);
  assertCompanySnapshot(company, companyId);
  const actor = requireActor(options.actor || input.filedBy || input.requester, REQUEST_PERMISSIONS.SUBMIT);
  const filedBy = filedByActor(input, actor);
  const employeeId = text(input.employeeId || input.employee?.code || input.employee?.employeeId);
  const ownership = assertSubmissionOwnership({ ...input, onBehalfOf: input.onBehalfOf || options.onBehalfOf, actingFor: input.actingFor || options.actingFor, onBehalfReason: input.onBehalfReason || options.onBehalfReason }, actor, employeeId);
  const draft = buildRequest({
    ...input,
    companyId,
    company,
    status: REQUEST_STATUSES.DRAFT,
    requester: ownership.requester,
    filedBy,
    onBehalfOf: ownership.onBehalfOf,
    actingFor: ownership.actingFor,
    onBehalfReason: ownership.onBehalfReason,
  }, { requestId: makeId(options), now: options.now || now() });
  const rows = readAll(options);
  const next = [...rows, draft];
  const persisted = persistWithOutbox(next, draft, 'DraftSaved', actor, `${draft.requestId} saved as a draft.`, options);
  return { ...persisted, created: true, idempotent: false };
}

export function submitRequest(input = {}, options = {}) {
  const companyId = resolveCompanyId(input.companyId, options);
  const company = resolveCompany(companyId, input.company, options);
  assertCompanySnapshot(company, companyId);
  const actor = requireActor(options.actor || input.filedBy || input.requester, REQUEST_PERMISSIONS.SUBMIT);
  const filedBy = filedByActor(input, actor);
  const idempotencyKey = text(input.idempotencyKey || options.idempotencyKey);
  if (!idempotencyKey) throw validationError(['An idempotency key is required when submitting a request.']);
  const rows = readAll(options);
  const existing = findRequestByIdempotency(rows, companyId, idempotencyKey);
  if (existing) return { request: existing, created: false, idempotent: true };
  const employeeId = text(input.employeeId || input.employee?.code || input.employee?.employeeId);
  const ownership = assertSubmissionOwnership({ ...input, onBehalfOf: input.onBehalfOf || options.onBehalfOf, actingFor: input.actingFor || options.actingFor, onBehalfReason: input.onBehalfReason || options.onBehalfReason }, actor, employeeId);
  const payload = {
    ...input,
    companyId,
    company,
    idempotencyKey,
    requester: ownership.requester,
    filedBy,
    onBehalfOf: ownership.onBehalfOf,
    actingFor: ownership.actingFor,
    onBehalfReason: ownership.onBehalfReason,
  };
  if (payload.requestType === 'TIME_IN_OUT_CORRECTION') {
    payload.originalPunchSnapshot = resolveAuthoritativePunch(payload, options);
  }
  const validation = validateRequestPayload(payload);
  if (!validation.valid) throw validationError(validation.errors);

  const draft = buildRequest(payload, { requestId: makeId(options), now: options.now || now() });
  const transitioned = transitionRequest(draft, 'submit', {
    actor,
    idempotencyKey,
    now: options.now || now(),
  });
  const nextRows = [transitioned.request, ...rows];
  const persisted = persistWithOutbox(nextRows, transitioned.request, 'Submitted', actor, `${transitioned.request.requestId} submitted for manager approval.`, options);
  return { ...persisted, created: true, idempotent: false };
}

function decide(requestId, action, options = {}) {
  const companyId = resolveCompanyId('', options);
  const rows = readAll(options);
  const scoped = scopeRequests(rows, companyId);
  const current = scoped.find(request => request.requestId === requestId);
  if (!current) {
    const error = new Error('Request was not found in the active company scope.');
    error.code = 'REQUEST_NOT_FOUND';
    throw error;
  }
  const permission = action === 'approve' ? REQUEST_PERMISSIONS.APPROVE : REQUEST_PERMISSIONS.REJECT;
  const actor = assertCanDecide(current, options.actor, permission);
  const key = text(options.idempotencyKey || options[`${action}IdempotencyKey`]);
  const transitioned = transitionRequest(current, action, { actor, remarks: options.decisionRemarks ?? options.remarks, idempotencyKey: key, expectedVersion: options.expectedVersion, now: options.now || now() });
  if (!transitioned.changed) return { request: current, created: false, idempotent: true };
  const nextRows = rows.map(request => request.requestId === requestId && request.companyId === companyId ? transitioned.request : request);
  const actionName = action === 'approve' ? 'Approved' : 'Rejected';
  const persisted = persistWithOutbox(nextRows, transitioned.request, actionName, actor, `${transitioned.request.requestId} was ${actionName.toLowerCase()}.`, options);
  return { ...persisted, created: false, idempotent: false };
}

export function approveRequest(requestId, options = {}) {
  return decide(requestId, 'approve', options);
}

export function rejectRequest(requestId, options = {}) {
  return decide(requestId, 'reject', options);
}

export function flushRequestOutbox(requestId, options = {}) {
  const companyId = resolveCompanyId('', options);
  const rows = readAll(options);
  const current = scopeRequests(rows, companyId).find(request => request.requestId === requestId);
  if (!current) throw authorizationError('REQUEST_NOT_FOUND', 'Request was not found in the active company scope.');
  const delivered = deliverOutbox(current, options);
  let deliveryPersisted = true;
  try {
    writeAll(rows.map(row => row.requestId === requestId && row.companyId === companyId ? delivered : row), options);
  } catch {
    // Keep the in-memory result for diagnostics; the previously queued record
    // remains the source of truth for the next retry.
    deliveryPersisted = false;
  }
  const result = deliveryPersisted ? delivered : current;
  return {
    request: result,
    pendingSideEffects: result.outbox.filter(entry => entry.status === REQUEST_OUTBOX_STATUSES.PENDING),
    deliveryPersisted,
    localStorageAtomicityWarning: deliveryPersisted ? '' : 'The outbox flush ran, but local storage could not commit the delivery update. Retry the pending outbox.',
  };
}

export function flushPendingRequestOutbox(options = {}) {
  const companyId = resolveCompanyId('', options);
  let rows = readAll(options);
  let deliveredCount = 0;
  let deliveryPersisted = true;
  const pendingRequests = scopeRequests(rows, companyId).filter(request => (request.outbox || []).some(entry => entry.status === REQUEST_OUTBOX_STATUSES.PENDING));
  for (const request of pendingRequests) {
    const delivered = deliverOutbox(request, options);
    deliveredCount += (delivered.outbox || []).filter(entry => entry.status === REQUEST_OUTBOX_STATUSES.DELIVERED).length - (request.outbox || []).filter(entry => entry.status === REQUEST_OUTBOX_STATUSES.DELIVERED).length;
    rows = rows.map(row => row.requestId === request.requestId && row.companyId === companyId ? delivered : row);
  }
  if (pendingRequests.length) {
    try { writeAll(rows, options); } catch {
      deliveryPersisted = false;
      // Re-read the queued source of truth so callers do not mistake an
      // in-memory delivery result for a committed delivery update.
      rows = readAll(options);
    }
  }
  const pendingSideEffects = scopeRequests(rows, companyId).flatMap(request => (request.outbox || []).filter(entry => entry.status === REQUEST_OUTBOX_STATUSES.PENDING));
  return {
    requests: scopeRequests(rows, companyId),
    deliveredCount,
    pendingSideEffects,
    deliveryPersisted,
    localStorageAtomicityWarning: deliveryPersisted ? '' : 'The outbox flush ran, but local storage could not commit the delivery update. Retry the pending outbox.',
  };
}

export const retryRequestOutbox = flushRequestOutbox;

/**
 * Seed a company's request store the first time it is opened.  Seeds are only
 * written when the company has no requests at all, so a demo that has already
 * filed, approved or cancelled something is never overwritten.
 */
export function seedRequestsIfEmpty(companyId, rows = [], options = {}) {
  const storage = storageFor(options);
  const scope = text(companyId);
  const existing = storage.read();
  if (scopeRequests(existing, scope).length) return existing;
  const seeded = rows.map(row => buildRequest({ ...row, companyId: scope, company: { companyId: scope } }, { requestId: row.requestId, now: row.createdAt || now() }));
  return storage.write([...existing, ...seeded]);
}

/** Withdraw a request the employee filed but that has not been decided yet. */
export function cancelRequest(requestId, options = {}) {
  const storage = storageFor(options);
  const rows = storage.read();
  const index = rows.findIndex(row => row.requestId === requestId);
  if (index === -1) {
    const error = new Error('The request could not be found.');
    error.code = 'REQUEST_NOT_FOUND';
    throw error;
  }
  const current = rows[index];
  if (current.status === REQUEST_STATUSES.APPROVED || current.status === REQUEST_STATUSES.REJECTED) {
    const error = new Error('A decided request can no longer be cancelled.');
    error.code = 'REQUEST_WORKFLOW_INVALID_TRANSITION';
    throw error;
  }
  const at = now();
  const actor = normalizeActor(options.actor);
  const cancelled = {
    ...current,
    status: 'Cancelled',
    updatedAt: at,
    decidedAt: at,
    version: Number(current.version || 1) + 1,
    approvalHistory: [...(current.approvalHistory || []), {
      historyId: `${current.requestId}-cancelled-${(current.approvalHistory || []).length + 1}`,
      action: 'Cancelled',
      status: 'Cancelled',
      actor: actor.displayName || actor.actorId || 'System',
      actorId: actor.actorId,
      actorRole: actor.role,
      remarks: text(options.remarks),
      at,
      version: Number(current.version || 1) + 1,
    }],
  };
  const next = [...rows];
  next[index] = cancelled;
  storage.write(next);
  (options.appendAuditEvent || appendAuditEvent)?.({ area: 'HRM request', action: 'Cancelled', reference: current.requestId, actor: actor.displayName || actor.actorId });
  return { request: cancelled, changed: true };
}

/** Replace the details of a request that is still awaiting a decision. */
export function updateRequestDetails(requestId, requestDetails = {}, options = {}) {
  const storage = storageFor(options);
  const rows = storage.read();
  const index = rows.findIndex(row => row.requestId === requestId);
  if (index === -1) {
    const error = new Error('The request could not be found.');
    error.code = 'REQUEST_NOT_FOUND';
    throw error;
  }
  const current = rows[index];
  if (current.status !== REQUEST_STATUSES.PENDING_APPROVAL && current.status !== REQUEST_STATUSES.DRAFT) {
    const error = new Error('Only a pending request can be edited.');
    error.code = 'REQUEST_WORKFLOW_INVALID_TRANSITION';
    throw error;
  }
  const at = now();
  const merged = { ...current.requestDetails, ...requestDetails };
  const updated = {
    ...current,
    requestDetails: merged,
    requestData: merged,
    requesterRemarks: text(requestDetails.reason ?? current.requesterRemarks),
    remarks: text(requestDetails.reason ?? current.remarks),
    updatedAt: at,
    version: Number(current.version || 1) + 1,
  };
  const next = [...rows];
  next[index] = updated;
  storage.write(next);
  return { request: updated, changed: true };
}
