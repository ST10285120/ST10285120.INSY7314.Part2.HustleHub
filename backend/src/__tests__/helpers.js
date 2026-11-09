const request = require('supertest');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const PASSWORD = 'Str0ng!Passw0rd';

function uniqueEmail(prefix = 'user') {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function registerAndLogin(app, overrides = {}) {
  const user = {
    name: 'Test User',
    email: uniqueEmail(overrides.role || 'user'),
    password: PASSWORD,
    role: 'freelancer',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(user);
  return { token: res.body.data.token, user: res.body.data.user, email: user.email, password: user.password };
}

/** Admins can't register through the API, so tests create one directly. */
async function createAdminAndLogin(app) {
  const email = uniqueEmail('admin');
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const admin = await User.create({ name: 'Test Admin', email, passwordHash, role: 'admin' });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { token: res.body.data.token, user: res.body.data.user, id: admin.id, email };
}

async function createGig(app, token, overrides = {}) {
  const res = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Logo design',
      description: 'I will design a clean, modern logo for your brand.',
      category: 'Design',
      price: 250,
      ...overrides,
    });
  return res.body.data.gig;
}

async function book(app, token, gig) {
  return request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ gigId: gig._id || gig.id });
}

/** Audit records are written asynchronously; poll briefly for them. */
async function waitFor(fn, { timeoutMs = 2000, intervalMs = 50 } = {}) {
  const started = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const result = await fn();
    if (result) return result;
    if (Date.now() - started > timeoutMs) return result;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

module.exports = { PASSWORD, uniqueEmail, registerAndLogin, createAdminAndLogin, createGig, book, waitFor };
