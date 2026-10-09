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
  SlidersHorizontal,
  Table,
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
  describeParameterRange,
  evaluateExpression,
  fieldMap,
  fieldOrigin,
  fields,
  formatParameterValue,
  fromDisplayValue,
  nextComputationCode,
  normalizeParameters,
  parameterDefinitionProblems,
  parameterUnit,
  parameterUnitLabel,
  prefixForCategory,
  referenceProblems,
  resolvedFields,
  seedComputations,
  toDisplayValue,
  usedComputations,
  usedFields,
} from './computationCatalog';
import {
  FORMULA_SCOPES,
  companyLabel,
  computationGuards,
  computationScope,
  diffComputation,
  governanceStamps,
  historyEntry,
  payItemsUsing,
  readApplicability,
  readAssignments,
  readCompanyRuns,
  readComputationLibrary,
  readHistory,
  readReferences,
  referenceVersionHistory,
  setApplicability,
  usageIndexFromRuns,
  usageOf,
  versionIndex,
  withReferenceVersion,
  writeAssignments,
  writeHistory,
  writeReferences,
} from './computationGovernance';
import { isEngineSupplied } from './computationBindings';
import { seedReferences } from './referenceSources';
import { PolicyComputations, policyEngines } from './PolicyComputations';
import { PAYROLL_REFERENCE_CODES, synchronizePayrollReference } from './payrollIntegration';
import { referenceRows } from './ReferenceTables';
import { useRole } from './RoleContext';
import { plural } from './textFormat';
import { rejectUpload } from './uploadErrorLog.js';
import { compareVersions, runTestCases, versionState, whereUsed, whereUsedCsv } from './computationInsights.js';

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
    <div><Function weight="duotone" /><span><strong>{computations.length}</strong><small>formulas assigned by P&amp;A</small></span></div>
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
    <td>{origin.unit ? parameterUnitLabel(code) : '—'}</td>
    <td>{origin.timing || '—'}</td>
    <td><span className={`missing-behaviour ${/Required/.test(origin.missingBehaviour || '') ? 'blocking' : ''}`}>{origin.missingBehaviour || '—'}</span></td>
    <td>{sample}</td>
  </tr>;
}

/** A parameter bound, typed the way a reader thinks of it: 10 %, not 0.1. */
function ParameterNumber({ token, value, onChange, label }) {
  const unit = parameterUnit(token);
  return <span className="parameter-input">
    {unit.prefix && <em>{unit.prefix}</em>}
    <input type="number" step="any" value={toDisplayValue(token, value)} onChange={event => onChange(fromDisplayValue(token, event.target.value))} aria-label={label} />
    {unit.suffix && <em>{unit.suffix}</em>}
  </span>;
}

/**
 * Which values in this formula a client may change, and within what range.
 *
 * This is the Controlled Hybrid boundary written down per formula. The
 * expression, its variables and anything payroll supplies stay with P&A; a
 * variable marked here may be given a value by the client, on their own pay
 * item, inside the range. A client's value never changes the formula.
 */
function ParameterDefinitions({ expression, parameters = {}, onChange }) {
  const tokens = usedFields(expression);
  const set = (token, patch) => onChange({ ...parameters, [token]: { clientEditable: false, ...(parameters[token] || {}), ...patch } });
  const problems = parameterDefinitionProblems(normalizeParameters(expression, parameters));
  return <div className="parameter-workspace">
    <div className="test-copy"><SlidersHorizontal weight="duotone" /><div><h3>Parameters</h3><p>Mark the values in this formula a client may change, and the range they may change them within — rates, amounts, multipliers, thresholds, caps. The expression, its variables and anything payroll supplies stay with P&amp;A. A client&apos;s value is saved on their own pay item and never changes this formula.</p></div></div>
    <div className="mapping-table-wrap"><table className="mapping-table parameter-table">
      <thead><tr><th>Variable</th><th>Supplied by</th><th>Client may change</th><th>Minimum</th><th>Maximum</th><th>Default</th></tr></thead>
      <tbody>
        {tokens.map(token => {
          const field = fieldMap[token];
          const definition = parameters[token] || {};
          if (isEngineSupplied(token)) return <tr key={token} className="parameter-runtime">
            <td><code>{`{{${token}}}`}</code><small className="block-caption">{field?.label || token}</small></td>
            <td><span className="mapping-owner">{field?.owner || 'Payroll runtime'}</span></td>
            <td colSpan={4}><span className="parameter-chip locked"><Lock weight="duotone" /> Supplied by payroll at run time — not a parameter</span></td>
          </tr>;
          return <tr key={token}>
            <td><code>{`{{${token}}}`}</code><small className="block-caption">{field?.label || token}</small></td>
            <td><span className="mapping-owner">{field?.owner || '—'}</span></td>
            <td><label className="parameter-toggle"><input type="checkbox" checked={Boolean(definition.clientEditable)} onChange={event => set(token, { clientEditable: event.target.checked })} /> {definition.clientEditable ? 'Yes, within the range' : 'No — P&A only'}</label></td>
            <td><ParameterNumber token={token} value={definition.min} onChange={value => set(token, { min: value })} label={`Minimum for ${token}`} /></td>
            <td><ParameterNumber token={token} value={definition.max} onChange={value => set(token, { max: value })} label={`Maximum for ${token}`} /></td>
            <td><ParameterNumber token={token} value={definition.default} onChange={value => set(token, { default: value })} label={`Default for ${token}`} /></td>
          </tr>;
        })}
        {!tokens.length && <tr className="mapping-empty"><td colSpan={6}>This formula uses no approved field yet, so it has no parameters.</td></tr>}
      </tbody>
    </table></div>
    {problems.length
      ? <div className="basis-error">{problems[0]}</div>
      : <p className="field-hint">The default is what payroll uses until a pay item sets its own value. Changing a range or who may change a value is a change to the formula, so it publishes a new version.</p>}
  </div>;
}

/**
 * The one formula editor. Under the Controlled Hybrid approach only P&A
 * authors formulas, so it is opened from Settings › Standard Computation
 * Library — for Atlas standards and client-specific formulas alike.
 */
export function FormulaEditor({ record, library = [], categories = categoryPrefixes, guard = null, actor = 'P&A Admin', companies = [], onClose, onSave, onTestHistory }) {
  const isCreating = record.isNew === true;
  const [draft, setDraft] = useState({ scope: 'Atlas standard', ownerCompanyId: '', parameters: {}, ...record });
  const [tab, setTab] = useState('formula');
  const [fieldCode, setFieldCode] = useState(fields[0][0]);
  // A formula may build on an already published one: only an active one, never
  // the record being edited, and never another client's own formula — an Atlas
  // standard that leaned on one client's formula would expose it to everyone.
  const referenceable = library.filter(item => item.status === 'Active' && item.code !== draft.code
    && (computationScope(item) !== 'Client-specific' || (draft.scope === 'Client-specific' && item.ownerCompanyId === draft.ownerCompanyId)));
  const [referenceCode, setReferenceCode] = useState(referenceable[0]?.code || '');
  const [testValues, setTestValues] = useState(() => Object.fromEntries(fields.map(([code, , sample]) => [code, sample])));
  const [testResult, setTestResult] = useState(null);
  const [expected, setExpected] = useState('');
  const [error, setError] = useState('');
  // A formula a posted payroll used gets no ready-made note: the new version
  // has to say why it exists.
  const [changeNote, setChangeNote] = useState(isCreating ? 'Formula added to the central library.' : guard?.versionNotice ? '' : 'Formula updated in the central library.');
  const [changeSource, setChangeSource] = useState('Screen');
  const [approvalRef, setApprovalRef] = useState('');
  const [caseName, setCaseName] = useState('');
  const testCases = draft.testCases || [];
  const caseResults = runTestCases(draft.expression, testCases, (expression, inputs) => evaluateExpression(expression, inputs, { library }));
  const addTestCase = () => {
    if (expected === '') { setError('Give the expected result before saving this as a test case.'); return; }
    const inputs = Object.fromEntries(resolvedFields(draft.expression, library).map(code => [code, Number(testValues[code]) || 0]));
    setDraft(previous => ({ ...previous, testCases: [...(previous.testCases || []), { id: `tc-${Date.now()}`, name: caseName.trim() || `Case ${(previous.testCases || []).length + 1}`, inputs, expected: Number(expected), addedBy: actor, addedAt: new Date().toISOString() }] }));
    setCaseName('');
    setError('');
  };
  const removeTestCase = id => setDraft(previous => ({ ...previous, testCases: (previous.testCases || []).filter(item => item.id !== id || item.lockedIn) }));
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
    if (guard?.versionNotice && !changeNote.trim()) { setError('Give the reason for this new version under Change details — a posted payroll used this formula, so the change has to be explained.'); setTab('change'); return; }
    if (guard?.versionNotice && !approvalRef.trim()) { setError('Give the approval reference for this change under Change details — a posted payroll used this formula.'); setTab('change'); return; }
    const failing = caseResults.filter(item => !item.passed);
    if (failing.length) { setError(`${failing.map(item => item.name).join(', ')} ${failing.length === 1 ? 'no longer passes' : 'no longer pass'}. Every test case must pass before the version is saved.`); setTab('test'); return; }
    if (!String(draft.name || '').trim()) { setError('Give the formula a name. A description is optional but recommended.'); setTab('formula'); return; }
    if (draft.scope === 'Client-specific' && !draft.ownerCompanyId) { setError('Choose the client this formula is built for.'); setTab('formula'); return; }
    const problems = referenceProblems(draft.expression, library, draft.code);
    if (problems.length) { setError(problems.join(' ')); setTab('formula'); return; }
    // Parameters follow the expression: a variable the formula no longer uses
    // takes its definition with it.
    const parameters = normalizeParameters(draft.expression, draft.parameters);
    const parameterIssues = parameterDefinitionProblems(parameters);
    if (parameterIssues.length) { setError(parameterIssues[0]); setTab('parameters'); return; }
    try {
      evaluateExpression(draft.expression, testValues, { library });
      onSave({ ...draft, name: draft.name.trim(), description: String(draft.description || '').trim(), parameters, changeNote, changeSource, approvalRef: approvalRef.trim() });
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
  // A new version that adds a variable leaves every pay item bound to this
  // formula to be told where that value comes from.
  const addedVariables = isCreating ? [] : usedFields(draft.expression).filter(token => !usedFields(record.expression || '').includes(token));
  const affectedPayItems = addedVariables.length ? payItemsUsing(record.code, companies) : [];
  const recalculableRuns = guard?.recalculableRuns || [];
  const showVersionNotice = Boolean(guard?.versionNotice || recalculableRuns.length || affectedPayItems.length);

  return <Modal title={isCreating ? 'Add formula' : `Edit formula · ${record.code}`} onClose={onClose} className="basis-editor-modal">
    <form onSubmit={submit}>
      <div className="basis-editor-tabs">
        <button type="button" className={tab === 'formula' ? 'active' : ''} onClick={() => setTab('formula')}>Formula setup</button>
        <button type="button" className={tab === 'parameters' ? 'active' : ''} onClick={() => setTab('parameters')}>Parameters</button>
        <button type="button" className={tab === 'test' ? 'active' : ''} onClick={() => setTab('test')}>Test calculation</button>
        <button type="button" className={tab === 'change' ? 'active' : ''} onClick={() => setTab('change')}>Change details</button>
      </div>
      <div className="basis-editor-body">
        {showVersionNotice && <div className="library-notice governed-notice version-notice"><Warning weight="duotone" /><span>
          {guard?.versionNotice && <strong>{guard.versionNotice}</strong>}
          {Boolean(recalculableRuns.length) && <small>{`${recalculableRuns.join(', ')} ${recalculableRuns.length === 1 ? 'is' : 'are'} still open or in review and will use the new version if recalculated.`}</small>}
          {Boolean(affectedPayItems.length) && <small>{`This change adds ${addedVariables.map(token => `{{${token}}}`).join(', ')}. Check where it comes from on ${affectedPayItems.map(item => `${item.name} (${item.companyName})`).join(', ')}.`}</small>}
        </span></div>}
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
            <label>Scope
              <select value={draft.scope} disabled={!isCreating} onChange={event => { const scope = event.target.value; setDraft(previous => ({ ...previous, scope, ownerCompanyId: scope === 'Client-specific' ? (previous.ownerCompanyId || companies[0]?.companyId || '') : '' })); }}>
                {FORMULA_SCOPES.map(scope => <option key={scope}>{scope}</option>)}
              </select>
              <small className="field-hint">{isCreating
                ? 'An Atlas standard can be assigned to any company. A client-specific formula is built by P&A for one client and is only ever assigned to that client.'
                : 'Fixed once the formula is saved.'}</small>
            </label>
            {draft.scope === 'Client-specific' && <label>Client
              <select value={draft.ownerCompanyId || ''} disabled={!isCreating} onChange={event => setDraft(previous => ({ ...previous, ownerCompanyId: event.target.value }))} required>
                <option value="">Please select</option>
                {companies.map(company => <option key={company.companyId} value={company.companyId}>{companyLabel(company)}</option>)}
              </select>
            </label>}
            {isCreating
              ? <label>Status
                  <input value="Inactive" disabled readOnly />
                  <small className="field-hint">A new computation stays Inactive while it is built and reviewed. Activate it from the list when it is ready to compute.</small>
                </label>
              : <label>Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option>Active</option><option>Inactive</option></select></label>}
            <label className="wide"><span className="label-caption">Description <span className="optional-tag">Optional</span></span>
              <textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Recommended — explain what this formula includes and excludes." />
            </label>
          </div>
          <section className="formula-builder">
            <div className="formula-builder-heading"><div><h3>Expression builder</h3><p>Build the calculation from approved payroll fields, published formulas and operators. Keep a rate or amount a client may change out of the expression as a number — insert it as a field and give it a range on the Parameters tab.</p></div><span className="version-chip">{isCreating ? draft.scope : `Version ${draft.version}`}</span></div>
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
          <section className="test-cases">
            <header><h4>Test cases</h4><span>{testCases.length ? `${caseResults.filter(item => item.passed).length} of ${testCases.length} passing` : 'None yet'}</span></header>
            <p className="field-hint">Keep the inputs above with their expected result as a test case. Every case is run again on each change and must pass to save; a case is locked once the version it was saved with is approved.</p>
            <div className="test-case-add"><input value={caseName} onChange={event => setCaseName(event.target.value)} placeholder="Case name, e.g. Mid-month hire" aria-label="Test case name" /><button type="button" className="button secondary" onClick={addTestCase}><Plus /> Save inputs as a test case</button></div>
            {testCases.length > 0 && <table className="config-table test-case-table"><thead><tr><th>Case</th><th>Inputs</th><th>Expected</th><th>Actual</th><th>Result</th><th /></tr></thead><tbody>
              {caseResults.map(item => <tr key={item.id}>
                <td><strong>{item.name}</strong>{item.lockedIn && <small className="block-caption"><Lock weight="duotone" /> Locked in v{item.lockedIn}</small>}</td>
                <td><small>{Object.entries(item.inputs).map(([code, value]) => `${fieldMap[code]?.label || code}: ${Number(value).toLocaleString()}`).join(' · ')}</small></td>
                <td>₱{Number(item.expected).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{item.actual === null ? item.error : `₱${Number(item.actual).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</td>
                <td><span className={`status-pill ${item.passed ? 'active' : 'inactive'}`}>{item.passed ? 'Passed' : 'Failed'}</span></td>
                <td>{item.lockedIn ? <Lock weight="duotone" /> : <button type="button" className="text-danger" onClick={() => removeTestCase(item.id)}>Remove</button>}</td>
              </tr>)}
            </tbody></table>}
          </section>
        </div>}
        {tab === 'parameters' && <ParameterDefinitions expression={draft.expression} parameters={draft.parameters} onChange={parameters => setDraft(previous => ({ ...previous, parameters }))} />}
        {tab === 'change' && <div className="change-workspace">
          <h3>Change details</h3><p>Saving creates a new controlled version and records the change — with its before and after values — in history.</p>
          <label>Effective date<input type="date" value={draft.effectiveDate} onChange={event => setDraft({ ...draft, effectiveDate: event.target.value })} required /></label>
          <label>Change note<textarea value={changeNote} onChange={event => setChangeNote(event.target.value)} required /></label>
          <div className="basis-form-grid">
            <label>Change source<select value={changeSource} onChange={event => setChangeSource(event.target.value)}><option>Screen</option><option>Upload</option><option>API</option></select><small className="field-hint">Recorded with the version so the history shows how the change arrived.</small></label>
            <label><span className="label-caption">Approval reference {guard?.versionNotice ? <span className="required">*</span> : <span className="optional-tag">Optional</span>}</span><input value={approvalRef} onChange={event => setApprovalRef(event.target.value)} placeholder="e.g. CR-2026-014 or the approval email subject" /></label>
          </div>
          {draft.effectiveDate > new Date().toISOString().slice(0, 10) && <p className="field-hint scheduled-hint">Effective {draft.effectiveDate} — this version is scheduled. Payroll paid out before that date keeps using the version in force now.</p>}
          {Boolean(pendingChanges.length) && <div className="change-diff">
            <h4>What this save changes</h4>
            <table className="change-diff-table"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>
              {pendingChanges.map(change => <tr key={change.field}><td>{change.field}</td><td><code className="diff-before">{String(change.from) || '—'}</code></td><td><code className="diff-after">{String(change.to) || '—'}</code></td></tr>)}
            </tbody></table>
          </div>}
          {!isCreating && !pendingChanges.length && <p className="change-diff-empty">No tracked field has changed yet. Edit the formula, its parameters, status, effective date, name, category or description to record a change.</p>}
          <div className="change-summary"><span>{isCreating ? 'Initial version' : 'Current version'} <strong>{isCreating ? '1.0' : draft.version}</strong></span><span>{isCreating ? 'Scope' : 'Next version'} <strong>{isCreating ? draft.scope : (Number(draft.version) + 0.1).toFixed(1)}</strong></span><span>{isCreating ? 'Created by' : 'Changed by'} <strong>{actor}</strong></span><span>Test evidence <strong>{draft.lastTest ? `${draft.lastTest.result} · ₱${Number(draft.lastTest.actual).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'Not run'}</strong></span></div>
        </div>}
        {error && <div className="basis-error">{error}</div>}
      </div>
      <div className="modal-actions sticky-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{isCreating ? 'Validate and add' : 'Validate and save'}</button></div>
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
/** Two versions side by side, differences highlighted. */
export function VersionCompare({ versions = [] }) {
  const [left, setLeft] = useState(versions[1]?.version || versions[0]?.version || '');
  const [right, setRight] = useState(versions[0]?.version || '');
  if (versions.length < 2) return <p className="drawer-paragraph">Compare needs at least two published versions.</p>;
  const pick = value => versions.find(item => item.version === value) || {};
  const rows = compareVersions(pick(left), pick(right));
  return <div className="version-compare">
    <div className="version-compare-pickers">
      <label>Compare<select value={left} onChange={event => setLeft(event.target.value)}>{versions.map(item => <option key={item.version} value={item.version}>v{item.version} · {item.effectiveDate}</option>)}</select></label>
      <label>with<select value={right} onChange={event => setRight(event.target.value)}>{versions.map(item => <option key={item.version} value={item.version}>v{item.version} · {item.effectiveDate}</option>)}</select></label>
      <span>{rows.filter(row => row.changed).length} {rows.filter(row => row.changed).length === 1 ? 'difference' : 'differences'}</span>
    </div>
    <table className="config-table version-compare-table"><thead><tr><th>Field</th><th>v{left}</th><th>v{right}</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.field} className={row.changed ? 'changed' : ''}><td>{row.field}</td><td><code>{row.left || '—'}</code></td><td><code>{row.right || '—'}</code></td></tr>)}
    </tbody></table>
  </div>;
}

function ComputationDrawer({ record, library = [], versions = [], usage = null, guard = null, whereUsedRows = [], onClose }) {
  const mapped = usedFields(record.expression);
  const dependencies = computationDependencies(record.expression, library, record.code);
  // Every value the formula uses that payroll does not supply itself, with who
  // may set it and where. This is how a client reads "what can I change here".
  const parameterRows = mapped.filter(token => !isEngineSupplied(token)).map(token => {
    const definition = record.parameters?.[token] || null;
    const field = fieldMap[token];
    return {
      token,
      label: field?.label || token,
      clientEditable: Boolean(definition?.clientEditable),
      range: definition ? describeParameterRange(token, definition) : '—',
      defaultValue: formatParameterValue(token, definition?.default),
      where: definition?.clientEditable
        ? 'On the pay item that uses this formula, in Services Information'
        : field?.owner === 'Statutory Reference' ? 'Statutory tables, maintained by P&A' : 'Set by P&A',
    };
  });
  return <div className="modal-backdrop view-drawer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="record-drawer basis-record-drawer" role="dialog" aria-modal="true" aria-label={record.name}>
      <header><div><p>{record.code} · Version {record.version}</p><h2>{record.name}</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>
      <div className="record-drawer-body">
        <section><div className="detail-grid">
          <div><strong>Category</strong><span>{record.category}</span></div>
          <div><strong>Scope</strong><ScopeChip record={record} /></div>
          <div><strong>Owned and maintained by</strong><span>P&amp;A</span></div>
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
        <section><h3>Parameters</h3>
          {parameterRows.length ? <div className="mapping-table-wrap"><table className="mapping-table parameter-table"><thead><tr><th>Variable</th><th>Who may change it</th><th>Allowed range</th><th>Default</th><th>Where the value is set</th></tr></thead><tbody>
            {parameterRows.map(row => <tr key={row.token}>
              <td><code>{`{{${row.token}}}`}</code><small className="block-caption">{row.label}</small></td>
              <td>{row.clientEditable ? <span className="parameter-chip client">Client, within the range</span> : <span className="parameter-chip locked"><Lock weight="duotone" /> P&amp;A only</span>}</td>
              <td>{row.range}</td>
              <td>{row.defaultValue}</td>
              <td>{row.where}</td>
            </tr>)}
          </tbody></table></div>
            : <p className="drawer-paragraph">Every value this formula uses is supplied by payroll or by another formula, so there is nothing to set.</p>}
        </section>
        <section><h3>Version history</h3>
          {versions.length ? <div className="version-history">{versions.map(version => <article key={`${version.code}-${version.version}`} className={version.version === record.version ? 'current' : ''}>
            <header><strong>Version {version.version}</strong><span>Effective {version.effectiveDate}</span>{versionState(version) === 'Scheduled' && <span className="status-pill scheduled">Scheduled</span>}{version.version === record.version && <span className="version-current-chip">Current</span>}</header>
            <code className="version-expression">{version.expression}</code>
            <small>{version.note || 'No change note recorded.'} · {version.publishedBy} · {new Date(version.publishedAt).toLocaleString()} · Source: {version.source || 'Screen'}{version.approvalRef ? ` · Approval ${version.approvalRef}` : ''}</small>
            {Boolean(version.changes?.length) && <ul className="version-change-list">{version.changes.map(change => <li key={change.field}><b>{change.field}</b> <code className="diff-before">{String(change.from) || '—'}</code> → <code className="diff-after">{String(change.to) || '—'}</code></li>)}</ul>}
            <TestEvidence evidence={version.test} compact />
            {Boolean(version.testCases?.length) && <small className="block-caption"><Lock weight="duotone" /> {version.testCases.length} locked test {version.testCases.length === 1 ? 'case' : 'cases'}: {version.testCases.map(item => item.name).join(', ')}</small>}
          </article>)}</div>
            : <p className="drawer-paragraph">No version has been published from this workspace yet. The current definition is version {record.version}.</p>}
        </section>
        <section><h3>Compare versions</h3><VersionCompare versions={versions} /></section>
        <section><div className="section-heading-row"><h3>Where used</h3>{whereUsedRows.length > 0 && <button type="button" className="button secondary small" onClick={() => downloadFile(`${record.code}-where-used.csv`, whereUsedCsv(record.code, whereUsedRows), 'text/csv')}><DownloadSimple /> Download report</button>}</div>
          {whereUsedRows.length ? <table className="config-table usage-table"><thead><tr><th>Used as</th><th>Where</th><th>Company</th><th>Detail</th></tr></thead><tbody>
            {whereUsedRows.map((row, index) => <tr key={`${row.kind}-${index}`}><td>{row.kind}</td><td><strong>{row.where}</strong></td><td>{row.company}</td><td><small>{row.detail}</small></td></tr>)}
          </tbody></table> : <p className="drawer-paragraph">Nothing uses this formula yet — no pay item, formula, assignment or payroll transaction.</p>}
        </section>
        <section><h3>Payroll usage</h3>
          {usage?.transactions?.length ? <table className="config-table usage-table"><thead><tr><th>Transaction</th><th>Period</th><th>Status</th><th>Version used</th></tr></thead><tbody>
            {usage.transactions.map(item => <tr key={item.runId}><td><strong>{item.transactionNumber}</strong></td><td>{item.period || item.payoutDate || '—'}</td><td><span className={`status-pill ${item.posted ? 'active' : 'inactive'}`}>{item.status}</span></td><td>{item.version ? `v${item.version}` : 'Not recorded'}</td></tr>)}
          </tbody></table>
            : <p className="drawer-paragraph">{guard && !guard.canEdit ? 'No payroll transaction has used this computation yet.' : 'No payroll transaction has used this computation yet, so it may still be edited, deactivated or deleted.'}</p>}
        </section>
        {Boolean(guard && (!guard.canEdit || !guard.canDelete || !guard.canDeactivate)) && <section><h3>What is protected</h3><ul className="guard-list">
          {!guard.canEdit && <li><Prohibit weight="duotone" /> {guard.editReason}</li>}
          {!guard.canDelete && <li><Prohibit weight="duotone" /> {guard.deleteReason}</li>}
          {!guard.canDeactivate && <li><Prohibit weight="duotone" /> {guard.deactivateReason}</li>}
        </ul></section>}
      </div>
      <footer><button className="button secondary" onClick={onClose}>Close</button><span className="drawer-lock-note"><Lock weight="duotone" /> {guard?.editReason || 'Formulas are maintained by P&A.'}</span></footer>
    </aside>
  </div>;
}

/** Atlas standard or client-specific — both authored and maintained by P&A. */
export function ScopeChip({ record }) {
  const scope = computationScope(record);
  const clientSpecific = scope === 'Client-specific';
  return <span className={`computation-source ${clientSpecific ? 'client-specific' : 'built-in'}`} title={clientSpecific ? 'Built by P&A for one client, and assigned only to that client' : 'Atlas standard — defined once, centrally'}><Function weight="duotone" />{scope}</span>;
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

/**
 * `valuesOnly` is the client's view. A client may publish new values for the
 * rows a source already has; adding, removing or renaming a row changes what a
 * formula can look up, and re-ranking the deduction hierarchy changes payroll
 * logic, so both stay with P&A.
 */
function ReferenceEditor({ table: reference, valuesOnly = false, onClose, onSave, onExport }) {
  const [draft, setDraft] = useState({ ...reference, entries: reference.entries.map(item => ({ ...item })) });
  const [newEntry, setNewEntry] = useState({ key: '', value: '', note: '' });
  const payrollDerived = [PAYROLL_REFERENCE_CODES.deductions, PAYROLL_REFERENCE_CODES.loans].includes(reference.code);
  const hierarchy = reference.code === PAYROLL_REFERENCE_CODES.hierarchy;
  const structureLocked = payrollDerived || hierarchy || valuesOnly;
  const valueLocked = item => payrollDerived || (hierarchy && (valuesOnly || /statutory/i.test(item.key)));
  const canSave = !payrollDerived && !(hierarchy && valuesOnly);
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
        <button type="button" className={`switch ${draft.enabled ? 'on' : ''}`} disabled={valuesOnly} title={valuesOnly ? 'Enabling or disabling a formula reference source is done by P&A.' : undefined} onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}><span /></button>
      </div>
      <p className="reference-version-note">Saving publishes version {(Number.parseFloat(reference.version) + 0.1).toFixed(1)}. Version {reference.version} is kept in full and stays available to the payrolls that used it.</p>
      {(payrollDerived || hierarchy) && <div className="linked-reference-note"><Lock weight="duotone" /><span>{hierarchy ? (valuesOnly ? 'The deduction hierarchy decides the order payroll collects in, which is payroll logic, so P&A maintains it.' : 'Item codes and classifications come from the active Deduction and Loan modules. Only the adjustment rank is maintained here.') : 'This source is generated from active module definitions. Edit the originating Deduction or Loan module instead of duplicating values here.'}</span></div>}
      {valuesOnly && !payrollDerived && !hierarchy && <div className="linked-reference-note"><Lock weight="duotone" /><span>You can publish new values for the rows below. Adding, removing or renaming a row changes what the formulas can look up, so P&amp;A does that.</span></div>}
      {hierarchyError && <div className="warning-copy">Each adjustable item needs a unique whole-number rank of 1 or greater.</div>}
      <div className="reference-entry-table"><table><thead><tr><th>Key / Range</th><th>{hierarchy ? 'Adjustment rank' : 'Value'}</th><th>Notes / source</th><th>Action</th></tr></thead><tbody>
        {draft.entries.map(item => <tr key={item.id}><td><input value={item.key} readOnly={structureLocked} onChange={event => updateEntry(item.id, 'key', event.target.value)} /></td><td><input value={item.value} readOnly={valueLocked(item)} onChange={event => updateEntry(item.id, 'value', event.target.value)} /></td><td><input value={item.note} readOnly={structureLocked} onChange={event => updateEntry(item.id, 'note', event.target.value)} /></td><td>{structureLocked ? <Lock /> : <button className="text-danger" onClick={() => removeEntry(item.id)}>Remove</button>}</td></tr>)}
        {!structureLocked && <tr className="new-reference-row"><td><input value={newEntry.key} onChange={event => setNewEntry({ ...newEntry, key: event.target.value })} placeholder="New key or range" /></td><td><input value={newEntry.value} onChange={event => setNewEntry({ ...newEntry, value: event.target.value })} placeholder="Value" /></td><td><input value={newEntry.note} onChange={event => setNewEntry({ ...newEntry, note: event.target.value })} placeholder="Optional note" /></td><td><button className="button secondary small" onClick={addEntry}><Plus /> Add</button></td></tr>}
      </tbody></table></div>
    </div>
    <div className="modal-actions sticky-actions"><button className="button secondary" onClick={() => onExport(draft)}><DownloadSimple /> Download CSV</button><span className="toolbar-spacer" /><button className="button secondary" onClick={onClose}>{canSave ? 'Cancel' : 'Close'}</button>{canSave && <button className="button primary" disabled={hierarchyError} onClick={() => onSave(draft)}>{valuesOnly ? 'Publish new values' : 'Save table'}</button>}</div>
  </Modal>;
}

export function ComputationalBasis({ companyId, onBack, onOpenStatutory, onOpenService, notify, initialTab = 'computations' }) {
  const { isPaAdmin, actor } = useRole();

  // Controlled Hybrid: every formula lives once in the central library and is
  // owned by P&A. This screen shows the formulas P&A assigned to this company,
  // the values each one lets the client change, and the sources those values
  // come from. Nothing here authors or edits formula logic.
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [assignments, setAssignments] = useState(() => readAssignments(companyId, initialAssignments));
  const [references, setReferences] = useState(() => readReferenceLibrary(companyId));
  const [history, setHistory] = useState(() => readHistory(companyId, initialHistory));
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [status, setStatus] = useState('All statuses');
  const [source, setSource] = useState('All scopes');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [viewing, setViewing] = useState(null);
  const [assignmentEditing, setAssignmentEditing] = useState(undefined);
  const [referenceEditing, setReferenceEditing] = useState(null);
  const [referenceHistory, setReferenceHistory] = useState(null);
  const referenceUploadRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null);
  const pageSize = 10;

  useEffect(() => { writeAssignments(companyId, assignments); }, [companyId, assignments]);
  useEffect(() => { writeReferences(companyId, references); }, [companyId, references]);
  useEffect(() => { writeHistory(companyId, history); }, [companyId, history]);

  // `libraryVersion` is bumped whenever P&A changes this company's status for a
  // formula, so the register re-reads the assignment it now carries.
  const computations = useMemo(() => readComputationLibrary(companyId), [companyId, libraryVersion]);
  const runs = useMemo(() => readCompanyRuns(companyId), [companyId, tab]);
  const usage = useMemo(() => usageIndexFromRuns(runs), [runs]);
  const versions = useMemo(() => versionIndex(companyId), [companyId, libraryVersion]);
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
    const matchSource = source === 'All scopes' || computationScope(item) === source;
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
    // Switching an assigned formula on or off changes what payroll computes for
    // the company, so it is P&A's decision rather than a client parameter.
    if (!isPaAdmin) return { ok: false, reason: `Activating or deactivating ${record.code} for this company is done by P&A.` };
    const guard = guardFor(record);
    if (nextStatus === 'Inactive' && !guard.canDeactivate) return { ok: false, reason: guard.deactivateReason };
    // A formula retired centrally cannot be switched back on for one company —
    // the definition itself is inactive, and reviving it is a Settings decision.
    if (nextStatus === 'Active' && record.centralStatus === 'Inactive') {
      return { ok: false, reason: `${record.code} is Inactive in the central Atlas library. It has to be reactivated in Settings › Standard Computation Library before any company can use it.` };
    }
    setApplicability(record.code, companyId, { status: nextStatus }, actor);
    setLibraryVersion(value => value + 1);
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

  const saveAssignment = draft => {
    // Which formula a statutory, tax or retirement computation applies is part
    // of the logic, so pipeline assignments are P&A's.
    if (!isPaAdmin) { notify({ type: 'error', message: 'Pipeline assignments are set by P&A.' }); return; }
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
      if (lines.length < 2) { rejectUpload(file.name, ['The reference file needs a header and at least one row.'], notify); return; }
      const entries = lines.slice(1).map((line, index) => {
        const [key = '', value = '', note = ''] = parseCsvLine(line);
        return { id: index + 1, key, value, note };
      });
      const rowErrors = entries.flatMap((item, index) => [
        !item.key && { row: index + 2, field: 'Key', reason: 'Key is required.' },
        !item.value && { row: index + 2, field: 'Value', value: item.key, reason: 'Value is required.' },
      ].filter(Boolean));
      if (rowErrors.length) { rejectUpload(file.name, rowErrors, notify); return; }
      // A client may publish new values, not new rows: the upload has to name
      // exactly the rows the source already has.
      if (!isPaAdmin) {
        const expectedKeys = new Set((uploadTarget.entries || []).map(item => String(item.key)));
        const receivedKeys = new Set(entries.map(item => String(item.key)));
        const sameRows = expectedKeys.size === receivedKeys.size && [...expectedKeys].every(key => receivedKeys.has(key));
        if (!sameRows) { notify({ type: 'error', message: `${uploadTarget.name} can only receive new values for the rows it already has. Adding, removing or renaming a row changes what the formulas can look up, so P&A does that.` }); return; }
      }
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
    if (!isPaAdmin) { notify({ type: 'error', message: 'Enabling or disabling a formula reference source is done by P&A.' }); return; }
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
    <div className="page-heading basis-heading"><div><p className="breadcrumb">Company Info / Services Information / Payroll / Computational Basis</p><h1>Computational Basis</h1><p className="page-description">The formulas P&amp;A assigned to this company, the values each one lets you change, the pipeline assignments, policy engines and versioned reference sources payroll runs with.</p></div><span className="controlled-badge"><Lock weight="duotone" /> Controlled Hybrid · formulas owned by P&amp;A</span></div>
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
        <select className="compact-select" value={source} onChange={event => setSource(event.target.value)}><option>All scopes</option>{FORMULA_SCOPES.map(scope => <option key={scope}>{scope}</option>)}</select>
        <div className="toolbar-spacer" />
        <div className="basis-toolbar-actions">
          <ReportMenu onCsv={() => { exportCsv('atlas-computational-basis.csv', filteredComputations, computationColumns); notify({ type: 'success', message: 'Computational Basis CSV report downloaded.' }); }} onPdf={() => { printReport('Atlas Computational Basis', filteredComputations, computationColumns); notify({ type: 'success', message: 'Computational Basis print report prepared.' }); }} /></div>
      </div>
      <div className="library-notice"><Lock weight="duotone" /><span>{isPaAdmin
        ? <><strong>Every formula is authored once, centrally, by P&amp;A.</strong> Add or change a formula — Atlas standard or client-specific — and assign it to companies in Settings › Standard Computation Library. Here you activate or deactivate what is assigned to this company, and only while no payroll transaction is linked to it.</>
        : <><strong>These are the formulas P&amp;A assigned to your company.</strong> Open one to see its logic and the values you may change. You change an approved value on the pay item that uses the formula, in Services Information. For a new formula or a change in logic, contact P&amp;A — it is handled as an enhancement.</>}</span></div>

      {/* Bulk maintenance: filter the register, select what the filter found,
          then move the whole selection at once. Codes a payroll transaction is
          linked to are reported rather than silently skipped. */}
      {isPaAdmin && Boolean(selected.size) && <div className="bulk-action-bar">
        <span><strong>{selected.size}</strong> selected</span>
        <button className="button secondary small" onClick={() => bulkStatus('Active')}><Check /> Activate</button>
        <button className="button secondary small" onClick={() => bulkStatus('Inactive')}><Prohibit /> Deactivate</button>
        <button className="button secondary small" onClick={() => setSelected(new Set())}><X /> Clear selection</button>
      </div>}

      <div className="table-card config-table-card basis-table-card"><table className="config-table basis-table"><thead><tr>
        {isPaAdmin && <th className="select-column"><input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} aria-label={`Select all ${filteredComputations.length} filtered computations`} /></th>}
        <th>Code</th><th>Scope</th><th>Computation</th><th>Category</th><th>Formula</th><th>Version</th><th>Status</th><th>Payroll usage</th><th>Action</th>
      </tr></thead><tbody>
        {visibleComputations.map(item => {
          const guard = guardFor(item);
          const used = guard.usage;
          return <tr key={item.code} className={selected.has(item.code) ? 'row-selected' : ''}>
            {isPaAdmin && <td className="select-column"><input type="checkbox" checked={selected.has(item.code)} onChange={() => toggleSelected(item.code)} aria-label={`Select ${item.code}`} /></td>}
            <td><strong>{item.code}</strong></td>
            <td><ScopeChip record={item} /></td>
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
              {isPaAdmin && <button
                onClick={() => toggleStatus(item)}
                disabled={item.status === 'Active' ? !guard.canDeactivate : item.centralStatus === 'Inactive'}
                title={item.status === 'Active'
                  ? (guard.canDeactivate ? `Deactivate ${item.code} for this company` : guard.deactivateReason)
                  : (item.centralStatus === 'Inactive' ? `${item.code} is Inactive in the central Atlas library — reactivate it in Settings first.` : `Activate ${item.code} for this company`)}
                aria-label={`${item.status === 'Active' ? 'Deactivate' : 'Activate'} ${item.name}`}
              >{item.status === 'Active' ? <Prohibit /> : <Check />}</button>}
              <span className="row-lock" title={guard.editReason}><Lock weight="duotone" /></span>
            </div></td>
          </tr>;
        })}
      </tbody></table></div>
      <div className="pagination"><span>Displaying <strong>{visibleComputations.length}</strong> of {filteredComputations.length} {plural(filteredComputations.length, 'computation')}</span><div><button disabled={page === 1} onClick={() => setPage(1)}>«</button><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>‹</button><strong>{page}</strong><span>of {pages}</span><button disabled={page === pages} onClick={() => setPage(value => value + 1)}>›</button><button disabled={page === pages} onClick={() => setPage(pages)}>»</button></div></div>
    </>}

    {tab === 'assignments' && <>
      <div className="config-toolbar basis-toolbar"><div className="workspace-copy"><h2>Pipeline computation assignments</h2><p>The formula each pipeline computation applies — statutory contributions, withholding tax, take-home protection and the retirement benefit. Everything with a Services Information configuration sets its formula and its applicability there instead. P&amp;A sets these during onboarding.</p></div><div className="toolbar-spacer" />{isPaAdmin && <button className="button primary" onClick={() => setAssignmentEditing(null)}><Plus /> Add assignment</button>}<ReportMenu onCsv={() => exportCsv('atlas-computation-assignments.csv', assignments, assignmentColumns)} onPdf={() => printReport('Atlas Computation Assignments', assignments, assignmentColumns)} /></div>
      <div className="table-card config-table-card"><table className="config-table"><thead><tr><th>Assignment type</th><th>Reference table</th><th>Basis of computation</th><th>Effective date</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {assignments.map(item => <tr key={item.id}><td>{item.type}</td><td>{item.table}</td><td><strong>{item.computationCode}</strong><small className="block-caption">{computations.find(record => record.code === item.computationCode)?.name}</small></td><td>{item.effectiveDate || '—'}</td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></td><td><div className="row-actions always">{isPaAdmin
          ? <button onClick={() => setAssignmentEditing(item)} aria-label="Edit assignment"><PencilSimple /></button>
          : <span className="row-lock" title="Pipeline assignments are set by P&A."><Lock weight="duotone" /></span>}</div></td></tr>)}
      </tbody></table></div>
    </>}

    {tab === 'policies' && <PolicyComputations companyId={companyId} notify={notify} addHistory={addHistory} references={references} onManageHierarchy={() => setTab('references')} onOpenService={onOpenService} />}

    {tab === 'references' && <>
      <div className="config-toolbar basis-toolbar"><div className="workspace-copy"><h2>Formula reference sources</h2><p>Maintain formula reference sources. Every published version is kept, so payroll resolves the values that were effective on its payout date. Statutory contribution versions are linked here but managed in Settings.</p></div><div className="toolbar-spacer" /><ReportMenu onCsv={() => exportCsv('atlas-reference-tables.csv', references.map(item => ({ ...item, enabled: item.enabled ? 'Enabled' : 'Disabled' })), [...referenceColumns, ['enabled', 'Company Status']])} onPdf={() => printReport('Atlas Reference Tables', references.map(item => ({ ...item, enabled: item.enabled ? 'Enabled' : 'Disabled' })), [...referenceColumns, ['enabled', 'Company Status']])} /></div>
      <input ref={referenceUploadRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={uploadReferenceVersion} />
      <div className="reference-grid">{references.map(item => {
        const published = referenceVersionHistory(item);
        return <article className="reference-card" key={item.id}>
          <header><span className="reference-icon"><Table weight="duotone" /></span><button className={`switch ${item.enabled ? 'on' : ''}`} onClick={() => toggleReference(item)} disabled={!isPaAdmin} title={isPaAdmin ? undefined : 'Enabling or disabling a formula reference source is done by P&A.'} aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`}><span /></button></header>
          <div><small>{item.code} · {item.category}</small><h3>{item.name}</h3><p>{item.entries.length} configured {plural(item.entries.length, 'row')}</p></div>
          <dl><div><dt>Version</dt><dd>{item.version}</dd></div><div><dt>Effective</dt><dd>{item.effectiveDate}</dd></div><div><dt>Published versions</dt><dd>{published.length}</dd></div><div><dt>Company</dt><dd className={item.enabled ? 'enabled-copy' : 'disabled-copy'}>{item.enabled ? 'Enabled' : 'Disabled'}</dd></div></dl>
          <footer>{item.category === 'Linked Statutory' ? <><button onClick={onOpenStatutory}><Table /> Manage in Settings</button><button onClick={() => setReferenceHistory(item)}><ClockCounterClockwise /> Versions</button></> : <><button onClick={() => setReferenceEditing(item)}><PencilSimple /> {isPaAdmin ? 'Manage' : 'Update values'}</button><button onClick={() => setReferenceHistory(item)}><ClockCounterClockwise /> Versions</button><button onClick={() => downloadReferenceTemplate(item)}><FileCsv /> Template</button><button onClick={() => { setUploadTarget(item); window.setTimeout(() => referenceUploadRef.current?.click(), 0); }}><UploadSimple /> Upload version</button></>}</footer>
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

    {viewing && <ComputationDrawer
      record={viewing}
      library={computations}
      versions={versions[String(viewing.code).toUpperCase()] || []}
      usage={usageOf(viewing.code, usage)}
      guard={guardFor(viewing)}
      whereUsedRows={whereUsed(viewing.code, {
        library: computations,
        payItems: payItemsUsing(viewing.code, [{ companyId, displayName: 'This company' }]),
        assignments: assignments.map(item => ({ ...item, companyName: 'This company' })),
        companies: [{ companyId, displayName: 'This company' }],
        applicability: readApplicability(),
        transactions: usageOf(viewing.code, usage).transactions || [],
      })}
      onClose={() => setViewing(null)}
    />}
    {isPaAdmin && assignmentEditing !== undefined && <AssignmentModal record={assignmentEditing} computations={computations} references={references} onClose={() => setAssignmentEditing(undefined)} onSave={saveAssignment} />}
    {referenceEditing && <ReferenceEditor table={referenceEditing} valuesOnly={!isPaAdmin} onClose={() => setReferenceEditing(null)} onSave={saveReference} onExport={table => exportCsv(`${table.code.toLowerCase()}-${table.version}.csv`, table.entries, [['key', 'Key'], ['value', 'Value'], ['note', 'Note']])} />}
    {referenceHistory && <ReferenceVersions reference={referenceHistory} onClose={() => setReferenceHistory(null)} />}
  </div>;
}
