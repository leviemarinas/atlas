/**
 * Read access to the effective statutory tables for payroll calculations.
 *
 * Master requirements §7.2: payroll selects the applicable statutory table
 * version by effective date, and §7.4: rates, ceilings and thresholds are
 * versioned data — never constants inside calculation code. Every engine that
 * needs a bracket or a ceiling must come through here rather than embedding
 * its own copy of the numbers.
 */

export const STATUTORY_STORAGE_KEY = 'atlas-statutory-tables-v3';

const number = value => Number(value || 0);

export function readStatutoryData() {
  try { return JSON.parse(localStorage.getItem(STATUTORY_STORAGE_KEY)) || {}; } catch { return {}; }
}

/**
 * The version in force on `asOf`: the latest Active version whose effective
 * date is on or before that date, falling back to the earliest Active version
 * when the run predates every published table.
 */
export function effectiveVersion(agency, asOf = new Date().toISOString().slice(0, 10), data = readStatutoryData()) {
  const versions = (data[agency] || []).filter(item => item.status === 'Active');
  if (!versions.length) return null;
  const sorted = [...versions].sort((a, b) => String(b.effectiveDate).localeCompare(String(a.effectiveDate)));
  return sorted.find(item => String(item.effectiveDate) <= String(asOf)) || sorted[sorted.length - 1];
}

/**
 * Payroll runs that consumed a statutory version.
 *
 * §7.1 [REVISION]: a table may be edited or deleted only while no payroll
 * transaction has used it, and an OPEN/DRAFT run already counts as used. A run
 * uses the version that was effective on its payout date, so a cancelled run
 * releases the lock and deleting the pending transaction makes the table
 * editable again.
 */
export function readPayrollTransactions() {
  try { return JSON.parse(localStorage.getItem('atlas-operational-transactions-v1')) || []; } catch { return []; }
}

export function versionUsage(agency, version, data = readStatutoryData()) {
  if (!version?.effectiveDate) return { used: false, transactions: [] };
  const consuming = readPayrollTransactions().filter(row => {
    if (!row.payoutDate || row.status === 'Cancelled') return false;
    return effectiveVersion(agency, row.payoutDate, data)?.id === version.id;
  });
  return { used: consuming.length > 0, transactions: consuming.map(row => `${row.code} (${row.status})`) };
}

/** Graduated withholding brackets for a payroll frequency, low to high. */
export function taxBrackets(frequency = 'Monthly', asOf) {
  const version = effectiveVersion('tax', asOf);
  const rows = (version?.rows || []).filter(row => !row.frequency || row.frequency === frequency);
  return rows
    .map(row => ({ minimum: number(row.minimum), maximum: number(row.maximum), fixedTax: number(row.fixedTax), excessRate: number(row.excessRate) }))
    .sort((a, b) => a.minimum - b.minimum);
}

/**
 * Graduated withholding tax on a taxable amount.
 *
 * Follows the bracket rule described in §8.3: fixed amount for the bracket plus
 * the configured percentage on the excess over the bracket minimum. Amounts
 * above the highest published bracket continue at that bracket's excess rate.
 */
export function withholdingTax(taxable, frequency = 'Monthly', asOf) {
  const amount = number(taxable);
  const brackets = taxBrackets(frequency, asOf);
  if (amount <= 0 || !brackets.length) return { tax: 0, bracket: null, brackets };
  const bracket = [...brackets].reverse().find(row => amount >= row.minimum) || brackets[0];
  const tax = Math.max(0, bracket.fixedTax + (amount - bracket.minimum) * bracket.excessRate / 100);
  return { tax, bracket, brackets };
}

/** De Minimis ceilings keyed by benefit name, from the effective version. */
export function deMinimisCeilings(asOf) {
  const version = effectiveVersion('deMinimis', asOf);
  return (version?.rows || []).map(row => ({
    code: row.benefitCode, name: row.benefitName, ceiling: number(row.ceiling),
    frequency: row.frequency || 'Annual', excessTreatment: row.excessTreatment || 'Reclassify as Taxable',
  }));
}

/**
 * Splits a De Minimis benefit against its configured ceiling and the amount of
 * that ceiling already used year to date (§10.2). The excess is reclassified as
 * taxable unless the benefit is configured otherwise.
 */
export function deMinimisSplit(benefitName, amount, usedToDate = 0, asOf) {
  const rule = deMinimisCeilings(asOf).find(row => row.name === benefitName || row.code === benefitName);
  const value = number(amount);
  if (!rule) return { nonTaxable: value, taxable: 0, ceiling: null, remaining: null, rule: null };
  const remaining = Math.max(0, rule.ceiling - number(usedToDate));
  const nonTaxable = Math.min(value, remaining);
  return { nonTaxable, taxable: Math.max(0, value - nonTaxable), ceiling: rule.ceiling, remaining, rule };
}
