import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accessFor,
  defaultHrmData,
  hrmActor,
  scopeReportRows,
  visibleEmployeeIds,
} from '../src/hrmData.js';

const data = defaultHrmData('cmp-test');

test('BRD 4-Actor Access Scoping (HT001-HT210)', () => {
  // 1. Client Employee
  const empAccess = accessFor('employee', data, 'EMP-1002');
  assert.equal(empAccess.isApprover, false);
  assert.equal(empAccess.isClientAdmin, false);
  assert.equal(empAccess.isPaAdmin, false);
  assert.equal(empAccess.canApproveTeamRequests, false);
  assert.equal(empAccess.canViewCompanyData, false);
  assert.equal(empAccess.reportScope, 'own');
  assert.deepEqual(visibleEmployeeIds(data, 'employee', 'EMP-1002'), ['EMP-1002']);

  // 2. Client Approver (Line Manager)
  const appAccess = accessFor('approver', data, 'EMP-1001');
  assert.equal(appAccess.isApprover, true);
  assert.equal(appAccess.isClientAdmin, false);
  assert.equal(appAccess.canApproveTeamRequests, true);
  assert.equal(appAccess.canViewTeamData, true);
  assert.equal(appAccess.canViewCompanyData, false);
  assert.equal(appAccess.reportScope, 'team');
  const appVisible = visibleEmployeeIds(data, 'approver', 'EMP-1001');
  assert.ok(appVisible.includes('EMP-1001'));
  assert.ok(appVisible.includes('EMP-1002'));

  // 3. Client Admin (Company HR & Admin)
  const clientAdminAccess = accessFor('client_admin', data, 'EMP-1001');
  assert.equal(clientAdminAccess.isClientAdmin, true);
  assert.equal(clientAdminAccess.canViewCompanyData, true);
  assert.equal(clientAdminAccess.canManageSystemConfig, false);
  assert.equal(clientAdminAccess.reportScope, 'company');
  assert.equal(visibleEmployeeIds(data, 'client_admin').length, data.employees.length);

  // 4. P&A Admin (Outsourced Service Admin)
  const paAdminAccess = accessFor('pa_admin', data, 'EMP-1001');
  assert.equal(paAdminAccess.isPaAdmin, true);
  assert.equal(paAdminAccess.canViewCompanyData, true);
  assert.equal(paAdminAccess.canManageSystemConfig, true);
  assert.equal(paAdminAccess.canOverrideApproval, true);
  assert.equal(paAdminAccess.reportScope, 'company');
});

test('BRD Actor Roles and Permission Tagging', () => {
  const emp = hrmActor('employee', data, 'EMP-1002');
  assert.equal(emp.role, 'Client Employee');
  assert.ok(emp.permissions.includes('hrm.request.submit'));
  assert.ok(!emp.permissions.includes('hrm.request.approve'));

  const app = hrmActor('approver', data, 'EMP-1001');
  assert.equal(app.role, 'Client Approver');
  assert.ok(app.permissions.includes('hrm.request.approve'));
  assert.ok(!app.permissions.includes('hrm.request.override'));

  const ca = hrmActor('client_admin', data, 'EMP-1001');
  assert.equal(ca.role, 'Client Admin');
  assert.ok(ca.permissions.includes('hrm.request.approve'));
  assert.ok(!ca.permissions.includes('hrm.request.override'));

  const pa = hrmActor('pa_admin', data, 'EMP-1001');
  assert.equal(pa.role, 'P&A Admin');
  assert.ok(pa.permissions.includes('hrm.request.override'));
});

test('Report row scoping per BRD actor', () => {
  const rows = data.employees.map(e => ({ employeeId: e.employeeId, name: e.name }));

  const empRows = scopeReportRows(rows, data, 'employee', 'EMP-1002');
  assert.equal(empRows.length, 1);
  assert.equal(empRows[0].employeeId, 'EMP-1002');

  const appRows = scopeReportRows(rows, data, 'approver', 'EMP-1001');
  assert.ok(appRows.length >= 5);

  const adminRows = scopeReportRows(rows, data, 'client_admin', 'EMP-1001');
  assert.equal(adminRows.length, data.employees.length);

  const paRows = scopeReportRows(rows, data, 'pa_admin', 'EMP-1001');
  assert.equal(paRows.length, data.employees.length);
});
