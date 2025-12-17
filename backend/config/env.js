const Joi = require('joi');

// Схема валідації environment variables
const envSchema = Joi.object({
  // Node Environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  // Server
  PORT: Joi.number().default(5000),
  FRONTEND_URL: Joi.string().uri().required(),
  CORS_ORIGIN: Joi.string().uri().optional(),

  // MongoDB
  MONGODB_URI: Joi.string().required(),

  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRE: Joi.string().default('24h'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRE: Joi.string().default('7d'),

  // Redis (опціонально)
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_DB: Joi.number().default(0),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  // Telegram Bot
  TELEGRAM_BOT_TOKEN: Joi.string().allow('').optional(),
  TELEGRAM_CHAT_ID: Joi.string().allow('').optional(),


  // File Upload
  UPLOAD_DIR: Joi.string().default('./uploads'),
  MAX_FILE_SIZE: Joi.number().default(10485760), // 10MB

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000), // 15 хвилин
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
  LOG_DIR: Joi.string().default('./logs'),

}).unknown();

/**
 * Валідація environment variables
 * Викидає помилку при старті, якщо обов'язкові змінні відсутні або невалідні
 */
const validateEnv = () => {
  // Обробка порожніх значень для числових опціональних полів
  const cleanedEnv = { ...process.env };
  if (cleanedEnv.ZABBIX_POLL_INTERVAL === '') {
    delete cleanedEnv.ZABBIX_POLL_INTERVAL;
  }
  
  const { error, value } = envSchema.validate(cleanedEnv, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errorMessages = error.details
      .map((detail) => `${detail.path.join('.')}: ${detail.message}`)
      .join('\n');

    throw new Error(
      `❌ Environment variables validation failed:\n${errorMessages}\n\n` +
        'Please check your .env file and ensure all required variables are set correctly.'
    );
  }

  // Встановлюємо валідовані значення назад в process.env
  Object.keys(value).forEach((key) => {
    process.env[key] = value[key];
  });

  // Додаткова перевірка для production
  if (process.env.NODE_ENV === 'production') {
    const requiredInProduction = [
      'MONGODB_URI',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'FRONTEND_URL',
    ];

    const missing = requiredInProduction.filter(
      (key) => !process.env[key] || process.env[key] === ''
    );

    if (missing.length > 0) {
      throw new Error(
        `❌ Missing required environment variables for production:\n${missing.join(', ')}`
      );
    }

    // Перевірка безпеки для production
    if (process.env.JWT_SECRET.length < 32) {
      throw new Error(
        '❌ JWT_SECRET must be at least 32 characters long in production'
      );
    }

    if (process.env.JWT_REFRESH_SECRET.length < 32) {
      throw new Error(
        '❌ JWT_REFRESH_SECRET must be at least 32 characters long in production'
      );
    }
  }

  console.log('✅ Environment variables validated successfully');
  return value;
};

module.exports = { validateEnv };

