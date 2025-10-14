const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const ticketHistoryController = require('../controllers/ticketHistoryController');
const { authenticateToken } = require('../middleware/auth');

// Валідація для додавання запису до історії
const validateHistoryEntry = [
  body('action')
    .notEmpty()
    .withMessage('Дія є обов\'язковою')
    .isIn([
      'created', 'status_changed', 'priority_changed', 'assigned', 'unassigned',
      'comment_added', 'attachment_added', 'attachment_removed', 'tag_added',
      'tag_removed', 'note_added', 'note_updated', 'note_removed', 'time_logged',
      'due_date_changed', 'category_changed', 'title_changed', 'description_changed',
      'watcher_added', 'watcher_removed', 'escalated', 'reopened', 'closed', 'resolved'
    ])
    .withMessage('Недійсна дія'),
  body('description')
    .notEmpty()
    .withMessage('Опис є обов\'язковим')
    .isLength({ max: 500 })
    .withMessage('Опис не може перевищувати 500 символів'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Метадані повинні бути об\'єктом'),
  body('isVisible')
    .optional()
    .isBoolean()
    .withMessage('isVisible повинно бути булевим значенням')
];

// Валідація для оновлення видимості
const validateVisibilityUpdate = [
  body('isVisible')
    .isBoolean()
    .withMessage('isVisible повинно бути булевим значенням')
];

// Маршрути для історії тікетів

// GET /api/tickets/:ticketId/history - Отримати історію змін тікету
router.get('/:ticketId/history', authenticateToken, ticketHistoryController.getTicketHistory);

// GET /api/tickets/:ticketId/history/stats - Отримати статистику змін тікету
router.get('/:ticketId/history/stats', authenticateToken, ticketHistoryController.getTicketChangeStats);



// POST /api/tickets/:ticketId/history - Додати запис до історії (тільки адміністратори)
router.post('/:ticketId/history', authenticateToken, validateHistoryEntry, ticketHistoryController.addHistoryEntry);

// PUT /api/history/:historyId/visibility - Оновити видимість запису історії
router.put('/history/:historyId/visibility', authenticateToken, validateVisibilityUpdate, ticketHistoryController.updateHistoryVisibility);

// DELETE /api/history/:historyId - Видалити запис з історії
router.delete('/history/:historyId', authenticateToken, ticketHistoryController.deleteHistoryEntry);

module.exports = router;