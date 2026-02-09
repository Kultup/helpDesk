const express = require('express');
const router = express.Router();
const ticketAnalyticsService = require('../services/ticketAnalyticsService');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * @route   GET /api/analytics/forecast
 * @desc    Прогноз навантаження на наступні дні
 * @access  Private (Admin)
 */
router.get('/forecast', authenticateToken, async (req, res) => {
    try {
        const { days = 7 } = req.query;

        const forecast = await ticketAnalyticsService.forecastWorkload(parseInt(days));

        res.json({
            success: true,
            data: forecast
        });
    } catch (error) {
        logger.error('Помилка прогнозування:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера'
        });
    }
});

/**
 * @route   GET /api/analytics/heatmap
 * @desc    Heatmap активності (години × дні тижня)
 * @access  Private (Admin)
 */
router.get('/heatmap', authenticateToken, async (req, res) => {
    try {
        const { days = 30 } = req.query;

        const heatmap = await ticketAnalyticsService.getActivityHeatmap(parseInt(days));

        res.json({
            success: true,
            data: heatmap
        });
    } catch (error) {
        logger.error('Помилка створення heatmap:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера'
        });
    }
});

/**
 * @route   GET /api/analytics/trends
 * @desc    Тренди проблем (зростаючі/спадаючі категорії)
 * @access  Private (Admin)
 */
router.get('/trends', authenticateToken, async (req, res) => {
    try {
        const { days = 30 } = req.query;

        const trends = await ticketAnalyticsService.getProblemTrends(parseInt(days));

        res.json({
            success: true,
            data: trends
        });
    } catch (error) {
        logger.error('Помилка аналізу трендів:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера'
        });
    }
});

/**
 * @route   GET /api/analytics/performance
 * @desc    Детальна статистика продуктивності
 * @access  Private (Admin)
 */
router.get('/performance', authenticateToken, async (req, res) => {
    try {
        const stats = await ticketAnalyticsService.getPerformanceStats();

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error('Помилка отримання статистики:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера'
        });
    }
});

/**
 * @route   GET /api/analytics/export
 * @desc    Експорт звіту в CSV
 * @access  Private (Admin)
 */
router.get('/export', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate, category, priority } = req.query;

        const csv = await ticketAnalyticsService.exportToCSV({
            startDate,
            endDate,
            category,
            priority
        });

        // Встановлюємо заголовки для завантаження файлу
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=tickets_export_${new Date().toISOString().split('T')[0]}.csv`);
        res.setHeader('Content-Length', Buffer.byteLength(csv, 'utf8'));

        res.send('\uFEFF' + csv); // BOM для правильного відображення UTF-8 в Excel
    } catch (error) {
        logger.error('Помилка експорту:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера'
        });
    }
});

module.exports = router;
