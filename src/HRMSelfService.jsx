/**
 * Employee Self-service.
 *
 * The secondary sidebar, the group landing pages and one generic application
 * workspace.  Every application screen — Time In/Out Correction, Overtime,
 * Offset of OT & Time Off, Leave, Time Off, Shift Change, Official Business
 * and Transfer — is this component rendered against a different definition in
 * `hrmApplications`, so the list, filters, form and detail view can never
 * drift apart between application types.
 */

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowsLeftRight,
  Bank,
  Briefcase,
  CalendarBlank,
  CalendarX,
  ClipboardText,
  Clock,
  ClockClockwise,
  ClockCounterClockwise,
  Receipt,
  Suitcase,
  ArrowRight,
} from '@phosphor-icons/react';
import {
  APPLICATION_STATUS_TABS,
  applicationByKey,
  applicationsForGroup,
  approvalLogFor,
  fieldSections,
  groupByKey,
  selfServiceGroups,
  visibleFields,
} from './hrmApplications.js';
import { REQUEST_STATUSES, REQUEST_TYPES } from './requestWorkflow.js';
import { cancelRequest, submitRequest, updateRequestDetails } from './requestService.js';
import { findEmployee, leaveBalancesFor, shiftById, SHIFT_CATALOG } from './hrmData.js';
import { syncRequestIntoRegisters } from './hrmPosting.js';
import { downloadFile } from './fileDownload.js';
import { readPolicies } from './PolicyComputations.jsx';
import { installmentsForOption, staggeredEligibility, staggeredPaymentOptions } from './staggeredPayments.js';
import {
  ApprovalLogModal,
  Breadcrumbs,
  ConfirmCancelModal,
  DataTable,
  DetailList,
  ExportMenu,
  Field,
  FilterButton,
  FilterDrawer,
  GhostButton,
  Modal,
  PageHeading,
  PrimaryButton,
  SearchInput,
  StatusTabs,
  StatusText,
  UploadArea,
  formatCell,
  formatDate,
  formatTime,
  paginate,
  shortStatus,
  useTableState,
} from './HRMKit.jsx';

const groupIcons = {
  'time-tracking': Clock,
  'leave-application': Suitcase,
  'work-and-shift': CalendarBlank,
  'cash-and-expense': Receipt,
  loans: Bank,
  'employee-requests': ClipboardText,
};

const applicationIcons = {
  'clock-clockwise': ClockClockwise,
  'clock-plus': Clock,
  'clock-counter': ClockCounterClockwise,
  suitcase: Suitcase,
  'calendar-x': CalendarX,
  'calendar-clock': CalendarBlank,
  briefcase: Briefcase,
  'arrows-left-right': ArrowsLeftRight,
  receipt: Receipt,
  bank: Bank,
  clipboard: ClipboardText,
};

const today = () => new Date().toISOString().slice(0, 10);
const payrollWindow = () => {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 14);
  return `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
};

/**
 * Approvals route to the subject employee's line manager.  Someone with no
 * manager on file (the top of the reporting line) approves their own filing,
 * which is what the service's administrative-approver path expects.
 */
function assignedApproverFor(data, subject, user) {
  const managerId = subject?.managerId || user.employeeId;
  const manager = findEmployee(data, managerId);
  return { actorId: `user-${managerId}`, displayName: manager?.name || '', role: 'Manager' };
}

/* ------------------------------------------------------------------ derived */

/**
 * Values a form computes rather than asks for.  Each key matches a field's
 * `derivedFrom`, so a read-only field always reflects the current draft.
 */
function deriveValue(key, values, context) {
  const { employee, data, approvedOvertime, subordinates } = context;
  if (key === 'subordinateShift') return shiftById(data, subordinates.find(row => row.employeeId === values.subordinateId)?.shiftId)?.name || '';
  if (key === 'subordinateShiftWindow') return shiftWindow(data, shiftById(data, subordinates.find(row => row.employeeId === values.subordinateId)?.shiftId)?.name);
  if (key === 'overtimeHours') return hoursBetween(values.overtimeStartDate, values.overtimeStartTime, values.overtimeEndDate, values.overtimeEndTime);
  if (key === 'leaveDays') return daysBetween(values.leaveStart, values.leaveEnd);
  if (key === 'approvedOvertimeHours') return approvedOvertime.find(row => row.date === values.overtimeDate)?.hours ?? '';
  if (key === 'currentShiftWindow') return shiftWindow(data, values.currentShift);
  if (key === 'requestedShiftWindow') return shiftWindow(data, values.requestedShift);
  if (key === 'currentDepartment') return employee?.department || '';
  if (key === 'currentPosition') return employee?.position || '';
  if (key === 'cashAdvanceAmount') {
    return context.openCashAdvances.find(row => row.transactionNo === values.cashAdvanceNo)?.amountRequested ?? '';
  }
  if (key === 'liquidationBalance') {
    // What the employee still owes the company, or is owed by it: expenses
    // settle the advance and any cash handed back settles the remainder.
    const advance = Number(deriveValue('cashAdvanceAmount', values, context) || 0);
    const spent = Number(values.totalExpenses || 0);
    const returned = Number(values.cashReturned || 0);
    const balance = advance - spent - returned;
    return balance === 0 ? '0.00' : balance.toFixed(2);
  }
  if (key === 'loanAmortization') {
    const amount = Number(values.principalAmount || 0);
    const months = Number(values.termMonths || 1);
    return amount && months ? (amount / months).toFixed(2) : '';
  }
  return '';
}

function shiftWindow(data, shiftName) {
  const shift = (data?.shifts || SHIFT_CATALOG).find(entry => entry.name === shiftName);
  return shift ? `${shift.window} (${shift.days})` : '';
}

function hoursBetween(startDate, startTime, endDate, endTime) {
  if (!startDate || !startTime || !endDate || !endTime) return '';
  const start = new Date(`${startDate}T${startTime}:00`);
  const end = new Date(`${endDate}T${endTime}:00`);
  const diff = (end - start) / 3600000;
  return diff > 0 ? Math.round(diff * 100) / 100 : '';
}

function daysBetween(start, end) {
  if (!start || !end) return '';
  const diff = (new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000;
  return diff >= 0 ? diff + 1 : '';
}

/**
 * Validation mirrors what a server would enforce: required fields, ordered
 * dates, an offset that cannot exceed its approved overtime, and a leave
 * request that cannot exceed the employee's remaining balance.
 */
function validateForm(definition, values, context) {
  const errors = {};
  visibleFields(definition, values).forEach(field => {
    const value = values[field.key] ?? field.default;
    if (field.required && !String(value ?? '').trim()) errors[field.key] = `${field.label} is required.`;
    if (field.validate === 'approvedOvertimeDate' && value && !context.approvedOvertime.some(row => row.date === value)) {
      errors[field.key] = 'There is no approved overtime for this date. Please select another.';
    }
    if (field.validate === 'withinOvertimeHours' && value) {
      const available = Number(context.approvedOvertime.find(row => row.date === values.overtimeDate)?.hours || 0);
      if (Number(value) > available) errors[field.key] = `Only ${available} approved overtime hours are available on that date.`;
    }
    if (field.validate === 'differentFromCurrentShift' && value) {
      const current = definition.forSubordinate ? deriveValue('subordinateShift', values, context) : values.currentShift;
      if (value === current) errors[field.key] = 'The assigned shift must differ from the current shift.';
    }
    if (field.validate === 'withinLeaveBalance' && values.leaveType) {
      const balance = context.leaveBalances.find(row => row.leaveType === values.leaveType);
      const filed = Number(deriveValue('leaveDays', values, context) || 0);
      if (balance && filed > balance.remaining) errors[field.key] = `Only ${balance.remaining} ${values.leaveType} day(s) remain.`;
    }
  });
  if (values.overtimeStartDate && values.overtimeEndDate && !hoursBetween(values.overtimeStartDate, values.overtimeStartTime, values.overtimeEndDate, values.overtimeEndTime) && values.overtimeStartTime && values.overtimeEndTime) {
    errors.overtimeEndTime = 'Overtime must end after it starts.';
  }
  if (values.leaveStart && values.leaveEnd && values.leaveEnd < values.leaveStart) errors.leaveEnd = 'Leave end cannot precede leave start.';
  if (values.effectiveDateStart && values.effectiveDateEnd && values.effectiveDateEnd < values.effectiveDateStart) errors.effectiveDateEnd = 'The end date cannot precede the start date.';
  if (values.startDate && values.endDate && values.endDate < values.startDate) errors.endDate = 'The end date cannot precede the start date.';
  if (definition.key === 'staggered-payment' && !context.staggeredPreview.isEligible) errors.eligibleDeduction = 'A request is available only when projected take-home pay is below the configured minimum.';
  return errors;
}

/* --------------------------------------------------------------- navigation */

export function SelfServiceSidebar({ group, onSelectGroup, onBack }) {
  return <aside className="hrm-ss-sidebar">
    <button type="button" className="hrm-ss-back" onClick={onBack}><ArrowLeft size={14} /> Back to HRM</button>
    <h2>Employee<br />Self-service</h2>
    <nav aria-label="Employee self-service">
      {selfServiceGroups.map(entry => {
        const Icon = groupIcons[entry.key] || ClipboardText;
        return <button key={entry.key} type="button" className={group === entry.key ? 'selected' : ''} onClick={() => onSelectGroup(entry.key)}>
          <Icon size={15} /><span>{entry.label}</span>
        </button>;
      })}
    </nav>
  </aside>;
}

/** Group landing page: the application cards for one sidebar entry. */
export function SelfServiceGroupHome({ groupKey, access, onOpenApplication }) {
  const group = groupByKey(groupKey);
  const applications = applicationsForGroup(groupKey).filter(definition => !definition.approverOnly || access.canApproveTeamRequests);
  return <div className="hrm-ss-home">
    <h1>{group?.label}</h1>
    {applications.length === 0
      ? <p className="hrm-ss-placeholder">No applications are configured for {group?.label} in this release.</p>
      : <div className="hrm-ss-card-grid">
          {applications.map(definition => {
            const Icon = applicationIcons[definition.icon] || ClipboardText;
            return <button key={definition.key} type="button" className="hrm-ss-card" onClick={() => onOpenApplication(definition.key)}>
              <Icon size={22} />
              <span>{definition.cardLabel}</span>
              <ArrowRight size={16} className="hrm-ss-card-arrow" />
            </button>;
          })}
        </div>}
  </div>;
}

/* --------------------------------------------------------------- form modal */

/**
 * A field's choices, which may be fixed or drawn from the employee's own
 * records — a liquidation can only settle a cash advance that employee
 * actually holds.
 */
function optionsFor(field, context) {
  if (Array.isArray(field.options)) return field.options;
  if (field.optionsFrom) return context.options?.[field.optionsFrom] || [];
  return [];
}

function ApplicationForm({ definition, values, errors, onChange, context }) {
  const sections = fieldSections(definition, values);
  return <div className="hrm-form">
    {sections.map((section, index) => <div key={`${section.name}-${index}`} className="hrm-form-section">
      {section.name && <h3 className="hrm-form-section-title">{section.name}</h3>}
      <div className="hrm-form-grid">
        {section.fields.map(field => {
          const derived = field.type === 'derived' ? deriveValue(field.derivedFrom, values, context) : null;
          const value = field.type === 'derived' ? derived : (values[field.key] ?? '');
          const common = {
            value: value ?? '',
            onChange: event => onChange(field.key, event.target.value),
            readOnly: field.readOnly,
            disabled: field.readOnly,
            placeholder: field.placeholder,
          };
          return <div key={field.key} className={`hrm-form-cell span-${field.type === 'textarea' || field.type === 'upload' || field.type === 'radio' ? 2 : 1}`}>
            {field.type === 'subordinate'
              ? <Field label={field.label} required={field.required} error={errors[field.key]}>
                  <select value={values[field.key] ?? ''} onChange={event => onChange(field.key, event.target.value)}>
                    <option value="">Please select</option>
                    {context.subordinates.map(row => <option key={row.employeeId} value={row.employeeId}>{row.name} · {row.employeeCode}</option>)}
                  </select>
                </Field>
              : field.type === 'upload'
              ? <Field label={field.label} hint={field.hint}>
                  <UploadArea
                    files={values.attachments || []}
                    onAdd={files => onChange('attachments', [...(values.attachments || []), ...files])}
                    onRemove={index2 => onChange('attachments', (values.attachments || []).filter((_, position) => position !== index2))}
                  />
                </Field>
              : field.type === 'radio'
                ? <fieldset className={`hrm-radio-group ${errors[field.key] ? 'has-error' : ''}`}>
                    <legend>{field.label}{field.required && <em aria-hidden="true"> *</em>}</legend>
                    <div>
                      {optionsFor(field, context).map(option => <label key={option} className="hrm-radio">
                        <input type="radio" name={field.key} value={option} checked={(values[field.key] ?? field.default) === option} onChange={() => onChange(field.key, option)} />
                        <span>{option}</span>
                      </label>)}
                    </div>
                    {errors[field.key] && <small className="hrm-form-error">{errors[field.key]}</small>}
                  </fieldset>
                : <Field label={field.label} required={field.required} error={errors[field.key]}>
                    {field.type === 'textarea'
                      ? <textarea rows={3} {...common} />
                      : field.type === 'select'
                        ? <select {...common}>
                            <option value="">Please select</option>
                            {optionsFor(field, context).map(option => <option key={option} value={option}>{option}</option>)}
                          </select>
                        : <input type={field.type === 'derived' ? 'text' : field.type} {...common} />}
                  </Field>}
          </div>;
        })}
      </div>
    </div>)}
  </div>;
}

/** The Official Business review step: the captured values, read only. */
function ReviewStep({ definition, values, context }) {
  const groups = visibleFields(definition, values)
    .filter(field => field.type !== 'upload')
    .map(field => ({
      label: field.label,
      value: field.type === 'derived'
        ? String(deriveValue(field.derivedFrom, values, context) || '')
        : field.type === 'date' ? formatDate(values[field.key]) : field.type === 'time' ? formatTime(values[field.key]) : String(values[field.key] ?? ''),
    }));
  const attachments = values.attachments || [];
  return <div>
    <h3 className="hrm-form-section-title">{definition.reviewTitle}</h3>
    <DetailList groups={groups} />
    {attachments.length > 0 && <>
      <h3 className="hrm-form-section-title">Additional Documents</h3>
      <ul className="hrm-file-list readonly">
        {attachments.map((file, index) => <li key={`${file.name}-${index}`}><span className="hrm-file-name">{file.name}</span><span className="hrm-file-size">{file.size}</span></li>)}
      </ul>
    </>}
  </div>;
}

/* ------------------------------------------------------------- the workspace */

export function ApplicationWorkspace({
  definitionKey,
  requests,
  data,
  setData,
  user,
  access,
  actor,
  companyId,
  onRefresh,
  onNotify,
  onBackToGroup,
}) {
  const definition = applicationByKey(definitionKey);
  const table = useTableState();
  const [statusTab, setStatusTab] = useState('All');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formState, setFormState] = useState(null); // { mode: 'apply' | 'edit', values, errors, step, request }
  const [viewing, setViewing] = useState(null);
  const [approvalLog, setApprovalLog] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const employee = findEmployee(data, user.employeeId);
  const leaveBalances = useMemo(() => leaveBalancesFor(data, user.employeeId, requests), [data, user.employeeId, requests]);
  const subordinates = useMemo(
    () => (data.employees || []).filter(row => row.managerId === user.employeeId),
    [data.employees, user.employeeId],
  );

  /**
   * Shift Change and Assign Subordinates' Shift Schedule share a request type,
   * so a row belongs to whichever definition filed it.  Rows from before the
   * definition key existed fall back to matching on type alone.
   */
  const ownRequests = useMemo(() => requests.filter(request => {
    if (request.requestType !== definition.requestType) return false;
    const filedUnder = request.requestDetails?.definitionKey;
    if (filedUnder && filedUnder !== definition.key) return false;
    return definition.forSubordinate
      ? request.filedBy?.actorId === actor.actorId && request.employeeId !== user.employeeId
      : request.employeeId === user.employeeId;
  }), [requests, definition, user.employeeId, actor.actorId]);

  /** Approved overtime the offset application is allowed to draw from. */
  const approvedOvertime = useMemo(() => requests
    .filter(request => request.requestType === 'OVERTIME' && request.employeeId === user.employeeId && request.status === REQUEST_STATUSES.APPROVED)
    .map(request => ({ date: request.requestDetails?.overtimeStartDate, hours: Number(request.requestDetails?.hoursFiled || 0) }))
    .filter(row => row.date), [requests, user.employeeId]);

  /**
   * Cash advances this employee holds that are approved and not yet fully
   * liquidated.  A liquidation has to name one, so the form offers only the
   * advances that can actually be settled.
   */
  const openCashAdvances = useMemo(() => {
    const settled = new Set(requests
      .filter(request => request.requestType === REQUEST_TYPES.CASH_ADVANCE_LIQUIDATION
        && request.status !== REQUEST_STATUSES.REJECTED)
      .map(request => request.requestDetails?.cashAdvanceNo));
    return (data.cashAdvances || []).filter(row => row.employeeId === user.employeeId
      && row.status === REQUEST_STATUSES.APPROVED
      && !settled.has(row.transactionNo));
  }, [data.cashAdvances, requests, user.employeeId]);
  const staggeredPreview = useMemo(() => staggeredEligibility({
    salaryRecord: (data.salaryInformation || []).find(row => row.employeeId === user.employeeId),
    loanSchedules: (data.loanInquiries || []).filter(row => row.employeeId === user.employeeId),
    takeHomePolicy: readPolicies(companyId).takeHome,
  }), [data.salaryInformation, data.loanInquiries, user.employeeId, companyId]);

  const context = {
    employee,
    data,
    approvedOvertime,
    leaveBalances,
    subordinates,
    openCashAdvances,
    staggeredPreview,
    options: {
      openCashAdvances: openCashAdvances.map(row => row.transactionNo),
      staggeredDeductions: staggeredPreview.deductions.map(row => `${row.id} · ${row.name}`),
      staggeredPaymentOptions: staggeredPaymentOptions.map(option => option.label),
    },
  };

  const filtered = useMemo(() => {
    const term = table.search.trim().toLowerCase();
    return ownRequests.filter(request => {
      if (statusTab !== 'All' && shortStatus(request.status) !== statusTab) return false;
      const details = request.requestDetails || {};
      if (term && !definition.columns.some(column => String(details[column.key] ?? '').toLowerCase().includes(term))) return false;
      return Object.entries(table.filters).every(([key, value]) => {
        if (!value) return true;
        if (key === 'status') return shortStatus(request.status) === value;
        return String(details[key] ?? '').toLowerCase().includes(String(value).toLowerCase());
      });
    });
  }, [ownRequests, statusTab, table.search, table.filters, definition.columns]);

  const pageRows = paginate(filtered, table.page, table.pageSize);

  const columns = definition.columns;
  const filterFields = [
    ...columns.filter(column => column.key !== 'status').map(column => ({ key: column.key, label: column.label, type: column.type })),
    { key: 'status', label: 'Status', options: APPLICATION_STATUS_TABS.filter(tab => tab !== 'All') },
    { key: 'filedBy', label: 'Filed By' },
    { key: 'actionedBy', label: 'Actioned By' },
  ];

  function openApply() {
    if (definition.key === 'staggered-payment' && !staggeredPreview.isEligible) {
      onNotify('No request is available because projected take-home pay is not below the configured minimum.', 'bad');
      return;
    }
    const values = { applicationDate: today(), attachments: [] };
    definition.fields.forEach(field => {
      if (field.default) values[field.key] = field.default;
    });
    if (definition.key === 'shift-change') {
      const current = shiftById(data, employee?.shiftId);
      if (current) values.currentShift = current.name;
    }
    if (definition.key === 'transfer') {
      values.currentAssignment = employee?.department || '';
      values.currentJobTitle = employee?.position || '';
    }
    if (definition.key === 'staggered-payment') {
      values.projectedTakeHome = staggeredPreview.projectedTakeHome.toFixed(2);
      values.minimumTakeHome = staggeredPreview.minimum.toFixed(2);
      values.eligibleDeduction = staggeredPreview.deductions[0] ? `${staggeredPreview.deductions[0].id} · ${staggeredPreview.deductions[0].name}` : '';
      values.staggerOption = staggeredPaymentOptions[0].label;
      values.installments = installmentsForOption(values.staggerOption);
      values.applicablePayroll = payrollWindow();
    }
    setFormState({ mode: 'apply', values, errors: {}, step: 1, request: null });
  }

  function openEdit(request) {
    setFormState({ mode: 'edit', values: { attachments: [], ...request.requestDetails }, errors: {}, step: 1, request });
  }

  function changeField(key, value) {
    setFormState(current => ({ ...current, values: { ...current.values, [key]: value, ...(key === 'staggerOption' ? { installments: installmentsForOption(value) } : {}) }, errors: { ...current.errors, [key]: undefined } }));
  }

  function submitForm() {
    const errors = validateForm(definition, formState.values, context);
    if (Object.keys(errors).length) {
      setFormState(current => ({ ...current, errors }));
      onNotify('Fix the highlighted fields before submitting.', 'bad');
      return;
    }
    if (definition.reviewStep && formState.step === 1) {
      setFormState(current => ({ ...current, step: 2 }));
      return;
    }
    const details = { ...formState.values, definitionKey: definition.key };
    definition.fields.filter(field => field.type === 'derived').forEach(field => {
      details[field.key] = deriveValue(field.derivedFrom, formState.values, context);
    });
    // An assignment is filed against the chosen subordinate; every other
    // application is filed against the signed-in employee.
    const subject = definition.forSubordinate
      ? subordinates.find(row => row.employeeId === formState.values.subordinateId)
      : employee;
    details.employeeName = subject?.name || user.displayName;
    try {
      if (formState.mode === 'edit') {
        updateRequestDetails(formState.request.requestId, details, { actor });
        onNotify('Details saved successfully!');
      } else {
        const result = submitRequest({
          requestType: definition.requestType,
          companyId,
          company: { companyId },
          employeeId: subject?.employeeId || user.employeeId,
          employee: { employeeId: subject?.employeeId, employeeCode: subject?.employeeCode, name: subject?.name, department: subject?.department, position: subject?.position },
          workDate: details.applicationDate || today(),
          requestDetails: details,
          requesterRemarks: details.reason || definition.title,
          // The request goes to the subject employee's own line manager; a
          // manager filing for a report approves it themselves.
          assignedApprover: assignedApproverFor(data, subject, user),
          // Filing for a report is an on-behalf submission and the service
          // requires the target metadata and a rationale to match.
          ...(definition.forSubordinate ? {
            onBehalfOf: { employeeId: subject?.employeeId, employeeCode: subject?.employeeCode },
            onBehalfReason: details.reason || 'Shift schedule assigned by the line manager.',
          } : {}),
          idempotencyKey: `${definition.key}-${subject?.employeeId || user.employeeId}-${Date.now()}`,
        }, { actor, activeCompanyId: companyId });
        // The filing and the register an administrator monitors are the same
        // transaction, so it appears under Management as Pending immediately
        // rather than only once somebody approves it.
        if (result?.request) setData?.(current => syncRequestIntoRegisters(current, result.request));
        onNotify('Request sent successfully!');
      }
      setFormState(null);
      onRefresh();
    } catch (error) {
      onNotify(error.message || 'Failed to send request.', 'bad');
    }
  }

  function confirmCancel() {
    try {
      cancelRequest(cancelling.requestId, { actor, remarks: 'Cancelled by the employee.' });
      onNotify('Application cancelled.');
      setCancelling(null);
      onRefresh();
    } catch (error) {
      onNotify(error.message || 'The application could not be cancelled.', 'bad');
    }
  }

  function exportRows(format) {
    const header = columns.map(column => column.label).join(',');
    const body = filtered.map(request => columns.map(column => {
      const value = column.key === 'status' ? shortStatus(request.status) : request.requestDetails?.[column.key];
      return `"${String(value ?? '').replace(/"/g, '""')}"`;
    }).join(',')).join('\n');
    downloadFile(`${definition.key}-applications.${format === 'PDF' ? 'txt' : 'csv'}`, `${header}\n${body}`);
    onNotify(`${definition.title} exported to ${format}.`);
  }

  function detailGroups(request) {
    const details = request.requestDetails || {};
    const groups = [];
    columns.filter(column => !['status', 'statusDate'].includes(column.key)).forEach(column => {
      groups.push({ label: column.label, value: formatCell(details[column.key], column.type) });
    });
    if ((details.attachments || []).length) {
      groups.push({ label: 'Attachments', node: <ul className="hrm-file-list readonly">{details.attachments.map((file, index) => <li key={`${file.name}-${index}`}><span className="hrm-file-name">{file.name}</span><span className="hrm-file-size">{file.size}</span></li>)}</ul> });
    }
    groups.push({ pair: [
      { label: 'Filed By', value: request.filedBy?.displayName || request.requester?.displayName || '—' },
      { label: 'Actioned By', value: request.approvalHistory?.[request.approvalHistory.length - 1]?.actor || '—' },
    ] });
    groups.push({ label: 'Approver Remarks', value: request.decisionRemarks || '—' });
    groups.push({ pair: [
      { label: 'Status', node: <StatusText status={request.status} /> },
      { label: 'Status Date', value: formatDate(details.statusDate || request.decidedAt?.slice(0, 10)) },
    ] });
    return groups;
  }

  const canEdit = request => request.status === REQUEST_STATUSES.PENDING_APPROVAL || request.status === REQUEST_STATUSES.DRAFT;

  return <div className="hrm-ss-content">
    <Breadcrumbs trail={[{ label: groupByKey(definition.group)?.label, onClick: onBackToGroup }, { label: definition.title }]} />
    <PageHeading title={definition.title} />
    {definition.key === 'staggered-payment' && <div className={`canonical-callout ${staggeredPreview.isEligible ? 'warning' : ''}`}><span><strong>Take-home projection:</strong> PHP {staggeredPreview.projectedTakeHome.toLocaleString('en-PH', { minimumFractionDigits: 2 })} against a minimum of PHP {staggeredPreview.minimum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}. {staggeredPreview.isEligible ? 'You may request an approved staggered option for an eligible deduction.' : 'No staggered request is needed for the current projection.'}</span></div>}
    <StatusTabs tabs={APPLICATION_STATUS_TABS} value={statusTab} onChange={value => { setStatusTab(value); table.setPage(1); }} />
    <div className="hrm-toolbar">
      <div className="hrm-toolbar-left">
        <SearchInput value={table.search} onChange={table.setSearch} />
        <FilterButton onClick={() => setDrawerOpen(true)} active={Object.values(table.filters).some(Boolean)} />
      </div>
      <div className="hrm-toolbar-right">
        <PrimaryButton onClick={openApply} disabled={definition.key === 'staggered-payment' && !staggeredPreview.isEligible}>{definition.applyLabel}</PrimaryButton>
        <ExportMenu onExport={exportRows} disabled={filtered.length === 0} />
      </div>
    </div>

    <DataTable
      columns={columns}
      rows={pageRows}
      total={filtered.length}
      rowKey={request => request.requestId}
      page={table.page}
      pageSize={table.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      empty={`No ${definition.title.toLowerCase()} records yet.`}
      renderCell={(request, column) => {
        if (column.key === 'status') return <StatusText status={request.status} />;
        return formatCell(request.requestDetails?.[column.key], column.type);
      }}
      actions={request => [
        { kind: 'view', label: 'View Details', onSelect: () => setViewing(request) },
        { kind: 'view', label: 'Approval Log', onSelect: () => setApprovalLog(request) },
        ...(canEdit(request) ? [{ kind: 'edit', label: 'Edit', onSelect: () => openEdit(request) }] : []),
        ...(canEdit(request) ? [{ kind: 'cancel', label: 'Cancel Application', onSelect: () => setCancelling(request) }] : []),
      ]}
    />

    {drawerOpen && <FilterDrawer
      fields={filterFields}
      value={table.filters}
      onApply={next => { table.setFilters(next); setDrawerOpen(false); }}
      onClose={() => setDrawerOpen(false)}
    />}

    {formState && <Modal
      title={formState.mode === 'edit' ? definition.modalTitle.replace(/^(Apply for|Add)/, 'Edit') : definition.modalTitle}
      width="lg"
      onClose={() => setFormState(null)}
      footer={<>
        {definition.reviewStep && formState.step === 2
          ? <GhostButton onClick={() => setFormState(current => ({ ...current, step: 1 }))}>Back</GhostButton>
          : <GhostButton onClick={() => setFormState(null)}>Cancel</GhostButton>}
        <button type="button" className="hrm-btn primary" onClick={submitForm}>
          {definition.reviewStep && formState.step === 1 ? 'Next' : formState.mode === 'edit' ? 'Save' : 'Submit'}
        </button>
      </>}
    >
      {definition.reviewStep && formState.step === 2
        ? <ReviewStep definition={definition} values={formState.values} context={context} />
        : <ApplicationForm definition={definition} values={formState.values} errors={formState.errors} onChange={changeField} context={context} />}
    </Modal>}

    {viewing && <Modal
      title={definition.viewTitle}
      onClose={() => setViewing(null)}
      footer={<GhostButton onClick={() => { setApprovalLog(viewing); setViewing(null); }}>View approval log</GhostButton>}
    >
      <DetailList groups={detailGroups(viewing)} />
    </Modal>}

    {approvalLog && <ApprovalLogModal entries={approvalLogFor(approvalLog)} onClose={() => setApprovalLog(null)} />}
    {cancelling && <ConfirmCancelModal onBack={() => setCancelling(null)} onConfirm={confirmCancel} />}
  </div>;
}
