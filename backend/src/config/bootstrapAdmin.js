const bcrypt = require('bcryptjs');
const User = require('../models/User');
const config = require('./env');
const logger = require('../utils/logger');

const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;

/**
 * Admins can't self-register (the register endpoint only accepts client or
 * freelancer). Instead the first admin is created from ADMIN_EMAIL and
 * ADMIN_PASSWORD at startup. It's idempotent: if the account already exists
 * nothing changes, so the password in .env can't silently overwrite one that
 * has been rotated.
 */
async function ensureAdminAccount() {
  const { email, password, name } = config.admin;
  if (!email || !password) {
    logger.info('ADMIN_EMAIL/ADMIN_PASSWORD not set - skipping admin bootstrap.');
    return null;
  }

  if (!STRONG_PASSWORD.test(password)) {
    logger.error(
      'ADMIN_PASSWORD is too weak (min 12 chars with upper, lower, number and symbol). Admin not created.'
    );
    return null;
  }

  const normalised = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalised });
  if (existing) {
    if (existing.role !== 'admin') {
      logger.warn('ADMIN_EMAIL belongs to a non-admin account - not promoting it automatically.');
    }
    return existing;
  }

  const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);
  const admin = await User.create({ name, email: normalised, passwordHash, role: 'admin' });
  logger.info('Bootstrap admin account created', { userId: admin.id });
  return admin;
}

module.exports = { ensureAdminAccount, STRONG_PASSWORD };
