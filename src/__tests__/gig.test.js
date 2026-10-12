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

const sampleGig = {
  title: 'Logo design',
  description: 'I will design a clean, modern logo for your brand.',
  category: 'Design',
  price: 250,
};

describe('POST /api/gigs', () => {
  it('allows a freelancer to create a gig', async () => {
    const { token } = await registerAndLogin({ role: 'freelancer' });
    const res = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleGig);
    expect(res.status).toBe(201);
    expect(res.body.data.gig.title).toBe(sampleGig.title);
  });

  it('rejects a client trying to create a gig (RBAC)', async () => {
    const { token } = await registerAndLogin({ role: 'client' });
    const res = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleGig);
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/gigs').send(sampleGig);
    expect(res.status).toBe(401);
  });

  it('rejects a negative price', async () => {
    const { token } = await registerAndLogin({ role: 'freelancer' });
    const res = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...sampleGig, price: -10 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/gigs', () => {
  it('lists active gigs without requiring authentication', async () => {
    const { token } = await registerAndLogin({ role: 'freelancer' });
    await request(app).post('/api/gigs').set('Authorization', `Bearer ${token}`).send(sampleGig);

    const res = await request(app).get('/api/gigs');
    expect(res.status).toBe(200);
    expect(res.body.data.gigs.length).toBe(1);
  });
});

describe('Gig ownership enforcement', () => {
  it('prevents a freelancer from updating another freelancer\'s gig', async () => {
    const owner = await registerAndLogin({ role: 'freelancer' });
    const intruder = await registerAndLogin({ role: 'freelancer' });

    const createRes = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(sampleGig);
    const gigId = createRes.body.data.gig._id || createRes.body.data.gig.id;

    const updateRes = await request(app)
      .put(`/api/gigs/${gigId}`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ title: 'Hijacked title' });

    expect(updateRes.status).toBe(404);
  });

  it('prevents a freelancer from deleting another freelancer\'s gig', async () => {
    const owner = await registerAndLogin({ role: 'freelancer' });
    const intruder = await registerAndLogin({ role: 'freelancer' });

    const createRes = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(sampleGig);
    const gigId = createRes.body.data.gig._id || createRes.body.data.gig.id;

    const deleteRes = await request(app)
      .delete(`/api/gigs/${gigId}`)
      .set('Authorization', `Bearer ${intruder.token}`);

    expect(deleteRes.status).toBe(404);
  });

  it('allows the owning freelancer to update their own gig', async () => {
    const owner = await registerAndLogin({ role: 'freelancer' });

    const createRes = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(sampleGig);
    const gigId = createRes.body.data.gig._id || createRes.body.data.gig.id;

    const updateRes = await request(app)
      .put(`/api/gigs/${gigId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ price: 300 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.gig.price).toBe(300);
  });

  it('only returns the freelancer\'s own gigs from /api/gigs/my', async () => {
    const freelancerA = await registerAndLogin({ role: 'freelancer' });
    const freelancerB = await registerAndLogin({ role: 'freelancer' });

    await request(app).post('/api/gigs').set('Authorization', `Bearer ${freelancerA.token}`).send(sampleGig);
    await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${freelancerB.token}`)
      .send({ ...sampleGig, title: 'Other gig' });

    const res = await request(app).get('/api/gigs/my').set('Authorization', `Bearer ${freelancerA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.gigs.length).toBe(1);
    expect(res.body.data.gigs[0].title).toBe(sampleGig.title);
  });
});
