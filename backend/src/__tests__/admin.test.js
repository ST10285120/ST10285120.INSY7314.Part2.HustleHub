const request = require('supertest');
const { connect, closeDatabase, clearDatabase } = require('./testDb');
const { registerAndLogin, createAdminAndLogin, createGig, book, PASSWORD } = require('./helpers');

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
const Gig = require('../models/Gig');

const ADMIN_GET_ROUTES = [
  '/api/admin/stats',
  '/api/admin/users',
  '/api/admin/gigs',
  '/api/admin/bookings',
  '/api/admin/transactions',
  '/api/admin/audit-logs',
];

describe('Admin RBAC', () => {
  it.each(ADMIN_GET_ROUTES)('returns 403 to clients and freelancers on GET %s', async (route) => {
    const client = await registerAndLogin(app, { role: 'client' });
    const freelancer = await registerAndLogin(app, { role: 'freelancer' });

    const asClient = await request(app).get(route).set('Authorization', `Bearer ${client.token}`);
    const asFreelancer = await request(app)
      .get(route)
      .set('Authorization', `Bearer ${freelancer.token}`);

    expect(asClient.status).toBe(403);
    expect(asFreelancer.status).toBe(403);
  });

  it.each(ADMIN_GET_ROUTES)('returns 401 without a token on GET %s', async (route) => {
    const res = await request(app).get(route);
    expect(res.status).toBe(401);
  });

  it.each(ADMIN_GET_ROUTES)('returns 200 to an admin on GET %s', async (route) => {
    const admin = await createAdminAndLogin(app);
    const res = await request(app).get(route).set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('blocks non-admins from removing gigs or suspending users', async () => {
    const freelancer = await registerAndLogin(app, { role: 'freelancer' });
    const other = await registerAndLogin(app, { role: 'client' });
    const gig = await createGig(app, freelancer.token);

    const del = await request(app)
      .delete(`/api/admin/gigs/${gig._id}`)
      .set('Authorization', `Bearer ${freelancer.token}`);
    const suspend = await request(app)
      .patch(`/api/admin/users/${other.user.id}/status`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ isActive: false });

    expect(del.status).toBe(403);
    expect(suspend.status).toBe(403);
    expect(await Gig.countDocuments({})).toBe(1);
  });

  it('cannot register an admin through the public API', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Sneaky',
      email: 'sneaky@example.com',
      password: PASSWORD,
      role: 'admin',
    });
    expect(res.status).toBe(400);
  });
});

describe('Admin capabilities', () => {
  it('lists every user, booking and transaction on the platform', async () => {
    const admin = await createAdminAndLogin(app);
    const freelancer = await registerAndLogin(app, { role: 'freelancer' });
    const client = await registerAndLogin(app, { role: 'client' });
    const gig = await createGig(app, freelancer.token, { price: 900 });
    await book(app, client.token, gig);

    const auth = { Authorization: `Bearer ${admin.token}` };
    const users = await request(app).get('/api/admin/users').set(auth);
    const bookings = await request(app).get('/api/admin/bookings').set(auth);
    const transactions = await request(app).get('/api/admin/transactions').set(auth);
    const stats = await request(app).get('/api/admin/stats').set(auth);

    expect(users.body.data.users).toHaveLength(3);
    users.body.data.users.forEach((u) => expect(u.passwordHash).toBeUndefined());
    expect(bookings.body.data.bookings).toHaveLength(1);
    expect(transactions.body.data.transactions).toHaveLength(1);
    expect(stats.body.data.transactions.volume).toBe(900);
    expect(stats.body.data.users).toEqual({ client: 1, freelancer: 1, admin: 1 });
  });

  it('filters users by role', async () => {
    const admin = await createAdminAndLogin(app);
    await registerAndLogin(app, { role: 'freelancer' });
    await registerAndLogin(app, { role: 'client' });
    const res = await request(app)
      .get('/api/admin/users?role=freelancer')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.body.data.users).toHaveLength(1);
    expect(res.body.data.users[0].role).toBe('freelancer');
  });

  it('removes any gig, while keeping the financial records', async () => {
    const admin = await createAdminAndLogin(app);
    const freelancer = await registerAndLogin(app, { role: 'freelancer' });
    const client = await registerAndLogin(app, { role: 'client' });
    const gig = await createGig(app, freelancer.token);
    await book(app, client.token, gig);

    const res = await request(app)
      .delete(`/api/admin/gigs/${gig._id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(await Gig.countDocuments({})).toBe(0);

    const tx = await request(app)
      .get('/api/admin/transactions')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(tx.body.data.transactions).toHaveLength(1);
  });

  it('suspends a user, which revokes their token and blocks login', async () => {
    const admin = await createAdminAndLogin(app);
    const client = await registerAndLogin(app, { role: 'client' });

    const suspend = await request(app)
      .patch(`/api/admin/users/${client.user.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: false });
    expect(suspend.status).toBe(200);

    const profile = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${client.token}`);
    expect(profile.status).toBe(401);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: client.email, password: PASSWORD });
    expect(login.status).toBe(401);
    expect(login.body.message).toBe('Invalid email or password.');

    const reactivate = await request(app)
      .patch(`/api/admin/users/${client.user.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: true });
    expect(reactivate.status).toBe(200);
    const loginAgain = await request(app)
      .post('/api/auth/login')
      .send({ email: client.email, password: PASSWORD });
    expect(loginAgain.status).toBe(200);
  });

  it('will not let an admin suspend themselves or another admin', async () => {
    const admin = await createAdminAndLogin(app);
    const otherAdmin = await createAdminAndLogin(app);

    const self = await request(app)
      .patch(`/api/admin/users/${admin.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: false });
    const other = await request(app)
      .patch(`/api/admin/users/${otherAdmin.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: false });

    expect(self.status).toBe(400);
    expect(other.status).toBe(403);
  });

  it('validates ids and request bodies', async () => {
    const admin = await createAdminAndLogin(app);
    const auth = { Authorization: `Bearer ${admin.token}` };

    const badId = await request(app).delete('/api/admin/gigs/not-an-id').set(auth);
    const missingBody = await request(app)
      .patch('/api/admin/users/64a1f0c2e1b1c2d3e4f5a6b7/status')
      .set(auth)
      .send({});
    const badFilter = await request(app).get('/api/admin/audit-logs?event=drop-tables').set(auth);

    expect(badId.status).toBe(400);
    expect(missingBody.status).toBe(400);
    expect(badFilter.status).toBe(400);
  });
});
