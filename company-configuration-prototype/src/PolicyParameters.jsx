import { Plus, Trash } from '@phosphor-icons/react';

const parameter = (key, label, type, defaultValue = '', extra = {}) => ({ key, label, type, defaultValue, required: true, ...extra });

const templates = {
  'Basic Pay': [parameter('payType', 'Pay type', 'select', 'Monthly', { options: ['Monthly', 'Daily', 'Hourly'] }), parameter('factorDays', 'Factor days per year', 'number', '261', { unit: 'days' }), parameter('workHours', 'Work hours per day', 'number', '8', { unit: 'hours' })],
  'Pay Rate Adjustments': [parameter('prorationBasis', 'Proration basis', 'select', 'Worked days', { options: ['Worked days', 'Unworked days', 'Calendar days'] }), parameter('effectiveDate', 'Effective date', 'date', '')],
  'Earnings and Allowances': [parameter('amount', 'Default amount', 'currency', '0', { unit: 'PHP' }), parameter('frequency', 'Payment frequency', 'select', 'Every Payroll', { options: ['Every Payroll', 'First Half', 'Second Half', 'Monthly'] }), parameter('taxable', 'Taxable', 'boolean', 'Yes')],
  'Variable Allowances': [parameter('unitBasis', 'Unit basis', 'select', 'Days', { options: ['Days', 'Hours', 'Minutes', 'Fixed Amount'] }), parameter('unitRate', 'Rate per unit', 'currency', '0', { unit: 'PHP' }), parameter('useTimekeeping', 'Use approved timekeeping units', 'boolean', 'Yes')],
  'Reimbursements and Receivables': [parameter('itemCode', 'Reimbursement / receivable code', 'select', 'Transportation Reimbursement', { options: ['Transportation Reimbursement', 'Medical Reimbursement', 'Cash Advance Receivable', 'Other Reimbursement'] }), parameter('amount', 'Default amount', 'currency', '0', { unit: 'PHP' }), parameter('frequency', 'Payment frequency', 'select', 'Every Payroll', { options: ['Every Payroll', 'First Half', 'Second Half', 'Monthly', 'One Time'] }), parameter('excludeFromProtectedBase', 'Exclude from gross-less-reimbursements take-home basis', 'boolean', 'Yes')],
  '13th Month Pay and Bonuses': [parameter('annualCeiling', 'Annual non-taxable ceiling', 'currency', '90000', { unit: 'PHP' }), parameter('priority', 'Bonus priority', 'number', '1'), parameter('includePreviousEmployer', 'Include previous-employer YTD', 'boolean', 'Yes')],
  'De Minimis Benefits': [parameter('annualCeiling', 'Annual ceiling', 'currency', '0', { unit: 'PHP' }), parameter('excessTreatment', 'Excess treatment', 'select', 'Reclassify as taxable', { options: ['Reclassify as taxable', 'Stop payment', 'Allow with warning'] })],
  'Earning Reclassification': [parameter('sourceCode', 'Source earning code', 'text', ''), parameter('targetCode', 'Target earning code', 'text', ''), parameter('preserveNetPay', 'Preserve net pay', 'boolean', 'Yes')],
  'Gross Up': [parameter('targetNetPay', 'Target net pay', 'currency', '0', { unit: 'PHP' }), parameter('taxMethod', 'Tax method', 'select', 'Annualized', { options: ['Annualized', 'Regular withholding table', 'Final tax'] })],
  // These three schemas mirror the governed policy-engine screens. They are
  // intentionally defined here (rather than invented during code creation)
  // so a new code always starts from the same approved engine template.
  'Take-Home Pay': [
    parameter('enabled', 'Enable policy engine', 'boolean', 'Yes'),
    parameter('employeeGroup', 'Applicability', 'select', 'All Employees', { options: ['All Employees', 'Employee Group', 'Department', 'Specific Employees'], help: 'Scope of the assignment. Group, department or named employees are chosen in the engine.' }),
    parameter('base', 'Protected base', 'select', 'Gross Pay less reimbursements / receivables', { options: ['Basic Pay', 'Gross Pay', 'Gross Pay less reimbursements / receivables'] }),
    parameter('thresholdType', 'Threshold type', 'select', 'Percentage', { options: ['Percentage', 'Fixed Amount'] }),
    parameter('threshold', 'Protected minimum', 'percentage', '30', { unit: '%' }),
    parameter('priorityChoice', 'Conflict priority', 'select', 'Take-Home Pay', { options: ['Take-Home Pay', 'Deduction cap', 'Loan cap'] }),
    parameter('deductionCapEnabled', 'Apply a total deductions cap', 'boolean', 'Yes'),
    parameter('deductionCapBase', 'Deductions cap base', 'select', 'Gross Pay', { options: ['Basic Pay', 'Gross Pay', 'Gross Pay less reimbursements / receivables'] }),
    parameter('deductionCapType', 'Deductions cap type', 'select', 'Percentage', { options: ['Percentage', 'Fixed Amount'] }),
    parameter('deductionCap', 'Deductions cap', 'percentage', '40', { unit: '%' }),
    parameter('loanCapBase', 'Loan cap base', 'select', 'Gross Pay', { options: ['Basic Pay', 'Gross Pay', 'Gross Pay less reimbursements / receivables'] }),
    parameter('loanCapType', 'Loan cap type', 'select', 'Percentage', { options: ['Percentage', 'Fixed Amount'] }),
    parameter('loanCap', 'Loan cap', 'percentage', '25', { unit: '%' }),
    parameter('attendanceCapBase', 'Attendance cap base', 'select', 'Gross Pay', { options: ['Basic Pay', 'Gross Pay', 'Gross Pay less reimbursements / receivables'] }),
    parameter('attendanceCapType', 'Attendance cap type', 'select', 'Number of Days', { options: ['Number of Days', 'Percentage', 'Fixed Amount'] }),
    parameter('attendanceCap', 'Attendance cap', 'number', '3', { unit: 'days' }),
    parameter('autoDefer', 'Automatically defer lower-priority deductions', 'boolean', 'Yes'),
    parameter('carryForward', 'Carry deferred balances forward', 'boolean', 'Yes'),
    parameter('payslipTagging', 'Tag deferred items on payslip', 'boolean', 'Yes'),
    parameter('notifyEmployee', 'Notify employee when a deduction is deferred', 'boolean', 'Yes'),
  ],
  'Retirement Pay': [
    parameter('enabled', 'Enable policy engine', 'boolean', 'Yes'),
    parameter('employeeGroup', 'Applicability', 'select', 'All Employees', { options: ['All Employees', 'Employee Group', 'Department', 'Specific Employees'], help: 'Scope of the assignment. Group, department or named employees are chosen in the engine.' }),
    parameter('planType', 'Plan type', 'select', 'Best of statutory and company plan', { options: ['Statutory RA 7641', 'Company retirement plan', 'Best of statutory and company plan'] }),
    parameter('salaryBasis', 'Salary basis', 'select', 'Latest monthly basic pay', { options: ['Latest monthly basic pay', 'Average salary', 'Average of last 36 months'] }),
    parameter('salaryBasisSource', 'Retirement earnings source', 'select', 'Earnings classified as Retirement', { options: ['Monthly basic pay only', 'Earnings classified as Retirement', 'Selected earnings'], help: 'Whether the salary basis is basic pay only, every earning tagged Retirement, or an explicit selection.' }),
    parameter('salaryBasisEarnings', 'Included earning codes', 'text', '', { required: false, help: 'Earning codes from Earning Configuration when the source is an explicit selection.' }),
    parameter('serviceHistoryRule', 'Rehire and break-in-service rule', 'select', 'Credit prior service, exclude the break', { options: ['Continuous service from the original hire date', 'Credit prior service, exclude the break', 'Latest hire date only'] }),
    parameter('dailyRateDivisor', 'Daily-rate divisor', 'number', '30', { unit: 'days' }),
    parameter('statutoryDays', 'Statutory days per year', 'number', '22.5', { unit: 'days' }),
    parameter('companyDays', 'Company-plan days per year', 'number', '30', { unit: 'days' }),
    parameter('additionalBenefits', 'Additional benefits', 'currency', '15000', { unit: 'PHP' }),
    parameter('minimumAge', 'Minimum retirement age', 'number', '60', { unit: 'years' }),
    parameter('compulsoryAge', 'Compulsory retirement age', 'number', '65', { unit: 'years' }),
    parameter('minimumServiceYears', 'Minimum service', 'number', '5', { unit: 'years' }),
    parameter('earlyRetirementAge', 'Early retirement age', 'number', '55', { unit: 'years' }),
    parameter('minimumGuarantee', 'Minimum benefit guarantee', 'currency', '0', { unit: 'PHP' }),
    parameter('maximumCap', 'Maximum benefit cap', 'currency', '0', { unit: 'PHP' }),
    parameter('rounding', 'Service rounding', 'select', 'Six months or more counts as one year', { options: ['Six months or more counts as one year', 'Exact completed years', 'Round down to completed years'] }),
    parameter('taxExemption', 'Tax treatment', 'select', 'Evaluate RA 7641 / NIRC and RA 4917', { options: ['Evaluate RA 7641 / NIRC and RA 4917', 'Taxable company benefit'] }),
    parameter('companyPlanApproved', 'Company plan approved', 'boolean', 'Yes'),
  ],
  'Final Pay': [
    parameter('enabled', 'Enable policy engine', 'boolean', 'Yes'),
    parameter('employeeGroup', 'Applicability', 'select', 'All Employees', { options: ['All Employees', 'Employee Group', 'Department', 'Specific Employees'], help: 'Scope of the assignment. Group, department or named employees are chosen in the engine.' }),
    parameter('includeUnpaidSalary', 'Include unpaid salary', 'boolean', 'Yes'),
    parameter('includeProratedThirteenth', 'Include prorated 13th month pay', 'boolean', 'Yes'),
    parameter('includeSILConversion', 'Include SIL conversion', 'boolean', 'Yes'),
    parameter('includeSeparationPay', 'Include separation pay', 'boolean', 'Yes'),
    parameter('includeRetirementPay', 'Include retirement pay', 'boolean', 'Yes'),
    parameter('includeFinalTax', 'Include final tax computation', 'boolean', 'Yes'),
    parameter('includeConvertibleLeave', 'Include convertible VL / SL beyond SIL', 'boolean', 'Yes'),
    parameter('includeCashBondReturn', 'Include cash bond return', 'boolean', 'Yes'),
    parameter('includeGratuity', 'Include gratuity pay', 'boolean', 'No'),
    parameter('includedEarnings', 'Included earning codes', 'text', '', { required: false, help: 'Allowances, commissions and other company earnings selected from Earning Configuration.' }),
    parameter('includedDeductions', 'Included deduction and loan codes', 'text', '', { required: false, help: 'Recoverable balances selected from the Deduction, Company Loan and Government Loan modules.' }),
    parameter('leaveConversionRule', 'Leave conversion rule', 'select', 'Use the convertible leave types and caps in Leave Configuration', { options: ['Use the convertible leave types and caps in Leave Configuration', 'Convert SIL only', 'No leave conversion on separation'] }),
    parameter('separationRules', 'Reason-for-leaving rule mapping', 'text', 'Configured in the engine', { required: false, help: 'Maps each separation reason to its separation-pay formula, minimum, rounding and tax treatment.' }),
    parameter('hierarchySource', 'Applicable deduction hierarchy', 'select', 'Dedicated final pay hierarchy', { options: ['Regular payroll hierarchy (REF-011)', 'Dedicated final pay hierarchy'], help: 'Final pay does not inherit the regular payroll order unless the rule says so.' }),
    parameter('statutoryRule', 'Statutory contribution treatment', 'select', 'Decide on the payroll transaction', { options: ['Compute statutory contributions in final pay', 'Do not compute — already collected in the last regular payroll', 'Decide on the payroll transaction'] }),
    // Service rounding is no longer one global rule: each separation reason
    // carries its own rounding inside the reason-for-leaving mapping.
    parameter('dailyRateDivisor', 'Daily-rate divisor', 'number', '30', { unit: 'days' }),
    parameter('advanceThirteenthRule', 'Advanced 13th month rule', 'select', 'Deduct any advanced 13th month release', { options: ['Deduct any advanced 13th month release', 'Ignore advanced release', 'Raise for approval'] }),
    parameter('lastCutoffRule', 'Last cutoff rule', 'select', 'Include the unposted last cutoff', { options: ['Include the unposted last cutoff', 'Exclude unposted cutoff', 'Raise for approval'] }),
    parameter('governmentLoanRule', 'Government loan rule', 'select', 'Offset the full outstanding balance', { options: ['Offset the full outstanding balance', 'Offset scheduled amortization only', 'Raise for approval'] }),
    parameter('companyLoanRule', 'Company loan rule', 'select', 'Offset the full outstanding balance', { options: ['Offset the full outstanding balance', 'Offset scheduled amortization only', 'Raise for approval'] }),
    parameter('negativeNetPayRule', 'Negative net-pay handling', 'select', 'Raise for approval and bill the employee', { options: ['Raise for approval and bill the employee', 'Create receivable', 'Stop release for review', 'Carry to next settlement'] }),
    parameter('autoOffsetDeductions', 'Automatically offset deductions', 'boolean', 'Yes'),
    parameter('notifyAdmin', 'Notify administrator', 'boolean', 'Yes'),
  ],
  'Part-Timers': [parameter('rateBasis', 'Rate basis', 'select', 'Hourly', { options: ['Hourly', 'Daily', 'Fixed period'] }), parameter('rate', 'Assigned rate', 'currency', '0', { unit: 'PHP' }), parameter('approvedUnitsOnly', 'Use approved units only', 'boolean', 'Yes')],
  'OJT Allowance': [parameter('unitBasis', 'Unit basis', 'select', 'Days', { options: ['Days', 'Hours', 'Fixed period'] }), parameter('rate', 'Allowance rate', 'currency', '0', { unit: 'PHP' }), parameter('taxable', 'Taxable', 'boolean', 'No')],
  'Piece Rate': [parameter('unitRate', 'Production unit rate', 'currency', '0', { unit: 'PHP' }), parameter('minimumUnits', 'Minimum eligible units', 'number', '0'), parameter('approvalRequired', 'Production approval required', 'boolean', 'Yes')],
  Benefits: [parameter('benefitBasis', 'Benefit basis', 'select', 'Fixed Amount', { options: ['Fixed Amount', 'Daily Rate', 'Monthly Basic'] }), parameter('rate', 'Benefit rate / amount', 'number', '0'), parameter('taxable', 'Taxable', 'boolean', 'No')],
  Absences: [parameter('deductionBasis', 'Deduction basis', 'select', 'Daily rate', { options: ['Daily rate', 'Monthly basic / factor days', 'Fixed amount'] }), parameter('rounding', 'Absence rounding', 'select', 'Exact units', { options: ['Exact units', 'Half day', 'Whole day'] })],
  Overtime: [parameter('rateMultiplier', 'Rate multiplier', 'number', '1.25', { unit: '×' }), parameter('minimumMinutes', 'Minimum eligible overtime', 'number', '30', { unit: 'minutes' }), parameter('approvalRequired', 'Approval required', 'boolean', 'Yes')],
  Tardiness: [parameter('graceMinutes', 'Grace period', 'number', '0', { unit: 'minutes' }), parameter('deductionBasis', 'Deduction basis', 'select', 'Minute rate', { options: ['Minute rate', 'Hourly rate', 'Fixed amount'] })],
  Undertime: [parameter('deductionBasis', 'Deduction basis', 'select', 'Minute rate', { options: ['Minute rate', 'Hourly rate', 'Fixed amount'] }), parameter('roundingMinutes', 'Rounding interval', 'number', '1', { unit: 'minutes' })],
  'Break Hours': [parameter('paidMinutes', 'Paid break duration', 'number', '60', { unit: 'minutes' }), parameter('deductExcess', 'Deduct excess break time', 'boolean', 'Yes')],
  'Holiday Adjacency': [parameter('requirePriorAttendance', 'Require attendance before holiday', 'boolean', 'Yes'), parameter('requireNextAttendance', 'Require attendance after holiday', 'boolean', 'Yes'), parameter('approvedLeaveQualifies', 'Approved leave qualifies', 'boolean', 'Yes')],
  'Shift Schedule Creation': [parameter('workHours', 'Work hours', 'number', '8', { unit: 'hours' }), parameter('breakHours', 'Break hours', 'number', '1', { unit: 'hours' }), parameter('restDays', 'Rest days per week', 'number', '1')],
  'Time In & Time Out': [parameter('graceMinutes', 'Clock-in grace period', 'number', '0', { unit: 'minutes' }), parameter('missingPunchAction', 'Missing punch action', 'select', 'Flag for review', { options: ['Flag for review', 'Mark absent', 'Use schedule'] })],
  'Work Hours': [parameter('standardHours', 'Standard daily hours', 'number', '8', { unit: 'hours' }), parameter('maximumHours', 'Maximum regular hours', 'number', '8', { unit: 'hours' })],
  'Rest Days': [parameter('restDaysPerWeek', 'Rest days per week', 'number', '1'), parameter('premiumRate', 'Rest-day premium', 'percentage', '30', { unit: '%' })],
  Holidays: [parameter('holidayType', 'Holiday type', 'select', 'Regular Holiday', { options: ['Regular Holiday', 'Special Non-Working', 'Local Holiday'] }), parameter('premiumRate', 'Premium rate', 'percentage', '100', { unit: '%' })],
  'Payroll Cutoffs': [parameter('frequency', 'Payroll frequency', 'select', 'Semi-monthly', { options: ['Weekly', 'Semi-monthly', 'Monthly'] }), parameter('periodStart', 'Period start rule', 'text', '1st / 16th'), parameter('periodEnd', 'Period end rule', 'text', '15th / Month end')],
  'Leave Accrual': [parameter('accrualRate', 'Accrual rate', 'number', '1.25', { unit: 'days' }), parameter('frequency', 'Accrual frequency', 'select', 'Monthly', { options: ['Per Payroll', 'Monthly', 'Annually'] }), parameter('maximumBalance', 'Maximum balance', 'number', '30', { unit: 'days' })],
  'Leave Conversion': [parameter('maximumDays', 'Maximum convertible days', 'number', '10', { unit: 'days' }), parameter('taxTreatment', 'Tax treatment', 'select', 'Apply ceiling', { options: ['Apply ceiling', 'Taxable', 'Non-taxable'] })],
  'Leave Balances': [parameter('allowNegative', 'Allow negative balance', 'boolean', 'No'), parameter('maximumBalance', 'Maximum balance', 'number', '30', { unit: 'days' })],
  'Service Incentive Leave': [parameter('minimumService', 'Minimum service', 'number', '1', { unit: 'years' }), parameter('annualCredit', 'Annual SIL credit', 'number', '5', { unit: 'days' })],
  'Leave Forfeiture': [parameter('forfeitureMonth', 'Forfeiture month', 'select', 'December', { options: ['January', 'June', 'December'] }), parameter('carryForwardDays', 'Carry-forward allowance', 'number', '0', { unit: 'days' }), parameter('noticeDays', 'Advance notice', 'number', '30', { unit: 'days' })],
  'Leave with Pay': [parameter('leaveType', 'Leave type', 'select', 'Vacation Leave', { options: ['Vacation Leave', 'Sick Leave', 'Service Incentive Leave', 'Other Paid Leave'] }), parameter('payBasis', 'Paid-leave earning basis', 'select', 'Current daily rate', { options: ['Current daily rate', 'Current hourly rate', 'Fixed amount'] }), parameter('maximumUnits', 'Maximum paid units per request', 'number', '0', { unit: 'days' }), parameter('requireApprovedBalance', 'Require approved available balance', 'boolean', 'Yes')],
  'Leave without Pay': [parameter('leaveType', 'Leave type', 'select', 'Leave Without Pay', { options: ['Leave Without Pay', 'Unapproved Absence', 'Other Unpaid Leave'] }), parameter('deductionBasis', 'Unpaid-leave deduction basis', 'select', 'Current daily rate', { options: ['Current daily rate', 'Current hourly rate', 'Fixed amount'] }), parameter('rounding', 'Unit rounding', 'select', 'Exact approved units', { options: ['Exact approved units', 'Half day', 'Whole day'] }), parameter('applyTakeHomeSafeguard', 'Apply take-home safeguard when eligible', 'boolean', 'Yes')],
  'Company Deductions': [parameter('amount', 'Deduction amount', 'currency', '0', { unit: 'PHP' }), parameter('frequency', 'Collection frequency', 'select', 'Every Payroll', { options: ['Every Payroll', 'First Half', 'Second Half', 'Monthly'] }), parameter('priority', 'Priority', 'number', '3')],
  'Company Loans': [parameter('interestRate', 'Annual interest rate', 'percentage', '5', { unit: '%' }), parameter('frequency', 'Collection frequency', 'select', 'Monthly', { options: ['Every Payroll', 'First Half', 'Second Half', 'Monthly'] }), parameter('deferShortfall', 'Defer unpaid amortization', 'boolean', 'Yes')],
  'Government Loans': [parameter('frequency', 'Collection frequency', 'select', 'Monthly', { options: ['Every Payroll', 'First Half', 'Second Half', 'Monthly'] }), parameter('priority', 'Deduction priority', 'number', '2'), parameter('deferShortfall', 'Defer unpaid amortization', 'boolean', 'Yes')],
  'Deduction Hierarchy': [parameter('priority', 'Adjustment priority', 'number', '1'), parameter('allowPartial', 'Allow partial deduction', 'boolean', 'Yes'), parameter('carryForward', 'Carry forward balance', 'boolean', 'Yes')],
  'Deferred Deductions': [
    parameter('carryForward', 'Carry forward balance', 'boolean', 'Yes'),
    parameter('rescheduleRule', 'Reschedule rule', 'select', 'Next Payroll', { options: ['Next Payroll', 'Next Month', 'Manual Review'] }),
    parameter('notifyEmployee', 'Notify employee', 'boolean', 'Yes'),
    // Staggering an outstanding amount is a separate decision from carrying it
    // forward, so it carries its own approval, authorization and schedule.
    parameter('method', 'Recovery method', 'select', 'Scheduled installments', { options: ['Deduct in full on the next payroll', 'Partial deduction up to the available amount', 'Fixed staggered amount per payroll', 'Scheduled installments'] }),
    parameter('frequency', 'Recovery frequency', 'select', 'Every payroll', { options: ['Every payroll', 'First half only', 'Second half only', 'Monthly'] }),
    parameter('installments', 'Number of installments', 'number', '3', { unit: 'payrolls' }),
    parameter('fixedAmount', 'Fixed amount per payroll', 'currency', '500', { unit: 'PHP' }),
    parameter('staggerThreshold', 'Staggering threshold', 'currency', '500', { unit: 'PHP', help: 'Outstanding amounts at or below this value are recovered in full instead of staggered.' }),
    parameter('requiresApproval', 'Require approval before staggering', 'boolean', 'Yes'),
    parameter('approvalRole', 'Approving role', 'select', 'Finance', { options: ['Payroll Administrator', 'Finance', 'HR', 'Department Head'] }),
    parameter('authorization', 'Employee authorization', 'select', 'Employee authorization required', { options: ['Employee authorization required', 'Notify employee only', 'Not required'] }),
    parameter('notificationChannel', 'Notification channel', 'select', 'Payslip note and email', { options: ['Payslip note and email', 'Payslip note only', 'Email only', 'Employee self-service request'] }),
    parameter('keepOriginalDueDate', 'Retain the original due date', 'boolean', 'Yes'),
  ],
  'Statutory Deductions': [parameter('effectiveDate', 'Effective date', 'date', ''), parameter('frequency', 'Deduction frequency', 'select', 'Every Payroll', { options: ['Every Payroll', 'First Half', 'Second Half', 'Monthly'] }), parameter('applyInFull', 'Always apply in full', 'boolean', 'Yes')],
  'Tax Annualization': [parameter('taxYear', 'Tax year', 'number', '2026'), parameter('includePreviousEmployer', 'Include previous-employer YTD', 'boolean', 'Yes'), parameter('recalculateEveryPayroll', 'Recalculate every payroll', 'boolean', 'Yes')],
  'Government Contributions': [parameter('contributionBasis', 'Contribution basis', 'select', 'Monthly basic', { options: ['Monthly basic', 'Gross compensation', 'Configured MSC'] }), parameter('applyCeiling', 'Apply statutory ceiling', 'boolean', 'Yes')],
  'Multiple Bank Accounts': [parameter('allocationMethod', 'Allocation method', 'select', 'Percentage', { options: ['Percentage', 'Fixed Amount'] }), parameter('requiredTotal', 'Required allocation total', 'percentage', '100', { unit: '%' }), parameter('preventDuplicate', 'Prevent duplicate account', 'boolean', 'Yes')],
  'Duplicate TIN Validation': [parameter('matchRule', 'TIN match rule', 'select', 'Exact Match', { options: ['Exact Match', 'Normalized Match'] }), parameter('blockDuplicate', 'Block duplicate TIN', 'boolean', 'Yes')],
  'Minimum Wage and ECOLA': [parameter('region', 'Minimum wage region', 'text', 'NCR'), parameter('dailyMinimum', 'Daily minimum wage', 'currency', '0', { unit: 'PHP' }), parameter('dailyEcola', 'Daily ECOLA', 'currency', '0', { unit: 'PHP' })],
  'Date and Number Formats': [parameter('dateFormat', 'Date format', 'select', 'DD-MMM-YYYY', { options: ['DD-MMM-YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] }), parameter('decimalPlaces', 'Decimal places', 'number', '2')],
  'Cost Allocation': [parameter('requiredTotal', 'Required allocation total', 'percentage', '100', { unit: '%' }), parameter('blockIncomplete', 'Block incomplete allocation', 'boolean', 'Yes')],
  Allotments: [parameter('maximumPercentage', 'Maximum net-pay percentage', 'percentage', '100', { unit: '%' }), parameter('preventDuplicateAccount', 'Prevent duplicate account', 'boolean', 'Yes')],
  'Multi-Currency': [parameter('rateDateBasis', 'Exchange-rate date basis', 'select', 'Payroll date', { options: ['Payroll date', 'Payout date', 'Cutoff end date'] }), parameter('baseCurrency', 'Base currency', 'select', 'PHP', { options: ['PHP', 'USD', 'SGD'] })],
  'Payroll Calendar': [parameter('frequency', 'Payroll frequency', 'select', 'Semi-monthly', { options: ['Weekly', 'Semi-monthly', 'Monthly'] }), parameter('cutoffSchedule', 'Cutoff schedule', 'text', '1st–15th / 16th–End')],
  'Payslip Rules': [parameter('template', 'Payslip template', 'text', 'Standard Atlas Payslip'), parameter('showYtd', 'Show YTD values', 'boolean', 'Yes'), parameter('maskBankAccount', 'Mask bank account', 'boolean', 'Yes')],
  Notifications: [parameter('channel', 'Notification channel', 'select', 'Email', { options: ['Email', 'SMS', 'Dashboard', 'Email and Dashboard'] }), parameter('leadTime', 'Advance notice', 'number', '3', { unit: 'days' }), parameter('recipient', 'Recipient', 'select', 'Administrator', { options: ['Employee', 'Manager', 'Administrator', 'All Users'] })],
  'Approval Hierarchy': [parameter('approvalLevels', 'Approval levels', 'number', '2'), parameter('requireFinalApprover', 'Require final approver', 'boolean', 'Yes')],
  'Connected Systems': [parameter('systemName', 'Connected system', 'text', ''), parameter('syncFrequency', 'Sync frequency', 'select', 'Daily', { options: ['Real-time', 'Hourly', 'Daily', 'Per Payroll'] }), parameter('blockOnFailure', 'Block payroll on failed sync', 'boolean', 'No')],
  'Session Timeout': [parameter('inactiveMinutes', 'Inactive session timeout', 'number', '30', { unit: 'minutes' }), parameter('warningMinutes', 'Warning before sign-out', 'number', '5', { unit: 'minutes' })],
  Passphrase: [parameter('requiredFor', 'Required action', 'select', 'Payroll Posting', { options: ['Payroll Posting', 'Configuration Changes', 'Exports', 'All Sensitive Actions'] }), parameter('expiryDays', 'Passphrase expiry', 'number', '90', { unit: 'days' })],
  'Role-Based Access': [parameter('role', 'Required role', 'select', 'Administrator', { options: ['Preparer', 'Checker', 'Reviewer', 'Administrator'] }), parameter('approvalLevel', 'Approval level', 'select', 'Final', { options: ['None', 'Level 1', 'Level 2', 'Level 3', 'Final'] })],
  'Single Sign-On': [parameter('provider', 'SSO provider', 'text', 'Company SAML'), parameter('enforceSso', 'Enforce SSO', 'boolean', 'Yes'), parameter('allowLocalFallback', 'Allow local fallback', 'boolean', 'No')],
};

// Annex B supplies configuration fields in addition to the compact policy
// definitions above. Keeping the additions separate makes the migration
// explicit and lets existing stored codes gain newly governed fields by key.
const annexParameterAdditions = {
  'Basic Pay': [
    parameter('factorDaysReference', 'Factor-days reference', 'select', 'REF-010 - Factor Days', { options: ['REF-010 - Factor Days'], group: 'Basis and references' }),
    parameter('minimumWageReference', 'Minimum-wage reference', 'select', 'REF-005 - Minimum Wage Table', { options: ['REF-005 - Minimum Wage Table'], group: 'Basis and references' }),
    parameter('mweTreatment', 'Minimum-wage earner treatment', 'select', 'Use employee MWE flag and location', { options: ['Use employee MWE flag and location', 'Do not apply MWE adjustment'], group: 'Basis and references' }),
    parameter('effectiveDate', 'Effective date', 'date', '', { required: false, group: 'Effective period' }),
    parameter('periodStart', 'Period start', 'select', 'Every Payroll', { options: ['Every Payroll', 'First Half', 'Second Half'], group: 'Effective period' }),
    parameter('roundingMode', 'Rate rounding', 'select', 'Round to centavo at final result', { options: ['Round to centavo at final result', 'Round each derived rate to centavo', 'Preserve configured precision'], group: 'Controls' }),
  ],
  'Pay Rate Adjustments': [
    parameter('oldRateSource', 'Prior rate source', 'select', 'Employee effective-dated pay history', { options: ['Employee effective-dated pay history', 'Uploaded prior rate'], group: 'Basis and references' }),
    parameter('newRateSource', 'New rate source', 'select', 'Employee effective-dated pay history', { options: ['Employee effective-dated pay history', 'Uploaded new rate'], group: 'Basis and references' }),
    parameter('factorDaysReference', 'Factor-days reference', 'select', 'REF-010 - Factor Days', { options: ['REF-010 - Factor Days'], group: 'Basis and references' }),
    parameter('payrollPeriodReference', 'Payroll-period reference', 'select', 'REF-029 - Payment Frequencies and Payroll Periods', { options: ['REF-029 - Payment Frequencies and Payroll Periods'], group: 'Effective period' }),
    parameter('retroTreatment', 'Retroactive adjustment treatment', 'select', 'Create a separate adjustment earning', { options: ['Create a separate adjustment earning', 'Include in basic pay', 'Raise for approval'], group: 'Controls' }),
  ],
  'Earnings and Allowances': [
    parameter('earningReference', 'Earning / allowance code source', 'select', 'REF-019 - Earnings and Allowance Codes', { options: ['REF-019 - Earnings and Allowance Codes'], group: 'Basis and references' }),
    parameter('startPeriod', 'Start period', 'select', 'Every Payroll', { options: ['Every Payroll', 'First Half', 'Second Half'], group: 'Effective period' }),
    parameter('endPeriod', 'End period', 'select', 'Every Payroll', { options: ['Every Payroll', 'First Half', 'Second Half'], group: 'Effective period' }),
    parameter('holdAction', 'Hold treatment', 'select', 'Hold only the selected payroll', { options: ['Hold only the selected payroll', 'Hold until released', 'Do not allow holds'], group: 'Controls' }),
    parameter('classification', 'Earning classification', 'select', 'Taxable earning', { options: ['Taxable earning', 'Non-taxable earning', 'Receivable', 'De Minimis', 'Basic-pay component'], group: 'Tax and classification' }),
    parameter('computedAmount', 'Amount source', 'select', 'Configured amount', { options: ['Configured amount', 'Approved units × rate', 'Uploaded amount'], group: 'Basis and references' }),
  ],
  'Variable Allowances': [
    parameter('allowanceReference', 'Variable-allowance code source', 'select', 'REF-019 - Earnings and Allowance Codes', { options: ['REF-019 - Earnings and Allowance Codes'], group: 'Basis and references' }),
    parameter('factorDaysReference', 'Factor-days reference', 'select', 'REF-010 - Factor Days', { options: ['REF-010 - Factor Days'], group: 'Basis and references' }),
    parameter('payrollPeriodReference', 'Payroll-period reference', 'select', 'REF-029 - Payment Frequencies and Payroll Periods', { options: ['REF-029 - Payment Frequencies and Payroll Periods'], group: 'Effective period' }),
    parameter('taxTreatment', 'Tax treatment', 'select', 'Taxable', { options: ['Taxable', 'Non-taxable', 'De Minimis', 'Receivable'], group: 'Tax and classification' }),
    parameter('effectiveDate', 'Effective date', 'date', '', { required: false, group: 'Effective period' }),
    parameter('zeroUnitAction', 'Zero approved-unit action', 'select', 'Do not pay', { options: ['Do not pay', 'Pay configured minimum', 'Raise for approval'], group: 'Controls' }),
  ],
  'Reimbursements and Receivables': [
    parameter('earningReference', 'Code source', 'select', 'REF-019 - Earnings and Allowance Codes', { options: ['REF-019 - Earnings and Allowance Codes'], group: 'Basis and references' }),
    parameter('taxTreatment', 'Tax treatment', 'select', 'Non-taxable reimbursement', { options: ['Non-taxable reimbursement', 'Taxable earning', 'Employee receivable'], group: 'Tax and classification' }),
    parameter('startPeriod', 'Start period', 'select', 'Every Payroll', { options: ['Every Payroll', 'First Half', 'Second Half'], group: 'Effective period' }),
    parameter('endPeriod', 'End period', 'select', 'Every Payroll', { options: ['Every Payroll', 'First Half', 'Second Half'], group: 'Effective period' }),
    parameter('requireSupportingDocument', 'Require supporting document', 'boolean', 'Yes', { group: 'Controls' }),
    parameter('includeInGrossPay', 'Include in gross-pay display', 'boolean', 'Yes', { group: 'Tax and classification' }),
  ],
  '13th Month Pay and Bonuses': [
    parameter('ceilingReference', 'Annual non-taxable ceiling source', 'select', 'REF-007 - Bonus Tax Exemption Ceiling', { options: ['REF-007 - Bonus Tax Exemption Ceiling'], group: 'Basis and references' }),
    parameter('bonusReference', 'Bonus code and priority source', 'select', 'REF-020 - Bonus Codes and Priority', { options: ['REF-020 - Bonus Codes and Priority'], group: 'Basis and references' }),
    parameter('computationBasis', 'Computation basis', 'select', 'Eligible basic earnings YTD ÷ 12', { options: ['Eligible basic earnings YTD ÷ 12', 'Prorated eligible earnings ÷ 12', 'Uploaded amount'], group: 'Basis and references' }),
    parameter('transactionCeiling', 'Per-transaction non-taxable cap', 'currency', '0', { unit: 'PHP', required: false, group: 'Thresholds' }),
    parameter('trackYtdUtilization', 'Track current YTD utilization', 'boolean', 'Yes', { group: 'Thresholds' }),
    parameter('excessTreatment', 'Excess treatment', 'select', 'Reclassify excess as taxable', { options: ['Reclassify excess as taxable', 'Raise for approval'], group: 'Tax and classification' }),
    parameter('uploadValidation', 'Uploaded bonus validation', 'select', 'Reject unknown employee or bonus code', { options: ['Reject unknown employee or bonus code', 'Raise warnings only'], group: 'Controls' }),
    parameter('effectiveDate', 'Ceiling effective date', 'date', '', { required: false, group: 'Effective period' }),
  ],
  'De Minimis Benefits': [
    parameter('benefitTypeReference', 'Benefit-type source', 'select', 'REF-021 - De Minimis Benefit Types', { options: ['REF-021 - De Minimis Benefit Types'], group: 'Basis and references' }),
    parameter('ceilingReference', 'Ceiling source', 'select', 'REF-006 - De Minimis Ceiling', { options: ['REF-006 - De Minimis Ceiling'], group: 'Basis and references' }),
    parameter('ceilingPeriod', 'Ceiling period', 'select', 'From reference table', { options: ['From reference table', 'Monthly', 'Semester', 'Annual', 'Per payroll'], group: 'Thresholds' }),
    parameter('unitRule', 'Unit rule', 'select', 'From reference table', { options: ['From reference table', 'Currency amount', 'Days', 'Percentage of minimum wage'], group: 'Thresholds' }),
    parameter('trackYtdUtilization', 'Track YTD utilization', 'boolean', 'Yes', { group: 'Thresholds' }),
    parameter('effectiveDate', 'Effective date', 'date', '', { required: false, group: 'Effective period' }),
  ],
  'Earning Reclassification': [
    parameter('earningReference', 'Earning-code source', 'select', 'REF-019 - Earnings and Allowance Codes', { options: ['REF-019 - Earnings and Allowance Codes'], group: 'Basis and references' }),
    parameter('reclassificationScope', 'Amount scope', 'select', 'Current payroll and YTD', { options: ['Current payroll only', 'Current payroll and YTD', 'Uploaded amount'], group: 'Basis and references' }),
    parameter('ceilingReference', 'Applicable ceiling source', 'select', 'None', { options: ['None', 'REF-006 - De Minimis Ceiling', 'REF-007 - Bonus Tax Exemption Ceiling'], group: 'Thresholds' }),
    parameter('includePreviousEmployer', 'Include previous-employer balance', 'boolean', 'Yes', { group: 'Thresholds' }),
    parameter('recalculateTax', 'Recalculate withholding tax', 'boolean', 'Yes', { group: 'Tax and classification' }),
    parameter('showOnPayslip', 'Show both sides on payslip and reports', 'boolean', 'Yes', { group: 'Controls' }),
  ],
  'Gross Up': [
    parameter('targetType', 'Guaranteed target', 'select', 'Net Pay', { options: ['Net Pay', 'Net Benefit'], group: 'Basis and references' }),
    parameter('taxTableReference', 'Tax-table source', 'select', 'REF-001 - BIR Withholding Tax Table', { options: ['REF-001 - BIR Withholding Tax Table'], group: 'Basis and references' }),
    parameter('frequency', 'Tax-table frequency', 'select', 'Monthly', { options: ['Daily', 'Weekly', 'Semi-monthly', 'Monthly', 'Annualized'], group: 'Basis and references' }),
    parameter('effectiveDate', 'Table effective date', 'date', '', { required: false, group: 'Effective period' }),
    parameter('employerSharePercent', 'Employer-absorbed tax share', 'percentage', '100', { unit: '%', group: 'Tax and classification' }),
    parameter('includeStatutoryInTaxable', 'Deduct mandatory contributions before tax lookup', 'boolean', 'Yes', { group: 'Tax and classification' }),
    parameter('tolerance', 'Convergence tolerance', 'currency', '0.01', { unit: 'PHP', group: 'Controls' }),
    parameter('maxIterations', 'Maximum iterations', 'number', '50', { group: 'Controls' }),
    parameter('roundingMode', 'Rounding', 'select', 'Round solved gross to centavo', { options: ['Round solved gross to centavo', 'Preserve intermediate precision'], group: 'Controls' }),
  ],
  'Take-Home Pay': [
    parameter('hierarchyReference', 'Deduction and loan hierarchy source', 'select', 'REF-011 - Deduction and Loan Hierarchy', { options: ['REF-011 - Deduction and Loan Hierarchy'], group: 'Basis and references' }),
    parameter('mandatoryTreatment', 'Mandatory statutory treatment', 'select', 'Always apply in full', { options: ['Always apply in full'], group: 'Controls' }),
    parameter('allowPartialAdjustment', 'Allow partial deduction adjustment', 'boolean', 'Yes', { group: 'Deferral and ledger' }),
    parameter('rescheduleRule', 'Deferred-item reschedule rule', 'select', 'Next Payroll', { options: ['Next Payroll', 'Next Month', 'Manual Review'], group: 'Deferral and ledger' }),
    parameter('linkDeferredToNextPayroll', 'Link deferred items to the next payroll', 'boolean', 'Yes', { group: 'Deferral and ledger' }),
    parameter('maintainLedger', 'Maintain deduction and loan ledger', 'boolean', 'Yes', { group: 'Deferral and ledger' }),
    parameter('netPayValidation', 'Run final net-pay validation', 'boolean', 'Yes', { group: 'Validation and notifications' }),
    parameter('notifyAdmin', 'Notify administrator on deferral or exception', 'boolean', 'Yes', { group: 'Validation and notifications' }),
    parameter('exceptionAlert', 'Alert when threshold remains unmet', 'boolean', 'Yes', { group: 'Validation and notifications' }),
    parameter('auditTrace', 'Store ordered resolution trace', 'boolean', 'Yes', { group: 'Validation and notifications' }),
  ],
  'Retirement Pay': [
    parameter('employeeDataValidation', 'Required employee-data validation', 'select', 'Hire, birth, retirement dates; plan; separation reason', { options: ['Hire, birth, retirement dates; plan; separation reason'], group: 'Validation and notifications' }),
    parameter('compareMoreBeneficial', 'Compare statutory and company-plan values', 'boolean', 'Yes', { group: 'Controls' }),
    parameter('includeInFinalPay', 'Automatically include qualifying retirement pay in final pay', 'boolean', 'Yes', { group: 'Controls' }),
    parameter('eligibilityAlert', 'Alert for missing eligibility data', 'boolean', 'Yes', { group: 'Validation and notifications' }),
    parameter('auditTrace', 'Store eligibility and benefit trace', 'boolean', 'Yes', { group: 'Validation and notifications' }),
  ],
  'Final Pay': [
    parameter('leaveBalanceReference', 'Leave and conversion source', 'select', 'REF-026 - Leave Types and Conversion Rules', { options: ['REF-026 - Leave Types and Conversion Rules'], group: 'Basis and references' }),
    parameter('separationReference', 'Separation-treatment source', 'select', 'REF-030 - Separation Reasons and Final Pay Treatments', { options: ['REF-030 - Separation Reasons and Final Pay Treatments'], group: 'Basis and references' }),
    parameter('hierarchyReference', 'Deduction hierarchy source', 'select', 'REF-011 - Deduction and Loan Hierarchy', { options: ['REF-011 - Deduction and Loan Hierarchy'], group: 'Basis and references' }),
    parameter('includePendingTimeItems', 'Include pending salary, OT, holiday, and LAUT items', 'boolean', 'Yes', { group: 'Components and offsets' }),
    parameter('createResidualReceivable', 'Create receivable for unresolved negative balance', 'boolean', 'Yes', { group: 'Components and offsets' }),
    parameter('produceBreakdown', 'Produce itemized final-pay breakdown', 'boolean', 'Yes', { group: 'Validation and notifications' }),
    parameter('auditTrace', 'Store component, offset, tax, and release trace', 'boolean', 'Yes', { group: 'Validation and notifications' }),
  ],
  'Company Deductions': [
    parameter('deductionReference', 'Deduction-code source', 'select', 'REF-022 - Deduction Codes', { options: ['REF-022 - Deduction Codes'], group: 'Basis and references' }),
    parameter('startPeriod', 'Start period', 'select', 'Every Payroll', { options: ['Every Payroll', 'First Half', 'Second Half'], group: 'Effective period' }),
    parameter('endPeriod', 'End period', 'select', 'Every Payroll', { options: ['Every Payroll', 'First Half', 'Second Half'], group: 'Effective period' }),
    parameter('holdAction', 'Hold treatment', 'select', 'Hold selected payroll only', { options: ['Hold selected payroll only', 'Hold until released'], group: 'Controls' }),
  ],
  'Company Loans': [
    parameter('loanReference', 'Loan-type source', 'select', 'REF-023 - Loan Types', { options: ['REF-023 - Loan Types'], group: 'Basis and references' }),
    parameter('principalSource', 'Principal and interest source', 'select', 'Employee loan ledger', { options: ['Employee loan ledger', 'Uploaded opening balance'], group: 'Basis and references' }),
    parameter('balanceValidation', 'Balance validation', 'select', 'Amortization cannot exceed remaining balance', { options: ['Amortization cannot exceed remaining balance'], group: 'Controls' }),
    parameter('hierarchyReference', 'Adjustment hierarchy source', 'select', 'REF-011 - Deduction and Loan Hierarchy', { options: ['REF-011 - Deduction and Loan Hierarchy'], group: 'Controls' }),
  ],
  'Government Loans': [
    parameter('loanReference', 'Government loan-type source', 'select', 'REF-023 - Loan Types', { options: ['REF-023 - Loan Types'], group: 'Basis and references' }),
    parameter('referenceNumberRequired', 'Require agency reference number', 'boolean', 'Yes', { group: 'Controls' }),
    parameter('balanceValidation', 'Balance validation', 'select', 'Amortization cannot exceed remaining balance', { options: ['Amortization cannot exceed remaining balance'], group: 'Controls' }),
    parameter('hierarchyReference', 'Adjustment hierarchy source', 'select', 'REF-011 - Deduction and Loan Hierarchy', { options: ['REF-011 - Deduction and Loan Hierarchy'], group: 'Controls' }),
  ],
  'Tax Annualization': [
    parameter('taxTableReference', 'Tax-table source', 'select', 'REF-001 - BIR Withholding Tax Table', { options: ['REF-001 - BIR Withholding Tax Table'], group: 'Basis and references' }),
    parameter('includePreviousEmployerIncome', 'Include previous-employer taxable and non-taxable income', 'boolean', 'Yes', { group: 'Basis and references' }),
    parameter('includePreviousEmployerTax', 'Include previous-employer tax withheld', 'boolean', 'Yes', { group: 'Basis and references' }),
    parameter('collectionSchedule', 'Projected tax collection schedule', 'select', 'Spread over remaining payrolls', { options: ['Spread over remaining payrolls', 'Collect at year end', 'Raise for approval'], group: 'Controls' }),
  ],
  'Government Contributions': [
    parameter('sssReference', 'SSS table source', 'select', 'REF-002 - SSS Contribution Table', { options: ['REF-002 - SSS Contribution Table'], group: 'Basis and references' }),
    parameter('philHealthReference', 'PhilHealth table source', 'select', 'REF-003 - PhilHealth Contribution Table', { options: ['REF-003 - PhilHealth Contribution Table'], group: 'Basis and references' }),
    parameter('hdmfReference', 'Pag-IBIG table source', 'select', 'REF-004 - HDMF Contribution Table', { options: ['REF-004 - HDMF Contribution Table'], group: 'Basis and references' }),
    parameter('versionByPayrollDate', 'Resolve effective version by payroll date', 'boolean', 'Yes', { group: 'Effective period' }),
  ],
  'Multiple Bank Accounts': [
    parameter('bankReference', 'Bank-code source', 'select', 'REF-013 - Bank Codes', { options: ['REF-013 - Bank Codes'], group: 'Basis and references' }),
    parameter('accountTypes', 'Allowed account types', 'select', 'Savings and Current', { options: ['Savings and Current', 'Savings only', 'Current only'], group: 'Controls' }),
    parameter('blockOverNetPay', 'Block allocations above net pay', 'boolean', 'Yes', { group: 'Controls' }),
  ],
  'Minimum Wage and ECOLA': [
    parameter('minimumWageReference', 'Regional wage source', 'select', 'REF-005 - Minimum Wage Table', { options: ['REF-005 - Minimum Wage Table'], group: 'Basis and references' }),
    parameter('resolveByEmployeeLocation', 'Resolve by employee work location', 'boolean', 'Yes', { group: 'Basis and references' }),
    parameter('promptOnLocationChange', 'Prompt when a location change alters the rate', 'boolean', 'Yes', { group: 'Validation and notifications' }),
  ],
  'Cost Allocation': [
    parameter('dimensionReference', 'Allocation-dimension source', 'select', 'REF-028 - Cost Centers and Allocation Dimensions', { options: ['REF-015 - Departments', 'REF-017 - Locations', 'REF-028 - Cost Centers and Allocation Dimensions'], group: 'Basis and references' }),
    parameter('allocationMethod', 'Allocation method', 'select', 'Percentage', { options: ['Percentage', 'Fixed Amount'], group: 'Controls' }),
  ],
  'Multi-Currency': [
    parameter('currencyReference', 'Currency and rate source', 'select', 'REF-027 - Currency and Exchange Rates', { options: ['REF-027 - Currency and Exchange Rates'], group: 'Basis and references' }),
    parameter('snapshotUsedRate', 'Snapshot the transaction exchange rate', 'boolean', 'Yes', { group: 'Controls' }),
  ],
  'Payroll Calendar': [
    parameter('periodReference', 'Payroll-period source', 'select', 'REF-029 - Payment Frequencies and Payroll Periods', { options: ['REF-029 - Payment Frequencies and Payroll Periods'], group: 'Basis and references' }),
    parameter('includeStatutoryTimeline', 'Include statutory deadlines', 'boolean', 'Yes', { group: 'Controls' }),
    parameter('includeBillingTimeline', 'Include billing cutoffs', 'boolean', 'Yes', { group: 'Controls' }),
  ],
  Benefits: [
    parameter('benefitType', 'Benefit type', 'select', 'Maternity Benefit', { options: ['Maternity Benefit', 'Sickness Benefit', 'Provident Fund', 'Pension Fund', 'Other Company Benefit'], group: 'Basis and references' }),
    parameter('employeeShare', 'Employee share', 'percentage', '0', { unit: '%', group: 'Thresholds and values' }),
    parameter('employerShare', 'Employer share', 'percentage', '0', { unit: '%', group: 'Thresholds and values' }),
    parameter('maximumEmployerShare', 'Maximum employer share', 'percentage', '0', { unit: '%', required: false, group: 'Thresholds and values' }),
    parameter('effectiveDate', 'Effective date', 'date', '', { required: false, group: 'Effective period' }),
    parameter('approvalRequired', 'Require approved benefit or reimbursement record', 'boolean', 'Yes', { group: 'Validation and notifications' }),
  ],
  'Break Hours': [
    parameter('scheduleReference', 'Work-schedule source', 'select', 'REF-025 - Shift and Work Schedule Codes', { options: ['REF-025 - Shift and Work Schedule Codes'], group: 'Basis and references' }),
    parameter('excessBasis', 'Excess-break deduction basis', 'select', 'Per-minute rate', { options: ['Per-minute rate', 'Hourly rate', 'Flag only'], group: 'Basis and references' }),
    parameter('roundingMinutes', 'Rounding interval', 'number', '1', { unit: 'minutes', group: 'Thresholds and values' }),
    parameter('approvalRequired', 'Require approved excess-break record', 'boolean', 'Yes', { group: 'Validation and notifications' }),
  ],
  'Time In & Time Out': [
    parameter('scheduleReference', 'Work-schedule source', 'select', 'REF-025 - Shift and Work Schedule Codes', { options: ['REF-025 - Shift and Work Schedule Codes'], group: 'Basis and references' }),
    parameter('clockOutGraceMinutes', 'Clock-out grace period', 'number', '0', { unit: 'minutes', group: 'Thresholds and values' }),
    parameter('crossMidnightRule', 'Cross-midnight shift rule', 'select', 'Resolve from assigned schedule', { options: ['Resolve from assigned schedule', 'Require manual review'], group: 'Controls' }),
    parameter('approvalRequired', 'Require approval for corrected punches', 'boolean', 'Yes', { group: 'Validation and notifications' }),
  ],
  'Work Hours': [
    parameter('factorDaysReference', 'Factor-days source', 'select', 'REF-010 - Factor Days', { options: ['REF-010 - Factor Days'], group: 'Basis and references' }),
    parameter('scheduleReference', 'Work-schedule source', 'select', 'REF-025 - Shift and Work Schedule Codes', { options: ['REF-025 - Shift and Work Schedule Codes'], group: 'Basis and references' }),
    parameter('breakDeduction', 'Break treatment', 'select', 'Exclude unpaid breaks from worked hours', { options: ['Exclude unpaid breaks from worked hours', 'Include all scheduled hours'], group: 'Controls' }),
    parameter('overtimeAfterMaximum', 'Hours above maximum become overtime', 'boolean', 'Yes', { group: 'Controls' }),
  ],
  'Rest Days': [
    parameter('holidayReference', 'Calendar and rest-day source', 'select', 'REF-024 - Holiday Calendar and Types', { options: ['REF-024 - Holiday Calendar and Types'], group: 'Basis and references' }),
    parameter('premiumReference', 'Premium-rate source', 'select', 'REF-009 - Holiday Premium Rates', { options: ['REF-009 - Holiday Premium Rates'], group: 'Basis and references' }),
    parameter('eligibilityBasis', 'Rest-day eligibility basis', 'select', 'Assigned schedule', { options: ['Assigned schedule', 'Approved actual work'], group: 'Basis and references' }),
    parameter('approvalRequired', 'Require approved rest-day work', 'boolean', 'Yes', { group: 'Validation and notifications' }),
  ],
  Holidays: [
    parameter('holidayReference', 'Holiday calendar source', 'select', 'REF-024 - Holiday Calendar and Types', { options: ['REF-024 - Holiday Calendar and Types'], group: 'Basis and references' }),
    parameter('premiumReference', 'Premium-rate source', 'select', 'REF-009 - Holiday Premium Rates', { options: ['REF-009 - Holiday Premium Rates'], group: 'Basis and references' }),
    parameter('locationResolution', 'Holiday location resolution', 'select', 'Employee work location', { options: ['Employee work location', 'Company registered location', 'Assigned holiday group'], group: 'Basis and references' }),
    parameter('workedHoursSource', 'Worked-hours source', 'select', 'Approved timekeeping', { options: ['Approved timekeeping', 'Uploaded hours'], group: 'Basis and references' }),
    parameter('adjacencyRule', 'Apply holiday adjacency eligibility', 'boolean', 'Yes', { group: 'Controls' }),
  ],
  'Leave Balances': [
    parameter('leaveReference', 'Leave-type source', 'select', 'REF-026 - Leave Types and Conversion Rules', { options: ['REF-026 - Leave Types and Conversion Rules'], group: 'Basis and references' }),
    parameter('balanceUnit', 'Balance unit', 'select', 'Days', { options: ['Days', 'Hours'], group: 'Basis and references' }),
    parameter('insufficientBalanceAction', 'Insufficient-balance action', 'select', 'Convert excess to leave without pay', { options: ['Convert excess to leave without pay', 'Block request', 'Raise for approval'], group: 'Controls' }),
    parameter('includePendingRequests', 'Reserve balance for approved pending requests', 'boolean', 'Yes', { group: 'Controls' }),
    parameter('auditTrace', 'Store balance movement trace', 'boolean', 'Yes', { group: 'Validation and notifications' }),
  ],
  'Service Incentive Leave': [
    parameter('leaveReference', 'SIL rule source', 'select', 'REF-026 - Leave Types and Conversion Rules', { options: ['REF-026 - Leave Types and Conversion Rules'], group: 'Basis and references' }),
    parameter('conversionReference', 'Non-taxable ceiling source', 'select', 'REF-006 - De Minimis Ceiling', { options: ['REF-006 - De Minimis Ceiling'], group: 'Basis and references' }),
    parameter('prorationRule', 'First-year proration', 'select', 'Credit after minimum service', { options: ['Credit after minimum service', 'Prorate from hire date'], group: 'Controls' }),
    parameter('convertUnused', 'Convert eligible unused SIL', 'boolean', 'Yes', { group: 'Controls' }),
    parameter('forfeitExcess', 'Forfeit non-carry-forward excess', 'boolean', 'Yes', { group: 'Controls' }),
  ],
  'Leave with Pay': [
    parameter('leaveReference', 'Leave-type source', 'select', 'REF-026 - Leave Types and Conversion Rules', { options: ['REF-026 - Leave Types and Conversion Rules'], group: 'Basis and references' }),
    parameter('earningReference', 'Paid-leave earning source', 'select', 'REF-019 - Earnings and Allowance Codes', { options: ['REF-019 - Earnings and Allowance Codes'], group: 'Basis and references' }),
    parameter('includeInThirteenthMonth', 'Include eligible paid leave in 13th-month basis', 'boolean', 'Yes', { group: 'Tax and classification' }),
    parameter('approvalRequired', 'Require approved leave request', 'boolean', 'Yes', { group: 'Validation and notifications' }),
  ],
  'Leave without Pay': [
    parameter('leaveReference', 'Leave-type source', 'select', 'REF-026 - Leave Types and Conversion Rules', { options: ['REF-026 - Leave Types and Conversion Rules'], group: 'Basis and references' }),
    parameter('factorDaysReference', 'Rate source', 'select', 'REF-010 - Factor Days', { options: ['REF-010 - Factor Days'], group: 'Basis and references' }),
    parameter('includeInAttendanceCap', 'Include in attendance-related take-home cap', 'boolean', 'Yes', { group: 'Controls' }),
    parameter('approvalRequired', 'Require approved unpaid-leave record', 'boolean', 'Yes', { group: 'Validation and notifications' }),
  ],
  'Date and Number Formats': [
    parameter('currencyFormat', 'Currency display', 'select', 'PHP symbol with grouping', { options: ['PHP symbol with grouping', 'PHP code with grouping', 'No currency symbol'], group: 'Controls' }),
    parameter('negativeNumberFormat', 'Negative-number display', 'select', 'Minus sign', { options: ['Minus sign', 'Parentheses'], group: 'Controls' }),
    parameter('thousandSeparator', 'Thousands separator', 'select', 'Comma', { options: ['Comma', 'Space', 'None'], group: 'Controls' }),
  ],
  Allotments: [
    parameter('bankReference', 'Bank-code source', 'select', 'REF-013 - Bank Codes', { options: ['REF-013 - Bank Codes'], group: 'Basis and references' }),
    parameter('allocationMethod', 'Allocation method', 'select', 'Percentage', { options: ['Percentage', 'Fixed Amount'], group: 'Controls' }),
    parameter('requiredTotal', 'Required allocation total', 'percentage', '100', { unit: '%', group: 'Thresholds and values' }),
    parameter('blockOverNetPay', 'Block allotments above net pay', 'boolean', 'Yes', { group: 'Controls' }),
  ],
  'Payslip Rules': [
    parameter('glReference', 'Pay-item and GL label source', 'select', 'REF-014 - General Ledger Mapping', { options: ['REF-014 - General Ledger Mapping'], group: 'Basis and references' }),
    parameter('showDeferredLedger', 'Show original, deducted, deferred, and remaining balances', 'boolean', 'Yes', { group: 'Controls' }),
    parameter('showComputationTrace', 'Show calculation explanation', 'boolean', 'Yes', { group: 'Controls' }),
    parameter('deliveryChannel', 'Delivery channel', 'select', 'Employee portal and email', { options: ['Employee portal', 'Email', 'Employee portal and email'], group: 'Controls' }),
  ],
  'Connected Systems': [
    parameter('authenticationMethod', 'Authentication method', 'select', 'Managed integration credential', { options: ['Managed integration credential', 'OAuth 2.0', 'SFTP key'], group: 'Controls' }),
    parameter('retryCount', 'Automatic retry count', 'number', '3', { group: 'Controls' }),
    parameter('auditTrace', 'Store request, response, and reconciliation trace', 'boolean', 'Yes', { group: 'Validation and notifications' }),
  ],
  'Deferred Deductions': [
    parameter('recordOriginalDue', 'Record original amount due', 'boolean', 'Yes', { group: 'Deferral and ledger' }),
    parameter('recordDeductedAmount', 'Record amount deducted', 'boolean', 'Yes', { group: 'Deferral and ledger' }),
    parameter('recordAccumulatedDeferred', 'Record accumulated deferred amount', 'boolean', 'Yes', { group: 'Deferral and ledger' }),
    parameter('recordReasonAndDate', 'Record reason and rescheduled date', 'boolean', 'Yes', { group: 'Deferral and ledger' }),
    parameter('showRemainingBalance', 'Show remaining balance', 'boolean', 'Yes', { group: 'Deferral and ledger' }),
  ],
};

const fallbackTemplates = {
  Earnings: [parameter('amount', 'Amount', 'currency', '0', { unit: 'PHP' }), parameter('frequency', 'Frequency', 'select', 'Every Payroll', { options: ['Every Payroll', 'First Half', 'Second Half', 'Monthly'] })],
  Deductions: [parameter('amount', 'Amount', 'currency', '0', { unit: 'PHP' }), parameter('priority', 'Priority', 'number', '1'), parameter('carryForward', 'Carry forward shortfall', 'boolean', 'Yes')],
  Tax: [parameter('rate', 'Tax rate', 'percentage', '0', { unit: '%' }), parameter('effectiveDate', 'Effective date', 'date', '')],
  Time: [parameter('basis', 'Policy basis', 'text', ''), parameter('effectiveDate', 'Effective date', 'date', '')],
  Leave: [parameter('rate', 'Policy rate', 'number', '0'), parameter('effectiveDate', 'Effective date', 'date', '')],
  Government: [parameter('effectiveDate', 'Effective date', 'date', ''), parameter('applyInFull', 'Apply in full', 'boolean', 'Yes')],
  Compliance: [parameter('effectiveDate', 'Effective date', 'date', ''), parameter('blockOnFailure', 'Block on validation failure', 'boolean', 'Yes')],
  Payroll: [parameter('effectiveDate', 'Effective date', 'date', ''), parameter('approvalRequired', 'Approval required', 'boolean', 'Yes')],
};

export const parameterTypes = ['currency', 'percentage', 'number', 'boolean', 'select', 'text', 'date'];

export function toParameterKey(label) {
  return String(label || '').trim().replace(/[^a-zA-Z0-9]+(.)/g, (_, character) => character.toUpperCase()).replace(/^[A-Z]/, character => character.toLowerCase());
}

/**
 * Several governed codes can sit on one engine, each owning a different part of
 * it — a company has one take-home policy, but THP-001 governs its protected
 * minimum while THP-002 governs the deduction and loan caps. Without this,
 * every code on a sub-category would advertise the engine's full parameter set
 * and look like a duplicate of its siblings.
 */
export const codeParameterScopes = {
  // `enabled` is the engine's own on/off switch, shared by every code on the
  // engine, so it is not counted as a parameter any single code governs.
  'THP-001': { governs: 'Protected minimum net pay', keys: ['employeeGroup', 'base', 'thresholdType', 'threshold', 'autoDefer', 'carryForward', 'payslipTagging', 'notifyEmployee'] },
  'THP-002': { governs: 'Deduction, loan and attendance caps', keys: ['employeeGroup', 'priorityChoice', 'deductionCapEnabled', 'deductionCapBase', 'deductionCapType', 'deductionCap', 'loanCapBase', 'loanCapType', 'loanCap', 'attendanceCapBase', 'attendanceCapType', 'attendanceCap'] },
  'DEF-001': { governs: 'Carry-forward and staggered recovery of outstanding amounts', keys: ['carryForward', 'notifyEmployee', 'method', 'frequency', 'installments', 'fixedAmount', 'staggerThreshold', 'requiresApproval', 'approvalRole', 'authorization', 'notificationChannel', 'keepOriginalDueDate'] },
  'RET-001': { governs: 'Statutory eligibility and benefit basis', keys: ['employeeGroup', 'salaryBasis', 'dailyRateDivisor', 'statutoryDays', 'minimumAge', 'compulsoryAge', 'minimumServiceYears', 'rounding'] },
  'RET-002': { governs: 'Company plan and more-beneficial comparison', keys: ['planType', 'companyDays', 'additionalBenefits', 'earlyRetirementAge', 'minimumGuarantee', 'maximumCap', 'taxExemption', 'companyPlanApproved'] },
  'RET-003': { governs: 'Retirement salary basis and service history', keys: ['salaryBasisSource', 'salaryBasisEarnings', 'serviceHistoryRule'] },
  'FIN-001': { governs: 'Final pay components, earnings and offsets', keys: ['employeeGroup', 'includeUnpaidSalary', 'includeProratedThirteenth', 'includeSILConversion', 'includeSeparationPay', 'includeRetirementPay', 'includeFinalTax', 'includeConvertibleLeave', 'includeCashBondReturn', 'includeGratuity', 'includedEarnings', 'includedDeductions', 'autoOffsetDeductions', 'negativeNetPayRule'] },
  'FIN-002': { governs: 'Separation pay by reason for leaving', keys: ['separationRules', 'leaveConversionRule', 'dailyRateDivisor'] },
  'FIN-003': { governs: 'Final pay hierarchy and statutory treatment', keys: ['hierarchySource', 'statutoryRule', 'governmentLoanRule', 'companyLoanRule', 'advanceThirteenthRule', 'lastCutoffRule', 'notifyAdmin'] },
  'GUP-001': { governs: 'Guaranteed net and tax method' },
};

const inferGroup = key => {
  const tokens = String(key).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const has = (...values) => values.some(value => tokens.includes(value));
  if (has('reference', 'source', 'code', 'table')) return 'Basis and references';
  if (has('defer', 'deferred', 'carry', 'ledger', 'reschedule', 'balance', 'offset')) return 'Deferral and ledger';
  if (has('notify', 'notification', 'alert', 'validation', 'audit', 'trace', 'approval')) return 'Validation and notifications';
  if (has('threshold', 'ceiling', 'cap', 'minimum', 'maximum', 'rate', 'amount', 'value')) return 'Thresholds and values';
  if (has('effective', 'period', 'start', 'end', 'date', 'frequency')) return 'Effective period';
  if (has('basis', 'base', 'type')) return 'Basis and references';
  return 'Controls';
};

const cloneSchema = schema => schema.map(item => ({
  ...item,
  group: item.group || inferGroup(item.key),
  options: item.options ? [...item.options] : [],
}));

const mergeSchema = (base = [], additions = []) => {
  const byKey = new Map(base.map(item => [item.key, { ...item }]));
  additions.forEach(item => byKey.set(item.key, { ...(byKey.get(item.key) || {}), ...item }));
  return cloneSchema([...byKey.values()]);
};

/** Returns the complete governed template for a sub-category, ignoring a standard code's narrower ownership scope. */
export function completeParameterSchema(record = {}) {
  const selected = templates[record.subcategory] || fallbackTemplates[record.engine] || [parameter('value', 'Policy value', 'text', '')];
  return mergeSchema(selected, annexParameterAdditions[record.subcategory] || []);
}

export function defaultParameterSchema(record) {
  const selected = completeParameterSchema(record);
  const scope = codeParameterScopes[record.code]?.keys;
  const scoped = scope ? selected.filter(item => scope.includes(item.key)) : selected;
  return cloneSchema(scoped.length ? scoped : selected);
}

export function hydratePolicyCode(record) {
  const governed = Boolean(record.isBuiltIn || record.templateCode || codeParameterScopes[record.code]);
  const expected = record.templateCode ? completeParameterSchema(record) : defaultParameterSchema(record);
  const saved = record.parameterSchema?.length ? cloneSchema(record.parameterSchema) : [];
  const schema = governed ? mergeSchema(expected, saved) : (saved.length ? saved : expected);
  return {
    ...record,
    parameterSchema: schema,
    parameterValues: { ...defaultParameterValues(schema), ...(record.parameterValues || {}) },
  };
}

export function defaultParameterValues(schema = []) {
  return Object.fromEntries(schema.map(item => [item.key, item.defaultValue ?? '']));
}

export function parameterSchemaError(schema = []) {
  if (!schema.length) return 'Add at least one parameter so the code can be configured when assigned.';
  if (schema.some(item => !item.label?.trim() || !item.key)) return 'Complete every parameter label.';
  if (new Set(schema.map(item => item.key)).size !== schema.length) return 'Parameter labels must create unique keys.';
  if (schema.some(item => item.type === 'select' && !item.options?.length)) return 'Add at least one option for every selection parameter.';
  return '';
}

function ParameterValueInput({ item, value, onChange }) {
  if (item.type === 'boolean') return <select value={value ?? item.defaultValue ?? 'No'} onChange={event => onChange(event.target.value)}><option>Yes</option><option>No</option></select>;
  if (item.type === 'select') return <select value={value ?? item.defaultValue ?? ''} onChange={event => onChange(event.target.value)} required={item.required}><option value="">Please select</option>{(item.options || []).map(option => <option key={option}>{option}</option>)}</select>;
  return <div className="parameter-value-input"><input type={item.type === 'date' ? 'date' : ['currency', 'percentage', 'number'].includes(item.type) ? 'number' : 'text'} step={['currency', 'percentage', 'number'].includes(item.type) ? '0.01' : undefined} min={item.min} max={item.max} value={value ?? item.defaultValue ?? ''} onChange={event => onChange(event.target.value)} required={item.required} />{item.unit && <span>{item.unit}</span>}</div>;
}

export function PolicyParameterFields({ schema = [], values = {}, onChange }) {
  const groups = [...new Set(schema.map(item => item.group || inferGroup(item.key)))];
  return <div className="policy-parameter-groups">{groups.map(group => <section className="policy-parameter-group" key={group}><header><strong>{group}</strong><span>{schema.filter(item => (item.group || inferGroup(item.key)) === group).length} field{schema.filter(item => (item.group || inferGroup(item.key)) === group).length === 1 ? '' : 's'}</span></header><div className="policy-parameter-fields">{schema.filter(item => (item.group || inferGroup(item.key)) === group).map(item => <label key={item.key}>{item.label}{item.required && <span className="required">*</span>}<ParameterValueInput item={item} value={values[item.key]} onChange={value => onChange({ ...values, [item.key]: value })} /><small>{item.help || (item.type === 'currency' ? 'Currency amount' : item.type === 'percentage' ? 'Percentage value' : item.type === 'boolean' ? 'Yes or no' : item.type === 'select' ? 'Controlled selection' : item.type)}</small></label>)}</div></section>)}</div>;
}

export function PolicyParameterBuilder({ schema, onChange }) {
  const add = () => onChange([...schema, parameter(`parameter${schema.length + 1}`, `Parameter ${schema.length + 1}`, 'number', '0')]);
  const update = (index, changes) => onChange(schema.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const remove = index => onChange(schema.filter((_, itemIndex) => itemIndex !== index));
  return <div className="parameter-builder">
    <div className="parameter-builder-heading"><div><strong>Parameter schema</strong><span>Define what administrators must configure whenever this code is assigned.</span></div><button type="button" className="button secondary" onClick={add}><Plus /> Add parameter</button></div>
    {schema.map((item, index) => <div className="parameter-builder-row" key={`${item.key}-${index}`}>
      <label>Label<input value={item.label} onChange={event => { const label = event.target.value; update(index, { label, key: toParameterKey(label) || item.key }); }} required /></label>
      <label>Type<select value={item.type} onChange={event => update(index, { type: event.target.value, options: event.target.value === 'select' ? item.options || [] : [] })}>{parameterTypes.map(type => <option key={type}>{type}</option>)}</select></label>
      <label>{item.type === 'select' ? 'Options' : 'Default value'}<input value={item.type === 'select' ? (item.options || []).join(', ') : item.defaultValue ?? ''} onChange={event => update(index, item.type === 'select' ? { options: event.target.value.split(',').map(value => value.trim()).filter(Boolean), defaultValue: '' } : { defaultValue: event.target.value })} placeholder={item.type === 'select' ? 'Option A, Option B' : 'Optional'} /></label>
      <label>Unit<input value={item.unit || ''} onChange={event => update(index, { unit: event.target.value })} placeholder="PHP, %, days" /></label>
      <label className="parameter-required"><input type="checkbox" checked={item.required !== false} onChange={event => update(index, { required: event.target.checked })} /> Required</label>
      <button type="button" className="icon-button" onClick={() => remove(index)} aria-label={`Remove ${item.label}`}><Trash /></button>
    </div>)}
    {!schema.length && <div className="parameter-builder-empty"><p>No parameters defined. Add at least one configuration input for this code.</p></div>}
  </div>;
}
