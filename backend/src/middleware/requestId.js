const crypto = require('crypto');
const logger = require('../utils/logger');

const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Gives every request a correlation ID. It is echoed in the X-Request-Id
 * response header and attached to every log line and audit record the request
 * produces, so one user's complaint can be traced across all logs.
 *
 * An ID supplied by an upstream proxy is reused only if it is a short, safe
 * string; anything else is replaced so it can't be used for log injection.
 */
function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  req.log = logger.child({ requestId: req.id });
  next();
}

module.exports = requestId;
