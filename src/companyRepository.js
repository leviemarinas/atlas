const COMPANY_STORAGE_KEY = 'atlas-company-repository-v1';
const LIFECYCLE_STORAGE_KEY = 'atlas-lifecycle-cases-v2';
const AUDIT_STORAGE_KEY = 'atlas-audit-events-v1';
const IMPORT_STORAGE_KEY = 'atlas-import-batches-v1';
const ACTIVE_COMPANY_STORAGE_KEY = 'atlas-active-company-v1';

const makeId = prefix => {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const now = () => new Date().toISOString();

export const lifecycleStatuses = ['Draft', 'Setup In Progress', 'For Review', 'Ready for Activation', 'Active', 'Completed', 'Cancelled'];
export const offboardingStatuses = ['Requested', 'For Approval', 'Export Ready', 'Completed'];

/**
 * The services a company can enrol in. Onboarding, company seeding and the
 * feature-entitlement catalogue all derive from this list so a new service
 * cannot appear in one place and be missing from another.
 */
export const serviceCatalog = [
  { serviceCode: 'PAYROLL', name: 'Payroll', status: 'Ready', configurationLink: 'workspace:payCodes' },
  { serviceCode: 'TIMEKEEPING', name: 'Timekeeping', status: 'Ready', configurationLink: 'services:timeAttendance' },
  { serviceCode: 'HRM', name: 'HRM', status: 'Connected', configurationLink: 'workspace:connectedSystems' },
  { serviceCode: 'BILLING', name: 'Billing', status: 'Ready', configurationLink: 'workspace:billing' },
  { serviceCode: 'HAPPINESS', name: 'Happiness Meter', status: 'Ready', configurationLink: 'workspace:happiness' },
  { serviceCode: 'WELLNESS', name: 'Health & Wellness', status: 'Ready', configurationLink: 'workspace:wellness' },
];

export const defaultCompanyRecord = {
  companyId: 'cmp-abc-001',
  companyCode: 'ABC-PH-001',
  legalName: 'ABC Company Ltd',
  displayName: 'ABC Company Ltd',
  tradeName: 'ABC Company',
  industry: 'Professional Services',
  businessType: 'Corporation',
  tin: '000-123-456-000',
  lifecycleStatus: 'Active',
  activationDate: '2026-01-01',
  offboardingStatus: 'Not scheduled',
  profile: {
    logo: 'ABC Company logo',
    registrationStatus: 'Verified',
    secDtiNumber: 'CS202600001',
    birRdo: '047',
    sssBranchCode: 'SSS-NCR',
    philHealthBranchCode: 'PHIC-NCR',
    hdmfBranchCode: 'HDMF-NCR',
    address: 'Makati City, Metro Manila',
    zip: '1200',
    telephone: '+63 2 8123 4567',
    mobile: '+63 917 100 1000',
    email: 'payroll@abccompany.ph',
    website: 'https://abccompany.example',
    payrollContact: 'Maria Santos',
    billingContact: 'Finance Operations',
    remittanceContact: 'Payroll Treasury',
  },
  bankAccounts: [{
    bankAccountId: 'bank-abc-001', bankReference: 'BNK-001', bankName: 'BDO Unibank',
    accountName: 'ABC Company Ltd', accountNumber: '•••• 8472', branch: 'Makati',
    accountType: 'Payroll', bankCompanyCode: 'ABC-PAY', paymentMode: 'Bank Transfer',
    isDefault: true, status: 'Active', effectiveFrom: '2026-01-01', effectiveTo: '',
  }],
  authorizedContacts: [{
    contactPersonId: 'contact-abc-001', person: 'Maria Santos', role: 'HR Director',
    responsibility: 'Payroll and BIR', email: 'maria.santos@abccompany.ph', mobile: '+63 917 100 1000',
    effectiveFrom: '2026-01-01', effectiveTo: '', status: 'Active',
  }],
  signatories: [{
    signatoryId: 'signatory-abc-001', person: 'Andrea Reyes', title: 'Chief Finance Officer',
    approvalRole: 'Final payroll approver', email: 'andrea.reyes@abccompany.ph',
    signatureDocumentId: 'andrea-reyes-esignature.png', effectiveFrom: '2026-01-01', effectiveTo: '', status: 'Active',
  }],
  documents: [
    { documentId: 'doc-abc-001', documentType: 'SEC / DTI registration', filename: 'abc-sec-registration.pdf', status: 'Validated', expiryDate: '', uploadedAt: '2026-01-01T09:00:00.000Z' },
    { documentId: 'doc-abc-002', documentType: 'BIR registration', filename: 'abc-bir-registration.pdf', status: 'Validated', expiryDate: '', uploadedAt: '2026-01-01T09:05:00.000Z' },
  ],
  serviceEnrollments: serviceCatalog.map(service => ({ ...service, enabled: true, effectiveFrom: '2026-01-01' })),
  updatedAt: '2026-01-01T09:05:00.000Z',
};

/** Second fully entitled demo tenant used by the multi-company scenario. */
export const defaultNorthstarCompanyRecord = {
  companyId: 'cmp-northstar-001',
  companyCode: 'NSR-PH-001',
  legalName: 'Northstar Retail Corporation',
  displayName: 'Northstar Retail',
  tradeName: 'Northstar Retail',
  industry: 'Retail',
  businessType: 'Corporation',
  tin: '000-987-654-000',
  lifecycleStatus: 'Active',
  activationDate: '2026-01-01',
  offboardingStatus: 'Not scheduled',
  profile: {
    registrationStatus: 'Verified', address: 'Quezon City, Metro Manila', zip: '1100',
    email: 'payroll@northstar.example', payrollContact: 'Retail People Operations',
  },
  bankAccounts: [],
  authorizedContacts: [],
  signatories: [],
  documents: [],
  serviceEnrollments: serviceCatalog.map(service => ({ ...service, enabled: true, effectiveFrom: '2026-01-01' })),
  updatedAt: '2026-01-01T09:05:00.000Z',
};

export const simulatorSandboxCompanyRecord = {
  companyId: 'cmp-atlas-sandbox-001',
  companyCode: 'SIM-PH-001',
  legalName: 'Atlas Simulator Sandbox Inc.',
  displayName: 'Atlas Simulator Sandbox',
  tradeName: 'Atlas Sandbox',
  industry: 'Software demonstration',
  businessType: 'Corporation',
  tin: '000-000-001-000',
  lifecycleStatus: 'Active',
  activationDate: '2026-01-01',
  offboardingStatus: 'Not scheduled',
  tenantKind: 'simulator',
  sampleDataNotice: 'Resettable synthetic data for Scenario Studio. Never use for production processing.',
  profile: {
    registrationStatus: 'Demo verified', address: 'Atlas Demo Center, Metro Manila', zip: '1000',
    telephone: '+63 2 8000 0001', mobile: '+63 917 000 0001', email: 'sandbox@atlas.demo',
    payrollContact: 'Scenario Payroll Operator', billingContact: 'Scenario Billing Operator', remittanceContact: 'Scenario Treasury Operator',
  },
  bankAccounts: [{ bankAccountId: 'bank-sim-001', bankReference: 'SIM-BANK', bankName: 'Atlas Demo Bank', accountName: 'Atlas Simulator Sandbox Inc.', accountNumber: '•••• 0001', branch: 'Demo Branch', accountType: 'Payroll', bankCompanyCode: 'SIM-PAY', paymentMode: 'Bank Transfer', isDefault: true, status: 'Active', effectiveFrom: '2026-01-01', effectiveTo: '' }],
  authorizedContacts: [{ contactPersonId: 'contact-sim-001', person: 'Scenario Client Admin', role: 'HR & Payroll', responsibility: 'Full simulation', email: 'client-admin@atlas.demo', mobile: '+63 917 000 0002', effectiveFrom: '2026-01-01', effectiveTo: '', status: 'Active' }],
  signatories: [{ signatoryId: 'signatory-sim-001', person: 'Scenario P&A Admin', title: 'Authorized Demo Approver', approvalRole: 'Final payroll approver', email: 'pa-admin@atlas.demo', signatureDocumentId: 'atlas-demo-signature.png', effectiveFrom: '2026-01-01', effectiveTo: '', status: 'Active' }],
  documents: [{ documentId: 'doc-sim-001', documentType: 'Simulation data notice', filename: 'atlas-sandbox-notice.pdf', status: 'Validated', expiryDate: '', uploadedAt: '2026-01-01T09:00:00.000Z' }],
  serviceEnrollments: serviceCatalog.map(service => ({ ...service, enabled: true, effectiveFrom: '2026-01-01' })),
  updatedAt: '2026-01-01T09:05:00.000Z',
};

export const productionSampleCompanyRecord = {
  companyId: 'cmp-meridian-sample-001',
  companyCode: 'MCP-PH-001',
  legalName: 'Meridian Consumer Products Philippines, Inc.',
  displayName: 'Meridian Consumer Products',
  tradeName: 'Meridian',
  industry: 'Consumer goods manufacturing and distribution',
  businessType: 'Corporation',
  tin: '000-246-810-000',
  lifecycleStatus: 'Active',
  activationDate: '2025-01-01',
  offboardingStatus: 'Not scheduled',
  tenantKind: 'production-sample',
  sampleDataNotice: 'Production-like but synthetic Philippine company data. No real individual or bank data is used.',
  profile: {
    logo: 'Meridian sample logo', registrationStatus: 'Verified sample', secDtiNumber: 'CS202500246', birRdo: '044',
    sssBranchCode: 'SSS-NCR-EAST', philHealthBranchCode: 'PHIC-NCR-CENTRAL', hdmfBranchCode: 'HDMF-NCR-EAST',
    address: 'Ortigas Center, Pasig City, Metro Manila', zip: '1605', telephone: '+63 2 8555 2400', mobile: '+63 917 555 2400',
    email: 'peopleops@meridian.example', website: 'https://meridian.example', payrollContact: 'Camille Navarro', billingContact: 'Finance Shared Services', remittanceContact: 'Treasury Operations',
  },
  bankAccounts: [{ bankAccountId: 'bank-mcp-001', bankReference: 'MCP-PAY-01', bankName: 'Sample Commercial Bank', accountName: 'Meridian Consumer Products Philippines, Inc.', accountNumber: '•••• 6240', branch: 'Ortigas', accountType: 'Payroll', bankCompanyCode: 'MCP-PAY', paymentMode: 'Bank Transfer', isDefault: true, status: 'Active', effectiveFrom: '2025-01-01', effectiveTo: '' }],
  authorizedContacts: [{ contactPersonId: 'contact-mcp-001', person: 'Camille Navarro', role: 'People Operations Director', responsibility: 'HRM and payroll governance', email: 'camille.navarro@meridian.example', mobile: '+63 917 555 2411', effectiveFrom: '2025-01-01', effectiveTo: '', status: 'Active' }],
  signatories: [{ signatoryId: 'signatory-mcp-001', person: 'Miguel de Vera', title: 'Finance Director', approvalRole: 'Final payroll approver', email: 'miguel.devera@meridian.example', signatureDocumentId: 'meridian-sample-esignature.png', effectiveFrom: '2025-01-01', effectiveTo: '', status: 'Active' }],
  documents: [
    { documentId: 'doc-mcp-001', documentType: 'SEC registration sample', filename: 'meridian-sec-sample.pdf', status: 'Validated', expiryDate: '', uploadedAt: '2025-01-01T08:00:00.000Z' },
    { documentId: 'doc-mcp-002', documentType: 'BIR registration sample', filename: 'meridian-bir-sample.pdf', status: 'Validated', expiryDate: '', uploadedAt: '2025-01-01T08:05:00.000Z' },
  ],
  serviceEnrollments: serviceCatalog.map(service => ({ ...service, enabled: true, effectiveFrom: '2025-01-01' })),
  updatedAt: '2026-08-20T08:00:00.000Z',
};

const seededCompanionCompanies = [defaultNorthstarCompanyRecord, simulatorSandboxCompanyRecord, productionSampleCompanyRecord];

const readJson = (key, fallback) => {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return saved ?? fallback;
  } catch { return fallback; }
};

const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export function readCompanies() {
  const companies = readJson(COMPANY_STORAGE_KEY, [defaultCompanyRecord, defaultNorthstarCompanyRecord]);
  const stored = Array.isArray(companies) && companies.length ? companies : [defaultCompanyRecord, defaultNorthstarCompanyRecord];
  // Local previews created before Scenario Studio had only ABC persisted.
  // Add Northstar only to that known demo repository; never inject it into an
  // unrelated customer repository that does not contain the seeded ABC id.
  const source = stored.some(company => company.companyId === defaultCompanyRecord.companyId)
    ? seededCompanionCompanies.reduce((rows, sample) => rows.some(company => company.companyId === sample.companyId) ? rows : [...rows, sample], stored)
    : stored;
  // The reference app ships with these two inherited capabilities enabled for
  // the demo company. Existing local previews may already have a stored
  // company record from before the capabilities were added, so normalize only
  // that seeded company without changing onboarding choices for new companies.
  return source.map(company => {
    if (company.companyId !== defaultCompanyRecord.companyId) return company;
    const existing = Array.isArray(company.serviceEnrollments) ? company.serviceEnrollments : [];
    const additions = serviceCatalog.map(({ serviceCode, name, configurationLink }) => ({ serviceCode, name, configurationLink }));
    const normalized = additions.reduce((rows, option) => {
      const index = rows.findIndex(item => item.serviceCode === option.serviceCode);
      if (index >= 0) rows[index] = { ...rows[index], ...option, enabled: true, status: rows[index].status === 'Not selected' || rows[index].status === 'Not entitled' ? 'Ready' : (rows[index].status || 'Ready') };
      else rows.push({ ...option, enabled: true, effectiveFrom: company.activationDate || '2026-01-01', status: 'Ready' });
      return rows;
    }, existing.map(item => ({ ...item })));
    return { ...company, serviceEnrollments: normalized };
  });
}

export function saveCompanies(companies) {
  writeJson(COMPANY_STORAGE_KEY, companies);
  return companies;
}

export function getCompany(companyId) {
  return readCompanies().find(company => company.companyId === companyId) || readCompanies()[0];
}

/**
 * The company every company-scoped module reads from. Workspaces used to fall
 * back to `readCompanies()[0]`, which meant a second onboarded company could
 * never be opened; they now follow the company selected in the top bar.
 */
export function readActiveCompanyId() {
  const companies = readCompanies();
  let saved = '';
  try { saved = localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY) || ''; } catch { saved = ''; }
  return companies.some(company => company.companyId === saved) ? saved : (companies[0]?.companyId || defaultCompanyRecord.companyId);
}

export function readActiveCompany() {
  return getCompany(readActiveCompanyId());
}

export function setActiveCompanyId(companyId) {
  const resolved = readCompanies().some(company => company.companyId === companyId) ? companyId : readActiveCompanyId();
  try { localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, resolved); } catch { /* preview storage unavailable */ }
  return resolved;
}

export function companyCodeExists(companyCode, exceptCompanyId = '') {
  const normalized = String(companyCode || '').trim().toLowerCase();
  return readCompanies().some(company => company.companyId !== exceptCompanyId && company.companyCode.toLowerCase() === normalized);
}

export function saveCompany(company, actor = 'P&A Admin') {
  const accounts = Array.isArray(company.bankAccounts) ? company.bankAccounts : [];
  const firstDefault = accounts.findIndex(account => account.isDefault);
  const normalizedAccounts = accounts.map((account, index) => {
    const rawAccountNumber = String(account.accountNumber || '').trim();
    const masked = rawAccountNumber.includes('•') || rawAccountNumber.includes('â€¢');
    const accountNumber = rawAccountNumber && !masked && rawAccountNumber.length > 4 ? `•••• ${rawAccountNumber.slice(-4)}` : rawAccountNumber;
    return { ...account, accountNumber, status: account.status || 'Active', isDefault: accounts.length > 0 ? (firstDefault >= 0 ? index === firstDefault : index === 0) : false };
  });
  const next = { ...company, bankAccounts: normalizedAccounts, updatedAt: now() };
  const companies = readCompanies();
  const index = companies.findIndex(item => item.companyId === next.companyId);
  if (index < 0) companies.unshift(next);
  else companies[index] = next;
  saveCompanies(companies);
  appendAuditEvent({ companyId: next.companyId, actor, action: 'CompanyProfileSaved', entityType: 'Company', entityId: next.companyId, summary: `${next.companyCode} profile saved.` });
  return next;
}

export function createDraftCompany(input = {}, actor = 'P&A Admin') {
  if (companyCodeExists(input.companyCode)) throw new Error('Company Code already exists. Use a unique code across active and historical companies.');
  const company = {
    ...defaultCompanyRecord,
    ...input,
    companyId: makeId('cmp'),
    lifecycleStatus: 'Draft',
    activationDate: '',
    offboardingStatus: 'Not scheduled',
    profile: { ...defaultCompanyRecord.profile, ...(input.profile || {}) },
    bankAccounts: input.bankAccounts || [],
    authorizedContacts: input.authorizedContacts || [],
    signatories: input.signatories || [],
    documents: input.documents || [],
    serviceEnrollments: input.serviceEnrollments || [],
    updatedAt: now(),
  };
  saveCompany(company, actor);
  const lifecycle = createLifecycleCase(company.companyId, 'ONBOARDING', actor);
  appendAuditEvent({ companyId: company.companyId, actor, action: 'CompanyOnboardingStarted', entityType: 'LifecycleCase', entityId: lifecycle.caseId, summary: `${company.companyCode} onboarding started.` });
  return { company, lifecycle };
}

export function readLifecycleCases(companyId = '') {
  const cases = readJson(LIFECYCLE_STORAGE_KEY, []);
  return (Array.isArray(cases) ? cases : []).filter(item => !companyId || item.companyId === companyId);
}

export function saveLifecycleCase(lifecycle, actor = 'P&A Admin') {
  const next = { ...lifecycle, updatedAt: now() };
  const cases = readLifecycleCases();
  const index = cases.findIndex(item => item.caseId === next.caseId);
  if (index < 0) cases.unshift(next);
  else cases[index] = next;
  writeJson(LIFECYCLE_STORAGE_KEY, cases);
  appendAuditEvent({ companyId: next.companyId, actor, action: next.type === 'ONBOARDING' ? 'CompanyOnboardingUpdated' : 'CompanyOffboardingUpdated', entityType: 'LifecycleCase', entityId: next.caseId, summary: `${next.type} case ${next.caseId} updated to ${next.status}.` });
  return next;
}

export function createLifecycleCase(companyId, type, actor = 'P&A Admin', input = {}) {
  const caseId = makeId(type === 'ONBOARDING' ? 'onb' : 'off');
  const isOnboarding = type === 'ONBOARDING';
  const { caseId: _ignoredCaseId, createdAt: _ignoredCreatedAt, updatedAt: _ignoredUpdatedAt, ...caseInput } = input;
  const lifecycle = {
    caseId, companyId, type, status: isOnboarding ? 'Draft' : 'Requested',
    requestedAt: now(), startedAt: isOnboarding ? now() : '', completedAt: '', owner: actor,
    exportScope: isOnboarding ? [] : ['All Company Data'], importType: '', importBatchId: '',
    packageReference: '', packagePreparedAt: '', handoffRecipient: '', acknowledgement: '',
    checklist: isOnboarding ? onboardingChecklist() : offboardingChecklist(), blockers: [], warnings: [], ...caseInput,
    createdAt: now(), updatedAt: now(),
  };
  const cases = readLifecycleCases(); cases.unshift(lifecycle); writeJson(LIFECYCLE_STORAGE_KEY, cases);
  return lifecycle;
}

export function onboardingChecklist() {
  return [
    { itemCode: 'COMPANY_IDENTITY', section: 'Company Identity', label: 'Unique Company Code, Legal Name, TIN and industry/business type', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'EMPLOYER_REGISTRATIONS', section: 'Employer Registrations', label: 'Required SSS, PhilHealth, HDMF, BIR and SEC/DTI data and files', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'CONTACT_BANK', section: 'Contact / Bank / Payment', label: 'Primary business/payroll contacts and default payout account', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'AUTHORIZED_PEOPLE', section: 'Authorized People', label: 'Authorized contacts, signatories and approvers', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'SERVICES', section: 'Services', label: 'Selected service enrollment and service readiness', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'CALENDAR', section: 'Calendar', label: 'Active payout, cutoff, statutory and holiday calendars', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'STARTUP_YTD', section: 'Startup / YTD', label: 'Template downloaded, import validated and reconciliation accepted', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'BILLING', section: 'Billing', label: 'Billing setup completed when required', required: false, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'CONNECTED_SYSTEMS', section: 'Connected Systems', label: 'Required HRM/timekeeping/integration connections configured and tested', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'SECURITY_ACCESS', section: 'Security / Access', label: 'Company users, roles and approval hierarchy available', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'FINAL_REVIEW', section: 'Final Review', label: 'No blocking validation and review/approval recorded', required: true, status: 'Pending', evidence: '', remarks: '' },
  ];
}

export function offboardingChecklist() {
  return [
    { itemCode: 'DEPENDENCIES', section: 'Operational dependencies', label: 'Open payrolls, approvals, remittances, billing, sync errors and scheduled transactions reviewed', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'EXPORT_SCOPE', section: 'Export scope', label: 'Datasets, reports, configuration snapshots and documents confirmed', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'EXPORT_VALIDATION', section: 'Export validation', label: 'Package prepared, manifest and reconciliation counts validated', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'HANDOFF_APPROVAL', section: 'Handoff approval', label: 'Authorized approver accepted the export handoff', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'DELIVERY_ACK', section: 'Delivery acknowledgement', label: 'Recipient, package reference and acknowledgement recorded', required: true, status: 'Pending', evidence: '', remarks: '' },
    { itemCode: 'DEACTIVATION', section: 'Deactivation', label: 'Company removed from active processing while history remains available', required: true, status: 'Pending', evidence: '', remarks: '' },
  ];
}

export function saveImportBatch(batch, actor = 'P&A Admin') {
  const batches = readJson(IMPORT_STORAGE_KEY, []);
  const next = { batchId: batch.batchId || makeId('imp'), createdAt: now(), updatedAt: now(), ...batch };
  const index = batches.findIndex(item => item.batchId === next.batchId);
  if (index < 0) batches.unshift(next); else batches[index] = next;
  writeJson(IMPORT_STORAGE_KEY, batches);
  appendAuditEvent({ companyId: next.companyId, actor, action: `StartupDataImport${next.status}`, entityType: 'ImportBatch', entityId: next.batchId, summary: `${next.importType || 'Startup'} import ${next.status.toLowerCase()}.` });
  return next;
}

export function readImportBatches(companyId = '') {
  const batches = readJson(IMPORT_STORAGE_KEY, []);
  return (Array.isArray(batches) ? batches : []).filter(item => !companyId || item.companyId === companyId);
}

export function readAuditEvents(companyId = '') {
  const events = readJson(AUDIT_STORAGE_KEY, []);
  return (Array.isArray(events) ? events : []).filter(item => !companyId || item.companyId === companyId);
}

export function appendAuditEvent(event) {
  const events = readJson(AUDIT_STORAGE_KEY, []);
  events.unshift({ eventId: makeId('evt'), timestamp: now(), actor: 'System', ...event });
  writeJson(AUDIT_STORAGE_KEY, events.slice(0, 1000));
}

export function companyReadiness(company, lifecycleCase, imports = []) {
  const latestImport = imports.filter(item => item.companyId === company?.companyId).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  const checklist = lifecycleCase?.checklist || onboardingChecklist();
  const ready = itemCode => checklist.find(item => item.itemCode === itemCode)?.status === 'Complete';
  const owns = item => item?.companyId === company?.companyId || (!item?.companyId && company?.companyId === defaultCompanyRecord.companyId);
  const operationalReady = (workspaceKey, predicate) => [3, 2, 1]
    .some(version => readJson(`atlas-operational-${workspaceKey}-v${version}`, []).some(item => owns(item) && predicate(item)));
  const serviceReady = moduleKey => {
    const scoped = readJson(`atlas-service-${moduleKey}:${company?.companyId || 'default'}`, []);
    const legacy = company?.companyId === defaultCompanyRecord.companyId ? readJson(`atlas-service-${moduleKey}`, []) : [];
    return [...scoped, ...legacy].some(item => item.status === 'Active');
  };
  const derived = {
    COMPANY_IDENTITY: Boolean(company?.companyCode && company?.legalName && company?.tin && company?.industry),
    EMPLOYER_REGISTRATIONS: Boolean(company?.profile?.registrationStatus === 'Verified' && company?.documents?.some(item => item.status === 'Validated')),
    CONTACT_BANK: Boolean(company?.profile?.email && company?.profile?.address && company?.bankAccounts?.some(item => item.status === 'Active' && item.isDefault)),
    AUTHORIZED_PEOPLE: Boolean(company?.authorizedContacts?.some(item => item.status === 'Active') && company?.signatories?.some(item => item.status === 'Active')),
    SERVICES: Boolean(company?.serviceEnrollments?.some(item => item.enabled) && company?.serviceEnrollments?.filter(item => item.enabled).every(item => ['Ready', 'Connected'].includes(item.status))),
    CALENDAR: Boolean(operationalReady('calendar', item => item.status === 'Active') || serviceReady('payrollControls')),
    STARTUP_YTD: Boolean(latestImport && ['Validated', 'Completed'].includes(latestImport.status) && Number(latestImport.accepted || 0) > 0 && !latestImport.rejected),
    BILLING: Boolean(operationalReady('billing', item => ['Approved', 'Generated'].includes(item.status))),
    CONNECTED_SYSTEMS: Boolean(company?.serviceEnrollments?.filter(item => item.enabled && ['HRM', 'TIMEKEEPING'].includes(item.serviceCode)).every(item => ['Ready', 'Connected'].includes(item.status))),
    SECURITY_ACCESS: Boolean(readJson('atlas-security-grants-v1', []).some(item => owns(item) && item.status === 'Active')),
  };
  const preliminaryReady = checklist.filter(item => item.required && item.itemCode !== 'FINAL_REVIEW').every(item => derived[item.itemCode] || item.status === 'Complete');
  const nextChecklist = checklist.map(item => ({ ...item, status: item.itemCode === 'FINAL_REVIEW' && preliminaryReady ? 'Complete' : (derived[item.itemCode] ? 'Complete' : item.status) }));
  const blockers = nextChecklist.filter(item => item.required && item.status !== 'Complete').map(item => item.label);
  const warnings = nextChecklist.filter(item => !item.required && item.status !== 'Complete').map(item => item.label);
  return { checklist: nextChecklist, blockers, warnings, latestImport, complete: blockers.length === 0 && ready('FINAL_REVIEW') };
}

export function activateCompany(company, lifecycleCase, actor = 'Approver') {
  const nextCompany = saveCompany({ ...company, lifecycleStatus: 'Active', activationDate: company.activationDate || new Date().toISOString().slice(0, 10), offboardingStatus: 'Not scheduled' }, actor);
  const nextCase = saveLifecycleCase({ ...lifecycleCase, status: 'Active', completedAt: now() }, actor);
  appendAuditEvent({ companyId: company.companyId, actor, action: 'CompanyActivated', entityType: 'Company', entityId: company.companyId, summary: `${company.companyCode} activated.` });
  return { company: nextCompany, lifecycle: nextCase };
}

export function deactivateCompany(company, lifecycleCase, actor = 'Approver') {
  const nextCompany = saveCompany({ ...company, lifecycleStatus: 'Completed', offboardingStatus: 'Completed' }, actor);
  const nextCase = saveLifecycleCase({ ...lifecycleCase, status: 'Completed', completedAt: now() }, actor);
  appendAuditEvent({ companyId: company.companyId, actor, action: 'CompanyDeactivated', entityType: 'Company', entityId: company.companyId, summary: `${company.companyCode} deactivated; history retained.` });
  return { company: nextCompany, lifecycle: nextCase };
}
