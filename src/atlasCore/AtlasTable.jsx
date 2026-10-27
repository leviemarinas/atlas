/**
 * The list-and-form pattern every Atlas Core configuration screen uses:
 * search, a Filter dialog, Add / Edit / View / Delete in a dialog, Export and
 * paging. A screen is described as data (see coreScreens.js) — its columns,
 * its form fields, which fields filter, and its seed rows — so the screens
 * read the same way Atlas Core does without a component each.
 *
 * Field types: text, number, date, time, select, radio, textarea, file,
 * checkbox (one Yes/No box), multiselect, color. A field may set `required`,
 * `options` (array or function of the draft), `placeholder`, `hint`,
 * `showIf(draft)`, `lockedOnEdit`, `readOnly`, `min` / `max`, `maxLength`.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, DownloadSimple, Eye, Funnel, MagnifyingGlass, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react';
import { appendAuditEvent, readActiveCompanyId } from '../companyRepository';
import { useRole } from '../RoleContext';
import { downloadFile } from '../fileDownload';
import { formatUs, todayIso } from './dates.js';
import { navigationConfiguration } from './coreScreens.js';

export { formatUs, todayIso };

const PAGE_SIZES = [10, 50, 100];

export function readScoped(key, seed, companyId = readActiveCompanyId()) {
  try {
    const saved = JSON.parse(localStorage.getItem(`${key}:${companyId}`));
    return Array.isArray(saved) || (saved && typeof saved === 'object') ? saved : structuredClone(seed);
  } catch { return structuredClone(seed); }
}
export function writeScoped(key, value, companyId = readActiveCompanyId()) {
  try { localStorage.setItem(`${key}:${companyId}`, JSON.stringify(value)); } catch { /* keep the in-memory copy */ }
}

const optionsOf = (field, draft) => (typeof field.options === 'function' ? field.options(draft) : field.options) || [];
const visible = (field, draft) => !field.showIf || field.showIf(draft);

/** How a stored value reads in a table cell or the View dialog. */
export function displayValue(column, row) {
  const value = row[column.key];
  if (column.render) return column.render(row);
  if (column.type === 'date') return formatUs(value);
  if (column.type === 'checkbox') return value ? 'Yes' : 'No';
  if (column.type === 'multiselect') return Array.isArray(value) && value.length ? value.join(', ') : '—';
  if (column.type === 'file') return value?.name || value || '—';
  if (column.type === 'color') return value ? <span className="atlas-color-chip"><i style={{ background: value }} />{value}</span> : '—';
  if (column.type === 'status') return value ? <span className={`status-pill ${String(value).toLowerCase().replace(/\s+/g, '-')}`}>{value}</span> : '—';
  if (column.type === 'money') return value === '' || value == null ? '—' : `₱ ${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  return value === '' || value == null ? '—' : String(value);
}

export function FieldInput({ field, draft, setDraft, disabled }) {
  const value = draft[field.key];
  const set = next => setDraft(previous => ({ ...previous, [field.key]: next }));
  const common = { disabled: disabled || field.readOnly, 'aria-label': field.label };
  if (field.type === 'select') return <select {...common} value={value ?? ''} onChange={event => set(event.target.value)}><option value="">{field.placeholder || 'Please select'}</option>{optionsOf(field, draft).map(option => <option key={option}>{option}</option>)}</select>;
  if (field.type === 'radio') return <div className="atlas-radio-row">{optionsOf(field, draft).map(option => <label key={option}><input type="radio" disabled={common.disabled} checked={value === option} onChange={() => set(option)} /> {option}</label>)}</div>;
  if (field.type === 'checkbox') return <label className="atlas-check"><input type="checkbox" disabled={common.disabled} checked={Boolean(value)} onChange={event => set(event.target.checked)} /> {field.checkLabel || 'Yes'}</label>;
  if (field.type === 'multiselect') {
    const chosen = Array.isArray(value) ? value : [];
    return <div className="atlas-multi">{optionsOf(field, draft).map(option => <label key={option}><input type="checkbox" disabled={common.disabled} checked={chosen.includes(option)} onChange={event => set(event.target.checked ? [...chosen, option] : chosen.filter(item => item !== option))} /> {option}</label>)}</div>;
  }
  if (field.type === 'textarea') return <textarea {...common} value={value ?? ''} maxLength={field.maxLength || 300} placeholder={field.placeholder || `Input ${field.label.toLowerCase()}`} onChange={event => set(event.target.value)} />;
  if (field.type === 'file') return <div className="atlas-file"><input type="file" disabled={common.disabled} accept={field.accept || '.pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx'} onChange={event => { const file = event.target.files?.[0]; if (file) set({ name: file.name, size: file.size, type: file.type }); }} /><small>{value?.name ? `Uploaded: ${value.name}` : field.hint || 'Maximum file size 5MB.'}</small></div>;
  if (field.type === 'color') return <input {...common} type="color" value={value || '#4f2d7f'} onChange={event => set(event.target.value)} />;
  return <input {...common} type={field.type || 'text'} value={value ?? ''} min={field.min} max={field.max} step={field.type === 'number' ? field.step || 'any' : undefined} maxLength={field.maxLength} placeholder={field.placeholder || (field.type === 'number' ? '0' : `Input ${field.label.toLowerCase()}`)} onChange={event => set(event.target.value)} />;
}

export function FormDialog({ title, fields, draft, setDraft, isEdit, onClose, onSubmit, submitLabel = 'Save', wide }) {
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal canonical-modal atlas-dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
      <form onSubmit={event => { event.preventDefault(); onSubmit(); }} noValidate>
        <div className="canonical-form-grid">{fields.filter(field => visible(field, draft)).map(field => <label key={field.key} className={field.type === 'textarea' || field.wide ? 'atlas-wide' : ''}>
          <span>{field.label}{field.required && <span className="required">*</span>}</span>
          <FieldInput field={field} draft={draft} setDraft={setDraft} disabled={isEdit && field.lockedOnEdit} />
          {field.hint && field.type !== 'file' && <small>{field.hint}</small>}
        </label>)}</div>
        <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{submitLabel}</button></footer>
      </form>
    </section>
  </div>;
}

export function ViewDialog({ title, columns, row, onClose, extra }) {
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal canonical-modal atlas-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
      <dl className="atlas-view-list">{columns.map(column => <div key={column.key}><dt>{column.label}</dt><dd>{displayValue(column, row)}</dd></div>)}</dl>
      {extra}
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Close</button></footer>
    </section>
  </div>;
}

export function ConfirmDialog({ title = 'Delete Item', message, confirmLabel = 'Delete', onClose, onConfirm }) {
  return <div className="modal-backdrop"><section className="modal canonical-modal atlas-dialog" role="dialog" aria-modal="true" aria-label={title}>
    <header><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
    <div className="modal-body"><p>{message}</p></div>
    <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="button" className="button primary" onClick={onConfirm}>{confirmLabel}</button></footer>
  </section></div>;
}

/** Checks a draft against its field rules and the screen's own `validate`. Returns the first problem or ''. */
export function problemWith(definition, draft, rows) {
  for (const field of definition.fields.filter(item => visible(item, draft))) {
    const value = draft[field.key];
    const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
    if (field.required && empty) return `${field.label} is required.`;
    if (field.type === 'number' && !empty) {
      const number = Number(value);
      if (!Number.isFinite(number)) return `${field.label} must be a number.`;
      if (field.min != null && number < field.min) return `${field.label} must be at least ${field.min}.`;
      if (field.max != null && number > field.max) return `${field.label} must be at most ${field.max}.`;
    }
    if (field.pattern && !empty && !field.pattern.test(String(value))) return field.patternMessage || `${field.label} is not valid.`;
  }
  if (definition.uniqueKey) {
    const keys = [].concat(definition.uniqueKey);
    const clash = rows.find(row => row.id !== draft.id && keys.every(key => String(row[key] ?? '').trim().toLowerCase() === String(draft[key] ?? '').trim().toLowerCase()));
    if (clash) return `${keys.map(key => definition.fields.find(field => field.key === key)?.label || key).join(' and ')} already exists.`;
  }
  return definition.validate ? definition.validate(draft, rows) || '' : '';
}

function nextCode(definition, rows) {
  const prefix = definition.codePrefix;
  const used = rows.map(row => Number(String(row[definition.codeKey] || '').replace(prefix, ''))).filter(Number.isFinite);
  return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(definition.codeDigits || 3, '0')}`;
}

/**
 * One configuration table. `definition` is described in the file header;
 * `rows`/`setRows` may be passed in when a parent owns the data.
 */
export function AtlasTable({ definition, notify, companyId = readActiveCompanyId(), rows: givenRows, setRows: setGivenRows }) {
  const { actor } = useRole();
  const [ownRows, setOwnRows] = useState(() => readScoped(definition.storageKey, definition.seed || [], companyId));
  const rows = givenRows || ownRows;
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({});
  const [filterDraft, setFilterDraft] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const persist = (next, action, summary) => {
    if (setGivenRows) setGivenRows(next); else { setOwnRows(next); writeScoped(definition.storageKey, next, companyId); }
    appendAuditEvent({ companyId, actor, action, entityType: definition.title, entityId: definition.storageKey, summary });
  };
  const filterFields = (definition.filters || []).map(key => definition.fields.find(field => field.key === key) || definition.columns.find(column => column.key === key)).filter(Boolean);
  const matches = row => {
    if (query && !definition.columns.some(column => String(displayValue({ ...column, render: undefined }, row)).toLowerCase().includes(query.toLowerCase()))) return false;
    return Object.entries(filters).every(([key, value]) => {
      if (value === '' || value == null) return true;
      const cell = row[key];
      if (Array.isArray(cell)) return cell.includes(value);
      if (typeof cell === 'boolean') return (cell ? 'Yes' : 'No') === value;
      return String(cell ?? '').toLowerCase().includes(String(value).toLowerCase());
    });
  };
  const filtered = useMemo(() => rows.filter(matches), [rows, query, filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);
  const activeFilters = Object.values(filters).filter(value => value !== '' && value != null).length;

  const blank = () => Object.fromEntries(definition.fields.map(field => [field.key, field.default ?? (field.type === 'multiselect' ? [] : field.type === 'checkbox' ? false : '')]));
  const save = () => {
    let draft = { ...editing };
    definition.fields.forEach(field => { if (typeof draft[field.key] === 'string') draft[field.key] = draft[field.key].trim(); });
    if (definition.codePrefix && !draft[definition.codeKey]) draft[definition.codeKey] = nextCode(definition, rows);
    const problem = problemWith(definition, draft, rows);
    if (problem) return notify({ type: 'error', message: problem });
    if (definition.beforeSave) draft = definition.beforeSave(draft, rows);
    const isEdit = Boolean(draft.id);
    let next = isEdit ? rows.map(row => row.id === draft.id ? draft : row) : [{ ...draft, id: `${definition.storageKey}-${Date.now()}`, dateCreated: draft.dateCreated || todayIso() }, ...rows];
    if (definition.afterSave) next = definition.afterSave(next, draft);
    const label = draft[definition.columns[0].key] || definition.singular || definition.title;
    persist(next, isEdit ? `${definition.title}Updated` : `${definition.title}Added`, `${definition.singular || definition.title} ${label} ${isEdit ? 'updated' : 'added'}.`);
    setEditing(null);
    notify({ type: 'success', message: `${definition.singular || definition.title} ${isEdit ? 'updated' : 'added'} successfully.` });
  };
  const remove = () => {
    const problem = definition.canDelete?.(deleting, rows);
    if (problem) { setDeleting(null); return notify({ type: 'error', message: problem }); }
    persist(rows.filter(row => row.id !== deleting.id), `${definition.title}Deleted`, `${definition.singular || definition.title} ${deleting[definition.columns[0].key] || ''} deleted.`);
    setDeleting(null);
    notify({ type: 'success', message: 'Item deleted successfully.' });
  };
  const exportCsv = () => {
    const header = definition.columns.map(column => column.label);
    const body = filtered.map(row => definition.columns.map(column => { const value = displayValue({ ...column, render: column.exportValue, type: column.type === 'color' || column.type === 'status' ? 'text' : column.type }, row); return typeof value === 'string' ? value : String(row[column.key] ?? ''); }));
    downloadFile(`${definition.storageKey}.csv`, [header, ...body].map(line => line.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
    notify({ type: 'success', message: `${filtered.length} row(s) exported.` });
  };

  const actions = definition.actions || ['view', 'edit', 'delete'];
  return <section className="atlas-table-block">
    {definition.heading && <h2 className="atlas-section-title">{definition.heading}</h2>}
    {definition.intro && <p className="page-description">{definition.intro}</p>}
    <div className="config-toolbar atlas-toolbar">
      <div className="search-box"><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search..." aria-label={`Search ${definition.title}`} /><MagnifyingGlass /></div>
      {filterFields.length > 0 && <button type="button" className={`button secondary ${activeFilters ? 'active' : ''}`} onClick={() => setFilterDraft({ ...filters })}><Funnel /> Filter{activeFilters ? ` (${activeFilters})` : ''}</button>}
      <div className="toolbar-spacer" />
      {definition.toolbar}
      {definition.canExport !== false && <button type="button" className="button secondary" onClick={exportCsv}><DownloadSimple /> Export</button>}
      {definition.canAdd !== false && <button type="button" className="button primary" onClick={() => setEditing(blank())}><Plus /> Add</button>}
    </div>
    <div className="table-card atlas-table"><table><thead><tr>{definition.columns.map(column => <th key={column.key}>{column.label}</th>)}{actions.length > 0 && <th>Action</th>}</tr></thead>
      <tbody>{shown.length ? shown.map(row => <tr key={row.id}>{definition.columns.map(column => <td key={column.key}>{displayValue(column, row)}</td>)}{actions.length > 0 && <td><div className="row-actions always">
        {actions.includes('view') && <button type="button" aria-label="View" title="View" onClick={() => setViewing(row)}><Eye /></button>}
        {actions.includes('edit') && (!definition.canEdit || definition.canEdit(row)) && <button type="button" aria-label="Edit" title="Edit" onClick={() => setEditing({ ...row })}><PencilSimple /></button>}
        {actions.includes('delete') && <button type="button" aria-label="Delete" title="Delete" onClick={() => setDeleting(row)}><Trash /></button>}
        {definition.rowActions?.(row, { rows, persist, notify })}
      </div></td>}</tr>) : <tr><td colSpan={definition.columns.length + (actions.length ? 1 : 0)}><div className="empty-state compact"><h3>No data found.</h3></div></td></tr>}</tbody></table></div>
    <div className="pagination"><span>Display <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Rows per page">{PAGE_SIZES.map(size => <option key={size}>{size}</option>)}</select> items · {filtered.length} items</span><div><button disabled={page <= 1} onClick={() => setPage(1)}>«</button><button disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><strong>{Math.min(page, pageCount)}</strong><span>of {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage(page + 1)}>›</button><button disabled={page >= pageCount} onClick={() => setPage(pageCount)}>»</button></div></div>

    {filterDraft && <FormDialog title="Filter" fields={filterFields.map(field => ({ ...field, required: false, type: field.type === 'checkbox' ? 'select' : field.type === 'multiselect' || field.type === 'radio' ? 'select' : field.type === 'textarea' || field.type === 'file' ? 'text' : field.type, options: field.type === 'checkbox' ? ['Yes', 'No'] : field.options, showIf: undefined }))} draft={filterDraft} setDraft={setFilterDraft} onClose={() => setFilterDraft(null)} submitLabel="Apply Filter" onSubmit={() => { setFilters(filterDraft); setPage(1); setFilterDraft(null); }} />}
    {editing && <FormDialog title={`${editing.id ? 'Edit' : 'Add'} ${definition.singular || definition.title}`} fields={definition.fields} draft={editing} setDraft={setEditing} isEdit={Boolean(editing.id)} wide={definition.wideForm} onClose={() => setEditing(null)} onSubmit={save} />}
    {viewing && <ViewDialog title={`View ${definition.singular || definition.title}`} columns={definition.viewColumns || definition.columns} row={viewing} onClose={() => setViewing(null)} />}
    {deleting && <ConfirmDialog message={`Are you sure you want to delete “${deleting[definition.columns[0].key] || 'this item'}”? This action is irreversible.`} onClose={() => setDeleting(null)} onConfirm={remove} />}
  </section>;
}

/** A page of one or more tables, with tabs when there is more than one. */
export function AtlasPage({ title, breadcrumb, description, tabs, onBack, notify, companyId, children, guideKey }) {
  const [active, setActive] = useState(tabs?.[0]?.key);
  const tab = tabs?.find(item => item.key === active);
  return <div className="page-content operational-workspace atlas-page">
    {onBack && <button className="inline-back" onClick={onBack}><ArrowLeft /> Back</button>}
    <div className="page-heading"><div><p className="breadcrumb">{breadcrumb}{tab && tabs.length > 1 ? ` / ${tab.label}` : ''}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div></div>
    {guideKey && <NavigationGuideHost guideKey={guideKey} />}
    {tabs && tabs.length > 1 && <nav className="employee-tabs atlas-tabs">{tabs.map(item => <button key={item.key} className={item.key === active ? 'active' : ''} onClick={() => setActive(item.key)}>{item.label}</button>)}</nav>}
    {tab && (tab.render ? tab.render({ notify, companyId }) : <AtlasTable key={`${tab.key}:${companyId}`} definition={tab.definition} notify={notify} companyId={companyId} />)}
    {children}
  </div>;
}

/* ------------------------------------------------- Navigation guide modal */

/**
 * Atlas Core shows a welcome guide the first time a page opens, built in
 * Navigation Configuration (Type: Navigation Guide, Status: Published). "Skip
 * for now" hides it until the next visit; "Don't show again" hides it for good.
 */
export function NavigationGuideHost({ guideKey }) {
  const guide = useMemo(() => {
    const rows = readScoped(navigationConfiguration.storageKey, navigationConfiguration.seed, readActiveCompanyId());
    return rows.find(row => row.feature === guideKey && row.status === 'Published' && row.type !== 'FAQ' && (!row.date || row.date <= todayIso()));
  }, [guideKey]);
  const seenKey = `atlas-guide-dismissed:${guide?.id}`;
  const [open, setOpen] = useState(() => {
    if (!guide) return false;
    try { return !localStorage.getItem(seenKey) && !sessionStorage.getItem(seenKey); } catch { return true; }
  });
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  if (!guide || !open) return null;
  const steps = guide.steps || [];
  const close = () => {
    try { (dontShow ? localStorage : sessionStorage).setItem(seenKey, '1'); } catch { /* storage unavailable */ }
    setOpen(false);
  };
  return <div className="modal-backdrop"><section className="modal canonical-modal atlas-guide" role="dialog" aria-modal="true" aria-label={guide.title}>
    <header><h2>{guide.title}</h2><button type="button" className="icon-button" onClick={close} aria-label="Close"><X /></button></header>
    <div className="modal-body">
      {step === 0 ? <p>{guide.welcomeMessage}</p> : <><p className="breadcrumb">Step {step} of {steps.length}</p><p>{steps[step - 1]}</p></>}
    </div>
    <footer className="modal-actions">
      <label className="atlas-check"><input type="checkbox" checked={dontShow} onChange={event => setDontShow(event.target.checked)} /> Don't show again</label>
      <div className="toolbar-spacer" />
      {step > 0 && <button type="button" className="button secondary" onClick={() => setStep(step - 1)}>Back</button>}
      {step < steps.length ? <button type="button" className="button primary" onClick={() => setStep(step + 1)}>{step === 0 ? 'Start' : 'Next'}</button> : <button type="button" className="button primary" onClick={close}>Done</button>}
      {step === 0 && <button type="button" className="button secondary" onClick={close}>Skip for now</button>}
    </footer>
  </section></div>;
}
