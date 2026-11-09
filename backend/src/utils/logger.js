const fs = require('fs');
const path = require('path');
const winston = require('winston');
const config = require('../config/env');
const BetterStackTransport = require('./betterStackTransport');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

// Keys whose values must never reach a log line, however deeply nested.
const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'authorization',
  'jwt',
  'secret',
  'cookie',
]);

function redact(value, depth = 0) {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      info[key] = '[REDACTED]';
    } else if (info[key] && typeof info[key] === 'object') {
      info[key] = redact(info[key]);
    }
  }
  return info;
});

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  redactFormat(),
  winston.format.json()
);

const transports = [];

if (config.isTest) {
  // Keep test output readable; errors still surface.
  transports.push(new winston.transports.Console({ level: 'error', silent: true }));
} else if (config.nodeEnv === 'production') {
  // In containers, structured JSON on stdout is collected by `docker logs`.
  transports.push(new winston.transports.Console({ format: jsonFormat }));
} else {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    })
  );
}

if (config.logging.toFile && !config.isTest) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
}

const { sourceToken, ingestingHost } = config.logging.betterStack;
const cloudLoggingEnabled = Boolean(sourceToken && ingestingHost && !config.isTest);
if (cloudLoggingEnabled) {
  transports.push(new BetterStackTransport({ sourceToken, ingestingHost, level: 'info' }));
}

const logger = winston.createLogger({
  level: config.logging.level,
  format: jsonFormat,
  defaultMeta: { service: 'hustlehub-api', env: config.nodeEnv },
  transports,
});

logger.cloudLoggingEnabled = cloudLoggingEnabled;

/**
 * Masks an email address for logs: "thabo@example.com" -> "t***@example.com".
 * Enough to correlate events during an investigation without storing PII.
 */
function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return '[invalid-email]';
  const [local, domain] = email.split('@');
  return `${local.charAt(0)}***@${domain}`;
}

/**
 * Neutralises request-derived strings before they are logged: removes CR/LF
 * (log forging) and caps the length. JSON logs escape these anyway, but the
 * plain-text console/file formats would not.
 */
function safeForLog(value, maxLength = 300) {
  if (value === null || value === undefined) return value;
  return String(value).replace(/[\r\n]+/g, ' ').slice(0, maxLength);
}

function sanitiseDetails(details) {
  if (!details || typeof details !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(details)) {
    out[key] = typeof value === 'string' ? safeForLog(value) : value;
  }
  return out;
}

module.exports = logger;
module.exports.maskEmail = maskEmail;
module.exports.redact = redact;
module.exports.safeForLog = safeForLog;
module.exports.sanitiseDetails = sanitiseDetails;
