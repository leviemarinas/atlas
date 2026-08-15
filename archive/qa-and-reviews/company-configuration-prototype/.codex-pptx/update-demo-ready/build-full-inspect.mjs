import fs from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve('template-inspect/layouts');
const out = path.resolve('template-inspect-full.ndjson');
const lines = [];
for (let slide = 1; slide <= 39; slide += 1) {
  const file = path.join(dir, `source-slide-${String(slide).padStart(2, '0')}.layout.json`);
  const layout = JSON.parse(await fs.readFile(file, 'utf8'));
  const title = layout.elements.find((e) => e.text)?.text ?? '';
  lines.push(JSON.stringify({ kind: 'slide', id: layout.slide.aid, slide, title, textShapes: layout.elements.filter((e) => e.text).length }));
  for (const e of layout.elements) {
    lines.push(JSON.stringify({
      kind: e.kind,
      id: e.aid,
      slide,
      name: e.name,
      text: e.text ?? '',
      bbox: e.bbox,
      placeholder: e.placeholder ?? null,
    }));
  }
}
await fs.writeFile(out, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${lines.length} records to ${out}`);
