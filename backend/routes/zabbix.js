const express = require('express');
const router = express.Router();
const zabbixController = require('../controllers/zabbixController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { body } = require('express-validator');

/**
 * @route   GET /api/zabbix/config
 * @desc    Отримати налаштування Zabbix
 * @access  Private (Admin only)
 */
router.get('/config', authenticateToken, adminAuth, zabbixController.getConfig);

/**
 * @route   PUT /api/zabbix/config
 * @desc    Оновити налаштування Zabbix
 * @access  Private (Admin only)
 */
router.put(
  '/config',
  authenticateToken,
  adminAuth,
  [
    body('url').optional().isURL().withMessage('URL must be a valid URL'),
    body('apiToken').optional().isString().withMessage('API token must be a string'),
    body('username').optional().isString().withMessage('Username must be a string'),
    body('password').optional().isString().withMessage('Password must be a string'),
    body('enabled').optional().isBoolean().withMessage('Enabled must be a boolean'),
    body('pollInterval')
      .optional()
      .isInt({ min: 1, max: 60 })
      .withMessage('Poll interval must be between 1 and 60 minutes'),
  ],
  zabbixController.updateConfig
);

/**
 * @route   POST /api/zabbix/test-connection
 * @desc    Тест підключення до Zabbix
 * @access  Private (Admin only)
 */
router.post('/test-connection', authenticateToken, adminAuth, zabbixController.testConnection);

/**
 * @route   POST /api/zabbix/poll-now
 * @desc    Ручний запуск опитування Zabbix
 * @access  Private (Admin only)
 */
router.post('/poll-now', authenticateToken, adminAuth, zabbixController.pollNow);

/**
 * @route   GET /api/zabbix/alerts
 * @desc    Отримати список алертів
 * @access  Private (Admin only)
 */
router.get('/alerts', authenticateToken, adminAuth, zabbixController.getAlerts);

/**
 * @route   GET /api/zabbix/alerts/:id
 * @desc    Отримати деталі алерту
 * @access  Private (Admin only)
 */
router.get('/alerts/:id', authenticateToken, adminAuth, zabbixController.getAlert);

/**
 * @route   GET /api/zabbix/groups
 * @desc    Отримати список груп
 * @access  Private (Admin only)
 */
router.get('/groups', authenticateToken, adminAuth, zabbixController.getGroups);

/**
 * @route   POST /api/zabbix/groups
 * @desc    Створити групу
 * @access  Private (Admin only)
 */
router.post(
  '/groups',
  authenticateToken,
  adminAuth,
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('adminIds').optional().isArray().withMessage('Admin IDs must be an array'),
    body('triggerIds').optional().isArray().withMessage('Trigger IDs must be an array'),
    body('hostPatterns').optional().isArray().withMessage('Host patterns must be an array'),
    body('severityLevels').optional().isArray().withMessage('Severity levels must be an array'),
  ],
  zabbixController.createGroup
);

/**
 * @route   PUT /api/zabbix/groups/:id
 * @desc    Оновити групу
 * @access  Private (Admin only)
 */
router.put(
  '/groups/:id',
  authenticateToken,
  adminAuth,
  [
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('adminIds').optional().isArray().withMessage('Admin IDs must be an array'),
    body('triggerIds').optional().isArray().withMessage('Trigger IDs must be an array'),
    body('hostPatterns').optional().isArray().withMessage('Host patterns must be an array'),
    body('severityLevels').optional().isArray().withMessage('Severity levels must be an array'),
  ],
  zabbixController.updateGroup
);

/**
 * @route   DELETE /api/zabbix/groups/:id
 * @desc    Видалити групу
 * @access  Private (Admin only)
 */
router.delete('/groups/:id', authenticateToken, adminAuth, zabbixController.deleteGroup);

/**
 * @route   POST /api/zabbix/test-alert
 * @desc    Тестування відправки алерту
 * @access  Private (Admin only)
 */
router.post(
  '/test-alert',
  authenticateToken,
  adminAuth,
  [
    body('groupId').optional().isMongoId().withMessage('Group ID must be a valid MongoDB ID'),
    body('alertId').optional().isMongoId().withMessage('Alert ID must be a valid MongoDB ID'),
  ],
  zabbixController.testAlert
);

/**
 * @route   GET /api/zabbix/status
 * @desc    Отримати статус інтеграції Zabbix та Telegram
 * @access  Private (Admin only)
 */
router.get('/status', authenticateToken, adminAuth, zabbixController.getStatus);

/**
 * @route   GET /api/zabbix/hosts
 * @desc    Отримати всі пристрої мережі з IP-адресами
 * @access  Private (Admin only)
 */
router.get('/hosts', authenticateToken, adminAuth, zabbixController.getHosts);

/**
 * @route   GET /api/zabbix/host-groups
 * @desc    Отримати групи хостів з Zabbix
 * @access  Private (Admin only)
 */
router.get('/host-groups', authenticateToken, adminAuth, zabbixController.getHostGroups);

/**
 * @route   POST /api/zabbix/alerts/check
 * @desc    Діагностика алерту - перевірка, чому сповіщення не надійшло
 * @access  Private (Admin only)
 */
router.post(
  '/alerts/check',
  authenticateToken,
  adminAuth,
  [
    body('host').optional().isString().withMessage('Host must be a string'),
    body('triggerName').optional().isString().withMessage('Trigger name must be a string'),
    body('eventTime')
      .optional()
      .isISO8601()
      .withMessage('Event time must be a valid ISO 8601 date'),
    body('alertId').optional().isString().withMessage('Alert ID must be a string').trim(),
  ],
  zabbixController.checkAlert
);

module.exports = router;
