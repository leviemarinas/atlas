import test from 'node:test';
import assert from 'node:assert/strict';
import { entryProblems } from '../src/configValidation.js';

const prevFields = [['employerName', 'Employer Name'], ['tin', 'Taxpayer Identification No.'], ['startDate', 'Employment Start Date', 'date'], ['endDate', 'Employment End Date', 'date'], ['employmentYear', 'Employment Year', 'number'], ['basicPay', 'Basic Pay', 'number'], ['taxWithheld', 'Tax Withheld', 'number']];
const base = { id: 1, employerName: 'ABC Company', tin: '123456789012', startDate: '2026-01-05', endDate: '2026-03-31', employmentYear: '2026', basicPay: '100000', taxWithheld: '5000' };
const problems = (draft, context = {}) => entryProblems('previousEmployer', { ...base, ...draft }, prevFields, [], { hireDate: '2026-04-01', ...context });

test('Previous Employer: a valid record has no problems', () => assert.deepEqual(problems({}), []));

test('Previous Employer: TIN must have 9 to 12 digits, separators allowed', () => {
  assert.deepEqual(problems({ tin: '123-456-789' }), []);
  ['12345678', '1234567890123', 'ABC123456789', '12$456789012'].forEach(tin => assert.ok(problems({ tin }).some(item => item.includes('9 to 12 digits')), tin));
});

test('Previous Employer: End Date cannot be later than the current hire date', () => {
  assert.ok(problems({ endDate: '2026-04-15' }).includes('Previous Employment End Date cannot be later than the Current Employer Hire Date.'));
  assert.deepEqual(problems({ endDate: '2026-04-01' }), []);
});

test('Previous Employer: dates outside the taxable year are refused', () => {
  assert.ok(problems({ startDate: '2025-06-01' }).some(item => item.includes('outside the taxable year 2026')));
  assert.ok(problems({ endDate: '2027-01-02' }, { hireDate: '' }).some(item => item.includes('outside the taxable year 2026')));
});

test('Previous Employer: End Date before Start Date is refused', () => {
  assert.ok(problems({ startDate: '2026-03-31', endDate: '2026-01-05' }).some(item => item.includes('cannot be before')));
});

test('Previous Employer: an exact duplicate is refused, an edit of the same record is not', () => {
  assert.ok(problems({ id: 2 }, { rows: [base] }).some(item => item.includes('already exists')));
  assert.deepEqual(problems({ id: 1 }, { rows: [base] }), []);
  assert.deepEqual(problems({ id: 2, taxWithheld: '5001' }, { rows: [base] }), []);
});

test('Previous Employer: amounts are not negative, not huge and have at most 2 decimals', () => {
  assert.ok(problems({ basicPay: '-1' }).length > 0);
  assert.ok(problems({ basicPay: '1000000000' }).some(item => item.includes('cannot be more than 999,999,999.99')));
  assert.ok(problems({ taxWithheld: '1234.567' }).some(item => item.includes('at most 2 decimal places')));
  assert.deepEqual(problems({ taxWithheld: '1234.50' }), []);
  assert.deepEqual(problems({ taxWithheld: '0' }), []);
});

const vaFields = [['name', 'Variable Allowance', 'select'], ['tag', 'Tag', 'select'], ['amount', 'Amount', 'number'], ['effectiveDate', 'Effectivity Date', 'date'], ['endDate', 'End Date', 'date'], ['holdDate', 'Hold Date', 'date']];
const va = draft => entryProblems('allowances', { name: 'Lecture Fee', tag: 'Earning', amount: '500', effectiveDate: '2026-01-01', ...draft }, vaFields, []);

test('Variable Allowance: a Tag of Basic Pay or Earning is required', () => {
  assert.deepEqual(va({}), []);
  assert.deepEqual(va({ tag: 'Basic Pay' }), []);
  assert.ok(va({ tag: '' }).includes('Tag is required. Choose Basic Pay or Earning.'));
});

test('Variable Allowance: amount limits and decimals', () => {
  assert.ok(va({ amount: '1000000000' }).some(item => item.includes('cannot be more than')));
  assert.ok(va({ amount: '123.4567' }).some(item => item.includes('at most 2 decimal places')));
});

test('Variable Allowance: End Date not before the Effectivity Date, Hold Date not after End Date', () => {
  assert.ok(va({ endDate: '2025-12-31' }).some(item => item.includes('cannot be before')));
  assert.deepEqual(va({ effectiveDate: '2026-02-01', endDate: '2026-02-01' }), []);
  assert.ok(va({ endDate: '2026-03-01', holdDate: '2026-04-01' }).includes('Hold Date cannot be after the End Date.'));
});
