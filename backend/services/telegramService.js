// Умикаємо нову поведінку відправки файлів (contentType/fileOptions), щоб прибрати DeprecationWarning
if (!process.env.NTBA_FIX_350) {
  process.env.NTBA_FIX_350 = '1';
}
const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const PendingRegistration = require('../models/PendingRegistration');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const { uploadsPath } = require('../config/paths');

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
const equipmentService = require('./equipmentService');

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
    this.token = null; // Токен бота
    this._mediaGroupSeen = new Map(); // Дедуплікація Telegram-альбомів: key=`${chatId}:${mediaGroupId}`
    this._documentBuffers = new Map(); // Буфер документів для debounce (AI-режим): key=chatId
    this._classicDocBuffers = new Map(); // Буфер документів для debounce (класичний режим): key=chatId
    this.loadBotSettings(); // Завантажуємо налаштування бота
  }

  static get INTERNET_REQUESTS_LIMIT_PER_DAY() {
    return 5;
  }
  static get INTERNET_REQUESTS_EXEMPT_TELEGRAM_ID() {
    return '6070910226';
  }

  /** Час неактивності (мс), після якого сесію завершують з повідомленням у чат */
  static get SESSION_IDLE_TIMEOUT_MS() {
    return 30 * 60 * 1000; // 30 хвилин
  }

  /** Час неактивності (мс), коли надсилати попередження (за 1 хв до відключення) */
  static get SESSION_IDLE_WARNING_MS() {
    return 29 * 60 * 1000; // 29 хвилин
  }

  /** Інтервал перевірки неактивних сесій (мс) */
  static get SESSION_IDLE_CHECK_INTERVAL_MS() {
    return 60 * 1000; // 1 хвилина
  }

  /**
   * Перевіряє сесії на неактивність:
   * - 29 хв: попередження + кнопка «Продовжити сесію»
   * - 30 хв: завершення сесії
   */
  _checkSessionIdleTimeout() {
    if (!this.bot) {
      return;
    }
    const now = Date.now();
    const timeout = TelegramService.SESSION_IDLE_TIMEOUT_MS;
    const warningThreshold = TelegramService.SESSION_IDLE_WARNING_MS;
    const toWarn = [];
    const toDelete = [];
    for (const [chatId, session] of this.userSessions.entries()) {
      const last = session.lastActivityAt;
      if (!last) {
        continue;
      }
      const idle = now - last;
      if (idle >= timeout) {
        toDelete.push([chatId, session]);
      } else if (idle >= warningThreshold && !session.idleWarningSentAt) {
        toWarn.push([chatId, session]);
      }
    }
    // 1. Попередження (за 1 хв до відключення)
    for (const [chatId, session] of toWarn) {
      session.idleWarningSentAt = now;
      this.userSessions.set(chatId, session);
      const warnMsg =
        '⏰ <b>Сесію буде завершено через 1 хв через неактивність.</b>\n\nНатисніть «Продовжити», якщо ще потребуєте допомоги.';
      this.sendMessage(chatId, warnMsg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⏱ Продовжити сесію', callback_data: 'extend_session' }],
            [{ text: '📝 Створити тікет', callback_data: 'create_ticket' }],
            [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }],
          ],
        },
      }).catch(err =>
        logger.warn('Session idle warning: не вдалося відправити', { chatId, err: err.message })
      );
      logger.info('Надіслано попередження про неактивність сесії', { chatId });
    }
    // 2. Завершення (30 хв неактивності)
    for (const [chatId, _session] of toDelete) {
      this.userSessions.delete(chatId);
      const msg =
        '⏱ <b>Сесію завершено через неактивність (30 хв).</b> Напишіть знову, якщо потрібна допомога.';
      this.sendMessage(chatId, msg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Створити тікет', callback_data: 'create_ticket' }],
            [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }],
          ],
        },
      }).catch(err =>
        logger.warn('Session idle: не вдалося відправити повідомлення', {
          chatId,
          err: err.message,
        })
      );
      logger.info('Сесію завершено через неактивність', { chatId });
    }
  }

  /**
   * Скинути всі активні сесії.
   * @param {Object} [options] - Опції
   * @param {string} [options.reason] - Причина: 'admin' | 'after_hours'
   */
  clearAllSessions(options = {}) {
    const chatIds = [...this.userSessions.keys()];
    const count = chatIds.length;
    this.userSessions.clear();
    const msg =
      options.reason === 'after_hours'
        ? '⏰ <b>Робочий день завершено.</b>\n\nЯкщо у вас термінова проблема — можете створити тікет прямо зараз. Адмін побачить його вранці.\n\n⚠️ <i>Відповідь буде на початку наступного робочого дня.</i>'
        : '⏱ <b>Сесію завершено (скинуто адміністратором).</b> Напишіть знову, якщо потрібна допомога.';
    const replyMarkup = {
      inline_keyboard: [
        [{ text: '📝 Створити тікет', callback_data: 'create_ticket' }],
        [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }],
      ],
    };
    for (const chatId of chatIds) {
      this.sendMessage(chatId, msg, { parse_mode: 'HTML', reply_markup: replyMarkup }).catch(err =>
        logger.warn('clearAllSessions: не вдалося відправити повідомлення', {
          chatId,
          err: err.message,
        })
      );
    }
    logger.info('Всі активні сесії скинуто', {
      count,
      chatIds: chatIds.length ? chatIds.slice(0, 5) : [],
    });
    return count;
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

      this.token = token;
      const hasWebhookUrl = !!(cfg?.webhookUrl && cfg.webhookUrl.trim());
      const usePolling = !hasWebhookUrl;
      this.mode = usePolling ? 'polling' : 'webhook';

      try {
        this.bot = new TelegramBot(
          token,
          usePolling ? { polling: { interval: 1000, params: { timeout: 10 } } } : { polling: false }
        );
        if (usePolling) {
          this.bot.on('message', msg =>
            this.handleMessage(msg).catch(err =>
              logger.error('Unhandled error in handleMessage', { err: err.message })
            )
          );
          this.bot.on('callback_query', cq =>
            this.handleCallbackQuery(cq).catch(err =>
              logger.error('Unhandled error in handleCallbackQuery', { err: err.message })
            )
          );
          this.bot.on('polling_error', err => {
            // Якщо помилка 404 - токен невалідний, вимикаємо бота
            if (err.code === 'ETELEGRAM' && err.response?.statusCode === 404) {
              logger.warn(
                '⚠️ <b>Telegram токен невалідний або бот не знайдено.</b> Telegram бот вимкнено.'
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
          logger.info('✅ <b>Telegram бот запущено у режимі polling</b>');
        } else {
          logger.info('✅ <b>Telegram бот запущено у режимі webhook</b>');
        }
        this.isInitialized = true;
        this._initializing = false;
        if (this._sessionIdleCheckInterval) {
          clearInterval(this._sessionIdleCheckInterval);
        }
        this._sessionIdleCheckInterval = setInterval(
          () => this._checkSessionIdleTimeout(),
          TelegramService.SESSION_IDLE_CHECK_INTERVAL_MS
        );
        logger.info('Таймер неактивних сесій увімкнено: попередження 29 хв, відключення 30 хв');
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
      '✅ <b>Ваш запит на реєстрацію схвалено!</b> Тепер ви можете створювати тікети.',
      { parse_mode: 'HTML' }
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
      `❌ <b>Ваш запит на реєстрацію відхилено.</b>\nПричина: ${TelegramUtils.escapeHtml(reason || 'не вказана')}`,
      { parse_mode: 'HTML' }
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
    const defaultOptions = { parse_mode: 'HTML', ...options, disable_notification: false };
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

        // Якщо вказано pin, закріплюємо повідомлення
        if (options.pin && result.message_id) {
          try {
            await this.pinChatMessage(chatId, result.message_id);
            logger.debug(`Повідомлення ${result.message_id} закріплено в чаті ${chatId}`);
          } catch (pinError) {
            logger.error(`Помилка закріплення повідомлення ${result.message_id}:`, pinError);
          }
        }

        return result;
      } catch (error) {
        // Якщо помилка пов'язана з парсингом HTML, спробуємо відправити як звичайний текст
        if (
          error.message?.includes("can't parse entities") ||
          error.message?.includes("Bad Request: can't parse entities")
        ) {
          logger.warn(
            `Помилка парсингу HTML для чату ${chatId}, спроба відправки як звичайний текст`
          );
          try {
            const noHtmlOptions = { ...defaultOptions };
            delete noHtmlOptions.parse_mode;
            const result = await this.bot.sendMessage(chatId, text, noHtmlOptions);
            logger.info(`Повідомлення успішно відправлено в чат ${chatId} без HTML`);
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

  async sendPhoto(chatId, photo, options = {}) {
    if (!this.bot) {
      logger.error('Telegram бот не ініціалізовано');
      return;
    }
    const { filename, ...restOptions } = options;
    const defaultOptions = {
      parse_mode: 'HTML',
      ...restOptions,
    };

    // Якщо передано filename, використовуємо структуру для передачі назви файлу в node-telegram-bot-api
    const fileOptions = filename ? { filename, contentType: options.contentType } : {};

    try {
      const result = await this.bot.sendPhoto(chatId, photo, defaultOptions, fileOptions);

      if (options.pin && result.message_id) {
        try {
          await this.pinChatMessage(chatId, result.message_id);
        } catch (pinError) {
          logger.error(`Помилка закріплення фото:`, pinError);
        }
      }

      return result;
    } catch (error) {
      logger.error('Помилка відправки фото:', error);
      throw error;
    }
  }

  async sendDocument(chatId, document, options = {}) {
    if (!this.bot) {
      logger.error('Telegram бот не ініціалізовано');
      return;
    }
    const { filename, ...restOptions } = options;
    const defaultOptions = {
      parse_mode: 'HTML',
      ...restOptions,
    };

    // Налаштування для збереження оригінальної назви файлу
    const fileOptions = filename ? { filename, contentType: options.contentType } : {};

    try {
      const result = await this.bot.sendDocument(chatId, document, defaultOptions, fileOptions);

      if (options.pin && result.message_id) {
        try {
          await this.pinChatMessage(chatId, result.message_id);
        } catch (pinError) {
          logger.error(`Помилка закріплення документа:`, pinError);
        }
      }

      return result;
    } catch (error) {
      logger.error('Помилка відправки документа:', error);
      throw error;
    }
  }

  async pinChatMessage(chatId, messageId) {
    if (!this.bot) {
      logger.error('Telegram бот не ініціалізовано');
      return;
    }
    try {
      return await this.bot.pinChatMessage(chatId, messageId, { disable_notification: true });
    } catch (error) {
      logger.error('Помилка закріплення повідомлення:', error);
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

      // Оновлюємо час останньої активності сесії (для таймауту неактивності 5 хв)
      const sessionForTouch = this.userSessions.get(chatId);
      if (sessionForTouch) {
        sessionForTouch.lastActivityAt = Date.now();
        delete sessionForTouch.idleWarningSentAt;
        this.userSessions.set(chatId, sessionForTouch);
      }

      // Перевірка, чи користувач вже зареєстрований (telegramId або telegramChatId — у приватному чаті часто збігаються)
      const existingUser = await User.findOne({
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId },
          { telegramChatId: String(chatId) },
          { telegramChatId: chatId },
        ],
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
                '✅ <b>Фото доступу до ПК оновлено у вашому профілі.</b> Адмін перегляне його в картці користувача.';
              if (result.analysis) {
                text += `\n\n📋 Розпізнано: ${TelegramUtils.escapeHtml(result.analysis)}`;
              }
              await this.sendMessage(msg.chat.id, text, {
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
                },
              });
            } else {
              await this.sendMessage(
                msg.chat.id,
                '❌ <b>Помилка збереження фото.</b> Спробуйте ще раз або зверніться до адміна.',
                {
                  parse_mode: 'HTML',
                  reply_markup: {
                    inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
                  },
                }
              );
            }
            return;
          }
          if (session && (session.mode === 'ai' || session.mode === 'choosing')) {
            if (msg.media_group_id && !this._isFirstInMediaGroup(msg.chat.id, msg.media_group_id)) {
              // Додаткове фото з альбому — зберігаємо як вкладення без повторного аналізу
              this._savePendingPhotoToSession(msg.chat.id, msg, session).catch(() => {});
              return;
            }
            await this.aiService.handlePhotoInAiMode(
              msg.chat.id,
              msg.photo,
              msg.caption || '',
              session,
              existingUser
            );
            return;
          }
          if (!session) {
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
              const fullUser = await User.findById(existingUser._id)
                .populate('position', 'title name')
                .populate('city', 'name region')
                .populate('institution', 'name')
                .lean();

              // Після await — перевіряємо чи сесію ще не створив паралельний обробник
              // (наприклад, перше фото альбому вже створило сесію поки ми чекали DB)
              const sessionAfterAwait = this.userSessions.get(msg.chat.id);
              if (
                msg.media_group_id &&
                sessionAfterAwait &&
                (sessionAfterAwait.mode === 'ai' || sessionAfterAwait.mode === 'choosing')
              ) {
                this._savePendingPhotoToSession(msg.chat.id, msg, sessionAfterAwait).catch(
                  () => {}
                );
                return;
              }

              const profile = fullUser || existingUser;
              const newSession = {
                mode: 'ai',
                step: 'gathering_information',
                ai_attempts: 0,
                ai_questions_count: 0,
                dialog_history: [],
                userContext: {
                  userCity: profile.city?.name || 'Не вказано',
                  userPosition: profile.position?.title || profile.position?.name || 'Не вказано',
                  userInstitution: profile.institution?.name || '',
                  userName:
                    [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
                    profile.email,
                  userEmail: profile.email,
                  hasComputerAccessPhoto: !!(
                    profile.computerAccessPhoto && String(profile.computerAccessPhoto).trim()
                  ),
                  computerAccessAnalysis:
                    (profile.computerAccessAnalysis &&
                      String(profile.computerAccessAnalysis).trim()) ||
                    '',
                },
                ticketData: { createdBy: existingUser._id, photos: [], documents: [] },
                ticketDraft: null,
                lastActivityAt: Date.now(),
              };
              this.userSessions.set(msg.chat.id, newSession);
              await this.aiService.handlePhotoInAiMode(
                msg.chat.id,
                msg.photo,
                msg.caption || '',
                newSession,
                existingUser
              );
              return;
            }
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
              `🚫 <b>Помилка авторизації</b>\n\n` +
                `Ви не авторизовані в системі.\n\n` +
                `🔑 Використайте /start для початку роботи.`,
              { parse_mode: 'HTML' }
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
              `🚫 <b>Помилка авторизації</b>\n\n` +
                `Ви не авторизовані в системі.\n\n` +
                `🔑 Використайте /start для початку роботи.`,
              { parse_mode: 'HTML' }
            );
          }
          break;
        case '/skip':
          await this.sendMessage(
            chatId,
            `❓ <b>Невідома команда</b>\n\n` +
              `Команда не розпізнана системою.\n\n` +
              `💡 Використайте /start для перегляду доступних опцій.`,
            { parse_mode: 'HTML' }
          );
          break;
        default:
          if (!user) {
            await this.sendMessage(
              chatId,
              `🚫 <b>Помилка авторизації</b>\n\n` +
                `Ви не авторизовані в системі.\n\n` +
                `🔑 Використайте /start для початку роботи.`,
              { parse_mode: 'HTML' }
            );
            return;
          }
          await this.sendMessage(
            chatId,
            `❓ <b>Невідома команда</b>\n\n` +
              `Команда не розпізнана системою.\n\n` +
              `💡 Використайте /start для перегляду доступних опцій.`,
            { parse_mode: 'HTML' }
          );
      }
    } catch (error) {
      logger.error('Помилка обробки команди:', error);
      await this.sendMessage(
        chatId,
        `❌ <b>Системна помилка</b>\n\n` +
          `Виникла помилка при обробці команди.\n\n` +
          `🔄 Спробуйте ще раз або зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>`,
        { parse_mode: 'HTML' }
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
            `🚫 <b>Доступ обмежено</b>\n\n` +
              `Ваш обліковий запис поки не активований.\n\n` +
              `📞 Зверніться до адміністратора для активації: <a href="https://t.me/Kultup">@Kultup</a>`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        // /start завжди скидає активну сесію — запобігає появі старих драфтів
        if (this.userSessions.has(chatId)) {
          this.userSessions.delete(chatId);
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
              `🚫 <b>Доступ обмежено</b>\n\n` +
                `Ваш обліковий запис поки не активований.\n\n` +
                `📞 Зверніться до адміністратора для активації: <a href="https://t.me/Kultup">@Kultup</a>`,
              { parse_mode: 'HTML' }
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
              parse_mode: 'HTML',
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

  async handleBotHelpCallback(chatId) {
    const text =
      `❓ <b>Що вміє цей бот</b>\n\n` +
      `<b>🤖 Розумний помічник (AI)</b>\n` +
      `• Просто напишіть проблему — бот зрозуміє і сам заповнить заявку\n` +
      `• Надішліть <b>скріншот або фото помилки</b> — бот проаналізує і створить заявку\n` +
      `• Надішліть <b>голосове повідомлення</b> — бот розпізнає мову і обробить\n` +
      `• Надішліть кілька фото одразу — всі будуть прикріплені до заявки\n` +
      `• Якщо AI не знає відповіді — одразу передає заявку адміністратору\n\n` +
      `<b>📝 Заявки (тікети)</b>\n` +
      `• Створити нову заявку (текст, фото, PDF)\n` +
      `• Переглянути активні заявки та їх статус\n` +
      `• Переглянути історію всіх звернень\n` +
      `• Отримувати сповіщення про зміни статусу\n\n` +
      `<b>📁 Прикріплення файлів</b>\n` +
      `• Фото та скріншоти (до 5 фото на заявку)\n` +
      `• PDF, Word, Excel та інші документи\n` +
      `• Альбом фото — всі знімки потраплять в одну заявку\n\n` +
      `<b>📊 Статистика та звіти</b>\n` +
      `• Переглянути кількість відкритих/закритих заявок\n` +
      `• Середній час вирішення\n\n` +
      `<b>👤 Профіль</b>\n` +
      `• Оновити фото доступу до ПК (AnyDesk, TeamViewer тощо)\n\n` +
      `<b>💡 Підказки</b>\n` +
      `• Напишіть довільний текст — бот почне збирати інформацію\n` +
      `• Надішліть фото без підпису — бот сам зрозуміє контекст\n` +
      `• Команда /start — повернутися в головне меню`;

    await this.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
      },
    });
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
        [{ text: '❓ Що вміє бот', callback_data: 'bot_help' }],
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
      try {
        await this.answerCallbackQuery(callbackQuery.id, 'Бот працює тільки в приватних чатах');
      } catch {
        // ignore send errors for group callbacks
      }
      return; // Ігноруємо callback-запити з груп, супергруп та каналів
    }

    // Обробка callback для підтвердження/відхилення посади (з груп)
    if (isPositionRequestCallback) {
      try {
        await this.registrationService.handlePositionRequestCallback(callbackQuery);
      } catch (err) {
        logger.error('Помилка handlePositionRequestCallback:', { err: err.message });
      }
      return;
    }

    try {
      logger.info('Обробка callback query:', { userId, data, chatId, messageId, chatType });

      const callbackSession = this.userSessions.get(chatId);
      if (callbackSession) {
        callbackSession.lastActivityAt = Date.now();
        this.userSessions.set(chatId, callbackSession);
      }

      // Продовження сесії (попередження про неактивність) — обробляємо до перевірки user
      if (data === 'extend_session') {
        const session = this.userSessions.get(chatId);
        if (session) {
          session.lastActivityAt = Date.now();
          delete session.idleWarningSentAt;
          this.userSessions.set(chatId, session);
          await this.answerCallbackQuery(callbackQuery.id, 'Сесію продовжено ✅');
          try {
            await this.deleteMessage(chatId, messageId);
          } catch {
            // ignore — повідомлення могло вже бути видалено
          }
          await this.sendMessage(chatId, 'Сесію продовжено. Продовжуйте, якщо потрібна допомога.');
          return;
        }
      }

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
            lastActivityAt: Date.now(),
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
                  parse_mode: 'HTML',
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
                      inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                        { text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' },
                        { text: this.getCancelButtonText(), callback_data: 'cancel_ticket' },
                      ]),
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

              if (session.awaitingErrorPhoto) {
                nextQuestion =
                  nextQuestion +
                  '\n\n📸 Надішліть, будь ласка, фото помилки (скріншот) — це допоможе швидше вирішити проблему.';
              }
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
          await this.answerCallbackQuery(callbackQuery.id);
          this.pushNavigationHistory(chatId, 'my_tickets');
          await this.ticketService.handleMyTicketsCallback(chatId, user);
        } else if (data === 'ticket_history') {
          await this.answerCallbackQuery(callbackQuery.id);
          this.pushNavigationHistory(chatId, 'ticket_history');
          await this.ticketService.handleTicketHistoryCallback(chatId, user);
        } else if (data.startsWith('view_ticket_')) {
          await this.answerCallbackQuery(callbackQuery.id);
          const ticketId = data.replace('view_ticket_', '');
          this.pushNavigationHistory(chatId, `view_ticket_${ticketId}`);
          await this.ticketService.handleViewTicketCallback(chatId, user, ticketId);
        } else if (data.startsWith('recreate_ticket_')) {
          await this.answerCallbackQuery(callbackQuery.id);
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
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'statistics') {
          await this.answerCallbackQuery(callbackQuery.id);
          this.pushNavigationHistory(chatId, 'statistics');
          await this.handleStatisticsCallback(chatId, user);
        } else if (data === 'bot_help') {
          await this.answerCallbackQuery(callbackQuery.id);
          await this.handleBotHelpCallback(chatId);
        } else if (data === 'check_tokens') {
          await this.aiService.handleCheckTokensCallback(chatId, user);
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'ai_generate_summary') {
          await this.aiService.generateSummaryAndShowConfirmation(chatId, user);
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
            const filler = await aiFirstLineService.generateConversationalResponse(
              session.dialog_history || [],
              'accept_thanks',
              session.userContext || {}
            );
            botConversationService.appendMessage(chatId, user, 'assistant', filler).catch(() => {});
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
            session.dialog_history = session.dialog_history || [];
            session.dialog_history.push({ role: 'user', content: 'Не допомогло' });
            botConversationService
              .appendMessage(chatId, user, 'user', 'Не допомогло', null, 'Не допомогло')
              .catch(() => {});
            session.step = 'awaiting_error_details_after_not_helped';
            await this.sendMessage(
              chatId,
              'Опишіть, будь ласка, що саме не спрацювало, або надішліть фото/скріншот помилки — тоді створимо заявку.',
              {
                reply_markup: {
                  inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                    {
                      text: '⏭️ Пропустити (створити заявку без додатків)',
                      callback_data: 'skip_error_details_after_not_helped',
                    },
                    { text: this.getCancelButtonText(), callback_data: 'cancel_ticket' },
                  ]),
                },
              }
            );
          }
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'skip_error_details_after_not_helped') {
          const session = this.userSessions.get(chatId);
          if (session && session.step === 'awaiting_error_details_after_not_helped') {
            await this.aiService.proceedToTicketConfirmationAfterNotHelped(chatId, user);
          }
          await this.answerCallbackQuery(callbackQuery.id);
          // [KB ВИМКНЕНО] } else if (data.startsWith('kb_article_')) {
          //   const articleId = data.replace('kb_article_', '');
          //   await this.aiService.handleKbArticleCallback(chatId, articleId, user);
          //   await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'back') {
          await this.answerCallbackQuery(callbackQuery.id);
          await this.handleBackNavigation(chatId, user);
        } else if (data === 'back_to_menu') {
          await this.answerCallbackQuery(callbackQuery.id);
          this.clearNavigationHistory(chatId);
          await this.showUserDashboard(chatId, user);
        } else if (data === 'back_to_tickets') {
          await this.answerCallbackQuery(callbackQuery.id);
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
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'add_more_photos') {
          await this.ticketService.handleAddMorePhotosCallback(chatId, user);
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'finish_ticket') {
          await this.ticketService.handleFinishTicketCallback(chatId, user);
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'confirm_create_ticket') {
          // ✅ Користувач підтвердив створення тікета
          const session = this.userSessions.get(chatId);
          if (session && session.step === 'confirm_ticket' && session.ticketDraft) {
            // Перевірка на дублікат (перший клік — попередження, другий — дозволяємо)
            if (session.duplicateTicketId && !session.duplicateConfirmed) {
              session.duplicateConfirmed = true;
              this.userSessions.set(chatId, session);
              await this.sendMessage(
                chatId,
                `⚠️ <b>Увага!</b> В цьому закладі вже є схоже звернення за останні 10 хвилин.\n\nВсе одно створити нову заявку?`,
                {
                  parse_mode: 'HTML',
                  reply_markup: {
                    inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                      { text: '✅ Так, створити', callback_data: 'confirm_create_ticket' },
                      { text: '❌ Скасувати', callback_data: 'cancel_ticket' },
                    ]),
                  },
                }
              );
            } else {
              // Переводимо draft в реальний тікет
              session.step = 'photo';
              const pendingPhotos = (session.pendingAttachments || []).filter(
                a => a.type === 'photo'
              );
              const pendingDocs = (session.pendingAttachments || []).filter(
                a => a.type === 'document'
              );
              session.ticketData = {
                createdBy: session.ticketDraft.createdBy,
                title: session.ticketDraft.title,
                description: session.ticketDraft.description,
                priority: session.ticketDraft.priority,
                subcategory: session.ticketDraft.subcategory,
                type: session.ticketDraft.type,
                photos: pendingPhotos,
                documents: pendingDocs,
              };

              this.userSessions.set(chatId, session);

              const totalAttached = pendingPhotos.length + pendingDocs.length;
              if (totalAttached > 0) {
                // Є вкладення — одразу створюємо тікет без зайвого кроку
                await this.ticketService.handleFinishTicketCallback(chatId, user);
              } else {
                // Немає вкладень — питаємо чи додати фото
                await this.sendMessage(
                  chatId,
                  `✅ <b>Інформацію збережено</b>\n\n📸 <b>Останній крок:</b> Бажаєте додати фото до заявки?`,
                  {
                    parse_mode: 'HTML',
                    reply_markup: {
                      inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                        { text: '📷 Додати фото', callback_data: 'attach_photo' },
                        { text: '⏭️ Пропустити', callback_data: 'skip_photo' },
                        { text: this.getCancelButtonText(), callback_data: 'cancel_ticket' },
                      ]),
                    },
                  }
                );
              }
            }
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
            this.userSessions.set(chatId, session);

            await this.sendMessage(
              chatId,
              `✅ *Добре, створюю тікет з наявною інформацією.*\n\n` + `📸 Бажаєте додати фото?`,
              {
                reply_markup: {
                  inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                    { text: '📷 Додати фото', callback_data: 'attach_photo' },
                    { text: '⏭️ Пропустити', callback_data: 'skip_photo' },
                  ]),
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
                  inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                    { text: '⏭️ Нічого не змінювати', callback_data: 'edit_nothing_change' },
                    { text: '❌ Скасувати', callback_data: 'cancel_info_gathering' },
                  ]),
                },
                parse_mode: 'HTML',
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
                inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                  { text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' },
                  { text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' },
                  { text: this.getCancelButtonText(), callback_data: 'cancel_ticket' },
                ]),
              },
              parse_mode: 'HTML',
            });
          }
          await this.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'cancel_info_gathering') {
          // Скасування збору інформації (AI або збір без AI)
          const session = this.userSessions.get(chatId);
          if (session && session.aiDialogId) {
            await this.aiService.completeAIDialog(session.aiDialogId, 'cancelled');
          }
          const filler = await aiFirstLineService.generateConversationalResponse(
            session?.dialog_history || [],
            'session_closed',
            session?.userContext || {}
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
            // Очищаємо всі AI-специфічні флаги щоб не конфліктували з classic mode
            delete session.awaitingComputerAccessPhoto;
            delete session.awaitingErrorPhoto;
            delete session.lastMissingInfo;
            delete session.cachedPriority;
            delete session.cachedCategory;
            delete session.cachedEmotionalTone;
            delete session.cachedRequestType;
            delete session.duplicateTicketId;
            delete session.duplicateConfirmed;
            delete session.photoMetadata;
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
            `ℹ️ <b>Відповідь на тікет через Telegram недоступна</b>\n\n` +
              `Будь ласка, використовуйте веб-панель для додавання коментарів до тікету.\n\n` +
              `Натисніть /menu для повернення до головного меню.`,
            { parse_mode: 'HTML' }
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

    // Перевіряємо, чи користувач вже зареєстрований (telegramId або telegramChatId)
    const existingUser = await User.findOne({
      $or: [
        { telegramId: String(userId) },
        { telegramId: userId },
        { telegramChatId: String(chatId) },
        { telegramChatId: chatId },
      ],
    })
      .populate('position', 'name')
      .populate('city', 'name');

    // Якщо користувач зареєстрований, не проводимо реєстрацію
    if (existingUser) {
      // Перевіряємо, чи є активна сесія для створення тікету
      if (session) {
        // Додано: docs/AI_BOT_LOGIC.md — обробка AI-режиму (виклики 1–3)
        if (session.mode === 'ai') {
          const AI_RESPONSE_TIMEOUT_MS = 55000;
          try {
            await Promise.race([
              this.aiService.handleMessageInAiMode(chatId, text, session, existingUser),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_RESPONSE_TIMEOUT_MS)
              ),
            ]);
          } catch (err) {
            logger.error('Помилка AI-режиму (сесія вже існує)', {
              chatId,
              userId,
              err: err.message,
              stack: err.stack,
            });
            const isTimeout = err && err.message === 'AI_TIMEOUT';
            await this.sendMessage(
              chatId,
              isTimeout
                ? 'Обробка зайняла надто багато часу. Спробуйте ще раз або створіть заявку вручну.'
                : 'Виникла помилка під час обробки. Спробуйте ще раз або створіть заявку вручну.',
              {
                reply_markup: {
                  inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                    { text: '📝 Створити тікет', callback_data: 'create_ticket' },
                    { text: '🏠 Головне меню', callback_data: 'back_to_menu' },
                  ]),
                },
              }
            );
          }
          return;
        }
        if (session.mode === 'choosing') {
          await this.sendMessage(chatId, 'Оберіть дію кнопками нижче 👇');
          return;
        }
        await this.ticketService.handleTicketCreationStep(chatId, text, session);
        return;
      }

      const user = await User.findOne({ telegramChatId: chatId });
      if (user) {
        const feedbackHandled = await this.handleFeedbackMessage(chatId, text, user);
        if (feedbackHandled) {
          return;
        }
      }

      // Додано: docs/AI_BOT_LOGIC.md — якщо користувач пише проблему без натискання «Створити тікет», запускаємо AI-флоу
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
      if (aiEnabled && hasApiKey && text && String(text).trim().length > 0) {
        const fullUser = await User.findById(existingUser._id)
          .populate('position', 'title name')
          .populate('city', 'name region')
          .populate('institution', 'name')
          .lean();
        const profile = fullUser || existingUser;
        const userCityId = profile.city?._id || profile.city;
        let userEquipmentSummary = '';
        try {
          const Equipment = require('../models/Equipment');
          const equipList = await Equipment.find({ assignedTo: profile._id }).lean();
          if (equipList && equipList.length) {
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
          userCityId,
          userInstitutionId: profile.institution?._id || profile.institution,
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
          userEquipmentSummary: userEquipmentSummary || undefined,
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
          lastActivityAt: Date.now(),
        };
        this.userSessions.set(chatId, session);
        const AI_RESPONSE_TIMEOUT_MS = 55000;
        try {
          logger.info('AI: запуск обробки повідомлення', { chatId, userId });
          await Promise.race([
            this.aiService.handleMessageInAiMode(chatId, text.trim(), session, existingUser),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_RESPONSE_TIMEOUT_MS)
            ),
          ]);
        } catch (err) {
          logger.error('Помилка AI-режиму (перше повідомлення)', {
            chatId,
            userId,
            err: err.message,
            stack: err.stack,
          });
          this.userSessions.delete(chatId);
          const isTimeout = err && err.message === 'AI_TIMEOUT';
          await this.sendMessage(
            chatId,
            isTimeout
              ? 'Обробка зайняла надто багато часу. Спробуйте ще раз або створіть заявку вручну.'
              : 'Виникла помилка під час обробки. Спробуйте ще раз або створіть заявку вручну.',
            {
              reply_markup: {
                inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                  { text: '📝 Створити тікет', callback_data: 'create_ticket' },
                  { text: '🏠 Головне меню', callback_data: 'back_to_menu' },
                ]),
              },
            }
          );
        }
        return;
      }

      // Якщо AI вимкнений і користувач написав текст — підказка та кнопка «Створити тікет» (робота лише через кнопки)
      if (text && String(text).trim().length > 0) {
        await this.sendMessage(
          chatId,
          `🤖 AI зараз недоступний. Спробуйте пізніше або використайте стандартну процедуру подачі звернення.`,
          {
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: '📝 Створити тікет', callback_data: 'create_ticket' },
                { text: '🏠 Головне меню', callback_data: 'back_to_menu' },
              ]),
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

    const user = await User.findOne({ telegramChatId: chatId });
    if (user) {
      const feedbackHandled = await this.handleFeedbackMessage(chatId, text, user);
      if (feedbackHandled) {
        return;
      }
    }

    if (session) {
      await this.ticketService.handleTicketCreationStep(chatId, text, session);
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

  /**
   * Повертає true тільки для першого фото з Telegram-альбому (media_group).
   * Повторні фото з того ж альбому повертають false, щоб не показувати кілька підтверджень.
   * Запис живе 10 секунд — достатньо для доставки всіх фото альбому.
   */
  _isFirstInMediaGroup(chatId, mediaGroupId) {
    const key = `${chatId}:${mediaGroupId}`;
    if (this._mediaGroupSeen.has(key)) {
      return false;
    }
    this._mediaGroupSeen.set(key, true);
    setTimeout(() => this._mediaGroupSeen.delete(key), 10000);
    return true;
  }

  /** Завантажує додаткове фото з Telegram-альбому і зберігає в session.pendingAttachments без аналізу. */
  async _savePendingPhotoToSession(chatId, msg, session) {
    try {
      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;
      const file = await this.bot.getFile(fileId);
      const ext = path.extname(file.file_path).toLowerCase() || '.jpg';
      const localPath = await this.downloadTelegramFileByFileId(fileId, ext);
      if (!session.pendingAttachments) {
        session.pendingAttachments = [];
      }
      session.pendingAttachments.push({
        type: 'photo',
        fileId,
        path: localPath,
        caption: msg.caption || '',
      });
      this.userSessions.set(chatId, session);
      logger.info('AI: додаткове фото з альбому збережено', {
        chatId,
        total: session.pendingAttachments.length,
      });
    } catch (err) {
      logger.error('Помилка збереження додаткового фото з альбому', { chatId, err: err.message });
    }
  }

  // Обробка фото
  async handlePhoto(msg) {
    const chatId = msg.chat.id;
    const session = this.userSessions.get(chatId);
    const caption = (msg.caption || '').trim();

    // Фото для сайту: caption починається з WEB_ (без активної сесії тікету/AI)
    if (caption.toUpperCase().startsWith('WEB_') && !(session && session.step === 'photo')) {
      try {
        const user = await User.findOne({
          $or: [{ telegramId: String(msg.from.id) }, { telegramId: msg.from.id }],
        });
        if (!user) {
          await this.sendMessage(chatId, '❌ Помилка: Користувач не знайдений в системі.');
          return;
        }
        const escapedCaption = TelegramUtils.escapeHtml(caption);
        await this.sendMessage(
          chatId,
          `📥 Виявлено фото для сайту: <b>${escapedCaption}</b>\nЗберігаю...`,
          { parse_mode: 'HTML' }
        );
        const largestPhoto = msg.photo[msg.photo.length - 1];
        const fileInfo = await this.bot.getFile(largestPhoto.file_id);
        const tempPath = await this.downloadTelegramFile(fileInfo.file_path);

        const { uploadsPath } = require('../config/paths');
        const fs = require('fs');
        const destDir = path.join(uploadsPath, 'website-content');
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        const ext = path.extname(fileInfo.file_path) || '.jpg';
        const safeName = caption.replace(/[^\wа-яёіїєґА-ЯЁІЇЄҐ.\-_]/gi, '_');
        const savedName = `${Date.now()}_${safeName}${ext.includes('.') ? '' : ext}`;
        const savedPath = path.join(destDir, savedName);
        fs.renameSync(tempPath, savedPath);

        await this.sendMessage(chatId, '✅ Фото збережено і адміністратора сповіщено!');
        await this.notificationService.notifyAdminsAboutWebsiteContent(
          caption,
          user,
          savedPath,
          true
        );
        return;
      } catch (error) {
        logger.error('Помилка збереження фото для сайту:', error);
        await this.sendMessage(
          chatId,
          `❌ Помилка збереження фото: ${TelegramUtils.escapeHtml(error.message)}`
        );
        return;
      }
    }

    if (session) {
      if (session.step === 'photo') {
        await this.ticketService.handleTicketPhoto(chatId, msg.photo, msg.caption);
        return;
      }
      if (session.mode === 'ai' || session.mode === 'choosing') {
        if (msg.media_group_id && !this._isFirstInMediaGroup(chatId, msg.media_group_id)) {
          return;
        }
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
    const computerAccessDir = path.join(uploadsPath, 'computer-access');
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
    const fileName = msg.document.file_name;

    // Файли для оновлення сайту (WEB_ префікс)
    if (fileName && fileName.toUpperCase().startsWith('WEB_')) {
      try {
        const user = await User.findOne({
          $or: [{ telegramId: String(msg.from.id) }, { telegramId: msg.from.id }],
        });
        if (!user) {
          await this.sendMessage(chatId, '❌ Помилка: Користувач не знайдений в системі.');
          return;
        }
        const escapedFileName = TelegramUtils.escapeHtml(fileName);
        await this.sendMessage(
          chatId,
          `📥 Виявлено файл для сайту: <b>${escapedFileName}</b>\nЗберігаю...`,
          { parse_mode: 'HTML' }
        );
        const fileInfo = await this.bot.getFile(msg.document.file_id);
        const tempPath = await this.downloadTelegramFile(fileInfo.file_path);

        const { uploadsPath } = require('../config/paths');
        const fs = require('fs');
        const destDir = path.join(uploadsPath, 'website-content');
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        const savedName = `${Date.now()}_${fileName}`;
        const savedPath = path.join(destDir, savedName);
        fs.renameSync(tempPath, savedPath);

        await this.sendMessage(chatId, '✅ Файл збережено і адміністратора сповіщено!');
        await this.notificationService.notifyAdminsAboutWebsiteContent(
          fileName,
          user,
          savedPath,
          false
        );
        return;
      } catch (error) {
        logger.error('Помилка збереження файлу для сайту:', error);
        await this.sendMessage(
          chatId,
          `❌ Помилка збереження файлу: ${TelegramUtils.escapeHtml(error.message)}`
        );
        return;
      }
    }

    // Автоматичний імпорт інвентарних файлів
    if (fileName && fileName.toUpperCase().startsWith('INV_')) {
      try {
        const user = await User.findOne({
          $or: [{ telegramId: String(msg.from.id) }, { telegramId: msg.from.id }],
        });

        if (!user) {
          await this.sendMessage(chatId, '❌ Помилка: Користувач не знайдений в системі.');
          return;
        }

        // Дозволяємо всім користувачам імпортувати обладнання
        logger.info(`Користувач розпочав імпорт інвентаризації`, {
          userId: user._id,
          telegramId: user.telegramId,
          role: user.role,
          fileName: fileName,
        });

        const escapedFileName = TelegramUtils.escapeHtml(fileName);
        await this.sendMessage(
          chatId,
          `📥 Виявлено інвентарний файл: <b>${escapedFileName}</b>\nПочинаю обробку...`,
          { parse_mode: 'HTML' }
        );

        const fileInfo = await this.bot.getFile(msg.document.file_id);
        const localPath = await this.downloadTelegramFile(fileInfo.file_path);

        const results = await equipmentService.importEquipment(localPath, user);

        let resultMsg = `✅ <b>Імпорт завершено</b>\n`;
        resultMsg += `📄 Файл: <code>${escapedFileName}</code>\n`;
        resultMsg += `🟢 Успішно: ${results.success}\n`;
        resultMsg += `🔴 Помилок: ${results.failed}`;

        if (results.errors.length > 0) {
          const escapedErrors = results.errors
            .slice(0, 5)
            .map(err => TelegramUtils.escapeHtml(err))
            .join('\n');
          resultMsg += `\n\n⚠️ <b>Деталі помилок (перші 5):</b>\n${escapedErrors}`;
        }

        await this.sendMessage(chatId, resultMsg, { parse_mode: 'HTML' });

        // Сповіщаємо адмінів
        await this.notificationService.notifyAdminsAboutInventoryImport(fileName, user, results);

        return;
      } catch (error) {
        logger.error('Помилка автоматичного імпорту обладнання з Telegram:', error);
        const escapedError = TelegramUtils.escapeHtml(error.message);
        await this.sendMessage(chatId, `❌ Помилка при обробці файлу: ${escapedError}`);
        return;
      }
    }

    if (session && session.step === 'photo') {
      // Класичний режим — буферизуємо щоб кілька файлів = одне повідомлення
      this._queueClassicDocument(chatId, msg);
    } else if (!session || session.mode === 'ai' || session.mode === 'choosing') {
      // AI-режим або немає сесії — буферизуємо (debounce 1.5с) щоб кілька файлів = одне повідомлення
      this._queueDocumentForAi(chatId, msg);
    } else {
      await this.sendMessage(chatId, 'Файли можна прикріпляти тільки під час створення тікету.');
    }
  }

  /** Додає документ у буфер. Через 1.5с обробляє всі накопичені документи разом. */
  _queueDocumentForAi(chatId, msg) {
    const key = String(chatId);
    const existing = this._documentBuffers.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.msgs.push(msg);
    } else {
      this._documentBuffers.set(key, { msgs: [msg] });
    }
    const buffer = this._documentBuffers.get(key);
    buffer.timer = setTimeout(() => {
      this._documentBuffers.delete(key);
      this._processDocumentQueue(chatId, buffer.msgs).catch(err => {
        logger.error('Помилка обробки черги документів', { chatId, err: err.message });
      });
    }, 1500);
  }

  /** Обробляє накопичені документи: створює/використовує AI-сесію, зберігає всі файли, надсилає одне підсумкове повідомлення. */
  async _processDocumentQueue(chatId, msgs) {
    let session = this.userSessions.get(chatId);

    if (!session) {
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

      if (!aiEnabled || !hasApiKey) {
        await this.sendMessage(chatId, 'Файли можна прикріпляти тільки під час створення тікету.');
        return;
      }

      const user = await User.findOne({
        $or: [{ telegramId: String(msgs[0].from.id) }, { telegramId: msgs[0].from.id }],
      });
      if (!user) {
        await this.sendMessage(chatId, 'Файли можна прикріпляти тільки під час створення тікету.');
        return;
      }

      const fullUser = await User.findById(user._id)
        .populate('position', 'title name')
        .populate('city', 'name region')
        .populate('institution', 'name')
        .lean();
      const profile = fullUser || user;

      session = {
        mode: 'ai',
        step: 'gathering_information',
        ai_attempts: 0,
        ai_questions_count: 0,
        dialog_history: [],
        userContext: {
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
        },
        ticketData: { createdBy: user._id, photos: [], documents: [] },
        ticketDraft: null,
        lastActivityAt: Date.now(),
      };
      this.userSessions.set(chatId, session);
    }

    // Скидаємо сесію якщо вона "застрягла" в неправильному стані або неактивна > 30 хв
    const SESSION_STALE_MS = 30 * 60 * 1000;
    const isAgeStale =
      !session.lastActivityAt || Date.now() - session.lastActivityAt > SESSION_STALE_MS;
    const isStepBroken = session.step !== 'gathering_information';
    if (isAgeStale || isStepBroken) {
      session.step = 'gathering_information';
      session.dialog_history = [];
      session.ticketDraft = null;
      session.pendingAttachments = [];
      session.ticketData = {
        createdBy: session.ticketData?.createdBy,
        photos: [],
        documents: [],
      };
    }

    if (!session.pendingAttachments) {
      session.pendingAttachments = [];
    }

    // Видаляємо "мертві" записи — файли яких вже немає на диску (після краша сервера)
    session.pendingAttachments = session.pendingAttachments.filter(a => {
      if (!a.path) {
        return false;
      }
      try {
        return fs.existsSync(a.path);
      } catch {
        return false;
      }
    });

    const savedNames = [];
    for (const msg of msgs) {
      const fileName = msg.document.file_name || 'document';
      try {
        const fileInfo = await this.bot.getFile(msg.document.file_id);
        const tempPath = await this.downloadTelegramFile(fileInfo.file_path);
        const safeName = `${Date.now()}_${fileName.replace(/[^\wа-яёіїєґА-ЯЁІЇЄҐ._-]/gi, '_')}`;
        const savedPath = path.join(uploadsPath, 'telegram-files', safeName);
        fs.renameSync(tempPath, savedPath);
        session.pendingAttachments.push({
          type: 'document',
          fileId: msg.document.file_id,
          path: savedPath,
          fileName,
          extension: path.extname(fileName).toLowerCase(),
          caption: msg.caption || '',
          size: msg.document.file_size || 0,
        });
        savedNames.push(fileName);
      } catch (err) {
        logger.error('Помилка збереження документу в чергу', {
          chatId,
          fileName,
          err: err.message,
        });
      }
    }

    // Додаємо запис у dialog_history щоб getTicketSummary мав контекст, а не використовував
    // нещодавно вирішені тікети як "reference" (що може дати неправильну категорію/опис)
    if (savedNames.length > 0) {
      if (!session.dialog_history) {
        session.dialog_history = [];
      }
      const captionParts = msgs
        .filter(m => m.caption && m.caption.trim())
        .map(m => m.caption.trim());
      const fileListText =
        `Прикріплено документи до заявки: ${savedNames.join(', ')}` +
        (captionParts.length ? `. Підписи: ${captionParts.join('; ')}` : '');
      session.dialog_history.push({ role: 'user', content: fileListText });
    }

    this.userSessions.set(chatId, session);

    if (savedNames.length === 0) {
      await this.sendMessage(chatId, '❌ Не вдалося зберегти файли. Спробуйте ще раз.');
      return;
    }

    const total = session.pendingAttachments.length;
    const namesText = savedNames.map(n => `• ${TelegramUtils.escapeHtml(n)}`).join('\n');
    const header =
      savedNames.length === 1
        ? `📎 <b>Файл прикріплено:</b>`
        : `📎 <b>Прикріплено файлів: ${savedNames.length}</b>`;

    const fileButtons = [[{ text: '📝 Сформувати заявку', callback_data: 'ai_generate_summary' }]];

    await this.sendMessage(
      chatId,
      `${header}\n${namesText}\n\n<i>Всього у заявці: ${total} файл(ів)</i>\n\nОпишіть проблему або натисніть «Сформувати заявку».`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: fileButtons,
        },
      }
    );
  }

  /** Додає документ у буфер класичного режиму. Через 1.5с обробляє всі разом. */
  _queueClassicDocument(chatId, msg) {
    const key = String(chatId);
    const existing = this._classicDocBuffers.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.msgs.push(msg);
    } else {
      this._classicDocBuffers.set(key, { msgs: [msg] });
    }
    const buffer = this._classicDocBuffers.get(key);
    buffer.timer = setTimeout(() => {
      this._classicDocBuffers.delete(key);
      this._processClassicDocumentQueue(chatId, buffer.msgs).catch(err => {
        logger.error('Помилка обробки черги документів (класичний режим)', {
          chatId,
          err: err.message,
        });
      });
    }, 1500);
  }

  /** Обробляє накопичені документи класичного режиму: зберігає всі, надсилає одне повідомлення. */
  async _processClassicDocumentQueue(chatId, msgs) {
    const session = this.userSessions.get(chatId);
    if (!session || session.step !== 'photo') {
      return;
    }

    if (!session.ticketData) {
      session.ticketData = { photos: [], documents: [] };
    }
    if (!session.ticketData.documents) {
      session.ticketData.documents = [];
    }

    const maxFiles = 10;
    const maxSizeBytes = 50 * 1024 * 1024;
    const savedNames = [];
    const errors = [];

    for (const msg of msgs) {
      const document = msg.document;
      const fileId = document.file_id;
      const fileSizeBytes = document.file_size || 0;
      const fileName = document.file_name || 'document';
      const fileExtension = path.extname(fileName).toLowerCase() || '.bin';

      const totalFiles =
        (session.ticketData.photos?.length || 0) + (session.ticketData.documents?.length || 0);
      if (totalFiles >= maxFiles) {
        errors.push(`${fileName}: досягнуто ліміт ${maxFiles} файлів`);
        continue;
      }

      if (fileSizeBytes > maxSizeBytes) {
        errors.push(`${fileName}: файл занадто великий`);
        continue;
      }

      try {
        const savedPath = await TelegramUtils.downloadTelegramFileByFileId(
          this.bot,
          fileId,
          fileExtension
        );
        session.ticketData.documents.push({
          fileId,
          path: savedPath,
          fileName,
          caption: msg.caption || '',
          size: fileSizeBytes,
          extension: fileExtension,
          mimeType: document.mime_type || 'application/octet-stream',
        });
        savedNames.push(fileName);
      } catch (err) {
        logger.error('Помилка завантаження файлу (класичний режим)', {
          chatId,
          fileName,
          err: err.message,
        });
        errors.push(`${fileName}: помилка завантаження`);
      }
    }

    this.userSessions.set(chatId, session);

    if (savedNames.length === 0) {
      const allLimited = errors.length > 0 && errors.every(e => e.includes('ліміт'));
      const totalNowOnLimit =
        (session.ticketData.photos?.length || 0) + (session.ticketData.documents?.length || 0);
      if (allLimited) {
        await this.sendMessage(
          chatId,
          `❌ <b>Досягнуто ліміт файлів!</b>\n\nВже прикріплено: ${totalNowOnLimit}/10 файлів.\n\nНатисніть «Завершити» щоб створити заявку.`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: '✅ Завершити', callback_data: 'finish_ticket' },
                { text: TelegramUtils.getCancelButtonText(), callback_data: 'cancel_ticket' },
              ]),
            },
          }
        );
      } else {
        await this.sendMessage(chatId, '❌ Не вдалося зберегти файли. Спробуйте ще раз.');
      }
      return;
    }

    const totalNow =
      (session.ticketData.photos?.length || 0) + (session.ticketData.documents?.length || 0);

    const header =
      savedNames.length === 1
        ? `✅ <b>Файл додано!</b> (${totalNow}/${maxFiles})\n\n📄 ${TelegramUtils.escapeHtml(savedNames[0])}`
        : `✅ <b>Додано файлів: ${savedNames.length}</b> (всього: ${totalNow}/${maxFiles})\n\n` +
          savedNames.map(n => `📄 ${TelegramUtils.escapeHtml(n)}`).join('\n');

    const errText =
      errors.length > 0
        ? `\n\n⚠️ Не вдалося додати:\n${errors.map(e => `• ${TelegramUtils.escapeHtml(e)}`).join('\n')}`
        : '';

    await this.sendMessage(chatId, `${header}${errText}\n\nХочете додати ще файли?`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
          { text: '📎 Додати ще файл', callback_data: 'add_more_photos' },
          { text: '✅ Завершити', callback_data: 'finish_ticket' },
          { text: TelegramUtils.getCancelButtonText(), callback_data: 'cancel_ticket' },
        ]),
      },
    });
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
      const token = this.token || process.env.TELEGRAM_BOT_TOKEN;
      const url = `https://api.telegram.org/file/bot${token}/${filePath}`;

      // Папка створюється при старті в app.js; перевірка на випадок ручного видалення
      const uploadsDir = path.join(uploadsPath, 'telegram-files');
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
        parse_mode: 'HTML',
      });
    } catch (error) {
      logger.error('Помилка отримання статистики:', error);
      await this.sendMessage(
        chatId,
        `❌ <b>Помилка завантаження статистики</b>\n\n` +
          `Не вдалося завантажити дані статистики.\n\n` +
          `🔄 Спробуйте ще раз або зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>`,
        { parse_mode: 'HTML' }
      );
    }
  }

  async handleHelpCommand(chatId, _user) {
    const helpText =
      `📖 <b>Довідка по командам</b>\n\n` +
      `<b>Основні команди:</b>\n` +
      `🔹 /start — Головне меню\n` +
      `🔹 /menu — Повернутися до головного меню\n` +
      `🔹 /help — Показати цю довідку\n` +
      `🔹 /status — Швидкий перегляд статусів тікетів\n\n` +
      `<b>Функції бота:</b>\n` +
      `📝 <b>Створити тікет</b> — Надішліть опис проблеми текстом\n` +
      `📋 <b>Мої тікети</b> — Перегляд всіх ваших тікетів\n` +
      `📜 <b>Історія тікетів</b> — Перегляд закритих тікетів\n` +
      `📊 <b>Статистика</b> — Ваша статистика по тікетам\n\n` +
      `<b>Додаткові можливості:</b>\n` +
      `📸 Можна додавати фото до тікетів\n\n` +
      `<b>Підтримка:</b>\n` +
      `Якщо виникли питання, зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>`;

    await this.sendMessage(chatId, helpText, {
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back' }]],
      },
      parse_mode: 'HTML',
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

      let text = `⚡ <b>Швидкий статус тікетів</b>\n\n`;

      if (openTickets.length > 0) {
        text += `🔓 <b>Відкриті тікети (${openTickets.length}):</b>\n`;
        openTickets.forEach((ticket, index) => {
          const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
          });
          text += `${index + 1}. ${TelegramUtils.escapeHtml(this.truncateButtonText(ticket.title, 40))} — <code>${date}</code>\n`;
        });
        text += `\n`;
      }

      if (inProgressTickets.length > 0) {
        text += `⚙️ <b>У роботі (${inProgressTickets.length}):</b>\n`;
        inProgressTickets.forEach((ticket, index) => {
          const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
          });
          text += `${index + 1}. ${TelegramUtils.escapeHtml(this.truncateButtonText(ticket.title, 40))} — <code>${date}</code>\n`;
        });
        text += `\n`;
      }

      if (openTickets.length === 0 && inProgressTickets.length === 0) {
        text += `✅ У вас немає активних тікетів!\n\n`;
        text += `💡 Створіть новий тікет, якщо потрібна допомога.`;
      } else {
        text += `💡 Використайте «Мої тікети» для повного списку.`;
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
        parse_mode: 'HTML',
      });
    } catch (error) {
      logger.error('Помилка отримання статусу тікетів:', error);
      await this.sendMessage(
        chatId,
        `❌ <b>Помилка завантаження статусу</b>\n\n` +
          `Не вдалося завантажити інформацію про тікети.\n\n` +
          `🔄 Спробуйте ще раз.`,
        { parse_mode: 'HTML' }
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
