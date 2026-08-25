import { defaultHrmData, readHrmData, writeHrmData } from './hrmData.js';
import { readRegisterRows } from './OperationalWorkspaces.jsx';
import { readHierarchy, readPolicies, writePolicies } from './PolicyComputations.jsx';
import { applyAction, buildPayrollContext, newPayrollRun, readPayrollRuns, savePayrollRun, writePayrollRuns } from './payrollRuns.js';
import { operationalStorageKey, writeOperationalRowsForCompany } from './operationalStore.js';
import { buildPayrollAuditTrail, traceabilityForStep } from './payrollTraceability.js';

export const SANDBOX_COMPANY_ID = 'cmp-atlas-sandbox-001';
export const PRODUCTION_SAMPLE_COMPANY_ID = 'cmp-meridian-sample-001';
export const E2E_STATE_KEY = 'atlas-e2e-demo-state-v1';

const clone = value => JSON.parse(JSON.stringify(value));
const stateKey = companyId => `${E2E_STATE_KEY}:${companyId}`;

const RAW_E2E_JOURNEYS = {
  payroll: {
    id: 'payroll',
    title: 'Overtime to posted payslip',
    description: 'An employee adds overtime, a manager approves it, Client Admin computes payroll, P&A approves and posts, then the employee and company see the result.',
    stages: [
      { id: 'employee-input', actor: 'Employee', module: 'HRM', title: 'Add overtime data', detail: 'John files 2 hours of overtime against his real punch record; the approved result becomes Timekeeping input.', entry: ['Employee Self-service', 'Overtime Request Application'] },
      { id: 'approver-decision', actor: 'Approver', module: 'HRM', title: 'Approve overtime', detail: 'The pending hours become approved payroll input.', entry: ['Manage Approvals', 'Overtime Manage & Approval'] },
      { id: 'client-payroll', actor: 'Client Admin', module: 'Payroll', title: 'Create and calculate payroll', detail: 'Atlas reads HRM salary, approved time, registers, statutory versions, and policies.', entry: ['Payroll Processing'], uiAction: 'payroll-create' },
      { id: 'client-review', actor: 'Client Admin', module: 'Payroll', title: 'Submit payroll for approval', detail: 'The computed figures are frozen as Draft and sent through review.', entry: ['Payroll Processing'], uiAction: 'payroll-submit' },
      { id: 'pa-approval', actor: 'P&A Admin', module: 'Payroll', title: 'Approve and post payroll', detail: 'P&A approval posts the run and releases employee payslips.', entry: ['Payroll Processing'], uiAction: 'approve' },
      { id: 'employee-payslip', actor: 'Employee', module: 'HRM', title: 'View the released payslip', detail: 'John sees basic pay, overtime, deductions, tax, and net pay from the posted run.', entry: ['Employee Self-inquiry', 'Payslips & Payroll History'] },
      { id: 'company-report', actor: 'Client Admin', module: 'Payroll', title: 'View company payroll results', detail: 'The company sees headcount, gross pay, net pay, overtime, and audit history.', entry: ['Reports'] },
    ],
  },
  computation: {
    id: 'computation',
    title: 'Policy change to employee impact',
    description: 'P&A establishes a baseline, Client Admin changes the take-home protection, payroll is recomputed, and the impact is visible across employee and company views.',
    stages: [
      { id: 'baseline', actor: 'P&A Admin', module: 'Settings', title: 'Calculate the baseline', detail: 'Atlas computes the payroll with the current 30% protected take-home policy.', entry: ['Standard Computation Library'] },
      { id: 'policy-change', actor: 'Client Admin', module: 'Core', title: 'Change the policy engine', detail: 'The protected take-home threshold is raised from 30% to 45%.', entry: ['Company Configuration', 'Services Information', 'Computational Basis', 'Policy Engines'], uiAction: 'policy-edit' },
      { id: 'timekeeping-effect', actor: 'Approver', module: 'Timekeeping', title: 'Verify approved time input', detail: 'The same approved punch remains the authoritative attendance source.', entry: ['Overtime Summary'] },
      { id: 'recompute', actor: 'Client Admin', module: 'Payroll', title: 'Recompute payroll', detail: 'Atlas recalculates every employee using the changed company policy.', entry: ['Payroll Processing'], uiAction: 'payroll-create' },
      { id: 'employee-effect', actor: 'Employee', module: 'HRM', title: 'Inspect the employee effect', detail: 'The payslip identifies protected take-home and any deferred deductions.', entry: ['Employee Self-inquiry', 'Payslips & Payroll History'] },
      { id: 'company-effect', actor: 'Client Admin', module: 'Payroll', title: 'Review company-wide impact', detail: 'The company sees affected employees and the value deferred to later payrolls.', entry: ['Reports'] },
    ],
  },
  'payroll-rejection': {
    id: 'payroll-rejection',
    title: 'Payroll rejection and resubmission',
    description: 'Client Admin creates payroll, P&A rejects it with remarks, the payroll is corrected and resubmitted, then P&A approves and posts it.',
    stages: [
      { id: 'create-run', actor: 'Client Admin', module: 'Payroll', title: 'Create payroll', detail: 'Create and calculate a payroll from the linked HRM and Timekeeping data.', entry: ['Payroll Processing'], uiAction: 'payroll-create' },
      { id: 'submit-run', actor: 'Client Admin', module: 'Payroll', title: 'Submit for approval', detail: 'Freeze the figures and send the run through review to P&A.', entry: ['Payroll Processing'], uiAction: 'payroll-submit' },
      { id: 'reject-run', actor: 'P&A Admin', module: 'Payroll', title: 'Reject with remarks', detail: 'Reject the payroll because an overtime line needs correction.', entry: ['Payroll Processing'], uiAction: 'reject' },
      { id: 'correct-run', actor: 'Client Admin', module: 'Payroll', title: 'Correct and recalculate', detail: 'Open the returned payroll, correct its remarks and recalculate.', entry: ['Payroll Processing'], uiAction: 'edit' },
      { id: 'resubmit-run', actor: 'Client Admin', module: 'Payroll', title: 'Resubmit payroll', detail: 'Return the corrected payroll to P&A approval.', entry: ['Payroll Processing'], uiAction: 'payroll-submit' },
      { id: 'approve-post-run', actor: 'P&A Admin', module: 'Payroll', title: 'Approve and post', detail: 'Approve the corrected run and release its payslips.', entry: ['Payroll Processing'], uiAction: 'approve' },
      { id: 'rejection-payslip', actor: 'Employee', module: 'HRM', title: 'View final payslip', detail: 'The employee sees only the corrected, posted result.', entry: ['Employee Self-inquiry', 'Payslips & Payroll History'], uiAction: 'inspect' },
    ],
  },
  'earning-deduction': {
    id: 'earning-deduction',
    title: 'Earning and deduction to payslip',
    description: 'Client Admin adds an earning and a deduction, payroll consumes both, P&A posts the run, and the employee sees the exact effect.',
    stages: [
      { id: 'add-earning', actor: 'Client Admin', module: 'Payroll', title: 'Add mobile allowance', detail: 'Add a ₱3,000 one-time earning for John Collins Doe.', entry: ['Earning Management'], uiAction: 'add-earning' },
      { id: 'add-deduction', actor: 'Client Admin', module: 'Payroll', title: 'Add equipment deduction', detail: 'Add an ₱850 active company deduction for the same employee.', entry: ['Deduction Management'], uiAction: 'add-deduction' },
      { id: 'calculate-items', actor: 'Client Admin', module: 'Payroll', title: 'Calculate both items', detail: 'Payroll reads the new Earning and Deduction Management records.', entry: ['Payroll Processing'], uiAction: 'payroll-create' },
      { id: 'approve-items', actor: 'P&A Admin', module: 'Payroll', title: 'Approve and post', detail: 'P&A reviews the two new items and posts the payroll.', entry: ['Payroll Processing'], uiAction: 'approve' },
      { id: 'employee-items', actor: 'Employee', module: 'HRM', title: 'Inspect payslip items', detail: 'The employee sees the allowance, deduction, and resulting net pay.', entry: ['Employee Self-inquiry', 'Payslips & Payroll History'], uiAction: 'inspect' },
      { id: 'report-items', actor: 'Client Admin', module: 'Payroll', title: 'Reconcile the company report', detail: 'The payroll register reconciles the earning, deduction, and net total.', entry: ['Reports'], uiAction: 'inspect' },
    ],
  },
  'time-correction': {
    id: 'time-correction',
    title: 'Rejected time correction to payroll',
    description: 'An employee corrects a missing punch, the approver rejects and the employee resubmits it, then approved time restates payroll.',
    stages: [
      { id: 'file-correction', actor: 'Employee', module: 'HRM', title: 'File time correction', detail: 'Enter the missing clock-in and a reason in the actual application form.', entry: ['Employee Self-service', 'Time In/Out Correction Application'], uiAction: 'time-form' },
      { id: 'reject-correction', actor: 'Approver', module: 'HRM', title: 'Reject incomplete evidence', detail: 'Reject the request with a clear approver remark.', entry: ['Manage Approvals', 'Time In/Out Correction Manage & Approval'], uiAction: 'reject' },
      { id: 'resubmit-correction', actor: 'Employee', module: 'HRM', title: 'Correct and resubmit', detail: 'Update the requested clock-in and resubmit with complete context.', entry: ['Employee Self-service', 'Time In/Out Correction Application'], uiAction: 'time-form' },
      { id: 'approve-correction', actor: 'Approver', module: 'HRM', title: 'Approve corrected time', detail: 'Approve the corrected punch so Timekeeping becomes authoritative.', entry: ['Manage Approvals', 'Time In/Out Correction Manage & Approval'], uiAction: 'approve' },
      { id: 'verify-time', actor: 'Approver', module: 'Timekeeping', title: 'Verify restated attendance', detail: 'The corrected punch removes 90 late minutes from the time record.', entry: ['Time & Attendance Summary'], uiAction: 'inspect' },
      { id: 'recalculate-time', actor: 'Client Admin', module: 'Payroll', title: 'Recalculate and post payroll', detail: 'Payroll re-prices attendance using the approved corrected punch.', entry: ['Payroll Processing'], uiAction: 'payroll-create' },
      { id: 'time-payslip', actor: 'Employee', module: 'HRM', title: 'View corrected payslip', detail: 'The employee sees the restated attendance deduction and net pay.', entry: ['Employee Self-inquiry', 'Payslips & Payroll History'], uiAction: 'inspect' },
    ],
  },
  'formula-trace': {
    id: 'formula-trace',
    title: 'Computational Basis to payroll line',
    description: 'Follow the governed ERN-002 overtime formula from its source library, through approved inputs and payroll calculation, to the employee payslip and company audit evidence.',
    stages: [
      { id: 'inspect-formula', actor: 'P&A Admin', module: 'Settings', title: 'Inspect the governed formula', detail: 'Find ERN-002 Overtime Pay and review its active expression, version, and source.', entry: ['Standard Computation Library'], uiAction: 'computation-inspect', guide: 'Let’s begin at the source of truth. I’m opening ERN-002 so you can see the exact expression Atlas will execute—before any payroll result exists.', why: 'A payroll line is explainable only when the formula, version, status, and owner are known.', input: 'Active ERN-002 · hourly rate, approved OT hours, OT multiplier', rule: '{{hourly_rate}} × {{ot_hours}} × {{ot_rate}}', output: 'Governed earning computation ready for use', proof: 'Settings › Standard Computation Library' },
      { id: 'approve-formula-input', actor: 'Approver', module: 'Timekeeping', title: 'Approve the formula inputs', detail: 'Confirm John’s 2 approved overtime hours as the authoritative Timekeeping input.', entry: ['Overtime Summary'], uiAction: 'inspect', guide: 'Now I’m checking the input side. The formula cannot invent overtime hours; it consumes the two hours approved in Timekeeping.', why: 'Only approved attendance is eligible to flow into payroll.', input: 'John Collins Doe · 2.00 approved overtime hours', rule: 'Approval status = Approved', output: 'Payroll-ready overtime input', proof: 'Timekeeping › Overtime Summary' },
      { id: 'calculate-formula', actor: 'Client Admin', module: 'Payroll', title: 'Run the real computation', detail: 'Create payroll and evaluate ERN-002 using John’s HRM rate and approved Timekeeping hours.', entry: ['Payroll Processing'], uiAction: 'payroll-create', guide: 'I’m creating the payroll now. Atlas joins John’s HRM pay rate with the approved hours, then evaluates ERN-002 rather than hard-coding an overtime amount.', why: 'This is the point where Core, HRM, Timekeeping, Computational Basis, and Payroll become one calculation.', input: 'HRM hourly rate + approved OT hours + assigned OT rate', rule: 'ERN-002 · Overtime Pay', output: 'Overtime earning on John’s computed payroll line', proof: 'Payroll Processing › employee result' },
      { id: 'inspect-formula-trail', actor: 'Client Admin', module: 'Payroll', title: 'Explain how it was computed', detail: 'Open the employee result and review the code, expression, inputs, source, and evaluated amount.', entry: ['Payroll Processing'], uiAction: 'inspect', guide: 'Here is the evidence trail. I’m showing the computation code, the resolved inputs, the source, and the amount produced—so the number can be reproduced.', why: 'Reviewers need calculation evidence, not only a final net-pay total.', input: 'Resolved engine inputs captured at calculation time', rule: 'Ordered employee computation steps', output: 'Reproducible calculation trail', proof: 'Payroll line › How it was computed' },
      { id: 'approve-formula-payroll', actor: 'P&A Admin', module: 'Payroll', title: 'Approve and post the result', detail: 'Review the computation evidence, approve the run, and post the payroll.', entry: ['Payroll Processing'], uiAction: 'approve', guide: 'The figures are calculated, but employees still cannot see them. I’m completing the controlled approval and posting handoff now.', why: 'Posting freezes the approved result and is the release gate for payslips and reports.', input: 'Reviewed payroll transaction and computation trail', rule: 'Draft → Review → Approval → Posted', output: 'Immutable posted payroll result', proof: 'Payroll transaction history' },
      { id: 'formula-payslip-proof', actor: 'Employee', module: 'HRM', title: 'See the payslip effect', detail: 'Open the posted payslip and locate the overtime earning created by ERN-002.', entry: ['Employee Self-inquiry', 'Payslips & Payroll History'], uiAction: 'inspect', guide: 'We’ve reached the employee view. John sees the overtime as a released earning only after the same computed run was posted.', why: 'The payslip must reconcile to the approved payroll line without a second calculation.', input: 'Posted John Collins Doe payroll line', rule: 'Employee self-service release rule', output: 'Overtime earning and resulting net pay', proof: 'Employee payslip' },
      { id: 'formula-audit-proof', actor: 'Client Admin', module: 'Payroll', title: 'Reconcile company evidence', detail: 'Trace the same overtime amount into the payroll register and audit history.', entry: ['Reports'], uiAction: 'inspect', guide: 'Finally, I’m reconciling the employee result to the company total. The same posted transaction supplies the payroll register and its audit history.', why: 'Company reporting and employee payslips must share one posted source.', input: 'Posted payroll transaction PR-2025-11-E2E', rule: 'Report from posted payroll results', output: 'Company overtime, gross, net, and audit totals', proof: 'Payroll › Reports' },
    ],
  },
  'statutory-trace': {
    id: 'statutory-trace',
    title: 'Statutory tables to payslip and remittance',
    description: 'See how the payout date selects effective SSS, PhilHealth, Pag-IBIG, and tax rules, then follow both employee and employer amounts through payroll, payslip, and reports.',
    stages: [
      { id: 'inspect-statutory-table', actor: 'P&A Admin', module: 'Settings', title: 'Review effective statutory versions', detail: 'Open the statutory table library and inspect the versions eligible for the payroll payout date.', entry: ['Statutory Table'], uiAction: 'statutory-inspect', guide: 'I’m starting with the effective-dated tables. Atlas will choose the eligible version using the payroll payout date—not today’s date and not a manually typed contribution.', why: 'Effective dating prevents a later table update from rewriting historical payroll.', input: 'Payout date · 30 November 2025', rule: 'Latest active version effective on or before payout date', output: 'Resolved SSS, PhilHealth, Pag-IBIG, and tax tables', proof: 'Settings › Statutory Table' },
      { id: 'calculate-statutory', actor: 'Client Admin', module: 'Payroll', title: 'Calculate statutory amounts', detail: 'Create payroll and resolve contribution bases, brackets, employee shares, employer shares, and tax.', entry: ['Payroll Processing'], uiAction: 'payroll-create', guide: 'Now I’m calculating payroll. For each employee, Atlas resolves the statutory basis, finds the applicable table row, and records both employee and employer shares.', why: 'Employee deductions, employer liabilities, and remittance reports must originate from the same lookup.', input: 'Employee statutory flags + compensation basis + payout date', rule: 'GOV-001, GOV-002, GOV-003 and TAX computation steps', output: 'Employee deductions and employer contributions', proof: 'Payroll employee line › Statutory & tax' },
      { id: 'inspect-statutory-trail', actor: 'P&A Admin', module: 'Payroll', title: 'Inspect lookup evidence', detail: 'Review the selected table source, basis, bracket detail, and calculated shares.', entry: ['Payroll Processing'], uiAction: 'inspect', guide: 'I’m opening the lookup evidence now. Notice that a statutory step names its table source and bracket detail even when it is resolved by lookup rather than a free-form formula.', why: 'A reviewer must be able to identify which effective table produced each deduction.', input: 'Captured statutory basis and selected bracket', rule: 'Effective table lookup', output: 'Explainable EE and ER contribution lines', proof: 'How it was computed › Government and Tax steps' },
      { id: 'post-statutory', actor: 'P&A Admin', module: 'Payroll', title: 'Approve and post payroll', detail: 'Approve the contribution result and post the transaction.', entry: ['Payroll Processing'], uiAction: 'approve' },
      { id: 'statutory-payslip', actor: 'Employee', module: 'HRM', title: 'View employee deductions', detail: 'John sees the posted SSS, PhilHealth, Pag-IBIG, and withholding tax amounts.', entry: ['Employee Self-inquiry', 'Payslips & Payroll History'], uiAction: 'inspect' },
      { id: 'statutory-report', actor: 'Client Admin', module: 'Payroll', title: 'Reconcile remittance totals', detail: 'The company report reconciles employee deductions and employer shares to the posted payroll.', entry: ['Reports'], uiAction: 'inspect', guide: 'The final handoff is company reconciliation. I’m tracing the posted employee and employer shares into statutory and remittance reporting.', why: 'Remittance totals must tie back to the exact posted employees and table versions.', input: 'Posted statutory employee and employer lines', rule: 'Aggregate by agency and payroll transaction', output: 'Contribution and remittance totals', proof: 'Payroll › Reports › statutory/remittance outputs' },
    ],
  },
  'deduction-protection': {
    id: 'deduction-protection',
    title: 'Deduction hierarchy and take-home protection',
    description: 'Add a large company deduction, apply the governed hierarchy and protected-minimum policy, then see what is deducted, deferred, disclosed, and reported.',
    stages: [
      { id: 'add-protected-deduction', actor: 'Client Admin', module: 'Payroll', title: 'Add a large deduction', detail: 'Enter a ₱25,000 equipment recovery for John Collins Doe in the real deduction form.', entry: ['Deduction Management'], uiAction: 'add-large-deduction', guide: 'I’m adding a deliberately large controllable deduction so you can see the protection logic work. The amount is due, but that does not mean Atlas will collect all of it now.', why: 'A due deduction still has to pass hierarchy, caps, and protected take-home rules.', input: 'DED-E2E-PROTECT · ₱25,000 due', rule: 'Active company deduction for this cutoff', output: 'Payroll deduction candidate', proof: 'Payroll › Deduction Management' },
      { id: 'inspect-deduction-policy', actor: 'Client Admin', module: 'Core', title: 'Inspect hierarchy and policy', detail: 'Review the deduction order and the 30% protected take-home threshold.', entry: ['Company Configuration', 'Services Information', 'Computational Basis', 'Policy Engines'], uiAction: 'policy-inspect', guide: 'Before calculating, I’m checking the guardrails: statutory items stay mandatory, controllable deductions follow the hierarchy, and net pay is protected at 30% of the configured base.', why: 'Collection order determines which item is deferred when the employee cannot absorb every deduction.', input: 'Deduction hierarchy + 30% take-home threshold', rule: 'REF-011 + THP-001/THP-002', output: 'Ordered, capped deduction policy', proof: 'Core › Computational Basis › Policy Engines' },
      { id: 'calculate-protection', actor: 'Client Admin', module: 'Payroll', title: 'Calculate collection and deferral', detail: 'Create payroll and let Atlas collect only the allowed amount while carrying the remainder forward.', entry: ['Payroll Processing'], uiAction: 'payroll-create', guide: 'I’m calculating now. Atlas first applies mandatory statutory items, then walks the controllable hierarchy and defers the amount that would push net pay below the protected minimum.', why: 'The engine must preserve statutory obligations while protecting the configured employee minimum.', input: 'Gross pay − statutory items − controllable deductions', rule: 'THP-001 protected minimum and THP-002 automatic deferral', output: 'Deducted now + deferred balance', proof: 'Payroll line › Deductions and policy steps' },
      { id: 'inspect-protection-trail', actor: 'P&A Admin', module: 'Payroll', title: 'Review the protection evidence', detail: 'Inspect the protected minimum, amount collected, amount deferred, and resulting net pay.', entry: ['Payroll Processing'], uiAction: 'inspect', guide: 'Here is the decision evidence. I’m comparing the preliminary net pay with the protected minimum and showing exactly how much was deferred.', why: 'A deferred deduction changes both the current payslip and a future payroll obligation.', input: 'Preliminary net pay and ordered deduction candidates', rule: 'Auto-defer until protected minimum is met', output: 'Protected net pay with auditable deferred amount', proof: 'How it was computed › THP-001 and THP-002' },
      { id: 'post-protection', actor: 'P&A Admin', module: 'Payroll', title: 'Approve and post protected payroll', detail: 'Approve the policy result and release the posted payroll.', entry: ['Payroll Processing'], uiAction: 'approve' },
      { id: 'protection-payslip', actor: 'Employee', module: 'HRM', title: 'Explain it to the employee', detail: 'John sees the amount deducted now, the protected-minimum note, and the deferred balance.', entry: ['Employee Self-inquiry', 'Payslips & Payroll History'], uiAction: 'inspect', guide: 'Now I’m showing John the outcome in employee language: what was taken now, what was protected, and what remains due later.', why: 'The employee needs a transparent explanation of why the due amount and collected amount differ.', input: 'Posted protected payroll line', rule: 'Payslip tagging and employee notification policy', output: 'Deducted, deferred, and net-pay disclosure', proof: 'Employee payslip' },
      { id: 'protection-report', actor: 'Client Admin', module: 'Payroll', title: 'Track the deferred obligation', detail: 'Reconcile the posted deduction and its deferred balance in company reports.', entry: ['Reports'], uiAction: 'inspect' },
    ],
  },
};

const MODULE_GUIDANCE = {
  HRM: { input: 'Employee or approver record', rule: 'Role, approval, and employee-visibility controls', output: 'Company-scoped HRM result', proof: 'HRM history and employee self-service' },
  Timekeeping: { input: 'Punch, schedule, or approved request', rule: 'Authoritative attendance and approval status', output: 'Payroll-ready time result', proof: 'Timekeeping summary and request history' },
  Payroll: { input: 'Linked employee, time, register, policy, and table data', rule: 'Governed payroll engine and status workflow', output: 'Calculated or posted payroll result', proof: 'Payroll line, payslip, report, and audit history' },
  Core: { input: 'Company configuration and assigned policy', rule: 'Effective company policy engine', output: 'Versioned rule consumed by payroll', proof: 'Computational Basis and change history' },
  Settings: { input: 'Controlled formula or effective table', rule: 'Active version and applicability', output: 'Governed source available to companies', proof: 'Settings source library and audit history' },
};

function enrichStage(stage) {
  const defaults = MODULE_GUIDANCE[stage.module] || MODULE_GUIDANCE.Payroll;
  return Object.freeze({
    ...defaults,
    ...stage,
    guide: stage.guide || `I’m acting as ${stage.actor} and opening ${stage.title.toLowerCase()}. ${stage.detail}`,
    why: stage.why || `This handoff keeps the ${stage.module} result connected to the next actor without re-entering the data.`,
  });
}

export const E2E_JOURNEYS = Object.freeze(Object.fromEntries(Object.entries(RAW_E2E_JOURNEYS).map(([key, journey]) => [key, Object.freeze({
  ...journey,
  stages: Object.freeze(journey.stages.map(enrichStage)),
})])));

export function readEndToEndState(companyId = SANDBOX_COMPANY_ID, storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(stateKey(companyId)) || 'null');
    return saved || { companyId, journeyId: 'payroll', completedStages: [], events: [], metrics: {} };
  } catch {
    return { companyId, journeyId: 'payroll', completedStages: [], events: [], metrics: {} };
  }
}

function writeState(companyId, state, storage = globalThis.localStorage) {
  storage?.setItem(stateKey(companyId), JSON.stringify(state));
  return state;
}

function payrollRegisters(companyId) {
  return Object.fromEntries(['earnings', 'deductions', 'bonuses', 'payCodes'].map(key => [key, readRegisterRows(key, companyId)]));
}

function ensureOvertime(hrmData, status = 'Pending') {
  const row = {
    logId: 'TKL-E2E-EMP-1001-2025-11-14', employeeId: 'EMP-1001', date: '2025-11-14',
    tool: 'Web', workLocation: 'Office HQ', geotag: 'Ayala Avenue, Makati, 1226 Metro Manila',
    timeIn: '08:00', timeOut: '20:00', breakIn: '12:00', breakOut: '13:00', breakHours: 1,
    workedHours: 9, overtimeHours: 2, overtimeStatus: status, overtimeType: 'Regular',
    tardinessMinutes: 0, undertimeMinutes: 0, leaveType: '', leaveHours: 0,
    reason: 'Month-end payroll processing support', status: 'Present',
  };
  return { ...hrmData, timeLogs: [row, ...(hrmData.timeLogs || []).filter(item => item.logId !== row.logId)] };
}

function ensureCorrectedPunch(hrmData, approved = false) {
  const row = {
    logId: 'TKL-E2E-CORRECTION-EMP-1001', employeeId: 'EMP-1001', date: '2025-11-13', tool: 'Biometrics',
    workLocation: 'Office HQ', geotag: 'Ayala Avenue, Makati, 1226 Metro Manila',
    timeIn: approved ? '08:00' : '09:30', timeOut: '17:00', breakIn: '12:00', breakOut: '13:00', breakHours: 1,
    workedHours: approved ? 8 : 6.5, overtimeHours: 0, overtimeStatus: '', overtimeType: '',
    tardinessMinutes: approved ? 0 : 90, undertimeMinutes: 0, leaveType: '', leaveHours: 0,
    reason: approved ? 'Approved Time In/Out correction' : 'Correction pending approval', status: 'Present',
  };
  return { ...hrmData, timeLogs: [row, ...(hrmData.timeLogs || []).filter(item => item.logId !== row.logId)] };
}

function writeDemoRegister(workspaceKey, companyId, row, storage) {
  writeOperationalRowsForCompany(operationalStorageKey(workspaceKey, 3), companyId, [row], storage);
}

export function buildDemoPayroll(companyId = SANDBOX_COMPANY_ID, storage = globalThis.localStorage, policyOverride) {
  const existing = readPayrollRuns(companyId, storage);
  let run = newPayrollRun({ runs: existing.filter(item => item.id !== 'run-e2e-payroll'), companyId, year: 2025, month: 'November' });
  run = {
    ...run, id: 'run-e2e-payroll', transactionNumber: 'PR-2025-11-E2E', calendarCode: 'CAL-NOV2',
    periodStart: '2025-11-16', periodEnd: '2025-11-30', timekeepingStart: '2025-11-01', timekeepingEnd: '2025-11-15',
    payoutDate: '2025-11-30', lockDate: '2099-12-31', remarks: 'Scenario Studio full end-to-end payroll',
    createdBy: 'Client Admin',
  };
  const hrmData = ensureOvertime(readHrmData(companyId, storage), 'Approved');
  const policies = policyOverride || readPolicies(companyId);
  const context = buildPayrollContext({ companyId, run, hrmData, registers: payrollRegisters(companyId), hierarchy: readHierarchy(), policies, storage });
  const outcome = applyAction(run, 'recalculate', { actor: 'Client Admin', runs: existing, context });
  if (outcome.error) throw new Error(outcome.error);
  return { run: outcome.run, context, hrmData };
}

function metricsFor(run, baseline) {
  const result = run?.result;
  if (!result) return {};
  const john = result.lines.find(line => line.employeeId === 'EMP-1001');
  const overtimePay = (john?.earnings || []).filter(item => item.hours).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const computationTrail = (john?.steps || []).map(step => ({
    seq: step.seq,
    code: step.code,
    label: step.label,
    category: step.category,
    expression: step.expression,
    inputs: step.inputs,
    amount: step.amount,
    evaluated: step.evaluated,
    detail: step.detail,
    source: step.source,
    ...traceabilityForStep(step),
  }));
  return {
    transactionNumber: run.transactionNumber, payrollStatus: run.status, headcount: result.totals.headcount,
    grossPay: result.totals.grossPay, netPay: result.totals.netPay, deferred: result.totals.deferred,
    overtimeHours: john?.attendance?.overtimeHours || 0, overtimePay,
    employeeNetPay: john?.netPay || 0, protectedMinimum: john?.takeHome?.protectedMinimum || 0,
    statutoryEmployee: john?.statutory?.employeeTotal || 0,
    statutoryEmployer: john?.statutory?.employerTotal || 0,
    withholdingTax: john?.tax?.withholdingTax || john?.withholdingTax || 0,
    employeeDeferred: john?.takeHome?.deferred || 0,
    affectedEmployees: result.lines.filter(line => Number(line.takeHome?.deferred || 0) > 0).length,
    baselineNetPay: baseline?.employeeNetPay || 0,
    employeeNetChange: baseline ? Number(((john?.netPay || 0) - Number(baseline.employeeNetPay || 0)).toFixed(2)) : 0,
    computationTrail,
    auditTrail: buildPayrollAuditTrail(john, run),
  };
}

function advancePayroll(run, actions) {
  let current = run;
  actions.forEach(({ action, actor }) => {
    const outcome = applyAction(current, action, { actor, remarks: 'Scenario Studio end-to-end handoff', runs: [current] });
    if (outcome.error) throw new Error(outcome.error);
    current = outcome.run;
  });
  return current;
}

function advancePayrollTo(run, target, actor) {
  const nextAction = { Open: 'postDraft', Draft: 'submitReview', 'For Review': 'submitApproval', 'For Approval': 'approve', Approved: 'post' };
  const order = ['Open', 'Draft', 'For Review', 'For Approval', 'Approved', 'Posted'];
  let current = run;
  while (current && order.indexOf(current.status) < order.indexOf(target)) {
    const action = nextAction[current.status];
    if (!action) throw new Error(`${current.transactionNumber} cannot advance from ${current.status} to ${target}.`);
    current = advancePayroll(current, [{ action, actor }]);
  }
  return current;
}

export function applyEndToEndStage({ companyId = SANDBOX_COMPANY_ID, journeyId = 'payroll', stageIndex = 0, storage = globalThis.localStorage } = {}) {
  if (companyId !== SANDBOX_COMPANY_ID) throw new Error('Data-changing simulation is available only in the resettable sandbox company.');
  const journey = E2E_JOURNEYS[journeyId];
  const stage = journey?.stages[stageIndex];
  if (!stage) throw new Error('This end-to-end stage does not exist.');
  let state = readEndToEndState(companyId, storage);
  let run = readPayrollRuns(companyId, storage).find(item => item.id === 'run-e2e-payroll');

  if (journeyId === 'payroll') {
    if (stage.id === 'employee-input') writeHrmData(companyId, ensureOvertime(readHrmData(companyId, storage), 'Pending'), storage);
    if (stage.id === 'approver-decision') writeHrmData(companyId, ensureOvertime(readHrmData(companyId, storage), 'Approved'), storage);
    if (stage.id === 'client-payroll') {
      const computed = buildDemoPayroll(companyId, storage);
      run = computed.run;
      writeHrmData(companyId, computed.hrmData, storage);
      savePayrollRun(companyId, run, storage);
    }
    if (stage.id === 'client-review') {
      if (!run) run = buildDemoPayroll(companyId, storage).run;
      run = advancePayrollTo(run, 'For Approval', 'Client Admin / Payroll Reviewer');
      savePayrollRun(companyId, run, storage);
    }
    if (stage.id === 'pa-approval') {
      if (!run) throw new Error('Create and review the payroll before approval.');
      run = advancePayrollTo(run, 'Posted', 'P&A Admin');
      savePayrollRun(companyId, run, storage);
    }
  } else if (journeyId === 'computation') {
    if (stage.id === 'baseline') {
      const policies = readPolicies(companyId);
      const baselinePolicies = { ...policies, takeHome: { ...policies.takeHome, enabled: true, autoDefer: true, thresholdType: 'Percentage', threshold: 30, priorityChoice: 'Take-Home Pay' } };
      writePolicies(companyId, baselinePolicies);
      const computed = buildDemoPayroll(companyId, storage, baselinePolicies);
      run = computed.run;
      writeHrmData(companyId, computed.hrmData, storage);
      savePayrollRun(companyId, run, storage);
      state = { ...state, baseline: metricsFor(run) };
    }
    if (stage.id === 'policy-change') {
      const policies = readPolicies(companyId);
      writePolicies(companyId, { ...policies, takeHome: { ...policies.takeHome, enabled: true, autoDefer: true, thresholdType: 'Percentage', threshold: 45, priorityChoice: 'Take-Home Pay', notifyEmployee: true, payslipTagging: true } });
    }
    if (stage.id === 'timekeeping-effect') writeHrmData(companyId, ensureOvertime(readHrmData(companyId, storage), 'Approved'), storage);
    if (stage.id === 'recompute') {
      const computed = buildDemoPayroll(companyId, storage);
      run = computed.run;
      writeHrmData(companyId, computed.hrmData, storage);
      run = advancePayrollTo(run, 'Posted', 'Client Admin / P&A Admin');
      savePayrollRun(companyId, run, storage);
    }
  } else if (journeyId === 'payroll-rejection') {
    if (stage.id === 'create-run') {
      const computed = buildDemoPayroll(companyId, storage);
      run = computed.run; writeHrmData(companyId, computed.hrmData, storage); savePayrollRun(companyId, run, storage);
    }
    if (stage.id === 'submit-run') {
      run = advancePayrollTo(run, 'For Approval', 'Client Admin / Payroll Reviewer');
      savePayrollRun(companyId, run, storage);
    }
    if (stage.id === 'reject-run') {
      if (['For Review', 'For Approval'].includes(run?.status)) run = advancePayroll(run, [{ action: 'reject', actor: 'P&A Admin' }]);
      if (run?.status !== 'Open') throw new Error('The rejected payroll did not return to Open.');
      run = { ...run, remarks: 'Returned: verify overtime supporting detail' };
      savePayrollRun(companyId, run, storage);
      state = { ...state, rejectionReason: 'Verify overtime supporting detail' };
    }
    if (stage.id === 'correct-run') {
      const computed = buildDemoPayroll(companyId, storage);
      run = { ...computed.run, remarks: 'Corrected overtime support attached' };
      savePayrollRun(companyId, run, storage);
    }
    if (stage.id === 'resubmit-run') {
      run = advancePayrollTo(run, 'For Approval', 'Client Admin / Payroll Reviewer');
      savePayrollRun(companyId, run, storage);
    }
    if (stage.id === 'approve-post-run') {
      run = advancePayrollTo(run, 'Posted', 'P&A Admin');
      savePayrollRun(companyId, run, storage);
    }
  } else if (journeyId === 'earning-deduction') {
    if (stage.id === 'add-earning') {
      writeDemoRegister('earnings', companyId, { id: 'e2e-earning', code: 'ERN-E2E-001', name: 'Allowance', employee: '0011223345 - John Collins Doe', frequency: 'One-time', basis: 'Fixed amount', amount: '3000', effectiveDate: '2025-11-01', periodStart: '2025-11-01', periodEnd: '2025-11-30', endDate: '', holdDate: '', remarks: 'Scenario mobile allowance', status: 'Active' }, storage);
      state = { ...state, earningAmount: 3000 };
    }
    if (stage.id === 'add-deduction') {
      writeDemoRegister('deductions', companyId, { id: 'e2e-deduction', code: 'DED-E2E-001', name: 'Other', employee: '0011223345 - John Collins Doe', amount: '850', frequency: 'Once', startDate: '2025-11-01', endDate: '2025-11-30', balance: '850', remarks: 'Scenario equipment deduction', status: 'Active' }, storage);
      state = { ...state, deductionAmount: 850 };
    }
    if (stage.id === 'calculate-items') {
      const computed = buildDemoPayroll(companyId, storage);
      run = computed.run; writeHrmData(companyId, computed.hrmData, storage); savePayrollRun(companyId, run, storage);
    }
    if (stage.id === 'approve-items') {
      run = advancePayrollTo(run, 'Posted', 'Client Admin / P&A Admin');
      savePayrollRun(companyId, run, storage);
    }
  } else if (journeyId === 'time-correction') {
    if (stage.id === 'file-correction') {
      writeHrmData(companyId, ensureCorrectedPunch(readHrmData(companyId, storage), false), storage);
      state = { ...state, correctionStatus: 'Pending approval', correctedMinutes: 90 };
    }
    if (stage.id === 'reject-correction') state = { ...state, correctionStatus: 'Rejected', rejectionReason: 'Attach the biometrics outage reference' };
    if (stage.id === 'resubmit-correction') state = { ...state, correctionStatus: 'Resubmitted' };
    if (stage.id === 'approve-correction') {
      writeHrmData(companyId, ensureCorrectedPunch(readHrmData(companyId, storage), true), storage);
      state = { ...state, correctionStatus: 'Approved', correctedMinutes: 0 };
    }
    if (stage.id === 'recalculate-time') {
      const computed = buildDemoPayroll(companyId, storage);
      run = advancePayrollTo(computed.run, 'Posted', 'Client Admin / P&A Admin');
      writeHrmData(companyId, computed.hrmData, storage); savePayrollRun(companyId, run, storage);
    }
  } else if (journeyId === 'formula-trace') {
    if (stage.id === 'inspect-formula') state = {
      ...state,
      formulaCode: 'ERN-002',
      formulaExpression: '{{hourly_rate}} * {{ot_hours}} * {{ot_rate}}',
      formulaStatus: 'Active',
    };
    if (stage.id === 'approve-formula-input') {
      writeHrmData(companyId, ensureOvertime(readHrmData(companyId, storage), 'Approved'), storage);
      state = { ...state, formulaInputStatus: '2.00 approved OT hours' };
    }
    if (stage.id === 'calculate-formula') {
      const computed = buildDemoPayroll(companyId, storage);
      run = computed.run;
      writeHrmData(companyId, computed.hrmData, storage);
      savePayrollRun(companyId, run, storage);
    }
    if (stage.id === 'approve-formula-payroll') {
      if (!run) {
        const computed = buildDemoPayroll(companyId, storage);
        run = computed.run;
        writeHrmData(companyId, computed.hrmData, storage);
      }
      run = advancePayrollTo(run, 'Posted', 'P&A Admin');
      savePayrollRun(companyId, run, storage);
    }
  } else if (journeyId === 'statutory-trace') {
    if (stage.id === 'inspect-statutory-table') state = {
      ...state,
      statutoryPayoutDate: '2025-11-30',
      statutoryResolution: 'Effective versions resolved by payout date',
    };
    if (stage.id === 'calculate-statutory') {
      const computed = buildDemoPayroll(companyId, storage);
      run = computed.run;
      writeHrmData(companyId, computed.hrmData, storage);
      savePayrollRun(companyId, run, storage);
    }
    if (stage.id === 'post-statutory') {
      if (!run) {
        const computed = buildDemoPayroll(companyId, storage);
        run = computed.run;
        writeHrmData(companyId, computed.hrmData, storage);
      }
      run = advancePayrollTo(run, 'Posted', 'P&A Admin');
      savePayrollRun(companyId, run, storage);
    }
  } else if (journeyId === 'deduction-protection') {
    if (stage.id === 'add-protected-deduction') {
      writeDemoRegister('deductions', companyId, { id: 'e2e-protected-deduction', code: 'DED-E2E-PROTECT', name: 'Other', employee: '0011223345 - John Collins Doe', amount: '25000', frequency: 'Once', startDate: '2025-11-01', endDate: '2025-11-30', balance: '25000', remarks: 'Scenario protected equipment recovery', status: 'Active' }, storage);
      state = { ...state, deductionAmount: 25000, protectedDeductionDue: 25000 };
    }
    if (stage.id === 'inspect-deduction-policy') {
      const policies = readPolicies(companyId);
      writePolicies(companyId, { ...policies, takeHome: { ...policies.takeHome, enabled: true, autoDefer: true, thresholdType: 'Percentage', threshold: 30, priorityChoice: 'Take-Home Pay', notifyEmployee: true, payslipTagging: true } });
      state = { ...state, policyThreshold: 30 };
    }
    if (stage.id === 'calculate-protection') {
      const computed = buildDemoPayroll(companyId, storage);
      run = computed.run;
      writeHrmData(companyId, computed.hrmData, storage);
      savePayrollRun(companyId, run, storage);
    }
    if (stage.id === 'post-protection') {
      if (!run) {
        const computed = buildDemoPayroll(companyId, storage);
        run = computed.run;
        writeHrmData(companyId, computed.hrmData, storage);
      }
      run = advancePayrollTo(run, 'Posted', 'P&A Admin');
      savePayrollRun(companyId, run, storage);
    }
  }

  run = readPayrollRuns(companyId, storage).find(item => item.id === 'run-e2e-payroll') || run;
  const completedStages = [...new Set([...(state.journeyId === journeyId ? state.completedStages : []), stage.id])];
  const event = { id: `${journeyId}-${stage.id}`, actor: stage.actor, module: stage.module, title: stage.title, at: new Date().toISOString() };
  return writeState(companyId, {
    ...state, companyId, journeyId, completedStages, currentStage: stage.id,
    events: [event, ...(state.events || []).filter(item => item.id !== event.id)].slice(0, 20),
    metrics: metricsFor(run, state.baseline), policyThreshold: readPolicies(companyId).takeHome?.threshold,
    workflowStatus: stage.id.includes('reject') ? 'Rejected' : stage.id.includes('approve') || stage.id.includes('post') ? 'Approved / posted' : 'In progress',
  }, storage);
}

export function resetEndToEndSandbox(storage = globalThis.localStorage) {
  writeHrmData(SANDBOX_COMPANY_ID, defaultHrmData(SANDBOX_COMPANY_ID), storage);
  writePayrollRuns(SANDBOX_COMPANY_ID, [], storage);
  writeOperationalRowsForCompany(operationalStorageKey('earnings', 3), SANDBOX_COMPANY_ID, [], storage);
  writeOperationalRowsForCompany(operationalStorageKey('deductions', 3), SANDBOX_COMPANY_ID, [], storage);
  storage?.removeItem(`atlas-payroll-policy-engines-v4:${SANDBOX_COMPANY_ID}`);
  storage?.removeItem(stateKey(SANDBOX_COMPANY_ID));
  return readEndToEndState(SANDBOX_COMPANY_ID, storage);
}

/** Seed the production-like tenant once so every module opens with coherent history. */
export function seedProductionSampleData(storage = globalThis.localStorage) {
  const existing = readPayrollRuns(PRODUCTION_SAMPLE_COMPANY_ID, storage);
  if (existing.some(item => item.id === 'run-production-sample')) return existing;
  const computed = buildDemoPayroll(PRODUCTION_SAMPLE_COMPANY_ID, storage);
  writeHrmData(PRODUCTION_SAMPLE_COMPANY_ID, computed.hrmData, storage);
  let run = { ...computed.run, id: 'run-production-sample', transactionNumber: 'PR-2025-11-014', remarks: 'Meridian production-like sample payroll' };
  run = advancePayroll(run, [
    { action: 'postDraft', actor: 'Meridian Payroll Admin' }, { action: 'submitReview', actor: 'Meridian Payroll Admin' },
    { action: 'submitApproval', actor: 'Meridian Payroll Reviewer' }, { action: 'approve', actor: 'P&A Admin' }, { action: 'post', actor: 'P&A Admin' },
  ]);
  savePayrollRun(PRODUCTION_SAMPLE_COMPANY_ID, run, storage);
  return readPayrollRuns(PRODUCTION_SAMPLE_COMPANY_ID, storage);
}

export function readProductionSampleState(storage = globalThis.localStorage) {
  const runs = seedProductionSampleData(storage);
  const run = runs.find(item => item.id === 'run-production-sample');
  return {
    companyId: PRODUCTION_SAMPLE_COMPANY_ID,
    journeyId: 'production-sample',
    completedStages: [], events: [], metrics: metricsFor(run),
    policyThreshold: readPolicies(PRODUCTION_SAMPLE_COMPANY_ID).takeHome?.threshold,
  };
}

export function cloneEndToEndState(state) { return clone(state); }
