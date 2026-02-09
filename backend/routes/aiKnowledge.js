const express = require('express');
const router = express.Router();
const aiKnowledgeController = require('../controllers/aiKnowledgeController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

router.get('/knowledge', authenticateToken, adminAuth, aiKnowledgeController.getKnowledge);

module.exports = router;
