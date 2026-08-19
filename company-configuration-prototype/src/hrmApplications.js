/**
 * The Employee Self-service application registry.
 *
 * Every self-service application in the P&A HRM masterfile — its landing card,
 * its list columns, its filter drawer, its apply/edit form and its view modal —
 * is described once here.  `HRMSelfService` renders whichever definition the
 * route resolves to, so adding an application never means writing a new screen
 * or duplicating a column list.
 */

import { REQUEST_STATUSES, REQUEST_TYPES, REQUEST_TYPE_LABELS } from './requestWorkflow.js';
import { CHARGE_CODES, LEAVE_TYPES, SHIFT_CATALOG } from './hrmData.js';

/** The secondary sidebar of the Employee Self-service shell. */
export const selfServiceGroups = Object.freeze([
  { key: 'time-tracking', label: 'Time Tracking', icon: 'clock' },
  { key: 'leave-application', label: 'Leave Application', icon: 'suitcase' },
  { key: 'work-and-shift', label: 'Work and Shift', icon: 'calendar' },
  { key: 'cash-and-expense', label: 'Cash and Expense', icon: 'receipt' },
  { key: 'loans', label: 'Loans', icon: 'bank' },
  { key: 'employee-requests', label: 'Employee Requests', icon: 'clipboard' },
]);

export const APPLICATION_STATUS_TABS = Object.freeze(['All', 'Pending', 'Approved', 'Rejected']);

const proofUploadHint = 'Support for a single or bulk upload. Maximum file size 2MB.';

const reasonField = { key: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'Input reason' };
const attachmentsField = { key: 'attachments', label: 'Upload Attachments', type: 'upload', hint: proofUploadHint };
const applyForField = { key: 'applyFor', label: 'Apply For', type: 'radio', required: true, options: ['Myself', 'Other Employee'], default: 'Myself' };

const shiftOptions = SHIFT_CATALOG.map(shift => shift.name);

/**
 * `columns` drive the list table, `filters` the drawer, `fields` the apply and
 * edit forms, and `detail` the view modal.  A column with `group` renders as a
 * labelled pair of rows inside the detail modal, matching the Figma layout.
 */
export const applicationDefinitions = Object.freeze([
  {
    key: 'time-correction',
    group: 'time-tracking',
    requestType: REQUEST_TYPES.TIME_IN_OUT_CORRECTION,
    title: 'Time In/Out Correction Application',
    cardLabel: 'Time In/Out Correction Application',
    applyLabel: 'Apply',
    modalTitle: 'Apply for Time In/Out Correction',
    viewTitle: 'View Time In/Out Correction Request',
    icon: 'clock-clockwise',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'correctedEntry', label: 'Corrected Entry' },
      { key: 'actualClockInDate', label: 'Actual Clock-in Date', type: 'date' },
      { key: 'actualClockInTime', label: 'Actual Clock-in Time', type: 'time' },
      { key: 'correctedClockInDate', label: 'Corrected Clock-in Date', type: 'date' },
      { key: 'correctedClockInTime', label: 'Corrected Clock-in Time', type: 'time' },
      { key: 'actualClockOutDate', label: 'Actual Clock-out Date', type: 'date' },
      { key: 'actualClockOutTime', label: 'Actual Clock-out Time', type: 'time' },
      { key: 'correctedClockOutDate', label: 'Corrected Clock-out Date', type: 'date' },
      { key: 'correctedClockOutTime', label: 'Corrected Clock-out Time', type: 'time' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'correctedEntry', label: 'Corrected Entry', type: 'radio', required: true, options: ['Time In', 'Time Out', 'Time In & Time Out'], default: 'Time In' },
      { key: 'actualClockInDate', label: 'Actual Clock-in Date', type: 'date', section: 'Time In', showWhen: { correctedEntry: ['Time In', 'Time In & Time Out'] } },
      { key: 'actualClockInTime', label: 'Actual Clock-in Time', type: 'time', section: 'Time In', showWhen: { correctedEntry: ['Time In', 'Time In & Time Out'] } },
      { key: 'correctedClockInDate', label: 'Corrected Clock-In Date', type: 'date', section: 'Time In', showWhen: { correctedEntry: ['Time In', 'Time In & Time Out'] } },
      { key: 'correctedClockInTime', label: 'Corrected Clock-In Time', type: 'time', section: 'Time In', showWhen: { correctedEntry: ['Time In', 'Time In & Time Out'] } },
      { key: 'actualClockOutDate', label: 'Actual Clock-out Date', type: 'date', section: 'Time Out', showWhen: { correctedEntry: ['Time Out', 'Time In & Time Out'] } },
      { key: 'actualClockOutTime', label: 'Actual Clock-out Time', type: 'time', section: 'Time Out', showWhen: { correctedEntry: ['Time Out', 'Time In & Time Out'] } },
      { key: 'correctedClockOutDate', label: 'Corrected Clock-out Date', type: 'date', section: 'Time Out', showWhen: { correctedEntry: ['Time Out', 'Time In & Time Out'] } },
      { key: 'correctedClockOutTime', label: 'Corrected Clock-out Time', type: 'time', section: 'Time Out', showWhen: { correctedEntry: ['Time Out', 'Time In & Time Out'] } },
      reasonField,
      attachmentsField,
    ],
  },
  {
    key: 'overtime',
    group: 'time-tracking',
    requestType: REQUEST_TYPES.OVERTIME,
    title: 'Overtime Application',
    cardLabel: 'Overtime Request Application',
    applyLabel: 'Apply',
    modalTitle: 'Add Overtime Application',
    viewTitle: 'View Overtime Application',
    icon: 'clock-plus',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'overtimeStartDate', label: 'Overtime Start Date', type: 'date' },
      { key: 'overtimeStartTime', label: 'Overtime Start Time', type: 'time' },
      { key: 'overtimeEndDate', label: 'Overtime End Date', type: 'date' },
      { key: 'overtimeEndTime', label: 'Overtime End Time', type: 'time' },
      { key: 'hoursFiled', label: 'Hours Filed' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      applyForField,
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'overtimeStartDate', label: 'Overtime Start Date', type: 'date', required: true },
      { key: 'overtimeStartTime', label: 'Overtime Start Time', type: 'time', required: true },
      { key: 'overtimeEndDate', label: 'Overtime End Date', type: 'date', required: true },
      { key: 'overtimeEndTime', label: 'Overtime End Time', type: 'time', required: true },
      { key: 'hoursFiled', label: 'Hours Filed', type: 'derived', derivedFrom: 'overtimeHours', readOnly: true },
      { ...reasonField, placeholder: 'Input reason for overtime' },
      attachmentsField,
    ],
  },
  {
    key: 'ot-offset',
    group: 'time-tracking',
    requestType: REQUEST_TYPES.OT_OFFSET,
    title: 'Offset of OT & Time Off Application',
    cardLabel: 'Offset of OT and Time Off Application',
    applyLabel: 'Apply',
    modalTitle: 'Apply for Offset of OT & Time Off',
    viewTitle: 'View Offset of OT & Time Off Request',
    icon: 'clock-counter',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'overtimeDate', label: 'Overtime Date', type: 'date' },
      { key: 'numberOfOtHours', label: 'Number of OT Hours' },
      { key: 'preferredOffsetDate', label: 'Preferred Offset Date', type: 'date' },
      { key: 'hoursToOffset', label: 'Number of Hours to Offset' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      // An offset can only draw down overtime that was already approved, so the
      // date picker is validated against the employee's approved OT requests.
      { key: 'overtimeDate', label: 'Overtime Date', type: 'date', required: true, validate: 'approvedOvertimeDate' },
      { key: 'numberOfOtHours', label: 'Number of OT Hours', type: 'derived', derivedFrom: 'approvedOvertimeHours', readOnly: true },
      { key: 'preferredOffsetDate', label: 'Preferred Offset Date', type: 'date', required: true },
      { key: 'hoursToOffset', label: 'Number of Hours to Offset', type: 'number', required: true, placeholder: 'Input hours to offset', validate: 'withinOvertimeHours' },
      reasonField,
      attachmentsField,
    ],
  },
  {
    key: 'leave',
    group: 'leave-application',
    requestType: REQUEST_TYPES.LEAVE,
    title: 'Leave Application',
    cardLabel: 'Leave Application',
    applyLabel: 'Apply for Leave',
    modalTitle: 'Apply for Leave',
    viewTitle: 'View Leave Application',
    icon: 'suitcase',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'leaveType', label: 'Leave Type' },
      { key: 'leaveStart', label: 'Leave Start', type: 'date' },
      { key: 'leaveEnd', label: 'Leave End', type: 'date' },
      { key: 'filedDays', label: 'Filed Days' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      applyForField,
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'leaveType', label: 'Leave Type', type: 'select', required: true, options: LEAVE_TYPES },
      { key: 'leaveStart', label: 'Leave Start', type: 'date', required: true },
      { key: 'leaveEnd', label: 'Leave End', type: 'date', required: true },
      // Filed days are counted from the dates and checked against the balance
      // for the selected leave type rather than typed in by hand.
      { key: 'filedDays', label: 'Filed Days', type: 'derived', derivedFrom: 'leaveDays', readOnly: true, validate: 'withinLeaveBalance' },
      { ...reasonField, placeholder: 'Input reason for leave' },
      attachmentsField,
    ],
  },
  {
    key: 'time-off',
    group: 'leave-application',
    requestType: REQUEST_TYPES.TIME_OFF,
    title: 'Time Off Application',
    cardLabel: 'Time Off Application',
    applyLabel: 'Apply for Time Off',
    modalTitle: 'Add Time Off Application',
    viewTitle: 'View Time Off Application',
    icon: 'calendar-x',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'effectiveDateStart', label: 'Effective Date Start', type: 'date' },
      { key: 'effectiveDateEnd', label: 'Effective Date End', type: 'date' },
      { key: 'startTime', label: 'Start Time', type: 'time' },
      { key: 'endTime', label: 'End Time', type: 'time' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      applyForField,
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'effectiveDateStart', label: 'Effective Date Start', type: 'date', required: true },
      { key: 'startTime', label: 'Time Start', type: 'time' },
      { key: 'effectiveDateEnd', label: 'Effective Date End', type: 'date', required: true },
      { key: 'endTime', label: 'Time End', type: 'time' },
      { ...reasonField, placeholder: 'Input reason for time off' },
      attachmentsField,
    ],
  },
  {
    key: 'shift-change',
    group: 'work-and-shift',
    requestType: REQUEST_TYPES.SHIFT_CHANGE,
    title: 'Shift Change Application',
    cardLabel: 'Shift Change Application',
    applyLabel: 'Apply for Shift Change',
    modalTitle: 'Apply for Shift Change',
    viewTitle: 'View Shift Change Application',
    icon: 'calendar-clock',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'currentShift', label: 'Current Shift' },
      { key: 'currentShiftSchedule', label: 'Current Shift Schedule' },
      { key: 'requestedShift', label: 'Requested Shift' },
      { key: 'requestedShiftSchedule', label: 'Requested Shift Schedule' },
      { key: 'effectiveDate', label: 'Effective Date', type: 'date' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      applyForField,
      { key: 'currentShift', label: 'Current Shift', type: 'select', required: true, options: shiftOptions },
      { key: 'currentShiftSchedule', label: 'Current Shift Schedule', type: 'derived', derivedFrom: 'currentShiftWindow', readOnly: true },
      { key: 'requestedShift', label: 'Requested Shift', type: 'select', required: true, options: shiftOptions, validate: 'differentFromCurrentShift' },
      { key: 'requestedShiftSchedule', label: 'Requested Shift Schedule', type: 'derived', derivedFrom: 'requestedShiftWindow', readOnly: true },
      { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
      reasonField,
    ],
  },
  {
    key: 'official-business',
    group: 'work-and-shift',
    requestType: REQUEST_TYPES.OFFICIAL_BUSINESS,
    title: 'Official Business Application',
    cardLabel: 'Official Business Application',
    applyLabel: 'Apply for Official Business',
    modalTitle: 'Apply for Official Business',
    viewTitle: 'View Official Business Application',
    icon: 'briefcase',
    // Official Business is the one application the masterfile files in two
    // steps: capture, then a read-only review before submitting.
    reviewStep: true,
    reviewTitle: 'Review Application Details',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'activity', label: 'Activity' },
      { key: 'location', label: 'Location' },
      { key: 'startDate', label: 'Start Date', type: 'date' },
      { key: 'endDate', label: 'End Date', type: 'date' },
      { key: 'startTime', label: 'Start Time', type: 'time' },
      { key: 'endTime', label: 'End Time', type: 'time' },
      { key: 'reason', label: 'Employee Remarks' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'activity', label: 'Activity', type: 'text', required: true, placeholder: 'Input activity name' },
      { key: 'location', label: 'Location', type: 'text', required: true, placeholder: 'Input location' },
      { key: 'startDate', label: 'Start Date', type: 'date', required: true },
      { key: 'endDate', label: 'End Date', type: 'date', required: true },
      { key: 'startTime', label: 'Start Time', type: 'time', required: true },
      { key: 'endTime', label: 'End Time', type: 'time', required: true },
      { ...reasonField, label: 'Employee Remarks', placeholder: 'Input purpose/reason' },
      attachmentsField,
    ],
  },
  {
    key: 'transfer',
    group: 'work-and-shift',
    requestType: REQUEST_TYPES.TRANSFER,
    title: 'Transfer Request Application',
    cardLabel: 'Transfer Request Application',
    applyLabel: 'Apply for Transfer',
    modalTitle: 'Apply for Transfer',
    viewTitle: 'View Transfer Request',
    icon: 'arrows-left-right',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'transferType', label: 'Transfer Type' },
      { key: 'currentAssignment', label: 'Current Assignment' },
      { key: 'currentJobTitle', label: 'Current Job Title' },
      { key: 'newAssignment', label: 'New Assignment' },
      { key: 'newJobTitle', label: 'New Job Title' },
      { key: 'effectivityDate', label: 'Effectivity Date', type: 'date' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'transferType', label: 'Transfer Type', type: 'select', required: true, options: ['Department', 'Division', 'Office Location'] },
      { key: 'currentAssignment', label: 'Current Assignment', type: 'derived', derivedFrom: 'currentDepartment', readOnly: true },
      { key: 'currentJobTitle', label: 'Current Job Title', type: 'derived', derivedFrom: 'currentPosition', readOnly: true },
      { key: 'newAssignment', label: 'New Assignment', type: 'text', required: true, placeholder: 'Input new assignment' },
      { key: 'newJobTitle', label: 'New Job Title', type: 'text', placeholder: 'Input new job title' },
      { key: 'effectivityDate', label: 'Effectivity Date', type: 'date', required: true },
      reasonField,
      attachmentsField,
    ],
  },
  {
    key: 'petty-cash',
    group: 'cash-and-expense',
    requestType: REQUEST_TYPES.PETTY_CASH,
    title: 'Petty Cash Request',
    cardLabel: 'Petty Cash Request',
    applyLabel: 'Request Petty Cash',
    modalTitle: 'Apply for Petty Cash',
    viewTitle: 'View Petty Cash Request',
    icon: 'receipt',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'expenseCategory', label: 'Category' },
      { key: 'amount', label: 'Amount' },
      { key: 'expenseDate', label: 'Date Needed', type: 'date' },
      { key: 'purpose', label: 'Purpose' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'expenseCategory', label: 'Expense Category', type: 'select', required: true, options: ['Office Supplies', 'Transportation', 'Meals & Representation', 'Emergency Repairs', 'Courier/Postage'] },
      { key: 'amount', label: 'Amount (PHP)', type: 'number', required: true, placeholder: 'e.g. 1500.00' },
      { key: 'expenseDate', label: 'Date Needed', type: 'date', required: true },
      { key: 'purpose', label: 'Purpose & Description', type: 'textarea', required: true, placeholder: 'Detailed description of petty cash expense' },
      attachmentsField,
    ],
  },
  {
    key: 'expense-reimbursement',
    group: 'cash-and-expense',
    requestType: REQUEST_TYPES.EXPENSE_REIMBURSEMENT,
    title: 'Expense Reimbursement Application',
    cardLabel: 'Expense Reimbursement Application',
    applyLabel: 'Apply for Reimbursement',
    modalTitle: 'Add Expense Reimbursement',
    viewTitle: 'View Expense Reimbursement',
    icon: 'receipt',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'receiptNumber', label: 'Receipt / OR No.' },
      { key: 'expenseCategory', label: 'Category' },
      { key: 'amount', label: 'Total Amount' },
      { key: 'expenseDate', label: 'Receipt Date', type: 'date' },
      { key: 'reason', label: 'Business Purpose' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'expenseCategory', label: 'Expense Category', type: 'select', required: true, options: ['Travel & Accommodation', 'Client Entertainment', 'Training & Seminars', 'Software / Tools', 'Telecom / Internet'] },
      { key: 'receiptNumber', label: 'Receipt / Official Receipt No.', type: 'text', required: true, placeholder: 'e.g. OR-84920' },
      { key: 'expenseDate', label: 'Receipt Date', type: 'date', required: true },
      { key: 'amount', label: 'Amount (PHP)', type: 'number', required: true, placeholder: 'e.g. 3250.00' },
      { ...reasonField, label: 'Business Justification', placeholder: 'Explain business purpose' },
      attachmentsField,
    ],
  },
  {
    key: 'cash-advance',
    group: 'cash-and-expense',
    requestType: REQUEST_TYPES.CASH_ADVANCE,
    title: 'Cash Advance Request',
    cardLabel: 'Cash Advance Request',
    applyLabel: 'Apply for Cash Advance',
    modalTitle: 'Apply for Cash Advance',
    viewTitle: 'View Cash Advance Request',
    icon: 'receipt',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'advanceType', label: 'Advance Type' },
      { key: 'amount', label: 'Amount' },
      { key: 'liquidationDeadline', label: 'Liquidation Due', type: 'date' },
      { key: 'purpose', label: 'Purpose' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'advanceType', label: 'Advance Type', type: 'select', required: true, options: ['Official Travel Advance', 'Project Advance', 'Emergency Advance', 'Event Operations'] },
      { key: 'amount', label: 'Amount Requested (PHP)', type: 'number', required: true, placeholder: 'e.g. 10000.00' },
      { key: 'liquidationDeadline', label: 'Target Liquidation Date', type: 'date', required: true },
      { key: 'purpose', label: 'Purpose of Advance', type: 'textarea', required: true, placeholder: 'Describe itinerary / purpose of funds' },
      attachmentsField,
    ],
  },
  {
    key: 'cash-advance-liquidation',
    group: 'cash-and-expense',
    requestType: REQUEST_TYPES.CASH_ADVANCE_LIQUIDATION,
    title: 'Cash Advance Liquidation',
    cardLabel: 'Cash Advance Liquidation',
    applyLabel: 'Liquidate Cash Advance',
    modalTitle: 'Liquidate Cash Advance',
    viewTitle: 'View Cash Advance Liquidation',
    icon: 'check-square',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'cashAdvanceNo', label: 'Cash Advance No.' },
      { key: 'chargeCode', label: 'Charge Code' },
      { key: 'totalExpenses', label: 'Total Expenses' },
      { key: 'cashAdvanceAmount', label: 'Less: Cash Advance' },
      { key: 'cashReturned', label: 'Less: Cash Returned' },
      { key: 'liquidationBalance', label: 'Amount Due To / From' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      // Only advances this employee holds that are approved and still
      // outstanding can be settled, so the list comes from their own records.
      { key: 'cashAdvanceNo', label: 'Cash Advance Number', type: 'select', required: true, optionsFrom: 'openCashAdvances' },
      { key: 'cashAdvanceAmount', label: 'Cash Advance Amount', type: 'derived', derivedFrom: 'cashAdvanceAmount', readOnly: true },
      { key: 'chargeCode', label: 'Charge Code', type: 'select', required: true, options: CHARGE_CODES },
      { key: 'totalExpenses', label: 'Total Amount of Expenses (PHP)', type: 'number', required: true, placeholder: 'e.g. 12500.00' },
      { key: 'cashReturned', label: 'Cash Returned (PHP)', type: 'number', placeholder: 'e.g. 2500.00' },
      { key: 'cashReturnOrNumber', label: 'OR Number of Cash Returned', type: 'text', placeholder: 'e.g. OR-100245' },
      { key: 'liquidationBalance', label: 'Amount Due To / From Employee', type: 'derived', derivedFrom: 'liquidationBalance', readOnly: true },
      { key: 'particulars', label: 'Details of Expenses', type: 'textarea', required: true, placeholder: 'Itemise the expenses covered by this liquidation' },
      attachmentsField,
    ],
  },
  {
    key: 'company-loan',
    group: 'loans',
    requestType: REQUEST_TYPES.COMPANY_LOAN,
    title: 'Company Loan Application',
    cardLabel: 'Company Loan Application',
    applyLabel: 'Apply for Loan',
    modalTitle: 'Apply for Company Loan',
    viewTitle: 'View Company Loan Application',
    icon: 'bank',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'loanType', label: 'Loan Type' },
      { key: 'principalAmount', label: 'Principal Amount' },
      { key: 'termMonths', label: 'Term (Months)' },
      { key: 'monthlyDeduction', label: 'Monthly Deduction' },
      { key: 'reason', label: 'Purpose' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'loanType', label: 'Loan Type', type: 'select', required: true, options: ['Emergency Loan', 'Educational Loan', 'Salary Loan', 'Calamity Assistance', 'Medical Assistance'] },
      { key: 'principalAmount', label: 'Principal Amount (PHP)', type: 'number', required: true, placeholder: 'e.g. 20000.00' },
      { key: 'termMonths', label: 'Repayment Term (Months)', type: 'select', required: true, options: ['6', '12', '18', '24'] },
      { key: 'monthlyDeduction', label: 'Monthly Amortization (PHP)', type: 'derived', derivedFrom: 'loanAmortization', readOnly: true },
      { ...reasonField, label: 'Loan Purpose', placeholder: 'Explain financial need/purpose' },
      attachmentsField,
    ],
  },
  {
    key: 'government-loan',
    group: 'loans',
    requestType: REQUEST_TYPES.GOVERNMENT_LOAN,
    title: 'Government Loan Application',
    cardLabel: 'Government Loan (SSS / HDMF / Pag-IBIG)',
    applyLabel: 'Apply for Gov Loan',
    modalTitle: 'Apply for Government Loan Support',
    viewTitle: 'View Government Loan Record',
    icon: 'bank',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'agency', label: 'Agency' },
      { key: 'loanProgram', label: 'Program' },
      { key: 'loanReferenceNo', label: 'Voucher / Ref No.' },
      { key: 'monthlyAmortization', label: 'Monthly Amortization' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'agency', label: 'Government Agency', type: 'select', required: true, options: ['SSS (Social Security System)', 'HDMF (Pag-IBIG Fund)', 'GSIS', 'PhilHealth'] },
      { key: 'loanProgram', label: 'Loan Program', type: 'select', required: true, options: ['Salary Loan', 'Calamity Loan', 'Multi-Purpose Loan (MPL)', 'Housing Loan Amortization'] },
      { key: 'loanReferenceNo', label: 'Billing / Voucher Reference No.', type: 'text', required: true, placeholder: 'e.g. SSS-LON-2026-993' },
      { key: 'monthlyAmortization', label: 'Monthly Payroll Deduction (PHP)', type: 'number', required: true, placeholder: 'e.g. 1050.00' },
      { ...reasonField, label: 'Remarks / Notes' },
      attachmentsField,
    ],
  },
  {
    key: 'coe-request',
    group: 'employee-requests',
    requestType: REQUEST_TYPES.COE_REQUEST,
    title: 'Certificate of Employment Request',
    cardLabel: 'Certificate of Employment (COE)',
    applyLabel: 'Request Certificate',
    modalTitle: 'Request Certificate of Employment',
    viewTitle: 'View Certificate Request',
    icon: 'clipboard',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'purpose', label: 'Purpose' },
      { key: 'withCompensation', label: 'With Compensation' },
      { key: 'dateNeeded', label: 'Date Needed', type: 'date' },
      { key: 'addressedTo', label: 'Addressed To' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'purpose', label: 'Purpose of Certificate', type: 'select', required: true, options: ['Bank / Loan Application', 'Visa / Embassy Requirement', 'Credit Card Application', 'Employment Requirement', 'Rental / Lease Agreement', 'Personal Reference'] },
      { key: 'withCompensation', label: 'Include Compensation Details?', type: 'select', required: true, options: ['Yes - With Compensation Breakdown', 'No - Standard Employment Record Only'] },
      { key: 'dateNeeded', label: 'Date Needed', type: 'date', required: true },
      { key: 'addressedTo', label: 'Addressed To / Entity Name', type: 'text', placeholder: 'e.g. Embassy of Japan / To Whom It May Concern' },
      { ...reasonField, label: 'Additional Instructions', placeholder: 'Special requests or format needed' },
    ],
  },
  {
    key: 'document-request',
    group: 'employee-requests',
    requestType: REQUEST_TYPES.DOCUMENT_REQUEST,
    title: 'Document & Record Request',
    cardLabel: 'Document & Record Request',
    applyLabel: 'Request Document',
    modalTitle: 'Request HR Document',
    viewTitle: 'View Document Request',
    icon: 'clipboard',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'documentType', label: 'Document Type' },
      { key: 'deliveryMethod', label: 'Delivery' },
      { key: 'dateNeeded', label: 'Date Needed', type: 'date' },
      { key: 'purpose', label: 'Purpose' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'documentType', label: 'Document Type', type: 'select', required: true, options: ['BIR Form 2316 (Certificate of Compensation/Tax Withheld)', 'PhilHealth MDR (Member Data Record)', 'SSS Certificate of Contributions', 'Pag-IBIG Contribution Summary', 'Service Record / Work History', 'Company ID Replacement', 'Official Payslip Certified Copy'] },
      { key: 'deliveryMethod', label: 'Preferred Delivery', type: 'select', required: true, options: ['Electronic (Digital PDF via Portal & Email)', 'Hard Copy (Printed & Stamped by HR)'] },
      { key: 'dateNeeded', label: 'Date Needed', type: 'date', required: true },
      { key: 'purpose', label: 'Reason / Purpose', type: 'textarea', required: true, placeholder: 'Explain purpose for the document request' },
      attachmentsField,
    ],
  },
  {
    key: 'resignation',
    group: 'employee-requests',
    requestType: REQUEST_TYPES.RESIGNATION,
    title: 'Employee Resignation Application',
    cardLabel: 'Notice of Resignation',
    applyLabel: 'Submit Resignation',
    modalTitle: 'Submit Notice of Resignation',
    viewTitle: 'View Resignation Request',
    icon: 'door',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'reason', label: 'Reason for Resignation' },
      { key: 'effectivityDate', label: 'Effectivity Date', type: 'date' },
      { key: 'remarks', label: 'Employee Remarks' },
      { key: 'submissionType', label: 'Submission Type' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'reason', label: 'Reason for Resignation', type: 'select', required: true, options: ['Career Growth / Opportunity', 'Relocation / Overseas Employment', 'Personal / Family Reasons', 'Higher Education / Studies', 'Health / Medical Condition', 'Retirement', 'Termination'] },
      { key: 'effectivityDate', label: 'Effectivity Date (Last Day)', type: 'date', required: true },
      { key: 'submissionType', label: 'Submission Type', type: 'select', required: true, options: ['System-generated', 'Employee Submission'] },
      { ...reasonField, label: 'Employee Remarks / Handover Notes', placeholder: 'Detail handover plan or reason for departure' },
      attachmentsField,
    ],
  },
]);

export function applicationByKey(key) {
  return applicationDefinitions.find(definition => definition.key === key) || null;
}

export function applicationByRequestType(requestType) {
  return applicationDefinitions.find(definition => definition.requestType === requestType) || null;
}

export function applicationsForGroup(groupKey) {
  return applicationDefinitions.filter(definition => definition.group === groupKey);
}

export function groupByKey(key) {
  return selfServiceGroups.find(group => group.key === key) || null;
}

/** Columns a definition shows in its list table, before the actions column. */
export function listColumns(definition) {
  return definition.columns.filter(column => column.key !== 'statusDate' || definition.columns.length < 8);
}

/** Fields that the form actually renders for the current draft values. */
export function visibleFields(definition, values = {}) {
  return definition.fields.filter(field => {
    if (!field.showWhen) return true;
    return Object.entries(field.showWhen).every(([key, allowed]) => allowed.includes(values[key]));
  });
}

/**
 * Approver chain rendered by the Approval Log matching the 5-level hierarchy
 * from the P&A Masterfile Figma screens (Mark Santos, Maria Santos, Sophia Ramirez,
 * Ethan Caldwell, Juan Carlos, Jennie Kim, Sitti Buhay, Ben Stiller, Mario Lopez, Bon Iverson Williams).
 */
export const approverChain = Object.freeze([
  { actorId: 'approver-mark', displayName: 'Mark Santos', level: 1, role: 'Team Lead' },
  { actorId: 'manager-001', displayName: 'Maria Santos', level: 1, role: 'Direct Supervisor' },
  { actorId: 'approver-sophia', displayName: 'Sophia Ramirez', level: 1, role: 'Operations Lead' },
  { actorId: 'approver-ethan', displayName: 'Ethan Caldwell', level: 1, role: 'Department Manager' },
  { actorId: 'approver-juan', displayName: 'Juan Carlos', level: 2, role: 'Division Head' },
  { actorId: 'approver-jennie', displayName: 'Jennie Kim', level: 2, role: 'HR Business Partner' },
  { actorId: 'approver-sitti', displayName: 'Sitti Buhay', level: 2, role: 'HR Operations Lead' },
  { actorId: 'approver-mario', displayName: 'Mario Lopez', level: 3, role: 'HR Director' },
  { actorId: 'approver-ben', displayName: 'Ben Stiller', level: 3, role: 'Finance Director' },
  { actorId: 'approver-wil', displayName: 'Wil Osmond', level: 4, role: 'Vice President' },
  { actorId: 'approver-bon', displayName: 'Bon Iverson Williams', level: 5, role: 'Executive Vice President' },
]);

/**
 * Derive the approval log from the request's own status so a Pending request
 * never shows a decided chain and vice versa.
 */
export function approvalLogFor(request) {
  const status = request?.status;
  return approverChain.map((approver, index) => {
    let stepStatus = 'Pending';
    if (status === REQUEST_STATUSES.APPROVED) stepStatus = 'Approved';
    else if (status === REQUEST_STATUSES.REJECTED) stepStatus = index === approverChain.length - 1 ? 'Rejected' : 'Approved';
    else if (status === 'Cancelled') stepStatus = 'Cancelled';
    else if (index < 2) stepStatus = 'Approved';
    return {
      ...approver,
      status: stepStatus,
      remarks: (request?.approvalHistory || []).find(entry => entry.actorId === approver.actorId)?.remarks || (stepStatus === 'Approved' ? 'Verified and endorsed.' : stepStatus === 'Rejected' ? 'Incomplete supporting document.' : ''),
    };
  });
}

const seedDate = '2026-04-23';

function seedRow(definitionKey, requestType, employee, details, status, index, managerId) {
  const decided = status === REQUEST_STATUSES.APPROVED || status === REQUEST_STATUSES.REJECTED;
  return {
    requestId: `seed-${definitionKey}-${employee.employeeId}-${index}`,
    requestType,
    requestTypeLabel: REQUEST_TYPE_LABELS[requestType] || definitionKey,
    employeeId: employee.employeeId,
    employee: { employeeId: employee.employeeId, employeeCode: employee.employeeCode, name: employee.name, department: employee.department, position: employee.position },
    workDate: details.applicationDate || seedDate,
    requestDetails: { ...details, definitionKey, employeeName: employee.name, statusDate: decided ? seedDate : '' },
    requesterRemarks: details.reason || details.purpose || '',
    status,
    createdAt: `${seedDate}T02:00:00.000Z`,
    submittedAt: `${seedDate}T02:00:00.000Z`,
    decidedAt: decided ? `${seedDate}T08:00:00.000Z` : '',
    filedBy: { actorId: `employee-${employee.employeeId}`, displayName: employee.name },
    requester: { actorId: `employee-${employee.employeeId}`, displayName: employee.name },
    assignedApprover: { actorId: `user-${managerId}`, displayName: '', role: 'Manager' },
    approvalHistory: decided ? [{ historyId: `${employee.employeeId}-${index}-decision`, action: status, status, actor: 'Mark Santos', actorId: 'approver-mark', actorRole: 'Manager', remarks: status === REQUEST_STATUSES.REJECTED ? 'Supporting documentation incomplete.' : 'Approved.', at: `${seedDate}T08:00:00.000Z`, version: 2 }] : [],
    version: decided ? 3 : 2,
  };
}

/** Details per application type, cycled so each list shows varied rows. */
const seedDetailsByType = {
  [REQUEST_TYPES.TIME_IN_OUT_CORRECTION]: [
    { applicationDate: seedDate, correctedEntry: 'Time In', actualClockInDate: seedDate, actualClockInTime: '21:00', correctedClockInDate: seedDate, correctedClockInTime: '22:00', reason: 'Biometrics device was offline on arrival.' },
    { applicationDate: seedDate, correctedEntry: 'Time Out', actualClockOutDate: '2026-04-24', actualClockOutTime: '17:00', correctedClockOutDate: '2026-04-24', correctedClockOutTime: '18:00', reason: 'Forgot to tap out after the client call.' },
    { applicationDate: seedDate, correctedEntry: 'Time In & Time Out', actualClockInDate: seedDate, actualClockInTime: '21:00', correctedClockInDate: seedDate, correctedClockInTime: '22:00', actualClockOutDate: '2026-04-24', actualClockOutTime: '17:00', correctedClockOutDate: '2026-04-24', correctedClockOutTime: '18:00', reason: 'Offsite seminar, no biometrics access.' },
  ],
  [REQUEST_TYPES.OVERTIME]: [
    { applicationDate: seedDate, overtimeStartDate: '2026-06-15', overtimeStartTime: '22:00', overtimeEndDate: '2026-06-16', overtimeEndTime: '02:00', hoursFiled: 4, reason: 'Release cutover support.' },
    { applicationDate: seedDate, overtimeStartDate: '2026-06-18', overtimeStartTime: '18:00', overtimeEndDate: '2026-06-18', overtimeEndTime: '21:00', hoursFiled: 3, reason: 'Month-end reconciliation.' },
  ],
  [REQUEST_TYPES.OT_OFFSET]: [
    { applicationDate: seedDate, overtimeDate: '2026-04-24', numberOfOtHours: 4, preferredOffsetDate: '2026-05-01', hoursToOffset: 3, reason: 'Offset against approved overtime.' },
    { applicationDate: seedDate, overtimeDate: '2026-04-24', numberOfOtHours: 4, preferredOffsetDate: '2026-05-08', hoursToOffset: 4, reason: 'Family commitment.' },
  ],
  [REQUEST_TYPES.LEAVE]: [
    { applicationDate: seedDate, leaveType: 'Vacation', leaveStart: '2026-05-10', leaveEnd: '2026-05-12', filedDays: 3, reason: 'Planned family trip.' },
    { applicationDate: seedDate, leaveType: 'Sick', leaveStart: '2026-04-28', leaveEnd: '2026-04-28', filedDays: 1, reason: 'Medical consultation.' },
    { applicationDate: seedDate, leaveType: 'Emergency', leaveStart: '2026-05-04', leaveEnd: '2026-05-05', filedDays: 2, reason: 'Household emergency.' },
  ],
  [REQUEST_TYPES.TIME_OFF]: [
    { applicationDate: seedDate, effectiveDateStart: '2026-06-15', effectiveDateEnd: '2026-06-18', startTime: '00:00', endTime: '00:00', reason: 'Offsite seminar.' },
    { applicationDate: seedDate, effectiveDateStart: '2026-07-01', effectiveDateEnd: '2026-07-01', startTime: '13:00', endTime: '17:00', reason: 'Half-day personal errand.' },
  ],
  [REQUEST_TYPES.SHIFT_CHANGE]: [
    { applicationDate: seedDate, currentShift: 'Morning Shift (8 AM - 5 PM)', currentShiftSchedule: '8:00 AM - 5:00 PM (Mon-Fri)', requestedShift: 'Afternoon Shift (2 PM - 10 PM)', requestedShiftSchedule: '2:00 PM - 10:00 PM (Tue, Thu, Fri)', effectiveDate: '2026-05-01', reason: 'Aligning with the offshore team.' },
    { applicationDate: seedDate, currentShift: 'Morning Shift (8 AM - 5 PM)', currentShiftSchedule: '8:00 AM - 5:00 PM (Mon-Fri)', requestedShift: 'Night Shift (10 PM - 7 AM)', requestedShiftSchedule: '10:00 PM - 7:00 AM (Mon-Wed, Fri)', effectiveDate: '2026-05-15', reason: 'Night coverage rotation.' },
  ],
  [REQUEST_TYPES.OFFICIAL_BUSINESS]: [
    { applicationDate: seedDate, activity: 'Enhancing Productivity Through Smart Work Practices', location: 'Whitespace Manila, City, 1232 Metro Manila', startDate: seedDate, endDate: '2026-05-01', startTime: '08:00', endTime: '17:00', reason: 'Company-sponsored conference.' },
    { applicationDate: seedDate, activity: 'Client Onboarding Workshop', location: 'BGC Corporate Center, Taguig', startDate: '2026-05-05', endDate: '2026-05-05', startTime: '09:00', endTime: '16:00', reason: 'Client engagement kickoff.' },
  ],
  [REQUEST_TYPES.TRANSFER]: [
    { applicationDate: seedDate, transferType: 'Department', currentAssignment: 'Learning & Development', currentJobTitle: 'Training Specialist', newAssignment: 'HR Operations', newJobTitle: 'Training Specialist', effectivityDate: '2026-06-16', reason: 'Internal mobility programme.' },
    { applicationDate: seedDate, transferType: 'Office Location', currentAssignment: 'Makati Branch', currentJobTitle: 'Training Specialist', newAssignment: 'Cebu Branch', newJobTitle: 'Training Specialist', effectivityDate: '2026-06-16', reason: 'Relocation approved by the business unit.' },
  ],
  [REQUEST_TYPES.PETTY_CASH]: [
    { applicationDate: seedDate, expenseCategory: 'Office Supplies', amount: '1250.00', expenseDate: '2026-04-25', purpose: 'Emergency procurement of presentation materials for client alignment.' },
    { applicationDate: seedDate, expenseCategory: 'Transportation', amount: '850.00', expenseDate: '2026-04-26', purpose: 'Taxi reimbursement for offsite client meeting in BGC.' },
  ],
  [REQUEST_TYPES.EXPENSE_REIMBURSEMENT]: [
    { applicationDate: seedDate, expenseCategory: 'Travel & Accommodation', receiptNumber: 'OR-948201', amount: '4800.00', expenseDate: '2026-04-20', reason: 'Out of town client visit lodging and meals.' },
    { applicationDate: seedDate, expenseCategory: 'Software / Tools', receiptNumber: 'INV-2026-88', amount: '2990.00', expenseDate: '2026-04-22', reason: 'Department annual subscription renewal.' },
  ],
  [REQUEST_TYPES.CASH_ADVANCE]: [
    { applicationDate: seedDate, advanceType: 'Official Travel Advance', amount: '15000.00', liquidationDeadline: '2026-05-15', purpose: 'Operational expenses for Cebu site audit and training.' },
    { applicationDate: seedDate, advanceType: 'Project Advance', amount: '8000.00', liquidationDeadline: '2026-05-10', purpose: 'Workshop catering and venue deposit.' },
  ],
  [REQUEST_TYPES.COMPANY_LOAN]: [
    { applicationDate: seedDate, loanType: 'Emergency Loan', principalAmount: '25000.00', termMonths: '12', monthlyDeduction: '2083.33', reason: 'Home repairs following storm.' },
    { applicationDate: seedDate, loanType: 'Salary Loan', principalAmount: '50000.00', termMonths: '24', monthlyDeduction: '2083.33', reason: 'Tuition and academic fees.' },
  ],
  [REQUEST_TYPES.GOVERNMENT_LOAN]: [
    { applicationDate: seedDate, agency: 'SSS (Social Security System)', loanProgram: 'Salary Loan', loanReferenceNo: 'SSS-SL-2026-9482', monthlyAmortization: '1200.00', reason: 'Approved SSS salary loan payroll deduction setup.' },
    { applicationDate: seedDate, agency: 'HDMF (Pag-IBIG Fund)', loanProgram: 'Multi-Purpose Loan (MPL)', loanReferenceNo: 'HDMF-MPL-44910', monthlyAmortization: '850.00', reason: 'Approved Pag-IBIG MPL amortization.' },
  ],
  [REQUEST_TYPES.COE_REQUEST]: [
    { applicationDate: seedDate, purpose: 'Credit Card', dateNeeded: '2026-05-03', companyInstitutionName: 'ClearView Cable Services Ltd.', recipientAddress: 'Unit 1205, Horizon Plaza, 25 Sunrise Avenue, Greenfield District Mandaluyong City, Metro Manila 1550, Philippines', withSalaryInformation: 'Yes', reason: 'Credit Card', remarks: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
    { applicationDate: seedDate, purpose: 'Bank / Loan Application', dateNeeded: '2026-05-02', companyInstitutionName: 'MetroPrime Bank', recipientAddress: '15th Floor, Summit Tower, 148 Pioneer Avenue, Ortigas Center, Pasig City, Metro Manila 1605, Philippines', withSalaryInformation: 'Yes', reason: 'Housing Loan Application', remarks: 'For loan pre-qualification' },
    { applicationDate: seedDate, purpose: 'Future Employment', dateNeeded: '2026-05-03', companyInstitutionName: 'ClearView Cable Services Ltd.', recipientAddress: 'Unit 1205, Horizon Plaza, 25 Sunrise Avenue, Greenfield District Mandaluyong City, Metro Manila 1550, Philippines', withSalaryInformation: 'Yes', reason: 'Future Employment', remarks: 'Lorem Ipsum' },
  ],
  [REQUEST_TYPES.DOCUMENT_REQUEST]: [
    { applicationDate: seedDate, documentType: 'BIR Form 2316 (Certificate of Compensation/Tax Withheld)', deliveryMethod: 'Electronic (Digital PDF via Portal & Email)', dateNeeded: '2026-05-01', purpose: 'Annual tax filing and personal records.' },
    { applicationDate: seedDate, documentType: 'PhilHealth MDR (Member Data Record)', deliveryMethod: 'Hard Copy (Printed & Stamped by HR)', dateNeeded: '2026-05-05', purpose: 'Dependent enrollment and hospital clearance.' },
  ],
  [REQUEST_TYPES.RESIGNATION]: [
    { applicationDate: seedDate, reason: 'Termination', effectivityDate: '2026-05-03', submissionType: 'System-generated', remarks: 'Lorem Ipsum Seminar', separationReasonBir: 'Termination' },
    { applicationDate: seedDate, reason: 'Career Growth / Opportunity', effectivityDate: '2026-06-01', submissionType: 'Employee Submission', remarks: 'Pursuing senior technical role.', separationReasonBir: 'Resignation' },
    { applicationDate: seedDate, reason: 'Personal / Family Reasons', effectivityDate: '2026-05-15', submissionType: 'Employee Submission', remarks: 'Relocation to provincial hometown.', separationReasonBir: 'Resignation' },
  ],
};

const seedStatuses = [REQUEST_STATUSES.PENDING_APPROVAL, REQUEST_STATUSES.APPROVED, REQUEST_STATUSES.REJECTED];

/**
 * Build one seeded application per type, per employee, per status so every
 * status tab in every list has rows without any screen inventing its own data.
 */
export function seedApplications(employees = []) {
  const rows = [];
  employees.forEach(employee => {
    applicationDefinitions.filter(definition => !definition.approverOnly).forEach(definition => {
      const variants = seedDetailsByType[definition.requestType] || [];
      seedStatuses.forEach((status, statusIndex) => {
        const details = variants[statusIndex % variants.length];
        if (!details) return;
        rows.push(seedRow(definition.key, definition.requestType, employee, details, status, rows.length + 1, employee.managerId || employee.employeeId));
      });
    });
  });
  return rows;
}

/** Distinct `section` headings, in field order, for the apply/edit form. */
export function fieldSections(definition, values = {}) {
  const sections = [];
  visibleFields(definition, values).forEach(field => {
    const name = field.section || '';
    const last = sections[sections.length - 1];
    if (!last || last.name !== name) sections.push({ name, fields: [field] });
    else last.fields.push(field);
  });
  return sections;
}
