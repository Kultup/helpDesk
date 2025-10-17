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
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    };

    // Перехоплюємо console методи
    console.log = (...args) => {
      this.originalConsole.log(...args);
      this.broadcastLog('info', args.join(' '), 'backend');
    };

    console.error = (...args) => {
      this.originalConsole.error(...args);
      this.broadcastLog('error', args.join(' '), 'backend');
    };

    console.warn = (...args) => {
      this.originalConsole.warn(...args);
      this.broadcastLog('warn', args.join(' '), 'backend');
    };

    console.info = (...args) => {
      this.originalConsole.info(...args);
      this.broadcastLog('info', args.join(' '), 'backend');
    };

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
    if (!this.io) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      source,
      details
    };

    // Додаємо до буфера
    this.logBuffer.push(logEntry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
    }

    // Відправляємо всім підключеним клієнтам
    this.io.emit('log', logEntry);
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
      console[method] = this.originalConsole[method];
    });
  }
}

// Створюємо singleton instance
const logWebSocketService = new LogWebSocketService();

module.exports = logWebSocketService;