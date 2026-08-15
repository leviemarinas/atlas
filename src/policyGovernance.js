import { companyRuleTaxonomy } from './requirementsCatalog';

const defaultEngineByCategory = {
  'Pay and Earnings': 'Earnings',
  'Attendance & Timekeeping': 'Time',
  'Time Management & Scheduling': 'Time',
  'Leave Management': 'Leave',
  'Loans & Deductions': 'Deductions',
  'Government & Company Compliance': 'Compliance',
  'Payroll Administration & Controls': 'Payroll',
  'Security & Access Controls': 'Compliance',
};

const links = {
  'Basic Pay': { engine: 'Earnings', computations: ['BAS-001', 'BAS-002', 'BAS-003'], references: ['REF-005', 'REF-010'] },
  'Pay Rate Adjustments': { engine: 'Earnings', computations: ['BAS-004'], references: ['REF-010', 'REF-018', 'REF-029'] },
  'Earnings and Allowances': { engine: 'Earnings', computations: ['ERN-001', 'ERN-003'], references: ['REF-019', 'REF-029'] },
  'Variable Allowances': { engine: 'Earnings', computations: ['ERN-004', 'ERN-005'], references: ['REF-010', 'REF-019', 'REF-029'] },
  'Reimbursements and Receivables': { engine: 'Earnings', computations: ['PAY-001', 'PAY-002'], references: ['REF-019', 'REF-029'] },
  '13th Month Pay and Bonuses': { engine: 'Bonus', computations: ['BON-001', 'BON-002', 'BON-003', 'BON-004'], references: ['REF-007', 'REF-020'] },
  'De Minimis Benefits': { engine: 'Earnings', computations: ['DMN-001', 'RCL-001'], references: ['REF-006', 'REF-021'] },
  'Earning Reclassification': { engine: 'Earnings', computations: ['RCL-001'], references: ['REF-019', 'REF-020', 'REF-021'] },
  'Gross Up': { engine: 'Tax', computations: ['GUP-001', 'TAX-002'], references: ['REF-001'] },
  'Take-Home Pay': { engine: 'Take-Home Pay', computations: ['THP-001', 'THP-002'], references: ['REF-011', 'REF-012', 'REF-022', 'REF-023'] },
  'Retirement Pay': { engine: 'Retirement Pay', computations: ['RET-001', 'RET-002'], references: ['REF-018', 'REF-030'] },
  'Final Pay': { engine: 'Final Pay', computations: ['FIN-001', 'PAY-002', 'TAX-008'], references: ['REF-011', 'REF-026', 'REF-030'] },
  'Part-Timers': { engine: 'Earnings', computations: ['PRT-001'], references: ['REF-010', 'REF-018'] },
  'OJT Allowance': { engine: 'Earnings', computations: ['OJT-001'], references: ['REF-010', 'REF-018'] },
  'Piece Rate': { engine: 'Earnings', computations: ['PCE-001'], references: ['REF-010', 'REF-018'] },
  Benefits: { engine: 'Benefits', computations: ['BEN-001', 'BEN-002', 'BEN-003', 'BEN-004', 'BEN-005'], references: ['REF-018', 'REF-021'] },
  Absences: { engine: 'Deductions', computations: ['DED-001'], references: ['REF-010', 'REF-026'] },
  Tardiness: { engine: 'Deductions', computations: ['DED-002'], references: ['REF-010'] },
  Undertime: { engine: 'Deductions', computations: ['DED-003'], references: ['REF-010'] },
  Overtime: { engine: 'Earnings', computations: ['ERN-002'], references: ['REF-008', 'REF-019'] },
  'Break Hours': { engine: 'Time', computations: [], references: ['REF-025'] },
  'Holiday Adjacency': { engine: 'Time', computations: [], references: ['REF-024', 'REF-026'] },
  'Shift Schedule Creation': { engine: 'Time', computations: [], references: ['REF-025'] },
  'Time In & Time Out': { engine: 'Time', computations: [], references: ['REF-025'] },
  'Work Hours': { engine: 'Time', computations: ['BAS-002', 'BAS-003'], references: ['REF-010', 'REF-025'] },
  'Rest Days': { engine: 'Time', computations: ['ERN-006'], references: ['REF-009', 'REF-024'] },
  Holidays: { engine: 'Time', computations: ['ERN-006'], references: ['REF-009', 'REF-024'] },
  'Payroll Cutoffs': { engine: 'Time', computations: [], references: ['REF-029'] },
  'Leave Accrual': { engine: 'Leave', computations: [], references: ['REF-018', 'REF-026'] },
  'Leave Balances': { engine: 'Leave', computations: [], references: ['REF-026'] },
  'Leave Conversion': { engine: 'Leave', computations: ['FIN-001'], references: ['REF-006', 'REF-026'] },
  'Service Incentive Leave': { engine: 'Leave', computations: ['FIN-001'], references: ['REF-006', 'REF-026'] },
  'Leave Forfeiture': { engine: 'Leave', computations: [], references: ['REF-026'] },
  'Leave with Pay': { engine: 'Leave', computations: ['ERN-001'], references: ['REF-019', 'REF-026'] },
  'Leave without Pay': { engine: 'Deductions', computations: ['DED-001'], references: ['REF-010', 'REF-026'] },
  'Company Deductions': { engine: 'Deductions', computations: [], references: ['REF-011', 'REF-022', 'REF-029'] },
  'Company Loans': { engine: 'Deductions', computations: [], references: ['REF-011', 'REF-023', 'REF-029'] },
  'Government Loans': { engine: 'Deductions', computations: [], references: ['REF-011', 'REF-023', 'REF-029'] },
  'Deduction Hierarchy': { engine: 'Take-Home Pay', computations: ['THP-002'], references: ['REF-011'] },
  'Deferred Deductions': { engine: 'Take-Home Pay', computations: ['THP-002'], references: ['REF-011', 'REF-022', 'REF-023'] },
  'Statutory Deductions': { engine: 'Government', computations: ['GOV-001', 'GOV-002', 'GOV-003'], references: ['REF-001', 'REF-002', 'REF-003', 'REF-004'] },
  'Tax Annualization': { engine: 'Tax', computations: ['TAX-008', 'TAX-009', 'TAX-010'], references: ['REF-001'] },
  'Government Contributions': { engine: 'Government', computations: ['GOV-001', 'GOV-002', 'GOV-003'], references: ['REF-002', 'REF-003', 'REF-004'] },
  'Multiple Bank Accounts': { engine: 'Payroll', computations: ['PAY-002'], references: ['REF-013'] },
  'Duplicate TIN Validation': { engine: 'Compliance', computations: [], references: [] },
  'Minimum Wage and ECOLA': { engine: 'Government', computations: ['MWE-001'], references: ['REF-005'] },
  'Date and Number Formats': { engine: 'Payroll', computations: [], references: [] },
  'Cost Allocation': { engine: 'Payroll', computations: [], references: ['REF-015', 'REF-017', 'REF-028'] },
  Allotments: { engine: 'Payroll', computations: ['PAY-002'], references: ['REF-013'] },
  'Multi-Currency': { engine: 'Payroll', computations: [], references: ['REF-027'] },
  'Payroll Calendar': { engine: 'Payroll', computations: [], references: ['REF-029'] },
  'Payslip Rules': { engine: 'Payroll', computations: [], references: ['REF-014'] },
  Notifications: { engine: 'Payroll', computations: [], references: [] },
  'Approval Hierarchy': { engine: 'Payroll', computations: [], references: [] },
  'Connected Systems': { engine: 'Payroll', computations: [], references: [] },
  'Session Timeout': { engine: 'Compliance', computations: [], references: [] },
  Passphrase: { engine: 'Compliance', computations: [], references: [] },
  'Role-Based Access': { engine: 'Compliance', computations: [], references: [] },
  'Single Sign-On': { engine: 'Compliance', computations: [], references: [] },
};

const categoryForSubcategory = subcategory => Object.entries(companyRuleTaxonomy).find(([, values]) => values.includes(subcategory))?.[0] || '';

export function getPolicyLinkage(record = {}) {
  const category = record.category || categoryForSubcategory(record.subcategory);
  const configured = links[record.subcategory] || {};
  return {
    category,
    subcategory: record.subcategory || '',
    engine: configured.engine || record.engine || defaultEngineByCategory[category] || 'Payroll',
    computations: [...(configured.computations || [])],
    references: [...(configured.references || [])],
    source: 'Phase 2 Master Requirements / Annex B',
  };
}

export const policyCoverageCatalog = Object.entries(companyRuleTaxonomy).flatMap(([category, subcategories]) =>
  subcategories.map(subcategory => getPolicyLinkage({ category, subcategory })),
);

