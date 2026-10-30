/**
 * Earning Configuration rules the payroll applies: Cap Amount, and the Adjustment Earning
 * that is deducted once Minimum Number of Absent is reached.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultHrmData } from '../src/hrmData.js';
import { employeeRoster, findRosterEmployee } from '../src/employeeRoster.js';
import { effectiveVersionIn, seedStatutoryData } from '../src/statutorySchedules.js';
import { seedComputations } from '../src/computationCatalog.js';
import { computeEmployeeLine } from '../src/payrollEngine.js';

const hrm = defaultHrmData('ABC-PH-001');
const statutoryData = seedStatutoryData();
const employee = findRosterEmployee('EMP-1002');
const transaction = {
  transactionNumber: 'PR-2025-11-001', payrollType: 'Regular', paymentMode: 'Semi-monthly', year: 2025, month: 'November', frequency: 'Second Half',
  periodStart: '2025-11-16', periodEnd: '2025-11-30', timekeepingStart: '2025-11-01', timekeepingEnd: '2025-11-15', payoutDate: '2025-11-30',
  config: { workDaysPerYear: 261, workHoursPerDay: 8, statutoryAgencies: { sss: true, philhealth: true, pagibig: true, sssWisp: true }, statutorySchedule: 'Every payroll (split)', computeTax: true },
  population: { mode: 'Active/Inactive in 201', includeOnHold: false, included: [], excluded: [] }, overrides: {},
};
const subsidy = [{ code: 'ERN-901', name: 'Housing Subsidy', employee: `${employee.code} - ${employee.name}`, amount: 3000, frequency: 'Semi-monthly', status: 'Active', periodStart: '2025-01-01', periodEnd: '' }];
const absences = count => Array.from({ length: count }, (_, i) => ({ employeeId: employee.employeeId, date: `2025-11-${String(3 + i).padStart(2, '0')}`, status: 'Absent' }));
const line = (setups, absent = 0) => computeEmployeeLine({
  employee, transaction,
  context: {
    employees: employeeRoster, salaryInformation: hrm.salaryInformation, timeLogs: [...hrm.timeLogs.filter(row => row.employeeId !== employee.employeeId), ...absences(absent)], loanSchedules: hrm.loanInquiries,
    registers: { earnings: subsidy, deductions: [], bonuses: [], payCodes: [] },
    statutory: Object.fromEntries(Object.keys(statutoryData).map(agency => [agency, effectiveVersionIn(statutoryData, agency, '2025-11-30')])),
    policies: { takeHome: { enabled: false } }, serviceConfig: { earnings: setups }, hierarchy: [], computations: seedComputations(), bonusCeiling: 90000,
  },
});
const paid = result => result.earnings.find(item => item.code === 'ERN-901')?.amount;

test('a capped earning pays no more than its Cap Amount', () => {
  assert.equal(paid(line([{ code: 'ERN-901', name: 'Housing Subsidy', cappedEarning: 'No' }])), 3000);
  assert.equal(paid(line([{ code: 'ERN-901', name: 'Housing Subsidy', cappedEarning: 'Yes', cappedAmount: '1000' }])), 1000);
});

test('the Adjustment Earning is deducted once the minimum absences are reached', () => {
  const setups = [{ code: 'ERN-901', name: 'Housing Subsidy', adjustIfAbsent: 'Yes', adjustmentEarning: 'Absent Adjustment', minimumAbsent: '2' }, { code: 'ERN-902', name: 'Absent Adjustment', defaultAmount: '500' }];
  const adjustment = result => result.earnings.find(item => item.code === 'ERN-901-ABS');
  assert.equal(adjustment(line(setups, 1)), undefined, 'one absence is below the minimum');
  assert.equal(adjustment(line(setups, 2))?.amount, -500, 'two absences reach it');
  assert.ok(line(setups, 2).grossPay < line(setups, 1).grossPay);
});
