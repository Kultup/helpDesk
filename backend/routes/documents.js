const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { UserRole } = require('../models/User');

// All routes require admin access
router.use(protect);
router.use(requireRole(UserRole.ADMIN));

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
