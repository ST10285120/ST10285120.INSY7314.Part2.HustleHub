const mongoose = require('mongoose');

const AUDIT_EVENTS = [
  'auth.register',
  'auth.login.success',
  'auth.login.failure',
  'auth.login.locked',
  'auth.logout',
  'auth.token.revoked',
  'access.denied',
  'gig.create',
  'gig.update',
  'gig.delete',
  'booking.create',
  'transaction.create',
  'admin.user.suspend',
  'admin.user.reactivate',
  'admin.user.unlock',
  'admin.gig.remove',
];

/**
 * Security audit trail (own security feature #3). Stored in MongoDB so it
 * survives container restarts and can be reviewed by admins in the app, in
 * addition to the application logs shipped to Better Stack.
 */
const auditLogSchema = new mongoose.Schema(
  {
    event: { type: String, enum: AUDIT_EVENTS, required: true },
    outcome: { type: String, enum: ['success', 'failure'], required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: null },
    target: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 300 },
    requestId: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Keep 90 days of audit history, then let MongoDB expire it automatically.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
auditLogSchema.index({ event: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
module.exports.AUDIT_EVENTS = AUDIT_EVENTS;
