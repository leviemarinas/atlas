/**
 * Gross Up: the gross amount that leaves an employee a guaranteed net.
 *
 * Gen Olan's comments on the Gross Up slides asked for four separate methods (Periodic Compensation,
 * Annualized Compensation, Final Tax, Expanded Tax); a target that says whether it is one earning or
 * allowance or the employee's total net pay; a shared tax split that shows the employee share, the
 * employer share and the total employer cost; a choice of how SSS, PhilHealth and Pag-IBIG are treated;
 * a target entered in a foreign currency with its rate and source; and a proof for every method that
 * gross less employee tax and deductions equals the agreed net.
 *
 * This file is the scenario calculator the setup screen shows. The rules it shares with the payroll
 * engine (the policy shape, the approved rates and the solver) live in `grossUpCore.js`.
 */
import { annualTax, withholdingTax } from './statutoryService.js';
import {
  CUSTOM_INCOME, approvedRate, convertTarget, grossUpFieldProblems, incomesFor, normalizeGrossUpPolicy, number, round2, settleGross, solveGross,
} from './grossUpCore.js';

export * from './grossUpCore.js';

export function grossUpResult(rawPolicy, rawTest) {
  const policy = normalizeGrossUpPolicy(rawPolicy);
  const test = rawTest ? { ...policy.test, ...rawTest } : policy.test;
  const problems = [...grossUpFieldProblems(rawPolicy)];

  const currency = convertTarget(test);
  if (currency.foreign) {
    if (!(currency.rate > 0)) problems.push(`Give the exchange rate for ${currency.code} so the target can be converted to pesos.`);
    if (!currency.rateDate) problems.push('Give the date of the exchange rate.');
    if (!String(currency.rateSource || '').trim()) problems.push('Give where the exchange rate came from, such as the BSP reference rate.');
  }
  const targetNet = currency.converted;
  if (!problems.some(message => /exchange rate|rate date|rate source|Give/.test(message)) && !(targetNet > 0)) problems.push('Enter the guaranteed net as an amount above zero.');

  const method = policy.method;
  const rate = approvedRate(method, policy.incomeType, policy.flatRate);
  const flatMethod = method === 'Final Tax' || method === 'Expanded Tax';
  if (flatMethod && rate === null) problems.push(`Choose the income type so the approved ${method.toLowerCase()} rate can be applied.`);

  const treatment = policy.deductionTreatment;
  const contributions = treatment === 'Handled outside the Gross Up' ? 0 : number(test.statutoryEmployee);
  // A final or expanded tax is withheld on the income payment itself; contributions do not enter it.
  const contributionsInSolver = flatMethod ? 0 : contributions;
  const nonTaxable = number(test.nonTaxableAllowance);
  const ytd = number(test.ytdTaxableIncome);
  const ytdWithheld = number(test.ytdTaxWithheld);
  const allowable = number(test.allowableDeductions);
  const employerShare = policy.employerSharePercent / 100;
  const includeContributions = policy.includeStatutoryInTaxable !== false;

  const taxOn = gross => {
    if (flatMethod) {
      const taxable = Math.max(0, gross);
      return { tax: round2(taxable * (rate || 0) / 100), bracket: null, taxable, annual: null, hasTable: true };
    }
    const taxable = Math.max(0, gross - (includeContributions ? contributionsInSolver : 0));
    if (method === 'Annualized Compensation') {
      const annualBase = Math.max(0, ytd + taxable - allowable);
      const due = annualTax(annualBase, policy.effectiveDate);
      return { tax: due.tax - ytdWithheld, bracket: due.bracket, taxable, annual: { annualBase, annualTaxDue: due.tax }, hasTable: due.brackets.length > 0 };
    }
    const period = withholdingTax(taxable + ytd, policy.frequency, policy.effectiveDate);
    const base = ytd > 0 ? withholdingTax(ytd, policy.frequency, policy.effectiveDate).tax : 0;
    return { tax: Math.max(0, period.tax - base), bracket: period.bracket, taxable, annual: null, hasTable: period.brackets.length > 0 };
  };

  const takenFromNet = treatment === 'Added to the required gross' ? contributionsInSolver : 0;
  // The tax is split in whole centavos, so the two shares always add up to it exactly.
  const employerPart = amount => round2(amount * employerShare);
  const employeePart = amount => round2(amount - employerPart(amount));
  const solved = solveGross({
    target: targetNet,
    start: targetNet + takenFromNet - nonTaxable,
    describe: taxOn,
    netOf: (gross, info) => gross + nonTaxable - takenFromNet - employeePart(info.tax),
    tolerance: policy.tolerance,
    maxIterations: policy.maxIterations,
  });
  const { iterations, converged } = solved;

  const unit = policy.roundingMode === 'Round to peso' ? 1 : 0.01;
  const netAt = gross => gross + nonTaxable - takenFromNet - employeePart(taxOn(gross).tax);
  const firstRound = unit === 1 ? Math.round(solved.gross) : round2(solved.gross);
  const rounded = targetNet > 0 ? settleGross({ gross: firstRound, target: targetNet, netAt, unit }) : firstRound;
  const final = taxOn(rounded);
  const tax = final.tax;
  const employerTaxShare = employerPart(tax);
  const employeeTaxShare = employeePart(tax);
  const contributionsTakenOff = treatment === 'Handled outside the Gross Up' ? 0 : contributionsInSolver;
  const employeeNet = rounded + nonTaxable - contributionsTakenOff - employeeTaxShare;
  // What is guaranteed: with contributions "included in the target net" the guarantee is before them.
  const guaranteed = treatment === 'Included in the target net' ? employeeNet + contributionsInSolver : employeeNet;
  const employerCost = rounded + nonTaxable + employerTaxShare;
  const tableMissing = !flatMethod && !final.hasTable;

  const proof = {
    lines: [
      { label: 'Gross taxable pay', amount: rounded },
      ...(nonTaxable ? [{ label: 'Add non-taxable pay', amount: nonTaxable }] : []),
      { label: 'Less employee share of tax', amount: -employeeTaxShare },
      ...(contributionsTakenOff ? [{ label: 'Less SSS, PhilHealth and Pag-IBIG', amount: -contributionsTakenOff }] : []),
      { label: 'Employee net', amount: employeeNet },
    ],
    target: targetNet,
    guaranteed,
    // Never short of the guarantee, and over it by no more than one rounding step.
    holds: !tableMissing && !problems.length && round2(guaranteed) >= round2(targetNet) && guaranteed - targetNet <= unit + 0.005,
    employerLine: `Employer cost = gross ${rounded.toFixed(2)}${nonTaxable ? ` + non-taxable ${nonTaxable.toFixed(2)}` : ''} + employer share of tax ${employerTaxShare.toFixed(2)} = ${employerCost.toFixed(2)}`,
  };

  const annualized = method === 'Annualized Compensation' && final.annual
    ? {
      ytdTaxableIncome: ytd,
      thisPayroll: final.taxable,
      allowableDeductions: allowable,
      annualTaxableIncome: final.annual.annualBase,
      annualTaxDue: final.annual.annualTaxDue,
      ytdTaxWithheld: ytdWithheld,
      remaining: final.annual.annualTaxDue - ytdWithheld,
    }
    : null;

  return {
    // The original result shape, so existing readers keep working.
    targetNet,
    grossTaxable: rounded,
    taxableCompensation: final.taxable,
    withholdingTax: tax,
    employerAbsorbed: employerTaxShare,
    employeeWithheld: employeeTaxShare,
    statutory: contributionsInSolver,
    nonTaxable,
    employeeNet,
    employerCost,
    bracket: final.bracket,
    iterations,
    converged,
    method,
    tableMissing,
    // What Gen asked to see.
    employeeTaxShare,
    employerTaxShare,
    employeeSharePercent: round2(100 - policy.employerSharePercent),
    employerSharePercent: policy.employerSharePercent,
    treatment,
    targetType: policy.targetType,
    targetEarning: policy.targetEarning,
    incomeType: flatMethod ? policy.incomeType : '',
    incomeName: flatMethod ? (policy.incomeType === CUSTOM_INCOME ? 'Rate set by P&A' : incomesFor(method).find(row => row.code === policy.incomeType)?.name || '') : '',
    rate: flatMethod ? rate : null,
    currency,
    annualized,
    proof,
    problems,
  };
}
