const express = require('express');
const gigController = require('../controllers/gigController');
const authenticateToken = require('../middleware/authenticateToken');
const authorizeRoles = require('../middleware/authorizeRoles');
const {
  createGigValidationRules,
  updateGigValidationRules,
  handleValidationErrors,
} = require('../middleware/validators');

const router = express.Router();

router.get('/', gigController.listGigs);

router.get('/my', authenticateToken, authorizeRoles('freelancer'), gigController.listMyGigs);

router.get('/:id', gigController.getGig);

router.post(
  '/',
  authenticateToken,
  authorizeRoles('freelancer'),
  createGigValidationRules,
  handleValidationErrors,
  gigController.createGig
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('freelancer'),
  updateGigValidationRules,
  handleValidationErrors,
  gigController.updateGig
);

router.delete('/:id', authenticateToken, authorizeRoles('freelancer'), gigController.deleteGig);

module.exports = router;
