import { appendAuditEvent, readActiveCompanyId } from './companyRepository.js';

const RULES_KEY = 'atlas-notification-rules-v1';
const EVENTS_KEY = 'atlas-notification-events-v1';

const readScoped = (key, companyId) => {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved) ? saved.filter(item => item.companyId === companyId) : [];
  } catch { return []; }
};

/** One event catalog shared by default rules and the Notifications editor. */
export const notificationEventCatalog = Object.freeze([
  { key: 'CalendarEventDue', label: 'Calendar event due', defaultRecipient: 'Administrator' },
  { key: 'TicketSubmitted', label: 'Ticket submitted', defaultRecipient: 'Requester' },
  { key: 'EmployeeOnboardingCompleted', label: 'Employee onboarding completed', defaultRecipient: 'Administrator' },
  { key: 'ReportGenerated', label: 'Report generated', defaultRecipient: 'Requester' },
  { key: 'TimeCorrectionDraftSaved', label: 'Time correction draft saved', defaultRecipient: 'Requester' },
  { key: 'TimeCorrectionSubmitted', label: 'Time correction submitted', defaultRecipient: 'Manager' },
  { key: 'TimeCorrectionApproved', label: 'Time correction approved', defaultRecipient: 'Employee' },
  { key: 'TimeCorrectionRejected', label: 'Time correction rejected', defaultRecipient: 'Employee' },
  { key: 'HrmRequestSubmitted', label: 'HRM request submitted', defaultRecipient: 'Manager' },
  { key: 'HrmRequestApproved', label: 'HRM request approved', defaultRecipient: 'Employee' },
  { key: 'HrmRequestRejected', label: 'HRM request rejected', defaultRecipient: 'Employee' },
  { key: 'WellnessCheckinSubmitted', label: 'Wellness check-in submitted', defaultRecipient: 'Administrator' },
  { key: 'MdoEnrollmentUpdated', label: 'MDO enrollment updated', defaultRecipient: 'Employee' },
]);

export const notificationEventKeys = Object.freeze(Object.fromEntries(notificationEventCatalog.map(event => [event.key, event.key])));

/** Rules a company starts with until an administrator edits them. */
export const defaultNotificationRules = [
  { id: 'not-001', name: 'Payroll deadline reminder', eventKey: notificationEventKeys.CalendarEventDue, channel: 'Email and Dashboard', frequency: 'Daily', leadTime: '3 days before', recipient: 'Administrator', template: 'Payroll deadline reminder', status: 'Active' },
  { id: 'not-002', name: 'Ticket acknowledgement', eventKey: notificationEventKeys.TicketSubmitted, channel: 'Email', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Requester', template: 'Ticket acknowledgement', status: 'Active' },
  { id: 'not-003', name: 'Onboarding completion notice', eventKey: notificationEventKeys.EmployeeOnboardingCompleted, channel: 'Email and Dashboard', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Administrator', template: 'Onboarding completed', status: 'Active' },
  { id: 'not-004', name: 'Report ready notice', eventKey: notificationEventKeys.ReportGenerated, channel: 'Dashboard', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Requester', template: 'Report ready', status: 'Active' },
  { id: 'not-005', name: 'Time correction submitted', eventKey: notificationEventKeys.TimeCorrectionSubmitted, channel: 'Email and Dashboard', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Manager', template: 'Time correction approval requested', status: 'Active' },
  { id: 'not-006', name: 'Time correction approved', eventKey: notificationEventKeys.TimeCorrectionApproved, channel: 'Email and Dashboard', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Employee', template: 'Time correction approved', status: 'Active' },
  { id: 'not-007', name: 'Time correction rejected', eventKey: notificationEventKeys.TimeCorrectionRejected, channel: 'Email and Dashboard', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Employee', template: 'Time correction rejected', status: 'Active' },
  { id: 'not-008', name: 'HRM request submitted', eventKey: notificationEventKeys.HrmRequestSubmitted, channel: 'Email and Dashboard', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Manager', template: 'HRM request approval requested', status: 'Active' },
  { id: 'not-009', name: 'HRM request approved', eventKey: notificationEventKeys.HrmRequestApproved, channel: 'Email and Dashboard', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Employee', template: 'HRM request approved', status: 'Active' },
  { id: 'not-010', name: 'HRM request rejected', eventKey: notificationEventKeys.HrmRequestRejected, channel: 'Email and Dashboard', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Employee', template: 'HRM request rejected', status: 'Active' },
  { id: 'not-011', name: 'Wellness check-in submitted', eventKey: notificationEventKeys.WellnessCheckinSubmitted, channel: 'Dashboard', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Administrator', template: 'Wellness check-in submitted', status: 'Active' },
  { id: 'not-012', name: 'MDO enrollment updated', eventKey: notificationEventKeys.MdoEnrollmentUpdated, channel: 'Dashboard', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Employee', template: 'MDO enrollment updated', status: 'Active' },
];

/**
 * Stored rules for the company, falling back to the shipped defaults so the
 * rules an administrator can see in Notifications are the same ones the
 * publisher resolves against.
 */
export function readNotificationRules(companyId = readActiveCompanyId()) {
  const stored = readScoped(RULES_KEY, companyId);
  if (!stored.length) return defaultNotificationRules.map(rule => ({ ...rule, companyId }));
  const missingDefaults = defaultNotificationRules
    .filter(seed => !stored.some(rule => rule.eventKey === seed.eventKey))
    .map(rule => ({ ...rule, companyId }));
  return [...missingDefaults, ...stored];
}

export function readNotificationEvents(companyId = readActiveCompanyId()) {
  return readScoped(EVENTS_KEY, companyId);
}

/**
 * Publishes a domain event to the shared notification service. Modules call
 * this after their own state is persisted, so a failed or missing rule can
 * never roll back the originating record — the delivery row simply records
 * that no rule was subscribed.
 */
export function publishNotificationEvent({ eventKey, companyId = readActiveCompanyId(), correlationId, summary = '', actor = 'System', actorId = '', employeeId = '', recipientEmployeeId = '', global = false }) {
  if (!eventKey) return null;
  let stored = [];
  try { stored = JSON.parse(localStorage.getItem(EVENTS_KEY)) || []; } catch { stored = []; }
  const rules = readNotificationRules(companyId).filter(rule => rule.eventKey === eventKey && rule.status === 'Active');
  const correlation = correlationId || `evt-${Date.now()}`;
  const created = rules.length
    ? rules.map((rule, index) => ({
      id: `notif-${Date.now()}-${index}`, companyId, eventKey, ruleId: rule.id, recipient: rule.recipient,
      channel: rule.channel, status: 'Delivered', correlationId: correlation, summary, actor, actorId,
      employeeId, recipientEmployeeId: recipientEmployeeId || employeeId, global, createdAt: new Date().toISOString(),
    }))
    : [{
      id: `notif-${Date.now()}`, companyId, eventKey, ruleId: '', recipient: 'No subscriber',
      channel: '—', status: 'No rule subscribed', correlationId: correlation, summary, actor, actorId,
      employeeId, recipientEmployeeId: recipientEmployeeId || employeeId, global, createdAt: new Date().toISOString(),
    }];
  localStorage.setItem(EVENTS_KEY, JSON.stringify([...created, ...stored]));
  if (rules.length) appendAuditEvent({ companyId, actor, action: 'NotificationSent', entityType: 'NotificationEvent', entityId: created[0].id, correlationId: correlation, summary: summary || `${eventKey} dispatched to ${created.length} rule${created.length === 1 ? '' : 's'}.` });
  return created;
}
