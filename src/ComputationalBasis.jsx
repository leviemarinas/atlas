import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CaretDown,
  Check,
  ClockCounterClockwise,
  DownloadSimple,
  Eye,
  FileCsv,
  FilePdf,
  Flask,
  Function,
  Lock,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Prohibit,
  Table,
  Trash,
  UploadSimple,
  Warning,
  X,
} from '@phosphor-icons/react';
import { downloadFile } from './fileDownload';
import {
  categoryCycle,
  categoryPrefixes,
  computationDependencies,
  coreComputations,
  evaluateExpression,
  fieldMap,
  fieldOrigin,
  fields,
  nextComputationCode,
  prefixForCategory,
  referenceProblems,
  resolvedFields,
  seedComputations,
  usedComputations,
  usedFields,
} from './computationCatalog';
import {
  appendVersion,
  computationGuards,
  diffComputation,
  governanceStamps,
  historyEntry,
  newCompanyComputation,
  readAppliedStandards,
  readAssignments,
  readCompanyComputations,
  readCompanyRuns,
  readHistory,
  readReferences,
  referenceVersionHistory,
  setApplicability,
  usageIndexFromRuns,
  usageOf,
  versionIndex,
  withReferenceVersion,
  writeAssignments,
  writeCompanyComputations,
  writeHistory,
  writeReferences,
} from './computationGovernance';
import { seedReferences } from './referenceSources';
import { PolicyComputations, policyEngines } from './PolicyComputations';
import { PAYROLL_REFERENCE_CODES, synchronizePayrollReference } from './payrollIntegration';
import { referenceRows } from './ReferenceTables';
import { useRole } from './RoleContext';
import { plural } from './textFormat';

/**
 * The library's data and evaluator live in `computationCatalog.js` so the
 * payroll engine can resolve and evaluate the very same formulas. They are
 * re-exported here because this module is the library's screen and the rest of
 * the prototype has always imported them from it.
 */
export { categoryCycle, coreComputations, evaluateExpression, fields, seedComputations, usedComputations, usedFields };

/**
 * The controlled category list, read from the Generic Reference Table so a new
 * category is governed there rather than added to a hard-coded array. The
 * catalogue in `computationCatalog.js` is the seed and the fallback for a
 * preview whose reference tables have not been loaded yet.
 */
export function computationCategoryCatalogue() {
  const rows = referenceRows('computation-category');
  const controlled = rows.map(row => [row.name, row.code]).filter(([name, code]) => name && code);
  return controlled.length ? controlled : categoryPrefixes;
}




const initialAssignments = [
  { id: 1, type: 'Government deduction', table: 'SSS Contribution Table 2026', computationCode: 'GOV-001', status: 'Active' },
  { id: 2, type: 'Government deduction', table: 'PhilHealth Contribution Table 2026', computationCode: 'GOV-002', status: 'Active' },
  { id: 3, type: 'Government deduction', table: 'HDMF Contribution Table 2026', computationCode: 'GOV-003', status: 'Active' },
  { id: 4, type: 'Tax computation', table: 'BIR Withholding Tax Table 2026', computationCode: 'TAX-002', status: 'Active' },
  { id: 5, type: 'Take-home protection', table: 'Deduction and Loan Hierarchy', computationCode: 'THP-001', status: 'Active' },
  { id: 6, type: 'Retirement benefit', table: 'Employee Groups', computationCode: 'RET-002', status: 'Active' },
];

const initialHistory = [
  { id: 1, item: 'BIR Withholding Tax Table 2026', type: 'Reference table', action: 'Version uploaded', version: '2026.1', user: 'P&A Admin', date: 'Aug 8, 2026 · 3:42 PM' },
  { id: 2, item: 'Minimum Take Home Pay', type: 'Computation', action: 'Formula updated', version: '1.1', user: 'Client Admin', date: 'Aug 8, 2026 · 2:17 PM' },
  { id: 3, item: 'SSS Employee Contribution', type: 'Computation', action: 'Test calculation passed', version: '1.0', user: 'P&A Admin', date: 'Aug 7, 2026 · 11:05 AM' },
  { id: 4, item: 'Locations', type: 'Reference table', action: 'Disabled for company', version: '1.0', user: 'Client Admin', date: 'Aug 6, 2026 · 4:20 PM' },
];

function readReferenceLibrary(companyId) {
  const seeds = seedReferences();
  const stored = readReferences(companyId, seeds);
  if (!Array.isArray(stored) || !stored.length) return seeds;
  const reconciled = seeds.map(seed => ({ ...seed, ...(stored.find(item => item.code === seed.code) || {}) }));
  const custom = stored.filter(item => !seeds.some(seed => seed.code === item.code));
  return [...reconciled, ...custom].map(reference => ({
    versions: [],
    ...reference,
    entries: synchronizePayrollReference(reference.code, reference.entries),
  }));
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { values.push(value.trim()); value = ''; }
    else value += character;
  }
  values.push(value.trim());
  return values;
}

function exportCsv(filename, rows, columns) {
  const csv = [columns.map(([, label]) => csvCell(label)).join(','), ...rows.map(row => columns.map(([key]) => csvCell(row[key])).join(','))].join('\n');
  downloadFile(filename, csv, 'text/csv');
}

function printReport(title, rows, columns) {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) return false;
  const body = rows.map(row => `<tr>${columns.map(([key]) => `<td>${String(row[key] ?? '')}</td>`).join('')}</tr>`).join('');
  popup.document.write(`<html><head><title>${title}</title><style>body{font-family:Arial;padding:24px;color:#332d38}h1{color:#54248f}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#f3edf9}</style></head><body><h1>${title}</h1><p>ABC Company Ltd · Generated ${new Date().toLocaleString()}</p><table><thead><tr>${columns.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
  popup.document.close();
  return true;
}


function Modal({ title, onClose, children, className = '' }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
      {children}
    </section>
  </div>;
}

function ReportMenu({ onCsv, onPdf }) {
  const [open, setOpen] = useState(false);
  return <div className="menu-anchor">
    <button className="button secondary" onClick={() => setOpen(value => !value)}><DownloadSimple /> Download report <CaretDown /></button>
    {open && <div className="export-menu">
      <button onClick={() => { onCsv(); setOpen(false); }}><FileCsv /> Excel / CSV</button>
      <button onClick={() => { onPdf(); setOpen(false); }}><FilePdf /> PDF / Print</button>
    </div>}
  </div>;
}

function SummaryCards({ computations, references, assignments }) {
  const active = computations.filter(item => item.status === 'Active').length;
  return <section className="basis-summary" aria-label="Computational Basis summary">
    <div><Function weight="duotone" /><span><strong>{computations.length}</strong><small>governed computations</small></span></div>
    <div><Table weight="duotone" /><span><strong>{references.length}</strong><small>formula reference sources</small></span></div>
    <div><Check weight="bold" /><span><strong>{active}</strong><small>active computations</small></span></div>
    <div><ClockCounterClockwise weight="duotone" /><span><strong>{assignments.length}</strong><small>pipeline assignments</small></span></div>
  </section>;
}

/**
 * One row of the Map Fields table.
 *
 * The meeting asked for more than "this token exists": who owns the value at
 * run time, what type and unit it carries, when it is resolved, and what
 * payroll does when the owning module supplies nothing. All five come from the
 * field catalogue, so the table describes the real contract rather than a
 * label typed next to the token.
 */
function MapFieldRow({ code, kind, source, sample, problem = '', detail = '' }) {
  const origin = fieldOrigin(code) || {};
  return <tr className={problem ? 'mapping-problem' : ''}>
    <td><code>{`{{${code}}}`}</code></td>
    <td><span className={`mapping-kind ${kind === 'Computation' ? 'computation' : 'field'}`}>{kind === 'Computation' ? <><Function weight="duotone" /> Computation</> : 'Approved field'}</span></td>
    <td>{source}{detail && <small className="block-caption">{detail}</small>}</td>
    <td><span className="mapping-owner">{origin.owner || '—'}</span></td>
    <td>{origin.dataType || '—'}</td>
    <td>{origin.unit || '—'}</td>
    <td>{origin.timing || '—'}</td>
    <td><span className={`missing-behaviour ${/Required/.test(origin.missingBehaviour || '') ? 'blocking' : ''}`}>{origin.missingBehaviour || '—'}</span></td>
    <td>{sample}</td>
  </tr>;
}

function FormulaEditor({ record, library = [], categories = categoryPrefixes, guard = null, actor = 'Client Admin', onClose, onSave, onTestHistory }) {
  const isCreating = record.isNew === true;
  const [draft, setDraft] = useState({ ...record });
  const [tab, setTab] = useState('formula');
  const [fieldCode, setFieldCode] = useState(fields[0][0]);
  // A formula may build on an already published one. Only active computations
  // are offered, and never the record being edited.
  const referenceable = library.filter(item => item.status === 'Active' && item.code !== draft.code);
  const [referenceCode, setReferenceCode] = useState(referenceable[0]?.code || '');
  const [testValues, setTestValues] = useState(() => Object.fromEntries(fields.map(([code, , sample]) => [code, sample])));
  const [testResult, setTestResult] = useState(null);
  const [expected, setExpected] = useState('');
  const [error, setError] = useState('');
  const [changeNote, setChangeNote] = useState(isCreating ? 'Company computation created through the Computational Basis workspace.' : 'Updated through the Computational Basis workspace.');
  /**
   * Editing the expression retires the test evidence recorded against the old
   * one. A version must not publish carrying proof that a different formula
   * passed — the evidence is only evidence if it was produced by the
   * expression being saved.
   */
  const changeExpression = expression => setDraft(previous => ({
    ...previous,
    expression,
    lastTest: previous.lastTest && previous.lastTest.expression === expression ? previous.lastTest : null,
  }));
  const append = token => changeExpression(`${draft.expression}${draft.expression && !/[ (]$/.test(draft.expression) ? ' ' : ''}${token}`);

  /**
   * While the record is being created the code follows the category, because
   * the agreed convention derives it from the category and a sequence. Once it
   * is saved the code is locked: a payroll transaction may already print it.
   */
  const changeCategory = category => setDraft(previous => ({
    ...previous,
    category,
    code: isCreating ? nextComputationCode(category, library, categories) : previous.code,
  }));

  const runTest = () => {
    try {
      const value = evaluateExpression(draft.expression, testValues, { library });
      const inputs = Object.fromEntries(resolvedFields(draft.expression, library).map(code => [code, Number(testValues[code]) || 0]));
      const target = expected === '' ? null : Number(expected);
      const passed = target === null || Math.abs(target - value) < 0.005;
      const evidence = {
        inputs,
        expected: target,
        actual: value,
        result: passed ? 'Passed' : 'Failed',
        testedBy: actor,
        testedAt: new Date().toISOString(),
        expression: draft.expression,
      };
      setTestResult(evidence);
      setDraft(previous => ({ ...previous, lastTest: evidence }));
      setError(passed ? '' : `The formula returned ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}, not the expected ${target.toLocaleString(undefined, { maximumFractionDigits: 2 })}.`);
      if (passed) onTestHistory?.(draft, evidence);
    } catch (testError) {
      setTestResult(null);
      setError(testError.message);
    }
  };

  const submit = event => {
    event.preventDefault();
    if (guard && !guard.canEdit) { setError(guard.editReason); return; }
    const problems = referenceProblems(draft.expression, library, draft.code);
    if (problems.length) { setError(problems.join(' ')); setTab('formula'); return; }
    try {
      evaluateExpression(draft.expression, testValues, { library });
      onSave({ ...draft, changeNote });
    } catch (saveError) { setError(saveError.message); setTab('formula'); }
  };

  // The banner result belongs to the tested expression, not to the draft.
  const staleResult = Boolean(testResult) && testResult.expression !== draft.expression;
  const mapped = usedFields(draft.expression);
  const dependencies = computationDependencies(draft.expression, library, draft.code);
  // A referenced computation brings its own inputs, so the test tab asks for the
  // fields the whole chain needs rather than a figure the user would otherwise
  // have to work out by hand.
  const testable = resolvedFields(draft.expression, library);
  const pendingChanges = isCreating ? [] : diffComputation(record, draft);

  return <Modal title={isCreating ? 'Create company computation' : `Edit computation · ${record.code}`} onClose={onClose} className="basis-editor-modal">
    <form onSubmit={submit}>
      <div className="basis-editor-tabs">
        <button type="button" className={tab === 'formula' ? 'active' : ''} onClick={() => setTab('formula')}>Formula setup</button>
        <button type="button" className={tab === 'test' ? 'active' : ''} onClick={() => setTab('test')}>Test calculation</button>
        <button type="button" className={tab === 'change' ? 'active' : ''} onClick={() => setTab('change')}>Change details</button>
      </div>
      <div className="basis-editor-body">
        {tab === 'formula' && <>
          <div className="basis-form-grid">
            <label>Computation code
              <input value={draft.code} disabled readOnly aria-describedby="computation-code-hint" />
              <small id="computation-code-hint" className="field-hint">{isCreating
                ? `Generated from the ${draft.category} category (${prefixForCategory(draft.category, categories)}) and locked once saved.`
                : 'Generated on creation and locked — payroll transactions print this code.'}</small>
            </label>
            <label>Computation name<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required /></label>
            <label>Category<select value={draft.category} onChange={event => changeCategory(event.target.value)}>{categories.map(([name]) => <option key={name}>{name}</option>)}</select>
              <small className="field-hint">Controlled by Settings › Reference Table › Computation Category.</small>
            </label>
            {isCreating
              ? <label>Status
                  <input value="Inactive" disabled readOnly />
                  <small className="field-hint">A new computation stays Inactive while it is built and reviewed. Activate it from the register when it is ready to compute.</small>
                </label>
              : <label>Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option>Active</option><option>Inactive</option></select></label>}
            <label className="wide"><span className="label-caption">Description <span className="optional-tag">Optional</span></span>
              <textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Recommended — explain what this formula includes and excludes." />
            </label>
          </div>
          <section className="formula-builder">
            <div className="formula-builder-heading"><div><h3>Expression builder</h3><p>Build a company calculation from approved payroll fields and operators. Atlas validates the expression before it can be saved.</p></div><span className="version-chip">{isCreating ? 'Company-defined' : `Version ${draft.version}`}</span></div>
            <textarea className="formula-expression" value={draft.expression} onChange={event => changeExpression(event.target.value)} aria-label="Formula expression" required />
            <div className="formula-insert-row">
              <select value={fieldCode} onChange={event => setFieldCode(event.target.value)}>{fields.map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select>
              <button type="button" className="button secondary" onClick={() => append(`{{${fieldCode}}}`)}><Plus /> Insert field</button>
              <div className="operator-palette" aria-label="Available operators">{['+', '−', '×', '÷', '(', ')', 'MIN(', 'MAX('].map(operator => <button type="button" key={operator} onClick={() => append(operator.replace('−', '-').replace('×', '*').replace('÷', '/'))}>{operator}</button>)}</div>
            </div>
            <div className="formula-insert-row formula-reference-row">
              <select value={referenceCode} onChange={event => setReferenceCode(event.target.value)} aria-label="Published computation" disabled={!referenceable.length}>{referenceable.map(item => <option value={item.code} key={item.code}>{item.code} · {item.name}</option>)}</select>
              <button type="button" className="button secondary" onClick={() => append(`{{${referenceCode}}}`)} disabled={!referenceCode}><Function /> Insert computation</button>
              <p className="formula-insert-hint">Build on a published formula instead of repeating its arithmetic. Its own inputs are collected for you.</p>
            </div>
            <div className="mapping-table-wrap">
              <table className="mapping-table map-field-table"><thead><tr><th>Mapped field</th><th>Kind</th><th>Atlas source</th><th>Owner / source module</th><th>Data type</th><th>Unit</th><th>Timing</th><th>If the value is missing</th><th>Sample value</th></tr></thead><tbody>
                {mapped.map(code => <MapFieldRow key={code} code={code} kind="Approved field" source={fieldMap[code]?.label || 'Unrecognized field'} sample={fieldMap[code]?.sample?.toLocaleString?.() ?? '—'} />)}
                {dependencies.map(dependency => <MapFieldRow
                  key={dependency.code}
                  code={dependency.code}
                  kind="Computation"
                  problem={dependency.missing || dependency.circular || dependency.inactive ? 'problem' : ''}
                  source={dependency.circular ? 'A formula cannot refer to itself' : dependency.missing ? 'Not a published computation' : `${dependency.name}${dependency.inactive ? ' · inactive' : ''}`}
                  detail={dependency.missing || dependency.circular ? '' : dependency.expression}
                  sample={dependency.missing || dependency.circular ? '—' : `Version ${dependency.version}`}
                />)}
                {!mapped.length && !dependencies.length && <tr className="mapping-empty"><td colSpan={9}>Insert an approved field or a published computation to begin.</td></tr>}
              </tbody></table>
            </div>
          </section>
        </>}
        {tab === 'test' && <div className="test-workspace">
          <div className="test-copy"><Flask weight="duotone" /><div><h3>Test calculation</h3><p>Run the draft formula with controlled values. The inputs, the expected amount and the result are stored with the version this save publishes, so the evidence stays with the record.</p></div></div>
          {Boolean(dependencies.length) && <p className="test-reference-note"><Function weight="duotone" /> This formula builds on {dependencies.map(item => item.code).join(', ')}. The inputs below cover the whole chain.</p>}
          <div className="test-input-grid">{testable.map(code => <label key={code}>{fieldMap[code]?.label || code}<input type="number" step="any" value={testValues[code] ?? 0} onChange={event => setTestValues({ ...testValues, [code]: event.target.value })} /></label>)}</div>
          <div className="test-expectation"><label><span className="label-caption">Expected result <span className="optional-tag">Optional</span></span><input type="number" step="any" value={expected} onChange={event => setExpected(event.target.value)} placeholder="e.g. 2000" /></label><small>Give an expected amount and the stored evidence records Passed or Failed against it rather than only the figure Atlas produced.</small></div>
          <div className="test-result-row">
            <button type="button" className="button primary" onClick={runTest}><Flask /> Run test</button>
            {testResult && !staleResult && <div className={`test-result ${testResult.result === 'Passed' ? 'passed' : 'failed'}`}>{testResult.result === 'Passed' ? <Check weight="bold" /> : <Warning weight="bold" />}<span><small>{testResult.result === 'Passed' ? 'Formula passed' : 'Formula did not match the expected amount'}</small><strong>₱ {testResult.actual.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span></div>}
          </div>
          {staleResult && <p className="test-evidence-empty">The expression changed after this test ran. Run it again so the version you publish carries evidence for the formula it actually contains.</p>}
          {testResult && !staleResult && <TestEvidence evidence={testResult} />}
        </div>}
        {tab === 'change' && <div className="change-workspace">
          <h3>Change details</h3><p>Saving creates a new controlled version and records the change — with its before and after values — in history.</p>
          <label>Effective date<input type="date" value={draft.effectiveDate} onChange={event => setDraft({ ...draft, effectiveDate: event.target.value })} required /></label>
          <label>Change note<textarea value={changeNote} onChange={event => setChangeNote(event.target.value)} required /></label>
          {Boolean(pendingChanges.length) && <div className="change-diff">
            <h4>What this save changes</h4>
            <table className="change-diff-table"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>
              {pendingChanges.map(change => <tr key={change.field}><td>{change.field}</td><td><code className="diff-before">{String(change.from) || '—'}</code></td><td><code className="diff-after">{String(change.to) || '—'}</code></td></tr>)}
            </tbody></table>
          </div>}
          {!isCreating && !pendingChanges.length && <p className="change-diff-empty">No tracked field has changed yet. Edit the formula, status, effective date, name, category or description to record a change.</p>}
          <div className="change-summary"><span>{isCreating ? 'Initial version' : 'Current version'} <strong>{isCreating ? '1.0' : draft.version}</strong></span><span>{isCreating ? 'Ownership' : 'Next version'} <strong>{isCreating ? 'Company' : (Number(draft.version) + 0.1).toFixed(1)}</strong></span><span>{isCreating ? 'Created by' : 'Changed by'} <strong>{actor}</strong></span><span>Test evidence <strong>{draft.lastTest ? `${draft.lastTest.result} · ₱${Number(draft.lastTest.actual).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'Not run'}</strong></span></div>
        </div>}
        {error && <div className="basis-error">{error}</div>}
      </div>
      <div className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{isCreating ? 'Validate and create' : 'Validate and save'}</button></div>
    </form>
  </Modal>;
}

/** The stored proof for one published version, rather than a figure recomputed on open. */
function TestEvidence({ evidence, compact = false }) {
  if (!evidence) return <p className="test-evidence-empty">No test evidence was recorded for this version.</p>;
  return <div className={`test-evidence ${compact ? 'compact' : ''}`}>
    <header><Flask weight="duotone" /><strong>Test evidence</strong><span className={`status-pill ${evidence.result === 'Passed' ? 'active' : 'inactive'}`}>{evidence.result}</span></header>
    <dl>
      {Object.entries(evidence.inputs || {}).map(([code, value]) => <div key={code}><dt>{fieldMap[code]?.label || code}</dt><dd>{Number(value).toLocaleString()}</dd></div>)}
      <div><dt>Expected result</dt><dd>{evidence.expected === null || evidence.expected === undefined ? 'Not stated' : `₱${Number(evidence.expected).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</dd></div>
      <div><dt>Actual result</dt><dd>₱{Number(evidence.actual).toLocaleString(undefined, { maximumFractionDigits: 2 })}</dd></div>
      <div><dt>Tested by</dt><dd>{evidence.testedBy}</dd></div>
      <div><dt>Tested at</dt><dd>{new Date(evidence.testedAt).toLocaleString()}</dd></div>
    </dl>
  </div>;
}

/**
 * The record view.
 *
 * Beyond the definition it answers the three governance questions the meeting
 * raised: which versions have been published and what test evidence each one
 * carries, which payroll transactions have already used the code, and what that
 * usage now forbids.
 */
function ComputationDrawer({ record, library = [], versions = [], usage = null, guard = null, onClose, onEdit }) {
  const mapped = usedFields(record.expression);
  const dependencies = computationDependencies(record.expression, library, record.code);
  return <div className="modal-backdrop view-drawer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="record-drawer basis-record-drawer" role="dialog" aria-modal="true" aria-label={record.name}>
      <header><div><p>{record.code} · Version {record.version}</p><h2>{record.name}</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>
      <div className="record-drawer-body">
        <section><div className="detail-grid">
          <div><strong>Category</strong><span>{record.category}</span></div>
          <div><strong>Source</strong><span className={`computation-source ${record.isBuiltIn !== false ? 'built-in' : 'admin-defined'}`}><Function weight="duotone" />{record.isBuiltIn !== false ? 'Atlas standard' : 'Company-defined'}</span></div>
          <div><strong>Status in this company</strong><span className={`status-pill ${record.status.toLowerCase()}`}>{record.status}</span></div>
          <div><strong>Effective date</strong><span>{record.effectiveDate}</span></div>
          <div><strong>Updated by</strong><span>{record.updatedBy}</span></div>
        </div></section>
        <section><h3>Description</h3><p className="drawer-paragraph">{record.description || 'No description was recorded. A description is optional but recommended for explaining inclusions and exclusions.'}</p></section>
        <section><h3>Formula expression</h3><div className="formula-preview">{record.expression}</div></section>
        <section><h3>Map fields</h3><div className="mapping-table-wrap">
          <table className="mapping-table map-field-table"><thead><tr><th>Mapped field</th><th>Kind</th><th>Atlas source</th><th>Owner / source module</th><th>Data type</th><th>Unit</th><th>Timing</th><th>If the value is missing</th><th>Sample value</th></tr></thead><tbody>
            {mapped.map(code => <MapFieldRow key={code} code={code} kind="Approved field" source={fieldMap[code]?.label || code} sample={fieldMap[code]?.sample?.toLocaleString?.() ?? '—'} />)}
            {dependencies.map(dependency => <MapFieldRow key={dependency.code} code={dependency.code} kind="Computation" source={dependency.name || 'Not a published computation'} detail={dependency.expression} sample={dependency.version ? `Version ${dependency.version}` : '—'} />)}
            {!mapped.length && !dependencies.length && <tr className="mapping-empty"><td colSpan={9}>This formula takes no mapped input.</td></tr>}
          </tbody></table>
        </div></section>
        <section><h3>Version history</h3>
          {versions.length ? <div className="version-history">{versions.map(version => <article key={`${version.code}-${version.version}`} className={version.version === record.version ? 'current' : ''}>
            <header><strong>Version {version.version}</strong><span>Effective {version.effectiveDate}</span>{version.version === record.version && <span className="version-current-chip">Current</span>}</header>
            <code className="version-expression">{version.expression}</code>
            <small>{version.note || 'No change note recorded.'} · {version.publishedBy} · {new Date(version.publishedAt).toLocaleString()}</small>
            {Boolean(version.changes?.length) && <ul className="version-change-list">{version.changes.map(change => <li key={change.field}><b>{change.field}</b> <code className="diff-before">{String(change.from) || '—'}</code> → <code className="diff-after">{String(change.to) || '—'}</code></li>)}</ul>}
            <TestEvidence evidence={version.test} compact />
          </article>)}</div>
            : <p className="drawer-paragraph">No version has been published from this workspace yet. The current definition is version {record.version}.</p>}
        </section>
        <section><h3>Payroll usage</h3>
          {usage?.transactions?.length ? <table className="config-table usage-table"><thead><tr><th>Transaction</th><th>Period</th><th>Status</th><th>Version used</th></tr></thead><tbody>
            {usage.transactions.map(item => <tr key={item.runId}><td><strong>{item.transactionNumber}</strong></td><td>{item.period || item.payoutDate || '—'}</td><td><span className={`status-pill ${item.posted ? 'active' : 'inactive'}`}>{item.status}</span></td><td>{item.version ? `v${item.version}` : 'Not recorded'}</td></tr>)}
          </tbody></table>
            : <p className="drawer-paragraph">No payroll transaction has used this computation yet, so it may still be edited, deactivated or deleted.</p>}
        </section>
        {Boolean(guard && (!guard.canEdit || !guard.canDelete || !guard.canDeactivate)) && <section><h3>What is protected</h3><ul className="guard-list">
          {!guard.canEdit && <li><Prohibit weight="duotone" /> {guard.editReason}</li>}
          {!guard.canDelete && <li><Prohibit weight="duotone" /> {guard.deleteReason}</li>}
          {!guard.canDeactivate && <li><Prohibit weight="duotone" /> {guard.deactivateReason}</li>}
        </ul></section>}
      </div>
      <footer><button className="button secondary" onClick={onClose}>Close</button>{guard?.canEdit
        ? <button className="button primary" onClick={() => onEdit(record)}><PencilSimple /> Edit computation</button>
        : <span className="drawer-lock-note"><Lock weight="duotone" /> {guard?.editReason || 'This computation is read-only here.'}</span>}</footer>
    </aside>
  </div>;
}

/**
 * The computations the payroll pipeline runs that own no configuration record.
 *
 * Earnings, deductions, bonuses, allowances and loans each have a Services
 * Information configuration, and that configuration is where their formula and
 * their applicability are now set. These four do not: statutory contributions
 * and withholding tax are computed from the effective statutory tables,
 * take-home protection comes from the Take-Home Pay policy, and the retirement
 * benefit from the Retirement engine. They still need somewhere to say which
 * published formula applies — and this is it.
 */
const PIPELINE_ASSIGNMENT_TYPES = ['Government deduction', 'Tax computation', 'Take-home protection', 'Retirement benefit'];

const ASSIGNMENT_DEFAULTS = { type: 'Government deduction', computationCode: 'GOV-001', status: 'Active' };

function AssignmentModal({ record, computations, references, onClose, onSave }) {
  const enabledReferences = references.filter(item => item.enabled);
  const [draft, setDraft] = useState(record || { ...ASSIGNMENT_DEFAULTS, table: enabledReferences[0]?.name, effectiveDate: new Date().toISOString().slice(0, 10) });
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  return <Modal title={record ? 'Edit pipeline assignment' : 'Add pipeline assignment'} onClose={onClose} className="assignment-modal">
    <form onSubmit={event => { event.preventDefault(); onSave(draft); }}>
      <div className="modal-body basis-form-grid">
        <label>Assignment type<select value={draft.type} onChange={event => update('type', event.target.value)}>{PIPELINE_ASSIGNMENT_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
        <label>Reference table<select value={draft.table} onChange={event => update('table', event.target.value)}>{enabledReferences.map(item => <option key={item.id}>{item.name}</option>)}</select></label>
        <label className="wide">Basis of computation<select value={draft.computationCode} onChange={event => update('computationCode', event.target.value)}>{computations.filter(item => item.status === 'Active').map(item => <option value={item.code} key={item.code}>{item.code} · {item.name}</option>)}</select></label>
        {/* An assignment is effective-dated: payroll resolves the assignment in
            force on the payout date, so a change mid-year does not restate the
            cutoffs that ran before it. */}
        <label>Effective date<input type="date" value={draft.effectiveDate || ''} onChange={event => update('effectiveDate', event.target.value)} required /></label>
        <label>Status<select value={draft.status} onChange={event => update('status', event.target.value)}><option>Active</option><option>Inactive</option></select></label>
        <p className="field-hint wide">
          These computations apply to every employee the run includes — the transaction decides who is paid, and the
          statutory tables and policies decide the amounts. Employee group and frequency are set on the Services
          Information configuration for everything that has one.
        </p>
      </div>
      <div className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Save assignment</button></div>
    </form>
  </Modal>;
}

/** The published versions of one formula reference source, newest effective last. */
function ReferenceVersions({ reference, onClose }) {
  const history = referenceVersionHistory(reference);
  return <Modal title={`Version history · ${reference.name}`} onClose={onClose} className="reference-modal">
    <div className="reference-modal-body">
      <p className="drawer-paragraph">Each published version is kept in full. Payroll resolves the version whose effective date covers the payout date, so a transaction computed under {history[0]?.version} keeps showing {history[0]?.version} after a newer version is published.</p>
      <div className="version-history">{[...history].reverse().map(version => <article key={version.version} className={version.current ? 'current' : ''}>
        <header><strong>Version {version.version}</strong><span>Effective {version.effectiveDate}</span>{version.current && <span className="version-current-chip">Current</span>}</header>
        <small>{version.note || 'No note recorded.'}{version.publishedBy ? ` · ${version.publishedBy}` : ''}{version.publishedAt ? ` · ${new Date(version.publishedAt).toLocaleString()}` : ''}</small>
        <table className="config-table"><thead><tr><th>Key / Range</th><th>Value</th><th>Notes / source</th></tr></thead><tbody>
          {(version.entries || []).map(entry => <tr key={entry.id}><td>{entry.key}</td><td>{entry.value}</td><td>{entry.note}</td></tr>)}
        </tbody></table>
      </article>)}</div>
    </div>
    <div className="modal-actions sticky-actions"><button className="button secondary" onClick={onClose}>Close</button></div>
  </Modal>;
}

function ReferenceEditor({ table: reference, onClose, onSave, onExport }) {
  const [draft, setDraft] = useState({ ...reference, entries: reference.entries.map(item => ({ ...item })) });
  const [newEntry, setNewEntry] = useState({ key: '', value: '', note: '' });
  const payrollDerived = [PAYROLL_REFERENCE_CODES.deductions, PAYROLL_REFERENCE_CODES.loans].includes(reference.code);
  const hierarchy = reference.code === PAYROLL_REFERENCE_CODES.hierarchy;
  const hierarchyRanks = hierarchy ? draft.entries.filter(item => !/statutory/i.test(item.key)).map(item => Number(item.value)) : [];
  const hierarchyError = hierarchy && (hierarchyRanks.some(rank => !Number.isInteger(rank) || rank < 1) || new Set(hierarchyRanks).size !== hierarchyRanks.length);
  const updateEntry = (id, key, value) => setDraft(previous => ({ ...previous, entries: previous.entries.map(item => item.id === id ? { ...item, [key]: value } : item) }));
  const removeEntry = id => setDraft(previous => ({ ...previous, entries: previous.entries.filter(item => item.id !== id) }));
  const addEntry = () => {
    if (!newEntry.key.trim() || !newEntry.value.trim()) return;
    setDraft(previous => ({ ...previous, entries: [...previous.entries, { ...newEntry, id: Math.max(0, ...previous.entries.map(item => item.id)) + 1 }] }));
    setNewEntry({ key: '', value: '', note: '' });
  };
  return <Modal title={`Manage reference table · ${reference.name}`} onClose={onClose} className="reference-modal">
    <div className="reference-modal-body">
      <div className="reference-meta">
        <span><small>Code</small><strong>{draft.code}</strong></span>
        <span><small>Current version</small><strong>{reference.version}</strong></span>
        <span><small>Publishing as</small><strong>{(Number.parseFloat(reference.version) + 0.1).toFixed(1)}</strong></span>
        {/* The new version needs its own effective date: payroll resolves a
            reference source by the date in force on its payout date, so a
            version that inherits the old date could never be told apart. */}
        <label className="reference-effective"><small>Effective from</small><input type="date" value={draft.effectiveDate} onChange={event => setDraft({ ...draft, effectiveDate: event.target.value })} /></label>
        <button className={`switch ${draft.enabled ? 'on' : ''}`} onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}><span /></button>
      </div>
      <p className="reference-version-note">Saving publishes version {(Number.parseFloat(reference.version) + 0.1).toFixed(1)}. Version {reference.version} is kept in full and stays available to the payrolls that used it.</p>
      {(payrollDerived || hierarchy) && <div className="linked-reference-note"><Lock weight="duotone" /><span>{hierarchy ? 'Item codes and classifications come from the active Deduction and Loan modules. Only the adjustment rank is maintained here.' : 'This source is generated from active module definitions. Edit the originating Deduction or Loan module instead of duplicating values here.'}</span></div>}
      {hierarchyError && <div className="warning-copy">Each adjustable item needs a unique whole-number rank of 1 or greater.</div>}
      <div className="reference-entry-table"><table><thead><tr><th>Key / Range</th><th>{hierarchy ? 'Adjustment rank' : 'Value'}</th><th>Notes / source</th><th>Action</th></tr></thead><tbody>
        {draft.entries.map(item => <tr key={item.id}><td><input value={item.key} readOnly={payrollDerived || hierarchy} onChange={event => updateEntry(item.id, 'key', event.target.value)} /></td><td><input value={item.value} readOnly={payrollDerived || (hierarchy && /statutory/i.test(item.key))} onChange={event => updateEntry(item.id, 'value', event.target.value)} /></td><td><input value={item.note} readOnly={payrollDerived || hierarchy} onChange={event => updateEntry(item.id, 'note', event.target.value)} /></td><td>{payrollDerived || hierarchy ? <Lock /> : <button className="text-danger" onClick={() => removeEntry(item.id)}>Remove</button>}</td></tr>)}
        {!payrollDerived && !hierarchy && <tr className="new-reference-row"><td><input value={newEntry.key} onChange={event => setNewEntry({ ...newEntry, key: event.target.value })} placeholder="New key or range" /></td><td><input value={newEntry.value} onChange={event => setNewEntry({ ...newEntry, value: event.target.value })} placeholder="Value" /></td><td><input value={newEntry.note} onChange={event => setNewEntry({ ...newEntry, note: event.target.value })} placeholder="Optional note" /></td><td><button className="button secondary small" onClick={addEntry}><Plus /> Add</button></td></tr>}
      </tbody></table></div>
    </div>
    <div className="modal-actions sticky-actions"><button className="button secondary" onClick={() => onExport(draft)}><DownloadSimple /> Download CSV</button><span className="toolbar-spacer" /><button className="button secondary" onClick={onClose}>{payrollDerived ? 'Close' : 'Cancel'}</button>{!payrollDerived && <button className="button primary" disabled={hierarchyError} onClick={() => onSave(draft)}>Save table</button>}</div>
  </Modal>;
}

export function ComputationalBasis({ companyId, onBack, onOpenStatutory, onOpenService, notify, initialTab = 'computations' }) {
  const { isAdmin, isPaAdmin } = useRole();
  const actor = isPaAdmin ? 'P&A Admin' : 'Client Admin';

  // Everything below is scoped to one company. An Atlas standard is held once
  // centrally and reaches this screen through the company's applicability
  // record; only company-defined computations are stored here.
  const [companyComputations, setCompanyComputations] = useState(() => readCompanyComputations(companyId));
  const [applicabilityVersion, setApplicabilityVersion] = useState(0);
  const [assignments, setAssignments] = useState(() => readAssignments(companyId, initialAssignments));
  const [references, setReferences] = useState(() => readReferenceLibrary(companyId));
  const [history, setHistory] = useState(() => readHistory(companyId, initialHistory));
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [status, setStatus] = useState('All statuses');
  const [source, setSource] = useState('All sources');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [assignmentEditing, setAssignmentEditing] = useState(undefined);
  const [referenceEditing, setReferenceEditing] = useState(null);
  const [referenceHistory, setReferenceHistory] = useState(null);
  const computationUploadRef = useRef(null);
  const referenceUploadRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null);
  const pageSize = 10;

  useEffect(() => { writeCompanyComputations(companyId, companyComputations); }, [companyId, companyComputations]);
  useEffect(() => { writeAssignments(companyId, assignments); }, [companyId, assignments]);
  useEffect(() => { writeReferences(companyId, references); }, [companyId, references]);
  useEffect(() => { writeHistory(companyId, history); }, [companyId, history]);

  const categories = useMemo(() => computationCategoryCatalogue(), []);
  // `applicabilityVersion` is bumped whenever a standard is activated or
  // deactivated for this company, so the applied standards re-read that
  // decision. Company-defined records are merged from state rather than
  // re-read, because the effect that persists them runs after this render.
  const standards = useMemo(() => readAppliedStandards(companyId), [companyId, applicabilityVersion]);
  const computations = useMemo(() => [...companyComputations, ...standards], [companyComputations, standards]);
  const runs = useMemo(() => readCompanyRuns(companyId), [companyId, tab]);
  const usage = useMemo(() => usageIndexFromRuns(runs), [runs]);
  const versions = useMemo(() => versionIndex(companyId), [companyId, companyComputations, applicabilityVersion]);
  const guardFor = record => computationGuards(record, {
    companyId,
    isPaAdmin,
    assignments,
    usage: usageOf(record.code, usage),
    versions: versions[String(record.code).toUpperCase()] || [],
  });

  const addHistory = entry => setHistory(previous => [historyEntry({ user: actor, ...entry }), ...previous]);

  const filteredComputations = useMemo(() => computations.filter(item => {
    const matchQuery = `${item.code} ${item.name} ${item.description || ''}`.toLowerCase().includes(query.toLowerCase());
    const matchCategory = category === 'All categories' || item.category === category;
    const matchStatus = status === 'All statuses' || item.status === status;
    const matchSource = source === 'All sources'
      || (source === 'Atlas standard' ? item.isBuiltIn !== false : item.isBuiltIn === false);
    return matchQuery && matchCategory && matchStatus && matchSource;
  }), [computations, query, category, status, source]);
  const pages = Math.max(1, Math.ceil(filteredComputations.length / pageSize));
  const visibleComputations = filteredComputations.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [query, category, status, source, tab]);

  /* --------------------------------------------------------- bulk selection */

  const selectedRecords = computations.filter(item => selected.has(item.code));
  const allFilteredSelected = Boolean(filteredComputations.length) && filteredComputations.every(item => selected.has(item.code));
  const toggleSelected = code => setSelected(previous => {
    const next = new Set(previous);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });
  const toggleAllFiltered = () => setSelected(previous => {
    const next = new Set(previous);
    if (allFilteredSelected) filteredComputations.forEach(item => next.delete(item.code));
    else filteredComputations.forEach(item => next.add(item.code));
    return next;
  });

  /* ----------------------------------------------------------- status moves */

  /**
   * Activation and deactivation are the only company-level actions on an Atlas
   * standard, and deactivation is refused while any payroll transaction is
   * linked to the code. Activating is never blocked — it adds a computation to
   * the run, it does not change one that already ran.
   */
  const applyStatus = (record, nextStatus) => {
    const guard = guardFor(record);
    if (nextStatus === 'Inactive' && !guard.canDeactivate) return { ok: false, reason: guard.deactivateReason };
    // A standard retired centrally cannot be switched back on by one company —
    // the definition itself is inactive, and reviving it is a Settings decision.
    if (nextStatus === 'Active' && record.centralStatus === 'Inactive') {
      return { ok: false, reason: `${record.code} is Inactive in the central Atlas library. It has to be reactivated in Settings › Standard Computation Library before any company can use it.` };
    }
    if (record.isBuiltIn !== false) {
      setApplicability(record.code, companyId, { status: nextStatus }, actor);
      setApplicabilityVersion(value => value + 1);
    } else {
      setCompanyComputations(previous => previous.map(item => item.code === record.code
        ? { ...item, status: nextStatus, updatedBy: actor, updatedAt: governanceStamps.displayDate() }
        : item));
    }
    addHistory({
      item: record.name,
      code: record.code,
      type: 'Computation',
      action: `${record.code} ${nextStatus === 'Active' ? 'activated' : 'deactivated'} for this company`,
      version: record.version,
      changes: [{ field: 'Status', from: record.status, to: nextStatus }],
    });
    return { ok: true };
  };

  const toggleStatus = record => {
    const nextStatus = record.status === 'Active' ? 'Inactive' : 'Active';
    const outcome = applyStatus(record, nextStatus);
    if (!outcome.ok) { notify({ type: 'error', message: outcome.reason }); return; }
    notify({ type: 'success', message: `${record.code} is now ${nextStatus} for this company.` });
  };

  const bulkStatus = nextStatus => {
    const applied = [];
    const blocked = [];
    selectedRecords.forEach(record => {
      if (record.status === nextStatus) return;
      const outcome = applyStatus(record, nextStatus);
      if (outcome.ok) applied.push(record.code); else blocked.push(record.code);
    });
    setSelected(new Set());
    if (!applied.length && !blocked.length) { notify({ type: 'error', message: `Every selected computation is already ${nextStatus}.` }); return; }
    notify({
      type: applied.length ? 'success' : 'error',
      message: `${applied.length} ${plural(applied.length, 'computation')} set to ${nextStatus}.${blocked.length ? ` ${blocked.length} left unchanged — linked to a payroll transaction: ${blocked.join(', ')}.` : ''}`,
    });
  };

  /* --------------------------------------------------------- create and save */

  const saveComputation = draft => {
    const normalizedCode = String(draft.code).trim().toUpperCase();

    if (draft.isNew) {
      if (computations.some(item => item.code === normalizedCode)) {
        notify({ type: 'error', message: `${normalizedCode} already exists. Change the category or retry so a free code is generated.` });
        return;
      }
      const saved = {
        ...draft,
        id: Math.max(0, ...companyComputations.map(item => Number(item.id) || 0)) + 1,
        code: normalizedCode,
        isBuiltIn: false,
        // A new computation is published as version 1.0 and stays Inactive
        // until somebody activates it deliberately.
        version: '1.0',
        status: 'Inactive',
        updatedBy: actor,
        updatedAt: governanceStamps.displayDate(),
      };
      delete saved.isNew;
      delete saved.changeNote;
      setCompanyComputations(previous => [saved, ...previous]);
      appendVersion(companyId, saved, { test: saved.lastTest, note: draft.changeNote, actor });
      addHistory({ item: saved.name, code: saved.code, type: 'Computation', action: draft.changeNote || 'Company computation created', version: '1.0' });
      setEditing(null);
      notify({ type: 'success', message: `${saved.code} was validated and created as an Inactive version 1.0. Activate it when it is ready to compute.` });
      return;
    }

    const guard = guardFor(draft);
    if (!guard.canEdit) { notify({ type: 'error', message: guard.editReason }); return; }
    const previousRecord = computations.find(item => item.code === normalizedCode) || draft;
    const changes = diffComputation(previousRecord, draft);
    const version = (Number(draft.version) + 0.1).toFixed(1);
    const saved = { ...draft, version, updatedBy: actor, updatedAt: governanceStamps.displayDate() };
    delete saved.changeNote;
    setCompanyComputations(previous => previous.map(item => item.code === saved.code ? saved : item));
    appendVersion(companyId, saved, { test: saved.lastTest, changes, note: draft.changeNote, actor });
    addHistory({ item: saved.name, code: saved.code, type: 'Computation', action: draft.changeNote || 'Formula updated', version, changes });
    setEditing(null);
    notify({ type: 'success', message: `${saved.code} was validated and saved as version ${version}. Version ${draft.version} stays available to the payrolls that used it.` });
  };

  const defaultCategory = categories.find(([name]) => name === 'Earnings')?.[0] || categories[0]?.[0] || 'Earnings';
  const createComputation = () => setEditing(newCompanyComputation({
    category: defaultCategory,
    library: computations,
    catalogue: categories,
    actor,
    companyId,
  }));

  const deleteComputation = record => {
    const guard = guardFor(record);
    if (!guard.canDelete) { notify({ type: 'error', message: guard.deleteReason }); return; }
    setDeleting(record);
  };

  const confirmDeleteComputation = () => {
    if (!deleting) return;
    const record = deleting;
    setCompanyComputations(previous => previous.filter(item => item.code !== record.code));
    addHistory({ item: record.name, code: record.code, type: 'Computation', action: `${record.code} company computation deleted`, version: record.version });
    setDeleting(null);
    notify({ type: 'success', message: `${record.code} was removed from this company's computations.` });
  };

  const saveAssignment = draft => {
    if (draft.id) setAssignments(previous => previous.map(item => item.id === draft.id ? draft : item));
    else setAssignments(previous => [{ ...draft, id: Math.max(0, ...previous.map(item => item.id)) + 1 }, ...previous]);
    addHistory({ item: `${draft.type} · ${draft.computationCode}`, type: 'Assignment', action: `${draft.id ? 'Assignment updated' : 'Assignment created'} · effective ${draft.effectiveDate}`, version: '—' });
    setAssignmentEditing(undefined);
    notify({ type: 'success', message: `Computation assignment ${draft.id ? 'updated' : 'added'}, effective ${draft.effectiveDate}.` });
  };

  /* ------------------------------------------------------ reference sources */

  /**
   * Saving or uploading publishes a new version and keeps the previous one in
   * full, so payroll can still resolve the values that were effective when an
   * earlier cutoff ran.
   */
  const saveReference = draft => {
    const version = (Number.parseFloat(draft.version) + 0.1).toFixed(1);
    const current = references.find(item => item.id === draft.id) || draft;
    const saved = withReferenceVersion(current, { entries: draft.entries, effectiveDate: draft.effectiveDate, version, note: 'Entries edited in Computational Basis', actor });
    setReferences(previous => previous.map(item => item.id === saved.id ? { ...saved, enabled: draft.enabled } : item));
    addHistory({ item: saved.name, code: saved.code, type: 'Reference source', action: 'Entries edited', version, changes: [{ field: 'Version', from: current.version, to: version }] });
    setReferenceEditing(null);
    notify({ type: 'success', message: `${saved.name} published as version ${version}. Version ${current.version} is kept for payrolls that used it.` });
  };

  const updateComputationList = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('"#'));
      const headers = parseCsvLine(lines.shift() || '').map(value => value.trim().toLowerCase());
      const codeIndex = headers.indexOf('code');
      const expressionIndex = headers.indexOf('expression');
      const nameIndex = headers.indexOf('name');
      const categoryIndex = headers.indexOf('category');
      const statusIndex = headers.indexOf('status');
      const effectiveIndex = headers.indexOf('effective date');
      const categoryNames = categories.map(([name]) => name);
      if (codeIndex < 0 || expressionIndex < 0) { notify({ type: 'error', message: 'Use the Atlas template — Code and Expression columns are required. Download template to start from the right headers.' }); return; }

      const rows = lines.map(parseCsvLine);
      const known = new Set(computations.map(item => item.code));
      let updated = 0;
      let created = 0;
      let skipped = 0;
      let locked = 0;
      const createdRecords = [];
      const updates = new Map();

      rows.forEach(values => {
        const rowCode = String(values[codeIndex] || '').trim().toUpperCase();
        const expression = values[expressionIndex];
        const rowCategory = categoryIndex >= 0 && categoryNames.includes(values[categoryIndex]) ? values[categoryIndex] : '';
        const valid = () => {
          if (referenceProblems(expression, computations, rowCode).length) return false;
          try { evaluateExpression(expression, Object.fromEntries(fields.map(([code, , sample]) => [code, sample])), { library: computations }); return true; } catch { return false; }
        };
        if (rowCode && known.has(rowCode)) {
          const target = computations.find(item => item.code === rowCode);
          // An Atlas standard is never rewritten from a company import.
          if (target.isBuiltIn !== false) { locked += 1; return; }
          if (!valid()) { skipped += 1; return; }
          updates.set(rowCode, values);
          updated += 1;
          return;
        }
        // Migration path: a row whose code is not in the library creates a new
        // company computation, provided the expression validates. A blank code
        // is generated from the category, following the same convention as the
        // Create button.
        if (!expression || !valid()) { skipped += 1; return; }
        const newCategory = rowCategory || 'Earnings';
        const library = [...computations, ...createdRecords];
        const code = rowCode || nextComputationCode(newCategory, library, categories);
        if (library.some(item => item.code === code)) { skipped += 1; return; }
        createdRecords.push({
          id: Math.max(0, ...companyComputations.map(item => Number(item.id) || 0)) + createdRecords.length + 1,
          code,
          name: (nameIndex >= 0 && values[nameIndex]) || `${newCategory} computation ${code}`,
          category: newCategory,
          expression,
          description: '',
          status: 'Inactive',
          isBuiltIn: false,
          version: '1.0',
          effectiveDate: effectiveIndex >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(values[effectiveIndex] || '') ? values[effectiveIndex] : governanceStamps.today(),
          updatedBy: actor,
          updatedAt: governanceStamps.displayDate(),
          lastTest: null,
        });
        created += 1;
      });

      setCompanyComputations(previous => {
        const edited = previous.map(item => {
          const values = updates.get(item.code);
          if (!values) return item;
          const optional = {};
          if (nameIndex >= 0 && values[nameIndex]) optional.name = values[nameIndex];
          if (categoryIndex >= 0 && categoryNames.includes(values[categoryIndex])) optional.category = values[categoryIndex];
          if (statusIndex >= 0 && ['Active', 'Inactive'].includes(values[statusIndex])) optional.status = values[statusIndex];
          if (effectiveIndex >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(values[effectiveIndex] || '')) optional.effectiveDate = values[effectiveIndex];
          const saved = { ...item, ...optional, expression: values[expressionIndex], version: (Number(item.version) + 0.1).toFixed(1), updatedBy: actor, updatedAt: governanceStamps.displayDate() };
          appendVersion(companyId, saved, { changes: diffComputation(item, saved), note: `Bulk update from ${file.name}`, actor });
          return saved;
        });
        createdRecords.forEach(record => appendVersion(companyId, record, { note: `Created by bulk import from ${file.name}`, actor }));
        return [...createdRecords, ...edited];
      });

      addHistory({ item: file.name, type: 'Computation', action: `Bulk import · ${created} created, ${updated} updated, ${skipped} invalid, ${locked} Atlas standards left unchanged`, version: 'Multiple' });
      const lockedNote = locked ? ` ${locked} Atlas ${plural(locked, 'standard')} left unchanged — edit those in Settings.` : '';
      notify({
        type: created || updated ? 'success' : 'error',
        message: created || updated
          ? `${created} created and ${updated} updated. ${skipped} invalid ${plural(skipped, 'row')} skipped. New records arrive Inactive.${lockedNote}`
          : `No computations were imported. ${skipped} invalid ${plural(skipped, 'row')}.${lockedNote}`,
      });
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  /**
   * The import template: the real headers, three worked example rows built from
   * this company's own library, and a commented key so nobody has to guess what
   * a column accepts.
   */
  const downloadComputationTemplate = () => {
    const samples = computations.filter(item => item.status === 'Active').slice(0, 3);
    const rows = samples.length ? samples : [{ code: 'ERN-051', name: 'Example computation', category: 'Earnings', expression: '{{allowance_units}} * {{allowance_unit_rate}}', status: 'Inactive', effectiveDate: governanceStamps.today() }];
    const csv = [
      ['Code', 'Name', 'Category', 'Expression', 'Status', 'Effective Date'].join(','),
      ...rows.map(item => [item.code, item.name, item.category, item.expression, item.status, item.effectiveDate].map(csvCell).join(',')),
      '',
      csvCell('# Expression is required on every row. Name, Category, Status and Effective Date are optional and are only applied when present.'),
      csvCell('# A Code that already exists updates that company computation. A Code that does not exist creates a new one; leave Code blank and Atlas generates it from the Category.'),
      csvCell('# Created records always arrive Inactive so they can be reviewed before they compute.'),
      csvCell('# Atlas standards are never changed by import — maintain those in Settings > Standard Computation Library.'),
      csvCell('# Expression uses {{approved_field}} tokens, or {{CODE-000}} to build on a published computation.'),
      csvCell(`# Category accepts: ${categories.map(([name]) => name).join(' | ')}`),
      csvCell('# Status accepts: Active | Inactive. Effective Date uses YYYY-MM-DD.'),
      csvCell(`# Approved fields: ${fields.map(([code]) => code).join(' | ')}`),
    ].join('\n');
    downloadFile('atlas-computation-import-template.csv', csv, 'text/csv');
    notify({ type: 'success', message: 'Computation import template downloaded.' });
  };

  const downloadReferenceTemplate = target => {
    const rows = (target?.entries || []).slice(0, 3);
    const csv = [
      ['Key', 'Value', 'Note'].join(','),
      ...(rows.length ? rows : [{ key: 'Example key', value: '0.00', note: 'Optional note' }]).map(item => [item.key, item.value, item.note].map(csvCell).join(',')),
      '',
      csvCell('# Key and Value are required on every row. Note is optional.'),
      csvCell('# Uploading publishes a new version. The previous version is kept in full and stays available to the payrolls that used it.'),
    ].join('\n');
    downloadFile(`atlas-${(target?.code || 'reference').toLowerCase()}-template.csv`, csv, 'text/csv');
    notify({ type: 'success', message: `${target?.name || 'Reference'} template downloaded.` });
  };

  const uploadReferenceVersion = event => {
    const file = event.target.files?.[0];
    if (!file || !uploadTarget) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { notify({ type: 'error', message: 'The reference file needs a header and at least one row.' }); return; }
      const entries = lines.slice(1).map((line, index) => {
        const [key = '', value = '', note = ''] = parseCsvLine(line);
        return { id: index + 1, key, value, note };
      }).filter(item => item.key && item.value);
      if (!entries.length) { notify({ type: 'error', message: 'No valid Key and Value rows were found.' }); return; }
      const version = (Number.parseFloat(uploadTarget.version) + 0.1).toFixed(1);
      const saved = withReferenceVersion(uploadTarget, { entries, effectiveDate: governanceStamps.today(), version, note: `Uploaded from ${file.name}`, actor });
      setReferences(previous => previous.map(item => item.id === uploadTarget.id ? saved : item));
      addHistory({ item: uploadTarget.name, code: uploadTarget.code, type: 'Reference source', action: `Version uploaded from ${file.name}`, version, changes: [{ field: 'Version', from: uploadTarget.version, to: version }, { field: 'Rows', from: (uploadTarget.entries || []).length, to: entries.length }] });
      setUploadTarget(null);
      notify({ type: 'success', message: `${uploadTarget.name} version ${version} uploaded with ${entries.length} ${plural(entries.length, 'row')}. Version ${uploadTarget.version} is preserved.` });
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const toggleReference = reference => {
    setReferences(previous => previous.map(item => item.id === reference.id ? { ...item, enabled: !item.enabled } : item));
    addHistory({ item: reference.name, code: reference.code, type: 'Reference source', action: `${reference.enabled ? 'Disabled' : 'Enabled'} for company`, version: reference.version, changes: [{ field: 'Company status', from: reference.enabled ? 'Enabled' : 'Disabled', to: reference.enabled ? 'Disabled' : 'Enabled' }] });
    notify({ type: 'success', message: `${reference.name} ${reference.enabled ? 'disabled' : 'enabled'} for this company.` });
  };

  const computationColumns = [['code', 'Code'], ['name', 'Computation'], ['category', 'Category'], ['expression', 'Formula'], ['version', 'Version'], ['status', 'Status']];
  const assignmentColumns = [['type', 'Assignment Type'], ['table', 'Reference Table'], ['computationCode', 'Computation'], ['effectiveDate', 'Effective Date'], ['status', 'Status']];
  const referenceColumns = [['code', 'Code'], ['name', 'Reference Table'], ['category', 'Category'], ['version', 'Version'], ['effectiveDate', 'Effective Date']];
  const historyColumns = [['date', 'Date'], ['item', 'Item'], ['type', 'Type'], ['action', 'Action'], ['version', 'Version'], ['user', 'User'], ['detail', 'Before → after']];
  const historyRows = history.map(item => ({ ...item, detail: (item.changes || []).map(change => `${change.field}: ${change.from || '—'} → ${change.to || '—'}`).join(' · ') }));

  return <div className="page-content computational-page">
    <button className="inline-back" onClick={onBack}><ArrowLeft /> Services Information</button>
    <div className="page-heading basis-heading"><div><p className="breadcrumb">Company Info / Services Information / Payroll / Computational Basis</p><h1>Computational Basis</h1><p className="page-description">The computations this company runs payroll with: the Atlas standards applied to it, its own company-defined formulas, pipeline assignments, policy scenarios, and versioned reference sources.</p></div><span className="controlled-badge"><Check weight="bold" /> Company-scoped controlled library</span></div>
    <SummaryCards computations={computations} references={references} assignments={assignments} />
    <div className="basis-tabs" role="tablist">
      <button className={tab === 'computations' ? 'active' : ''} onClick={() => setTab('computations')}>Computations <span>{computations.length}</span></button>
      <button className={tab === 'assignments' ? 'active' : ''} onClick={() => setTab('assignments')}>Pipeline assignments <span>{assignments.length}</span></button>
      <button className={tab === 'policies' ? 'active' : ''} onClick={() => setTab('policies')}>Policy engines <span>{policyEngines.length}</span></button>
      <button className={tab === 'references' ? 'active' : ''} onClick={() => setTab('references')}>Reference sources <span>{references.length}</span></button>
      <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Change history</button>
    </div>

    {tab === 'computations' && <>
      <div className="config-toolbar basis-toolbar">
        <div className="search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search code, computation, or description..." /><MagnifyingGlass /></div>
        <select className="compact-select" value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{[...new Set(computations.map(item => item.category))].map(value => <option key={value}>{value}</option>)}</select>
        <select className="compact-select" value={status} onChange={event => setStatus(event.target.value)}><option>All statuses</option><option>Active</option><option>Inactive</option></select>
        <select className="compact-select" value={source} onChange={event => setSource(event.target.value)}><option>All sources</option><option>Atlas standard</option><option>Company-defined</option></select>
        <div className="toolbar-spacer" />
        <div className="basis-toolbar-actions"><button className="button primary" onClick={createComputation}><Plus /> Create computation</button>
          <button className="button secondary" onClick={downloadComputationTemplate}><FileCsv /> Download template</button>
          <button className="button secondary" onClick={() => computationUploadRef.current?.click()}><UploadSimple /> Import CSV</button>
          <input ref={computationUploadRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={updateComputationList} />
          <ReportMenu onCsv={() => { exportCsv('atlas-computational-basis.csv', filteredComputations, computationColumns); notify({ type: 'success', message: 'Computational Basis CSV report downloaded.' }); }} onPdf={() => { printReport('Atlas Computational Basis', filteredComputations, computationColumns); notify({ type: 'success', message: 'Computational Basis print report prepared.' }); }} /></div>
      </div>
      <div className="library-notice"><Lock weight="duotone" /><span><strong>Atlas standards are defined once, centrally.</strong> They are applied to this company from Settings › Standard Computation Library; here they can only be activated or deactivated, and only while no payroll transaction is linked to them. Company-defined computations are created, edited and deleted here until a posted transaction has used one.</span></div>

      {/* Bulk maintenance: filter the register, select what the filter found,
          then move the whole selection at once. Codes a payroll transaction is
          linked to are reported rather than silently skipped. */}
      {Boolean(selected.size) && <div className="bulk-action-bar">
        <span><strong>{selected.size}</strong> selected</span>
        <button className="button secondary small" onClick={() => bulkStatus('Active')}><Check /> Activate</button>
        <button className="button secondary small" onClick={() => bulkStatus('Inactive')}><Prohibit /> Deactivate</button>
        <button className="button secondary small" onClick={() => setSelected(new Set())}><X /> Clear selection</button>
      </div>}

      <div className="table-card config-table-card basis-table-card"><table className="config-table basis-table"><thead><tr>
        <th className="select-column"><input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} aria-label={`Select all ${filteredComputations.length} filtered computations`} /></th>
        <th>Code</th><th>Type</th><th>Computation</th><th>Category</th><th>Formula</th><th>Version</th><th>Status</th><th>Payroll usage</th><th>Action</th>
      </tr></thead><tbody>
        {visibleComputations.map(item => {
          const guard = guardFor(item);
          const used = guard.usage;
          return <tr key={item.code} className={selected.has(item.code) ? 'row-selected' : ''}>
            <td className="select-column"><input type="checkbox" checked={selected.has(item.code)} onChange={() => toggleSelected(item.code)} aria-label={`Select ${item.code}`} /></td>
            <td><strong>{item.code}</strong></td>
            <td><span className={`computation-source ${item.isBuiltIn !== false ? 'built-in' : 'admin-defined'}`} title={item.isBuiltIn !== false ? 'Atlas standard — defined centrally in Settings' : 'Company-defined computation'}><Function weight="duotone" />{item.isBuiltIn !== false ? 'Atlas standard' : 'Company-defined'}</span></td>
            <td><div className="table-title-cell"><strong>{item.name}</strong><small>Updated {item.updatedAt} by {item.updatedBy}</small></div></td>
            <td>{item.category}</td>
            <td><code className="table-formula">{item.expression}</code></td>
            <td>{item.version}</td>
            <td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></td>
            <td>{used.transactions.length
              ? <span className="usage-chip" title={used.transactions.map(row => `${row.transactionNumber} · ${row.status}${row.version ? ` · v${row.version}` : ''}`).join('\n')}>{used.transactions.length} {plural(used.transactions.length, 'transaction')}{used.posted.length ? ` · ${used.posted.length} posted` : ''}</span>
              : <span className="usage-chip none">Not used yet</span>}</td>
            <td><div className="row-actions always">
              <button onClick={() => setViewing(item)} aria-label={`View ${item.name}`}><Eye /></button>
              <button
                onClick={() => toggleStatus(item)}
                disabled={item.status === 'Active' ? !guard.canDeactivate : item.centralStatus === 'Inactive'}
                title={item.status === 'Active'
                  ? (guard.canDeactivate ? `Deactivate ${item.code} for this company` : guard.deactivateReason)
                  : (item.centralStatus === 'Inactive' ? `${item.code} is Inactive in the central Atlas library — reactivate it in Settings first.` : `Activate ${item.code} for this company`)}
                aria-label={`${item.status === 'Active' ? 'Deactivate' : 'Activate'} ${item.name}`}
              >{item.status === 'Active' ? <Prohibit /> : <Check />}</button>
              {guard.canEdit
                ? <button onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}><PencilSimple /></button>
                : <span className="row-lock" title={guard.editReason}><Lock weight="duotone" /></span>}
              {item.isBuiltIn === false && <button onClick={() => deleteComputation(item)} disabled={!guard.canDelete} title={guard.canDelete ? `Delete ${item.code}` : guard.deleteReason} aria-label={`Delete ${item.name}`}><Trash /></button>}
            </div></td>
          </tr>;
        })}
      </tbody></table></div>
      <div className="pagination"><span>Displaying <strong>{visibleComputations.length}</strong> of {filteredComputations.length} {plural(filteredComputations.length, 'computation')}</span><div><button disabled={page === 1} onClick={() => setPage(1)}>«</button><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>‹</button><strong>{page}</strong><span>of {pages}</span><button disabled={page === pages} onClick={() => setPage(value => value + 1)}>›</button><button disabled={page === pages} onClick={() => setPage(pages)}>»</button></div></div>
    </>}

    {tab === 'assignments' && <>
      <div className="config-toolbar basis-toolbar"><div className="workspace-copy"><h2>Pipeline computation assignments</h2><p>The formula each pipeline computation applies — statutory contributions, withholding tax, take-home protection and the retirement benefit. Everything with a Services Information configuration sets its formula and its applicability there instead.</p></div><div className="toolbar-spacer" /><button className="button primary" onClick={() => setAssignmentEditing(null)}><Plus /> Add assignment</button><ReportMenu onCsv={() => exportCsv('atlas-computation-assignments.csv', assignments, assignmentColumns)} onPdf={() => printReport('Atlas Computation Assignments', assignments, assignmentColumns)} /></div>
      <div className="table-card config-table-card"><table className="config-table"><thead><tr><th>Assignment type</th><th>Reference table</th><th>Basis of computation</th><th>Effective date</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {assignments.map(item => <tr key={item.id}><td>{item.type}</td><td>{item.table}</td><td><strong>{item.computationCode}</strong><small className="block-caption">{computations.find(record => record.code === item.computationCode)?.name}</small></td><td>{item.effectiveDate || '—'}</td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></td><td><div className="row-actions always"><button onClick={() => setAssignmentEditing(item)} aria-label="Edit assignment"><PencilSimple /></button></div></td></tr>)}
      </tbody></table></div>
    </>}

    {tab === 'policies' && <PolicyComputations companyId={companyId} notify={notify} addHistory={addHistory} references={references} onManageHierarchy={() => setTab('references')} onOpenService={onOpenService} />}

    {tab === 'references' && <>
      <div className="config-toolbar basis-toolbar"><div className="workspace-copy"><h2>Formula reference sources</h2><p>Maintain formula reference sources. Every published version is kept, so payroll resolves the values that were effective on its payout date. Statutory contribution versions are linked here but managed in Settings.</p></div><div className="toolbar-spacer" /><ReportMenu onCsv={() => exportCsv('atlas-reference-tables.csv', references.map(item => ({ ...item, enabled: item.enabled ? 'Enabled' : 'Disabled' })), [...referenceColumns, ['enabled', 'Company Status']])} onPdf={() => printReport('Atlas Reference Tables', references.map(item => ({ ...item, enabled: item.enabled ? 'Enabled' : 'Disabled' })), [...referenceColumns, ['enabled', 'Company Status']])} /></div>
      <input ref={referenceUploadRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={uploadReferenceVersion} />
      <div className="reference-grid">{references.map(item => {
        const published = referenceVersionHistory(item);
        return <article className="reference-card" key={item.id}>
          <header><span className="reference-icon"><Table weight="duotone" /></span><button className={`switch ${item.enabled ? 'on' : ''}`} onClick={() => toggleReference(item)} aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`}><span /></button></header>
          <div><small>{item.code} · {item.category}</small><h3>{item.name}</h3><p>{item.entries.length} configured {plural(item.entries.length, 'row')}</p></div>
          <dl><div><dt>Version</dt><dd>{item.version}</dd></div><div><dt>Effective</dt><dd>{item.effectiveDate}</dd></div><div><dt>Published versions</dt><dd>{published.length}</dd></div><div><dt>Company</dt><dd className={item.enabled ? 'enabled-copy' : 'disabled-copy'}>{item.enabled ? 'Enabled' : 'Disabled'}</dd></div></dl>
          <footer>{item.category === 'Linked Statutory' ? <><button onClick={onOpenStatutory}><Table /> Manage in Settings</button><button onClick={() => setReferenceHistory(item)}><ClockCounterClockwise /> Versions</button></> : <><button onClick={() => setReferenceEditing(item)}><PencilSimple /> Manage</button><button onClick={() => setReferenceHistory(item)}><ClockCounterClockwise /> Versions</button><button onClick={() => downloadReferenceTemplate(item)}><FileCsv /> Template</button><button onClick={() => { setUploadTarget(item); window.setTimeout(() => referenceUploadRef.current?.click(), 0); }}><UploadSimple /> Upload version</button></>}</footer>
        </article>;
      })}</div>
    </>}

    {tab === 'history' && <>
      <div className="config-toolbar basis-toolbar"><div className="workspace-copy"><h2>Change history</h2><p>Who changed what, when, and which version was affected — with the value before and after the change.</p></div><div className="toolbar-spacer" /><ReportMenu onCsv={() => exportCsv('atlas-computational-basis-history.csv', historyRows, historyColumns)} onPdf={() => printReport('Atlas Computational Basis Change History', historyRows, historyColumns)} /></div>
      <div className="history-list">{history.map(item => <article key={item.id}><span className="history-dot"><ClockCounterClockwise /></span><div>
        <header><strong>{item.code ? `${item.code} · ${item.item}` : item.item}</strong><span>{item.type}</span></header>
        <p>{item.action}</p>
        {Boolean(item.changes?.length) && <ul className="history-change-list">{item.changes.map(change => <li key={change.field}><b>{change.field}</b><code className="diff-before">{String(change.from) || '—'}</code><span aria-hidden="true">→</span><code className="diff-after">{String(change.to) || '—'}</code></li>)}</ul>}
        <small>{item.date} · {item.user} · Version {item.version}</small>
      </div></article>)}</div>
    </>}

    {editing && <FormulaEditor
      record={editing}
      library={computations}
      categories={categories}
      guard={editing.isNew ? null : guardFor(editing)}
      actor={actor}
      onClose={() => setEditing(null)}
      onSave={saveComputation}
      onTestHistory={(draft, evidence) => addHistory({ item: draft.name, code: draft.code, type: 'Computation', action: `Test calculation ${evidence.result.toLowerCase()} · ₱${Number(evidence.actual).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, version: draft.version })}
    />}
    {deleting && <Modal title="Delete company computation" onClose={() => setDeleting(null)} className="delete-computation-modal"><div className="modal-body"><p>Delete <strong>{deleting.code} · {deleting.name}</strong> from this company’s computation library?</p><small>No payroll transaction has used it, so nothing historical depends on it. Atlas standards are not affected.</small></div><div className="modal-actions"><button className="button secondary" onClick={() => setDeleting(null)}>Cancel</button><button className="button danger" onClick={confirmDeleteComputation}><Trash /> Delete computation</button></div></Modal>}
    {viewing && <ComputationDrawer
      record={viewing}
      library={computations}
      versions={versions[String(viewing.code).toUpperCase()] || []}
      usage={usageOf(viewing.code, usage)}
      guard={guardFor(viewing)}
      onClose={() => setViewing(null)}
      onEdit={record => { setViewing(null); setEditing(record); }}
    />}
    {assignmentEditing !== undefined && <AssignmentModal record={assignmentEditing} computations={computations} references={references} onClose={() => setAssignmentEditing(undefined)} onSave={saveAssignment} />}
    {referenceEditing && <ReferenceEditor table={referenceEditing} onClose={() => setReferenceEditing(null)} onSave={saveReference} onExport={table => exportCsv(`${table.code.toLowerCase()}-${table.version}.csv`, table.entries, [['key', 'Key'], ['value', 'Value'], ['note', 'Note']])} />}
    {referenceHistory && <ReferenceVersions reference={referenceHistory} onClose={() => setReferenceHistory(null)} />}
  </div>;
}
