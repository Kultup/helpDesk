const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const logger = require('../utils/logger');

// Middleware для обробки результатів валідації
const handleValidationErrors = (req, res, next) => {
  logger.info('🔍 Валідація req.body:', req.body);
  
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.info('❌ Помилки валідації:', errors.array());
    
    const formattedErrors = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Помилки валідації',
      errors: formattedErrors
    });
  }
  
  logger.debug('✅ Валідація пройшла успішно');
  next();
};

// Валідація для створення/оновлення користувача
const validateUser = [
  body('email')
    .isEmail()
    .withMessage('Невірний формат email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Пароль повинен містити мінімум 6 символів')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Пароль повинен містити принаймні одну велику літеру, одну малу літеру та одну цифру'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Ім\'я повинно містити від 2 до 50 символів')
    .matches(/^[а-яА-ЯіІїЇєЄa-zA-Z\s\-\']+$/)
    .withMessage('Ім\'я може містити тільки літери, пробіли, дефіси та апострофи'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Прізвище повинно містити від 2 до 50 символів')
    .matches(/^[а-яА-ЯіІїЇєЄa-zA-Z\s\-\']+$/)
    .withMessage('Прізвище може містити тільки літери, пробіли, дефіси та апострофи'),
  body('phone')
    .optional()
    .matches(/^\+380\d{9}$/)
    .withMessage('Телефон повинен бути у форматі +380XXXXXXXXX'),
  body('role')
    .optional()
    .isIn(['admin', 'user'])
    .withMessage('Роль може бути тільки admin або user'),
  handleValidationErrors
];

// Валідація для створення/оновлення тикету
const validateTicket = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Заголовок повинен містити від 5 до 200 символів'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Опис повинен містити від 10 до 2000 символів'),
  body('priority')
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Пріоритет може бути: low, medium, high, urgent'),
  body('category')
    .isIn(['technical', 'billing', 'general', 'complaint', 'suggestion'])
    .withMessage('Категорія може бути: technical, billing, general, complaint, suggestion'),
  body('city')
    .optional()
    .isMongoId()
    .withMessage('Невірний ID міста'),
  body('assignedTo')
    .optional()
    .isMongoId()
    .withMessage('Невірний ID користувача'),
  handleValidationErrors
];

// Валідація для створення коментаря
const validateComment = [
  body('content')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Коментар повинен містити від 1 до 1000 символів'),
  body('isInternal')
    .optional()
    .isBoolean()
    .withMessage('isInternal повинно бути boolean'),
  handleValidationErrors
];

// Валідація для створення міста
const validateCity = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Назва міста повинна містити від 2 до 100 символів')
    .matches(/^[а-яА-ЯіІїЇєЄa-zA-Z\s\-\']+$/)
    .withMessage('Назва міста може містити тільки літери, пробіли, дефіси та апострофи'),
  body('region')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Назва регіону повинна містити від 2 до 100 символів'),
  body('coordinates.lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Широта повинна бути від -90 до 90'),
  body('coordinates.lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Довгота повинна бути від -180 до 180'),
  handleValidationErrors
];

// Валідація для створення посади
const validatePosition = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Назва посади повинна містити від 2 до 100 символів'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Опис не повинен перевищувати 500 символів'),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Дозволи повинні бути масивом'),
  handleValidationErrors
];

// Валідація MongoDB ObjectId
const validateObjectId = (paramName) => [
  param(paramName)
    .isMongoId()
    .withMessage(`Невірний формат ${paramName}`),
  handleValidationErrors
];

// Валідація для пагінації
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Номер сторінки повинен бути позитивним числом'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Ліміт повинен бути від 1 до 100'),
  query('sort')
    .optional()
    .isIn(['createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'title', '-title'])
    .withMessage('Невірний параметр сортування'),
  handleValidationErrors
];

// Валідація для фільтрів тикетів
const validateTicketFilters = [
  query('status')
    .optional()
    .isIn(['open', 'in_progress', 'resolved', 'closed'])
    .withMessage('Невірний статус'),
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Невірний пріоритет'),
  query('category')
    .optional()
    .isIn(['technical', 'billing', 'general', 'complaint', 'suggestion'])
    .withMessage('Невірна категорія'),
  query('city')
    .optional()
    .isMongoId()
    .withMessage('Невірний ID міста'),
  query('assignedTo')
    .optional()
    .isMongoId()
    .withMessage('Невірний ID користувача'),
  query('createdFrom')
    .optional()
    .isISO8601()
    .withMessage('Невірний формат дати початку'),
  query('createdTo')
    .optional()
    .isISO8601()
    .withMessage('Невірний формат дати кінця'),
  handleValidationErrors
];

// Rate limiting для різних ендпоінтів
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message: message || 'Забагато запитів, спробуйте пізніше'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// Різні ліміти для різних типів запитів
const rateLimits = {
  // Загальний ліміт для API (збільшуємо для analytics)
  general: createRateLimit(15 * 60 * 1000, 5000, 'Забагато запитів до API'),
  
  // Строгий ліміт для аутентифікації (тимчасово збільшено для тестування)
  auth: createRateLimit(15 * 60 * 1000, 50, 'Забагато спроб входу, спробуйте через 15 хвилин'),
  
  // Ліміт для створення тикетів
  createTicket: createRateLimit(60 * 1000, 10, 'Забагато тикетів створено за хвилину'),
  
  // Ліміт для завантаження файлів
  upload: createRateLimit(60 * 1000, 20, 'Забагато файлів завантажено за хвилину'),
  
  // Ліміт для Telegram webhook
  telegram: createRateLimit(60 * 1000, 100, 'Забагато повідомлень від Telegram'),
  
  // Спеціальний ліміт для analytics (дуже м'який для виправлення 429 помилок)
  analytics: createRateLimit(60 * 1000, 500, 'Забагато запитів до аналітики за хвилину')
};

/**
 * Рекурсивна санітизація HTML в об'єктах
 * xss-clean middleware вже обробить запити, тут тільки trim для рядків
 */
const xss = require('xss-clean');
const sanitizeObject = (obj, allowedFields = []) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, allowedFields));
  }

  const sanitized = {};
  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;

    // Пропускаємо поля, які дозволено залишити HTML (наприклад, content для rich text editors)
    if (allowedFields.includes(key) && typeof obj[key] === 'string') {
      sanitized[key] = obj[key];
      continue;
    }

    if (typeof obj[key] === 'string') {
      // xss-clean middleware вже обробить запити, тут тільки trim
      sanitized[key] = String(obj[key]).trim();
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitized[key] = sanitizeObject(obj[key], allowedFields);
    } else {
      sanitized[key] = obj[key];
    }
  }
  return sanitized;
};

// Middleware для санітизації даних
const sanitizeData = [
  mongoSanitize(), // Захист від NoSQL ін'єкцій
  xss(), // Захист від XSS атак
  (req, res, next) => {
    // Список полів, які дозволяють HTML (наприклад, rich text контент)
    // Це повинно бути налаштовано для конкретних випадків використання
    const allowedHtmlFields = ['description', 'content', 'htmlContent'];

    // Додаткова санітизація об'єктів (xss() працює тільки на рядках)
    if (req.body) {
      req.body = sanitizeObject(req.body, allowedHtmlFields);
    }
    if (req.query) {
      req.query = sanitizeObject(req.query, []);
    }
    if (req.params) {
      req.params = sanitizeObject(req.params, []);
    }

    next();
  },
];

// Middleware для безпеки заголовків
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
});

module.exports = {
  validateUser,
  validateTicket,
  validateComment,
  validateCity,
  validatePosition,
  validateObjectId,
  validatePagination,
  validateTicketFilters,
  rateLimits,
  sanitizeData,
  securityHeaders,
  handleValidationErrors
};