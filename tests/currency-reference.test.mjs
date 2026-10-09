/**
 * The Currency reference table as agreed with P&A: Currency Code is the key
 * (not the country), Name and Symbol are required, Status and Decimal Places
 * are optional, and no exchange rate is stored. Payroll offers only its
 * Active rows and rounds each currency to its own decimal places.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CURRENCY_COLUMNS, CURRENCY_FIELDS, SEED_CURRENCIES, activeCurrencies, decimalsOf, migrateCurrencyRows, readCurrencyRows } from '../src/currencyReference.js';
import { foreignPayFor, formatCurrency } from '../src/payrollCurrencies.js';

const storageWith = rows => {
  const store = new Map([['atlas-reference-tables-v4', JSON.stringify([{ id: 'currency', rows }])]]);
  return { getItem: key => store.get(key) ?? null };
};

test('the table has exactly the agreed fields, keyed on the currency code, with no rate or country', () => {
  assert.deepEqual(CURRENCY_COLUMNS.map(([key]) => key), ['code', 'name', 'symbol', 'status', 'decimalPlaces']);
  assert.equal(CURRENCY_COLUMNS[0][1], 'Currency Code');
  assert.ok(CURRENCY_FIELDS.decimalPlaces.optional);
  assert.ok(!CURRENCY_COLUMNS.some(([key]) => /rate|country/i.test(key)));
  const codes = SEED_CURRENCIES.map(row => row.code);
  ['PHP', 'USD', 'TWD', 'VND'].forEach(code => assert.ok(codes.includes(code), code));
  assert.equal(new Set(codes).size, codes.length, 'codes are unique');
  assert.ok(new RegExp(CURRENCY_FIELDS.code.pattern).test('USD'));
  assert.ok(!new RegExp(CURRENCY_FIELDS.code.pattern).test('US'));
});

test('blank decimal places means 2; VND and JPY have none', () => {
  assert.equal(decimalsOf({ decimalPlaces: '' }), 2);
  assert.equal(decimalsOf({}), 2);
  assert.equal(decimalsOf(SEED_CURRENCIES.find(row => row.code === 'VND')), 0);
  assert.equal(formatCurrency(1250000.4, 'VND', '₫', 0), '₫1,250,000');
});

test('payroll offers only Active currencies, PHP first, from what the table saved', () => {
  const storage = storageWith([
    { code: 'USD', name: 'US Dollar', symbol: '$', status: 'Active' },
    { code: 'PHP', name: 'Philippine Peso', symbol: '₱', status: 'Active' },
    { code: 'EUR', name: 'Euro', symbol: '€', status: 'Inactive' },
  ]);
  assert.deepEqual(activeCurrencies(storage).map(row => row.code), ['PHP', 'USD']);
  assert.deepEqual(activeCurrencies({ getItem: () => null }).map(row => row.code), SEED_CURRENCIES.map(row => row.code));
});

test('rows saved before Symbol and Decimal Places existed are filled in from the seed', () => {
  const [usd, custom] = migrateCurrencyRows([{ code: 'USD', name: 'US Dollar', status: 'Active' }, { code: 'XYZ', name: 'Test', status: 'Active' }]);
  assert.equal(usd.symbol, '$');
  assert.equal(usd.decimalPlaces, '2');
  assert.equal(custom.symbol, 'XYZ');
  assert.equal(readCurrencyRows(storageWith([{ code: 'VND', name: 'Vietnamese Dong', status: 'Active' }]))[0].decimalPlaces, '0');
});

test('foreign pay is rounded to the currency decimal places', () => {
  const { lines } = foreignPayFor([{ currency: 'VND', hours: 8, amount: 1250000.6 }], [{ code: 'PHP', rate: 1 }, { code: 'VND', symbol: '₫', decimals: 0, rate: 0.0023 }]);
  assert.equal(lines[0].amount, 1250001);
});
