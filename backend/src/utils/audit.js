const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const logger = require('./logger');
const { safeForLog, sanitiseDetails } = require('./logger');

function requestContext(req) {
  if (!req) return {};
  return {
    ip: safeForLog(req.ip || null),
    userAgent: safeForLog((req.get && req.get('User-Agent')) || null),
    requestId: safeForLog(req.id || null),
  };
}

/**
 * Records a security-relevant event in two places:
 *  1. the application log (stdout / files / Better Stack) for monitoring and alerting;
 *  2. the AuditLog collection, so admins can review it in the app.
 *
 * Writing the audit record never blocks or fails the user's request.
 */
async function recordAudit(req, { event, outcome = 'success', actor, actorRole, target, details = {} }) {
  const ctx = requestContext(req);
  const cleanDetails = sanitiseDetails(details);
  const cleanTarget = target ? safeForLog(target) : null;
  const actorId = actor || (req && req.user && req.user.sub) || null;
  const role = actorRole || (req && req.user && req.user.role) || null;

  const level = outcome === 'failure' ? 'warn' : 'info';
  logger.log(level, `audit:${event}`, {
    event,
    outcome,
    actor: actorId ? String(actorId) : null,
    actorRole: role,
    target: cleanTarget,
    ...ctx,
    details: cleanDetails,
  });

  if (mongoose.connection.readyState !== 1) return;

  try {
    await AuditLog.create({
      event,
      outcome,
      actor: actorId && mongoose.isValidObjectId(actorId) ? actorId : null,
      actorRole: role,
      target: cleanTarget,
      ...ctx,
      details: cleanDetails,
    });
  } catch (err) {
    logger.error('Failed to write audit record', { event, message: err.message });
  }
}

module.exports = { recordAudit };
