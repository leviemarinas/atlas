import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CaretDown,
  CaretRight,
  Clock,
  Cube,
  DownloadSimple,
  Gear,
  House,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  PuzzlePiece,
  SignOut,
  Sparkle,
  SquaresFour,
  Table,
  Trash,
  UploadSimple,
  Users,
  X,
} from '@phosphor-icons/react';
import { RoleSwitch } from './RoleContext';

const groups = [
  { id: 'generic', label: 'Generic Information' },
  { id: 'client', label: 'Client-specific' },
  { id: 'others', label: 'Others' },
];

const seedTables = [
  { id: 'civil-status', group: 'generic', name: 'Civil Status', description: 'Civil status values used in employee personal details.', mode: 'list', columns: [['name', 'Civil Status']], rows: ['Single', 'Married', 'Divorced', 'Separated', 'Widowed'].map((name, index) => ({ id: index + 1, name, status: 'Active' })) },
  { id: 'countries', group: 'generic', name: 'Country', description: 'ISO-aligned country values for addresses and employee origin.', mode: 'table', columns: [['code', 'Country Code'], ['name', 'Country Name'], ['status', 'Status']], rows: [{ id: 1, code: 'PH', name: 'Philippines', status: 'Active' }, { id: 2, code: 'SG', name: 'Singapore', status: 'Active' }, { id: 3, code: 'US', name: 'United States', status: 'Active' }] },
  { id: 'nationality', group: 'generic', name: 'Nationality', description: 'Nationality values shared by employee and compliance records.', mode: 'list', columns: [['name', 'Nationality']], rows: ['Filipino', 'Singaporean', 'American'].map((name, index) => ({ id: index + 1, name, status: 'Active' })) },
  { id: 'employment-status', group: 'generic', name: 'Employment Status', description: 'Employment classifications used throughout Employee Masterfile.', mode: 'list', columns: [['name', 'Employment Status']], rows: ['Full-time', 'Part-time', 'Probationary', 'Project-based', 'Separated'].map((name, index) => ({ id: index + 1, name, status: 'Active' })) },
  { id: 'pay-frequency', group: 'generic', name: 'Pay Frequency', description: 'Payroll frequencies available to company assignments.', mode: 'list', columns: [['name', 'Pay Frequency']], rows: ['Weekly', 'Semi-monthly', 'Monthly', 'Quarterly'].map((name, index) => ({ id: index + 1, name, status: 'Active' })) },
  { id: 'banks', group: 'generic', name: 'Bank', description: 'Supported disbursement banks and bank codes.', mode: 'table', columns: [['code', 'Bank Code'], ['name', 'Bank Name'], ['status', 'Status']], rows: [{ id: 1, code: 'BDO', name: 'BDO Unibank', status: 'Active' }, { id: 2, code: 'BPI', name: 'Bank of the Philippine Islands', status: 'Active' }, { id: 3, code: 'UBP', name: 'UnionBank', status: 'Active' }] },
  { id: 'currency', group: 'generic', name: 'Currency', description: 'Currencies available to payroll and employee banking.', mode: 'table', columns: [['code', 'Currency Code'], ['name', 'Currency Name'], ['status', 'Status']], rows: [{ id: 1, code: 'PHP', name: 'Philippine Peso', status: 'Active' }, { id: 2, code: 'USD', name: 'US Dollar', status: 'Active' }] },
  { id: 'relationships', group: 'generic', name: 'Relationship Type', description: 'Relationship values for contacts, dependents, and allottees.', mode: 'list', columns: [['name', 'Relationship Type']], rows: ['Spouse', 'Child', 'Parent', 'Sibling', 'Guardian', 'Other'].map((name, index) => ({ id: index + 1, name, status: 'Active' })) },
  { id: 'departments', group: 'client', name: 'Department', description: 'ABC Company organizational departments.', mode: 'table', columns: [['code', 'Department Code'], ['name', 'Department Name'], ['status', 'Status']], rows: [{ id: 1, code: 'HR', name: 'Human Resources', status: 'Active' }, { id: 2, code: 'FIN', name: 'Finance', status: 'Active' }, { id: 3, code: 'OPS', name: 'Operations', status: 'Active' }] },
  { id: 'cost-centers', group: 'client', name: 'Cost Center', description: 'Client-owned cost centers available to payroll allocation.', mode: 'table', columns: [['code', 'Cost Center Code'], ['name', 'Cost Center Name'], ['status', 'Status']], rows: [{ id: 1, code: 'CC-100', name: 'Corporate Services', status: 'Active' }, { id: 2, code: 'CC-220', name: 'Payroll Operations', status: 'Active' }] },
  { id: 'job-titles', group: 'client', name: 'Job Title', description: 'Approved job titles used in employee assignments.', mode: 'table', columns: [['code', 'Job Code'], ['name', 'Job Title'], ['status', 'Status']], rows: [{ id: 1, code: 'PAY-01', name: 'Payroll Specialist', status: 'Active' }, { id: 2, code: 'PAY-02', name: 'Payroll Analyst', status: 'Active' }, { id: 3, code: 'PAY-03', name: 'Team Lead', status: 'Active' }] },
  { id: 'work-locations', group: 'client', name: 'Work Location', description: 'Office and remote work locations for assignments and statutory handling.', mode: 'table', columns: [['code', 'Location Code'], ['name', 'Location Name'], ['status', 'Status']], rows: [{ id: 1, code: 'MKT', name: 'Makati', status: 'Active' }, { id: 2, code: 'MNL', name: 'Manila', status: 'Active' }] },
  { id: 'payroll-groups', group: 'client', name: 'Payroll Group', description: 'Company payroll population groupings.', mode: 'table', columns: [['code', 'Payroll Group Code'], ['name', 'Payroll Group Name'], ['status', 'Status']], rows: [{ id: 1, code: 'SM-REG', name: 'Semi-monthly Regular', status: 'Active' }, { id: 2, code: 'MN-PROJ', name: 'Monthly Project-based', status: 'Active' }] },
  { id: 'document-types', group: 'others', name: 'Document Type', description: 'Document labels available to employee records.', mode: 'list', columns: [['name', 'Document Type']], rows: ['Birth Certificate', 'Employment Contract', 'Government ID', 'Medical Certificate'].map((name, index) => ({ id: index + 1, name, status: 'Active' })) },
  { id: 'license-types', group: 'others', name: 'License Type', description: 'Professional license types used in Employee Record.', mode: 'list', columns: [['name', 'License Type']], rows: ['Professional License', 'Driver License', 'Safety Accreditation'].map((name, index) => ({ id: index + 1, name, status: 'Active' })) },
  { id: 'training-types', group: 'others', name: 'Training Type', description: 'Training classifications used in Employee Record.', mode: 'list', columns: [['name', 'Training Type']], rows: ['Orientation', 'Compliance', 'Technical', 'Leadership'].map((name, index) => ({ id: index + 1, name, status: 'Active' })) },
];

function ReferenceRail({ onBack }) {
  return <aside className="brand-rail employee-rail" aria-label="Primary navigation"><button className="brand-mark" onClick={onBack} aria-label="Home"><Sparkle weight="fill" /></button><button className="rail-button" onClick={onBack} aria-label="Home"><House /></button><button className="rail-button active" aria-label="Core"><Cube weight="duotone" /></button><button className="rail-button" disabled aria-label="Employees unavailable"><Users /></button><button className="rail-button" disabled aria-label="Time unavailable"><Clock /></button><button className="rail-button" disabled aria-label="Systems unavailable"><PuzzlePiece /></button><div className="rail-spacer" /><button className="rail-button" disabled aria-label="Settings unavailable"><Gear /></button><button className="rail-button" disabled aria-label="Sign out unavailable"><SignOut /></button></aside>;
}

function ReferenceTopbar() {
  return <header className="topbar"><button className="company-switch">ABC Company Ltd <CaretDown weight="bold" /></button><div className="top-actions"><RoleSwitch /><button className="icon-button" aria-label="Search"><MagnifyingGlass /></button><button className="icon-button notification" aria-label="Notifications"><Bell /></button><div className="avatar">JD</div><button className="profile">John Doe <CaretDown /></button></div></header>;
}

function ReferenceSidebar({ activeGroup, setActiveGroup, onBack, closeTable }) {
  return <aside className="company-sidebar reference-sidebar"><button className="back-link" onClick={onBack}>← Back to Core</button><h2>Reference Table</h2><nav>{groups.map(group => { const Icon = group.id === 'generic' ? Table : group.id === 'client' ? Users : SquaresFour; return <button key={group.id} className={`side-link ${activeGroup === group.id ? 'selected' : ''}`} onClick={() => { setActiveGroup(group.id); closeTable(); }}><Icon weight={activeGroup === group.id ? 'fill' : 'regular'} />{group.label}</button>; })}</nav></aside>;
}

function SearchBox({ value, onChange, placeholder = 'Search...' }) {
  return <label className="reference-search"><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /><MagnifyingGlass /></label>;
}

function EntryModal({ table, record, onClose, onSave }) {
  const [draft, setDraft] = useState(record || Object.fromEntries(table.columns.map(([key]) => [key, key === 'status' ? 'Active' : ''])));
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal reference-entry-modal" role="dialog" aria-modal="true" aria-label={`${record ? 'Edit' : 'Add'} ${table.name}`}><header><h2>{record ? 'Edit' : 'Add'} {table.name}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header><form onSubmit={event => { event.preventDefault(); onSave(draft); }}><div className="modal-body reference-form-grid">{table.columns.map(([key, label]) => <label key={key}>{label}<span className="required">*</span>{key === 'status' ? <select required value={draft[key] || 'Active'} onChange={event => setDraft({ ...draft, [key]: event.target.value })}><option>Active</option><option>Inactive</option></select> : <input required value={draft[key] || ''} onChange={event => setDraft({ ...draft, [key]: event.target.value })} placeholder={`Input ${label.toLowerCase()}`} />}</label>)}</div><footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{record ? 'Save changes' : 'Add entry'}</button></footer></form></section></div>;
}

function DeleteModal({ table, record, onClose, onDelete }) {
  return <div className="modal-backdrop"><section className="modal delete-modal" role="dialog" aria-modal="true"><header><h2>Delete entry</h2><button className="icon-button" onClick={onClose}><X /></button></header><div className="modal-body"><p>Delete “{record.name || record.code}” from {table.name}? This cannot be undone.</p><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" onClick={onDelete}>Delete</button></div></div></section></div>;
}

function Catalogue({ tables, activeTable, setActiveTable }) {
  return <div className="reference-catalogue"><div>{tables.map(table => <button key={table.id} className={activeTable?.id === table.id ? 'active' : ''} onClick={() => setActiveTable(table)}><span>{table.name}</span><CaretRight /></button>)}</div></div>;
}

function ReferenceOverview({ tables, activeGroup, onOpen }) {
  const [query, setQuery] = useState('');
  const visible = tables.filter(table => table.group === activeGroup && `${table.name} ${table.description}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="reference-page"><div className="page-heading"><div><p className="breadcrumb">Core / Reference Table</p><h1>Reference Table</h1><p className="page-description">Maintain reusable values shared by employee, company, and payroll workflows.</p></div></div><SearchBox value={query} onChange={setQuery} placeholder="Search reference tables..." /><section className="reference-overview-card">{visible.map(table => { const activeCount = table.rows.filter(row => row.status !== 'Inactive').length; return <button key={table.id} onClick={() => onOpen(table)}><span><strong>{table.name}</strong><small>{activeCount} active value{activeCount === 1 ? '' : 's'}</small></span><CaretRight /></button>; })}{!visible.length && <div className="empty-state compact"><h3>No reference tables found</h3><p>Try another search term or category.</p></div>}</section></div>;
}

function ReferenceDetail({ table, siblingTables, setTable, updateTable, notify }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('data');
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  const uploadRef = useRef(null);
  const filteredRows = table.rows.filter(row => Object.values(row).join(' ').toLowerCase().includes(query.toLowerCase()));
  const save = draft => {
    const rows = draft.id ? table.rows.map(row => row.id === draft.id ? draft : row) : [...table.rows, { ...draft, id: Date.now() }];
    updateTable({ ...table, rows }); setEditing(undefined); notify({ type: 'success', message: `${table.name} entry ${draft.id ? 'updated' : 'added'} successfully.` });
  };
  const exportRows = () => {
    const csv = [table.columns.map(([, label]) => `"${label}"`).join(','), ...table.rows.map(row => table.columns.map(([key]) => `"${String(row[key] || '').replaceAll('"', '""')}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = `${table.id}.csv`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
    notify({ type: 'success', message: `${table.name} export prepared.` });
  };
  const importRows = event => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean); const headers = lines[0]?.split(',').map(value => value.replaceAll('"', '').trim().toLowerCase()) || [];
      const labels = Object.fromEntries(table.columns.flatMap(([key, label]) => [[key.toLowerCase(), key], [label.toLowerCase(), key]]));
      const imported = lines.slice(1).map((line, index) => { const values = line.split(',').map(value => value.replace(/^"|"$/g, '').trim()); const row = { id: Date.now() + index }; headers.forEach((header, i) => { if (labels[header]) row[labels[header]] = values[i]; }); return row; }).filter(row => Object.keys(row).length > 1);
      if (!imported.length) notify({ type: 'error', message: 'No matching reference rows were found.' }); else { updateTable({ ...table, rows: [...table.rows, ...imported] }); notify({ type: 'success', message: `${imported.length} ${table.name} entries imported.` }); }
    }; reader.readAsText(file); event.target.value = '';
  };
  return <div className="reference-page reference-detail-page"><div className="page-heading"><div><p className="breadcrumb">{groups.find(group => group.id === table.group)?.label} / {table.name}</p><h1>{table.name}</h1><p className="page-description">{table.description}</p></div></div><nav className="reference-detail-tabs"><button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>Data</button><button className={tab === 'usage' ? 'active' : ''} onClick={() => setTab('usage')}>Usage</button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Audit Log</button></nav>
    {tab === 'data' && <><div className="reference-detail-toolbar"><SearchBox value={query} onChange={setQuery} /><span className="toolbar-spacer" /><button className="button primary" onClick={() => setEditing(null)}><Plus /> Add</button><button className="button secondary" onClick={() => uploadRef.current?.click()}><UploadSimple /> Upload</button><button className="button secondary" onClick={exportRows}><DownloadSimple /> Export</button><input ref={uploadRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={importRows} /></div><section className={`reference-editor-card ${table.mode === 'list' ? 'split' : ''}`}>{table.mode === 'list' && <Catalogue tables={siblingTables} activeTable={table} setActiveTable={setTable} />}<div className="reference-data-table"><table><thead><tr>{table.columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Action</th></tr></thead><tbody>{filteredRows.map(row => <tr key={row.id}>{table.columns.map(([key]) => <td key={key}>{row[key]}</td>)}<td><div className="row-actions always"><button onClick={() => setEditing(row)} aria-label="Edit"><PencilSimple /></button><button onClick={() => setDeleting(row)} aria-label="Delete"><Trash /></button></div></td></tr>)}</tbody></table>{!filteredRows.length && <div className="empty-state compact"><h3>No entries found</h3><p>Add a value or adjust your search.</p></div>}<div className="reference-pagination"><span>Displaying {filteredRows.length} of {table.rows.length} items</span><span>1 of 1</span></div></div></section></>}
    {tab === 'usage' && <section className="reference-info-card"><h2>Used by Atlas</h2><p>This reference table is available to Employee Masterfile forms, company configuration, payroll allocation, and reporting filters. Updates apply to new selections while historical records keep their saved value.</p><div className="reference-usage-grid"><span>Employee Masterfile<strong>Synced</strong></span><span>Company Configuration<strong>Synced</strong></span><span>Payroll<strong>Synced</strong></span></div></section>}
    {tab === 'history' && <section className="reference-info-card"><h2>Audit Log</h2><div className="reference-audit-row"><span>09 Aug 2026 · John Doe</span><strong>Reference table reviewed</strong></div><div className="reference-audit-row"><span>08 Aug 2026 · System migration</span><strong>{table.rows.length} values loaded</strong></div></section>}
    {editing !== undefined && <EntryModal table={table} record={editing || null} onClose={() => setEditing(undefined)} onSave={save} />}{deleting && <DeleteModal table={table} record={deleting} onClose={() => setDeleting(null)} onDelete={() => { updateTable({ ...table, rows: table.rows.filter(row => row.id !== deleting.id) }); setDeleting(null); notify({ type: 'success', message: `${table.name} entry deleted.` }); }} />}
  </div>;
}

export function ReferenceTables({ onBack, notify }) {
  const [tables, setTables] = useState(() => { try { return JSON.parse(localStorage.getItem('atlas-reference-tables-v2')) || seedTables; } catch { return seedTables; } });
  const [activeGroup, setActiveGroup] = useState('generic');
  const [activeId, setActiveId] = useState(null);
  useEffect(() => localStorage.setItem('atlas-reference-tables-v2', JSON.stringify(tables)), [tables]);
  const activeTable = useMemo(() => tables.find(table => table.id === activeId), [activeId, tables]);
  const updateTable = next => setTables(previous => previous.map(table => table.id === next.id ? next : table));
  return <div className="app-shell reference-screen"><ReferenceRail onBack={onBack} /><ReferenceSidebar activeGroup={activeGroup} setActiveGroup={setActiveGroup} onBack={onBack} closeTable={() => setActiveId(null)} /><main className="reference-main"><ReferenceTopbar />{activeTable ? <ReferenceDetail table={activeTable} siblingTables={tables.filter(table => table.group === activeTable.group)} setTable={table => setActiveId(table.id)} updateTable={updateTable} notify={notify} /> : <ReferenceOverview tables={tables} activeGroup={activeGroup} onOpen={table => setActiveId(table.id)} />}</main></div>;
}
