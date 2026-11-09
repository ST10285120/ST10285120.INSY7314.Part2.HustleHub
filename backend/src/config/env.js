const path = require('path');
require('dotenv').config();

const REQUIRED_VARS = ['JWT_SECRET', 'MONGODB_URI'];

function assertRequiredVarsPresent() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy .env.example to .env and populate it before starting the server.'
    );
  }

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.JWT_SECRET === 'replace_this_with_a_long_random_secret'
  ) {
    throw new Error('Refusing to start in production with the default JWT_SECRET placeholder.');
  }
}

assertRequiredVarsPresent();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5443,
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
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,
  },
  corsOrigin: process.env.CORS_ORIGIN || 'https://localhost:3000',
};
