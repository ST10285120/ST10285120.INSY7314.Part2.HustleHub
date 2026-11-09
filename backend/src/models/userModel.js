const User = require('./User');

function normaliseEmail(email) {
  return String(email).trim().toLowerCase();
}

function findByEmail(email) {
  return User.findOne({ email: normaliseEmail(email) }).select(
    '+passwordHash +failedLoginAttempts +lockUntil'
  );
}

function findById(id) {
  return User.findById(id);
}

function createUser({ name, email, passwordHash, role }) {
  return User.create({
    name,
    email: normaliseEmail(email),
    passwordHash,
    role: role || 'client',
  });
}

function toSafeUser(user) {
  if (!user) return null;
  const obj = typeof user.toObject === 'function' ? user.toObject() : user;
  const { passwordHash, failedLoginAttempts, lockUntil, tokenVersion, __v, _id, ...rest } = obj;
  return { id: String(_id), ...rest };
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  toSafeUser,
};
