const logger = require('../utils/logger');
const TelegramUtils = require('./telegramUtils');
const User = require('../models/User');
const Notification = require('../models/Notification');
const TelegramConfig = require('../models/TelegramConfig');
const PendingRegistration = require('../models/PendingRegistration');
const fcmService = require('./fcmService');

class TelegramNotificationService {
    constructor(telegramService) {
        this.telegramService = telegramService;
    }

    get bot() {
        return this.telegramService.bot;
    }

    get isInitialized() {
        return this.telegramService.isInitialized;
    }

    async sendMessage(chatId, text, options) {
        return this.telegramService.sendMessage(chatId, text, options);
    }

    /**
     * Відправка сповіщення користувачу через Telegram
     */
    async sendNotification(telegramId, notification) {
        try {
            if (!this.bot || !this.isInitialized) {
                logger.warn('Telegram бот не ініціалізований для відправки сповіщення');
                return;
            }

            if (!telegramId) {
                logger.warn('Telegram ID не вказано для відправки сповіщення');
                return;
            }

            const { title = '', message = '', type = 'notification' } = notification;

            let formattedMessage = '';
            if (title) {
                formattedMessage += `*${title}*\n\n`;
            }
            formattedMessage += message;

            await this.sendMessage(String(telegramId), formattedMessage, {
                parse_mode: 'Markdown'
            });

            logger.info(`✅ Сповіщення відправлено користувачу ${telegramId}`, {
                type,
                hasTitle: !!title
            });
        } catch (error) {
            logger.error(`Помилка відправки сповіщення користувачу ${telegramId}:`, error);
            throw error;
        }
    }

    /**
     * Відправити сповіщення про підтвердження реєстрації
     */
    async sendRegistrationApprovedNotification(user) {
        try {
            logger.info('sendRegistrationApprovedNotification called:', {
                userId: user._id,
                email: user.email,
                telegramId: user.telegramId,
                hasTelegramId: !!user.telegramId,
                botInitialized: this.isInitialized
            });

            if (!this.bot || !this.isInitialized) {
                logger.warn('Telegram бот не ініціалізований для відправки сповіщення про підтвердження реєстрації');
                return;
            }

            if (!user.telegramId) {
                logger.warn('Telegram ID не вказано для користувача:', {
                    email: user.email,
                    userId: user._id,
                    userData: {
                        firstName: user.firstName,
                        lastName: user.lastName,
                        telegramId: user.telegramId
                    }
                });
                return;
            }

            const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || user.login;
            const message =
                `✅ *Реєстрацію підтверджено!*\n\n` +
                `🎉 Вітаємо, ${userName}!\n\n` +
                `Ваш обліковий запис успішно активовано адміністратором.\n` +
                `Тепер ви можете використовувати всі функції Telegram бота.\n\n` +
                `💡 Надішліть /start або /menu для доступу до меню.`;

            await this.sendMessage(String(user.telegramId), message, { parse_mode: 'Markdown' });

            logger.info(`✅ Сповіщення про підтвердження реєстрації відправлено користувачу ${user.email} (${user.telegramId})`);
        } catch (error) {
            logger.error(`Помилка відправки сповіщення про підтвердження реєстрації користувачу ${user.email}:`, error);
            throw error;
        }
    }

    /**
     * Відправити сповіщення про відхилення реєстрації
     */
    async sendRegistrationRejectedNotification(user, reason = null) {
        try {
            logger.info('sendRegistrationRejectedNotification called:', {
                userId: user._id,
                email: user.email,
                telegramId: user.telegramId,
                hasTelegramId: !!user.telegramId,
                reason: reason,
                botInitialized: this.isInitialized
            });

            if (!this.bot || !this.isInitialized) {
                logger.warn('Telegram бот не ініціалізований для відправки сповіщення про відхилення реєстрації');
                return;
            }

            if (!user.telegramId) {
                logger.warn('Telegram ID не вказано для користувача:', {
                    email: user.email,
                    userId: user._id,
                    userData: {
                        firstName: user.firstName,
                        lastName: user.lastName,
                        telegramId: user.telegramId
                    }
                });
                return;
            }

            const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

            let message = `❌ *Реєстрацію відхилено*\n` +
                `👤 ${userName} | 📧 \`${user.email}\`\n`;

            if (reason && reason.trim()) {
                message += `📝 *Причина:* ${reason}\n`;
            }

            message += `\nЯкщо це помилка, зверніться: [@Kultup](https://t.me/Kultup)\n` +
                `Використайте /start для перегляду опцій.`;

            await this.sendMessage(String(user.telegramId), message, {
                parse_mode: 'Markdown'
            });

            logger.info(`✅ Сповіщення про відхилення реєстрації відправлено користувачу ${user.email} (${user.telegramId})`);
        } catch (error) {
            logger.error(`Помилка відправки сповіщення про відхилення реєстрації користувачу ${user.email}:`, error);
            throw error;
        }
    }

    /**
     * Відправка сповіщення користувачу про підтвердження посади
     */
    async notifyUserAboutPositionApproval(positionRequest, position) {
        try {
            if (!this.bot) {
                logger.warn('Telegram бот не ініціалізований для відправки сповіщення про підтвердження посади');
                return;
            }

            const chatId = positionRequest.telegramChatId || positionRequest.telegramId;
            if (!chatId) {
                logger.warn('Немає chatId для відправки сповіщення про підтвердження посади');
                return;
            }

            const message =
                `✅ *Посаду додано!*\n\n` +
                `💼 *Посада:* ${position.title}\n\n` +
                `Ваш запит на додавання посади було підтверджено.\n` +
                `Тепер ви можете продовжити реєстрацію.`;

            await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            logger.info('✅ Сповіщення про підтвердження посади відправлено користувачу', {
                chatId,
                positionId: position._id,
                requestId: positionRequest._id
            });
        } catch (error) {
            logger.error('❌ Помилка відправки сповіщення про підтвердження посади:', {
                error: error.message,
                stack: error.stack,
                positionRequestId: positionRequest?._id
            });
        }
    }

    /**
     * Відправка сповіщення користувачу про відхилення посади
     */
    async notifyUserAboutPositionRejection(positionRequest, reason) {
        try {
            if (!this.bot) {
                logger.warn('Telegram бот не ініціалізований для відправки сповіщення про відхилення посади');
                return;
            }

            const chatId = positionRequest.telegramChatId || positionRequest.telegramId;
            if (!chatId) {
                logger.warn('Немає chatId для відправки сповіщення про відхилення посади');
                return;
            }

            const userId = positionRequest.telegramId;

            let message =
                `❌ *Запит на посаду відхилено*\n\n` +
                `💼 *Посада:* ${TelegramUtils.escapeMarkdown(positionRequest.title)}\n\n`;

            if (reason) {
                message += `📝 *Причина:* ${TelegramUtils.escapeMarkdown(reason)}\n\n`;
            }

            await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });

            if (positionRequest.pendingRegistrationId && userId) {
                const pendingRegistration = await PendingRegistration.findById(positionRequest.pendingRegistrationId);

                if (pendingRegistration) {
                    pendingRegistration.step = 'position';
                    await pendingRegistration.save();

                    // Викликаємо метод головного сервісу для показу вибору посади
                    if (this.telegramService.sendPositionSelection) {
                        await this.telegramService.sendPositionSelection(chatId, userId, pendingRegistration);
                    } else {
                        logger.warn('sendPositionSelection not found in telegramService');
                    }

                    logger.info('✅ Показано список посад після відхилення запиту', {
                        chatId,
                        userId,
                        requestId: positionRequest._id,
                        pendingRegistrationId: pendingRegistration._id
                    });
                    return;
                }
            }

            message = `Будь ласка, оберіть іншу посаду зі списку або зверніться до адміністратора.`;
            await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });

            logger.info('✅ Сповіщення про відхилення посади відправлено користувачу', {
                chatId,
                requestId: positionRequest._id
            });
        } catch (error) {
            logger.error('❌ Помилка відправки сповіщення про відхилення посади:', {
                error: error.message,
                stack: error.stack,
                positionRequestId: positionRequest?._id
            });
        }
    }

    /**
     * Відправка сповіщення адмінам про новий запит на додавання посади
     */
    async notifyAdminsAboutPositionRequest(positionRequest, _pendingRegistration) {
        try {
            logger.info('🔔 Початок відправки сповіщення адмінам про запит на посаду', {
                requestId: positionRequest._id,
                telegramId: positionRequest.telegramId
            });

            const positionName = positionRequest.title;
            const telegramId = positionRequest.telegramId;
            const requestId = positionRequest._id.toString();

            try {
                const notificationData = {
                    title: '📝 Новий запит на посаду',
                    body: `Користувач просить додати посаду: ${positionName}`,
                    type: 'position_request',
                    data: {
                        requestId: requestId,
                        positionName: positionName,
                        telegramId: telegramId
                    }
                };

                await fcmService.sendToAdmins(notificationData);
                logger.info('✅ FCM сповіщення про запит на посаду відправлено адміністраторам');
            } catch (fcmError) {
                logger.error('❌ Помилка відправки FCM сповіщення про запит на посаду:', fcmError);
            }

            try {
                const admins = await User.find({
                    role: { $in: ['admin', 'super_admin', 'administrator'] },
                    isActive: true
                }).select('_id');

                if (admins.length > 0) {
                    const notifications = admins.map(admin => ({
                        recipient: admin._id,
                        userId: admin._id,
                        category: 'system',
                        type: 'system_update',
                        title: 'Новий запит на посаду',
                        message: `Користувач (Telegram ID: ${telegramId}) просить додати посаду: ${positionName}`,
                        priority: 'medium',
                        isRead: false,
                        read: false,
                        createdAt: new Date(),
                        channels: [{ type: 'web', status: 'pending' }],
                        metadata: {
                            requestId: requestId,
                            positionName: positionName,
                            telegramId: telegramId
                        }
                    }));

                    await Notification.insertMany(notifications);
                    logger.info(`✅ Створено ${notifications.length} сповіщень в БД про запит на посаду`);
                }
            } catch (dbError) {
                logger.error('❌ Помилка створення сповіщень в БД про запит на посаду:', dbError);
            }

            if (!this.bot) {
                logger.warn('Telegram бот не ініціалізований для відправки сповіщення про запит на посаду');
                return;
            }

            try {
                const admins = await User.find({
                    role: { $in: ['admin', 'super_admin', 'administrator'] },
                    isActive: true,
                    telegramId: { $exists: true, $ne: null }
                }).select('_id telegramId firstName lastName email');

                if (admins.length === 0) {
                    logger.warn('⚠️ Немає адміністраторів з Telegram ID для відправки сповіщень про запит на посаду');
                    return;
                }

                logger.info(`📤 Відправка сповіщення про запит на посаду ${admins.length} адміністраторам`);

                const message =
                    `📝 *Новий запит на додавання посади*\n\n` +
                    `💼 *Посада:* ${TelegramUtils.escapeMarkdown(positionName)}\n` +
                    `👤 *Telegram ID:* \`${telegramId}\`\n` +
                    `🆔 *ID запиту:* \`${requestId}\`\n\n` +
                    `Ви можете підтвердити або відхилити цей запит, використовуючи команди:\n` +
                    `/approve\\_position \\_${requestId}\n` +
                    `/reject\\_position \\_${requestId}`;

                for (const admin of admins) {
                    try {
                        await this.sendMessage(admin.telegramId, message, {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '✅ Підтвердити', callback_data: `approve_position_${requestId}` },
                                        { text: '❌ Відхилити', callback_data: `reject_position_${requestId}` }
                                    ]
                                ]
                            }
                        });
                    } catch (sendError) {
                        logger.error(`Помилка відправки адміну ${admin.email}:`, sendError.message);
                    }
                }
            } catch (error) {
                logger.error('❌ Помилка відправки повідомлень адмінам:', error);
            }
        } catch (error) {
            logger.error('❌ Помилка процесу сповіщення про запит на посаду:', error);
        }
    }

    /**
     * Відправка сповіщення про новий тікет в групу
     */
    async sendNewTicketNotificationToGroup(ticket, user) {
        try {
            logger.info('🔔 Початок відправки сповіщення про новий тікет в групу', {
                ticketId: ticket._id,
                userId: user?._id,
                userTelegramId: user?.telegramId,
                botInitialized: !!this.bot
            });

            if (!this.bot) {
                logger.warn('Telegram бот не ініціалізований для відправки сповіщення про новий тікет');
                return;
            }

            let groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
            if (!groupChatId) {
                try {
                    const telegramConfig = await TelegramConfig.findOne({ key: 'default' });
                    if (telegramConfig && telegramConfig.chatId && telegramConfig.chatId.trim()) {
                        groupChatId = telegramConfig.chatId.trim();
                        logger.info('✅ ChatId отримано з бази даних:', groupChatId);
                    }
                } catch (configError) {
                    logger.error('❌ Помилка отримання TelegramConfig:', configError.message);
                }
            }

            if (!groupChatId) {
                logger.warn('❌ TELEGRAM_GROUP_CHAT_ID не встановлено');
                return;
            }

            await ticket.populate([
                { path: 'createdBy', select: 'firstName lastName email login telegramId' },
                { path: 'city', select: 'name region' }
            ]);

            const message =
                `🎫 *Новий тікет створено*\n` +
                `📋 ${ticket.title}\n` +
                `🏙️ ${ticket.city?.name || 'Не вказано'} | 🆔 \`${ticket._id}\``;

            logger.info('📤 Відправка повідомлення в групу...', { groupChatId });

            try {
                await this.sendMessage(groupChatId, message, { parse_mode: 'Markdown' });
                logger.info('✅ Сповіщення про новий тікет відправлено в групу Telegram');
            } catch (sendError) {
                logger.error('❌ Помилка відправки повідомлення в групу:', sendError.message);
                if (sendError.message && sendError.message.includes('parse')) {
                    const plainMessage = message.replace(/\*/g, '').replace(/`/g, '');
                    await this.sendMessage(groupChatId, plainMessage);
                } else {
                    throw sendError;
                }
            }
        } catch (error) {
            logger.error('❌ Помилка відправки сповіщення про новий тікет в групу:', error);
        }
    }

    /**
     * Відправка сповіщення про зміну статусу тікету в групу
     */
    async sendTicketStatusNotificationToGroup(ticket, previousStatus, newStatus) {
        try {
            if (!this.bot) {
                logger.warn('Telegram бот не ініціалізований для відправки сповіщення про зміну статусу');
                return;
            }

            let groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
            if (!groupChatId) {
                try {
                    const telegramConfig = await TelegramConfig.findOne({ key: 'default' });
                    if (telegramConfig && telegramConfig.chatId && telegramConfig.chatId.trim()) {
                        groupChatId = telegramConfig.chatId.trim();
                    }
                } catch (configError) {
                    logger.error('❌ Помилка отримання TelegramConfig:', configError);
                }
            }

            if (!groupChatId) return;

            await ticket.populate([
                { path: 'city', select: 'name region' }
            ]);

            if (newStatus === 'closed' || newStatus === 'resolved') {
                const message =
                    `🎫 *Тікет виконаний*\n` +
                    `📋 ${ticket.title}\n` +
                    `🏙️ ${ticket.city?.name || 'Не вказано'} | 🆔 \`${ticket._id}\``;

                await this.sendMessage(groupChatId, message, { parse_mode: 'Markdown' });
                logger.info('✅ Сповіщення про закриття тікету відправлено в групу Telegram');
            }
        } catch (error) {
            logger.error('Помилка відправки сповіщення про зміну статусу тікету в групу:', error);
        }
    }

    /**
     * Відправка сповіщення користувачу про зміну статусу тікету
     */
    async sendTicketNotification(ticket, type) {
        try {
            if (!this.bot) {
                logger.warn('Telegram бот не ініціалізований для відправки сповіщення користувачу');
                return;
            }

            await ticket.populate([
                { path: 'createdBy', select: 'firstName lastName email telegramId telegramChatId' }
            ]);

            const user = ticket.createdBy;
            if (!user) return;

            const chatId = user.telegramChatId ? String(user.telegramChatId) : (user.telegramId ? String(user.telegramId) : null);
            if (!chatId) return;

            const statusText = TelegramUtils.getStatusText(ticket.status);
            const statusEmoji = TelegramUtils.getStatusEmoji(ticket.status);

            let message = '';
            if (type === 'updated') {
                message =
                    `🔄 *Статус тікету змінено*\n` +
                    `📋 ${ticket.title}\n` +
                    `🆔 \`${ticket._id}\`\n` +
                    `\n${statusEmoji} *${statusText}*\n` +
                    `⚡ ${TelegramUtils.getPriorityText(ticket.priority)}`;
            }

            if (message) {
                await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });
                logger.info(`✅ Сповіщення про зміну статусу тікету відправлено користувачу ${user.email}`);
            }
        } catch (error) {
            logger.error('Помилка відправки сповіщення користувачу про зміну статусу тікету:', error);
        }
    }

    /**
     * Відправка SLA сповіщення користувачу про очікуваний час виконання
     */
    async sendSLANotification(ticket) {
        try {
            if (!this.bot) {
                logger.warn('Telegram бот не ініціалізований для відправки SLA сповіщення');
                return;
            }

            // Перевіряємо наявність SLA інформації
            if (!ticket.sla || !ticket.sla.hours || !ticket.sla.deadline) {
                logger.warn(`SLA не встановлено для тікету ${ticket._id}`);
                return;
            }

            // Перевіряємо наявність користувача
            await ticket.populate([
                { path: 'createdBy', select: 'firstName lastName email telegramId telegramChatId' }
            ]);

            const user = ticket.createdBy;
            if (!user) {
                logger.warn('Користувач не знайдений для SLA сповіщення');
                return;
            }

            // Отримуємо chatId
            const chatId = user.telegramChatId ? String(user.telegramChatId) : (user.telegramId ? String(user.telegramId) : null);
            if (!chatId) {
                logger.warn('Користувач не має chatId для SLA сповіщення');
                return;
            }

            // Форматуємо час виконання
            const slaHours = ticket.sla.hours;
            const deadline = new Date(ticket.sla.deadline);
            const deadlineFormatted = deadline.toLocaleString('uk-UA', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // Визначаємо текстове відображення часу
            let timeText = '';
            if (slaHours < 1) {
                timeText = `${Math.round(slaHours * 60)} хвилин`;
            } else if (slaHours < 24) {
                timeText = `${slaHours} ${slaHours === 1 ? 'година' : slaHours < 5 ? 'години' : 'годин'}`;
            } else {
                const days = Math.floor(slaHours / 24);
                const hours = slaHours % 24;
                timeText = `${days} ${days === 1 ? 'день' : days < 5 ? 'дні' : 'днів'}`;
                if (hours > 0) {
                    timeText += ` ${hours} ${hours === 1 ? 'година' : hours < 5 ? 'години' : 'годин'}`;
                }
            }

            // Емодзі в залежності від пріоритету
            const priorityEmoji = {
                'urgent': '🔴',
                'high': '🟠',
                'medium': '🟡',
                'low': '🟢'
            }[ticket.priority] || '⚪';

            const message =
                `⏱️ *Ваш тікет взято в роботу!*\n\n` +
                `📋 *Тікет:* ${ticket.title}\n` +
                `🆔 \`${ticket._id}\`\n\n` +
                `${priorityEmoji} *Пріоритет:* ${TelegramUtils.getPriorityText(ticket.priority)}\n` +
                `🏙️ *Місто:* ${ticket.city?.name || 'Не вказано'}\n\n` +
                `⏰ *Очікуваний час виконання:* ${timeText}\n` +
                `📅 *Планова дата виконання:* ${deadlineFormatted}\n\n` +
                `💡 Ми докладемо всіх зусиль для вирішення вашої проблеми в зазначений термін.\n` +
                `\nВи отримаєте сповіщення про зміну статусу.`;

            await this.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📋 Мої тікети', callback_data: 'my_tickets' }]
                    ]
                }
            });

            logger.info(`✅ SLA сповіщення відправлено користувачу ${user.email} (${slaHours} годин, дедлайн: ${deadlineFormatted})`);
        } catch (error) {
            logger.error('Помилка відправки SLA сповіщення:', error);
        }
    }

    /**
     * Відправка попередження про наближення дедлайну (залишилось 20% часу)
     */
    async sendSLADeadlineWarning(ticket) {
        try {
            if (!this.bot) {
                logger.warn('Telegram бот не ініціалізований для відправки попередження про дедлайн');
                return;
            }

            // Перевіряємо наявність SLA інформації
            if (!ticket.sla || !ticket.sla.deadline || !ticket.sla.remainingHours) {
                logger.warn(`SLA не встановлено для тікету ${ticket._id}`);
                return;
            }

            // Перевіряємо наявність користувача
            const user = ticket.createdBy;
            if (!user) {
                logger.warn('Користувач, який створив тікет, не знайдений');
                return;
            }

            // Отримуємо Telegram chat ID
            const chatId = user.telegramChatId ? String(user.telegramChatId) : (user.telegramId ? String(user.telegramId) : null);
            if (!chatId) {
                logger.info(`Користувач ${user.email} не має Telegram ID для попередження про дедлайн`);
                return;
            }

            const deadline = new Date(ticket.sla.deadline);
            const deadlineFormatted = deadline.toLocaleString('uk-UA', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            // Форматуємо залишковий час
            const remainingHours = ticket.sla.remainingHours;
            let timeText = '';
            if (remainingHours < 1) {
                timeText = `${Math.round(remainingHours * 60)} хвилин`;
            } else if (remainingHours < 24) {
                const hours = Math.floor(remainingHours);
                const minutes = Math.round((remainingHours - hours) * 60);
                timeText = `${hours} ${hours === 1 ? 'година' : hours < 5 ? 'години' : 'годин'}`;
                if (minutes > 0) {
                    timeText += ` ${minutes} хв`;
                }
            } else {
                const days = Math.floor(remainingHours / 24);
                const hours = Math.floor(remainingHours % 24);
                timeText = `${days} ${days === 1 ? 'день' : days < 5 ? 'дні' : 'днів'}`;
                if (hours > 0) {
                    timeText += ` ${hours} год`;
                }
            }

            const message =
                `⏰ *Попередження про дедлайн!*\n\n` +
                `📋 *Тікет:* ${ticket.title}\n` +
                `🆔 \`${ticket._id}\`\n` +
                `🏙️ *Місто:* ${ticket.city?.name || 'Не вказано'}\n\n` +
                `⚠️ *Залишилось часу:* ${timeText}\n` +
                `📅 *Дедлайн:* ${deadlineFormatted}\n\n` +
                `💡 Наближається кінцевий термін виконання тікету. Якщо проблема ще не вирішена, зверніться до адміністратора.`;

            await this.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📋 Мої тікети', callback_data: 'my_tickets' }],
                        [{ text: "💬 Зв'язатися з підтримкою", url: 'https://t.me/Kultup' }]
                    ]
                }
            });

            logger.info(`✅ Попередження про дедлайн відправлено користувачу ${user.email} (залишилось: ${remainingHours}h)`);
        } catch (error) {
            logger.error('Помилка відправки попередження про дедлайн:', error);
        }
    }
}

module.exports = TelegramNotificationService;
