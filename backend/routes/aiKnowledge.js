const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const aiKnowledgeController = require('../controllers/aiKnowledgeController');
const { uploadFiles } = require('../controllers/attachmentController');

router.use(authenticateToken);

router.get('/', aiKnowledgeController.list);
router.get('/:id', aiKnowledgeController.getById);
router.post('/', requireAdmin, uploadFiles, aiKnowledgeController.create);
router.put('/:id', requireAdmin, uploadFiles, aiKnowledgeController.update);
router.delete('/:id', requireAdmin, aiKnowledgeController.remove);

module.exports = router;
