import fs from 'node:fs/promises';
import path from 'node:path';
import { PresentationFile, FileBlob } from '@oai/artifact-tool';

const W = 1280;
const H = 720;
const C = {
  ink: '#111111',
  muted: '#66645F',
  violet: '#5C2A91',
  violetSoft: '#F2ECF8',
  line: '#D8DEEC',
  white: '#FFFFFF',
  paper: '#F7F7F5',
};

const presentation = await PresentationFile.importPptx(await FileBlob.load('template-starter.pptx'));

function byName(slide, name) {
  return slide.shapes.items.find((shape) => shape.name === name);
}

function styleText(shape, { fontSize = 16, color = C.ink, bold = false, alignment = 'left', verticalAlignment = 'top' } = {}) {
  shape.text.style = { fontFamily: 'Calibri', fontSize, color, bold };
  shape.text.alignment = alignment;
  shape.text.verticalAlignment = verticalAlignment;
  shape.text.autoFit = 'shrinkText';
  shape.text.wrap = 'square';
}

function setText(shape, text, options = {}) {
  shape.text = text;
  styleText(shape, options);
  return shape;
}

function addShape(slide, geometry, position, fill, line, name) {
  return slide.shapes.add({
    geometry,
    position,
    fill,
    line: { style: 'solid', fill: line, width: line === 'none' ? 0 : 1 },
    name,
  });
}

function addText(slide, text, position, options = {}, name) {
  const shape = addShape(slide, 'textbox', position, 'none', 'none', name);
  return setText(shape, text, options);
}

function notes(slide, title, crop, fields) {
  slide.speakerNotes.textFrame.setText([
    `Presenter cue: Use the numbered arrows to explain ${title} from top to bottom.`,
    '',
    '[Sources]',
    `- ATLAS wireframe, http://localhost:5173/wireframe, ${crop}, client view captured 2026-08-10.`,
    `- Field inventory shown on this slide: ${fields.join('; ')}.`,
    '- 02Annex B_ Employee Masterfile Payroll Data Tables from Dorado.xlsx, corresponding Take Home Pay, Retirement Pay, Final Pay, or Gross Up tab.',
    '[/Sources]',
  ].join('\n'));
}

async function bytes(file) {
  const data = await fs.readFile(path.resolve('crops', file));
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

function addCallouts(slide, groups, imagePos, anchorYs) {
  const count = groups.length;
  const top = 140;
  const gap = 6;
  const boxHeight = count === 5 ? 94 : 78;
  const boxLeft = 820;
  const boxWidth = 398;
  const boxAnchors = [];
  const imageAnchors = [];

  for (let i = 0; i < count; i += 1) {
    const y = top + i * (boxHeight + gap);
    const imageY = anchorYs[i] ?? (imagePos.top + ((i + 1) / (count + 1)) * imagePos.height);
    const sourceAnchor = addShape(slide, 'ellipse', { left: boxLeft - 1, top: y + boxHeight / 2, width: 1, height: 1 }, 'none', 'none', `callout-anchor-${i + 1}`);
    const fieldAnchor = addShape(slide, 'ellipse', { left: imagePos.left + imagePos.width - 5, top: imageY, width: 1, height: 1 }, 'none', 'none', `field-anchor-${i + 1}`);
    boxAnchors.push(sourceAnchor);
    imageAnchors.push(fieldAnchor);
    slide.shapes.connect(sourceAnchor, fieldAnchor, {
      kind: 'elbow',
      fromSide: 'left',
      toSide: 'right',
      line: { style: 'solid', fill: C.violet, width: 1.6 },
      tail: { type: 'arrow', width: 'med', length: 'med' },
    });
  }

  for (let i = 0; i < count; i += 1) {
    const y = top + i * (boxHeight + gap);
    const existingTitleNames = ['Text 3', 'Text 5', 'Text 7'];
    const existingCopyNames = ['Text 4', 'Text 6', 'Text 8'];
    let box;
    let titleShape;
    let copyShape;
    if (i === 0) {
      box = byName(slide, 'Shape 9');
      box.position = { left: boxLeft, top: y, width: boxWidth, height: boxHeight };
      box.fill = 'none';
      box.line = { style: 'solid', fill: C.line, width: 1 };
      box.borderRadius = 12;
      box.bringToFront();
    } else {
      box = addShape(slide, 'roundRect', { left: boxLeft, top: y, width: boxWidth, height: boxHeight }, 'none', i % 2 === 0 ? C.line : '#C9AFE0', `callout-box-${i + 1}`);
    }
    if (i < 3) {
      titleShape = byName(slide, existingTitleNames[i]);
      copyShape = byName(slide, existingCopyNames[i]);
      titleShape.position = { left: boxLeft + 18, top: y + 10, width: boxWidth - 34, height: 22 };
      copyShape.position = { left: boxLeft + 18, top: y + 33, width: boxWidth - 34, height: boxHeight - 40 };
      setText(titleShape, groups[i][0], { fontSize: 14, color: C.violet, bold: true, verticalAlignment: 'middle' });
      setText(copyShape, groups[i][1], { fontSize: 12.5, color: C.ink });
      titleShape.bringToFront();
      copyShape.bringToFront();
    } else {
      addText(slide, groups[i][0], { left: boxLeft + 18, top: y + 10, width: boxWidth - 34, height: 22 }, { fontSize: 14, color: C.violet, bold: true, verticalAlignment: 'middle' }, `callout-title-${i + 1}`);
      addText(slide, groups[i][1], { left: boxLeft + 18, top: y + 33, width: boxWidth - 34, height: boxHeight - 40 }, { fontSize: 12.5, color: C.ink }, `callout-copy-${i + 1}`);
    }

    const imageY = anchorYs[i] ?? (imagePos.top + ((i + 1) / (count + 1)) * imagePos.height);
    addShape(slide, 'ellipse', { left: imagePos.left + imagePos.width - 20, top: imageY - 13, width: 28, height: 28 }, C.ink, C.ink, `field-badge-${i + 1}`);
    addText(slide, String(i + 1), { left: imagePos.left + imagePos.width - 20, top: imageY - 13, width: 28, height: 28 }, { fontSize: 12, color: C.white, bold: true, alignment: 'center', verticalAlignment: 'middle' }, `field-number-${i + 1}`);
  }
}

const pages = [
  {
    slide: 32, kicker: 'TAKE-HOME PAY · FIELD GUIDE', title: 'Scope and protected minimum', crop: 'thp-core.png',
    image: { left: 76, top: 178, width: 680, height: 382 }, anchors: [210, 258, 330, 405, 492],
    groups: [
      ['Enable engine', 'Turns the Take-Home policy on or off without deleting its approved configuration.'],
      ['Employee group', 'Defines which assigned population receives this configuration; the Company Rule carries the same scope.'],
      ['Protected base', 'Chooses the pay amount protected by the rule: Basic Pay, Gross Pay, or Gross less reimbursements/receivables.'],
      ['Threshold type + Threshold', 'Selects percentage or fixed PHP and stores the protected-minimum value used in the cutoff.'],
      ['Conflict priority', 'Resolves overlapping assignments so payroll applies one authoritative protection policy.'],
    ],
  },
  {
    slide: 33, kicker: 'TAKE-HOME PAY · FIELD GUIDE', title: 'Deduction and loan caps', crop: 'thp-caps.png',
    image: { left: 250, top: 132, width: 398, height: 552 }, anchors: [350, 410, 455, 550, 625],
    groups: [
      ['Apply total deductions cap', 'Enables one overall ceiling for controllable non-loan deductions in the payroll period.'],
      ['Deductions cap base', 'Selects the pay amount used to calculate the deduction ceiling.'],
      ['Deductions cap type + cap', 'Defines whether the ceiling is a percentage or fixed amount and stores the limit.'],
      ['Loan cap base', 'Selects the pay amount used when limiting loan collections.'],
      ['Loan cap type + cap', 'Defines percentage or fixed treatment and the maximum loan collection for the cutoff.'],
    ],
  },
  {
    slide: 34, kicker: 'TAKE-HOME PAY · FIELD GUIDE', title: 'Deferral, disclosure, and ownership', crop: 'thp-deferral.png',
    image: { left: 250, top: 132, width: 398, height: 552 }, anchors: [195, 320, 375, 430, 485, 585],
    groups: [
      ['Attendance cap base/type/cap', 'Defines the attendance ceiling before the engine begins adjusting lower-priority collections.'],
      ['Auto-defer or stagger deductions', 'Allows the engine to reduce or postpone lower-priority deductions when earnings are insufficient.'],
      ['Carry forward to next payroll', 'Stores outstanding amount, reason, rescheduled date, and new balance for the next cutoff.'],
      ['Payslip tagging', 'Shows original due, deducted, deferred, accumulated, and remaining values to the employee.'],
      ['Admin and employee notification', 'Sends an alert when an item is deferred or an exception still requires action.'],
      ['REF-011 + module links', 'Deduction, Company Loan, and Government Loan modules own codes/balances; REF-011 owns only their adjustment order.'],
    ],
  },
  {
    slide: 35, kicker: 'TAKE-HOME PAY · FIELD GUIDE', title: 'Hierarchy rows and carry-forward balances', crop: 'thp-hierarchy.png',
    image: { left: 260, top: 132, width: 376, height: 552 }, anchors: [172, 250, 330, 410, 500, 610],
    groups: [
      ['Priority', 'Lower rank numbers are adjusted first; statutory deductions remain protected and outside deferral.'],
      ['Collection', 'Displays the owning module code, classification, and partial/full-deduction behavior.'],
      ['Amount due', 'Current cutoff amount requested by the owning deduction or loan module.'],
      ['Deferred', 'Amount not collected this cutoff because the net-pay requirement or cap was reached.'],
      ['Outstanding / carry-forward', 'Remaining module balance after the current deduction and any deferral are posted.'],
      ['Deduction and loan sections', 'Separate lists preserve module ownership while a single REF-011 order controls the combined calculation.'],
    ],
  },
  {
    slide: 36, kicker: 'RETIREMENT PAY · FIELD GUIDE', title: 'Plan choice and formula inputs', crop: 'ret-formula.png',
    image: { left: 250, top: 132, width: 398, height: 552 }, anchors: [180, 250, 330, 410, 500, 605],
    groups: [
      ['Employee group', 'Assigns the retirement configuration to all employees or a governed population.'],
      ['Retirement plan type', 'Chooses statutory RA 7641, company plan, or the more-beneficial comparison.'],
      ['Company salary basis + daily divisor', 'Selects latest basic pay or average salary and converts the basis to a daily rate.'],
      ['Statutory + company-plan days/year', 'Stores the benefit-day multipliers used by each formula.'],
      ['Additional benefits', 'Adds approved company-plan amounts after the core service-based computation.'],
      ['More-beneficial comparison', 'Calculates statutory and company-plan values independently, then selects the higher qualifying result.'],
    ],
  },
  {
    slide: 37, kicker: 'RETIREMENT PAY · FIELD GUIDE', title: 'Eligibility, limits, rounding, and tax', crop: 'ret-eligibility.png',
    image: { left: 250, top: 132, width: 398, height: 552 }, anchors: [170, 250, 330, 410, 500, 610],
    groups: [
      ['Minimum retirement age', 'Earliest standard age that can pass the retirement eligibility test.'],
      ['Compulsory retirement age', 'Age at which the employee is treated as compulsorily retired under the configured plan.'],
      ['Minimum service + early-retirement age', 'Combines required service with the optional company early-retirement threshold.'],
      ['Minimum guarantee + maximum cap', 'Applies a floor and an optional ceiling; zero maximum means no cap.'],
      ['Service rounding', 'Controls whether partial service years round down, round up, or count after six months.'],
      ['Taxation rule + BIR-approved plan', 'Evaluates RA 7641/NIRC/RA 4917 treatment and enables the approved-plan exemption condition.'],
    ],
  },
  {
    slide: 38, kicker: 'RETIREMENT PAY · FIELD GUIDE', title: 'Scenario inputs and calculated result', crop: 'ret-scenario.png',
    image: { left: 320, top: 132, width: 290, height: 522 }, anchors: [178, 255, 335, 415, 500, 600],
    groups: [
      ['Date of birth / hired / retirement', 'Derives age and service at the selected retirement date.'],
      ['Reason', 'Identifies retirement as the separation event used by eligibility and downstream Final Pay.'],
      ['Plan membership', 'States whether the employee participates in the company plan or statutory basis only.'],
      ['Monthly basic pay + average salary', 'Provides both possible salary bases so the selected policy can use the correct one.'],
      ['Age / service / eligible', 'Displays the resolved eligibility facts before the benefit amount is accepted.'],
      ['Rounded years + values + tax trace', 'Shows statutory, company-plan, selected retirement pay, tax status, and calculation trace.'],
    ],
  },
  {
    slide: 39, kicker: 'FINAL PAY · FIELD GUIDE', title: 'Included earnings and company components', crop: 'final-components.png',
    image: { left: 150, top: 132, width: 500, height: 512 }, anchors: [174, 248, 330, 412, 500, 600],
    groups: [
      ['Enable engine', 'Activates Final Pay processing for separated employees without removing the policy.'],
      ['Employee group', 'Applies the policy to the governed employee population.'],
      ['Mandatory components', 'Unpaid Salary, prorated 13th month, SIL conversion, Separation Pay, Retirement Pay, and Final Tax.'],
      ['Optional company components', 'Convertible VL/SL beyond SIL, Allowances, Commissions, Cash Bond return, and Gratuity Pay.'],
      ['Retirement Pay linkage', 'Pulls the approved Retirement engine result rather than asking payroll to re-enter the value.'],
      ['Component checkboxes', 'Each selection determines whether the item is included in the scenario, breakdown, and net result.'],
    ],
  },
  {
    slide: 40, kicker: 'FINAL PAY · FIELD GUIDE', title: 'Company rules for conversion and offsets', crop: 'final-rules.png',
    image: { left: 220, top: 132, width: 430, height: 518 }, anchors: [174, 250, 330, 410, 495, 598],
    groups: [
      ['Leave conversion rule', 'Controls whether unused VL/SIL is converted and which daily rate is used.'],
      ['Separation pay rule by cause', 'Maps retirement, redundancy, retrenchment, resignation, or just cause to the correct benefit rule.'],
      ['Daily divisor + service rounding', 'Converts salary to a daily rate and resolves partial service years consistently.'],
      ['Advance 13th + last cutoff', 'Controls recovery of prior 13th-month releases and whether an unposted cutoff is included.'],
      ['Government + company loan balances', 'Offsets, endorses, or converts outstanding balances according to the owning module policy.'],
      ['Negative net + auto-offset + notice', 'Routes a negative result, applies authorized balances/accountabilities, and notifies payroll on release.'],
    ],
  },
  {
    slide: 41, kicker: 'FINAL PAY · FIELD GUIDE', title: 'Scenario inputs', crop: 'final-inputs.png',
    image: { left: 320, top: 132, width: 290, height: 480 }, anchors: [170, 245, 320, 395, 470, 560],
    groups: [
      ['Unpaid salary + prorated 13th', 'Current salary due and the earned 13th-month portion through the separation date.'],
      ['SIL conversion + separation pay', 'Leave conversion value and cause-based separation benefit.'],
      ['Convertible VL/SL + allowances', 'Company-enabled leave and allowance amounts included as earnings.'],
      ['Cash bond + advance 13th', 'Returns eligible cash bond and recovers an advance when the policy requires it.'],
      ['Government + company loan balances', 'Outstanding balances supplied by their owning loan modules for configured treatment.'],
      ['Property accountability + final tax', 'Authorized accountability offset and the final withholding/tax adjustment.'],
    ],
  },
  {
    slide: 42, kicker: 'FINAL PAY · FIELD GUIDE', title: 'Result, readiness, and breakdown', crop: 'final-results.png',
    image: { left: 330, top: 132, width: 260, height: 520 }, anchors: [170, 245, 320, 395, 485, 590],
    groups: [
      ['Gross final pay', 'Total enabled earnings before authorized offsets and final tax.'],
      ['Total offsets', 'Sum of recoveries, balances, accountabilities, and final-tax items.'],
      ['Retirement pay included', 'Confirms the amount received from the Retirement Pay engine.'],
      ['Net final pay', 'Gross final pay less all authorized offsets.'],
      ['Release readiness', 'Confirms that enabled components were calculated and required offsets were applied.'],
      ['Breakdown table', 'Itemizes every earning and offset so payroll can explain, approve, and audit the result.'],
    ],
  },
  {
    slide: 43, kicker: 'GROSS UP · FIELD GUIDE', title: 'Policy settings for a guaranteed net', crop: 'gup-config.png',
    image: { left: 220, top: 132, width: 420, height: 518 }, anchors: [170, 245, 320, 395, 480, 590],
    groups: [
      ['Enable engine + employee group', 'Activates the policy and identifies the governed population.'],
      ['Guaranteed target', 'Selects the promise being solved—normally employee Net Pay.'],
      ['Tax method + table date', 'Uses the effective graduated withholding table or a flat/final tax method.'],
      ['Payroll frequency + flat rate', 'Chooses the bracket frequency and stores the alternative flat/final percentage.'],
      ['Employer-absorbed share', 'Defines how much of the calculated withholding is paid by the employer.'],
      ['Tolerance / iterations / rounding / statutory-first', 'Controls convergence, precision, stopping limit, and deduction of mandatory contributions before tax.'],
    ],
  },
  {
    slide: 44, kicker: 'GROSS UP · FIELD GUIDE', title: 'Scenario inputs and convergence result', crop: 'gup-scenario.png',
    image: { left: 315, top: 132, width: 300, height: 484 }, anchors: [170, 245, 320, 395, 480, 575],
    groups: [
      ['Target net', 'Employee net amount the engine must guarantee.'],
      ['Employee statutory share', 'Mandatory employee contributions deducted before the withholding bracket is applied.'],
      ['Non-taxable allowance', 'Amount included in cash received but excluded from taxable compensation.'],
      ['YTD taxable income', 'Prior taxable earnings used when the selected method requires year-to-date context.'],
      ['Gross / tax / employer / net outputs', 'Shows candidate gross taxable pay, withholding, employer absorption, and resulting employee net.'],
      ['Convergence + calculation trace', 'Confirms the gap is within tolerance and records each iteration for review and audit.'],
    ],
  },
];

// New section divider (output slide 31).
{
  const slide = presentation.slides.items[30];
  setText(byName(slide, 'Text 0'), 'POLICY ENGINE FIELD GUIDE', { fontSize: 18, color: C.violet, bold: true });
  setText(byName(slide, 'Text 1'), 'Every field, explained', { fontSize: 38, color: C.white, bold: true });
  setText(byName(slide, 'Text 2'), 'Focused wireframe crops · numbered arrows · plain-language payroll purpose', { fontSize: 20, color: '#C8C9D4' });
  slide.speakerNotes.textFrame.setText([
    'Presenter cue: Introduce the next section as a practical field-by-field guide for payroll reviewers.',
    '', '[Sources]',
    '- ATLAS wireframe, http://localhost:5173/wireframe, client view captured 2026-08-10.',
    '- Policy engine field counts shown in Computational Basis: Take-Home Pay 30, Retirement Pay 22, Final Pay 31, Gross Up 11.',
    '[/Sources]',
  ].join('\n'));
}

for (const page of pages) {
  const slide = presentation.slides.items[page.slide - 1];
  setText(byName(slide, 'Text 0'), page.kicker, { fontSize: 13, color: C.violet, bold: true });
  setText(byName(slide, 'Text 1'), page.title, { fontSize: 30, color: C.ink, bold: true });
  const inheritedCaption = byName(slide, 'Text 2');
  inheritedCaption.position = { left: 60, top: 686, width: 710, height: 20 };
  setText(inheritedCaption, 'Numbered arrows point to the live wireframe control; values shown are demo data.', { fontSize: 11.5, color: C.muted, verticalAlignment: 'middle' });
  const inheritedSource = byName(slide, 'Text 10');
  inheritedSource.position = { left: 820, top: 686, width: 398, height: 20 };
  setText(inheritedSource, 'Source · ATLAS local wireframe · Client view', { fontSize: 10.5, color: C.muted, alignment: 'right', verticalAlignment: 'middle' });

  for (const inheritedImage of [...slide.images.items]) inheritedImage.delete();
  slide.images.add({
    blob: await bytes(page.crop),
    contentType: 'image/png',
    alt: `${page.title} wireframe field close-up`,
    fit: 'contain',
    position: page.image,
    geometry: 'rect',
  });

  addCallouts(slide, page.groups, page.image, page.anchors);
  notes(slide, page.title, page.crop, page.groups.map((g) => g[0]));
}

const output = path.resolve('ATLAS_Phase2_Computational_Basis_Demo_Ready_Field_Guide.pptx');
const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(output);

await fs.mkdir('new-slide-preview', { recursive: true });
for (let i = 30; i <= 43; i += 1) {
  const slide = presentation.slides.items[i];
  const png = await presentation.export({ slide, format: 'png', scale: 1.5 });
  await fs.writeFile(path.resolve('new-slide-preview', `slide-${String(i + 1).padStart(2, '0')}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: 'layout' });
  await fs.writeFile(path.resolve('new-slide-preview', `slide-${String(i + 1).padStart(2, '0')}.layout.json`), await layout.text(), 'utf8');
}
console.log(`Created ${output} with ${presentation.slides.items.length} slides.`);
