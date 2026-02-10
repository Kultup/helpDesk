const express = require('express');
const router = express.Router();
const metricsCollector = require('../services/metricsCollector');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/metrics/stats
 * Отримати поточну статистику AI бота
 * Доступ: тільки адміністратори
 */
router.get('/stats', authenticateToken, requireAdmin, (req, res) => {
    try {
        const stats = metricsCollector.getStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Помилка отримання статистики',
            error: error.message
        });
    }
});

/**
 * GET /api/metrics/report
 * Отримати детальний звіт
 * Доступ: тільки адміністратори
 */
router.get('/report', authenticateToken, requireAdmin, (req, res) => {
    try {
        const report = metricsCollector.getDetailedReport();
        res.json({
            success: true,
            data: {
                report,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Помилка генерації звіту',
            error: error.message
        });
    }
});

/**
 * POST /api/metrics/reset
 * Скинути метрики (опційно, для тестування)
 * Доступ: тільки адміністратори
 */
router.post('/reset', authenticateToken, requireAdmin, (req, res) => {
    try {
        metricsCollector.resetMetrics();
        res.json({
            success: true,
            message: 'Метрики скинуто'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Помилка скидання метрик',
            error: error.message
        });
    }
});

module.exports = router;
