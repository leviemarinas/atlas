import assert from 'node:assert/strict';
import test from 'node:test';

const { configFieldProblems, usedInPayroll } = await import('../src/configValidation.js');

const steps = [{ title: 'Details', fields: [
  { key: 'code', label: 'Loan Code', required: true },
  { key: 'principal', label: 'Principal', type: 'number', required: true },
  { key: 'interest', label: 'Interest per Annum (%)', type: 'number', required: true },
  { key: 'terms', label: 'Terms (months)', type: 'number', required: true },
  { key: 'amortization', label: 'Amortization', type: 'number', required: true },
  { key: 'startDate', label: 'Start Date', type: 'date' },
  { key: 'effectivityDate', label: 'Effectivity Date', type: 'date', required: true },
  { key: 'endDate', label: 'End Date', type: 'date' },
] }];
const ok = { effectivityDate: '2026-01-01', code: 'CL-9', principal: '1000', interest: '5', terms: '12', amortization: '90' };
const problems = patch => configFieldProblems('loans', { ...ok, ...patch }, steps);

test('a valid loan has no problem', () => assert.deepEqual(problems({}), []));

test('a required text field of spaces is refused', () => {
  assert.deepEqual(problems({ code: '   ' }), ['Loan Code is required.']);
  assert.deepEqual(problems({ code: '' }), ['Loan Code is required.']);
});

test('a required date left blank is refused', () => assert.deepEqual(problems({ effectivityDate: '' }), ['Effectivity Date is required.']));

test('loan amounts and rates on and either side of their limits', () => {
  assert.deepEqual(problems({ principal: '0' }), ['Principal must be a number above 0.']);
  assert.deepEqual(problems({ principal: '0.01' }), []);
  assert.deepEqual(problems({ principal: '-1' }), ['Principal must be a number above 0.']);
  assert.deepEqual(problems({ interest: '0' }), []);
  assert.deepEqual(problems({ interest: '100' }), []);
  assert.deepEqual(problems({ interest: '100.01' }), ['Interest per Annum (%) must be a number from 0 to 100.']);
  assert.deepEqual(problems({ interest: '-0.01' }), ['Interest per Annum (%) must be a number from 0 to 100.']);
  assert.deepEqual(problems({ terms: '1' }), []);
  assert.deepEqual(problems({ terms: '0' }), ['Terms (months) must be a whole number of 1 or more.']);
  assert.deepEqual(problems({ terms: '2.5' }), ['Terms (months) must be a whole number of 1 or more.']);
  assert.deepEqual(problems({ amortization: '0' }), ['Amortization must be a number above 0.']);
  assert.deepEqual(problems({ amortization: 'abc' }), ['Amortization must be a number.']);
});

test('an end date before its start is refused, the same day is not', () => {
  assert.deepEqual(problems({ startDate: '2026-02-01', endDate: '2026-01-31' }), ['End Date cannot be before Start Date.']);
  assert.deepEqual(problems({ startDate: '2026-02-01', endDate: '2026-02-01' }), []);
  assert.deepEqual(problems({ startDate: '2026-02-01', endDate: '' }), []);
});

test('a percentage deduction cannot pass 100', () => {
  const fields = [{ key: 'amount', label: 'Default Amount / Rate', type: 'number', required: true }];
  const check = (basis, amount) => configFieldProblems('deductions', { basis, amount }, [{ fields }]);
  assert.deepEqual(check('Percentage of Basic Pay', '100'), []);
  assert.deepEqual(check('Percentage of Basic Pay', '100.01'), ['Default Amount / Rate is a percentage here, so it must be from 0 to 100.']);
  assert.deepEqual(check('Fixed Amount', '100.01'), []);
});

test('basic pay divisors', () => {
  const fields = [{ key: 'factorDays', label: 'Factor Days per Year', type: 'number' }, { key: 'workHours', label: 'Work Hours per Day', type: 'number' }];
  const check = patch => configFieldProblems('basicPay', patch, [{ fields }]);
  assert.deepEqual(check({ factorDays: '366', workHours: '24' }), []);
  assert.equal(check({ factorDays: '367' }).length, 1);
  assert.equal(check({ factorDays: '0' }).length, 1);
  assert.equal(check({ workHours: '0' }).length, 1);
  assert.equal(check({ workHours: '24.01' }).length, 1);
});

test('delete is blocked once a standing transaction used the item', () => {
  const run = status => ({ status, transactionNumber: 'PR-1', result: { lines: [{ deductions: [{ code: 'DED-001', name: 'Uniform Deduction' }] }] } });
  assert.equal(usedInPayroll({ code: 'DED-001', name: 'Uniform Deduction' }, [run('Open')]).transactionNumber, 'PR-1');
  assert.equal(usedInPayroll({ code: 'DED-001', name: 'Uniform Deduction' }, [run('Cancelled')]), null, 'a cancelled transaction frees it');
  assert.equal(usedInPayroll({ code: 'DED-002', name: 'Other' }, [run('Posted')]), null);
  assert.equal(usedInPayroll({ code: '', name: '' }, [run('Posted')]), null);
});

test('the take-home policy names a field that is out of range', async () => {
  const { takeHomeFieldProblems } = await import('../src/configValidation.js');
  const base = { thresholdType: 'Percentage', threshold: 30, deductionCapEnabled: true, deductionCapType: 'Percentage', deductionCap: 40, loanCapType: 'Percentage', loanCap: 25, attendanceCapType: 'Number of Days', attendanceCap: 3 };
  const check = patch => takeHomeFieldProblems({ ...base, ...patch });
  assert.deepEqual(check({}), []);
  assert.deepEqual(check({ threshold: 100 }), []);
  assert.deepEqual(check({ threshold: 0 }), []);
  assert.deepEqual(check({ threshold: 100.01 }), ['Threshold is a percentage, so it must be from 0 to 100.']);
  assert.deepEqual(check({ threshold: -1 }), ['Threshold is a percentage, so it must be from 0 to 100.']);
  assert.deepEqual(check({ thresholdType: 'Fixed Amount', threshold: 5000.5 }), []);
  assert.deepEqual(check({ thresholdType: 'Fixed Amount', threshold: -0.01 }), ['Threshold must be 0 pesos or more.']);
  assert.deepEqual(check({ threshold: '' }), ['Threshold must be a number.']);
  assert.deepEqual(check({ loanCap: 101 }), ['Loan cap is a percentage, so it must be from 0 to 100.']);
  assert.deepEqual(check({ deductionCapEnabled: false, deductionCap: 500 }), [], 'a cap that is switched off is not checked');
  assert.deepEqual(check({ attendanceCap: 2.5 }), ['Attendance cap must be a whole number of days, 0 or more.']);
});

test('text fields have a length limit, and entry forms check their numbers and dates', async () => {
  const { configFieldProblems: check, entryProblems } = await import('../src/configValidation.js');
  const fields = [{ key: 'code', label: 'Loan Code', required: true }, { key: 'name', label: 'Company Loan Name', required: true }];
  const run = patch => check('loans', { code: 'A', name: 'B', ...patch }, [{ fields }]);
  assert.deepEqual(run({ code: 'X'.repeat(20) }), []);
  assert.deepEqual(run({ code: 'X'.repeat(21) }), ['Loan Code can have at most 20 characters.']);
  assert.deepEqual(run({ name: 'N'.repeat(100) }), []);
  assert.deepEqual(run({ name: 'N'.repeat(101) }), ['Company Loan Name can have at most 100 characters.']);

  const loanFields = [['amount', 'Amortization Amount', 'number'], ['principal', 'Principal', 'number'], ['startDate', 'Start Date', 'date'], ['endDate', 'End Date', 'date'], ['reference', 'Reference Number', 'text']];
  const loan = patch => entryProblems('loans', { amount: '100', principal: '1000', startDate: '01/01/2026', endDate: '12/31/2026', ...patch }, loanFields, ['amount', 'principal']);
  assert.deepEqual(loan({}), []);
  assert.deepEqual(loan({ amount: '0' }), ['Amortization Amount must be a number above 0.']);
  assert.deepEqual(loan({ principal: '0.01' }), []);
  assert.deepEqual(loan({ startDate: '06/01/2026', endDate: '05/31/2026' }), ['End Date cannot be before Start Date.']);
  assert.deepEqual(loan({ startDate: '06/01/2026', endDate: '06/01/2026' }), []);
  assert.deepEqual(loan({ endDate: '' }), []);
});

test('the recovery plan of the take-home policy is checked, and a long plan keeps its whole balance', async () => {
  const { takeHomeFieldProblems } = await import('../src/configValidation.js');
  const policy = patch => ({ thresholdType: 'Percentage', threshold: 30, carryForward: true, recovery: { method: 'Scheduled installments', installments: 3, fixedAmount: 500, staggerThreshold: 500, ...patch } });
  assert.deepEqual(takeHomeFieldProblems(policy({})), []);
  assert.deepEqual(takeHomeFieldProblems(policy({ installments: 0 })), ['Number of installments must be a whole number of 1 or more.']);
  assert.deepEqual(takeHomeFieldProblems(policy({ installments: 1 })), []);
  assert.deepEqual(takeHomeFieldProblems(policy({ installments: 2.5 })), ['Number of installments must be a whole number of 1 or more.']);
  assert.deepEqual(takeHomeFieldProblems(policy({ method: 'Fixed staggered amount per payroll', fixedAmount: 0 })), ['Fixed amount per payroll must be more than 0.']);
  assert.deepEqual(takeHomeFieldProblems(policy({ method: 'Fixed staggered amount per payroll', fixedAmount: 0.01 })), []);
  assert.deepEqual(takeHomeFieldProblems(policy({ staggerThreshold: -1 })), ['Staggering threshold must be 0 pesos or more.']);
  assert.deepEqual(takeHomeFieldProblems({ ...policy({ installments: 0 }), carryForward: false }), [], 'a plan that is not used is not checked');
});
