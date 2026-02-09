const express = require('express');
const router = express.Router();
const ticketPriorityService = require('../services/ticketPriorityService');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * @route   GET /api/tickets/:id/priority-analysis
 * @desc    Отримати аналіз пріоритету для конкретного тікету
 * @access  Private (Admin)
 */
router.get('/:id/priority-analysis', authenticateToken, async (req, res) => {
    try {
        const Ticket = require('../models/Ticket');
        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Тікет не знайдено'
            });
        }

        const analysis = await ticketPriorityService.calculatePriorityScore(ticket);

        res.json({
            success: true,
            data: {
                ticketId: ticket._id,
                ticketNumber: ticket.ticketNumber,
                currentPriority: ticket.priority,
                ...analysis,
                recommendation: analysis.suggestedPriority !== ticket.priority
                    ? `Рекомендується змінити пріоритет з "${ticket.priority}" на "${analysis.suggestedPriority}"`
                    : 'Поточний пріоритет оптимальний'
            }
        });
    } catch (error) {
        logger.error('Помилка аналізу пріоритету:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/tickets/:id/update-priority
 * @desc    Оновити пріоритет тікету автоматично
 * @access  Private (Admin)
 */
router.post('/:id/update-priority',
    authenticateToken,
    requirePermission('manage_tickets'),
    async (req, res) => {
        try {
            const { forceUpdate = false } = req.body;

            const result = await ticketPriorityService.updateTicketPriority(
                req.params.id,
                forceUpdate
            );

            res.json({
                success: true,
                message: result.updated
                    ? `Пріоритет оновлено: ${result.oldPriority} → ${result.newPriority}`
                    : result.reason,
                data: result
            });
        } catch (error) {
            logger.error('Помилка оновлення пріоритету:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Помилка сервера'
            });
        }
    }
);

/**
 * @route   POST /api/tickets/bulk/update-priorities
 * @desc    Масове оновлення пріоритетів всіх відкритих тікетів
 * @access  Private (Admin)
 */
router.post('/bulk/update-priorities',
    authenticateToken,
    requirePermission('manage_tickets'),
    async (req, res) => {
        try {
            const result = await ticketPriorityService.updateAllTicketPriorities();

            res.json({
                success: true,
                message: `Оновлено ${result.updated} тікетів з ${result.total}`,
                data: result
            });
        } catch (error) {
            logger.error('Помилка масового оновлення пріоритетів:', error);
            res.status(500).json({
                success: false,
                message: 'Помилка сервера',
                error: error.message
            });
        }
    }
);

module.exports = router;
