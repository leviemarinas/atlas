import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Function,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  Wrench,
  X,
} from '@phosphor-icons/react';
import { COMPUTATION_STORAGE_KEY, categoryCycle, evaluateExpression, fields, seedComputations } from './ComputationalBasis';

const readComputations = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(COMPUTATION_STORAGE_KEY));
    return (saved || seedComputations()).map(item => ({ ...item, isBuiltIn: item.isBuiltIn !== false }));
  } catch {
    return seedComputations();
  }
};

const sampleValues = Object.fromEntries(fields.map(([code, , sample]) => [code, sample]));

function AdminModal({ title, onClose, children }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal standard-computation-modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>{children}</section></div>;
}

function DeleteModal({ record, onClose, onDelete }) {
  return <AdminModal title="Delete standard computation" onClose={onClose}><div className="modal-body"><div className="delete-copy"><div className="delete-icon"><Trash /></div><div><h3>Delete {record.code}?</h3><p>{record.name} will be removed from the standard computation library and will no longer be available for new assignments.</p></div></div><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" onClick={onDelete}>Delete</button></div></div></AdminModal>;
}

function FormulaAdminModal({ record, existingCodes, onClose, onSave }) {
  const isNew = !record?.id;
  const [draft, setDraft] = useState(record || { code: `STD-${String(existingCodes.length + 1).padStart(3, '0')}`, name: '', category: 'Basic Pay', expression: '{{basic_pay}}', description: '', status: 'Active', isBuiltIn: true, version: '1.0', effectiveDate: new Date().toISOString().slice(0, 10) });
  const [fieldCode, setFieldCode] = useState(fields[0][0]);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const insertField = () => update('expression', `${draft.expression}${draft.expression && !/[ (]$/.test(draft.expression) ? ' ' : ''}{{${fieldCode}}}`);
  const testFormula = () => {
    try { setPreview(evaluateExpression(draft.expression, sampleValues)); setError(''); } catch (testError) { setPreview(null); setError(testError.message); }
  };
  const submit = event => {
    event.preventDefault();
    if (!draft.code.trim() || !draft.name.trim() || !draft.description.trim()) { setError('Code, name, and description are required.'); return; }
    try { evaluateExpression(draft.expression, sampleValues); } catch (validationError) { setError(validationError.message); return; }
    onSave({ ...draft, code: draft.code.trim().toUpperCase(), name: draft.name.trim(), description: draft.description.trim(), updatedBy: 'Settings Admin', updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) });
  };
  return <AdminModal title={isNew ? 'Add standard computation' : `Edit ${record.code}`} onClose={onClose}><form onSubmit={submit}><div className="modal-body standard-computation-form"><div className="basis-form-grid"><label>Computation code<span className="required">*</span><input value={draft.code} disabled={!isNew} onChange={event => update('code', event.target.value)} placeholder="STD-001" required /></label><label>Computation name<span className="required">*</span><input value={draft.name} onChange={event => update('name', event.target.value)} placeholder="e.g. Daily Rate" required /></label><label>Category<select value={draft.category} onChange={event => update('category', event.target.value)}>{categoryCycle.concat(['Payroll Result', 'Retirement', 'Incentives', 'Separation']).filter((value, index, values) => values.indexOf(value) === index).map(value => <option key={value}>{value}</option>)}</select></label><label>Status<select value={draft.status} onChange={event => update('status', event.target.value)}><option>Active</option><option>Inactive</option></select></label><label>Effective date<input type="date" value={draft.effectiveDate} onChange={event => update('effectiveDate', event.target.value)} required /></label><label>Version<input value={draft.version} onChange={event => update('version', event.target.value)} placeholder="1.0" required /></label><label className="wide">Description<span className="required">*</span><textarea value={draft.description} onChange={event => update('description', event.target.value)} placeholder="Explain what this formula calculates and when payroll uses it." required /></label></div><section className="admin-formula-builder"><div className="formula-builder-heading"><div><h3>Formula expression</h3><p>Use approved Atlas fields and operators. Test the expression before saving.</p></div><span className={`computation-source ${draft.isBuiltIn ? 'built-in' : 'admin-defined'}`}><Function weight="duotone" />{draft.isBuiltIn ? 'Built-in standard' : 'Admin-defined'}</span></div><textarea className="formula-expression" value={draft.expression} onChange={event => { update('expression', event.target.value); setPreview(null); }} aria-label="Formula expression" required /><div className="formula-insert-row"><select value={fieldCode} onChange={event => setFieldCode(event.target.value)}>{fields.map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select><button type="button" className="button secondary" onClick={insertField}><Plus /> Insert field</button><button type="button" className="button secondary" onClick={testFormula}><Check /> Test formula</button></div>{preview !== null && <p className="formula-test-pass"><Check weight="bold" /> Sample result: <strong>{Number(preview).toLocaleString('en-PH', { maximumFractionDigits: 2 })}</strong></p>}{error && <p className="basis-error">{error}</p>}</section><label className="admin-source-toggle"><button type="button" className={`switch ${draft.isBuiltIn ? 'on' : ''}`} onClick={() => update('isBuiltIn', !draft.isBuiltIn)}><span /></button><span><strong>Built-in standard computation</strong><small>Show the standard-function indicator in Computational Basis.</small></span><Wrench /></label></div><div className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{isNew ? 'Add computation' : 'Save changes'}</button></div></form></AdminModal>;
}

export function StandardComputationAdmin({ onBack, notify }) {
  const [computations, setComputations] = useState(readComputations);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [status, setStatus] = useState('All statuses');
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  useEffect(() => localStorage.setItem(COMPUTATION_STORAGE_KEY, JSON.stringify(computations)), [computations]);
  const visible = useMemo(() => computations.filter(item => {
    const matchesText = `${item.code} ${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (category === 'All categories' || item.category === category) && (status === 'All statuses' || item.status === status);
  }), [computations, query, category, status]);
  const save = draft => {
    if (computations.some(item => item.code === draft.code && item.id !== draft.id)) { notify({ type: 'error', message: `${draft.code} already exists in the standard library.` }); return; }
    setComputations(previous => draft.id ? previous.map(item => item.id === draft.id ? { ...item, ...draft } : item) : [{ ...draft, id: Date.now() }, ...previous]);
    setEditing(undefined); notify({ type: 'success', message: `${draft.code} ${draft.id ? 'updated' : 'added'} in the standard computation library.` });
  };
  const remove = record => { setComputations(previous => previous.filter(item => item.id !== record.id)); setDeleting(null); notify({ type: 'success', message: `${record.code} deleted from the standard computation library.` }); };
  const exportCsv = () => {
    const csv = ['Code,Type,Name,Category,Expression,Version,Status,Effective Date', ...visible.map(item => [item.code, item.isBuiltIn !== false ? 'Built-in standard' : 'Admin-defined', item.name, item.category, item.expression, item.version, item.status, item.effectiveDate].map(value => `"${String(value || '').replaceAll('"', '""')}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = 'atlas-standard-computations.csv'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); notify({ type: 'success', message: 'Standard computation export prepared.' });
  };
  return <div className="page-content standard-computation-admin"><button className="inline-back" onClick={onBack}><ArrowLeft /> Settings</button><div className="page-heading basis-heading"><div><p className="breadcrumb">Settings / Standard Computation Library</p><h1>Standard Computation Library</h1><p className="page-description">Manage Atlas built-in payroll formulas used by Computational Basis assignments and policy engines.</p></div><span className="controlled-badge"><Function weight="duotone" /> Admin source library</span></div><div className="library-admin-notice"><Function weight="duotone" /><span><strong>Single source of truth for standard formulas</strong><small>Add, edit, deactivate, or delete formulas here. Computational Basis consumes the saved library and shows whether each formula is built-in or admin-defined.</small></span></div><div className="config-toolbar basis-toolbar"><div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search code, computation, or description..." /><MagnifyingGlass /></div><select className="compact-select" value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{[...new Set(computations.map(item => item.category))].map(value => <option key={value}>{value}</option>)}</select><select className="compact-select" value={status} onChange={event => setStatus(event.target.value)}><option>All statuses</option><option>Active</option><option>Inactive</option></select><div className="toolbar-spacer" /><button className="button secondary" onClick={exportCsv}>Export CSV</button><button className="button primary" onClick={() => setEditing(null)}><Plus /> Add computation</button></div><div className="table-card config-table-card basis-table-card"><table className="config-table basis-table"><thead><tr><th>Code</th><th>Type</th><th>Computation</th><th>Category</th><th>Formula</th><th>Version</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map(item => <tr key={item.id}><td><strong>{item.code}</strong></td><td><span className={`computation-source ${item.isBuiltIn !== false ? 'built-in' : 'admin-defined'}`} title={item.isBuiltIn !== false ? 'Built-in standard computation' : 'Admin-defined computation'}><Function weight="duotone" />{item.isBuiltIn !== false ? 'Built-in standard' : 'Admin-defined'}</span></td><td><div className="table-title-cell"><strong>{item.name}</strong><small>{item.description}</small></div></td><td>{item.category}</td><td><code className="table-formula">{item.expression}</code></td><td>{item.version}</td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></td><td><div className="row-actions always"><button onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}><PencilSimple /></button><button onClick={() => setDeleting(item)} aria-label={`Delete ${item.name}`}><Trash /></button></div></td></tr>)}</tbody></table></div><div className="pagination"><span>Displaying <strong>{visible.length}</strong> of {computations.length} formulas</span><span>Admin changes are stored for this company.</span></div>{editing !== undefined && <FormulaAdminModal record={editing || null} existingCodes={computations.map(item => item.code)} onClose={() => setEditing(undefined)} onSave={save} />}{deleting && <DeleteModal record={deleting} onClose={() => setDeleting(null)} onDelete={() => remove(deleting)} />}</div>;
}
