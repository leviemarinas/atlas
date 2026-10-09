/**
 * Computational Basis governance views that P&A asked for in the formula
 * review: where a formula is used, several test cases per version (locked once
 * the version is approved), a side-by-side compare of two versions, versions
 * dated in the future, and the precedence and conflict check between company
 * assignments. Pure — screens and tests call the same functions.
 */

const normalize = code => String(code || '').trim().toUpperCase();
const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------- where used */

/**
 * Every place a formula is used: pay items bound to it, formulas built on it,
 * pipeline assignments, company assignments and payroll transactions.
 */
export function whereUsed(code, { library = [], payItems = [], assignments = [], companies = [], applicability = {}, transactions = [] } = {}) {
  const wanted = normalize(code);
  const token = `{{${wanted}}}`;
  const companyName = id => companies.find(company => company.companyId === id)?.displayName || companies.find(company => company.companyId === id)?.legalName || id;
  return [
    ...payItems.map(item => ({ kind: 'Pay item', where: `${item.name} (${item.code})`, company: item.companyName || companyName(item.companyId), detail: `Bound in Services Information › ${item.moduleKey}` })),
    ...library.filter(item => normalize(item.code) !== wanted && String(item.expression || '').toUpperCase().includes(token))
      .map(item => ({ kind: 'Formula', where: `${item.code} · ${item.name}`, company: item.ownerCompanyId ? companyName(item.ownerCompanyId) : 'All assigned companies', detail: `Builds on ${wanted} (v${item.version})` })),
    ...assignments.filter(item => normalize(item.computationCode) === wanted)
      .map(item => ({ kind: 'Pipeline assignment', where: item.type, company: item.companyName || '', detail: `${item.table || 'No reference table'} · effective ${item.effectiveDate || '—'} · ${item.status}` })),
    ...Object.entries(applicability[wanted] || {}).filter(([, entry]) => entry.applied)
      .map(([companyId, entry]) => ({ kind: 'Company assignment', where: entry.subgroup && entry.subgroup !== 'All employees' ? entry.subgroup : 'All employees', company: companyName(companyId), detail: `${entry.status}${entry.startDate ? ` · from ${entry.startDate}` : ''}${entry.endDate ? ` to ${entry.endDate}` : ''}${entry.priority ? ` · priority ${entry.priority}` : ''}` })),
    ...transactions.map(item => ({ kind: 'Payroll transaction', where: item.transactionNumber, company: item.companyName || '', detail: `${item.status}${item.version ? ` · v${item.version}` : ''}${item.period ? ` · ${item.period}` : ''}` })),
  ];
}

export function whereUsedCsv(code, rows) {
  const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [['Formula', 'Used as', 'Where', 'Company', 'Detail'].map(cell).join(','), ...rows.map(row => [code, row.kind, row.where, row.company, row.detail].map(cell).join(','))].join('\n');
}

/* ------------------------------------------------------------- test cases */

/**
 * Runs every test case against an expression. A case passes when the result
 * is within half a centavo of its expected amount.
 */
export function runTestCases(expression, cases = [], evaluate) {
  return cases.map(testCase => {
    try {
      const actual = evaluate(expression, testCase.inputs);
      return { ...testCase, actual, passed: Math.abs(Number(testCase.expected) - actual) < 0.005 };
    } catch (error) {
      return { ...testCase, actual: null, passed: false, error: error.message };
    }
  });
}

/** Locks every case with the version it was approved in; a locked case cannot be edited or removed. */
export const lockTestCases = (cases = [], version) => cases.map(testCase => (testCase.lockedIn ? testCase : { ...testCase, lockedIn: version }));

/* ---------------------------------------------------------------- compare */

const describe = value => (value && typeof value === 'object' ? Object.entries(value).map(([key, item]) => `${key}: ${typeof item === 'object' ? JSON.stringify(item) : item}`).join('; ') : String(value ?? ''));

/** Field-by-field compare of two versions, for a side-by-side view. */
export function compareVersions(left = {}, right = {}) {
  return [
    ['Version', 'version'], ['Effective date', 'effectiveDate'], ['Status', 'status'], ['Name', 'name'], ['Category', 'category'],
    ['Expression', 'expression'], ['Parameters', 'parameters'], ['Description', 'description'], ['Change note', 'note'],
    ['Change source', 'source'], ['Approval reference', 'approvalRef'], ['Published by', 'publishedBy'],
  ].map(([label, key]) => {
    const a = describe(left[key]);
    const b = describe(right[key]);
    return { field: label, left: a, right: b, changed: a !== b };
  }).concat([{ field: 'Test cases', left: String((left.testCases || []).length), right: String((right.testCases || []).length), changed: (left.testCases || []).length !== (right.testCases || []).length }]);
}

/** A published version whose effective date is still ahead is Scheduled, not yet in force. */
export const versionState = (version, asOf = today()) => (version?.effectiveDate && version.effectiveDate > asOf ? 'Scheduled' : 'In force');

/* ------------------------------------------------ assignment precedence */

const overlaps = (left, right) => (left.startDate || '0000-01-01') <= (right.endDate || '9999-12-31') && (right.startDate || '0000-01-01') <= (left.endDate || '9999-12-31');
const sameGroup = (left, right) => {
  const a = left.subgroup || 'All employees';
  const b = right.subgroup || 'All employees';
  return a === b;
};

/**
 * Two active assignments in one company conflict when they are formulas of the
 * same category, for the same subgroup, over overlapping dates, with the same
 * priority — payroll could not tell which one applies. A subgroup assignment
 * takes precedence over an all-employee one; otherwise the lower priority
 * number wins.
 */
export function assignmentConflicts(code, companyId, { library = [], applicability = {} } = {}) {
  const wanted = normalize(code);
  const record = library.find(item => normalize(item.code) === wanted);
  const mine = applicability[wanted]?.[companyId];
  if (!record || !mine?.applied || mine.status === 'Inactive' || !mine.priority) return [];
  return library
    .filter(item => normalize(item.code) !== wanted && item.category === record.category)
    .map(item => ({ item, entry: applicability[normalize(item.code)]?.[companyId] }))
    .filter(({ entry }) => entry?.applied && entry.status !== 'Inactive' && String(entry.priority || '') === String(mine.priority) && sameGroup(entry, mine) && overlaps(entry, mine))
    .map(({ item, entry }) => ({ code: item.code, name: item.name, subgroup: entry.subgroup || 'All employees', priority: entry.priority }));
}

/** The order payroll applies competing assignments in: subgroup first, then priority. */
export function assignmentPrecedence(entries = []) {
  return [...entries].sort((left, right) => {
    const specific = entry => (entry.subgroup && entry.subgroup !== 'All employees' ? 0 : 1);
    return specific(left) - specific(right) || (Number(left.priority) || 999) - (Number(right.priority) || 999);
  });
}
