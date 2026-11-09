const Transaction = require('../models/Transaction');
const { AppError } = require('../middleware/errorHandler');

/**
 * Lists the caller's own transactions. A client sees what they paid, a
 * freelancer sees what they earned - the query is always scoped to the
 * authenticated user, never to an id taken from the request.
 */
async function listMyTransactions(req, res, next) {
  try {
    const field = req.user.role === 'freelancer' ? 'freelancer' : 'client';
    const transactions = await Transaction.find({ [field]: req.user.sub })
      .populate('gig', 'title category')
      .populate('client', 'name')
      .populate('freelancer', 'name')
      .sort({ createdAt: -1 })
      .limit(500);
    return res.status(200).json({ success: true, data: { transactions } });
  } catch (err) {
    return next(err);
  }
}

/** One transaction, visible only to the client or freelancer it belongs to. */
async function getTransaction(req, res, next) {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('gig', 'title category')
      .populate('client', 'name')
      .populate('freelancer', 'name');

    const idOf = (ref) => String(ref && ref._id ? ref._id : ref);
    const isParty =
      transaction &&
      [idOf(transaction.client), idOf(transaction.freelancer)].includes(String(req.user.sub));

    // Same 404 for "doesn't exist" and "not yours" - no information leak.
    if (!isParty) throw new AppError('Transaction not found.', 404);

    return res.status(200).json({ success: true, data: { transaction } });
  } catch (err) {
    if (err.name === 'CastError') return next(new AppError('Transaction not found.', 404));
    return next(err);
  }
}

module.exports = { listMyTransactions, getTransaction };
