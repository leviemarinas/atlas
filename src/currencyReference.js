/**
 * The Currency reference table (Core › Reference Tables › Generic › Currency).
 *
 * Agreed with P&A (Gen Olan, Aug 2026): the Currency Code is the key, not the
 * country — a country can use several currencies and one currency is used by
 * several countries. The table holds no exchange rates; the rate is typed on
 * each payroll transaction.
 *
 *   Currency Code    unique key, required (ISO 4217, e.g. PHP, USD, TWD, VND)
 *   Currency Name    required
 *   Currency Symbol  required
 *   Status           optional, Active by default
 *   Decimal Places   optional, 2 by default (VND and JPY use 0)
 *
 * It lives outside ReferenceTables.jsx so payroll — including the engine the
 * tests run under Node — can read it without loading the screen.
 */

export const CURRENCY_TABLE_ID = 'currency';
const TABLES_KEY = 'atlas-reference-tables-v4';

export const CURRENCY_COLUMNS = Object.freeze([
  ['code', 'Currency Code'],
  ['name', 'Currency Name'],
  ['symbol', 'Currency Symbol'],
  ['status', 'Status'],
  ['decimalPlaces', 'Decimal Places'],
]);

export const CURRENCY_FIELDS = Object.freeze({
  code: { uppercase: true, pattern: '^[A-Z]{3}$', patternMessage: 'Currency Code is the 3-letter ISO code, e.g. PHP, USD, TWD, VND.', placeholder: 'e.g. USD' },
  symbol: { placeholder: 'e.g. $' },
  decimalPlaces: { optional: true, type: 'number', min: 0, max: 4, placeholder: '2', hint: 'Leave blank for 2. Use 0 for currencies without cents, e.g. VND, JPY.' },
});

export const SEED_CURRENCIES = Object.freeze([
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimalPlaces: '2' },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: '2' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimalPlaces: '2' },
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', decimalPlaces: '2' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimalPlaces: '0' },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: '2' },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: '2' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalPlaces: '0' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimalPlaces: '2' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimalPlaces: '2' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', decimalPlaces: '2' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', decimalPlaces: '2' },
].map((row, index) => ({ id: `currency-${index + 1}`, status: 'Active', ...row })));

/** Blank Decimal Places means 2. */
export const decimalsOf = row => {
  const value = Number(row?.decimalPlaces);
  return String(row?.decimalPlaces ?? '').trim() === '' || !Number.isInteger(value) || value < 0 ? 2 : value;
};

/**
 * Rows saved before the table had Symbol and Decimal Places are filled in
 * from the seed by currency code, keeping what was saved.
 */
export function migrateCurrencyRows(rows = []) {
  const seed = new Map(SEED_CURRENCIES.map(row => [row.code, row]));
  return rows.map(row => {
    const known = seed.get(String(row.code || '').toUpperCase());
    return {
      ...row,
      symbol: row.symbol || known?.symbol || row.code,
      decimalPlaces: row.decimalPlaces ?? known?.decimalPlaces ?? '2',
    };
  });
}

/** Every row of the Currency table, as saved in the Reference Tables module. */
export function readCurrencyRows(storage = globalThis.localStorage) {
  try {
    const tables = JSON.parse(storage?.getItem(TABLES_KEY) || '[]');
    const saved = Array.isArray(tables) ? tables.find(table => table.id === CURRENCY_TABLE_ID) : null;
    if (saved?.rows?.length) return migrateCurrencyRows(saved.rows);
  } catch { /* fall back to the seed */ }
  return SEED_CURRENCIES.map(row => ({ ...row }));
}

/** The Active currencies, PHP first, as { code, name, symbol, decimals }. */
export function activeCurrencies(storage = globalThis.localStorage) {
  const rows = readCurrencyRows(storage)
    .filter(row => (row.status || 'Active') === 'Active' && row.code)
    .map(row => ({ code: String(row.code).toUpperCase(), name: row.name || row.code, symbol: row.symbol || row.code, decimals: decimalsOf(row) }));
  const php = rows.find(row => row.code === 'PHP') || { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimals: 2 };
  return [php, ...rows.filter(row => row.code !== 'PHP')];
}
