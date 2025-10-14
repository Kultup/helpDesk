/**
 * Сервіс для WebSocket сповіщень про запити на реєстрацію
 */

const logger = require('../utils/logger');

class RegistrationWebSocketService {
  constructor() {
    this.io = null;
  }

  /**
   * Ініціалізація сервісу з Socket.IO інстансом
   * @param {Object} io - Socket.IO сервер інстанс
   */
  initialize(io) {
    this.io = io;
    logger.websocket('🔌 RegistrationWebSocketService ініціалізовано');
  }

  /**
   * Відправка сповіщення про новий запит на реєстрацію
   * @param {Object} user - Об'єкт користувача
   */
  notifyNewRegistrationRequest(user) {
    if (!this.io) {
      logger.warn('⚠️ WebSocket не ініціалізовано');
      return;
    }

    const notification = {
      type: 'new_registration_request',
      data: {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        department: user.department,
        position: user.position?.name || 'Не вказано',
        city: user.city?.name || 'Не вказано',
        createdAt: user.createdAt,
        timestamp: new Date().toISOString()
      },
      message: `Новий запит на реєстрацію від ${user.firstName} ${user.lastName}`
    };

    // Відправляємо сповіщення тільки адміністраторам
    this.io.to('admin-room').emit('registration-notification', notification);
    
    logger.websocket(`📢 Відправлено WebSocket сповіщення про нову реєстрацію: ${user.email}`);
  }

  /**
   * Відправка сповіщення про зміну статусу реєстрації
   * @param {Object} user - Об'єкт користувача
   * @param {string} oldStatus - Попередній статус
   * @param {string} newStatus - Новий статус
   */
  notifyRegistrationStatusChange(user, oldStatus, newStatus) {
    if (!this.io) {
      logger.warn('⚠️ WebSocket не ініціалізовано');
      return;
    }

    const notification = {
      type: 'registration_status_change',
      data: {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        oldStatus,
        newStatus,
        timestamp: new Date().toISOString()
      },
      message: `Статус реєстрації ${user.firstName} ${user.lastName} змінено з "${oldStatus}" на "${newStatus}"`
    };

    // Відправляємо сповіщення тільки адміністраторам
    this.io.to('admin-room').emit('registration-notification', notification);
    
    logger.websocket(`📢 Відправлено WebSocket сповіщення про зміну статусу реєстрації: ${user.email}`);
  }

  /**
   * Відправка оновленої кількості запитів на реєстрацію
   * @param {number} count - Кількість запитів
   */
  notifyRegistrationCountUpdate(count) {
    if (!this.io) {
      logger.warn('⚠️ WebSocket не ініціалізовано');
      return;
    }

    const notification = {
      type: 'registration_count_update',
      data: {
        count,
        timestamp: new Date().toISOString()
      }
    };

    // Відправляємо оновлення кількості тільки адміністраторам
    this.io.to('admin-room').emit('registration-count-update', notification);
    
    logger.websocket(`📊 Відправлено WebSocket оновлення кількості реєстрацій: ${count}`);
  }

  /**
   * Перевірка чи ініціалізовано WebSocket
   * @returns {boolean}
   */
  isInitialized() {
    return this.io !== null;
  }
}

// Експортуємо синглтон
module.exports = new RegistrationWebSocketService();