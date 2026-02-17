const Ticket = require('../models/Ticket');
const logger = require('../utils/logger');

/**
 * Сервіс для автоматичної пріоритизації тікетів
 * Розраховує динамічний пріоритет на основі різних факторів
 */
class TicketPriorityService {
  constructor() {
    // Ваги для різних факторів (можна налаштувати)
    this.weights = {
      waitingTime: 0.3, // Час очікування
      slaStatus: 0.25, // Статус SLA
      reopenCount: 0.15, // Кількість повторних відкриттів
      keywords: 0.15, // Критичні ключові слова
      userHistory: 0.15, // Історія користувача
    };

    // Критичні ключові слова (регістронезалежні)
    this.criticalKeywords = [
      'не працює',
      'зламався',
      'критично',
      'терміново',
      'аварія',
      'не можу працювати',
      'блокує роботу',
      'зависає',
      'помилка',
      'не запускається',
      'втрата даних',
      'безпека',
      'вірус',
    ];

    this.urgentKeywords = [
      'директор',
      'керівник',
      'важливо',
      'нарада',
      'презентація',
      'дедлайн',
      'клієнт',
      'звіт',
    ];
  }

  /**
   * Розрахунок score для часу очікування
   * @param {Date} createdAt - Дата створення тікету
   * @returns {number} Score від 0 до 100
   */
  calculateWaitingTimeScore(createdAt) {
    const now = new Date();
    const hoursWaiting = (now - createdAt) / (1000 * 60 * 60);

    // Чим довше чекає, тим вищий score
    if (hoursWaiting < 1) {
      return 10;
    }
    if (hoursWaiting < 4) {
      return 30;
    }
    if (hoursWaiting < 8) {
      return 50;
    }
    if (hoursWaiting < 24) {
      return 70;
    }
    if (hoursWaiting < 48) {
      return 85;
    }
    return 100; // Більше 48 годин
  }

  /**
   * Розрахунок score для SLA статусу
   * @param {Object} sla - SLA об'єкт тікету
   * @returns {number} Score від 0 до 100
   */
  calculateSLAScore(sla) {
    if (!sla || !sla.status) {
      return 0;
    }

    switch (sla.status) {
      case 'breached':
        return 100; // Максимальний пріоритет
      case 'at_risk':
        return 80;
      case 'on_time':
        // Якщо залишилось менше 20% часу - підвищуємо пріоритет
        if (sla.remainingHours && sla.hours) {
          const percentRemaining = (sla.remainingHours / sla.hours) * 100;
          if (percentRemaining < 20) {
            return 60;
          }
          if (percentRemaining < 50) {
            return 40;
          }
        }
        return 20;
      case 'not_started':
        return 0;
      default:
        return 0;
    }
  }

  /**
   * Розрахунок score для повторних відкриттів
   * @param {number} reopenCount - Кількість повторних відкриттів
   * @returns {number} Score від 0 до 100
   */
  calculateReopenScore(reopenCount) {
    if (!reopenCount || reopenCount === 0) {
      return 0;
    }

    // Кожне повторне відкриття додає 30 балів (макс 100)
    return Math.min(reopenCount * 30, 100);
  }

  /**
   * Розрахунок score для ключових слів
   * @param {string} title - Заголовок тікету
   * @param {string} description - Опис тікету
   * @returns {number} Score від 0 до 100
   */
  calculateKeywordsScore(title, description) {
    const text = `${title} ${description || ''}`.toLowerCase();

    // Перевірка критичних ключових слів
    const hasCritical = this.criticalKeywords.some(keyword => text.includes(keyword.toLowerCase()));

    if (hasCritical) {
      return 100;
    }

    // Перевірка термінових ключових слів
    const hasUrgent = this.urgentKeywords.some(keyword => text.includes(keyword.toLowerCase()));

    if (hasUrgent) {
      return 70;
    }

    return 0;
  }

  /**
   * Розрахунок score для історії користувача
   * @param {string} userId - ID користувача
   * @returns {number} Score від 0 до 100
   */
  async calculateUserHistoryScore(userId) {
    try {
      // Знаходимо всі тікети користувача за останні 30 днів
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const userTickets = await Ticket.find({
        createdBy: userId,
        createdAt: { $gte: thirtyDaysAgo },
        isDeleted: false,
      }).select('status metrics.resolutionTime');

      if (userTickets.length === 0) {
        return 0;
      }

      // Якщо у користувача багато відкритих тікетів - знижуємо пріоритет
      const openTickets = userTickets.filter(
        t => t.status === 'open' || t.status === 'in_progress'
      );

      if (openTickets.length > 3) {
        return -20;
      } // Негативний score
      if (openTickets.length > 1) {
        return -10;
      }

      // Якщо це перший тікет користувача - підвищуємо пріоритет
      if (userTickets.length === 1) {
        return 30;
      }

      return 0;
    } catch (error) {
      logger.error('Помилка розрахунку user history score:', error);
      return 0;
    }
  }

  /**
   * Розрахунок загального priority score для тікету
   * @param {Object} ticket - Об'єкт тікету
   * @returns {Object} { score, suggestedPriority, factors }
   */
  async calculatePriorityScore(ticket) {
    try {
      // Розрахунок окремих факторів
      const waitingScore = this.calculateWaitingTimeScore(ticket.createdAt);
      const slaScore = this.calculateSLAScore(ticket.sla);
      const reopenScore = this.calculateReopenScore(ticket.metrics?.reopenCount || 0);
      const keywordsScore = this.calculateKeywordsScore(ticket.title, ticket.description);
      const userHistoryScore = await this.calculateUserHistoryScore(ticket.createdBy);

      // Зважений розрахунок загального score
      const totalScore =
        waitingScore * this.weights.waitingTime +
        slaScore * this.weights.slaStatus +
        reopenScore * this.weights.reopenCount +
        keywordsScore * this.weights.keywords +
        userHistoryScore * this.weights.userHistory;

      // Визначення рекомендованого пріоритету
      let suggestedPriority;
      if (totalScore >= 80) {
        suggestedPriority = 'urgent';
      } else if (totalScore >= 60) {
        suggestedPriority = 'high';
      } else if (totalScore >= 30) {
        suggestedPriority = 'medium';
      } else {
        suggestedPriority = 'low';
      }

      return {
        score: Math.round(totalScore),
        suggestedPriority,
        factors: {
          waitingTime: Math.round(waitingScore),
          slaStatus: Math.round(slaScore),
          reopenCount: Math.round(reopenScore),
          keywords: Math.round(keywordsScore),
          userHistory: Math.round(userHistoryScore),
        },
      };
    } catch (error) {
      logger.error('Помилка розрахунку priority score:', error);
      throw error;
    }
  }

  /**
   * Автоматичне оновлення пріоритету для тікету
   * @param {string} ticketId - ID тікету
   * @param {boolean} forceUpdate - Примусове оновлення навіть якщо пріоритет вже встановлено вручну
   * @returns {Object} Результат оновлення
   */
  async updateTicketPriority(ticketId, forceUpdate = false) {
    try {
      const ticket = await Ticket.findById(ticketId);

      if (!ticket) {
        throw new Error('Тікет не знайдено');
      }

      // Не оновлюємо закриті тікети
      if (ticket.status === 'closed' || ticket.status === 'cancelled') {
        return { updated: false, reason: 'Тікет закритий' };
      }

      // Розраховуємо новий пріоритет
      const priorityData = await this.calculatePriorityScore(ticket);

      // Перевіряємо чи потрібно оновлювати
      if (!forceUpdate && ticket.priority === priorityData.suggestedPriority) {
        return {
          updated: false,
          reason: 'Пріоритет вже актуальний',
          currentPriority: ticket.priority,
          ...priorityData,
        };
      }

      const oldPriority = ticket.priority;
      ticket.priority = priorityData.suggestedPriority;

      // Зберігаємо метадані про автоматичну пріоритизацію
      if (!ticket.metadata) {
        ticket.metadata = {};
      }
      ticket.metadata.autoPriority = {
        score: priorityData.score,
        factors: priorityData.factors,
        updatedAt: new Date(),
        previousPriority: oldPriority,
      };

      await ticket.save();

      logger.info(
        `✅ Оновлено пріоритет тікету ${ticket.ticketNumber}: ${oldPriority} → ${priorityData.suggestedPriority} (score: ${priorityData.score})`
      );

      return {
        updated: true,
        oldPriority,
        newPriority: priorityData.suggestedPriority,
        ...priorityData,
      };
    } catch (error) {
      logger.error(`Помилка оновлення пріоритету тікету ${ticketId}:`, error);
      throw error;
    }
  }

  /**
   * Масове оновлення пріоритетів для всіх відкритих тікетів
   * @returns {Object} Статистика оновлення
   */
  async updateAllTicketPriorities() {
    try {
      logger.info('🔄 Початок масового оновлення пріоритетів...');

      // Знаходимо всі відкриті тікети
      const tickets = await Ticket.find({
        status: { $in: ['open', 'in_progress'] },
        isDeleted: false,
      });

      logger.info(`📊 Знайдено ${tickets.length} тікетів для оновлення`);

      let updated = 0;
      let skipped = 0;
      const errors = [];

      for (const ticket of tickets) {
        try {
          const result = await this.updateTicketPriority(ticket._id, false);
          if (result.updated) {
            updated++;
          } else {
            skipped++;
          }
        } catch (error) {
          errors.push({ ticketId: ticket._id, error: error.message });
          logger.error(`Помилка оновлення тікету ${ticket._id}:`, error);
        }
      }

      logger.info(
        `✅ Оновлення завершено: ${updated} оновлено, ${skipped} пропущено, ${errors.length} помилок`
      );

      return {
        total: tickets.length,
        updated,
        skipped,
        errors: errors.length,
        errorDetails: errors,
      };
    } catch (error) {
      logger.error('❌ Критична помилка масового оновлення пріоритетів:', error);
      throw error;
    }
  }
}

module.exports = new TicketPriorityService();
