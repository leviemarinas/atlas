/**
 * Corrections after payroll is posted.
 *
 * A posted or locked transaction is never changed. A correction to it — pay
 * the employee should have received, or an amount to recover — is raised
 * against the original run and waits, Pending, until the next payroll picks it
 * up as an adjustment line that names the original transaction and period.
 * It becomes Applied when that payroll is posted. Company-scoped and pure
 * apart from the storage it is given.
 */

const key = companyId => `atlas-payroll-corrections-v1:${companyId || 'default'}`;
const round2 = value => Math.round((Number(value) || 0) * 100) / 100;
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 16);

export function readCorrections(companyId, storage = globalThis.localStorage) {
  try { const saved = JSON.parse(storage?.getItem(key(companyId)) || '[]'); return Array.isArray(saved) ? saved : []; } catch { return []; }
}

export function writeCorrections(companyId, corrections, storage = globalThis.localStorage) {
  try { storage?.setItem(key(companyId), JSON.stringify(corrections)); } catch { /* quota */ }
  return corrections;
}

/** Why a correction cannot be raised, or ''. */
export function correctionProblem({ run, amount, item, reason }) {
  if (!run || !['Posted', 'Locked'].includes(run.status)) return 'Corrections are raised against a posted or locked payroll. Change an open transaction directly.';
  if (!String(item || '').trim()) return 'Say what is being corrected.';
  if (!(Math.abs(Number(amount)) > 0)) return 'Enter the amount to pay or to recover.';
  if (!String(reason || '').trim()) return 'Give the reason for the correction.';
  return '';
}

/**
 * A correction to one employee's line on a posted run. A positive amount is
 * pay still owed to the employee; a negative amount is recovered from them.
 */
export function raiseCorrection(corrections, { run, line, item, amount, taxable = true, reason, actor }) {
  const problem = correctionProblem({ run, amount, item, reason });
  if (problem) return { corrections, error: problem };
  const correction = {
    id: `COR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    employeeId: line.employeeId,
    employeeName: line.name,
    originRunId: run.id,
    originTransaction: run.transactionNumber,
    originPeriod: `${run.periodStart} to ${run.periodEnd}`,
    item: String(item).trim(),
    amount: round2(amount),
    taxable: Boolean(taxable),
    reason: String(reason).trim(),
    status: 'Pending',
    raisedBy: actor,
    raisedAt: stamp(),
    appliedTo: '',
    appliedAt: '',
  };
  return { corrections: [correction, ...corrections], correction };
}

/** Marks the corrections a posted run carried as Applied to that run. */
export function markCorrectionsApplied(corrections, ids = [], transactionNumber) {
  const wanted = new Set(ids);
  return corrections.map(item => (wanted.has(item.id) && item.status === 'Pending' ? { ...item, status: 'Applied', appliedTo: transactionNumber, appliedAt: stamp() } : item));
}

export function cancelCorrection(corrections, id, actor) {
  return corrections.map(item => (item.id === id && item.status === 'Pending' ? { ...item, status: 'Cancelled', appliedTo: '', cancelledBy: actor, cancelledAt: stamp() } : item));
}

/**
 * The pay items a correction becomes on the next payroll: an earning for pay
 * owed, a deduction for an amount recovered. Their source marks them as typed
 * on the transaction, so run-level pay item rules never drop them.
 */
export function correctionItems(corrections = [], employeeId) {
  const pending = corrections.filter(item => item.employeeId === employeeId && item.status === 'Pending');
  const label = item => `Adjustment for ${item.originTransaction} (${item.originPeriod}): ${item.item}`;
  return {
    earnings: pending.filter(item => item.amount > 0).map(item => ({
      code: `ADJ-${item.id}`, name: label(item), classification: item.taxable ? 'Taxable Allowance' : 'Non-taxable',
      frequency: 'One-time', amount: item.amount, correctionId: item.id, source: 'Encoded on the transaction (correction)',
    })),
    deductions: pending.filter(item => item.amount < 0).map(item => ({
      code: `ADJ-${item.id}`, name: label(item), group: 'Deduction', kind: 'Company', due: Math.abs(item.amount), outstanding: Math.abs(item.amount),
      rank: 45, canAdjust: true, correctionId: item.id, source: 'Encoded on the transaction (correction)',
    })),
    ids: pending.map(item => item.id),
  };
}
