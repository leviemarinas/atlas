import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Binding a Computational Basis formula to a Services Information
 * configuration.
 *
 * The point of these tests is that the binding is load-bearing: a bound earning
 * computes from its formula rather than from the amount typed beside it, a
 * variable bound to a reference row picks up the figure that row publishes, and
 * a binding that cannot resolve is reported rather than silently paying zero.
 */

const {
  BINDABLE_MODULES,
  ENGINE_SUPPLIED_FIELDS,
  bindableTokens,
  bindingProblems,
  bindingSummary,
  computationsForModule,
  defaultBindingForToken,
  evaluateBinding,
  isEngineSupplied,
  normalizeBindings,
  numericFromText,
  referenceEntryValue,
  resolveBindingValues,
} = await import('../src/computationBindings.js');

const { seedComputations } = await import('../src/computationCatalog.js');
const {
  boundResolverFor,
  earningItemsFor,
  collectionItemsFor,
  runtimeContractGaps,
  runtimeFieldsFor,
} = await import('../src/payrollEngine.js');

const library = seedComputations();

const references = [
  {
    code: 'REF-008',
    name: 'Overtime Premium Rates',
    version: '2.0',
    entries: [
      { key: 'Regular overtime', value: '1.25', note: '' },
      { key: 'Employee rate', value: '5.00%', note: '' },
      { key: 'Compensation ceiling', value: '35,000.00', note: '' },
      { key: 'Monthly bracket', value: '1,875 + 20%', note: '' },
    ],
  },
];

/* ------------------------------------------------------------- the figures */

test('a reference figure is read the way the table writes it', () => {
  assert.equal(numericFromText('35,000.00'), 35000);
  assert.equal(numericFromText('₱1,200'), 1200);
  assert.equal(numericFromText('1.25'), 1.25);
  // A rate published as a percentage has to arrive as the decimal the formula
  // multiplies by, or MIN(basic, ceiling) * rate is a hundred times too large.
  assert.equal(numericFromText('5.00%'), 0.05);
  // A bracket is not a single figure, so it is refused rather than read as 1875.
  assert.equal(numericFromText('1,875 + 20%'), null);
  assert.equal(numericFromText(''), null);
});

test('a reference row that cannot be used says which row and why', () => {
  const good = referenceEntryValue(references, 'REF-008', 'Compensation ceiling');
  assert.equal(good.found, true);
  assert.equal(good.value, 35000);

  const bracket = referenceEntryValue(references, 'REF-008', 'Monthly bracket');
  assert.equal(bracket.found, false);
  assert.match(bracket.reason, /not a single figure/);

  const missingRow = referenceEntryValue(references, 'REF-008', 'Nope');
  assert.match(missingRow.reason, /has no row named/);

  const missingSource = referenceEntryValue(references, 'REF-999', 'Anything');
  assert.match(missingSource.reason, /is not configured for this company/);
});

/* ------------------------------------------------------------ the variables */

test('a bound formula asks for the variables of its whole reference chain', () => {
  // ERN-002 is hourly_rate * ot_hours * ot_rate, and hourly_rate is BAS-002,
  // which is BAS-001 / work_hours. The binder is asked for monthly basic and
  // factor days, not for a daily rate it would have to work out by hand.
  const tokens = bindableTokens('ERN-002', library);
  assert.ok(tokens.includes('ot_hours'));
  assert.ok(tokens.includes('ot_rate'));
  assert.ok(!tokens.includes('BAS-002'), 'a referenced computation is followed, not bound');
});

test('a variable defaults to the runtime only where the engine supplies it', () => {
  assert.deepEqual(defaultBindingForToken('ot_hours', []), { kind: 'runtime' });
  assert.equal(isEngineSupplied('ot_hours'), true);
  // allowance_unit_rate is not something payroll can produce, so it falls to
  // the configuration and finds the field whose name it plainly matches.
  assert.equal(isEngineSupplied('allowance_unit_rate'), false);
  const configFields = [{ key: 'amount', label: 'Default Amount' }];
  assert.deepEqual(defaultBindingForToken('allowance_units', configFields), { kind: 'fixed', value: '' });
});

test('switching the bound formula reconciles the variables rather than resetting them', () => {
  const record = {
    computationCode: 'ERN-005',
    computationBindings: {
      allowance_units: { kind: 'fixed', value: '20' },
      // A variable ERN-005 does not use, left over from an earlier formula.
      late_minutes: { kind: 'runtime' },
    },
  };
  const bindings = normalizeBindings(record, library, []);
  assert.ok(Object.hasOwn(bindings, 'allowance_units'));
  assert.ok(Object.hasOwn(bindings, 'allowance_unit_rate'));
  assert.equal(Object.hasOwn(bindings, 'late_minutes'), false, 'a stale binding is dropped');
  assert.deepEqual(bindings.allowance_units, { kind: 'fixed', value: '20' }, 'a live binding is kept');
});

/* ------------------------------------------------------------- the modules */

test('a module offers only published, active formulas from its own categories', () => {
  const offered = computationsForModule('deductions', library);
  assert.ok(offered.length > 0);
  assert.ok(offered.every(item => BINDABLE_MODULES.deductions.categories.includes(item.category)));
  assert.ok(offered.every(item => item.status !== 'Inactive'), 'a retired formula is never offered');
  assert.ok(offered.some(item => item.code === 'DED-001'));
  assert.ok(!offered.some(item => item.code === 'ERN-002'), 'an earning formula is not offered to a deduction');
});

/* ------------------------------------------------------------ resolution */

test('every variable resolves to a number with the source that produced it', () => {
  const record = {
    name: 'Meal Allowance',
    amount: '150',
    computationCode: 'ERN-005',
    computationBindings: {
      allowance_units: { kind: 'fixed', value: '20' },
      allowance_unit_rate: { kind: 'config', field: 'amount' },
    },
  };
  const { entries, values } = resolveBindingValues({
    record, library, runtime: {}, references,
    configFields: [{ key: 'amount', label: 'Default Amount' }],
  });
  assert.deepEqual(values, { allowance_units: 20, allowance_unit_rate: 150 });
  const rate = entries.find(entry => entry.token === 'allowance_unit_rate');
  assert.equal(rate.source, 'This configuration › Default Amount');
  assert.equal(rate.resolved, true);
});

test('a bound configuration computes its amount from the formula', () => {
  const record = {
    name: 'Meal Allowance',
    amount: '150',
    computationCode: 'ERN-005',
    computationBindings: {
      allowance_units: { kind: 'fixed', value: '20' },
      allowance_unit_rate: { kind: 'config', field: 'amount' },
    },
  };
  const result = evaluateBinding({ record, library, runtime: {}, references, configFields: [] });
  assert.equal(result.resolved, true);
  assert.equal(result.amount, 3000);
  assert.equal(result.code, 'ERN-005');
  assert.equal(result.version, '1.0');
});

test('a variable bound to a reference row picks up the figure that row publishes', () => {
  const record = {
    name: 'Overtime Pay',
    computationCode: 'ERN-002',
    computationBindings: {
      hourly_rate: { kind: 'fixed', value: '200' },
      ot_hours: { kind: 'fixed', value: '4' },
      ot_rate: { kind: 'reference', referenceCode: 'REF-008', entryKey: 'Regular overtime' },
    },
  };
  const result = evaluateBinding({ record, library, runtime: {}, references, configFields: [] });
  assert.equal(result.resolved, true);
  assert.equal(result.amount, 1000, '200 × 4 × the 1.25 the reference publishes');
});

test('an unresolved variable blocks the amount and names the reason', () => {
  const record = {
    name: 'Meal Allowance',
    computationCode: 'ERN-005',
    computationBindings: {
      allowance_units: { kind: 'fixed', value: '20' },
      // Bound to a configuration field that carries nothing.
      allowance_unit_rate: { kind: 'config', field: 'amount' },
    },
  };
  const result = evaluateBinding({ record, library, runtime: {}, references, configFields: [] });
  assert.equal(result.resolved, false);
  assert.equal(result.amount, null, 'a half-bound formula produces no figure at all');
  assert.match(result.problem, /cannot be resolved/);
});

test('binding to an inactive or unpublished formula is refused', () => {
  const inactive = library.map(item => (item.code === 'DED-003' ? { ...item, status: 'Inactive' } : item));
  assert.deepEqual(
    bindingProblems({ record: { computationCode: 'NOPE-001' }, library, references, configFields: [] }),
    ['NOPE-001 is not a published computation in this company\'s library.']);
  assert.deepEqual(
    bindingProblems({ record: { computationCode: 'DED-003' }, library: inactive, references, configFields: [] }),
    ['DED-003 is inactive, so it cannot be bound to a configuration that computes.']);
});

test('a binding still being filled in says what is missing, not "undefined"', () => {
  const halfBound = {
    computationCode: 'ERN-005',
    computationBindings: {
      // The source kind is chosen but the field and the row are not yet.
      allowance_units: { kind: 'config' },
      allowance_unit_rate: { kind: 'reference', referenceCode: '', entryKey: '' },
    },
  };
  const problems = bindingProblems({ record: halfBound, library, references, configFields: [] });
  assert.deepEqual(problems, [
    'No configuration field is chosen for allowance_units yet.',
    'No reference source is chosen yet.',
  ]);
  assert.ok(problems.every(problem => !/undefined/.test(problem)));

  const noRow = referenceEntryValue(references, 'REF-008', '');
  assert.equal(noRow.reason, 'No row of REF-008 is chosen yet.');
});

test('a configuration that binds nothing is not a problem', () => {
  assert.deepEqual(bindingProblems({ record: { name: 'Uniform' }, library, references, configFields: [] }), []);
  assert.equal(evaluateBinding({ record: { name: 'Uniform' }, library }), null);
  assert.equal(bindingSummary({ name: 'Uniform' }, library), 'Not bound');
});

test('the summary names the formula and how many variables it binds', () => {
  const record = { computationCode: 'ERN-005', computationBindings: { allowance_units: {}, allowance_unit_rate: {} } };
  assert.equal(bindingSummary(record, library), 'ERN-005 · Variable Allowance by Unit · 2 variables');
});

/* --------------------------------------------------------- the engine side */

test('the engine supplies every field the binding contract publishes', () => {
  const runtime = runtimeFieldsFor({
    employee: { employeeId: 'E1', yearsOfService: 8, ytd: {} },
    pay: {}, attendance: { overtimeByType: {} }, context: {}, override: {},
    rates: { monthlyRate: 30000, basicPay: 15000, dailyRate: 1379.31, hourlyRate: 172.41, factorDays: 261, workHours: 8 },
  });
  assert.deepEqual(runtimeContractGaps(runtime), [], 'a token bound to the runtime must have a value');
  assert.equal(runtime.monthly_basic, 30000);
  assert.equal(runtime.rounded_years_service, 8);
});

test('a bound earning is priced by its formula, not by the amount beside it', () => {
  const context = {
    computations: library,
    references,
    serviceConfig: {
      earnings: [{
        code: 'ALL-002', name: 'Meal Allowance', status: 'Active', amount: '150',
        computationCode: 'ERN-005',
        computationBindings: {
          allowance_units: { kind: 'fixed', value: '20' },
          allowance_unit_rate: { kind: 'config', field: 'amount' },
        },
      }],
    },
  };
  const resolveBound = boundResolverFor(context, {});
  const items = earningItemsFor({
    salary: { earnings: [{ earningCode: 'ALL-002', earningName: 'Meal Allowance', classification: 'Taxable Allowance', frequency: 'Semi-monthly', earningsAmount: 999 }] },
    transaction: { paymentMode: 'Semi-monthly', frequency: 'First Half', periodEnd: '2026-08-15' },
    employee: { code: '0000112345' },
    resolveBound,
  });
  const meal = items.find(item => item.code === 'ALL-002');
  assert.equal(meal.amount, 3000, 'the bound formula wins over the configured 999');
  assert.equal(meal.boundCode, 'ERN-005');
  assert.equal(meal.boundValues.allowance_unit_rate, 150);
});

test('an amount encoded on the transaction is never overwritten by a binding', () => {
  const context = {
    computations: library,
    serviceConfig: {
      earnings: [{
        code: 'ALL-002', name: 'Meal Allowance', status: 'Active', amount: '150',
        computationCode: 'ERN-005',
        computationBindings: {
          allowance_units: { kind: 'fixed', value: '20' },
          allowance_unit_rate: { kind: 'config', field: 'amount' },
        },
      }],
    },
  };
  const items = earningItemsFor({
    salary: { earnings: [] },
    manual: [{ code: 'ALL-002', name: 'Meal Allowance', classification: 'Taxable Allowance', amount: 500 }],
    transaction: { paymentMode: 'Semi-monthly', frequency: 'First Half', periodEnd: '2026-08-15' },
    employee: { code: '0000112345' },
    resolveBound: boundResolverFor(context, {}),
  });
  assert.equal(items.find(item => item.code === 'ALL-002').amount, 500, 'an instruction is not a default');
});

test('an inactive configuration keeps the built-in payroll treatment', () => {
  const context = {
    computations: library,
    serviceConfig: {
      earnings: [{
        code: 'ALL-002', name: 'Meal Allowance', status: 'Inactive', amount: '150',
        computationCode: 'ERN-005',
        computationBindings: { allowance_units: { kind: 'fixed', value: '20' }, allowance_unit_rate: { kind: 'config', field: 'amount' } },
      }],
    },
  };
  assert.equal(boundResolverFor(context, {})('ALL-002'), null);
});

test('a bound deduction still never collects more than the balance outstanding', () => {
  const context = {
    computations: library,
    serviceConfig: {
      deductions: [{
        code: 'DED-900', name: 'Uniform Amortization', status: 'Active', amount: '5000',
        computationCode: 'DED-001',
        computationBindings: {
          daily_rate: { kind: 'config', field: 'amount' },
          absent_days: { kind: 'fixed', value: '2' },
        },
      }],
    },
  };
  const collections = collectionItemsFor({
    salary: { companyDeductions: [] },
    registerDeductions: [{ code: 'DED-900', name: 'Uniform Amortization', status: 'Active', employee: '0000112345', amount: 400, balance: 1200 }],
    transaction: { payoutDate: '2026-08-20' },
    employee: { code: '0000112345', employeeId: 'E1' },
    resolveBound: boundResolverFor(context, {}),
  });
  const uniform = collections.find(item => item.code === 'DED-900');
  assert.equal(uniform.boundCode, 'DED-001');
  // The formula says 10,000 is due; only 1,200 is still owed, so 1,200 collects.
  assert.equal(uniform.due, 1200);
});

test('a binding that cannot resolve reports itself instead of paying zero', () => {
  const context = {
    computations: library,
    serviceConfig: {
      earnings: [{
        code: 'ALL-002', name: 'Meal Allowance', status: 'Active',
        computationCode: 'ERN-005',
        computationBindings: {
          allowance_units: { kind: 'fixed', value: '20' },
          allowance_unit_rate: { kind: 'reference', referenceCode: 'REF-008', entryKey: 'Monthly bracket' },
        },
      }],
    },
    references,
  };
  const items = earningItemsFor({
    salary: { earnings: [{ earningCode: 'ALL-002', earningName: 'Meal Allowance', classification: 'Taxable Allowance', frequency: 'Semi-monthly', earningsAmount: 300 }] },
    transaction: { paymentMode: 'Semi-monthly', frequency: 'First Half', periodEnd: '2026-08-15' },
    employee: { code: '0000112345' },
    resolveBound: boundResolverFor(context, {}),
  });
  const meal = items.find(item => item.code === 'ALL-002');
  assert.match(meal.boundProblem, /not a single figure/);
  assert.equal(meal.amount, 300, 'the configured amount stands so the run can still complete');
});

test('a run with no bound configuration behaves exactly as it did before', () => {
  const resolveBound = boundResolverFor({ computations: library, serviceConfig: {} }, {});
  assert.equal(resolveBound('ALL-002'), null);
  const items = earningItemsFor({
    salary: { earnings: [{ earningCode: 'ALL-002', earningName: 'Meal Allowance', classification: 'Taxable Allowance', frequency: 'Semi-monthly', earningsAmount: 300 }] },
    transaction: { paymentMode: 'Semi-monthly', frequency: 'First Half', periodEnd: '2026-08-15' },
    employee: { code: '0000112345' },
    resolveBound,
  });
  // A semi-monthly earning is already a per-period figure, so it is paid whole.
  assert.equal(items[0].amount, 300, 'the configured amount is what the run applies');
  assert.equal(items[0].boundCode, undefined);
});

test('every field the contract publishes is a field the catalogue knows', async () => {
  const { fieldMap } = await import('../src/computationCatalog.js');
  const unknown = ENGINE_SUPPLIED_FIELDS.filter(field => !fieldMap[field]);
  assert.deepEqual(unknown, [], 'the runtime cannot promise a field the palette does not offer');
});
