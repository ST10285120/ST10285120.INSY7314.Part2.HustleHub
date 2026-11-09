const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * A financial transaction recorded for every booking. It is a separate record
 * from the booking so that money movements have their own immutable history
 * (a booking can later be cancelled; the original payment record stays).
 */
const transactionSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      default: () => `TXN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    gig: { type: mongoose.Schema.Types.ObjectId, ref: 'Gig', required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'ZAR', enum: ['ZAR'] },
    type: { type: String, enum: ['payment', 'refund'], default: 'payment' },
    status: {
      type: String,
      enum: ['completed', 'refunded', 'failed'],
      default: 'completed',
    },
    paymentMethod: { type: String, default: 'simulated', enum: ['simulated'] },
  },
  { timestamps: true }
);

transactionSchema.index({ freelancer: 1, createdAt: -1 });
transactionSchema.index({ client: 1, createdAt: -1 });
transactionSchema.index({ booking: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
