/**
 * Benefits that sit beside the payroll run rather than inside it:
 *
 * - Fringe Benefit Tax on benefits given to managerial and supervisory
 *   employees (RR 3-98, as amended by TRAIN): the monetary value is grossed up
 *   by 65% and taxed at 35%, paid by the employer, and filed quarterly on BIR
 *   Form 1603Q.
 * - SSS maternity and sickness benefits, estimated from the approved leave
 *   (RA 11210 for maternity, with the employer's salary differential).
 *
 * Pure — the registers, the reports and the tests call the same functions.
 */

const round2 = value => Math.round((Number(value) || 0) * 100) / 100;

/* -------------------------------------------------------------------- FBT */

export const FBT_RATE = 0.35;
export const FBT_GROSS_UP = 0.65;

export function fringeBenefitTax(monetaryValue) {
  const value = Number(monetaryValue) || 0;
  const grossedUp = round2(value / FBT_GROSS_UP);
  return { monetaryValue: round2(value), grossedUp, fbt: round2(grossedUp * FBT_RATE) };
}

export const quarterOf = date => {
  const [year, month] = String(date || '').split('-').map(Number);
  return year && month ? `${year} Q${Math.ceil(month / 3)}` : '';
};

/** Fills the computed columns of a fringe benefit register row. */
export function withFbt(row) {
  const { grossedUp, fbt } = fringeBenefitTax(row.monetaryValue);
  return { ...row, grossedUpValue: String(grossedUp), fbtAmount: String(fbt) };
}

/** BIR 1603Q: one row per quarter with the grossed-up value and the FBT due. */
export function bir1603Rows(rows = []) {
  const quarters = new Map();
  rows.filter(row => row.status !== 'Cancelled').forEach(row => {
    const quarter = quarterOf(row.date);
    if (!quarter) return;
    const { monetaryValue, grossedUp, fbt } = fringeBenefitTax(row.monetaryValue);
    const entry = quarters.get(quarter) || { quarter, benefits: 0, monetaryValue: 0, grossedUp: 0, fbt: 0 };
    quarters.set(quarter, { ...entry, benefits: entry.benefits + 1, monetaryValue: round2(entry.monetaryValue + monetaryValue), grossedUp: round2(entry.grossedUp + grossedUp), fbt: round2(entry.fbt + fbt) });
  });
  return [...quarters.values()].sort((left, right) => left.quarter.localeCompare(right.quarter));
}

/* ----------------------------------------------- SSS maternity / sickness */

export const SSS_BENEFIT_TYPES = Object.freeze({
  'Maternity — live birth (105 days)': { kind: 'Maternity', days: 105 },
  'Maternity — solo parent (120 days)': { kind: 'Maternity', days: 120 },
  'Maternity — miscarriage or ET (60 days)': { kind: 'Maternity', days: 60 },
  Sickness: { kind: 'Sickness', days: null },
});

/**
 * An estimate for planning and the salary differential, not the SSS
 * computation itself: the average daily salary credit is taken as six months
 * at the employee's salary credit (capped at the maximum MSC) over 180 days.
 * Maternity pays 100% of it for the benefit days and the employer pays the
 * difference up to full salary; sickness pays 90% from the fourth day.
 */
export function sssBenefitEstimate({ benefitType, monthlySalary, days, maxMsc = 35000 }) {
  const type = SSS_BENEFIT_TYPES[benefitType] || SSS_BENEFIT_TYPES['Maternity — live birth (105 days)'];
  const monthly = Number(monthlySalary) || 0;
  const adsc = round2(Math.min(monthly, maxMsc) * 6 / 180);
  const benefitDays = type.days ?? Math.max(0, (Number(days) || 0));
  if (type.kind === 'Sickness') {
    const paidDays = Math.max(0, benefitDays - 3);
    return { kind: type.kind, adsc, benefitDays: paidDays, sssBenefit: round2(adsc * 0.9 * paidDays), salaryDifferential: 0 };
  }
  const sssBenefit = round2(adsc * benefitDays);
  const fullSalary = round2(monthly / 30 * benefitDays);
  return { kind: type.kind, adsc, benefitDays, sssBenefit, fullSalary, salaryDifferential: round2(Math.max(0, fullSalary - sssBenefit)) };
}

/** Fills the computed columns of an SSS benefit register row. */
export function withSssEstimate(row) {
  const estimate = sssBenefitEstimate(row);
  const fixedDays = SSS_BENEFIT_TYPES[row.benefitType]?.days;
  return { ...row, days: fixedDays ? String(fixedDays) : row.days, averageDailySalaryCredit: String(estimate.adsc), sssBenefit: String(estimate.sssBenefit), salaryDifferential: String(estimate.salaryDifferential) };
}
