const SLAPolicy = require('../models/SLAPolicy');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Category = require('../models/Category');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

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
      // Використовуємо aggregation для обходу валідації Mongoose при завантаженні
      // Це дозволяє отримати всі тікети навіть з невалідними даними
      const activeTicketsRaw = await Ticket.aggregate([
        {
          $match: {
            status: { $nin: ['closed', 'resolved', 'cancelled'] },
            isDeleted: false
          }
        },
        {
          $lookup: {
            from: 'slapolicies',
            localField: 'slaPolicy',
            foreignField: '_id',
            as: 'slaPolicy'
          }
        },
        {
          $unwind: {
            path: '$slaPolicy',
            preserveNullAndEmptyArrays: true
          }
        }
      ]);

      let breachesFound = 0;
      let warningsSent = 0;
      let escalationsPerformed = 0;
      let errorsCount = 0;
      let skippedCount = 0;
      let fixedCount = 0;

      for (const ticketData of activeTicketsRaw) {
        const ticketId = ticketData._id;
        try {
          // Перевіряємо чи category валідний (має бути ObjectId)
          let categoryId = ticketData.category;
          let categoryIsValid = false;

          if (categoryId) {
            // Якщо category є рядком (наприклад "technical"), спробуємо знайти Category за назвою
            if (typeof categoryId === 'string') {
              if (mongoose.Types.ObjectId.isValid(categoryId)) {
                // Якщо це валідний ObjectId рядок, конвертуємо
                categoryId = new mongoose.Types.ObjectId(categoryId);
                categoryIsValid = true;
              } else {
                // Якщо це назва категорії (наприклад "technical"), шукаємо Category
                const categoryName = categoryId;
                logger.warn(`Ticket ${ticketId} has category as string "${categoryName}", attempting to convert...`);
                try {
                  const category = await Category.findOne({ 
                    name: new RegExp(`^${categoryName}$`, 'i') 
                  });
                  if (category) {
                    categoryId = category._id;
                    categoryIsValid = true;
                    // Оновлюємо тікет з правильним category ObjectId
                    await Ticket.collection.updateOne(
                      { _id: new mongoose.Types.ObjectId(ticketId) },
                      { $set: { category: categoryId } },
                      { bypassDocumentValidation: true }
                    );
                    logger.info(`Fixed category for ticket ${ticketId}: "${categoryName}" -> ${category._id}`);
                    fixedCount++;
                  } else {
                    logger.warn(`Category "${categoryName}" not found for ticket ${ticketId}`);
                    categoryIsValid = false;
                  }
                } catch (categoryError) {
                  logger.error(`Error finding category "${categoryName}" for ticket ${ticketId}:`, categoryError);
                  categoryIsValid = false;
                }
              }
            } else if (categoryId instanceof mongoose.Types.ObjectId || mongoose.Types.ObjectId.isValid(categoryId)) {
              // Якщо це вже ObjectId
              categoryIsValid = true;
            }
          }

          if (!categoryIsValid || !categoryId) {
            logger.warn(`Skipping ticket ${ticketId}: invalid or missing category (${ticketData.category})`);
            skippedCount++;
            continue;
          }

          // Перевіряємо чи statusHistory має невалідні записи
          let hasInvalidHistory = false;
          if (ticketData.statusHistory && Array.isArray(ticketData.statusHistory)) {
            hasInvalidHistory = ticketData.statusHistory.some(
              entry => !entry || !entry.changedBy || !entry.status
            );
            
            if (hasInvalidHistory) {
              logger.warn(`Ticket ${ticketId} has invalid statusHistory entries, attempting to fix...`);
              try {
                // Використовуємо прямі MongoDB операції для виправлення
                const statusHistoryFixed = ticketData.statusHistory.filter(
                  entry => entry && entry.changedBy && entry.status
                );
                
                // Якщо немає валідних записів, додаємо початковий запис
                if (statusHistoryFixed.length === 0 && ticketData.status && ticketData.createdBy) {
                  // Перевіряємо чи createdBy є валідним ObjectId
                  let createdById = ticketData.createdBy;
                  
                  // Конвертуємо рядок в ObjectId якщо валідний
                  if (typeof createdById === 'string') {
                    if (mongoose.Types.ObjectId.isValid(createdById)) {
                      createdById = new mongoose.Types.ObjectId(createdById);
                    } else {
                      // Невалідний рядок, не додаємо запис
                      logger.warn(`Cannot create statusHistory entry for ticket ${ticketId}: invalid createdBy string "${createdById}"`);
                    }
                  }
                  
                  // Перевіряємо чи createdById є валідним ObjectId
                  if (createdById instanceof mongoose.Types.ObjectId || mongoose.Types.ObjectId.isValid(createdById)) {
                    if (!(createdById instanceof mongoose.Types.ObjectId)) {
                      createdById = new mongoose.Types.ObjectId(createdById);
                    }
                    statusHistoryFixed.push({
                      status: ticketData.status,
                      changedBy: createdById,
                      changedAt: ticketData.createdAt || new Date()
                    });
                  } else {
                    logger.warn(`Cannot create statusHistory entry for ticket ${ticketId}: createdBy is not a valid ObjectId (${ticketData.createdBy})`);
                  }
                }
                
                // Оновлюємо тікет без валідації
                await Ticket.collection.updateOne(
                  { _id: new mongoose.Types.ObjectId(ticketId) },
                  { $set: { statusHistory: statusHistoryFixed } },
                  { bypassDocumentValidation: true }
                );
                
                logger.info(`Fixed statusHistory for ticket ${ticketId}`);
                fixedCount++;
              } catch (fixError) {
                logger.error(`Failed to fix ticket ${ticketId}:`, fixError);
                skippedCount++;
                continue;
              }
            }
          }

          // Спробуємо завантажити тікет через Mongoose (може викинути помилку валідації)
          let ticket;
          try {
            ticket = await Ticket.findById(ticketId).populate('slaPolicy');
          } catch (loadError) {
            // Якщо не вдалося завантажити через валідацію, пропускаємо
            logger.warn(`Cannot load ticket ${ticketId} due to validation error:`, loadError.message);
            skippedCount++;
            continue;
          }

          if (!ticket) {
            skippedCount++;
            continue;
          }

          // Перевіряємо чи тікет все ще валідний
          // category має бути ObjectId або об'єктом (якщо populate)
          if (!ticket.category || 
              (typeof ticket.category === 'string' && !mongoose.Types.ObjectId.isValid(ticket.category))) {
            logger.warn(`Skipping ticket ${ticketId}: category is still invalid after load (${ticket.category})`);
            skippedCount++;
            continue;
          }

          // Обробляємо тікет
          const breachCheck = await this.checkSLABreach(ticket);
          const slaPolicy = ticket.slaPolicy || await SLAPolicy.getDefaultPolicy();

          if (breachCheck.isBreached) {
            breachesFound++;

            // Відправляємо попередження
            if (slaPolicy) {
              try {
                await this.sendSLAWarning(ticket, breachCheck.percentage, slaPolicy);
                warningsSent++;
              } catch (warningError) {
                logger.error(`Error sending SLA warning for ticket ${ticketId}:`, warningError);
              }
            }

            // Виконуємо ескалацію
            if (slaPolicy) {
              try {
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
              } catch (escalationError) {
                logger.error(`Error escalating ticket ${ticketId}:`, escalationError);
              }
            }
          } else if (breachCheck.percentage > 0 && slaPolicy) {
            // Відправляємо попередження, якщо досягнуто певного відсотка
            try {
              await this.sendSLAWarning(ticket, breachCheck.percentage, slaPolicy);
            } catch (warningError) {
              logger.error(`Error sending SLA warning for ticket ${ticketId}:`, warningError);
            }
          }

          // Оновлюємо метрики
          try {
            await this.updateSLAMetrics(ticket);
          } catch (metricsError) {
            logger.error(`Error updating SLA metrics for ticket ${ticketId}:`, metricsError);
          }
        } catch (ticketError) {
          errorsCount++;
          logger.error(`Error processing ticket ${ticketId}:`, ticketError);
          // Продовжуємо обробку інших тікетів
          continue;
        }
      }

      logger.info(`SLA check completed: ${activeTicketsRaw.length} tickets checked, ${fixedCount} fixed, ${skippedCount} skipped, ${errorsCount} errors`);

      return {
        ticketsChecked: activeTicketsRaw.length,
        breachesFound,
        warningsSent,
        escalationsPerformed,
        errorsCount,
        skippedCount,
        fixedCount
      };
    } catch (error) {
      logger.error('Error checking all tickets:', error);
      throw error;
    }
  }
}

module.exports = new SLAService();

