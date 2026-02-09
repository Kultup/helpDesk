const express = require('express');
const router = express.Router();
const slaService = require('../services/slaService');
const businessHoursService = require('../services/businessHoursService');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * @route   POST /api/tickets/:id/sla/pause
 * @desc    Поставити SLA на паузу
 * @access  Private (Admin)
 */
router.post('/:id/sla/pause',
    authenticateToken,
    requirePermission('manage_tickets'),
    async (req, res) => {
        try {
            const { reason } = req.body;

            const result = await slaService.pauseSLA(req.params.id, reason);

            res.json({
                success: result.success,
                message: result.message,
                data: result
            });
        } catch (error) {
            logger.error('Помилка паузи SLA:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Помилка сервера'
            });
        }
    }
);

/**
 * @route   POST /api/tickets/:id/sla/resume
 * @desc    Відновити SLA після паузи
 * @access  Private (Admin)
 */
router.post('/:id/sla/resume',
    authenticateToken,
    requirePermission('manage_tickets'),
    async (req, res) => {
        try {
            const result = await slaService.resumeSLA(req.params.id);

            res.json({
                success: result.success,
                message: result.message,
                data: result
            });
        } catch (error) {
            logger.error('Помилка відновлення SLA:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Помилка сервера'
            });
        }
    }
);

/**
 * @route   GET /api/sla/business-hours
 * @desc    Отримати налаштування робочих годин
 * @access  Private (Admin)
 */
router.get('/business-hours',
    authenticateToken,
    async (req, res) => {
        try {
            const settings = businessHoursService.getSettings();

            res.json({
                success: true,
                data: settings
            });
        } catch (error) {
            logger.error('Помилка отримання налаштувань:', error);
            res.status(500).json({
                success: false,
                message: 'Помилка сервера'
            });
        }
    }
);

/**
 * @route   PUT /api/sla/business-hours
 * @desc    Оновити налаштування робочих годин
 * @access  Private (Admin)
 */
router.put('/business-hours',
    authenticateToken,
    requirePermission('manage_settings'),
    async (req, res) => {
        try {
            const { workingHours, workingDays, holidays } = req.body;

            businessHoursService.updateSettings({
                workingHours,
                workingDays,
                holidays
            });

            res.json({
                success: true,
                message: 'Налаштування оновлено',
                data: businessHoursService.getSettings()
            });
        } catch (error) {
            logger.error('Помилка оновлення налаштувань:', error);
            res.status(500).json({
                success: false,
                message: 'Помилка сервера'
            });
        }
    }
);

/**
 * @route   GET /api/sla/matrix
 * @desc    Отримати SLA матрицю
 * @access  Private
 */
router.get('/matrix', authenticateToken, async (req, res) => {
    try {
        const matrix = {
            urgent: {
                Hardware: 2,
                Software: 4,
                Network: 2,
                Access: 1,
                Other: 4
            },
            high: {
                Hardware: 8,
                Software: 12,
                Network: 8,
                Access: 4,
                Other: 12
            },
            medium: {
                Hardware: 24,
                Software: 48,
                Network: 24,
                Access: 12,
                Other: 48
            },
            low: {
                Hardware: 72,
                Software: 120,
                Network: 72,
                Access: 48,
                Other: 120
            }
        };

        res.json({
            success: true,
            data: matrix,
            description: 'SLA години за пріоритетом та категорією'
        });
    } catch (error) {
        logger.error('Помилка отримання SLA матриці:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера'
        });
    }
});

module.exports = router;
