/**
 * HustleHub+ tax estimation.
 *
 * Freelancers on HustleHub+ are self-employed, so SARS treats them as
 * provisional taxpayers: nobody deducts PAYE for them and they must estimate
 * and pay their own tax twice a year. This module gives them that estimate.
 *
 * How the estimate works (also shown to the user in the Income & Tax page):
 *
 *  1. Taxable income so far = completed payments received this tax year
 *     minus the business expenses the freelancer enters (never below zero).
 *  2. Because a year isn't over yet, that figure is projected to a full year:
 *        projected annual taxable income = taxable income so far x 12 / months elapsed
 *     (at least one month is assumed, so a single early booking doesn't
 *     produce a wildly inflated projection).
 *  3. Income tax on the projection is calculated with the SARS progressive
 *     brackets: each slice of income is taxed only at its own bracket's rate.
 *  4. The age-based rebate(s) are subtracted (tax can't go below zero).
 *  5. effective rate = annual tax / projected annual taxable income.
 *     Tax attributable to income so far = effective rate x taxable income so far.
 *  6. The annual figure is split into the two provisional tax payments
 *     (end of August and end of February) and a monthly "set aside" amount.
 *
 * The rates come from SARS "Rates of tax for individuals". It is an estimate
 * for planning only: it ignores income earned outside HustleHub+, medical
 * scheme credits, retirement fund deductions and VAT.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Each bracket: income up to `upTo` (inclusive) is taxed at `rate`.
const TAX_TABLES = {
  // 2027 tax year: 1 March 2026 - 28 February 2027 (Budget 2026)
  2027: {
    label: '2026/27',
    brackets: [
      { upTo: 245100, rate: 0.18 },
      { upTo: 383100, rate: 0.26 },
      { upTo: 530200, rate: 0.31 },
      { upTo: 695800, rate: 0.36 },
      { upTo: 887000, rate: 0.39 },
      { upTo: 1878600, rate: 0.41 },
      { upTo: Infinity, rate: 0.45 },
    ],
    rebates: { primary: 17820, secondary: 9765, tertiary: 3249 },
  },
  // 2026 tax year: 1 March 2025 - 28 February 2026
  2026: {
    label: '2025/26',
    brackets: [
      { upTo: 237100, rate: 0.18 },
      { upTo: 370500, rate: 0.26 },
      { upTo: 512800, rate: 0.31 },
      { upTo: 673000, rate: 0.36 },
      { upTo: 857900, rate: 0.39 },
      { upTo: 1817000, rate: 0.41 },
      { upTo: Infinity, rate: 0.45 },
    ],
    rebates: { primary: 17235, secondary: 9444, tertiary: 3145 },
  },
};

const AGE_GROUPS = ['under65', '65to74', '75plus'];
const LATEST_TAX_YEAR = Math.max(...Object.keys(TAX_TABLES).map(Number));
const EARLIEST_TAX_YEAR = Math.min(...Object.keys(TAX_TABLES).map(Number));

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * SARS names a tax year after the year in which it ends. A tax year runs from
 * 1 March to the last day of February.
 */
function taxYearFor(date = new Date()) {
  const d = new Date(date);
  const year = d.getUTCMonth() >= 2 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  const start = new Date(Date.UTC(year - 1, 2, 1));
  const end = new Date(Date.UTC(year, 2, 1) - 1); // last ms of February
  return { year, start, end };
}

/** Use the table for that year, or the nearest one we have. */
function tableFor(year) {
  if (TAX_TABLES[year]) return { year, table: TAX_TABLES[year], isFallback: false };
  const fallbackYear = year > LATEST_TAX_YEAR ? LATEST_TAX_YEAR : EARLIEST_TAX_YEAR;
  return { year: fallbackYear, table: TAX_TABLES[fallbackYear], isFallback: true };
}

function rebateFor(table, ageGroup = 'under65') {
  const { primary, secondary, tertiary } = table.rebates;
  if (ageGroup === '75plus') return primary + secondary + tertiary;
  if (ageGroup === '65to74') return primary + secondary;
  return primary;
}

/**
 * Progressive income tax for one tax year.
 * Returns a breakdown per bracket so the frontend can show where the tax comes from.
 */
function calculateIncomeTax(taxableIncome, { taxYear = LATEST_TAX_YEAR, ageGroup = 'under65' } = {}) {
  const income = Math.max(0, Number(taxableIncome) || 0);
  const { year, table, isFallback } = tableFor(taxYear);

  const breakdown = [];
  let lowerBound = 0;
  let grossTax = 0;
  let marginalRate = table.brackets[0].rate;

  for (const bracket of table.brackets) {
    const taxableInBracket = Math.max(0, Math.min(income, bracket.upTo) - lowerBound);
    const tax = taxableInBracket * bracket.rate;
    if (taxableInBracket > 0) marginalRate = bracket.rate;
    grossTax += tax;
    breakdown.push({
      from: lowerBound === 0 ? 0 : lowerBound + 1,
      to: Number.isFinite(bracket.upTo) ? bracket.upTo : null,
      rate: bracket.rate,
      taxableAmount: round2(taxableInBracket),
      tax: round2(tax),
    });
    // Brackets above the income are still listed (with zeros) for a complete table.
    lowerBound = bracket.upTo;
  }

  const rebate = rebateFor(table, ageGroup);
  const netTax = Math.max(0, grossTax - rebate);

  return {
    taxYear: year,
    taxYearLabel: table.label,
    usedFallbackTable: isFallback,
    ageGroup,
    taxableIncome: round2(income),
    grossTax: round2(grossTax),
    rebate,
    netTax: round2(netTax),
    effectiveRate: income > 0 ? round2((netTax / income) * 100) / 100 : 0,
    marginalRate,
    taxThreshold: round2(rebate / table.brackets[0].rate),
    brackets: breakdown,
  };
}

/** Months of the tax year that have passed at `asOf` (fractional, 0-12). */
function monthsElapsedInTaxYear(asOf = new Date()) {
  const { start, end } = taxYearFor(asOf);
  const yearLength = end.getTime() - start.getTime() + 1;
  const elapsed = Math.min(Math.max(new Date(asOf).getTime() - start.getTime(), 0), yearLength);
  return (elapsed / yearLength) * 12;
}

/**
 * Full freelancer estimate for the current tax year.
 * @param {object} p
 * @param {number} p.incomeYtd   completed payments received this tax year
 * @param {number} [p.expensesYtd] deductible business expenses this tax year
 * @param {string} [p.ageGroup]  'under65' | '65to74' | '75plus'
 * @param {Date}   [p.asOf]      date to estimate at (defaults to now)
 */
function estimateFreelancerTax({ incomeYtd, expensesYtd = 0, ageGroup = 'under65', asOf = new Date() }) {
  const income = Math.max(0, Number(incomeYtd) || 0);
  const expenses = Math.max(0, Number(expensesYtd) || 0);
  const { year, start, end } = taxYearFor(asOf);

  const monthsElapsed = monthsElapsedInTaxYear(asOf);
  const monthsForProjection = Math.max(1, monthsElapsed);

  const taxableIncomeYtd = Math.max(0, income - expenses);
  const projectedAnnualTaxableIncome = (taxableIncomeYtd * 12) / monthsForProjection;

  const annual = calculateIncomeTax(projectedAnnualTaxableIncome, { taxYear: year, ageGroup });
  const exactEffectiveRate =
    projectedAnnualTaxableIncome > 0 ? annual.netTax / projectedAnnualTaxableIncome : 0;
  const taxOnIncomeYtd = taxableIncomeYtd * exactEffectiveRate;

  const firstPaymentDue = new Date(Date.UTC(year - 1, 7, 31)); // 31 August
  const secondPaymentDue = new Date(end.getTime() - (end.getTime() % DAY_MS)); // last day of Feb
  const firstPayment = annual.netTax / 2;

  return {
    taxYear: year,
    taxYearLabel: annual.taxYearLabel,
    taxYearStart: start.toISOString().slice(0, 10),
    taxYearEnd: end.toISOString().slice(0, 10),
    asOf: new Date(asOf).toISOString(),
    monthsElapsed: round2(monthsElapsed),
    ageGroup,
    incomeYtd: round2(income),
    expensesYtd: round2(expenses),
    taxableIncomeYtd: round2(taxableIncomeYtd),
    projectedAnnualTaxableIncome: round2(projectedAnnualTaxableIncome),
    estimatedAnnualTax: annual.netTax,
    estimatedTaxOnIncomeYtd: round2(taxOnIncomeYtd),
    effectiveRate: annual.effectiveRate,
    marginalRate: annual.marginalRate,
    rebate: annual.rebate,
    taxThreshold: annual.taxThreshold,
    belowThreshold: projectedAnnualTaxableIncome <= annual.taxThreshold,
    recommendedMonthlySetAside: round2(annual.netTax / 12),
    netIncomeAfterTaxYtd: round2(income - expenses - taxOnIncomeYtd),
    provisionalPayments: [
      {
        period: 'First provisional payment',
        dueDate: firstPaymentDue.toISOString().slice(0, 10),
        amount: round2(firstPayment),
      },
      {
        period: 'Second provisional payment',
        dueDate: secondPaymentDue.toISOString().slice(0, 10),
        amount: round2(annual.netTax - firstPayment),
      },
    ],
    brackets: annual.brackets,
    method: [
      'Taxable income so far = payments received this tax year minus business expenses.',
      'Projected annual income = taxable income so far x 12 / months elapsed (minimum 1 month).',
      'SARS progressive brackets are applied to the projection, slice by slice.',
      'The age-based rebate is subtracted; tax cannot go below zero.',
      'Tax on income so far = projected effective rate x taxable income so far.',
      'The annual estimate is split into two provisional payments (August and February).',
    ],
    disclaimer:
      'Estimate for planning only. Assumes HustleHub+ is your only income and ignores medical ' +
      'credits, retirement fund deductions and VAT. Confirm with SARS or a registered tax practitioner.',
  };
}

module.exports = {
  TAX_TABLES,
  AGE_GROUPS,
  LATEST_TAX_YEAR,
  taxYearFor,
  calculateIncomeTax,
  monthsElapsedInTaxYear,
  estimateFreelancerTax,
};
