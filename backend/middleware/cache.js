const cacheService = require('../services/cacheService');
const crypto = require('crypto');

/**
 * Middleware для кешування GET запитів
 * @param {number} ttl - Час життя кешу в секундах (за замовчуванням 300 = 5 хвилин)
 * @param {Function} keyGenerator - Функція для генерації ключа кешу (опціонально)
 * @returns {Function} Express middleware
 */
const cacheMiddleware = (ttl = 300, keyGenerator = null) => {
  return async (req, res, next) => {
    // Кешуємо тільки GET запити
    if (req.method !== 'GET') {
      return next();
    }

    // Генеруємо ключ кешу
    const cacheKey = keyGenerator ? keyGenerator(req) : generateCacheKey(req);

    // Спробуємо отримати з кешу
    const cached = await cacheService.get(cacheKey);

    if (cached !== null) {
      // Встановлюємо заголовок для індикації кешу
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    // Зберігаємо оригінальний метод res.json
    const originalJson = res.json.bind(res);

    // Перевизначаємо res.json для збереження відповіді в кеш
    res.json = function (data) {
      // Зберігаємо в кеш тільки успішні відповіді
      if (res.statusCode === 200) {
        cacheService.set(cacheKey, data, ttl).catch(err => {
          console.error('Помилка збереження в кеш:', err);
        });
      }

      res.set('X-Cache', 'MISS');
      return originalJson(data);
    };

    next();
  };
};

/**
 * Генерація ключа кешу на основі запиту
 * @param {Object} req - Express request object
 * @returns {string} Ключ кешу
 */
const generateCacheKey = req => {
  const keyData = {
    path: req.path,
    query: req.query,
    user: req.user ? req.user._id : null,
  };

  const keyString = JSON.stringify(keyData);
  const hash = crypto.createHash('md5').update(keyString).digest('hex');

  return `cache:${req.method}:${req.path}:${hash}`;
};

/**
 * Middleware для інвалідації кешу після змін
 * @param {string|Function} pattern - Паттерн ключів для видалення або функція для генерації
 * @returns {Function} Express middleware
 */
const invalidateCache = pattern => {
  return async (req, res, next) => {
    // Перевизначаємо res.json для перехоплення статусу
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      // Після успішного виконання інвалідуємо кеш
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const cachePattern = typeof pattern === 'function' ? pattern(req) : pattern;

        if (cachePattern) {
          // Видаляємо конкретний ключ або за паттерном
          if (cachePattern.includes('*')) {
            cacheService.deleteByPattern(cachePattern).catch(err => {
              console.error('Помилка інвалідації кешу за паттерном:', err);
            });
          } else {
            cacheService.delete(cachePattern).catch(err => {
              console.error('Помилка інвалідації кешу:', err);
            });
          }
        }
      }

      return originalJson(data);
    };

    await next();
  };
};

/**
 * Генератор ключів для різних типів ресурсів
 */
const cacheKeyGenerators = {
  // Ключ для категорій
  categories: req => {
    const includeInactive = req.query.includeInactive === 'true';
    return `cache:categories:${includeInactive}`;
  },

  // Ключ для конкретної категорії
  category: req => {
    return `cache:category:${req.params.id}`;
  },

  // Ключ для користувачів з пагінацією
  users: req => {
    const { page = 1, limit = 10, ...filters } = req.query;
    const filtersHash = crypto.createHash('md5').update(JSON.stringify(filters)).digest('hex');
    return `cache:users:${page}:${limit}:${filtersHash}`;
  },

  // Ключ для конкретного користувача
  user: req => {
    return `cache:user:${req.params.id}`;
  },

  // Ключ для тікетів з фільтрами
  tickets: req => {
    const { page = 1, limit = 10, ...filters } = req.query;
    const filtersHash = crypto.createHash('md5').update(JSON.stringify(filters)).digest('hex');
    return `cache:tickets:${page}:${limit}:${filtersHash}`;
  },

  // Ключ для конкретного тікету
  ticket: req => {
    return `cache:ticket:${req.params.id}`;
  },

  // Ключ для статистики
  stats: req => {
    const type = req.params.type || 'general';
    return `cache:stats:${type}`;
  },
};

module.exports = {
  cacheMiddleware,
  invalidateCache,
  cacheKeyGenerators,
  generateCacheKey,
};
