/**
 * The statutory and tax tables themselves: the agency definitions, the seeded
 * versions, and the pure bracket lookups payroll uses.
 *
 * §7.4 says rates, brackets and ceilings are versioned data and never
 * constants inside calculation code. That rule only holds if there is exactly
 * one place the numbers live, so this module is it: `StatutoryTables.jsx`
 * renders and versions these rows, `statutoryService.js` resolves the effective
 * version out of the company store, `payrollEngine.js` computes a contribution
 * from the resolved version, and `hrmData.js` seeds the employee's own
 * contribution record from the same lookup. Nothing re-types a rate.
 *
 * Every function here is pure and takes the version it should read, so a run
 * dated in 2025 computes on the 2025 table even after a 2026 table is
 * published.
 */

const number = value => Number(value || 0);
const round2 = value => Number((Number(value) || 0).toFixed(2));

export const agencyDefinitions = {
  sss: {
    name: 'Social Security System', short: 'SSS', prefix: 'SSS',
    fields: [
      ['minimum', 'Minimum Monthly Compensation'], ['maximum', 'Maximum Monthly Compensation'],
      ['mscRegular', 'MSC - Regular SS / EC'], ['mscMpf', 'MSC - MPF'], ['totalMsc', 'Total Monthly Salary Credit'],
      ['regularEe', 'Regular SS - EE'], ['regularEr', 'Regular SS - ER'], ['ecEr', 'EC - ER'], ['totalRegular', 'Total Regular SS & EC'],
      ['mpfEe', 'MPF - EE'], ['mpfEr', 'MPF - ER'], ['totalMpf', 'Total MPF'],
      ['totalEe', 'Total EE'], ['totalEr', 'Total ER'], ['overallTotal', 'Overall Total'],
    ],
    columns: [['minimum', 'Minimum Monthly Compensation'], ['maximum', 'Maximum Monthly Compensation'], ['mscRegular', 'MSC - Regular SS / EC'], ['mscMpf', 'MSC - MPF'], ['totalEe', 'Total EE'], ['totalEr', 'Total ER'], ['overallTotal', 'Overall Total']],
  },
  philhealth: {
    name: 'PhilHealth', short: 'PhilHealth', prefix: 'PHIC',
    fields: [
      ['minimum', 'Minimum Monthly Compensation'], ['maximum', 'Maximum Monthly Compensation'], ['unit', 'Unit', 'select'],
      ['eeRate', 'Employee Percentage Rate'], ['erRate', 'Employer Percentage Rate'],
      ['minimumEmployeeShare', 'Employee Share (in Range) - Minimum'], ['maximumEmployeeShare', 'Employee Share (in Range) - Maximum'],
      ['minimumEmployerShare', 'Employer Share (in Range) - Minimum'], ['maximumEmployerShare', 'Employer Share (in Range) - Maximum'],
    ],
    columns: [['minimum', 'Minimum Monthly Compensation'], ['maximum', 'Maximum Monthly Compensation'], ['unit', 'Unit'], ['employeeShare', 'Employee Share'], ['employerShare', 'Employer Share'], ['monthlyPremium', 'Monthly Premium']],
    note: 'PhilHealth \u20b10.01 rounding difference: when the total premium cannot be split equally, the \u20b10.01 is assigned to the Employer Share so the total stays exact.',
  },
  pagibig: {
    name: 'Pag-IBIG', short: 'Pag-IBIG', prefix: 'HDMF',
    fields: [
      ['minimum', 'Minimum Monthly Compensation'], ['maximum', 'Maximum Monthly Compensation'], ['unit', 'Unit', 'select'],
      ['eeRate', 'Employee Percentage Rate'], ['erRate', 'Employer Percentage Rate'],
      ['minimumEmployeeShare', 'Employee Contribution - Minimum'], ['maximumEmployeeShare', 'Employee Contribution - Maximum'],
      ['minimumEmployerShare', 'Employer Contribution - Minimum'], ['maximumEmployerShare', 'Employer Contribution - Maximum'],
    ],
    columns: [['minimum', 'Minimum Monthly Compensation'], ['maximum', 'Maximum Monthly Compensation'], ['unit', 'Unit'], ['employeeShare', 'Employee Contribution'], ['employerShare', 'Employer Contribution'], ['totalContribution', 'Total Contribution']],
    note: 'The maximum fund amount is \u20b110,000.00. For example, an employee who earns \u20b130,000.00 has the contribution worked out on the maximum fund amount.',
  },
  tax: {
    name: 'BIR Compensation Tax Table', short: 'Compensation Tax', prefix: 'WTC',
    fields: [['minimum', 'Minimum'], ['maximum', 'Maximum'], ['excessRate', 'Tax Rate (%)'], ['fixedTax', 'Fixed Tax'], ['frequency', 'Payment Mode', 'select', ['Daily', 'Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly', 'Annual']]],
    columns: [['minimum', 'Minimum'], ['maximum', 'Maximum'], ['excessRate', 'Tax Rate (%)'], ['fixedTax', 'Fixed Tax'], ['frequency', 'Payment Mode']],
  },
  annualTax: {
    name: 'BIR Annual Tax Table', short: 'Annual Tax', prefix: 'WTA',
    fields: [['minimum', 'Minimum'], ['maximum', 'Maximum'], ['excessRate', 'Tax Rate (%)'], ['fixedTax', 'Fixed Tax']],
    columns: [['minimum', 'Minimum'], ['maximum', 'Maximum'], ['excessRate', 'Tax Rate (%)'], ['fixedTax', 'Fixed Tax']],
  },
  expandedTax: {
    name: 'BIR Expanded Withholding Tax Table', short: 'Expanded Tax', prefix: 'WTE',
    fields: [['taxType', 'Tax Type', 'locked'], ['incomePayment', 'Nature of Income Payment', 'text'], ['atcClass', 'ATC Code Classification', 'select', ['Individual', 'Corporation']], ['excessRate', 'Tax Rate (%)'], ['atcCode', 'ATC Code', 'text'], ['minimum', 'Minimum Income Payment'], ['maximum', 'Maximum Income Payment']],
    columns: [['taxType', 'Tax Type'], ['incomePayment', 'Nature of Income Payment'], ['atcClass', 'ATC Code Classification'], ['excessRate', 'Tax Rate (%)'], ['atcCode', 'ATC Code'], ['minimum', 'Minimum Income Payment'], ['maximum', 'Maximum Income Payment']],
    taxType: 'WE',
  },
  finalTax: {
    name: 'BIR Final Tax Table', short: 'Final Tax', prefix: 'WTF',
    fields: [['taxType', 'Tax Type', 'locked'], ['incomePayment', 'Nature of Income Payment', 'text'], ['atcClass', 'ATC Code Classification', 'select', ['Individual', 'Corporation']], ['excessRate', 'Tax Rate (%)'], ['atcCode', 'ATC Code', 'text'], ['minimum', 'Minimum Income Payment'], ['maximum', 'Maximum Income Payment']],
    columns: [['taxType', 'Tax Type'], ['incomePayment', 'Nature of Income Payment'], ['atcClass', 'ATC Code Classification'], ['excessRate', 'Tax Rate (%)'], ['atcCode', 'ATC Code'], ['minimum', 'Minimum Income Payment'], ['maximum', 'Maximum Income Payment']],
    taxType: 'WF',
  },
  deMinimis: {
    name: 'De Minimis Benefits', short: 'De Minimis', prefix: 'DMN',
    fields: [['benefitCode', 'Benefit Code', 'text'], ['benefitName', 'Benefit Name', 'text'], ['ceiling', 'Non-Taxable Ceiling'], ['frequency', 'Ceiling Frequency', 'select', ['Per Payroll', 'Monthly', 'Annual']], ['excessTreatment', 'Excess Treatment', 'select', ['Reclassify as Taxable', 'Stop Payment', 'Allow with Warning']]],
    columns: [['benefitCode', 'Benefit Code'], ['benefitName', 'Benefit Name'], ['ceiling', 'Ceiling'], ['frequency', 'Frequency'], ['excessTreatment', 'Excess Treatment']],
  },
};

/**
 * `Statutory Table` and `Tax Tables` are two tiles over one versioned store.
 * The split follows the P&A Payroll mocks; keeping one component means neither
 * tile becomes a second register for the same numbers.
 */
export const agencyGroups = {
  statutory: { title: 'Statutory Tables', agencies: ['sss', 'philhealth', 'pagibig', 'deMinimis'] },
  tax: { title: 'Tax Tables', agencies: ['annualTax', 'tax', 'expandedTax', 'finalTax'] },
};

/* --------------------------------------------------------------- the tables */

function sssRow(id, minimum, maximum, mscRegular, mscMpf, rate = 0.15, employeeShare = 5 / 15) {
  const ec = mscRegular > 14500 ? 30 : 10;
  const regularTotal = round2(mscRegular * rate);
  const regularEe = round2(regularTotal * employeeShare);
  const regularEr = round2(regularTotal - regularEe);
  const mpfTotal = round2(mscMpf * rate);
  const mpfEe = round2(mpfTotal * employeeShare);
  const mpfEr = round2(mpfTotal - mpfEe);
  return {
    id, minimum, maximum, mscRegular, mscMpf, totalMsc: mscRegular + mscMpf,
    regularEe, regularEr, ecEr: ec, totalRegular: round2(regularEe + regularEr + ec),
    mpfEe, mpfEr, totalMpf: round2(mpfEe + mpfEr),
    totalEe: round2(regularEe + mpfEe), totalEr: round2(regularEr + ec + mpfEr),
    overallTotal: round2(regularEe + regularEr + ec + mpfEe + mpfEr),
  };
}

/**
 * The SSS contribution schedule: monthly salary credit rises in ₱500 steps to
 * ₱35,000, the first ₱20,000 sits in the regular fund and the excess in the
 * Mandatory Provident Fund (WISP), and EC is ₱10 below MSC ₱15,000 and ₱30 at
 * or above it.
 */
function sssRows(rate) {
  const rows = [];
  const regularCap = 20000;
  const totalCap = 35000;
  for (let msc = 5000; msc <= totalCap; msc += 500) {
    const index = rows.length + 1;
    const minimum = msc === 5000 ? 0 : msc - 250;
    const maximum = msc === totalCap ? 9999999 : msc + 249.99;
    rows.push(sssRow(index, round2(minimum), round2(maximum), Math.min(msc, regularCap), Math.max(0, msc - regularCap), rate));
  }
  return rows;
}

/** PhilHealth: a premium rate between a floor and a ceiling, shared 50/50. */
function philhealthRows(rate, floor, ceiling) {
  const half = round2(rate / 2);
  return [
    { id: 1, minimum: 0, maximum: floor, unit: 'Amount (Php)', eeRate: 0, erRate: 0, minimumEmployeeShare: round2(floor * half / 100), maximumEmployeeShare: round2(floor * half / 100), minimumEmployerShare: round2(floor * half / 100), maximumEmployerShare: round2(floor * half / 100) },
    { id: 2, minimum: round2(floor + 0.01), maximum: round2(ceiling - 0.01), unit: 'Percentage (%)', eeRate: half, erRate: half, minimumEmployeeShare: 0, maximumEmployeeShare: 0, minimumEmployerShare: 0, maximumEmployerShare: 0 },
    { id: 3, minimum: ceiling, maximum: 9999999, unit: 'Amount (Php)', eeRate: 0, erRate: 0, minimumEmployeeShare: round2(ceiling * half / 100), maximumEmployeeShare: round2(ceiling * half / 100), minimumEmployerShare: round2(ceiling * half / 100), maximumEmployerShare: round2(ceiling * half / 100) },
  ];
}

/** Pag-IBIG: 1%/2% below ₱1,500, 2%/2% above, on compensation capped at ₱10,000. */
function pagibigRows(cap) {
  return [
    { id: 1, minimum: 0, maximum: 1500, unit: 'Percentage (%)', eeRate: 1, erRate: 2, minimumEmployeeShare: 0, maximumEmployeeShare: 0, minimumEmployerShare: 0, maximumEmployerShare: 0 },
    { id: 2, minimum: 1500.01, maximum: round2(cap - 0.01), unit: 'Percentage (%)', eeRate: 2, erRate: 2, minimumEmployeeShare: 0, maximumEmployeeShare: 0, minimumEmployerShare: 0, maximumEmployerShare: 0 },
    { id: 3, minimum: cap, maximum: 9999999, unit: 'Amount (Php)', eeRate: 0, erRate: 0, minimumEmployeeShare: round2(cap * 0.02), maximumEmployeeShare: round2(cap * 0.02), minimumEmployerShare: round2(cap * 0.02), maximumEmployerShare: round2(cap * 0.02) },
  ];
}

/** The TRAIN annual brackets, from which every payroll frequency is derived. */
const ANNUAL_BRACKETS = [
  [0, 250000, 0, 0],
  [250000, 400000, 0, 15],
  [400000, 800000, 22500, 20],
  [800000, 2000000, 102500, 25],
  [2000000, 8000000, 402500, 30],
  [8000000, 100000000, 2202500, 35],
];

/** Periods per year for each payroll frequency the compensation table carries. */
export const TAX_PERIODS_PER_YEAR = Object.freeze({ Daily: 313, Weekly: 52, 'Bi-weekly': 26, 'Semi-monthly': 24, Monthly: 12, Annual: 1 });

function compensationRows() {
  const rows = [];
  ['Daily', 'Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly'].forEach(frequency => {
    const periods = TAX_PERIODS_PER_YEAR[frequency];
    ANNUAL_BRACKETS.forEach(([minimum, maximum, fixedTax, excessRate], index) => {
      rows.push({
        id: rows.length + 1,
        minimum: index === 0 ? 0 : round2(minimum / periods),
        maximum: round2(maximum / periods),
        fixedTax: round2(fixedTax / periods),
        excessRate,
        frequency,
      });
    });
  });
  return rows;
}

function annualRows() {
  return ANNUAL_BRACKETS.map(([minimum, maximum, fixedTax, excessRate], index) => ({ id: index + 1, minimum, maximum, fixedTax, excessRate }));
}

/**
 * De Minimis ceilings. 2025 keeps the RR 11-2018 figures; from 2026 the ceilings follow
 * Annex A (effective 15 days after 22 December 2025). The frequency is the ceiling's own
 * frequency, which is what `deMinimisSplit` compares year-to-date usage against, so the
 * monthly and per-semester amounts of the annex are shown as their annual totals.
 */
function deMinimisRows(year = 2026) {
  const later = Number(year) >= 2026;
  const rows = [
    ['DM-RICE', 'Rice Subsidy', later ? 30000 : 24000],
    ['DM-UNIFORM', 'Uniform and Clothing Allowance', later ? 8000 : 7000],
    ['DM-MED', 'Medical Cash Allowance to Dependents', later ? 4000 : 3000],
    ['DM-LAUNDRY', 'Laundry Allowance', later ? 4800 : 3600],
    ['DM-MEAL', 'Meal Allowance (overtime / night shift)', 30000],
    ['DM-ACHIEVE', 'Employee Achievement Award', later ? 12000 : 10000],
    ['DM-GIFT', 'Christmas and Anniversary Gifts', later ? 6000 : 5000],
    ['DM-MEDICAL', 'Actual Medical Assistance', later ? 12000 : 10000],
    ...(later ? [['DM-CBA', 'CBA and Productivity Incentive Schemes', 12000]] : []),
  ];
  return rows.map(([benefitCode, benefitName, ceiling], index) => ({ id: index + 1, benefitCode, benefitName, ceiling, frequency: 'Annual', excessTreatment: 'Reclassify as Taxable' }));
}

function expandedRows() {
  return [
    { id: 1, taxType: 'WE', atcClass: 'Individual', incomePayment: 'Professional fees (individual)', atcCode: 'WI010', excessRate: 5, minimum: 0, maximum: 3000000 },
    { id: 2, taxType: 'WE', atcClass: 'Individual', incomePayment: 'Professional fees (individual, above threshold)', atcCode: 'WI011', excessRate: 10, minimum: 3000000.01, maximum: 100000000 },
    { id: 3, taxType: 'WE', atcClass: 'Individual', incomePayment: 'Rentals', atcCode: 'WI100', excessRate: 5, minimum: 0, maximum: 100000000 },
    { id: 4, taxType: 'WE', atcClass: 'Individual', incomePayment: 'Income payments to certain contractors', atcCode: 'WI120', excessRate: 2, minimum: 0, maximum: 100000000 },
  ];
}

function finalRows() {
  return [
    { id: 1, taxType: 'WF', atcClass: 'Individual', incomePayment: 'Interest on bank deposits', atcCode: 'WI170', excessRate: 20, minimum: 0, maximum: 100000000 },
    { id: 2, taxType: 'WF', atcClass: 'Individual', incomePayment: 'Cash dividends (individual)', atcCode: 'WI180', excessRate: 10, minimum: 0, maximum: 100000000 },
    { id: 3, taxType: 'WF', atcClass: 'Individual', incomePayment: 'Fringe benefit tax (grossed-up)', atcCode: 'WI360', excessRate: 35, minimum: 0, maximum: 100000000 },
  ];
}

/**
 * Historic parameters per year. The 2023 PhilHealth premium was 4.5% and 2024
 * onwards 5%; Pag-IBIG's maximum fund salary rose to ₱10,000 in 2024; the SSS
 * contribution rate reached 15% in 2025.
 */
const YEAR_PARAMETERS = {
  2021: { sssRate: 0.13, phicRate: 3.0, phicFloor: 10000, phicCeiling: 60000, hdmfCap: 5000 },
  2022: { sssRate: 0.13, phicRate: 4.0, phicFloor: 10000, phicCeiling: 80000, hdmfCap: 5000 },
  2023: { sssRate: 0.14, phicRate: 4.0, phicFloor: 10000, phicCeiling: 90000, hdmfCap: 5000 },
  2024: { sssRate: 0.14, phicRate: 5.0, phicFloor: 10000, phicCeiling: 100000, hdmfCap: 10000 },
  2025: { sssRate: 0.15, phicRate: 5.0, phicFloor: 10000, phicCeiling: 100000, hdmfCap: 10000 },
  2026: { sssRate: 0.15, phicRate: 5.0, phicFloor: 10000, phicCeiling: 100000, hdmfCap: 10000 },
};

export const STATUTORY_YEARS = Object.freeze(Object.keys(YEAR_PARAMETERS).map(Number).sort((a, b) => b - a));

export function seedVersion(agency, year, index = 1, active = false) {
  const def = agencyDefinitions[agency];
  const parameters = YEAR_PARAMETERS[year] || YEAR_PARAMETERS[2026];
  const rows = agency === 'sss' ? sssRows(parameters.sssRate)
    : agency === 'philhealth' ? philhealthRows(parameters.phicRate, parameters.phicFloor, parameters.phicCeiling)
    : agency === 'pagibig' ? pagibigRows(parameters.hdmfCap)
    : agency === 'tax' ? compensationRows()
    : agency === 'annualTax' ? annualRows()
    : agency === 'expandedTax' ? expandedRows()
    : agency === 'finalTax' ? finalRows()
    : deMinimisRows(year);
  return {
    id: `${agency}-${year}-${index}`,
    agency,
    code: `${def.prefix}-${year}-${String(index).padStart(3, '0')}`,
    name: `${def.name} ${year}`,
    effectiveDate: `${year}-01-01`,
    status: active ? 'Active' : 'Inactive',
    createdBy: index % 2 ? 'Ethan Collins' : 'Mark Santos',
    createdAt: `01/02/${year} 09:12:04 AM`,
    updatedBy: index % 2 ? 'Ethan Collins' : 'Mark Santos',
    updatedAt: `01/02/${year} 09:12:04 AM`,
    rows,
  };
}

/**
 * Every published year is Active, because a payroll run selects its version by
 * effective date: a 2025 run must find the 2025 table still in force even after
 * the 2026 one is published. "Inactive" is reserved for a superseded table.
 */
export function seedStatutoryData() {
  return Object.fromEntries(Object.keys(agencyDefinitions).map(agency => [
    agency,
    STATUTORY_YEARS.map(year => seedVersion(agency, year, 1, true)),
  ]));
}

/* -------------------------------------------------------------- the lookups */

/** The version in force on `asOf`: latest Active version effective on or before it. */
export function effectiveVersionIn(data = {}, agency, asOf = new Date().toISOString().slice(0, 10)) {
  const versions = (data[agency] || []).filter(item => item.status === 'Active');
  if (!versions.length) return null;
  const sorted = [...versions].sort((a, b) => String(b.effectiveDate).localeCompare(String(a.effectiveDate)));
  return sorted.find(item => String(item.effectiveDate) <= String(asOf)) || sorted[sorted.length - 1];
}

/**
 * The bracket a monthly compensation falls into: the last one that starts at or below it. Brackets end at
 * x.99 and the next starts at the following peso, so a value inside that centavo gap belongs to the lower
 * bracket, and a negative value belongs to the first. Above the top bracket's maximum the top bracket applies.
 */
export function bracketFor(version, compensation) {
  const rows = [...(version?.rows || [])].sort((a, b) => number(a.minimum) - number(b.minimum));
  if (!rows.length) return null;
  const amount = number(compensation);
  return [...rows].reverse().find(row => amount >= number(row.minimum)) || rows[0];
}

/**
 * SSS employee and employer shares for a monthly compensation, split into the
 * regular fund and the Mandatory Provident Fund (WISP) because payroll reports
 * and remittance schedules keep them apart.
 */
export function sssContribution(version, monthlyCompensation) {
  const row = bracketFor(version, monthlyCompensation);
  if (!row) return { employee: 0, employer: 0, ec: 0, mpfEmployee: 0, mpfEmployer: 0, regularEmployee: 0, regularEmployer: 0, bracket: null };
  return {
    regularEmployee: round2(row.regularEe), regularEmployer: round2(row.regularEr), ec: round2(row.ecEr),
    mpfEmployee: round2(row.mpfEe), mpfEmployer: round2(row.mpfEr),
    employee: round2(number(row.regularEe) + number(row.mpfEe)),
    employer: round2(number(row.regularEr) + number(row.ecEr) + number(row.mpfEr)),
    bracket: row,
  };
}

/**
 * A percentage-or-amount contribution (PhilHealth, Pag-IBIG). A bracket priced
 * in pesos returns its fixed share; a bracket priced as a rate applies the rate
 * to the compensation, which is why the ceiling row is expressed in pesos.
 */
export function rateContribution(version, monthlyCompensation) {
  const row = bracketFor(version, monthlyCompensation);
  if (!row) return { employee: 0, employer: 0, bracket: null };
  const amount = Math.max(0, number(monthlyCompensation));
  const isPercentage = (row.unit || 'Amount (Php)') === 'Percentage (%)';
  if (isPercentage && (version?.agency === 'philhealth' || /^PHIC/.test(version?.code || ''))) {
    // The total premium is exact; the employee share is rounded down to the centavo and the employer takes the odd centavo.
    const rateTotal = number(row.eeRate) + number(row.erRate);
    const total = round2(amount * rateTotal / 100);
    const employee = rateTotal > 0 ? Math.floor(total * number(row.eeRate) / rateTotal * 100 + 1e-9) / 100 : 0;
    return { employee: round2(employee), employer: round2(total - employee), bracket: row };
  }
  return {
    employee: round2(isPercentage ? amount * number(row.eeRate) / 100 : number(row.minimumEmployeeShare)),
    employer: round2(isPercentage ? amount * number(row.erRate) / 100 : number(row.minimumEmployerShare)),
    bracket: row,
  };
}

/** Graduated withholding brackets for a payroll frequency, low to high. */
export function bracketsForFrequency(version, frequency = 'Monthly') {
  const rows = (version?.rows || []).filter(row => !row.frequency || row.frequency === frequency);
  return rows
    .map(row => ({ minimum: number(row.minimum), maximum: number(row.maximum), fixedTax: number(row.fixedTax), excessRate: number(row.excessRate) }))
    .sort((a, b) => a.minimum - b.minimum);
}

/**
 * Graduated withholding tax: the bracket's fixed amount plus its rate on the
 * excess over the bracket minimum. Amounts above the published top bracket
 * continue at that bracket's rate.
 */
export function graduatedTax(version, taxable, frequency = 'Monthly') {
  const amount = number(taxable);
  const brackets = bracketsForFrequency(version, frequency);
  if (amount <= 0 || !brackets.length) return { tax: 0, bracket: null, brackets };
  const bracket = [...brackets].reverse().find(row => amount >= row.minimum) || brackets[0];
  return { tax: round2(Math.max(0, bracket.fixedTax + (amount - bracket.minimum) * bracket.excessRate / 100)), bracket, brackets };
}

/** De Minimis ceilings keyed by benefit name, from a resolved version. */
export function deMinimisRules(version) {
  return (version?.rows || []).map(row => ({
    code: row.benefitCode, name: row.benefitName, ceiling: number(row.ceiling),
    frequency: row.frequency || 'Annual', excessTreatment: row.excessTreatment || 'Reclassify as Taxable',
  }));
}

/**
 * Splits a De Minimis benefit against its ceiling and the amount of that
 * ceiling already used year to date; the excess is reclassified as taxable
 * unless the benefit says otherwise.
 */
export function splitDeMinimis(version, benefitName, amount, usedToDate = 0) {
  const rule = deMinimisRules(version).find(row => row.name === benefitName || row.code === benefitName);
  const value = number(amount);
  if (!rule) return { nonTaxable: value, taxable: 0, ceiling: null, remaining: null, rule: null };
  const remaining = Math.max(0, rule.ceiling - number(usedToDate));
  const nonTaxable = Math.min(value, remaining);
  return { nonTaxable: round2(nonTaxable), taxable: round2(Math.max(0, value - nonTaxable)), ceiling: rule.ceiling, remaining: round2(remaining), rule };
}
