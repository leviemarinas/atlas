import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Buildings,
  CaretDown,
  CheckCircle,
  DownloadSimple,
  Eye,
  FileCsv,
  FilePdf,
  FileText,
  Function,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Receipt,
  Table,
  UploadSimple,
  X,
} from '@phosphor-icons/react';

const STORAGE_KEY = 'atlas-statutory-tables-v2';

const agencyDefinitions = {
  sss: {
    name: 'Social Security System', short: 'SSS', prefix: 'SSS',
    fields: [
      ['minimum', 'Minimum Monthly Compensation'], ['maximum', 'Maximum Monthly Compensation'],
      ['mscRegular', 'MSC - Regular SS / EC'], ['mscMpf', 'MSC - MPF'], ['totalMsc', 'Total Monthly Salary Credit'],
      ['regularEe', 'Regular SS - EE'], ['regularEr', 'Regular SS - ER'], ['ecEr', 'EC - ER'], ['totalRegular', 'Total Regular SS & EC'],
      ['mpfEe', 'MPF - EE'], ['mpfEr', 'MPF - ER'], ['totalMpf', 'Total MPF'],
      ['totalEe', 'Total EE'], ['totalEr', 'Total ER'], ['overallTotal', 'Overall Total'],
    ],
    columns: [['minimum', 'Minimum Monthly Compensation'], ['maximum', 'Maximum Monthly Compensation'], ['mscRegular', 'MSC - Regular SS / EC'], ['mscMpf', 'MSC - MPF'], ['totalEe', 'Total EE'], ['totalEr', 'Total ER'], ['overallTotal', 'Overall Total']],
  },
  philhealth: {
    name: 'PhilHealth', short: 'PhilHealth', prefix: 'PHIC',
    fields: [
      ['minimum', 'Minimum Monthly Compensation'], ['maximum', 'Maximum Monthly Compensation'], ['unit', 'Unit', 'select'],
      ['minimumEmployeeShare', 'Minimum Employee Share'], ['maximumEmployeeShare', 'Maximum Employee Share'],
      ['minimumEmployerShare', 'Minimum Employer Share'], ['maximumEmployerShare', 'Maximum Employer Share'],
      ['eeRate', 'EE Premium Rate'], ['erRate', 'ER Premium Rate'],
    ],
    columns: [['minimum', 'Minimum Monthly Compensation'], ['maximum', 'Maximum Monthly Compensation'], ['unit', 'Unit'], ['employeeShare', 'Employee Share'], ['employerShare', 'Employer Share']],
  },
  pagibig: {
    name: 'Pag-IBIG', short: 'Pag-IBIG', prefix: 'HDMF',
    fields: [
      ['minimum', 'Minimum Monthly Compensation'], ['maximum', 'Maximum Monthly Compensation'], ['unit', 'Unit', 'select'],
      ['minimumEmployeeShare', 'Minimum Employee Share'], ['maximumEmployeeShare', 'Maximum Employee Share'],
      ['minimumEmployerShare', 'Minimum Employer Share'], ['maximumEmployerShare', 'Maximum Employer Share'],
      ['eeRate', 'EE Premium Rate'], ['erRate', 'ER Premium Rate'],
    ],
    columns: [['minimum', 'Minimum Monthly Compensation'], ['maximum', 'Maximum Monthly Compensation'], ['unit', 'Unit'], ['employeeShare', 'Employee Share'], ['employerShare', 'Employer Share']],
  },
};

const php = value => `₱ ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fieldValue = (agency, row, key) => {
  if (key === 'employeeShare') return row.unit === 'Percentage (%)' ? `${Number(row.eeRate || 0).toFixed(2)}%` : `${php(row.minimumEmployeeShare)} – ${php(row.maximumEmployeeShare)}`;
  if (key === 'employerShare') return row.unit === 'Percentage (%)' ? `${Number(row.erRate || 0).toFixed(2)}%` : `${php(row.minimumEmployerShare)} – ${php(row.maximumEmployerShare)}`;
  if (key === 'unit') return row.unit || 'Amount (₱)';
  return php(row[key]);
};

function contributionRow(id, minimum, maximum, eeRate, erRate) {
  return { id, minimum, maximum, unit: 'Percentage (%)', eeRate, erRate, minimumEmployeeShare: 0, maximumEmployeeShare: 0, minimumEmployerShare: 0, maximumEmployerShare: 0 };
}

function sssRow(id, minimum, maximum, mscRegular, mscMpf, regularEe, regularEr, ecEr, mpfEe, mpfEr) {
  const totalMsc = mscRegular + mscMpf;
  const totalRegular = regularEe + regularEr + ecEr;
  const totalMpf = mpfEe + mpfEr;
  return { id, minimum, maximum, mscRegular, mscMpf, totalMsc, regularEe, regularEr, ecEr, totalRegular, mpfEe, mpfEr, totalMpf, totalEe: regularEe + mpfEe, totalEr: regularEr + ecEr + mpfEr, overallTotal: totalRegular + totalMpf };
}

function seedVersion(agency, year, index, active = false) {
  const def = agencyDefinitions[agency];
  const rows = agency === 'sss'
    ? [sssRow(1, 0, 5249.99, 5000, 0, 250, 500, 10, 0, 0), sssRow(2, 5250, 5749.99, 5500, 0, 275, 550, 10, 0, 0), sssRow(3, 5750, 6249.99, 6000, 0, 300, 600, 10, 0, 0)]
    : agency === 'philhealth'
      ? [
          { ...contributionRow(1, 0, 9999.99, 0, 0), unit: 'Amount (₱)', minimumEmployeeShare: 250, maximumEmployeeShare: 250, minimumEmployerShare: 250, maximumEmployerShare: 250 },
          contributionRow(2, 10000, 99999.99, 2.5, 2.5),
          { ...contributionRow(3, 100000, 999999, 0, 0), unit: 'Amount (₱)', minimumEmployeeShare: 2500, maximumEmployeeShare: 2500, minimumEmployerShare: 2500, maximumEmployerShare: 2500 },
        ]
      : [contributionRow(1, 0, 1500, 1, 2), contributionRow(2, 1500.01, 999999, 2, 2), { ...contributionRow(3, 0, 999999, 0, 0), unit: 'Amount (₱)', minimumEmployeeShare: 2500, maximumEmployeeShare: 2500, minimumEmployerShare: 2500, maximumEmployerShare: 2500 }];
  return {
    id: `${agency}-${year}-${index}`,
    code: `${def.prefix}-${year}-${String(index).padStart(3, '0')}`,
    effectiveDate: `${year}-${index === 1 ? '01-01' : '07-01'}`,
    status: active ? 'Active' : 'Inactive',
    updatedBy: index % 2 ? 'Ethan Collins' : 'Mark Santos',
    updatedAt: `08/08/${year} 10:00:29 PM`,
    rows,
  };
}

function seedData() {
  return Object.fromEntries(Object.keys(agencyDefinitions).map(agency => [agency, [
    seedVersion(agency, 2026, 1, true), seedVersion(agency, 2025, 1), seedVersion(agency, 2024, 1),
    seedVersion(agency, 2023, 1), seedVersion(agency, 2022, 1), seedVersion(agency, 2021, 1),
  ]]));
}

function readData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || seedData(); } catch { return seedData(); }
}

function download(filename, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function toCsv(rows, columns) {
  const q = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [columns.map(([, label]) => q(label)).join(','), ...rows.map(row => columns.map(([key]) => q(row[key])).join(','))].join('\n');
}

function exportTable(def, version, format) {
  const rows = version.rows.map(row => Object.fromEntries(def.fields.map(([key]) => [key, row[key] ?? ''])));
  const csv = toCsv(rows, def.fields.map(([key, label]) => [key, label]));
  if (format === 'csv' || format === 'excel') download(`${version.code}.${format === 'excel' ? 'xls' : 'csv'}`, format === 'excel' ? `<html><body><pre>${csv}</pre></body></html>` : csv, format === 'excel' ? 'application/vnd.ms-excel' : 'text/csv');
  if (format === 'docx') download(`${version.code}.doc`, `<html><body><h1>${def.name}</h1><pre>${csv}</pre></body></html>`, 'application/msword');
  if (format === 'pdf') {
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) return false;
    popup.document.write(`<html><head><title>${version.code}</title><style>body{font-family:Arial;padding:24px}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #bbb;padding:7px;text-align:left}</style></head><body><h1>${def.name}</h1><p>Effective ${version.effectiveDate}</p><table><thead><tr>${def.fields.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${def.fields.map(([key]) => `<td>${row[key]}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }
  return true;
}

function HubCard({ icon: Icon, label, detail, enabled, onClick }) {
  return <button className={`platform-card ${enabled ? 'enabled' : ''}`} disabled={!enabled} onClick={enabled ? onClick : undefined}>
    <Icon weight="duotone" />
    <span><strong>{label}</strong><small>{detail}</small></span>
    {enabled ? <ArrowRight /> : <em>Coming soon</em>}
  </button>;
}

export function SettingsHub({ onOpen, onOpenComputationLibrary }) {
  const cards = [
    [Buildings, 'Company Onboarding', 'Register and verify client companies'],
    [ArrowLeft, 'Company Offboarding', 'Manage company exit requirements'],
    [Function, 'Standard Computation Library', 'Add, edit and delete standard payroll formulas', true, onOpenComputationLibrary],
    [Receipt, 'Statutory Table', 'SSS, PhilHealth and Pag-IBIG versions', true],
    [FileText, 'Pay Code', 'Payroll code library and mapping'],
  ];
  return <div className="platform-hub page-content">
    <section className="hero-card"><p className="eyebrow">System administration</p><h1>Settings</h1><p>Manage platform setup and controlled statutory configuration.</p></section>
    <section className="platform-grid">{cards.map(([Icon, label, detail, enabled, handler]) => <HubCard key={label} icon={Icon} label={label} detail={detail} enabled={enabled} onClick={handler || onOpen} />)}</section>
  </div>;
}

export function PayrollHub({ onOpen }) {
  const cards = [
    [Receipt, 'Payroll Processing', 'Prepare, validate and post payroll'],
    [FileText, 'Payslip Designer', 'Configure payslip presentation'],
    [Table, 'Statutory Table', 'View effective contribution tables', true],
    [CheckCircle, 'Remittance Monitoring', 'Track government remittances'],
    [Buildings, 'Journal Entry', 'Review accounting entries'],
    [FileText, 'Reports', 'Generate standard payroll reports'],
  ];
  return <div className="platform-hub page-content">
    <section className="hero-card payroll-hero"><p className="eyebrow">Operations workspace</p><h1>Payroll</h1><p>Process payroll and use the approved company configuration.</p></section>
    <section className="platform-grid">{cards.map(([Icon, label, detail, enabled]) => <HubCard key={label} icon={Icon} label={label} detail={detail} enabled={enabled} onClick={onOpen} />)}</section>
  </div>;
}

function ExportMenu({ onExport }) {
  const [open, setOpen] = useState(false);
  return <div className="menu-anchor">
    <button className="button secondary" onClick={() => setOpen(value => !value)}><DownloadSimple /> Export <CaretDown /></button>
    {open && <div className="export-menu">
      <button onClick={() => { onExport('excel'); setOpen(false); }}><FileText /> Excel</button>
      <button onClick={() => { onExport('csv'); setOpen(false); }}><FileCsv /> CSV</button>
      <button onClick={() => { onExport('pdf'); setOpen(false); }}><FilePdf /> PDF / Print</button>
      <button onClick={() => { onExport('docx'); setOpen(false); }}><FileText /> DOCX</button>
    </div>}
  </div>;
}

function EntryModal({ agency, row, onClose, onSave, readOnly = false }) {
  const def = agencyDefinitions[agency];
  const [draft, setDraft] = useState({ unit: 'Percentage (%)', ...row });
  const submit = event => {
    event.preventDefault();
    const numeric = Object.fromEntries(def.fields.filter(([key]) => key !== 'unit').map(([key]) => [key, Number(draft[key] || 0)]));
    let prepared = { ...draft, ...numeric };
    if (agency === 'sss') prepared = { ...prepared, totalMsc: prepared.mscRegular + prepared.mscMpf, totalRegular: prepared.regularEe + prepared.regularEr + prepared.ecEr, totalMpf: prepared.mpfEe + prepared.mpfEr, totalEe: prepared.regularEe + prepared.mpfEe, totalEr: prepared.regularEr + prepared.ecEr + prepared.mpfEr, overallTotal: prepared.regularEe + prepared.regularEr + prepared.ecEr + prepared.mpfEe + prepared.mpfEr };
    onSave(prepared);
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal statutory-entry-modal" role="dialog" aria-modal="true">
      <header><h2>{readOnly ? 'View Details' : `${row?.id ? 'Edit' : 'Add'} Statutory Table Entry`}</h2><button className="icon-button" onClick={onClose}><X /></button></header>
      <form onSubmit={submit}>
        <div className="statutory-entry-grid">
          {def.fields.map(([key, label, type]) => {
            if (agency !== 'sss' && draft.unit === 'Percentage (%)' && /Share/.test(key)) return null;
            if (agency !== 'sss' && draft.unit === 'Amount (₱)' && /Rate/.test(key)) return null;
            const computed = agency === 'sss' && ['totalMsc', 'totalRegular', 'totalMpf', 'totalEe', 'totalEr', 'overallTotal'].includes(key);
            return <label key={key}>{label}{!readOnly && !computed && <span className="required">*</span>}
              {readOnly ? <strong>{key === 'unit' ? draft[key] : fieldValue(agency, draft, key)}</strong> : type === 'select' ? <select required value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })}><option>Percentage (%)</option><option>Amount (₱)</option></select> : <input required={!computed} type="number" step="0.01" min="0" value={draft[key] ?? ''} disabled={computed} onChange={event => setDraft({ ...draft, [key]: event.target.value })} />}
            </label>;
          })}
        </div>
        <div className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>{!readOnly && <button className="button primary">{row?.id ? 'Save changes' : 'Add entry'}</button>}</div>
      </form>
    </section>
  </div>;
}

function AgencySidebar({ agency, setAgency, mode, onBack }) {
  return <aside className="statutory-sidebar">
    <button className="back-link" onClick={onBack}><ArrowLeft /> Back to {mode === 'settings' ? 'Settings' : 'Payroll'}</button>
    <h2>Statutory Tables</h2>
    <nav>{Object.entries(agencyDefinitions).map(([key, def]) => <button key={key} className={agency === key ? 'selected' : ''} onClick={() => setAgency(key)}><Table weight={agency === key ? 'fill' : 'regular'} /> {def.short}</button>)}</nav>
    <div className="statutory-sidebar-note"><CheckCircle weight="duotone" /><span><strong>{mode === 'settings' ? 'Controlled versions' : 'Approved tables'}</strong><small>{mode === 'settings' ? 'Changes are audited per company.' : 'Payroll uses only the active effective version.'}</small></span></div>
  </aside>;
}

export function StatutoryTables({ mode = 'settings', onBack, notify }) {
  const [data, setData] = useState(readData);
  const [agency, setAgency] = useState('sss');
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [entryEditing, setEntryEditing] = useState(undefined);
  const [viewing, setViewing] = useState(null);
  const importRef = useRef(null);
  const def = agencyDefinitions[agency];
  const versions = data[agency] || [];
  const activeVersion = [...versions].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).find(item => item.status === 'Active') || versions[0];
  const selected = mode === 'payroll' ? activeVersion : versions.find(item => item.id === selectedId);
  const [draft, setDraft] = useState(null);
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(data)), [data]);
  useEffect(() => { setSelectedId(null); setDraft(null); setQuery(''); }, [agency, mode]);
  useEffect(() => {
    if (mode === 'settings' && selectedId && !selected) return;
    setDraft(selected ? { ...selected, rows: selected.rows.map(row => ({ ...row })) } : null);
  }, [selectedId, agency, mode, selected]);
  const tableVersion = mode === 'payroll' ? activeVersion : draft;
  const visibleRows = useMemo(() => (tableVersion?.rows || []).filter(row => Object.values(row).join(' ').toLowerCase().includes(query.toLowerCase())), [tableVersion, query]);

  const addVersion = () => {
    const number = versions.length + 1;
    const item = { id: `${agency}-${Date.now()}`, code: `${def.prefix}-${new Date().getFullYear()}-${String(number).padStart(3, '0')}`, effectiveDate: new Date().toISOString().slice(0, 10), status: 'Draft', updatedBy: 'Client Admin', updatedAt: new Date().toLocaleString(), rows: [] };
    setDraft(item); setSelectedId(item.id);
  };
  const saveVersion = () => {
    if (!draft.effectiveDate || !draft.status) { notify({ type: 'error', message: 'Effective date and status are required.' }); return; }
    setData(previous => ({ ...previous, [agency]: [
      ...previous[agency].filter(item => item.id !== draft.id).map(item => draft.status === 'Active' && item.status === 'Active' ? { ...item, status: 'Inactive' } : item),
      { ...draft, updatedBy: 'Client Admin', updatedAt: new Date().toLocaleString() },
    ].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)) }));
    setSelectedId(null); setDraft(null);
    notify({ type: 'success', message: `${draft.code} saved successfully.` });
  };
  const saveEntry = entry => {
    const id = entry.id || Math.max(0, ...draft.rows.map(row => Number(row.id) || 0)) + 1;
    setDraft(previous => ({ ...previous, rows: entry.id ? previous.rows.map(row => row.id === entry.id ? { ...entry, id } : row) : [...previous.rows, { ...entry, id }] }));
    setEntryEditing(undefined);
    notify({ type: 'success', message: `Statutory table entry ${entry.id ? 'updated' : 'added'} successfully.` });
  };
  const importRows = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      const headers = (lines.shift() || '').split(',').map(value => value.replaceAll('"', '').trim().toLowerCase());
      const rows = lines.map((line, index) => {
        const values = line.split(',').map(value => value.replaceAll('"', '').trim());
        const item = { id: index + 1 };
        def.fields.forEach(([key, label]) => {
          const position = headers.findIndex(header => header === key.toLowerCase() || header === label.toLowerCase());
          if (position >= 0) item[key] = key === 'unit' ? values[position] : Number(values[position] || 0);
        });
        return item;
      });
      setDraft(previous => ({ ...previous, rows }));
      notify({ type: 'success', message: `${rows.length} ${def.short} rows imported for review.` });
    };
    reader.readAsText(file); event.target.value = '';
  };

  const renderTable = version => <>
    <div className="statutory-toolbar">
      <div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search..." /><MagnifyingGlass /></div>
      <div className="toolbar-spacer" />
      {mode === 'settings' && <><button className="button primary" onClick={() => setEntryEditing(null)}><Plus /> Add</button><button className="button secondary" onClick={() => importRef.current?.click()}><UploadSimple /> Import</button><input className="sr-only" ref={importRef} type="file" accept=".csv,text/csv" onChange={importRows} /></>}
      <ExportMenu onExport={format => { exportTable(def, version, format); notify({ type: 'success', message: `${def.short} export prepared.` }); }} />
    </div>
    <div className="table-card statutory-table-card"><table className="statutory-table"><thead><tr>{def.columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Action</th></tr></thead><tbody>
      {visibleRows.length ? visibleRows.map(row => <tr key={row.id}>{def.columns.map(([key]) => <td key={key}>{fieldValue(agency, row, key)}</td>)}<td><div className="row-actions always"><button onClick={() => setViewing(row)} aria-label="View"><Eye /></button>{mode === 'settings' && <button onClick={() => setEntryEditing(row)} aria-label="Edit"><PencilSimple /></button>}</div></td></tr>) : <tr><td colSpan={def.columns.length + 1}><div className="empty-state compact"><h3>No entries found</h3><p>Add an entry or import the approved table.</p></div></td></tr>}
    </tbody></table></div>
    <div className="pagination"><span>Displaying <strong>{visibleRows.length}</strong> of {version.rows.length} items</span><div><button disabled>«</button><strong>1</strong><span>of 1</span><button disabled>»</button></div></div>
  </>;

  return <div className="statutory-workspace">
    <AgencySidebar agency={agency} setAgency={setAgency} mode={mode} onBack={onBack} />
    <main className="statutory-main">
      {!tableVersion && mode === 'settings' ? <>
        <div className="page-heading"><div><p className="breadcrumb">Settings / Statutory Tables</p><h1>{def.name}</h1><p className="page-description">Maintain current and historical statutory table versions for ABC Company Ltd.</p></div></div>
        <div className="statutory-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search code or effective date..." /><MagnifyingGlass /></div><div className="toolbar-spacer" /><button className="button primary" onClick={addVersion}><Plus /> Add</button><ExportMenu onExport={format => exportTable(def, versions[0], format)} /></div>
        <div className="table-card statutory-version-card"><table><thead><tr><th>Code</th><th>Effective Date</th><th>Status</th><th>Last Updated By</th><th>Last Updated Date</th><th>Action</th></tr></thead><tbody>{versions.filter(item => `${item.code} ${item.effectiveDate}`.toLowerCase().includes(query.toLowerCase())).map(item => <tr key={item.id}><td><button className="table-link" onClick={() => setSelectedId(item.id)}>{item.code}</button></td><td>{item.effectiveDate}</td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></td><td>{item.updatedBy}</td><td>{item.updatedAt}</td><td><div className="row-actions always"><button onClick={() => setSelectedId(item.id)}><PencilSimple /></button></div></td></tr>)}</tbody></table></div>
      </> : tableVersion ? <>
        {mode === 'settings' && <button className="inline-back" onClick={() => { setSelectedId(null); setDraft(null); }}><ArrowLeft /> {def.short} versions</button>}
        <div className="page-heading"><div><p className="breadcrumb">{mode === 'settings' ? 'Settings' : 'Payroll'} / Statutory Tables / {def.short}</p><h1>{mode === 'settings' ? `${def.short} Statutory Table` : def.name}</h1><p className="page-description">{mode === 'settings' ? 'Add or revise contribution brackets before activating this version.' : 'View the active table used by the current payroll computation.'}</p></div>{mode === 'payroll' && <span className="controlled-badge"><CheckCircle weight="fill" /> Active approved version</span>}</div>
        <section className="statutory-version-meta">
          {mode === 'settings' ? <><label>Code<input value={draft.code} disabled /></label><label>Effective Date<input type="date" value={draft.effectiveDate} onChange={event => setDraft({ ...draft, effectiveDate: event.target.value })} /></label><label>Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option>Draft</option><option>Active</option><option>Inactive</option></select></label></> : <><span><small>Effective</small><strong>{activeVersion.effectiveDate}</strong></span><span><small>Version</small><strong>{activeVersion.code}</strong></span><span><small>Status</small><strong>Active</strong></span></>}
        </section>
        <section className="statutory-table-section"><div className="workspace-copy"><h2>{def.short} Statutory Table</h2><p>{mode === 'settings' ? 'Contribution brackets and employee/employer shares.' : 'Approved brackets are read-only in Payroll.'}</p></div>{renderTable(tableVersion)}</section>
        {mode === 'settings' && <div className="statutory-save-row"><button className="button secondary" onClick={() => { setSelectedId(null); setDraft(null); }}>Cancel</button><button className="button primary" onClick={saveVersion}>Save table</button></div>}
      </> : null}
    </main>
    {entryEditing !== undefined && <EntryModal agency={agency} row={entryEditing} onClose={() => setEntryEditing(undefined)} onSave={saveEntry} />}
    {viewing && <EntryModal agency={agency} row={viewing} onClose={() => setViewing(null)} onSave={() => {}} readOnly />}
  </div>;
}
