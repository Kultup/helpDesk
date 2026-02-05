const express = require('express');
const router = express.Router();
const deployController = require('../controllers/deployController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

/**
 * @route   POST /api/deploy/webhook
 * @desc    GitHub webhook для автоматичного деплою
 * @access  Public (але з перевіркою секрету)
 */
router.post('/webhook', deployController.githubWebhook);

/**
 * @route   POST /api/deploy/manual
 * @desc    Ручний деплой (тільки для адмінів)
 * @access  Admin
 */
router.post('/manual', authenticateToken, adminAuth, deployController.manualDeploy);

/**
 * @route   GET /api/deploy/status
 * @desc    Статус останнього деплою
 * @access  Admin
 */
router.get('/status', authenticateToken, adminAuth, deployController.getDeployStatus);

module.exports = router;
