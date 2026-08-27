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

import { departments, employeeGroups, employeeRoster } from './employeeRoster.js';

export { departments, employeeGroups };

export const SCOPE_KINDS = Object.freeze(['All Employees', 'Employee Group', 'Department', 'Specific Employees']);

export const seedScope = () => ({ scope: 'All Employees', group: 'All Employees', department: departments[0], employees: [] });

/** Merges a stored scope with the seed so an older saved record still resolves. */
export function normalizeScope(scope) {
  return { ...seedScope(), ...(scope || {}), employees: [...(scope?.employees || [])] };
}

/** Whether one employee falls inside a configured scope. */
export function coversEmployee(scope, employee) {
  const applied = normalizeScope(scope);
  if (applied.scope === 'Employee Group') return applied.group === 'All Employees' || applied.group === employee?.group;
  if (applied.scope === 'Department') return applied.department === employee?.department;
  if (applied.scope === 'Specific Employees') return applied.employees.includes(employee?.code);
  return true;
}

/** One-line summary for save messages, register rows and drawer headers. */
export function describeScope(scope) {
  const applied = normalizeScope(scope);
  if (applied.scope === 'Employee Group') return applied.group === 'All Employees' ? 'All employees' : `Employee group: ${applied.group}`;
  if (applied.scope === 'Department') return `Department: ${applied.department}`;
  if (applied.scope === 'Specific Employees') return applied.employees.length
    ? `${applied.employees.length} named ${applied.employees.length === 1 ? 'employee' : 'employees'}: ${applied.employees.join(', ')}`
    : 'Specific employees — none selected yet';
  return 'All employees';
}

/**
 * The roster rows a scope covers.
 *
 * Only the three fields every consumer needs are carried, because a scope
 * picker that handed back whole 201 records would invite screens to read salary
 * data they have no business touching.
 */
export const employeeDirectory = employeeRoster.map(employee => ({
  code: employee.code,
  name: employee.name,
  group: employee.group,
  department: employee.department,
}));

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
