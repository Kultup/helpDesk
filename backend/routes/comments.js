const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { body, param, query } = require('express-validator');
const commentController = require('../controllers/commentController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { logAction } = require('../middleware/logger');

// Валідація для створення коментаря
const createCommentValidation = [
  body('content')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Коментар повинен містити від 1 до 2000 символів'),

  body('ticketId').isMongoId().withMessage('Невірний ID тикету'),

  body('parentId').optional().isMongoId().withMessage('Невірний ID батьківського коментаря'),

  body('isInternal')
    .optional()
    .isBoolean()
    .withMessage('isInternal повинно бути boolean значенням'),

  body('attachments').optional().isArray().withMessage('Вкладення повинні бути масивом'),

  body('attachments.*.filename')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Назва файлу повинна містити від 1 до 255 символів'),

  body('attachments.*.url').optional().isURL().withMessage('Невірний URL файлу'),

  body('attachments.*.size')
    .optional()
    .isInt({ min: 1, max: 50000000 })
    .withMessage('Розмір файлу повинен бути від 1 байта до 50 МБ'),

  body('attachments.*.mimeType')
    .optional()
    .matches(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-_^]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-_^.]*$/)
    .withMessage('Невірний MIME тип файлу'),
];

// Валідація для оновлення коментаря
const updateCommentValidation = [
  param('id').isMongoId().withMessage('Невірний ID коментаря'),

  body('content')
    .optional()
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Коментар повинен містити від 1 до 2000 символів'),

  body('isInternal')
    .optional()
    .isBoolean()
    .withMessage('isInternal повинно бути boolean значенням'),

  body('attachments').optional().isArray().withMessage('Вкладення повинні бути масивом'),
];

// Валідація для отримання коментаря за ID
const getCommentByIdValidation = [param('id').isMongoId().withMessage('Невірний ID коментаря')];

// Валідація для видалення коментаря
const deleteCommentValidation = [param('id').isMongoId().withMessage('Невірний ID коментаря')];

// Валідація для отримання коментарів тикету
const getTicketCommentsValidation = [
  param('ticketId').isMongoId().withMessage('Невірний ID тикету'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Номер сторінки повинен бути позитивним числом'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Ліміт повинен бути числом від 1 до 100'),

  query('sortBy')
    .optional()
    .isIn(['createdAt', 'updatedAt'])
    .withMessage('Сортування можливе тільки по полях: createdAt, updatedAt'),

  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Порядок сортування може бути тільки asc або desc'),

  query('includeInternal')
    .optional()
    .isBoolean()
    .withMessage('includeInternal повинно бути boolean значенням'),

  query('includeDeleted')
    .optional()
    .isBoolean()
    .withMessage('includeDeleted повинно бути boolean значенням'),
];

// Валідація для отримання коментарів користувача
const getUserCommentsValidation = [
  param('userId').isMongoId().withMessage('Невірний ID користувача'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Номер сторінки повинен бути позитивним числом'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Ліміт повинен бути числом від 1 до 100'),

  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Дата початку повинна бути в форматі ISO 8601'),

  query('endDate').optional().isISO8601().withMessage('Дата кінця повинна бути в форматі ISO 8601'),
];

// Валідація для реакцій
const reactionValidation = [
  param('id').isMongoId().withMessage('Невірний ID коментаря'),

  body('type')
    .isIn(['like', 'dislike', 'love', 'laugh', 'angry', 'sad'])
    .withMessage('Тип реакції повинен бути одним з: like, dislike, love, laugh, angry, sad'),
];

// Валідація для модерації
const moderateCommentValidation = [
  param('id').isMongoId().withMessage('Невірний ID коментаря'),

  body('action')
    .isIn(['approve', 'reject', 'flag', 'unflag'])
    .withMessage('Дія модерації повинна бути одною з: approve, reject, flag, unflag'),

  body('reason')
    .optional()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('Причина повинна містити від 5 до 500 символів'),
];

// МАРШРУТИ

// Отримати всі коментарі (тільки для адміністраторів)
router.get(
  '/',
  authenticateToken,
  adminAuth,
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Номер сторінки повинен бути позитивним числом'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Ліміт повинен бути числом від 1 до 100'),
  logAction('view_all_comments'),
  commentController.getAllComments
);

// Отримати коментарі тикету
router.get(
  '/ticket/:ticketId',
  authenticateToken,
  getTicketCommentsValidation,
  logAction('view_ticket_comments'),
  commentController.getTicketComments
);

// Отримати коментарі користувача (тільки для адміністраторів або власника)
router.get(
  '/user/:userId',
  authenticateToken,
  getUserCommentsValidation,
  logAction('view_user_comments'),
  commentController.getUserComments
);

// Отримати статистику коментарів (тільки для адміністраторів)
router.get(
  '/statistics',
  authenticateToken,
  adminAuth,
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Дата початку повинна бути в форматі ISO 8601'),
  query('endDate').optional().isISO8601().withMessage('Дата кінця повинна бути в форматі ISO 8601'),
  logAction('view_comment_statistics'),
  commentController.getCommentStatistics
);

// Отримати коментарі для модерації (тільки для адміністраторів)
router.get(
  '/moderation',
  authenticateToken,
  adminAuth,
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Номер сторінки повинен бути позитивним числом'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Ліміт повинен бути числом від 1 до 100'),
  query('status')
    .optional()
    .isIn(['pending', 'approved', 'rejected', 'flagged'])
    .withMessage('Статус повинен бути одним з: pending, approved, rejected, flagged'),
  logAction('view_moderation_queue'),
  commentController.getModerationQueue
);

// Отримати коментар за ID
router.get(
  '/:id',
  authenticateToken,
  getCommentByIdValidation,
  logAction('view_comment'),
  commentController.getCommentById
);

// Створити новий коментар
router.post(
  '/',
  authenticateToken,
  createCommentValidation,
  logAction('create_comment'),
  commentController.createComment
);

// Оновити коментар (тільки автор або адміністратор)
router.put(
  '/:id',
  authenticateToken,
  updateCommentValidation,
  logAction('update_comment'),
  commentController.updateComment
);

// М'яке видалення коментаря (тільки автор або адміністратор)
router.delete(
  '/:id',
  authenticateToken,
  deleteCommentValidation,
  logAction('delete_comment'),
  commentController.deleteComment
);

// Відновити видалений коментар (тільки адміністратор)
router.patch(
  '/:id/restore',
  authenticateToken,
  adminAuth,
  param('id').isMongoId().withMessage('Невірний ID коментаря'),
  logAction('restore_comment'),
  commentController.restoreComment
);

// Додати реакцію до коментаря
router.post(
  '/:id/reactions',
  authenticateToken,
  reactionValidation,
  logAction('add_comment_reaction'),
  commentController.addReaction
);

// Видалити реакцію з коментаря
router.delete(
  '/:id/reactions',
  authenticateToken,
  param('id').isMongoId().withMessage('Невірний ID коментаря'),
  logAction('remove_comment_reaction'),
  commentController.removeReaction
);

// Модерація коментаря (тільки для адміністраторів)
router.patch(
  '/:id/moderate',
  authenticateToken,
  adminAuth,
  moderateCommentValidation,
  logAction('moderate_comment'),
  commentController.moderateComment
);

// Масові операції (тільки для адміністраторів)

// Масове видалення коментарів
router.delete(
  '/bulk/delete',
  authenticateToken,
  adminAuth,
  body('commentIds')
    .isArray({ min: 1, max: 100 })
    .withMessage('Масив ID коментарів повинен містити від 1 до 100 елементів'),
  body('commentIds.*').isMongoId().withMessage('Невірний ID коментаря'),
  logAction('bulk_delete_comments'),
  commentController.bulkDeleteComments
);

// Масова модерація коментарів
router.patch(
  '/bulk/moderate',
  authenticateToken,
  adminAuth,
  body('commentIds')
    .isArray({ min: 1, max: 100 })
    .withMessage('Масив ID коментарів повинен містити від 1 до 100 елементів'),
  body('commentIds.*').isMongoId().withMessage('Невірний ID коментаря'),
  body('action')
    .isIn(['approve', 'reject', 'flag', 'unflag'])
    .withMessage('Дія модерації повинна бути одною з: approve, reject, flag, unflag'),
  body('reason')
    .optional()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('Причина повинна містити від 5 до 500 символів'),
  logAction('bulk_moderate_comments'),
  commentController.bulkModerateComments
);

// Масове відновлення коментарів
router.patch(
  '/bulk/restore',
  authenticateToken,
  adminAuth,
  body('commentIds')
    .isArray({ min: 1, max: 100 })
    .withMessage('Масив ID коментарів повинен містити від 1 до 100 елементів'),
  body('commentIds.*').isMongoId().withMessage('Невірний ID коментаря'),
  logAction('bulk_restore_comments'),
  commentController.bulkRestoreComments
);

// Експорт коментарів (тільки для адміністраторів)
router.get(
  '/export/data',
  authenticateToken,
  adminAuth,
  query('format')
    .optional()
    .isIn(['csv', 'excel'])
    .withMessage('Формат експорту може бути тільки csv або excel'),
  query('ticketId').optional().isMongoId().withMessage('Невірний ID тикету'),
  query('userId').optional().isMongoId().withMessage('Невірний ID користувача'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Дата початку повинна бути в форматі ISO 8601'),
  query('endDate').optional().isISO8601().withMessage('Дата кінця повинна бути в форматі ISO 8601'),
  logAction('export_comments'),
  commentController.exportComments
);

// Пошук коментарів (тільки для адміністраторів)
router.get(
  '/search/content',
  authenticateToken,
  adminAuth,
  query('q')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Пошуковий запит повинен містити від 3 до 100 символів'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Номер сторінки повинен бути позитивним числом'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Ліміт повинен бути числом від 1 до 50'),
  logAction('search_comments'),
  commentController.searchComments
);

// Отримати тренди коментарів (тільки для адміністраторів)
router.get(
  '/analytics/trends',
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
  query('endDate').optional().isISO8601().withMessage('Дата кінця повинна бути в форматі ISO 8601'),
  logAction('view_comment_trends'),
  commentController.getCommentTrends
);

// Обробка помилок
router.use((error, req, res, _next) => {
  logger.error('Помилка в маршрутах коментарів:', error);

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Помилка валідації',
      errors: Object.values(error.errors).map(err => err.message),
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      message: 'Невірний формат ID',
    });
  }

  if (error.name === 'UnauthorizedError') {
    return res.status(403).json({
      message: 'Недостатньо прав для виконання цієї дії',
    });
  }

  res.status(500).json({
    message: 'Внутрішня помилка сервера',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Щось пішло не так',
  });
});

module.exports = router;
