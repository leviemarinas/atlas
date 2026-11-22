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
  Funnel,
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
  ChartLine,
  Envelope,
  Hash,
  MinusCircle,
  Money,
  PaperPlaneTilt,
  PlusCircle,
  Scales,
  UploadSimple,
  Trash,
  ClockCounterClockwise,
  Database,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { STATUTORY_STORAGE_KEY } from './statutoryService';
import { agencyDefinitions, agencyGroups, ecFor, effectiveVersionIn, PAYMENT_MODES, seedStatutoryData as seedData, UNIT_AMOUNT, UNIT_PERCENTAGE } from './statutorySchedules';
import { formatUsDate } from './textFormat.js';
import { useRole } from './RoleContext';
import { visibleTiles } from './moduleAccess';
import { PayrollDashboard } from './PayrollDashboard.jsx';
import { rejectUpload } from './uploadErrorLog.js';
import { DateInput } from './DateInput.jsx';
import { referenceRows } from './ReferenceTables.jsx';

const STORAGE_KEY = STATUTORY_STORAGE_KEY;

/**
 * The tables themselves live in `statutorySchedules.js` so the payroll engine
 * computes a contribution from the very rows this register publishes. They are
 * re-exported here because this module is the register's screen.
 */
export { agencyDefinitions, agencyGroups };

/**
 * Tables aligned to the real Atlas on 23 Nov 2026 (see "Mockup Backups/2026-11-23 Statutory Alignment").
 * De Minimis (the ceiling setup) and the Annual Tax table keep the mockup's own behaviour.
 */
const ALIGNED = new Set(['sss', 'philhealth', 'pagibig', 'tax', 'expandedTax', 'finalTax']);
const RATE_OR_AMOUNT = new Set(['philhealth', 'pagibig']);
const WITHHOLDING = new Set(['expandedTax', 'finalTax']);
const LEGACY_TOP = 9999999;

const php = value => `₱ ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Atlas prints amounts as N2 (1,234.00), rates as 0.####%, a blank as "-" and an open top bracket as "and above". */
const money = value => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rate = value => (value === null || value === undefined || value === '' ? '-' : `${Number(Number(value).toFixed(4))}%`);
const isBlank = value => value === null || value === undefined || value === '';
const isOpenTop = value => isBlank(value) || Number(value) >= LEGACY_TOP;
const fieldType = (agency, key) => (agencyDefinitions[agency]?.fields || []).find(([fieldKey]) => fieldKey === key)?.[2] || 'number';
const isPercentage = row => row.unit === UNIT_PERCENTAGE;
const modeKey = value => { const key = String(value || '').toLowerCase().replace(/[^a-z]/g, ''); return key === 'annual' ? 'yearly' : key; };
const todayIso = () => new Date().toISOString().slice(0, 10);
const longDate = value => {
  if (!value) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};
const longDateTime = value => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? `${longDate(value)} ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : (value || '');
};
/** The day a version was last updated, as ISO, from the new field or from the older display text. */
const updatedIso = item => {
  if (item.updatedOn) return item.updatedOn;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(item.updatedAt || ''));
  return match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : '';
};
const createdIso = item => {
  if (item.createdOn) return item.createdOn;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(item.createdAt || ''));
  return match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : '';
};
/** Codes count up for the year of the Effectivity Date; a deleted table keeps its code, so its number is never reused. */
const nextCode = (def, versions, effectiveDate) => {
  const year = String(effectiveDate || todayIso()).slice(0, 4);
  const prefix = `${def.prefix}-${year}-`;
  const highest = Math.max(0, ...versions.filter(item => String(item.code || '').startsWith(prefix)).map(item => Number(String(item.code).slice(prefix.length)) || 0));
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
};
const historyEntry = (action, detail) => ({ at: new Date().toISOString(), by: 'P&A Admin', action, detail });

/** A share column of an Amount bracket: the single share, or a range kept by a bracket saved before the 23 Nov alignment. */
const shareText = (row, side) => {
  const single = row[`${side}Share`];
  if (!isBlank(single)) return money(single);
  const low = row[`minimum${side === 'employee' ? 'Employee' : 'Employer'}Share`];
  const high = row[`maximum${side === 'employee' ? 'Employee' : 'Employer'}Share`];
  if (isBlank(low) && isBlank(high)) return '-';
  return Number(low) === Number(high) ? money(low) : `${money(low)} – ${money(high)}`;
};

const fieldValue = (agency, row, key) => {
  if (!ALIGNED.has(agency)) return legacyFieldValue(agency, row, key);
  if (key === 'maximum') return isOpenTop(row.maximum) ? 'and above' : money(row.maximum);
  if (RATE_OR_AMOUNT.has(agency)) {
    if (key === 'unit') return row.unit || '-';
    if (key === 'employeeShare' || key === 'employerShare') return isPercentage(row) ? '-' : shareText(row, key === 'employeeShare' ? 'employee' : 'employer');
    if (key === 'eeRate' || key === 'erRate') return isPercentage(row) ? rate(row[key]) : '-';
  }
  if (key === 'excessRate') return rate(row[key]);
  if (['text', 'select', 'locked', 'reference'].includes(fieldType(agency, key))) return row[key] || '-';
  return isBlank(row[key]) ? '-' : money(row[key]);
};

/** The De Minimis ceiling setup and the Annual Tax table, as the mockup had them. */
function legacyFieldValue(agency, row, key) {
  if (/Rate/i.test(key) && !['text', 'select', 'locked'].includes(fieldType(agency, key))) return `${Number(row[key] || 0).toFixed(2)}%`;
  if (['text', 'select', 'locked'].includes(fieldType(agency, key))) return row[key] || '—';
  return php(row[key]);
}

/** Brings a bracket saved before the alignment into the Atlas shape, so old browsers keep their edits. */
function migrateRow(agency, row) {
  const next = { ...row };
  if (['sss', 'philhealth', 'pagibig', 'tax'].includes(agency) && !isBlank(next.maximum) && Number(next.maximum) >= LEGACY_TOP) next.maximum = null;
  if (RATE_OR_AMOUNT.has(agency)) {
    if (/^Amount/.test(String(next.unit || ''))) next.unit = UNIT_AMOUNT;
    if (next.unit === UNIT_AMOUNT && isBlank(next.employeeShare) && !isBlank(next.minimumEmployeeShare)) {
      next.employeeShare = Number(next.minimumEmployeeShare);
      next.employerShare = Number(next.minimumEmployerShare || 0);
    }
    if (next.unit === UNIT_AMOUNT) { delete next.eeRate; delete next.erRate; } else { delete next.employeeShare; delete next.employerShare; }
    ['minimumEmployeeShare', 'maximumEmployeeShare', 'minimumEmployerShare', 'maximumEmployerShare'].forEach(field => { delete next[field]; });
  }
  if (agency === 'tax' && next.frequency) next.frequency = PAYMENT_MODES.find(mode => modeKey(mode) === modeKey(next.frequency)) || next.frequency;
  if (WITHHOLDING.has(agency)) {
    if (next.atcClass === 'Individual') next.atcClass = 'IND';
    if (next.atcClass === 'Corporation') next.atcClass = 'CORP';
    delete next.minimum; delete next.maximum;
    if (agency === 'expandedTax') delete next.fixedTax;
  }
  return next;
}

function readData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return seedData();
    Object.entries(saved).forEach(([agency, versions]) => Array.isArray(versions) && versions.forEach(version => { version.rows = (version.rows || []).map(row => migrateRow(agency, row)); }));
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

function exportTable(def, version, format, columns = def.fields) {
  const rows = version.rows.map(row => Object.fromEntries(columns.map(([key]) => [key, row[key] ?? ''])));
  const csv = toCsv(rows, columns.map(([key, label]) => [key, label]));
  if (format === 'csv' || format === 'excel') download(`${version.code}.${format === 'excel' ? 'xls' : 'csv'}`, format === 'excel' ? `<html><body><pre>${csv}</pre></body></html>` : csv, format === 'excel' ? 'application/vnd.ms-excel' : 'text/csv');
  if (format === 'docx') download(`${version.code}.doc`, `<html><body><h1>${def.name}</h1><pre>${csv}</pre></body></html>`, 'application/msword');
  if (format === 'pdf') {
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) return false;
    popup.document.write(`<html><head><title>${version.code}</title><style>body{font-family:Arial;padding:24px}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #bbb;padding:7px;text-align:left}</style></head><body><h1>${def.name}</h1><p>Effective ${version.effectiveDate}</p><table><thead><tr>${columns.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(([key]) => `<td>${row[key]}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }
  return true;
}

function downloadTemplate(def, version) {
  const headers = def.fields.filter(([, , type]) => type !== 'locked').map(([, label]) => label);
  download(`${(version?.code || def.prefix)}-template.csv`, `${headers.map(label => `"${label}"`).join(',')}\n${headers.map(() => '""').join(',')}`, 'text/csv');
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
    // Atlas Core (QA) Settings tiles, in QA's order.
    { icon: Buildings, label: 'Company Onboarding', detail: 'Companies, their services and modules, and assigned users', handler: () => onOpenWorkspace('companyManagement') },
    { icon: ArrowLeft, label: 'Company Offboarding', detail: 'Termination date and offboarding documents per company', handler: () => onOpenWorkspace('companyOffboarding') },
    { icon: Table, label: 'Reference Table', detail: 'Generic, client-specific and other reference values', handler: onOpenReference || onOpen },
    { icon: Scales, label: 'Statutory Tables', detail: 'SSS, PhilHealth, Pag-IBIG and De Minimis versions', handler: onOpen },
    { icon: Table, label: 'Tax Tables', detail: 'BIR annual, compensation, expanded and final tax versions', handler: onOpenTax },
    { icon: BookOpen, label: 'FAQs', detail: 'FAQ categories and questions the chatbot answers from', handler: () => onOpenWorkspace('faqManagement') },
    { icon: Ticket, label: 'Ticketing Configuration', detail: 'Help topics, assigned e-mails and severity', handler: () => onOpenWorkspace('ticketingConfig') },
    { icon: Timer, label: 'Overtime Configuration', detail: 'Standard overtime codes and rates', handler: () => onOpenWorkspace('overtimeConfig') },
    { icon: Database, label: 'Company Databases', detail: 'Database per Atlas system for each company', handler: () => onOpenWorkspace('companyDatabases') },
    { icon: Compass, label: 'Navigation Configuration', detail: 'Welcome guides shown the first time a feature opens', handler: () => onOpenWorkspace('navigationConfig') },
    // Mockup additions beyond Atlas Core.
    { icon: Function, label: 'Standard Computation Library', detail: 'Controlled payroll formulas and test calculations', handler: onOpenComputationLibrary },
    { icon: Money, label: 'MWE Management', detail: 'Regional minimum wage rates, sectors and wage orders', handler: () => onOpenWorkspace('mweRates') },
    { icon: FileText, label: 'Paycode Management', detail: 'Payroll code library, classifications and GL mapping', handler: () => onOpenWorkspace('payCodes') },
    { icon: Table, label: 'Calendar Settings', detail: 'Payout, locking, statutory and billing deadlines', handler: () => onOpenWorkspace('calendar') },
    { icon: CheckCircle, label: 'Access & Approvals', detail: 'Role-based access and multi-level approvals', handler: () => onOpenWorkspace('accessRights') },
    { icon: Eye, label: 'Audit Log', detail: 'Chronological access and configuration events', handler: () => onOpenWorkspace('auditLog') },
  ];
  return <div className="platform-hub page-content">
    <section className="hero-card"><p className="eyebrow">System administration</p><h1>Settings</h1><p>Manage platform setup and controlled statutory configuration.</p></section>
    <section className="platform-grid">{visibleTiles(role, cards).map(card => <HubCard key={card.label} icon={card.icon} label={card.label} detail={card.detail} enabled onClick={card.handler} />)}</section>
  </div>;
}

export function PayrollHub({ onOpen, onOpenTax, onOpenPolicyManagement, onOpenWorkspace }) {
  const { role } = useRole();
  const cards = [
    { icon: Money, label: 'Earning Management', detail: 'Assign recurring and one-time earnings per employee', handler: () => onOpenWorkspace('earnings') },
    { icon: MinusCircle, label: 'Deduction Management', detail: 'Track employee deductions, schedules and balances', handler: () => onOpenWorkspace('deductions') },
    { icon: PlusCircle, label: 'Bonus Management', detail: 'Schedule and process 13th month, performance and retention bonuses', handler: () => onOpenWorkspace('bonuses') },
    { icon: Hash, label: 'Paycode Management', detail: 'Payroll code library, classifications and GL mapping', handler: () => onOpenWorkspace('payCodes') },
    { icon: Receipt, label: 'Fringe Benefits (FBT)', detail: 'Benefits to managerial staff, the 35% FBT and the quarterly 1603Q', handler: () => onOpenWorkspace('fringeBenefits') },
    { icon: PlusCircle, label: 'SSS Maternity and Sickness', detail: 'Benefit estimates from approved leave and the employer salary differential', handler: () => onOpenWorkspace('sssBenefits') },
    { icon: PaperPlaneTilt, label: 'Remittance Monitoring', detail: 'Track government filings and receipts against posted payouts', handler: () => onOpenWorkspace('remittance') },
    { icon: Receipt, label: 'Payroll Processing', detail: 'Create, recalculate, approve, post and lock payroll', handler: () => onOpenWorkspace('transactions') },
    { icon: Scales, label: 'Policy Management', detail: 'Manage effective-dated policies, versions, applicability and payroll usage locks', handler: onOpenPolicyManagement },
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
    <PayrollDashboard onOpenWorkspace={onOpenWorkspace} />
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

/** Atlas's "Discard changes?" dialog (Cancel / Discard). */
function DiscardDialog({ message, onCancel, onDiscard }) {
  return <div className="modal-backdrop"><section className="modal delete-modal" role="alertdialog" aria-modal="true" aria-label="Discard changes"><header><h2>Discard changes?</h2><button className="icon-button" onClick={onCancel} aria-label="Close"><X /></button></header><div className="modal-body"><div className="delete-copy"><div><p>{message}</p></div></div><div className="modal-actions"><button className="button secondary" onClick={onCancel}>Cancel</button><button className="button danger" onClick={onDiscard}>Discard</button></div></div></section></div>;
}

/** The options of a field picked from a reference table, as [value, label]. */
function referenceOptions(table, column = 'name') {
  try {
    const rows = referenceRows(table);
    if (table === 'tax-rate') return rows.map(row => [String(parseFloat(row.name)), row.name]).filter(([value]) => value !== 'NaN');
    return rows.map(row => [row[column], row[column]]).filter(([value]) => value);
  } catch { return []; }
}

/** The fields an entry shows: for PhilHealth and Pag-IBIG, only the rates or only the shares, by Unit. */
function entryFields(agency, draft) {
  const def = agencyDefinitions[agency];
  return def.fields.filter(([key]) => {
    if (!RATE_OR_AMOUNT.has(agency)) return true;
    if (key === 'eeRate' || key === 'erRate') return isPercentage(draft);
    if (key === 'employeeShare' || key === 'employerShare') return !isPercentage(draft);
    return true;
  });
}

function AlignedEntryModal({ agency, row, isTaxGroup, onClose, onSave, readOnly = false }) {
  const def = agencyDefinitions[agency];
  const initial = { ...(RATE_OR_AMOUNT.has(agency) ? { unit: UNIT_PERCENTAGE } : {}), ...(WITHHOLDING.has(agency) ? { taxType: def.taxType, atcClass: 'IND' } : {}), ...row };
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const noun = isTaxGroup ? 'Tax Table Entry' : 'Statutory Table Entry';
  const title = readOnly ? `View ${noun}` : `${row?.id ? 'Edit' : 'Add'} ${noun}`;
  const set = (key, value) => { const next = { ...draft, [key]: value }; setDraft(next); if (error) setError(''); };
  const submit = event => {
    event.preventDefault();
    const problem = onSave(draft);
    if (problem) setError(problem);
  };
  const close = () => (readOnly ? onClose() : setConfirmDiscard(true));
  const fields = entryFields(agency, draft);
  return <>
    <div className="modal-backdrop" role="presentation">
      <section className="modal statutory-entry-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Close"><X /></button></header>
        <form onSubmit={submit} noValidate>
          <div className="statutory-entry-grid">
            {fields.map(([key, label, type, extra, column]) => {
              const optional = type === 'optional';
              if (readOnly) return <label key={key}>{label}<strong>{fieldValue(agency, draft, key)}</strong></label>;
              let control;
              if (type === 'locked') control = <input value={def.taxType || ''} disabled />;
              else if (type === 'select') control = <select value={draft[key] ?? ''} onChange={event => set(key, event.target.value)}>{!(key === 'unit' || key === 'atcClass') && <option value="">Please select</option>}{(extra || []).map(option => <option key={option}>{option}</option>)}</select>;
              else if (type === 'reference') control = <select value={isBlank(draft[key]) ? '' : String(draft[key])} onChange={event => set(key, key === 'excessRate' && event.target.value !== '' ? Number(event.target.value) : event.target.value)}><option value="">Please select</option>{referenceOptions(extra, column).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>;
              else control = <input type="number" step="any" placeholder={/Rate/.test(key) || key === 'excessRate' ? '0.00' : '₱ 0.00'} value={draft[key] ?? ''} onChange={event => set(key, event.target.value === '' ? '' : event.target.value)} />;
              return <label key={key}>{label}{!optional && <span className="required">*</span>}{control}{key === 'maximum' && <small className="field-hint">Leave blank for the open-ended top bracket ("and above").</small>}</label>;
            })}
          </div>
          {error && <p className="form-error"><WarningCircle weight="fill" />{error}</p>}
          <div className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={close}>{readOnly ? 'Close' : 'Cancel'}</button>{!readOnly && <button className="button primary">{row?.id ? 'Save' : 'Add'}</button>}</div>
        </form>
      </section>
    </div>
    {confirmDiscard && <DiscardDialog message="This entry has not been added yet." onCancel={() => setConfirmDiscard(false)} onDiscard={onClose} />}
  </>;
}

/** The De Minimis ceiling setup and Annual Tax entry form, unchanged from the mockup. */
function EntryModal({ agency, row, onClose, onSave, readOnly = false }) {
  const def = agencyDefinitions[agency];
  const [draft, setDraft] = useState({ ...(def.taxType ? { taxType: def.taxType } : {}), ...row });
  const submit = event => {
    event.preventDefault();
    const numeric = Object.fromEntries(def.fields.filter(([, , type]) => !['text', 'select', 'locked'].includes(type)).map(([key]) => [key, Number(draft[key] || 0)]));
    onSave({ ...draft, ...numeric });
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal statutory-entry-modal" role="dialog" aria-modal="true">
      <header><h2>{readOnly ? 'View Details' : `${row?.id ? 'Edit' : 'Add'} Statutory Table Entry`}</h2><button className="icon-button" onClick={onClose}><X /></button></header>
      <form onSubmit={submit}>
        <div className="statutory-entry-grid">
          {def.fields.map(([key, label, type, options]) => <label key={key}>{label}{!readOnly && <span className="required">*</span>}
            {readOnly ? <strong>{fieldValue(agency, draft, key)}</strong> : type === 'locked' ? <input value={def.taxType || ''} disabled /> : type === 'select' ? <select required value={draft[key] || ''} onChange={event => setDraft({ ...draft, [key]: event.target.value })}><option value="">Please select</option>{(options || []).map(option => <option key={option}>{option}</option>)}</select> : <input required type={type === 'text' ? 'text' : 'number'} step={type === 'text' ? undefined : '0.01'} min={type === 'text' ? undefined : '0'} value={draft[key] ?? ''} onChange={event => setDraft({ ...draft, [key]: event.target.value })} />}
          </label>)}
        </div>
        {def.note && <p className="statutory-entry-note">{def.note}</p>}
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

function VersionView({ version, def, onClose }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal statutory-entry-modal" role="dialog" aria-modal="true" aria-label="View details"><header><h2>View Details</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
    <div className="statutory-entry-grid">{[['Code', version.code], ['Table', version.name || def.name], ['Effective Date', formatUsDate(version.effectiveDate)], ['Status', version.status], ['Last Updated By', version.updatedBy || version.createdBy], ['Last Updated Date', version.updatedAt || version.createdAt], ['Rows', String(version.rows?.length || 0)]].map(([label, value]) => <label key={label}>{label}<strong>{value}</strong></label>)}</div>
    <div className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>Close</button></div></section></div>;
}

function AuditTrail({ versions, def, onClose }) {
  const entries = versions.flatMap(version => (version.history || []).map(entry => ({ ...entry, code: version.code }))).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal employee-history-modal" role="dialog" aria-modal="true" aria-label={`${def.short} audit trail`}><header><h2>{def.short} — audit trail</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
    <div className="modal-body">{entries.length ? <table className="employee-table"><thead><tr><th>When</th><th>By</th><th>Action</th><th>Table</th><th>Detail</th></tr></thead><tbody>{entries.map((entry, index) => <tr key={index}><td>{new Date(entry.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td><td>{entry.by}</td><td>{entry.action}</td><td>{entry.code}</td><td>{entry.detail}</td></tr>)}</tbody></table> : <div className="empty-state compact"><h3>Nothing recorded yet</h3><p>Created, updated, status changes and deletions of these tables are listed here.</p></div>}</div></section></div>;
}

const EMPTY_VERSION_FILTER = { code: '', name: '', createdBy: '', created: '', effective: '', updatedBy: '', updated: '', status: '' };

/** Atlas's "Filter Table" pop-up of a version list. */
function VersionFilterModal({ value, isTaxGroup, onApply, onClose }) {
  const [draft, setDraft] = useState(value);
  const text = (key, label) => <label key={key}>{label}<input value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>;
  const date = (key, label) => <label key={key}>{label}<DateInput value={draft[key]} onChange={next => setDraft({ ...draft, [key]: next })} /></label>;
  return <div className="modal-backdrop" role="presentation"><section className="modal statutory-entry-modal" role="dialog" aria-modal="true" aria-label="Filter Table"><header><h2>Filter Table</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
    <div className="statutory-entry-grid">
      {text('code', 'Code')}
      {isTaxGroup && text('name', 'Tax Table Name')}
      {isTaxGroup && text('createdBy', 'Created By')}
      {isTaxGroup && date('created', 'Date Created')}
      {date('effective', 'Effective Date')}
      {text('updatedBy', 'Last Updated By')}
      {date('updated', 'Last Updated Date')}
      <label>Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="">All</option><option>Active</option><option>Inactive</option></select></label>
    </div>
    <div className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={() => onApply(EMPTY_VERSION_FILTER)}>Reset</button><button type="button" className="button primary" onClick={() => onApply(draft)}>Apply Filter</button></div>
  </section></div>;
}

/** Validates one entry the way Atlas does and returns the first problem, or ''. */
function entryProblem(agency, entry, rows) {
  const has = key => !isBlank(entry[key]);
  const num = key => Number(entry[key]);
  if (agency === 'sss' || RATE_OR_AMOUNT.has(agency)) {
    if (!has('minimum')) return 'Minimum Monthly Compensation is required.';
    if (num('minimum') < 0) return 'Minimum Monthly Compensation cannot be negative.';
    if (has('maximum') && num('maximum') < 0) return 'Maximum Monthly Compensation cannot be negative.';
    if (has('maximum') && num('minimum') > num('maximum')) return 'Minimum Monthly Compensation cannot be higher than Maximum Monthly Compensation.';
  }
  if (agency === 'sss') {
    for (const [key, label] of [['mscRegular', 'MSC - Regular SS/EC'], ['mscMpf', 'MSC - MPF']]) if (!has(key)) return `${label} is required.`;
    if (num('mscRegular') < 0 || num('mscMpf') < 0) return 'Monthly Salary Credit values cannot be negative.';
    for (const [key, label] of [['regularEe', 'Regular SS - EE'], ['regularEr', 'Regular SS - ER'], ['mpfEe', 'MPF - EE'], ['mpfEr', 'MPF - ER']]) {
      if (!has(key)) return `${label} is required.`;
      if (num(key) < 0) return `${label} cannot be negative.`;
    }
  }
  if (RATE_OR_AMOUNT.has(agency)) {
    if (!entry.unit) return 'Unit is required.';
    if (isPercentage(entry)) {
      if (!has('eeRate')) return 'EE Premium Rate is required.';
      if (!has('erRate')) return 'ER Premium Rate is required.';
      if (num('eeRate') < 0 || num('erRate') < 0) return 'Premium rates cannot be negative.';
      if (num('eeRate') > 100) return 'EE Premium Rate cannot exceed 100.';
      if (num('erRate') > 100) return 'ER Premium Rate cannot exceed 100.';
    } else {
      if (!has('employeeShare')) return 'Employee Share amount is required.';
      if (!has('employerShare')) return 'Employer Share amount is required.';
      if (num('employeeShare') < 0 || num('employerShare') < 0) return 'Share amounts cannot be negative.';
    }
  }
  if (agency === 'tax') {
    if (!entry.frequency) return 'Payment Mode is required.';
    if (!has('minimum')) return 'Minimum Compensation is required.';
    if (num('minimum') < 0) return 'Minimum Compensation cannot be negative.';
    if (has('maximum') && num('maximum') < 0) return 'Maximum Compensation cannot be negative.';
    if (has('maximum') && num('minimum') > num('maximum')) return 'Minimum Compensation cannot be higher than Maximum Compensation.';
    if (!has('excessRate')) return 'Tax Rate is required.';
    if (num('excessRate') < 0) return 'Tax Rate cannot be negative.';
    if (num('excessRate') > 100) return 'Tax Rate cannot exceed 100.';
    if (!has('fixedTax')) return 'Fixed Tax is required.';
    if (num('fixedTax') < 0) return 'Fixed Tax cannot be negative.';
  }
  if (WITHHOLDING.has(agency)) {
    if (!entry.incomePayment) return 'Nature of Income Payment is required.';
    if (!entry.atcClass) return 'ATC Code Classification is required.';
    if (!entry.atcCode) return 'ATC Code is required.';
    if (!has('excessRate')) return 'Tax Rate is required.';
    if (agency === 'finalTax') {
      if (!has('fixedTax')) return 'Fixed Tax is required.';
      if (num('fixedTax') < 0) return 'Fixed Tax cannot be negative.';
    }
    return '';
  }
  // Ranges are inclusive on both ends; a blank maximum is open-ended. Compensation tax compares within one payment mode.
  const low = num('minimum');
  const high = has('maximum') ? num('maximum') : Infinity;
  const overlap = rows.some(other => other.id !== entry.id
    && (agency !== 'tax' || modeKey(other.frequency) === modeKey(entry.frequency))
    && low <= (isOpenTop(other.maximum) ? Infinity : Number(other.maximum)) && Number(other.minimum || 0) <= high);
  if (overlap) return 'This compensation range overlaps an existing entry. Ranges are inclusive on both ends, so each salary must fall in exactly one bracket.';
  return '';
}

/** The entry as it is stored: numbers as numbers, a blank maximum as null, and only the Unit's own fields. */
function cleanEntry(agency, entry) {
  const def = agencyDefinitions[agency];
  const next = { ...entry };
  def.fields.forEach(([key, , type]) => {
    if (['select', 'locked'].includes(type) || (type === 'reference' && key !== 'excessRate')) return;
    next[key] = isBlank(next[key]) ? (key === 'maximum' ? null : next[key]) : Number(next[key]);
  });
  if (RATE_OR_AMOUNT.has(agency)) {
    if (isPercentage(next)) { delete next.employeeShare; delete next.employerShare; } else { delete next.eeRate; delete next.erRate; }
  }
  if (agency === 'sss') {
    // Atlas has no EC field; the mockup keeps EC (and the totals) so payroll still charges it.
    const ecEr = ecFor(next.mscRegular);
    Object.assign(next, { ecEr, totalMsc: next.mscRegular + next.mscMpf, totalRegular: next.regularEe + next.regularEr + ecEr, totalMpf: next.mpfEe + next.mpfEr, totalEe: next.regularEe + next.mpfEe, totalEr: next.regularEr + ecEr + next.mpfEr, overallTotal: next.regularEe + next.regularEr + ecEr + next.mpfEe + next.mpfEr });
  }
  if (WITHHOLDING.has(agency)) next.taxType = def.taxType;
  return next;
}

export function StatutoryTables({ mode = 'settings', group = 'statutory', onBack, notify }) {
  const [data, setData] = useState(readData);
  const [agency, setAgency] = useState(agencyGroups[group].agencies[0]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [entryEditing, setEntryEditing] = useState(undefined);
  const [filters, setFilters] = useState({ status: '', effective: '', updated: '' });
  const [versionFilter, setVersionFilter] = useState(EMPTY_VERSION_FILTER);
  const [versionFilterOpen, setVersionFilterOpen] = useState(false);
  const [columnFilter, setColumnFilter] = useState({ key: '', value: '' });
  const [unitFilter, setUnitFilter] = useState('');
  const [auditOpen, setAuditOpen] = useState(false);
  const [versionViewing, setVersionViewing] = useState(null);
  const [versionDeleting, setVersionDeleting] = useState(null);
  const [entryDeleting, setEntryDeleting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [discardVersion, setDiscardVersion] = useState(false);
  const importRef = useRef(null);
  const def = agencyDefinitions[agency];
  const aligned = ALIGNED.has(agency);
  const groupTitle = agencyGroups[group].title;
  const isTaxGroup = group === 'tax';
  const allVersions = data[agency] || [];
  // A deleted table stays in the store (its code is never reused) but is not listed.
  const versions = allVersions.filter(item => item.status !== 'Deleted');
  // Payroll > Statutory tables shows only the table in force today by its effectivity date, never a future-dated one.
  const activeVersion = effectiveVersionIn({ [agency]: versions }, agency, todayIso());
  const selected = mode === 'payroll' ? activeVersion : versions.find(item => item.id === selectedId);
  const [draft, setDraft] = useState(null);
  const { isPaAdmin } = useRole();
  const contains = (value, wanted) => !wanted || String(value || '').toLowerCase().includes(wanted.trim().toLowerCase());
  const shownVersions = versions
    .filter(item => `${item.code} ${item.name || ''} ${item.effectiveDate} ${formatUsDate(item.effectiveDate)} ${longDate(item.effectiveDate)}`.toLowerCase().includes(query.toLowerCase()))
    .filter(item => (aligned
      ? contains(item.code, versionFilter.code) && contains(item.name || def.name, versionFilter.name) && contains(item.createdBy, versionFilter.createdBy) && contains(item.updatedBy || item.createdBy, versionFilter.updatedBy)
        && (!versionFilter.created || createdIso(item) === versionFilter.created) && (!versionFilter.effective || item.effectiveDate === versionFilter.effective)
        && (!versionFilter.updated || updatedIso(item) === versionFilter.updated) && (!versionFilter.status || item.status === versionFilter.status)
      : (!filters.status || item.status === filters.status) && (!filters.effective || item.effectiveDate === filters.effective) && (!filters.updated || updatedIso(item) === filters.updated)));
  const versionFilterActive = Object.values(versionFilter).some(Boolean);
  // Tax and statutory tables are P&A-owned; the client side is view/export
  // only. This must be isPaAdmin, not isAdmin — isAdmin also covers the Client
  // Admin, whom the lock note below tells to switch roles to publish a version.
  const canEdit = mode === 'settings' && isPaAdmin && !viewOnly;
  // As in Atlas, a saved version keeps its entries: only its Effective Date and Status change. Entries are written
  // with a new version, and nothing about a payroll transaction blocks a change.
  const isNewVersion = !!draft && !allVersions.some(item => item.id === draft.id);
  const locked = !isNewVersion;
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(data)), [data]);
  useEffect(() => { setSelectedId(null); setViewOnly(false); setDraft(null); setQuery(''); setFilters({ status: '', effective: '', updated: '' }); setVersionFilter(EMPTY_VERSION_FILTER); setColumnFilter({ key: '', value: '' }); setUnitFilter(''); }, [agency, mode]);
  useEffect(() => {
    if (mode === 'settings' && selectedId && !selected) return;
    setDraft(selected ? { ...selected, rows: selected.rows.map(row => ({ ...row })) } : null);
  }, [selectedId, agency, mode, selected]);
  const tableVersion = mode === 'payroll' ? activeVersion : draft;
  // PhilHealth and Pag-IBIG show the shares, the rates or both, by the Unit filter, as Atlas does.
  const tableColumns = def.columns
    .filter(([key]) => {
      if (!RATE_OR_AMOUNT.has(agency) || !unitFilter) return true;
      if (key === 'employeeShare' || key === 'employerShare') return unitFilter === UNIT_AMOUNT;
      if (key === 'eeRate' || key === 'erRate') return unitFilter === UNIT_PERCENTAGE;
      return true;
    })
    .map(([key, label]) => [key, (mode === 'payroll' && def.payrollColumnLabels?.[key]) || label]);
  const visibleRows = useMemo(() => (tableVersion?.rows || [])
    .filter(row => Object.values(row).join(' ').toLowerCase().includes(query.toLowerCase()))
    .filter(row => !unitFilter || row.unit === unitFilter)
    .filter(row => !columnFilter.key || !columnFilter.value.trim() || String(fieldValue(agency, row, columnFilter.key)).toLowerCase().includes(columnFilter.value.trim().toLowerCase())), [tableVersion, query, columnFilter, unitFilter, agency]);

  const openVersion = (item, readOnly) => { setViewOnly(readOnly); setSelectedId(item.id); };
  const closeVersion = () => { setSelectedId(null); setDraft(null); setViewOnly(false); };
  const addVersion = () => {
    const item = { id: `${agency}-${Date.now()}`, agency, code: '', name: aligned && !isTaxGroup ? '' : `${def.name} ${new Date().getFullYear()}`, effectiveDate: new Date().toISOString().slice(0, 10), status: 'Inactive', createdBy: 'P&A Admin', createdAt: new Date().toLocaleString(), createdOn: todayIso(), updatedBy: 'P&A Admin', updatedAt: new Date().toLocaleString(), rows: [] };
    if (aligned && isTaxGroup) item.name = '';
    setViewOnly(false); setDraft(item); setSelectedId(item.id);
  };
  const saveVersion = () => {
    if (aligned) {
      if (!draft.effectiveDate) { notify({ type: 'error', message: 'Effective date cannot be empty.' }); return; }
      if (isTaxGroup && isNewVersion && !String(draft.name || '').trim()) { notify({ type: 'error', message: 'Tax Table Name is required.' }); return; }
    } else if (!draft.effectiveDate || !draft.status) { notify({ type: 'error', message: 'Effective date and status are required.' }); return; }
    const dateTaken = allVersions.find(item => item.id !== draft.id && item.status !== 'Deleted' && item.effectiveDate === draft.effectiveDate);
    if (dateTaken) { notify({ type: 'error', message: `A ${def.short} table effective ${draft.effectiveDate} already exists.` }); return; }
    if (isNewVersion && !draft.rows.length) { notify({ type: 'error', message: aligned ? `Add at least one ${WITHHOLDING.has(agency) ? 'entry' : 'bracket'} before saving.` : `Add at least one ${isTaxGroup ? 'bracket or row' : 'bracket'} before saving.` }); return; }
    const existing = allVersions.find(item => item.id === draft.id);
    const code = draft.code || nextCode(def, allVersions, draft.effectiveDate);
    const entry = historyEntry(existing ? (existing.status !== draft.status ? `Status changed to ${draft.status}` : 'Updated') : 'Created', `${code} effective ${formatUsDate(draft.effectiveDate)}, ${draft.rows.length} rows`);
    // More than one table can be Active; the one in force is chosen by the Effectivity Date against the payroll period.
    setData(previous => ({ ...previous, [agency]: [
      ...previous[agency].filter(item => item.id !== draft.id),
      { ...draft, agency, code, updatedBy: 'P&A Admin', updatedAt: new Date().toLocaleString(), updatedOn: todayIso(), history: [entry, ...(draft.history || [])] },
    ].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)) }));
    closeVersion();
    notify({ type: 'success', message: `${code} saved successfully.` });
  };

  const deleteVersion = item => {
    setData(previous => ({ ...previous, [agency]: previous[agency].map(row => row.id === item.id ? { ...row, status: 'Deleted', updatedBy: 'P&A Admin', updatedAt: new Date().toLocaleString(), updatedOn: todayIso(), history: [historyEntry('Deleted', `${item.code} deleted`), ...(row.history || [])] } : row) }));
    setVersionDeleting(null);
    notify({ type: 'success', message: `${item.code} deleted. Its code is not used again.` });
  };
  /** Aligned tables: Atlas's checks, shown in the entry form. Returns the problem, or '' once the entry is staged. */
  const saveAlignedEntry = entered => {
    const problem = entryProblem(agency, entered, draft.rows);
    if (problem) return problem;
    const entry = cleanEntry(agency, entered);
    const id = entry.id || Math.max(0, ...draft.rows.map(row => Number(row.id) || 0)) + 1;
    setDraft(previous => ({ ...previous, rows: entry.id ? previous.rows.map(row => row.id === entry.id ? { ...entry, id } : row) : [...previous.rows, { ...entry, id }] }));
    setEntryEditing(undefined);
    notify({ type: 'success', message: `${isTaxGroup ? 'Tax' : 'Statutory'} table entry ${entered.id ? 'updated' : 'added'} successfully.` });
    return '';
  };
  /** The De Minimis ceiling setup and Annual Tax, as the mockup had them. */
  const saveEntry = entry => {
    const minimum = Number(entry.minimum ?? 0);
    const maximum = Number(entry.maximum ?? 0);
    const graduated = agency === 'annualTax';
    if (graduated && maximum > 0 && minimum > maximum) {
      notify({ type: 'error', message: 'Minimum compensation cannot exceed the maximum for the same bracket.' }); return;
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
  const deleteEntry = entry => {
    setDraft(previous => ({ ...previous, rows: previous.rows.filter(row => row.id !== entry.id) }));
    setEntryDeleting(null);
    notify({ type: 'success', message: 'Entry deleted.' });
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
          if (position < 0) return;
          const raw = values[position];
          item[key] = ['text', 'select', 'reference', 'locked'].includes(type) && key !== 'excessRate' ? raw : (raw === '' && type === 'optional' ? null : Number(String(raw || '0').replace('%', '')));
        });
        return item;
      });
      const errors = [];
      rows.forEach((item, index) => {
        if (aligned) {
          const problem = entryProblem(agency, item, rows.slice(0, index));
          if (problem) errors.push({ row: index + 2, reason: problem });
          return;
        }
        def.fields.forEach(([key, label, type]) => {
          if (!['text', 'select'].includes(type) && Number.isNaN(Number(item[key]))) errors.push({ row: index + 2, field: label, reason: 'Must be a number.' });
        });
        if ('minimum' in item && 'maximum' in item && Number(item.maximum) > 0 && Number(item.minimum) > Number(item.maximum)) errors.push({ row: index + 2, field: 'Minimum', value: item.minimum, reason: 'The minimum cannot be higher than the maximum.' });
      });
      if (!rows.length) errors.push({ reason: 'The file has no data rows.' });
      if (errors.length) { rejectUpload(file.name, errors, notify); return; }
      setDraft(previous => ({ ...previous, rows: aligned ? rows.map(row => cleanEntry(agency, row)) : rows }));
      notify({ type: 'success', message: `${rows.length} ${def.short} rows imported for review.` });
    };
    reader.readAsText(file); event.target.value = '';
  };

  // Atlas: Add and Upload only while a new version is built, Export only on a saved one, and the Action column only on a new one.
  const showActions = mode === 'settings' && (!aligned || (isNewVersion && canEdit));
  const renderTable = version => <>
    <div className="statutory-toolbar">
      <div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search..." /><MagnifyingGlass /></div>
      {RATE_OR_AMOUNT.has(agency)
        ? <select value={unitFilter} onChange={event => setUnitFilter(event.target.value)} aria-label="Filter by Unit"><option value="">Unit: All</option><option value={UNIT_PERCENTAGE}>{UNIT_PERCENTAGE}</option><option value={UNIT_AMOUNT}>{UNIT_AMOUNT}</option></select>
        : <select value={columnFilter.key} onChange={event => setColumnFilter({ key: event.target.value, value: '' })} aria-label="Filter by column"><option value="">Filter by column</option>{tableColumns.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}
      {columnFilter.key && <input value={columnFilter.value} onChange={event => setColumnFilter({ ...columnFilter, value: event.target.value })} placeholder="Contains" aria-label="Filter value" />}
      <div className="toolbar-spacer" />
      {canEdit && !locked && <><button className="button primary" onClick={() => setEntryEditing(null)}><Plus /> Add</button><button className="button secondary" onClick={() => downloadTemplate(def, version)}><DownloadSimple /> Download Template</button><button className="button secondary" onClick={() => importRef.current?.click()}><UploadSimple /> Upload</button><input className="sr-only" ref={importRef} type="file" accept=".csv,text/csv" onChange={importRows} /></>}
      {(!aligned || !isNewVersion) && <ExportMenu onExport={format => { exportTable(def, { ...version, rows: visibleRows }, format, aligned ? tableColumns : def.fields); notify({ type: 'success', message: `${def.short} export prepared from what is shown.` }); }} />}
    </div>
    <div className="table-card statutory-table-card"><table className="statutory-table"><thead><tr>{tableColumns.map(([, label]) => <th key={label}>{label}</th>)}{showActions && <th>Action</th>}</tr></thead><tbody>
      {visibleRows.length ? visibleRows.map(row => <tr key={row.id}>{tableColumns.map(([key]) => <td key={key}>{fieldValue(agency, row, key)}</td>)}{showActions && <td><div className="row-actions always"><button onClick={() => setViewing(row)} aria-label="View" title="View"><Eye /></button>{canEdit && !locked && <button onClick={() => setEntryEditing(row)} aria-label="Edit" title="Edit"><PencilSimple /></button>}{aligned && canEdit && !locked && <button onClick={() => setEntryDeleting(row)} aria-label="Delete" title="Delete"><Trash /></button>}</div></td>}</tr>) : <tr><td colSpan={tableColumns.length + (showActions ? 1 : 0)}><div className="empty-state compact"><h3>No entries found</h3><p>Add an entry or import the approved table.</p></div></td></tr>}
    </tbody></table></div>
    <div className="pagination"><span>Displaying <strong>{visibleRows.length}</strong> of {version.rows.length} items</span><div><button disabled>«</button><strong>1</strong><span>of 1</span><button disabled>»</button></div></div>
  </>;

  const versionHeaders = aligned && isTaxGroup
    ? ['Code', 'Tax Table Name', 'Created By', 'Date Created', 'Effective Date', 'Status', 'Last Updated By', 'Last Updated Date', 'Action']
    : isTaxGroup ? ['Code', 'Tax Table Name', 'Created By', 'Date Created', 'Effective Date', 'Last Updated By', 'Last Updated Date', 'Status', 'Action']
      : ['Code', 'Effective Date', 'Last Updated By', 'Last Updated Date', 'Status', 'Action'];
  const versionCells = item => {
    const status = <span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span>;
    const code = <><button className="table-link" onClick={() => (aligned ? openVersion(item, true) : setVersionViewing(item))}>{item.code}</button>{item.supersedes && <small>supersedes {item.supersedes}</small>}</>;
    if (!aligned) return [code, ...(isTaxGroup ? [item.name || def.name, item.createdBy || '—', item.createdOn ? formatUsDate(item.createdOn) : (item.createdAt || '—')] : []), formatUsDate(item.effectiveDate), item.updatedBy || item.createdBy, item.updatedAt || item.createdAt, status];
    const updated = longDateTime(item.updatedAt || item.createdAt);
    return isTaxGroup
      ? [code, item.name || def.name, item.createdBy || '-', longDate(item.createdOn || item.createdAt), longDate(item.effectiveDate), status, item.updatedBy || item.createdBy, updated]
      : [code, longDate(item.effectiveDate), item.updatedBy || item.createdBy, updated, status];
  };
  const versionActions = item => (aligned
    ? <div className="row-actions always"><button onClick={() => openVersion(item, true)} aria-label="View" title="View"><Eye /></button>{isPaAdmin && <button onClick={() => openVersion(item, false)} aria-label="Edit" title="Edit"><PencilSimple /></button>}{isPaAdmin && <button onClick={() => setVersionDeleting(item)} aria-label="Delete" title="Delete"><Trash /></button>}</div>
    : <div className="row-actions always"><button onClick={() => setVersionViewing(item)} aria-label="View"><Eye /></button><button onClick={() => setSelectedId(item.id)} aria-label="Edit" title="Edit"><PencilSimple /></button>{isPaAdmin && <button onClick={() => setVersionDeleting(item)} aria-label="Delete" title="Delete"><Trash /></button>}</div>);

  return <div className="statutory-workspace">
    <AgencySidebar agency={agency} setAgency={setAgency} mode={mode} onBack={onBack} group={group} />
    <main className="statutory-main">
      {!tableVersion && mode === 'settings' ? <>
        <div className="page-heading"><div><p className="breadcrumb">Settings / {groupTitle}</p><h1>{def.name}</h1><p className="page-description">Maintain current and historical {isTaxGroup ? 'tax' : 'statutory'} table versions for ABC Company Ltd.</p></div></div>
        {aligned
          ? <div className="statutory-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search..." /><MagnifyingGlass /></div>
            <button className="button secondary" onClick={() => setVersionFilterOpen(true)}><Funnel /> Filter{versionFilterActive ? ' (on)' : ''}</button>
            <div className="toolbar-spacer" />{isPaAdmin && <button className="button primary" onClick={addVersion}><Plus /> Add</button>}<ExportMenu onExport={format => exportTable(def, shownVersions[0] || versions[0], format, def.columns)} /></div>
          : <div className="statutory-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search code, name or effective date..." /><MagnifyingGlass /></div>
            <select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })} aria-label="Filter by status"><option value="">Status</option><option>Active</option><option>Inactive</option></select>
            <label className="statutory-filter-date">Effective Date<DateInput value={filters.effective} onChange={value => setFilters({ ...filters, effective: value })} /></label>
            <label className="statutory-filter-date">Last Updated<DateInput value={filters.updated} onChange={value => setFilters({ ...filters, updated: value })} /></label>
            {(filters.status || filters.effective || filters.updated || query) && <button className="button secondary" onClick={() => { setFilters({ status: '', effective: '', updated: '' }); setQuery(''); }}>Clear</button>}
            <div className="toolbar-spacer" />{isPaAdmin && <button className="button primary" onClick={addVersion}><Plus /> Add</button>}<button className="button secondary" onClick={() => setAuditOpen(true)}><ClockCounterClockwise /> Audit trail</button><ExportMenu onExport={format => exportTable(def, shownVersions[0] || versions[0], format)} /></div>}
        <div className="table-card statutory-version-card"><table><thead><tr>{versionHeaders.map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{shownVersions.length ? shownVersions.map(item => <tr key={item.id}>{versionCells(item).map((cell, index) => <td key={index}>{cell}</td>)}<td>{versionActions(item)}</td></tr>) : <tr><td colSpan={versionHeaders.length}><div className="empty-state compact"><h3>No tables found</h3><p>Change the search or the filters.</p></div></td></tr>}</tbody></table></div>
      </> : tableVersion ? <>
        {mode === 'settings' && <button className="inline-back" onClick={() => (aligned && !viewOnly && canEdit ? setDiscardVersion(true) : closeVersion())}><ArrowLeft /> {def.short} versions</button>}
        <div className="page-heading"><div><p className="breadcrumb">{mode === 'settings' ? 'Settings' : 'Payroll'} / {groupTitle} / {def.short}</p><h1>{def.name}</h1><p className="page-description">{mode === 'settings' ? (viewOnly ? `View this ${isTaxGroup ? 'tax' : 'statutory'} table version.` : `Add or revise ${isTaxGroup ? 'tax brackets and rates' : 'contribution brackets'} before activating this version.`) : 'View the active table used by the current payroll computation.'}</p></div>{mode === 'payroll' && <span className="controlled-badge"><CheckCircle weight="fill" /> Active approved version</span>}</div>
        <section className="statutory-version-meta">
          {mode === 'settings' ? <>
            <label>Code<input value={draft.code || (aligned ? 'Auto-generated on save' : 'Generated when saved')} disabled /></label>
            {(!aligned || isTaxGroup) && <label>{aligned ? 'Tax Table Name' : 'Table Name'}{aligned && isNewVersion && <span className="required">*</span>}<input value={aligned ? (draft.name || '') : (draft.name || def.name)} placeholder={aligned ? def.name : undefined} onChange={event => setDraft({ ...draft, name: event.target.value })} disabled={!canEdit || locked} /></label>}
            <label>Effective Date<DateInput value={draft.effectiveDate} onChange={value => setDraft({ ...draft, effectiveDate: value })} disabled={!canEdit} /></label>
            <label>Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })} disabled={!canEdit}><option>Active</option><option>Inactive</option></select></label>
          </> : <><span><small>Effective</small><strong>{aligned ? longDate(activeVersion.effectiveDate) : formatUsDate(activeVersion.effectiveDate)}</strong></span><span><small>Version</small><strong>{activeVersion.code}</strong></span><span><small>Status</small><strong>Active</strong></span></>}
        </section>
        <section className="statutory-table-section"><div className="workspace-copy"><h2>{def.name}</h2><p>{mode === 'settings' ? (isTaxGroup ? 'Tax brackets, rates and fixed amounts.' : 'Contribution brackets and employee/employer shares.') : 'Approved brackets are read-only in Payroll.'}</p></div>{renderTable(tableVersion)}</section>
        {mode === 'settings' && (viewOnly
          ? <div className="statutory-save-row"><button className="button secondary" onClick={closeVersion}>Back</button></div>
          : !canEdit
            ? <div className="statutory-lock-note"><LockKey weight="fill" /><div><strong>{groupTitle} are maintained by P&amp;A.</strong><span>Client administrators have view and export access. Switch to the P&amp;A Admin role to publish a version.</span></div></div>
            : <div className="statutory-save-row"><button className="button secondary" onClick={() => (aligned ? setDiscardVersion(true) : closeVersion())}>Cancel</button><button className="button primary" onClick={saveVersion}>{aligned ? 'Save' : 'Save table'}</button></div>)}
      </> : mode === 'payroll' ? <>
        <div className="page-heading"><div><p className="breadcrumb">Payroll / {groupTitle} / {def.short}</p><h1>{def.name}</h1><p className="page-description">View the active table used by the current payroll computation.</p></div></div>
        <div className="empty-state compact"><h3>No active table</h3><p>No active {def.short} table is effective as of {todayIso()}.</p></div>
      </> : null}
    </main>
    {versionViewing && <VersionView version={versionViewing} def={def} onClose={() => setVersionViewing(null)} />}
    {versionFilterOpen && <VersionFilterModal value={versionFilter} isTaxGroup={isTaxGroup} onClose={() => setVersionFilterOpen(false)} onApply={next => { setVersionFilter(next); setVersionFilterOpen(false); }} />}
    {versionDeleting && <div className="modal-backdrop"><section className="modal delete-modal" role="dialog" aria-modal="true" aria-label="Delete table"><header><h2>Delete table</h2><button className="icon-button" onClick={() => setVersionDeleting(null)} aria-label="Close"><X /></button></header><div className="modal-body"><div className="delete-copy"><div className="delete-icon"><Trash /></div><div><h3>Delete “{versionDeleting.code}”?</h3><p>Deleting an entire entry will prevent other users from using this reference in any transaction. Proceed with deletion? This is a soft delete. The audit trail keeps it, and its code is not used again.</p></div></div><div className="modal-actions"><button className="button secondary" onClick={() => setVersionDeleting(null)}>Cancel</button><button className="button danger" onClick={() => deleteVersion(versionDeleting)}>Delete</button></div></div></section></div>}
    {entryDeleting && <div className="modal-backdrop"><section className="modal delete-modal" role="dialog" aria-modal="true" aria-label="Delete entry"><header><h2>Delete entry</h2><button className="icon-button" onClick={() => setEntryDeleting(null)} aria-label="Close"><X /></button></header><div className="modal-body"><div className="delete-copy"><div className="delete-icon"><Trash /></div><div><h3>Delete this entry?</h3><p>It is removed from this new version. Nothing is saved until you select Save.</p></div></div><div className="modal-actions"><button className="button secondary" onClick={() => setEntryDeleting(null)}>Cancel</button><button className="button danger" onClick={() => deleteEntry(entryDeleting)}>Delete</button></div></div></section></div>}
    {discardVersion && <DiscardDialog message={isNewVersion ? 'The brackets you added have not been saved yet.' : 'Your changes have not been saved yet.'} onCancel={() => setDiscardVersion(false)} onDiscard={() => { setDiscardVersion(false); closeVersion(); }} />}
    {auditOpen && <AuditTrail versions={allVersions} def={def} onClose={() => setAuditOpen(false)} />}
    {entryEditing !== undefined && (aligned
      ? <AlignedEntryModal agency={agency} row={entryEditing} isTaxGroup={isTaxGroup} onClose={() => setEntryEditing(undefined)} onSave={saveAlignedEntry} />
      : <EntryModal agency={agency} row={entryEditing} onClose={() => setEntryEditing(undefined)} onSave={saveEntry} />)}
    {viewing && (aligned
      ? <AlignedEntryModal agency={agency} row={viewing} isTaxGroup={isTaxGroup} onClose={() => setViewing(null)} onSave={() => ''} readOnly />
      : <EntryModal agency={agency} row={viewing} onClose={() => setViewing(null)} onSave={() => {}} readOnly />)}
  </div>;
}
