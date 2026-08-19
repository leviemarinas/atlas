/**
 * The HRM posting engine.
 *
 * A self-service filing and the register an administrator monitors are the
 * same transaction seen from two ends.  Before this module the two were
 * separate stores: an employee could file a company loan that never reached
 * Loan Management, and an approver could approve leave without a single day
 * leaving the employee's balance.
 *
 * Everything here is keyed on `sourceRequestId`, so posting the same request
 * twice updates the row it already created rather than adding a second one.
 * That makes the functions safe to call on every submit, edit and decision.
 *
 * Leave is the exception and is deliberately *not* posted: a balance is
 * derived from the request store on read (`leaveLedgerFor`), because a stored
 * copy of a derived number is what lets a balance drift from its own history.
 */

import { REQUEST_TYPES, REQUEST_STATUSES } from './requestWorkflow.js';
import { LEAVE_TYPES, findEmployee, leaveUsageFor } from './hrmData.js';

const text = value => String(value ?? '').trim();
const num = value => Number(value || 0) || 0;

/** Register rows and requests share this vocabulary, so no mapping is needed. */
export const REGISTER_STATUSES = Object.freeze({
  PENDING: REQUEST_STATUSES.PENDING_APPROVAL,
  APPROVED: REQUEST_STATUSES.APPROVED,
  REJECTED: REQUEST_STATUSES.REJECTED,
});

/** A request only reaches a register once it has actually been submitted. */
function isPostable(request) {
  return Boolean(request?.requestId) && text(request.status) !== REQUEST_STATUSES.DRAFT;
}

function decidedOn(request) {
  return text(request?.decidedAt || request?.statusDate || request?.updatedAt || '').slice(0, 10);
}

function statusDateFor(request) {
  return text(request?.status) === REQUEST_STATUSES.PENDING_APPROVAL ? '' : decidedOn(request);
}

function approverName(request) {
  return text(request?.decidedBy?.displayName || request?.decidedBy?.name || request?.assignedApprover?.displayName || '');
}

/* ============================================================ leave ledger */

/** Re-exported so a screen needs only this module to read the leave chain. */
export { leaveUsageFor };

/**
 * One ledger row per leave type for one employee.
 *
 * `openingBalance` is the accrual the masterfile granted; `approvedLeave`
 * combines the usage already carried on the masterfile row with leave
 * approved through the request store, so the ledger and the balance cards can
 * never disagree.
 */
export function leaveLedgerFor(data = {}, requests = [], employeeId) {
  const wanted = text(employeeId);
  const usage = leaveUsageFor(requests, wanted);
  const stored = (data.leaveBalances || []).filter(row => text(row.employeeId) === wanted);
  return LEAVE_TYPES.map(leaveType => {
    const row = stored.find(entry => entry.leaveType === leaveType);
    if (!row) return null;
    const entry = usage.get(leaveType) || { approved: 0, pending: 0 };
    const openingBalance = num(row.accrued);
    const approvedLeave = num(row.used) + entry.approved;
    const leaveForApproval = entry.pending;
    const leaveConverted = num(row.converted);
    const forfeitedLeave = num(row.forfeited);
    return {
      employeeId: wanted,
      leaveType,
      openingBalance,
      approvedLeave,
      leaveForApproval,
      leaveConverted,
      forfeitedLeave,
      // What is left once spent, committed, converted and forfeited days are
      // all taken off the accrual.
      balanceToday: openingBalance - approvedLeave - leaveForApproval - leaveConverted - forfeitedLeave,
    };
  }).filter(Boolean);
}

/* ======================================================= register postings */

/** Where each request type lands, and how its row is built. */
const registerPostings = {
  [REQUEST_TYPES.COMPANY_LOAN]: {
    field: 'companyLoans',
    key: 'transactionNo',
    prefix: 'TRX',
    build: (request, details, employee) => ({
      employeeId: request.employeeId,
      division: employee?.department || '',
      applicationDate: text(details.applicationDate),
      loanType: text(details.loanType || details.loanName),
      loanAmount: num(details.principalAmount || details.loanAmount),
      loanTerms: num(details.termMonths || details.loanTerms),
      purpose: text(details.purpose || details.reason),
      employeeRemarks: text(details.reason),
      interestRate: null,
      interestAmount: null,
      totalLoan: num(details.principalAmount || details.loanAmount),
      accumulatedPayments: null,
      payrollCutoffStart: text(details.startDate || details.periodStartDate),
      payrollCutoffEnd: text(details.endDate || details.periodEndDate),
      deductionAmount: num(details.loanAmortization || details.deductionAmount),
      paymentMode: text(details.paymentMode) || 'Monthly',
      frequency: text(details.frequency) || 'Every Payroll',
      attachments: details.attachments || [],
    }),
  },
  [REQUEST_TYPES.GOVERNMENT_LOAN]: {
    field: 'governmentLoans',
    key: 'transactionNo',
    prefix: 'TRX',
    build: (request, details) => ({
      employeeId: request.employeeId,
      applicationDate: text(details.applicationDate),
      formSubmissionDate: text(details.applicationDate),
      governmentLoanType: text(details.loanType || details.governmentLoanType),
      governmentAgency: text(details.governmentAgency || details.agency),
      dateGranted: '',
      loanAmount: num(details.principalAmount || details.loanAmount),
      loanTerms: num(details.termMonths || details.loanTerms),
      totalLoan: num(details.principalAmount || details.loanAmount),
      purpose: text(details.purpose || details.reason),
      employeeRemarks: text(details.reason),
      interestRate: null,
      interestAmount: null,
      periodStartDate: text(details.startDate || details.periodStartDate),
      periodEndDate: text(details.endDate || details.periodEndDate),
      deductionAmount: num(details.loanAmortization || details.deductionAmount),
      attachments: details.attachments || [],
    }),
  },
  [REQUEST_TYPES.CASH_ADVANCE]: {
    field: 'cashAdvances',
    key: 'transactionNo',
    prefix: 'TRX',
    build: (request, details, employee) => ({
      employeeId: request.employeeId,
      division: employee?.department || '',
      applicationDate: text(details.applicationDate),
      cashAdvanceType: text(details.advanceType || details.cashAdvanceType),
      chargeCode: text(details.chargeCode),
      amountRequested: num(details.amount || details.amountRequested),
      liquidationDeadline: text(details.liquidationDeadline),
      purpose: text(details.purpose || details.reason),
      employeeRemarks: text(details.reason),
      approverRemarks: '',
    }),
  },
  [REQUEST_TYPES.CASH_ADVANCE_LIQUIDATION]: {
    field: 'liquidations',
    key: 'liquidationNumber',
    prefix: 'LQ',
    build: (request, details, employee) => ({
      cashAdvanceNo: text(details.cashAdvanceNo),
      employeeId: request.employeeId,
      division: employee?.department || '',
      applicationDate: text(details.applicationDate),
      chargeCode: text(details.chargeCode),
      cashAdvanceAmount: num(details.cashAdvanceAmount),
      cashReturned: num(details.cashReturned),
      cashReturnOrNumber: text(details.cashReturnOrNumber),
      liquidationDue: text(details.liquidationDue),
      records: Array.isArray(details.records) && details.records.length
        ? details.records
        : [{
            recordId: `lqr-${request.requestId}`,
            dateOfExpense: text(details.applicationDate),
            currency: 'Philippine Peso',
            amount: num(details.totalExpenses),
            description: text(details.particulars || details.reason),
            attachments: details.attachments || [],
          }],
      employeeRemarks: text(details.reason),
      approverRemarks: '',
    }),
  },
  [REQUEST_TYPES.EXPENSE_REIMBURSEMENT]: {
    field: 'reimbursements',
    key: 'transactionNo',
    prefix: 'TRX',
    build: (request, details, employee) => ({
      employeeId: request.employeeId,
      division: employee?.department || '',
      applicationDate: text(details.applicationDate),
      type: text(details.reimbursementType || details.type),
      records: Array.isArray(details.records) && details.records.length
        ? details.records
        : [{
            recordId: `rec-${request.requestId}`,
            dateOfExpense: text(details.receiptDate || details.applicationDate),
            currency: 'Philippine Peso',
            amount: num(details.amount),
            description: text(details.particulars || details.reason),
            receiptDate: text(details.receiptDate),
            orNumber: text(details.orNumber),
            attachments: details.attachments || [],
          }],
      employeeRemarks: text(details.reason),
      approverRemarks: '',
    }),
  },
  [REQUEST_TYPES.RESIGNATION]: {
    field: 'resignations',
    key: 'id',
    prefix: 'RES',
    build: (request, details, employee) => ({
      applicationDate: text(details.applicationDate),
      employeeId: request.employeeId,
      employeeCode: employee?.employeeCode || '',
      employeeName: employee?.name || text(details.employeeName),
      department: employee?.department || '',
      division: employee?.division || '',
      reason: text(details.reason),
      effectivityDate: text(details.effectivityDate),
      employeeRemarks: text(details.remarks || details.reason),
      submissionType: text(details.submissionType) || 'Employee Submission',
      submittedFile: (details.attachments || [])[0] || null,
      separationReasonBir: '',
      approverRemarks: '',
      filedBy: employee?.name || '',
    }),
  },
  [REQUEST_TYPES.COE_REQUEST]: {
    field: 'coeRequests',
    key: 'id',
    prefix: 'COE',
    build: (request, details, employee) => ({
      dateRequested: text(details.applicationDate),
      employeeId: request.employeeId,
      employeeCode: employee?.employeeCode || '',
      employeeName: employee?.name || text(details.employeeName),
      jobTitle: employee?.position || '',
      department: employee?.department || '',
      division: employee?.division || '',
      dateNeeded: text(details.dateNeeded),
      purpose: text(details.purpose),
      companyInstitutionName: text(details.addressedTo),
      recipientAddress: text(details.recipientAddress),
      withSalaryInfo: text(details.withCompensation).startsWith('Yes') ? 'Yes' : 'No',
      employeeRemarks: text(details.reason),
      coeType: 'System-generated',
      // The certificate itself is produced by the approver, so a freshly
      // filed request carries no file and offers "Add COE" rather than
      // "Approve" until one is attached.
      coeFile: null,
    }),
  },
};

function nextIdentifier(rows, key, prefix, width) {
  const used = rows.reduce((highest, row) => {
    const match = String(row[key] ?? '').match(/(\d+)\s*$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${prefix}-${String(used + 1).padStart(width, '0')}`;
}

/**
 * Project one request into the register its type belongs to.
 *
 * Returns the next `data`.  Types with no register (time correction,
 * overtime, transfer and the rest) are approved against the request store
 * alone and pass through unchanged.
 */
export function syncRequestIntoRegisters(data = {}, request) {
  if (!isPostable(request)) return data;
  const posting = registerPostings[request.requestType];
  if (!posting) return data;

  const rows = data[posting.field] || [];
  const existing = rows.find(row => row.sourceRequestId === request.requestId);
  const details = request.requestDetails || {};
  const employee = findEmployee(data, request.employeeId);
  const width = posting.prefix === 'TRX' ? 5 : 4;

  const decided = {
    status: text(request.status),
    statusDate: statusDateFor(request),
    actionedBy: approverName(request),
    approverRemarks: text(request.decisionRemarks || request.remarks || ''),
  };

  if (existing) {
    // An edit or a decision updates the row the filing already created.
    const next = rows.map(row => row.sourceRequestId === request.requestId
      ? { ...row, ...posting.build(request, details, employee), ...decided, [posting.key]: row[posting.key], sourceRequestId: request.requestId }
      : row);
    return { ...data, [posting.field]: next };
  }

  const created = {
    [posting.key]: nextIdentifier(rows, posting.key, posting.prefix, width),
    sourceRequestId: request.requestId,
    ...posting.build(request, details, employee),
    ...decided,
  };
  return { ...data, [posting.field]: [created, ...rows] };
}

/* ================================================== separation → clearance */

/**
 * An approved resignation opens the offboarding case.
 *
 * Clearance is what makes a separation a process rather than a status: it
 * carries the checklist the employee has to complete and is what Final Pay
 * and the quit claim wait on.  Creating it by hand after every approval is
 * exactly the step that gets missed, so the approval does it.
 */
export function openClearanceForSeparation(data = {}, resignation) {
  if (!resignation || text(resignation.status) !== REGISTER_STATUSES.APPROVED) return data;
  const employeeId = text(resignation.employeeId);
  if (!employeeId) return data;

  const applications = data.clearanceApplications || [];
  if (applications.some(row => row.sourceResignationId === resignation.id)) return data;

  const employee = findEmployee(data, employeeId);
  const templates = data.offboardingChecklistTemplates || [];
  const sequence = String(applications.length + 1).padStart(3, '0');

  const application = {
    id: `clr-${sequence}`,
    sourceResignationId: resignation.id,
    applicationDate: text(resignation.statusDate) || text(resignation.applicationDate),
    employeeId,
    employeeCode: resignation.employeeCode || employee?.employeeCode || '',
    employeeName: resignation.employeeName || employee?.name || '',
    requester: resignation.employeeName || employee?.name || '',
    jobTitle: employee?.position || '',
    division: resignation.division || '',
    department: resignation.department || employee?.department || '',
    effectivityDate: text(resignation.effectivityDate),
    filedBy: resignation.employeeName || employee?.name || '',
    actionedBy: '-',
    approverRemarks: '-',
    // The case opens unassigned: an approver still has to set the checklist
    // before the employee can start completing it.
    status: 'Pending',
    statusDate: text(resignation.statusDate),
    checklist: templates.map(template => ({ ...template, done: false })),
    submittedFiles: [],
  };
  return { ...data, clearanceApplications: [application, ...applications] };
}

/**
 * An approved clearance is what entitles the employee to their quit claim and
 * final pay, so approving one drafts the quit claim rather than leaving an
 * administrator to notice.
 */
export function openQuitClaimForClearance(data = {}, clearance) {
  if (!clearance || text(clearance.status) !== 'Approved') return data;
  const employeeId = text(clearance.employeeId);
  if (!employeeId) return data;

  const claims = data.finalQuitClaims || [];
  if (claims.some(row => row.sourceClearanceId === clearance.id)) return data;

  const employee = findEmployee(data, employeeId);
  const sequence = String(claims.length + 1).padStart(3, '0');

  const claim = {
    id: `qc-${sequence}`,
    sourceClearanceId: clearance.id,
    applicationDate: text(clearance.statusDate) || text(clearance.applicationDate),
    employeeId,
    employeeCode: clearance.employeeCode || employee?.employeeCode || '',
    employeeName: clearance.employeeName || employee?.name || '',
    department: clearance.department || employee?.department || '',
    division: clearance.division || '',
    jobTitle: clearance.jobTitle || employee?.position || '',
    quitClaimStatus: 'Pending',
    finalClaimStatus: 'Pending',
    statusDate: text(clearance.statusDate),
    documentTitle: `Quitclaim & Release - ${clearance.employeeName || employee?.name || employeeId}`,
    author: text(clearance.actionedBy) || '',
    submissionType: 'Manual Input',
    content: '',
    recipient: { fullName: clearance.employeeName || employee?.name || '', email: '', birthday: '', acknowledgementNotice: '' },
    files: [],
    signedFile: null,
    approverRemarks: '-',
    employeeRemarks: '-',
  };
  return { ...data, finalQuitClaims: [claim, ...claims] };
}

/* ============================================== approved loan → deductions */

/**
 * Each payment mode's period length. Stepping by the real unit — 7 days for
 * a weekly deduction, a calendar month for a monthly one — is what a
 * fractional "months per period" collapsed: rounding 0.25-month steps to the
 * nearest whole month put four consecutive weekly periods on the same date.
 */
const PERIOD_STEP = {
  Weekly: { days: 7 },
  'Semi-Monthly': { days: 15 },
  Monthly: { months: 1 },
  Quarterly: { months: 3 },
};

/** Adds `count` whole periods to `iso`, in UTC so the date never drifts a day with the local timezone. */
function addPeriods(iso, paymentMode, count) {
  const source = text(iso) || new Date().toISOString().slice(0, 10);
  const [year, month, day] = source.split('-').map(Number);
  if (!year || !month || !day) return '';
  const step = PERIOD_STEP[paymentMode] || PERIOD_STEP.Monthly;
  const base = new Date(Date.UTC(year, month - 1, day));
  if (step.days) base.setUTCDate(base.getUTCDate() + step.days * count);
  else base.setUTCMonth(base.getUTCMonth() + step.months * count);
  return base.toISOString().slice(0, 10);
}

/**
 * An approved loan becomes a deduction schedule.
 *
 * This is the authority-to-deduct record the employee acknowledges and the
 * row Loan Inquiry reads, so an approved loan is visible as money owed rather
 * than as a decided application nobody collects against.
 */
export function openLoanScheduleForLoan(data = {}, loan, loanType) {
  if (!loan || text(loan.status) !== REGISTER_STATUSES.APPROVED) return data;
  const employeeId = text(loan.employeeId);
  if (!employeeId) return data;

  const inquiries = data.loanInquiries || [];
  const transactionNo = text(loan.transactionNo);
  if (inquiries.some(row => row.sourceTransactionNo === transactionNo && text(row.employeeId) === employeeId)) return data;

  const principal = num(loan.loanAmount);
  const interest = num(loan.interestAmount);
  const total = num(loan.totalLoan) || principal + interest;
  const terms = num(loan.loanTerms) || 1;
  const paymentMode = text(loan.paymentMode) || 'Monthly';
  const perPeriod = num(loan.deductionAmount) || Math.round((total / terms) * 100) / 100;
  const start = text(loan.payrollCutoffStart || loan.periodStartDate) || text(loan.statusDate);

  const schedule = {
    id: `LN-${transactionNo}`,
    sourceTransactionNo: transactionNo,
    employeeId,
    applicationDate: text(loan.applicationDate),
    transactionNumber: transactionNo,
    loanName: text(loan.loanType || loan.governmentLoanType),
    loanType,
    principalAmount: principal,
    loanTerms: terms,
    interestRate: num(loan.interestRate),
    interestAmount: interest,
    totalLoan: total,
    periodStartDate: start,
    periodEndDate: text(loan.payrollCutoffEnd || loan.periodEndDate) || addPeriods(start, paymentMode, terms),
    deductionAmount: perPeriod,
    paymentMode,
    frequency: text(loan.frequency) || 'Every Payroll',
    accumulatedPaymentManual: 0,
    accumulatedPaymentComputed: 0,
    balance: total,
    status: 'ACTIVE',
    statusDate: text(loan.statusDate),
    // The employee has to acknowledge the deduction before payroll collects
    // it; the schedule exists either way so the obligation is never invisible.
    authorityToDeduct: { acknowledged: false, acknowledgedAt: '', advisedOn: text(loan.statusDate) },
    // A collection never exceeds the outstanding balance: the final period
    // settles whatever is left, and the schedule stops there rather than
    // listing periods that would collect nothing.
    deductionMatrix: Array.from({ length: terms }, (_, index) => {
      const outstanding = Math.max(total - perPeriod * index, 0);
      return {
        payoutPeriod: addPeriods(start, paymentMode, index + 1),
        deductionAmount: Math.round(Math.min(perPeriod, outstanding) * 100) / 100,
      };
    }).filter(row => row.deductionAmount > 0),
  };
  return { ...data, loanInquiries: [schedule, ...inquiries] };
}

/**
 * Record an employee's acknowledgement of a loan or cash advance deduction.
 * BRD HT130 and HT141 ask for the authority to deduct as its own step, and it
 * is the employee's own action rather than the approver's.
 */
export function acknowledgeAuthorityToDeduct(data = {}, scheduleId, at) {
  const stamped = text(at) || new Date().toISOString().slice(0, 10);
  return {
    ...data,
    loanInquiries: (data.loanInquiries || []).map(row => row.id === scheduleId
      ? { ...row, authorityToDeduct: { ...(row.authorityToDeduct || {}), acknowledged: true, acknowledgedAt: stamped } }
      : row),
  };
}

/**
 * The whole chain in one call, for the screens that decide a request.
 *
 * Posting the request comes first because the downstream steps read the row
 * it creates: a resignation has to exist as a register row before it can open
 * a clearance case.
 */
export function applyRequestDecision(data = {}, request) {
  let next = syncRequestIntoRegisters(data, request);
  if (request?.requestType === REQUEST_TYPES.RESIGNATION && request.status === REQUEST_STATUSES.APPROVED) {
    const resignation = (next.resignations || []).find(row => row.sourceRequestId === request.requestId);
    next = openClearanceForSeparation(next, resignation);
  }
  return next;
}
