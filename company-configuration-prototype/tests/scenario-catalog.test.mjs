import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, SCENARIO_ROLES, scenarioCoverage, scenariosFor } from '../src/scenarioCatalog.js';
import { SCENARIO_LIVE_PLANS, STEP_KINDS, kindForAction, livePlanFor, stepPlanFor, targetsForAction } from '../src/scenarioLivePlans.js';
import { productionSampleCompanyRecord, simulatorSandboxCompanyRecord } from '../src/companyRepository.js';

test('scenario catalog covers every Atlas actor with runnable user stories', () => {
  assert.deepEqual(SCENARIO_ROLES.map(role => role.id), ['employee', 'approver', 'client_admin', 'pa_admin']);
  const coverage = scenarioCoverage();
  assert.equal(coverage.length, SCENARIO_ROLES.length);
  coverage.forEach(role => assert.ok(role.count >= 10, `${role.label} should have broad workflow coverage`));
  SCENARIOS.forEach(item => {
    assert.match(item.story, /^As an? /);
    assert.match(item.story, / so that /);
    assert.ok(item.steps.length >= 4, `${item.id} should have a complete walkthrough`);
    item.steps.forEach(itemStep => {
      assert.ok(itemStep.screen);
      assert.ok(itemStep.action);
      assert.ok(itemStep.detail);
    });
  });
});

test('every catalog story has an explicit real Atlas route', () => {
  assert.equal(Object.keys(SCENARIO_LIVE_PLANS).length, SCENARIOS.length);
  SCENARIOS.forEach(item => {
    const plan = livePlanFor(item.id);
    assert.ok(plan, `${item.id} needs a live simulation plan`);
    assert.ok(['Core', 'HRM', 'Timekeeping', 'Payroll', 'Settings'].includes(plan.module), `${item.id} has an invalid module`);
    assert.ok(plan.entry.length > 0, `${item.id} must go beyond the module landing page`);
    plan.entry.forEach(label => assert.ok(label.trim(), `${item.id} has a blank live target`));
  });
});

test('every catalog step has exactly one planned live action', () => {
  SCENARIOS.forEach(item => {
    const plan = stepPlanFor(item);
    assert.equal(plan.length, item.steps.length, `${item.id} must plan one action per step`);
    plan.forEach((planned, index) => {
      assert.equal(planned.index, index);
      assert.equal(planned.action, item.steps[index].action, `${item.id} step ${index} drifted from the catalog`);
      assert.ok(STEP_KINDS.includes(planned.kind), `${item.id} step ${index} has kind ${planned.kind}`);
      assert.ok(planned.targets.length, `${item.id} step ${index} has nothing to look for`);
      assert.ok(planned.targets.every(label => label.trim()), `${item.id} step ${index} has a blank target`);
      assert.ok(planned.narration, `${item.id} step ${index} has no narration`);
    });
    assert.equal(plan[0].kind, 'navigate', `${item.id} must start by opening its real entry path`);
    assert.deepEqual([...plan[0].entry], livePlanFor(item.id).entry, `${item.id} step 1 must follow its live entry path`);
    plan.slice(1).forEach(planned => assert.equal(planned.entry.length, 0, `${item.id} navigates only on its first step`));
  });
});

test('a deciding step never fires itself, so the catalog walkthrough cannot write', () => {
  SCENARIOS.flatMap(stepPlanFor).forEach(planned => {
    assert.equal(planned.committing, planned.kind === 'commit', `${planned.action} must stop on every deciding control`);
  });
});

test('step classification separates navigation, data entry, and decisions', () => {
  assert.equal(kindForAction('Open Employee Self-Inquiry', 0), 'navigate');
  assert.equal(kindForAction('Enter date and hours'), 'form');
  assert.equal(kindForAction('Upload proof'), 'form');
  assert.equal(kindForAction('Submit request'), 'commit');
  assert.equal(kindForAction('Click Approve'), 'commit');
  assert.equal(kindForAction('Save'), 'commit');
  // "Select" and "Choose" name a screen or record far more often than a field
  // in this catalog, so they must not be treated as data entry.
  assert.equal(kindForAction('Select Payslips & Payroll History.'), 'open');
  assert.equal(kindForAction('Choose Payroll Register.'), 'open');
  assert.equal(kindForAction('View audit trail'), 'inspect');
  assert.equal(kindForAction('Compare July and August'), 'inspect');
});

test('planned targets keep the specific label ahead of the generic one', () => {
  const targets = targetsForAction('Download payslip');
  assert.equal(targets[0], 'Download payslip');
  assert.ok(targets.includes('Download'));
  assert.ok(targetsForAction('Click Approve').includes('Approve'));
  assert.ok(targetsForAction('Open pending request').includes('Pending'));
});

test('scenario filters combine role, category, and search text', () => {
  const employee = scenariosFor({ role: 'employee' });
  assert.ok(employee.length >= 10);
  assert.ok(employee.every(item => item.role === 'employee'));
  const payroll = scenariosFor({ role: 'client_admin', query: 'payroll' });
  assert.ok(payroll.length > 0);
  assert.ok(payroll.every(item => item.role === 'client_admin'));
  assert.equal(scenariosFor({ query: 'no-such-atlas-scenario' }).length, 0);
});

test('end-to-end tenants are distinct, fully entitled, and explicitly synthetic', () => {
  assert.notEqual(simulatorSandboxCompanyRecord.companyId, productionSampleCompanyRecord.companyId);
  assert.equal(simulatorSandboxCompanyRecord.tenantKind, 'simulator');
  assert.equal(productionSampleCompanyRecord.tenantKind, 'production-sample');
  [simulatorSandboxCompanyRecord, productionSampleCompanyRecord].forEach(company => {
    assert.match(company.sampleDataNotice, /synthetic/i);
    assert.ok(company.serviceEnrollments.length >= 4);
    assert.ok(company.serviceEnrollments.every(service => service.enabled));
    assert.ok(company.bankAccounts.some(account => account.status === 'Active'));
    assert.ok(company.authorizedContacts.some(contact => contact.status === 'Active'));
  });
});
