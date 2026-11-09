const request = require('supertest');
const { connect, closeDatabase, clearDatabase } = require('./testDb');
const { registerAndLogin, createAdminAndLogin, PASSWORD, waitFor } = require('./helpers');

beforeAll(async () => {
  await connect();
});

afterEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

const app = require('../app');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

function login(email, password) {
  return request(app).post('/api/auth/login').send({ email, password });
}

describe('Own security feature: server-side logout / token revocation', () => {
  it('revokes the token immediately on logout', async () => {
    const { token } = await registerAndLogin(app, { role: 'client' });
    const auth = { Authorization: `Bearer ${token}` };

    expect((await request(app).get('/api/auth/profile').set(auth)).status).toBe(200);

    const logout = await request(app).post('/api/auth/logout').set(auth);
    expect(logout.status).toBe(200);

    // The JWT is still cryptographically valid and unexpired, but rejected.
    expect((await request(app).get('/api/auth/profile').set(auth)).status).toBe(401);
  });

  it('logs out every session of the user, not just the current one', async () => {
    const { email } = await registerAndLogin(app, { role: 'freelancer' });
    const laptop = (await login(email, PASSWORD)).body.data.token;
    const phone = (await login(email, PASSWORD)).body.data.token;

    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${laptop}`);

    const res = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${phone}`);
    expect(res.status).toBe(401);
  });

  it('still allows logging in again after logout', async () => {
    const { email, token } = await registerAndLogin(app, { role: 'client' });
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    const res = await login(email, PASSWORD);
    expect(res.status).toBe(200);
    const profile = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${res.body.data.token}`);
    expect(profile.status).toBe(200);
  });
});

describe('Own security feature: account lockout', () => {
  it('locks the account after 5 failed attempts, even for the right password', async () => {
    const { email } = await registerAndLogin(app, { role: 'client' });

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await login(email, 'Wrong!Passw0rd');
      expect(res.status).toBe(401);
    }

    const user = await User.findOne({ email }).select('+lockUntil');
    expect(user.lockUntil.getTime()).toBeGreaterThan(Date.now());

    const correct = await login(email, PASSWORD);
    expect(correct.status).toBe(401);
    // Same generic message - the response doesn't reveal the lock.
    expect(correct.body.message).toBe('Invalid email or password.');
  });

  it('lets the user in again once the lock expires', async () => {
    const { email } = await registerAndLogin(app, { role: 'client' });
    await User.updateOne({ email }, { $set: { lockUntil: new Date(Date.now() - 1000) } });
    expect((await login(email, PASSWORD)).status).toBe(200);
  });

  it('resets the failure counter after a successful login', async () => {
    const { email } = await registerAndLogin(app, { role: 'client' });
    await login(email, 'Wrong!Passw0rd');
    await login(email, 'Wrong!Passw0rd');
    await login(email, PASSWORD);
    const user = await User.findOne({ email }).select('+failedLoginAttempts');
    expect(user.failedLoginAttempts).toBe(0);
  });

  it('can be unlocked early by an admin', async () => {
    const admin = await createAdminAndLogin(app);
    const { email, user } = await registerAndLogin(app, { role: 'client' });
    await User.updateOne({ email }, { $set: { lockUntil: new Date(Date.now() + 600000) } });

    const unlock = await request(app)
      .post(`/api/admin/users/${user.id}/unlock`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(unlock.status).toBe(200);
    expect((await login(email, PASSWORD)).status).toBe(200);
  });
});

describe('Own security feature: security audit trail', () => {
  it('records failed logins, successful logins and denied access', async () => {
    const client = await registerAndLogin(app, { role: 'client' });
    await login(client.email, 'Wrong!Passw0rd');
    await login(client.email, PASSWORD);
    await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${client.token}`);

    const events = await waitFor(async () => {
      const found = await AuditLog.distinct('event');
      return ['auth.login.failure', 'auth.login.success', 'access.denied'].every((e) =>
        found.includes(e)
      )
        ? found
        : null;
    });
    expect(events).toEqual(
      expect.arrayContaining(['auth.register', 'auth.login.failure', 'auth.login.success', 'access.denied'])
    );
  });

  it('never stores passwords or tokens in audit records', async () => {
    const client = await registerAndLogin(app, { role: 'client' });
    await login(client.email, 'Wrong!Passw0rd');
    const records = await waitFor(async () => {
      const r = await AuditLog.find({}).lean();
      return r.length >= 2 ? r : null;
    });
    const serialised = JSON.stringify(records);
    expect(serialised).not.toContain('Wrong!Passw0rd');
    expect(serialised).not.toContain(PASSWORD);
    expect(serialised).not.toContain(client.token);
    // Emails are masked.
    expect(serialised).not.toContain(client.email);
  });

  it('shows the audit trail to admins', async () => {
    const admin = await createAdminAndLogin(app);
    await login('nobody@example.com', 'Wrong!Passw0rd');
    const res = await waitFor(async () => {
      const r = await request(app)
        .get('/api/admin/audit-logs?outcome=failure')
        .set('Authorization', `Bearer ${admin.token}`);
      return r.body.data && r.body.data.logs.length > 0 ? r : null;
    });
    expect(res.status).toBe(200);
    expect(res.body.data.logs[0].outcome).toBe('failure');
  });
});

describe('Hardening', () => {
  it('sets security headers and a request id on every response', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('marks API responses as non-cacheable', async () => {
    const { token } = await registerAndLogin(app, { role: 'client' });
    const res = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('replaces an unsafe incoming X-Request-Id', async () => {
        const res = await request(app).get('/api/health').set('X-Request-Id', 'bad id <script>alert(1)</script>');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects malformed JSON with a clean 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.com", "password": ');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Request body is not valid JSON.');
  });

  it('rejects bodies over 10kb', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'x'.repeat(20 * 1024), email: 'big@example.com', password: PASSWORD });
    expect(res.status).toBe(413);
  });

  it('rejects tokens signed with a different secret', async () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ sub: '64a1f0c2e1b1c2d3e4f5a6b7', role: 'admin' }, 'attacker-secret', {
      algorithm: 'HS256',
    });
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects unsigned "alg: none" tokens', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: '64a1f0c2e1b1c2d3e4f5a6b7', role: 'admin' })
    ).toString('base64url');
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${header}.${payload}.`);
    expect(res.status).toBe(401);
  });

  it('ignores a role changed inside a token - the database role wins', async () => {
    const { token, user } = await registerAndLogin(app, { role: 'client' });
    await User.updateOne({ _id: user.id }, { $set: { role: 'freelancer' } });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ gigId: '64a1f0c2e1b1c2d3e4f5a6b7' });
    // The token says "client", but the user is now a freelancer -> 403.
    expect(res.status).toBe(403);
  });
});
