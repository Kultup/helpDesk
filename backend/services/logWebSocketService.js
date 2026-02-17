const logger = require('../utils/logger');

class LogWebSocketService {
  constructor() {
    this.io = null;
    this.originalConsole = {};
    this.logBuffer = [];
    this.maxBufferSize = 1000;
  }

  initialize(io) {
    this.io = io;
    this.setupLogInterception();
    logger.info('✅ WebSocket сервіс для логів ініціалізовано');
  }

  setupLogInterception() {
    // Зберігаємо оригінальні методи console
    this.originalConsole = {
      // eslint-disable-next-line no-console
      log: console.log,
      // eslint-disable-next-line no-console
      error: console.error,
      // eslint-disable-next-line no-console
      warn: console.warn,
      // eslint-disable-next-line no-console
      info: console.info,
      // eslint-disable-next-line no-console
      debug: console.debug,
    };

    // Перехоплюємо console методи
    // eslint-disable-next-line no-console
    console.log = (...args) => {
      this.originalConsole.log(...args);
      this.broadcastLog('info', args.join(' '), 'backend');
    };

    // eslint-disable-next-line no-console
    console.error = (...args) => {
      this.originalConsole.error(...args);
      this.broadcastLog('error', args.join(' '), 'backend');
    };

    // eslint-disable-next-line no-console
    console.warn = (...args) => {
      this.originalConsole.warn(...args);
      this.broadcastLog('warn', args.join(' '), 'backend');
    };

    // eslint-disable-next-line no-console
    console.info = (...args) => {
      this.originalConsole.info(...args);
      this.broadcastLog('info', args.join(' '), 'backend');
    };

    // eslint-disable-next-line no-console
    console.debug = (...args) => {
      this.originalConsole.debug(...args);
      this.broadcastLog('debug', args.join(' '), 'backend');
    };

    // Перехоплюємо логи з winston logger
    if (logger && logger.transports) {
      logger.transports.forEach(transport => {
        const originalLog = transport.log;
        transport.log = (info, callback) => {
          // Викликаємо оригінальний метод
          originalLog.call(transport, info, callback);

          // Передаємо лог через WebSocket
          if (info && info.message) {
            this.broadcastLog(info.level || 'info', info.message, 'backend', info);
          }
        };
      });
    }
  }

  broadcastLog(level, message, source, details = null) {
    if (!this.io) {
      return;
    }

    try {
      // Очищаємо details від циклічних посилань та обмежуємо розмір
      let sanitizedDetails = null;
      if (details) {
        try {
          // Використовуємо JSON для видалення циклічних посилань
          sanitizedDetails = JSON.parse(
            JSON.stringify(details, (key, value) => {
              // Пропускаємо функції та undefined
              if (typeof value === 'function' || value === undefined) {
                return null;
              }
              // Обмежуємо глибину вкладеності
              if (typeof value === 'object' && value !== null) {
                // Якщо об'єкт занадто великий, обмежуємо його
                const stringified = JSON.stringify(value);
                if (stringified.length > 10000) {
                  // 10KB обмеження
                  return '[Object too large]';
                }
              }
              return value;
            })
          );
        } catch (error) {
          sanitizedDetails = '[Error serializing details]';
        }
      }

      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message: String(message).substring(0, 1000), // Обмежуємо довжину повідомлення
        source,
        details: sanitizedDetails,
      };

      // Додаємо до буфера
      this.logBuffer.push(logEntry);
      if (this.logBuffer.length > this.maxBufferSize) {
        this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
      }

      // Відправляємо всім підключеним клієнтам
      this.io.emit('log', logEntry);
    } catch (error) {
      // Якщо виникла помилка при серіалізації, логуємо її, але не падаємо
      // eslint-disable-next-line no-console
      console.error('Error broadcasting log:', error.message);
    }
  }

  // Метод для отримання історії логів
  getLogHistory() {
    return this.logBuffer;
  }

  // Метод для очищення буфера логів
  clearLogBuffer() {
    this.logBuffer = [];
  }

  // Метод для відправки логів фронтенду
  broadcastFrontendLog(level, message, details = null) {
    this.broadcastLog(level, message, 'frontend', details);
  }

  // Відновлення оригінальних console методів (для тестування)
  restoreConsole() {
    Object.keys(this.originalConsole).forEach(method => {
      // eslint-disable-next-line no-console
      console[method] = this.originalConsole[method];
    });
  }
}

// Створюємо singleton instance
const logWebSocketService = new LogWebSocketService();

module.exports = logWebSocketService;
