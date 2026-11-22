/**
 * Bonus Hierarchies (Services Information › Payroll › Bonus Hierarchy).
 *
 * A hierarchy is a named, ranked list of bonus types: the first bonus uses the
 * non-taxable Bonus Threshold first. A company keeps as many as it likes. The
 * Bonus policy picks the one payroll uses and a payroll transaction may pick
 * another for itself. A bonus a hierarchy does not list is paid after the ranked
 * ones, oldest Bonus Configuration first, and the same oldest-first order applies
 * when no hierarchy is in effect. Nothing about a hierarchy is locked by payroll use.
 */
import { readActiveCompanyId } from './companyRepository';
import { isStandardHierarchy, readServiceConfiguration } from './serviceModules';
import { byCreation } from './creationOrder.js';

/** The ranked bonuses of a hierarchy record, first in line first. */
export const rankedBonusesOf = record => String(record?.rankedBonuses || '').split(',').map(item => item.trim()).filter(Boolean);

/** The active Bonus Hierarchy records of a company. There is always Standard. */
export function readBonusHierarchies(companyId = readActiveCompanyId()) {
  return readServiceConfiguration('bonusHierarchy', companyId).filter(item => (item.status || 'Active') === 'Active' && String(item.name || '').trim());
}

export function bonusHierarchyNames(companyId) {
  return readBonusHierarchies(companyId).map(item => item.name);
}

/** The bonus types of the company's Bonus Configurations, oldest first (a type takes the date of its oldest configuration). */
function bonusTypesOldestFirst(companyId) {
  const seen = new Set();
  return readServiceConfiguration('bonuses', companyId).filter(record => (record.status || 'Active') === 'Active').sort(byCreation)
    .map(record => record.type).filter(type => type && !seen.has(type) && seen.add(type));
}

/**
 * The bonus types in the order they use the threshold: the chosen hierarchy's, then every other
 * type oldest first. A hierarchy that is gone or inactive falls to Standard.
 */
export function bonusOrderFor(hierarchy, companyId) {
  const all = readBonusHierarchies(companyId);
  const chosen = all.find(item => item.name === hierarchy) || all.find(item => isStandardHierarchy('bonusHierarchy', item)) || all[0];
  const ranked = rankedBonusesOf(chosen);
  return [...ranked, ...bonusTypesOldestFirst(companyId).filter(type => !ranked.includes(type))];
}
