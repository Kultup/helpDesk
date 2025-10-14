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

// Middleware для детального логування HTTP запитів
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  
  // Логуємо початок запиту
  logger.info(`🌐 ${timestamp} - ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  
  // Перехоплюємо відповідь для логування результату
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '🔴' : '🟢';
    
    logger.info(`${statusColor} ${res.statusCode} - ${req.method} ${req.originalUrl} - ${duration}ms`);
    
    // Логуємо помилки детальніше
    if (res.statusCode >= 400) {
      logger.error(`❌ Помилка: ${data}`);
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

// Middleware для логування дій користувачів у файл
const auditLogger = (action, details = {}) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = async function(data) {
      // Логуємо тільки успішні дії
      if (res.statusCode < 400 && req.user) {
        const logEntry = {
          timestamp: new Date().toISOString(),
          userId: req.user._id,
          userEmail: req.user.email,
          action: action,
          details: {
            ...details,
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            statusCode: res.statusCode
          },
          resourceId: req.params.id || null,
          body: req.method !== 'GET' ? req.body : null
        };
        
        try {
          await ensureLogsDir();
          const logFile = path.join(logsDir, `audit-${new Date().toISOString().split('T')[0]}.log`);
          await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
        } catch (error) {
          logger.error('Помилка запису в audit log:', error);
        }
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

// Middleware для логування помилок
const errorLogger = (err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const errorLog = {
    timestamp,
    error: {
      message: err.message,
      stack: err.stack,
      name: err.name
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user ? req.user._id : null,
      body: req.body
    }
  };
  
  logger.error(`💥 ${timestamp} - Помилка:`, err.message);
  logger.error(err.stack);
  
  // Записуємо помилку у файл
  (async () => {
    try {
      await ensureLogsDir();
      const errorFile = path.join(logsDir, `errors-${new Date().toISOString().split('T')[0]}.log`);
      await fs.appendFile(errorFile, JSON.stringify(errorLog) + '\n');
    } catch (writeError) {
      logger.error('Помилка запису error log:', writeError);
    }
  })();
  
  // Передаємо помилку далі
  next(err);
};

// Middleware для логування безпекових подій
const securityLogger = (event, severity = 'medium') => {
  return async (req, res, next) => {
    const securityLog = {
      timestamp: new Date().toISOString(),
      event: event,
      severity: severity,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user ? req.user._id : null,
      userEmail: req.user ? req.user.email : null,
      url: req.originalUrl,
      method: req.method
    };
    
    logger.warn(`🔒 Безпекова подія: ${event} - IP: ${req.ip}`);
    
    try {
      await ensureLogsDir();
      const securityFile = path.join(logsDir, `security-${new Date().toISOString().split('T')[0]}.log`);
      await fs.appendFile(securityFile, JSON.stringify(securityLog) + '\n');
    } catch (error) {
      logger.error('Помилка запису security log:', error);
    }
    
    next();
  };
};

// Middleware для логування Telegram активності
const telegramLogger = (action) => {
  return async (req, res, next) => {
    const telegramLog = {
      timestamp: new Date().toISOString(),
      action: action,
      telegramUserId: req.body.from ? req.body.from.id : null,
      telegramUsername: req.body.from ? req.body.from.username : null,
      chatId: req.body.chat ? req.body.chat.id : null,
      messageText: req.body.text || null,
      callbackData: req.body.callback_query ? req.body.callback_query.data : null
    };
    
    logger.info(`📱 Telegram: ${action} - User: ${telegramLog.telegramUsername || telegramLog.telegramUserId}`);
    
    try {
      await ensureLogsDir();
      const telegramFile = path.join(logsDir, `telegram-${new Date().toISOString().split('T')[0]}.log`);
      await fs.appendFile(telegramFile, JSON.stringify(telegramLog) + '\n');
    } catch (error) {
      logger.error('Помилка запису telegram log:', error);
    }
    
    next();
  };
};

module.exports = {
  requestLogger,
  auditLogger,
  errorLogger,
  securityLogger,
  telegramLogger
};