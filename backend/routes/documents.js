const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// All routes require admin access
router.use(authenticateToken);
router.use(requireAdmin);

// Get all documents
router.get('/', documentController.getDocuments);

// Get single document by slug
router.get('/:slug', documentController.getDocument);

// Create document
router.post('/', documentController.createDocument);

// Update document
router.put('/:slug', documentController.updateDocument);

// Delete document
router.delete('/:slug', documentController.deleteDocument);

// Generate share token
router.post('/:slug/share', documentController.generateShareToken);

// Public route - access document by token (no auth required)
router.get('/share/:token', async (req, res) => {
  await documentController.getDocumentByToken(req, res);
});

module.exports = router;
