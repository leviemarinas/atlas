import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const [workbookPath, outPath] = process.argv.slice(2);
if (!workbookPath || !outPath) throw new Error('Usage: node dump-sheet.mjs <workbook.xlsx> <out.tsv>');

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const lines = [];
for (const sheet of workbook.worksheets.items) {
  lines.push(`===== SHEET: ${sheet.name} =====`);
  const used = sheet.getUsedRange();
  if (!used) continue;
  const values = used.values;
  values.forEach((row, i) => {
    const cells = row.map((c) => (c === null || c === undefined ? '' : String(c).replace(/\s+/g, ' ').trim()));
    if (cells.every((c) => c === '')) return;
    lines.push(`${i + 1}\t${cells.join('\t')}`);
  });
}
await fs.writeFile(outPath, lines.join('\n'), 'utf8');
console.log(`wrote ${lines.length} lines to ${outPath}`);
