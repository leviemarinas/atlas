import test from 'node:test';
import assert from 'node:assert/strict';
import {
  operationalStorageKey,
  postedPayrollOptionsForCompany,
  readOperationalRowsForCompany,
  writeOperationalRowsForCompany,
} from '../src/operationalStore.js';
import { companyReadiness, defaultCompanyRecord, onboardingChecklist } from '../src/companyRepository.js';

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

test('operational registers isolate company rows and preserve foreign records on save', () => {
  const key = operationalStorageKey('earnings', 3);
  const storage = memoryStorage({
    [key]: JSON.stringify([
      { id: 1, companyId: 'cmp-a', code: 'A-1' },
      { id: 2, companyId: 'cmp-b', code: 'B-1' },
    ]),
  });

  assert.deepEqual(readOperationalRowsForCompany('earnings', 'cmp-a', storage), [
    { id: 1, companyId: 'cmp-a', code: 'A-1' },
  ]);

  writeOperationalRowsForCompany(key, 'cmp-a', [{ id: 3, code: 'A-2' }], storage);
  assert.deepEqual(JSON.parse(storage.getItem(key)), [
    { id: 3, code: 'A-2', companyId: 'cmp-a' },
    { id: 2, companyId: 'cmp-b', code: 'B-1' },
  ]);
});

test('legacy unscoped operational rows belong only to the original ABC company', () => {
  const key = operationalStorageKey('deductions', 3);
  const storage = memoryStorage({ [key]: JSON.stringify([{ id: 1, code: 'LEGACY' }]) });

  assert.equal(readOperationalRowsForCompany('deductions', 'cmp-new', storage).length, 0);
  assert.deepEqual(readOperationalRowsForCompany('deductions', defaultCompanyRecord.companyId, storage), [
    { id: 1, code: 'LEGACY', companyId: defaultCompanyRecord.companyId },
  ]);
});

test('posted payroll options never cross company boundaries', () => {
  const storage = memoryStorage({
    'atlas-payroll-runs-v1:cmp-a': JSON.stringify([{ transactionNumber: 'PAY-A', status: 'Posted' }]),
    'atlas-payroll-runs-v1:cmp-b': JSON.stringify([{ transactionNumber: 'PAY-B', status: 'Locked' }]),
  });

  assert.deepEqual(postedPayrollOptionsForCompany('cmp-a', storage), ['PAY-A']);
  assert.deepEqual(postedPayrollOptionsForCompany('cmp-b', storage), ['PAY-B']);
});

test('company readiness ignores another company calendar, billing, and grants', () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = memoryStorage({
    'atlas-operational-calendar-v1': JSON.stringify([{ companyId: 'cmp-b', status: 'Active' }]),
    'atlas-operational-billing-v2': JSON.stringify([{ companyId: 'cmp-b', status: 'Approved' }]),
    'atlas-security-grants-v1': JSON.stringify([{ companyId: 'cmp-b', status: 'Active' }]),
  });
  try {
    const company = { ...defaultCompanyRecord, companyId: 'cmp-a' };
    const result = companyReadiness(company, { checklist: onboardingChecklist() }, []);
    const status = code => result.checklist.find(item => item.itemCode === code)?.status;
    assert.equal(status('CALENDAR'), 'Pending');
    assert.equal(status('BILLING'), 'Pending');
    assert.equal(status('SECURITY_ACCESS'), 'Pending');
  } finally {
    globalThis.localStorage = previous;
  }
});
