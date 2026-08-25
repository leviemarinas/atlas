import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const [outputRoot, ...inputs] = process.argv.slice(2);
if (!outputRoot || inputs.length === 0) throw new Error('Usage: workbook-audit.mjs <output-dir> <xlsx>...');

const safeName = value => path.basename(value, path.extname(value)).replace(/[^a-z0-9_-]+/gi, '_');
const serializable = value => JSON.parse(JSON.stringify(value));
const tryRead = async (label, fn) => {
  try { return await fn(); }
  catch (error) { return { auditError: `${label}: ${error.message}` }; }
};

await fs.mkdir(outputRoot, { recursive: true });
for (const inputPath of inputs) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
  const bookName = safeName(inputPath);
  const bookDir = path.join(outputRoot, bookName);
  await fs.mkdir(bookDir, { recursive: true });

  const book = {
    source: inputPath,
    inspectedAt: new Date().toISOString(),
    workbookInspect: (await workbook.inspect({ kind: 'workbook,sheet,table,definedName', maxChars: 40000, tableMaxRows: 12, tableMaxCols: 20 })).ndjson,
    definedNames: (await tryRead('defined names', async () => (await workbook.inspect({ kind: 'definedName', maxChars: 20000 })).ndjson)),
    sheets: [],
  };

  for (const sheet of workbook.worksheets.items) {
    const used = await tryRead(`${sheet.name} used range`, async () => sheet.getUsedRange());
    const address = used?.address || used?.getAddress?.() || '';
    const sheetAudit = {
      name: sheet.name,
      id: sheet.id,
      visibility: sheet.visibility ?? 'unknown',
      usedRange: address,
      values: await tryRead(`${sheet.name} values`, async () => serializable(used.values)),
      formulas: await tryRead(`${sheet.name} formulas`, async () => serializable(used.formulas)),
      tables: await tryRead(`${sheet.name} tables`, async () => serializable(sheet.tables.items.map(table => ({ id: table.id, name: table.name, range: table.range?.address || '' })))),
      drawings: (await tryRead(`${sheet.name} drawings`, async () => (await workbook.inspect({ kind: 'drawing', sheetId: sheet.id, maxChars: 20000 })).ndjson)),
      formulaInspect: (await tryRead(`${sheet.name} formula inspect`, async () => (await workbook.inspect({ kind: 'formula', sheetId: sheet.id, range: address || undefined, maxChars: 40000, options: { maxResults: 2000 } })).ndjson)),
    };
    book.sheets.push(sheetAudit);

    const renderName = `${String(book.sheets.length).padStart(2, '0')}_${safeName(sheet.name)}.png`;
    const render = await tryRead(`${sheet.name} render`, async () => workbook.render({ sheetName: sheet.name, autoCrop: 'all', scale: 1, format: 'png' }));
    if (render?.arrayBuffer) await fs.writeFile(path.join(bookDir, renderName), new Uint8Array(await render.arrayBuffer()));
    else sheetAudit.renderError = render;
  }

  await fs.writeFile(path.join(bookDir, 'audit.json'), JSON.stringify(book, null, 2));
  console.log(JSON.stringify({ inputPath, bookDir, sheets: book.sheets.map(sheet => ({ name: sheet.name, usedRange: sheet.usedRange, visibility: sheet.visibility })) }));
}
