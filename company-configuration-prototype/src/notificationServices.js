import { appendAuditEvent, readActiveCompanyId } from './companyRepository';

const RULES_KEY = 'atlas-notification-rules-v1';
const EVENTS_KEY = 'atlas-notification-events-v1';

const readScoped = (key, companyId) => {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved) ? saved.filter(item => item.companyId === companyId) : [];
  } catch { return []; }
};

/** Rules a company starts with until an administrator edits them. */
export const defaultNotificationRules = [
  { id: 'not-001', name: 'Payroll deadline reminder', eventKey: 'CalendarEventDue', channel: 'Email and Dashboard', frequency: 'Daily', leadTime: '3 days before', recipient: 'Administrator', template: 'Payroll deadline reminder', status: 'Active' },
  { id: 'not-002', name: 'Ticket acknowledgement', eventKey: 'TicketSubmitted', channel: 'Email', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Requester', template: 'Ticket acknowledgement', status: 'Active' },
  { id: 'not-003', name: 'Onboarding completion notice', eventKey: 'EmployeeOnboardingCompleted', channel: 'Email and Dashboard', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Administrator', template: 'Onboarding completed', status: 'Active' },
  { id: 'not-004', name: 'Report ready notice', eventKey: 'ReportGenerated', channel: 'Dashboard', frequency: 'Immediate', leadTime: 'Immediate', recipient: 'Requester', template: 'Report ready', status: 'Active' },
];

/**
 * Stored rules for the company, falling back to the shipped defaults so the
 * rules an administrator can see in Notifications are the same ones the
 * publisher resolves against.
 */
export function readNotificationRules(companyId = readActiveCompanyId()) {
  const stored = readScoped(RULES_KEY, companyId);
  return stored.length ? stored : defaultNotificationRules.map(rule => ({ ...rule, companyId }));
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
export function publishNotificationEvent({ eventKey, companyId = readActiveCompanyId(), correlationId, summary = '', actor = 'System' }) {
  if (!eventKey) return null;
  let stored = [];
  try { stored = JSON.parse(localStorage.getItem(EVENTS_KEY)) || []; } catch { stored = []; }
  const rules = readNotificationRules(companyId).filter(rule => rule.eventKey === eventKey && rule.status === 'Active');
  const correlation = correlationId || `evt-${Date.now()}`;
  const created = rules.length
    ? rules.map((rule, index) => ({
      id: `notif-${Date.now()}-${index}`, companyId, eventKey, ruleId: rule.id, recipient: rule.recipient,
      channel: rule.channel, status: 'Delivered', correlationId: correlation, summary, createdAt: new Date().toISOString(),
    }))
    : [{
      id: `notif-${Date.now()}`, companyId, eventKey, ruleId: '', recipient: 'No subscriber',
      channel: '—', status: 'No rule subscribed', correlationId: correlation, summary, createdAt: new Date().toISOString(),
    }];
  localStorage.setItem(EVENTS_KEY, JSON.stringify([...created, ...stored]));
  if (rules.length) appendAuditEvent({ companyId, actor, action: 'NotificationSent', entityType: 'NotificationEvent', entityId: created[0].id, correlationId: correlation, summary: summary || `${eventKey} dispatched to ${created.length} rule${created.length === 1 ? '' : 's'}.` });
  return created;
}
