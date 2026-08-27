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
import { defaultCompanyRecord, readActiveCompanyId } from './companyRepository';
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
import { readComputationLibrary, readReferences, resolveReferenceVersion } from './computationGovernance';
import { fields as approvedFields, fieldMap } from './computationCatalog';
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
} from './computationBindings';


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
          { key: 'frequency', label: 'Recurring Frequency', type: 'select', options: ['One-time', 'Weekly', 'Semi-monthly', 'Monthly', 'Quarterly', 'Annually'], required: true, half: true },
          { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
        ],
      },
      {
        title: 'Earning Setup', fields: [
          { key: 'cappedEarning', label: 'Capped Earning?', type: 'boolean', half: true },
          { key: 'adjustIfAbsent', label: 'Adjust If Absent?', type: 'boolean', half: true },
          { key: 'adjustmentEarning', label: 'Adjustment Earning', placeholder: 'Select related earning', half: true },
          { key: 'minimumAbsent', label: 'Minimum Number of Absent', type: 'number', half: true },
          { key: 'autoCompute', label: 'Auto-compute?', type: 'boolean', half: true },
          { key: 'computationBasis', label: 'Computation Basis', type: 'select', options: ['Current Variable Allowance', 'Basic Pay', 'Daily Rate', 'Hourly Rate', 'Fixed Amount'], required: true, half: true },
          { key: 'variableAllowance', label: 'Variable Allowance', type: 'select', options: ['Variable Allowance 1', 'Variable Allowance 2', 'Not applicable'], half: true },
          { key: 'unit', label: 'Unit', type: 'select', options: ['in Minutes', 'in Hours', 'in Days', 'Fixed Amount'], half: true },
          { key: 'negativeComputation', label: 'Negative Computation?', type: 'boolean', half: true },
          { key: 'taxability', label: 'Taxability', type: 'select', options: ['Taxable', 'Non-taxable'], required: true, half: true },
          { key: 'classification', label: 'Earning Classification', type: 'select', options: ['Regular Earning', 'De Minimis', 'Reimbursement', 'Retirement', 'Fringe Benefit'], required: true, half: true },
          { key: 'deMinimisThreshold', label: 'De Minimis Threshold', type: 'number', half: true },
          { key: 'workDays', label: 'Work Days', type: 'number', half: true },
        ],
      },
      {
        title: 'Accounting Setup', fields: [
          { key: 'glBreakdown', label: 'GL Breakdown', type: 'select', options: ['Per Employee', 'Per Department', 'Per Cost Center'], required: true },
          { key: 'glName', label: 'GL Name', type: 'select', options: ['General Ledger Name 1', 'Payroll Expense', 'Employee Benefits'], required: true },
          { key: 'subGlName', label: 'Sub-GL Name', type: 'select', options: ['Account Name', 'Salaries and Wages', 'Allowances'], required: true },
        ],
      },
    ],
    defaults: { type: 'Normal', frequency: 'Semi-monthly', status: 'Active', cappedEarning: 'Yes', adjustIfAbsent: 'Yes', minimumAbsent: '3', autoCompute: 'Yes', computationBasis: 'Current Variable Allowance', variableAllowance: 'Variable Allowance 1', unit: 'in Minutes', negativeComputation: 'Yes', taxability: 'Non-taxable', classification: 'De Minimis', deMinimisThreshold: '0', workDays: '261', glBreakdown: 'Per Employee', glName: 'General Ledger Name 1', subGlName: 'Account Name' },
    rows: [
      ['47218653', 'Salary', 'Normal'], ['47218654', 'Lecture Fee', 'Normal'], ['47218655', 'Basic Pay Adjustment', 'Basic Pay Adjustment'], ['47218656', 'Clothing Allowance', 'Allowance'], ['47218657', 'Special Privilege Leave', 'Special Privilege Leave'], ['47218658', 'Transportation Reimbursement', 'Reimbursement'], ['47218659', 'Undertime Adjustment', 'Undertime'], ['47218660', 'Late Adjustment', 'Late'], ['47218661', 'Meal Allowance', 'Allowance'], ['47218662', 'Night Differential', 'Normal'],
      // Tagged for retirement so the Retirement engine can resolve its salary
      // basis from Earning Configuration instead of redefining the earnings.
      ['47218663', 'Transportation Allowance', 'Allowance', { classification: 'Retirement', taxability: 'Taxable' }],
      ['47218664', 'Communication Allowance', 'Allowance', { classification: 'Retirement', taxability: 'Taxable' }],
    ],
  },
  bonuses: {
    title: 'Bonus Configuration',
    plural: 'bonuses',
    description: 'Define fixed or scheduled bonuses, taxability, employee coverage, exemption thresholds, and ledger mappings.',
    table: [['code', 'Bonus Code'], ['name', 'Bonus Name'], ['type', 'Bonus Type'], ['taxability', 'Taxability'], ['applicability', 'Applies To'], ['status', 'Status']],
    steps: [
      { title: 'Bonus Details', fields: [
        { key: 'code', label: 'Bonus Code', required: true, half: true }, { key: 'name', label: 'Bonus Name', required: true, half: true },
        { key: 'type', label: 'Bonus Type', type: 'select', options: ['13th Month Pay', 'Performance Bonus', 'Signing Bonus', 'Productivity Bonus'], required: true, half: true },
        { key: 'taxability', label: 'Taxability', type: 'select', options: ['Taxable Bonus', 'Non-taxable Bonus'], required: true, half: true },
          { key: 'applicability', label: 'Applies to', type: 'applicability' },
        { key: 'threshold', label: 'Bonus Threshold', type: 'number', required: true, half: true },
        { key: 'thresholdSplitting', label: 'Threshold Splitting?', type: 'boolean', half: true },
        { key: 'frequency', label: 'Schedule / Frequency', type: 'select', options: ['One-time', 'Monthly', 'Quarterly', 'Annually'], required: true, half: true },
        { key: 'dateStart', label: 'Date Start', type: 'date', required: true, half: true }, { key: 'dateEnd', label: 'Date End', type: 'date', half: true },
        { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
      ] },
      { title: 'Accounting Setup', fields: [
        { key: 'glBreakdown', label: 'GL Breakdown', type: 'select', options: ['Per Employee', 'Per Department', 'Per Cost Center'], required: true },
        { key: 'glName', label: 'GL Name', type: 'select', options: ['Bonus Expense', 'Employee Benefits'], required: true },
        { key: 'subGlName', label: 'Sub-GL Name', type: 'select', options: ['13th Month Pay', 'Performance Incentives'], required: true },
      ] },
    ],
    defaults: { type: 'Performance Bonus', taxability: 'Taxable Bonus', threshold: '90000', thresholdSplitting: 'No', frequency: 'Annually', dateStart: '2026-01-01', status: 'Active', glBreakdown: 'Per Employee', glName: 'Bonus Expense', subGlName: 'Performance Incentives' },
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
        { key: 'basis', label: 'Deduction Basis', type: 'select', options: ['Fixed Amount', 'Percentage of Basic Pay', 'Percentage of Gross Pay', 'Balance'], required: true, half: true },
        { key: 'amount', label: 'Default Amount / Rate', type: 'number', required: true, half: true },
        { key: 'frequency', label: 'Recurring Frequency', type: 'select', options: ['One-time', 'Weekly', 'Semi-monthly', 'Monthly'], required: true, half: true },
        { key: 'partOfNetPay', label: 'Is part of net pay?', type: 'boolean', half: true }, { key: 'tax', label: 'Tax Treatment', type: 'select', options: ['Pre-tax', 'Post-tax', 'Not applicable'], half: true },
        { key: 'takeHomeTreatment', label: 'Insufficient Net Pay Handling', type: 'select', options: ['Defer Balance', 'Partial Deduction', 'Deduct in Full'], required: true, half: true },
        { key: 'hierarchyPriority', label: 'Take-Home Adjustment Priority', type: 'number', required: true, half: true },
        { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
      ] },
      { title: 'Accounting Setup', fields: [
        { key: 'glBreakdown', label: 'GL Breakdown', type: 'select', options: ['Per Employee', 'Per Department', 'Per Cost Center'], required: true },
        { key: 'glName', label: 'GL Name', type: 'select', options: ['Payroll Deductions', 'Employee Receivable'], required: true },
        { key: 'subGlName', label: 'Sub-GL Name', type: 'select', options: ['Company Deductions', 'Other Receivables'], required: true },
      ] },
    ],
    defaults: { type: 'Fixed Deduction', basis: 'Fixed Amount', amount: '500', frequency: 'Semi-monthly', partOfNetPay: 'Yes', tax: 'Post-tax', takeHomeTreatment: 'Partial Deduction', hierarchyPriority: '20', status: 'Active', glBreakdown: 'Per Employee', glName: 'Payroll Deductions', subGlName: 'Company Deductions' },
    rows: [['DED-001', 'Uniform Deduction', 'Fixed Deduction', { amount: '500', hierarchyPriority: '21' }], ['DED-002', 'Cooperative Dues', 'Recurring Deduction', { amount: '750', hierarchyPriority: '22' }], ['DED-003', 'Cash Advance', 'Recurring Deduction', { amount: '1000', hierarchyPriority: '23' }], ['DED-004', 'Equipment Charge', 'One-time Deduction', { amount: '900', hierarchyPriority: '24' }], ['DED-005', 'Union Dues', 'Recurring Deduction', { amount: '350', hierarchyPriority: '25' }], ['DED-006', 'Health Insurance', 'Recurring Deduction', { amount: '1200', hierarchyPriority: '26' }]],
  },
  loans: {
    title: 'Company Loan Configuration',
    plural: 'company loans',
    description: 'Set up company loan types, principal, interest, amortization, employee coverage, and recurring collection schedules.',
    table: [['code', 'Code'], ['name', 'Company Loan Name'], ['type', 'Company Loan Type'], ['principal', 'Principal'], ['terms', 'Terms'], ['amortization', 'Amortization'], ['status', 'Status']],
    steps: [{ title: 'Company Loan Details', fields: [
      { key: 'code', label: 'Code', required: true, half: true }, { key: 'name', label: 'Company Loan Name', required: true, half: true },
      { key: 'type', label: 'Company Loan Type', type: 'select', options: ['Salary Loan', 'Emergency Loan', 'Educational Loan', 'Calamity Loan'], required: true },
      { key: 'principal', label: 'Principal', type: 'number', required: true, half: true }, { key: 'interest', label: 'Interest per Annum (%)', type: 'number', required: true, half: true },
      { key: 'terms', label: 'Terms (months)', type: 'number', required: true, half: true }, { key: 'interestAmount', label: 'Interest Amount', type: 'number', half: true },
      { key: 'amortization', label: 'Amortization', type: 'number', required: true, half: true }, { key: 'frequency', label: 'Payment Frequency', type: 'select', options: ['Semi-monthly', 'Monthly', 'Quarterly', 'One-time'], required: true, half: true },
      { key: 'balanceHandling', label: 'Insufficient Net Pay Handling', type: 'select', options: ['Defer Balance', 'Partial Deduction', 'Deduct in Full'], required: true, half: true },
      { key: 'hierarchyPriority', label: 'Take-Home Adjustment Priority', type: 'number', required: true, half: true },
      { key: 'applicability', label: 'Applies to', type: 'applicability' },
      { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true, half: true }, { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
    ] }],
    defaults: { type: 'Salary Loan', principal: '100000', interest: '5', terms: '12', interestAmount: '5000', amortization: '8750', frequency: 'Monthly', balanceHandling: 'Partial Deduction', hierarchyPriority: '10', effectiveDate: '2026-01-01', status: 'Active' },
    rows: [['CL-001', 'Employee Salary Loan', 'Salary Loan', { principal: '30000', amortization: '2500', hierarchyPriority: '11' }], ['CL-002', 'Emergency Assistance', 'Emergency Loan', { principal: '15000', amortization: '1500', hierarchyPriority: '12' }], ['CL-003', 'School Support Loan', 'Educational Loan', { principal: '18000', amortization: '1500', hierarchyPriority: '13' }], ['CL-004', 'Calamity Assistance', 'Calamity Loan', { principal: '12000', amortization: '1000', hierarchyPriority: '14' }]],
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
      { key: 'type', label: 'Control Type', type: 'select', options: ['Payroll Calendar', 'Deduction Hierarchy', 'Payslip Rule', 'Approval Hierarchy', 'Multi-Currency'], required: true },
      { key: 'frequency', label: 'Pay Frequency', type: 'select', options: ['Weekly', 'Semi-monthly', 'Monthly'], required: true, half: true },
      { key: 'cutoff', label: 'Cutoff Schedule', type: 'select', options: ['1st–15th / 16th–End', 'Calendar Month', 'Custom'], required: true, half: true },
      { key: 'currency', label: 'Payroll Currency', type: 'select', options: ['PHP', 'USD', 'SGD'], required: true, half: true },
      { key: 'approvalLevels', label: 'Approval Levels', type: 'number', required: true, half: true }, { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true, half: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true, half: true },
    ] }],
    defaults: { type: 'Payroll Calendar', frequency: 'Semi-monthly', cutoff: '1st–15th / 16th–End', currency: 'PHP', approvalLevels: '2', effectiveDate: '2026-01-01', status: 'Active' },
    rows: [['PAY-001', 'Semi-monthly Payroll Calendar', 'Payroll Calendar'], ['DED-H01', 'Statutory Before Company Deductions', 'Deduction Hierarchy'], ['PSL-001', 'Standard Payslip', 'Payslip Rule'], ['APR-001', 'Payroll Two-Level Approval', 'Approval Hierarchy']],
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
    { key: 'bonuses', short: 'Bonuses', detail: 'Bonus schedules, thresholds, taxability and GL setup' },
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
    return [...reconciled, ...saved.filter(record => !seedCodes.has(record.code)).map(record => withApplicability({ ...def.defaults, ...record }, companyId))];
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
            <span className={`computation-source ${selected.isBuiltIn === false ? 'admin-defined' : 'built-in'}`}>
              <Function weight="duotone" />{selected.isBuiltIn === false ? 'Company-defined' : 'Atlas standard'}
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
 */
function BindingRow({ token, binding, entry, configFields, references, onChange }) {
  const field = fieldMap[token];
  const source = references.find(item => item.code === binding.referenceCode);
  const set = patch => onChange({ ...binding, ...patch });
  return <tr className={entry?.problem ? 'mapping-problem' : ''}>
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
      {binding.kind === 'fixed' && <input
        type="number"
        step="any"
        value={binding.value ?? ''}
        onChange={event => set({ value: event.target.value })}
        placeholder="0.00"
        aria-label={`Fixed value for ${token}`}
      />}
    </td>
    <td>{field?.unit || '—'}</td>
    <td>
      {entry?.problem
        ? <span className="binding-problem"><Warning weight="bold" /> {entry.problem}</span>
        : <span className="binding-resolved">{Number(entry?.value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}<small className="block-caption">{entry?.source}</small></span>}
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
  return <div className="binding-editor">
    <div className="mapping-table-wrap">
      <table className="mapping-table binding-table">
        <thead><tr><th>Variable</th><th>Source</th><th>Bound to</th><th>Unit</th><th>Resolved value</th></tr></thead>
        <tbody>
          {tokens.map(token => <BindingRow
            key={token}
            token={token}
            binding={bindings[token]}
            entry={entryFor(token)}
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

function Field({ field, value, onChange, draft, def, catalog }) {
  const common = { value: value ?? '', onChange: event => onChange(event.target.value), required: field.required };
  if (field.type === 'applicability') return <ApplicabilityField value={value} onChange={onChange} />;
  if (field.type === 'computation') return <ComputationField field={field} value={value} onChange={onChange} catalog={catalog} />;
  if (field.type === 'bindings') return <BindingField field={field} value={value} onChange={onChange} draft={draft} def={def} catalog={catalog} />;
  if (field.type === 'select') return <select {...common}><option value="">Please select</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>;
  if (field.type === 'boolean') return (
    <div className="radio-group">
      {['Yes', 'No'].map(option => <label key={option}><input type="radio" name={field.key} value={option} checked={(value ?? 'No') === option} onChange={() => onChange(option)} /> {option}</label>)}
    </div>
  );
  return <input {...common} type={field.type ?? 'text'} min={field.type === 'number' ? '0' : undefined} placeholder={field.placeholder ?? (field.type === 'number' ? '0.00' : `Input ${field.label.toLowerCase()}`)} />;
}

function ConfigurationForm({ def, record, companyId, onClose, onSave }) {
  const [draft, setDraft] = useState({ ...def.defaults, ...record });
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const catalog = useBindingCatalog(companyId);
  const current = def.steps[step];
  // Editing anything retires the refusal that was shown for the previous draft:
  // an error still on screen after the thing it complained about was fixed
  // reads as a second, unexplained problem.
  const update = (key, value) => {
    setError('');
    setDraft(previous => ({ ...previous, [key]: value }));
  };
  const next = event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (step < def.steps.length - 1) { setStep(step + 1); return; }
    // A half-bound formula is refused here rather than at payroll: an unbound
    // variable resolves to nothing, and a deduction that silently computes zero
    // is worse than one that never saved.
    const problems = bindingProblems({
      record: draft,
      library: catalog.library,
      references: catalog.references,
      configFields: bindableConfigFields(def),
    });
    if (problems.length) { setError(problems[0]); setStep(def.steps.length - 1); return; }
    setError('');
    onSave(draft);
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal config-modal" role="dialog" aria-modal="true" aria-label={`${record?.id ? 'Edit' : 'Add'} ${def.title}`}>
        <header><h2>{record?.id ? 'Edit' : 'Add'} {def.title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
        <form onSubmit={next}>
          {def.steps.length > 1 && <div className="stepper">{def.steps.map((item, index) => <div key={item.title} className={index <= step ? 'active' : ''}><span>{index < step ? <Check weight="bold" /> : index + 1}</span><i /></div>)}</div>}
          <div className="config-form-body">
            <h3>{current.title}</h3>
            <div className="config-form-grid">
              {current.fields.map(field => (
                <label key={field.key} className={field.half ? 'half' : field.type === 'bindings' ? 'full' : ''}>{field.label}{field.required && <span className="required">*</span>}
                  <Field field={field} value={draft[field.key]} onChange={value => update(field.key, value)} draft={draft} def={def} catalog={catalog} />
                </label>
              ))}
            </div>
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

  const save = draft => {
    const duplicate = records.some(record => record.id !== draft.id && record.code.toLowerCase() === draft.code.toLowerCase());
    if (duplicate) { notify({ type: 'error', message: `${draft.code} already exists. Use a unique code.` }); return; }
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
    if (draft.id) setRecords(previous => previous.map(record => record.id === draft.id ? { ...draft, companyId } : record));
    else setRecords(previous => [{ ...draft, companyId, id: Math.max(0, ...previous.map(record => record.id)) + 1, dateCreated: new Date().toLocaleDateString('en-US') }, ...previous]);
    setEditing(null);
    notify({ type: 'success', message: `${def.title} ${draft.id ? 'updated' : 'added'} successfully.` });
  };

  const importCsv = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { notify({ type: 'error', message: 'The upload needs a header row and at least one data row.' }); return; }
      const headers = lines[0].split(',').map(value => value.replaceAll('"', '').trim().toLowerCase());
      const expected = Object.fromEntries(def.steps.flatMap(step => step.fields).map(field => [field.label.toLowerCase(), field.key]));
      const added = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(value => value.replace(/^"|"$/g, '').trim());
        const next = { ...def.defaults, id: Date.now() + index, dateCreated: new Date().toLocaleDateString('en-US') };
        headers.forEach((header, headerIndex) => { if (expected[header]) next[expected[header]] = values[headerIndex]; });
        return next;
      }).filter(row => row.code && row.name);
      if (!added.length) { notify({ type: 'error', message: 'No rows matched the required Code and Name columns.' }); return; }
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
      <div className="config-toolbar">
        <div className="search-box"><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder={`Search ${def.plural}...`} /><MagnifyingGlass /></div>
        <button className={`filter-button ${Object.values(filters).some(Boolean) ? 'applied' : ''}`} onClick={() => setFilterOpen(true)}><SlidersHorizontal /> Filter</button>
        <div className="toolbar-spacer" />
        <button className="button primary" onClick={() => setEditing({})}><Plus /> Add</button>
        <button className="button secondary" onClick={() => uploadRef.current?.click()}><UploadSimple /> Upload</button>
        <input ref={uploadRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={importCsv} />
        <ExportMenu onExport={format => { if (exportRecords(def, filtered, format, catalog.library)) notify({ type: 'success', message: `${def.title} export prepared.` }); }} />
      </div>
      <div className="table-card config-table-card">
        <table className="config-table">
          <thead><tr>{def.table.map(([, label]) => <th key={label}>{label}</th>)}{def.bindable && <th>Basis of Computation</th>}<th>Action</th></tr></thead>
          <tbody>{visible.length ? visible.map(record => <tr key={record.id}>{def.table.map(([key]) => <td key={key}>{key === 'status' ? <span className={`status-pill ${String(record[key]).toLowerCase()}`}>{record[key]}</span> : key === 'applicability' ? <span className="scope-chip"><Users weight="duotone" />{describeScope(record.applicability)}</span> : ['principal', 'amortization', 'threshold'].includes(key) ? `₱ ${Number(record[key] || 0).toLocaleString()}` : record[key] || '—'}</td>)}
            {def.bindable && <td>{record.computationCode
              ? <span className="binding-chip" title={bindingSummary(record, catalog.library)}><Function weight="duotone" />{record.computationCode}</span>
              : <span className="binding-chip none"><LinkBreak />Not bound</span>}</td>}
            <td><div className="row-actions always"><button onClick={() => setViewing(record)} aria-label="View"><Eye /></button><button onClick={() => setEditing(record)} aria-label="Edit"><PencilSimple /></button><button onClick={() => setDeleting(record)} aria-label="Delete"><Trash /></button></div></td></tr>) : <tr><td colSpan={def.table.length + (def.bindable ? 2 : 1)}><div className="empty-state"><MagnifyingGlass /><h3>No {def.plural} found</h3><p>Try another search or add a new configuration.</p></div></td></tr>}</tbody>
        </table>
      </div>
      <div className="pagination"><span>Displaying <strong>{visible.length}</strong> of {filtered.length} items</span><div><button disabled={page === 1} onClick={() => setPage(1)}>«</button><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>‹</button><strong>{page}</strong><span>of {pages}</span><button disabled={page === pages} onClick={() => setPage(value => value + 1)}>›</button><button disabled={page === pages} onClick={() => setPage(pages)}>»</button></div></div>
      {editing && <ConfigurationForm def={def} record={editing.id ? editing : null} companyId={companyId} onClose={() => setEditing(null)} onSave={save} />}
      {viewing && <ViewDrawer def={def} record={viewing} companyId={companyId} onClose={() => setViewing(null)} onEdit={record => { setViewing(null); setEditing(record); }} />}
      {deleting && <DeleteDialog def={def} record={deleting} onClose={() => setDeleting(null)} onDelete={() => { setRecords(previous => previous.filter(record => record.id !== deleting.id)); setDeleting(null); notify({ type: 'success', message: `${def.title} deleted successfully.` }); }} />}
      {filterOpen && <FilterDrawer def={def} filters={filters} setFilters={setFilters} onClose={() => setFilterOpen(false)} />}
    </div>
  );
}

export { moduleDefinitions };
