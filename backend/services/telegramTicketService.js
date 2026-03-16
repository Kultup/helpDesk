const User = require('../models/User');
const Ticket = require('../models/Ticket');
const Comment = require('../models/Comment');
const BotSettings = require('../models/BotSettings');
const logger = require('../utils/logger');

function isAfterHours() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kiev' }));
  const h = now.getHours();
  const day = now.getDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6 || h < 9 || h >= 18;
}

const fs = require('fs');
const path = require('path');
const { formatFileSize } = require('../utils/helpers');
const TelegramUtils = require('./telegramUtils');
const aiFirstLineService = require('./aiFirstLineService');
const botConversationService = require('./botConversationService');
const fcmService = require('./fcmService');
const ticketWebSocketService = require('./ticketWebSocketService');

class TelegramTicketService {
  constructor(telegramService) {
    this.telegramService = telegramService;
  }

  get bot() {
    return this.telegramService.bot;
  }

  get userSessions() {
    return this.telegramService.userSessions;
  }

  sendMessage(chatId, text, options) {
    return this.telegramService.sendMessage(chatId, text, options);
  }

  async handleMyTicketsCallback(chatId, user) {
    try {
      const tickets = await Ticket.find({ createdBy: user._id }).sort({ createdAt: -1 }).limit(10);

      if (tickets.length === 0) {
        await this.sendMessage(
          chatId,
          `📋 <b>Мої тікети</b>\n` +
            `📄 У вас поки що немає тікетів\n` +
            `💡 Створіть новий тікет для отримання допомоги`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
            },
          }
        );
        return;
      }

      let text = `📋 <b>Ваші тікети</b>\n`;
      const keyboard = [];
      const ticketButtons = [];

      tickets.forEach((ticket, index) => {
        const emoji = TelegramUtils.getStatusEmoji(ticket.status);
        const statusText = TelegramUtils.getStatusText(ticket.status);
        const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const title = TelegramUtils.truncateButtonText(ticket.title, 50);
        text += `\n${index + 1}. ${emoji} <b>${TelegramUtils.escapeHtml(title)}</b> — ${statusText}, <code>${date}</code>`;
        ticketButtons.push({ text: '🔎 Деталі', callback_data: `view_ticket_${ticket._id}` });
      });

      for (let i = 0; i < ticketButtons.length; i += 2) {
        keyboard.push(ticketButtons.slice(i, i + 2));
      }

      keyboard.push([{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]);

      await this.sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (error) {
      logger.error('Помилка отримання тікетів:', error);
      await this.sendMessage(
        chatId,
        `❌ <b>Помилка завантаження тікетів</b>\n` +
          `Не вдалося завантажити список тікетів\n` +
          `🔄 Спробуйте ще раз або зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>`,
        { parse_mode: 'HTML' }
      );
    }
  }

  async handleTicketHistoryCallback(chatId, user) {
    try {
      const tickets = await Ticket.find({ createdBy: user._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      if (tickets.length === 0) {
        await this.sendMessage(
          chatId,
          `📜 <b>Історія тікетів</b>\n` +
            `📄 У вас поки що немає тікетів\n` +
            `💡 Створіть новий тікет для отримання допомоги`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
            },
          }
        );
        return;
      }

      let text = `📜 <b>Історія тікетів</b>\n` + `📋 Показано ${tickets.length} тікетів\n`;

      const keyboard = [];

      tickets.forEach((ticket, index) => {
        const status = TelegramUtils.getStatusEmoji(ticket.status);
        const statusText = TelegramUtils.getStatusText(ticket.status);
        const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });

        text +=
          `\n${index + 1}. ${status} <b>${TelegramUtils.escapeHtml(ticket.title)}</b>\n` +
          `   📊 ${statusText} | 📅 ${date}`;

        keyboard.push({
          text: TelegramUtils.truncateButtonText(`🔄 Повторити: ${ticket.title}`, 50),
          callback_data: `recreate_ticket_${ticket._id}`,
        });
      });

      text += `\n\n💡 Натисніть кнопку, щоб створити новий тікет на основі попереднього`;

      const historyKeyboard = [];
      for (let i = 0; i < keyboard.length; i += 2) {
        historyKeyboard.push(keyboard.slice(i, i + 2));
      }
      historyKeyboard.push([{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]);

      await this.sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: historyKeyboard },
        parse_mode: 'HTML',
      });
    } catch (error) {
      logger.error('Помилка отримання історії тікетів:', error);
      await this.sendMessage(
        chatId,
        `❌ <b>Помилка завантаження історії</b>\n` +
          `Не вдалося завантажити історію тікетів\n` +
          `🔄 Спробуйте ще раз або зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>`,
        { parse_mode: 'HTML' }
      );
    }
  }

  async handleRecreateTicketCallback(chatId, user, ticketId) {
    try {
      const originalTicket = await Ticket.findById(ticketId).lean();

      if (!originalTicket) {
        await this.sendMessage(
          chatId,
          `❌ <b>Тікет не знайдено</b>\n\nОригінальний тікет не знайдено в системі.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (String(originalTicket.createdBy) !== String(user._id)) {
        await this.sendMessage(
          chatId,
          `❌ <b>Доступ заборонено</b>\n\nЦей тікет не належить вам.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const session = {
        step: 'title',
        ticketData: {
          title: originalTicket.title,
          description: originalTicket.description || '',
          priority: originalTicket.priority || 'medium',
          photos: [],
          isRecreated: true,
          originalTicketId: ticketId,
        },
      };

      this.userSessions.set(chatId, session);

      const message =
        `🔄 <b>Повторне створення тікету</b>\n` +
        `📋 <b>Заголовок:</b> <code>${TelegramUtils.escapeHtml(originalTicket.title)}</code>\n` +
        `📝 <b>Опис:</b> <code>${TelegramUtils.escapeHtml(originalTicket.description || 'Без опису')}</code>\n` +
        `\n✏️ Ви можете змінити заголовок або описати нову проблему\n` +
        `📋 <b>Крок 1/3:</b> Введіть заголовок тікету\n` +
        `💡 Опишіть коротко суть проблеми`;

      await this.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Використати попередній заголовок', callback_data: 'use_previous_title' },
              { text: TelegramUtils.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ],
          ],
        },
        parse_mode: 'HTML',
      });
    } catch (error) {
      logger.error('Помилка повторного створення тікету:', error);
      await this.sendMessage(
        chatId,
        `❌ <b>Помилка</b>\n` + `Не вдалося завантажити дані тікету\n` + `🔄 Спробуйте ще раз`,
        { parse_mode: 'HTML' }
      );
    }
  }

  async handleViewTicketCallback(chatId, user, ticketId) {
    try {
      const ticket = await Ticket.findById(ticketId)
        .populate('city', 'name')
        .populate('createdBy', 'firstName lastName')
        .lean();

      if (!ticket) {
        await this.sendMessage(
          chatId,
          `❌ <b>Тікет не знайдено</b>\n\nОригінальний тікет не знайдено в системі.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (String(ticket.createdBy._id || ticket.createdBy) !== String(user._id)) {
        await this.sendMessage(
          chatId,
          `❌ <b>Доступ заборонено</b>\n\nЦей тікет не належить вам.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const comments = await Comment.find({
        ticket: ticketId,
        isDeleted: false,
        isInternal: false,
      })
        .populate('author', 'firstName lastName role')
        .sort({ createdAt: 1 })
        .limit(20)
        .lean();

      const statusEmoji = TelegramUtils.getStatusEmoji(ticket.status);
      const statusText = TelegramUtils.getStatusText(ticket.status);
      const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const priorityText = TelegramUtils.getPriorityText(ticket.priority);
      const ticketNumber = ticket.ticketNumber || ticket._id.toString().substring(0, 8);

      let message =
        `🎫 <b>Деталі тікету</b>\n` +
        `📋 ${TelegramUtils.escapeHtml(ticket.title)}\n` +
        `📊 ${statusEmoji} ${statusText} | ⚡ ${priorityText}\n` +
        `🏙️ ${TelegramUtils.escapeHtml(ticket.city?.name || 'Не вказано')} | 📅 <code>${date}</code>\n` +
        `🆔 <code>${ticketNumber}</code>\n\n` +
        `📝 <b>Опис:</b>\n${TelegramUtils.escapeHtml(ticket.description)}\n\n`;

      if (comments.length > 0) {
        message += `💬 <b>Коментарі (${comments.length}):</b>\n\n`;
        comments.forEach((comment, index) => {
          const commentAuthor = comment.author;
          const authorName =
            commentAuthor?.firstName && commentAuthor?.lastName
              ? `${commentAuthor.firstName} ${commentAuthor.lastName}`
              : 'Користувач';
          const isAdmin = commentAuthor?.role === 'admin' || commentAuthor?.role === 'manager';
          const roleLabel = isAdmin ? '👨‍💼 Адмін' : '👤 Користувач';
          const commentDate = new Date(comment.createdAt).toLocaleString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });

          message += `${index + 1}. ${roleLabel} <b>${TelegramUtils.escapeHtml(authorName)}</b> (<code>${commentDate}</code>):\n`;
          message += `${TelegramUtils.escapeHtml(comment.content)}\n\n`;
        });
      } else {
        message += `💬 <b>Коментарі:</b>\nПоки що немає коментарів.\n\n`;
      }

      message += `💡 <b>Коментарі:</b>\nВикористовуйте веб-панель для додавання коментарів до тікету.`;

      const history = this.telegramService.getNavigationHistory(chatId);
      const backButtons = [];

      if (
        history.length > 1 &&
        (history[history.length - 2] === 'my_tickets' ||
          history[history.length - 2] === 'ticket_history')
      ) {
        backButtons.push({ text: '⬅️ Назад до списку', callback_data: 'back' });
      }

      backButtons.push({ text: '🏠 Головне меню', callback_data: 'back_to_menu' });

      await this.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: TelegramUtils.truncateButtonText(`🔄 Повторити: ${ticket.title}`, 50),
                callback_data: `recreate_ticket_${ticket._id}`,
              },
            ],
            backButtons,
          ],
        },
        parse_mode: 'HTML',
      });
    } catch (error) {
      logger.error('Помилка перегляду деталей тікету:', error);
      await this.sendMessage(
        chatId,
        `❌ <b>Помилка завантаження деталей</b>\nНе вдалося завантажити дані тікету`,
        { parse_mode: 'HTML' }
      );
    }
  }

  async sendQualityRatingRequest(ticket) {
    try {
      const ticketSource = ticket.metadata?.source || 'web';
      const user = await User.findById(ticket.createdBy).select(
        'telegramId firstName lastName email'
      );

      if (!user) {
        logger.warn('Користувача не знайдено для відправки запиту на оцінку');
        return;
      }

      const emoji = TelegramUtils.getStatusEmoji(ticket.status);
      const statusText = TelegramUtils.getStatusText(ticket.status);
      const title = TelegramUtils.truncateButtonText(ticket.title, 60);

      if (ticketSource === 'telegram') {
        if (!user.telegramId) {
          logger.warn('У користувача немає telegramId для відправки запиту на оцінку');
          return;
        }

        const message =
          `📊 <b>Оцініть якість вирішення</b>\n` +
          `📋 ${TelegramUtils.escapeHtml(title)}\n` +
          `📊 ${emoji} ${statusText}\n` +
          `Оберіть оцінку від 1 до 5:`;

        const keyboard = [
          [
            { text: '⭐ 1', callback_data: `rate_ticket_${ticket._id}_1` },
            { text: '⭐⭐ 2', callback_data: `rate_ticket_${ticket._id}_2` },
            { text: '⭐⭐⭐ 3', callback_data: `rate_ticket_${ticket._id}_3` },
          ],
          [
            { text: '⭐⭐⭐⭐ 4', callback_data: `rate_ticket_${ticket._id}_4` },
            { text: '⭐⭐⭐⭐⭐ 5', callback_data: `rate_ticket_${ticket._id}_5` },
          ],
          [{ text: '🏠 Головне меню', callback_data: 'back' }],
        ];

        await this.sendMessage(String(user.telegramId), message, {
          reply_markup: { inline_keyboard: keyboard },
          parse_mode: 'HTML',
        });
        logger.info('✅ Запит на оцінку відправлено в Telegram користувачу');
      } else if (ticketSource === 'mobile') {
        try {
          await fcmService.sendToUser(user._id.toString(), {
            title: '📊 Оцініть якість вирішення',
            body: `Будь ласка, оцініть якість вирішення тікету "${title}"`,
            type: 'ticket_rating_request',
            data: {
              ticketId: ticket._id.toString(),
              ticketTitle: ticket.title,
              ticketStatus: ticket.status,
            },
          });
          logger.info('✅ Запит на оцінку відправлено через FCM користувачу (mobile)');
        } catch (error) {
          logger.error('❌ Помилка відправки FCM запиту на оцінку:', error);
        }
      } else {
        try {
          ticketWebSocketService.notifyRatingRequest(user._id.toString(), {
            _id: ticket._id,
            title: ticket.title,
            status: ticket.status,
          });
          logger.info('✅ Запит на оцінку відправлено через WebSocket користувачу (web)');
        } catch (wsError) {
          logger.warn('⚠️ Не вдалося відправити WebSocket запит на оцінку:', wsError);
        }

        try {
          await fcmService.sendToUser(user._id.toString(), {
            title: '📊 Оцініть якість вирішення',
            body: `Будь ласка, оцініть якість вирішення тікету "${title}"`,
            type: 'ticket_rating_request',
            data: {
              ticketId: ticket._id.toString(),
              ticketTitle: ticket.title,
              ticketStatus: ticket.status,
            },
          });
          logger.info('✅ Запит на оцінку відправлено через FCM користувачу (web)');
        } catch (error) {
          logger.warn('⚠️ Не вдалося відправити FCM запит на оцінку:', error);
        }

        // Відправляємо в Telegram якщо користувач має telegramId (завжди, а не лише при помилці FCM)
        if (user.telegramId) {
          try {
            const message =
              `📊 <b>Оцініть якість вирішення</b>\n` +
              `📋 ${TelegramUtils.escapeHtml(title)}\n` +
              `📊 ${emoji} ${statusText}\n` +
              `Оберіть оцінку від 1 до 5:`;

            const keyboard = [
              [
                { text: '⭐ 1', callback_data: `rate_ticket_${ticket._id}_1` },
                { text: '⭐⭐ 2', callback_data: `rate_ticket_${ticket._id}_2` },
                { text: '⭐⭐⭐ 3', callback_data: `rate_ticket_${ticket._id}_3` },
              ],
              [
                { text: '⭐⭐⭐⭐ 4', callback_data: `rate_ticket_${ticket._id}_4` },
                { text: '⭐⭐⭐⭐⭐ 5', callback_data: `rate_ticket_${ticket._id}_5` },
              ],
              [{ text: '🏠 Головне меню', callback_data: 'back' }],
            ];

            await this.sendMessage(String(user.telegramId), message, {
              reply_markup: { inline_keyboard: keyboard },
              parse_mode: 'HTML',
            });
            logger.info('✅ Запит на оцінку відправлено в Telegram користувачу (web)');
          } catch (tgError) {
            logger.warn('⚠️ Не вдалося відправити Telegram запит на оцінку:', tgError);
          }
        }
      }
    } catch (error) {
      logger.error('Помилка відправки запиту на оцінку:', error);
    }
  }

  async handleRateTicketCallback(chatId, user, ticketId, rating) {
    try {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        await this.sendMessage(chatId, `❌ <b>Тікет не знайдено</b>`, { parse_mode: 'HTML' });
        return;
      }

      if (String(ticket.createdBy) !== String(user._id)) {
        await this.sendMessage(chatId, `❌ <b>Доступ заборонено</b>`, { parse_mode: 'HTML' });
        return;
      }

      if (ticket.qualityRating?.hasRating) {
        await this.sendMessage(chatId, `ℹ️ Ви вже оцінили цю заявку.`, { parse_mode: 'HTML' });
        return;
      }

      const ratingNum = Math.max(1, Math.min(5, parseInt(rating, 10) || 0));
      ticket.qualityRating.hasRating = true;
      ticket.qualityRating.rating = ratingNum;
      ticket.qualityRating.ratedAt = new Date();
      ticket.qualityRating.ratedBy = user._id;
      await ticket.save();

      // AI-емоція: кожен раз нова фраза
      let emotionText = '✅ Дякуємо за оцінку!';
      try {
        emotionText = await aiFirstLineService.generateRatingEmotionResponse(ratingNum);
      } catch (aiErr) {
        logger.warn('AI emotion для оцінки недоступно:', aiErr?.message);
      }
      await this.sendMessage(chatId, emotionText, { parse_mode: 'HTML' });

      // GIF або стікер під оцінку (BotSettings.ratingMedia або дефолтні GIF)
      if (this.bot) {
        try {
          const botSettings = await BotSettings.findOne({ key: 'default' }).lean();
          const media = botSettings?.ratingMedia?.[String(ratingNum)];
          const gifs = Array.isArray(media?.gifs) ? media.gifs.filter(Boolean) : [];
          const stickers = Array.isArray(media?.stickers) ? media.stickers.filter(Boolean) : [];
          const useGifs = gifs;
          const hasGif = useGifs.length > 0;
          const hasSticker = stickers.length > 0;
          const sendGif = hasGif && (!hasSticker || Math.random() < 0.5);

          if (sendGif) {
            const gifUrl = useGifs[Math.floor(Math.random() * useGifs.length)].trim();
            await this.bot.sendAnimation(chatId, gifUrl);
            logger.info(`Відправлено GIF для оцінки ${ratingNum}`);
          } else if (hasSticker) {
            const stickerId = stickers[Math.floor(Math.random() * stickers.length)].trim();
            await this.bot.sendSticker(chatId, stickerId);
            logger.info(`Відправлено стікер для оцінки ${ratingNum}`);
          }
        } catch (mediaErr) {
          logger.warn('Помилка відправки GIF/стикера для оцінки:', mediaErr?.message);
        }
      }
    } catch (error) {
      logger.error('Помилка обробки оцінки якості:', error);
      await this.sendMessage(chatId, `❌ <b>Помилка збереження оцінки</b>`, { parse_mode: 'HTML' });
    }
  }

  /**
   * Обробити текст як опційний відгук після оцінки тікета (Етап 2б).
   * Якщо в сесії є awaitingTicketFeedbackId — зберегти текст у ticket.qualityRating.feedback.
   * @returns {Promise<boolean>} true якщо повідомлення оброблено як відгук
   */
  async handleTicketFeedbackMessage(chatId, text, user) {
    const session = this.userSessions.get(chatId);
    const ticketId = session?.awaitingTicketFeedbackId;
    if (!ticketId || !text || typeof text !== 'string') {
      return false;
    }
    const trimmed = String(text).trim();
    if (/^\/skip$/i.test(trimmed)) {
      this.userSessions.delete(chatId);
      await this.sendMessage(chatId, 'Ок, без відгуку.');
      return true;
    }
    // Видаляємо сесію одразу, щоб повторне повідомлення (нова заявка) не потрапило в старий флоу
    this.userSessions.delete(chatId);
    try {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket || String(ticket.createdBy) !== String(user._id)) {
        return false;
      }
      ticket.qualityRating.feedback = trimmed.slice(0, 500);
      await ticket.save();
      await this.sendMessage(chatId, '✅ Дякуємо, відгук збережено.');
      return true;
    } catch (err) {
      logger.error('Помилка збереження відгуку тікета:', err);
      return false;
    }
  }

  async handleUsePreviousTitleCallback(chatId, _user) {
    try {
      const session = this.userSessions.get(chatId);
      if (!session || !session.ticketData || !session.ticketData.title) {
        await this.sendMessage(
          chatId,
          `❌ *Помилка*\nNe вдалося знайти попередній заголовок\n🔄 Спробуйте ввести заголовок вручну`
        );
        return;
      }

      session.step = 'description';

      await this.sendMessage(
        chatId,
        `✅ <b>Заголовок використано</b>\n` +
          `📋 ${TelegramUtils.escapeHtml(session.ticketData.title)}\n` +
          `\n📝 <b>Крок 2/4:</b> Введіть опис проблеми\n` +
          `💡 Опишіть детально вашу проблему`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '✅ Використати попередній опис',
                  callback_data: 'use_previous_description',
                },
                { text: TelegramUtils.getCancelButtonText(), callback_data: 'cancel_ticket' },
              ],
            ],
          },
          parse_mode: 'HTML',
        }
      );
    } catch (error) {
      logger.error('Помилка використання попереднього заголовку:', error);
      await this.sendMessage(
        chatId,
        `❌ *Помилка*\nNe вдалося використати попередній заголовок\n🔄 Спробуйте ввести заголовок вручну`
      );
    }
  }

  async handleUsePreviousDescriptionCallback(chatId, _user) {
    try {
      const session = this.userSessions.get(chatId);
      if (!session || !session.ticketData || !session.ticketData.description) {
        await this.sendMessage(
          chatId,
          `❌ *Помилка*\nNe вдалося знайти попередній опис\n🔄 Спробуйте ввести опис вручну`
        );
        return;
      }

      session.step = 'photo';

      await this.sendMessage(
        chatId,
        `✅ <b>Опис використано</b>\n` +
          `📝 ${TelegramUtils.escapeHtml(session.ticketData.description.substring(0, 100))}${session.ticketData.description.length > 100 ? '...' : ''}\n` +
          `\n📸 <b>Крок 3/4:</b> Бажаєте додати фото до заявки?`,
        {
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
              { text: '📷 Додати фото', callback_data: 'attach_photo' },
              { text: '⏭️ Пропустити', callback_data: 'skip_photo' },
              { text: TelegramUtils.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]),
          },
          parse_mode: 'HTML',
        }
      );
    } catch (error) {
      logger.error('Помилка використання попереднього опису:', error);
      await this.sendMessage(
        chatId,
        `❌ *Помилка*\nNe вдалося використати попередній опис\n🔄 Спробуйте ввести опис вручну`
      );
    }
  }

  async handleCreateTicketCallback(chatId, user) {
    const fullUser = await User.findById(user._id)
      .populate('position', 'title name')
      .populate('city', 'name region')
      .populate('institution', 'name')
      .lean();
    const profile = fullUser || user;

    const aiSettings = await aiFirstLineService.getAISettings();
    const aiEnabled = aiSettings && aiSettings.enabled === true;
    const hasApiKey =
      aiSettings &&
      ((aiSettings.provider === 'openai' &&
        aiSettings.openaiApiKey &&
        String(aiSettings.openaiApiKey).trim()) ||
        (aiSettings.provider === 'gemini' &&
          aiSettings.geminiApiKey &&
          String(aiSettings.geminiApiKey).trim()));

    if (aiEnabled && hasApiKey) {
      let userEquipmentSummary = '';
      try {
        const Equipment = require('../models/Equipment');
        const equipList = await Equipment.find({ assignedTo: profile._id }).lean();
        if (equipList?.length) {
          userEquipmentSummary =
            equipList
              .map(e => {
                const parts = [e.name, e.brand, e.model].filter(Boolean);
                const spec = e.specifications;
                const cpu = spec?.get?.('CPU') || spec?.CPU;
                if (cpu) {
                  parts.push(cpu);
                }
                return parts.join(' ');
              })
              .filter(Boolean)
              .join('; ') || equipList.map(e => e.name).join('; ');
        }
      } catch (_equipErr) {
        /* equipment lookup optional */
      }
      const userContext = {
        userCity: profile.city?.name || 'Не вказано',
        userCityId: profile.city?._id || profile.city,
        userInstitutionId: profile.institution?._id || profile.institution,
        userPosition: profile.position?.title || profile.position?.name || 'Не вказано',
        userInstitution: profile.institution?.name || '',
        userName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email,
        userEmail: profile.email,
        userEquipmentSummary: userEquipmentSummary || undefined,
      };
      const session = {
        mode: 'ai',
        step: 'gathering_information',
        ai_attempts: 0,
        ai_questions_count: 0,
        dialog_history: [],
        userContext,
        ticketData: { createdBy: user._id, photos: [], documents: [] },
        ticketDraft: null,
        lastActivityAt: Date.now(),
      };
      this.userSessions.set(chatId, session);
      await this.sendMessage(
        chatId,
        `📝 <b>Створення тікета</b>\n\n` +
          `Опишіть проблему своїми словами. Я постараюся швидко зібрати все необхідне.\n\n` +
          `📸 Можете також надіслати фото або скріншот проблеми.\n\n` +
          `<b>Приклади:</b>\n` +
          `• Принтер не друкує\n` +
          `• Не працює телефон у закладі\n` +
          `• Syrve не відкривається`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: TelegramUtils.getCancelButtonText(), callback_data: 'cancel_ticket' }],
            ],
          },
          parse_mode: 'HTML',
        }
      );
      return;
    }

    const session = {
      mode: 'classic',
      step: 'title',
      ticketData: {
        createdBy: user._id,
        photos: [],
        documents: [],
      },
      lastActivityAt: Date.now(),
    };
    this.userSessions.set(chatId, session);
    await this.sendMessage(
      chatId,
      `📝 <b>Створення нового тікету</b>\n` +
        `📋 <b>Крок 1/4:</b> Введіть заголовок тікету\n` +
        `💡 Опишіть коротко суть проблеми`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: TelegramUtils.getCancelButtonText(), callback_data: 'cancel_ticket' }],
          ],
        },
      }
    );
  }

  async handleTicketCreationStep(chatId, text, session) {
    try {
      switch (session.step) {
        case 'gathering_information': {
          if (session.editingFromConfirm && session.ticketDraft) {
            const t = (text || '').toLowerCase().trim();
            const nothingToChange =
              /^(нічого|ничого|nothing|ні|нi|пропустити|залишити як є|залишити|все ок|все добре|ок|окей|добре|норм|нормально)$/.test(
                t
              ) ||
              t === 'нч' ||
              t === 'нчого';
            if (nothingToChange) {
              session.step = 'confirm_ticket';
              session.editingFromConfirm = false;
              const categoryEmoji = TelegramUtils.getCategoryEmoji(session.ticketDraft.subcategory);
              const summaryMessage =
                `✅ <b>Дякую за інформацію!</b>\n\n` +
                `📋 <b>РЕЗЮМЕ ТІКЕТА:</b>\n\n` +
                `📌 <b>Заголовок:</b>\n${TelegramUtils.escapeHtml(session.ticketDraft.title || '—')}\n\n` +
                `📝 <b>Опис:</b>\n${TelegramUtils.escapeHtml(session.ticketDraft.description || '—')}\n\n` +
                `${categoryEmoji} <b>Категорія:</b> ${TelegramUtils.escapeHtml(session.ticketDraft.subcategory || '—')}\n\n` +
                `💡 Все правильно?`;
              await this.sendMessage(chatId, summaryMessage, {
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                    { text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' },
                    { text: '✏️ Щось не так, виправити', callback_data: 'edit_ticket_info' },
                    { text: '❌ Скасувати', callback_data: 'cancel_ticket' },
                  ]),
                },
              });
              break;
            }
            session.editingFromConfirm = false;
          }
          if (!session.ticketDraft || !Array.isArray(session.ticketDraft.collectedInfo)) {
            break;
          }
          logger.info(`Збір інформації, етап ${session.stage}`);
          session.ticketDraft.collectedInfo.push(text);
          if (session.aiDialogId) {
            await this.telegramService.addMessageToAIDialog(session.aiDialogId, 'user', text);
          }
          const fullDescription = `${session.ticketDraft.initialMessage}\n\nДодаткова інформація:\n${session.ticketDraft.collectedInfo.join('\n')}`;
          session.ticketDraft.title =
            session.ticketDraft.title ||
            session.ticketDraft.initialMessage.slice(0, 50) ||
            'Проблема';
          session.ticketDraft.description = fullDescription;
          session.ticketDraft.priority = 'medium';
          session.step = 'confirm_ticket';
          const categoryEmoji = TelegramUtils.getCategoryEmoji(session.ticketDraft.subcategory);
          const summaryMessage =
            `✅ <b>Дякую за інформацію!</b>\n\n` +
            `📋 <b>РЕЗЮМЕ ТІКЕТА:</b>\n\n` +
            `📌 <b>Заголовок:</b>\n${TelegramUtils.escapeHtml(session.ticketDraft.title)}\n\n` +
            `📝 <b>Опис:</b>\n${TelegramUtils.escapeHtml(session.ticketDraft.description)}\n\n` +
            `${categoryEmoji} <b>Категорія:</b> ${TelegramUtils.escapeHtml(session.ticketDraft.subcategory)}\n\n` +
            `💡 Все правильно?`;
          await this.sendMessage(chatId, summaryMessage, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' },
                { text: '✏️ Щось не так, виправити', callback_data: 'edit_ticket_info' },
                { text: '❌ Скасувати', callback_data: 'cancel_ticket' },
              ]),
            },
          });
          break;
        }

        case 'confirm_ticket':
          break;

        case 'title':
          session.ticketData.title = text;
          session.step = 'description';
          await this.sendMessage(chatId, 'Крок 2/4: Введіть опис проблеми:', {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: TelegramUtils.getCancelButtonText(), callback_data: 'cancel_ticket' }],
              ],
            },
          });
          break;

        case 'description':
          session.ticketData.description = text;
          session.step = 'photo';
          await this.sendMessage(
            chatId,
            `📎 <b>Крок 3/4:</b> Бажаєте додати фото або файли до заявки?`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                  { text: '📷 Додати фото', callback_data: 'attach_photo' },
                  { text: '📎 Додати файл', callback_data: 'attach_document' },
                  { text: '⏭️ Пропустити', callback_data: 'skip_photo' },
                  { text: TelegramUtils.getCancelButtonText(), callback_data: 'cancel_ticket' },
                ]),
              },
            }
          );
          break;

        case 'priority':
          break;

        case 'photo':
          await this.sendMessage(
            chatId,
            '📸 На цьому кроці можна додати фото або файл, або натиснути «Пропустити» / «Завершити» нижче.',
            {
              reply_markup: {
                inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                  { text: '📷 Додати фото', callback_data: 'attach_photo' },
                  { text: '📎 Додати файл', callback_data: 'attach_document' },
                  { text: '⏭️ Пропустити', callback_data: 'skip_photo' },
                  { text: '✅ Завершити', callback_data: 'finish_ticket' },
                  { text: TelegramUtils.getCancelButtonText(), callback_data: 'cancel_ticket' },
                ]),
              },
            }
          );
          break;
      }
    } catch (error) {
      logger.error('Помилка обробки кроку створення тікету:', error);
      await this.sendMessage(chatId, 'Виникла помилка. Спробуйте ще раз.');
    }
  }

  async handleTicketPhoto(chatId, photos, caption) {
    try {
      const session = this.userSessions.get(chatId);
      if (!session) {
        logger.warn('Спроба додати фото без активної сесії', { chatId });
        await this.sendMessage(
          chatId,
          'Ви не в процесі створення тікету. Використайте /start для початку.'
        );
        return;
      }

      if (!photos || photos.length === 0) {
        logger.warn('Отримано порожній масив фото', { chatId });
        await this.sendMessage(chatId, 'Не вдалося отримати фото. Спробуйте надіслати ще раз.');
        return;
      }

      const photo = photos[photos.length - 1];
      if (!photo || !photo.file_id) {
        logger.error('Фото не містить file_id', { chatId, photos });
        await this.sendMessage(
          chatId,
          'Помилка: фото не містить необхідних даних. Спробуйте надіслати ще раз.'
        );
        return;
      }

      const fileId = photo.file_id;
      let file;
      try {
        file = await this.bot.getFile(fileId);
      } catch (error) {
        logger.error('Помилка отримання інформації про файл з Telegram', {
          fileId,
          error: error.message,
        });
        await this.sendMessage(
          chatId,
          'Помилка отримання інформації про фото. Спробуйте надіслати ще раз.'
        );
        return;
      }

      if (!file || !file.file_path) {
        logger.error('Файл не містить file_path', { fileId, file });
        await this.sendMessage(
          chatId,
          'Помилка: не вдалося отримати шлях до файлу. Спробуйте надіслати ще раз.'
        );
        return;
      }

      const fileSizeBytes = file.file_size || 0;
      const maxSizeBytes = 50 * 1024 * 1024;

      if (fileSizeBytes > maxSizeBytes) {
        await this.sendMessage(
          chatId,
          `❌ <b>Файл занадто великий!</b>\n\n` +
            `Розмір: ${formatFileSize(fileSizeBytes)}\n` +
            `Максимальний розмір: ${formatFileSize(maxSizeBytes)}\n\n` +
            `Будь ласка, надішліть файл меншого розміру.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const filePath = file.file_path;
      const fileExtension = path.extname(filePath).toLowerCase();
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

      if (!allowedExtensions.includes(fileExtension)) {
        await this.sendMessage(
          chatId,
          `❌ <b>Непідтримуваний тип файлу!</b>\n\n` +
            `Підтримувані формати: JPG, JPEG, PNG, GIF, WebP\n` +
            `Ваш файл: ${fileExtension || 'невідомий'}\n\n` +
            `Будь ласка, надішліть фото у підтримуваному форматі.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (!session.ticketData.photos) {
        session.ticketData.photos = [];
      }

      if (session.ticketData.photos.length >= 5) {
        await this.sendMessage(
          chatId,
          `❌ <b>Досягнуто максимальну кількість фото!</b>\n\n` +
            `Максимум: 5 фото на тікет\n` +
            `Поточна кількість: ${session.ticketData.photos.length}\n\n` +
            `Натисніть "Завершити" для продовження.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      let savedPath;
      try {
        savedPath = await TelegramUtils.downloadTelegramFileByFileId(
          this.bot,
          fileId,
          fileExtension
        );
        logger.info('Фото успішно завантажено', { filePath, savedPath, fileId });
      } catch (downloadError) {
        logger.error('Помилка завантаження фото з Telegram', {
          filePath,
          fileId,
          error: downloadError.message,
          stack: downloadError.stack,
        });
        await this.sendMessage(
          chatId,
          `❌ <b>Помилка завантаження фото!</b>\n\n` +
            `Не вдалося завантажити фото з Telegram серверів.\n` +
            `Спробуйте надіслати фото ще раз або зверніться до адміністратора.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      session.ticketData.photos.push({
        fileId: fileId,
        path: savedPath,
        caption: caption || '',
        size: fileSizeBytes,
        extension: fileExtension,
      });

      await this.sendMessage(
        chatId,
        `✅ <b>Фото додано!</b> (${session.ticketData.photos.length}/5)\n\n` +
          `📏 Розмір: ${formatFileSize(fileSizeBytes)}\n` +
          `📄 Формат: ${fileExtension.toUpperCase()}\n\n` +
          'Хочете додати ще фото?',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
              { text: '📷 Додати ще фото', callback_data: 'add_more_photos' },
              { text: '✅ Завершити', callback_data: 'finish_ticket' },
              { text: TelegramUtils.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]),
          },
        }
      );
    } catch (error) {
      logger.error('Помилка обробки фото:', {
        error: error.message,
        stack: error.stack,
        chatId,
      });
      await this.sendMessage(
        chatId,
        `❌ <b>Помилка обробки фото!</b>\n\n` +
          `Виникла несподівана помилка. Спробуйте надіслати фото ще раз.\n` +
          `Якщо проблема повторюється, зверніться до адміністратора.`,
        { parse_mode: 'HTML' }
      );
    }
  }

  async handleTicketDocument(chatId, document, caption) {
    try {
      const session = this.userSessions.get(chatId);
      if (!session) {
        await this.sendMessage(chatId, '❌ Сесія не знайдена. Почніть створення тікету спочатку.');
        return;
      }

      if (!document || !document.file_id) {
        logger.error('Документ не містить file_id', { document });
        await this.sendMessage(
          chatId,
          '❌ <b>Помилка:</b> не вдалося отримати інформацію про файл. Спробуйте надіслати ще раз.',
          { parse_mode: 'HTML' }
        );
        return;
      }

      const fileId = document.file_id;
      const fileSizeBytes = document.file_size || 0;
      const maxSizeBytes = 50 * 1024 * 1024;

      if (fileSizeBytes > maxSizeBytes) {
        await this.sendMessage(
          chatId,
          `❌ <b>Файл занадто великий!</b>\n\n` +
            `Розмір: ${formatFileSize(fileSizeBytes)}\n` +
            `Максимальний розмір: ${formatFileSize(maxSizeBytes)}\n\n` +
            `Будь ласка, надішліть файл меншого розміру.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      let file;
      try {
        file = await this.bot.getFile(fileId);
      } catch (error) {
        logger.error('Помилка отримання інформації про файл', { fileId, error: error.message });
        await this.sendMessage(
          chatId,
          '❌ <b>Помилка:</b> не вдалося отримати інформацію про файл. Спробуйте надіслати ще раз.',
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (!file || !file.file_path) {
        logger.error('Файл не містить file_path', { fileId, file });
        await this.sendMessage(
          chatId,
          'Помилка: не вдалося отримати шлях до файлу. Спробуйте надіслати ще раз.'
        );
        return;
      }

      const filePath = file.file_path;
      const fileName = document.file_name || path.basename(filePath);
      const fileExtension =
        path.extname(fileName).toLowerCase() || path.extname(filePath).toLowerCase() || '.bin';

      if (!session.ticketData.documents) {
        session.ticketData.documents = [];
      }

      const totalFiles =
        (session.ticketData.photos?.length || 0) + (session.ticketData.documents?.length || 0);
      if (totalFiles >= 10) {
        await this.sendMessage(
          chatId,
          `❌ <b>Досягнуто максимальну кількість файлів!</b>\n\n` +
            `Максимум: 10 файлів на тікет\n` +
            `Поточна кількість: ${totalFiles}\n\n` +
            `Натисніть "Завершити" для продовження.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      let savedPath;
      try {
        savedPath = await TelegramUtils.downloadTelegramFileByFileId(
          this.bot,
          fileId,
          fileExtension
        );
        logger.info('Файл успішно завантажено', { filePath, savedPath, fileId, fileName });
      } catch (downloadError) {
        logger.error('Помилка завантаження файлу з Telegram', {
          filePath,
          fileId,
          fileName,
          error: downloadError.message,
          stack: downloadError.stack,
        });
        await this.sendMessage(
          chatId,
          `❌ <b>Помилка завантаження файлу!</b>\n\n` +
            `Не вдалося завантажити файл з Telegram серверів.\n` +
            `Спробуйте надіслати файл ще раз або зверніться до адміністратора.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      session.ticketData.documents.push({
        fileId: fileId,
        path: savedPath,
        fileName: fileName,
        caption: caption || '',
        size: fileSizeBytes,
        extension: fileExtension,
        mimeType: document.mime_type || 'application/octet-stream',
      });

      await this.sendMessage(
        chatId,
        `✅ <b>Файл додано!</b> (${totalFiles + 1}/10)\n\n` +
          `📄 Назва: ${TelegramUtils.escapeHtml(fileName)}\n` +
          `📏 Розмір: ${formatFileSize(fileSizeBytes)}\n` +
          `📋 Формат: ${fileExtension.toUpperCase() || 'невідомий'}\n\n` +
          'Хочете додати ще файли?',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
              { text: '📎 Додати ще файл', callback_data: 'add_more_photos' },
              { text: '✅ Завершити', callback_data: 'finish_ticket' },
              { text: TelegramUtils.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]),
          },
        }
      );
    } catch (error) {
      logger.error('Помилка обробки документа:', {
        error: error.message,
        stack: error.stack,
        chatId,
      });
      await this.sendMessage(
        chatId,
        `❌ <b>Помилка обробки файлу!</b>\n\n` +
          `Виникла несподівана помилка. Спробуйте надіслати файл ще раз.\n` +
          `Якщо проблема повторюється, зверніться до адміністратора.`,
        { parse_mode: 'HTML' }
      );
    }
  }

  async handleAttachPhotoCallback(chatId, _user) {
    const session = this.userSessions.get(chatId);
    if (!session || session.step !== 'photo') {
      return;
    }
    await this.sendMessage(
      chatId,
      '📷 Надішліть фото для прикріплення до тікету.\n\n' +
        'Ви можете додати підпис до фото для додаткової інформації.'
    );
  }

  async handleAttachDocumentCallback(chatId, _user) {
    const session = this.userSessions.get(chatId);
    if (!session || session.step !== 'photo') {
      await this.sendMessage(chatId, 'Помилка: не вдалося знайти сесію створення тікету.');
      return;
    }

    await this.sendMessage(
      chatId,
      '📎 Надішліть файл для прикріплення до тікету.\n' +
        'Максимальний розмір: 50 MB.\n\n' +
        'Ви можете прикріпити документи, архіви або інші файли.'
    );
  }

  async handlePriorityCallback(chatId, user, priority) {
    const session = this.userSessions.get(chatId);
    if (!session || session.step !== 'priority' || !session.ticketData) {
      return;
    }

    session.ticketData.priority = priority;
    await this.completeTicketCreation(chatId, user, session);
  }

  async handleFinishTicketCallback(chatId, user) {
    const session = this.userSessions.get(chatId);
    if (!session || !session.ticketData) {
      await this.sendMessage(
        chatId,
        'Немає активного чернетки заявки. Почніть створення тікету з кнопки «Створити тікет».'
      );
      return;
    }
    session.ticketData.priority = session.ticketData.priority || 'medium';
    await this.completeTicketCreation(chatId, user, session);
  }

  async handleSkipPhotoCallback(chatId, user) {
    const session = this.userSessions.get(chatId);
    if (!session || session.step !== 'photo' || !session.ticketData) {
      return;
    }
    session.ticketData.priority = session.ticketData.priority || 'medium';
    await this.completeTicketCreation(chatId, user, session);
  }

  async handleAddMorePhotosCallback(chatId, _user) {
    const session = this.userSessions.get(chatId);
    if (!session || session.step !== 'photo') {
      return;
    }
    await this.sendMessage(
      chatId,
      '📷 Надішліть ще одне фото або натисніть "Завершити" для продовження.'
    );
  }

  async handleCancelTicketCallback(chatId, user) {
    // 🆕 Завершуємо AI діалог як "cancelled" перед видаленням сесії
    const session = this.userSessions.get(chatId);
    if (session && session.aiDialogId) {
      await this.telegramService.completeAIDialog(session.aiDialogId, 'cancelled');
    }

    // Видаляємо сесію створення тікету
    this.userSessions.delete(chatId);

    // Показуємо головне меню
    await this.telegramService.showUserDashboard(chatId, user);
  }

  async completeTicketCreation(chatId, user, session) {
    try {
      const validTypes = ['incident', 'request', 'problem', 'change'];
      const ticketType = validTypes.includes(session.ticketData.type)
        ? session.ticketData.type
        : 'problem';

      let description = session.ticketData.description || '';
      const computerAccess =
        user.computerAccessAnalysis ||
        (session.userContext && session.userContext.computerAccessAnalysis);
      if (computerAccess) {
        description = `🔑 <b>Доступ до ПК:</b> ${TelegramUtils.escapeHtml(computerAccess)}\n\n${description}`;
      }

      const ticketData = {
        title: session.ticketData.title,
        description: description,
        priority: session.ticketData.priority,
        createdBy: user._id,
        city: user.city,
        status: 'open',
        ...(session.ticketData.subcategory !== null &&
          String(session.ticketData.subcategory).trim() && {
            subcategory: String(session.ticketData.subcategory).trim().slice(0, 100),
          }),
        type: ticketType,
        metadata: {
          source: session.mode === 'ai' ? 'telegram_ai' : 'telegram',
        },
        attachments: [
          // Додаємо фото
          ...(session.ticketData.photos || []).map(photo => {
            let fileSize = 0;
            try {
              const stats = fs.statSync(photo.path);
              fileSize = stats.size;
            } catch (error) {
              logger.error(`Помилка отримання розміру файлу ${photo.path}:`, error);
            }

            return {
              filename: path.basename(photo.path),
              originalName: photo.caption || path.basename(photo.path),
              mimetype: 'image/jpeg', // Можна визначити тип файлу пізніше
              size: fileSize,
              path: photo.path,
              uploadedBy: user._id,
              caption: photo.caption,
            };
          }),
          // Додаємо документи
          ...(session.ticketData.documents || []).map(doc => {
            let fileSize = 0;
            try {
              const stats = fs.statSync(doc.path);
              fileSize = stats.size;
            } catch (error) {
              logger.error(`Помилка отримання розміру файлу ${doc.path}:`, error);
            }

            // Визначаємо MIME тип на основі розширення
            const mimeTypes = {
              '.pdf': 'application/pdf',
              '.doc': 'application/msword',
              '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              '.xls': 'application/vnd.ms-excel',
              '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              '.txt': 'text/plain',
              '.zip': 'application/zip',
              '.rar': 'application/x-rar-compressed',
              '.7z': 'application/x-7z-compressed',
              '.mp3': 'audio/mpeg',
              '.mp4': 'video/mp4',
              '.avi': 'video/x-msvideo',
              '.mov': 'video/quicktime',
            };

            const docExt = (
              doc.extension ||
              path.extname(doc.path || '') ||
              path.extname(doc.fileName || '')
            ).toLowerCase();
            const mimeType = mimeTypes[docExt] || doc.mimeType || 'application/octet-stream';

            return {
              filename: path.basename(doc.path),
              originalName: doc.fileName || doc.caption || path.basename(doc.path),
              mimetype: mimeType,
              size: fileSize,
              path: doc.path,
              uploadedBy: user._id,
              caption: doc.caption,
            };
          }),
        ],
      };

      const ticket = new Ticket(ticketData);
      await ticket.save();

      // Зберігаємо діалог з ботом у тікет та привʼязуємо розмову (для навчання AI)
      if (session.mode === 'ai' && session.dialog_history && session.dialog_history.length > 0) {
        botConversationService
          .linkTicketAndSaveDialog(chatId, user, ticket._id, session.dialog_history)
          .catch(() => {});
      }

      // Заповнюємо дані для WebSocket сповіщення
      await ticket.populate([
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'city', select: 'name region' },
      ]);

      // Відправляємо WebSocket сповіщення про новий тікет
      try {
        ticketWebSocketService.notifyNewTicket(ticket);
        logger.info('✅ WebSocket сповіщення про новий тікет відправлено (Telegram)');
      } catch (wsError) {
        logger.error(
          '❌ Помилка відправки WebSocket сповіщення про новий тікет (Telegram):',
          wsError
        );
      }

      // Відправка FCM сповіщення адміністраторам про новий тікет
      try {
        logger.info(
          '📱 Спроба відправки FCM сповіщення адміністраторам про новий тікет (Telegram)'
        );
        const adminCount = await fcmService.sendToAdmins({
          title: '🎫 Новий тікет',
          body: `Створено новий тікет: ${ticket.title}`,
          type: 'ticket_created',
          data: {
            ticketId: ticket._id.toString(),
            ticketTitle: ticket.title,
            ticketStatus: ticket.status,
            ticketPriority: ticket.priority,
            createdBy:
              ticket.createdBy?.firstName && ticket.createdBy?.lastName
                ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}`
                : 'Невідомий користувач',
          },
        });
        logger.info(
          `✅ FCM сповіщення про новий тікет відправлено ${adminCount} адміністраторам (Telegram)`
        );
      } catch (error) {
        logger.error('❌ Помилка відправки FCM сповіщення про новий тікет (Telegram):', error);
        logger.error('   Stack:', error.stack);
        // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
      }

      // Відправка FCM сповіщення призначеному користувачу (якщо тікет призначено при створенні)
      if (ticket.assignedTo) {
        try {
          await fcmService.sendToUser(ticket.assignedTo.toString(), {
            title: '🎫 Новий тікет призначено вам',
            body: `Вам призначено тікет: ${ticket.title}`,
            type: 'ticket_assigned',
            data: {
              ticketId: ticket._id.toString(),
              ticketTitle: ticket.title,
              ticketStatus: ticket.status,
              ticketPriority: ticket.priority,
              createdBy:
                ticket.createdBy?.firstName && ticket.createdBy?.lastName
                  ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}`
                  : 'Невідомий користувач',
            },
          });
          logger.info(
            '✅ FCM сповіщення про призначення тікету відправлено користувачу (Telegram)'
          );
        } catch (error) {
          logger.error('❌ Помилка відправки FCM сповіщення про призначення (Telegram):', error);
        }
      }

      // Відправка Telegram сповіщення про новий тікет в групу
      try {
        logger.info('📢 Спроба відправки Telegram сповіщення в групу про новий тікет (Telegram)');
        await this.telegramService.notificationService.sendNewTicketNotificationToGroup(
          ticket,
          user
        );
        logger.info('✅ Telegram сповіщення в групу відправлено (Telegram)');
      } catch (error) {
        logger.error('❌ Помилка відправки Telegram сповіщення в групу (Telegram):', error);
        logger.error('   Stack:', error.stack);
        // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
      }

      // 🆕 Завершуємо AI діалог перед очищенням сесії
      if (session.aiDialogId) {
        await this.telegramService.completeAIDialog(
          session.aiDialogId,
          'ticket_created',
          ticket._id
        );
      }

      // Очищуємо сесію
      this.userSessions.delete(chatId);

      const filler = await aiFirstLineService.generateConversationalResponse(
        session.dialog_history || [],
        'session_closed',
        session.userContext || {},
        session.cachedEmotionalTone || 'calm',
        { priority: ticket?.priority || session?.cachedPriority || 'medium' }
      );
      const afterHoursNote = isAfterHours()
        ? '\n\n⏰ <i>Тікет створено в неробочий час. Адмін побачить його на початку наступного робочого дня (пн–пт, 9:00–18:00).</i>'
        : '';
      const confirmText =
        `🎉 <b>${TelegramUtils.escapeHtml(filler)}</b>\n` +
        `🆔 <code>${ticket._id}</code>` +
        afterHoursNote;

      await this.sendMessage(chatId, confirmText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
        },
      });

      logger.info(`Тікет створено через Telegram: ${ticket._id} користувачем ${user.email}`);
    } catch (error) {
      logger.error('Помилка створення тікету:', error);
      await this.sendMessage(
        chatId,
        `❌ <b>Помилка створення тікету</b>\n\n` +
          `Виникла технічна помилка при створенні тікету.\n\n` +
          `🔄 Спробуйте ще раз або зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>`,
        { parse_mode: 'HTML' }
      );
    }
  }
}

module.exports = TelegramTicketService;
