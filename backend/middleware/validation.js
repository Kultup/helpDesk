const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');
const { validationResult } = require('express-validator');

// Middleware для безпеки заголовків
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Додано для React в production
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"],
      fontSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: ["'none'"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"]
    },
    // В production можна закрити, але для мобільних пристроїв краще залишити більш гнучкі налаштування
    reportOnly: process.env.NODE_ENV === 'development'
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" } // Дозволяє завантаження ресурсів для мобільних
});

// Функція для санітизації об'єктів
const sanitizeObject = (obj, allowedHtmlFields = []) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized = {};
  for (const key in obj) {
    if (Array.isArray(obj[key])) {
      sanitized[key] = obj[key].map(item => 
        typeof item === 'object' ? sanitizeObject(item, allowedHtmlFields) : item
      );
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitized[key] = sanitizeObject(obj[key], allowedHtmlFields);
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

// Rate limiting для різних ендпоінтів
const rateLimits = {
  // Загальний rate limit для всіх API
  general: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 хвилин
    max: 100, // максимум 100 запитів з одного IP
    message: 'Забагато запитів з цієї IP адреси, спробуйте пізніше',
    standardHeaders: true,
    legacyHeaders: false,
  }),
  
  // Rate limit для авторизації (більш строгий)
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 хвилин
    max: 5, // максимум 5 спроб входу
    message: 'Забагато спроб входу, спробуйте пізніше',
    skipSuccessfulRequests: true,
  }),
  
  // Rate limit для завантаження файлів
  upload: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 година
    max: 20, // максимум 20 завантажень на годину
    message: 'Забагато завантажень файлів, спробуйте пізніше',
  }),
  
  // Rate limit для Telegram webhook (більш м'який)
  telegram: rateLimit({
    windowMs: 60 * 1000, // 1 хвилина
    max: 30, // максимум 30 запитів на хвилину
    message: 'Забагато запитів від Telegram, спробуйте пізніше',
  }),
  
  // Rate limit для аналітики
  analytics: rateLimit({
    windowMs: 60 * 1000, // 1 хвилина
    max: 10, // максимум 10 запитів на хвилину
    message: 'Забагато запитів до аналітики, спробуйте пізніше',
  }),
  
  // Rate limit для створення тикетів
  createTicket: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 хвилин
    max: 10, // максимум 10 тикетів за 15 хвилин
    message: 'Забагато спроб створення тикетів, спробуйте пізніше',
  })
};

// Middleware для обробки помилок валідації express-validator
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Помилки валідації',
      errors: errors.array().map(err => ({
        field: err.param || err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

module.exports = {
  securityHeaders,
  sanitizeData,
  rateLimits,
  handleValidationErrors
};

