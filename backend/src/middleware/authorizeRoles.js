const { recordAudit } = require('../utils/audit');

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      recordAudit(req, {
        event: 'access.denied',
        outcome: 'failure',
        target: `${req.method} ${req.originalUrl}`,
        details: { requiredRoles: allowedRoles },
      });
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
      });
    }

    return next();
  };
}

module.exports = authorizeRoles;
