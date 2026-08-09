import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CaretDown,
  CaretUp,
  CheckCircle,
  Clock,
  Cube,
  DotsThreeVertical,
  DownloadSimple,
  Gear,
  House,
  IdentificationCard,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  PuzzlePiece,
  SignOut,
  Sparkle,
  Trash,
  UploadSimple,
  UserCircle,
  Users,
  X,
} from '@phosphor-icons/react';
import {
  AccountSettings,
  Benefits,
  Contacts,
  EmployeeDirectory,
  EmployeeRecord,
  PersonalDetails,
  TimeOff,
} from './EmployeeMasterfileModules';
import { RoleSwitch } from './RoleContext';

const today = '2026-01-01';

const sectionDefinitions = [
  {
    key: 'basicPay', title: 'Basic Pay', upload: true,
    columns: [['dateCreated', 'Date Created'], ['payType', 'Pay Type'], ['amount', 'Basic Pay Amount'], ['workDays', 'Work Days'], ['workDaysType', 'Work Days Type']],
    fields: [
      ['dateCreated', 'Date Created', 'date'], ['effectiveDate', 'Effectivity Date', 'date'], ['payType', 'Pay Type', 'select', ['Monthly', 'Daily', 'Hourly']], ['amount', 'Basic Pay Amount', 'number'], ['workDays', 'Work Days', 'number'], ['workDaysType', 'Work Days Type', 'select', ['Per Year', 'Per Month']], ['mwe', 'MWE', 'boolean'], ['location', 'Location'], ['startMonth', 'Start Month', 'date'], ['startYear', 'Start Year', 'date'], ['periodStart', 'Period Start', 'select', ['First cutoff', 'Second cutoff']],
    ],
    rows: [
      { dateCreated: '01/01/2026', effectiveDate: '01/01/2026', payType: 'Monthly', amount: '50000', workDays: '261', workDaysType: 'Per Year', mwe: 'No', location: 'Makati' },
      { dateCreated: '01/01/2025', effectiveDate: '01/01/2025', payType: 'Daily', amount: '32000', workDays: '313', workDaysType: 'Per Year', mwe: 'No', location: 'Makati' },
    ],
  },
  {
    key: 'earnings', title: 'Earnings', upload: true,
    columns: [['dateCreated', 'Date Created'], ['code', 'Earning Code'], ['name', 'Earning Name'], ['amount', 'Earnings Amount'], ['classification', 'Classification']],
    fields: [['dateCreated', 'Date Created', 'date'], ['code', 'Earning Code'], ['name', 'Earning Name'], ['amount', 'Earning Amount', 'number'], ['frequency', 'Frequency', 'select', ['One-time', 'Weekly', 'Semi-monthly', 'Monthly']], ['taxability', 'Taxability', 'select', ['Taxable', 'Non-taxable']], ['classification', 'Classification', 'select', ['Regular', 'De Minimis', 'Reimbursement']], ['effectiveDate', 'Effectivity Date', 'date'], ['start', 'Start', 'date'], ['end', 'End', 'date'], ['holdDate', 'Hold Date', 'date'], ['remarks', 'Remarks', 'textarea']],
    rows: [
      { dateCreated: '01/01/2026', code: 'EXA-001', name: 'Salary', amount: '50000', frequency: 'Semi-monthly', taxability: 'Taxable', classification: 'Taxable' },
      { dateCreated: '01/01/2026', code: 'EXA-002', name: 'Lecture Fee', amount: '7500', frequency: 'One-time', taxability: 'Non-taxable', classification: 'Non-Taxable' },
      { dateCreated: '01/01/2026', code: 'EXA-003', name: 'Clothing Allowance', amount: '3000', frequency: 'Monthly', taxability: 'Non-taxable', classification: 'De Minimis' },
    ],
  },
  {
    key: 'bonuses', title: '13th Month Pay and Bonuses', upload: true,
    columns: [['name', 'Name'], ['type', 'Type'], ['taxability', 'Taxability'], ['amount', 'Amount']],
    fields: [['name', 'Name'], ['type', 'Type', 'select', ['13th Month Pay', 'Performance Bonus', 'Signing Bonus']], ['taxability', 'Taxability', 'select', ['Taxable Bonus', 'Non-taxable Bonus']], ['amount', 'Amount', 'number']],
    rows: [{ name: '13th Month Pay', type: '13th Month Pay', taxability: 'Taxable Bonus', amount: '50000' }, { name: 'Performance Bonus', type: 'Performance Bonus', taxability: 'Non-taxable Bonus', amount: '10000' }],
  },
  {
    key: 'statutory', title: 'Statutory Deductions', upload: false,
    columns: [['payPeriod', 'Pay Period'], ['effectiveDate', 'Effectivity Date'], ['holdDate', 'Hold Date'], ['sssEmployee', 'SSS Employee Contribution'], ['sssEmployer', 'SSS Employer Contribution']],
    fields: [['payPeriod', 'Pay Period', 'date'], ['effectiveDate', 'Effectivity Date', 'date'], ['holdDate', 'Hold Date', 'date'], ['sssEmployee', 'SSS Employee Contribution', 'number'], ['sssEmployer', 'SSS Employer Contribution', 'number']],
    rows: [{ payPeriod: '01/01/2026', effectiveDate: '04/30/2026', holdDate: '04/30/2026', sssEmployee: '2250', sssEmployer: '4950' }],
  },
  {
    key: 'deductions', title: 'Company Deductions', upload: false,
    columns: [['name', 'Deduction Name'], ['amount', 'Amount of Deduction'], ['startDate', 'Start Date'], ['endDate', 'End Date'], ['count', 'Number of Deductions'], ['total', 'Total Deduction']],
    fields: [['name', 'Deduction Name'], ['amount', 'Amount of Deduction', 'number'], ['startDate', 'Start Date', 'date'], ['endDate', 'End Date', 'date'], ['count', 'Number of Deductions', 'number'], ['total', 'Total Deduction Amount', 'number'], ['accumulated', 'Accumulated Amount', 'number'], ['balance', 'Total Balance', 'number']],
    rows: [{ name: 'Cooperative Dues', amount: '500', startDate: '01/01/2026', endDate: '12/31/2026', count: '24', total: '12000', accumulated: '3000', balance: '9000' }],
  },
  {
    key: 'loans', title: 'Loans', upload: true,
    columns: [['payItem', 'Pay Item'], ['frequency', 'Payment Frequency'], ['amount', 'Amount'], ['startDate', 'Start Date'], ['endDate', 'End Date'], ['balance', 'Balance']],
    fields: [['payItem', 'Pay Item', 'select', ['Government Loan', 'Company Loan']], ['frequency', 'Payment Frequency', 'select', ['Semi-monthly', 'Monthly', 'Quarterly']], ['amount', 'Amount', 'number'], ['startDate', 'Start Date', 'date'], ['endDate', 'End Date', 'date'], ['description', 'Description'], ['dateGranted', 'Date Granted', 'date'], ['reference', 'Reference Number'], ['principal', 'Principal', 'number'], ['interest', 'Interest', 'number'], ['totalLoan', 'Total Loan', 'number'], ['accumulatedManual', 'Accumulated Payment (Manual)', 'number'], ['accumulatedComputed', 'Accumulated Payment (Computed)', 'number'], ['balance', 'Balance', 'number'], ['holdDate', 'Hold Date', 'date']],
    rows: [{ payItem: 'Government Loan', frequency: 'Monthly', amount: '100000', startDate: '01/01/2026', endDate: '12/31/2026', principal: '95000', interest: '5', totalLoan: '100000', balance: '75000' }, { payItem: 'Company Loan', frequency: 'Quarterly', amount: '1000', startDate: '01/01/2026', endDate: '06/30/2026', principal: '950', interest: '5', totalLoan: '1000', balance: '500' }],
  },
  {
    key: 'hdmf', title: 'HDMF Contribution', upload: true,
    columns: [['effectiveDate', 'Effectivity Date'], ['holdDate', 'Hold Date'], ['employee', 'Employee Contribution'], ['employer', 'Employer Contribution']],
    fields: [['effectiveDate', 'Effectivity Date', 'date'], ['holdDate', 'Hold Date', 'date'], ['employee', 'Employee Contribution Amount', 'number'], ['employer', 'Employer Contribution Amount', 'number']],
    rows: [{ effectiveDate: '01/01/2026', holdDate: '01/01/2026', employee: '240', employer: '480' }],
  },
  {
    key: 'allowances', title: 'Variable Allowances', upload: true,
    columns: [['dateCreated', 'Date Created'], ['amount', 'Amount'], ['unitBasis', 'Unit Basis'], ['workDays', 'Work Days'], ['workDaysType', 'Work Days Type']],
    fields: [['dateCreated', 'Date Created', 'date'], ['amount', 'Amount', 'number'], ['unitBasis', 'Unit Basis', 'select', ['Monthly', 'Daily', 'Hourly']], ['workDays', 'Work Days', 'number'], ['workDaysType', 'Work Days Type', 'select', ['Work Days per Year', 'Work Days per Month']], ['workHours', 'Work Hours per Day', 'number'], ['effectiveDate', 'Effectivity Date', 'date'], ['startMonth', 'Start Month', 'date'], ['startYear', 'Start Year', 'date'], ['periodStart', 'Period Start', 'select', ['First cutoff', 'Second cutoff']], ['periodEnd', 'Period End', 'select', ['First cutoff', 'Second cutoff']]],
    rows: [{ dateCreated: '01/01/2026', amount: '35000', unitBasis: 'Monthly', workDays: '261', workDaysType: 'Work Days per Year' }, { dateCreated: '01/01/2026', amount: '500', unitBasis: 'Daily', workDays: '313', workDaysType: 'Work Days per Year' }],
  },
  {
    key: 'ytd', title: 'Payroll Records (YTD)', upload: true,
    columns: [['year', 'Year'], ['grossPay', 'Gross Pay'], ['taxableIncome', 'Taxable Income'], ['taxWithheld', 'Tax Withheld'], ['netPay', 'Net Pay']],
    fields: [['year', 'Year', 'number'], ['grossPay', 'Gross Pay', 'number'], ['taxableIncome', 'Taxable Income', 'number'], ['taxWithheld', 'Tax Withheld', 'number'], ['netPay', 'Net Pay', 'number']],
    rows: [{ year: '2025', grossPay: '685000', taxableIncome: '612000', taxWithheld: '58500', netPay: '564400' }],
  },
  {
    key: 'previousEmployer', title: 'Previous Employer Data', upload: true,
    columns: [['employerName', 'Employer Name'], ['employerAddress', 'Employer Address'], ['tin', 'Taxpayer Identification No.'], ['startDate', 'Employment Start'], ['endDate', 'Employment End']],
    fields: [['employerName', 'Employer Name'], ['employerAddress', 'Employer Address'], ['tin', 'Taxpayer Identification No.'], ['startDate', 'Employer Start Date', 'date'], ['endDate', 'Employer End Date', 'date'], ['taxType', 'Tax Type', 'select', ['Normal', 'Minimum Wage']], ['minimumWage', 'Is Minimum Wage', 'boolean'], ['basicPay', 'Basic Pay', 'number'], ['taxableBonus', 'Taxable Bonus', 'number'], ['otherTaxable', 'Other Taxable Income', 'number'], ['grossTaxable', 'Gross Taxable Income', 'number'], ['nonTaxableBonus', 'Non-Taxable Bonus', 'number'], ['deMinimis', 'De Minimis', 'number'], ['allowableDeductions', 'Allowable Deductions', 'number'], ['otherNonTaxable', 'Other Non-Taxable Income', 'number'], ['insurancePremium', 'Insurance Premium', 'number'], ['taxWithheld', 'Tax Withheld', 'number']],
    rows: [{ employerName: 'ABC Company', employerAddress: 'Manila, Philippines', tin: '123456789012', startDate: '01/01/2019', endDate: '12/31/2024', taxType: 'Normal', minimumWage: 'No' }],
  },
  {
    key: 'previousPayroll', title: 'Previous Payroll Data', upload: true,
    columns: [['taxType', 'Tax Type'], ['minimumWage', 'Is Minimum Wage'], ['nonTaxableBonus', 'Non-Taxable Bonus'], ['deMinimis', 'De Minimis'], ['allowableDeductions', 'Allowable Deductions']],
    fields: [['taxType', 'Tax Type', 'select', ['Normal', 'Minimum Wage']], ['minimumWage', 'Is Minimum Wage', 'boolean'], ['nonTaxableBonus', 'Non-Taxable Bonus', 'number'], ['deMinimis', 'De Minimis', 'number'], ['allowableDeductions', 'Allowable Deductions', 'number'], ['otherNonTaxable', 'Other Non-Taxable Income', 'number'], ['basicPay', 'Basic Pay', 'number'], ['taxableBonus', 'Taxable Bonus', 'number'], ['otherTaxable', 'Other Taxable Income', 'number'], ['grossTaxable', 'Gross Taxable Income', 'number'], ['insurancePremium', 'Insurance Premium', 'number'], ['taxWithheld', 'Tax Withheld', 'number']],
    rows: [{ taxType: 'Normal', minimumWage: 'Yes', nonTaxableBonus: '90000', deMinimis: '18000', allowableDeductions: '25000', basicPay: '450000', taxableBonus: '35000', taxWithheld: '49000' }],
  },
  {
    key: 'payrollEntry', title: 'Payroll Entry Related Information', upload: true,
    columns: [['companyCode', 'Company Code'], ['subAccount', 'Local sub-account'], ['project', 'Business / Activity'], ['costLevel', 'Cost Level'], ['intercompany', 'Intercompany']],
    fields: [['companyCode', 'Company Code'], ['subAccount', 'Local sub-account'], ['costLevel', 'Cost Level', 'select', ['Company', 'Department', 'Project']], ['intercompany', 'Intercompany'], ['project', 'Project', 'select', ['Payroll Operations', 'Client Services']], ['statutoryCode', 'Statutory Code'], ['reserved', 'Reserved', 'boolean'], ['management', 'Management', 'select', ['Operations', 'Corporate']], ['costAllocation', 'Cost allocation', 'select', ['Default allocation', 'Custom allocation']]],
    rows: [{ companyCode: 'COMP00123', subAccount: 'Payroll Services', project: 'Payroll Operations', costLevel: 'Company', intercompany: 'No', statutoryCode: 'STAT-001', reserved: 'No' }],
  },
  {
    key: 'costAllocation', title: 'Cost Allocation', upload: true,
    columns: [['type', 'Type'], ['name', 'Name'], ['percentage', 'Percentage']],
    fields: [['type', 'Type', 'select', ['Department', 'Job Title', 'Site', 'Project']], ['name', 'Name'], ['percentage', 'Percentage', 'number']],
    rows: [{ type: 'Department', name: 'Department A', percentage: '35' }, { type: 'Job Title', name: 'Operations', percentage: '20' }, { type: 'Site', name: 'Makati', percentage: '45' }],
  },
  {
    key: 'allotment', title: 'Allotment Information', upload: true,
    columns: [['name', 'Allottee Name'], ['relationship', 'Relationship to Allottee'], ['percentage', 'Percentage of Net Pay'], ['amount', 'Specified Amount'], ['bank', 'Bank Name']],
    fields: [['name', 'Allottee Name'], ['relationship', 'Relationship to the Allottee', 'select', ['Spouse', 'Child', 'Parent', 'Employer', 'Other']], ['amount', 'Disbursement Amount', 'number'], ['percentage', 'Percentage of Net Pay', 'number'], ['bank', 'Bank Name', 'select', ['BDO Unibank', 'BPI', 'Metrobank', 'UnionBank']], ['accountNumber', 'Account Number'], ['branchName', 'Branch Name'], ['branchLocation', 'Branch Location'], ['accountType', 'Account Type', 'select', ['Savings', 'Checking']], ['swiftCode', 'Swift Code'], ['defaultBank', 'Set as default bank', 'boolean']],
    rows: [{ name: 'Jane Doe', relationship: 'Spouse', percentage: '5', amount: '0', bank: 'BDO Unibank', accountNumber: '0000000000' }],
  },
];

const employees = [
  { id: '0000112345', employeeCode: '0000112345', firstName: 'John', middleName: 'Michael', lastName: 'Doe', name: 'John Michael Doe', role: 'Payroll Specialist', status: 'Full-time', origin: 'Philippines', hireDate: '2024-05-30', location: 'PBS | Makati', initials: 'JD' },
  { id: '0000112451', employeeCode: '0000112451', firstName: 'Jane', middleName: 'Collins', lastName: 'Doe', name: 'Jane Collins Doe', role: 'Payroll Analyst', status: 'Full-time', origin: 'Philippines', hireDate: '2025-01-12', location: 'PBS | Makati', initials: 'JC' },
  { id: '0000112608', employeeCode: '0000112608', firstName: 'Jandee', middleName: 'Robins', lastName: 'Fisher', name: 'Jandee Robins Fisher', role: 'Team Lead', status: 'Full-time', origin: 'Philippines', hireDate: '2023-03-14', location: 'PBS | Manila', initials: 'JF' },
];

function formatCell(key, value) {
  if (['amount', 'total', 'balance', 'principal', 'grossPay', 'taxableIncome', 'taxWithheld', 'netPay', 'employee', 'employer', 'sssEmployee', 'sssEmployer', 'basicPay', 'taxableBonus', 'nonTaxableBonus', 'deMinimis', 'allowableDeductions'].includes(key)) return `₱ ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  if (key === 'percentage') return `${value}%`;
  return value || '—';
}

function download(filename, content, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function Rail({ onBack }) {
  return <aside className="brand-rail employee-rail" aria-label="Primary navigation"><button className="brand-mark" onClick={onBack} aria-label="Home"><Sparkle weight="fill" /></button><button className="rail-button" onClick={onBack} aria-label="Home"><House /></button><button className="rail-button active" aria-label="Core"><Cube weight="duotone" /></button><button className="rail-button" aria-label="Employees"><Users /></button><button className="rail-button" disabled aria-label="Time unavailable"><Clock /></button><button className="rail-button" disabled aria-label="Systems unavailable"><PuzzlePiece /></button><div className="rail-spacer" /><button className="rail-button" disabled aria-label="Settings unavailable"><Gear /></button><button className="rail-button" disabled aria-label="Sign out unavailable"><SignOut /></button></aside>;
}

function EmployeeTopbar() {
  return <header className="topbar"><button className="company-switch">ABC Company Ltd <CaretDown weight="bold" /></button><div className="top-actions"><RoleSwitch /><button className="icon-button" aria-label="Search"><MagnifyingGlass /></button><button className="icon-button notification" aria-label="Notifications"><Bell /></button><div className="avatar">JD</div><button className="profile">John Doe <CaretDown /></button></div></header>;
}

function EmployeeSidebar({ onBack, module, setModule, closeDetail }) {
  return <aside className="company-sidebar employee-sidebar"><button className="back-link" onClick={onBack}>← Back to Core</button><h2>Employee<br />Masterfile</h2><nav><button className={`side-link ${module === 'employees' ? 'selected' : ''}`} onClick={() => { setModule('employees'); closeDetail(); }}><UserCircle weight={module === 'employees' ? 'fill' : 'regular'} /> Employee Information</button><button className={`side-link ${module === 'accounts' ? 'selected' : ''}`} onClick={() => setModule('accounts')}><IdentificationCard weight={module === 'accounts' ? 'fill' : 'regular'} /> Account Settings Information</button></nav></aside>;
}

function InputField({ field, value, onChange }) {
  const [key, label, type = 'text', options = []] = field;
  if (type === 'select') return <select value={value ?? ''} onChange={e => onChange(e.target.value)} required><option value="">Please select</option>{options.map(item => <option key={item}>{item}</option>)}</select>;
  if (type === 'boolean') return <div className="radio-group">{['Yes', 'No'].map(item => <label key={item}><input type="radio" name={key} checked={(value || 'No') === item} onChange={() => onChange(item)} /> {item}</label>)}</div>;
  if (type === 'textarea') return <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="Enter remarks" />;
  return <input type={type} min={type === 'number' ? '0' : undefined} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={type === 'number' ? '0.00' : `Input ${label.toLowerCase()}`} required />;
}

function EntryModal({ section, record, onClose, onSave }) {
  const [draft, setDraft] = useState({ dateCreated: today, ...record });
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="modal employee-entry-modal" role="dialog" aria-modal="true" aria-label={`${record?.id ? 'Edit' : 'Add'} ${section.title.replace('13th Month Pay and ', '')}`}><header><h2>{record?.id ? 'Edit' : 'Add'} {section.title.replace('13th Month Pay and ', '')}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header><form onSubmit={e => { e.preventDefault(); onSave(draft); }}><div className="employee-form-grid">{section.fields.map(field => <label key={field[0]}>{field[1]} <span className="required">*</span><InputField field={field} value={draft[field[0]]} onChange={value => setDraft(prev => ({ ...prev, [field[0]]: value }))} /></label>)}</div><footer className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{record?.id ? 'Save' : 'Add'}</button></footer></form></section></div>;
}

function ConfirmDelete({ name, onClose, onDelete }) {
  return <div className="modal-backdrop"><section className="modal delete-modal" role="dialog" aria-modal="true" aria-label="Delete entry"><header><h2>Delete entry</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header><div className="modal-body"><div className="delete-copy"><div className="delete-icon"><Trash /></div><div><h3>Delete “{name}”?</h3><p>This employee payroll entry will be removed.</p></div></div><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" onClick={onDelete}>Delete</button></div></div></section></div>;
}

function EmployeeSection({ section, rows, setRows, notify, initiallyOpen }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const uploadRef = useRef(null);
  const save = draft => {
    if (draft.id) setRows(rows.map(row => row.id === draft.id ? draft : row));
    else setRows([{ ...draft, id: Math.max(0, ...rows.map(row => row.id)) + 1 }, ...rows]);
    setEditing(null); notify({ type: 'success', message: `${section.title} entry ${draft.id ? 'updated' : 'added'} successfully.` });
  };
  const importRows = e => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      const headers = lines[0]?.split(',').map(value => value.replaceAll('"', '').trim().toLowerCase()) || [];
      const labels = Object.fromEntries(section.fields.map(field => [field[1].toLowerCase(), field[0]]));
      const added = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(value => value.replace(/^"|"$/g, '').trim()); const row = { id: Date.now() + index };
        headers.forEach((header, i) => { if (labels[header]) row[labels[header]] = values[i]; }); return row;
      }).filter(row => Object.keys(row).length > 1);
      if (!added.length) notify({ type: 'error', message: `No matching ${section.title} rows were found.` });
      else { setRows([...added, ...rows]); notify({ type: 'success', message: `${added.length} ${section.title} entries imported.` }); }
    };
    reader.readAsText(file); e.target.value = '';
  };
  return <section className="employee-data-section">
    <button className="employee-section-heading" onClick={() => setOpen(!open)}><span>{section.title}</span>{open ? <CaretUp /> : <CaretDown />}</button>
    {open && <div className="employee-section-body"><div className="employee-section-actions"><button className="button secondary" onClick={() => setEditing({})}><Plus /> Add entry</button>{section.upload && <><button className="button secondary" onClick={() => uploadRef.current?.click()}><UploadSimple /> Upload</button><input className="sr-only" ref={uploadRef} type="file" accept=".csv" onChange={importRows} /></>}</div>
      <div className="employee-table-wrap"><table className="employee-table"><thead><tr>{section.columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Action</th></tr></thead><tbody>{rows.length ? rows.map(row => <tr key={row.id}>{section.columns.map(([key]) => <td key={key}>{formatCell(key, row[key])}</td>)}<td><div className="row-actions always"><button onClick={() => setEditing(row)} aria-label="Edit"><PencilSimple /></button><button onClick={() => setDeleting(row)} aria-label="Delete"><Trash /></button></div></td></tr>) : <tr><td colSpan={section.columns.length + 1}><div className="empty-state compact"><h3>No entries yet</h3><p>Add or upload this employee’s payroll data.</p></div></td></tr>}</tbody></table></div>
      <div className="employee-pagination"><span>Displaying <strong>{rows.length}</strong> item{rows.length === 1 ? '' : 's'}</span><span>1 of 1</span></div>
    </div>}
    {editing && <EntryModal section={section} record={editing.id ? editing : null} onClose={() => setEditing(null)} onSave={save} />}
    {deleting && <ConfirmDelete name={deleting.name || deleting.payItem || deleting.type || section.title} onClose={() => setDeleting(null)} onDelete={() => { setRows(rows.filter(row => row.id !== deleting.id)); setDeleting(null); notify({ type: 'success', message: `${section.title} entry deleted.` }); }} />}
  </section>;
}

function CustomExport({ sections, onClose, onExport }) {
  const [selected, setSelected] = useState([sections[0].key]); const [format, setFormat] = useState('csv');
  return <div className="modal-backdrop"><section className="modal custom-export-modal" role="dialog" aria-modal="true" aria-label="Custom Export"><header><h2>Custom Export</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header><div className="modal-body"><p className="form-intro">Choose which sections to export.</p><div className="export-checklist">{sections.map(section => <label key={section.key}><input type="checkbox" checked={selected.includes(section.key)} onChange={() => setSelected(prev => prev.includes(section.key) ? prev.filter(key => key !== section.key) : [...prev, section.key])} /> {section.title}</label>)}</div><label className="export-format">Export File Format<select value={format} onChange={e => setFormat(e.target.value)}><option value="csv">Excel / CSV</option><option value="word">Word</option><option value="pdf">PDF / Print</option></select></label><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!selected.length} onClick={() => onExport(selected, format)}>Export</button></div></div></section></div>;
}

function exportEmployeeData(data, selectedKeys, format) {
  const selected = sectionDefinitions.filter(section => selectedKeys.includes(section.key));
  const csv = selected.map(section => {
    const headers = section.columns.map(([, label]) => `"${label}"`).join(',');
    const rows = data[section.key].map(row => section.columns.map(([key]) => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    return `${section.title}\n${headers}\n${rows}`;
  }).join('\n\n');
  if (format === 'pdf') {
    const popup = window.open('', '_blank', 'noopener,noreferrer'); if (!popup) return false;
    popup.document.write(`<html><head><title>Employee Payroll and Allocation</title><style>body{font-family:Arial;padding:24px;white-space:pre-wrap}h1{color:#54248f}</style></head><body><h1>John Doe — Payroll and Allocation</h1>${csv}<script>window.onload=()=>window.print()<\/script></body></html>`); popup.document.close(); return true;
  }
  if (format === 'word') download('john-doe-payroll.doc', `<html><body><pre>${csv}</pre></body></html>`, 'application/msword'); else download('john-doe-payroll.csv', csv);
  return true;
}

export function EmployeeMasterfile({ onBack, notify }) {
  const storageKey = 'atlas-employee-payroll-data';
  const [data, setData] = useState(() => {
    try { const stored = JSON.parse(localStorage.getItem(storageKey)); if (stored) return stored; } catch { /* start with samples */ }
    return Object.fromEntries(sectionDefinitions.map(section => [section.key, section.rows.map((row, index) => ({ ...row, id: index + 1 }))]));
  });
  const [employeeList, setEmployeeList] = useState(() => {
    try { return JSON.parse(localStorage.getItem('atlas-employee-directory-v2')) || employees; } catch { return employees; }
  });
  const [module, setModule] = useState('employees');
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Personal Details');
  const [employeeId, setEmployeeId] = useState(employees[0].id);
  const [employeePicker, setEmployeePicker] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [customExport, setCustomExport] = useState(false);
  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(data)), [data]);
  useEffect(() => localStorage.setItem('atlas-employee-directory-v2', JSON.stringify(employeeList)), [employeeList]);
  const employee = useMemo(() => employeeList.find(item => item.id === employeeId) || employeeList[0] || employees[0], [employeeId, employeeList]);
  const updateRows = (key, rows) => setData(previous => ({ ...previous, [key]: rows }));
  const runExport = (keys, format) => { if (exportEmployeeData(data, keys, format)) notify({ type: 'success', message: 'Employee payroll export prepared.' }); setCustomExport(false); setExportMenu(false); };
  const selectEmployee = item => { setEmployeeId(item.id); setActiveTab('Personal Details'); setDetailOpen(true); };
  const tabs = ['Personal Details', 'Employee Record', 'Benefits', 'Time Off', 'Payroll & Allocation', 'Contacts'];

  return <div className="app-shell employee-screen">
    <Rail onBack={onBack} /><EmployeeSidebar onBack={onBack} module={module} setModule={setModule} closeDetail={() => setDetailOpen(false)} />
    <main className="employee-main"><EmployeeTopbar /><div className="employee-page">
      {module === 'accounts' ? <AccountSettings notify={notify} /> : !detailOpen ? <EmployeeDirectory employees={employeeList} setEmployees={setEmployeeList} onSelect={selectEmployee} notify={notify} /> : <>
        <button className="inline-back" onClick={() => setDetailOpen(false)}>← Employee Information</button>
        <p className="breadcrumb">Employee Information / {employee.name}</p>
        <section className="employee-hero"><div className="employee-photo">{employee.initials}</div><div><div className="employee-title-row"><h1>{employee.name} <span>[{employee.id}]</span></h1><button onClick={() => setEmployeePicker(!employeePicker)}><PencilSimple /></button></div><p>{employee.role} | {employee.location}</p><small>Hire date: {employee.hireDate || '2024-05-30'}</small><span className="employee-active">ACTIVE</span></div>
          {employeePicker && <div className="employee-picker"><div><MagnifyingGlass /><input placeholder="Search employee" /></div>{employeeList.map(item => <button key={item.id} onClick={() => { setEmployeeId(item.id); setEmployeePicker(false); }}><span>{item.initials}</span><div><strong>{item.name}</strong><small>{item.id}</small></div>{item.id === employeeId && <CheckCircle weight="fill" />}</button>)}</div>}
        </section>
        <nav className="employee-tabs">{tabs.map(tab => <button key={tab} className={tab === activeTab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>
        {activeTab === 'Personal Details' && <PersonalDetails employee={employee} notify={notify} />}
        {activeTab === 'Employee Record' && <EmployeeRecord employee={employee} notify={notify} />}
        {activeTab === 'Benefits' && <Benefits employee={employee} notify={notify} />}
        {activeTab === 'Time Off' && <TimeOff employee={employee} notify={notify} />}
        {activeTab === 'Contacts' && <Contacts employee={employee} notify={notify} />}
        {activeTab === 'Payroll & Allocation' && <>
          <div className="employee-export-row"><div className="menu-anchor"><button className="button secondary" onClick={() => setExportMenu(!exportMenu)}><DownloadSimple /> Export <CaretDown /></button>{exportMenu && <div className="export-menu employee-export-menu"><button onClick={() => runExport(sectionDefinitions.map(section => section.key), 'csv')}>Export All — Excel / CSV</button><button onClick={() => runExport(sectionDefinitions.map(section => section.key), 'pdf')}>Export All — PDF / Print</button><button onClick={() => { setCustomExport(true); setExportMenu(false); }}>Custom export…</button></div>}</div></div>
          <section className="employee-data-stack">{sectionDefinitions.map((section, index) => <EmployeeSection key={section.key} section={section} rows={data[section.key] || []} setRows={rows => updateRows(section.key, rows)} notify={notify} initiallyOpen={index < 3 || ['loans', 'allowances', 'previousPayroll', 'costAllocation'].includes(section.key)} />)}</section>
        </>}
      </>}
    </div></main>
    {customExport && <CustomExport sections={sectionDefinitions} onClose={() => setCustomExport(false)} onExport={runExport} />}
  </div>;
}
