import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Buildings,
  CaretDown,
  CheckCircle,
  DownloadSimple,
  Eye,
  FileCsv,
  FilePdf,
  FileText,
  Function,
  LockKey,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Receipt,
  Table,
  Ticket,
  Timer,
  Compass,
  Question,
  ChartLine,
  Envelope,
  Hash,
  MinusCircle,
  Money,
  PaperPlaneTilt,
  PlusCircle,
  Scales,
  UploadSimple,
  X,
} from '@phosphor-icons/react';
import { STATUTORY_STORAGE_KEY, versionUsage } from './statutoryService';
import { agencyDefinitions, agencyGroups, seedStatutoryData as seedData } from './statutorySchedules';
import { useRole } from './RoleContext';
import { visibleTiles } from './moduleAccess';

const STORAGE_KEY = STATUTORY_STORAGE_KEY;

/**
 * The tables themselves live in `statutoryTables.js` so the payroll engine
 * computes a contribution from the very rows this register publishes. They are
 * re-exported here because this module is the register's screen.
 */
export { agencyDefinitions, agencyGroups };

const php = value => `₱ ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fieldType = (agency, key) => (agencyDefinitions[agency]?.fields || []).find(([fieldKey]) => fieldKey === key)?.[2] || 'number';
const fieldValue = (agency, row, key) => {
  if (key === 'employeeShare') return row.unit === 'Percentage (%)' ? `${Number(row.eeRate || 0).toFixed(2)}%` : `${php(row.minimumEmployeeShare)} – ${php(row.maximumEmployeeShare)}`;
  if (key === 'employerShare') return row.unit === 'Percentage (%)' ? `${Number(row.erRate || 0).toFixed(2)}%` : `${php(row.minimumEmployerShare)} – ${php(row.maximumEmployerShare)}`;
  if (key === 'unit') return row.unit || 'Amount (₱)';
  // A column prints as money only when its agency declares it numeric. Listing
  // the text keys by hand meant every new text column (ATC code, nature of the
  // income payment) rendered as PHP NaN, so the declared type decides instead.
  if (['text', 'select'].includes(fieldType(agency, key))) return row[key] || '—';
  if (/Rate/i.test(key)) return `${Number(row[key] || 0).toFixed(2)}%`;
  return php(row[key]);
};

function readData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return seedData();
    // A stored payload written before Tax Tables existed has no rows for the new
    // registers; seed only the agencies it is missing so saved edits survive.
    const seeded = seedData();
    return { ...seeded, ...Object.fromEntries(Object.entries(saved).filter(([, versions]) => Array.isArray(versions) && versions.length)) };
  } catch { return seedData(); }
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

export function SettingsHub({ onOpen, onOpenTax, onOpenReference, onOpenComputationLibrary, onOpenWorkspace }) {
  const { role } = useRole();
  const cards = [
    { icon: Buildings, label: 'Company Onboarding', detail: 'Register, verify and import startup/YTD data', handler: () => onOpenWorkspace('onboarding') },
    { icon: ArrowLeft, label: 'Company Offboarding', detail: 'Export data and manage company deactivation', handler: () => onOpenWorkspace('offboarding') },
    { icon: Function, label: 'Standard Computation Library', detail: 'Controlled payroll formulas and test calculations', handler: onOpenComputationLibrary },
    { icon: Scales, label: 'Statutory Table', detail: 'SSS, PhilHealth, Pag-IBIG and De Minimis versions', handler: onOpen },
    { icon: Table, label: 'Tax Tables', detail: 'BIR annual, compensation, expanded and final tax versions', handler: onOpenTax },
    { icon: Money, label: 'MWE Rate Tables', detail: 'Regional minimum wage rates, sectors and wage orders', handler: () => onOpenWorkspace('mweRates') },
    { icon: Table, label: 'Reference Table', detail: 'Canonical company and payroll reference data with versions and history', handler: onOpenReference || onOpen },
    { icon: FileText, label: 'Paycode Management', detail: 'Payroll code library, classifications and GL mapping', handler: () => onOpenWorkspace('payCodes') },
    { icon: Table, label: 'Calendar Settings', detail: 'Payout, locking, statutory and billing deadlines', handler: () => onOpenWorkspace('calendar') },
    { icon: Compass, label: 'Navigation Configuration', detail: 'Publish ordered guide and navigation content', handler: () => onOpenWorkspace('navigation') },
    { icon: BookOpen, label: 'FAQ and Self-Learning', detail: 'Sanitized searchable FAQ content by module', handler: () => onOpenWorkspace('faq') },
    { icon: Ticket, label: 'Ticketing / Helpdesk', detail: 'Topics, assignment destinations and SLA rules', handler: () => onOpenWorkspace('tickets') },
    { icon: Timer, label: 'Overtime Rate Management', detail: 'Overtime codes, day-type rates, attendance conditions and approvals', handler: () => onOpenWorkspace('overtime') },
    { icon: CheckCircle, label: 'Access & Approvals', detail: 'Role-based access and multi-level approvals', handler: () => onOpenWorkspace('accessRights') },
    { icon: Eye, label: 'Audit Log', detail: 'Chronological access and configuration events', handler: () => onOpenWorkspace('audit') },
  ];
  return <div className="platform-hub page-content">
    <section className="hero-card"><p className="eyebrow">System administration</p><h1>Settings</h1><p>Manage platform setup and controlled statutory configuration.</p></section>
    <section className="platform-grid">{visibleTiles(role, cards).map(card => <HubCard key={card.label} icon={card.icon} label={card.label} detail={card.detail} enabled onClick={card.handler} />)}</section>
  </div>;
}

export function PayrollHub({ onOpen, onOpenTax, onOpenWorkspace }) {
  const { role } = useRole();
  const cards = [
    { icon: Money, label: 'Earning Management', detail: 'Assign recurring and one-time earnings per employee', handler: () => onOpenWorkspace('earnings') },
    { icon: MinusCircle, label: 'Deduction Management', detail: 'Track employee deductions, schedules and balances', handler: () => onOpenWorkspace('deductions') },
    { icon: PlusCircle, label: 'Bonus Management', detail: 'Schedule and process 13th month, performance and retention bonuses', handler: () => onOpenWorkspace('bonuses') },
    { icon: Hash, label: 'Paycode Management', detail: 'Payroll code library, classifications and GL mapping', handler: () => onOpenWorkspace('payCodes') },
    { icon: PaperPlaneTilt, label: 'Remittance Monitoring', detail: 'Track government filings and receipts against posted payouts', handler: () => onOpenWorkspace('remittance') },
    { icon: Receipt, label: 'Payroll Processing', detail: 'Create, recalculate, approve, post and lock payroll', handler: () => onOpenWorkspace('transactions') },
    { icon: Envelope, label: 'Payslip Designer', detail: 'Configure branded payslip presentation', handler: () => onOpenWorkspace('payslip') },
    { icon: Buildings, label: 'Journal Entry', detail: 'Review balanced payroll accounting entries', handler: () => onOpenWorkspace('journal') },
    { icon: ChartLine, label: 'Reports', detail: 'Generate payroll, statutory, YTD and audit reports', handler: () => onOpenWorkspace('reports') },
    { icon: Scales, label: 'Statutory Table', detail: 'View effective SSS, PhilHealth, Pag-IBIG and De Minimis tables', handler: onOpen },
    { icon: Table, label: 'Tax Tables', detail: 'View effective annual, compensation, expanded and final tax tables', handler: onOpenTax },
    { icon: Receipt, label: 'Billing', detail: 'Generate and approve client billing transactions', handler: () => onOpenWorkspace('billing') },
    { icon: Eye, label: 'Audit Log', detail: 'Review payroll transaction and posting events', handler: () => onOpenWorkspace('audit') },
  ];
  return <div className="platform-hub page-content">
    <section className="hero-card payroll-hero"><p className="eyebrow">Operations workspace</p><h1>Payroll</h1><p>Process payroll and use the approved company configuration.</p></section>
    <section className="platform-grid">{visibleTiles(role, cards).map(card => <HubCard key={card.label} icon={card.icon} label={card.label} detail={card.detail} enabled onClick={card.handler} />)}</section>
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
    const numeric = Object.fromEntries(def.fields.filter(([, , type]) => !['text', 'select'].includes(type)).map(([key]) => [key, Number(draft[key] || 0)]));
    let prepared = { ...draft, ...numeric };
    if (agency === 'sss') prepared = { ...prepared, totalMsc: prepared.mscRegular + prepared.mscMpf, totalRegular: prepared.regularEe + prepared.regularEr + prepared.ecEr, totalMpf: prepared.mpfEe + prepared.mpfEr, totalEe: prepared.regularEe + prepared.mpfEe, totalEr: prepared.regularEr + prepared.ecEr + prepared.mpfEr, overallTotal: prepared.regularEe + prepared.regularEr + prepared.ecEr + prepared.mpfEe + prepared.mpfEr };
    onSave(prepared);
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal statutory-entry-modal" role="dialog" aria-modal="true">
      <header><h2>{readOnly ? 'View Details' : `${row?.id ? 'Edit' : 'Add'} Statutory Table Entry`}</h2><button className="icon-button" onClick={onClose}><X /></button></header>
      <form onSubmit={submit}>
        <div className="statutory-entry-grid">
          {def.fields.map(([key, label, type, options]) => {
            if (['philhealth', 'pagibig'].includes(agency) && draft.unit === 'Percentage (%)' && /Share/.test(key)) return null;
            if (['philhealth', 'pagibig'].includes(agency) && draft.unit === 'Amount (₱)' && /Rate/.test(key)) return null;
            const computed = agency === 'sss' && ['totalMsc', 'totalRegular', 'totalMpf', 'totalEe', 'totalEr', 'overallTotal'].includes(key);
            return <label key={key}>{label}{!readOnly && !computed && <span className="required">*</span>}
              {readOnly ? <strong>{key === 'unit' ? draft[key] : fieldValue(agency, draft, key)}</strong> : type === 'select' ? <select required value={draft[key] || ''} onChange={event => setDraft({ ...draft, [key]: event.target.value })}><option value="">Please select</option>{(options || ['Percentage (%)', 'Amount (₱)']).map(option => <option key={option}>{option}</option>)}</select> : <input required={!computed} type={type === 'text' ? 'text' : 'number'} step={type === 'text' ? undefined : '0.01'} min={type === 'text' ? undefined : '0'} value={draft[key] ?? ''} disabled={computed} onChange={event => setDraft({ ...draft, [key]: event.target.value })} />}
            </label>;
          })}
        </div>
        <div className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>{!readOnly && <button className="button primary">{row?.id ? 'Save changes' : 'Add entry'}</button>}</div>
      </form>
    </section>
  </div>;
}

function AgencySidebar({ agency, setAgency, mode, onBack, group }) {
  const { title, agencies } = agencyGroups[group];
  return <aside className="statutory-sidebar">
    <button className="back-link" onClick={onBack}><ArrowLeft /> Back to {mode === 'settings' ? 'Settings' : 'Payroll'}</button>
    <h2>{title}</h2>
    <nav>{agencies.map(key => <button key={key} className={agency === key ? 'selected' : ''} onClick={() => setAgency(key)}><Table weight={agency === key ? 'fill' : 'regular'} /> {agencyDefinitions[key].short}</button>)}</nav>
    <div className="statutory-sidebar-note"><CheckCircle weight="duotone" /><span><strong>{mode === 'settings' ? 'Controlled versions' : 'Approved tables'}</strong><small>{mode === 'settings' ? 'Changes are audited per company.' : 'Payroll uses only the active effective version.'}</small></span></div>
  </aside>;
}

export function StatutoryTables({ mode = 'settings', group = 'statutory', onBack, notify }) {
  const [data, setData] = useState(readData);
  const [agency, setAgency] = useState(agencyGroups[group].agencies[0]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [entryEditing, setEntryEditing] = useState(undefined);
  const [viewing, setViewing] = useState(null);
  const importRef = useRef(null);
  const def = agencyDefinitions[agency];
  const groupTitle = agencyGroups[group].title;
  const isTaxGroup = group === 'tax';
  const versions = data[agency] || [];
  const activeVersion = [...versions].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).find(item => item.status === 'Active') || versions[0];
  const selected = mode === 'payroll' ? activeVersion : versions.find(item => item.id === selectedId);
  const [draft, setDraft] = useState(null);
  const { isPaAdmin } = useRole();
  // Tax and statutory tables are P&A-owned; the client side is view/export
  // only. This must be isPaAdmin, not isAdmin — isAdmin also covers the Client
  // Admin, whom the lock note below tells to switch roles to publish a version.
  const canEdit = mode === 'settings' && isPaAdmin;
  const usage = useMemo(() => (selected ? versionUsage(agency, selected, data) : { used: false, transactions: [] }), [agency, selected, data]);
  const locked = usage.used;
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
    const item = { id: `${agency}-${Date.now()}`, code: `${def.prefix}-${new Date().getFullYear()}-${String(number).padStart(3, '0')}`, name: `${def.name} ${new Date().getFullYear()}`, effectiveDate: new Date().toISOString().slice(0, 10), status: 'Draft', createdBy: 'P&A Admin', createdAt: new Date().toLocaleString(), updatedBy: 'P&A Admin', updatedAt: new Date().toLocaleString(), rows: [] };
    setDraft(item); setSelectedId(item.id);
  };
  const saveVersion = () => {
    if (!draft.effectiveDate || !draft.status) { notify({ type: 'error', message: 'Effective date and status are required.' }); return; }
    if (locked) { notify({ type: 'error', message: `${draft.code} has been used by ${usage.transactions.join(', ')}. Create a new version instead of changing a version payroll has already consumed.` }); return; }
    setData(previous => ({ ...previous, [agency]: [
      ...previous[agency].filter(item => item.id !== draft.id).map(item => draft.status === 'Active' && item.status === 'Active' ? { ...item, status: 'Inactive' } : item),
      { ...draft, updatedBy: 'P&A Admin', updatedAt: new Date().toLocaleString() },
    ].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)) }));
    setSelectedId(null); setDraft(null);
    notify({ type: 'success', message: `${draft.code} saved successfully.` });
  };

  /** §7.1: roll a used table forward by publishing a new version, never by editing it. */
  const copyToNewVersion = () => {
    const next = versions.length + 1;
    const item = {
      ...draft,
      id: `${agency}-${Date.now()}`,
      code: `${def.prefix}-${new Date().getFullYear()}-${String(next).padStart(3, '0')}`,
      name: `${def.name} ${new Date().getFullYear()}`,
      status: 'Draft',
      effectiveDate: new Date().toISOString().slice(0, 10),
      createdBy: 'P&A Admin', createdAt: new Date().toLocaleString(),
      updatedBy: 'P&A Admin', updatedAt: new Date().toLocaleString(),
      supersedes: draft.code,
      rows: draft.rows.map(row => ({ ...row })),
    };
    setData(previous => ({ ...previous, [agency]: [item, ...previous[agency]] }));
    setSelectedId(item.id);
    notify({ type: 'success', message: `${item.code} created as a draft copy of ${draft.code}. The used version stays intact.` });
  };
  const saveEntry = entry => {
    const minimum = Number(entry.minimum ?? 0);
    const maximum = Number(entry.maximum ?? 0);
    const graduated = ['sss', 'philhealth', 'pagibig', 'tax', 'annualTax'].includes(agency);
    if (graduated && maximum > 0 && minimum > maximum) {
      notify({ type: 'error', message: 'Minimum compensation cannot exceed the maximum for the same bracket.' }); return;
    }
    if (['expandedTax', 'finalTax'].includes(agency) && !String(entry.atcCode || '').trim()) {
      notify({ type: 'error', message: 'An ATC code is required so the rate can be reported against the right income payment.' }); return;
    }
    if (graduated) {
      const overlap = draft.rows.some(row => row.id !== entry.id && Number(row.maximum || 0) > 0
        && minimum <= Number(row.maximum) && maximum >= Number(row.minimum || 0));
      if (overlap) { notify({ type: 'error', message: 'This bracket overlaps an existing compensation range in the same version.' }); return; }
    }
    if (agency === 'deMinimis' && Number(entry.ceiling || 0) < 0) { notify({ type: 'error', message: 'A De Minimis ceiling cannot be negative.' }); return; }
    const id = entry.id || Math.max(0, ...draft.rows.map(row => Number(row.id) || 0)) + 1;
    setDraft(previous => ({ ...previous, rows: entry.id ? previous.rows.map(row => row.id === entry.id ? { ...entry, id } : row) : [...previous.rows, { ...entry, id }] }));
    setEntryEditing(undefined);
    notify({ type: 'success', message: `${isTaxGroup ? 'Tax' : 'Statutory'} table entry ${entry.id ? 'updated' : 'added'} successfully.` });
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
        def.fields.forEach(([key, label, type]) => {
          const position = headers.findIndex(header => header === key.toLowerCase() || header === label.toLowerCase());
          if (position >= 0) item[key] = ['text', 'select'].includes(type) ? values[position] : Number(values[position] || 0);
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
      {canEdit && !locked && <><button className="button primary" onClick={() => setEntryEditing(null)}><Plus /> Add</button><button className="button secondary" onClick={() => importRef.current?.click()}><UploadSimple /> Import</button><input className="sr-only" ref={importRef} type="file" accept=".csv,text/csv" onChange={importRows} /></>}
      <ExportMenu onExport={format => { exportTable(def, version, format); notify({ type: 'success', message: `${def.short} export prepared.` }); }} />
    </div>
    <div className="table-card statutory-table-card"><table className="statutory-table"><thead><tr>{def.columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Action</th></tr></thead><tbody>
      {visibleRows.length ? visibleRows.map(row => <tr key={row.id}>{def.columns.map(([key]) => <td key={key}>{fieldValue(agency, row, key)}</td>)}<td><div className="row-actions always"><button onClick={() => setViewing(row)} aria-label="View"><Eye /></button>{canEdit && !locked && <button onClick={() => setEntryEditing(row)} aria-label="Edit"><PencilSimple /></button>}</div></td></tr>) : <tr><td colSpan={def.columns.length + 1}><div className="empty-state compact"><h3>No entries found</h3><p>Add an entry or import the approved table.</p></div></td></tr>}
    </tbody></table></div>
    <div className="pagination"><span>Displaying <strong>{visibleRows.length}</strong> of {version.rows.length} items</span><div><button disabled>«</button><strong>1</strong><span>of 1</span><button disabled>»</button></div></div>
  </>;

  return <div className="statutory-workspace">
    <AgencySidebar agency={agency} setAgency={setAgency} mode={mode} onBack={onBack} group={group} />
    <main className="statutory-main">
      {!tableVersion && mode === 'settings' ? <>
        <div className="page-heading"><div><p className="breadcrumb">Settings / {groupTitle}</p><h1>{def.name}</h1><p className="page-description">Maintain current and historical {isTaxGroup ? 'tax' : 'statutory'} table versions for ABC Company Ltd.</p></div></div>
        <div className="statutory-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search code or effective date..." /><MagnifyingGlass /></div><div className="toolbar-spacer" />{isPaAdmin && <button className="button primary" onClick={addVersion}><Plus /> Add</button>}<ExportMenu onExport={format => exportTable(def, versions[0], format)} /></div>
        <div className="table-card statutory-version-card"><table><thead><tr><th>Code</th><th>{isTaxGroup ? 'Tax Table Name' : 'Table Name'}</th><th>Effective Date</th><th>Status</th><th>Created By</th><th>Timestamp Created</th><th>Usage</th><th>Action</th></tr></thead><tbody>{versions.filter(item => `${item.code} ${item.name || ''} ${item.effectiveDate}`.toLowerCase().includes(query.toLowerCase())).map(item => { const itemUsage = versionUsage(agency, item, data); return <tr key={item.id}><td><button className="table-link" onClick={() => setSelectedId(item.id)}>{item.code}</button>{item.supersedes && <small>supersedes {item.supersedes}</small>}</td><td>{item.name || def.name}</td><td>{item.effectiveDate}</td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></td><td>{item.createdBy || item.updatedBy}</td><td>{item.createdAt || item.updatedAt}</td><td>{itemUsage.used ? <span className="status-pill locked"><LockKey weight="fill" /> Used by payroll</span> : <span className="status-pill draft">Not yet used</span>}</td><td><div className="row-actions always"><button onClick={() => setSelectedId(item.id)} aria-label={itemUsage.used ? 'View version' : 'Edit version'}>{itemUsage.used ? <Eye /> : <PencilSimple />}</button></div></td></tr>; })}</tbody></table></div>
      </> : tableVersion ? <>
        {mode === 'settings' && <button className="inline-back" onClick={() => { setSelectedId(null); setDraft(null); }}><ArrowLeft /> {def.short} versions</button>}
        <div className="page-heading"><div><p className="breadcrumb">{mode === 'settings' ? 'Settings' : 'Payroll'} / {groupTitle} / {def.short}</p><h1>{def.name}</h1><p className="page-description">{mode === 'settings' ? `Add or revise ${isTaxGroup ? 'tax brackets and rates' : 'contribution brackets'} before activating this version.` : 'View the active table used by the current payroll computation.'}</p></div>{mode === 'payroll' && <span className="controlled-badge"><CheckCircle weight="fill" /> Active approved version</span>}</div>
        <section className="statutory-version-meta">
          {mode === 'settings' ? <><label>Code<input value={draft.code} disabled /></label><label>Table Name<input value={draft.name || def.name} onChange={event => setDraft({ ...draft, name: event.target.value })} disabled={!canEdit || locked} /></label><label>Effective Date<input type="date" value={draft.effectiveDate} onChange={event => setDraft({ ...draft, effectiveDate: event.target.value })} disabled={!canEdit || locked} /></label><label>Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })} disabled={!canEdit || locked}><option>Draft</option><option>Active</option><option>Inactive</option></select></label></> : <><span><small>Effective</small><strong>{activeVersion.effectiveDate}</strong></span><span><small>Version</small><strong>{activeVersion.code}</strong></span><span><small>Status</small><strong>Active</strong></span></>}
        </section>
        <section className="statutory-table-section"><div className="workspace-copy"><h2>{def.name}</h2><p>{mode === 'settings' ? (isTaxGroup ? 'Tax brackets, rates and fixed amounts.' : 'Contribution brackets and employee/employer shares.') : 'Approved brackets are read-only in Payroll.'}</p></div>{renderTable(tableVersion)}</section>
        {mode === 'settings' && (locked
          ? <div className="statutory-lock-note"><LockKey weight="fill" /><div><strong>{draft.code} is already used by payroll.</strong><span>Used by {usage.transactions.join(', ')}. Publish a new version to change these values &mdash; a version payroll has consumed stays intact so historical runs stay reproducible.</span></div>{canEdit && <button className="button primary" onClick={copyToNewVersion}><Plus /> Create new version</button>}</div>
          : !canEdit
            ? <div className="statutory-lock-note"><LockKey weight="fill" /><div><strong>{groupTitle} are maintained by P&amp;A.</strong><span>Client administrators have view and export access. Switch to the P&amp;A Admin role to publish a version.</span></div></div>
            : <div className="statutory-save-row"><button className="button secondary" onClick={() => { setSelectedId(null); setDraft(null); }}>Cancel</button><button className="button primary" onClick={saveVersion}>Save table</button></div>)}
      </> : null}
    </main>
    {entryEditing !== undefined && <EntryModal agency={agency} row={entryEditing} onClose={() => setEntryEditing(undefined)} onSave={saveEntry} />}
    {viewing && <EntryModal agency={agency} row={viewing} onClose={() => setViewing(null)} onSave={() => {}} readOnly />}
  </div>;
}
