export const staggeredPaymentOptions = Object.freeze([
  { label: 'Split across 2 payroll cutoffs', installments: 2 },
  { label: 'Split across 3 payroll cutoffs', installments: 3 },
  { label: 'Split across 4 payroll cutoffs', installments: 4 },
]);

export function installmentsForOption(label) {
  return staggeredPaymentOptions.find(option => option.label === label)?.installments || 1;
}

export function staggeredEligibility({ salaryRecord, loanSchedules = [], takeHomePolicy = {} } = {}) {
  const basic = salaryRecord?.basicPay?.[0] || {};
  const gross = Number(basic.monthlyRate || basic.basicPayAmount || 0) / 2;
  const eligible = loanSchedules.filter(row => ['ACTIVE', 'Approved'].includes(row.status) && Number(row.balance ?? row.totalLoan ?? 0) > 0);
  const scheduledDeductions = eligible.reduce((sum, row) => sum + Number(row.deductionAmount || 0), 0);
  const minimum = takeHomePolicy.thresholdType === 'Fixed Amount'
    ? Number(takeHomePolicy.threshold || 0)
    : gross * Number(takeHomePolicy.threshold || 0) / 100;
  const projectedTakeHome = gross - scheduledDeductions;
  return {
    gross,
    scheduledDeductions,
    minimum,
    projectedTakeHome,
    isEligible: eligible.length > 0 && projectedTakeHome < minimum,
    deductions: eligible.map(row => ({ id: row.transactionNumber || row.id, name: row.loanName || row.loanType || 'Company Loan', due: Number(row.deductionAmount || 0) })),
  };
}

export function staggeredDue(originalDue, request) {
  const installments = Number(request?.requestDetails?.installments || installmentsForOption(request?.requestDetails?.staggerOption));
  return Math.round((Number(originalDue || 0) / Math.max(1, installments)) * 100) / 100;
}

export function requestAppliesToTransaction(request, transaction = {}) {
  const dates = String(request?.requestDetails?.applicablePayroll || '').match(/\d{4}-\d{2}-\d{2}/g) || [];
  if (dates.length < 2) return false;
  const requestWindow = { effectiveFrom: dates[0], effectiveTo: dates[1] };
  const transactionWindow = {
    effectiveFrom: transaction.periodStart || transaction.payoutDate || '',
    effectiveTo: transaction.periodEnd || transaction.payoutDate || '',
  };
  return Boolean(transactionWindow.effectiveFrom && transactionWindow.effectiveTo)
    && requestWindow.effectiveFrom <= transactionWindow.effectiveTo
    && transactionWindow.effectiveFrom <= requestWindow.effectiveTo;
}
