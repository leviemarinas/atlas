import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIGNED_IN_EMPLOYEE_ID,
  accessFor,
  createMemoryStorage,
  defaultHrmData,
  hrmActor,
  leaveBalancesFor,
  mdoBalanceFor,
  onboardingProgress,
  readHrmData,
  scopeMdoEnrollments,
  scopeNotificationEvents,
  scopeReportRows,
  signedInUser,
  updateHrmData,
  visibleEmployeeIds,
} from '../src/hrmData.js';
import { REQUEST_PERMISSIONS, REQUEST_TYPES, REQUEST_STATUSES } from '../src/requestWorkflow.js';
import { createMemoryRequestStorage, readRequests, submitRequest } from '../src/requestService.js';

const data = defaultHrmData('cmp-a');

const employeeActor = {
  actorId: 'user-EMP-1002', displayName: 'Ethan Collins', role: 'Employee', employeeId: 'EMP-1002', employeeCode: '0000112345', permissions: [REQUEST_PERMISSIONS.SUBMIT],
};
const adminActor = {
  actorId: 'user-EMP-1001', displayName: 'John Collins Doe', role: 'P&A Admin', permissions: [REQUEST_PERMISSIONS.SUBMIT, REQUEST_PERMISSIONS.SUBMIT_ON_BEHALF],
};

test('the signed-in user resolves to a real employee record', () => {
  const user = signedInUser(data);
  assert.equal(user.employeeId, SIGNED_IN_EMPLOYEE_ID);
  assert.equal(user.displayName, 'John Collins Doe');
  assert.equal(user.department, 'IT Department');
  assert.ok(user.employeeCode);
});

test('HRM data is isolated by company and updates persist through the repository boundary', () => {
  const storage = createMemoryStorage();
  const first = readHrmData('cmp-a', storage);
  const second = readHrmData('cmp-b', storage);
  assert.equal(first.companyId, 'cmp-a');
  assert.equal(second.companyId, 'cmp-b');
  assert.notEqual(first.punches[0].punchId, second.punches[0].punchId);
  updateHrmData('cmp-a', current => ({ ...current, calendarEvents: [...current.calendarEvents, { id: 'event-a', title: 'A', date: '2026-09-01' }] }), storage);
  assert.equal(readHrmData('cmp-a', storage).calendarEvents.some(event => event.id === 'event-a'), true);
  assert.equal(readHrmData('cmp-b', storage).calendarEvents.some(event => event.id === 'event-a'), false);
});

test('default HRM data backs every masterfile screen', () => {
  const scoped = defaultHrmData('cmp-slice');
  assert.equal(scoped.companyId, 'cmp-slice');
  assert.ok(scoped.employees.length >= 5);
  assert.ok(scoped.punches.every(punch => punch.companyId === 'cmp-slice'));
  assert.ok(scoped.leaveBalances.length > 0);
  assert.ok(scoped.leaveHistory.length > 0);
  assert.ok(scoped.mdoBalances.length > 0);
  assert.ok(scoped.mdoHistory.some(row => row.status === 'Forfeited'));
  assert.ok(scoped.shifts.length > 0);
  assert.ok(scoped.wellness.events.some(event => event.kind === 'Event'));
  assert.ok(scoped.wellness.events.some(event => event.kind === 'Article'));
  assert.ok(scoped.mdo.plans.some(plan => plan.type === 'Medical'));
  assert.ok(scoped.mdo.plans.some(plan => plan.type === 'Dental'));
  assert.ok(scoped.mdo.plans.some(plan => plan.type === 'Optical'));
  assert.ok(scoped.calendarEvents.some(event => event.category === 'statutory'));
  assert.ok(scoped.onboarding.records[0].tasks.length > 0);
});

test('leave and MDO balances derive their remaining days instead of storing them', () => {
  const balances = leaveBalancesFor(data, SIGNED_IN_EMPLOYEE_ID);
  assert.ok(balances.length > 0);
  balances.forEach(balance => {
    // Converted credits are cashed out, so they leave the balance exactly as
    // used and forfeited days do (HT192 reports on them).
    assert.equal(balance.remaining, balance.accrued - balance.used - balance.forfeited - balance.converted);
  });
  assert.ok(balances.some(balance => balance.converted > 0), 'seed carries converted leave for the conversion report');
  const mdo = mdoBalanceFor(data, SIGNED_IN_EMPLOYEE_ID);
  assert.equal(mdo.remaining, mdo.earned - mdo.used - mdo.forfeited);
});

test('onboarding progress is counted from the task list', () => {
  const record = data.onboarding.records.find(row => row.employeeId === SIGNED_IN_EMPLOYEE_ID);
  const progress = onboardingProgress(record);
  assert.equal(progress.total, record.tasks.length);
  assert.equal(progress.completed, record.tasks.filter(task => ['Completed', 'Attended'].includes(task.status)).length);
  assert.equal(progress.percent, Math.round((progress.completed / progress.total) * 100));
});

test('access follows the 4 BRD actor roles and the reporting line', () => {
  const asEmployee = accessFor('employee', data);
  const asApprover = accessFor('approver', data);
  const asClientAdmin = accessFor('client_admin', data);
  const asPaAdmin = accessFor('pa_admin', data);

  // 1. Client Employee: Own applications and records only
  assert.equal(asEmployee.isApprover, false);
  assert.equal(asEmployee.canApproveTeamRequests, false);
  assert.equal(asEmployee.canViewCompanyData, false);
  assert.equal(asEmployee.reportScope, 'own');
  assert.equal(asEmployee.canSubmitOwnRequests, true);
  assert.equal(asEmployee.canSubmitOnBehalf, false);

  // 2. Client Approver: Approves team requests and views subordinate records
  assert.equal(asApprover.isApprover, true);
  assert.equal(asApprover.canApproveTeamRequests, true);
  assert.equal(asApprover.canViewTeamData, true);
  assert.equal(asApprover.canViewCompanyData, false);
  assert.equal(asApprover.reportScope, 'team');

  // 3. Client Admin: Full company masterfile and reports
  assert.equal(asClientAdmin.isClientAdmin, true);
  assert.equal(asClientAdmin.canViewCompanyData, true);
  assert.equal(asClientAdmin.canApproveTeamRequests, true);
  assert.equal(asClientAdmin.canManageSystemConfig, false);
  assert.equal(asClientAdmin.reportScope, 'company');

  // 4. P&A Admin: Full authority, statutory tables, overrides, and multi-client configuration
  assert.equal(asPaAdmin.isPaAdmin, true);
  assert.equal(asPaAdmin.canViewCompanyData, true);
  assert.equal(asPaAdmin.canManageSystemConfig, true);
  assert.equal(asPaAdmin.canOverrideApproval, true);
  assert.equal(asPaAdmin.reportScope, 'company');
});

test('the recorded actor carries only the permissions the role grants', () => {
  const employeeActor = hrmActor('employee', data);
  const approverActor = hrmActor('approver', data);
  const clientActor = hrmActor('client_admin', data);
  const paActor = hrmActor('pa_admin', data);

  assert.deepEqual(employeeActor.permissions, [REQUEST_PERMISSIONS.SUBMIT]);
  assert.ok(approverActor.permissions.includes(REQUEST_PERMISSIONS.APPROVE));
  assert.ok(clientActor.permissions.includes(REQUEST_PERMISSIONS.APPROVE));
  assert.equal(clientActor.permissions.includes(REQUEST_PERMISSIONS.OVERRIDE), false);
  assert.ok(paActor.permissions.includes(REQUEST_PERMISSIONS.OVERRIDE));
});

test('visible employees widen from own record to team to company', () => {
  assert.deepEqual(visibleEmployeeIds(data, 'client', 'EMP-1002'), ['EMP-1002']);
  const team = visibleEmployeeIds(data, 'client');
  assert.ok(team.includes(SIGNED_IN_EMPLOYEE_ID));
  assert.ok(team.includes('EMP-1002'));
  assert.equal(visibleEmployeeIds(data, 'admin').length, data.employees.length);
});

test('report rows are scoped to company, team, or own records', () => {
  const rows = data.employees.map(employee => ({ employeeId: employee.employeeId }));
  assert.equal(scopeReportRows(rows, data, 'admin').length, data.employees.length);
  assert.deepEqual(scopeReportRows(rows, data, 'client', 'EMP-1003').map(row => row.employeeId), ['EMP-1003']);
  assert.ok(scopeReportRows(rows, data, 'client').length > 1);
});

test('notification scoping keeps one employee from reading another employee activity', () => {
  const events = [
    { eventId: 'a', recipientEmployeeId: 'EMP-1002', title: 'Leave approved' },
    { eventId: 'b', recipientEmployeeId: 'EMP-1003', title: 'Overtime rejected' },
    { eventId: 'c', audience: 'All Employees', title: 'Holiday announcement' },
  ];
  const own = scopeNotificationEvents(events, data, 'client', 'EMP-1002').map(event => event.eventId);
  assert.deepEqual(own, ['a', 'c']);
  assert.equal(scopeNotificationEvents(events, data, 'admin').length, events.length);
});

test('MDO enrollment detail stays private unless the viewer administers it', () => {
  const enrollments = data.mdo.enrollments;
  assert.equal(scopeMdoEnrollments(enrollments, data, 'admin').length, enrollments.length);
  const own = scopeMdoEnrollments(enrollments, data, 'client', 'EMP-1001');
  assert.ok(own.length > 0);
  assert.ok(own.every(row => row.employeeId === 'EMP-1001'));
});

test('shared request types use the same idempotent company-scoped service boundary', () => {
  const storage = createMemoryRequestStorage();
  const input = {
    requestType: REQUEST_TYPES.TIME_OFF,
    companyId: 'cmp-a',
    company: { companyId: 'cmp-a' },
    employeeId: 'EMP-1002',
    employee: { employeeId: 'EMP-1002', employeeCode: '0000112345', name: 'Ethan Collins' },
    workDate: '2026-08-20',
    requestDetails: { summary: 'Family leave', startDate: '2026-08-20', endDate: '2026-08-21' },
    requesterRemarks: 'Family leave',
    idempotencyKey: 'time-off-001',
  };
  const options = { storage, activeCompanyId: 'cmp-a', actor: employeeActor, appendAuditEvent: () => {}, publishNotificationEvent: () => {} };
  const first = submitRequest(input, options);
  const retry = submitRequest(input, options);
  assert.equal(first.request.status, REQUEST_STATUSES.PENDING_APPROVAL);
  assert.equal(first.request.requestDetails.summary, 'Family leave');
  assert.equal(retry.idempotent, true);
  assert.equal(readRequests('cmp-b', { storage, activeCompanyId: 'cmp-a' }).length, 0);
});

test('submitting on behalf requires matching target metadata and a rationale', () => {
  const base = {
    requestType: REQUEST_TYPES.OFFICIAL_BUSINESS,
    companyId: 'cmp-a',
    company: { companyId: 'cmp-a' },
    employeeId: 'EMP-1002',
    employee: { employeeId: 'EMP-1002', employeeCode: '0000112345', name: 'Ethan Collins' },
    workDate: '2026-08-22',
    requestDetails: { summary: 'Client visit', startDate: '2026-08-22' },
    requesterRemarks: 'Client visit',
    onBehalfOf: { employeeId: 'EMP-1002', employeeCode: '0000112345' },
    onBehalfReason: 'HR desk coverage',
    idempotencyKey: 'ob-001',
  };
  const options = { storage: createMemoryRequestStorage(), activeCompanyId: 'cmp-a', actor: adminActor, appendAuditEvent: () => {}, publishNotificationEvent: () => {} };
  const result = submitRequest(base, options);
  assert.equal(result.request.status, REQUEST_STATUSES.PENDING_APPROVAL);
  assert.equal(result.request.onBehalfReason, 'HR desk coverage');
});
