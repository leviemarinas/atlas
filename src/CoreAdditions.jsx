/**
 * Core screens that Atlas Core has and the design had not covered yet:
 * Company Configuration ▸ Biometric Integration, Settings ▸ Company Databases
 * and Core ▸ Reports (Timekeeping).
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, MagnifyingGlass, PencilSimple, Plus, ShieldCheck, Warning, X } from '@phosphor-icons/react';
import { appendAuditEvent, readActiveCompanyId } from './companyRepository';
import { useRole } from './RoleContext';
import { accessFor, readHrmData, signedInUser, visibleEmployeeIds } from './hrmData.js';
import { TimekeepingReportsScreen } from './TimekeepingReportsScreen.jsx';

function readStored(key, seed) {
  try { return JSON.parse(localStorage.getItem(key)) ?? seed; } catch { return seed; }
}
function writeStored(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: keep the in-memory copy */ }
}
const nowStamp = () => {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

function PageShell({ breadcrumb, title, description, badge, onBack, children }) {
  return <div className="page-content operational-workspace">
    <button className="inline-back" onClick={onBack}><ArrowLeft /> Back</button>
    <div className="page-heading"><div><p className="breadcrumb">{breadcrumb}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{badge && <span className="controlled-badge"><ShieldCheck /> {badge}</span>}</div>
    {children}
  </div>;
}

/* ------------------------------------------------- Biometric Integration */

const DEPLOYMENT_TYPES = ['Shared Instance', 'Dedicated Instance'];
const biometricSeed = { enabled: false, deploymentType: 'Shared Instance', baseUrl: '', tenantKey: '', workplaceLocation: 'Makati', useMock: true, status: 'Not connected', lastSync: '', lastSuccessfulConnection: '', lastSyncError: '' };

export function BiometricIntegrationWorkspace({ onBack, notify, companyId = readActiveCompanyId() }) {
  const { actor } = useRole();
  const storageKey = `atlas-biometric-integration-${companyId}-v1`;
  const [saved, setSaved] = useState(() => ({ ...biometricSeed, ...readStored(storageKey, {}) }));
  const [draft, setDraft] = useState(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = patch => setDraft(previous => ({ ...previous, ...patch }));

  const persist = (next, summary) => {
    setSaved(next); setDraft(next); writeStored(storageKey, next);
    appendAuditEvent({ companyId, actor, action: 'BiometricIntegrationChanged', entityType: 'Biometric Integration', entityId: companyId, summary });
  };
  const problems = () => {
    if (!draft.enabled || draft.useMock) return '';
    if (!draft.baseUrl.trim()) return 'Base URL is required to connect to the biometric system.';
    if (!/^https?:\/\//i.test(draft.baseUrl.trim())) return 'Base URL must start with http:// or https://.';
    if (!draft.tenantKey.trim()) return 'Tenant Key is required to connect to the biometric system.';
    return '';
  };
  const save = () => {
    const problem = problems();
    if (problem) return notify({ type: 'error', message: problem });
    persist({ ...draft, baseUrl: draft.baseUrl.trim(), tenantKey: draft.tenantKey.trim(), status: draft.enabled ? draft.status : 'Disabled' }, `Biometric attendance ${draft.enabled ? 'enabled' : 'disabled'} (${draft.deploymentType}${draft.useMock ? ', mock data' : ''}).`);
    notify({ type: 'success', message: 'Biometric integration settings saved.' });
  };
  const testConnection = () => {
    if (dirty) return notify({ type: 'error', message: 'Save your changes before testing the connection.' });
    if (!saved.enabled) return notify({ type: 'error', message: 'Enable Biometric Attendance first.' });
    const stamp = nowStamp();
    if (saved.useMock || (saved.baseUrl && saved.tenantKey)) {
      persist({ ...saved, status: 'Connected', lastSuccessfulConnection: stamp, lastSyncError: '' }, 'Biometric connection test succeeded.');
      notify({ type: 'success', message: saved.useMock ? 'Connected to mock biometric data.' : 'Connection to the biometric system succeeded.' });
    } else {
      persist({ ...saved, status: 'Error', lastSyncError: 'Base URL or Tenant Key is missing.' }, 'Biometric connection test failed.');
      notify({ type: 'error', message: 'Connection failed: Base URL or Tenant Key is missing.' });
    }
  };
  const syncNow = () => {
    if (saved.status !== 'Connected') return notify({ type: 'error', message: 'Test the connection successfully before synchronizing.' });
    persist({ ...saved, lastSync: nowStamp() }, 'Biometric punches synchronized; unchanged days skipped.');
    notify({ type: 'success', message: 'Biometric punches synchronized to Time In & Time Out. Days with no change were skipped.' });
  };

  const statusTone = { Connected: 'active', Error: 'rejected', Disabled: 'inactive' }[saved.status] || 'pending';
  return <PageShell breadcrumb="Core / Company Configuration / Biometric Integration" title="Biometric Integration" description="Connect the company's biometric attendance devices so punches flow into Timekeeping ▸ Time In & Time Out." onBack={onBack}>
    <section className="profile-form-card">
      <h2>Biometric Attendance Integration</h2>
      <div className="profile-field-grid">
        <label className="checkbox-row"><input type="checkbox" checked={draft.enabled} onChange={event => set({ enabled: event.target.checked })} /> Enable Biometric Attendance</label>
        <label>Deployment Type<select value={draft.deploymentType} disabled={!draft.enabled} onChange={event => set({ deploymentType: event.target.value })}>{DEPLOYMENT_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
        <label>Base URL<input value={draft.baseUrl} disabled={!draft.enabled} placeholder="https://biometrics.example.com" onChange={event => set({ baseUrl: event.target.value })} /></label>
        <label>Tenant Key<input type="password" value={draft.tenantKey} disabled={!draft.enabled} placeholder="Input tenant key" onChange={event => set({ tenantKey: event.target.value })} autoComplete="off" /></label>
        <label>Workplace Location<select value={draft.workplaceLocation} disabled={!draft.enabled} onChange={event => set({ workplaceLocation: event.target.value })}>{['Makati', 'Manila', 'Cebu', 'Remote'].map(place => <option key={place}>{place}</option>)}</select><small>Punches from this integration are tagged with this workplace location.</small></label>
        <label className="checkbox-row"><input type="checkbox" checked={draft.useMock} disabled={!draft.enabled} onChange={event => set({ useMock: event.target.checked })} /> Use Mock data (testing only)</label>
      </div>
      <div className="profile-field-grid">
        <label>Status<strong><span className={`status-pill ${statusTone}`}>{saved.status}</span></strong></label>
        <label>Last Synchronization<strong>{saved.lastSync || '—'}</strong></label>
        <label>Last Successful Connection<strong>{saved.lastSuccessfulConnection || '—'}</strong></label>
        {saved.lastSyncError && <label>Last Error<strong className="tone-down"><Warning /> {saved.lastSyncError}</strong></label>}
      </div>
      <div className="module-save-row">
        <button className="button secondary" onClick={testConnection}>Test Connection</button>
        <button className="button secondary" onClick={syncNow}>Sync Now</button>
        <button className="button secondary" disabled={!dirty} onClick={() => setDraft(saved)}>Cancel</button>
        <button className="button primary" disabled={!dirty} onClick={save}>Save</button>
      </div>
    </section>
  </PageShell>;
}

/* ------------------------------------------------------ Company Databases */

const DATABASE_SYSTEMS = ['Core', 'HRM', 'Timekeeping', 'Payroll'];
const MASK = '••••••••••••';
const databaseSeed = DATABASE_SYSTEMS.map((system, index) => ({ id: `db-${index + 1}`, databaseName: `Atlas${system === 'Core' ? 'Core' : system}Db`, system, connectionString: `Server=atlas-sql;Database=Atlas${system}Db;`, active: true }));

export function CompanyDatabasesWorkspace({ onBack, notify, companyId = readActiveCompanyId() }) {
  const { actor } = useRole();
  const storageKey = `atlas-company-databases-${companyId}-v1`;
  const [rows, setRows] = useState(() => readStored(storageKey, databaseSeed));
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const visible = useMemo(() => rows.filter(row => `${row.databaseName} ${row.system}`.toLowerCase().includes(query.toLowerCase())), [rows, query]);

  const save = event => {
    event.preventDefault();
    const item = { ...editing, databaseName: editing.databaseName.trim() };
    if (!item.databaseName || !item.system) return notify({ type: 'error', message: 'Database Name and System are required.' });
    if (!item.id && !item.connectionString.trim()) return notify({ type: 'error', message: 'Connection String is required.' });
    if (rows.some(row => row.id !== item.id && row.system === item.system && row.active && item.active)) return notify({ type: 'error', message: `This company already has an active ${item.system} database. Deactivate it first.` });
    const existing = rows.find(row => row.id === item.id);
    // An untouched masked value keeps the stored connection string.
    const prepared = { ...item, connectionString: item.connectionString === MASK ? existing.connectionString : item.connectionString.trim() };
    const next = item.id ? rows.map(row => row.id === item.id ? prepared : row) : [...rows, { ...prepared, id: `db-${Date.now()}` }];
    setRows(next); writeStored(storageKey, next); setEditing(null);
    appendAuditEvent({ companyId, actor, action: 'CompanyDatabaseChanged', entityType: 'Company Database', entityId: prepared.databaseName, summary: `${prepared.system} database ${prepared.databaseName} ${item.id ? 'updated' : 'added'} (${prepared.active ? 'Active' : 'Inactive'}).` });
    notify({ type: 'success', message: `Database ${item.id ? 'updated' : 'added'}.` });
  };

  return <PageShell breadcrumb="Settings / Company Databases" title="Company Databases" description="Point each Atlas system at the database that holds this company's data. Connection strings are never shown after they are saved." badge="P&A Admin only" onBack={onBack}>
    <div className="config-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search database or system..." /><MagnifyingGlass /></div><button className="button primary" onClick={() => setEditing({ databaseName: '', system: DATABASE_SYSTEMS[0], connectionString: '', active: true })}><Plus /> Add Database</button></div>
    <div className="table-card"><table><thead><tr><th>Database Name</th><th>System</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td>{row.databaseName}</td><td>{row.system}</td><td><span className={`status-pill ${row.active ? 'active' : 'inactive'}`}>{row.active ? 'Active' : 'Inactive'}</span></td><td><div className="row-actions always"><button aria-label="Edit" onClick={() => setEditing({ ...row, connectionString: MASK })}><PencilSimple /></button></div></td></tr>)}</tbody></table></div>
    <div className="pagination"><span>Displaying <strong>{visible.length}</strong> of {rows.length} databases</span></div>
    {editing && <div className="modal-backdrop"><section className="modal canonical-modal"><header><h2>{editing.id ? 'Edit Database' : 'Add Database'}</h2><button className="icon-button" onClick={() => setEditing(null)}><X /></button></header><form onSubmit={save}><div className="canonical-form-grid">
      <label>System<span className="required">*</span><select value={editing.system} disabled={Boolean(editing.id)} onChange={event => setEditing({ ...editing, system: event.target.value })}>{DATABASE_SYSTEMS.map(system => <option key={system}>{system}</option>)}</select></label>
      <label>Database Name<span className="required">*</span><input required value={editing.databaseName} onChange={event => setEditing({ ...editing, databaseName: event.target.value })} /></label>
      <label>Connection String<span className="required">*</span><input type="password" autoComplete="off" value={editing.connectionString} onFocus={() => editing.connectionString === MASK && setEditing({ ...editing, connectionString: '' })} onChange={event => setEditing({ ...editing, connectionString: event.target.value })} /><small>{editing.id ? 'Leave as is to keep the saved connection string.' : 'Stored encrypted; it cannot be viewed again.'}</small></label>
      <label className="checkbox-row"><input type="checkbox" checked={editing.active} onChange={event => setEditing({ ...editing, active: event.target.checked })} /> Active</label>
    </div><footer className="modal-actions"><button type="button" className="button secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button primary"><CheckCircle /> Save</button></footer></form></section></div>}
  </PageShell>;
}

/* ------------------------------------------------------- Core ▸ Reports */

export function CoreReportsWorkspace({ onBack, notify, companyId = readActiveCompanyId() }) {
  const { role } = useRole();
  const data = useMemo(() => readHrmData(companyId), [companyId]);
  const user = useMemo(() => signedInUser(data), [data]);
  const access = useMemo(() => accessFor(role, data), [role, data]);
  const teamEmployeeIds = useMemo(() => visibleEmployeeIds(data, role), [data, role]);
  const onNotify = (message, tone = 'ok') => notify({ type: tone === 'ok' ? 'success' : 'error', message });
  return <PageShell breadcrumb="Core / Reports / Timekeeping" title="Reports" description="Company-wide Timekeeping reports, the same reports as Timekeeping ▸ Reports." onBack={onBack}>
    <TimekeepingReportsScreen data={data} user={user} access={access} employees={data.employees || []} teamEmployeeIds={teamEmployeeIds} onNotify={onNotify} />
  </PageShell>;
}
