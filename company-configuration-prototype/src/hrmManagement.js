/**
 * The Management & Approvals registry.
 *
 * Part 2 of the P&A HRM masterfile gives the approver their own module: a
 * secondary sidebar of management areas, each with a landing page of screens.
 * Every screen is one entry here, so the sidebar, the landing cards and the
 * router all read the same list.
 */

import { applicationDefinitions } from './hrmApplications.js';

/** The secondary sidebar, in masterfile order. */
export const managementGroups = Object.freeze([
  { key: 'time-management', label: 'Time Management', icon: 'clock' },
  { key: 'leave-management', label: 'Leave Management', icon: 'suitcase' },
  { key: 'work-shift-management', label: 'Work/Shift Management', icon: 'calendar' },
  { key: 'expense-management', label: 'Expense Management', icon: 'receipt' },
  { key: 'loan-management', label: 'Loan Management', icon: 'bank' },
  { key: 'employee-requests-management', label: 'Employee Requests Management', icon: 'clipboard' },
  { key: 'validation-team-members', label: 'Validation of Team Members', icon: 'users' },
  { key: 'health-wellness-approval', label: 'Health and Wellness Approval', icon: 'heart' },
]);

/**
 * `kind` selects the screen component:
 *  - `request`      reuses an Employee Self-service definition's approval queue
 *  - `shift-assignment` is the assignment register, not an approval queue
 *  - the expense kinds are the Part 2 reimbursement, cash advance and
 *    liquidation screens
 *
 * `column` places a screen under the Approvals or Management heading on the
 * Expense Management landing page.
 */
export const managementScreens = Object.freeze([
  { key: 'time-correction-approval', group: 'time-management', kind: 'request', application: 'time-correction', title: 'Time In/Out Correction Manage & Approval', icon: 'clock-clockwise' },
  { key: 'overtime-approval', group: 'time-management', kind: 'request', application: 'overtime', title: 'Overtime Manage & Approval', icon: 'clock-plus' },
  { key: 'ot-offset-approval', group: 'time-management', kind: 'request', application: 'ot-offset', title: 'Offset of OT & Time Off Manage & Approval', icon: 'clock-counter' },

  { key: 'leave-approval', group: 'leave-management', kind: 'request', application: 'leave', title: 'Leave Manage & Approval', icon: 'suitcase' },
  { key: 'time-off-approval', group: 'leave-management', kind: 'request', application: 'time-off', title: 'Time Off Manage & Approval', icon: 'calendar-x' },

  { key: 'shift-change-approval', group: 'work-shift-management', kind: 'request', application: 'shift-change', title: 'Shift Change Manage & Approval', icon: 'calendar-clock' },
  { key: 'shift-assignment', group: 'work-shift-management', kind: 'shift-assignment', title: 'Shift Assignment (Assign Subordinate)', icon: 'clock-counter' },
  { key: 'transfer-approval', group: 'work-shift-management', kind: 'request', application: 'transfer', title: 'Transfer Request Manage & Approval', icon: 'arrows-left-right' },
  { key: 'official-business-approval', group: 'work-shift-management', kind: 'request', application: 'official-business', title: 'Official Business Manage & Approval', icon: 'briefcase' },

  { key: 'reimbursement-approval', group: 'expense-management', column: 'Approvals', kind: 'reimbursement-approval', title: 'Expense/Reimbursement Manage & Approval', cardLabel: 'Expense/Reimbursement Approval', icon: 'receipt' },
  { key: 'cash-advance-approval', group: 'expense-management', column: 'Approvals', kind: 'cash-advance-approval', title: 'Cash Advance Approval', icon: 'cash' },
  { key: 'liquidation-approval', group: 'expense-management', column: 'Approvals', kind: 'liquidation-approval', title: 'Cash Advance Liquidation Approval', icon: 'check-square' },
  { key: 'reimbursement-management', group: 'expense-management', column: 'Management', kind: 'reimbursement-management', title: 'Reimbursement Management', cardLabel: 'Expense/Reimbursement Management', icon: 'receipt' },
  { key: 'cash-advance-management', group: 'expense-management', column: 'Management', kind: 'cash-advance-management', title: 'Cash Advance Management', icon: 'cash' },
  { key: 'liquidation-management', group: 'expense-management', column: 'Management', kind: 'liquidation-management', title: 'Cash Advance Liquidation Management', icon: 'check-square' },
  { key: 'liquidation-request-approval', group: 'expense-management', column: 'Approvals', kind: 'request', application: 'cash-advance-liquidation', title: 'Cash Advance Liquidation Request Approval', cardLabel: 'Cash Advance Liquidation Request Approval', icon: 'check-square' },

  { key: 'company-loan-approval', group: 'loan-management', kind: 'company-loan-approval', title: 'Company Loan Approval', icon: 'cash' },
  { key: 'company-loan-management', group: 'loan-management', kind: 'company-loan-management', title: 'Company Loan Management', icon: 'cash' },
  { key: 'government-loan-approval', group: 'loan-management', kind: 'government-loan-approval', title: 'Government Loan Approval', icon: 'bank' },
  { key: 'government-loan-management', group: 'loan-management', kind: 'government-loan-management', title: 'Government Loan Management', icon: 'bank' },

  { key: 'resignation-approval', group: 'employee-requests-management', column: 'Approvals', kind: 'resignation-approval', title: 'Employee Resignation Approval', cardLabel: 'Employee Resignation Approval', icon: 'user-minus' },
  { key: 'coe-request-approval', group: 'employee-requests-management', column: 'Approvals', kind: 'coe-approval', title: 'Certificate of Employment Request Approval', cardLabel: 'Certificate of Employment Request Approval', icon: 'medal' },
  { key: 'onboarding-documents-approval', group: 'employee-requests-management', column: 'Approvals', kind: 'onboarding-documents-approval', title: 'Employee Onboarding Documents', cardLabel: 'Employee Onboarding Documents', icon: 'file-text' },
  { key: 'resignation-management', group: 'employee-requests-management', column: 'Management', kind: 'resignation-management', title: 'Employee Resignation Management', cardLabel: 'Employee Resignation Management', icon: 'user-minus' },
  { key: 'coe-request-management', group: 'employee-requests-management', column: 'Management', kind: 'coe-management', title: 'Certificate of Employment Management', cardLabel: 'Certificate of Employment Request Management', icon: 'medal' },

  { key: 'team-validation', group: 'validation-team-members', kind: 'team-validation', title: 'Validation of Team Members', icon: 'users' },

  { key: 'wellness-approval', group: 'health-wellness-approval', kind: 'wellness-approval', title: 'Health and Wellness Participation Approval', cardLabel: 'Health and Wellness Approval', icon: 'heart' },
]);

export function managementGroupByKey(key) {
  return managementGroups.find(group => group.key === key) || null;
}

export function managementScreenByKey(key) {
  return managementScreens.find(screen => screen.key === key) || null;
}

export function screensForGroup(groupKey) {
  return managementScreens.filter(screen => screen.group === groupKey);
}

/**
 * Expense Management splits its cards under Approvals and Management; every
 * other group is a single unlabelled list.
 */
export function screenColumnsForGroup(groupKey) {
  const screens = screensForGroup(groupKey);
  const columns = [];
  screens.forEach(screen => {
    const name = screen.column || '';
    const existing = columns.find(column => column.name === name);
    if (existing) existing.screens.push(screen);
    else columns.push({ name, screens: [screen] });
  });
  return columns;
}

/** The self-service definition a `request` screen approves against. */
export function applicationForScreen(screen) {
  return applicationDefinitions.find(definition => definition.key === screen?.application) || null;
}

/** Groups with no screens yet state that plainly rather than rendering blank. */
export function groupHasScreens(groupKey) {
  return screensForGroup(groupKey).length > 0;
}
