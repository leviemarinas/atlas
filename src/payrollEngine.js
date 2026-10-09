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

import { computationByCode, evaluateExpression, parameterDefaults, seedComputations } from './computationCatalog.js';
import { ENGINE_SUPPLIED_FIELDS, evaluateBinding } from './computationBindings.js';
import { coversEmployee, describeScope } from './applicabilityScope.js';
import { requestAppliesToTransaction, staggeredDue } from './staggeredPayments.js';
import { correctionItems } from './payrollCorrections.js';
import { currencyTotalsFor, foreignEarningItems, foreignPayFor, payoutsByCurrency, runCurrenciesOf } from './payrollCurrencies.js';
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

/** Collect as much of the month's contribution as take-home pay allows in the first payroll; the balance follows. */
export const STATUTORY_MAX_FIRST = 'Maximum in the first payroll, balance in the next';
const STATUTORY_LINE_KEYS = Object.freeze(['sssEmployee', 'sssEmployer', 'sssRegularEmployee', 'sssMpfEmployee', 'sssMpfEmployer', 'ec', 'philhealthEmployee', 'philhealthEmployer', 'hdmfEmployee', 'hdmfEmployer']);

/** The contribution amounts a Special transaction can enter by hand, per employee. */
export const STATUTORY_OVERRIDE_LABELS = Object.freeze({
  sssEmployee: 'SSS employee share', sssEmployer: 'SSS employer share', ec: 'EC',
  philhealthEmployee: 'PhilHealth employee share', philhealthEmployer: 'PhilHealth employer share',
  hdmfEmployee: 'Pag-IBIG employee share', hdmfEmployer: 'Pag-IBIG employer share',
});

/** Converted leave is non-taxable up to this many days a year when the leave setup defers to the statutory rule. */
const LEAVE_NON_TAXABLE_DAYS = 10;

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

/* --------------------------------------------------------- bound formulas */

/**
 * The resolver that turns a Services Information configuration into an amount.
 *
 * An earning type, deduction, allowance, bonus or loan may name the
 * Computational Basis formula that produces its amount and say where each of
 * that formula's variables comes from. This builds one index over every such
 * configuration in `context.serviceConfig`, keyed by both code and name because
 * a payroll item is identified by whichever of the two its source module
 * carries, and returns a lookup the pipeline calls as it prices each item.
 *
 * `runtime` is passed by reference and mutated as the pipeline advances, so a
 * deduction bound to `{{gross_pay}}` resolves the gross this line actually
 * reached rather than a stale zero.
 */
export function boundResolverFor(context = {}, runtime = {}, employee = null) {
  const configurations = context.serviceConfig || {};
  const library = context.computations || [];
  const references = context.references || [];
  const index = new Map();
  Object.values(configurations).forEach(records => {
    (records || []).forEach(item => {
      // An inactive configuration is not a formula the run may apply, and a
      // configuration that binds nothing keeps the built-in treatment.
      if (!item?.computationCode) return;
      if (item.status && item.status !== 'Active') return;
      [item.code, item.name].filter(Boolean).forEach(key => {
        const normal = String(key).trim().toUpperCase();
        if (!index.has(normal)) index.set(normal, item);
      });
    });
  });
  if (!index.size) return () => null;
  return (...keys) => {
    for (const key of keys) {
      const found = key && index.get(String(key).trim().toUpperCase());
      if (!found) continue;
      // Applicability is enforced here rather than displayed and ignored: a
      // configuration scoped to Rank and File must not compute for a Manager,
      // however the item reached this line.
      if (employee && !coversEmployee(found.applicability, employee)) {
        return {
          code: String(found.computationCode || '').toUpperCase(),
          amount: null,
          resolved: false,
          outOfScope: true,
          problem: `${found.name || found.code} applies to ${describeScope(found.applicability).toLowerCase()}, which does not cover ${employee.name || employee.code}.`,
          entries: [],
        };
      }
      // The payout date decides which of a client's dated values applies, so a
      // rate changed from October never reaches a September payroll.
      return evaluateBinding({ record: found, library, runtime, references, asOf: context.asOf || '' });
    }
    return null;
  };
}

/**
 * Which configuration governs a payroll item, whether or not it binds a formula.
 *
 * `boundResolverFor` only indexes configurations that bind a computation, but
 * applicability governs every configuration — an earning scoped to one
 * department is out of scope for everyone else even when its amount comes
 * straight from the register. This is the index that answers that.
 */
export function scopeResolverFor(context = {}) {
  const index = new Map();
  Object.values(context.serviceConfig || {}).forEach(records => {
    (records || []).forEach(item => {
      if (!item) return;
      [item.code, item.name].filter(Boolean).forEach(key => {
        const normal = String(key).trim().toUpperCase();
        if (!index.has(normal)) index.set(normal, item);
      });
    });
  });
  if (!index.size) return () => null;
  return (...keys) => {
    for (const key of keys) {
      const found = key && index.get(String(key).trim().toUpperCase());
      if (found) return found;
    }
    return null;
  };
}

/**
 * Drop the items a configuration does not cover, and say who was dropped.
 *
 * An item with no configuration at all is left alone: a one-off encoded on the
 * transaction, or a loan schedule, answers to nobody's applicability.
 */
function withinScope(items, resolveScope, employee, onDropped) {
  if (!resolveScope || !employee) return items;
  return items.filter(item => {
    const configuration = resolveScope(item.code, item.name);
    if (!configuration || coversEmployee(configuration.applicability, employee)) return true;
    onDropped?.(item, configuration);
    return false;
  });
}

/**
 * The engine's half of the binding contract, as a value.
 *
 * Every field `ENGINE_SUPPLIED_FIELDS` names appears here, which is what lets a
 * configuration bind a variable to "Payroll runtime" and rely on a value being
 * there. The totals a line only reaches later start at zero and are filled in
 * as the pipeline advances; extracting this as a function rather than a literal
 * inside `computeEmployeeLine` is what lets the suite assert the contract holds
 * without computing a whole payroll to find out.
 */
export function runtimeFieldsFor({ employee = {}, pay = {}, attendance = {}, context = {}, override = {}, rates = {} } = {}) {
  const overtimeHours = Object.values(attendance.overtimeByType || {});
  return {
    monthly_basic: number(rates.monthlyRate),
    basic_pay: number(rates.basicPay),
    basic_pay_adjustment: number(override.basicPayAdjustment),
    daily_rate: number(rates.dailyRate),
    hourly_rate: number(rates.hourlyRate),
    factor_days: number(rates.factorDays),
    work_hours: number(rates.workHours),
    ecola_amount: pay.mwe === 'Yes' ? number(pay.ecolaPerDay) : 0,
    days_worked: number(attendance.daysWorked),
    absent_days: number(attendance.absentDays),
    late_minutes: number(attendance.tardinessMinutes),
    undertime_minutes: number(attendance.undertimeMinutes),
    ot_hours: round2(overtimeHours.reduce((total, hours) => total + number(hours), 0)),
    night_hours: number((attendance.overtimeByType || {})['Night Differential']),
    ot_rate: OT_MULTIPLIERS.Regular,
    holiday_hours: number((attendance.overtimeByType || {}).Holiday),
    holiday_rate: OT_MULTIPLIERS.Holiday,
    part_time_hours: number(attendance.hoursWorked),
    years_service: number(employee.yearsOfService),
    rounded_years_service: Math.round(number(employee.yearsOfService)),
    unused_leave_days: number((context.leaveBalances || []).find(row => row.employeeId === employee.employeeId)?.balance),
    basic_earnings_ytd: number(employee.ytd?.basicEarnings),
    bonus_paid_ytd: number(employee.ytd?.bonusPaid),
    de_minimis_paid_ytd: number(employee.ytd?.deMinimisPaid),
    // Reached later in the pipeline; declared now so the contract holds from
    // the first bound item rather than from the first item after gross pay.
    taxable_earnings: 0,
    non_taxable_earnings: 0,
    other_bonus: 0,
    gross_pay: 0,
    statutory_deductions: 0,
    taxable_income: 0,
    withholding_tax: 0,
  };
}

/** Whether the runtime map still honours every field the contract publishes. */
export function runtimeContractGaps(runtime = {}) {
  return ENGINE_SUPPLIED_FIELDS.filter(field => !Object.hasOwn(runtime, field));
}

/**
 * A payroll item priced by its bound formula instead of its configured amount.
 *
 * A binding that cannot resolve does not fail the run: the item keeps the
 * amount the module already gave it and carries the reason, which the line then
 * raises as an exception. Payroll that stops entirely because one allowance
 * lost a reference row would be worse than payroll that says so.
 */
function priceByBinding(item, resolveBound) {
  const bound = resolveBound?.(item.code, item.name);
  if (!bound) return item;
  if (!bound.resolved) return { ...item, boundCode: bound.code, boundProblem: bound.problem };
  return {
    ...item,
    amount: bound.amount,
    due: bound.amount,
    boundCode: bound.code,
    boundVersion: bound.version,
    boundValues: bound.values,
    boundEntries: bound.entries,
    boundProblem: '',
  };
}

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
    // A value the step does not supply falls back to the default the formula
    // publishes for it — the night differential rate, a commission rate — so a
    // rate that moved out of an expression and into a parameter still computes.
    const values = { ...parameterDefaults(formula), ...inputs };
    let value = amount;
    let evaluated = false;
    let error = '';
    if (evaluate && formula?.expression && formula.status !== 'Inactive') {
      try {
        // `library` lets a published formula that builds on another one resolve
        // its references the same way the expression builder previewed it.
        value = round2(evaluateExpression(formula.expression, values, { library }));
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
      // The exact published version this step applied. A payroll line must stay
      // reproducible against the formula that was in force when it was computed,
      // so the version travels with the step rather than being looked up later
      // against whatever the library says today.
      version: formula?.version || '',
      effectiveDate: formula?.effectiveDate || '',
      formulaOwner: formula ? (formula.scope === 'Client-specific' ? 'Client-specific' : formula.isBuiltIn === false ? 'Company-defined' : 'Atlas standard') : '',
      description: formula?.description || '',
      inputs: values,
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
export function earningItemsFor({ salary, registerEarnings = [], manual = [], transaction, employee, resolveBound = null }) {
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

  // A figure encoded on the transaction is an instruction, not a default, so a
  // bound formula never overwrites it — only the recurring and assigned items
  // the configuration itself produced are priced by their binding.
  return [
    ...recurring.map(row => priceByBinding(row, resolveBound)),
    ...assigned.map(row => priceByBinding(row, resolveBound)),
    ...manual.map(row => ({ ...row, source: row.source || 'Encoded on the transaction' })),
  ].filter(row => row.amount !== 0 || row.boundProblem);
}

/**
 * Deductions and loans, in the order the REF-011 hierarchy publishes.
 *
 * A collection never exceeds the outstanding balance and a schedule that has
 * cleared or passed its end date stops collecting, so a settled item cannot
 * reappear on a later payroll.
 */
export function collectionItemsFor({ salary, loanSchedules = [], registerDeductions = [], manual = [], transaction, employee, hierarchy = [], staggeredRequests = [], resolveBound = null }) {
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
    .map(row => {
      const request = staggeredRequests.find(item => item.employeeId === employee.employeeId
        && String(item.requestDetails?.eligibleDeduction || '').startsWith(row.transactionNumber || row.id)
        && requestAppliesToTransaction(item, transaction));
      const originalDue = round2(Math.min(number(row.deductionAmount), number(row.balance)));
      return {
        code: row.transactionNumber || row.id,
        name: row.loanName,
        group: 'Loan',
        kind: row.loanType === 'Government Loan' ? 'Government' : 'Company',
        due: request ? staggeredDue(originalDue, request) : originalDue,
        originalDue,
        outstanding: number(row.balance),
        rank: rankOf(row.loanName, 'Loan'),
        canAdjust: true,
        authorised: row.authorityToDeduct ? row.authorityToDeduct.acknowledged !== false : true,
        source: request ? `Approved Staggered Payment Request ${request.requestId}` : row.loanType === 'Government Loan' ? 'Government Loan Management' : 'Company Loan Management',
        staggeredRequestId: request?.requestId || '',
      };
    });

  // A bound deduction still never collects more than the balance outstanding:
  // the formula decides what is due this period, the schedule decides what is
  // left to collect, and the smaller of the two is what the employee pays.
  const priced = item => {
    const bound = priceByBinding(item, resolveBound);
    if (!bound.boundCode || bound.boundProblem) return bound;
    return { ...bound, due: round2(Math.min(bound.due, number(item.outstanding) || bound.due)) };
  };

  return [...loans.map(priced), ...companyDeductions.map(priced), ...assigned.map(priced), ...manual]
    .filter(item => item.due > 0 || item.boundProblem)
    .sort((left, right) => left.rank - right.rank);
}

/* ------------------------------------------- pay items changed on the run */

/** A pay item's key on a transaction: its group and its code (or name). */
export const payItemKey = (group, item) => `${group}:${item.code || item.name}`;

/** Items the engine produced from setup, as opposed to ones typed on the transaction. */
const isEncodedItem = item => String(item.source || '').startsWith('Encoded on the transaction');

/**
 * Applies the transaction's own changes to the pay items setup produced:
 * an item the run excludes for everyone, or one this employee skips or is paid
 * a different amount for, this run only. Setup and the registers are never
 * touched, so a skipped deduction or loan keeps its balance for the next run.
 * Every change is returned so the line can show what was computed and why it
 * was changed.
 */
export function adjustPayItems(items, group, { excluded = [], changes = {}, amountField = 'amount' } = {}) {
  const kept = [];
  const adjustments = [];
  items.forEach(item => {
    if (isEncodedItem(item) || item.foreign) { kept.push(item); return; }
    const key = payItemKey(group, item);
    const computed = number(item[amountField]);
    const change = changes[key] || {};
    if (excluded.includes(key) || change.exclude) {
      adjustments.push({ key, group, name: item.name, computed, amount: 0, excluded: true, scope: excluded.includes(key) ? 'run' : 'employee', reason: excluded.includes(key) ? '' : change.reason || '' });
      return;
    }
    const wanted = change.amount;
    if (wanted === '' || wanted === undefined || wanted === null || !Number.isFinite(Number(wanted))) { kept.push({ ...item, key }); return; }
    let amount = round2(Math.max(0, Number(wanted)));
    // A deduction or loan still never collects more than is outstanding.
    const capped = amountField === 'due' && number(item.outstanding) > 0 && amount > number(item.outstanding);
    if (capped) amount = round2(number(item.outstanding));
    if (amount === computed) { kept.push({ ...item, key }); return; }
    adjustments.push({ key, group, name: item.name, computed, amount, excluded: false, scope: 'employee', reason: change.reason || '', capped });
    kept.push({ ...item, key, [amountField]: amount, computedAmount: computed, adjustedReason: change.reason || '' });
  });
  return { items: kept, adjustments };
}

/**
 * The take-home policy as this line applies it. The transaction may keep the
 * policy, set a different protected minimum for this run, or not apply the
 * protection at all; an employee's own choice wins over the run's.
 */
export function takeHomePolicyForLine(policy = {}, runMode = {}, employeeMode = {}) {
  const chosen = employeeMode.mode && employeeMode.mode !== 'policy' ? { ...employeeMode, scope: 'employee' }
    : runMode.mode && runMode.mode !== 'policy' ? { ...runMode, scope: 'run' }
      : null;
  if (!chosen) return { policy, override: null };
  if (chosen.mode === 'off') {
    return {
      policy: { ...policy, enabled: false, autoDefer: false, deductionCapEnabled: false, loanCapType: 'None', attendanceCapType: 'None', thresholdType: 'Fixed Amount', threshold: 0 },
      override: { mode: 'off', reason: chosen.reason || '', scope: chosen.scope },
    };
  }
  if (chosen.mode === 'minimum' && Number.isFinite(Number(chosen.minimum))) {
    return {
      policy: { ...policy, enabled: true, autoDefer: true, thresholdType: 'Fixed Amount', threshold: Math.max(0, Number(chosen.minimum)) },
      override: { mode: 'minimum', minimum: round2(Math.max(0, Number(chosen.minimum))), reason: chosen.reason || '', scope: chosen.scope },
    };
  }
  return { policy, override: null };
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
  // Pay encoded in another of the transaction's currencies, priced in PHP at
  // the rate typed on the transaction.
  // Corrections raised against earlier posted payrolls, carried in as adjustments.
  const corrections = correctionItems(context.corrections || [], employee.employeeId);
  const foreignPay = foreignPayFor(override.currencyLines || [], runCurrenciesOf(transaction));
  foreignPay.problems.forEach(message => exceptions.push({ severity: 'Error', message }));
  // Pay items this run leaves out for everyone, and this employee's own changes.
  const itemRules = { excluded: config.excludedPayItems || [], changes: override.payItems || {} };
  const payItemAdjustments = [];
  const adjustForRun = (items, group, amountField) => {
    const result = adjustPayItems(items, group, { ...itemRules, amountField });
    payItemAdjustments.push(...result.adjustments);
    return result.items;
  };

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
  // Factor days come from the employee's pay record, then the company default the
  // run was created with. Hours per day come from the shift the employee works in
  // the period (Timekeeping), then the pay record, then the company default.
  const factorDays = number(pay.factorDays) || number(config.workDaysPerYear) || 261;
  const shift = shiftFor(context.shiftAssignments, employee.employeeId, transaction.periodEnd);
  const workHours = number(shift?.workHours) || number(pay.workHoursPerDay) || number(config.workHoursPerDay) || 8;
  const monthlyRate = number(basicRecord.monthlyRate) || number(pay.monthlyRate);
  const dailyRate = record({
    code: 'BAS-001', category: 'Basic Pay', source: 'Employee salary record',
    inputs: { monthly_basic: monthlyRate, factor_days: factorDays },
    detail: `Monthly ${monthlyRate.toLocaleString()} × 12 ÷ ${factorDays} factor days`,
  });
  const hourlyRate = record({
    code: 'BAS-002', category: 'Basic Pay', inputs: { daily_rate: dailyRate, work_hours: workHours },
    detail: `Daily rate ÷ ${workHours} work hours${shift?.workHours ? ` (${shift.name || 'assigned shift'})` : ''}`,
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
  const ecolaEarnings = [];
  const zeroBasic = override.zeroBasicPay ?? config.zeroBasicPay;
  if (zeroBasic) {
    basicPay = 0;
    record({ code: 'ERN-001', category: 'Basic Pay', amount: 0, evaluate: false, detail: 'Zero Basic Pay is set for this run — basic pay is not computed', source: 'Transaction configuration' });
  } else if (pay.payType === 'Daily') {
    const days = Number.isFinite(Number(override.daysInPeriod))
      ? Number(override.daysInPeriod)
      : attendance.daysCovered ? attendance.daysWorked + attendance.paidLeaveDays : number(config.daysInPeriod);
    basicPay = round2(dailyRate * days);
    record({
      code: 'MWE-001', label: pay.mwe === 'Yes' ? 'MWE Pay with ECOLA' : 'Daily-paid basic pay', category: 'Basic Pay',
      inputs: { daily_rate: dailyRate, days_worked: days, ecola_amount: pay.mwe === 'Yes' ? number(pay.ecolaPerDay) : 0 },
      detail: `${days} rendered ${days === 1 ? 'day' : 'days'} × daily rate${pay.mwe === 'Yes' ? (config.ecolaTreatment === 'Separate earning' ? ' (ECOLA paid as a separate earning)' : ` + ECOLA ₱${number(pay.ecolaPerDay)}/day`) : ''}`,
      source: 'Timekeeping punch record',
    });
    // ECOLA: the company decides in Payroll Controls whether it is part of
    // Basic Pay or paid as its own (non-taxable) earning line.
    if (pay.mwe === 'Yes' && number(pay.ecolaPerDay)) {
      const ecola = round2(number(pay.ecolaPerDay) * days);
      if (config.ecolaTreatment === 'Separate earning') { if (ecola > 0) ecolaEarnings.push({ code: 'ECOLA', name: 'ECOLA', classification: 'Non-taxable', amount: ecola, source: 'Timekeeping', detail: `${days} days × ₱${number(pay.ecolaPerDay)}` }); }
      else basicPay = round2(basicPay + ecola);
    }
  } else if (pay.payType === 'Hourly') {
    const hours = Number.isFinite(Number(override.hoursInPeriod))
      ? Number(override.hoursInPeriod)
      : attendance.hoursWorked || number(config.hoursInPeriod);
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
  // A timekeeping-exempt employee keeps attendance on record (it is still shown
  // on the line) but is not deducted for absences, tardiness or undertime.
  const timekeepingExempt = pay.timekeepingExempt === 'Yes';
  const adjust = timekeepingExempt
    ? { absences: false, late: false, undertime: false }
    : config.computeAttendanceAdjustment || { absences: true, late: true, undertime: true };
  if (timekeepingExempt && (attendance.absentDays > 0 || attendance.tardinessMinutes > 0 || attendance.undertimeMinutes > 0)) {
    exceptions.push({ severity: 'Info', message: `Timekeeping-exempt: ${attendance.absentDays || 0} absent days, ${attendance.tardinessMinutes || 0} late minutes and ${attendance.undertimeMinutes || 0} undertime minutes are recorded but not deducted.` });
  }

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
        : record({ code, category: 'Earnings', inputs: { hourly_rate: hourlyRate, ot_hours: hours, ot_rate: multiplier, ...(code === 'ERN-003' ? { night_hours: hours } : {}) }, detail: `${hours} approved ${type.toLowerCase()} overtime hours at ${multiplier}×`, source: 'Timekeeping punch record' });
      overtimeEarnings.push({ code: `OT-${type.slice(0, 3).toUpperCase()}`, name: `Overtime — ${type}`, classification: 'Taxable Allowance', amount, hours, multiplier, source: 'Timekeeping' });
    });
  }

  /* bound configurations -------------------------------------------------- */
  // The map is mutated as the pipeline advances — gross pay, tax and statutory
  // totals are not known at earnings time — so a deduction bound to
  // `{{gross_pay}}` reads the gross this line actually reached.
  const runtime = runtimeFieldsFor({
    employee, pay, attendance, context, override,
    rates: { monthlyRate, basicPay, dailyRate, hourlyRate, factorDays, workHours },
  });
  const resolveBound = boundResolverFor(context, runtime, employee);
  const resolveScope = scopeResolverFor(context);
  // A configuration that does not cover this employee is reported once, on the
  // line it was withheld from, so "why did Sophia not get the meal allowance?"
  // is answerable from the payslip rather than from the configuration screen.
  const outOfScope = (item, configuration) => exceptions.push({
    severity: 'Info',
    message: `${item.name} was not applied: ${configuration.name || configuration.code} covers ${describeScope(configuration.applicability).toLowerCase()}.`,
  });

  /**
   * A bound item's own step, so the binding is auditable on the payslip.
   *
   * The step re-evaluates the published expression against the values the
   * binding resolved, which is what makes "how was this figure reached?" a
   * report of the calculation rather than a restatement of its answer.
   */
  const recordBinding = (item, category) => {
    if (item.boundProblem) {
      exceptions.push({ severity: 'Warning', message: `${item.name}: ${item.boundProblem}` });
      return;
    }
    if (!item.boundCode) return;
    record({
      code: item.boundCode,
      label: item.name,
      category,
      inputs: item.boundValues || {},
      detail: `${item.name} computed from its bound formula · ${(item.boundEntries || []).map(entry => `${entry.token} ← ${entry.source}`).join('; ')}`,
      source: 'Services Information binding',
    });
  };

  /* Hourly variable allowances: a rate per hour for each allowance in the Variable Allowance
   * reference table, times the hours entered — or, when none are entered, the hours
   * Timekeeping recorded for the cut-off. */
  const variableAllowanceItems = (override.variableAllowances || []).filter(row => row.code)
    .map(row => {
      const reference = (context.variableAllowances || []).find(item => item.code === row.code || item.name === row.code);
      const hours = row.hours === '' || row.hours === undefined || row.hours === null ? number(attendance.hoursWorked) : number(row.hours);
      const rate = number(row.rate);
      return {
        code: reference?.code || row.code, name: reference?.name || row.code,
        classification: reference && reference.taxable === 'No' ? 'Non-taxable' : 'Taxable Allowance',
        amount: round2(rate * hours), hours, rate, source: 'Variable allowance (hourly)',
        detail: `${hours} ${hours === 1 ? 'hour' : 'hours'} × ₱${rate.toLocaleString()} per hour${row.hours === '' || row.hours === undefined || row.hours === null ? ' (hours from Timekeeping)' : ''}`,
      };
    })
    .filter(item => item.amount > 0);

  /* 5 — earnings ---------------------------------------------------------- */
  const configured = withinScope(earningItemsFor({
    salary,
    registerEarnings: (context.registers?.earnings) || [],
    manual: [...(override.earnings || []), ...variableAllowanceItems, ...foreignEarningItems(foreignPay.lines), ...corrections.earnings],
    transaction, employee, resolveBound,
  }), resolveScope, employee, outOfScope);
  configured.forEach(item => recordBinding(item, 'Earnings'));
  variableAllowanceItems.forEach(item => record({ code: 'ERN-004', label: item.name, category: 'Earnings', amount: item.amount, evaluate: false, inputs: { taxable_earnings: item.amount, days_worked: 0 }, detail: item.detail, source: 'Variable Allowance reference table' }));
  const configuredForRun = adjustForRun(configured, 'Earning', 'amount');
  const monthIndex = Number(String(toIsoDate(transaction.periodEnd)).slice(5, 7)) || 1;
  const deMinimisVersion = schedules.deMinimis;
  const earnings = [];
  configuredForRun.forEach(item => {
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
  // Variable allowances follow the same effective dates as basic pay: a new hire
  // or a separation is paid the days actually payable, not the whole period.
  const isVariableAllowance = item => item.source === 'Employee salary record' && item.classification === 'Taxable Allowance';
  if (prorated && config.computeVariableAllowanceAdjustment !== false) {
    const factor = payableDays / periodWorkingDays;
    earnings.forEach((item, index) => {
      if (!isVariableAllowance(item) || !(item.amount > 0)) return;
      const adjusted = round2(item.amount * factor);
      record({
        code: 'ERN-004', label: `${item.name} adjustment`, category: 'Earnings', amount: adjusted, evaluate: false,
        inputs: { taxable_earnings: item.amount, days_worked: payableDays },
        detail: `${payableDays} of ${periodWorkingDays} working days payable — ${item.name} pro-rated from ₱${item.amount.toLocaleString()}`,
        source: 'Employee Masterfile effective dates',
      });
      earnings[index] = { ...item, amount: adjusted, unadjustedAmount: item.amount };
    });
  }

  // Earning reclassification. An earning opts in on its Earning Configuration
  // (eligibility, direction, hierarchy, cap); this run only chooses whether the
  // step runs and may narrow the pool. Earnings draw on the pool in hierarchy
  // order, each up to its own cap, so a lower-ranked earning only reclassifies
  // what the higher-ranked ones left.
  const reclassification = config.reclassification || {};
  let reclassifiedNonTaxable = 0;
  if (reclassification.enabled) {
    const typedPool = reclassification.poolLimit === '' || reclassification.poolLimit == null ? Infinity : Math.max(0, number(reclassification.poolLimit));
    // Against the ceiling, the pool is what is left of the non-taxable 13th-month and other-benefits cap.
    const againstCeiling = reclassification.poolSource === 'ceiling';
    const ceilingTotal = Number.isFinite(Number(config.thirteenthMonth?.ntThreshold)) && config.thirteenthMonth?.enabled && config.thirteenthMonth.ntThreshold !== '' ? Number(config.thirteenthMonth.ntThreshold) : (number(context.bonusCeiling) || 90000);
    const ceilingLeft = Math.max(0, round2(ceilingTotal - number(employee.ytd?.bonusPaid) - number(employee.previousEmployer?.nontaxableBonus)));
    const poolLimit = againstCeiling ? Math.min(typedPool, ceilingLeft) : typedPool;
    let pool = poolLimit;
    // This run may reorder the earnings and lower a limit; it never changes the setup,
    // and a run limit can only tighten the configured one.
    const runOrder = reclassification.runOrder || [];
    const runLimits = reclassification.runLimits || {};
    const rankOf = (setup, order) => { const at = order.indexOf(setup.code); return at >= 0 ? at : order.length + (number(setup.reclassPriority) || 999); };
    const eligible = earnings
      .map((item, index) => ({ item, index, setup: resolveScope(item.code, item.name) }))
      .filter(entry => entry.setup && entry.setup.eligibleForReclassification === 'Yes' && entry.item.amount > 0)
      .sort((left, right) => rankOf(left.setup, runOrder) - rankOf(right.setup, runOrder));
    const moved = [];
    eligible.forEach(({ item, index, setup }) => {
      const toNonTaxable = (setup.reclassDirection || 'Taxable to non-taxable') === 'Taxable to non-taxable';
      if (classOf(item.classification).taxable !== toNonTaxable) return;
      const current = earnings[index];
      const capBasis = setup.reclassCapBasis || 'No limit';
      const runLimit = runLimits[setup.code];
      const hasRunLimit = runLimit !== undefined && runLimit !== '' && Number.isFinite(Number(runLimit));
      const configured = capBasis === 'Amount per payroll' ? number(setup.reclassCap)
        : capBasis === 'Percent of the earning' ? round2(current.amount * number(setup.reclassCap) / 100) : Infinity;
      const lowered = !hasRunLimit ? Infinity : capBasis === 'Percent of the earning' ? round2(current.amount * number(runLimit) / 100) : number(runLimit);
      const cap = Math.min(configured, lowered);
      const amount = round2(Math.min(current.amount, cap, pool));
      if (!(amount > 0)) return;
      pool = round2(pool - amount);
      earnings[index] = { ...current, amount: round2(current.amount - amount) };
      moved.push({ code: `${item.code}-R`, name: `${item.name} (reclassified)`, classification: toNonTaxable ? 'Non-taxable' : 'Taxable Allowance', amount, source: `Reclassified from ${item.name}`, priority: number(setup.reclassPriority) || null, capBasis, cap: capBasis === 'No limit' ? null : cap });
      record({
        code: 'RCL-001', label: `${item.name} reclassified`, category: 'Tax', amount, evaluate: false,
        inputs: { non_taxable_earnings: toNonTaxable ? amount : 0, taxable_earnings: toNonTaxable ? 0 : amount },
        detail: `${toNonTaxable ? 'Taxable to non-taxable' : 'Non-taxable to taxable'}: ₱${amount.toLocaleString()} of ₱${current.amount.toLocaleString()} (rank ${number(setup.reclassPriority) || '—'}, ${capBasis === 'No limit' ? 'no cap' : capBasis === 'Amount per payroll' ? `cap ₱${cap.toLocaleString()}` : `cap ${number(setup.reclassCap)}% of the earning`}${Number.isFinite(poolLimit) ? `; ₱${pool.toLocaleString()} of the ₱${poolLimit.toLocaleString()} pool left` : ''})`,
        source: 'Earning Configuration',
      });
      exceptions.push({ severity: 'Info', message: `${item.name}: ₱${amount.toLocaleString()} reclassified as ${toNonTaxable ? 'non-taxable' : 'taxable'} (rank ${number(setup.reclassPriority) || '—'}).` });
    });
    earnings.push(...moved);
    if (againstCeiling) reclassifiedNonTaxable = round2(sum(moved.filter(item => item.classification === 'Non-taxable'), item => item.amount));
  }
  /* Leave conversion. Days come from HRM (converted credits dated in the conversion
   * window) unless an uploaded row for the same leave type replaces them — the
   * upload is for clients with no HRM engagement, and it wins where both exist. */
  const conversion = config.leaveConversion || {};
  const conversionPaid = [];
  if (conversion.enabled) {
    const window = conversion.window || { start: conversion.startDate, end: conversion.endDate };
    const inWindow = date => { const at = toIsoDate(date); return !at || ((!window.start || at >= window.start) && (!window.end || at <= window.end)); };
    const selected = conversion.leaveTypes || [];
    const wanted = type => !selected.length || selected.includes(type);
    const uploaded = (override.leaveConversions || []).filter(row => wanted(row.leaveType) && inWindow(row.date));
    const replaced = new Set(uploaded.map(row => row.leaveType));
    const fromHrm = (context.leaveBalances || [])
      .filter(row => row.employeeId === employee.employeeId && number(row.converted) > 0 && wanted(row.leaveType) && !replaced.has(row.leaveType) && inWindow(row.conversionDate))
      .map(row => ({ leaveType: row.leaveType, days: number(row.converted), source: 'HRM leave balance' }));
    // Final pay converts every credit still left, whatever the window says.
    const converted = new Set([...fromHrm.map(row => row.leaveType), ...replaced]);
    const remaining = eligibility.finalPay
      ? (context.leaveBalances || [])
        .filter(row => row.employeeId === employee.employeeId && number(row.available) > 0 && wanted(row.leaveType) && !converted.has(row.leaveType))
        .filter(row => (context.serviceConfig?.leaveBenefits || []).find(item => item.name === row.leaveType || item.type === row.leaveType)?.cashConvertible !== 'No')
        .map(row => ({ leaveType: row.leaveType, days: number(row.available), source: 'HRM leave balance (final pay)' }))
      : [];
    let nonTaxableDaysLeft = LEAVE_NON_TAXABLE_DAYS;
    [...fromHrm, ...remaining, ...uploaded.map(row => ({ ...row, source: 'Uploaded' }))].forEach(row => {
      conversionPaid.push({ leaveType: row.leaveType, days: row.days, source: row.source });
      const setup = (context.serviceConfig?.leaveBenefits || []).find(item => item.name === row.leaveType || item.type === row.leaveType);
      const treatment = setup?.taxTreatment || 'Per statutory reference';
      const amount = record({ code: 'FIN-001', label: `${row.leaveType} conversion`, category: 'Separation', inputs: { daily_rate: dailyRate, unused_leave_days: row.days }, detail: `${row.days} ${row.days === 1 ? 'day' : 'days'} of ${row.leaveType} converted at the daily rate (${row.source})`, source: row.source === 'Uploaded' ? 'Uploaded on the transaction' : 'HRM leave balance' });
      const nonTaxableDays = treatment === 'Non-taxable' ? row.days : treatment === 'Taxable' ? 0 : Math.min(row.days, nonTaxableDaysLeft);
      nonTaxableDaysLeft = Math.max(0, nonTaxableDaysLeft - nonTaxableDays);
      const nonTaxable = round2(amount * nonTaxableDays / row.days);
      const label = `Leave conversion — ${row.leaveType}`;
      if (nonTaxable > 0) earnings.push({ code: 'LVC-NT', name: nonTaxable < amount ? `${label} (non-taxable)` : label, classification: 'Non-taxable', amount: nonTaxable, days: nonTaxableDays, source: row.source });
      if (round2(amount - nonTaxable) > 0) earnings.push({ code: 'LVC-TX', name: nonTaxable > 0 ? `${label} (taxable excess)` : label, classification: 'Taxable Allowance', amount: round2(amount - nonTaxable), days: row.days - nonTaxableDays, source: row.source });
      const hrmRow = (context.leaveBalances || []).find(item => item.employeeId === employee.employeeId && item.leaveType === row.leaveType && number(item.converted) > 0);
      if (row.source === 'Uploaded') exceptions.push({ severity: 'Info', message: hrmRow ? `${row.leaveType}: ${row.days} uploaded days replace the ${number(hrmRow.converted)} days HRM holds.` : `${row.leaveType}: ${row.days} days uploaded with no HRM conversion on record, so no HRM balance is deducted.` });
    });
  }

  const allEarnings = [...earnings, ...ecolaEarnings, ...adjustForRun(overtimeEarnings, 'Earning', 'amount')];

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
      code: 'BON-004', category: 'Bonus', inputs: { bonus_tax_ceiling: ceiling, bonus_paid_ytd: round2(number(employee.ytd?.bonusPaid) + number(employee.previousEmployer?.nontaxableBonus) + reclassifiedNonTaxable) },
      detail: ceiling === 0 ? 'Threshold set to zero for this run — every bonus is taxable' : `Non-taxable ceiling less bonuses already paid this year${number(employee.previousEmployer?.nontaxableBonus) ? ' and by the previous employer' : ''}`,
      source: 'Bonus ceiling reference table',
    });
    let available = remainingCeiling;
    // The Bonus Ceiling Order reference table decides which bonus uses the
    // non-taxable ceiling first; types it does not list keep their run order.
    const order = config.bonusCeilingOrder || [];
    const rank = type => (order.indexOf(type) + 1) || order.length + 1;
    const selected = [...(config.thirteenthMonth.bonusTypes || ['13th Month Pay'])].sort((left, right) => rank(left) - rank(right));
    const registerBonuses = ((context.registers?.bonuses) || [])
      .filter(row => String(row.employee || '').startsWith(employee.code) && selected.includes(row.name));

    selected.forEach(type => {
      let amount = 0;
      // A Bonus Configuration that binds its own formula owns the amount: it is
      // the more specific statement than either the standard 13th-month rule or
      // the figure the Bonus Management register carries.
      const boundBonus = resolveBound(type);
      if (config.thirteenthMonth.basis === 'Custom / uploaded value') {
        amount = number((override.bonuses || []).find(row => row.name === type)?.amount);
      } else if (boundBonus?.resolved) {
        amount = boundBonus.amount;
        record({
          code: boundBonus.code, label: type, category: 'Bonus', inputs: boundBonus.values,
          detail: `${type} computed from its bound formula · ${boundBonus.entries.map(entry => `${entry.token} ← ${entry.source}`).join('; ')}`,
          source: 'Services Information binding',
        });
      } else if (boundBonus && !boundBonus.resolved) {
        exceptions.push({ severity: 'Warning', message: `${type}: ${boundBonus.problem}` });
      } else if (type === '13th Month Pay') {
        const ytdBasic = number(employee.ytd?.basicEarnings) + basicPay;
        amount = record({ code: 'BON-002', category: 'Bonus', inputs: { basic_earnings_ytd: ytdBasic }, detail: 'Basic earnings year to date ÷ 12', source: 'Employee YTD payroll record' });
      } else {
        amount = number(registerBonuses.find(row => row.name === type)?.amount);
      }
      if (amount > 0) {
        const [kept] = adjustForRun([{ code: '', name: type, amount, source: 'Bonus' }], 'Bonus', 'amount');
        amount = kept ? kept.amount : 0;
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
  // Everything downstream of gross pay may be bound to it, so the runtime the
  // binding resolver reads catches up here rather than after the line is done.
  Object.assign(runtime, {
    basic_pay: basicPay,
    taxable_earnings: taxableEarnings,
    non_taxable_earnings: nonTaxableEarnings,
    other_bonus: round2(taxableBonus + nonTaxableBonus),
    gross_pay: grossPay,
  });

  /* 8 — statutory contributions ------------------------------------------ */
  const computeStatutory = override.computeAllowableDeduction ?? config.computeAllowableDeduction;
  const agencies = config.statutoryAgencies || { sss: true, philhealth: true, pagibig: true, sssWisp: true };
  const periodsPerMonth = PERIODS_PER_YEAR[transaction.paymentMode] / 12;
  const collectStatutory = config.statutorySchedule === STATUTORY_MAX_FIRST ? 1
    : config.statutorySchedule === 'Every payroll (split)' || !config.statutorySchedule
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

  // The employee and employer shares are switched on separately: a run may
  // collect only the employee's share, or book only the employer's.
  const shares = config.statutoryShares || {};
  const eeOn = key => shares[key]?.employee !== false;
  const erOn = key => shares[key]?.employer !== false;
  const share = (value, on = true) => (on ? round2(number(value) * collectStatutory) : 0);
  const statutoryLine = {
    // SSS is the regular share plus the WISP / MPF share; each has its own EE and ER switch.
    sssEmployee: round2(share(sss.regularEmployee, eeOn('sss')) + (agencies.sssWisp === false ? 0 : share(sss.mpfEmployee, eeOn('sssWisp')))),
    sssEmployer: round2(share(sss.regularEmployer, erOn('sss')) + share(sss.ec, erOn('sss')) + share(sss.mpfEmployer, erOn('sssWisp'))),
    sssRegularEmployee: share(sss.regularEmployee, eeOn('sss')),
    sssMpfEmployee: agencies.sssWisp === false ? 0 : share(sss.mpfEmployee, eeOn('sssWisp')),
    sssMpfEmployer: share(sss.mpfEmployer, erOn('sssWisp')),
    ec: share(sss.ec, erOn('sss')),
    philhealthEmployee: share(philhealth.employee, eeOn('philhealth')),
    philhealthEmployer: share(philhealth.employer, erOn('philhealth')),
    hdmfEmployee: share(pagibig.employee, eeOn('pagibig')),
    hdmfEmployer: share(pagibig.employer, erOn('pagibig')),
  };
  // Maximum first, balance next: the month's figure, less what earlier payrolls this month already
  // collected, held to what this employee can bear without dropping below the protected take-home pay.
  if (config.statutorySchedule === STATUTORY_MAX_FIRST) {
    const earlier = context.statutoryCollected?.[employee.employeeId] || null;
    if (earlier) STATUTORY_LINE_KEYS.forEach(key => { statutoryLine[key] = round2(Math.max(0, statutoryLine[key] - number(earlier[key]))); });
    const policy = takeHomePolicyForLine(context.policies?.takeHome || {}, config.takeHome || {}, override.takeHome || {}).policy;
    const protectedBase = policy.base === 'Basic Pay' ? basicPay
      : policy.base === 'Gross Pay less Reimbursements' ? round2(grossPay - sum(allEarnings.filter(item => classOf(item.classification).group === 'Receivables / Reimbursements'), item => item.amount))
      : grossPay;
    const minimum = policy.enabled === false ? 0
      : policy.thresholdType === 'Fixed Amount' ? number(policy.threshold) : round2(number(protectedBase) * number(policy.threshold) / 100);
    const taxed = config.computeTax !== false && pay.withWithholdingTax === 'Yes' && pay.mwe !== 'Yes';
    const estimatedTax = taxed ? graduatedTax(schedules.tax, round2(basicPay + taxableEarnings + taxableBonus), transaction.paymentMode).tax : 0;
    const headroom = Math.max(0, round2(grossPay - estimatedTax - minimum));
    const wanted = round2(statutoryLine.sssEmployee + statutoryLine.philhealthEmployee + statutoryLine.hdmfEmployee);
    if (wanted > headroom + 0.004) {
      const factor = wanted > 0 ? headroom / wanted : 0;
      STATUTORY_LINE_KEYS.forEach(key => { statutoryLine[key] = round2(statutoryLine[key] * factor); });
      statutoryLine.sssRegularEmployee = round2(Math.max(0, statutoryLine.sssEmployee - statutoryLine.sssMpfEmployee));
      exceptions.push({ severity: 'Info', message: `Employee contributions of ₱${wanted.toLocaleString()} were held to ₱${round2(wanted * factor).toLocaleString()} to keep take-home pay at or above ₱${minimum.toLocaleString()}; ₱${round2(wanted - wanted * factor).toLocaleString()} is left for the next payroll.` });
    }
    record({ code: 'GOV-001', label: 'Contributions: maximum first, balance next', category: 'Government', amount: round2(statutoryLine.sssEmployee + statutoryLine.philhealthEmployee + statutoryLine.hdmfEmployee), evaluate: false, inputs: {}, detail: `${earlier ? 'Month figure less what earlier payrolls collected' : 'First payroll of the month: month figure'}, held to the take-home headroom of ₱${headroom.toLocaleString()}`, source: 'Transaction configuration' });
  }
  // A Special transaction may carry typed contribution amounts for an employee, in place of
  // the computed ones. The line says so; the contribution tables are left alone.
  const statutoryOverride = transaction.payrollType === 'Special' ? (override.statutory || {}) : {};
  const overridden = Object.keys(STATUTORY_OVERRIDE_LABELS).filter(key => statutoryOverride[key] !== undefined && statutoryOverride[key] !== '' && Number.isFinite(Number(statutoryOverride[key])));
  if (overridden.length) {
    overridden.forEach(key => { statutoryLine[key] = round2(Math.max(0, Number(statutoryOverride[key]))); });
    if (overridden.includes('sssEmployee')) statutoryLine.sssRegularEmployee = round2(Math.max(0, statutoryLine.sssEmployee - statutoryLine.sssMpfEmployee));
    record({ code: 'GOV-001', label: 'Contributions entered on a special transaction', category: 'Government', amount: round2(sum(overridden, key => statutoryLine[key])), evaluate: false, inputs: {}, detail: `Entered instead of computed: ${overridden.map(key => `${STATUTORY_OVERRIDE_LABELS[key]} ₱${statutoryLine[key].toLocaleString()}`).join(', ')}`, source: 'Special transaction override' });
    exceptions.push({ severity: 'Info', message: `Contributions were entered on this special transaction instead of computed: ${overridden.map(key => STATUTORY_OVERRIDE_LABELS[key]).join(', ')}.` });
  }
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
  let taxAtc = '';
  let taxRate = null;
  let taxTableUsed = null;
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
    if (pay.taxType === 'Direct') {
      // A flat percentage the employee's own record names, on the period's taxable income.
      const rate = Math.max(0, number(pay.directTaxRate)) / 100;
      taxRate = rate;
      withholdingTax = round2(taxableIncome * rate);
      taxBasis = `Direct ${round2(rate * 100)}% (employee tax type)`;
      record({ code: 'TAX-002', label: 'Direct withholding tax', category: 'Tax', amount: withholdingTax, evaluate: false, inputs: { taxable_income: taxableIncome, tax_rate: rate }, detail: `${round2(rate * 100)}% of ₱${taxableIncome.toLocaleString()}`, source: 'Employee tax type' });
      if (!rate) exceptions.push({ severity: 'Warning', message: 'The employee tax type is Direct but no direct tax rate is on the 201 file, so no tax was withheld.' });
    } else if (pay.taxType === 'Annualized' && !eligibility.finalPay && !config.annualizeTax) {
      // Project the year from what has been earned and withheld plus this period's income for
      // every period left, take the annual table's tax, and spread what remains over those periods.
      const previous = employee.previousEmployer || {};
      const perYear = PERIODS_PER_YEAR[transaction.paymentMode] || 24;
      const periodsLeft = Math.max(1, perYear - periodNumberOf(transaction) + 1);
      const projected = round2(number(employee.ytd?.taxableEarnings) + number(previous.grossTaxableIncome) + taxableIncome * periodsLeft);
      const due = graduatedTax(schedules.annualTax, projected, 'Annual').tax;
      const alreadyWithheld = round2(number(employee.ytd?.taxWithheld) + number(previous.taxWithheld));
      taxTableUsed = schedules.annualTax;
      withholdingTax = round2(Math.max(0, due - alreadyWithheld) / periodsLeft);
      taxBasis = 'Annualized (projected year, spread over the periods left)';
      record({
        code: 'TAX-008', category: 'Tax', amount: withholdingTax, evaluate: false,
        inputs: { basic_earnings_ytd: number(employee.ytd?.taxableEarnings), taxable_earnings: taxableIncome, previous_employer_taxable: number(previous.grossTaxableIncome), withholding_tax: alreadyWithheld },
        detail: `Projected taxable ₱${projected.toLocaleString()} → annual tax ₱${due.toLocaleString()} less ₱${alreadyWithheld.toLocaleString()} withheld, over ${periodsLeft} ${periodsLeft === 1 ? 'period' : 'periods'}`,
        source: 'BIR annual tax table',
      });
    } else if (['Expanded', 'Final'].includes(pay.taxType)) {
      // Income that is not compensation — a consultant's fees, or income
      // subject to final tax — is withheld at a flat rate on the taxable
      // amount, never through the compensation table. The employee's tax
      // information names the BIR ATC; the rate is that ATC's row in the
      // effective expanded or final tax table.
      const expanded = pay.taxType === 'Expanded';
      const atc = pay.atc || (expanded ? 'WI010' : 'WI360');
      const tableRow = ((expanded ? schedules.expandedTax : schedules.finalTax)?.rows || []).find(row => row.atcCode === atc);
      taxTableUsed = expanded ? schedules.expandedTax : schedules.finalTax;
      const rate = tableRow ? number(tableRow.excessRate) / 100 : number(expanded ? pay.ewtRate : pay.finalTaxRate);
      if (!tableRow) exceptions.push({ severity: 'Warning', message: `ATC ${atc} is not in the effective ${expanded ? 'expanded' : 'final'} tax table; the rate on the employee record was used.` });
      taxAtc = atc;
      taxRate = rate;
      withholdingTax = round2(taxableIncome * rate);
      taxBasis = `${expanded ? 'Expanded withholding' : 'Final tax'} ${round2(rate * 100)}% (${atc})`;
      record({
        code: 'TAX-002', label: expanded ? 'Expanded withholding tax' : 'Final withholding tax', category: 'Tax', amount: withholdingTax, evaluate: false,
        inputs: { taxable_income: taxableIncome, tax_rate: rate },
        detail: `${round2(rate * 100)}% of ₱${taxableIncome.toLocaleString()} under ATC ${atc}`,
        source: 'Employee tax information',
      });
    } else if (eligibility.finalPay || config.annualizeTax) {
      // Final pay annualises, and so does a year-end adjustment run: the year's taxable income, including previous
      // employer data, against the annual table, less what was already withheld.
      const previous = employee.previousEmployer || {};
      const annualTaxable = round2(number(employee.ytd?.taxableEarnings) + taxableIncome + number(previous.grossTaxableIncome));
      const due = graduatedTax(schedules.annualTax, annualTaxable, 'Annual').tax;
      taxTableUsed = schedules.annualTax;
      const alreadyWithheld = round2(number(employee.ytd?.taxWithheld) + number(previous.taxWithheld));
      withholdingTax = round2(Math.max(0, due - alreadyWithheld));
      taxBasis = eligibility.finalPay ? 'Annualised (BIR annual table) — final pay' : 'Annualised (BIR annual table) — year-end adjustment';
      record({
        code: 'TAX-008', category: 'Tax', amount: withholdingTax, evaluate: false,
        inputs: { basic_earnings_ytd: number(employee.ytd?.taxableEarnings), taxable_earnings: taxableIncome, previous_employer_taxable: number(previous.grossTaxableIncome), withholding_tax: alreadyWithheld },
        detail: `Annual tax due ₱${due.toLocaleString()} on ₱${annualTaxable.toLocaleString()} less ₱${alreadyWithheld.toLocaleString()} already withheld`,
        source: 'BIR annual tax table',
      });
      if (due < alreadyWithheld) exceptions.push({ severity: 'Info', message: `Over-withholding of ₱${round2(alreadyWithheld - due).toLocaleString()} — a tax refund is due on this ${eligibility.finalPay ? 'final pay' : 'year-end adjustment'}.` });
    } else {
      const result = graduatedTax(schedules.tax, taxableIncome, transaction.paymentMode);
      taxTableUsed = schedules.tax;
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

  if ((context.earlierUnposted || []).length && config.ytd?.includePosted !== false) {
    exceptions.push({ severity: 'Info', message: `Year-to-date excludes ${context.earlierUnposted.join(', ')} (earlier ${transaction.paymentMode} period, not yet posted). Recalculate after it posts.` });
  }

  /* 10 — gross up --------------------------------------------------------- */
  let grossUp = null;
  const grossUpWanted = (config.grossUpAll || pay.grossUp === 'Yes') && computeTax && !exemptFromTax && taxableIncome > 0;
  const periodicCompensation = /compensation table$/.test(taxBasis);
  if (grossUpWanted && !periodicCompensation) {
    exceptions.push({ severity: 'Info', message: `Gross up covers periodic compensation tax only, so this line (${taxBasis}) was not grossed up.` });
  }
  if (grossUpWanted && periodicCompensation) {
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

  if (Number.isFinite(Number(override.withholdingTax)) && override.withholdingTax !== '' && override.withholdingTax !== null) {
    withholdingTax = round2(Math.max(0, Number(override.withholdingTax)));
    taxBasis = 'Manual override transaction';
    record({
      code: 'TAX-002', label: 'Withholding tax override', category: 'Tax', amount: withholdingTax, evaluate: false,
      inputs: { withholding_tax_override: withholdingTax },
      detail: 'Authorized amount entered on an Override payroll transaction',
      source: 'Payroll transaction override',
    });
  }

  /* 11 — deductions and loans --------------------------------------------- */
  // Statutory and tax are settled, so a deduction bound to any of them now
  // resolves the figures this line reached rather than the zeros it started at.
  Object.assign(runtime, {
    statutory_deductions: statutoryEmployee,
    taxable_income: taxableIncome,
    withholding_tax: withholdingTax,
  });
  const collections = withinScope(collectionItemsFor({
    salary,
    loanSchedules: (context.loanSchedules || []).filter(row => row.employeeId === employee.employeeId),
    registerDeductions: (context.registers?.deductions) || [],
    manual: [...(override.deductions || []), ...corrections.deductions],
    transaction, employee, hierarchy: context.hierarchy || [], staggeredRequests: context.staggeredRequests || [],
    resolveBound,
  }), resolveScope, employee, outOfScope);
  collections.forEach(item => recordBinding(item, 'Deductions'));
  collections.filter(item => item.authorised === false).forEach(item => {
    exceptions.push({ severity: 'Warning', message: `${item.name} has no acknowledged authority to deduct; it is held out of this run.` });
  });
  // A binding that could not resolve has already raised its exception; keeping
  // a zero-value row in the collection list would only clutter the payslip.
  const collectible = [
    ...adjustForRun(collections.filter(item => item.authorised !== false && item.due > 0 && item.group === 'Loan'), 'Loan', 'due'),
    ...adjustForRun(collections.filter(item => item.authorised !== false && item.due > 0 && item.group !== 'Loan'), 'Deduction', 'due'),
    ...adjustForRun(attendanceItems, 'Deduction', 'due'),
  ].filter(item => number(item.due) > 0).sort((left, right) => left.rank - right.rank);
  payItemAdjustments.forEach(change => exceptions.push({
    severity: 'Info',
    message: change.excluded
      ? `${change.name} (₱${change.computed.toLocaleString()}) is left out of this run${change.scope === 'run' ? ' for every employee' : ''}${change.reason ? ` — ${change.reason}` : ''}.${['Deduction', 'Loan'].includes(change.group) ? ' Its balance carries to the next run.' : ''}`
      : `${change.name} is ₱${change.amount.toLocaleString()} this run instead of ₱${change.computed.toLocaleString()}${change.capped ? ' (capped at the balance outstanding)' : ''}${change.reason ? ` — ${change.reason}` : ''}.`,
  }));
  if (voluntaryHdmf > 0) {
    collectible.push({ code: 'HDMF-VOL', name: 'Pag-IBIG voluntary contribution', group: 'Deduction', kind: 'Company', due: voluntaryHdmf, outstanding: voluntaryHdmf, rank: 50, canAdjust: false, source: 'Employee Masterfile' });
  }

  // Provident and pension funds: the employee share is a deduction, the
  // employer share an accrual that does not touch net pay.
  const funds = (config.funds || [])
    .filter(fund => (pay.funds || []).includes(fund.code))
    .map(fund => {
      const basis = fund.basis === 'Gross Pay' ? grossPay : basicPay;
      return { code: fund.code, name: fund.name, fundType: fund.fundType, basis: fund.basis || 'Basic Pay', basisAmount: round2(basis), employeeRate: number(fund.employeeRate), employerRate: number(fund.employerRate), employee: round2(basis * number(fund.employeeRate) / 100), employer: round2(basis * number(fund.employerRate) / 100) };
    });
  funds.filter(fund => fund.employee > 0).forEach(fund => {
    collectible.push({ code: fund.code, name: `${fund.name} (employee share)`, group: 'Deduction', kind: 'Fund', due: fund.employee, outstanding: fund.employee, rank: 45, canAdjust: false, source: 'Payroll Controls' });
    record({ code: fund.code, label: `${fund.name} — employee ${fund.employeeRate}%, employer ${fund.employerRate}%`, category: 'Deductions', amount: fund.employee, evaluate: false, inputs: { fund_basis: fund.basisAmount }, detail: `${fund.employeeRate}% of ${fund.basis} withheld; employer accrues ₱${fund.employer.toLocaleString()}`, source: 'Payroll Controls' });
  });

  /* 12 — take-home pay policy --------------------------------------------- */
  const takeHomeChoice = takeHomePolicyForLine(context.policies?.takeHome || {}, config.takeHome || {}, override.takeHome || {});
  const takeHomePolicy = takeHomeChoice.policy;
  if (takeHomeChoice.override) {
    exceptions.push({
      severity: 'Info',
      message: takeHomeChoice.override.mode === 'off'
        ? `Take-home pay protection is not applied ${takeHomeChoice.override.scope === 'run' ? 'on this run' : 'for this employee on this run'}${takeHomeChoice.override.reason ? ` — ${takeHomeChoice.override.reason}` : ''}.`
        : `Protected minimum take-home pay is ₱${takeHomeChoice.override.minimum.toLocaleString()} for this run instead of the policy's${takeHomeChoice.override.reason ? ` — ${takeHomeChoice.override.reason}` : ''}.`,
    });
  }
  // Forecast tax: an amount the company withholds in advance on top of the computed tax — for
  // example when the employee had a previous employer. It is switched on for the run and typed
  // per employee (or uploaded). An annualizing line already settles the whole year's tax, so a
  // forecast there would be withheld twice and is ignored.
  let taxForecast = 0;
  if (config.taxForecast?.enabled && computeTax && !exemptFromTax) {
    const requested = Math.max(0, number(override.taxForecast));
    if (requested > 0 && grossUp) {
      exceptions.push({ severity: 'Info', message: `Forecast tax of ₱${requested.toLocaleString()} was not withheld: this line is grossed up, so the employer carries the tax.` });
    } else if (requested > 0 && (eligibility.finalPay || config.annualizeTax)) {
      exceptions.push({ severity: 'Info', message: `Forecast tax of ₱${requested.toLocaleString()} was not withheld: this line annualizes the year's tax, which already settles it.` });
    } else if (requested > 0) {
      taxForecast = round2(requested);
      record({ code: 'TAX-002', label: 'Forecast tax withheld in advance', category: 'Tax', amount: taxForecast, evaluate: false, inputs: { withholding_tax: withholdingTax }, detail: `₱${taxForecast.toLocaleString()} withheld in advance on top of the computed ₱${withholdingTax.toLocaleString()}`, source: override.batchFields?.taxForecast || 'Entered on the transaction' });
    }
  }
  const taxHeld = round2(withholdingTax + taxForecast);

  const protectedBase = takeHomePolicy.base === 'Basic Pay' ? basicPay
    : takeHomePolicy.base === 'Gross Pay less Reimbursements' ? round2(grossPay - sum(allEarnings.filter(item => classOf(item.classification).group === 'Receivables / Reimbursements'), item => item.amount))
    : grossPay;
  const applied = applyTakeHomePolicy({
    policy: takeHomePolicy,
    items: collectible,
    gross: round2(grossPay - taxHeld),
    statutory: statutoryEmployee,
    protectedBase,
  });
  record({ code: 'THP-001', category: 'Take-Home Pay', amount: applied.protectedMinimum, evaluate: false, inputs: { take_home_base: protectedBase, minimum_take_home_rate: number(takeHomePolicy.threshold) / 100 }, detail: `${takeHomePolicy.thresholdType === 'Fixed Amount' ? 'Fixed' : `${takeHomePolicy.threshold}% of ${takeHomePolicy.base || 'Gross Pay'}`} protected minimum net`, source: 'Take-Home Pay policy engine' });
  if (applied.deferred > 0) {
    record({ code: 'THP-002', category: 'Take-Home Pay', amount: applied.deferred, evaluate: false, inputs: { gross_pay: grossPay, statutory_deductions: statutoryEmployee, take_home_base: protectedBase }, detail: 'Controllable deductions deferred so net pay clears the protected minimum', source: 'Take-Home Pay policy engine' });
    exceptions.push({ severity: 'Info', message: `₱${applied.deferred.toLocaleString()} of deductions was deferred to protect the minimum take-home pay.` });
  }
  // Deferral tracking: how many times each item has now been deferred, when
  // last, and the due date it first missed.
  const period = `${toIsoDate(transaction.periodStart)} to ${toIsoDate(transaction.periodEnd)}`;
  applied.items = applied.items.map(item => {
    const history = context.deferralHistory?.[`${employee.employeeId}|${item.code || item.name}`];
    if (!history && !(item.deferred > 0)) return item;
    const deferredNow = item.deferred > 0;
    const timesDeferred = (history?.times || 0) + (deferredNow ? 1 : 0);
    if (deferredNow && timesDeferred >= 3) exceptions.push({ severity: 'Warning', message: `${item.name} has now been deferred ${timesDeferred} times (first due ${history?.originalDueDate || toIsoDate(transaction.payoutDate)}).` });
    return {
      ...item, timesDeferred,
      deferredBefore: history?.total || 0,
      lastDeferredPeriod: deferredNow ? period : history?.lastPeriod || '',
      originalDueDate: history?.originalDueDate || (deferredNow ? toIsoDate(transaction.payoutDate) : ''),
    };
  });
  if (applied.exception) exceptions.push({ severity: 'Warning', message: `Net pay of ₱${applied.netPay.toLocaleString()} is below the protected minimum of ₱${applied.protectedMinimum.toLocaleString()}.` });

  /* 13 — net pay and bank splits ------------------------------------------ */
  const totalDeductions = round2(statutoryEmployee + taxHeld + applied.deducted);
  const netPay = record({
    code: 'PAY-002', category: 'Payroll Result',
    inputs: {
      gross_pay: grossPay, withholding_tax: taxHeld, statutory_deductions: statutoryEmployee,
      other_deductions: round2(sum(applied.items.filter(item => item.group !== 'Loan'), item => item.deducted)),
      loan_amortizations: round2(sum(applied.items.filter(item => item.group === 'Loan'), item => item.deducted)),
    },
    detail: 'Gross pay less tax, statutory contributions, deductions and loan amortisations',
  });

  // With pay in more than one currency, the bank percentages split the PHP
  // part, and each foreign amount is credited in full to the primary account.
  const currencyPayouts = foreignPay.lines.length ? payoutsByCurrency(netPay, foreignPay.lines, attendance.hoursWorked) : null;
  const phpPayout = currencyPayouts ? currencyPayouts[0].amount : netPay;
  const banks = employee.banks || [];
  const bankSplits = banks.map(account => ({
    bankName: account.bankName, accountNumber: account.accountNumber,
    percentOfNetPay: number(account.percentOfNetPay),
    amount: round2(phpPayout * number(account.percentOfNetPay) / 100),
    ...(currencyPayouts ? { currency: 'PHP', symbol: currencyPayouts[0].symbol, baseAmount: round2(phpPayout * number(account.percentOfNetPay) / 100) } : {}),
  }));
  if (currencyPayouts && phpPayout === 0) bankSplits.splice(0, bankSplits.length);
  if (currencyPayouts) {
    const primary = [...banks].sort((left, right) => number(right.percentOfNetPay) - number(left.percentOfNetPay))[0] || { bankName: 'Unassigned', accountNumber: '' };
    currencyPayouts.slice(1).forEach(payout => bankSplits.push({
      bankName: primary.bankName, accountNumber: primary.accountNumber, percentOfNetPay: null,
      currency: payout.currency, symbol: payout.symbol, amount: payout.amount, baseAmount: payout.phpAmount, rate: payout.rate,
    }));
  }
  const splitTotal = round2(sum(bankSplits.filter(row => row.percentOfNetPay != null), row => row.percentOfNetPay));
  if (banks.length && !(currencyPayouts && phpPayout === 0) && Math.abs(splitTotal - 100) > 0.01) {
    exceptions.push({ severity: 'Warning', message: `Bank allocation totals ${splitTotal}% instead of 100%.` });
  }
  if (netPay < 0) exceptions.push({ severity: 'Error', message: 'Net pay is negative — review the deductions collected on this line.' });
  (currencyPayouts || []).filter(payout => payout.reducedBy).forEach(payout => exceptions.push({
    severity: 'Warning',
    message: `Deductions are larger than the PHP pay, so ₱${payout.reducedBy.phpAmount.toLocaleString()} (${payout.symbol}${payout.reducedBy.amount.toLocaleString()}) was taken from the ${payout.currency} pay.`,
  }));

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
    taxableIncome, withholdingTax, taxForecast, taxBasis, taxAtc, taxRate, reclassifiedNonTaxable,
    leaveConversions: conversionPaid,
    taxTable: taxTableUsed ? { code: taxTableUsed.code, name: taxTableUsed.name, effectiveDate: taxTableUsed.effectiveDate } : null,
    // Every statutory and tax table version this line read, for the ledger.
    tablesUsed: Object.fromEntries(['sss', 'philhealth', 'pagibig', 'tax', 'annualTax', 'expandedTax', 'finalTax', 'deMinimis']
      .filter(agency => schedules[agency]?.code).map(agency => [agency, { code: schedules[agency].code, effectiveDate: schedules[agency].effectiveDate }])),
    rounding: 'Each amount rounded half up to 2 decimals as it is computed',
    // A minimum wage earner's statutory minimum wage and the premiums on it
    // are exempt, and BIR forms report them separately.
    mwe: pay.mwe === 'Yes',
    mweIncome: pay.mwe === 'Yes'
      ? round2(basicPay + sum(allEarnings.filter(item => item.source === 'Timekeeping' || /^(OT|ND|HOL|ECOLA)/.test(String(item.code || ''))), item => item.amount))
      : 0,
    corrections: corrections.ids,
    funds,
    timekeepingExempt,
    grossUp,
    deductions: applied.items.filter(item => item.group !== 'Loan'),
    loans: applied.items.filter(item => item.group === 'Loan'),
    deferred: applied.items.filter(item => item.deferred > 0).map(item => ({ ...item, deferredAmount: item.deferred })),
    takeHome: { protectedMinimum: applied.protectedMinimum, protectedBase: applied.protectedBase, deferred: applied.deferred, exception: applied.exception },
    totalEarnings: grossPay,
    totalDeductions,
    netPay,
    currencyPayouts,
    payItemAdjustments,
    takeHomeOverride: takeHomeChoice.override,
    bankSplits,
    // Each ledger step names the reference table version it read and how it was rounded.
    steps: steps.map(step => {
      const agency = /^SSS/.test(step.source) ? 'sss' : /^PhilHealth/.test(step.source) ? 'philhealth' : /^Pag-IBIG/.test(step.source) ? 'pagibig'
        : /annual tax table/.test(step.source) ? 'annualTax' : /BIR compensation tax table/.test(step.source) ? (taxTableUsed === schedules.expandedTax ? 'expandedTax' : taxTableUsed === schedules.finalTax ? 'finalTax' : 'tax')
        : /De Minimis statutory table/.test(step.source) ? 'deMinimis' : '';
      const table = agency && schedules[agency]?.code ? { code: schedules[agency].code, effectiveDate: schedules[agency].effectiveDate } : null;
      return { ...step, rounding: 'Half up, 2 decimals', ...(table ? { referenceVersion: table } : {}) };
    }),
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
  const currency = transaction.currency || 'PHP';
  const conversionRate = currency === 'PHP' ? 1 : Number(transaction.conversionRate);
  if (!Number.isFinite(conversionRate) || conversionRate <= 0) {
    throw new Error(`A positive ${currency}-to-PHP conversion rate is required for this payroll transaction.`);
  }
  const employees = context.employees || [];
  const baseLines = employees.map(employee => computeEmployeeLine({ employee, transaction, context }));
  const convert = value => round2(number(value) / conversionRate);
  const lines = baseLines.map(line => (line.status !== 'Computed' ? line : {
    ...line,
    settlement: {
      currency,
      conversionRate,
      basicPay: convert(line.basicPay),
      grossPay: convert(line.grossPay),
      totalDeductions: convert(line.totalDeductions),
      netPay: convert(line.netPay),
    },
  }));
  const computed = lines.filter(line => line.status === 'Computed');
  const totals = {
    headcount: computed.length,
    excluded: lines.length - computed.length,
    basicPay: round2(sum(computed, line => line.basicPay)),
    grossPay: round2(sum(computed, line => line.grossPay)),
    taxableIncome: round2(sum(computed, line => line.taxableIncome)),
    withholdingTax: round2(sum(computed, line => line.withholdingTax)),
    taxForecast: round2(sum(computed, line => line.taxForecast || 0)),
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
  const settlementTotals = Object.fromEntries(Object.entries(totals).map(([key, value]) => [
    key,
    ['headcount', 'excluded'].includes(key) ? value : convert(value),
  ]));
  const currencies = runCurrenciesOf(transaction);
  return {
    lines, totals, exceptions,
    baseCurrency: 'PHP', currency, conversionRate, settlementTotals,
    currencies,
    currencyTotals: currencyTotalsFor(lines, currencies),
    computationSnapshot: computationSnapshotFor(lines, context),
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * The immutable record of which formula version produced this run.
 *
 * Without it, re-opening an August transaction after `ERN-002` moves from v1.3
 * to v1.4 would explain August's figures with July's formula. The snapshot is
 * captured at calculation time and travels with the transaction, so a posted
 * payroll keeps pointing at the version it actually applied.
 */
export function computationSnapshotFor(lines = [], context = {}) {
  const library = context.computations || [];
  const used = new Map();
  lines.forEach(line => (line.steps || []).forEach(step => {
    if (used.has(step.code)) return;
    const formula = computationByCode(step.code, library);
    used.set(step.code, {
      code: step.code,
      name: step.label,
      category: step.category,
      version: step.version || formula?.version || '',
      expression: step.expression || formula?.expression || '',
      effectiveDate: step.effectiveDate || formula?.effectiveDate || '',
      owner: step.formulaOwner || (formula?.scope === 'Client-specific' ? 'Client-specific' : formula?.isBuiltIn === false ? 'Company-defined' : 'Atlas standard'),
      evaluated: Boolean(step.evaluated),
    });
  }));
  return {
    capturedAt: new Date().toISOString(),
    entries: [...used.values()].sort((left, right) => left.code.localeCompare(right.code)),
  };
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
    { account: '2110-100', description: 'Withholding tax payable', debit: 0, credit: round2(totals.withholdingTax + (totals.taxForecast || 0)) },
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
  const currency = result.currency || 'PHP';
  const conversionRate = currency === 'PHP' ? 1 : Number(result.conversionRate) || 1;
  const convert = value => round2(number(value) / conversionRate);
  return result.lines.filter(line => line.status === 'Computed').flatMap(line => (line.bankSplits.length
    ? line.bankSplits
    : [{ bankName: 'Unassigned', accountNumber: '', percentOfNetPay: 100, amount: line.netPay }])
    .map(split => ({
      employeeCode: line.employeeCode, name: line.name,
      bankName: split.bankName, accountNumber: split.accountNumber,
      // A line paid in several currencies carries each split's own currency.
      ...(split.currency
        ? { currency: split.currency, amount: round2(split.amount), baseAmount: round2(split.baseAmount ?? split.amount), share: split.percentOfNetPay == null ? 'Full amount' : `${split.percentOfNetPay}% of PHP` }
        : { currency, amount: convert(split.amount), baseAmount: round2(split.amount), share: `${split.percentOfNetPay}%` }),
    })));
}

/** Year-to-date balances a posted run adds to the employee's payroll record. */
export function ytdContributionOf(line) {
  return {
    taxableEarnings: round2(line.basicPay + line.taxableEarnings + line.taxableBonus),
    basicEarnings: line.basicPay,
    nonTaxableEarnings: round2(line.nonTaxableEarnings + line.nonTaxableBonus),
    bonusPaid: round2(line.nonTaxableBonus + line.taxableBonus + (line.reclassifiedNonTaxable || 0)),
    taxWithheld: round2(line.withholdingTax + (line.taxForecast || 0)),
    sss: line.statutory.sssEmployee,
    philhealth: line.statutory.philhealthEmployee,
    hdmf: line.statutory.hdmfEmployee,
    netPay: line.netPay,
  };
}

/** Which pay period of the year a transaction is, 1-based, from its period end. */
export function periodNumberOf(transaction) {
  const perYear = PERIODS_PER_YEAR[transaction.paymentMode] || 24;
  const end = toIsoDate(transaction.periodEnd);
  const month = Number(end.slice(5, 7)) || 1;
  if (transaction.paymentMode === 'Monthly') return month;
  if (transaction.paymentMode === 'Semi-monthly') return month * 2 - (transaction.frequency === 'First Half' ? 1 : 0);
  const dayOfYear = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${end.slice(0, 4)}-01-01T00:00:00Z`)) / 86400000) + 1;
  return Math.min(perYear, Math.max(1, Math.ceil(dayOfYear / 365 * perYear)));
}

/* --------------------------------------------------------- assigned shift */

/**
 * The shift an employee works at the end of a period: the latest assignment that
 * has started and not yet ended. Timekeeping owns the assignment; payroll only
 * reads the hours it defines.
 */
export function shiftFor(assignments = [], employeeId, periodEnd) {
  const at = toIsoDate(periodEnd);
  return (assignments || [])
    .filter(item => item.employeeId === employeeId && number(item.workHours) > 0)
    .filter(item => (!item.startDate || toIsoDate(item.startDate) <= at) && (!item.endDate || toIsoDate(item.endDate) >= at))
    .sort((left, right) => String(toIsoDate(right.startDate)).localeCompare(String(toIsoDate(left.startDate))))[0] || null;
}
