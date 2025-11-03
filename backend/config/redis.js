const Redis = require('ioredis');
const logger = require('../utils/logger');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0,
        retryStrategy: (times) => {
          // У development режимі не намагаємося переподключатися якщо Redis недоступний
          if (process.env.NODE_ENV === 'development' && times > 3) {
            return null; // Зупиняємо спроби переподключення
          }
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: false,
        connectTimeout: 5000, // Зменшено з 10 до 5 секунд
        lazyConnect: false,
        keepAlive: 30000,
        family: 4, // IPv4
        ...(process.env.REDIS_TLS === 'true' && {
          tls: {
            rejectUnauthorized: false
          }
        })
      };

      // Якщо є REDIS_URL, використовуємо його
      if (process.env.REDIS_URL) {
        this.client = new Redis(process.env.REDIS_URL, {
          retryStrategy: redisConfig.retryStrategy,
          maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
          enableReadyCheck: redisConfig.enableReadyCheck,
          enableOfflineQueue: redisConfig.enableOfflineQueue,
          connectTimeout: redisConfig.connectTimeout,
          keepAlive: redisConfig.keepAlive
        });
      } else {
        this.client = new Redis(redisConfig);
      }

      // Обробка подій підключення
      this.client.on('connect', () => {
        logger.info('🔄 Redis: Підключення...');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        logger.db('✅ Redis підключено успішно', {
          host: redisConfig.host,
          port: redisConfig.port,
          db: redisConfig.db
        });
      });

      this.client.on('error', (error) => {
        this.isConnected = false;
        logger.error('❌ Redis помилка:', error.message);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        logger.warn('⚠️ Redis з\'єднання закрито');
      });

      this.client.on('reconnecting', (delay) => {
        logger.info(`🔄 Redis переподключення через ${delay}ms...`);
      });

      // Очікуємо підключення з таймаутом
      try {
        await Promise.race([
          this.client.ping(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
          )
        ]);
      } catch (pingError) {
        // Якщо ping не вдався, закриваємо з'єднання
        if (this.client) {
          this.client.disconnect();
          this.client = null;
        }
        throw pingError;
      }
      
      return this.client;
    } catch (error) {
      this.isConnected = false;
      
      // У режимі розробки не кидаємо помилку, щоб додаток міг працювати без Redis
      if (process.env.NODE_ENV === 'production') {
        logger.error('❌ Не вдалося підключитися до Redis:', error.message);
        throw error;
      } else {
        logger.warn('⚠️ Redis недоступний, продовжуємо роботу без кешування (режим розробки)');
        // Вимікаємо клієнт, щоб не намагатися переподключатися
        if (this.client) {
          this.client.disconnect();
          this.client = null;
        }
        return null;
      }
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
        this.isConnected = false;
        logger.info('✅ Redis відключено успішно');
      }
    } catch (error) {
      logger.error('❌ Помилка відключення від Redis:', error);
      throw error;
    }
  }

  getClient() {
    return this.client;
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      status: this.client?.status || 'disconnected'
    };
  }

  async healthCheck() {
    try {
      if (!this.client || !this.isConnected) {
        return { status: 'disconnected', message: 'Redis not connected' };
      }

      const result = await this.client.ping();
      
      return {
        status: result === 'PONG' ? 'healthy' : 'unhealthy',
        message: result === 'PONG' ? 'Redis connection is healthy' : 'Redis ping failed',
        details: this.getConnectionStatus()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Redis health check failed',
        error: error.message
      };
    }
  }
}

// Створення singleton екземпляра
const redisClient = new RedisClient();

module.exports = redisClient;

