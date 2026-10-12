const express = require('express');
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/authenticateToken');
const {
  registerValidationRules,
  loginValidationRules,
  handleValidationErrors,
} = require('../middleware/validators');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post(
  '/register',
  registerLimiter,
  registerValidationRules,
  handleValidationErrors,
  authController.register
);

router.post('/login', loginLimiter, loginValidationRules, handleValidationErrors, authController.login);

router.get('/profile', authenticateToken, authController.getProfile);

module.exports = router;
