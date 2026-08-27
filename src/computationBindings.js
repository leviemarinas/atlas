/**
 * Binding a Computational Basis formula to a payroll configuration record.
 *
 * Computational Basis publishes *what* a formula is. Services Information
 * publishes *what a company pays* — an earning type, a deduction, an allowance,
 * a bonus, a loan, a pay rate. Until now the two never met: the library held
 * `ERN-005 = {{allowance_units}} * {{allowance_unit_rate}}` and the Earning
 * Configuration held "Meal Allowance", and nothing said that Meal Allowance is
 * computed with ERN-005, still less where its two variables come from.
 *
 * A binding is that missing statement. It carries two things:
 *
 *   `computationCode`      which published formula this configuration applies
 *   `computationBindings`  where each variable in that formula gets its value
 *
 * Every `{{token}}` the formula needs — following referenced computations all
 * the way down, which is why `resolvedFields` is used rather than `usedFields` —
 * is bound to exactly one of four sources:
 *
 *   runtime    the payroll engine supplies it from the modules that own it:
 *              Timekeeping punches, the employee salary record, an earlier step
 *   config     a numeric field on this very configuration record, so "Default
 *              Amount = 150" on the allowance becomes `{{allowance_unit_rate}}`
 *   reference  a row in a formula reference source, resolved to the version
 *              effective on the payout date by the caller
 *   fixed      a constant typed on the binding itself
 *
 * ## The period contract
 *
 * A bound computation returns the amount **for the payroll period being
 * computed**, not a monthly figure the engine then divides. The binder chose
 * every input, so it is the binding — not a frequency rule applied afterwards —
 * that decides the size of the result. `Recurring Frequency` still decides
 * *whether* the item falls due in this period; it never rescales a bound
 * amount.
 *
 * ## Why this module imports nothing but the catalogue
 *
 * `payrollEngine.js` is pure and must stay that way, and
 * `computationGovernance.js` reaches into storage and imports `payrollRuns.js`,
 * which imports the engine. Importing governance here would close that loop, so
 * this module takes references as plain data and lets each caller resolve the
 * effective version its own way.
 */

import {
  computationByCode,
  evaluateExpression,
  fieldMap,
  resolvedFields,
  usedComputations,
} from './computationCatalog.js';

/* ------------------------------------------------------------------ sources */

/**
 * The approved fields the payroll engine can supply on its own.
 *
 * This is a contract, not a convenience: a token listed here may be bound to
 * `runtime` and the engine undertakes to have a value for it by the time the
 * item is computed. `payroll-computation-bindings.test.mjs` asserts the engine's
 * runtime map covers every entry, so the list cannot drift away from the code.
 */
export const ENGINE_SUPPLIED_FIELDS = Object.freeze([
  'monthly_basic',
  'basic_pay',
  'basic_pay_adjustment',
  'daily_rate',
  'hourly_rate',
  'factor_days',
  'work_hours',
  'ecola_amount',
  'days_worked',
  'absent_days',
  'late_minutes',
  'undertime_minutes',
  'ot_hours',
  'ot_rate',
  'holiday_hours',
  'holiday_rate',
  'part_time_hours',
  'years_service',
  'rounded_years_service',
  'unused_leave_days',
  'basic_earnings_ytd',
  'bonus_paid_ytd',
  'de_minimis_paid_ytd',
  'taxable_earnings',
  'non_taxable_earnings',
  'other_bonus',
  'gross_pay',
  'statutory_deductions',
  'taxable_income',
  'withholding_tax',
]);

const engineSupplied = new Set(ENGINE_SUPPLIED_FIELDS);

/** Whether the payroll engine undertakes to supply this token itself. */
export function isEngineSupplied(token) {
  return engineSupplied.has(String(token || ''));
}

export const BINDING_KINDS = Object.freeze([
  { kind: 'runtime', label: 'Payroll runtime', hint: 'The owning module supplies the value while payroll computes.' },
  { kind: 'config', label: 'This configuration', hint: 'A numeric field on this record — the amount, rate or factor set above.' },
  { kind: 'reference', label: 'Reference source', hint: 'A row in a formula reference source, at the version effective on the payout date.' },
  { kind: 'fixed', label: 'Fixed value', hint: 'A constant that belongs to this configuration alone.' },
]);

const KIND_LABELS = Object.fromEntries(BINDING_KINDS.map(item => [item.kind, item.label]));

/* ------------------------------------------------------------- the modules */

/**
 * Which Services Information modules bind a computation, and which categories
 * of the library each one may draw on.
 *
 * `categories` is a filter, not a rule the library enforces: a Deduction
 * Configuration offers Deductions and Take-Home Pay formulas because those are
 * the ones that make sense against a deduction, and offering all 219 would make
 * the field unusable rather than more flexible.
 */
export const BINDABLE_MODULES = Object.freeze({
  basicPay: {
    label: 'Basic Pay & Pay Rates',
    categories: ['Basic Pay'],
    noun: 'pay rate',
    /** The amount the bound formula produces, in the words of this module. */
    produces: 'the rate this configuration publishes',
  },
  earnings: {
    label: 'Earnings',
    categories: ['Earnings', 'Basic Pay', 'Incentives', 'Benefits'],
    noun: 'earning',
    produces: 'the earning amount for the payroll period',
  },
  allowances: {
    label: 'Variable Allowances',
    categories: ['Earnings', 'Incentives', 'Benefits'],
    noun: 'allowance',
    produces: 'the allowance amount for the payroll period',
  },
  deductions: {
    label: 'Deductions',
    categories: ['Deductions', 'Take-Home Pay'],
    noun: 'deduction',
    produces: 'the amount collected in the payroll period',
  },
  bonuses: {
    label: 'Bonuses',
    categories: ['Bonus'],
    noun: 'bonus',
    produces: 'the bonus amount before the non-taxable ceiling is applied',
  },
  loans: {
    label: 'Company Loans',
    categories: ['Deductions'],
    noun: 'company loan',
    produces: 'the amortization collected in the payroll period',
  },
  governmentLoans: {
    label: 'Government Loans',
    categories: ['Deductions', 'Government'],
    noun: 'government loan',
    produces: 'the amortization collected in the payroll period',
  },
  leaveBenefits: {
    label: 'Benefits & Leave',
    categories: ['Benefits', 'Separation'],
    noun: 'leave or benefit policy',
    produces: 'the converted or reimbursed amount',
  },
  overtime: {
    label: 'Overtime',
    categories: ['Earnings'],
    noun: 'overtime policy',
    produces: 'the overtime amount for the hours rendered',
  },
});

export function isBindableModule(moduleKey) {
  return Object.hasOwn(BINDABLE_MODULES, moduleKey);
}

/**
 * The computations a module may bind: published, active, and in one of the
 * module's categories. A retired formula is never offered — binding a
 * configuration to something that no longer computes would fail at payroll
 * rather than here, which is the wrong end to find out.
 */
export function computationsForModule(moduleKey, library = []) {
  const definition = BINDABLE_MODULES[moduleKey];
  if (!definition) return [];
  const wanted = new Set(definition.categories);
  return library
    .filter(item => item && item.status !== 'Inactive')
    .filter(item => wanted.has(item.category))
    .sort((left, right) => String(left.code).localeCompare(String(right.code)));
}

/* ------------------------------------------------------------ the bindings */

const number = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

/**
 * A figure written the way a reference table writes it.
 *
 * `35,000.00` is thirty-five thousand, `5.00%` is the rate `0.05` — a
 * percentage bound to a rate token has to arrive as the decimal the formula
 * multiplies by, or `MIN(basic, ceiling) * rate` silently returns a number a
 * hundred times too large. Anything that is not a single figure — `1,875 + 20%`
 * from a tax bracket — returns `null` so the caller reports it rather than
 * quietly treating it as zero.
 */
export function numericFromText(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const percent = text.endsWith('%');
  const cleaned = (percent ? text.slice(0, -1) : text).replace(/[₱,\s]/g, '');
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return percent ? value / 100 : value;
}

/** One reference source row, by source code and row key. */
export function referenceEntryValue(references = [], referenceCode, entryKey) {
  // A binding still being filled in has no source or row yet. Saying so is the
  // instruction the admin needs; "reference source undefined is not configured"
  // describes a fault that is not there.
  if (!referenceCode) return { found: false, value: null, reason: 'No reference source is chosen yet.' };
  if (!entryKey) return { found: false, value: null, reason: `No row of ${referenceCode} is chosen yet.` };
  const source = references.find(item => String(item?.code) === String(referenceCode));
  if (!source) return { found: false, value: null, reason: `Reference source ${referenceCode} is not configured for this company.` };
  const entry = (source.entries || []).find(item => String(item?.key) === String(entryKey));
  if (!entry) return { found: false, value: null, reason: `${referenceCode} has no row named “${entryKey}”.` };
  const value = numericFromText(entry.value);
  if (value === null) return { found: false, value: null, reason: `${referenceCode} · ${entryKey} holds “${entry.value}”, which is not a single figure a formula can use.` };
  return { found: true, value, reason: '', label: `${source.code} · ${entry.key}`, version: source.version || '' };
}

/**
 * Every variable a bound formula needs, referenced computations followed
 * through. Binding `{{BAS-001}}` asks for monthly basic and factor days, not
 * for a daily rate the binder would have to work out by hand.
 */
export function bindableTokens(computationCode, library = []) {
  const computation = computationByCode(String(computationCode || '').toUpperCase(), library);
  if (!computation?.expression) return [];
  return resolvedFields(computation.expression, library);
}

/** The computations a bound formula builds on, for the "Builds on" caption. */
export function boundDependencies(computationCode, library = []) {
  const computation = computationByCode(String(computationCode || '').toUpperCase(), library);
  if (!computation?.expression) return [];
  return usedComputations(computation.expression);
}

/**
 * What a token binds to when nobody has said yet.
 *
 * The engine owns most of them, so `runtime` is the default wherever the engine
 * undertakes to supply the value. Otherwise the token looks for a numeric field
 * on this configuration whose name it plainly matches — `{{allowance_unit_rate}}`
 * against an `amount` field — and falls back to a fixed zero, which the
 * validator then refuses to publish until somebody sets it.
 */
export function defaultBindingForToken(token, configFields = []) {
  if (isEngineSupplied(token)) return { kind: 'runtime' };
  const candidates = configFields.map(field => field.key);
  const direct = candidates.find(key => key === token);
  if (direct) return { kind: 'config', field: direct };
  const normalised = String(token).replace(/_/g, '');
  const fuzzy = candidates.find(key => key.toLowerCase() === normalised)
    || candidates.find(key => normalised.includes(key.toLowerCase()) || key.toLowerCase().includes(normalised));
  if (fuzzy) return { kind: 'config', field: fuzzy };
  return { kind: 'fixed', value: '' };
}

/**
 * The stored bindings reconciled against the formula that is bound now.
 *
 * Changing the computation changes the variables, so a binding kept for a token
 * the new formula does not use is dropped and a token it does use arrives with
 * a sensible default. Reconciling rather than resetting is what lets an admin
 * switch `ERN-005` for a formula that shares most of its inputs without
 * re-binding the ones that did not change.
 */
export function normalizeBindings(record = {}, library = [], configFields = []) {
  const tokens = bindableTokens(record.computationCode, library);
  const stored = record.computationBindings && typeof record.computationBindings === 'object' ? record.computationBindings : {};
  return Object.fromEntries(tokens.map(token => [token, stored[token] || defaultBindingForToken(token, configFields)]));
}

/* ------------------------------------------------------------- resolution */

/**
 * Every bound variable resolved to a number, with the trail that produced it.
 *
 * `entries` is what both the binding table and the payroll "how was this figure
 * reached?" panel render, so a reviewer sees `{{allowance_unit_rate}} = 150 ·
 * This configuration › Default Amount` rather than an unexplained 150.
 */
export function resolveBindingValues({ record = {}, library = [], runtime = {}, references = [], configFields = [] } = {}) {
  const bindings = normalizeBindings(record, library, configFields);
  // The engine has no field catalogue to hand, so an unlabelled key still reads
  // as the field it names rather than as `undefined`.
  const labelOf = key => configFields.find(field => field.key === key)?.label || String(key);
  const entries = Object.entries(bindings).map(([token, binding]) => {
    const field = fieldMap[token];
    const base = { token, label: field?.label || token, kind: binding.kind, kindLabel: KIND_LABELS[binding.kind] || binding.kind, unit: field?.unit || '' };
    if (binding.kind === 'runtime') {
      const supplied = Object.hasOwn(runtime, token);
      return {
        ...base,
        value: supplied ? number(runtime[token]) : 0,
        resolved: supplied,
        source: field?.owner || 'Payroll runtime',
        // A token the engine never supplies is a binding mistake, not a missing
        // payroll input, so it is reported rather than defaulted to zero.
        problem: supplied ? '' : `${token} is not supplied by the payroll runtime. Bind it to this configuration, a reference source or a fixed value.`,
      };
    }
    if (binding.kind === 'config') {
      if (!binding.field) {
        return { ...base, value: 0, resolved: false, source: 'This configuration', problem: `No configuration field is chosen for ${token} yet.` };
      }
      const value = numericFromText(record[binding.field]);
      return {
        ...base,
        value: value ?? 0,
        resolved: value !== null,
        source: `This configuration › ${labelOf(binding.field)}`,
        problem: value === null ? `${labelOf(binding.field)} is empty or not a number, so ${token} cannot be resolved.` : '',
      };
    }
    if (binding.kind === 'reference') {
      const resolved = referenceEntryValue(references, binding.referenceCode, binding.entryKey);
      return {
        ...base,
        value: resolved.value ?? 0,
        resolved: resolved.found,
        source: resolved.label || `${binding.referenceCode || 'Reference source'} · ${binding.entryKey || '—'}`,
        version: resolved.version || '',
        problem: resolved.reason,
      };
    }
    const value = numericFromText(binding.value);
    return {
      ...base,
      value: value ?? 0,
      resolved: value !== null,
      source: 'Fixed value',
      problem: value === null ? `${token} is bound to a fixed value that is empty or not a number.` : '',
    };
  });
  return {
    bindings,
    entries,
    values: Object.fromEntries(entries.map(entry => [entry.token, entry.value])),
    unresolved: entries.filter(entry => !entry.resolved),
  };
}

/**
 * Why a binding cannot be saved yet, in the words the admin needs.
 *
 * `runtime` gaps are excluded on purpose when `atPayroll` is false: at
 * configuration time the engine has supplied nothing yet, and refusing to save
 * because `{{days_worked}}` has no value before payroll runs would make the
 * screen impossible to complete.
 */
export function bindingProblems({ record = {}, library = [], references = [], configFields = [], atPayroll = false } = {}) {
  const code = String(record.computationCode || '').trim();
  if (!code) return [];
  const computation = computationByCode(code.toUpperCase(), library);
  if (!computation) return [`${code} is not a published computation in this company's library.`];
  if (computation.status === 'Inactive') return [`${code} is inactive, so it cannot be bound to a configuration that computes.`];
  const runtime = atPayroll ? {} : Object.fromEntries(ENGINE_SUPPLIED_FIELDS.map(token => [token, 0]));
  const { entries } = resolveBindingValues({ record, library, runtime, references, configFields });
  return [...new Set(entries.map(entry => entry.problem).filter(Boolean))];
}

/**
 * Run a bound configuration and return the amount with its evidence.
 *
 * Returns `null` when nothing is bound, which is what keeps the binding
 * optional: a configuration with no `computationCode` behaves exactly as it did
 * before this module existed, and the engine falls back to its own arithmetic.
 */
export function evaluateBinding({ record = {}, library = [], runtime = {}, references = [], configFields = [] } = {}) {
  const code = String(record.computationCode || '').trim().toUpperCase();
  if (!code) return null;
  const computation = computationByCode(code, library);
  if (!computation?.expression || computation.status === 'Inactive') {
    return {
      code,
      amount: null,
      resolved: false,
      problem: computation
        ? `${code} is inactive, so ${record.name || 'this configuration'} could not be computed from it.`
        : `${code} is not published in this company's library, so ${record.name || 'this configuration'} could not be computed from it.`,
      entries: [],
    };
  }
  const { entries, values } = resolveBindingValues({ record, library, runtime, references, configFields });
  const blocked = entries.filter(entry => !entry.resolved);
  if (blocked.length) {
    return { code, amount: null, resolved: false, problem: blocked[0].problem, entries, computation };
  }
  try {
    const amount = Number(evaluateExpression(computation.expression, values, { library }).toFixed(2));
    return {
      code,
      amount,
      resolved: true,
      problem: '',
      entries,
      values,
      computation,
      version: computation.version || '',
      expression: computation.expression,
      name: computation.name,
      category: computation.category,
    };
  } catch (error) {
    return { code, amount: null, resolved: false, problem: error.message, entries, computation };
  }
}

/* --------------------------------------------------------------- summaries */

/** The one-line description a register row and a CSV export both show. */
export function bindingSummary(record = {}, library = []) {
  const code = String(record.computationCode || '').trim();
  if (!code) return 'Not bound';
  const computation = computationByCode(code.toUpperCase(), library);
  const bound = record.computationBindings && typeof record.computationBindings === 'object'
    ? Object.keys(record.computationBindings).length
    : 0;
  if (!computation) return `${code} · not published`;
  return `${code} · ${computation.name}${bound ? ` · ${bound} ${bound === 1 ? 'variable' : 'variables'}` : ''}`;
}

/** `{{token}} = 150 · This configuration › Default Amount`, for a payslip trail. */
export function describeBindingEntry(entry) {
  const shown = Number.isFinite(entry?.value) ? entry.value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—';
  return `{{${entry.token}}} = ${shown} · ${entry.source}`;
}
