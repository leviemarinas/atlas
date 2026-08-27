import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Buildings,
  Check,
  ClockCounterClockwise,
  Function,
  Lock,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Prohibit,
  Trash,
  X,
} from '@phosphor-icons/react';
import { computationCategoryCatalogue } from './ComputationalBasis';
import {
  appendVersion,
  applicabilityFor,
  computationGuards,
  diffComputation,
  governanceStamps,
  readApplicability,
  readStandardLibrary,
  setApplicability,
  standardUsageIndex,
  usageOf,
  versionIndex,
  writeStandardLibrary,
} from './computationGovernance';
import {
  categoryPrefixes,
  evaluateExpression,
  fields,
  nextComputationCode,
  prefixForCategory,
} from './computationCatalog';
import { readCompanies } from './companyRepository';
import { plural } from './textFormat';
import { useRole } from './RoleContext';

const sampleValues = Object.fromEntries(fields.map(([code, , sample]) => [code, sample]));

function AdminModal({ title, onClose, children, className = 'standard-computation-modal' }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>{children}</section></div>;
}

function DeleteModal({ record, onClose, onDelete }) {
  return <AdminModal title="Delete standard computation" onClose={onClose}><div className="modal-body"><div className="delete-copy"><div className="delete-icon"><Trash /></div><div><h3>Delete {record.code}?</h3><p>{record.name} will be removed from the standard computation library and will no longer be available to any company. No posted payroll transaction has used it, so nothing historical depends on it.</p></div></div><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" onClick={onDelete}>Delete</button></div></div></AdminModal>;
}

/**
 * Which companies apply this standard, and whether it is Active in each.
 *
 * The confirmed model is one central formula, applied to selected companies.
 * Atlas never copies a standard so that a second company can use it, and a
 * company that has already run payroll with the code cannot have it withdrawn —
 * the historical transactions still resolve against it.
 */
function ApplicabilityModal({ record, companies, usage, onClose, onChange, notify }) {
  const [map, setMap] = useState(() => readApplicability());
  const scopeFor = companyId => applicabilityFor(record.code, companyId, map);
  const usedBy = companyId => (usage?.transactions || []).filter(item => item.companyId === companyId);

  const update = (companyId, patch) => {
    const linked = usedBy(companyId);
    if (linked.length && (patch.applied === false || patch.status === 'Inactive')) {
      notify({ type: 'error', message: `${record.code} is linked to ${linked.map(item => item.transactionNumber).join(', ')} in this company. It can only be withdrawn or deactivated while no transaction is linked to it.` });
      return;
    }
    setApplicability(record.code, companyId, patch, 'P&A Admin');
    setMap(readApplicability());
    onChange?.();
  };

  const applyToAll = applied => companies.forEach(company => {
    if (!applied && usedBy(company.companyId).length) return;
    setApplicability(record.code, company.companyId, { applied }, 'P&A Admin');
  });

  return <AdminModal title={`Company applicability · ${record.code}`} onClose={onClose} className="applicability-modal">
    <div className="modal-body">
      <p className="drawer-paragraph">{record.name} is defined once here. Select the companies it applies to; each company then activates or deactivates it in its own Computational Basis.</p>
      <div className="applicability-bulk">
        <button type="button" className="button secondary small" onClick={() => { applyToAll(true); setMap(readApplicability()); onChange?.(); }}><Check /> Apply to every company</button>
        <button type="button" className="button secondary small" onClick={() => { applyToAll(false); setMap(readApplicability()); onChange?.(); }}><Prohibit /> Withdraw where unused</button>
      </div>
      <table className="config-table"><thead><tr><th>Company</th><th>Applied</th><th>Status in company</th><th>Payroll usage</th></tr></thead><tbody>
        {companies.map(company => {
          const scope = scopeFor(company.companyId);
          const linked = usedBy(company.companyId);
          const label = company.displayName || company.legalName || company.companyCode || company.companyId;
          return <tr key={company.companyId}>
            <td><strong>{label}</strong><small className="block-caption">{company.companyCode || company.companyId}</small></td>
            <td><input type="checkbox" checked={scope.applied} onChange={event => update(company.companyId, { applied: event.target.checked })} aria-label={`Apply ${record.code} to ${label}`} /></td>
            <td><select value={scope.status} disabled={!scope.applied} onChange={event => update(company.companyId, { status: event.target.value })}><option>Active</option><option>Inactive</option></select></td>
            <td>{linked.length
              ? <span className="usage-chip" title={linked.map(item => `${item.transactionNumber} · ${item.status}`).join('\n')}>{linked.length} {plural(linked.length, 'transaction')}</span>
              : <span className="usage-chip none">Not used</span>}</td>
          </tr>;
        })}
      </tbody></table>
    </div>
    <div className="modal-actions sticky-actions"><button className="button secondary" onClick={onClose}>Close</button></div>
  </AdminModal>;
}

function FormulaAdminModal({ record, library, categories, guard, onClose, onSave }) {
  const isNew = !record?.id;
  const [draft, setDraft] = useState(record || {
    code: nextComputationCode(categories[0]?.[0] || 'Basic Pay', library, categories),
    name: '',
    category: categories[0]?.[0] || 'Basic Pay',
    expression: '{{basic_pay}}',
    description: '',
    // A standard is published Inactive and reviewed before any company is
    // allowed to compute with it.
    status: 'Inactive',
    isBuiltIn: true,
    version: '1.0',
    effectiveDate: governanceStamps.today(),
    lastTest: null,
  });
  const [fieldCode, setFieldCode] = useState(fields[0][0]);
  const [expected, setExpected] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [changeNote, setChangeNote] = useState(isNew ? 'Standard computation added.' : 'Standard formula updated.');
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const changeCategory = category => setDraft(previous => ({
    ...previous,
    category,
    code: isNew ? nextComputationCode(category, library, categories) : previous.code,
  }));
  const insertField = () => update('expression', `${draft.expression}${draft.expression && !/[ (]$/.test(draft.expression) ? ' ' : ''}{{${fieldCode}}}`);

  const testFormula = () => {
    try {
      const value = evaluateExpression(draft.expression, sampleValues, { library });
      const target = expected === '' ? null : Number(expected);
      const passed = target === null || Math.abs(target - value) < 0.005;
      const evidence = { inputs: sampleValues, expected: target, actual: value, result: passed ? 'Passed' : 'Failed', testedBy: 'P&A Admin', testedAt: new Date().toISOString(), expression: draft.expression };
      setPreview(evidence);
      setDraft(previous => ({ ...previous, lastTest: evidence }));
      setError(passed ? '' : `The formula returned ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}, not the expected ${target.toLocaleString(undefined, { maximumFractionDigits: 2 })}.`);
    } catch (testError) { setPreview(null); setError(testError.message); }
  };

  const submit = event => {
    event.preventDefault();
    if (!isNew && guard && !guard.canEdit) { setError(guard.editReason); return; }
    if (!draft.code.trim() || !draft.name.trim()) { setError('Code and name are required. A description is optional but recommended.'); return; }
    try { evaluateExpression(draft.expression, sampleValues, { library }); } catch (validationError) { setError(validationError.message); return; }
    onSave({ ...draft, code: draft.code.trim().toUpperCase(), name: draft.name.trim(), description: draft.description.trim(), changeNote, updatedBy: 'P&A Admin', updatedAt: governanceStamps.displayDate() });
  };

  const pendingChanges = isNew ? [] : diffComputation(record, draft);

  return <AdminModal title={isNew ? 'Add standard computation' : `Edit ${record.code}`} onClose={onClose}>
    <form onSubmit={submit}>
      <div className="modal-body standard-computation-form">
        <div className="basis-form-grid">
          <label>Computation code<input value={draft.code} disabled readOnly />
            <small className="field-hint">{isNew ? `Generated from the ${draft.category} category (${prefixForCategory(draft.category, categories)}) and locked once saved.` : 'Locked — payroll transactions print this code.'}</small>
          </label>
          <label>Computation name<span className="required">*</span><input value={draft.name} onChange={event => update('name', event.target.value)} placeholder="e.g. Daily Rate" required /></label>
          <label>Category<select value={draft.category} onChange={event => changeCategory(event.target.value)}>{categories.map(([name]) => <option key={name}>{name}</option>)}</select>
            <small className="field-hint">Controlled by Settings › Reference Table › Computation Category.</small>
          </label>
          {isNew
            ? <label>Status<input value="Inactive" disabled readOnly /><small className="field-hint">A new standard is published Inactive and reviewed before a company computes with it.</small></label>
            : <label>Status<select value={draft.status} onChange={event => update('status', event.target.value)}><option>Active</option><option>Inactive</option></select></label>}
          <label>Effective date<input type="date" value={draft.effectiveDate} onChange={event => update('effectiveDate', event.target.value)} required /></label>
          <label>Version<input value={draft.version} disabled readOnly /><small className="field-hint">Saving publishes the next version and keeps this one for the payrolls that used it.</small></label>
          <label className="wide"><span className="label-caption">Description <span className="optional-tag">Optional</span></span><textarea value={draft.description} onChange={event => update('description', event.target.value)} placeholder="Recommended — explain what this formula calculates and when payroll uses it." /></label>
          <label className="wide">Change note<textarea value={changeNote} onChange={event => setChangeNote(event.target.value)} required /></label>
        </div>
        <section className="admin-formula-builder">
          <div className="formula-builder-heading"><div><h3>Formula expression</h3><p>Use approved Atlas fields and operators. Test the expression before saving — the inputs and result are stored with the published version.</p></div><span className="computation-source built-in"><Function weight="duotone" />Atlas standard</span></div>
          <textarea className="formula-expression" value={draft.expression} onChange={event => { update('expression', event.target.value); setPreview(null); }} aria-label="Formula expression" required />
          <div className="formula-insert-row">
            <select value={fieldCode} onChange={event => setFieldCode(event.target.value)}>{fields.map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select>
            <button type="button" className="button secondary" onClick={insertField}><Plus /> Insert field</button>
            <label className="inline-expected">Expected result <input type="number" step="any" value={expected} onChange={event => setExpected(event.target.value)} placeholder="Optional" /></label>
            <button type="button" className="button secondary" onClick={testFormula}><Check /> Test formula</button>
          </div>
          {preview && <p className={preview.result === 'Passed' ? 'formula-test-pass' : 'basis-error'}><Check weight="bold" /> {preview.result} · sample result <strong>{Number(preview.actual).toLocaleString('en-PH', { maximumFractionDigits: 2 })}</strong>{preview.expected !== null && ` against an expected ${Number(preview.expected).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`}</p>}
          {error && <p className="basis-error">{error}</p>}
        </section>
        {Boolean(pendingChanges.length) && <div className="change-diff">
          <h4>What this save changes</h4>
          <table className="change-diff-table"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>
            {pendingChanges.map(change => <tr key={change.field}><td>{change.field}</td><td><code className="diff-before">{String(change.from) || '—'}</code></td><td><code className="diff-after">{String(change.to) || '—'}</code></td></tr>)}
          </tbody></table>
        </div>}
      </div>
      <div className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{isNew ? 'Add computation' : 'Save changes'}</button></div>
    </form>
  </AdminModal>;
}

/** Published versions of one standard, with the test evidence each one carries. */
function VersionModal({ record, versions, onClose }) {
  return <AdminModal title={`Version history · ${record.code}`} onClose={onClose} className="applicability-modal">
    <div className="modal-body">
      {versions.length ? <div className="version-history">{versions.map(version => <article key={version.version} className={version.version === record.version ? 'current' : ''}>
        <header><strong>Version {version.version}</strong><span>Effective {version.effectiveDate}</span>{version.version === record.version && <span className="version-current-chip">Current</span>}</header>
        <code className="version-expression">{version.expression}</code>
        <small>{version.note || 'No change note recorded.'} · {version.publishedBy} · {new Date(version.publishedAt).toLocaleString()}</small>
        {Boolean(version.changes?.length) && <ul className="version-change-list">{version.changes.map(change => <li key={change.field}><b>{change.field}</b> <code className="diff-before">{String(change.from) || '—'}</code> → <code className="diff-after">{String(change.to) || '—'}</code></li>)}</ul>}
        {version.test
          ? <p className="version-test"><Check weight="bold" /> Test {version.test.result.toLowerCase()} · expected {version.test.expected === null ? 'not stated' : Number(version.test.expected).toLocaleString()} · actual {Number(version.test.actual).toLocaleString()} · {version.test.testedBy}</p>
          : <p className="version-test none">No test evidence recorded for this version.</p>}
      </article>)}</div>
        : <p className="drawer-paragraph">No version has been published from this workspace yet. The current definition is version {record.version}.</p>}
    </div>
    <div className="modal-actions sticky-actions"><button className="button secondary" onClick={onClose}>Close</button></div>
  </AdminModal>;
}

/**
 * Settings › Standard Computation Library.
 *
 * The single place an Atlas standard formula exists. A P&A Admin maintains the
 * definition here and chooses which companies it applies to; a company never
 * receives its own copy. Editing and deleting stay open only while no posted
 * payroll transaction, in any company, has applied the code.
 */
export function StandardComputationAdmin({ onBack, notify }) {
  const { isPaAdmin } = useRole();
  const [computations, setComputations] = useState(readStandardLibrary);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [status, setStatus] = useState('All statuses');
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  const [scoping, setScoping] = useState(null);
  const [viewingVersions, setViewingVersions] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [applicabilityVersion, setApplicabilityVersion] = useState(0);

  useEffect(() => { writeStandardLibrary(computations); }, [computations]);

  const companies = useMemo(() => readCompanies(), []);
  const categories = useMemo(() => computationCategoryCatalogue(), []);
  const usage = useMemo(() => standardUsageIndex(companies), [companies]);
  const versions = useMemo(() => versionIndex('standard', { standardOnly: true }), [computations]);
  const applicability = useMemo(() => readApplicability(), [applicabilityVersion]);
  const appliedCount = code => companies.filter(company => applicabilityFor(code, company.companyId, applicability).applied).length;
  const guardFor = record => computationGuards(record, {
    context: 'standard',
    isPaAdmin: true,
    usage: usageOf(record.code, usage),
    versions: versions[String(record.code).toUpperCase()] || [],
  });

  const visible = useMemo(() => computations.filter(item => {
    const matchesText = `${item.code} ${item.name} ${item.description || ''}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (category === 'All categories' || item.category === category) && (status === 'All statuses' || item.status === status);
  }), [computations, query, category, status]);

  const allFilteredSelected = Boolean(visible.length) && visible.every(item => selected.has(item.code));
  const toggleSelected = code => setSelected(previous => {
    const next = new Set(previous);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });
  const toggleAllFiltered = () => setSelected(previous => {
    const next = new Set(previous);
    if (allFilteredSelected) visible.forEach(item => next.delete(item.code));
    else visible.forEach(item => next.add(item.code));
    return next;
  });

  const save = draft => {
    if (computations.some(item => item.code === draft.code && item.id !== draft.id)) { notify({ type: 'error', message: `${draft.code} already exists in the standard library.` }); return; }
    if (draft.id) {
      const previous = computations.find(item => item.id === draft.id);
      const guard = guardFor(previous);
      if (!guard.canEdit) { notify({ type: 'error', message: guard.editReason }); return; }
      const version = (Number(draft.version) + 0.1).toFixed(1);
      const saved = { ...previous, ...draft, version };
      delete saved.changeNote;
      setComputations(list => list.map(item => item.id === saved.id ? saved : item));
      appendVersion('standard', saved, { test: saved.lastTest, changes: diffComputation(previous, draft), note: draft.changeNote, actor: 'P&A Admin' });
      notify({ type: 'success', message: `${saved.code} published as version ${version}. Version ${previous.version} stays available to the payrolls that used it.` });
    } else {
      const saved = { ...draft, id: Date.now(), status: 'Inactive', version: '1.0' };
      delete saved.changeNote;
      setComputations(list => [saved, ...list]);
      appendVersion('standard', saved, { test: saved.lastTest, note: draft.changeNote, actor: 'P&A Admin' });
      notify({ type: 'success', message: `${saved.code} added as an Inactive version 1.0. Choose the companies it applies to, then activate it.` });
    }
    setEditing(undefined);
  };

  const remove = record => {
    const guard = guardFor(record);
    if (!guard.canDelete) { notify({ type: 'error', message: guard.deleteReason }); setDeleting(null); return; }
    setComputations(previous => previous.filter(item => item.id !== record.id));
    setDeleting(null);
    notify({ type: 'success', message: `${record.code} deleted from the standard computation library.` });
  };

  const setStatusFor = (record, nextStatus) => {
    const guard = guardFor(record);
    if (nextStatus === 'Inactive' && !guard.canDeactivate) return { ok: false, reason: guard.deactivateReason };
    setComputations(previous => previous.map(item => item.id === record.id ? { ...item, status: nextStatus, updatedBy: 'P&A Admin', updatedAt: governanceStamps.displayDate() } : item));
    return { ok: true };
  };

  const bulkStatus = nextStatus => {
    const targets = computations.filter(item => selected.has(item.code) && item.status !== nextStatus);
    const applied = [];
    const blocked = [];
    targets.forEach(record => { (setStatusFor(record, nextStatus).ok ? applied : blocked).push(record.code); });
    setSelected(new Set());
    notify({
      type: applied.length ? 'success' : 'error',
      message: applied.length
        ? `${applied.length} standard ${plural(applied.length, 'computation')} set to ${nextStatus}.${blocked.length ? ` ${blocked.length} left unchanged — linked to a payroll transaction: ${blocked.join(', ')}.` : ''}`
        : `Nothing changed. ${blocked.length ? `${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} linked to a payroll transaction.` : `Every selected computation is already ${nextStatus}.`}`,
    });
  };

  const exportCsv = () => {
    const csv = ['Code,Name,Category,Expression,Version,Status,Effective Date,Companies Applied,Payroll Transactions', ...visible.map(item => [item.code, item.name, item.category, item.expression, item.version, item.status, item.effectiveDate, appliedCount(item.code), usageOf(item.code, usage).transactions.length].map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'atlas-standard-computations.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    notify({ type: 'success', message: 'Standard computation export prepared.' });
  };

  return <div className="page-content standard-computation-admin">
    <button className="inline-back" onClick={onBack}><ArrowLeft /> Settings</button>
    <div className="page-heading basis-heading"><div><p className="breadcrumb">Settings / Standard Computation Library</p><h1>Standard Computation Library</h1><p className="page-description">The one place an Atlas standard formula is defined. Maintain the central definition and choose which companies it applies to — a company never holds its own copy.</p></div><span className="controlled-badge"><Function weight="duotone" /> Central source library</span></div>
    <div className="library-admin-notice">{isPaAdmin ? <Function weight="duotone" /> : <Lock weight="duotone" />}<span>{isPaAdmin
      ? <><strong>Single source of truth for standard formulas</strong><small>Edit and delete stay available only while no posted payroll transaction — in any company — has applied the code. After that, publish a new version or deactivate it.</small></>
      : <><strong>Read-only in the client view</strong><small>Switch to the P&amp;A Admin experience in the top bar to maintain standard formulas and company applicability. Client Admins activate or deactivate the standards applied to their company in Computational Basis.</small></>}</span></div>
    <div className="config-toolbar basis-toolbar">
      <div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search code, computation, or description..." /><MagnifyingGlass /></div>
      <select className="compact-select" value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{[...new Set(computations.map(item => item.category))].map(value => <option key={value}>{value}</option>)}</select>
      <select className="compact-select" value={status} onChange={event => setStatus(event.target.value)}><option>All statuses</option><option>Active</option><option>Inactive</option></select>
      <div className="toolbar-spacer" />
      <button className="button secondary" onClick={exportCsv}>Export CSV</button>
      {isPaAdmin && <button className="button primary" onClick={() => setEditing(null)}><Plus /> Add computation</button>}
    </div>
    {Boolean(selected.size) && isPaAdmin && <div className="bulk-action-bar">
      <span><strong>{selected.size}</strong> selected</span>
      <button className="button secondary small" onClick={() => bulkStatus('Active')}><Check /> Activate</button>
      <button className="button secondary small" onClick={() => bulkStatus('Inactive')}><Prohibit /> Deactivate</button>
      <button className="button secondary small" onClick={() => setSelected(new Set())}><X /> Clear selection</button>
    </div>}
    <div className="table-card config-table-card basis-table-card"><table className="config-table basis-table"><thead><tr>
      <th className="select-column"><input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} aria-label={`Select all ${visible.length} filtered computations`} /></th>
      <th>Code</th><th>Computation</th><th>Category</th><th>Formula</th><th>Version</th><th>Status</th><th>Companies</th><th>Payroll usage</th><th>Action</th>
    </tr></thead><tbody>
      {visible.map(item => {
        const guard = guardFor(item);
        const used = guard.usage;
        return <tr key={item.code} className={selected.has(item.code) ? 'row-selected' : ''}>
          <td className="select-column"><input type="checkbox" checked={selected.has(item.code)} onChange={() => toggleSelected(item.code)} aria-label={`Select ${item.code}`} /></td>
          <td><strong>{item.code}</strong></td>
          <td><div className="table-title-cell"><strong>{item.name}</strong><small>{item.description || 'No description recorded.'}</small></div></td>
          <td>{item.category}</td>
          <td><code className="table-formula">{item.expression}</code></td>
          <td>{item.version}</td>
          <td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></td>
          <td><button className="link-button" onClick={() => setScoping(item)}><Buildings weight="duotone" /> {appliedCount(item.code)} of {companies.length}</button></td>
          <td>{used.transactions.length
            ? <span className="usage-chip" title={used.transactions.map(row => `${row.companyName} · ${row.transactionNumber} · ${row.status}`).join('\n')}>{used.transactions.length} {plural(used.transactions.length, 'transaction')}{used.posted.length ? ` · ${used.posted.length} posted` : ''}</span>
            : <span className="usage-chip none">Not used yet</span>}</td>
          <td><div className="row-actions always">
            <button onClick={() => setViewingVersions(item)} aria-label={`Version history for ${item.name}`}><ClockCounterClockwise /></button>
            {isPaAdmin ? <>
              <button
                onClick={() => { const outcome = setStatusFor(item, item.status === 'Active' ? 'Inactive' : 'Active'); if (!outcome.ok) notify({ type: 'error', message: outcome.reason }); }}
                disabled={item.status === 'Active' && !guard.canDeactivate}
                title={item.status === 'Active' ? (guard.canDeactivate ? `Deactivate ${item.code}` : guard.deactivateReason) : `Activate ${item.code}`}
                aria-label={`${item.status === 'Active' ? 'Deactivate' : 'Activate'} ${item.name}`}
              >{item.status === 'Active' ? <Prohibit /> : <Check />}</button>
              {guard.canEdit
                ? <button onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}><PencilSimple /></button>
                : <span className="row-lock" title={guard.editReason}><Lock weight="duotone" /></span>}
              <button onClick={() => setDeleting(item)} disabled={!guard.canDelete} title={guard.canDelete ? `Delete ${item.code}` : guard.deleteReason} aria-label={`Delete ${item.name}`}><Trash /></button>
            </> : <span className="row-lock" title="Switch to the P&A Admin experience to edit standard formulas"><Lock weight="duotone" /></span>}
          </div></td>
        </tr>;
      })}
    </tbody></table></div>
    <div className="pagination"><span>Displaying <strong>{visible.length}</strong> of {computations.length} {plural(computations.length, 'formula')}</span><span>One central definition, applied to {companies.length} {plural(companies.length, 'company', 'companies')}.</span></div>
    {editing !== undefined && <FormulaAdminModal record={editing || null} library={computations} categories={categories.length ? categories : categoryPrefixes} guard={editing ? guardFor(editing) : null} onClose={() => setEditing(undefined)} onSave={save} />}
    {deleting && <DeleteModal record={deleting} onClose={() => setDeleting(null)} onDelete={() => remove(deleting)} />}
    {scoping && <ApplicabilityModal record={scoping} companies={companies} usage={usageOf(scoping.code, usage)} notify={notify} onChange={() => setApplicabilityVersion(value => value + 1)} onClose={() => setScoping(null)} />}
    {viewingVersions && <VersionModal record={viewingVersions} versions={versions[String(viewingVersions.code).toUpperCase()] || []} onClose={() => setViewingVersions(null)} />}
  </div>;
}
