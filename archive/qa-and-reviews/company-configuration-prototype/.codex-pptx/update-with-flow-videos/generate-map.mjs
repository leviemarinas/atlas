import fs from 'node:fs';

const insertAfter = new Map([
  [10, { sourceSlide: 7, role: 'company rules workflow demo', ids: ['2','3','10','5','6','7','9'] }],
  [11, { sourceSlide: 12, role: 'take-home pay setup demo', ids: ['2','3','14','5','6','7','8','9','10','11','13'] }],
  [22, { sourceSlide: 23, role: 'retirement pay setup demo', ids: ['2','3','14','5','6','7','8','9','10','11','13'] }],
  [29, { sourceSlide: 30, role: 'final pay setup demo', ids: ['2','3','14','5','6','7','8','9','10','11','13'] }],
  [36, { sourceSlide: 37, role: 'gross up setup demo', ids: ['2','3','16','5','6','7','8','9','10','11','12','13','15'] }],
]);

const outputSlides = [];
let out = 1;
for (let source = 1; source <= 55; source += 1) {
  outputSlides.push({
    outputSlide: out++, sourceSlide: source,
    narrativeRole: `preserve source slide ${source}`,
    reuseMode: 'duplicate-slide', editTargets: [],
  });
  const demo = insertAfter.get(source);
  if (demo) {
    const layout = JSON.parse(fs.readFileSync(`template-inspect/layouts/source-slide-${String(demo.sourceSlide).padStart(2,'0')}.layout.json`, 'utf8'));
    const aids = new Map(layout.elements.map((element) => [String(element.id), element.aid]));
    outputSlides.push({
      outputSlide: out++, sourceSlide: demo.sourceSlide,
      narrativeRole: demo.role,
      reuseMode: 'duplicate-slide',
      editTargets: demo.ids.map((elementId) => ({
        sourceElementId: aids.get(elementId),
        action: elementId === '10' || elementId === '14' || elementId === '16' ? 'replace' : 'rewrite',
        reason: 'Populate the inherited demo slide frame with section-specific walkthrough content.',
      })),
    });
  }
}

fs.writeFileSync('template-frame-map.json', JSON.stringify({outputSlides, omittedSourceSlides: []}, null, 2));
