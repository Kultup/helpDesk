const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const quickTipController = require('../controllers/quickTipController');

// Публічні маршрути (доступні всім авторизованим користувачам)

// GET /api/quick-tips/search - пошук швидких порад
router.get('/search', authenticateToken, quickTipController.searchQuickTips);

// POST /api/quick-tips/:tipId/rate - оцінити корисність поради
router.post('/:tipId/rate', authenticateToken, quickTipController.rateQuickTip);

// Адміністративні маршрути

// GET /api/quick-tips - отримати всі швидкі поради (для адміністраторів)
router.get('/', authenticateToken, requireAdmin, quickTipController.getAllQuickTips);

// POST /api/quick-tips - створити нову швидку пораду
router.post('/', authenticateToken, requireAdmin, quickTipController.createQuickTip);

// PUT /api/quick-tips/:tipId - оновити швидку пораду
router.put('/:tipId', authenticateToken, requireAdmin, quickTipController.updateQuickTip);

// DELETE /api/quick-tips/:tipId - видалити швидку пораду
router.delete('/:tipId', authenticateToken, requireAdmin, quickTipController.deleteQuickTip);

module.exports = router;