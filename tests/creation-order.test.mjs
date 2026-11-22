/** Oldest-first order for bonuses, deductions and company loans that no hierarchy ranks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { byCreation } from '../src/creationOrder.js';

const order = records => [...records].sort(byCreation).map(record => record.code);

test('an earlier Date Created goes first', () => {
  assert.deepEqual(order([{ code: 'B', id: 1, dateCreated: '11/20/2026' }, { code: 'A', id: 2, dateCreated: '11/05/2026' }]), ['A', 'B']);
});

test('records created on the same day keep the order they were added or uploaded in', () => {
  const day = '11/20/2026';
  assert.deepEqual(order([{ code: 'DED-10', id: 1763600000003, dateCreated: day }, { code: 'DED-9', id: 1763600000001, dateCreated: day }, { code: 'DED-2', id: 1763600000002, dateCreated: day }]), ['DED-9', 'DED-2', 'DED-10']);
});

test('a record with no Date Created counts as the oldest', () => {
  assert.deepEqual(order([{ code: 'NEW', id: 9, dateCreated: '11/20/2026' }, { code: 'SEED', id: 3 }]), ['SEED', 'NEW']);
});

test('with nothing else to go by the code decides, numbers read as numbers', () => {
  assert.deepEqual(order([{ code: 'DED-10', id: 1 }, { code: 'DED-9', id: 1 }]), ['DED-9', 'DED-10']);
});
