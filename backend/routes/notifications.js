const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { body, param, query } = require('express-validator');
const notificationController = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { logAction } = require('../middleware/logger');

// Валідація для створення сповіщення
const createNotificationValidation = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Заголовок повинен містити від 5 до 200 символів'),
  
  body('message')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Повідомлення повинно містити від 10 до 1000 символів'),
  
  body('type')
    .isIn(['info', 'success', 'warning', 'error', 'system'])
    .withMessage('Тип повинен бути одним з: info, success, warning, error, system'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Пріоритет повинен бути одним з: low, medium, high, urgent'),
  
  body('recipients')
    .optional()
    .isArray()
    .withMessage('Отримувачі повинні бути масивом'),
  
  body('recipients.*')
    .optional()
    .isMongoId()
    .withMessage('Невірний ID отримувача'),
  
  body('channels')
    .optional()
    .isArray()
    .withMessage('Канали повинні бути масивом'),
  
  body('channels.*')
    .optional()
    .isIn(['web', 'email', 'telegram', 'sms'])
    .withMessage('Канал повинен бути одним з: web, email, telegram, sms'),
  
  body('scheduledAt')
    .optional()
    .isISO8601()
    .withMessage('Дата планування повинна бути в форматі ISO 8601'),
  
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Дата закінчення повинна бути в форматі ISO 8601'),
  
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Метадані повинні бути об\'єктом'),
  
  body('actionUrl')
    .optional()
    .isURL()
    .withMessage('URL дії повинен бути валідним URL'),
  
  body('actionText')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Текст дії повинен містити від 1 до 50 символів'),
  
  body('category')
    .optional()
    .isIn(['ticket', 'user', 'system', 'security', 'maintenance'])
    .withMessage('Категорія повинна бути однією з: ticket, user, system, security, maintenance'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Теги повинні бути масивом'),
  
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Кожен тег повинен містити від 1 до 30 символів')
];

// Валідація для оновлення сповіщення
const updateNotificationValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Заголовок повинен містити від 5 до 200 символів'),
  
  body('message')
    .optional()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Повідомлення повинно містити від 10 до 1000 символів'),
  
  body('type')
    .optional()
    .isIn(['info', 'success', 'warning', 'error', 'system'])
    .withMessage('Тип повинен бути одним з: info, success, warning, error, system'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Пріоритет повинен бути одним з: low, medium, high, urgent'),
  
  body('status')
    .optional()
    .isIn(['draft', 'scheduled', 'sent', 'failed', 'cancelled'])
    .withMessage('Статус повинен бути одним з: draft, scheduled, sent, failed, cancelled'),
  
  body('scheduledAt')
    .optional()
    .isISO8601()
    .withMessage('Дата планування повинна бути в форматі ISO 8601'),
  
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Дата закінчення повинна бути в форматі ISO 8601')
];

// Валідація для налаштувань сповіщень
const notificationSettingsValidation = [
  body('email.enabled')
    .optional()
    .isBoolean()
    .withMessage('Налаштування email повинно бути boolean'),
  
  body('email.types')
    .optional()
    .isArray()
    .withMessage('Типи email сповіщень повинні бути масивом'),
  
  body('email.types.*')
    .optional()
    .isIn(['ticket_created', 'ticket_updated', 'ticket_assigned', 'ticket_resolved', 'system_maintenance', 'user_status_change', 'user_role_change', 'user_registration_status_change'])
    .withMessage('Невірний тип email сповіщення'),
  
  body('telegram.enabled')
    .optional()
    .isBoolean()
    .withMessage('Налаштування Telegram повинно бути boolean'),
  
  body('telegram.types')
    .optional()
    .isArray()
    .withMessage('Типи Telegram сповіщень повинні бути масивом'),
  
  body('telegram.types.*')
    .optional()
    .isIn(['ticket_created', 'ticket_updated', 'ticket_assigned', 'ticket_resolved', 'urgent_notifications', 'user_status_change', 'user_role_change', 'user_registration_status_change'])
    .withMessage('Невірний тип Telegram сповіщення'),
  
  body('web.enabled')
    .optional()
    .isBoolean()
    .withMessage('Налаштування веб-сповіщень повинно бути boolean'),
  
  body('web.types')
    .optional()
    .isArray()
    .withMessage('Типи веб-сповіщень повинні бути масивом'),
  
  body('web.types.*')
    .optional()
    .isIn(['all', 'ticket_related', 'system_only', 'urgent_only'])
    .withMessage('Невірний тип веб-сповіщення'),
  
  body('sms.enabled')
    .optional()
    .isBoolean()
    .withMessage('Налаштування SMS повинно бути boolean'),
  
  body('sms.types')
    .optional()
    .isArray()
    .withMessage('Типи SMS сповіщень повинні бути масивом'),
  
  body('sms.types.*')
    .optional()
    .isIn(['urgent_only', 'security_alerts'])
    .withMessage('Невірний тип SMS сповіщення'),
  
  body('quietHours.enabled')
    .optional()
    .isBoolean()
    .withMessage('Налаштування тихих годин повинно бути boolean'),
  
  body('quietHours.start')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Час початку повинен бути в форматі HH:MM'),
  
  body('quietHours.end')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Час закінчення повинен бути в форматі HH:MM'),
  
  body('frequency.digest')
    .optional()
    .isIn(['never', 'daily', 'weekly'])
    .withMessage('Частота дайджесту повинна бути: never, daily, weekly'),
  
  body('frequency.immediate')
    .optional()
    .isBoolean()
    .withMessage('Налаштування миттєвих сповіщень повинно бути boolean')
];

// МАРШРУТИ

// Отримати всі сповіщення користувача
router.get('/', 
  authenticateToken,
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Номер сторінки повинен бути позитивним числом'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Ліміт повинен бути числом від 1 до 100'),
  query('type')
    .optional()
    .isIn(['info', 'success', 'warning', 'error', 'system'])
    .withMessage('Тип повинен бути одним з: info, success, warning, error, system'),
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Пріоритет повинен бути одним з: low, medium, high, urgent'),
  query('category')
    .optional()
    .isIn(['ticket', 'user', 'system', 'security', 'maintenance'])
    .withMessage('Категорія повинна бути однією з: ticket, user, system, security, maintenance'),
  query('read')
    .optional()
    .isBoolean()
    .withMessage('read повинно бути boolean значенням'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Дата початку повинна бути в форматі ISO 8601'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Дата кінця повинна бути в форматі ISO 8601'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Пошуковий запит повинен містити від 2 до 100 символів'),
  logAction('get_user_notifications'),
  notificationController.getUserNotifications
);

// Отримати кількість непрочитаних сповіщень
router.get('/unread-count', 
  authenticateToken,
  query('type')
    .optional()
    .isIn(['info', 'success', 'warning', 'error', 'system'])
    .withMessage('Тип повинен бути одним з: info, success, warning, error, system'),
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Пріоритет повинен бути одним з: low, medium, high, urgent'),
  logAction('get_unread_count'),
  notificationController.getUnreadCount
);

// Отримати конкретне сповіщення
router.get('/:id', 
  authenticateToken,
  param('id')
    .isMongoId()
    .withMessage('Невірний ID сповіщення'),
  logAction('get_notification'),
  notificationController.getNotification
);

// Створити нове сповіщення (тільки для адмінів)
router.post('/', 
  authenticateToken,
  adminAuth,
  createNotificationValidation,
  logAction('create_notification'),
  notificationController.createNotification
);

// Оновити сповіщення (тільки для адмінів)
router.put('/:id', 
  authenticateToken,
  adminAuth,
  param('id')
    .isMongoId()
    .withMessage('Невірний ID сповіщення'),
  updateNotificationValidation,
  logAction('update_notification'),
  notificationController.updateNotification
);

// Видалити сповіщення (тільки для адмінів)
router.delete('/:id', 
  authenticateToken,
  adminAuth,
  param('id')
    .isMongoId()
    .withMessage('Невірний ID сповіщення'),
  logAction('delete_notification'),
  notificationController.deleteNotification
);

// Позначити сповіщення як прочитане
router.patch('/:id/read', 
  authenticateToken,
  param('id')
    .isMongoId()
    .withMessage('Невірний ID сповіщення'),
  logAction('mark_notification_read'),
  notificationController.markAsRead
);

// Позначити сповіщення як непрочитане
router.patch('/:id/unread', 
  authenticateToken,
  param('id')
    .isMongoId()
    .withMessage('Невірний ID сповіщення'),
  logAction('mark_notification_unread'),
  notificationController.markAsUnread
);

// Позначити всі сповіщення як прочитані
router.patch('/mark-all/read', 
  authenticateToken,
  body('type')
    .optional()
    .isIn(['info', 'success', 'warning', 'error', 'system'])
    .withMessage('Тип повинен бути одним з: info, success, warning, error, system'),
  body('category')
    .optional()
    .isIn(['ticket', 'user', 'system', 'security', 'maintenance'])
    .withMessage('Категорія повинна бути однією з: ticket, user, system, security, maintenance'),
  body('olderThan')
    .optional()
    .isISO8601()
    .withMessage('Дата повинна бути в форматі ISO 8601'),
  logAction('mark_all_notifications_read'),
  notificationController.markAllAsRead
);

// Масове видалення сповіщень
router.delete('/bulk/delete', 
  authenticateToken,
  body('notificationIds')
    .isArray({ min: 1, max: 100 })
    .withMessage('Повинен бути масив з 1-100 ID сповіщень'),
  body('notificationIds.*')
    .isMongoId()
    .withMessage('Невірний ID сповіщення'),
  logAction('bulk_delete_notifications'),
  notificationController.bulkDeleteNotifications
);

// Масове позначення як прочитані
router.patch('/bulk/read', 
  authenticateToken,
  body('notificationIds')
    .isArray({ min: 1, max: 100 })
    .withMessage('Повинен бути масив з 1-100 ID сповіщень'),
  body('notificationIds.*')
    .isMongoId()
    .withMessage('Невірний ID сповіщення'),
  logAction('bulk_mark_read'),
  notificationController.bulkMarkAsRead
);

// Налаштування сповіщень користувача

// Отримати налаштування сповіщень
router.get('/settings/preferences', 
  authenticateToken,
  logAction('get_notification_settings'),
  notificationController.getNotificationSettings
);

// Оновити налаштування сповіщень
router.put('/settings/preferences', 
  authenticateToken,
  notificationSettingsValidation,
  logAction('update_notification_settings'),
  notificationController.updateNotificationSettings
);

// Скинути налаштування до значень за замовчуванням
router.post('/settings/reset', 
  authenticateToken,
  logAction('reset_notification_settings'),
  notificationController.resetNotificationSettings
);

// Тестування сповіщень

// Тест email сповіщення
router.post('/test/email', 
  authenticateToken,
  body('email')
    .optional()
    .isEmail()
    .withMessage('Невірний email адрес'),
  body('type')
    .optional()
    .isIn(['ticket_created', 'ticket_updated', 'system_maintenance'])
    .withMessage('Невірний тип тестового сповіщення'),
  logAction('test_email_notification'),
  notificationController.testEmailNotification
);

// Тест Telegram сповіщення
router.post('/test/telegram', 
  authenticateToken,
  body('message')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Тестове повідомлення повинно містити від 1 до 200 символів'),
  logAction('test_telegram_notification'),
  notificationController.testTelegramNotification
);

// Тест веб-сповіщення
router.post('/test/web', 
  authenticateToken,
  body('type')
    .optional()
    .isIn(['info', 'success', 'warning', 'error'])
    .withMessage('Тип повинен бути одним з: info, success, warning, error'),
  logAction('test_web_notification'),
  notificationController.testWebNotification
);

// Шаблони сповіщень (тільки для адмінів)

// Отримати всі шаблони
router.get('/templates/list', 
  authenticateToken,
  adminAuth,
  query('type')
    .optional()
    .isIn(['email', 'telegram', 'web', 'sms'])
    .withMessage('Тип повинен бути одним з: email, telegram, web, sms'),
  query('category')
    .optional()
    .isIn(['ticket', 'user', 'system', 'security', 'maintenance'])
    .withMessage('Категорія повинна бути однією з: ticket, user, system, security, maintenance'),
  logAction('get_notification_templates'),
  notificationController.getNotificationTemplates
);

// Отримати конкретний шаблон
router.get('/templates/:id', 
  authenticateToken,
  adminAuth,
  param('id')
    .isMongoId()
    .withMessage('Невірний ID шаблону'),
  logAction('get_notification_template'),
  notificationController.getNotificationTemplate
);

// Створити новий шаблон
router.post('/templates', 
  authenticateToken,
  adminAuth,
  body('name')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Назва шаблону повинна містити від 3 до 100 символів'),
  body('type')
    .isIn(['email', 'telegram', 'web', 'sms'])
    .withMessage('Тип повинен бути одним з: email, telegram, web, sms'),
  body('category')
    .isIn(['ticket', 'user', 'system', 'security', 'maintenance'])
    .withMessage('Категорія повинна бути однією з: ticket, user, system, security, maintenance'),
  body('subject')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Тема повинна містити від 5 до 200 символів'),
  body('content')
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage('Вміст повинен містити від 10 до 5000 символів'),
  body('variables')
    .optional()
    .isArray()
    .withMessage('Змінні повинні бути масивом'),
  body('variables.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Назва змінної повинна містити від 1 до 50 символів'),
  logAction('create_notification_template'),
  notificationController.createNotificationTemplate
);

// Оновити шаблон
router.put('/templates/:id', 
  authenticateToken,
  adminAuth,
  param('id')
    .isMongoId()
    .withMessage('Невірний ID шаблону'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Назва шаблону повинна містити від 3 до 100 символів'),
  body('subject')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Тема повинна містити від 5 до 200 символів'),
  body('content')
    .optional()
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage('Вміст повинен містити від 10 до 5000 символів'),
  logAction('update_notification_template'),
  notificationController.updateNotificationTemplate
);

// Видалити шаблон
router.delete('/templates/:id', 
  authenticateToken,
  adminAuth,
  param('id')
    .isMongoId()
    .withMessage('Невірний ID шаблону'),
  logAction('delete_notification_template'),
  notificationController.deleteNotificationTemplate
);

// Статистика сповіщень (тільки для адмінів)

// Загальна статистика
router.get('/analytics/overview', 
  authenticateToken,
  adminAuth,
  query('period')
    .optional()
    .isIn(['day', 'week', 'month', 'year'])
    .withMessage('Період повинен бути одним з: day, week, month, year'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Дата початку повинна бути в форматі ISO 8601'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Дата кінця повинна бути в форматі ISO 8601'),
  logAction('get_notification_analytics'),
  notificationController.getNotificationAnalytics
);

// Статистика доставки
router.get('/analytics/delivery', 
  authenticateToken,
  adminAuth,
  query('channel')
    .optional()
    .isIn(['web', 'email', 'telegram', 'sms'])
    .withMessage('Канал повинен бути одним з: web, email, telegram, sms'),
  query('period')
    .optional()
    .isIn(['day', 'week', 'month', 'year'])
    .withMessage('Період повинен бути одним з: day, week, month, year'),
  logAction('get_delivery_analytics'),
  notificationController.getDeliveryAnalytics
);

// Статистика взаємодії користувачів
router.get('/analytics/engagement', 
  authenticateToken,
  adminAuth,
  query('period')
    .optional()
    .isIn(['day', 'week', 'month', 'year'])
    .withMessage('Період повинен бути одним з: day, week, month, year'),
  logAction('get_engagement_analytics'),
  notificationController.getEngagementAnalytics
);

// Експорт даних

// Експорт сповіщень
router.get('/export/notifications', 
  authenticateToken,
  adminAuth,
  query('format')
    .optional()
    .isIn(['csv', 'excel'])
    .withMessage('Формат експорту може бути тільки csv або excel'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Дата початку повинна бути в форматі ISO 8601'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Дата кінця повинна бути в форматі ISO 8601'),
  query('type')
    .optional()
    .isIn(['info', 'success', 'warning', 'error', 'system'])
    .withMessage('Тип повинен бути одним з: info, success, warning, error, system'),
  logAction('export_notifications'),
  notificationController.exportNotifications
);

// Експорт статистики
router.get('/export/analytics', 
  authenticateToken,
  adminAuth,
  query('format')
    .optional()
    .isIn(['csv', 'excel', 'pdf'])
    .withMessage('Формат експорту може бути csv, excel або pdf'),
  query('period')
    .optional()
    .isIn(['day', 'week', 'month', 'year'])
    .withMessage('Період повинен бути одним з: day, week, month, year'),
  logAction('export_notification_analytics'),
  notificationController.exportAnalytics
);

// Очищення старих сповіщень

// Очистити прочитані сповіщення
router.delete('/cleanup/read', 
  authenticateToken,
  adminAuth,
  body('olderThanDays')
    .isInt({ min: 1, max: 365 })
    .withMessage('Кількість днів повинна бути від 1 до 365'),
  body('dryRun')
    .optional()
    .isBoolean()
    .withMessage('dryRun повинно бути boolean значенням'),
  logAction('cleanup_read_notifications'),
  notificationController.cleanupReadNotifications
);

// Очистити всі старі сповіщення
router.delete('/cleanup/old', 
  authenticateToken,
  adminAuth,
  body('olderThanDays')
    .isInt({ min: 7, max: 1095 })
    .withMessage('Кількість днів повинна бути від 7 до 1095'),
  body('keepImportant')
    .optional()
    .isBoolean()
    .withMessage('keepImportant повинно бути boolean значенням'),
  body('dryRun')
    .optional()
    .isBoolean()
    .withMessage('dryRun повинно бути boolean значенням'),
  logAction('cleanup_old_notifications'),
  notificationController.cleanupOldNotifications
);

// WebSocket підключення для реального часу
router.get('/realtime/connect', 
  authenticateToken,
  logAction('connect_realtime_notifications'),
  notificationController.connectRealtime
);

// Обробка помилок
router.use((error, req, res, next) => {
  logger.error('Помилка в маршрутах сповіщень:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Помилка валідації',
      errors: Object.values(error.errors).map(err => err.message)
    });
  }
  
  if (error.name === 'NotificationError') {
    return res.status(400).json({
      message: 'Помилка сповіщення',
      error: error.message
    });
  }
  
  if (error.message.includes('Template not found')) {
    return res.status(404).json({
      message: 'Шаблон сповіщення не знайдено'
    });
  }
  
  if (error.message.includes('Notification not found')) {
    return res.status(404).json({
      message: 'Сповіщення не знайдено'
    });
  }
  
  if (error.message.includes('Permission denied')) {
    return res.status(403).json({
      message: 'Недостатньо прав для виконання операції'
    });
  }
  
  res.status(500).json({
    message: 'Внутрішня помилка сервера',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Щось пішло не так'
  });
});

module.exports = router;