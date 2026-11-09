const express = require('express');
const bookingController = require('../controllers/bookingController');
const authenticateToken = require('../middleware/authenticateToken');
const authorizeRoles = require('../middleware/authorizeRoles');
const { createBookingValidationRules, handleValidationErrors } = require('../middleware/validators');
const { bookingLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post(
  '/',
  bookingLimiter,
  authenticateToken,
  authorizeRoles('client'),
  createBookingValidationRules,
  handleValidationErrors,
  bookingController.createBooking
);

router.get('/my', authenticateToken, authorizeRoles('client'), bookingController.listMyBookings);

router.get(
  '/freelancer',
  authenticateToken,
  authorizeRoles('freelancer'),
  bookingController.listFreelancerBookings
);

router.get(
  '/freelancer/income',
  authenticateToken,
  authorizeRoles('freelancer'),
  bookingController.getIncomeSummary
);

module.exports = router;
