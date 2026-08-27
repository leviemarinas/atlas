import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * One applicability model, enforced.
 *
 * Scope used to be declared in five places and honoured in three: the payroll
 * transaction, the operational registers and the policy engines enforced it,
 * while the Services Information configurations and the Computational Basis
 * assignments only displayed it. These tests hold the line that the
 * configuration's scope now decides who is paid, and that the assignment no
 * longer claims to.
 */

const {
  SCOPE_KINDS,
  coveredEmployees,
  coversEmployee,
  describeScope,
  employeeDirectory,
  normalizeScope,
  scopeFromLegacyFields,
  seedScope,
} = await import('../src/applicabilityScope.js');

const { boundResolverFor, collectionItemsFor, earningItemsFor, scopeResolverFor } = await import('../src/payrollEngine.js');
const { seedComputations } = await import('../src/computationCatalog.js');

const library = seedComputations();
const manager = employeeDirectory.find(employee => employee.group === 'Managers');
const rankAndFile = employeeDirectory.find(employee => employee.group === 'Rank and File');

/* ------------------------------------------------------------- the model */

test('the four scopes resolve against the employee the payroll is computing', () => {
  assert.deepEqual(SCOPE_KINDS, ['All Employees', 'Employee Group', 'Department', 'Specific Employees']);
  assert.equal(coversEmployee(seedScope(), manager), true);
  assert.equal(coversEmployee({ scope: 'Employee Group', group: 'Rank and File' }, rankAndFile), true);
  assert.equal(coversEmployee({ scope: 'Employee Group', group: 'Rank and File' }, manager), false);
  // "All Employees" inside the group scope still means everybody.
  assert.equal(coversEmployee({ scope: 'Employee Group', group: 'All Employees' }, manager), true);
  assert.equal(coversEmployee({ scope: 'Department', department: manager.department }, manager), true);
  assert.equal(coversEmployee({ scope: 'Specific Employees', employees: [manager.code] }, manager), true);
  assert.equal(coversEmployee({ scope: 'Specific Employees', employees: [manager.code] }, rankAndFile), false);
});

test('a scope describes itself in the words a reviewer needs', () => {
  assert.equal(describeScope(seedScope()), 'All employees');
  assert.equal(describeScope({ scope: 'Employee Group', group: 'Managers' }), 'Employee group: Managers');
  assert.equal(describeScope({ scope: 'Specific Employees', employees: [] }), 'Specific employees — none selected yet');
  assert.match(describeScope({ scope: 'Specific Employees', employees: ['A', 'B'] }), /^2 named employees: A, B$/);
});

test('coveredEmployees and coversEmployee never disagree', () => {
  const scope = { scope: 'Employee Group', group: 'Rank and File' };
  const covered = new Set(coveredEmployees(scope).map(employee => employee.code));
  employeeDirectory.forEach(employee => {
    assert.equal(covered.has(employee.code), coversEmployee(scope, employee), `${employee.code} disagreed`);
  });
});

/* ---------------------------------------------------------- the migration */

test('the legacy triple migrates permissively and keeps what it said', () => {
  // The old fields never restricted anything, so inferring a restriction from
  // them would stop paying people who are paid today.
  const migrated = scopeFromLegacyFields({ employeeGroup: 'Employee Type', subEmployeeGroup: 'Rank and File', employeeNames: 'All matching employees' });
  assert.equal(migrated.scope, 'All Employees');
  assert.equal(coversEmployee(migrated, manager), true);
  // Nothing is silently discarded — the original wording survives for the admin.
  assert.equal(migrated.migratedFrom, 'Employee Type · Rank and File');

  // A record already on the new model is left exactly as it is.
  const already = { applicability: { scope: 'Employee Group', group: 'Managers', department: 'IT Department', employees: [] } };
  assert.deepEqual(scopeFromLegacyFields(already), normalizeScope(already.applicability));
});

/* ------------------------------------------------------- the enforcement */

const mealAllowance = scope => ({
  earnings: [{
    code: 'ALL-002', name: 'Meal Allowance', status: 'Active', amount: '150', applicability: scope,
    computationCode: 'ERN-005',
    computationBindings: {
      allowance_units: { kind: 'fixed', value: '20' },
      allowance_unit_rate: { kind: 'config', field: 'amount' },
    },
  }],
});

const salaryWithMeal = { earnings: [{ earningCode: 'ALL-002', earningName: 'Meal Allowance', classification: 'Taxable Allowance', frequency: 'Semi-monthly', earningsAmount: 300 }] };
const transaction = { paymentMode: 'Semi-monthly', frequency: 'First Half', periodEnd: '2026-08-15', payoutDate: '2026-08-31' };

test('a configuration scoped to a group does not compute for someone outside it', () => {
  const context = { computations: library, serviceConfig: mealAllowance({ scope: 'Employee Group', group: 'Rank and File' }) };
  const outside = boundResolverFor(context, {}, manager)('ALL-002');
  assert.equal(outside.resolved, false);
  assert.equal(outside.outOfScope, true);
  assert.match(outside.problem, /employee group: rank and file/i);

  const inside = boundResolverFor(context, {}, rankAndFile)('ALL-002');
  assert.equal(inside.resolved, true);
  assert.equal(inside.amount, 3000);
});

test('an out-of-scope earning is withheld from the line, not paid quietly', () => {
  const context = { computations: library, serviceConfig: mealAllowance({ scope: 'Employee Group', group: 'Rank and File' }) };
  const resolveScope = scopeResolverFor(context);
  const configuration = resolveScope('ALL-002');
  assert.equal(configuration.name, 'Meal Allowance');
  assert.equal(coversEmployee(configuration.applicability, manager), false);
  assert.equal(coversEmployee(configuration.applicability, rankAndFile), true);
});

test('scope is enforced even when the amount comes straight from the register', () => {
  // No computationCode at all, so `boundResolverFor` never sees it. Applicability
  // governs every configuration, not only the ones that bind a formula.
  const context = {
    serviceConfig: { deductions: [{ code: 'DED-900', name: 'Uniform', status: 'Active', applicability: { scope: 'Department', department: manager.department } }] },
  };
  const resolveScope = scopeResolverFor(context);
  assert.equal(coversEmployee(resolveScope('DED-900').applicability, manager), true);
  assert.equal(resolveScope('NOT-A-CODE'), null, 'an item with no configuration answers to nobody');
});

test('an item with no configuration is never withheld', () => {
  const resolveScope = scopeResolverFor({ serviceConfig: {} });
  assert.equal(resolveScope('ANYTHING'), null);
  const items = earningItemsFor({ salary: salaryWithMeal, transaction, employee: { code: rankAndFile.code } });
  assert.equal(items.length, 1, 'a run with no configuration behaves exactly as before');
});

test('a loan schedule answers to no applicability', () => {
  const collections = collectionItemsFor({
    salary: { companyDeductions: [] },
    loanSchedules: [{ transactionNumber: 'CL-2026-001', loanName: 'Salary Loan', status: 'ACTIVE', balance: 5000, deductionAmount: 1000, loanType: 'Company Loan' }],
    transaction, employee: { code: manager.code, employeeId: 'E1' },
  });
  assert.equal(collections.find(item => item.code === 'CL-2026-001').due, 1000);
});

/* ------------------------------------- the redundancy that was removed */

test('the pipeline assignment no longer carries a scope of its own', async () => {
  const source = await import('node:fs').then(fs => fs.promises.readFile(new URL('../src/ComputationalBasis.jsx', import.meta.url), 'utf8'));
  // Employee group and frequency belong to the configuration and the register;
  // an assignment that also declared them was a second answer nothing read.
  assert.equal(/employeeGroup/.test(source), false, 'assignments must not re-declare employee group');
  assert.equal(/item\.frequency/.test(source), false, 'assignments must not re-declare frequency');
  // Only the four computations that own no configuration record remain.
  assert.match(source, /PIPELINE_ASSIGNMENT_TYPES = \['Government deduction', 'Tax computation', 'Take-home protection', 'Retirement benefit'\]/);
});

test('the configuration screens no longer carry the unenforced triple', async () => {
  const source = await import('node:fs').then(fs => fs.promises.readFile(new URL('../src/serviceModules.jsx', import.meta.url), 'utf8'));
  // The legacy keys survive in exactly one place — the migration that strips
  // them off a stored record — and nowhere as an editable field or option list.
  assert.equal(/key: '(?:employeeGroup|subEmployeeGroup|employeeNames)'/.test(source), false, 'no legacy scope field may remain');
  assert.equal(/const (?:groupOptions|subGroupOptions)\s*=/.test(source), false, 'the parallel group vocabularies are gone');
  assert.equal((source.match(/subEmployeeGroup/g) || []).length, 2, 'only the migration may still name the legacy keys');
  assert.match(source, /key: 'applicability', label: 'Applies to', type: 'applicability'/);
});
