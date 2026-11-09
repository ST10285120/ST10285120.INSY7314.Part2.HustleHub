const logger = require('../utils/logger');

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
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational === true;

  logger.error(err.message, {
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    statusCode,
  });

  res.status(statusCode).json({
    success: false,
    message: isOperational ? err.message : 'An unexpected error occurred. Please try again later.',
  });
}

module.exports = { AppError, notFoundHandler, errorHandler };
