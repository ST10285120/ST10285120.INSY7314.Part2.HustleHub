const fs = require('fs');
const https = require('https');
const app = require('./src/app');
const config = require('./src/config/env');
const logger = require('./src/utils/logger');
const { connectDB } = require('./src/config/db');

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

async function start() {
  await connectDB();

  const server = https.createServer(credentials, app);

  server.listen(config.port, () => {
    logger.info(`HustleHub+ API listening on https://localhost:${config.port}`);
  });
}

start();

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
  process.exit(1);
});
