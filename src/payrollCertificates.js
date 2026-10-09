/**
 * Payroll certificates and the statutory contribution summary, built from an
 * employee's posted payroll lines (Certification Request Module, HTP171-177;
 * Employee Self Inquiry, HTP166-167).
 *
 * Only Posted and Locked runs count: a transaction still open or in review is
 * not yet the employee's pay. Pure — it receives the runs and the employee, so
 * the self-inquiry screen, an administrator and a test all get the same figures.
 */

import { graduatedTax } from './statutorySchedules.js';

const round2 = value => Math.round((Number(value) || 0) * 100) / 100;
const sum = (rows, pick) => round2(rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0));
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const CERTIFICATE_TYPES = Object.freeze([
  { key: 'bir-2316', label: 'BIR Form 2316 — Certificate of Compensation Payment / Tax Withheld', feature: 'HTP171' },
  { key: 'bir-2307', label: 'BIR Form 2307 — Certificate of Creditable Tax Withheld at Source', feature: 'HTP172' },
  { key: 'sss-contribution', label: 'SSS Contribution Certificate', feature: 'HTP173' },
  { key: 'sss-loan', label: 'SSS Loan Certificate', feature: 'HTP174' },
  { key: 'phic-contribution', label: 'PhilHealth Contribution Certificate', feature: 'HTP175' },
  { key: 'hdmf-contribution', label: 'Pag-IBIG (HDMF) Contribution Certificate', feature: 'HTP176' },
  { key: 'hdmf-loan', label: 'Pag-IBIG (HDMF) Loan Certificate', feature: 'HTP177' },
]);

const isPosted = run => ['Posted', 'Locked'].includes(run.status) && run.result;

/** The employee's computed lines on posted runs paid out in the year, with their run. */
export function postedLinesFor(runs = [], employeeId, year) {
  return runs
    .filter(isPosted)
    .filter(run => !year || String(run.payoutDate || '').startsWith(String(year)))
    .flatMap(run => run.result.lines
      .filter(line => line.status === 'Computed' && line.employeeId === employeeId)
      .map(line => ({ run, line })))
    .sort((left, right) => String(left.run.payoutDate).localeCompare(String(right.run.payoutDate)));
}

/** Years that have at least one posted run, newest first. */
export function certificateYears(runs = []) {
  return [...new Set(runs.filter(isPosted).map(run => String(run.payoutDate || '').slice(0, 4)).filter(Boolean))].sort().reverse();
}

const monthKey = run => String(run.payoutDate || '').slice(0, 7);
const monthLabel = key => { const [year, month] = key.split('-').map(Number); return `${MONTH_NAMES[(month || 1) - 1]} ${year}`; };

/** Rows grouped by payout month, each carrying the lines paid that month. */
function byMonth(entries) {
  const months = new Map();
  entries.forEach(entry => {
    const key = monthKey(entry.run);
    months.set(key, [...(months.get(key) || []), entry]);
  });
  return [...months.entries()].map(([key, items]) => ({ key, month: monthLabel(key), items, runs: [...new Set(items.map(item => item.run.transactionNumber))].join(', ') }));
}

/**
 * The statutory contribution summary: per month, the employee and employer
 * shares for SSS (with EC), PhilHealth and Pag-IBIG, and the tax withheld.
 */
export function contributionSummary(runs, employeeId, year) {
  const rows = byMonth(postedLinesFor(runs, employeeId, year)).map(({ key, month, items, runs: transactions }) => ({
    key, month, transactions,
    sssEe: sum(items, ({ line }) => line.statutory.sssEmployee),
    sssEr: sum(items, ({ line }) => line.statutory.sssEmployer),
    ec: sum(items, ({ line }) => line.statutory.ec),
    phicEe: sum(items, ({ line }) => line.statutory.philhealthEmployee),
    phicEr: sum(items, ({ line }) => line.statutory.philhealthEmployer),
    hdmfEe: sum(items, ({ line }) => line.statutory.hdmfEmployee),
    hdmfEr: sum(items, ({ line }) => line.statutory.hdmfEmployer),
    tax: sum(items, ({ line }) => line.withholdingTax),
  }));
  const totals = Object.fromEntries(['sssEe', 'sssEr', 'ec', 'phicEe', 'phicEr', 'hdmfEe', 'hdmfEr', 'tax'].map(field => [field, sum(rows, row => row[field])]));
  return { rows, totals };
}

const loanPayments = (entries, pattern) => byMonth(entries)
  .map(({ key, month, items, runs: transactions }) => {
    const loans = items.flatMap(({ line }) => (line.loans || []).filter(loan => pattern.test(loan.name || '')));
    return { key, month, transactions, loans: [...new Set(loans.map(loan => loan.name))].join(', '), paid: sum(loans, loan => loan.deducted), balance: loans.length ? round2(loans[loans.length - 1].remaining) : 0 };
  })
  .filter(row => row.paid > 0);

/**
 * One certificate for one employee and year. Returns what the document shows:
 * its title, the identifying fields, a table and its totals, and a note when
 * there is nothing to certify.
 */
export function buildCertificate({ type, employee = {}, runs = [], year, company = {}, statutory = {} }) {
  const definition = CERTIFICATE_TYPES.find(item => item.key === type) || CERTIFICATE_TYPES[0];
  const entries = postedLinesFor(runs, employee.employeeId, year);
  const header = {
    employer: company.displayName || company.name || '', employerTin: company.tin || '',
    employee: employee.name || '', employeeCode: employee.employeeCode || employee.code || '',
    tin: employee.government?.tin || '', sss: employee.government?.sss || '', philhealth: employee.government?.philhealth || '',
    hdmf: employee.government?.hdmf || '', year: String(year || ''),
  };
  const base = { key: definition.key, title: definition.label, feature: definition.feature, header, transactions: [...new Set(entries.map(entry => entry.run.transactionNumber))] };
  if (!entries.length) return { ...base, columns: [], rows: [], totals: null, note: `No posted payroll for ${employee.name || 'this employee'} in ${year}.` };

  if (definition.key === 'bir-2316') {
    const lines = entries.map(entry => entry.line);
    const openingTaxable = Number(employee.ytd?.taxableEarnings) || 0;
    const openingTax = Number(employee.ytd?.taxWithheld) || 0;
    const nonTaxable = sum(lines, line => line.nonTaxableEarnings + line.nonTaxableBonus);
    const contributions = sum(lines, line => line.statutory.employeeTotal);
    const taxable = round2(openingTaxable + sum(lines, line => line.taxableIncome));
    const taxDue = statutory.annualTax ? graduatedTax(statutory.annualTax, taxable, 'Annual').tax : 0;
    const withheld = round2(openingTax + sum(lines, line => line.withholdingTax));
    const mwe = lines.some(line => line.mwe);
    const mweRows = mwe ? [
      ['Minimum wage earner (MWE)', 'Yes'],
      ['Statutory minimum wage rate per day', lines[lines.length - 1].rates.dailyRate],
      ['Statutory minimum wage rate per month', lines[lines.length - 1].rates.monthlyRate],
      ['MWE compensation — SMW, holiday, overtime, night differential (exempt)', sum(lines, line => line.mweIncome)],
    ] : [];
    const rows = [
      ...mweRows,
      ['Gross compensation from the posted runs', sum(lines, line => line.grossPay)],
      ['Non-taxable 13th month, other benefits and De Minimis', nonTaxable],
      ['SSS, PhilHealth and Pag-IBIG employee contributions', contributions],
      ['Taxable compensation before Atlas payroll (year-to-date on record)', openingTaxable],
      ['Taxable compensation — present employer', taxable],
      ['Tax due (annual table)', round2(taxDue)],
      ['Tax withheld — present employer', withheld],
      [taxDue >= withheld ? 'Tax still due' : 'Over-withheld (refund due)', round2(Math.abs(taxDue - withheld))],
    ].map(([item, amount], index) => ({ key: `r${index}`, item, amount }));
    return { ...base, columns: [{ key: 'item', label: 'Item' }, { key: 'amount', label: 'Amount', money: true }], rows, totals: null, note: '' };
  }

  if (definition.key === 'bir-2307') {
    const expanded = entries.filter(({ line }) => String(line.taxBasis || '').startsWith('Expanded'));
    if (!expanded.length) return { ...base, columns: [], rows: [], totals: null, note: `${employee.name} is paid compensation, not income subject to expanded withholding, so BIR 2307 does not apply — use BIR 2316.` };
    const rows = byMonth(expanded).map(({ key, month, items }) => ({
      key, month, atc: items[0].line.taxAtc || '', income: sum(items, ({ line }) => line.taxableIncome), tax: sum(items, ({ line }) => line.withholdingTax),
    }));
    return { ...base, columns: [{ key: 'month', label: 'Month' }, { key: 'atc', label: 'ATC' }, { key: 'income', label: 'Income Payment', money: true }, { key: 'tax', label: 'Tax Withheld', money: true }], rows, totals: { income: sum(rows, row => row.income), tax: sum(rows, row => row.tax) }, note: '' };
  }

  if (['sss-loan', 'hdmf-loan'].includes(definition.key)) {
    const rows = loanPayments(entries, definition.key === 'sss-loan' ? /SSS/i : /Pag-?IBIG|HDMF/i);
    if (!rows.length) return { ...base, columns: [], rows: [], totals: null, note: `No ${definition.key === 'sss-loan' ? 'SSS' : 'Pag-IBIG'} loan payment was collected through payroll in ${year}.` };
    return { ...base, columns: [{ key: 'month', label: 'Month' }, { key: 'loans', label: 'Loan' }, { key: 'paid', label: 'Amount Paid', money: true }, { key: 'balance', label: 'Balance After', money: true }], rows, totals: { paid: sum(rows, row => row.paid) }, note: '' };
  }

  const { rows: months } = contributionSummary(runs, employee.employeeId, year);
  const shape = {
    'sss-contribution': [['sssEe', 'Employee Share'], ['sssEr', 'Employer Share'], ['ec', 'EC']],
    'phic-contribution': [['phicEe', 'Employee Share'], ['phicEr', 'Employer Share']],
    'hdmf-contribution': [['hdmfEe', 'Employee Share'], ['hdmfEr', 'Employer Share']],
  }[definition.key];
  const rows = months.map(month => ({ key: month.key, month: month.month, ...Object.fromEntries(shape.map(([field]) => [field, month[field]])), total: round2(shape.reduce((total, [field]) => total + month[field], 0)) }))
    .filter(row => row.total > 0);
  if (!rows.length) return { ...base, columns: [], rows: [], totals: null, note: `No contribution was collected for ${employee.name} in ${year}.` };
  const columns = [{ key: 'month', label: 'Month' }, ...shape.map(([key, label]) => ({ key, label, money: true })), { key: 'total', label: 'Total', money: true }];
  const totals = Object.fromEntries([...shape.map(([field]) => field), 'total'].map(field => [field, sum(rows, row => row[field])]));
  return { ...base, columns, rows, totals, note: '' };
}
