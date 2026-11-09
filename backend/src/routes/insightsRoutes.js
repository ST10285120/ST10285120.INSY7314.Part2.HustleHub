const express = require('express');
const insightsController = require('../controllers/insightsController');
const authenticateToken = require('../middleware/authenticateToken');
const authorizeRoles = require('../middleware/authorizeRoles');
const { incomeInsightsValidationRules, handleValidationErrors } = require('../middleware/validators');

const router = express.Router();

// Public: the SARS tables behind the estimate, so the method is transparent.
router.get('/tax-tables', insightsController.getTaxTables);

router.get(
  '/income',
  authenticateToken,
  authorizeRoles('freelancer'),
  incomeInsightsValidationRules,
  handleValidationErrors,
  insightsController.getIncomeInsights
);

module.exports = router;
