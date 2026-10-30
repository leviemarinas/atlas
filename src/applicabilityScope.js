/**
 * Who a rule covers — the one applicability model Atlas has.
 *
 * Three different answers to "which employees does this apply to?" had grown up
 * side by side: the policy engines carried `{ scope, group, department,
 * employees }` and enforced it; Services Information carried an
 * `employeeGroup` / `subEmployeeGroup` / `employeeNames` triple that nothing
 * read; and Computational Basis assignments carried a third vocabulary that
 * mixed pay frequencies in with employee groups and was also never read. Only
 * the first was load-bearing, so it is the one that survives, and this module is
 * where it lives.
 *
 * It is deliberately pure and free of React so that `payrollEngine.js` can
 * enforce the same scope the configuration screens display. `PolicyApplicability.jsx`
 * re-exports it, which is what keeps the policy engines and the payroll
 * configurations answering the question the same way rather than two ways that
 * happen to agree today.
 *
 * The shape:
 *
 *   { scope: 'All Employees' | 'Employee Group' | 'Department' | 'Specific Employees',
 *     group, department, employees: [employeeCode] }
 */

import { MASTERFILE_STORAGE_KEY, currentRoster, departments, employeeGroups, readMasterfileList } from './employeeRoster.js';

export { departments, employeeGroups };

export const SCOPE_KINDS = Object.freeze(['All Employees', 'Employee Group', 'Department', 'Specific Employees']);

export const seedScope = () => ({ scope: 'All Employees', group: 'All Employees', department: departments[0], employees: [] });

/** Merges a stored scope with the seed so an older saved record still resolves. */
export function normalizeScope(scope) {
  return { ...seedScope(), ...(scope || {}), employees: [...(scope?.employees || [])] };
}

/**
 * Earning Configuration can also scope by hire date, and can narrow any scope to
 * named employees (`names`). Neither is a policy-engine scope kind, so SCOPE_KINDS
 * above is left as it was; a record without them resolves exactly as before.
 * Keys are the labels on the screen, values the rule they apply.
 */
export const DATE_HIRED_RULES = Object.freeze({
  'Date Hired': 'On', 'Date Hired After': 'After', 'Date Hired On and After': 'On and After', 'Date Hired Prior': 'Prior', 'Date Hired Upto': 'Upto',
});

function hiredMatches(rule, hired, on) {
  if (!hired || !on) return false;
  if (rule === 'After') return hired > on;
  if (rule === 'On and After') return hired >= on;
  if (rule === 'Prior') return hired < on;
  if (rule === 'Upto') return hired <= on;
  return hired === on;
}

/** Reference Table job levels, in the names the employee roster uses for the same group. */
const GROUP_ALIASES = Object.freeze({ Manager: 'Managers', Supervisor: 'Supervisors', 'Rank & File': 'Rank and File' });

/** Whether one employee falls inside a configured scope. */
export function coversEmployee(scope, employee) {
  const applied = normalizeScope(scope);
  let inScope = true;
  if (applied.scope === 'Employee Group') inScope = applied.group === 'All Employees' || applied.group === employee?.group;
  else if (applied.scope === 'Department') inScope = applied.department === employee?.department;
  else if (applied.scope === 'Specific Employees') inScope = applied.employees.includes(employee?.code);
  else if (applied.scope === 'Date Hired') inScope = hiredMatches(applied.hiredRule, employee?.dateHired, applied.dateHired);
  // Earning Configuration lets several groups and hire-date rules be ticked together: an employee is covered by any of them.
  else if (applied.scope === 'Criteria') {
    const groups = applied.groups || [];
    inScope = groups.includes('All Employees') || groups.some(group => group === employee?.group || GROUP_ALIASES[group] === employee?.group)
      || (applied.hired || []).some(item => hiredMatches(item.rule, employee?.dateHired, item.date));
  }
  return inScope && (!applied.names?.length || applied.names.includes(employee?.code));
}

/** One-line summary for save messages, register rows and drawer headers. */
export function describeScope(scope) {
  const applied = normalizeScope(scope);
  let text = 'All employees';
  if (applied.scope === 'Employee Group') text = applied.group === 'All Employees' ? 'All employees' : `Employee group: ${applied.group}`;
  else if (applied.scope === 'Department') text = `Department: ${applied.department}`;
  else if (applied.scope === 'Date Hired') {
    const label = Object.keys(DATE_HIRED_RULES).find(key => DATE_HIRED_RULES[key] === applied.hiredRule) || 'Date Hired';
    text = applied.dateHired ? `${label}: ${applied.dateHired}` : `${label} — no date yet`;
  } else if (applied.scope === 'Criteria') {
    const groups = applied.groups || [];
    const extraParts = Object.entries(applied.extra || {}).map(([key, entry]) => `${key} ${typeof entry === 'object' ? [entry.from && `from ${entry.from}`, entry.to && `to ${entry.to}`].filter(Boolean).join(' ') : entry}`);
    const parts = [
      ...extraParts,
      ...(groups.includes('All Employees') ? ['All employees'] : groups.length ? [`Employee group: ${groups.join(', ')}`] : []),
      ...(applied.hired || []).map(item => {
        const label = Object.keys(DATE_HIRED_RULES).find(key => DATE_HIRED_RULES[key] === item.rule) || 'Date Hired';
        return item.date ? `${label} ${item.date}` : `${label} (no date yet)`;
      }),
    ];
    text = parts.length ? parts.join('; ') : 'No employee group selected yet';
  } else if (applied.scope === 'Specific Employees') return applied.employees.length
    ? `${applied.employees.length} named ${applied.employees.length === 1 ? 'employee' : 'employees'}: ${applied.employees.join(', ')}`
    : 'Specific employees — none selected yet';
  return applied.names?.length ? `${text}, limited to ${applied.names.length} named ${applied.names.length === 1 ? 'employee' : 'employees'}` : text;
}

/**
 * The roster rows a scope covers.
 *
 * Only the three fields every consumer needs are carried, because a scope
 * picker that handed back whole 201 records would invite screens to read salary
 * data they have no business touching.
 */
export const employeeDirectory = [];

export { MASTERFILE_STORAGE_KEY };

/**
 * Rebuilds the directory from the Masterfile list (the seeded roster until the
 * Masterfile has saved one). Rebuilt in place so every screen holding the
 * array sees the change on its next render.
 */
export function refreshEmployeeDirectory(masterfile = readMasterfileList()) {
  const rows = currentRoster(masterfile).map(employee => ({ code: employee.code, name: employee.name, group: employee.group, department: employee.department, dateHired: employee.dateHired || '' }));
  employeeDirectory.splice(0, employeeDirectory.length, ...rows);
  return employeeDirectory;
}

refreshEmployeeDirectory();

export function coveredEmployees(scope) {
  return employeeDirectory.filter(employee => coversEmployee(scope, employee));
}

/* --------------------------------------------------------------- migration */

/**
 * The Services Information triple, translated into the one model.
 *
 * The old fields were never enforced, so *any* enforcement is a behaviour
 * change. Migration is therefore deliberately permissive: everything lands on
 * "All Employees" and an admin narrows it on purpose. Inferring a restriction
 * from a field that never restricted anything would stop paying people who are
 * being paid today, which is not a migration anybody asked for.
 *
 * `employeeGroup` in the old model held a *dimension* ("Job Level", "Location")
 * while `subEmployeeGroup` held the value ("Rank and File", "Makati Office") —
 * so there is no reliable reading of it as a group in the first place. The
 * original text is kept in `migratedFrom` so nothing is silently lost.
 */
export function scopeFromLegacyFields(record = {}) {
  if (record.applicability) return normalizeScope(record.applicability);
  const legacy = [record.employeeGroup, record.subEmployeeGroup, record.employeeNames]
    .map(value => String(value || '').trim())
    .filter(value => value && value !== 'All matching employees');
  return {
    ...seedScope(),
    ...(legacy.length ? { migratedFrom: legacy.join(' · ') } : {}),
  };
}
