/**
 * Employee Masterfile › Payroll Allocation → the payroll transaction.
 *
 * The Project Plan assigns earnings, deductions, loans and bonuses in the Employee Masterfile (ATLAS-1419,
 * ATLAS-1420), so that is where the payroll transaction reads them from. Each employee's entries are kept
 * under the employee's code. For an employee who has entries in a section, those entries are the section the
 * payroll uses; for one who has none the payroll keeps reading the HR record (`masterfileRowsFromHrm` shows the
 * same figures in the Masterfile, so nothing changes until someone edits them).
 *
 * Pure: no storage and no screen, so the Masterfile, the payroll context and the tests apply one rule.
 */

import { readPayrollRounding, roundTo } from './payrollRounding.js';
import { coversEmployee } from './applicabilityScope.js';

export const PAYROLL_SECTIONS = Object.freeze(['basicPay', 'earnings', 'bonuses', 'deductions', 'loans', 'statutory', 'hdmf', 'ytd', 'previousEmployer']);
/** The sections whose default rows come from the roster rather than the HR salary record. */
export const ROSTER_SECTIONS = Object.freeze(['statutory', 'hdmf', 'ytd', 'previousEmployer']);
export const EMPLOYEE_PAYROLL_KEY = 'atlas-employee-payroll-data-v4';

const number = value => (Number.isFinite(Number(value)) ? Number(value) : 0);
const round2 = value => Math.round((number(value) + Number.EPSILON) * 100) / 100;
const text = value => String(value ?? '').trim();

/** A date written as MM/DD/YYYY or YYYY-MM-DD, as YYYY-MM-DD ('' when it is neither). */
export function toIso(value) {
  const raw = text(value);
  if (!raw || raw === '-') return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parts = raw.split(/[/-]/);
  return parts.length === 3 && parts[2].length === 4 ? `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}` : '';
}

export function readEmployeePayrollStore(storage = globalThis.localStorage) {
  try { const saved = JSON.parse(storage?.getItem(EMPLOYEE_PAYROLL_KEY) || '{}'); return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}; } catch { return {}; }
}

export function writeEmployeePayrollStore(store, storage = globalThis.localStorage) {
  try { storage?.setItem(EMPLOYEE_PAYROLL_KEY, JSON.stringify(store)); } catch { /* the Masterfile still shows what was typed */ }
}

const MODE_OF_HRM_FREQUENCY = Object.freeze({ Monthly: 'Monthly', 'Semi-monthly': 'Semi-monthly', Quarterly: 'Quarterly', Annually: 'Yearly', Annual: 'Yearly', 'One-time': 'One-time', Once: 'One-time' });
const frequencyOfMode = mode => ({ Monthly: 'Every Payroll', 'Semi-monthly': 'Every Payroll', Quarterly: 'Every Payroll', Yearly: 'Yearly', 'One-time': 'Every Payroll' })[mode] || 'Every Payroll';

/** The five payroll sections of one employee, as the Masterfile shows them, taken from the HR record. */
export function masterfileRowsFromHrm(salary = {}, loans = [], pay = {}) {
  const basicPay = (salary.basicPay || []).map((row, index) => ({
    id: index + 1, dateCreated: toIso(row.dateCreated), payType: row.payType || pay.payType || 'Monthly', amount: String(row.basicPayAmount ?? row.monthlyRate ?? ''),
    workDays: String(row.workDays || pay.factorDays || 261), workDaysType: row.workDaysType || 'Per Year', workHours: String(pay.workHoursPerDay || 8),
    mwe: row.mwe || pay.mwe || 'No', location: row.location || '', ecola: String(pay.ecolaPerDay || 0),
    effectiveDate: toIso(row.effectivityDate), startMonth: row.startMonth || '', startYear: String(row.startYear || ''), periodStart: 'Every Payroll', periodEnd: '',
  }));
  const earnings = (salary.earnings || []).map((row, index) => {
    const mode = MODE_OF_HRM_FREQUENCY[row.frequency] || 'Semi-monthly';
    return {
      id: index + 1, dateCreated: toIso(row.dateCreated), code: row.earningCode || '', name: row.earningName || '', amount: String(row.earningsAmount ?? ''),
      paymentMode: mode, frequency: frequencyOfMode(mode), taxability: row.taxability || 'Taxable', classification: row.classification || 'Taxable Allowance',
      effectiveDate: toIso(row.effectivityDate), start: toIso(row.periodStart), end: toIso(row.periodEnd), periodStart: 'Every Payroll', periodEnd: '', holdDate: toIso(row.holdDate), remarks: '',
    };
  });
  const deductions = (salary.companyDeductions || []).map((row, index) => ({
    id: index + 1, name: row.deductionName || '', code: '', paymentMode: 'Semi-monthly', frequency: 'Every Payroll', amount: String(row.amountOfDeduction ?? ''),
    effectiveDate: toIso(row.startDate), startDate: toIso(row.startDate), endDate: toIso(row.endDate), periodStart: 'Every Payroll', periodEnd: '',
    count: String(row.numberOfDeductions ?? ''), total: String(row.totalDeductionAmount ?? ''), accumulated: String(row.accumulatedAmount ?? ''), holdDate: '', remarks: '',
  }));
  const loanRows = loans.map((row, index) => {
    const total = number(row.principalAmount) + number(row.interestAmount);
    return {
      id: index + 1, loanSource: row.loanType === 'Government Loan' ? 'Government Loan' : 'Company Loan', payItem: row.loanName || '', code: row.transactionNumber || row.id || '',
      paymentMode: row.paymentMode || 'Monthly', frequency: row.frequency || 'Every Payroll', amount: String(row.deductionAmount ?? ''),
      startDate: toIso(row.periodStartDate), endDate: toIso(row.periodEndDate), description: '', dateGranted: toIso(row.applicationDate), reference: row.transactionNumber || '',
      principal: String(row.principalAmount ?? ''), interest: String(row.interestAmount ?? ''), accumulatedManual: '0', accumulatedComputed: String(round2(Math.max(0, total - number(row.balance)))),
      periodStart: 'Every Payroll', periodEnd: '', holdDate: '', remarks: '',
    };
  });
  return { basicPay, earnings, bonuses: [], deductions, loans: loanRows };
}

/* ------------------------------------------------------------------ rows → what the engine reads */

const ENGINE_CLASSES = new Set(['Taxable Basic', 'Taxable Allowance', 'Taxable Bonus', 'Taxable Reimbursement', 'Non-taxable', 'De Minimis', 'Reimbursement']);

export function engineClassification(row = {}) {
  if (/^salary$/i.test(text(row.name))) return 'Taxable Basic'; // the salary line is the basic pay the run computes in its own step
  const classification = text(row.classification);
  if (ENGINE_CLASSES.has(classification)) return classification;
  if (row.taxability === 'De Minimis' || classification === 'De Minimis') return 'De Minimis';
  if (classification === 'Receivable') return 'Reimbursement';
  if (row.taxability === 'Non-taxable' || /non-?taxable/i.test(classification)) return 'Non-taxable';
  return 'Taxable Allowance';
}

const ENGINE_FREQUENCY = Object.freeze({ Monthly: 'Monthly', Quarterly: 'Quarterly', Yearly: 'Annually', 'One-time': 'One-time' });
export const engineFrequency = row => ENGINE_FREQUENCY[text(row.paymentMode)] || 'Semi-monthly';

/** Whether an entry's named half of the month, hold date and start date let it count in this run. */
function counts(row, run = {}) {
  const half = text(row.frequency);
  if ((half === 'First Half' || half === 'Second Half') && run.paymentMode === 'Semi-monthly' && run.frequency && run.frequency !== half) return false;
  const hold = toIso(row.holdDate);
  if (hold && hold <= toIso(run.periodEnd || run.payoutDate)) return false;
  const start = toIso(row.startDate || row.start);
  if (start && run.payoutDate && start > toIso(run.payoutDate)) return false;
  return true;
}

/** The basic pay entry in force on a date: the latest one effective on or before it, else the earliest one. */
export function basicPayInForce(rows = [], onIso = '') {
  const dated = rows.map(row => ({ row, at: toIso(row.effectiveDate) || toIso(row.dateCreated) })).sort((a, b) => a.at.localeCompare(b.at));
  if (!dated.length) return null;
  const effective = dated.filter(item => !onIso || !item.at || item.at <= onIso);
  return (effective.length ? effective[effective.length - 1] : dated[0]).row;
}

/**
 * The Basic Pay entries payroll has used, keyed by entry id, with the transactions that used each. A run uses the entry in
 * force on its payout date; a cancelled run does not count. `runs` are `{ transactionNumber, status, payoutDate }`.
 */
export function basicPayUsage(rows = [], runs = []) {
  const used = new Map();
  runs.filter(run => run.status !== 'Cancelled' && (run.periodEnd || run.payoutDate)).forEach(run => {
    const row = basicPayInForce(rows, toIso(run.periodEnd || run.payoutDate));
    if (!row || row.id === undefined) return;
    used.set(row.id, [...(used.get(row.id) || []), run.transactionNumber]);
  });
  return used;
}

const BASIC_PAY_PERIODS = Object.freeze(['Every Payroll', 'First Half', 'Second Half']);
const BASIC_PAY_MONTHS = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);

/** Annex B (Dorado Basic Pay): Period Start and Period End follow the payment frequency. A semi-monthly employee has both halves; every other frequency has Every Payroll. */
export function periodsForFrequency(paymentMode = '') {
  // "Semi-monthly", "Semi-Monthly" and "Semimonthly" are the same frequency; an employee with no payment mode yet is not restricted.
  const mode = String(paymentMode || '').toLowerCase().replace(/[^a-z]/g, '');
  return !mode || mode === 'semimonthly' ? [...BASIC_PAY_PERIODS] : [BASIC_PAY_PERIODS[0]];
}

/**
 * What ties Start Month, Start Year, Period Start and Period End together on a Basic Pay entry (to be confirmed with P&A): they name the
 * payroll cut-off the rate starts in, while the Effectivity Date is the exact day. So the start cannot fall before the month of the
 * Effectivity Date, the periods must be ones the employee's frequency has, and the end cannot come before the start.
 */
export function basicPayPeriodProblems(row = {}, paymentMode = '') {
  const problems = [];
  const options = periodsForFrequency(paymentMode);
  [['periodStart', 'Period Start'], ['periodEnd', 'Period End']].forEach(([key, label]) => {
    if (text(row[key]) && !options.includes(text(row[key]))) problems.push(`${label} ${text(row[key])} is not available for ${paymentMode || 'this'} pay. Choose ${options.join(' or ')}.`);
  });
  const monthIndex = BASIC_PAY_MONTHS.indexOf(text(row.startMonth));
  const year = Number(text(row.startYear));
  const effective = toIso(row.effectiveDate);
  if (monthIndex >= 0 && Number.isInteger(year) && effective) {
    const [effectiveYear, effectiveMonth] = effective.split('-').map(Number);
    if (year * 12 + monthIndex < effectiveYear * 12 + (effectiveMonth - 1)) problems.push('Start Month and Start Year cannot be earlier than the month of the Effectivity Date.');
  }
  const order = BASIC_PAY_PERIODS.indexOf(text(row.periodStart)) > BASIC_PAY_PERIODS.indexOf(text(row.periodEnd)) && text(row.periodStart) && text(row.periodEnd);
  if (order && text(row.periodStart) === 'Second Half' && text(row.periodEnd) === 'First Half') problems.push('Period End cannot be before Period Start.');
  return problems;
}

/**
 * The Earnings, Bonuses, Deductions and Loans entries payroll has used, keyed by entry id, with the transactions that used each (slides: a used
 * record cannot be edited or deleted). A run uses an entry when its line names the item and the entry had started by the period end; a
 * cancelled run does not count. `runs` carry `items: { earnings: [names], bonuses: [...], deductions: [...], loans: [...] }`.
 */
export function recordUsage(sectionKey, rows = [], runs = []) {
  const nameOf = { earnings: row => row.name, bonuses: row => row.name, deductions: row => row.name, loans: row => row.payItem }[sectionKey];
  const startOf = row => toIso(row.effectiveDate) || toIso(row.startDate) || toIso(row.start) || toIso(row.dateCreated);
  const used = new Map();
  if (!nameOf) return used;
  runs.filter(run => run.status !== 'Cancelled').forEach(run => {
    const names = run.items?.[sectionKey] || [];
    const end = toIso(run.periodEnd || run.payoutDate);
    rows.forEach(row => {
      const name = nameOf(row);
      if (!name || row.id === undefined || !names.includes(name)) return;
      const start = startOf(row);
      if (start && end && start > end) return;
      used.set(row.id, [...new Set([...(used.get(row.id) || []), run.transactionNumber])]);
    });
  });
  return used;
}

/**
 * The Basic Pay entry a payroll run uses (Basic Pay slide 7: the latest record effective for the payroll period). A record that takes
 * effect after the period starts does not change the rate of the whole period: the run pays the record in force at the start and reports
 * the change, so the days from the new Effectivity Date are paid as the earning Basic Pay Adjustment (Annex B, Dorado Basic Pay).
 */
export function basicPayForRun(rows = [], run = {}, fallbackIso = '') {
  const startIso = toIso(run.periodStart);
  const endIso = toIso(run.periodEnd) || fallbackIso;
  const atEnd = basicPayInForce(rows, endIso);
  if (!atEnd) return { row: null, change: null };
  const effective = toIso(atEnd.effectiveDate) || toIso(atEnd.dateCreated);
  if (startIso && effective && effective > startIso) {
    const before = basicPayInForce(rows.filter(row => row !== atEnd), startIso);
    const beforeEffective = before && (toIso(before.effectiveDate) || toIso(before.dateCreated));
    if (before && beforeEffective && beforeEffective <= startIso) {
      return { row: before, change: { effectiveDate: effective, oldRates: ratesOfBasicPay(before), newRates: ratesOfBasicPay(atEnd), payType: atEnd.payType || before.payType } };
    }
  }
  return { row: atEnd, change: null };
}

/** The five rates of a basic pay entry (the same ones the Masterfile shows as it is typed). */
export function ratesOfBasicPay(row = {}) {
  const amount = number(row.amount);
  const workDays = Math.max(1, number(row.workDays) || 261);
  const workHours = Math.max(1, number(row.workHours) || 8);
  const type = row.payType || 'Monthly';
  let annual; let daily; let hourly;
  if (type === 'Daily') { daily = amount; annual = daily * workDays; hourly = daily / workHours; }
  else if (type === 'Hourly') { hourly = amount; daily = hourly * workHours; annual = daily * workDays; }
  else { annual = amount * 12; daily = annual / workDays; hourly = daily / workHours; }
  const places = readPayrollRounding().basicPay;
  return { annualRate: roundTo(annual, places), monthlyRate: roundTo(annual / 12, places), dailyRate: roundTo(daily, places), hourlyRate: roundTo(hourly, places), perMinuteRate: roundTo(hourly / 60, places), workDays, workHours, payType: type };
}

const balanceOfDeduction = row => {
  const amount = number(row.amount);
  const count = number(row.count);
  const total = count > 0 ? amount * count : number(row.total);
  return round2(Math.max(0, total - number(row.accumulated)));
};
const balanceOfLoan = row => round2(Math.max(0, number(row.principal) + number(row.interest) - number(row.accumulatedManual) - number(row.accumulatedComputed)));

/**
 * The employee's payroll inputs, replacing the HR record for every section the employee has entries in.
 * `store` is the Masterfile store keyed by employee code; `run` is the transaction being computed.
 */
export function overlayMasterfile({ employees = [], salaryInformation = [], loanSchedules = [], bonuses = [], store = {}, run = {} } = {}) {
  const onIso = toIso(run.payoutDate || run.periodEnd);
  const entriesOf = employee => store[employee.code] || store[employee.employeeCode] || null;
  const has = (entries, key) => Boolean(entries) && Array.isArray(entries[key]);

  const nextEmployees = employees.map(employee => {
    const entries = entriesOf(employee);
    if (!entries) return employee;
    let next = employee;
    if (has(entries, 'basicPay')) {
      const { row, change } = basicPayForRun(entries.basicPay, run, onIso);
      if (row) {
        const rates = ratesOfBasicPay(row);
        next = {
          ...next,
          ...(change ? { basicPayChange: change } : {}),
          payroll: {
            ...(next.payroll || {}), payType: rates.payType, monthlyRate: rates.monthlyRate, monthlyBasic: rates.monthlyRate, dailyRate: rates.dailyRate, hourlyRate: rates.hourlyRate,
            annualRate: rates.annualRate, perMinuteRate: rates.perMinuteRate, factorDays: rates.workDays, workHoursPerDay: rates.workHours,
            mwe: row.mwe || 'No', ecolaPerDay: number(row.ecola),
          },
        };
      }
    }
    if (has(entries, 'ytd')) next = { ...next, ytd: ytdFromRows(entries.ytd, next.ytd || {}, next.ytdPosted || {}, onIso.slice(0, 4)) };
    if (has(entries, 'previousEmployer')) next = { ...next, previousEmployer: previousEmployerFromRows(entries.previousEmployer, onIso.slice(0, 4)) };
    if (has(entries, 'statutory')) next = { ...next, masterfileStatutory: entries.statutory };
    if (has(entries, 'hdmf')) {
      const row = rowInForce(entries.hdmf, onIso);
      if (row) {
        const held = toIso(row.holdDate) && toIso(row.holdDate) <= toIso(run.periodEnd || run.payoutDate);
        next = {
          ...next, masterfileHdmf: entries.hdmf,
          payroll: { ...(next.payroll || {}), hdmfEmployeeContribution: number(row.employee), hdmfEmployerContribution: number(row.employer), ...(held ? { withHdmf: 'No', hdmfHeld: toIso(row.holdDate) } : {}) },
        };
      }
    }
    return next;
  });

  const nextSalary = salaryInformation.map(info => {
    const employee = employees.find(item => item.employeeId === info.employeeId || item.code === info.employeeCode);
    const entries = employee ? entriesOf(employee) : store[info.employeeCode];
    if (!entries) return info;
    const out = { ...info };
    if (has(entries, 'basicPay')) {
      const { row } = basicPayForRun(entries.basicPay, run, onIso);
      if (row) { const rates = ratesOfBasicPay(row); out.basicPay = [{ ...(info.basicPay?.[0] || {}), payType: rates.payType, basicPayAmount: number(row.amount), monthlyRate: rates.monthlyRate, dailyRate: rates.dailyRate, hourlyRate: rates.hourlyRate, annualRate: rates.annualRate, mwe: row.mwe || 'No', effectivityDate: row.effectiveDate }]; }
    }
    if (has(entries, 'earnings')) {
      out.earnings = entries.earnings.filter(row => counts(row, run)).map(row => ({
        earningCode: row.code || row.name, earningName: row.name, classification: engineClassification(row), frequency: engineFrequency(row), earningsAmount: number(row.amount),
        periodStart: toIso(row.start) || toIso(row.effectiveDate), periodEnd: toIso(row.end), taxability: row.taxability,
      }));
    }
    if (has(entries, 'deductions')) {
      out.companyDeductions = entries.deductions.filter(row => counts(row, run)).map(row => ({
        deductionName: row.name, amountOfDeduction: number(row.amount), totalBalance: balanceOfDeduction(row), startDate: toIso(row.startDate), endDate: toIso(row.endDate),
      }));
    }
    return out;
  });

  const codesWithLoans = new Set(employees.filter(employee => has(entriesOf(employee), 'loans')).map(employee => employee.employeeId));
  const nextLoans = [
    ...loanSchedules.filter(row => !codesWithLoans.has(row.employeeId)),
    ...employees.filter(employee => codesWithLoans.has(employee.employeeId)).flatMap(employee => entriesOf(employee).loans.filter(row => counts(row, run)).map((row, index) => {
      const balance = balanceOfLoan(row);
      return {
        id: row.code || `LN-${employee.code}-${index + 1}`, transactionNumber: row.code || `LN-${employee.code}-${index + 1}`, employeeId: employee.employeeId, employeeCode: employee.code,
        employeeName: employee.name, loanName: row.payItem, loanType: row.loanSource === 'Government Loan' ? 'Government Loan' : 'Company Loan',
        deductionAmount: number(row.amount), balance, status: balance > 0 ? 'ACTIVE' : 'PAID', periodStartDate: toIso(row.startDate), periodEndDate: toIso(row.endDate),
        principalAmount: number(row.principal), interestAmount: number(row.interest), paymentMode: row.paymentMode, frequency: row.frequency,
      };
    })),
  ];

  const nextBonuses = [
    ...bonuses,
    ...employees.flatMap(employee => (has(entriesOf(employee), 'bonuses') ? entriesOf(employee).bonuses : [])
      .filter(row => !toIso(row.effectiveDate) || toIso(row.effectiveDate) <= onIso)
      .filter(row => !text(row.releaseMonth) || !run.month || text(row.releaseMonth) === run.month)
      .map(row => ({ employee: `${employee.code} - ${employee.name}`, name: row.name, amount: number(row.amount), status: 'Active', source: 'Employee Masterfile' }))),
  ];
  return { employees: nextEmployees, salaryInformation: nextSalary, loanSchedules: nextLoans, bonuses: nextBonuses };
}

/* ------------------------------------------------------------------ Statutory, HDMF, Payroll Records (YTD), Previous Employer */

const yes = value => /^(yes|true)$/i.test(text(value));
const yearOf = iso => String(iso || '').slice(0, 4);

/** What the Masterfile shows for these four sections before anything is typed: the figures the roster already holds. */
export function masterfileRowsFromRoster(employee = {}, ytdAsOf = '') {
  const pay = employee.payroll || {};
  const hdmf = pay.withHdmf === 'Yes' && (number(pay.hdmfEmployeeContribution) || number(pay.hdmfEmployerContribution))
    ? [{ id: 1, effectiveDate: toIso(employee.dateHired), holdDate: '', employee: String(pay.hdmfEmployeeContribution ?? ''), employer: String(pay.hdmfEmployerContribution ?? '') }] : [];
  const ytd = employee.ytd || {};
  const hasYtd = ['basicEarnings', 'taxableEarnings', 'bonusPaid', 'deMinimisPaid', 'nonTaxableEarnings', 'taxWithheld', 'sss', 'philhealth', 'hdmf'].some(key => number(ytd[key]));
  const ytdRows = hasYtd ? [{
    id: 1, year: yearOf(ytdAsOf), basicPay: String(ytd.basicEarnings ?? 0), taxableIncome: String(ytd.taxableEarnings ?? 0), nonTaxableBonus: String(ytd.bonusPaid ?? 0), deMinimis: String(ytd.deMinimisPaid ?? 0),
    otherNonTaxable: String(round2(Math.max(0, number(ytd.nonTaxableEarnings) - number(ytd.bonusPaid) - number(ytd.deMinimisPaid)))),
    statutoryEmployee: String(round2(number(ytd.sss) + number(ytd.philhealth) + number(ytd.hdmf))), taxWithheld: String(ytd.taxWithheld ?? 0),
  }] : [];
  const previous = employee.previousEmployer;
  const previousRows = previous ? [{
    id: 1, hasPreviousBalance: 'Yes', employerName: previous.name || '', employerAddress: previous.address || '', tin: previous.tin || '', employmentYear: yearOf(toIso(previous.to)),
    startDate: toIso(previous.from), endDate: toIso(previous.to), taxType: previous.taxType === 'Minimum Wage' ? 'Minimum Wage' : 'Normal', minimumWage: previous.isMinimumWage === 'Yes' ? 'Yes' : 'No',
    basicPay: String(previous.basicPay ?? ''), taxableBonus: String(previous.taxableBonus ?? ''), otherTaxable: String(previous.otherTaxableIncome ?? ''), grossTaxable: String(previous.grossTaxableIncome ?? ''),
    nonTaxableBonus: String(previous.nontaxableBonus ?? ''), deMinimis: String(previous.deMinimis ?? ''), allowableDeductions: String(previous.allowableDeductions ?? ''),
    otherNonTaxable: String(previous.otherNonTaxableIncome ?? ''), taxWithheld: String(previous.taxWithheld ?? ''),
  }] : [];
  return { statutory: [], hdmf, ytd: ytdRows, previousEmployer: previousRows };
}

/** The employee's year-to-date balances with the opening figures typed for the payout year; posted payrolls are added on top. */
export function ytdFromRows(rows = [], existing = {}, posted = {}, year = '') {
  const row = [...rows].reverse().find(item => text(item.year) === String(year));
  if (!row) return existing;
  const added = key => number(posted?.[key]);
  const nonTaxable = number(row.nonTaxableBonus) + number(row.deMinimis) + number(row.otherNonTaxable);
  return {
    ...existing,
    basicEarnings: round2(number(row.basicPay) + added('basicEarnings')), taxableEarnings: round2(number(row.taxableIncome) + added('taxableEarnings')),
    bonusPaid: round2(number(row.nonTaxableBonus) + added('bonusPaid')), deMinimisPaid: round2(number(row.deMinimis)),
    nonTaxableEarnings: round2(nonTaxable + added('nonTaxableEarnings')), taxWithheld: round2(number(row.taxWithheld) + added('taxWithheld')),
  };
}

/** What earlier employers in the payout year hold, in the shape the engine reads (null when none counts). */
export function previousEmployerFromRows(rows = [], year = '') {
  const counted = rows.filter(row => yes(row.hasPreviousBalance) && (!toIso(row.endDate) || yearOf(toIso(row.endDate)) === String(year)));
  if (!counted.length) return null;
  const sumOf = key => round2(counted.reduce((total, row) => total + number(row[key]), 0));
  const gross = round2(counted.reduce((total, row) => total + (text(row.grossTaxable) !== '' ? number(row.grossTaxable) : number(row.basicPay) + number(row.taxableBonus) + number(row.otherTaxable)), 0));
  return {
    name: counted.map(row => text(row.employerName)).filter(Boolean).join(' / '), tin: text(counted[0].tin), address: text(counted[0].employerAddress),
    from: toIso(counted[0].startDate), to: toIso(counted[counted.length - 1].endDate),
    basicPay: sumOf('basicPay'), taxableBonus: sumOf('taxableBonus'), otherTaxableIncome: sumOf('otherTaxable'), grossTaxableIncome: gross,
    nontaxableBonus: sumOf('nonTaxableBonus'), deMinimis: sumOf('deMinimis'), allowableDeductions: sumOf('allowableDeductions'), otherNonTaxableIncome: sumOf('otherNonTaxable'),
    taxWithheld: sumOf('taxWithheld'), isMinimumWage: counted.some(row => yes(row.minimumWage)) ? 'Yes' : 'No', taxType: counted.every(row => row.taxType === 'Minimum Wage') ? 'Minimum Wage' : 'Compensation',
  };
}

const AGENCY_OF_CODE = Object.freeze({ SSS: 'sss', PHIC: 'philhealth', PHILHEALTH: 'philhealth', HDMF: 'hdmf', 'PAG-IBIG': 'hdmf', PAGIBIG: 'hdmf' });
const KEYS_OF_AGENCY = Object.freeze({ sss: ['sssEmployee', 'sssEmployer'], philhealth: ['philhealthEmployee', 'philhealthEmployer'], hdmf: ['hdmfEmployee', 'hdmfEmployer'] });
const LABEL_OF_AGENCY = Object.freeze({ sss: 'SSS', philhealth: 'PhilHealth', hdmf: 'Pag-IBIG' });

/** The latest row effective on or before a date, among those whose start and end dates include it. */
function rowInForce(rows = [], onIso = '') {
  return rows
    .filter(row => (!toIso(row.effectiveDate) || !onIso || toIso(row.effectiveDate) <= onIso)
      && (!toIso(row.startDate) || !onIso || toIso(row.startDate) <= onIso)
      && (!toIso(row.endDate) || !onIso || toIso(row.endDate) >= onIso))
    .sort((a, b) => toIso(a.effectiveDate).localeCompare(toIso(b.effectiveDate)))
    .pop() || null;
}

/**
 * Contribution amounts typed in the Employee Masterfile (Statutory Deductions and Shares, HDMF Contribution)
 * in place of the table's, for one transaction. An amount is the month's figure: "Every Payroll" takes the run's
 * collection share (half in a split semi-monthly run), "First Half" / "Second Half" collect it in full in that
 * cut-off only, and "Monthly" collects it in full in the last cut-off. A hold date on or before the period end
 * stops that agency. Returns `{ amounts: { sssEmployee, ... }, held: ['sss', ...], from: { key: 'SSS entry' } }`.
 */
export function masterfileContributions(employee = {}, transaction = {}, collect = 1) {
  const onIso = toIso(transaction.payoutDate || transaction.periodEnd);
  const endIso = toIso(transaction.periodEnd) || onIso;
  const semi = transaction.paymentMode === 'Semi-monthly';
  const first = transaction.frequency === 'First Half';
  const timed = (frequency, amount) => {
    if (frequency === 'First Half') return semi && !first ? 0 : amount;
    if (frequency === 'Second Half' || frequency === 'Monthly') return semi && first ? 0 : amount;
    return amount * collect;
  };
  const amounts = {}; const held = []; const from = {};
  const byAgency = {};
  (employee.masterfileStatutory || []).forEach(row => {
    const agency = AGENCY_OF_CODE[text(row.statutoryCode).toUpperCase()];
    if (agency) (byAgency[agency] = byAgency[agency] || []).push(row);
  });
  Object.entries(byAgency).forEach(([agency, rows]) => {
    const row = rowInForce(rows, onIso);
    if (!row) return;
    const [employeeKey, employerKey] = KEYS_OF_AGENCY[agency];
    if (toIso(row.holdDate) && toIso(row.holdDate) <= endIso) {
      held.push(agency); amounts[employeeKey] = 0; amounts[employerKey] = 0; from[employeeKey] = from[employerKey] = `${LABEL_OF_AGENCY[agency]} on hold from ${toIso(row.holdDate)}`;
      return;
    }
    if (text(row.employee) !== '') { amounts[employeeKey] = round2(timed(text(row.frequency), number(row.employee))); from[employeeKey] = `${LABEL_OF_AGENCY[agency]} entry`; }
    if (text(row.employer) !== '') { amounts[employerKey] = round2(timed(text(row.frequency), number(row.employer))); from[employerKey] = `${LABEL_OF_AGENCY[agency]} entry`; }
  });
  const hdmfRow = rowInForce(employee.masterfileHdmf || [], onIso);
  if (hdmfRow && amounts.hdmfEmployer === undefined && !held.includes('hdmf') && text(hdmfRow.employer) !== '') {
    amounts.hdmfEmployer = round2(number(hdmfRow.employer) * collect); from.hdmfEmployer = 'HDMF Contribution entry';
  }
  return { amounts, held, from };
}

/* ------------------------------------------------------------------ what the company setups give every employee */

/**
 * The earnings the company set up (Earning Configuration) that an employee is entitled to and does not
 * already hold: Active, with a default amount, covering the employee, in effect on the payout date. They are
 * the same ones the Employee Masterfile lists as "From Earning Configuration", so what the screen shows is what is paid.
 */
export function inheritedEarningRows({ configs = [], employee = {}, existing = [], run = {} } = {}) {
  const held = new Set(existing.flatMap(row => [text(row.earningCode || row.code), text(row.earningName || row.name)]).filter(Boolean).map(value => value.toLowerCase()));
  const onIso = toIso(run.payoutDate || run.periodEnd);
  return configs
    .filter(item => (item.status || 'Active') === 'Active' && number(item.defaultAmount) > 0)
    .filter(item => coversEmployee(item.applicability, employee))
    .filter(item => !held.has(text(item.code).toLowerCase()) && !held.has(text(item.name).toLowerCase()))
    .filter(item => { const from = toIso(item.startDate) || toIso(item.effectivityDate); return !from || !onIso || from <= onIso; })
    .filter(item => counts({ frequency: item.frequency, holdDate: item.holdDate }, run))
    .map(item => ({
      earningCode: item.code, earningName: item.name, earningsAmount: number(item.defaultAmount), classification: engineClassification({ name: item.name, taxability: item.taxability, classification: item.classification }),
      frequency: engineFrequency({ paymentMode: item.paymentMode }), periodStart: toIso(item.startDate) || toIso(item.effectivityDate), periodEnd: toIso(item.endDate), taxability: item.taxability, source: 'Earning Configuration',
    }));
}

/** The engine's overtime types and the Overtime Rate Management day type (and rate) each one reads. */
const OVERTIME_SETUP = Object.freeze({
  Regular: [['Regular Workday'], 'regularOvertime'],
  'Night Differential': [['Regular Workday'], 'nightShiftDifferential'],
  'Rest Day': [['Rest Day'], 'regularOvertime'],
  Holiday: [['Regular Holiday', 'Special Non-working Holiday'], 'regularOvertime'],
});

/**
 * The overtime multipliers the company set up for one employee on a date, by the engine's overtime type.
 * A type the setup does not cover is left out, so the caller falls back to the standard multiplier.
 */
export function overtimeMultipliersFor(records = [], employee = {}, onDate = '') {
  const onIso = toIso(onDate);
  const usable = records
    .filter(item => (item.status || 'Active') === 'Active' && coversEmployee(item.applicability, employee))
    .filter(item => (!toIso(item.effectiveDate) || !onIso || toIso(item.effectiveDate) <= onIso) && (!toIso(item.effectiveTo) || !onIso || toIso(item.effectiveTo) >= onIso))
    .sort((a, b) => toIso(b.effectiveDate).localeCompare(toIso(a.effectiveDate)));
  const result = {};
  Object.entries(OVERTIME_SETUP).forEach(([type, [dayTypes, rateKey]]) => {
    for (const dayType of dayTypes) {
      const record = usable.find(item => item.type === dayType && number(item[rateKey]) > 0);
      if (record) { result[type] = number(record[rateKey]) / 100; break; }
    }
  });
  return result;
}
