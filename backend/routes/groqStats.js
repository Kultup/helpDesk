const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const groqService = require('../services/groqService');
const GroqApiUsage = require('../models/GroqApiUsage');

/**
 * GET /api/groq-stats/current
 * Отримати поточну статистику використання API за сьогодні
 */
router.get('/current', authenticateToken, adminAuth, async (req, res) => {
  try {
    const usage = await GroqApiUsage.getTodayUsage();
    
    res.json({
      success: true,
      data: {
        date: usage.date,
        modelUsage: usage.modelUsage,
        rateLimits: usage.rateLimits,
        notifications: usage.notifications
      }
    });
  } catch (error) {
    console.error('Помилка отримання поточної статистики API:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання статистики'
    });
  }
});

/**
 * GET /api/groq-stats/history
 * Отримати історію використання API за останні N днів
 */
router.get('/history', authenticateToken, adminAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const stats = await groqService.getUsageStats(days);
    
    res.json({
      success: true,
      data: stats,
      period: {
        days,
        from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('Помилка отримання історії статистики API:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання історії статистики'
    });
  }
});

/**
 * POST /api/groq-stats/test-notification
 * Тестування відправки сповіщення адміну (тільки для тестування)
 */
router.post('/test-notification', authenticateToken, adminAuth, async (req, res) => {
  try {
    const usage = await GroqApiUsage.getTodayUsage();
    
    // Тестові дані
    const testData = {
      level: 'warning',
      requestsPercentage: '18.5',
      tokensPercentage: '15.2',
      remainingRequests: 185,
      remainingTokens: 1520
    };
    
    await groqService.sendLimitNotification(testData, usage);
    
    res.json({
      success: true,
      message: 'Тестове сповіщення відправлено'
    });
  } catch (error) {
    console.error('Помилка відправки тестового сповіщення:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка відправки сповіщення'
    });
  }
});

module.exports = router;
