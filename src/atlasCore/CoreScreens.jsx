/**
 * Atlas Core screens for the Core module, matching how they work in Atlas
 * Core (QA). Table screens are AtlasTable definitions from coreScreens.js;
 * Security, Ticket Filing, Company Offboarding and Audit Log have their own
 * layouts here.
 */
import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle, DownloadSimple, Funnel, MagnifyingGlass, Plus, UploadSimple } from '@phosphor-icons/react';
import { appendAuditEvent, readActiveCompanyId, readAuditEvents, readCompanies } from '../companyRepository';
import { useRole } from '../RoleContext';
import { downloadFile } from '../fileDownload';
import { AtlasPage, AtlasTable, FormDialog, ViewDialog, displayValue, readScoped, writeScoped } from './AtlasTable.jsx';
import { formatUs, todayIso } from './dates.js';
import { ticketingConfiguration } from './SettingsScreens.jsx';
import {
  calendarEvents, companyOffboardingDocuments, employeeChargeCodes, happinessMeter, holidays, navigationConfiguration,
  notificationConfiguration, onboardingChecklist, onboardingDocuments, payrollPayout, payrollProcessCalendar,
  roleManagement, statutoryDeadline, timekeepingCalendar, userManagement, wellnessArticles, wellnessEvents,
} from './coreScreens.js';

const tab = (key, label, definition) => ({ key, label, definition });

export const CalendarSettingsScreen = props => <AtlasPage {...props} title="Calendar Settings" breadcrumb="Core / Company Configuration / Calendar" guideKey="Calendar Settings" tabs={[tab('payout', 'Payroll Payout', payrollPayout), tab('process', 'Payroll Process Calendar', payrollProcessCalendar), tab('timekeeping', 'Timekeeping', timekeepingCalendar), tab('events', 'Events', calendarEvents), tab('holidays', 'Holidays', holidays), tab('statutory', 'Statutory Deadline', statutoryDeadline)]} />;
export const EmployeeOnboardingScreen = props => <AtlasPage {...props} title="People Preboarding" breadcrumb="Core / Company Configuration / People Preboarding" guideKey="Employee Onboarding" tabs={[tab('document', 'Document', onboardingDocuments), tab('checklist', 'Onboarding Checklist', onboardingChecklist)]} />;
export const ChargeCodesScreen = props => <AtlasPage {...props} title="Employee Charge Codes" breadcrumb="Core / Company Configuration / Employee Charge Codes" tabs={[tab('codes', 'Employee Charge Codes', employeeChargeCodes)]} />;
export const HappinessMeterScreen = props => <AtlasPage {...props} title="Happiness Meter" breadcrumb="Core / Company Configuration / Happiness Meter" guideKey="Happiness Meter" description="Rename the five moods employees choose from. The rate, color and emoji are fixed." tabs={[tab('moods', 'Happiness Meter', happinessMeter)]} />;
export const WellnessEventsScreen = props => <AtlasPage {...props} title="Wellness and Events" breadcrumb="Core / Company Configuration / Wellness and Events" guideKey="Wellness and Events" description="New and edited content goes For Approval before it is published to employees." tabs={[{ key: 'articles', label: 'Articles', render: renderContent(wellnessArticles) }, { key: 'events', label: 'Events', render: renderContent(wellnessEvents) }]} />;
export const NotificationsScreen = props => <AtlasPage {...props} title="Notifications" breadcrumb="Core / Company Configuration / Notifications" guideKey="Notifications" tabs={[tab('configuration', 'Notification Configuration', notificationConfiguration)]} />;
export const NavigationConfigurationScreen = props => <AtlasPage {...props} title="Navigation Configuration" breadcrumb="Core / Navigation Configuration" description="Published Navigation Guides open as a welcome guide the first time a user opens that feature." tabs={[tab('navigation', 'Navigation Configuration', navigationConfiguration)]} />;
export const AccessRightConfigurationScreen = props => <AtlasPage {...props} title="Access Right Configuration" breadcrumb="Core / Access Right Configuration" guideKey="Access Right Configuration" tabs={[tab('roles', 'Role Management', roleManagement), tab('users', 'User Management', userManagement)]} />;

/** Articles and Events: the reviewer approves or rejects (with a reason) what an author saved. */
function renderContent(definition) {
  const ContentTable = ({ notify, companyId }) => {
    const { actor } = useRole();
    const [rows, setRows] = useState(() => readScoped(definition.storageKey, definition.seed, companyId));
    const [rejecting, setRejecting] = useState(null);
    const save = (next, summary) => { setRows(next); writeScoped(definition.storageKey, next, companyId); if (summary) appendAuditEvent({ companyId, actor, action: `${definition.singular}Reviewed`, entityType: definition.title, entityId: definition.storageKey, summary }); };
    const decide = (row, status, remarks = '') => {
      save(rows.map(item => item.id === row.id ? { ...item, status: status === 'Approved' ? (item.publishDate && item.publishDate > todayIso() ? 'Scheduled' : 'Published') : 'Rejected', remarks } : item), `${definition.singular} "${row.title}" ${status.toLowerCase()}.`);
      notify({ type: 'success', message: `${definition.singular} ${status.toLowerCase()}.` });
    };
    const withReview = { ...definition, rowActions: row => row.status === 'For Approval' && <><button type="button" title="Approve" aria-label="Approve" onClick={() => decide(row, 'Approved')}><CheckCircle /></button><button type="button" title="Reject" aria-label="Reject" onClick={() => setRejecting({ row, remarks: '' })}>✕</button></> };
    return <>
      <AtlasTable definition={withReview} notify={notify} companyId={companyId} rows={rows} setRows={next => save(next)} />
      {rejecting && <FormDialog title={`Reject ${definition.singular}`} fields={[{ key: 'remarks', label: 'Please provide reason for rejection in the text box below', type: 'textarea', required: true, placeholder: 'Input reason' }]} draft={rejecting} setDraft={setRejecting} onClose={() => setRejecting(null)} submitLabel="Reject" onSubmit={() => { if (!rejecting.remarks?.trim()) return notify({ type: 'error', message: 'A reason for rejection is required.' }); decide(rejecting.row, 'Rejected', rejecting.remarks.trim()); setRejecting(null); }} />}
    </>;
  };
  return props => <ContentTable {...props} />;
}

/* --------------------------------------------------------------- Security */

const OTP_OPTIONS = [['sms', 'Receive OTP via SMS'], ['email', 'Receive OTP via Email'], ['google', 'Receive OTP via Google Authenticator'], ['microsoft', 'Receive OTP via Microsoft Authenticator']];

export function SecurityConfigurationScreen({ onBack, notify, companyId = readActiveCompanyId() }) {
  const { actor } = useRole();
  const [settings, setSettings] = useState(() => ({ sms: false, email: true, google: false, microsoft: false, passwordExpirationDays: 90, ...readScoped('atlas-core-security-v1', {}, companyId) }));
  const [editingExpiry, setEditingExpiry] = useState(null);
  const save = (next, summary) => { setSettings(next); writeScoped('atlas-core-security-v1', next, companyId); appendAuditEvent({ companyId, actor, action: 'SecuritySettingChanged', entityType: 'Security Configuration', entityId: companyId, summary }); };
  const toggle = key => {
    const next = { ...settings, [key]: !settings[key] };
    if (!OTP_OPTIONS.some(([option]) => next[option])) return notify({ type: 'error', message: 'Keep at least one way to receive an OTP turned on.' });
    save(next, `${OTP_OPTIONS.find(([option]) => option === key)[1]} turned ${next[key] ? 'on' : 'off'}.`);
    notify({ type: 'success', message: 'Security setting saved.' });
  };
  return <AtlasPage title="Security" breadcrumb="Core / Security Configuration" guideKey="Security Configuration" onBack={onBack} notify={notify} companyId={companyId}>
    <section className="profile-form-card atlas-settings-card">
      <h2>OTP Preferences</h2>
      <p className="page-description">Enable or disable security features to protect your account.</p>
      {OTP_OPTIONS.map(([key, label]) => <label key={key} className="atlas-switch-row"><span>{label}</span><input type="checkbox" role="switch" checked={settings[key]} onChange={() => toggle(key)} /></label>)}
    </section>
    <section className="profile-form-card atlas-settings-card">
      <h2>Password Configuration</h2>
      <button type="button" className="atlas-link-row" onClick={() => setEditingExpiry({ days: settings.passwordExpirationDays })}><span>Set Password Expiration<small>Passwords expire every {settings.passwordExpirationDays} days.</small></span><ArrowRight /></button>
    </section>
    {editingExpiry && <FormDialog title="Set Password Expiration" fields={[{ key: 'days', label: 'Password Expiration (days)', type: 'number', required: true, min: 1, max: 365, placeholder: 'Input Password Expiration' }]} draft={editingExpiry} setDraft={setEditingExpiry} onClose={() => setEditingExpiry(null)} onSubmit={() => {
      const days = Number(editingExpiry.days);
      if (!Number.isInteger(days) || days < 1 || days > 365) return notify({ type: 'error', message: 'Password Expiration must be a whole number of days from 1 to 365.' });
      save({ ...settings, passwordExpirationDays: days }, `Password expiration set to ${days} days.`);
      setEditingExpiry(null);
      notify({ type: 'success', message: 'Password expiration saved.' });
    }} />}
  </AtlasPage>;
}

/* ---------------------------------------------------------- Ticket filing */

const MAX_TICKET_FILE_MB = 10;

export function TicketFilingScreen({ onBack, notify, companyId = readActiveCompanyId() }) {
  const { actor } = useRole();
  const topics = useMemo(() => {
    // Help topics come from Settings ▸ Ticketing Configuration (one list for every company).
    const configured = readScoped(ticketingConfiguration.storageKey, ticketingConfiguration.seed, 'global');
    return (Array.isArray(configured) ? configured : []).map(row => row.name).filter(Boolean);
  }, []);
  const blank = { topic: '', subject: '', message: '', file: null };
  const [draft, setDraft] = useState(blank);
  const [filed, setFiled] = useState(null);
  const submit = event => {
    event.preventDefault();
    if (!draft.subject.trim() || !draft.message.trim()) return notify({ type: 'error', message: 'Subject and Message are required.' });
    if (!draft.file) return notify({ type: 'error', message: 'Upload a supporting document.' });
    if (draft.file.size > MAX_TICKET_FILE_MB * 1048576) return notify({ type: 'error', message: `The file is larger than ${MAX_TICKET_FILE_MB} MB.` });
    const tickets = readScoped('atlas-core-ticket-filing-v1', [], companyId);
    const ticket = { id: `tkt-${Date.now()}`, ticketNo: `TKT-${new Date().getFullYear()}-${String(tickets.length + 1).padStart(4, '0')}`, ...draft, subject: draft.subject.trim(), message: draft.message.trim(), file: { name: draft.file.name, size: draft.file.size }, filedBy: actor, filedAt: new Date().toISOString() };
    writeScoped('atlas-core-ticket-filing-v1', [ticket, ...tickets], companyId);
    appendAuditEvent({ companyId, actor, action: 'TicketFiled', entityType: 'Ticket', entityId: ticket.ticketNo, summary: `${ticket.ticketNo} filed: ${ticket.subject}.` });
    setFiled(ticket); setDraft(blank);
    notify({ type: 'success', message: `Ticket ${ticket.ticketNo} submitted. The help topic's assigned e-mails are notified.` });
  };
  return <AtlasPage title="Tickets" breadcrumb="Core / Tickets" guideKey="Tickets" onBack={onBack} notify={notify} companyId={companyId}>
    <section className="profile-form-card atlas-settings-card">
      <h2>File a Ticket</h2>
      <form onSubmit={submit} className="canonical-form-grid">
        <label><span>Help Topic</span><select value={draft.topic} onChange={event => setDraft({ ...draft, topic: event.target.value })}><option value="" disabled>Please select</option>{topics.map(topic => <option key={topic}>{topic}</option>)}</select></label>
        <label><span>Subject<span className="required">*</span></span><input value={draft.subject} maxLength={150} onChange={event => setDraft({ ...draft, subject: event.target.value })} placeholder="Input subject" /></label>
        <label className="atlas-wide"><span>Message<span className="required">*</span></span><textarea value={draft.message} maxLength={2000} onChange={event => setDraft({ ...draft, message: event.target.value })} placeholder="Describe your concern" /></label>
        <label className="atlas-wide"><span>Upload Supporting Document<span className="required">*</span></span><input type="file" onChange={event => setDraft({ ...draft, file: event.target.files?.[0] || null })} /><small>{draft.file ? draft.file.name : `Maximum file size ${MAX_TICKET_FILE_MB}MB.`}</small></label>
        <div className="module-save-row atlas-wide"><button type="button" className="button secondary" onClick={() => setDraft(blank)}>Cancel</button><button className="button primary">Submit</button></div>
      </form>
      {filed && <p className="atlas-confirmation"><CheckCircle /> {filed.ticketNo} submitted on {formatUs(filed.filedAt.slice(0, 10))}.</p>}
    </section>
  </AtlasPage>;
}

/* ---------------------------------------------------- Company offboarding */

const OFFBOARDING_STEPS = ['Choose the Company to offboard', 'Manage Termination', 'Upload Offboarding Documents'];

export function CompanyOffboardingScreen({ onBack, notify }) {
  const { actor } = useRole();
  const companies = readCompanies();
  const [rows, setRows] = useState(() => readScoped('atlas-core-company-offboarding-v1', [], 'global'));
  const [wizard, setWizard] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [query, setQuery] = useState('');
  const persist = next => { setRows(next); writeScoped('atlas-core-company-offboarding-v1', next, 'global'); };
  const statusOf = row => companyOffboardingDocuments.every(name => row.documents?.[name]) ? 'Completed' : row.terminationDate <= todayIso() ? 'For Completion' : 'Scheduled';
  const columns = [{ key: 'companyName', label: 'Company Name' }, { key: 'terminationDate', label: 'Termination Date', type: 'date' }, { key: 'status', label: 'Status', type: 'status', render: row => <span className="status-pill pending">{statusOf(row)}</span> }, ...companyOffboardingDocuments.map(name => ({ key: name, label: name, render: row => row.documents?.[name]?.name || '—' }))];
  const shown = rows.filter(row => `${row.companyName} ${row.terminationDate}`.toLowerCase().includes(query.toLowerCase()));
  const next = () => {
    if (wizard.step === 0 && !wizard.companyId) return notify({ type: 'error', message: 'Company Name is required.' });
    if (wizard.step === 0 && rows.some(row => row.companyId === wizard.companyId && row.id !== wizard.id)) return notify({ type: 'error', message: 'This company is already being offboarded.' });
    if (wizard.step === 1 && !wizard.terminationDate) return notify({ type: 'error', message: 'Termination Effectivity Date is required.' });
    if (wizard.step < OFFBOARDING_STEPS.length - 1) return setWizard({ ...wizard, step: wizard.step + 1 });
    const company = companies.find(item => item.companyId === wizard.companyId);
    const record = { id: wizard.id || `off-${Date.now()}`, companyId: wizard.companyId, companyName: company?.displayName || company?.legalName || wizard.companyId, terminationDate: wizard.terminationDate, documents: wizard.documents || {} };
    persist(wizard.id ? rows.map(row => row.id === wizard.id ? record : row) : [record, ...rows]);
    appendAuditEvent({ companyId: wizard.companyId, actor, action: 'CompanyOffboardingSaved', entityType: 'Company Offboarding', entityId: wizard.companyId, summary: `${record.companyName} offboarding saved, effective ${record.terminationDate}.` });
    setWizard(null);
    notify({ type: 'success', message: `${record.companyName} offboarding saved.` });
  };
  return <AtlasPage title="Company Offboarding" breadcrumb="Core / Company Offboarding" onBack={onBack} notify={notify}>
    <div className="config-toolbar atlas-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search..." /><MagnifyingGlass /></div><div className="toolbar-spacer" /><button className="button primary" onClick={() => setWizard({ step: 0, companyId: '', terminationDate: '', documents: {} })}><Plus /> Add</button></div>
    <div className="table-card atlas-table"><table><thead><tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}<th>Action</th></tr></thead><tbody>{shown.length ? shown.map(row => <tr key={row.id}>{columns.map(column => <td key={column.key}>{displayValue(column, row)}</td>)}<td><div className="row-actions always"><button type="button" onClick={() => setViewing(row)} title="View">View</button><button type="button" onClick={() => setWizard({ ...row, step: 2 })} title="Upload documents"><UploadSimple /></button></div></td></tr>) : <tr><td colSpan={columns.length + 1}><div className="empty-state compact"><h3>No data found.</h3></div></td></tr>}</tbody></table></div>
    {wizard && <div className="modal-backdrop"><section className="modal canonical-modal atlas-dialog wide" role="dialog" aria-modal="true" aria-label="Company Offboarding">
      <header><h2>Company Offboarding</h2><button type="button" className="icon-button" onClick={() => setWizard(null)} aria-label="Close">✕</button></header>
      <ol className="atlas-stepper">{OFFBOARDING_STEPS.map((label, index) => <li key={label} className={index === wizard.step ? 'current' : index < wizard.step ? 'done' : ''}>{label}</li>)}</ol>
      <div className="canonical-form-grid">
        {wizard.step === 0 && <label className="atlas-wide"><span>Company Name<span className="required">*</span></span><select value={wizard.companyId} disabled={Boolean(wizard.id)} onChange={event => setWizard({ ...wizard, companyId: event.target.value })}><option value="">Please select</option>{companies.map(company => <option key={company.companyId} value={company.companyId}>{company.displayName || company.legalName}</option>)}</select></label>}
        {wizard.step === 1 && <label><span>Termination Effectivity Date<span className="required">*</span></span><input type="date" value={wizard.terminationDate} onChange={event => setWizard({ ...wizard, terminationDate: event.target.value })} /></label>}
        {wizard.step === 2 && companyOffboardingDocuments.map(name => <label key={name}><span>{name}</span><input type="file" onChange={event => { const file = event.target.files?.[0]; if (file) setWizard({ ...wizard, documents: { ...wizard.documents, [name]: { name: file.name, size: file.size } } }); }} /><small>{wizard.documents?.[name]?.name || 'Not uploaded'}</small></label>)}
      </div>
      <footer className="modal-actions">{wizard.step > 0 && !(wizard.id && wizard.step === 2) && <button type="button" className="button secondary" onClick={() => setWizard({ ...wizard, step: wizard.step - 1 })}>Back</button>}<button type="button" className="button secondary" onClick={() => setWizard(null)}>Cancel</button><button type="button" className="button primary" onClick={next}>{wizard.step < OFFBOARDING_STEPS.length - 1 ? 'Next' : 'Save'}</button></footer>
    </section></div>}
    {viewing && <ViewDialog title="View Company Offboarding" columns={columns} row={viewing} onClose={() => setViewing(null)} />}
  </AtlasPage>;
}

/* -------------------------------------------------------------- Audit log */

const AUDIT_MICROSERVICES = { 'Payroll Transaction': 'Payroll', Payroll: 'Payroll', Leave: 'HRM', Ticket: 'Core' };
const auditRow = event => {
  const roleMatch = String(event.actor || '').match(/\(([^)]+)\)\s*$/);
  return {
    id: event.eventId || `${event.timestamp}-${event.action}`,
    timestamp: event.timestamp || event.at || '',
    actor: String(event.actor || '').replace(/\s*\([^)]+\)\s*$/, '') || 'System',
    employeeCode: event.employeeCode || '—',
    role: roleMatch?.[1] || event.role || '—',
    microservice: event.microservice || AUDIT_MICROSERVICES[event.entityType] || 'Core',
    module: event.module || event.entityType || '—',
    action: event.action || '—',
    targetEntity: event.entityType || '—',
    targetRecord: event.entityId || '—',
    description: event.summary || '—',
    values: event.before || event.after ? `${JSON.stringify(event.before ?? '')} → ${JSON.stringify(event.after ?? '')}` : '—',
    outcome: event.outcome || 'Success',
    channel: event.channel || 'Web',
    companyId: event.companyId,
  };
};

export function AuditLogScreen({ onBack, notify, companyId = readActiveCompanyId() }) {
  const [allClients, setAllClients] = useState(false);
  const [filters, setFilters] = useState({});
  const [filterDraft, setFilterDraft] = useState(null);
  const rows = useMemo(() => readAuditEvents(allClients ? '' : companyId).map(auditRow).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))), [allClients, companyId]);
  const filtered = rows.filter(row => (!filters.from || row.timestamp.slice(0, 10) >= filters.from) && (!filters.to || row.timestamp.slice(0, 10) <= filters.to)
    && ['actor', 'action', 'targetEntity', 'microservice', 'module'].every(key => !filters[key] || String(row[key]).toLowerCase().includes(String(filters[key]).toLowerCase())));
  const columns = [{ key: 'timestamp', label: 'Timestamp', render: row => row.timestamp ? new Date(row.timestamp).toLocaleString('en-US') : '—' }, { key: 'actor', label: 'Actor' }, { key: 'employeeCode', label: 'Employee Code' }, { key: 'actor', label: 'Employee Name' }, { key: 'role', label: 'Role' }, { key: 'module', label: 'Module' }, { key: 'action', label: 'Action' }, { key: 'targetEntity', label: 'Target Entity' }, { key: 'targetRecord', label: 'Target Record' }, { key: 'description', label: 'Description' }, { key: 'values', label: 'Old / New Values' }, { key: 'outcome', label: 'Outcome' }, { key: 'channel', label: 'Channel' }];
  const exportAs = format => {
    const lines = [columns.map(column => column.label), ...filtered.map(row => columns.map(column => column.key === 'timestamp' ? row.timestamp : row[column.key]))];
    if (format === 'PDF') {
      const popup = window.open('', '_blank', 'noopener,noreferrer');
      if (!popup) return notify({ type: 'error', message: 'Allow pop-ups to print the audit log.' });
      popup.document.write(`<html><head><title>Audit Log</title><style>body{font-family:Arial;padding:16px}table{border-collapse:collapse;font-size:10px}td,th{border:1px solid #bbb;padding:4px}</style></head><body><h1>Audit Log</h1><table>${lines.map((line, index) => `<tr>${line.map(cell => `<${index ? 'td' : 'th'}>${String(cell ?? '').replace(/</g, '&lt;')}</${index ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table></body></html>`);
      popup.document.close(); popup.print();
      return undefined;
    }
    downloadFile(`audit-log.${format === 'Excel' ? 'xls' : 'csv'}`, lines.map(line => line.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(format === 'Excel' ? '\t' : ',')).join('\n'), format === 'Excel' ? 'application/vnd.ms-excel' : 'text/csv');
    return notify({ type: 'success', message: `${filtered.length} audit event(s) exported.` });
  };
  const filterFields = [{ key: 'from', label: 'Date From', type: 'date' }, { key: 'to', label: 'Date To', type: 'date' }, { key: 'actor', label: 'Actor', placeholder: 'User ID' }, { key: 'action', label: 'Action' }, { key: 'targetEntity', label: 'Target Entity', placeholder: 'e.g. CompanyEmployee' }, { key: 'microservice', label: 'Microservice', type: 'select', options: ['Core', 'HRM', 'Timekeeping', 'Payroll'], placeholder: 'All microservices' }, { key: 'module', label: 'Module', type: 'select', options: ['Masterfile', 'Self-Service', 'Manage Approvals', ...new Set(rows.map(row => row.module))], placeholder: 'All modules' }];
  return <AtlasPage title="Audit Log" breadcrumb="Core / Audit Log" guideKey="Audit Log" onBack={onBack} notify={notify}>
    <div className="config-toolbar atlas-toolbar">
      <button type="button" className="button secondary" onClick={() => setFilterDraft({ ...filters })}><Funnel /> Filter</button>
      <label className="atlas-check"><input type="checkbox" checked={allClients} onChange={event => setAllClients(event.target.checked)} /> All clients</label>
      <div className="toolbar-spacer" />
      {['CSV', 'Excel', 'PDF'].map(format => <button key={format} type="button" className="button secondary" onClick={() => exportAs(format)}><DownloadSimple /> {format}</button>)}
    </div>
    <div className="table-card atlas-table"><table><thead><tr>{columns.map((column, index) => <th key={`${column.key}-${index}`}>{column.label}</th>)}</tr></thead><tbody>{filtered.length ? filtered.slice(0, 200).map(row => <tr key={row.id}>{columns.map((column, index) => <td key={`${column.key}-${index}`}>{displayValue(column, row)}</td>)}</tr>) : <tr><td colSpan={columns.length}><div className="empty-state compact"><h3>No data found.</h3></div></td></tr>}</tbody></table></div>
    <div className="pagination"><span>Displaying <strong>{Math.min(filtered.length, 200)}</strong> of {filtered.length} events</span></div>
    {filterDraft && <FormDialog title="Filter" fields={filterFields} draft={filterDraft} setDraft={setFilterDraft} onClose={() => setFilterDraft(null)} submitLabel="Apply" onSubmit={() => { setFilters(filterDraft); setFilterDraft(null); }} />}
  </AtlasPage>;
}
