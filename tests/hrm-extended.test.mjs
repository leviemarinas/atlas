import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selfServiceGroups,
  applicationDefinitions,
  applicationByKey,
  applicationByRequestType,
  applicationsForGroup,
  approverChain,
  approvalLogFor,
  seedApplications,
} from '../src/hrmApplications.js';
import { REQUEST_TYPES, REQUEST_STATUSES, REQUEST_TYPE_LABELS } from '../src/requestWorkflow.js';
import { defaultHrmData } from '../src/hrmData.js';

const data = defaultHrmData('cmp-test');

test('all 6 self-service groups are registered with expected metadata', () => {
  const expectedGroups = ['time-tracking', 'leave-application', 'work-and-shift', 'cash-and-expense', 'loans', 'employee-requests'];
  const groupKeys = selfServiceGroups.map(g => g.key);
  expectedGroups.forEach(key => {
    assert.ok(groupKeys.includes(key), `Group ${key} must exist`);
  });
});

test('application definitions exist for all 6 self-service groups', () => {
  const definitions = applicationDefinitions;
  assert.ok(definitions.length >= 12, 'Must have at least 12 application definitions');

  const keys = definitions.map(d => d.key);
  const expectedKeys = [
    'time-correction',
    'overtime',
    'ot-offset',
    'leave',
    'time-off',
    'shift-change',
    'official-business',
    'transfer',
    'petty-cash',
    'expense-reimbursement',
    'cash-advance',
    'company-loan',
    'government-loan',
    'coe-request',
    'document-request',
  ];

  expectedKeys.forEach(key => {
    assert.ok(keys.includes(key), `Application ${key} should be defined`);
    const app = applicationByKey(key);
    assert.ok(app, `applicationByKey(${key}) should resolve`);
    assert.ok(app.title, `Application ${key} must have a title`);
    assert.ok(app.columns.length > 0, `Application ${key} must have columns`);
    assert.ok(app.fields.length > 0, `Application ${key} must have fields`);
  });
});

test('request types and labels match between requestWorkflow and hrmApplications', () => {
  Object.values(REQUEST_TYPES).forEach(type => {
    assert.ok(REQUEST_TYPE_LABELS[type], `Label must exist for ${type}`);
    const definition = applicationByRequestType(type);
    assert.ok(definition, `Definition must exist for ${type}`);
  });
});

test('approver chain includes the 5 levels of Figma personas', () => {
  assert.ok(approverChain.length >= 7, 'Approver chain should have multi-tier approvers');
  const names = approverChain.map(a => a.displayName);
  assert.ok(names.includes('Mark Santos'), 'Should include Mark Santos');
  assert.ok(names.includes('Maria Santos'), 'Should include Maria Santos');
  assert.ok(names.includes('Sophia Ramirez'), 'Should include Sophia Ramirez');
  assert.ok(names.includes('Jennie Kim'), 'Should include Jennie Kim');
  assert.ok(names.includes('Bon Iverson Williams'), 'Should include Bon Iverson Williams');

  const levels = approverChain.map(a => a.level);
  assert.ok(levels.includes(1), 'Level 1 approvers present');
  assert.ok(levels.includes(2), 'Level 2 approvers present');
  assert.ok(levels.includes(3), 'Level 3 approvers present');
  assert.ok(levels.includes(5), 'Level 5 approvers present');
});

test('approvalLogFor reflects status accurately across the approval chain', () => {
  const pendingLog = approvalLogFor({ status: REQUEST_STATUSES.PENDING_APPROVAL });
  assert.ok(pendingLog.some(a => a.status === 'Pending'));

  const approvedLog = approvalLogFor({ status: REQUEST_STATUSES.APPROVED });
  assert.ok(approvedLog.every(a => a.status === 'Approved'));

  const rejectedLog = approvalLogFor({ status: REQUEST_STATUSES.REJECTED });
  assert.ok(rejectedLog.some(a => a.status === 'Rejected'));
});

test('seedApplications generates populated rows for every definition and status', () => {
  const rows = seedApplications(data.employees);
  assert.ok(rows.length > 0, 'Seeded rows should be non-empty');

  const pendingRows = rows.filter(r => r.status === REQUEST_STATUSES.PENDING_APPROVAL);
  const approvedRows = rows.filter(r => r.status === REQUEST_STATUSES.APPROVED);
  const rejectedRows = rows.filter(r => r.status === REQUEST_STATUSES.REJECTED);

  assert.ok(pendingRows.length > 0, 'Pending seed rows exist');
  assert.ok(approvedRows.length > 0, 'Approved seed rows exist');
  assert.ok(rejectedRows.length > 0, 'Rejected seed rows exist');

  // Verify all request types are seeded
  const newTypes = [
    REQUEST_TYPES.PETTY_CASH,
    REQUEST_TYPES.EXPENSE_REIMBURSEMENT,
    REQUEST_TYPES.CASH_ADVANCE,
    REQUEST_TYPES.COMPANY_LOAN,
    REQUEST_TYPES.GOVERNMENT_LOAN,
    REQUEST_TYPES.COE_REQUEST,
    REQUEST_TYPES.DOCUMENT_REQUEST,
    REQUEST_TYPES.RESIGNATION,
  ];

  newTypes.forEach(type => {
    const matching = rows.filter(r => r.requestType === type);
    assert.ok(matching.length > 0, `Seeded rows for ${type} must exist`);
  });
});

test('Part 4 management screens are properly registered in employee-requests-management', async () => {
  const { managementScreens, screensForGroup, screenColumnsForGroup } = await import('../src/hrmManagement.js');
  const expectedScreens = [
    'resignation-approval',
    'coe-request-approval',
    'onboarding-documents-approval',
    'staggered-payment-approval',
    'resignation-management',
    'coe-request-management',
    'staggered-payment-management',
  ];

  const screenKeys = managementScreens.map(s => s.key);
  expectedScreens.forEach(key => {
    assert.ok(screenKeys.includes(key), `Screen ${key} must be registered in managementScreens`);
  });

  const groupScreens = screensForGroup('employee-requests-management');
  assert.equal(groupScreens.length, 7, 'Group employee-requests-management must include the staggered approval and management screens');

  const columns = screenColumnsForGroup('employee-requests-management');
  assert.equal(columns.length, 2, 'Group employee-requests-management must split into 2 columns (Approvals and Management)');

  const approvalsCol = columns.find(c => c.name === 'Approvals');
  const managementCol = columns.find(c => c.name === 'Management');
  assert.ok(approvalsCol, 'Approvals column must exist');
  assert.ok(managementCol, 'Management column must exist');
  assert.equal(approvalsCol.screens.length, 4, 'Approvals column must have 4 cards');
  assert.equal(managementCol.screens.length, 3, 'Management column must have 3 cards');
});

test('Part 4 domain seeds (resignations, coeRequests, onboardingDocuments) are populated', () => {
  assert.ok(Array.isArray(data.resignations), 'resignations array exists');
  assert.ok(data.resignations.length > 0, 'resignations must have seed rows');
  assert.ok(data.resignations.some(r => r.status === 'Pending Approval'), 'has pending resignations');
  assert.ok(data.resignations.some(r => r.status === 'Approved'), 'has approved resignations');
  assert.ok(data.resignations.some(r => r.submittedFile), 'has submitted files attached');

  assert.ok(Array.isArray(data.coeRequests), 'coeRequests array exists');
  assert.ok(data.coeRequests.length > 0, 'coeRequests must have seed rows');
  assert.ok(data.coeRequests.some(c => c.status === 'Pending Approval'), 'has pending coe requests');
  assert.ok(data.coeRequests.some(c => c.status === 'Approved'), 'has approved coe requests');
  assert.ok(data.coeRequests.some(c => c.purpose === 'Credit Card'), 'has Credit Card purpose');

  assert.ok(Array.isArray(data.onboardingDocuments), 'onboardingDocuments array exists');
  assert.ok(data.onboardingDocuments.length > 0, 'onboardingDocuments must have seed rows');
  assert.ok(data.onboardingDocuments.some(d => d.status === 'Pending' || d.status === 'Pending Approval'), 'has pending onboarding documents');
});
