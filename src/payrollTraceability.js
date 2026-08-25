/**
 * Human-readable ownership and UI paths for payroll evidence.
 *
 * The payroll engine stays pure and records only calculation facts. This module
 * translates those facts into the Atlas screens that own them, so both Payroll
 * Processing and Scenario Studio can show the same reproducible audit route.
 */

import { plural } from './textFormat.js';

const path = (...segments) => Object.freeze(segments);

export const PAYROLL_UI_PATHS = Object.freeze({
  transaction: path('Payroll', 'Payroll Processing', 'Transaction', 'Computation settings'),
  payrollLine: path('Payroll', 'Payroll Processing', 'Transaction', 'Employee result', 'How it was computed'),
  payslip: path('HRM', 'Employee Self-inquiry', 'Payslips & Payroll History'),
  reports: path('Payroll', 'Reports'),
  computation: path('Core', 'Company Configuration', 'Services Information', 'Computational Basis', 'Computations'),
  assignment: path('Core', 'Company Configuration', 'Services Information', 'Computational Basis', 'Client computation assignments'),
  formulaReference: path('Core', 'Company Configuration', 'Services Information', 'Computational Basis', 'Formula reference sources'),
  standardFormula: path('Settings', 'Standard Computation Library'),
  policy: path('Core', 'Company Configuration', 'Services Information', 'Computational Basis', 'Policy Engines'),
  takeHome: path('Core', 'Company Configuration', 'Services Information', 'Computational Basis', 'Policy Engines', 'Minimum Take-Home Pay'),
  deductionHierarchy: path('Core', 'Company Configuration', 'Services Information', 'Computational Basis', 'Policy Engines', 'Deduction and Loan Hierarchy'),
  basicPayConfig: path('Core', 'Company Configuration', 'Services Information', 'Basic Pay & Pay Rates'),
  salaryBasic: path('HRM', 'Benefits', 'Salary Information', 'Employee', 'Basic Pay'),
  salaryEarnings: path('HRM', 'Benefits', 'Salary Information', 'Employee', 'Earnings'),
  salaryStatutory: path('HRM', 'Benefits', 'Salary Information', 'Employee', 'Statutory Deductions'),
  salaryDeductions: path('HRM', 'Benefits', 'Salary Information', 'Employee', 'Company Deductions'),
  salaryLoans: path('HRM', 'Benefits', 'Salary Information', 'Employee', 'Loans'),
  earningRegister: path('Payroll', 'Earning Management'),
  deductionRegister: path('Payroll', 'Deduction Management'),
  bonusRegister: path('Payroll', 'Bonus Management'),
  payCode: path('Payroll', 'Paycode Management'),
  overtime: path('Timekeeping', 'Overtime Summary'),
  attendance: path('Timekeeping', 'Time & Attendance Summary'),
  companyLoan: path('HRM', 'Management & Approvals', 'Loan Management', 'Company Loan Management'),
  governmentLoan: path('HRM', 'Management & Approvals', 'Loan Management', 'Government Loan Management'),
  loanManagement: path('HRM', 'Management & Approvals', 'Loan Management'),
  loanInquiry: path('HRM', 'Employee Self-inquiry', 'Loan Inquiry'),
  statutory: path('Settings', 'Statutory Table'),
  tax: path('Settings', 'Tax Tables'),
  reference: path('Settings', 'Reference Table'),
});

const ref = (role, feature, uiPath) => ({ role, feature, path: uiPath });
const withCode = (uiPath, code) => [...uiPath, code];

function sourceReference(step) {
  const source = String(step?.source || '');
  if (source.includes('Timekeeping')) return ref('Input record', 'Approved punch, attendance, or overtime', source.toLowerCase().includes('overtime') || /^(ERN-002|ERN-003|ERN-006)$/.test(step.code) ? PAYROLL_UI_PATHS.overtime : PAYROLL_UI_PATHS.attendance);
  if (source === 'Employee salary record') {
    const target = step.category === 'Basic Pay' ? PAYROLL_UI_PATHS.salaryBasic : step.category === 'Earnings' ? PAYROLL_UI_PATHS.salaryEarnings : PAYROLL_UI_PATHS.salaryStatutory;
    return ref('Employee value', 'Employee effective-dated salary information', target);
  }
  if (source === 'Earning Management') return ref('Input register', 'Company earning assignment', PAYROLL_UI_PATHS.earningRegister);
  if (source === 'Deduction Management') return ref('Input register', 'Company deduction schedule', PAYROLL_UI_PATHS.deductionRegister);
  if (source === 'Bonus Management') return ref('Input register', 'Bonus configuration', PAYROLL_UI_PATHS.bonusRegister);
  if (source === 'Company Loan Management') return ref('Loan schedule', 'Approved company loan configuration', PAYROLL_UI_PATHS.companyLoan);
  if (source === 'Government Loan Management') return ref('Loan schedule', 'Approved government loan configuration', PAYROLL_UI_PATHS.governmentLoan);
  if (source.includes('SSS') || source.includes('PhilHealth') || source.includes('Pag-IBIG') || source.includes('De Minimis')) return ref('Effective reference', source, PAYROLL_UI_PATHS.statutory);
  if (source.includes('BIR') || source.includes('tax table')) return ref('Effective reference', source, PAYROLL_UI_PATHS.tax);
  if (source.includes('policy engine')) return ref('Policy configuration', source, step.code?.startsWith('THP-') ? PAYROLL_UI_PATHS.takeHome : PAYROLL_UI_PATHS.policy);
  if (source.includes('Transaction')) return ref('Run control', source, PAYROLL_UI_PATHS.transaction);
  return ref('Source feature', source || 'Computational Basis', PAYROLL_UI_PATHS.formulaReference);
}

function featureFor(step) {
  const code = String(step?.code || '');
  if (/^(BAS-|ERN-001|MWE-|PRT-)/.test(code)) return { kind: 'Configuration + computation', feature: 'Basic Pay & Pay Rates', extra: [ref('Company configuration', 'Pay type, factor days, and rate derivation', PAYROLL_UI_PATHS.basicPayConfig)] };
  if (/^(ERN-002|ERN-003|ERN-006)/.test(code)) return { kind: 'Computation', feature: 'Overtime and premium earnings', extra: [ref('Approved time', 'Overtime Summary', PAYROLL_UI_PATHS.overtime)] };
  if (/^DED-00/.test(code)) return { kind: 'Computation', feature: 'Attendance deductions', extra: [ref('Attendance input', 'Time & Attendance Summary', PAYROLL_UI_PATHS.attendance)] };
  if (/^(DMN-|RCL-)/.test(code)) return { kind: 'Effective reference', feature: 'De Minimis tax treatment', extra: [ref('Effective table', 'De Minimis statutory version', PAYROLL_UI_PATHS.statutory), ref('Earning source', 'Employee or company earning record', PAYROLL_UI_PATHS.earningRegister)] };
  if (/^BON-/.test(code)) return { kind: 'Computation + reference', feature: '13th month and bonus treatment', extra: [ref('Bonus source', 'Bonus Management', PAYROLL_UI_PATHS.bonusRegister), ref('Reference value', 'Bonus ceiling reference', PAYROLL_UI_PATHS.formulaReference)] };
  if (/^GOV-/.test(code)) return { kind: 'Effective table lookup', feature: 'Statutory contributions', extra: [ref('Employee election', 'Employee statutory settings', PAYROLL_UI_PATHS.salaryStatutory), ref('Effective table', step.source || 'Statutory contribution table', PAYROLL_UI_PATHS.statutory)] };
  if (/^TAX-/.test(code)) return { kind: 'Effective table lookup', feature: 'Withholding tax', extra: [ref('Employee tax setup', 'Employee statutory and tax settings', PAYROLL_UI_PATHS.salaryStatutory), ref('Effective table', step.source || 'BIR tax table', PAYROLL_UI_PATHS.tax)] };
  if (/^THP-/.test(code)) return { kind: 'Policy engine', feature: 'Minimum Take-Home Pay', extra: [ref('Policy', 'Protected minimum, caps, deferral, and employee notice', PAYROLL_UI_PATHS.takeHome), ref('Priority policy', 'REF-011 Deduction and Loan Hierarchy', PAYROLL_UI_PATHS.deductionHierarchy)] };
  if (/^GUP-/.test(code)) return { kind: 'Policy engine', feature: 'Gross Up', extra: [ref('Policy', 'Gross Up policy engine', PAYROLL_UI_PATHS.policy), ref('Effective table', 'BIR tax table used by iteration', PAYROLL_UI_PATHS.tax)] };
  if (/^PAY-/.test(code)) return { kind: 'Payroll result', feature: 'Payroll totals', extra: [ref('Output', 'Employee payroll line', PAYROLL_UI_PATHS.payrollLine)] };
  return { kind: 'Computation', feature: step.category || 'Payroll computation', extra: [] };
}

function uniqueReferences(references) {
  const seen = new Set();
  return references.filter(item => {
    const key = `${item.role}:${item.path.join('>')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function traceabilityForStep(step) {
  const meta = featureFor(step);
  const computationReference = ref('Governed code', `${step.code} · ${step.label || meta.feature}`, withCode(PAYROLL_UI_PATHS.computation, step.code));
  const libraryReference = ref('Formula definition', `${step.code} standard formula and version`, withCode(PAYROLL_UI_PATHS.standardFormula, step.code));
  const assignmentReference = ref('Company assignment', `${step.code} employee scope and frequency`, withCode(PAYROLL_UI_PATHS.assignment, step.code));
  return {
    kind: meta.kind,
    feature: meta.feature,
    policyApplied: meta.kind === 'Policy engine',
    references: uniqueReferences([sourceReference(step), ...meta.extra, computationReference, libraryReference, assignmentReference]),
  };
}

const money = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const auditNode = (id, type, title, status, uiPath, reads, produces, codes = []) => ({ id, type, title, status, path: uiPath, reads, produces, codes });

/** Build an ordered, UI-reproducible source and policy trail for one line. */
export function buildPayrollAuditTrail(line, run) {
  if (!line || line.status !== 'Computed') return [];
  const steps = line.steps || [];
  const has = prefix => steps.some(step => String(step.code).startsWith(prefix));
  const earningAmount = (line.earnings || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const deductionDue = [...(line.deductions || []), ...(line.loans || [])].reduce((sum, item) => sum + Number(item.due || 0), 0);
  const loanDue = (line.loans || []).reduce((sum, item) => sum + Number(item.due || 0), 0);
  const policyCodes = steps.filter(step => /^(THP-|GUP-)/.test(step.code)).map(step => step.code);
  const referenceCodes = [...new Set(steps.flatMap(step => {
    if (/^GOV-/.test(step.code)) return ['SSS/PhilHealth/Pag-IBIG effective versions'];
    if (/^TAX-/.test(step.code)) return ['BIR withholding tax version'];
    if (/^(DMN-|RCL-)/.test(step.code)) return ['De Minimis effective version'];
    if (/^BON-/.test(step.code)) return ['Bonus ceiling reference'];
    return [];
  }))];
  const deductionRows = (line.deductions || []).map(item => `${item.code || item.name} · ${money(item.due)} due · ${item.source || 'employee/company assignment'}`);
  const loanRows = (line.loans || []).map(item => `${item.code || item.name} · ${money(item.due)} due · ${item.source || item.kind || 'approved schedule'}`);
  const loanPath = (line.loans || []).some(item => item.kind === 'Government')
    ? PAYROLL_UI_PATHS.governmentLoan
    : (line.loans || []).length ? PAYROLL_UI_PATHS.companyLoan : PAYROLL_UI_PATHS.loanManagement;
  return [
    auditNode('run', 'Run configuration', 'Resolve payroll transaction controls', 'Used', PAYROLL_UI_PATHS.transaction,
      `${run?.paymentMode || line.payType} mode · payout ${run?.payoutDate || '—'} · time cutoff ${run?.timekeepingStart || '—'} to ${run?.timekeepingEnd || '—'}`,
      'Calculation switches, population, payout date, and effective-date basis'),
    auditNode('basic-config', 'Company configuration', 'Resolve the company pay basis', 'Used', PAYROLL_UI_PATHS.basicPayConfig,
      `${line.payType} paid · factor days ${line.rates?.factorDays || '—'} · ${line.rates?.workHours || '—'} work hours per day`,
      `Monthly-to-daily-to-hourly rate method for ${line.name}`, steps.filter(step => /^(BAS-|MWE-|PRT-)/.test(step.code)).map(step => step.code)),
    auditNode('basic', 'Employee configuration', 'Read effective employee basic pay', 'Used', PAYROLL_UI_PATHS.salaryBasic,
      `${line.name} · ${line.payType} paid · monthly ${money(line.rates?.monthlyRate)} · daily ${money(line.rates?.dailyRate)} · hourly ${money(line.rates?.hourlyRate)}`,
      `Basic pay ${money(line.basicPay)}`, steps.filter(step => /^(BAS-|ERN-001|MWE-|PRT-)/.test(step.code)).map(step => step.code)),
    auditNode('time', 'Transactional source', 'Read approved timekeeping', 'Used', PAYROLL_UI_PATHS.attendance,
      `${line.attendance?.daysWorked || 0} rendered days · ${line.attendance?.overtimeHours || 0} approved OT hours · ${line.attendance?.tardinessMinutes || 0} late minutes`,
      'Attendance-priced earnings and deductions', steps.filter(step => /^(ERN-002|ERN-003|ERN-006|DED-00)/.test(step.code)).map(step => step.code)),
    auditNode('earnings', 'Input register', 'Read employee and company earnings', earningAmount ? 'Used' : 'No applicable rows', PAYROLL_UI_PATHS.earningRegister,
      `${(line.earnings || []).length} applicable ${plural((line.earnings || []).length, 'earning row')}`, `${money(earningAmount)} added outside basic pay`, steps.filter(step => /^(ERN-|DMN-|RCL-)/.test(step.code)).map(step => step.code)),
    auditNode('deductions', 'Input register', 'Read company deduction configuration', (line.deductions || []).length ? 'Used' : 'No applicable rows', PAYROLL_UI_PATHS.deductionRegister,
      deductionRows.length ? deductionRows.join(' · ') : '0 applicable company deduction rows', `${money(deductionDue - loanDue)} scheduled before policy adjustment`, (line.deductions || []).map(item => item.code).filter(Boolean)),
    auditNode('loans', 'Input register', 'Read approved loan configurations and schedules', (line.loans || []).length ? 'Used' : 'No active schedule', loanPath,
      loanRows.length ? loanRows.join(' · ') : 'Company and government loan schedules checked; no active authorised schedule was due', `${money(loanDue)} scheduled for this cutoff`, (line.loans || []).map(item => item.code).filter(Boolean)),
    auditNode('references', 'Reference source', 'Resolve named formula reference sources', referenceCodes.length ? 'Used' : 'Checked', PAYROLL_UI_PATHS.formulaReference,
      referenceCodes.length ? referenceCodes.join(' · ') : 'No additional effective reference was required by the assigned formulas',
      'Versioned values passed to the governed computation steps'),
    auditNode('reference-register', 'Reference register', 'Cross-check shared company reference values', 'Checked', PAYROLL_UI_PATHS.reference,
      'Company-wide reference values linked by the formula reference source',
      'Resolved reference ownership without duplicating the source record'),
    auditNode('assignment', 'Company assignment', 'Resolve computations assigned to this employee and frequency', 'Used', PAYROLL_UI_PATHS.assignment,
      `${line.name} · ${line.employeeGroup || 'employee scope'} · ${run?.paymentMode || line.payType} payroll`,
      `${new Set(steps.map(step => step.code)).size} applicable governed ${plural(new Set(steps.map(step => step.code)).size, 'code')}`, [...new Set(steps.map(step => step.code))]),
    auditNode('basis', 'Governed computation', 'Execute assigned Computational Basis codes', 'Used', PAYROLL_UI_PATHS.computation,
      `${steps.length} ordered ${plural(steps.length, 'step')} with captured inputs and source details`, `Gross pay ${money(line.grossPay)}`, [...new Set(steps.map(step => step.code))]),
    auditNode('statutory', 'Effective reference', 'Resolve statutory contribution versions', has('GOV-') ? 'Used' : 'Not computed', PAYROLL_UI_PATHS.statutory,
      `Payout-date basis ${run?.payoutDate || '—'} · statutory basis ${money(line.statutory?.basis)}`, `Employee ${money(line.statutory?.employeeTotal)} · employer ${money(line.statutory?.employerTotal)}`, steps.filter(step => /^GOV-/.test(step.code)).map(step => step.code)),
    auditNode('tax', 'Effective reference', 'Resolve the withholding tax table version', has('TAX-') ? 'Used' : 'Not computed', PAYROLL_UI_PATHS.tax,
      `Payout-date basis ${run?.payoutDate || '—'} · taxable income ${money(line.taxableIncome)}`, `Withholding tax ${money(line.withholdingTax)}`, steps.filter(step => /^TAX-/.test(step.code)).map(step => step.code)),
    auditNode('hierarchy', 'Policy reference', 'Order controllable deductions and loans', deductionDue ? 'Applied' : 'Checked', PAYROLL_UI_PATHS.deductionHierarchy,
      `REF-011 priority order · ${deductionRows.length} ${plural(deductionRows.length, 'deduction row')} · ${loanRows.length} ${plural(loanRows.length, 'loan row')}`,
      `Collection sequence and adjustable-item priority for ${money(deductionDue)} scheduled`, ['REF-011']),
    auditNode('policy', 'Policy engine', 'Apply caps and minimum take-home protection', policyCodes.length ? 'Applied' : 'No policy adjustment', PAYROLL_UI_PATHS.takeHome,
      `Scheduled controllable deductions ${money(deductionDue)} · protected minimum ${money(line.takeHome?.protectedMinimum)}`, `Collected ${money(deductionDue - Number(line.takeHome?.deferred || 0))} · deferred ${money(line.takeHome?.deferred)} · net ${money(line.netPay)}`, policyCodes),
    auditNode('output', 'Posted evidence', 'Publish one result to every downstream view', ['Posted', 'Locked'].includes(run?.status) ? 'Released' : 'Calculated, not released', PAYROLL_UI_PATHS.payrollLine,
      `${run?.transactionNumber || 'Current transaction'} · ${run?.status || 'Open'}`, `Payroll line ${money(line.netPay)} → payslip → reports`, ['PAY-002']),
    auditNode('payslip', 'Employee proof', 'Expose the released result to the employee', ['Posted', 'Locked'].includes(run?.status) ? 'Visible' : 'Awaiting release', PAYROLL_UI_PATHS.payslip,
      `${run?.transactionNumber || 'Current transaction'} payroll line`, `Employee payslip and payroll history show ${money(line.netPay)}`, ['PAY-002']),
    auditNode('reports', 'Company proof', 'Reconcile the released result in payroll reports', ['Posted', 'Locked'].includes(run?.status) ? 'Available' : 'Awaiting release', PAYROLL_UI_PATHS.reports,
      `${run?.transactionNumber || 'Current transaction'} payroll totals`, `Company reporting includes ${line.name} at ${money(line.netPay)} net`, ['PAY-002']),
  ];
}
