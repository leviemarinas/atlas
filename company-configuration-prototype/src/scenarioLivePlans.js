/**
 * Real Atlas destinations and per-step execution plans for every Scenario
 * Studio story.
 *
 * `entry` contains visible control labels in click order after the actor and
 * primary module have been selected. `steps` is a sparse override map keyed by
 * the catalog step index, used where the generic verb classification cannot
 * reach a screen on its own (wizards, named fields, multi-control decisions).
 *
 * `stepPlanFor` is the contract the player depends on: it returns exactly one
 * planned action per catalog step, so a story can never silently skip a step.
 * Keeping the derivation here — rather than inside the player — makes coverage
 * testable and prevents a new story falling back to a decorative preview.
 */

export const STEP_KINDS = Object.freeze(['navigate', 'open', 'form', 'commit', 'inspect']);

const plan = (module, ...entry) => ({ module, entry, steps: {} });
const planWith = (module, entry, steps) => ({ module, entry, steps });

/** A deciding action: Atlas stops at this control on the last step. */
const COMMIT_VERBS = /\b(submit|save|confirm|approve|reject|publish|commit|post|retire|activate|deactivate|release|run|recalculate|calculate|validate|override|lock|re-?open|generate|export|download|assign)\b/i;
/**
 * Data entry: Atlas opens the owning form and types into it. "Select" and
 * "Choose" are deliberately absent — in this catalog they almost always name a
 * screen, list entry, or record ("Select Payslips & Payroll History", "Choose
 * Payroll Register"), so treating them as data entry made Atlas try to fill a
 * read-only inquiry screen.
 */
const FORM_VERBS = /\b(enter|type|define|complete|change|add|adjust|upload|attach|map|build|set|create|edit|update|configure|fill)\b/i;
/** Reveals a record, row menu, screen, or dialog without yet entering data. */
const OPEN_VERBS = /\b(open|click|select|choose|expand|drill|reveal|start|filter|switch)\b/i;

const LEADING_VERB = /^(open|click|select|enter|view|inspect|review|compare|choose|add|define|complete|change|run|apply|submit|save|confirm|approve|reject|switch|expand|download|upload|set|calculate|filter|mark|publish|retire|commit|track|trace|match|reconcile|verify|resolve|return|assign|generate|import|validate)\s+/i;

/**
 * Ordered control labels Atlas will look for, most specific first. Derived from
 * the step's own wording so a catalog edit updates the live run with it.
 */
export function targetsForAction(action = '') {
  const concise = action.replace(LEADING_VERB, '').replace(/^(a|an|the|my)\s+/i, '').trim();
  const targets = [action, concise];
  const add = (...labels) => labels.forEach(label => targets.push(label));
  if (/pending/i.test(action)) add('Pending');
  if (/details|employee request|transaction|record|line/i.test(action)) add('View Details', 'Row actions', 'View');
  if (/\bapply\b|application/i.test(action)) add('Apply');
  if (/\badd\b|create/i.test(action)) add('Add', 'Create Transaction', 'Add record');
  if (/review|inspect/i.test(action)) add('Review', 'View');
  if (/approve/i.test(action)) add('Approve');
  if (/reject/i.test(action)) add('Reject');
  if (/save/i.test(action)) add('Save record', 'Save');
  if (/submit/i.test(action)) add('Submit');
  if (/confirm/i.test(action)) add('Confirm');
  if (/next|continue|step/i.test(action)) add('Next', 'Continue');
  if (/download|export/i.test(action)) add('Download', 'Export');
  if (/filter/i.test(action)) add('Filter', 'All');
  return [...new Set(targets.map(item => String(item).trim()).filter(Boolean))];
}

/** Classify one catalog step into the action Atlas will actually perform. */
export function kindForAction(action = '', index = 1) {
  if (index === 0) return 'navigate';
  if (COMMIT_VERBS.test(action)) return 'commit';
  if (FORM_VERBS.test(action)) return 'form';
  if (OPEN_VERBS.test(action)) return 'open';
  return 'inspect';
}

const NARRATION = {
  navigate: (item, entry) => `Opening ${entry.join(' › ') || item.screen} in the real Atlas app.`,
  open: item => `Opening “${item.action}” on the live ${item.screen} screen.`,
  form: item => `Completing the real ${item.screen} form: ${item.action.toLowerCase()}.`,
  commit: item => `Reaching the deciding control for “${item.action}” on ${item.screen}.`,
  inspect: item => `Reading the live ${item.screen} result to verify ${item.action.toLowerCase()}.`,
};

/**
 * One planned action per catalog step, in order. The player runs this array and
 * records an outcome for every entry, so the step ledger always accounts for
 * every step in the story.
 */
export function stepPlanFor(scenario) {
  const live = livePlanFor(scenario.id) || { module: 'HRM', entry: [], steps: {} };
  return scenario.steps.map((item, index) => {
    const override = live.steps?.[index] || {};
    const kind = override.kind || kindForAction(item.action, index);
    const targets = override.targets || (index === 0 ? live.entry : targetsForAction(item.action));
    return Object.freeze({
      index,
      kind,
      screen: item.screen,
      action: item.action,
      detail: item.detail,
      expected: item.result || '',
      targets: Object.freeze(targets.length ? [...targets] : [item.action]),
      after: Object.freeze([...(override.after || [])]),
      fields: override.fields ? Object.freeze({ ...override.fields }) : null,
      entry: Object.freeze(index === 0 ? [...live.entry] : []),
      narration: override.narration || (NARRATION[kind] || NARRATION.inspect)(item, live.entry),
      // The catalog walkthrough is explanatory and must not write to the live
      // company, so Atlas stops on every deciding control rather than firing
      // it — not only on the last one. Whoever is watching commits it.
      committing: kind === 'commit',
    });
  });
}

export const SCENARIO_LIVE_PLANS = Object.freeze({
  'emp-payslip': plan('HRM', 'Employee Self-inquiry', 'Payslips & Payroll History'),
  'emp-payslip-history': plan('HRM', 'Employee Self-inquiry', 'Payslips & Payroll History'),
  'emp-leave': planWith('HRM', ['Employee Self-service', 'Leave Application', 'Leave Application'], {
    1: { kind: 'form', targets: ['Apply'], fields: { 'Leave Type': 'Vacation Leave', 'Leave Start Date': '2026-08-24', 'Leave End Date': '2026-08-25', Reason: 'Approved family commitment filed in advance' } },
  }),
  'emp-overtime': planWith('HRM', ['Employee Self-service', 'Overtime Request Application'], {
    1: {
      kind: 'form',
      targets: ['Apply'],
      fields: {
        'Overtime Start Date': '2026-08-20', 'Overtime Start Time': '18:00',
        'Overtime End Date': '2026-08-20', 'Overtime End Time': '20:00',
        Reason: 'Month-end payroll processing support',
      },
    },
  }),
  'emp-time-correction': planWith('HRM', ['Employee Self-service', 'Time In/Out Correction Application'], {
    1: {
      kind: 'form',
      targets: ['Apply'],
      fields: {
        'Actual Clock-in Date': '2026-08-19', 'Actual Clock-in Time': '09:30',
        'Corrected Clock-In Date': '2026-08-19', 'Corrected Clock-In Time': '08:00',
        Reason: 'Biometrics outage reference BIO-2026-0819 attached',
      },
    },
  }),
  'emp-shift': plan('HRM', 'Employee Self-service', 'Work and Shift', 'Shift Change Application'),
  'emp-loan': planWith('HRM', ['Employee Self-service', 'Loans', 'Company Loan Application'], {
    1: { kind: 'form', targets: ['Apply'], fields: { 'Loan Amount': '30000', Purpose: 'Home repair', 'Deduction Amount': '2500' } },
  }),
  'emp-loan-inquiry': plan('HRM', 'Employee Self-inquiry', 'Loan Inquiry'),
  'emp-coe': plan('HRM', 'Certification Request'),
  'emp-benefits': plan('HRM', 'Benefits', 'Employee Benefits'),
  'emp-leave-ledger': plan('HRM', 'Employee Self-inquiry', 'Leave Balances & Ledger'),
  'emp-attendance': plan('HRM', 'Employee Self-inquiry', 'Attendance Summary'),
  'emp-clearance': planWith('HRM', ['Employee Offboarding', 'Employee Clearance & Checklist', 'Employee Clearance Application'], {
    1: { kind: 'open', targets: ['Row actions', 'View Details'], narration: 'Opening the employee’s own assigned clearance checklist.' },
    2: { kind: 'form', targets: ['Apply'], narration: 'Attaching proof against an incomplete checklist item.' },
  }),

  'apr-leave-approve': plan('HRM', 'Manage Approvals', 'Leave Management', 'Leave Manage & Approval'),
  'apr-leave-reject': plan('HRM', 'Manage Approvals', 'Leave Management', 'Leave Manage & Approval'),
  'apr-overtime': plan('HRM', 'Manage Approvals', 'Overtime Manage & Approval'),
  'apr-time-correction': plan('HRM', 'Manage Approvals', 'Time In/Out Correction Manage & Approval'),
  'apr-shift-assign': plan('HRM', 'Manage Approvals', 'Work/Shift Management', 'Shift Assignment (Assign Subordinate)'),
  'apr-expense': plan('HRM', 'Manage Approvals', 'Expense Management', 'Expense/Reimbursement Approval'),
  'apr-cash-advance': plan('HRM', 'Manage Approvals', 'Expense Management', 'Cash Advance Approval'),
  'apr-company-loan': plan('HRM', 'Manage Approvals', 'Loan Management', 'Company Loan Approval'),
  'apr-government-loan': plan('HRM', 'Manage Approvals', 'Loan Management', 'Government Loan Approval'),
  'apr-resignation': plan('HRM', 'Manage Approvals', 'Employee Requests Management', 'Employee Resignation Approval'),
  'apr-coe': plan('HRM', 'Manage Approvals', 'Employee Requests Management', 'Certificate of Employment Request Approval'),
  'apr-onboarding-doc': plan('HRM', 'Manage Approvals', 'Employee Requests Management', 'Employee Onboarding Documents'),
  'apr-clearance': planWith('HRM', ['Employee Offboarding', 'Employee Clearance & Checklist', 'Employee Clearance Approval'], {
    1: { kind: 'open', targets: ['For Review', 'Row actions'], narration: 'Filtering the approval queue to the cases awaiting review.' },
    2: { kind: 'open', targets: ['Row actions', 'View Details'], narration: 'Opening the submitted checklist and its file previews.' },
  }),
  'apr-team-attendance': plan('HRM', 'Employee Self-inquiry', 'Attendance Summary'),

  'client-company': plan('Core', 'Company Configuration'),
  'client-employee': plan('Core', 'Employee Masterfile'),
  'client-earning': planWith('Payroll', ['Earning Management'], {
    1: {
      kind: 'form',
      targets: ['Add', 'Add record'],
      fields: {
        'Earning Code': 'ERN-STUDIO-001', 'Earning Name': 'Allowance', Employee: 'John Collins Doe',
        'Earning Frequency': 'One-time', 'Basis/Unit': 'Fixed amount', Amount: '3000',
        'Effectivity Date': '2026-08-01', Remarks: 'Scenario Studio demonstration earning',
      },
    },
  }),
  'client-deduction': planWith('Payroll', ['Deduction Management'], {
    1: {
      kind: 'form',
      targets: ['Add', 'Add record'],
      fields: {
        'Deduction Code': 'DED-STUDIO-001', 'Deduction Name': 'Other', Employee: 'John Collins Doe',
        'Deduction Amount': '850', 'Deduction Frequency': 'Once', 'Start Date': '2026-08-01',
        Remarks: 'Scenario Studio demonstration deduction',
      },
    },
  }),
  'client-bonus': plan('Payroll', 'Bonus Management'),
  'client-payroll-create': planWith('Payroll', ['Payroll Processing'], {
    1: { kind: 'form', targets: ['Create Transaction'], fields: { 'Payroll calendar': '', Remarks: 'Scenario Studio live payroll simulation' }, after: ['Next'], narration: 'Opening the real Add Payroll wizard and choosing a configured payout calendar.' },
    2: { kind: 'open', targets: ['Next'], after: ['Next'], narration: 'Stepping through the real wizard: computation settings, then the employee population.' },
    3: { kind: 'commit', targets: ['Create transaction'], narration: 'Reaching the live Review step, where “Create transaction” commits the payroll.' },
  }),
  'client-payroll-edit': plan('Payroll', 'Payroll Processing'),
  'client-payroll-review': plan('Payroll', 'Payroll Processing'),
  'client-payroll-approve': plan('Payroll', 'Payroll Processing'),
  'client-policy': plan('Core', 'Company Configuration', 'Services Information', 'Computational Basis', 'Policy Engines'),
  'client-rule': plan('Payroll', 'Policy Management'),
  'client-retirement': plan('Core', 'Company Configuration', 'Services Information', 'Computational Basis', 'Policy Engines', 'Retirement Pay'),
  'client-final-pay': plan('Core', 'Company Configuration', 'Services Information', 'Computational Basis', 'Policy Engines', 'Final Pay'),
  'client-gross-up': plan('Core', 'Company Configuration', 'Services Information', 'Computational Basis', 'Policy Engines', 'Gross Up'),
  'client-reports': plan('Payroll', 'Reports'),
  'client-remittance': plan('Payroll', 'Remittance Monitoring'),
  'client-access': plan('Core', 'Access & Approvals'),

  'pa-statutory': plan('Settings', 'Statutory Table'),
  'pa-tax': plan('Settings', 'Tax Tables'),
  'pa-computation': plan('Settings', 'Standard Computation Library'),
  'pa-policy-impact': plan('Core', 'Company Configuration', 'Services Information', 'Computational Basis', 'Policy Engines'),
  'pa-override': plan('Settings', 'Access & Approvals'),
  'pa-billing': plan('Payroll', 'Billing'),
  // The switcher carries the active company's own name, so it is reached by
  // selector rather than by a label that changes with the session.
  'pa-multi-company': planWith('Payroll', ['Payroll Processing'], {
    1: { kind: 'open', targets: ['css:.company-switch'], after: ['Northstar Retail'], narration: 'Opening the real top-bar company switcher and selecting Northstar Retail.' },
    2: { kind: 'inspect', targets: ['Payroll Processing'], narration: 'Reading Northstar’s own Payroll Processing register to prove the scope changed.' },
    3: { kind: 'open', targets: ['css:.company-switch'], after: ['ABC Company Ltd'], narration: 'Switching the live session back to ABC Company Ltd — a scope change, not a write, so Atlas completes it.' },
  }),
  'pa-audit': plan('Settings', 'Audit Log'),
  // Reference Tables is a hub of controlled lists; the story is about retiring
  // a value inside one, so the path has to open a list.
  'pa-reference': planWith('Settings', ['Reference Table', 'Civil Status'], {
    1: { kind: 'open', targets: ['Row actions', 'View Details'], narration: 'Opening an active value to review its usage and effectivity.' },
  }),
  'pa-payroll-reopen': plan('Payroll', 'Payroll Processing'),
  'pa-negative-net': plan('Payroll', 'Payroll Processing'),
  'pa-import': plan('Payroll', 'Payroll Processing', 'Create Transaction'),
});

export function livePlanFor(scenarioId) {
  return SCENARIO_LIVE_PLANS[scenarioId] || null;
}
