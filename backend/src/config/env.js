const path = require('path');
require('dotenv').config();

const REQUIRED_VARS = ['JWT_SECRET', 'MONGODB_URI'];
const PLACEHOLDER_SECRET = 'replace_this_with_a_long_random_secret';

function assertRequiredVarsPresent() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy .env.example to .env and populate it before starting the server.'
    );
  }

  if (process.env.NODE_ENV === 'production') {
    if (process.env.JWT_SECRET === PLACEHOLDER_SECRET) {
      throw new Error('Refusing to start in production with the default JWT_SECRET placeholder.');
    }
    if (process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long in production.');
    }
  }
}

function intFromEnv(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// TRUST_PROXY tells Express how many reverse proxies sit in front of the API.
// It must only be set when the API is NOT reachable directly, otherwise a
// client could forge X-Forwarded-For and dodge IP-based rate limiting.
function trustProxyFromEnv() {
  const raw = process.env.TRUST_PROXY;
  if (!raw || raw === 'false' || raw === '0') return false;
  const hops = parseInt(raw, 10);
  return Number.isFinite(hops) && hops > 0 ? hops : false;
}

assertRequiredVarsPresent();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isTest: process.env.NODE_ENV === 'test',
  port: intFromEnv('PORT', 5443),
  trustProxy: trustProxyFromEnv(),
  mongo: {
    uri: process.env.MONGODB_URI,
  },
  ssl: {
    keyPath: path.resolve(process.env.SSL_KEY_PATH || './certs/key.pem'),
    certPath: path.resolve(process.env.SSL_CERT_PATH || './certs/cert.pem'),
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
  bcrypt: {
    saltRounds: intFromEnv('BCRYPT_SALT_ROUNDS', 12),
  },
  corsOrigin: process.env.CORS_ORIGIN || 'https://localhost:3000',
  rateLimits: {
    apiMax: intFromEnv('API_RATE_LIMIT_MAX', 500),
    loginMax: intFromEnv('LOGIN_RATE_LIMIT_MAX', 10),
    registerMax: intFromEnv('REGISTER_RATE_LIMIT_MAX', 20),
    bookingMax: intFromEnv('BOOKING_RATE_LIMIT_MAX', 30),
  },
  lockout: {
    maxFailedAttempts: intFromEnv('LOCKOUT_MAX_ATTEMPTS', 5),
    durationMinutes: intFromEnv('LOCKOUT_MINUTES', 15),
  },
  admin: {
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
    name: process.env.ADMIN_NAME || 'Platform Admin',
  },
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    toFile: process.env.LOG_TO_FILE !== 'false',
    betterStack: {
      sourceToken: process.env.BETTERSTACK_SOURCE_TOKEN || '',
      ingestingHost: process.env.BETTERSTACK_INGESTING_HOST || '',
    },
  },
};
