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
  Warning,
  X,
} from '@phosphor-icons/react';
import { FormulaEditor, ScopeChip, VersionCompare, computationCategoryCatalogue } from './ComputationalBasis';
import { referenceValues } from './ReferenceTables';
import {
  FORMULA_SCOPES,
  appendVersion,
  applicabilityFor,
  companyLabel,
  computationGuards,
  computationScope,
  diffComputation,
  ensureOnboardingBaseline,
  governanceStamps,
  migrateCompanyComputations,
  newStandardComputation,
  readApplicability,
  readStandardLibrary,
  setApplicability,
  standardUsageIndex,
  usageOf,
  versionIndex,
  writeStandardLibrary,
} from './computationGovernance';
import { categoryPrefixes } from './computationCatalog';
import { readCompanies } from './companyRepository';
import { plural } from './textFormat';
import { useRole } from './RoleContext';
import { assignmentConflicts, lockTestCases } from './computationInsights.js';

function AdminModal({ title, onClose, children, className = 'standard-computation-modal' }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>{children}</section></div>;
}

function DeleteModal({ record, onClose, onDelete }) {
  return <AdminModal title="Delete formula" onClose={onClose}><div className="modal-body"><div className="delete-copy"><div className="delete-icon"><Trash /></div><div><h3>Delete {record.code}?</h3><p>{record.name} will be removed from the central library and will no longer be available to any company. No posted payroll transaction has used it, so nothing historical depends on it.</p></div></div><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" onClick={onDelete}>Delete</button></div></div></AdminModal>;
}

/**
 * Which companies a formula is assigned to, and whether it is Active in each.
 *
 * Under the Controlled Hybrid approach a company sees and uses only the
 * formulas assigned to it here. A client-specific formula can only ever be
 * assigned to the client it was built for. A company that has already run
 * payroll with the code cannot have it withdrawn — its historical transactions
 * still resolve against it.
 */
function ApplicabilityModal({ record, companies, library = [], usage, actor, onClose, onChange, notify }) {
  const [map, setMap] = useState(() => readApplicability());
  const [historyFor, setHistoryFor] = useState(null);
  const subgroups = ['All employees', ...referenceValues('payroll-groups')];
  const clientSpecific = computationScope(record) === 'Client-specific';
  const assignable = company => !clientSpecific || company.companyId === record.ownerCompanyId;
  const scopeFor = companyId => applicabilityFor(record.code, companyId, map);
  const usedBy = companyId => (usage?.transactions || []).filter(item => item.companyId === companyId);

  const update = (companyId, patch) => {
    const linked = usedBy(companyId);
    if (linked.length && (patch.applied === false || patch.status === 'Inactive')) {
      notify({ type: 'error', message: `${record.code} is linked to ${linked.map(item => item.transactionNumber).join(', ')} in this company. It can only be withdrawn or deactivated while no transaction is linked to it.` });
      return;
    }
    setApplicability(record.code, companyId, patch, actor);
    setMap(readApplicability());
    onChange?.();
  };

  const applyToAll = applied => companies.filter(assignable).forEach(company => {
    if (!applied && usedBy(company.companyId).length) return;
    setApplicability(record.code, company.companyId, { applied }, actor);
  });

  return <AdminModal title={`Company assignment · ${record.code}`} onClose={onClose} className="applicability-modal">
    <div className="modal-body">
      <p className="drawer-paragraph">{clientSpecific
        ? `${record.name} is a client-specific formula built for ${companyLabel(companies.find(company => company.companyId === record.ownerCompanyId)) || 'one client'}. It can only be assigned to that client.`
        : `${record.name} is defined once here. Assign it to the companies that use it — a company sees and uses only the formulas assigned to it. Status is P&A's switch for that company.`}</p>
      {!clientSpecific && <div className="applicability-bulk">
        <button type="button" className="button secondary small" onClick={() => { applyToAll(true); setMap(readApplicability()); onChange?.(); }}><Check /> Assign to every company</button>
        <button type="button" className="button secondary small" onClick={() => { applyToAll(false); setMap(readApplicability()); onChange?.(); }}><Prohibit /> Withdraw where unused</button>
      </div>}
      <p className="field-hint">Precedence: an assignment for a subgroup applies before an all-employee one; between assignments for the same group, the lower priority number applies first. Two formulas of the same category with the same group, overlapping dates and the same priority are flagged as a conflict.</p>
      <div className="table-wrap"><table className="config-table company-assignment-table"><thead><tr><th>Company</th><th>Assigned</th><th>Status in company</th><th>Subgroup</th><th>Start</th><th>End</th><th>Owner</th><th>Priority</th><th>Payroll usage</th><th>History</th></tr></thead><tbody>
        {companies.map(company => {
          const scope = scopeFor(company.companyId);
          const linked = usedBy(company.companyId);
          const label = companyLabel(company);
          const allowed = assignable(company);
          return <tr key={company.companyId}>
            <td><strong>{label}</strong><small className="block-caption">{company.companyCode || company.companyId}</small></td>
            <td>{allowed
              ? <input type="checkbox" checked={scope.applied} onChange={event => update(company.companyId, { applied: event.target.checked })} aria-label={`Assign ${record.code} to ${label}`} />
              : <span className="row-lock" title="A client-specific formula is only ever assigned to its own client."><Lock weight="duotone" /></span>}</td>
            <td><select value={scope.status} disabled={!allowed || !scope.applied} onChange={event => update(company.companyId, { status: event.target.value })}><option>Active</option><option>Inactive</option></select></td>
            <td><select aria-label={`Subgroup for ${label}`} value={scope.subgroup || 'All employees'} disabled={!allowed || !scope.applied} onChange={event => update(company.companyId, { subgroup: event.target.value })}>{subgroups.map(item => <option key={item}>{item}</option>)}</select></td>
            <td><input type="date" aria-label={`Start date for ${label}`} value={scope.startDate || ''} disabled={!allowed || !scope.applied} onChange={event => update(company.companyId, { startDate: event.target.value })} /></td>
            <td><input type="date" aria-label={`End date for ${label}`} value={scope.endDate || ''} min={scope.startDate || undefined} disabled={!allowed || !scope.applied} onChange={event => update(company.companyId, { endDate: event.target.value })} /></td>
            <td><input aria-label={`Owner for ${label}`} value={scope.owner || ''} placeholder="P&A owner" disabled={!allowed || !scope.applied} onChange={event => update(company.companyId, { owner: event.target.value })} /></td>
            <td><input type="number" min="1" className="priority-input" aria-label={`Priority for ${label}`} value={scope.priority || ''} disabled={!allowed || !scope.applied} onChange={event => update(company.companyId, { priority: event.target.value })} />
              {assignmentConflicts(record.code, company.companyId, { library, applicability: map }).map(conflict => <small key={conflict.code} className="conflict-note"><Warning weight="fill" /> Conflicts with {conflict.code} (same group and priority)</small>)}</td>
            <td>{linked.length
              ? <span className="usage-chip" title={linked.map(item => `${item.transactionNumber} · ${item.status}`).join('\n')}>{linked.length} {plural(linked.length, 'transaction')}</span>
              : <span className="usage-chip none">Not used</span>}</td>
            <td><button type="button" className="link-button" disabled={!scope.history?.length} onClick={() => setHistoryFor(company)}>{scope.history?.length ? `${scope.history.length} ${plural(scope.history.length, 'change')}` : '—'}</button></td>
          </tr>;
        })}
      </tbody></table></div>
      {historyFor && <div className="assignment-history">
        <header><h4>Status history · {companyLabel(historyFor)}</h4><button type="button" className="link-button" onClick={() => setHistoryFor(null)}>Close</button></header>
        <table className="config-table"><thead><tr><th>When</th><th>By</th><th>Change</th></tr></thead><tbody>
          {(scopeFor(historyFor.companyId).history || []).map((entry, index) => <tr key={index}><td>{entry.at}</td><td>{entry.by}</td><td>{entry.changes.map(change => `${change.field}: ${String(change.from || '—')} → ${String(change.to || '—')}`).join('; ')}</td></tr>)}
        </tbody></table>
      </div>}
    </div>
    <div className="modal-actions sticky-actions"><button className="button secondary" onClick={onClose}>Close</button></div>
  </AdminModal>;
}

/** Published versions of one formula, with the test evidence each one carries. */
function VersionModal({ record, versions, onClose }) {
  return <AdminModal title={`Version history · ${record.code}`} onClose={onClose} className="applicability-modal">
    <div className="modal-body">
      {versions.length ? <div className="version-history">{versions.map(version => <article key={version.version} className={version.version === record.version ? 'current' : ''}>
        <header><strong>Version {version.version}</strong><span>Effective {version.effectiveDate}</span>{version.version === record.version && <span className="version-current-chip">Current</span>}</header>
        <code className="version-expression">{version.expression}</code>
        <small>{version.note || 'No change note recorded.'} · {version.publishedBy} · {new Date(version.publishedAt).toLocaleString()} · Source: {version.source || 'Screen'}{version.approvalRef ? ` · Approval ${version.approvalRef}` : ''}{version.effectiveDate > new Date().toISOString().slice(0, 10) ? ' · Scheduled' : ''}</small>
        {Boolean(version.changes?.length) && <ul className="version-change-list">{version.changes.map(change => <li key={change.field}><b>{change.field}</b> <code className="diff-before">{String(change.from) || '—'}</code> → <code className="diff-after">{String(change.to) || '—'}</code></li>)}</ul>}
        {version.test
          ? <p className="version-test"><Check weight="bold" /> Test {version.test.result.toLowerCase()} · expected {version.test.expected === null ? 'not stated' : Number(version.test.expected).toLocaleString()} · actual {Number(version.test.actual).toLocaleString()} · {version.test.testedBy}</p>
          : <p className="version-test none">No test evidence recorded for this version.</p>}
      </article>)}</div>
        : <p className="drawer-paragraph">No version has been published from this workspace yet. The current definition is version {record.version}.</p>}
      {versions.length > 1 && <><h3>Compare versions</h3><VersionCompare versions={versions} /></>}
    </div>
    <div className="modal-actions sticky-actions"><button className="button secondary" onClick={onClose}>Close</button></div>
  </AdminModal>;
}

/**
 * Settings › Standard Computation Library — the central formula library.
 *
 * Under the Controlled Hybrid approach this is the only place a formula is
 * authored, and only by P&A: Atlas standards and client-specific formulas
 * alike, each with the parameters a client may change and their range. A P&A
 * Admin assigns each formula to the companies that use it; a company never
 * holds its own copy. Editing and deleting stay open only while no posted
 * payroll transaction, in any company, has applied the code.
 */
export function StandardComputationAdmin({ onBack, notify }) {
  const { isPaAdmin, actor } = useRole();
  const companies = useMemo(() => readCompanies(), []);
  const [computations, setComputations] = useState(() => {
    // Every company's own formulas and onboarding baseline are brought into the
    // central library before it is shown, so this list is complete even for a
    // company nobody has opened since the Controlled Hybrid change.
    companies.forEach(company => {
      migrateCompanyComputations(company.companyId);
      ensureOnboardingBaseline(company.companyId);
    });
    return readStandardLibrary();
  });
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [status, setStatus] = useState('All statuses');
  const [scopeFilter, setScopeFilter] = useState('All scopes');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [scoping, setScoping] = useState(null);
  const [viewingVersions, setViewingVersions] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [applicabilityVersion, setApplicabilityVersion] = useState(0);

  useEffect(() => { writeStandardLibrary(computations); }, [computations]);

  const categories = useMemo(() => computationCategoryCatalogue(), []);
  const usage = useMemo(() => standardUsageIndex(companies), [companies]);
  const versions = useMemo(() => versionIndex('standard', { standardOnly: true }), [computations]);
  const applicability = useMemo(() => readApplicability(), [applicabilityVersion]);
  const appliedCount = code => companies.filter(company => applicabilityFor(code, company.companyId, applicability).applied).length;
  const ownerOf = record => companies.find(company => company.companyId === record.ownerCompanyId);
  const guardFor = record => computationGuards(record, {
    context: 'standard',
    isPaAdmin: true,
    usage: usageOf(record.code, usage),
    versions: versions[String(record.code).toUpperCase()] || [],
  });

  const visible = useMemo(() => computations.filter(item => {
    const matchesText = `${item.code} ${item.name} ${item.description || ''}`.toLowerCase().includes(query.toLowerCase());
    return matchesText
      && (category === 'All categories' || item.category === category)
      && (status === 'All statuses' || item.status === status)
      && (scopeFilter === 'All scopes' || computationScope(item) === scopeFilter);
  }), [computations, query, category, status, scopeFilter]);

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

  const defaultCategory = categories.find(([name]) => name === 'Earnings')?.[0] || categories[0]?.[0] || 'Earnings';
  const addFormula = () => setEditing(newStandardComputation({ category: defaultCategory, library: computations, catalogue: categories.length ? categories : categoryPrefixes, actor }));

  const save = draft => {
    if (!isPaAdmin) return;
    if (draft.isNew) {
      if (computations.some(item => item.code === draft.code)) { notify({ type: 'error', message: `${draft.code} already exists in the library. Change the category so a free code is generated.` }); return; }
      const saved = { ...draft, id: Date.now(), status: 'Inactive', version: '1.0', isBuiltIn: true, testCases: lockTestCases(draft.testCases, '1.0'), updatedBy: actor, updatedAt: governanceStamps.displayDate() };
      delete saved.changeNote;
      delete saved.changeSource;
      delete saved.approvalRef;
      delete saved.isNew;
      setComputations(list => [saved, ...list]);
      appendVersion('standard', saved, { test: saved.lastTest, note: draft.changeNote, actor, source: draft.changeSource, approvalRef: draft.approvalRef });
      if (computationScope(saved) === 'Client-specific') {
        // A client-specific formula is assigned to its own client as it is
        // created — nobody else may ever be given it.
        setApplicability(saved.code, saved.ownerCompanyId, { applied: true, status: 'Active' }, actor);
        setApplicabilityVersion(value => value + 1);
        notify({ type: 'success', message: `${saved.code} added for ${companyLabel(ownerOf(saved))} as an Inactive version 1.0 and assigned to that client only. Activate it when it is ready to compute.` });
      } else {
        notify({ type: 'success', message: `${saved.code} added as an Inactive version 1.0. Assign it to the companies that use it, then activate it.` });
      }
      setEditing(null);
      return;
    }
    const previous = computations.find(item => item.code === draft.code);
    const guard = guardFor(previous);
    if (!guard.canEdit) { notify({ type: 'error', message: guard.editReason }); return; }
    const version = (Number(draft.version) + 0.1).toFixed(1);
    const changes = diffComputation(previous, draft);
    const saved = { ...previous, ...draft, version, testCases: lockTestCases(draft.testCases, version), updatedBy: actor, updatedAt: governanceStamps.displayDate() };
    delete saved.changeNote;
    delete saved.changeSource;
    delete saved.approvalRef;
    setComputations(list => list.map(item => item.code === saved.code ? saved : item));
    appendVersion('standard', saved, { test: saved.lastTest, changes, note: draft.changeNote, actor, source: draft.changeSource, approvalRef: draft.approvalRef });
    const scheduled = saved.effectiveDate > new Date().toISOString().slice(0, 10);
    notify({ type: 'success', message: scheduled
      ? `${saved.code} version ${version} is scheduled for ${saved.effectiveDate}. Payroll paid out before then keeps version ${previous.version}.`
      : `${saved.code} published as version ${version}. Version ${previous.version} stays available to the payrolls that used it.` });
    setEditing(null);
  };

  const remove = record => {
    const guard = guardFor(record);
    if (!guard.canDelete) { notify({ type: 'error', message: guard.deleteReason }); setDeleting(null); return; }
    setComputations(previous => previous.filter(item => item.code !== record.code));
    setDeleting(null);
    notify({ type: 'success', message: `${record.code} deleted from the central library.` });
  };

  const setStatusFor = (record, nextStatus) => {
    const guard = guardFor(record);
    if (nextStatus === 'Inactive' && !guard.canDeactivate) return { ok: false, reason: guard.deactivateReason };
    setComputations(previous => previous.map(item => item.code === record.code ? { ...item, status: nextStatus, updatedBy: actor, updatedAt: governanceStamps.displayDate() } : item));
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
        ? `${applied.length} ${plural(applied.length, 'formula')} set to ${nextStatus}.${blocked.length ? ` ${blocked.length} left unchanged — linked to a payroll transaction: ${blocked.join(', ')}.` : ''}`
        : `Nothing changed. ${blocked.length ? `${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} linked to a payroll transaction.` : `Every selected formula is already ${nextStatus}.`}`,
    });
  };

  const exportCsv = () => {
    const header = 'Code,Name,Scope,Client,Category,Expression,Version,Status,Effective Date,Companies Assigned,Payroll Transactions';
    const rows = visible.map(item => [item.code, item.name, computationScope(item), companyLabel(ownerOf(item)), item.category, item.expression, item.version, item.status, item.effectiveDate, appliedCount(item.code), usageOf(item.code, usage).transactions.length]
      .map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','));
    const url = URL.createObjectURL(new Blob([[header, ...rows].join('\n')], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'atlas-central-formula-library.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    notify({ type: 'success', message: 'Formula library export prepared.' });
  };

  return <div className="page-content standard-computation-admin">
    <button className="inline-back" onClick={onBack}><ArrowLeft /> Settings</button>
    <div className="page-heading basis-heading"><div><p className="breadcrumb">Settings / Standard Computation Library</p><h1>Standard Computation Library</h1><p className="page-description">The one place every formula is defined — Atlas standards and client-specific formulas alike. P&amp;A authors each formula, sets the values a client may change and their range, and assigns it to the companies that use it. A company never holds its own copy.</p></div><span className="controlled-badge"><Function weight="duotone" /> Central formula library</span></div>
    <div className="library-admin-notice">{isPaAdmin ? <Function weight="duotone" /> : <Lock weight="duotone" />}<span>{isPaAdmin
      ? <><strong>Single source of truth for every formula</strong><small>Once a posted payroll — in any company — has used a formula, saving a change publishes a new version and those payrolls keep the version they ran on. It can then be deactivated but no longer deleted. A new formula or a logic change requested by a client after onboarding is handled as an enhancement.</small></>
      : <><strong>Read-only in the client view</strong><small>Formulas are authored and assigned by P&amp;A. A client sees the formulas assigned to its company in Computational Basis, and changes only the approved values on its own pay items.</small></>}</span></div>
    <div className="config-toolbar basis-toolbar">
      <div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search code, formula, or description..." /><MagnifyingGlass /></div>
      <select className="compact-select" value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{[...new Set(computations.map(item => item.category))].map(value => <option key={value}>{value}</option>)}</select>
      <select className="compact-select" value={status} onChange={event => setStatus(event.target.value)}><option>All statuses</option><option>Active</option><option>Inactive</option></select>
      <select className="compact-select" value={scopeFilter} onChange={event => setScopeFilter(event.target.value)}><option>All scopes</option>{FORMULA_SCOPES.map(scope => <option key={scope}>{scope}</option>)}</select>
      <div className="toolbar-spacer" />
      <button className="button secondary" onClick={exportCsv}>Export CSV</button>
      {isPaAdmin && <button className="button primary" onClick={addFormula}><Plus /> Add formula</button>}
    </div>
    {Boolean(selected.size) && isPaAdmin && <div className="bulk-action-bar">
      <span><strong>{selected.size}</strong> selected</span>
      <button className="button secondary small" onClick={() => bulkStatus('Active')}><Check /> Activate</button>
      <button className="button secondary small" onClick={() => bulkStatus('Inactive')}><Prohibit /> Deactivate</button>
      <button className="button secondary small" onClick={() => setSelected(new Set())}><X /> Clear selection</button>
    </div>}
    <div className="table-card config-table-card basis-table-card"><table className="config-table basis-table"><thead><tr>
      <th className="select-column"><input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} aria-label={`Select all ${visible.length} filtered formulas`} /></th>
      <th>Code</th><th>Scope</th><th>Formula name</th><th>Category</th><th>Formula</th><th>Version</th><th>Status</th><th>Assigned to</th><th>Payroll usage</th><th>Action</th>
    </tr></thead><tbody>
      {visible.map(item => {
        const guard = guardFor(item);
        const used = guard.usage;
        const clientSpecific = computationScope(item) === 'Client-specific';
        return <tr key={item.code} className={selected.has(item.code) ? 'row-selected' : ''}>
          <td className="select-column"><input type="checkbox" checked={selected.has(item.code)} onChange={() => toggleSelected(item.code)} aria-label={`Select ${item.code}`} /></td>
          <td><strong>{item.code}</strong></td>
          <td><ScopeChip record={item} /></td>
          <td><div className="table-title-cell"><strong>{item.name}</strong><small>{item.description || 'No description recorded.'}</small></div></td>
          <td>{item.category}</td>
          <td><code className="table-formula">{item.expression}</code></td>
          <td>{item.version}</td>
          <td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></td>
          <td><button className="link-button" onClick={() => setScoping(item)}><Buildings weight="duotone" /> {clientSpecific ? `${companyLabel(ownerOf(item)) || 'Its client'} only` : `${appliedCount(item.code)} of ${companies.length}`}</button></td>
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
            </> : <span className="row-lock" title="Switch to the P&A Admin experience to maintain formulas"><Lock weight="duotone" /></span>}
          </div></td>
        </tr>;
      })}
    </tbody></table></div>
    <div className="pagination"><span>Displaying <strong>{visible.length}</strong> of {computations.length} {plural(computations.length, 'formula')}</span><span>One central definition each, assigned across {companies.length} {plural(companies.length, 'company', 'companies')}.</span></div>
    {editing && <FormulaEditor
      record={editing}
      library={computations}
      categories={categories.length ? categories : categoryPrefixes}
      guard={editing.isNew ? null : guardFor(editing)}
      actor={actor}
      companies={companies}
      onClose={() => setEditing(null)}
      onSave={save}
    />}
    {deleting && <DeleteModal record={deleting} onClose={() => setDeleting(null)} onDelete={() => remove(deleting)} />}
    {scoping && <ApplicabilityModal record={scoping} companies={companies} library={computations} usage={usageOf(scoping.code, usage)} actor={actor} notify={notify} onChange={() => setApplicabilityVersion(value => value + 1)} onClose={() => setScoping(null)} />}
    {viewingVersions && <VersionModal record={viewingVersions} versions={versions[String(viewingVersions.code).toUpperCase()] || []} onClose={() => setViewingVersions(null)} />}
  </div>;
}
