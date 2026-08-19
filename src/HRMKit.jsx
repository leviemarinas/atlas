/**
 * Shared HRM presentation primitives.
 *
 * Every screen in the P&A HRM masterfile repeats the same handful of shapes:
 * a page heading with a back chevron, a segmented tab strip, a toolbar of
 * search + filter + primary action + export, a paginated table with a row
 * action menu, a right-hand filter drawer, and a stack of modals.  They live
 * here once so a new workspace composes them instead of restyling them.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowsOut,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretDoubleLeft,
  CaretRight,
  CaretDoubleRight,
  DownloadSimple,
  Eye,
  FileArrowUp,
  FilePdf,
  FileXls,
  Funnel,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Prohibit,
  Tray,
  X,
} from '@phosphor-icons/react';
import { plural } from './textFormat';

export const PAGE_SIZES = [10, 25, 50];

/* ------------------------------------------------------------------ format */

export function formatDate(value) {
  if (!value) return '—';
  const raw = String(value);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  if (!iso) return raw;
  const [year, month, day] = iso.split('-');
  return `${month}/${day}/${year}`;
}

export function formatLongDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
  } catch {
    return String(value);
  }
}

/** 24-hour stored times render as the 12-hour clock the masterfile shows. */
export function formatTime(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return raw;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(display).padStart(2, '0')}:${match[2]} ${suffix}`;
}

export function formatCell(value, type) {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'date') return formatDate(value);
  if (type === 'time') return formatTime(value);
  return String(value);
}

/* ------------------------------------------------------------------- chrome */

export function PageHeading({ title, onBack, info, actions, eyebrow }) {
  return <div className="hrm-page-head">
    <div className="hrm-page-head-main">
      {onBack && <button type="button" className="hrm-back" onClick={onBack} aria-label="Go back"><CaretLeft size={20} weight="bold" /></button>}
      <div>
        {eyebrow && <p className="hrm-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {info && <span className="hrm-info-dot" title={info} aria-label={info}>i</span>}
    </div>
    {actions && <div className="hrm-page-head-actions">{actions}</div>}
  </div>;
}

export function Breadcrumbs({ trail = [] }) {
  return <nav className="hrm-breadcrumbs" aria-label="Breadcrumb">
    {trail.map((crumb, index) => <span key={`${crumb.label}-${index}`}>
      {crumb.onClick && index < trail.length - 1
        ? <button type="button" onClick={crumb.onClick}>{crumb.label}</button>
        : <span className="current">{crumb.label}</span>}
      {index < trail.length - 1 && <span className="sep">/</span>}
    </span>)}
  </nav>;
}

/** Pill-style segmented control (Summary / Engagement / Events). */
export function SegmentedTabs({ tabs, value, onChange, ariaLabel = 'View' }) {
  return <div className="hrm-segmented" role="tablist" aria-label={ariaLabel}>
    {tabs.map(tab => {
      const key = typeof tab === 'string' ? tab : tab.key;
      const label = typeof tab === 'string' ? tab : tab.label;
      return <button key={key} type="button" role="tab" aria-selected={value === key} className={value === key ? 'selected' : ''} onClick={() => onChange(key)}>{label}</button>;
    })}
  </div>;
}

/** Underlined status tab strip (All / Pending / Approved / Rejected). */
export function StatusTabs({ tabs, value, onChange, counts }) {
  return <div className="hrm-status-tabs" role="tablist" aria-label="Status">
    {tabs.map(tab => <button key={tab} type="button" role="tab" aria-selected={value === tab} className={value === tab ? 'selected' : ''} onClick={() => onChange(tab)}>
      {tab}{counts && <span className="hrm-tab-count">{counts[tab] ?? 0}</span>}
    </button>)}
  </div>;
}

export function SearchInput({ value, onChange, placeholder = 'Search...' }) {
  return <div className="hrm-search">
    <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
    <span className="hrm-search-icon"><MagnifyingGlass size={16} weight="bold" /></span>
  </div>;
}

export function FilterButton({ onClick, active }) {
  return <button type="button" className={`hrm-link-button ${active ? 'active' : ''}`} onClick={onClick}>
    <Funnel size={16} /> Filter
  </button>;
}

export function PrimaryButton({ children, icon = true, ...props }) {
  return <button type="button" className="hrm-btn primary" {...props}>{icon && <Plus size={15} weight="bold" />}{children}</button>;
}

export function GhostButton({ children, ...props }) {
  return <button type="button" className="hrm-btn ghost" {...props}>{children}</button>;
}

export function DangerButton({ children, ...props }) {
  return <button type="button" className="hrm-btn danger" {...props}>{children}</button>;
}

/** Export split button — the masterfile always offers Excel and PDF. */
export function ExportMenu({ onExport, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(() => setOpen(false));
  return <div className="hrm-menu-wrap" ref={ref}>
    <button type="button" className="hrm-btn outline" disabled={disabled} onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <DownloadSimple size={15} /> Export <CaretDown size={12} weight="bold" />
    </button>
    {open && <div className="hrm-menu" role="menu">
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onExport('Excel'); }}><FileXls size={15} /> Excel</button>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onExport('PDF'); }}><FilePdf size={15} /> PDF</button>
    </div>}
  </div>;
}

/** Row overflow menu: View / Edit / Cancel Application. */
export function RowActions({ actions = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(() => setOpen(false));
  const icons = { view: Eye, edit: PencilSimple, cancel: Prohibit };
  if (!actions.length) return null;
  return <div className="hrm-menu-wrap align-end" ref={ref}>
    <button type="button" className="hrm-row-menu-trigger" aria-label="Row actions" aria-expanded={open} onClick={() => setOpen(value => !value)}>⋮</button>
    {open && <div className="hrm-menu" role="menu">
      {actions.map(action => {
        const Icon = icons[action.kind] || Eye;
        return <button key={action.label} type="button" role="menuitem" className={action.kind === 'cancel' ? 'danger' : ''} onClick={() => { setOpen(false); action.onSelect(); }}>
          <Icon size={15} /> {action.label}
        </button>;
      })}
    </div>}
  </div>;
}

function useOutsideClose(onClose) {
  const ref = useRef(null);
  useEffect(() => {
    function handle(event) {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);
  return ref;
}

/**
 * Bulk action bar shown when one or more rows are selected.
 * Matches Figma Part 4: "{N} items selected. Please select action." with Approve and Reject buttons.
 */
export function BulkSelectionBar({ selectedCount = 0, onApprove, onReject }) {
  if (!selectedCount) return null;
  return <div className="hrm-bulk-bar" role="region" aria-label="Bulk actions">
    <span className="hrm-bulk-message">{selectedCount} {plural(selectedCount, 'item')} selected. Please select action.</span>
    <div className="hrm-bulk-actions">
      {onApprove && <button type="button" className="hrm-btn bulk-approve" onClick={onApprove}>Approve</button>}
      {onReject && <button type="button" className="hrm-btn bulk-reject" onClick={onReject}>Reject</button>}
    </div>
  </div>;
}

/* -------------------------------------------------------------------- table */

/**
 * The list table used by every application screen and admin roster. Paging
 * counts are derived from the row list, never written in.
 */
export function DataTable({
  columns,
  rows,
  rowKey,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  total,
  empty = 'No records to display.',
  renderCell,
  actions,
  selectedKeys,
  onSelectRow,
  onSelectAll,
  footerRow,
}) {
  const selectable = Boolean(onSelectRow);
  const allSelected = selectable && rows.length > 0 && rows.every(row => selectedKeys?.has(rowKey(row)));
  const someSelected = selectable && !allSelected && rows.some(row => selectedKeys?.has(rowKey(row)));

  return <div className="hrm-table-block">
    <div className="hrm-table-scroll">
      <table className="hrm-table">
        <thead>
          <tr>
            {selectable && <th className="hrm-check-col" style={{ width: 44, textAlign: 'center' }}>
              <input
                type="checkbox"
                aria-label="Select all rows"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected; }}
                onChange={event => onSelectAll?.(event.target.checked)}
              />
            </th>}
            {columns.map(column => <th key={column.key} className={column.align ? `align-${column.align}` : ''}>{column.label}</th>)}
            {actions && <th className="hrm-actions-col" aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length + (actions ? 1 : 0) + (selectable ? 1 : 0)} className="hrm-table-empty">{empty}</td></tr>}
          {rows.map(row => {
            const key = rowKey(row);
            const isChecked = selectedKeys?.has(key);
            return <tr key={key} className={isChecked ? 'is-selected' : ''}>
              {selectable && <td className="hrm-check-col" style={{ width: 44, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  aria-label={`Select row ${key}`}
                  checked={Boolean(isChecked)}
                  onChange={event => onSelectRow(key, event.target.checked)}
                />
              </td>}
              {columns.map(column => <td key={column.key} className={column.align ? `align-${column.align}` : ''}>{renderCell ? renderCell(row, column) : formatCell(row[column.key], column.type)}</td>)}
              {actions && <td className="hrm-actions-col"><RowActions actions={actions(row)} /></td>}
            </tr>;
          })}
        </tbody>
        {/* A grand total belongs to the whole report, so it pins below every
            page and stays out of the row count the pager reports. */}
        {footerRow && <tfoot>
          <tr className="hrm-table-total">
            {selectable && <td className="hrm-check-col" />}
            {columns.map(column => {
              const value = footerRow[column.key];
              return <td key={column.key} className={column.align ? `align-${column.align}` : ''}>
                {value === '' || value === undefined || value === null ? '' : <strong>{formatCell(value, column.type)}</strong>}
              </td>;
            })}
            {actions && <td className="hrm-actions-col" />}
          </tr>
        </tfoot>}
      </table>
    </div>
    <Pagination shown={rows.length} total={total} page={page} pageSize={pageSize} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
  </div>;
}

/** The "Display N items … N out of M items" footer, shared by lists and feeds. */
export function Pagination({ shown, total, page, pageSize, onPageChange, onPageSizeChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return <div className="hrm-table-footer">
    <label className="hrm-page-size">
      <span>Display</span>
      <select value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))} aria-label="Rows per page">
        {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
      </select>
      <span>items</span>
    </label>
    <div className="hrm-pager">
      <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} aria-label="First page"><CaretDoubleLeft size={13} weight="bold" /></button>
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page"><CaretLeft size={13} weight="bold" /></button>
      <span className="hrm-pager-current">{page}</span>
      <span className="hrm-pager-of">of {pageCount}</span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} aria-label="Next page"><CaretRight size={13} weight="bold" /></button>
      <button type="button" onClick={() => onPageChange(pageCount)} disabled={page >= pageCount} aria-label="Last page"><CaretDoubleRight size={13} weight="bold" /></button>
    </div>
    <span className="hrm-table-count">{shown} out of {total} {plural(total, 'item')}</span>
  </div>;
}

/** Paging + search + filter state shared by every list screen. */
export function useTableState(initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const reset = () => { setPage(1); };
  return {
    page, pageSize, search, filters,
    setPage,
    setPageSize: size => { setPageSize(size); setPage(1); },
    setSearch: value => { setSearch(value); setPage(1); },
    setFilters: value => { setFilters(value); setPage(1); },
    reset,
  };
}

/** Slice the filtered rows for the current page. */
export function paginate(rows, page, pageSize) {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

/* ------------------------------------------------------------------- status */

const statusTone = {
  Approved: 'ok',
  Rejected: 'bad',
  Pending: 'warn',
  'Pending Approval': 'warn',
  Cancelled: 'muted',
  Draft: 'muted',
  Used: 'muted',
  Scheduled: 'info',
  Forfeited: 'bad',
  'Ready for Scheduling': 'info',
};

export function StatusText({ status }) {
  return <span className={`hrm-status-text tone-${statusTone[status] || 'muted'}`}>{shortStatus(status)}</span>;
}

export function StatusPill({ status }) {
  return <span className={`hrm-status-pill tone-${statusTone[status] || 'muted'}`}>{shortStatus(status).toUpperCase()}</span>;
}

export function shortStatus(status) {
  return status === 'Pending Approval' ? 'Pending' : String(status ?? '—');
}

/* ------------------------------------------------------------------- modals */

export function Modal({ title, onClose, children, footer, width = 'md' }) {
  useEffect(() => {
    function onKey(event) { if (event.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="hrm-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`hrm-modal size-${width}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="hrm-modal-head">
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close"><X size={17} /></button>
      </header>
      <div className="hrm-modal-body">{children}</div>
      {footer && <footer className="hrm-modal-foot">{footer}</footer>}
    </div>
  </div>;
}

/**
 * Irreversible-action confirmation.  The button labels differ per action —
 * cancelling an application offers Back/Cancel, deleting offers Cancel/Confirm —
 * so the caller names them rather than the component assuming one pair.
 */
export function ConfirmCancelModal({
  onBack,
  onConfirm,
  title = 'Cancel Application',
  message = 'Are you sure you want to cancel your application? This action is irreversible.',
  backLabel = 'Back',
  confirmLabel = 'Cancel',
}) {
  return <Modal title={title} onClose={onBack} width="sm" footer={<>
    <GhostButton onClick={onBack}>{backLabel}</GhostButton>
    <DangerButton onClick={onConfirm}>{confirmLabel}</DangerButton>
  </>}>
    <p className="hrm-modal-message">{message}</p>
  </Modal>;
}

/** Read-only definition list used by every "View …" modal. */
export function DetailList({ groups = [] }) {
  return <dl className="hrm-detail-list">
    {groups.map((group, index) => <div key={`${group.label || 'row'}-${index}`} className={`hrm-detail-row ${group.pair ? 'pair' : ''}`}>
      {group.pair
        ? group.pair.map(item => <div key={item.label} className="hrm-detail-cell">
            <dt>{item.label}</dt>
            <dd>{item.node ?? (item.value || '—')}</dd>
          </div>)
        : <div className="hrm-detail-cell">
            <dt>{group.label}</dt>
            <dd>{group.node ?? (group.value || '—')}</dd>
          </div>}
    </div>)}
  </dl>;
}

/** The Approval Log modal: approver, level, remarks and a status pill. */
export function ApprovalLogModal({ entries = [], onClose }) {
  return <Modal title="Approval Log" onClose={onClose} width="lg">
    <table className="hrm-table approval-log">
      <thead><tr><th>Approver</th><th>Approver Level</th><th>Approver Remarks</th><th>Status</th></tr></thead>
      <tbody>
        {entries.map(entry => <tr key={entry.actorId}>
          <td><span className="hrm-approver"><span className="hrm-avatar-sm">{initialsOf(entry.displayName)}</span>{entry.displayName}</span></td>
          <td>{entry.level}</td>
          <td>{entry.remarks || '—'}</td>
          <td><StatusPill status={entry.status} /></td>
        </tr>)}
      </tbody>
    </table>
  </Modal>;
}

export function initialsOf(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
}

/* ------------------------------------------------------------------- drawer */

/**
 * Right-hand filter drawer.  Fields collapse individually and the drawer
 * only commits to the caller when Apply Filter is pressed, so a half-built
 * filter never re-queries the table.
 */
export function FilterDrawer({ fields = [], value = {}, onApply, onClose }) {
  const [draft, setDraft] = useState(value);
  const [expanded, setExpanded] = useState('');
  return <div className="hrm-drawer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="hrm-drawer" role="dialog" aria-modal="true" aria-label="Filter">
      <header className="hrm-drawer-head">
        <h2>Filter</h2>
        <button type="button" onClick={onClose} aria-label="Close filter"><X size={17} /></button>
      </header>
      <div className="hrm-drawer-body">
        {fields.map(field => {
          const open = expanded === field.key;
          return <div key={field.key} className="hrm-drawer-field">
            <button type="button" className="hrm-drawer-field-head" aria-expanded={open} onClick={() => setExpanded(open ? '' : field.key)}>
              <span>{field.label}</span>
              <span className="hrm-drawer-state">{draft[field.key] ? <em>{draft[field.key]}</em> : null}<CaretDown size={14} weight="bold" className={open ? 'flip' : ''} /></span>
            </button>
            {open && <div className="hrm-drawer-field-body">
              {field.options
                ? <select value={draft[field.key] || ''} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })}>
                    <option value="">Any</option>
                    {field.options.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                : <input
                    type={field.type === 'date' ? 'date' : 'text'}
                    value={draft[field.key] || ''}
                    onChange={event => setDraft({ ...draft, [field.key]: event.target.value })}
                    placeholder={`Filter by ${field.label.toLowerCase()}`}
                  />}
            </div>}
          </div>;
        })}
      </div>
      <footer className="hrm-drawer-foot">
        <GhostButton onClick={() => { setDraft({}); onApply({}); }}>Reset</GhostButton>
        <button type="button" className="hrm-btn primary" onClick={() => onApply(draft)}>Apply Filter</button>
      </footer>
    </aside>
  </div>;
}

/* -------------------------------------------------------------------- forms */

export function Field({ label, required, error, children, hint }) {
  return <label className={`hrm-form-field ${error ? 'has-error' : ''}`}>
    <span className="hrm-form-label">{label}{required && <em aria-hidden="true"> *</em>}</span>
    {children}
    {hint && !error && <small className="hrm-form-hint">{hint}</small>}
    {error && <small className="hrm-form-error">{error}</small>}
  </label>;
}

/** Upload dropzone with the per-file rows the masterfile shows after upload. */
export function UploadArea({ files = [], onAdd, onRemove, hint = 'Support for a single or bulk upload. Maximum file size 2MB.' }) {
  const inputRef = useRef(null);
  return <div className="hrm-upload">
    <button type="button" className="hrm-dropzone" onClick={() => inputRef.current?.click()}>
      <Tray size={30} />
      <strong>Click or drag file to this area to upload</strong>
      <small>{hint}</small>
    </button>
    <input
      ref={inputRef}
      type="file"
      multiple
      hidden
      onChange={event => {
        const picked = Array.from(event.target.files || []).map(file => ({ name: file.name, size: `${Math.max(1, Math.round(file.size / 1024))}KB` }));
        if (picked.length) onAdd(picked);
        event.target.value = '';
      }}
    />
    {files.length > 0 && <ul className="hrm-file-list">
      {files.map((file, index) => <li key={`${file.name}-${index}`}>
        <FileArrowUp size={16} />
        <span className="hrm-file-name">{file.name}</span>
        <span className="hrm-file-size">{file.size}</span>
        <button type="button" onClick={() => onRemove(index)} aria-label={`Remove ${file.name}`}><X size={13} /></button>
      </li>)}
    </ul>}
  </div>;
}

/* --------------------------------------------------------------------- misc */

/** Balance stat card; the selected card drives the detail panel beneath it. */
export function StatCard({ label, value, unit, selected, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return <Tag type={onClick ? 'button' : undefined} className={`hrm-stat-card ${selected ? 'selected' : ''} ${onClick ? 'clickable' : ''}`} onClick={onClick} aria-pressed={onClick ? Boolean(selected) : undefined}>
    <span className="hrm-stat-label">{label}</span>
    <strong className="hrm-stat-value">{value}</strong>
    {unit && <span className="hrm-stat-unit">{unit}</span>}
  </Tag>;
}

/** Horizontally scrolling row of balance cards with a next affordance. */
export function StatCardRow({ children }) {
  const scroller = useRef(null);
  return <div className="hrm-stat-row-wrap">
    <div className="hrm-stat-row" ref={scroller}>{children}</div>
    <button type="button" className="hrm-stat-next" aria-label="Scroll cards" onClick={() => scroller.current?.scrollBy({ left: 240, behavior: 'smooth' })}>
      <CaretRight size={14} weight="bold" />
    </button>
  </div>;
}

/** Purple employee banner above an admin drill-down. */
export function EmployeeBanner({ employee }) {
  if (!employee) return null;
  return <div className="hrm-employee-banner">
    <span className="hrm-avatar-lg">{employee.initials || initialsOf(employee.name)}</span>
    <div>
      <h2>{employee.name} <span>({employee.employeeCode})</span></h2>
      <p>{employee.position} | {employee.department}</p>
      <p className="muted">{employee.employmentType}</p>
    </div>
  </div>;
}

export function EmptyState({ title, children, icon: Icon = CalendarBlank }) {
  return <div className="hrm-empty-state">
    <Icon size={28} />
    <strong>{title}</strong>
    {children && <span>{children}</span>}
  </div>;
}

/** Toast strip; the caller owns the message so it can report real outcomes. */
export function Toasts({ toasts = [], onDismiss }) {
  useEffect(() => {
    if (!toasts.length) return undefined;
    const timers = toasts.map(toast => setTimeout(() => onDismiss(toast.id), 4000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, onDismiss]);
  return <div className="hrm-toasts" role="status" aria-live="polite">
    {toasts.map(toast => <div key={toast.id} className={`hrm-toast tone-${toast.tone || 'ok'}`}>{toast.message}</div>)}
  </div>;
}

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const api = useMemo(() => ({
    push: (message, tone = 'ok') => setToasts(current => [...current, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, message, tone }]),
    dismiss: id => setToasts(current => current.filter(toast => toast.id !== id)),
  }), []);
  return { toasts, ...api };
}

/** Simple polyline chart for the engagement/participation graphs. */
export function LineChart({ series = [], labels = [], height = 180 }) {
  const width = 460;
  const padding = { top: 14, right: 12, bottom: 26, left: 30 };
  const values = series.flatMap(line => line.points);
  const max = Math.max(10, ...values);
  const stepX = (width - padding.left - padding.right) / Math.max(1, labels.length - 1);
  const scaleY = point => padding.top + (1 - point / max) * (height - padding.top - padding.bottom);
  return <div className="hrm-chart">
    <div className="hrm-chart-legend">
      {series.map(line => <span key={line.label}><i style={{ background: line.color }} />{line.label}</span>)}
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Engagement over time" preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
        const y = padding.top + fraction * (height - padding.top - padding.bottom);
        return <line key={fraction} x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="hrm-chart-grid" />;
      })}
      {series.map(line => <polyline
        key={line.label}
        className="hrm-chart-line"
        style={{ stroke: line.color }}
        points={line.points.map((point, index) => `${padding.left + index * stepX},${scaleY(point)}`).join(' ')}
      />)}
      {series.map(line => line.points.map((point, index) => <circle
        key={`${line.label}-${index}`}
        cx={padding.left + index * stepX}
        cy={scaleY(point)}
        r="3"
        style={{ fill: line.color }}
      />))}
      {labels.map((label, index) => <text key={label} x={padding.left + index * stepX} y={height - 8} className="hrm-chart-label" textAnchor="middle">{label}</text>)}
    </svg>
  </div>;
}

/**
 * Grouped bar chart for the attendance summary (Absent / Late per month) and
 * the single-series Work Hours Comparison.
 */
export function BarChart({ series = [], labels = [], height = 190, showLegend = true }) {
  const width = 520;
  const padding = { top: 14, right: 10, bottom: 30, left: 26 };
  const max = Math.max(4, ...series.flatMap(entry => entry.points));
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const groupWidth = plotWidth / Math.max(1, labels.length);
  const barWidth = Math.max(3, (groupWidth * 0.62) / series.length);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(fraction => Math.round(max * fraction));
  return <div className="hrm-chart">
    {showLegend && <div className="hrm-chart-legend">
      {series.map(entry => <span key={entry.label}><i style={{ background: entry.color }} />{entry.label}</span>)}
    </div>}
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bar chart" preserveAspectRatio="none">
      {ticks.map(tick => {
        const y = padding.top + (1 - (max ? tick / max : 0)) * plotHeight;
        return <g key={tick}>
          <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="hrm-chart-grid" />
          <text x={padding.left - 6} y={y + 3} className="hrm-chart-label" textAnchor="end">{tick}</text>
        </g>;
      })}
      {labels.map((label, groupIndex) => series.map((entry, seriesIndex) => {
        const value = entry.points[groupIndex] ?? 0;
        const barHeight = max ? (value / max) * plotHeight : 0;
        const groupLeft = padding.left + groupIndex * groupWidth + (groupWidth - barWidth * series.length) / 2;
        return <rect
          key={`${entry.label}-${label}`}
          x={groupLeft + seriesIndex * barWidth}
          y={padding.top + plotHeight - barHeight}
          width={barWidth - 1}
          height={Math.max(0, barHeight)}
          rx="2"
          style={{ fill: entry.color }}
        />;
      }))}
      {labels.map((label, index) => <text
        key={label}
        x={padding.left + index * groupWidth + groupWidth / 2}
        y={height - 10}
        className="hrm-chart-label"
        textAnchor="middle"
      >{label}</text>)}
    </svg>
  </div>;
}

const MOOD_FACES = ['😭', '🙁', '😐', '🙂', '🤩'];

/**
 * Happiness Meter gauge.  The needle angle is derived from the rating so the
 * dial and the printed value can never disagree.
 */
export function Gauge({ title, rating, label, caption, max = 5 }) {
  const clamped = Math.min(max, Math.max(0, Number(rating) || 0));
  const angle = -90 + (clamped / max) * 180;
  const bands = [
    { from: 180, to: 144, color: '#e0313f' },
    { from: 144, to: 108, color: '#f0752a' },
    { from: 108, to: 72, color: '#f5c518' },
    { from: 72, to: 36, color: '#8cc63f' },
    { from: 36, to: 0, color: '#17a34a' },
  ];
  const polar = (degrees, radius) => {
    const radians = (degrees * Math.PI) / 180;
    return [100 + radius * Math.cos(radians), 88 - radius * Math.sin(radians)];
  };
  const arc = (from, to) => {
    const [x1, y1] = polar(from, 62);
    const [x2, y2] = polar(to, 62);
    return `M ${x1} ${y1} A 62 62 0 0 1 ${x2} ${y2}`;
  };
  const [needleX, needleY] = polar(90 - angle, 50);
  return <div className="hrm-gauge">
    <p className="hrm-gauge-title">{title}</p>
    <svg viewBox="0 0 200 116" role="img" aria-label={`${title}: ${label}`}>
      {bands.map(band => <path key={band.from} d={arc(band.from, band.to)} stroke={band.color} strokeWidth="15" fill="none" strokeLinecap="butt" />)}
      {MOOD_FACES.map((face, index) => {
        const [x, y] = polar(162 - index * 36, 82);
        return <text key={face} x={x} y={y} className="hrm-gauge-face" textAnchor="middle">{face}</text>;
      })}
      <line x1="100" y1="88" x2={needleX} y2={needleY} className="hrm-gauge-needle" />
      <circle cx="100" cy="88" r="4" className="hrm-gauge-hub" />
    </svg>
    <strong className={`hrm-gauge-value tone-${clamped >= 4 ? 'ok' : clamped >= 2.5 ? 'warn' : 'bad'}`}>{label}</strong>
    <span className="hrm-gauge-caption">{caption}</span>
  </div>;
}

/** Dashboard widget frame: title, optional count, and an expand affordance. */
export function Widget({ title, count, onExpand, children, actions }) {
  return <section className="hrm-widget">
    <header className="hrm-widget-head">
      <h2>{title}{count !== undefined && <span className="hrm-widget-count">{count}</span>}</h2>
      <div className="hrm-widget-actions">
        {actions}
        {onExpand && <button type="button" onClick={onExpand} aria-label={`Open ${title}`}><ArrowsOut size={14} /></button>}
      </div>
    </header>
    <div className="hrm-widget-body">{children}</div>
  </section>;
}

/**
 * Modal to view uploaded documents/PDFs like government certificates, resignation letters, or COE files.
 * Matches Figma Screenshots (Image 5, Image 15, Image 34).
 */
export function DocumentViewerModal({ fileName = 'Document.pdf', title = 'Document Preview', details, onClose }) {
  const [zoom, setZoom] = useState(100);
  const isDocx = String(fileName).endsWith('.docx') || String(fileName).endsWith('.doc');
  const isCoe = String(title).includes('Certificate') || String(fileName).toLowerCase().includes('coe') || String(fileName).toLowerCase().includes('certificate');
  const isResignation = String(title).includes('Resignation') || String(fileName).toLowerCase().includes('resignation');

  return <Modal title={`${title}: ${fileName}`} onClose={onClose} width="lg" footer={<button type="button" className="hrm-btn primary" onClick={onClose}>OK</button>}>
    <div className="hrm-doc-toolbar">
      <div className="hrm-doc-toolbar-left">
        <span>Page 1 of 1</span>
        <span className="hrm-doc-sep">|</span>
        <button type="button" className="hrm-doc-btn" onClick={() => setZoom(z => Math.max(50, z - 25))}>-</button>
        <span>{zoom}%</span>
        <button type="button" className="hrm-doc-btn" onClick={() => setZoom(z => Math.min(200, z + 25))}>+</button>
      </div>
      <div className="hrm-doc-toolbar-right">
        <span className={`hrm-badge ${isDocx ? 'info' : 'ok'}`}>{isDocx ? 'Word Document (.docx)' : 'Verified PDF Document'}</span>
      </div>
    </div>
    <div className="hrm-doc-viewport">
      <div className="hrm-doc-sheet" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}>
        {isCoe ? (
          <div className="hrm-doc-coe">
            <div className="hrm-doc-header">
              <h2>P&amp;A GRANT THORNTON</h2>
              <p>Certified Public Accountants · Human Resources Management Group</p>
              <hr />
            </div>
            <div className="hrm-doc-body">
              <h3 style={{ textAlign: 'center', margin: '20px 0' }}>CERTIFICATE OF EMPLOYMENT</h3>
              <p>To Whom It May Concern:</p>
              <p>This is to certify that <strong>{details?.employeeName || 'Ethan Collins'}</strong> (Employee Code: <code>{details?.employeeCode || '01234500'}</code>) has been bona fide employed with this company in the <strong>{details?.department || 'IT Department'}</strong>, <strong>{details?.division || 'Product Development'}</strong>, as <strong>{details?.jobTitle || 'Sr. Software Developer'}</strong>.</p>
              {details?.withSalaryInfo !== 'No' && <p>This certificate includes verified compensation records and active tenure data as maintained in the company records.</p>}
              <p>This certificate is issued upon the request of the employee for the purpose of: <strong>{details?.purpose || 'Credit Card / Financial Reference'}</strong>.</p>
              <p>Addressed To: <strong>{details?.companyInstitutionName || 'ClearView Cable Services Ltd.'}</strong><br />{details?.recipientAddress || 'Greenfield District, Mandaluyong City, Metro Manila'}</p>
              <div className="hrm-doc-stamp" style={{ marginTop: 40 }}>
                <span>OFFICIAL SEAL</span>
                <small>AUTHORIZED SIGNATORY · P&amp;A HRM</small>
              </div>
            </div>
          </div>
        ) : isResignation ? (
          <div className="hrm-doc-resignation">
            <div className="hrm-doc-header">
              <strong>FORMAL NOTICE OF RESIGNATION</strong>
              <p>Document Ref: {details?.id || 'RES-2025-001'}</p>
              <hr />
            </div>
            <div className="hrm-doc-body">
              <p>Date: <strong>{formatDate(details?.applicationDate || '2026-04-23')}</strong></p>
              <p>Dear Management,</p>
              <p>Please accept this formal notification that I am resigning from my position as an employee in the <strong>{details?.department || 'IT Department'}</strong>. My intended last day of employment will be <strong>{formatDate(details?.effectivityDate || '2026-05-03')}</strong>.</p>
              <p>Reason for Departure: <strong>{details?.reason || 'Career Transition'}</strong>.</p>
              <p>Handover Notes / Remarks: {details?.employeeRemarks || 'All ongoing deliverables and handover turnover documents have been scheduled with the designated peer receiver.'}</p>
              <div className="hrm-doc-stamp" style={{ marginTop: 40 }}>
                <span>FILED VIA ATLAS HRIS</span>
                <small>{details?.employeeName || 'John Collins Doe'}</small>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="hrm-doc-header">
              <strong>REPUBLIC OF THE PHILIPPINES</strong>
              <p>OFFICIAL DOCUMENT VERIFICATION COPY</p>
              <hr />
            </div>
            <div className="hrm-doc-body">
              <h3>CERTIFIED TRUE RECORD</h3>
              <p>Document Name: <strong>{fileName}</strong></p>
              <p>Registration No: <strong>REG-2026-948201</strong></p>
              <p>Status: <strong style={{ color: '#15803d' }}>AUTHENTICATED BY HR OPERATIONS</strong></p>
              <div className="hrm-doc-stamp">
                <span>OFFICIAL SEAL</span>
                <small>P&amp;A GRANT THORNTON · ATLAS HRIS</small>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </Modal>;
}

/**
 * Sample email notification modal for Approved / Rejected states matching Figma Screenshots (Images 45-48).
 */
export function EmailNotificationModal({ event, onClose, onNavigate }) {
  const isApproved = (event.type || event.title || '').toLowerCase().includes('approved') || event.status === 'Approved';
  return <Modal title="Sample E-mail Notification" onClose={onClose} width="md" footer={<GhostButton onClick={onClose}>Close</GhostButton>}>
    <div className="hrm-email-card">
      <div className="hrm-email-head">
        <div className="hrm-email-row">
          <span className="hrm-email-label">From:</span>
          <span>Atlas HRM Notifications &lt;notifications@atlas-hrm.com&gt;</span>
        </div>
        <div className="hrm-email-row">
          <span className="hrm-email-label">To:</span>
          <span>{event.recipient || 'John Collins Doe <john.doe@abccompany.com>'}</span>
        </div>
        <div className="hrm-email-row">
          <span className="hrm-email-label">Subject:</span>
          <strong>[Atlas HRM] {event.title || (isApproved ? 'Time In/Out Correction request has been approved' : 'Time In/Out Correction request has been rejected')}</strong>
        </div>
      </div>
      <div className="hrm-email-body">
        <div className={`hrm-email-banner ${isApproved ? 'approved' : 'rejected'}`}>
          <strong>{isApproved ? '✓ Application Approved' : '✗ Application Rejected'}</strong>
        </div>
        <p>Hi {event.employeeName || 'John Doe'},</p>
        <p>{event.message || (isApproved
          ? 'Your Time In/Out Correction request has been reviewed and approved by your line manager.'
          : 'Your Time In/Out Correction request has been reviewed and rejected by your line manager.')}</p>
        <div className="hrm-email-details">
          <h4>Request Summary</h4>
          <p><strong>Application:</strong> {event.applicationType || 'Time In/Out Correction'}</p>
          <p><strong>Application Date:</strong> {event.date || '04/23/2026'}</p>
          <p><strong>Status:</strong> <span className={`hrm-status-pill ${isApproved ? 'approved' : 'rejected'}`}>{isApproved ? 'Approved' : 'Rejected'}</span></p>
          <p><strong>Approver Remarks:</strong> {event.remarks || (isApproved ? 'Verified against biometrics log.' : 'Incomplete supporting document / receipt.')}</p>
        </div>
        <div className="hrm-email-actions">
          <button type="button" className="hrm-btn primary" onClick={() => { onClose(); onNavigate?.(); }}>
            View in Employee Self-Service
          </button>
        </div>
      </div>
    </div>
  </Modal>;
}

export { ArrowLeft, CalendarBlank };
