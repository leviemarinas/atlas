/**
 * Core ▸ Company Configuration ▸ Company Information, as in Atlas Core: a card
 * per section with a "Your Progress" panel, and each section's own screen.
 *
 * What other mockup modules read from the company record — legal and display
 * name, TIN, company code, bank accounts, contact persons and signatories — is
 * written back to that record on every save, so payroll, bank files and the
 * HRM headers keep working off the same data.
 */
import { PAYROLL_ROUNDING_KEY } from '../payrollRounding';
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bank, Buildings, CheckCircle, Circle, DownloadSimple, IdentificationCard, Phone, Plus, ShieldCheck, Trash, UserFocus, Wrench } from '@phosphor-icons/react';
import { appendAuditEvent } from '../companyRepository';
import { useRole } from '../RoleContext';
import { downloadFile } from '../fileDownload';
import { AtlasTable, FormDialog, NavigationGuideHost, readScoped, writeScoped } from './AtlasTable.jsx';
import { todayIso } from './dates.js';

const f = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const c = (key, label, type, extra = {}) => ({ key, label, type, ...extra });
const req = { required: true };
const yesNo = ['Yes', 'No'];
const dayOfMonth = { type: 'number', min: 1, max: 31, placeholder: 'Input day of month' };

const L = {
  status: ['Active', 'Inactive'],
  industryGroups: ['Group A', 'Group B', 'Group C', 'Group D', 'Group E'],
  industries: ['Banking Institutions', 'Insurance and Pension Funding', 'Non-Bank Financial Intermediation', 'Construction', 'Hotels and Restaurants', 'Land Transport', 'Water Transport', 'Professional Services', 'Information Technology'],
  businessTypes: ['Sole Proprietorship', 'Partnership', 'Corporation', 'Limited Liability Companies', 'Cooperatives', 'Association'],
  offices: ['Makati Head Office', 'Cebu Office', 'Davao Office'],
  accountingPeriods: ['Calendar Year', 'Fiscal Year'],
  taxClasses: ['Micro Taxpayer', 'Small Taxpayer', 'Medium Taxpayer', 'Large Taxpayer'],
  birForms: ['0619-E', '0619-F', '1601-C', '1601-EQ', '1601-FQ', '1604-C', '1604-E', '1604-F'],
  countries: ['Philippines', 'Singapore', 'United States'],
  regions: ['NCR', 'Region III', 'Region IV-A', 'Region VII', 'Region XI'],
  cities: ['Makati City', 'Taguig City', 'Quezon City', 'Pasig City', 'Cebu City', 'Davao City'],
  phoneTypes: ['Mobile', 'Landline', 'Fax'],
  banks: ['Banco de Oro', 'Bank of the Philippine Islands', 'Metrobank', 'Security Bank', 'UnionBank', 'HSBC', 'Allied Bank', 'Asia United Bank'],
  accountTypes: ['Current', 'Savings', 'Salary'],
  salutations: ['Mr.', 'Ms.', 'Dr.', 'Engr.', 'Prof.'],
  employees: ['John Collins Doe', 'Ethan Collins', 'Sophia Ramirez', 'Liam Johnson', 'Olivia Bennett', 'Andrea Reyes', 'Maria Santos'],
  jobTitles: { 'John Collins Doe': 'IT Manager', 'Ethan Collins': 'Software Engineer', 'Sophia Ramirez': 'HR Officer', 'Liam Johnson': 'Accountant', 'Olivia Bennett': 'Payroll Specialist', 'Andrea Reyes': 'Chief Finance Officer', 'Maria Santos': 'HR Director' },
  employeeGroups: ['All Employees', 'Rank and File', 'Supervisors', 'Managers'],
  statutory: ['BIR', 'SSS', 'PhilHealth', 'HDMF'],
  signatoryRoles: ['Final payroll approver', 'BIR forms signatory', 'Certificate of employment signatory', 'Bank file signatory'],
  userRoles: ['Client Admin', 'Approver', 'Payroll Contact', 'Billing Contact', 'Remittance Contact'],
};

export const KYC_DOCUMENTS = [
  { key: 'k1', label: '1. Engagement Letter/Contract - Payment Services' },
  { key: 'k2', label: '2. Latest SEC-received General Information Sheet (GIS)', alternative: '2a. If there is no available GIS, kindly request the client business profile if client is from other country, if PH based, not applicable.' },
  { key: 'k3', label: '3. Latest SEC-received Audited Financial Statements', alternative: "3a. If there is no available AFS, kindly request the client's 3 months previous bank statement." },
  { key: 'k4', label: '4. Articles of Incorporation / Partnership & By-laws' },
  { key: 'k5', label: '5. SEC Certificate of Incorporation / Partnership' },
  { key: 'k6', label: '6. Board Resolution by the owner/board of directors/partners authorizing the signatory to sign on behalf of the entity' },
  { key: 'k7', label: '7. AML CFT CIS and Due Diligence Questionnaire/CIS EDD Form for Juridical Person/Individual Clients' },
  { key: 'k8', label: '8. Valid Identification Document/s of Ultimate Beneficial Owners (reflected in GIS)' },
  { key: 'k9', label: '9. Valid Identification Document/s of Authorized Signatory (the one who signed the CIS)' },
  { key: 'k10', label: '10. Valid Identification Document/s of Authorized Representative (the one who signed the contract and indicated in Secretary Certificate/Board Resolution)' },
];

/* ------------------------------------------------------------ table defs */

const remarksAndFiles = [f('remarks', 'Remarks', 'textarea'), f('documents', 'Supporting Documents', 'file')];
const withJobTitle = draft => ({ ...draft, jobTitle: draft.jobTitle || L.jobTitles[draft.employee] || '' });

const birTable = {
  title: 'Bureau of Internal Revenue', singular: 'BIR Information', storageKey: 'atlas-core-ci-bir-v1', uniqueKey: ['tin', 'branchCode'], wideForm: true,
  columns: [c('tin', 'TIN'), c('rdo', 'RDO'), c('rdoLocation', 'Location'), c('branchCode', 'Branch Code'), c('filingForms', 'Filing Deadline Forms', 'multiselect'), c('filingOption', 'Filing Option'), c('paymentForms', 'Payment Deadline Forms', 'multiselect'), c('taxGroup', 'Classification of Tax Group'), c('taxPayer', 'Classification of Tax Payer')],
  fields: [f('tin', 'Tax Identification Number (TIN)', 'text', { ...req, placeholder: 'Input 9-12 digit TIN', pattern: /^\d{3}-?\d{3}-?\d{3}(-?\d{3})?$/, patternMessage: 'TIN must be 9 to 12 digits.' }), f('rdo', 'Revenue District Office', 'text', { ...req, placeholder: 'Input RDO (e.g. 047)', pattern: /^\d{3}[A-Z]?$/, patternMessage: 'RDO is a 3-digit code.' }), f('rdoLocation', 'RDO Location', 'text', { ...req, placeholder: 'Input RDO location (e.g. West Makati)' }), f('branchCode', 'Branch Code', 'text', { ...req, placeholder: 'Input branch code (e.g. 001)' }), f('filingForms', 'Choose Filing Deadline Form', 'multiselect', { ...req, options: L.birForms }), f('filingOption', 'Filing Option', 'radio', { ...req, options: ['Manual', 'Online'], default: 'Online' }), f('filingDeadline', 'Filing Deadline', 'number', { ...dayOfMonth }), f('paymentForms', 'Choose Payment Deadline Form', 'multiselect', { options: L.birForms }), f('paymentOption', 'Payment Option', 'radio', { options: ['Manual', 'Online'], default: 'Online' }), f('paymentDeadline', 'Payment Deadline', 'number', { ...dayOfMonth }), f('taxGroup', 'Classification of Tax Group', 'select', { ...req, options: L.taxClasses }), f('taxPayer', 'Classification of Tax Payer', 'select', { ...req, options: L.taxClasses })],
  filters: ['tin', 'rdo', 'rdoLocation', 'branchCode'],
};
const sssTable = {
  title: 'Social Security System', singular: 'SSS Information', storageKey: 'atlas-core-ci-sss-v1', uniqueKey: 'number',
  columns: [c('number', 'SSS Number'), c('branchLocation', 'Branch Location'), c('branchCode', 'Branch Code'), c('contributionDeadline', 'SSS Contribution Deadline'), c('loanDeadline', 'SSS Loan Deadline'), c('contributionLocator', 'Contribution Locator Code'), c('loanLocator', 'Loan Locator Code')],
  fields: [f('number', 'SSS Number', 'text', { ...req, placeholder: 'Input 10-13 digit number', pattern: /^[\d-]{10,15}$/, patternMessage: 'SSS Number is 10 to 13 digits.' }), f('branchLocation', 'Branch Location', 'text', { ...req, placeholder: 'Input branch location (e.g. Pasig - Pioneer)' }), f('branchCode', 'Branch Code', 'text', { ...req, placeholder: 'Input branch code. If none, copy your SSS number' }), f('contributionDeadline', 'Contribution Deadline', 'number', { ...req, ...dayOfMonth }), f('loanDeadline', 'Loan Deadline', 'number', { ...req, ...dayOfMonth }), f('contributionLocator', 'Contribution Locator Code', 'text', { placeholder: 'Input contribution locator code' }), f('loanLocator', 'Loan Locator Code', 'text', { placeholder: 'Input loan locator code' })],
  filters: ['number', 'branchLocation', 'branchCode'],
};
const philHealthTable = {
  title: 'Philippine Health Insurance Corporation', singular: 'PhilHealth Information', storageKey: 'atlas-core-ci-phic-v1', uniqueKey: 'number',
  columns: [c('number', 'PhilHealth Number'), c('branchLocation', 'Branch Location'), c('branchCode', 'Branch Code'), c('deadline', 'PhilHealth Deadline')],
  fields: [f('number', 'PhilHealth Number', 'text', { ...req, placeholder: 'Input 12 digit number', pattern: /^[\d-]{12,14}$/, patternMessage: 'PhilHealth Number is 12 digits.' }), f('branchLocation', 'Branch Location', 'text', { ...req, placeholder: 'Input branch location (e.g. NCR - North Manila)' }), f('branchCode', 'Branch Code', 'text', { ...req, placeholder: 'Input branch code. If none, copy your PhilHealth number.' }), f('deadline', 'PhilHealth Deadline', 'number', { ...req, ...dayOfMonth })],
  filters: ['number', 'branchLocation', 'branchCode'],
};
const hdmfTable = {
  title: 'Home Development Mutual Fund', singular: 'HDMF Information', storageKey: 'atlas-core-ci-hdmf-v1', uniqueKey: 'number',
  columns: [c('number', 'HDMF Number'), c('contributionDeadline', 'HDMF Contribution Deadline'), c('loanDeadline', 'HDMF Loan Deadline'), c('branchCode', 'HDMF Branch Code'), c('branchLocation', 'HDMF Branch Location'), c('locatorCode', 'HDMF Locator Code'), c('msbCode', 'HDMF MSB Code')],
  fields: [f('number', 'HDMF Number', 'text', { ...req, placeholder: '1234-5678-9012', pattern: /^\d{4}-?\d{4}-?\d{4}$/, patternMessage: 'HDMF Number is 12 digits (1234-5678-9012).' }), f('contributionDeadline', 'HDMF Contribution Deadline', 'number', { ...req, ...dayOfMonth }), f('loanDeadline', 'HDMF Loan Deadline', 'number', { ...req, ...dayOfMonth }), f('branchCode', 'HDMF Branch Code', 'text', { ...req, placeholder: 'Input branch code. If none, copy your HDMF number' }), f('branchLocation', 'HDMF Branch Location', 'text', { ...req, placeholder: 'Input branch location (e.g. Guadalupe EDSA Branch)' }), f('locatorCode', 'HDMF Locator Code', 'text', { placeholder: 'Input 1-2 digit number', pattern: /^\d{1,2}$/, patternMessage: 'Locator Code is 1 to 2 digits.' }), f('msbCode', 'HDMF MSB Code', 'text', { placeholder: 'Input 4 digit number', pattern: /^\d{4}$/, patternMessage: 'MSB Code is 4 digits.' })],
  filters: ['number', 'branchCode', 'branchLocation'],
};

const addressTable = {
  title: 'Business Address', singular: 'Business Address', storageKey: 'atlas-core-ci-address-v1', heading: 'Business Address', wideForm: true,
  columns: [c('office', 'Office Location'), { key: 'full', label: 'Full Address', render: row => [row.line1, row.line2, row.line3, row.line4, row.city, row.region, row.country, row.zip].filter(Boolean).join(', ') }],
  viewColumns: [c('office', 'Office Location'), c('line1', 'Address Line 1'), c('line2', 'Address Line 2'), c('line3', 'Address Line 3'), c('line4', 'Address Line 4'), c('country', 'Country'), c('region', 'State / Region'), c('city', 'City / Municipality'), c('zip', 'Zip / Postal Code')],
  fields: [f('office', 'Office Location', 'select', { ...req, options: L.offices }), f('line1', 'Address Line 1', 'text', { ...req, placeholder: 'Block / Lot / Phase Number / Floor Number / House Number' }), f('line2', 'Address Line 2', 'text', { placeholder: 'Building name / Apartment name' }), f('line3', 'Address Line 3', 'text', { ...req, placeholder: 'Street name & Barangay' }), f('line4', 'Address Line 4', 'text', { placeholder: 'Subdivision name / Village name' }), f('country', 'Country', 'select', { ...req, options: L.countries, default: 'Philippines' }), f('region', 'State / Region', 'select', { ...req, options: L.regions }), f('city', 'City / Municipality', 'select', { ...req, options: L.cities }), f('zip', 'Zip / Postal Code', 'text', { ...req, placeholder: 'Zip Code', pattern: /^\d{4,6}$/, patternMessage: 'Zip Code is 4 to 6 digits.' })],
  uniqueKey: 'office',
};
const onePrimary = (next, saved) => saved.primary === 'Yes' ? next.map(row => row.id === saved.id || (!saved.id && row === next[0]) ? row : { ...row, primary: 'No' }) : next;
const phoneTable = {
  title: 'Contact Numbers', singular: 'Contact Number', storageKey: 'atlas-core-ci-phone-v1', heading: 'Contact Numbers',
  columns: [c('phoneType', 'Phone Type'), c('number', 'Contact Number'), c('primary', 'Primary')],
  fields: [f('number', 'Contact Number', 'text', { ...req, placeholder: 'Contact Number', pattern: /^\+?[\d\s()-]{7,20}$/, patternMessage: 'Contact Number has 7 to 20 digits.' }), f('phoneType', 'Phone Type', 'select', { ...req, options: L.phoneTypes }), f('primary', 'Set as Primary', 'radio', { options: yesNo, default: 'No' })],
  uniqueKey: 'number', afterSave: onePrimary,
};
const emailTable = {
  title: 'Email Address', singular: 'Email Address', storageKey: 'atlas-core-ci-email-v1', heading: 'Email Address',
  columns: [c('email', 'Email Address'), c('primary', 'Primary')],
  fields: [f('email', 'Email Address', 'email', { ...req, placeholder: 'Email Address', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMessage: 'Enter a valid email address.' }), f('primary', 'Set as Primary', 'radio', { options: yesNo, default: 'No' })],
  uniqueKey: 'email', afterSave: onePrimary,
};
const websiteTable = {
  title: 'Website Links', singular: 'Website Link', storageKey: 'atlas-core-ci-website-v1', heading: 'Website Links',
  columns: [c('name', 'Website Name'), c('link', 'Website Link')],
  fields: [f('link', 'Website Link', 'text', { ...req, placeholder: 'Input website URL here', pattern: /^https?:\/\/\S+\.\S+/, patternMessage: 'Website Link must start with http:// or https://.' }), f('name', 'Website Name', 'text', { ...req, placeholder: 'Input website name here' })],
  uniqueKey: 'link',
};

const bankTable = {
  title: 'Bank Management', singular: 'Bank Information', storageKey: 'atlas-core-ci-bank-v1', wideForm: true, uniqueKey: ['bankName', 'accountNumber'],
  columns: [c('bankName', 'Bank Name'), c('accountNumber', 'Account Number'), c('branchName', 'Branch Name'), c('branchLocation', 'Branch Location'), c('branchAddress', 'Branch Address'), c('country', 'Country'), c('accountType', 'Account Type'), c('bankCompanyCode', 'Bank Company Code'), c('swiftCode', 'Swift Code'), c('isDefault', 'Default', 'checkbox'), c('hsbcCustomerId', 'HSBCNet Customer ID (For HSBC)'), c('hsbcConnectId', 'HSBC Connect ID (For HSBC)')],
  fields: [f('bankName', 'Bank Name', 'select', { ...req, options: L.banks }), f('accountType', 'Account Type', 'select', { ...req, options: L.accountTypes }), f('accountNumber', 'Account Number', 'text', { ...req, placeholder: 'Input account number', pattern: /^[\d\s-]{6,20}$/, patternMessage: 'Account Number is 6 to 20 digits.' }), f('branchName', 'Branch Name', 'text', { ...req, placeholder: 'Input branch name' }), f('branchLocation', 'Branch Location', 'text', { placeholder: 'Input location' }), f('branchAddress', 'Branch Address', 'text', { placeholder: 'Input bank address' }), f('country', 'Country', 'select', { ...req, options: L.countries, default: 'Philippines' }), f('bankCompanyCode', 'Bank Company Code', 'text', { placeholder: 'Input Code' }), f('swiftCode', 'Swift Code', 'text', { placeholder: 'Input Code', pattern: /^[A-Z0-9]{8}([A-Z0-9]{3})?$/, patternMessage: 'Swift Code is 8 or 11 letters and digits.' }), f('signatoryName', 'Signatory Name', 'text', { placeholder: 'Input name' }), f('hsbcCustomerId', 'HSBCNet Customer ID (For HSBC)', 'text', { placeholder: 'Input Customer ID', showIf: draft => draft.bankName === 'HSBC' }), f('hsbcConnectId', 'HSBC Connect ID (For HSBC)', 'text', { placeholder: 'Input Connect ID', showIf: draft => draft.bankName === 'HSBC' }), f('isDefault', 'Make default bank', 'checkbox', { checkLabel: 'Make default bank' })],
  filters: ['bankName', 'accountNumber', 'branchName', 'country', 'accountType', 'bankCompanyCode'],
  afterSave: (next, saved) => {
    const target = saved.isDefault ? (saved.id || next[0].id) : null;
    const rows = target ? next.map(row => ({ ...row, isDefault: row.id === target })) : next;
    return rows.some(row => row.isDefault) || !rows.length ? rows : rows.map((row, index) => ({ ...row, isDefault: index === 0 }));
  },
  canDelete: (row, rows) => row.isDefault && rows.length > 1 ? 'Make another bank the default before deleting this one.' : '',
};

const contactPersonTable = {
  title: 'Contact Person', singular: 'Contact Person', storageKey: 'atlas-core-ci-contact-person-v1', wideForm: true,
  columns: [c('date', 'Date', 'date'), c('name', 'Name'), c('isEmployee', 'Company Employee'), c('jobTitle', 'Job Title'), c('roles', 'User Role/s', 'multiselect'), c('email', 'Email Address'), c('mobile', 'Mobile Number'), c('office', 'Office Location'), c('employeeGroups', 'Employee Group Assignment', 'multiselect'), c('remarks', 'Remarks')],
  fields: [f('date', 'Date', 'date', { ...req, default: todayIso() }), f('isEmployee', 'Company Employee?', 'radio', { ...req, options: yesNo, default: 'Yes' }), f('employee', 'Name', 'select', { ...req, options: L.employees, showIf: draft => draft.isEmployee === 'Yes' }), f('name', 'Name', 'text', { ...req, placeholder: 'Input name', showIf: draft => draft.isEmployee === 'No' }), f('jobTitle', 'Job Title', 'text', { placeholder: 'Auto populated for employees' }), f('roles', 'Role', 'multiselect', { ...req, options: L.userRoles }), f('email', 'Email Address', 'email', { ...req, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMessage: 'Enter a valid email address.' }), f('mobile', 'Mobile Phone', 'text', { ...req, placeholder: 'Phone Number' }), f('telephone', 'Telephone', 'text'), f('office', 'Office Location', 'select', { options: L.offices }), f('employeeGroups', 'Employee Group Assignment', 'multiselect', { options: L.employeeGroups }), ...remarksAndFiles],
  beforeSave: draft => draft.isEmployee === 'Yes' ? { ...withJobTitle(draft), name: draft.employee } : draft,
};
const approverTable = {
  title: 'Approver', singular: 'Approver', storageKey: 'atlas-core-ci-approver-v1', uniqueKey: ['statutory', 'employee'],
  columns: [c('statutory', 'Government Statutory'), c('assignmentDate', 'Assignment Date', 'date'), c('salutation', 'Salutation'), c('employee', 'Employee Name'), c('jobTitle', 'Job Title'), c('employeeGroups', 'Employee Group', 'multiselect'), c('remarks', 'Remarks')],
  fields: [f('statutory', 'Government Statutory', 'select', { ...req, options: L.statutory }), f('assignmentDate', 'Assignment Date', 'date', req), f('salutation', 'Salutation', 'select', { ...req, options: L.salutations }), f('employee', 'Employee Name', 'select', { ...req, options: L.employees }), f('jobTitle', 'Job Title', 'text', { readOnly: true, placeholder: 'Auto populated' }), f('employeeGroups', 'Employee Group', 'multiselect', { options: L.employeeGroups }), ...remarksAndFiles],
  beforeSave: withJobTitle,
};
const signatoryTable = {
  title: 'Signatory', singular: 'Signatory', storageKey: 'atlas-core-ci-signatory-v1', uniqueKey: ['employee', 'role'],
  columns: [c('assignmentDate', 'Assignment Date', 'date'), c('salutation', 'Salutation'), c('employee', 'Employee Name'), c('jobTitle', 'Job Title'), c('role', 'Role'), c('signature', 'E-signature', 'file'), c('employeeGroups', 'Employee Group', 'multiselect'), c('remarks', 'Remarks')],
  fields: [f('assignmentDate', 'Assignment Date', 'date', req), f('salutation', 'Salutation', 'select', { ...req, options: L.salutations }), f('employee', 'Employee Name', 'select', { ...req, options: L.employees }), f('jobTitle', 'Job Title', 'text', { readOnly: true, placeholder: 'Auto populated' }), f('role', 'Signatory Role', 'select', { ...req, options: L.signatoryRoles }), f('signature', 'E-Signature', 'file', { ...req, accept: '.png,.jpg,.jpeg', hint: 'PNG or JPG of the signature.' }), f('employeeGroups', 'Employee Group', 'multiselect', { options: L.employeeGroups }), ...remarksAndFiles],
  beforeSave: withJobTitle,
};

/* -------------------------------------------------- Services Information */

const servicesTabs = {
  benefits: [{ key: 'benefits', label: 'Benefits', definition: {
    title: 'Benefits', singular: 'Benefit', storageKey: 'atlas-core-si-benefits-v1', uniqueKey: 'code', wideForm: true,
    columns: [c('code', 'Code'), c('name', 'Benefit Name'), c('employeeGroups', 'Employee Group', 'multiselect'), c('frequency', 'Benefit Frequency'), c('startDate', 'Start Date', 'date'), c('endDate', 'End Date', 'date'), c('amount', 'Benefits Amount', 'money'), c('autoRenewal', 'Auto Renewal'), c('carryForward', 'Carry Forward'), c('maxPerYear', 'Maximum Amount Per Year', 'money'), c('maxTotal', 'Total Maximum Amount Allowed', 'money'), c('expiresIn', 'Expires in'), c('expirationNo', 'Expiration Number'), c('holdDate', 'Hold Date', 'date'), c('remarks', 'Remarks')],
    fields: [f('code', 'Benefit Code', 'text', { ...req, placeholder: 'Input code' }), f('name', 'Benefit Name', 'text', { ...req, placeholder: 'Input name' }), f('employeeGroups', 'Employee Groups', 'multiselect', { ...req, options: L.employeeGroups }), f('frequency', 'Frequency', 'select', { ...req, options: ['Monthly', 'Quarterly', 'Yearly', 'One-time'] }), f('amount', 'Amount', 'number', { ...req, min: 0 }), f('autoRenewal', 'Auto Renewal', 'radio', { options: yesNo, default: 'No' }), f('carryForward', 'Carry Forward', 'radio', { options: yesNo, default: 'No' }), f('startDate', 'Start Date', 'date', req), f('endDate', 'End Date', 'date'), f('maxPerYear', 'Maximum Amount Per Year', 'number', { min: 0 }), f('maxTotal', 'Total Maximum Amount Allowed', 'number', { min: 0 }), f('expiresIn', 'Expires in', 'select', { options: ['Days', 'Months', 'Years'] }), f('expirationNo', 'Expiration No.', 'number', { min: 0 }), f('holdDate', 'Hold Date', 'date'), f('remarks', 'Remarks', 'textarea')],
    filters: ['code', 'name', 'frequency', 'autoRenewal', 'carryForward'],
    validate: draft => draft.endDate && draft.endDate < draft.startDate ? 'End Date cannot be before Start Date.' : draft.maxPerYear && Number(draft.amount) > Number(draft.maxPerYear) ? 'Amount cannot exceed the Maximum Amount Per Year.' : '',
    seed: [{ id: 'bn-1', code: 'MED-01', name: 'Medical Allowance', employeeGroups: ['All Employees'], frequency: 'Yearly', amount: '35000', autoRenewal: 'Yes', carryForward: 'No', startDate: '2026-01-01', endDate: '2026-12-31', maxPerYear: '35000', maxTotal: '35000' }],
  } }],
  leave: [
    { key: 'leave', label: 'Leave', definition: {
      title: 'Leave', singular: 'Leave', storageKey: 'atlas-core-si-leave-v1', uniqueKey: 'code', wideForm: true,
      columns: [c('code', 'Leave Code'), c('type', 'Leave Type'), c('employeeGroups', 'Employee Group', 'multiselect'), c('creditBasis', 'Credit Basis'), c('frequency', 'Frequency'), c('credits', 'Credits'), c('proRated', 'Pro-rated'), c('accrualBasis', 'Accrual Date Basis'), c('accrualAfter', 'Accrual After'), c('isPaid', 'Is Paid')],
      fields: [f('code', 'Leave Code', 'text', { ...req, placeholder: 'Input Code' }), f('type', 'Leave Type', 'select', { ...req, options: ['Vacation Leave', 'Sick Leave', 'Emergency Leave', 'Maternity Leave', 'Paternity Leave', 'Solo Parent Leave', 'Bereavement Leave'] }), f('employeeGroups', 'Employee Group', 'multiselect', { ...req, options: L.employeeGroups }), f('unit', 'Unit', 'select', { ...req, options: ['Days', 'Hours'], default: 'Days' }), f('frequency', 'Frequency', 'select', { ...req, options: ['Monthly', 'Yearly', 'One-time'] }), f('creditBasis', 'Credit Basis', 'select', { ...req, options: ['Fixed', 'Per Tenure'] }), f('credits', 'Credits', 'number', { ...req, min: 0, placeholder: 'Input Number of Leave Credits' }), f('proRated', 'Is Pro-rated?', 'radio', { options: yesNo, default: 'No' }), f('accrualBasis', 'Accrual Date Basis', 'select', { options: ['Hire Date', 'Regularization Date', 'Calendar Year'] }), f('accrualAfter', 'Accrual After', 'text', { placeholder: 'e.g. 6 months' }), f('isPaid', 'Is Paid?', 'radio', { ...req, options: yesNo, default: 'Yes' }), f('advance', 'Is Advance Leave Allowed?', 'radio', { options: yesNo, default: 'No' }), f('cashConvertible', 'Is Cash Convertible?', 'radio', { options: yesNo, default: 'No' }), f('allowNegative', 'Allow Negative Balance', 'radio', { options: yesNo, default: 'No' }), f('autoApproval', 'Auto-approval', 'radio', { options: yesNo, default: 'No' }), f('remarks', 'Remarks', 'textarea')],
      filters: ['code', 'type', 'frequency', 'creditBasis', 'isPaid', 'advance', 'cashConvertible'],
      seed: [{ id: 'lv-1', code: 'VL', type: 'Vacation Leave', employeeGroups: ['All Employees'], unit: 'Days', frequency: 'Yearly', creditBasis: 'Fixed', credits: '15', proRated: 'Yes', accrualBasis: 'Hire Date', accrualAfter: '6 months', isPaid: 'Yes', advance: 'No', cashConvertible: 'Yes', allowNegative: 'No', autoApproval: 'No' }, { id: 'lv-2', code: 'SL', type: 'Sick Leave', employeeGroups: ['All Employees'], unit: 'Days', frequency: 'Yearly', creditBasis: 'Fixed', credits: '15', proRated: 'Yes', accrualBasis: 'Hire Date', accrualAfter: '6 months', isPaid: 'Yes', advance: 'No', cashConvertible: 'No', allowNegative: 'No', autoApproval: 'No' }],
    } },
    { key: 'conversion', label: 'Leave Conversion', definition: {
      title: 'Leave Conversion', singular: 'Leave Cash Conversion', storageKey: 'atlas-core-si-leave-conversion-v1', wideForm: true,
      columns: [c('employeeCode', 'Employee Code'), c('employee', 'Employee Name'), c('leaveType', 'Leave Type'), c('date', 'Conversion Date', 'date'), c('balance', 'Balance as of Date'), c('converted', 'Balance Converted'), c('currency', 'Currency'), c('amount', 'Converted Amount', 'money'), c('carriedOver', 'Carried-Over'), c('expired', 'Expired'), c('batch', 'Payroll Batch / Txn ID'), c('postingDate', 'Payroll Posting Date', 'date'), c('status', 'Status', 'status'), c('remarks', 'Remarks')],
      fields: [f('employee', 'Employee Code / Name', 'select', { ...req, options: L.employees }), f('leaveType', 'Leave Type', 'select', { ...req, options: ['Vacation Leave', 'Sick Leave'] }), f('date', 'Leave Conversion Date', 'date', req), f('balance', 'Balance as of Date', 'number', { ...req, min: 0 }), f('converted', 'Balance Converted', 'number', { ...req, min: 0 }), f('currency', 'Currency', 'select', { options: ['PHP', 'USD'], default: 'PHP' }), f('amount', 'Converted Amount', 'number', { ...req, min: 0 }), f('remarks', 'Remarks', 'textarea')],
      filters: ['employee', 'leaveType', 'status'],
      canEdit: row => row.status === 'Pending Payroll',
      beforeSave: draft => ({ ...draft, employeeCode: draft.employeeCode || `00001${String(L.employees.indexOf(draft.employee) + 12345).padStart(5, '0')}`, carriedOver: Math.max(0, Number(draft.balance) - Number(draft.converted)), expired: 0, status: draft.status || 'Pending Payroll' }),
      validate: draft => Number(draft.converted) > Number(draft.balance) ? 'Balance Converted cannot exceed the Balance as of Date.' : '',
      seed: [],
    } },
  ],
  attendance: [
    { key: 'workHours', label: 'Work Hours Per Day', definition: { title: 'Work Hours Per Day', singular: 'Work Hours Per Day', storageKey: 'atlas-core-si-work-hours-v1', uniqueKey: 'code', columns: [c('code', 'Work Hours Code'), c('hours', 'Number of Work Hours Per Day')], fields: [f('code', 'Work Hours Code', 'text', { ...req, placeholder: 'Input Code' }), f('hours', 'Number of Work Hours Per Day', 'select', { ...req, options: ['4', '6', '8', '9', '10', '12'] })], filters: ['code', 'hours'], seed: [{ id: 'wh-1', code: 'WH-8', hours: '8' }] } },
    { key: 'breaks', label: 'Break Hours Per Day', definition: { title: 'Break Hours Per Day', singular: 'Break Hours Per Day', storageKey: 'atlas-core-si-break-hours-v1', uniqueKey: 'code', columns: [c('code', 'Break Hours Code'), c('name', 'Break Hours Name'), c('start', 'Start Time'), c('end', 'End time')], fields: [f('code', 'Break Hours Code', 'text', { ...req, placeholder: 'Input Code' }), f('name', 'Break Hours Name', 'select', { ...req, options: ['Lunch Break', 'Coffee Break', 'Dinner Break'] }), f('start', 'Start Time', 'time', req), f('end', 'End Time', 'time', req)], filters: ['code', 'name'], validate: draft => draft.end <= draft.start ? 'End Time must be after Start Time.' : '', seed: [{ id: 'br-1', code: 'BR-LUNCH', name: 'Lunch Break', start: '12:00', end: '13:00' }] } },
    { key: 'core', label: 'Core Hours & Days', definition: { title: 'Core Hours & Days', singular: 'Core Hours and Days', storageKey: 'atlas-core-si-core-hours-v1', uniqueKey: 'code', wideForm: true, columns: [c('code', 'Core Hours and Days Code'), c('start', 'Start Time'), c('end', 'End Time'), c('name', 'Core Hours Name'), c('days', 'Core Days Per Week', 'multiselect'), c('halfDay', 'Half-Day Core'), c('occurrence', 'Occurrence')], fields: [f('code', 'Core Hours and Days Code', 'text', { ...req, placeholder: 'Input Code' }), f('start', 'Start Time', 'time', req), f('end', 'End Time', 'time', req), f('name', 'Core Hours Name', 'text', { readOnly: true, placeholder: 'Auto-generated' }), f('days', 'Core Days Per Week', 'multiselect', { ...req, options: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }), f('halfDay', 'Half Day Core Day', 'radio', { options: [...yesNo, 'Custom'], default: 'No' }), f('repeat', 'Repeat Core Day', 'select', { options: ['Week', 'Month', 'Year'] }), f('repeatEvery', 'Repeat every', 'number', { min: 1 }), f('startsOn', 'Starts On', 'date'), f('upTo', 'Up To', 'date')], filters: ['code', 'halfDay'], beforeSave: draft => ({ ...draft, name: `${draft.start}–${draft.end}`, occurrence: draft.repeat ? `Every ${draft.repeatEvery || 1} ${String(draft.repeat).toLowerCase()}` : 'Weekly' }), validate: draft => draft.end <= draft.start ? 'End Time must be after Start Time.' : '', seed: [] } },
    { key: 'shift', label: 'Shift Schedule', definition: { title: 'Shift Schedule', singular: 'Shift Schedule', storageKey: 'atlas-core-si-shift-v1', uniqueKey: 'code', wideForm: true, columns: [c('code', 'Shift Schedule Code'), c('name', 'Shift Hours Name'), c('start', 'Start Time'), c('end', 'End Time'), c('flexible', 'Flexible Time'), c('graceUnit', 'Grace Period Unit'), c('graceNo', 'No. of Grace Period'), c('graceCondition', 'Grace Period Condition Per Day'), c('breakCode', 'Break Hours Code'), c('autoDeduct', 'Auto Deduct Break'), c('workHours', 'Work Hours'), c('days', 'Shift Days Per Week', 'multiselect'), c('restDays', 'Rest Days', 'multiselect'), c('holidayOt', 'Holiday Pay Part of Overtime'), c('holidayCalendar', 'Overtime Pay and Holiday Pay Based On Holiday Calendar')], fields: [f('code', 'Shift Schedule Code', 'text', { ...req, placeholder: 'Input code' }), f('flexible', 'Flexible Time', 'radio', { options: yesNo, default: 'No' }), f('shiftType', 'Shift Type', 'select', { ...req, options: ['Fixed', 'Flexible', 'Rotating', 'Compressed'] }), f('start', 'Start Time', 'time', req), f('end', 'End Time', 'time', req), f('name', 'Shift Hours Name', 'text', { ...req, placeholder: 'Enter Shift Hours Name' }), f('graceUnit', 'Grace Period Unit', 'select', { options: ['Minutes', 'Hours'] }), f('graceNo', 'Number of Grace Period', 'number', { min: 0 }), f('graceCondition', 'Grace Period Condition Per Day', 'select', { options: ['Per occurrence', 'Accumulated per day'] }), f('breakCode', 'Break Hours Code', 'select', { options: ['BR-LUNCH'] }), f('autoDeduct', 'Auto Deduct Break', 'radio', { options: yesNo, default: 'Yes' }), f('workHours', 'Work Hours', 'number', { ...req, min: 1, max: 24 }), f('days', 'Shift Days Per Week', 'multiselect', { ...req, options: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }), f('restDays', 'Rest Days', 'multiselect', { options: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }), f('holidayOt', 'Holiday Pay Part of Overtime', 'radio', { options: yesNo, default: 'No' }), f('holidayCalendar', 'Overtime Pay and Holiday Pay Based on Holiday Calendar', 'radio', { options: yesNo, default: 'Yes' })], filters: ['code', 'flexible', 'autoDeduct'], validate: draft => (draft.days || []).some(day => (draft.restDays || []).includes(day)) ? 'A day cannot be both a shift day and a rest day.' : '', seed: [{ id: 'sh-1', code: 'SH-DAY', flexible: 'No', shiftType: 'Fixed', start: '09:00', end: '18:00', name: 'Day Shift', graceUnit: 'Minutes', graceNo: '15', graceCondition: 'Per occurrence', breakCode: 'BR-LUNCH', autoDeduct: 'Yes', workHours: '8', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], restDays: ['Sat', 'Sun'], holidayOt: 'No', holidayCalendar: 'Yes' }] } },
    { key: 'flexible', label: 'Flexible Time', definition: { title: 'Flexible Time', singular: 'Flexible Time', storageKey: 'atlas-core-si-flexible-v1', uniqueKey: 'code', columns: [c('code', 'Flexible Time Code'), c('startRange', 'Range of work hours start'), c('endRange', 'Range of work hours end'), c('breakRange', 'Range of break hours')], fields: [f('code', 'Flexible Time Code', 'text', { ...req, placeholder: 'Input Code' }), f('startRange', 'Work Hours Start Range', 'text', { ...req, placeholder: 'e.g. 07:00 – 10:00' }), f('endRange', 'Work Hours End Range', 'text', { ...req, placeholder: 'e.g. 16:00 – 19:00' }), f('breakRange', 'Break Hours Range', 'text', { ...req, placeholder: 'e.g. 11:00 – 14:00' })], filters: ['code'], seed: [] } },
    { key: 'rounding', label: 'Rounding Off', render: props => <RoundingOff {...props} /> },
  ],
  overtime: [
    { key: 'rateTable', label: 'Overtime Rate Table', definition: { title: 'Overtime Rate Table', singular: 'Overtime Rate', storageKey: 'atlas-core-si-ot-rates-v1', uniqueKey: 'code', wideForm: true, columns: [c('workDays', 'Work Days Per Year'), c('code', 'Overtime Code'), c('name', 'Overtime Name'), c('description', 'Description'), c('dayType', 'Type of Day'), c('holidayType', 'Holiday Type'), c('status', 'Status', 'status'), c('effectiveDate', 'Effectivity Date', 'date'), c('rate', 'Rate'), c('ndRate', 'Night Shift Differential Rate'), c('excessRate', 'In excess of hours'), c('specialRate', 'Special Case Rate')], fields: [f('workDays', 'Work Days per Year', 'select', { ...req, options: ['261', '313', '365'] }), f('code', 'Overtime Code', 'text', req), f('name', 'Overtime Name', 'text', req), f('description', 'Description', 'textarea'), f('dayType', 'Type of Day', 'select', { ...req, options: ['Regular Day', 'Rest Day', 'Holiday', 'Holiday on Rest Day'] }), f('holidayType', 'Holiday Type', 'select', { options: ['Regular Holiday', 'Special Holiday', 'Double Holiday'], showIf: draft => String(draft.dayType || '').startsWith('Holiday') }), f('rate', 'Rate', 'number', { ...req, min: 0, step: '0.01', placeholder: 'e.g. 1.25' }), f('ndRate', 'Night Shift Differential Rate', 'number', { min: 0, step: '0.01', placeholder: 'e.g. 0.10' }), f('excessRate', 'In excess of hours Rate', 'number', { min: 0, step: '0.01' }), f('specialRate', 'Special case rate', 'number', { min: 0, step: '0.01' }), f('approvalRequired', 'Approval Required?', 'radio', { options: yesNo, default: 'Yes' }), f('effectiveDate', 'Effective Date', 'date', req), f('ndStart', 'Night Differential Start Time', 'time', { default: '22:00' }), f('ndEnd', 'Night Differential End Time', 'time', { default: '06:00' }), f('status', 'Status', 'select', { ...req, options: L.status, default: 'Active' })], filters: ['code', 'name', 'dayType', 'holidayType', 'effectiveDate', 'status'], seed: [{ id: 'ot-1', workDays: '261', code: 'OT-REG', name: 'Regular Day Overtime', dayType: 'Regular Day', rate: '1.25', ndRate: '0.10', excessRate: '1.25', status: 'Active', effectiveDate: '2026-01-01', approvalRequired: 'Yes', ndStart: '22:00', ndEnd: '06:00' }, { id: 'ot-2', workDays: '261', code: 'OT-RD', name: 'Rest Day Overtime', dayType: 'Rest Day', rate: '1.30', ndRate: '0.10', excessRate: '1.69', status: 'Active', effectiveDate: '2026-01-01', approvalRequired: 'Yes', ndStart: '22:00', ndEnd: '06:00' }] } },
    { key: 'minMax', label: 'Minimum and Maximum Hours', definition: { title: 'Minimum and Maximum Hours', singular: 'Minimum and Maximum OT Hours', storageKey: 'atlas-core-si-ot-minmax-v1', columns: [c('min', 'Minimum Number of OT Hours Per Day'), c('max', 'Maximum Number of OT Hours Per Day')], fields: [f('min', 'Minimum OT Hours per Day', 'number', { ...req, min: 0, max: 24 }), f('max', 'Maximum OT Hours per Day', 'number', { ...req, min: 0, max: 24 })], validate: draft => Number(draft.max) < Number(draft.min) ? 'Maximum OT hours cannot be less than the minimum.' : '', canAdd: true, seed: [{ id: 'mm-1', min: '1', max: '4' }] } },
    { key: 'earnings', label: 'Earnings to be Considered', definition: { title: 'Earnings to be Considered', singular: 'Earning to be Considered', storageKey: 'atlas-core-si-ot-earnings-v1', wideForm: true, columns: [c('earningCode', 'Earning Code'), c('eligibility', 'Eligibility'), c('minHours', 'Minimum OT Hours'), c('maxHours', 'Maximum OT Hours'), c('timeStart', 'Time Condition Start Time'), c('timeEnd', 'Time Condition End Time'), c('unit', 'Earning Unit'), c('amount', 'Earning Amount', 'money')], fields: [f('earningCode', 'Earning Code', 'select', { ...req, options: ['MEAL-OT', 'TRANSPO-OT'] }), f('minHours', 'Minimum OT Hours', 'number', { min: 0 }), f('maxHours', 'Maximum OT Hours', 'number', { min: 0 }), f('timeStart', 'Time Condition Start Time', 'time'), f('timeEnd', 'Time Condition End Time', 'time'), f('unit', 'Earning Unit', 'select', { ...req, options: ['Fixed Amount', 'Per Hour'] }), f('amount', 'Earning Amount', 'number', { ...req, min: 0 }), f('eligibility', 'Eligibility', 'select', { ...req, options: ['All Employees', 'Rank and File', 'Supervisors'] })], seed: [] } },
  ],
  payroll: [
    { key: 'payrollRounding', label: 'Rounding Off', render: props => <PayrollRoundingOff {...props} /> },
    { key: 'workDays', label: 'Work Days Per Year', definition: { title: 'Work Days Per Year', singular: 'Work Days Per Year', storageKey: 'atlas-core-si-work-days-v1', uniqueKey: 'code', columns: [c('code', 'Work Days Code'), c('perYear', 'Number of Work Days Per Year'), c('perMonth', 'Number of Work Days Per Month'), c('perWeek', 'Number of Work Days Per Week'), c('perBiWeek', 'Number of Work Days Per Bi-Week'), c('perFourWeek', 'Number of Work Days Per Four-Week')], fields: [f('code', 'Work Days Code', 'text', { ...req, placeholder: 'Input Code' }), f('type', 'Type of Work Days', 'select', { ...req, options: ['5 days a week', '6 days a week', '7 days a week'] }), f('perYear', 'Number of Workdays Per Year', 'select', { ...req, options: ['261', '313', '365'] }), f('perMonth', 'Number of Workdays Per Month', 'number', { ...req, min: 1, max: 31, step: '0.01' }), f('perWeek', 'Number of Workdays Per Week', 'number', { ...req, min: 1, max: 7 }), f('perBiWeek', 'Number of Workdays Per Bi-Week', 'number', { min: 1, max: 14 }), f('perFourWeek', 'Number of Workdays Per Four-Week', 'number', { min: 1, max: 28 })], filters: ['code', 'perYear'], seed: [{ id: 'wd-1', code: 'WD-261', type: '5 days a week', perYear: '261', perMonth: '21.75', perWeek: '5', perBiWeek: '10', perFourWeek: '20' }] } },
    { key: 'paymentMode', label: 'Payment Mode', definition: { title: 'Payment Mode', singular: 'Payment Mode', storageKey: 'atlas-core-si-payment-mode-v1', uniqueKey: 'mode', columns: [c('mode', 'Payment Mode'), c('status', 'Status', 'status')], fields: [f('mode', 'Payment Mode', 'select', { ...req, options: ['Daily', 'Weekly', 'Bi-Weekly', 'Semi-Monthly', 'Monthly'] }), f('status', 'Status', 'select', { ...req, options: L.status, default: 'Active' })], seed: [{ id: 'pm-1', mode: 'Semi-Monthly', status: 'Active' }] } },
    { key: 'paymentType', label: 'Payment Type', definition: { title: 'Payment Type', singular: 'Payment Type', storageKey: 'atlas-core-si-payment-type-v1', uniqueKey: 'type', columns: [c('type', 'Payment Type'), c('status', 'Status', 'status')], fields: [f('type', 'Payment Type', 'select', { ...req, options: ['Bank Transfer', 'Check', 'Cash', 'Electronic Wallet'] }), f('status', 'Status', 'select', { ...req, options: L.status, default: 'Active' })], seed: [{ id: 'pt-1', type: 'Bank Transfer', status: 'Active' }] } },
    { key: 'currency', label: 'Multi Currency', definition: { title: 'Multi Currency', singular: 'Currency', storageKey: 'atlas-core-si-currency-v1', uniqueKey: 'currency', columns: [c('currency', 'Currency'), c('isBase', 'Base Currency'), c('status', 'Status', 'status')], fields: [f('currency', 'Currency', 'select', { ...req, options: ['PHP', 'USD', 'SGD', 'EUR', 'JPY'] }), f('isBase', 'Base Currency', 'radio', { options: yesNo, default: 'No' }), f('status', 'Status', 'select', { ...req, options: L.status, default: 'Active' })], afterSave: (next, saved) => saved.isBase === 'Yes' ? next.map(row => row.currency === saved.currency ? row : { ...row, isBase: 'No' }) : next, seed: [{ id: 'cur-1', currency: 'PHP', isBase: 'Yes', status: 'Active' }] } },
    { key: 'statutory', label: 'Government Statutory', definition: { title: 'Government Statutory', singular: 'Government Statutory', storageKey: 'atlas-core-si-statutory-v1', uniqueKey: 'agency', columns: [c('agency', 'Government Statutory'), c('basis', 'Computation Basis'), c('deductionSchedule', 'Deduction Schedule'), c('status', 'Status', 'status')], fields: [f('agency', 'Government Statutory', 'select', { ...req, options: ['SSS', 'PhilHealth', 'HDMF', 'Withholding Tax'] }), f('basis', 'Computation Basis', 'select', { ...req, options: ['Monthly Basic Pay', 'Gross Pay', 'Fixed Amount'] }), f('deductionSchedule', 'Deduction Schedule', 'select', { ...req, options: ['Every Payroll', 'First Payroll', 'Second Payroll'] }), f('status', 'Status', 'select', { ...req, options: L.status, default: 'Active' })], seed: [{ id: 'gs-1', agency: 'SSS', basis: 'Monthly Basic Pay', deductionSchedule: 'Second Payroll', status: 'Active' }, { id: 'gs-2', agency: 'PhilHealth', basis: 'Monthly Basic Pay', deductionSchedule: 'Second Payroll', status: 'Active' }, { id: 'gs-3', agency: 'HDMF', basis: 'Fixed Amount', deductionSchedule: 'Second Payroll', status: 'Active' }] } },
  ],
};

function RoundingOff({ notify, companyId }) {
  const { actor } = useRole();
  const keys = [['overtime', 'Overtime'], ['absence', 'Absence'], ['tardiness', 'Tardiness'], ['undertime', 'Undertime']];
  const [values, setValues] = useState(() => ({ overtime: 2, absence: 2, tardiness: 2, undertime: 2, ...readScoped('atlas-core-si-rounding-v1', {}, companyId) }));
  const save = () => {
    const bad = keys.find(([key]) => !Number.isInteger(Number(values[key])) || Number(values[key]) < 0 || Number(values[key]) > 6);
    if (bad) return notify({ type: 'error', message: `${bad[1]} Rounding Off Decimal Place must be a whole number from 0 to 6.` });
    writeScoped('atlas-core-si-rounding-v1', values, companyId);
    appendAuditEvent({ companyId, actor, action: 'RoundingOffSaved', entityType: 'Rounding Off', entityId: companyId, summary: keys.map(([key, label]) => `${label} ${values[key]}`).join(', ') });
    return notify({ type: 'success', message: 'Rounding off saved.' });
  };
  return <section className="profile-form-card atlas-settings-card"><h2>Rounding Off</h2><div className="canonical-form-grid">{keys.map(([key, label]) => <label key={key}><span>{label} Rounding Off Decimal Place</span><input type="number" min="0" max="6" value={values[key]} placeholder="Input number of digits you want to round off" onChange={event => setValues({ ...values, [key]: event.target.value })} /></label>)}</div><div className="module-save-row"><button type="button" className="button primary" onClick={save}>Save</button></div></section>;
}

/** Payroll amount decimal places, set per company and kept separate for each pay item. */
const PAYROLL_ROUNDING_ITEMS = [['earnings', 'Earnings'], ['deductions', 'Deductions'], ['loans', 'Company Loans'], ['bonuses', 'Bonuses'], ['basicPay', 'Basic Pay Configuration']];

function PayrollRoundingOff({ notify, companyId }) {
  const { actor } = useRole();
  const [values, setValues] = useState(() => ({ earnings: 2, deductions: 2, loans: 2, bonuses: 2, basicPay: 2, ...readScoped(PAYROLL_ROUNDING_KEY, {}, companyId) }));
  const save = () => {
    const bad = PAYROLL_ROUNDING_ITEMS.find(([key]) => String(values[key]).trim() === '' || !Number.isInteger(Number(values[key])) || Number(values[key]) < 0 || Number(values[key]) > 6);
    if (bad) return notify({ type: 'error', message: `${bad[1]} Decimal Place must be a whole number from 0 to 6.` });
    writeScoped(PAYROLL_ROUNDING_KEY, values, companyId);
    appendAuditEvent({ companyId, actor, action: 'PayrollRoundingOffSaved', entityType: 'Payroll Rounding Off', entityId: companyId, summary: PAYROLL_ROUNDING_ITEMS.map(([key, label]) => `${label} ${values[key]}`).join(', ') });
    return notify({ type: 'success', message: 'Payroll rounding off saved.' });
  };
  return <section className="profile-form-card atlas-settings-card"><h2>Rounding Off</h2><div className="canonical-form-grid">{PAYROLL_ROUNDING_ITEMS.map(([key, label]) => <label key={key}><span>{label} Decimal Place <span className="required">*</span></span><input type="number" min="0" max="6" step="1" value={values[key]} placeholder="Input number of decimal places" onChange={event => setValues({ ...values, [key]: event.target.value })} /></label>)}</div><div className="module-save-row"><button type="button" className="button primary" onClick={save}>Save</button></div></section>;
}

/* --------------------------------------------------------------- screens */

function SubTabs({ tabs, notify, companyId }) {
  const [active, setActive] = useState(tabs[0].key);
  const current = tabs.find(item => item.key === active);
  return <>
    {tabs.length > 1 && <nav className="atlas-subtabs">{tabs.map(item => <button key={item.key} type="button" className={item.key === active ? 'active' : ''} onClick={() => setActive(item.key)}>{item.label}</button>)}</nav>}
    {current.render ? current.render({ notify, companyId }) : <AtlasTable key={`${current.key}:${companyId}`} definition={current.definition} notify={notify} companyId={companyId} />}
  </>;
}

function SectionPage({ title, crumb, onBack, children, guideKey }) {
  return <div className="page-content operational-workspace atlas-page">
    <button className="inline-back" onClick={onBack}><ArrowLeft /> Company Information</button>
    <div className="page-heading"><div><p className="breadcrumb">Company Information / {crumb || title}</p><h1>{title}</h1></div></div>
    {guideKey && <NavigationGuideHost guideKey={guideKey} />}
    {children}
  </div>;
}

function KycDocuments({ company, notify, companyId, onBack, onSaved }) {
  const { actor } = useRole();
  const [state, setState] = useState(() => ({ files: {}, useAlternative: {}, others: [], ...readScoped('atlas-core-ci-kyc-v1', {}, companyId) }));
  const [tab, setTab] = useState('required');
  const [adding, setAdding] = useState(null);
  const [removing, setRemoving] = useState(null);
  const missing = KYC_DOCUMENTS.filter(doc => !state.files[state.useAlternative[doc.key] ? `${doc.key}a` : doc.key]);
  const [warn, setWarn] = useState(missing.length > 0);
  const pick = (key, file) => file && setState(previous => ({ ...previous, files: { ...previous.files, [key]: { name: file.name, size: file.size, uploadedAt: todayIso() } } }));
  const clear = key => setState(previous => { const files = { ...previous.files }; delete files[key]; return { ...previous, files }; });
  const save = () => {
    writeScoped('atlas-core-ci-kyc-v1', state, companyId);
    appendAuditEvent({ companyId, actor, action: 'KycDocumentsSaved', entityType: 'KYC Documents', entityId: company.companyId, summary: `${KYC_DOCUMENTS.length - missing.length} of ${KYC_DOCUMENTS.length} required KYC documents uploaded.` });
    onSaved?.();
    notify({ type: missing.length ? 'error' : 'success', message: missing.length ? `Saved. ${missing.length} required document(s) still missing.` : 'KYC documents saved.' });
  };
  const downloadAll = () => {
    const names = [...Object.values(state.files), ...state.others.map(other => other.file)].filter(Boolean).map(file => file.name);
    if (!names.length) return notify({ type: 'error', message: 'There are no uploaded documents to download yet.' });
    downloadFile(`${company.companyCode || 'company'}-kyc-documents.txt`, names.join('\n'), 'text/plain');
    return notify({ type: 'success', message: `${names.length} document(s) prepared for download.` });
  };
  const fileRow = (key, label, required) => <div key={key} className="atlas-kyc-row">
    <span>{label}{required && <span className="required">*</span>}</span>
    <div className="atlas-kyc-file"><input type="file" aria-label={label} onChange={event => pick(key, event.target.files?.[0])} /><em>{state.files[key]?.name || 'No file chosen'}</em>{state.files[key] && <><button type="button" className="button secondary" onClick={() => downloadFile(state.files[key].name, `${label}\n${state.files[key].name}`, 'text/plain')}>Download</button><button type="button" className="icon-button" aria-label={`Remove ${label}`} onClick={() => clear(key)}><Trash /></button></>}</div>
  </div>;
  return <SectionPage title="KYC Documents" crumb="Setup & Verification / KYC Documents" onBack={onBack}>
    <div className="config-toolbar atlas-toolbar"><nav className="employee-tabs atlas-tabs">{[['required', 'Required Documents'], ['others', 'Other Compliance Documents']].map(([key, label]) => <button key={key} className={key === tab ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</nav><div className="toolbar-spacer" /><button type="button" className="button primary" onClick={downloadAll}><DownloadSimple /> Download All</button></div>
    {tab === 'required' && <section className="profile-form-card atlas-settings-card">
      <p className="page-description">Upload the required documents as these are essential for establishing a secure and compliant business relationship.</p>
      {KYC_DOCUMENTS.map(doc => <div key={doc.key}>
        {state.useAlternative[doc.key] ? fileRow(`${doc.key}a`, doc.alternative, true) : fileRow(doc.key, doc.label, true)}
        {doc.alternative && <label className="atlas-check atlas-kyc-optional"><input type="checkbox" checked={Boolean(state.useAlternative[doc.key])} onChange={event => setState(previous => ({ ...previous, useAlternative: { ...previous.useAlternative, [doc.key]: event.target.checked } }))} /> Optional — use the alternative document</label>}
      </div>)}
      <div className="module-save-row"><button type="button" className="button secondary" onClick={onBack}>Cancel</button><button type="button" className="button primary" onClick={save}>Save</button></div>
    </section>}
    {tab === 'others' && <section className="profile-form-card atlas-settings-card">
      <div className="config-toolbar atlas-toolbar"><h2>Other Compliance Documents</h2><div className="toolbar-spacer" /><button type="button" className="button primary" onClick={() => setAdding({ title: '', reason: '', file: null })}><Plus /> Add Other Compliance Document</button></div>
      {state.others.length ? state.others.map(other => <div key={other.id} className="atlas-kyc-row"><span>{other.title}<small>{other.reason}</small></span><div className="atlas-kyc-file"><em>{other.file?.name || 'No file chosen'}</em><button type="button" className="icon-button" aria-label={`Remove ${other.title}`} onClick={() => setRemoving({ other, reason: '' })}><Trash /></button></div></div>) : <p className="page-description">No other compliance documents yet.</p>}
      <div className="module-save-row"><button type="button" className="button primary" onClick={save}>Save</button></div>
    </section>}
    {adding && <FormDialog title="Add Other Compliance Document" fields={[{ key: 'title', label: 'Title', required: true, placeholder: 'Input title' }, { key: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'Reason' }, { key: 'file', label: 'Document', type: 'file', required: true }]} draft={adding} setDraft={setAdding} onClose={() => setAdding(null)} onSubmit={() => { if (!adding.title?.trim() || !adding.reason?.trim() || !adding.file) return notify({ type: 'error', message: 'Title, Reason and the document are required.' }); setState(previous => ({ ...previous, others: [...previous.others, { ...adding, id: `kyc-other-${Date.now()}`, title: adding.title.trim() }] })); setAdding(null); }} />}
    {removing && <FormDialog title="Remove Other Compliance Documents" fields={[{ key: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'Reason' }]} draft={removing} setDraft={setRemoving} onClose={() => setRemoving(null)} submitLabel="Remove" onSubmit={() => { if (!removing.reason?.trim()) return notify({ type: 'error', message: 'A reason is required to remove a document.' }); setState(previous => ({ ...previous, others: previous.others.filter(other => other.id !== removing.other.id) })); appendAuditEvent({ companyId, actor, action: 'KycDocumentRemoved', entityType: 'KYC Documents', entityId: removing.other.title, summary: `Removed: ${removing.reason.trim()}` }); setRemoving(null); }} />}
    {warn && <div className="modal-backdrop"><section className="modal canonical-modal atlas-dialog" role="alertdialog" aria-label="Incomplete KYC Documents"><header><h2>Incomplete KYC Documents</h2></header><div className="modal-body"><p>Your uploaded documents are not complete. Please upload all required documents.</p></div><footer className="modal-actions"><button type="button" className="button primary" onClick={() => setWarn(false)}>OK</button></footer></section></div>}
  </SectionPage>;
}

function SetupAndVerification({ company, onSaveCompany, notify, companyId, onBack }) {
  const [kycOpen, setKycOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [required, setRequired] = useState(() => readScoped('atlas-core-ci-kyc-required-v1', { required: true }, companyId).required);
  if (kycOpen) return <KycDocuments company={company} notify={notify} companyId={companyId} onBack={() => setKycOpen(false)} />;
  return <SectionPage title="Setup & Verification" onBack={onBack} guideKey="Company Information">
    <section className="profile-form-card atlas-settings-card"><div className="config-toolbar atlas-toolbar"><h2>Company Code Setup</h2><div className="toolbar-spacer" /><button type="button" className="button secondary" onClick={() => setEditing({ code: company.companyCode || '' })}>Edit</button></div><p><strong>Company Code:</strong> {company.companyCode || '—'}</p></section>
    <section className="profile-form-card atlas-settings-card"><h2>KYC Documents</h2><p className="page-description">Provide the required files</p>
      <button type="button" className="atlas-link-row" onClick={() => setKycOpen(true)}><span>Upload KYC Documents</span><ArrowRight /></button>
      <label className="atlas-check"><input type="checkbox" checked={required} onChange={event => { setRequired(event.target.checked); writeScoped('atlas-core-ci-kyc-required-v1', { required: event.target.checked }, companyId); }} /> KYC Documents required</label>
    </section>
    {editing && <FormDialog title="Company Code Setup" fields={[{ key: 'code', label: 'Company Code', required: true, placeholder: 'Enter your 6 alphanumeric code', hint: 'Users type this code on the sign-in page.' }]} draft={editing} setDraft={setEditing} onClose={() => setEditing(null)} onSubmit={() => {
      const code = String(editing.code || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return notify({ type: 'error', message: 'Company Code must be exactly 6 letters or digits.' });
      onSaveCompany({ ...company, companyCode: code });
      setEditing(null);
      return notify({ type: 'success', message: 'Company Code saved.' });
    }} />}
  </SectionPage>;
}

const profileFields = [f('legalName', 'Company Name', 'text', { ...req, placeholder: 'Company name' }), f('displayName', 'Display Name', 'text', { ...req, placeholder: 'Display Name' }), f('status', 'Status', 'select', { ...req, options: L.status }), f('interfaceLogo', 'Interface Logo', 'file', { ...req, accept: '.png,.jpg,.jpeg,.svg' }), f('payslipLogo', 'Payslip Logo', 'file', { accept: '.png,.jpg,.jpeg,.svg' }), f('lettersLogo', 'Letters Logo', 'file', { ...req, accept: '.png,.jpg,.jpeg,.svg' }), f('industryGroup', 'Industry Group', 'select', { options: L.industryGroups }), f('industry', 'Industry Name', 'select', { options: L.industries }), f('businessType', 'Business Type', 'select', { options: L.businessTypes }), f('office', 'Office Location', 'select', { options: L.offices }), f('secName', 'Registered Company Name in SEC Registration', 'text'), f('secNumber', 'SEC Number', 'text', { placeholder: 'Input SEC number' }), f('secDate', 'Date of Registration from SEC', 'date'), f('secPlace', 'Place of Registration from SEC', 'text'), f('accountingYear', 'Accounting Year', 'select', { options: ['2025', '2026', '2027'] }), f('accountingPeriod', 'Accounting Period', 'select', { options: L.accountingPeriods })];

function BasicInformation({ company, onSaveCompany, notify, companyId, onBack }) {
  const { actor } = useRole();
  const stored = readScoped('atlas-core-ci-profile-v1', {}, companyId);
  const profile = { legalName: company.legalName || '', displayName: company.displayName || '', status: company.lifecycleStatus === 'Inactive' ? 'Inactive' : 'Active', industry: company.industry || '', businessType: company.businessType || '', ...stored };
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState('profile');
  const save = () => {
    const missing = profileFields.find(field => field.required && !editing[field.key]);
    if (missing) return notify({ type: 'error', message: `${missing.label} is required.` });
    writeScoped('atlas-core-ci-profile-v1', editing, companyId);
    onSaveCompany({ ...company, legalName: editing.legalName.trim(), displayName: editing.displayName.trim(), industry: editing.industry, businessType: editing.businessType });
    appendAuditEvent({ companyId, actor, action: 'CompanyProfileSaved', entityType: 'Basic Information', entityId: company.companyId, summary: `Company profile saved for ${editing.displayName}.` });
    setEditing(null);
    return notify({ type: 'success', message: 'Basic information saved.' });
  };
  return <SectionPage title="Basic Information" onBack={onBack}>
    <nav className="employee-tabs atlas-tabs">{[['profile', 'Company Profile'], ['government', 'Government Information']].map(([key, label]) => <button key={key} className={key === view ? 'active' : ''} onClick={() => setView(key)}>{label}</button>)}</nav>
    {view === 'profile' && <section className="profile-form-card atlas-settings-card">
      <div className="config-toolbar atlas-toolbar"><div><h2>Company Profile</h2><p className="page-description">Manage the basic information associated with your company.</p></div><div className="toolbar-spacer" /><button type="button" className="button primary" onClick={() => setEditing({ ...profile })}>Edit</button></div>
      <dl className="atlas-view-list two-col">{profileFields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{field.type === 'file' ? profile[field.key]?.name || '—' : field.type === 'date' ? profile[field.key] || '—' : profile[field.key] || '—'}</dd></div>)}</dl>
    </section>}
    {view === 'government' && <SubTabs tabs={[{ key: 'bir', label: 'BIR', definition: birTable }, { key: 'sss', label: 'SSS', definition: sssTable }, { key: 'phic', label: 'PhilHealth', definition: philHealthTable }, { key: 'hdmf', label: 'HDMF', definition: hdmfTable }].map(item => ({ ...item, render: props => <GovernmentTable {...props} definition={item.definition} company={company} onSaveCompany={onSaveCompany} /> }))} notify={notify} companyId={companyId} />}
    {editing && <FormDialog title="Edit Basic Information" wide fields={profileFields} draft={editing} setDraft={setEditing} onClose={() => setEditing(null)} onSubmit={save} />}
  </SectionPage>;
}

/** The BIR table also keeps the company record's TIN in step with its first row. */
function GovernmentTable({ definition, company, onSaveCompany, notify, companyId }) {
  const [rows, setRows] = useState(() => readScoped(definition.storageKey, definition.storageKey.includes('bir') && company.tin ? [{ id: 'bir-seed', tin: company.tin, rdo: company.profile?.birRdo || '', rdoLocation: '', branchCode: '000', filingForms: ['1601-C'], filingOption: 'Online', taxGroup: 'Medium Taxpayer', taxPayer: 'Medium Taxpayer' }] : [], companyId));
  const update = next => {
    setRows(next); writeScoped(definition.storageKey, next, companyId);
    if (definition.storageKey.includes('bir') && next[0]?.tin && next[0].tin !== company.tin) onSaveCompany({ ...company, tin: next[0].tin });
  };
  return <AtlasTable definition={{ ...definition, heading: definition.title }} notify={notify} companyId={companyId} rows={rows} setRows={update} />;
}

function ContactInformation({ notify, companyId, onBack }) {
  return <SectionPage title="Contact Information" onBack={onBack}>
    {[addressTable, phoneTable, emailTable, websiteTable].map(definition => <AtlasTable key={definition.storageKey} definition={definition} notify={notify} companyId={companyId} />)}
  </SectionPage>;
}

const bankFromCompany = company => (company.bankAccounts || []).map((account, index) => ({ id: account.bankAccountId || `bank-${index}`, bankName: account.bankName || '', accountNumber: account.accountNumber || '', branchName: account.branch || '', accountType: L.accountTypes.includes(account.accountType) ? account.accountType : 'Current', bankCompanyCode: account.bankCompanyCode || '', country: 'Philippines', isDefault: Boolean(account.isDefault) }));
const bankToCompany = (rows, company) => rows.map(row => { const before = (company.bankAccounts || []).find(account => account.bankAccountId === row.id) || {}; return { ...before, bankAccountId: row.id, bankName: row.bankName, accountName: before.accountName || company.legalName, accountNumber: row.accountNumber, branch: row.branchName, accountType: row.accountType, bankCompanyCode: row.bankCompanyCode, paymentMode: before.paymentMode || 'Bank Transfer', isDefault: Boolean(row.isDefault), status: before.status || 'Active', effectiveFrom: before.effectiveFrom || todayIso() }; });

function BankManagement({ company, onSaveCompany, notify, companyId, onBack }) {
  const [rows, setRows] = useState(() => readScoped(bankTable.storageKey, bankFromCompany(company), companyId));
  const update = next => { setRows(next); writeScoped(bankTable.storageKey, next, companyId); onSaveCompany({ ...company, bankAccounts: bankToCompany(next, company) }); };
  return <SectionPage title="Bank Management" onBack={onBack}><AtlasTable definition={bankTable} notify={notify} companyId={companyId} rows={rows} setRows={update} /></SectionPage>;
}

function ServicesInformation({ notify, companyId, onBack, payrollConfiguration }) {
  const tabs = [['benefits', 'Benefits Management'], ['leave', 'Leave Management'], ['attendance', 'Time and Attendance'], ['overtime', 'Overtime'], ['payroll', 'Payroll Information'], ...(payrollConfiguration ? [['payrollConfiguration', 'Payroll Configuration']] : [])];
  const [active, setActive] = useState('benefits');
  return <SectionPage title="Services Information" onBack={onBack}>
    <nav className="employee-tabs atlas-tabs">{tabs.map(([key, label]) => <button key={key} className={key === active ? 'active' : ''} onClick={() => setActive(key)}>{label}</button>)}</nav>
    {active === 'payrollConfiguration' ? payrollConfiguration : <SubTabs key={active} tabs={servicesTabs[active]} notify={notify} companyId={companyId} />}
  </SectionPage>;
}

const contactsFromCompany = company => (company.authorizedContacts || []).map((contact, index) => ({ id: contact.contactPersonId || `cp-${index}`, date: contact.effectiveFrom || todayIso(), isEmployee: 'No', name: contact.person, jobTitle: contact.role, roles: [contact.role].filter(role => L.userRoles.includes(role)), email: contact.email, mobile: contact.mobile, remarks: contact.responsibility || '' }));
const signatoriesFromCompany = company => (company.signatories || []).map((signatory, index) => ({ id: signatory.signatoryId || `sg-${index}`, assignmentDate: signatory.effectiveFrom || todayIso(), salutation: 'Ms.', employee: signatory.person, jobTitle: signatory.title, role: L.signatoryRoles.includes(signatory.approvalRole) ? signatory.approvalRole : 'Final payroll approver', signature: signatory.signatureDocumentId ? { name: signatory.signatureDocumentId } : null, employeeGroups: ['All Employees'] }));

function AuthorizedRepresentative({ company, onSaveCompany, notify, companyId, onBack }) {
  const [contacts, setContacts] = useState(() => readScoped(contactPersonTable.storageKey, contactsFromCompany(company), companyId));
  const [signatories, setSignatories] = useState(() => readScoped(signatoryTable.storageKey, signatoriesFromCompany(company), companyId));
  const saveContacts = next => { setContacts(next); writeScoped(contactPersonTable.storageKey, next, companyId); onSaveCompany({ ...company, authorizedContacts: next.map(row => ({ contactPersonId: row.id, person: row.name, role: (row.roles || [])[0] || row.jobTitle || '', responsibility: row.remarks || '', email: row.email, mobile: row.mobile, effectiveFrom: row.date, status: 'Active' })) }); };
  const saveSignatories = next => { setSignatories(next); writeScoped(signatoryTable.storageKey, next, companyId); onSaveCompany({ ...company, signatories: next.map(row => ({ signatoryId: row.id, person: row.employee, title: row.jobTitle, approvalRole: row.role, email: '', signatureDocumentId: row.signature?.name || '', effectiveFrom: row.assignmentDate, status: 'Active' })) }); };
  return <SectionPage title="Authorized Representative" onBack={onBack}>
    <SubTabs tabs={[
      { key: 'contact', label: 'Contact Person', render: props => <AtlasTable {...props} definition={contactPersonTable} rows={contacts} setRows={saveContacts} /> },
      { key: 'approver', label: 'Approver', definition: approverTable },
      { key: 'signatory', label: 'Signatory', render: props => <AtlasTable {...props} definition={signatoryTable} rows={signatories} setRows={saveSignatories} /> },
    ]} notify={notify} companyId={companyId} />
  </SectionPage>;
}

/* ---------------------------------------------------------------- landing */

const SECTIONS = [
  { key: 'setup', label: 'Setup & Verification', icon: ShieldCheck },
  { key: 'basic', label: 'Basic Information', icon: Buildings },
  { key: 'contact', label: 'Contact Information', progressLabel: 'Contact Details', icon: Phone },
  { key: 'bank', label: 'Bank Management', icon: Bank },
  { key: 'services', label: 'Services Information', icon: Wrench },
  { key: 'authorized', label: 'Authorized Representative', icon: UserFocus },
  { key: 'employee', label: 'Employee Information', icon: IdentificationCard, notInProgress: true },
];

function sectionDone(key, company, companyId) {
  const has = storageKey => (readScoped(storageKey, [], companyId) || []).length > 0;
  if (key === 'setup') { const kyc = readScoped('atlas-core-ci-kyc-v1', { files: {}, useAlternative: {} }, companyId); return Boolean(company.companyCode) && KYC_DOCUMENTS.every(doc => kyc.files?.[kyc.useAlternative?.[doc.key] ? `${doc.key}a` : doc.key]); }
  if (key === 'basic') return Boolean(company.legalName && company.displayName) && (has(birTable.storageKey) || Boolean(company.tin));
  if (key === 'contact') return has(addressTable.storageKey) && has(phoneTable.storageKey);
  if (key === 'bank') return has(bankTable.storageKey) || (company.bankAccounts || []).length > 0;
  if (key === 'services') return has('atlas-core-si-work-days-v1') && has('atlas-core-si-leave-v1');
  if (key === 'authorized') return has(signatoryTable.storageKey) || (company.signatories || []).length > 0;
  return false;
}

export function CompanyInformationScreen({ company, onSaveCompany, notify, companyId, payrollConfiguration, onOpenEmployeeMasterfile }) {
  const [open, setOpen] = useState(null);
  const progress = useMemo(() => SECTIONS.filter(section => !section.notInProgress).map(section => ({ ...section, done: sectionDone(section.key, company, companyId) })), [company, companyId, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const percent = Math.round((progress.filter(item => item.done).length / SECTIONS.length) * 10000) / 100;
  const props = { company, onSaveCompany, notify, companyId, onBack: () => setOpen(null) };
  if (open === 'setup') return <SetupAndVerification {...props} />;
  if (open === 'basic') return <BasicInformation {...props} />;
  if (open === 'contact') return <ContactInformation {...props} />;
  if (open === 'bank') return <BankManagement {...props} />;
  if (open === 'services') return <ServicesInformation {...props} payrollConfiguration={payrollConfiguration} />;
  if (open === 'authorized') return <AuthorizedRepresentative {...props} />;
  return <div className="page-content operational-workspace atlas-page">
    <div className="page-heading"><div><p className="breadcrumb">Core / Company Configuration</p><h1>Company Information</h1></div></div>
    <NavigationGuideHost guideKey="Company Information" />
    <div className="atlas-ci-layout">
      <div className="atlas-ci-cards">{SECTIONS.map(section => { const Icon = section.icon; return <button key={section.key} type="button" className="atlas-ci-card" onClick={() => section.key === 'employee' ? onOpenEmployeeMasterfile?.() : setOpen(section.key)}><Icon size={26} /><span>{section.label}</span><ArrowRight /></button>; })}</div>
      <aside className="atlas-ci-progress"><h2>Your Progress</h2><div className="atlas-progress-bar" aria-label={`${percent}% complete`}><i style={{ width: `${percent}%` }} /><b>{percent}%</b></div><ul>{progress.map(item => <li key={item.key} className={item.done ? 'done' : ''}>{item.done ? <CheckCircle weight="fill" /> : <Circle />}{item.progressLabel || item.label}</li>)}</ul></aside>
    </div>
  </div>;
}
