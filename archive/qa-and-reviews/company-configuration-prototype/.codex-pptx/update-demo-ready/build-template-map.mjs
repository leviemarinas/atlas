import fs from 'node:fs/promises';

const outputSlides = [];
for (let i = 1; i <= 30; i += 1) {
  outputSlides.push({ outputSlide: i, sourceSlide: i, narrativeRole: 'preserve-only', reuseMode: 'duplicate-slide', editTargets: [] });
}

outputSlides.push({
  outputSlide: 31,
  sourceSlide: 31,
  narrativeRole: 'policy engine field guide divider',
  reuseMode: 'duplicate-slide',
  editTargets: [
    { action: 'rewrite', sourceElementId: 'sh/dgja98fe', reason: 'Change appendix kicker to field-guide section label.' },
    { action: 'rewrite', sourceElementId: 'sh/cfa903yt', reason: 'Introduce the policy-engine field guide.' },
    { action: 'rewrite', sourceElementId: 'sh/zilsbyx4', reason: 'Explain the screenshot annotation convention.' },
  ],
});

const fieldPages = [
  ['Take-Home Pay — scope & protection', 'THP core fields'],
  ['Take-Home Pay — caps', 'THP cap fields'],
  ['Take-Home Pay — deferral controls', 'THP deferral fields'],
  ['Take-Home Pay — hierarchy & balances', 'THP hierarchy fields'],
  ['Retirement Pay — plan & formula', 'Retirement formula fields'],
  ['Retirement Pay — eligibility & tax', 'Retirement eligibility fields'],
  ['Retirement Pay — scenario & result', 'Retirement simulator fields'],
  ['Final Pay — included components', 'Final Pay component fields'],
  ['Final Pay — company rules', 'Final Pay company-rule fields'],
  ['Final Pay — scenario inputs', 'Final Pay input fields'],
  ['Final Pay — result & trace', 'Final Pay result fields'],
  ['Gross Up — policy settings', 'Gross Up configuration fields'],
  ['Gross Up — scenario & result', 'Gross Up simulator fields'],
];

const inheritedIds = [
  'sh/1gbm9s3a', 'sh/0f2lgnmp', 'sh/q903ad4n',
  'sh/dcbm583y', 'sh/sb2lcnmd', 'sh/b6d4f2lc', 'sh/a543mx4r', 'sh/wvupgz6t', 'sh/xw3q94ne',
  'sh/atc7epon', 'sh/bulo7u58', 'im/fudovqlo',
];

for (const [index, [title, role]] of fieldPages.entries()) {
  const outputSlide = 32 + index;
  outputSlides.push({
    outputSlide,
    sourceSlide: 12,
    narrativeRole: role,
    reuseMode: 'duplicate-slide',
    editTargets: [
      ...inheritedIds.map((sourceElementId) => ({
        action: sourceElementId === 'im/fudovqlo' ? 'replace' : 'rewrite',
        sourceElementId,
        reason: `Adapt inherited Take-Home setup frame for ${title}.`,
      })),
      {
        action: 'add',
        newPrimitiveAllowed: true,
        mustNotOverlapInherited: true,
        zone: { left: 50, top: 130, width: 1180, height: 520 },
        reason: 'Add native numbered badges, connector arrows, and bounded explanatory callout boxes that point to fields in the replaced screenshot.',
      },
    ],
  });
}

for (let sourceSlide = 31; sourceSlide <= 39; sourceSlide += 1) {
  outputSlides.push({
    outputSlide: 45 + (sourceSlide - 31),
    sourceSlide,
    narrativeRole: 'preserve-only',
    reuseMode: 'duplicate-slide',
    editTargets: [],
  });
}

const map = { outputSlides, omittedSourceSlides: [] };
await fs.writeFile('template-frame-map.json', `${JSON.stringify(map, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outputSlides.length} output-slide mappings.`);
