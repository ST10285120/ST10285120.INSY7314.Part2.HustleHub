const mongoose = require('mongoose');

const ALLOWED_ROLES = ['client', 'freelancer', 'admin'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ALLOWED_ROLES,
      default: 'client',
    },
    // Suspended accounts cannot log in and their existing tokens stop working.
    isActive: { type: Boolean, default: true },

    // Account lockout (own security feature #1).
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },

    // Token revocation (own security feature #2). Every JWT carries the
    // tokenVersion it was issued with; bumping it invalidates them all.
    tokenVersion: { type: Number, default: 0 },

    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil.getTime() > Date.now());
};

userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.failedLoginAttempts;
    delete ret.lockUntil;
    delete ret.tokenVersion;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
module.exports.ALLOWED_ROLES = ALLOWED_ROLES;
