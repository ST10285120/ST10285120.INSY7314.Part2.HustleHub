export function makeInsights(overrides = {}) {
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 11 + i, 1));
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return { month, total: i === 11 ? 6500 : i === 10 ? 2500 : 0, count: i >= 10 ? 1 : 0 };
  });
  return {
    currency: 'ZAR',
    summary: {
      lifetimeIncome: 9000,
      lifetimeTransactions: 2,
      averageTransaction: 4500,
      uniqueClients: 2,
      taxYearIncome: 9000,
      taxYearTransactions: 2,
      thisMonthIncome: 6500,
      lastMonthIncome: 2500,
      monthOverMonthChange: 1.6,
    },
    monthly,
    byCategory: [
      { category: 'Development', total: 6500, count: 1 },
      { category: 'Design', total: 2500, count: 1 },
    ],
    topGigs: [{ gigId: 'g1', title: 'Landing page in React', total: 6500, count: 1 }],
    tax: {
      taxYear: 2027,
      taxYearLabel: '2026/27',
      taxYearStart: '2026-03-01',
      taxYearEnd: '2027-02-28',
      monthsElapsed: 8.3,
      ageGroup: 'under65',
      incomeYtd: 9000,
      expensesYtd: 0,
      taxableIncomeYtd: 9000,
      projectedAnnualTaxableIncome: 13012.05,
      estimatedAnnualTax: 0,
      estimatedTaxOnIncomeYtd: 0,
      effectiveRate: 0,
      marginalRate: 0.18,
      rebate: 17820,
      taxThreshold: 99000,
      belowThreshold: true,
      recommendedMonthlySetAside: 0,
      netIncomeAfterTaxYtd: 9000,
      provisionalPayments: [
        { period: 'First provisional payment', dueDate: '2026-08-31', amount: 0 },
        { period: 'Second provisional payment', dueDate: '2027-02-28', amount: 0 },
      ],
      brackets: [
        { from: 0, to: 245100, rate: 0.18, taxableAmount: 13012.05, tax: 2342.17 },
        { from: 245101, to: 383100, rate: 0.26, taxableAmount: 0, tax: 0 },
        { from: 383101, to: null, rate: 0.45, taxableAmount: 0, tax: 0 },
      ],
      method: ['Step one of the method.', 'Step two of the method.'],
      disclaimer: 'Estimate for planning only.',
      ...overrides.tax,
    },
    ...overrides.root,
  };
}
