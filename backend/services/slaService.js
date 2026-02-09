const Ticket = require('../models/Ticket');
const businessHoursService = require('./businessHoursService');
const logger = require('../utils/logger');

/**
 * Сервіс для управління SLA з урахуванням робочих годин та пауз
 */
class SLAService {
    /**
     * Розрахунок SLA deadline з урахуванням робочих годин
     * @param {Date} startTime - Час початку SLA
     * @param {number} slaHours - Кількість годин SLA
     * @param {boolean} useBusinessHours - Використовувати робочі години
     * @returns {Date} Deadline
     */
    calculateDeadline(startTime, slaHours, useBusinessHours = true) {
        if (!useBusinessHours) {
            // Звичайний розрахунок (24/7)
            const deadline = new Date(startTime);
            deadline.setHours(deadline.getHours() + slaHours);
            return deadline;
        }

        // Розрахунок з урахуванням робочих годин
        return businessHoursService.addWorkingHours(startTime, slaHours);
    }

    /**
     * Розрахунок залишкових годин SLA
     * @param {Date} startTime - Час початку SLA
     * @param {Date} deadline - Deadline SLA
     * @param {boolean} useBusinessHours - Використовувати робочі години
     * @returns {number} Залишкові години
     */
    calculateRemainingHours(startTime, deadline, useBusinessHours = true) {
        const now = new Date();

        if (now >= deadline) {
            return 0; // SLA breached
        }

        if (!useBusinessHours) {
            // Звичайний розрахунок
            return (deadline - now) / (1000 * 60 * 60);
        }

        // Розрахунок з урахуванням робочих годин
        return businessHoursService.calculateWorkingHours(now, deadline);
    }

    /**
     * Пауза SLA (наприклад, при очікуванні відповіді користувача)
     * @param {string} ticketId - ID тікету
     * @param {string} reason - Причина паузи
     * @returns {Object} Результат
     */
    async pauseSLA(ticketId, reason = 'Очікування відповіді користувача') {
        try {
            const ticket = await Ticket.findById(ticketId);

            if (!ticket) {
                throw new Error('Тікет не знайдено');
            }

            if (!ticket.sla || !ticket.sla.startTime) {
                throw new Error('SLA не налаштовано для цього тікету');
            }

            // Перевіряємо чи вже на паузі
            if (ticket.sla.isPaused) {
                return {
                    success: false,
                    message: 'SLA вже на паузі'
                };
            }

            // Зберігаємо поточний стан
            ticket.sla.isPaused = true;
            ticket.sla.pausedAt = new Date();
            ticket.sla.pauseReason = reason;

            // Розраховуємо скільки часу вже пройшло
            const useBusinessHours = process.env.USE_BUSINESS_HOURS === 'true';
            const elapsedHours = useBusinessHours
                ? businessHoursService.calculateWorkingHours(ticket.sla.startTime, new Date())
                : (new Date() - ticket.sla.startTime) / (1000 * 60 * 60);

            ticket.sla.elapsedHoursBeforePause = elapsedHours;

            await ticket.save();

            logger.info(`⏸️ SLA на паузі для тікету ${ticket.ticketNumber}: ${reason}`);

            return {
                success: true,
                message: 'SLA поставлено на паузу',
                pausedAt: ticket.sla.pausedAt,
                elapsedHours: Math.round(elapsedHours * 100) / 100
            };
        } catch (error) {
            logger.error('Помилка паузи SLA:', error);
            throw error;
        }
    }

    /**
     * Відновлення SLA після паузи
     * @param {string} ticketId - ID тікету
     * @returns {Object} Результат
     */
    async resumeSLA(ticketId) {
        try {
            const ticket = await Ticket.findById(ticketId);

            if (!ticket) {
                throw new Error('Тікет не знайдено');
            }

            if (!ticket.sla || !ticket.sla.isPaused) {
                return {
                    success: false,
                    message: 'SLA не на паузі'
                };
            }

            const pauseDuration = (new Date() - ticket.sla.pausedAt) / (1000 * 60 * 60);

            // Відновлюємо SLA
            ticket.sla.isPaused = false;
            const resumedAt = new Date();

            // Перераховуємо deadline з урахуванням часу паузи
            const useBusinessHours = process.env.USE_BUSINESS_HOURS === 'true';
            const remainingHours = ticket.sla.hours - (ticket.sla.elapsedHoursBeforePause || 0);

            ticket.sla.deadline = this.calculateDeadline(
                resumedAt,
                remainingHours,
                useBusinessHours
            );

            // Зберігаємо історію пауз
            if (!ticket.sla.pauseHistory) {
                ticket.sla.pauseHistory = [];
            }

            ticket.sla.pauseHistory.push({
                pausedAt: ticket.sla.pausedAt,
                resumedAt,
                duration: Math.round(pauseDuration * 100) / 100,
                reason: ticket.sla.pauseReason
            });

            // Очищаємо тимчасові поля
            ticket.sla.pausedAt = null;
            ticket.sla.pauseReason = null;
            ticket.sla.elapsedHoursBeforePause = null;

            await ticket.save();

            logger.info(`▶️ SLA відновлено для тікету ${ticket.ticketNumber} (пауза: ${Math.round(pauseDuration * 100) / 100}h)`);

            return {
                success: true,
                message: 'SLA відновлено',
                resumedAt,
                pauseDuration: Math.round(pauseDuration * 100) / 100,
                newDeadline: ticket.sla.deadline
            };
        } catch (error) {
            logger.error('Помилка відновлення SLA:', error);
            throw error;
        }
    }

    /**
     * Оновлення SLA статусу з урахуванням робочих годин та пауз
     * @param {Object} ticket - Об'єкт тікету
     * @returns {Object} Оновлений SLA статус
     */
    async updateSLAStatus(ticket) {
        try {
            if (!ticket.sla || !ticket.sla.startTime || !ticket.sla.deadline) {
                return null;
            }

            // Якщо SLA на паузі - не оновлюємо статус
            if (ticket.sla.isPaused) {
                return {
                    status: 'paused',
                    remainingHours: null
                };
            }

            const useBusinessHours = process.env.USE_BUSINESS_HOURS === 'true';
            const remainingHours = this.calculateRemainingHours(
                ticket.sla.startTime,
                ticket.sla.deadline,
                useBusinessHours
            );

            ticket.sla.remainingHours = Math.round(remainingHours * 100) / 100;

            // Визначення статусу
            if (remainingHours <= 0) {
                ticket.sla.status = 'breached';
            } else if (remainingHours <= ticket.sla.hours * 0.2) {
                // Менше 20% часу залишилось
                ticket.sla.status = 'at_risk';
            } else {
                ticket.sla.status = 'on_time';
            }

            return {
                status: ticket.sla.status,
                remainingHours: ticket.sla.remainingHours
            };
        } catch (error) {
            logger.error('Помилка оновлення SLA статусу:', error);
            throw error;
        }
    }

    /**
     * Багаторівнева SLA матриця
     * @param {string} priority - Пріоритет тікету
     * @param {string} category - Категорія тікету
     * @returns {number} SLA години
     */
    getSLAHours(priority, category) {
        // Матриця SLA (години)
        const slaMatrix = {
            urgent: {
                Hardware: 2,
                Software: 4,
                Network: 2,
                Access: 1,
                Other: 4
            },
            high: {
                Hardware: 8,
                Software: 12,
                Network: 8,
                Access: 4,
                Other: 12
            },
            medium: {
                Hardware: 24,
                Software: 48,
                Network: 24,
                Access: 12,
                Other: 48
            },
            low: {
                Hardware: 72,
                Software: 120,
                Network: 72,
                Access: 48,
                Other: 120
            }
        };

        return slaMatrix[priority]?.[category] || 48; // За замовчуванням 48 годин
    }
}

module.exports = new SLAService();
