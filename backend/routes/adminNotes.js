const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const adminNoteController = require('../controllers/adminNoteController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Валідація для створення нотатки
const createNoteValidation = [
  body('title')
    .notEmpty()
    .withMessage('Заголовок нотатки обов\'язковий')
    .isLength({ min: 1, max: 200 })
    .withMessage('Заголовок повинен бути від 1 до 200 символів'),
  
  body('content')
    .notEmpty()
    .withMessage('Вміст нотатки обов\'язковий')
    .isLength({ min: 1, max: 10000 })
    .withMessage('Вміст повинен бути від 1 до 10000 символів'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Невірний пріоритет'),
  
  body('category')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Категорія не може перевищувати 100 символів'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Теги повинні бути масивом'),
  
  body('tags.*')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Кожен тег повинен бути від 1 до 50 символів'),
  
  body('color')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Невірний формат кольору (повинен бути hex)'),
  
  body('reminderDate')
    .optional()
    .isISO8601()
    .withMessage('Невірний формат дати нагадування')
];

// Валідація для оновлення нотатки
const updateNoteValidation = [
  body('title')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('Заголовок повинен бути від 1 до 200 символів'),
  
  body('content')
    .optional()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Вміст повинен бути від 1 до 10000 символів'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Невірний пріоритет'),
  
  body('category')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Категорія не може перевищувати 100 символів'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Теги повинні бути масивом'),
  
  body('tags.*')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Кожен тег повинен бути від 1 до 50 символів'),
  
  body('color')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Невірний формат кольору (повинен бути hex)'),
  
  body('reminderDate')
    .optional()
    .isISO8601()
    .withMessage('Невірний формат дати нагадування')
];

// Валідація для тегів
const tagValidation = [
  body('tag')
    .notEmpty()
    .withMessage('Тег обов\'язковий')
    .isLength({ min: 1, max: 50 })
    .withMessage('Тег повинен бути від 1 до 50 символів')
];

// Маршрути для особистих нотаток

// GET /api/admin-notes - Отримати всі нотатки адміністратора
router.get('/', authenticateToken, adminAuth, adminNoteController.getAdminNotes);

// GET /api/admin-notes/pinned - Отримати закріплені нотатки
router.get('/pinned', authenticateToken, adminAuth, adminNoteController.getPinnedNotes);

// GET /api/admin-notes/statistics - Отримати статистику нотаток
router.get('/statistics', authenticateToken, adminAuth, adminNoteController.getNotesStatistics);

// GET /api/admin-notes/:id - Отримати нотатку за ID
router.get('/:id', authenticateToken, adminAuth, adminNoteController.getAdminNoteById);

// POST /api/admin-notes - Створити нову нотатку
router.post('/', authenticateToken, adminAuth, createNoteValidation, adminNoteController.createAdminNote);

// PUT /api/admin-notes/:id - Оновити нотатку
router.put('/:id', authenticateToken, adminAuth, updateNoteValidation, adminNoteController.updateAdminNote);

// DELETE /api/admin-notes/:id - Видалити нотатку
router.delete('/:id', authenticateToken, adminAuth, adminNoteController.deleteAdminNote);

// PATCH /api/admin-notes/:id/pin - Закріпити/відкріпити нотатку
router.patch('/:id/pin', authenticateToken, adminAuth, adminNoteController.togglePin);

// POST /api/admin-notes/:id/tags - Додати тег до нотатки
router.post('/:id/tags', authenticateToken, adminAuth, tagValidation, adminNoteController.addTag);

// DELETE /api/admin-notes/:id/tags - Видалити тег з нотатки
router.delete('/:id/tags', authenticateToken, adminAuth, tagValidation, adminNoteController.removeTag);

module.exports = router;