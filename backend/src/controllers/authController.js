const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const userModel = require('../models/userModel');
const { generateToken } = require('../utils/token');
const { AppError } = require('../middleware/errorHandler');
const config = require('../config/env');
const { maskEmail } = require('../utils/logger');
const { recordAudit } = require('../utils/audit');

// Comparing against a real bcrypt hash when the email doesn't exist makes
// "unknown email" take as long as "wrong password", so response timing can't
// be used to discover which emails are registered. Generated once, lazily.
let dummyHashPromise = null;
function getDummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash(crypto.randomBytes(16).toString('hex'), config.bcrypt.saltRounds);
  }
  return dummyHashPromise;
}

const INVALID_CREDENTIALS = 'Invalid email or password.';

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      throw new AppError('An account with this email already exists.', 409);
    }

    const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);

    const newUser = await userModel.createUser({ name, email, passwordHash, role });
    const token = generateToken(newUser);

    recordAudit(req, {
      event: 'auth.register',
      actor: newUser.id,
      actorRole: newUser.role,
      details: { email: maskEmail(newUser.email) },
    });

    return res.status(201).json({
      success: true,
      message: 'Registration successful.',
      data: {
        user: userModel.toSafeUser(newUser),
        token,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function registerFailedAttempt(user) {
  const attempts = (user.failedLoginAttempts || 0) + 1;
  const update = { failedLoginAttempts: attempts };
  let locked = false;

  if (attempts >= config.lockout.maxFailedAttempts) {
    update.lockUntil = new Date(Date.now() + config.lockout.durationMinutes * 60 * 1000);
    update.failedLoginAttempts = 0;
    locked = true;
  }

  await User.updateOne({ _id: user._id }, { $set: update });
  return { attempts, locked };
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await userModel.findByEmail(email);

    if (!user) {
      await bcrypt.compare(password, await getDummyHash());
      recordAudit(req, {
        event: 'auth.login.failure',
        outcome: 'failure',
        details: { reason: 'unknown-email', email: maskEmail(email) },
      });
      throw new AppError(INVALID_CREDENTIALS, 401);
    }

    // Locked or suspended accounts get the same generic response as a wrong
    // password, so the response never confirms that the account exists.
    if (user.isLocked()) {
      recordAudit(req, {
        event: 'auth.login.locked',
        outcome: 'failure',
        actor: user.id,
        actorRole: user.role,
        details: { lockUntil: user.lockUntil },
      });
      throw new AppError(INVALID_CREDENTIALS, 401);
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      const { attempts, locked } = await registerFailedAttempt(user);
      recordAudit(req, {
        event: locked ? 'auth.login.locked' : 'auth.login.failure',
        outcome: 'failure',
        actor: user.id,
        actorRole: user.role,
        details: { reason: 'wrong-password', attempts, locked },
      });
      throw new AppError(INVALID_CREDENTIALS, 401);
    }

    if (!user.isActive) {
      recordAudit(req, {
        event: 'auth.login.failure',
        outcome: 'failure',
        actor: user.id,
        actorRole: user.role,
        details: { reason: 'account-suspended' },
      });
      throw new AppError(INVALID_CREDENTIALS, 401);
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: new Date() } }
    );

    const token = generateToken(user);

    recordAudit(req, {
      event: 'auth.login.success',
      actor: user.id,
      actorRole: user.role,
      details: { email: maskEmail(user.email) },
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user: userModel.toSafeUser(user),
        token,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Logging out bumps the user's tokenVersion. authenticateToken compares the
 * version inside each JWT with the stored one, so every token issued before
 * this point - on this device or any other - stops working immediately.
 */
async function logout(req, res, next) {
  try {
    await User.updateOne({ _id: req.user.sub }, { $inc: { tokenVersion: 1 } });
    recordAudit(req, { event: 'auth.logout', details: { scope: 'all-sessions' } });
    return res.status(200).json({ success: true, message: 'Logged out. All sessions revoked.' });
  } catch (err) {
    return next(err);
  }
}

async function getProfile(req, res, next) {
  try {
    const user = await userModel.findById(req.user.sub);
    if (!user) {
      throw new AppError('User no longer exists.', 404);
    }
    return res.status(200).json({
      success: true,
      data: { user: userModel.toSafeUser(user) },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, logout, getProfile };
