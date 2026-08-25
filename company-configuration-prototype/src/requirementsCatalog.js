/**
 * Shared payroll taxonomy distilled from Annex B and the Phase II BRD audit.
 * Company Rules, policy codes, service configuration, and employee payroll
 * records import this catalogue so labels do not drift between modules.
 */
export const companyRuleTaxonomy = {
  'Pay and Earnings': [
    'Basic Pay', 'Pay Rate Adjustments', 'Earnings and Allowances', 'Variable Allowances',
    'Reimbursements and Receivables',
    '13th Month Pay and Bonuses', 'De Minimis Benefits', 'Earning Reclassification',
    'Gross Up', 'Take-Home Pay', 'Retirement Pay', 'Final Pay', 'Part-Timers',
    'OJT Allowance', 'Piece Rate', 'Benefits',
  ],
  'Attendance & Timekeeping': [
    'Absences', 'Tardiness', 'Undertime', 'Overtime', 'Break Hours', 'Holiday Adjacency',
  ],
  'Time Management & Scheduling': [
    'Shift Schedule Creation', 'Time In & Time Out', 'Work Hours', 'Rest Days',
    'Holidays', 'Payroll Cutoffs',
  ],
  'Leave Management': [
    'Leave Accrual', 'Leave Balances', 'Leave Conversion', 'Service Incentive Leave', 'Leave Forfeiture',
    'Leave with Pay', 'Leave without Pay',
  ],
  'Loans & Deductions': [
    'Company Deductions', 'Company Loans', 'Government Loans', 'Deduction Hierarchy', 'Deferred Deductions',
  ],
  'Government & Company Compliance': [
    'Statutory Deductions', 'Tax Annualization', 'Government Contributions',
    'Multiple Bank Accounts', 'Duplicate TIN Validation', 'Minimum Wage and ECOLA',
  ],
  'Payroll Administration & Controls': [
    'Date and Number Formats', 'Multi-Currency', 'Cost Allocation', 'Allotments',
    'Payroll Calendar', 'Payslip Rules', 'Notifications', 'Approval Hierarchy', 'Connected Systems',
  ],
  'Security & Access Controls': [
    'Session Timeout', 'Passphrase', 'Role-Based Access', 'Single Sign-On',
  ],
};

const rule = (id, category, subcategory, text, policyCode, enabled = true) => ({
  id, category, subcategory, rule: text, policyCode, parameter: policyCode, enabled,
  status: enabled ? 'Active' : 'Inactive', version: '1.0', effectiveFrom: '2026-01-01', effectiveTo: '',
  groupBy: 'All Employees', groupValue: 'ABC Company Ltd', source: 'BRD / Annex B',
});

export const requirementRuleSeeds = [
  rule(1, 'Pay and Earnings', 'Basic Pay', 'Derive annual, monthly, daily, hourly, and per-minute rates from pay type, factor days, and work hours.', 'BAS-001'),
  rule(2, 'Pay and Earnings', 'Basic Pay', 'Apply the configured minimum-wage location and ECOLA when an employee is tagged as a minimum-wage earner.', 'MWE-001'),
  rule(3, 'Pay and Earnings', 'Pay Rate Adjustments', 'Prorate salary changes within a payroll cutoff using worked or unworked days and the effective date.', 'BAS-004'),
  rule(4, 'Pay and Earnings', 'Earnings and Allowances', 'Recurring earnings follow the employee payment frequency and selected period start and end.', 'ERN-001'),
  rule(5, 'Pay and Earnings', 'Variable Allowances', 'Adjust variable allowances by approved hours or days worked and the assigned timekeeping basis.', 'ERN-004'),
  rule(6, 'Pay and Earnings', '13th Month Pay and Bonuses', 'Apply the annual non-taxable ceiling across all bonus types, YTD balances, and previous-employer records.', 'BON-003'),
  rule(7, 'Pay and Earnings', '13th Month Pay and Bonuses', 'Use the configured bonus hierarchy when the remaining non-taxable ceiling cannot cover all bonus types.', 'BON-004'),
  rule(8, 'Pay and Earnings', 'De Minimis Benefits', 'Limit each de minimis benefit to its active ceiling and reclassify excess amounts as taxable earnings.', 'DMN-001'),
  rule(9, 'Pay and Earnings', 'Earning Reclassification', 'Reclassification must preserve net pay while moving YTD amounts between taxable and non-taxable codes.', 'RCL-001'),
  rule(10, 'Pay and Earnings', 'Gross Up', 'Iterate gross pay and withholding tax until the employee receives the required guaranteed net amount.', 'GUP-001'),
  rule(11, 'Pay and Earnings', 'Take-Home Pay', 'Apply statutory deductions in full before protecting the configured percentage or fixed net-pay threshold.', 'THP-001'),
  rule(12, 'Pay and Earnings', 'Take-Home Pay', 'Reduce or defer lower-priority controllable deductions until the protected minimum is met.', 'THP-002'),
  rule(13, 'Pay and Earnings', 'Retirement Pay', 'Use the more beneficial statutory or company-plan value after eligibility, service rounding, and tax checks.', 'RET-002'),
  rule(14, 'Pay and Earnings', 'Final Pay', 'Combine unpaid salary, prorated 13th month, leave conversion, separation or retirement pay, tax, and authorized offsets.', 'FIN-001'),
  rule(15, 'Pay and Earnings', 'Part-Timers', 'Compute part-time pay from the assigned hourly or daily rate and approved units worked.', 'PRT-001'),
  rule(16, 'Pay and Earnings', 'OJT Allowance', 'Compute OJT allowance from the assigned rate and approved attendance units.', 'OJT-001'),
  rule(17, 'Pay and Earnings', 'Piece Rate', 'Compute piece-rate earnings from approved production units and the employee rate.', 'PCE-001'),
  rule(18, 'Attendance & Timekeeping', 'Absences', 'Compute unpaid absences from the assigned daily rate and approved absence classification.', 'DED-001'),
  rule(19, 'Attendance & Timekeeping', 'Tardiness', 'Compute tardiness using the per-minute rate and approved late minutes.', 'DED-002'),
  rule(20, 'Attendance & Timekeeping', 'Undertime', 'Compute undertime using the per-minute rate and approved undertime minutes.', 'DED-003'),
  rule(21, 'Attendance & Timekeeping', 'Overtime', 'Use the assigned overtime type, eligible earning basis, and statutory or company multiplier.', 'ERN-002'),
  rule(22, 'Attendance & Timekeeping', 'Holiday Adjacency', 'Apply the company rule for absence or unfiled leave immediately before or after a holiday.', 'HOL-002'),
  rule(23, 'Time Management & Scheduling', 'Shift Schedule Creation', 'Require the configured work hours, break hours, rest days, and holiday group for each shift.', 'SCH-001'),
  rule(24, 'Time Management & Scheduling', 'Payroll Cutoffs', 'Frequency, period start, and period end choices must follow the employee payroll frequency.', 'CAL-001'),
  rule(25, 'Leave Management', 'Leave Accrual', 'Accrue leave from the policy effective period, frequency, rate, and employee eligibility group.', 'LEV-001'),
  rule(26, 'Leave Management', 'Leave Conversion', 'Convert only eligible unused leave and apply the active taxable or non-taxable ceiling.', 'LVC-001'),
  rule(27, 'Leave Management', 'Leave Forfeiture', 'Forfeit expiring balances according to policy and notify administrators before expiry.', 'LEV-003'),
  rule(28, 'Loans & Deductions', 'Company Loans', 'Maintain principal, interest, amortization, accumulated payments, hold dates, and outstanding balance.', 'LOA-001'),
  rule(29, 'Loans & Deductions', 'Government Loans', 'Maintain recurring government-loan deductions and reconcile balances by reference number.', 'GLO-001'),
  rule(30, 'Loans & Deductions', 'Deduction Hierarchy', 'Adjust deductions and loans in the company-defined hierarchy while never deferring statutory deductions.', 'HIE-001'),
  rule(31, 'Loans & Deductions', 'Deferred Deductions', 'Carry outstanding amount, rescheduled date, accumulated deferral, reason, and new balance into the next payroll.', 'DEF-001'),
  rule(32, 'Government & Company Compliance', 'Statutory Deductions', 'Apply withholding tax, SSS, PhilHealth, and Pag-IBIG contributions in full.', 'GOV-001'),
  rule(33, 'Government & Company Compliance', 'Tax Annualization', 'Annualized tax uses current YTD, previous-employer balances, deductions, and the effective annual tax table.', 'TAX-008'),
  rule(34, 'Government & Company Compliance', 'Multiple Bank Accounts', 'Prevent duplicate bank records and allocate pay by amount or percentage without exceeding net pay.', 'BNK-001'),
  rule(35, 'Government & Company Compliance', 'Duplicate TIN Validation', 'Warn administrators when a TIN is already assigned to another employee.', 'TIN-001'),
  rule(36, 'Payroll Administration & Controls', 'Cost Allocation', 'Cost-allocation percentages across department, site, section, project, or cost center must total 100%.', 'CST-001'),
  rule(37, 'Payroll Administration & Controls', 'Multi-Currency', 'Use the effective exchange rate for the configured payroll or payout date and preserve base-currency values.', 'CUR-001'),
  rule(38, 'Payroll Administration & Controls', 'Payroll Calendar', 'Payroll payout, processing, timekeeping cutoff, statutory, and billing dates follow the active company calendar.', 'CAL-002'),
  rule(39, 'Payroll Administration & Controls', 'Notifications', 'Notify administrators and employees for deferred deductions, threshold exceptions, forfeitures, and payroll deadlines.', 'NOT-001'),
  rule(40, 'Payroll Administration & Controls', 'Approval Hierarchy', 'Route overrides, exception payrolls, and capped deductions through the configured approval hierarchy.', 'APR-001'),
  rule(41, 'Security & Access Controls', 'Session Timeout', 'Sign out inactive users after the configured inactivity period and record the event in the audit log.', 'SEC-001'),
  rule(42, 'Security & Access Controls', 'Passphrase', 'Require a controlled passphrase before sensitive payroll configuration or posting actions.', 'SEC-002'),
  rule(43, 'Security & Access Controls', 'Role-Based Access', 'Limit company, employee, payroll, and approval functions to assigned role privileges.', 'SEC-003'),
  rule(44, 'Security & Access Controls', 'Single Sign-On', 'Apply the configured SSO provider and block disabled identities from Atlas access.', 'SEC-004'),
  rule(45, 'Pay and Earnings', 'Reimbursements and Receivables', 'Classify reimbursements and receivables separately from taxable earnings and exclude them from a gross-less-reimbursements take-home basis.', 'REI-001'),
  rule(46, 'Pay and Earnings', 'Benefits', 'Compute maternity, sickness, provident, pension, and other configured benefits from the assigned benefit basis and reference source.', 'BEN-006'),
  rule(47, 'Attendance & Timekeeping', 'Break Hours', 'Apply the paid-break duration and flag or deduct only approved excess break time.', 'BRK-001'),
  rule(48, 'Time Management & Scheduling', 'Time In & Time Out', 'Validate missing or incomplete time punches against the assigned work schedule before payroll.', 'TIM-001'),
  rule(49, 'Time Management & Scheduling', 'Work Hours', 'Use the assigned standard work hours when deriving hourly and per-minute payroll rates.', 'WRK-001'),
  rule(50, 'Time Management & Scheduling', 'Rest Days', 'Apply the assigned rest-day schedule and premium reference to eligible work.', 'RST-001'),
  rule(51, 'Time Management & Scheduling', 'Holidays', 'Apply the effective holiday calendar, holiday type, and premium-rate reference.', 'HOL-001'),
  rule(52, 'Leave Management', 'Leave Balances', 'Validate available and negative leave balances before an approved leave item reaches payroll.', 'LEV-002'),
  rule(53, 'Leave Management', 'Service Incentive Leave', 'Apply service eligibility, annual SIL credit, conversion, and ceiling rules.', 'SIL-001'),
  rule(54, 'Leave Management', 'Leave with Pay', 'Pay approved leave using the configured earning basis and leave-type reference.', 'LWP-001'),
  rule(55, 'Leave Management', 'Leave without Pay', 'Deduct approved unpaid leave using the assigned daily or hourly rate and approved units.', 'LWO-001'),
  rule(56, 'Loans & Deductions', 'Company Deductions', 'Schedule company deductions by code, amount, frequency, period, hold date, and adjustment priority.', 'DED-004'),
  rule(57, 'Government & Company Compliance', 'Government Contributions', 'Use the active SSS, PhilHealth, and Pag-IBIG table versions and contribution basis.', 'GOV-004'),
  rule(58, 'Payroll Administration & Controls', 'Date and Number Formats', 'Render payroll dates, currency values, and decimal precision using the active company format.', 'FMT-001'),
  rule(59, 'Payroll Administration & Controls', 'Allotments', 'Validate allotment accounts and prevent total allocations from exceeding the employee net pay.', 'ALT-001'),
  rule(60, 'Payroll Administration & Controls', 'Payslip Rules', 'Use the active payslip template and expose the required YTD and deferred-deduction details.', 'PAY-003'),
  rule(61, 'Payroll Administration & Controls', 'Connected Systems', 'Validate payroll synchronization status and the configured failure action before posting.', 'INT-001'),
];

export const requirementSources = [
  '02Annex B — Employee Masterfile Payroll Data Tables from Dorado',
  'Phase 2 BRD Audit Summary',
];
