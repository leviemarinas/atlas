import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const workbookPath = process.argv[2];
const outputDir = process.argv[3];

if (!workbookPath || !outputDir) {
  throw new Error('Usage: node inspect-workbook.mjs <workbook.xlsx> <output-dir>');
}

await fs.mkdir(outputDir, { recursive: true });
const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: 'workbook,sheet,table',
  maxChars: 12000,
  tableMaxRows: 12,
  tableMaxCols: 12,
  tableMaxCellChars: 140,
});
console.log('OVERVIEW');
console.log(overview.ndjson);

const sheets = workbook.worksheets.items;
for (const sheet of sheets) {
  const used = sheet.getUsedRange();
  const address = used?.address || 'A1:Z80';
  const region = await workbook.inspect({
    kind: 'region,formula',
    sheetId: sheet.name,
    range: address,
    maxChars: 18000,
    tableMaxRows: 80,
    tableMaxCols: 24,
    tableMaxCellChars: 180,
    options: { maxResults: 240 },
  });
  console.log(`SHEET ${sheet.name} ${address}`);
  console.log(region.ndjson);

  if (/take\s*home|retirement/i.test(sheet.name)) {
    const preview = await workbook.render({
      sheetName: sheet.name,
      autoCrop: 'all',
      scale: 1,
      format: 'png',
    });
    const safeName = sheet.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    await fs.writeFile(path.join(outputDir, `${safeName}.png`), new Uint8Array(await preview.arrayBuffer()));
  }
}

const errors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 300 },
  summary: 'formula error scan',
  maxChars: 6000,
});
console.log('ERROR_SCAN');
console.log(errors.ndjson);
