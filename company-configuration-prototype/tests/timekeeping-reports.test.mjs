/**
 * Timekeeping Reports (HT266-HT287) and Shift Schedule Monitoring (HT259).
 *
 * The point of these tests is that every report is derived from the punch
 * record on read. Nothing is stored, so changing a punch has to change the
 * report, and the grand total has to agree with the rows above it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultHrmData, readHrmData, writeHrmData, SHIFT_SCHEDULE_CATALOG, shiftAssignmentStatus } from '../src/hrmData.js';
import { seedTimeLogs } from '../src/timekeepingData.js';
import {
  TK_REQUIRED_DAILY_HOURS,
  logsInPeriod,
  rateForEmployee,
  reportHeadcount,
  reportTotals,
  timekeepingReportCatalog,
} from '../src/timekeepingReports.js';

const data = defaultHrmData('ABC-PH-001');
const employees = data.employees;
const rateFor = id => rateForEmployee(data, id);
const build = definition => definition.build({ logs: data.timeLogs, employees, rateFor });
const find = key => timekeepingReportCatalog.find(entry => entry.key === key);

test('the catalog covers the eight reports the BRD names, each with its own columns', () => {
  assert.equal(timekeepingReportCatalog.length, 8);
  const brdIds = timekeepingReportCatalog.map(entry => entry.brdId);
  ['HT268', 'HT269', 'HT270', 'HT271', 'HT272', 'HT273'].forEach(id => {
    assert.ok(brdIds.includes(id), `${id} has a report`);
  });
  timekeepingReportCatalog.forEach(entry => {
    assert.ok(entry.columns.length > 3, `${entry.key} declares columns`);
    assert.equal(typeof entry.build, 'function');
    // The export writes from `columns`, so every column must be a real key.
    const rows = build(entry);
    if (rows.length) entry.columns.forEach(column => assert.ok(column.key in rows[0], `${entry.key}.${column.key} exists on a row`));
  });
});

test('every report derives rows from the punch record', () => {
  timekeepingReportCatalog.forEach(entry => {
    assert.ok(build(entry).length > 0, `${entry.key} produces rows`);
  });
  // No punches means no report rows anywhere - nothing is stored behind them.
  timekeepingReportCatalog.forEach(entry => {
    assert.equal(entry.build({ logs: [], employees, rateFor }).length, 0, `${entry.key} is empty without punches`);
  });
});

test('DTR summary reconciles required, rendered, leave and unaccounted hours', () => {
  const rows = build(find('dtr-summary'));
  rows.forEach(row => {
    assert.equal(row.requiredHours, row.daysCovered * TK_REQUIRED_DAILY_HOURS);
    assert.ok(row.unaccountedHours >= 0);
    assert.ok(row.workedHours <= row.requiredHours);
  });
});

test('staff attendance day counts add up to the days covered', () => {
  const attendance = build(find('staff-attendance'));
  const dtr = new Map(build(find('dtr-summary')).map(row => [row.employeeId, row]));
  attendance.forEach(row => {
    const covered = dtr.get(row.employeeId).daysCovered;
    assert.equal(row.daysPresent + row.daysAbsent + row.daysOnLeave, covered);
  });
});

test('unit reports price their units from the employee own salary record', () => {
  const employeeId = employees[0].employeeId;
  const rate = rateFor(employeeId);
  assert.ok(rate.hourly > 0 && rate.daily > 0);

  const absence = build(find('absences-unit')).find(row => row.employeeId === employeeId);
  assert.equal(absence.absentHours, absence.absentDays * TK_REQUIRED_DAILY_HOURS);
  assert.equal(absence.amountValue, Number((absence.absentDays * rate.daily).toFixed(2)));

  const tardy = build(find('tardiness-unit')).find(row => row.employeeId === employeeId);
  assert.equal(tardy.tardyHours, Number((tardy.tardyMinutes / 60).toFixed(2)));
  assert.equal(tardy.amountValue, Number((tardy.tardyMinutes * rate.perMinute).toFixed(2)));

  const undertime = build(find('undertime-unit')).find(row => row.employeeId === employeeId);
  assert.equal(undertime.amountValue, Number((undertime.undertimeMinutes * rate.perMinute).toFixed(2)));
});

test('individual overtime splits per OT type and agrees with the overtime summary', () => {
  const individual = build(find('individual-overtime'));
  const summary = build(find('overtime-summary'));
  const totalIndividual = individual.reduce((total, row) => total + row.totalOtHours, 0);
  const totalSummary = summary.reduce((total, row) => total + row.totalOtHours, 0);
  assert.equal(Number(totalIndividual.toFixed(2)), Number(totalSummary.toFixed(2)));
  individual.forEach(row => {
    assert.ok(row.otRate.endsWith('%'));
    assert.ok(row.otPayValue > 0);
  });
});

test('overtime summary splits approved, pending and rejected hours', () => {
  build(find('overtime-summary')).forEach(row => {
    assert.equal(
      Number((row.approvedHours + row.pendingHours + row.rejectedHours).toFixed(2)),
      row.totalOtHours,
    );
  });
});

test('the grand total is derived from the rows on screen', () => {
  const definition = find('staff-attendance');
  const rows = build(definition);
  const totals = reportTotals(definition, rows);
  assert.equal(totals.daysPresent, rows.reduce((total, row) => total + row.daysPresent, 0));
  assert.equal(totals.name, 'GRAND TOTAL');
  // Identity columns stay blank rather than totalling a code.
  assert.equal(totals.employeeCode, '');
  assert.equal(reportTotals(definition, []), null);

  // Narrowing the rows restates the total with them.
  const narrowed = reportTotals(definition, rows.slice(0, 1));
  assert.equal(narrowed.daysPresent, rows[0].daysPresent);
});

test('a peso column totals from its own value companion, not its formatted text', () => {
  const definition = find('absences-unit');
  const rows = build(definition);
  const totals = reportTotals(definition, rows);
  const expected = rows.reduce((total, row) => total + row.amountValue, 0);
  assert.ok(totals.amount.startsWith('₱'));
  assert.equal(totals.amount, `₱${expected.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
});

test('headcount counts distinct employees, not rows', () => {
  const individual = build(find('individual-overtime'));
  assert.ok(individual.length > employees.length, 'OT types give an employee several rows');
  assert.equal(reportHeadcount(individual), new Set(individual.map(row => row.employeeId)).size);
  assert.ok(reportHeadcount(individual) <= employees.length);
});

test('the period window filters punches inclusively', () => {
  const all = data.timeLogs;
  const window = logsInPeriod(all, '2025-01-01', '2025-03-31');
  assert.ok(window.length > 0 && window.length < all.length);
  window.forEach(row => assert.ok(row.date >= '2025-01-01' && row.date <= '2025-03-31'));
  assert.equal(logsInPeriod(all, '', '').length, all.length);
});

test('a corrected punch restates the report rather than leaving a stale total', () => {
  const definition = find('staff-attendance');
  const employee = employees[0];
  const logs = seedTimeLogs([employee]);
  const before = definition.build({ logs, employees: [employee], rateFor })[0];

  const corrected = logs.map(row => (row.status === 'Absent' ? { ...row, status: 'Present', workedHours: 8 } : row));
  const after = definition.build({ logs: corrected, employees: [employee], rateFor })[0];

  assert.ok(before.daysAbsent > 0);
  assert.equal(after.daysAbsent, 0);
  assert.equal(after.daysPresent, before.daysPresent + before.daysAbsent);
});

/* ------------------------------------------------- shift schedule (HT259) */

test('the shift catalog covers the shift options HT259 names', () => {
  const types = SHIFT_SCHEDULE_CATALOG.map(schedule => schedule.shiftType);
  ['Regular (8 Hours)', 'Compressed Work Week', 'Night Shift', '24-Hour Shift', 'Mother Country Shift', 'Other Country Time Shift'].forEach(type => {
    assert.ok(types.includes(type), `${type} is offered`);
  });
  SHIFT_SCHEDULE_CATALOG.forEach(schedule => {
    assert.ok(schedule.timezone, `${schedule.code} carries a timezone`);
    assert.ok(schedule.restDays, `${schedule.code} carries rest days`);
  });
});

test('shift assignments carry the type and timezone the monitor reports on', () => {
  assert.ok(data.shiftAssignments.length > 0);
  data.shiftAssignments.forEach(assignment => {
    assert.ok(assignment.shiftType, 'assignment has a shift type');
    assert.ok(assignment.timezone, 'assignment has a timezone');
  });
  const types = new Set(data.shiftAssignments.map(row => row.shiftType));
  assert.ok(types.size > 1, 'the roster spans several shift types');
});

test('assignment status follows its own dates', () => {
  assert.equal(shiftAssignmentStatus({ startDate: '2030-01-01', endDate: '' }, '2026-08-18'), 'Upcoming');
  assert.equal(shiftAssignmentStatus({ startDate: '2020-01-01', endDate: '2021-01-01' }, '2026-08-18'), 'Expired');
  assert.equal(shiftAssignmentStatus({ startDate: '2020-01-01', endDate: '' }, '2026-08-18'), 'Active');
});

/* --------------------------------------------- HRM report backing stores */

test('the HRM report gaps have persisted backing stores', () => {
  assert.ok(Array.isArray(data.employeeCertifications) && data.employeeCertifications.length > 0);
  assert.ok(Array.isArray(data.medicalRecords) && data.medicalRecords.length > 0);
  assert.ok(Array.isArray(data.companyPolicies) && data.companyPolicies.length > 0);

  // Records are keyed on employeeId, never emp.id.
  data.employeeCertifications.forEach(row => assert.ok(employees.some(employee => employee.employeeId === row.employeeId)));
  data.medicalRecords.forEach(row => assert.ok(employees.some(employee => employee.employeeId === row.employeeId)));

  // Certifications need an expiry for the report to derive validity from.
  data.employeeCertifications.forEach(row => assert.match(row.expirationDate, /^\d{4}-\d{2}-\d{2}$/));
  data.companyPolicies.forEach(row => assert.ok(row.policyCode && row.dateUploaded && row.version));
});

test('leave balances carry converted credits and subtract them from remaining', () => {
  const converted = data.leaveBalances.filter(row => Number(row.converted) > 0);
  assert.ok(converted.length > 0, 'the seed has conversions for HT192 to report');
  converted.forEach(row => {
    assert.ok(row.conversionDate, 'a conversion records its date');
    assert.equal(row.available, row.accrued - row.used - row.forfeited - row.converted);
  });
});

test('the new stores are registered in listFields so they survive a reload', () => {
  const cells = new Map();
  const storage = {
    getItem: key => (cells.has(key) ? cells.get(key) : null),
    setItem: (key, value) => cells.set(key, String(value)),
    removeItem: key => cells.delete(key),
  };

  const current = readHrmData('ABC-PH-001', storage);
  writeHrmData('ABC-PH-001', {
    ...current,
    companyPolicies: [...current.companyPolicies, { policyId: 'pol-new', policyCode: 'POL-QA-001', title: 'QA Policy', version: '1.0', dateUploaded: '2026-08-18' }],
    employeeCertifications: current.employeeCertifications.slice(0, 1),
  }, storage);

  const reloaded = readHrmData('ABC-PH-001', storage);
  assert.ok(reloaded.companyPolicies.some(row => row.policyId === 'pol-new'), 'an added policy is read back');
  assert.equal(reloaded.employeeCertifications.length, 1, 'a trimmed list is read back trimmed');
  assert.ok(Array.isArray(reloaded.medicalRecords) && reloaded.medicalRecords.length > 0, 'an untouched store keeps its defaults');
});
