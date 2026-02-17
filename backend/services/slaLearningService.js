const Ticket = require('../models/Ticket');
const logger = require('../utils/logger');

/**
 * Сервіс для аналізу історичних даних виконання тікетів
 * Допомагає AI вчитися на реальних даних та покращувати прогнози SLA
 */
class SLALearningService {
  /**
   * Отримати статистику виконання подібних тікетів
   * @param {Object} params - Параметри для пошуку подібних тікетів
   * @returns {Promise<Object>} - Статистика виконання
   */
  async getSimilarTicketsStatistics(params = {}) {
    try {
      const { category, priority, cityId, keywords = [], limit = 50 } = params;

      // Будуємо запит для пошуку подібних тікетів
      const query = {
        status: 'resolved', // Тільки вирішені тікети (знаємо реальний час)
        'sla.hours': { $exists: true, $ne: null },
        actualHours: { $exists: true, $ne: null }, // Має бути вказано фактичний час
      };

      if (category) {
        query.category = category;
      }

      if (priority) {
        query.priority = priority;
      }

      if (cityId) {
        query.city = cityId;
      }

      // Пошук по ключовим словам у заголовку/описі
      if (keywords.length > 0) {
        const keywordRegex = keywords.map(kw => new RegExp(kw, 'i'));
        query.$or = [{ title: { $in: keywordRegex } }, { description: { $in: keywordRegex } }];
      }

      // Отримуємо подібні тікети
      const similarTickets = await Ticket.find(query)
        .sort({ resolvedAt: -1 }) // Найновіші спочатку
        .limit(limit)
        .select('title description priority category actualHours sla resolvedAt createdAt')
        .lean();

      if (similarTickets.length === 0) {
        return {
          found: false,
          count: 0,
          message: 'Немає історичних даних для подібних тікетів',
        };
      }

      // Аналіз статистики
      const actualHours = similarTickets.map(t => t.actualHours).filter(h => h > 0);
      const slaHours = similarTickets.map(t => t.sla?.hours).filter(h => h > 0);

      // Розрахунки
      const avgActual = actualHours.reduce((sum, h) => sum + h, 0) / actualHours.length;
      const medianActual = this.calculateMedian(actualHours);
      const minActual = Math.min(...actualHours);
      const maxActual = Math.max(...actualHours);

      const avgSLA = slaHours.reduce((sum, h) => sum + h, 0) / slaHours.length;

      // Точність попередніх прогнозів
      const accuracyData = similarTickets
        .filter(t => t.sla?.hours && t.actualHours)
        .map(t => {
          const predicted = t.sla.hours;
          const actual = t.actualHours;
          const error = Math.abs(predicted - actual);
          const errorPercent = (error / actual) * 100;
          return { predicted, actual, error, errorPercent };
        });

      const avgError = accuracyData.reduce((sum, d) => sum + d.error, 0) / accuracyData.length;
      const avgErrorPercent =
        accuracyData.reduce((sum, d) => sum + d.errorPercent, 0) / accuracyData.length;

      // Розподіл за часом
      const distribution = this.calculateDistribution(actualHours);

      return {
        found: true,
        count: similarTickets.length,
        actual: {
          average: Math.round(avgActual * 10) / 10,
          median: Math.round(medianActual * 10) / 10,
          min: Math.round(minActual * 10) / 10,
          max: Math.round(maxActual * 10) / 10,
        },
        predicted: {
          average: Math.round(avgSLA * 10) / 10,
        },
        accuracy: {
          averageError: Math.round(avgError * 10) / 10,
          averageErrorPercent: Math.round(avgErrorPercent * 10) / 10,
        },
        distribution,
        examples: similarTickets.slice(0, 5).map(t => ({
          title: t.title,
          priority: t.priority,
          predicted: t.sla?.hours,
          actual: t.actualHours,
        })),
      };
    } catch (error) {
      logger.error('Помилка отримання статистики подібних тікетів:', error);
      return {
        found: false,
        count: 0,
        error: error.message,
      };
    }
  }

  /**
   * Отримати ключові слова з тексту для пошуку подібних тікетів
   */
  extractKeywords(text) {
    if (!text) {
      return [];
    }

    const stopWords = new Set([
      'не',
      'та',
      'що',
      'як',
      'на',
      'в',
      'з',
      'по',
      'до',
      'від',
      'у',
      'і',
      'а',
      'але',
      'працює',
      'робить',
      'робити',
      'зробити',
      'буде',
      'має',
      'можна',
      'треба',
      'потрібно',
    ]);

    // Важливі технічні терміни
    const importantTerms = [
      'принтер',
      "комп'ютер",
      'ноутбук',
      'сервер',
      'монітор',
      'клавіатура',
      'мишка',
      'інтернет',
      'мережа',
      'wifi',
      'vpn',
      'пошта',
      'outlook',
      'windows',
      'office',
      'пароль',
      'доступ',
      '1с',
      'телефон',
      'друкує',
      'вмикається',
      'завантажується',
      'гальмує',
      'повільно',
      'зависає',
      'помилка',
      'вірус',
    ];

    const words = text
      .toLowerCase()
      .replace(/[^\wа-яіїєґ\s]/gi, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Пріоритет для важливих термінів
    const keywords = [];
    words.forEach(word => {
      if (importantTerms.some(term => word.includes(term) || term.includes(word))) {
        keywords.push(word);
      }
    });

    // Якщо не знайшли важливих термінів, беремо перші 3-5 слів
    if (keywords.length === 0) {
      keywords.push(...words.slice(0, 5));
    }

    return [...new Set(keywords)]; // Унікальні
  }

  /**
   * Розрахунок медіани
   */
  calculateMedian(arr) {
    if (arr.length === 0) {
      return 0;
    }
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /**
   * Розрахунок розподілу за часовими інтервалами
   */
  calculateDistribution(hours) {
    const ranges = {
      'до 1 год': 0,
      '1-4 год': 0,
      '4-8 год': 0,
      '8-24 год': 0,
      '24-48 год': 0,
      'понад 48 год': 0,
    };

    hours.forEach(h => {
      if (h < 1) {
        ranges['до 1 год']++;
      } else if (h < 4) {
        ranges['1-4 год']++;
      } else if (h < 8) {
        ranges['4-8 год']++;
      } else if (h < 24) {
        ranges['8-24 год']++;
      } else if (h < 48) {
        ranges['24-48 год']++;
      } else {
        ranges['понад 48 год']++;
      }
    });

    // Конвертуємо в відсотки
    const total = hours.length;
    const distribution = {};
    Object.keys(ranges).forEach(range => {
      distribution[range] = {
        count: ranges[range],
        percent: Math.round((ranges[range] / total) * 100),
      };
    });

    return distribution;
  }

  /**
   * Отримати рекомендацію SLA на основі історичних даних
   */
  async getRecommendedSLA(ticket) {
    try {
      const keywords = this.extractKeywords(`${ticket.title} ${ticket.description || ''}`);

      const stats = await this.getSimilarTicketsStatistics({
        category: ticket.category,
        priority: ticket.priority,
        cityId: ticket.city,
        keywords,
        limit: 50,
      });

      if (!stats.found || stats.count < 3) {
        // Недостатньо даних, повертаємо базовий прогноз
        return {
          hasLearning: false,
          reason: 'Недостатньо історичних даних для точного прогнозу',
          recommendedHours: null,
        };
      }

      // Рекомендація на основі медіани (більш стійка до викидів)
      // + 20% буфер для надійності
      const recommendedHours = Math.ceil(stats.actual.median * 1.2);

      return {
        hasLearning: true,
        recommendedHours,
        confidence: this.calculateConfidence(stats),
        basedOn: {
          similarTickets: stats.count,
          averageActual: stats.actual.average,
          medianActual: stats.actual.median,
          range: `${stats.actual.min}-${stats.actual.max} год`,
          previousAccuracy: `±${Math.round(stats.accuracy.averageErrorPercent)}%`,
        },
        reason: `На основі ${stats.count} подібних тікетів. Середній час: ${stats.actual.median}h, з буфером 20%: ${recommendedHours}h`,
      };
    } catch (error) {
      logger.error('Помилка розрахунку рекомендованого SLA:', error);
      return {
        hasLearning: false,
        reason: 'Помилка аналізу історичних даних',
        recommendedHours: null,
      };
    }
  }

  /**
   * Розрахунок впевненості прогнозу
   */
  calculateConfidence(stats) {
    let confidence = 0;

    // Чим більше даних, тим вища впевненість (макс 40%)
    const dataScore = Math.min(stats.count / 50, 1) * 40;
    confidence += dataScore;

    // Чим менша похибка, тим вища впевненість (макс 30%)
    const accuracyScore = Math.max(0, (100 - stats.accuracy.averageErrorPercent) / 100) * 30;
    confidence += accuracyScore;

    // Чим менша варіативність (min vs max), тим вища впевненість (макс 30%)
    const variability = (stats.actual.max - stats.actual.min) / stats.actual.average;
    const variabilityScore = Math.max(0, (2 - variability) / 2) * 30;
    confidence += variabilityScore;

    return Math.round(confidence);
  }
}

module.exports = new SLALearningService();
