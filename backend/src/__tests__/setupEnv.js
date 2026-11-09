// Runs before every test file (see "jest.setupFiles" in package.json), so the
// suite works in CI without a .env file. dotenv never overrides these.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-that-is-long-enough-for-hs256-signing';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/unused-in-tests';
process.env.BCRYPT_SALT_ROUNDS = '4'; // fast hashing in tests only
process.env.LOG_TO_FILE = 'false';
process.env.BETTERSTACK_SOURCE_TOKEN = '';
process.env.BETTERSTACK_INGESTING_HOST = '';
// Test files register many users from one IP; keep the general limiters out of
// the way. rateLimit.test.js overrides these to prove the limits work.
process.env.API_RATE_LIMIT_MAX = '10000';
process.env.REGISTER_RATE_LIMIT_MAX = '10000';
process.env.BOOKING_RATE_LIMIT_MAX = '10000';
process.env.LOGIN_RATE_LIMIT_MAX = '10000';
