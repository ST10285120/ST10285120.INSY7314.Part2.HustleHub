const User = require('./User');

function findByEmail(email) {
  const normalised = email.trim().toLowerCase();
  return User.findOne({ email: normalised }).select('+passwordHash');
}

function findById(id) {
  return User.findById(id).select('+passwordHash');
}

function createUser({ name, email, passwordHash, role }) {
  return User.create({
    name,
    email: email.trim().toLowerCase(),
    passwordHash,
    role: role || 'client',
  });
}

function toSafeUser(user) {
  if (!user) return null;
  const obj = typeof user.toObject === 'function' ? user.toObject() : user;
  const { passwordHash, __v, _id, ...rest } = obj;
  return { id: String(_id), ...rest };
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  toSafeUser,
};
