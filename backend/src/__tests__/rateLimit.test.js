// Use small limits for this file only (env is read when the app is required).
process.env.LOGIN_RATE_LIMIT_MAX = '10';
process.env.REGISTER_RATE_LIMIT_MAX = '5';
process.env.LOCKOUT_MAX_ATTEMPTS = '1000'; // keep account lockout out of this test

const request = require('supertest');
const { connect, closeDatabase } = require('./testDb');
const { PASSWORD } = require('./helpers');

beforeAll(async () => {
  await connect();
});

afterAll(async () => {
  await closeDatabase();
});

const app = require('../app');

const MAX_ATTEMPTS = 25;

/**
 * Sends requests in a loop until the server answers 429, then returns how
 * many requests it took and the final response.
 */
async function hammerUntil429(sendRequest) {
  let res;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    res = await sendRequest(attempt);
    if (res.status === 429) return { attempt, res };
  }
  return { attempt: MAX_ATTEMPTS, res };
}

describe('Rate limiting', () => {
  it('does not count successful logins against the login limit', async () => {
    const email = 'ratelimit.ok@example.com';
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Rate Limit', email, password: PASSWORD, role: 'client' });

    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
      expect(res.status).toBe(200);
    }
  });

  it('blocks repeated failed logins with 429 after 10 failures', async () => {
    const { attempt, res } = await hammerUntil429(() =>
      request(app)
        .post('/api/auth/login')
        .send({ email: 'ratelimit.target@example.com', password: 'Wrong!Passw0rd' })
    );

    expect(res.status).toBe(429);
    // 10 failures are allowed; the 11th is refused. (Allow one request of slack
    // because successful-request credits are released asynchronously.)
    expect(attempt).toBeGreaterThanOrEqual(10);
    expect(attempt).toBeLessThanOrEqual(11);
    expect(res.body).toEqual({
      success: false,
      message: 'Too many login attempts. Please try again later.',
    });
    // IETF draft-7 headers tell clients the policy.
    expect(res.headers.ratelimit).toBeDefined();
    expect(res.headers['ratelimit-policy']).toBeDefined();
  });

  it('keeps blocking while the window is open, even with the right password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ratelimit.ok@example.com', password: PASSWORD });
    expect(res.status).toBe(429);
  });

  it('blocks registration floods with 429', async () => {
    const { res } = await hammerUntil429((n) =>
      request(app)
        .post('/api/auth/register')
        .send({ name: 'Flood', email: `flood${n}@example.com`, password: PASSWORD, role: 'client' })
    );
    expect(res.status).toBe(429);
    expect(res.body.message).toBe(
      'Too many registration attempts from this address. Please try again later.'
    );
  });
});
