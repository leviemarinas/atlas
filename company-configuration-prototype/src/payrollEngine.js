/**
 * The payroll computation engine (Annex C — Sub Module 3, Payroll).
 *
 * This module is deliberately pure: it receives every dependency it needs and
 * returns a result, so the same computation can be run by the Payroll
 * Processing screen, by a test, and by the employee's own payslip without any
 * of them reaching into browser storage. `payrollRuns.js` is the adapter that
 * collects the dependencies out of the company stores.
 *
 * ## What a payroll line is made of
 *
 * Every amount on a line is produced by one step, and every step names the
 * Computational Basis code it applied, the expression that code publishes, and
 * the values it substituted. Nothing is computed with a number typed into this
 * file: rates come from the employee's own salary record, brackets and ceilings
 * come from the effective statutory version, the deduction order comes from the
 * REF-011 hierarchy, and the protected net comes from the Take-Home Pay policy.
 * That is what makes the "how was this figure reached?" panel in the UI a
 * report of the calculation rather than a description of it.
 *
 * ## The order of the pipeline
 *
 *   1  eligibility        — payment mode, employment status, tagging, dates
 *   2  rates              — BAS-001/002/003 from the salary record
 *   3  basic pay          — ERN-001 / MWE-001, pro-rated by BAS-004
 *   4  timekeeping        — DED-001/002/003 and ERN-002/003/006 from the punches
 *   5  earnings           — recurring, one-time, variable; De Minimis split
 *   6  bonuses            — BON-001..004 against the non-taxable ceiling
 *   7  gross pay          — PAY-001
 *   8  statutory          — GOV-001/002/003 from the effective tables
 *   9  taxable income     — TAX-001
 *  10  withholding tax    — TAX-002, or TAX-008 annualised for final pay
 *  11  gross up           — GUP-001, iterated against the same table
 *  12  deductions & loans — collected in hierarchy order, capped at balance
 *  13  take-home policy   — THP-001/002 defer what would breach the minimum
 *  14  net pay            — PAY-002, then split across the employee's banks
 */

import { computationByCode, evaluateExpression, seedComputations } from './computationCatalog.js';
import {
  bracketFor,
  graduatedTax,
  rateContribution,
  splitDeMinimis,
  sssContribution,
} from './statutorySchedules.js';

/* ------------------------------------------------------------------ helpers */

const number = value => Number(value) || 0;
export const round2 = value => Number((Number(value) || 0).toFixed(2));
const sum = (rows, pick) => rows.reduce((total, row) => total + number(pick(row)), 0);

/** MM/DD/YYYY, DD-Mon-YYYY and ISO all appear in the stores; compare as ISO. */
export function toIsoDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

const withinPeriod = (date, start, end) => {
  const iso = toIsoDate(date);
  if (!iso) return false;
  return (!start || iso >= toIsoDate(start)) && (!end || iso <= toIsoDate(end));
};

/** Weekdays between two ISO dates, inclusive. Rest days are never payable days. */
export function workingDaysBetween(startIso, endIso) {
  const start = toIsoDate(startIso);
  const end = toIsoDate(endIso);
  if (!start || !end || start > end) return 0;
  let count = 0;
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Payroll periods in a year for each payment mode; the tax table agrees. */
export const PERIODS_PER_YEAR = Object.freeze({ Daily: 313, Weekly: 52, 'Bi-weekly': 26, 'Semi-monthly': 24, Monthly: 12 });

/** Overtime premium per type. Timekeeping owns the hours; payroll owns the rate. */
export const OT_MULTIPLIERS = Object.freeze({ Regular: 1.25, 'Night Differential': 1.1, 'Rest Day': 1.3, Holiday: 2 });

/** Earning classifications, and whether each one belongs in taxable gross. */
export const EARNING_CLASSES = Object.freeze({
  'Taxable Basic': { taxable: true, group: 'Basic Pay' },
  'Taxable Allowance': { taxable: true, group: 'Taxable Earnings' },
  'Taxable Bonus': { taxable: true, group: 'Bonus' },
  'Taxable Reimbursement': { taxable: true, group: 'Receivables / Reimbursements' },
  'Non-taxable': { taxable: false, group: 'Non-taxable Earnings' },
  'De Minimis': { taxable: false, group: 'De Minimis Benefits' },
  Reimbursement: { taxable: false, group: 'Receivables / Reimbursements' },
});

const classOf = classification => EARNING_CLASSES[classification] || EARNING_CLASSES['Taxable Allowance'];

/* ------------------------------------------------------------------- steps */

/**
 * A step records what the engine did and which published formula it applied.
 *
 * When the Computational Basis library carries an expression for the code, the
 * step evaluates that expression rather than repeating its arithmetic, so an
 * edit to a configurable formula changes the payroll figure. `amount` is the
 * evaluated result; when a code has no evaluable expression (a table lookup,
 * for instance) the caller supplies the amount and the step still names the
 * code and its inputs.
 */
function makeStepper(library) {
  const steps = [];
  const record = ({ code, label, category, inputs = {}, amount, detail, source, evaluate = true }) => {
    const formula = computationByCode(code, library);
    let value = amount;
    let evaluated = false;
    let error = '';
    if (evaluate && formula?.expression && formula.status !== 'Inactive') {
      try {
        value = round2(evaluateExpression(formula.expression, inputs));
        evaluated = true;
      } catch (cause) {
        // A formula whose mapped fields this step does not supply falls back to
        // the amount the engine computed, and says so rather than failing the run.
        error = cause.message;
        value = amount;
      }
    }
    const step = {
      seq: steps.length + 1,
      code,
      label: label || formula?.name || code,
      category: category || formula?.category || 'Payroll Result',
      expression: formula?.expression || '',
      description: formula?.description || '',
      inputs,
      amount: round2(value ?? 0),
      evaluated,
      fallbackReason: error,
      detail: detail || '',
      source: source || 'Computational Basis',
    };
    steps.push(step);
    return step.amount;
  };
  return { steps, record };
}

/* -------------------------------------------------------------- eligibility */

/**
 * Whether an employee belongs in this run (Annex C 3.l).
 *
 * A regular run pays active employees. On-hold employees join only when the run
 * asks for them; separated employees only on a special run computing final pay,
 * and only when the separation falls in or before the period. A "dummy" tagged
 * record is never paid.
 */
export function eligibilityFor(employee, transaction) {
  const config = transaction.config || {};
  const population = transaction.population || {};
  const periodEnd = toIsoDate(transaction.periodEnd);
  const periodStart = toIsoDate(transaction.periodStart);
  const pay = employee.payroll || {};
  const separated = toIsoDate(employee.dateSeparated);
  const hold = toIsoDate(employee.dateHold);
  const holdEnd = toIsoDate(employee.endDateHold);

  if (employee.employeeTagging === 'Dummy') return { included: false, reason: 'Tagged as a dummy record in the 201 file' };
  if (pay.paymentMode !== transaction.paymentMode) return { included: false, reason: `Payment mode is ${pay.paymentMode || 'not set'}, this run is ${transaction.paymentMode}` };
  if (population.mode === 'Selected Employees' && !(population.included || []).includes(employee.employeeId)) {
    return { included: false, reason: 'Not in the selected-employee list' };
  }
  if ((population.excluded || []).includes(employee.employeeId)) return { included: false, reason: 'Moved to the excluded list when the transaction was created' };
  if (toIsoDate(employee.dateHired) > periodEnd) return { included: false, reason: `Date hired ${employee.dateHired} falls after the payroll period` };

  const onHold = hold && hold <= periodEnd && (!holdEnd || holdEnd >= periodStart);
  if (onHold && !population.includeOnHold) return { included: false, reason: `On hold from ${employee.dateHold}${employee.holdReason ? ` (${employee.holdReason})` : ''}` };

  if (separated && separated < periodStart) {
    if (!config.computeFinalPay) return { included: false, reason: `Separated ${employee.dateSeparated}, before this payroll period` };
  }
  if (separated && !config.computeFinalPay && separated <= periodEnd && transaction.payrollType !== 'Regular') {
    return { included: false, reason: `Separated ${employee.dateSeparated}; enable Compute Final Pay to process this employee` };
  }
  return {
    included: true,
    onHold,
    finalPay: Boolean(config.computeFinalPay && separated && separated <= periodEnd),
    reason: '',
  };
}

/* -------------------------------------------------------------- attendance */

/**
 * Timekeeping for the run's cutoff, reduced to what payroll prices. The punch
 * record is the only source: nothing here is stored, so a corrected punch
 * changes the payroll line the next time the run is recalculated.
 */
export function attendanceFor(timeLogs = [], employeeId, transaction) {
  const rows = timeLogs.filter(row => row.employeeId === employeeId
    && withinPeriod(row.date, transaction.timekeepingStart, transaction.timekeepingEnd));
  const overtimeByType = {};
  rows.filter(row => row.overtimeStatus === 'Approved' && number(row.overtimeHours) > 0).forEach(row => {
    const type = row.overtimeType || 'Regular';
    overtimeByType[type] = round2((overtimeByType[type] || 0) + number(row.overtimeHours));
  });
  const paidLeaveTypes = ['Sick Leave', 'Vacation Leave', 'Personal Leave', 'Bereavement Leave'];
  const leaveRows = rows.filter(row => row.status === 'On Leave');
  // A late or undertime day is still a rendered day: the minutes are priced as
  // their own deduction, and counting the day as unworked would collect twice.
  // This is the same rule the Timekeeping reports use for Days Present.
  const rendered = rows.filter(row => row.status !== 'Absent' && row.status !== 'On Leave');
  return {
    daysCovered: rows.length,
    daysPresent: rendered.length,
    daysWorked: rendered.length,
    daysLate: rows.filter(row => number(row.tardinessMinutes) > 0).length,
    daysUndertime: rows.filter(row => number(row.undertimeMinutes) > 0).length,
    hoursWorked: round2(sum(rows, row => row.workedHours)),
    absentDays: rows.filter(row => row.status === 'Absent').length,
    tardinessMinutes: round2(sum(rows, row => row.tardinessMinutes)),
    undertimeMinutes: round2(sum(rows, row => row.undertimeMinutes)),
    overtimeByType,
    overtimeHours: round2(Object.values(overtimeByType).reduce((total, hours) => total + hours, 0)),
    paidLeaveDays: leaveRows.filter(row => paidLeaveTypes.includes(row.leaveType)).length,
    unpaidLeaveDays: leaveRows.filter(row => !paidLeaveTypes.includes(row.leaveType)).length,
    leaveDays: leaveRows.length,
    rows,
  };
}

/* -------------------------------------------------------------- pay items */

/**
 * Recurring earnings from the employee's own salary record, plus anything the
 * Earning Management register assigns them for this period, plus one-time
 * entries encoded or uploaded onto the line. A monthly earning is divided by
 * the number of payroll periods in a month; a one-time earning is paid whole.
 */
export function earningItemsFor({ salary, registerEarnings = [], manual = [], transaction, employee }) {
  const periodsPerMonth = PERIODS_PER_YEAR[transaction.paymentMode] / 12;
  // A recurring earning is spread across the periods of the month it accrues
  // in. A quarterly or annual one falls due in the last period of its cycle
  // rather than being silently dropped, which is what returning zero every
  // period would amount to.
  const month = Number(String(toIsoDate(transaction.periodEnd)).slice(5, 7)) || 1;
  const lastPeriodOfMonth = transaction.paymentMode === 'Monthly' || transaction.frequency !== 'First Half';
  const perPeriod = (amount, frequency) => {
    if (frequency === 'One-time' || frequency === 'Once') return number(amount);
    if (frequency === 'Annually' || frequency === 'Annual') return lastPeriodOfMonth && month === 12 ? number(amount) : 0;
    if (frequency === 'Quarterly') return lastPeriodOfMonth && month % 3 === 0 ? number(amount) : 0;
    if (frequency === 'Semi-monthly') return number(amount);
    return round2(number(amount) / periodsPerMonth);
  };

  const recurring = (salary?.earnings || [])
    // The basic salary row is the basic pay the run computes in its own step;
    // paying it again from the earnings list would double the employee.
    .filter(row => row.classification !== 'Taxable Basic' && row.classification !== 'Taxable Bonus')
    .filter(row => withinPeriod(transaction.periodEnd, row.periodStart, row.periodEnd))
    .map(row => ({
      code: row.earningCode,
      name: row.earningName,
      classification: row.classification,
      frequency: row.frequency,
      amount: perPeriod(row.earningsAmount, row.frequency),
      monthlyAmount: number(row.earningsAmount),
      source: 'Employee salary record',
    }));

  const assigned = registerEarnings
    .filter(row => (row.status || 'Active') === 'Active')
    .filter(row => String(row.employee || '').startsWith(employee.code))
    .filter(row => withinPeriod(transaction.periodEnd, row.periodStart || row.effectiveDate, row.periodEnd))
    .map(row => ({
      code: row.code,
      name: row.name,
      classification: row.name === 'De Minimis Benefit' ? 'De Minimis' : 'Taxable Allowance',
      frequency: row.frequency,
      amount: row.basis === 'Percentage'
        ? round2(number(employee.payroll?.monthlyRate) * number(row.amount) / 100 / periodsPerMonth)
        : perPeriod(row.amount, row.frequency),
      monthlyAmount: number(row.amount),
      source: 'Earning Management',
    }));

  return [...recurring, ...assigned, ...manual.map(row => ({ ...row, source: row.source || 'Encoded on the transaction' }))]
    .filter(row => row.amount !== 0);
}

/**
 * Deductions and loans, in the order the REF-011 hierarchy publishes.
 *
 * A collection never exceeds the outstanding balance and a schedule that has
 * cleared or passed its end date stops collecting, so a settled item cannot
 * reappear on a later payroll.
 */
export function collectionItemsFor({ salary, loanSchedules = [], registerDeductions = [], manual = [], transaction, employee, hierarchy = [] }) {
  const rankOf = (name, group) => {
    const entry = hierarchy.find(row => row.name === name)
      || hierarchy.find(row => row.group === group && row.kind && name.toLowerCase().includes(row.kind.toLowerCase()));
    return entry ? Number(entry.rank) : group === 'Loan' ? 40 : 60;
  };
  const payoutDate = toIsoDate(transaction.payoutDate);

  const companyDeductions = (salary?.companyDeductions || [])
    .filter(row => number(row.totalBalance) > 0)
    .filter(row => !row.endDate || toIsoDate(row.endDate) >= payoutDate)
    .map(row => ({
      code: `DED-${String(row.deductionName || '').slice(0, 6).toUpperCase().replace(/\s/g, '')}`,
      name: row.deductionName,
      group: 'Deduction',
      kind: 'Company',
      due: round2(Math.min(number(row.amountOfDeduction), number(row.totalBalance))),
      outstanding: number(row.totalBalance),
      rank: rankOf(row.deductionName, 'Deduction'),
      canAdjust: true,
      source: 'Employee salary record',
    }));

  const assigned = registerDeductions
    .filter(row => (row.status || 'Active') === 'Active')
    .filter(row => String(row.employee || '').startsWith(employee.code))
    .filter(row => !row.endDate || toIsoDate(row.endDate) >= payoutDate)
    .map(row => ({
      code: row.code,
      name: row.name,
      group: 'Deduction',
      kind: 'Company',
      due: round2(Math.min(number(row.amount), number(row.balance) || number(row.amount))),
      outstanding: number(row.balance) || number(row.amount),
      rank: rankOf(row.name, 'Deduction'),
      canAdjust: true,
      source: 'Deduction Management',
    }));

  const loans = loanSchedules
    .filter(row => (row.status || 'ACTIVE') === 'ACTIVE' && number(row.balance) > 0)
    .filter(row => !row.periodEndDate || toIsoDate(row.periodEndDate) >= payoutDate)
    .map(row => ({
      code: row.transactionNumber || row.id,
      name: row.loanName,
      group: 'Loan',
      kind: row.loanType === 'Government Loan' ? 'Government' : 'Company',
      due: round2(Math.min(number(row.deductionAmount), number(row.balance))),
      outstanding: number(row.balance),
      rank: rankOf(row.loanName, 'Loan'),
      canAdjust: true,
      authorised: row.authorityToDeduct ? row.authorityToDeduct.acknowledged !== false : true,
      source: row.loanType === 'Government Loan' ? 'Government Loan Management' : 'Company Loan Management',
    }));

  return [...loans, ...companyDeductions, ...assigned, ...manual]
    .filter(item => item.due > 0)
    .sort((left, right) => left.rank - right.rank);
}

/* ------------------------------------------------------- take-home policy */

/**
 * The Take-Home Pay policy applied to a real line.
 *
 * Statutory contributions are never adjusted; controllable items are deferred
 * from the top of the hierarchy down until net pay clears the protected
 * minimum. Choosing "Loan Deduction Cap" as the conflict priority means loans
 * keep collecting and the shortfall is raised as an exception instead.
 *
 * `PolicyComputations.takeHomeResult` calls this same function with its
 * simulator's figures, so the engine and the policy screen can never disagree
 * about what the policy does.
 */
export function applyTakeHomePolicy({
  policy = {}, items = [], gross = 0, statutory = 0, protectedBase = 0,
  attendanceDays = 0, baseFor = () => protectedBase,
}) {
  const working = items.map(item => ({ ...item, deducted: number(item.due), deferred: 0, priorDeferred: number(item.priorDeferred) }));
  const protectedMinimum = policy.thresholdType === 'Fixed Amount'
    ? number(policy.threshold)
    : round2(number(protectedBase) * number(policy.threshold) / 100);

  const deferFrom = (candidates, requested) => {
    let remaining = Math.max(0, requested);
    [...candidates].filter(item => item.canAdjust !== false).sort((a, b) => a.rank - b.rank).forEach(item => {
      if (remaining <= 0) return;
      const amount = Math.min(item.deducted, remaining);
      item.deducted = round2(item.deducted - amount);
      item.deferred = round2(item.deferred + amount);
      remaining = round2(remaining - amount);
    });
    return remaining;
  };

  const capAmount = (type, base, value, fallback) => {
    if (type === 'Fixed Amount') return number(value);
    if (type === 'Percentage') return round2(number(baseFor(base)) * number(value) / 100);
    return fallback;
  };

  const loans = working.filter(item => item.group === 'Loan');
  const attendance = working.filter(item => item.kind === 'Attendance');
  const others = working.filter(item => item.group === 'Deduction' && item.kind !== 'Attendance');

  if (policy.deductionCapEnabled) {
    const capped = [...others, ...attendance];
    const total = sum(capped, item => item.deducted);
    deferFrom(capped, total - capAmount(policy.deductionCapType, policy.deductionCapBase, policy.deductionCap, total));
  }
  const loanTotal = sum(loans, item => item.deducted);
  deferFrom(loans, loanTotal - capAmount(policy.loanCapType, policy.loanCapBase, policy.loanCap, loanTotal));

  if (attendance.length) {
    // An attendance cap may be expressed in days rather than pesos: only the
    // capped number of days is collected and the rest is carried forward.
    const attendanceDue = sum(attendance, item => item.deducted);
    let cap = attendanceDue;
    if (policy.attendanceCapType === 'Number of Days') {
      const days = number(attendanceDays);
      if (days > number(policy.attendanceCap)) cap = round2(attendanceDue * number(policy.attendanceCap) / Math.max(1, days));
    } else {
      cap = capAmount(policy.attendanceCapType, policy.attendanceCapBase, policy.attendanceCap, attendanceDue);
    }
    deferFrom(attendance, attendanceDue - cap);
  }

  const preliminaryNet = round2(gross - statutory - sum(working, item => item.deducted));
  const adjustable = policy.priorityChoice === 'Loan Deduction Cap' ? working.filter(item => item.group !== 'Loan') : working;
  if (policy.enabled !== false && policy.autoDefer && preliminaryNet < protectedMinimum) {
    deferFrom(adjustable, round2(protectedMinimum - preliminaryNet));
  }

  const deducted = round2(sum(working, item => item.deducted));
  const netPay = round2(gross - statutory - deducted);
  return {
    items: working.map(item => ({
      ...item,
      accumulated: round2(item.priorDeferred + item.deferred),
      remaining: round2(Math.max(0, number(item.outstanding) - item.deducted)),
    })),
    originalDeductions: round2(sum(working, item => item.due)),
    protectedMinimum,
    protectedBase: round2(protectedBase),
    deducted,
    deferred: round2(sum(working, item => item.deferred)),
    netPay,
    exception: netPay + 0.005 < protectedMinimum,
    shortfall: round2(Math.max(0, protectedMinimum - netPay)),
    capBlocked: policy.priorityChoice === 'Loan Deduction Cap' && netPay + 0.005 < protectedMinimum,
  };
}

/* --------------------------------------------------------------- one line */

/**
 * Compute one employee's payroll line.
 *
 * `context` carries the resolved dependencies; `transaction` carries the run's
 * own configuration. The returned line holds both the figures and the ordered
 * steps that produced them.
 */
export function computeEmployeeLine({ employee, transaction, context }) {
  const library = context.computations || seedComputations();
  const { steps, record } = makeStepper(library);
  const config = transaction.config || {};
  const override = (transaction.overrides || {})[employee.employeeId] || {};
  const pay = employee.payroll || {};
  const salary = (context.salaryInformation || []).find(row => row.employeeId === employee.employeeId) || null;
  const schedules = context.statutory || {};
  const exceptions = [];

  const eligibility = eligibilityFor(employee, transaction);
  if (!eligibility.included) {
    return {
      employeeId: employee.employeeId, employeeCode: employee.code, name: employee.name,
      department: employee.department, position: employee.position, costCenter: employee.costCenter,
      status: 'Excluded', exclusionReason: eligibility.reason, steps: [], exceptions: [], netPay: 0,
    };
  }

  /* 1 — rates ------------------------------------------------------------- */
  const basicRecord = (salary?.basicPay || [])[0] || {};
  const factorDays = number(config.workDaysPerYear) || number(pay.factorDays) || 261;
  const workHours = number(config.workHoursPerDay) || number(pay.workHoursPerDay) || 8;
  const monthlyRate = number(basicRecord.monthlyRate) || number(pay.monthlyRate);
  const dailyRate = record({
    code: 'BAS-001', category: 'Basic Pay', source: 'Employee salary record',
    inputs: { monthly_basic: monthlyRate, factor_days: factorDays },
    detail: `Monthly ${monthlyRate.toLocaleString()} × 12 ÷ ${factorDays} factor days`,
  });
  const hourlyRate = record({
    code: 'BAS-002', category: 'Basic Pay', inputs: { daily_rate: dailyRate, work_hours: workHours },
    detail: `Daily rate ÷ ${workHours} work hours`,
  });
  const minuteRate = record({ code: 'BAS-003', category: 'Basic Pay', inputs: { hourly_rate: hourlyRate }, detail: 'Hourly rate ÷ 60' });

  /* 2 — attendance -------------------------------------------------------- */
  const attendance = attendanceFor(context.timeLogs || [], employee.employeeId, transaction);
  const periodWorkingDays = workingDaysBetween(transaction.periodStart, transaction.periodEnd) || 1;

  /* 3 — basic pay --------------------------------------------------------- */
  const payableFrom = [toIsoDate(transaction.periodStart), toIsoDate(employee.dateHired)].sort().pop();
  const separated = toIsoDate(employee.dateSeparated);
  const payableTo = separated && separated < toIsoDate(transaction.periodEnd) ? separated : toIsoDate(transaction.periodEnd);
  const payableDays = workingDaysBetween(payableFrom, payableTo);
  const prorated = payableDays < periodWorkingDays;

  let basicPay = 0;
  const zeroBasic = override.zeroBasicPay ?? config.zeroBasicPay;
  if (zeroBasic) {
    basicPay = 0;
    record({ code: 'ERN-001', category: 'Basic Pay', amount: 0, evaluate: false, detail: 'Zero Basic Pay is set for this run — basic pay is not computed', source: 'Transaction configuration' });
  } else if (pay.payType === 'Daily') {
    const days = attendance.daysCovered ? attendance.daysWorked + attendance.paidLeaveDays : number(config.daysInPeriod);
    basicPay = round2(dailyRate * days);
    record({
      code: 'MWE-001', label: pay.mwe === 'Yes' ? 'MWE Pay with ECOLA' : 'Daily-paid basic pay', category: 'Basic Pay',
      inputs: { daily_rate: dailyRate, days_worked: days, ecola_amount: pay.mwe === 'Yes' ? number(pay.ecolaPerDay) : 0 },
      detail: `${days} rendered ${days === 1 ? 'day' : 'days'} × daily rate${pay.mwe === 'Yes' ? ` + ECOLA ₱${number(pay.ecolaPerDay)}/day` : ''}`,
      source: 'Timekeeping punch record',
    });
    if (pay.mwe === 'Yes') basicPay = round2(basicPay + number(pay.ecolaPerDay) * days);
  } else if (pay.payType === 'Hourly') {
    const hours = attendance.hoursWorked || number(config.hoursInPeriod);
    basicPay = round2(hourlyRate * hours);
    record({ code: 'PRT-001', category: 'Basic Pay', inputs: { part_time_hours: hours, hourly_rate: hourlyRate }, detail: `${hours} rendered hours × hourly rate`, source: 'Timekeeping punch record' });
  } else {
    const full = record({ code: 'ERN-001', category: 'Basic Pay', inputs: { monthly_basic: monthlyRate }, detail: `Monthly rate ÷ ${PERIODS_PER_YEAR[transaction.paymentMode] / 12} periods per month` });
    basicPay = transaction.paymentMode === 'Monthly' ? monthlyRate : full;
    if (prorated && config.computeBasicPayAdjustment !== false) {
      const factor = payableDays / periodWorkingDays;
      const adjusted = round2(basicPay * factor);
      record({
        code: 'BAS-004', label: 'Basic pay proration', category: 'Basic Pay', amount: adjusted, evaluate: false,
        inputs: { basic_pay: basicPay, payable_days: payableDays, period_days: periodWorkingDays },
        detail: `${payableDays} of ${periodWorkingDays} working days payable (${employee.dateHired > toIsoDate(transaction.periodStart) ? `hired ${employee.dateHired}` : `separated ${employee.dateSeparated}`})`,
        source: 'Employee Masterfile effective dates',
      });
      basicPay = adjusted;
    }
  }

  /* 4 — attendance deductions and premiums -------------------------------- */
  // A daily- or hourly-paid employee is already paid only for rendered time, so
  // deducting absences and undertime again would collect them twice.
  const priceAttendance = pay.payType === 'Monthly' && !zeroBasic;
  const attendanceItems = [];
  const adjust = config.computeAttendanceAdjustment || { absences: true, late: true, undertime: true };

  if (priceAttendance && adjust.absences && attendance.absentDays > 0 && pay.absenceClassification !== 'Exempt') {
    const amount = record({ code: 'DED-001', category: 'Deductions', inputs: { daily_rate: dailyRate, absent_days: attendance.absentDays }, detail: `${attendance.absentDays} unpaid ${attendance.absentDays === 1 ? 'absence' : 'absences'} in the timekeeping cutoff`, source: 'Timekeeping punch record' });
    attendanceItems.push({ code: 'ATT-ABS', name: 'Absences', group: 'Deduction', kind: 'Attendance', due: amount, outstanding: amount, rank: 90, canAdjust: true, source: 'Timekeeping' });
  }
  if (priceAttendance && attendance.unpaidLeaveDays > 0) {
    // Leave without pay is an unworked day the employee filed for, so it is
    // priced like an absence rather than being silently paid.
    const amount = record({ code: 'DED-001', label: 'Leave without pay', category: 'Deductions', inputs: { daily_rate: dailyRate, absent_days: attendance.unpaidLeaveDays }, detail: `${attendance.unpaidLeaveDays} approved unpaid leave ${attendance.unpaidLeaveDays === 1 ? 'day' : 'days'}`, source: 'Timekeeping punch record' });
    attendanceItems.push({ code: 'ATT-LWOP', name: 'Leave without pay', group: 'Deduction', kind: 'Attendance', due: amount, outstanding: amount, rank: 93, canAdjust: false, source: 'Timekeeping' });
  }
  if (priceAttendance && adjust.late && attendance.tardinessMinutes > 0 && pay.tardinessClassification !== 'Exempt') {
    const amount = record({ code: 'DED-002', category: 'Deductions', inputs: { hourly_rate: hourlyRate, late_minutes: attendance.tardinessMinutes }, detail: `${attendance.tardinessMinutes} late minutes × per-minute rate`, source: 'Timekeeping punch record' });
    attendanceItems.push({ code: 'ATT-LATE', name: 'Tardiness', group: 'Deduction', kind: 'Attendance', due: amount, outstanding: amount, rank: 91, canAdjust: true, source: 'Timekeeping' });
  }
  if (priceAttendance && adjust.undertime && attendance.undertimeMinutes > 0 && pay.undertimeClassification !== 'Exempt') {
    const amount = record({ code: 'DED-003', category: 'Deductions', inputs: { hourly_rate: hourlyRate, undertime_minutes: attendance.undertimeMinutes }, detail: `${attendance.undertimeMinutes} undertime minutes × per-minute rate`, source: 'Timekeeping punch record' });
    attendanceItems.push({ code: 'ATT-UT', name: 'Undertime', group: 'Deduction', kind: 'Attendance', due: amount, outstanding: amount, rank: 92, canAdjust: true, source: 'Timekeeping' });
  }

  const overtimeEarnings = [];
  if (pay.overtimeClassification !== 'Exempt' && config.computeOvertimeAdjustment !== false) {
    Object.entries(attendance.overtimeByType).forEach(([type, hours]) => {
      const multiplier = OT_MULTIPLIERS[type] || 1.25;
      const code = type === 'Night Differential' ? 'ERN-003' : type === 'Holiday' ? 'ERN-006' : 'ERN-002';
      const amount = code === 'ERN-006'
        ? record({ code, category: 'Earnings', inputs: { hourly_rate: hourlyRate, holiday_hours: hours, holiday_rate: multiplier }, detail: `${hours} holiday overtime hours at ${multiplier}×`, source: 'Timekeeping punch record' })
        : record({ code, category: 'Earnings', inputs: { hourly_rate: hourlyRate, ot_hours: hours, ot_rate: multiplier }, detail: `${hours} approved ${type.toLowerCase()} overtime hours at ${multiplier}×`, source: 'Timekeeping punch record' });
      overtimeEarnings.push({ code: `OT-${type.slice(0, 3).toUpperCase()}`, name: `Overtime — ${type}`, classification: 'Taxable Allowance', amount, hours, multiplier, source: 'Timekeeping' });
    });
  }

  /* 5 — earnings ---------------------------------------------------------- */
  const configured = earningItemsFor({
    salary,
    registerEarnings: (context.registers?.earnings) || [],
    manual: override.earnings || [],
    transaction, employee,
  });
  const monthIndex = Number(String(toIsoDate(transaction.periodEnd)).slice(5, 7)) || 1;
  const deMinimisVersion = schedules.deMinimis;
  const earnings = [];
  configured.forEach(item => {
    if (config.zeroVariableAllowance && item.source === 'Employee salary record' && item.classification === 'Taxable Allowance') return;
    if (item.classification !== 'De Minimis') { earnings.push(item); return; }
    // A De Minimis benefit is non-taxable only up to its own annual ceiling; the
    // excess is reclassified as taxable rather than dropped (RCL-001).
    const usedToDate = round2(item.monthlyAmount * Math.max(0, monthIndex - 1));
    const split = splitDeMinimis(deMinimisVersion, item.name, item.amount, usedToDate);
    record({
      code: 'DMN-001', category: 'Benefits', amount: split.remaining ?? 0, evaluate: false,
      inputs: { de_minimis_ceiling: split.ceiling ?? 0, de_minimis_paid_ytd: usedToDate },
      detail: `${item.name}: ₱${(split.ceiling ?? 0).toLocaleString()} annual ceiling less ₱${usedToDate.toLocaleString()} used to date`,
      source: 'De Minimis statutory table',
    });
    earnings.push({ ...item, amount: split.nonTaxable, ceiling: split.ceiling, usedToDate });
    if (split.taxable > 0) {
      record({ code: 'RCL-001', category: 'Tax', amount: split.taxable, evaluate: false, inputs: { de_minimis_paid_ytd: usedToDate, non_taxable_earnings: item.amount, de_minimis_ceiling: split.ceiling ?? 0 }, detail: `${item.name} above ceiling reclassified as taxable`, source: 'De Minimis statutory table' });
      earnings.push({ code: `${item.code}-X`, name: `${item.name} (above ceiling)`, classification: 'Taxable Allowance', amount: split.taxable, source: 'Reclassified from De Minimis' });
      exceptions.push({ severity: 'Info', message: `${item.name} exceeded its De Minimis ceiling; ₱${split.taxable.toLocaleString()} was reclassified as taxable.` });
    }
  });
  const allEarnings = [...earnings, ...overtimeEarnings];

  /* 6 — bonuses ----------------------------------------------------------- */
  const bonusCeiling = number(context.bonusCeiling) || 90000;
  const bonuses = [];
  if (config.thirteenthMonth?.enabled && pay.thirteenthMonthClassification !== 'Exempt') {
    // Annex C 3.g.9 offers "0 for all taxable" as a real choice, so an explicit
    // zero is a threshold of zero — not a missing value falling back to ₱90,000.
    const configuredThreshold = config.thirteenthMonth.ntThreshold;
    const ceiling = Number.isFinite(Number(configuredThreshold)) && configuredThreshold !== '' && configuredThreshold !== null
      ? Number(configuredThreshold)
      : bonusCeiling;
    const remainingCeiling = record({
      code: 'BON-004', category: 'Bonus', inputs: { bonus_tax_ceiling: ceiling, bonus_paid_ytd: number(employee.ytd?.bonusPaid) },
      detail: ceiling === 0 ? 'Threshold set to zero for this run — every bonus is taxable' : 'Non-taxable ceiling less bonuses already paid this year',
      source: 'Bonus ceiling reference table',
    });
    let available = remainingCeiling;
    const selected = (config.thirteenthMonth.bonusTypes || ['13th Month Pay']);
    const registerBonuses = ((context.registers?.bonuses) || [])
      .filter(row => String(row.employee || '').startsWith(employee.code) && selected.includes(row.name));

    selected.forEach(type => {
      let amount = 0;
      if (config.thirteenthMonth.basis === 'Custom / uploaded value') {
        amount = number((override.bonuses || []).find(row => row.name === type)?.amount);
      } else if (type === '13th Month Pay') {
        const ytdBasic = number(employee.ytd?.basicEarnings) + basicPay;
        amount = record({ code: 'BON-002', category: 'Bonus', inputs: { basic_earnings_ytd: ytdBasic }, detail: 'Basic earnings year to date ÷ 12', source: 'Employee YTD payroll record' });
      } else {
        amount = number(registerBonuses.find(row => row.name === type)?.amount);
      }
      if (amount <= 0) return;
      const nonTaxable = round2(Math.min(amount, available));
      const taxable = round2(amount - nonTaxable);
      available = round2(available - nonTaxable);
      if (taxable > 0) {
        record({ code: 'BON-003', category: 'Bonus', amount: taxable, evaluate: false, inputs: { other_bonus: amount, bonus_tax_ceiling: nonTaxable }, detail: `${type} above the remaining ceiling is taxable`, source: 'Bonus ceiling reference table' });
        exceptions.push({ severity: 'Info', message: `${type} exceeded the remaining ₱${bonusCeiling.toLocaleString()} ceiling; ₱${taxable.toLocaleString()} is taxable.` });
      }
      bonuses.push({ name: type, amount, nonTaxable, taxable, ceilingBefore: round2(available + nonTaxable), source: config.thirteenthMonth.basis === 'Custom / uploaded value' ? 'Uploaded on the transaction' : 'Bonus Management' });
    });
  }

  /* 7 — gross pay --------------------------------------------------------- */
  const taxableEarnings = round2(sum(allEarnings.filter(item => classOf(item.classification).taxable), item => item.amount));
  const nonTaxableEarnings = round2(sum(allEarnings.filter(item => !classOf(item.classification).taxable), item => item.amount));
  const taxableBonus = round2(sum(bonuses, item => item.taxable));
  const nonTaxableBonus = round2(sum(bonuses, item => item.nonTaxable));
  const grossPay = record({
    code: 'PAY-001', category: 'Payroll Result',
    inputs: { basic_pay: basicPay, taxable_earnings: taxableEarnings, non_taxable_earnings: nonTaxableEarnings, other_bonus: round2(taxableBonus + nonTaxableBonus) },
    detail: 'Basic pay plus every earning and bonus classified on this line',
  });

  /* 8 — statutory contributions ------------------------------------------ */
  const computeStatutory = override.computeAllowableDeduction ?? config.computeAllowableDeduction;
  const agencies = config.statutoryAgencies || { sss: true, philhealth: true, pagibig: true, sssWisp: true };
  const periodsPerMonth = PERIODS_PER_YEAR[transaction.paymentMode] / 12;
  const collectStatutory = config.statutorySchedule === 'Every payroll (split)' || !config.statutorySchedule
    ? 1 / periodsPerMonth
    : (config.statutorySchedule === 'First cutoff only' && transaction.frequency === 'First Half')
      || (config.statutorySchedule === 'Second cutoff only' && transaction.frequency !== 'First Half') ? 1 : 0;

  const statutoryBasis = pay.payType === 'Monthly' ? monthlyRate : round2(dailyRate * factorDays / 12);
  const onHoldWithoutContributions = eligibility.onHold && employee.continueStatutoryOnHold === 'No';
  const sss = computeStatutory && agencies.sss && pay.withSss === 'Yes' && !onHoldWithoutContributions
    ? sssContribution(schedules.sss, statutoryBasis) : { employee: 0, employer: 0, ec: 0, mpfEmployee: 0, mpfEmployer: 0, regularEmployee: 0, regularEmployer: 0, bracket: null };
  const philhealth = computeStatutory && agencies.philhealth && pay.withPhilhealth === 'Yes' && !onHoldWithoutContributions
    ? rateContribution(schedules.philhealth, statutoryBasis) : { employee: 0, employer: 0, bracket: null };
  const pagibig = computeStatutory && agencies.pagibig && pay.withHdmf === 'Yes' && !onHoldWithoutContributions
    ? rateContribution(schedules.pagibig, statutoryBasis) : { employee: 0, employer: 0, bracket: null };

  const share = value => round2(number(value) * collectStatutory);
  const statutoryLine = {
    sssEmployee: share(agencies.sssWisp === false ? sss.regularEmployee : sss.employee),
    sssEmployer: share(sss.employer),
    sssRegularEmployee: share(sss.regularEmployee),
    sssMpfEmployee: share(agencies.sssWisp === false ? 0 : sss.mpfEmployee),
    sssMpfEmployer: share(sss.mpfEmployer),
    ec: share(sss.ec),
    philhealthEmployee: share(philhealth.employee),
    philhealthEmployer: share(philhealth.employer),
    hdmfEmployee: share(pagibig.employee),
    hdmfEmployer: share(pagibig.employer),
  };
  // Pag-IBIG above the mandatory share is a voluntary contribution the 201 file
  // carries; it is a company deduction, not a statutory one.
  const voluntaryHdmf = computeStatutory && pay.withHdmf === 'Yes'
    ? round2(Math.max(0, number(pay.hdmfEmployeeContribution) - pagibig.employee) * collectStatutory) : 0;

  if (statutoryLine.sssEmployee) record({ code: 'GOV-001', category: 'Government', amount: statutoryLine.sssEmployee, evaluate: false, inputs: { monthly_basic: statutoryBasis, sss_msc: sss.bracket?.mscRegular ?? 0 }, detail: `MSC ₱${(sss.bracket?.totalMsc ?? 0).toLocaleString()} → EE ₱${sss.employee} monthly${collectStatutory < 1 ? `, ${Math.round(collectStatutory * 100)}% collected this cutoff` : ''}`, source: 'SSS contribution table' });
  if (statutoryLine.philhealthEmployee) record({ code: 'GOV-002', category: 'Government', amount: statutoryLine.philhealthEmployee, evaluate: false, inputs: { monthly_basic: statutoryBasis, philhealth_rate: number(philhealth.bracket?.eeRate) / 100 }, detail: `Premium ${philhealth.bracket?.unit === 'Percentage (%)' ? `${philhealth.bracket.eeRate}% of ₱${statutoryBasis.toLocaleString()}` : 'at the bracket amount'} → EE ₱${philhealth.employee} monthly`, source: 'PhilHealth contribution table' });
  if (statutoryLine.hdmfEmployee) record({ code: 'GOV-003', category: 'Government', amount: statutoryLine.hdmfEmployee, evaluate: false, inputs: { monthly_basic: statutoryBasis, hdmf_rate: number(pagibig.bracket?.eeRate) / 100 }, detail: `EE ₱${pagibig.employee} monthly on compensation capped by the active table`, source: 'Pag-IBIG contribution table' });
  if (!computeStatutory) record({ code: 'GOV-001', label: 'Allowable deductions not computed', category: 'Government', amount: 0, evaluate: false, inputs: {}, detail: 'Compute Allowable Deduction is off for this run', source: 'Transaction configuration' });
  if (computeStatutory && pay.withHdmf === 'No') exceptions.push({ severity: 'Info', message: 'Pag-IBIG is switched off in this employee\'s 201 file, so no HDMF contribution was computed.' });

  const statutoryEmployee = round2(statutoryLine.sssEmployee + statutoryLine.philhealthEmployee + statutoryLine.hdmfEmployee);
  const statutoryEmployer = round2(statutoryLine.sssEmployer + statutoryLine.philhealthEmployer + statutoryLine.hdmfEmployer);

  /* 9 — taxable income and withholding tax -------------------------------- */
  const taxableGross = round2(basicPay + taxableEarnings + taxableBonus);
  let taxableIncome = 0;
  let withholdingTax = 0;
  let taxBasis = 'Not computed';
  const computeTax = config.computeTax !== false;
  const exemptFromTax = pay.withWithholdingTax !== 'Yes' || pay.mwe === 'Yes';

  if (!computeTax) {
    record({ code: 'TAX-002', label: 'Withholding tax not computed', category: 'Tax', amount: 0, evaluate: false, inputs: {}, detail: 'Compute Tax is off for this run', source: 'Transaction configuration' });
  } else if (exemptFromTax) {
    taxBasis = pay.mwe === 'Yes' ? 'Minimum wage earner — statutory exemption' : 'Withholding tax switched off in the 201 file';
    record({ code: 'TAX-002', label: 'Withholding tax exempt', category: 'Tax', amount: 0, evaluate: false, inputs: {}, detail: taxBasis, source: 'Employee Masterfile' });
  } else {
    taxableIncome = record({
      code: 'TAX-001', category: 'Tax',
      inputs: { gross_pay: round2(taxableGross + nonTaxableEarnings + nonTaxableBonus), non_taxable_earnings: round2(nonTaxableEarnings + nonTaxableBonus), statutory_deductions: statutoryEmployee },
      detail: 'Taxable gross less non-taxable earnings and the employee statutory share',
    });
    if (eligibility.finalPay) {
      // Final pay annualises: the year's taxable income, including previous
      // employer data, against the annual table, less what was already withheld.
      const previous = employee.previousEmployer || {};
      const annualTaxable = round2(number(employee.ytd?.taxableEarnings) + taxableIncome + number(previous.grossTaxableIncome));
      const due = graduatedTax(schedules.annualTax, annualTaxable, 'Annual').tax;
      const alreadyWithheld = round2(number(employee.ytd?.taxWithheld) + number(previous.taxWithheld));
      withholdingTax = round2(Math.max(0, due - alreadyWithheld));
      taxBasis = 'Annualised (BIR annual table) — final pay';
      record({
        code: 'TAX-008', category: 'Tax', amount: withholdingTax, evaluate: false,
        inputs: { basic_earnings_ytd: number(employee.ytd?.taxableEarnings), taxable_earnings: taxableIncome, previous_employer_taxable: number(previous.grossTaxableIncome), withholding_tax: alreadyWithheld },
        detail: `Annual tax due ₱${due.toLocaleString()} on ₱${annualTaxable.toLocaleString()} less ₱${alreadyWithheld.toLocaleString()} already withheld`,
        source: 'BIR annual tax table',
      });
      if (due < alreadyWithheld) exceptions.push({ severity: 'Info', message: `Over-withholding of ₱${round2(alreadyWithheld - due).toLocaleString()} — a tax refund is due on this final pay.` });
    } else {
      const result = graduatedTax(schedules.tax, taxableIncome, transaction.paymentMode);
      withholdingTax = result.tax;
      taxBasis = `${transaction.paymentMode} compensation table`;
      record({
        code: 'TAX-002', category: 'Tax', amount: withholdingTax, evaluate: false,
        inputs: { taxable_income: taxableIncome, tax_rate: number(result.bracket?.excessRate) / 100, tax_offset: number(result.bracket?.fixedTax) },
        detail: result.bracket ? `Bracket ₱${result.bracket.minimum.toLocaleString()}–₱${result.bracket.maximum.toLocaleString()}: ₱${result.bracket.fixedTax.toLocaleString()} + ${result.bracket.excessRate}% of the excess` : 'Below the first taxable bracket',
        source: 'BIR compensation tax table',
      });
    }
  }

  /* 10 — gross up --------------------------------------------------------- */
  let grossUp = null;
  if ((config.grossUpAll || pay.grossUp === 'Yes') && computeTax && !exemptFromTax && taxableIncome > 0) {
    // Back-solve the gross that leaves the employee whole after tax, iterating
    // against the same table rather than the flat-rate shortcut.
    let candidate = taxableIncome;
    const target = taxableIncome;
    for (let iteration = 0; iteration < 25; iteration += 1) {
      const tax = graduatedTax(schedules.tax, candidate, transaction.paymentMode).tax;
      const net = candidate - tax;
      if (Math.abs(net - target) < 0.01) break;
      candidate = round2(candidate + (target - net));
    }
    const tax = graduatedTax(schedules.tax, candidate, transaction.paymentMode).tax;
    grossUp = { grossedUp: round2(candidate), employerTax: round2(tax), uplift: round2(candidate - taxableIncome) };
    record({ code: 'GUP-001', category: 'Tax', amount: grossUp.grossedUp, evaluate: false, inputs: { target_net_pay: target }, detail: `Iterated against the ${transaction.paymentMode} table until net equalled the target; the employer absorbs ₱${grossUp.employerTax.toLocaleString()}`, source: 'Gross-Up policy engine' });
    withholdingTax = 0;
  }

  /* 11 — deductions and loans --------------------------------------------- */
  const collections = collectionItemsFor({
    salary,
    loanSchedules: (context.loanSchedules || []).filter(row => row.employeeId === employee.employeeId),
    registerDeductions: (context.registers?.deductions) || [],
    manual: override.deductions || [],
    transaction, employee, hierarchy: context.hierarchy || [],
  });
  collections.filter(item => item.authorised === false).forEach(item => {
    exceptions.push({ severity: 'Warning', message: `${item.name} has no acknowledged authority to deduct; it is held out of this run.` });
  });
  const collectible = [...collections.filter(item => item.authorised !== false), ...attendanceItems];
  if (voluntaryHdmf > 0) {
    collectible.push({ code: 'HDMF-VOL', name: 'Pag-IBIG voluntary contribution', group: 'Deduction', kind: 'Company', due: voluntaryHdmf, outstanding: voluntaryHdmf, rank: 50, canAdjust: false, source: 'Employee Masterfile' });
  }

  /* 12 — take-home pay policy --------------------------------------------- */
  const takeHomePolicy = context.policies?.takeHome || {};
  const protectedBase = takeHomePolicy.base === 'Basic Pay' ? basicPay
    : takeHomePolicy.base === 'Gross Pay less Reimbursements' ? round2(grossPay - sum(allEarnings.filter(item => classOf(item.classification).group === 'Receivables / Reimbursements'), item => item.amount))
    : grossPay;
  const applied = applyTakeHomePolicy({
    policy: takeHomePolicy,
    items: collectible,
    gross: round2(grossPay - withholdingTax),
    statutory: statutoryEmployee,
    protectedBase,
  });
  record({ code: 'THP-001', category: 'Take-Home Pay', amount: applied.protectedMinimum, evaluate: false, inputs: { take_home_base: protectedBase, minimum_take_home_rate: number(takeHomePolicy.threshold) / 100 }, detail: `${takeHomePolicy.thresholdType === 'Fixed Amount' ? 'Fixed' : `${takeHomePolicy.threshold}% of ${takeHomePolicy.base || 'Gross Pay'}`} protected minimum net`, source: 'Take-Home Pay policy engine' });
  if (applied.deferred > 0) {
    record({ code: 'THP-002', category: 'Take-Home Pay', amount: applied.deferred, evaluate: false, inputs: { gross_pay: grossPay, statutory_deductions: statutoryEmployee, take_home_base: protectedBase }, detail: 'Controllable deductions deferred so net pay clears the protected minimum', source: 'Take-Home Pay policy engine' });
    exceptions.push({ severity: 'Info', message: `₱${applied.deferred.toLocaleString()} of deductions was deferred to protect the minimum take-home pay.` });
  }
  if (applied.exception) exceptions.push({ severity: 'Warning', message: `Net pay of ₱${applied.netPay.toLocaleString()} is below the protected minimum of ₱${applied.protectedMinimum.toLocaleString()}.` });

  /* 13 — net pay and bank splits ------------------------------------------ */
  const totalDeductions = round2(statutoryEmployee + withholdingTax + applied.deducted);
  const netPay = record({
    code: 'PAY-002', category: 'Payroll Result',
    inputs: {
      gross_pay: grossPay, withholding_tax: withholdingTax, statutory_deductions: statutoryEmployee,
      other_deductions: round2(sum(applied.items.filter(item => item.group !== 'Loan'), item => item.deducted)),
      loan_amortizations: round2(sum(applied.items.filter(item => item.group === 'Loan'), item => item.deducted)),
    },
    detail: 'Gross pay less tax, statutory contributions, deductions and loan amortisations',
  });

  const banks = employee.banks || [];
  const bankSplits = banks.map(account => ({
    bankName: account.bankName, accountNumber: account.accountNumber,
    percentOfNetPay: number(account.percentOfNetPay),
    amount: round2(netPay * number(account.percentOfNetPay) / 100),
  }));
  const splitTotal = round2(sum(bankSplits, row => row.percentOfNetPay));
  if (banks.length && Math.abs(splitTotal - 100) > 0.01) {
    exceptions.push({ severity: 'Warning', message: `Bank allocation totals ${splitTotal}% instead of 100%.` });
  }
  if (netPay < 0) exceptions.push({ severity: 'Error', message: 'Net pay is negative — review the deductions collected on this line.' });

  return {
    employeeId: employee.employeeId,
    employeeCode: employee.code,
    name: employee.name,
    department: employee.department,
    division: employee.division,
    position: employee.position,
    costCenter: employee.costCenter,
    employeeGroup: employee.group,
    status: 'Computed',
    onHold: Boolean(eligibility.onHold),
    finalPay: Boolean(eligibility.finalPay),
    payType: pay.payType,
    rates: { monthlyRate, dailyRate, hourlyRate, minuteRate, factorDays, workHours },
    proration: prorated ? { payableDays, periodWorkingDays } : null,
    attendance,
    basicPay,
    earnings: allEarnings,
    bonuses,
    taxableEarnings, nonTaxableEarnings, taxableBonus, nonTaxableBonus,
    grossPay,
    statutory: { ...statutoryLine, employeeTotal: statutoryEmployee, employerTotal: statutoryEmployer, basis: statutoryBasis, collectedShare: collectStatutory },
    taxableIncome, withholdingTax, taxBasis,
    grossUp,
    deductions: applied.items.filter(item => item.group !== 'Loan'),
    loans: applied.items.filter(item => item.group === 'Loan'),
    deferred: applied.items.filter(item => item.deferred > 0).map(item => ({ ...item, deferredAmount: item.deferred })),
    takeHome: { protectedMinimum: applied.protectedMinimum, protectedBase: applied.protectedBase, deferred: applied.deferred, exception: applied.exception },
    totalEarnings: grossPay,
    totalDeductions,
    netPay,
    bankSplits,
    steps,
    exceptions,
  };
}

/* --------------------------------------------------------------- the run */

/**
 * Compute every line in a transaction and the totals the register reports.
 *
 * Each employee is evaluated individually against their own eligibility,
 * taxability and masterfile data — a bulk run never presents one shared result
 * for the batch.
 */
export function runPayroll({ transaction, context }) {
  const employees = context.employees || [];
  const lines = employees.map(employee => computeEmployeeLine({ employee, transaction, context }));
  const computed = lines.filter(line => line.status === 'Computed');
  const totals = {
    headcount: computed.length,
    excluded: lines.length - computed.length,
    basicPay: round2(sum(computed, line => line.basicPay)),
    grossPay: round2(sum(computed, line => line.grossPay)),
    taxableIncome: round2(sum(computed, line => line.taxableIncome)),
    withholdingTax: round2(sum(computed, line => line.withholdingTax)),
    statutoryEmployee: round2(sum(computed, line => line.statutory.employeeTotal)),
    statutoryEmployer: round2(sum(computed, line => line.statutory.employerTotal)),
    deductions: round2(sum(computed, line => sum(line.deductions, item => item.deducted))),
    loans: round2(sum(computed, line => sum(line.loans, item => item.deducted))),
    deferred: round2(sum(computed, line => line.takeHome.deferred)),
    totalDeductions: round2(sum(computed, line => line.totalDeductions)),
    netPay: round2(sum(computed, line => line.netPay)),
    employerCost: round2(sum(computed, line => line.grossPay + line.statutory.employerTotal)),
  };
  const exceptions = lines.flatMap(line => (line.exceptions || []).map(item => ({ ...item, employeeId: line.employeeId, name: line.name })));
  return { lines, totals, exceptions, calculatedAt: new Date().toISOString() };
}

/* -------------------------------------------------------------- journals */

/**
 * The accounting entry for a posted run, from the pay codes' own GL mapping.
 * Debits and credits are derived from the lines, so a recalculated run
 * restates the journal instead of leaving a stale one behind it.
 */
export function journalFor(result, payCodes = []) {
  const glOf = (code, side) => payCodes.find(row => row.code === code)?.[side] || (side === 'debitGl' ? '5100-100' : '2100-100');
  const totals = result.totals;
  const entries = [
    { account: glOf('PAY-BASIC', 'debitGl'), description: 'Salaries and wages', debit: totals.grossPay, credit: 0 },
    { account: '5300-100', description: 'Employer statutory contributions', debit: totals.statutoryEmployer, credit: 0 },
    { account: '2110-100', description: 'Withholding tax payable', debit: 0, credit: totals.withholdingTax },
    { account: '2120-100', description: 'Statutory contributions payable (EE + ER)', debit: 0, credit: round2(totals.statutoryEmployee + totals.statutoryEmployer) },
    { account: '2130-100', description: 'Loan and deduction collections payable', debit: 0, credit: round2(totals.deductions + totals.loans) },
    { account: glOf('PAY-BASIC', 'creditGl'), description: 'Net pay payable', debit: 0, credit: totals.netPay },
  ].filter(entry => entry.debit > 0 || entry.credit > 0);
  const debit = round2(sum(entries, entry => entry.debit));
  const credit = round2(sum(entries, entry => entry.credit));
  return { entries, debit, credit, balanced: Math.abs(debit - credit) < 0.01 };
}

/**
 * The bank file a posted run hands to the bank: one row per crediting
 * instruction, which is per bank account and not per employee.
 */
export function bankFileFor(result) {
  return result.lines.filter(line => line.status === 'Computed').flatMap(line => (line.bankSplits.length
    ? line.bankSplits
    : [{ bankName: 'Unassigned', accountNumber: '', percentOfNetPay: 100, amount: line.netPay }])
    .map(split => ({
      employeeCode: line.employeeCode, name: line.name,
      bankName: split.bankName, accountNumber: split.accountNumber,
      amount: split.amount, share: `${split.percentOfNetPay}%`,
    })));
}

/** Year-to-date balances a posted run adds to the employee's payroll record. */
export function ytdContributionOf(line) {
  return {
    taxableEarnings: round2(line.basicPay + line.taxableEarnings + line.taxableBonus),
    basicEarnings: line.basicPay,
    nonTaxableEarnings: round2(line.nonTaxableEarnings + line.nonTaxableBonus),
    bonusPaid: round2(line.nonTaxableBonus + line.taxableBonus),
    taxWithheld: line.withholdingTax,
    sss: line.statutory.sssEmployee,
    philhealth: line.statutory.philhealthEmployee,
    hdmf: line.statutory.hdmfEmployee,
    netPay: line.netPay,
  };
}
