/**
 * Settings screens as Atlas Core (QA) has them: Company Onboarding (Company
 * Management with its Add/Edit wizard and Configure), Ticketing Configuration
 * and Overtime Configuration. Companies are the mockup's own company records,
 * so a company added here appears in the company switcher and every module.
 */
import { useMemo, useState } from 'react';
import { DotsThreeVertical, DownloadSimple, FileCsv, Funnel, MagnifyingGlass, Plus, UploadSimple, X } from '@phosphor-icons/react';
import { appendAuditEvent, createDraftCompany, readCompanies, saveCompany } from '../companyRepository';
import { useRole } from '../RoleContext';
import { downloadFile } from '../fileDownload';
import { AtlasPage, FormDialog } from './AtlasTable.jsx';

const MICROSERVICES = ['Core', 'Human Resource Management (HRM)', 'Timekeeping', 'Payroll', 'Settings'];
const ALWAYS_ON = ['Core'];
const ENROLLMENT_FOR = { 'Human Resource Management (HRM)': 'HRM', Timekeeping: 'TIMEKEEPING', Payroll: 'PAYROLL' };
const MODULES = {
  Core: ['Company Configuration', 'Employee Masterfile', 'Access Right Configuration', 'Security Configuration', 'Reference Table', 'Navigation Configuration', 'Reports', 'Tickets', 'Company Offboarding', 'Audit Log', 'FAQ', 'Chatbox'],
  'Human Resource Management (HRM)': ['My Tasks', 'Employee Self-Service', 'Manage Approvals', 'People Preboarding', 'Employee Offboarding', 'Benefits', 'Employee Self-inquiry', 'Calendar', 'Wellness and Events'],
  Timekeeping: ['Time In & Time Out', 'Time & Attendance Summary', 'Work Hours Comparison', 'Year-to-Date Metrics', 'Shift Schedule Management', 'Absence Management', 'Tardiness/Undertime Management', 'Overtime Summary', 'Transfer Request Summary', 'Charge Codes'],
  Payroll: ['Statutory Tables', 'Tax Tables', 'Payroll Processing', 'Earning Management', 'Deduction Management', 'Bonus Management', 'Reports'],
  Settings: ['Company Onboarding', 'Company Offboarding', 'Reference Table', 'Statutory Tables', 'Tax Tables', 'FAQs', 'Ticketing Configuration', 'Overtime Configuration', 'Company Databases', 'Navigation Configuration'],
};
const PA_USERS = ['P&A Admin – Andrea Cruz', 'P&A Admin – Marco Villanueva', 'P&A User – Jessa Lim', 'P&A User – Paolo Santos'];
const COUNTRIES = ['Philippines', 'Australia', 'Singapore', 'United States of America', 'Japan', 'Hong Kong', 'Malaysia', 'Vietnam'];
const DATABASE_SYSTEMS = ['Core', 'HRM', 'Timekeeping', 'Payroll'];
const WIZARD_STEPS = ['Choose the Global Configuration', 'Set Up Initial Company Details', 'Services & Modules', 'Choose the Database'];

const statusOf = company => company.companyStatus || (['Cancelled', 'Completed'].includes(company.lifecycleStatus) || company.offboardingStatus === 'Completed' ? 'Inactive' : 'Active');
const servicesOf = company => company.microservices || ['Core', ...Object.entries(ENROLLMENT_FOR).filter(([, code]) => (company.serviceEnrollments || []).some(item => item.serviceCode === code && item.enabled)).map(([name]) => name)];
const csvLine = cells => cells.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',');

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) { if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = false; else cell += char; continue; }
    if (char === '"') quoted = true; else if (char === ',') { row.push(cell); cell = ''; } else if (char === '\n' || char === '\r') { if (char === '\r' && text[index + 1] === '\n') index += 1; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(line => line.some(value => value.trim()));
}

export function CompanyManagementScreen({ onBack, notify }) {
  const { actor } = useRole();
  const [companies, setCompanies] = useState(() => readCompanies());
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({});
  const [filterDraft, setFilterDraft] = useState(null);
  const [wizard, setWizard] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [configuring, setConfiguring] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const refresh = () => setCompanies(readCompanies());

  const rows = useMemo(() => companies.map(company => ({ company, code: company.companyCode, name: company.displayName || company.legalName, country: company.country || 'Philippines', status: statusOf(company), services: servicesOf(company).join(', '), database: Object.values(company.databases || {}).filter(Boolean).join(', ') || 'Default' })), [companies]);
  const filtered = rows.filter(row => (!query || `${row.code} ${row.name} ${row.country} ${row.services}`.toLowerCase().includes(query.toLowerCase()))
    && Object.entries(filters).every(([key, value]) => !value || String(row[key]).toLowerCase().includes(String(value).toLowerCase())));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);

  // The databases Settings ▸ Company Databases holds for that company (CoreAdditions.jsx).
  const databasesFor = companyId => { try { return JSON.parse(localStorage.getItem(`atlas-company-databases-${companyId}-v1`)) || []; } catch { return []; } };
  const openAdd = () => setWizard({ step: 0, country: '', companyCode: '', name: '', status: 'Active', microservices: ['Core'], databases: {} });
  const openEdit = company => setWizard({ step: 0, companyId: company.companyId, country: company.country || 'Philippines', companyCode: company.companyCode, name: company.displayName || company.legalName, status: statusOf(company), microservices: servicesOf(company), databases: { ...(company.databases || {}) } });

  const stepProblem = () => {
    if (wizard.step === 0 && !wizard.country) return 'Select Country is required.';
    if (wizard.step === 1) {
      const code = wizard.companyCode.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return 'Nexus Code must be exactly 6 letters or digits.';
      if (companies.some(company => company.companyId !== wizard.companyId && String(company.companyCode).toUpperCase() === code)) return 'Nexus Code is already used by another company.';
      if (!wizard.name.trim()) return 'Company Name is required.';
    }
    if (wizard.step === 2 && wizard.microservices.length === 0) return 'Tick at least one service.';
    return '';
  };
  const next = () => {
    const problem = stepProblem();
    if (problem) return notify({ type: 'error', message: problem });
    if (wizard.step < WIZARD_STEPS.length - 1) return setWizard({ ...wizard, step: wizard.step + 1 });
    return setConfirming(true);
  };
  const save = () => {
    const code = wizard.companyCode.trim().toUpperCase();
    const enrollmentsFrom = existing => {
      const byCode = Object.fromEntries((existing || []).map(item => [item.serviceCode, item]));
      Object.entries(ENROLLMENT_FOR).forEach(([name, serviceCode]) => { byCode[serviceCode] = { ...(byCode[serviceCode] || { serviceCode, name: serviceCode, status: 'Ready' }), enabled: wizard.microservices.includes(name) }; });
      return Object.values(byCode);
    };
    try {
      if (wizard.companyId) {
        const before = companies.find(company => company.companyId === wizard.companyId);
        saveCompany({ ...before, companyCode: code, legalName: before.legalName || wizard.name.trim(), displayName: wizard.name.trim(), country: wizard.country, companyStatus: wizard.status, microservices: wizard.microservices, serviceEnrollments: enrollmentsFrom(before.serviceEnrollments), databases: wizard.databases }, actor);
      } else {
        const { company } = createDraftCompany({ companyCode: code, legalName: wizard.name.trim(), displayName: wizard.name.trim(), tradeName: wizard.name.trim(), country: wizard.country, bankAccounts: [], authorizedContacts: [], signatories: [], serviceEnrollments: enrollmentsFrom([]) }, actor);
        saveCompany({ ...company, lifecycleStatus: wizard.status === 'Active' ? 'Active' : 'Draft', activationDate: wizard.status === 'Active' ? new Date().toISOString().slice(0, 10) : '', companyStatus: wizard.status, microservices: wizard.microservices, databases: wizard.databases }, actor);
      }
    } catch (error) { setConfirming(false); return notify({ type: 'error', message: error.message }); }
    refresh(); setConfirming(false); setWizard(null);
    return notify({ type: 'success', message: `Company ${wizard.companyId ? 'updated' : 'added'} successfully.` });
  };
  const saveConfiguration = () => {
    const before = companies.find(company => company.companyId === configuring.companyId);
    const users = configuring.users.filter(Boolean);
    if (new Set(users).size !== users.length) return notify({ type: 'error', message: 'A user can be assigned only once.' });
    saveCompany({ ...before, moduleConfiguration: configuring.modules, assignedUsers: users }, actor);
    appendAuditEvent({ companyId: before.companyId, actor, action: 'CompanyConfigured', entityType: 'Company', entityId: before.companyCode, summary: `${Object.values(configuring.modules).flat().length} module(s) enabled; ${users.length} user(s) assigned.` });
    refresh(); setConfiguring(null);
    return notify({ type: 'success', message: 'Company configuration saved.' });
  };
  const exportCsv = () => {
    downloadFile('companies.csv', [csvLine(['Code', 'Company Name', 'Country', 'Status', 'Services']), ...filtered.map(row => csvLine([row.code, row.name, row.country, row.status, row.services]))].join('\n'), 'text/csv');
    notify({ type: 'success', message: `${filtered.length} compan${filtered.length === 1 ? 'y' : 'ies'} exported.` });
  };
  const downloadTemplate = () => downloadFile('template-company.csv', `${csvLine(['Code', 'Company Name', 'Country', 'Status', 'Services'])}\n${csvLine(['ABC123', 'Sample Company', 'Philippines', 'Active', 'Core; Timekeeping; Payroll'])}\n`, 'text/csv');
  const upload = async file => {
    if (!file) return;
    const lines = parseCsv(await file.text());
    const [header, ...data] = lines;
    if (!header || header[0].trim().toLowerCase() !== 'code') return notify({ type: 'error', message: 'Use the company template: the first column must be Code.' });
    const problems = []; let added = 0;
    data.forEach((line, index) => {
      const [code, name, country, status, services] = line.map(value => value.trim());
      const rowNo = index + 2;
      if (!/^[A-Z0-9]{6}$/i.test(code)) return problems.push(`Row ${rowNo}: Code must be 6 letters or digits.`);
      if (!name) return problems.push(`Row ${rowNo}: Company Name is required.`);
      if (readCompanies().some(company => String(company.companyCode).toUpperCase() === code.toUpperCase())) return problems.push(`Row ${rowNo}: Code ${code} already exists.`);
      const chosen = ['Core', ...String(services || '').split(/[;|]/).map(value => value.trim()).filter(Boolean).map(value => MICROSERVICES.find(item => item.toLowerCase().includes(value.toLowerCase()))).filter(Boolean)];
      try {
        const { company } = createDraftCompany({ companyCode: code.toUpperCase(), legalName: name, displayName: name, tradeName: name, country: country || 'Philippines', bankAccounts: [], authorizedContacts: [], signatories: [], serviceEnrollments: Object.entries(ENROLLMENT_FOR).map(([label, serviceCode]) => ({ serviceCode, name: serviceCode, status: 'Ready', enabled: chosen.includes(label) })) }, actor);
        saveCompany({ ...company, companyStatus: status === 'Inactive' ? 'Inactive' : 'Active', microservices: [...new Set(chosen)] }, actor);
        added += 1;
      } catch (error) { problems.push(`Row ${rowNo}: ${error.message}`); }
      return undefined;
    });
    refresh();
    notify({ type: problems.length ? 'error' : 'success', message: `${added} compan${added === 1 ? 'y' : 'ies'} uploaded.${problems.length ? ` ${problems.length} row(s) skipped — ${problems.slice(0, 2).join(' ')}` : ''}` });
  };

  return <AtlasPage title="Company Management" breadcrumb="Settings / Company Onboarding" onBack={onBack} notify={notify}>
    <div className="config-toolbar atlas-toolbar">
      <div className="search-box"><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search..." /><MagnifyingGlass /></div>
      <button type="button" className="button secondary" onClick={() => setFilterDraft({ ...filters })}><Funnel /> Filter</button>
      <div className="toolbar-spacer" />
      <button type="button" className="button primary" onClick={openAdd}><Plus /> Add</button>
      <label className="button secondary"><UploadSimple /> Upload<input type="file" accept=".csv" hidden onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <button type="button" className="button secondary" title="Download template" aria-label="Download template" onClick={downloadTemplate}><FileCsv /></button>
      <button type="button" className="button secondary" onClick={exportCsv}><DownloadSimple /> Export</button>
    </div>
    <div className="table-card atlas-table"><table><thead><tr><th>Code</th><th>Company Name</th><th>Country</th><th>Status</th><th>Services</th><th>Action</th></tr></thead><tbody>
      {shown.map(row => <tr key={row.company.companyId}><td>{row.code}</td><td>{row.name}</td><td>{row.country}</td><td><span className={`status-pill ${row.status.toLowerCase()}`}>{row.status.toUpperCase()}</span></td><td>{row.services}</td><td className="atlas-menu-cell">
        <button type="button" className="icon-button" aria-label={`Actions for ${row.name}`} onClick={() => setMenuFor(menuFor === row.company.companyId ? null : row.company.companyId)}><DotsThreeVertical /></button>
        {menuFor === row.company.companyId && <div className="atlas-row-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setMenuFor(null); setConfiguring({ companyId: row.company.companyId, name: row.name, services: servicesOf(row.company), modules: row.company.moduleConfiguration || Object.fromEntries(servicesOf(row.company).map(service => [service, MODULES[service] || []])), users: row.company.assignedUsers?.length ? [...row.company.assignedUsers] : [''], open: servicesOf(row.company)[0] }); }}>Configure</button><button type="button" role="menuitem" onClick={() => { setMenuFor(null); openEdit(row.company); }}>Edit</button></div>}
      </td></tr>)}
      {!shown.length && <tr><td colSpan={6}><div className="empty-state compact"><h3>No data found.</h3></div></td></tr>}
    </tbody></table></div>
    <div className="pagination"><span>Display <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 50, 100].map(size => <option key={size}>{size}</option>)}</select> items · {filtered.length} items</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><strong>{Math.min(page, pageCount)}</strong><span>of {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage(page + 1)}>›</button></div></div>

    {filterDraft && <FormDialog title="Filter" fields={[{ key: 'code', label: 'Code', placeholder: 'Input company code' }, { key: 'name', label: 'Company Name', placeholder: 'Input company name' }, { key: 'country', label: 'Country', type: 'select', options: COUNTRIES }, { key: 'database', label: 'Database' }, { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] }, { key: 'services', label: 'Services', type: 'select', options: MICROSERVICES }]} draft={filterDraft} setDraft={setFilterDraft} onClose={() => setFilterDraft(null)} submitLabel="Apply Filter" onSubmit={() => { setFilters(filterDraft); setPage(1); setFilterDraft(null); }} />}

    {wizard && <div className="modal-backdrop"><section className="modal canonical-modal atlas-dialog wide" role="dialog" aria-modal="true" aria-label={wizard.companyId ? 'Edit Company' : 'Add Company'}>
      <header><h2>{wizard.companyId ? 'Edit Company' : 'Add Company'}</h2><button type="button" className="icon-button" onClick={() => setWizard(null)} aria-label="Close"><X /></button></header>
      <ol className="atlas-stepper">{WIZARD_STEPS.map((label, index) => <li key={label} className={index === wizard.step ? 'current' : index < wizard.step ? 'done' : ''}>{label}</li>)}</ol>
      <div className="canonical-form-grid">
        {wizard.step === 0 && <label className="atlas-wide"><span>Select Country<span className="required">*</span></span><select value={wizard.country} onChange={event => setWizard({ ...wizard, country: event.target.value })}><option value="">Please select</option>{COUNTRIES.map(country => <option key={country}>{country}</option>)}</select></label>}
        {wizard.step === 1 && <>
          <label><span>Nexus Code<span className="required">*</span></span><input value={wizard.companyCode} maxLength={6} placeholder="XXXXXX" onChange={event => setWizard({ ...wizard, companyCode: event.target.value.toUpperCase() })} /><small>Put unique company code from Nexus</small></label>
          <label><span>Company Name<span className="required">*</span></span><input value={wizard.name} maxLength={150} placeholder="Input Company Name" onChange={event => setWizard({ ...wizard, name: event.target.value })} /></label>
          <label><span>Status<span className="required">*</span></span><select value={wizard.status} onChange={event => setWizard({ ...wizard, status: event.target.value })}><option>Active</option><option>Inactive</option></select></label>
        </>}
        {wizard.step === 2 && <div className="atlas-wide"><p className="page-description">Please tick all the services you wish to add.</p><div className="atlas-service-list">{MICROSERVICES.map(service => <label key={service} className="atlas-check"><input type="checkbox" disabled={ALWAYS_ON.includes(service)} checked={wizard.microservices.includes(service)} onChange={event => setWizard({ ...wizard, microservices: event.target.checked ? [...wizard.microservices, service] : wizard.microservices.filter(item => item !== service) })} /> {service}</label>)}</div></div>}
        {wizard.step === 3 && <div className="atlas-wide"><p className="page-description">Optional: pick a dedicated database per system from what's configured in Settings ▸ Company Databases. Leave a system as "Default" to keep it on the shared database.</p>{DATABASE_SYSTEMS.map(system => { const options = (wizard.companyId ? databasesFor(wizard.companyId) : []).filter(row => row.system === system); return <label key={system}><span>{system}</span><select value={wizard.databases[system] || ''} onChange={event => setWizard({ ...wizard, databases: { ...wizard.databases, [system]: event.target.value } })}><option value="">Default (no dedicated database)</option>{options.map(option => <option key={option.id} value={option.databaseName}>{option.databaseName}{option.active ? ' (current)' : ''}</option>)}</select>{!options.length && <small>No databases configured yet for this system — add one in Settings ▸ Company Databases{wizard.companyId ? '.' : ' after the company is saved.'}</small>}</label>; })}</div>}
      </div>
      <footer className="modal-actions">{wizard.step > 0 && <button type="button" className="button secondary" onClick={() => setWizard({ ...wizard, step: wizard.step - 1 })}>Back</button>}<button type="button" className="button secondary" onClick={() => setWizard(null)}>Cancel</button><button type="button" className="button primary" onClick={next}>{wizard.step < WIZARD_STEPS.length - 1 ? 'Next' : 'Save'}</button></footer>
    </section></div>}
    {confirming && <div className="modal-backdrop"><section className="modal canonical-modal atlas-dialog" role="alertdialog" aria-label="Save Configuration"><header><h2>Save Configuration</h2></header><div className="modal-body"><p>Save {wizard.name.trim() || 'this company'} ({wizard.companyCode.trim().toUpperCase()}) with {wizard.microservices.length} service(s)?</p></div><footer className="modal-actions"><button type="button" className="button secondary" onClick={() => setConfirming(false)}>No</button><button type="button" className="button primary" onClick={save}>Yes</button></footer></section></div>}

    {configuring && <div className="modal-backdrop"><section className="modal canonical-modal atlas-dialog wide" role="dialog" aria-modal="true" aria-label="Configure Company">
      <header><h2>Configure {configuring.name}</h2><button type="button" className="icon-button" onClick={() => setConfiguring(null)} aria-label="Close"><X /></button></header>
      <div className="modal-body">
        <h3>Configure Features</h3>
        {configuring.services.map(service => <div key={service} className="atlas-accordion">
          <button type="button" className="atlas-accordion-head" onClick={() => setConfiguring({ ...configuring, open: configuring.open === service ? '' : service })}><span>{service}</span><small>{(configuring.modules[service] || []).length} of {(MODULES[service] || []).length} modules</small></button>
          {configuring.open === service && <div className="atlas-accordion-body"><h4>Select Modules</h4><div className="atlas-module-grid">{(MODULES[service] || []).map(module => { const on = (configuring.modules[service] || []).includes(module); return <label key={module} className="atlas-switch-row"><span>{module}</span><input type="checkbox" role="switch" checked={on} onChange={() => setConfiguring({ ...configuring, modules: { ...configuring.modules, [service]: on ? configuring.modules[service].filter(item => item !== module) : [...(configuring.modules[service] || []), module] } })} /></label>; })}</div></div>}
        </div>)}
        <h3>Assign Users</h3>
        {configuring.users.map((user, index) => <div key={index} className="atlas-assign-row"><select value={user} onChange={event => setConfiguring({ ...configuring, users: configuring.users.map((item, position) => position === index ? event.target.value : item) })}><option value="">Please select</option>{PA_USERS.filter(option => option === user || !configuring.users.includes(option)).map(option => <option key={option}>{option}</option>)}</select><button type="button" className="button secondary" onClick={() => setConfiguring({ ...configuring, users: configuring.users.filter((_, position) => position !== index) })}>Remove</button></div>)}
        <button type="button" className="atlas-link-button" onClick={() => setConfiguring({ ...configuring, users: [...configuring.users, ''] })}><Plus /> Add More Users</button>
      </div>
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={() => setConfiguring(null)}>Back</button><button type="button" className="button primary" onClick={saveConfiguration}>Save</button></footer>
    </section></div>}
  </AtlasPage>;
}

/* --------------------------------------------- Ticketing configuration */

export const TICKET_CONFIG_KEY = 'atlas-core-ticket-config-v1';
const emailList = value => String(value || '').split(/[,;\s]+/).map(item => item.trim()).filter(Boolean);
export const ticketingConfiguration = {
  title: 'Ticketing Configuration', singular: 'Help Topic', storageKey: TICKET_CONFIG_KEY, uniqueKey: 'name',
  columns: [{ key: 'name', label: 'Help Topic' }, { key: 'emails', label: 'Assigned E-mails', render: row => emailList(row.emails).join(', ') || '—' }, { key: 'severity', label: 'Severity' }],
  fields: [{ key: 'name', label: 'Help Topic Name', required: true, placeholder: 'Enter topic name' }, { key: 'emails', label: 'Assigned E-mail', type: 'textarea', required: true, placeholder: 'Input email (one or more, separated by commas)' }, { key: 'severity', label: 'Severity Level', type: 'select', required: true, options: ['Critical', 'High', 'Medium', 'Low'] }],
  filters: ['name', 'emails', 'severity'],
  validate: draft => emailList(draft.emails).find(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ? 'Every assigned e-mail must be a valid email address.' : '',
  seed: [
    { id: 'ht-1', name: 'Access concerns', emails: 'helpdesk@pna.example, it.support@pna.example', severity: 'High' },
    { id: 'ht-2', name: 'Payroll concern', emails: 'payroll@pna.example', severity: 'Medium' },
    { id: 'ht-3', name: 'Security', emails: 'security@pna.example', severity: 'Critical' },
  ],
};
export const TicketingConfigurationScreen = props => <AtlasPage {...props} title="Ticketing Configuration" breadcrumb="Settings / Ticketing Configuration" description="Help topics employees choose when filing a ticket, and who receives each one." tabs={[{ key: 'topics', label: 'Ticketing Configuration', definition: ticketingConfiguration }]} companyId="global" />;

/* ---------------------------------------------- Overtime configuration */

const yesNo = ['Yes', 'No'];
const rate = (key, label) => ({ key, label, type: 'number', min: 0, step: '0.01', placeholder: 'rate' });
export const overtimeConfiguration = {
  title: 'Overtime Configuration', singular: 'Overtime Details', storageKey: 'atlas-settings-ot-config-v1', uniqueKey: 'code', wideForm: true,
  columns: [{ key: 'code', label: 'Overtime Code' }, { key: 'name', label: 'Overtime Name' }, { key: 'description', label: 'Description' }, { key: 'dayType', label: 'Type of Day' }, { key: 'holidayType', label: 'Holiday Type' }, { key: 'status', label: 'Status', type: 'status' }, { key: 'effectiveDate', label: 'Effectivity Date', type: 'date' }, { key: 'preShift', label: 'Pre-shift Rate' }, { key: 'regular', label: 'Regular Overtime Rate' }, { key: 'nd', label: 'Night Shift Differential Rate' }, { key: 'regularNd', label: 'Regular overtime with Night Shift Differential Rate' }, { key: 'firstHours', label: '1st hours' }, { key: 'firstRate', label: 'Rate' }, { key: 'firstNd', label: '1st hours with night shift differential' }, { key: 'excess', label: 'In excess of hours' }, { key: 'excessNd', label: 'In excess of hours with Night shift differential' }, { key: 'special', label: 'Special Case Rate' }, { key: 'ndCondition', label: 'Night differential condition', render: row => row.ndStart && row.ndEnd ? `${row.ndStart} – ${row.ndEnd}` : '—' }],
  fields: [{ key: 'code', label: 'Overtime Code', required: true, lockedOnEdit: true }, { key: 'name', label: 'Overtime Name', required: true }, { key: 'description', label: 'Description', type: 'textarea' }, { key: 'dayType', label: 'Type of Day', type: 'select', required: true, options: ['Regular Day', 'Rest Day', 'Holiday', 'Holiday on Rest Day'] }, { key: 'holidayType', label: 'Holiday Type', type: 'select', options: ['Regular Holiday', 'Special Holiday', 'Double Holiday'], showIf: draft => String(draft.dayType || '').startsWith('Holiday') }, { key: 'workStatus', label: 'Work Status', type: 'select', options: ['Worked', 'Unworked'], default: 'Worked' }, rate('preShift', 'Pre-shift Rate'), rate('regular', 'Regular Overtime Rate'), rate('nd', 'Night Shift Differential Rate'), rate('regularNd', 'Regular overtime with Night Shift Differential Rate'), { key: 'firstHours', label: '1st hours', type: 'number', min: 0, max: 24, placeholder: 'hrs' }, rate('firstRate', 'Rate for the 1st hours'), rate('firstNd', '1st hours with night shift differential'), rate('excess', 'In excess of hours'), rate('excessNd', 'In excess of hours with Night shift differential'), rate('special', 'Special case rate'), { key: 'ndStart', label: 'Night Differential Start Time', type: 'time', default: '22:00' }, { key: 'ndEnd', label: 'Night Differential End Time', type: 'time', default: '06:00' }, { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true }, { key: 'status', label: 'Status', type: 'select', required: true, options: ['Active', 'Inactive'], default: 'Active' }],
  filters: ['code', 'name', 'dayType', 'holidayType', 'effectiveDate', 'status'],
  validate: draft => !['preShift', 'regular', 'firstRate', 'excess', 'special'].some(key => draft[key] !== '' && draft[key] != null) ? 'Enter at least one overtime rate.' : '',
  seed: [
    { id: 'otc-1', code: 'OT-REG', name: 'Regular Day Overtime', dayType: 'Regular Day', workStatus: 'Worked', regular: '1.25', nd: '0.10', regularNd: '1.375', firstHours: '8', firstRate: '1.00', excess: '1.25', excessNd: '1.375', ndStart: '22:00', ndEnd: '06:00', effectiveDate: '2026-01-01', status: 'Active' },
    { id: 'otc-2', code: 'OT-RD', name: 'Rest Day Overtime', dayType: 'Rest Day', workStatus: 'Worked', regular: '1.30', nd: '0.10', firstHours: '8', firstRate: '1.30', excess: '1.69', excessNd: '1.859', ndStart: '22:00', ndEnd: '06:00', effectiveDate: '2026-01-01', status: 'Active' },
    { id: 'otc-3', code: 'OT-RH', name: 'Regular Holiday Overtime', dayType: 'Holiday', holidayType: 'Regular Holiday', workStatus: 'Worked', regular: '2.00', nd: '0.10', firstHours: '8', firstRate: '2.00', excess: '2.60', excessNd: '2.86', ndStart: '22:00', ndEnd: '06:00', effectiveDate: '2026-01-01', status: 'Active' },
  ],
};
export const OvertimeConfigurationScreen = props => <AtlasPage {...props} title="Overtime Configuration" breadcrumb="Settings / Overtime Configuration" description="The standard overtime rates P&A maintains. Companies set their own in Company Information ▸ Services Information ▸ Overtime." tabs={[{ key: 'overtime', label: 'Overtime Configuration', definition: overtimeConfiguration }]} companyId="global" />;
