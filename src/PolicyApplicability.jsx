import { useState } from 'react';
import { MagnifyingGlass, Users, X } from '@phosphor-icons/react';
import { useFieldScope } from './PolicyFields';
import { plural } from './textFormat';
import { departments, employeeGroups, employeeRoster } from './employeeRoster';

/**
 * Applicability is shared by every policy engine: a rule is not necessarily
 * company-wide, so the engine must be able to say whether it covers all
 * employees, one employee group, a department, or named individuals before the
 * payroll transaction resolves which configuration an employee falls under.
 */
export const assignmentScopes = ['All Employees', 'Employee Group', 'Department', 'Specific Employees'];

/**
 * The roster, the employee groups and the departments come from
 * `employeeRoster.js` — the one place Core, HRM, Timekeeping and Payroll all
 * read. They are re-exported here because the policy engines have always
 * imported them from this module, and `employeeDirectory` stays the name the
 * engines use for the roster.
 */
export { employeeGroups, departments };
export const employeeDirectory = employeeRoster;

export const separationReasons = [
  'Retirement',
  'Redundancy',
  'Retrenchment',
  'Installation of labor-saving devices',
  'Closure not due to serious losses',
  'Disease or health grounds',
  'Resignation',
  'Termination for just cause',
  'End of project or contract',
];

export const seedAssignment = () => ({ scope: 'All Employees', group: 'All Employees', department: departments[0], employees: [] });

/** Merges a stored assignment with the seed so an older saved policy still resolves. */
export function normalizeAssignment(assignment) {
  return { ...seedAssignment(), ...(assignment || {}), employees: [...(assignment?.employees || [])] };
}

/** Decides whether one directory row falls inside a configured assignment. */
export function coversEmployee(assignment, employee) {
  const scope = normalizeAssignment(assignment);
  if (scope.scope === 'Employee Group') return scope.group === 'All Employees' || scope.group === employee.group;
  if (scope.scope === 'Department') return scope.department === employee.department;
  if (scope.scope === 'Specific Employees') return scope.employees.includes(employee.code);
  return true;
}

export function coveredEmployees(assignment) {
  return employeeDirectory.filter(employee => coversEmployee(assignment, employee));
}

/** One-line summary used in save messages, Company Rules rows, and headers. */
export function describeAssignment(assignment) {
  const scope = normalizeAssignment(assignment);
  if (scope.scope === 'Employee Group') return `Employee group: ${scope.group}`;
  if (scope.scope === 'Department') return `Department: ${scope.department}`;
  if (scope.scope === 'Specific Employees') return scope.employees.length
    ? `${scope.employees.length} named ${plural(scope.employees.length, 'employee')}: ${scope.employees.join(', ')}`
    : 'Specific employees — none selected yet';
  return 'All employees';
}

/**
 * Applicability control shared by the engines. The employee picker carries the
 * employee code, name and group because those are the three fields payroll uses
 * to confirm an individual assignment.
 */
export function ApplicabilityPanel({ assignment, onChange, engineLabel, scopeKey = 'employeeGroup' }) {
  const scopeClass = useFieldScope(scopeKey);
  const scope = normalizeAssignment(assignment);
  const [query, setQuery] = useState('');
  const update = (key, value) => onChange({ ...scope, [key]: value });
  const toggleEmployee = code => update('employees', scope.employees.includes(code)
    ? scope.employees.filter(item => item !== code)
    : [...scope.employees, code]);
  const covered = coveredEmployees(scope);
  const matches = employeeDirectory.filter(employee =>
    `${employee.code} ${employee.name} ${employee.group} ${employee.department}`.toLowerCase().includes(query.toLowerCase()));

  return <div className={`applicability-panel ${scopeClass}`}>
    <div className="applicability-heading">
      <div><h3><Users weight="duotone" /> Applicability</h3><p>Who this {engineLabel} configuration covers. The payroll transaction resolves each employee against this before it computes.</p></div>
      <span className="applicability-count">{covered.length} {plural(covered.length, 'employee')} covered</span>
    </div>
    <div className="policy-form-grid">
      <label className="policy-field"><span className="policy-field-label">Assignment scope</span><select value={scope.scope} onChange={event => update('scope', event.target.value)}>{assignmentScopes.map(option => <option key={option}>{option}</option>)}</select></label>
      {scope.scope === 'Employee Group' && <label className="policy-field"><span className="policy-field-label">Employee group</span><select value={scope.group} onChange={event => update('group', event.target.value)}>{employeeGroups.map(option => <option key={option}>{option}</option>)}</select></label>}
      {scope.scope === 'Department' && <label className="policy-field"><span className="policy-field-label">Department</span><select value={scope.department} onChange={event => update('department', event.target.value)}>{departments.map(option => <option key={option}>{option}</option>)}</select></label>}
    </div>
    {scope.scope === 'Specific Employees' && <div className="assignment-picker">
      <div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search employee code, name, group or department..." /><MagnifyingGlass /></div>
      {scope.employees.length > 0 && <div className="employee-chips">{scope.employees.map(code => {
        const employee = employeeDirectory.find(item => item.code === code);
        return <span key={code} className="employee-chip"><strong>{code}</strong> {employee?.name || 'Unknown employee'}<button type="button" onClick={() => toggleEmployee(code)} aria-label={`Remove ${code}`}><X /></button></span>;
      })}</div>}
      <table className="assignment-picker-table">
        <thead><tr><th /><th>Employee code</th><th>Employee name</th><th>Employee group</th><th>Department</th></tr></thead>
        <tbody>{matches.map(employee => <tr key={employee.code} className={scope.employees.includes(employee.code) ? 'selected' : ''}>
          <td><input type="checkbox" checked={scope.employees.includes(employee.code)} onChange={() => toggleEmployee(employee.code)} aria-label={`Assign ${employee.name}`} /></td>
          <td><code>{employee.code}</code></td>
          <td>{employee.name}</td>
          <td>{employee.group}</td>
          <td>{employee.department}</td>
        </tr>)}</tbody>
      </table>
      {!matches.length && <p className="applicability-empty">No employee matches that search.</p>}
    </div>}
    <p className="applicability-summary">{describeAssignment(scope)}</p>
  </div>;
}
