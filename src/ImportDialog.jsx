import { useEffect, useRef, useState } from 'react';
import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react';
import './importDialog.css';

/**
 * Upload / Import dialog, modelled on the Atlas Import dialog:
 * drag and drop or browse, Excel files only (.xls, .xlsx, .xlsm), 10 MB at most,
 * Upload picks the file, Import is enabled once the file has uploaded, and the
 * dialog keeps a history of earlier imports with an IMPORTED / FAILED badge.
 */

const EXTENSIONS = ['.xls', '.xlsx', '.xlsm'];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const HISTORY_LIMIT = 20;

export function validateUploadFile(file) {
  const name = String(file?.name || '').toLowerCase();
  if (!EXTENSIONS.some(extension => name.endsWith(extension))) return 'Invalid file extension.';
  if (file.size > MAX_UPLOAD_BYTES) return 'The file is too large and cannot be uploaded. Please reduce the size of the file and try again.';
  return '';
}

const storageKey = key => `atlas-mockup-import-history:${key}`;
function readHistory(key) {
  try { return JSON.parse(localStorage.getItem(storageKey(key)) || '[]'); } catch { return []; }
}
function writeHistory(key, rows) {
  try { localStorage.setItem(storageKey(key), JSON.stringify(rows)); } catch { /* history is a convenience only */ }
}

/**
 * @param historyKey  identifies the table, so each table keeps its own history
 * @param onImport    async (file) => ({ ok, message }); does the actual import
 * @param onClose     closes the dialog (also called once an import has finished)
 */
export function ImportDialog({ historyKey, onImport, onClose }) {
  const [file, setFile] = useState(null);
  const [stage, setStage] = useState('idle'); // idle | invalid | uploading | uploaded | importing
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const [history] = useState(() => readHistory(historyKey));
  const inputRef = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const choose = picked => {
    window.clearTimeout(timer.current);
    if (!picked) return;
    setFile(picked);
    const problem = validateUploadFile(picked);
    if (problem) { setStage('invalid'); setMessage(problem); return; }
    setStage('uploading');
    setMessage('Uploading...');
    timer.current = window.setTimeout(() => { setStage('uploaded'); setMessage('File uploaded successfully!'); }, 700);
  };

  const runImport = async () => {
    if (stage !== 'uploaded' || !file) return;
    setStage('importing');
    setMessage('Import in progress...');
    let result;
    try { result = await onImport(file); } catch { result = { ok: false, message: 'The import could not be completed.' }; }
    writeHistory(historyKey, [{ name: file.name, ok: !!result.ok, message: result.message, date: new Date().toISOString() }, ...readHistory(historyKey)].slice(0, HISTORY_LIMIT));
    onClose(); // like Atlas, the dialog closes when the import has finished
  };

  const tone = stage === 'invalid' ? 'error' : stage === 'uploaded' ? 'success' : 'working';
  const progress = stage === 'uploading' ? 50 : stage === 'importing' ? 75 : 100;

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && stage !== 'importing') onClose(); }}>
      <section className="modal import-dialog" role="dialog" aria-modal="true" aria-label="Upload">
        <header>
          <h2>Upload</h2>
          <button className="icon-button" onClick={onClose} disabled={stage === 'importing'} aria-label="Close"><X /></button>
        </header>
        <div className="modal-body">
          <div
            className={`import-dropzone${dragging ? ' dragging' : ''}`}
            onDragOver={event => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={event => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files?.[0]); }}
          >
            <p><b>Drag and Drop</b> files here or <button type="button" className="import-browse" onClick={() => inputRef.current?.click()}>browse</button> to upload.</p>
            <span>(accepts only .xls, .xlsx, .xlsm files, with a maximum file size of 10MB.)</span>
            <input ref={inputRef} className="sr-only" type="file" accept={EXTENSIONS.join(',')} onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }} />
          </div>

          {file && (
            <div className={`import-file ${tone}`} role="status">
              <strong>{file.name}</strong>
              <span className="import-file-message">
                {tone === 'success' && <CheckCircle weight="fill" />}
                {tone === 'error' && <WarningCircle weight="fill" />}
                {message}
              </span>
              {stage !== 'invalid' && <div className="import-progress" aria-hidden="true"><div style={{ width: `${progress}%` }} /></div>}
            </div>
          )}

          {history.length > 0 && (
            <div className="import-history">
              <h3>Import history</h3>
              <table>
                <thead><tr><th>File</th><th>Status</th><th>Message</th></tr></thead>
                <tbody>
                  {history.map((row, index) => (
                    <tr key={`${row.date}-${index}`}>
                      <td>{row.name}</td>
                      <td><span className={`import-badge ${row.ok ? 'imported' : 'failed'}`}>{row.ok ? 'IMPORTED' : 'FAILED'}</span></td>
                      <td>{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-actions import-actions">
          <button className="button secondary" onClick={onClose} disabled={stage === 'importing'}>Close</button>
          <button className="button secondary" onClick={() => inputRef.current?.click()} disabled={stage === 'importing' || stage === 'uploading'}>Upload</button>
          <button className="button primary" onClick={runImport} disabled={stage !== 'uploaded'}>Import</button>
        </div>
      </section>
    </div>
  );
}
