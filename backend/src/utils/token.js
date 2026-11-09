const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

const ALGORITHM = 'HS256';
const ISSUER = 'hustlehub-api';
const AUDIENCE = 'hustlehub-client';

function generateToken(user) {
  const payload = {
    sub: String(user.id || user._id),
    email: user.email,
    role: user.role,
    tv: user.tokenVersion || 0,
  };

  return jwt.sign(payload, config.jwt.secret, {
    algorithm: ALGORITHM,
    expiresIn: config.jwt.expiresIn,
    issuer: ISSUER,
    audience: AUDIENCE,
    jwtid: crypto.randomUUID(),
  });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

module.exports = { generateToken, verifyToken };
