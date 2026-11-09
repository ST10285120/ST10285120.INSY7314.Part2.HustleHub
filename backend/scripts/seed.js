/**
 * Seeds a database with demo data for the video walkthrough and manual testing.
 *
 *   npm run seed              -> admin (from .env) + demo freelancer, client, gigs, bookings
 *   npm run seed -- --reset   -> same, but wipes the demo collections first
 *
 * Demo accounts all use the password in SEED_PASSWORD (default below).
 * Refuses to run when NODE_ENV=production.
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const config = require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');
const { ensureAdminAccount } = require('../src/config/bootstrapAdmin');
const User = require('../src/models/User');
const Gig = require('../src/models/Gig');
const Booking = require('../src/models/Booking');
const Transaction = require('../src/models/Transaction');
const AuditLog = require('../src/models/AuditLog');

const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Demo!Passw0rd2026';

const DEMO_USERS = [
  { name: 'Naledi Khumalo', email: 'naledi.freelancer@hustlehub.test', role: 'freelancer' },
  { name: 'Sipho Dlamini', email: 'sipho.freelancer@hustlehub.test', role: 'freelancer' },
  { name: 'Thabo Mokoena', email: 'thabo.client@hustlehub.test', role: 'client' },
  { name: 'Ayesha Patel', email: 'ayesha.client@hustlehub.test', role: 'client' },
];

const DEMO_GIGS = [
  { owner: 0, title: 'Logo and brand kit', category: 'Design', price: 2500, description: 'A logo, colour palette and type pairing for a new small business.' },
  { owner: 0, title: 'Social media graphics (10 posts)', category: 'Design', price: 1800, description: 'Ten on-brand post templates sized for Instagram and LinkedIn.' },
  { owner: 0, title: 'Landing page in React', category: 'Development', price: 6500, description: 'A fast, responsive single-page site with a contact form.' },
  { owner: 1, title: 'CV and cover letter rewrite', category: 'Writing', price: 950, description: 'A professional rewrite of your CV and a tailored cover letter.' },
  { owner: 1, title: 'Product photography (20 shots)', category: 'Photography', price: 3200, description: 'Clean studio shots on a white background, edited and delivered in 3 days.' },
];

// [gigIndex, clientIndex, monthsAgo]
const DEMO_BOOKINGS = [
  [0, 2, 7], [2, 3, 6], [1, 2, 5], [0, 3, 4], [2, 2, 3],
  [1, 3, 2], [0, 2, 1], [2, 3, 1], [1, 2, 0], [3, 3, 2], [4, 2, 1],
];

function monthsAgo(n) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  d.setUTCDate(Math.min(d.getUTCDate(), 25));
  return d;
}

async function main() {
  if (config.nodeEnv === 'production') {
    throw new Error('Refusing to seed demo data with NODE_ENV=production.');
  }
  const reset = process.argv.includes('--reset');

  await connectDB();

  if (reset) {
    const demoEmails = DEMO_USERS.map((u) => u.email);
    const demoUsers = await User.find({ email: { $in: demoEmails } }).select('_id');
    const ids = demoUsers.map((u) => u._id);
    await Promise.all([
      Transaction.deleteMany({ freelancer: { $in: ids } }),
      Booking.deleteMany({ freelancer: { $in: ids } }),
      Gig.deleteMany({ freelancer: { $in: ids } }),
      AuditLog.deleteMany({ actor: { $in: ids } }),
    ]);
    await User.deleteMany({ _id: { $in: ids } });
    console.log('Removed existing demo data.');
  }

  const admin = await ensureAdminAccount();
  if (admin) console.log(`Admin account ready: ${admin.email}`);

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, config.bcrypt.saltRounds);
  const users = [];
  for (const u of DEMO_USERS) {
    const user = await User.findOneAndUpdate(
      { email: u.email },
      { $setOnInsert: { ...u, passwordHash } },
      { upsert: true, new: true }
    );
    users.push(user);
  }

  const existingGigs = await Gig.countDocuments({ freelancer: users[0]._id });
  if (existingGigs > 0 && !reset) {
    console.log('Demo gigs already exist - run with --reset to recreate them.');
  } else {
    const gigs = await Gig.insertMany(
      DEMO_GIGS.map(({ owner, ...g }) => ({ ...g, freelancer: users[owner]._id }))
    );

    for (const [gigIndex, clientIndex, ago] of DEMO_BOOKINGS) {
      const gig = gigs[gigIndex];
      const when = monthsAgo(ago);
      const booking = await new Booking({
        gig: gig._id,
        client: users[clientIndex]._id,
        freelancer: gig.freelancer,
        amount: gig.price,
        createdAt: when,
        updatedAt: when,
      }).save({ timestamps: false });
      const txn = await new Transaction({
        booking: booking._id,
        gig: gig._id,
        client: users[clientIndex]._id,
        freelancer: gig.freelancer,
        amount: gig.price,
        createdAt: when,
        updatedAt: when,
      }).save({ timestamps: false });
      booking.transaction = txn._id;
      await booking.save({ timestamps: false });
    }
    console.log(`Created ${gigs.length} gigs and ${DEMO_BOOKINGS.length} bookings with transactions.`);
  }

  console.log('\nDemo logins (password for all: SEED_PASSWORD or the default in scripts/seed.js):');
  DEMO_USERS.forEach((u) => console.log(`  ${u.role.padEnd(10)} ${u.email}`));
}

main()
  .catch((err) => {
    console.error(`Seeding failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState === 1) await disconnectDB();
  });
