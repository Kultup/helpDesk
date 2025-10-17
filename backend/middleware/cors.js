const cors = require('cors');
const logger = require('../utils/logger');

// Список дозволених доменів (керується змінними середовища)
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN
].filter(Boolean);

// Налаштування CORS
const corsOptions = {
  origin: (origin, callback) => {
    // Дозволяємо запити без origin (наприклад, мобільні додатки)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`🚫 CORS заблокував запит з домену: ${origin}`);
      callback(new Error('Заборонено CORS політикою'));
    }
  },
  credentials: true, // Дозволяємо cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-File-Name'
  ],
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Current-Page'
  ],
  maxAge: 86400 // 24 години
};

// Middleware для розробки: використовує allowedOrigins якщо вони задані, інакше дозволяє будь-яке походження
const developmentCors = cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    logger.warn(`🚫 [DEV] CORS заблокував запит з домену: ${origin}`);
    callback(new Error('Заборонено CORS політикою'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: '*'
});

// Middleware для продакшну
const productionCors = cors(corsOptions);

// Експортуємо відповідний middleware залежно від середовища
module.exports = process.env.NODE_ENV === 'production' ? productionCors : developmentCors;