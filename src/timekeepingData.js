/**
 * Timekeeping module data (P&A Timekeeping Module Part 1).
 *
 * There is exactly one transactional store here — `timeLogs`, the daily punch
 * record.  Everything the module shows on top of it is derived on read: the
 * attendance KPIs, the work-hours chart, the year-to-date tabs and the
 * absence, tardiness/undertime, overtime and OT-with-earning summaries all
 * read the same rows.  Nothing aggregates into a second stored table, so a
 * corrected punch can never leave a stale total behind it.
 *
 * The collections live inside the HRM company store (`hrmData.js`) because
 * Timekeeping and HRM share one roster, one signed-in identity and one
 * Employee Masterfile — the masterfile screens in Part 1 are explicitly the
 * same screens the HRM module already renders.
 */

/* ------------------------------------------------------------- vocabularies */

export const TK_TOOLS = Object.freeze(['Web', 'Biometrics', 'Mobile']);
export const TK_WORK_LOCATIONS = Object.freeze(['Office HQ', 'Remote', 'Client Site']);
export const TK_OT_TYPES = Object.freeze(['Regular', 'Night Differential', 'Rest Day', 'Holiday']);
export const TK_LEAVE_TYPES = Object.freeze(['Sick Leave', 'Vacation Leave', 'Unpaid Leave', 'Personal Leave', 'Bereavement Leave']);
export const TK_MISSING_LOG_TYPES = Object.freeze(['Time In Missing', 'Time Out Missing', 'Break In Missing', 'Break Out Missing']);
export const TK_MISSING_LOG_STATUS = Object.freeze(['Pending Review', 'Followed Up', 'Resolved (Manual)']);
export const TK_DISPUTE_TYPES = Object.freeze(['Lunch Break', 'Overtime', 'Time In/Out', 'Adjustment', 'Leave Request']);
export const TK_DISPUTE_STATUS = Object.freeze(['Approved', 'Carried Over', 'Disputed', 'Dispute Approved', 'Dispute Rejected']);
export const TK_HOUR_TYPES = Object.freeze(['Mandatory', 'Overtime', 'Non-billable']);
export const TK_GRANULARITIES = Object.freeze(['Year', 'Month', 'Week', 'Date Range']);
export const TK_TEAMS = Object.freeze(['All Teams', 'Product Development', 'Training & Development', 'Quality Assurance']);

/** Colours a multi-employee comparison cycles through. */
export const TK_SERIES_COLORS = Object.freeze(['#4c1d95', '#a78bfa', '#6d28d9', '#c4b5fd']);

const MONTH_LABELS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

/* ------------------------------------------------------------------- format */

/** 8.5 → "08:30". Durations render as a clock everywhere in this module. */
export function hoursToClock(hours) {
  const total = Math.max(0, Math.round((Number(hours) || 0) * 60));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "08:30:00" → 8.5 */
export function clockToHours(value) {
  const parts = String(value ?? '').split(':').map(Number);
  if (!parts.length || Number.isNaN(parts[0])) return 0;
  return parts[0] + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600;
}

export function toClockSeconds(hours) {
  const total = Math.max(0, Math.round((Number(hours) || 0) * 3600));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map(part => String(part).padStart(2, '0')).join(':');
}

export function peso(amount) {
  return `₱${(Number(amount) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hashOf(value) {
  let hash = 0;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/* --------------------------------------------------------------- the punches */

export const TK_CURRENT_YEAR = 2025;
const CURRENT_YEAR = TK_CURRENT_YEAR;
const PRIOR_YEAR = 2024;
const SAMPLED_DAYS = [3, 10, 17, 24];
const PRIOR_YEAR_DAYS = [8, 22];
const CURRENT_YEAR_MONTHS = 11;
/**
 * Payroll prices a cutoff from the punch record, so the months a payroll run
 * covers need a complete one — every working day, not a weekly sample. The
 * sampled pattern stays for the rest of the year because the year-to-date tabs
 * only need a shape, and a full year for every employee would be a large store
 * to carry for no extra meaning.
 */
const FULL_MONTHS = [10, 11];

/** Weekdays of a month, as ISO dates. Rest days never carry a scheduled punch. */
function workingDaysOf(year, month) {
  const days = [];
  const total = new Date(year, month, 0).getDate();
  for (let day = 1; day <= total; day += 1) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday !== 0 && weekday !== 6) days.push(isoDate(year, month, day));
  }
  return days;
}

/**
 * One punch row per employee per planned date.  The shape of a day — present,
 * late, undertime, absent or on leave — is a deterministic function of the
 * employee and the date, so the roster always tells the same story and a
 * filter can be checked against what the table shows.
 */
export function seedTimeLogs(employees = []) {
  const rows = [];
  employees.forEach(employee => {
    const plan = new Set();
    for (let month = 1; month <= CURRENT_YEAR_MONTHS; month += 1) {
      if (FULL_MONTHS.includes(month)) workingDaysOf(CURRENT_YEAR, month).forEach(date => plan.add(date));
      else SAMPLED_DAYS.forEach(day => plan.add(isoDate(CURRENT_YEAR, month, day)));
    }
    for (let month = 1; month <= 12; month += 1) PRIOR_YEAR_DAYS.forEach(day => plan.add(isoDate(PRIOR_YEAR, month, day)));
    plan.forEach(date => rows.push(buildTimeLog(employee, date)));
  });
  return rows.sort((left, right) => (left.date < right.date ? 1 : -1));
}

function buildTimeLog(employee, date) {
  const seed = hashOf(`${employee.employeeId}-${date}`);
  const shape = seed % 10;
  const tool = TK_TOOLS[seed % TK_TOOLS.length];
  const workLocation = TK_WORK_LOCATIONS[(seed >> 3) % TK_WORK_LOCATIONS.length];
  const base = {
    logId: `TKL-${employee.employeeId}-${date}`,
    employeeId: employee.employeeId,
    date,
    tool,
    workLocation,
    geotag: workLocation === 'Remote' ? 'Liwasang Kalayaan, Marikina, 1810 Metro Manila' : 'Ayala Avenue, Makati, 1226 Metro Manila',
    timeIn: '',
    timeOut: '',
    breakIn: '',
    breakOut: '',
    breakHours: 0,
    workedHours: 0,
    overtimeHours: 0,
    overtimeStatus: '',
    overtimeType: '',
    tardinessMinutes: 0,
    undertimeMinutes: 0,
    leaveType: '',
    leaveHours: 0,
    reason: '',
    status: 'Present',
  };

  if (shape === 0) return { ...base, status: 'Absent', reason: 'No punch recorded' };
  if (shape === 1) {
    const leaveType = TK_LEAVE_TYPES[(seed >> 5) % TK_LEAVE_TYPES.length];
    return { ...base, status: 'On Leave', leaveType, leaveHours: 8, reason: 'Filed and approved in Employee Self-service' };
  }

  const late = shape === 2 || shape === 3;
  const early = shape === 4;
  const tardinessMinutes = late ? 20 + (seed % 4) * 5 : 0;
  const undertimeMinutes = early ? 40 - (seed % 3) * 5 : 0;
  const workedHours = 8 - tardinessMinutes / 60 - undertimeMinutes / 60;
  const overtimeHours = shape >= 7 ? 1.5 + (seed % 3) * 0.5 : 0;

  return {
    ...base,
    timeIn: toClockSeconds(9 + tardinessMinutes / 60),
    timeOut: toClockSeconds(9 + 1 + workedHours + overtimeHours),
    breakIn: '12:00:00',
    breakOut: '13:00:00',
    breakHours: 1,
    workedHours: Number(workedHours.toFixed(2)),
    overtimeHours: Number(overtimeHours.toFixed(2)),
    overtimeStatus: overtimeHours ? ['Approved', 'Pending', 'Rejected'][(seed >> 7) % 3] : '',
    overtimeType: overtimeHours ? TK_OT_TYPES[(seed >> 9) % TK_OT_TYPES.length] : '',
    tardinessMinutes,
    undertimeMinutes,
    status: late ? 'Late' : early ? 'Undertime' : 'Present',
  };
}

/* --------------------------------------------------------- other TK records */

export function seedTimekeepingSettings() {
  return {
    workHoursStart: '07:00 AM - 10:00 AM',
    workHoursEnd: '04:00 PM - 07:00 PM',
    breakHoursRange: '11:00 AM - 01:00 PM',
    workLocation: 'Remote',
    geotagging: true,
    pinnedLocation: '',
    cutoffLabel: 'January 15, 2025',
    currentPeriod: 'January 1-15, 2025',
    periods: ['January 1-15, 2025', 'January 16-31, 2025', 'February 1-15, 2025'],
    currentCutoffDate: '2025-07-04',
    lockedCutoffPeriods: ['2025-05', '2025-04'],
  };
}

/** Convert "08:30:00 AM", "08:30 AM", "08:30" or "08:30:00" to minutes from midnight */
export function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const str = String(timeStr).trim();
  const isPM = /pm/i.test(str);
  const isAM = /am/i.test(str);
  const clean = str.replace(/[^\d:]/g, '');
  const parts = clean.split(':').map(Number);
  let hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

/** Check if a new entry [startTime, endTime] overlaps with any existing entries on the same date */
export function validateTimeOverlap(existingEntries = [], newEntry = {}, excludeId = null) {
  const newStart = parseTimeToMinutes(newEntry.startTime);
  const newEnd = parseTimeToMinutes(newEntry.endTime);
  if (newEnd <= newStart) return true; // Invalid time range

  const newDate = newEntry.date || newEntry.timeReportDate;

  return existingEntries.some(entry => {
    if (excludeId && (entry.reportId === excludeId || entry.id === excludeId)) return false;
    const entryDate = entry.date || entry.timeReportDate;
    if (newDate && entryDate && entryDate !== newDate) return false;
    const existStart = parseTimeToMinutes(entry.startTime);
    const existEnd = parseTimeToMinutes(entry.endTime);
    // Overlap condition: max(start1, start2) < min(end1, end2)
    return Math.max(newStart, existStart) < Math.min(newEnd, existEnd);
  });
}

/** Group granular time report entries into master daily summary cards */
export function deriveDailyTimeReports(reports = [], employeeId = null) {
  const filtered = employeeId ? reports.filter(r => r.employeeId === employeeId) : reports;
  const byDate = {};

  filtered.forEach(entry => {
    const d = entry.date || entry.timeReportDate;
    if (!byDate[d]) {
      byDate[d] = {
        date: d,
        dateCreated: entry.dateCreated || d,
        employeeId: entry.employeeId,
        employeeCode: entry.employeeCode,
        employeeName: entry.employeeName,
        department: entry.department,
        entries: [],
      };
    }
    byDate[d].entries.push(entry);
  });

  return Object.values(byDate).map(day => {
    const sorted = [...day.entries].sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
    const earliest = sorted[0]?.startTime || '09:00:00 AM';
    const latest = sorted[sorted.length - 1]?.endTime || '05:00:00 PM';
    const totalDuration = sorted.reduce((sum, item) => sum + (Number(item.durationHours) || (Number(item.duration) || 0)), 0);
    const hasPending = sorted.some(e => e.status === 'Pending' || e.status === 'Draft');
    const hasRejected = sorted.some(e => e.status === 'Rejected');
    const allApproved = sorted.every(e => e.status === 'Approved');

    return {
      id: `daily-${day.date}-${day.employeeId || 'all'}`,
      date: day.date,
      dateCreated: day.dateCreated,
      timeReportDate: day.date,
      timeStart: earliest,
      timeEnd: latest,
      totalDuration: Number(totalDuration.toFixed(2)),
      entriesCount: sorted.length,
      status: hasPending ? 'Pending' : hasRejected ? 'Rejected' : allApproved ? 'Approved' : 'Pending',
      entries: sorted,
    };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Charge-code time reports — the Employee Charge Codes detail rows (Timekeeping Part 2). */
export function seedTimeReports(employees = []) {
  const chargeAccounts = [
    { code: 'CC-00001', name: 'ABC Development Corp', project: 'Social Media', team: 'Creatives Team', activity: 'Art Card Development' },
    { code: 'CC-00002', name: 'ABC Development Corp', project: 'Internal Systems', team: 'Product Development', activity: 'Sprint Planning' },
    { code: 'CC-00003', name: 'Point Brooke Resort and Events', project: 'Brand Campaign', team: 'Creatives Team', activity: 'Art Card Development' },
    { code: 'CC-00004', name: 'Point Brooke Resort and Events', project: 'Infrastructure Modernization', team: 'Quality Assurance', activity: 'QA Automation' },
  ];

  const sampleDates = [
    { date: '08/16/2026', created: '08/16/2026', start: '08:30:00 AM', end: '05:30:00 PM', duration: 9.00 },
    { date: '08/15/2026', created: '08/16/2026', start: '09:00:00 AM', end: '05:59:00 PM', duration: 8.98 },
    { date: '08/14/2026', created: '08/15/2026', start: '03:00:00 PM', end: '07:00:00 PM', duration: 4.00 },
    { date: '08/12/2026', created: '08/14/2026', start: '10:21:17 AM', end: '07:39:00 PM', duration: 9.29 },
    { date: '08/11/2026', created: '08/13/2026', start: '09:00:00 AM', end: '05:30:01 PM', duration: 8.50 },
  ];

  const rows = [];
  let reportIdx = 1;

  employees.forEach((employee, empIdx) => {
    sampleDates.forEach((dInfo, dIdx) => {
      // 2-3 granular entries per day
      const entriesForDay = [
        {
          startTime: dIdx % 2 === 0 ? '08:30:00 AM' : '09:00:00 AM',
          endTime: dIdx % 2 === 0 ? '12:00:00 PM' : '01:00:00 PM',
          duration: dIdx % 2 === 0 ? 3.5 : 4.0,
          account: chargeAccounts[dIdx % chargeAccounts.length],
        },
        {
          startTime: dIdx % 2 === 0 ? '01:00:00 PM' : '02:00:00 PM',
          endTime: dIdx % 2 === 0 ? '05:30:00 PM' : '06:00:00 PM',
          duration: dIdx % 2 === 0 ? 4.5 : 4.0,
          account: chargeAccounts[(dIdx + 1) % chargeAccounts.length],
        },
      ];

      entriesForDay.forEach(entry => {
        const statusList = ['Pending', 'Approved', 'Rejected'];
        const status = statusList[(empIdx + dIdx + reportIdx) % statusList.length];

        rows.push({
          reportId: `TKR-${String(reportIdx).padStart(5, '0')}`,
          employeeId: employee.employeeId,
          employeeCode: employee.employeeCode || `00112233${40 + empIdx}`,
          employeeName: employee.name,
          department: employee.department || 'IT Department',
          date: dInfo.date,
          timeReportDate: dInfo.date,
          dateCreated: dInfo.created,
          startTime: entry.startTime,
          endTime: entry.endTime,
          durationHours: entry.duration,
          chargeCode: entry.account.code,
          chargeAccount: entry.account.name,
          projectName: entry.account.project,
          project: entry.account.project,
          team: entry.account.team,
          activity: entry.account.activity,
          activityDescription: `${entry.account.activity} for ${entry.account.project}`,
          approverName: 'John Collins Doe',
          approverRemarks: status === 'Approved' ? 'Verified against client timesheet.' : status === 'Rejected' ? 'Time entries exceed allocated budget hours.' : '-',
          typeOfHours: entry.duration > 8 ? 'Overtime' : 'Regular Hours',
          status,
        });
        reportIdx += 1;
      });
    });
  });

  return rows;
}

/** Timekeeping disputes (the "Others" screen). */
export function seedTkDisputes(employees = []) {
  const rows = [];
  employees.forEach(employee => {
    [2, 9, 16].forEach((day, index) => {
      const seed = hashOf(`${employee.employeeId}-dispute-${day}`);
      const type = TK_DISPUTE_TYPES[(seed + index) % TK_DISPUTE_TYPES.length];
      const status = TK_DISPUTE_STATUS[(seed + index) % TK_DISPUTE_STATUS.length];
      const carried = status === 'Carried Over' || status === 'Approved';
      rows.push({
        disputeId: `TKD-${employee.employeeId}-${day}`,
        employeeId: employee.employeeId,
        originalDate: isoDate(CURRENT_YEAR, 11, day),
        type,
        hoursAmount: Number((4.5 + (seed % 5) * 0.5).toFixed(2)),
        remarks: status === 'Disputed' ? '' : 'Initial submission',
        status,
        carryOverStatus: carried ? 'Included in Jul 4, 2025' : status === 'Disputed' ? 'N/A' : '',
        locked: (seed + index) % 2 === 0,
        logs: [
          { at: '1/20/2024, 5:00PM', actor: 'Ethan Caldwell', action: 'Dispute Submitted', remarks: 'Initial submission' },
          { at: '1/20/2024, 5:00PM', actor: 'Ethan Caldwell', action: 'Entry Unlocked', remarks: 'Unlocked for dispute resolution' },
        ],
      });
    });
  });
  return rows;
}

/** Missing punch follow-ups the approver clears from Time In/Time Out. */
export function seedMissingLogs(employees = []) {
  return employees.map((employee, index) => {
    const seed = hashOf(`${employee.employeeId}-missing`);
    return {
      missingLogId: `TKM-${employee.employeeId}`,
      employeeId: employee.employeeId,
      date: isoDate(CURRENT_YEAR, 11, 2 + index),
      missingLogType: TK_MISSING_LOG_TYPES[seed % TK_MISSING_LOG_TYPES.length],
      status: seed % 2 === 0 ? TK_MISSING_LOG_STATUS[0] : TK_MISSING_LOG_STATUS[2],
      lastRecordedTime: '09:00 AM (Time In)',
      tool: TK_TOOLS[seed % TK_TOOLS.length],
      workLocation: TK_WORK_LOCATIONS[seed % TK_WORK_LOCATIONS.length],
    };
  });
}

/**
 * Leave accrual configuration behind the Leave Balance Summary.  Taken and
 * available are derived on read from the punch record, never stored.
 */
export function seedLeaveAccruals() {
  return [
    { leaveType: 'Sick Leave', accrualFrequency: 'Monthly', accrualRate: '1.67 days/mo', entitlement: 20, adjustment: 0, forfeiture: 0, expiryDate: '2025-12-31' },
    { leaveType: 'Vacation Leave', accrualFrequency: 'Yearly', accrualRate: '8.33 days/mo', entitlement: 20, adjustment: 0, forfeiture: 0, expiryDate: '2025-12-31' },
    { leaveType: 'Unpaid Leave', accrualFrequency: 'Fixed Rate', accrualRate: '—', entitlement: 0, adjustment: 0, forfeiture: 0, expiryDate: '—' },
    { leaveType: 'Personal Leave', accrualFrequency: 'Monthly', accrualRate: '0.83 days/mo', entitlement: 10, adjustment: 0, forfeiture: 0, expiryDate: '2025-12-31' },
    { leaveType: 'Bereavement Leave', accrualFrequency: 'Fixed Rate', accrualRate: '—', entitlement: 5, adjustment: 0, forfeiture: 0, expiryDate: '2025-12-31' },
  ];
}

/** Announcements feed shown by the Announcements screen. */
export function seedAnnouncements() {
  const body = [
    'Timekeeping cut-off reminders are published here so every employee reads the same schedule the payroll run uses.',
    'Entries submitted beyond the current cut-off are automatically carried over to the next period. The last two cut-off periods are locked for regular edits.',
    'Raise a dispute from Timekeeping / Others if a locked entry needs correcting — an approver can unlock it for resolution.',
  ].join('\n\n');
  return [1, 2, 3, 4, 5].map(index => ({
    announcementId: `ANN-${index}`,
    title: 'Creating a Healthy Office Culture: Innovative Wellness Initiatives for Employees',
    author: 'Liam Johnson',
    publishedAt: '2025-02-12',
    publishedTime: '03:23 PM',
    read: index % 2 === 0,
    excerpt: 'Lorem ipsum dolor sit amet, vince adipiscing e...',
    body,
  }));
}

/* ------------------------------------------------------------- derivations */

export function logsFor(data = {}, employeeId) {
  return (data.timeLogs || []).filter(row => row.employeeId === employeeId);
}

export function logsForMany(data = {}, employeeIds = []) {
  const allowed = new Set(employeeIds);
  return (data.timeLogs || []).filter(row => allowed.has(row.employeeId));
}

const sum = (rows, pick) => rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);

/** The five cards above Time and Attendance Summary. */
export function attendanceKpis(logs = []) {
  const approvedOvertime = logs.filter(row => row.overtimeStatus === 'Approved');
  return {
    totalWorkedHours: hoursToClock(sum(logs, row => row.workedHours)),
    totalOvertimeHours: hoursToClock(sum(approvedOvertime, row => row.overtimeHours)),
    totalAbsences: logs.filter(row => row.status === 'Absent').length,
    totalLeaveDays: logs.filter(row => row.status === 'On Leave').length,
    totalTardinessUndertime: logs.filter(row => row.tardinessMinutes > 0 || row.undertimeMinutes > 0).length,
  };
}

/** The four cards above Tardiness/Undertime Management. */
export function tardinessKpis(logs = []) {
  const tardinessMinutes = sum(logs, row => row.tardinessMinutes);
  const undertimeMinutes = sum(logs, row => row.undertimeMinutes);
  return {
    tardinessHours: (tardinessMinutes / 60).toFixed(1),
    tardinessMinutes,
    undertimeHours: (undertimeMinutes / 60).toFixed(1),
    undertimeMinutes,
  };
}

export function latestLogDate(logs = []) {
  return logs.reduce((latest, row) => (row.date > latest ? row.date : latest), '');
}

/** The four cards above the approver's Team Attendance Logs. */
export function teamAttendanceKpis(logs = [], employeeIds = [], onDate) {
  const day = onDate || latestLogDate(logs);
  const forDay = logs.filter(row => row.date === day);
  return {
    totalTeamMembers: employeeIds.length,
    totalPresentToday: forDay.filter(row => row.status !== 'Absent' && row.status !== 'On Leave').length,
    totalAbsentToday: forDay.filter(row => row.status === 'Absent').length,
    totalOnLeaveToday: forDay.filter(row => row.status === 'On Leave').length,
    onDate: day,
  };
}

/** Total / average / productivity change, all derived from the same rows. */
export function workHoursSummary(logs = []) {
  const worked = logs.filter(row => row.workedHours > 0);
  const total = sum(worked, row => row.workedHours);
  const currentYear = worked.filter(row => row.date.startsWith(String(CURRENT_YEAR)));
  const priorYear = worked.filter(row => row.date.startsWith(String(PRIOR_YEAR)));
  const currentAverage = currentYear.length ? sum(currentYear, row => row.workedHours) / currentYear.length : 0;
  const priorAverage = priorYear.length ? sum(priorYear, row => row.workedHours) / priorYear.length : 0;
  const change = priorAverage ? ((currentAverage - priorAverage) / priorAverage) * 100 : 0;
  return {
    totalHoursWorked: Math.round(total),
    averageHoursWorked: (worked.length ? total / worked.length : 0).toFixed(2),
    productivityChange: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
    productivityUp: change >= 0,
  };
}

function weekOfMonth(date) {
  const day = Number(date.slice(8, 10));
  return Math.min(5, Math.floor((day - 1) / 7) + 1);
}

function round(value) {
  return Number((Number(value) || 0).toFixed(1));
}

/**
 * Bucket worked hours for the comparison chart.  One function serves all four
 * granularities so the bars and the axis can never disagree.
 */
export function workHoursSeries(logs = [], granularity = 'Year', range = {}) {
  const worked = logs.filter(row => row.workedHours > 0);
  if (granularity === 'Year') {
    const years = Array.from(new Set(worked.map(row => row.date.slice(0, 4)))).sort();
    return { labels: years, points: years.map(year => round(sum(worked.filter(row => row.date.startsWith(year)), row => row.workedHours))) };
  }
  if (granularity === 'Month') {
    const year = range.year || String(CURRENT_YEAR);
    return {
      labels: [...MONTH_LABELS],
      points: MONTH_LABELS.map((_, index) => round(sum(worked.filter(row => row.date.startsWith(`${year}-${String(index + 1).padStart(2, '0')}`)), row => row.workedHours))),
    };
  }
  if (granularity === 'Week') {
    const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
    return { labels, points: labels.map((_, index) => round(sum(worked.filter(row => weekOfMonth(row.date) === index + 1), row => row.workedHours))) };
  }
  const from = range.from || '';
  const to = range.to || '';
  const inRange = worked.filter(row => (!from || row.date >= from) && (!to || row.date <= to));
  const dates = Array.from(new Set(inRange.map(row => row.date))).sort();
  return { labels: dates, points: dates.map(date => round(sum(inRange.filter(row => row.date === date), row => row.workedHours))) };
}

/* ----------------------------------------------------- year-to-date metrics */

export function ytdAbsences(logs = []) {
  return logs
    .filter(row => row.status === 'Absent' || row.status === 'On Leave')
    .map(row => ({
      key: row.logId,
      date: row.date,
      absenceType: row.status === 'Absent' ? (hashOf(row.logId) % 2 === 0 ? 'Unexcused' : 'Excused') : row.leaveType,
      days: row.status === 'On Leave' ? 1 : hashOf(row.logId) % 2 === 0 ? 1 : 0.5,
    }));
}

export function ytdTardiness(logs = []) {
  return logs
    .filter(row => row.tardinessMinutes > 0)
    .map(row => ({ key: row.logId, date: row.date, minutesLate: row.tardinessMinutes, hoursLate: Number((row.tardinessMinutes / 60).toFixed(2)) }));
}

export function ytdOvertime(logs = []) {
  return logs.filter(row => row.overtimeHours > 0).map(row => ({ key: row.logId, date: row.date, overtimeHours: row.overtimeHours }));
}

export function ytdHoursWorked(logs = []) {
  return logs.filter(row => row.workedHours > 0).map(row => ({ key: row.logId, date: row.date, workedHours: row.workedHours }));
}

export function ytdLeaves(logs = []) {
  return logs
    .filter(row => row.status === 'On Leave')
    .map(row => ({ key: row.logId, startDate: row.date, endDate: row.date, leaveType: row.leaveType, days: 1 }));
}

/* ------------------------------------------- module-specific summary tables */

export function absenceRows(logs = []) {
  return logs
    .filter(row => row.status === 'Absent' || row.status === 'On Leave')
    .map(row => ({
      key: row.logId,
      employeeId: row.employeeId,
      date: row.date,
      leaveType: row.status === 'Absent' ? 'Unpaid Leave' : row.leaveType,
      totalInHours: 8,
      reason: row.reason || '—',
    }));
}

export function tardinessRows(logs = []) {
  return logs
    .filter(row => row.tardinessMinutes > 0 || row.undertimeMinutes > 0)
    .map(row => ({
      key: row.logId,
      employeeId: row.employeeId,
      date: row.date,
      timeIn: row.timeIn,
      timeOut: row.timeOut,
      tardinessHours: row.tardinessMinutes ? Number((row.tardinessMinutes / 60).toFixed(2)) : '',
      tardinessMinutes: row.tardinessMinutes || '',
      undertimeHours: row.undertimeMinutes ? Number((row.undertimeMinutes / 60).toFixed(2)) : '',
      undertimeMinutes: row.undertimeMinutes || '',
      remarks: row.tardinessMinutes ? 'Tardiness' : 'Undertime',
    }));
}

export function overtimeRows(logs = [], hourlyRate = 200) {
  return logs
    .filter(row => row.overtimeHours > 0)
    .map(row => ({
      key: row.logId,
      employeeId: row.employeeId,
      date: row.date,
      hourlyRate: hourlyRate.toFixed(2),
      otType: row.overtimeType,
      otRate: row.overtimeType === 'Night Differential' ? '10%' : row.overtimeType === 'Holiday' ? '30%' : row.overtimeType === 'Rest Day' ? '25%' : '15%',
      otStartTime: '18:00:00',
      otEndTime: toClockSeconds(18 + row.overtimeHours),
      totalOtHours: row.overtimeHours,
      status: row.overtimeStatus,
      reason: row.overtimeStatus === 'Rejected' ? 'Not pre-approved' : '—',
    }));
}

/**
 * OT with earning condition.  The allowances follow the overtime hours: an
 * employee earns the meal and transportation conditions only once the hours
 * cross the configured threshold, so every row is computed, never typed in.
 */
export function otEarningRows(logs = []) {
  return logs
    .filter(row => row.overtimeHours > 0 && row.overtimeStatus === 'Approved')
    .map(row => {
      const hours = row.overtimeHours;
      const meal = hours >= 2 ? 800 : 0;
      const transportHome = row.workLocation === 'Remote' ? 0 : hours >= 2 ? 800 : 0;
      const allowance = hours >= 3 ? 800 : 0;
      const hazardPay = row.workLocation === 'Client Site' ? 800 : 0;
      const snack = hours >= 4 ? 200 : 0;
      const fixedTransportationAllowance = 500;
      return {
        key: row.logId,
        employeeId: row.employeeId,
        date: row.date,
        overtimeHours: hours,
        otMealAllowance: meal,
        otTransportationAllowance: transportHome,
        otAllowance: allowance,
        otMealAndTranspo: meal + transportHome,
        hazardPay,
        snack,
        fixedTransportationAllowance,
        totalOtEarnings: meal + transportHome + allowance + hazardPay + snack + fixedTransportationAllowance,
      };
    });
}

/** Leave balance summary — taken and available derived from the punch record. */
export function leaveBalanceRows(accruals = [], logs = []) {
  return accruals.map(accrual => {
    const taken = logs.filter(row => row.status === 'On Leave' && row.leaveType === accrual.leaveType).length;
    const available = Math.max(0, accrual.entitlement + accrual.adjustment - accrual.forfeiture - taken);
    return {
      ...accrual,
      key: accrual.leaveType,
      taken,
      available,
      currentBalance: available,
      lastUpdated: latestLogDate(logs) || '—',
    };
  });
}

/** Charge-code cut-off totals per date, derived from the filed time reports. */
export function chargeCodeSummaryRows(reports = []) {
  const byKey = new Map();
  reports.forEach(report => {
    const key = `${report.employeeId}|${report.date}`;
    const bucket = byKey.get(key) || {
      key,
      employeeId: report.employeeId,
      date: report.date,
      mandatoryFiledOnTime: 0,
      mandatoryNotFiledOnTime: 0,
      mandatoryUnaccounted: 0,
      overtimeApproved: 0,
      overtimeNotApprovedOnTime: 0,
      overtimeRejected: 0,
      overtimePending: 0,
    };
    const hours = Number(report.durationHours) || 0;
    if (report.typeOfHours === 'Overtime') {
      if (report.status === 'Filed on Time') bucket.overtimeApproved += hours;
      else if (report.status === 'Not Filed on Time') bucket.overtimeNotApprovedOnTime += hours;
      else bucket.overtimePending += hours;
    } else if (report.status === 'Filed on Time') bucket.mandatoryFiledOnTime += hours;
    else if (report.status === 'Not Filed on Time') bucket.mandatoryNotFiledOnTime += hours;
    else bucket.mandatoryUnaccounted += hours;
    byKey.set(key, bucket);
  });
  return Array.from(byKey.values()).sort((left, right) => (left.date < right.date ? 1 : -1));
}

/** Cost allocation rows are the same time reports seen by charge account. */
export function costAllocationRows(reports = [], employees = []) {
  const byId = new Map(employees.map(employee => [employee.employeeId, employee]));
  return reports.map(report => {
    const employee = byId.get(report.employeeId);
    return {
      key: `${report.reportId}-cost`,
      employeeId: report.employeeId,
      date: report.date,
      employeeCode: employee?.employeeCode || '',
      name: employee?.name || '',
      category: employee?.department || '',
      chargeCode: report.chargeCode,
      clientProject: report.projectName,
      allocation: report.projectAllocation,
    };
  });
}
