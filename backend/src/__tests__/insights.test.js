const request = require('supertest');
const { connect, closeDatabase, clearDatabase } = require('./testDb');
const { registerAndLogin, createGig, book } = require('./helpers');
const {
  calculateIncomeTax,
  estimateFreelancerTax,
  taxYearFor,
  monthsElapsedInTaxYear,
} = require('../services/taxService');

describe('taxService (pure unit tests)', () => {
  // Base amounts published by SARS for the 2027 tax year (1 Mar 2026 - 28 Feb 2027).
  const sars2027 = [
    [245100, 44118],
    [383100, 79998],
    [530200, 125599],
    [695800, 185215],
    [887000, 259783],
    [1878600, 666339],
  ];

  it.each(sars2027)('matches the SARS table at the R%i bracket boundary', (income, expected) => {
    expect(calculateIncomeTax(income, { taxYear: 2027 }).grossTax).toBeCloseTo(expected, 0);
  });

  it('applies each rate only to its own slice of income', () => {
    // 79 998 + 31% of (500 000 - 383 100) = 116 237, minus R17 820 rebate
    const r = calculateIncomeTax(500000, { taxYear: 2027 });
    expect(r.grossTax).toBe(116237);
    expect(r.netTax).toBe(98417);
    expect(r.marginalRate).toBe(0.31);
    expect(r.effectiveRate).toBeCloseTo(0.1968, 4);
  });

  it('charges no tax below the R99 000 threshold (under 65)', () => {
    expect(calculateIncomeTax(99000, { taxYear: 2027 }).netTax).toBe(0);
    expect(calculateIncomeTax(98000, { taxYear: 2027 }).netTax).toBe(0);
    expect(calculateIncomeTax(100000, { taxYear: 2027 }).netTax).toBeGreaterThan(0);
  });

  it('adds the secondary and tertiary rebates for older taxpayers', () => {
    expect(calculateIncomeTax(1, { ageGroup: '65to74' }).taxThreshold).toBe(153250);
    expect(calculateIncomeTax(1, { ageGroup: '75plus' }).taxThreshold).toBe(171300);
  });

  it('never returns negative tax or accepts negative income', () => {
    expect(calculateIncomeTax(-5000).netTax).toBe(0);
    expect(calculateIncomeTax('not a number').netTax).toBe(0);
  });

  it('works out the SARS tax year (1 March to end of February)', () => {
    expect(taxYearFor(new Date('2026-11-09T10:00:00Z')).year).toBe(2027);
    expect(taxYearFor(new Date('2026-03-01T00:00:00Z')).year).toBe(2027);
    expect(taxYearFor(new Date('2026-02-28T12:00:00Z')).year).toBe(2026);
  });

  it('projects year-to-date income to a full year before applying brackets', () => {
    // Exactly half of the 2027 tax year has passed at about 31 August 2026.
    const asOf = new Date('2026-09-01T00:00:00Z');
    const months = monthsElapsedInTaxYear(asOf);
    const e = estimateFreelancerTax({ incomeYtd: 150000, expensesYtd: 10000, asOf });

    expect(e.taxableIncomeYtd).toBe(140000);
    expect(e.projectedAnnualTaxableIncome).toBeCloseTo((140000 * 12) / months, 1);
    expect(e.estimatedAnnualTax).toBe(
      calculateIncomeTax(e.projectedAnnualTaxableIncome, { taxYear: 2027 }).netTax
    );
    expect(e.provisionalPayments).toHaveLength(2);
    expect(e.provisionalPayments[0].dueDate).toBe('2026-08-31');
    expect(e.provisionalPayments[1].dueDate).toBe('2027-02-28');
    const paid = e.provisionalPayments[0].amount + e.provisionalPayments[1].amount;
    expect(paid).toBeCloseTo(e.estimatedAnnualTax, 1);
  });

  it('assumes at least one month so early-year projections stay sensible', () => {
    const e = estimateFreelancerTax({ incomeYtd: 500, asOf: new Date('2026-03-03T00:00:00Z') });
    expect(e.projectedAnnualTaxableIncome).toBe(6000);
    expect(e.estimatedAnnualTax).toBe(0);
    expect(e.belowThreshold).toBe(true);
  });

  it('treats expenses larger than income as zero taxable income', () => {
    const e = estimateFreelancerTax({ incomeYtd: 1000, expensesYtd: 5000 });
    expect(e.taxableIncomeYtd).toBe(0);
    expect(e.estimatedAnnualTax).toBe(0);
  });
});

describe('Insights API', () => {
  beforeAll(async () => {
    await connect();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  const app = require('../app');
  const Transaction = require('../models/Transaction');

  async function freelancerWithIncome(prices = [1000, 2500]) {
    const freelancer = await registerAndLogin(app, { role: 'freelancer' });
    const client = await registerAndLogin(app, { role: 'client' });
    for (const price of prices) {
      // eslint-disable-next-line no-await-in-loop
      const gig = await createGig(app, freelancer.token, { price, category: 'Design' });
      // eslint-disable-next-line no-await-in-loop
      await book(app, client.token, gig);
    }
    return { freelancer, client };
  }

  it('returns summary, a 12-month series, categories and a tax estimate', async () => {
    const { freelancer } = await freelancerWithIncome([1000, 2500]);

    const res = await request(app)
      .get('/api/insights/income')
      .set('Authorization', `Bearer ${freelancer.token}`);

    expect(res.status).toBe(200);
    const { summary, monthly, byCategory, topGigs, tax } = res.body.data;
    expect(summary.lifetimeIncome).toBe(3500);
    expect(summary.lifetimeTransactions).toBe(2);
    expect(summary.taxYearIncome).toBe(3500);
    expect(summary.uniqueClients).toBe(1);
    expect(monthly).toHaveLength(12);
    expect(monthly[11].total).toBe(3500);
    expect(byCategory[0]).toEqual({ category: 'Design', total: 3500, count: 2 });
    expect(topGigs[0].total).toBe(2500);
    expect(tax.incomeYtd).toBe(3500);
    expect(tax.method.length).toBeGreaterThan(0);
    expect(tax.brackets).toHaveLength(7);
  });

  it('subtracts the expenses the freelancer enters', async () => {
    const { freelancer } = await freelancerWithIncome([4000]);
    const res = await request(app)
      .get('/api/insights/income?expenses=1500&ageGroup=65to74')
      .set('Authorization', `Bearer ${freelancer.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.tax.taxableIncomeYtd).toBe(2500);
    expect(res.body.data.tax.ageGroup).toBe('65to74');
  });

  it('excludes income from earlier tax years from the tax estimate', async () => {
    const { freelancer } = await freelancerWithIncome([1000]);
    const existing = await Transaction.findOne({});
    const { _id, ...copy } = existing.toObject();
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
    // Insert directly so Mongoose doesn't replace the backdated createdAt.
    await Transaction.collection.insertOne({
      ...copy,
      reference: 'TXN-OLDOLDOLD001',
      amount: 9000,
      createdAt: twoYearsAgo,
    });

    const res = await request(app)
      .get('/api/insights/income')
      .set('Authorization', `Bearer ${freelancer.token}`);
    expect(res.body.data.summary.lifetimeIncome).toBe(10000);
    expect(res.body.data.summary.taxYearIncome).toBe(1000);
    expect(res.body.data.tax.incomeYtd).toBe(1000);
  });

  it('rejects invalid query values', async () => {
    const { freelancer } = await freelancerWithIncome([100]);
    const badAge = await request(app)
      .get('/api/insights/income?ageGroup=teenager')
      .set('Authorization', `Bearer ${freelancer.token}`);
    const badExpenses = await request(app)
      .get('/api/insights/income?expenses=-10')
      .set('Authorization', `Bearer ${freelancer.token}`);
    expect(badAge.status).toBe(400);
    expect(badExpenses.status).toBe(400);
  });

  it('is only available to freelancers', async () => {
    const client = await registerAndLogin(app, { role: 'client' });
    const asClient = await request(app)
      .get('/api/insights/income')
      .set('Authorization', `Bearer ${client.token}`);
    const anonymous = await request(app).get('/api/insights/income');
    expect(asClient.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });

  it('publishes the tax tables it uses', async () => {
    const res = await request(app).get('/api/insights/tax-tables');
    expect(res.status).toBe(200);
    const table = res.body.data.tables.find((t) => t.taxYear === 2027);
    expect(table.rebates.primary).toBe(17820);
    expect(table.brackets[6]).toEqual({ upTo: null, rate: 0.45 });
  });
});
