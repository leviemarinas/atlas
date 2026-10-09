/**
 * HRM domain data and access rules.
 *
 * The module is company-scoped and reads the signed-in user from the session
 * the application shell already establishes.  What a user may see is decided
 * by their role and their place in the reporting line — an employee sees their
 * own records, an approver additionally sees their direct reports, and the P&A
 * Administrator sees the whole company.
 */

import { REQUEST_STATUSES, REQUEST_TYPES } from './requestWorkflow.js';
import { employeeRoster } from './employeeRoster.js';
import { effectiveVersionIn, rateContribution, seedStatutoryData, sssContribution } from './statutorySchedules.js';
import {
  seedAnnouncements,
  seedLeaveAccruals,
  seedMissingLogs,
  seedTimeLogs,
  seedTimeReports,
  seedTimekeepingSettings,
  seedTkDisputes,
} from './timekeepingData.js';

export const HRM_DATA_KEY_PREFIX = 'atlas-hrm-v1';

const defaultCompanyId = 'cmp-abc-001';

const clone = value => JSON.parse(JSON.stringify(value));
const text = value => String(value ?? '').trim();

function browserStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson(storage, key, fallback) {
  try {
    const raw = (storage || browserStorage())?.getItem(key);
    if (!raw) return clone(fallback);
    const parsed = JSON.parse(raw);
    return parsed ?? clone(fallback);
  } catch {
    return clone(fallback);
  }
}

function writeJson(storage, key, value) {
  try { (storage || browserStorage())?.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
  return value;
}

export function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
}

/**
 * The signed-in user.  The application shell authenticates once and every
 * module reads the same identity; HRM resolves it to the employee record that
 * owns the balances, applications and onboarding shown on screen.
 */
export const SIGNED_IN_EMPLOYEE_ID = 'EMP-1001';

export function signedInUser(data = {}) {
  const employee = findEmployee(data, SIGNED_IN_EMPLOYEE_ID);
  return {
    employeeId: SIGNED_IN_EMPLOYEE_ID,
    displayName: employee?.name || 'John Collins Doe',
    initials: employee?.initials || 'JD',
    position: employee?.position || '',
    department: employee?.department || '',
    employeeCode: employee?.employeeCode || '',
  };
}

/**
 * Access rules. Supports all 4 BRD actors:
 * 1. 'employee' (Client Employee / All users)
 * 2. 'approver' (Client Approver)
 * 3. 'client_admin' (Client Admin)
 * 4. 'pa_admin' / 'admin' (P&A Admin)
 * Legacy 'client' dynamically maps to approver if employee has direct reports, or employee if individual.
 */
export function accessFor(role, data = {}, employeeId = SIGNED_IN_EMPLOYEE_ID) {
  const isPaAdmin = role === 'admin' || role === 'pa_admin';
  const isClientAdmin = role === 'client_admin';
  const directReports = (data.employees || []).filter(employee => text(employee.managerId) === text(employeeId));
  
  let isApprover = false;
  if (role === 'approver') {
    isApprover = true;
  } else if (role === 'employee') {
    isApprover = false;
  } else if (isPaAdmin || isClientAdmin) {
    isApprover = true;
  } else {
    // legacy 'client'
    isApprover = directReports.length > 0;
  }

  const canViewCompany = isPaAdmin || isClientAdmin;
  const canViewTeam = canViewCompany || isApprover;

  // Whose records this actor may read, resolved once here so every screen that
  // scopes a list reads the same answer rather than re-deriving it from a role.
  const everyone = (data.employees || []).map(employee => text(employee.employeeId)).filter(Boolean);
  const own = [text(employeeId)].filter(Boolean);
  const visible = canViewCompany ? everyone
    : canViewTeam ? [...own, ...directReports.map(employee => text(employee.employeeId))].filter(Boolean)
    : own;

  return {
    role,
    visibleEmployeeIds: visible,
    isPaAdmin,
    isClientAdmin,
    isApprover,
    employeeId,
    canSubmitOwnRequests: true,
    canSubmitOnBehalf: canViewTeam,
    canApproveTeamRequests: canViewTeam,
    canViewTeamData: canViewTeam,
    canViewCompanyData: canViewCompany,
    canPublishWellness: canViewCompany,
    canAdjustLeave: canViewCompany,
    canManageMdo: canViewCompany,
    canPublishCalendar: canViewCompany,
    canManageOnboarding: canViewCompany,
    canManageSystemConfig: isPaAdmin,
    canOverrideApproval: isPaAdmin,
    canViewReports: true,
    reportScope: canViewCompany ? 'company' : isApprover ? 'team' : 'own',
  };
}

/** The employee actor the request service records against every transaction. */
export function hrmActor(role, data = {}, employeeId = SIGNED_IN_EMPLOYEE_ID) {
  const access = accessFor(role, data, employeeId);
  const employee = findEmployee(data, employeeId);
  const permissions = ['hrm.request.submit'];
  if (access.canSubmitOnBehalf) permissions.push('hrm.request.submit_on_behalf');
  if (access.canApproveTeamRequests) permissions.push('hrm.request.approve', 'hrm.request.reject');
  if (access.isPaAdmin) permissions.push('hrm.request.override');
  return {
    actorId: `user-${employeeId}`,
    displayName: employee?.name || 'John Collins Doe',
    role: access.isPaAdmin ? 'P&A Admin' : access.isClientAdmin ? 'Client Admin' : access.isApprover ? 'Client Approver' : 'Client Employee',
    employeeId,
    employeeCode: employee?.employeeCode || '',
    permissions,
  };
}

/** Employee ids the signed-in user is allowed to read, given their role. */
export function visibleEmployeeIds(data = {}, role, employeeId = SIGNED_IN_EMPLOYEE_ID) {
  return accessFor(role, data, employeeId).visibleEmployeeIds;
}

/** Restrict report rows to what the signed-in user may export. */
export function scopeReportRows(rows = [], data = {}, role, employeeId = SIGNED_IN_EMPLOYEE_ID) {
  const allowed = new Set(visibleEmployeeIds(data, role, employeeId));
  return (Array.isArray(rows) ? rows : []).filter(row => {
    const rowEmployeeId = text(row.employeeId || row.employee?.employeeId || row.employee?.code);
    return Boolean(rowEmployeeId && allowed.has(rowEmployeeId));
  });
}

/**
 * Notifications addressed to somebody else are never shown.  Events without a
 * recipient are limited to company-wide announcements so one employee cannot
 * infer another employee's activity from the feed.
 */
export function scopeNotificationEvents(events = [], data = {}, role, employeeId = SIGNED_IN_EMPLOYEE_ID) {
  const access = accessFor(role, data, employeeId);
  if (access.canViewCompanyData) return Array.isArray(events) ? events : [];
  const team = new Set(visibleEmployeeIds(data, role, employeeId));
  const actorId = `user-${employeeId}`;
  return (Array.isArray(events) ? events : []).filter(event => {
    const targetEmployeeId = text(event.recipientEmployeeId || event.employeeId || event.targetEmployeeId || event.employee?.employeeId);
    const recipient = text(event.recipient || event.targetRole || event.audience).toLowerCase();
    const eventActorId = text(event.actorId || event.requesterActorId || event.filedBy?.actorId);
    const global = event.global === true || recipient === 'all employees';
    if (targetEmployeeId) return team.has(targetEmployeeId);
    if (global) return true;
    if (access.canViewTeamData) return recipient.includes('manager') || eventActorId === actorId;
    return eventActorId === actorId && (recipient.includes('employee') || recipient.includes('requester'));
  });
}

/** MDO enrollment detail is employee-private unless the viewer administers it. */
export function scopeMdoEnrollments(enrollments = [], data = {}, role, employeeId = SIGNED_IN_EMPLOYEE_ID) {
  const access = accessFor(role, data, employeeId);
  const rows = Array.isArray(enrollments) ? enrollments : [];
  if (access.canManageMdo) return rows;
  return rows.filter(row => text(row.employeeId) === text(employeeId));
}

/**
 * Leave types are ordered exactly as the balance cards appear in the Figma
 * masterfile.  Every screen that renders a leave card reads this list rather
 * than repeating the labels.
 */
export const LEAVE_TYPES = Object.freeze([
  'Vacation',
  'Sick',
  'Emergency',
  'Bereavement',
  'Solo Parent',
  'Terminal',
  'Magna Carta',
  'Maternity',
  'Paternity',
]);

/** Calendar categories, in the order the filter chips appear. */
export const CALENDAR_CATEGORIES = Object.freeze([
  { key: 'payroll', label: 'Payroll Payout', accent: 'red' },
  { key: 'timekeeping', label: 'Timekeeping', accent: 'amber' },
  { key: 'company', label: 'Company', accent: 'violet' },
  { key: 'holiday', label: 'Holidays', accent: 'lilac' },
  { key: 'statutory', label: 'Statutory', accent: 'teal' },
]);

/** The dashboard's module chips, in masterfile order. */
/**
 * Dashboard widgets.  The Manage widgets dialog reads this catalogue, so a
 * widget is added in one place rather than in the dialog and the grid.
 */
export const DASHBOARD_WIDGETS = Object.freeze([
  { key: 'profile', label: 'My profile and time clock', column: 'left', locked: true },
  { key: 'attendance', label: 'My Attendance Summary', column: 'left' },
  { key: 'leave', label: 'YTD Leave Balances', column: 'left' },
  { key: 'mdo', label: 'Mandatory Time Off Balances', column: 'left' },
  { key: 'metrics', label: 'Year-to-Date Metrics', column: 'left' },
  { key: 'workHours', label: 'Work Hours Comparison', column: 'left' },
  { key: 'happiness', label: 'Happiness Meter', column: 'left' },
  { key: 'tasks', label: 'All Pending Tasks', column: 'right' },
  { key: 'approvals', label: 'All Pending Approvals', column: 'right' },
  { key: 'wellness', label: 'Health and Wellness', column: 'right' },
  { key: 'calendar', label: 'Calendar', column: 'right' },
]);

export const DEFAULT_DASHBOARD_WIDGETS = Object.freeze(['profile', 'attendance', 'leave', 'mdo', 'tasks', 'approvals', 'wellness']);

/**
 * Toggle a widget on the dashboard.  The locked profile widget cannot be
 * removed; every other widget in the catalogue may be shown or hidden, so the
 * ceiling is the catalogue itself rather than an arbitrary number.
 */
export function toggleDashboardWidget(current = [], key, max = DASHBOARD_WIDGETS.filter(widget => !widget.locked).length) {
  const catalogue = new Set(DASHBOARD_WIDGETS.map(widget => widget.key));
  const locked = new Set(DASHBOARD_WIDGETS.filter(widget => widget.locked).map(widget => widget.key));
  const values = [...new Set((Array.isArray(current) ? current : []).filter(item => catalogue.has(item)))];
  if (!catalogue.has(key) || locked.has(key)) return values;
  if (values.includes(key)) return values.filter(item => item !== key);
  const optional = values.filter(item => !locked.has(item));
  return optional.length >= max ? values : [...values, key];
}

/** Shift catalog backing the Shift Change application dropdowns. */
export const SHIFT_CATALOG = Object.freeze([
  { shiftId: 'shift-morning', name: 'Morning Shift (8 AM - 5 PM)', window: '8:00 AM - 5:00 PM', days: 'Mon-Fri' },
  { shiftId: 'shift-afternoon', name: 'Afternoon Shift (2 PM - 10 PM)', window: '2:00 PM - 10:00 PM', days: 'Tue, Thu, Fri' },
  { shiftId: 'shift-mid', name: 'Mid Shift (11 AM - 8 PM)', window: '11:00 AM - 8:00 PM', days: 'Mon-Fri' },
  { shiftId: 'shift-night', name: 'Night Shift (10 PM - 7 AM)', window: '10:00 PM - 7:00 AM', days: 'Mon-Wed, Fri' },
]);

/**
 * The company roster.  `EMP-1001` is the signed-in user and the line manager
 * of the rest, which is what gives the Client experience its Manage Approvals
 * queue without a second sign-in.
 */
/**
 * The HRM / Timekeeping roster is a projection of the one company roster in
 * `employeeRoster.js`, so a punch, a leave balance, a salary record and a
 * payroll line all resolve to the same `employeeId`. Payroll-only attributes
 * (pay type, statutory switches, YTD balances) stay on the roster row; this
 * view carries the identity and employment fields the HRM screens render.
 */
export function seedEmployees() {
  return employeeRoster.map(employee => ({
    employeeId: employee.employeeId,
    employeeCode: employee.employeeCode,
    name: employee.name,
    initials: employee.initials,
    position: employee.position,
    department: employee.department,
    division: employee.division,
    employmentType: employee.employmentType,
    shiftId: employee.shiftId,
    managerId: employee.managerId,
    dateHired: employee.dateHired,
    status: employee.employmentStatus,
  }));
}

/**
 * One row per employee per leave type, as [accrued, used, forfeited, converted].
 * `remaining` is derived on read so a balance can never drift from its own
 * accrual and usage.  Converted credits are days the employee cashed out under
 * the leave-conversion rule, so they leave the balance exactly as used and
 * forfeited days do — HT192 reports on them and the balance must agree.
 */
export function seedLeaveBalances() {
  const plan = {
    'EMP-1001': { Vacation: [20, 15, 2, 1], Sick: [20, 2, 2, 0], Emergency: [10, 1, 0, 0], Bereavement: [20, 7, 2, 0], 'Solo Parent': [10, 3, 2, 0], Terminal: [10, 1, 2, 0], 'Magna Carta': [60, 0, 0, 0] },
    'EMP-1002': { Vacation: [20, 11, 0, 2], Sick: [20, 6, 0, 0], Emergency: [10, 4, 0, 0], Bereavement: [20, 2, 0, 0], 'Solo Parent': [10, 0, 0, 0], Terminal: [10, 0, 0, 0], 'Magna Carta': [60, 0, 0, 0] },
    'EMP-1003': { Vacation: [20, 8, 1, 3], Sick: [20, 3, 0, 1], Emergency: [10, 0, 0, 0], Bereavement: [20, 0, 0, 0], 'Solo Parent': [10, 2, 0, 0], Terminal: [10, 0, 0, 0], 'Magna Carta': [60, 0, 0, 0] },
    'EMP-1004': { Vacation: [20, 14, 0, 0], Sick: [20, 9, 1, 0], Emergency: [10, 2, 0, 0], Bereavement: [20, 4, 0, 0], 'Solo Parent': [10, 0, 0, 0], Terminal: [10, 0, 0, 0], 'Magna Carta': [60, 0, 0, 0] },
    'EMP-1005': { Vacation: [20, 5, 0, 4], Sick: [20, 1, 0, 2], Emergency: [10, 3, 0, 0], Bereavement: [20, 0, 0, 0], 'Solo Parent': [10, 7, 0, 0], Terminal: [10, 2, 0, 0], 'Magna Carta': [60, 0, 0, 0] },
    'EMP-1006': { Vacation: [20, 12, 0, 1], Sick: [20, 4, 0, 0], Emergency: [10, 1, 0, 0], Bereavement: [20, 3, 0, 0], 'Solo Parent': [10, 0, 0, 0], Terminal: [10, 0, 0, 0], 'Magna Carta': [60, 0, 0, 0] },
  };
  const rows = [];
  Object.entries(plan).forEach(([employeeId, byType]) => {
    Object.entries(byType).forEach(([leaveType, [accrued, used, forfeited, converted = 0]]) => {
      rows.push({ employeeId, leaveType, accrued, used, forfeited, converted, conversionDate: converted ? '2026-06-30' : '', pending: 0, available: accrued - used - forfeited - converted, asOf: '2026-08-17' });
    });
  });
  return rows;
}

/** Dated leave-history rows rendered under each balance card. */
function seedLeaveHistory() {
  const template = [
    { from: '2026-04-20', to: '2026-04-27', days: 7, status: 'Approved', remarks: '' },
    { from: '2026-03-18', to: '2026-03-22', days: 5, status: 'Approved', remarks: '' },
    { from: '2026-02-03', to: '2026-02-05', days: 3, status: 'Approved', remarks: '' },
    { from: '2026-01-12', to: '2026-01-13', days: 2, status: 'Forfeited', remarks: 'Exceeded yearly leave balance' },
  ];
  const rows = [];
  seedEmployees().forEach(employee => {
    LEAVE_TYPES.forEach(leaveType => {
      template.forEach((entry, index) => {
        rows.push({ historyId: `lvh-${employee.employeeId}-${leaveType}-${index + 1}`.replace(/\s+/g, '-').toLowerCase(), employeeId: employee.employeeId, leaveType, ...entry });
      });
    });
  });
  return rows;
}

/**
 * Mandatory Day Off balances.  The five stat cards read these totals and the
 * ledger below them explains how each day was earned, scheduled or lost.
 */
function seedMdoBalances() {
  return [
    { employeeId: 'EMP-1001', earned: 20, used: 15, scheduled: 2, forfeited: 2 },
    { employeeId: 'EMP-1002', earned: 20, used: 11, scheduled: 1, forfeited: 0 },
    { employeeId: 'EMP-1003', earned: 20, used: 8, scheduled: 3, forfeited: 1 },
    { employeeId: 'EMP-1004', earned: 20, used: 14, scheduled: 0, forfeited: 2 },
    { employeeId: 'EMP-1005', earned: 20, used: 5, scheduled: 4, forfeited: 0 },
    { employeeId: 'EMP-1006', earned: 20, used: 12, scheduled: 2, forfeited: 1 },
  ].map(row => ({ ...row, remaining: row.earned - row.used - row.forfeited }));
}

function seedMdoHistory() {
  const template = [
    { type: 'Employee Request', dateEarned: '2026-01-12', days: 7, effectiveFrom: '2026-04-22', effectiveTo: '2026-04-28', expiry: '2026-05-24', status: 'Used' },
    { type: 'Employee Request', dateEarned: '2026-01-12', days: 3, effectiveFrom: '2026-04-03', effectiveTo: '2026-04-05', expiry: '2026-05-24', status: 'Used' },
    { type: 'Scheduled by Company', dateEarned: '2026-02-03', days: 7, effectiveFrom: '', effectiveTo: '', expiry: '2026-02-28', status: 'Scheduled' },
    { type: 'Earned', dateEarned: '2026-01-12', days: 3, effectiveFrom: '', effectiveTo: '', expiry: '2026-05-24', status: 'Ready for Scheduling' },
    { type: 'Earned', dateEarned: '2026-01-12', days: 10, effectiveFrom: '', effectiveTo: '', expiry: '2026-05-24', status: 'Ready for Scheduling' },
    { type: 'Earned', dateEarned: '2025-11-20', days: 5, effectiveFrom: '', effectiveTo: '', expiry: '2026-01-01', status: 'Forfeited' },
  ];
  const rows = [];
  seedEmployees().forEach(employee => {
    template.forEach((entry, index) => {
      rows.push({ historyId: `mdo-${employee.employeeId}-${index + 1}`, employeeId: employee.employeeId, ...entry });
    });
  });
  return rows;
}

function seedWellness() {
  const body = 'Ready to jumpstart your fitness journey? We are excited to launch this programme — a fun and motivating way to get active, stay healthy, and build lasting habits. The programme is open to all employees, no matter your current fitness level.';
  const events = [
    { id: 'wel-001', kind: 'Event', title: 'Join The 30-Day Fat Loss Challenge!', department: 'Health Department', publishedAt: '2026-02-12T15:23:00.000Z', startDate: '2026-06-01', endDate: '2026-06-30', totalEmployees: 500, participants: 180, body },
    { id: 'wel-002', kind: 'Event', title: 'Get Moving with Zumba: Dance Your Way to Fitness!', department: 'Health Department', publishedAt: '2026-02-20T09:00:00.000Z', startDate: '2026-05-24', endDate: '2026-05-24', totalEmployees: 500, participants: 210, body },
    { id: 'wel-003', kind: 'Event', title: 'Mental Health First Aid Workshop', department: 'Health Department', publishedAt: '2026-05-02T09:00:00.000Z', startDate: '2026-05-17', endDate: '2026-05-17', totalEmployees: 500, participants: 250, body },
    { id: 'wel-004', kind: 'Event', title: 'Company Fun Run 2026', department: 'Health Department', publishedAt: '2026-04-28T09:00:00.000Z', startDate: '2026-05-10', endDate: '2026-05-10', totalEmployees: 500, participants: 320, body },
    { id: 'wel-005', kind: 'Article', title: 'Creating a Healthy Office Culture: Innovative Wellness Initiatives for Employees', department: 'Health Department', publishedAt: '2026-05-03T09:00:00.000Z', startDate: '', endDate: '', totalEmployees: 500, participants: 0, body },
    { id: 'wel-006', kind: 'Article', title: 'Small resets that carry a long workday', department: 'Health Department', publishedAt: '2026-05-01T09:00:00.000Z', startDate: '', endDate: '', totalEmployees: 500, participants: 0, body },
  ];
  return {
    events,
    // `articles` stays as the published-content alias the reports screen reads.
    articles: events.filter(event => event.kind === 'Article'),
    interests: [
      { interestId: 'int-001', employeeId: 'EMP-1001', eventId: 'wel-002', interested: true, at: '2026-05-20T02:00:00.000Z' },
      { interestId: 'int-002', employeeId: 'EMP-1001', eventId: 'wel-003', interested: false, at: '2026-05-14T02:00:00.000Z' },
    ],
    participation: seedEmployees().flatMap((employee, employeeIndex) => events
      .filter(event => event.kind === 'Event')
      .map((event, eventIndex) => ({
        participationId: `wpa-${employee.employeeId}-${event.id}`,
        employeeId: employee.employeeId,
        eventId: event.id,
        joinedAt: event.startDate,
        joined: (employeeIndex + eventIndex) % 3 !== 0,
      }))),
    engagement: [
      { period: 'Week 1', apr: 62, may: 55 },
      { period: 'Week 2', apr: 71, may: 64 },
      { period: 'Week 3', apr: 84, may: 78 },
      { period: 'Week 4', apr: 79, may: 88 },
    ],
    departmentEngagement: [
      { department: 'Health', rate: 96 },
      { department: 'Accounting', rate: 93.25 },
      { department: 'Marketing', rate: 91.03 },
      { department: 'Human Resource', rate: 90.89 },
      { department: 'IT', rate: 89 },
    ],
    checkins: [
      { id: 'checkin-001', companyId: '', employeeId: 'EMP-1001', rating: 4, mood: 'Good', note: 'Settled into the new project.', at: '2026-08-16T08:30:00.000Z' },
    ],
  };
}

function seedMdo() {
  return {
    plans: [
      { planId: 'med-basic', type: 'Medical', provider: 'Atlas Health Network', coverage: 'In-patient and out-patient', annualLimit: 'PHP 120,000', status: 'Active' },
      { planId: 'dental-standard', type: 'Dental', provider: 'SmileCare Partners', coverage: 'Preventive and restorative', annualLimit: 'PHP 25,000', status: 'Active' },
      { planId: 'optical-standard', type: 'Optical', provider: 'ClearView Clinics', coverage: 'Frames and lenses', annualLimit: 'PHP 12,000', status: 'Active' },
    ],
    enrollments: [
      { enrollmentId: 'enr-001', employeeId: 'EMP-1001', planId: 'med-basic', status: 'Active', effectiveFrom: '2026-01-01', dependents: 1 },
      { enrollmentId: 'enr-002', employeeId: 'EMP-1001', planId: 'dental-standard', status: 'Active', effectiveFrom: '2026-01-01', dependents: 0 },
      { enrollmentId: 'enr-003', employeeId: 'EMP-1001', planId: 'optical-standard', status: 'Pending', effectiveFrom: '2026-08-01', dependents: 0 },
      { enrollmentId: 'enr-004', employeeId: 'EMP-1002', planId: 'med-basic', status: 'Active', effectiveFrom: '2026-01-01', dependents: 0 },
      { enrollmentId: 'enr-005', employeeId: 'EMP-1003', planId: 'med-basic', status: 'Active', effectiveFrom: '2026-01-01', dependents: 2 },
    ],
  };
}

/**
 * Attendance, productivity and mood series behind the dashboard widgets.
 * The bar charts read `monthly`, the Work Hours card reads `weekly`, and the
 * Year-to-Date Metrics tiles read `yearToDate`.
 */
function seedAttendance() {
  const monthly = [
    ['Jan', 2, 3], ['Feb', 4, 6], ['Mar', 2, 3], ['Apr', 5, 6], ['May', 7, 5], ['Jun', 8, 6],
    ['Jul', 10, 7], ['Aug', 5, 4], ['Sep', 8, 6], ['Oct', 1, 3], ['Nov', 6, 8], ['Dec', 5, 4],
  ].map(([month, absent, late]) => ({ month, absent, late }));
  return {
    // The running punch state the time clock reads and writes.
    clock: { punchedInAt: '', breakStartedAt: '', lastPunchOutAt: '' },
    lastLoggedInAt: '2026-08-17T06:44:28.000Z',
    monthly,
    yearToDate: { absent: 3, tardiness: 12, leaves: 15 },
    workHours: {
      totalHours: 1294,
      averageHours: 12.94,
      productivityChange: -3.64,
      weekly: [
        { label: 'Week 1', range: 'Jan 1 - 7', hours: 3 },
        { label: 'Week 2', range: 'Jan 8 - 14', hours: 4 },
        { label: 'Week 3', range: 'Jan 15 - 21', hours: 7 },
        { label: 'Week 4', range: 'Jan 22 - 28', hours: 5 },
        { label: 'Week 5', range: 'Jan 29 - Feb 5', hours: 1 },
      ],
    },
    happiness: { dailyRating: 5, dailyLabel: 'Perfect', monthlyAverage: 3.98, monthlyLabel: 'Neutral' },
  };
}

/** Dashboard task list, including the overdue rows the masterfile marks red. */
function seedTasks() {
  return [
    { taskId: 'tsk-01', title: 'Submit Q2 Project Report for Review', dueDate: '2026-08-18', dueLabel: 'Tomorrow', done: true },
    { taskId: 'tsk-02', title: 'Approval Module UI - Internal Checking', dueDate: '2026-08-15', dueLabel: '', done: true },
    { taskId: 'tsk-03', title: 'Confirm updated payroll cut-off schedule', dueDate: '2026-08-01', dueLabel: '', done: true },
    { taskId: 'tsk-04', title: 'Review team overtime filings', dueDate: '2026-08-20', dueLabel: '', done: false },
    { taskId: 'tsk-05', title: 'Complete annual security training', dueDate: '2026-08-24', dueLabel: '', done: false },
    { taskId: 'tsk-06', title: 'Acknowledge revised leave policy', dueDate: '2026-08-26', dueLabel: '', done: false },
    { taskId: 'tsk-07', title: 'Submit timesheet for the second cut-off', dueDate: '2026-08-28', dueLabel: '', done: false },
    { taskId: 'tsk-08', title: 'Nominate a wellness champion', dueDate: '2026-09-01', dueLabel: '', done: false },
  ];
}

/* ------------------------------------------------------- expense management */

/** Reimbursement categories offered when an expense claim is filed. */
export const REIMBURSEMENT_TYPES = Object.freeze([
  'Travel Expenses',
  'Meal Reimbursement',
  'Training/Certification Fee',
  'Office Supplies',
  'Transportation',
]);

export const CASH_ADVANCE_TYPES = Object.freeze(['Travel', 'Medical', 'Project', 'Training', 'Representation']);

/** Charge codes a cash advance or liquidation is booked against. */
export const CHARGE_CODES = Object.freeze(['ACT-TRV', 'ACT-MED', 'ACT-PRJ', 'ACT-TRN', 'ACT-REP']);

/** Statuses an expense transaction moves through, in tab order. */
export const EXPENSE_STATUS_TABS = Object.freeze(['All', 'Pending', 'Delegated', 'Approved', 'Rejected']);
export const CASH_STATUS_TABS = Object.freeze(['All', 'Pending', 'Approved', 'Rejected']);

const expenseDescriptions = [
  'Flight ticket to Singapore',
  'Flight ticket to Manila',
  'Client dinner - Q2 kickoff',
  'Taxi fare to client site',
  'Printer toner and stationery',
];

/**
 * A reimbursement is a claim header plus one or more expense records; the
 * header total is derived from its records so the two can never disagree.
 */
function seedReimbursements(employees) {
  const statuses = ['Pending Approval', 'Approved', 'Rejected', 'Delegated'];
  const rows = [];
  employees.forEach((employee, employeeIndex) => {
    REIMBURSEMENT_TYPES.forEach((type, typeIndex) => {
      const status = statuses[(employeeIndex + typeIndex) % statuses.length];
      const decided = status === 'Approved' || status === 'Rejected';
      const recordCount = (typeIndex % 2) + 1;
      const records = Array.from({ length: recordCount }, (_, recordIndex) => ({
        recordId: `rec-${employee.employeeId}-${typeIndex}-${recordIndex + 1}`,
        dateOfExpense: '2026-04-23',
        currency: 'Philippine Peso',
        amount: typeIndex === 0 ? 2500 : 350,
        description: expenseDescriptions[(typeIndex + recordIndex) % expenseDescriptions.length],
        receiptDate: '2026-04-23',
        orNumber: `OR-${100000 + employeeIndex * 10 + typeIndex + recordIndex}`,
        attachments: [{ name: 'sample-proof-document.docx', size: '1.7MB' }, { name: 'Document example.csv', size: '1.7MB' }],
      }));
      rows.push({
        transactionNo: `TRX-${String(rows.length + 1).padStart(5, '0')}`,
        employeeId: employee.employeeId,
        type,
        records,
        dateApplied: '2026-04-23',
        dateApproved: decided ? '2026-04-23' : '',
        approver: decided ? 'David Lee' : '',
        approverRemarks: '',
        delegatedTo: status === 'Delegated' ? 'Kaye Santos' : '',
        delegationReason: status === 'Delegated' ? 'Approver on leave.' : '',
        status,
        statusDate: decided ? '2026-04-23' : '',
      });
    });
  });
  return rows;
}

/** Header total is the sum of the claim's own records. */
export function reimbursementTotal(reimbursement) {
  return (reimbursement?.records || []).reduce((sum, record) => sum + Number(record.amount || 0), 0);
}

function seedCashAdvances(employees) {
  const statuses = ['Pending Approval', 'Approved', 'Rejected'];
  return employees.flatMap((employee, employeeIndex) => CASH_ADVANCE_TYPES.slice(0, 3).map((type, typeIndex) => {
    const status = statuses[(employeeIndex + typeIndex) % statuses.length];
    const decided = status === 'Approved' || status === 'Rejected';
    return {
      transactionNo: `TRX-${String(employeeIndex * 3 + typeIndex + 1).padStart(5, '0')}`,
      employeeId: employee.employeeId,
      division: 'Product Development',
      applicationDate: '2026-04-23',
      cashAdvanceType: type,
      chargeCode: CHARGE_CODES[typeIndex % CHARGE_CODES.length],
      amountRequested: 15000,
      purpose: 'Client engagement and on-site support.',
      employeeRemarks: 'Booking and accommodation to be settled on arrival.',
      approverRemarks: '',
      status,
      statusDate: decided ? '2026-04-23' : '',
    };
  }));
}

/**
 * A liquidation settles one cash advance.  Its balance is derived from the
 * expense records against the advance, never stored as an independent figure.
 */
function seedLiquidations(cashAdvances) {
  const statuses = ['Pending Approval', 'Approved', 'Rejected'];
  const rows = [];
  cashAdvances.filter(advance => advance.status === 'Approved').forEach((advance, advanceIndex) => {
    const count = (advanceIndex % 2) + 1;
    for (let sequence = 1; sequence <= count; sequence += 1) {
      const status = statuses[(advanceIndex + sequence) % statuses.length];
      const decided = status === 'Approved' || status === 'Rejected';
      rows.push({
        liquidationNumber: `LQ-${String(advanceIndex + 1).padStart(5, '0')}-${String(sequence).padStart(3, '0')}`,
        cashAdvanceNo: advance.transactionNo,
        employeeId: advance.employeeId,
        division: advance.division,
        applicationDate: '2026-05-01',
        cashAdvanceType: advance.cashAdvanceType,
        chargeCode: advance.chargeCode,
        cashAdvanceAmount: advance.amountRequested,
        cashReturned: 0,
        cashReturnOrNumber: '',
        liquidationDue: '2026-04-30',
        records: [{
          recordId: `lqr-${advanceIndex}-${sequence}`,
          dateOfExpense: '2026-04-23',
          currency: 'Philippine Peso',
          amount: 25000,
          description: 'Flight Ticket to Singapore',
          attachments: [{ name: 'receipt.pdf', size: '1.7MB' }],
        }],
        actionedBy: decided ? 'David Lee' : '',
        approverRemarks: decided ? 'Reviewed against the submitted receipts.' : '',
        status,
        statusDate: decided ? '2026-05-02' : '',
      });
    }
  });
  return rows;
}

/** Total expense, and the balance the employee still owes or is owed. */
export function liquidationSummary(liquidation) {
  const totalExpense = (liquidation?.records || []).reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const advance = Number(liquidation?.cashAdvanceAmount || 0);
  const returned = Number(liquidation?.cashReturned || 0);
  return { totalExpense, cashAdvanceAmount: advance, cashReturned: returned, amountDue: totalExpense - advance - returned };
}

/**
 * A shift assignment carries the whole schedule the View Details modal shows,
 * and its lifecycle status is derived from its own dates rather than stored.
 */
/**
 * The shift schedules a company may assign.  BRD HT259 names the options this
 * has to cover — a regular eight-hour day, a compressed work week, a night
 * shift, a 24-hour shift, and shifts kept on the mother country's clock or on
 * another country's — so `shiftType` and `timezone` are part of the schedule
 * rather than something a screen guesses from the time range.
 */
export const SHIFT_SCHEDULE_CATALOG = Object.freeze([
  { code: '001', name: '7:00 AM - 5:30 PM', hours: '7:00 AM - 5:30 PM (Mon-Tue, Thu, Fri)', workHours: 8, daysPerWeek: 5, restDays: 'Saturdays, Sundays', shiftType: 'Regular (8 Hours)', timezone: 'Asia/Manila (PHT)' },
  { code: '002', name: '10:00 PM - 7:30 AM', hours: '10:00 PM - 7:30 AM (Mon-Wed, Thu, Fri)', workHours: 8, daysPerWeek: 6, restDays: 'Sundays', shiftType: 'Night Shift', timezone: 'Asia/Manila (PHT)' },
  { code: '003', name: '7:00 AM - 10:00 AM', hours: '7:00 AM - 10:00 AM (Mon-Fri)', workHours: 4, daysPerWeek: 5, restDays: 'Saturdays, Sundays', shiftType: 'Half Day', timezone: 'Asia/Manila (PHT)' },
  { code: '004', name: '7:00 AM - 6:00 PM', hours: '7:00 AM - 6:00 PM (Mon-Thu)', workHours: 10, daysPerWeek: 4, restDays: 'Fridays, Saturdays, Sundays', shiftType: 'Compressed Work Week', timezone: 'Asia/Manila (PHT)' },
  { code: '005', name: '9:00 PM - 6:00 AM', hours: '9:00 PM - 6:00 AM (Mon-Fri)', workHours: 8, daysPerWeek: 5, restDays: 'Saturdays, Sundays', shiftType: 'Other Country Time Shift', timezone: 'America/New_York (EST)' },
  { code: '006', name: '8:00 AM - 8:00 AM', hours: '8:00 AM - 8:00 AM (Mon, Wed, Fri)', workHours: 24, daysPerWeek: 3, restDays: 'Tuesdays, Thursdays, Weekends', shiftType: '24-Hour Shift', timezone: 'Asia/Manila (PHT)' },
  { code: '007', name: '4:00 PM - 1:00 AM', hours: '4:00 PM - 1:00 AM (Mon-Fri)', workHours: 8, daysPerWeek: 5, restDays: 'Saturdays, Sundays', shiftType: 'Mother Country Shift', timezone: 'Europe/London (GMT)' },
]);

function seedShiftAssignments(employees) {
  const schedules = SHIFT_SCHEDULE_CATALOG;
  const spans = [
    { startDate: '2026-04-23', endDate: '' },
    { startDate: '2026-09-01', endDate: '' },
    { startDate: '2025-06-01', endDate: '2025-12-31' },
  ];
  return employees.flatMap((employee, employeeIndex) => spans.map((span, spanIndex) => {
    const schedule = schedules[(employeeIndex + spanIndex) % schedules.length];
    return {
      assignmentId: `asg-${employee.employeeId}-${spanIndex + 1}`,
      employeeId: employee.employeeId,
      shiftScheduleCode: schedule.code,
      shiftName: schedule.name,
      shiftHours: schedule.hours,
      shiftType: schedule.shiftType,
      timezone: schedule.timezone,
      startDate: span.startDate,
      endDate: span.endDate,
      repeatShift: 'No',
      holidayPayPartOfOt: 'Yes',
      otHolidayPayBasedOnCalendar: 'Yes',
      flexibleTime: 'No',
      gracePeriod: 15,
      gracePeriodUnit: 'Minutes',
      gracePeriodCondition: 'Before Start',
      breakHoursCode: 'BREAK_001',
      autoDeductBreak: 'Yes',
      workHours: schedule.workHours,
      shiftDaysPerWeek: schedule.daysPerWeek,
      halfDayShiftDay: 'No',
      restDays: schedule.restDays,
    };
  }));
}

/**
 * Upcoming / Active / Expired follows the assignment's own dates, so a list
 * tab never disagrees with the dates shown in the row.
 */
export function shiftAssignmentStatus(assignment, today = new Date().toISOString().slice(0, 10)) {
  const start = text(assignment?.startDate);
  const end = text(assignment?.endDate);
  if (start && start > today) return 'Upcoming';
  if (end && end < today) return 'Expired';
  return 'Active';
}

/* ----------------------------------------------------------- loan management */

export const LOAN_STATUS_TABS = Object.freeze(['All', 'Pending', 'Approved', 'Rejected']);
export const COMPANY_LOAN_TYPES = Object.freeze(['Education Loan', 'Medical Loan', 'Salary Loan', 'Multi-purpose Loan']);
export const GOVERNMENT_LOAN_TYPES = Object.freeze(['Calamity Loan', 'Housing Loan', 'Education Loan', 'Salary Loan']);
export const GOVERNMENT_AGENCIES = Object.freeze(['SSS', 'Pag-IBIG', 'GSIS']);
export const PAYMENT_MODES = Object.freeze(['Weekly', 'Semi-monthly', 'Monthly']);

/**
 * A company loan is filed by the employee with its repayment schedule
 * already chosen; interest is set by the approver at decision time, so a
 * pending loan carries no interest, total, or accumulated-payment figures.
 */
function seedCompanyLoans(employees) {
  const statuses = ['Pending Approval', 'Approved', 'Rejected'];
  return employees.flatMap((employee, employeeIndex) => COMPANY_LOAN_TYPES.slice(0, 2).map((type, typeIndex) => {
    const status = statuses[(employeeIndex + typeIndex) % statuses.length];
    const decided = status !== 'Pending Approval';
    const loanAmount = typeIndex === 0 ? 50000 : 10000;
    const interestRate = decided ? 5 : null;
    const interestAmount = decided ? Math.round(loanAmount * (interestRate / 100)) : null;
    return {
      transactionNo: `TRX-${String(employeeIndex * 2 + typeIndex + 1).padStart(5, '0')}`,
      employeeId: employee.employeeId,
      division: 'Product Department',
      applicationDate: '2026-04-23',
      loanType: type,
      loanAmount,
      loanTerms: 12,
      purpose: 'Tuition for the upcoming school year.',
      employeeRemarks: 'Requesting the standard company loan deduction schedule.',
      interestRate,
      interestAmount,
      totalLoan: decided ? loanAmount + interestAmount : loanAmount,
      accumulatedPayments: status === 'Approved' ? loanAmount + interestAmount : null,
      payrollCutoffStart: '2026-04-30',
      payrollCutoffEnd: '2026-05-03',
      deductionAmount: 1500,
      paymentMode: 'Weekly',
      frequency: '1st Week, 3rd Week',
      approverRemarks: decided ? 'Reviewed against the employee’s tenure and outstanding balances.' : '',
      actionedBy: decided ? 'Mark Santos' : '',
      attachments: [{ name: 'sample-proof-document.docx', size: '1.7MB' }],
      status,
      statusDate: decided ? '2026-04-23' : '',
    };
  }));
}

/**
 * A government loan is encoded from the agency's own approval, so its
 * interest and date granted arrive already known rather than being set
 * during the internal approval step.
 */
function seedGovernmentLoans(employees) {
  const statuses = ['Pending Approval', 'Approved', 'Rejected'];
  return employees.flatMap((employee, employeeIndex) => GOVERNMENT_LOAN_TYPES.slice(0, 2).map((type, typeIndex) => {
    const status = statuses[(employeeIndex + typeIndex) % statuses.length];
    const decided = status !== 'Pending Approval';
    const loanAmount = 50000;
    return {
      transactionNo: `TRX-${String(employeeIndex * 2 + typeIndex + 1).padStart(5, '0')}`,
      employeeId: employee.employeeId,
      applicationDate: '2026-04-23',
      formSubmissionDate: '2026-04-23',
      governmentLoanType: type,
      governmentAgency: GOVERNMENT_AGENCIES[typeIndex % GOVERNMENT_AGENCIES.length],
      dateGranted: decided ? '2026-04-23' : '',
      loanAmount,
      loanTerms: 12,
      totalLoan: loanAmount,
      purpose: 'Home repair following the recent storm.',
      employeeRemarks: 'Documentation submitted to the agency branch on file.',
      interestRate: decided ? 5 : null,
      interestAmount: decided ? Math.round(loanAmount * 0.05) : null,
      periodStartDate: decided ? '2026-04-23' : '',
      periodEndDate: decided ? '2026-05-03' : '',
      accumulatedPayment: status === 'Approved' ? loanAmount : null,
      approverRemarks: '',
      actionedBy: decided ? 'Mark Santos' : '',
      filedBy: employee.name,
      attachments: [{ name: 'sample-proof-document.docx', size: '1.7MB' }],
      status,
      statusDate: decided ? '2026-04-23' : '',
    };
  }));
}

const calendarRemark = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque aliquet lorem ac volutpat sagittis. Donec tempor porta massa vel interdum.';

function seedCalendar() {
  return [
    { id: 'cal-001', title: 'BIR Form 1601C - Last Day of Filing', category: 'statutory', date: '2026-10-15', endDate: '2026-10-15', deadlineType: 'Filing', audience: 'All Employees', remarks: calendarRemark },
    { id: 'cal-002', title: 'BIR Form 1601C - Last Day of Filing', category: 'statutory', date: '2026-10-14', endDate: '2026-10-14', deadlineType: 'Filing', audience: 'All Employees', remarks: calendarRemark },
    { id: 'cal-003', title: 'Payroll Payout', category: 'payroll', date: '2026-10-15', audience: 'All Employees', remarks: calendarRemark },
    { id: 'cal-004', title: 'Payroll Payout', category: 'payroll', date: '2026-10-30', audience: 'All Employees', remarks: calendarRemark },
    { id: 'cal-005', title: 'Timekeeping Cutoff', category: 'timekeeping', date: '2026-10-21', audience: 'All Employees', remarks: calendarRemark },
    { id: 'cal-006', title: 'Weekly Alignment', category: 'company', date: '2026-10-09', startTime: '14:00', endTime: '15:00', audience: 'Department > IT Department', remarks: calendarRemark },
    { id: 'cal-007', title: 'Weekly Alignment', category: 'company', date: '2026-10-16', startTime: '14:00', endTime: '15:00', audience: 'Department > IT Department', remarks: calendarRemark },
    { id: 'cal-008', title: 'Weekly Alignment', category: 'company', date: '2026-10-23', startTime: '14:00', endTime: '15:00', audience: 'Department > IT Department', remarks: calendarRemark },
    { id: 'cal-009', title: 'Weekly Alignment', category: 'company', date: '2026-10-30', startTime: '14:00', endTime: '15:00', audience: 'Department > IT Department', remarks: calendarRemark },
    { id: 'cal-010', title: 'Town Hall', category: 'company', date: '2026-10-15', startTime: '15:00', endTime: '16:00', audience: 'All Employees', remarks: calendarRemark },
    { id: 'cal-011', title: 'Service Awards Night', category: 'company', date: '2026-10-15', startTime: '16:00', endTime: '17:00', audience: 'All Employees', remarks: calendarRemark },
    { id: 'cal-012', title: "All Saints' Day Eve", category: 'holiday', date: '2026-10-31', audience: 'All Employees', remarks: calendarRemark },
    { id: 'cal-013', title: "All Saints' Day", category: 'holiday', date: '2026-11-01', audience: 'All Employees', remarks: calendarRemark },
    { id: 'cal-014', title: "All Souls' Day", category: 'holiday', date: '2026-11-02', audience: 'All Employees', remarks: calendarRemark },
  ];
}

/**
 * Pre-boarding checklist.  Tasks carry their own submission state so the
 * progress bar and the task detail screen never disagree.
 */
function seedOnboarding() {
  const checklist = [
    { taskId: 'task-1', title: 'Receive congratulatory letter', requiresUpload: false },
    { taskId: 'task-2', title: 'Complete all new hire forms', requiresUpload: true },
    { taskId: 'task-3', title: 'Attend new hire orientation', requiresUpload: false },
    { taskId: 'task-4', title: 'Confirm company assets received', requiresUpload: false },
    { taskId: 'task-5', title: 'Sign off Company Policy A', requiresUpload: true },
    { taskId: 'task-6', title: 'Sign off Company Policy B', requiresUpload: true },
  ];
  const progressFor = states => checklist.map((task, index) => ({
    ...task,
    status: states[index] || 'Not started',
    completedAt: states[index] === 'Completed' ? '2026-05-23' : states[index] === 'Attended' ? '2026-05-23' : '',
    attachments: [],
    remarks: '',
  }));
  return {
    templates: [{ templateId: 'onb-standard', name: 'Standard employee onboarding', version: 1, status: 'Active', checklist: checklist.map(task => task.title) }],
    records: [
      { recordId: 'onb-001', employeeId: 'EMP-1001', templateId: 'onb-standard', status: 'In Progress', startedAt: '2026-05-16', dueAt: '2026-06-01', editingEndsInDays: 7, tasks: progressFor(['Not started', 'Not started', 'Attended', 'Completed', 'In progress', 'Completed']) },
      { recordId: 'onb-002', employeeId: 'EMP-1002', templateId: 'onb-standard', status: 'In Progress', startedAt: '2026-05-11', dueAt: '2026-05-26', editingEndsInDays: 4, tasks: progressFor(['Completed', 'Not started', 'Attended', 'Not started', 'Not started', 'Not started']) },
      { recordId: 'onb-003', employeeId: 'EMP-1003', templateId: 'onb-standard', status: 'Completed', startedAt: '2026-04-20', dueAt: '2026-05-03', editingEndsInDays: 0, tasks: progressFor(['Completed', 'Completed', 'Attended', 'Completed', 'Completed', 'Completed']) },
      { recordId: 'onb-004', employeeId: 'EMP-1004', templateId: 'onb-standard', status: 'In Progress', startedAt: '2026-05-18', dueAt: '2026-06-02', editingEndsInDays: 9, tasks: progressFor(['Completed', 'In progress', 'Not started', 'Not started', 'Not started', 'Not started']) },
      { recordId: 'onb-005', employeeId: 'EMP-1005', templateId: 'onb-standard', status: 'In Progress', startedAt: '2026-05-19', dueAt: '2026-06-03', editingEndsInDays: 10, tasks: progressFor(['Completed', 'Completed', 'Attended', 'In progress', 'Not started', 'Not started']) },
    ],
  };
}

/* --------------------------------------------------- employee requests (Part 4) */

export const BIR_SEPARATION_REASONS = Object.freeze([
  'Termination',
  'Resignation',
  'Retirement',
  'End of Contract',
  'Health/Medical Reasons',
  'Redundancy/Retrenchment',
]);

export const COE_PURPOSES = Object.freeze([
  'Credit Card',
  'Bank / Loan Application',
  'Visa / Embassy Requirement',
  'Future Employment',
  'Rental / Lease Agreement',
  'Personal Reference',
]);

export function seedResignations(employees) {
  const statuses = ['Pending Approval', 'Approved', 'Rejected'];
  const reasons = ['Termination', 'Career Growth / Opportunity', 'Relocation / Overseas Employment', 'Personal / Family Reasons'];
  return employees.flatMap((employee, employeeIndex) => reasons.slice(0, 2).map((reason, reasonIndex) => {
    const status = statuses[(employeeIndex + reasonIndex) % statuses.length];
    const decided = status !== 'Pending Approval';
    return {
      id: `RES-${String(employeeIndex * 2 + reasonIndex + 1).padStart(4, '0')}`,
      applicationDate: '2026-04-23',
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      employeeName: employee.name,
      department: employee.department || 'IT Department',
      division: 'Product Development',
      reason,
      effectivityDate: '2026-05-03',
      employeeRemarks: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      submissionType: reasonIndex === 0 ? 'System-generated' : 'Employee Submission',
      submittedFile: { name: 'sample-proof-document.docx', size: '1.7MB' },
      separationReasonBir: decided ? (reason === 'Termination' ? 'Termination' : 'Resignation') : '',
      approverRemarks: decided ? (status === 'Approved' ? 'Endorsed for transition and separation clearance.' : 'Incomplete handover plan.') : '',
      actionedBy: decided ? 'Mark Santos' : '',
      filedBy: employee.name,
      status,
      statusDate: decided ? '2026-04-23' : '',
    };
  }));
}

export function seedCoeRequests(employees) {
  const statuses = ['Pending Approval', 'Approved', 'Rejected'];
  return employees.flatMap((employee, employeeIndex) => COE_PURPOSES.slice(0, 2).map((purpose, purposeIndex) => {
    const status = statuses[(employeeIndex + purposeIndex) % statuses.length];
    const decided = status !== 'Pending Approval';
    const hasFile = decided || purposeIndex === 0;
    return {
      id: `COE-${String(employeeIndex * 2 + purposeIndex + 1).padStart(4, '0')}`,
      dateRequested: '2026-04-23',
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      employeeName: employee.name,
      jobTitle: employee.position || 'Sr. Software Developer',
      department: employee.department || 'IT Department',
      division: 'Product Development',
      dateNeeded: '2026-05-03',
      purpose,
      companyInstitutionName: purpose === 'Credit Card' ? 'MetroPrime Bank' : 'ClearView Cable Services Ltd.',
      recipientAddress: 'Unit 1205, Horizon Plaza, 25 Sunrise Avenue, Greenfield District Mandaluyong City, Metro Manila 1550, Philippines',
      withSalaryInfo: 'Yes',
      employeeRemarks: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      coeType: 'System-generated',
      coeFile: hasFile ? { name: `Certificate-of-Employment-${employee.employeeCode}.docx`, size: '1.7MB' } : null,
      approverRemarks: decided ? (status === 'Approved' ? 'Certificate generated and authenticated.' : 'Missing institution requirement details.') : '',
      actionedBy: decided ? 'Mark Santos' : '',
      filedBy: employee.name,
      status,
      statusDate: decided ? '2026-04-23' : '',
    };
  }));
}

export function seedOnboardingDocuments(employees) {
  const titles = [
    { num: 1, title: 'Job-Description-1-2025', contract: 'Employment-Contract-1-2025', date: '2025-05-27', author: 'Ethan Collins', status: 'Pending' },
    { num: 2, title: 'Job-Description-2-2025', contract: 'Employment-Contract-2-2025', date: '2025-05-27', author: 'Ethan Collins', status: 'Pending' },
    { num: 3, title: 'Job-Description-3-2025', contract: 'Employment-Contract-3-2025', date: '2025-05-27', author: 'Ethan Collins', status: 'Pending' },
    { num: 4, title: 'Job-Description-4-2025', contract: 'Employment-Contract-4-2025', date: '2025-05-27', author: 'Ethan Collins', status: 'Approved' },
    { num: 5, title: 'Job-Description-5-2025', contract: 'Employment-Contract-5-2025', date: '2025-05-27', author: 'Ethan Collins', status: 'Approved' },
    { num: 6, title: 'Job-Description-6-2025', contract: 'Employment-Contract-6-2025', date: '2025-05-27', author: 'Ethan Collins', status: 'Approved' },
    { num: 7, title: 'Job-Description-7-2025', contract: 'Employment-Contract-7-2025', date: '2025-05-27', author: 'Ethan Collins', status: 'Rejected' },
    { num: 8, title: 'Job-Description-8-2025', contract: 'Employment-Contract-8-2025', date: '2025-05-27', author: 'Ethan Collins', status: 'Rejected' },
    { num: 9, title: 'Job-Description-9-2025', contract: 'Employment-Contract-9-2025', date: '2025-05-27', author: 'Ethan Collins', status: 'Pending' },
    { num: 10, title: 'Job-Description-10-2025', contract: 'Employment-Contract-10-2025', date: '2025-05-27', author: 'Ethan Collins', status: 'Pending' },
  ];

  const jdDocs = titles.map((item, idx) => ({
    id: `ONB-JD-${4837 + idx}`,
    onboardingDocId: `${4837 + idx}`,
    documentTitle: item.title,
    category: 'job-description',
    documentType: 'Job Description',
    author: item.author,
    submissionDate: item.date,
    dateCreated: '2025-04-20',
    effectivityDate: '2025-05-27',
    status: item.status,
    submissionType: idx % 2 === 0 ? 'File Upload' : 'System Content',
    attachments: [{ name: `${item.title}.pdf`, size: '1.7MB' }],
    content: {
      jobTitle: 'Job Title Here',
      aboutCompany: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin egestas aliquet lorem, maximus euismod orci sagittis nec. Etiam consectetur aliquet lectus, sed scelerisque justo malesuada ut. Pellentesque sollicitudin iaculis purus, non tempus orci fringilla eget. Integer vitae scelerisque massa. Sed efficitur ex sollicitudin, pulvinar tellus eget, faucibus magna.',
      jobSummary: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin egestas aliquet lorem, maximus euismod orci sagittis nec. Etiam consectetur aliquet lectus, sed scelerisque justo malesuada ut.',
      keyResponsibilities: [
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      ],
    },
    remarks: 'Lorem ipsum dolor sit amet.',
    actionedBy: item.status !== 'Pending' ? 'John Collins Doe' : '',
  }));

  const contractDocs = titles.map((item, idx) => ({
    id: `ONB-EC-${4837 + idx}`,
    onboardingDocId: `${4837 + idx}`,
    documentTitle: item.contract,
    category: 'employment-contract',
    documentType: 'Employment Contract',
    author: item.author,
    submissionDate: item.date,
    dateCreated: '2025-04-20',
    effectivityDate: '2025-05-27',
    status: item.status,
    submissionType: idx % 2 === 0 ? 'File Upload' : 'System Content',
    attachments: [{ name: `${item.contract}.pdf`, size: '1.7MB' }],
    content: {
      jobTitle: 'Employment Agreement',
      aboutCompany: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin egestas aliquet lorem, maximus euismod orci sagittis nec. Etiam consectetur aliquet lectus, sed scelerisque justo malesuada ut.',
      jobSummary: 'Official Employment Contract covering terms of service, regular working hours, compensation, and statutory benefits.',
      keyResponsibilities: [
        'Adhere to corporate code of conduct and information security policies.',
        'Perform professional duties with diligence and fidelity.',
      ],
    },
    remarks: 'Lorem ipsum dolor sit amet.',
    actionedBy: item.status !== 'Pending' ? 'John Collins Doe' : '',
  }));

  return [...jdDocs, ...contractDocs];
}

/* --------------------------------------------------- Self-Inquiry Seeds (Part 5) */

export function seedLoanInquiries(employees = seedEmployees()) {
  const definitions = [
    { code: 'LN-GOV-001', name: 'PAG-IBIG Housing Loan', type: 'Government Loan', principal: 2000000, terms: 60, rate: 5, interest: 100000, total: 2100000, start: '01/01/2025', end: '12/31/2025', deduction: 5000, mode: 'Monthly', freq: 'Every Payroll', manual: 20000, computed: 20000, balance: 2080000, status: 'ACTIVE', statusDate: '04/23/2025' },
    { code: 'LN-COM-001', name: 'Company Loan 1', type: 'Company Loan', principal: 100000, terms: 15, rate: 5, interest: 5000, total: 105000, start: '01/01/2025', end: '12/31/2025', deduction: 1000, mode: 'Quarterly', freq: 'Every Payroll', manual: 12000, computed: 12000, balance: 93000, status: 'ACTIVE', statusDate: '04/23/2025' },
    { code: 'LN-GOV-002', name: 'SSS Calamity Loan', type: 'Government Loan', principal: 15000, terms: 60, rate: 5, interest: 750, total: 15750, start: '01/01/2025', end: '12/31/2025', deduction: 5000, mode: 'Monthly', freq: 'Every Payroll', manual: 10000, computed: 10000, balance: 5750, status: 'ACTIVE', statusDate: '04/23/2025' },
    { code: 'LN-COM-002', name: 'Company Loan 2', type: 'Company Loan', principal: 100000, terms: 15, rate: 5, interest: 5000, total: 105000, start: '01/01/2025', end: '12/31/2025', deduction: 1000, mode: 'Quarterly', freq: 'Every Payroll', manual: 12000, computed: 12000, balance: 93000, status: 'ACTIVE', statusDate: '04/23/2025' },
    { code: 'LN-GOV-003', name: 'PAG-IBIG Car Loan', type: 'Government Loan', principal: 2000000, terms: 60, rate: 5, interest: 100000, total: 2100000, start: '01/01/2025', end: '12/31/2025', deduction: 5000, mode: 'Monthly', freq: 'Every Payroll', manual: 100000, computed: 100000, balance: 2000000, status: 'ACTIVE', statusDate: '04/23/2025' },
    { code: 'LN-COM-003', name: 'Company Loan 3', type: 'Company Loan', principal: 100000, terms: 15, rate: 5, interest: 5000, total: 105000, start: '01/01/2025', end: '12/31/2025', deduction: 1000, mode: 'Quarterly', freq: 'Every Payroll', manual: 12000, computed: 12000, balance: 93000, status: 'ACTIVE', statusDate: '04/23/2025' },
    { code: 'LN-GOV-004', name: 'SSS Educational Loan', type: 'Government Loan', principal: 200000, terms: 60, rate: 5, interest: 10000, total: 210000, start: '01/01/2025', end: '12/31/2025', deduction: 5000, mode: 'Monthly', freq: 'Every Payroll', manual: 100000, computed: 100000, balance: 100000, status: 'ACTIVE', statusDate: '04/23/2025' },
    { code: 'LN-COM-004', name: 'Company Loan 4', type: 'Company Loan', principal: 100000, terms: 15, rate: 5, interest: 5000, total: 105000, start: '01/01/2025', end: '12/31/2025', deduction: 1000, mode: 'Quarterly', freq: 'Every Payroll', manual: 12000, computed: 12000, balance: 93000, status: 'ACTIVE', statusDate: '04/23/2025' },
    { code: 'LN-GOV-005', name: 'SSS Salary Loan', type: 'Government Loan', principal: 15000, terms: 60, rate: 5, interest: 750, total: 15750, start: '01/01/2025', end: '12/31/2025', deduction: 5000, mode: 'Monthly', freq: 'Every Payroll', manual: 15750, computed: 15750, balance: 0, status: 'CLOSED', statusDate: '04/23/2025' },
    { code: 'LN-COM-005', name: 'Company Loan 5', type: 'Company Loan', principal: 100000, terms: 15, rate: 5, interest: 5000, total: 105000, start: '01/01/2025', end: '11/15/2025', deduction: 5000, mode: 'Quarterly', freq: 'Every Payroll', manual: 105000, computed: 105000, balance: 0, status: 'CLOSED', statusDate: '04/23/2025' },
  ];

  const payoutPeriods = [
    '01/30/2025', '02/28/2025', '03/30/2025', '04/30/2025', '05/30/2025',
    '06/30/2025', '07/30/2025', '08/30/2025', '09/30/2025', '10/30/2025',
    '11/30/2025', '12/30/2025', '01/30/2026', '02/28/2026', '03/30/2026'
  ];

  // Every schedule belongs to somebody: a loan with no `employeeId` shows on
  // every employee's inquiry and is invisible to payroll, which is exactly the
  // per-employee filter defect the other seeds were fixed for.
  return definitions.map((def, index) => {
    const owner = employees[index % employees.length] || {};
    return {
    id: def.code,
    employeeId: owner.employeeId,
    employeeCode: owner.employeeCode,
    employeeName: owner.name,
    applicationDate: '01/01/2025',
    transactionNumber: def.code,
    loanName: def.name,
    loanType: def.type,
    principalAmount: def.principal,
    loanTerms: def.terms,
    interestRate: def.rate,
    interestAmount: def.interest,
    totalLoan: def.total,
    periodStartDate: def.start,
    periodEndDate: def.end,
    deductionAmount: def.deduction,
    paymentMode: def.mode,
    frequency: def.freq,
    accumulatedPaymentManual: def.manual,
    accumulatedPaymentComputed: def.computed,
    balance: def.balance,
    status: def.status,
    statusDate: def.statusDate,
    // A collection never exceeds the outstanding balance: the schedule stops
    // once the loan is settled rather than listing periods that collect nothing.
    deductionMatrix: payoutPeriods.map((period, periodIndex) => ({
      payoutPeriod: period,
      deductionAmount: Math.max(0, Math.min(def.deduction, def.total - def.deduction * periodIndex)),
    })).filter(row => row.deductionAmount > 0),
    };
  });
}

export function seedAttendanceSummaries() {
  const dates = [
    { date: '11/06/2025', timeIn: '09:00:00', timeOut: '18:00:00', workedHours: 8.0, breakIn: '12:00:00', breakOut: '13:00:00', breakHours: 1.0, ot: 0.0, tardHours: 0.0, tardMins: 0, underHours: 0.0, underMins: 0, tool: 'Web', loc: 'Head Office', status: 'Present' },
    { date: '11/05/2025', timeIn: '09:00:00', timeOut: '18:15:00', workedHours: 8.25, breakIn: '12:00:00', breakOut: '13:00:00', breakHours: 1.0, ot: 0.25, tardHours: 0.0, tardMins: 0, underHours: 0.0, underMins: 0, tool: 'Web', loc: 'Head Office', status: 'Present' },
    { date: '11/04/2025', timeIn: '09:00:00', timeOut: '18:30:00', workedHours: 8.5, breakIn: '12:00:00', breakOut: '13:00:00', breakHours: 1.0, ot: 0.5, tardHours: 0.0, tardMins: 0, underHours: 0.0, underMins: 0, tool: 'Biometrics', loc: 'Head Office', status: 'Present' },
    { date: '11/03/2025', timeIn: '-', timeOut: '-', workedHours: 0.0, breakIn: '-', breakOut: '-', breakHours: 0.0, ot: 0.0, tardHours: 0.0, tardMins: 0, underHours: 0.0, underMins: 0, tool: '-', loc: '-', status: 'Absent' },
    { date: '11/02/2025', timeIn: '09:00:00', timeOut: '18:00:00', workedHours: 8.0, breakIn: '12:00:00', breakOut: '13:00:00', breakHours: 1.0, ot: 0.0, tardHours: 0.0, tardMins: 0, underHours: 0.0, underMins: 0, tool: 'Mobile', loc: 'Remote', status: 'Present' },
    { date: '11/01/2025', timeIn: '-', timeOut: '-', workedHours: 0.0, breakIn: '-', breakOut: '-', breakHours: 0.0, ot: 0.0, tardHours: 0.0, tardMins: 0, underHours: 0.0, underMins: 0, tool: '-', loc: '-', status: 'Holiday' },
    { date: '02/11/2025', timeIn: '01:15:00 PM', timeOut: '06:55:30 PM', workedHours: 5.67, breakIn: '04:00:00 PM', breakOut: '04:15:00 PM', breakHours: 0.25, ot: 0.0, tardHours: 0.33, tardMins: 20, underHours: 0.0, underMins: 0, tool: 'Web', loc: 'Head Office', status: 'Late' },
    { date: '02/11/2025', timeIn: '10:46:07 AM', timeOut: '12:00:05 PM', workedHours: 1.23, breakIn: '-', breakOut: '-', breakHours: 0.0, ot: 0.0, tardHours: 0.33, tardMins: 20, underHours: 0.67, underMins: 40, tool: 'Biometrics', loc: 'Head Office', status: 'Undertime' },
    { date: '02/11/2025', timeIn: '10:46:07 AM', timeOut: '06:55:30 PM', workedHours: 7.15, breakIn: '12:00:00 PM', breakOut: '01:00:00 PM', breakHours: 1.0, ot: 0.0, tardHours: 0.33, tardMins: 20, underHours: 0.0, underMins: 0, tool: 'Web', loc: 'Head Office', status: 'Late' },
    { date: '02/11/2025', timeIn: '10:46:07 AM', timeOut: '06:55:30 PM', workedHours: 7.15, breakIn: '12:00:00 PM', breakOut: '01:00:00 PM', breakHours: 1.0, ot: 0.0, tardHours: 0.33, tardMins: 20, underHours: 0.0, underMins: 0, tool: 'Mobile', loc: 'Remote', status: 'Late' },
  ];

  return {
    cutoffLabel: 'January 15, 2025',
    currentPeriod: 'January 1-15, 2025',
    periods: ['January 1-15, 2025', 'January 16-31, 2025', 'February 1-15, 2025'],
    kpi: {
      totalWorkedHours: '100.00',
      totalOvertimeHours: '0.75',
      totalAbsences: '1',
      totalLeaveDays: '1',
      tardinessHours: '1.67',
      tardinessMins: '100',
      undertimeHours: '3.33',
      undertimeMins: '200',
      workedHoursTotal: '80.50',
    },
    logs: dates,
  };
}

/**
 * Employee certifications (HT089, reported by HT189).  A certification may
 * expire, so the report derives its own status from the expiry date rather
 * than storing one that would go stale on the next reload.
 */
export function seedEmployeeCertifications(employees = seedEmployees()) {
  const catalogue = [
    { name: 'Certified Public Accountant (CPA)', issuer: 'Professional Regulation Commission', dateTaken: '2019-05-18', dateReleased: '2019-08-02', expiry: '2028-08-02' },
    { name: 'Occupational Safety and Health (OSH) Officer', issuer: 'DOLE Bureau of Working Conditions', dateTaken: '2023-02-11', dateReleased: '2023-03-15', expiry: '2026-03-15' },
    { name: 'ISO 27001 Lead Implementer', issuer: 'PECB', dateTaken: '2024-09-07', dateReleased: '2024-10-01', expiry: '2027-10-01' },
    { name: 'Basic Life Support / First Aid', issuer: 'Philippine Red Cross', dateTaken: '2025-01-20', dateReleased: '2025-02-05', expiry: '2027-02-05' },
  ];
  return employees.flatMap((employee, employeeIndex) => catalogue
    .filter((_, index) => (employeeIndex + index) % 2 === 0)
    .map((entry, index) => ({
      certificationId: `cert-${employee.employeeId}-${index + 1}`,
      employeeId: employee.employeeId,
      certificateName: entry.name,
      issuingBody: entry.issuer,
      certificateNumber: `${entry.name.slice(0, 3).toUpperCase()}-${2000 + employeeIndex * 7 + index}`,
      dateTaken: entry.dateTaken,
      dateReleased: entry.dateReleased,
      expirationDate: entry.expiry,
      remarks: '',
    })));
}

/**
 * Employee medical records (HT087, reported by HT194).  Past and present
 * conditions live in the same list; the report separates them by date.
 */
export function seedMedicalRecords(employees = seedEmployees()) {
  const bloodTypes = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-'];
  const entries = [
    { dateRecorded: '2026-02-14', condition: 'Annual Physical Examination', diagnosis: 'Fit to work', findings: 'Normal chest X-ray, normal CBC', contact: 'Dr. Ramona Silva, Company Physician', remarks: 'Cleared without restriction' },
    { dateRecorded: '2025-07-30', condition: 'Allergies', diagnosis: 'Allergic rhinitis', findings: 'Reactive to dust mites', contact: 'Dr. Alvin Cruz, Allergology', remarks: 'Maintenance antihistamine' },
    { dateRecorded: '2024-11-08', condition: 'Immunizations', diagnosis: 'Influenza vaccination', findings: 'No adverse reaction', contact: 'Company Clinic', remarks: 'Annual booster due Nov 2026' },
  ];
  return employees.flatMap((employee, employeeIndex) => entries
    .filter((_, index) => (employeeIndex + index) % 2 === 0)
    .map((entry, index) => ({
      recordId: `med-${employee.employeeId}-${index + 1}`,
      employeeId: employee.employeeId,
      bloodType: bloodTypes[employeeIndex % bloodTypes.length],
      ...entry,
    })));
}

/**
 * Uploaded company policies (HT197).  The report lists what was published and
 * when, which is why each row carries its own upload and effectivity dates.
 */
export function seedCompanyPolicies() {
  return [
    { policyId: 'pol-001', policyCode: 'POL-HR-001', title: 'Code of Conduct and Discipline', category: 'Human Resources', version: '3.1', dateUploaded: '2026-01-12', effectivityDate: '2026-02-01', uploadedBy: 'Ethan Collins', fileName: 'code-of-conduct-v3.1.pdf', status: 'Active' },
    { policyId: 'pol-002', policyCode: 'POL-HR-002', title: 'Leave and Attendance Policy', category: 'Human Resources', version: '2.4', dateUploaded: '2026-03-04', effectivityDate: '2026-04-01', uploadedBy: 'Ethan Collins', fileName: 'leave-attendance-v2.4.pdf', status: 'Active' },
    { policyId: 'pol-003', policyCode: 'POL-IT-001', title: 'Information Security and Acceptable Use', category: 'Information Technology', version: '1.8', dateUploaded: '2025-11-20', effectivityDate: '2026-01-01', uploadedBy: 'John Collins Doe', fileName: 'infosec-acceptable-use-v1.8.pdf', status: 'Active' },
    { policyId: 'pol-004', policyCode: 'POL-FIN-001', title: 'Travel and Reimbursement Policy', category: 'Finance', version: '2.0', dateUploaded: '2025-09-15', effectivityDate: '2025-10-01', uploadedBy: 'Sophia Ramirez', fileName: 'travel-reimbursement-v2.0.pdf', status: 'Active' },
    { policyId: 'pol-005', policyCode: 'POL-HR-003', title: 'Work From Home Arrangement', category: 'Human Resources', version: '1.2', dateUploaded: '2024-06-10', effectivityDate: '2024-07-01', uploadedBy: 'Ethan Collins', fileName: 'wfh-arrangement-v1.2.pdf', status: 'Superseded' },
    { policyId: 'pol-006', policyCode: 'POL-OSH-001', title: 'Occupational Safety and Health Programme', category: 'Safety and Health', version: '1.0', dateUploaded: '2026-05-22', effectivityDate: '2026-06-01', uploadedBy: 'Liam Johnson', fileName: 'osh-programme-v1.0.pdf', status: 'Active' },
  ];
}

/**
 * The employee's contribution record, looked up in the statutory version in
 * force rather than typed in. `payrollEngine` performs the same lookup for the
 * payslip, so the Benefits screen and the payslip can never disagree.
 */
const STATUTORY_SEED_DATE = '2025-01-01';
function seededStatutory(pay = {}) {
  const data = seedStatutoryData();
  const basis = Number(pay.monthlyRate) || Number(pay.monthlyBasic) || 0;
  const sss = sssContribution(effectiveVersionIn(data, 'sss', STATUTORY_SEED_DATE), basis);
  const phic = rateContribution(effectiveVersionIn(data, 'philhealth', STATUTORY_SEED_DATE), basis);
  const hdmf = pay.withHdmf === 'No' ? { employee: 0, employer: 0 } : rateContribution(effectiveVersionIn(data, 'pagibig', STATUTORY_SEED_DATE), basis);
  return {
    sssEmployee: sss.regularEmployee, sssEmployer: sss.regularEmployer, ecc: sss.ec,
    sssMpfEmployee: sss.mpfEmployee, sssMpfEmployer: sss.mpfEmployer,
    phicEmployee: phic.employee, phicEmployer: phic.employer,
    hdmfEmployee: hdmf.employee, hdmfEmployer: hdmf.employer,
  };
}

/**
 * Salary information is the employee's own compensation record, and payroll
 * prices its lines from it. Both this screen and `payrollEngine` therefore read
 * one source: the roster's `payroll` block supplies the pay type and the
 * derived annual / monthly / daily / hourly / per-minute rates, so a rate can
 * never say one thing in Benefits and another on a payslip.
 */
export function seedSalaryInformation(employees = seedEmployees()) {
  return employees.map(emp => {
    const roster = employeeRoster.find(row => row.employeeId === emp.employeeId);
    const pay = roster?.payroll || {};
    const basic = pay.payType === 'Monthly' ? Number(pay.monthlyBasic) || 0 : Number(pay.payType === 'Daily' ? pay.dailyRate : pay.hourlyRate) || 0;
    const previous = { annual: pay.annualRate * 0.92, monthly: pay.monthlyRate * 0.92 };
    const money = value => Number((Number(value) || 0).toFixed(2));

    return {
      id: `sal-${emp.employeeId}`,
      employeeId: emp.employeeId,
      employeeCode: emp.employeeCode,
      employeeName: emp.name,
      department: emp.department || 'IT Department',
      division: emp.division || 'Product Development',
      jobTitle: emp.position || 'Software Developer',
      employmentType: emp.employmentType || 'Full Time Philippines',
      employeeGroup: roster?.group || 'Rank and File',
      dateHired: roster?.dateHired || '',
      basicPay: [
        { dateCreated: '01/01/2025', payType: pay.payType, basicPayAmount: basic, workDays: pay.factorDays, workDaysType: 'Per Year', annualRate: pay.annualRate, monthlyRate: pay.monthlyRate, dailyRate: pay.dailyRate, hourlyRate: pay.hourlyRate, perMinuteRate: pay.perMinuteRate, mwe: pay.mwe, location: roster?.site || 'Head Office', effectivityDate: '01/01/2025', startMonth: 'January', startYear: '2025' },
        { dateCreated: '01/01/2024', payType: pay.payType, basicPayAmount: money(basic * 0.92), workDays: pay.factorDays, workDaysType: 'Per Year', annualRate: money(previous.annual), monthlyRate: money(previous.monthly), dailyRate: money(previous.annual / (pay.factorDays || 261)), hourlyRate: money(previous.annual / (pay.factorDays || 261) / (pay.workHoursPerDay || 8)), perMinuteRate: money(previous.annual / (pay.factorDays || 261) / (pay.workHoursPerDay || 8) / 60), mwe: pay.mwe, location: roster?.site || 'Head Office', effectivityDate: '01/01/2024', startMonth: 'January', startYear: '2024' },
      ],
      // The earning codes and labels are the ones the Part 6 mock prints; the
      // rows after them are the pay items the payroll engine actually prices,
      // classified the way Earning Management classifies them.
      earnings: [
        { dateCreated: '01/01/2025', earningCode: 'EXA-001', earningName: 'Salary', earningsAmount: pay.monthlyRate, classification: 'Taxable Basic', frequency: 'Monthly', taxability: 'Taxable', effectivityDate: '01/01/2025', periodStart: '01/01/2025', periodEnd: '12/31/2025', holdDate: '-' },
        { dateCreated: '01/01/2025', earningCode: 'EXA-002', earningName: 'Uniform and Clothing Allowance', earningsAmount: 700.00, classification: 'De Minimis', frequency: 'Monthly', taxability: 'Non-taxable', effectivityDate: '01/01/2025', periodStart: '01/01/2025', periodEnd: '12/31/2025', holdDate: '-' },
        { dateCreated: '01/01/2025', earningCode: 'EXA-003', earningName: '13th-month', earningsAmount: pay.monthlyRate, classification: 'Taxable Bonus', frequency: 'Annually', taxability: 'Taxable', effectivityDate: '01/01/2025', periodStart: '01/01/2025', periodEnd: '12/31/2025', holdDate: '-' },
        { dateCreated: '01/01/2025', earningCode: 'EXA-004', earningName: 'Transportation Reimbursement', earningsAmount: 2500.00, classification: 'Reimbursement', frequency: 'Monthly', taxability: 'Non-taxable', effectivityDate: '01/01/2025', periodStart: '01/01/2025', periodEnd: '12/31/2025', holdDate: '-' },
        { dateCreated: '01/01/2025', earningCode: 'EXA-005', earningName: 'Rice Subsidy', earningsAmount: 2000.00, classification: 'De Minimis', frequency: 'Monthly', taxability: 'Non-taxable', effectivityDate: '01/01/2025', periodStart: '01/01/2025', periodEnd: '12/31/2025', holdDate: '-' },
        { dateCreated: '01/01/2025', earningCode: 'EXA-006', earningName: 'Meal Allowance', earningsAmount: 1500.00, classification: 'Taxable Allowance', frequency: 'Monthly', taxability: 'Taxable', effectivityDate: '01/01/2025', periodStart: '01/01/2025', periodEnd: '12/31/2025', holdDate: '-' },
      ],
      bonuses: [
        { name: '13th Month Pay (T)', type: '13th Month Pay', taxability: 'Non-taxable up to ceiling', amount: pay.monthlyRate },
        { name: 'Performance Bonus', type: 'Performance Bonus', taxability: 'Non-taxable up to ceiling', amount: money((pay.monthlyRate || 0) * 0.5) },
      ],
      // Contributions are looked up in the effective statutory version rather
      // than typed in, so this record can never disagree with the payslip.
      statutoryDeductions: [{ payPeriod: '01/01/2025', effectivityDate: '01/01/2025', holdDate: '-', ...seededStatutory(pay) }],
      companyDeductions: [
        { deductionName: 'Uniform Deduction', amountOfDeduction: 250.00, startDate: '01/01/2025', endDate: '06/30/2025', numberOfDeductions: 12, totalDeductionAmount: 3000.00, accumulatedAmount: 1500.00, totalBalance: 1500.00 },
        { deductionName: 'HMO Dependent Premium', amountOfDeduction: 800.00, startDate: '01/01/2025', endDate: '12/31/2025', numberOfDeductions: 24, totalDeductionAmount: 19200.00, accumulatedAmount: 9600.00, totalBalance: 9600.00 },
      ],
      loans: [
        { payItem: 'Company Emergency Loan', amount: 2083.33, startDate: '01/01/2025', endDate: '12/31/2025', dateGranted: '12/15/2024', referenceNumber: `LN-${emp.employeeId}-01`, principal: 25000.00, interest: 0.00, totalLoan: 25000.00, accumulatedManual: 0.00, accumulatedComputed: 8333.32, balance: 16666.68, holdDate: '-' },
      ],
      hdmfContributions: [
        { effectivityDate: '01/01/2025', holdDate: '-', employeeContribution: pay.hdmfEmployeeContribution || 0, employerContribution: pay.hdmfEmployerContribution || 0 },
      ],
      variableAllowances: [
        { dateCreated: '01/01/2025', amount: 3000.00, unitBasis: 'Monthly', workDays: pay.factorDays, workDaysType: 'Work Days per Year', workHoursPerDay: pay.workHoursPerDay, annualRate: 36000.00, monthlyRate: 3000.00, dailyRate: money(36000 / (pay.factorDays || 261)), hourlyRate: money(36000 / (pay.factorDays || 261) / (pay.workHoursPerDay || 8)), perMinuteRate: money(36000 / (pay.factorDays || 261) / (pay.workHoursPerDay || 8) / 60), effectivityDate: '01/01/2025', startMonth: 'January', startYear: '2025', periodStart: '01/01/2025' },
      ],
    };
  });
}

export function seedEmployeeBenefits(employees = seedEmployees()) {
  const catalog = [
    { code: 'EMB-0001', name: 'HMO', amount: 10000.00, startDate: '01/01/2025', endDate: '12/31/2025', status: 'Active' },
    { code: 'EMB-0002', name: '14th Month Pay', amount: 10000.00, startDate: '01/01/2025', endDate: '12/31/2025', status: 'Active' },
    { code: 'EMB-0003', name: 'Training & Development', amount: 10000.00, startDate: '01/01/2025', endDate: '12/31/2025', status: 'Active' },
    { code: 'EMB-0004', name: 'HMO Dependent Extension', amount: 10000.00, startDate: '01/01/2025', endDate: '12/31/2025', status: 'Active' },
    { code: 'EMB-0005', name: 'Wellness Subsidy', amount: 10000.00, startDate: '07/01/2026', endDate: '12/31/2026', status: 'Upcoming' },
    { code: 'EMB-0006', name: 'Executive Checkup Voucher', amount: 10000.00, startDate: '01/01/2024', endDate: '12/31/2024', status: 'Expired' },
  ];

  return employees.map((emp, idx) => {
    const assigned = catalog.slice(0, 3 + (idx % 3));
    return {
      id: `ben-${emp.employeeId}`,
      employeeId: emp.employeeId,
      employeeCode: emp.employeeCode || `00112233${40 + idx}`,
      employeeName: emp.name,
      department: emp.department || 'IT Department',
      division: emp.division || 'Product Development',
      jobTitle: emp.position || 'Sr. Software Developer',
      benefitsAssigned: assigned.map(b => b.name).join('; '),
      benefits: assigned,
    };
  });
}

export function seedEmployeeAllowances() {
  return [
    { id: 'alw-1', code: 'ALW-MEAL', name: 'Meal & Subsistence Allowance', amount: 3000, frequency: 'Monthly', taxTreatment: 'De Minimis (Non-taxable)', recipients: 85 },
    { id: 'alw-2', code: 'ALW-TRANS', name: 'Transportation / Fuel Allowance', amount: 2500, frequency: 'Monthly', taxTreatment: 'De Minimis (Non-taxable)', recipients: 85 },
    { id: 'alw-3', code: 'ALW-TEL', name: 'Mobile & Internet Allowance', amount: 1500, frequency: 'Monthly', taxTreatment: 'De Minimis (Non-taxable)', recipients: 85 },
    { id: 'alw-4', code: 'ALW-UNIF', name: 'Laundry & Uniform Allowance', amount: 500, frequency: 'Monthly', taxTreatment: 'De Minimis (Non-taxable)', recipients: 85 },
    { id: 'alw-5', code: 'ALW-MED', name: 'Medical Cash Allowance to Dependents', amount: 1000, frequency: 'Monthly', taxTreatment: 'De Minimis (Non-taxable)', recipients: 42 },
  ];
}

export function seedOffboardingChecklistTemplates() {
  return [
    { id: 'chk-1', title: 'Set a meeting with the employee', category: 'HR' },
    { id: 'chk-2', title: 'Inform team members', category: 'Team' },
    { id: 'chk-3', title: 'Inform relevant departments', category: 'Admin' },
    { id: 'chk-4', title: 'Scheduled meeting with the newly hired replacement', category: 'Operations' },
    { id: 'chk-5', title: 'Training new employee', category: 'Operations' },
    { id: 'chk-6', title: 'Share important contacts & resources', category: 'Team' },
    { id: 'chk-7', title: 'Recover asset - Laptop', category: 'IT' },
    { id: 'chk-8', title: 'Recover asset - Access (Drive)', category: 'IT' },
  ];
}

export function seedClearanceApplications(employees = seedEmployees()) {
  const templates = seedOffboardingChecklistTemplates();
  const statuses = ['Approved', 'Pending', 'For Completion', 'For Review', 'Rejected', 'Approved'];
  return employees.slice(0, 6).map((emp, idx) => {
    const status = statuses[idx % statuses.length];
    return {
      id: `clr-00${idx + 1}`,
      applicationDate: '04/23/2025',
      employeeId: emp.employeeId,
      employeeCode: emp.employeeCode || `00112233${40 + idx}`,
      employeeName: emp.name,
      requester: emp.name,
      jobTitle: emp.position || 'Sr. Software Developer',
      division: emp.division || 'Product Development',
      department: emp.department || 'IT Department',
      effectivityDate: '04/30/2025',
      filedBy: 'John Doe',
      actionedBy: status === 'Approved' || status === 'Rejected' ? 'Mark Santos' : '-',
      approverRemarks: status === 'Approved' ? 'All handover requirements verified.' : status === 'Rejected' ? 'Pending IT equipment turnover.' : '-',
      status,
      statusDate: '04/23/2025',
      checklist: templates.map((t, i) => ({ ...t, done: status === 'Approved' || (status === 'For Review' && i < 6) || (status === 'For Completion' && i < 3) })),
      submittedFiles: status !== 'Pending' ? [
        { name: 'sample-proof-document.docx', size: '1.7MB' },
        { name: 'Document example.csv', size: '1.7MB' },
      ] : [],
    };
  });
}

export function seedFinalQuitClaims(employees = seedEmployees()) {
  const statuses = ['Pending', 'For Action', 'Accepted', 'For Release', 'Released', 'Rejected'];
  return employees.slice(0, 6).map((emp, idx) => {
    const status = statuses[idx % statuses.length];
    return {
      id: `qc-00${idx + 1}`,
      applicationDate: '04/23/2025',
      employeeId: emp.employeeId,
      employeeCode: emp.employeeCode || `00112233${40 + idx}`,
      employeeName: emp.name,
      department: emp.department || 'IT Department',
      division: emp.division || 'Product Development',
      jobTitle: emp.position || 'Sr. Software Developer',
      quitClaimStatus: status,
      finalClaimStatus: status === 'Released' ? 'Completed' : 'Pending',
      statusDate: '04/23/2025',
      documentTitle: `Quitclaim & Release - ${emp.name}`,
      author: 'John Doe',
      submissionType: idx % 2 === 0 ? 'File Upload' : 'Manual Input',
      content: 'I hereby declare full and final release of all monetary and administrative obligations from ABC Company Ltd upon completion of separation terms.',
      recipient: {
        fullName: emp.name,
        email: `${emp.name.toLowerCase().replace(/\s+/g, '.')}@abccompany.com`,
        birthday: '1992-05-15',
        acknowledgementNotice: 'Please review and execute the attached quitclaim within 5 working days.',
      },
      files: [{ name: 'sample-proof-document.docx', size: '1.7MB' }],
      signedFile: status === 'Accepted' || status === 'For Release' || status === 'Released' ? { name: 'signed-quitclaim-document.pdf', size: '2.1MB' } : null,
      approverRemarks: status === 'For Release' || status === 'Released' ? 'Verified with payroll.' : '-',
      employeeRemarks: status === 'Accepted' ? 'Signed copy attached.' : '-',
    };
  });
}

export function defaultHrmData(companyId = defaultCompanyId) {
  const scope = text(companyId) || defaultCompanyId;
  // Liquidations settle a cash advance, so both are built from one roster and
  // one advance list rather than being seeded independently.
  const employees = seedEmployees();
  const advances = seedCashAdvances(employees);
  return {
    version: 1,
    companyId: scope,
    employees,
    punches: [
      { punchId: `TP-${scope}-EMP-1001-2026-08-14`, companyId: scope, employeeId: 'EMP-1001', workDate: '2026-08-14', clockIn: '08:27', clockOut: '17:02', schedule: '08:00–17:00', status: 'Complete' },
      { punchId: `TP-${scope}-EMP-1002-2026-08-15`, companyId: scope, employeeId: 'EMP-1002', workDate: '2026-08-15', clockIn: '08:00', clockOut: '', schedule: '08:00–17:00', status: 'Missing clock-out' },
      { punchId: `TP-${scope}-EMP-1003-2026-08-14`, companyId: scope, employeeId: 'EMP-1003', workDate: '2026-08-14', clockIn: '', clockOut: '18:04', schedule: '09:00–18:00', status: 'Missing clock-in' },
    ],
    dashboardWidgets: [...DEFAULT_DASHBOARD_WIDGETS],
    attendance: seedAttendance(),
    tasks: seedTasks(),
    reimbursements: seedReimbursements(employees),
    cashAdvances: advances,
    liquidations: seedLiquidations(advances),
    shiftAssignments: seedShiftAssignments(employees),
    companyLoans: seedCompanyLoans(employees),
    governmentLoans: seedGovernmentLoans(employees),
    resignations: seedResignations(employees),
    coeRequests: seedCoeRequests(employees),
    onboardingDocuments: seedOnboardingDocuments(employees),
    loanInquiries: seedLoanInquiries(employees),
    attendanceSummaries: seedAttendanceSummaries(),
    // Timekeeping (P&A Timekeeping Module Part 1). `timeLogs` is the module's
    // only transactional store; every KPI, chart and summary is derived from it.
    timeLogs: seedTimeLogs(employees),
    timeReports: seedTimeReports(employees),
    tkDisputes: seedTkDisputes(employees),
    tkMissingLogs: seedMissingLogs(employees),
    tkLeaveAccruals: seedLeaveAccruals(),
    announcements: seedAnnouncements(),
    timekeeping: seedTimekeepingSettings(),
    salaryInformation: seedSalaryInformation(employees),
    employeeCertifications: seedEmployeeCertifications(employees),
    medicalRecords: seedMedicalRecords(employees),
    companyPolicies: seedCompanyPolicies(),
    employeeBenefits: seedEmployeeBenefits(employees),
    employeeAllowances: seedEmployeeAllowances(),
    offboardingChecklistTemplates: seedOffboardingChecklistTemplates(),
    clearanceApplications: seedClearanceApplications(employees),
    finalQuitClaims: seedFinalQuitClaims(employees),
    leaveBalances: seedLeaveBalances(),
    leaveHistory: seedLeaveHistory(),
    mdoBalances: seedMdoBalances(),
    mdoHistory: seedMdoHistory(),
    shifts: SHIFT_CATALOG.map(shift => ({ ...shift })),
    wellness: seedWellness(),
    mdo: seedMdo(),
    calendarEvents: seedCalendar(),
    onboarding: seedOnboarding(),
    // Team validations (HT100) and leave plans (HT116) start empty: both are
    // records a user creates, never seeded history.
    teamValidations: [],
    leavePlans: [],
    reportRuns: [],
  };
}

/** Every array persisted verbatim; a saved value only wins when it is a list. */
const listFields = ['employees', 'punches', 'tasks', 'leaveBalances', 'leaveHistory', 'mdoBalances', 'mdoHistory', 'shifts', 'calendarEvents', 'reportRuns', 'reimbursements', 'cashAdvances', 'liquidations', 'shiftAssignments', 'companyLoans', 'governmentLoans', 'resignations', 'coeRequests', 'onboardingDocuments', 'loanInquiries', 'salaryInformation', 'employeeCertifications', 'medicalRecords', 'companyPolicies', 'employeeBenefits', 'employeeAllowances', 'offboardingChecklistTemplates', 'clearanceApplications', 'finalQuitClaims', 'teamValidations', 'leavePlans', 'timeLogs', 'timeReports', 'tkDisputes', 'tkMissingLogs', 'tkLeaveAccruals', 'announcements'];

function dataKey(companyId) {
  return `${HRM_DATA_KEY_PREFIX}:${encodeURIComponent(text(companyId) || defaultCompanyId)}`;
}

export function readHrmData(companyId = defaultCompanyId, storage) {
  const defaults = defaultHrmData(companyId);
  const saved = readJson(storage, dataKey(companyId), null);
  if (!saved || saved.companyId !== defaults.companyId) return defaults;
  const merged = {
    ...defaults,
    ...saved,
    wellness: { ...defaults.wellness, ...(saved.wellness || {}), events: Array.isArray(saved.wellness?.events) ? saved.wellness.events : defaults.wellness.events, articles: Array.isArray(saved.wellness?.articles) ? saved.wellness.articles : defaults.wellness.articles, interests: Array.isArray(saved.wellness?.interests) ? saved.wellness.interests : defaults.wellness.interests, participation: Array.isArray(saved.wellness?.participation) ? saved.wellness.participation : defaults.wellness.participation, checkins: Array.isArray(saved.wellness?.checkins) ? saved.wellness.checkins : defaults.wellness.checkins },
    mdo: { ...defaults.mdo, ...(saved.mdo || {}), plans: Array.isArray(saved.mdo?.plans) ? saved.mdo.plans : defaults.mdo.plans, enrollments: Array.isArray(saved.mdo?.enrollments) ? saved.mdo.enrollments : defaults.mdo.enrollments },
    dashboardWidgets: Array.isArray(saved.dashboardWidgets) ? [...new Set(saved.dashboardWidgets)] : defaults.dashboardWidgets,
    attendance: { ...defaults.attendance, ...(saved.attendance || {}), clock: { ...defaults.attendance.clock, ...(saved.attendance?.clock || {}) } },
    onboarding: { ...defaults.onboarding, ...(saved.onboarding || {}), templates: Array.isArray(saved.onboarding?.templates) ? saved.onboarding.templates : defaults.onboarding.templates, records: Array.isArray(saved.onboarding?.records) ? saved.onboarding.records : defaults.onboarding.records },
  };
  listFields.forEach(field => {
    merged[field] = Array.isArray(saved[field]) ? saved[field] : defaults[field];
  });
  return merged;
}

export function writeHrmData(companyId, data, storage) {
  const next = { ...clone(data), companyId: text(companyId) || defaultCompanyId };
  return writeJson(storage, dataKey(companyId), next);
}

export function updateHrmData(companyId, updater, storage) {
  const current = readHrmData(companyId, storage);
  const next = updater(clone(current)) || current;
  return writeHrmData(companyId, next, storage);
}

/** Stable id for a record this module creates. */
export function createHrmId(prefix = 'hrm') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function findEmployee(data = {}, employeeId) {
  const wanted = text(employeeId);
  return (data.employees || []).find(employee => text(employee.employeeId) === wanted) || null;
}

export function shiftById(data = {}, shiftId) {
  const wanted = text(shiftId);
  return (data.shifts || SHIFT_CATALOG).find(shift => text(shift.shiftId) === wanted) || null;
}

/**
 * Leave balances for one employee, ordered by LEAVE_TYPES and carrying the
 * derived remaining figure the balance cards and the details panel share.
 */
/**
 * Days one employee has committed per leave type, read from the request store.
 *
 * Approved days are spent.  Pending days are ring-fenced as well, so a second
 * application cannot be filed against credits the first one already claimed
 * while it waits for its approver.
 */
export function leaveUsageFor(requests = [], employeeId) {
  const wanted = text(employeeId);
  const usage = new Map();
  requests.forEach(request => {
    if (request.requestType !== REQUEST_TYPES.LEAVE) return;
    if (text(request.employeeId) !== wanted) return;
    const details = request.requestDetails || {};
    const leaveType = text(details.leaveType);
    const days = Number(details.filedDays || 0) || 0;
    if (!leaveType || !days) return;
    const entry = usage.get(leaveType) || { approved: 0, pending: 0 };
    if (request.status === REQUEST_STATUSES.APPROVED) entry.approved += days;
    else if (request.status === REQUEST_STATUSES.PENDING_APPROVAL) entry.pending += days;
    usage.set(leaveType, entry);
  });
  return usage;
}

/**
 * Leave balances for one employee.
 *
 * `used` is the masterfile's opening usage plus every day approved through
 * the request store, and `remaining` additionally holds back the days already
 * committed to applications still awaiting a decision.  Passing `requests` is
 * what makes an approval show up on the balance it spends; without them the
 * function still answers from the masterfile alone.
 */
export function leaveBalancesFor(data = {}, employeeId, requests = []) {
  const wanted = text(employeeId);
  const rows = (data.leaveBalances || []).filter(row => text(row.employeeId) === wanted);
  const usage = leaveUsageFor(requests, wanted);
  return LEAVE_TYPES
    .map(leaveType => rows.find(row => row.leaveType === leaveType))
    .filter(Boolean)
    .map(row => {
      const entry = usage.get(row.leaveType) || { approved: 0, pending: 0 };
      const used = Number(row.used || 0) + entry.approved;
      const forfeited = Number(row.forfeited || 0);
      const converted = Number(row.converted || 0);
      return {
        ...row,
        used,
        pending: entry.pending,
        forfeited,
        converted,
        remaining: Number(row.accrued || 0) - used - forfeited - converted - entry.pending,
      };
    });
}

export function leaveHistoryFor(data = {}, employeeId, leaveType) {
  const wanted = text(employeeId);
  return (data.leaveHistory || []).filter(row => text(row.employeeId) === wanted && (!leaveType || row.leaveType === leaveType));
}

export function mdoBalanceFor(data = {}, employeeId) {
  const wanted = text(employeeId);
  const row = (data.mdoBalances || []).find(entry => text(entry.employeeId) === wanted);
  if (!row) return null;
  return { ...row, remaining: Number(row.earned || 0) - Number(row.used || 0) - Number(row.forfeited || 0) };
}

export function mdoHistoryFor(data = {}, employeeId) {
  const wanted = text(employeeId);
  return (data.mdoHistory || []).filter(row => text(row.employeeId) === wanted);
}

/** Wellness participation totals for one employee's "My Analytics" tab. */
export function wellnessAnalyticsFor(data = {}, employeeId) {
  const wanted = text(employeeId);
  const events = data.wellness?.events || [];
  const joined = (data.wellness?.participation || []).filter(row => text(row.employeeId) === wanted && row.joined);
  const withEvent = joined
    .map(row => ({ ...row, event: events.find(event => event.id === row.eventId) }))
    .filter(row => row.event)
    .sort((left, right) => String(right.joinedAt).localeCompare(String(left.joinedAt)));
  const thisYear = withEvent.filter(row => String(row.joinedAt).startsWith('2026'));
  const thisMonth = thisYear.filter(row => String(row.joinedAt).slice(0, 7) === '2026-05');
  return { history: withEvent, totalJoined: withEvent.length, joinedThisMonth: thisMonth.length, joinedThisYear: thisYear.length };
}

/** Onboarding progress as a completed/total pair — never a written-in count. */
export function onboardingProgress(record) {
  const tasks = record?.tasks || [];
  const completed = tasks.filter(task => task.status === 'Completed' || task.status === 'Attended');
  return { tasks, completed: completed.length, total: tasks.length, percent: tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0 };
}
