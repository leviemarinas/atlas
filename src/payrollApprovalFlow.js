/**
 * Who signs each level of a payroll transaction.
 *
 * The Phase 2 plan (HTP027/028) asks for an approval hierarchy with "up to 6 levels down and 3 across per
 * level", and Annex C says payroll approval is "based on the approval hierarchy". A payout calendar says how
 * many levels a payroll goes through (`payrollRuns.levelsOf`); this module says who may sign each one.
 *
 *   • Level 1 is the preparer: whoever submits the run. Levels 2 to N are signed by the approvers the
 *     company's hierarchy lists for that level, up to three (the three roles that can reach payroll).
 *   • A level with several approvers is signed one of three ways: "Any one of them" (the first signature
 *     completes it), "Parallel" (every approver signs, in any order) or "Sequential" (every approver signs,
 *     in the order listed).
 *   • A P&A SuperAdmin can sign any level, because they sit above a P&A Admin.
 *   • A level the hierarchy does not define is open: anyone with payroll access may sign it.
 *
 * The flow is copied onto the run when it is filed, so editing the hierarchy later never changes a payroll
 * that is already moving. Pure: no React, no storage.
 */

export const ROLE_LABEL = Object.freeze({ client_admin: 'Client Admin', pa_admin: 'P&A Admin', admin: 'P&A Admin', pa_superadmin: 'P&A SuperAdmin' });
export const APPROVER_CHOICES = Object.freeze(['Client Admin', 'P&A Admin', 'P&A SuperAdmin']);
export const FLOW_MODES = Object.freeze(['Sequential', 'Parallel', 'Any one of them']);
export const MAX_ACROSS = 3;
export const MAX_DOWN = 6;
const SUPER = 'P&A SuperAdmin';
const SIGNED = ['Signed', 'Reviewed', 'Approved'];

export const defaultHierarchy = () => [
  { level: 1, mode: 'Sequential', approvers: ['Preparer'] },
  { level: 2, mode: 'Any one of them', approvers: ['Client Admin', 'P&A Admin'] },
  { level: 3, mode: 'Sequential', approvers: ['P&A SuperAdmin'] },
];

/** A stored hierarchy brought to the current shape; free text from the first version keeps what it can. */
export function normalizeHierarchy(rows) {
  const list = Array.isArray(rows) && rows.length ? rows : defaultHierarchy();
  return list.slice(0, MAX_DOWN).map((row, index) => {
    const level = index + 1;
    if (level === 1) return { level, mode: 'Sequential', approvers: ['Preparer'] };
    const raw = Array.isArray(row?.approvers) ? row.approvers : String(row?.approvers || '').split(',');
    const approvers = [...new Set(raw.map(item => String(item).trim()).filter(item => APPROVER_CHOICES.includes(item)))].slice(0, MAX_ACROSS);
    return { level, mode: FLOW_MODES.includes(row?.mode) ? row.mode : 'Any one of them', approvers };
  });
}

/** What stops a hierarchy being saved. */
export function hierarchyProblems(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const problems = [];
  if (list.length < 2) problems.push('An approval hierarchy needs at least two levels: the preparer and a final approver.');
  if (list.length > MAX_DOWN) problems.push(`An approval hierarchy has at most ${MAX_DOWN} levels.`);
  list.slice(1).forEach((row, index) => {
    const count = (row.approvers || []).length;
    if (count < 1) problems.push(`Level ${index + 2} needs at least one approver.`);
    if (count > MAX_ACROSS) problems.push(`Level ${index + 2} can have at most ${MAX_ACROSS} approvers.`);
  });
  return problems;
}

/** The stages a run of `total` levels goes through, taken from the hierarchy. */
export function flowFor(rows, total) {
  const hierarchy = normalizeHierarchy(rows);
  return Array.from({ length: total }, (_, index) => {
    const level = index + 1;
    if (level === 1) return { level, preparer: true, mode: 'Sequential', approvers: [] };
    const row = hierarchy[index];
    return row ? { level, mode: row.mode, approvers: [...row.approvers] } : { level, mode: 'Any one of them', approvers: [], open: true };
  });
}

export const stageOf = (run, level) => (run?.approvalFlow || []).find(stage => stage.level === level) || null;

function roundSignatures(run) {
  const list = run?.approvals || [];
  const decisions = list.map(item => item.decision);
  const start = Math.max(decisions.lastIndexOf('Rejected'), decisions.lastIndexOf('Re-opened'));
  return list.slice(start + 1);
}

/** The sign-offs recorded for one level in the current round. */
export const signaturesAt = (run, level) => roundSignatures(run).filter(item => SIGNED.includes(item.decision) && Number(item.step) === level);

/** The approver slots already filled by these signatures. A SuperAdmin fills whichever slot is still free. */
function filledSlots(stage, signatures) {
  const taken = new Set();
  signatures.forEach(signature => {
    if (stage.approvers.includes(signature.role) && !taken.has(signature.role)) taken.add(signature.role);
    else if (signature.role === SUPER) {
      const free = stage.approvers.find(label => !taken.has(label));
      if (free) taken.add(free);
    }
  });
  return taken;
}

const isOpen = stage => !stage || !stage.approvers.length;

/** How many sign-offs complete a level. */
export function neededSignatures(stage) {
  if (isOpen(stage) || stage.mode === 'Any one of them') return 1;
  return stage.approvers.length;
}

export function levelComplete(stage, signatures) {
  if (isOpen(stage) || stage.mode === 'Any one of them') return signatures.length >= 1;
  return filledSlots(stage, signatures).size >= stage.approvers.length;
}

/** Who a level is still waiting for, as role names. */
export function waitingLabels(stage, signatures) {
  if (isOpen(stage)) return ['anyone with payroll access'];
  if (stage.mode === 'Any one of them') return [...stage.approvers];
  const taken = filledSlots(stage, signatures);
  const left = stage.approvers.filter(label => !taken.has(label));
  return stage.mode === 'Sequential' ? left.slice(0, 1) : left;
}

export const joinLabels = labels => (labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}` : labels[0] || '');

/** Whether this role may sign this level now, and if not, why. */
export function canSignAt(run, level, role) {
  const stage = stageOf(run, level);
  if (!stage) return { ok: true };
  const label = ROLE_LABEL[role];
  if (!label) return { ok: false, reason: 'Only a Client Admin, a P&A Admin or a P&A SuperAdmin can sign a payroll level.' };
  const signatures = signaturesAt(run, level);
  if (levelComplete(stage, signatures)) return { ok: false, reason: `Level ${level} is already signed off.` };
  if (isOpen(stage) || label === SUPER) return { ok: true };
  if (!stage.approvers.includes(label)) return { ok: false, reason: `Level ${level} is signed by ${joinLabels(stage.approvers)}. A ${label} is not one of them.` };
  if (stage.mode === 'Any one of them') return { ok: true };
  const taken = filledSlots(stage, signatures);
  if (taken.has(label)) return { ok: false, reason: `The ${label} has already signed level ${level}. Waiting for ${joinLabels(waitingLabels(stage, signatures))}.` };
  if (stage.mode === 'Sequential') {
    const next = waitingLabels(stage, signatures)[0];
    if (next && label !== next) return { ok: false, reason: `Level ${level} is signed in order. The ${next} signs next.` };
  }
  return { ok: true };
}

/** Whether this role may reject at this level: anyone who could sign it, signed already or not. */
export function canRejectAt(run, level, role) {
  const stage = stageOf(run, level);
  if (!stage || isOpen(stage)) return { ok: true };
  const label = ROLE_LABEL[role];
  if (label === SUPER || stage.approvers.includes(label)) return { ok: true };
  return { ok: false, reason: `Level ${level} is signed by ${joinLabels(stage.approvers)}, so only they can send it back.` };
}
