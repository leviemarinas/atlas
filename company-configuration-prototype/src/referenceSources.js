/**
 * The formula reference sources a company starts with.
 *
 * These live apart from the screen because more than one module needs them:
 * `computationGovernance.js` seeds a new company's reference library from here,
 * Payroll Processing resolves the REF-011 deduction order through it, and the
 * Computational Basis screen renders and versions it.
 */

export function refRows(type) {
  // BRD row 47 keeps the deduction/loan adjustment order in a reference table.
  // `note` carries "Group · Classification"; `value` is the rank (0 = never adjusted).
  if (type === 'hierarchy') return [
    { id: 1, key: 'Statutory deductions', value: '0', note: 'Statutory · Never adjusted' },
    { id: 2, key: 'HMO', value: '1', note: 'Loan · Company-mandated' },
    { id: 3, key: 'Educational Loan', value: '2', note: 'Loan · Company-mandated' },
    { id: 4, key: 'Salary Loan', value: '3', note: 'Loan · Company-mandated' },
    { id: 5, key: 'SSS Salary Loan', value: '4', note: 'Loan · Government' },
    { id: 6, key: 'HDMF Salary Loan', value: '5', note: 'Loan · Government' },
    { id: 7, key: 'SSS Calamity Loan', value: '6', note: 'Loan · Government' },
    { id: 8, key: 'Optional deductions', value: '7', note: 'Deduction · Optional' },
    { id: 9, key: 'Lates, Absences & Undertime', value: '8', note: 'Deduction · Attendance' },
  ];
  if (type === 'rate') return [
    { id: 1, key: 'Employee rate', value: '5.00%', note: 'Effective January 2025' },
    { id: 2, key: 'Employer rate', value: '10.00%', note: 'Effective January 2025' },
    { id: 3, key: 'Compensation ceiling', value: '35,000.00', note: 'Monthly compensation' },
  ];
  if (type === 'tax') return [
    { id: 1, key: '0.00 - 20,833.00', value: '0%', note: 'No withholding tax' },
    { id: 2, key: '20,833.01 - 33,332.00', value: '15% of excess', note: 'Monthly bracket' },
    { id: 3, key: '33,332.01 - 66,666.00', value: '1,875 + 20%', note: 'Monthly bracket' },
  ];
  return [
    { id: 1, key: 'Default', value: 'Enabled', note: 'Company standard' },
    { id: 2, key: 'Special case', value: 'By assignment', note: 'Requires employee group mapping' },
  ];
}

export const referenceSeeds = [
  ['REF-001', 'BIR Withholding Tax Table 2026', 'Tax', 'tax'],
  ['REF-002', 'SSS Contribution Table 2026', 'Linked Statutory', 'rate'],
  ['REF-003', 'PhilHealth Contribution Table 2026', 'Linked Statutory', 'rate'],
  ['REF-004', 'HDMF Contribution Table 2026', 'Linked Statutory', 'rate'],
  ['REF-005', 'Minimum Wage Table', 'Payroll', 'default'],
  ['REF-006', 'De Minimis Ceiling', 'Tax', 'default'],
  ['REF-007', 'Bonus Tax Exemption Ceiling', 'Tax', 'default'],
  ['REF-008', 'Overtime Premium Rates', 'Earnings', 'rate'],
  ['REF-009', 'Holiday Premium Rates', 'Earnings', 'rate'],
  ['REF-010', 'Factor Days', 'Basic Pay', 'default'],
  ['REF-011', 'Deduction and Loan Hierarchy', 'Deductions', 'hierarchy'],
  ['REF-012', 'Minimum Take Home Pay', 'Deductions', 'default'],
  ['REF-013', 'Bank Codes', 'Accounting', 'default'],
  ['REF-014', 'General Ledger Mapping', 'Accounting', 'default'],
  ['REF-015', 'Departments', 'Organization', 'default'],
  ['REF-016', 'Positions', 'Organization', 'default'],
  ['REF-017', 'Locations', 'Organization', 'default'],
  ['REF-018', 'Employee Groups', 'Organization', 'default'],
  ['REF-019', 'Earnings and Allowance Codes', 'Payroll', 'default'],
  ['REF-020', 'Bonus Codes and Priority', 'Payroll', 'default'],
  ['REF-021', 'De Minimis Benefit Types', 'Tax', 'default'],
  ['REF-022', 'Deduction Codes', 'Deductions', 'default'],
  ['REF-023', 'Loan Types', 'Deductions', 'default'],
  ['REF-024', 'Holiday Calendar and Types', 'Time', 'default'],
  ['REF-025', 'Shift and Work Schedule Codes', 'Time', 'default'],
  ['REF-026', 'Leave Types and Conversion Rules', 'Leave', 'default'],
  ['REF-027', 'Currency and Exchange Rates', 'Payroll', 'rate'],
  ['REF-028', 'Cost Centers and Allocation Dimensions', 'Accounting', 'default'],
  ['REF-029', 'Payment Frequencies and Payroll Periods', 'Payroll', 'default'],
  ['REF-030', 'Separation Reasons and Final Pay Treatments', 'Separation', 'default'],
];

export function seedReferences() {
  return referenceSeeds.map((row, index) => ({
    id: index + 1,
    code: row[0],
    name: row[1],
    category: row[2],
    version: index < 4 ? '2026.1' : '1.0',
    effectiveDate: index < 4 ? '2026-01-01' : '2025-01-01',
    enabled: index !== 16,
    entries: refRows(row[3]),
  }));
}

