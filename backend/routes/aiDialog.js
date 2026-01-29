const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const aiDialogController = require('../controllers/aiDialogController');

/**
 * @route   GET /api/ai-dialogs
 * @desc    Отримати список AI діалогів з фільтрами
 * @access  Private (Admin only)
 */
router.get('/', authenticateToken, adminAuth, aiDialogController.getAIDialogs);

/**
 * @route   GET /api/ai-dialogs/stats
 * @desc    Отримати статистику AI діалогів
 * @access  Private (Admin only)
 */
router.get('/stats', authenticateToken, adminAuth, aiDialogController.getAIDialogStats);

/**
 * @route   GET /api/ai-dialogs/:id
 * @desc    Отримати конкретний AI діалог
 * @access  Private (Admin only)
 */
router.get('/:id', authenticateToken, adminAuth, aiDialogController.getAIDialogById);

/**
 * @route   DELETE /api/ai-dialogs/:id
 * @desc    Видалити AI діалог
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticateToken, adminAuth, aiDialogController.deleteAIDialog);

module.exports = router;
