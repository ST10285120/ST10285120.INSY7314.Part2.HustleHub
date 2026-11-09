const express = require('express');
const adminController = require('../controllers/adminController');
const authenticateToken = require('../middleware/authenticateToken');
const authorizeRoles = require('../middleware/authorizeRoles');
const {
  mongoIdParam,
  listLimitRule,
  adminListUsersValidationRules,
  adminSetUserStatusValidationRules,
  adminAuditLogValidationRules,
  handleValidationErrors,
} = require('../middleware/validators');

const router = express.Router();

// Every route in this file is admin-only. Applying the guard once at the top
// means a new admin route can't accidentally be added without it.
router.use(authenticateToken, authorizeRoles('admin'));

router.get('/stats', adminController.getStats);

router.get('/users', adminListUsersValidationRules, handleValidationErrors, adminController.listUsers);
router.patch(
  '/users/:id/status',
  adminSetUserStatusValidationRules,
  handleValidationErrors,
  adminController.setUserStatus
);
router.post('/users/:id/unlock', mongoIdParam(), handleValidationErrors, adminController.unlockUser);

router.get('/gigs', listLimitRule, handleValidationErrors, adminController.listGigs);
router.delete('/gigs/:id', mongoIdParam(), handleValidationErrors, adminController.removeGig);

router.get('/bookings', listLimitRule, handleValidationErrors, adminController.listBookings);
router.get('/transactions', listLimitRule, handleValidationErrors, adminController.listTransactions);
router.get('/audit-logs', adminAuditLogValidationRules, handleValidationErrors, adminController.listAuditLogs);

module.exports = router;
