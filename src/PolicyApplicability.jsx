import { useState } from 'react';
import { MagnifyingGlass, Users, X } from '@phosphor-icons/react';
import { useFieldScope } from './PolicyFields';
import { plural } from './textFormat';

/**
 * Applicability is shared by every policy engine: a rule is not necessarily
 * company-wide, so the engine must be able to say whether it covers all
 * employees, one employee group, a department, or named individuals before the
 * payroll transaction resolves which configuration an employee falls under.
 */
export const assignmentScopes = ['All Employees', 'Employee Group', 'Department', 'Specific Employees'];

export const employeeGroups = ['All Employees', 'Rank and File', 'Managers', 'Project-based Employees', 'Retirement Eligible'];

export const departments = ['Corporate Services', 'Operations', 'Finance', 'Sales and Marketing', 'Information Technology'];

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

/**
 * One directory serves every engine — the retirement roster, the final-pay
 * roster, and the specific-employee picker all read these rows so an employee
 * cannot exist in one engine and be missing from another.
 */
export const employeeDirectory = [
  {
    code: 'E-1042', name: 'Ana Reyes', group: 'Managers', department: 'Corporate Services',
    dateOfBirth: '1964-01-15', dateHired: '2014-02-01', rehired: false, priorServiceYears: 0, breakMonths: 0,
    retirementDate: '2026-08-31', separationDate: '2026-08-31',
    reason: 'Retirement', reasonForLeaving: 'Retirement', memberPlan: 'Company plan member',
    monthlyBasic: 60000, average36Months: 55000,
    earningAmounts: { 47218663: 3000, 47218664: 1500, 47218656: 2000 },
    finalPay: { unpaidSalary: 18000, thirteenthMonth: 24500, silConversion: 6800, convertibleLeave: 4200, offsetAmounts: { 'GL-001': 12000, 'CL-001': 21000, 'DED-001': 500 } },
  },
  {
    code: 'E-2288', name: 'Ben Cruz', group: 'Rank and File', department: 'Operations',
    dateOfBirth: '1961-05-02', dateHired: '2019-06-15', rehired: true, priorServiceYears: 6, breakMonths: 14,
    retirementDate: '2026-08-31', separationDate: '2026-08-31',
    reason: 'Retirement', reasonForLeaving: 'Retirement', memberPlan: 'Statutory plan member',
    monthlyBasic: 42000, average36Months: 40000,
    earningAmounts: { 47218663: 2000, 47218664: 1000, 47218656: 1500 },
    finalPay: { unpaidSalary: 12000, thirteenthMonth: 17800, silConversion: 3900, convertibleLeave: 2400, offsetAmounts: { 'GL-001': 8000, 'CL-001': 6500, 'DED-001': 500 } },
  },
  {
    code: 'E-3391', name: 'Carla Lim', group: 'Managers', department: 'Finance',
    dateOfBirth: '1972-09-20', dateHired: '2016-03-01', rehired: false, priorServiceYears: 0, breakMonths: 0,
    retirementDate: '2026-08-31', separationDate: '2026-07-31',
    reason: 'Retirement', reasonForLeaving: 'Redundancy', memberPlan: 'Company plan member',
    monthlyBasic: 78000, average36Months: 74000,
    earningAmounts: { 47218663: 3500, 47218664: 2000, 47218656: 2500 },
    finalPay: { unpaidSalary: 26000, thirteenthMonth: 32000, silConversion: 9100, convertibleLeave: 7300, offsetAmounts: { 'GL-001': 0, 'CL-001': 14000, 'DED-001': 500 } },
  },
  {
    code: 'E-4417', name: 'Diego Santos', group: 'Project-based Employees', department: 'Information Technology',
    dateOfBirth: '1958-11-08', dateHired: '2023-01-09', rehired: false, priorServiceYears: 0, breakMonths: 0,
    retirementDate: '2026-08-31', separationDate: '2026-08-15',
    reason: 'Retirement', reasonForLeaving: 'End of project or contract', memberPlan: 'Statutory plan member',
    monthlyBasic: 51000, average36Months: 51000,
    earningAmounts: { 47218663: 1800, 47218664: 900, 47218656: 1000 },
    finalPay: { unpaidSalary: 9500, thirteenthMonth: 11200, silConversion: 2100, convertibleLeave: 0, offsetAmounts: { 'GL-001': 3200, 'CL-001': 0, 'DED-001': 0 } },
  },
  {
    code: 'E-5502', name: 'Elena Uy', group: 'Rank and File', department: 'Sales and Marketing',
    dateOfBirth: '1965-07-30', dateHired: '2010-08-16', rehired: false, priorServiceYears: 0, breakMonths: 0,
    retirementDate: '2026-08-31', separationDate: '2026-08-31',
    reason: 'Resignation', reasonForLeaving: 'Resignation', memberPlan: 'Company plan member',
    monthlyBasic: 66000, average36Months: 63000,
    earningAmounts: { 47218663: 2800, 47218664: 1500, 47218656: 2000 },
    finalPay: { unpaidSalary: 15400, thirteenthMonth: 21000, silConversion: 5200, convertibleLeave: 3100, offsetAmounts: { 'GL-001': 5400, 'CL-001': 18000, 'DED-001': 750 } },
  },
  {
    code: 'E-6613', name: 'Fely Navarro', group: 'Rank and File', department: 'Operations',
    dateOfBirth: '1979-04-12', dateHired: '2016-11-02', rehired: false, priorServiceYears: 0, breakMonths: 0,
    retirementDate: '2026-08-31', separationDate: '2026-08-20',
    reason: 'Termination', reasonForLeaving: 'Retrenchment', memberPlan: 'Statutory plan member',
    monthlyBasic: 38000, average36Months: 36500,
    earningAmounts: { 47218663: 1600, 47218664: 800, 47218656: 1200 },
    finalPay: { unpaidSalary: 11000, thirteenthMonth: 14600, silConversion: 3400, convertibleLeave: 1900, offsetAmounts: { 'GL-001': 2800, 'CL-001': 9200, 'DED-001': 500 } },
  },
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
