import assert from 'node:assert/strict';
import test from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: index => [...store.keys()][index],
};

const { actionsFor, applyAction, hasSetLevels, levelBlock, levelsForCalendar, levelsOf, pendingLevel } = await import('../src/payrollRuns.js');

/**
 * Multi-level payroll review: the payout calendar's Approval Levels (2 to 6) say how many levels a
 * transaction goes through, counting the person who prepares it as level 1 — the same way the company's
 * approval hierarchy counts. The last level is the final approval; each level is a different person.
 */
const draft = (levels, extra = {}) => ({ id: 'r1', transactionNumber: 'PR-2026-10-001', status: 'Draft', payrollType: 'Regular', approvals: [], audit: [], ...(levels === undefined ? {} : { approvalLevels: levels }), ...extra });
const step = (run, action, actor) => applyAction(run, action, { actor, runs: [run] });
const labels = run => actionsFor(run, [run], { canReopen: true, isPaAdmin: true }).map(item => item.label);

test('a calendar sets the levels, and only a valid count is taken', () => {
  const calendars = [{ calendarCode: 'A', approvalLevels: '3' }, { calendarCode: 'B', approvalLevels: '9' }, { calendarCode: 'C' }, { calendarCode: 'D', approvalLevels: '1' }, { calendarCode: 'E', approvalLevels: '2' }];
  assert.equal(levelsForCalendar(calendars, 'A'), 3);
  assert.equal(levelsForCalendar(calendars, 'B'), undefined, 'more than 6 is not a level count');
  assert.equal(levelsForCalendar(calendars, 'C'), undefined);
  assert.equal(levelsForCalendar(calendars, 'D'), undefined, 'a payroll needs someone to prepare it and someone to approve it');
  assert.equal(levelsForCalendar(calendars, 'E'), 2);
  assert.equal(levelsForCalendar(calendars, 'missing'), undefined);
});

test('a transaction with no calendar level keeps the standard three, with no extra checks', () => {
  assert.equal(hasSetLevels(draft()), false);
  assert.equal(levelsOf(draft()), 3);
  let run = draft();
  for (const [action, status] of [['submitReview', 'For Review'], ['submitApproval', 'For Approval'], ['approve', 'Approved']]) {
    const outcome = step(run, action, 'P&A Admin');
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.run.status, status);
    run = outcome.run;
  }
  assert.deepEqual(run.approvals.map(item => item.level), ['Review', 'Second review', 'Approval']);
});

test('three levels: prepare, one review, then the final approval, each by a different person', () => {
  let run = draft(3);
  assert.ok(labels(run).includes('Submit for Review'));
  run = step(run, 'submitReview', 'Ana (Client Admin)').run;
  assert.equal(run.status, 'For Review');
  assert.equal(pendingLevel(run), 2);
  assert.ok(labels(run).includes('Submit for Approval'), 'the only review hands over to the approver');

  run = step(run, 'submitApproval', 'Ben (P&A Admin)').run;
  assert.equal(run.status, 'For Approval');
  assert.equal(pendingLevel(run), 3);

  run = step(run, 'approve', 'Maria (P&A SuperAdmin)').run;
  assert.equal(run.status, 'Approved');
  assert.deepEqual(run.approvals.map(item => [item.level, item.step, item.of]), [['Prepared', 1, 3], ['Level 2 review', 2, 3], ['Approval', 3, 3]]);
});

test('four levels add a second review before the approval', () => {
  let run = step(draft(4), 'submitReview', 'Ana (Client Admin)').run;
  assert.equal(pendingLevel(run), 2);
  assert.ok(labels(run).includes('Pass to Level 3'));
  run = step(run, 'submitApproval', 'Ben (P&A Admin)').run;
  assert.equal(run.status, 'For Review', 'level 3 is still a review');
  assert.equal(pendingLevel(run), 3);
  assert.ok(labels(run).includes('Submit for Approval'));
  run = step(run, 'submitApproval', 'Cara (Approver)').run;
  assert.equal(run.status, 'For Approval');
  assert.equal(pendingLevel(run), 4);
});

test('two levels go straight from the preparer to the final approval', () => {
  assert.deepEqual(labels(draft(2)).filter(label => /Submit/.test(label)), ['Submit for Approval']);
  const run = step(draft(2), 'submitReview', 'Ana (Client Admin)').run;
  assert.equal(run.status, 'For Approval');
  assert.deepEqual(labels(run).filter(label => /Approv/.test(label)), ['Approve']);
  assert.equal(step(run, 'approve', 'Ben (P&A Admin)').run.status, 'Approved');
});

test('nobody takes part in two levels, including the person who prepared it', () => {
  let run = step(draft(4), 'submitReview', 'Ana (Client Admin)').run;
  const again = step(run, 'submitApproval', 'Ana (P&A Admin)');
  assert.match(again.error, /already took part/);
  assert.equal(again.run.status, 'For Review');
  run = step(run, 'submitApproval', 'Ben (P&A Admin)').run;
  assert.match(step(run, 'submitApproval', 'Ben (Client Admin)').error, /different person/);
  assert.match(step(draft(3), 'approve', 'Ben (P&A Admin)').error, /awaiting approval/);
});

test('a rejection returns it to Open and the next round starts clean', () => {
  let run = step(draft(4), 'submitReview', 'Ana (Client Admin)').run;
  run = step(run, 'submitApproval', 'Ben (P&A Admin)').run;
  const rejected = step(run, 'reject', 'Cara (Approver)');
  assert.equal(rejected.run.status, 'Open');
  assert.equal(rejected.run.approvals.at(-1).decision, 'Rejected');
  assert.equal(rejected.run.approvals.at(-1).level, 'Level 3 review');
  // After the rejection the earlier signers are free to take part again.
  const again = { ...rejected.run, status: 'Draft' };
  assert.equal(levelBlock(again, 'Ana (Client Admin)'), '');
  assert.equal(step(again, 'submitReview', 'Ana (Client Admin)').run.status, 'For Review');
});

test('re-opening a transaction in the middle of the chain also starts a new round', () => {
  const run = step(draft(3), 'submitReview', 'Ana (Client Admin)').run;
  assert.equal(run.status, 'For Review');
  const reopened = applyAction(run, 'reopen', { actor: 'Ana (Client Admin)', runs: [run], isPaAdmin: true });
  assert.equal(reopened.error, undefined);
  assert.equal(reopened.run.status, 'Open');
  assert.equal(reopened.run.approvals.at(-1).decision, 'Re-opened');
  assert.equal(levelBlock({ ...reopened.run, status: 'Draft' }, 'Ana (Client Admin)'), '');
});

test('a run saved by the first version of this feature still reads sensibly', () => {
  // approvalLevel 1 was stored when the preparer was not counted; it now means "waiting at level 2".
  const old = draft(3, { status: 'For Review', approvalLevel: 1 });
  assert.equal(pendingLevel(old), 2);
});

test('the hint on each action says which level it signs off', () => {
  const run = step(draft(5), 'submitReview', 'Ana (Client Admin)').run;
  const pass = actionsFor(run, [run], { canReopen: true, isPaAdmin: true }).find(item => item.key === 'submitApproval');
  assert.match(pass.hint, /level 2 of 5/);
  assert.equal(pass.label, 'Pass to Level 3');
});
