import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CaretDown,
  Check,
  DownloadSimple,
  Eye,
  FileCsv,
  FilePdf,
  FileText,
  Flask,
  Function,
  Link,
  LinkBreak,
  Lock,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  SlidersHorizontal,
  Trash,
  UploadSimple,
  Users,
  Warning,
  X,
} from '@phosphor-icons/react';
import { downloadFile } from './fileDownload';
import { appendAuditEvent, defaultCompanyRecord, readActiveCompanyId } from './companyRepository';
import { useRole } from './RoleContext';
import { referenceValues } from './ReferenceTables';
import { seedVersion } from './statutorySchedules.js';
import { rejectUpload } from './uploadErrorLog.js';
import { DateInput } from './DateInput.jsx';
import {
  SCOPE_KINDS,
  coveredEmployees,
  departments,
  describeScope,
  employeeDirectory,
  employeeGroups,
  normalizeScope,
  scopeFromLegacyFields,
  seedScope,
} from './applicabilityScope';
import {
  computationScope,
  historyEntry,
  readComputationLibrary,
  readHistory,
  readReferences,
  resolveReferenceVersion,
  writeHistory,
} from './computationGovernance';
import {
  fields as approvedFields,
  describeParameterRange,
  fieldMap,
  formatParameterValue,
  fromDisplayValue,
  parameterUnit,
  parameterValueProblem,
  toDisplayValue,
} from './computationCatalog';
import {
  BINDABLE_MODULES,
  BINDING_KINDS,
  bindableTokens,
  bindingProblems,
  bindingSummary,
  boundDependencies,
  computationsForModule,
  evaluateBinding,
  isBindableModule,
  isEngineSupplied,
  normalizeBindings,
  numericFromText,
  parameterValueProblems,
  withFixedValueChange,
} from './computationBindings';


/**
 * The payment cycle a recurring item follows, and the periods of that cycle it
 * falls in. The modes are P&A's Annex A list. A mode with one period a cycle
 * offers no checklist: 'Every Payroll' is the only answer it has.
 */
export const CONFIG_PAYMENT_MODES = Object.freeze(['Hourly', 'Daily', 'Weekly', 'Bi-weekly', 'Four-weekly', 'Semi-monthly', 'Monthly', 'Piece-rate', 'Fixed rate', 'Quarterly', 'Yearly', 'One-time']);
const FREQUENCY_BY_MODE = Object.freeze({
  Monthly: ['Every Payroll'],
  'Semi-monthly': ['Every Payroll', 'First Half', 'Second Half'],
  Weekly: ['Every Payroll', 'First Week', 'Second Week', 'Third Week', 'Fourth Week', 'Fifth Week'],
  'Bi-weekly': ['Every Payroll', 'First Payroll', 'Second Payroll', 'Third Payroll'],
  Daily: ['Calendar View'],
  Yearly: ['Yearly'],
  'Piece-rate': ['Per work completed'],
  Quarterly: ['Every Payroll', 'First Quarter', 'Second Quarter', 'Third Quarter'],
});
export const PAYROLL_PERIODS = Object.freeze(['Every Payroll', 'First Half', 'Second Half']);

/** The frequency choices a payment mode offers. */
export function frequencyOptions(paymentMode) {
  return FREQUENCY_BY_MODE[paymentMode] || ['Every Payroll'];
}

/**
 * The frequency, kept to what the payment mode offers. 'Every Payroll' means
 * every period of the mode, so it is never kept beside a named period, and a
 * change of mode drops the periods the new mode does not have.
 */
export function normalizeFrequency(paymentMode, value) {
  const options = frequencyOptions(paymentMode);
  const picked = String(value || '').split(',').map(item => item.trim()).filter(item => options.includes(item));
  if (!picked.length) return options[0];
  const named = picked.filter(item => item !== 'Every Payroll');
  return (named.length ? named : picked).join(', ');
}

// Before Payment Mode existed, the cycle itself was stored in `frequency`.
const LEGACY_CYCLES = Object.freeze({ 'One-time': 'One-time', Weekly: 'Weekly', 'Semi-monthly': 'Semi-monthly', Monthly: 'Monthly', Quarterly: 'Quarterly', Annually: 'Yearly' });

/** A record saved before Payment Mode existed, moved onto the payment mode and frequency pair. */
export function migrateSchedule(record = {}) {
  const legacy = LEGACY_CYCLES[record.frequency];
  const paymentMode = legacy && !frequencyOptions(record.paymentMode).includes(record.frequency) ? legacy : (record.paymentMode || 'Semi-monthly');
  return { ...record, paymentMode, frequency: normalizeFrequency(paymentMode, record.frequency) };
}

const usesSchedule = def => def.steps.some(step => step.fields.some(field => field.key === 'paymentMode'));

const scheduleFields = () => [
  { key: 'paymentMode', label: 'Payment Mode', type: 'select', options: CONFIG_PAYMENT_MODES, required: true, half: true },
  { key: 'frequency', label: 'Frequency', type: 'frequency', required: true, half: true },
];

// The effectivity window every recurring item carries. End Date, Period End and Hold Date are optional.
const dateSetFields = () => [
  { key: 'effectivityDate', label: 'Effectivity Date', type: 'date', required: true, half: true },
  { key: 'startDate', label: 'Start Date', type: 'date', required: true, half: true },
  { key: 'endDate', label: 'End Date', type: 'date', half: true },
  { key: 'periodStart', label: 'Period Start', type: 'select', options: PAYROLL_PERIODS, required: true, half: true },
  { key: 'periodEnd', label: 'Period End', type: 'select', options: PAYROLL_PERIODS, half: true },
  { key: 'holdDate', label: 'Hold Date', type: 'date', half: true },
];
const DATE_SET_DEFAULTS = Object.freeze({ effectivityDate: '2026-01-01', startDate: '2026-01-01', periodStart: 'Every Payroll' });

// Taxability decides the classifications on offer: a non-taxable earning is a receivable, De Minimis or other non-taxable.
const EARNING_CLASSIFICATIONS = Object.freeze({
  Taxable: ['Regular Earning', 'Retirement', 'Fringe Benefit'],
  'Non-taxable': ['Receivable', 'De Minimis', 'Other Non-taxable'],
});

// De Minimis benefits and their ceilings come from the statutory De Minimis table, never from a number typed on the earning.
const deMinimisBenefits = () => seedVersion('deMinimis', 2026, 1, true).rows;
const deMinimisRule = draft => deMinimisBenefits().find(row => row.benefitName === draft.deMinimisBenefit);
const pesos = value => `₱ ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const HIERARCHY_RANKS = Object.freeze(Array.from({ length: 30 }, (_, index) => String(index + 1)));

/** Interest for the whole term: principal × annual rate × months ÷ 12. */
function loanInterest(draft) {
  return Math.round(Number(draft.principal || 0) * Number(draft.interest || 0) / 100 * Number(draft.terms || 0) / 12 * 100) / 100;
}

const baseModuleDefinitions = {
  earnings: {
    title: 'Earning Configuration',
    plural: 'earnings',
    description: 'Set up fixed or one-time earnings, recurring frequency, taxability, computation rules, and accounting mappings.',
    table: [
      ['code', 'Earning Code'], ['name', 'Earning Name'], ['type', 'Earning Type'], ['applicability', 'Applies To'], ['status', 'Status'],
    ],
    steps: [
      {
        title: 'Earning Details', fields: [
          { key: 'code', label: 'Earning Code', required: true, half: true },
          { key: 'name', label: 'Earning Name', required: true, half: true },
          { key: 'type', label: 'Earning Type', type: 'select', options: ['Normal', 'Basic Pay Adjustment', 'Allowance', 'Special Privilege Leave', 'Undertime', 'Late', 'Reimbursement'], required: true },
          { key: 'applicability', label: 'Applies to', type: 'applicability' },
          ...scheduleFields(),
          ...dateSetFields(),
          { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
        ],
      },
      {
        title: 'Earning Setup', fields: [
          { key: 'cappedEarning', label: 'Capped Earning?', type: 'boolean', required: true, half: true },
          { key: 'adjustIfAbsent', label: 'Adjust If Absent?', type: 'boolean', required: true, half: true },
          // Adjust If Absent opens the absence rules.
          { key: 'adjustmentEarning', label: 'Adjustment Earning', type: 'multiselect', options: (draft, { companyId } = {}) => readServiceConfiguration('earnings', companyId).map(item => item.name).filter(name => name && name !== draft.name), visible: draft => draft.adjustIfAbsent === 'Yes' },
          { key: 'minimumAbsent', label: 'Minimum Number of Absent', type: 'number', half: true, visible: draft => draft.adjustIfAbsent === 'Yes' },
          { key: 'autoCompute', label: 'Auto-compute?', type: 'boolean', required: true, half: true },
          { key: 'defaultAmount', label: 'Default Amount', type: 'number', half: true },
          // Auto-compute opens the basis it computes from and the unit it counts in.
          { key: 'computationBasis', label: 'Computation Basis', type: 'select', options: ['Current Basic Pay', 'Previous Basic Pay', 'Taxable Earning / Variable Allowance (per EE 201 setup)'], required: true, half: true, visible: draft => draft.autoCompute === 'Yes' },
          { key: 'unit', label: 'Unit', type: 'select', options: ['in Minutes', 'in Hours', 'in Days', 'Fixed Amount'], half: true, visible: draft => draft.autoCompute === 'Yes' },
          { key: 'variableAllowance', label: 'Variable Allowance', type: 'select', options: ['Variable Allowance 1', 'Variable Allowance 2', 'Not applicable'], half: true },
          { key: 'negativeComputation', label: 'Negative Computation?', type: 'boolean', half: true },
          { key: 'taxability', label: 'Taxability', type: 'select', options: ['Taxable', 'Non-taxable'], required: true, half: true },
          { key: 'classification', label: 'Earning Classification', type: 'select', options: draft => EARNING_CLASSIFICATIONS[draft.taxability] || [...EARNING_CLASSIFICATIONS.Taxable, ...EARNING_CLASSIFICATIONS['Non-taxable']], required: true, half: true },
          { key: 'includedInRate', label: 'Included in computing the daily/hourly rate?', type: 'boolean', required: true, half: true, visible: draft => draft.taxability === 'Taxable' || ['De Minimis', 'Other Non-taxable'].includes(draft.classification) },
          { key: 'deMinimisBenefit', label: 'De Minimis Benefit', type: 'select', options: () => deMinimisBenefits().map(row => row.benefitName), required: true, half: true, visible: draft => draft.classification === 'De Minimis' },
          { key: 'deMinimisThreshold', label: 'Applicable Threshold', type: 'readonly', show: draft => (deMinimisRule(draft) ? pesos(deMinimisRule(draft).ceiling) : 'Pick a benefit'), half: true, visible: draft => draft.classification === 'De Minimis' },
          { key: 'deMinimisBasis', label: 'Threshold Basis', type: 'readonly', show: draft => deMinimisRule(draft)?.frequency || '—', half: true, visible: draft => draft.classification === 'De Minimis' },
          { key: 'deMinimisEffective', label: 'Threshold Effective Date', type: 'readonly', show: () => '01/01/2026', half: true, visible: draft => draft.classification === 'De Minimis' },
          { key: 'workDays', label: 'Work Days', type: 'number', half: true },
          // Reclassification: whether this earning may move between taxable and non-taxable,
          // which way, in what order against the others, and how much of it may move.
          { key: 'eligibleForReclassification', label: 'Eligible for reclassification?', type: 'boolean', required: true, half: true },
          { key: 'reclassDirection', label: 'Reclassification direction', type: 'select', options: ['Taxable to non-taxable', 'Non-taxable to taxable'], half: true, visible: draft => draft.eligibleForReclassification === 'Yes' },
          { key: 'reclassPriority', label: 'Reclassification hierarchy (1 = first)', type: 'number', half: true, visible: draft => draft.eligibleForReclassification === 'Yes' },
          { key: 'reclassCapBasis', label: 'How much may be reclassified', type: 'select', options: ['No limit', 'Amount per payroll', 'Percent of the earning'], half: true, visible: draft => draft.eligibleForReclassification === 'Yes' },
          { key: 'reclassCap', label: 'Limit', type: 'number', half: true, visible: draft => draft.eligibleForReclassification === 'Yes' && draft.reclassCapBasis && draft.reclassCapBasis !== 'No limit' },
        ],
      },
      {
        title: 'Accounting Setup', fields: [
          { key: 'glBreakdown', label: 'GL Breakdown', type: 'select', options: ['Per Employee', 'Per Department', 'Per Cost Center'] },
          { key: 'glName', label: 'GL Name', type: 'select', options: ['General Ledger Name 1', 'Payroll Expense', 'Employee Benefits'] },
          { key: 'subGlName', label: 'Sub-GL Name', type: 'select', options: ['Account Name', 'Salaries and Wages', 'Allowances'] },
        ],
      },
    ],
    /** Hierarchy and limit are refused here, at the screen, rather than discovered at payroll. */
    validate: (draft, { companyId } = {}) => {
      if (draft.eligibleForReclassification !== 'Yes') return [];
      const problems = [];
      const rank = Number(draft.reclassPriority);
      if (!Number.isInteger(rank) || rank < 1) problems.push('Give the reclassification hierarchy a whole number from 1 (first) upward.');
      else {
        const clash = readServiceConfiguration('earnings', companyId).find(item => item.id !== draft.id && item.eligibleForReclassification === 'Yes' && item.status !== 'Inactive' && Number(item.reclassPriority) === rank);
        if (clash) problems.push(`${clash.name} already holds hierarchy ${rank}. Two earnings cannot share a rank — pick the next free one.`);
      }
      if (draft.reclassCapBasis && draft.reclassCapBasis !== 'No limit') {
        const cap = Number(draft.reclassCap);
        if (!(cap > 0)) problems.push('Enter the limit — the most that may be reclassified, greater than zero.');
        if (draft.reclassCapBasis === 'Percent of the earning' && cap > 100) problems.push('A percentage limit cannot be above 100%.');
      }
      return problems;
    },
    // A taxability change keeps only a classification that taxability still allows.
    derive: (draft, key) => (key === 'taxability' && !(EARNING_CLASSIFICATIONS[draft.taxability] || []).includes(draft.classification)
      ? { classification: EARNING_CLASSIFICATIONS[draft.taxability]?.[0] || '' } : null),
    defaults: { type: 'Normal', paymentMode: 'Semi-monthly', frequency: 'Every Payroll', ...DATE_SET_DEFAULTS, status: 'Active', cappedEarning: 'No', adjustIfAbsent: 'No', minimumAbsent: '0', autoCompute: 'No', defaultAmount: '0', eligibleForReclassification: 'No', reclassDirection: 'Taxable to non-taxable', reclassPriority: '1', reclassCapBasis: 'No limit', reclassCap: '0', computationBasis: 'Current Basic Pay', variableAllowance: 'Variable Allowance 1', unit: 'in Minutes', negativeComputation: 'No', taxability: 'Non-taxable', classification: 'De Minimis', deMinimisBenefit: 'Rice Subsidy', includedInRate: 'No', workDays: '261', glBreakdown: 'Per Employee', glName: 'General Ledger Name 1', subGlName: 'Account Name' },
    rows: [
      ['47218653', 'Salary', 'Normal'], ['47218654', 'Lecture Fee', 'Normal'], ['47218655', 'Basic Pay Adjustment', 'Basic Pay Adjustment'], ['47218656', 'Clothing Allowance', 'Allowance'], ['47218657', 'Special Privilege Leave', 'Special Privilege Leave'], ['47218658', 'Transportation Reimbursement', 'Reimbursement'], ['47218659', 'Undertime Adjustment', 'Undertime'], ['47218660', 'Late Adjustment', 'Late'], ['47218661', 'Meal Allowance', 'Allowance', { defaultAmount: '1500' }], ['47218662', 'Night Differential', 'Normal'],
      // Tagged for retirement so the Retirement engine can resolve its salary
      // basis from Earning Configuration instead of redefining the earnings.
      ['47218663', 'Transportation Allowance', 'Allowance', { classification: 'Retirement', taxability: 'Taxable', defaultAmount: '2000' }],
      ['47218664', 'Communication Allowance', 'Allowance', { classification: 'Retirement', taxability: 'Taxable', defaultAmount: '1000' }],
    ],
  },
  bonuses: {
    title: 'Bonus Configuration',
    plural: 'bonuses',
    // No Taxability field: the non-taxable and taxable split is derived from the remaining ₱90,000 ceiling.
    description: 'Define fixed or scheduled bonuses, the non-taxable threshold, employee coverage, schedules and ledger mappings.',
    table: [['code', 'Bonus Code'], ['name', 'Bonus Name'], ['type', 'Bonus Type'], ['threshold', 'Bonus Threshold'], ['applicability', 'Applies To'], ['status', 'Status']],
    steps: [
      { title: 'Bonus Details', fields: [
        { key: 'code', label: 'Bonus Code', required: true, half: true }, { key: 'name', label: 'Bonus Name', required: true, half: true },
        { key: 'type', label: 'Bonus Type', type: 'select', options: ['13th Month Pay', 'Performance Bonus', 'Signing Bonus', 'Productivity Bonus'], required: true, half: true },
        { key: 'applicability', label: 'Applies to', type: 'applicability' },
        { key: 'threshold', label: 'Annual Non-Taxable Threshold', type: 'readonly', show: () => { const ceiling = referenceValues('bonus-ceilings', 'ceiling')[0]; return ceiling ? `${pesos(ceiling)} (from Settings)` : 'From Settings'; }, half: true },
        { key: 'amount', label: 'Bonus Amount', type: 'number', required: true, half: true },
        ...scheduleFields(),
        ...dateSetFields(),
        { key: 'dateStart', label: 'Date Start', type: 'date', required: true, half: true }, { key: 'dateEnd', label: 'Date End', type: 'date', half: true },
        { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
      ] },
      { title: 'Accounting Setup', fields: [
        { key: 'glBreakdown', label: 'GL Breakdown', type: 'select', options: ['Per Employee', 'Per Department', 'Per Cost Center'] },
        { key: 'glName', label: 'GL Name', type: 'select', options: ['Bonus Expense', 'Employee Benefits'] },
        { key: 'subGlName', label: 'Sub-GL Name', type: 'select', options: ['13th Month Pay', 'Performance Incentives'] },
      ] },
    ],
    defaults: { type: 'Performance Bonus', threshold: '90000', amount: '0', paymentMode: 'Yearly', frequency: 'Yearly', ...DATE_SET_DEFAULTS, dateStart: '2026-01-01', status: 'Active', glBreakdown: 'Per Employee', glName: 'Bonus Expense', subGlName: 'Performance Incentives' },
    rows: [['BON-001', '13th Month Pay', '13th Month Pay'], ['BON-002', 'Performance Bonus', 'Performance Bonus'], ['BON-003', 'Signing Bonus', 'Signing Bonus'], ['BON-004', 'Productivity Incentive', 'Productivity Bonus'], ['BON-005', 'Service Award', 'Performance Bonus']],
  },
  deductions: {
    title: 'Deduction Configuration',
    plural: 'deductions',
    description: 'Configure fixed or one-time deductions, recurring frequency, payroll basis, net-pay treatment, and accounting setup.',
    table: [['code', 'Deduction Code'], ['name', 'Deduction Name'], ['type', 'Deduction Type'], ['applicability', 'Applies To'], ['basis', 'Deduction Basis'], ['status', 'Status']],
    steps: [
      { title: 'Deduction Details', fields: [
        { key: 'code', label: 'Deduction Code', required: true, half: true }, { key: 'name', label: 'Deduction Name', required: true, half: true },
        { key: 'type', label: 'Deduction Type', type: 'select', options: ['Fixed Deduction', 'One-time Deduction', 'Recurring Deduction', 'Adjustment'], required: true },
        { key: 'applicability', label: 'Applies to', type: 'applicability' },
        { key: 'basis', label: 'Deduction Basis', type: 'select', options: ['Fixed Amount', 'Percentage of Basic Pay', 'Percentage of Gross Pay', 'Balance'] }, { key: 'deductionTag', label: 'Deduction Tag', type: 'select', options: ['Company Deduction', 'Withholding Tax', 'Other Statutory Deduction'], half: true, required: true, half: true },
        { key: 'amount', label: 'Default Amount / Rate', type: 'number', required: true, half: true },
        ...scheduleFields(),
        ...dateSetFields(),
        { key: 'partOfNetPay', label: 'Is part of net pay?', type: 'boolean', required: true, half: true }, { key: 'tax', label: 'Tax Treatment', type: 'select', options: ['Pre-tax', 'Post-tax', 'Not applicable'], half: true },
        { key: 'takeHomeTreatment', label: 'Insufficient Net Pay Handling', type: 'select', options: ['Defer Balance', 'Partial Deduction', 'Deduct in Full'], required: true, half: true },
        { key: 'hierarchyPriority', label: 'Hierarchy Rank', type: 'select', options: HIERARCHY_RANKS, required: true, half: true },
        { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
      ] },
      { title: 'Accounting Setup', fields: [
        { key: 'glBreakdown', label: 'GL Breakdown', type: 'select', options: ['Per Employee', 'Per Department', 'Per Cost Center'] },
        { key: 'glName', label: 'GL Name', type: 'select', options: ['Payroll Deductions', 'Employee Receivable'] },
        { key: 'subGlName', label: 'Sub-GL Name', type: 'select', options: ['Company Deductions', 'Other Receivables'] },
      ] },
    ],
    // The number of deductions and the total belong to the employee's own deduction record, not to the company configuration.
    defaults: { type: 'Fixed Deduction', basis: 'Fixed Amount', amount: '500', paymentMode: 'Semi-monthly', frequency: 'Every Payroll', ...DATE_SET_DEFAULTS, partOfNetPay: 'Yes', tax: 'Post-tax', takeHomeTreatment: 'Partial Deduction', hierarchyPriority: '20', status: 'Active', glBreakdown: 'Per Employee', glName: 'Payroll Deductions', subGlName: 'Company Deductions' },
    rows: [['DED-001', 'Uniform Deduction', 'Fixed Deduction', { amount: '500', hierarchyPriority: '21' }], ['DED-002', 'Cooperative Dues', 'Recurring Deduction', { amount: '750', hierarchyPriority: '22' }], ['DED-003', 'Cash Advance', 'Recurring Deduction', { amount: '1000', hierarchyPriority: '23' }], ['DED-004', 'Equipment Charge', 'One-time Deduction', { amount: '900', hierarchyPriority: '24' }], ['DED-005', 'Union Dues', 'Recurring Deduction', { amount: '350', hierarchyPriority: '25' }], ['DED-006', 'Health Insurance', 'Recurring Deduction', { amount: '1200', hierarchyPriority: '26' }]],
  },
  loans: {
    title: 'Company Loan Configuration',
    plural: 'company loans',
    description: 'Set up company loan types, principal, interest, amortization, employee coverage, and recurring collection schedules.',
    table: [['code', 'Loan Code'], ['name', 'Company Loan Name'], ['type', 'Company Loan Type'], ['principal', 'Principal'], ['terms', 'Terms'], ['amortization', 'Amortization'], ['applicability', 'Applies To'], ['status', 'Status']],
    steps: [{ title: 'Company Loan Details', fields: [
      { key: 'code', label: 'Loan Code', required: true, half: true }, { key: 'name', label: 'Company Loan Name', required: true, half: true },
      { key: 'type', label: 'Company Loan Type', type: 'select', options: ['Salary Loan', 'Emergency Loan', 'Educational Loan', 'Calamity Loan'], required: true },
      { key: 'principal', label: 'Principal', type: 'number', required: true, half: true }, { key: 'interest', label: 'Interest per Annum (%)', type: 'number', required: true, half: true },
      { key: 'terms', label: 'Terms (months)', type: 'number', required: true, half: true }, { key: 'interestAmount', label: 'Interest Amount', type: 'number', half: true },
      { key: 'amortization', label: 'Amortization', type: 'number', required: true, half: true },
      ...scheduleFields(),
      ...dateSetFields(),
      { key: 'balanceHandling', label: 'Insufficient Net Pay Handling', type: 'select', options: ['Defer Balance', 'Partial Deduction', 'Deduct in Full'], required: true, half: true },
      { key: 'hierarchyPriority', label: 'Hierarchy Rank', type: 'select', options: HIERARCHY_RANKS, required: true, half: true },
      { key: 'applicability', label: 'Applies to', type: 'applicability' },
      { key: 'interestMethod', label: 'Interest Computation Method', type: 'select', options: ['Simple', 'Add-on', 'Diminishing balance'], required: true, half: true }, { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
    ] }],
    // Interest Amount fills in from the principal, the annual rate and the term, and stays editable.
    derive: (draft, key) => (['principal', 'interest', 'terms'].includes(key) ? { interestAmount: String(loanInterest(draft)) } : null),
    defaults: { type: 'Salary Loan', principal: '100000', interest: '5', terms: '12', interestAmount: '5000', amortization: '8750', paymentMode: 'Monthly', frequency: 'Every Payroll', ...DATE_SET_DEFAULTS, balanceHandling: 'Partial Deduction', hierarchyPriority: '10', interestMethod: 'Simple', status: 'Active' },
    rows: [['CL-001', 'Employee Salary Loan', 'Salary Loan', { principal: '30000', interestAmount: '1500', amortization: '2500', hierarchyPriority: '11' }], ['CL-002', 'Emergency Assistance', 'Emergency Loan', { principal: '15000', interestAmount: '750', amortization: '1500', hierarchyPriority: '12' }], ['CL-003', 'School Support Loan', 'Educational Loan', { principal: '18000', interestAmount: '900', amortization: '1500', hierarchyPriority: '13' }], ['CL-004', 'Calamity Assistance', 'Calamity Loan', { principal: '12000', interestAmount: '600', amortization: '1000', hierarchyPriority: '14' }]],
  },
  basicPay: {
    title: 'Basic Pay and Pay Rate Configuration',
    plural: 'basic pay rates',
    description: 'Define pay types, factor days, work hours, MWE and ECOLA treatment, and effective-dated rate policies.',
    table: [['code', 'Rate Code'], ['name', 'Rate Name'], ['type', 'Pay Type'], ['factorDays', 'Factor Days'], ['mwe', 'MWE'], ['status', 'Status']],
    steps: [{ title: 'Pay Rate Details', fields: [
      { key: 'code', label: 'Rate Code', required: true, half: true }, { key: 'name', label: 'Rate Name', required: true, half: true },
      { key: 'type', label: 'Pay Type', type: 'select', options: ['Monthly', 'Weekly', 'Daily', 'Hourly', 'Flat Rate', 'Piece Rate', 'Part-Time', 'OJT Allowance'], required: true, half: true },
      { key: 'factorDays', label: 'Factor Days per Year', type: 'number', required: true, half: true }, { key: 'workHours', label: 'Work Hours per Day', type: 'number', required: true, half: true },
      { key: 'mwe', label: 'Minimum Wage Earner?', type: 'boolean', half: true }, { key: 'ecola', label: 'ECOLA Eligible?', type: 'boolean', half: true },
      { key: 'region', label: 'Minimum Wage Region', type: 'select', options: ['NCR', 'CAR', 'Region III', 'Region IV-A', 'Region VII', 'Region XI'], required: true },
      { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true, half: true }, { key: 'period', label: 'Applicable Payroll Period', type: 'select', options: ['Every Payroll', 'First Half', 'Second Half'], required: true, half: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
    ] }],
    defaults: { type: 'Monthly', factorDays: '261', workHours: '8', mwe: 'No', ecola: 'No', region: 'NCR', effectiveDate: '2026-01-01', period: 'Every Payroll', status: 'Active' },
    rows: [['BAS-001', 'Monthly Basic Pay', 'Monthly'], ['BAS-002', 'Daily Basic Pay', 'Daily'], ['BAS-003', 'Hourly Basic Pay', 'Hourly'], ['BAS-004', 'MWE with ECOLA', 'Daily'], ['PCE-001', 'Piece-Rate Pay', 'Piece Rate'], ['PRT-001', 'Part-Time Pay', 'Part-Time'], ['OJT-001', 'OJT Allowance Rate', 'OJT Allowance']],
  },
  allowances: {
    title: 'Variable Allowance Configuration',
    plural: 'variable allowances',
    description: 'Configure allowance references, unit basis, derived rates, timekeeping inputs, effective dates, and payroll periods.',
    table: [['code', 'Allowance Code'], ['name', 'Allowance Name'], ['type', 'Unit Basis'], ['taxability', 'Taxability'], ['timekeeping', 'Timekeeping'], ['status', 'Status']],
    steps: [{ title: 'Allowance Details', fields: [
      { key: 'code', label: 'Allowance Code', required: true, half: true }, { key: 'name', label: 'Allowance Name', required: true, half: true },
      { key: 'type', label: 'Unit Basis', type: 'select', options: ['Monthly', 'Daily', 'Hourly', 'Per Minute'], required: true, half: true },
      { key: 'amount', label: 'Default Amount', type: 'number', required: true, half: true }, { key: 'factorDays', label: 'Factor Days', type: 'number', required: true, half: true },
      { key: 'workHours', label: 'Work Hours per Day', type: 'number', required: true, half: true }, { key: 'timekeeping', label: 'Use Timekeeping Units?', type: 'boolean', half: true },
      { key: 'taxability', label: 'Taxability', type: 'select', options: ['Taxable', 'Non-taxable', 'De Minimis'], required: true, half: true },
      { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true, half: true }, { key: 'period', label: 'Applicable Payroll Period', type: 'select', options: ['Every Payroll', 'First Half', 'Second Half'], required: true, half: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
    ] }],
    defaults: { type: 'Monthly', amount: '0', factorDays: '261', workHours: '8', timekeeping: 'No', taxability: 'Taxable', effectiveDate: '2026-01-01', period: 'Every Payroll', status: 'Active' },
    rows: [['ALL-001', 'Transportation Allowance', 'Monthly'], ['ALL-002', 'Meal Allowance', 'Daily'], ['ALL-003', 'Communication Allowance', 'Monthly'], ['ALL-004', 'Night Shift Allowance', 'Hourly']],
  },
  governmentLoans: {
    title: 'Government Loan Configuration',
    plural: 'government loans',
    description: 'Maintain government loan references, agencies, collection frequencies, effective periods, and posting priority.',
    table: [['code', 'Loan Code'], ['name', 'Loan Name'], ['type', 'Agency'], ['frequency', 'Frequency'], ['priority', 'Priority'], ['status', 'Status']],
    steps: [{ title: 'Government Loan Details', fields: [
      { key: 'code', label: 'Loan Code', required: true, half: true }, { key: 'name', label: 'Loan Name', required: true, half: true },
      { key: 'type', label: 'Agency', type: 'select', options: ['SSS', 'HDMF'], required: true, half: true },
      { key: 'frequency', label: 'Payment Frequency', type: 'select', options: ['Every Payroll', 'First Half', 'Second Half', 'Monthly'], required: true, half: true },
      { key: 'priority', label: 'Deduction Priority', type: 'number', required: true, half: true }, { key: 'balanceHandling', label: 'Insufficient Net Pay Handling', type: 'select', options: ['Defer Balance', 'Partial Deduction', 'Deduct in Full'], required: true, half: true },
      { key: 'amortization', label: 'Default Amortization', type: 'number', required: true, half: true },
      { key: 'openingBalance', label: 'Opening Balance for Simulation', type: 'number', required: true, half: true },
      { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true, half: true }, { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
    ] }],
    defaults: { type: 'SSS', frequency: 'Monthly', priority: '5', balanceHandling: 'Partial Deduction', amortization: '1000', openingBalance: '12000', effectiveDate: '2026-01-01', status: 'Active' },
    rows: [['GL-001', 'SSS Salary Loan', 'SSS', { priority: '5', amortization: '1000', openingBalance: '12000' }], ['GL-002', 'SSS Calamity Loan', 'SSS', { priority: '6', amortization: '700', openingBalance: '8400' }], ['GL-003', 'HDMF Multi-Purpose Loan', 'HDMF', { priority: '7', amortization: '800', openingBalance: '9600' }], ['GL-004', 'HDMF Calamity Loan', 'HDMF', { priority: '8', amortization: '650', openingBalance: '7800' }]],
  },
  timeAttendance: {
    title: 'Time & Attendance Configuration',
    plural: 'time and attendance policies',
    description: 'Define work hours, breaks, core hours, shift schedules, flexible time and rounding rules used by payroll and attendance integrations.',
    table: [['code', 'Policy Code'], ['name', 'Policy Name'], ['type', 'Policy Type'], ['applicability', 'Applies To'], ['effectiveDate', 'Effective Date'], ['status', 'Status']],
    steps: [
      { title: 'Time Policy Details', fields: [
        { key: 'code', label: 'Policy Code', required: true, half: true }, { key: 'name', label: 'Policy Name', required: true, half: true },
        { key: 'type', label: 'Policy Type', type: 'select', options: ['Work Hours', 'Break Hours', 'Core Hours', 'Shift Schedule', 'Flexible Time', 'Rounding'], required: true, half: true },
        { key: 'applicability', label: 'Applies to', type: 'applicability' },
        { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true, half: true },
        { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
      ] },
      { title: 'Schedule and Rounding', fields: [
        { key: 'startTime', label: 'Start Time', type: 'time', required: true, half: true }, { key: 'endTime', label: 'End Time', type: 'time', required: true, half: true },
        { key: 'breakMinutes', label: 'Break Minutes', type: 'number', required: true, half: true }, { key: 'coreHours', label: 'Core Hours', type: 'number', required: true, half: true },
        { key: 'graceMinutes', label: 'Grace Minutes', type: 'number', half: true }, { key: 'roundingRule', label: 'Rounding Rule', type: 'select', options: ['None', 'Nearest 5 minutes', 'Nearest 15 minutes', 'Round down', 'Round up'], required: true, half: true },
        { key: 'approvalRequired', label: 'Approval Required?', type: 'boolean', half: true },
      ] },
    ],
    defaults: { type: 'Work Hours', effectiveDate: '2026-01-01', status: 'Active', startTime: '08:00', endTime: '17:00', breakMinutes: '60', coreHours: '8', graceMinutes: '5', roundingRule: 'Nearest 5 minutes', approvalRequired: 'Yes' },
    rows: [['TNA-001', 'Standard Work Hours', 'Work Hours'], ['TNA-002', 'Standard Meal Break', 'Break Hours'], ['TNA-003', 'Makati Core Hours', 'Core Hours'], ['TNA-004', 'Flexible Office Schedule', 'Flexible Time'], ['TNA-005', 'Five-Minute Rounding', 'Rounding']],
  },
  overtime: {
    title: 'Overtime Rate Management',
    plural: 'overtime policies',
    description: 'Maintain effective-dated overtime codes, day-type rates, attendance conditions, approval controls and employee/group assignments.',
    table: [['code', 'OT Code'], ['name', 'OT Policy Name'], ['type', 'Day Type'], ['applicability', 'Applies To'], ['effectiveDate', 'Effective Date'], ['status', 'Status']],
    steps: [
      { title: 'Overtime Identity', fields: [
        { key: 'code', label: 'OT Code', required: true, half: true }, { key: 'name', label: 'OT Policy Name', required: true, half: true },
        { key: 'type', label: 'Day Type', type: 'select', options: ['Regular Workday', 'Rest Day', 'Special Non-working Holiday', 'Regular Holiday', 'Holiday Rest Day'], required: true, half: true },
        { key: 'applicability', label: 'Applies to', type: 'applicability' },
        { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true, half: true },
        { key: 'effectiveTo', label: 'Effective To', type: 'date', half: true }, { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
      ] },
      { title: 'Rates and Conditions', fields: [
        { key: 'workDaysPerYear', label: 'Work Days per Year', type: 'number', required: true, half: true },
        { key: 'preShift', label: 'Pre-shift Rate (%)', type: 'number', required: true, half: true }, { key: 'regularOvertime', label: 'Regular OT Rate (%)', type: 'number', required: true, half: true },
        { key: 'nightShiftDifferential', label: 'Night Shift Differential (%)', type: 'number', required: true, half: true }, { key: 'regularOTWithNSD', label: 'Regular OT with NSD (%)', type: 'number', required: true, half: true },
        { key: 'firstXHours', label: 'First X Hours Rate (%)', type: 'number', required: true, half: true }, { key: 'excessOverXHours', label: 'Excess Over X Hours Rate (%)', type: 'number', required: true, half: true },
        { key: 'attendanceCondition', label: 'Attendance Condition', type: 'select', options: ['Approved overtime only', 'Present on scheduled day', 'No condition'], required: true },
        { key: 'approvalRequired', label: 'Approval Required?', type: 'boolean', half: true }, { key: 'approvalLevel', label: 'Approval Level', type: 'select', options: ['Supervisor', 'Manager', 'Payroll Administrator'], required: true, half: true },
      ] },
    ],
    defaults: { type: 'Regular Workday', effectiveDate: '2026-01-01', status: 'Active', workDaysPerYear: '261', preShift: '125', regularOvertime: '125', nightShiftDifferential: '110', regularOTWithNSD: '137.5', firstXHours: '125', excessOverXHours: '130', attendanceCondition: 'Approved overtime only', approvalRequired: 'Yes', approvalLevel: 'Supervisor' },
    rows: [['OT-001', 'Regular Day Overtime', 'Regular Workday'], ['OT-002', 'Rest Day Overtime', 'Rest Day'], ['OT-003', 'Special Holiday Overtime', 'Special Non-working Holiday'], ['OT-004', 'Regular Holiday Overtime', 'Regular Holiday']],
  },
  leaveBenefits: {
    title: 'Benefits & Leave Configuration',
    plural: 'leave and benefit policies',
    description: 'Configure leave types, eligibility, accrual, carryover, forfeiture, cash conversion and effective periods without duplicating statutory reference tables.',
    table: [['code', 'Policy Code'], ['name', 'Leave / Benefit Name'], ['type', 'Leave Type'], ['applicability', 'Applies To'], ['effectiveDate', 'Effective Date'], ['status', 'Status']],
    steps: [
      { title: 'Leave or Benefit Details', fields: [
        { key: 'code', label: 'Policy Code', required: true, half: true }, { key: 'name', label: 'Leave / Benefit Name', required: true, half: true },
        { key: 'type', label: 'Leave Type', type: 'select', options: ['Vacation Leave', 'Sick Leave', 'Emergency Leave', 'Maternity Leave', 'Paternity Leave', 'Service Incentive Leave', 'Company Benefit'], required: true, half: true },
        { key: 'applicability', label: 'Applies to', type: 'applicability' },
        { key: 'frequency', label: 'Credit Frequency', type: 'select', options: ['Monthly', 'Annually', 'Per Hire Anniversary', 'One-time'], required: true, half: true },
        { key: 'effectiveDate', label: 'Effective From', type: 'date', required: true, half: true }, { key: 'effectiveTo', label: 'Effective To', type: 'date', half: true },
        { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
      ] },
      { title: 'Accrual and Conversion', fields: [
        { key: 'accrualRate', label: 'Accrual / Credit', type: 'number', required: true, half: true }, { key: 'minimumCredits', label: 'Minimum Credits', type: 'number', half: true },
        { key: 'maximumCredits', label: 'Maximum Credits', type: 'number', half: true }, { key: 'carryover', label: 'Carryover', type: 'select', options: ['None', 'Full balance', 'Capped balance'], required: true, half: true },
        { key: 'carryoverCap', label: 'Carryover Cap', type: 'number', half: true }, { key: 'forfeiture', label: 'Forfeiture', type: 'select', options: ['At year end', 'At separation', 'Never'], required: true, half: true },
        { key: 'cashConvertible', label: 'Cash Convertible?', type: 'boolean', half: true }, { key: 'conversionBasis', label: 'Conversion Basis', type: 'select', options: ['Daily Basic Pay', 'Fixed Company Rate', 'Not applicable'], required: true, half: true },
        { key: 'taxTreatment', label: 'Tax Treatment', type: 'select', options: ['Taxable', 'Non-taxable', 'Per statutory reference'], required: true },
      ] },
    ],
    defaults: { type: 'Vacation Leave', frequency: 'Annually', effectiveDate: '2026-01-01', status: 'Active', accrualRate: '15', minimumCredits: '0', maximumCredits: '15', carryover: 'Capped balance', carryoverCap: '5', forfeiture: 'At year end', cashConvertible: 'Yes', conversionBasis: 'Daily Basic Pay', taxTreatment: 'Per statutory reference' },
    rows: [['LV-001', 'Vacation Leave', 'Vacation Leave'], ['LV-002', 'Sick Leave', 'Sick Leave'], ['LV-003', 'Emergency Leave', 'Emergency Leave'], ['LV-004', 'Service Incentive Leave', 'Service Incentive Leave']],
  },
  payrollControls: {
    title: 'Payroll Control Configuration',
    plural: 'payroll controls',
    description: 'Set up pay frequencies, payroll cutoffs, currency, deduction ordering, payslip, and approval controls.',
    table: [['code', 'Control Code'], ['name', 'Control Name'], ['type', 'Control Type'], ['frequency', 'Frequency'], ['currency', 'Currency'], ['status', 'Status']],
    steps: [{ title: 'Payroll Control Details', fields: [
      { key: 'code', label: 'Control Code', required: true, half: true }, { key: 'name', label: 'Control Name', required: true, half: true },
      { key: 'type', label: 'Control Type', type: 'select', options: ['Payroll Calendar', 'Deduction Hierarchy', 'Payslip Rule', 'Approval Hierarchy', 'Multi-Currency', 'Provident / Pension Fund'], required: true },
      { key: 'frequency', label: 'Pay Frequency', type: 'select', options: ['Weekly', 'Semi-monthly', 'Monthly'], required: true, half: true },
      { key: 'cutoff', label: 'Cutoff Schedule', type: 'select', options: ['1st–15th / 16th–End', 'Calendar Month', 'Custom'], required: true, half: true },
      { key: 'currency', label: 'Payroll Currency', type: 'select', options: ['PHP', 'USD', 'SGD'], required: true, half: true },
      { key: 'approvalLevels', label: 'Approval Levels', type: 'number', required: true, half: true }, { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true, half: true },
      { key: 'backdatedApproval', label: 'Backdated payroll needs P&A approval', type: 'boolean', half: true },
      { key: 'ecolaTreatment', label: 'ECOLA Treatment', type: 'select', options: ['Part of Basic Pay', 'Separate earning'], half: true },
      // Company defaults for the rate divisors. An employee's own pay record and assigned shift win over them.
      { key: 'factorDays', label: 'Default work days per year', type: 'number', half: true, visible: draft => draft.type === 'Payroll Calendar' },
      { key: 'workHoursPerDay', label: 'Default work hours per day', type: 'number', half: true, visible: draft => draft.type === 'Payroll Calendar' },
      { key: 'fundType', label: 'Fund Type (funds only)', type: 'select', options: ['Provident Fund', 'Pension Fund'], half: true },
      { key: 'fundBasis', label: 'Fund Basis (funds only)', type: 'select', options: ['Basic Pay', 'Gross Pay'], half: true },
      { key: 'employeeRate', label: 'Employee Share % (funds only)', type: 'number', half: true },
      { key: 'employerRate', label: 'Employer Share % (funds only)', type: 'number', half: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
    ] }],
    defaults: { type: 'Payroll Calendar', frequency: 'Semi-monthly', cutoff: '1st–15th / 16th–End', currency: 'PHP', approvalLevels: '2', effectiveDate: '2026-01-01', backdatedApproval: 'Yes', ecolaTreatment: 'Part of Basic Pay', factorDays: '261', workHoursPerDay: '8', status: 'Active' },
    rows: [['PAY-001', 'Semi-monthly Payroll Calendar', 'Payroll Calendar'], ['DED-H01', 'Statutory Before Company Deductions', 'Deduction Hierarchy'], ['PSL-001', 'Standard Payslip', 'Payslip Rule'], ['APR-001', 'Payroll Two-Level Approval', 'Approval Hierarchy'],
      ['PF-001', 'Employee Provident Fund', 'Provident / Pension Fund', { fundType: 'Provident Fund', fundBasis: 'Basic Pay', employeeRate: '5', employerRate: '5' }],
      ['PEN-001', 'Company Pension Plan', 'Provident / Pension Fund', { fundType: 'Pension Fund', fundBasis: 'Basic Pay', employeeRate: '0', employerRate: '8' }]],
  },
};

/**
 * The numeric fields on a configuration a formula variable may be bound to.
 *
 * Only numbers are offered: `{{allowance_unit_rate}}` can take the allowance's
 * Default Amount, but binding it to a Taxability dropdown would produce a
 * formula that cannot be evaluated, and offering it would invite exactly that.
 */
export function bindableConfigFields(def) {
  return [...new Map(def.steps
    .flatMap(step => step.fields)
    .filter(field => field.type === 'number')
    .map(field => [field.key, { key: field.key, label: field.label }])).values()];
}

/**
 * The Computation Binding step every module in `BINDABLE_MODULES` carries.
 *
 * It is appended here rather than typed into each definition because the step
 * is identical for all of them, and because a module becoming bindable should
 * be one entry in `BINDABLE_MODULES` rather than an edit in two files. The step
 * always comes last: a variable can only be bound once the fields it might draw
 * on have been filled in.
 */
function withComputationBinding(moduleKey, def) {
  if (!isBindableModule(moduleKey)) return def;
  const definition = BINDABLE_MODULES[moduleKey];
  return {
    ...def,
    bindable: true,
    steps: [...def.steps, {
      title: 'Computation Binding',
      fields: [
        {
          key: 'computationCode',
          label: 'Basis of Computation',
          type: 'computation',
          moduleKey,
          hint: `The published Computational Basis formula that produces ${definition.produces}. Leave it unbound to keep the built-in payroll treatment.`,
        },
        { key: 'computationBindings', label: 'Variable Binding', type: 'bindings', moduleKey },
      ],
    }],
  };
}

const moduleDefinitions = Object.fromEntries(
  Object.entries(baseModuleDefinitions).map(([key, def]) => [key, withComputationBinding(key, def)]));

/**
 * Configuration fields that decide *how* payroll computes rather than a value
 * it computes with — an item's type, its basis, its tax treatment, the
 * conditions it applies under, its place in the deduction order.
 *
 * Under the Controlled Hybrid approach those belong to P&A. A client keeps
 * every amount, rate, threshold, cap, frequency, effective date, payroll period
 * and applicability. The split is a proposal to confirm with P&A, which is why
 * it lives in this one list rather than in each screen.
 */
export const PA_OWNED_CONFIGURATION_FIELDS = Object.freeze({
  earnings: ['type', 'cappedEarning', 'adjustIfAbsent', 'adjustmentEarning', 'autoCompute', 'computationBasis', 'variableAllowance', 'unit', 'negativeComputation', 'taxability', 'classification', 'includedInRate', 'eligibleForReclassification', 'reclassDirection'],
  bonuses: ['type', 'thresholdSplitting'],
  deductions: ['type', 'basis', 'partOfNetPay', 'tax', 'takeHomeTreatment', 'hierarchyPriority'],
  loans: ['type', 'balanceHandling', 'hierarchyPriority'],
  basicPay: ['type', 'mwe', 'ecola', 'region'],
  allowances: ['type', 'timekeeping', 'taxability'],
  governmentLoans: ['type', 'priority', 'balanceHandling'],
  leaveBenefits: ['type', 'carryover', 'forfeiture', 'cashConvertible', 'conversionBasis', 'taxTreatment'],
  overtime: ['type', 'attendanceCondition'],
});

/** Which formula computes a pay item, and where its variables come from, is P&A's in every bindable module. */
const BINDING_FIELD_KEYS = ['computationCode', 'computationBindings'];

export function isPaOwnedField(moduleKey, fieldKey) {
  return BINDING_FIELD_KEYS.includes(fieldKey) || (PA_OWNED_CONFIGURATION_FIELDS[moduleKey] || []).includes(fieldKey);
}

/**
 * What an edit changed, field by field, in the form's own words — the before
 * and after an audit reviewer reads.
 */
function describeConfigurationChanges(def, before = {}, after = {}) {
  const fields = [...new Map(def.steps.flatMap(step => step.fields).map(field => [field.key, field])).values()];
  const shown = (field, record) => {
    if (field.type === 'applicability') return describeScope(record.applicability);
    if (field.type === 'bindings') {
      return Object.entries(record.computationBindings || {})
        .map(([token, binding]) => `${token} = ${binding.kind === 'fixed' ? formatParameterValue(token, numericFromText(binding.value))
          : binding.kind === 'config' ? `field ${binding.field || '—'}`
            : binding.kind === 'reference' ? `${binding.referenceCode || '—'} · ${binding.entryKey || '—'}` : 'payroll'}`)
        .sort()
        .join('; ');
    }
    return String(record[field.key] ?? '');
  };
  return fields
    .map(field => ({ field: field.label, from: shown(field, before), to: shown(field, after) }))
    .filter(change => change.from !== change.to);
}

/**
 * A fixed formula value changed on an existing pay item keeps the value it
 * replaced: the new one applies from the change's effective date, and a
 * payroll paid before that date keeps computing with the old one.
 */
function withDatedValues(before = {}, after = {}, effectiveDate = '') {
  if (!after || typeof after !== 'object') return after;
  return Object.fromEntries(Object.entries(after).map(([token, binding]) => {
    const previous = before?.[token];
    const changed = previous?.kind === 'fixed' && binding?.kind === 'fixed' && String(previous.value ?? '') !== String(binding.value ?? '');
    return [token, changed ? withFixedValueChange(previous, { value: binding.value, effectiveDate }) : binding];
  }));
}

/** Today's date from local calendar parts — `toISOString` would give yesterday east of Greenwich. */
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const serviceTabs = Object.freeze({
  HRM: [
    { key: 'leaveBenefits', short: 'Benefits & Leave', detail: 'Eligibility, accrual, carryover, forfeiture and cash conversion' },
  ],
  Timekeeping: [
    { key: 'timeAttendance', short: 'Time & Attendance', detail: 'Work hours, breaks, core hours, shifts, flexible time and rounding' },
    { key: 'overtime', short: 'Overtime', detail: 'Day-type rates, attendance conditions, approvals and effective periods' },
  ],
  Payroll: [
    { key: 'computations', short: 'Computational Basis', detail: 'Standard formulas, client assignments, test calculations and reference tables' },
    { key: 'basicPay', short: 'Basic Pay & Pay Rates', detail: 'Pay types, factor days, MWE, ECOLA and effective-dated rates' },
    { key: 'earnings', short: 'Earnings', detail: 'Earning types, taxability, computation and GL setup' },
    { key: 'allowances', short: 'Variable Allowances', detail: 'Allowance basis, derived rates and timekeeping integration' },
    { key: 'deductions', short: 'Deductions', detail: 'Deduction basis, recurring schedules and GL setup' },
    { key: 'bonuses', short: 'Bonuses', detail: 'Bonus schedules, non-taxable thresholds and GL setup' },
    { key: 'loans', short: 'Company Loans', detail: 'Principal, interest, terms, amortization and balances' },
    { key: 'governmentLoans', short: 'Government Loans', detail: 'SSS and HDMF loan references, collection schedules and priority' },
    { key: 'payrollControls', short: 'Payroll Controls', detail: 'Calendars, currencies, deduction order, approvals and payslips' },
  ],
});

export function initialRows(def) {
  return def.rows.map((row, index) => ({
    ...def.defaults,
    ...(row[3] || {}),
    id: index + 1,
    code: row[0], name: row[1], type: row[2],
    // A seeded configuration covers everybody until somebody narrows it; the
    // scope is enforced now, so seeding a restriction nobody asked for would
    // stop paying people on the first run after an upgrade.
    applicability: seedScope(),
    dateCreated: `0${(index % 8) + 1}/01/2026`,
  }));
}

export const serviceStorageKey = (moduleKey, companyId) => `atlas-service-${moduleKey}:${companyId || 'default'}`;

/**
 * One stored record, carrying the applicability the engine now enforces.
 *
 * A record saved before the scope was unified holds the old
 * `employeeGroup` / `subEmployeeGroup` / `employeeNames` triple, which nothing
 * ever read. `scopeFromLegacyFields` translates it — permissively, and keeping
 * the original text — and the legacy keys are dropped so the record has one
 * answer to "who does this cover" rather than two that can disagree.
 */
function withApplicability(record, companyId) {
  const { employeeGroup, subEmployeeGroup, employeeNames, ...rest } = record;
  return { ...rest, applicability: scopeFromLegacyFields(record), companyId };
}

export function readServiceConfiguration(moduleKey, companyId = readActiveCompanyId()) {
  const def = moduleDefinitions[moduleKey];
  if (!def) return [];
  try {
    const scoped = JSON.parse(localStorage.getItem(serviceStorageKey(moduleKey, companyId)));
    const legacy = companyId === defaultCompanyRecord.companyId
      ? JSON.parse(localStorage.getItem(`atlas-service-${moduleKey}`))
      : null;
    const saved = Array.isArray(scoped) ? scoped : legacy;
    const seeded = initialRows(def).map(record => ({ ...record, companyId }));
    if (!Array.isArray(saved)) return seeded;
    const savedByCode = new Map(saved.map(record => [record.code, record]));
    const reconciled = seeded.map(record => withApplicability({ ...record, ...(savedByCode.get(record.code) || {}) }, companyId));
    const seedCodes = new Set(seeded.map(record => record.code));
    // Records saved before Payment Mode existed are moved onto the payment mode and frequency pair.
    const scheduled = record => (usesSchedule(def) ? migrateSchedule(record) : record);
    return [...reconciled, ...saved.filter(record => !seedCodes.has(record.code)).map(record => withApplicability({ ...def.defaults, ...record }, companyId))].map(scheduled);
  } catch { return initialRows(def).map(record => ({ ...record, companyId })); }
}

function csvEscape(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

/**
 * One configuration value as an export cell.
 *
 * The variable binding is an object, so it is flattened to the statements a
 * reader of the CSV needs — `{{ot_hours}}=Payroll runtime` — rather than
 * printing `[object Object]` in a column nobody can then reconcile.
 */
function exportValue(field, record, library) {
  if (field.type === 'applicability') return describeScope(record.applicability);
  if (field.type === 'bindings') {
    const bindings = record.computationBindings;
    if (!bindings || typeof bindings !== 'object') return '';
    return Object.entries(bindings).map(([token, binding]) => {
      const detail = binding.kind === 'config' ? binding.field
        : binding.kind === 'reference' ? `${binding.referenceCode || ''}·${binding.entryKey || ''}`
          : binding.kind === 'fixed' ? binding.value : 'engine';
      return `{{${token}}}=${binding.kind}:${detail ?? ''}`;
    }).join(' | ');
  }
  if (field.type === 'computation') return bindingSummary(record, library);
  return String(record[field.key] ?? '');
}

function exportRecords(def, records, format, library = []) {
  const allFields = [...new Map(def.steps.flatMap(step => step.fields).map(field => [field.key, field])).values()];
  if (format === 'pdf') {
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) return false;
    const rows = records.map(record => `<tr>${allFields.map(field => `<td>${exportValue(field, record, library)}</td>`).join('')}</tr>`).join('');
    popup.document.write(`<html><head><title>${def.title}</title><style>body{font-family:Arial;padding:24px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #ddd;padding:7px;text-align:left}h1{color:#54248f}</style></head><body><h1>${def.title}</h1><table><thead><tr>${allFields.map(field => `<th>${field.label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
    return true;
  }
  const csv = [allFields.map(field => csvEscape(field.label)).join(','), ...records.map(record => allFields.map(field => csvEscape(exportValue(field, record, library))).join(','))].join('\n');
  if (format === 'word') {
    const html = `<html><body><h1>${def.title}</h1><pre>${csv}</pre></body></html>`;
    downloadFile(`${def.plural.replaceAll(' ', '-')}.doc`, html, 'application/msword');
  } else {
    downloadFile(`${def.plural.replaceAll(' ', '-')}.csv`, csv, 'text/csv');
  }
  return true;
}

export function ServicesHub({ onOpen, companyName = 'ABC Company Ltd' }) {
  const [tab, setTab] = useState('HRM');
  const items = serviceTabs[tab];
  return (
    <div className="page-content services-hub">
      <div className="page-heading">
        <div><p className="breadcrumb">Company Info / Services Information</p><h1>Services Information</h1><p className="page-description">Configure HRM, Timekeeping, and Payroll services for {companyName}. Each policy remains effective-dated and owned by its module.</p></div>
      </div>
      <div className="tabs service-tabs" role="tablist" aria-label="Service modules">
        {Object.keys(serviceTabs).map(name => <button type="button" role="tab" aria-selected={tab === name} key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}<span>{serviceTabs[name].length}</span></button>)}
      </div>
      <section className="service-grid" aria-label={`${tab} service configuration`}>
        {items.map((item, index) => {
          return (
            <button key={item.key} className="service-card" onClick={() => onOpen(item.key)}>
              <span className="service-number">{String(index + 1).padStart(2, '0')}</span>
              <div><h2>{item.short}</h2><p>{item.detail}</p></div>
              <ArrowRight />
            </button>
          );
        })}
      </section>
    </div>
  );
}

/**
 * The Computational Basis library and reference sources this company binds
 * against, at the versions effective today.
 *
 * A reference source keeps its superseded versions, so the binding screen must
 * pick one. It picks the current effective version, which is the one a payroll
 * run today would resolve; a run with an earlier payout date resolves its own
 * version through the engine, not through this screen.
 */
function useBindingCatalog(companyId) {
  return useMemo(() => {
    const library = readComputationLibrary(companyId);
    const references = readReferences(companyId)
      .filter(item => item.enabled !== false)
      .map(item => {
        const version = resolveReferenceVersion(item) || item;
        return {
          code: item.code,
          name: item.name,
          version: version.version || item.version || '',
          entries: (version.entries || item.entries || []),
        };
      });
    return { library, references };
  }, [companyId]);
}

/** Sample values so the binding preview can run before payroll ever does. */
const sampleRuntime = Object.fromEntries(approvedFields.map(([code, , sample]) => [code, sample]));

/**
 * Who this configuration applies to.
 *
 * The same four-way model the policy engines use, edited here so a company says
 * "this earning covers Rank and File" once, in the language the rest of Atlas
 * already speaks, instead of through the dimension/value/free-text triple this
 * screen used to carry and nothing enforced.
 */
function ApplicabilityField({ value, onChange }) {
  const scope = normalizeScope(value);
  const [query, setQuery] = useState('');
  const update = (key, next) => onChange({ ...scope, [key]: next });
  const covered = coveredEmployees(scope);
  const matches = employeeDirectory.filter(employee =>
    `${employee.code} ${employee.name} ${employee.group} ${employee.department}`.toLowerCase().includes(query.toLowerCase()));
  const toggle = code => update('employees', scope.employees.includes(code)
    ? scope.employees.filter(item => item !== code)
    : [...scope.employees, code]);

  return <div className="service-applicability">
    <div className="service-applicability-row">
      <select value={scope.scope} onChange={event => update('scope', event.target.value)} aria-label="Applies to">
        {SCOPE_KINDS.map(kind => <option key={kind}>{kind}</option>)}
      </select>
      {scope.scope === 'Employee Group' && <select value={scope.group} onChange={event => update('group', event.target.value)} aria-label="Employee group">
        {employeeGroups.map(group => <option key={group}>{group}</option>)}
      </select>}
      {scope.scope === 'Department' && <select value={scope.department} onChange={event => update('department', event.target.value)} aria-label="Department">
        {departments.map(department => <option key={department}>{department}</option>)}
      </select>}
      <span className="applicability-count"><Users weight="duotone" /> {covered.length} covered</span>
    </div>
    {scope.scope === 'Specific Employees' && <div className="service-applicability-picker">
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search the roster..." aria-label="Search employees" />
      <div className="service-applicability-list">
        {matches.map(employee => <label key={employee.code}>
          <input type="checkbox" checked={scope.employees.includes(employee.code)} onChange={() => toggle(employee.code)} />
          <span>{employee.name}<small>{employee.code} · {employee.group} · {employee.department}</small></span>
        </label>)}
        {!matches.length && <p className="binding-empty">No employee matches “{query}”.</p>}
      </div>
    </div>}
    <p className="field-hint">
      {describeScope(scope)}. Payroll applies this configuration only to the employees it covers.
      {scope.migratedFrom && ` Previously recorded as “${scope.migratedFrom}”, which was never enforced — set the scope deliberately.`}
    </p>
  </div>;
}

function ComputationField({ field, value, onChange, catalog }) {
  const options = computationsForModule(field.moduleKey, catalog.library);
  const selected = options.find(item => item.code === value)
    || catalog.library.find(item => item.code === value)
    || null;
  const grouped = [...new Map(options.map(item => [item.category, []])).keys()]
    .map(category => [category, options.filter(item => item.category === category)]);
  return <div className="binding-computation-field">
    <select value={value ?? ''} onChange={event => onChange(event.target.value)}>
      <option value="">Not bound — use the built-in payroll treatment</option>
      {grouped.map(([category, items]) => <optgroup key={category} label={category}>
        {items.map(item => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
      </optgroup>)}
    </select>
    {selected
      ? <div className="binding-formula-preview">
          <code>{selected.expression}</code>
          <small>
            <span className={`computation-source ${computationScope(selected) === 'Client-specific' ? 'client-specific' : 'built-in'}`}>
              <Function weight="duotone" />{computationScope(selected)}
            </span>
            Version {selected.version} · effective {selected.effectiveDate}
            {Boolean(boundDependencies(selected.code, catalog.library).length)
              && ` · builds on ${boundDependencies(selected.code, catalog.library).join(', ')}`}
          </small>
        </div>
      : <p className="field-hint">{field.hint}</p>}
  </div>;
}

/**
 * One variable of the bound formula, and where its value comes from.
 *
 * The Kind column is deliberately the first decision: a reviewer reading a
 * payroll line asks "where did 150 come from", and the answer is the kind
 * before it is the number.
 *
 * A fixed value is typed the way the library and the client read it — 15 %,
 * not 0.15 — and checked against the formula's approved range as it is typed,
 * so P&A sees the same range and the same warning the client does. Save still
 * refuses an out-of-range value; this only moves the warning to where it helps.
 */
function BindingRow({ token, binding, entry, definition = null, rangeProblem = '', configFields, references, onChange }) {
  const field = fieldMap[token];
  const unit = parameterUnit(token);
  const source = references.find(item => item.code === binding.referenceCode);
  const set = patch => onChange({ ...binding, ...patch });
  return <tr className={entry?.problem || rangeProblem ? 'mapping-problem' : ''}>
    <td>
      <code>{`{{${token}}}`}</code>
      <small className="block-caption">{field?.label || 'Unrecognized field'}</small>
    </td>
    <td>
      <select value={binding.kind} onChange={event => set({ kind: event.target.value })} aria-label={`Source for ${token}`}>
        {BINDING_KINDS.map(item => <option
          key={item.kind}
          value={item.kind}
          disabled={item.kind === 'runtime' && !isEngineSupplied(token)}
        >{item.label}</option>)}
      </select>
    </td>
    <td>
      {binding.kind === 'runtime' && <span className="mapping-owner">{field?.owner || 'Payroll runtime'}</span>}
      {binding.kind === 'config' && <select value={binding.field ?? ''} onChange={event => set({ field: event.target.value })} aria-label={`Configuration field for ${token}`}>
        <option value="">Please select</option>
        {configFields.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
      </select>}
      {binding.kind === 'reference' && <div className="binding-reference-pair">
        <select value={binding.referenceCode ?? ''} onChange={event => set({ referenceCode: event.target.value, entryKey: '' })} aria-label={`Reference source for ${token}`}>
          <option value="">Please select</option>
          {references.map(item => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
        </select>
        <select value={binding.entryKey ?? ''} onChange={event => set({ entryKey: event.target.value })} disabled={!source} aria-label={`Reference row for ${token}`}>
          <option value="">Please select</option>
          {(source?.entries || []).map(item => <option key={item.key} value={item.key}>{item.key} — {item.value}</option>)}
        </select>
      </div>}
      {binding.kind === 'fixed' && <span className="parameter-input">
        {unit.prefix && <em>{unit.prefix}</em>}
        <input
          type="number"
          step="any"
          value={toDisplayValue(token, binding.value)}
          onChange={event => set({ value: String(fromDisplayValue(token, event.target.value)) })}
          placeholder="0"
          aria-label={`Fixed value for ${token}`}
        />
        {unit.suffix && <em>{unit.suffix}</em>}
      </span>}
      {rangeProblem && <span className="binding-problem"><Warning weight="bold" /> {rangeProblem}</span>}
    </td>
    <td>
      {definition ? describeParameterRange(token, definition) : '—'}
      {definition && <small className="block-caption">{definition.clientEditable ? 'Client may change within it' : 'P&A only'}</small>}
    </td>
    <td>
      {entry?.problem
        ? <span className="binding-problem"><Warning weight="bold" /> {entry.problem}</span>
        : <span className="binding-resolved">{formatParameterValue(token, entry?.value ?? 0)}<small className="block-caption">{entry?.source}</small></span>}
    </td>
  </tr>;
}

/**
 * The variable binding table.
 *
 * It reconciles itself against whichever formula is bound: switching the
 * computation drops the variables the new one does not use and defaults the
 * ones it adds, so an admin who swaps a formula for a close relative does not
 * re-bind the inputs that did not change.
 */
function BindingField({ field, value, onChange, draft, def, catalog }) {
  const configFields = useMemo(() => bindableConfigFields(def), [def]);
  const code = String(draft.computationCode || '').trim();
  const tokens = useMemo(() => bindableTokens(code, catalog.library), [code, catalog.library]);
  const bindings = useMemo(
    () => normalizeBindings({ ...draft, computationBindings: value }, catalog.library, configFields),
    [draft, value, catalog.library, configFields]);
  const [preview, setPreview] = useState(null);

  // Reconciling in an effect rather than during render keeps the stored value
  // and the rendered table the same object: a binding the admin can see but the
  // record does not hold would be lost on save.
  useEffect(() => {
    const current = value && typeof value === 'object' ? value : {};
    const same = Object.keys(bindings).length === Object.keys(current).length
      && Object.keys(bindings).every(token => current[token] === bindings[token]);
    if (!same) onChange(bindings);
  }, [bindings, value, onChange]);

  const resolution = useMemo(() => evaluateBinding({
    record: { ...draft, computationBindings: bindings },
    library: catalog.library,
    runtime: sampleRuntime,
    references: catalog.references,
    configFields,
  }), [draft, bindings, catalog, configFields]);

  if (!code) return <p className="binding-empty"><LinkBreak weight="duotone" /> Choose a basis of computation above and its variables appear here for binding.</p>;
  if (!tokens.length) return <p className="binding-empty"><Link weight="duotone" /> {code} takes no mapped input — it needs no variable binding.</p>;

  const entryFor = token => resolution?.entries?.find(item => item.token === token);
  // The range the client is held to, checked while P&A types rather than only
  // when Save refuses it. An empty value is already reported by the resolver.
  const parameterDefinitions = catalog.library.find(item => item.code === code.toUpperCase())?.parameters || {};
  const rangeProblemFor = token => {
    const definition = parameterDefinitions[token];
    const binding = bindings[token];
    if (!definition || !binding) return '';
    const raw = binding.kind === 'fixed' ? binding.value : binding.kind === 'config' && binding.field ? draft[binding.field] : undefined;
    if (raw === undefined || raw === null || raw === '') return '';
    return parameterValueProblem(token, definition, numericFromText(raw));
  };
  return <div className="binding-editor">
    <div className="mapping-table-wrap">
      <table className="mapping-table binding-table">
        <thead><tr><th>Variable</th><th>Source</th><th>Bound to</th><th>Allowed range</th><th>Resolved value</th></tr></thead>
        <tbody>
          {tokens.map(token => <BindingRow
            key={token}
            token={token}
            binding={bindings[token]}
            entry={entryFor(token)}
            definition={parameterDefinitions[token] || null}
            rangeProblem={rangeProblemFor(token)}
            configFields={configFields}
            references={catalog.references}
            onChange={next => onChange({ ...bindings, [token]: next })}
          />)}
        </tbody>
      </table>
    </div>
    <div className="binding-preview-row">
      <button type="button" className="button secondary" onClick={() => setPreview(evaluateBinding({
        record: { ...draft, computationBindings: bindings },
        library: catalog.library,
        runtime: sampleRuntime,
        references: catalog.references,
        configFields,
      }))}><Flask /> Preview with sample runtime values</button>
      {preview && (preview.resolved
        ? <div className="test-result passed"><Check weight="bold" /><span><small>{preview.code} resolved</small><strong>₱ {preview.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span></div>
        : <div className="test-result failed"><Warning weight="bold" /><span><small>Binding incomplete</small><strong>{preview.problem}</strong></span></div>)}
    </div>
    <p className="field-hint">A bound formula returns the amount for the payroll period being computed. The recurring frequency decides whether the item falls due — it never rescales a bound amount.</p>
  </div>;
}

/** The client's read-only view of which formula computes this pay item. */
function ComputationSummary({ value, catalog }) {
  const code = String(value || '').trim().toUpperCase();
  const selected = code ? catalog.library.find(item => item.code === code) : null;
  if (!code) return <p className="binding-empty"><LinkBreak weight="duotone" /> Not bound — the built-in payroll treatment applies. P&amp;A sets the formula a pay item uses.</p>;
  if (!selected) return <p className="binding-empty"><LinkBreak weight="duotone" /> {code} is not assigned to this company. Contact P&amp;A.</p>;
  const scope = computationScope(selected);
  return <div className="binding-formula-preview">
    <code>{selected.expression}</code>
    <small>
      <span className={`computation-source ${scope === 'Client-specific' ? 'client-specific' : 'built-in'}`}><Function weight="duotone" />{scope}</span>
      {selected.code} · {selected.name} · version {selected.version} · set by P&amp;A
    </small>
  </div>;
}

/**
 * The client's view of a bound formula: the values they may change, and the
 * rest shown read-only with where each one comes from.
 *
 * Only a variable the formula marks client-editable, and that P&A bound to a
 * fixed value on this pay item, is an input here. A value bound to another
 * field of this pay item is changed on that field, a reference row in
 * Computational Basis › Reference sources, and payroll supplies the rest.
 */
function ParameterValuesField({ value, onChange, draft, def, catalog }) {
  const configFields = useMemo(() => bindableConfigFields(def), [def]);
  const code = String(draft.computationCode || '').trim().toUpperCase();
  const computation = code ? catalog.library.find(item => item.code === code) : null;
  const bindings = useMemo(
    () => normalizeBindings({ ...draft, computationBindings: value }, catalog.library, configFields),
    [draft, value, catalog.library, configFields]);
  if (!code) return <p className="binding-empty"><LinkBreak weight="duotone" /> No formula is bound to this pay item, so there are no formula values to set here.</p>;
  if (!computation) return <p className="binding-empty"><LinkBreak weight="duotone" /> {code} is not assigned to this company. Contact P&amp;A.</p>;
  const tokens = bindableTokens(code, catalog.library);
  if (!tokens.length) return <p className="binding-empty"><Link weight="duotone" /> {code} takes no input, so there is nothing to set.</p>;
  const labelOf = key => configFields.find(field => field.key === key)?.label || key;
  const referenceValue = binding => catalog.references
    .find(item => item.code === binding.referenceCode)?.entries
    .find(entry => String(entry.key) === String(binding.entryKey))?.value;

  return <div className="binding-editor">
    <div className="mapping-table-wrap">
      <table className="mapping-table parameter-table">
        <thead><tr><th>Value</th><th>Allowed range</th><th>Current value</th><th>Where it comes from</th></tr></thead>
        <tbody>
          {tokens.map(token => {
            const field = fieldMap[token];
            const binding = bindings[token] || {};
            const definition = computation.parameters?.[token] || null;
            const editable = Boolean(definition?.clientEditable) && binding.kind === 'fixed';
            const problem = editable ? parameterValueProblem(token, definition, numericFromText(binding.value)) : '';
            const unit = parameterUnit(token);
            const shown = binding.kind === 'fixed' ? formatParameterValue(token, numericFromText(binding.value))
              : binding.kind === 'config' ? formatParameterValue(token, numericFromText(draft[binding.field]))
                : binding.kind === 'reference' ? (referenceValue(binding) ?? '—')
                  : 'Supplied at payroll';
            const source = binding.kind === 'runtime' ? `Payroll · ${field?.owner || 'runtime'}`
              : binding.kind === 'config' ? `This pay item › ${labelOf(binding.field)}${definition?.clientEditable ? ' — change it on that field' : ''}`
                : binding.kind === 'reference' ? `${binding.referenceCode || '—'} · ${binding.entryKey || '—'} — maintained in Computational Basis › Reference sources`
                  : editable ? 'This pay item — you may change it within the range' : 'Set by P&A';
            return <tr key={token} className={problem ? 'mapping-problem' : ''}>
              <td><code>{`{{${token}}}`}</code><small className="block-caption">{field?.label || token}</small></td>
              <td>{definition ? describeParameterRange(token, definition) : '—'}</td>
              <td>{editable
                ? <>
                    <span className="parameter-input">
                      {unit.prefix && <em>{unit.prefix}</em>}
                      <input type="number" step="any" value={toDisplayValue(token, binding.value)} onChange={event => onChange({ ...bindings, [token]: { ...binding, value: String(fromDisplayValue(token, event.target.value)) } })} aria-label={`Value for ${field?.label || token}`} />
                      {unit.suffix && <em>{unit.suffix}</em>}
                    </span>
                    {problem && <span className="binding-problem"><Warning weight="bold" /> {problem}</span>}
                  </>
                : <span className="parameter-chip locked"><Lock weight="duotone" /> {shown}</span>}</td>
              <td>{source}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <p className="field-hint">You can change a value that shows a range, inside that range. The formula itself, and where each value comes from, are set by P&amp;A.</p>
  </div>;
}

/**
 * Frequency as a checklist of the periods the payment mode offers. 'Every
 * Payroll' is exclusive, and a mode with one period a cycle shows that period
 * instead of a checklist.
 */
function FrequencyField({ paymentMode, value, onChange }) {
  const options = frequencyOptions(paymentMode);
  const picked = normalizeFrequency(paymentMode, value).split(', ');
  if (options.length === 1) return <div className="frequency-single">{options[0]}</div>;
  const toggle = option => {
    if (option === 'Every Payroll') { onChange('Every Payroll'); return; }
    const named = picked.filter(item => item !== 'Every Payroll' && item !== option);
    const next = picked.includes(option) ? named : [...named, option];
    onChange(next.length ? options.filter(item => next.includes(item)).join(', ') : 'Every Payroll');
  };
  return <div className="frequency-checklist" role="group" aria-label="Frequency">
    {options.map(option => <label key={option}><input type="checkbox" checked={picked.includes(option)} onChange={() => toggle(option)} /> {option}</label>)}
  </div>;
}

function MultiSelectField({ options, value, onChange }) {
  const picked = String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  if (!options.length) return <div className="frequency-single">Nothing to select yet</div>;
  const toggle = option => {
    const next = picked.includes(option) ? picked.filter(item => item !== option) : [...picked, option];
    onChange(options.filter(item => next.includes(item)).join(', '));
  };
  return <div className="frequency-checklist" role="group">
    {options.map(option => <label key={option}><input type="checkbox" checked={picked.includes(option)} onChange={() => toggle(option)} /> {option}</label>)}
  </div>;
}

function Field({ field, value, onChange, draft, def, catalog, companyId }) {
  const common = { value: value ?? '', onChange: event => onChange(event.target.value), required: field.required };
  // Options may depend on the rest of the record; a stored value stays selectable.
  const listed = typeof field.options === 'function' ? field.options(draft, { companyId }) : (field.options || []);
  const options = field.type === 'select' && value && !listed.includes(value) ? [...listed, value] : listed;
  if (field.type === 'frequency') return <FrequencyField paymentMode={draft.paymentMode} value={value} onChange={onChange} />;
  if (field.type === 'multiselect') return <MultiSelectField options={options} value={value} onChange={onChange} />;
  if (field.type === 'applicability') return <ApplicabilityField value={value} onChange={onChange} />;
  if (field.type === 'readonly') return <div className="locked-value">{field.show(draft)}</div>;
  if (field.type === 'computation') return <ComputationField field={field} value={value} onChange={onChange} catalog={catalog} />;
  if (field.type === 'bindings') return <BindingField field={field} value={value} onChange={onChange} draft={draft} def={def} catalog={catalog} />;
  if (field.type === 'select') return <select {...common}><option value="">Please select</option>{options.map(option => <option key={option}>{option}</option>)}</select>;
  if (field.type === 'boolean') return (
    <div className="radio-group">
      {['Yes', 'No'].map(option => <label key={option}><input type="radio" name={field.key} value={option} checked={(value ?? 'No') === option} onChange={() => onChange(option)} /> {option}</label>)}
    </div>
  );
  if (field.type === 'date') return <DateInput value={value ?? ''} onChange={onChange} />;
  return <input {...common} type={field.type ?? 'text'} min={field.type === 'number' ? '0' : undefined} placeholder={field.placeholder ?? (field.type === 'number' ? '0.00' : `Input ${field.label.toLowerCase()}`)} />;
}

/**
 * `clientView` is a Client Admin in a formula-bound module: the fields P&A
 * owns and the formula binding are shown read-only, and the Computation
 * Binding step becomes the approved values the client may change.
 */
function ConfigurationForm({ def, moduleKey, record, companyId, clientView = false, onClose, onSave }) {
  const [draft, setDraft] = useState(() => {
    const initial = { ...def.defaults, ...record };
    return usesSchedule(def) ? migrateSchedule(initial) : initial;
  });
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [changeEffective, setChangeEffective] = useState(localToday);
  const catalog = useBindingCatalog(companyId);
  const current = def.steps[step];
  const editing = Boolean(record?.id);
  const lastStep = step === def.steps.length - 1;
  const locked = key => clientView && isPaOwnedField(moduleKey, key);
  const pendingChanges = editing ? describeConfigurationChanges(def, record, draft) : [];
  // Editing anything retires the refusal that was shown for the previous draft:
  // an error still on screen after the thing it complained about was fixed
  // reads as a second, unexplained problem.
  const update = (key, value) => {
    setError('');
    setDraft(previous => {
      const next = { ...previous, [key]: value };
      if (key === 'paymentMode') next.frequency = normalizeFrequency(value, previous.frequency);
      return { ...next, ...(def.derive?.(next, key) || {}) };
    });
  };
  const next = event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (step < def.steps.length - 1) { setStep(step + 1); return; }
    // A half-bound formula is refused here rather than at payroll: an unbound
    // variable resolves to nothing, and a deduction that silently computes zero
    // is worse than one that never saved.
    const configFields = bindableConfigFields(def);
    const problems = [
      ...bindingProblems({ record: draft, library: catalog.library, references: catalog.references, configFields }),
      // A value outside the range P&A approved is refused for every role.
      ...parameterValueProblems({ record: draft, library: catalog.library, configFields }),
      ...(def.validate?.(draft, { companyId }) || []),
    ];
    if (problems.length) { setError(problems[0]); setStep(def.steps.length - 1); return; }
    if (editing && pendingChanges.length && !changeReason.trim()) {
      setError('Give a reason for this change. It is kept, with your name and the values before and after, in the audit trail.');
      return;
    }
    setError('');
    const saved = editing
      ? { ...draft, computationBindings: withDatedValues(record.computationBindings, draft.computationBindings, changeEffective) }
      : draft;
    onSave(saved, { changes: pendingChanges, reason: changeReason.trim(), effectiveDate: changeEffective });
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal config-modal" role="dialog" aria-modal="true" aria-label={`${record?.id ? 'Edit' : 'Add'} ${def.title}`}>
        <header><h2>{record?.id ? 'Edit' : 'Add'} {def.title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
        <form onSubmit={next}>
          {def.steps.length > 1 && <div className="stepper">{def.steps.map((item, index) => <div key={item.title} className={index <= step ? 'active' : ''}><span>{index < step ? <Check weight="bold" /> : index + 1}</span><i /></div>)}</div>}
          <div className="config-form-body">
            {clientView && step === 0 && <div className="linked-reference-note governed-notice"><Lock weight="duotone" /><span>Fields marked “Set by P&amp;A” and the formula this pay item uses are maintained by P&amp;A. You can change amounts, rates, thresholds, caps, frequency, effective dates, payroll period and who the item applies to — every change is recorded with your name.</span></div>}
            <h3>{current.title}</h3>
            <div className="config-form-grid">
              {current.fields.filter(field => !field.visible || field.visible(draft)).map(field => {
                const fieldLocked = locked(field.key);
                const bindingField = field.type === 'computation' || field.type === 'bindings';
                return <label key={field.key} className={field.half ? 'half' : field.type === 'bindings' ? 'full' : ''}>{field.label}{field.required && !fieldLocked && <span className="required">*</span>}{fieldLocked && !bindingField && <span className="pa-owned-tag"><Lock weight="bold" /> Set by P&amp;A</span>}
                  {clientView && field.type === 'computation'
                    ? <ComputationSummary value={draft.computationCode} catalog={catalog} />
                    : clientView && field.type === 'bindings'
                      ? <ParameterValuesField value={draft.computationBindings} onChange={value => update('computationBindings', value)} draft={draft} def={def} catalog={catalog} />
                      : fieldLocked
                        ? <div className="locked-value">{field.type === 'applicability' ? describeScope(draft.applicability) : String(draft[field.key] ?? '') || '—'}</div>
                        : <Field field={field} value={draft[field.key]} onChange={value => update(field.key, value)} draft={draft} def={def} catalog={catalog} companyId={companyId} />}
                </label>;
              })}
            </div>
            {lastStep && editing && <div className="change-details">
              <label>Change effective from<DateInput value={changeEffective} onChange={value => setChangeEffective(value)} /></label>
              <label>Reason for change{pendingChanges.length > 0 && <span className="required">*</span>}<input value={changeReason} onChange={event => { setError(''); setChangeReason(event.target.value); }} placeholder="Rate revised under the 2026 company policy" /></label>
              <p className="field-hint">{pendingChanges.length
                ? `${pendingChanges.length} ${pendingChanges.length === 1 ? 'change' : 'changes'} will be recorded with your name, the value before and after, and this effective date. A changed formula value applies to payrolls paid from this date; earlier payrolls keep the value they used.`
                : 'Nothing has changed yet.'}</p>
            </div>}
            {error && <div className="basis-error">{error}</div>}
          </div>
          <footer className="modal-actions sticky-actions">
            <button type="button" className="button secondary" onClick={step === 0 ? onClose : () => setStep(step - 1)}>{step === 0 ? 'Cancel' : 'Back'}</button>
            <button className="button primary">{step < def.steps.length - 1 ? 'Next' : record?.id ? 'Save' : 'Add'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

/**
 * The bound formula as a reviewer reads it: the expression, then every variable
 * with the value it resolves to today and the source that produced it.
 */
function BindingDetail({ def, record, catalog }) {
  const configFields = bindableConfigFields(def);
  const resolution = evaluateBinding({
    record,
    library: catalog.library,
    runtime: sampleRuntime,
    references: catalog.references,
    configFields,
  });
  if (!resolution) return <p className="binding-empty"><LinkBreak weight="duotone" /> Not bound to a computation — the built-in payroll treatment applies.</p>;
  return <>
    <div className="binding-formula-preview">
      <code>{resolution.computation?.expression || '—'}</code>
      <small>{resolution.code} · {resolution.computation?.name} · version {resolution.computation?.version}</small>
    </div>
    <div className="mapping-table-wrap">
      <table className="mapping-table binding-table">
        <thead><tr><th>Variable</th><th>Source</th><th>Bound to</th><th>Value</th></tr></thead>
        <tbody>
          {resolution.entries.map(entry => <tr key={entry.token} className={entry.problem ? 'mapping-problem' : ''}>
            <td><code>{`{{${entry.token}}}`}</code><small className="block-caption">{entry.label}</small></td>
            <td><span className="mapping-owner">{entry.kindLabel}</span></td>
            <td>{entry.source}</td>
            <td>{entry.problem ? <span className="binding-problem"><Warning weight="bold" /> {entry.problem}</span> : Number(entry.value).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
          </tr>)}
          {!resolution.entries.length && <tr className="mapping-empty"><td colSpan={4}>This formula takes no mapped input.</td></tr>}
        </tbody>
      </table>
    </div>
  </>;
}

function ViewDrawer({ def, record, companyId, onClose, onEdit }) {
  const catalog = useBindingCatalog(companyId);
  return (
    <div className="drawer-backdrop view-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="record-drawer">
        <header><div><p>View configuration</p><h2>{record.name}</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>
        <div className="record-drawer-body">
          {def.steps.map(step => <section key={step.title}><h3>{step.title}</h3>
            {step.fields.some(field => field.type === 'bindings')
              ? <BindingDetail def={def} record={record} catalog={catalog} />
              : <div className="detail-grid">{step.fields.map(field => <div key={field.key}><strong>{field.label}</strong><span>{field.type === 'applicability' ? describeScope(record.applicability) : record[field.key] || '—'}</span></div>)}</div>}
          </section>)}
          <section><h3>Change history</h3>
            {record.changeLog?.length
              ? <div className="change-log">{record.changeLog.map(entry => <article key={entry.at}>
                  <strong>{entry.reason || 'Change recorded'}</strong>
                  <small>{new Date(entry.at).toLocaleString()} · {entry.by}{entry.effectiveDate ? ` · effective ${entry.effectiveDate}` : ''}</small>
                  <ul>{(entry.changes || []).map(change => <li key={change.field}><b>{change.field}</b> {change.from || '—'} → {change.to || '—'}</li>)}</ul>
                </article>)}</div>
              : <p className="field-hint">No change has been recorded on this pay item yet.</p>}
          </section>
        </div>
        <footer><button className="button secondary" onClick={onClose}>Close</button><button className="button primary" onClick={() => onEdit(record)}><PencilSimple /> Edit</button></footer>
      </aside>
    </div>
  );
}

function FilterDrawer({ def, filters, setFilters, onClose }) {
  const filterFields = [...new Map(def.steps.flatMap(step => step.fields).filter(field => ['select', 'text'].includes(field.type ?? 'text')).map(field => [field.key, field])).values()].slice(0, 7);
  return (
    <div className="drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="filter-drawer">
        <header><h2>Filter {def.plural}</h2><button className="icon-button" onClick={onClose}><X /></button></header>
        <div className="drawer-body">
          {filterFields.map(field => <label key={field.key}>{field.label}<Field field={{ ...field, required: false }} value={filters[field.key]} onChange={value => setFilters(previous => ({ ...previous, [field.key]: value }))} /></label>)}
        </div>
        <footer><button className="button secondary" onClick={() => setFilters({})}>Reset</button><button className="button primary" onClick={onClose}>Apply Filter</button></footer>
      </aside>
    </div>
  );
}

function ExportMenu({ onExport }) {
  const [open, setOpen] = useState(false);
  return <div className="menu-anchor"><button className="button secondary" onClick={() => setOpen(!open)}><DownloadSimple /> Export <CaretDown /></button>{open && <div className="export-menu">
    <button onClick={() => { onExport('excel'); setOpen(false); }}><FileCsv /> Excel / CSV</button>
    <button onClick={() => { onExport('pdf'); setOpen(false); }}><FilePdf /> PDF / Print</button>
    <button onClick={() => { onExport('word'); setOpen(false); }}><FileText /> Word</button>
  </div>}</div>;
}

function DeleteDialog({ def, record, onClose, onDelete }) {
  return <div className="modal-backdrop" role="presentation"><section className="modal delete-modal" role="dialog" aria-modal="true"><header><h2>Delete {def.title}</h2><button className="icon-button" onClick={onClose}><X /></button></header><div className="modal-body"><div className="delete-copy"><div className="delete-icon"><Trash weight="duotone" /></div><div><h3>Delete “{record.name}”?</h3><p>This removes the configuration from the working list. This action cannot be undone.</p></div></div><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" onClick={onDelete}>Delete</button></div></div></section></div>;
}

export function ServiceConfiguration({ moduleKey, companyId = readActiveCompanyId(), onBack, notify, backLabel = 'Services Information', breadcrumb = 'Company Information / Services Information / Payroll' }) {
  const def = moduleDefinitions[moduleKey];
  const { isPaAdmin, actor } = useRole();
  // Under the Controlled Hybrid approach a pay item's formula and logic are
  // P&A's and the client maintains its values. Adding or deleting a pay item
  // changes what payroll computes, so in a formula-bound module that is P&A's too.
  const clientLocked = Boolean(def?.bindable) && !isPaAdmin;
  const storageKey = serviceStorageKey(moduleKey, companyId);
  const [records, setRecords] = useState(() => readServiceConfiguration(moduleKey, companyId));
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [page, setPage] = useState(1);
  const uploadRef = useRef(null);
  const pageSize = 8;
  const catalog = useBindingCatalog(companyId);
  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(records)), [records, storageKey]);

  const filtered = useMemo(() => records.filter(record => {
    const queryMatch = Object.values(record).join(' ').toLowerCase().includes(query.trim().toLowerCase());
    const filterMatch = Object.entries(filters).every(([key, value]) => !value || String(record[key] ?? '').toLowerCase().includes(String(value).toLowerCase()));
    return queryMatch && filterMatch;
  }), [records, query, filters]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);

  /**
   * One audit trail for a configuration change: the company's Computational
   * Basis change history (before and after, named user) and the Audit Log.
   */
  const recordChange = ({ action, summary, record, changes = [], reason = '', effectiveDate = '' }) => {
    writeHistory(companyId, [historyEntry({ item: `${record.code} · ${record.name}`, code: record.computationCode || '', type: def.title, action: summary, version: '—', user: actor, changes }), ...readHistory(companyId)]);
    appendAuditEvent({ companyId, actor, action, entityType: def.title, entityId: record.code, summary: `${record.code} · ${summary}`, changes, reason, effectiveDate });
  };

  const save = (draft, audit = {}) => {
    const duplicate = records.some(record => record.id !== draft.id && record.code.toLowerCase() === draft.code.toLowerCase());
    if (duplicate) { notify({ type: 'error', message: `${draft.code} already exists. Use a unique code.` }); return; }
    // Deductions and loans share one hierarchy, so a rank can be held by only one of them.
    if (['deductions', 'loans'].includes(moduleKey) && draft.hierarchyPriority) {
      const others = [...records.filter(record => record.id !== draft.id), ...readServiceConfiguration(moduleKey === 'deductions' ? 'loans' : 'deductions', companyId)];
      const holder = others.find(record => String(record.hierarchyPriority) === String(draft.hierarchyPriority));
      if (holder) { notify({ type: 'error', message: `Hierarchy Rank ${draft.hierarchyPriority} is already held by ${holder.code} · ${holder.name}. Two items can’t share a rank.` }); return; }
    }
    if (['timeAttendance', 'overtime', 'leaveBenefits'].includes(moduleKey) && draft.status === 'Active') {
      const asDate = value => value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
      const start = asDate(draft.effectiveDate);
      const end = asDate(draft.effectiveTo);
      // Two policies of the same type clash only where they cover the same
      // person, so overlap is tested against the employees each one actually
      // reaches rather than against the scope fields being spelled alike.
      const draftCovers = new Set(coveredEmployees(draft.applicability).map(employee => employee.code));
      const overlap = records.some(record => {
        if (record.id === draft.id || record.status !== 'Active' || record.type !== draft.type) return false;
        if (!coveredEmployees(record.applicability).some(employee => draftCovers.has(employee.code))) return false;
        const existingStart = asDate(record.effectiveDate);
        const existingEnd = asDate(record.effectiveTo);
        return start <= existingEnd && existingStart <= end;
      });
      if (overlap) { notify({ type: 'error', message: 'This active policy overlaps an existing effective period for employees it already covers.' }); return; }
    }
    if (draft.id) {
      const entry = audit.changes?.length
        ? { at: new Date().toISOString(), by: actor, reason: audit.reason, effectiveDate: audit.effectiveDate, changes: audit.changes }
        : null;
      const stored = { ...draft, companyId, ...(entry ? { changeLog: [entry, ...(draft.changeLog || [])] } : {}) };
      setRecords(previous => previous.map(record => record.id === draft.id ? stored : record));
      if (entry) recordChange({ action: 'ConfigurationUpdated', summary: `${audit.reason} · effective ${audit.effectiveDate}`, record: stored, changes: audit.changes, reason: audit.reason, effectiveDate: audit.effectiveDate });
    } else {
      if (clientLocked) { notify({ type: 'error', message: `New ${def.plural} are set up by P&A.` }); return; }
      const created = { ...draft, companyId, id: Math.max(0, ...records.map(record => record.id)) + 1, dateCreated: new Date().toLocaleDateString('en-US') };
      setRecords(previous => [created, ...previous]);
      recordChange({ action: 'ConfigurationAdded', summary: `${def.title} added`, record: created });
    }
    setEditing(null);
    notify({ type: 'success', message: `${def.title} ${draft.id ? 'updated' : 'added'} successfully.` });
  };

  const importCsv = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { rejectUpload(file.name, ['The upload needs a header row and at least one data row.'], notify); return; }
      const headers = lines[0].split(',').map(value => value.replaceAll('"', '').trim().toLowerCase());
      const expected = Object.fromEntries(def.steps.flatMap(step => step.fields).map(field => [field.label.toLowerCase(), field.key]));
      const added = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(value => value.replace(/^"|"$/g, '').trim());
        const next = { ...def.defaults, id: Date.now() + index, dateCreated: new Date().toLocaleDateString('en-US') };
        headers.forEach((header, headerIndex) => { if (expected[header]) next[expected[header]] = values[headerIndex]; });
        return next;
      });
      const errors = added.flatMap((row, index) => [
        !row.code && { row: index + 2, field: 'Code', reason: 'Code is required.' },
        !row.name && { row: index + 2, field: 'Name', reason: 'Name is required.' },
        row.code && records.some(existing => existing.code === row.code) && { row: index + 2, field: 'Code', value: row.code, reason: 'This code already exists.' },
      ].filter(Boolean));
      if (errors.length) { rejectUpload(file.name, errors, notify); return; }
      setRecords(previous => [...added, ...previous]);
      notify({ type: 'success', message: `${added.length} ${def.plural} imported from ${file.name}.` });
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="page-content service-config-page">
      <button className="inline-back" onClick={onBack}><ArrowLeft /> {backLabel}</button>
      <div className="page-heading"><div><p className="breadcrumb">{breadcrumb}</p><h1>{def.title}</h1><p className="page-description">{def.description}</p></div></div>
      {clientLocked && <div className="library-notice governed-notice"><Lock weight="duotone" /><span><strong>Pay items and the formulas they use are set up by P&amp;A.</strong> You can update the approved values — amounts, rates, thresholds, caps, frequency, effective dates, payroll period and who each item applies to. A new pay item, or a change in how one computes, is requested from P&amp;A.</span></div>}
      <div className="config-toolbar">
        <div className="search-box"><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder={`Search ${def.plural}...`} /><MagnifyingGlass /></div>
        <button className={`filter-button ${Object.values(filters).some(Boolean) ? 'applied' : ''}`} onClick={() => setFilterOpen(true)}><SlidersHorizontal /> Filter</button>
        <div className="toolbar-spacer" />
        {!clientLocked && <>
          <button className="button primary" onClick={() => setEditing({})}><Plus /> Add</button>
          <button className="button secondary" onClick={() => uploadRef.current?.click()}><UploadSimple /> Upload</button>
          <input ref={uploadRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={importCsv} />
        </>}
        <ExportMenu onExport={format => { if (exportRecords(def, filtered, format, catalog.library)) notify({ type: 'success', message: `${def.title} export prepared.` }); }} />
      </div>
      <div className="table-card config-table-card">
        <table className="config-table">
          <thead><tr>{def.table.map(([, label]) => <th key={label}>{label}</th>)}{def.bindable && <th>Basis of Computation</th>}<th>Action</th></tr></thead>
          <tbody>{visible.length ? visible.map(record => <tr key={record.id}>{def.table.map(([key]) => <td key={key}>{key === 'status' ? <span className={`status-pill ${String(record[key]).toLowerCase()}`}>{record[key]}</span> : key === 'applicability' ? <span className="scope-chip"><Users weight="duotone" />{describeScope(record.applicability)}</span> : ['principal', 'amortization', 'threshold'].includes(key) ? `₱ ${Number(record[key] || 0).toLocaleString()}` : record[key] || '—'}</td>)}
            {def.bindable && <td>{record.computationCode
              ? <span className="binding-chip" title={bindingSummary(record, catalog.library)}><Function weight="duotone" />{record.computationCode}</span>
              : <span className="binding-chip none"><LinkBreak />Not bound</span>}</td>}
            <td><div className="row-actions always"><button onClick={() => setViewing(record)} aria-label="View"><Eye /></button><button onClick={() => setEditing(record)} aria-label="Edit"><PencilSimple /></button>{!clientLocked && <button onClick={() => setDeleting(record)} aria-label="Delete"><Trash /></button>}</div></td></tr>) : <tr><td colSpan={def.table.length + (def.bindable ? 2 : 1)}><div className="empty-state"><MagnifyingGlass /><h3>No {def.plural} found</h3><p>Try another search or add a new configuration.</p></div></td></tr>}</tbody>
        </table>
      </div>
      <div className="pagination"><span>Displaying <strong>{visible.length}</strong> of {filtered.length} items</span><div><button disabled={page === 1} onClick={() => setPage(1)}>«</button><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>‹</button><strong>{page}</strong><span>of {pages}</span><button disabled={page === pages} onClick={() => setPage(value => value + 1)}>›</button><button disabled={page === pages} onClick={() => setPage(pages)}>»</button></div></div>
      {editing && <ConfigurationForm def={def} moduleKey={moduleKey} record={editing.id ? editing : null} companyId={companyId} clientView={clientLocked} onClose={() => setEditing(null)} onSave={save} />}
      {viewing && <ViewDrawer def={def} record={viewing} companyId={companyId} onClose={() => setViewing(null)} onEdit={record => { setViewing(null); setEditing(record); }} />}
      {deleting && !clientLocked && <DeleteDialog def={def} record={deleting} onClose={() => setDeleting(null)} onDelete={() => { setRecords(previous => previous.filter(record => record.id !== deleting.id)); recordChange({ action: 'ConfigurationDeleted', summary: `${def.title} deleted`, record: deleting }); setDeleting(null); notify({ type: 'success', message: `${def.title} deleted successfully.` }); }} />}
      {filterOpen && <FilterDrawer def={def} filters={filters} setFilters={setFilters} onClose={() => setFilterOpen(false)} />}
    </div>
  );
}

export { moduleDefinitions };
