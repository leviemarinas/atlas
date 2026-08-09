import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [query, setQuery] = useState(''); const [editing, setEditing] = useState(undefined); const [deleting, setDeleting] = useState(null); const uploadRef = useRef(null);
  const filtered = useMemo(() => employees.filter(item => `${item.id} ${item.name} ${item.role} ${item.origin || ''} ${item.status || ''}`.toLowerCase().includes(query.toLowerCase())), [employees, query]);
  const save = draft => {
    const normalized = { ...draft, id: draft.id || draft.employeeCode, name: `${draft.firstName} ${draft.middleName || ''} ${draft.lastName}`.replace(/\s+/g, ' ').trim(), initials: `${draft.firstName?.[0] || ''}${draft.lastName?.[0] || ''}`.toUpperCase(), location: draft.location || 'PBS | Makati' };
    if (employees.some(item => item.id === normalized.id)) setEmployees(employees.map(item => item.id === normalized.id ? normalized : item)); else setEmployees([normalized, ...employees]);
    setEditing(undefined); notify({ type: 'success', message: `Employee ${draft.id ? 'updated' : 'added'} successfully.` });
  };
  const importCsv = event => {
    const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader();
    reader.onload = () => { const lines = String(reader.result).split(/\r?\n/).filter(Boolean); const headers = lines.shift().split(',').map(value => value.replaceAll('"', '').trim()); const added = lines.map((line, index) => { const values = line.split(',').map(value => value.replaceAll('"', '').trim()); const row = Object.fromEntries(headers.map((header, i) => [header, values[i]])); return { ...row, id: row.employeeCode || `UPL-${Date.now() + index}`, name: `${row.firstName || ''} ${row.lastName || ''}`.trim(), initials: `${row.firstName?.[0] || ''}${row.lastName?.[0] || ''}`.toUpperCase(), location: 'PBS | Makati' }; }); setEmployees([...added, ...employees]); notify({ type: 'success', message: `${added.length} employees imported.` }); };
    reader.readAsText(file); event.target.value = '';
  };
  const exportCsv = () => { const csv = ['Employee Code,First Name,Middle Name,Last Name,Origin,Employment Status', ...filtered.map(item => [item.id, item.firstName, item.middleName, item.lastName, item.origin, item.status].map(value => `"${value || ''}"`).join(','))].join('\n'); download('employee-masterfile.csv', csv); notify({ type: 'success', message: 'Employee Masterfile export downloaded.' }); };
  return <section className="employee-directory">
    <div className="page-heading"><div><p className="breadcrumb">Core / Employee Masterfile</p><h1>Employee Information</h1><p className="page-description">Maintain personal, employment, benefit, time-off, payroll, and contact records in one employee profile.</p></div></div>
    <div className="employee-directory-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search employee code or name..." /><MagnifyingGlass /></div><div className="toolbar-spacer" /><button className="button primary" onClick={() => setEditing(null)}><Plus /> Add</button><button className="button secondary" onClick={() => uploadRef.current?.click()}><UploadSimple /> Upload</button><input ref={uploadRef} className="sr-only" type="file" accept=".csv" onChange={importCsv} /><button className="button secondary" onClick={exportCsv}><DownloadSimple /> Export</button></div>
    <div className="table-card employee-directory-card"><table><thead><tr><th>Profile</th><th>Employee Code</th><th>First Name</th><th>Last Name</th><th>Origin</th><th>Employment Status</th><th>Action</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id}><td><span className="directory-avatar">{item.initials}</span></td><td><button className="table-link" onClick={() => onSelect(item)}>{item.id}</button></td><td>{item.firstName || item.name.split(' ')[0]}</td><td>{item.lastName || item.name.split(' ').slice(-1)[0]}</td><td>{item.origin || 'Philippines'}</td><td>{item.status || 'Full-time'}</td><td><div className="row-actions always"><button onClick={() => setEditing({ ...item, employeeCode: item.id, firstName: item.firstName || item.name.split(' ')[0], lastName: item.lastName || item.name.split(' ').slice(-1)[0] })}><PencilSimple /></button><button onClick={() => setDeleting(item)}><Trash /></button></div></td></tr>)}</tbody></table></div>
    <div className="pagination"><span>Displaying <strong>{filtered.length}</strong> of {employees.length} employees</span><div><button disabled>«</button><strong>1</strong><span>of 1</span><button disabled>»</button></div></div>
    {editing !== undefined && <RecordModal definition={directoryDefinition} record={editing || null} onClose={() => setEditing(undefined)} onSave={save} />}
    {deleting && <DeleteModal label={deleting.name} onClose={() => setDeleting(null)} onDelete={() => { setEmployees(employees.filter(item => item.id !== deleting.id)); setDeleting(null); notify({ type: 'success', message: 'Employee deleted.' }); }} />}
  </section>;
}

const personalBaseSeed = {
  employeeCode: '0000112345', firstName: 'John', middleName: 'Michael', lastName: 'Doe', displayName: 'John Doe', gender: 'Male', civilStatus: 'Married', birthdate: '1989-04-12', birthplace: 'Makati City', nationality: 'Filipino', ethnicity: 'Filipino', origin: 'Philippines', religion: 'Catholic', primaryLanguage: 'English', secondaryLanguage: 'Filipino', hobbies: 'Cycling, reading', dependents: '2', sssNumber: '34-1234567-8', sssWisp: 'WISP-000123', philhealthNumber: '12-345678901-2', tin: '123-456-789-000', birRdo: '047', peraCredit: '0', hdmfNumber: '1234-5678-9012', hdmfMp2: 'MP2-00421',
};
const personalFields = [
  ['employeeCode', 'Employee Code'], ['firstName', 'First Name'], ['middleName', 'Middle Name'], ['lastName', 'Last Name'], ['displayName', 'Display Name'], ['gender', 'Gender', 'select', ['Male', 'Female', 'Non-binary']], ['civilStatus', 'Civil Status', 'select', ['Single', 'Married', 'Widowed', 'Separated']], ['birthdate', 'Birthdate', 'date'], ['birthplace', 'Birth Place'], ['nationality', 'Nationality'], ['ethnicity', 'Ethnicity'], ['origin', 'Origin', 'select', ['Philippines', 'Singapore', 'United States']], ['religion', 'Religion'], ['primaryLanguage', 'Primary Language'], ['secondaryLanguage', 'Secondary Language'], ['hobbies', 'Hobbies / Interests'], ['dependents', 'No. of Dependents', 'number'], ['sssNumber', 'SSS Number'], ['sssWisp', 'SSS WISP Plus Number'], ['philhealthNumber', 'PhilHealth Number'], ['tin', 'BIR TIN'], ['birRdo', 'BIR RDO'], ['peraCredit', 'PERA Tax Credit', 'number'], ['hdmfNumber', 'HDMF Number'], ['hdmfMp2', 'HDMF MP2 Number'],
];

const personalDefinitions = [
  { key: 'identification', title: 'Valid Identification Cards', singular: 'Valid Identification Card', columns: [['type', 'ID Type'], ['number', 'ID Number'], ['issuedDate', 'Issued Date'], ['expirationDate', 'Expiration Date']], fields: [['type', 'ID Type'], ['number', 'ID Number'], ['issuedDate', 'Issued Date', 'date'], ['expirationDate', 'Expiration Date', 'date']] },
  { key: 'passport', title: 'Passport Information', columns: [['name', 'Passport Name'], ['number', 'Passport No.'], ['country', 'Issuing Country'], ['expirationDate', 'Expiration Date']], fields: [['name', 'Passport Name'], ['number', 'Passport Number'], ['country', 'Issuing Country'], ['issuedDate', 'Issued Date', 'date'], ['expirationDate', 'Expiration Date', 'date']] },
  { key: 'visa', title: 'Visa Information', columns: [['number', 'Visa Number'], ['country', 'Issuing Country'], ['issuedDate', 'Issued Date'], ['expirationDate', 'Expiration Date']], fields: [['number', 'Visa Number'], ['country', 'Issuing Country'], ['issuedDate', 'Issued Date', 'date'], ['expirationDate', 'Expiration Date', 'date']] },
  { key: 'education', title: 'Education Background', columns: [['school', 'Name of School'], ['address', 'School Address'], ['course', 'Course / Program'], ['level', 'Educational Level']], fields: [['school', 'Name of School'], ['address', 'School Address'], ['course', 'Course / Special Program'], ['level', 'Educational Level'], ['degree', 'Degree / Major'], ['dateFrom', 'Date From', 'date'], ['dateTo', 'Date To', 'date']] },
  { key: 'employmentHistory', title: 'Employment History', columns: [['company', 'Company'], ['address', 'Address'], ['contact', 'Contact'], ['jobTitle', 'Job Title']], fields: [['company', 'Previous Employer Name'], ['address', 'Previous Employer Address'], ['contact', 'Contact Information'], ['jobTitle', 'Previous Job Title'], ['description', 'Previous Job Description', 'textarea'], ['dateFrom', 'Date From', 'date'], ['dateTo', 'Date To', 'date'], ['salaryAmount', 'Previous Monthly Salary', 'number'], ['reason', 'Reason for Leaving']] },
  { key: 'organizations', title: 'Professional Organization', columns: [['name', 'Organization Name'], ['dateJoined', 'Date Joined'], ['status', 'Status'], ['position', 'Organization Position']], fields: [['name', 'Organization Name'], ['dateJoined', 'Date Joined', 'date'], ['status', 'Status', 'select', ['Active', 'Inactive']], ['position', 'Organization Position'], ['remarks', 'Remarks']] },
  { key: 'socialLinks', title: 'Social Links', columns: [['name', 'Link Name'], ['url', 'URL']], fields: [['name', 'Link Name'], ['url', 'URL', 'url']] },
];

const seedPersonalRows = {
  identification: [{ id: 1, type: 'Solo Parent ID', number: 'A1234567812', issuedDate: '2025-11-15', expirationDate: '2030-11-16' }],
  passport: [{ id: 1, name: 'John Doe', number: 'P1234567', country: 'Philippines', expirationDate: '2030-11-16' }],
  visa: [{ id: 1, number: 'VISA-1234', country: 'Singapore', issuedDate: '2025-11-15', expirationDate: '2030-11-16' }],
  education: [{ id: 1, school: 'Shiz University', address: 'Makati City', course: 'BS Information Technology', level: 'College' }],
  employmentHistory: [{ id: 1, company: 'ABC Company', address: 'Makati City', contact: '+63 919 234 5678', jobTitle: 'Developer' }],
  organizations: [{ id: 1, name: 'ABC Organization', dateJoined: '2024-11-10', status: 'Active', position: 'President' }],
  socialLinks: [{ id: 1, name: 'LinkedIn', url: 'https://linkedin.com' }],
};

function BaseForm({ title, fields, value, setValue, notify, sections = [] }) {
  return <div className="profile-module"><section className="profile-form-card"><h2>{title}</h2><div className="profile-field-grid">{fields.map(field => <label key={field[0]}>{field[1]}<FormInput field={field} value={value[field[0]]} onChange={next => setValue(previous => ({ ...previous, [field[0]]: next }))} /></label>)}</div><div className="module-save-row"><button className="button secondary" type="button">Cancel</button><button className="button primary" onClick={() => notify({ type: 'success', message: `${title} saved successfully.` })}>Save</button></div></section>{sections}</div>;
}

export function PersonalDetails({ employee, notify }) {
  const [base, setBase] = usePersistentState(`atlas-personal-${employee.id}-v2`, { ...personalBaseSeed, employeeCode: employee.id, firstName: employee.firstName || employee.name.split(' ')[0], lastName: employee.lastName || employee.name.split(' ').slice(-1)[0] });
  const [rows, setRows] = usePersistentState(`atlas-personal-rows-${employee.id}-v2`, seedPersonalRows);
  const sections = personalDefinitions.map((definition, index) => <RecordSection key={definition.key} definition={definition} rows={rows[definition.key] || []} setRows={next => setRows(previous => ({ ...previous, [definition.key]: next }))} notify={notify} initiallyOpen={index < 3} />);
  return <BaseForm title="Personal Details" fields={personalFields} value={base} setValue={setBase} notify={notify} sections={<div className="record-data-stack">{sections}</div>} />;
}

const employeeRecordFields = [
  ['workPermit', 'Work Permit Number'], ['dateHired', 'Date Hired', 'date'], ['jobTenure', 'Job Tenure'], ['rehireDate', 'Date Re-hired', 'date'], ['regularizationDate', 'Regularization Date', 'date'], ['employmentHold', 'Employment Hold', 'select', ['No', 'Maternity', 'Administrative']], ['holdEndDate', 'Hold End Date', 'date'], ['dateSeparated', 'Date Separated', 'date'], ['shiftSchedule', 'Shift Schedule'], ['timezone', 'Timezone'], ['chargeCodes', 'Employee Charge Codes'], ['site', 'Site'], ['division', 'Division'], ['department', 'Department'], ['section', 'Section'], ['jobTitle', 'Job Title'], ['jobLevel', 'Job Level'], ['jobGrade', 'Job Grade'], ['costCenter', 'Cost Center'], ['officeLocation', 'Office Location'], ['reportingManager', 'Reporting Manager'], ['directReports', 'Direct Reports'], ['birBranch', 'BIR Branch Code'], ['sssBranch', 'SSS Branch Code'], ['phicBranch', 'PHIC Branch Code'], ['hdmfBranch', 'HDMF Branch Code'], ['currency', 'Multi-Currency'], ['employmentType', 'Employment Type'], ['employmentStatus', 'Employment Status'], ['incomeType', 'Income Type'], ['employeeCategory', 'Employee Category'], ['taxType', 'Tax Type'], ['overtimeRate', 'Overtime Related Area'], ['workDays', 'Work Days'], ['absenceClass', 'Absence Classification'], ['tardinessClass', 'Tardiness Classification'], ['undertimeClass', 'Undertime Classification'], ['overtimeClass', 'Overtime Classification'], ['bankCompanyCode', 'Bank Company Code'], ['holidayGroup', 'Holiday Group'], ['reasonSeparation', 'Reason of Separation'], ['paymentMode', 'Payment Mode'],
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
];
const seedRecordRows = Object.fromEntries(employeeRecordDefinitions.map((definition, index) => [definition.key, index < 4 ? [{ id: 1, ...Object.fromEntries(definition.fields.map(field => [field[0], field[2] === 'date' ? '2026-01-01' : field[2] === 'number' ? '100' : `${field[1]} 1`])) }] : []]));

export function EmployeeRecord({ employee, notify }) {
  const [base, setBase] = usePersistentState(`atlas-record-${employee.id}-v2`, employeeRecordSeed);
  const [rows, setRows] = usePersistentState(`atlas-record-rows-${employee.id}-v2`, seedRecordRows);
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
  { key: 'overview', title: 'Time Off Overview', columns: [['leaveType', 'Leave Type'], ['opening', 'Opening Balance'], ['approved', 'Approved Leave'], ['forApproval', 'Leave for Approval'], ['remaining', 'Remaining']], fields: [['leaveType', 'Leave Type'], ['opening', 'Opening Balance', 'number'], ['approved', 'Approved Leave', 'number'], ['forApproval', 'Leave for Approval', 'number'], ['remaining', 'Remaining', 'number']] },
  { key: 'history', title: 'Time Off History', columns: [['year', 'Applicable Year'], ['approved', 'Approved Leave'], ['converted', 'Leave Converted'], ['forfeited', 'Forfeited Leave']], fields: [['year', 'Applicable Year', 'number'], ['approved', 'Approved Leave', 'number'], ['converted', 'Leave Converted', 'number'], ['forfeited', 'Forfeited Leave', 'number']] },
];
const seedTimeOff = { overview: [{ id: 1, leaveType: 'Vacation Leave', opening: '20', approved: '17', forApproval: '0', remaining: '3' }, { id: 2, leaveType: 'Sick Leave', opening: '10', approved: '8', forApproval: '0', remaining: '2' }], history: [{ id: 1, year: '2026', approved: '105', converted: '83', forfeited: '22' }] };
export function TimeOff({ employee, notify }) { const [rows, setRows] = usePersistentState(`atlas-timeoff-${employee.id}-v2`, seedTimeOff); return <div className="profile-module record-data-stack">{timeOffDefinitions.map(definition => <RecordSection key={definition.key} definition={definition} rows={rows[definition.key]} setRows={next => setRows(previous => ({ ...previous, [definition.key]: next }))} notify={notify} />)}</div>; }

const contactFields = [['presentAddress', 'Present Home Address'], ['permanentAddress', 'Permanent Home Address'], ['foreignAddress', 'Foreign Address'], ['telephone', 'Personal Tel. No.'], ['mobile', 'Personal Mobile No.'], ['alternateMobile', 'Alternative Mobile No.'], ['email', 'Personal Email Address', 'email'], ['alternateEmail', 'Alternative Personal Email Address', 'email'], ['workPhone', 'Work Phone'], ['companyEmail', 'Company Email Address', 'email']];
const contactSeed = { presentAddress: 'Makati City, Philippines', permanentAddress: 'Manila, Philippines', foreignAddress: 'None', telephone: '+63 2 8000 0000', mobile: '+63 917 000 0000', alternateMobile: '+63 918 000 0000', email: 'john.doe@email.com', alternateEmail: 'jdoe@email.com', workPhone: '+63 2 8123 4567', companyEmail: 'john.doe@abccompany.ph' };
const emergencyDefinition = { key: 'emergency', title: 'Emergency Contact', columns: [['name', 'Emergency Contact Person'], ['relationship', 'Relationship'], ['mobile', 'Mobile Number'], ['address', 'Address']], fields: [['name', 'Emergency Contact Person'], ['relationship', 'Relationship', 'select', ['Spouse', 'Parent', 'Sibling', 'Friend']], ['mobile', 'Personal Mobile No.'], ['address', 'Address']] };
export function Contacts({ employee, notify }) { const [base, setBase] = usePersistentState(`atlas-contact-${employee.id}-v2`, contactSeed); const [rows, setRows] = usePersistentState(`atlas-emergency-${employee.id}-v2`, [{ id: 1, name: 'Rachel Doe', relationship: 'Mother', mobile: '+63 900 000 0000', address: 'Manila, Philippines' }]); return <BaseForm title="Contacts" fields={contactFields} value={base} setValue={setBase} notify={notify} sections={<div className="record-data-stack"><RecordSection definition={emergencyDefinition} rows={rows} setRows={setRows} notify={notify} /></div>} />; }

const accountDefinition = { title: 'Account Settings Information', singular: 'Account Settings Information', columns: [['username', 'Username'], ['password', 'Password'], ['locked', 'Account is Locked'], ['status', 'Status of Access'], ['ssoStatus', 'Single Sign-on Status'], ['ssoUsername', 'Single Sign-on Username']], fields: [['username', 'Username'], ['password', 'Password', 'password'], ['locked', 'Account is Locked', 'select', ['Yes', 'No']], ['status', 'Status of Access', 'select', ['Enabled', 'Disabled']], ['ssoStatus', 'Single Sign-on Status', 'select', ['Enabled', 'Disabled']], ['ssoUsername', 'Single Sign-on Username'], ['action', 'Account Action', 'select', ['Unlock', 'Block', 'Reset Password', 'No action']]] };
const seedAccounts = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, username: ['EACarter', 'LBJohnson', 'SCBennett', 'ODSmith', 'NEBrown', 'AFDavis', 'JGWilson', 'MHAnderson', 'LIMoore', 'EJMillar'][index], password: '************', locked: index % 3 === 0 ? 'Yes' : 'No', status: index % 4 === 1 ? 'Disabled' : 'Enabled', ssoStatus: index % 5 === 4 ? 'Disabled' : 'Enabled', ssoUsername: `sso-${index + 1}` }));
export function AccountSettings({ notify }) {
  const [rows, setRows] = usePersistentState('atlas-account-settings-v2', seedAccounts); const [query, setQuery] = useState(''); const [editing, setEditing] = useState(undefined); const [deleting, setDeleting] = useState(null);
  const filtered = rows.filter(row => `${row.username} ${row.status} ${row.ssoStatus}`.toLowerCase().includes(query.toLowerCase()));
  const save = draft => { if (draft.id) setRows(rows.map(row => row.id === draft.id ? draft : row)); else setRows([{ ...draft, id: Date.now() }, ...rows]); setEditing(undefined); notify({ type: 'success', message: `Account ${draft.id ? 'updated' : 'added'} successfully.` }); };
  return <section className="employee-directory account-settings-page"><div className="page-heading"><div><p className="breadcrumb">Core / Employee Masterfile / Account Settings</p><h1>Account Settings Information</h1><p className="page-description">Manage access, lock status and single sign-on credentials for employee accounts.</p></div></div><div className="employee-directory-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search username or access status..." /><MagnifyingGlass /></div><div className="toolbar-spacer" /><button className="button primary" onClick={() => setEditing(null)}><Plus /> Add</button></div><div className="table-card employee-directory-card"><table><thead><tr>{accountDefinition.columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Action</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}>{accountDefinition.columns.map(([key]) => <td key={key}>{key === 'status' || key === 'ssoStatus' ? <span className={`status-pill ${String(row[key]).toLowerCase()}`}>{row[key]}</span> : row[key]}</td>)}<td><div className="row-actions always"><button onClick={() => setEditing(row)}><PencilSimple /></button><button onClick={() => setDeleting(row)}><Trash /></button></div></td></tr>)}</tbody></table></div><div className="pagination"><span>Displaying <strong>{filtered.length}</strong> accounts</span><div><button disabled>«</button><strong>1</strong><span>of 1</span><button disabled>»</button></div></div>{editing !== undefined && <RecordModal definition={accountDefinition} record={editing || null} onClose={() => setEditing(undefined)} onSave={save} />}{deleting && <DeleteModal label={deleting.username} onClose={() => setDeleting(null)} onDelete={() => { setRows(rows.filter(row => row.id !== deleting.id)); setDeleting(null); notify({ type: 'success', message: 'Account deleted.' }); }} />}</section>;
}
