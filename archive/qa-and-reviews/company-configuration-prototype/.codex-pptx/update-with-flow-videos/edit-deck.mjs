import fs from 'node:fs';
import path from 'node:path';
import { PresentationFile, FileBlob } from '@oai/artifact-tool';

const root = process.cwd();
const input = path.join(root, 'template-starter.pptx');
const output = 'C:/Users/josrp/OneDrive/Documents/Atlas/company-configuration-prototype/.codex-pptx/update-with-flow-videos/media-base.pptx';
const videoFolder = 'C:/Users/josrp/OneDrive/Documents/Atlas/ATLAS_Demo_Videos';
fs.mkdirSync(videoFolder, { recursive: true });

const presentation = await PresentationFile.importPptx(await FileBlob.load(input));
const liveInspect = await presentation.inspect({ kind: 'textbox,shape,image,notes', maxChars: 2000000 });
const liveRecords = liveInspect.ndjson.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

const demos = [
  {
    slide: 11, imageId: '10', captionId: '9', media: '01-company-rules',
    texts: {
      '2': 'COMPANY RULES · DEMO',
      '3': 'From business rule to governed computation',
      '5': 'Watch the three-step flow',
      '6': '1 · Define the employee scope, category and plain-language rule.',
      '7': '2 · Select an approved policy-engine code.\n3 · Review its parameters and linkage before applying.',
      '9': '▶ EMBEDDED 14-SECOND VIDEO · CLICK TO PLAY',
    },
    source: 'Atlas wireframe — Company Rules / Apply New Rule',
  },
  {
    slide: 13, imageId: '14', captionId: '13', media: '02-take-home-pay',
    texts: {
      '2': 'TAKE-HOME PAY · DEMO', '3': 'Configure protection, caps and deferral', '5': 'What to watch',
      '6': '1 · Choose code', '7': 'Open THP-001 from the governed library.',
      '8': '2 · Configure', '9': 'Set the protected base, minimum threshold and deduction / loan caps.',
      '10': '3 · Validate', '11': 'Use the simulator and deduction ledger before saving.',
      '13': '▶ EMBEDDED 7-SECOND VIDEO · CLICK TO PLAY',
    },
    source: 'Atlas wireframe — THP-001 Minimum Take-Home Pay',
  },
  {
    slide: 25, imageId: '14', captionId: '13', media: '03-retirement-pay',
    texts: {
      '2': 'RETIREMENT PAY · DEMO', '3': 'Configure eligibility and benefit basis', '5': 'What to watch',
      '6': '1 · Choose code', '7': 'Open RET-001 from the governed library.',
      '8': '2 · Configure', '9': 'Set plan type, service-year basis, age and salary inputs.',
      '10': '3 · Validate', '11': 'Compare statutory and company-plan outcomes before saving.',
      '13': '▶ EMBEDDED 7-SECOND VIDEO · CLICK TO PLAY',
    },
    source: 'Atlas wireframe — RET-001 Retirement Pay',
  },
  {
    slide: 33, imageId: '14', captionId: '13', media: '04-final-pay',
    texts: {
      '2': 'FINAL PAY · DEMO', '3': 'Select components, offsets and settlement rules', '5': 'What to watch',
      '6': '1 · Choose code', '7': 'Open FIN-001 from the governed library.',
      '8': '2 · Configure', '9': 'Enable pay components and define authorized offsets.',
      '10': '3 · Validate', '11': 'Review the employee-level breakdown and negative-net handling.',
      '13': '▶ EMBEDDED 7-SECOND VIDEO · CLICK TO PLAY',
    },
    source: 'Atlas wireframe — FIN-001 Final Pay',
  },
  {
    slide: 41, imageId: '16', captionId: '15', media: '05-gross-up',
    texts: {
      '2': 'GROSS UP · DEMO', '3': 'Define the net target and tax absorption method', '5': 'What to watch',
      '6': '1 · Choose code', '7': 'Open GUP-001 from the governed library.',
      '8': '2 · Define target', '9': 'Choose guaranteed net, tax method and rate source.',
      '10': '3 · Control', '11': 'Set employer share, rounding and convergence limits.',
      '12': '4 · Validate', '13': 'Confirm the calculated gross and employer tax cost.',
      '15': '▶ EMBEDDED 7-SECOND VIDEO · CLICK TO PLAY',
    },
    source: 'Atlas wireframe — GUP-001 Gross Up',
  },
];

function layoutFor(slideNumber) {
  return JSON.parse(fs.readFileSync(path.join(root, 'template-starter-layout', `starter-slide-${String(slideNumber).padStart(2, '0')}.layout.json`), 'utf8'));
}

for (const demo of demos) {
  const layout = layoutFor(demo.slide);
  const byId = new Map(layout.elements.map((element) => [String(element.id), element]));
  for (const [id, value] of Object.entries(demo.texts)) {
    const element = byId.get(id);
    if (!element?.name || typeof element.text !== 'string') throw new Error(`Missing text ${id} on slide ${demo.slide}`);
    const live = liveRecords.find((record) => record.slide === demo.slide && record.kind === 'textbox' && record.name === element.name);
    if (!live?.id) throw new Error(`Missing live text ${element.name} on slide ${demo.slide}`);
    const target = presentation.resolve(live.id);
    target.text.replace(live.text, value);
  }

  const imageElement = byId.get(demo.imageId);
  if (!imageElement?.name) throw new Error(`Missing image ${demo.imageId} on slide ${demo.slide}`);
  const liveImage = liveRecords.find((record) => record.slide === demo.slide && record.kind === 'image' && record.name === imageElement.name);
  if (!liveImage?.id) throw new Error(`Missing live image ${imageElement.name} on slide ${demo.slide}`);
  const image = presentation.resolve(liveImage.id);
  const oldFrame = image.frame;
  const oldGeometry = image.geometry;
  const oldBorderRadius = image.borderRadius;
  const gifPath = path.join(root, 'media', `${demo.media}.gif`);
  image.replace({ blob: await FileBlob.load(gifPath), contentType: 'image/gif', alt: `${demo.source} animated walkthrough`, fit: 'contain' });
  image.frame = oldFrame;
  image.geometry = oldGeometry;
  image.borderRadius = oldBorderRadius;

  const mp4Source = path.join(root, 'media', `${demo.media}.mp4`);
  const mp4Target = path.join(videoFolder, `${demo.media}.mp4`);
  fs.copyFileSync(mp4Source, mp4Target);

  const slide = presentation.slides.getItem(demo.slide - 1);
  slide.speakerNotes.textFrame.setText([
    `Demo cue: ${demo.source}.`,
    'The 1280×720 MP4 is embedded in the slide. Select the video frame to play it in Slide Show mode.',
    '',
    '[Sources]',
    '- http://localhost:5173/wireframe (Atlas wireframe, captured 2026-08-10)',
    `- ${mp4Target}`,
    '[/Sources]',
  ].join('\n'));
}

const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(output);
console.log(output);
