/**
 * Upload validation, the same way on every upload (P&A review: validate
 * before import, all or nothing, with a downloadable error log).
 *
 * A file with any rejected row imports nothing; the error log names each
 * rejected row, the field, the value it held and the reason.
 */

import { downloadFile } from './fileDownload.js';

const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;

export function errorLogCsv(errors = []) {
  return [
    ['Row', 'Field', 'Rejected value', 'Reason'].map(cell).join(','),
    ...errors.map(error => [error.row ?? '—', error.field ?? '', error.value ?? error.rejectedValue ?? '', error.reason ?? error.message ?? String(error)].map(cell).join(',')),
  ].join('\n');
}

/** Downloads the error log for a rejected file and tells the user why nothing was imported. */
export function rejectUpload(fileName, errors, notify) {
  const list = errors.map(error => (typeof error === 'string' ? { reason: error } : error));
  const stem = String(fileName || 'upload').replace(/\.[^.]+$/, '');
  downloadFile(`${stem}-error-log.csv`, errorLogCsv(list), 'text/csv');
  notify?.({ type: 'error', message: `${fileName}: ${list.length} ${list.length === 1 ? 'problem' : 'problems'} found, so nothing was imported. The error log has been downloaded — ${list[0].reason || list[0].message}` });
  return false;
}
