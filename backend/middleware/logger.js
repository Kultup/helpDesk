const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { logsPath } = require('../config/paths');

const ensureLogsDir = async () => {
  try {
    await fs.access(logsPath);
  } catch {
    await fs.mkdir(logsPath, { recursive: true });
  }
};

// Функція для отримання локальної дати у форматі YYYY-MM-DD
const getLocalDateString = () => {
  const now = new Date();
  // Отримуємо локальну дату з урахуванням часового поясу
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Функція для логування дій користувачів
const logAction = action => {
  return (req, res, next) => {
    const originalSend = res.send;

    res.send = async function (data) {
      // Логуємо тільки успішні дії
      if (res.statusCode < 400 && req.user) {
        const logEntry = {
          timestamp: new Date().toISOString(),
          action: action,
          userId: req.user.id,
          userEmail: req.user.email,
          userRole: req.user.role,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          responseTime: Date.now() - req.startTime,
        };

        logger.info(`📝 Action: ${action} by ${req.user.email} (${req.user.role})`);

        try {
          await ensureLogsDir();
          const auditFile = path.join(logsPath, `audit-${getLocalDateString()}.log`);
          await fs.appendFile(auditFile, JSON.stringify(logEntry) + '\n');
        } catch (error) {
          logger.error('Помилка запису audit log:', error);
        }
      }

      originalSend.call(this, data);
    };

    next();
  };
};

module.exports = {
  logAction,
};
