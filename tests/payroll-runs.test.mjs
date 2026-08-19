/**
 * The payroll transaction: its status machine, its record lock, its report
 * catalogue, and the hold it places on the statutory tables it consumed.
 *
 * Annex C 5a defines what each status permits, and §7.1 says a statutory table
 * a payroll has used can no longer be edited. Both of those are rules a screen
 * can quietly stop honouring, so they are pinned here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: index => [...store.keys()][index],
  };
  return globalThis.localStorage;
}

const localStorage = installLocalStorage();

const { defaultHrmData } = await import('../src/hrmData.js');
const { employeeRoster } = await import('../src/employeeRoster.js');
const {
  LOCK_MINUTES,
  PAYROLL_STATUS_TABS,
  acquireLock,
  actionsFor,
  applyAction,
  buildPayrollContext,
  capabilitiesOf,
  deletePayrollRun,
  lockHeldBy,
  newPayrollRun,
  nextTransactionNumber,
  payrollReport,
  payrollReportCatalog,
  readPayrollRuns,
  releaseLock,
  reportTotals,
  savePayrollRun,
} = await import('../src/payrollRuns.js');
const { effectiveVersion, versionUsage, readStatutoryData } = await import('../src/statutoryService.js');

const COMPANY = 'ABC-PH-001';
const hrmData = defaultHrmData(COMPANY);

function makeRun(overrides = {}) {
  const run = newPayrollRun({ runs: [], companyId: COMPANY, year: 2025, month: 'November', ...overrides });
  return {
    ...run,
    periodStart: '2025-11-16',
    periodEnd: '2025-11-30',
    timekeepingStart: '2025-11-01',
    timekeepingEnd: '2025-11-15',
    payoutDate: '2025-11-30',
    lockDate: '2025-12-05',
    remarks: 'Second half November 2025',
    ...overrides,
  };
}

const contextFor = run => buildPayrollContext({
  companyId: COMPANY,
  run,
  hrmData,
  registers: { earnings: [], deductions: [], bonuses: [], payCodes: [] },
  hierarchy: [],
  policies: { takeHome: { enabled: true, autoDefer: true, thresholdType: 'Percentage', threshold: 20, base: 'Gross Pay' } },
});

const compute = run => applyAction(run, 'recalculate', { context: contextFor(run), runs: [] }).run;

test.beforeEach(() => localStorage.clear());

/* ------------------------------------------------------------- the record */

test('a new transaction opens with the defaults Annex C specifies for each switch', () => {
  const regular = newPayrollRun({ runs: [], companyId: COMPANY });
  assert.equal(regular.status, 'Open');
  assert.equal(regular.config.computeAllowableDeduction, true, 'allowable deductions are ticked by default');
  assert.equal(regular.config.zeroBasicPay, false, 'a regular run pays basic pay');
  assert.equal(regular.config.thirteenthMonth.enabled, false, '13th month is unticked by default');
  assert.equal(regular.config.computeFinalPay, false);

  const special = newPayrollRun({ runs: [], companyId: COMPANY, payrollType: 'Special' });
  assert.equal(special.config.zeroBasicPay, true, 'a special run zeroes basic pay by default');
});

test('the transaction number is generated and increments within its month', () => {
  const first = nextTransactionNumber([], 2025, 11);
  assert.equal(first, 'PR-2025-11-001');
  assert.equal(nextTransactionNumber([{ transactionNumber: first }], 2025, 11), 'PR-2025-11-002');
  assert.equal(nextTransactionNumber([{ transactionNumber: first }], 2025, 12), 'PR-2025-12-001');
});

test('runs are stored and read back per company', () => {
  const run = compute(makeRun());
  savePayrollRun(COMPANY, run);
  assert.equal(readPayrollRuns(COMPANY).length, 1);
  assert.equal(readPayrollRuns('OTHER-CO').length, 0, 'another company sees none of them');
  deletePayrollRun(COMPANY, run.id);
  assert.equal(readPayrollRuns(COMPANY).length, 0);
});

/* ------------------------------------------------------- the status machine */

test('a transaction walks Open to Locked and each step records who did it', () => {
  let run = compute(makeRun());
  assert.equal(run.status, 'Open');
  assert.ok(run.result.totals.headcount > 0);

  const step = (action, expected) => {
    const outcome = applyAction(run, action, { actor: 'P&A Admin', remarks: `did ${action}`, runs: [run], context: contextFor(run) });
    assert.equal(outcome.error, undefined, `${action}: ${outcome.error || ''}`);
    assert.equal(outcome.run.status, expected, `${action} moves to ${expected}`);
    run = outcome.run;
  };

  step('postDraft', 'Draft');
  step('submitReview', 'For Review');
  step('submitApproval', 'For Approval');
  step('approve', 'Approved');
  step('post', 'Posted');
  step('lock', 'Locked');

  assert.equal(run.approvals.length, 3, 'review, second review and approval are all recorded');
  assert.ok(run.audit.some(entry => entry.action === 'Posted'));
  assert.ok(run.audit.every(entry => entry.actor && entry.at));
});

test('an action the current status does not allow is refused with a reason', () => {
  const open = compute(makeRun());
  assert.match(applyAction(open, 'post', { runs: [] }).error, /approved transaction/);
  assert.match(applyAction(open, 'submitReview', { runs: [] }).error, /post the transaction as draft/i);
  assert.match(applyAction(open, 'lock', { runs: [] }).error, /posted transaction/);
});

test('a transaction cannot be posted as draft before it has been computed', () => {
  const uncomputed = makeRun();
  assert.match(applyAction(uncomputed, 'postDraft', { runs: [] }).error, /Recalculate/);
});

test('a drafted transaction is locked against edits but still reports', () => {
  const draft = applyAction(compute(makeRun()), 'postDraft', { runs: [] }).run;
  const capability = capabilitiesOf(draft);
  assert.equal(capability.edit, false);
  assert.equal(capability.recalculate, false);
  assert.equal(capability.reports, true);
  assert.match(applyAction(draft, 'recalculate', { context: contextFor(draft), runs: [] }).error, /can no longer be recalculated/);
});

test('a reviewer may still edit, which is what "can edit the transaction" means on that row', () => {
  let run = applyAction(compute(makeRun()), 'postDraft', { runs: [] }).run;
  run = applyAction(run, 'submitReview', { runs: [run] }).run;
  assert.equal(capabilitiesOf(run).edit, true);
  assert.equal(capabilitiesOf(run).recalculate, true);
});

test('rejecting returns the transaction to Open with the remarks on the trail', () => {
  let run = applyAction(compute(makeRun()), 'postDraft', { runs: [] }).run;
  run = applyAction(run, 'submitReview', { runs: [run] }).run;
  const rejected = applyAction(run, 'reject', { actor: 'Reviewer', remarks: 'Overtime looks wrong', runs: [run] });
  assert.equal(rejected.run.status, 'Open');
  assert.equal(rejected.run.approvals.at(-1).decision, 'Rejected');
  assert.equal(rejected.run.approvals.at(-1).remarks, 'Overtime looks wrong');
});

test('only the most recent regular transaction can be re-opened', () => {
  const older = { ...compute(makeRun()), id: 'run-older', payoutDate: '2025-10-31', status: 'Posted' };
  const newer = { ...compute(makeRun()), id: 'run-newer', payoutDate: '2025-11-30', status: 'Posted' };
  const runs = [older, newer];
  assert.match(applyAction(older, 'reopen', { runs }).error, /most recent regular/);
  assert.equal(applyAction(newer, 'reopen', { runs }).run.status, 'Open');
});

test('any special transaction can be re-opened, because they carry no ordering', () => {
  const older = { ...compute(makeRun({ payrollType: 'Special' })), id: 'sp-1', payoutDate: '2025-09-30', status: 'Posted' };
  const newer = { ...compute(makeRun({ payrollType: 'Special' })), id: 'sp-2', payoutDate: '2025-11-30', status: 'Posted' };
  assert.equal(applyAction(older, 'reopen', { runs: [older, newer] }).run.status, 'Open');
});

test('a posted or locked transaction cannot be cancelled', () => {
  const posted = { ...compute(makeRun()), status: 'Posted' };
  assert.match(applyAction(posted, 'cancel', { runs: [] }).error, /cannot be cancelled/);
  const open = compute(makeRun());
  assert.equal(applyAction(open, 'cancel', { runs: [] }).run.status, 'Cancelled');
});

test('the action list a status offers matches what the status machine will accept', () => {
  ['Open', 'Draft', 'For Review', 'For Approval', 'Approved', 'Posted'].forEach(status => {
    const run = { ...compute(makeRun()), status };
    actionsFor(run, [run], { canReopen: true })
      .filter(action => !action.disabled && action.key !== 'updateEntry' && action.key !== 'updateTransaction' && action.key !== 'generateBankFile')
      .forEach(action => {
        const outcome = applyAction(run, action.key, { runs: [run], context: contextFor(run) });
        assert.equal(outcome.error, undefined, `${status} offers ${action.key} but the machine refuses it: ${outcome.error}`);
      });
  });
});

test('a locked transaction offers no action at all', () => {
  const locked = { ...compute(makeRun()), status: 'Locked' };
  assert.equal(actionsFor(locked, [locked], { canReopen: true }).length, 0);
});

test('the status tab strip covers every status the machine can reach', () => {
  const statuses = new Set(PAYROLL_STATUS_TABS.filter(tab => tab !== 'All'));
  ['Open', 'Draft', 'For Review', 'For Approval', 'Approved', 'Posted', 'Locked', 'Cancelled'].forEach(status => {
    assert.ok(statuses.has(status), `${status} has a tab`);
  });
});

/* --------------------------------------------------------------- the lock */

test('a record lock is held by one session and released when it leaves', () => {
  const run = acquireLock(compute(makeRun()), 'session-a', 'Ethan Collins');
  assert.equal(lockHeldBy(run, 'session-a'), null, 'the holder is not blocked by their own lock');
  assert.equal(lockHeldBy(run, 'session-b').actor, 'Ethan Collins');
  assert.equal(lockHeldBy(releaseLock(run, 'session-a'), 'session-b'), null);
});

test('a stale lock expires rather than stranding the transaction', () => {
  const run = acquireLock(compute(makeRun()), 'session-a', 'Ethan Collins');
  const later = Date.now() + (LOCK_MINUTES + 1) * 60000;
  assert.equal(lockHeldBy(run, 'session-b', later), null);
});

/* ------------------------------------------------------------- the reports */

test('every report is a catalogue entry with its own columns and builder', () => {
  const run = compute(makeRun());
  const context = contextFor(run);
  assert.ok(payrollReportCatalog.length >= 10);
  payrollReportCatalog.forEach(entry => {
    assert.ok(entry.columns.length > 2, `${entry.key} declares columns`);
    assert.equal(typeof entry.build, 'function');
    assert.ok(entry.group, `${entry.key} belongs to a report group`);
    const rows = entry.build(run.result, context);
    if (rows.length) entry.columns.forEach(column => assert.ok(column.key in rows[0], `${entry.key}.${column.key} exists on a row`));
  });
});

test('every report derives from the computed lines, so an empty run reports nothing', () => {
  const empty = { lines: [], totals: {}, exceptions: [] };
  payrollReportCatalog.forEach(entry => {
    // The journal always publishes its account structure; every other report is
    // purely a projection of the lines.
    if (entry.key === 'journal') return;
    assert.equal(entry.build(empty, {}).length, 0, `${entry.key} is empty without lines`);
  });
});

test('the payroll register reconciles to the run totals', () => {
  const run = compute(makeRun());
  const rows = payrollReport('register').build(run.result, contextFor(run));
  const totals = reportTotals(payrollReport('register'), rows);
  assert.equal(totals.name, 'GRAND TOTAL');
  assert.ok(Math.abs(totals.netPayValue - run.result.totals.netPay) < 0.05);
  assert.ok(Math.abs(totals.grossPayValue - run.result.totals.grossPay) < 0.05);
  assert.equal(totals.employeeCode, '', 'an identity column stays blank in the total row');
});

test('the statutory schedule reconciles to the run totals', () => {
  const run = compute(makeRun());
  const rows = payrollReport('statutory').build(run.result, contextFor(run));
  const totals = reportTotals(payrollReport('statutory'), rows);
  const employee = totals.sssEeValue + totals.phicEeValue + totals.hdmfEeValue;
  assert.ok(Math.abs(employee - run.result.totals.statutoryEmployee) < 0.05);
});

test('an unknown report key falls back to the first catalogue entry rather than crashing', () => {
  assert.equal(payrollReport('does-not-exist').key, payrollReportCatalog[0].key);
});

/* -------------------------------------------------- the statutory table lock */

test('a payroll run consuming a statutory version locks that version', () => {
  const data = readStatutoryData();
  const version = effectiveVersion('sss', '2025-11-30', data);
  assert.equal(versionUsage('sss', version, data).used, false, 'nothing has used it yet');

  savePayrollRun(COMPANY, { ...compute(makeRun()), status: 'Posted' });
  const usage = versionUsage('sss', version, data);
  assert.equal(usage.used, true, 'the posted run holds the version');
  assert.match(usage.transactions[0], /PR-2025-11-001 \(Posted\)/);
});

test('an open run already counts as using the version, and cancelling releases it', () => {
  const data = readStatutoryData();
  const version = effectiveVersion('tax', '2025-11-30', data);
  const run = compute(makeRun());
  savePayrollRun(COMPANY, run);
  assert.equal(versionUsage('tax', version, data).used, true, 'an open run counts as used');

  savePayrollRun(COMPANY, { ...run, status: 'Cancelled' });
  assert.equal(versionUsage('tax', version, data).used, false, 'a cancelled run releases the lock');
});

test('a run dated in another year does not lock this year version', () => {
  const data = readStatutoryData();
  const thisYear = effectiveVersion('sss', '2025-11-30', data);
  savePayrollRun(COMPANY, { ...compute(makeRun()), payoutDate: '2024-11-30', status: 'Posted' });
  assert.equal(versionUsage('sss', thisYear, data).used, false);
  assert.equal(versionUsage('sss', effectiveVersion('sss', '2024-11-30', data), data).used, true);
});

/* ------------------------------------------------------------ the context */

test('the context is assembled from the modules that own each dependency', () => {
  const run = makeRun();
  const context = buildPayrollContext({ companyId: COMPANY, run, hrmData, registers: {}, hierarchy: [], policies: {} });
  assert.equal(context.employees, employeeRoster, 'Core supplies the roster');
  assert.equal(context.salaryInformation, hrmData.salaryInformation, 'HRM supplies salary information');
  assert.equal(context.timeLogs, hrmData.timeLogs, 'Timekeeping supplies the punch record');
  assert.equal(context.loanSchedules, hrmData.loanInquiries, 'HRM supplies the loan schedules');
  assert.ok(context.statutory.sss, 'Settings supplies the effective statutory version');
  assert.ok(context.computations.length > 0, 'the Computational Basis library is available');
});

test('the context resolves the statutory version by the run payout date', () => {
  const older = buildPayrollContext({ companyId: COMPANY, run: makeRun({ payoutDate: '2023-06-30' }), hrmData });
  const newer = buildPayrollContext({ companyId: COMPANY, run: makeRun({ payoutDate: '2025-11-30' }), hrmData });
  assert.notEqual(older.statutory.philhealth.id, newer.statutory.philhealth.id);
  assert.equal(older.statutory.philhealth.code, 'PHIC-2023-001');
});
