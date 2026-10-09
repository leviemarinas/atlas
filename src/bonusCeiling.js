/**
 * Bonus Management derives each bonus's non-taxable and taxable amounts from
 * the employee's remaining annual ceiling (P&A: "use the 90,000 first, only
 * the excess is taxable" — no Taxability to choose). Bonuses consume the
 * ceiling in effectivity-date order within the calendar year.
 */
export function splitBonusCeiling(rows = [], ceiling = 90000) {
  const used = new Map();
  const ordered = [...rows].sort((left, right) => String(left.effectiveDate).localeCompare(String(right.effectiveDate)) || String(left.code).localeCompare(String(right.code)));
  const split = new Map();
  ordered.forEach(row => {
    const amount = Number(row.amount) || 0;
    if (row.status === 'Inactive' || amount <= 0) { split.set(row, { nonTaxableAmount: '0', taxableAmount: '0' }); return; }
    const key = `${row.employee}|${String(row.effectiveDate).slice(0, 4)}`;
    const remaining = Math.max(0, ceiling - (used.get(key) || 0));
    const nonTaxable = Math.min(amount, remaining);
    used.set(key, (used.get(key) || 0) + nonTaxable);
    split.set(row, { nonTaxableAmount: String(Math.round(nonTaxable * 100) / 100), taxableAmount: String(Math.round((amount - nonTaxable) * 100) / 100) });
  });
  return rows.map(row => ({ ...row, ...split.get(row) }));
}
