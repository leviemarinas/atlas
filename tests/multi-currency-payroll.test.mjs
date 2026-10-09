/**
 * One payroll transaction paying in up to three currencies. The rate is typed
 * on the transaction; an employee's foreign pay (hours and amount) is added to
 * gross in PHP, and net pay is paid out per currency with the PHP remainder.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultHrmData } from '../src/hrmData.js';
import { employeeRoster } from '../src/employeeRoster.js';
import { bankFileFor, runPayroll } from '../src/payrollEngine.js';
import { buildPayrollContext, newPayrollRun } from '../src/payrollRuns.js';
import { formatCurrency, payoutsByCurrency, runCurrenciesOf, runCurrencyProblem } from '../src/payrollCurrencies.js';

const COMPANY = 'ABC-PH-001';
const employee = employeeRoster[0];

function transaction(extra = {}) {
  const run = newPayrollRun({ companyId: COMPANY, year: 2026, month: 'August' });
  return {
    ...run,
    periodStart: '2026-08-16', periodEnd: '2026-08-31',
    timekeepingStart: '2026-08-01', timekeepingEnd: '2026-08-15', payoutDate: '2026-08-31',
    population: { ...run.population, mode: 'Selected Employees', included: [employee.employeeId] },
    ...extra,
  };
}

const compute = run => runPayroll({ transaction: run, context: buildPayrollContext({ companyId: COMPANY, run, hrmData: defaultHrmData(COMPANY) }) });

const currencies = [{ code: 'PHP', rate: 1 }, { code: 'USD', symbol: '$', rate: 56.2 }, { code: 'SGD', symbol: 'S$', rate: 43.8 }];

test('the transaction lists PHP first and at most three currencies, each with a rate', () => {
  assert.deepEqual(runCurrenciesOf({}).map(item => item.code), ['PHP']);
  assert.deepEqual(runCurrenciesOf({ currencies }).map(item => [item.code, item.symbol, item.rate]), [['PHP', '₱', 1], ['USD', '$', 56.2], ['SGD', 'S$', 43.8]]);
  assert.equal(runCurrencyProblem(runCurrenciesOf({ currencies })), '');
  assert.match(runCurrencyProblem([{ code: 'PHP', rate: 1 }, { code: 'USD', rate: 0 }]), /USD-to-PHP rate/);
  assert.match(runCurrencyProblem([{ code: 'PHP' }, { code: 'USD', rate: 1 }, { code: 'SGD', rate: 1 }, { code: 'EUR', rate: 1 }]), /at most 3/);
  assert.equal(formatCurrency(600, 'USD', '$'), '$600.00');
});

test("an employee's USD pay is added to gross in PHP and paid out in USD, the rest in PHP", () => {
  const plain = compute(transaction({ currencies })).lines[0];
  const run = transaction({ currencies, overrides: { [employee.employeeId]: { currencyLines: [{ currency: 'USD', hours: 40, amount: 600 }] } } });
  const result = compute(run);
  const line = result.lines[0];

  assert.equal(line.grossPay, Number((plain.grossPay + 600 * 56.2).toFixed(2)));
  const usdEarning = line.earnings.find(item => item.code === 'FX-USD');
  assert.equal(usdEarning.amount, 33720);
  assert.deepEqual(usdEarning.foreign, { currency: 'USD', symbol: '$', rate: 56.2, hours: 40, amount: 600 });

  const [php, usd] = line.currencyPayouts;
  assert.deepEqual([usd.currency, usd.hours, usd.amount, usd.rate, usd.phpAmount], ['USD', 40, 600, 56.2, 33720]);
  assert.equal(php.currency, 'PHP');
  assert.equal(Number((php.amount + usd.phpAmount).toFixed(2)), line.netPay, 'the currencies add back to net pay');

  const totals = Object.fromEntries(result.currencyTotals.map(row => [row.code, row]));
  assert.equal(totals.USD.amount, 600);
  assert.equal(totals.USD.hours, 40);
  assert.equal(totals.SGD.amount, 0);

  const bank = bankFileFor(result);
  const usdRow = bank.find(row => row.currency === 'USD');
  assert.equal(usdRow.amount, 600);
  assert.equal(usdRow.baseAmount, 33720);
  assert.equal(bank.filter(row => row.currency === 'PHP').reduce((total, row) => total + row.amount, 0).toFixed(2), php.amount.toFixed(2));
});

test('pay in a currency the transaction does not list is refused as an error', () => {
  const run = transaction({ currencies: [{ code: 'PHP', rate: 1 }], overrides: { [employee.employeeId]: { currencyLines: [{ currency: 'EUR', hours: 8, amount: 100 }] } } });
  const line = compute(run).lines[0];
  assert.ok(line.exceptions.some(item => item.severity === 'Error' && /EUR/.test(item.message)));
  assert.equal(line.currencyPayouts, null);
});

test('a run saved before currencies existed still pays in PHP only', () => {
  const result = compute(transaction());
  assert.equal(result.lines[0].currencyPayouts, null);
  assert.deepEqual(result.currencyTotals.map(row => row.code), ['PHP']);
  assert.equal(result.currencyTotals[0].amount, result.totals.netPay);
});

test('when deductions exceed the PHP pay, the shortfall comes out of the foreign pay at the same rate', () => {
  const lines = [{ currency: 'USD', symbol: '$', rate: 50, hours: 40, amount: 600, phpAmount: 30000 }];
  const [php, usd] = payoutsByCurrency(28000, lines, 0);
  assert.equal(php.amount, 0);
  assert.equal(usd.phpAmount, 28000);
  assert.equal(usd.amount, 560);
  assert.deepEqual(usd.reducedBy, { phpAmount: 2000, amount: 40 });

  const [phpOk, usdOk] = payoutsByCurrency(35000, lines, 80);
  assert.equal(phpOk.amount, 5000);
  assert.equal(usdOk.amount, 600);
  assert.equal(usdOk.reducedBy, null);
});
