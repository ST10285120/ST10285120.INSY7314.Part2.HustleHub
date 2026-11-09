const User = require('../models/User');
const { verifyToken } = require('../utils/token');
const logger = require('../utils/logger');

const INVALID_TOKEN = {
  success: false,
  message: 'Invalid or expired authentication token.',
};

/**
 * Verifies the JWT and then checks it against the database, so that a token
 * stops working as soon as the user logs out, is suspended by an admin or is
 * deleted - instead of staying valid until it expires.
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication token missing or malformed.',
    });
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    logger.warn('JWT verification failed', { reason: err.name, requestId: req.id });
    return res.status(401).json(INVALID_TOKEN);
  }

  try {
    const user = await User.findById(decoded.sub).select('role isActive tokenVersion');
    const tokenVersion = decoded.tv || 0;

    if (!user || !user.isActive || user.tokenVersion !== tokenVersion) {
      logger.warn('Rejected revoked or stale token', {
        userId: decoded.sub,
        reason: !user ? 'user-not-found' : !user.isActive ? 'user-suspended' : 'token-revoked',
        requestId: req.id,
      });
      return res.status(401).json(INVALID_TOKEN);
    }

    // Always trust the role in the database over the role in the token, so a
    // role change takes effect immediately.
    req.user = { ...decoded, role: user.role };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = authenticateToken;
