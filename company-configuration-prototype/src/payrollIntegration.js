import { readServiceConfiguration } from './serviceModules';

const numeric = value => Number(value || 0);
const active = record => (record.status || 'Active') === 'Active';
const adjustable = record => (record.balanceHandling || record.takeHomeTreatment || 'Partial Deduction') !== 'Deduct in Full';

export const PAYROLL_REFERENCE_CODES = {
  hierarchy: 'REF-011',
  deductions: 'REF-022',
  loans: 'REF-023',
};

/**
 * Canonical deduction/loan definitions consumed by reference sources, the
 * Take-Home engine, payroll simulation, the employee ledger, and payslips.
 * Setup stays owned by the service modules; this projection never stores a
 * competing copy of those definitions.
 */
export function readPayrollCollectionDefinitions() {
  const deductions = readServiceConfiguration('deductions').filter(active)
    .filter(record => (record.partOfNetPay || 'Yes') === 'Yes')
    .map(record => ({
      code: record.code,
      name: record.name,
      group: 'Deduction',
      kind: record.type || 'Company',
      sourceModule: 'deductions',
      sourceLabel: 'Deduction module',
      rank: numeric(record.hierarchyPriority) || 20,
      due: numeric(record.amount),
      outstanding: numeric(record.balance) || numeric(record.amount),
      frequency: record.frequency,
      treatment: record.takeHomeTreatment || 'Partial Deduction',
      canAdjust: adjustable(record),
    }));

  const companyLoans = readServiceConfiguration('loans').filter(active).map(record => ({
    code: record.code,
    name: record.name,
    group: 'Loan',
    kind: 'Company',
    sourceModule: 'loans',
    sourceLabel: 'Company Loan module',
    rank: numeric(record.hierarchyPriority) || 10,
    due: numeric(record.amortization),
    outstanding: numeric(record.balance) || numeric(record.principal),
    frequency: record.frequency,
    treatment: record.balanceHandling || 'Partial Deduction',
    canAdjust: adjustable(record),
  }));

  const governmentLoans = readServiceConfiguration('governmentLoans').filter(active).map(record => ({
    code: record.code,
    name: record.name,
    group: 'Loan',
    kind: 'Government',
    sourceModule: 'governmentLoans',
    sourceLabel: 'Government Loan module',
    rank: numeric(record.priority) || 5,
    due: numeric(record.amortization),
    outstanding: numeric(record.openingBalance),
    frequency: record.frequency,
    treatment: record.balanceHandling || 'Partial Deduction',
    canAdjust: adjustable(record),
  }));

  return [...governmentLoans, ...companyLoans, ...deductions];
}

const sourceCodeFromNote = note => {
  const parts = String(note || '').split(/\s*(?:·|Â·)\s*/);
  return parts.find(part => /^(?:DED|CL|GL|ATT)-/i.test(part)) || '';
};

const existingFor = (entries, definition) => entries.find(entry =>
  sourceCodeFromNote(entry.note) === definition.code
  || entry.key === definition.name
  || String(entry.key || '').startsWith(`${definition.code} -`));

export function synchronizePayrollReference(referenceCode, entries = []) {
  const definitions = readPayrollCollectionDefinitions();
  if (referenceCode === PAYROLL_REFERENCE_CODES.hierarchy) {
    const statutory = entries.find(entry => /statutory/i.test(entry.key || ''));
    const rows = [{
      id: statutory?.id || 1,
      key: 'Statutory deductions',
      value: '0',
      note: 'Statutory · Never adjusted · STATUTORY · Statutory engine',
    }];
    definitions.forEach((definition, index) => {
      const previous = existingFor(entries, definition);
      rows.push({
        id: previous?.id || index + 2,
        key: definition.name,
        value: String(previous?.value || definition.rank),
        note: `${definition.group} · ${definition.kind} · ${definition.code} · ${definition.sourceLabel}`,
      });
    });
    const attendance = entries.find(entry => /Lates|Absences|Undertime/i.test(entry.key || ''));
    rows.push({
      id: attendance?.id || rows.length + 1,
      key: 'Lates, Absences & Undertime',
      value: String(attendance?.value || Math.max(30, ...definitions.map(item => item.rank + 1))),
      note: 'Deduction · Attendance · ATT-LAUT · Time and Attendance engine',
    });
    const ordered = rows.slice(1).sort((left, right) => Number(left.value) - Number(right.value));
    return [rows[0], ...ordered.map((row, index) => ({ ...row, value: String(index + 1) }))]
      .map((row, index) => ({ ...row, id: index + 1 }));
  }

  if (referenceCode === PAYROLL_REFERENCE_CODES.deductions) {
    return definitions.filter(item => item.group === 'Deduction').map((item, index) => ({
      id: index + 1,
      key: `${item.code} - ${item.name}`,
      value: item.frequency || 'Every Payroll',
      note: `${item.kind} · ${item.treatment} · ${item.sourceLabel}`,
    }));
  }

  if (referenceCode === PAYROLL_REFERENCE_CODES.loans) {
    return definitions.filter(item => item.group === 'Loan').map((item, index) => ({
      id: index + 1,
      key: `${item.code} - ${item.name}`,
      value: item.kind,
      note: `${item.frequency || 'Every Payroll'} · ${item.treatment} · ${item.sourceLabel}`,
    }));
  }
  return entries;
}

export function configuredCollectionByCode(code) {
  return readPayrollCollectionDefinitions().find(item => item.code === code);
}
