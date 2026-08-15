import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const W = 1280;
const H = 720;
const OUT = path.resolve('output');
const SCREENS = path.resolve('screens');
const PPTX = path.resolve('..', '..', '..', 'ATLAS_Computational_Basis_Business_Demo_Wireframe.pptx');

const C = {
  paper: '#F7F7F5',
  white: '#FFFFFF',
  ink: '#111111',
  muted: '#66645F',
  soft: '#ECEAE6',
  line: '#D1CFCA',
  violet: '#5C2A91',
  violetSoft: '#F2ECF8',
  green: '#167B55',
  greenSoft: '#E7F4EE',
  amber: '#A46509',
  amberSoft: '#FAF0DE',
};

const presentation = Presentation.create({ slideSize: { width: W, height: H } });

const imageCache = new Map();
async function imageBytes(file) {
  if (!imageCache.has(file)) {
    const bytes = await fs.readFile(path.join(SCREENS, file));
    imageCache.set(file, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  return imageCache.get(file);
}

function addText(slide, text, pos, style = {}, opts = {}) {
  const shape = slide.shapes.add({
    geometry: 'textbox',
    position: pos,
    fill: opts.fill ?? 'none',
    line: opts.line ?? { style: 'solid', fill: 'none', width: 0 },
    name: opts.name,
  });
  shape.text = text;
  shape.text.style = {
    fontFamily: style.fontFamily || 'Aptos',
    fontSize: style.fontSize ?? 18,
    color: style.color || C.ink,
    bold: Boolean(style.bold),
    italic: Boolean(style.italic),
    lineSpacing: style.lineSpacing,
  };
  shape.text.alignment = style.alignment || 'left';
  shape.text.verticalAlignment = style.verticalAlignment || 'top';
  shape.text.autoFit = 'shrinkText';
  shape.text.wrap = 'square';
  return shape;
}

function addBox(slide, pos, { fill = C.white, line = C.line, width = 1, radius = true, name } = {}) {
  return slide.shapes.add({
    geometry: radius ? 'roundRect' : 'rect',
    position: pos,
    fill,
    line: { style: 'solid', fill: line, width },
    name,
  });
}

function addRule(slide, x1, y1, x2, y2, color = C.line, width = 1) {
  const holder1 = slide.shapes.add({ geometry: 'ellipse', position: { left: x1, top: y1, width: 1, height: 1 }, fill: 'none', line: { style: 'solid', fill: 'none', width: 0 } });
  const holder2 = slide.shapes.add({ geometry: 'ellipse', position: { left: x2, top: y2, width: 1, height: 1 }, fill: 'none', line: { style: 'solid', fill: 'none', width: 0 } });
  return slide.shapes.connect(holder1, holder2, { kind: 'straight', line: { style: 'solid', fill: color, width } });
}

function addChip(slide, text, pos, { fill = C.violetSoft, color = C.violet, line = C.violet, fontSize = 15 } = {}) {
  addBox(slide, pos, { fill, line, width: 1 });
  return addText(slide, text, pos, { fontSize, bold: true, color, alignment: 'center', verticalAlignment: 'middle' });
}

function addKicker(slide, text, rightText = '') {
  addText(slide, text.toUpperCase(), { left: 56, top: 24, width: 520, height: 24 }, { fontSize: 13, bold: true, color: C.violet });
  if (rightText) addText(slide, rightText, { left: 920, top: 24, width: 304, height: 24 }, { fontSize: 13, color: C.muted, alignment: 'right' });
}

function addTitle(slide, title, subtitle = '') {
  addText(slide, title, { left: 56, top: 58, width: 1168, height: subtitle ? 62 : 74 }, { fontSize: 36, bold: true, color: C.ink, lineSpacing: 0.92 });
  if (subtitle) addText(slide, subtitle, { left: 56, top: 118, width: 1110, height: 44 }, { fontSize: 18, color: C.muted, lineSpacing: 1.05 });
}

function addFooter(slide, section, page) {
  addRule(slide, 56, 684, 1224, 684, C.line, 1);
  addText(slide, `ATLAS  /  ${section}`, { left: 56, top: 690, width: 700, height: 20 }, { fontSize: 11, bold: true, color: C.muted });
  addText(slide, String(page).padStart(2, '0'), { left: 1160, top: 690, width: 64, height: 20 }, { fontSize: 11, bold: true, color: C.muted, alignment: 'right' });
}

function addNotes(slide, cue, sources) {
  const note = [
    `Presenter cue: ${cue}`,
    '',
    '[Sources]',
    ...sources.map(s => `- ${s}`),
    '[/Sources]',
  ].join('\n');
  slide.speakerNotes.textFrame.setText(note);
  return note;
}

async function addScreenshot(slide, file, pos, alt, { fit = 'contain', line = C.line, label = '' } = {}) {
  addBox(slide, pos, { fill: C.white, line, width: 1 });
  const inset = 6;
  slide.images.add({
    blob: await imageBytes(file),
    contentType: 'image/png',
    alt,
    fit,
    position: { left: pos.left + inset, top: pos.top + inset, width: pos.width - inset * 2, height: pos.height - inset * 2 },
    geometry: 'rect',
  });
  if (label) addChip(slide, label, { left: pos.left + 14, top: pos.top + 14, width: Math.min(230, label.length * 9 + 34), height: 30 }, { fill: C.white, color: C.ink, line: C.ink, fontSize: 13 });
}

function addMetric(slide, value, label, x, color = C.ink) {
  addBox(slide, { left: x, top: 553, width: 180, height: 92 }, { fill: C.white, line: C.line });
  addText(slide, value, { left: x + 16, top: 564, width: 148, height: 36 }, { fontSize: 28, bold: true, color });
  addText(slide, label, { left: x + 16, top: 606, width: 148, height: 24 }, { fontSize: 13, color: C.muted });
}

function addNumberBadge(slide, n, x, y, fill = C.ink) {
  addBox(slide, { left: x, top: y, width: 42, height: 42 }, { fill, line: fill, radius: true });
  addText(slide, String(n), { left: x, top: y, width: 42, height: 42 }, { fontSize: 18, bold: true, color: C.white, alignment: 'center', verticalAlignment: 'middle' });
}

function addSimpleIcon(slide, label, x, y, accent = C.violet) {
  addBox(slide, { left: x, top: y, width: 52, height: 52 }, { fill: C.white, line: accent, width: 2 });
  addText(slide, label, { left: x, top: y + 1, width: 52, height: 50 }, { fontSize: 20, bold: true, color: accent, alignment: 'center', verticalAlignment: 'middle' });
}

const notesIndex = [];

// 01 — Cover
{
  const s = presentation.slides.add();
  s.background.fill = C.paper;
  addText(s, 'ATLAS', { left: 56, top: 48, width: 220, height: 34 }, { fontSize: 16, bold: true, color: C.violet });
  addText(s, 'Computational\nBasis', { left: 56, top: 146, width: 480, height: 164 }, { fontSize: 58, bold: true, color: C.ink, lineSpacing: 0.86 });
  addText(s, 'How payroll requirements become governed, testable company policy', { left: 56, top: 332, width: 460, height: 92 }, { fontSize: 24, color: C.muted, lineSpacing: 1.05 });
  addChip(s, 'BUSINESS WIREFRAME DEMO', { left: 56, top: 482, width: 254, height: 38 }, { fill: C.violetSoft, color: C.violet, line: C.violet, fontSize: 14 });
  addText(s, 'Take-Home Pay  /  Retirement Pay  /  Final Pay  /  Gross Up', { left: 56, top: 544, width: 480, height: 54 }, { fontSize: 17, bold: true, color: C.ink });
  await addScreenshot(s, '03-takehome-engine-top.png', { left: 578, top: 48, width: 646, height: 586 }, 'ATLAS wireframe showing the Take-Home Pay policy engine and scenario simulator', { fit: 'cover' });
  addText(s, '10 AUG 2026', { left: 56, top: 648, width: 220, height: 20 }, { fontSize: 12, bold: true, color: C.muted });
  notesIndex.push(addNotes(s, 'Open by framing this as a payroll-policy conversation, not a technical system tour. The four engines are the visible proof points.', [
    'ATLAS wireframe, http://localhost:5173/wireframe, client view captured 2026-08-10.',
    'Phase 2 - Payroll - Project Plan.xlsx, Non-existing in Phase 1 and Modules and Features tabs.',
    '02Annex B_ Employee Masterfile Payroll Data Tables from Dorado.xlsx, Gross Up, Take Home Pay, Retirement Pay, and Final Pay tabs.',
  ]));
}

// 02 — System flow
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'From source of truth to payroll outcome', 'BUSINESS MODEL');
  addTitle(s, 'A rule chooses who and when. A policy engine chooses how.', 'The wireframe separates business scope from calculation logic while keeping the link visible.');
  const xs = [64, 302, 540, 778, 1016];
  const labels = [
    ['01', 'Source workbooks', 'Policy examples, tables, formulas'],
    ['02', 'Computation', 'Controlled formula or approved variant'],
    ['03', 'Policy code', 'Company values and thresholds'],
    ['04', 'Company Rule', 'Employee group, category, timing'],
    ['05', 'Payroll result', 'Trace, ledger, report, audit'],
  ];
  const nodes = xs.map((x, i) => addBox(s, { left: x, top: 258, width: 188, height: 204 }, { fill: i === 2 ? C.violetSoft : C.white, line: i === 2 ? C.violet : C.ink, width: i === 2 ? 2 : 1, name: `flow-${i}` }));
  for (let i = 0; i < nodes.length - 1; i++) {
    s.shapes.connect(nodes[i], nodes[i + 1], { kind: 'straight', fromSide: 'right', toSide: 'left', line: { style: 'solid', fill: C.violet, width: 2 }, tail: { type: 'arrow', width: 'med', length: 'med' } });
  }
  labels.forEach((item, i) => {
    addText(s, item[0], { left: xs[i] + 16, top: 276, width: 50, height: 24 }, { fontSize: 14, bold: true, color: C.violet });
    addText(s, item[1], { left: xs[i] + 16, top: 320, width: 156, height: 56 }, { fontSize: 23, bold: true, color: C.ink, lineSpacing: 0.95 });
    addText(s, item[2], { left: xs[i] + 16, top: 392, width: 156, height: 50 }, { fontSize: 15, color: C.muted, lineSpacing: 1.05 });
  });
  addChip(s, 'VISIBLE', { left: 222, top: 514, width: 132, height: 36 }, { fill: C.white, color: C.ink, line: C.ink });
  addChip(s, 'TESTABLE', { left: 574, top: 514, width: 132, height: 36 }, { fill: C.white, color: C.ink, line: C.ink });
  addChip(s, 'TRACEABLE', { left: 926, top: 514, width: 132, height: 36 }, { fill: C.white, color: C.ink, line: C.ink });
  addFooter(s, 'MODEL', 2);
  notesIndex.push(addNotes(s, 'Explain the five objects in plain language. The important design choice is that company-specific values live in a reusable policy code, while the Company Rule determines the audience and activation.', [
    'ATLAS_Phase2_Master_Requirements_for_Codex_Claude.md, sections 8, 11, and 12.',
    'Phase 2 - Payroll - Project Plan.xlsx, requirement rows HTP018, HTP019, HTP023, HTP073-HTP075.',
  ]));
}

// 03 — Workspace
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'The controlled workspace', 'WIREFRAME');
  addTitle(s, 'One workspace governs the calculation lifecycle');
  await addScreenshot(s, '01-computational-basis.png', { left: 56, top: 146, width: 1168, height: 382 }, 'Computational Basis workspace showing computations, assignments, policy engines, reference sources, and metrics', { fit: 'cover' });
  addMetric(s, '219', 'governed computations', 56);
  addMetric(s, '30', 'reference sources', 252);
  addMetric(s, '4', 'pay policy engines', 448, C.violet);
  addMetric(s, '6', 'client assignments', 644);
  addBox(s, { left: 840, top: 553, width: 384, height: 92 }, { fill: C.greenSoft, line: C.green });
  addText(s, 'Client view', { left: 860, top: 566, width: 130, height: 26 }, { fontSize: 15, bold: true, color: C.green });
  addText(s, 'Built-ins stay controlled. Company-owned calculations and assignments remain configurable.', { left: 860, top: 596, width: 340, height: 40 }, { fontSize: 15, color: C.ink });
  addFooter(s, 'WORKSPACE', 3);
  notesIndex.push(addNotes(s, 'Use the tabs as the mental model: formulas, assignments, engines, sources, and history. Avoid treating the inventory counts as final contractual totals until the source discrepancy is reconciled.', [
    'ATLAS wireframe, Computational Basis client view, captured 2026-08-10.',
    'Phase 2 - Payroll - Project Plan.xlsx, Computational Basis requirements; source materials contain an inventory/target discrepancy between 219 and roughly 300 computations, and between 18 and 30 reference tables.',
  ]));
}

// 04 — One rule register
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Company Rules', 'GOVERNANCE');
  addTitle(s, 'One rule register—without duplicating engine settings', 'Payroll users can see every active rule in one place and open the owning policy engine when values need to change.');
  await addScreenshot(s, '09-company-rules-list.png', { left: 56, top: 180, width: 820, height: 450 }, 'Company Rules table with Take-Home Pay, Retirement Pay and Final Pay engine-owned rows', { fit: 'contain' });
  addBox(s, { left: 902, top: 198, width: 322, height: 116 }, { fill: C.violetSoft, line: C.violet });
  addText(s, 'Engine-owned rows', { left: 924, top: 218, width: 274, height: 28 }, { fontSize: 21, bold: true, color: C.violet });
  addText(s, 'Locked in the register to prevent drift.', { left: 924, top: 260, width: 274, height: 34 }, { fontSize: 16, color: C.ink });
  addBox(s, { left: 902, top: 334, width: 322, height: 116 }, { fill: C.white, line: C.ink });
  addText(s, 'Company-owned rules', { left: 924, top: 354, width: 274, height: 28 }, { fontSize: 21, bold: true, color: C.ink });
  addText(s, 'Editable, searchable, exportable.', { left: 924, top: 396, width: 274, height: 34 }, { fontSize: 16, color: C.muted });
  addBox(s, { left: 902, top: 470, width: 322, height: 116 }, { fill: C.greenSoft, line: C.green });
  addText(s, 'Open policy engine', { left: 924, top: 490, width: 274, height: 28 }, { fontSize: 21, bold: true, color: C.green });
  addText(s, 'Navigate directly to the live values.', { left: 924, top: 532, width: 274, height: 34 }, { fontSize: 16, color: C.ink });
  addFooter(s, 'COMPANY RULES', 4);
  notesIndex.push(addNotes(s, 'Show that Take-Home Pay, Retirement Pay, and Final Pay appear in the same register as ordinary company rules, but their values remain owned by the policy engine. This is the control that prevents two copies of the same setting.', [
    'ATLAS wireframe, Company Rules client view, captured 2026-08-10.',
    'Phase 2 BRD Audit Summary.xlsx, Rules Setup requirement H61:I61 and computational-basis notes J63:J64.',
  ]));
}

// 05 — Three-step rule flow
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Apply New Rule', '3-STEP FLOW');
  addTitle(s, 'Scope first. Governed calculation second. Review before activation.');
  const cards = [
    ['10-rule-wizard-step1.png', '1  Rule details', 'Who, category, sub-category, plain-language rule'],
    ['11-rule-wizard-step2.png', '2  Policy engine', 'Choose a mapped code or create a configured variant'],
    ['12-rule-wizard-review.png', '3  Review', 'Confirm live parameter values before applying'],
  ];
  for (let i = 0; i < 3; i++) {
    const x = 56 + i * 392;
    await addScreenshot(s, cards[i][0], { left: x, top: 170, width: 360, height: 350 }, cards[i][1], { fit: 'contain' });
    addText(s, cards[i][1], { left: x + 6, top: 540, width: 348, height: 30 }, { fontSize: 22, bold: true, color: i === 1 ? C.violet : C.ink });
    addText(s, cards[i][2], { left: x + 6, top: 580, width: 348, height: 44 }, { fontSize: 15, color: C.muted });
  }
  addFooter(s, 'RULE FLOW', 5);
  notesIndex.push(addNotes(s, 'Walk left to right. The sub-category is selected from governed options, the policy code is filtered to that sub-category, and the review screen exposes the effective values rather than hiding them behind a code.', [
    'ATLAS wireframe, Apply New Rule steps 1-3, captured 2026-08-10.',
    'Phase 2 BRD Audit Summary.xlsx, company rule setup and employee/group assignment requirements.',
    '02Annex B_ Employee Masterfile Payroll Data Tables from Dorado.xlsx, employee-group assignment examples in Take Home Pay and Retirement Pay tabs.',
  ]));
}

// 06 — Take-home policy
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Take-Home Pay', 'THP-001 / THP-002');
  addTitle(s, 'Take-home protection preserves the statutory layer first');
  await addScreenshot(s, '03-takehome-engine-top.png', { left: 56, top: 142, width: 770, height: 500 }, 'Take-Home Pay policy and simulator', { fit: 'contain' });
  addChip(s, 'EXCEL → APP', { left: 858, top: 154, width: 148, height: 32 }, { fill: C.violetSoft, color: C.violet, line: C.violet, fontSize: 13 });
  const rows = [
    ['Base', '₱36,500 − ₱2,000', '₱34,500'],
    ['Protected minimum', '30% × ₱34,500', '₱10,350'],
    ['Statutory deductions', 'Applied in full', '₱6,500'],
    ['Lower-priority items', 'Reduce / defer', 'Carry forward'],
  ];
  rows.forEach((r, i) => {
    const y = 208 + i * 90;
    addBox(s, { left: 858, top: y, width: 366, height: 74 }, { fill: i === 1 ? C.violetSoft : C.white, line: i === 1 ? C.violet : C.line });
    addText(s, r[0], { left: 876, top: y + 12, width: 150, height: 22 }, { fontSize: 14, bold: true, color: C.muted });
    addText(s, r[1], { left: 876, top: y + 38, width: 204, height: 24 }, { fontSize: 17, bold: true, color: C.ink });
    addText(s, r[2], { left: 1078, top: y + 36, width: 126, height: 28 }, { fontSize: 18, bold: true, color: i === 1 ? C.violet : C.ink, alignment: 'right' });
  });
  addText(s, 'Policy options in the source are alternatives—not simultaneous constraints.', { left: 858, top: 584, width: 366, height: 50 }, { fontSize: 15, italic: true, color: C.muted });
  addFooter(s, 'TAKE-HOME PAY', 6);
  notesIndex.push(addNotes(s, 'Use the example as a business translation: the selected basis is gross less reimbursements, the protected minimum is 30%, mandatory statutory deductions remain whole, and controllable items are the only ones reduced or deferred.', [
    '02Annex B_ Employee Masterfile Payroll Data Tables from Dorado.xlsx, Take Home Pay tab, A4:C183; includes alternative percentage, fixed-amount, loan-cap, LAUT-cap, hierarchy, deferral, notification, ledger, and employee-group examples.',
    'ATLAS wireframe, Take-Home Pay policy and scenario simulator, captured 2026-08-10.',
  ]));
}

// 07 — Module hierarchy dependency
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Take-Home Pay dependencies', 'INTERCONNECTED MODULES');
  addTitle(s, 'Amounts stay with their owning modules; the engine owns the adjustment order');
  const n1 = addBox(s, { left: 56, top: 190, width: 214, height: 74 }, { fill: C.white, line: C.ink });
  const n2 = addBox(s, { left: 56, top: 298, width: 214, height: 74 }, { fill: C.white, line: C.ink });
  const n3 = addBox(s, { left: 56, top: 406, width: 214, height: 74 }, { fill: C.white, line: C.ink });
  const hub = addBox(s, { left: 334, top: 286, width: 234, height: 98 }, { fill: C.violetSoft, line: C.violet, width: 2 });
  s.shapes.connect(n1, hub, { kind: 'elbow', fromSide: 'right', toSide: 'left', line: { style: 'solid', fill: C.violet, width: 2 }, tail: { type: 'arrow', width: 'med', length: 'med' } });
  s.shapes.connect(n2, hub, { kind: 'straight', fromSide: 'right', toSide: 'left', line: { style: 'solid', fill: C.violet, width: 2 }, tail: { type: 'arrow', width: 'med', length: 'med' } });
  s.shapes.connect(n3, hub, { kind: 'elbow', fromSide: 'right', toSide: 'left', line: { style: 'solid', fill: C.violet, width: 2 }, tail: { type: 'arrow', width: 'med', length: 'med' } });
  addText(s, 'Deductions', { left: 76, top: 208, width: 170, height: 28 }, { fontSize: 21, bold: true });
  addText(s, 'Codes, due amounts, schedules', { left: 76, top: 238, width: 170, height: 20 }, { fontSize: 13, color: C.muted });
  addText(s, 'Company Loans', { left: 76, top: 316, width: 170, height: 28 }, { fontSize: 21, bold: true });
  addText(s, 'Amortization and balances', { left: 76, top: 346, width: 170, height: 20 }, { fontSize: 13, color: C.muted });
  addText(s, 'Government Loans', { left: 76, top: 424, width: 170, height: 28 }, { fontSize: 21, bold: true });
  addText(s, 'SSS / HDMF collections', { left: 76, top: 454, width: 170, height: 20 }, { fontSize: 13, color: C.muted });
  addText(s, 'REF-011', { left: 354, top: 304, width: 194, height: 26 }, { fontSize: 16, bold: true, color: C.violet, alignment: 'center' });
  addText(s, 'Deduction & Loan Hierarchy', { left: 354, top: 334, width: 194, height: 34 }, { fontSize: 19, bold: true, alignment: 'center' });
  await addScreenshot(s, '04-takehome-hierarchy.png', { left: 614, top: 148, width: 610, height: 496 }, 'Take-Home Pay deduction and loan hierarchy with module navigation', { fit: 'cover' });
  addChip(s, 'Priority only', { left: 370, top: 420, width: 160, height: 36 }, { fill: C.white, color: C.ink, line: C.ink });
  addText(s, 'Statutory items remain mandatory; eligible lower-priority items may be deferred.', { left: 56, top: 544, width: 512, height: 56 }, { fontSize: 17, color: C.muted });
  addFooter(s, 'DEPENDENCIES', 7);
  notesIndex.push(addNotes(s, 'Stress module ownership. Take-Home Pay does not recreate loan or deduction setup. It reads the active collections, applies REF-011 ordering and the company threshold, and returns posted versus deferred amounts with carry-forward balances.', [
    '02Annex B_ Employee Masterfile Payroll Data Tables from Dorado.xlsx, Take Home Pay tab, hierarchy and carry-forward sections A90:C158; Deductions and Loans source tabs.',
    'ATLAS wireframe, Take-Home Pay hierarchy showing navigation to Deductions, Company Loans, Government Loans and REF-011, captured 2026-08-10.',
  ]));
}

// 08 — Retirement
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Retirement Pay', 'RET-001 / RET-002');
  addTitle(s, 'Eligibility, service rounding, and the more-beneficial result are visible');
  await addScreenshot(s, '05-retirement-engine.png', { left: 468, top: 142, width: 756, height: 500 }, 'Retirement Pay policy engine and retirement scenario', { fit: 'contain' });
  addChip(s, 'SOURCE EXAMPLE', { left: 56, top: 160, width: 160, height: 32 }, { fill: C.violetSoft, color: C.violet, line: C.violet, fontSize: 13 });
  addText(s, '₱20,000 ÷ 30', { left: 56, top: 218, width: 330, height: 34 }, { fontSize: 28, bold: true });
  addText(s, '× 22.5 days × 10 years', { left: 56, top: 260, width: 330, height: 34 }, { fontSize: 28, bold: true });
  addText(s, '= ₱150,000', { left: 56, top: 314, width: 330, height: 48 }, { fontSize: 38, bold: true, color: C.violet });
  addRule(s, 56, 394, 408, 394, C.line, 1);
  addText(s, 'Wireframe scenario', { left: 56, top: 416, width: 330, height: 26 }, { fontSize: 16, bold: true, color: C.muted });
  addText(s, '12y 6m → 13 years', { left: 56, top: 458, width: 330, height: 30 }, { fontSize: 23, bold: true });
  addText(s, 'Statutory  ₱585,000', { left: 56, top: 504, width: 330, height: 26 }, { fontSize: 18, color: C.ink });
  addText(s, 'Company plan  ₱795,000', { left: 56, top: 540, width: 330, height: 26 }, { fontSize: 18, bold: true, color: C.violet });
  addText(s, 'System uses the higher qualifying value.', { left: 56, top: 586, width: 340, height: 34 }, { fontSize: 16, color: C.muted });
  addFooter(s, 'RETIREMENT PAY', 8);
  notesIndex.push(addNotes(s, 'Start with the simple source example, then point to the richer app scenario. The business can configure plan type, salary basis, divisor, days per service year, eligibility, rounding, tax treatment, caps, and additional benefits; the simulator compares qualifying values.', [
    '02Annex B_ Employee Masterfile Payroll Data Tables from Dorado.xlsx, Retirement Pay tab, A1:C72.',
    '05Sample Computation - Retirement.xlsx, Definition and Retirement tabs; example monthly pay ₱20,000, 22.5 days, 10 years, result ₱150,000.',
    'ATLAS wireframe, Retirement Pay policy and scenario, captured 2026-08-10.',
  ]));
}

// 09 — Final Pay
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Final Pay', 'FIN-001');
  addTitle(s, 'Final pay assembles approved components, then applies offsets and tax');
  await addScreenshot(s, '06-final-pay-engine.png', { left: 486, top: 142, width: 738, height: 500 }, 'Final Pay configuration and breakdown', { fit: 'contain' });
  const steps = [
    ['1', 'Earnings', 'Unpaid salary, 13th month, leave, allowances'],
    ['2', 'Linked benefit', 'Retirement result when applicable'],
    ['3', 'Authorized offsets', 'Government loans, company loans, accountabilities'],
    ['4', 'Tax + net', 'Final/annualized tax and itemized breakdown'],
  ];
  steps.forEach((r, i) => {
    const y = 160 + i * 112;
    addNumberBadge(s, r[0], 56, y, i === 3 ? C.violet : C.ink);
    addText(s, r[1], { left: 116, top: y, width: 310, height: 28 }, { fontSize: 21, bold: true, color: i === 3 ? C.violet : C.ink });
    addText(s, r[2], { left: 116, top: y + 36, width: 310, height: 50 }, { fontSize: 15, color: C.muted });
  });
  addBox(s, { left: 56, top: 610, width: 382, height: 36 }, { fill: C.greenSoft, line: C.green });
  addText(s, 'Retirement is pulled from RET—not recomputed here.', { left: 70, top: 617, width: 354, height: 22 }, { fontSize: 14, bold: true, color: C.green, alignment: 'center' });
  addFooter(s, 'FINAL PAY', 9);
  notesIndex.push(addNotes(s, 'Show the dependency chain. Final Pay is the assembly point: it turns on applicable components, pulls leave/timekeeping and retirement results, offsets authorized balances, applies tax treatment, and produces an itemized final-pay result.', [
    '02Annex B_ Employee Masterfile Payroll Data Tables from Dorado.xlsx, Final Pay tab, A2:B36.',
    'Phase 2 BRD Audit Summary.xlsx, Final Pay setup and assignment requirements H55:J55.',
    'ATLAS wireframe, Final Pay configuration and breakdown, captured 2026-08-10.',
  ]));
}

// 10 — Gross Up
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Gross Up', 'GUP-001');
  addTitle(s, 'Gross-up solves backward from the employee’s promised net');
  await addScreenshot(s, '07-gross-up-engine.png', { left: 470, top: 142, width: 754, height: 500 }, 'Gross Up configuration and scenario with target net and employer absorbed withholding', { fit: 'contain' });
  addChip(s, 'SOURCE EXAMPLE', { left: 56, top: 162, width: 160, height: 32 }, { fill: C.violetSoft, color: C.violet, line: C.violet, fontSize: 13 });
  addText(s, 'Promised net', { left: 56, top: 224, width: 340, height: 26 }, { fontSize: 16, bold: true, color: C.muted });
  addText(s, '₱10,000', { left: 56, top: 258, width: 340, height: 44 }, { fontSize: 36, bold: true });
  addText(s, '÷  (1 − 20%)', { left: 56, top: 320, width: 340, height: 42 }, { fontSize: 30, bold: true, color: C.violet });
  addText(s, 'Gross required  ₱12,500', { left: 56, top: 382, width: 350, height: 38 }, { fontSize: 26, bold: true });
  addText(s, 'Employer tax  ₱2,500', { left: 56, top: 432, width: 350, height: 32 }, { fontSize: 20, color: C.muted });
  addRule(s, 56, 498, 408, 498, C.line, 1);
  addText(s, 'The production flow uses the active tax table and iterates until the net converges within tolerance.', { left: 56, top: 522, width: 354, height: 90 }, { fontSize: 17, color: C.muted, lineSpacing: 1.05 });
  addFooter(s, 'GROSS UP', 10);
  notesIndex.push(addNotes(s, 'The simple example explains the principle. The wireframe generalizes it: select the target, tax method, effective table date, employer share, tolerance, iterations and rounding, then show the candidate gross and calculation trace.', [
    '02Annex B_ Employee Masterfile Payroll Data Tables from Dorado.xlsx, Gross Up tab, A2:B18.',
    '04Sample Gross Up of Earnings.xlsx, Gross up Earnings and Tax computation tabs; simple net ₱10,000 / (1-20%) example.',
    '06Sample Computation and Gross Up_Final Tax.xlsx, Final Tax and Gross Up tabs.',
    'ATLAS wireframe, Gross Up configuration and scenario, captured 2026-08-10.',
  ]));
}

// 11 — Custom computation builder
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Company calculations', 'CONTROLLED FLEXIBILITY');
  addTitle(s, 'Clients can create a calculation without changing the standard library');
  await addScreenshot(s, '08-create-computation.png', { left: 468, top: 142, width: 756, height: 500 }, 'Create company computation modal with approved fields and operators', { fit: 'contain' });
  const items = [
    ['01', 'Choose approved payroll fields'],
    ['02', 'Build with allowed operators'],
    ['03', 'Validate and test the expression'],
    ['04', 'Save as company-owned and assign'],
  ];
  items.forEach((r, i) => {
    const y = 172 + i * 92;
    addSimpleIcon(s, r[0], 56, y, i === 2 ? C.green : C.violet);
    addText(s, r[1], { left: 128, top: y + 4, width: 282, height: 48 }, { fontSize: 20, bold: true, color: C.ink, verticalAlignment: 'middle' });
  });
  addBox(s, { left: 56, top: 556, width: 350, height: 76 }, { fill: C.violetSoft, line: C.violet });
  addText(s, 'Control boundary', { left: 74, top: 570, width: 310, height: 22 }, { fontSize: 14, bold: true, color: C.violet });
  addText(s, 'Built-ins stay read-only; company-owned formulas are editable.', { left: 74, top: 597, width: 310, height: 28 }, { fontSize: 15, color: C.ink });
  addFooter(s, 'CUSTOM COMPUTATION', 11);
  notesIndex.push(addNotes(s, 'This resolves the source conflict safely. Atlas standard computations stay controlled; a client may create a company-owned computation only through the approved field and operator palette, with validation before save.', [
    'Phase 2 - Payroll - Project Plan.xlsx, HTP019 and HTP073-HTP075; source wording conflicts between customizable/add-edit behavior and no creation of new standard computations.',
    'ATLAS_Phase2_Master_Requirements_for_Codex_Claude.md, section 8.1 conflict note.',
    'ATLAS wireframe, Create company computation modal, captured 2026-08-10.',
  ]));
}

// 12 — Data governance
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Assignments and reference sources', 'DATA GOVERNANCE');
  addTitle(s, 'The formula, its effective data, and its audience remain separately controlled');
  await addScreenshot(s, '13-client-assignments.png', { left: 56, top: 164, width: 558, height: 434 }, 'Client computation assignments linking formulas, reference sources, employee groups and frequencies', { fit: 'cover', label: 'CLIENT ASSIGNMENTS' });
  await addScreenshot(s, '14-reference-sources.png', { left: 666, top: 164, width: 558, height: 434 }, 'Reference source cards with versions, effective dates and company enablement', { fit: 'cover', label: 'REFERENCE SOURCES' });
  addChip(s, 'FORMULA', { left: 154, top: 620, width: 130, height: 34 }, { fill: C.white, color: C.ink, line: C.ink });
  addChip(s, 'EFFECTIVE DATA', { left: 420, top: 620, width: 160, height: 34 }, { fill: C.white, color: C.ink, line: C.ink });
  addChip(s, 'AUDIENCE', { left: 710, top: 620, width: 130, height: 34 }, { fill: C.white, color: C.ink, line: C.ink });
  addChip(s, 'FREQUENCY', { left: 974, top: 620, width: 140, height: 34 }, { fill: C.white, color: C.ink, line: C.ink });
  addFooter(s, 'GOVERNANCE', 12);
  notesIndex.push(addNotes(s, 'Show that a calculation does not become active merely because it exists. A client assignment links the approved computation to a reference version, employee group and frequency. Reference tables remain effective-dated and can be enabled per client.', [
    'Phase 2 - Payroll - Project Plan.xlsx, HTP023 and HTP073-HTP075.',
    'PHASE 2 - REFERENCE TABLE [CORE].xlsx and ATLAS-3001 Reference Tables.docx, reference-table inventory and administration requirements.',
    'ATLAS wireframe, Client assignments and Reference sources views, captured 2026-08-10.',
  ]));
}

// 13 — Live demo sequence
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Recommended business demo sequence', 'LIVE WALKTHROUGH');
  addTitle(s, 'Four actions tell the complete story');
  const labels = [
    ['1', 'Choose a payroll scenario', 'Take-home, retirement, final pay, or gross-up'],
    ['2', 'Configure company values', 'Basis, thresholds, components, eligibility'],
    ['3', 'Run the scenario', 'See the result and calculation trace before payroll'],
    ['4', 'Apply the Company Rule', 'Select the audience, code, review, and activate'],
  ];
  const nodes = [];
  labels.forEach((r, i) => {
    const x = 56 + i * 292;
    const n = addBox(s, { left: x, top: 202, width: 250, height: 250 }, { fill: i === 2 ? C.violetSoft : C.white, line: i === 2 ? C.violet : C.ink, width: i === 2 ? 2 : 1 });
    nodes.push(n);
  });
  for (let i = 0; i < nodes.length - 1; i++) s.shapes.connect(nodes[i], nodes[i + 1], { kind: 'straight', fromSide: 'right', toSide: 'left', line: { style: 'solid', fill: C.violet, width: 2 }, tail: { type: 'arrow', width: 'med', length: 'med' } });
  labels.forEach((r, i) => {
    const x = 56 + i * 292;
    addNumberBadge(s, r[0], x + 18, 222, i === 2 ? C.violet : C.ink);
    addText(s, r[1], { left: x + 18, top: 292, width: 214, height: 66 }, { fontSize: 23, bold: true, color: C.ink, lineSpacing: 0.95 });
    addText(s, r[2], { left: x + 18, top: 374, width: 214, height: 58 }, { fontSize: 15, color: C.muted });
  });
  addText(s, 'Business validation questions', { left: 56, top: 516, width: 320, height: 28 }, { fontSize: 18, bold: true, color: C.violet });
  addChip(s, 'Correct basis?', { left: 56, top: 564, width: 170, height: 40 }, { fill: C.white, color: C.ink, line: C.ink });
  addChip(s, 'Correct precedence?', { left: 248, top: 564, width: 196, height: 40 }, { fill: C.white, color: C.ink, line: C.ink });
  addChip(s, 'Correct employee group?', { left: 466, top: 564, width: 224, height: 40 }, { fill: C.white, color: C.ink, line: C.ink });
  addChip(s, 'Correct output?', { left: 712, top: 564, width: 174, height: 40 }, { fill: C.white, color: C.ink, line: C.ink });
  addChip(s, 'Clear audit trail?', { left: 908, top: 564, width: 196, height: 40 }, { fill: C.greenSoft, color: C.green, line: C.green });
  addFooter(s, 'DEMO FLOW', 13);
  notesIndex.push(addNotes(s, 'Use this slide as the live-demo script. For each engine, business owners should validate the basis, ordering, assignment scope, result and trace—not just whether the screen can save.', [
    'ATLAS wireframe workflow captured 2026-08-10.',
    'ATLAS_Phase2_Master_Requirements_for_Codex_Claude.md, confirmed intent for validation, exception alerts, employee/admin notification, audit logging and deterministic policy traces.',
  ]));
}

// 14 — Close
{
  const s = presentation.slides.add(); s.background.fill = C.ink;
  addText(s, 'BUSINESS TAKEAWAY', { left: 56, top: 48, width: 360, height: 26 }, { fontSize: 14, bold: true, color: '#CDB5E4' });
  addText(s, 'Payroll policy becomes\nvisible, testable, and traceable.', { left: 56, top: 114, width: 980, height: 150 }, { fontSize: 46, bold: true, color: C.white, lineSpacing: 0.9 });
  const cards = [
    ['VISIBLE', 'The rule, owning engine, and effective values are shown together.'],
    ['TESTABLE', 'Payroll can run a scenario before using the policy in payroll.'],
    ['TRACEABLE', 'Source, version, assignment, result, and change history stay linked.'],
  ];
  cards.forEach((r, i) => {
    const x = 56 + i * 388;
    addBox(s, { left: x, top: 332, width: 348, height: 164 }, { fill: '#1C1C1C', line: i === 1 ? '#CDB5E4' : '#4B4B4B', width: i === 1 ? 2 : 1 });
    addText(s, r[0], { left: x + 22, top: 356, width: 304, height: 28 }, { fontSize: 16, bold: true, color: '#CDB5E4' });
    addText(s, r[1], { left: x + 22, top: 404, width: 304, height: 70 }, { fontSize: 19, color: C.white, lineSpacing: 1.02 });
  });
  addText(s, 'Next business workshop', { left: 56, top: 554, width: 260, height: 28 }, { fontSize: 16, bold: true, color: '#CDB5E4' });
  addText(s, 'Validate one representative scenario per engine  •  confirm employee groups  •  confirm owners and effective dates', { left: 56, top: 594, width: 1120, height: 44 }, { fontSize: 20, color: C.white });
  addText(s, '14', { left: 1160, top: 680, width: 64, height: 20 }, { fontSize: 11, bold: true, color: '#9A9A9A', alignment: 'right' });
  notesIndex.push(addNotes(s, 'Close the main presentation here. Ask the business to validate one representative scenario for each engine and to confirm employee-group assignments, data owners and effective dates. The remaining slides are the sourced annex.', [
    'Synthesis of supplied payroll workbooks, requirements summary, and ATLAS wireframe evidence cited throughout slides 2-13.',
  ]));
}

// 15 — Traceability annex
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Annex A', 'TRACEABILITY');
  addTitle(s, 'Requirement-to-wireframe map');
  const cols = [56, 242, 560, 940];
  const widths = [174, 306, 368, 284];
  ['Business area', 'Source of truth', 'Wireframe translation', 'Demo evidence'].forEach((h, i) => {
    addBox(s, { left: cols[i], top: 148, width: widths[i], height: 54 }, { fill: C.ink, line: C.ink, radius: false });
    addText(s, h, { left: cols[i] + 12, top: 162, width: widths[i] - 24, height: 28 }, { fontSize: 15, bold: true, color: C.white });
  });
  const rows = [
    ['Take-Home Pay', 'Annex B — Take Home Pay\nBRD Audit H54:J54', 'THP-001/002 + REF-011 + deferral and module links', 'Slides 6–7'],
    ['Retirement Pay', 'Annex B — Retirement Pay\nRetirement sample workbook', 'RET-001/002 + eligibility, rounding, plan comparison', 'Slide 8'],
    ['Final Pay', 'Annex B — Final Pay\nBRD Audit H55:J55', 'FIN-001 + leave, retirement, loans, accountabilities, tax', 'Slide 9'],
    ['Gross Up', 'Annex B — Gross Up\nGross-up sample workbooks', 'GUP-001 + target net, tax method, iteration trace', 'Slide 10'],
    ['Company Rules', 'BRD Audit H61:J64\nProject Plan HTP018/019/023', 'One register + 3-step mapped policy-code flow', 'Slides 4–5'],
  ];
  rows.forEach((row, r) => {
    const y = 202 + r * 88;
    row.forEach((txt, i) => {
      addBox(s, { left: cols[i], top: y, width: widths[i], height: 88 }, { fill: r % 2 === 0 ? C.white : '#F0EFEC', line: C.line, radius: false });
      addText(s, txt, { left: cols[i] + 12, top: y + 12, width: widths[i] - 24, height: 64 }, { fontSize: i === 0 ? 17 : 15, bold: i === 0 || i === 3, color: i === 3 ? C.violet : C.ink, verticalAlignment: 'middle' });
    });
  });
  addText(s, 'Interpretation rule: source samples are configurable policy options; they are not all applied at once.', { left: 56, top: 656, width: 1000, height: 22 }, { fontSize: 13, italic: true, color: C.muted });
  addFooter(s, 'ANNEX A', 15);
  notesIndex.push(addNotes(s, 'Use this table when a stakeholder asks where a screen came from. It points to the source tab and the exact wireframe object used in the main story.', [
    '02Annex B_ Employee Masterfile Payroll Data Tables from Dorado.xlsx, Take Home Pay, Retirement Pay, Final Pay and Gross Up tabs.',
    'Phase 2 BRD Audit Summary.xlsx, computational-basis, rules and reference-table rows cited in the table.',
    'Phase 2 - Payroll - Project Plan.xlsx, HTP018, HTP019, HTP023, HTP073-HTP075.',
  ]));
}

// 16 — Scenario annex
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Annex B', 'SCENARIO PACK');
  addTitle(s, 'Representative business validation scenarios');
  const cards = [
    ['Take-Home', '30% of gross less reimbursements', 'Statutory full; controllable items stop or defer'],
    ['Retirement', '₱20k monthly / 30 × 22.5 × 10', '₱150,000 statutory example'],
    ['Final Pay', 'Salary + 13th + leave + retirement', 'Less authorized balances and final tax'],
    ['Gross Up', '₱10k net at 20% simple rate', '₱12,500 gross; ₱2,500 employer tax'],
  ];
  cards.forEach((r, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 56 + col * 584;
    const y = 164 + row * 228;
    addBox(s, { left: x, top: y, width: 544, height: 196 }, { fill: i === 0 ? C.violetSoft : C.white, line: i === 0 ? C.violet : C.ink, width: i === 0 ? 2 : 1 });
    addText(s, `0${i + 1}`, { left: x + 20, top: y + 20, width: 52, height: 28 }, { fontSize: 15, bold: true, color: C.violet });
    addText(s, r[0], { left: x + 82, top: y + 18, width: 430, height: 34 }, { fontSize: 25, bold: true });
    addText(s, 'INPUT', { left: x + 22, top: y + 80, width: 72, height: 20 }, { fontSize: 12, bold: true, color: C.muted });
    addText(s, r[1], { left: x + 96, top: y + 74, width: 412, height: 42 }, { fontSize: 18, bold: true });
    addText(s, 'EXPECTED', { left: x + 22, top: y + 132, width: 72, height: 20 }, { fontSize: 12, bold: true, color: C.muted });
    addText(s, r[2], { left: x + 96, top: y + 126, width: 412, height: 50 }, { fontSize: 17, color: C.ink });
  });
  addText(s, 'Use these as starting cases. Add client-specific exceptions only after the base outcome is agreed.', { left: 56, top: 630, width: 1110, height: 30 }, { fontSize: 16, italic: true, color: C.muted });
  addFooter(s, 'ANNEX B', 16);
  notesIndex.push(addNotes(s, 'These are workshop-friendly starting cases derived from the supplied files. Use them to agree the expected result before expanding into exceptions and edge cases.', [
    '02Annex B_ Employee Masterfile Payroll Data Tables from Dorado.xlsx, Gross Up, Take Home Pay, Retirement Pay and Final Pay tabs.',
    '04Sample Gross Up of Earnings.xlsx and 05Sample Computation - Retirement.xlsx.',
  ]));
}

// 17 — Glossary
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Glossary', 'PLAIN LANGUAGE');
  addTitle(s, 'Six terms used in the demo');
  const terms = [
    ['Computation', 'A controlled formula that produces a payroll value.'],
    ['Policy code', 'A reusable company configuration of an approved engine/template.'],
    ['Company Rule', 'The audience, business wording, category and activation link.'],
    ['Reference source', 'Versioned data used by formulas: tax, contributions, ceilings, hierarchy.'],
    ['Client assignment', 'The link between a computation, data source, group and frequency.'],
    ['Scenario simulator', 'A safe preview of the result and decision trace before payroll.'],
  ];
  terms.forEach((r, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 56 + col * 584;
    const y = 164 + row * 152;
    addBox(s, { left: x, top: y, width: 544, height: 124 }, { fill: i === 1 ? C.violetSoft : C.white, line: i === 1 ? C.violet : C.line });
    addText(s, r[0], { left: x + 22, top: y + 20, width: 500, height: 30 }, { fontSize: 22, bold: true, color: i === 1 ? C.violet : C.ink });
    addText(s, r[1], { left: x + 22, top: y + 62, width: 500, height: 46 }, { fontSize: 16, color: C.muted });
  });
  addFooter(s, 'GLOSSARY', 17);
  notesIndex.push(addNotes(s, 'Use this only if terminology becomes a distraction during discussion. The separation between computation, policy code, rule and assignment is the key distinction.', [
    'Terminology aligned to the ATLAS wireframe information architecture and supplied requirement documents.',
  ]));
}

// 18 — Sources and interpretation notes
{
  const s = presentation.slides.add(); s.background.fill = C.paper;
  addKicker(s, 'Sources', 'SOURCE OF TRUTH');
  addTitle(s, 'Files used to derive this wireframe story');
  const left = [
    ['PRIMARY PAYROLL TABLES', '02Annex B_ Employee Masterfile Payroll Data Tables from Dorado.xlsx\nTabs: Gross Up, Take Home Pay, Retirement Pay, Final Pay, Pay Items, Deductions, Loans'],
    ['PROJECT / BRD ALIGNMENT', 'Phase 2 - Payroll - Project Plan.xlsx\nPhase 2 BRD Audit Summary.xlsx\nTabs/rows: Modules and Features, HTP018/019/023, HTP073-075, H54-55, H61-64'],
    ['REFERENCE TABLES', 'PHASE 2 - REFERENCE TABLE [CORE].xlsx\nATLAS-3001 Reference Tables.docx'],
  ];
  const right = [
    ['COMPUTATION EXAMPLES', '05Sample Computation - Retirement.xlsx\n04Sample Gross Up of Earnings.xlsx\n06Sample Computation and Gross Up_Final Tax.xlsx'],
    ['CONSOLIDATED REQUIREMENTS', 'ATLAS_Phase2_Master_Requirements_for_Codex_Claude.md\nSections 8, 11, 12 and source inventory'],
    ['WIREFRAME EVIDENCE', 'ATLAS local prototype\nhttp://localhost:5173/wireframe\nClient view captured 10 Aug 2026'],
  ];
  [left, right].forEach((arr, col) => arr.forEach((r, i) => {
    const x = 56 + col * 584;
    const y = 164 + i * 132;
    addBox(s, { left: x, top: y, width: 544, height: 108 }, { fill: C.white, line: C.line });
    addText(s, r[0], { left: x + 20, top: y + 16, width: 500, height: 22 }, { fontSize: 13, bold: true, color: C.violet });
    addText(s, r[1], { left: x + 20, top: y + 46, width: 500, height: 52 }, { fontSize: 15, color: C.ink, lineSpacing: 1.0 });
  }));
  addBox(s, { left: 56, top: 576, width: 1128, height: 74 }, { fill: C.amberSoft, line: C.amber });
  addText(s, 'Interpretation notes', { left: 76, top: 590, width: 190, height: 22 }, { fontSize: 14, bold: true, color: C.amber });
  addText(s, 'Source samples are treated as configurable alternatives. Built-in formulas remain controlled; company-owned calculations use approved fields/operators. Inventory targets (219 vs ~300 computations; 18 vs 30 reference tables) require business reconciliation before production sign-off.', { left: 266, top: 588, width: 892, height: 50 }, { fontSize: 14, color: C.ink });
  addFooter(s, 'SOURCES', 18);
  notesIndex.push(addNotes(s, 'This is the derivation record. Call out the two inventory discrepancies and the implementation interpretation around company-created calculations. Statutory rates and effective values must be validated by the designated business/legal owner before production.', [
    'All source files listed on this slide were supplied by the user and inspected locally for this deck.',
    'ATLAS wireframe, http://localhost:5173/wireframe, captured 2026-08-10.',
  ]));
}

await fs.mkdir(OUT, { recursive: true });
for (const [i, slide] of presentation.slides.items.entries()) {
  const stem = `slide-${String(i + 1).padStart(2, '0')}`;
  const png = await presentation.export({ slide, format: 'png', scale: 1 });
  await fs.writeFile(path.join(OUT, `${stem}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: 'layout' });
  await fs.writeFile(path.join(OUT, `${stem}.layout.json`), await layout.text(), 'utf8');
}
const montage = await presentation.export({ format: 'webp', montage: true, scale: 1 });
await fs.writeFile(path.join(OUT, 'deck-montage.webp'), new Uint8Array(await montage.arrayBuffer()));

const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(PPTX);
await fs.writeFile(path.join(OUT, 'source-notes.txt'), notesIndex.map((n, i) => `SLIDE ${i + 1}\n${n}`).join('\n\n---\n\n'), 'utf8');
console.log(`Created ${PPTX}`);
console.log(`Rendered ${presentation.slides.items.length} slides to ${OUT}`);
