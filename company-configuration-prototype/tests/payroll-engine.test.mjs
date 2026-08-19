/**
 * The payroll computation engine.
 *
 * These tests exercise the pipeline end to end against the real roster, the
 * real punch record and the real statutory tables — not against fixtures the
 * engine could satisfy by accident. What they are protecting is the claim the
 * module makes: every figure is derived from a module that owns it, and every
 * step names the Computational Basis code that produced it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultHrmData } from '../src/hrmData.js';
import { employeeRoster, findRosterEmployee } from '../src/employeeRoster.js';
import { effectiveVersionIn, graduatedTax, seedStatutoryData, sssContribution } from '../src/statutorySchedules.js';
import { seedComputations } from '../src/computationCatalog.js';
import {
  OT_MULTIPLIERS,
  applyTakeHomePolicy,
  attendanceFor,
  bankFileFor,
  computeEmployeeLine,
  eligibilityFor,
  journalFor,
  runPayroll,
  workingDaysBetween,
  ytdContributionOf,
} from '../src/payrollEngine.js';

const hrm = defaultHrmData('ABC-PH-001');
const statutoryData = seedStatutoryData();

const baseTransaction = (overrides = {}) => ({
  transactionNumber: 'PR-2025-11-001',
  payrollType: 'Regular',
  paymentMode: 'Semi-monthly',
  year: 2025,
  month: 'November',
  frequency: 'Second Half',
  periodStart: '2025-11-16',
  periodEnd: '2025-11-30',
  timekeepingStart: '2025-11-01',
  timekeepingEnd: '2025-11-15',
  payoutDate: '2025-11-30',
  ...overrides,
  config: {
    workDaysPerYear: 261,
    workHoursPerDay: 8,
    computeAllowableDeduction: true,
    statutoryAgencies: { sss: true, philhealth: true, pagibig: true, sssWisp: true },
    statutorySchedule: 'Every payroll (split)',
    computeTax: true,
    computeBasicPayAdjustment: true,
    computeOvertimeAdjustment: true,
    computeAttendanceAdjustment: { absences: true, late: true, undertime: true },
    thirteenthMonth: { enabled: false, basis: 'Pre-defined (Computational Basis)', ntThreshold: 90000, bonusTypes: ['13th Month Pay'] },
    ...(overrides.config || {}),
  },
  population: { mode: 'Active/Inactive in 201', includeOnHold: false, included: [], excluded: [], ...(overrides.population || {}) },
  overrides: overrides.overrides || {},
});

const context = (overrides = {}) => ({
  employees: employeeRoster,
  salaryInformation: hrm.salaryInformation,
  timeLogs: hrm.timeLogs,
  loanSchedules: hrm.loanInquiries,
  registers: { earnings: [], deductions: [], bonuses: [], payCodes: [] },
  statutory: Object.fromEntries(Object.keys(statutoryData).map(agency => [agency, effectiveVersionIn(statutoryData, agency, '2025-11-30')])),
  policies: { takeHome: { enabled: true, autoDefer: true, thresholdType: 'Percentage', threshold: 20, base: 'Gross Pay' } },
  hierarchy: [],
  computations: seedComputations(),
  bonusCeiling: 90000,
  ...overrides,
});

const lineFor = (employeeId, transaction = baseTransaction(), ctx = context()) =>
  computeEmployeeLine({ employee: findRosterEmployee(employeeId), transaction, context: ctx });

/* ------------------------------------------------------------- eligibility */

test('payment mode decides who is even in the transaction', () => {
  const monthly = baseTransaction({ paymentMode: 'Monthly' });
  employeeRoster.forEach(employee => {
    const eligibility = eligibilityFor(employee, monthly);
    assert.equal(eligibility.included, false, `${employee.name} is semi-monthly, not monthly`);
    assert.match(eligibility.reason, /Payment mode/);
  });
});

test('an on-hold employee joins only when the run asks for them', () => {
  const held = findRosterEmployee('EMP-1008');
  assert.equal(eligibilityFor(held, baseTransaction()).included, false);
  assert.match(eligibilityFor(held, baseTransaction()).reason, /On hold/);
  assert.equal(eligibilityFor(held, baseTransaction({ population: { includeOnHold: true } })).included, true);
});

test('a dummy-tagged record is never paid, whatever the run asks for', () => {
  const dummy = { ...findRosterEmployee('EMP-1001'), employeeTagging: 'Dummy' };
  assert.equal(eligibilityFor(dummy, baseTransaction({ population: { includeOnHold: true } })).included, false);
});

test('an employee hired after the period is left out', () => {
  const future = { ...findRosterEmployee('EMP-1002'), dateHired: '2026-03-01' };
  assert.match(eligibilityFor(future, baseTransaction()).reason, /Date hired/);
});

/* ------------------------------------------------------------------ rates */

test('rates are derived from the salary record, not typed in', () => {
  const line = lineFor('EMP-1001');
  const salary = hrm.salaryInformation.find(row => row.employeeId === 'EMP-1001').basicPay[0];
  assert.equal(line.rates.monthlyRate, salary.monthlyRate);
  assert.equal(line.rates.dailyRate, Number((salary.monthlyRate * 12 / 261).toFixed(2)));
  assert.equal(line.rates.hourlyRate, Number((line.rates.dailyRate / 8).toFixed(2)));
});

test('changing factor days on the run changes every derived rate', () => {
  const standard = lineFor('EMP-1001');
  const shorter = lineFor('EMP-1001', baseTransaction({ config: { workDaysPerYear: 313 } }));
  assert.ok(shorter.rates.dailyRate < standard.rates.dailyRate);
  assert.equal(shorter.rates.dailyRate, Number((standard.rates.monthlyRate * 12 / 313).toFixed(2)));
});

/* -------------------------------------------------------------- basic pay */

test('a monthly-paid employee is paid the period share of the monthly rate', () => {
  const line = lineFor('EMP-1001');
  assert.equal(line.basicPay, line.rates.monthlyRate / 2);
});

test('a daily-paid employee is priced from the days the punch record shows', () => {
  const line = lineFor('EMP-1004');
  const attendance = attendanceFor(hrm.timeLogs, 'EMP-1004', baseTransaction());
  assert.equal(line.payType, 'Daily');
  assert.equal(line.basicPay, Number((line.rates.dailyRate * (attendance.daysWorked + attendance.paidLeaveDays)).toFixed(2)));
});

test('a minimum wage earner is paid the daily rate plus ECOLA and withholds no tax', () => {
  const line = lineFor('EMP-1008', baseTransaction({ population: { includeOnHold: true } }));
  const attendance = attendanceFor(hrm.timeLogs, 'EMP-1008', baseTransaction());
  const days = attendance.daysWorked + attendance.paidLeaveDays;
  assert.equal(line.basicPay, Number((line.rates.dailyRate * days + 30 * days).toFixed(2)));
  assert.equal(line.withholdingTax, 0);
  assert.match(line.taxBasis, /Minimum wage/);
});

test('an employee hired or separated inside the period is pro-rated by payable days', () => {
  const separated = lineFor('EMP-1007');
  assert.ok(separated.proration, 'the line records that it was pro-rated');
  const payable = workingDaysBetween('2025-11-16', '2025-11-20');
  const total = workingDaysBetween('2025-11-16', '2025-11-30');
  assert.equal(separated.proration.payableDays, payable);
  assert.equal(separated.basicPay, Number((separated.rates.monthlyRate / 2 * payable / total).toFixed(2)));
});

test('zero basic pay pays earnings only', () => {
  const line = lineFor('EMP-1001', baseTransaction({ config: { zeroBasicPay: true } }));
  assert.equal(line.basicPay, 0);
  assert.ok(line.grossPay > 0, 'earnings still pay out');
});

/* ------------------------------------------------------------- timekeeping */

test('attendance counts a late or undertime day as rendered, and prices the minutes separately', () => {
  const attendance = attendanceFor(hrm.timeLogs, 'EMP-1001', baseTransaction());
  const rows = attendance.rows;
  assert.equal(attendance.daysWorked, rows.filter(row => !['Absent', 'On Leave'].includes(row.status)).length);
  assert.ok(attendance.tardinessMinutes > 0, 'the seeded fortnight contains late minutes');
});

test('tardiness and undertime are priced at the per-minute rate', () => {
  const line = lineFor('EMP-1001');
  const tardy = line.deductions.find(item => item.name === 'Tardiness');
  if (tardy) assert.equal(tardy.due, Number((line.rates.hourlyRate / 60 * line.attendance.tardinessMinutes).toFixed(2)));
  const undertime = line.deductions.find(item => item.name === 'Undertime');
  if (undertime) assert.equal(undertime.due, Number((line.rates.hourlyRate / 60 * line.attendance.undertimeMinutes).toFixed(2)));
});

test('an employee exempt from tardiness in the 201 file is not deducted for it', () => {
  const exempt = lineFor('EMP-1006');
  assert.equal(findRosterEmployee('EMP-1006').payroll.tardinessClassification, 'Exempt');
  assert.equal(exempt.deductions.some(item => item.name === 'Tardiness'), false);
});

test('a daily-paid employee is never deducted for absences, because unworked days are simply unpaid', () => {
  const line = lineFor('EMP-1004');
  assert.ok(line.attendance.absentDays > 0, 'the seeded fortnight contains an absence');
  assert.equal(line.deductions.some(item => item.kind === 'Attendance'), false);
});

test('approved overtime is paid at the premium for its type', () => {
  const line = lineFor('EMP-1001');
  Object.entries(line.attendance.overtimeByType).forEach(([type, hours]) => {
    const earning = line.earnings.find(item => item.name === `Overtime — ${type}`);
    assert.ok(earning, `${type} overtime is paid`);
    assert.equal(earning.amount, Number((line.rates.hourlyRate * hours * OT_MULTIPLIERS[type]).toFixed(2)));
  });
});

test('only approved overtime is paid — pending and rejected hours are not', () => {
  const pendingOnly = hrm.timeLogs.map(row => (row.employeeId === 'EMP-1001' ? { ...row, overtimeStatus: 'Pending' } : row));
  const line = lineFor('EMP-1001', baseTransaction(), context({ timeLogs: pendingOnly }));
  assert.equal(line.attendance.overtimeHours, 0);
  assert.equal(line.earnings.some(item => item.hours), false);
});

test('a corrected punch restates the payroll line', () => {
  const before = lineFor('EMP-1001');
  const corrected = hrm.timeLogs.map(row => (row.employeeId === 'EMP-1001' ? { ...row, tardinessMinutes: 0, undertimeMinutes: 0 } : row));
  const after = lineFor('EMP-1001', baseTransaction(), context({ timeLogs: corrected }));
  assert.ok(after.netPay > before.netPay, 'removing late minutes raises net pay');
  assert.equal(after.deductions.some(item => item.kind === 'Attendance' && ['Tardiness', 'Undertime'].includes(item.name)), false);
});

/* ----------------------------------------------------- earnings and bonuses */

test('a recurring earning is spread across the periods of its month', () => {
  const line = lineFor('EMP-1001');
  const meal = line.earnings.find(item => item.name === 'Meal Allowance');
  const salary = hrm.salaryInformation.find(row => row.employeeId === 'EMP-1001');
  const monthly = salary.earnings.find(row => row.earningName === 'Meal Allowance').earningsAmount;
  assert.equal(meal.amount, monthly / 2, 'a monthly earning halves on a semi-monthly run');
});

test('a quarterly or annual earning falls due in the last period of its cycle rather than never', () => {
  const withEarning = (frequency, periodEnd, frequencyLabel) => {
    const salary = hrm.salaryInformation.map(row => (row.employeeId === 'EMP-1001'
      ? { ...row, earnings: [{ earningCode: 'Q1', earningName: 'Quarterly incentive', earningsAmount: 9000, classification: 'Taxable Allowance', frequency, periodStart: '2025-01-01', periodEnd: '2025-12-31' }] }
      : row));
    const transaction = baseTransaction({ periodStart: periodEnd.replace(/-\d\d$/, '-16'), periodEnd, frequency: frequencyLabel });
    return computeEmployeeLine({ employee: findRosterEmployee('EMP-1001'), transaction, context: context({ salaryInformation: salary }) })
      .earnings.find(item => item.name === 'Quarterly incentive');
  };
  assert.equal(withEarning('Quarterly', '2025-11-30', 'Second Half'), undefined, 'November is not a quarter end');
  assert.equal(withEarning('Quarterly', '2025-12-31', 'Second Half').amount, 9000, 'December pays the quarter');
  assert.equal(withEarning('Annually', '2025-11-30', 'Second Half'), undefined);
  assert.equal(withEarning('Annually', '2025-12-31', 'Second Half').amount, 9000);
  assert.equal(withEarning('Quarterly', '2025-12-15', 'First Half'), undefined, 'the first cutoff of the month does not pay it');
});


test('a De Minimis benefit above its annual ceiling is reclassified as taxable', () => {
  const line = lineFor('EMP-1001');
  const excess = line.earnings.find(item => item.name.includes('above ceiling'));
  assert.ok(excess, 'the exhausted uniform allowance produced a taxable remainder');
  assert.equal(excess.classification, 'Taxable Allowance');
  assert.ok(line.exceptions.some(item => /De Minimis ceiling/.test(item.message)));
});

test('the 13th month non-taxable ceiling is consumed in the order the bonuses were selected', () => {
  const transaction = baseTransaction({ config: { thirteenthMonth: { enabled: true, basis: 'Pre-defined (Computational Basis)', ntThreshold: 90000, bonusTypes: ['13th Month Pay'] } } });
  const line = lineFor('EMP-1001', transaction);
  const bonus = line.bonuses.find(item => item.name === '13th Month Pay');
  const employee = findRosterEmployee('EMP-1001');
  assert.equal(bonus.amount, Number(((employee.ytd.basicEarnings + line.basicPay) / 12).toFixed(2)));
  assert.equal(bonus.nonTaxable + bonus.taxable, bonus.amount);
  assert.ok(bonus.nonTaxable <= 90000);
});

test('a lower ceiling makes more of the bonus taxable', () => {
  const withCeiling = amount => lineFor('EMP-1001', baseTransaction({
    config: { thirteenthMonth: { enabled: true, basis: 'Pre-defined (Computational Basis)', ntThreshold: amount, bonusTypes: ['13th Month Pay'] } },
  }));
  assert.ok(withCeiling(0).bonuses[0].taxable > withCeiling(90000).bonuses[0].taxable, 'a zero threshold is a real choice, not a missing value');
  assert.equal(withCeiling(0).bonuses[0].nonTaxable, 0);
});

test('an employee exempt from the 13th month in the 201 file gets no bonus', () => {
  const employee = { ...findRosterEmployee('EMP-1002'), payroll: { ...findRosterEmployee('EMP-1002').payroll, thirteenthMonthClassification: 'Exempt' } };
  const line = computeEmployeeLine({
    employee,
    transaction: baseTransaction({ config: { thirteenthMonth: { enabled: true, basis: 'Pre-defined (Computational Basis)', ntThreshold: 90000, bonusTypes: ['13th Month Pay'] } } }),
    context: context(),
  });
  assert.equal(line.bonuses.length, 0);
});

/* -------------------------------------------------------------- statutory */

test('statutory contributions come from the effective table, split across the cutoff', () => {
  const line = lineFor('EMP-1001');
  const monthly = sssContribution(effectiveVersionIn(statutoryData, 'sss', '2025-11-30'), line.rates.monthlyRate);
  assert.equal(line.statutory.sssEmployee, Number((monthly.employee / 2).toFixed(2)));
  assert.equal(line.statutory.collectedShare, 0.5);
});

test('collecting on one cutoff takes the whole monthly contribution', () => {
  const secondHalf = lineFor('EMP-1001', baseTransaction({ config: { statutorySchedule: 'Second cutoff only' } }));
  const firstHalf = lineFor('EMP-1001', baseTransaction({ frequency: 'First Half', config: { statutorySchedule: 'Second cutoff only' } }));
  const monthly = sssContribution(effectiveVersionIn(statutoryData, 'sss', '2025-11-30'), secondHalf.rates.monthlyRate);
  assert.equal(secondHalf.statutory.sssEmployee, monthly.employee);
  assert.equal(firstHalf.statutory.sssEmployee, 0);
});

test('an employee switched off Pag-IBIG in the 201 file gets no HDMF contribution', () => {
  const line = lineFor('EMP-1006');
  assert.equal(findRosterEmployee('EMP-1006').payroll.withHdmf, 'No');
  assert.equal(line.statutory.hdmfEmployee, 0);
  assert.ok(line.statutory.sssEmployee > 0, 'the other agencies still compute');
});

test('turning off Compute Allowable Deduction stops every contribution, however the 201 file is set', () => {
  const line = lineFor('EMP-1001', baseTransaction({ config: { computeAllowableDeduction: false } }));
  assert.equal(line.statutory.employeeTotal, 0);
  assert.equal(line.statutory.employerTotal, 0);
});

test('deselecting an agency stops only that agency', () => {
  const line = lineFor('EMP-1001', baseTransaction({ config: { statutoryAgencies: { sss: true, philhealth: false, pagibig: true, sssWisp: true } } }));
  assert.equal(line.statutory.philhealthEmployee, 0);
  assert.ok(line.statutory.sssEmployee > 0);
});

/* --------------------------------------------------------------------- tax */

test('taxable income is taxable gross less non-taxable earnings and the statutory share', () => {
  const line = lineFor('EMP-1002');
  const taxableGross = line.basicPay + line.taxableEarnings + line.taxableBonus;
  assert.equal(line.taxableIncome, Number((taxableGross + line.nonTaxableEarnings + line.nonTaxableBonus - (line.nonTaxableEarnings + line.nonTaxableBonus) - line.statutory.employeeTotal).toFixed(2)));
});

test('withholding tax is the bracket the effective table publishes for the payment mode', () => {
  const line = lineFor('EMP-1002');
  const expected = graduatedTax(effectiveVersionIn(statutoryData, 'tax', '2025-11-30'), line.taxableIncome, 'Semi-monthly').tax;
  assert.equal(line.withholdingTax, expected);
  assert.equal(line.taxBasis, 'Semi-monthly compensation table');
});

test('an employee switched off withholding tax in the 201 file withholds nothing', () => {
  const employee = { ...findRosterEmployee('EMP-1002'), payroll: { ...findRosterEmployee('EMP-1002').payroll, withWithholdingTax: 'No' } };
  const line = computeEmployeeLine({ employee, transaction: baseTransaction(), context: context() });
  assert.equal(line.withholdingTax, 0);
  assert.match(line.taxBasis, /switched off/);
});

test('final pay annualises against the annual table and credits what was already withheld', () => {
  const line = lineFor('EMP-1007', baseTransaction({ payrollType: 'Special', config: { computeFinalPay: true } }));
  assert.equal(line.finalPay, true);
  assert.match(line.taxBasis, /Annualised/);
  const step = line.steps.find(item => item.code === 'TAX-008');
  assert.ok(step, 'the annualisation step is on the trail');
  assert.match(step.detail, /already withheld/);
});

test('gross-up back-solves against the same table and leaves the employee whole', () => {
  const line = lineFor('EMP-1006');
  assert.equal(findRosterEmployee('EMP-1006').payroll.grossUp, 'Yes');
  assert.ok(line.grossUp, 'the line records the gross-up');
  assert.equal(line.withholdingTax, 0, 'the employer absorbs the tax');
  assert.ok(line.grossUp.employerTax > 0);
  // The grossed-up amount less its own tax returns the target.
  const tax = graduatedTax(effectiveVersionIn(statutoryData, 'tax', '2025-11-30'), line.grossUp.grossedUp, 'Semi-monthly').tax;
  assert.ok(Math.abs(line.grossUp.grossedUp - tax - line.taxableIncome) < 1);
});

/* -------------------------------------------------- deductions and take-home */

test('a loan never collects more than its outstanding balance', () => {
  const line = lineFor('EMP-1003');
  const loan = line.loans.find(item => item.name === 'SSS Calamity Loan');
  assert.ok(loan, 'the seeded calamity loan is collected');
  assert.ok(loan.due <= loan.outstanding);
  assert.equal(loan.remaining, Number((loan.outstanding - loan.deducted).toFixed(2)));
});

test('a settled or closed loan is not collected again', () => {
  const closed = hrm.loanInquiries.filter(row => row.status === 'CLOSED');
  assert.ok(closed.length > 0, 'the seed contains a settled loan');
  closed.forEach(loan => {
    const line = lineFor(loan.employeeId);
    assert.equal(line.loans.some(item => item.name === loan.loanName && item.code === loan.transactionNumber), false);
  });
});

test('a loan with no acknowledged authority to deduct is held out and raises an exception', () => {
  const unauthorised = hrm.loanInquiries.map(row => (row.employeeId === 'EMP-1002'
    ? { ...row, authorityToDeduct: { acknowledged: false } }
    : row));
  const line = lineFor('EMP-1002', baseTransaction(), context({ loanSchedules: unauthorised }));
  assert.equal(line.loans.length, 0);
  assert.ok(line.exceptions.some(item => /authority to deduct/.test(item.message)));
});

test('the take-home policy defers controllable deductions rather than breaching the minimum', () => {
  const heavy = hrm.loanInquiries.map(row => (row.employeeId === 'EMP-1005' ? { ...row, deductionAmount: 40000, balance: 400000 } : row));
  const protective = context({
    loanSchedules: heavy,
    policies: { takeHome: { enabled: true, autoDefer: true, thresholdType: 'Percentage', threshold: 60, base: 'Gross Pay' } },
  });
  const line = lineFor('EMP-1005', baseTransaction(), protective);
  assert.ok(line.takeHome.deferred > 0, 'something was deferred');
  assert.ok(line.netPay + 0.01 >= line.takeHome.protectedMinimum, 'net pay clears the protected minimum');
  assert.ok(line.deferred.length > 0, 'the deferred items are listed on the line');
});

test('the deferral algorithm the policy screen simulates is the one payroll applies', () => {
  const items = [
    { code: 'A', name: 'Loan A', group: 'Loan', kind: 'Company', rank: 1, due: 5000, outstanding: 20000, canAdjust: true },
    { code: 'B', name: 'Deduction B', group: 'Deduction', kind: 'Company', rank: 2, due: 3000, outstanding: 3000, canAdjust: true },
  ];
  const result = applyTakeHomePolicy({
    policy: { enabled: true, autoDefer: true, thresholdType: 'Fixed Amount', threshold: 15000 },
    items, gross: 20000, statutory: 1000, protectedBase: 20000,
  });
  assert.equal(result.protectedMinimum, 15000);
  assert.equal(result.netPay, 15000);
  assert.equal(result.deferred, 4000);
  // Rank 1 is adjusted first.
  assert.equal(result.items.find(item => item.code === 'A').deferred, 4000);
  assert.equal(result.items.find(item => item.code === 'B').deferred, 0);
});

test('choosing the loan cap as the conflict priority raises an exception instead of deferring a loan', () => {
  const items = [{ code: 'A', name: 'Loan A', group: 'Loan', kind: 'Company', rank: 1, due: 9000, outstanding: 9000, canAdjust: true }];
  const result = applyTakeHomePolicy({
    policy: { enabled: true, autoDefer: true, thresholdType: 'Fixed Amount', threshold: 15000, priorityChoice: 'Loan Deduction Cap' },
    items, gross: 20000, statutory: 1000, protectedBase: 20000,
  });
  assert.equal(result.deferred, 0);
  assert.equal(result.exception, true);
  assert.equal(result.capBlocked, true);
});

/* -------------------------------------------------------------- the totals */

test('net pay is gross less tax, statutory, deductions and loans, on every line', () => {
  const result = runPayroll({ transaction: baseTransaction({ population: { includeOnHold: true } }), context: context() });
  result.lines.filter(line => line.status === 'Computed').forEach(line => {
    const collected = [...line.deductions, ...line.loans].reduce((sum, item) => sum + item.deducted, 0);
    const expected = Number((line.grossPay - line.withholdingTax - line.statutory.employeeTotal - collected).toFixed(2));
    assert.ok(Math.abs(line.netPay - expected) < 0.02, `${line.name}: ${line.netPay} vs ${expected}`);
    assert.equal(line.totalDeductions, Number((line.statutory.employeeTotal + line.withholdingTax + collected).toFixed(2)));
  });
});

test('the run totals are the sum of the lines, not a separate calculation', () => {
  const result = runPayroll({ transaction: baseTransaction({ population: { includeOnHold: true } }), context: context() });
  const computed = result.lines.filter(line => line.status === 'Computed');
  assert.equal(result.totals.headcount, computed.length);
  assert.equal(result.totals.excluded, result.lines.length - computed.length);
  const sum = key => Number(computed.reduce((total, line) => total + line[key], 0).toFixed(2));
  assert.ok(Math.abs(result.totals.netPay - sum('netPay')) < 0.02);
  assert.ok(Math.abs(result.totals.grossPay - sum('grossPay')) < 0.02);
});

test('every employee is evaluated individually, not as one shared batch result', () => {
  const result = runPayroll({ transaction: baseTransaction({ population: { includeOnHold: true } }), context: context() });
  const nets = new Set(result.lines.filter(line => line.status === 'Computed').map(line => line.netPay));
  assert.ok(nets.size > 1, 'the batch produced distinct results');
  const excluded = result.lines.filter(line => line.status === 'Excluded');
  excluded.forEach(line => assert.ok(line.exclusionReason, 'an excluded line says why'));
});

/* -------------------------------------------------------------- the trail */

test('every step names a code the Computational Basis library actually publishes', () => {
  const library = seedComputations();
  const result = runPayroll({ transaction: baseTransaction({ config: { thirteenthMonth: { enabled: true, basis: 'Pre-defined (Computational Basis)', ntThreshold: 90000, bonusTypes: ['13th Month Pay'] } } }), context: context() });
  const codes = new Set(library.map(item => item.code));
  result.lines.filter(line => line.status === 'Computed').forEach(line => {
    assert.ok(line.steps.length > 5, `${line.name} has a trail`);
    line.steps.forEach(step => {
      assert.ok(codes.has(step.code), `${step.code} is a published computation`);
      assert.ok(step.source, `${step.code} names where its values came from`);
      assert.equal(typeof step.amount, 'number');
    });
    // The trail is ordered and closes on net pay.
    assert.deepEqual(line.steps.map(step => step.seq), line.steps.map((_, index) => index + 1));
    assert.equal(line.steps[line.steps.length - 1].code, 'PAY-002');
  });
});

test('a step backed by a library expression evaluates that expression', () => {
  const line = lineFor('EMP-1001');
  const daily = line.steps.find(step => step.code === 'BAS-001');
  assert.equal(daily.evaluated, true);
  assert.equal(daily.expression, '{{monthly_basic}} * 12 / {{factor_days}}');
  assert.equal(daily.amount, line.rates.dailyRate);
});

test('editing the library formula changes the payroll figure', () => {
  const edited = seedComputations().map(item => (item.code === 'ERN-001'
    ? { ...item, expression: '{{monthly_basic}} / 4' }
    : item));
  const line = lineFor('EMP-1001', baseTransaction(), context({ computations: edited }));
  assert.equal(line.basicPay, line.rates.monthlyRate / 4);
});

/* ---------------------------------------------------- journal and bank file */

test('the journal generated from a run balances', () => {
  const result = runPayroll({ transaction: baseTransaction(), context: context() });
  const journal = journalFor(result, []);
  assert.equal(journal.balanced, true);
  assert.ok(Math.abs(journal.debit - journal.credit) < 0.01);
});

test('the bank file is one row per crediting instruction, not per employee', () => {
  const result = runPayroll({ transaction: baseTransaction(), context: context() });
  const file = bankFileFor(result);
  const split = employeeRoster.find(employee => employee.banks.length > 1);
  assert.ok(split, 'the roster contains an employee who splits their net pay');
  assert.equal(file.filter(row => row.name === split.name).length, split.banks.length);
  const total = file.reduce((sum, row) => sum + row.amount, 0);
  assert.ok(Math.abs(total - result.totals.netPay) < 0.05, 'the file pays out exactly the net pay');
});

test('a posted run contributes its own figures to the year-to-date balances', () => {
  const line = lineFor('EMP-1002');
  const contribution = ytdContributionOf(line);
  assert.equal(contribution.taxWithheld, line.withholdingTax);
  assert.equal(contribution.basicEarnings, line.basicPay);
  assert.equal(contribution.taxableEarnings, Number((line.basicPay + line.taxableEarnings + line.taxableBonus).toFixed(2)));
});
