/**
 * Read access to the effective statutory tables for payroll calculations.
 *
 * Master requirements §7.2: payroll selects the applicable statutory table
 * version by effective date, and §7.4: rates, ceilings and thresholds are
 * versioned data — never constants inside calculation code. The numbers and the
 * bracket arithmetic live in `statutorySchedules.js`; this module is the browser
 * adapter that resolves them out of the company store and answers the "is this
 * version locked?" question the register asks.
 */

import {
  bracketsForFrequency,
  deMinimisRules,
  effectiveVersionIn,
  graduatedTax,
  rateContribution,
  seedStatutoryData,
  splitDeMinimis,
  sssContribution,
} from './statutorySchedules.js';

// v4: the seeded tables are the real SSS / PhilHealth / Pag-IBIG / BIR
// schedules rather than three sample brackets, so a v3 payload cannot satisfy
// a payroll computation and must not be carried forward.
export const STATUTORY_STORAGE_KEY = 'atlas-statutory-tables-v4';

export function readStatutoryData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATUTORY_STORAGE_KEY));
    return saved && Object.keys(saved).length ? saved : seedStatutoryData();
  } catch { return seedStatutoryData(); }
}

/**
 * The version in force on `asOf`: the latest Active version whose effective
 * date is on or before that date, falling back to the earliest Active version
 * when the run predates every published table.
 */
export function effectiveVersion(agency, asOf = new Date().toISOString().slice(0, 10), data = readStatutoryData()) {
  return effectiveVersionIn(data, agency, asOf);
}

/** Every agency's effective version for one date, as the engine consumes them. */
export function effectiveStatutorySet(asOf, data = readStatutoryData()) {
  return Object.fromEntries(Object.keys(data).map(agency => [agency, effectiveVersionIn(data, agency, asOf)]));
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
  // Two registers can consume a statutory version: the generic operational
  // transactions register (versioned `atlas-operational-transactions-v${n}`,
  // bumped whenever its field set changes) and Payroll Processing's own run
  // store. Reading only one of them silently reports "not yet used" for runs
  // recorded by the other and breaks the §7.1 lock this file exists to enforce.
  const rows = [];
  const push = (key, map) => {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(saved)) saved.forEach(row => rows.push(map(row)));
    } catch { /* an unreadable store contributes no rows */ }
  };
  push('atlas-operational-transactions-v2', row => row);
  if (!rows.length) push('atlas-operational-transactions-v1', row => row);
  // Payroll Processing keys its runs per company, so every company's store counts.
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith('atlas-payroll-runs-v1')) continue;
      const saved = JSON.parse(localStorage.getItem(key));
      (Array.isArray(saved) ? saved : []).forEach(run => rows.push({ code: run.transactionNumber, status: run.status, payoutDate: run.payoutDate }));
    }
  } catch { /* an unreadable store contributes no rows */ }
  return rows;
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
  return bracketsForFrequency(effectiveVersion('tax', asOf), frequency);
}

/**
 * Graduated withholding tax on a taxable amount, from the table in force.
 * Follows the bracket rule in §8.3: the bracket's fixed amount plus the
 * configured percentage on the excess over the bracket minimum.
 */
export function withholdingTax(taxable, frequency = 'Monthly', asOf) {
  return graduatedTax(effectiveVersion('tax', asOf), taxable, frequency);
}

/** Annualised withholding tax, used by final pay and the year-end run. */
export function annualTax(taxable, asOf) {
  return graduatedTax(effectiveVersion('annualTax', asOf), taxable, 'Annual');
}

/** SSS employee/employer shares, split into regular fund and WISP. */
export function sssShares(monthlyCompensation, asOf) {
  return sssContribution(effectiveVersion('sss', asOf), monthlyCompensation);
}

export function philHealthShares(monthlyCompensation, asOf) {
  return rateContribution(effectiveVersion('philhealth', asOf), monthlyCompensation);
}

export function pagIbigShares(monthlyCompensation, asOf) {
  return rateContribution(effectiveVersion('pagibig', asOf), monthlyCompensation);
}

/** De Minimis ceilings keyed by benefit name, from the effective version. */
export function deMinimisCeilings(asOf) {
  return deMinimisRules(effectiveVersion('deMinimis', asOf));
}

/**
 * Splits a De Minimis benefit against its configured ceiling and the amount of
 * that ceiling already used year to date (§10.2). The excess is reclassified as
 * taxable unless the benefit is configured otherwise.
 */
export function deMinimisSplit(benefitName, amount, usedToDate = 0, asOf) {
  return splitDeMinimis(effectiveVersion('deMinimis', asOf), benefitName, amount, usedToDate);
}
