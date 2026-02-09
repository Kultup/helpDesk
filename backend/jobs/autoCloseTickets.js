const Ticket = require('../models/Ticket');
const logger = require('../utils/logger');

/**
 * Cron job для автоматичного закриття тікетів
 * які знаходяться в статусі 'resolved' більше N днів
 */
async function autoCloseResolvedTickets() {
    try {
        logger.info('🔄 Початок автоматичного закриття resolved тікетів...');

        // Налаштування: скільки днів тікет має бути в статусі resolved
        const DAYS_BEFORE_AUTO_CLOSE = parseInt(process.env.AUTO_CLOSE_DAYS) || 7;

        // Розрахунок дати
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - DAYS_BEFORE_AUTO_CLOSE);

        // Знаходимо тікети для автозакриття
        const ticketsToClose = await Ticket.find({
            status: 'resolved',
            resolvedAt: { $lt: cutoffDate },
            isDeleted: false
        }).populate('createdBy', 'firstName lastName email telegramId');

        logger.info(`📊 Знайдено ${ticketsToClose.length} тікетів для автозакриття`);

        if (ticketsToClose.length === 0) {
            logger.info('✅ Немає тікетів для автозакриття');
            return { closed: 0 };
        }

        let closedCount = 0;
        const errors = [];

        for (const ticket of ticketsToClose) {
            try {
                // Змінюємо статус на closed
                ticket.status = 'closed';
                ticket.closedAt = new Date();

                // Додаємо системний коментар
                ticket.comments.push({
                    author: ticket.createdBy._id, // Від імені користувача
                    content: `🤖 Тікет автоматично закрито через ${DAYS_BEFORE_AUTO_CLOSE} днів після вирішення.\n\nЯкщо проблема повернулася - створіть новий тікет.`,
                    isInternal: false,
                    createdAt: new Date()
                });

                await ticket.save();
                closedCount++;

                // Сповіщення користувачу (опціонально)
                if (process.env.NOTIFY_AUTO_CLOSE === 'true') {
                    try {
                        const telegramService = require('../services/telegramServiceInstance');
                        if (ticket.createdBy?.telegramId) {
                            await telegramService.sendMessage(
                                ticket.createdBy.telegramId,
                                `🔒 *Тікет автоматично закрито*\n\n` +
                                `📋 ${ticket.title}\n` +
                                `🆔 \`${ticket._id}\`\n\n` +
                                `Тікет був у статусі "Вирішено" більше ${DAYS_BEFORE_AUTO_CLOSE} днів.\n` +
                                `Якщо проблема повернулася - створіть новий тікет.`,
                                { parse_mode: 'Markdown' }
                            );
                        }
                    } catch (notifyError) {
                        logger.warn(`⚠️ Не вдалося відправити сповіщення для тікету ${ticket._id}:`, notifyError.message);
                    }
                }

                logger.info(`✅ Автозакрито тікет: ${ticket.ticketNumber} (${ticket.title})`);
            } catch (error) {
                errors.push({ ticketId: ticket._id, error: error.message });
                logger.error(`❌ Помилка автозакриття тікету ${ticket._id}:`, error);
            }
        }

        logger.info(`✅ Автозакриття завершено: ${closedCount} тікетів закрито`);

        if (errors.length > 0) {
            logger.warn(`⚠️ Помилки при автозакритті ${errors.length} тікетів:`, errors);
        }

        return {
            closed: closedCount,
            errors: errors.length,
            total: ticketsToClose.length
        };
    } catch (error) {
        logger.error('❌ Критична помилка автозакриття тікетів:', error);
        throw error;
    }
}

/**
 * Налаштування cron job для автозакриття
 * Запускається щодня о 02:00
 */
function setupAutoCloseJob() {
    const cron = require('node-cron');

    // Щодня о 02:00
    cron.schedule('0 2 * * *', async () => {
        try {
            logger.info('⏰ Запуск планового автозакриття тікетів...');
            await autoCloseResolvedTickets();
        } catch (error) {
            logger.error('❌ Помилка виконання auto-close job:', error);
        }
    });

    logger.info('✅ Auto-close job налаштовано (щодня о 02:00)');
}

module.exports = {
    autoCloseResolvedTickets,
    setupAutoCloseJob
};
