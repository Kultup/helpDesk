const logger = require('../utils/logger');

class CityWebSocketService {
  constructor() {
    this.io = null;
  }

  initialize(io) {
    this.io = io;
    logger.info('🏙️ CityWebSocketService ініціалізовано');
  }

  // Сповіщення про створення міста
  notifyCityCreated(cityData) {
    if (!this.io) {
      logger.warn('⚠️ CityWebSocketService не ініціалізовано');
      return;
    }

    try {
      // Відправляємо сповіщення всім адміністраторам в admin-room
      this.io.to('admin-room').emit('city:created', {
        data: cityData,
        timestamp: new Date().toISOString()
      });

      logger.info(`📢 Відправлено WebSocket сповіщення про створення міста: ${cityData._id || cityData.name}`);
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket сповіщення про створення міста:', error);
    }
  }

  // Сповіщення про оновлення міста
  notifyCityUpdated(cityData) {
    if (!this.io) {
      logger.warn('⚠️ CityWebSocketService не ініціалізовано');
      return;
    }

    try {
      // Відправляємо сповіщення всім адміністраторам в admin-room
      this.io.to('admin-room').emit('city:updated', {
        data: cityData,
        timestamp: new Date().toISOString()
      });

      logger.info(`📢 Відправлено WebSocket сповіщення про оновлення міста: ${cityData._id || cityData.name}`);
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket сповіщення про оновлення міста:', error);
    }
  }

  // Сповіщення про видалення міста
  notifyCityDeleted(cityId) {
    if (!this.io) {
      logger.warn('⚠️ CityWebSocketService не ініціалізовано');
      return;
    }

    try {
      // Відправляємо сповіщення всім адміністраторам в admin-room
      this.io.to('admin-room').emit('city:deleted', {
        data: { _id: cityId },
        timestamp: new Date().toISOString()
      });

      logger.info(`📢 Відправлено WebSocket сповіщення про видалення міста: ${cityId}`);
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket сповіщення про видалення міста:', error);
    }
  }
}

module.exports = new CityWebSocketService();

