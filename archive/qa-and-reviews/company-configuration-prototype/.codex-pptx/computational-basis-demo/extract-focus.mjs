import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const annexPath = 'C:/Users/josrp/Downloads/Atlas/02Annex B_ Employee Masterfile Payroll Data Tables from Dorado.xlsx';
const planPath = 'C:/Users/josrp/Downloads/Phase 2 - Payroll - Project Plan.xlsx';
const auditPath = 'C:/Users/josrp/Downloads/Atlas/Phase 2 BRD Audit Summary.xlsx';

const annex = await SpreadsheetFile.importXlsx(await FileBlob.load(annexPath));
const plan = await SpreadsheetFile.importXlsx(await FileBlob.load(planPath));
const audit = await SpreadsheetFile.importXlsx(await FileBlob.load(auditPath));

const blocks = [];
async function add(label, result) {
  blocks.push(`\n===== ${label} =====\n${result.ndjson}`);
}

await add('Annex sheet inventory', await annex.inspect({ kind: 'sheet', include: 'id,name', maxChars: 12000 }));
for (const [sheetId, range] of [
  ['Take Home Pay', 'A1:C183'],
  ['Retirement Pay', 'A1:I72'],
  ['Gross Up', 'A1:B18'],
  ['Final Pay', 'A1:J120'],
]) {
  try {
    await add(`Annex ${sheetId}`, await annex.inspect({ kind: 'region', sheetId, range, maxChars: 20000, tableMaxRows: 200, tableMaxCols: 12, tableMaxCellChars: 300 }));
  } catch (error) {
    blocks.push(`\n===== Annex ${sheetId} =====\nERROR: ${error?.message || error}`);
  }
}

for (const [label, workbook] of [['Project Plan', plan], ['BRD Audit', audit]]) {
  await add(`${label} focused requirement matches`, await workbook.inspect({
    kind: 'match',
    searchTerm: 'Computational Basis|Customized and editable formula|Take.Home Pay|Retirement Pay|Final Pay|Gross.Up|Company Rules|Rules Set.Up',
    options: { useRegex: true, maxResults: 240 },
    maxChars: 30000,
    tableMaxCellChars: 400,
  }));
}

await fs.writeFile('focus-extract.txt', blocks.join('\n'), 'utf8');
console.log('Wrote focus-extract.txt');
