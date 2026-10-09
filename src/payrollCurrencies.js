/**
 * Multi-currency pay inside one payroll transaction.
 *
 * The transaction lists the currencies it pays in (PHP plus up to two more),
 * each with the rate to PHP typed on the transaction. The currencies offered
 * come from the Currency reference table (code, name, symbol, status, decimal
 * places — see currencyReference.js); it holds no exchange rates. An
 * employee's line can then carry pay in any of those currencies: the hours it covers and the amount in that currency. The amount
 * is converted at the transaction's rate and added to gross pay, so statutory
 * contributions and tax are still computed in PHP, and the net pay is paid
 * out per currency: each foreign amount as encoded, and the PHP remainder.
 */

import { activeCurrencies } from './currencyReference.js';

const round2 = value => Math.round((Number(value) || 0) * 100) / 100;
const roundTo = (value, decimals = 2) => { const factor = 10 ** decimals; return Math.round((Number(value) || 0) * factor) / factor; };

export const BASE_CURRENCY = 'PHP';
export const MAX_RUN_CURRENCIES = 3;

/** The Active rows of the Currency reference table, PHP first. */
export const availableCurrencies = () => activeCurrencies();

const currencyRow = code => availableCurrencies().find(item => item.code === code);
export const currencySymbol = code => currencyRow(code)?.symbol || code;
export const currencyDecimals = code => currencyRow(code)?.decimals ?? 2;

/** "$600.00", "₱33,720.00" — the symbol the transaction lists, then the amount. */
export function formatCurrency(amount, code = BASE_CURRENCY, symbol = currencySymbol(code), decimals = currencyDecimals(code)) {
  const value = Number(amount) || 0;
  const text = Math.abs(value).toLocaleString('en-PH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const spaced = /^[A-Z]{2,}$/.test(symbol) ? `${symbol} ` : symbol;
  return `${value < 0 ? '-' : ''}${spaced}${text}`;
}

/**
 * The currencies a transaction pays in, PHP first at 1.00. A transaction
 * saved before this existed pays in PHP only.
 */
export function runCurrenciesOf(transaction = {}) {
  const listed = Array.isArray(transaction.currencies) ? transaction.currencies : [];
  const others = listed
    .filter(item => item?.code && item.code !== BASE_CURRENCY)
    .map(item => ({ code: item.code, symbol: item.symbol || currencySymbol(item.code), decimals: item.decimals ?? currencyDecimals(item.code), rate: Number(item.rate) }));
  return [{ code: BASE_CURRENCY, symbol: currencySymbol(BASE_CURRENCY), decimals: 2, rate: 1 }, ...others];
}

/** Why the transaction's currency list cannot be used, or ''. */
export function runCurrencyProblem(currencies = []) {
  const codes = currencies.map(item => item.code);
  if (codes.length > MAX_RUN_CURRENCIES) return `A transaction can pay in at most ${MAX_RUN_CURRENCIES} currencies.`;
  const duplicate = codes.find((code, index) => codes.indexOf(code) !== index);
  if (duplicate) return `${duplicate} is listed twice.`;
  const missingRate = currencies.find(item => item.code !== BASE_CURRENCY && !(Number(item.rate) > 0));
  if (missingRate) return `Enter the ${missingRate.code}-to-PHP rate used in this transaction.`;
  return '';
}

/**
 * An employee's foreign-currency pay, priced in PHP at the transaction rate.
 * A line naming a currency the transaction no longer lists is refused rather
 * than priced at a guessed rate.
 */
export function foreignPayFor(encoded = [], currencies = []) {
  const byCode = new Map(currencies.map(item => [item.code, item]));
  const lines = [];
  const problems = [];
  encoded.forEach(row => {
    if (!row?.currency || row.currency === BASE_CURRENCY || !(Number(row.amount) > 0)) return;
    const currency = byCode.get(row.currency);
    if (!currency || !(currency.rate > 0)) {
      problems.push(`${row.currency} pay of ${formatCurrency(row.amount, row.currency)} has no rate — add ${row.currency} to the transaction's currencies.`);
      return;
    }
    const decimals = currency.decimals ?? 2;
    const amount = roundTo(row.amount, decimals);
    lines.push({
      currency: currency.code,
      symbol: currency.symbol,
      decimals,
      rate: currency.rate,
      hours: Number(row.hours) || 0,
      amount,
      phpAmount: round2(amount * currency.rate),
      classification: row.classification || 'Taxable Allowance',
      description: row.description || '',
    });
  });
  return { lines, problems };
}

/** The foreign pay as earning items, in PHP, for the gross-pay step. */
export function foreignEarningItems(lines = []) {
  return lines.map(line => ({
    code: `FX-${line.currency}`,
    name: `${line.description || 'Pay'} in ${line.currency}${line.hours ? ` · ${line.hours} hrs` : ''} (${formatCurrency(line.amount, line.currency, line.symbol, line.decimals)} at ${line.rate})`,
    classification: line.classification,
    frequency: 'One-time',
    amount: line.phpAmount,
    foreign: { currency: line.currency, symbol: line.symbol, rate: line.rate, hours: line.hours, amount: line.amount },
    source: 'Encoded on the transaction (foreign currency)',
  }));
}

/**
 * Net pay per currency: each foreign amount as encoded, and PHP for the rest.
 * Deductions come out of the PHP part first; when they are larger than it, the
 * shortfall is taken from the foreign pay in the order it was encoded, at the
 * same rate, so an employee paid mostly abroad is not left with a negative
 * peso payout.
 */
export function payoutsByCurrency(netPay, lines = [], phpHours = 0) {
  const foreignPhp = round2(lines.reduce((total, line) => total + line.phpAmount, 0));
  let shortfall = Math.max(0, round2(foreignPhp - Math.max(0, netPay)));
  const foreign = lines.map(line => {
    const taken = Math.min(shortfall, line.phpAmount);
    shortfall = round2(shortfall - taken);
    const phpAmount = round2(line.phpAmount - taken);
    return {
      currency: line.currency, symbol: line.symbol, decimals: line.decimals ?? 2, rate: line.rate, hours: line.hours,
      amount: taken ? roundTo(phpAmount / line.rate, line.decimals ?? 2) : line.amount,
      phpAmount,
      reducedBy: taken ? { phpAmount: round2(taken), amount: roundTo(taken / line.rate, line.decimals ?? 2) } : null,
    };
  });
  const php = round2(netPay - foreign.reduce((total, line) => total + line.phpAmount, 0));
  return [
    { currency: BASE_CURRENCY, symbol: currencySymbol(BASE_CURRENCY), decimals: 2, rate: 1, hours: round2(phpHours), amount: php, phpAmount: php, reducedBy: null },
    ...foreign,
  ];
}

/** Per-currency totals across a run's computed lines. */
export function currencyTotalsFor(lines = [], currencies = []) {
  const totals = new Map(currencies.map(item => [item.code, { ...item, employees: 0, hours: 0, amount: 0, phpAmount: 0 }]));
  lines.filter(line => line.status === 'Computed').forEach(line => {
    const payouts = line.currencyPayouts || [{ currency: BASE_CURRENCY, symbol: currencySymbol(BASE_CURRENCY), rate: 1, hours: 0, amount: line.netPay, phpAmount: line.netPay }];
    payouts.forEach(payout => {
      const row = totals.get(payout.currency) || { code: payout.currency, symbol: payout.symbol, rate: payout.rate, employees: 0, hours: 0, amount: 0, phpAmount: 0 };
      totals.set(payout.currency, {
        ...row,
        employees: row.employees + (payout.currency === BASE_CURRENCY || payout.amount ? 1 : 0),
        hours: round2(row.hours + payout.hours),
        amount: roundTo(row.amount + payout.amount, row.decimals ?? 2),
        phpAmount: round2(row.phpAmount + payout.phpAmount),
      });
    });
  });
  return [...totals.values()];
}
