/**
 * Payroll dashboard (HTP324), Tasks for the Day (HTP321), Issues/Notes
 * (HTP325) and the payroll calculator (HTP316).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { addPayrollNote, calculatePay, dashboardKpis, payrollTasks, reopenPayrollNote, resolvePayrollNote } from '../src/payrollDashboard.js';
import { effectiveStatutorySet } from '../src/statutoryService.js';

const run = (id, status, extra = {}) => ({ id, transactionNumber: id, status, payoutDate: '2026-09-30', result: { totals: { netPay: 1000, headcount: 5 }, exceptions: [] }, ...extra });

test('KPIs count what is in flight, what is blocked and what was paid this month', () => {
  const kpis = dashboardKpis([
    run('A', 'Open', { result: { totals: { netPay: 0, headcount: 0 }, exceptions: [{ severity: 'Error' }, { severity: 'Info' }] } }),
    run('B', 'For Approval'),
    run('C', 'Posted', { payoutDate: '2026-09-15' }),
    run('D', 'Locked', { payoutDate: '2026-08-31' }),
  ], '2026-09-28');
  assert.equal(kpis.inFlight, 2);
  assert.equal(kpis.awaitingDecision, 1);
  assert.equal(kpis.blocking, 1);
  assert.equal(kpis.postedThisMonth, 1);
  assert.equal(kpis.lastPosted.transactionNumber, 'C');
});

test('tasks put blocking errors and backdating first, then next steps and deadlines', () => {
  const tasks = payrollTasks({
    runs: [
      run('OPEN', 'Open', { backdated: { approval: { status: 'Pending' } } }),
      run('APPROVE', 'For Approval'),
      run('ERR', 'Draft', { result: { totals: {}, exceptions: [{ severity: 'Error' }] } }),
      run('LOCK', 'Posted', { lockDate: '2026-09-29' }),
    ],
    calendars: [
      { id: 'c1', calendarCode: 'CAL-OCT1', calendarType: 'Payout', status: 'Active', month: 'October', frequency: 'First Half', processDate: '2026-10-01', payoutDate: '2026-10-15' },
      { id: 'c2', calendarCode: 'BIR-SEP', calendarType: 'Statutory', status: 'Active', processDate: '2026-09-20' },
      { id: 'c3', calendarCode: 'OLD', calendarType: 'Payout', status: 'Active', processDate: '2025-01-01' },
    ],
    today: '2026-09-28',
    isPaAdmin: true,
  });
  assert.equal(tasks[0].priority, 1);
  assert.ok(tasks.some(task => /Approve or reject the backdating of OPEN/.test(task.text)));
  assert.ok(tasks.some(task => /Resolve 1 blocking payroll error on ERR/.test(task.text)));
  assert.ok(tasks.some(task => /Approve the payroll — APPROVE/.test(task.text)));
  assert.ok(tasks.some(task => /Lock LOCK/.test(task.text)));
  assert.ok(tasks.some(task => /CAL-OCT1/.test(task.text) && /due in 3 days/.test(task.text)));
  assert.ok(tasks.some(task => /BIR-SEP/.test(task.text) && task.overdue));
  assert.ok(!tasks.some(task => /OLD/.test(task.text)), 'a deadline missed long ago is not a task for today');
});

test('an issue stays open until resolved and records who resolved it', () => {
  const { notes, note } = addPayrollNote([], { kind: 'Issue', text: 'Missing October punches', transactionNumber: 'PR-1', actor: 'John Doe (Client Admin)' });
  assert.equal(note.status, 'Open');
  assert.match(addPayrollNote(notes, { text: '  ', actor: 'x' }).error, /Write/);
  const resolved = resolvePayrollNote(notes, note.id, { actor: 'John Doe (P&A Admin)' });
  assert.equal(resolved[0].status, 'Resolved');
  assert.equal(resolved[0].resolvedBy, 'John Doe (P&A Admin)');
  assert.equal(reopenPayrollNote(resolved, note.id)[0].status, 'Open');
  assert.equal(addPayrollNote([], { kind: 'Note', text: 'FYI', actor: 'x' }).note.status, 'Noted');
});

test('the calculator estimates one period against the effective tables', () => {
  const statutory = effectiveStatutorySet('2026-09-28');
  const semi = calculatePay({ monthlyBasic: 30000, frequency: 'Semi-monthly', nonTaxableAllowances: 2000 }, statutory);
  assert.equal(semi.basic, 15000);
  assert.equal(semi.nonTaxableAllowance, 1000);
  assert.ok(semi.statutoryEe > 0);
  assert.equal(semi.netPay, Math.round((semi.gross - semi.statutoryEe - semi.tax) * 100) / 100);
  const mwe = calculatePay({ monthlyBasic: 18000, frequency: 'Monthly', minimumWage: true }, statutory);
  assert.equal(mwe.tax, 0);
});
