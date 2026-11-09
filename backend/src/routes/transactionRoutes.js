const express = require('express');
const transactionController = require('../controllers/transactionController');
const authenticateToken = require('../middleware/authenticateToken');
const authorizeRoles = require('../middleware/authorizeRoles');
const { mongoIdParam, handleValidationErrors } = require('../middleware/validators');

const router = express.Router();

router.use(authenticateToken, authorizeRoles('client', 'freelancer'));

router.get('/my', transactionController.listMyTransactions);
router.get('/:id', mongoIdParam(), handleValidationErrors, transactionController.getTransaction);

module.exports = router;
