const mongoose = require('mongoose');
const Gig = require('../models/Gig');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');

/**
 * Books a gig with a simulated payment. Every booking creates two linked
 * records: the Booking (the service agreement) and a Transaction (the money
 * movement), both referencing the client and the freelancer.
 *
 * MongoDB multi-document transactions need a replica set, which the local and
 * test databases are not, so consistency is kept with a compensating action:
 * if the Transaction cannot be written, the Booking is removed again.
 */
async function createBooking(req, res, next) {
  try {
    const gigId = String(req.body.gigId);

    const gig = await Gig.findById(gigId);
    if (!gig || !gig.isActive) {
      throw new AppError('Gig not found.', 404);
    }

    if (String(gig.freelancer) === String(req.user.sub)) {
      throw new AppError('You cannot book your own gig.', 400);
    }

    const booking = await Booking.create({
      gig: gig.id,
      client: req.user.sub,
      freelancer: gig.freelancer,
      amount: gig.price,
      paymentStatus: 'paid',
      status: 'confirmed',
    });

    let transaction;
    try {
      transaction = await Transaction.create({
        booking: booking.id,
        gig: gig.id,
        client: req.user.sub,
        freelancer: gig.freelancer,
        amount: gig.price,
        type: 'payment',
        status: 'completed',
      });
    } catch (txErr) {
      await Booking.deleteOne({ _id: booking._id });
      throw txErr;
    }

    booking.transaction = transaction._id;
    await booking.save();

    recordAudit(req, {
      event: 'booking.create',
      target: booking.id,
      details: { gigId: gig.id, freelancerId: String(gig.freelancer), amount: booking.amount },
    });
    recordAudit(req, {
      event: 'transaction.create',
      target: transaction.reference,
      details: {
        bookingId: booking.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
      },
    });

    return res.status(201).json({ success: true, data: { booking, transaction } });
  } catch (err) {
    if (err.name === 'CastError') return next(new AppError('Gig not found.', 404));
    return next(err);
  }
}

async function listMyBookings(req, res, next) {
  try {
    const bookings = await Booking.find({ client: req.user.sub })
      .populate('gig', 'title price category')
      .populate('freelancer', 'name email')
      .populate('transaction', 'reference status amount currency createdAt')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: { bookings } });
  } catch (err) {
    return next(err);
  }
}

async function listFreelancerBookings(req, res, next) {
  try {
    const bookings = await Booking.find({ freelancer: req.user.sub })
      .populate('gig', 'title price category')
      .populate('client', 'name email')
      .populate('transaction', 'reference status amount currency createdAt')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: { bookings } });
  } catch (err) {
    return next(err);
  }
}

/** Income is now derived from completed Transactions, not from bookings. */
async function getIncomeSummary(req, res, next) {
  try {
    const freelancerId = new mongoose.Types.ObjectId(req.user.sub);

    const [summary] = await Transaction.aggregate([
      { $match: { freelancer: freelancerId, status: 'completed', type: 'payment' } },
      {
        $group: {
          _id: null,
          totalIncome: { $sum: '$amount' },
          totalBookings: { $sum: 1 },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalIncome: summary ? summary.totalIncome : 0,
        totalBookings: summary ? summary.totalBookings : 0,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createBooking, listMyBookings, listFreelancerBookings, getIncomeSummary };
