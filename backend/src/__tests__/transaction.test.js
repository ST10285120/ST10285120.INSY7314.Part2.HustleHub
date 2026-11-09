const request = require('supertest');
const { connect, closeDatabase, clearDatabase } = require('./testDb');
const { registerAndLogin, createGig, book } = require('./helpers');

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
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');

describe('Transactions created with bookings', () => {
  it('stores exactly one transaction per booking, linked both ways', async () => {
    const freelancer = await registerAndLogin(app, { role: 'freelancer' });
    const client = await registerAndLogin(app, { role: 'client' });
    const gig = await createGig(app, freelancer.token, { price: 1200 });

    const res = await book(app, client.token, gig);
    expect(res.status).toBe(201);

    const transactions = await Transaction.find({});
    expect(transactions).toHaveLength(1);
    const booking = await Booking.findById(res.body.data.booking._id);
    expect(String(booking.transaction)).toBe(String(transactions[0]._id));
    expect(String(transactions[0].booking)).toBe(String(booking._id));
    expect(transactions[0].currency).toBe('ZAR');
    expect(transactions[0].paymentMethod).toBe('simulated');
  });

  it('does not create a transaction when the booking is rejected', async () => {
    const freelancer = await registerAndLogin(app, { role: 'freelancer' });
    const gig = await createGig(app, freelancer.token);
    await book(app, freelancer.token, gig); // freelancer can't book -> 403
    expect(await Transaction.countDocuments({})).toBe(0);
  });
});

describe('GET /api/transactions/my', () => {
  it('shows the client what they paid and the freelancer what they earned', async () => {
    const freelancer = await registerAndLogin(app, { role: 'freelancer' });
    const client = await registerAndLogin(app, { role: 'client' });
    const gig = await createGig(app, freelancer.token, { price: 500 });
    await book(app, client.token, gig);

    const asClient = await request(app)
      .get('/api/transactions/my')
      .set('Authorization', `Bearer ${client.token}`);
    const asFreelancer = await request(app)
      .get('/api/transactions/my')
      .set('Authorization', `Bearer ${freelancer.token}`);

    expect(asClient.status).toBe(200);
    expect(asClient.body.data.transactions).toHaveLength(1);
    expect(asFreelancer.status).toBe(200);
    expect(asFreelancer.body.data.transactions).toHaveLength(1);
    expect(asFreelancer.body.data.transactions[0].amount).toBe(500);
  });

  it("never returns another user's transactions", async () => {
    const freelancer = await registerAndLogin(app, { role: 'freelancer' });
    const client = await registerAndLogin(app, { role: 'client' });
    const stranger = await registerAndLogin(app, { role: 'client' });
    const gig = await createGig(app, freelancer.token);
    await book(app, client.token, gig);

    const res = await request(app)
      .get('/api/transactions/my')
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.transactions).toHaveLength(0);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/transactions/my');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/transactions/:id', () => {
  it('lets either party view it, and returns 404 to anyone else', async () => {
    const freelancer = await registerAndLogin(app, { role: 'freelancer' });
    const client = await registerAndLogin(app, { role: 'client' });
    const stranger = await registerAndLogin(app, { role: 'freelancer' });
    const gig = await createGig(app, freelancer.token);
    const bookingRes = await book(app, client.token, gig);
    const txId = bookingRes.body.data.transaction._id;

    for (const party of [client, freelancer]) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await request(app)
        .get(`/api/transactions/${txId}`)
        .set('Authorization', `Bearer ${party.token}`);
      expect(ok.status).toBe(200);
    }

    const denied = await request(app)
      .get(`/api/transactions/${txId}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(denied.status).toBe(404);
  });

  it('rejects a malformed id with 400', async () => {
    const client = await registerAndLogin(app, { role: 'client' });
    const res = await request(app)
      .get('/api/transactions/not-an-id')
      .set('Authorization', `Bearer ${client.token}`);
    expect(res.status).toBe(400);
  });
});

describe('Income is derived from transactions', () => {
  it('ignores refunded transactions in the income total', async () => {
    const freelancer = await registerAndLogin(app, { role: 'freelancer' });
    const client = await registerAndLogin(app, { role: 'client' });
    const gigA = await createGig(app, freelancer.token, { price: 300 });
    const gigB = await createGig(app, freelancer.token, { price: 700 });
    await book(app, client.token, gigA);
    const second = await book(app, client.token, gigB);

    await Transaction.updateOne(
      { _id: second.body.data.transaction._id },
      { $set: { status: 'refunded' } }
    );

    const res = await request(app)
      .get('/api/bookings/freelancer/income')
      .set('Authorization', `Bearer ${freelancer.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalIncome).toBe(300);
    expect(res.body.data.totalBookings).toBe(1);
  });
});
