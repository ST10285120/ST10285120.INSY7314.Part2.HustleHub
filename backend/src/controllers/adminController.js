const User = require('../models/User');
const Gig = require('../models/Gig');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');

const MAX_ROWS = 500;

function limitFrom(req) {
  return req.query.limit ? Math.min(Number(req.query.limit), MAX_ROWS) : 200;
}

async function getStats(req, res, next) {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [usersByRole, activeGigs, totalGigs, bookings, revenue, failedLogins24h, lockedAccounts, suspendedUsers] =
      await Promise.all([
        User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
        Gig.countDocuments({ isActive: true }),
        Gig.countDocuments({}),
        Booking.countDocuments({}),
        Transaction.aggregate([
          { $match: { status: 'completed', type: 'payment' } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
        AuditLog.countDocuments({
          event: { $in: ['auth.login.failure', 'auth.login.locked'] },
          createdAt: { $gte: since },
        }),
        User.countDocuments({ lockUntil: { $gt: new Date() } }),
        User.countDocuments({ isActive: false }),
      ]);

    const roles = { client: 0, freelancer: 0, admin: 0 };
    usersByRole.forEach((r) => {
      roles[r._id] = r.count;
    });

    return res.status(200).json({
      success: true,
      data: {
        users: roles,
        suspendedUsers,
        lockedAccounts,
        gigs: { active: activeGigs, total: totalGigs },
        bookings,
        transactions: {
          count: revenue[0] ? revenue[0].count : 0,
          volume: revenue[0] ? revenue[0].total : 0,
        },
        failedLogins24h,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const filter = typeof req.query.role === 'string' ? { role: req.query.role } : {};
    const users = await User.find(filter)
      .select('+lockUntil')
      .sort({ createdAt: -1 })
      .limit(limitFrom(req));

    const data = users.map((u) => ({
      ...u.toJSON(),
      isLocked: u.isLocked(),
      lockUntil: u.isLocked() ? u.lockUntil : null,
    }));
    return res.status(200).json({ success: true, data: { users: data } });
  } catch (err) {
    return next(err);
  }
}

/**
 * Suspend or reactivate an account. Suspending also bumps tokenVersion, which
 * revokes every token the user currently holds.
 */
async function setUserStatus(req, res, next) {
  try {
    const { isActive } = req.body;
    if (String(req.params.id) === String(req.user.sub)) {
      throw new AppError('You cannot change the status of your own account.', 400);
    }

    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found.', 404);
    if (user.role === 'admin') {
      throw new AppError('Admin accounts cannot be suspended through the API.', 403);
    }

    user.isActive = isActive;
    if (!isActive) user.tokenVersion += 1;
    await user.save();

    recordAudit(req, {
      event: isActive ? 'admin.user.reactivate' : 'admin.user.suspend',
      target: user.id,
      details: { targetRole: user.role },
    });

    return res.status(200).json({
      success: true,
      message: isActive ? 'User reactivated.' : 'User suspended and their sessions revoked.',
      data: { user },
    });
  } catch (err) {
    if (err.name === 'CastError') return next(new AppError('User not found.', 404));
    return next(err);
  }
}

async function unlockUser(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { lockUntil: null, failedLoginAttempts: 0 } },
      { new: true }
    );
    if (!user) throw new AppError('User not found.', 404);
    recordAudit(req, { event: 'admin.user.unlock', target: user.id });
    return res.status(200).json({ success: true, message: 'Account unlocked.', data: { user } });
  } catch (err) {
    if (err.name === 'CastError') return next(new AppError('User not found.', 404));
    return next(err);
  }
}

async function listGigs(req, res, next) {
  try {
    const gigs = await Gig.find({})
      .populate('freelancer', 'name email')
      .sort({ createdAt: -1 })
      .limit(limitFrom(req));
    return res.status(200).json({ success: true, data: { gigs } });
  } catch (err) {
    return next(err);
  }
}

/** Moderation: remove any gig. Existing bookings/transactions are kept for the financial record. */
async function removeGig(req, res, next) {
  try {
    const gig = await Gig.findById(req.params.id);
    if (!gig) throw new AppError('Gig not found.', 404);

    await gig.deleteOne();
    recordAudit(req, {
      event: 'admin.gig.remove',
      target: gig.id,
      details: { title: gig.title, freelancerId: String(gig.freelancer) },
    });
    return res.status(200).json({ success: true, message: 'Gig removed.' });
  } catch (err) {
    if (err.name === 'CastError') return next(new AppError('Gig not found.', 404));
    return next(err);
  }
}

async function listBookings(req, res, next) {
  try {
    const bookings = await Booking.find({})
      .populate('gig', 'title category')
      .populate('client', 'name email')
      .populate('freelancer', 'name email')
      .populate('transaction', 'reference status')
      .sort({ createdAt: -1 })
      .limit(limitFrom(req));
    return res.status(200).json({ success: true, data: { bookings } });
  } catch (err) {
    return next(err);
  }
}

async function listTransactions(req, res, next) {
  try {
    const transactions = await Transaction.find({})
      .populate('gig', 'title category')
      .populate('client', 'name email')
      .populate('freelancer', 'name email')
      .sort({ createdAt: -1 })
      .limit(limitFrom(req));
    return res.status(200).json({ success: true, data: { transactions } });
  } catch (err) {
    return next(err);
  }
}

async function listAuditLogs(req, res, next) {
  try {
    const filter = {};
    if (typeof req.query.event === 'string') filter.event = req.query.event;
    if (typeof req.query.outcome === 'string') filter.outcome = req.query.outcome;

    const logs = await AuditLog.find(filter)
      .populate('actor', 'name email role')
      .sort({ createdAt: -1 })
      .limit(limitFrom(req));
    return res.status(200).json({ success: true, data: { logs } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getStats,
  listUsers,
  setUserStatus,
  unlockUser,
  listGigs,
  removeGig,
  listBookings,
  listTransactions,
  listAuditLogs,
};
