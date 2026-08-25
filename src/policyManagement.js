import { requirementRuleSeeds } from './requirementsCatalog.js';

export const policyStorageKey = companyId => `atlas-company-rules-v3:${companyId || 'default'}`;

export function normalizePolicy(policy, index = 0, companyId = '') {
  const active = policy.status ? policy.status === 'Active' : policy.enabled !== false;
  return {
    ...policy,
    id: policy.id ?? index + 1,
    companyId: policy.companyId || companyId,
    status: active ? 'Active' : 'Inactive',
    enabled: active,
    version: String(policy.version || '1.0'),
    effectiveFrom: policy.effectiveFrom || '2026-01-01',
    effectiveTo: policy.effectiveTo || '',
    supersedesPolicyId: policy.supersedesPolicyId || '',
  };
}

export function readManagedPolicies(companyId, storage = globalThis.localStorage) {
  try {
    const scoped = JSON.parse(storage?.getItem(policyStorageKey(companyId)) || 'null');
    const legacy = companyId === 'cmp-abc-001' ? JSON.parse(storage?.getItem('atlas-company-rules-v3') || 'null') : null;
    const saved = Array.isArray(scoped) ? scoped : Array.isArray(legacy) ? legacy : [];
    const missing = requirementRuleSeeds.filter(seed => !saved.some(policy => (policy.policyCode || policy.parameter) === seed.policyCode));
    return [...missing, ...saved].map((policy, index) => normalizePolicy(policy, index, companyId));
  } catch {
    return requirementRuleSeeds.map((policy, index) => normalizePolicy(policy, index, companyId));
  }
}

const startOf = policy => policy.effectiveFrom || '0000-01-01';
const endOf = policy => policy.effectiveTo || '9999-12-31';

export function periodsOverlap(left, right) {
  return startOf(left) <= endOf(right) && startOf(right) <= endOf(left);
}

export function applicabilityOverlaps(left, right) {
  if ((left.groupBy || 'All Employees') === 'All Employees' || (right.groupBy || 'All Employees') === 'All Employees') return true;
  return left.groupBy === right.groupBy && left.groupValue === right.groupValue;
}

export function policiesConflict(left, right) {
  const leftCode = left.policyCode || left.parameter;
  const rightCode = right.policyCode || right.parameter;
  return left.id !== right.id
    && leftCode === rightCode
    && periodsOverlap(left, right)
    && applicabilityOverlaps(left, right);
}

export function policySelectionConflicts(policies = []) {
  const conflicts = [];
  policies.forEach((policy, index) => policies.slice(index + 1).forEach(other => {
    if (policiesConflict(policy, other)) conflicts.push([policy, other]);
  }));
  return conflicts;
}

export function policyAppliesToRun(policy, run) {
  if (policy.status !== 'Active') return false;
  const runWindow = { effectiveFrom: run.periodStart || run.payoutDate, effectiveTo: run.periodEnd || run.payoutDate };
  return periodsOverlap(policy, runWindow);
}

export function policyUsage(policy, runs = []) {
  return runs.filter(run => run.status !== 'Cancelled' && (run.appliedPolicies || []).some(applied => applied.policyId === policy.id));
}

export function canEditPolicy(policy, runs = []) {
  return policy.status === 'Active' && policyUsage(policy, runs).length === 0;
}

export function createPolicyVersion(policy, policies = []) {
  const versions = policies
    .filter(item => (item.policyCode || item.parameter) === (policy.policyCode || policy.parameter))
    .map(item => Number.parseFloat(item.version) || 1);
  const version = (Math.max(0, ...versions) + 1).toFixed(1);
  return {
    ...policy,
    id: undefined,
    status: 'Active',
    enabled: true,
    version,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
    supersedesPolicyId: policy.id,
  };
}

export function policySnapshot(policy) {
  return {
    policyId: policy.id,
    code: policy.policyCode || policy.parameter,
    name: policy.rule,
    category: policy.category,
    subcategory: policy.subcategory,
    version: policy.version,
    effectiveFrom: policy.effectiveFrom,
    effectiveTo: policy.effectiveTo,
    groupBy: policy.groupBy,
    groupValue: policy.groupValue,
  };
}
