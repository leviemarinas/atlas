import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle,
  Clock,
  Eye,
  GitPullRequest,
  MagnifyingGlass,
  ShieldCheck,
  Warning,
  X,
} from '@phosphor-icons/react';
import { employeeDirectory } from './PolicyApplicability';
import { readActiveCompany, readActiveCompanyId } from './companyRepository';
import { plural } from './textFormat';
import { useRole } from './RoleContext';
import {
  actorHasPermission,
  REQUEST_PERMISSIONS,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  resolveEffectiveCorrection,
} from './requestWorkflow';
import {
  approveRequest,
  isActorAuthorizedForDecision,
  readRequests,
  rejectRequest,
  retryRequestOutbox,
  submitRequest,
} from './requestService';

const punchSeeds = [
  { punchId: 'TP-2026-08-14-E-1042', employeeId: 'E-1042', workDate: '2026-08-14', schedule: '08:00–17:00', clockIn: '08:27', clockOut: '17:02', source: 'Atlas Time', capturedAt: '2026-08-14T17:02:00.000Z', punchStatus: 'Complete' },
  { punchId: 'TP-2026-08-15-E-2288', employeeId: 'E-2288', workDate: '2026-08-15', schedule: '08:00–17:00', clockIn: '08:00', clockOut: '', source: 'Atlas Time', capturedAt: '2026-08-15T08:00:00.000Z', punchStatus: 'Missing clock-out' },
  { punchId: 'TP-2026-08-14-E-3391', employeeId: 'E-3391', workDate: '2026-08-14', schedule: '09:00–18:00', clockIn: '', clockOut: '18:04', source: 'Atlas Time', capturedAt: '2026-08-14T18:04:00.000Z', punchStatus: 'Missing clock-in' },
  { punchId: 'TP-2026-08-13-E-4417', employeeId: 'E-4417', workDate: '2026-08-13', schedule: '08:00–17:00', clockIn: '08:18', clockOut: '17:00', source: 'Atlas Time', capturedAt: '2026-08-13T17:00:00.000Z', punchStatus: 'Complete' },
  { punchId: 'TP-2026-08-12-E-5502', employeeId: 'E-5502', workDate: '2026-08-12', schedule: '08:00–17:00', clockIn: '08:00', clockOut: '16:32', source: 'Atlas Time', capturedAt: '2026-08-12T16:32:00.000Z', punchStatus: 'Complete' },
  { punchId: 'TP-2026-08-11-E-6613', employeeId: 'E-6613', workDate: '2026-08-11', schedule: '10:00–19:00', clockIn: '10:00', clockOut: '18:41', source: 'Atlas Time', capturedAt: '2026-08-11T18:41:00.000Z', punchStatus: 'Complete' },
];

function requestPunches(companyId) {
  return punchSeeds.map(punch => {
    const employee = employeeDirectory.find(item => item.code === punch.employeeId) || {};
    return {
      ...punch,
      companyId,
      employeeCode: employee.code || punch.employeeId,
      employeeName: employee.name || punch.employeeId,
      department: employee.department || '',
    };
  });
}

function newForm(punches) {
  const first = punches[0];
  return {
    punchId: first?.punchId || '',
    requestedClockIn: '',
    requestedClockOut: '',
    remarks: '',
    idempotencyKey: `time-correction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

function statusClass(value) {
  return String(value || '').toLowerCase().replaceAll(' ', '-');
}

function formatDateTime(value) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '—';
}

const roleActors = Object.freeze({
  // Client Admin intentionally uses the on-behalf path for any directory
  // employee. The service still enforces this permission and records it.
  client: Object.freeze({ actorId: 'client-admin-001', displayName: 'Client Admin', role: 'Client Admin', permissions: [REQUEST_PERMISSIONS.SUBMIT, REQUEST_PERMISSIONS.SUBMIT_ON_BEHALF] }),
  admin: Object.freeze({ actorId: 'manager-001', displayName: 'Maria Santos', role: 'Manager', permissions: [REQUEST_PERMISSIONS.APPROVE, REQUEST_PERMISSIONS.REJECT] }),
});

function actorForRole(role) {
  return roleActors[role] || roleActors.client;
}

function PunchSummary({ punch }) {
  if (!punch) return <div className="request-empty-note"><Warning /> No original time punch is available for the selected company.</div>;
  return <div className="request-punch-summary">
    <div><small>Employee</small><strong>{punch.employeeName}</strong><span>{punch.employeeCode} · {punch.department || '—'}</span></div>
    <div><small>Work date</small><strong>{punch.workDate}</strong><span>{punch.schedule}</span></div>
    <div><small>Original clock-in</small><strong>{punch.clockIn || 'Missing'}</strong><span>{punch.source}</span></div>
    <div><small>Original clock-out</small><strong>{punch.clockOut || 'Missing'}</strong><span>{punch.punchStatus}</span></div>
  </div>;
}

function RequestForm({ company, companyId, punches, onSubmitted, notify, actor }) {
  const [form, setForm] = useState(() => newForm(punches));
  const selectedPunch = punches.find(punch => punch.punchId === form.punchId);
  useEffect(() => { setForm(newForm(punches)); }, [punches, companyId]);
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));

  const submit = event => {
    event.preventDefault();
    if (!selectedPunch) return notify({ type: 'error', message: 'Select an original time punch before submitting.' });
    const employee = employeeDirectory.find(item => item.code === selectedPunch.employeeId) || { code: selectedPunch.employeeId, name: selectedPunch.employeeName };
    try {
      const result = submitRequest({
        requestType: REQUEST_TYPES.TIME_IN_OUT_CORRECTION,
        companyId,
        company,
        employeeId: employee.code,
        employee,
        workDate: selectedPunch.workDate,
        originalPunchSnapshot: { ...selectedPunch },
        requestedCorrection: { clockIn: form.requestedClockIn, clockOut: form.requestedClockOut },
        requesterRemarks: form.remarks,
        onBehalfOf: {
          employeeId: employee.code,
          employeeCode: employee.code,
          employeeName: employee.name,
          rationale: 'Client Admin submitted the correction from the employee directory.',
        },
        onBehalfReason: 'Client Admin submitted the correction from the employee directory.',
        idempotencyKey: form.idempotencyKey,
      }, {
        companyId,
        activeCompanyId: companyId,
        actor,
        authoritativePunchResolver: ({ punchId }) => punches.find(punch => punch.punchId === punchId),
      });
      onSubmitted(result.request);
      notify({ type: 'success', message: `${result.request.requestId} submitted for approval.${result.pendingSideEffects?.length ? ' Audit and notification delivery is pending retry.' : ''}` });
    } catch (error) {
      notify({ type: 'error', message: error.message || 'The request could not be submitted.' });
    }
  };

  return <section className="canonical-card request-form-card">
    <div className="canonical-card-header"><div><h2>New Time In / Time Out Correction</h2><p>Submit a correction against an immutable source punch. The original snapshot is retained when the requested values are approved.</p></div><Clock weight="duotone" /></div>
    <form onSubmit={submit}>
      <div className="canonical-form-grid">
        <label>Request type<span className="form-readonly">HRM / {REQUEST_TYPES.TIME_IN_OUT_CORRECTION}</span></label>
        <label>Original time punch<span className="required">*</span><select required value={form.punchId} onChange={event => update('punchId', event.target.value)}><option value="">Choose a punch</option>{punches.map(punch => <option key={punch.punchId} value={punch.punchId}>{punch.workDate} · {punch.employeeName} · {punch.punchStatus}</option>)}</select></label>
        <label>Employee<span className="form-readonly">{selectedPunch ? `${selectedPunch.employeeName} · ${selectedPunch.employeeCode}` : 'Select an original punch'}</span></label>
        <label>Work date<span className="form-readonly">{selectedPunch?.workDate || '—'}</span></label>
      </div>
      <PunchSummary punch={selectedPunch} />
      <div className="canonical-form-grid request-correction-grid">
        <label>Requested clock-in <small>Leave blank when the clock-in should remain unchanged.</small><input type="time" value={form.requestedClockIn} onChange={event => update('requestedClockIn', event.target.value)} /></label>
        <label>Requested clock-out <small>Leave blank when the clock-out should remain unchanged.</small><input type="time" value={form.requestedClockOut} onChange={event => update('requestedClockOut', event.target.value)} /></label>
        <label className="wide">Requester remarks<span className="required">*</span><textarea required value={form.remarks} onChange={event => update('remarks', event.target.value)} placeholder="Explain the correction and supporting context." /></label>
      </div>
      <div className="canonical-callout"><ShieldCheck /><span>{actor.role === 'Client Admin' ? 'Client Admin submissions are filed on behalf of the selected employee and retain the acting-for rationale. ' : ''}Submission key <code>{form.idempotencyKey}</code> makes retries safe. This prototype persists locally; it does not claim a production backend or timekeeping write-back.</span></div>
      <div className="canonical-actions"><button type="submit" className="button primary" disabled={!selectedPunch || !actorHasPermission(actor, REQUEST_PERMISSIONS.SUBMIT)}><GitPullRequest /> Submit request</button></div>
    </form>
  </section>;
}

function PunchDetail({ title, punch, effective }) {
  return <section className="request-detail-section"><h3>{title}</h3><div className="request-detail-grid">
    <div><small>Work date</small><strong>{punch?.workDate || '—'}</strong></div>
    <div><small>Source / punch ID</small><strong>{punch?.source || '—'} · {punch?.punchId || '—'}</strong></div>
    <div><small>{effective ? 'Effective clock-in' : 'Clock-in'}</small><strong>{effective ? (effective.clockIn || 'Missing') : (punch?.clockIn || 'Missing')}</strong></div>
    <div><small>{effective ? 'Effective clock-out' : 'Clock-out'}</small><strong>{effective ? (effective.clockOut || 'Missing') : (punch?.clockOut || 'Missing')}</strong></div>
    <div><small>Schedule</small><strong>{punch?.schedule || '—'}</strong></div>
    <div><small>Captured at</small><strong>{formatDateTime(punch?.capturedAt)}</strong></div>
  </div></section>;
}

function focusableElements(container) {
  return [...container.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter(element => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}

function RequestDetail({ request, onClose, onChanged, onConflict, notify, actor, companyId }) {
  const [decisionRemarks, setDecisionRemarks] = useState('');
  const [showReject, setShowReject] = useState(false);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    if (!request) return undefined;
    restoreFocusRef.current = document.activeElement;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const dialog = dialogRef.current;
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const elements = focusableElements(dialog);
      if (!elements.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      dialog?.removeEventListener('keydown', handleKeyDown);
      const previous = restoreFocusRef.current;
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus();
    };
  }, [request?.requestId]);

  if (!request) return null;
  const approveAllowed = request.status === REQUEST_STATUSES.PENDING_APPROVAL && isActorAuthorizedForDecision(request, actor, REQUEST_PERMISSIONS.APPROVE);
  const rejectAllowed = request.status === REQUEST_STATUSES.PENDING_APPROVAL && isActorAuthorizedForDecision(request, actor, REQUEST_PERMISSIONS.REJECT);
  const canDecide = approveAllowed || rejectAllowed;
  const pendingSideEffects = (request.outbox || []).filter(entry => entry.status === 'Pending');
  const decide = action => {
    if (action === 'reject' && !decisionRemarks.trim()) return notify({ type: 'error', message: 'A rejection remark is required.' });
    try {
      const result = action === 'approve'
        ? approveRequest(request.requestId, { companyId, activeCompanyId: companyId, actor, expectedVersion: request.version, idempotencyKey: `${request.requestId}-approve-v${request.version}` })
        : rejectRequest(request.requestId, { companyId, activeCompanyId: companyId, actor, expectedVersion: request.version, decisionRemarks, idempotencyKey: `${request.requestId}-reject-v${request.version}` });
      onChanged(result.request);
      setShowReject(false);
      setDecisionRemarks('');
      notify({ type: 'success', message: `${result.request.requestId} ${action === 'approve' ? 'approved' : 'rejected'}.${result.pendingSideEffects?.length ? ' Audit and notification delivery is pending retry.' : ''}` });
    } catch (error) {
      if (error.code === 'REQUEST_VERSION_CONFLICT') onConflict?.(error);
      notify({ type: 'error', message: error.message || `The request could not be ${action}d.` });
    }
  };
  const retrySideEffects = () => {
    try {
      const result = retryRequestOutbox(request.requestId, { companyId, activeCompanyId: companyId });
      onChanged(result.request);
      notify({ type: 'success', message: result.pendingSideEffects?.length ? 'Some side effects remain pending; retry can be attempted again.' : 'Pending audit and notification delivery flushed.' });
    } catch (error) {
      notify({ type: 'error', message: error.message || 'Pending delivery could not be retried.' });
    }
  };

  return <div className="drawer-backdrop view-drawer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={dialogRef} className="record-drawer request-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="request-detail-title" tabIndex="-1">
      <header><div><p>HRM request detail</p><h2 id="request-detail-title">{request.requestId}</h2><span className={`status-pill ${statusClass(request.status)}`}>{request.status}</span></div><button type="button" ref={closeButtonRef} className="icon-button" onClick={onClose} aria-label="Close request detail"><X /></button></header>
      <div className="record-drawer-body">
        <section><h3>{request.requestTypeLabel}</h3><div className="detail-grid"><div><strong>Company</strong><span>{request.company?.companyCode || request.companyId}</span></div><div><strong>Employee</strong><span>{request.employee?.name || request.employeeId}<small>{request.employeeId}</small></span></div><div><strong>Requester / filed by</strong><span>{request.requester?.displayName || request.filedBy?.displayName || '—'}<small>{request.requester?.actorId || request.filedBy?.actorId || '—'}</small></span></div><div><strong>Assigned approver</strong><span>{request.assignedApprover?.displayName || request.approvalSteps?.[0]?.assignedTo || '—'}</span></div><div><strong>Submitted</strong><span>{formatDateTime(request.submittedAt)}</span></div><div><strong>Version</strong><span>{request.version}</span></div></div></section>
        <PunchDetail title="Immutable original punch snapshot" punch={request.originalPunchSnapshot} />
        <PunchDetail title="Effective requested correction" punch={request.originalPunchSnapshot} effective={request.effectiveCorrection || resolveEffectiveCorrection(request.originalPunchSnapshot, request.requestedCorrection)} />
        <section className="request-detail-section"><h3>Remarks</h3><div className="request-remarks-stack"><div><small>Requester remarks</small><p className="request-remarks">{request.requesterRemarks || request.remarks || '—'}</p></div><div><small>Decision remarks</small><p className="request-remarks">{request.decisionRemarks || '—'}</p></div></div></section>
        <section className="request-detail-section"><h3>Approval steps and history</h3><div className="request-history">{request.approvalSteps?.map(step => <div className="request-history-row" key={step.stepId}><span className={`status-dot ${statusClass(step.status)}`} /><div><strong>{step.role} approval · {step.status}</strong><small>{step.actor || 'Awaiting approver'}{step.actedAt ? ` · ${formatDateTime(step.actedAt)}` : ''}{step.remarks ? ` · ${step.remarks}` : ''}</small></div></div>)}{request.approvalHistory?.map(entry => <div className="request-history-row" key={entry.historyId}><span className="status-dot history" /><div><strong>{entry.action}</strong><small>{entry.actor} · {formatDateTime(entry.at)}{entry.remarks ? ` · ${entry.remarks}` : ''}</small></div></div>)}</div></section>
        <section className="request-detail-section"><h3>Server-ready metadata</h3><div className="detail-grid"><div><strong>Idempotency key</strong><span><code>{request.idempotencyKey || '—'}</code></span></div><div><strong>Created / updated</strong><span>{formatDateTime(request.createdAt)} · {formatDateTime(request.updatedAt)}</span></div><div><strong>Filed by</strong><span>{request.filedBy?.displayName || '—'}<small>{request.filedBy?.actorId || '—'}</small></span></div><div><strong>On behalf of</strong><span>{request.onBehalfOf?.employeeName || request.onBehalfOf?.employeeId || 'Not recorded'}</span></div><div><strong>Delegation</strong><span>{request.delegationMetadata?.delegatedTo || 'Not recorded'}</span></div><div><strong>Override</strong><span>{request.overrideMetadata?.overrideRequested ? 'Requested' : 'Not recorded'}</span></div></div></section>
        {pendingSideEffects.length > 0 && <div className="canonical-callout warning"><Warning /><span>{pendingSideEffects.length} audit/notification side effect{pendingSideEffects.length === 1 ? '' : 's'} pending delivery. Local prototype storage cannot atomically commit request and delivery state.</span><button type="button" className="button tiny secondary" onClick={retrySideEffects}>Retry delivery</button></div>}
        {request.status === REQUEST_STATUSES.PENDING_APPROVAL && !canDecide && <div className="canonical-callout"><ShieldCheck /><span>Approval actions are unavailable for the current actor. The assigned manager must decide this request; self-approval is blocked.</span></div>}
        {showReject && <section className="request-reject-box"><label>Decision remarks for rejection<span className="required">*</span><textarea autoFocus value={decisionRemarks} onChange={event => setDecisionRemarks(event.target.value)} placeholder="Explain why this correction is rejected." /></label><div className="canonical-actions"><button type="button" className="button secondary" onClick={() => setShowReject(false)}>Cancel</button>{rejectAllowed && <button type="button" className="button danger" onClick={() => decide('reject')}><X /> Reject request</button>}</div></section>}
      </div>
      <footer><button type="button" className="button secondary" onClick={onClose}>Close</button>{canDecide && !showReject && <>{rejectAllowed && <button type="button" className="button secondary" onClick={() => setShowReject(true)}><X /> Reject</button>}{approveAllowed && <button type="button" className="button primary" onClick={() => decide('approve')}><Check /> Approve</button>}</>}</footer>
    </aside>
  </div>;
}

function RequestTable({ requests, onOpen, emptyCopy }) {
  return <div className="table-card request-table-card"><table><thead><tr><th>Request</th><th>Employee</th><th>Original punch</th><th>Effective requested</th><th>Status</th><th>Updated</th><th>Action</th></tr></thead><tbody>{requests.length ? requests.map(request => { const effective = request.effectiveCorrection || resolveEffectiveCorrection(request.originalPunchSnapshot, request.requestedCorrection); return <tr key={request.requestId}><td><code>{request.requestId}</code><small>{request.requestTypeLabel}</small></td><td><strong>{request.employee?.name || request.employeeId}</strong><small>{request.employeeId} · {request.workDate}</small></td><td>{request.originalPunchSnapshot?.clockIn || 'Missing'} → {request.originalPunchSnapshot?.clockOut || 'Missing'}</td><td>{effective.clockIn || 'Missing'} → {effective.clockOut || 'Missing'}</td><td><span className={`status-pill ${statusClass(request.status)}`}>{request.status}</span></td><td>{formatDateTime(request.updatedAt)}</td><td><button type="button" className="icon-button" onClick={() => onOpen(request)} aria-label={`Open ${request.requestId}`}><Eye /></button></td></tr>; }) : <tr><td colSpan="7"><div className="empty-state"><GitPullRequest /><h3>{emptyCopy}</h3><p>Requests remain company-scoped and appear here after persistence.</p></div></td></tr>}</tbody></table></div>;
}

export function TimeCorrectionWorkspace({ onBack, notify = () => {}, companyId: providedCompanyId, company: providedCompany }) {
  const { role } = useRole();
  const initialCompanyId = providedCompanyId || readActiveCompanyId();
  const companyId = providedCompanyId || readActiveCompanyId();
  const company = providedCompany || readActiveCompany();
  const [punches, setPunches] = useState(() => requestPunches(initialCompanyId));
  const [requests, setRequests] = useState(() => readRequests(initialCompanyId, { activeCompanyId: initialCompanyId }));
  const [tab, setTab] = useState('requests');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  // App owns the active company. Rehydrate every company-scoped collection and
  // close a detail from the previous tenant whenever that prop changes.
  useEffect(() => {
    setPunches(requestPunches(companyId));
    setRequests(readRequests(companyId, { activeCompanyId: companyId }));
    setSelected(null);
    setQuery('');
    setTab('requests');
  }, [companyId, providedCompany?.companyId]);

  const refresh = () => {
    const refreshed = readRequests(companyId, { activeCompanyId: companyId });
    setRequests(refreshed);
    setSelected(current => current ? (refreshed.find(request => request.requestId === current.requestId) || null) : current);
    return refreshed;
  };
  const visible = useMemo(() => requests.filter(request => [request.requestId, request.employee?.name, request.employeeId, request.status, request.workDate].join(' ').toLowerCase().includes(query.toLowerCase())), [requests, query]);
  const pending = useMemo(() => visible.filter(request => request.status === REQUEST_STATUSES.PENDING_APPROVAL), [visible]);
  const counts = {
    total: requests.length,
    pending: requests.filter(request => request.status === REQUEST_STATUSES.PENDING_APPROVAL).length,
    approved: requests.filter(request => request.status === REQUEST_STATUSES.APPROVED).length,
    rejected: requests.filter(request => request.status === REQUEST_STATUSES.REJECTED).length,
  };
  const onSubmitted = request => { const refreshed = refresh(); setSelected(refreshed.find(item => item.requestId === request.requestId) || request); setTab('requests'); };
  const onChanged = request => { const refreshed = refresh(); setSelected(refreshed.find(item => item.requestId === request.requestId) || request); };
  const onConflict = () => { refresh(); };
  const actor = actorForRole(role);

  return <div className="page-content operational-workspace request-workspace">
    <button type="button" className="inline-back" onClick={onBack}><ArrowLeft /> Back</button>
    <div className="page-heading"><div><p className="breadcrumb">Company Configuration / HRM / Requests</p><h1>Employee Requests</h1><p className="page-description">One company-scoped request workflow for HRM. This vertical slice covers Time In / Time Out Correction with immutable source punches, approval history, and retry-safe actions.</p></div><span className="controlled-badge"><ShieldCheck /> Company-scoped request service</span></div>
    <div className="request-summary"><div><strong>{counts.total}</strong><span>{plural(counts.total, 'request')} in scope</span></div><div><strong>{counts.pending}</strong><span>{plural(counts.pending, 'request')} pending approval</span></div><div><strong>{counts.approved}</strong><span>{plural(counts.approved, 'request')} approved</span></div><div><strong>{counts.rejected}</strong><span>{plural(counts.rejected, 'request')} rejected</span></div></div>
    <div className="tabs request-tabs"><button type="button" className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}><GitPullRequest /> Employee requests <span>{counts.total}</span></button><button type="button" className={tab === 'approvals' ? 'active' : ''} onClick={() => setTab('approvals')}><CheckCircle /> Manage approvals <span>{counts.pending}</span></button></div>
    {tab === 'requests' && <><RequestForm company={company} companyId={companyId} punches={punches} onSubmitted={onSubmitted} notify={notify} actor={actor} /><section className="canonical-card request-list-card"><div className="canonical-card-header"><div><h2>Employee request list</h2><p>Search submitted, approved, and rejected requests for the active company.</p></div><div className="search-box request-search"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search request, employee or status..." /><MagnifyingGlass /></div></div><RequestTable requests={visible} onOpen={setSelected} emptyCopy="No employee requests" /></section></>}
    {tab === 'approvals' && <section className="canonical-card request-list-card"><div className="canonical-card-header"><div><h2>Manage Approvals</h2><p>Review pending Time In / Time Out Correction requests. Approval decisions are persisted before audit and notification events are emitted.</p></div><div className="search-box request-search"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search pending requests..." /><MagnifyingGlass /></div></div><div className="canonical-callout"><CheckCircle /><span>{counts.pending ? `${counts.pending} ${plural(counts.pending, 'request')} require approval.` : 'No requests require approval right now.'} A rejection must include a remark; approval never overwrites the original punch snapshot.</span></div><RequestTable requests={pending} onOpen={setSelected} emptyCopy="No pending approvals" /></section>}
    {selected && <RequestDetail request={selected} onClose={() => setSelected(null)} onChanged={onChanged} onConflict={onConflict} notify={notify} actor={actor} companyId={companyId} />}
  </div>;
}
