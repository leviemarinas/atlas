import { useEffect, useMemo, useState } from 'react';
import {
  CaretDown,
  CaretUp,
  DownloadSimple,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  UploadSimple,
  UserCircle,
  X,
} from '@phosphor-icons/react';
import { AccountFilterModal, EMPTY_ACCOUNT_FILTER, accountFilterIsActive, matchesAccountFilter, BulkActionsMenu, BulkHistoryModal, EMPTY_FILTER, EmployeeBulkWizard, ExportMenu, FilterButton, FilterModal, exportAccounts, exportEmployees, filterIsActive, matchesFilter } from './EmployeeBulkModals.jsx';

const moneyKeys = ['amount', 'creditAmount', 'approvedAmount', 'remainingBalance', 'salaryAmount'];
const display = (key, value) => moneyKeys.includes(key) ? `₱ ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : value || '—';

function usePersistentState(key, seed) {
  const [value, setValue] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) || seed; } catch { return seed; }
  });
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value]);
  return [value, setValue];
}

function download(filename, content, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function FormInput({ field, value, onChange }) {
  const [key, label, type = 'text', options = []] = field;
  if (type === 'select') return <select required value={value ?? ''} onChange={event => onChange(event.target.value)}><option value="">Please select</option>{options.map(option => <option key={option}>{option}</option>)}</select>;
  if (type === 'textarea') return <textarea required value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder={`Input ${label.toLowerCase()}`} />;
  return <input required type={type} step={type === 'number' ? '0.01' : undefined} min={type === 'number' ? '0' : undefined} value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder={type === 'number' ? '0.00' : `Input ${label.toLowerCase()}`} />;
}

function RecordModal({ definition, record, onClose, onSave }) {
  const [draft, setDraft] = useState(record || {});
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal employee-entry-modal profile-entry-modal" role="dialog" aria-modal="true" aria-label={`${record?.id ? 'Edit' : 'Add'} ${definition.singular || definition.title}`}>
      <header><h2>{record?.id ? 'Edit' : 'Add'} {definition.singular || definition.title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
      <form onSubmit={event => { event.preventDefault(); onSave(draft); }}><div className="employee-form-grid">{definition.fields.map(field => <label key={field[0]}>{field[1]} <span className="required">*</span><FormInput field={field} value={draft[field[0]]} onChange={value => setDraft(previous => ({ ...previous, [field[0]]: value }))} /></label>)}</div><footer className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{record?.id ? 'Save' : 'Add'}</button></footer></form>
    </section>
  </div>;
}

function DeleteModal({ label, onClose, onDelete }) {
  return <div className="modal-backdrop"><section className="modal delete-modal" role="dialog" aria-modal="true" aria-label="Delete item"><header><h2>Delete Item</h2><button className="icon-button" onClick={onClose}><X /></button></header><div className="modal-body"><p>Are you sure you want to delete “{label}”? This action is irreversible.</p><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" onClick={onDelete}>Delete</button></div></div></section></div>;
}

function RecordSection({ definition, rows, setRows, notify, initiallyOpen = true }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  const save = draft => {
    if (draft.id) setRows(rows.map(row => row.id === draft.id ? draft : row));
    else setRows([...rows, { ...draft, id: Date.now() }]);
    setEditing(undefined); notify({ type: 'success', message: `${definition.title} entry ${draft.id ? 'updated' : 'added'} successfully.` });
  };
  return <section className="employee-data-section compact-record-section">
    <button className="employee-section-heading" onClick={() => setOpen(value => !value)}><span>{definition.title}</span>{open ? <CaretUp /> : <CaretDown />}</button>
    {open && <div className="employee-section-body"><div className="employee-section-actions"><button className="button secondary" onClick={() => setEditing(null)}><Plus /> Add entry</button></div><div className="employee-table-wrap"><table className="employee-table"><thead><tr>{definition.columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Action</th></tr></thead><tbody>{rows.length ? rows.map(row => <tr key={row.id}>{definition.columns.map(([key]) => <td key={key}>{display(key, row[key])}</td>)}<td><div className="row-actions always"><button onClick={() => setEditing(row)} aria-label="Edit"><PencilSimple /></button><button onClick={() => setDeleting(row)} aria-label="Delete"><Trash /></button></div></td></tr>) : <tr><td colSpan={definition.columns.length + 1}><div className="empty-state compact"><h3>No entries yet</h3><p>Add the employee record when available.</p></div></td></tr>}</tbody></table></div></div>}
    {editing !== undefined && <RecordModal definition={definition} record={editing || null} onClose={() => setEditing(undefined)} onSave={save} />}
    {deleting && <DeleteModal label={deleting[definition.columns[0][0]] || definition.title} onClose={() => setDeleting(null)} onDelete={() => { setRows(rows.filter(row => row.id !== deleting.id)); setDeleting(null); notify({ type: 'success', message: `${definition.title} entry deleted.` }); }} />}
  </section>;
}

const directoryDefinition = {
  title: 'New Employee', singular: 'New Employee', fields: [
    ['employeeCode', 'Employee Code'], ['firstName', 'First Name'], ['middleName', 'Middle Name'], ['lastName', 'Last Name'],
    ['status', 'Employment Status', 'select', ['Full-time', 'Part-time', 'Probationary', 'Project-based']], ['hireDate', 'Hire Date', 'date'],
    ['origin', 'Origin', 'select', ['Philippines', 'Singapore', 'United States']], ['role', 'Job Title'],
  ],
};

export function EmployeeDirectory({ employees, setEmployees, onSelect, notify }) {
  const [bulk, setBulk] = useState(null);
  const [filter, setFilter] = useState(EMPTY_FILTER); const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState(''); const [editing, setEditing] = useState(undefined); const [deleting, setDeleting] = useState(null);
  const filtered = useMemo(() => employees.filter(item => `${item.id} ${item.name} ${item.role} ${item.origin || ''} ${item.status || ''}`.toLowerCase().includes(query.toLowerCase()) && matchesFilter(item, filter)), [employees, query, filter]);
  const save = draft => {
    const normalized = { ...draft, id: draft.id || draft.employeeCode, name: `${draft.firstName} ${draft.middleName || ''} ${draft.lastName}`.replace(/\s+/g, ' ').trim(), initials: `${draft.firstName?.[0] || ''}${draft.lastName?.[0] || ''}`.toUpperCase(), location: draft.location || 'PBS | Makati' };
    if (employees.some(item => item.id === normalized.id)) setEmployees(employees.map(item => item.id === normalized.id ? normalized : item)); else setEmployees([normalized, ...employees]);
    setEditing(undefined); notify({ type: 'success', message: `Employee ${draft.id ? 'updated' : 'added'} successfully.` });
  };
  const runExport = format => { exportEmployees(employees, format); notify({ type: 'success', message: `Employee Masterfile ${format === 'docx' ? 'Word' : format.toUpperCase()} export downloaded.` }); };
  return <section className="employee-directory">
    <div className="page-heading"><div><p className="breadcrumb">Core / Employee Masterfile</p><h1>Employee Information</h1><p className="page-description">Maintain personal, employment, benefit, time-off, payroll, and contact records in one employee profile.</p></div></div>
    <div className="employee-directory-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search..." /></div><FilterButton active={filterIsActive(filter)} onClick={() => setFilterOpen(true)} /><div className="toolbar-spacer" /><button className="button primary" onClick={() => setEditing(null)}><Plus /> Add</button><BulkActionsMenu onPick={setBulk} /><ExportMenu onPick={runExport} /></div>
    <div className="table-card employee-directory-card"><table><thead><tr><th>Profile</th><th>Employee Code</th><th>First Name</th><th>Last Name</th><th>Origin</th><th>Employment Status</th><th>Action</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id}><td><span className="directory-avatar">{item.initials}</span></td><td><button className="table-link" onClick={() => onSelect(item)}>{item.id}</button></td><td>{item.firstName || item.name.split(' ')[0]}</td><td>{item.lastName || item.name.split(' ').slice(-1)[0]}</td><td>{item.origin || 'Philippines'}</td><td>{item.status || 'Full-time'}</td><td><div className="row-actions always"><button onClick={() => setEditing({ ...item, employeeCode: item.id, firstName: item.firstName || item.name.split(' ')[0], lastName: item.lastName || item.name.split(' ').slice(-1)[0] })}><PencilSimple /></button><button onClick={() => setDeleting(item)}><Trash /></button></div></td></tr>)}</tbody></table></div>
    <div className="pagination"><span>Displaying <strong>{filtered.length}</strong> of {employees.length} employees</span><div><button disabled>«</button><strong>1</strong><span>of 1</span><button disabled>»</button></div></div>
    {(bulk === 'import' || bulk === 'update') && <EmployeeBulkWizard mode={bulk} employees={employees} setEmployees={setEmployees} notify={notify} onClose={() => setBulk(null)} />}
    {filterOpen && <FilterModal applied={filter} onApply={next => { setFilter(next); setFilterOpen(false); }} onClose={() => setFilterOpen(false)} />}
    {bulk === 'history' && <BulkHistoryModal onClose={() => setBulk(null)} />}
    {editing !== undefined && <RecordModal definition={directoryDefinition} record={editing || null} onClose={() => setEditing(undefined)} onSave={save} />}
    {deleting && <DeleteModal label={deleting.name} onClose={() => setDeleting(null)} onDelete={() => { setEmployees(employees.filter(item => item.id !== deleting.id)); setDeleting(null); notify({ type: 'success', message: 'Employee deleted.' }); }} />}
  </section>;
}

const personalBaseSeed = {
  employeeCode: '0000112345', firstName: 'John', middleName: 'Michael', lastName: 'Doe', displayName: 'John Doe', gender: 'Male', civilStatus: 'Married', birthdate: '1989-04-12', birthplace: 'Makati City', nationality: 'Filipino', ethnicity: 'Filipino', origin: 'Philippines', religion: 'Catholic', primaryLanguage: 'English', secondaryLanguage: 'Filipino', hobbies: 'Cycling, reading', dependents: '2', sssNumber: '34-1234567-8', sssWisp: 'WISP-000123', philhealthNumber: '12-345678901-2', tin: '123-456-789-000', birRdo: '047', peraCredit: '0', hdmfNumber: '1234-5678-9012', hdmfMp2: 'MP2-00421',
};
const personalFields = [
  ['employeeCode', 'Employee Code'], ['salutation', 'Salutation'], ['firstName', 'First Name'], ['middleName', 'Middle Name'], ['lastName', 'Last Name'], ['suffix', 'Suffix'], ['displayName', 'Preferred / Display Name'], ['gender', 'Gender', 'select', ['Male', 'Female', 'Non-binary']], ['civilStatus', 'Civil Status', 'select', ['Single', 'Married', 'Widowed', 'Separated']], ['birthdate', 'Birthdate', 'date'], ['birthplace', 'Birth Place'], ['countryOfBirth', 'Country of Birth'], ['nationality', 'Nationality'], ['ethnicity', 'Ethnicity'], ['origin', 'Origin', 'select', ['Philippines', 'Singapore', 'United States']], ['religion', 'Religion'], ['primaryLanguage', 'Primary Language'], ['secondaryLanguage', 'Secondary Language'], ['hobbies', 'Hobbies / Interests'], ['dependents', 'No. of Dependents', 'number'], ['sssNumber', 'SSS Number'], ['sssWisp', 'SSS WISP Plus Number'], ['philhealthNumber', 'PhilHealth Number'], ['tin', 'BIR TIN'], ['birRdo', 'BIR RDO'], ['peraCredit', 'PERA Tax Credit', 'number'], ['hdmfNumber', 'HDMF Number'], ['hdmfMp2', 'HDMF MP2 Number'],
];

const personalDefinitions = [
  { key: 'dependents', title: 'Dependent Information', singular: 'Dependent', columns: [['name', 'Dependent Name'], ['relationship', 'Relationship'], ['birthdate', 'Birthdate'], ['taxQualified', 'Tax Qualified']], fields: [['name', 'Dependent Name'], ['relationship', 'Relationship', 'select', ['Spouse', 'Child', 'Parent', 'Other']], ['birthdate', 'Birthdate', 'date'], ['taxQualified', 'Qualified Tax Dependent', 'select', ['Yes', 'No']], ['healthCoverage', 'Included in Health Coverage', 'select', ['Yes', 'No']]] },
  { key: 'identification', title: 'Valid Identification Cards', singular: 'Valid Identification Card', columns: [['type', 'ID Type'], ['number', 'ID Number'], ['issuedDate', 'Issued Date'], ['expirationDate', 'Expiration Date']], fields: [['type', 'ID Type'], ['number', 'ID Number'], ['issuedDate', 'Issued Date', 'date'], ['expirationDate', 'Expiration Date', 'date']] },
  { key: 'passport', title: 'Passport Information', columns: [['name', 'Passport Name'], ['number', 'Passport No.'], ['country', 'Issuing Country'], ['expirationDate', 'Expiration Date']], fields: [['name', 'Passport Name'], ['number', 'Passport Number'], ['country', 'Issuing Country'], ['issuedDate', 'Issued Date', 'date'], ['expirationDate', 'Expiration Date', 'date']] },
  { key: 'visa', title: 'Visa Information', columns: [['number', 'Visa Number'], ['country', 'Issuing Country'], ['issuedDate', 'Issued Date'], ['expirationDate', 'Expiration Date']], fields: [['number', 'Visa Number'], ['country', 'Issuing Country'], ['issuedDate', 'Issued Date', 'date'], ['expirationDate', 'Expiration Date', 'date']] },
  { key: 'education', title: 'Education Background', columns: [['school', 'Name of School'], ['address', 'School Address'], ['course', 'Course / Program'], ['level', 'Educational Level']], fields: [['school', 'Name of School'], ['address', 'School Address'], ['course', 'Course / Special Program'], ['level', 'Educational Level'], ['degree', 'Degree / Major'], ['dateFrom', 'Date From', 'date'], ['dateTo', 'Date To', 'date']] },
  { key: 'employmentHistory', title: 'Employment History', columns: [['company', 'Company'], ['address', 'Address'], ['contact', 'Contact'], ['jobTitle', 'Job Title']], fields: [['company', 'Previous Employer Name'], ['address', 'Previous Employer Address'], ['contact', 'Contact Information'], ['jobTitle', 'Previous Job Title'], ['description', 'Previous Job Description', 'textarea'], ['dateFrom', 'Date From', 'date'], ['dateTo', 'Date To', 'date'], ['salaryAmount', 'Previous Monthly Salary', 'number'], ['reason', 'Reason for Leaving']] },
  { key: 'organizations', title: 'Professional Organization', columns: [['name', 'Organization Name'], ['dateJoined', 'Date Joined'], ['status', 'Status'], ['position', 'Organization Position']], fields: [['name', 'Organization Name'], ['dateJoined', 'Date Joined', 'date'], ['status', 'Status', 'select', ['Active', 'Inactive']], ['position', 'Organization Position'], ['remarks', 'Remarks']] },
  { key: 'socialLinks', title: 'Social Links', columns: [['name', 'Link Name'], ['url', 'URL']], fields: [['name', 'Link Name'], ['url', 'URL', 'url']] },
];

const seedPersonalRows = {
  dependents: [{ id: 1, name: 'Jamie Doe', relationship: 'Child', birthdate: '2017-06-12', taxQualified: 'Yes', healthCoverage: 'Yes' }],
  identification: [{ id: 1, type: 'Solo Parent ID', number: 'A1234567812', issuedDate: '2025-11-15', expirationDate: '2030-11-16' }],
  passport: [{ id: 1, name: 'John Doe', number: 'P1234567', country: 'Philippines', expirationDate: '2030-11-16' }],
  visa: [{ id: 1, number: 'VISA-1234', country: 'Singapore', issuedDate: '2025-11-15', expirationDate: '2030-11-16' }],
  education: [{ id: 1, school: 'Shiz University', address: 'Makati City', course: 'BS Information Technology', level: 'College' }],
  employmentHistory: [{ id: 1, company: 'ABC Company', address: 'Makati City', contact: '+63 919 234 5678', jobTitle: 'Developer' }],
  organizations: [{ id: 1, name: 'ABC Organization', dateJoined: '2024-11-10', status: 'Active', position: 'President' }],
  socialLinks: [{ id: 1, name: 'LinkedIn', url: 'https://linkedin.com' }],
};

function BaseForm({ title, fields, value, setValue, notify, sections = [], onValidate }) {
  const save = () => { if (onValidate && !onValidate(value)) return; notify({ type: 'success', message: `${title} saved successfully.` }); };
  return <div className="profile-module"><section className="profile-form-card"><h2>{title}</h2><div className="profile-field-grid">{fields.map(field => <label key={field[0]}>{field[1]}<FormInput field={field} value={value[field[0]]} onChange={next => setValue(previous => ({ ...previous, [field[0]]: next }))} /></label>)}</div><div className="module-save-row"><button className="button secondary" type="button">Cancel</button><button className="button primary" onClick={save}>Save</button></div></section>{sections}</div>;
}

export function PersonalDetails({ employee, notify }) {
  const [base, setBase] = usePersistentState(`atlas-personal-${employee.id}-v2`, { ...personalBaseSeed, employeeCode: employee.id, firstName: employee.firstName || employee.name.split(' ')[0], lastName: employee.lastName || employee.name.split(' ').slice(-1)[0] });
  const [rows, setRows] = usePersistentState(`atlas-personal-rows-${employee.id}-v3`, seedPersonalRows);
  const sections = personalDefinitions.map((definition, index) => <RecordSection key={definition.key} definition={definition} rows={rows[definition.key] || []} setRows={next => setRows(previous => ({ ...previous, [definition.key]: next }))} notify={notify} initiallyOpen={index < 3} />);
  const validateTin = value => {
    if (!value.tin) return true;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('atlas-personal-') || key.includes(employee.id) || key.includes('-rows-')) continue;
      try { if (JSON.parse(localStorage.getItem(key))?.tin === value.tin) { notify({ type: 'error', message: 'This TIN is already assigned to another employee.' }); return false; } } catch { /* ignore unrelated saved data */ }
    }
    return true;
  };
  return <BaseForm title="Personal Details" fields={personalFields} value={base} setValue={setBase} notify={notify} onValidate={validateTin} sections={<div className="record-data-stack">{sections}</div>} />;
}

const employeeRecordFields = [
  ['workPermit', 'Work Permit Number'], ['dateHired', 'Date Hired', 'date'], ['jobTenure', 'Job Tenure'], ['rehireDate', 'Date Re-hired', 'date'], ['regularizationDate', 'Regularization Date', 'date'], ['employmentHold', 'Employment Hold', 'select', ['No', 'Maternity', 'Administrative']], ['holdEndDate', 'Hold End Date', 'date'], ['dateSeparated', 'Date Separated', 'date'], ['shiftSchedule', 'Shift Schedule'], ['timezone', 'Timezone'], ['chargeCodes', 'Employee Charge Codes'], ['site', 'Site'], ['division', 'Division'], ['department', 'Department'], ['section', 'Section'], ['jobTitle', 'Job Title'], ['jobLevel', 'Job Level'], ['jobGrade', 'Job Grade'], ['costCenter', 'Cost Center'], ['officeLocation', 'Office Location'], ['reportingManager', 'Reporting Manager'], ['directReports', 'Direct Reports'], ['leaveApprover', 'Authorized to Approve Leave', 'select', ['Yes', 'No']], ['timesheetApprover', 'Authorized to Approve Timesheets', 'select', ['Yes', 'No']], ['birBranch', 'BIR Branch Code'], ['sssBranch', 'SSS Branch Code'], ['phicBranch', 'PHIC Branch Code'], ['hdmfBranch', 'HDMF Branch Code'], ['currency', 'Payroll Currency', 'select', ['PHP', 'USD', 'SGD']], ['employmentType', 'Employment Type', 'select', ['Regular', 'Probationary', 'Project-based', 'Consultant']], ['employmentStatus', 'Employment Status', 'select', ['Active', 'On hold', 'Separated']], ['incomeType', 'Income Type', 'select', ['Compensation', 'Professional Fee']], ['employeeCategory', 'Employee Category'], ['employeeGroup', 'Payroll Employee Group'], ['payFrequency', 'Pay Frequency', 'select', ['Weekly', 'Semi-monthly', 'Monthly']], ['payType', 'Pay Type', 'select', ['Monthly', 'Daily', 'Hourly']], ['minimumWage', 'Minimum Wage Earner', 'select', ['Yes', 'No']], ['ecolaEligible', 'ECOLA Eligible', 'select', ['Yes', 'No']], ['taxType', 'Tax Type', 'select', ['Compensation', 'Annualized', 'Direct', 'Expanded', 'Final']], ['directTaxRate', 'Direct Tax Rate (%)', 'number'], ['taxTable', 'Withholding Tax Table'], ['takeHomePolicy', 'Take-Home Pay Policy Code'], ['deductionHierarchy', 'Deduction Hierarchy'], ['overtimeRate', 'Overtime Related Area'], ['workDays', 'Work Days'], ['absenceClass', 'Absence Classification'], ['tardinessClass', 'Tardiness Classification'], ['undertimeClass', 'Undertime Classification'], ['overtimeClass', 'Overtime Classification'], ['timekeepingExempt', 'Timekeeping Exempt', 'select', ['No', 'Yes']], ['bankCompanyCode', 'Bank Company Code'], ['holidayGroup', 'Holiday Group'], ['reasonSeparation', 'Reason of Separation'], ['paymentMode', 'Payment Mode', 'select', ['Bank Transfer', 'Cash', 'Check']],
  // Retirement inputs required by the Retirement Pay workbook (Possible Employee Set Up).
  ['retirementDate', 'Date of Retirement', 'date'], ['retirementPlanType', 'Retirement Plan Type', 'select', ['RA 7641 statutory plan member', 'RA 4917 company plan member']], ['dailyRateDivisor', 'Daily Rate Divisor', 'number'],
];
const employeeRecordSeed = Object.fromEntries(employeeRecordFields.map(([key, , type, options]) => {
  if (type === 'date') return [key, '2026-01-01'];
  if (type === 'select') return [key, options[0]];
  if (type === 'number') return [key, key === 'dailyRateDivisor' ? '30' : '0'];
  return [key, key.includes('Status') ? 'Active' : 'Configured'];
}));
const employeeRecordDefinitions = [
  { key: 'contracts', title: 'Employment Contract', columns: [['number', 'Contract No.'], ['dateCreated', 'Date Created'], ['dateSigned', 'Date Signed'], ['name', 'Contract Name']], fields: [['number', 'Employment Contract Number'], ['dateCreated', 'Date Created', 'date'], ['dateSigned', 'Date Signed', 'date'], ['name', 'Contract Name'], ['remarks', 'Remarks']] },
  { key: 'officeLocations', title: 'Office Location Record', columns: [['office', 'Present Office Location'], ['site', 'Present Site'], ['effectiveDate', 'Date Changed']], fields: [['office', 'Present Office Location'], ['site', 'Present Site'], ['effectiveDate', 'Effective Date', 'date']] },
  { key: 'departments', title: 'Department and Cost Center History', columns: [['department', 'Department'], ['costCenter', 'Cost Center'], ['effectiveDate', 'Effective Date'], ['status', 'Status']], fields: [['department', 'Department'], ['division', 'Division'], ['section', 'Section'], ['costCenter', 'Cost Center'], ['effectiveDate', 'Effective Date', 'date'], ['status', 'Status', 'select', ['Active', 'Historical']]] },
  { key: 'shifts', title: 'Shift Schedule History', columns: [['shift', 'Shift Schedule'], ['effectiveDate', 'Effective Date'], ['endDate', 'End Date'], ['timezone', 'Timezone']], fields: [['shift', 'Shift Schedule'], ['effectiveDate', 'Effective Date', 'date'], ['endDate', 'End Date', 'date'], ['timezone', 'Timezone'], ['workHours', 'Work Hours', 'number'], ['restDay', 'Rest Day']] },
  { key: 'fixedEarnings', title: 'Fixed Earnings and Allowances', columns: [['code', 'Earning Code'], ['name', 'Name'], ['amount', 'Amount'], ['frequency', 'Frequency']], fields: [['code', 'Earning Code'], ['name', 'Earning Name'], ['amount', 'Amount', 'number'], ['frequency', 'Frequency', 'select', ['Every Payroll', 'First Half', 'Second Half', 'Monthly']], ['effectiveDate', 'Effective Date', 'date'], ['taxability', 'Taxability', 'select', ['Taxable', 'Non-taxable', 'De Minimis']]] },
  { key: 'fixedReimbursements', title: 'Fixed Reimbursements', columns: [['code', 'Reimbursement Code'], ['name', 'Name'], ['amount', 'Amount'], ['frequency', 'Frequency']], fields: [['code', 'Reimbursement Code'], ['name', 'Reimbursement Name'], ['amount', 'Amount', 'number'], ['frequency', 'Frequency', 'select', ['Every Payroll', 'First Half', 'Second Half', 'Monthly']], ['effectiveDate', 'Effective Date', 'date'], ['receiptRequired', 'Receipt Required', 'select', ['Yes', 'No']]] },
  { key: 'fixedBonuses', title: 'Fixed Bonuses', columns: [['code', 'Bonus Code'], ['name', 'Name'], ['basis', 'Basis'], ['releaseMonth', 'Release Month']], fields: [['code', 'Bonus Code'], ['name', 'Bonus Name'], ['basis', 'Computation Basis'], ['releaseMonth', 'Release Month'], ['taxability', 'Taxability', 'select', ['Taxable', 'Non-taxable']], ['employeeGroup', 'Employee Group']] },
  { key: 'fixedDeductions', title: 'Fixed Deductions', columns: [['code', 'Deduction Code'], ['name', 'Name'], ['amount', 'Amount'], ['frequency', 'Frequency']], fields: [['code', 'Deduction Code'], ['name', 'Deduction Name'], ['amount', 'Amount', 'number'], ['frequency', 'Frequency', 'select', ['Every Payroll', 'First Half', 'Second Half', 'Monthly']], ['priority', 'Deduction Priority', 'number'], ['effectiveDate', 'Effective Date', 'date']] },
  { key: 'loanProfile', title: 'Loan Profile', columns: [['reference', 'Loan Reference'], ['type', 'Loan Type'], ['amortization', 'Amortization'], ['balance', 'Balance']], fields: [['reference', 'Loan Reference'], ['type', 'Loan Type', 'select', ['SSS', 'HDMF', 'Company']], ['dateGranted', 'Date Granted', 'date'], ['principal', 'Principal', 'number'], ['interest', 'Interest', 'number'], ['amortization', 'Amortization', 'number'], ['balance', 'Balance', 'number']] },
  { key: 'currencyHistory', title: 'Multi-Currency History', columns: [['currency', 'Currency'], ['rate', 'Exchange Rate'], ['effectiveDate', 'Effective Date'], ['status', 'Status']], fields: [['currency', 'Currency', 'select', ['PHP', 'USD', 'SGD']], ['rate', 'Exchange Rate', 'number'], ['effectiveDate', 'Effective Date', 'date'], ['status', 'Status', 'select', ['Active', 'Historical']]] },
  { key: 'jobTitles', title: 'Job Title Record', columns: [['jobTitle', 'Present Job Title'], ['jobLevel', 'Present Job Level'], ['jobGrade', 'Present Job Grade'], ['effectiveDate', 'Date Changed']], fields: [['jobTitle', 'Present Job Title'], ['jobLevel', 'Present Job Level'], ['jobGrade', 'Present Job Grade'], ['effectiveDate', 'Date Changed', 'date'], ['manager', 'Present Reporting Manager'], ['directReports', 'Present Direct Reports']] },
  { key: 'promotions', title: 'Promotion Record', columns: [['date', 'Date'], ['jobTitle', 'Job Title'], ['salaryAmount', 'Salary Amount'], ['percentage', 'Salary Change %'], ['effectiveDate', 'Effective Date']], fields: [['date', 'Date of Promotion', 'date'], ['jobTitle', 'New Job Title'], ['salaryAmount', 'New Salary Amount', 'number'], ['percentage', 'Salary Percentage of Change', 'number'], ['effectiveDate', 'Effective From', 'date'], ['remarks', 'Remarks']] },
  { key: 'performance', title: 'Performance Record', columns: [['cycle', 'Performance Review Cycle'], ['startDate', 'Start Date'], ['endDate', 'End Date'], ['status', 'Review Status']], fields: [['cycle', 'Performance Review Cycle'], ['startDate', 'Start Date', 'date'], ['endDate', 'End Date', 'date'], ['goals', 'Goals'], ['competency', 'Competency Name'], ['feedback', 'Feedback Received'], ['status', 'Performance Review Status', 'select', ['Done', 'Not happened yet']]] },
  { key: 'recognitions', title: 'Recognition/s', columns: [['title', 'Recognition Title'], ['date', 'Awarded On'], ['recognizedBy', 'Recognized By'], ['remarks', 'Remarks']], fields: [['title', 'Recognition Title'], ['date', 'Awarded / Recognized On', 'date'], ['recognizedBy', 'Recognized By'], ['remarks', 'Remarks']] },
  { key: 'training', title: 'Training Record', columns: [['date', 'Date Taken'], ['name', 'Training Name'], ['remarks', 'Remarks']], fields: [['name', 'Training Name'], ['date', 'Date Taken', 'date'], ['remarks', 'Remarks']] },
  { key: 'licenses', title: 'Professional License', columns: [['type', 'Examination Type'], ['rating', 'Rating'], ['date', 'Examination Date'], ['number', 'License Number']], fields: [['type', 'Examination Type'], ['rating', 'Rating', 'number'], ['date', 'Examination Date', 'date'], ['number', 'License Number'], ['releaseDate', 'Date Released', 'date'], ['expirationDate', 'Expiration Date', 'date']] },
  { key: 'certifications', title: 'Certifications', columns: [['name', 'Certificate Name'], ['number', 'License Number'], ['date', 'Date Taken'], ['releaseDate', 'Date Released']], fields: [['name', 'Certificate Name'], ['number', 'Certificate Number'], ['date', 'Date Taken', 'date'], ['releaseDate', 'Date Released', 'date'], ['expirationDate', 'Expiration Date', 'date'], ['remarks', 'Remarks']] },
  { key: 'medical', title: 'Medical Record', columns: [['bloodType', 'Blood Type'], ['date', 'Date Recorded'], ['condition', 'Medical Condition'], ['diagnosis', 'Current Diagnosis']], fields: [['bloodType', 'Blood Type'], ['date', 'Date Recorded', 'date'], ['condition', 'Medical Condition'], ['diagnosis', 'Current Diagnosis'], ['contactName', 'Medical Care Contact Name'], ['profession', 'Profession'], ['contact', 'Contact Information'], ['dietary', 'Dietary Restrictions']] },
  { key: 'disciplinary', title: 'Disciplinary Record', columns: [['date', 'Incident Date'], ['summary', 'Summary of Issue or Event'], ['witnesses', 'Witnesses'], ['action', 'Disciplinary Action']], fields: [['date', 'Incident Date', 'date'], ['summary', 'Summary of Issue or Event'], ['witnesses', 'Witnesses'], ['location', 'Location'], ['violation', 'Violation'], ['comments', 'Employee Comments'], ['action', 'Disciplinary Actions'], ['remarks', 'Remarks']] },
  { key: 'accountability', title: 'Accountability Record', columns: [['role', 'Role Name']], fields: [['role', 'Role Name']] },
  { key: 'notes', title: 'Employee Notes and Milestones', columns: [['date', 'Date'], ['time', 'Time'], ['user', 'Recorded By'], ['note', 'Note']], fields: [['date', 'Date', 'date'], ['time', 'Time'], ['user', 'Recorded By'], ['note', 'Note', 'textarea']] },
];
const seedRecordRows = Object.fromEntries(employeeRecordDefinitions.map((definition, index) => [definition.key, index < 4 ? [{ id: 1, ...Object.fromEntries(definition.fields.map(field => [field[0], field[2] === 'date' ? '2026-01-01' : field[2] === 'number' ? '100' : `${field[1]} 1`])) }] : []]));

export function EmployeeRecord({ employee, notify }) {
  const [base, setBase] = usePersistentState(`atlas-record-${employee.id}-v2`, employeeRecordSeed);
  const [rows, setRows] = usePersistentState(`atlas-record-rows-${employee.id}-v3`, seedRecordRows);
  const sections = employeeRecordDefinitions.map((definition, index) => <RecordSection key={definition.key} definition={definition} rows={rows[definition.key] || []} setRows={next => setRows(previous => ({ ...previous, [definition.key]: next }))} notify={notify} initiallyOpen={index < 3} />);
  return <BaseForm title="Employee Record" fields={employeeRecordFields} value={base} setValue={setBase} notify={notify} sections={<div className="record-data-stack">{sections}</div>} />;
}

const benefitDefinitions = [
  { key: 'overview', title: 'Benefits Overview', singular: 'Benefit', columns: [['name', 'Benefit Name'], ['amount', 'Benefit Amount'], ['startDate', 'Benefit Start Date'], ['endDate', 'Benefit End Date']], fields: [['name', 'Benefit Name'], ['amount', 'Benefit Amount', 'number'], ['startDate', 'Benefit Start Date', 'date'], ['endDate', 'Benefit End Date', 'date']] },
  { key: 'history', title: 'Benefits History', columns: [['year', 'Applicable Year'], ['dateCreated', 'Date Credited'], ['creditAmount', 'Credit Amount'], ['approvedAmount', 'Total Approved Amount'], ['remainingBalance', 'Total Remaining Balance']], fields: [['year', 'Applicable Year', 'number'], ['dateCreated', 'Date Credited', 'date'], ['creditAmount', 'Credit Amount', 'number'], ['approvedAmount', 'Total Approved Amount', 'number'], ['remainingBalance', 'Total Remaining Balance', 'number']] },
];
const seedBenefits = { overview: [{ id: 1, name: 'Medical Allowance', amount: '35000', startDate: '2026-01-01', endDate: '2026-12-31' }], history: [{ id: 1, year: '2026', dateCreated: '2026-11-01', creditAmount: '2000', approvedAmount: '1000', remainingBalance: '1000' }] };
export function Benefits({ employee, notify }) { const [rows, setRows] = usePersistentState(`atlas-benefits-${employee.id}-v2`, seedBenefits); return <div className="profile-module record-data-stack">{benefitDefinitions.map(definition => <RecordSection key={definition.key} definition={definition} rows={rows[definition.key]} setRows={next => setRows(previous => ({ ...previous, [definition.key]: next }))} notify={notify} />)}</div>; }

const timeOffDefinitions = [
  { key: 'overview', title: 'Time Off Overview', columns: [['leaveType', 'Leave Type'], ['opening', 'Opening Balance'], ['approved', 'Approved Leave'], ['forApproval', 'Leave for Approval'], ['remaining', 'Remaining']], fields: [['leaveType', 'Leave Type'], ['effectiveDate', 'Effective Date', 'date'], ['opening', 'Opening Balance', 'number'], ['accrual', 'Accrued Leave', 'number'], ['approved', 'Approved / Used Leave', 'number'], ['forApproval', 'Leave for Approval', 'number'], ['remaining', 'Closing / Remaining Balance', 'number'], ['allowNegative', 'Allow Negative Balance', 'select', ['Yes', 'No']], ['expirationDate', 'Expiration / Forfeiture Date', 'date']] },
  { key: 'history', title: 'Time Off Ledger and History', columns: [['year', 'Applicable Year'], ['approved', 'Approved Leave'], ['converted', 'Leave Converted'], ['forfeited', 'Forfeited Leave']], fields: [['year', 'Applicable Year', 'number'], ['transactionDate', 'Transaction Date', 'date'], ['transactionType', 'Transaction Type', 'select', ['Accrual', 'Usage', 'Adjustment', 'Conversion', 'Forfeiture']], ['approved', 'Approved Leave', 'number'], ['converted', 'Leave Converted', 'number'], ['forfeited', 'Forfeited Leave', 'number'], ['remarks', 'Remarks', 'textarea']] },
];
const seedTimeOff = { overview: [{ id: 1, leaveType: 'Vacation Leave', opening: '20', approved: '17', forApproval: '0', remaining: '3' }, { id: 2, leaveType: 'Sick Leave', opening: '10', approved: '8', forApproval: '0', remaining: '2' }], history: [{ id: 1, year: '2026', approved: '105', converted: '83', forfeited: '22' }] };
export function TimeOff({ employee, notify }) { const [rows, setRows] = usePersistentState(`atlas-timeoff-${employee.id}-v3`, seedTimeOff); return <div className="profile-module record-data-stack">{timeOffDefinitions.map(definition => <RecordSection key={definition.key} definition={definition} rows={rows[definition.key]} setRows={next => setRows(previous => ({ ...previous, [definition.key]: next }))} notify={notify} />)}</div>; }

const contactFields = [['presentAddress', 'Present Home Address'], ['permanentAddress', 'Permanent Home Address'], ['foreignAddress', 'Foreign Address'], ['telephone', 'Personal Tel. No.'], ['mobile', 'Personal Mobile No.'], ['alternateMobile', 'Alternative Mobile No.'], ['email', 'Personal Email Address', 'email'], ['alternateEmail', 'Alternative Personal Email Address', 'email'], ['workPhone', 'Work Phone'], ['companyEmail', 'Company Email Address', 'email']];
const contactSeed = { presentAddress: 'Makati City, Philippines', permanentAddress: 'Manila, Philippines', foreignAddress: 'None', telephone: '+63 2 8000 0000', mobile: '+63 917 000 0000', alternateMobile: '+63 918 000 0000', email: 'john.doe@email.com', alternateEmail: 'jdoe@email.com', workPhone: '+63 2 8123 4567', companyEmail: 'john.doe@abccompany.ph' };
const emergencyDefinition = { key: 'emergency', title: 'Emergency Contact', columns: [['name', 'Emergency Contact Person'], ['relationship', 'Relationship'], ['mobile', 'Mobile Number'], ['address', 'Address']], fields: [['name', 'Emergency Contact Person'], ['relationship', 'Relationship', 'select', ['Spouse', 'Parent', 'Sibling', 'Friend']], ['mobile', 'Personal Mobile No.'], ['address', 'Address']] };
export function Contacts({ employee, notify }) { const [base, setBase] = usePersistentState(`atlas-contact-${employee.id}-v2`, contactSeed); const [rows, setRows] = usePersistentState(`atlas-emergency-${employee.id}-v2`, [{ id: 1, name: 'Rachel Doe', relationship: 'Mother', mobile: '+63 900 000 0000', address: 'Manila, Philippines' }]); return <BaseForm title="Contacts" fields={contactFields} value={base} setValue={setBase} notify={notify} sections={<div className="record-data-stack"><RecordSection definition={emergencyDefinition} rows={rows} setRows={setRows} notify={notify} /></div>} />; }

const accountDefinition = { title: 'Account Settings Information', singular: 'Account Settings Information', columns: [['username', 'Username'], ['password', 'Password'], ['locked', 'Account is Locked'], ['status', 'Status of Access'], ['ssoStatus', 'Single Sign-on Status'], ['ssoUsername', 'Single Sign-on Username']], fields: [['username', 'Username'], ['password', 'Password', 'password'], ['locked', 'Account is Locked', 'select', ['Yes', 'No']], ['status', 'Status of Access', 'select', ['Enabled', 'Disabled']], ['ssoStatus', 'Single Sign-on Status', 'select', ['Enabled', 'Disabled']], ['ssoUsername', 'Single Sign-on Username'], ['action', 'Account Action', 'select', ['Unlock', 'Block', 'Reset Password', 'No action']]] };
const seedAccounts = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, username: ['EACarter', 'LBJohnson', 'SCBennett', 'ODSmith', 'NEBrown', 'AFDavis', 'JGWilson', 'MHAnderson', 'LIMoore', 'EJMillar'][index], password: '************', locked: index % 3 === 0 ? 'Yes' : 'No', status: index % 4 === 1 ? 'Disabled' : 'Enabled', ssoStatus: index % 5 === 4 ? 'Disabled' : 'Enabled', ssoUsername: `sso-${index + 1}` }));
export function AccountSettings({ notify }) {
  const [rows, setRows] = usePersistentState('atlas-account-settings-v2', seedAccounts); const [query, setQuery] = useState(''); const [editing, setEditing] = useState(undefined); const [deleting, setDeleting] = useState(null);
  const [filter, setFilter] = useState(EMPTY_ACCOUNT_FILTER); const [filterOpen, setFilterOpen] = useState(false);
  const filtered = rows.filter(row => `${row.username} ${row.status} ${row.ssoStatus}`.toLowerCase().includes(query.toLowerCase()) && matchesAccountFilter(row, filter));
  const save = draft => { if (draft.id) setRows(rows.map(row => row.id === draft.id ? draft : row)); else setRows([{ ...draft, id: Date.now() }, ...rows]); setEditing(undefined); notify({ type: 'success', message: `Account ${draft.id ? 'updated' : 'added'} successfully.` }); };
  return <section className="employee-directory account-settings-page"><div className="page-heading"><div><p className="breadcrumb">Core / Employee Masterfile / Account Settings</p><h1>Account Settings Information</h1><p className="page-description">Manage access, lock status and single sign-on credentials for employee accounts.</p></div></div><div className="employee-directory-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search..." /></div><FilterButton active={accountFilterIsActive(filter)} onClick={() => setFilterOpen(true)} /><div className="toolbar-spacer" /><button className="button primary" onClick={() => setEditing(null)}><Plus /> Add</button><ExportMenu onPick={format => { exportAccounts(rows, format); notify({ type: 'success', message: `Account Settings ${format === 'docx' ? 'Word' : format.toUpperCase()} export downloaded.` }); }} /></div><div className="table-card employee-directory-card"><table><thead><tr>{accountDefinition.columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Action</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}>{accountDefinition.columns.map(([key]) => <td key={key}>{key === 'status' || key === 'ssoStatus' ? <span className={`status-pill ${String(row[key]).toLowerCase()}`}>{row[key]}</span> : row[key]}</td>)}<td><div className="row-actions always"><button onClick={() => setEditing(row)}><PencilSimple /></button><button onClick={() => setDeleting(row)}><Trash /></button></div></td></tr>)}</tbody></table></div><div className="pagination"><span>Displaying <strong>{filtered.length}</strong> accounts</span><div><button disabled>«</button><strong>1</strong><span>of 1</span><button disabled>»</button></div></div>{filterOpen && <AccountFilterModal applied={filter} onApply={next => { setFilter(next); setFilterOpen(false); }} onClose={() => setFilterOpen(false)} />}{editing !== undefined && <RecordModal definition={accountDefinition} record={editing || null} onClose={() => setEditing(undefined)} onSave={save} />}{deleting && <DeleteModal label={deleting.username} onClose={() => setDeleting(null)} onDelete={() => { setRows(rows.filter(row => row.id !== deleting.id)); setDeleting(null); notify({ type: 'success', message: 'Account deleted.' }); }} />}</section>;
}

/* Leaves, Documents and Custom Fields tabs, and Masterfile Configuration, as in Atlas Core. */

const leaveDefinitions = [
  { key: 'overview', title: 'Leaves Overview', singular: 'Leave Information', columns: [['leaveType', 'Leave Type'], ['opening', 'Opening Balance'], ['credit', 'Credit'], ['approved', 'Approved Leave'], ['forApproval', 'Leave for Approval'], ['converted', 'Leave Converted'], ['forfeited', 'Forfeited Leave'], ['balance', 'Leave Balance as of Today']], fields: [['leaveType', 'Leave Type', 'select', ['Vacation Leave', 'Sick Leave', 'Emergency Leave', 'Maternity Leave', 'Paternity Leave', 'Solo Parent Leave', 'Bereavement Leave']], ['opening', 'Opening Balance', 'number'], ['credit', 'Credit', 'number'], ['approved', 'Approved Leave', 'number'], ['forApproval', 'Leave for Approval', 'number'], ['converted', 'Leave Converted', 'number'], ['forfeited', 'Forfeited Leave', 'number'], ['balance', 'Leave Balance as of Today', 'number']] },
  { key: 'history', title: 'Leaves History', singular: 'Leave Applicable Year', columns: [['year', 'Applicable Year'], ['approved', 'Approved Leave'], ['converted', 'Leave Converted'], ['forfeited', 'Forfeited Leave']], fields: [['year', 'Applicable Year', 'select', ['2024', '2025', '2026']], ['approved', 'Approved Leave for the Applicable Year', 'number'], ['converted', 'Leave Converted for the Applicable Year', 'number'], ['forfeited', 'Forfeited Leave for the Applicable Year', 'number']] },
];
const seedLeaves = {
  overview: [
    { id: 1, leaveType: 'Vacation Leave', opening: '5', credit: '15', approved: '8', forApproval: '1', converted: '0', forfeited: '0', balance: '11' },
    { id: 2, leaveType: 'Sick Leave', opening: '3', credit: '15', approved: '4', forApproval: '0', converted: '5', forfeited: '0', balance: '9' },
  ],
  history: [{ id: 1, year: '2025', approved: '18', converted: '5', forfeited: '2' }],
};
export function Leaves({ employee, notify }) { const [rows, setRows] = usePersistentState(`atlas-leaves-${employee.id}-v1`, seedLeaves); return <div className="profile-module record-data-stack">{leaveDefinitions.map(definition => <RecordSection key={definition.key} definition={definition} rows={rows[definition.key]} setRows={next => setRows(previous => ({ ...previous, [definition.key]: next }))} notify={notify} />)}</div>; }

const MAX_DOCUMENT_MB = 5;
const fileSizeLabel = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const seedDocuments = [
  { id: 1, title: 'Certificate of Employment', fileName: 'COE_2025.pdf', fileType: 'PDF', fileSize: '182 KB', uploadedBy: 'Client Admin', dateUploaded: '2025-11-03', dateCreated: '2025-11-03' },
  { id: 2, title: 'Signed Employment Contract', fileName: 'Contract_JDoe.docx', fileType: 'DOCX', fileSize: '96 KB', uploadedBy: 'Client Admin', dateUploaded: '2024-02-01', dateCreated: '2024-02-01' },
];
export function Documents({ employee, notify }) {
  const [rows, setRows] = usePersistentState(`atlas-employee-documents-${employee.id}-v1`, seedDocuments);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  const filtered = rows.filter(row => `${row.title} ${row.fileName} ${row.fileType}`.toLowerCase().includes(query.toLowerCase()));
  const save = event => {
    event.preventDefault();
    const draft = editing;
    if (!draft.title?.trim()) return notify({ type: 'error', message: 'Document Title is required.' });
    if (!draft.fileName) return notify({ type: 'error', message: 'Upload a file for this document.' });
    const today = new Date().toISOString().slice(0, 10);
    if (draft.id) setRows(rows.map(row => row.id === draft.id ? { ...draft, title: draft.title.trim() } : row));
    else setRows([{ ...draft, title: draft.title.trim(), id: Date.now(), uploadedBy: 'Client Admin', dateUploaded: today, dateCreated: today }, ...rows]);
    setEditing(undefined);
    notify({ type: 'success', message: `Document ${draft.id ? 'updated' : 'uploaded'} successfully.` });
  };
  const pickFile = file => {
    if (!file) return;
    if (file.size > MAX_DOCUMENT_MB * 1048576) return notify({ type: 'error', message: `The file is larger than ${MAX_DOCUMENT_MB} MB.` });
    setEditing(previous => ({ ...previous, fileName: file.name, fileType: (file.name.split('.').pop() || '').toUpperCase(), fileSize: fileSizeLabel(file.size), dateUploaded: new Date().toISOString().slice(0, 10) }));
  };
  return <div className="profile-module record-data-stack">
    <section className="employee-data-section compact-record-section">
      <div className="employee-section-heading"><span>Documents</span></div>
      <div className="employee-section-body">
        <div className="employee-directory-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search document title or file name..." /><MagnifyingGlass /></div><div className="toolbar-spacer" /><button className="button primary" onClick={() => setEditing({ title: '' })}><UploadSimple /> Upload Document</button></div>
        <div className="employee-table-wrap"><table className="employee-table"><thead><tr><th>Document Title</th><th>File Name</th><th>File Type</th><th>File Size</th><th>Uploaded By</th><th>Date Uploaded</th><th>Date Created</th><th>Action</th></tr></thead><tbody>{filtered.length ? filtered.map(row => <tr key={row.id}><td>{row.title}</td><td>{row.fileName}</td><td>{row.fileType}</td><td>{row.fileSize}</td><td>{row.uploadedBy}</td><td>{row.dateUploaded}</td><td>{row.dateCreated}</td><td><div className="row-actions always"><button onClick={() => setEditing(row)} aria-label="Edit"><PencilSimple /></button><button onClick={() => download(row.fileName, `${row.title}\n(placeholder copy of ${row.fileName})`, 'text/plain')} aria-label="Download"><DownloadSimple /></button><button onClick={() => setDeleting(row)} aria-label="Delete"><Trash /></button></div></td></tr>) : <tr><td colSpan={8}><div className="empty-state compact"><h3>No documents yet</h3><p>Upload the employee documents here.</p></div></td></tr>}</tbody></table></div>
      </div>
    </section>
    {editing !== undefined && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(undefined); }}>
      <section className="modal employee-entry-modal profile-entry-modal" role="dialog" aria-modal="true" aria-label={`${editing.id ? 'Edit' : 'Upload'} Document`}>
        <header><h2>{editing.id ? 'Edit' : 'Upload'} Document</h2><button className="icon-button" onClick={() => setEditing(undefined)} aria-label="Close"><X /></button></header>
        <form onSubmit={save}><div className="employee-form-grid">
          <label>Document Title <span className="required">*</span><input value={editing.title || ''} onChange={event => setEditing({ ...editing, title: event.target.value })} placeholder="Input Document Title" /></label>
          <label>Upload File <span className="required">*</span><input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={event => pickFile(event.target.files?.[0])} /><small>{editing.fileName ? `Current file: ${editing.fileName} (${editing.fileSize})` : `PDF, Word or image. Maximum file size ${MAX_DOCUMENT_MB} MB.`}</small></label>
        </div><footer className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={() => setEditing(undefined)}>Cancel</button><button className="button primary">Save</button></footer></form>
      </section>
    </div>}
    {deleting && <DeleteModal label={deleting.title} onClose={() => setDeleting(null)} onDelete={() => { setRows(rows.filter(row => row.id !== deleting.id)); setDeleting(null); notify({ type: 'success', message: 'Document deleted.' }); }} />}
  </div>;
}

/** Field names come from Reference Table ▸ Specific ▸ Custom Fields. */
export function CustomFields({ employee, notify, fieldNames = [] }) {
  const definition = { key: 'customFields', title: 'Custom Fields', singular: 'Custom Field', columns: [['fieldName', 'Field Name'], ['fieldValue', 'Field Value'], ['dateCreated', 'Date Created']], fields: [['fieldName', 'Field Name', 'select', fieldNames], ['fieldValue', 'Field Value']] };
  const [rows, setRows] = usePersistentState(`atlas-custom-fields-${employee.id}-v1`, [{ id: 1, fieldName: fieldNames[0] || 'T-Shirt Size', fieldValue: 'L', dateCreated: '2026-01-15' }]);
  const setDated = next => {
    const today = new Date().toISOString().slice(0, 10);
    const names = next.map(row => row.fieldName);
    if (names.some((name, index) => names.indexOf(name) !== index)) return notify({ type: 'error', message: 'Each custom field can be set once per employee. Edit the existing value instead.' });
    setRows(next.map(row => row.dateCreated ? row : { ...row, dateCreated: today }));
  };
  return <div className="profile-module record-data-stack"><RecordSection definition={definition} rows={rows} setRows={setDated} notify={notify} /></div>;
}

export function MasterfileConfiguration({ notify, definitions }) {
  const [rows, setRows] = usePersistentState('atlas-masterfile-configuration-v1', definitions.map((row, index) => ({ id: index + 1, ...row })));
  const [draft, setDraft] = useState(rows);
  const [tab, setTab] = useState('personal');
  const [query, setQuery] = useState('');
  useEffect(() => setDraft(rows), [rows]);
  const sections = [...new Set(draft.filter(row => row.tab === tab).map(row => row.section))];
  const matches = row => `${row.section} ${row.field}`.toLowerCase().includes(query.toLowerCase());
  const change = (id, patch) => setDraft(previous => previous.map(row => row.id === id ? { ...row, ...patch } : row));
  const dirty = JSON.stringify(draft) !== JSON.stringify(rows);
  const save = () => { setRows(draft); notify({ type: 'success', message: 'Employee Masterfile Configuration saved.' }); };
  return <section className="employee-directory masterfile-configuration-page">
    <div className="page-heading"><div><p className="breadcrumb">Core / Employee Masterfile / Masterfile Configuration</p><h1>Employee Masterfile Configuration</h1><p className="page-description">Choose which employee fields are required and which the employee may edit in self-service.</p></div></div>
    <nav className="employee-tabs">{[['personal', 'Personal Details'], ['record', 'Employee Record'], ['contacts', 'Contacts']].map(([key, label]) => <button key={key} className={key === tab ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</nav>
    <div className="employee-directory-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search section or form name..." /><MagnifyingGlass /></div><div className="toolbar-spacer" /><button className="button secondary" disabled={!dirty} onClick={() => setDraft(rows)}>Cancel</button><button className="button primary" disabled={!dirty} onClick={save}>Save</button></div>
    <div className="record-data-stack">{sections.map(section => {
      const fields = draft.filter(row => row.tab === tab && row.section === section && matches(row));
      if (!fields.length) return null;
      return <section key={section} className="employee-data-section compact-record-section">
        <div className="employee-section-heading"><span>{section}</span></div>
        <div className="employee-section-body"><div className="employee-table-wrap"><table className="employee-table"><thead><tr><th>Form Name</th><th style={{ width: 200 }}>Requirement</th><th style={{ width: 220 }}>Editable by Employee?</th></tr></thead><tbody>{fields.map(row => <tr key={row.id}><td>{row.field}</td><td><select value={row.required ? 'Required' : 'Optional'} onChange={event => change(row.id, { required: event.target.value === 'Required' })}><option>Optional</option><option>Required</option></select></td><td><input type="checkbox" checked={row.editable} onChange={event => change(row.id, { editable: event.target.checked })} aria-label={`${row.field} editable by employee`} /></td></tr>)}</tbody></table></div></div>
      </section>;
    })}</div>
  </section>;
}
