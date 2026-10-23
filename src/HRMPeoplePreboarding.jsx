/**
 * HRM ▸ People Preboarding for administrators, as in Atlas Core: applicant
 * profiles before hire. Each profile is sent onboarding documents (from Core ▸
 * Company Configuration ▸ People Preboarding ▸ Document) to accept and a
 * checklist (▸ Onboarding Checklist) to complete. Acceptance Status follows the
 * applicant's answers; HR marks a fully accepted profile Completed, or archives it.
 */
import { useState } from 'react';
import { CheckCircle, Circle, UserPlus } from '@phosphor-icons/react';
import { DataTable, EmptyState, ExportMenu, Field, GhostButton, Modal, PageHeading, PrimaryButton, SearchInput, StatusTabs, formatDate, paginate, useTableState } from './HRMKit.jsx';
import { createHrmId } from './hrmData.js';
import { readActiveCompanyId } from './companyRepository.js';
import { downloadFile } from './fileDownload.js';

const STATUS_TABS = ['All', 'Pending', 'Accepted', 'Completed', 'Rejected'];

function readCoreRows(key, fallback) {
  try { const rows = JSON.parse(localStorage.getItem(`${key}:${readActiveCompanyId()}`)); return Array.isArray(rows) ? rows : fallback; } catch { return fallback; }
}
const onboardingDocuments = () => readCoreRows('atlas-core-onboarding-docs-v1', [{ id: 'od-1', documentId: 'ONB-DOC-0001', title: 'Job Offer – Software Engineer', status: 'Active' }]).filter(row => row.status !== 'Inactive');
const checklistItems = () => readCoreRows('atlas-core-onboarding-checklist-v1', [{ id: 'oc-1', title: 'NBI Clearance', requiredUpload: 'Yes' }, { id: 'oc-2', title: 'Pre-employment Medical Result', requiredUpload: 'Yes' }, { id: 'oc-3', title: 'TIN / SSS / PhilHealth / HDMF numbers', requiredUpload: 'No' }]);

/** Acceptance follows the applicant's answers to every document; Completed is HR's decision. */
export function acceptanceStatus(profile) {
  if (profile.completed) return 'Completed';
  const answers = profile.documents.map(doc => doc.response);
  if (answers.includes('Rejected')) return 'Rejected';
  if (answers.length && answers.every(answer => answer === 'Accepted')) return 'Accepted';
  return 'Pending';
}
const checklistDone = profile => profile.checklist.filter(item => item.submitted).length;

const seedProfiles = () => {
  const docs = onboardingDocuments().slice(0, 1);
  const items = checklistItems();
  const make = (index, first, last, email, response, submitted, extra = {}) => ({ id: `pp-seed-${index}`, applicantCode: `APP-2026-${String(index).padStart(4, '0')}`, firstName: first, middleName: '', lastName: last, suffix: '', contactNumber: `+63 917 555 ${String(1000 + index)}`, email, birthday: `199${index}-0${index}-1${index}`, documents: docs.map(doc => ({ documentId: doc.documentId, title: doc.title, response })), checklist: items.map((item, position) => ({ id: item.id, title: item.title, requiredUpload: item.requiredUpload, submitted: position < submitted, fileName: position < submitted ? `${item.title.replace(/\W+/g, '_')}.pdf` : '' })), archived: false, completed: false, createdAt: '2026-10-01', ...extra });
  return [
    make(1, 'Bianca', 'Reyes', 'bianca.reyes@mail.example', 'Accepted', items.length),
    make(2, 'Carlo', 'Mendoza', 'carlo.mendoza@mail.example', '', 1),
    make(3, 'Dana', 'Lim', 'dana.lim@mail.example', 'Rejected', 0),
    make(4, 'Enzo', 'Garcia', 'enzo.garcia@mail.example', 'Accepted', items.length, { completed: true, employeeCode: '0000112360' }),
    make(5, 'Faye', 'Tan', 'faye.tan@mail.example', '', 0, { archived: true }),
  ];
};

export function PeoplePreboardingWorkspace({ data, setData, onBack, onNotify }) {
  const profiles = data.preboardingProfiles ?? seedProfiles();
  const save = next => setData(current => ({ ...current, preboardingProfiles: next }));
  const [view, setView] = useState('active');
  const [statusTab, setStatusTab] = useState('All');
  const table = useTableState();
  const [adding, setAdding] = useState(null);
  const [errors, setErrors] = useState({});
  const [viewing, setViewing] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const active = profiles.filter(profile => !profile.archived);
  const archived = profiles.filter(profile => profile.archived);
  const counts = Object.fromEntries(STATUS_TABS.map(tab => [tab, tab === 'All' ? active.length : active.filter(profile => acceptanceStatus(profile) === tab).length]));
  const term = table.search.toLowerCase();
  const matches = profile => !term || `${profile.applicantCode} ${profile.firstName} ${profile.lastName} ${profile.email}`.toLowerCase().includes(term);
  const rows = (view === 'archive' ? archived : active.filter(profile => statusTab === 'All' || acceptanceStatus(profile) === statusTab)).filter(matches);

  const update = (id, patch) => save(profiles.map(profile => profile.id === id ? { ...profile, ...patch } : profile));
  const viewingProfile = viewing ? profiles.find(profile => profile.id === viewing) : null;

  const submitAdd = () => {
    const problems = {};
    ['firstName', 'lastName', 'contactNumber', 'email', 'birthday'].forEach(key => { if (!String(adding[key] || '').trim()) problems[key] = 'Required.'; });
    if (adding.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adding.email)) problems.email = 'Enter a valid e-mail.';
    if (profiles.some(profile => profile.email.toLowerCase() === String(adding.email || '').toLowerCase())) problems.email = 'This e-mail already has a preboarding profile.';
    if (!adding.documentIds.length) problems.documents = 'Choose at least one onboarding document.';
    if (!adding.checklistIds.length) problems.checklist = 'Assign at least one checklist item.';
    setErrors(problems);
    if (Object.keys(problems).length) return;
    const docs = onboardingDocuments().filter(doc => adding.documentIds.includes(doc.documentId));
    const items = checklistItems().filter(item => adding.checklistIds.includes(item.id));
    const next = { id: createHrmId('preboard'), applicantCode: `APP-${new Date().getFullYear()}-${String(profiles.length + 1).padStart(4, '0')}`, firstName: adding.firstName.trim(), middleName: (adding.middleName || '').trim(), lastName: adding.lastName.trim(), suffix: (adding.suffix || '').trim(), contactNumber: adding.contactNumber.trim(), email: adding.email.trim(), birthday: adding.birthday, documents: docs.map(doc => ({ documentId: doc.documentId, title: doc.title, response: '' })), checklist: items.map(item => ({ id: item.id, title: item.title, requiredUpload: item.requiredUpload, submitted: false, fileName: '' })), archived: false, completed: false, createdAt: new Date().toISOString().slice(0, 10) };
    save([next, ...profiles]);
    setAdding(null);
    onNotify(`Preboarding profile added. ${docs.length} document(s) sent to ${next.email} to accept.`);
  };
  const markComplete = profile => {
    if (acceptanceStatus(profile) !== 'Accepted') return onNotify('Only a profile whose documents are all accepted can be completed.', 'bad');
    if (profile.checklist.some(item => item.requiredUpload === 'Yes' && !item.submitted)) return onNotify('The applicant has not submitted every required checklist file yet.', 'bad');
    update(profile.id, { completed: true, completedAt: new Date().toISOString().slice(0, 10) });
    return onNotify(`${profile.firstName} ${profile.lastName} marked Completed.`);
  };
  const exportRows = format => {
    if (format !== 'Excel') return onNotify('Preboarding exports to Excel only.', 'bad');
    const header = ['Applicant Code', 'First Name', 'Middle Name', 'Last Name', 'Suffix', 'Contact Number', 'Email', 'Birthday', 'Acceptance Status'];
    downloadFile('people-preboarding.csv', [header, ...rows.map(profile => [profile.applicantCode, profile.firstName, profile.middleName, profile.lastName, profile.suffix, profile.contactNumber, profile.email, profile.birthday, acceptanceStatus(profile)])].map(line => line.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
    return onNotify(`${rows.length} profile(s) exported.`);
  };

  const activeColumns = [{ key: 'applicantCode', label: 'Applicant Code' }, { key: 'firstName', label: 'First Name' }, { key: 'middleName', label: 'Middle Name' }, { key: 'lastName', label: 'Last Name' }, { key: 'suffix', label: 'Suffix' }, { key: 'contactNumber', label: 'Contact Number' }, { key: 'email', label: 'Email' }, { key: 'birthday', label: 'BirthDay', type: 'date' }, { key: 'acceptance', label: 'Acceptance Status' }];
  const archiveColumns = [{ key: 'applicantCode', label: 'Employee Code' }, { key: 'firstName', label: 'First Name' }, { key: 'middleName', label: 'Middle Name' }, { key: 'lastName', label: 'Last Name' }, { key: 'suffix', label: 'Suffix' }, { key: 'birthday', label: 'Date of Birth', type: 'date' }, { key: 'contactNumber', label: 'Contact Number' }, { key: 'email', label: 'Email' }];
  const trackerColumns = [{ key: 'profile', label: 'Profile' }, { key: 'name', label: 'Employee Name' }, { key: 'applicantCode', label: 'Employee Code' }, { key: 'completion', label: 'Completion Status' }, { key: 'acceptance', label: 'Status' }];

  return <div className="hrm-workspace">
    <PageHeading title="People Preboarding" onBack={onBack} actions={<div style={{ display: 'flex', gap: 8 }}>{view !== 'tracker' && <ExportMenu onExport={exportRows} disabled={!rows.length} />}{view === 'active' && <PrimaryButton onClick={() => { setErrors({}); setAdding({ firstName: '', middleName: '', lastName: '', suffix: '', contactNumber: '', email: '', birthday: '', documentIds: [], checklistIds: checklistItems().map(item => item.id) }); }}>Add Employee Preboarding</PrimaryButton>}</div>} />
    <div className="hrm-segmented" role="tablist">{[['active', 'Active'], ['archive', 'Archive'], ['tracker', 'Checklist Tracker']].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'selected' : ''} onClick={() => { setView(key); table.setPage(1); }}>{label}</button>)}</div>
    {view === 'active' && <StatusTabs tabs={STATUS_TABS} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} counts={counts} />}
    <div className="hrm-toolbar"><SearchInput value={table.search} onChange={table.setSearch} placeholder="Search applicant code, name or e-mail..." /></div>
    {view === 'tracker'
      ? <DataTable columns={trackerColumns} rows={paginate(active.filter(matches), table.page, table.pageSize)} total={active.filter(matches).length} rowKey={row => row.id} page={table.page} pageSize={table.pageSize} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} empty="No preboarding profiles." renderCell={(row, column) => column.key === 'profile' ? <span className="hrm-avatar-sm">{row.firstName[0]}{row.lastName[0]}</span> : column.key === 'name' ? `${row.firstName} ${row.lastName}` : column.key === 'completion' ? `${checklistDone(row)} of ${row.checklist.length} submitted` : column.key === 'acceptance' ? acceptanceStatus(row) : row[column.key]} actions={row => [{ kind: 'view', label: 'View Information', onSelect: () => setViewing(row.id) }]} />
      : <DataTable columns={view === 'archive' ? archiveColumns : activeColumns} rows={paginate(rows, table.page, table.pageSize)} total={rows.length} rowKey={row => row.id} page={table.page} pageSize={table.pageSize} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} empty={view === 'archive' ? 'No archived profiles.' : 'No preboarding profiles.'}
          renderCell={(row, column) => column.key === 'acceptance' ? <span className={`hrm-status-pill tone-${{ Accepted: 'ok', Completed: 'ok', Rejected: 'bad' }[acceptanceStatus(row)] || 'warn'}`}>{acceptanceStatus(row).toUpperCase()}</span> : column.type === 'date' ? formatDate(row[column.key]) : (row[column.key] || '—')}
          actions={row => view === 'archive'
            ? [{ kind: 'view', label: 'View Employee Profile', onSelect: () => setViewing(row.id) }, { kind: 'edit', label: 'Reactivate', onSelect: () => setConfirm({ kind: 'reactivate', profile: row }) }]
            : [{ kind: 'view', label: 'View Information', onSelect: () => setViewing(row.id) }, ...(acceptanceStatus(row) === 'Accepted' ? [{ kind: 'edit', label: 'Mark as Completed', onSelect: () => setConfirm({ kind: 'complete', profile: row }) }] : []), { kind: 'cancel', label: 'Archive', onSelect: () => setConfirm({ kind: 'archive', profile: row }) }]} />}

    {adding && <Modal title="Add Employee Preboarding" width="lg" onClose={() => setAdding(null)} footer={<><GhostButton onClick={() => setAdding(null)}>Cancel</GhostButton><PrimaryButton icon={false} onClick={submitAdd}>Save</PrimaryButton></>}>
      <div className="hrm-form"><h3 className="hrm-form-section-title">Basic Information</h3><div className="hrm-form-grid">
        <Field label="Applicant Code"><input value="Generated when saved" disabled /></Field>
        {[['firstName', 'First Name', true], ['middleName', 'Middle Name'], ['lastName', 'Last Name', true], ['suffix', 'Suffix'], ['contactNumber', 'Contact Number', true], ['email', 'E-mail', true]].map(([key, label, required]) => <Field key={key} label={label} required={required} error={errors[key]}><input value={adding[key]} onChange={event => setAdding({ ...adding, [key]: event.target.value })} /></Field>)}
        <Field label="Birthday" required error={errors.birthday}><input type="date" value={adding.birthday} onChange={event => setAdding({ ...adding, birthday: event.target.value })} /></Field>
      </div>
      <h3 className="hrm-form-section-title">Onboarding Documents</h3>
      {onboardingDocuments().length ? onboardingDocuments().map(doc => <label key={doc.documentId} className="hrm-agree"><input type="checkbox" checked={adding.documentIds.includes(doc.documentId)} onChange={event => setAdding({ ...adding, documentIds: event.target.checked ? [...adding.documentIds, doc.documentId] : adding.documentIds.filter(id => id !== doc.documentId) })} /> <span>{doc.documentId} · {doc.title}</span></label>) : <p className="hrm-ss-placeholder">Add documents in Core ▸ Company Configuration ▸ People Preboarding first.</p>}
      {errors.documents && <small className="hrm-form-error">{errors.documents}</small>}
      <h3 className="hrm-form-section-title">Assign Checklist</h3>
      {checklistItems().map(item => <label key={item.id} className="hrm-agree"><input type="checkbox" checked={adding.checklistIds.includes(item.id)} onChange={event => setAdding({ ...adding, checklistIds: event.target.checked ? [...adding.checklistIds, item.id] : adding.checklistIds.filter(id => id !== item.id) })} /> <span>{item.title}{item.requiredUpload === 'Yes' ? ' (upload required)' : ''}</span></label>)}
      {errors.checklist && <small className="hrm-form-error">{errors.checklist}</small>}
      </div>
    </Modal>}

    {viewingProfile && <Modal title="View Information" width="lg" onClose={() => setViewing(null)} footer={<GhostButton onClick={() => setViewing(null)}>Close</GhostButton>}>
      <dl className="hrm-detail-list">{[['First Name', viewingProfile.firstName], ['Middle Name', viewingProfile.middleName || '—'], ['Last Name', viewingProfile.lastName], ['Suffix', viewingProfile.suffix || '—'], ['Birthday', formatDate(viewingProfile.birthday)], ['Contact Number', viewingProfile.contactNumber], ['E-mail', viewingProfile.email], ['Overall Acceptance', acceptanceStatus(viewingProfile)]].map(([label, value]) => <div key={label} style={{ display: 'contents' }}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <h3 className="hrm-form-section-title">Acceptance Details</h3>
      <p className="hrm-ss-placeholder">The applicant answers from the link in the e-mail. The buttons below stand in for that answer in this mock-up.</p>
      <table className="hrm-table"><thead><tr><th>Document</th><th>Response</th><th aria-label="Record response" /></tr></thead><tbody>{viewingProfile.documents.map(doc => <tr key={doc.documentId}><td>{doc.documentId} · {doc.title}</td><td>{doc.response || 'Awaiting response'}</td><td>{!viewingProfile.completed && !viewingProfile.archived && <span style={{ display: 'flex', gap: 6 }}><button type="button" className="hrm-btn tiny outline" onClick={() => update(viewingProfile.id, { documents: viewingProfile.documents.map(item => item.documentId === doc.documentId ? { ...item, response: 'Accepted' } : item) })}>Accepted</button><button type="button" className="hrm-btn tiny outline" onClick={() => update(viewingProfile.id, { documents: viewingProfile.documents.map(item => item.documentId === doc.documentId ? { ...item, response: 'Rejected' } : item) })}>Rejected</button></span>}</td></tr>)}</tbody></table>
      <h3 className="hrm-form-section-title">Employee Progress · {checklistDone(viewingProfile)} of {viewingProfile.checklist.length}</h3>
      <ol className="hrm-checklist">{viewingProfile.checklist.map(item => <li key={item.id}>{item.submitted ? <CheckCircle size={18} weight="fill" color="#16a34a" /> : <Circle size={18} />}<div><strong>{item.title}</strong><small>{item.submitted ? (item.fileName || 'Submitted') : item.requiredUpload === 'Yes' ? 'Upload required — not yet submitted' : 'Not yet submitted'}</small></div></li>)}</ol>
    </Modal>}

    {confirm && <Modal title={{ complete: 'Mark as Completed', archive: 'Archive Profile', reactivate: 'Reactivate Profile' }[confirm.kind]} onClose={() => setConfirm(null)} footer={<><GhostButton onClick={() => setConfirm(null)}>No</GhostButton><PrimaryButton icon={false} onClick={() => {
      const { profile, kind } = confirm;
      if (kind === 'complete') markComplete(profile);
      if (kind === 'archive') { update(profile.id, { archived: true }); onNotify(`${profile.firstName} ${profile.lastName} archived.`); }
      if (kind === 'reactivate') { update(profile.id, { archived: false }); onNotify(`${profile.firstName} ${profile.lastName} reactivated.`); }
      setConfirm(null);
    }}>Yes</PrimaryButton></>}>
      <p>{{ complete: 'Mark this applicant\'s preboarding as completed?', archive: 'Move this profile to the Archive? It can be reactivated later.', reactivate: 'Move this profile back to Active?' }[confirm.kind]} ({confirm.profile.firstName} {confirm.profile.lastName})</p>
    </Modal>}
    {!profiles.length && <EmptyState title="No preboarding profiles" icon={UserPlus}>Add an applicant to start preboarding.</EmptyState>}
  </div>;
}
