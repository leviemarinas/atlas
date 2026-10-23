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

/** Who filed and who last acted on an application — read from the request, as Atlas Core lists them. */
const filedByColumn = { key: 'filedBy', label: 'Filed By', fromRequest: true };
const actionedByColumn = { key: 'actionedBy', label: 'Actioned By', fromRequest: true };
const auditColumns = [filedByColumn, actionedByColumn];

const PAYMENT_MODES_SS = ['Semi-Monthly', 'Monthly', 'Weekly', 'Bi-Weekly'];
const DEDUCTION_FREQUENCIES = ['Every Cutoff', 'First Payroll', 'Second Payroll'];
const CURRENCIES = ['PHP', 'USD', 'EUR'];
const REIMBURSEMENT_TYPES = ['Transportation', 'Meals', 'Communication', 'Medical', 'Training', 'Travel & Accommodation'];
const deductionFields = [
  { key: 'periodStartDate', label: 'Deduction Cutoff Start Date', type: 'date', section: 'Deduction' },
  { key: 'periodEndDate', label: 'Deduction Cutoff End Date', type: 'date', section: 'Deduction' },
  { key: 'deductionAmount', label: 'Deduction Amount', type: 'number', section: 'Deduction', placeholder: '0.00' },
  { key: 'paymentMode', label: 'Payment Mode', type: 'select', section: 'Deduction', options: PAYMENT_MODES_SS },
  { key: 'frequency', label: 'Frequency', type: 'select', section: 'Deduction', options: DEDUCTION_FREQUENCIES },
];

/**
 * `columns` drive the list table, `filters` the drawer, `fields` the apply and
 * edit forms, and `detail` the view modal.  A column with `group` renders as a
 * labelled pair of rows inside the detail modal, matching the Figma layout.
 */
const baseDefinitions = [
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
      { key: 'durationType', label: 'Duration Type' },
      { key: 'leaveStart', label: 'Start Date', type: 'date' },
      { key: 'leaveEnd', label: 'End Date', type: 'date' },
      { key: 'filedDays', label: 'Filed Days' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      applyForField,
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'leaveType', label: 'Leave Type', type: 'select', required: true, options: LEAVE_TYPES },
      { key: 'leaveStart', label: 'Start Date', type: 'date', required: true },
      { key: 'leaveEnd', label: 'End Date', type: 'date', required: true },
      // Whole day, or the first or second half of a day; a half day files 0.5 per date.
      { key: 'durationType', label: 'Duration Type', type: 'radio', required: true, options: ['Whole Day', 'First Half', 'Second Half'], default: 'Whole Day' },
      // Filed days are counted from the dates and checked against the balance
      // for the selected leave type rather than typed in by hand.
      { key: 'filedDays', label: 'Filed Days', type: 'derived', derivedFrom: 'leaveDays', readOnly: true, validate: 'withinLeaveBalance' },
      { ...reasonField, placeholder: 'Input reason for leave' },
      { ...attachmentsField, label: 'Upload Supporting Document' },
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
      { key: 'employeeName', label: 'Employee Full Name' },
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
    // One transaction holds several expense lines, as in Atlas Core; the total
    // and the first line's type are kept on the request for the approval screens.
    transactionPrefix: 'RB',
    columns: [
      { key: 'transactionNo', label: 'Transaction No.' },
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'reimbursementType', label: 'Type of Reimbursement' },
      { key: 'amount', label: 'Total Amount', type: 'currency' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'transactionNo', label: 'Transaction Number', type: 'derived', derivedFrom: 'transactionNumber', readOnly: true },
      { key: 'applicationDate', label: 'Expense Date', type: 'date', readOnly: true },
      { key: 'records', label: 'Transaction Records', type: 'records', required: true, addLabel: 'Add Transaction Record', recordFields: [
        { key: 'reimbursementType', label: 'Reimbursement Type', type: 'select', required: true, options: REIMBURSEMENT_TYPES },
        { key: 'dateOfExpense', label: 'Date of Expense', type: 'date', required: true },
        { key: 'currency', label: 'Currency', type: 'select', required: true, options: CURRENCIES, default: 'PHP' },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
        { key: 'receiptDate', label: 'Receipt Date', type: 'date', required: true },
        { key: 'orNumber', label: 'Official Receipt Number', type: 'text', required: true },
        { key: 'description', label: 'Description', type: 'text', required: true },
      ] },
      { key: 'amount', label: 'Total Amount', type: 'derived', derivedFrom: 'recordsTotal', readOnly: true },
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
    transactionPrefix: 'CA',
    columns: [
      { key: 'transactionNo', label: 'Transaction Number' },
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'advanceType', label: 'Cash Advance Type' },
      { key: 'chargeCode', label: 'Charge Code' },
      { key: 'amount', label: 'Amount Requested', type: 'currency' },
      { key: 'liquidationDeadline', label: 'Liquidation Deadline', type: 'date' },
      { key: 'purpose', label: 'Purpose' },
      { key: 'reason', label: 'Employee Remarks' },
      { key: 'periodStartDate', label: 'Deduction Cut-off Start', type: 'date' },
      { key: 'periodEndDate', label: 'Deduction Cut-off End', type: 'date' },
      { key: 'deductionAmount', label: 'Deduction Amount', type: 'currency' },
      { key: 'paymentMode', label: 'Payment Mode' },
      { key: 'frequency', label: 'Frequency' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      applyForField,
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'transactionNo', label: 'Transaction Number', type: 'derived', derivedFrom: 'transactionNumber', readOnly: true },
      { key: 'advanceType', label: 'Cash Advance Type', type: 'select', required: true, options: ['Official Travel Advance', 'Project Advance', 'Emergency Advance', 'Event Operations'] },
      { key: 'amount', label: 'Amount Requested', type: 'number', required: true, placeholder: 'e.g. 10000.00' },
      { key: 'chargeCode', label: 'Charge Code', type: 'select', required: true, options: CHARGE_CODES },
      { key: 'liquidationDeadline', label: 'Liquidation Deadline', type: 'date', required: true },
      { key: 'purpose', label: 'Purpose', type: 'textarea', required: true, placeholder: 'Describe itinerary / purpose of funds' },
      { ...reasonField, label: 'Employee Remarks', required: false },
      attachmentsField,
      { key: 'policyAgreed', label: 'I have read and agree to this policy.', type: 'checkbox', required: true },
      ...deductionFields,
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
    transactionPrefix: 'LQ',
    transactionKey: 'liquidationNumber',
    columns: [
      { key: 'liquidationNumber', label: 'Liquidation Number' },
      { key: 'cashAdvanceNo', label: 'Cash Advance Number' },
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'chargeCode', label: 'Charge Code' },
      { key: 'totalExpenses', label: 'Total Expense', type: 'currency' },
      { key: 'cashAdvanceAmount', label: 'Cash Advance Amount', type: 'currency' },
      { key: 'cashReturned', label: 'Cash Returned', type: 'currency' },
      { key: 'liquidationBalance', label: 'Balance', type: 'currency' },
      { key: 'cashReturnOrNumber', label: 'Cash Return OR No.' },
      { key: 'status', label: 'Liquidation Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      // Only advances this employee holds that are approved and still
      // outstanding can be settled, so the list comes from their own records.
      { key: 'cashAdvanceNo', label: 'Cash Advance Number', type: 'select', required: true, optionsFrom: 'openCashAdvances' },
      { key: 'cashAdvanceAmount', label: 'Cash Advance Amount', type: 'derived', derivedFrom: 'cashAdvanceAmount', readOnly: true },
      { key: 'chargeCode', label: 'Charge Code', type: 'select', required: true, options: CHARGE_CODES },
      { key: 'records', label: 'Liquidation Records', type: 'records', required: true, addLabel: 'Add Liquidation Record', recordFields: [
        { key: 'dateOfExpense', label: 'Date of Expense', type: 'date', required: true },
        { key: 'currency', label: 'Currency', type: 'select', required: true, options: CURRENCIES, default: 'PHP' },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
        { key: 'description', label: 'Description', type: 'text', required: true },
      ] },
      { key: 'totalExpenses', label: 'Total Expense', type: 'derived', derivedFrom: 'recordsTotal', readOnly: true },
      { key: 'cashReturned', label: 'Cash Returned', type: 'number', placeholder: 'e.g. 2500.00', section: 'Cash Return' },
      { key: 'cashReturnOrNumber', label: 'Cash Return OR No.', type: 'text', placeholder: 'e.g. OR-100245', section: 'Cash Return' },
      { key: 'liquidationBalance', label: 'Balance', type: 'derived', derivedFrom: 'liquidationBalance', readOnly: true, section: 'Cash Return' },
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
    transactionPrefix: 'CL',
    columns: [
      { key: 'transactionNo', label: 'Transaction Number' },
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'employeeName', label: 'Employee Full Name' },
      { key: 'loanType', label: 'Loan Type' },
      { key: 'principalAmount', label: 'Loan Amount', type: 'currency' },
      { key: 'termMonths', label: 'Loan Terms (Months)' },
      { key: 'interestRate', label: 'Interest Rate' },
      { key: 'purpose', label: 'Purpose' },
      { key: 'reason', label: 'Employee Remarks' },
      { key: 'periodStartDate', label: 'Payroll Cutoff Start Date', type: 'date' },
      { key: 'periodEndDate', label: 'Payroll Cutoff End Date', type: 'date' },
      { key: 'monthlyDeduction', label: 'Deduction Amount', type: 'currency' },
      { key: 'paymentMode', label: 'Payment Mode' },
      { key: 'frequency', label: 'Frequency' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'transactionNo', label: 'Transaction Number', type: 'derived', derivedFrom: 'transactionNumber', readOnly: true },
      { key: 'loanType', label: 'Loan Type', type: 'select', required: true, options: ['Emergency Loan', 'Educational Loan', 'Salary Loan', 'Calamity Assistance', 'Medical Assistance'] },
      { key: 'principalAmount', label: 'Loan Amount', type: 'number', required: true, placeholder: 'e.g. 20000.00' },
      { key: 'termMonths', label: 'Loan Terms (Months)', type: 'select', required: true, options: ['6', '12', '18', '24'] },
      { key: 'purpose', label: 'Purpose', type: 'select', required: true, options: ['Medical', 'Education', 'Housing', 'Emergency', 'Others'] },
      { ...reasonField, label: 'Employee Remarks', required: false },
      attachmentsField,
      { key: 'authorizeDeduction', label: 'I agree and authorize salary deduction for loan repayments.', type: 'checkbox', required: true },
      { key: 'periodStartDate', label: 'Deduction Cutoff Start Date', type: 'date', section: 'Deduction' },
      { key: 'periodEndDate', label: 'Deduction Cutoff End Date', type: 'date', section: 'Deduction' },
      { key: 'monthlyDeduction', label: 'Deduction Amount', type: 'derived', derivedFrom: 'loanAmortization', readOnly: true, section: 'Deduction' },
      { key: 'paymentMode', label: 'Payment Mode', type: 'select', section: 'Deduction', options: PAYMENT_MODES_SS, default: 'Semi-Monthly' },
      { key: 'frequency', label: 'Frequency', type: 'select', section: 'Deduction', options: DEDUCTION_FREQUENCIES, default: 'Every Cutoff' },
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
    // The employee files the form; HR later records the terms and the payroll
    // deduction (Manage Approvals ▸ Government Loan Management), as in Atlas Core.
    transactionPrefix: 'GL',
    columns: [
      { key: 'transactionNo', label: 'Transaction Number' },
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'employeeName', label: 'Employee Full Name' },
      { key: 'formSubmissionDate', label: 'Dept Submission Date', type: 'date' },
      { key: 'agency', label: 'Government Agency' },
      { key: 'loanProgram', label: 'Government Loan Type' },
      { key: 'loanAmount', label: 'Loan Amount', type: 'currency' },
      { key: 'loanTerms', label: 'Loan Terms (Months)' },
      { key: 'interestRate', label: 'Interest Rate(%)' },
      { key: 'purpose', label: 'Loan Purpose' },
      { key: 'reason', label: 'Employee Remarks' },
      { key: 'periodStartDate', label: 'Deduction Cut Off Start Date', type: 'date' },
      { key: 'periodEndDate', label: 'Deduction Cut Off End Date', type: 'date' },
      { key: 'monthlyAmortization', label: 'Deduction Amount', type: 'currency' },
      { key: 'paymentMode', label: 'Payment Mode' },
      { key: 'frequency', label: 'Frequency' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'transactionNo', label: 'Transaction Number', type: 'derived', derivedFrom: 'transactionNumber', readOnly: true },
      { key: 'formSubmissionDate', label: 'Form Submission Date', type: 'date', required: true },
      { key: 'agency', label: 'Government Agency', type: 'select', required: true, options: ['SSS (Social Security System)', 'HDMF (Pag-IBIG Fund)'] },
      { key: 'loanProgram', label: 'Government Loan Type', type: 'select', required: true, options: ['Salary Loan', 'Calamity Loan', 'Multi-Purpose Loan (MPL)', 'Housing Loan Amortization'] },
      { key: 'loanAmount', label: 'Loan Amount', type: 'number', required: true, placeholder: 'e.g. 30000.00' },
      { key: 'purpose', label: 'Loan Purpose', type: 'select', required: true, options: ['Medical', 'Education', 'Housing', 'Emergency', 'Others'] },
      { ...reasonField, label: 'Employee Remarks', required: false },
      attachmentsField,
    ],
  },
  {
    key: 'staggered-payment',
    group: 'employee-requests',
    requestType: REQUEST_TYPES.STAGGERED_PAYMENT,
    title: 'Staggered Payment Request',
    cardLabel: 'Staggered Payment Request',
    applyLabel: 'Request Staggered Payment',
    modalTitle: 'Submit Staggered Payment Request',
    viewTitle: 'View Staggered Payment Request',
    icon: 'bank',
    reviewStep: true,
    reviewTitle: 'Review staggered payment arrangement',
    columns: [
      { key: 'applicationDate', label: 'Application Date', type: 'date' },
      { key: 'eligibleDeduction', label: 'Eligible Deduction' },
      { key: 'projectedTakeHome', label: 'Projected Take-Home Pay' },
      { key: 'minimumTakeHome', label: 'Minimum Take-Home Pay' },
      { key: 'staggerOption', label: 'Selected Option' },
      { key: 'applicablePayroll', label: 'Applicable Payroll' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'applicablePayroll', label: 'Applicable Payroll / Cutoff', type: 'text', required: true, placeholder: 'e.g. 2026-10-16 to 2026-10-31' },
      { key: 'projectedTakeHome', label: 'Projected Take-Home Pay (PHP)', type: 'text', readOnly: true },
      { key: 'minimumTakeHome', label: 'Minimum Take-Home Pay (PHP)', type: 'text', readOnly: true },
      { key: 'eligibleDeduction', label: 'Eligible Deduction', type: 'select', required: true, optionsFrom: 'staggeredDeductions' },
      { key: 'staggerOption', label: 'Staggered-Payment Option', type: 'select', required: true, optionsFrom: 'staggeredPaymentOptions' },
      { key: 'reason', label: 'Employee Remarks', type: 'textarea', required: true, placeholder: 'Explain why you are requesting the staggered arrangement' },
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
    // The purpose decides which addressee details are asked for, as in Atlas Core.
    columns: [
      { key: 'applicationDate', label: 'Date Requested', type: 'date' },
      { key: 'dateNeeded', label: 'Date Needed', type: 'date' },
      { key: 'purpose', label: 'Purpose' },
      { key: 'reason', label: 'Employee Remarks' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
    ],
    fields: [
      { key: 'applicationDate', label: 'Date Requested', type: 'date', readOnly: true },
      { key: 'dateNeeded', label: 'Date Needed', type: 'date', required: true },
      { key: 'purpose', label: 'Purpose', type: 'select', required: true, options: ['Bank / Loan Application', 'Visa Application', 'Employment Requirement', 'Others'] },
      { key: 'bankName', label: 'Bank Name', type: 'text', required: true, showWhen: { purpose: ['Bank / Loan Application'] } },
      { key: 'companyName', label: 'Company/Institution Name', type: 'text', required: true, showWhen: { purpose: ['Employment Requirement', 'Others'] } },
      { key: 'addressedTo', label: 'Receipient Name', type: 'text', placeholder: 'e.g. To Whom It May Concern' },
      { key: 'recipientAddress', label: 'Recipient Address', type: 'text' },
      { key: 'visaCountry', label: 'Country for Visa Application', type: 'text', required: true, showWhen: { purpose: ['Visa Application'] } },
      { key: 'otherDetails', label: 'Other Details', type: 'text', showWhen: { purpose: ['Others'] } },
      { key: 'withCompensation', label: 'With Salary Information?', type: 'radio', required: true, options: ['Yes', 'No'], default: 'No' },
      { ...reasonField, label: 'Employee Remarks', required: false, placeholder: 'Input remarks' },
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
      { key: 'documentType', label: 'Document Type', type: 'select', required: true, options: ['BIR Form 2316 (Certificate of Compensation/Tax Withheld)', 'BIR Form 2307 (Certificate of Creditable Tax Withheld at Source)', 'PhilHealth MDR (Member Data Record)', 'PhilHealth Contribution Certificate', 'SSS Certificate of Contributions', 'SSS Loan Certificate', 'Pag-IBIG Contribution Summary', 'Pag-IBIG Loan Certificate', 'Service Record / Work History', 'Company ID Replacement', 'Official Payslip Certified Copy'] },
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
      { key: 'submittedFile', label: 'Submitted File' },
      { key: 'remarks', label: 'Employee Remarks' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'statusDate', label: 'Status Date', type: 'date' },
      filedByColumn,
      actionedByColumn,
      { key: 'approverRemarks', label: 'Approver Remarks', fromRequest: true },
    ],
    fields: [
      { key: 'applicationDate', label: 'Application Date', type: 'date', readOnly: true },
      { key: 'reason', label: 'Reason for Resignation', type: 'select', required: true, options: ['Career Growth / Opportunity', 'Relocation / Overseas Employment', 'Personal / Family Reasons', 'Higher Education / Studies', 'Health / Medical Condition', 'Retirement', 'Termination', 'Others'] },
      { key: 'specifyReason', label: 'Specify Reason', type: 'text', required: true, showWhen: { reason: ['Others'] } },
      { key: 'effectivityDate', label: 'Effectivity Date', type: 'date', required: true },
      { key: 'remarks', label: 'Employee Remarks', type: 'textarea', placeholder: 'Detail handover plan or reason for departure' },
      { key: 'submissionType', label: 'Submission Type', type: 'radio', required: true, options: ['System-generated', 'Employee Submission'], default: 'Employee Submission' },
      { ...attachmentsField, label: 'Upload Resignation Letter', showWhen: { submissionType: ['Employee Submission'] } },
    ],
  },
];

/**
 * Atlas Core lists Filed By and Actioned By on every application except the
 * Transfer Request list (neither) and Shift Change (Filed By only). Petty Cash,
 * Document Request and Staggered Payment are mockup additions and follow the same rule.
 */
const AUDIT_COLUMNS_FOR = { transfer: [], 'shift-change': [filedByColumn] };
export const applicationDefinitions = Object.freeze(baseDefinitions.map(definition => ({
  ...definition,
  columns: [...definition.columns, ...(AUDIT_COLUMNS_FOR[definition.key] ?? auditColumns).filter(column => !definition.columns.some(existing => existing.key === column.key))],
})));

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
    { applicationDate: seedDate, leaveType: 'Vacation', durationType: 'Whole Day', leaveStart: '2026-05-10', leaveEnd: '2026-05-12', filedDays: 3, reason: 'Planned family trip.' },
    { applicationDate: seedDate, leaveType: 'Sick', durationType: 'First Half', leaveStart: '2026-04-28', leaveEnd: '2026-04-28', filedDays: 0.5, reason: 'Medical consultation.' },
    { applicationDate: seedDate, leaveType: 'Emergency', durationType: 'Whole Day', leaveStart: '2026-05-04', leaveEnd: '2026-05-05', filedDays: 2, reason: 'Household emergency.' },
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
    { applicationDate: seedDate, reimbursementType: 'Travel & Accommodation', amount: '4800.00', reason: 'Out of town client visit lodging and meals.', records: [{ recordId: 'seed-rb-1', reimbursementType: 'Travel & Accommodation', dateOfExpense: '2026-04-20', currency: 'PHP', amount: '3600.00', receiptDate: '2026-04-20', orNumber: 'OR-948201', description: 'Hotel, 2 nights' }, { recordId: 'seed-rb-2', reimbursementType: 'Meals', dateOfExpense: '2026-04-21', currency: 'PHP', amount: '1200.00', receiptDate: '2026-04-21', orNumber: 'OR-948233', description: 'Client lunch' }] },
    { applicationDate: seedDate, reimbursementType: 'Communication', amount: '2990.00', reason: 'Department annual subscription renewal.', records: [{ recordId: 'seed-rb-3', reimbursementType: 'Communication', dateOfExpense: '2026-04-22', currency: 'PHP', amount: '2990.00', receiptDate: '2026-04-22', orNumber: 'INV-2026-88', description: 'Mobile data plan' }] },
  ],
  [REQUEST_TYPES.CASH_ADVANCE]: [
    { applicationDate: seedDate, advanceType: 'Official Travel Advance', chargeCode: CHARGE_CODES[0], amount: '15000.00', liquidationDeadline: '2026-05-15', purpose: 'Operational expenses for Cebu site audit and training.', reason: 'Itinerary attached.', policyAgreed: true, periodStartDate: '2026-05-16', periodEndDate: '2026-05-31', deductionAmount: '7500.00', paymentMode: 'Semi-Monthly', frequency: 'Every Cutoff' },
    { applicationDate: seedDate, advanceType: 'Project Advance', chargeCode: CHARGE_CODES[1] || CHARGE_CODES[0], amount: '8000.00', liquidationDeadline: '2026-05-10', purpose: 'Workshop catering and venue deposit.', reason: '', policyAgreed: true, periodStartDate: '2026-05-16', periodEndDate: '2026-05-31', deductionAmount: '4000.00', paymentMode: 'Semi-Monthly', frequency: 'Every Cutoff' },
  ],
  [REQUEST_TYPES.COMPANY_LOAN]: [
    { applicationDate: seedDate, loanType: 'Emergency Loan', principalAmount: '25000.00', termMonths: '12', interestRate: '0%', purpose: 'Housing', monthlyDeduction: '2083.33', reason: 'Home repairs following storm.', authorizeDeduction: true, periodStartDate: '2026-05-16', periodEndDate: '2027-05-15', paymentMode: 'Semi-Monthly', frequency: 'Every Cutoff' },
    { applicationDate: seedDate, loanType: 'Salary Loan', principalAmount: '50000.00', termMonths: '24', interestRate: '0%', purpose: 'Education', monthlyDeduction: '2083.33', reason: 'Tuition and academic fees.', authorizeDeduction: true, periodStartDate: '2026-05-16', periodEndDate: '2028-05-15', paymentMode: 'Semi-Monthly', frequency: 'Every Cutoff' },
  ],
  [REQUEST_TYPES.GOVERNMENT_LOAN]: [
    { applicationDate: seedDate, formSubmissionDate: seedDate, agency: 'SSS (Social Security System)', loanProgram: 'Salary Loan', loanAmount: '28800.00', loanTerms: '24', interestRate: '10', purpose: 'Emergency', loanReferenceNo: 'SSS-SL-2026-9482', monthlyAmortization: '1200.00', periodStartDate: '2026-06-01', periodEndDate: '2028-05-31', paymentMode: 'Semi-Monthly', frequency: 'Second Payroll', reason: 'Approved SSS salary loan payroll deduction setup.' },
    { applicationDate: seedDate, formSubmissionDate: seedDate, agency: 'HDMF (Pag-IBIG Fund)', loanProgram: 'Multi-Purpose Loan (MPL)', loanAmount: '20400.00', loanTerms: '24', interestRate: '10.5', purpose: 'Housing', loanReferenceNo: 'HDMF-MPL-44910', monthlyAmortization: '850.00', periodStartDate: '2026-06-01', periodEndDate: '2028-05-31', paymentMode: 'Semi-Monthly', frequency: 'Second Payroll', reason: 'Approved Pag-IBIG MPL amortization.' },
  ],
  [REQUEST_TYPES.STAGGERED_PAYMENT]: [
    { applicationDate: seedDate, eligibleDeduction: 'TRX-00002 · Salary Loan', projectedTakeHome: '4,250.00', minimumTakeHome: '6,000.00', staggerOption: 'Split across 3 payroll cutoffs', installments: 3, applicablePayroll: '2026-05-01 to 2026-05-15', reason: 'Please stagger the company loan deduction to protect the configured minimum take-home pay.' },
    { applicationDate: seedDate, eligibleDeduction: 'TRX-00004 · Medical Loan', projectedTakeHome: '5,100.00', minimumTakeHome: '6,000.00', staggerOption: 'Split across 2 payroll cutoffs', installments: 2, applicablePayroll: '2026-05-16 to 2026-05-31', reason: 'Medical expenses require a lower deduction this cutoff.' },
    { applicationDate: seedDate, eligibleDeduction: 'TRX-00006 · Company Loan', projectedTakeHome: '4,800.00', minimumTakeHome: '6,000.00', staggerOption: 'Split across 4 payroll cutoffs', installments: 4, applicablePayroll: '2026-06-01 to 2026-06-15', reason: 'Requesting the longest approved company option.' },
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
    { applicationDate: seedDate, reason: 'Termination', effectivityDate: '2026-05-03', submissionType: 'System-generated', submittedFile: 'System-generated letter', remarks: 'Lorem Ipsum Seminar', separationReasonBir: 'Termination' },
    { applicationDate: seedDate, reason: 'Career Growth / Opportunity', effectivityDate: '2026-06-01', submissionType: 'Employee Submission', submittedFile: 'Resignation_Letter.pdf', remarks: 'Pursuing senior technical role.', separationReasonBir: 'Resignation' },
    { applicationDate: seedDate, reason: 'Personal / Family Reasons', effectivityDate: '2026-05-15', submissionType: 'Employee Submission', submittedFile: 'Resignation_Letter.pdf', remarks: 'Relocation to provincial hometown.', separationReasonBir: 'Resignation' },
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
        const variant = variants[statusIndex % variants.length];
        if (!variant) return;
        // Seeded rows get their own transaction numbers, as a filed one would.
        const details = definition.transactionPrefix ? { ...variant, [definition.transactionKey || 'transactionNo']: `${definition.transactionPrefix}-2026-${String(rows.length + 1).padStart(4, '0')}` } : variant;
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
