/**
 * Maker-checker for the central formula library.
 *
 * Gen Olan asked (and agreed, in reply to the recommendation of 15 Sep 2026) that a new formula
 * version, or a formula being switched on, must be reviewed and approved inside P&A before it
 * takes effect. Atlas has two P&A roles — "P&A Admin" and "P&A SuperAdmin" — so:
 *
 *   • a P&A Admin MAKES a change: writes it and submits it;
 *   • a P&A SuperAdmin is above a P&A Admin: can do everything an Admin can, and approves or
 *     rejects what an Admin submits;
 *   • a SuperAdmin's own change is published straight away (they are the approver, so it
 *     is recorded as approved by them); nobody else approves a change they made themselves;
 *   • a client takes no part: a client cannot create, review or approve a formula.
 *
 * Until a change is approved the library keeps the version already in force, so payroll never
 * reads an unapproved formula. This module is pure (no React, no audit calls) so it can be tested;
 * the library screen applies an approved change and writes the audit entry.
 *
 * Status shown on a formula: Draft (never approved) · For Approval · Active · Inactive ·
 * Rejected (the latest change was turned down). Older versions are Superseded.
 */

export const APPROVALS_KEY = 'atlas-computation-approvals-v1';

/** A change waits as 'For Approval' and ends as Approved, Rejected or Withdrawn. */
export const REQUEST_STATUSES = Object.freeze(['For Approval', 'Approved', 'Rejected', 'Withdrawn']);
export const REQUEST_KINDS = Object.freeze({ version: 'New version', activate: 'Activation' });

const MAKER_ROLES = ['pa_user', 'pa_admin', 'admin', 'pa_superadmin'];
const APPROVER_ROLES = ['pa_superadmin'];

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/** "Maria Santos (P&A SuperAdmin)" → "Maria Santos". */
export const personOf = actor => String(actor || '').replace(/\s*\(.*\)\s*$/, '').trim();

export const canMake = role => MAKER_ROLES.includes(role);
export const canApprove = role => APPROVER_ROLES.includes(role);
/** A SuperAdmin's own change needs no second person: it is published as soon as it is made. */
export const publishesDirectly = role => APPROVER_ROLES.includes(role);

export function readRequests() {
  try { return JSON.parse(globalThis.localStorage?.getItem(APPROVALS_KEY) || '[]'); } catch { return []; }
}

export function writeRequests(list) {
  try { globalThis.localStorage?.setItem(APPROVALS_KEY, JSON.stringify(list)); } catch { /* the queue is rebuilt from the library if storage is unavailable */ }
}

export const isOpen = request => request?.status === 'For Approval';
export const openRequestFor = (code, list = []) => list.find(request => isOpen(request) && String(request.code).toUpperCase() === String(code).toUpperCase());
export const openRequests = (list = []) => list.filter(isOpen);

/** The most recent decided request for a formula, used to show a Rejected status. */
export const lastDecisionFor = (code, list = []) => list
  .filter(request => !isOpen(request) && String(request.code).toUpperCase() === String(code).toUpperCase())
  .sort((a, b) => String(b.decidedAt || b.madeAt).localeCompare(String(a.decidedAt || a.madeAt)))[0];

/**
 * A change the maker wants made.
 *
 * @param change { kind: 'version' | 'activate', record, previous, changes, note, source, approvalRef }
 *   `record` is the version to publish (for 'version') or the formula to switch on (for 'activate').
 */
export function submitRequest(list, change, { role, actor, now = stamp() } = {}) {
  if (!canMake(role)) return { ok: false, reason: 'Only P&A can change a formula. A P&A Admin submits it and a P&A SuperAdmin approves it.' };
  if (!REQUEST_KINDS[change.kind]) return { ok: false, reason: 'Unknown change type.' };
  if (openRequestFor(change.record?.code, list)) return { ok: false, reason: `${change.record.code} already has a change waiting for approval. Wait for the decision, or withdraw it first.` };
  const request = {
    id: `AP-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 36 ** 2).toString(36).toUpperCase().padStart(2, '0')}`,
    kind: change.kind,
    code: change.record.code,
    name: change.record.name,
    fromVersion: change.previous?.version ?? change.record.version,
    toVersion: change.kind === 'version' ? change.record.version : (change.previous?.version ?? change.record.version),
    payload: change.record,
    changes: change.changes || [],
    note: change.note || '',
    source: change.source || 'Screen',
    approvalRef: change.approvalRef || '',
    status: 'For Approval',
    madeBy: actor,
    madeByRole: role,
    madeAt: now,
  };
  return { ok: true, request, list: [request, ...list] };
}

/** Whether this person, in this role, may decide this request, and if not, why. */
export function checkDecision(request, { role, actor, own = false } = {}) {
  if (!request) return { ok: false, reason: 'That change no longer exists.' };
  if (!isOpen(request)) return { ok: false, reason: `This change was already ${request.status.toLowerCase()}.` };
  if (!canApprove(role)) return { ok: false, reason: 'Only a P&A SuperAdmin can approve or reject a formula change.' };
  const ownSuperAdminChange = own && request.madeByRole === 'pa_superadmin';
  if (!ownSuperAdminChange && personOf(actor) && personOf(actor) === personOf(request.madeBy)) return { ok: false, reason: 'You made this change, so someone else has to approve it.' };
  return { ok: true };
}

/** Approve or reject. A rejection needs a reason. */
export function decideRequest(list, id, decision, { role, actor, reason = '', own = false, now = stamp() } = {}) {
  const request = list.find(item => item.id === id);
  const allowed = checkDecision(request, { role, actor, own });
  if (!allowed.ok) return allowed;
  if (decision === 'reject' && !String(reason).trim()) return { ok: false, reason: 'Say why the change is rejected so the maker can fix it.' };
  const next = { ...request, status: decision === 'approve' ? 'Approved' : 'Rejected', decidedBy: actor, decidedByRole: role, decidedAt: now, decisionReason: String(reason).trim() };
  return { ok: true, request: next, list: list.map(item => (item.id === id ? next : item)) };
}

/** The maker may take their own change back while it is still waiting. */
export function withdrawRequest(list, id, { actor, now = stamp() } = {}) {
  const request = list.find(item => item.id === id);
  if (!isOpen(request)) return { ok: false, reason: 'Only a change that is still waiting can be withdrawn.' };
  if (personOf(actor) !== personOf(request.madeBy)) return { ok: false, reason: 'Only the person who made the change can withdraw it.' };
  const next = { ...request, status: 'Withdrawn', decidedBy: actor, decidedAt: now };
  return { ok: true, request: next, list: list.map(item => (item.id === id ? next : item)) };
}

/**
 * The status to show for a formula. A formula that was never approved is a Draft until its
 * activation is approved; one with a change waiting shows For Approval; a turned-down latest
 * change shows Rejected until something newer is decided.
 */
export function lifecycleStatus(record, list = []) {
  // A formula already in force stays Active while a newer version waits or is turned down;
  // payroll keeps using the version that was approved.
  if (record.status === 'Active') return 'Active';
  if (openRequestFor(record.code, list)) return 'For Approval';
  if (lastDecisionFor(record.code, list)?.status === 'Rejected') return 'Rejected';
  return record.approval?.state === 'Draft' ? 'Draft' : 'Inactive';
}

/** The short note beside the status when a change to an Active formula is waiting or was turned down. */
export function changeNote(record, list = []) {
  const open = openRequestFor(record.code, list);
  if (open?.kind === 'version') return `Version ${open.toVersion} for approval`;
  if (record.status === 'Active' && lastDecisionFor(record.code, list)?.status === 'Rejected') return 'Last change rejected';
  return '';
}
