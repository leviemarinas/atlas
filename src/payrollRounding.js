/**
 * Company decimal places for payroll amounts (Company Information › Services
 * Information › Payroll Information › Rounding Off, and › Time and Attendance ›
 * Rounding Off). Each setting is kept per company; an unset one is 2 decimals,
 * which is what payroll rounded to before the settings existed.
 */
import { readActiveCompanyId } from './companyRepository.js';

export const PAYROLL_ROUNDING_KEY = 'atlas-core-si-payroll-rounding-v1';
export const TIMEKEEPING_ROUNDING_KEY = 'atlas-core-si-rounding-v1';

export const DEFAULT_ROUNDING = Object.freeze({
  earnings: 2, deductions: 2, loans: 2, bonuses: 2, basicPay: 2,
  overtime: 2, absence: 2, tardiness: 2, undertime: 2,
});

const places = value => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : 2;
};

/** Round half away from zero to `digits` decimals, without binary float drift (1.005 → 1.01). */
export function roundTo(value, digits = 2) {
  const number = Number(value) || 0;
  const sign = number < 0 ? -1 : 1;
  const shifted = Math.round(Number(`${Math.abs(number)}e${digits}`));
  return sign * Number(`${shifted}e-${digits}`) || 0;
}

/** The nine decimal-place settings for a company, each a whole number from 0 to 6. */
export function readPayrollRounding(companyId, storage = globalThis.localStorage) {
  const id = companyId || readActiveCompanyId();
  const read = key => { try { return JSON.parse(storage?.getItem(`${key}:${id}`)) || {}; } catch { return {}; } };
  const saved = { ...read(TIMEKEEPING_ROUNDING_KEY), ...read(PAYROLL_ROUNDING_KEY) };
  return Object.fromEntries(Object.keys(DEFAULT_ROUNDING).map(key => [key, places(saved[key] ?? DEFAULT_ROUNDING[key])]));
}

/** Which setting prices a payroll step: attendance codes first, then the step's category. */
export function roundingKeyFor({ code = '', category = '' } = {}) {
  if (code === 'DED-001') return 'absence';
  if (code === 'DED-002') return 'tardiness';
  if (code === 'DED-003') return 'undertime';
  if (['ERN-002', 'ERN-003', 'ERN-006'].includes(code)) return 'overtime';
  if (category === 'Basic Pay') return 'basicPay';
  if (category === 'Bonus') return 'bonuses';
  if (category === 'Earnings') return 'earnings';
  if (category === 'Deductions') return 'deductions';
  return '';
}

/** Decimal places for a step; anything that is not a pay item (tax, statutory, totals) stays at 2. */
export const placesForStep = (step, rounding = DEFAULT_ROUNDING) => rounding[roundingKeyFor(step)] ?? 2;
