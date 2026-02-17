const logger = require('./logger');

/**
 * Retry helper для виконання функцій з автоматичними повторами
 * Використовує exponential backoff стратегію
 */
class RetryHelper {
  /**
   * Виконати функцію з retry механізмом
   * @param {Function} fn - Асинхронна функція для виконання
   * @param {Object} options - Налаштування retry
   * @param {number} options.maxRetries - Максимальна кількість спроб (за замовчуванням 3)
   * @param {number} options.initialDelay - Початкова затримка в мс (за замовчуванням 1000)
   * @param {number} options.maxDelay - Максимальна затримка в мс (за замовчуванням 10000)
   * @param {number} options.backoffMultiplier - Множник для exponential backoff (за замовчуванням 2)
   * @param {Function} options.shouldRetry - Функція для визначення чи потрібен retry (за замовчуванням завжди true)
   * @param {string} options.operationName - Назва операції для логування
   * @returns {Promise<any>} Результат виконання функції
   */
  async executeWithRetry(fn, options = {}) {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 10000,
      backoffMultiplier = 2,
      shouldRetry = () => true,
      operationName = 'operation',
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();

        // Якщо це не перша спроба, логуємо успіх після retry
        if (attempt > 1) {
          logger.info(`✅ ${operationName} succeeded after ${attempt} attempts`);
        }

        return result;
      } catch (error) {
        lastError = error;

        // Перевіряємо чи потрібен retry
        if (!shouldRetry(error)) {
          logger.warn(`❌ ${operationName} failed (non-retryable error)`, {
            attempt,
            error: error.message,
          });
          throw error;
        }

        // Якщо це остання спроба, кидаємо помилку
        if (attempt === maxRetries) {
          logger.error(`❌ ${operationName} failed after ${maxRetries} attempts`, {
            error: error.message,
            totalAttempts: maxRetries,
          });
          throw error;
        }

        // Логуємо спробу
        logger.warn(`⚠️ ${operationName} failed, retrying...`, {
          attempt,
          maxRetries,
          nextRetryIn: `${delay}ms`,
          error: error.message,
        });

        // Чекаємо перед наступною спробою
        await this.sleep(delay);

        // Збільшуємо затримку (exponential backoff)
        delay = Math.min(delay * backoffMultiplier, maxDelay);
      }
    }

    // Це не повинно виконатись, але на всяк випадок
    throw lastError;
  }

  /**
   * Затримка виконання
   * @param {number} ms - Мілісекунди
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Перевірка чи помилка є тимчасовою (network, timeout тощо)
   * @param {Error} error - Об'єкт помилки
   * @returns {boolean} true якщо помилка тимчасова
   */
  isTemporaryError(error) {
    if (!error) {
      return false;
    }

    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';

    // Network помилки
    const networkErrors = ['econnreset', 'econnrefused', 'etimedout', 'enetunreach', 'enotfound'];

    if (networkErrors.some(err => code.includes(err) || message.includes(err))) {
      return true;
    }

    // API rate limits
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return true;
    }

    // Timeout помилки
    if (message.includes('timeout') || message.includes('timed out')) {
      return true;
    }

    // HTTP статус коди що варто повторити
    if (error.status) {
      const retryableStatuses = [408, 429, 500, 502, 503, 504];
      if (retryableStatuses.includes(error.status)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Wrapper для AI запитів з retry
   * @param {Function} aiFunction - AI функція для виконання
   * @param {string} operationName - Назва операції
   * @returns {Promise<any>}
   */
  retryAIRequest(aiFunction, operationName = 'AI request') {
    return this.executeWithRetry(aiFunction, {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 8000,
      backoffMultiplier: 2,
      shouldRetry: this.isTemporaryError.bind(this),
      operationName,
    });
  }

  /**
   * Wrapper для database запитів з retry
   * @param {Function} dbFunction - Database функція для виконання
   * @param {string} operationName - Назва операції
   * @returns {Promise<any>}
   */
  retryDatabaseRequest(dbFunction, operationName = 'Database request') {
    return this.executeWithRetry(dbFunction, {
      maxRetries: 2,
      initialDelay: 500,
      maxDelay: 2000,
      backoffMultiplier: 2,
      shouldRetry: this.isTemporaryError.bind(this),
      operationName,
    });
  }

  /**
   * Wrapper для external API запитів з retry
   * @param {Function} apiFunction - API функція для виконання
   * @param {string} operationName - Назва операції
   * @returns {Promise<any>}
   */
  retryExternalAPI(apiFunction, operationName = 'External API request') {
    return this.executeWithRetry(apiFunction, {
      maxRetries: 3,
      initialDelay: 2000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      shouldRetry: this.isTemporaryError.bind(this),
      operationName,
    });
  }
}

// Singleton instance
module.exports = new RetryHelper();
