/**
 * Which Deduction Hierarchy and Company Loan Hierarchy a company's payroll follows.
 *
 * The Take-Home Pay policy holds the choice (`deductionHierarchy` and `loanHierarchy`). This reads it the way
 * the policy screen does — the version in force on a date, else the saved policy — without importing the
 * policy screen, which itself depends on the payroll code that needs the answer.
 */
import { defaultCompanyRecord, readActiveCompanyId } from './companyRepository';
import { engineValuesAsOf, readEngineVersions } from './policyEngineVersions.js';

const STORAGE_KEY = 'atlas-payroll-policy-engines-v4';

export function chosenCollectionHierarchies(companyId = readActiveCompanyId(), asOf) {
  try {
    const versions = readEngineVersions(companyId);
    const inForce = engineValuesAsOf(versions, 'takeHome', asOf || undefined);
    let policy = inForce?.values;
    if (!policy) {
      const scoped = JSON.parse(localStorage.getItem(`${STORAGE_KEY}:${companyId || 'default'}`) || 'null');
      const saved = scoped !== null ? scoped : (companyId === defaultCompanyRecord.companyId ? JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') : null);
      policy = saved?.takeHome;
    }
    return { deduction: policy?.deductionHierarchy, loan: policy?.loanHierarchy };
  } catch { return {}; }
}
