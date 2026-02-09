const express = require('express');
const router = express.Router();
const ticketCategorizationService = require('../services/ticketCategorizationService');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * @route   POST /api/tickets/categorize
 * @desc    Категоризувати тікет за допомогою AI
 * @access  Private
 */
router.post('/categorize', authenticateToken, async (req, res) => {
    try {
        const { title, description } = req.body;

        if (!title) {
            return res.status(400).json({
                success: false,
                message: 'Заголовок є обов\'язковим'
            });
        }

        const result = await ticketCategorizationService.categorizeTicket(title, description);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Помилка категоризації:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/tickets/bulk/recategorize
 * @desc    Масова рекатегоризація існуючих тікетів
 * @access  Private (Admin)
 */
router.post('/bulk/recategorize',
    authenticateToken,
    requirePermission('manage_tickets'),
    async (req, res) => {
        try {
            const { limit = 100 } = req.body;

            const result = await ticketCategorizationService.recategorizeExistingTickets(limit);

            res.json({
                success: true,
                message: `Рекатегоризовано ${result.updated} тікетів з ${result.total}`,
                data: result
            });
        } catch (error) {
            logger.error('Помилка масової рекатегоризації:', error);
            res.status(500).json({
                success: false,
                message: 'Помилка сервера',
                error: error.message
            });
        }
    }
);

/**
 * @route   GET /api/tickets/categories
 * @desc    Отримати структуру категорій
 * @access  Private
 */
router.get('/categories', authenticateToken, async (req, res) => {
    try {
        const categoryTree = ticketCategorizationService.getCategoryTree();

        res.json({
            success: true,
            data: categoryTree
        });
    } catch (error) {
        logger.error('Помилка отримання категорій:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера'
        });
    }
});

module.exports = router;
