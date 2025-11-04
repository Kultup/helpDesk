const SLAPolicy = require('../models/SLAPolicy');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const logger = require('../utils/logger');

class SLAService {
  /**
   * Розрахувати SLA для тикету
   * @param {Object} ticket - Тикет
   * @param {Object} slaPolicy - SLA політика (опціонально)
   * @returns {Object} - Розраховані SLA значення
   */
  async calculateSLA(ticket, slaPolicy = null) {
    try {
      // Отримуємо SLA політику
      if (!slaPolicy) {
        if (ticket.slaPolicy) {
          slaPolicy = await SLAPolicy.findById(ticket.slaPolicy);
        } else {
          slaPolicy = await SLAPolicy.getDefaultPolicy();
        }
      }

      if (!slaPolicy) {
        // Використовуємо дефолтні значення
        return {
          responseTime: 24,
          resolutionTime: 72,
          dueDate: null
        };
      }

      // Отримуємо SLA для пріоритету тикету
      const slaConfig = slaPolicy.getSLAForPriority(ticket.priority || 'medium');
      
      // Розраховуємо dueDate
      const createdAt = ticket.createdAt || new Date();
      const dueDate = new Date(createdAt.getTime() + slaConfig.resolutionTime * 60 * 60 * 1000);

      return {
        responseTime: slaConfig.responseTime,
        resolutionTime: slaConfig.resolutionTime,
        dueDate: dueDate,
        slaPolicy: slaPolicy._id
      };
    } catch (error) {
      logger.error('Error calculating SLA:', error);
      // Повертаємо дефолтні значення при помилці
      return {
        responseTime: 24,
        resolutionTime: 72,
        dueDate: null
      };
    }
  }

  /**
   * Оновити SLA для тикету
   * @param {Object} ticket - Тикет
   * @returns {Object} - Оновлений тикет
   */
  async updateTicketSLA(ticket) {
    try {
      const slaConfig = await this.calculateSLA(ticket);
      
      ticket.sla.responseTime = slaConfig.responseTime;
      ticket.sla.resolutionTime = slaConfig.resolutionTime;
      ticket.sla.priority = ticket.priority || 'medium';
      
      if (slaConfig.dueDate) {
        ticket.dueDate = slaConfig.dueDate;
      }
      
      if (slaConfig.slaPolicy) {
        ticket.slaPolicy = slaConfig.slaPolicy;
      }

      await ticket.save();
      return ticket;
    } catch (error) {
      logger.error('Error updating ticket SLA:', error);
      throw error;
    }
  }

  /**
   * Перевірити порушення SLA для тикету
   * @param {Object} ticket - Тикет
   * @returns {Object} - Результат перевірки
   */
  async checkSLABreach(ticket) {
    try {
      if (ticket.status === 'closed' || ticket.status === 'resolved' || ticket.status === 'cancelled') {
        return {
          isBreached: false,
          breachType: null,
          percentage: 0
        };
      }

      const now = new Date();
      const createdAt = ticket.createdAt || new Date();
      const responseTime = ticket.sla.responseTime || 24;
      const resolutionTime = ticket.sla.resolutionTime || 72;

      // Розраховуємо дедлайни
      const responseDeadline = new Date(createdAt.getTime() + responseTime * 60 * 60 * 1000);
      const resolutionDeadline = new Date(createdAt.getTime() + resolutionTime * 60 * 60 * 1000);

      // Перевіряємо порушення response time
      const responseBreach = !ticket.firstResponseAt && now > responseDeadline;
      
      // Перевіряємо порушення resolution time
      const resolutionBreach = now > resolutionDeadline;

      if (resolutionBreach) {
        const elapsed = (now - createdAt) / (1000 * 60 * 60); // години
        const percentage = Math.min(100, Math.round((elapsed / resolutionTime) * 100));
        
        return {
          isBreached: true,
          breachType: 'resolution',
          percentage: percentage,
          responseBreach: responseBreach
        };
      }

      if (responseBreach) {
        const elapsed = (now - createdAt) / (1000 * 60 * 60); // години
        const percentage = Math.min(100, Math.round((elapsed / responseTime) * 100));
        
        return {
          isBreached: true,
          breachType: 'response',
          percentage: percentage,
          responseBreach: true
        };
      }

      // Розраховуємо процент використання часу
      const elapsed = (now - createdAt) / (1000 * 60 * 60); // години
      const percentage = Math.min(100, Math.round((elapsed / resolutionTime) * 100));

      return {
        isBreached: false,
        breachType: null,
        percentage: percentage,
        responseBreach: false
      };
    } catch (error) {
      logger.error('Error checking SLA breach:', error);
      return {
        isBreached: false,
        breachType: null,
        percentage: 0
      };
    }
  }

  /**
   * Відправити попередження SLA
   * @param {Object} ticket - Тикет
   * @param {Number} percentage - Відсоток використання часу
   * @param {Object} slaPolicy - SLA політика
   */
  async sendSLAWarning(ticket, percentage, slaPolicy) {
    try {
      if (!slaPolicy || !slaPolicy.warnings || !slaPolicy.warnings.enabled) {
        return;
      }

      // Перевіряємо, чи вже відправлено попередження для цього відсотка
      const warningAlreadySent = ticket.slaWarningsSent.some(
        w => Math.abs(w.percentage - percentage) < 5
      );

      if (warningAlreadySent) {
        return;
      }

      // Знаходимо рівень попередження
      const warningLevel = slaPolicy.warnings.levels.find(
        level => percentage >= level.percentage
      );

      if (!warningLevel) {
        return;
      }

      // Перевіряємо, чи вже відправлено попередження для цього рівня
      const levelWarningSent = ticket.slaWarningsSent.some(
        w => Math.abs(w.percentage - warningLevel.percentage) < 5
      );

      if (levelWarningSent) {
        return;
      }

      // Зберігаємо інформацію про відправлене попередження
      ticket.slaWarningsSent.push({
        percentage: warningLevel.percentage,
        sentAt: new Date(),
        notifiedUsers: warningLevel.notifyUsers || []
      });

      ticket.slaWarningSent = true;
      await ticket.save();

      // Тут можна додати логіку відправки сповіщень через Telegram/Email
      logger.info(`SLA warning sent for ticket ${ticket.ticketNumber} at ${percentage}%`);

      return {
        warningLevel: warningLevel.percentage,
        notifiedUsers: warningLevel.notifyUsers || []
      };
    } catch (error) {
      logger.error('Error sending SLA warning:', error);
      throw error;
    }
  }

  /**
   * Автоматична ескалація тикету
   * @param {Object} ticket - Тикет
   * @param {Number} percentage - Відсоток використання часу
   * @param {Object} slaPolicy - SLA політика
   * @param {String} breachType - Тип порушення ('response' або 'resolution')
   */
  async escalateTicket(ticket, percentage, slaPolicy, breachType = 'resolution') {
    try {
      if (!slaPolicy || !slaPolicy.autoEscalation || !slaPolicy.autoEscalation.enabled) {
        return null;
      }

      // Перевіряємо умови ескалації
      if (breachType === 'response' && !slaPolicy.autoEscalation.onResponseBreach) {
        return null;
      }

      if (breachType === 'resolution' && !slaPolicy.autoEscalation.onResolutionBreach) {
        return null;
      }

      // Знаходимо рівень ескалації
      const escalationLevel = slaPolicy.getEscalationLevel(percentage);

      if (!escalationLevel) {
        return null;
      }

      // Перевіряємо, чи вже відбулася ескалація на цей рівень
      const alreadyEscalated = ticket.escalationHistory.some(
        e => e.level === escalationLevel.level && e.percentage === Math.floor(percentage)
      );

      if (alreadyEscalated) {
        return null;
      }

      // Оновлюємо інформацію про ескалацію
      ticket.escalation.level = escalationLevel.level;
      ticket.escalation.escalatedAt = new Date();
      ticket.escalation.isEscalated = true;
      ticket.escalation.reason = `Автоматична ескалація на рівень ${escalationLevel.level} (${percentage}% використано)`;

      // Додаємо до історії ескалацій
      ticket.escalationHistory.push({
        level: escalationLevel.level,
        escalatedAt: new Date(),
        escalatedBy: ticket.assignedTo || ticket.createdBy,
        escalatedTo: escalationLevel.assignTo || ticket.assignedTo,
        reason: ticket.escalation.reason,
        percentage: Math.floor(percentage),
        slaBreachType: breachType
      });

      // Оновлюємо метрики
      ticket.metrics.escalationCount += 1;

      // Призначаємо новому користувачу, якщо вказано
      if (escalationLevel.assignTo && escalationLevel.action === 'assign') {
        ticket.assignedTo = escalationLevel.assignTo;
        ticket.assignedAt = new Date();
      }

      await ticket.save();

      logger.info(`Ticket ${ticket.ticketNumber} escalated to level ${escalationLevel.level}`);

      return {
        level: escalationLevel.level,
        action: escalationLevel.action,
        assignedTo: escalationLevel.assignTo
      };
    } catch (error) {
      logger.error('Error escalating ticket:', error);
      throw error;
    }
  }

  /**
   * Оновити метрики SLA для тикету
   * @param {Object} ticket - Тикет
   */
  async updateSLAMetrics(ticket) {
    try {
      const now = new Date();
      const createdAt = ticket.createdAt || new Date();

      // Оновлюємо response time
      if (ticket.firstResponseAt) {
        const responseTime = (ticket.firstResponseAt - createdAt) / (1000 * 60 * 60); // години
        ticket.metrics.responseTime = responseTime;
      }

      // Оновлюємо resolution time
      if (ticket.resolvedAt || ticket.closedAt) {
        const resolvedAt = ticket.resolvedAt || ticket.closedAt;
        const resolutionTime = (resolvedAt - createdAt) / (1000 * 60 * 60); // години
        ticket.metrics.resolutionTime = resolutionTime;
      }

      await ticket.save();
    } catch (error) {
      logger.error('Error updating SLA metrics:', error);
      throw error;
    }
  }

  /**
   * Перевірити та обробити всі активні тикети на порушення SLA
   * @returns {Object} - Статистика обробки
   */
  async checkAllTickets() {
    try {
      const activeTickets = await Ticket.find({
        status: { $nin: ['closed', 'resolved', 'cancelled'] },
        isDeleted: false
      }).populate('slaPolicy');

      let breachesFound = 0;
      let warningsSent = 0;
      let escalationsPerformed = 0;

      for (const ticket of activeTickets) {
        const breachCheck = await this.checkSLABreach(ticket);
        const slaPolicy = ticket.slaPolicy || await SLAPolicy.getDefaultPolicy();

        if (breachCheck.isBreached) {
          breachesFound++;

          // Відправляємо попередження
          if (slaPolicy) {
            await this.sendSLAWarning(ticket, breachCheck.percentage, slaPolicy);
            warningsSent++;
          }

          // Виконуємо ескалацію
          if (slaPolicy) {
            const escalation = await this.escalateTicket(
              ticket,
              breachCheck.percentage,
              slaPolicy,
              breachCheck.breachType
            );
            if (escalation) {
              escalationsPerformed++;
            }

            // Оновлюємо дату порушення
            if (!ticket.slaBreachAt) {
              ticket.slaBreachAt = new Date();
              await ticket.save();
            }
          }
        } else if (breachCheck.percentage > 0 && slaPolicy) {
          // Відправляємо попередження, якщо досягнуто певного відсотка
          await this.sendSLAWarning(ticket, breachCheck.percentage, slaPolicy);
        }

        // Оновлюємо метрики
        await this.updateSLAMetrics(ticket);
      }

      return {
        ticketsChecked: activeTickets.length,
        breachesFound,
        warningsSent,
        escalationsPerformed
      };
    } catch (error) {
      logger.error('Error checking all tickets:', error);
      throw error;
    }
  }
}

module.exports = new SLAService();

