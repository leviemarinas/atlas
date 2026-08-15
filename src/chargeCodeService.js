import { readActiveCompanyId } from './companyRepository';

const STORAGE_KEY = 'atlas-charge-codes-v1';

/** Cost-allocation references a company starts with. */
export const defaultChargeCodes = [
  { id: 'cc-001', code: 'CC-MKT', name: 'Marketing', type: 'Department', status: 'Active', usage: 12, effectiveFrom: '2026-01-01' },
  { id: 'cc-002', code: 'CC-OPS', name: 'Operations', type: 'Department', status: 'Active', usage: 8, effectiveFrom: '2026-01-01' },
  { id: 'cc-003', code: 'PRJ-ATLAS', name: 'Atlas Project', type: 'Project', status: 'Active', usage: 0, effectiveFrom: '2026-01-01' },
  { id: 'cc-004', code: 'JT-PAY', name: 'Payroll Specialist', type: 'Job Title', status: 'Active', usage: 0, effectiveFrom: '2026-01-01' },
  { id: 'cc-005', code: 'SITE-MKT', name: 'Makati', type: 'Site', status: 'Active', usage: 0, effectiveFrom: '2026-01-01' },
  { id: 'cc-006', code: 'CC-100', name: 'Corporate Services', type: 'Cost Center', status: 'Active', usage: 0, effectiveFrom: '2026-01-01' },
];

export const chargeCodeTypes = ['Department', 'Job Title', 'Site', 'Section', 'Project', 'Cost Center', 'Employee Group'];

export function readChargeCodes(companyId = readActiveCompanyId()) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const rows = Array.isArray(saved) ? saved.filter(item => item.companyId === companyId) : [];
    return rows.length ? rows : defaultChargeCodes.map(item => ({ ...item, companyId }));
  } catch { return defaultChargeCodes.map(item => ({ ...item, companyId })); }
}

/** Active charge-code names for a given allocation type, used by employee cost allocation. */
export function chargeCodeNames(type, companyId = readActiveCompanyId()) {
  return readChargeCodes(companyId).filter(row => row.status === 'Active' && (!type || row.type === type)).map(row => row.name);
}
