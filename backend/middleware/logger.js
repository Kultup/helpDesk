const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

// Створюємо папку для логів якщо її немає
const logsDir = path.join(__dirname, '../logs');

const ensureLogsDir = async () => {
  try {
    await fs.access(logsDir);
  } catch {
    await fs.mkdir(logsDir, { recursive: true });
  }
};

// Функція для логування дій користувачів
const logAction = (action) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = async function(data) {
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
          responseTime: Date.now() - req.startTime
        };

        logger.info(`📝 Action: ${action} by ${req.user.email} (${req.user.role})`);

        try {
          await ensureLogsDir();
          const auditFile = path.join(logsDir, `audit-${new Date().toISOString().split('T')[0]}.log`);
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
  logAction
};