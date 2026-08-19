/**
 * The one employee roster.
 *
 * Core (Employee Masterfile), HRM, Timekeeping and Payroll all describe the
 * same people, so they must resolve to the same identity. Before this module
 * existed the prototype carried two rosters — `employeeDirectory` for the
 * policy engines and payroll registers, `seedEmployees()` for HRM/Timekeeping —
 * which meant a payroll line could never read the punch record or the salary
 * record of the employee it was paying. Every module now derives its own view
 * from these rows:
 *
 *   - `PolicyApplicability` re-exports `employeeDirectory` (identity + the
 *     retirement / final-pay attributes the engines read).
 *   - `hrmData.seedEmployees()` derives the HRM/Timekeeping roster, so punches,
 *     leave balances and salary information are keyed on the same `employeeId`.
 *   - `payrollEngine` reads `payroll`, `government`, `banks`, `ytd` and the
 *     employment dates as the 201 file Annex C calls the payroll prerequisite.
 *
 * The payroll block is the Annex C "Items Linked to Payroll" §3a/§4 field set:
 * pay type and rate, the statutory deduction switches that decide whether a
 * contribution is computed at all, the exempt/non-exempt classifications that
 * decide whether an attendance deduction applies, and the year-to-date balances
 * the bonus ceiling and annualisation read.
 */

import { effectiveVersionIn, graduatedTax, rateContribution, seedStatutoryData, sssContribution } from './statutorySchedules.js';

const YEAR = 2025;

/** Payroll factor days and standard hours default from the company services setup. */
export const DEFAULT_FACTOR_DAYS = 261;
export const DEFAULT_WORK_HOURS = 8;

const rates = ({ monthlyBasic = 0, dailyRate = 0, hourlyRate = 0, factorDays = DEFAULT_FACTOR_DAYS, workHours = DEFAULT_WORK_HOURS, payType = 'Monthly' }) => {
  // A monthly-paid employee's daily rate is derived; a daily or hourly paid one
  // carries its own rate and the monthly equivalent is the derived figure.
  const annual = payType === 'Monthly' ? monthlyBasic * 12 : payType === 'Daily' ? dailyRate * factorDays : hourlyRate * workHours * factorDays;
  const daily = payType === 'Daily' ? dailyRate : annual / factorDays;
  const hourly = payType === 'Hourly' ? hourlyRate : daily / workHours;
  return {
    payType,
    factorDays,
    workHoursPerDay: workHours,
    annualRate: round(annual),
    monthlyRate: round(annual / 12),
    dailyRate: round(daily),
    hourlyRate: round(hourly),
    perMinuteRate: round(hourly / 60),
  };
};

const round = value => Number((Number(value) || 0).toFixed(2));

const bank = (bankName, accountNumber, percentOfNetPay, isDefault = false) => ({
  bankName, accountNumber, percentOfNetPay, accountType: 'Payroll', branch: 'Makati', isDefault,
});

/**
 * Year-to-date balances as at the start of the demonstration payroll period.
 *
 * They are derived from the employee's own rate and the statutory tables rather
 * than typed in, so an opening balance can never contradict the rates the same
 * roster publishes. `bonusPaid` and `deMinimisPaid` are what the ₱90,000 bonus
 * ceiling and the De Minimis ceilings have already consumed; `taxWithheld` and
 * `taxableEarnings` are what annualisation and BIR 2316 read.
 */
export const YTD_MONTHS_ELAPSED = 10;
const STATUTORY_YTD_DATE = '2025-01-01';

function ytdFor(pay, { months = YTD_MONTHS_ELAPSED, deMinimisMonthly = 2700, taxableAllowanceMonthly = 1500 } = {}) {
  const data = seedStatutoryData();
  const basis = pay.monthlyRate;
  const sss = pay.withSss === 'No' ? { employee: 0 } : sssContribution(effectiveVersionIn(data, 'sss', STATUTORY_YTD_DATE), basis);
  const phic = pay.withPhilhealth === 'No' ? { employee: 0 } : rateContribution(effectiveVersionIn(data, 'philhealth', STATUTORY_YTD_DATE), basis);
  const hdmf = pay.withHdmf === 'No' ? { employee: 0 } : rateContribution(effectiveVersionIn(data, 'pagibig', STATUTORY_YTD_DATE), basis);
  const statutoryMonthly = sss.employee + phic.employee + hdmf.employee;
  const taxableMonthly = basis + taxableAllowanceMonthly;
  const taxMonthly = pay.withWithholdingTax === 'No' || pay.mwe === 'Yes'
    ? 0
    : graduatedTax(effectiveVersionIn(data, 'tax', STATUTORY_YTD_DATE), taxableMonthly - statutoryMonthly, 'Monthly').tax;
  return {
    basicEarnings: round(basis * months),
    taxableEarnings: round(taxableMonthly * months),
    nonTaxableEarnings: round(deMinimisMonthly * months),
    deMinimisPaid: round(deMinimisMonthly * months),
    bonusPaid: 0,
    taxWithheld: round(taxMonthly * months),
    sss: round(sss.employee * months),
    philhealth: round(phic.employee * months),
    hdmf: round(hdmf.employee * months),
    monthsElapsed: months,
  };
}

const classifications = (overrides = {}) => ({
  absenceClassification: 'Non-exempt',
  tardinessClassification: 'Non-exempt',
  undertimeClassification: 'Non-exempt',
  overtimeClassification: 'Non-exempt',
  premiumPayClassification: 'Non-exempt',
  holidayPayClassification: 'Non-exempt',
  thirteenthMonthClassification: 'Non-exempt',
  ...overrides,
});

const statutorySwitches = (overrides = {}) => ({
  withWithholdingTax: 'Yes', withSss: 'Yes', withPhilhealth: 'Yes', withHdmf: 'Yes', withSssWisp: 'Yes',
  ...overrides,
});

/**
 * The roster. Ordered as Core's Employee Masterfile lists it, which is the
 * order every derived roster and every payroll register keeps.
 */
const rosterDefinitions = [
  {
    employeeId: 'EMP-1001', employeeCode: '0011223345', code: '0011223345', name: 'John Collins Doe', initials: 'JD',
    position: 'IT Manager', department: 'IT Department', division: 'Product Development', section: 'Applications',
    site: 'Head Office', costCenter: 'CC-IT-01', jobLevel: 'Manager', group: 'Managers',
    employmentType: 'Full Time Philippines', employmentStatus: 'Active', employeeTagging: 'Employee',
    managerId: '', shiftId: 'shift-morning',
    dateOfBirth: '1982-03-11', dateHired: '2018-02-01', regularizationDate: '2018-08-01',
    rehired: false, priorServiceYears: 0, breakMonths: 0,
    dateHold: '', endDateHold: '', holdReason: '', continueStatutoryOnHold: 'Yes',
    dateSeparated: '', separationDate: '', retirementDate: '2047-03-11',
    reason: 'Retirement', reasonForLeaving: 'Retirement', birSeparationReason: '', memberPlan: 'Company plan member',
    monthlyBasic: 85000, average36Months: 82000,
    payroll: {
      paymentMode: 'Semi-monthly', ...rates({ monthlyBasic: 85000 }), monthlyBasic: 85000,
      mwe: 'No', ecolaPerDay: 0, mweRegion: '', mweSector: '', grossUp: 'No', currency: 'PHP',
      taxType: 'Compensation', taxExemptionCode: 'S',
      ...statutorySwitches(), ...classifications(),
      hdmfEmployeeContribution: 500, hdmfEmployerContribution: 200,
    },
    government: { sss: '34-1234567-1', philhealth: '19-050123456-1', hdmf: '1211-0001-0001', tin: '221-334-556-000', rdo: '047', sssLoanLocator: '' },
    banks: [bank('BDO Unibank', '••••8472', 100, true)],
    previousEmployer: null,
    earningAmounts: { 47218663: 3000, 47218664: 1500, 47218656: 2000 },
    finalPay: { unpaidSalary: 18000, thirteenthMonth: 24500, silConversion: 6800, convertibleLeave: 4200, offsetAmounts: { 'GL-001': 12000, 'CL-001': 21000, 'DED-001': 500 } },
  },
  {
    employeeId: 'EMP-1002', employeeCode: '0000112345', code: '0000112345', name: 'Ethan Collins', initials: 'EC',
    position: 'Sr. Frontend Developer', department: 'IT Department', division: 'Product Development', section: 'Applications',
    site: 'Head Office', costCenter: 'CC-IT-01', jobLevel: 'Rank and File', group: 'Rank and File',
    employmentType: 'Full Time Philippines', employmentStatus: 'Active', employeeTagging: 'Employee',
    managerId: 'EMP-1001', shiftId: 'shift-morning',
    dateOfBirth: '1991-05-02', dateHired: '2019-06-15', regularizationDate: '2019-12-15',
    rehired: true, priorServiceYears: 6, breakMonths: 14,
    dateHold: '', endDateHold: '', holdReason: '', continueStatutoryOnHold: 'Yes',
    dateSeparated: '', separationDate: '', retirementDate: '2056-05-02',
    reason: 'Retirement', reasonForLeaving: 'Retirement', birSeparationReason: '', memberPlan: 'Statutory plan member',
    monthlyBasic: 62000, average36Months: 60000,
    payroll: {
      paymentMode: 'Semi-monthly', ...rates({ monthlyBasic: 62000 }), monthlyBasic: 62000,
      mwe: 'No', ecolaPerDay: 0, mweRegion: '', mweSector: '', grossUp: 'No', currency: 'PHP',
      taxType: 'Compensation', taxExemptionCode: 'S',
      ...statutorySwitches(), ...classifications(),
      hdmfEmployeeContribution: 200, hdmfEmployerContribution: 200,
    },
    government: { sss: '34-2234567-2', philhealth: '19-050223456-2', hdmf: '1211-0001-0002', tin: '231-556-778-000', rdo: '047', sssLoanLocator: 'SSS-LL-2201' },
    banks: [bank('BDO Unibank', '••••1109', 70, true), bank('BPI', '••••7741', 30)],
    previousEmployer: null,
    earningAmounts: { 47218663: 2000, 47218664: 1000, 47218656: 1500 },
    finalPay: { unpaidSalary: 12000, thirteenthMonth: 17800, silConversion: 3900, convertibleLeave: 2400, offsetAmounts: { 'GL-001': 8000, 'CL-001': 6500, 'DED-001': 500 } },
  },
  {
    employeeId: 'EMP-1003', employeeCode: '0000112346', code: '0000112346', name: 'Sophia Ramirez', initials: 'SR',
    position: 'QA Analyst', department: 'IT Department', division: 'Product Development', section: 'Quality Assurance',
    site: 'Head Office', costCenter: 'CC-IT-02', jobLevel: 'Rank and File', group: 'Rank and File',
    employmentType: 'Full Time Philippines', employmentStatus: 'Active', employeeTagging: 'Employee',
    managerId: 'EMP-1001', shiftId: 'shift-afternoon',
    dateOfBirth: '1994-09-20', dateHired: '2021-03-01', regularizationDate: '2021-09-01',
    rehired: false, priorServiceYears: 0, breakMonths: 0,
    dateHold: '', endDateHold: '', holdReason: '', continueStatutoryOnHold: 'Yes',
    dateSeparated: '', separationDate: '', retirementDate: '2059-09-20',
    reason: 'Retirement', reasonForLeaving: 'Resignation', birSeparationReason: '', memberPlan: 'Company plan member',
    monthlyBasic: 48000, average36Months: 46000,
    payroll: {
      paymentMode: 'Semi-monthly', ...rates({ monthlyBasic: 48000 }), monthlyBasic: 48000,
      mwe: 'No', ecolaPerDay: 0, mweRegion: '', mweSector: '', grossUp: 'No', currency: 'PHP',
      taxType: 'Compensation', taxExemptionCode: 'S',
      ...statutorySwitches(), ...classifications(),
      hdmfEmployeeContribution: 200, hdmfEmployerContribution: 200,
    },
    government: { sss: '34-3234567-3', philhealth: '19-050323456-3', hdmf: '1211-0001-0003', tin: '245-889-112-000', rdo: '047', sssLoanLocator: 'SSS-LL-2202' },
    banks: [bank('BDO Unibank', '••••3320', 100, true)],
    previousEmployer: null,
    earningAmounts: { 47218663: 3500, 47218664: 2000, 47218656: 2500 },
    finalPay: { unpaidSalary: 26000, thirteenthMonth: 32000, silConversion: 9100, convertibleLeave: 7300, offsetAmounts: { 'GL-001': 0, 'CL-001': 14000, 'DED-001': 500 } },
  },
  {
    // Daily-paid: the payroll line has to price the period from days rendered in
    // Timekeeping, not from a monthly rate divided by two.
    employeeId: 'EMP-1004', employeeCode: '0000112347', code: '0000112347', name: 'Liam Johnson', initials: 'LJ',
    position: 'Sr. Backend Developer', department: 'IT Department', division: 'Product Development', section: 'Platform',
    site: 'Head Office', costCenter: 'CC-IT-01', jobLevel: 'Rank and File', group: 'Rank and File',
    employmentType: 'Full Time Philippines', employmentStatus: 'Active', employeeTagging: 'Employee',
    managerId: 'EMP-1001', shiftId: 'shift-morning',
    dateOfBirth: '1989-11-08', dateHired: '2020-01-09', regularizationDate: '2020-07-09',
    rehired: false, priorServiceYears: 0, breakMonths: 0,
    dateHold: '', endDateHold: '', holdReason: '', continueStatutoryOnHold: 'Yes',
    dateSeparated: '', separationDate: '', retirementDate: '2054-11-08',
    reason: 'Retirement', reasonForLeaving: 'End of project or contract', birSeparationReason: '', memberPlan: 'Statutory plan member',
    monthlyBasic: 65250, average36Months: 63000,
    payroll: {
      paymentMode: 'Semi-monthly', ...rates({ dailyRate: 3000, payType: 'Daily' }), monthlyBasic: 65250,
      mwe: 'No', ecolaPerDay: 0, mweRegion: '', mweSector: '', grossUp: 'No', currency: 'PHP',
      taxType: 'Compensation', taxExemptionCode: 'S',
      ...statutorySwitches(), ...classifications(),
      hdmfEmployeeContribution: 200, hdmfEmployerContribution: 200,
    },
    government: { sss: '34-4234567-4', philhealth: '19-050423456-4', hdmf: '1211-0001-0004', tin: '256-101-334-000', rdo: '047', sssLoanLocator: '' },
    banks: [bank('BPI', '••••6650', 100, true)],
    previousEmployer: null,
    earningAmounts: { 47218663: 1800, 47218664: 900, 47218656: 1000 },
    finalPay: { unpaidSalary: 9500, thirteenthMonth: 11200, silConversion: 2100, convertibleLeave: 0, offsetAmounts: { 'GL-001': 3200, 'CL-001': 0, 'DED-001': 0 } },
  },
  {
    // Hired inside the payroll period: basic pay and every fixed allowance are
    // pro-rated from the effective date (Annex C 3.g.5 / BAS-004).
    employeeId: 'EMP-1005', employeeCode: '0000112348', code: '0000112348', name: 'John Doe Jr.', initials: 'JJ', ytdMonths: 0,
    position: 'Business Analyst', department: 'IT Department', division: 'Product Development', section: 'Applications',
    site: 'Head Office', costCenter: 'CC-IT-02', jobLevel: 'Rank and File', group: 'Rank and File',
    employmentType: 'Full Time Philippines', employmentStatus: 'Active', employeeTagging: 'Employee',
    managerId: 'EMP-1001', shiftId: 'shift-mid',
    dateOfBirth: '1996-07-30', dateHired: `${YEAR}-11-06`, regularizationDate: '',
    rehired: false, priorServiceYears: 0, breakMonths: 0,
    dateHold: '', endDateHold: '', holdReason: '', continueStatutoryOnHold: 'Yes',
    dateSeparated: '', separationDate: '', retirementDate: '2061-07-30',
    reason: 'Retirement', reasonForLeaving: 'Resignation', birSeparationReason: '', memberPlan: 'Statutory plan member',
    monthlyBasic: 42000, average36Months: 42000,
    payroll: {
      paymentMode: 'Semi-monthly', ...rates({ monthlyBasic: 42000 }), monthlyBasic: 42000,
      mwe: 'No', ecolaPerDay: 0, mweRegion: '', mweSector: '', grossUp: 'No', currency: 'PHP',
      taxType: 'Compensation', taxExemptionCode: 'S',
      ...statutorySwitches(), ...classifications(),
      hdmfEmployeeContribution: 200, hdmfEmployerContribution: 200,
    },
    government: { sss: '34-5234567-5', philhealth: '19-050523456-5', hdmf: '1211-0001-0005', tin: '267-223-556-000', rdo: '047', sssLoanLocator: '' },
    banks: [bank('BDO Unibank', '••••9812', 100, true)],
    previousEmployer: {
      name: 'Northwind Consulting Inc.', tin: '004-556-778-000', address: 'Ortigas Center, Pasig City',
      from: `${YEAR}-01-01`, to: `${YEAR}-10-31`,
      basicPay: 350000, taxableBonus: 0, otherTaxableIncome: 0, grossTaxableIncome: 350000,
      nontaxableBonus: 35000, deMinimis: 8000, allowableDeductions: 17500, otherNonTaxableIncome: 0,
      taxWithheld: 21250, isMinimumWage: 'No', taxType: 'Compensation',
    },
    earningAmounts: { 47218663: 1200, 47218664: 600, 47218656: 800 },
    finalPay: { unpaidSalary: 8000, thirteenthMonth: 3500, silConversion: 0, convertibleLeave: 0, offsetAmounts: {} },
  },
  {
    // No HDMF: an expatriate the 201 file excludes from Pag-IBIG, which is what
    // "Compute allowable deduction" has to respect per employee.
    employeeId: 'EMP-1006', employeeCode: '0000112349', code: '0000112349', name: 'Olivia Carter', initials: 'OC',
    position: 'Training Specialist', department: 'Learning & Development', division: 'People Operations', section: 'Learning',
    site: 'Head Office', costCenter: 'CC-LD-01', jobLevel: 'Rank and File', group: 'Rank and File',
    employmentType: 'Full Time Philippines', employmentStatus: 'Active', employeeTagging: 'Employee',
    managerId: 'EMP-1001', shiftId: 'shift-morning',
    dateOfBirth: '1987-04-12', dateHired: '2022-11-02', regularizationDate: '2023-05-02',
    rehired: false, priorServiceYears: 0, breakMonths: 0,
    dateHold: '', endDateHold: '', holdReason: '', continueStatutoryOnHold: 'Yes',
    dateSeparated: '', separationDate: '', retirementDate: '2052-04-12',
    reason: 'Termination', reasonForLeaving: 'Retrenchment', birSeparationReason: 'Redundancy/Retrenchment', memberPlan: 'Statutory plan member',
    monthlyBasic: 72000, average36Months: 70000,
    payroll: {
      paymentMode: 'Semi-monthly', ...rates({ monthlyBasic: 72000 }), monthlyBasic: 72000,
      mwe: 'No', ecolaPerDay: 0, mweRegion: '', mweSector: '', grossUp: 'Yes', currency: 'PHP',
      taxType: 'Compensation', taxExemptionCode: 'S',
      ...statutorySwitches({ withHdmf: 'No' }), ...classifications({ tardinessClassification: 'Exempt', undertimeClassification: 'Exempt' }),
      hdmfEmployeeContribution: 0, hdmfEmployerContribution: 0,
    },
    government: { sss: '34-6234567-6', philhealth: '19-050623456-6', hdmf: '', tin: '278-445-889-000', rdo: '047', sssLoanLocator: '' },
    banks: [bank('Metrobank', '••••4406', 100, true)],
    previousEmployer: null,
    earningAmounts: { 47218663: 2800, 47218664: 1500, 47218656: 2000 },
    finalPay: { unpaidSalary: 15400, thirteenthMonth: 21000, silConversion: 5200, convertibleLeave: 3100, offsetAmounts: { 'GL-001': 5400, 'CL-001': 18000, 'DED-001': 750 } },
  },
  {
    // Separated inside the period: excluded from a regular run and picked up by
    // a special run with Compute Final Pay, on the annualised tax table.
    employeeId: 'EMP-1007', employeeCode: '0000112350', code: '0000112350', name: 'Marisol Aquino', initials: 'MA',
    position: 'Payroll Associate', department: 'Finance', division: 'Corporate Services', section: 'Payroll',
    site: 'Head Office', costCenter: 'CC-FIN-01', jobLevel: 'Rank and File', group: 'Rank and File',
    employmentType: 'Full Time Philippines', employmentStatus: 'Resigned', employeeTagging: 'Employee',
    managerId: 'EMP-1001', shiftId: 'shift-morning',
    dateOfBirth: '1990-01-15', dateHired: '2016-02-01', regularizationDate: '2016-08-01',
    rehired: false, priorServiceYears: 0, breakMonths: 0,
    dateHold: '', endDateHold: '', holdReason: '', continueStatutoryOnHold: 'Yes',
    dateSeparated: `${YEAR}-11-20`, separationDate: `${YEAR}-11-20`, retirementDate: '2055-01-15',
    reason: 'Resignation', reasonForLeaving: 'Resignation', birSeparationReason: 'Resignation', memberPlan: 'Company plan member',
    monthlyBasic: 45000, average36Months: 44000,
    payroll: {
      paymentMode: 'Semi-monthly', ...rates({ monthlyBasic: 45000 }), monthlyBasic: 45000,
      mwe: 'No', ecolaPerDay: 0, mweRegion: '', mweSector: '', grossUp: 'No', currency: 'PHP',
      taxType: 'Compensation', taxExemptionCode: 'S',
      ...statutorySwitches(), ...classifications(),
      hdmfEmployeeContribution: 200, hdmfEmployerContribution: 200,
    },
    government: { sss: '34-7234567-7', philhealth: '19-050723456-7', hdmf: '1211-0001-0007', tin: '289-667-223-000', rdo: '047', sssLoanLocator: '' },
    banks: [bank('BDO Unibank', '••••5527', 100, true)],
    previousEmployer: null,
    earningAmounts: { 47218663: 1600, 47218664: 800, 47218656: 1200 },
    finalPay: { unpaidSalary: 11000, thirteenthMonth: 14600, silConversion: 3400, convertibleLeave: 1900, offsetAmounts: { 'GL-001': 2800, 'CL-001': 9200, 'DED-001': 500 } },
  },
  {
    // Minimum wage earner, daily paid, with ECOLA — statutory-exempt from
    // withholding tax and priced off the active MWE rate table.
    employeeId: 'EMP-1008', employeeCode: '0000112351', code: '0000112351', name: 'Rafael Bautista', initials: 'RB',
    position: 'Field Technician', department: 'Operations', division: 'Service Delivery', section: 'Field Services',
    site: 'Marikina Depot', costCenter: 'CC-OPS-01', jobLevel: 'Rank and File', group: 'Rank and File',
    employmentType: 'Full Time Philippines', employmentStatus: 'On Hold', employeeTagging: 'Employee',
    managerId: 'EMP-1001', shiftId: 'shift-morning',
    dateOfBirth: '1993-06-24', dateHired: '2023-04-17', regularizationDate: '2023-10-17',
    dateHold: `${YEAR}-11-10`, endDateHold: '', holdReason: 'Maternity / paternity leave', continueStatutoryOnHold: 'Yes',
    rehired: false, priorServiceYears: 0, breakMonths: 0,
    dateSeparated: '', separationDate: '', retirementDate: '2058-06-24',
    reason: 'Retirement', reasonForLeaving: 'Resignation', birSeparationReason: '', memberPlan: 'Statutory plan member',
    monthlyBasic: 15225, average36Months: 15000,
    payroll: {
      paymentMode: 'Semi-monthly', ...rates({ dailyRate: 700, payType: 'Daily' }), monthlyBasic: 15225,
      mwe: 'Yes', ecolaPerDay: 30, mweRegion: 'NCR', mweSector: 'Non-agriculture', grossUp: 'No', currency: 'PHP',
      taxType: 'Compensation', taxExemptionCode: 'S',
      ...statutorySwitches({ withWithholdingTax: 'No' }), ...classifications(),
      hdmfEmployeeContribution: 200, hdmfEmployerContribution: 200,
    },
    government: { sss: '34-8234567-8', philhealth: '19-050823456-8', hdmf: '1211-0001-0008', tin: '290-778-334-000', rdo: '047', sssLoanLocator: 'SSS-LL-2208' },
    banks: [bank('Landbank', '••••2214', 100, true)],
    previousEmployer: null,
    earningAmounts: { 47218663: 800, 47218664: 400, 47218656: 600 },
    finalPay: { unpaidSalary: 5200, thirteenthMonth: 6100, silConversion: 1400, convertibleLeave: 700, offsetAmounts: { 'GL-001': 1200, 'CL-001': 0, 'DED-001': 0 } },
  },
];

/**
 * The roster, with the derived blocks attached. `ytd` is computed from the
 * employee's own rate and the statutory tables so an opening balance is always
 * consistent with the rates and brackets the rest of the system publishes; a
 * row may set `ytdMonths` when it did not work the whole year to date.
 */
export const employeeRoster = Object.freeze(rosterDefinitions.map(employee => Object.freeze({
  ...employee,
  ytd: ytdFor(employee.payroll, { months: employee.ytdMonths ?? YTD_MONTHS_ELAPSED }),
})));

/** Employee groups a policy or a bonus run may be scoped to. */
export const employeeGroups = Object.freeze(['All Employees', 'Rank and File', 'Managers', 'Project-based Employees', 'Retirement Eligible']);

/** Departments, derived from the roster so a filter can never offer an empty one. */
export const departments = Object.freeze([...new Set(employeeRoster.map(employee => employee.department))]);

/** Payment modes a payroll transaction may be created for. */
export const paymentModes = Object.freeze(['Daily', 'Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly']);

/** Employment statuses the population filter reads (Annex C 3.l). */
export const employmentStatuses = Object.freeze(['Active', 'On Hold', 'Resigned', 'Inactive']);

export function findRosterEmployee(employeeId) {
  return employeeRoster.find(employee => employee.employeeId === employeeId
    || employee.employeeCode === employeeId
    || employee.code === employeeId) || null;
}

/** `"0000112345 - Ethan Collins"`, the label every payroll register binds to. */
export function employeeLabel(employee) {
  return `${employee.code} - ${employee.name}`;
}

export function employeeLabelOptions() {
  return employeeRoster.map(employeeLabel);
}

/** Resolves `"0000112345 - Ethan Collins"` (or a bare code) back to the roster row. */
export function employeeFromLabel(label) {
  const code = String(label || '').split(' - ')[0].trim();
  return findRosterEmployee(code);
}
