const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const PendingRegistration = require('../models/PendingRegistration');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const BotSettings = require('../models/BotSettings');
const TelegramConfig = require('../models/TelegramConfig');
const sessionManager = require('./sessionManager');
const TelegramUtils = require('./telegramUtils');
const TelegramNotificationService = require('./telegramNotificationService');
const TelegramRegistrationService = require('./telegramRegistrationService');
const TelegramTicketService = require('./telegramTicketService');
const TelegramAIService = require('./telegramAIService');
const aiFirstLineService = require('./aiFirstLineService');
const botConversationService = require('./botConversationService');

class TelegramService {
  constructor() {
    this.bot = null;
    this.notificationService = new TelegramNotificationService(this);
    this.registrationService = new TelegramRegistrationService(this);
    this.ticketService = new TelegramTicketService(this);
    this.aiService = new TelegramAIService(this);
    this.isInitialized = false; // Додаємо флаг ініціалізації
    // PersistentMap — синхронний API Map + автоматична синхронізація з Redis
    this.userSessions = sessionManager.createSessionsMap();
    this.userStates = sessionManager.createStatesMap();
    this.stateStack = sessionManager.createStateStackMap();
    this.botSettings = null; // Налаштування бота з БД
    this.mode = 'webhook';
    this.conversationHistory = sessionManager.createConversationHistoryMap();
    this.navigationHistory = sessionManager.createNavigationHistoryMap();
    this._initializing = false; // Флаг для перевірки процесу ініціалізації
    this.internetRequestCounts = sessionManager.createInternetRequestCountsMap();
    this.loadBotSettings(); // Завантажуємо налаштування бота
  }

  static get INTERNET_REQUESTS_LIMIT_PER_DAY() {
    return 5;
  }
  static get INTERNET_REQUESTS_EXEMPT_TELEGRAM_ID() {
    return '6070910226';
  }

  async initialize() {
    // Перевіряємо, чи бот вже ініціалізований
    if (this.isInitialized && this.bot) {
      logger.info('Telegram бот вже ініціалізовано');
      return;
    }

    // Якщо бот вже ініціалізується, чекаємо
    if (this._initializing) {
      logger.info('Telegram бот вже ініціалізується, чекаємо...');
      return new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (this.isInitialized) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 5000);
      });
    }

    this._initializing = true;

    try {
      let cfg = null;
      try {
        cfg = await TelegramConfig.findOne({ key: 'default' });
      } catch (e) {
        // Ігноруємо помилку, використаємо token з env
        logger.debug('Не вдалося завантажити TelegramConfig з БД');
      }
      const token = (cfg?.botToken && cfg.botToken.trim()) || process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        logger.error('TELEGRAM_BOT_TOKEN не встановлено');
        this.isInitialized = false;
        return;
      }

      const hasWebhookUrl = !!(cfg?.webhookUrl && cfg.webhookUrl.trim());
      const usePolling = !hasWebhookUrl;
      this.mode = usePolling ? 'polling' : 'webhook';

      try {
        this.bot = new TelegramBot(
          token,
          usePolling ? { polling: { interval: 1000, params: { timeout: 10 } } } : { polling: false }
        );
        if (usePolling) {
          this.bot.on('message', msg => this.handleMessage(msg));
          this.bot.on('callback_query', cq => this.handleCallbackQuery(cq));
          this.bot.on('polling_error', err => {
            // Якщо помилка 404 - токен невалідний, вимикаємо бота
            if (err.code === 'ETELEGRAM' && err.response?.statusCode === 404) {
              logger.warn(
                '⚠️ Telegram токен невалідний або бот не знайдено. Telegram бот вимкнено.'
              );
              this.bot = null;
              this.isInitialized = false;
              this._initializing = false;
              return;
            }
            // Якщо помилка 409 - конфлікт з іншим інстансом бота
            if (
              err.code === 'ETELEGRAM' &&
              (err.response?.statusCode === 409 || err.message?.includes('409'))
            ) {
              logger.warn(
                '⚠️ Конфлікт з іншим інстансом Telegram бота (409). Можливо, запущено кілька процесів. Зупиняємо polling.'
              );
              try {
                if (this.bot && this.bot.stopPolling) {
                  this.bot.stopPolling();
                }
              } catch (stopError) {
                logger.error('Помилка зупинки polling:', stopError);
              }
              this.bot = null;
              this.isInitialized = false;
              this._initializing = false;
              return;
            }
            logger.error('Помилка polling:', err);
          });
          logger.info('✅ Telegram бот запущено у режимі polling');
        } else {
          logger.info('✅ Telegram бот запущено у режимі webhook');
        }
        this.isInitialized = true;
        this._initializing = false;
      } catch (botError) {
        // Якщо не вдалося створити бота (наприклад, невалідний токен)
        logger.warn('⚠️ Не вдалося ініціалізувати Telegram бота:', botError.message);
        this.bot = null;
        this.isInitialized = false;
        return;
      }

      try {
        await this.loadBotSettings();
      } catch (catErr) {
        logger.warn('⚠️ Не вдалося оновити налаштування після ініціалізації:', catErr);
      }

      // Відновлення сесій з Redis (якщо доступний)
      try {
        await sessionManager.hydrateAll({
          sessions: this.userSessions,
          states: this.userStates,
          stateStack: this.stateStack,
          conversationHistory: this.conversationHistory,
          navigationHistory: this.navigationHistory,
          internetRequestCounts: this.internetRequestCounts,
        });
      } catch (hydrateErr) {
        logger.warn('⚠️ Не вдалося відновити сесії з Redis:', hydrateErr.message);
      }
    } catch (error) {
      logger.error('Помилка ініціалізації Telegram бота:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Відправка сповіщення користувачу через Telegram
   * @param {String} chatId - ID чату користувача
   * @param {String} message - Текст сповіщення
   * @param {Object} options - Додаткові опції для відправки повідомлення
   * @returns {Promise}
   */
  sendNotification(chatId, message, options = {}) {
    return this.sendMessage(chatId, message, options);
  }

  /**
   * Відправити сповіщення про підтвердження реєстрації
   * @param {String} chatId - ID чату користувача
   * @returns {Promise}
   */
  sendRegistrationApprovedNotification(chatId) {
    return this.sendMessage(
      chatId,
      '✅ Ваш запит на реєстрацію схвалено! Тепер ви можете створювати тікети.'
    );
  }

  /**
   * Відправити сповіщення про відхилення реєстрації
   * @param {String} chatId - ID чату користувача
   * @param {String} reason - Причина відхилення (необов'язково)
   * @returns {Promise}
   */
  sendRegistrationRejectedNotification(chatId, reason) {
    return this.sendMessage(
      chatId,
      `❌ Ваш запит на реєстрацію відхилено.\nПричина: ${reason || 'не вказана'}`
    );
  }

  /** Показати індикатор «друкує» в чаті (typing). Діє ~5 сек, для довгих операцій викликати перед кожною. */
  async sendTyping(chatId) {
    if (!this.bot) {
      return;
    }
    try {
      await this.bot.sendChatAction(chatId, 'typing');
    } catch (err) {
      logger.debug('sendTyping не вдалося', { chatId, message: err?.message });
    }
  }

  async sendMessage(chatId, text, options = {}) {
    if (!this.bot) {
      logger.error('Telegram бот не ініціалізовано');
      return;
    }
    // Завжди надсилати пуш-сповіщення (disable_notification в кінці, щоб ніхто не вимкнув)
    const defaultOptions = { parse_mode: 'Markdown', ...options, disable_notification: false };
    const maxAttempts = 3;
    let attempt = 0;
    let lastError = null;
    while (attempt < maxAttempts) {
      try {
        logger.debug(`Відправляю повідомлення в чат ${chatId}`, { text: text?.substring(0, 50) });
        const result = await this.bot.sendMessage(chatId, text, defaultOptions);
        logger.debug(`Повідомлення успішно відправлено в чат ${chatId}`, {
          messageId: result.message_id,
        });
        return result;
      } catch (error) {
        // Якщо помилка пов'язана з парсингом Markdown, спробуємо відправити як звичайний текст
        if (
          error.message?.includes("can't parse entities") ||
          error.message?.includes("Bad Request: can't parse entities")
        ) {
          logger.warn(
            `Помилка парсингу Markdown для чату ${chatId}, спроба відправки як звичайний текст`
          );
          try {
            const noMarkdownOptions = { ...defaultOptions };
            delete noMarkdownOptions.parse_mode;
            const result = await this.bot.sendMessage(chatId, text, noMarkdownOptions);
            logger.info(`Повідомлення успішно відправлено в чат ${chatId} без Markdown`);
            return result;
          } catch (retryError) {
            lastError = retryError;
            // Продовжуємо цикл спроб, якщо це не помилка парсингу
          }
        }

        lastError = error;
        attempt += 1;
        if (attempt >= maxAttempts) {
          break;
        }
        const delayMs = attempt * 500;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    logger.error('Помилка відправки повідомлення:', {
      chatId,
      error: lastError?.message,
      stack: lastError?.stack,
      response: lastError?.response?.data,
    });
    throw lastError;
  }

  async deleteMessage(chatId, messageId) {
    try {
      if (!this.bot) {
        logger.error('Telegram бот не ініціалізовано');
        return;
      }
      return await this.bot.deleteMessage(chatId, messageId);
    } catch (error) {
      logger.error('Помилка видалення повідомлення:', error);
      throw error;
    }
  }

  async handleMessage(msg) {
    try {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const chatType = msg.chat.type;

      // Заборона створення тікетів через групи - тільки приватні чати
      if (chatType !== 'private') {
        logger.info(`Повідомлення ігноровано - не приватний чат (тип: ${chatType})`, {
          chatId,
          userId,
          chatType,
        });
        return; // Ігноруємо повідомлення з груп, супергруп та каналів
      }

      logger.info(`Отримано повідомлення від користувача ${userId} в чаті ${chatId}`, {
        text: msg.text?.substring(0, 100),
        hasPhoto: !!msg.photo,
        hasVoice: !!msg.voice,
        hasContact: !!msg.contact,
        chatType,
      });

      // Перевірка, чи користувач вже зареєстрований
      // Конвертуємо userId в рядок, оскільки telegramId зберігається як String
      const existingUser = await User.findOne({
        $or: [{ telegramId: String(userId) }, { telegramId: userId }],
      })
        .populate('position', 'title')
        .populate('city', 'name');

      // Якщо користувач вже зареєстрований, показуємо головне меню
      if (existingUser && !msg.text?.startsWith('/')) {
        // Обробка голосових повідомлень
        if (msg.voice) {
          await this.aiService.handleVoice(msg, existingUser);
          return;
        }

        // Обробка фото: оновлення доступу до ПК (кнопка з меню); AI-режим; або тільки під час створення тікета
        if (msg.photo) {
          const session = this.userSessions.get(msg.chat.id);
          if (session && session.step === 'awaiting_computer_access_photo') {
            const u = session.userForAccessPhoto || existingUser;
            const result = await this._saveComputerAccessPhotoFromTelegram(
              msg.chat.id,
              msg.photo[msg.photo.length - 1].file_id,
              u
            );
            this.userSessions.delete(msg.chat.id);
            if (result && result.success) {
              let text =
                '✅ Фото доступу до ПК оновлено у вашому профілі. Адмін перегляне його в картці користувача.';
              if (result.analysis) {
                text += `\n\n📋 Розпізнано: ${result.analysis}`;
              }
              await this.sendMessage(msg.chat.id, text, {
                reply_markup: {
                  inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
                },
              });
            } else {
              await this.sendMessage(
                msg.chat.id,
                'Помилка збереження фото. Спробуйте ще раз або зверніться до адміна.',
                {
                  reply_markup: {
                    inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
                  },
                }
              );
            }
            return;
          }
          if (session && session.mode === 'ai') {
            await this.handlePhotoInAiMode(
              msg.chat.id,
              msg.photo,
              msg.caption || '',
              session,
              existingUser
            );
            return;
          }
          await this.handlePhoto(msg);
          return;
        }

        // Обробка документів (файлів) для зареєстрованих користувачів
        if (msg.document) {
          await this.handleDocument(msg);
          return;
        }

        // Обробка контактів для зареєстрованих користувачів
        if (msg.contact) {
          await this.registrationService.handleContact(msg);
          return;
        }

        // Якщо це не команда — завжди передаємо текст у handleTextMessage (сесія є чи ні: AI може стартувати з першого повідомлення)
        if (!msg.text?.startsWith('/') && msg.text) {
          await this.handleTextMessage(msg);
          return;
        }
      }

      // Обробка фото
      if (msg.photo) {
        await this.handlePhoto(msg);
        return;
      }

      // Обробка контактів (поділитися номером)
      if (msg.contact) {
        await this.registrationService.handleContact(msg);
        return;
      }

      // Обробка команд
      if (msg.text && msg.text.startsWith('/')) {
        logger.info(`Обробка команди: ${msg.text}`);
        await this.handleCommand(msg);
        return;
      }

      // Обробка звичайних повідомлень
      await this.handleTextMessage(msg);
    } catch (error) {
      logger.error('Помилка обробки повідомлення:', {
        error: error.message,
        stack: error.stack,
        chatId: msg.chat?.id,
        userId: msg.from?.id,
      });
      try {
        await this.sendMessage(msg.chat.id, 'Виникла помилка. Спробуйте ще раз.');
      } catch (sendError) {
        logger.error('Не вдалося відправити повідомлення про помилку:', sendError);
      }
    }
  }

  async handleCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const command = msg.text.split(' ')[0];

    try {
      // Конвертуємо userId в рядок для пошуку
      const user = await User.findOne({
        $or: [{ telegramId: String(userId) }, { telegramId: userId }],
      });

      switch (command) {
        case '/start':
          await this.handleStartCommand(chatId, userId, msg);
          break;
        case '/menu':
          // Показуємо головне меню
          if (user) {
            await this.showUserDashboard(chatId, user);
          } else {
            await this.sendMessage(
              chatId,
              `🚫 *Помилка авторизації*\n\n` +
                `Ви не авторизовані в системі.\n\n` +
                `🔑 Використайте /start для початку роботи.`
            );
          }
          break;
        case '/help':
          await this.handleHelpCommand(chatId, user);
          break;
        case '/status':
          if (user) {
            await this.handleStatusCommand(chatId, user);
          } else {
            await this.sendMessage(
              chatId,
              `🚫 *Помилка авторизації*\n\n` +
                `Ви не авторизовані в системі.\n\n` +
                `🔑 Використайте /start для початку роботи.`
            );
          }
          break;
        default:
          if (!user) {
            await this.sendMessage(
              chatId,
              `🚫 *Помилка авторизації*\n\n` +
                `Ви не авторизовані в системі.\n\n` +
                `🔑 Використайте /start для початку роботи.`
            );
            return;
          }
          await this.sendMessage(
            chatId,
            `❓ *Невідома команда*\n\n` +
              `Команда не розпізнана системою.\n\n` +
              `💡 Використайте /start для перегляду доступних опцій.`
          );
      }
    } catch (error) {
      logger.error('Помилка обробки команди:', error);
      await this.sendMessage(
        chatId,
        `❌ *Системна помилка*\n\n` +
          `Виникла помилка при обробці команди.\n\n` +
          `🔄 Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  async handleStartCommand(chatId, userId, msg) {
    try {
      // Конвертуємо userId та chatId в рядки для пошуку
      const userIdString = String(userId);
      const chatIdString = String(chatId);
      const usernameFromMsg = msg?.from?.username
        ? msg.from.username.replace(/^@/, '').toLowerCase()
        : null;

      // Спочатку шукаємо за telegramId
      let user = await User.findOne({
        $or: [{ telegramId: userIdString }, { telegramId: userId }],
      })
        .populate('position', 'name')
        .populate('city', 'name');

      // Додатковий пошук: якщо telegramId збережений із префіксом '@' або пробілами
      if (!user) {
        const prefixedId = `@${userIdString}`;
        const spacedId = ` ${userIdString} `;
        user = await User.findOne({
          telegramId: {
            $in: [prefixedId, spacedId, `@ ${userIdString}`, `${userIdString} `],
          },
        })
          .populate('position', 'name')
          .populate('city', 'name');

        if (user) {
          logger.info(
            'Знайдено користувача з telegramId у форматі з префіксом або пробілами. Оновлюємо значення.',
            {
              userId: user._id,
              email: user.email,
              storedTelegramId: user.telegramId,
              sanitizedTelegramId: userIdString,
            }
          );
          user.telegramId = userIdString;
          await user.save();
        }
      }

      // Якщо досі не знайдено, пробуємо знайти за telegramChatId
      if (!user) {
        logger.info('Пробуємо знайти користувача за telegramChatId:', {
          chatIdString,
          chatId,
        });

        user = await User.findOne({
          $or: [{ telegramChatId: chatIdString }, { telegramChatId: String(chatId) }],
        })
          .populate('position', 'name')
          .populate('city', 'name');

        if (user) {
          logger.info('Знайдено користувача за telegramChatId, оновлюємо дані Telegram:', {
            userId: user._id,
            email: user.email,
            oldTelegramId: user.telegramId,
            newTelegramId: userIdString,
            oldTelegramChatId: user.telegramChatId,
            newTelegramChatId: chatIdString,
          });

          user.telegramId = userIdString;
          user.telegramChatId = chatIdString;
          if (usernameFromMsg && user.telegramUsername !== usernameFromMsg) {
            user.telegramUsername = usernameFromMsg;
          }
          await user.save();
        }
      }

      // Якщо досі не знайдено, пробуємо знайти за telegramUsername
      // Перевіряємо, чи в telegramUsername зберігається ID у форматі @1234567890 або просто 1234567890
      if (!user) {
        logger.info('Пробуємо знайти користувача за telegramUsername (може містити ID):');

        // Шукаємо за значенням @userIdString
        const idInUsernameWithAt = `@${userIdString}`;
        user = await User.findOne({
          telegramUsername: idInUsernameWithAt,
        })
          .populate('position', 'name')
          .populate('city', 'name');

        // Якщо не знайдено, пробуємо без префіса @
        if (!user) {
          user = await User.findOne({
            telegramUsername: userIdString,
          })
            .populate('position', 'name')
            .populate('city', 'name');
        }

        if (user) {
          logger.info('Знайдено користувача за telegramUsername, де зберігається ID:', {
            userId: user._id,
            email: user.email,
            telegramUsername: user.telegramUsername,
            extractedId: userIdString,
            expectedId: userIdString,
            foundWithAt: user.telegramUsername === idInUsernameWithAt,
          });

          logger.info('Оновлюємо дані Telegram для користувача (ID був в telegramUsername):', {
            userId: user._id,
            email: user.email,
            oldTelegramId: user.telegramId,
            newTelegramId: userIdString,
            oldTelegramChatId: user.telegramChatId,
            newTelegramChatId: chatIdString,
            oldTelegramUsername: user.telegramUsername,
          });

          user.telegramId = userIdString;
          user.telegramChatId = chatIdString;
          // Оновлюємо telegramUsername на правильний username, якщо він є
          if (usernameFromMsg && user.telegramUsername !== usernameFromMsg) {
            user.telegramUsername = usernameFromMsg;
          }
          // Якщо username відсутній, залишаємо ID в telegramUsername (для сумісності)
          await user.save();
        }
      }

      // Якщо досі не знайдено і є usernameFromMsg, пробуємо знайти за звичайним telegramUsername
      if (!user && usernameFromMsg) {
        logger.info('Пробуємо знайти користувача за telegramUsername (звичайний пошук):', {
          usernameFromMsg,
          originalUsername: msg.from.username,
        });

        user = await User.findOne({
          telegramUsername: { $regex: new RegExp(`^${usernameFromMsg}$`, 'i') },
        })
          .populate('position', 'name')
          .populate('city', 'name');

        if (user) {
          logger.info('Знайдено користувача за telegramUsername, оновлюємо дані Telegram:', {
            userId: user._id,
            email: user.email,
            oldTelegramId: user.telegramId,
            newTelegramId: userIdString,
            oldTelegramChatId: user.telegramChatId,
            newTelegramChatId: chatIdString,
            storedTelegramUsername: user.telegramUsername,
          });

          user.telegramId = userIdString;
          user.telegramChatId = chatIdString;
          if (user.telegramUsername !== usernameFromMsg) {
            user.telegramUsername = usernameFromMsg;
          }
          await user.save();
        }
      }

      // Діагностичне логування
      logger.info('Пошук користувача за telegramId:', {
        userId,
        userIdString,
        chatId,
        chatIdString,
        usernameFromMsg,
        userFound: !!user,
        userIdType: typeof userId,
        userTelegramId: user?.telegramId,
        userTelegramIdType: typeof user?.telegramId,
        userTelegramChatId: user?.telegramChatId,
        userTelegramChatIdType: typeof user?.telegramChatId,
        isActive: user?.isActive,
        registrationStatus: user?.registrationStatus,
        email: user?.email,
        userId_db: user?._id,
      });

      if (user) {
        // Оновлюємо telegramChatId якщо він відрізняється або відсутній
        if (user.telegramChatId !== chatIdString) {
          logger.info('Оновлюємо telegramChatId для користувача:', {
            userId: user._id,
            email: user.email,
            oldChatId: user.telegramChatId,
            newChatId: chatIdString,
          });
          user.telegramChatId = chatIdString;
          await user.save();
          // Перезавантажуємо користувача з populate після збереження
          user = await User.findById(user._id)
            .populate('position', 'name')
            .populate('city', 'name');
        }

        // Перевіряємо, чи користувач активний
        if (!user.isActive) {
          await this.sendMessage(
            chatId,
            `🚫 *Доступ обмежено*\n\n` +
              `Ваш обліковий запис поки не активований.\n\n` +
              `📞 Зверніться до адміністратора для активації: [@Kultup](https://t.me/Kultup)`,
            { parse_mode: 'Markdown' }
          );
          return;
        }

        await this.showUserDashboard(chatId, user);
      } else {
        // Логуємо, що користувач не знайдений
        logger.warn('Користувача не знайдено в базі даних:', {
          userId,
          userIdString,
          chatId,
          chatIdString,
          usernameFromMsg,
          searchAttempts: [
            'telegramId as String',
            'telegramId as Number',
            "telegramId with '@' prefix / spaces",
            'telegramChatId as String',
            'telegramChatId as Number',
            'telegramUsername containing ID (@1234567890)',
            'telegramUsername containing ID (1234567890 without @)',
            'telegramUsername (case-insensitive)',
            'test user auto-update (admin/test.com)',
          ],
        });

        // Додаткова діагностика: перевіряємо тестового користувача та автоматично оновлюємо telegramId
        try {
          const testUser = await User.findOne({ email: 'kultup@test.com' });
          if (testUser) {
            logger.info('Знайдено тестового користувача kultup@test.com:', {
              userId_db: testUser._id,
              telegramId: testUser.telegramId,
              telegramIdType: typeof testUser.telegramId,
              telegramChatId: testUser.telegramChatId,
              telegramChatIdType: typeof testUser.telegramChatId,
              isActive: testUser.isActive,
              role: testUser.role,
              expectedTelegramId: userIdString,
              telegramIdMatch: testUser.telegramId === userIdString,
              usernameFromMsg,
            });

            // Автоматично оновлюємо telegramId для тестового/адмін користувача, якщо:
            // 1. telegramId відсутній (null/undefined) АБО
            // 2. telegramId не співпадає з поточним userId АБО
            // 3. користувач має роль admin
            const shouldUpdate =
              !testUser.telegramId ||
              testUser.telegramId !== userIdString ||
              testUser.role === 'admin';

            if (
              shouldUpdate &&
              (testUser.role === 'admin' || testUser.email === 'kultup@test.com')
            ) {
              logger.info('Автоматично оновлюємо telegramId для тестового/адмін користувача:', {
                email: testUser.email,
                role: testUser.role,
                oldTelegramId: testUser.telegramId || 'відсутній',
                newTelegramId: userIdString,
                oldTelegramChatId: testUser.telegramChatId || 'відсутній',
                newTelegramChatId: chatIdString,
                reason: !testUser.telegramId
                  ? 'telegramId відсутній'
                  : testUser.telegramId !== userIdString
                    ? 'telegramId не співпадає'
                    : 'роль admin',
              });

              testUser.telegramId = userIdString;
              testUser.telegramChatId = chatIdString;
              if (usernameFromMsg) {
                testUser.telegramUsername = usernameFromMsg;
              }
              await testUser.save();

              logger.info('✅ Дані Telegram оновлено для користувача:', {
                email: testUser.email,
                telegramId: testUser.telegramId,
                telegramChatId: testUser.telegramChatId,
              });

              // Використовуємо оновленого користувача
              user = await User.findById(testUser._id)
                .populate('position', 'name')
                .populate('city', 'name');
            } else {
              logger.info('Не оновлюємо telegramId для користувача:', {
                email: testUser.email,
                reason: 'умова не виконана',
                shouldUpdate,
                isAdmin: testUser.role === 'admin',
                isTestEmail: testUser.email === 'kultup@test.com',
              });
            }
          } else {
            logger.warn('Тестовий користувач kultup@test.com не знайдено в базі даних');
          }
        } catch (diagError) {
          logger.error('Помилка діагностики:', diagError);
        }

        // Якщо користувача знайдено після автоматичного оновлення, обробляємо його
        if (user) {
          // Оновлюємо telegramChatId якщо він відрізняється або відсутній
          if (user.telegramChatId !== chatIdString) {
            logger.info('Оновлюємо telegramChatId для користувача (після auto-update):', {
              userId: user._id,
              email: user.email,
              oldChatId: user.telegramChatId,
              newChatId: chatIdString,
            });
            user.telegramChatId = chatIdString;
            await user.save();
            // Перезавантажуємо користувача з populate після збереження
            user = await User.findById(user._id)
              .populate('position', 'name')
              .populate('city', 'name');
          }

          // Перевіряємо, чи користувач активний
          if (!user.isActive) {
            await this.sendMessage(
              chatId,
              `🚫 *Доступ обмежено*\n\n` +
                `Ваш обліковий запис поки не активований.\n\n` +
                `📞 Зверніться до адміністратора для активації: [@Kultup](https://t.me/Kultup)`,
              { parse_mode: 'Markdown' }
            );
            return;
          }

          await this.showUserDashboard(chatId, user);
        } else {
          // Якщо користувача все ще не знайдено, показуємо повідомлення про реєстрацію
          await this.sendMessage(
            chatId,
            `🚫 *Доступ обмежено*\n` +
              `Для використання бота потрібно зареєструватися.\n` +
              `📞 Адміністратор: [@Kultup](https://t.me/Kultup)`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '🔐 Авторизуватися', callback_data: 'login_user' },
                    { text: '📝 Зареєструватися', callback_data: 'register_user' },
                  ],
                  [{ text: "📞 Зв'язатися з адміністратором", url: 'https://t.me/Kultup' }],
                ],
              },
            }
          );
        }
      }
    } catch (error) {
      logger.error('Помилка обробки команди /start:', {
        error: error.message,
        stack: error.stack,
        chatId,
        userId,
        usernameFromMsg: msg?.from?.username,
      });
      await this.sendMessage(
        chatId,
        `❌ *Помилка системи*\n\n` +
          `Виникла технічна помилка. Спробуйте ще раз через кілька хвилин.`
      );
    }
  }

  async showUserDashboard(chatId, user) {
    // Очищаємо історію навігації при показі головного меню
    this.clearNavigationHistory(chatId);

    // Завжди перезавантажуємо користувача з populate для отримання актуальних даних
    try {
      user = await User.findById(user._id || user)
        .populate('position', 'title name')
        .populate('city', 'name region');

      if (!user) {
        logger.error('Користувач не знайдений при показі dashboard', { chatId, userId: user?._id });
        await this.sendMessage(
          chatId,
          '❌ Помилка: користувач не знайдений. Зверніться до адміністратора.'
        );
        return;
      }
    } catch (error) {
      logger.error('Помилка завантаження даних користувача для dashboard', {
        chatId,
        userId: user?._id,
        error: error.message,
      });
      await this.sendMessage(chatId, '❌ Помилка завантаження даних профілю. Спробуйте ще раз.');
      return;
    }

    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Не вказано';

    // Отримуємо назву посади
    let positionName = 'Не вказано';
    if (user.position) {
      if (typeof user.position === 'object' && user.position !== null) {
        positionName = user.position.title || user.position.name || 'Не вказано';
      } else if (typeof user.position === 'string') {
        positionName = user.position;
      }
    } else {
      logger.info('Користувач не має посади', { userId: user._id, email: user.email });
    }

    // Отримуємо назву міста
    let cityName = 'Не вказано';
    if (user.city) {
      if (typeof user.city === 'object' && user.city !== null) {
        cityName = user.city.name || 'Не вказано';
      } else if (typeof user.city === 'string') {
        cityName = user.city;
      }
    } else {
      logger.info('Користувач не має міста', { userId: user._id, email: user.email });
    }

    // Логування для діагностики
    logger.info('Відображення dashboard користувача', {
      userId: user._id,
      email: user.email,
      hasPosition: !!user.position,
      positionType: typeof user.position,
      positionValue: user.position,
      hasCity: !!user.city,
      cityType: typeof user.city,
      cityValue: user.city,
      positionName,
      cityName,
    });

    const welcomeText =
      `🎉 *Вітаємо в системі підтримки!*\n` +
      `👤 *Профіль:* ${fullName}\n` +
      `📧 \`${user.email}\` | 💼 ${positionName} | 🏙️ ${cityName}\n` +
      `\n🎯 *Оберіть дію:*`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📝 Створити тікет', callback_data: 'create_ticket' },
          { text: '📋 Мої тікети', callback_data: 'my_tickets' },
        ],
        [
          { text: '📜 Історія тікетів', callback_data: 'ticket_history' },
          { text: '📊 Статистика', callback_data: 'statistics' },
        ],
        [{ text: '📷 Оновити доступ до ПК', callback_data: 'update_computer_access' }],
      ],
    };

    const telegramIdStr = String(user?.telegramId ?? user?.telegramChatId ?? chatId);
    if (telegramIdStr === TelegramService.INTERNET_REQUESTS_EXEMPT_TELEGRAM_ID) {
      keyboard.inline_keyboard.push([
        { text: '🔢 Перевірити токени AI', callback_data: 'check_tokens' },
      ]);
    }

    await this.sendMessage(chatId, welcomeText, { reply_markup: keyboard });
  }

  async handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const chatType = callbackQuery.message.chat.type;

    // Дозволяємо обробку callback для підтвердження/відхилення посади з груп
    const isPositionRequestCallback =
      data.startsWith('approve_position_') || data.startsWith('reject_position_');

    // Заборона обробки callback-запитів з груп - тільки приватні чати (крім position request)
    if (chatType !== 'private' && !isPositionRequestCallback) {
      logger.info(`Callback query ігноровано - не приватний чат (тип: ${chatType})`, {
        chatId,
        userId,
        data,
        chatType,
      });
      await this.answerCallbackQuery(callbackQuery.id, 'Бот працює тільки в приватних чатах');
      return; // Ігноруємо callback-запити з груп, супергруп та каналів
    }

    // Обробка callback для підтвердження/відхилення посади (з груп)
    if (isPositionRequestCallback) {
      await this.registrationService.handlePositionRequestCallback(callbackQuery);
      return;
    }

    try {
      logger.info('Обробка callback query:', { userId, data, chatId, messageId, chatType });

      // Спочатку перевіряємо, чи користувач вже зареєстрований
      // Конвертуємо userId в рядок для пошуку
      const user = await User.findOne({
        $or: [{ telegramId: String(userId) }, { telegramId: userId }],
      })
        .populate('position', 'title')
        .populate('city', 'name');

      // Якщо користувач вже зареєстрований, не дозволяємо повторну реєстрацію
      if (user) {
        // Обробка callback-запитів для зареєстрованих користувачів
        if (data === 'register_user') {
          // Якщо користувач вже зареєстрований, показуємо головне меню
          await this.showUserDashboard(chatId, user);
          await this.answerCallbackQuery(callbackQuery.id, 'Ви вже зареєстровані');
          return;
        }

        // Якщо користувач зареєстрований, обробляємо callback для зареєстрованих користувачів
        // Видаляємо попереднє повідомлення з інлайн кнопками
        try {
          await this.deleteMessage(chatId, messageId);
        } catch (deleteError) {
          logger.warn('Не вдалося видалити повідомлення:', deleteError.message);
        }

        if (data === 'update_computer_access') {
          this.userSessions.set(chatId, {
            step: 'awaiting_computer_access_photo',
            userForAccessPhoto: user,
          });
          await this.sendMessage(
            chatId,
            "📷 Надішліть фото доступу до комп'ютера (скріншот або документ). Воно буде збережено у вашому профілі замість попереднього — адмін перегляне його в картці користувача."
          );
          await this.answerCallbackQuery(callbackQuery.id);
          return;
        }

        if (data === 'skip_computer_access_photo' || data === 'skip_error_photo') {
          const session = this.userSessions.get(chatId);
          const isAccess = data === 'skip_computer_access_photo';
          const triggerString = isAccess ? 'фото доступу до ПК' : 'фото помилки';
          const logMsg = isAccess
            ? 'Пропустив надання фото доступу до ПК'
            : 'Пропустив надання фото помилки';

          if (
            session &&
            (isAccess ? session.awaitingComputerAccessPhoto : session.awaitingErrorPhoto)
          ) {
            if (isAccess) {
              session.awaitingComputerAccessPhoto = false;
            } else {
              session.awaitingErrorPhoto = false;
            }

            session.dialog_history = session.dialog_history || [];
            session.dialog_history.push({ role: 'user', content: `[${logMsg}]` });
            botConversationService.appendMessage(chatId, user, 'user', logMsg).catch(() => {});

            const lastMissing = session.lastMissingInfo || [];
            const remaining = lastMissing.filter(m => !String(m).includes(triggerString));
            session.lastMissingInfo = remaining;

            if (remaining.length === 0) {
              await this.sendTyping(chatId);
              const summary = await aiFirstLineService.getTicketSummary(
                session.dialog_history,
                session.userContext
              );
              if (summary) {
                session.step = 'confirm_ticket';
                session.ticketDraft = {
                  createdBy: user._id,
                  title: summary.title,
                  description: summary.description,
                  priority: summary.priority,
                  subcategory: summary.category,
                  type: 'problem',
                };
                const msg = `✅ *Перевірте, чи все правильно*\n\n📌 *Заголовок:*\n${summary.title}\n\n📝 *Опис:*\n${summary.description}\n\n📊 *Категорія:* ${summary.category}\n⚡ *Пріоритет:* ${summary.priority}\n\nВсе правильно?`;
                await this.sendMessage(chatId, msg, {
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
                      [{ text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' }],
                      [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }],
                    ],
                  },
                });
              } else {
                await this.sendMessage(
                  chatId,
                  'Не вдалося сформувати заявку. Спробуйте «Заповнити по-старому» або опишіть ще раз.',
                  {
                    reply_markup: {
                      inline_keyboard: [
                        [{ text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' }],
                        [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }],
                      ],
                    },
                  }
                );
              }
            } else {
              session.ai_questions_count = (session.ai_questions_count || 0) + 1;
              let nextQuestion;
              try {
                nextQuestion = await aiFirstLineService.generateNextQuestion(
                  session.dialog_history,
                  remaining,
                  session.userContext
                );
              } catch (err) {
                nextQuestion = 'Опишіть, будь ласка, деталі для заявки.';
              }
              session.dialog_history.push({ role: 'assistant', content: nextQuestion });
              botConversationService
                .appendMessage(chatId, user, 'assistant', nextQuestion)
                .catch(() => {});

              session.awaitingComputerAccessPhoto = remaining.some(m =>
                String(m).includes('фото доступу до ПК')
              );
              session.awaitingErrorPhoto = remaining.some(m => String(m).includes('фото помилки'));

              const kbd = [
                [{ text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' }],
                [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }],
              ];
              if (session.awaitingComputerAccessPhoto) {
                kbd.unshift([
                  {
                    text: '⏭️ Пропустити (без фото доступу)',
                    callback_data: 'skip_computer_access_photo',
                  },
                ]);
              } else if (session.awaitingErrorPhoto) {
                kbd.unshift([
                  { text: '⏭️ Пропустити (без фото помилки)', callback_data: 'skip_error_photo' },
                ]);
              }
              await this.sendMessage(chatId, nextQuestion, {
                reply_markup: { inline_keyboard: kbd },
              });
            }
          }
          await this.answerCallbackQuery(callbackQuery.id);
          return;
        }

        if (data === 'my_tickets') {
          this.pushNavigationHistory(chatId, 'my_tickets');
          await this.ticketService.handleMyTicketsCallback(chatId, user);
        } else if (data === 'ticket_history') {
          this.pushNavigationHistory(chatId, 'ticket_history');
          await this.ticketService.handleTicketHistoryCallback(chatId, user);
        } else if (data.startsWith('view_ticket_')) {
          const ticketId = data.replace('view_ticket_', '');
          this.pushNavigationHistory(chatId, `view_ticket_${ticketId}`);
          await this.ticketService.handleViewTicketCallback(chatId, user, ticketId);
        } else if (data.startsWith('recreate_ticket_')) {
          const ticketId = data.replace('recreate_ticket_', '');
          await this.ticketService.handleRecreateTicketCallback(chatId, user, ticketId);
        } else if (data === 'use_previous_title') {
          await this.ticketService.handleUsePreviousTitleCallback(chatId, user);
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'use_previous_description') {
          await this.ticketService.handleUsePreviousDescriptionCallback(chatId, user);
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'create_ticket') {
          await this.ticketService.handleCreateTicketCallback(chatId, user);
        } else if (data === 'statistics') {
          this.pushNavigationHistory(chatId, 'statistics');
          await this.handleStatisticsCallback(chatId, user);
        } else if (data === 'check_tokens') {
          await this.aiService.handleCheckTokensCallback(chatId, user);
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'reset_tokens') {
          const telegramIdStr = String(user?.telegramId ?? user?.telegramChatId ?? chatId);
          if (telegramIdStr === TelegramService.INTERNET_REQUESTS_EXEMPT_TELEGRAM_ID) {
            aiFirstLineService.resetTokenUsage();
            await this.sendMessage(chatId, '✅ Лічильник токенів скинуто.');
          }
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'tip_helped') {
          const session = this.userSessions.get(chatId);
          if (session && session.step === 'awaiting_tip_feedback') {
            const filler = await this.aiService.aiFirstLineService.generateConversationalResponse(
              session.dialog_history || [],
              'accept_thanks',
              session.userContext || {}
            );
            this.userSessions.delete(chatId);
            await this.sendMessage(chatId, filler, {
              reply_markup: {
                inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
              },
            });
          }
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'tip_not_helped') {
          const session = this.userSessions.get(chatId);
          if (session && session.step === 'awaiting_tip_feedback') {
            session.step = 'gathering_information';
            session.afterTipNotHelped = true; // не показувати ще одну «підказку», одразу збір інформації / форма тікета
            await this.aiService.handleMessageInAiMode(chatId, 'Не допомогло', session, user);
          }
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'back') {
          await this.handleBackNavigation(chatId, user);
        } else if (data === 'back_to_menu') {
          this.clearNavigationHistory(chatId);
          await this.showUserDashboard(chatId, user);
        } else if (data === 'back_to_tickets') {
          this.popNavigationHistory(chatId);
          await this.ticketService.handleMyTicketsCallback(chatId, user);
        } else if (data.startsWith('rate_ticket_')) {
          const parts = data.split('_');
          const ticketId = parts[2];
          const rating = parseInt(parts[3], 10);
          await this.ticketService.handleRateTicketCallback(chatId, user, ticketId, rating);
          await this.answerCallbackQuery(callbackQuery.id, 'Дякуємо за оцінку');
        } else if (data === 'attach_photo') {
          await this.ticketService.handleAttachPhotoCallback(chatId, user);
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'attach_document') {
          await this.ticketService.handleAttachDocumentCallback(chatId, user);
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'skip_photo') {
          await this.ticketService.handleSkipPhotoCallback(chatId, user);
        } else if (data === 'add_more_photos') {
          await this.ticketService.handleAddMorePhotosCallback(chatId, user);
        } else if (data === 'finish_ticket') {
          await this.ticketService.handleFinishTicketCallback(chatId, user);
        } else if (data === 'confirm_create_ticket') {
          // ✅ Користувач підтвердив створення тікета
          const session = this.userSessions.get(chatId);
          if (session && session.step === 'confirm_ticket' && session.ticketDraft) {
            // Переводимо draft в реальний тікет
            session.step = 'photo';
            session.ticketData = {
              createdBy: session.ticketDraft.createdBy,
              title: session.ticketDraft.title,
              description: session.ticketDraft.description,
              priority: session.ticketDraft.priority,
              subcategory: session.ticketDraft.subcategory,
              type: session.ticketDraft.type,
              photos: [],
              documents: [],
            };

            const filler = await this.aiService.aiFirstLineService.generateConversationalResponse(
              session.dialog_history || [],
              'confirm_photo_saved',
              session.userContext || {}
            );
            await this.sendMessage(
              chatId,
              `✅ *${filler}*\n\n` + `📸 *Останній крок:* Бажаєте додати фото до заявки?`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📷 Додати фото', callback_data: 'attach_photo' }],
                    [{ text: '⏭️ Пропустити', callback_data: 'skip_photo' }],
                    [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }],
                  ],
                },
              }
            );
          }
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'force_create_ticket') {
          // Користувач хоче створити тікет з поточною інформацією
          const session = this.userSessions.get(chatId);
          if (session && session.step === 'gathering_information' && session.ticketDraft) {
            const fullInfo = `${session.ticketDraft.initialMessage}\n\nДодаткова інформація:\n${session.ticketDraft.collectedInfo.join('\n')}`;

            session.ticketData = {
              createdBy: session.ticketDraft.createdBy,
              title: session.ticketDraft.title || 'Проблема',
              description: fullInfo,
              priority: session.ticketDraft.priority,
              subcategory: session.ticketDraft.subcategory,
              type: session.ticketDraft.type,
              photos: [],
            };
            session.step = 'photo';

            await this.sendMessage(
              chatId,
              `✅ *Добре, створюю тікет з наявною інформацією.*\n\n` + `📸 Бажаєте додати фото?`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📷 Додати фото', callback_data: 'attach_photo' }],
                    [{ text: '⏭️ Пропустити', callback_data: 'skip_photo' }],
                  ],
                },
              }
            );
          }
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'edit_ticket_info') {
          // Користувач хоче виправити інформацію (AI або класика)
          const session = this.userSessions.get(chatId);
          if (session && session.step === 'confirm_ticket') {
            session.step = 'gathering_information';
            session.editingFromConfirm = true;
            // Не скидаємо ticketDraft — щоб при відповіді «Нічого» повернутися до підтвердження
            await this.sendMessage(
              chatId,
              `✏️ *Добре, давайте уточнимо.*\n\n` +
                `Що саме потрібно виправити або доповнити?\n\n` +
                `_(Якщо нічого — напишіть «Нічого» або «Залишити як є»)_`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '⏭️ Нічого не змінювати', callback_data: 'edit_nothing_change' }],
                    [{ text: '❌ Скасувати', callback_data: 'cancel_info_gathering' }],
                  ],
                },
                parse_mode: 'Markdown',
              }
            );
          }
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'edit_nothing_change') {
          // Редагування: «нічого не змінювати» — повертаємо до екрану підтвердження тікета
          const session = this.userSessions.get(chatId);
          if (
            session &&
            session.step === 'gathering_information' &&
            session.editingFromConfirm &&
            session.ticketDraft
          ) {
            session.step = 'confirm_ticket';
            session.editingFromConfirm = false;
            const d = session.ticketDraft;
            const msg = `✅ *Перевірте, чи все правильно*\n\n📌 *Заголовок:*\n${d.title || '—'}\n\n📝 *Опис:*\n${d.description || '—'}\n\n📊 *Категорія:* ${d.subcategory || '—'}\n⚡ *Пріоритет:* ${d.priority || '—'}\n\nВсе правильно?`;
            await this.sendMessage(chatId, msg, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
                  [{ text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' }],
                  [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }],
                ],
              },
              parse_mode: 'Markdown',
            });
          }
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'cancel_info_gathering') {
          // Скасування збору інформації (AI або збір без AI)
          const session = this.userSessions.get(chatId);
          if (session && session.aiDialogId) {
            await this.aiService.completeAIDialog(session.aiDialogId, 'cancelled');
          }
          const filler = await this.aiService.aiFirstLineService.generateConversationalResponse(
            session.dialog_history || [],
            'session_closed',
            session.userContext || {}
          );
          this.userSessions.delete(chatId);
          await this.sendMessage(chatId, `❌ ${filler}`);
          await this.showUserDashboard(chatId, user);
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'ai_continue') {
          // Додано: docs/AI_BOT_LOGIC.md — fallback: продовжити в AI-режимі
          const session = this.userSessions.get(chatId);
          if (session && session.mode === 'choosing') {
            session.mode = 'ai';
            session.ai_attempts = Math.max(0, (session.ai_attempts || 0) - 1);
            await this.sendMessage(
              chatId,
              'Добре, продовжуємо. Опишіть ще раз або доповніть інформацію.',
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }],
                  ],
                },
              }
            );
          }
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'ai_switch_to_classic') {
          // Додано: docs/AI_BOT_LOGIC.md — fallback: перехід на класичний покроковий флоу
          const session = this.userSessions.get(chatId);
          if (session) {
            session.mode = 'classic';
            session.step = 'title';
            session.dialog_history = [];
            session.ticketDraft = null;
            session.ticketData = { createdBy: user._id, photos: [], documents: [] };
            await this.sendMessage(
              chatId,
              `📝 *Створення тікета (покроково)*\n` +
                `📋 *Крок 1/4:* Введіть заголовок тікету\n` +
                `💡 Опишіть коротко суть проблеми`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }],
                  ],
                },
              }
            );
          }
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'cancel_ticket') {
          await this.ticketService.handleCancelTicketCallback(chatId, user);
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data.startsWith('priority_')) {
          const priority = data.replace('priority_', '');
          await this.ticketService.handlePriorityCallback(chatId, user, priority);
        } else if (data.startsWith('reply_ticket_')) {
          // Функція відповіді на тікет через Telegram вимкнена
          await this.sendMessage(
            chatId,
            `ℹ️ *Відповідь на тікет через Telegram недоступна*\n\n` +
              `Будь ласка, використовуйте веб-панель для додавання коментарів до тікету.\n\n` +
              `Натисніть /menu для повернення до головного меню.`,
            { parse_mode: 'Markdown' }
          );
          await this.answerCallbackQuery(callbackQuery.id);
        } else {
          await this.answerCallbackQuery(callbackQuery.id, 'Невідома команда');
        }
        return;
      }

      // Якщо користувач не зареєстрований, обробляємо callback-и для реєстрації та авторизації
      if (data === 'register_user') {
        await this.registrationService.handleUserRegistrationCallback(chatId, userId);
        await this.answerCallbackQuery(callbackQuery.id);
        return;
      }

      if (data === 'login_user') {
        await this.registrationService.handleUserLoginCallback(chatId, userId, callbackQuery);
        await this.answerCallbackQuery(callbackQuery.id);
        return;
      }

      if (data === 'cancel_login') {
        this.userSessions.delete(chatId);
        await this.sendMessage(
          chatId,
          `❌ *Авторизацію скасовано*\n\n` + `Ви можете спробувати авторизуватися пізніше.`
        );
        await this.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // Обробка callback-запитів для реєстрації (вибір міста, посади та закладу)
      if (
        data.startsWith('city_') ||
        data.startsWith('position_') ||
        data.startsWith('institution_') ||
        data === 'skip_institution'
      ) {
        logger.info('Виявлено callback для реєстрації:', { userId, data });
        await this.registrationService.handleRegistrationCallback(chatId, userId, data);
        await this.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // Якщо користувач не зареєстрований і це не callback для реєстрації/авторизації
      await this.answerCallbackQuery(
        callbackQuery.id,
        'Ви не авторизовані. Використайте /start для реєстрації або авторизації.'
      );
    } catch (error) {
      logger.error('Помилка обробки callback query:', error);
      await this.answerCallbackQuery(callbackQuery.id, 'Виникла помилка');
    }
  }

  async handleTextMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;
    const session = this.userSessions.get(chatId);

    // Перевіряємо, чи користувач вже зареєстрований
    // Конвертуємо userId в рядок, оскільки telegramId зберігається як String
    const existingUser = await User.findOne({
      $or: [{ telegramId: String(userId) }, { telegramId: userId }],
    })
      .populate('position', 'name')
      .populate('city', 'name');

    // Якщо користувач зареєстрований, не проводимо реєстрацію
    if (existingUser) {
      // Перевіряємо, чи є активна сесія для створення тікету
      if (session) {
        // Додано: docs/AI_BOT_LOGIC.md — обробка AI-режиму (виклики 1–3)
        if (session.mode === 'ai') {
          await this.aiService.handleMessageInAiMode(chatId, text, session, existingUser);
          return;
        }
        if (session.mode === 'choosing') {
          await this.sendMessage(chatId, 'Оберіть дію кнопками нижче 👇');
          return;
        }
        await this.ticketService.handleTicketCreationStep(chatId, text, session);
        return;
      }

      // Перевіряємо, чи це відгук
      const user = await User.findOne({ telegramChatId: chatId });
      if (user) {
        const feedbackHandled = await this.handleFeedbackMessage(chatId, text, user);
        if (feedbackHandled) {
          return; // Повідомлення оброблено як відгук
        }
      }

      // Додано: docs/AI_BOT_LOGIC.md — якщо користувач пише проблему без натискання «Створити тікет», запускаємо AI-флоу
      const aiSettings = await aiFirstLineService.getAISettings();
      const aiEnabled = aiSettings && aiSettings.enabled === true;
      const hasApiKey =
        aiSettings &&
        ((aiSettings.provider === 'groq' &&
          aiSettings.groqApiKey &&
          String(aiSettings.groqApiKey).trim()) ||
          (aiSettings.provider === 'openai' &&
            aiSettings.openaiApiKey &&
            String(aiSettings.openaiApiKey).trim()));
      if (aiEnabled && hasApiKey && text && String(text).trim().length > 0) {
        const fullUser = await User.findById(existingUser._id)
          .populate('position', 'title name')
          .populate('city', 'name region')
          .populate('institution', 'name')
          .lean();
        const profile = fullUser || existingUser;
        const userContext = {
          userCity: profile.city?.name || 'Не вказано',
          userPosition: profile.position?.title || profile.position?.name || 'Не вказано',
          userInstitution: profile.institution?.name || '',
          userName:
            [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email,
          userEmail: profile.email,
          hasComputerAccessPhoto: !!(
            profile.computerAccessPhoto && String(profile.computerAccessPhoto).trim()
          ),
          computerAccessAnalysis:
            (profile.computerAccessAnalysis && String(profile.computerAccessAnalysis).trim()) || '',
        };
        const session = {
          mode: 'ai',
          step: 'gathering_information',
          ai_attempts: 0,
          ai_questions_count: 0,
          dialog_history: [],
          userContext,
          ticketData: { createdBy: existingUser._id, photos: [], documents: [] },
          ticketDraft: null,
        };
        this.userSessions.set(chatId, session);
        await this.aiService.handleMessageInAiMode(chatId, text.trim(), session, existingUser);
        return;
      }

      // Якщо AI вимкнений і користувач написав текст — підказка та кнопка «Створити тікет» (робота лише через кнопки)
      if (text && String(text).trim().length > 0) {
        await this.sendMessage(
          chatId,
          `🤖 AI зараз недоступний. Спробуйте пізніше або використайте стандартну процедуру подачі звернення.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📝 Створити тікет', callback_data: 'create_ticket' }],
                [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }],
              ],
            },
          }
        );
        return;
      }

      // Якщо немає активної сесії, показуємо головне меню
      await this.showUserDashboard(chatId, existingUser);
      return;
    }

    // Перевіряємо, чи користувач в процесі авторизації
    if (session && session.type === 'login') {
      await this.registrationService.handleLoginTextInput(chatId, userId, text, session, msg);
      return;
    }

    // Перевіряємо, чи користувач в процесі реєстрації
    // Конвертуємо userId в рядок для пошуку
    const pendingRegistration = await PendingRegistration.findOne({
      $or: [{ telegramId: String(userId) }, { telegramId: userId }],
    });
    if (pendingRegistration) {
      await this.registrationService.handleRegistrationTextInput(
        chatId,
        userId,
        text,
        pendingRegistration
      );
      return;
    }

    // Спочатку перевіряємо, чи це відгук
    const user = await User.findOne({ telegramChatId: chatId });
    if (user) {
      const feedbackHandled = await this.handleFeedbackMessage(chatId, text, user);
      if (feedbackHandled) {
        return; // Повідомлення оброблено як відгук
      }
    }

    if (session) {
      await this.handleTicketCreationStep(chatId, text, session);
    } else {
      await this.sendMessage(chatId, 'Я не розумію. Використайте меню для навігації.');
    }
  }

  // Екранування спеціальних символів Markdown для Telegram
  // Екранування спеціальних символів Markdown для Telegram
  escapeMarkdown(text) {
    return TelegramUtils.escapeMarkdown(text);
  }

  // Екранування спеціальних символів HTML для Telegram
  // Екранування спеціальних символів HTML для Telegram
  escapeHtml(text) {
    return TelegramUtils.escapeHtml(text);
  }

  // Конвертація Markdown на HTML для Telegram (базова)
  // Конвертація Markdown на HTML для Telegram (базова)
  markdownToHtml(text) {
    return TelegramUtils.markdownToHtml(text);
  }

  // Методи валідації
  // Методи валідації
  validateName(name) {
    return TelegramUtils.validateName(name);
  }

  validateEmail(email) {
    return TelegramUtils.validateEmail(email);
  }

  validateLogin(login) {
    return TelegramUtils.validateLogin(login);
  }

  validatePhone(phone) {
    return TelegramUtils.validatePhone(phone);
  }

  validatePassword(password) {
    return TelegramUtils.validatePassword(password);
  }

  validateDepartment(department) {
    return TelegramUtils.validateDepartment(department);
  }

  // Обробка фото
  async handlePhoto(msg) {
    const chatId = msg.chat.id;
    const session = this.userSessions.get(chatId);

    if (session) {
      if (session.step === 'photo') {
        await this.ticketService.handleTicketPhoto(chatId, msg.photo, msg.caption);
        return;
      }
      if (session.mode === 'ai') {
        const user = await User.findOne({ telegramChatId: chatId });
        await this.aiService.handlePhotoInAiMode(chatId, msg.photo, msg.caption, session, user);
        return;
      }
    }

    await this.sendMessage(chatId, 'Фото можна прикріпляти тільки під час створення тікету.');
  }

  /**
   * Зберігає фото з Telegram в профіль (computerAccessPhoto), аналізує через AI (AnyDesk, TeamViewer).
   * @param {number} chatId
   * @param {string} fileId - Telegram file_id
   * @param {Object} user - користувач з _id
   * @returns {Promise<{ success: boolean, analysis?: string }>}
   */
  async _saveComputerAccessPhotoFromTelegram(chatId, fileId, user) {
    if (!user || !user._id) {
      return { success: false };
    }
    let localPath;
    try {
      const file = await this.bot.getFile(fileId);
      if (!file || !file.file_path) {
        return { success: false };
      }
      const ext = path.extname(file.file_path).toLowerCase() || '.jpg';
      localPath = await this.downloadTelegramFileByFileId(fileId, ext);
    } catch (err) {
      logger.error('Помилка завантаження фото доступу до ПК', { chatId, err: err.message });
      return { success: false };
    }
    const computerAccessDir = path.join(__dirname, '../uploads/computer-access');
    if (!fs.existsSync(computerAccessDir)) {
      fs.mkdirSync(computerAccessDir, { recursive: true });
    }
    const fileName = `${user._id}_${Date.now()}${path.extname(localPath).toLowerCase() || '.jpg'}`;
    const destPath = path.join(computerAccessDir, fileName);
    try {
      fs.copyFileSync(localPath, destPath);
      if (localPath && fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    } catch (e) {
      logger.error('Помилка копіювання фото доступу', { err: e.message });
      try {
        if (localPath && fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      } catch (_) {
        /* ignore unlink error */
      }
      return { success: false };
    }
    const relativePath = `computer-access/${fileName}`;
    try {
      await User.findByIdAndUpdate(user._id, {
        computerAccessPhoto: relativePath,
        computerAccessUpdatedAt: new Date(),
      });
    } catch (e) {
      logger.error('Помилка оновлення профілю (computerAccessPhoto)', {
        userId: user._id,
        err: e.message,
      });
      return { success: false };
    }
    let analysis = null;
    try {
      analysis = await aiFirstLineService.analyzeComputerAccessPhoto(destPath);
      if (analysis && String(analysis).trim()) {
        await User.findByIdAndUpdate(user._id, { computerAccessAnalysis: String(analysis).trim() });
      }
    } catch (e) {
      logger.error('AI: помилка аналізу фото доступу', { userId: user._id, err: e.message });
    }
    return {
      success: true,
      analysis: analysis && String(analysis).trim() ? String(analysis).trim() : undefined,
    };
  }

  async handleDocument(msg) {
    const chatId = msg.chat.id;
    const session = this.userSessions.get(chatId);

    if (session && session.step === 'photo') {
      await this.ticketService.handleTicketDocument(chatId, msg.document, msg.caption);
    } else {
      await this.sendMessage(chatId, 'Файли можна прикріпляти тільки під час створення тікету.');
    }
  }

  async handleContact(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Перевіряємо, чи користувач вже зареєстрований
      // Конвертуємо userId в рядок, оскільки telegramId зберігається як String
      const existingUser = await User.findOne({
        $or: [{ telegramId: String(userId) }, { telegramId: userId }],
      })
        .populate('position', 'name')
        .populate('city', 'name');

      // Якщо користувач вже зареєстрований, показуємо головне меню
      if (existingUser) {
        await this.showUserDashboard(chatId, existingUser);
        return;
      }

      // Перевіряємо, чи користувач в процесі реєстрації на етапі phone
      // Конвертуємо userId в рядок для пошуку
      const pendingRegistration = await PendingRegistration.findOne({
        $or: [{ telegramId: String(userId) }, { telegramId: userId }],
      });

      if (!pendingRegistration) {
        await this.sendMessage(
          chatId,
          'Ви не в процесі реєстрації. Використайте /start для початку.'
        );
        return;
      }

      if (pendingRegistration.step !== 'phone') {
        await this.sendMessage(
          chatId,
          'Номер телефону можна поділитися тільки на етапі введення номера.'
        );
        return;
      }

      // Отримуємо номер телефону з контакту
      const contact = msg.contact;
      if (!contact || !contact.phone_number) {
        await this.sendMessage(
          chatId,
          '❌ Не вдалося отримати номер телефону. Спробуйте ввести номер вручну.'
        );
        return;
      }

      let phoneNumber = contact.phone_number;

      // Якщо номер не починається з +, додаємо +
      if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+' + phoneNumber;
      }

      // Валідуємо номер телефону
      if (!this.validatePhone(phoneNumber)) {
        await this.sendMessage(
          chatId,
          `❌ *Некоректний номер телефону*\n\n` +
            `Отриманий номер: ${phoneNumber}\n\n` +
            `Номер повинен містити від 10 до 15 цифр та починатися з +.\n\n` +
            `💡 Спробуйте ввести номер вручну:`,
          {
            reply_markup: {
              keyboard: [
                [
                  {
                    text: '📱 Поділитися номером',
                    request_contact: true,
                  },
                ],
              ],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
        return;
      }

      // Зберігаємо номер телефону
      pendingRegistration.data.phone = phoneNumber;
      pendingRegistration.step = 'password';
      await pendingRegistration.save();

      // Приховуємо клавіатуру і переходимо до наступного кроку
      await this.sendMessage(chatId, `✅ <b>Номер телефону отримано!</b>\n` + `📱 ${phoneNumber}`, {
        parse_mode: 'HTML',
        reply_markup: {
          remove_keyboard: true,
        },
      });

      // Переходимо до наступного кроку (пароль)
      await this.askForPassword(chatId);
    } catch (error) {
      logger.error('Помилка обробки контакту:', error);
      await this.sendMessage(chatId, '❌ Помилка обробки номеру телефону. Спробуйте ще раз.');
    }
  }

  downloadTelegramFileByFileId(fileId, fileExtension = '.jpg') {
    return TelegramUtils.downloadTelegramFileByFileId(this.bot, fileId, fileExtension);
  }

  downloadTelegramFile(filePath) {
    return new Promise((resolve, reject) => {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const url = `https://api.telegram.org/file/bot${token}/${filePath}`;

      // Створюємо папку для фото якщо не існує
      const uploadsDir = path.join(__dirname, '../uploads/telegram-files');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const fileName = `${Date.now()}_${path.basename(filePath)}`;
      const localPath = path.join(uploadsDir, fileName);
      const file = fs.createWriteStream(localPath);

      https
        .get(url, response => {
          // Перевіряємо статус код відповіді
          if (response.statusCode !== 200) {
            file.close();
            fs.unlink(localPath, () => {});
            logger.error(`Помилка завантаження файлу з Telegram: статус ${response.statusCode}`, {
              filePath,
              url,
              statusCode: response.statusCode,
              statusMessage: response.statusMessage,
            });
            reject(
              new Error(
                `Помилка завантаження файлу: ${response.statusCode} ${response.statusMessage}`
              )
            );
            return;
          }

          // Перевіряємо Content-Length
          const contentLength = parseInt(response.headers['content-length'] || '0', 10);
          let _downloadedBytes = 0;

          response.on('data', chunk => {
            _downloadedBytes += chunk.length;
          });

          response.pipe(file);

          file.on('finish', () => {
            file.close();

            // Перевіряємо, чи файл не порожній
            const stats = fs.statSync(localPath);
            if (stats.size === 0) {
              fs.unlink(localPath, () => {});
              logger.error('Завантажений файл має нульовий розмір', {
                filePath,
                localPath,
                contentLength,
              });
              reject(new Error('Завантажений файл має нульовий розмір'));
              return;
            }

            // Перевіряємо, чи розмір відповідає Content-Length (якщо вказано)
            if (contentLength > 0 && stats.size !== contentLength) {
              logger.warn('Розмір завантаженого файлу не відповідає Content-Length', {
                filePath,
                localPath,
                expected: contentLength,
                actual: stats.size,
              });
            }

            logger.info('Файл успішно завантажено з Telegram', {
              filePath,
              localPath,
              size: stats.size,
              contentLength,
            });

            resolve(localPath);
          });

          file.on('error', error => {
            file.close();
            fs.unlink(localPath, () => {});
            logger.error('Помилка запису файлу', {
              filePath,
              localPath,
              error: error.message,
            });
            reject(error);
          });
        })
        .on('error', error => {
          fs.unlink(localPath, () => {}); // Видаляємо файл при помилці
          logger.error('Помилка HTTP запиту при завантаженні файлу з Telegram', {
            filePath,
            url,
            error: error.message,
          });
          reject(error);
        });
    });
  }

  async handleStatisticsCallback(chatId, user) {
    try {
      const totalTickets = await Ticket.countDocuments({ createdBy: user._id });
      const openTickets = await Ticket.countDocuments({
        createdBy: user._id,
        status: 'open',
      });
      const inProgressTickets = await Ticket.countDocuments({
        createdBy: user._id,
        status: 'in_progress',
      });
      const closedTickets = await Ticket.countDocuments({
        createdBy: user._id,
        status: { $in: ['closed', 'resolved'] },
      });

      // Статистика за останній місяць
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const ticketsLastMonth = await Ticket.countDocuments({
        createdBy: user._id,
        createdAt: { $gte: oneMonthAgo },
      });

      // Середній час закриття тікетів (в днях)
      const closedTicketsWithDates = await Ticket.find({
        createdBy: user._id,
        status: { $in: ['closed', 'resolved'] },
        closedAt: { $exists: true },
      })
        .select('createdAt closedAt')
        .limit(100)
        .lean();

      let avgDays = 0;
      if (closedTicketsWithDates.length > 0) {
        const totalDays = closedTicketsWithDates.reduce((sum, ticket) => {
          const days =
            (new Date(ticket.closedAt) - new Date(ticket.createdAt)) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0);
        avgDays = Math.round((totalDays / closedTicketsWithDates.length) * 10) / 10;
      }

      const text =
        `📊 *Ваша статистика*\n\n` +
        `📋 *Всього тікетів:* \`${totalTickets}\`\n` +
        `🔓 *Відкритих:* \`${openTickets}\`\n` +
        `⚙️ *У роботі:* \`${inProgressTickets}\`\n` +
        `✅ *Закритих:* \`${closedTickets}\`\n\n` +
        `📅 *За останній місяць:* \`${ticketsLastMonth}\` тікетів\n` +
        (avgDays > 0 ? `⏱️ *Середній час закриття:* \`${avgDays}\` днів\n` : '');

      await this.sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
        },
        parse_mode: 'Markdown',
      });
    } catch (error) {
      logger.error('Помилка отримання статистики:', error);
      await this.sendMessage(
        chatId,
        `❌ *Помилка завантаження статистики*\n\n` +
          `Не вдалося завантажити дані статистики.\n\n` +
          `🔄 Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  async handleHelpCommand(chatId, _user) {
    const helpText =
      `📖 *Довідка по командам*\n\n` +
      `*Основні команди:*\n` +
      `🔹 /start - Головне меню\n` +
      `🔹 /menu - Повернутися до головного меню\n` +
      `🔹 /help - Показати цю довідку\n` +
      `🔹 /status - Швидкий перегляд статусів тікетів\n\n` +
      `*Функції бота:*\n` +
      `📝 *Створити тікет* - Надішліть опис проблеми текстом\n` +
      `📋 *Мої тікети* - Перегляд всіх ваших тікетів\n` +
      `📜 *Історія тікетів* - Перегляд закритих тікетів\n` +
      `📊 *Статистика* - Ваша статистика по тікетам\n\n` +
      `*Додаткові можливості:*\n` +
      `📸 Можна додавати фото до тікетів\n\n` +
      `*Підтримка:*\n` +
      `Якщо виникли питання, зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`;

    await this.sendMessage(chatId, helpText, {
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back' }]],
      },
      parse_mode: 'Markdown',
    });
  }

  async handleStatusCommand(chatId, user) {
    try {
      const openTickets = await Ticket.find({
        createdBy: user._id,
        status: 'open',
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title status createdAt')
        .lean();

      const inProgressTickets = await Ticket.find({
        createdBy: user._id,
        status: 'in_progress',
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title status createdAt')
        .lean();

      let text = `⚡ *Швидкий статус тікетів*\n\n`;

      if (openTickets.length > 0) {
        text += `🔓 *Відкриті тікети (${openTickets.length}):*\n`;
        openTickets.forEach((ticket, index) => {
          const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
          });
          text += `${index + 1}. ${this.truncateButtonText(ticket.title, 40)} - \`${date}\`\n`;
        });
        text += `\n`;
      }

      if (inProgressTickets.length > 0) {
        text += `⚙️ *У роботі (${inProgressTickets.length}):*\n`;
        inProgressTickets.forEach((ticket, index) => {
          const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
          });
          text += `${index + 1}. ${this.truncateButtonText(ticket.title, 40)} - \`${date}\`\n`;
        });
        text += `\n`;
      }

      if (openTickets.length === 0 && inProgressTickets.length === 0) {
        text += `✅ У вас немає активних тікетів!\n\n`;
        text += `💡 Створіть новий тікет, якщо потрібна допомога.`;
      } else {
        text += `💡 Використайте "Мої тікети" для повного списку.`;
      }

      await this.sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📋 Мої тікети', callback_data: 'my_tickets' },
              { text: '📊 Статистика', callback_data: 'statistics' },
            ],
            [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }],
          ],
        },
        parse_mode: 'Markdown',
      });
    } catch (error) {
      logger.error('Помилка отримання статусу тікетів:', error);
      await this.sendMessage(
        chatId,
        `❌ *Помилка завантаження статусу*\n\n` +
          `Не вдалося завантажити інформацію про тікети.\n\n` +
          `🔄 Спробуйте ще раз.`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  async answerCallbackQuery(callbackQueryId, text = '') {
    try {
      await this.bot.answerCallbackQuery(callbackQueryId, { text });
    } catch (error) {
      logger.error('Помилка відповіді на callback query:', error);
    }
  }

  getStatusText(status) {
    return TelegramUtils.getStatusText(status);
  }

  getStatusEmoji(status) {
    return TelegramUtils.getStatusEmoji(status);
  }

  getPriorityText(priority) {
    return TelegramUtils.getPriorityText(priority);
  }

  getCategoryEmoji(category) {
    return TelegramUtils.getCategoryEmoji(category);
  }

  getPriorityPromptText() {
    return TelegramUtils.getPriorityPromptText();
  }

  getCancelButtonText() {
    return TelegramUtils.getCancelButtonText();
  }

  formatInstructionsAsList(instructions) {
    return TelegramUtils.formatInstructionsAsList(instructions);
  }

  /**
   * Обрізає текст кнопки, якщо він перевищує максимальну довжину
   * Telegram має обмеження на довжину тексту кнопки (64 символи)
   * Використовуємо спеціальні Unicode символи для візуального ефекту бігучої строки
   */
  truncateButtonText(text, maxLength = 60) {
    return TelegramUtils.truncateButtonText(text, maxLength);
  }

  async loadBotSettings() {
    try {
      this.botSettings = await BotSettings.findOne();
      if (this.botSettings) {
        logger.debug('Налаштування бота завантажено');
      }
    } catch (error) {
      logger.error('Помилка завантаження налаштувань бота:', error);
    }
  }

  handleFeedbackMessage(_chatId, _text, _user) {
    // Placeholder for feedback handling
    // This can be implemented based on your requirements
    return false;
  }

  async showPrioritySelection(chatId, _session) {
    const keyboard = [
      [
        { text: '🟢 Низький', callback_data: 'priority_low' },
        { text: '🟡 Середній', callback_data: 'priority_medium' },
      ],
      [
        { text: '🔴 Високий', callback_data: 'priority_high' },
        { text: '🔥 Критичний', callback_data: 'priority_urgent' },
      ],
      [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }],
    ];

    await this.sendMessage(chatId, `⚡ *Крок 4/4:* Оберіть пріоритет`, {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  // Методи для навігації
  pushNavigationHistory(chatId, screen) {
    if (!this.navigationHistory.has(chatId)) {
      this.navigationHistory.set(chatId, []);
    }
    const history = this.navigationHistory.get(chatId);
    // Додаємо екран, якщо він відрізняється від останнього
    if (history.length === 0 || history[history.length - 1] !== screen) {
      history.push(screen);
      // Обмежуємо історію до 10 екранів
      if (history.length > 10) {
        history.shift();
      }
    }
  }

  popNavigationHistory(chatId) {
    if (this.navigationHistory.has(chatId)) {
      const history = this.navigationHistory.get(chatId);
      if (history.length > 0) {
        history.pop();
      }
    }
  }

  getNavigationHistory(chatId) {
    return this.navigationHistory.get(chatId) || [];
  }

  clearNavigationHistory(chatId) {
    this.navigationHistory.delete(chatId);
  }

  async handleBackNavigation(chatId, user) {
    const history = this.getNavigationHistory(chatId);

    if (history.length <= 1) {
      // Якщо історія порожня або містить тільки поточний екран, повертаємося до головного меню
      this.clearNavigationHistory(chatId);
      await this.showUserDashboard(chatId, user);
      return;
    }

    // Видаляємо поточний екран
    this.popNavigationHistory(chatId);

    // Отримуємо попередній екран
    const previousScreen = history[history.length - 2];

    if (previousScreen === 'my_tickets') {
      await this.ticketService.handleMyTicketsCallback(chatId, user);
    } else if (previousScreen === 'ticket_history') {
      await this.ticketService.handleTicketHistoryCallback(chatId, user);
    } else if (previousScreen === 'statistics') {
      await this.handleStatisticsCallback(chatId, user);
    } else if (previousScreen && previousScreen.startsWith('view_ticket_')) {
      const ticketId = previousScreen.replace('view_ticket_', '');
      await this.ticketService.handleViewTicketCallback(chatId, user, ticketId);
    } else {
      this.clearNavigationHistory(chatId);
      await this.showUserDashboard(chatId, user);
    }
  }
}

module.exports = TelegramService;
