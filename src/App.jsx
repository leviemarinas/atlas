import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bank,
  Bell,
  Buildings,
  CalendarBlank,
  CaretDown,
  Check,
  CheckCircle,
  Clock,
  CurrencyCircleDollar,
  Cube,
  DownloadSimple,
  FileText,
  FirstAid,
  Gear,
  House,
  IdentificationCard,
  Info,
  Key,
  MagnifyingGlass,
  PencilSimple,
  Phone,
  Plus,
  PuzzlePiece,
  Scales,
  ShieldCheck,
  SignOut,
  SlidersHorizontal,
  Sparkle,
  SquaresFour,
  Table,
  Ticket,
  Trash,
  UserCircle,
  UserFocus,
  Users,
  Wrench,
  X,
} from '@phosphor-icons/react';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import { EmployeeMasterfile } from './EmployeeMasterfile';
import { ComputationalBasis } from './ComputationalBasis';
import { ServiceConfiguration, ServicesHub } from './serviceModules';
import { PayrollHub, SettingsHub, StatutoryTables } from './StatutoryTables';
import { ReferenceTables } from './ReferenceTables';
import { StandardComputationAdmin } from './StandardComputationAdmin';
import { RoleSwitch } from './RoleContext';
import { readPolicies } from './PolicyComputations';

const violet = '#54248f';

const coreModules = [
  { label: 'Company Configuration', icon: Buildings, enabled: true },
  { label: 'Employee Masterfile', icon: IdentificationCard, enabled: true },
  { label: 'Access Right Configuration', icon: UserFocus },
  { label: 'Security Configuration', icon: Key },
  { label: 'Reference Table', icon: Table, enabled: true },
  { label: 'Navigation Configuration', icon: SlidersHorizontal },
  { label: 'Tickets', icon: Ticket },
  { label: 'Reports', icon: FileText },
  { label: 'Others', icon: SquaresFour },
];

const sideItems = [
  { label: 'Company Information', icon: Buildings, enabled: true, view: 'information' },
  { label: 'Services Information', icon: Wrench, enabled: true, view: 'services' },
  { label: 'Calendar Settings', icon: CalendarBlank },
  { label: 'Employee Onboarding', icon: IdentificationCard },
  { label: 'Employee Charge Codes', icon: CurrencyCircleDollar },
  { label: 'Happiness Meter', icon: CheckCircle },
  { label: 'Health & Wellness', icon: FirstAid },
  { label: 'Notifications', icon: Bell },
  { label: 'Company Rules', icon: Scales, enabled: true, view: 'rules' },
  { label: 'Connected Systems', icon: PuzzlePiece },
];

const baseRules = [
  { id: 1, category: 'Pay and Earnings', subcategory: 'Earnings and Allowances', rule: 'Premium Pay', parameter: '-', enabled: true },
  { id: 2, category: 'Pay and Earnings', subcategory: 'Earnings and Allowances', rule: 'Wage of Apprentices, Learners, and Persons with disability', parameter: '-', enabled: true },
  { id: 3, category: 'Pay and Earnings', subcategory: 'Basic Pay', rule: 'Expats basic pay is based on grossed up basic pay; remaining employees get daily and semi-monthly basic pay', parameter: '-', enabled: true },
  { id: 4, category: 'Time Management & Scheduling', subcategory: 'Shift Schedule Creation', rule: 'Required number of work hours per day', parameter: '8 hours', enabled: true },
  { id: 5, category: 'Attendance & Timekeeping', subcategory: 'Absences', rule: 'Basis of Absent Computation\nBasic Pay / (30 × number of days absent)', parameter: '-', enabled: true },
  { id: 6, category: 'Leave Management', subcategory: 'Leave', rule: 'Service Incentive Leave — the employee has rendered at least one year of service.', parameter: '-', enabled: true },
  { id: 7, category: 'Leave Management', subcategory: 'Leave', rule: 'SL Conversion release every January based on daily rate; 10 days unused VL considered as nontaxable. Excess of 10 days is taxable.', parameter: '-', enabled: true },
  { id: 8, category: 'Government & Company Compliance', subcategory: 'Multiple Bank Account - Company', rule: 'BDO, BPI, DBP, GCASH, MAYA, HSBC, PNB, SECBA, STLA, UBP', parameter: '-', enabled: true },
  { id: 9, category: 'Attendance & Timekeeping', subcategory: 'Tardiness', rule: 'Allowance Adjustment\nBased on hourly rate and factor days of employees: Rank and File (313 days); Staff & Managers (261 days)', parameter: '-', enabled: true },
  { id: 10, category: 'Pay and Earnings', subcategory: 'Earnings and Allowances', rule: 'Wage of Kasambahay', parameter: '-', enabled: true },
  { id: 11, category: 'Pay and Earnings', subcategory: 'Benefits', rule: 'Meal allowance eligibility', parameter: '₱120/day', enabled: false },
  { id: 12, category: 'Attendance & Timekeeping', subcategory: 'Overtime', rule: 'Overtime starts after the regular shift', parameter: '30 mins', enabled: true },
];

// Take-home, deduction-hierarchy and retirement entries are intentionally absent:
// they are computation parameters owned by Computational Basis, surfaced here
// read-only by DerivedPolicies rather than duplicated as editable free text.
const initialRules = [
  ...baseRules,
  ...Array.from({ length: 65 }, (_, index) => {
    const source = baseRules[index % baseRules.length];
    return { ...source, id: baseRules.length + index + 1, rule: `${source.rule.split('\n')[0]} — policy ${index + 2}` };
  }),
];

const companySections = [
  { id: 'setup', title: 'Setup & Verification', icon: ShieldCheck },
  { id: 'basic', title: 'Basic Information', icon: Buildings },
  { id: 'contact', title: 'Contact Details', icon: Phone },
  { id: 'bank', title: 'Bank Management', icon: Bank },
  { id: 'services', title: 'Services Information', icon: Wrench },
  { id: 'representative', title: 'Authorized Representative', icon: UserFocus },
];

const defaultCompanyData = {
  setup: { 'Registration status': 'Verified', 'TIN': '000-123-456-000' },
  basic: { 'Legal company name': 'ABC Company Ltd', 'Trade name': 'ABC Company', 'Business type': 'Corporation' },
  contact: { 'Email address': 'payroll@abccompany.ph', 'Phone number': '+63 2 8123 4567', 'Office address': 'Makati City, Metro Manila' },
  bank: { 'Primary bank': 'BDO Unibank', 'Account name': 'ABC Company Ltd', 'Account number': '•••• 8472' },
  services: { 'Payroll frequency': 'Semi-monthly', 'Default currency': 'PHP', 'Time zone': 'Asia/Manila' },
  representative: { 'Full name': 'Maria Santos', 'Role': 'HR Director', 'Email address': 'maria.santos@abccompany.ph' },
};

function BrandRail({ onHome, onCore = onHome, onPayroll, onSettings, active = 'core' }) {
  return (
    <aside className="brand-rail" aria-label="Primary navigation">
      <button className="brand-mark" onClick={onHome} aria-label="Home"><Sparkle weight="fill" /></button>
      <button className="rail-button" onClick={onHome} aria-label="Home"><House /></button>
      <button className={`rail-button ${active === 'core' ? 'active' : ''}`} onClick={onCore} aria-label="Core"><Cube weight="duotone" /></button>
      <button className="rail-button" disabled aria-label="Employees unavailable"><Users /></button>
      <button className="rail-button" disabled aria-label="Time unavailable"><Clock /></button>
      <button className={`rail-button ${active === 'payroll' ? 'active' : ''}`} onClick={onPayroll} aria-label="Payroll"><CurrencyCircleDollar weight="duotone" /></button>
      <div className="rail-spacer" />
      <button className={`rail-button ${active === 'settings' ? 'active' : ''}`} onClick={onSettings} aria-label="Settings"><Gear /></button>
      <button className="rail-button" disabled aria-label="Sign out unavailable"><SignOut /></button>
    </aside>
  );
}

function Topbar() {
  return (
    <header className="topbar">
      <button className="company-switch">ABC Company Ltd <CaretDown weight="bold" /></button>
      <div className="top-actions">
        <RoleSwitch />
        <button className="icon-button" aria-label="Search"><MagnifyingGlass /></button>
        <button className="icon-button notification" aria-label="Notifications"><Bell /></button>
        <div className="avatar">JD</div>
        <button className="profile">John Doe <CaretDown weight="bold" /></button>
      </div>
    </header>
  );
}

function DisabledHint({ children, disabled }) {
  return <span className={disabled ? 'disabled-wrap' : ''} data-hint={disabled ? 'Available in a future module' : undefined}>{children}</span>;
}

function CoreHome({ onOpen, onNavigate }) {
  return (
    <div className="app-shell core-screen">
      <BrandRail onHome={() => onNavigate('core')} onCore={() => onNavigate('core')} onPayroll={() => onNavigate('payroll')} onSettings={() => onNavigate('settings')} active="core" />
      <main className="shell-main">
        <Topbar />
        <div className="core-content">
          <section className="hero-card">
            <p className="eyebrow">Administration workspace</p>
            <h1>Core</h1>
            <p>Manage the building blocks that power your payroll operations.</p>
          </section>
          <section className="module-grid" aria-label="Core modules">
            {coreModules.map(({ label, icon: Icon, enabled }) => (
              <DisabledHint key={label} disabled={!enabled}>
                <button className={`module-card ${enabled ? 'enabled' : ''}`} onClick={enabled ? () => onOpen(label) : undefined} disabled={!enabled}>
                  <Icon size={43} weight="duotone" />
                  <span>{label}</span>
                  {!enabled && <small>Coming soon</small>}
                </button>
              </DisabledHint>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}

function CompanySidebar({ view, setView, onBack }) {
  return (
    <aside className="company-sidebar">
      <button className="back-link" onClick={onBack}><ArrowLeft /> Back to Core</button>
      <h2>Company<br />Configuration</h2>
      <nav>
        {sideItems.map(({ label, icon: Icon, enabled, view: itemView }) => (
          <DisabledHint key={label} disabled={!enabled}>
            <button
              className={`side-link ${view === itemView ? 'selected' : ''}`}
              onClick={enabled ? () => setView(itemView) : undefined}
              disabled={!enabled}
            >
              <Icon weight={view === itemView ? 'fill' : 'regular'} />
              <span>{label}</span>
            </button>
          </DisabledHint>
        ))}
      </nav>
    </aside>
  );
}

function CompanyLayout({ children, view, setView, onBack, onNavigate }) {
  return (
    <div className="app-shell company-screen">
      <BrandRail onHome={onBack} onCore={onBack} onPayroll={() => onNavigate('payroll')} onSettings={() => onNavigate('settings')} active="core" />
      <CompanySidebar view={view} setView={setView} onBack={onBack} />
      <main className="company-main">
        <Topbar />
        {children}
      </main>
    </div>
  );
}

function PlatformLayout({ children, screen, onNavigate }) {
  const active = screen.includes('settings') || screen.includes('computation-admin') ? 'settings' : 'payroll';
  return <div className="app-shell core-screen platform-screen">
    <BrandRail onHome={() => onNavigate('core')} onCore={() => onNavigate('core')} onPayroll={() => onNavigate('payroll')} onSettings={() => onNavigate('settings')} active={active} />
    <main className="shell-main"><Topbar />{children}</main>
  </div>;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <button className={`toast ${toast.type}`} onClick={onClose} aria-label="Dismiss notification">
      {toast.type === 'success' ? <CheckCircle weight="fill" /> : <Info weight="fill" />}
      <span>{toast.message}</span><X />
    </button>
  );
}

function CompanyInformation({ data, setData, completed, setCompleted, setToast, onOpenServices }) {
  const [active, setActive] = useState(null);
  const completedCount = completed.length;

  const saveSection = (values) => {
    setData(prev => ({ ...prev, [active]: values }));
    setCompleted(prev => prev.includes(active) ? prev : [...prev, active]);
    setActive(null);
    setToast({ type: 'success', message: 'Company information saved successfully.' });
  };

  return (
    <div className="page-content information-page">
      <div className="page-heading">
        <div><p className="breadcrumb">Core / Company Configuration</p><h1>Company Information</h1></div>
      </div>
      <div className="information-layout">
        <div className="section-cards">
          {companySections.map(({ id, title, icon: Icon }) => (
            <button key={id} className="info-card" onClick={() => {
              if (id === 'services') {
                setCompleted(prev => prev.includes('services') ? prev : [...prev, 'services']);
                onOpenServices();
              } else setActive(id);
            }}>
              <div className="info-icon"><Icon weight="duotone" /></div>
              <span>{title}</span><ArrowRight />
            </button>
          ))}
        </div>
        <aside className="progress-card">
          <h3>Your Progress</h3>
          <div className="progress-meta"><strong>{Math.round((completedCount / companySections.length) * 100)}%</strong><span>{completedCount} of 6 complete</span></div>
          <div className="progress-track"><div style={{ width: `${(completedCount / companySections.length) * 100}%` }} /></div>
          <ul>
            {companySections.map(section => (
              <li key={section.id} className={completed.includes(section.id) ? 'done' : ''}>
                {completed.includes(section.id) ? <CheckCircle weight="fill" /> : <CheckCircle />}
                <span>{section.title}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      {active && (
        <CompanyForm
          title={companySections.find(s => s.id === active).title}
          values={data[active]}
          onClose={() => setActive(null)}
          onSave={saveSection}
        />
      )}
    </div>
  );
}

function CompanyForm({ title, values, onClose, onSave }) {
  const [draft, setDraft] = useState(values);
  return (
    <Modal title={title} onClose={onClose} width="620px">
      <form onSubmit={(e) => { e.preventDefault(); onSave(draft); }}>
        <p className="form-intro">Review and update the details below. Changes are kept in this prototype session.</p>
        <div className="form-grid">
          {Object.entries(draft).map(([key, value]) => (
            <label key={key}>{key}<span className="required">*</span>
              <input value={value} onChange={e => setDraft({ ...draft, [key]: e.target.value })} required />
            </label>
          ))}
        </div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Save changes</button></div>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children, width = '760px' }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ '--modal-width': width }}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

const categories = ['All categories', ...new Set(initialRules.map(r => r.category))];

const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

/**
 * Take-home and retirement qualifiers are configured in Computational Basis.
 * They are shown here read-only so Company Rules stays a single register of
 * company policy without becoming a second, editable copy of the parameters.
 */
function DerivedPolicies({ onOpenPolicies }) {
  const policies = useMemo(() => readPolicies(), []);
  const { takeHome, retirement, finalPay } = policies;
  const rows = [
    ['Take-Home Pay', 'Net pay protection', takeHome.enabled ? 'Enabled' : 'Disabled'],
    ['Take-Home Pay', `Protected minimum on ${takeHome.base.toLowerCase()}`, takeHome.thresholdType === 'Percentage' ? `${takeHome.threshold}%` : peso(takeHome.threshold)],
    ['Take-Home Pay', 'Statutory deductions are always applied in full', 'Never deferred'],
    ['Take-Home Pay', 'Conflict priority when the loan cap and the threshold disagree', takeHome.priorityChoice],
    ['Deduction Hierarchy', 'Adjustment order for controllable loans and deductions', 'Reference table REF-011'],
    ['Deferred Deductions', 'Carry forward with outstanding amount, schedule and balance', takeHome.carryForward ? 'Auto carry-forward' : 'Off'],
    ['Retirement Pay', 'Eligibility', `Age ${retirement.minimumAge}–${retirement.compulsoryAge}; ${retirement.minimumServiceYears} years service`],
    ['Retirement Pay', 'Plan basis', retirement.planType],
    ['Retirement Pay', 'Service rounding', retirement.rounding],
    ['Final Pay', 'Retirement pay forms part of final pay', finalPay.components['Retirement pay'] ? 'Included' : 'Excluded'],
    ['Final Pay', 'Net pay rule when negative', finalPay.negativeNetPayRule],
  ];
  return (
    <section className="derived-policies">
      <header>
        <div><ShieldCheck weight="duotone" /><div><h2>Derived from Computational Basis</h2><p>These qualifiers are read-only here. Edit them in the policy engines so the rule register and the computations cannot drift apart.</p></div></div>
        <button className="button secondary" onClick={onOpenPolicies}>Open policy engines <ArrowRight /></button>
      </header>
      <table>
        <thead><tr><th>Sub-Category</th><th>Policy</th><th>Current setting</th></tr></thead>
        <tbody>{rows.map(([subcategory, rule, parameter]) => <tr key={`${subcategory}-${rule}`}><td>{subcategory}</td><td>{rule}</td><td><span className="derived-value">{parameter}</span></td></tr>)}</tbody>
      </table>
    </section>
  );
}

function RulesPage({ rules, setRules, setToast, onOpenPolicies }) {
  const [tab, setTab] = useState('Rules');
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [category, setCategory] = useState('All categories');
  const [enabledOnly, setEnabledOnly] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [page, setPage] = useState(1);
  const perPage = 10;
  const filtered = useMemo(() => rules.filter(r => {
    const text = `${r.category} ${r.subcategory} ${r.rule} ${r.parameter}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (category === 'All categories' || r.category === category) && (!enabledOnly || r.enabled);
  }), [rules, query, category, enabledOnly]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const shown = filtered.slice((page - 1) * perPage, page * perPage);

  const saveRule = (rule) => {
    const conflict = rules.some(r => r.id !== rule.id && r.category === rule.category && r.subcategory === rule.subcategory && r.rule.toLowerCase() === rule.rule.toLowerCase());
    if (conflict) {
      setToast({ type: 'error', message: 'A similar rule already exists. Please review and try again.' });
      return false;
    }
    if (rule.id) setRules(prev => prev.map(r => r.id === rule.id ? rule : r));
    else setRules(prev => [{ ...rule, id: Math.max(...prev.map(r => r.id), 0) + 1 }, ...prev]);
    setEditing(null);
    setToast({ type: 'success', message: rule.id ? 'Rule updated successfully.' : 'Rule added successfully.' });
    return true;
  };

  return (
    <div className="page-content rules-page">
      <div className="page-heading"><div><p className="breadcrumb">Core / Company Configuration</p><h1>Company Rules</h1></div></div>
      <div className="tabs" role="tablist">
        {['Rules', 'Enable / Disable Fields', 'Modules & Features', 'Preferences'].map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      {tab === 'Rules' ? (
        <>
          <DerivedPolicies onOpenPolicies={onOpenPolicies} />
          <div className="rules-toolbar">
            <div className="search-box"><input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Search rules..." /><MagnifyingGlass /></div>
            <button className={`filter-button ${(category !== 'All categories' || enabledOnly) ? 'applied' : ''}`} onClick={() => setFilterOpen(true)}><SlidersHorizontal /> Filter</button>
            <div className="toolbar-spacer" />
            <button className="button primary" onClick={() => setEditing({ category: 'Time Management & Scheduling', subcategory: 'Time In & Time Out', rule: '', parameter: '', enabled: true, groupBy: 'Date Hired', groupValue: '01-Jul' })}><Plus /> Apply New Rule</button>
            <button className="button secondary" onClick={() => exportRules(filtered)}><DownloadSimple /> Export</button>
          </div>
          <div className="table-card">
            <table>
              <thead><tr><th>Category</th><th>Sub-Category</th><th>Specific Rule</th><th>Parameter</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {shown.length ? shown.map(row => (
                  <tr key={row.id}>
                    <td>{row.category}</td><td>{row.subcategory}</td><td className="rule-cell">{row.rule.split('\n').map((line, i) => <span key={i}>{line}</span>)}</td><td>{row.parameter}</td>
                    <td><div className="row-actions"><button onClick={() => setEditing(row)} aria-label="Edit rule"><PencilSimple /></button><button onClick={() => setDeleting(row)} aria-label="Delete rule"><Trash /></button></div></td>
                  </tr>
                )) : <tr><td colSpan="5"><div className="empty-state"><MagnifyingGlass /><h3>No rules found</h3><p>Try changing your search or filter.</p></div></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="pagination"><span>Displaying <strong>{shown.length}</strong> of {filtered.length} items</span><div><button disabled={page === 1} onClick={() => setPage(1)}>«</button><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button><strong>{page}</strong><span>of {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage(p => p + 1)}>›</button><button disabled={page === pageCount} onClick={() => setPage(pageCount)}>»</button></div></div>
        </>
      ) : <SettingsTab key={tab} tab={tab} setToast={setToast} />}
      {filterOpen && <FilterPanel category={category} setCategory={setCategory} enabledOnly={enabledOnly} setEnabledOnly={setEnabledOnly} onClose={() => setFilterOpen(false)} onReset={() => { setCategory('All categories'); setEnabledOnly(false); }} />}
      {editing && <RuleForm rule={editing} onClose={() => setEditing(null)} onSave={saveRule} />}
      {deleting && <DeleteDialog rule={deleting} onClose={() => setDeleting(null)} onDelete={() => { setRules(prev => prev.filter(r => r.id !== deleting.id)); setDeleting(null); setToast({ type: 'success', message: 'Rule deleted successfully.' }); }} />}
    </div>
  );
}

function exportRules(rules) {
  const header = ['Category', 'Sub-Category', 'Specific Rule', 'Parameter', 'Enabled'];
  const rows = rules.map(r => [r.category, r.subcategory, r.rule.replace(/\n/g, ' '), r.parameter, r.enabled ? 'Yes' : 'No']);
  const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'company-rules.csv'; link.click(); URL.revokeObjectURL(link.href);
}

function FilterPanel({ category, setCategory, enabledOnly, setEnabledOnly, onClose, onReset }) {
  return (
    <div className="drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="filter-drawer">
        <header><h2>Filter</h2><button className="icon-button" onClick={onClose}><X /></button></header>
        <div className="drawer-body">
          <label>Category<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label>Sub-Category<select><option>All sub-categories</option></select></label>
          <label>Specific Rule<input placeholder="Contains text..." /></label>
          <label>Employee Group Applied<select><option>All employee groups</option></select></label>
          <label>Last Modified By<select><option>Anyone</option></select></label>
          <label>Last Modified Date<input type="date" /></label>
          <label className="checkbox-row"><input type="checkbox" checked={enabledOnly} onChange={e => setEnabledOnly(e.target.checked)} /> Enabled rules only</label>
        </div>
        <footer><button className="button secondary" onClick={onReset}>Reset</button><button className="button primary" onClick={onClose}>Apply Filter</button></footer>
      </aside>
    </div>
  );
}

function RuleForm({ rule, onClose, onSave }) {
  const [draft, setDraft] = useState({ groupBy: 'Date Hired', groupValue: '01-Jul', ...rule });
  const update = (key, value) => setDraft(prev => ({ ...prev, [key]: value }));
  const hasConflictCopy = draft.rule.toLowerCase().includes('clock in');
  return (
    <Modal title={draft.id ? 'Edit Rule' : 'Apply New Rule'} onClose={onClose} width="780px">
      <form className="rule-form" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
        <label>Employee Group<span className="required">*</span><select value={draft.groupBy} onChange={e => update('groupBy', e.target.value)}><option>Date Hired</option><option>Absence Classification</option><option>Age</option><option>Date Hired On and After</option></select></label>
        <div className="employee-group-box">
          <div className="group-options">
            {['Absence Classification', 'Age', 'Date Hired', 'Date Hired On and After', 'Date Hired Prior', 'Date Hired Upto'].map(option => <button type="button" key={option} className={draft.groupBy === option ? 'selected' : ''} onClick={() => update('groupBy', option)}>{draft.groupBy === option ? <Check weight="bold" /> : <span />} {option}</button>)}
          </div>
          <label>{draft.groupBy}<input value={draft.groupValue} onChange={e => update('groupValue', e.target.value)} required /></label>
        </div>
        <p className="applies-copy">Applies to <strong>1,307 employee(s)</strong> based on current selection.</p>
        <div className="two-columns"><label>Category<span className="required">*</span><select value={draft.category} onChange={e => update('category', e.target.value)}>{categories.slice(1).map(c => <option key={c}>{c}</option>)}</select></label><label>Sub-category<span className="required">*</span><input value={draft.subcategory} onChange={e => update('subcategory', e.target.value)} required /></label></div>
        <label>Specific Rule<span className="required">*</span><textarea value={draft.rule} onChange={e => update('rule', e.target.value)} placeholder="Describe the company rule" required /></label>
        {hasConflictCopy && <p className="warning-copy">It looks like some rules are overlapping. Please review the highlighted rules and resolve conflicts so everything works as intended.</p>}
        <h3 className="form-subheading">Rule Parameters</h3>
        <label>Parameter<input value={draft.parameter} onChange={e => update('parameter', e.target.value)} placeholder="e.g. 8 hours" /></label>
        <label className="switch-row"><button type="button" className={`switch ${draft.enabled ? 'on' : ''}`} onClick={() => update('enabled', !draft.enabled)}><span /></button> Enable Rule</label>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{draft.id ? 'Save changes' : 'Submit'}</button></div>
      </form>
    </Modal>
  );
}

function DeleteDialog({ rule, onClose, onDelete }) {
  return (
    <Modal title="Delete Rule" onClose={onClose} width="440px">
      <div className="delete-copy"><div className="delete-icon"><Trash weight="duotone" /></div><div><h3>Delete this company rule?</h3><p>“{rule.rule.slice(0, 95)}{rule.rule.length > 95 ? '…' : ''}”</p><p>This action is irreversible.</p></div></div>
      <div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" onClick={onDelete}>Delete</button></div>
    </Modal>
  );
}

function SettingsTab({ tab, setToast }) {
  const configs = {
    'Enable / Disable Fields': ['Employee middle name', 'Biometric ID', 'Bank branch', 'Emergency contact'],
    'Modules & Features': ['Automated payroll runs', 'Employee self-service', 'Leave approvals', 'Bank file generation'],
    Preferences: ['Require approval before publishing', 'Send admin email summaries', 'Show payroll cutoff reminders', 'Use compact table density'],
  };
  const [values, setValues] = useState(() => Object.fromEntries(configs[tab].map((v, i) => [v, i < 3])));
  return (
    <section className="settings-panel">
      <div><h2>{tab}</h2><p>Control how this company configuration behaves for your payroll administrators.</p></div>
      <div className="setting-list">{configs[tab].map(item => <div key={item}><span>{item}<small>Applies to ABC Company Ltd</small></span><button className={`switch ${values[item] ? 'on' : ''}`} onClick={() => setValues({ ...values, [item]: !values[item] })}><span /></button></div>)}</div>
      <div className="settings-actions"><button className="button primary" onClick={() => setToast({ type: 'success', message: `${tab} saved successfully.` })}>Save changes</button></div>
    </section>
  );
}

export function App() {
  const [screen, setScreen] = useState('core');
  const [view, setView] = useState('information');
  const [rules, setRules] = useState(() => {
    try { return JSON.parse(localStorage.getItem('atlas-company-rules-v2')) || initialRules; } catch { return initialRules; }
  });
  const [companyData, setCompanyData] = useState(defaultCompanyData);
  const [completed, setCompleted] = useState(['setup', 'basic', 'contact']);
  const [toast, setToast] = useState(null);

  const pathname = window.location.pathname.toLowerCase();
  const experience = pathname.startsWith('/wireframe') ? 'wireframe' : pathname.startsWith('/monochrome') ? 'monochrome' : 'original';
  useEffect(() => { document.documentElement.dataset.experience = experience; }, [experience]);
  useEffect(() => { localStorage.setItem('atlas-company-rules-v2', JSON.stringify(rules)); }, [rules]);

  const notify = (value) => { setToast(value); window.setTimeout(() => setToast(null), 4200); };
  const navigate = destination => setScreen(destination);
  if (screen === 'core') return <CoreHome onNavigate={navigate} onOpen={(module) => {
    if (module === 'Employee Masterfile') setScreen('employee');
    else if (module === 'Reference Table') setScreen('reference');
    else { setScreen('company'); setView('information'); }
  }} />;
  if (screen === 'employee') return <>
    <Toast toast={toast} onClose={() => setToast(null)} />
    <EmployeeMasterfile onBack={() => setScreen('core')} notify={notify} />
  </>;
  if (screen === 'reference') return <>
    <Toast toast={toast} onClose={() => setToast(null)} />
    <ReferenceTables onBack={() => setScreen('core')} notify={notify} />
  </>;
  if (screen === 'settings' || screen === 'payroll' || screen === 'statutory-settings' || screen === 'statutory-payroll' || screen === 'settings-computation-admin') return <PlatformLayout screen={screen} onNavigate={navigate}>
    <Toast toast={toast} onClose={() => setToast(null)} />
    {screen === 'settings' && <SettingsHub onOpen={() => setScreen('statutory-settings')} onOpenComputationLibrary={() => setScreen('settings-computation-admin')} />}
    {screen === 'payroll' && <PayrollHub onOpen={() => setScreen('statutory-payroll')} />}
    {screen === 'statutory-settings' && <StatutoryTables mode="settings" onBack={() => setScreen('settings')} notify={notify} />}
    {screen === 'statutory-payroll' && <StatutoryTables mode="payroll" onBack={() => setScreen('payroll')} notify={notify} />}
    {screen === 'settings-computation-admin' && <StandardComputationAdmin onBack={() => setScreen('settings')} notify={notify} />}
  </PlatformLayout>;
  return (
    <CompanyLayout view={view} setView={setView} onBack={() => setScreen('core')} onNavigate={navigate}>
      <Toast toast={toast} onClose={() => setToast(null)} />
      {view === 'information' && <CompanyInformation data={companyData} setData={setCompanyData} completed={completed} setCompleted={setCompleted} setToast={notify} onOpenServices={() => setView('services')} />}
      {view === 'rules' && <RulesPage rules={rules} setRules={setRules} setToast={notify} onOpenPolicies={() => setView('policies')} />}
      {view === 'services' && <ServicesHub onOpen={(moduleKey) => setView(moduleKey === 'computations' ? 'computations' : `service:${moduleKey}`)} />}
      {(view === 'computations' || view === 'policies') && <ComputationalBasis key={view} initialTab={view === 'policies' ? 'policies' : 'computations'} onBack={() => setView('services')} onOpenStatutory={() => setScreen('statutory-settings')} notify={notify} />}
      {view.startsWith('service:') && <ServiceConfiguration moduleKey={view.split(':')[1]} onBack={() => setView('services')} notify={notify} />}
    </CompanyLayout>
  );
}
