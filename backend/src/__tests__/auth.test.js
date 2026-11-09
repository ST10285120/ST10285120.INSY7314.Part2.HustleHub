const request = require('supertest');
const { connect, closeDatabase, clearDatabase } = require('./testDb');

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

const validUser = {
  name: 'Thabo Mokoena',
  email: 'thabo@example.com',
  password: 'Str0ng!Passw0rd',
  role: 'freelancer',
};

describe('POST /api/auth/register', () => {
  it('registers a new user and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('rejects duplicate email registration', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects a weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'weak@example.com', password: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects an invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid role value', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'roletest@example.com', role: 'superadmin' });
    expect(res.status).toBe(400);
  });

  it('strips script tags out of the name field (XSS defence)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'xss@example.com', name: '<script>alert(1)</script>' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.name).not.toContain('<script>');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  it('logs in with correct credentials and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
  });

  it('rejects an incorrect password with a generic message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'WrongPassword1!' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password.');
  });

  it('rejects a non-existent email with the same generic message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'WrongPassword1!' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password.');
  });

  it('rejects a NoSQL injection attempt in the email field', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: 'WrongPassword1!' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/profile (protected route)', () => {
  it('rejects requests with no token', async () => {
    const res = await request(app).get('/api/auth/profile');
    expect(res.status).toBe(401);
  });

  it('rejects requests with an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('allows access with a valid token and returns the user profile', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    const token = loginRes.body.data.token;

    const res = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(validUser.email);
  });
});
