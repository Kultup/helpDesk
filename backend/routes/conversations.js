const express = require('express');
const router = express.Router();
const conversationsController = require('../controllers/conversationsController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

router.get('/', authenticateToken, adminAuth, conversationsController.list);
router.get('/:id', authenticateToken, adminAuth, conversationsController.getById);

module.exports = router;
