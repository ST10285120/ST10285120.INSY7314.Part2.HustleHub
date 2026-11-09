const fs = require('fs');
const https = require('https');
const app = require('./src/app');
const config = require('./src/config/env');
const logger = require('./src/utils/logger');
const { connectDB, disconnectDB } = require('./src/config/db');
const { ensureAdminAccount } = require('./src/config/bootstrapAdmin');

function loadTlsCredentials() {
  try {
    return {
      key: fs.readFileSync(config.ssl.keyPath),
      cert: fs.readFileSync(config.ssl.certPath),
    };
  } catch (err) {
    logger.error('Failed to load TLS certificate/key.', {
      keyPath: config.ssl.keyPath,
      certPath: config.ssl.certPath,
    });
    console.error(
      '\nCould not find SSL key/cert. Generate a local certificate first:\n' +
        '  npm run cert\n' +
        'or see the README for manual openssl instructions.\n'
    );
    process.exit(1);
  }
}

const credentials = loadTlsCredentials();
let server;

async function start() {
  await connectDB();
  await ensureAdminAccount();

  server = https.createServer({ ...credentials, minVersion: 'TLSv1.2' }, app);

  server.listen(config.port, () => {
    logger.info(`HustleHub+ API listening on https://localhost:${config.port}`, {
      env: config.nodeEnv,
      cloudLogging: logger.cloudLoggingEnabled,
    });
  });
}

async function shutdown(signal) {
  logger.info(`${signal} received - shutting down gracefully.`);
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();

  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDB().catch(() => {});
  // Give the cloud log transport a moment to flush its last batch.
  await Promise.all(
    logger.transports.map((t) => (typeof t.flush === 'function' ? t.flush() : null))
  ).catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  process.exit(1);
});

start();
