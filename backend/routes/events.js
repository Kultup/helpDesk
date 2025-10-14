const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const eventController = require('../controllers/eventController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Валідація для створення події
const createEventValidation = [
  body('title')
    .notEmpty()
    .withMessage('Назва події обов\'язкова')
    .isLength({ min: 1, max: 200 })
    .withMessage('Назва події повинна бути від 1 до 200 символів'),
  
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Опис не може перевищувати 2000 символів'),
  
  body('date')
    .notEmpty()
    .withMessage('Дата події обов\'язкова')
    .isISO8601()
    .withMessage('Невірний формат дати події'),
  
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('Невірний формат дати закінчення'),
  
  body('type')
    .optional()
    .isIn(['meeting', 'deadline', 'reminder', 'holiday', 'task', 'appointment'])
    .withMessage('Невірний тип події'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Невірний пріоритет'),
  
  body('location')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Місце розташування не може перевищувати 500 символів'),
  
  body('attendees')
    .optional()
    .isArray()
    .withMessage('Учасники повинні бути масивом'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Теги повинні бути масивом'),
  
  body('isRecurring')
    .optional()
    .isBoolean()
    .withMessage('isRecurring повинно бути булевим значенням'),
  
  body('recurrencePattern.frequency')
    .if(body('isRecurring').equals(true))
    .notEmpty()
    .withMessage('Частота повторення обов\'язкова для рекурсивних подій')
    .isIn(['daily', 'weekly', 'monthly', 'yearly'])
    .withMessage('Невірна частота повторення'),
  
  body('recurrencePattern.interval')
    .if(body('isRecurring').equals(true))
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Інтервал повинен бути від 1 до 365'),
  
  body('recurrencePattern.endDate')
    .if(body('isRecurring').equals(true))
    .optional()
    .isISO8601()
    .withMessage('Невірний формат дати закінчення повторення'),
  
  body('reminders')
    .optional()
    .isArray()
    .withMessage('Нагадування повинні бути масивом'),
  
  body('reminders.*.type')
    .optional()
    .isIn(['email', 'push', 'sms'])
    .withMessage('Невірний тип нагадування'),
  
  body('reminders.*.minutesBefore')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Хвилини до нагадування повинні бути позитивним числом')
];

// Валідація для оновлення події
const updateEventValidation = [
  body('title')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('Назва події повинна бути від 1 до 200 символів'),
  
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Опис не може перевищувати 2000 символів'),
  
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Невірний формат дати події'),
  
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('Невірний формат дати закінчення'),
  
  body('type')
    .optional()
    .isIn(['meeting', 'deadline', 'reminder', 'event', 'task'])
    .withMessage('Невірний тип події'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Невірний пріоритет'),
  
  body('location')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Місце розташування не може перевищувати 500 символів'),
  
  body('attendees')
    .optional()
    .isArray()
    .withMessage('Учасники повинні бути масивом'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Теги повинні бути масивом'),
  
  body('reminders')
    .optional()
    .isArray()
    .withMessage('Нагадування повинні бути масивом')
];

// Валідація для додавання учасника
const addAttendeeValidation = [
  body('userId')
    .notEmpty()
    .withMessage('ID користувача обов\'язковий')
    .isMongoId()
    .withMessage('Невірний ID користувача')
];

// Маршрути для подій

// GET /api/events - Отримати всі події
router.get('/', authenticateToken, adminAuth, eventController.getEvents);

// GET /api/events/upcoming - Отримати майбутні події
router.get('/upcoming', authenticateToken, adminAuth, eventController.getUpcomingEvents);

// GET /api/events/:id - Отримати подію за ID
router.get('/:id', authenticateToken, adminAuth, eventController.getEventById);

// POST /api/events - Створити нову подію
router.post('/', authenticateToken, adminAuth, createEventValidation, eventController.createEvent);

// PUT /api/events/:id - Оновити подію
router.put('/:id', authenticateToken, adminAuth, updateEventValidation, eventController.updateEvent);

// DELETE /api/events/:id - Видалити подію
router.delete('/:id', authenticateToken, adminAuth, eventController.deleteEvent);

// POST /api/events/:id/attendees - Додати учасника до події
router.post('/:id/attendees', authenticateToken, adminAuth, addAttendeeValidation, eventController.addAttendee);

// DELETE /api/events/:id/attendees/:userId - Видалити учасника з події
router.delete('/:id/attendees/:userId', authenticateToken, adminAuth, eventController.removeAttendee);

// PATCH /api/events/:id/complete - Позначити подію як завершену
router.patch('/:id/complete', authenticateToken, adminAuth, eventController.markAsCompleted);

// PATCH /api/events/:id/cancel - Скасувати подію
router.patch('/:id/cancel', authenticateToken, adminAuth, eventController.cancelEvent);

module.exports = router;