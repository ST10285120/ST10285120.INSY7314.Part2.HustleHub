const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    gig: { type: mongoose.Schema.Types.ObjectId, ref: 'Gig', required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['paid', 'refunded'],
      default: 'paid',
    },
    status: {
      type: String,
      enum: ['confirmed', 'cancelled', 'completed'],
      default: 'confirmed',
    },
    // Link to the separate Transaction record created with this booking.
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  },
  { timestamps: true }
);

bookingSchema.index({ client: 1 });
bookingSchema.index({ freelancer: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
