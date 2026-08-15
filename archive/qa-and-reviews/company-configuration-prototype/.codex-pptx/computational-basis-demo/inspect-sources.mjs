import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const sources = [
  ['Payroll Project Plan', 'C:/Users/josrp/Downloads/Phase 2 - Payroll - Project Plan.xlsx'],
  ['Employee Payroll Data Tables', 'C:/Users/josrp/Downloads/Atlas/02Annex B_ Employee Masterfile Payroll Data Tables from Dorado.xlsx'],
  ['BRD Audit Summary', 'C:/Users/josrp/Downloads/Atlas/Phase 2 BRD Audit Summary.xlsx'],
  ['Core Reference Tables', 'C:/Users/josrp/Downloads/PHASE 2 - REFERENCE TABLE [CORE].xlsx'],
  ['Retirement Sample', 'C:/Users/josrp/Downloads/Atlas/Computations/01Sample Computations/05Sample Computation - Retirement.xlsx'],
  ['Gross Up Sample', 'C:/Users/josrp/Downloads/Atlas/Computations/01Sample Computations/04Sample Gross Up of Earnings.xlsx'],
  ['Final Tax Gross Up Sample', 'C:/Users/josrp/Downloads/Atlas/Computations/01Sample Computations/06Sample Computation and Gross Up_Final Tax.xlsx'],
];

const output = [];
for (const [label, file] of sources) {
  try {
    const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(file));
    const summary = await workbook.inspect({
      kind: 'workbook,sheet,table',
      maxChars: 10000,
      tableMaxRows: 10,
      tableMaxCols: 10,
      tableMaxCellChars: 120,
    });
    output.push(`\n===== ${label} =====\n${file}\n${summary.ndjson}`);
  } catch (error) {
    output.push(`\n===== ${label} =====\n${file}\nERROR: ${error?.stack || error}`);
  }
}

await fs.writeFile('source-inventory.txt', output.join('\n'), 'utf8');
console.log('Wrote source-inventory.txt');
