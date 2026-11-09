const { body, param, query, validationResult } = require('express-validator');
const { AGE_GROUPS } = require('../services/taxService');
const { AUDIT_EVENTS } = require('../models/AuditLog');

const ALLOWED_ROLES = ['client', 'freelancer'];

const registerValidationRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required.')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters.')
    .escape(),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('A valid email address is required.')
    .normalizeEmail(),

  body('password')
    .isString()
    .isLength({ min: 10, max: 128 })
    .withMessage('Password must be between 10 and 128 characters.')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter.')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number.')
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Password must contain at least one special character.'),

  body('role')
    .optional()
    .trim()
    .isIn(ALLOWED_ROLES)
    .withMessage(`Role must be one of: ${ALLOWED_ROLES.join(', ')}.`),
];

const loginValidationRules = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('A valid email address is required.')
    .normalizeEmail(),

  body('password').isString().notEmpty().withMessage('Password is required.'),
];

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  return next();
}

const createGigValidationRules = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required.')
    .isLength({ max: 120 })
    .withMessage('Title must be at most 120 characters.')
    .escape(),

  body('description')
    .trim()
    .notEmpty()
    .withMessage('Description is required.')
    .isLength({ max: 2000 })
    .withMessage('Description must be at most 2000 characters.')
    .escape(),

  body('category')
    .trim()
    .notEmpty()
    .withMessage('Category is required.')
    .isLength({ max: 60 })
    .withMessage('Category must be at most 60 characters.')
    .escape(),

  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number.')
    .toFloat(),
];

const updateGigValidationRules = [
  body('title').optional().trim().isLength({ max: 120 }).escape(),
  body('description').optional().trim().isLength({ max: 2000 }).escape(),
  body('category').optional().trim().isLength({ max: 60 }).escape(),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number.').toFloat(),
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false.').toBoolean(),
];

const createBookingValidationRules = [
  body('gigId')
    .trim()
    .notEmpty()
    .withMessage('gigId is required.')
    .isMongoId()
    .withMessage('gigId must be a valid id.'),
];

const mongoIdParam = (name = 'id') =>
  param(name).isMongoId().withMessage('A valid id is required.');

const incomeInsightsValidationRules = [
  query('expenses')
    .optional()
    .isFloat({ min: 0, max: 1000000000 })
    .withMessage('Expenses must be a number between 0 and 1,000,000,000.')
    .toFloat(),
  query('ageGroup')
    .optional()
    .isIn(AGE_GROUPS)
    .withMessage(`Age group must be one of: ${AGE_GROUPS.join(', ')}.`),
];

const listLimitRule = query('limit')
  .optional()
  .isInt({ min: 1, max: 500 })
  .withMessage('Limit must be between 1 and 500.')
  .toInt();

const adminListUsersValidationRules = [
  query('role').optional().isIn(['client', 'freelancer', 'admin']).withMessage('Invalid role filter.'),
  listLimitRule,
];

const adminSetUserStatusValidationRules = [
  mongoIdParam(),
  body('isActive')
    .exists()
    .withMessage('isActive is required.')
    .isBoolean()
    .withMessage('isActive must be true or false.')
    .toBoolean(),
];

const adminAuditLogValidationRules = [
  query('event').optional().isIn(AUDIT_EVENTS).withMessage('Unknown audit event.'),
  query('outcome').optional().isIn(['success', 'failure']).withMessage('Invalid outcome filter.'),
  listLimitRule,
];

module.exports = {
  mongoIdParam,
  listLimitRule,
  incomeInsightsValidationRules,
  adminListUsersValidationRules,
  adminSetUserStatusValidationRules,
  adminAuditLogValidationRules,
  registerValidationRules,
  loginValidationRules,
  createGigValidationRules,
  updateGigValidationRules,
  createBookingValidationRules,
  handleValidationErrors,
};
