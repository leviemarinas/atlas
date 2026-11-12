import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  CaretLeft,
  CaretRight,
  CheckCircle,
  CursorClick,
  Cube,
  Database,
  Eye,
  MagnifyingGlass,
  Monitor,
  Pause,
  PencilSimpleLine,
  Play,
  SkipForward,
  SlidersHorizontal,
  Sparkle,
  Target,
  User,
  UserCheck,
  Buildings,
  ShieldStar,
  ArrowSquareOut,
  WarningCircle,
} from '@phosphor-icons/react';
import { BrandRail, Topbar } from './AppChrome';
import { SCENARIO_CATEGORIES, SCENARIO_ROLES, SCENARIOS, scenarioCoverage, scenariosFor } from './scenarioCatalog';
import { livePlanFor, stepPlanFor } from './scenarioLivePlans';
import { describePreparation, ensureScenarioData, needsFor } from './scenarioSeed';
import { plural } from './textFormat';
import {
  E2E_JOURNEYS,
  PRODUCTION_SAMPLE_COMPANY_ID,
  SANDBOX_COMPANY_ID,
  applyEndToEndStage,
  readEndToEndState,
  readProductionSampleState,
  resetEndToEndSandbox,
  seedProductionSampleData,
} from './endToEndDemo';

const roleIcons = { employee: User, approver: UserCheck, client_admin: Buildings, pa_admin: ShieldStar };
const pointerPositions = [
  ['18%', '31%'],
  ['72%', '23%'],
  ['56%', '57%'],
  ['79%', '78%'],
];

const kindIcons = { navigate: Cube, open: Target, form: PencilSimpleLine, commit: CheckCircle, inspect: Eye };
const kindLabels = { navigate: 'Navigate', open: 'Open', form: 'Enter data', commit: 'Decide', inspect: 'Verify' };

function SimulatorFrame({ scenario, plan, activeStep, playing, module }) {
  const current = scenario.steps[activeStep];
  const step = plan[activeStep];
  const [left, top] = pointerPositions[activeStep % pointerPositions.length];
  const completed = activeStep === scenario.steps.length - 1;
  const KindIcon = kindIcons[step?.kind] || Eye;

  return (
    <section className="scenario-simulator" aria-label={`Storyboard of ${scenario.title}`}>
      <header className="scenario-browser-bar">
        <span className="scenario-browser-dots"><i /><i /><i /></span>
        <span className="scenario-address">atlas.app / {module.toLowerCase()} / {current.screen.toLowerCase().replaceAll(' ', '-')}</span>
        <span className={`scenario-live ${playing ? 'playing' : ''}`}><i /> {playing ? 'Playing' : 'Paused'}</span>
      </header>
      <div className="scenario-stage">
        <aside className="scenario-mini-rail"><Sparkle weight="fill" />{scenario.steps.map((item, index) => <i key={`${item.screen}-${index}`} className={index <= activeStep ? 'active' : ''} />)}</aside>
        <div className="scenario-stage-main">
          <div className="scenario-stage-topbar"><span>ABC Company Ltd</span><em>{scenario.roleLabel}</em></div>
          <div className="scenario-stage-content">
            <p className="scenario-stage-path">{module} › {scenario.category} › {current.screen}</p>
            <h2>{current.screen}</h2>
            <div className="scenario-stage-card" key={`${scenario.id}-${activeStep}`}>
              <span className="scenario-step-number"><KindIcon weight="fill" /> Step {activeStep + 1} of {scenario.steps.length} · {kindLabels[step?.kind] || 'Verify'}</span>
              <h3>{current.action}</h3>
              <p>{current.detail}</p>
              <button type="button" tabIndex={-1}>{current.action}</button>
              {current.result && <div className="scenario-result"><CheckCircle weight="fill" /> {current.result}</div>}
            </div>
            <div className="scenario-ghost-grid" aria-hidden="true"><span /><span /><span /></div>
          </div>
        </div>
        <div className={`scenario-pointer ${playing ? 'moving' : ''}`} style={{ left, top }} aria-hidden="true"><CursorClick weight="fill" /></div>
        {completed && !playing && <div className="scenario-complete"><CheckCircle weight="fill" /><strong>Scenario complete</strong><span>{current.result || scenario.value}</span></div>}
      </div>
    </section>
  );
}

const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * A partial match must still be a tight one. "payslip" is contained in the
 * "Payslips & Payroll History" navigation entry, so an untethered substring
 * search sent "Download payslip" back to the screen it was already on. Loose
 * matches are ranked by how much longer the control's label is than the label
 * being looked for, and anything more than three times as long is not a match.
 */
const LOOSE_MATCH_LIMIT = 3;

/**
 * Application chrome the driver reaches through its own explicit selectors.
 * A loose search must not land here: the topbar's "Approver" role button
 * contains "approve", so "Click Approve" was resolving to the role switch
 * instead of the approval decision on the screen below it.
 */
const CHROME = '.brand-rail, .role-switch, .top-actions';

/**
 * A status tab changes which records are listed; it never decides one. Both
 * "Approve" and the "Approved" filter tab sit on an approval register, so a
 * deciding step excludes the tab strip or it stops on the filter and reports
 * a decision that was never reached.
 */
const FILTER_TABS = '[role="tab"], .hrm-status-tabs, .status-tabs, .tabs';

/**
 * A control is matched on its primary name as well as its whole text. A
 * workspace card renders `<strong>Payroll Processing</strong><small>Create,
 * recalculate…</small>`, so its `textContent` is four times the length of the
 * name it advertises and the length guard alone rejected it outright.
 */
function primaryName(node) {
  const aria = node.getAttribute('aria-label');
  if (aria) return cleanText(aria);
  const heading = node.querySelector('h1, h2, h3, h4, strong');
  return cleanText(heading?.textContent || node.textContent);
}

function findControl(root, name, { selector = 'button, [role="button"], a', exact = false, exclude = '' } = {}) {
  const expected = cleanText(name);
  if (!expected) return undefined;
  const labelled = [...root.querySelectorAll(selector)]
    .filter(node => node.getClientRects().length > 0 && !node.disabled && !(exclude && node.closest(exclude)))
    .map(node => ({ node, primary: primaryName(node), full: cleanText(node.textContent) }));
  const identical = labelled.find(item => item.primary === expected || item.full === expected);
  if (identical || exact) return identical?.node;
  const fits = (text, limit = LOOSE_MATCH_LIMIT) => text.includes(expected) && text.length <= expected.length * limit;
  return labelled
    .filter(item => (fits(item.primary) || fits(item.full)) && !item.node.closest(CHROME))
    .sort((one, two) => one.primary.length - two.primary.length)[0]?.node;
}

async function waitForControl(document, name, selector, timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const control = findControl(document, name, { selector });
    if (control) return control;
    await wait(120);
  }
  throw new Error(`Atlas could not find “${name}” on the current screen.`);
}

function setNativeValue(control, value) {
  const view = control.ownerDocument.defaultView;
  const prototype = control instanceof view.HTMLSelectElement
    ? view.HTMLSelectElement.prototype
    : control instanceof view.HTMLTextAreaElement
      ? view.HTMLTextAreaElement.prototype
      : view.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set.call(control, value);
  control.dispatchEvent(new view.Event('input', { bubbles: true }));
  control.dispatchEvent(new view.Event('change', { bubbles: true }));
}

function fieldByLabel(document, label) {
  const expected = cleanText(label);
  const wrapper = [...document.querySelectorAll('label, .field-row, .hrm-field')]
    .find(node => cleanText(node.textContent).includes(expected));
  return wrapper?.querySelector('input, select, textarea');
}

function installLiveCue(document) {
  if (document.getElementById('atlas-scenario-cue')) return;
  const style = document.createElement('style');
  style.id = 'atlas-scenario-cue';
  style.textContent = `
    .atlas-live-target { position: relative !important; z-index: 9999 !important; outline: 4px solid #7c3aed !important; outline-offset: 5px !important; box-shadow: 0 0 0 11px rgba(124,58,237,.2) !important; animation: atlasLivePulse .8s ease 2; }
    .atlas-human-cursor { position: fixed; left: 0; top: 0; z-index: 10001; width: 22px; height: 22px; pointer-events: none; color: #6d28d9; filter: drop-shadow(0 3px 3px rgba(0,0,0,.25)); transition: transform .5s cubic-bezier(.22,.8,.25,1); }
    .atlas-human-cursor::before { content: '➤'; display: block; font-size: 24px; transform: rotate(-35deg); }
    @keyframes atlasLivePulse { 50% { outline-offset: 10px; box-shadow: 0 0 0 18px rgba(124,58,237,0); } }
  `;
  document.head.appendChild(style);
  const cursor = document.createElement('span');
  cursor.className = 'atlas-human-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cursor);
}

async function actOn(document, control, action = 'click', pace = 1) {
  document.querySelectorAll('.atlas-live-target').forEach(node => node.classList.remove('atlas-live-target'));
  control.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  await wait(240 * pace);
  const rect = control.getBoundingClientRect();
  const cursor = document.querySelector('.atlas-human-cursor');
  if (cursor) cursor.style.transform = `translate(${Math.max(4, rect.left + Math.min(rect.width * .72, rect.width - 6))}px, ${Math.max(4, rect.top + Math.min(rect.height * .62, rect.height - 4))}px)`;
  control.dispatchEvent(new document.defaultView.MouseEvent('mousemove', { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
  control.dispatchEvent(new document.defaultView.MouseEvent('mouseover', { bubbles: true }));
  control.dispatchEvent(new document.defaultView.MouseEvent('mouseenter', { bubbles: false }));
  control.classList.add('atlas-live-target');
  await wait(420 * pace);
  if (action === 'click') control.click();
  else if (action === 'focus') control.focus();
  await wait(540 * pace);
}

async function humanType(document, control, value, pace = 1) {
  await actOn(document, control, 'focus', pace);
  if (control instanceof document.defaultView.HTMLSelectElement) {
    const option = (value ? [...control.options].find(item => item.value && cleanText(item.textContent).includes(cleanText(value))) : null)
      || [...control.options].find(item => item.value && !item.disabled);
    if (option) setNativeValue(control, option.value);
    await wait(380 * pace);
    return;
  }
  const type = control.getAttribute('type');
  if (['date', 'time', 'number'].includes(type)) {
    setNativeValue(control, value);
    await wait(420 * pace);
    return;
  }
  setNativeValue(control, '');
  let typed = '';
  for (const character of String(value)) {
    typed += character;
    setNativeValue(control, typed);
    await wait(Math.max(18, 48 * pace));
  }
}

async function humanScroll(document, direction = 1, pace = 1) {
  document.defaultView.scrollBy({ top: 260 * direction, behavior: 'smooth' });
  await wait(520 * pace);
}

function moduleForScenario(scenario) {
  const configured = livePlanFor(scenario.id)?.module;
  if (configured) return configured;
  const searchable = cleanText([scenario.category, scenario.title, ...(scenario.tags || [])].join(' '));
  if (scenario.id === 'emp-overtime' || searchable.includes('leave') || searchable.includes('employee request') || searchable.includes('approval')) return 'HRM';
  if (searchable.includes('payroll') || searchable.includes('earning') || searchable.includes('deduction') || searchable.includes('payslip')) return 'Payroll';
  if (searchable.includes('timekeeping') || searchable.includes('punch') || searchable.includes('shift')) return 'Timekeeping';
  if (searchable.includes('policy') || searchable.includes('masterfile') || searchable.includes('company')) return 'Core';
  return 'HRM';
}

/**
 * A sidebar entry and the page heading it opens often carry the same label, so
 * a repeated label means "the one further down the page"; otherwise prefer a
 * destination that is not already selected.
 */
async function openEntryLabel(document, label, previousLabel, timeout = 5000) {
  const expected = cleanText(label);
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const matches = [...document.querySelectorAll('button, [role="button"], a')].filter(node => {
      const actual = cleanText(node.getAttribute('aria-label') || node.textContent);
      return node.getClientRects().length > 0 && !node.disabled && (actual === expected || actual.includes(expected));
    });
    const control = previousLabel === label
      ? matches.at(-1)
      : matches.find(node => !node.classList.contains('selected')) || matches[0];
    if (control) return control;
    await wait(120);
  }
  return null;
}

function valueForField(control, index = 0) {
  const type = control.getAttribute('type');
  if (type === 'date') return index % 2 ? '2026-08-21' : '2026-08-20';
  if (type === 'time') return index % 2 ? '18:00' : '09:00';
  if (type === 'number') return String(index ? 1000 + index * 250 : 1000);
  if (type === 'email') return 'scenario@atlas.demo';
  return 'Scenario Studio live simulation';
}

/**
 * Fill the form in `scope`, which is the open dialog when there is one. Filling
 * the whole document instead meant an approval queue's filter dropdowns were
 * treated as the step's data entry and reported as fields completed.
 */
async function fillVisibleFields(document, scope = document) {
  const controls = [...scope.querySelectorAll('input, select, textarea')]
    .filter(control => control.getClientRects().length > 0 && !control.disabled && !control.readOnly && control.getAttribute('type') !== 'file' && control.getAttribute('type') !== 'hidden');
  let changed = 0;
  for (let index = 0; index < controls.length; index += 1) {
    const control = controls[index];
    if (control.matches('[type="checkbox"], [type="radio"]')) {
      if (control.required && !control.checked) control.click();
      continue;
    }
    if (control instanceof document.defaultView.HTMLSelectElement) {
      const option = [...control.options].find(item => item.value && !item.disabled && cleanText(item.textContent) !== 'all');
      if (option && (!control.value || control.required)) { setNativeValue(control, option.value); changed += 1; }
    } else if (!control.value && !cleanText(control.getAttribute('placeholder')).includes('search')) {
      setNativeValue(control, valueForField(control, index));
      changed += 1;
    }
  }
  const target = controls.find(control => control.required) || controls[0];
  if (target) await actOn(document, target, 'focus');
  return changed;
}

/**
 * Resolve the embedded app's document once it has a layout box. An iframe
 * inside a hidden container loads but never lays out, and every element in it
 * reports no client rects — indistinguishable from "the control is missing",
 * which is how a first run used to fail with a misleading message.
 */
/**
 * Navigate the embedded frame and resolve once the new document is really in
 * place. Polling for an element instead raced the navigation: during the swap
 * the frame still answers with the *previous* document, so the driver bound
 * itself to a page that was about to be thrown away and then reported the
 * next control as missing.
 */
function reloadLiveFrame(ref, url = '/?atlasLiveScenario=1', timeout = 8000) {
  const frame = ref.current;
  if (!frame) return Promise.resolve();
  return new Promise(resolve => {
    let settled = false;
    const done = () => { if (settled) return; settled = true; frame.removeEventListener('load', done); resolve(); };
    frame.addEventListener('load', done);
    window.setTimeout(done, timeout);
    frame.contentWindow?.location.replace(url);
  });
}

async function waitForLiveFrame(ref, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const document = ref.current?.contentDocument;
    const anchor = document?.querySelector('.brand-rail button');
    if (anchor?.getClientRects().length) return document;
    await wait(150);
  }
  return null;
}

/**
 * The name to report for a control. A workspace card's `textContent` is its
 * title plus its whole description, which read as one run-on string in the
 * ledger, so an accessible name or the card's own heading is preferred.
 */
const controlLabel = node => {
  const heading = node?.querySelector?.('h1, h2, h3, h4, strong');
  const text = String(node?.getAttribute?.('aria-label') || heading?.textContent || node?.textContent || '')
    .replace(/\s+/g, ' ').trim();
  return text.length > 64 ? `${text.slice(0, 61)}…` : text || node?.tagName?.toLowerCase() || 'control';
};

/**
 * Find the first planned target that is actually on screen. Every target is
 * tried as an exact label before any is tried as a substring, because a loose
 * match on an early candidate otherwise wins over an exact match on a later
 * one — "payslip" hitting the "Payslips & Payroll History" nav entry instead of
 * the Download payslip button. Returning which label matched is what lets the
 * step ledger say what Atlas touched rather than claiming a step ran when it
 * only clicked whatever happened to be first.
 */
function resolveTarget(root, targets, options = {}) {
  // A `css:` target names the control by selector. The top-bar company
  // switcher is labelled with whichever company is active, so it has no stable
  // text to search for — matching its literal name broke the moment another
  // scenario left a different company selected.
  for (const label of targets.filter(item => item.startsWith('css:'))) {
    const control = [...root.querySelectorAll(label.slice(4))].find(node => node.getClientRects().length > 0 && !node.disabled);
    if (control) return { control, label };
  }
  const named = targets.filter(item => !item.startsWith('css:'));
  for (const exact of [true, false]) {
    for (const label of named) {
      const control = findControl(root, label, { ...options, exact });
      if (control) return { control, label };
    }
  }
  return null;
}

const STOP_WORDS = new Set(['open', 'view', 'the', 'and', 'for', 'with', 'from', 'this', 'that', 'select', 'choose', 'review', 'inspect', 'their', 'into', 'show']);
const keywords = targets => [...new Set(targets.join(' ').toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || [])].filter(word => !STOP_WORDS.has(word));

/**
 * A step often names a record that exists as a table row rather than a button
 * — "Open Vacation Leave" on a leave-balance matrix, "Select an employee row"
 * on a register. Rows are scored by how many of the step's own keywords they
 * contain, so a confident match can be acted on and a weak one still points
 * the highlight at the right row instead of the page heading.
 */
function bestRowMatch(document, targets) {
  const words = keywords(targets);
  if (!words.length) return null;
  return [...document.querySelectorAll('tbody tr')]
    .filter(row => row.getClientRects().length > 0)
    .map(row => {
      const text = cleanText(row.textContent);
      return { row, score: words.filter(word => text.includes(word)).length };
    })
    .filter(item => item.score > 0)
    .sort((one, two) => two.score - one.score)[0] || null;
}

/**
 * The closest thing on screen worth highlighting when no planned target
 * exists. The groups are tried in order rather than as one selector list —
 * `querySelectorAll` returns document order, so a combined selector handed
 * back the page heading every time instead of the record the step is about.
 */
const FALLBACK_SELECTORS = ['[role="dialog"] h2, [role="dialog"] h3', 'tbody tr', '.metric-card, .workspace-card', 'h2, h3', 'h1'];

function fallbackTarget(document) {
  for (const selector of FALLBACK_SELECTORS) {
    const node = [...document.querySelectorAll(selector)].find(item => item.getClientRects().length > 0);
    if (node) return node;
  }
  return null;
}

async function clickSequence(document, labels, pace) {
  const touched = [];
  for (const label of labels) {
    const found = resolveTarget(document, [label]);
    if (!found) break;
    // Read the label first: a wizard reuses its Next button across steps, so
    // after the click the same element already reads "Create transaction".
    const used = controlLabel(found.control);
    await actOn(document, found.control, 'click', pace);
    touched.push(used);
    await wait(200 * pace);
  }
  return touched;
}

/**
 * Run exactly one planned step and report honestly what happened.
 *
 * `done` means a planned control was found and used. `simulated` means no
 * planned control existed, so Atlas highlighted the nearest live element to
 * keep the walkthrough moving. `blocked` means the screen offered nothing at
 * all. Every step ends in one of the three — none is silently skipped.
 */
/** Steps that name a record rather than a screen, and so must open the row. */
const RECORD_ACTIONS = /\b(request|record|transaction|application|entry|item|row|correction|loan|payslip|event|value|line|employee)\b/i;

async function executePlannedStep(document, step, pace = 1) {
  if (step.kind === 'navigate') {
    const touched = [];
    for (let index = 0; index < step.entry.length; index += 1) {
      const label = step.entry[index];
      const control = await openEntryLabel(document, label, step.entry[index - 1]);
      if (!control) return { state: 'blocked', message: `Atlas could not find “${label}” on the current screen.`, touched };
      await actOn(document, control, 'click', pace);
      // Report the destination that was asked for, not the card's own copy.
      touched.push(label);
    }
    return { state: touched.length ? 'done' : 'simulated', message: touched.length ? `Opened ${touched.join(' › ')}.` : 'Already on the target screen.', touched };
  }

  if (step.kind === 'form') {
    const touched = [];
    // Only the openers a screen actually offers, so a read-only inquiry screen
    // is not mistaken for a data-entry screen just because a word matched.
    const opener = document.querySelector('[role="dialog"]')
      ? null
      : resolveTarget(document, step.targets) || resolveTarget(document, ['Apply', 'Add record', 'Add', 'Create Transaction', 'Request', 'Edit']);
    if (opener) {
      const label = controlLabel(opener.control);
      await actOn(document, opener.control, 'click', pace);
      touched.push(label);
      await wait(320 * pace);
    }

    const dialog = document.querySelector('[role="dialog"]');
    let typed = 0;
    if (step.fields) {
      for (const [label, value] of Object.entries(step.fields)) {
        const field = fieldByLabel(document, label);
        if (!field) continue;
        await humanType(document, field, value, pace);
        typed += 1;
      }
    }
    // Without a named field list, only a form Atlas actually opened is filled.
    // Sweeping the whole page would type into an inquiry screen's filters and
    // then report them as the step's data entry.
    if (!typed && dialog) typed = await fillVisibleFields(document, dialog);
    touched.push(...await clickSequence(document, step.after, pace));

    if (typed) return { state: 'done', message: `Completed ${typed} ${plural(typed, 'field')}${touched.length ? ` after using ${touched.join(', ')}` : ''}.`, touched };
    if (touched.length) return { state: 'done', message: `Used ${touched.join(', ')}, but no editable field was exposed.`, touched };
    const anchor = fallbackTarget(document);
    if (!anchor) return { state: 'blocked', message: 'This screen offered no form to complete.', touched };
    await actOn(document, anchor, 'focus', pace);
    return { state: 'simulated', message: `No editable form was reachable here; Atlas highlighted ${controlLabel(anchor)} instead.`, touched };
  }

  // An open dialog is the foreground of the screen, so its controls outrank
  // anything behind it. Without this, "Click Approve" in an approval modal
  // resolved to the "Approved" status filter still visible underneath.
  const options = step.kind === 'commit' ? { exclude: FILTER_TABS } : {};
  const dialog = document.querySelector('[role="dialog"]');
  let found = (dialog && resolveTarget(dialog, step.targets, options))
    || resolveTarget(document, step.targets, options)
    || (step.kind === 'open' ? resolveTarget(document, ['Row actions', 'View Details', 'View']) : null);

  /*
   * A verification step that names a record but matched nothing is looking at
   * a register: the record opens from the row menu, not from a control called
   * after the step's own wording. This only runs when nothing was found, so a
   * step that already resolved is never dragged somewhere else.
   */
  if (!found && step.kind === 'inspect' && RECORD_ACTIONS.test(step.action) && !document.querySelector('[role="dialog"]')) {
    const menu = resolveTarget(document, ['Row actions']);
    if (menu) {
      await actOn(document, menu.control, 'click', pace);
      found = resolveTarget(document, ['View Details', 'View request', 'Details', 'View']) || { control: menu.control, label: 'Row actions' };
    }
  }

  // A register's decisions live in the row menu, not on the record's read-only
  // view. If the decision is not on screen, reach for the menu before giving up.
  if (!found && step.kind === 'commit') {
    const close = dialog && resolveTarget(dialog, ['Close']);
    if (close) await actOn(document, close.control, 'click', pace);
    const menu = resolveTarget(document, ['Row actions']);
    if (menu) {
      await actOn(document, menu.control, 'click', pace);
      found = resolveTarget(document, step.targets, options);
    }
  }

  // The record a step names is often a table row rather than a control. Two or
  // more matching keywords is a confident hit; one is only good enough to aim
  // the highlight at.
  const row = step.kind === 'commit' ? null : bestRowMatch(document, step.targets);
  if (!found && row?.score >= 2) {
    await actOn(document, row.row, 'focus', pace);
    return { state: 'done', message: `Read the matching ${step.screen} row: ${controlLabel(row.row)}`, touched: [controlLabel(row.row)] };
  }

  if (!found) {
    const anchor = row?.row || fallbackTarget(document);
    if (!anchor) return { state: 'blocked', message: `None of ${step.targets.slice(0, 3).join(', ')} were on this screen.`, touched: [] };
    await humanScroll(document, 1, pace);
    await actOn(document, anchor, 'focus', pace);
    return {
      state: 'simulated',
      // A verification step that finds no named control has still read the
      // screen, which is a different thing from an action that could not run.
      message: step.kind === 'inspect'
        ? `No “${step.targets[0]}” control here, so Atlas read the live ${step.screen} result: ${controlLabel(anchor)}`
        : `“${step.targets[0]}” was not a control here; Atlas highlighted ${controlLabel(anchor)} instead.`,
      touched: [],
    };
  }

  // A deciding step stops on the control instead of firing it, so a catalog
  // walkthrough never writes to the live company on the viewer's behalf.
  const used = controlLabel(found.control);
  await actOn(document, found.control, step.committing ? 'focus' : 'click', pace);
  const touched = [used];

  // A register's status tabs filter the list; the record itself opens from the
  // row menu. A step that says it opens a request has to go through it, or the
  // following steps run against the list instead of the request.
  if (step.kind === 'open' && RECORD_ACTIONS.test(step.action) && !document.querySelector('[role="dialog"]')) {
    const menu = resolveTarget(document, ['Row actions']);
    if (menu) {
      await actOn(document, menu.control, 'click', pace);
      touched.push('Row actions');
      const detail = resolveTarget(document, ['View Details', 'View request', 'Details', 'View']);
      if (detail) {
        await actOn(document, detail.control, 'click', pace);
        touched.push(controlLabel(detail.control));
      }
    }
  }

  touched.push(...await clickSequence(document, step.after, pace));
  return {
    state: 'done',
    message: step.committing ? `Ready at “${touched[0]}” — select it yourself in the live window to commit.` : `Used ${touched.join(', ')}.`,
    touched,
  };
}

/**
 * Run a contiguous range of planned steps, reporting one outcome per step.
 * The caller decides the range, so the same loop serves "run everything" and
 * "run just the next step" without a second implementation.
 */
async function runScenarioPlan(document, plan, report, pace = 1, from = 0, to = plan.length) {
  for (let index = from; index < to; index += 1) {
    const step = plan[index];
    report(index, { state: 'running', message: step.narration, touched: [] });
    let outcome;
    try {
      outcome = await executePlannedStep(document, step, pace);
    } catch (error) {
      outcome = { state: 'blocked', message: error.message || 'The step could not be performed.', touched: [] };
    }
    report(index, outcome);
    // Losing the entry path means every later step would run on the wrong
    // screen, so navigation is the one failure that stops the run.
    if (outcome.state === 'blocked' && step.kind === 'navigate') return false;
    await wait(260 * pace);
  }
  return true;
}

async function enterRoleAndModule(document, scenario) {
  const role = await waitForControl(document, scenario.roleLabel, '.role-switch button');
  if (role.getAttribute('aria-pressed') !== 'true') await actOn(document, role);
  const module = moduleForScenario(scenario);
  const rail = await waitForControl(document, module, '.brand-rail button');
  await actOn(document, rail);
  return module;
}

const stateLabels = { pending: 'Not run', running: 'Running', done: 'Performed', simulated: 'Approximated', blocked: 'Unavailable' };
const stateIcons = { done: CheckCircle, simulated: Eye, blocked: WarningCircle };

function StepLedger({ plan, ledger, cursor, onSelectStep, activeStep }) {
  const performed = ledger.filter(row => row.state === 'done').length;
  const accounted = ledger.filter(row => row.state !== 'pending' && row.state !== 'running').length;
  return (
    <section className="scenario-ledger" aria-label="Step-by-step ledger">
      <header>
        <div>
          <span>Step-by-step ledger</span>
          <h3>Every step in this story, and what the live app did with it</h3>
        </div>
        <strong>{accounted} of {plan.length} {plural(plan.length, 'step')} accounted for · {performed} performed</strong>
      </header>
      <ol>
        {plan.map((step, index) => {
          const row = ledger[index] || { state: 'pending' };
          const KindIcon = kindIcons[step.kind] || Eye;
          const StateIcon = stateIcons[row.state];
          return (
            <li key={`${step.screen}-${index}`} className={`scenario-ledger-row ${row.state} ${index === activeStep ? 'viewing' : ''}`}>
              <button type="button" onClick={() => onSelectStep(index)} aria-current={index === cursor ? 'step' : undefined}>
                <span className="scenario-ledger-index">{index + 1}</span>
                <span className="scenario-ledger-body">
                  <span className="scenario-ledger-kind"><KindIcon weight="fill" />{kindLabels[step.kind]}<em>{step.screen}</em></span>
                  <strong>{step.action}</strong>
                  <span className="scenario-ledger-detail">{step.detail}</span>
                  <span className="scenario-ledger-targets">Atlas looks for {step.targets.slice(0, 3).map(label => `“${label}”`).join(' · ')}</span>
                  {step.expected && <span className="scenario-ledger-expected"><CheckCircle weight="fill" />{step.expected}</span>}
                  {row.message && <span className="scenario-ledger-result">{row.message}</span>}
                </span>
                <span className={`scenario-ledger-state ${row.state}`}>{StateIcon ? <StateIcon weight="fill" /> : null}{stateLabels[row.state]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <footer>
        <CursorClick weight="duotone" />
        <span><strong>Performed</strong> means a planned control was found and used. <strong>Approximated</strong> means the control was not on that screen, so Atlas highlighted the closest live element instead. <strong>Unavailable</strong> means the screen offered nothing to act on. No step is skipped without a recorded outcome — and a <strong>Decide</strong> step always stops on the control rather than firing it, so this walkthrough never saves, submits, or approves anything on your behalf. Use the Full end-to-end tab for a run that does write, in its own resettable sandbox company.</span>
      </footer>
    </section>
  );
}

function ScenarioPlayer({ scenario, module, onSelectCompany }) {
  const plan = useMemo(() => stepPlanFor(scenario), [scenario]);
  const needs = useMemo(() => needsFor(scenario.id), [scenario.id]);
  const blankLedger = useCallback(() => plan.map(() => ({ state: 'pending', message: '', touched: [] })), [plan]);

  const [view, setView] = useState('storyboard');
  const [activeStep, setActiveStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1600);

  const iframeRef = useRef(null);
  const entered = useRef(false);
  const [frameKey, setFrameKey] = useState(0);
  const [ledger, setLedger] = useState(blankLedger);
  const [cursor, setCursor] = useState(0);
  const [running, setRunning] = useState(false);
  const [pace, setPace] = useState(0.7);
  const [status, setStatus] = useState('Load the live app, then run the story one step at a time or end to end.');
  const prepared = useRef(false);
  const [preparation, setPreparation] = useState(null);

  useEffect(() => {
    if (!playing || view !== 'storyboard') return undefined;
    if (activeStep >= plan.length - 1) {
      const stop = window.setTimeout(() => setPlaying(false), speed * .65);
      return () => window.clearTimeout(stop);
    }
    const timer = window.setTimeout(() => setActiveStep(step => step + 1), speed);
    return () => window.clearTimeout(timer);
  }, [playing, activeStep, plan, speed, view]);

  const report = useCallback((index, outcome) => {
    setLedger(rows => rows.map((row, position) => (position === index ? { ...row, ...outcome } : row)));
    setActiveStep(index);
    setCursor(outcome.state === 'running' ? index : index + 1);
    if (outcome.message) setStatus(outcome.message);
  }, []);

  const summarise = rows => {
    const counts = rows.reduce((totals, row) => ({ ...totals, [row.state]: (totals[row.state] || 0) + 1 }), {});
    const parts = ['done', 'simulated', 'blocked']
      .filter(key => counts[key])
      .map(key => `${counts[key]} ${stateLabels[key].toLowerCase()}`);
    return `Live run finished in the real ${module} workspace — ${parts.join(', ') || 'nothing to report'}.`;
  };

  /**
   * Create whatever this story needs on screen before the run starts.
   *
   * A story that reads posted payroll cannot demonstrate anything against a
   * company that has never run payroll. Preparation happens in the resettable
   * sandbox, never in a client company, and the frame is pointed there so the
   * run and the prepared records are looking at the same tenant.
   */
  const prepare = async () => {
    if (!needs.length || prepared.current) return;
    setStatus(`Preparing ${needs.map(need => need.label.toLowerCase()).join(' and ')} in the sandbox…`);
    const result = ensureScenarioData(scenario.id, SANDBOX_COMPANY_ID);
    setPreparation(result);
    onSelectCompany?.(SANDBOX_COMPANY_ID);
    // The embedded app reads its company and its payroll at load, so it has to
    // be reloaded before it can see any of this.
    await reloadLiveFrame(iframeRef);
    await waitForLiveFrame(iframeRef);
    // The reloaded app is back on its default actor and module.
    entered.current = false;
    prepared.current = true;
  };

  const runRange = async (from, to) => {
    if (running) return;
    setView('live');
    setPlaying(false);
    setRunning(true);
    try {
      // The embedded window stays mounted while the storyboard is showing, so
      // on the first run it may not have been laid out yet — and an element
      // with no layout box is invisible to the driver.
      if (!await waitForLiveFrame(iframeRef)) { setStatus('Atlas is still loading in the embedded window. Try again in a moment.'); return; }
      await prepare();
      const document = await waitForLiveFrame(iframeRef);
      if (!document) { setStatus('Atlas is still loading in the embedded window. Try again in a moment.'); return; }
      installLiveCue(document);
      if (!entered.current) {
        setStatus(`Switching the live session to ${scenario.roleLabel} and opening ${module}…`);
        await enterRoleAndModule(document, scenario);
        entered.current = true;
      }
      const collected = [];
      await runScenarioPlan(document, plan, (index, outcome) => {
        collected[index] = outcome;
        report(index, outcome);
      }, pace, from, to);
      const settled = collected.filter(row => row && row.state !== 'running');
      if (to >= plan.length) setStatus(summarise(ledger.map((row, index) => collected[index] || row)));
      else if (settled.length) setStatus(settled.at(-1).message);
    } catch (error) {
      setStatus(error.message || 'The live run stopped because a control was unavailable.');
    } finally {
      setRunning(false);
    }
  };

  const resetLive = () => {
    entered.current = false;
    prepared.current = false;
    setFrameKey(value => value + 1);
    setLedger(blankLedger());
    setCursor(0);
    setStatus('Live app reset. The story can be run again from step 1.');
  };

  const goTo = index => { setPlaying(false); setActiveStep(Math.max(0, Math.min(plan.length - 1, index))); };
  const complete = cursor >= plan.length;

  return (
    <section className="scenario-player">
      <header className="scenario-story-head">
        <div className="scenario-story-title">
          <p className="scenario-story-tags">
            <span className={`scenario-role-pill ${scenario.role}`}>{scenario.roleLabel}</span>
            <span className="scenario-category-pill">{scenario.category}</span>
            <span className="scenario-module-pill">{module}</span>
          </p>
          <h2>{scenario.title}</h2>
          <blockquote>{scenario.story}</blockquote>
        </div>
        <div className="scenario-outcome">
          <CheckCircle weight="duotone" />
          <div><span>Expected outcome</span><strong>{scenario.value.charAt(0).toUpperCase() + scenario.value.slice(1)}.</strong></div>
        </div>
      </header>

      <div className="scenario-runbar">
        <div className="scenario-view-switch" role="tablist" aria-label="Demonstration mode">
          <button type="button" role="tab" aria-selected={view === 'storyboard'} className={view === 'storyboard' ? 'active' : ''} onClick={() => setView('storyboard')}><Sparkle weight="fill" /> Storyboard</button>
          <button type="button" role="tab" aria-selected={view === 'live'} className={view === 'live' ? 'active' : ''} onClick={() => setView('live')}><Monitor weight="fill" /> Live Atlas run</button>
        </div>

        {view === 'storyboard' ? (
          <div className="scenario-playback">
            <label>Speed<select value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value="2400">Slow</option><option value="1600">Normal</option><option value="900">Fast</option></select></label>
            <button type="button" onClick={() => { setActiveStep(0); setPlaying(true); }} aria-label="Restart storyboard"><ArrowCounterClockwise /></button>
            <button type="button" onClick={() => goTo(activeStep - 1)} disabled={activeStep === 0} aria-label="Previous step"><CaretLeft /></button>
            <button type="button" className="scenario-play" onClick={() => setPlaying(value => !value)}>{playing ? <Pause weight="fill" /> : <Play weight="fill" />}{playing ? 'Pause' : 'Play'}</button>
            <button type="button" onClick={() => goTo(activeStep + 1)} disabled={activeStep === plan.length - 1} aria-label="Next step"><CaretRight /></button>
          </div>
        ) : (
          <div className="scenario-playback">
            <label>Pace<select value={pace} onChange={event => setPace(Number(event.target.value))} disabled={running}><option value="1">Human</option><option value="0.7">Focused</option><option value="0.4">Fast</option></select></label>
            <button type="button" onClick={resetLive} disabled={running} aria-label="Reset the live app"><ArrowCounterClockwise /></button>
            <button type="button" onClick={() => runRange(cursor, cursor + 1)} disabled={running || complete}><SkipForward weight="fill" /> Run step {Math.min(cursor + 1, plan.length)}</button>
            <button type="button" className="scenario-play" onClick={() => runRange(0, plan.length)} disabled={running}>{running ? <Pause weight="fill" /> : <Play weight="fill" />}{running ? 'Running…' : 'Run all steps'}</button>
          </div>
        )}
      </div>

      <div className="scenario-status" aria-live="polite">
        <span>{view === 'storyboard' ? `Step ${activeStep + 1} of ${plan.length}` : complete ? 'Complete' : `Next: step ${Math.min(cursor + 1, plan.length)}`}</span>
        <strong>{view === 'storyboard' ? plan[activeStep].narration : status}</strong>
        <div className="scenario-progress-track" aria-hidden="true"><i style={{ width: `${((view === 'storyboard' ? activeStep + 1 : cursor) / plan.length) * 100}%` }} /></div>
      </div>

      {!!needs.length && <div className={`scenario-prep ${preparation?.failed?.length ? 'failed' : ''}`}>
        <Database weight="duotone" />
        <div>
          <strong>{preparation ? describePreparation(preparation) : `This story needs ${needs.map(need => need.label.toLowerCase()).join(' and ')} to demonstrate anything.`}</strong>
          <span>{needs.map(need => need.why).join(' ')} Atlas creates it in the resettable <em>Atlas Simulator Sandbox</em> when the run starts, so no client company gets invented payroll.</span>
        </div>
      </div>}

      <div className={`scenario-viewport ${view}`}>
        {view === 'storyboard'
          ? <SimulatorFrame scenario={scenario} plan={plan} activeStep={activeStep} playing={playing} module={module} />
          : null}
        <div className="scenario-live-window" hidden={view !== 'live'}>
          <div className="scenario-live-window-bar">
            <span className="scenario-browser-dots"><i /><i /><i /></span>
            <em>atlas.app / {scenario.id}</em>
            <ArrowSquareOut />
          </div>
          <iframe
            key={frameKey}
            ref={iframeRef}
            title={`Live Atlas — ${scenario.title}`}
            src="/?atlasLiveScenario=1"
            onLoad={() => setStatus('Atlas is loaded. This window is the real app — run the story, or click into it yourself at any time.')}
          />
        </div>
      </div>

      <StepLedger plan={plan} ledger={ledger} cursor={cursor} activeStep={activeStep} onSelectStep={goTo} />
    </section>
  );
}

async function followEndToEndPath(document, stage, report) {
  const role = await waitForControl(document, stage.actor, '.role-switch button');
  if (role.getAttribute('aria-pressed') !== 'true') await actOn(document, role);
  const module = await waitForControl(document, stage.module, '.brand-rail button');
  await actOn(document, module);
  for (const label of stage.entry || []) {
    report(`Opening ${label} in Atlas…`);
    await actOn(document, await waitForControl(document, label));
  }
}

function visibleFieldByLabel(document, label) {
  const expected = cleanText(label);
  const wrappers = [...document.querySelectorAll('label, .field-row, .hrm-field')]
    .filter(node => node.getClientRects().length > 0 && cleanText(node.textContent).includes(expected));
  return wrappers.map(node => node.querySelector('input, select, textarea')).find(Boolean);
}

function lastVisibleControl(document, name) {
  const expected = cleanText(name);
  return [...document.querySelectorAll('button, [role="button"]')].filter(node => {
    const actual = cleanText(node.getAttribute('aria-label') || node.textContent);
    return node.getClientRects().length > 0 && !node.disabled && (actual === expected || actual.includes(expected));
  }).at(-1);
}

async function fillHumanFields(document, values, report, pace) {
  for (const [label, value] of Object.entries(values)) {
    const field = visibleFieldByLabel(document, label);
    if (!field) continue;
    report(`Typing ${label}: ${value}`);
    await humanType(document, field, value, pace);
  }
}

async function performHumanStage(document, stage, report, pace = 1) {
  const action = stage.uiAction || (stage.id.includes('reject') ? 'reject' : stage.id.includes('approve') ? 'approve' : stage.id.includes('employee-input') ? 'overtime-form' : 'inspect');
  await humanScroll(document, 1, pace);
  await humanScroll(document, -1, pace);

  if (action === 'overtime-form') {
    const apply = findControl(document, 'Apply');
    if (apply) { report('Hovering over Apply, then opening the overtime form…'); await actOn(document, apply, 'click', pace); }
    await fillHumanFields(document, {
      'Overtime Start Date': '2025-11-14', 'Overtime Start Time': '18:00',
      'Overtime End Date': '2025-11-14', 'Overtime End Time': '20:00', Reason: 'Month-end payroll processing support',
    }, report, pace);
    const submit = lastVisibleControl(document, 'Submit');
    if (submit) { report('Reviewing the completed form and hovering over Submit…'); await actOn(document, submit, 'focus', pace); }
    return;
  }

  if (action === 'time-form') {
    const apply = findControl(document, 'Apply');
    if (apply) { report('Opening the actual Time In/Out correction form…'); await actOn(document, apply, 'click', pace); }
    const radio = [...document.querySelectorAll('input[type="radio"]')].find(node => node.getClientRects().length > 0 && !node.disabled);
    if (radio) { report('Choosing which time entry to correct…'); await actOn(document, radio, 'click', pace); }
    await fillHumanFields(document, {
      'Actual Clock-in Date': '2025-11-13', 'Actual Clock-in Time': '09:30',
      'Corrected Clock-In Date': '2025-11-13', 'Corrected Clock-In Time': '08:00',
      Reason: 'Biometrics outage reference BIO-2025-1113 attached',
    }, report, pace);
    const submit = lastVisibleControl(document, 'Submit');
    if (submit) await actOn(document, submit, 'focus', pace);
    return;
  }

  if (action === 'computation-inspect') {
    const search = [...document.querySelectorAll('input')].find(node => node.getClientRects().length > 0 && cleanText(node.placeholder).includes('search code'));
    if (search) { report('Clicking the computation search and typing ERN-002…'); await humanType(document, search, 'ERN-002', pace); }
    const row = [...document.querySelectorAll('tbody tr')].find(node => node.getClientRects().length > 0 && cleanText(node.textContent).includes('ern-002'));
    if (row) { report('Hovering over ERN-002 to inspect its formula, version, and status…'); await actOn(document, row, 'focus', pace); }
    return;
  }

  if (action === 'statutory-inspect') {
    const row = [...document.querySelectorAll('tbody tr, .statutory-card, .settings-card')].find(node => node.getClientRects().length > 0);
    if (row) { report('Scrolling through the effective statutory versions and hovering over the active record…'); await actOn(document, row, 'focus', pace); }
    const details = findControl(document, 'View Details') || findControl(document, 'View');
    if (details) await actOn(document, details, 'focus', pace);
    return;
  }

  if (action === 'policy-inspect') {
    const threshold = visibleFieldByLabel(document, 'Threshold') || visibleFieldByLabel(document, 'Protected minimum');
    if (threshold) { report('Inspecting the protected minimum without changing it…'); await actOn(document, threshold, 'focus', pace); }
    const policyCard = [...document.querySelectorAll('.policy-card, .computation-card, section')].find(node => node.getClientRects().length > 0 && cleanText(node.textContent).includes('take-home'));
    if (policyCard) await actOn(document, policyCard, 'focus', pace);
    return;
  }

  if (action === 'add-earning' || action === 'add-deduction' || action === 'add-large-deduction') {
    const add = findControl(document, 'Add');
    if (add) { report(`Hovering over Add and opening the ${action === 'add-earning' ? 'earning' : 'deduction'} form…`); await actOn(document, add, 'click', pace); }
    const values = action === 'add-earning'
      ? { 'Earning Code': 'ERN-E2E-001', 'Earning Name': 'Allowance', Employee: 'John Collins Doe', 'Earning Frequency': 'One-time', 'Basis/Unit': 'Fixed amount', Amount: '3000', 'Effectivity Date': '2025-11-01', 'Period Start': '2025-11-01', 'Period End': '2025-11-30', Remarks: 'Scenario mobile allowance', Status: 'Active' }
      : action === 'add-large-deduction'
        ? { 'Deduction Code': 'DED-E2E-PROTECT', 'Deduction Name': 'Other', Employee: 'John Collins Doe', 'Deduction Amount': '25000', 'Deduction Frequency': 'Once', 'Start Date': '2025-11-01', 'End Date': '2025-11-30', Balance: '25000', Remarks: 'Scenario protected equipment recovery', Status: 'Active' }
        : { 'Deduction Code': 'DED-E2E-001', 'Deduction Name': 'Other', Employee: 'John Collins Doe', 'Deduction Amount': '850', 'Deduction Frequency': 'Once', 'Start Date': '2025-11-01', 'End Date': '2025-11-30', Balance: '850', Remarks: 'Scenario equipment deduction', Status: 'Active' };
    await fillHumanFields(document, values, report, pace);
    const save = lastVisibleControl(document, 'Save record') || lastVisibleControl(document, 'Save');
    if (save) { report('Reviewing all entered values before saving…'); await actOn(document, save, 'focus', pace); }
    return;
  }

  if (['reject', 'approve', 'payroll-submit'].includes(action)) {
    const rowActions = findControl(document, 'Row actions');
    if (rowActions) { report('Hovering over the transaction actions menu…'); await actOn(document, rowActions, 'click', pace); }
    const labels = action === 'reject' ? ['Reject'] : action === 'approve' ? ['Approve', 'Post'] : ['Post as Draft', 'Submit for Review', 'Submit for Approval'];
    const target = labels.map(label => findControl(document, label)).find(Boolean);
    if (target) { report(`Selecting ${cleanText(target.textContent)}…`); await actOn(document, target, 'click', pace); }
    const remarks = visibleFieldByLabel(document, 'Remarks') || visibleFieldByLabel(document, 'Approver remarks');
    if (remarks) await humanType(document, remarks, action === 'reject' ? 'Verify the supporting overtime or biometrics detail before resubmission.' : 'Reviewed against the payroll computation and supporting records.', pace);
    const confirm = lastVisibleControl(document, action === 'reject' ? 'Reject' : 'Confirm') || lastVisibleControl(document, action === 'approve' ? 'Approve' : 'Submit');
    if (confirm) { report(`Hovering over the final ${action} decision…`); await actOn(document, confirm, 'focus', pace); }
    return;
  }

  if (action === 'payroll-create') {
    const create = findControl(document, 'Create Transaction');
    if (create) { report('Opening the real Add Payroll wizard…'); await actOn(document, create, 'click', pace); }
    const calendar = visibleFieldByLabel(document, 'Payroll calendar');
    if (calendar) await humanType(document, calendar, '', pace);
    const remarks = visibleFieldByLabel(document, 'Remarks');
    if (remarks) await humanType(document, remarks, 'Full end-to-end human simulation', pace);
    const next = lastVisibleControl(document, 'Next');
    if (next) await actOn(document, next, 'focus', pace);
    return;
  }

  if (action === 'edit') {
    const rowActions = findControl(document, 'Row actions');
    if (rowActions) await actOn(document, rowActions, 'click', pace);
    const edit = findControl(document, 'Update Transaction') || findControl(document, 'Edit');
    if (edit) await actOn(document, edit, 'click', pace);
    const remarks = visibleFieldByLabel(document, 'Remarks');
    if (remarks) await humanType(document, remarks, 'Corrected overtime support attached', pace);
    return;
  }

  if (action === 'policy-edit') {
    const threshold = visibleFieldByLabel(document, 'Threshold') || visibleFieldByLabel(document, 'Protected minimum');
    if (threshold) { report('Selecting the protected-minimum field and replacing 30 with 45…'); await humanType(document, threshold, '45', pace); }
    const save = lastVisibleControl(document, 'Save') || lastVisibleControl(document, 'Update');
    if (save) { report('Reviewing the policy impact before saving…'); await actOn(document, save, 'focus', pace); }
    return;
  }

  const inspectTarget = [...document.querySelectorAll('tbody tr, .metric-card, .workspace-card, h1, h2')].find(node => node.getClientRects().length > 0);
  if (inspectTarget) { report('Scrolling to the result and hovering to inspect its details…'); await actOn(document, inspectTarget, 'focus', pace); }
}

const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatTrailInputs = inputs => Object.entries(inputs || {}).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-PH') : value}`).join(' · ') || 'No variable inputs; resolved from a governed lookup.';

function EndToEndStudio({ companies, onSelectCompany }) {
  const iframeRef = useRef(null);
  const [journeyId, setJourneyId] = useState('payroll');
  const [activeIndex, setActiveIndex] = useState(0);
  const [state, setState] = useState(() => readEndToEndState());
  const [status, setStatus] = useState('Choose a journey, then run one handoff or the complete process.');
  const [running, setRunning] = useState(false);
  const [pace, setPace] = useState(0.7);
  const journey = E2E_JOURNEYS[journeyId];
  const sandbox = companies.find(item => item.companyId === SANDBOX_COMPANY_ID);
  const production = companies.find(item => item.companyId === PRODUCTION_SAMPLE_COMPANY_ID);

  const [stageLog, setStageLog] = useState({});

  useEffect(() => { seedProductionSampleData(); }, []);
  useEffect(() => {
    setActiveIndex(0);
    setState(readEndToEndState());
    setStageLog({});
    setStatus('Ready to run this cross-module journey in the Atlas sandbox.');
  }, [journeyId]);

  const reloadFrame = () => new Promise(resolve => {
    const frame = iframeRef.current;
    if (!frame) { resolve(); return; }
    const done = () => { frame.removeEventListener('load', done); window.setTimeout(resolve, 500); };
    frame.addEventListener('load', done);
    frame.contentWindow?.location.reload();
    window.setTimeout(done, 3500);
  });

  const showStage = async stage => {
    onSelectCompany?.(SANDBOX_COMPANY_ID);
    await reloadFrame();
    const document = iframeRef.current?.contentDocument;
    if (!document?.body) throw new Error('The embedded Atlas app is still loading.');
    installLiveCue(document);
    await followEndToEndPath(document, stage, setStatus);
    await performHumanStage(document, stage, setStatus, pace);
  };

  const note = (index, entry) => setStageLog(rows => ({ ...rows, [index]: { ...rows[index], ...entry } }));

  const runOne = async index => {
    const stage = journey.stages[index];
    setStatus(`${stage.actor}: ${stage.title}…`);
    note(index, { state: 'running', message: stage.guide });
    try {
      await showStage(stage);
      const next = applyEndToEndStage({ journeyId, stageIndex: index });
      setState(next);
      note(index, { state: 'done', message: `${stage.output} — ${stage.proof}.` });
      setActiveIndex(Math.min(index + 1, journey.stages.length - 1));
      setStatus(`${stage.title} completed. ${stage.detail}`);
    } catch (error) {
      note(index, { state: 'blocked', message: error.message || 'The stage could not be completed.' });
      throw error;
    }
  };

  // Stages share one loop so "run this handoff", "carry on from here" and "run
  // the whole journey" cannot drift apart in what they actually do.
  const runRange = async (from, to, { fresh = false } = {}) => {
    if (running) return;
    setRunning(true);
    try {
      if (fresh) { setState(resetEndToEndSandbox()); setStageLog({}); }
      for (let index = from; index < to; index += 1) await runOne(index);
      setStatus(to >= journey.stages.length
        ? `End-to-end journey complete. ${journey.stages.at(-1).detail}`
        : `${journey.stages[to - 1].title} completed.`);
    } catch (error) {
      setStatus(error.message || 'The journey stopped before completion.');
    } finally { setRunning(false); }
  };

  const reset = async () => {
    const next = resetEndToEndSandbox();
    setState(next); setActiveIndex(0); setStageLog({}); onSelectCompany?.(SANDBOX_COMPANY_ID);
    await reloadFrame();
    setStatus('Sandbox reset. HRM, timekeeping, policies, and payroll are back to their original sample data.');
  };

  const previewProduction = async () => {
    setState(readProductionSampleState());
    onSelectCompany?.(PRODUCTION_SAMPLE_COMPANY_ID);
    await reloadFrame();
    setStatus('Meridian production-like sample opened. Its company, employee, timekeeping, and posted payroll records are synthetic but fully linked.');
  };

  const metrics = state.metrics || {};
  const activeStage = journey.stages[activeIndex];
  const completedCount = journey.stages.filter(stage => state.journeyId === journeyId && state.completedStages?.includes(stage.id)).length;
  const journeyDone = completedCount >= journey.stages.length;
  return <section className="e2e-studio">
    <div className="e2e-intro">
      <div><span className="scenario-live-kicker"><i /> Full end-to-end · all actors</span><h2>One transaction, every Atlas view</h2><p>Each handoff writes to the same company-scoped data used by HRM, Timekeeping, Payroll, Core, and employee self-service.</p></div>
      <button type="button" className="button secondary" onClick={reset} disabled={running}><ArrowCounterClockwise /> Reset sandbox</button>
    </div>

    <div className="e2e-tenant-grid">
      <article className="e2e-tenant-card sandbox"><span>Resettable dummy company</span><h3>{sandbox?.displayName || 'Atlas Simulator Sandbox'}</h3><p>Safe, synthetic records. Running a stage actually adds time data, changes approval status, creates payroll, posts it, and releases a payslip.</p><button type="button" onClick={() => { onSelectCompany?.(SANDBOX_COMPANY_ID); reloadFrame(); }}>Open sandbox in Atlas</button></article>
      <article className="e2e-tenant-card production"><span>Production-like sample company</span><h3>{production?.displayName || 'Meridian Consumer Products'}</h3><p>Fully populated synthetic Philippine company data, including employees, attendance, payroll, bank setup, contacts, services, and documents.</p><button type="button" onClick={previewProduction}>Open populated sample</button></article>
    </div>

    <div className="e2e-journey-switch" role="tablist" aria-label="End-to-end journeys">
      {Object.values(E2E_JOURNEYS).map(item => <button key={item.id} role="tab" aria-selected={journeyId === item.id} className={journeyId === item.id ? 'active' : ''} onClick={() => setJourneyId(item.id)}><strong>{item.title}</strong><span>{item.description}</span></button>)}
    </div>

    <div className="e2e-journey-progress">
      <span>Stage {Math.min(activeIndex + 1, journey.stages.length)} of {journey.stages.length}</span>
      <div className="scenario-progress-track" aria-hidden="true"><i style={{ width: `${(completedCount / journey.stages.length) * 100}%` }} /></div>
      <strong>{completedCount} of {journey.stages.length} {plural(journey.stages.length, 'handoff')} committed to the sandbox</strong>
    </div>

    <div className="e2e-stage-grid">
      {journey.stages.map((stage, index) => {
        const complete = state.journeyId === journeyId && state.completedStages?.includes(stage.id);
        const log = stageLog[index];
        return <button type="button" key={stage.id} className={`e2e-stage ${index === activeIndex ? 'active' : ''} ${complete ? 'complete' : ''} ${log?.state === 'blocked' ? 'blocked' : ''}`} onClick={() => setActiveIndex(index)} aria-current={index === activeIndex ? 'step' : undefined}>
          <span>{log?.state === 'blocked' ? <WarningCircle weight="fill" /> : complete ? <CheckCircle weight="fill" /> : index + 1}</span>
          <small>{stage.actor} · {stage.module}</small>
          <strong>{stage.title}</strong>
          <em>{stage.detail}</em>
          {log?.message && <b className={`e2e-stage-log ${log.state}`}>{log.message}</b>}
        </button>;
      })}
    </div>

    <section className={`e2e-guide ${running ? 'speaking' : ''}`} aria-live="polite">
      <div className="e2e-guide-avatar"><Sparkle weight="fill" /><i /><i /><i /></div>
      <div className="e2e-guide-body">
        <span>Atlas Guide · step {activeIndex + 1} of {journey.stages.length}</span>
        <h3>{activeStage.actor}, here’s what happens now</h3>
        <p>“{activeStage.guide}”</p>
        <div className="e2e-guide-why"><strong>Why this matters</strong><span>{activeStage.why}</span></div>
      </div>
      <div className="e2e-lineage" aria-label="Current step data lineage">
        {[
          ['1 · Reads', activeStage.input],
          ['2 · Applies', activeStage.rule],
          ['3 · Writes', activeStage.output],
          ['4 · Proves', activeStage.proof],
        ].map(([label, value], index) => <div key={label}><small>{label}</small><strong>{value}</strong>{index < 3 ? <CaretRight weight="bold" /> : <CheckCircle weight="fill" />}</div>)}
      </div>
    </section>

    <div className="e2e-control-bar">
      <div><span>{running ? 'Atlas is working' : 'Current handoff'}</span><strong>{status}</strong></div>
      <label className="e2e-pace">Playback<select value={pace} onChange={event => setPace(Number(event.target.value))} disabled={running}><option value="1">Human</option><option value="0.7">Focused</option><option value="0.4">Fast</option></select></label>
      <button type="button" className="button secondary" disabled={running} onClick={() => runRange(activeIndex, activeIndex + 1)}><Play weight="fill" /> Run stage {activeIndex + 1}</button>
      <button type="button" className="button secondary" disabled={running || journeyDone} onClick={() => runRange(activeIndex, journey.stages.length)}><SkipForward weight="fill" /> Continue to the end</button>
      <button type="button" className="button primary" disabled={running} onClick={() => runRange(0, journey.stages.length, { fresh: true })}>{running ? <Pause weight="fill" /> : <ArrowCounterClockwise weight="bold" />}{running ? 'Running…' : 'Reset and run all'}</button>
    </div>

    <div className="e2e-human-note"><CursorClick weight="duotone" /><div><strong>Human simulator is active</strong><span>The visible pointer scrolls, hovers, opens controls, types field-by-field, and reviews the final decision before Atlas commits the matching sandbox effect.</span></div></div>

    {!!state.events?.length && <div className="e2e-action-feed"><span>Completed actor handoffs</span>{state.events.slice(0, 6).map(event => <div key={event.id}><strong>{event.actor}</strong><em>{event.title}</em><small>{event.module}</small></div>)}</div>}

    <div className="e2e-impact-heading"><span>Live data result</span><strong>{state.companyId === PRODUCTION_SAMPLE_COMPANY_ID ? 'Meridian populated sample' : 'Atlas Simulator Sandbox'}</strong></div>
    <div className="e2e-impact" aria-label="Live cross-module result">
      <div><span>Payroll</span><strong>{metrics.transactionNumber || 'Not created'}</strong><small>{metrics.payrollStatus || 'Waiting for Client Admin'}</small></div>
      <div><span>Approved overtime</span><strong>{metrics.overtimeHours || 0} hours</strong><small>{peso(metrics.overtimePay)} added to earnings</small></div>
      <div><span>Employee net pay</span><strong>{peso(metrics.employeeNetPay)}</strong><small>Protected minimum {peso(metrics.protectedMinimum)}</small></div>
      <div><span>Company result</span><strong>{metrics.headcount || 0} employees</strong><small>{peso(metrics.netPay)} total net pay</small></div>
      <div><span>Policy effect</span><strong>{state.policyThreshold || 30}% protected</strong><small>{metrics.affectedEmployees || 0} {plural(metrics.affectedEmployees || 0, 'employee')} with deferred deductions</small></div>
      {state.earningAmount ? <div><span>Added earning</span><strong>{peso(state.earningAmount)}</strong><small>One-time mobile allowance</small></div> : null}
      {state.deductionAmount ? <div><span>Added deduction</span><strong>{peso(state.deductionAmount)}</strong><small>Equipment recovery</small></div> : null}
      {state.correctionStatus ? <div><span>Time correction</span><strong>{state.correctionStatus}</strong><small>{state.correctedMinutes || 0} late minutes after decision</small></div> : null}
      {state.rejectionReason ? <div><span>Rejection handled</span><strong>Rejected earlier</strong><small>{state.rejectionReason}</small></div> : null}
      {metrics.statutoryEmployee ? <div><span>Employee statutory</span><strong>{peso(metrics.statutoryEmployee)}</strong><small>Employer share {peso(metrics.statutoryEmployer)}</small></div> : null}
      {metrics.employeeDeferred ? <div><span>Deferred now</span><strong>{peso(metrics.employeeDeferred)}</strong><small>Protected by THP-001 / THP-002</small></div> : null}
    </div>

    <section className="e2e-audit-lineage">
      <header><div><span>True UI audit route</span><h3>Where Atlas looked, in execution order</h3><p>Each row identifies the owning feature, the exact UI path, what was read, and what it produced. “No applicable rows” is retained as evidence that Atlas checked the source but found nothing due.</p></div><strong>{metrics.auditTrail?.length || 0} {plural(metrics.auditTrail?.length || 0, 'source and policy check')}</strong></header>
      {metrics.auditTrail?.length
        ? <div className="e2e-audit-list">{metrics.auditTrail.map((node, index) => <article key={node.id} className={node.type.includes('Policy') ? 'policy' : ''}>
          <span className="e2e-audit-order">{index + 1}</span>
          <div><small>{node.type}</small><strong>{node.title}</strong><code>{node.path.join(' › ')}</code></div>
          <div><span>Reads</span><strong>{node.reads}</strong></div>
          <div><span>Produces</span><strong>{node.produces}</strong></div>
          <em>{node.status}</em>
          {/* One source can be read by several steps, so the same code appears
              more than once in a node's list and cannot key on its own value. */}
          {!!node.codes.length && <footer>{node.codes.map((code, position) => <code key={`${code}-${position}`}>{code}</code>)}</footer>}
        </article>)}</div>
        : <div className="e2e-trail-empty"><Sparkle weight="duotone" /><div><strong>The source and policy route appears after payroll is calculated.</strong><span>Atlas will show Payroll configuration, employee Basic Pay, Timekeeping, earnings, deductions, loans, Computational Basis, effective tables, policy engines, and final output—even when a checked source has no applicable rows.</span></div></div>}
    </section>

    <section className="e2e-computation-evidence">
      <header><div><span>Actual engine evidence</span><h3>Computation and policy execution</h3><p>These rows come from John’s real calculated payroll line. Each amount now includes its owning feature and reproducible UI references; policy steps are explicitly identified.</p></div><strong>{metrics.computationTrail?.length || 0} governed {plural(metrics.computationTrail?.length || 0, 'step')}</strong></header>
      {metrics.computationTrail?.length
        ? <div className="e2e-trail-list">{metrics.computationTrail.map(step => <article key={`${step.seq}-${step.code}`} className={step.policyApplied ? 'policy' : ''}>
          <div className="e2e-trail-code"><span>{step.seq}</span><strong>{step.code}</strong><small>{step.category}</small></div>
          <div className="e2e-trail-explanation"><span className="e2e-trail-kind">{step.kind} · {step.feature}</span><strong>{step.label}</strong><code>{step.expression || step.detail}</code><span>{formatTrailInputs(step.inputs)}</span><small>{step.evaluated ? 'Evaluated from the Computational Basis expression' : 'Resolved by governed lookup'} · {step.source}{step.detail ? ` · ${step.detail}` : ''}</small><div className="e2e-trail-paths">{step.references?.map(reference => <span key={`${reference.role}-${reference.path.join('-')}`}><b>{reference.role}</b><em>{reference.path.join(' › ')}</em></span>)}</div></div>
          <div className="e2e-trail-amount"><span>Result</span><strong>{peso(step.amount)}</strong></div>
        </article>)}</div>
        : <div className="e2e-trail-empty"><Sparkle weight="duotone" /><div><strong>The trail will appear after a calculation step.</strong><span>Run “Create payroll,” “Run the real computation,” or “Calculate collection and deferral.” Atlas will then expose the exact codes, inputs, sources, and results produced by the payroll engine.</span></div></div>}
    </section>

    <div className="scenario-live-window e2e-live-window">
      <div className="scenario-live-window-bar"><span className="scenario-browser-dots"><i /><i /><i /></span><em>atlas.app / full-end-to-end</em><ArrowSquareOut /></div>
      <iframe ref={iframeRef} title="Live Atlas full end-to-end simulation" src="/?atlasLiveScenario=1" />
    </div>
  </section>;
}

function ScenarioCard({ item, selected, onSelect }) {
  const Icon = roleIcons[item.role];
  const plan = livePlanFor(item.id);
  return (
    <button type="button" data-scenario={item.id} className={`scenario-card ${selected ? 'selected' : ''}`} onClick={() => onSelect(item)} aria-pressed={selected}>
      <span className={`scenario-role-icon ${item.role}`}><Icon weight="duotone" /></span>
      <span className="scenario-card-copy">
        <small>{item.roleLabel} · {item.category}</small>
        <strong>{item.title}</strong>
        <em>{item.steps.length} {plural(item.steps.length, 'step')} · {plan?.module || 'HRM'}</em>
      </span>
      <Play weight="fill" />
    </button>
  );
}

export function ScenarioStudio({ onNavigate, company, companies, onSelectCompany }) {
  const [studioTab, setStudioTab] = useState('stories');
  const [role, setRole] = useState('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(SCENARIOS[0]);
  const coverage = useMemo(() => scenarioCoverage(), []);
  const visible = useMemo(() => scenariosFor({ role, category, query }), [role, category, query]);
  const totalSteps = useMemo(() => SCENARIOS.reduce((sum, item) => sum + item.steps.length, 0), []);
  const module = moduleForScenario(selected);
  const filtered = role !== 'all' || category !== 'all' || Boolean(query.trim());

  // Keep the open story inside the current filter so the player never shows a
  // scenario the visible list no longer contains.
  useEffect(() => {
    if (visible.length && !visible.some(item => item.id === selected.id)) setSelected(visible[0]);
  }, [visible, selected.id]);

  return (
    <div className="app-shell core-screen scenario-shell">
      <BrandRail onHome={() => onNavigate('core')} onCore={() => onNavigate('core')} onHrm={() => onNavigate('hrm')} onTime={() => onNavigate('timekeeping')} onPayroll={() => onNavigate('payroll')} onSettings={() => onNavigate('settings')} />
      <main className="shell-main">
        <Topbar company={company} companies={companies} onSelectCompany={onSelectCompany} />
        <div className="scenario-page">
          <header className="scenario-hero">
            <div className="scenario-hero-copy">
              <p className="eyebrow">Guided product walkthroughs</p>
              <h1>Atlas Scenario Studio</h1>
              <p>Pick a role-specific user story, follow it step by step in the storyboard, then watch the real Atlas app perform the same steps — with an outcome recorded for every one of them.</p>
            </div>
            <div className="scenario-hero-stats">
              <div className="scenario-hero-total">
                <strong>{SCENARIOS.length}</strong>
                <span>user {plural(SCENARIOS.length, 'story')}</span>
                <em>{totalSteps} planned {plural(totalSteps, 'step')}</em>
              </div>
              <div className="scenario-coverage" aria-label="Scenario coverage by role">
                <button type="button" onClick={() => setRole('all')} className={role === 'all' ? 'active' : ''}><strong>{SCENARIOS.length}</strong><span>All actors</span></button>
                {coverage.map(item => <button type="button" key={item.id} onClick={() => setRole(item.id)} className={role === item.id ? 'active' : ''}><strong>{item.count}</strong><span>{item.label}</span></button>)}
              </div>
            </div>
          </header>

          <div className="scenario-mode-tabs" role="tablist" aria-label="Scenario Studio modes">
            <button type="button" role="tab" aria-selected={studioTab === 'stories'} className={studioTab === 'stories' ? 'active' : ''} onClick={() => setStudioTab('stories')}>
              <strong>Scenario library</strong><span>One actor, one story, run in the real app</span>
            </button>
            <button type="button" role="tab" aria-selected={studioTab === 'end-to-end'} className={studioTab === 'end-to-end' ? 'active' : ''} onClick={() => setStudioTab('end-to-end')}>
              <strong>Full end-to-end</strong><span>All four actors, one transaction, real sandbox data</span>
            </button>
          </div>

          {studioTab === 'stories' ? <div className="scenario-workspace">
            <aside className="scenario-library">
              <div className="scenario-library-head">
                <div><span>Scenario library</span><strong>{visible.length} of {SCENARIOS.length}</strong></div>
                {filtered
                  ? <button type="button" className="scenario-clear" onClick={() => { setRole('all'); setCategory('all'); setQuery(''); }}>Clear filters</button>
                  : <SlidersHorizontal />}
              </div>
              <label className="scenario-search"><MagnifyingGlass /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search stories, modules, actions…" aria-label="Search scenarios" /></label>
              <div className="scenario-filters">
                <select value={role} onChange={event => setRole(event.target.value)} aria-label="Filter by role"><option value="all">All roles</option>{SCENARIO_ROLES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
                <select value={category} onChange={event => setCategory(event.target.value)} aria-label="Filter by category"><option value="all">All categories</option>{SCENARIO_CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}</select>
              </div>
              <div className="scenario-list">
                {visible.map(item => <ScenarioCard key={item.id} item={item} selected={selected.id === item.id} onSelect={setSelected} />)}
                {!visible.length && <div className="scenario-empty"><MagnifyingGlass /><strong>No matching scenarios</strong><span>Try another role, category, or keyword.</span></div>}
              </div>
            </aside>

            <ScenarioPlayer key={selected.id} scenario={selected} module={module} onSelectCompany={onSelectCompany} />
          </div> : <EndToEndStudio companies={companies} onSelectCompany={onSelectCompany} />}
        </div>
      </main>
    </div>
  );
}
