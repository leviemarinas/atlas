/**
 * The Timekeeping Reports module (BRD HT266-HT287).
 *
 * A report is one entry in `timekeepingReportCatalog`: the columns it shows,
 * the rows it derives and the grand total it closes with live together, and
 * `TimekeepingReportsScreen` renders whichever entry the selector resolves to.
 * There is no bespoke screen per report, and the CSV export is written from
 * the same `columns` rather than from a second copy of the list.
 *
 * Every `build` reads the punch rows it is handed and nothing is stored, so a
 * corrected punch restates all eight reports at once — the same rule the rest
 * of the module follows for `timeLogs`.  HT272 backs two entries because its
 * own description covers both the attendance day counts and the
 * required-against-rendered hours view.
 */

import { TK_OT_TYPES, peso } from './timekeepingData.js';

/** A standard working day. Required hours per day on the DTR reports. */
export const TK_REQUIRED_DAILY_HOURS = 8;

/** Overtime premium per type, shared by the summary and the individual report. */
const OT_MULTIPLIERS = Object.freeze({ Regular: 1.25, 'Night Differential': 1.1, 'Rest Day': 1.3, Holiday: 2 });

const sum = (rows, pick) => rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
const round2 = value => Number((Number(value) || 0).toFixed(2));

/**
 * Daily / hourly rate for one employee, read from the salary information the
 * Benefits module already owns.  The unit reports price their units from this
 * rather than from a constant, so changing a rate restates the report.
 */
export function rateForEmployee(data = {}, employeeId) {
  const record = (data.salaryInformation || []).find(row => row.employeeId === employeeId);
  const basic = (record?.basicPay || [])[0];
  const daily = Number(basic?.dailyRate) || 0;
  const hourly = Number(basic?.hourlyRate) || (daily ? daily / TK_REQUIRED_DAILY_HOURS : 0);
  return { daily, hourly, perMinute: Number(basic?.perMinuteRate) || hourly / 60 };
}

/** Punch rows grouped by employee, in roster order so a report reads stably. */
function groupByEmployee(logs = [], employees = []) {
  const groups = new Map();
  logs.forEach(row => {
    if (!groups.has(row.employeeId)) groups.set(row.employeeId, []);
    groups.get(row.employeeId).push(row);
  });
  return employees
    .filter(employee => groups.has(employee.employeeId))
    .map(employee => ({ employee, rows: groups.get(employee.employeeId) }));
}

/** Identity columns every roster-level report opens with. */
const identityColumns = Object.freeze([
  { key: 'employeeCode', label: 'Employee Number' },
  { key: 'name', label: 'Employee Name' },
  { key: 'department', label: 'Department' },
]);

function identityOf(employee) {
  return {
    employeeId: employee.employeeId,
    employeeCode: employee.employeeCode || '',
    name: employee.name || '',
    department: employee.department || '',
    division: employee.division || 'Product Development',
    employeeGroup: employee.employmentType || '',
  };
}

export const timekeepingReportCatalog = Object.freeze([
  {
    key: 'staff-attendance',
    brdId: 'HT272',
    label: 'Staff Attendance Summary',
    description: 'Present, late, undertime, absent and leave day counts per employee for the period.',
    columns: [
      ...identityColumns,
      { key: 'daysPresent', label: 'Days Present' },
      { key: 'daysLate', label: 'Days Late' },
      { key: 'daysUndertime', label: 'Days Undertime' },
      { key: 'daysAbsent', label: 'Days Absent' },
      { key: 'daysOnLeave', label: 'Days On Leave' },
      { key: 'workedHours', label: 'Total Worked Hours' },
      { key: 'overtimeHours', label: 'Total OT Hours' },
    ],
    build: ({ logs, employees }) => groupByEmployee(logs, employees).map(({ employee, rows }) => ({
      key: `attendance-${employee.employeeId}`,
      ...identityOf(employee),
      daysPresent: rows.filter(row => row.status !== 'Absent' && row.status !== 'On Leave').length,
      daysLate: rows.filter(row => row.tardinessMinutes > 0).length,
      daysUndertime: rows.filter(row => row.undertimeMinutes > 0).length,
      daysAbsent: rows.filter(row => row.status === 'Absent').length,
      daysOnLeave: rows.filter(row => row.status === 'On Leave').length,
      workedHours: round2(sum(rows, row => row.workedHours)),
      overtimeHours: round2(sum(rows, row => row.overtimeHours)),
    })),
  },
  {
    key: 'overtime-summary',
    brdId: 'HT193',
    label: 'Overtime Summary Report',
    description: 'Approved, pending and rejected overtime hours per employee, with the approved pay.',
    columns: [
      ...identityColumns,
      { key: 'otDays', label: 'Days With OT' },
      { key: 'approvedHours', label: 'Approved OT Hours' },
      { key: 'pendingHours', label: 'Pending OT Hours' },
      { key: 'rejectedHours', label: 'Rejected OT Hours' },
      { key: 'totalOtHours', label: 'Total OT Hours' },
      { key: 'approvedPay', label: 'Approved OT Pay' },
    ],
    build: ({ logs, employees, rateFor }) => groupByEmployee(logs.filter(row => row.overtimeHours > 0), employees).map(({ employee, rows }) => {
      const hoursWithStatus = status => round2(sum(rows.filter(row => row.overtimeStatus === status), row => row.overtimeHours));
      const { hourly } = rateFor(employee.employeeId);
      const approvedPay = round2(sum(
        rows.filter(row => row.overtimeStatus === 'Approved'),
        row => row.overtimeHours * hourly * (OT_MULTIPLIERS[row.overtimeType] || 1.25),
      ));
      return {
        key: `ot-summary-${employee.employeeId}`,
        ...identityOf(employee),
        otDays: rows.length,
        approvedHours: hoursWithStatus('Approved'),
        pendingHours: hoursWithStatus('Pending'),
        rejectedHours: hoursWithStatus('Rejected'),
        totalOtHours: round2(sum(rows, row => row.overtimeHours)),
        approvedPay: peso(approvedPay),
        approvedPayValue: approvedPay,
      };
    }),
  },
  {
    key: 'individual-overtime',
    brdId: 'HT268',
    label: 'Individual Overtime Report (with rates)',
    description: 'One line per employee per overtime type, priced at that employee own hourly rate.',
    columns: [
      ...identityColumns,
      { key: 'otType', label: 'OT Type' },
      { key: 'otDays', label: 'No. of OT Days' },
      { key: 'totalOtHours', label: 'Total OT Hours' },
      { key: 'hourlyRate', label: 'Hourly Rate' },
      { key: 'otRate', label: 'OT Rate' },
      { key: 'otPay', label: 'Overtime Pay' },
    ],
    build: ({ logs, employees, rateFor }) => groupByEmployee(logs.filter(row => row.overtimeHours > 0), employees).flatMap(({ employee, rows }) => {
      const { hourly } = rateFor(employee.employeeId);
      return TK_OT_TYPES.map(otType => {
        const forType = rows.filter(row => row.overtimeType === otType);
        if (!forType.length) return null;
        const multiplier = OT_MULTIPLIERS[otType] || 1.25;
        const hours = round2(sum(forType, row => row.overtimeHours));
        const pay = round2(hours * hourly * multiplier);
        return {
          key: `ot-${employee.employeeId}-${otType}`,
          ...identityOf(employee),
          otType,
          otDays: forType.length,
          totalOtHours: hours,
          hourlyRate: peso(hourly),
          otRate: `${Math.round((multiplier - 1) * 100)}%`,
          otPay: peso(pay),
          otPayValue: pay,
        };
      }).filter(Boolean);
    }),
  },
  {
    key: 'absences-unit',
    brdId: 'HT269',
    label: 'Absences Unit Report',
    description: 'Absences in days and hours per employee, priced at that employee daily rate.',
    columns: [
      ...identityColumns,
      { key: 'dailyRate', label: 'Daily Rate' },
      { key: 'hourlyRate', label: 'Hourly Rate' },
      { key: 'absentDays', label: 'No. of Absences (Days)' },
      { key: 'absentHours', label: 'No. of Absences (Hours)' },
      { key: 'reason', label: 'Reason' },
      { key: 'amount', label: 'Equivalent Amount' },
    ],
    build: ({ logs, employees, rateFor }) => groupByEmployee(logs.filter(row => row.status === 'Absent'), employees).map(({ employee, rows }) => {
      const { daily, hourly } = rateFor(employee.employeeId);
      const amount = round2(rows.length * daily);
      return {
        key: `absence-${employee.employeeId}`,
        ...identityOf(employee),
        dailyRate: peso(daily),
        hourlyRate: peso(hourly),
        absentDays: rows.length,
        absentHours: round2(rows.length * TK_REQUIRED_DAILY_HOURS),
        reason: [...new Set(rows.map(row => row.reason).filter(Boolean))].join('; ') || '-',
        amount: peso(amount),
        amountValue: amount,
      };
    }),
  },
  {
    key: 'tardiness-unit',
    brdId: 'HT270',
    label: 'Tardiness Unit Report',
    description: 'Tardiness in hours and minutes per employee, priced at that employee per-minute rate.',
    columns: [
      ...identityColumns,
      { key: 'dailyRate', label: 'Daily Rate' },
      { key: 'hourlyRate', label: 'Hourly Rate' },
      { key: 'tardyDays', label: 'No. of Tardiness (Days)' },
      { key: 'tardyHours', label: 'No. of Tardiness (Hours)' },
      { key: 'tardyMinutes', label: 'No. of Tardiness (Minutes)' },
      { key: 'amount', label: 'Equivalent Amount' },
    ],
    build: ({ logs, employees, rateFor }) => groupByEmployee(logs.filter(row => row.tardinessMinutes > 0), employees).map(({ employee, rows }) => {
      const { daily, hourly, perMinute } = rateFor(employee.employeeId);
      const minutes = sum(rows, row => row.tardinessMinutes);
      const amount = round2(minutes * perMinute);
      return {
        key: `tardy-${employee.employeeId}`,
        ...identityOf(employee),
        dailyRate: peso(daily),
        hourlyRate: peso(hourly),
        tardyDays: rows.length,
        tardyHours: round2(minutes / 60),
        tardyMinutes: minutes,
        amount: peso(amount),
        amountValue: amount,
      };
    }),
  },
  {
    key: 'undertime-unit',
    brdId: 'HT271',
    label: 'Undertime Unit Report',
    description: 'Undertime in hours and minutes per employee, priced at that employee per-minute rate.',
    columns: [
      ...identityColumns,
      { key: 'dailyRate', label: 'Daily Rate' },
      { key: 'hourlyRate', label: 'Hourly Rate' },
      { key: 'undertimeDays', label: 'No. of Undertime (Days)' },
      { key: 'undertimeHours', label: 'No. of Undertime (Hours)' },
      { key: 'undertimeMinutes', label: 'No. of Undertime (Minutes)' },
      { key: 'amount', label: 'Equivalent Amount' },
    ],
    build: ({ logs, employees, rateFor }) => groupByEmployee(logs.filter(row => row.undertimeMinutes > 0), employees).map(({ employee, rows }) => {
      const { daily, hourly, perMinute } = rateFor(employee.employeeId);
      const minutes = sum(rows, row => row.undertimeMinutes);
      const amount = round2(minutes * perMinute);
      return {
        key: `undertime-${employee.employeeId}`,
        ...identityOf(employee),
        dailyRate: peso(daily),
        hourlyRate: peso(hourly),
        undertimeDays: rows.length,
        undertimeHours: round2(minutes / 60),
        undertimeMinutes: minutes,
        amount: peso(amount),
        amountValue: amount,
      };
    }),
  },
  {
    key: 'dtr-summary',
    brdId: 'HT272',
    label: 'DTR (Daily Time Record) Summary',
    description: 'Required against rendered hours per employee, with tardiness, undertime, absences and overtime.',
    columns: [
      ...identityColumns,
      { key: 'daysCovered', label: 'Days Covered' },
      { key: 'requiredHours', label: 'Required No. of Hours' },
      { key: 'workedHours', label: 'Total Worked Hours' },
      { key: 'tardinessHours', label: 'Tardiness Hours' },
      { key: 'undertimeHours', label: 'Undertime Hours' },
      { key: 'absentDays', label: 'Absences' },
      { key: 'leaveDays', label: 'Paid Leaves' },
      { key: 'overtimeHours', label: 'OT Hours' },
      { key: 'unaccountedHours', label: 'Unaccounted Hours' },
    ],
    build: ({ logs, employees }) => groupByEmployee(logs, employees).map(({ employee, rows }) => {
      const requiredHours = round2(rows.length * TK_REQUIRED_DAILY_HOURS);
      const workedHours = round2(sum(rows, row => row.workedHours));
      const leaveHours = round2(sum(rows, row => row.leaveHours));
      return {
        key: `dtr-${employee.employeeId}`,
        ...identityOf(employee),
        daysCovered: rows.length,
        requiredHours,
        workedHours,
        tardinessHours: round2(sum(rows, row => row.tardinessMinutes) / 60),
        undertimeHours: round2(sum(rows, row => row.undertimeMinutes) / 60),
        absentDays: rows.filter(row => row.status === 'Absent').length,
        leaveDays: rows.filter(row => row.status === 'On Leave').length,
        overtimeHours: round2(sum(rows, row => row.overtimeHours)),
        unaccountedHours: round2(Math.max(0, requiredHours - workedHours - leaveHours)),
      };
    }),
  },
  {
    key: 'time-in-out-summary',
    brdId: 'HT273',
    label: 'Time In/Time Out Summary',
    description: 'Every punch in the period with break in/out, the tool used and the work location.',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      ...identityColumns,
      { key: 'requiredHours', label: 'Required No. of Hours' },
      { key: 'timeIn', label: 'Time In' },
      { key: 'breakIn', label: 'Break In' },
      { key: 'breakOut', label: 'Break Out' },
      { key: 'timeOut', label: 'Time Out' },
      { key: 'workedHours', label: 'Worked Hours' },
      { key: 'tool', label: 'Tool Used' },
      { key: 'workLocation', label: 'Location Status' },
      { key: 'status', label: 'Status' },
    ],
    build: ({ logs, employees }) => {
      const byId = new Map(employees.map(employee => [employee.employeeId, employee]));
      return logs
        .filter(row => byId.has(row.employeeId))
        .map(row => ({
          key: row.logId,
          ...identityOf(byId.get(row.employeeId)),
          date: row.date,
          requiredHours: TK_REQUIRED_DAILY_HOURS,
          timeIn: row.timeIn || '-',
          breakIn: row.breakIn || '-',
          breakOut: row.breakOut || '-',
          timeOut: row.timeOut || '-',
          workedHours: round2(row.workedHours),
          tool: row.tool,
          workLocation: row.workLocation,
          status: row.status,
        }))
        .sort((left, right) => (left.date < right.date ? 1 : -1));
    },
  },
]);

/**
 * The grand-total line a report closes with.  A column backed by a `*Value`
 * companion totals as pesos, a wholly numeric column totals as a number, and
 * a text column stays blank.  Derived from the rows on screen, so narrowing
 * the period or the department restates the total along with them.
 */
export function reportTotals(definition, rows = []) {
  if (!rows.length) return null;
  const identityKeys = identityColumns.map(column => column.key);
  const totals = { key: 'grand-total', employeeCode: '', name: 'GRAND TOTAL', department: '' };
  definition.columns.forEach(column => {
    if (identityKeys.includes(column.key)) return;
    const valueKey = `${column.key}Value`;
    if (rows.some(row => row[valueKey] !== undefined)) {
      totals[column.key] = peso(sum(rows, row => row[valueKey]));
      return;
    }
    const numeric = rows.every(row => typeof row[column.key] === 'number' || row[column.key] === '' || row[column.key] === undefined);
    totals[column.key] = numeric ? round2(sum(rows, row => row[column.key])) : '';
  });
  return totals;
}

/** Headcount a report covers - distinct employees across the rows on screen. */
export function reportHeadcount(rows = []) {
  return new Set(rows.map(row => row.employeeId).filter(Boolean)).size;
}

/** Punch rows inside an inclusive ISO date window. */
export function logsInPeriod(logs = [], from = '', to = '') {
  return logs.filter(row => (!from || row.date >= from) && (!to || row.date <= to));
}
