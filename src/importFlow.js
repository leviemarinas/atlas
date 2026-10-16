/**
 * Shared pieces of the Atlas-style Upload flow (see ImportDialog.jsx): read an Excel
 * sheet into a clean table, and write the two Excel files a user gets back — the
 * template to fill in, and the file of errors when an upload is rejected.
 *
 * An upload is all or nothing: the caller validates every row and only saves when
 * every row passes. A rejected file comes back as the same rows with an Errors column.
 */

import { readFirstSheet } from './excelRead.js';
import { downloadFile } from './fileDownload.js';
import { makeXlsx } from './ReferenceTables.jsx';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const clean = value => String(value ?? '').trim();

const pad = number => String(number).padStart(2, '0');
/** An Excel date cell is stored as a day count from 30 Dec 1899. */
function excelSerialToDate(serial, format) {
  const date = new Date(Math.round((Number(serial) - 25569) * 86400000));
  const [year, month, day] = [date.getUTCFullYear(), pad(date.getUTCMonth() + 1), pad(date.getUTCDate())];
  return format === 'iso' ? `${year}-${month}-${day}` : `${month}/${day}/${year}`;
}

/**
 * Reads the first worksheet of an uploaded workbook.
 *
 * @param file         the uploaded File
 * @param headerNames  lower-case names that identify the header row (the first row within the
 *                     first ten that holds one of them; Atlas templates start lower down)
 * @param options      { columnsHint, dateFormat: 'us' | 'iso' } — cells under a header that
 *                     contains "date" are converted if Excel stored them as a date number
 * @returns { headers, rows } or { error } with a message the user can act on
 */
export async function readTable(file, headerNames, { columnsHint = '', dateFormat = 'us' } = {}) {
  let grid;
  try { grid = await readFirstSheet(file); } catch (problem) {
    return { error: problem.message === 'LEGACY_XLS'
      ? 'This is an older .xls file, which cannot be read here. Save it as .xlsx and upload it again.'
      : 'The file could not be read. Check that it is a valid Excel workbook.' };
  }
  const at = grid.findIndex((row, index) => index < 10 && row.some(cell => headerNames.includes(clean(cell).toLowerCase())));
  if (at < 0) return { error: `No column headers were found.${columnsHint ? ` ${columnsHint}` : ''}` };
  const headers = grid[at].map(clean);
  const dateColumns = headers.map(header => /date/i.test(header));
  const rows = grid.slice(at + 1)
    .filter(row => row.some(cell => clean(cell)))
    .map(row => headers.map((_, column) => {
      const value = clean(row[column]);
      return dateColumns[column] && /^\d{5}(\.\d+)?$/.test(value) ? excelSerialToDate(value, dateFormat) : value;
    }));
  if (!rows.length) return { error: 'The file has no rows to import.' };
  return { headers, rows };
}

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
/** The sheet as CSV text, for the validators that already parse CSV. */
export const toCsvText = (headers, rows) => [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');

/**
 * Turns validator messages into one message per data row. A message that starts "Row N" is
 * attached to the Nth line of the sheet counted from the header (header = 1); any other
 * message is a problem with the whole file and goes on the first row.
 */
export function messagesByRow(messages, rowCount, rowOffset = 2) {
  const perRow = Array.from({ length: rowCount }, () => []);
  messages.forEach(item => {
    const text = typeof item === 'string' ? item : (item.reason || item.message || String(item));
    const given = typeof item === 'object' ? item.row : undefined;
    const matched = given ?? Number(/^Row (\d+)/i.exec(text)?.[1]);
    const index = Number.isFinite(matched) && matched >= rowOffset ? matched - rowOffset : 0;
    perRow[Math.min(Math.max(index, 0), Math.max(rowCount - 1, 0))].push(text.replace(/^Row \d+:\s*/i, ''));
  });
  return perRow.map(list => list.join(' '));
}

/** Downloads the rejected file back with an Errors column, like Atlas's annotated file. */
export function downloadErrorWorkbook(fileName, sheetName, headers, rows, rowMessages) {
  const stem = String(fileName || 'upload').replace(/\.[^.]+$/, '');
  downloadFile(`${stem}-errors.xlsx`, makeXlsx(sheetName, [...headers, 'Errors'], rows.map((row, index) => [...row, rowMessages[index] || ''])), XLSX_MIME);
}

/**
 * Downloads an Excel template: the real header row and a sample row or two. Instruction lines go
 * above the header, as in Atlas's templates; the upload finds the header row wherever it is.
 */
export function downloadTemplate(fileName, sheetName, headers, sampleRows, notes = []) {
  const rows = notes.length ? [...notes.map(note => [note]), [], headers, ...sampleRows] : [headers, ...sampleRows];
  downloadFile(fileName, makeXlsx(sheetName, rows[0], rows.slice(1)), XLSX_MIME);
}
