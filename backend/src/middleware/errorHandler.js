const logger = require('../utils/logger');
const { safeForLog } = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

function notFoundHandler(req, res, next) {
  next(new AppError('The requested resource was not found.', 404));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON bodies and oversized payloads come from body-parser.
  if (err.type === 'entity.parse.failed') {
    err = new AppError('Request body is not valid JSON.', 400);
  } else if (err.type === 'entity.too.large') {
    err = new AppError('Request body is too large.', 413);
  }

  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational === true;
  const level = statusCode >= 500 ? 'error' : 'warn';

  logger.log(level, safeForLog(err.message, 500), {
    // Stack traces are kept for unexpected errors only; they go to the logs,
    // never to the client.
    stack: statusCode >= 500 ? err.stack : undefined,
    path: safeForLog(req.originalUrl),
    method: safeForLog(req.method, 10),
    statusCode,
    userId: req.user ? req.user.sub : undefined,
    requestId: req.id,
  });

  res.status(statusCode).json({
    success: false,
    message: isOperational ? err.message : 'An unexpected error occurred. Please try again later.',
    requestId: req.id,
  });
}

module.exports = { AppError, notFoundHandler, errorHandler };
