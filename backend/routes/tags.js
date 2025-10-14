const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const tagController = require('../controllers/tagController');
const { authenticateToken } = require('../middleware/auth');

// Валідація для створення/оновлення тегу
const tagValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Назва тегу повинна містити від 2 до 50 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ0-9\s\-_]+$/)
    .withMessage('Назва тегу може містити тільки літери, цифри, пробіли, дефіси та підкреслення'),
  
  body('color')
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Колір повинен бути у форматі HEX (наприклад, #FF0000)'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Опис не може перевищувати 200 символів')
];

// Валідація для оновлення тегу
const tagUpdateValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Назва тегу повинна містити від 2 до 50 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ0-9\s\-_]+$/)
    .withMessage('Назва тегу може містити тільки літери, цифри, пробіли, дефіси та підкреслення'),
  
  body('color')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Колір повинен бути у форматі HEX (наприклад, #FF0000)'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Опис не може перевищувати 200 символів'),
  
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive повинно бути булевим значенням')
];

// Маршрути для тегів

// GET /api/tags - Отримати всі теги
router.get('/', authenticateToken, tagController.getTags);

// GET /api/tags/search - Пошук тегів
router.get('/search', authenticateToken, tagController.searchTags);

// GET /api/tags/most-used - Найпопулярніші теги
router.get('/most-used', authenticateToken, tagController.getMostUsedTags);

// GET /api/tags/:id - Отримати тег за ID
router.get('/:id', authenticateToken, tagController.getTagById);

// POST /api/tags - Створити новий тег
router.post('/', authenticateToken, tagValidation, tagController.createTag);

// PUT /api/tags/:id - Оновити тег
router.put('/:id', authenticateToken, tagUpdateValidation, tagController.updateTag);

// DELETE /api/tags/:id - Видалити тег
router.delete('/:id', authenticateToken, tagController.deleteTag);



module.exports = router;