const redisClient = require('../config/redis');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.isEnabled = false;
    this.defaultTTL = 3600; // 1 година за замовчуванням
  }

  async initialize() {
    try {
      await redisClient.connect();
      this.isEnabled = redisClient.isConnected;

      if (this.isEnabled) {
        logger.info('✅ CacheService ініціалізовано');
      } else {
        logger.warn('⚠️ CacheService працює без Redis (кешування вимкнено)');
      }
    } catch (error) {
      logger.error('❌ Помилка ініціалізації CacheService:', error);
      this.isEnabled = false;
    }
  }

  /**
   * Отримати значення з кешу
   * @param {string} key - Ключ кешу
   * @returns {Promise<any|null>} - Значення або null
   */
  async get(key) {
    if (!this.isEnabled || !redisClient.client) {
      return null;
    }

    try {
      const value = await redisClient.client.get(key);

      if (value === null) {
        return null;
      }

      // Спробуємо розпарсити JSON
      try {
        return JSON.parse(value);
      } catch {
        // Якщо не JSON, повертаємо як є
        return value;
      }
    } catch (error) {
      logger.error(`❌ Помилка отримання з кешу (ключ: ${key}):`, error);
      return null;
    }
  }

  /**
   * Зберегти значення в кеш
   * @param {string} key - Ключ кешу
   * @param {any} value - Значення для збереження
   * @param {number} ttl - Час життя в секундах (за замовчуванням defaultTTL)
   * @returns {Promise<boolean>} - true якщо успішно
   */
  async set(key, value, ttl = this.defaultTTL) {
    if (!this.isEnabled || !redisClient.client) {
      return false;
    }

    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

      if (ttl > 0) {
        await redisClient.client.setex(key, ttl, stringValue);
      } else {
        await redisClient.client.set(key, stringValue);
      }

      return true;
    } catch (error) {
      logger.error(`❌ Помилка збереження в кеш (ключ: ${key}):`, error);
      return false;
    }
  }

  /**
   * Видалити значення з кешу
   * @param {string} key - Ключ для видалення
   * @returns {Promise<boolean>} - true якщо успішно
   */
  async delete(key) {
    if (!this.isEnabled || !redisClient.client) {
      return false;
    }

    try {
      const result = await redisClient.client.del(key);
      return result > 0;
    } catch (error) {
      logger.error(`❌ Помилка видалення з кешу (ключ: ${key}):`, error);
      return false;
    }
  }

  /**
   * Видалити кілька ключів за паттерном
   * @param {string} pattern - Паттерн для пошуку (наприклад, 'user:*')
   * @returns {Promise<number>} - Кількість видалених ключів
   */
  deleteByPattern(pattern) {
    if (!this.isEnabled || !redisClient.client) {
      return 0;
    }

    try {
      const stream = redisClient.client.scanStream({
        match: pattern,
        count: 100,
      });

      const keysToDelete = [];

      return new Promise((resolve, reject) => {
        stream.on('data', keys => {
          keysToDelete.push(...keys);
        });

        stream.on('end', async () => {
          if (keysToDelete.length > 0) {
            try {
              // Видаляємо ключі батчами по 100, щоб уникнути переповнення
              let deletedCount = 0;
              for (let i = 0; i < keysToDelete.length; i += 100) {
                const batch = keysToDelete.slice(i, i + 100);
                const count = await redisClient.client.del(...batch);
                deletedCount += count;
              }
              resolve(deletedCount);
            } catch (error) {
              logger.error(`❌ Помилка видалення ключів за паттерном (${pattern}):`, error);
              resolve(0);
            }
          } else {
            resolve(0);
          }
        });

        stream.on('error', error => {
          logger.error(`❌ Помилка сканування за паттерном (${pattern}):`, error);
          reject(error);
        });
      });
    } catch (error) {
      logger.error(`❌ Помилка видалення за паттерном (${pattern}):`, error);
      return 0;
    }
  }

  /**
   * Отримати значення з кешу або виконати функцію та зберегти результат
   * @param {string} key - Ключ кешу
   * @param {Function} fetchFn - Функція для отримання даних, якщо кеш порожній
   * @param {number} ttl - Час життя в секундах
   * @returns {Promise<any>} - Значення з кешу або результат fetchFn
   */
  async getOrSet(key, fetchFn, ttl = this.defaultTTL) {
    const cached = await this.get(key);

    if (cached !== null) {
      return cached;
    }

    // Якщо немає в кеші, виконуємо функцію
    const value = await fetchFn();

    // Зберігаємо результат в кеш
    await this.set(key, value, ttl);

    return value;
  }

  /**
   * Збільшити значення числового ключа
   * @param {string} key - Ключ
   * @param {number} increment - На скільки збільшити (за замовчуванням 1)
   * @returns {Promise<number>} - Нове значення
   */
  async increment(key, increment = 1) {
    if (!this.isEnabled || !redisClient.client) {
      return 0;
    }

    try {
      return await redisClient.client.incrby(key, increment);
    } catch (error) {
      logger.error(`❌ Помилка інкременту (ключ: ${key}):`, error);
      return 0;
    }
  }

  /**
   * Зменшити значення числового ключа
   * @param {string} key - Ключ
   * @param {number} decrement - На скільки зменшити (за замовчуванням 1)
   * @returns {Promise<number>} - Нове значення
   */
  async decrement(key, decrement = 1) {
    if (!this.isEnabled || !redisClient.client) {
      return 0;
    }

    try {
      return await redisClient.client.decrby(key, decrement);
    } catch (error) {
      logger.error(`❌ Помилка декременту (ключ: ${key}):`, error);
      return 0;
    }
  }

  /**
   * Встановити час життя для ключа
   * @param {string} key - Ключ
   * @param {number} ttl - Час життя в секундах
   * @returns {Promise<boolean>} - true якщо успішно
   */
  async expire(key, ttl) {
    if (!this.isEnabled || !redisClient.client) {
      return false;
    }

    try {
      const result = await redisClient.client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      logger.error(`❌ Помилка встановлення TTL (ключ: ${key}):`, error);
      return false;
    }
  }

  /**
   * Перевірити існування ключа
   * @param {string} key - Ключ
   * @returns {Promise<boolean>} - true якщо ключ існує
   */
  async exists(key) {
    if (!this.isEnabled || !redisClient.client) {
      return false;
    }

    try {
      const result = await redisClient.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`❌ Помилка перевірки існування (ключ: ${key}):`, error);
      return false;
    }
  }

  /**
   * Отримати всі ключі за паттерном
   * @param {string} pattern - Паттерн (наприклад, 'user:*')
   * @returns {Promise<string[]>} - Масив ключів
   */
  keys(pattern) {
    if (!this.isEnabled || !redisClient.client) {
      return [];
    }

    try {
      const keys = [];
      const stream = redisClient.client.scanStream({
        match: pattern,
        count: 100,
      });

      return new Promise((resolve, reject) => {
        stream.on('data', resultKeys => {
          keys.push(...resultKeys);
        });

        stream.on('end', () => {
          resolve(keys);
        });

        stream.on('error', error => {
          reject(error);
        });
      });
    } catch (error) {
      logger.error(`❌ Помилка отримання ключів (паттерн: ${pattern}):`, error);
      return [];
    }
  }

  /**
   * Очистити весь кеш (використовувати з обережністю!)
   * @returns {Promise<boolean>} - true якщо успішно
   */
  async flush() {
    if (!this.isEnabled || !redisClient.client) {
      return false;
    }

    try {
      await redisClient.client.flushdb();
      logger.warn('⚠️ Весь кеш очищено');
      return true;
    } catch (error) {
      logger.error('❌ Помилка очищення кешу:', error);
      return false;
    }
  }
}

// Створення singleton екземпляра
const cacheService = new CacheService();

module.exports = cacheService;
