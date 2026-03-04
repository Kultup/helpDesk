const express = require('express');
const router = express.Router();
const aiKnowledgeController = require('../controllers/aiKnowledgeController');
const aiFeedbackController = require('../controllers/aiFeedbackController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/knowledge', authenticateToken, requireAdmin, aiKnowledgeController.getKnowledge);

// AI Feedback routes
router.post('/feedback', authenticateToken, aiFeedbackController.createFeedback);
router.get('/feedback/my', authenticateToken, aiFeedbackController.getMyFeedback);
router.get(
  '/feedback/stats',
  authenticateToken,
  requireAdmin,
  aiFeedbackController.getFeedbackStats
);
router.put(
  '/feedback/:id/resolve',
  authenticateToken,
  requireAdmin,
  aiFeedbackController.resolveFeedback
);

module.exports = router;
