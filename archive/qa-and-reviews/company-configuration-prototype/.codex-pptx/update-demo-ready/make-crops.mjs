import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const src = path.resolve('screens');
const out = path.resolve('crops');
await fs.mkdir(out, { recursive: true });

const jobs = [
  ['01-thp-top.png', 'thp-core.png', { left: 405, top: 423, width: 514, height: 289 }],
  ['09-thp-caps.png', 'thp-caps.png', { left: 405, top: 0, width: 514, height: 712 }],
  ['10-thp-deferral.png', 'thp-deferral.png', { left: 405, top: 145, width: 514, height: 567 }],
  ['11-thp-hierarchy.png', 'thp-hierarchy.png', { left: 420, top: 0, width: 485, height: 712 }],
  ['12-ret-formula.png', 'ret-formula.png', { left: 405, top: 138, width: 514, height: 574 }],
  ['13-ret-eligibility.png', 'ret-eligibility.png', { left: 405, top: 72, width: 514, height: 640 }],
  ['12-ret-formula.png', 'ret-scenario.png', { left: 932, top: 138, width: 319, height: 574 }],
  ['15-final-components.png', 'final-components.png', { left: 405, top: 185, width: 514, height: 527 }],
  ['16-final-rules-top.png', 'final-rules.png', { left: 405, top: 35, width: 514, height: 620 }],
  ['15-final-components.png', 'final-inputs.png', { left: 932, top: 185, width: 319, height: 527 }],
  ['18-final-breakdown.png', 'final-results.png', { left: 895, top: 0, width: 356, height: 712 }],
  ['08-gup-bottom.png', 'gup-config.png', { left: 405, top: 20, width: 514, height: 635 }],
  ['08-gup-bottom.png', 'gup-scenario.png', { left: 932, top: 20, width: 319, height: 515 }],
];

for (const [input, output, region] of jobs) {
  await sharp(path.join(src, input)).extract(region).png({ compressionLevel: 9 }).toFile(path.join(out, output));
}
console.log(`Created ${jobs.length} native-resolution crops in ${out}`);
