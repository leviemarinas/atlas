/**
 * What a setup form refuses before it saves (Earning, Bonus, Deduction, Company Loan, Basic Pay,
 * Allowance, Payroll Control). Pure, so the screen and the tests apply the same rules.
 *
 * The limits are the ones a payroll cannot work without: an amount is never negative, a percentage never
 * passes 100, a term is a whole number of months, the hours in a day are 24 at most, and an end date does
 * not come before its start. Any wider limit (a maximum principal, a maximum term) is for P&A to set.
 */

const present = value => value !== undefined && value !== null && String(value).trim() !== '';
const isNumber = value => present(value) && Number.isFinite(Number(value));

/** [field, minimum, maximum, whole number?, minimum is exclusive?] for the fields that carry a limit. */
export const CONFIG_LIMITS = Object.freeze({
  earnings: [['defaultAmount', 0, null], ['minimumAbsent', 0, null, true], ['workDays', 0, 366, true]],
  bonuses: [['amount', 0, null]],
  deductions: [['amount', 0, null]],
  loans: [['principal', 0, null, false, true], ['interest', 0, 100], ['terms', 1, null, true], ['interestAmount', 0, null], ['amortization', 0, null, false, true]],
  basicPay: [['factorDays', 1, 366, true], ['workHours', 0, 24, false, true]],
  allowances: [['amount', 0, null], ['factorDays', 1, 366, true], ['workHours', 0, 24, false, true]],
  payrollControls: [['approvalLevels', 1, 6, true], ['factorDays', 1, 366, true], ['workHoursPerDay', 0, 24, false, true], ['employeeRate', 0, 100], ['employerRate', 0, 100]],
});

/** Pairs of dates that must run in order: [start, end]. */
const DATE_ORDER = Object.freeze({
  earnings: [['startDate', 'endDate']],
  bonuses: [['startDate', 'endDate'], ['dateStart', 'dateEnd']],
  deductions: [['startDate', 'endDate']],
  loans: [['startDate', 'endDate']],
});

const rangeText = (minimum, maximum, exclusive, whole) => {
  const kind = whole ? 'a whole number' : 'a number';
  if (maximum === null) return exclusive ? `${kind} above ${minimum}` : `${kind} of ${minimum} or more`;
  return exclusive ? `${kind} above ${minimum} and up to ${maximum}` : `${kind} from ${minimum} to ${maximum}`;
};

/** The longest a code and any other text field can be on a setup form. */
export const CODE_MAX_LENGTH = 20;
export const TEXT_MAX_LENGTH = 100;
export const maxLengthOf = field => (field.key === 'code' ? CODE_MAX_LENGTH : TEXT_MAX_LENGTH);

export function configFieldProblems(moduleKey, draft = {}, steps = []) {
  const problems = [];
  const fields = steps.flatMap(step => step.fields);
  const visible = field => !field.visible || field.visible(draft);
  const labelOf = key => fields.find(field => field.key === key)?.label || key;

  fields.filter(visible).forEach(field => {
    const type = field.type ?? 'text';
    if (field.required && ['text', 'textarea', 'date'].includes(type) && !present(draft[field.key])) problems.push(`${field.label} is required.`);
    if (type === 'number' && present(draft[field.key]) && !isNumber(draft[field.key])) problems.push(`${field.label} must be a number.`);
    if (type === 'text' && String(draft[field.key] ?? '').trim().length > maxLengthOf(field)) problems.push(`${field.label} can have at most ${maxLengthOf(field)} characters.`);
  });

  (CONFIG_LIMITS[moduleKey] || []).forEach(([key, minimum, maximum, whole = false, exclusive = false]) => {
    const field = fields.find(item => item.key === key);
    if (!field || !visible(field) || !isNumber(draft[key])) return;
    const value = Number(draft[key]);
    const belowMinimum = exclusive ? value <= minimum : value < minimum;
    const wrongKind = whole && !Number.isInteger(value);
    if (belowMinimum || (maximum !== null && value > maximum) || wrongKind) problems.push(`${field.label} must be ${rangeText(minimum, maximum, exclusive, whole)}.`);
  });

  // A percentage basis keeps the default amount inside 0 to 100.
  if (moduleKey === 'deductions' && /^Percentage/.test(draft.basis || '') && isNumber(draft.amount) && Number(draft.amount) > 100) {
    problems.push('Default Amount / Rate is a percentage here, so it must be from 0 to 100.');
  }

  (DATE_ORDER[moduleKey] || []).forEach(([start, end]) => {
    if (present(draft[start]) && present(draft[end]) && String(draft[end]) < String(draft[start])) problems.push(`${labelOf(end)} cannot be before ${labelOf(start)}.`);
  });
  return [...new Set(problems)];
}

/**
 * Whether a configuration has already been used by a payroll transaction that is still standing.
 * Delete is allowed only while it has not (Project Plan: "Delete, applicable if not yet used in payroll processing").
 */
export function usedInPayroll(record = {}, runs = []) {
  const code = String(record.code || '').trim();
  const name = String(record.name || '').trim();
  if (!code && !name) return null;
  return runs.find(run => run?.status !== 'Cancelled' && run?.result && (() => {
    const text = JSON.stringify(run.result.lines || []);
    return (code && text.includes(`"code":${JSON.stringify(code)}`)) || (name && text.includes(`"name":${JSON.stringify(name)}`));
  })()) || null;
}

/**
 * What is wrong with the Take-Home Pay policy's own fields. A percentage is from 0 to 100, a peso amount is
 * not negative and a number of days is a whole number, so the screen can name the field and hold the save.
 */
export function takeHomeFieldProblems(policy = {}) {
  const problems = [];
  const check = (label, type, value) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (text === '' || !Number.isFinite(Number(text))) { problems.push(`${label} must be a number.`); return; }
    const amount = Number(text);
    if (type === 'Percentage' && (amount < 0 || amount > 100)) problems.push(`${label} is a percentage, so it must be from 0 to 100.`);
    else if (type === 'Fixed Amount' && amount < 0) problems.push(`${label} must be 0 pesos or more.`);
    else if (type === 'Number of Days' && (amount < 0 || !Number.isInteger(amount))) problems.push(`${label} must be a whole number of days, 0 or more.`);
  };
  check('Threshold', policy.thresholdType, policy.threshold);
  if (policy.deductionCapEnabled) check('Deductions cap', policy.deductionCapType, policy.deductionCap);
  check('Loan cap', policy.loanCapType, policy.loanCap);
  check('Attendance cap', policy.attendanceCapType, policy.attendanceCap);
  // The recovery plan for deferred amounts, when a deferred amount is carried forward.
  const recovery = policy.recovery;
  if (policy.carryForward && recovery) {
    const whole = (label, value, minimum) => {
      if (value === undefined || value === null) return;
      const text = String(value).trim();
      if (text === '' || !Number.isFinite(Number(text))) problems.push(`${label} must be a number.`);
      else if (!Number.isInteger(Number(text)) || Number(text) < minimum) problems.push(`${label} must be a whole number of ${minimum} or more.`);
    };
    const amount = (label, value, exclusive) => {
      if (value === undefined || value === null) return;
      const text = String(value).trim();
      if (text === '' || !Number.isFinite(Number(text))) problems.push(`${label} must be a number.`);
      else if (exclusive ? Number(text) <= 0 : Number(text) < 0) problems.push(`${label} must be ${exclusive ? 'more than 0' : '0 pesos or more'}.`);
    };
    if (recovery.method === 'Scheduled installments') whole('Number of installments', recovery.installments, 1);
    if (['Fixed staggered amount per payroll', 'Partial deduction up to the available amount'].includes(recovery.method)) amount('Fixed amount per payroll', recovery.fixedAmount, true);
    amount('Staggering threshold', recovery.staggerThreshold, false);
  }
  return problems;
}

/** [field, minimum, maximum, whole number?, minimum is exclusive?] for the Employee Masterfile payroll entries. */
export const ENTRY_LIMITS = Object.freeze({
  basicPay: [['amount', 0, null, false, true], ['workDays', 1, 366, true], ['workHours', 0, 24, false, true], ['ecola', 0, null], ['startYear', 1000, 9999, true]],
  earnings: [['amount', 0, null]],
  bonuses: [['amount', 0, null], ['transactionThreshold', 0, null], ['annualThreshold', 0, null], ['hierarchyPriority', 1, null, true]],
  deductions: [['amount', 0, null, false, true], ['count', 0, null, true], ['total', 0, null]],
  loans: [['amount', 0, null, false, true], ['principal', 0, null, false, true], ['accumulatedManual', 0, null], ['accumulatedComputed', 0, null]],
  statutory: [['employee', 0, null], ['employer', 0, null]],
  hdmf: [['employee', 0, null], ['employer', 0, null]],
  ytd: [['year', 2000, 2100, true], ['grossPay', 0, null], ['basicPay', 0, null], ['taxableIncome', 0, null], ['taxableBonus', 0, null], ['nonTaxableBonus', 0, null], ['deMinimis', 0, null], ['otherTaxable', 0, null], ['otherNonTaxable', 0, null], ['statutoryEmployee', 0, null], ['companyDeductions', 0, null], ['loanPayments', 0, null], ['taxWithheld', 0, null], ['netPay', 0, null]],
  previousEmployer: [['employmentYear', 2000, 2100, true], ['lastSalary', 0, null], ['basicPay', 0, null], ['taxableBonus', 0, null], ['otherTaxable', 0, null], ['grossTaxable', 0, null], ['nonTaxableBonus', 0, null], ['deMinimis', 0, null], ['allowableDeductions', 0, null], ['otherNonTaxable', 0, null], ['insurancePremium', 0, null], ['taxWithheld', 0, null]],
});
const ENTRY_DATE_ORDER = Object.freeze({ earnings: [['start', 'end']], deductions: [['startDate', 'endDate']], loans: [['startDate', 'endDate']], statutory: [['startDate', 'endDate']], previousEmployer: [['startDate', 'endDate']] });

/**
 * What an Employee Masterfile payroll entry (Basic Pay, Earnings, Bonuses, Company Deductions, Loans) refuses
 * before it saves: text that is only spaces, a number that is not a number, an amount outside its limit, an
 * end date before its start. `fields` are the section's [key, label, type] rows; `requiredKeys` the ones it requires.
 */
export function entryProblems(sectionKey, draft = {}, fields = [], requiredKeys = []) {
  const problems = [];
  const labelOf = key => fields.find(field => field[0] === key)?.[1] || key;
  fields.forEach(([key, label, type = 'text']) => {
    if (requiredKeys.includes(key) && ['text', 'textarea'].includes(type) && !present(draft[key])) problems.push(`${label} is required.`);
    if (type === 'number' && present(draft[key]) && !isNumber(draft[key])) problems.push(`${label} must be a number.`);
  });
  (ENTRY_LIMITS[sectionKey] || []).forEach(([key, minimum, maximum, whole = false, exclusive = false]) => {
    if (!fields.some(field => field[0] === key) || !isNumber(draft[key])) return;
    const value = Number(draft[key]);
    const below = exclusive ? value <= minimum : value < minimum;
    if (below || (maximum !== null && value > maximum) || (whole && !Number.isInteger(value))) problems.push(`${labelOf(key)} must be ${rangeText(minimum, maximum, exclusive, whole)}.`);
  });
  (ENTRY_DATE_ORDER[sectionKey] || []).forEach(([start, end]) => {
    const normal = value => {
      const text = String(value || '').trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
      const parts = text.split(/[/-]/);
      return parts.length === 3 && parts[2].length === 4 ? `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}` : text;
    };
    if (present(draft[start]) && present(draft[end]) && normal(draft[end]) < normal(draft[start])) problems.push(`${labelOf(end)} cannot be before ${labelOf(start)}.`);
  });
  return [...new Set(problems)];
}
