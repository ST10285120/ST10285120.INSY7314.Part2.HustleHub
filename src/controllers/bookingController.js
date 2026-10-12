const mongoose = require('mongoose');
const Gig = require('../models/Gig');
const Booking = require('../models/Booking');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

async function createBooking(req, res, next) {
  try {
    const { gigId } = req.body;

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

    logger.info('Booking created', {
      bookingId: booking.id,
      gigId: gig.id,
      clientId: req.user.sub,
      freelancerId: String(gig.freelancer),
      amount: booking.amount,
    });

    return res.status(201).json({ success: true, data: { booking } });
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
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: { bookings } });
  } catch (err) {
    return next(err);
  }
}

async function getIncomeSummary(req, res, next) {
  try {
    const freelancerId = new mongoose.Types.ObjectId(req.user.sub);

    const [summary] = await Booking.aggregate([
      { $match: { freelancer: freelancerId, paymentStatus: 'paid' } },
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
