const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const {
  TAX_TABLES,
  AGE_GROUPS,
  taxYearFor,
  estimateFreelancerTax,
} = require('../services/taxService');

const MONTHS_IN_CHART = 12;

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The last 12 calendar months (oldest first), including the current one. */
function lastMonths(now, count) {
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    months.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return months;
}

/**
 * GET /api/insights/income
 * Everything the freelancer's Income & Tax dashboard needs, computed from their
 * own completed transactions only.
 */
async function getIncomeInsights(req, res, next) {
  try {
    const now = new Date();
    const freelancerId = new mongoose.Types.ObjectId(req.user.sub);
    const expensesYtd = req.query.expenses !== undefined ? Number(req.query.expenses) : 0;
    const ageGroup = req.query.ageGroup || 'under65';

    const { start: taxYearStart, end: taxYearEnd } = taxYearFor(now);
    const months = lastMonths(now, MONTHS_IN_CHART);
    const chartStart = new Date(`${months[0]}-01T00:00:00.000Z`);

    const baseMatch = { freelancer: freelancerId, status: 'completed', type: 'payment' };

    const [result] = await Transaction.aggregate([
      { $match: baseMatch },
      {
        $facet: {
          lifetime: [
            {
              $group: {
                _id: null,
                total: { $sum: '$amount' },
                count: { $sum: 1 },
                average: { $avg: '$amount' },
                clients: { $addToSet: '$client' },
              },
            },
          ],
          taxYear: [
            { $match: { createdAt: { $gte: taxYearStart, $lte: taxYearEnd } } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
          ],
          monthly: [
            { $match: { createdAt: { $gte: chartStart } } },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                total: { $sum: '$amount' },
                count: { $sum: 1 },
              },
            },
          ],
          byCategory: [
            { $lookup: { from: 'gigs', localField: 'gig', foreignField: '_id', as: 'gigDoc' } },
            { $unwind: { path: '$gigDoc', preserveNullAndEmptyArrays: true } },
            {
              $group: {
                _id: { $ifNull: ['$gigDoc.category', 'Removed gig'] },
                total: { $sum: '$amount' },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ],
          topGigs: [
            { $group: { _id: '$gig', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { total: -1 } },
            { $limit: 5 },
            { $lookup: { from: 'gigs', localField: '_id', foreignField: '_id', as: 'gigDoc' } },
            { $unwind: { path: '$gigDoc', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                gigId: '$_id',
                title: { $ifNull: ['$gigDoc.title', 'Removed gig'] },
                total: 1,
                count: 1,
              },
            },
          ],
        },
      },
    ]);

    const lifetime = result.lifetime[0] || { total: 0, count: 0, average: 0, clients: [] };
    const taxYear = result.taxYear[0] || { total: 0, count: 0 };
    const monthlyMap = new Map(result.monthly.map((m) => [m._id, m]));
    const monthly = months.map((month) => ({
      month,
      total: monthlyMap.get(month) ? monthlyMap.get(month).total : 0,
      count: monthlyMap.get(month) ? monthlyMap.get(month).count : 0,
    }));

    const thisMonth = monthly[monthly.length - 1].total;
    const lastMonth = monthly[monthly.length - 2].total;
    const monthOverMonthChange = lastMonth > 0 ? (thisMonth - lastMonth) / lastMonth : null;

    const tax = estimateFreelancerTax({
      incomeYtd: taxYear.total,
      expensesYtd,
      ageGroup,
      asOf: now,
    });

    return res.status(200).json({
      success: true,
      data: {
        currency: 'ZAR',
        summary: {
          lifetimeIncome: lifetime.total,
          lifetimeTransactions: lifetime.count,
          averageTransaction: Math.round((lifetime.average || 0) * 100) / 100,
          uniqueClients: lifetime.clients.length,
          taxYearIncome: taxYear.total,
          taxYearTransactions: taxYear.count,
          thisMonthIncome: thisMonth,
          lastMonthIncome: lastMonth,
          monthOverMonthChange,
        },
        monthly,
        byCategory: result.byCategory.map((c) => ({
          category: c._id,
          total: c.total,
          count: c.count,
        })),
        topGigs: result.topGigs,
        tax,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/insights/tax-tables - the SARS tables the estimate uses (public). */
function getTaxTables(req, res) {
  const tables = Object.entries(TAX_TABLES).map(([year, t]) => ({
    taxYear: Number(year),
    label: t.label,
    rebates: t.rebates,
    brackets: t.brackets.map((b) => ({ upTo: Number.isFinite(b.upTo) ? b.upTo : null, rate: b.rate })),
  }));
  res.status(200).json({ success: true, data: { ageGroups: AGE_GROUPS, tables } });
}

module.exports = { getIncomeInsights, getTaxTables };
