const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

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

module.exports = {
  securityHeaders,
  sanitizeData
};

