const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Валідація для створення/оновлення категорії
const categoryValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Назва категорії повинна містити від 2 до 50 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ0-9\s\-_]+$/)
    .withMessage('Назва категорії може містити лише літери, цифри, пробіли, дефіси та підкреслення'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Опис не може перевищувати 500 символів'),
  
  body('color')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Колір повинен бути у форматі HEX (#RRGGBB або #RGB)'),
  
  body('icon')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Назва іконки не може перевищувати 50 символів'),
  
  body('sortOrder')
    .optional()
    .isInt({ min: 0, max: 999 })
    .withMessage('Порядок сортування повинен бути числом від 0 до 999'),
  
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('Статус активності повинен бути булевим значенням')
];

// Отримати всі категорії (доступно всім авторизованим користувачам)
router.get('/', authenticateToken, categoryController.getCategories);

// Отримати статистику категорій (доступно всім авторизованим користувачам)
router.get('/stats/usage', authenticateToken, categoryController.getCategoryStats);

// Отримати категорію за ID (доступно всім авторизованим користувачам)
router.get('/:id', authenticateToken, categoryController.getCategoryById);

// Створити нову категорію (тільки адміністратори)
router.post('/', authenticateToken, adminAuth, categoryValidation, categoryController.createCategory);

// Оновити категорію (тільки адміністратори)
router.put('/:id', authenticateToken, adminAuth, categoryValidation, categoryController.updateCategory);

// Видалити категорію (тільки адміністратори)
router.delete('/:id', authenticateToken, adminAuth, categoryController.deleteCategory);

// Деактивувати категорію (тільки адміністратори)
router.patch('/:id/deactivate', authenticateToken, adminAuth, categoryController.deactivateCategory);

// Активувати категорію (тільки адміністратори)
router.patch('/:id/activate', authenticateToken, adminAuth, categoryController.activateCategory);

module.exports = router;