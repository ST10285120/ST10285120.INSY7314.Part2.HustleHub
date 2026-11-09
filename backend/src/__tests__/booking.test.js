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

async function registerAndLogin(overrides = {}) {
  const user = {
    name: 'Test User',
    email: `user${Date.now()}${Math.random()}@example.com`,
    password: 'Str0ng!Passw0rd',
    role: 'freelancer',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(user);
  return { token: res.body.data.token, user: res.body.data.user };
}

async function createGig(token, overrides = {}) {
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

describe('POST /api/bookings', () => {
  it('allows a client to book a gig and creates a transaction record', async () => {
    const freelancer = await registerAndLogin({ role: 'freelancer' });
    const client = await registerAndLogin({ role: 'client' });
    const gig = await createGig(freelancer.token);

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ gigId: gig._id || gig.id });

    expect(res.status).toBe(201);
    expect(res.body.data.booking.amount).toBe(gig.price);
    expect(res.body.data.booking.paymentStatus).toBe('paid');
  });

  it('rejects a freelancer trying to book a gig (RBAC)', async () => {
    const freelancer = await registerAndLogin({ role: 'freelancer' });
    const gig = await createGig(freelancer.token);

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ gigId: gig._id || gig.id });

    expect(res.status).toBe(403);
  });

  it('rejects a freelancer booking their own gig even via another client role check', async () => {
    const freelancer = await registerAndLogin({ role: 'freelancer' });
    const gig = await createGig(freelancer.token);
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ gigId: gig._id || gig.id });
    expect(res.status).toBe(403);
  });

  it('rejects booking a non-existent gig', async () => {
    const client = await registerAndLogin({ role: 'client' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ gigId: '64a1f0c2e1b1c2d3e4f5a6b7' });
    expect(res.status).toBe(404);
  });

  it('rejects a malformed gigId', async () => {
    const client = await registerAndLogin({ role: 'client' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ gigId: 'not-a-valid-id' });
    expect(res.status).toBe(400);
  });
});

describe('Booking visibility and income tracking', () => {
  it("shows the client their own booking in /api/bookings/my", async () => {
    const freelancer = await registerAndLogin({ role: 'freelancer' });
    const client = await registerAndLogin({ role: 'client' });
    const gig = await createGig(freelancer.token);

    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ gigId: gig._id || gig.id });

    const res = await request(app).get('/api/bookings/my').set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.bookings.length).toBe(1);
  });

  it('shows the freelancer bookings made against their gigs', async () => {
    const freelancer = await registerAndLogin({ role: 'freelancer' });
    const client = await registerAndLogin({ role: 'client' });
    const gig = await createGig(freelancer.token);

    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ gigId: gig._id || gig.id });

    const res = await request(app)
      .get('/api/bookings/freelancer')
      .set('Authorization', `Bearer ${freelancer.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.bookings.length).toBe(1);
  });

  it('a client cannot see the freelancer-only bookings endpoint', async () => {
    const client = await registerAndLogin({ role: 'client' });
    const res = await request(app)
      .get('/api/bookings/freelancer')
      .set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(403);
  });

  it('correctly totals income across multiple bookings', async () => {
    const freelancer = await registerAndLogin({ role: 'freelancer' });
    const clientA = await registerAndLogin({ role: 'client' });
    const clientB = await registerAndLogin({ role: 'client' });

    const gigA = await createGig(freelancer.token, { price: 100 });
    const gigB = await createGig(freelancer.token, { price: 150 });

    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${clientA.token}`)
      .send({ gigId: gigA._id || gigA.id });
    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${clientB.token}`)
      .send({ gigId: gigB._id || gigB.id });

    const res = await request(app)
      .get('/api/bookings/freelancer/income')
      .set('Authorization', `Bearer ${freelancer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalIncome).toBe(250);
    expect(res.body.data.totalBookings).toBe(2);
  });
});
