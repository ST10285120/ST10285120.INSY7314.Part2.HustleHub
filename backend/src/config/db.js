const mongoose = require('mongoose');
const config = require('./env');
const logger = require('../utils/logger');

async function connectDB() {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongo.uri);
    logger.info(`MongoDB connected: ${mongoose.connection.name}`);
  } catch (err) {
    logger.error('MongoDB connection failed.', { message: err.message });
    console.error(
      '\nCould not connect to MongoDB. Check MONGODB_URI in your .env file and ' +
        'make sure a MongoDB instance is running (see README for setup).\n'
    );
    process.exit(1);
  }
}

async function disconnectDB() {
  await mongoose.connection.close();
}

module.exports = { connectDB, disconnectDB };
