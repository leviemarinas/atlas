/**
 * The Leave Planner (BRD HT116 and HT117).
 *
 * A planner is a draft, not an application: pencilling in a date books
 * nothing, needs no approver and — deliberately — never touches a leave
 * balance.  Its whole job is to surface intended absences early enough for a
 * team to plan around them, so an approver sees their reports' plans on the
 * same calendar as their own.
 *
 * Leave that has actually been filed is drawn alongside the drafts, because a
 * planner that hides real applications would have people planning over dates
 * that are already committed.
 */

import { useMemo, useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { LEAVE_TYPES, findEmployee } from './hrmData.js';
import { REQUEST_STATUSES, REQUEST_TYPES } from './requestWorkflow.js';
import { downloadFile } from './fileDownload.js';
import {
  ExportMenu,
  Field,
  GhostButton,
  Modal,
  PageHeading,
  PrimaryButton,
  formatLongDate,
  shortStatus,
} from './HRMKit.jsx';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const toCsv = (headers, rows) => [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

/** Six weeks of cells so every month lays out on the same grid. */
function monthMatrix(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return { iso: day.toISOString().slice(0, 10), day: day.getUTCDate(), inMonth: day.getUTCMonth() === month };
  });
}

export function LeavePlannerWorkspace({ data, setData, requests = [], user, access, onBack, onNotify }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  });
  const [openDay, setOpenDay] = useState('');
  const [draft, setDraft] = useState({ leaveType: LEAVE_TYPES[0], note: '' });

  // An approver plans across their team; everyone else plans for themselves.
  const visibleIds = useMemo(() => {
    const ids = new Set([user.employeeId]);
    if (access?.canApproveTeamRequests) {
      (data.employees || [])
        .filter(row => row.managerId === user.employeeId)
        .forEach(row => ids.add(row.employeeId));
    }
    return ids;
  }, [data.employees, user.employeeId, access?.canApproveTeamRequests]);

  const plans = useMemo(
    () => (data.leavePlans || []).filter(plan => visibleIds.has(plan.employeeId)),
    [data.leavePlans, visibleIds],
  );

  const filed = useMemo(() => requests
    .filter(request => request.requestType === REQUEST_TYPES.LEAVE && visibleIds.has(request.employeeId))
    .filter(request => request.status !== REQUEST_STATUSES.REJECTED)
    .map(request => ({
      employeeId: request.employeeId,
      from: request.requestDetails?.leaveStart || '',
      to: request.requestDetails?.leaveEnd || request.requestDetails?.leaveStart || '',
      leaveType: request.requestDetails?.leaveType || '',
      status: request.status,
    }))
    .filter(row => row.from), [requests, visibleIds]);

  const cells = monthMatrix(cursor.year, cursor.month);
  const monthName = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(cursor.year, cursor.month, 1)));

  function shift(delta) {
    setCursor(current => {
      const next = new Date(Date.UTC(current.year, current.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
  }

  const plansOn = iso => plans.filter(plan => plan.date === iso);
  const filedOn = iso => filed.filter(row => iso >= row.from && iso <= row.to);
  const nameOf = employeeId => findEmployee(data, employeeId)?.name || employeeId;

  function addPlan() {
    const plan = {
      planId: `lvp-${user.employeeId}-${openDay}-${Date.now()}`,
      employeeId: user.employeeId,
      date: openDay,
      leaveType: draft.leaveType,
      note: draft.note,
    };
    setData(current => ({ ...current, leavePlans: [...(current.leavePlans || []), plan] }));
    onNotify('Planned leave saved successfully!');
    setDraft({ leaveType: LEAVE_TYPES[0], note: '' });
  }

  function removePlan(planId) {
    setData(current => ({ ...current, leavePlans: (current.leavePlans || []).filter(plan => plan.planId !== planId) }));
    onNotify('Planned leave removed.');
  }

  function exportPlans(format) {
    const headers = ['Employee', 'Date', 'Leave Type', 'Note'];
    const rows = plans
      .slice()
      .sort((left, right) => left.date.localeCompare(right.date))
      .map(plan => [nameOf(plan.employeeId), plan.date, plan.leaveType, plan.note]);
    downloadFile(`leave-planner.${format === 'PDF' ? 'txt' : 'csv'}`, toCsv(headers, rows));
    onNotify(`Leave planner exported to ${format}.`);
  }

  const dayPlans = openDay ? plansOn(openDay) : [];
  const dayFiled = openDay ? filedOn(openDay) : [];
  const closeDay = () => { setOpenDay(''); setDraft({ leaveType: LEAVE_TYPES[0], note: '' }); };

  return <div className="hrm-workspace">
    <PageHeading
      title="Leave Planner"
      onBack={onBack}
      actions={<ExportMenu disabled={plans.length === 0} onExport={exportPlans} />}
    />
    <p className="hrm-ss-placeholder">
      Planned leave is a draft only. It needs no approval and does not affect leave balances —
      file a Leave Application once the date is confirmed.
    </p>
    <div className="hrm-calendar-bar">
      <div className="hrm-calendar-nav">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month"><CaretLeft size={15} weight="bold" /></button>
        <button type="button" onClick={() => shift(1)} aria-label="Next month"><CaretRight size={15} weight="bold" /></button>
        <strong>{monthName}</strong>
      </div>
    </div>
    <div className="hrm-calendar" role="grid" aria-label={`Leave planner for ${monthName}`}>
      {WEEKDAYS.map(day => <div key={day} className="hrm-calendar-weekday">{day}</div>)}
      {cells.map(cell => <div key={cell.iso} className={`hrm-calendar-cell ${cell.inMonth ? '' : 'muted'}`} role="gridcell">
        <button type="button" className="hrm-calendar-date" onClick={() => setOpenDay(cell.iso)}>{String(cell.day).padStart(2, '0')}</button>
        {filedOn(cell.iso).slice(0, 2).map((row, index) => <span key={`filed-${index}`} className="hrm-calendar-event accent-red">
          {nameOf(row.employeeId)} · {row.leaveType} (filed)
        </span>)}
        {plansOn(cell.iso).slice(0, 2).map(plan => <span key={plan.planId} className="hrm-calendar-event accent-violet">
          {nameOf(plan.employeeId)} · {plan.leaveType}
        </span>)}
      </div>)}
    </div>

    {openDay && <Modal
      title={`Plan leave — ${formatLongDate(openDay)}`}
      onClose={closeDay}
      footer={<>
        <GhostButton onClick={closeDay}>Close</GhostButton>
        <PrimaryButton icon={false} onClick={addPlan}>Add to planner</PrimaryButton>
      </>}
    >
      {dayFiled.length > 0 && <>
        <h4 className="hrm-form-section-title">Already filed on this date</h4>
        <ul className="hrm-file-list readonly">
          {dayFiled.map((row, index) => <li key={`filed-${index}`}>
            <span className="hrm-file-name">{nameOf(row.employeeId)} · {row.leaveType}</span>
            <span className="hrm-file-size">{shortStatus(row.status)}</span>
          </li>)}
        </ul>
      </>}
      {dayPlans.length > 0 && <>
        <h4 className="hrm-form-section-title">Planned</h4>
        <ul className="hrm-file-list">
          {dayPlans.map(plan => <li key={plan.planId}>
            <span className="hrm-file-name">{nameOf(plan.employeeId)} · {plan.leaveType}{plan.note ? ` — ${plan.note}` : ''}</span>
            {plan.employeeId === user.employeeId && <button type="button" className="hrm-btn tiny outline" onClick={() => removePlan(plan.planId)}>Remove</button>}
          </li>)}
        </ul>
      </>}
      <h4 className="hrm-form-section-title">Add planned leave</h4>
      <div className="hrm-form-grid">
        <Field label="Leave Type">
          <select value={draft.leaveType} onChange={event => setDraft(current => ({ ...current, leaveType: event.target.value }))}>
            {LEAVE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </Field>
        <Field label="Note">
          <input type="text" value={draft.note} onChange={event => setDraft(current => ({ ...current, note: event.target.value }))} placeholder="Optional" />
        </Field>
      </div>
    </Modal>}
  </div>;
}
