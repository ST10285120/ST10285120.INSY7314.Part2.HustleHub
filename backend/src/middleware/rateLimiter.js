const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const logger = require('../utils/logger');
const { safeForLog } = require('../utils/logger');

function limiter({ name, windowMs, limit, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
      logger.warn('Rate limit exceeded', {
        limiter: name,
        ip: safeForLog(req.ip),
        path: safeForLog(req.originalUrl),
        requestId: req.id,
      });
      res.status(options.statusCode).json({ success: false, message });
    },
  });
}

// Baseline limit on every API route, so no endpoint that touches the database
// can be hammered without bound (also resolves CodeQL js/missing-rate-limiting).
const apiLimiter = limiter({
  name: 'api',
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimits.apiMax,
  message: 'Too many requests from this address. Please try again later.',
});

// Only failed logins count, so a real user logging in normally is never
// throttled, while password guessing is capped at 10 failures per 15 minutes.
const loginLimiter = limiter({
  name: 'login',
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimits.loginMax,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Please try again later.',
});

const registerLimiter = limiter({
  name: 'register',
  windowMs: 60 * 60 * 1000,
  limit: config.rateLimits.registerMax,
  message: 'Too many registration attempts from this address. Please try again later.',
});

const bookingLimiter = limiter({
  name: 'booking',
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimits.bookingMax,
  message: 'Too many booking attempts. Please try again later.',
});

module.exports = { apiLimiter, loginLimiter, registerLimiter, bookingLimiter };
