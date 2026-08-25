import { useEffect, useMemo, useRef, useState } from 'react';
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
  ClockCounterClockwise,
  CurrencyCircleDollar,
  Cube,
  DownloadSimple,
  FirstAid,
  Gear,
  House,
  IdentificationCard,
  Info,
  Key,
  Lock,
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
import { BrandRail, Topbar } from './AppChrome';
import { readPolicies, readPolicyCodes, savePolicyCode } from './PolicyComputations';
import { describeAssignment } from './PolicyApplicability';
import { completeParameterSchema, defaultParameterValues, parameterSchemaError, PolicyParameterFields } from './PolicyParameters';
import { getPolicyLinkage } from './policyGovernance';
import { companyRuleTaxonomy, requirementRuleSeeds } from './requirementsCatalog';
import { OperationalWorkspace } from './OperationalWorkspaces';
import { TicketingWorkspace } from './InheritedCapabilities';
import { defaultCompanyRecord, readActiveCompanyId, readCompanies, saveCompany, setActiveCompanyId as persistActiveCompanyId } from './companyRepository';
import { ModulesFeaturesTab } from './ModulesFeaturesTab';
import { HRMPortal } from './HRMPortal';
import { useRole } from './RoleContext';
import { canAccessScreen, landingScreen } from './moduleAccess';
import { TimekeepingPortal } from './TimekeepingPortal';
import { ScenarioStudio } from './ScenarioStudio';
import { readPayrollRuns } from './payrollRuns';
import { canEditPolicy, createPolicyVersion, normalizePolicy, policyUsage, readManagedPolicies } from './policyManagement';

const violet = '#54248f';

const coreModules = [
  { label: 'Company Configuration', icon: Buildings, enabled: true },
  { label: 'Employee Masterfile', icon: IdentificationCard, enabled: true },
  { label: 'Access & Approvals', icon: UserFocus, enabled: true },
  { label: 'Security Configuration', icon: Key, enabled: true },
  { label: 'Reference Table', icon: Table, enabled: true },
  { label: 'Navigation Configuration', icon: SlidersHorizontal, enabled: true },
  { label: 'Tickets', icon: Ticket, enabled: true },
  { label: 'Others', icon: SquaresFour },
];

const sideItems = [
  { label: 'Company Information', icon: Buildings, enabled: true, view: 'information' },
  { label: 'Calendar Settings', icon: CalendarBlank, enabled: true, view: 'workspace:calendar' },
  { label: 'Employee Onboarding', icon: IdentificationCard, enabled: true, view: 'workspace:employeeOnboarding', serviceCode: 'HRM' },
  { label: 'Employee Requests', icon: ClockCounterClockwise, enabled: true, view: 'workspace:timeCorrections', serviceCode: 'HRM' },
  { label: 'Employee Charge Codes', icon: CurrencyCircleDollar, enabled: true, view: 'workspace:chargeCodes', serviceCode: 'HRM' },
  { label: 'Happiness Meter', icon: CheckCircle, enabled: true, view: 'workspace:happiness', serviceCode: 'HAPPINESS' },
  { label: 'Health & Wellness', icon: FirstAid, enabled: true, view: 'workspace:wellness', serviceCode: 'WELLNESS' },
  { label: 'Notifications', icon: Bell, enabled: true, view: 'workspace:notifications' },
  { label: 'FAQ and Self-Learning', icon: Info, enabled: true, view: 'workspace:faq' },
  { label: 'Connected Systems', icon: PuzzlePiece, enabled: true, view: 'workspace:connectedSystems' },
];

/** Steps in the Apply New Rule wizard; the counters read their length. */
const ruleWizardSteps = ['Rule details', 'Policy engine', 'Review'];

const companySections = [
  { id: 'setup', title: 'Setup & Verification', icon: ShieldCheck },
  { id: 'basic', title: 'Basic Information', icon: Buildings },
  { id: 'contact', title: 'Contact Details', icon: Phone },
  { id: 'bank', title: 'Bank Management', icon: Bank },
  { id: 'services', title: 'Services Information', icon: Wrench },
  { id: 'authorizedContacts', title: 'Authorized Contact Persons', icon: UserFocus },
  { id: 'signatories', title: 'Authorized Signatories', icon: ShieldCheck },
];

const companyCollectionFields = {
  bank: ['Bank reference', 'Bank name', 'Account name', 'Account number', 'Branch', 'Account type', 'Bank company code', 'Payment mode', 'Default account', 'Effective from', 'Effective to', 'Status'],
  authorizedContacts: ['Full name', 'Role', 'Agency / responsibility', 'Email address', 'Mobile number', 'Effective date', 'Effective to', 'Status'],
  signatories: ['Full name', 'Title', 'Approval role', 'Email address', 'Signature file', 'Effective date', 'Effective to', 'Status'],
};

const defaultCompanyData = {
  setup: { 'Registration status': 'Verified', 'TIN': '000-123-456-000', 'Company code': 'ABC-PH-001', 'Activation date': '2026-01-01', 'Lifecycle status': 'Active', 'Offboarding status': 'Not scheduled', 'Permanent documents': '2 validated documents' },
  basic: { 'Legal company name': 'ABC Company Ltd', 'Trade name': 'ABC Company', 'Industry': 'Professional Services', 'Business type': 'Corporation', 'SEC / DTI registration no.': 'CS202600001', 'BIR RDO': '047', 'SSS branch code': 'SSS-NCR', 'PhilHealth branch code': 'PHIC-NCR', 'HDMF branch code': 'HDMF-NCR' },
  contact: { 'Email address': 'payroll@abccompany.ph', 'Phone number': '+63 2 8123 4567', 'Office address': 'Makati City, Metro Manila', 'Payroll contact': 'Maria Santos', 'Billing contact': 'Finance Operations', 'Remittance contact': 'Payroll Treasury' },
  bank: [{ 'Bank reference': 'BNK-001', 'Bank name': 'BDO Unibank', 'Account name': 'ABC Company Ltd', 'Account number': '•••• 8472', 'Branch': 'Makati', 'Account type': 'Payroll', 'Bank company code': 'ABC-PAY', 'Payment mode': 'Bank Transfer', 'Default account': 'Yes' }],
  services: { 'Payroll frequency': 'Semi-monthly', 'Payroll cutoff': '1st–15th / 16th–End', 'Default currency': 'PHP', 'Time zone': 'Asia/Manila', 'Pay rate factor days': '261', 'Payslip template': 'Standard Atlas Payslip', 'Approval hierarchy': 'Payroll Maker → Reviewer → Approver', 'Connected timekeeping system': 'Atlas Time' },
  authorizedContacts: [{ 'Full name': 'Maria Santos', 'Role': 'HR Director', 'Agency / responsibility': 'Payroll and BIR', 'Email address': 'maria.santos@abccompany.ph', 'Mobile number': '+63 917 100 1000', 'Effective date': '2026-01-01', 'Status': 'Active' }],
  signatories: [{ 'Full name': 'Andrea Reyes', 'Title': 'Chief Finance Officer', 'Approval role': 'Final payroll approver', 'Email address': 'andrea.reyes@abccompany.ph', 'Signature file': 'andrea-reyes-esignature.png', 'Effective date': '2026-01-01', 'Status': 'Active' }],
};

function companyRecordToData(company = defaultCompanyRecord) {
  const profile = company.profile || {};
  return {
    setup: {
      'Registration status': profile.registrationStatus || 'Pending',
      TIN: company.tin || '',
      'Company code': company.companyCode || '',
      'Activation date': company.activationDate || '',
      'Lifecycle status': company.lifecycleStatus || 'Draft',
      'Offboarding status': company.offboardingStatus || 'Not scheduled',
      'Permanent documents': `${(company.documents || []).filter(item => item.status === 'Validated').length} validated documents`,
    },
    basic: {
      'Legal company name': company.legalName || '',
      'Trade name': company.tradeName || company.displayName || '',
      Industry: company.industry || '',
      'Business type': company.businessType || '',
      'SEC / DTI registration no.': profile.secDtiNumber || '',
      'BIR RDO': profile.birRdo || '',
      'SSS branch code': profile.sssBranchCode || '',
      'PhilHealth branch code': profile.philHealthBranchCode || '',
      'HDMF branch code': profile.hdmfBranchCode || '',
    },
    contact: {
      'Email address': profile.email || '',
      'Phone number': profile.telephone || '',
      'Mobile number': profile.mobile || '',
      'Office address': profile.address || '',
      ZIP: profile.zip || '',
      Website: profile.website || '',
      'Payroll contact': profile.payrollContact || '',
      'Billing contact': profile.billingContact || '',
      'Remittance contact': profile.remittanceContact || '',
    },
    bank: (company.bankAccounts || []).map(account => ({
      'Bank reference': account.bankReference || '', 'Bank name': account.bankName || '', 'Account name': account.accountName || '',
      'Account number': account.accountNumber || '', Branch: account.branch || '', 'Account type': account.accountType || '',
      'Bank company code': account.bankCompanyCode || '', 'Payment mode': account.paymentMode || '', 'Default account': account.isDefault ? 'Yes' : 'No', 'Effective from': account.effectiveFrom || '', 'Effective to': account.effectiveTo || '', Status: account.status || 'Active',
    })),
    services: {
      'Enabled services': (company.serviceEnrollments || []).filter(item => item.enabled).map(item => item.name).join(', ') || 'None selected',
      'Service readiness': (company.serviceEnrollments || []).filter(item => item.enabled).every(item => ['Ready', 'Connected'].includes(item.status)) ? 'Ready' : 'Setup in progress',
      'Configuration links': 'Open Services Information for module configuration',
    },
    authorizedContacts: (company.authorizedContacts || []).map(contact => ({
      'Full name': contact.person || '', Role: contact.role || '', 'Agency / responsibility': contact.responsibility || '',
      'Email address': contact.email || '', 'Mobile number': contact.mobile || '', 'Effective date': contact.effectiveFrom || '', 'Effective to': contact.effectiveTo || '', Status: contact.status || 'Active',
    })),
    signatories: (company.signatories || []).map(signatory => ({
      'Full name': signatory.person || '', Title: signatory.title || '', 'Approval role': signatory.approvalRole || '',
      'Email address': signatory.email || '', 'Signature file': signatory.signatureDocumentId || '', 'Effective date': signatory.effectiveFrom || '', 'Effective to': signatory.effectiveTo || '', Status: signatory.status || 'Active',
    })),
  };
}

function companyWithSection(company, sectionId, values) {
  const next = { ...company, profile: { ...(company.profile || {}) } };
  if (sectionId === 'setup') {
    next.tin = values.TIN || next.tin;
  }
  if (sectionId === 'basic') {
    next.legalName = values['Legal company name'] || next.legalName;
    next.displayName = values['Trade name'] || next.displayName;
    next.tradeName = values['Trade name'] || next.tradeName;
    next.industry = values.Industry || next.industry;
    next.businessType = values['Business type'] || next.businessType;
    next.profile.secDtiNumber = values['SEC / DTI registration no.'] || '';
    next.profile.birRdo = values['BIR RDO'] || '';
    next.profile.sssBranchCode = values['SSS branch code'] || '';
    next.profile.philHealthBranchCode = values['PhilHealth branch code'] || '';
    next.profile.hdmfBranchCode = values['HDMF branch code'] || '';
  }
  if (sectionId === 'contact') {
    next.profile.email = values['Email address'] || '';
    next.profile.telephone = values['Phone number'] || '';
    next.profile.mobile = values['Mobile number'] || '';
    next.profile.address = values['Office address'] || '';
    next.profile.zip = values.ZIP || '';
    next.profile.website = values.Website || '';
    next.profile.payrollContact = values['Payroll contact'] || '';
    next.profile.billingContact = values['Billing contact'] || '';
    next.profile.remittanceContact = values['Remittance contact'] || '';
  }
  if (sectionId === 'bank') {
    next.bankAccounts = (values || []).map((account, index) => ({
      bankAccountId: company.bankAccounts?.[index]?.bankAccountId || `bank-${Date.now()}-${index}`,
      bankReference: account['Bank reference'] || '', bankName: account['Bank name'] || '', accountName: account['Account name'] || '', accountNumber: account['Account number'] || '',
      branch: account.Branch || '', accountType: account['Account type'] || '', bankCompanyCode: account['Bank company code'] || '', paymentMode: account['Payment mode'] || 'Bank Transfer',
      isDefault: account['Default account'] === 'Yes' || (index === 0 && values.length === 1), status: account.Status || 'Active', effectiveFrom: account['Effective from'] || company.bankAccounts?.[index]?.effectiveFrom || new Date().toISOString().slice(0, 10), effectiveTo: account['Effective to'] || company.bankAccounts?.[index]?.effectiveTo || '',
    }));
    if (next.bankAccounts.length && !next.bankAccounts.some(account => account.isDefault)) next.bankAccounts[0].isDefault = true;
    next.bankAccounts = next.bankAccounts.map((account, index) => ({ ...account, isDefault: index === next.bankAccounts.findIndex(item => item.isDefault) }));
  }
  if (sectionId === 'authorizedContacts') {
    next.authorizedContacts = (values || []).map((contact, index) => ({
      contactPersonId: company.authorizedContacts?.[index]?.contactPersonId || `contact-${Date.now()}-${index}`, person: contact['Full name'] || '', role: contact.Role || '', responsibility: contact['Agency / responsibility'] || '', email: contact['Email address'] || '', mobile: contact['Mobile number'] || '', effectiveFrom: contact['Effective date'] || '', effectiveTo: contact['Effective to'] || '', status: contact.Status || 'Active',
    }));
  }
  if (sectionId === 'signatories') {
    next.signatories = (values || []).map((signatory, index) => ({
      signatoryId: company.signatories?.[index]?.signatoryId || `signatory-${Date.now()}-${index}`, person: signatory['Full name'] || '', title: signatory.Title || '', approvalRole: signatory['Approval role'] || '', email: signatory['Email address'] || '', signatureDocumentId: signatory['Signature file'] || '', effectiveFrom: signatory['Effective date'] || '', effectiveTo: signatory['Effective to'] || '', status: signatory.Status || 'Active',
    }));
  }
  return next;
}


function DisabledHint({ children, disabled }) {
  return <span className={disabled ? 'disabled-wrap' : ''} data-hint={disabled ? 'Available in a future module' : undefined}>{children}</span>;
}

function CoreHome({ onOpen, onNavigate, company, companies, onSelectCompany }) {
  return (
    <div className="app-shell core-screen">
      <BrandRail onHome={() => onNavigate('core')} onCore={() => onNavigate('core')} onHrm={() => onNavigate('hrm')} onTime={() => onNavigate('timekeeping')} onPayroll={() => onNavigate('payroll')} onSettings={() => onNavigate('settings')} active="core" />
      <main className="shell-main">
        <Topbar company={company} companies={companies} onSelectCompany={onSelectCompany} />
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

function CompanySidebar({ view, setView, onBack, company }) {
  const enrolled = new Set((company?.serviceEnrollments || []).filter(item => item.enabled).map(item => item.serviceCode));
  const isEnabled = item => item.enabled && (!item.serviceCode || enrolled.has(item.serviceCode));
  return (
    <aside className="company-sidebar">
      <button className="back-link" onClick={onBack}><ArrowLeft /> Back to Core</button>
      <h2>Company<br />Configuration</h2>
      <nav>
        {sideItems.map((item) => {
          const { label, icon: Icon, view: itemView } = item;
          const enabled = isEnabled(item);
          return <DisabledHint key={label} disabled={!enabled}>
            <button
              className={`side-link ${view === itemView ? 'selected' : ''}`}
              onClick={enabled ? () => setView(itemView) : undefined}
              disabled={!enabled}
            >
              <Icon weight={view === itemView ? 'fill' : 'regular'} />
              <span>{label}</span>
            </button>
          </DisabledHint>;
        })}
      </nav>
    </aside>
  );
}

/** Views reachable from inside a section rather than from the sidebar. */
const nestedViewLabels = { computations: 'Computational Basis', policies: 'Policy Engines' };

function CompanyLayout({ children, view, setView, onBack, onNavigate, company, companies, onSelectCompany }) {
  const available = sideItems.filter((item) => item.enabled && (!item.serviceCode || (company?.serviceEnrollments || []).some(service => service.enabled && service.serviceCode === item.serviceCode)));
  const nestedLabel = nestedViewLabels[view] || (view.startsWith('service:') ? 'Services Information detail' : '');
  return (
    <div className="app-shell company-screen">
      <BrandRail onHome={onBack} onCore={onBack} onHrm={() => onNavigate('hrm')} onTime={() => onNavigate('timekeeping')} onPayroll={() => onNavigate('payroll')} onSettings={() => onNavigate('settings')} active="core" />
      <CompanySidebar view={view} setView={setView} onBack={onBack} company={company} />
      <main className="company-main">
        <Topbar company={company} companies={companies} onSelectCompany={onSelectCompany} />
        <div className="mobile-company-navigation">
          <label htmlFor="mobile-company-module">Company Configuration module</label>
          <select id="mobile-company-module" value={view} onChange={(event) => setView(event.target.value)}>
            {available.map((item) => (
              <option key={item.view} value={item.view}>{item.label}</option>
            ))}
            {!available.some(item => item.view === view) && <option value={view}>{nestedLabel || 'Current section'}</option>}
          </select>
        </div>
        {children}
      </main>
    </div>
  );
}

function PlatformLayout({ children, screen, onNavigate, company, companies, onSelectCompany }) {
  const active = screen.includes('settings') || screen.includes('computation-admin') ? 'settings' : 'payroll';
  return <div className="app-shell core-screen platform-screen">
    <BrandRail onHome={() => onNavigate('core')} onCore={() => onNavigate('core')} onHrm={() => onNavigate('hrm')} onTime={() => onNavigate('timekeeping')} onPayroll={() => onNavigate('payroll')} onSettings={() => onNavigate('settings')} active={active} />
    <main className="shell-main"><Topbar company={company} companies={companies} onSelectCompany={onSelectCompany} />{children}</main>
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

function CompanyInformation({ data, setData, completed, setCompleted, setToast, onOpenServices, company, onSaveCompany }) {
  const [active, setActive] = useState(null);
  const completedCount = completed.length;

  const saveSection = (values) => {
    setData(prev => ({ ...prev, [active]: values }));
    if (company && active !== 'services') onSaveCompany(companyWithSection(company, active, values));
    setCompleted(prev => prev.includes(active) ? prev : [...prev, active]);
    setActive(null);
    setToast({ type: 'success', message: 'Company information saved successfully.' });
  };

  const sectionSummary = id => {
    if (id === 'setup') return `${company?.lifecycleStatus || data.setup?.['Lifecycle status'] || 'Draft'} · ${data.setup?.['Permanent documents'] || 'Document readiness pending'}`;
    if (id === 'basic') return `${company?.industry || data.basic?.Industry || 'Industry not set'} · ${company?.businessType || data.basic?.['Business type'] || 'Business type pending'}`;
    if (id === 'contact') return `${company?.profile?.email || data.contact?.['Email address'] || 'Primary email pending'}`;
    if (id === 'bank') return `${(company?.bankAccounts || data.bank || []).length} account${(company?.bankAccounts || data.bank || []).length === 1 ? '' : 's'} · one default required`;
    if (id === 'services') return `${(company?.serviceEnrollments || []).filter(item => item.enabled).length} enrolled · configuration stays in Services Information`;
    if (id === 'authorizedContacts') return `${(company?.authorizedContacts || data.authorizedContacts || []).length} contact record${(company?.authorizedContacts || data.authorizedContacts || []).length === 1 ? '' : 's'}`;
    if (id === 'signatories') return `${(company?.signatories || data.signatories || []).length} signator${(company?.signatories || data.signatories || []).length === 1 ? 'y' : 'ies'}`;
    return '';
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
              <span><strong>{title}</strong><small>{sectionSummary(id)}</small></span><ArrowRight />
            </button>
          ))}
        </div>
        <aside className="progress-card">
          <h3>Your Progress</h3>
          <div className="progress-meta"><strong>{Math.round((completedCount / companySections.length) * 100)}%</strong><span>{completedCount} of {companySections.length} complete</span></div>
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
          sectionId={active}
          title={companySections.find(s => s.id === active).title}
          values={data[active]}
          onClose={() => setActive(null)}
           onSave={saveSection}
           readOnlyFields={active === 'setup' ? ['Registration status', 'Company code', 'Activation date', 'Lifecycle status', 'Offboarding status', 'Permanent documents'] : []}
           documents={active === 'setup' ? (company?.documents || []) : []}
           onDocumentsChange={documents => {
             if (!company) return;
             const saved = onSaveCompany({ ...company, documents });
             setData(companyRecordToData(saved));
             setToast({ type: 'success', message: 'Company document register updated.' });
           }}
         />
      )}
    </div>
  );
}

function CompanyDocumentEditor({ documents = [], onChange }) {
  const addDocument = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    onChange([...documents, { documentId: `doc-${Date.now()}`, documentType: 'Permanent company document', filename: file.name, status: 'Pending', expiryDate: '', uploadedAt: new Date().toISOString() }]);
    event.target.value = '';
  };
  const updateDocument = (documentId, changes) => onChange(documents.map(document => document.documentId === documentId ? { ...document, ...changes } : document));
  const removeDocument = document => {
    if (!window.confirm(`Remove ${document.filename} from the permanent document register?`)) return;
    onChange(documents.filter(item => item.documentId !== document.documentId));
  };
  return <section className="company-document-editor"><div className="company-collection-toolbar"><div><strong>Permanent document register</strong><small>Upload metadata, verify the evidence, and keep the lifecycle readiness gate auditable.</small></div><label className="button secondary upload-button"><Plus /> Add document<input className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={addDocument} /></label></div>{documents.length ? <div className="company-document-list">{documents.map(document => <div key={document.documentId} className="company-document-row"><div><strong>{document.filename}</strong><small>{document.documentType} · uploaded {String(document.uploadedAt || '').slice(0, 10)}</small></div><select aria-label={`Document status for ${document.filename}`} value={document.status || 'Pending'} onChange={event => updateDocument(document.documentId, { status: event.target.value })}><option>Pending</option><option>Validated</option><option>Rejected</option></select><button type="button" className="icon-button" onClick={() => removeDocument(document)} aria-label={`Remove ${document.filename}`}><Trash /></button></div>)}</div> : <p className="company-document-empty">No permanent documents registered yet.</p>}</section>;
}

function CompanyForm({ sectionId, title, values, onClose, onSave, readOnlyFields = [], documents = [], onDocumentsChange }) {
  const [draft, setDraft] = useState(values);
  const collectionFields = companyCollectionFields[sectionId];
  const optionalCollectionFields = ['Effective to'];
  const addCollectionRow = () => setDraft(previous => [...previous, Object.fromEntries(collectionFields.map(field => [field, field === 'Status' ? 'Active' : '']))]);
  return (
    <Modal title={title} onClose={onClose} width={collectionFields ? '920px' : '620px'}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(draft); }}>
        <p className="form-intro">{collectionFields ? 'Maintain multiple active and historical records. Add another entry whenever a bank, contact, or signatory changes.' : 'Review and update the details below. Changes are kept in this prototype session.'}</p>
         {collectionFields ? <div className="company-collection-editor"><div className="company-collection-toolbar"><span>{draft.length} record{draft.length === 1 ? '' : 's'}</span><button type="button" className="button secondary" onClick={addCollectionRow}><Plus /> Add record</button></div>{draft.map((record, index) => <section key={index} className="company-collection-row"><header><strong>{record['Full name'] || record['Bank name'] || `New ${title} record`}</strong><button type="button" className="icon-button" onClick={() => { if (window.confirm(`Remove this ${title.toLowerCase()} record?`)) setDraft(previous => previous.filter((_, itemIndex) => itemIndex !== index)); }} aria-label="Remove record"><Trash /></button></header><div className="form-grid">{collectionFields.map(field => <label key={field}>{field}{!optionalCollectionFields.includes(field) && <span className="required">*</span>}<input value={record[field] || ''} onChange={event => setDraft(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: event.target.value } : item))} required={!optionalCollectionFields.includes(field)} /></label>)}</div></section>)}</div> : <div className="form-grid">
           {Object.entries(draft).map(([key, value]) => (
             <label key={key}>{key}<span className="required">*</span>
              <input value={value ?? ''} readOnly={readOnlyFields.includes(key)} onChange={e => setDraft({ ...draft, [key]: e.target.value })} required />
            </label>
          ))}
         </div>}{sectionId === 'setup' && <CompanyDocumentEditor documents={documents} onChange={onDocumentsChange} />}
         <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Close</button>{(!collectionFields || !readOnlyFields.length) && <button className="button primary">Save changes</button>}{readOnlyFields.length > 0 && <span className="form-readonly-note">Lifecycle status and permanent-document readiness are derived from the lifecycle workflow.</span>}</div>
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

const categories = ['All categories', ...Object.keys(companyRuleTaxonomy)];
const moduleSubcategories = companyRuleTaxonomy;

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
    ['Deferred Deductions', 'Recovery of an outstanding amount above the staggering threshold', takeHome.recovery.method],
    ['Deferred Deductions', 'Approval and employee authorization before staggering', takeHome.recovery.requiresApproval ? `${takeHome.recovery.approvalRole}; ${takeHome.recovery.authorization.toLowerCase()}` : 'Not required'],
    ['Take-Home Pay', 'Applicability', describeAssignment(takeHome.assignment)],
    ['Retirement Pay', 'Applicability', describeAssignment(retirement.assignment)],
    ['Retirement Pay', 'Eligibility', `Age ${retirement.minimumAge}–${retirement.compulsoryAge}; ${retirement.minimumServiceYears} years service`],
    ['Retirement Pay', 'Plan basis', retirement.planType],
    ['Retirement Pay', 'Salary basis', retirement.salaryBasisSource],
    ['Retirement Pay', 'Rehire and break in service', retirement.serviceHistoryRule],
    ['Retirement Pay', 'Service rounding', retirement.rounding],
    ['Final Pay', 'Applicability', describeAssignment(finalPay.assignment)],
    ['Final Pay', 'Retirement pay forms part of final pay', finalPay.components['Retirement pay'] ? 'Included' : 'Excluded'],
    ['Final Pay', 'Separation pay by reason for leaving', `${finalPay.separationRules.filter(rule => rule.formula !== 'Not applicable').length} of ${finalPay.separationRules.length} reasons pay separation`],
    ['Final Pay', 'Applicable deduction hierarchy', finalPay.hierarchySource],
    ['Final Pay', 'Statutory contribution treatment', finalPay.statutoryRule],
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

function getEngineRows() {
  const { takeHome, retirement, finalPay } = readPolicies();
  return [
    { id: 'engine-thp-1', category: 'Pay and Earnings', subcategory: 'Take-Home Pay', rule: 'Net pay protection', parameter: 'THP-001', enabled: takeHome.enabled, engineOwned: true, setting: takeHome.thresholdType === 'Percentage' ? `${takeHome.threshold}% minimum` : `${peso(takeHome.threshold)} minimum` },
    { id: 'engine-thp-2', category: 'Pay and Earnings', subcategory: 'Take-Home Pay', rule: 'Maximum controllable deductions after mandatory statutory items', parameter: 'THP-002', enabled: takeHome.enabled, engineOwned: true, setting: takeHome.priorityChoice },
    { id: 'engine-ret-1', category: 'Pay and Earnings', subcategory: 'Retirement Pay', rule: 'Statutory retirement eligibility and benefit basis', parameter: 'RET-001', enabled: retirement.enabled, engineOwned: true, setting: `Age ${retirement.minimumAge}–${retirement.compulsoryAge}` },
    { id: 'engine-ret-2', category: 'Pay and Earnings', subcategory: 'Retirement Pay', rule: 'More beneficial statutory or company retirement plan', parameter: 'RET-002', enabled: retirement.enabled, engineOwned: true, setting: retirement.planType },
    { id: 'engine-def-1', category: 'Loans & Deductions', subcategory: 'Deferred Deductions', rule: 'Carry-forward and staggered recovery of outstanding amounts', parameter: 'DEF-001', enabled: takeHome.carryForward, engineOwned: true, setting: takeHome.recovery.method },
    { id: 'engine-ret-3', category: 'Pay and Earnings', subcategory: 'Retirement Pay', rule: 'Retirement salary basis and service history', parameter: 'RET-003', enabled: retirement.enabled, engineOwned: true, setting: retirement.salaryBasisSource },
    { id: 'engine-fin-1', category: 'Pay and Earnings', subcategory: 'Final Pay', rule: 'Net final pay from enabled components, selected earnings and authorized offsets', parameter: 'FIN-001', enabled: finalPay.enabled, engineOwned: true, setting: finalPay.negativeNetPayRule },
    { id: 'engine-fin-2', category: 'Pay and Earnings', subcategory: 'Final Pay', rule: 'Separation pay resolved from the employee reason for leaving', parameter: 'FIN-002', enabled: finalPay.enabled && finalPay.components['Separation pay'], engineOwned: true, setting: `${finalPay.separationRules.filter(rule => rule.formula !== 'Not applicable').length} of ${finalPay.separationRules.length} reasons pay separation` },
    { id: 'engine-fin-3', category: 'Pay and Earnings', subcategory: 'Final Pay', rule: 'Final pay deduction hierarchy and statutory contribution treatment', parameter: 'FIN-003', enabled: finalPay.enabled, engineOwned: true, setting: finalPay.hierarchySource },
  ];
}

function RulesPage({ rules, setRules, setToast, onOpenPolicies, onOpenModule }) {
  const [tab, setTab] = useState('Rules');
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [category, setCategory] = useState('All categories');
  const [subcategory, setSubcategory] = useState('All sub-categories');
  const [enabledOnly, setEnabledOnly] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [page, setPage] = useState(1);
  const perPage = 10;
  const engineRows = useMemo(getEngineRows, []);
  const registerRows = useMemo(() => [...engineRows, ...rules], [engineRows, rules]);
  const companyId = rules[0]?.companyId || readActiveCompanyId();
  const payrollRuns = useMemo(() => readPayrollRuns(companyId), [companyId]);
  const filtered = useMemo(() => registerRows.filter(r => {
    const text = `${r.category} ${r.subcategory} ${r.rule} ${r.parameter} ${r.setting || ''}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (category === 'All categories' || r.category === category) && (subcategory === 'All sub-categories' || r.subcategory === subcategory) && (!enabledOnly || r.enabled);
  }), [registerRows, query, category, subcategory, enabledOnly]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const shown = filtered.slice((page - 1) * perPage, page * perPage);

  const saveRule = (rule) => {
    const conflict = rules.some(r => r.id !== rule.id && r.category === rule.category && r.subcategory === rule.subcategory && r.rule.toLowerCase() === rule.rule.toLowerCase());
    if (conflict) {
      setToast({ type: 'error', message: 'A similar rule already exists. Please review and try again.' });
      return false;
    }
    const prepared = normalizePolicy({ ...rule, status: rule.enabled ? 'Active' : 'Inactive' }, 0, companyId);
    if (rule.id) setRules(prev => prev.map(r => r.id === rule.id ? prepared : r));
    else setRules(prev => [{ ...prepared, id: Math.max(...prev.map(r => Number(r.id) || 0), 0) + 1 }, ...prev]);
    setEditing(null);
    setToast({ type: 'success', message: rule.id ? 'Rule updated successfully.' : 'Rule added successfully.' });
    return true;
  };

  return (
    <div className="page-content rules-page">
      <div className="page-heading"><div><p className="breadcrumb">Payroll / Policy Management</p><h1>Policy Management</h1><p className="page-description">Manage effective-dated payroll policies and preserve the exact versions used by payroll transactions.</p></div></div>
      <div className="tabs" role="tablist">
        {['Rules', 'Enable / Disable Fields', 'Modules & Features', 'Preferences'].map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      {tab === 'Rules' ? (
        <>
          <div className="unified-register-note"><ShieldCheck weight="duotone" /><div><strong>Versioned policy register</strong><span>An Active policy stays editable until a payroll transaction uses it. Used policies are locked; create a new version to change future payroll.</span></div><button onClick={onOpenPolicies}>Manage policy engines <ArrowRight /></button></div>
          <div className="rules-toolbar">
            <div className="search-box"><input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Search rules..." /><MagnifyingGlass /></div>
            <button className={`filter-button ${(category !== 'All categories' || subcategory !== 'All sub-categories' || enabledOnly) ? 'applied' : ''}`} onClick={() => setFilterOpen(true)}><SlidersHorizontal /> Filter</button>
            <div className="toolbar-spacer" />
            <button className="button primary" onClick={() => setEditing({ category: 'Pay and Earnings', subcategory: 'Basic Pay', rule: '', parameter: '', policyCode: '', enabled: true, status: 'Active', version: '1.0', effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: '', groupBy: 'All Employees', groupValue: 'ABC Company Ltd' })}><Plus /> Add Policy</button>
            <button className="button secondary" onClick={() => exportRules(filtered)}><DownloadSimple /> Export</button>
          </div>
          <div className="table-card">
            <table>
              <thead><tr><th>Category</th><th>Sub-Category</th><th>Policy</th><th>Code / Version</th><th>Effective Period</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {shown.length ? shown.map(row => (
                  <tr key={row.id}>
                    <td>{row.category}</td><td>{row.subcategory}</td><td className="rule-cell">{row.rule.split('\n').map((line, i) => <span key={i}>{line}</span>)}{row.engineOwned && <small className="engine-owned-label"><ShieldCheck weight="fill" /> Policy engine owned</small>}{!row.engineOwned && policyUsage(row, payrollRuns).length > 0 && <small className="engine-owned-label"><Lock weight="fill" /> Used in {policyUsage(row, payrollRuns).length} payroll transaction{policyUsage(row, payrollRuns).length === 1 ? '' : 's'}</small>}</td><td><span className="policy-code-chip">{row.policyCode || row.parameter || 'Not assigned'}</span><small className="engine-setting">Version {row.version || '1.0'}</small>{row.setting && <small className="engine-setting">{row.setting}</small>}{row.parameterValues && <small className="engine-setting">{Object.keys(row.parameterValues).length} configured parameter{Object.keys(row.parameterValues).length === 1 ? '' : 's'}</small>}</td><td>{row.engineOwned ? 'Governed in engine' : `${row.effectiveFrom || '2026-01-01'} – ${row.effectiveTo || 'Open-ended'}`}</td><td><span className={`status-pill ${(row.status || (row.enabled ? 'Active' : 'Inactive')).toLowerCase()}`}>{row.status || (row.enabled ? 'Active' : 'Inactive')}</span></td>
                    <td><div className="row-actions">{row.engineOwned ? <button onClick={onOpenPolicies} aria-label="Open policy engine"><ShieldCheck /></button> : canEditPolicy(row, payrollRuns) ? <><button onClick={() => setEditing(row)} aria-label="Edit policy"><PencilSimple /></button><button onClick={() => setDeleting(row)} aria-label="Delete unused policy"><Trash /></button></> : <button onClick={() => setEditing(createPolicyVersion(row, rules))} aria-label="Create new policy version" title="Create new version"><Plus /></button>}</div></td>
                  </tr>
                )) : <tr><td colSpan="7"><div className="empty-state"><MagnifyingGlass /><h3>No policies found</h3><p>Try changing your search or filter.</p></div></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="pagination"><span>Displaying <strong>{shown.length}</strong> of {filtered.length} items</span><div><button disabled={page === 1} onClick={() => setPage(1)}>«</button><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button><strong>{page}</strong><span>of {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage(p => p + 1)}>›</button><button disabled={page === pageCount} onClick={() => setPage(pageCount)}>»</button></div></div>
        </>
      ) : <SettingsTab key={tab} tab={tab} setToast={setToast} onOpenModule={onOpenModule} />}
      {filterOpen && <FilterPanel category={category} setCategory={value => { setCategory(value); setSubcategory('All sub-categories'); }} subcategory={subcategory} setSubcategory={setSubcategory} enabledOnly={enabledOnly} setEnabledOnly={setEnabledOnly} onClose={() => setFilterOpen(false)} onReset={() => { setCategory('All categories'); setSubcategory('All sub-categories'); setEnabledOnly(false); }} />}
      {editing && <RuleForm rule={editing} onClose={() => setEditing(null)} onSave={saveRule} onOpenPolicies={() => { setEditing(null); onOpenPolicies(); }} />}
      {deleting && <DeleteDialog rule={deleting} onClose={() => setDeleting(null)} onDelete={() => { setRules(prev => prev.filter(r => r.id !== deleting.id)); setDeleting(null); setToast({ type: 'success', message: 'Unused policy deleted successfully.' }); }} />}
    </div>
  );
}

function exportRules(rules) {
  const header = ['Category', 'Sub-Category', 'Specific Rule', 'Parameter', 'Enabled'];
  const rows = rules.map(r => [r.category, r.subcategory, r.rule.replace(/\n/g, ' '), r.parameter, r.enabled ? 'Yes' : 'No']);
  const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'payroll-policies.csv'; link.click(); URL.revokeObjectURL(link.href);
}

function FilterPanel({ category, setCategory, subcategory, setSubcategory, enabledOnly, setEnabledOnly, onClose, onReset }) {
  return (
    <div className="drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="filter-drawer">
        <header><h2>Filter</h2><button className="icon-button" onClick={onClose}><X /></button></header>
        <div className="drawer-body">
          <label>Category<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label>Sub-Category<select value={subcategory} onChange={e => setSubcategory(e.target.value)}><option>All sub-categories</option>{(category === 'All categories' ? Object.values(moduleSubcategories).flat() : moduleSubcategories[category]).map(item => <option key={item}>{item}</option>)}</select></label>
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

function RuleForm({ rule, onClose, onSave, onOpenPolicies }) {
  const [draft, setDraft] = useState({ groupBy: 'All Employees', groupValue: 'ABC Company Ltd', ...rule });
  const [step, setStep] = useState(1);
  const [codes, setCodes] = useState(readPolicyCodes);
  const [creatingCode, setCreatingCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState({ code: '', name: '', description: '', templateCode: '', parameterSchema: [], parameterValues: {} });
  const [error, setError] = useState('');
  const update = (key, value) => setDraft(prev => ({ ...prev, [key]: value }));
  const hasConflictCopy = draft.rule.toLowerCase().includes('clock in');
  const availableCodes = codes.filter(item => item.category === draft.category && item.subcategory === draft.subcategory && item.status === 'Active');
  const selectedCode = codes.find(item => item.code === (draft.policyCode || draft.parameter));
  const selectedTemplateSize = selectedCode ? completeParameterSchema(selectedCode).length : 0;
  const linkage = getPolicyLinkage(draft);
  const engineForSelection = () => linkage.engine;
  const templateCandidates = codes.filter(item => item.status === 'Active' && item.isBuiltIn && item.parameterSchema?.length && item.category === draft.category && item.subcategory === draft.subcategory);
  const codeTemplate = templateCandidates.find(item => item.code === codeDraft.templateCode) || templateCandidates[0];
  const configuredValues = selectedCode ? { ...defaultParameterValues(selectedCode.parameterSchema), ...(selectedCode.parameterValues || {}), ...(draft.parameterValues || {}) } : {};
  const selectCode = item => setDraft(previous => ({ ...previous, policyCode: item.code, parameter: item.code, parameterValues: { ...defaultParameterValues(item.parameterSchema), ...(item.parameterValues || {}) } }));
  const goNext = () => {
    if (step === 1 && (!draft.category || !draft.subcategory || !draft.rule.trim() || !draft.groupValue)) return setError('Complete the required fields before continuing.');
    if (step === 2 && !draft.policyCode) return setError('Select a policy-engine code before continuing to review.');
    if (step === 2 && selectedCode?.parameterSchema.some(item => item.required && String(configuredValues[item.key] ?? '').trim() === '')) return setError('Complete all required policy parameters before continuing.');
    setError(''); setStep(current => Math.min(3, current + 1));
  };
  const beginCreateCode = () => {
    const template = templateCandidates[0];
    if (!template) return setError(`No governed ${engineForSelection()} template is available for this sub-category. Open the Policy Engine library to configure one first.`);
    const schema = completeParameterSchema(template);
    setCodeDraft({ code: '', name: '', description: template.description, templateCode: template.code, parameterSchema: schema, parameterValues: { ...defaultParameterValues(schema), ...(template.parameterValues || {}) } });
    setCreatingCode(true); setError('');
  };
  const createCode = () => {
    const code = codeDraft.code.trim().toUpperCase();
    if (!code || !codeDraft.name.trim() || !codeDraft.description.trim()) return setError('Complete the code, name, and description.');
    if (codes.some(item => item.code === code)) return setError('That policy-engine code already exists.');
    if (!codeTemplate) return setError('Choose an existing policy-engine template first.');
    const schema = completeParameterSchema(codeTemplate);
    const schemaError = parameterSchemaError(schema);
    if (schemaError) return setError(schemaError);
    const engine = engineForSelection();
    const parameterValues = { ...defaultParameterValues(schema), ...(codeDraft.parameterValues || {}) };
    const missing = schema.find(item => item.required && String(parameterValues[item.key] ?? '').trim() === '');
    if (missing) return setError(`Complete the required parameter: ${missing.label}.`);
    const record = { code, name: codeDraft.name.trim(), description: codeDraft.description.trim(), templateCode: codeTemplate.code, parameterSchema: schema.map(item => ({ ...item, options: [...(item.options || [])] })), parameterValues, category: draft.category, subcategory: draft.subcategory, engine, status: 'Active', isBuiltIn: false };
    const next = savePolicyCode(record);
    setCodes(next); setDraft(previous => ({ ...previous, policyCode: code, parameter: code, parameterValues: { ...defaultParameterValues(record.parameterSchema), ...(record.parameterValues || {}) } })); setCreatingCode(false); setError('');
  };
  const changeCategory = category => setDraft(previous => ({ ...previous, category, subcategory: moduleSubcategories[category][0], policyCode: '', parameter: '', parameterValues: {} }));
  const changeSubcategory = subcategory => setDraft(previous => ({ ...previous, subcategory, policyCode: '', parameter: '', parameterValues: {} }));
  return (
    <Modal title={draft.id ? 'Edit Policy' : draft.supersedesPolicyId ? 'Create New Policy Version' : 'Add Policy'} onClose={onClose} width="860px">
      <form className="rule-form rule-wizard" onSubmit={e => { e.preventDefault(); if (step < 3) goNext(); else onSave({ ...draft, parameter: draft.policyCode, parameterValues: configuredValues }); }}>
        <div className="wizard-steps" aria-label="Rule creation progress">
          {ruleWizardSteps.map((label, index) => <div key={label} className={`${step === index + 1 ? 'active' : ''} ${step > index + 1 ? 'complete' : ''}`}><span>{step > index + 1 ? <Check weight="bold" /> : index + 1}</span><strong>{label}</strong></div>)}
        </div>
        {step === 1 && <div className="wizard-panel">
          <div className="wizard-heading"><span>Step {1} of {ruleWizardSteps.length}</span><h3>Define who and what this rule applies to</h3><p>Rule parameters are assigned in the next step through a governed policy-engine code.</p></div>
          <div className="wizard-field-grid">
            <label>Employee group basis<span className="required">*</span><select value={draft.groupBy} onChange={e => update('groupBy', e.target.value)}>{['All Employees', 'Employee Type', 'Employee Category', 'Payroll Group', 'Job Level', 'Job Grade', 'Department', 'Location', 'Absence Classification', 'Age', 'Date Hired', 'Date Hired On and After', 'Date Hired Prior', 'Date Hired Upto'].map(option => <option key={option}>{option}</option>)}</select></label>
            <label>{draft.groupBy}<span className="required">*</span><input value={draft.groupValue} onChange={e => update('groupValue', e.target.value)} required /></label>
            <label>Category<span className="required">*</span><select value={draft.category} onChange={e => changeCategory(e.target.value)}>{Object.keys(moduleSubcategories).map(item => <option key={item}>{item}</option>)}</select></label>
            <label>Sub-category<span className="required">*</span><select value={draft.subcategory} onChange={e => changeSubcategory(e.target.value)}>{moduleSubcategories[draft.category].map(item => <option key={item}>{item}</option>)}</select></label>
            <label>Version<input value={draft.version || '1.0'} readOnly /></label>
            <label>Effective From<span className="required">*</span><input type="date" value={draft.effectiveFrom || ''} onChange={e => update('effectiveFrom', e.target.value)} required /></label>
            <label>Effective To<input type="date" min={draft.effectiveFrom || undefined} value={draft.effectiveTo || ''} onChange={e => update('effectiveTo', e.target.value)} /></label>
            <label className="wide">Specific rule<span className="required">*</span><textarea value={draft.rule} onChange={e => update('rule', e.target.value)} placeholder="Describe the business rule in plain language" required /></label>
          </div>
          <div className="rule-activation-card"><div><strong>Enable rule after creation</strong><span>Keep this on to activate the rule immediately. Turn it off to save the rule without applying it.</span></div><button type="button" className={`switch ${draft.enabled ? 'on' : ''}`} onClick={() => update('enabled', !draft.enabled)} aria-label="Enable rule"><span /></button></div>
          <p className="applies-copy">Current employee-group selection applies to <strong>1,307 employees</strong>.</p>
          {hasConflictCopy && <p className="warning-copy">It looks like some rules are overlapping. Review the wording before continuing.</p>}
        </div>}
        {step === 2 && <div className="wizard-panel">
          <div className="wizard-heading"><span>Step {2} of {ruleWizardSteps.length}</span><h3>Select the computation behind this rule</h3><p>Choose an active governed code mapped to <strong>{draft.subcategory}</strong>. To make a variant, copy the complete approved template and change only its company values.</p></div>
          <div className="rule-linkage-card"><div><small>Policy engine</small><strong>{linkage.engine}</strong></div><div><small>Standard computations</small><strong>{linkage.computations.length ? linkage.computations.join(', ') : 'Policy control — no arithmetic formula'}</strong></div><div><small>Reference sources</small><strong>{linkage.references.length ? linkage.references.join(', ') : 'No table dependency'}</strong></div><button type="button" className="button secondary" onClick={onOpenPolicies}>Open Policy Engine library <ArrowRight /></button></div>
          {availableCodes.length ? <div className="policy-code-picker">{availableCodes.map(item => <button type="button" key={item.code} className={draft.policyCode === item.code ? 'selected' : ''} onClick={() => selectCode(item)}><span className="code-radio">{draft.policyCode === item.code && <Check weight="bold" />}</span><span><code>{item.code}</code><strong>{item.name}</strong><small>{item.description} · {completeParameterSchema(item).length} template fields{item.parameterSchema.length < completeParameterSchema(item).length ? ` · ${item.parameterSchema.length} governed by this code` : ''}</small></span><span className="status-pill active">{item.engine}</span></button>)}</div> : <div className="no-policy-codes"><Info weight="duotone" /><h3>No active code for {draft.subcategory}</h3><p>Create one here and it will also be added to the Policy Engine library.</p></div>}
          {!creatingCode ? <button type="button" className="button secondary create-code-inline" onClick={beginCreateCode}><Plus /> Create configured code variant</button> : <div className="inline-code-creator">
            <div className="inline-code-heading"><div><strong>Create a configured code from an existing template</strong><span>Definitions stay governed by the {draft.subcategory} engine; this new code only changes its configuration values.</span></div><button type="button" className="icon-button" onClick={() => setCreatingCode(false)}><X /></button></div>
            <div className="wizard-field-grid"><label className="wide">Existing policy template<span className="required">*</span><select value={codeDraft.templateCode} onChange={e => { const template = templateCandidates.find(item => item.code === e.target.value); if (!template) return; const schema = completeParameterSchema(template); setCodeDraft(previous => ({ ...previous, templateCode: template.code, description: template.description, parameterSchema: schema, parameterValues: { ...defaultParameterValues(schema), ...(template.parameterValues || {}) } })); }} required><option value="">Choose a governed code template</option>{templateCandidates.map(item => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}</select><small className="policy-template-help">This copies the full {draft.subcategory} schema, including its basis, thresholds, effective period, controls, and audit fields.</small></label><label>New code<span className="required">*</span><input value={codeDraft.code} onChange={e => setCodeDraft(previous => ({ ...previous, code: e.target.value.toUpperCase() }))} placeholder="e.g. THP-003" /></label><label>Name<span className="required">*</span><input value={codeDraft.name} onChange={e => setCodeDraft(previous => ({ ...previous, name: e.target.value }))} placeholder="Company variant name" /></label><label className="wide">Description<span className="required">*</span><textarea value={codeDraft.description} onChange={e => setCodeDraft(previous => ({ ...previous, description: e.target.value }))} /></label></div>
            {codeTemplate && <div className="policy-template-meta inline-template-meta"><span><small>Template</small><strong>{codeTemplate.code}</strong></span><span><small>Engine</small><strong>{codeTemplate.engine}</strong></span><span><small>Sub-category</small><strong>{draft.subcategory}</strong></span></div>}
            {codeTemplate && <div className="policy-template-parameters inline-template-parameters"><div className="policy-template-parameters-heading"><div><strong>Configure the new code</strong><span>Adjust all {codeDraft.parameterSchema.length} predefined values below. The governed definitions cannot be removed or renamed here.</span></div><span className="policy-template-locked">Complete template</span></div><PolicyParameterFields schema={codeDraft.parameterSchema} values={codeDraft.parameterValues || {}} onChange={parameterValues => setCodeDraft(previous => ({ ...previous, parameterValues }))} /></div>}
            <div className="inline-code-actions"><button type="button" className="button secondary" onClick={() => setCreatingCode(false)}>Cancel</button><button type="button" className="button primary" onClick={createCode}>Create & select code</button></div>
          </div>}
          {selectedCode && !creatingCode && <section className="rule-parameter-configuration"><header><div><strong>Configure {selectedCode.code} for this rule</strong><span>{selectedCode.parameterSchema.length < selectedTemplateSize ? `This standard code owns ${selectedCode.parameterSchema.length} of ${selectedTemplateSize} engine fields. Open the Policy Engine library to adjust the whole engine, or create a variant to configure every field.` : 'The code schema is reusable; these values apply only to this company rule.'}</span></div><span>{selectedCode.parameterSchema.length}/{selectedTemplateSize} fields</span></header><PolicyParameterFields schema={selectedCode.parameterSchema} values={configuredValues} onChange={parameterValues => update('parameterValues', parameterValues)} /></section>}
        </div>}
        {step === 3 && <div className="wizard-panel">
          <div className="wizard-heading"><span>Step {3} of {ruleWizardSteps.length}</span><h3>Review the rule before applying it</h3><p>Confirm the audience, rule wording, and governed computation link.</p></div>
          <div className="review-section"><header><h4>Rule details</h4><button type="button" onClick={() => setStep(1)}>Edit</button></header><dl><div><dt>Employee group</dt><dd>{draft.groupBy}: {draft.groupValue}</dd></div><div><dt>Status</dt><dd><span className={`status-pill ${draft.enabled ? 'active' : 'disabled'}`}>{draft.enabled ? 'Enabled' : 'Disabled'}</span></dd></div><div><dt>Category</dt><dd>{draft.category}</dd></div><div><dt>Sub-category</dt><dd>{draft.subcategory}</dd></div><div className="wide"><dt>Specific rule</dt><dd>{draft.rule}</dd></div></dl></div>
          <div className="review-section"><header><h4>Policy engine and parameters</h4><button type="button" onClick={() => setStep(2)}>Edit</button></header><div className="review-policy-code"><span className="policy-code-chip">{draft.policyCode}</span><div><strong>{selectedCode?.name}</strong><small>{selectedCode?.description}</small></div><span className="status-pill active">{selectedCode?.engine}</span></div><dl className="review-parameter-list">{selectedCode?.parameterSchema.map(item => <div key={item.key}><dt>{item.label}</dt><dd>{configuredValues[item.key] || '—'}{item.unit ? ` ${item.unit}` : ''}</dd></div>)}</dl></div>
          <div className="review-ready"><CheckCircle weight="fill" /><div><strong>Ready to {draft.id ? 'save' : 'apply'}</strong><span>The rule will be linked to {draft.policyCode} and {draft.enabled ? 'enabled immediately' : 'kept disabled'}.</span></div></div>
        </div>}
        {error && <p className="wizard-error">{error}</p>}
        <div className="modal-actions wizard-actions"><button type="button" className="button secondary" onClick={step === 1 ? onClose : () => { setError(''); setStep(current => current - 1); }}>{step === 1 ? 'Cancel' : 'Back'}</button><button className="button primary">{step < 3 ? <>Continue <ArrowRight /></> : draft.id ? 'Save policy' : draft.supersedesPolicyId ? 'Create version' : 'Add policy'}</button></div>
      </form>
    </Modal>
  );
}

function DeleteDialog({ rule, onClose, onDelete }) {
  return (
    <Modal title="Delete Policy" onClose={onClose} width="440px">
      <div className="delete-copy"><div className="delete-icon"><Trash weight="duotone" /></div><div><h3>Delete this unused policy?</h3><p>“{rule.rule.slice(0, 95)}{rule.rule.length > 95 ? '…' : ''}”</p><p>Policies referenced by payroll are locked and cannot reach this action.</p></div></div>
      <div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button danger" onClick={onDelete}>Delete</button></div>
    </Modal>
  );
}

function SettingsTab({ tab, setToast, onOpenModule }) {
  if (tab === 'Modules & Features') return <ModulesFeaturesTab onOpenModule={onOpenModule} />;
  const configs = {
    'Enable / Disable Fields': ['Employee middle name', 'Biometric ID', 'Bank branch', 'Emergency contact'],
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

/** Sections a company record already satisfies, used to seed section progress. */
function derivedCompletedSections(company = defaultCompanyRecord) {
  return [
    company.companyCode && company.tin && 'setup',
    company.legalName && company.industry && 'basic',
    company.profile?.email && company.profile?.address && 'contact',
    company.bankAccounts?.some(account => account.isDefault) && 'bank',
    company.serviceEnrollments?.some(service => service.enabled) && 'services',
    company.authorizedContacts?.some(contact => contact.status === 'Active') && 'authorizedContacts',
    company.signatories?.some(signatory => signatory.status === 'Active') && 'signatories',
  ].filter(Boolean);
}

const companyRulesKey = companyId => `atlas-company-rules-v3:${companyId || 'default'}`;
function readCompanyRules(companyId) {
  return readManagedPolicies(companyId);
}

export function App() {
  const { role } = useRole();
  const [screen, setScreen] = useState(() => landingScreen(role));
  const [view, setView] = useState('information');
  const [companyRecords, setCompanyRecords] = useState(() => readCompanies());
  const [activeCompanyId, setActiveCompanyId] = useState(() => readActiveCompanyId());
  const [rules, setRules] = useState(() => readCompanyRules(readActiveCompanyId()));
  const [companyData, setCompanyData] = useState(() => {
    const initialId = readActiveCompanyId();
    const repositoryData = companyRecordToData(readCompanies().find(company => company.companyId === initialId) || defaultCompanyRecord);
    try {
      const saved = JSON.parse(localStorage.getItem('atlas-company-data-v3'));
      if (!saved) return repositoryData;
      return {
        ...repositoryData, ...saved,
        setup: { ...saved.setup, ...repositoryData.setup },
        basic: { ...repositoryData.basic, ...saved.basic },
        contact: { ...repositoryData.contact, ...saved.contact },
        bank: repositoryData.bank.length ? repositoryData.bank : (Array.isArray(saved.bank) ? saved.bank : defaultCompanyData.bank),
        authorizedContacts: repositoryData.authorizedContacts.length ? repositoryData.authorizedContacts : (Array.isArray(saved.authorizedContacts) ? saved.authorizedContacts : defaultCompanyData.authorizedContacts),
        signatories: repositoryData.signatories.length ? repositoryData.signatories : (Array.isArray(saved.signatories) ? saved.signatories : defaultCompanyData.signatories),
      };
    } catch { return repositoryData; }
  });
  const [completed, setCompleted] = useState(() => {
    const initialId = readActiveCompanyId();
    const derived = derivedCompletedSections(readCompanies().find(company => company.companyId === initialId) || defaultCompanyRecord);
    try {
      const saved = JSON.parse(localStorage.getItem('atlas-company-completed-v3'));
      const validSaved = Array.isArray(saved) ? saved.filter(value => companySections.some(section => section.id === value)) : [];
      return [...new Set([...validSaved, ...derived])];
    } catch { return derived; }
  });
  const [toast, setToast] = useState(null);

  const activeCompany = companyRecords.find(company => company.companyId === activeCompanyId) || companyRecords[0] || defaultCompanyRecord;

  const pathname = window.location.pathname.toLowerCase();
  const experience = pathname.startsWith('/wireframe') ? 'wireframe' : pathname.startsWith('/monochrome') ? 'monochrome' : 'original';
  useEffect(() => { document.documentElement.dataset.experience = experience; }, [experience]);
  useEffect(() => { localStorage.setItem(companyRulesKey(activeCompanyId), JSON.stringify(rules)); }, [rules, activeCompanyId]);
  useEffect(() => { localStorage.setItem('atlas-company-data-v3', JSON.stringify(companyData)); }, [companyData]);
  useEffect(() => { localStorage.setItem('atlas-company-completed-v3', JSON.stringify(completed)); }, [completed]);
  useEffect(() => {
    const openScenarios = () => setScreen('scenarios');
    window.addEventListener('atlas:open-scenarios', openScenarios);
    return () => window.removeEventListener('atlas:open-scenarios', openScenarios);
  }, []);

  const notify = (value) => { setToast(value); window.setTimeout(() => setToast(null), 4200); };
  /** Single entry point for changing the company every module reads from. */
  const selectCompany = companyId => {
    const refreshed = readCompanies();
    const resolvedId = persistActiveCompanyId(companyId);
    const record = refreshed.find(company => company.companyId === resolvedId) || refreshed[0] || defaultCompanyRecord;
    setCompanyRecords(refreshed);
    setActiveCompanyId(record.companyId);
    setRules(readCompanyRules(record.companyId));
    setCompanyData(companyRecordToData(record));
    setCompleted(derivedCompletedSections(record));
    return record;
  };
  const previousRole = useRef(role);
  useEffect(() => {
    if (previousRole.current === role) return;
    previousRole.current = role;
    setScreen(landingScreen(role));
    setView('information');
  }, [role]);

  // A screen reached before a rule changed — or restored from a previous
  // session — must never render for an actor who may not open it.
  const reachable = canAccessScreen(role, screen);
  useEffect(() => {
    if (!reachable) setScreen(landingScreen(role));
  }, [reachable, role]);

  const navigate = destination => {
    if (destination === 'company') {
      const refreshed = readCompanies();
      setCompanyRecords(refreshed);
      if (!refreshed.some(company => company.companyId === activeCompanyId)) selectCompany(refreshed[0]?.companyId);
    }
    setScreen(destination);
  };
  const persistCompany = company => {
    const saved = saveCompany(company);
    setCompanyRecords(readCompanies());
    persistActiveCompanyId(saved.companyId);
    setActiveCompanyId(saved.companyId);
    setCompanyData(companyRecordToData(saved));
    return saved;
  };
  if (screen === 'core') return <CoreHome onNavigate={navigate} company={activeCompany} companies={companyRecords} onSelectCompany={selectCompany} onOpen={(module) => {
    if (module === 'Employee Masterfile') setScreen('employee');
    else if (module === 'Reference Table') setScreen('reference');
    else if (module === 'Access & Approvals') setScreen('settings-workspace:accessRights');
    else if (module === 'Security Configuration') setScreen('settings-workspace:security');
    else if (module === 'Navigation Configuration') setScreen('settings-workspace:navigation');
    else if (module === 'Tickets') setScreen('ticketing');
    else { setScreen('company'); setView('information'); }
  }} />;
  if (screen === 'scenarios') return <ScenarioStudio onNavigate={navigate} company={activeCompany} companies={companyRecords} onSelectCompany={selectCompany} />;
  if (screen === 'timekeeping') return <TimekeepingPortal company={activeCompany} companies={companyRecords} companyId={activeCompanyId} onSelectCompany={selectCompany} onExit={() => setScreen(landingScreen(role))} onOpenCore={() => setScreen('core')} onOpenHrm={() => setScreen('hrm')} onOpenPayroll={() => setScreen('payroll')} onOpenSettings={() => setScreen('settings')} notify={notify} />;
  if (screen === 'hrm') return <HRMPortal company={activeCompany} companies={companyRecords} companyId={activeCompanyId} onSelectCompany={selectCompany} onExit={() => setScreen(landingScreen(role))} onOpenCore={() => setScreen('core')} onOpenTimekeeping={() => setScreen('timekeeping')} onOpenPayroll={() => setScreen('payroll')} onOpenSettings={() => setScreen('settings')} notify={notify} />;
  if (screen === 'employee') return <>
    <Toast toast={toast} onClose={() => setToast(null)} />
    <EmployeeMasterfile onBack={() => setScreen('core')} onNavigate={navigate} notify={notify} company={activeCompany} companies={companyRecords} onSelectCompany={selectCompany} />
  </>;
  if (screen === 'ticketing') return <PlatformLayout screen={screen} onNavigate={navigate} company={activeCompany} companies={companyRecords} onSelectCompany={selectCompany}><Toast toast={toast} onClose={() => setToast(null)} /><TicketingWorkspace onBack={() => setScreen('core')} notify={notify} /></PlatformLayout>;
  if (screen === 'reference' || screen === 'reference-settings') return <>
    <Toast toast={toast} onClose={() => setToast(null)} />
    <ReferenceTables onBack={() => setScreen(screen === 'reference-settings' ? 'settings' : 'core')} onNavigate={navigate} notify={notify} company={activeCompany} companies={companyRecords} onSelectCompany={selectCompany} />
  </>;
  if (screen === 'settings' || screen === 'payroll' || screen === 'payroll-policy-management' || screen === 'statutory-settings' || screen === 'statutory-payroll' || screen === 'tax-settings' || screen === 'tax-payroll' || screen === 'settings-computation-admin' || screen.startsWith('settings-workspace:') || screen.startsWith('payroll-workspace:')) return <PlatformLayout screen={screen} onNavigate={navigate} company={activeCompany} companies={companyRecords} onSelectCompany={selectCompany}>
    <Toast toast={toast} onClose={() => setToast(null)} />
    {screen === 'settings' && <SettingsHub onOpen={() => setScreen('statutory-settings')} onOpenTax={() => setScreen('tax-settings')} onOpenReference={() => setScreen('reference-settings')} onOpenComputationLibrary={() => setScreen('settings-computation-admin')} onOpenWorkspace={key => setScreen(`settings-workspace:${key}`)} />}
    {screen === 'payroll' && <PayrollHub onOpen={() => setScreen('statutory-payroll')} onOpenTax={() => setScreen('tax-payroll')} onOpenPolicyManagement={() => setScreen('payroll-policy-management')} onOpenWorkspace={key => setScreen(`payroll-workspace:${key}`)} />}
    {screen === 'payroll-policy-management' && <RulesPage key={activeCompanyId} rules={rules} setRules={setRules} setToast={notify} onOpenPolicies={() => { setScreen('company'); setView('policies'); }} onOpenModule={target => { const [scope, ...parts] = target.split(':'); const destination = parts.join(':'); if (scope === 'view') { setScreen('company'); setView(destination); } if (scope === 'screen') setScreen(destination); }} />}
    {screen === 'statutory-settings' && <StatutoryTables mode="settings" group="statutory" onBack={() => setScreen('settings')} notify={notify} />}
    {screen === 'statutory-payroll' && <StatutoryTables mode="payroll" group="statutory" onBack={() => setScreen('payroll')} notify={notify} />}
    {screen === 'tax-settings' && <StatutoryTables mode="settings" group="tax" onBack={() => setScreen('settings')} notify={notify} />}
    {screen === 'tax-payroll' && <StatutoryTables mode="payroll" group="tax" onBack={() => setScreen('payroll')} notify={notify} />}
    {screen === 'settings-computation-admin' && <StandardComputationAdmin onBack={() => setScreen('settings')} notify={notify} />}
    {screen.startsWith('settings-workspace:') && <OperationalWorkspace workspaceKey={screen.split(':')[1]} onBack={() => setScreen('settings')} notify={notify} companyId={activeCompanyId} company={activeCompany} />}
    {screen.startsWith('payroll-workspace:') && <OperationalWorkspace workspaceKey={screen.split(':')[1]} onBack={() => setScreen('payroll')} notify={notify} companyId={activeCompanyId} company={activeCompany} />}
  </PlatformLayout>;
  return (
    <CompanyLayout view={view} setView={setView} onBack={() => setScreen('core')} onNavigate={navigate} company={activeCompany} companies={companyRecords} onSelectCompany={selectCompany}>
      <Toast toast={toast} onClose={() => setToast(null)} />
      {view === 'information' && <CompanyInformation data={companyData} setData={setCompanyData} completed={completed} setCompleted={setCompleted} setToast={notify} onOpenServices={() => setView('services')} company={activeCompany} onSaveCompany={persistCompany} />}
      {view === 'rules' && <RulesPage key={activeCompanyId} rules={rules} setRules={setRules} setToast={notify} onOpenPolicies={() => setView('policies')} onOpenModule={target => {
        const [scope, ...parts] = target.split(':');
        const destination = parts.join(':');
        if (scope === 'view') setView(destination);
        if (scope === 'screen') setScreen(destination);
      }} />}
      {view === 'services' && <ServicesHub companyName={activeCompany.displayName || activeCompany.legalName} onOpen={(moduleKey) => setView(moduleKey === 'computations' ? 'computations' : `service:${moduleKey}`)} />}
      {(view === 'computations' || view === 'policies') && <ComputationalBasis key={`${view}:${activeCompanyId}`} companyId={activeCompanyId} initialTab={view === 'policies' ? 'policies' : 'computations'} onBack={() => setView('services')} onOpenStatutory={() => setScreen('statutory-settings')} onOpenService={moduleKey => setView(`service:${moduleKey}`)} notify={notify} />}
      {view.startsWith('service:') && <ServiceConfiguration key={`${view}:${activeCompanyId}`} moduleKey={view.split(':')[1]} companyId={activeCompanyId} onBack={() => setView('services')} notify={notify} />}
      {view.startsWith('workspace:') && <OperationalWorkspace workspaceKey={view.split(':')[1]} onBack={() => setView('information')} notify={notify} companyId={activeCompanyId} company={activeCompany} />}
    </CompanyLayout>
  );
}
