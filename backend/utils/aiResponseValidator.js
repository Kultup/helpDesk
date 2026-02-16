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

    // Уточнююче питання (наприклад "підкажіть, яка модель сканера?") — не вимагаємо нумерованих кроків
    if (trimmed.includes('?')) {
      return { valid: true };
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

  // ============================================================
  // JSON Schema Validation for structured prompt outputs
  // ============================================================

  /**
   * Validate JSON output against a schema definition
   * @param {Object} data - Parsed JSON from AI
   * @param {string} schemaName - Schema name
   * @returns {Object} { valid: boolean, errors: string[], sanitized: Object }
   */
  validateSchema(data, schemaName) {
    const schema = this.schemas[schemaName];
    if (!schema) {
      logger.warn(`Unknown schema: ${schemaName}`);
      return { valid: true, errors: [], sanitized: data };
    }

    const errors = [];
    const sanitized = {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];

      // Check required
      if (rules.required && (value === undefined || value === null)) {
        errors.push(`Missing required field: ${field}`);
        sanitized[field] = rules.default;
        continue;
      }

      // Skip optional missing fields
      if (value === undefined || value === null) {
        sanitized[field] = rules.default !== undefined ? rules.default : null;
        continue;
      }

      // Type checking + coercion
      switch (rules.type) {
        case 'string':
          sanitized[field] = String(value);
          if (rules.maxLength && sanitized[field].length > rules.maxLength) {
            sanitized[field] = sanitized[field].substring(0, rules.maxLength);
            errors.push(`${field} truncated to ${rules.maxLength} chars`);
          }
          break;
        case 'boolean':
          sanitized[field] = !!value;
          break;
        case 'number':
          sanitized[field] = parseFloat(value) || rules.default || 0;
          if (rules.min !== undefined) {
            sanitized[field] = Math.max(rules.min, sanitized[field]);
          }
          if (rules.max !== undefined) {
            sanitized[field] = Math.min(rules.max, sanitized[field]);
          }
          break;
        case 'enum':
          sanitized[field] = rules.values.includes(value) ? value : rules.default;
          if (!rules.values.includes(value)) {
            errors.push(`${field}: invalid value "${value}", using default "${rules.default}"`);
          }
          break;
        case 'array':
          sanitized[field] = Array.isArray(value) ? value : rules.default || [];
          break;
        case 'string|null':
          sanitized[field] = value ? String(value) : null;
          break;
        default:
          sanitized[field] = value;
      }
    }

    if (errors.length > 0) {
      logger.warn(`Schema validation warnings for ${schemaName}`, {
        errors,
        originalFields: Object.keys(data),
      });
    }

    return {
      valid: errors.filter(e => e.startsWith('Missing required')).length === 0,
      errors,
      sanitized,
    };
  }

  get schemas() {
    return {
      intentAnalysis: {
        requestType: { type: 'string', required: true, default: 'unknown' },
        requestTypeConfidence: { type: 'number', required: false, default: 0.5, min: 0, max: 1 },
        isTicketIntent: { type: 'boolean', required: true, default: false },
        needsMoreInfo: { type: 'boolean', required: false, default: false },
        category: { type: 'string', required: false, default: 'general' },
        confidence: { type: 'number', required: false, default: 0.5, min: 0, max: 1 },
        priority: {
          type: 'enum',
          required: false,
          values: ['low', 'medium', 'high', 'urgent'],
          default: 'medium',
        },
        emotionalTone: { type: 'string', required: false, default: 'neutral' },
        quickSolution: { type: 'string', required: false, default: '' },
        offTopicResponse: { type: 'string', required: false, default: '' },
      },
      ticketSummary: {
        title: { type: 'string', required: true, default: 'Запит на підтримку', maxLength: 200 },
        description: { type: 'string', required: true, default: '' },
        category: { type: 'string', required: false, default: 'general', maxLength: 100 },
        priority: {
          type: 'enum',
          required: false,
          values: ['low', 'medium', 'high', 'urgent'],
          default: 'medium',
        },
      },
      conversationSummary: {
        problemStatement: { type: 'string', required: true, default: '' },
        keyDetails: { type: 'array', required: false, default: [] },
        userTriedSteps: { type: 'array', required: false, default: [] },
        remoteAccessInfo: { type: 'string|null', required: false, default: null },
        userMood: {
          type: 'enum',
          required: false,
          values: ['calm', 'frustrated', 'angry', 'confused', 'urgent'],
          default: 'calm',
        },
        recommendedAction: { type: 'string', required: true, default: '' },
        adminNotes: { type: 'string', required: false, default: '' },
      },
      autoResolution: {
        status: {
          type: 'enum',
          required: true,
          values: ['RESOLVED', 'NOT_RESOLVED', 'UNCLEAR'],
          default: 'UNCLEAR',
        },
        confidence: { type: 'number', required: false, default: 0, min: 0, max: 1 },
        reason: { type: 'string', required: false, default: '' },
        userSentiment: {
          type: 'enum',
          required: false,
          values: ['positive', 'neutral', 'negative'],
          default: 'neutral',
        },
      },
      zabbixAlert: {
        isCritical: { type: 'boolean', required: true, default: false },
        isDuplicate: { type: 'boolean', required: false, default: false },
        duplicateAlertId: { type: 'string|null', required: false, default: null },
        isRecurring: { type: 'boolean', required: false, default: false },
        rootCause: { type: 'string|null', required: false, default: null },
        relatedAlertIds: { type: 'array', required: false, default: [] },
        impactAssessment: {
          type: 'enum',
          required: true,
          values: ['critical', 'high', 'medium', 'low'],
          default: 'medium',
        },
        descriptionUk: { type: 'string', required: true, default: '' },
        possibleCauses: { type: 'array', required: false, default: [] },
        recommendedActions: { type: 'array', required: false, default: [] },
        telegramSummary: { type: 'string', required: true, default: '' },
      },
      slaBreachDetection: {
        breached: { type: 'array', required: false, default: [] },
        atRisk: { type: 'array', required: false, default: [] },
        summary: { type: 'string', required: true, default: '' },
        recommendedOrder: { type: 'array', required: false, default: [] },
        alertLevel: {
          type: 'enum',
          required: true,
          values: ['critical', 'warning', 'normal'],
          default: 'normal',
        },
      },
      proactiveIssueDetection: {
        predictions: { type: 'array', required: false, default: [] },
        summary: { type: 'string', required: true, default: '' },
        hostsMostAtRisk: { type: 'array', required: false, default: [] },
      },
      kbArticleGeneration: {
        title: { type: 'string', required: true, default: '', maxLength: 200 },
        tags: { type: 'array', required: false, default: [] },
        content: { type: 'string', required: true, default: '' },
        difficulty: {
          type: 'enum',
          required: false,
          values: ['easy', 'medium', 'advanced'],
          default: 'medium',
        },
        applicableTo: { type: 'string', required: false, default: '' },
      },
      statisticsAnalysis: {
        summary: { type: 'string', required: true, default: '' },
        keyInsights: { type: 'array', required: false, default: [] },
        trends: { type: 'array', required: false, default: [] },
        recommendations: { type: 'array', required: false, default: [] },
      },
    };
  }
}

module.exports = new AIResponseValidator();
