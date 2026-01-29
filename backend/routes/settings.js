const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

/**
 * @route   GET /api/settings/telegram
 * @desc    Отримати налаштування Telegram
 * @access  Private (Admin only)
 */
router.get('/telegram', authenticateToken, adminAuth, settingsController.getTelegramSettings);

/**
 * @route   PUT /api/settings/telegram
 * @desc    Оновити налаштування Telegram
 * @access  Private (Admin only)
 */
router.put('/telegram', authenticateToken, adminAuth, settingsController.updateTelegramSettings);

/**
 * @route   POST /api/settings/telegram/webhook
 * @desc    Налаштувати webhook для Telegram бота
 * @access  Private (Admin only)
 */
router.post('/telegram/webhook', authenticateToken, adminAuth, settingsController.setupWebhook);

/**
 * @route   GET /api/settings/telegram/webhook
 * @desc    Отримати інформацію про поточний webhook
 * @access  Private (Admin only)
 */
router.get('/telegram/webhook', authenticateToken, adminAuth, settingsController.getWebhookInfo);

/**
 * @route   GET /api/settings/bot
 * @desc    Отримати налаштування бота
 * @access  Private (Admin only)
 */
router.get('/bot', authenticateToken, adminAuth, settingsController.getBotSettings);

/**
 * @route   PUT /api/settings/bot
 * @desc    Оновити налаштування бота
 * @access  Private (Admin only)
 */
router.put('/bot', authenticateToken, adminAuth, settingsController.updateBotSettings);

/**
 * @route   GET /api/settings/active-directory
 * @desc    Отримати налаштування Active Directory
 * @access  Private (Admin only)
 */
router.get('/active-directory', authenticateToken, adminAuth, settingsController.getActiveDirectorySettings);

/**
 * @route   PUT /api/settings/active-directory
 * @desc    Оновити налаштування Active Directory
 * @access  Private (Admin only)
 */
router.put('/active-directory', authenticateToken, adminAuth, settingsController.updateActiveDirectorySettings);

/**
 * @route   GET /api/settings/ai-prompts
 * @desc    Отримати AI промпти
 * @access  Private (Admin only)
 */
router.get('/ai-prompts', authenticateToken, adminAuth, settingsController.getAIPrompts);

/**
 * @route   PUT /api/settings/ai-prompts
 * @desc    Оновити AI промпти
 * @access  Private (Admin only)
 */
router.put('/ai-prompts', authenticateToken, adminAuth, settingsController.updateAIPrompts);

/**
 * @route   POST /api/settings/ai-prompts/:promptType/reset
 * @desc    Скинути AI промпт до дефолтного
 * @access  Private (Admin only)
 */
router.post('/ai-prompts/:promptType/reset', authenticateToken, adminAuth, settingsController.resetAIPrompt);

module.exports = router;

