const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const aiKnowledgeController = require('../controllers/aiKnowledgeController');

router.use(authenticateToken);

router.get('/', aiKnowledgeController.list);
router.get('/:id', aiKnowledgeController.getById);
router.post('/', requireAdmin, aiKnowledgeController.create);
router.put('/:id', requireAdmin, aiKnowledgeController.update);
router.delete('/:id', requireAdmin, aiKnowledgeController.remove);

module.exports = router;
