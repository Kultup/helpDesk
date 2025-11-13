const logger = require('../utils/logger');

class ErrorNotificationService {
  constructor() {
    this.io = null;
    this.errorBuffer = [];
    this.maxBufferSize = 100;
  }

  initialize(io) {
    this.io = io;
    logger.info('✅ Error Notification Service ініціалізовано');
  }

  /**
   * Форматує помилку в зрозумілий текст для користувача
   */
  formatErrorForUser(error, req = null) {
    let userMessage = 'Сталася помилка';
    let details = '';

    // Обробка різних типів помилок
    if (error.name === 'ValidationError') {
      userMessage = 'Помилка валідації даних';
      const errors = Object.values(error.errors || {});
      if (errors.length > 0) {
        details = errors.map(e => e.message || e).join(', ');
      }
    } else if (error.name === 'CastError') {
      userMessage = 'Невірний формат даних';
      details = error.message || 'Перевірте правильність введених даних';
    } else if (error.name === 'MongoError' || error.code === 11000) {
      userMessage = 'Помилка бази даних';
      details = 'Запис з такими даними вже існує';
    } else if (error.name === 'JsonWebTokenError') {
      userMessage = 'Помилка автентифікації';
      details = 'Невірний токен доступу';
    } else if (error.name === 'TokenExpiredError') {
      userMessage = 'Сесія закінчилася';
      details = 'Будь ласка, увійдіть знову';
    } else if (error.statusCode === 400) {
      userMessage = 'Невірний запит';
      details = error.message || 'Перевірте правильність введених даних';
    } else if (error.statusCode === 401) {
      userMessage = 'Помилка авторизації';
      details = error.message || 'Необхідно увійти в систему';
    } else if (error.statusCode === 403) {
      userMessage = 'Доступ заборонено';
      details = error.message || 'У вас немає прав для виконання цієї дії';
    } else if (error.statusCode === 404) {
      userMessage = 'Ресурс не знайдено';
      details = error.message || 'Запитуваний ресурс не існує';
    } else if (error.statusCode === 409) {
      userMessage = 'Конфлікт даних';
      details = error.message || 'Дані вже існують або конфліктують';
    } else if (error.statusCode === 422) {
      userMessage = 'Помилка обробки даних';
      details = error.message || 'Неможливо обробити дані';
    } else if (error.statusCode === 429) {
      userMessage = 'Забагато запитів';
      details = 'Спробуйте пізніше';
    } else if (error.statusCode >= 500) {
      userMessage = 'Помилка сервера';
      details = process.env.NODE_ENV === 'development' 
        ? (error.message || 'Внутрішня помилка сервера')
        : 'Спробуйте пізніше або зверніться до адміністратора';
    } else if (error.message) {
      userMessage = error.message;
    }

    // Додаємо інформацію про запит, якщо доступна
    if (req) {
      if (req.method && req.url) {
        details += details ? ` | ${req.method} ${req.url}` : `${req.method} ${req.url}`;
      }
    }

    return {
      title: userMessage,
      message: details || userMessage,
      type: this.getErrorType(error.statusCode || 500),
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        statusCode: error.statusCode || 500,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
  }

  /**
   * Визначає тип помилки для відображення
   */
  getErrorType(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warning';
    return 'info';
  }

  /**
   * Відправляє помилку через WebSocket
   */
  notifyError(error, req = null) {
    if (!this.io) {
      logger.warn('ErrorNotificationService: WebSocket не ініціалізовано');
      return;
    }

    const formattedError = this.formatErrorForUser(error, req);

    // Додаємо до буфера
    this.errorBuffer.push(formattedError);
    if (this.errorBuffer.length > this.maxBufferSize) {
      this.errorBuffer = this.errorBuffer.slice(-this.maxBufferSize);
    }

    // Відправляємо всім підключеним клієнтам
    this.io.emit('error-notification', formattedError);

    logger.info('Error notification sent:', {
      title: formattedError.title,
      type: formattedError.type,
      statusCode: formattedError.error.statusCode
    });
  }

  /**
   * Отримати історію помилок
   */
  getErrorHistory() {
    return this.errorBuffer;
  }

  /**
   * Очистити буфер помилок
   */
  clearErrorBuffer() {
    this.errorBuffer = [];
  }
}

// Створюємо singleton instance
const errorNotificationService = new ErrorNotificationService();

module.exports = errorNotificationService;

