import { appendAuditEvent, getCompany, readCompanies } from './companyRepository';

const safeRead = (key, fallback) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const safeWrite = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
};

const activeCompany = companyId => getCompany(companyId || readCompanies()[0]?.companyId);
const companyIdFor = companyId => activeCompany(companyId)?.companyId || 'cmp-abc-001';

export const securityStorageKeys = {
  policy: 'atlas-security-policy-v1',
  reportProtection: 'atlas-report-protection-v1',
  roles: 'atlas-security-roles-v1',
  grants: 'atlas-security-grants-v1',
  features: 'atlas-feature-entitlements-v1',
  fields: 'atlas-field-metadata-v1',
  preferences: 'atlas-preferences-v1',
};

const featureEntitlementMigrationKey = 'atlas-feature-entitlement-migration-v1';

export const defaultSecurityPolicy = {
  authMode: 'P&A OAuth / O365 SSO',
  ssoProvider: 'Microsoft Entra ID',
  mfaRequired: true,
  mfaMethods: ['SMS', 'Microsoft Authenticator'],
  capabilityGatedMethods: { Email: 'Unavailable', Google: 'Unavailable' },
  passwordMode: 'Managed by Identity Provider',
  inactivityTimeoutSeconds: 30,
  warningSeconds: 15,
  sessionMaxAgeHours: 12,
  lockoutAttempts: 5,
  lockoutMinutes: 15,
  status: 'Active',
  version: 1,
  updatedAt: '',
};

export const defaultReportProtection = {
  enabled: true,
  provider: 'Managed secret vault',
  defaultSecretRef: 'vault://company/cmp-abc-001/report-protection/default',
  rotationRequiredDays: 90,
  lastRotatedAt: '2026-01-01T09:00:00.000Z',
  groups: [
    { id: 'group-payroll', name: 'Payroll exports', delivery: 'Encrypted ZIP', secretRef: 'vault://company/cmp-abc-001/report-protection/payroll', status: 'Active' },
    { id: 'group-statutory', name: 'Statutory reports', delivery: 'Encrypted ZIP', secretRef: 'vault://company/cmp-abc-001/report-protection/statutory', status: 'Active' },
  ],
  version: 1,
};

export const defaultRoles = [
  { id: 'role-client-admin', name: 'Client Admin', description: 'Company-scoped administration', status: 'Active', permissionCount: 18 },
  { id: 'role-preparer', name: 'Preparer', description: 'Prepare payroll and configuration changes', status: 'Active', permissionCount: 9 },
  { id: 'role-checker', name: 'Checker', description: 'Validate prepared work', status: 'Active', permissionCount: 8 },
  { id: 'role-reviewer', name: 'Reviewer', description: 'Review and approve controlled changes', status: 'Active', permissionCount: 7 },
];

export const defaultGrants = [
  { id: 'grant-001', user: 'John Doe', role: 'Client Admin', companyId: 'cmp-abc-001', module: 'Company Rules', feature: 'Policy assignment', permission: 'Create, Edit, Approve', approvalLevel: 'Final', status: 'Active' },
  { id: 'grant-002', user: 'Maria Santos', role: 'Reviewer', companyId: 'cmp-abc-001', module: 'Payroll Transaction', feature: 'Payroll approval', permission: 'Review, Approve', approvalLevel: 'Level 2', status: 'Active' },
];

export const defaultFeatureCatalog = [
  { featureCode: 'PAYROLL', serviceCode: 'PAYROLL', label: 'Payroll', detail: 'Payroll processing, payslips, statutory and rules', enabled: true, status: 'Entitled' },
  { featureCode: 'TIMEKEEPING', serviceCode: 'TIMEKEEPING', label: 'Time & Attendance', detail: 'Timekeeping and attendance source', enabled: true, status: 'Entitled' },
  { featureCode: 'OVERTIME', serviceCode: 'PAYROLL', label: 'Overtime', detail: 'Overtime types, rates and designations', enabled: true, status: 'Entitled' },
  { featureCode: 'HRM', serviceCode: 'HRM', label: 'HRM', detail: 'Employee and people operations', enabled: true, status: 'Entitled' },
  { featureCode: 'BILLING', serviceCode: 'BILLING', label: 'Billing', detail: 'Client billing and cutoffs', enabled: true, status: 'Entitled' },
  { featureCode: 'HAPPINESS', serviceCode: 'HAPPINESS', label: 'Happiness Meter', detail: 'Employee sentiment (scope-gated and separately approved)', enabled: false, status: 'Not entitled' },
  { featureCode: 'WELLNESS', serviceCode: 'WELLNESS', label: 'Health & Wellness', detail: 'Wellness workspace (scope-gated and separately approved)', enabled: false, status: 'Not entitled' },
];

export const defaultFieldMetadata = [
  { fieldKey: 'employeeCode', displayLabel: 'Employee Code', domain: 'Employee Masterfile', requiredOnCreate: true, nullableOnUpdate: false, sensitive: false, bulkUpdateAllowed: false, visibility: 'Visible', requiredness: 'Required (read-only)' },
  { fieldKey: 'firstName', displayLabel: 'First Name', domain: 'Employee Masterfile', requiredOnCreate: true, nullableOnUpdate: false, sensitive: false, bulkUpdateAllowed: true, visibility: 'Visible', requiredness: 'Required (read-only)' },
  { fieldKey: 'lastName', displayLabel: 'Last Name', domain: 'Employee Masterfile', requiredOnCreate: true, nullableOnUpdate: false, sensitive: false, bulkUpdateAllowed: true, visibility: 'Visible', requiredness: 'Required (read-only)' },
  { fieldKey: 'birthdate', displayLabel: 'Birthdate', domain: 'Employee Masterfile', requiredOnCreate: false, nullableOnUpdate: true, sensitive: true, bulkUpdateAllowed: true, visibility: 'Visible', requiredness: 'Optional' },
  { fieldKey: 'employmentStatus', displayLabel: 'Employment Status', domain: 'Employee Masterfile', requiredOnCreate: true, nullableOnUpdate: false, sensitive: false, bulkUpdateAllowed: true, visibility: 'Visible', requiredness: 'Required (read-only)' },
  { fieldKey: 'department', displayLabel: 'Department', domain: 'Employee Masterfile', requiredOnCreate: false, nullableOnUpdate: true, sensitive: false, bulkUpdateAllowed: true, visibility: 'Visible', requiredness: 'Optional' },
  { fieldKey: 'jobTitle', displayLabel: 'Job Title', domain: 'Employee Masterfile', requiredOnCreate: false, nullableOnUpdate: true, sensitive: false, bulkUpdateAllowed: true, visibility: 'Visible', requiredness: 'Optional' },
  { fieldKey: 'costCenter', displayLabel: 'Cost Center', domain: 'Employee Masterfile', requiredOnCreate: false, nullableOnUpdate: true, sensitive: false, bulkUpdateAllowed: true, visibility: 'Visible', requiredness: 'Optional' },
  { fieldKey: 'bankCompanyCode', displayLabel: 'Bank Company Code', domain: 'Payroll', requiredOnCreate: false, nullableOnUpdate: true, sensitive: true, bulkUpdateAllowed: true, visibility: 'Visible', requiredness: 'Optional' },
  { fieldKey: 'paymentMode', displayLabel: 'Payment Mode', domain: 'Payroll', requiredOnCreate: false, nullableOnUpdate: true, sensitive: false, bulkUpdateAllowed: true, visibility: 'Visible', requiredness: 'Optional' },
];

export const defaultPreferences = {
  theme: 'Light',
  density: 'Comfortable',
  dateFormat: 'MM/DD/YYYY',
  timeZone: 'Asia/Manila',
  defaultLanding: 'Company Information',
  emailDigest: 'Daily',
};

function scopedCollection(key, fallback, companyId) {
  const scope = companyIdFor(companyId);
  const value = safeRead(key, {});
  const scoped = Array.isArray(value) ? value.filter(item => item.companyId === scope) : value?.[scope];
  if (scoped && (Array.isArray(scoped) ? scoped.length : Object.keys(scoped).length)) return scoped;
  if (Array.isArray(fallback)) return fallback.map(item => ({ ...item, companyId: scope }));
  return { ...fallback, companyId: scope };
}

function saveScopedCollection(key, value, companyId) {
  const scope = companyIdFor(companyId);
  const existing = safeRead(key, {});
  if (Array.isArray(value)) {
    const current = Array.isArray(existing) ? existing.filter(item => item.companyId !== scope) : [];
    return safeWrite(key, [...value.map(item => ({ ...item, companyId: scope })), ...current]);
  }
  return safeWrite(key, { ...(existing && !Array.isArray(existing) ? existing : {}), [scope]: { ...value, companyId: scope } });
}

export function readSecurityPolicy(companyId) {
  const scope = companyIdFor(companyId);
  const saved = safeRead(securityStorageKeys.policy, {});
  return { ...defaultSecurityPolicy, ...(saved?.[scope] || {}), companyId: scope };
}

export function saveSecurityPolicy(policy, actor = 'Client Admin') {
  const scope = companyIdFor(policy.companyId);
  const current = readSecurityPolicy(scope);
  const next = { ...current, ...policy, companyId: scope, version: Number(current.version || 0) + 1, updatedAt: new Date().toISOString() };
  const saved = safeRead(securityStorageKeys.policy, {});
  safeWrite(securityStorageKeys.policy, { ...saved, [scope]: next });
  appendAuditEvent({ companyId: scope, actor, action: 'SecurityPolicyUpdated', entityType: 'SecurityPolicy', entityId: scope, summary: `Security policy v${next.version} saved.` });
  return next;
}

export function readReportProtection(companyId) {
  const scope = companyIdFor(companyId);
  const saved = safeRead(securityStorageKeys.reportProtection, {});
  return { ...defaultReportProtection, ...(saved?.[scope] || {}), companyId: scope, defaultSecretRef: saved?.[scope]?.defaultSecretRef || `vault://company/${scope}/report-protection/default` };
}

export function saveReportProtection(value, actor = 'Client Admin') {
  const scope = companyIdFor(value.companyId);
  const current = readReportProtection(scope);
  const next = { ...current, ...value, companyId: scope, version: Number(current.version || 0) + 1, updatedAt: new Date().toISOString() };
  const saved = safeRead(securityStorageKeys.reportProtection, {});
  safeWrite(securityStorageKeys.reportProtection, { ...saved, [scope]: next });
  appendAuditEvent({ companyId: scope, actor, action: 'ReportProtectionUpdated', entityType: 'ReportProtection', entityId: scope, summary: `Report protection v${next.version} saved; secret references only.` });
  return next;
}

export function readRoles(companyId) { return scopedCollection(securityStorageKeys.roles, defaultRoles, companyId); }
export function readGrants(companyId) { return scopedCollection(securityStorageKeys.grants, defaultGrants, companyId); }
export function readFeatureEntitlements(companyId) {
  const company = activeCompany(companyId);
  const enrolled = new Set((company?.serviceEnrollments || []).filter(item => item.enabled).map(item => item.serviceCode));
  const stored = scopedCollection(securityStorageKeys.features, defaultFeatureCatalog, companyId);
  const scope = companyIdFor(companyId);
  const migrations = safeRead(featureEntitlementMigrationKey, {});
  const shouldEnableInherited = scope === 'cmp-abc-001' && !migrations[scope];
  const next = stored.map(item => ({
    ...item,
    enabled: Boolean(enrolled.has(item.serviceCode) && (item.enabled || (shouldEnableInherited && ['HAPPINESS', 'WELLNESS'].includes(item.featureCode)))),
    status: enrolled.has(item.serviceCode) ? 'Entitled' : 'Not entitled',
  }));
  if (shouldEnableInherited) {
    saveScopedCollection(securityStorageKeys.features, next, scope);
    safeWrite(featureEntitlementMigrationKey, { ...migrations, [scope]: true });
  }
  return next;
}
export function saveFeatureEntitlements(value, actor = 'Client Admin') {
  const scope = companyIdFor(value?.[0]?.companyId);
  const next = saveScopedCollection(securityStorageKeys.features, value, scope);
  appendAuditEvent({ companyId: scope, actor, action: 'FeatureEntitlementsUpdated', entityType: 'FeatureEntitlement', entityId: scope, summary: 'Company feature entitlements updated.' });
  return next;
}
export function readFieldMetadata(companyId) { return scopedCollection(securityStorageKeys.fields, defaultFieldMetadata, companyId); }
export function saveFieldMetadata(value, actor = 'Client Admin') {
  const scope = companyIdFor(value?.[0]?.companyId);
  if (value.some(item => item.requiredness === 'Required (read-only)' && item.visibility === 'Hidden')) throw new Error('Required fields cannot be hidden or made optional.');
  const next = saveScopedCollection(securityStorageKeys.fields, value, scope);
  appendAuditEvent({ companyId: scope, actor, action: 'FieldMetadataUpdated', entityType: 'FieldMetadata', entityId: scope, summary: 'Optional field visibility updated; requiredness remained read-only.' });
  return next;
}
export function readPreferences(companyId) {
  const scope = companyIdFor(companyId);
  const saved = safeRead(securityStorageKeys.preferences, {});
  return { ...defaultPreferences, ...(saved?.[scope] || {}), companyId: scope };
}
export function savePreferences(value, actor = 'Client Admin') {
  const scope = companyIdFor(value.companyId);
  const next = { ...readPreferences(scope), ...value, companyId: scope, updatedAt: new Date().toISOString() };
  const saved = safeRead(securityStorageKeys.preferences, {});
  safeWrite(securityStorageKeys.preferences, { ...saved, [scope]: next });
  appendAuditEvent({ companyId: scope, actor, action: 'PreferencesUpdated', entityType: 'Preference', entityId: scope, summary: 'Presentation preferences updated.' });
  return next;
}
