/**
 * Pure request-workflow rules shared by the prototype service and focused
 * tests.  The functions in this module deliberately do not know about
 * localStorage, React, or a particular HTTP transport.  A server adapter can
 * replace requestService.js while retaining these request invariants.
 */

export const REQUEST_TYPES = Object.freeze({
  TIME_IN_OUT_CORRECTION: 'TIME_IN_OUT_CORRECTION',
  OVERTIME: 'OVERTIME',
  OT_OFFSET: 'OT_OFFSET',
  TIME_OFF: 'TIME_OFF',
  LEAVE: 'LEAVE',
  SHIFT_CHANGE: 'SHIFT_CHANGE',
  TRANSFER: 'TRANSFER',
  OFFICIAL_BUSINESS: 'OFFICIAL_BUSINESS',
  PETTY_CASH: 'PETTY_CASH',
  EXPENSE_REIMBURSEMENT: 'EXPENSE_REIMBURSEMENT',
  CASH_ADVANCE: 'CASH_ADVANCE',
  CASH_ADVANCE_LIQUIDATION: 'CASH_ADVANCE_LIQUIDATION',
  COMPANY_LOAN: 'COMPANY_LOAN',
  GOVERNMENT_LOAN: 'GOVERNMENT_LOAN',
  COE_REQUEST: 'COE_REQUEST',
  DOCUMENT_REQUEST: 'DOCUMENT_REQUEST',
  RESIGNATION: 'RESIGNATION',
  STAGGERED_PAYMENT: 'STAGGERED_PAYMENT',
});

export const REQUEST_TYPE_LABELS = Object.freeze({
  [REQUEST_TYPES.TIME_IN_OUT_CORRECTION]: 'Time In / Time Out Correction',
  [REQUEST_TYPES.OVERTIME]: 'Overtime',
  [REQUEST_TYPES.OT_OFFSET]: 'OT Offset',
  [REQUEST_TYPES.TIME_OFF]: 'Time Off',
  [REQUEST_TYPES.LEAVE]: 'Leave',
  [REQUEST_TYPES.SHIFT_CHANGE]: 'Shift Change',
  [REQUEST_TYPES.TRANSFER]: 'Transfer',
  [REQUEST_TYPES.OFFICIAL_BUSINESS]: 'Official Business',
  [REQUEST_TYPES.PETTY_CASH]: 'Petty Cash Request',
  [REQUEST_TYPES.EXPENSE_REIMBURSEMENT]: 'Expense Reimbursement',
  [REQUEST_TYPES.CASH_ADVANCE]: 'Cash Advance',
  [REQUEST_TYPES.CASH_ADVANCE_LIQUIDATION]: 'Cash Advance Liquidation',
  [REQUEST_TYPES.COMPANY_LOAN]: 'Company Loan Application',
  [REQUEST_TYPES.GOVERNMENT_LOAN]: 'Government Loan Application',
  [REQUEST_TYPES.COE_REQUEST]: 'Certificate of Employment Request',
  [REQUEST_TYPES.DOCUMENT_REQUEST]: 'Document Request',
  [REQUEST_TYPES.RESIGNATION]: 'Employee Resignation',
  [REQUEST_TYPES.STAGGERED_PAYMENT]: 'Staggered Payment Request',
});

export const REQUEST_STATUSES = Object.freeze({
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

export const APPROVAL_STEP_STATUSES = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

export const REQUEST_PERMISSIONS = Object.freeze({
  SUBMIT: 'hrm.request.submit',
  SUBMIT_ON_BEHALF: 'hrm.request.submit_on_behalf',
  APPROVE: 'hrm.request.approve',
  REJECT: 'hrm.request.reject',
  OVERRIDE: 'hrm.request.override',
});

export const DEFAULT_ASSIGNED_APPROVER = Object.freeze({
  actorId: 'manager-001',
  displayName: 'Maria Santos',
  role: 'Manager',
});

const clone = value => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

const text = value => String(value ?? '').trim();

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isIsoDate(value) {
  if (!isoDatePattern.test(text(value))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isTime(value) {
  return value === '' || value === null || value === undefined || timePattern.test(text(value));
}

export function normalizeTime(value) {
  const normalized = text(value);
  return normalized ? normalized : '';
}

/** Blank requested values mean “keep the original value”. */
export function resolveEffectiveCorrection(original = {}, requested = {}) {
  return {
    clockIn: normalizeTime(requested.clockIn) || normalizeTime(original.clockIn),
    clockOut: normalizeTime(requested.clockOut) || normalizeTime(original.clockOut),
  };
}

export function normalizeActor(actor = {}) {
  if (typeof actor === 'string') {
    return { actorId: text(actor), displayName: text(actor), role: 'Unknown', employeeId: '', employeeCode: '', permissions: [] };
  }
  return {
    actorId: text(actor.actorId || actor.id),
    displayName: text(actor.displayName || actor.name || actor.actorId || actor.id),
    role: text(actor.role),
    employeeId: text(actor.employeeId || actor.employee?.employeeId || actor.employee?.code),
    employeeCode: text(actor.employeeCode || actor.employee?.employeeCode || actor.employee?.code),
    permissions: Array.isArray(actor.permissions) ? [...new Set(actor.permissions.map(text).filter(Boolean))] : [],
  };
}

export function actorHasPermission(actor, permission) {
  return normalizeActor(actor).permissions.includes(permission);
}

/**
 * Returns every validation issue so callers can render the same errors that a
 * server endpoint would return, instead of relying on browser-only form
 * validation.
 */
export function validateRequestPayload(input = {}, { requireRemarks = true } = {}) {
  const errors = [];
  const companyId = text(input.companyId);
  const employeeId = text(input.employeeId || input.employee?.code || input.employee?.employeeId);
  const requestType = text(input.requestType || REQUEST_TYPES.TIME_IN_OUT_CORRECTION);
  const requestDetails = input.requestDetails || input.requestData || input.details || {};
  const workDate = text(input.workDate || input.originalPunchSnapshot?.workDate || requestDetails.startDate || requestDetails.workDate);
  const original = input.originalPunchSnapshot || {};
  const requested = input.requestedCorrection || {};

  if (!companyId) errors.push('Company is required.');
  if (!employeeId) errors.push('Employee is required.');
  if (!Object.values(REQUEST_TYPES).includes(requestType)) errors.push('Request type is not supported.');
  if (!isIsoDate(workDate)) errors.push('Work date must be a valid ISO date.');
  if (requestType === REQUEST_TYPES.TIME_IN_OUT_CORRECTION) {
    if (!text(original.punchId)) errors.push('The original punch snapshot is required.');
    if (!text(original.companyId)) errors.push('The original punch snapshot company is required.');
    if (!text(original.employeeId || original.employeeCode)) errors.push('The original punch snapshot employee is required.');
    if (!text(original.workDate)) errors.push('The original punch snapshot work date is required.');
    if (text(original.companyId) && text(original.companyId) !== companyId) errors.push('The original punch snapshot belongs to another company.');
    if (text(original.employeeId || original.employeeCode) && text(original.employeeId || original.employeeCode) !== employeeId) errors.push('The original punch snapshot belongs to another employee.');
    if (text(original.workDate) && workDate !== text(original.workDate)) errors.push('The request date must match the original punch snapshot.');
    if (text(original.company?.companyId) && text(original.company.companyId) !== companyId) errors.push('The original punch snapshot company metadata does not match the request company.');

    const originalClockIn = normalizeTime(original.clockIn);
    const originalClockOut = normalizeTime(original.clockOut);
    const requestedClockIn = normalizeTime(requested.clockIn);
    const requestedClockOut = normalizeTime(requested.clockOut);
    const effective = resolveEffectiveCorrection(original, requested);
    if (!isTime(originalClockIn) || !isTime(originalClockOut)) errors.push('Original punch times must use HH:mm format.');
    if (!isTime(requestedClockIn) || !isTime(requestedClockOut)) errors.push('Requested time must use HH:mm format.');
    if (!effective.clockIn && !effective.clockOut) errors.push('Enter a requested clock-in or clock-out time.');
    if (effective.clockIn === originalClockIn && effective.clockOut === originalClockOut) errors.push('The requested correction must change at least one punch.');
    if (isTime(effective.clockIn) && isTime(effective.clockOut) && effective.clockIn && effective.clockOut && effective.clockIn > effective.clockOut) errors.push('Effective clock-in must be earlier than effective clock-out.');
    if (requireRemarks && !text(input.requesterRemarks ?? input.remarks)) errors.push('Remarks are required for a correction request.');
  } else {
    const summary = text(input.requesterRemarks ?? input.remarks ?? requestDetails.summary ?? requestDetails.reason);
    if (!requestDetails || typeof requestDetails !== 'object' || Array.isArray(requestDetails) || !Object.keys(requestDetails).length) errors.push('Request details are required.');
    if (requireRemarks && !summary) errors.push('Remarks are required for this request.');
  }

  return { valid: errors.length === 0, errors };
}

/** Compare a client-provided punch snapshot with the authoritative source. */
export function sourceSnapshotMismatches(submitted = {}, authoritative = {}) {
  const fields = [
    ['companyId', submitted.companyId, authoritative.companyId],
    ['employeeId', submitted.employeeId || submitted.employeeCode, authoritative.employeeId || authoritative.employeeCode],
    ['workDate', submitted.workDate, authoritative.workDate],
    ['punchId', submitted.punchId, authoritative.punchId],
    ['clockIn', normalizeTime(submitted.clockIn), normalizeTime(authoritative.clockIn)],
    ['clockOut', normalizeTime(submitted.clockOut), normalizeTime(authoritative.clockOut)],
  ];
  return fields.filter(([, left, right]) => text(left) !== text(right)).map(([field]) => field);
}

const timestampShape = now => ({
  createdAt: now,
  updatedAt: now,
  submittedAt: '',
  decidedAt: '',
});

const metadataShape = {
  delegatedFrom: '',
  delegatedTo: '',
  delegationReason: '',
  delegatedAt: '',
};

const overrideShape = {
  overrideRequested: false,
  overrideBy: '',
  overrideReason: '',
  overriddenAt: '',
};

/** Build a versioned, transport-neutral request aggregate. */
export function buildRequest(input = {}, { requestId, now = new Date().toISOString() } = {}) {
  const resolvedId = text(requestId || input.requestId) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const company = input.company || {};
  const employee = input.employee || {};
  const requester = clone(input.requester || input.filedBy || {});
  const filedBy = clone(input.filedBy || input.requester || {});
  const onBehalfOf = clone(input.onBehalfOf || {});
  const actingFor = clone(input.actingFor || {});
  const onBehalfReason = text(input.onBehalfReason || input.onBehalfRationale || onBehalfOf.rationale || actingFor.rationale);
  const assignedApprover = clone(input.assignedApprover || DEFAULT_ASSIGNED_APPROVER);
  const delegationMetadata = { ...metadataShape, ...(input.delegationMetadata || input.delegation || {}) };
  const overrideMetadata = { ...overrideShape, ...(input.overrideMetadata || input.override || {}) };
  const timestamps = { ...timestampShape(now), ...(input.timestamps || {}) };
  const request = {
    requestId: resolvedId,
    requestType: input.requestType || REQUEST_TYPES.TIME_IN_OUT_CORRECTION,
    requestTypeLabel: REQUEST_TYPE_LABELS[input.requestType || REQUEST_TYPES.TIME_IN_OUT_CORRECTION] || 'HRM request',
    companyId: text(input.companyId),
    company: clone(company),
    employeeId: text(input.employeeId || employee.code || employee.employeeId),
    employee: clone(employee),
    workDate: text(input.workDate || input.originalPunchSnapshot?.workDate || input.requestDetails?.startDate || input.requestData?.startDate || input.details?.startDate),
    originalPunchSnapshot: clone(input.originalPunchSnapshot || {}),
    requestedCorrection: {
      clockIn: normalizeTime(input.requestedCorrection?.clockIn),
      clockOut: normalizeTime(input.requestedCorrection?.clockOut),
    },
    effectiveCorrection: resolveEffectiveCorrection(input.originalPunchSnapshot || {}, input.requestedCorrection || {}),
    requestDetails: clone(input.requestDetails || input.requestData || input.details || {}),
    requestData: clone(input.requestData || input.requestDetails || input.details || {}),
    status: input.status || REQUEST_STATUSES.DRAFT,
    approvalSteps: clone(input.approvalSteps || [{
      stepId: `${resolvedId}-approval-1`,
      order: 1,
      role: 'Manager',
      assignedTo: assignedApprover.actorId || '',
      status: APPROVAL_STEP_STATUSES.PENDING,
      actedAt: '',
      actor: '',
      remarks: '',
    }]),
    approvalHistory: clone(input.approvalHistory || []),
    requesterRemarks: text(input.requesterRemarks ?? input.remarks),
    decisionRemarks: text(input.decisionRemarks),
    // `remarks` remains as a read-compatible alias; decisions never mutate it.
    remarks: text(input.requesterRemarks ?? input.remarks),
    requester,
    filedBy,
    onBehalfOf,
    actingFor,
    onBehalfReason,
    assignedApprover,
    idempotencyKey: text(input.idempotencyKey),
    operationKeys: clone(input.operationKeys || {}),
    delegationMetadata,
    overrideMetadata,
    outbox: clone(input.outbox || []),
    // These aliases keep the future API model explicit without requiring the
    // UI to understand whether metadata is flattened or nested server-side.
    delegation: clone(delegationMetadata),
    override: clone(overrideMetadata),
    metadata: {
      delegation: clone(delegationMetadata),
      override: clone(overrideMetadata),
      onBehalfOf: clone(onBehalfOf),
      actingFor: clone(actingFor),
      onBehalfReason,
    },
    version: Number(input.version || 1),
    ...timestamps,
    timestamps,
  };
  return request;
}

function historyEntry(action, request, { actor = 'System', remarks = '', now }) {
  const normalizedActor = normalizeActor(actor);
  return {
    historyId: `${request.requestId}-${action.toLowerCase()}-${request.approvalHistory.length + 1}`,
    action,
    status: request.status,
    actor: normalizedActor.displayName || normalizedActor.actorId || 'System',
    actorId: normalizedActor.actorId,
    actorRole: normalizedActor.role,
    remarks: text(remarks),
    at: now,
    version: request.version,
  };
}

function transitionError(message) {
  const error = new Error(message);
  error.code = 'REQUEST_WORKFLOW_INVALID_TRANSITION';
  return error;
}

function versionConflict(expectedVersion, actualVersion) {
  const error = new Error(`This request changed since it was opened. Expected version ${expectedVersion}, but the current version is ${actualVersion}. Refresh before deciding.`);
  error.code = 'REQUEST_VERSION_CONFLICT';
  error.expectedVersion = expectedVersion;
  error.currentVersion = actualVersion;
  return error;
}

/**
 * Applies one workflow action immutably.  Replaying an action against its
 * terminal state is a no-op, which is the same behavior expected from a
 * server endpoint receiving a retry after a network timeout.
 */
export function transitionRequest(request, action, { actor = 'System', remarks = '', idempotencyKey = '', expectedVersion, now = new Date().toISOString() } = {}) {
  const current = clone(request);
  const normalizedActor = normalizeActor(actor);
  current.timestamps = { ...timestampShape(current.createdAt || now), ...(current.timestamps || {}) };
  current.operationKeys = { ...(current.operationKeys || {}) };
  current.approvalHistory = Array.isArray(current.approvalHistory) ? current.approvalHistory : [];
  current.approvalSteps = Array.isArray(current.approvalSteps) ? current.approvalSteps : [];
  current.requesterRemarks = text(current.requesterRemarks ?? current.remarks);
  current.decisionRemarks = text(current.decisionRemarks);
  current.effectiveCorrection = current.effectiveCorrection || resolveEffectiveCorrection(current.originalPunchSnapshot, current.requestedCorrection);
  const key = text(idempotencyKey);
  const actionKey = action.toLowerCase();
  if (key && current.operationKeys?.[actionKey] === key) return { request: current, changed: false, idempotent: true };
  if (action === 'approve' || action === 'reject') {
    if (expectedVersion === undefined || expectedVersion === null || text(expectedVersion) === '') throw versionConflict('required', current.version);
    if (Number(expectedVersion) !== Number(current.version)) throw versionConflict(expectedVersion, current.version);
  }

  if (action === 'submit') {
    if (![REQUEST_STATUSES.DRAFT, REQUEST_STATUSES.PENDING_APPROVAL].includes(current.status)) {
      if (current.status === REQUEST_STATUSES.APPROVED || current.status === REQUEST_STATUSES.REJECTED) return { request: current, changed: false, idempotent: true };
      throw transitionError(`A ${current.status} request cannot be submitted.`);
    }
    if (current.status === REQUEST_STATUSES.PENDING_APPROVAL) return { request: current, changed: false, idempotent: true };
    const validation = validateRequestPayload(current);
    if (!validation.valid) {
      const error = transitionError(validation.errors.join(' '));
      error.code = 'REQUEST_VALIDATION_FAILED';
      error.errors = validation.errors;
      throw error;
    }
    current.status = REQUEST_STATUSES.PENDING_APPROVAL;
    current.submittedAt = now;
    current.timestamps.submittedAt = now;
    current.updatedAt = now;
    current.timestamps.updatedAt = now;
    current.version += 1;
    current.operationKeys = { ...current.operationKeys, submit: key || current.idempotencyKey };
    current.approvalHistory = [...current.approvalHistory, historyEntry('Submitted', current, { actor, remarks: current.requesterRemarks || current.remarks, now })];
    return { request: current, changed: true, idempotent: false };
  }

  if (action === 'approve' || action === 'reject') {
    if (current.status === REQUEST_STATUSES.APPROVED && action === 'approve') return { request: current, changed: false, idempotent: true };
    if (current.status === REQUEST_STATUSES.REJECTED && action === 'reject') return { request: current, changed: false, idempotent: true };
    if (current.status !== REQUEST_STATUSES.PENDING_APPROVAL) throw transitionError(`Only pending requests can be ${action}d.`);
    if (action === 'reject' && !text(remarks)) {
      const error = transitionError('A rejection remark is required.');
      error.code = 'REQUEST_VALIDATION_FAILED';
      error.errors = ['A rejection remark is required.'];
      throw error;
    }
    current.status = action === 'approve' ? REQUEST_STATUSES.APPROVED : REQUEST_STATUSES.REJECTED;
    current.decidedAt = now;
    current.timestamps.decidedAt = now;
    current.updatedAt = now;
    current.timestamps.updatedAt = now;
    current.version += 1;
    current.operationKeys = { ...current.operationKeys, [actionKey]: key || `state-${current.status}` };
    current.approvalSteps = current.approvalSteps.map((step, index) => index === 0 ? {
      ...step,
      status: action === 'approve' ? APPROVAL_STEP_STATUSES.APPROVED : APPROVAL_STEP_STATUSES.REJECTED,
      actedAt: now,
      actor: normalizedActor.displayName || normalizedActor.actorId || 'System',
      actorId: normalizedActor.actorId,
      actorRole: normalizedActor.role,
      remarks: text(remarks),
    } : step);
    current.approvalHistory = [...current.approvalHistory, historyEntry(action === 'approve' ? 'Approved' : 'Rejected', current, { actor, remarks, now })];
    if (action === 'reject') current.decisionRemarks = text(remarks);
    return { request: current, changed: true, idempotent: false };
  }

  throw transitionError(`Unsupported request action: ${action}.`);
}

export function scopeRequests(requests = [], companyId = '') {
  const scope = text(companyId);
  return (Array.isArray(requests) ? requests : []).filter(request => !scope || request.companyId === scope);
}

export function findRequestByIdempotency(requests = [], companyId, idempotencyKey) {
  const key = text(idempotencyKey);
  if (!key) return null;
  return scopeRequests(requests, companyId).find(request => request.idempotencyKey === key) || null;
}
