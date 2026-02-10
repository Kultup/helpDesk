const logger = require('../utils/logger');

/**
 * Збирач метрик для моніторингу якості AI відповідей та роботи бота
 */
class MetricsCollector {
    constructor() {
        this.metrics = {
            aiResponsesTotal: 0,
            quickSolutionSuccess: { helpful: 0, notHelpful: 0 },
            emotionalTones: { calm: 0, frustrated: 0, urgent: 0, confused: 0 },
            ticketCreationTimes: [],
            validationFailures: {
                quickSolution: 0,
                nextQuestion: 0,
                ticketSummary: 0
            },
            aiErrors: 0,
            ticketsCreated: {
                aiMode: 0,
                classicMode: 0
            }
        };

        // Скидати метрики щодня о 00:00
        this.startDailyReset();
    }

    /**
     * Записати AI відповідь
     * @param {Object} response - Відповідь від AI
     */
    recordAIResponse(response) {
        this.metrics.aiResponsesTotal++;

        if (response.emotionalTone) {
            const tone = response.emotionalTone.toLowerCase();
            if (this.metrics.emotionalTones[tone] !== undefined) {
                this.metrics.emotionalTones[tone]++;
            }
        }
    }

    /**
     * Записати результат швидкого рішення
     * @param {boolean} wasHelpful - Чи допомогло швидке рішення
     */
    recordQuickSolutionOutcome(wasHelpful) {
        if (wasHelpful) {
            this.metrics.quickSolutionSuccess.helpful++;
        } else {
            this.metrics.quickSolutionSuccess.notHelpful++;
        }

        // Логуємо якщо success rate падає
        const { helpful, notHelpful } = this.metrics.quickSolutionSuccess;
        const total = helpful + notHelpful;

        if (total >= 10) { // Після 10 випадків
            const successRate = helpful / total;
            if (successRate < 0.6) {
                logger.warn('⚠️ Low quick solution success rate', {
                    successRate: (successRate * 100).toFixed(1) + '%',
                    helpful,
                    notHelpful
                });
            }
        }
    }

    /**
     * Записати час створення тікета
     * @param {number} milliseconds - Час в мілісекундах
     * @param {string} mode - Режим створення ('ai' або 'classic')
     */
    recordTicketCreationTime(milliseconds, mode = 'classic') {
        this.metrics.ticketCreationTimes.push(milliseconds);

        // Зберігаємо тільки останні 100
        if (this.metrics.ticketCreationTimes.length > 100) {
            this.metrics.ticketCreationTimes.shift();
        }

        // Лічильник тікетів за режимом
        if (mode === 'ai') {
            this.metrics.ticketsCreated.aiMode++;
        } else {
            this.metrics.ticketsCreated.classicMode++;
        }
    }

    /**
     * Записати помилку валідації
     * @param {string} type - Тип валідації: 'quickSolution' | 'nextQuestion' | 'ticketSummary'
     * @param {string} reason - Причина помилки
     */
    recordValidationFailure(type, reason) {
        if (this.metrics.validationFailures[type] !== undefined) {
            this.metrics.validationFailures[type]++;
        }

        logger.warn('🔍 AI response validation failed', { type, reason });

        // Якщо занадто багато помилок валідації
        const totalFailures = Object.values(this.metrics.validationFailures).reduce((a, b) => a + b, 0);
        if (totalFailures > 0 && totalFailures % 10 === 0) {
            logger.warn('⚠️ High validation failure count', {
                total: totalFailures,
                breakdown: this.metrics.validationFailures
            });
        }
    }

    /**
     * Записати помилку AI сервісу
     * @param {Error} error - Об'єкт помилки
     * @param {string} context - Контекст помилки
     */
    recordAIError(error, context = '') {
        this.metrics.aiErrors++;
        logger.error('❌ AI Service Error', {
            message: error.message,
            context,
            totalErrors: this.metrics.aiErrors
        });
    }

    /**
     * Отримати поточну статистику
     * @returns {Object} Статистика
     */
    getStats() {
        const { helpful, notHelpful } = this.metrics.quickSolutionSuccess;
        const total = helpful + notHelpful;

        const totalTickets = this.metrics.ticketsCreated.aiMode + this.metrics.ticketsCreated.classicMode;
        const aiModePercentage = totalTickets > 0
            ? ((this.metrics.ticketsCreated.aiMode / totalTickets) * 100).toFixed(1) + '%'
            : 'N/A';

        return {
            aiResponsesTotal: this.metrics.aiResponsesTotal,
            quickSolutionSuccessRate: total > 0
                ? ((helpful / total) * 100).toFixed(1) + '%'
                : 'N/A',
            quickSolutionStats: {
                helpful,
                notHelpful,
                total
            },
            emotionalToneDistribution: this.metrics.emotionalTones,
            averageTicketCreationTime: this.calculateAverage(
                this.metrics.ticketCreationTimes
            ),
            validationFailures: this.metrics.validationFailures,
            totalValidationFailures: Object.values(this.metrics.validationFailures).reduce((a, b) => a + b, 0),
            aiErrors: this.metrics.aiErrors,
            ticketsCreated: {
                ...this.metrics.ticketsCreated,
                total: totalTickets,
                aiModePercentage
            }
        };
    }

    /**
     * Обчислити середнє значення масиву
     * @param {Array<number>} arr - Масив чисел
     * @returns {string} Середнє значення з одиницями
     */
    calculateAverage(arr) {
        if (arr.length === 0) return '0ms';
        const sum = arr.reduce((a, b) => a + b, 0);
        return (sum / arr.length).toFixed(0) + 'ms';
    }

    /**
     * Отримати детальний звіт
     * @returns {string} Форматований звіт
     */
    getDetailedReport() {
        const stats = this.getStats();

        return `
📊 AI Bot Metrics Report
========================

🤖 AI Responses: ${stats.aiResponsesTotal}
✅ Quick Solution Success Rate: ${stats.quickSolutionSuccessRate}
   - Helpful: ${stats.quickSolutionStats.helpful}
   - Not Helpful: ${stats.quickSolutionStats.notHelpful}

😊 Emotional Tone Distribution:
   - Calm: ${stats.emotionalToneDistribution.calm}
   - Frustrated: ${stats.emotionalToneDistribution.frustrated}
   - Urgent: ${stats.emotionalToneDistribution.urgent}
   - Confused: ${stats.emotionalToneDistribution.confused}

🎫 Tickets Created: ${stats.ticketsCreated.total}
   - AI Mode: ${stats.ticketsCreated.aiMode} (${stats.ticketsCreated.aiModePercentage})
   - Classic Mode: ${stats.ticketsCreated.classicMode}
   - Avg Creation Time: ${stats.averageTicketCreationTime}

⚠️ Validation Failures: ${stats.totalValidationFailures}
   - Quick Solution: ${stats.validationFailures.quickSolution}
   - Next Question: ${stats.validationFailures.nextQuestion}
   - Ticket Summary: ${stats.validationFailures.ticketSummary}

❌ AI Errors: ${stats.aiErrors}
========================
    `.trim();
    }

    /**
     * Запустити щоденний reset метрик
     */
    startDailyReset() {
        // Обчислити час до наступної півночі
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const msUntilMidnight = tomorrow - now;

        // Перший reset о півночі
        setTimeout(() => {
            this.performDailyReset();

            // Потім кожні 24 години
            setInterval(() => {
                this.performDailyReset();
            }, 86400000); // 24 години
        }, msUntilMidnight);

        logger.info('📊 Metrics collector initialized. Next reset in ' +
            Math.round(msUntilMidnight / 1000 / 60) + ' minutes');
    }

    /**
     * Виконати щоденний reset
     */
    performDailyReset() {
        const report = this.getDetailedReport();
        logger.info('📊 Daily metrics report:\n' + report);

        // Скинути метрики
        this.resetMetrics();

        logger.info('🔄 Metrics reset completed');
    }

    /**
     * Скинути всі метрики
     */
    resetMetrics() {
        this.metrics = {
            aiResponsesTotal: 0,
            quickSolutionSuccess: { helpful: 0, notHelpful: 0 },
            emotionalTones: { calm: 0, frustrated: 0, urgent: 0, confused: 0 },
            ticketCreationTimes: [],
            validationFailures: {
                quickSolution: 0,
                nextQuestion: 0,
                ticketSummary: 0
            },
            aiErrors: 0,
            ticketsCreated: {
                aiMode: 0,
                classicMode: 0
            }
        };
    }
}

// Singleton instance
module.exports = new MetricsCollector();
