const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');
const userController = require('../controllers/userController');
const commentController = require('../controllers/commentController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { handleValidationErrors } = require('../middleware/validation');

// Валідація для створення користувача
const createUserValidation = [
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Ім\'я повинно містити від 2 до 50 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ\s]+$/)
    .withMessage('Ім\'я може містити тільки літери та пробіли'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Прізвище повинно містити від 2 до 50 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ\s]+$/)
    .withMessage('Прізвище може містити тільки літери та пробіли'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Невірний формат email'),
  body('password')
    .isLength({ min: 6, max: 100 })
    .withMessage('Пароль повинен містити від 6 до 100 символів')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Пароль повинен містити мінімум одну велику літеру, одну малу літеру та одну цифру'),
  body('role')
    .optional()
    .isIn(['admin', 'user'])
    .withMessage('Роль повинна бути admin або user'),
  body('department')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Відділ повинен містити від 2 до 100 символів'),
  body('position')
    .isMongoId()
    .withMessage('Невірний ID посади'),
  body('city')
    .isMongoId()
    .withMessage('Невірний ID міста'),
  body('telegramId')
    .custom((value, { req }) => {
      // Якщо значення відсутнє, null, undefined або порожній рядок - пропускаємо валідацію
      if (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')) {
        delete req.body.telegramId; // Видаляємо поле з req.body
        return true;
      }
      
      // Перевіряємо формат для непорожніх значень
      const trimmedValue = value.trim();
      if (!/^@?[a-zA-Z0-9_]{5,32}$/.test(trimmedValue)) {
        throw new Error('Невірний формат Telegram ID');
      }
      
      return true;
    }),
  body('phone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Невірний формат номера телефону')
];

// Валідація для оновлення користувача
const updateUserValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Ім\'я повинно містити від 2 до 50 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ\s]+$/)
    .withMessage('Ім\'я може містити тільки літери та пробіли'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Прізвище повинно містити від 2 до 50 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ\s]+$/)
    .withMessage('Прізвище може містити тільки літери та пробіли'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Невірний формат email'),
  body('role')
    .optional()
    .isIn(['admin', 'user'])
    .withMessage('Роль повинна бути admin або user'),
  body('position')
    .optional()
    .isMongoId()
    .withMessage('Невірний ID посади'),
  body('city')
    .optional()
    .isMongoId()
    .withMessage('Невірний ID міста'),
  body('telegramId')
    .custom((value, { req }) => {
      // Якщо значення відсутнє, null, undefined або порожній рядок - пропускаємо валідацію
      if (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')) {
        delete req.body.telegramId; // Видаляємо поле з req.body
        return true;
      }
      
      // Перевіряємо формат для непорожніх значень
      const trimmedValue = value.trim();
      if (!/^@?[a-zA-Z0-9_]{5,32}$/.test(trimmedValue)) {
        throw new Error('Невірний формат Telegram ID');
      }
      
      return true;
    }),
  body('phone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Невірний формат номера телефону'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive повинен бути boolean')
];

// Валідація для зміни пароля
const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Поточний пароль обов\'язковий'),
  body('newPassword')
    .isLength({ min: 6, max: 100 })
    .withMessage('Новий пароль повинен містити від 6 до 100 символів')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Новий пароль повинен містити мінімум одну велику літеру, одну малу літеру та одну цифру'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Підтвердження пароля не співпадає');
      }
      return true;
    })
];

// Валідація для оновлення профілю
const updateProfileValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Ім\'я повинно містити від 2 до 50 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ\s]+$/)
    .withMessage('Ім\'я може містити тільки літери та пробіли'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Прізвище повинно містити від 2 до 50 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ\s]+$/)
    .withMessage('Прізвище може містити тільки літери та пробіли'),
  body('phone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Невірний формат номера телефону'),
  body('telegramId')
    .optional()
    .isNumeric()
    .withMessage('Telegram ID повинен бути числом'),
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Біографія не повинна перевищувати 500 символів'),
  body('preferences')
    .optional()
    .isObject()
    .withMessage('Налаштування повинні бути об\'єктом'),
  body('preferences.language')
    .optional()
    .isIn(['uk', 'en', 'ru'])
    .withMessage('Мова повинна бути uk, en або ru'),
  body('preferences.theme')
    .optional()
    .isIn(['light', 'dark', 'auto'])
    .withMessage('Тема повинна бути light, dark або auto'),
  body('preferences.notifications')
    .optional()
    .isObject()
    .withMessage('Налаштування сповіщень повинні бути об\'єктом')
];

// Валідація параметрів запиту
const queryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Сторінка повинна бути позитивним числом'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Ліміт повинен бути від 1 до 100'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'updatedAt', 'firstName', 'lastName', 'email', 'role'])
    .withMessage('Невірне поле для сортування'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Порядок сортування повинен бути asc або desc'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive повинен бути boolean')
];

// Валідація ID параметрів
const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Невірний ID користувача')
];

// ОСНОВНІ МАРШРУТИ ДЛЯ КОРИСТУВАЧІВ

// Отримати всіх користувачів (тільки адміни)
router.get('/', authenticateToken, adminAuth, queryValidation, userController.getUsers);

// Отримати список адміністраторів для присвоєння тікетів (має бути перед /:id)
router.get('/admins', authenticateToken, userController.getAdmins);

// УПРАВЛІННЯ РЕЄСТРАЦІЯМИ (має бути перед /:id)
// Отримати список користувачів з pending статусом (тільки адміни)
router.get('/pending-registrations', authenticateToken, adminAuth, userController.getPendingRegistrations);

// Отримати користувача за ID
router.get('/:id', authenticateToken, idValidation, userController.getUserById);

// Створити нового користувача (тільки адміни)
router.post('/', authenticateToken, adminAuth, createUserValidation, handleValidationErrors, userController.createUser);

// Оновити користувача (тільки адміни)
router.put('/:id', authenticateToken, adminAuth, idValidation, updateUserValidation, userController.updateUser);

// Масова зміна статусу користувачів (тільки адміни) - ВАЖЛИВО: має бути перед /:id/toggle-active
router.patch('/bulk/toggle-active', authenticateToken, adminAuth, [
  body('userIds')
    .isArray({ min: 1 })
    .withMessage('Необхідно вказати масив ID користувачів')
    .custom((userIds) => {
      if (!userIds.every(id => typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/))) {
        throw new Error('Всі ID користувачів повинні бути валідними ObjectId');
      }
      return true;
    }),
  body('action')
    .isIn(['activate', 'deactivate'])
    .withMessage('Дія повинна бути "activate" або "deactivate"')
], handleValidationErrors, userController.bulkToggleUsers);

// Деактивувати/активувати користувача (тільки адміни)
router.patch('/:id/toggle-active', authenticateToken, adminAuth, idValidation, handleValidationErrors, userController.toggleUserActive);

// Видалити користувача (тільки адміни) - залишаємо для сумісності
router.delete('/:id', authenticateToken, adminAuth, idValidation, userController.deleteUser);

// Повне видалення користувача (тільки адміни)
router.delete('/:id/force', authenticateToken, adminAuth, idValidation, handleValidationErrors, userController.forceDeleteUser);

// МАРШРУТИ ДЛЯ ПРОФІЛЮ

// Отримати власний профіль
router.get('/profile/me', authenticateToken, userController.getProfile);

// Оновити власний профіль
router.put('/profile/me', authenticateToken, updateProfileValidation, userController.updateProfile);

// Змінити пароль
router.put('/profile/change-password', authenticateToken, changePasswordValidation, userController.changePassword);

// МАРШРУТИ ДЛЯ КОМЕНТАРІВ КОРИСТУВАЧА

// Отримати коментарі користувача
router.get('/:userId/comments', authenticateToken, [
  param('userId').isMongoId().withMessage('Невірний ID користувача'),
  ...queryValidation
], commentController.getUserComments);

// Отримати налаштування користувача
router.get('/:id/preferences', authenticateToken, idValidation, userController.getUserPreferences);

// Оновити налаштування користувача
router.put('/:id/preferences', authenticateToken, idValidation, [
  body('language')
    .optional()
    .isIn(['uk', 'en'])
    .withMessage('Мова повинна бути uk або en'),
  body('theme')
    .optional()
    .isIn(['light', 'dark', 'auto'])
    .withMessage('Тема повинна бути light, dark або auto'),
  body('timezone')
    .optional()
    .isString()
    .withMessage('Часовий пояс повинен бути рядком'),
  body('dateFormat')
    .optional()
    .isIn(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'])
    .withMessage('Формат дати повинен бути DD/MM/YYYY, MM/DD/YYYY або YYYY-MM-DD'),
  body('timeFormat')
    .optional()
    .isIn(['12h', '24h'])
    .withMessage('Формат часу повинен бути 12h або 24h'),
  body('itemsPerPage')
    .optional()
    .isInt({ min: 5, max: 100 })
    .withMessage('Кількість елементів на сторінці повинна бути від 5 до 100'),
  body('emailNotifications')
    .optional()
    .isObject()
    .withMessage('Налаштування email сповіщень повинні бути об\'єктом'),
  body('telegramNotifications')
    .optional()
    .isObject()
    .withMessage('Налаштування telegram сповіщень повинні бути об\'єктом')
], handleValidationErrors, userController.updateUserPreferences);

// ДОДАТКОВІ МАРШРУТИ (ЗАКОМЕНТОВАНО ДО РЕАЛІЗАЦІЇ МЕТОДІВ)
// Завантажити аватар користувача
// router.post('/:id/avatar', authenticateToken, idValidation, userController.uploadAvatar);

// Видалити аватар користувача
// router.delete('/:id/avatar', authenticateToken, idValidation, userController.deleteAvatar);

// Отримати список онлайн користувачів (тільки адміни)
// router.get('/status/online', authenticateToken, adminAuth, userController.getOnlineUsers);

// Відправити повідомлення користувачу (тільки адміни)
// router.post('/:id/message', authenticateToken, adminAuth, idValidation, [
//   body('subject')
//     .trim()
//     .isLength({ min: 3, max: 100 })
//     .withMessage('Тема повинна містити від 3 до 100 символів'),
//   body('message')
//     .trim()
//     .isLength({ min: 10, max: 1000 })
//     .withMessage('Повідомлення повинно містити від 10 до 1000 символів'),
//   body('type')
//     .optional()
//     .isIn(['info', 'warning', 'error'])
//     .withMessage('Тип повідомлення повинен бути info, warning або error')
// ], userController.sendMessageToUser);

// Підтвердити реєстрацію користувача (тільки адміни)
router.patch('/:id/approve-registration', 
  authenticateToken, 
  adminAuth, 
  param('id').isMongoId().withMessage('Невірний ID користувача'),
  handleValidationErrors,
  userController.approveRegistration
);

// Відхилити реєстрацію користувача (тільки адміни)
router.patch('/:id/reject-registration', 
  authenticateToken, 
  adminAuth, 
  param('id').isMongoId().withMessage('Невірний ID користувача'),
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Причина не може перевищувати 500 символів'),
  handleValidationErrors,
  userController.rejectRegistration
);

// Очистити застарілі реєстрації (тільки адміни)
router.post('/cleanup-registrations', 
  authenticateToken, 
  adminAuth,
  userController.cleanupRegistrations
);

module.exports = router;