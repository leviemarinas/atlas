const roleLabels = {
  employee: 'Employee',
  approver: 'Approver',
  client_admin: 'Client Admin',
  pa_admin: 'P&A Admin',
};

const step = (screen, action, detail, result = '') => ({ screen, action, detail, result });

function scenario(id, role, category, title, want, value, steps, tags = []) {
  const article = role === 'employee' || role === 'approver' ? 'an' : 'a';
  return {
    id,
    role,
    roleLabel: roleLabels[role],
    category,
    title,
    story: `As ${article} ${roleLabels[role]}, I want to ${want} so that ${value}.`,
    value,
    steps,
    tags,
  };
}

export const SCENARIOS = [
  scenario('emp-payslip', 'employee', 'Payroll inquiry', 'View my latest payslip', 'open my posted payslip and its earnings, deductions, and net pay', 'I can verify that I was paid correctly', [
    step('HRM', 'Open Employee Self-Inquiry', 'Select Payslips & Payroll History.'),
    step('Payslip history', 'Select 15 August 2026', 'Atlas opens the latest posted payroll result.'),
    step('Payslip', 'Expand How it was computed', 'Trace basic pay, attendance, statutory items, tax, loans, and company deductions to their source codes.'),
    step('Payslip', 'Download payslip', 'Generate the employee copy.', 'Payslip downloaded'),
  ], ['payslip', 'computation', 'download']),
  scenario('emp-payslip-history', 'employee', 'Payroll inquiry', 'Compare payroll history', 'review prior posted and locked payroll periods', 'I can understand changes in my take-home pay', [
    step('HRM', 'Open Employee Self-Inquiry', 'Choose Payslips & Payroll History.'),
    step('Payroll history', 'Filter by 2026', 'Atlas lists only employee-visible posted or locked runs.'),
    step('Payroll history', 'Compare July and August', 'Gross pay, deductions, and net movement are shown side by side.'),
    step('Payroll history', 'Open August details', 'Navigate to the selected payslip.', 'Comparison ready'),
  ], ['history', 'payslip']),
  scenario('emp-leave', 'employee', 'Employee request', 'File a leave application', 'submit leave with dates, type, reason, and supporting file', 'my manager can review a complete request', [
    step('HRM', 'Open Employee Self-Service', 'Select Leave Application.'),
    step('Leave Application', 'Click Apply', 'Enter leave type, coverage, reason, and attachment.'),
    step('Review application', 'Submit request', 'Atlas validates the balance and routes it to the employee’s line manager.'),
    step('My applications', 'View Pending request', 'The request and approval trail are visible.', 'Leave request submitted'),
  ], ['leave', 'approval', 'attachment']),
  scenario('emp-overtime', 'employee', 'Timekeeping request', 'File an overtime request', 'request overtime against the correct date and hours', 'approved hours can flow into payroll', [
    step('Timekeeping', 'Open Overtime Application', 'Start a new overtime request.'),
    step('Overtime Application', 'Enter date and hours', 'Select overtime type and add the business reason.'),
    step('Review application', 'Submit request', 'Atlas routes the request to the assigned approver.'),
    step('My overtime', 'View Pending status', 'The request is ready for review.', 'Overtime request submitted'),
  ], ['overtime', 'timekeeping', 'payroll input']),
  scenario('emp-time-correction', 'employee', 'Timekeeping request', 'Correct a missing punch', 'submit a time-record correction with evidence', 'my attendance and payroll use an accurate source record', [
    step('Timekeeping', 'Open Time Correction', 'Select the day with a missing time-out.'),
    step('Time Correction', 'Enter corrected time', 'Add the reason and supporting attachment.'),
    step('Review correction', 'Submit request', 'Atlas preserves the original log and starts approval.'),
    step('My corrections', 'View audit trail', 'Original and proposed values remain traceable.', 'Correction submitted'),
  ], ['attendance', 'audit', 'approval']),
  scenario('emp-shift', 'employee', 'Timekeeping request', 'Request a shift change', 'ask to move to another available schedule', 'my manager can assess coverage before approving it', [
    step('HRM', 'Open Shift Change', 'Create a new application.'),
    step('Shift Change', 'Choose target schedule', 'Set effectivity and explain the request.'),
    step('Review application', 'Submit request', 'Atlas routes it to the employee’s manager.'),
    step('My applications', 'View Pending request', 'The requested schedule and dates are visible.', 'Shift change submitted'),
  ], ['shift', 'schedule', 'approval']),
  scenario('emp-loan', 'employee', 'Loan management', 'Apply for a company loan', 'request a loan with a payroll repayment plan', 'I can see the proposed deduction before committing', [
    step('HRM', 'Open Company Loan', 'Click Apply.'),
    step('Company Loan', 'Enter amount and purpose', 'Choose cutoff, deduction amount, mode, and frequency.'),
    step('Repayment preview', 'Review schedule', 'Atlas shows installments before submission.'),
    step('Company Loan', 'Submit application', 'Interest remains pending until the approver decides.', 'Loan application submitted'),
  ], ['loan', 'deduction', 'schedule']),
  scenario('emp-loan-inquiry', 'employee', 'Payroll inquiry', 'Inspect my loan deduction matrix', 'see each installment and remaining balance', 'I can reconcile deductions on my payslip', [
    step('HRM', 'Open Employee Self-Inquiry', 'Select Loan Inquiry.'),
    step('Loan Inquiry', 'Open active company loan', 'Show principal, interest, total, and status.'),
    step('Loan details', 'View Deduction Matrix', 'Review every cutoff, paid amount, and balance.'),
    step('Loan details', 'Match latest installment', 'Atlas links the latest deduction to payroll.', 'Loan balance reconciled'),
  ], ['loan', 'deduction', 'inquiry']),
  scenario('emp-coe', 'employee', 'Certificate request', 'Request a Certificate of Employment', 'submit the intended recipient and purpose', 'HR can generate the right certificate', [
    step('HRM', 'Open Certificate Requests', 'Choose Certificate of Employment.'),
    step('COE Request', 'Click Request', 'Enter purpose, institution, and recipient address.'),
    step('Review request', 'Submit', 'Atlas routes the request to COE approval.'),
    step('My requests', 'View Pending status', 'Certificate preparation status is visible.', 'COE request submitted'),
  ], ['certificate', 'document', 'approval']),
  scenario('emp-benefits', 'employee', 'Benefits', 'Review my benefits and allowances', 'see active, upcoming, and expired assignments', 'I understand what the company currently provides', [
    step('HRM', 'Open Benefits', 'Select Employee Benefits.'),
    step('My Benefits', 'Open benefit details', 'Display plan, coverage, effectivity, and status.'),
    step('Benefit details', 'Switch to Upcoming', 'Show benefits not yet active.'),
    step('Benefit details', 'Switch to Expired', 'Show historical assignments.', 'Benefits reviewed'),
  ], ['benefits', 'allowance', 'inquiry']),
  scenario('emp-leave-ledger', 'employee', 'Employee inquiry', 'Review my leave balance and ledger', 'see accrued, used, pending, converted, and forfeited credits', 'I know what I can still file', [
    step('HRM', 'Open Employee Self-Inquiry', 'Select Leave Balances & Ledger.'),
    step('Leave Balance', 'Review balance matrix', 'Atlas derives today’s balance for every leave type.'),
    step('Leave Balance', 'Open Vacation Leave', 'Show the chronological movement ledger.'),
    step('Leave ledger', 'Inspect conversion entry', 'Converted credits reduce the balance once.', 'Leave balance verified'),
  ], ['leave', 'ledger', 'balance']),
  scenario('emp-attendance', 'employee', 'Employee inquiry', 'Review my attendance summary', 'inspect daily records, tardiness, undertime, and worked hours', 'I can catch issues before payroll closes', [
    step('HRM', 'Open Employee Self-Inquiry', 'Select Attendance Summary.'),
    step('Attendance Summary', 'Choose payroll cutoff', 'Load the selected period.'),
    step('Attendance Summary', 'Open Tardiness / Undertime', 'Show minute-level exceptions.'),
    step('Attendance Summary', 'Open Worked Hours Per Day', 'Reconcile rendered workdays and hours.', 'Attendance reviewed'),
  ], ['attendance', 'timekeeping', 'cutoff']),
  scenario('emp-clearance', 'employee', 'Offboarding', 'Complete my clearance checklist', 'submit required offboarding evidence', 'the company can review and release my final documents', [
    step('HRM', 'Open Employee Offboarding', 'Select Clearance Application.'),
    step('Clearance Application', 'Open assigned checklist', 'Review required department clearances.'),
    step('Clearance Checklist', 'Upload proof', 'Attach evidence to an incomplete item.'),
    step('Clearance Checklist', 'Submit for review', 'Atlas moves the case to For Review.', 'Clearance submitted'),
  ], ['offboarding', 'clearance', 'attachment']),

  scenario('apr-leave-approve', 'approver', 'Approvals', 'Approve a team leave request', 'review dates, balance, conflicts, and evidence before approving', 'staffing and employee records stay aligned', [
    step('HRM', 'Open Management & Approvals', 'Select Leave Approval.'),
    step('Leave Approval', 'Open pending request', 'Review employee, dates, balance, and attachment.'),
    step('Approval modal', 'Enter approver remarks', 'Confirm the decision.'),
    step('Leave Approval', 'Click Approve', 'Atlas updates the request and approval log.', 'Leave approved'),
  ], ['leave', 'approve', 'team']),
  scenario('apr-leave-reject', 'approver', 'Approvals', 'Reject an incomplete leave request', 'return a request with a clear reason', 'the employee knows what must be corrected', [
    step('HRM', 'Open Management & Approvals', 'Select Leave Approval.'),
    step('Leave Approval', 'Open pending request', 'The supporting document is missing.'),
    step('Reject Request', 'Enter rejection remarks', 'Explain the missing requirement.'),
    step('Reject Request', 'Confirm Reject', 'Atlas notifies the employee.', 'Leave rejected'),
  ], ['leave', 'reject', 'notification']),
  scenario('apr-overtime', 'approver', 'Approvals', 'Approve overtime for payroll', 'validate requested hours against attendance', 'only authorized overtime reaches payroll', [
    step('Timekeeping', 'Open Overtime Approval', 'Filter to Pending.'),
    step('Overtime Approval', 'Open employee request', 'Compare requested time with the daily log.'),
    step('Approval modal', 'Adjust approved hours', 'Add a decision remark.'),
    step('Overtime Approval', 'Approve', 'The approved input is available to payroll.', 'Overtime approved'),
  ], ['overtime', 'approve', 'payroll input']),
  scenario('apr-time-correction', 'approver', 'Approvals', 'Decide a time correction', 'compare the original punch with the submitted evidence', 'the authoritative time record remains auditable', [
    step('Timekeeping', 'Open Time Correction Approval', 'Select a pending correction.'),
    step('Correction detail', 'Compare original and proposed values', 'Review employee evidence.'),
    step('Decision', 'Approve correction', 'Atlas keeps both versions in the audit trail.'),
    step('Attendance record', 'View corrected day', 'The approved record is now used by payroll.', 'Time record corrected'),
  ], ['attendance', 'approve', 'audit']),
  scenario('apr-shift-assign', 'approver', 'Team management', 'Assign a subordinate’s shift', 'create an effective-dated shift assignment', 'the team schedule reflects operational coverage', [
    step('HRM', 'Open Shift Assignment', 'Click Assign.'),
    step('Assign Shift', 'Choose employee and schedule', 'Set start and optional end date.'),
    step('Review assignment', 'Save', 'Atlas validates schedule overlap.'),
    step('Shift Assignment', 'View Active tab', 'The assignment appears in its derived status.', 'Shift assigned'),
  ], ['shift', 'assignment', 'team']),
  scenario('apr-expense', 'approver', 'Expense approvals', 'Approve a reimbursement', 'review each receipt and derived total', 'valid employee expenses can be paid', [
    step('HRM', 'Open Expense Management', 'Select Reimbursement Approval.'),
    step('Reimbursement Approval', 'Open pending transaction', 'Review line items, receipts, and derived total.'),
    step('Decision', 'Enter remarks', 'Confirm the reimbursable amount.'),
    step('Reimbursement Approval', 'Approve', 'Atlas updates the transaction in place.', 'Status updated successfully!'),
  ], ['expense', 'approve', 'receipt']),
  scenario('apr-cash-advance', 'approver', 'Expense approvals', 'Reject a cash advance', 'review purpose, amount, and outstanding advances', 'duplicate or unsupported requests do not proceed', [
    step('HRM', 'Open Expense Management', 'Select Cash Advance Approval.'),
    step('Cash Advance Approval', 'Open pending request', 'Review purpose and current exposure.'),
    step('Decision', 'Enter rejection remarks', 'State the policy conflict.'),
    step('Cash Advance Approval', 'Reject', 'Atlas updates the transaction.', 'Status updated successfully!'),
  ], ['expense', 'reject', 'cash advance']),
  scenario('apr-company-loan', 'approver', 'Loan approvals', 'Approve a company loan with interest', 'set the approved interest rate and repayment terms', 'the borrower receives a complete loan schedule', [
    step('HRM', 'Open Company Loan Approval', 'Select a pending loan.'),
    step('Loan detail', 'Review principal and repayment proposal', 'Verify payroll cutoff and deduction amount.'),
    step('Approve Loan', 'Enter interest rate', 'Atlas derives interest amount and total loan.'),
    step('Approve Loan', 'Confirm', 'The deduction matrix becomes active.', 'Company loan approved'),
  ], ['loan', 'interest', 'approve']),
  scenario('apr-government-loan', 'approver', 'Loan approvals', 'Approve an encoded government loan', 'review agency-provided terms without recalculating interest', 'the external loan is safely enrolled for deduction', [
    step('HRM', 'Open Government Loan Approval', 'Select a pending encoded loan.'),
    step('Loan detail', 'Review agency terms', 'Verify reference, total, dates, and payment schedule.'),
    step('Approve Loan', 'Enter remarks', 'No interest field is requested.'),
    step('Approve Loan', 'Confirm', 'The government loan becomes active.', 'Government loan approved'),
  ], ['loan', 'government', 'approve']),
  scenario('apr-resignation', 'approver', 'Employee requests', 'Bulk approve resignations', 'decide multiple complete requests with BIR separation reasons', 'offboarding can begin without repetitive processing', [
    step('HRM', 'Open Employee Requests Management', 'Select Resignation Approval.'),
    step('Resignation Approval', 'Select complete requests', 'Atlas shows the bulk action bar.'),
    step('Bulk Approve', 'Choose BIR separation reasons', 'Add approver remarks for each decision.'),
    step('Bulk Approve', 'Confirm', 'Approved cases move to offboarding.', 'Resignations approved'),
  ], ['resignation', 'bulk', 'approve']),
  scenario('apr-coe', 'approver', 'Employee requests', 'Add and approve a COE', 'prepare the certificate before deciding the request', 'the employee receives a verified document', [
    step('HRM', 'Open COE Request Approval', 'Open a pending request without an attachment.'),
    step('COE Request', 'Click Add COE', 'Choose System-generated and review employee details.'),
    step('Certificate preview', 'Attach generated COE', 'Pending actions now include Approve and Reject.'),
    step('COE Request', 'Approve', 'Atlas records the certificate and decision.', 'COE approved'),
  ], ['certificate', 'document', 'approve']),
  scenario('apr-onboarding-doc', 'approver', 'Employee requests', 'Review onboarding documents', 'approve or reject job descriptions and employment contracts', 'employee records contain verified documents', [
    step('HRM', 'Open Onboarding Documents', 'Choose Employment Contracts.'),
    step('Pending documents', 'Open document preview', 'Review the submitted contract.'),
    step('Approve Request', 'Enter remarks and continue', 'Atlas shows a confirmation card.'),
    step('Approve Request', 'Confirm approval', 'The document moves to Approved.', 'Status updated successfully!'),
  ], ['onboarding', 'document', 'approve']),
  scenario('apr-clearance', 'approver', 'Offboarding', 'Approve completed clearance', 'review every checklist item and attachment', 'final pay and release activities can proceed', [
    step('HRM', 'Open Clearance Approval', 'Filter to For Review.'),
    step('Clearance Approval', 'Open checklist', 'Verify completed items and file previews.'),
    step('Approve Clearance', 'Enter remarks', 'Confirm the checklist is complete.'),
    step('Approve Clearance', 'Approve', 'Atlas advances the offboarding case.', 'Clearance approved'),
  ], ['clearance', 'offboarding', 'approve']),
  scenario('apr-team-attendance', 'approver', 'Team inquiry', 'Review subordinate attendance', 'drill into team tardiness, undertime, and worked hours', 'I can resolve exceptions before cutoff', [
    step('HRM', 'Open Attendance Summary', 'View the subordinate roster.'),
    step('Attendance Summary', 'Choose employee', 'Open the selected period.'),
    step('Employee attendance', 'Open Tardiness / Undertime', 'Inspect exception rows.'),
    step('Employee attendance', 'Open Daily Time Records', 'Verify the underlying punches.', 'Team attendance reviewed'),
  ], ['attendance', 'team', 'inquiry']),

  scenario('client-company', 'client_admin', 'Company setup', 'Onboard a company record', 'complete company, bank, service, contact, and signatory setup', 'Atlas has the governed context needed for payroll', [
    step('Core', 'Open Company Configuration', 'Start Company Information.'),
    step('Company Information', 'Complete setup sections', 'Add profile, bank, services, contacts, and signatories.'),
    step('Review setup', 'Check completion', 'Atlas derives section progress from saved records.'),
    step('Company Information', 'Save company', 'The company becomes selectable across modules.', 'Company saved'),
  ], ['company', 'onboarding', 'configuration']),
  scenario('client-employee', 'client_admin', 'Employee masterfile', 'Add an employee payroll record', 'maintain one employee identity with salary, government, bank, and YTD data', 'HRM, timekeeping, and payroll read the same 201 file', [
    step('Core', 'Open Employee Masterfile', 'Click Add Employee.'),
    step('Employee Masterfile', 'Complete identity and employment', 'Add group, department, hire date, and work status.'),
    step('Payroll details', 'Add salary and government settings', 'Configure frequency, statutory switches, tax, bank, and YTD.'),
    step('Review employee', 'Save', 'The employee appears in every scoped roster.', 'Employee saved'),
  ], ['employee', 'masterfile', '201']),
  scenario('client-earning', 'client_admin', 'Payroll setup', 'Add a recurring earning', 'define an earning and assign it to employees', 'eligible payroll lines include the governed amount', [
    step('Payroll', 'Open Earning Management', 'Click Add.'),
    step('Add Earning', 'Define earning code', 'Set tax, contribution, retirement, frequency, and effectivity.'),
    step('Applicability', 'Select employees', 'Assign the earning to an employee scope.'),
    step('Review earning', 'Save', 'The active earning becomes a payroll input.', 'Earning added'),
  ], ['earning', 'configuration', 'payroll input']),
  scenario('client-deduction', 'client_admin', 'Payroll setup', 'Add a company deduction', 'configure priority, cap, authority, and employee scope', 'payroll collects only authorized amounts', [
    step('Payroll', 'Open Deduction Management', 'Click Add.'),
    step('Add Deduction', 'Define code and amount', 'Set priority, cap, frequency, balance, and authority status.'),
    step('Applicability', 'Select employees', 'Choose group, department, or specific employees.'),
    step('Review deduction', 'Save', 'The deduction is ready for payroll evaluation.', 'Deduction added'),
  ], ['deduction', 'configuration', 'authority']),
  scenario('client-bonus', 'client_admin', 'Payroll setup', 'Schedule a bonus', 'create an effective-dated bonus with tax treatment', 'the correct payroll period includes the award', [
    step('Payroll', 'Open Bonus Management', 'Click Add.'),
    step('Add Bonus', 'Enter award details', 'Set date, amount, threshold treatment, and recipients.'),
    step('Review bonus', 'Validate recipients', 'Atlas checks employees against the master roster.'),
    step('Bonus Management', 'Save as Scheduled', 'The bonus becomes available to its payout.', 'Bonus scheduled'),
  ], ['bonus', 'tax', 'schedule']),
  scenario('client-payroll-create', 'client_admin', 'Payroll processing', 'Create a regular payroll', 'select a payout calendar and import governed inputs', 'a complete transaction can be reviewed before approval', [
    step('Payroll', 'Open Payroll Processing', 'Click Add Payroll.'),
    step('Add Payroll · Setup', 'Choose Regular and payout calendar', 'Atlas fills payroll period and timekeeping cutoff.'),
    step('Add Payroll · Inputs', 'Select employees and calculations', 'Import timekeeping, earnings, deductions, loans, and statutory settings.'),
    step('Add Payroll · Review', 'Create transaction', 'Atlas calculates each employee and opens the run.', 'Payroll created'),
  ], ['payroll', 'create', 'calendar']),
  scenario('client-payroll-edit', 'client_admin', 'Payroll processing', 'Edit earnings and deductions in a payroll', 'adjust one employee line with a reason', 'an exceptional but authorized amount is traceable', [
    step('Payroll Processing', 'Open Draft transaction', 'Select an employee row.'),
    step('Employee payroll', 'Click Edit this line', 'Open earnings, deductions, tax, and contribution controls.'),
    step('Edit payroll line', 'Add one-time earning and deduction', 'Enter amounts and the adjustment reason.'),
    step('Edit payroll line', 'Save and recalculate', 'Atlas updates the line and computation trail.', 'Payroll line updated'),
  ], ['payroll', 'earning', 'deduction', 'recalculate']),
  scenario('client-payroll-review', 'client_admin', 'Payroll processing', 'Review payroll exceptions', 'resolve held employees, missing authority, negative net, and source-data issues', 'the approval package contains no unexplained exceptions', [
    step('Payroll Processing', 'Open transaction', 'Filter employees with exceptions.'),
    step('Exception queue', 'Open held employee', 'Review hold reason and excluded calculations.'),
    step('Exception queue', 'Open unauthorized loan', 'Atlas shows that collection was withheld.'),
    step('Payroll Processing', 'Resolve or document exceptions', 'The run is ready for review.', 'Exceptions reviewed'),
  ], ['payroll', 'exceptions', 'validation']),
  scenario('client-payroll-approve', 'client_admin', 'Payroll processing', 'Approve and post payroll', 'advance a reviewed transaction through approval and posting', 'employee payslips and downstream records use final results', [
    step('Payroll Processing', 'Open For Approval transaction', 'Review totals and control counts.'),
    step('Payroll transaction', 'Approve', 'Atlas records the actor and timestamp.'),
    step('Approved payroll', 'Post payroll', 'The result becomes the source for payslips, remittance, journal, and reports.'),
    step('Posted payroll', 'Lock record', 'Prevent later edits while preserving history.', 'Payroll posted and locked'),
  ], ['payroll', 'approve', 'post', 'lock']),
  scenario('client-policy', 'client_admin', 'Policy engine', 'Change the take-home pay policy', 'update protected minimum, deduction caps, and conflict priority', 'the next calculation protects employees under the approved rule', [
    step('Core', 'Open Company Configuration', 'Open Services Information.'),
    step('Computational Basis', 'Open Policy Engines', 'Select Take-Home Pay.'),
    step('Take-Home Pay policy', 'Change protected minimum and priority', 'Keep statutory items ranked and define defer/carry-forward behavior.'),
    step('Policy simulator', 'Run impacted employees', 'Atlas compares before and after net pay and deferred deductions.', 'Policy impact calculated'),
  ], ['policy engine', 'take-home pay', 'impact']),
  scenario('client-rule', 'client_admin', 'Company rules', 'Apply a governed company rule', 'map a rule to a policy code and employee scope', 'company behavior stays traceable to reusable logic', [
    step('Payroll', 'Open Policy Management', 'Select the versioned payroll policy register.'),
    step('Policy Management', 'Click Add Policy', 'Enter policy details, activation, effective period, and sub-category.'),
    step('Policy mapping', 'Select policy-engine code', 'Enter only the parameters governed by that code.'),
    step('Review rule', 'Apply', 'Atlas saves the assignment and audit event.', 'Company rule applied'),
  ], ['company rule', 'policy code', 'assignment']),
  scenario('client-retirement', 'client_admin', 'Policy engine', 'Run retirement pay', 'calculate statutory and company-plan results for eligible employees', 'the more beneficial governed amount is selected transparently', [
    step('Policy Engines', 'Open Retirement Pay', 'Review plan, eligibility, salary basis, and service rules.'),
    step('Retirement transaction', 'Select employees', 'Choose engine calculation as the transaction method.'),
    step('Retirement transaction', 'Run computation', 'Atlas evaluates each employee individually.'),
    step('Results', 'Compare statutory and company values', 'The selected result and tax treatment remain visible.', 'Retirement pay calculated'),
  ], ['retirement', 'policy engine', 'calculation']),
  scenario('client-final-pay', 'client_admin', 'Policy engine', 'Calculate final pay', 'combine separation rules, leave conversion, retirement, and offsets', 'a departing employee receives a complete final settlement', [
    step('Policy Engines', 'Open Final Pay', 'Review reason-driven rules and hierarchy source.'),
    step('Final Pay transaction', 'Select separating employee', 'Atlas reads the employee’s reason and last payroll context.'),
    step('Final Pay transaction', 'Run computation', 'Consume linked retirement result and approved leave conversion.'),
    step('Final Pay result', 'Review components and approval', 'Atlas flags negative-net and release conditions.', 'Final pay calculated'),
  ], ['final pay', 'offboarding', 'calculation']),
  scenario('client-gross-up', 'client_admin', 'Policy engine', 'Gross up a target net payment', 'solve gross pay using effective tax and contribution rules', 'the employee receives the intended net amount', [
    step('Policy Engines', 'Open Gross Up', 'Choose target type and payout date.'),
    step('Gross Up transaction', 'Enter target net', 'Select employee and included obligations.'),
    step('Gross Up transaction', 'Calculate', 'Atlas iterates with the effective table versions and defined tolerance.'),
    step('Gross Up result', 'Inspect iteration evidence', 'Review convergence, gross amount, tax, and contributions.', 'Gross-up converged'),
  ], ['gross up', 'tax', 'calculation']),
  scenario('client-reports', 'client_admin', 'Reporting', 'Generate a payroll report', 'build a report from posted payroll data', 'finance can reconcile the final transaction', [
    step('Payroll', 'Open Reports', 'Choose Payroll Register.'),
    step('Reports', 'Select posted payout', 'Atlas derives rows from the payroll run store.'),
    step('Report preview', 'Apply filters', 'Review columns, totals, and source period.'),
    step('Report preview', 'Export', 'Generate the selected report file.', 'Payroll report exported'),
  ], ['report', 'export', 'posted payroll']),
  scenario('client-remittance', 'client_admin', 'Remittance', 'Record a statutory remittance', 'link filing and payment details to a posted payroll', 'the company can prove what was filed and paid', [
    step('Payroll', 'Open Remittance Monitoring', 'Click Add.'),
    step('Add Remittance', 'Select posted payout and agency', 'Enter filing, payment, O.R., dates, and responsible people.'),
    step('Review remittance', 'Save Draft', 'Atlas preserves the transaction source.'),
    step('Remittance Monitoring', 'Mark Verified', 'The record moves to Verified.', 'Remittance verified'),
  ], ['remittance', 'statutory', 'filing']),
  scenario('client-access', 'client_admin', 'Governance', 'Change access and approval routing', 'maintain who can act and how requests route', 'only authorized people see and decide governed work', [
    step('Core', 'Open Access & Approvals', 'Select the applicable role or workflow.'),
    step('Access & Approvals', 'Change permission or approver', 'Review impacted module and employee scope.'),
    step('Review access change', 'Save', 'Atlas validates the assignment.'),
    step('Audit Log', 'View event', 'The change, actor, and time are recorded.', 'Access updated'),
  ], ['access', 'approval routing', 'audit']),

  scenario('pa-statutory', 'pa_admin', 'Statutory governance', 'Publish a statutory table version', 'create an effective-dated SSS, PhilHealth, Pag-IBIG, or de minimis version', 'payroll resolves the legally applicable schedule by payout date', [
    step('Payroll', 'Open Statutory Table', 'Select an agency.'),
    step('Statutory Table', 'Add version', 'Enter effectivity and schedule rows.'),
    step('Version review', 'Validate boundaries', 'Atlas checks ranges and conflicting effective dates.'),
    step('Version review', 'Publish', 'The version becomes available to payroll and locks after use.', 'Statutory version published'),
  ], ['statutory', 'version', 'publish']),
  scenario('pa-tax', 'pa_admin', 'Statutory governance', 'Publish a tax table version', 'maintain annual, compensation, expanded, or final withholding schedules', 'tax calculations use an effective and traceable source', [
    step('Payroll', 'Open Tax Tables', 'Select the tax schedule.'),
    step('Tax Tables', 'Add version', 'Enter brackets, rates, ATC data, and effectivity.'),
    step('Version review', 'Test boundary values', 'Atlas verifies the bracket transitions.'),
    step('Version review', 'Publish', 'Payroll can resolve the version by payout date.', 'Tax version published'),
  ], ['tax', 'version', 'publish']),
  scenario('pa-computation', 'pa_admin', 'Computational basis', 'Create a reusable computation code', 'define mapped inputs, formula order, tests, and version metadata', 'companies can reuse governed logic without hardcoding outputs', [
    step('Settings', 'Open Computational Basis', 'Click Add Computation.'),
    step('Formula Setup', 'Map fields and expression', 'Build the ordered calculation from approved inputs.'),
    step('Test Calculation', 'Run golden examples', 'Compare expected and actual intermediate values.'),
    step('Computation review', 'Publish version', 'The code becomes selectable by Policy Management.', 'Computation code published'),
  ], ['computation', 'formula', 'version']),
  scenario('pa-policy-impact', 'pa_admin', 'Policy engine', 'Assess a policy change across employees', 'change a governed policy and compare employee-level outcomes', 'the client sees who is affected before activation', [
    step('Company Configuration', 'Open Policy Engines', 'Select Take-Home Pay.'),
    step('Policy Engine', 'Edit deduction cap and priority', 'Keep the assignment and table sources visible.'),
    step('Impact simulator', 'Run all applicable employees', 'Atlas evaluates each employee with current payroll inputs.'),
    step('Impact results', 'Compare before and after', 'Review net-pay deltas, deferred balances, and exceptions.', 'Impact assessment ready'),
  ], ['policy engine', 'impact', 'employees']),
  scenario('pa-override', 'pa_admin', 'Approval governance', 'Perform an authorized approval override', 'resolve a blocked request with a recorded reason', 'operations continue without losing accountability', [
    step('Settings', 'Open Access & Approvals', 'Find the blocked workflow item.'),
    step('Approval detail', 'Choose Override', 'Atlas shows the current approver and decision state.'),
    step('Override Approval', 'Enter mandatory reason', 'Confirm scope and downstream effect.'),
    step('Audit Log', 'View override event', 'Actor, reason, prior state, and new state are recorded.', 'Approval overridden'),
  ], ['override', 'approval', 'audit']),
  scenario('pa-billing', 'pa_admin', 'Billing', 'Create a client billing transaction', 'calculate and record the service charge for a payroll period', 'P&A can bill the client from a controlled register', [
    step('Payroll', 'Open Billing', 'Select the client and service period.'),
    step('Billing', 'Add transaction', 'Enter service, basis, quantity, rate, and references.'),
    step('Billing review', 'Validate totals', 'Atlas checks the billed company and period.'),
    step('Billing review', 'Save transaction', 'The P&A-only register is updated.', 'Billing transaction saved'),
  ], ['billing', 'P&A only', 'client']),
  scenario('pa-multi-company', 'pa_admin', 'Multi-company operations', 'Switch companies safely', 'move between client contexts without carrying the prior company’s data', 'every action stays correctly company-scoped', [
    step('Payroll', 'Open Payroll Processing', 'Start on a company-scoped register so the switch is observable.'),
    step('Top bar', 'Open company switcher and select Northstar Retail', 'Atlas refreshes the live company list and every company-scoped repository changes context.'),
    step('Payroll Processing', 'Review the Northstar register', 'Only Northstar transactions appear.'),
    step('Top bar', 'Switch back to ABC Company Ltd', 'ABC data is restored without cross-company leakage.', 'Company scope verified'),
  ], ['company switcher', 'scope', 'security']),
  scenario('pa-audit', 'pa_admin', 'Audit & security', 'Investigate a governed data change', 'filter audit events by actor, module, record, and date', 'I can reconstruct who changed payroll-affecting data', [
    step('Payroll', 'Open Audit Log', 'Filter to Policy Engine changes.'),
    step('Audit Log', 'Select an event', 'Show actor, company, old value, new value, and timestamp.'),
    step('Audit event', 'Open linked record', 'Navigate to the governed policy version.'),
    step('Policy version', 'Review history', 'The full change chain is available.', 'Audit trace reviewed'),
  ], ['audit', 'security', 'traceability']),
  scenario('pa-reference', 'pa_admin', 'Reference governance', 'Retire a reference value safely', 'end-date a code without breaking historical records', 'new transactions stop using it while old records remain readable', [
    step('Settings', 'Open Reference Table', 'Select the controlled list.'),
    step('Reference Table', 'Open active value', 'Review current usage and effectivity.'),
    step('Edit value', 'Set status to Retired', 'Atlas preserves the stored value for existing records.'),
    step('Reference Table', 'Save', 'New dropdowns no longer offer the retired value.', 'Reference value retired'),
  ], ['reference', 'retire', 'history']),
  scenario('pa-payroll-reopen', 'pa_admin', 'Payroll processing', 'Re-open an eligible payroll', 'return the latest regular or any special transaction to an editable state', 'a controlled correction can be made before reposting', [
    step('Payroll Processing', 'Open Locked transaction', 'Atlas evaluates whether the run is eligible to reopen.'),
    step('Payroll transaction', 'Click Re-open', 'Review the warning and downstream impact.'),
    step('Re-open Payroll', 'Enter reason and confirm', 'Atlas records the state transition.'),
    step('Payroll transaction', 'Edit and resubmit', 'The revised run follows review and approval again.', 'Payroll re-opened'),
  ], ['payroll', 'reopen', 'correction']),
  scenario('pa-negative-net', 'pa_admin', 'Payroll exception', 'Resolve a negative-net employee', 'apply the configured defer, stagger, or recovery policy', 'outstanding deductions remain visible and collectible', [
    step('Payroll Processing', 'Open exception queue', 'Select an employee below the protected minimum.'),
    step('Take-Home Pay result', 'Review deduction hierarchy', 'Atlas shows deferred and collected items.'),
    step('Recovery plan', 'Confirm stagger behavior', 'Balances above the threshold are split; others recover next payroll.'),
    step('Payroll line', 'Save resolution', 'Original due date, revised due date, approvals, and balance remain.', 'Negative net resolved'),
  ], ['negative net', 'defer', 'recovery']),
  scenario('pa-import', 'pa_admin', 'Data operations', 'Validate a bulk payroll import', 'preview records and reject invalid rows before persistence', 'bad data cannot partially corrupt the transaction', [
    step('Payroll Processing', 'Open Add Payroll', 'Choose the import method.'),
    step('Import payroll inputs', 'Upload template', 'Atlas parses employees, earnings, and deductions.'),
    step('Import preview', 'Review validation errors', 'Invalid employee IDs and contradictory values are highlighted.'),
    step('Import preview', 'Commit valid file', 'The complete valid batch is saved atomically.', 'Payroll inputs imported'),
  ], ['import', 'validation', 'atomic']),
];

export const SCENARIO_ROLES = Object.entries(roleLabels).map(([id, label]) => ({ id, label }));
export const SCENARIO_CATEGORIES = [...new Set(SCENARIOS.map(item => item.category))].sort();

export function scenariosFor({ role = 'all', category = 'all', query = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return SCENARIOS.filter(item => {
    if (role !== 'all' && item.role !== role) return false;
    if (category !== 'all' && item.category !== category) return false;
    if (!needle) return true;
    return [item.title, item.story, item.category, item.roleLabel, ...item.tags].join(' ').toLowerCase().includes(needle);
  });
}

export function scenarioCoverage() {
  return SCENARIO_ROLES.map(role => ({
    ...role,
    count: SCENARIOS.filter(item => item.role === role.id).length,
  }));
}
