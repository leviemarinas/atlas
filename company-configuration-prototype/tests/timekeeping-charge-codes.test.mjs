import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveDailyTimeReports,
  parseTimeToMinutes,
  seedTimeReports,
  validateTimeOverlap,
} from '../src/timekeepingData.js';
import { accessFor, defaultHrmData } from '../src/hrmData.js';

const data = defaultHrmData('cmp-test');
const employees = data.employees || [];
const reports = seedTimeReports(employees);

test('parseTimeToMinutes converts 12h/24h time strings to minutes', () => {
  assert.equal(parseTimeToMinutes('08:30:00 AM'), 510);
  assert.equal(parseTimeToMinutes('08:30 AM'), 510);
  assert.equal(parseTimeToMinutes('12:00:00 PM'), 720);
  assert.equal(parseTimeToMinutes('01:30:00 PM'), 810);
  assert.equal(parseTimeToMinutes('12:00:00 AM'), 0);
  assert.equal(parseTimeToMinutes('05:30:00 PM'), 1050);
});

test('validateTimeOverlap detects overlapping time entries on the same date', () => {
  const existing = [
    { reportId: 'TKR-001', date: '08/16/2026', startTime: '08:30:00 AM', endTime: '11:00:00 AM' },
    { reportId: 'TKR-002', date: '08/16/2026', startTime: '01:00:00 PM', endTime: '05:00:00 PM' },
  ];

  // Overlap cases
  assert.equal(validateTimeOverlap(existing, { date: '08/16/2026', startTime: '09:00:00 AM', endTime: '10:00:00 AM' }), true);
  assert.equal(validateTimeOverlap(existing, { date: '08/16/2026', startTime: '08:00:00 AM', endTime: '09:00:00 AM' }), true);
  assert.equal(validateTimeOverlap(existing, { date: '08/16/2026', startTime: '10:30:00 AM', endTime: '12:00:00 PM' }), true);
  assert.equal(validateTimeOverlap(existing, { date: '08/16/2026', startTime: '02:00:00 PM', endTime: '03:00:00 PM' }), true);

  // Non-overlap cases
  assert.equal(validateTimeOverlap(existing, { date: '08/16/2026', startTime: '11:00:00 AM', endTime: '01:00:00 PM' }), false);
  assert.equal(validateTimeOverlap(existing, { date: '08/16/2026', startTime: '05:00:00 PM', endTime: '07:00:00 PM' }), false);
  assert.equal(validateTimeOverlap(existing, { date: '08/17/2026', startTime: '09:00:00 AM', endTime: '10:00:00 AM' }), false);

  // Exclude self on edit
  assert.equal(validateTimeOverlap(existing, { reportId: 'TKR-001', date: '08/16/2026', startTime: '08:30:00 AM', endTime: '11:00:00 AM' }, 'TKR-001'), false);
});

test('deriveDailyTimeReports groups entries by date and derives earliest/latest and duration', () => {
  const empId = employees[0].employeeId;
  const empReports = reports.filter(r => r.employeeId === empId);
  const daily = deriveDailyTimeReports(empReports, empId);

  assert.ok(daily.length > 0);
  daily.forEach(day => {
    assert.ok(day.date);
    assert.ok(day.timeStart);
    assert.ok(day.timeEnd);
    assert.ok(day.totalDuration > 0);
    assert.ok(day.entriesCount > 0);
    assert.ok(['Pending', 'Approved', 'Rejected'].includes(day.status));
  });
});

test('Time Report Approval is accessible to approver and admin roles but not pure employees', () => {
  const empAccess = accessFor('employee', data, 'EMP-1002');
  assert.equal(empAccess.canApproveTeamRequests, false);

  const approverAccess = accessFor('approver', data, 'EMP-1001');
  assert.equal(approverAccess.canApproveTeamRequests, true);

  const adminAccess = accessFor('client_admin', data, 'EMP-1001');
  assert.equal(adminAccess.canApproveTeamRequests, true);

  const paAccess = accessFor('pa_admin', data, 'EMP-1001');
  assert.equal(paAccess.canApproveTeamRequests, true);
});
