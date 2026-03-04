const logger = require('../utils/logger');
const { dataPath } = require('../config/paths');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_FILE = path.join(dataPath, 'ai_response_cache.json');
const DEFAULT_TTL = 3600000; // 1 година

class AIResponseCache {
  constructor() {
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0, size: 0 };
    this.loadCache();

    // Автозбереження кожні 5 хвилин
    setInterval(() => this.saveCache(), 5 * 60 * 1000);

    // Очищення старих записів кожні 10 хвилин
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  loadCache() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        const now = Date.now();
        for (const [key, value] of Object.entries(data)) {
          if (value.expiresAt > now) {
            this.cache.set(key, value);
          }
        }
        logger.info(`AI Cache: завантажено ${this.cache.size} записів`);
      }
    } catch (err) {
      logger.warn('AI Cache: не вдалося завантажити', err.message);
    }
  }

  saveCache() {
    try {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(this.cache)), 'utf8');
      logger.debug(`AI Cache: збережено ${this.cache.size} записів`);
    } catch (err) {
      logger.error('AI Cache: не вдалося зберегти', err.message);
    }
  }

  cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt < now) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      logger.debug(`AI Cache: очищено ${removed} застарілих записів`);
    }
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return entry.data;
  }

  set(key, data, ttl = DEFAULT_TTL) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
    });
    this.stats.size = this.cache.size;
  }

  createKey(message, userId) {
    const normalized = String(message).toLowerCase().trim().slice(0, 200);
    return crypto.createHash('md5').update(`${userId}:${normalized}`).digest('hex');
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) + '%' : '0%',
      memoryUsage: `${((this.cache.size * 0.5) / 1024).toFixed(2)} KB`,
    };
  }

  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, size: 0 };
    try {
      if (fs.existsSync(CACHE_FILE)) {
        fs.unlinkSync(CACHE_FILE);
      }
    } catch (err) {
      logger.warn('AI Cache: не вдалося видалити файл', err.message);
    }
    logger.info('AI Cache: очищено');
  }
}

module.exports = new AIResponseCache();
