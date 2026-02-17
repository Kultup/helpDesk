const cors = require('cors');
const logger = require('../utils/logger');

// Функція для парсингу origins з рядка (підтримка кількох через кому)
const parseOrigins = originString => {
  if (!originString) {
    return [];
  }
  return originString
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
};

// Список дозволених доменів (керується змінними середовища)
// Підтримує кілька origins через кому в CORS_ORIGIN
// Додаткові завжди дозволені origins (локальні мережі та production домени)
const additionalAllowedOrigins = ['http://192.168.100.15:3000', 'https://helpdesk.krainamriy.fun'];

const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...parseOrigins(process.env.CORS_ORIGIN),
  ...additionalAllowedOrigins,
].filter(Boolean);

// Логування налаштованих origins при старті
if (allowedOrigins.length > 0) {
  logger.info(`🌐 Дозволені CORS origins: ${allowedOrigins.join(', ')}`);
} else {
  logger.warn('⚠️ CORS origins не налаштовані. Перевірте FRONTEND_URL та CORS_ORIGIN в .env');
}

// Функція для перевірки, чи origin дозволений
const isOriginAllowed = origin => {
  if (!origin) {
    return true;
  } // Дозволяємо запити без origin

  // Дозволяємо localhost для локальної розробки навіть у production
  const isLocalhost =
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin.includes('localhost');

  if (isLocalhost) {
    return true;
  }

  // Точна відповідність
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Перевірка на піддомени (якщо origin закінчується на дозволений домен)
  // Наприклад, якщо дозволено example.com, то піддомен.example.com теж дозволено
  for (const allowedOrigin of allowedOrigins) {
    try {
      const allowedUrl = new URL(allowedOrigin);
      const originUrl = new URL(origin);

      // Якщо домени співпадають або origin є піддоменом
      if (
        originUrl.hostname === allowedUrl.hostname ||
        originUrl.hostname.endsWith('.' + allowedUrl.hostname)
      ) {
        return true;
      }
    } catch (e) {
      // Якщо не вдалося розпарсити URL, використовуємо просту перевірку
      if (origin.includes(allowedOrigin) || allowedOrigin.includes(origin)) {
        return true;
      }
    }
  }

  return false;
};

// Налаштування CORS
const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      logger.warn(`🚫 CORS заблокував запит з домену: ${origin}`);
      logger.warn(`   Дозволені origins: ${allowedOrigins.join(', ') || 'не налаштовані'}`);
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
    'X-File-Name',
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'X-Current-Page'],
  maxAge: 86400, // 24 години
  // Додаткові налаштування для мобільних пристроїв
  optionsSuccessStatus: 200, // Для старих браузерів
};

// Middleware для розробки: використовує allowedOrigins якщо вони задані, інакше дозволяє будь-яке походження
const developmentCors = cors({
  origin: (origin, callback) => {
    // Дозволяємо запити без origin (наприклад, мобільні додатки, Postman)
    if (!origin) {
      return callback(null, true);
    }

    // У development режимі дозволяємо localhost з будь-яким портом
    if (process.env.NODE_ENV === 'development') {
      const isLocalhost =
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.includes('localhost');

      if (isLocalhost) {
        return callback(null, true);
      }
    }

    // Перевіряємо дозволені origins
    if (allowedOrigins.length === 0) {
      logger.info(`[DEV] CORS: дозволено будь-який origin (origins не налаштовані)`);
      return callback(null, true);
    }

    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }

    logger.warn(`🚫 [DEV] CORS заблокував запит з домену: ${origin}`);
    logger.warn(`   Дозволені origins: ${allowedOrigins.join(', ')}`);
    callback(new Error('Заборонено CORS політикою'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: '*',
});

// Middleware для продакшну
const productionCors = cors(corsOptions);

// Експортуємо відповідний middleware залежно від середовища
module.exports = process.env.NODE_ENV === 'production' ? productionCors : developmentCors;
