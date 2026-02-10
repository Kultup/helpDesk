const logger = require('../utils/logger');
const redisClient = require('../config/redis');

/**
 * PersistentMap — обгортка над Map із синхронним API та автоматичною синхронізацією з Redis.
 * 
 * Використання:
 * - Замість `new Map()` → `new PersistentMap('prefix:', ttl)`
 * - API ідентичний Map: .get(), .set(), .delete(), .has(), .size
 * - Записи автоматично зберігаються в Redis (fire-and-forget)
 * - При запуску сервера викликати hydrate() для відновлення даних з Redis
 */
class PersistentMap {
    /**
     * @param {string} prefix - Префікс ключів Redis (напр. 'sess:', 'navHist:')
     * @param {number} ttlSeconds - TTL для записів у Redis (секунди)
     * @param {string} name - Назва для логування
     */
    constructor(prefix, ttlSeconds, name = '') {
        this._map = new Map();
        this._prefix = prefix;
        this._ttl = ttlSeconds;
        this._name = name || prefix;
    }

    /**
     * Перевірити чи Redis доступний
     */
    get _isRedisOk() {
        return !!(redisClient && redisClient.isConnected && redisClient.client);
    }

    // ═══════════════════════════════════════
    //  СИНХРОННИЙ API (100% сумісний з Map)
    // ═══════════════════════════════════════

    /**
     * Отримати значення за ключем (синхронно з пам'яті)
     */
    get(key) {
        return this._map.get(String(key));
    }

    /**
     * Зберегти значення (синхронно в пам'ять + async у Redis)
     */
    set(key, value) {
        const k = String(key);
        this._map.set(k, value);
        this._syncSet(k, value);
        return this;
    }

    /**
     * Видалити значення (синхронно з пам'яті + async з Redis)
     */
    delete(key) {
        const k = String(key);
        const existed = this._map.delete(k);
        this._syncDelete(k);
        return existed;
    }

    /**
     * Перевірити наявність ключа
     */
    has(key) {
        return this._map.has(String(key));
    }

    /**
     * Кількість записів (в пам'яті)
     */
    get size() {
        return this._map.size;
    }

    /**
     * Очистити всі записи
     */
    clear() {
        const keys = [...this._map.keys()];
        this._map.clear();
        // Видаляємо з Redis
        if (this._isRedisOk && keys.length > 0) {
            const redisKeys = keys.map(k => `${this._prefix}${k}`);
            redisClient.client.del(...redisKeys).catch(() => { });
        }
    }

    /**
     * Ітератор (для for...of)
     */
    [Symbol.iterator]() {
        return this._map[Symbol.iterator]();
    }

    forEach(callback) {
        return this._map.forEach(callback);
    }

    keys() {
        return this._map.keys();
    }

    values() {
        return this._map.values();
    }

    entries() {
        return this._map.entries();
    }

    // ═══════════════════════════════════════
    //  REDIS SYNC (fire-and-forget)
    // ═══════════════════════════════════════

    /**
     * Записати в Redis (async, не блокує)
     */
    _syncSet(key, value) {
        if (!this._isRedisOk) return;
        try {
            const serialized = JSON.stringify(value);
            redisClient.client
                .setex(`${this._prefix}${key}`, this._ttl, serialized)
                .catch(err => {
                    logger.debug(`PersistentMap [${this._name}] Redis set error: ${err.message}`);
                });
        } catch (err) {
            logger.debug(`PersistentMap [${this._name}] serialize error: ${err.message}`);
        }
    }

    /**
     * Видалити з Redis (async, не блокує)
     */
    _syncDelete(key) {
        if (!this._isRedisOk) return;
        redisClient.client
            .del(`${this._prefix}${key}`)
            .catch(err => {
                logger.debug(`PersistentMap [${this._name}] Redis del error: ${err.message}`);
            });
    }

    // ═══════════════════════════════════════
    //  HYDRATE (відновлення з Redis при старті)
    // ═══════════════════════════════════════

    /**
     * Відновити дані з Redis в пам'ять.
     * Викликати при ініціалізації сервера.
     * @returns {Promise<number>} Кількість відновлених записів
     */
    async hydrate() {
        if (!this._isRedisOk) {
            logger.debug(`PersistentMap [${this._name}] Redis недоступний, hydrate пропущено`);
            return 0;
        }

        try {
            // Використовуємо SCAN для безпечного перебору ключів
            const keys = [];
            let cursor = '0';
            do {
                const [nextCursor, batch] = await redisClient.client.scan(
                    cursor, 'MATCH', `${this._prefix}*`, 'COUNT', 100
                );
                cursor = nextCursor;
                keys.push(...batch);
            } while (cursor !== '0');

            if (keys.length === 0) return 0;

            // Завантажуємо значення через pipeline (пакетний запит)
            const pipeline = redisClient.client.pipeline();
            keys.forEach(k => pipeline.get(k));
            const results = await pipeline.exec();

            let restored = 0;
            keys.forEach((fullKey, i) => {
                const [err, val] = results[i];
                if (err || !val) return;
                try {
                    const key = fullKey.slice(this._prefix.length);
                    this._map.set(key, JSON.parse(val));
                    restored++;
                } catch {
                    // Невалідний JSON — пропускаємо
                }
            });

            if (restored > 0) {
                logger.info(`🔄 [${this._name}] відновлено ${restored} записів з Redis`);
            }
            return restored;
        } catch (err) {
            logger.warn(`⚠️ [${this._name}] помилка hydrate: ${err.message}`);
            return 0;
        }
    }
}

// ═══════════════════════════════════════════════════════
//  SESSION MANAGER — фабрика PersistentMap для TelegramService
// ═══════════════════════════════════════════════════════

const sessionManager = {
    /**
     * Створити PersistentMap для userSessions
     */
    createSessionsMap() {
        return new PersistentMap('sess:', 86400, 'sessions'); // 24h
    },

    /**
     * Створити PersistentMap для userStates
     */
    createStatesMap() {
        return new PersistentMap('state:', 86400, 'states'); // 24h
    },

    /**
     * Створити PersistentMap для stateStack
     */
    createStateStackMap() {
        return new PersistentMap('stStack:', 86400, 'stateStack'); // 24h
    },

    /**
     * Створити PersistentMap для conversationHistory
     */
    createConversationHistoryMap() {
        return new PersistentMap('convHist:', 14400, 'conversationHistory'); // 4h
    },

    /**
     * Створити PersistentMap для navigationHistory
     */
    createNavigationHistoryMap() {
        return new PersistentMap('navHist:', 43200, 'navigationHistory'); // 12h
    },

    /**
     * Створити PersistentMap для internetRequestCounts
     */
    createInternetRequestCountsMap() {
        return new PersistentMap('inetReq:', 86400, 'internetRequestCounts'); // 24h
    },

    /**
     * Відновити всі Maps з Redis
     * @param {Object} maps - Об'єкт з PersistentMap'ами
     * @returns {Promise<Object>} Статистика відновлення
     */
    async hydrateAll(maps) {
        const stats = {};
        const entries = Object.entries(maps);

        await Promise.allSettled(
            entries.map(async ([name, map]) => {
                if (map && typeof map.hydrate === 'function') {
                    stats[name] = await map.hydrate();
                }
            })
        );

        const total = Object.values(stats).reduce((sum, n) => sum + n, 0);
        if (total > 0) {
            logger.info(`✅ SessionManager: відновлено ${total} записів з Redis`, stats);
        } else {
            logger.debug('SessionManager: Redis порожній або недоступний, починаємо з чистого стану');
        }

        return stats;
    },

    PersistentMap
};

module.exports = sessionManager;
