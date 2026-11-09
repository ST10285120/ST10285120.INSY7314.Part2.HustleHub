const jwt = require('jsonwebtoken');
const config = require('../config/env');

const ALGORITHM = 'HS256';

function generateToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, config.jwt.secret, {
    algorithm: ALGORITHM,
    expiresIn: config.jwt.expiresIn,
  });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, { algorithms: [ALGORITHM] });
}

module.exports = { generateToken, verifyToken };
