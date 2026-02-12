const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { logsPath } = require('../config/paths');

if (!fs.existsSync(logsPath)) {
  fs.mkdirSync(logsPath, { recursive: true });
}

// Кастомний формат для логів
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    if (stack) {
      return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

// Налаштування транспортів
const transports = [
  // Консольний вивід
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.colorize(), customFormat),
  }),

  // Файл для всіх логів
  new winston.transports.File({
    filename: path.join(logsPath, 'app.log'),
    level: 'info',
    format: customFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),

  // Окремий файл для помилок
  new winston.transports.File({
    filename: path.join(logsPath, 'error.log'),
    level: 'error',
    format: customFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

// Створюємо логер
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  transports,
  exitOnError: false,
});

// Додаємо метод для логування HTTP запитів
logger.http = (message, meta = {}) => {
  logger.info(message, { type: 'HTTP', ...meta });
};

// Додаємо метод для логування операцій з базою даних
logger.db = (message, meta = {}) => {
  logger.info(message, { type: 'DATABASE', ...meta });
};

// Додаємо метод для логування Telegram операцій
logger.telegram = (message, meta = {}) => {
  logger.info(message, { type: 'TELEGRAM', ...meta });
};

// Додаємо метод для логування аутентифікації
logger.auth = (message, meta = {}) => {
  logger.info(message, { type: 'AUTH', ...meta });
};

// Додаємо метод для логування WebSocket операцій
logger.websocket = (message, meta = {}) => {
  logger.info(message, { type: 'WEBSOCKET', ...meta });
};

module.exports = logger;
