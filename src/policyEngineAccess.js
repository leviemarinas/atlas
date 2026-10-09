/**
 * Who may change which policy-engine setting — P&A's Controlled Hybrid
 * approach, agreed on 1 September 2026.
 *
 * A client may change only the values an engine exposes as approved
 * parameters: its caps, thresholds, amounts, notifications and who it applies
 * to. The basis, the method, the conditions, statutory treatment, the
 * deduction order and the engine's own on/off switch stay with P&A.
 *
 * The lists are allow-lists on purpose. A setting nobody listed is P&A's, so a
 * field added to an engine later is protected until somebody decides
 * otherwise. The split itself is a proposal to confirm with P&A, which is why
 * it lives in this one module rather than in each engine screen.
 */

export const CLIENT_EDITABLE_ENGINE_PARAMETERS = Object.freeze({
  takeHome: Object.freeze([
    'assignment', 'employeeGroup',
    'threshold', 'deductionCap', 'loanCap', 'attendanceCap',
    'payslipTagging', 'notifyEmployee',
    // Deferred recovery: the amounts and timing, not the method or its controls.
    'staggerThreshold', 'installments', 'fixedAmount', 'frequency', 'notificationChannel',
  ]),
  retirement: Object.freeze([
    'assignment', 'employeeGroup',
    // The company plan's own values. The statutory basis, ages and rounding are the law's.
    'companyDays', 'additionalBenefits', 'earlyRetirementAge', 'minimumGuarantee', 'maximumCap',
  ]),
  finalPay: Object.freeze(['assignment', 'employeeGroup', 'notifyAdmin']),
  grossUp: Object.freeze(['assignment', 'employeeGroup', 'employerSharePercent', 'frequency', 'grossUpFrequency']),
});

export function isClientEditableEngineParameter(section, key) {
  return (CLIENT_EDITABLE_ENGINE_PARAMETERS[section] || []).includes(key);
}

/**
 * What the engine screens read: `null` leaves every field open (the P&A view),
 * otherwise the section's client allow-list.
 */
export function engineAccessFor(section, { isPaAdmin = false } = {}) {
  return isPaAdmin ? null : { section, clientEditable: CLIENT_EDITABLE_ENGINE_PARAMETERS[section] || [] };
}

/**
 * The engine section a policy code's settings belong to, or '' when the code
 * is not on one of the interactive engines.
 */
export function engineSectionForCode(record = {}) {
  const subcategory = record.subcategory || '';
  if (['Take-Home Pay', 'Deferred Deductions', 'Deduction Hierarchy'].includes(subcategory)) return 'takeHome';
  if (subcategory === 'Retirement Pay') return 'retirement';
  if (subcategory === 'Final Pay') return 'finalPay';
  if (subcategory === 'Gross Up') return 'grossUp';
  return '';
}

// Simulator inputs, scenario figures and one-off transaction selections are
// not policy: they never reach payroll as configuration, so they are neither
// governed nor audited.
const NOT_POLICY = new Set(['test', 'scenario', 'transaction']);

function shown(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(shown).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    if ('scope' in value) {
      const detail = value.scope === 'Employee Group' ? value.group
        : value.scope === 'Department' ? value.department
          : value.scope === 'Specific Employees' ? `${(value.employees || []).length} employees` : '';
      return [value.scope, detail].filter(Boolean).join(' · ');
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function flatten(section = {}) {
  return Object.entries(section || {}).reduce((flat, [key, value]) => {
    if (NOT_POLICY.has(key)) return flat;
    // Deferred recovery is a block of settings, each governed on its own.
    if (key === 'recovery' && value && typeof value === 'object') return { ...flat, ...value };
    return { ...flat, [key]: value };
  }, {});
}

const labelFor = key => {
  const words = String(key).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The policy settings a save changed, as before-and-after rows for the audit trail. */
export function diffPolicySection(before = {}, after = {}) {
  const left = flatten(before);
  const right = flatten(after);
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .map(key => ({ key, field: labelFor(key), from: shown(left[key]), to: shown(right[key]) }))
    .filter(change => change.from !== change.to);
}

/**
 * Settings a client changed that only P&A may change. Refused at save whatever
 * the screen allowed — the screen hides them, this is what enforces it.
 */
export function clientEditViolations(section, before = {}, after = {}) {
  return diffPolicySection(before, after).filter(change => !isClientEditableEngineParameter(section, change.key));
}
