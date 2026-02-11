const logger = require('./logger');

/**
 * Валідатор для AI відповідей
 * Перевіряє якість та структуру відповідей перед відправкою користувачу
 */
class AIResponseValidator {
  constructor() {
    this.minLength = 50;
    this.maxLength = 500;
    this.requiredPatterns = {
      // Кроки: "1. " / "1) " або емодзі "1️⃣ " / "2️⃣ "
      steps: /\d+[.)]\s+|(?:1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|6️⃣|7️⃣|8️⃣|9️⃣)\s+/,
      actionVerbs:
        /(перевірте|спробуйте|зробіть|вимкніть|увімкніть|натисніть|відкрийте|закрийте|перезавантажте|оберіть)/i,
    };
  }

  /**
   * Валідація AI відповіді
   * @param {string} response - Відповідь від AI
   * @param {string} type - Тип відповіді: 'quickSolution' | 'nextQuestion' | 'ticketSummary'
   * @returns {Object} { valid: boolean, reason?: string, fallback?: boolean }
   */
  validate(response, type = 'quickSolution') {
    const validators = {
      quickSolution: this.validateQuickSolution.bind(this),
      nextQuestion: this.validateNextQuestion.bind(this),
      ticketSummary: this.validateTicketSummary.bind(this),
    };

    const validator = validators[type];
    if (!validator) {
      logger.warn('Unknown validation type', { type });
      return { valid: true }; // Пропускаємо невідомі типи
    }

    return validator(response);
  }

  /**
   * Валідація швидкого рішення
   * @param {string} solution - Текст швидкого рішення
   * @returns {Object} Результат валідації
   */
  validateQuickSolution(solution) {
    if (!solution || typeof solution !== 'string') {
      return {
        valid: false,
        reason: 'Invalid type - expected string',
        fallback: true,
      };
    }

    const trimmed = solution.trim();

    // Перевірка довжини
    if (trimmed.length < this.minLength) {
      return {
        valid: false,
        reason: `Too short (${trimmed.length} < ${this.minLength})`,
        fallback: true,
      };
    }

    if (trimmed.length > this.maxLength) {
      return {
        valid: false,
        reason: `Too long (${trimmed.length} > ${this.maxLength})`,
        fallback: true,
      };
    }

    // Перевірка структури (має бути кроки)
    if (!this.requiredPatterns.steps.test(trimmed)) {
      return {
        valid: false,
        reason: 'No numbered steps found',
        fallback: true,
      };
    }

    // Перевірка дієслів (warning, але не critical)
    if (!this.requiredPatterns.actionVerbs.test(trimmed)) {
      logger.warn('Quick solution without action verbs', {
        solution: trimmed.substring(0, 100) + '...',
      });
      // Це warning, але не critical - пропускаємо
    }

    // Перевірка на повтори
    if (this.hasExcessiveRepetition(trimmed)) {
      return {
        valid: false,
        reason: 'Excessive repetition detected',
        fallback: true,
      };
    }

    // Перевірка на підозрілі фрази (галюцинації)
    if (this.hasSuspiciousPhrases(trimmed)) {
      return {
        valid: false,
        reason: 'Suspicious phrases detected (possible hallucination)',
        fallback: true,
      };
    }

    return { valid: true };
  }

  /**
   * Валідація наступного питання
   * @param {string} question - Текст питання
   * @returns {Object} Результат валідації
   */
  validateNextQuestion(question) {
    if (!question || typeof question !== 'string') {
      return {
        valid: false,
        reason: 'Invalid type - expected string',
        fallback: true,
      };
    }

    const trimmed = question.trim();

    // Питання має бути коротким (20-200 символів)
    if (trimmed.length < 20) {
      return {
        valid: false,
        reason: 'Question too short',
        fallback: true,
      };
    }

    if (trimmed.length > 200) {
      return {
        valid: false,
        reason: 'Question too long',
        fallback: true,
      };
    }

    // Має містити знак питання
    if (!trimmed.includes('?')) {
      logger.warn('Question without question mark', { question: trimmed });
      // Не критично, але логуємо
    }

    return { valid: true };
  }

  /**
   * Валідація підсумку тікета
   * @param {Object} summary - Об'єкт з title, description, category, priority
   * @returns {Object} Результат валідації
   */
  validateTicketSummary(summary) {
    if (!summary || typeof summary !== 'object') {
      return {
        valid: false,
        reason: 'Invalid type - expected object',
        fallback: true,
      };
    }

    // Перевірка обов'язкових полів
    const requiredFields = ['title', 'description'];
    for (const field of requiredFields) {
      if (!summary[field] || typeof summary[field] !== 'string') {
        return {
          valid: false,
          reason: `Missing or invalid field: ${field}`,
          fallback: true,
        };
      }
    }

    // Перевірка довжини заголовка
    if (summary.title.length < 10 || summary.title.length > 100) {
      return {
        valid: false,
        reason: 'Title length invalid (10-100 chars)',
        fallback: true,
      };
    }

    // Перевірка довжини опису
    if (summary.description.length < 20 || summary.description.length > 1000) {
      return {
        valid: false,
        reason: 'Description length invalid (20-1000 chars)',
        fallback: true,
      };
    }

    // Перевірка пріоритету (якщо є)
    if (summary.priority) {
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      if (!validPriorities.includes(summary.priority)) {
        logger.warn('Invalid priority value', { priority: summary.priority });
        // Не критично, можна виправити пізніше
      }
    }

    return { valid: true };
  }

  /**
   * Перевірка на надмірні повтори слів
   * @param {string} text - Текст для перевірки
   * @returns {boolean} true якщо є надмірні повтори
   */
  hasExcessiveRepetition(text) {
    const words = text.toLowerCase().split(/\s+/);
    const wordCount = {};

    for (const word of words) {
      if (word.length < 4) {
        continue;
      } // Ігноруємо короткі слова
      wordCount[word] = (wordCount[word] || 0) + 1;
    }

    // Якщо будь-яке слово повторюється >5 разів
    const hasRepetition = Object.values(wordCount).some(count => count > 5);

    if (hasRepetition) {
      const repeatedWords = Object.entries(wordCount)
        .filter(([_, count]) => count > 5)
        .map(([word, count]) => `${word}(${count})`);

      logger.warn('Excessive word repetition detected', {
        repeatedWords: repeatedWords.join(', '),
      });
    }

    return hasRepetition;
  }

  /**
   * Перевірка на підозрілі фрази (можливі галюцинації)
   * @param {string} text - Текст для перевірки
   * @returns {boolean} true якщо знайдено підозрілі фрази
   */
  hasSuspiciousPhrases(text) {
    const suspiciousPhrases = [
      /as an ai/i,
      /i cannot/i,
      /i don't have/i,
      /я не можу/i,
      /я штучний інтелект/i,
      /я не маю доступу/i,
      /\[.*?\]/, // Текст в квадратних дужках (часто placeholder)
      /\{.*?\}/, // Текст в фігурних дужках
    ];

    for (const pattern of suspiciousPhrases) {
      if (pattern.test(text)) {
        logger.warn('Suspicious phrase detected', {
          pattern: pattern.toString(),
          text: text.substring(0, 100) + '...',
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Отримати fallback повідомлення для швидкого рішення
   * @param {string} _userMessage - Оригінальне повідомлення користувача
   * @returns {string} Fallback повідомлення
   */
  getFallbackQuickSolution(_userMessage) {
    return (
      'Розумію вашу проблему. ' +
      'Для найшвидшого вирішення створю заявку — ' +
      "фахівець зв'яжеться найближчим часом."
    );
  }

  /**
   * Отримати fallback повідомлення для питання
   * @returns {string} Fallback питання
   */
  getFallbackQuestion() {
    return 'Будь ласка, опишіть детальніше що саме відбувається?';
  }

  /**
   * Отримати fallback для підсумку тікета
   * @param {string} userMessage - Оригінальне повідомлення
   * @returns {Object} Fallback об'єкт тікета
   */
  getFallbackTicketSummary(userMessage) {
    return {
      title: userMessage.substring(0, 50),
      description: userMessage,
      category: 'general',
      priority: 'medium',
    };
  }
}

module.exports = new AIResponseValidator();
