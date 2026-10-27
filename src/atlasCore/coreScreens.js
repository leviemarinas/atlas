/**
 * Atlas Core configuration screens described as data for AtlasTable. Columns,
 * form fields, filters and dropdown values follow Atlas Core (core-development,
 * the code QA runs); the lookup values come from AtlasCoreDb.
 */
import { todayIso } from './dates.js';

const f = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const c = (key, label, type, extra = {}) => ({ key, label, type, ...extra });
const req = { required: true };
const yesNo = ['Yes', 'No'];

export const LOOKUPS = {
  years: () => { const year = new Date().getFullYear(); return [year - 1, year, year + 1].map(String); },
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  payoutTypes: ['Regular', 'Special'],
  paymentModes: ['Daily', 'Weekly', 'Bi-Weekly', 'Semi-Monthly', 'Monthly', 'Four-weekly', 'Quarterly', 'Yearly', 'Hourly', 'Fixed rate', 'Piece-rate'],
  paymentFrequencies: ['Every Payroll', 'First Payroll', 'Second Payroll', 'Third Payroll', 'First Half', 'Second Half', 'Monthly', 'Quarterly', 'Yearly'],
  currencies: ['PHP', 'USD', 'SGD', 'EUR', 'JPY'],
  calendarStatuses: ['Open', 'Posted'],
  holidayTypes: ['Regular Holiday', 'Special Holiday', 'Special Worked Day', 'Legal Holiday on Rest Day', 'Special Holiday on Rest Day'],
  holidayGroups: ['National', 'NCR', 'Makati Local', 'Cebu Local'],
  agencies: ['SSS', 'PHIC', 'HDMF', 'BIR'],
  filingTypes: { SSS: ['Contributions (SSS)', 'Loans (SSS)'], PHIC: ['Contributions (PHIC)'], HDMF: ['Contributions (HDMF)', 'Loans (HDMF)'], BIR: ['0619-E', '0619-F', '1601-C', '1601-EQ', '1601-FQ', '1604-C', '1604-E', '1604-F'] },
  deadlineTypes: ['Filing', 'Payment'],
  onlineManual: ['Online', 'Manual'],
  processCategories: ['Timekeeping', 'Payroll Processing', 'Approval', 'Disbursement', 'Statutory'],
  timelines: ['T-5', 'T-4', 'T-3', 'T-2', 'T-1', 'T (Payout Day)', 'T+1'],
  departments: ['Human Resources', 'Finance', 'IT Department', 'Operations', 'Sales'],
  jobTitles: ['Payroll Specialist', 'HR Officer', 'IT Manager', 'Software Engineer', 'Accountant'],
  documentTypes: ['Job Offer', 'Employment Contract', 'Non-Disclosure Agreement', 'Company Policy', 'Data Privacy Consent'],
  employeeGroups: ['All Employees', 'Rank and File', 'Supervisors', 'Managers', 'IT Department', 'Finance'],
  employees: ['John Collins Doe', 'Ethan Collins', 'Sophia Ramirez', 'Liam Johnson', 'Olivia Bennett', 'Noah Carter'],
  clients: ['ABC Company Ltd', 'Northstar Holdings', 'Globex Philippines'],
  projects: ['Atlas Phase 2', 'Payroll Migration', 'HR Transformation'],
  notificationFeatures: ['Approver', 'Articles', 'Authorized Representative', 'Bank Management', 'Basic Information', 'Break Hours Per Day', 'Calendar', 'Company Information', 'Contact Information', 'Contact Person', 'Core Hours & Days', 'Events', 'Flexible Time', 'Happiness Meter', 'Holidays', 'Leave Accrual', 'Leave Application', 'Leave Conversion', 'Official Business Application', 'Official Business Approval', 'Payroll Payout', 'Resignation', 'Rounding Off', 'Security Configuration', 'Services Information', 'Setup & Verification', 'Shift Change Application', 'Shift Schedule', 'Signatory', 'Time Off', 'Time Off Approval', 'Work Hours Per Day'],
  notificationChannels: ['Email', 'In-App', 'SMS'],
  notificationFrequencies: ['Everyday', 'Weekly', 'Bi-Weekly', 'Monthly', 'Quarterly'],
  notificationTimings: ['Any activity in the organization', 'Any activity related to the assigned employee/s', 'Any activity related to the employee', "Any activity related to the employee's team"],
  notificationReceivers: ['Administrator', 'All Users', 'Employee', 'Manager', 'Others'],
  priorityLevels: ['Low', 'Medium', 'High', 'Critical'],
  navigationFeatures: ['Company Information', 'Calendar Settings', 'Employee Masterfile', 'Security Configuration', 'Access Right Configuration', 'Reference Table', 'Employee Onboarding', 'Notifications', 'Happiness Meter', 'Wellness and Events', 'Tickets', 'Audit Log'],
  navigationAudiences: ['All', 'Filter By', 'None'],
  navigationStatuses: ['Draft', 'Published', 'Scheduled'],
  navigationTypes: ['Navigation Guide', 'FAQ'],
  services: ['Core', 'HRM', 'Timekeeping', 'Payroll'],
  roleUserTypes: ['Employee', 'Approver', 'Client Admin', 'P&A Admin'],
  roleModules: ['Company Configuration', 'Employee Masterfile', 'Access Right Configuration', 'Security Configuration', 'Reference Table', 'Employee Self-Service', 'Manage Approvals', 'Benefits', 'Time In & Time Out', 'Overtime Summary', 'Statutory Tables', 'Tax Tables'],
  accessLevels: ['View', 'Add', 'Edit', 'Delete', 'Download', 'Approve'],
  roleCodes: ['CLIENT_ADMIN', 'ESS-001', 'ESS-002', 'ESS-003', 'MA-001', 'MA-002', 'MA-003', 'MA-004'],
  contentStatuses: ['Draft', 'For Approval', 'Published', 'Rejected'],
};

/* ---------------------------------------------------- Calendar Settings */

export const payrollPayout = {
  title: 'Payroll Payout', singular: 'Payroll Payout', storageKey: 'atlas-core-cal-payout-v1', codeKey: 'reference', codePrefix: `PP-${new Date().getFullYear()}-`, codeDigits: 4,
  columns: [c('reference', 'Transaction Ref No.'), c('year', 'Year'), c('month', 'Month'), c('payoutType', 'Payout Type'), c('paymentMode', 'Payment Mode'), c('paymentFrequency', 'Payment Frequency'), c('currency', 'Payment Currency'), c('paymentDate', 'Payment Date', 'date'), { key: 'period', label: 'Period Start-End', render: row => `${row.periodStart || '—'} – ${row.periodEnd || '—'}` }, { key: 'cutoff', label: 'Cutoff Start-End', render: row => `${row.cutoffStart || '—'} – ${row.cutoffEnd || '—'}` }, c('tkAdjustment', 'Timekeeping Adjustment', 'date'), c('autoComputeDate', 'Auto Compute Date', 'date'), c('status', 'Calendar Status', 'status'), c('remarks', 'Remarks')],
  fields: [f('reference', 'Transaction Reference Number', 'text', { readOnly: true, placeholder: 'Auto-generated' }), f('year', 'Year', 'select', { ...req, options: LOOKUPS.years }), f('month', 'Month', 'select', { ...req, options: LOOKUPS.months }), f('payoutType', 'Payout Type', 'select', { ...req, options: LOOKUPS.payoutTypes }), f('paymentMode', 'Payment Mode', 'select', { ...req, options: LOOKUPS.paymentModes }), f('paymentFrequency', 'Payment Frequency', 'select', { ...req, options: LOOKUPS.paymentFrequencies }), f('currency', 'Payment Currency', 'select', { ...req, options: LOOKUPS.currencies, default: 'PHP' }), f('paymentDate', 'Payment Date', 'date', req), f('periodStart', 'Payroll Period Start', 'date', req), f('periodEnd', 'Payroll Period End', 'date', req), f('cutoffStart', 'Timekeeping Cut-off Start', 'date', req), f('cutoffEnd', 'Timekeeping Cut-off End', 'date', req), f('tkAdjustment', 'Timekeeping Adjustment', 'date', req), f('autoComputeDate', 'Auto Compute Date', 'date'), f('status', 'Calendar Status', 'select', { ...req, options: LOOKUPS.calendarStatuses, default: 'Open' }), f('remarks', 'Remarks', 'textarea')],
  filters: ['reference', 'year', 'month', 'payoutType', 'paymentMode', 'paymentFrequency', 'currency', 'status'],
  canEdit: row => row.status !== 'Posted',
  validate: draft => draft.periodEnd < draft.periodStart ? 'Payroll Period end cannot be before its start.' : draft.cutoffEnd < draft.cutoffStart ? 'Timekeeping Cut-off end cannot be before its start.' : '',
  seed: [
    { id: 'pp-1', reference: 'PP-2026-0019', year: '2026', month: 'October', payoutType: 'Regular', paymentMode: 'Semi-Monthly', paymentFrequency: 'First Payroll', currency: 'PHP', paymentDate: '2026-10-15', periodStart: '2026-10-01', periodEnd: '2026-10-15', cutoffStart: '2026-09-26', cutoffEnd: '2026-10-10', tkAdjustment: '2026-10-11', autoComputeDate: '2026-10-12', status: 'Posted', remarks: '' },
    { id: 'pp-2', reference: 'PP-2026-0020', year: '2026', month: 'October', payoutType: 'Regular', paymentMode: 'Semi-Monthly', paymentFrequency: 'Second Payroll', currency: 'PHP', paymentDate: '2026-10-30', periodStart: '2026-10-16', periodEnd: '2026-10-31', cutoffStart: '2026-10-11', cutoffEnd: '2026-10-25', tkAdjustment: '2026-10-26', autoComputeDate: '2026-10-27', status: 'Open', remarks: '' },
  ],
};

export const payrollProcessCalendar = {
  title: 'Payroll Process Calendar', singular: 'Payroll Process', storageKey: 'atlas-core-cal-process-v1',
  columns: [c('payout', 'Payroll Payout Transaction'), c('period', 'Payroll Period'), c('category', 'Category'), c('timeline', 'Timeline'), c('process', 'Process'), c('responsible', 'Responsible'), { key: 'when', label: 'Date & Time', render: row => `${row.date || '—'} ${row.time || ''}`.trim() }, c('status', 'Status', 'status')],
  fields: [f('payout', 'Payroll Payout Transaction', 'select', { ...req, options: ['PP-2026-0019', 'PP-2026-0020'] }), f('period', 'Payroll Period', 'text', { placeholder: 'e.g. 10/16/2026 – 10/31/2026' }), f('category', 'Category', 'select', { ...req, options: LOOKUPS.processCategories }), f('timeline', 'Timeline', 'select', { ...req, options: LOOKUPS.timelines }), f('process', 'Process', 'text', { ...req, placeholder: 'Input process description' }), f('responsible', 'Responsible', 'text', { ...req, placeholder: 'Input responsible person or team' }), f('date', 'Date', 'date', req), f('time', 'Time', 'time'), f('status', 'Status', 'select', { options: ['Pending', 'Done', 'Overdue'], default: 'Pending' }), f('remarks', 'Remarks', 'textarea', { placeholder: 'Input remarks (up to 300 characters)' })],
  filters: ['payout', 'category', 'timeline', 'process', 'responsible', 'status'],
  seed: [
    { id: 'pc-1', payout: 'PP-2026-0020', period: '10/16/2026 – 10/31/2026', category: 'Timekeeping', timeline: 'T-5', process: 'Timekeeping cut-off and validation', responsible: 'HR Timekeeping', date: '2026-10-25', time: '17:00', status: 'Pending' },
    { id: 'pc-2', payout: 'PP-2026-0020', period: '10/16/2026 – 10/31/2026', category: 'Payroll Processing', timeline: 'T-3', process: 'Initial payroll computation', responsible: 'P&A Payroll Team', date: '2026-10-27', time: '12:00', status: 'Pending' },
    { id: 'pc-3', payout: 'PP-2026-0020', period: '10/16/2026 – 10/31/2026', category: 'Approval', timeline: 'T-2', process: 'Client approval of payroll register', responsible: 'Client Admin', date: '2026-10-28', time: '17:00', status: 'Pending' },
  ],
};

export const timekeepingCalendar = {
  title: 'Timekeeping', singular: 'Timekeeping', storageKey: 'atlas-core-cal-tk-v1', codeKey: 'reference', codePrefix: `TK-${new Date().getFullYear()}-`, codeDigits: 4,
  columns: [c('reference', 'Transaction Ref. No.'), c('year', 'Year'), c('month', 'Month'), c('paymentMode', 'Payment Mode'), c('paymentFrequency', 'Payment Frequency'), { key: 'cutoff', label: 'Cutoff Start-End', render: row => `${row.cutoffStart || '—'} – ${row.cutoffEnd || '—'}` }, c('tkAdjustment', 'Timekeeping Adjustment', 'date'), c('autoComputeDate', 'Auto Compute Date', 'date'), c('status', 'Calendar Status', 'status'), c('remarks', 'Remarks')],
  fields: [f('reference', 'Transaction Reference Number', 'text', { readOnly: true, placeholder: 'Auto-generated' }), f('year', 'Year', 'select', { ...req, options: LOOKUPS.years }), f('month', 'Month', 'select', { ...req, options: LOOKUPS.months }), f('paymentMode', 'Payment Mode', 'select', { ...req, options: LOOKUPS.paymentModes }), f('paymentFrequency', 'Payment Frequency', 'select', { ...req, options: LOOKUPS.paymentFrequencies }), f('cutoffStart', 'Timekeeping Cut-off Start', 'date', req), f('cutoffEnd', 'Timekeeping Cut-off End', 'date', req), f('tkAdjustment', 'Timekeeping Adjustment', 'date', req), f('autoComputeDate', 'Auto Compute Date', 'date'), f('status', 'Calendar Status', 'select', { ...req, options: LOOKUPS.calendarStatuses, default: 'Open' }), f('remarks', 'Remarks', 'textarea')],
  filters: ['year', 'month', 'paymentMode', 'paymentFrequency', 'status'],
  canEdit: row => row.status !== 'Posted',
  validate: draft => draft.cutoffEnd < draft.cutoffStart ? 'Timekeeping Cut-off end cannot be before its start.' : '',
  seed: [{ id: 'tk-1', reference: 'TK-2026-0020', year: '2026', month: 'October', paymentMode: 'Semi-Monthly', paymentFrequency: 'Second Payroll', cutoffStart: '2026-10-11', cutoffEnd: '2026-10-25', tkAdjustment: '2026-10-26', autoComputeDate: '2026-10-27', status: 'Open', remarks: '' }],
};

export const calendarEvents = {
  title: 'Events', singular: 'Event', storageKey: 'atlas-core-cal-events-v1',
  columns: [c('title', 'Event Title'), c('year', 'Year'), c('month', 'Month'), c('day', 'Day'), c('timeStart', 'Time Start'), c('timeEnd', 'Time End'), c('duration', 'Duration'), c('publishDate', 'Scheduled Publish Date', 'date'), c('publishTime', 'Scheduled Publish Time'), c('sendEmail', 'Send to E-mail?'), c('status', 'Calendar Status', 'status'), c('employeeGroup', 'Employee Group', 'multiselect'), c('remarks', 'Remarks')],
  fields: [f('title', 'Event Title', 'text', { ...req, placeholder: 'Input event title' }), f('year', 'Year', 'select', { ...req, options: LOOKUPS.years }), f('month', 'Month', 'select', { ...req, options: LOOKUPS.months }), f('day', 'Day', 'number', { ...req, min: 1, max: 31 }), f('timeStart', 'Time Start', 'time', req), f('timeEnd', 'Time End', 'time', req), f('duration', 'Duration', 'text', { readOnly: true, placeholder: 'Computed from the times' }), f('publishDate', 'Schedule Publish Date', 'date', req), f('publishTime', 'Schedule Publish Time', 'time', req), f('sendEmail', 'Send to Email?', 'radio', { options: yesNo, default: 'No' }), f('employeeGroup', 'Employee Group', 'multiselect', { ...req, options: LOOKUPS.employeeGroups }), f('status', 'Calendar Status', 'select', { ...req, options: LOOKUPS.calendarStatuses, default: 'Open' }), f('remarks', 'Remarks', 'textarea')],
  filters: ['title', 'year', 'month', 'sendEmail', 'status', 'employeeGroup'],
  beforeSave: draft => {
    const [sh, sm] = String(draft.timeStart).split(':').map(Number);
    const [eh, em] = String(draft.timeEnd).split(':').map(Number);
    const minutes = (eh * 60 + em) - (sh * 60 + sm);
    return { ...draft, duration: minutes > 0 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : '' };
  },
  validate: draft => draft.timeEnd <= draft.timeStart ? 'Time End must be after Time Start.' : '',
  seed: [{ id: 'ev-1', title: 'Company Foundation Day', year: '2026', month: 'November', day: '14', timeStart: '13:00', timeEnd: '17:00', duration: '4h 0m', publishDate: '2026-11-01', publishTime: '09:00', sendEmail: 'Yes', status: 'Open', employeeGroup: ['All Employees'], remarks: '' }],
};

export const holidays = {
  title: 'Holidays', singular: 'Holiday', storageKey: 'atlas-core-cal-holidays-v1', uniqueKey: 'code',
  columns: [c('code', 'Holiday Code'), c('name', 'Holiday Name'), c('type', 'Holiday Type'), c('date', 'Date', 'date'), c('city', 'City'), c('province', 'Province'), c('country', 'Country'), c('group', 'Holiday Group'), c('status', 'Calendar Status', 'status')],
  fields: [f('code', 'Holiday Code', 'text', { ...req, placeholder: 'Input code' }), f('name', 'Holiday Name', 'text', { ...req, placeholder: 'Input holiday name' }), f('type', 'Holiday Type', 'select', { ...req, options: LOOKUPS.holidayTypes }), f('date', 'Date', 'date', req), f('nationwide', 'Nationwide Holiday', 'radio', { ...req, options: yesNo, default: 'Yes' }), f('group', 'Holiday Group', 'select', { ...req, options: LOOKUPS.holidayGroups }), f('country', 'Country (National)', 'select', { options: ['Philippines'], default: 'Philippines' }), f('province', 'Province (Provincial)', 'select', { options: ['Metro Manila', 'Cebu', 'Davao del Sur'], showIf: draft => draft.nationwide === 'No' }), f('city', 'City (Local)', 'select', { options: ['Makati City', 'Quezon City', 'Cebu City', 'Davao City'], showIf: draft => draft.nationwide === 'No' }), f('status', 'Calendar Status', 'select', { ...req, options: LOOKUPS.calendarStatuses, default: 'Open' })],
  filters: ['code', 'name', 'type', 'nationwide', 'country', 'province', 'city', 'group', 'status'],
  validate: draft => draft.nationwide === 'No' && !draft.city && !draft.province ? 'A local holiday needs its Province or City.' : '',
  seed: [
    { id: 'hol-1', code: 'HOL-001', name: 'All Saints\' Day', type: 'Special Holiday', date: '2026-11-01', nationwide: 'Yes', country: 'Philippines', province: '', city: '', group: 'National', status: 'Open' },
    { id: 'hol-2', code: 'HOL-002', name: 'Bonifacio Day', type: 'Regular Holiday', date: '2026-11-30', nationwide: 'Yes', country: 'Philippines', province: '', city: '', group: 'National', status: 'Open' },
    { id: 'hol-3', code: 'HOL-003', name: 'Makati City Day', type: 'Special Holiday', date: '2026-02-02', nationwide: 'No', country: 'Philippines', province: 'Metro Manila', city: 'Makati City', group: 'Makati Local', status: 'Posted' },
  ],
};

export const statutoryDeadline = {
  title: 'Statutory Deadline', singular: 'Statutory Deadline Calendar Item', storageKey: 'atlas-core-cal-statutory-v1',
  columns: [c('governmentNumber', 'Government Number'), c('agency', 'Government Agency'), c('statutoryType', 'Type'), c('deadline', 'Deadline'), c('deadlineType', 'Deadline Type')],
  viewColumns: [c('governmentNumber', 'Government Number'), c('agency', 'Government Agency'), c('statutoryType', 'Statutory Type'), c('deadlineType', 'Deadline Type'), c('deadline', 'Deadline Per Government Agency Form'), c('filingType', 'Type of Filing'), c('paymentType', 'Payment Type'), c('paymentDate', 'Date of Payment', 'date')],
  fields: [f('governmentNumber', 'Government Number', 'text', { ...req, placeholder: 'Enter government number' }), f('agency', 'Government Agency', 'radio', { ...req, options: LOOKUPS.agencies }), f('statutoryType', 'Statutory Type', 'select', { ...req, options: draft => LOOKUPS.filingTypes[draft.agency] || [] }), f('deadlineType', 'Deadline Type', 'select', { ...req, options: LOOKUPS.deadlineTypes }), f('deadline', 'Deadline Per Government Agency Form', 'select', { ...req, options: ['On or before the 10th of the following month', 'On or before the 15th of the following month', 'Last day of the month following the quarter', 'On or before January 31 of the following year', 'Per SSS / PhilHealth / HDMF schedule by employer number'] }), f('filingType', 'Type of Filing', 'select', { options: LOOKUPS.onlineManual, showIf: draft => draft.deadlineType === 'Filing' }), f('paymentType', 'Payment Type', 'select', { options: LOOKUPS.onlineManual, showIf: draft => draft.deadlineType === 'Payment' }), f('paymentDate', 'Date of Payment', 'date', { showIf: draft => draft.deadlineType === 'Payment' })],
  filters: ['agency', 'statutoryType', 'deadlineType', 'filingType', 'paymentType'],
  seed: [
    { id: 'sd-1', governmentNumber: '000-123-456-000', agency: 'BIR', statutoryType: '1601-C', deadlineType: 'Filing', deadline: 'On or before the 10th of the following month', filingType: 'Online' },
    { id: 'sd-2', governmentNumber: '34-1234567-8', agency: 'SSS', statutoryType: 'Contributions (SSS)', deadlineType: 'Payment', deadline: 'Per SSS / PhilHealth / HDMF schedule by employer number', paymentType: 'Online', paymentDate: '2026-11-10' },
  ],
};

/* ------------------------------------------------- Employee Onboarding */

export const onboardingDocuments = {
  title: 'Document', singular: 'Onboarding Document', storageKey: 'atlas-core-onboarding-docs-v1', codeKey: 'documentId', codePrefix: 'ONB-DOC-', codeDigits: 4, wideForm: true,
  columns: [c('documentId', 'Document ID'), c('title', 'Title'), c('dateCreated', 'Date Created', 'date'), c('effectivityDate', 'Effectivity Date', 'date'), c('documentType', 'Document Type'), c('department', 'Department'), c('jobTitle', 'Job Title'), c('author', 'Author'), c('status', 'Status', 'status')],
  viewColumns: [c('documentId', 'Onboarding Document ID'), c('title', 'Document Title'), c('documentType', 'Document Type'), c('department', 'Department'), c('jobTitle', 'Job Title'), c('author', 'Author'), c('submissionType', 'Submission Type'), c('file', 'File Upload', 'file'), c('content', 'Manual Input'), c('effectivityDate', 'Effectivity Date', 'date'), c('acknowledgement', 'Acknowledgement Notice'), c('status', 'Status', 'status'), c('remarks', 'Remarks')],
  fields: [f('documentId', 'Onboarding Document ID', 'text', { readOnly: true, placeholder: 'Auto-generated' }), f('title', 'Document Title', 'text', { ...req, placeholder: 'Input title' }), f('documentType', 'Document Type', 'select', { ...req, options: LOOKUPS.documentTypes }), f('department', 'Department', 'select', { ...req, options: LOOKUPS.departments }), f('jobTitle', 'Job Title', 'select', { ...req, options: LOOKUPS.jobTitles }), f('author', 'Author', 'text', req), f('submissionType', 'Submission Type', 'radio', { ...req, options: ['File Upload', 'Manual Input'], default: 'File Upload' }), f('file', 'File Upload', 'file', { showIf: draft => draft.submissionType === 'File Upload', hint: 'PDF or Word, maximum 5MB.' }), f('content', 'Manual Input', 'textarea', { showIf: draft => draft.submissionType === 'Manual Input', maxLength: 5000, placeholder: 'Type the document content' }), f('effectivityDate', 'Effectivity Date', 'date', req), f('acknowledgement', 'Acknowledgement Notice', 'textarea', { placeholder: 'Input acknowledgement notice' }), f('status', 'Status', 'select', { options: ['Draft', 'Active', 'Inactive'], default: 'Draft' }), f('remarks', 'Remarks', 'textarea')],
  filters: ['documentId', 'status', 'documentType', 'department', 'jobTitle', 'author', 'effectivityDate'],
  validate: draft => draft.submissionType === 'File Upload' && !draft.file ? 'Upload the document file.' : draft.submissionType === 'Manual Input' && !draft.content ? 'Type the document content.' : '',
  seed: [{ id: 'od-1', documentId: 'ONB-DOC-0001', title: 'Job Offer – Software Engineer', dateCreated: '2026-09-02', effectivityDate: '2026-09-15', documentType: 'Job Offer', department: 'IT Department', jobTitle: 'Software Engineer', author: 'HR Officer', submissionType: 'File Upload', file: { name: 'JobOffer_SE.pdf' }, acknowledgement: 'I have read and accept the terms of this offer.', status: 'Active' }],
};

export const onboardingChecklist = {
  title: 'Onboarding Checklist', singular: 'Checklist Item', storageKey: 'atlas-core-onboarding-checklist-v1', uniqueKey: 'title',
  columns: [c('title', 'Title'), c('requiredUpload', 'Required Upload?'), c('remarks', 'Remarks')],
  fields: [f('title', 'Checklist Item Title', 'text', { ...req, placeholder: 'Input checklist item title' }), f('requiredUpload', 'Required Upload?', 'radio', { ...req, options: yesNo, default: 'Yes' }), f('remarks', 'Remarks', 'textarea')],
  seed: [
    { id: 'oc-1', title: 'NBI Clearance', requiredUpload: 'Yes', remarks: '' },
    { id: 'oc-2', title: 'Pre-employment Medical Result', requiredUpload: 'Yes', remarks: '' },
    { id: 'oc-3', title: 'TIN / SSS / PhilHealth / HDMF numbers', requiredUpload: 'No', remarks: 'Encoded in the employee profile.' },
  ],
};

/* ----------------------------------------- Charge codes, moods, content */

export const employeeChargeCodes = {
  title: 'Employee Charge Codes', singular: 'Employee Charge Code', storageKey: 'atlas-core-charge-codes-v1', codeKey: 'code', codePrefix: 'CC-', codeDigits: 4, uniqueKey: 'code',
  columns: [c('code', 'Charge Code'), c('account', 'Charge Account'), { key: 'chargeType', label: 'Charge Type', render: row => row.account === 'Client' ? row.client : (row.employeeGroup || '—') }, c('project', 'Project Name'), c('team', 'Team', 'multiselect'), c('employees', 'Employee Name', 'multiselect'), c('activities', 'Activity'), c('status', 'Status', 'status')],
  fields: [f('code', 'Charge Code', 'text', { placeholder: 'Auto-generated if left blank', lockedOnEdit: true }), f('account', 'Charge Account', 'select', { ...req, options: ['Client', 'Employee Group'] }), f('client', 'Charge Type', 'select', { options: LOOKUPS.clients, showIf: draft => draft.account === 'Client' }), f('employeeGroup', 'Charge Type', 'select', { options: LOOKUPS.employeeGroups, showIf: draft => draft.account === 'Employee Group' }), f('project', 'Project Name', 'select', { ...req, options: LOOKUPS.projects }), f('team', 'Team', 'multiselect', { options: LOOKUPS.employeeGroups }), f('employees', 'Employee Name', 'multiselect', { ...req, options: LOOKUPS.employees }), f('activities', 'Activities', 'textarea', { ...req, placeholder: 'One activity per line' }), f('status', 'Status', 'radio', { ...req, options: ['Active', 'Inactive'], default: 'Active' })],
  filters: ['code', 'account', 'project', 'status'],
  validate: draft => draft.account === 'Client' && !draft.client ? 'Choose the client this code charges to.' : draft.account === 'Employee Group' && !draft.employeeGroup ? 'Choose the employee group this code charges to.' : '',
  seed: [{ id: 'cc-1', code: 'CC-0001', account: 'Client', client: 'ABC Company Ltd', project: 'Atlas Phase 2', team: ['IT Department'], employees: ['John Collins Doe', 'Ethan Collins'], activities: 'Development\nTesting', status: 'Active' }],
};

export const happinessMeter = {
  title: 'Happiness Meter', singular: 'Happiness Meter Item', storageKey: 'atlas-core-happiness-v1', canAdd: false, actions: ['edit'],
  columns: [c('mood', 'Mood Name'), c('rate', 'Rate'), c('color', 'Color', 'color'), c('emoji', 'Emoji')],
  fields: [f('mood', 'Mood Name', 'text', { ...req, placeholder: 'Input Mood Name', maxLength: 30 })],
  seed: [
    { id: 'hm-1', mood: 'Bad', rate: 1, color: '#E40613', emoji: '😞' },
    { id: 'hm-2', mood: 'Poor', rate: 2, color: '#EA9309', emoji: '🙁' },
    { id: 'hm-3', mood: 'Neutral', rate: 3, color: '#EAD303', emoji: '😐' },
    { id: 'hm-4', mood: 'Good', rate: 4, color: '#BCEA00', emoji: '🙂' },
    { id: 'hm-5', mood: 'Perfect', rate: 5, color: '#27A738', emoji: '😄' },
  ],
};

const contentDefinition = (kind, storageKey, seed) => ({
  title: kind === 'Article' ? 'Articles' : 'Events', singular: kind, storageKey, wideForm: true,
  columns: [c('dateCreated', 'Date Created', 'date'), c('title', 'Title'), c('author', 'Author'), c('attachments', 'Attachments', 'file'), c('status', 'Status', 'status'), c('publishDate', 'Publish Date', 'date')],
  viewColumns: [c('title', `${kind} Title`), c('author', 'Author'), c('body', 'Content'), c('attachments', 'Attachments', 'file'), c('publishNow', 'Publish'), c('publishDate', 'Publish Date', 'date'), c('status', 'Status', 'status'), c('remarks', 'Remarks')],
  fields: [f('title', `${kind} Title`, 'text', { ...req, placeholder: 'Input title' }), f('author', 'Author', 'text', { ...req, placeholder: 'Input author' }), f('body', 'Content', 'textarea', { ...req, maxLength: 5000 }), f('attachments', 'Attachments', 'file', { accept: '.pdf,.jpg,.jpeg,.png' }), f('publishNow', 'Publish', 'radio', { options: ['Now', 'Later'], default: 'Now' }), f('publishDate', 'Publish Date', 'date', { showIf: draft => draft.publishNow === 'Later' })],
  filters: ['title', 'author', 'status'],
  beforeSave: draft => ({ ...draft, status: draft.status === 'Published' ? 'For Approval' : (draft.status || 'For Approval'), publishDate: draft.publishNow === 'Now' ? todayIso() : draft.publishDate }),
  validate: draft => draft.publishNow === 'Later' && (!draft.publishDate || draft.publishDate <= todayIso()) ? 'Choose a publish date after today, or publish now.' : '',
  seed,
});
export const wellnessArticles = contentDefinition('Article', 'atlas-core-wellness-articles-v1', [{ id: 'wa-1', dateCreated: '2026-09-20', title: 'Five habits for a healthier workday', author: 'People Operations', body: 'Stand up every hour, drink water, and take your breaks away from the screen.', publishNow: 'Now', publishDate: '2026-09-21', status: 'Published' }]);
export const wellnessEvents = contentDefinition('Event', 'atlas-core-wellness-events-v1', [{ id: 'we-1', dateCreated: '2026-10-01', title: 'Fun Run 2026', author: 'Wellness Committee', body: '5K fun run at BGC on November 22.', publishNow: 'Later', publishDate: '2026-11-01', status: 'For Approval' }]);

export const notificationConfiguration = {
  title: 'Notifications', singular: 'Notification Configuration', storageKey: 'atlas-core-notifications-v1', uniqueKey: 'feature',
  columns: [c('feature', 'Feature Name'), c('channel', 'Channel', 'multiselect'), c('frequency', 'Frequency'), c('timing', 'When to be notified'), c('receiver', 'Receiver'), c('priority', 'Priority Level')],
  fields: [f('feature', 'Feature Name', 'select', { ...req, options: LOOKUPS.notificationFeatures }), f('channel', 'Channel', 'multiselect', { ...req, options: LOOKUPS.notificationChannels }), f('frequency', 'Frequency', 'select', { ...req, options: LOOKUPS.notificationFrequencies }), f('timing', 'When to be notified', 'select', { ...req, options: LOOKUPS.notificationTimings }), f('receiver', 'Receiver', 'select', { ...req, options: LOOKUPS.notificationReceivers }), f('priority', 'Priority Level', 'select', { ...req, options: LOOKUPS.priorityLevels, default: 'Medium' })],
  filters: ['feature', 'channel', 'frequency', 'receiver', 'priority'],
  seed: [
    { id: 'nc-1', feature: 'Leave Application', channel: ['Email', 'In-App'], frequency: 'Everyday', timing: 'Any activity related to the employee', receiver: 'Employee', priority: 'Medium' },
    { id: 'nc-2', feature: 'Payroll Payout', channel: ['Email'], frequency: 'Everyday', timing: 'Any activity in the organization', receiver: 'Administrator', priority: 'High' },
    { id: 'nc-3', feature: 'Official Business Approval', channel: ['In-App'], frequency: 'Everyday', timing: "Any activity related to the employee's team", receiver: 'Manager', priority: 'Medium' },
  ],
};

/* -------------------------------------------- Navigation, tickets, roles */

export const navigationConfiguration = {
  title: 'Navigation Configuration', singular: 'Navigation Configuration', storageKey: 'atlas-core-navigation-v1', wideForm: true,
  columns: [c('date', 'Date', 'date'), c('title', 'Title'), c('type', 'Type'), c('datePublished', 'Date Published', 'date'), c('audience', 'Audience'), c('status', 'Status', 'status')],
  viewColumns: [c('date', 'Date', 'date'), c('title', 'Title'), c('type', 'Type'), c('feature', 'Feature'), c('welcomeMessage', 'Welcome Message'), { key: 'steps', label: 'Steps', render: row => (row.steps || []).map((step, index) => `${index + 1}. ${step}`).join('  ') || '—' }, c('audience', 'Audience'), c('employeeGroups', 'Employee Group', 'multiselect'), c('status', 'Status', 'status')],
  fields: [f('date', 'Date', 'date', { ...req, default: todayIso() }), f('title', 'Title', 'text', req), f('type', 'Type', 'select', { ...req, options: LOOKUPS.navigationTypes, default: 'Navigation Guide' }), f('feature', 'Feature', 'select', { ...req, options: LOOKUPS.navigationFeatures }), f('welcomeMessage', 'Welcome Message', 'textarea', { ...req, maxLength: 500 }), f('stepsText', 'Steps', 'textarea', { maxLength: 3000, placeholder: 'One step per line', hint: 'Each line becomes one step of the guide.' }), f('audience', 'Audience', 'radio', { ...req, options: LOOKUPS.navigationAudiences, default: 'All' }), f('employeeGroups', 'Employee Group', 'multiselect', { options: LOOKUPS.employeeGroups, showIf: draft => draft.audience === 'Filter By' }), f('status', 'Status', 'select', { ...req, options: LOOKUPS.navigationStatuses, default: 'Draft' })],
  filters: ['date', 'title', 'type', 'audience', 'status'],
  beforeSave: draft => ({ ...draft, steps: String(draft.stepsText || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean), datePublished: draft.status === 'Published' ? (draft.datePublished || todayIso()) : '' }),
  validate: draft => draft.audience === 'Filter By' && !(draft.employeeGroups || []).length ? 'Choose at least one employee group for this audience.' : draft.status === 'Scheduled' && draft.date <= todayIso() ? 'A scheduled guide needs a date after today.' : '',
  seed: [{ id: 'nav-1', date: '2026-09-01', title: 'Welcome to Company Information', type: 'Navigation Guide', feature: 'Company Information', welcomeMessage: 'Set up your company profile, government numbers, bank accounts and authorized representatives here.', stepsText: 'Start with Setup & Verification: enter your company code and upload the KYC documents.\nComplete Basic Information and your BIR, SSS, PhilHealth and HDMF numbers.\nAdd your bank accounts and mark the default one.', steps: ['Start with Setup & Verification: enter your company code and upload the KYC documents.', 'Complete Basic Information and your BIR, SSS, PhilHealth and HDMF numbers.', 'Add your bank accounts and mark the default one.'], audience: 'All', employeeGroups: [], status: 'Published', datePublished: '2026-09-01' }],
};

export const roleManagement = {
  title: 'Role Management', singular: 'Role', storageKey: 'atlas-core-roles-v1', uniqueKey: 'code', wideForm: true,
  columns: [c('code', 'Role Code'), c('name', 'Role Name'), c('services', 'Services', 'multiselect'), c('userType', 'User'), c('modules', 'Module', 'multiselect'), c('access', 'Access', 'multiselect'), { key: 'summary', label: 'Access Summary', render: row => `${(row.modules || []).length} module(s) · ${(row.access || []).join(', ') || 'no access'}` }, c('remarks', 'Remarks')],
  fields: [f('code', 'Role Code', 'text', { ...req, placeholder: 'Enter Role Code', lockedOnEdit: true }), f('name', 'Role Name', 'text', { ...req, placeholder: 'Enter Role Name' }), f('services', 'Services', 'multiselect', { ...req, options: LOOKUPS.services }), f('userType', 'User', 'select', { ...req, options: LOOKUPS.roleUserTypes }), f('modules', 'Modules', 'multiselect', { ...req, options: LOOKUPS.roleModules }), f('access', 'Features / Access', 'multiselect', { ...req, options: LOOKUPS.accessLevels }), f('remarks', 'Remarks', 'textarea')],
  filters: ['name'],
  seed: [
    { id: 'role-1', code: 'CLIENT_ADMIN', name: 'Client Admin', services: ['Core', 'HRM', 'Timekeeping', 'Payroll'], userType: 'Client Admin', modules: LOOKUPS.roleModules, access: ['View', 'Add', 'Edit', 'Delete', 'Download', 'Approve'], remarks: '' },
    { id: 'role-2', code: 'ESS-001', name: 'ESS Leave Application', services: ['HRM'], userType: 'Employee', modules: ['Employee Self-Service'], access: ['View', 'Add', 'Edit'], remarks: '' },
    { id: 'role-3', code: 'MA-001', name: 'MA Leave Management', services: ['HRM'], userType: 'Approver', modules: ['Manage Approvals'], access: ['View', 'Approve'], remarks: '' },
  ],
};

export const userManagement = {
  title: 'User Management', singular: 'User', storageKey: 'atlas-core-users-v1', uniqueKey: ['employee', 'roleCode'], wideForm: true,
  columns: [c('employee', 'Employee Name'), c('roleCode', 'Role Code'), c('employeeGroup', 'Employee Group'), c('subGroup', 'Sub-Employee Group'), c('status', 'Status', 'status'), c('remarks', 'Remarks')],
  viewColumns: [c('employee', 'Employee Name'), c('roleCode', 'Role Code'), c('employeeGroup', 'Employee Group'), c('subGroup', 'Sub-Employee Group'), c('approvers', 'Approval Hierarchy', 'multiselect'), c('approvalMode', 'Approval Mode'), c('status', 'Status', 'status'), c('remarks', 'Remarks')],
  fields: [f('roleCode', 'Role Code', 'select', { ...req, options: LOOKUPS.roleCodes }), f('employee', 'Employee Name', 'select', { ...req, options: LOOKUPS.employees }), f('employeeGroup', 'Employee Group', 'select', { ...req, options: LOOKUPS.employeeGroups }), f('subGroup', 'Sub-Employee Group', 'select', { options: LOOKUPS.departments }), f('approvers', 'Approval Hierarchy (Assigned Employee Name)', 'multiselect', { options: LOOKUPS.employees, hint: 'Approvers for this user, in order.' }), f('approvalMode', 'Approval Mode', 'radio', { options: ['Anyone can approve', 'All must approve'], default: 'Anyone can approve' }), f('status', 'Status', 'select', { ...req, options: ['Activated', 'Deactivated'], default: 'Activated' }), f('remarks', 'Remarks', 'textarea', { placeholder: 'Enter Brief Description' })],
  filters: ['employee', 'roleCode', 'employeeGroup', 'status'],
  validate: draft => (draft.approvers || []).includes(draft.employee) ? 'An employee cannot approve their own requests.' : '',
  seed: [
    { id: 'usr-1', employee: 'John Collins Doe', roleCode: 'MA-001', employeeGroup: 'IT Department', subGroup: 'IT Department', approvers: ['Olivia Bennett'], approvalMode: 'Anyone can approve', status: 'Activated', remarks: '' },
    { id: 'usr-2', employee: 'Ethan Collins', roleCode: 'ESS-001', employeeGroup: 'Rank and File', subGroup: 'IT Department', approvers: ['John Collins Doe'], approvalMode: 'Anyone can approve', status: 'Activated', remarks: '' },
  ],
};

export const companyOffboardingDocuments = ['Termination Letter', 'Turnover and Completion Letter Per Service Line', 'Termination Acknowledgement Letter', 'Proof of Sending of the Turnover and Completion Letter', 'Proof of Sending of the Termination Acknowledgement Letter', 'Proof of Acknowledgement of the Turnover and Completion Letter', 'Proof of Acknowledgement of the Termination Acknowledgement Letter', 'Offboarding Checklist Per Service Line', 'Minutes of Meeting', 'Lost Client Form', 'Email Communication with BD Group'];
