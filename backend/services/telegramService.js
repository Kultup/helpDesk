const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const City = require('../models/City');
const Position = require('../models/Position');
const Institution = require('../models/Institution');
const PendingRegistration = require('../models/PendingRegistration');
const PositionRequest = require('../models/PositionRequest');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const https = require('https');
const BotSettings = require('../models/BotSettings');
const TelegramConfig = require('../models/TelegramConfig');
const { formatFileSize } = require('../utils/helpers');
const ticketWebSocketService = require('./ticketWebSocketService');
const fcmService = require('./fcmService');
const aiFirstLineService = require('./aiFirstLineService');
const botConversationService = require('./botConversationService');

class TelegramService {
  constructor() {
    this.bot = null;
    this.isInitialized = false; // Додаємо флаг ініціалізації
    this.userSessions = new Map();
    this.userStates = new Map();
    this.stateStack = new Map();
    this.botSettings = null; // Налаштування бота з БД
    this.mode = 'webhook';
    this.conversationHistory = new Map(); // Зберігаємо історію розмов для AI (chatId -> messages[])
    this.navigationHistory = new Map(); // Історія навігації для кожного користувача (chatId -> ['screen1', 'screen2', ...])
    this._initializing = false; // Флаг для перевірки процесу ініціалізації
    this.internetRequestCounts = new Map(); // Ліміт запитів інформації з інтернету: key = telegramId, value = { date: 'YYYY-MM-DD', count: number }
    this.loadBotSettings(); // Завантажуємо налаштування бота
  }

  static get INTERNET_REQUESTS_LIMIT_PER_DAY() { return 5; }
  static get INTERNET_REQUESTS_EXEMPT_TELEGRAM_ID() { return '6070910226'; }

  /** Запити з інтернету (курс, погода тощо) дозволені лише одному користувачу — 6070910226. Решта отримують відмову. */
  canMakeInternetRequest(telegramId) {
    const id = String(telegramId);
    return id === TelegramService.INTERNET_REQUESTS_EXEMPT_TELEGRAM_ID;
  }

  recordInternetRequest(telegramId) {
    const id = String(telegramId);
    if (id === TelegramService.INTERNET_REQUESTS_EXEMPT_TELEGRAM_ID) return; // єдиний дозволений — ліміт не рахуємо
    const today = new Date().toISOString().slice(0, 10);
    let rec = this.internetRequestCounts.get(id);
    if (!rec || rec.date !== today) rec = { date: today, count: 0 };
    rec.count += 1;
    this.internetRequestCounts.set(id, rec);
  }

  /** Запит курсу USD з НБУ. Повертає { rate, date } або null. */
  fetchNbuUsdRate() {
    return new Promise((resolve) => {
      const url = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json';
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const arr = JSON.parse(data);
            const item = Array.isArray(arr) && arr[0];
            if (item && typeof item.rate === 'number') resolve({ rate: item.rate, date: item.exchangedate || '' });
            else resolve(null);
          } catch (e) {
            logger.error('NBU rate parse error', e);
            resolve(null);
          }
        });
      }).on('error', (err) => {
        logger.error('NBU rate request error', err);
        resolve(null);
      });
    });
  }

  /** Міста для геокодування (Open-Meteo приймає латиницю). */
  static get CITY_NAME_FOR_WEATHER() {
    return { 'київ': 'Kyiv', 'львів': 'Lviv', 'одеса': 'Odesa', 'харків': 'Kharkiv', 'дніпро': 'Dnipro', 'запоріжжя': 'Zaporizhzhia', 'вінниця': 'Vinnytsia', 'полтава': 'Poltava', 'чернігів': 'Chernihiv', 'івано-франківськ': 'Ivano-Frankivsk', 'тернопіль': 'Ternopil', 'ужгород': 'Uzhhorod', 'луцьк': 'Lutsk', 'рівне': 'Rivne', 'черкаси': 'Cherkasy', 'кропивницький': 'Kropyvnytskyi', 'миколаїв': 'Mykolaiv', 'херсон': 'Kherson', 'маріуполь': 'Mariupol' };
  }

  /** Погода за містом: геокод (Open-Meteo) + поточний прогноз. Місто з профілю (userCity). Повертає { temp, description, city } або null. */
  fetchWeatherForCity(cityName) {
    if (!cityName || String(cityName).trim() === '' || String(cityName).toLowerCase() === 'не вказано') return Promise.resolve(null);
    const name = String(cityName).trim();
    const nameLower = name.toLowerCase();
    const cityForApi = TelegramService.CITY_NAME_FOR_WEATHER[nameLower] || name;
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityForApi)}&count=1&language=uk`;
    return new Promise((resolve) => {
      https.get(geoUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const results = json.results;
            const first = Array.isArray(results) && results[0];
            if (!first || typeof first.latitude !== 'number' || typeof first.longitude !== 'number') {
              resolve(null);
              return;
            }
            const lat = first.latitude;
            const lon = first.longitude;
            const placeName = first.name || name;
            const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code`;
            https.get(forecastUrl, (res2) => {
              let data2 = '';
              res2.on('data', (chunk) => { data2 += chunk; });
              res2.on('end', () => {
                try {
                  const f = JSON.parse(data2);
                  const cur = f.current;
                  if (!cur || typeof cur.temperature_2m !== 'number') {
                    resolve(null);
                    return;
                  }
                  const code = cur.weather_code;
                  const descMap = { 0: 'Ясно', 1: 'Переважно ясно', 2: 'Змінна хмарність', 3: 'Хмарно', 45: 'Туман', 48: 'Іній', 51: 'Морось', 53: 'Морось', 55: 'Морось', 61: 'Дощ', 63: 'Дощ', 65: 'Сильний дощ', 71: 'Сніг', 73: 'Сніг', 75: 'Сніг', 77: 'Сніг', 80: 'Злива', 81: 'Злива', 82: 'Злива', 85: 'Снігопад', 86: 'Снігопад', 95: 'Гроза', 96: 'Гроза з градом', 99: 'Гроза з градом' };
                  const description = descMap[code] || 'Опади';
                  resolve({ temp: cur.temperature_2m, description, city: placeName });
                } catch (e2) {
                  logger.error('Open-Meteo forecast parse error', e2);
                  resolve(null);
                }
              });
            }).on('error', (err2) => {
              logger.error('Open-Meteo forecast request error', err2);
              resolve(null);
            });
          } catch (e) {
            logger.error('Open-Meteo geocoding parse error', e);
            resolve(null);
          }
        });
      }).on('error', (err) => {
        logger.error('Open-Meteo geocoding request error', err);
        resolve(null);
      });
    });
  }

  /**
   * Пошук підказки в інтернеті (DuckDuckGo) для формування quickSolution. Викликати лише для користувача з правом на інтернет.
   * @param {string} query - наприклад "принтер не друкує як виправити"
   * @returns {Promise<string>}
   */
  fetchTroubleshootingSnippet(query) {
    if (!query || String(query).trim() === '') return Promise.resolve('');
    const q = encodeURIComponent(String(query).trim().substring(0, 200));
    const url = `https://api.duckduckgo.com/?q=${q}&format=json`;
    return new Promise((resolve) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const parts = [];
            if (json.AbstractText && String(json.AbstractText).trim()) {
              parts.push(String(json.AbstractText).trim().substring(0, 800));
            }
            if (Array.isArray(json.RelatedTopics) && json.RelatedTopics.length > 0) {
              const first = json.RelatedTopics[0];
              const text = first.Text || null;
              if (text && String(text).trim()) parts.push(String(text).trim().substring(0, 400));
            }
            resolve(parts.join('\n\n').trim());
          } catch (e) {
            resolve('');
          }
        });
      }).on('error', () => resolve(''));
    });
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
      return new Promise((resolve) => {
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
        this.bot = new TelegramBot(token, usePolling ? { polling: { interval: 1000, params: { timeout: 10 } } } : { polling: false });
        if (usePolling) {
          this.bot.on('message', (msg) => this.handleMessage(msg));
          this.bot.on('callback_query', (cq) => this.handleCallbackQuery(cq));
          this.bot.on('polling_error', (err) => {
            // Якщо помилка 404 - токен невалідний, вимикаємо бота
            if (err.code === 'ETELEGRAM' && err.response?.statusCode === 404) {
              logger.warn('⚠️ Telegram токен невалідний або бот не знайдено. Telegram бот вимкнено.');
              this.bot = null;
              this.isInitialized = false;
              this._initializing = false;
              return;
            }
            // Якщо помилка 409 - конфлікт з іншим інстансом бота
            if (err.code === 'ETELEGRAM' && (err.response?.statusCode === 409 || err.message?.includes('409'))) {
              logger.warn('⚠️ Конфлікт з іншим інстансом Telegram бота (409). Можливо, запущено кілька процесів. Зупиняємо polling.');
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
    } catch (error) {
      logger.error('Помилка ініціалізації Telegram бота:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Відправка сповіщення користувачу через Telegram
   * @param {String} telegramId - Telegram ID користувача
   * @param {Object} notification - Об'єкт сповіщення {title, message, type}
   * @returns {Promise}
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
      
      // Форматуємо повідомлення
      let formattedMessage = '';
      if (title) {
        formattedMessage += `*${title}*\n\n`;
      }
      formattedMessage += message;

      // Відправляємо повідомлення
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
   * @param {Object} user - Об'єкт користувача з полями firstName, lastName, email, telegramId
   * @returns {Promise}
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
   * @param {Object} user - Об'єкт користувача з полями firstName, lastName, email, telegramId
   * @param {String} reason - Причина відхилення (необов'язково)
   * @returns {Promise}
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

  /** Показати індикатор «друкує» в чаті (typing). Діє ~5 сек, для довгих операцій викликати перед кожною. */
  async sendTyping(chatId) {
    if (!this.bot) return;
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
        logger.debug(`Повідомлення успішно відправлено в чат ${chatId}`, { messageId: result.message_id });
        return result;
      } catch (error) {
        // Якщо помилка пов'язана з парсингом Markdown, спробуємо відправити як звичайний текст
        if (
          error.message?.includes('can\'t parse entities') || 
          error.message?.includes('Bad Request: can\'t parse entities')
        ) {
          logger.warn(`Помилка парсингу Markdown для чату ${chatId}, спроба відправки як звичайний текст`);
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
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    logger.error('Помилка відправки повідомлення:', {
      chatId,
      error: lastError?.message,
      stack: lastError?.stack,
      response: lastError?.response?.data
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
          chatType
        });
        return; // Ігноруємо повідомлення з груп, супергруп та каналів
      }
      
      logger.info(`Отримано повідомлення від користувача ${userId} в чаті ${chatId}`, {
        text: msg.text?.substring(0, 100),
        hasPhoto: !!msg.photo,
        hasVoice: !!msg.voice,
        hasContact: !!msg.contact,
        chatType
      });

      // Перевірка, чи користувач вже зареєстрований
      // Конвертуємо userId в рядок, оскільки telegramId зберігається як String
      const existingUser = await User.findOne({ 
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId }
        ]
      })
        .populate('position', 'title')
        .populate('city', 'name');
      
      // Якщо користувач вже зареєстрований, показуємо головне меню
      if (existingUser && !msg.text?.startsWith('/')) {
        // Обробка голосових повідомлень
        if (msg.voice) {
          await this.handleVoice(msg, existingUser);
          return;
        }

        // Обробка фото: в AI-режимі — аналіз фото та інструкція; інакше — тільки під час створення тікета
        if (msg.photo) {
          const session = this.userSessions.get(msg.chat.id);
          if (session && session.mode === 'ai') {
            await this.handlePhotoInAiMode(msg.chat.id, msg.photo, msg.caption || '', session, existingUser);
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
          await this.handleContact(msg);
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
        await this.handleContact(msg);
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
        userId: msg.from?.id
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
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId }
        ]
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
            await this.sendMessage(chatId, 
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
            await this.sendMessage(chatId, 
              `🚫 *Помилка авторизації*\n\n` +
              `Ви не авторизовані в системі.\n\n` +
              `🔑 Використайте /start для початку роботи.`
            );
          }
          break;
        default:
          if (!user) {
            await this.sendMessage(chatId, 
              `🚫 *Помилка авторизації*\n\n` +
              `Ви не авторизовані в системі.\n\n` +
              `🔑 Використайте /start для початку роботи.`
            );
            return;
          }
          await this.sendMessage(chatId, 
            `❓ *Невідома команда*\n\n` +
            `Команда не розпізнана системою.\n\n` +
            `💡 Використайте /start для перегляду доступних опцій.`
          );
      }
    } catch (error) {
      logger.error('Помилка обробки команди:', error);
      await this.sendMessage(chatId, 
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
        $or: [
          { telegramId: userIdString },
          { telegramId: userId }
        ]
      })
        .populate('position', 'name')
        .populate('city', 'name');
      
      // Додатковий пошук: якщо telegramId збережений із префіксом '@' або пробілами
      if (!user) {
        const prefixedId = `@${userIdString}`;
        const spacedId = ` ${userIdString} `;
        user = await User.findOne({
          telegramId: {
            $in: [prefixedId, spacedId, `@ ${userIdString}`, `${userIdString} `]
          }
        })
        .populate('position', 'name')
        .populate('city', 'name');
      
      if (user) {
          logger.info('Знайдено користувача з telegramId у форматі з префіксом або пробілами. Оновлюємо значення.', {
            userId: user._id,
            email: user.email,
            storedTelegramId: user.telegramId,
            sanitizedTelegramId: userIdString
          });
          user.telegramId = userIdString;
          await user.save();
        }
      }
      
      // Якщо досі не знайдено, пробуємо знайти за telegramChatId
      if (!user) {
        logger.info('Пробуємо знайти користувача за telegramChatId:', {
          chatIdString,
          chatId
        });

        user = await User.findOne({
          $or: [
            { telegramChatId: chatIdString },
            { telegramChatId: String(chatId) }
          ]
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
            newTelegramChatId: chatIdString
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
          telegramUsername: idInUsernameWithAt
        })
          .populate('position', 'name')
          .populate('city', 'name');

        // Якщо не знайдено, пробуємо без префікса @
        if (!user) {
          user = await User.findOne({
            telegramUsername: userIdString
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
            foundWithAt: user.telegramUsername === idInUsernameWithAt
          });

          logger.info('Оновлюємо дані Telegram для користувача (ID був в telegramUsername):', {
            userId: user._id,
            email: user.email,
            oldTelegramId: user.telegramId,
            newTelegramId: userIdString,
            oldTelegramChatId: user.telegramChatId,
            newTelegramChatId: chatIdString,
            oldTelegramUsername: user.telegramUsername
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
          originalUsername: msg.from.username
        });

        user = await User.findOne({
          telegramUsername: { $regex: new RegExp(`^${usernameFromMsg}$`, 'i') }
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
            storedTelegramUsername: user.telegramUsername
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
        userId_db: user?._id
      });
      
      if (user) {
        // Оновлюємо telegramChatId якщо він відрізняється або відсутній
        if (user.telegramChatId !== chatIdString) {
          logger.info('Оновлюємо telegramChatId для користувача:', {
            userId: user._id,
            email: user.email,
            oldChatId: user.telegramChatId,
            newChatId: chatIdString
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
          await this.sendMessage(chatId, 
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
            'test user auto-update (admin/test.com)'
          ]
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
              usernameFromMsg
            });
            
            // Автоматично оновлюємо telegramId для тестового/адмін користувача, якщо:
            // 1. telegramId відсутній (null/undefined) АБО
            // 2. telegramId не співпадає з поточним userId АБО
            // 3. користувач має роль admin
            const shouldUpdate = !testUser.telegramId || 
                                 testUser.telegramId !== userIdString || 
                                 testUser.role === 'admin';
            
            if (shouldUpdate && (testUser.role === 'admin' || testUser.email === 'kultup@test.com')) {
              logger.info('Автоматично оновлюємо telegramId для тестового/адмін користувача:', {
                email: testUser.email,
                role: testUser.role,
                oldTelegramId: testUser.telegramId || 'відсутній',
                newTelegramId: userIdString,
                oldTelegramChatId: testUser.telegramChatId || 'відсутній',
                newTelegramChatId: chatIdString,
                reason: !testUser.telegramId ? 'telegramId відсутній' : 
                        testUser.telegramId !== userIdString ? 'telegramId не співпадає' : 
                        'роль admin'
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
                telegramChatId: testUser.telegramChatId
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
                isTestEmail: testUser.email === 'kultup@test.com'
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
              newChatId: chatIdString
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
            await this.sendMessage(chatId, 
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
        await this.sendMessage(chatId, 
          `🚫 *Доступ обмежено*\n` +
          `Для використання бота потрібно зареєструватися.\n` +
          `📞 Адміністратор: [@Kultup](https://t.me/Kultup)`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔐 Авторизуватися', callback_data: 'login_user' },
                  { text: '📝 Зареєструватися', callback_data: 'register_user' }
                ],
                [
                  { text: '📞 Зв\'язатися з адміністратором', url: 'https://t.me/Kultup' }
                ]
              ]
            }
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
        usernameFromMsg: msg?.from?.username
      });
      await this.sendMessage(chatId, 
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
        await this.sendMessage(chatId, '❌ Помилка: користувач не знайдений. Зверніться до адміністратора.');
        return;
      }
    } catch (error) {
      logger.error('Помилка завантаження даних користувача для dashboard', { 
        chatId, 
        userId: user?._id, 
        error: error.message 
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
      cityName
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
          { text: '📋 Мої тікети', callback_data: 'my_tickets' }
        ],
        [
          { text: '📜 Історія тікетів', callback_data: 'ticket_history' },
          { text: '📊 Статистика', callback_data: 'statistics' }
        ]
      ]
    };

    const telegramIdStr = String(user?.telegramId ?? user?.telegramChatId ?? chatId);
    if (telegramIdStr === TelegramService.INTERNET_REQUESTS_EXEMPT_TELEGRAM_ID) {
      keyboard.inline_keyboard.push([{ text: '🔢 Перевірити токени AI', callback_data: 'check_tokens' }]);
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
    const isPositionRequestCallback = data.startsWith('approve_position_') || data.startsWith('reject_position_');
    
    // Заборона обробки callback-запитів з груп - тільки приватні чати (крім position request)
    if (chatType !== 'private' && !isPositionRequestCallback) {
      logger.info(`Callback query ігноровано - не приватний чат (тип: ${chatType})`, {
        chatId,
        userId,
        data,
        chatType
      });
      await this.answerCallbackQuery(callbackQuery.id, 'Бот працює тільки в приватних чатах');
      return; // Ігноруємо callback-запити з груп, супергруп та каналів
    }

    // Обробка callback для підтвердження/відхилення посади (з груп)
    if (isPositionRequestCallback) {
      await this.handlePositionRequestCallback(callbackQuery);
      return;
    }

    try {
      logger.info('Обробка callback query:', { userId, data, chatId, messageId, chatType });

      // Спочатку перевіряємо, чи користувач вже зареєстрований
      // Конвертуємо userId в рядок для пошуку
      const user = await User.findOne({ 
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId }
        ]
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

      if (data === 'my_tickets') {
        this.pushNavigationHistory(chatId, 'my_tickets');
        await this.handleMyTicketsCallback(chatId, user);
      } else if (data === 'ticket_history') {
        this.pushNavigationHistory(chatId, 'ticket_history');
        await this.handleTicketHistoryCallback(chatId, user);
      } else if (data.startsWith('view_ticket_')) {
        const ticketId = data.replace('view_ticket_', '');
        this.pushNavigationHistory(chatId, `view_ticket_${ticketId}`);
        await this.handleViewTicketCallback(chatId, user, ticketId);
      } else if (data.startsWith('recreate_ticket_')) {
        const ticketId = data.replace('recreate_ticket_', '');
        await this.handleRecreateTicketCallback(chatId, user, ticketId);
      } else if (data === 'use_previous_title') {
        await this.handleUsePreviousTitleCallback(chatId, user);
        await this.answerCallbackQuery(callbackQuery.id);
      } else if (data === 'use_previous_description') {
        await this.handleUsePreviousDescriptionCallback(chatId, user);
        await this.answerCallbackQuery(callbackQuery.id);
      } else if (data === 'create_ticket') {
        await this.handleCreateTicketCallback(chatId, user);
      } else if (data === 'statistics') {
        this.pushNavigationHistory(chatId, 'statistics');
        await this.handleStatisticsCallback(chatId, user);
      } else if (data === 'check_tokens') {
        await this.handleCheckTokensCallback(chatId, user);
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
          this.userSessions.delete(chatId);
          await this.sendMessage(chatId, 'Супер! Якщо ще щось знадобиться — пиши 😊', {
            reply_markup: { inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]] }
          });
        }
        await this.answerCallbackQuery(callbackQuery.id);
      } else if (data === 'tip_not_helped') {
        const session = this.userSessions.get(chatId);
        if (session && session.step === 'awaiting_tip_feedback') {
          session.step = 'gathering_information';
          session.afterTipNotHelped = true; // не показувати ще одну «підказку», одразу збір інформації / форма тікета
          const msg = 'Підказка не допомогла, потрібен тікет';
          await this.handleMessageInAiMode(chatId, msg, session, user);
        }
        await this.answerCallbackQuery(callbackQuery.id);
      } else if (data === 'back') {
        await this.handleBackNavigation(chatId, user);
      } else if (data === 'back_to_menu') {
        this.clearNavigationHistory(chatId);
        await this.showUserDashboard(chatId, user);
      } else if (data === 'back_to_tickets') {
        this.popNavigationHistory(chatId);
        await this.handleMyTicketsCallback(chatId, user);
      } else if (data.startsWith('rate_ticket_')) {
        const parts = data.split('_');
        const ticketId = parts[2];
        const rating = parseInt(parts[3], 10);
        await this.handleRateTicketCallback(chatId, user, ticketId, rating);
        await this.answerCallbackQuery(callbackQuery.id, 'Дякуємо за оцінку');
      } else if (data === 'attach_photo') {
        await this.handleAttachPhotoCallback(chatId, user);
        await this.answerCallbackQuery(callbackQuery.id);
      } else if (data === 'attach_document') {
        await this.handleAttachDocumentCallback(chatId, user);
        await this.answerCallbackQuery(callbackQuery.id);
      } else if (data === 'skip_photo') {
        await this.handleSkipPhotoCallback(chatId, user);
      } else if (data === 'add_more_photos') {
        await this.handleAddMorePhotosCallback(chatId, user);
      } else if (data === 'finish_ticket') {
        await this.handleFinishTicketCallback(chatId, user);
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
            documents: []
          };

          await this.sendMessage(chatId, 
            `✅ *Чудово! Створюю тікет.*\n\n` +
            `📸 *Останній крок:* Бажаєте додати фото до заявки?`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📷 Додати фото', callback_data: 'attach_photo' }],
                  [{ text: '⏭️ Пропустити', callback_data: 'skip_photo' }],
                  [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
                ]
              }
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
            photos: []
          };
          session.step = 'photo';
          
          await this.sendMessage(chatId, 
            `✅ *Добре, створюю тікет з наявною інформацією.*\n\n` +
            `📸 Бажаєте додати фото?`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📷 Додати фото', callback_data: 'attach_photo' }],
                  [{ text: '⏭️ Пропустити', callback_data: 'skip_photo' }]
                ]
              }
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
          await this.sendMessage(chatId,
            `✏️ *Добре, давайте уточнимо.*\n\n` +
            `Що саме потрібно виправити або доповнити?\n\n` +
            `_(Якщо нічого — напишіть «Нічого» або «Залишити як є»)_`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '⏭️ Нічого не змінювати', callback_data: 'edit_nothing_change' }],
                  [{ text: '❌ Скасувати', callback_data: 'cancel_info_gathering' }]
                ]
              },
              parse_mode: 'Markdown'
            }
          );
        }
        await this.answerCallbackQuery(callbackQuery.id);
      } else if (data === 'edit_nothing_change') {
        // Редагування: «нічого не змінювати» — повертаємо до екрану підтвердження тікета
        const session = this.userSessions.get(chatId);
        if (session && session.step === 'gathering_information' && session.editingFromConfirm && session.ticketDraft) {
          session.step = 'confirm_ticket';
          session.editingFromConfirm = false;
          const d = session.ticketDraft;
          const msg = `✅ *Перевірте, чи все правильно*\n\n📌 *Заголовок:*\n${d.title || '—'}\n\n📝 *Опис:*\n${d.description || '—'}\n\n📊 *Категорія:* ${d.subcategory || '—'}\n⚡ *Пріоритет:* ${d.priority || '—'}\n\nВсе правильно?`;
          await this.sendMessage(chatId, msg, {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
                [{ text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' }],
                [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
              ]
            },
            parse_mode: 'Markdown'
          });
        }
        await this.answerCallbackQuery(callbackQuery.id);
      } else if (data === 'cancel_info_gathering') {
        // Скасування збору інформації (AI або збір без AI)
        const session = this.userSessions.get(chatId);
        if (session && session.aiDialogId) {
          await this.completeAIDialog(session.aiDialogId, 'cancelled');
        }
        this.userSessions.delete(chatId);
        await this.sendMessage(chatId,
          `❌ Збір інформації скасовано.\n\n` +
          `Якщо потрібна допомога - просто напишіть мені! 😊`
        );
        await this.showUserDashboard(chatId, user);
        await this.answerCallbackQuery(callbackQuery.id);
      } else if (data === 'ai_continue') {
        // Додано: docs/AI_BOT_LOGIC.md — fallback: продовжити в AI-режимі
        const session = this.userSessions.get(chatId);
        if (session && session.mode === 'choosing') {
          session.mode = 'ai';
          session.ai_attempts = Math.max(0, (session.ai_attempts || 0) - 1);
          await this.sendMessage(chatId, 'Добре, продовжуємо. Опишіть ще раз або доповніть інформацію.', {
            reply_markup: { inline_keyboard: [[{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]] }
          });
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
          await this.sendMessage(chatId,
            `📝 *Створення тікета (покроково)*\n` +
            `📋 *Крок 1/4:* Введіть заголовок тікету\n` +
            `💡 Опишіть коротко суть проблеми`, {
              reply_markup: { inline_keyboard: [[{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]] }
            }
          );
        }
        await this.answerCallbackQuery(callbackQuery.id);
      } else if (data === 'cancel_ticket') {
        await this.handleCancelTicketCallback(chatId, user);
        await this.answerCallbackQuery(callbackQuery.id);
      } else if (data.startsWith('priority_')) {
        const priority = data.replace('priority_', '');
        await this.handlePriorityCallback(chatId, user, priority);
      } else if (data.startsWith('reply_ticket_')) {
        // Функція відповіді на тікет через Telegram вимкнена
        await this.sendMessage(chatId,
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
        await this.handleUserRegistrationCallback(chatId, userId);
       await this.answerCallbackQuery(callbackQuery.id);
        return;
      }

      if (data === 'login_user') {
        await this.handleUserLoginCallback(chatId, userId, callbackQuery);
        await this.answerCallbackQuery(callbackQuery.id);
        return;
      }

      if (data === 'cancel_login') {
        this.userSessions.delete(chatId);
        await this.sendMessage(chatId, 
          `❌ *Авторизацію скасовано*\n\n` +
          `Ви можете спробувати авторизуватися пізніше.`
        );
        await this.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // Обробка callback-запитів для реєстрації (вибір міста, посади та закладу)
      if (data.startsWith('city_') || data.startsWith('position_') || data.startsWith('institution_') || data === 'skip_institution') {
        logger.info('Виявлено callback для реєстрації:', { userId, data });
        await this.handleRegistrationCallback(chatId, userId, data);
        await this.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // Якщо користувач не зареєстрований і це не callback для реєстрації/авторизації
      await this.answerCallbackQuery(callbackQuery.id, 'Ви не авторизовані. Використайте /start для реєстрації або авторизації.');
    } catch (error) {
      logger.error('Помилка обробки callback query:', error);
      await this.answerCallbackQuery(callbackQuery.id, 'Виникла помилка');
    }
  }

  async handlePriorityCallback(chatId, user, priority) {
    const session = this.userSessions.get(chatId);
    if (!session || session.step !== 'priority') {return;}

    session.ticketData.priority = priority;
    await this.completeTicketCreation(chatId, user, session);
  }

  


  async handleMyTicketsCallback(chatId, user) {
    try {
      const tickets = await Ticket.find({ createdBy: user._id })
        .sort({ createdAt: -1 })
        .limit(10);

      if (tickets.length === 0) {
        await this.sendMessage(chatId, 
          `📋 *Мої тікети*\n` +
          `📄 У вас поки що немає тікетів\n` +
          `💡 Створіть новий тікет для отримання допомоги`, {
          reply_markup: {
            inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]]
          }
        });
        return;
      }

      let text = `📋 *Ваші тікети*\n`;
      
      const keyboard = [];

      // Групуємо кнопки по 2 в рядок
      const ticketButtons = [];
      tickets.forEach((ticket, index) => {
        const emoji = this.getStatusEmoji(ticket.status);
        const statusText = this.getStatusText(ticket.status);
        const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const title = this.truncateButtonText(ticket.title, 50);
        text += `\n${index + 1}. ${emoji} *${title}* — ${statusText}, \`${date}\``;
        ticketButtons.push({ text: '🔎 Деталі', callback_data: `view_ticket_${ticket._id}` });
      });
      
      // Розбиваємо кнопки на рядки по 2
      for (let i = 0; i < ticketButtons.length; i += 2) {
        keyboard.push(ticketButtons.slice(i, i + 2));
      }
      
      keyboard.push([{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]);

      await this.sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (error) {
      logger.error('Помилка отримання тікетів:', error);
        await this.sendMessage(chatId, 
        `❌ *Помилка завантаження тікетів*\n` +
        `Не вдалося завантажити список тікетів\n` +
        `🔄 Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  async handleTicketHistoryCallback(chatId, user) {
    try {
      // Отримуємо всі тікети користувача, відсортовані за датою створення
      const tickets = await Ticket.find({ createdBy: user._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      if (tickets.length === 0) {
        await this.sendMessage(chatId, 
          `📜 *Історія тікетів*\n` +
          `📄 У вас поки що немає тікетів\n` +
          `💡 Створіть новий тікет для отримання допомоги`, {
          reply_markup: {
            inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]]
          }
        });
        return;
      }

      let text = 
        `📜 *Історія тікетів*\n` +
        `📋 Показано ${tickets.length} тікетів\n`;
      
      const keyboard = [];

      tickets.forEach((ticket, index) => {
        const status = this.getStatusEmoji(ticket.status);
        const statusText = this.getStatusText(ticket.status);
        const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
        
        text += `\n${index + 1}. ${status} *${ticket.title}*\n` +
          `   📊 ${statusText} | 📅 ${date}`;
        
        // Кнопка для повторного створення тікету
        keyboard.push({
          text: this.truncateButtonText(`🔄 Повторити: ${ticket.title}`, 50),
          callback_data: `recreate_ticket_${ticket._id}`
        });
      });

      text += `\n\n💡 Натисніть кнопку, щоб створити новий тікет на основі попереднього`;
      
      // Розбиваємо кнопки на рядки по 2
      const historyKeyboard = [];
      for (let i = 0; i < keyboard.length; i += 2) {
        historyKeyboard.push(keyboard.slice(i, i + 2));
      }
      historyKeyboard.push([{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]);

      await this.sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: historyKeyboard },
        parse_mode: 'Markdown'
      });
    } catch (error) {
      logger.error('Помилка отримання історії тікетів:', error);
      await this.sendMessage(chatId, 
        `❌ *Помилка завантаження історії*\n` +
        `Не вдалося завантажити історію тікетів\n` +
        `🔄 Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  async handleRecreateTicketCallback(chatId, user, ticketId) {
    try {
      // Знаходимо оригінальний тікет
      const originalTicket = await Ticket.findById(ticketId)
        .lean();

      if (!originalTicket) {
        await this.sendMessage(chatId,
          `❌ *Тікет не знайдено*\n\n` +
          `Оригінальний тікет не знайдено в системі.`
        );
        return;
      }

      // Перевіряємо, чи тікет належить користувачу
      if (String(originalTicket.createdBy) !== String(user._id)) {
        await this.sendMessage(chatId,
          `❌ *Доступ заборонено*\n\n` +
          `Цей тікет не належить вам.`
        );
        return;
      }

      // Створюємо сесію для нового тікету на основі попереднього
      const session = {
        step: 'title',
        ticketData: {
          title: originalTicket.title,
          description: originalTicket.description || '',
          priority: originalTicket.priority || 'medium',
          photos: [],
          isRecreated: true,
          originalTicketId: ticketId
        }
      };
      
      this.userSessions.set(chatId, session);

      // Показуємо форму з заповненими даними
      const message = 
        `🔄 *Повторне створення тікету*\n` +
        `📋 *Заголовок:* \`${originalTicket.title}\`\n` +
        `📝 *Опис:* \`${originalTicket.description || 'Без опису'}\`\n` +
        `\n✏️ Ви можете змінити заголовок або описати нову проблему\n` +
        `📋 *Крок 1/3:* Введіть заголовок тікету\n` +
        `💡 Опишіть коротко суть проблеми`;

      await this.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Використати попередній заголовок', callback_data: 'use_previous_title' },
              { text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }
            ]
          ]
        },
        parse_mode: 'Markdown'
      });
    } catch (error) {
      logger.error('Помилка повторного створення тікету:', error);
        await this.sendMessage(chatId,
          `❌ *Помилка*\n` +
          `Не вдалося завантажити дані тікету\n` +
          `🔄 Спробуйте ще раз`
        );
    }
  }

  async handleViewTicketCallback(chatId, user, ticketId) {
    try {
      const Comment = require('../models/Comment');
      const ticket = await Ticket.findById(ticketId)
        .populate('city', 'name')
        .populate('createdBy', 'firstName lastName')
        .lean();

      if (!ticket) {
        await this.sendMessage(chatId,
          `❌ *Тікет не знайдено*\n\n` +
          `Оригінальний тікет не знайдено в системі.`
        );
        return;
      }

      if (String(ticket.createdBy._id || ticket.createdBy) !== String(user._id)) {
        await this.sendMessage(chatId,
          `❌ *Доступ заборонено*\n\n` +
          `Цей тікет не належить вам.`
        );
        return;
      }

      // Отримуємо коментарі до тікету
      const comments = await Comment.find({ 
        ticket: ticketId, 
        isDeleted: false,
        isInternal: false 
      })
        .populate('author', 'firstName lastName role')
        .sort({ createdAt: 1 })
        .limit(20)
        .lean();

      const statusEmoji = this.getStatusEmoji(ticket.status);
      const statusText = this.getStatusText(ticket.status);
      const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const priorityText = this.getPriorityText(ticket.priority);
      const ticketNumber = ticket.ticketNumber || ticket._id.toString().substring(0, 8);

      let message =
        `🎫 *Деталі тікету*\n` +
        `📋 ${ticket.title}\n` +
        `📊 ${statusEmoji} ${statusText} | ⚡ ${priorityText}\n` +
        `🏙️ ${ticket.city?.name || 'Не вказано'} | 📅 \`${date}\`\n` +
        `🆔 \`${ticketNumber}\`\n\n` +
        `📝 *Опис:*\n${ticket.description}\n\n`;

      // Додаємо коментарі
      if (comments.length > 0) {
        message += `💬 *Коментарі (${comments.length}):*\n\n`;
        comments.forEach((comment, index) => {
          const commentAuthor = comment.author;
          const authorName = commentAuthor?.firstName && commentAuthor?.lastName
            ? `${commentAuthor.firstName} ${commentAuthor.lastName}`
            : 'Користувач';
          const isAdmin = commentAuthor?.role === 'admin' || commentAuthor?.role === 'manager';
          const roleLabel = isAdmin ? '👨‍💼 Адмін' : '👤 Користувач';
          const commentDate = new Date(comment.createdAt).toLocaleString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          
          message += `${index + 1}. ${roleLabel} *${authorName}* (\`${commentDate}\`):\n`;
          message += `${comment.content}\n\n`;
        });
      } else {
        message += `💬 *Коментарі:*\nПоки що немає коментарів.\n\n`;
      }

      message += `💡 *Коментарі:*\nВикористовуйте веб-панель для додавання коментарів до тікету.`;

      // Визначаємо, звідки прийшов користувач для кнопки "Назад"
      const history = this.getNavigationHistory(chatId);
      const backButtons = [];
      
      if (history.length > 1 && (history[history.length - 2] === 'my_tickets' || history[history.length - 2] === 'ticket_history')) {
        // Якщо прийшов зі списку тікетів, додаємо кнопку "Назад до списку"
        backButtons.push({ text: '⬅️ Назад до списку', callback_data: 'back' });
      }
      
      backButtons.push({ text: '🏠 Головне меню', callback_data: 'back_to_menu' });

      await this.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: this.truncateButtonText(`🔄 Повторити: ${ticket.title}`, 50), callback_data: `recreate_ticket_${ticket._id}` },
              { text: '💬 Відповісти', callback_data: `reply_ticket_${ticket._id}` }
            ],
            backButtons
          ]
        },
        parse_mode: 'Markdown'
      });
    } catch (error) {
      logger.error('Помилка перегляду деталей тікету:', error);
      await this.sendMessage(chatId,
        `❌ *Помилка завантаження деталей*\n` +
        `Не вдалося завантажити дані тікету`
      );
    }
  }

  async sendQualityRatingRequest(ticket) {
    try {
      // Визначаємо джерело створення тікету
      const ticketSource = ticket.metadata?.source || 'web';
      const user = await User.findById(ticket.createdBy).select('telegramId firstName lastName email');
      
      if (!user) {
        logger.warn('Користувача не знайдено для відправки запиту на оцінку');
        return;
      }

      const emoji = this.getStatusEmoji(ticket.status);
      const statusText = this.getStatusText(ticket.status);
      const title = this.truncateButtonText(ticket.title, 60);

      if (ticketSource === 'telegram') {
        // Тікет створено з Telegram - відправляємо запит на оцінку в Telegram
        if (!user.telegramId) {
          logger.warn('У користувача немає telegramId для відправки запиту на оцінку');
          return;
        }

        const message =
          `📊 *Оцініть якість вирішення*\n` +
          `📋 ${title}\n` +
          `📊 ${emoji} ${statusText}\n` +
          `Оберіть оцінку від 1 до 5:`;

        const keyboard = [
          [
            { text: '⭐ 1', callback_data: `rate_ticket_${ticket._id}_1` },
            { text: '⭐⭐ 2', callback_data: `rate_ticket_${ticket._id}_2` },
            { text: '⭐⭐⭐ 3', callback_data: `rate_ticket_${ticket._id}_3` }
          ],
          [
            { text: '⭐⭐⭐⭐ 4', callback_data: `rate_ticket_${ticket._id}_4` },
            { text: '⭐⭐⭐⭐⭐ 5', callback_data: `rate_ticket_${ticket._id}_5` }
          ],
          [{ text: '🏠 Головне меню', callback_data: 'back' }]
        ];

        await this.sendMessage(String(user.telegramId), message, {
          reply_markup: { inline_keyboard: keyboard },
          parse_mode: 'Markdown'
        });
        logger.info('✅ Запит на оцінку відправлено в Telegram користувачу');
      } else if (ticketSource === 'mobile') {
        // Тікет створено з мобільного додатку - відправляємо FCM сповіщення
        try {
          const fcmService = require('./fcmService');
          await fcmService.sendToUser(user._id.toString(), {
            title: '📊 Оцініть якість вирішення',
            body: `Будь ласка, оцініть якість вирішення тікету "${title}"`,
            type: 'ticket_rating_request',
            data: {
              ticketId: ticket._id.toString(),
              ticketTitle: ticket.title,
              ticketStatus: ticket.status
            }
          });
          logger.info('✅ Запит на оцінку відправлено через FCM користувачу (mobile)');
        } catch (error) {
          logger.error('❌ Помилка відправки FCM запиту на оцінку:', error);
        }
      } else {
        // Тікет створено з веб-інтерфейсу - відправляємо через WebSocket та FCM (якщо є пристрій)
        // Спочатку відправляємо через WebSocket для веб-інтерфейсу
        try {
          const ticketWebSocketService = require('./ticketWebSocketService');
          ticketWebSocketService.notifyRatingRequest(user._id.toString(), {
            _id: ticket._id,
            title: ticket.title,
            status: ticket.status
          });
          logger.info('✅ Запит на оцінку відправлено через WebSocket користувачу (web)');
        } catch (wsError) {
          logger.warn('⚠️ Не вдалося відправити WebSocket запит на оцінку:', wsError);
        }
        
        // Також спробуємо FCM, якщо є активний пристрій
        try {
          const fcmService = require('./fcmService');
          await fcmService.sendToUser(user._id.toString(), {
            title: '📊 Оцініть якість вирішення',
            body: `Будь ласка, оцініть якість вирішення тікету "${title}"`,
            type: 'ticket_rating_request',
            data: {
              ticketId: ticket._id.toString(),
              ticketTitle: ticket.title,
              ticketStatus: ticket.status
            }
          });
          logger.info('✅ Запит на оцінку відправлено через FCM користувачу (web)');
        } catch (error) {
          logger.warn('⚠️ Не вдалося відправити FCM запит на оцінку:', error);
          // Якщо FCM не вдалося, відправляємо в Telegram (якщо користувач має telegramId)
          if (user.telegramId) {
            const message =
              `📊 *Оцініть якість вирішення*\n` +
              `📋 ${title}\n` +
              `📊 ${emoji} ${statusText}\n` +
              `Оберіть оцінку від 1 до 5:`;

            const keyboard = [
              [
                { text: '⭐ 1', callback_data: `rate_ticket_${ticket._id}_1` },
                { text: '⭐⭐ 2', callback_data: `rate_ticket_${ticket._id}_2` },
                { text: '⭐⭐⭐ 3', callback_data: `rate_ticket_${ticket._id}_3` }
              ],
              [
                { text: '⭐⭐⭐⭐ 4', callback_data: `rate_ticket_${ticket._id}_4` },
                { text: '⭐⭐⭐⭐⭐ 5', callback_data: `rate_ticket_${ticket._id}_5` }
              ],
              [{ text: '🏠 Головне меню', callback_data: 'back' }]
            ];

            await this.sendMessage(String(user.telegramId), message, {
              reply_markup: { inline_keyboard: keyboard },
              parse_mode: 'Markdown'
            });
            logger.info('✅ Запит на оцінку відправлено в Telegram користувачу (web fallback)');
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
        await this.sendMessage(chatId, `❌ *Тікет не знайдено*`);
        return;
      }

      if (String(ticket.createdBy) !== String(user._id)) {
        await this.sendMessage(chatId, `❌ *Доступ заборонено*`);
        return;
      }

      ticket.qualityRating.hasRating = true;
      ticket.qualityRating.rating = Math.max(1, Math.min(5, parseInt(rating, 10) || 0));
      ticket.qualityRating.ratedAt = new Date();
      ticket.qualityRating.ratedBy = user._id;
      await ticket.save();

      await this.sendMessage(chatId, `✅ *Дякуємо за оцінку!*`);
    } catch (error) {
      logger.error('Помилка обробки оцінки якості:', error);
      await this.sendMessage(chatId, `❌ *Помилка збереження оцінки*`);
    }
  }

  async handleUsePreviousTitleCallback(chatId, _user) {
    try {
      const session = this.userSessions.get(chatId);
      if (!session || !session.ticketData || !session.ticketData.title) {
        await this.sendMessage(chatId,
          `❌ *Помилка*\n` +
          `Не вдалося знайти попередній заголовок\n` +
          `🔄 Спробуйте ввести заголовок вручну`
        );
        return;
      }

      // Використовуємо попередній заголовок і переходимо до опису
      session.step = 'description';
      
      await this.sendMessage(chatId,
        `✅ *Заголовок використано*\n` +
        `📋 ${session.ticketData.title}\n` +
        `\n📝 *Крок 2/4:* Введіть опис проблеми\n` +
        `💡 Опишіть детально вашу проблему`, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Використати попередній опис', callback_data: 'use_previous_description' },
                { text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }
              ]
            ]
          },
          parse_mode: 'Markdown'
        }
      );
    } catch (error) {
      logger.error('Помилка використання попереднього заголовку:', error);
      await this.sendMessage(chatId,
        `❌ *Помилка*\n` +
        `Не вдалося використати попередній заголовок\n` +
        `🔄 Спробуйте ввести заголовок вручну`
      );
    }
  }

  async handleUsePreviousDescriptionCallback(chatId, _user) {
    try {
      const session = this.userSessions.get(chatId);
      if (!session || !session.ticketData || !session.ticketData.description) {
        await this.sendMessage(chatId,
          `❌ *Помилка*\n` +
          `Не вдалося знайти попередній опис\n` +
          `🔄 Спробуйте ввести опис вручну`
        );
        return;
      }

      // Використовуємо попередній опис і переходимо до фото
      // session.ticketData.description вже містить опис з попереднього тікету
      
      // Переходимо до фото
      session.step = 'photo';
      
      await this.sendMessage(chatId,
        `✅ *Опис використано*\n` +
        `📝 ${session.ticketData.description.substring(0, 100)}${session.ticketData.description.length > 100 ? '...' : ''}\n` +
        `\n📸 *Крок 3/4:* Бажаєте додати фото до заявки?`, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📷 Додати фото', callback_data: 'attach_photo' },
                { text: '⏭️ Пропустити', callback_data: 'skip_photo' }
              ],
              [
                { text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }
              ]
            ]
          },
          parse_mode: 'Markdown'
        }
      );
    } catch (error) {
      logger.error('Помилка використання попереднього опису:', error);
      await this.sendMessage(chatId,
        `❌ *Помилка*\n` +
        `Не вдалося використати попередній опис\n` +
        `🔄 Спробуйте ввести опис вручну`
      );
    }
  }

  /**
   * Старт створення тікета: перевірка AISettings → AI-режим за замовчуванням або класичний флоу.
   * Додано: docs/AI_BOT_LOGIC.md — перевірка AISettings, mode ai/classic, userContext.
   */
  async handleCreateTicketCallback(chatId, user) {
    const fullUser = await User.findById(user._id).populate('position', 'title name').populate('city', 'name region').populate('institution', 'name').lean();
    const profile = fullUser || user;

    const aiSettings = await aiFirstLineService.getAISettings();
    const aiEnabled = aiSettings && aiSettings.enabled === true;
    const hasApiKey = aiSettings && (
      (aiSettings.provider === 'openai' && aiSettings.openaiApiKey && String(aiSettings.openaiApiKey).trim()) ||
      (aiSettings.provider === 'gemini' && aiSettings.geminiApiKey && String(aiSettings.geminiApiKey).trim())
    );

    if (aiEnabled && hasApiKey) {
      // AI-режим за замовчуванням
      const userContext = {
        userCity: profile.city?.name || 'Не вказано',
        userPosition: profile.position?.title || profile.position?.name || 'Не вказано',
        userInstitution: profile.institution?.name || '',
        userName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email,
        userEmail: profile.email
      };
      const session = {
        mode: 'ai',
        step: 'gathering_information',
        ai_attempts: 0,
        ai_questions_count: 0,
        dialog_history: [],
        userContext,
        ticketData: { createdBy: user._id, photos: [], documents: [] },
        ticketDraft: null
      };
      this.userSessions.set(chatId, session);
      await this.sendMessage(chatId,
        `📝 *Створення тікета*\n\n` +
        `Опишіть проблему своїми словами. Я постараюся швидко зібрати все необхідне.\n\n` +
        `*Приклади:*\n` +
        `• Принтер не друкує\n` +
        `• Не працює телефон у закладі\n` +
        `• Syrve не відкривається`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
            ]
          },
          parse_mode: 'Markdown'
        }
      );
      return;
    }

    // Класичний покроковий флоу (як раніше)
    const session = {
      mode: 'classic',
      step: 'title',
      ticketData: {
        createdBy: user._id,
        photos: [],
        documents: []
      }
    };
    this.userSessions.set(chatId, session);
    await this.sendMessage(chatId,
      `📝 *Створення нового тікету*\n` +
      `📋 *Крок 1/4:* Введіть заголовок тікету\n` +
      `💡 Опишіть коротко суть проблеми`, {
        reply_markup: {
          inline_keyboard: [[{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]]
        }
      }
    );
  }

  /** Додано: docs/AI_BOT_LOGIC.md — обробка повідомлень в AI-режимі (виклики 1–3, fallback). */
  async handleMessageInAiMode(chatId, text, session, user) {
    const CONFIDENCE_THRESHOLD = 0.6;
    const MAX_AI_QUESTIONS = 4;
    const MAX_AI_ATTEMPTS = 2;

    // Редагування з підтвердження: якщо користувач відповів «нічого» / «залишити як є» — повертаємо до екрану підтвердження
    if (session.step === 'gathering_information' && session.editingFromConfirm && session.ticketDraft) {
      const t = (text || '').toLowerCase().trim();
      const nothingToChange = /^(нічого|ничого|nothing|ні|нi|пропустити|залишити як є|залишити|все ок|все добре|ок|окей|добре|норм|нормально)$/.test(t) || t === 'нч' || t === 'нчого';
      if (nothingToChange) {
        session.step = 'confirm_ticket';
        session.editingFromConfirm = false;
        const d = session.ticketDraft;
        await this.sendTyping(chatId);
        const msg = `✅ *Перевірте, чи все правильно*\n\n📌 *Заголовок:*\n${d.title || '—'}\n\n📝 *Опис:*\n${d.description || '—'}\n\n📊 *Категорія:* ${d.subcategory || '—'}\n⚡ *Пріоритет:* ${d.priority || '—'}\n\nВсе правильно?`;
        await this.sendMessage(chatId, msg, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
              [{ text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' }],
              [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
            ]
          },
          parse_mode: 'Markdown'
        });
        return;
      }
      // Користувач надіслав уточнення/виправлення — додаємо до діалогу та перераховуємо підсумок тікета
      if (!session.dialog_history) session.dialog_history = [];
      session.dialog_history.push({ role: 'user', content: text });
      botConversationService.appendMessage(chatId, user, 'user', text, null, (session.dialog_history.length === 1 ? text : '').slice(0, 200)).catch(() => {});
      session.editingFromConfirm = false;
      await this.sendTyping(chatId);
      let summaryAfterEdit;
      try {
        summaryAfterEdit = await aiFirstLineService.getTicketSummary(session.dialog_history, session.userContext);
      } catch (err) {
        logger.error('AI: getTicketSummary після редагування', err);
      }
      if (summaryAfterEdit) {
        session.step = 'confirm_ticket';
        session.ticketDraft = {
          ...session.ticketDraft,
          title: summaryAfterEdit.title,
          description: summaryAfterEdit.description,
          priority: summaryAfterEdit.priority,
          subcategory: summaryAfterEdit.category,
          type: session.ticketDraft.type || 'problem'
        };
        const d = session.ticketDraft;
        const msg = `✅ *Перевірте, чи все правильно*\n\n📌 *Заголовок:*\n${d.title || '—'}\n\n📝 *Опис:*\n${d.description || '—'}\n\n📊 *Категорія:* ${d.subcategory || '—'}\n⚡ *Пріоритет:* ${d.priority || '—'}\n\nВсе правильно?`;
        await this.sendMessage(chatId, msg, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
              [{ text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' }],
              [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
            ]
          },
          parse_mode: 'Markdown'
        });
        return;
      }
      await this.sendMessage(chatId, 'Не вдалося оновити заявку за цим текстом. Спробуйте ще раз або натисніть «Так, створити тікет» з попереднього кроку.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
            [{ text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' }],
            [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
          ]
        }
      });
      return;
    }

    if (!session.dialog_history) session.dialog_history = [];
    session.dialog_history.push({ role: 'user', content: text });
    botConversationService.appendMessage(chatId, user, 'user', text, null, (session.dialog_history.length === 1 ? text : '').slice(0, 200)).catch(() => {});

    // Якщо очікуємо відповідь на підказку — або "допомогло", або "ні/створити тікет", або текст як уточнення проблеми (продовжити збір)
    if (session.step === 'awaiting_tip_feedback') {
      const t = (text || '').toLowerCase().trim();
      const helped = /^(так|да|допомогло|ок|окей|все добре|все ок|супер|дякую)$/.test(t);
      const notHelped = /^(ні|нi|не допомогло|не вийшло|створити тікет|потрібен тікет|оформити заявку)$/.test(t) || t.includes('не допомогло') || t.includes('не вийшло');
      if (helped) {
        session.step = null;
        this.userSessions.delete(chatId);
        await this.sendMessage(chatId, 'Супер! Якщо ще щось знадобиться — пишіть 😊', {
          reply_markup: { inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]] }
        });
        return;
      }
      if (notHelped) {
        session.step = 'gathering_information';
        session.afterTipNotHelped = true;
        await this.sendTyping(chatId);
        let resultAfterTip;
        try {
          resultAfterTip = await aiFirstLineService.analyzeIntent(session.dialog_history, session.userContext);
        } catch (err) {
          resultAfterTip = { isTicketIntent: true, needsMoreInfo: true, missingInfo: ['деталі проблеми'], confidence: 0.7, quickSolution: null };
        }
        session.dialog_history.push({ role: 'assistant', content: 'Добре, тоді зберемо деталі для тікета.' });
        botConversationService.appendMessage(chatId, user, 'assistant', 'Добре, тоді зберемо деталі для тікета.').catch(() => {});
        session.ai_questions_count = (session.ai_questions_count || 0) + 1;
        let question;
        try {
          question = await aiFirstLineService.generateNextQuestion(session.dialog_history, resultAfterTip.missingInfo || [], session.userContext);
        } catch (_) {
          question = 'Опишіть, будь ласка, що саме відбувається (модель принтера, текст помилки тощо).';
        }
        session.dialog_history.push({ role: 'assistant', content: question });
        botConversationService.appendMessage(chatId, user, 'assistant', question).catch(() => {});
        await this.sendMessage(chatId, question, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' }],
              [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
            ]
          }
        });
        return;
      }
      // Текст схожий на уточнення проблеми (наприклад "Не телефонує", "Не друкує") — продовжуємо збір інформації, не вимагаємо кнопку
      session.step = 'gathering_information';
      // не return — далі виконається analyzeIntent по всьому діалогу (вже з новим повідомленням)
    }

    await this.sendTyping(chatId);
    // Завжди шукаємо підказку в інтернеті для технічної проблеми; якщо не допоможе — далі збір інформації та тікет
    const searchQuery = (text || '').trim() ? `${String(text).trim()} як виправити troubleshooting` : '';
    const webSearchContext = searchQuery ? await this.fetchTroubleshootingSnippet(searchQuery) : '';
    let result;
    try {
      result = await aiFirstLineService.analyzeIntent(session.dialog_history, session.userContext, webSearchContext);
    } catch (err) {
      logger.error('AI: помилка analyzeIntent', err);
      await this.sendMessage(chatId, 'Зараз не можу обробити. Спробуйте ще раз або натисніть «Заповнити по-старому».', {
        reply_markup: { inline_keyboard: [[{ text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' }], [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]] }
      });
      return;
    }

    if (result.confidence < CONFIDENCE_THRESHOLD) {
      session.ai_attempts = (session.ai_attempts || 0) + 1;
    }

    // 1) Якщо це не намір тікета — обробляємо оффтоп і виходимо
    if (!result.isTicketIntent) {
      const telegramId = String(user?.telegramId ?? user?.telegramChatId ?? chatId);
      const textLower = (text || '').toLowerCase().trim();
      const isExchangeRateRequest = textLower.includes('курс') || textLower.includes('долар') || textLower.includes('євро') || textLower.includes('валюта') || textLower.includes('usd');
      const isWeatherRequest = textLower.includes('погода');
      const userCity = session.userContext && session.userContext.userCity ? String(session.userContext.userCity).trim() : '';

      if (isExchangeRateRequest) {
        if (!this.canMakeInternetRequest(telegramId)) {
          await this.sendMessage(chatId,
            `Запити інформації з інтернету (курс, погода) для вас недоступні.\n\nЯкщо є технічна проблема — опишіть її, і я допоможу оформити заявку.`, {
              reply_markup: { inline_keyboard: [[{ text: 'Створити тікет', callback_data: 'create_ticket' }], [{ text: 'Головне меню', callback_data: 'back_to_menu' }]] }
            }
          );
          this.userSessions.delete(chatId);
          return;
        }
        await this.sendTyping(chatId);
        const nbu = await this.fetchNbuUsdRate();
        if (nbu) {
          this.recordInternetRequest(telegramId);
          const rateText = nbu.date ? `Курс USD за ${nbu.date}` : 'Курс USD (НБУ)';
          await this.sendMessage(chatId,
            `💵 *${rateText}:* ${nbu.rate.toFixed(2)} грн\n\nЯкщо потрібна допомога з тікетом — пиши.`, {
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard: [[{ text: 'Створити тікет', callback_data: 'create_ticket' }], [{ text: 'Головне меню', callback_data: 'back_to_menu' }]] }
            }
          );
        } else {
          const msg = result.offTopicResponse && String(result.offTopicResponse).trim() ? String(result.offTopicResponse).trim().slice(0, 500) : 'Зараз не вдалося отримати курс. Спробуй пізніше або напиши, якщо є технічна проблема — допоможу з тікетом.';
          await this.sendMessage(chatId, msg, {
            reply_markup: { inline_keyboard: [[{ text: 'Створити тікет', callback_data: 'create_ticket' }], [{ text: 'Головне меню', callback_data: 'back_to_menu' }]] }
          });
        }
        this.userSessions.delete(chatId);
        return;
      }

      if (isWeatherRequest) {
        if (!userCity || userCity.toLowerCase() === 'не вказано') {
          await this.sendMessage(chatId,
            'Не знаю ваше місто. Вкажіть місто в профілі — тоді зможу показати погоду для вас.\n\nЯкщо є технічна проблема — опишіть її, допоможу з тікетом.', {
              reply_markup: { inline_keyboard: [[{ text: 'Створити тікет', callback_data: 'create_ticket' }], [{ text: 'Головне меню', callback_data: 'back_to_menu' }]] }
            }
          );
          this.userSessions.delete(chatId);
          return;
        }
        if (!this.canMakeInternetRequest(telegramId)) {
          await this.sendMessage(chatId,
            `Запити інформації з інтернету (курс, погода) для вас недоступні.\n\nЯкщо є технічна проблема — опишіть її, і я допоможу оформити заявку.`, {
              reply_markup: { inline_keyboard: [[{ text: 'Створити тікет', callback_data: 'create_ticket' }], [{ text: 'Головне меню', callback_data: 'back_to_menu' }]] }
            }
          );
          this.userSessions.delete(chatId);
          return;
        }
        await this.sendTyping(chatId);
        const weather = await this.fetchWeatherForCity(userCity);
        if (weather) {
          this.recordInternetRequest(telegramId);
          await this.sendMessage(chatId,
            `🌤 *Погода в ${weather.city}:* ${weather.description}, ${Math.round(weather.temp)}°C\n\nЯкщо потрібна допомога з тікетом — пиши.`, {
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard: [[{ text: 'Створити тікет', callback_data: 'create_ticket' }], [{ text: 'Головне меню', callback_data: 'back_to_menu' }]] }
            }
          );
        } else {
          const msg = result.offTopicResponse && String(result.offTopicResponse).trim() ? String(result.offTopicResponse).trim().slice(0, 500) : `Зараз не вдалося отримати погоду для ${userCity}. Спробуй пізніше або напиши, якщо є технічна проблема — допоможу з тікетом.`;
          await this.sendMessage(chatId, msg, {
            reply_markup: { inline_keyboard: [[{ text: 'Створити тікет', callback_data: 'create_ticket' }], [{ text: 'Головне меню', callback_data: 'back_to_menu' }]] }
          });
        }
        this.userSessions.delete(chatId);
        return;
      }

      // Рандомні (будь-які інші оффтоп) питання теж рахуються як запити з інтернету — ліміт 5/день
      if (!this.canMakeInternetRequest(telegramId)) {
        await this.sendMessage(chatId,
          `Запити інформації з інтернету (курс, погода) для вас недоступні.\n\nЯкщо є технічна проблема — опишіть її, і я допоможу оформити заявку.`, {
            reply_markup: { inline_keyboard: [[{ text: 'Створити тікет', callback_data: 'create_ticket' }], [{ text: 'Головне меню', callback_data: 'back_to_menu' }]] }
          }
        );
        this.userSessions.delete(chatId);
        return;
      }
      this.recordInternetRequest(telegramId);
      const msg =
        result.offTopicResponse && String(result.offTopicResponse).trim()
          ? String(result.offTopicResponse).trim().slice(0, 500)
          : (() => {
              const fallbackOffTopic = [
                'Здається, це не про технічну проблему. Якщо щось зламалось або не працює — просто опишіть, і я допоможу оформити заявку.',
                'Поки не зовсім зрозуміло, що потрібно. Якщо є проблема з обладнанням або програмою — напишіть кількома словами, і ми зберемо тікет.',
                'Я тут головним чином про заявки на допомогу. Опишіть проблему своїми словами — і далі я підкажу.',
                'Схоже на загальне питання. Якщо потрібна допомога з принтером, iiko, касою — просто скажіть, що саме не так.',
                'Я готовий допомогти з заявками. Якщо є конкретна технічна проблема — напишіть, що саме сталося.',
                'Це більше про розмову, ніж про проблему :) Якщо щось не працює — напишіть, і я одразу візьмуся за заявку.',
                'Схоже, це не те, з чим я допомагаю через тікети. Якщо є щось, що потребує ІТ-допомоги — пишіть, не соромтеся.',
                'Я тут для технічних заявок. Якщо раптом щось зламалося — просто скажіть, що саме, і я все оформлю швидко.',
                'Не дуже зрозуміло, чи це проблема для тікета. Якщо щось не функціонує — розкажіть деталі, і ми розберемося.',
                'Це не схоже на типову заявку. Але якщо техніка підвела — напишіть, що відбувається, і я допоможу скласти тікет.',
                'Можливо, ви просто привіталися? :) Якщо є реальна проблема з обладнанням — опишіть, і я одразу почну.',
                'Поки що це не виглядає як заявка на допомогу. Але якщо щось не так з касою, принтером чи софтом — пишіть сміливо.',
                'Я розумію, що ви написали, але це не про поломку. Якщо все ж щось не працює — дайте знати, оформлю заявку.',
                'Схоже на оффтоп :) Якщо потрібна технічна допомога — просто опишіть проблему, і я візьмуся за тікет.',
                'Це більше схоже на чат. Якщо є технічна проблема (принтер, iiko, мережа тощо) — напишіть про неї, і я оформлю.',
                'Поки не бачу підстав для заявки. Але якщо щось потребує ремонту чи налаштування — пишіть, що саме не так.',
                'Можливо, це просто перевірка? Якщо є реальна неполадка — опишіть її кількома словами, і я все зроблю.',
                'Я тут для вирішення технічних питань через тікети. Якщо щось не так — напишіть, і ми швидко оформимо.',
                'Це не дуже пасує під заявку. Але якщо техніка підкачала — розкажіть деталі, я допоможу оформити.',
                'Схоже, ми трохи не туди пішли :) Якщо є проблема з обладнанням — просто скажіть, що саме, і вперед.',
                'Поки що не зрозуміло, чи потрібен тікет. Якщо щось не працює як треба — напишіть, і я візьмуся.',
                'Це не виглядає як типова проблема для тікета. Але якщо щось потребує уваги ІТ — пишіть без вагань.',
                'Можливо, ви хотіли просто поспілкуватися? Якщо ж є технічна неполадка — розкажіть, і я допоможу.',
                'Не бачу тут приводу для заявки. Але якщо принтер/каса/програма не слухається — напишіть, розберемося.',
                'Не впевнений, чи це привід створювати тікет. Але якщо щось глючить або не запускається — розкажіть, допоможу.',
                'Поки що це не про тікет. Якщо щось не так з технікою — просто опишіть ситуацію, і я все оформлю.',
                'Схоже на невеличкий оффтоп. Якщо потрібна допомога з обладнанням чи софтом — пишіть, що саме.',
                'Поки що не бачу тут технічної неполадки. Але якщо принтер/каса/програма глючить — опишіть, що саме, і оформимо тікет.',
                'Я спеціалізуюся на технічних заявках. Якщо раптом щось зламалося — опишіть, і я оформлю за хвилину.',
                'Давай так: якщо щось зламалось у закладі — опиши кількома словами, і я швидко створю тікет.',
                'Це не зовсім моя тема, але з технічними заявками допоможу. Напиши, що не працює.',
                'Ок, зрозумів. Якщо зʼявиться технічна проблема — просто напиши, оформимо заявку.',
                'Тут я допомагаю з тікетами на обладнання та софт. Опиши проблему — допоможу.',
                'Не те, що я вмію краще за все, але заявки на ремонт/налаштування — це до мене. Пиши.',
                'Якщо щось не працює (принтер, каса, iiko, мережа) — опиши, і я візьмуся за тікет.',
                'Це скоріше не для заявки. Але якщо є поломка чи помилка — розкажи, оформимо.',
                'Зрозуміло. Якщо знадобиться допомога з технікою — напиши кількома словами.',
                'Я тут для технічних заявок. Щось зламалось — опиши, що саме, і вперед.',
                'Не бачу тут технічної проблеми. Якщо щось не працює — напиши, розберемося.',
                'Схоже на загальну розмову. Якщо є проблема з обладнанням — пиши, допоможу оформити.',
                'Окей. Якщо зʼявиться щось, що потребує ІТ — просто скажи, що сталося.',
                'Це не дуже підходить під тікет. Але якщо техніка підвела — напиши деталі.',
                'Я допомагаю з заявками на техніку. Якщо щось не так — опиши ситуацію.',
                'Поки не зрозуміло, чи потрібна заявка. Якщо щось зламалось — напиши, оформимо.',
                'Не те, з чим я працюю щодня, але технічні тікети — це до мене. Пиши, якщо щось не так.',
                'Здається, це не про поломку. Якщо все ж є технічна проблема — дай знати.',
                'Я тут головним чином для заявок. Опиши проблему своїми словами — підкажу.',
                'Це виглядає не як заявка. Але якщо щось не працює — розкажи, що саме, допоможу.',
                'Якщо потрібна допомога з принтером, касою чи програмою — напиши, що не так.',
                'Не впевнений, що це для тікета. Але якщо є технічна неполадка — пиши.',
                'Ок, прийнято. Якщо щось зламається — опиши кількома словами, і я оформлю.',
                'Тут я для технічних заявок. Щось не працює — напиши, що саме сталося.',
                'Це не схоже на технічну проблему. Якщо щось зламалось — просто опиши.',
                'Я готовий допомогти з заявками. Є конкретна технічна проблема — напиши.',
                'Поки не зовсім те, з чим я допомагаю. Якщо є поломка чи помилка — пиши.',
                'Зрозуміло. Якщо зʼявиться технічна проблема — опиши її, і я візьмуся.',
                'Схоже, це не про обладнання. Але якщо щось не працює — напиши, оформимо тікет.',
                'Я тут для вирішення технічних питань. Щось не так — напиши, швидко оформимо.',
                'Не бачу тут заявки. Але якщо принтер/каса/софт підвели — опиши, допоможу.',
                'Ок. Якщо потрібна допомога з технікою — просто скажи, що саме не так.',
                'Це більше про щось інше. Якщо є технічна проблема — пиши, допоможу з тікетом.',
                'Я спеціалізуюся на заявках. Щось зламалось — опиши кількома словами.',
                'Не те, що я очікував, але з технічними заявками допоможу. Напиши, що не працює.',
                'Здається, це не заявка на ремонт. Якщо щось зламалось — опиши, оформимо.',
                'Я тут для технічних тікетів. Щось не працює — напиши, що відбувається.',
                'Це не дуже підходить. Але якщо є поломка чи помилка — розкажи, допоможу.',
                'Окей, зрозумів. Якщо є технічна неполадка — опиши її, і я оформлю.',
                'Поки що не бачу технічної проблеми. Якщо щось не так — напиши, розберемося.',
                'Я допомагаю з заявками на обладнання та софт. Опиши проблему — допоможу.',
                'Це не виглядає як тікет. Але якщо техніка підкачала — напиши деталі.',
                'Якщо щось не працює в закладі — опиши кількома словами, і я створю тікет.',
                'Не зовсім моя тема, але заявки на техніку приймаю. Пиши, якщо щось не так.',
                'Зрозуміло. Якщо потрібна допомога з принтером, касою, iiko — напиши.',
                'Схоже на оффтоп. Якщо є технічна проблема — опиши її, і я візьмуся.',
                'Я тут для заявок на допомогу. Щось зламалось — опиши, що саме.',
                'Це не про тікет, здається. Але якщо щось не працює — дай знати, допоможу.',
                'Ок. Якщо зʼявиться технічна проблема — просто опиши ситуацію.',
                'Не бачу підстав для заявки. Якщо щось потребує ремонту — напиши, що саме.',
                'Я готовий оформити заявку. Є технічна проблема — опиши її кількома словами.',
                'Поки не зрозуміло, чи це для тікета. Якщо щось зламалось — напиши.',
                'Це не те, з чим я допомагаю. Але якщо є поломка — розкажи, оформимо.',
                'Я тут для технічних заявок. Опиши проблему — швидко оформимо тікет.',
                'Схоже, ми трохи не туди. Якщо є технічна проблема — скажи, що саме.',
                'Давай так: є технічна неполадка — опиши її, і я допоможу оформити.',
                'Не те, що я очікував. Якщо щось не працює — напиши, допоможу з тікетом.',
                'Здається, це не про обладнання. Якщо все ж є проблема — пиши.',
                'Я допомагаю з тікетами. Щось не так з технікою — опиши, і я візьмуся.',
                'Це виглядає не як заявка на допомогу. Але якщо щось зламалось — напиши.',
                'Окей. Якщо потрібна допомога з технікою — опиши проблему кількома словами.',
                'Поки що не бачу технічної неполадки. Якщо є — напиши, оформимо.',
                'Я тут головним чином про тікети. Опиши проблему — підкажу, що далі.',
                'Це не дуже пасує під заявку. Якщо є технічна проблема — розкажи деталі.',
                'Якщо щось не працює (обладнання, софт) — напиши, що саме, і я оформлю.',
                'Не впевнений, що це для тікета. Але якщо є поломка — пиши, допоможу.',
                'Зрозуміло. Якщо зʼявиться щось, що потребує ІТ — просто скажи.',
                'Схоже на загальне питання. Якщо є технічна проблема — опиши її.',
                'Я спеціалізуюся на заявках на техніку. Щось зламалось — напиши, що сталося.',
                'Це не про ремонт чи налаштування, здається. Але якщо є — пиши.',
                'Ок. Якщо щось не працює в закладі — опиши ситуацію, і я допоможу.',
                'Не бачу тут технічної проблеми. Якщо щось не так — напиши, розберемося.',
                'Я тут для вирішення технічних питань через тікети. Опиши проблему — оформимо.',
                'Це не схоже на тікет. Але якщо техніка підвела — напиши, що відбувається.',
                'Давай так: якщо є технічна проблема — опиши її, і я швидко створю заявку.',
                'Поки не зовсім зрозуміло. Якщо щось зламалось — напиши кількома словами.',
                'Я готовий допомогти. Є технічна проблема — опиши її, і я оформлю тікет.'
              ];
              return fallbackOffTopic[Math.floor(Math.random() * fallbackOffTopic.length)];
            })();
      await this.sendMessage(chatId, msg, {
        reply_markup: { inline_keyboard: [[{ text: 'Створити тікет', callback_data: 'create_ticket' }], [{ text: 'Головне меню', callback_data: 'back_to_menu' }]] }
      });
      this.userSessions.delete(chatId);
      return;
    }

    // 1.5) Тікет + є швидка підказка — спочатку одна підказка; якщо користувач вже натиснув «Ні, створити тікет», не показувати підказку знову
    // Якщо потрібна ще інформація (нечіткий опис) — не показуємо підказку з кнопками «Допомогло», а йдемо в збір питань нижче
    const quickSolutionText = result.quickSolution && String(result.quickSolution).trim();
    const skipQuickSolution = !!session.afterTipNotHelped;
    if (session.afterTipNotHelped) delete session.afterTipNotHelped;
    if (result.isTicketIntent && quickSolutionText && !result.needsMoreInfo && session.step !== 'awaiting_tip_feedback' && !skipQuickSolution) {
      session.dialog_history.push({ role: 'assistant', content: quickSolutionText });
      session.step = 'awaiting_tip_feedback';
      await this.sendMessage(chatId,
        quickSolutionText + '\n\n_Якщо не допоможе — натисніть «Ні, створити тікет», і я зберу деталі для заявки._', {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Допомогло', callback_data: 'tip_helped' }],
              [{ text: '❌ Ні, створити тікет', callback_data: 'tip_not_helped' }],
              [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
            ]
          }
        }
      );
      return;
    }

    // 2) Тікет і достатньо інформації — формуємо підсумок і показуємо підтвердження
    if (!result.needsMoreInfo && (result.confidence || 0) >= CONFIDENCE_THRESHOLD) {
      await this.sendTyping(chatId);
      const summary = await aiFirstLineService.getTicketSummary(session.dialog_history, session.userContext);
      if (summary) {
        session.step = 'confirm_ticket';
        session.ticketDraft = {
          createdBy: user._id,
          title: summary.title,
          description: summary.description,
          priority: summary.priority,
          subcategory: summary.category,
          type: 'problem'
        };
        const msg = `✅ *Перевірте, чи все правильно*\n\n📌 *Заголовок:*\n${summary.title}\n\n📝 *Опис:*\n${summary.description}\n\n📊 *Категорія:* ${summary.category}\n⚡ *Пріоритет:* ${summary.priority}\n\nВсе правильно?`;
        await this.sendMessage(chatId, msg, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
              [{ text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' }],
              [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
            ]
          },
          parse_mode: 'Markdown'
        });
        return;
      }
    }

    // 3) Fallback тільки коли потрібно ще одне питання і вже досягнуто ліміт
    if (result.needsMoreInfo && ((session.ai_attempts || 0) >= MAX_AI_ATTEMPTS || (session.ai_questions_count || 0) >= MAX_AI_QUESTIONS)) {
      session.mode = 'choosing';
      const count = session.ai_questions_count || 0;
      await this.sendMessage(chatId,
        `Я вже ${count} раз(и) уточнював і все ще не до кінця зрозумів. Давай так:\n\n` +
        `Оберіть дію:`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Продовжити зі мною', callback_data: 'ai_continue' }],
              [{ text: 'Заповнити покроково (класика)', callback_data: 'ai_switch_to_classic' }],
              [{ text: 'Скасувати заявку', callback_data: 'cancel_ticket' }]
            ]
          }
        }
      );
      return;
    }

    session.ai_questions_count = (session.ai_questions_count || 0) + 1;
    await this.sendTyping(chatId);
    let question;
    try {
      question = await aiFirstLineService.generateNextQuestion(session.dialog_history, result.missingInfo || [], session.userContext);
    } catch (err) {
      logger.error('AI: помилка generateNextQuestion', err);
      question = 'Опишіть, будь ласка, проблему детальніше.';
    }
    session.dialog_history.push({ role: 'assistant', content: question });
    botConversationService.appendMessage(chatId, user, 'assistant', question).catch(() => {});

    await this.sendMessage(chatId, question, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' }],
          [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
        ]
      }
    });
  }

  async handleTextMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;
    const session = this.userSessions.get(chatId);

    // Перевіряємо, чи користувач вже зареєстрований
    // Конвертуємо userId в рядок, оскільки telegramId зберігається як String
    const existingUser = await User.findOne({ 
      $or: [
        { telegramId: String(userId) },
        { telegramId: userId }
      ]
    })
      .populate('position', 'name')
      .populate('city', 'name');
    
    // Якщо користувач зареєстрований, не проводимо реєстрацію
    if (existingUser) {
      // Перевіряємо, чи є активна сесія для створення тікету
      if (session) {
        // Додано: docs/AI_BOT_LOGIC.md — обробка AI-режиму (виклики 1–3)
        if (session.mode === 'ai') {
          await this.handleMessageInAiMode(chatId, text, session, existingUser);
          return;
        }
        if (session.mode === 'choosing') {
          await this.sendMessage(chatId, 'Оберіть дію кнопками нижче 👇');
          return;
        }
        await this.handleTicketCreationStep(chatId, text, session);
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
      const hasApiKey = aiSettings && (
        (aiSettings.provider === 'groq' && aiSettings.groqApiKey && String(aiSettings.groqApiKey).trim()) ||
        (aiSettings.provider === 'openai' && aiSettings.openaiApiKey && String(aiSettings.openaiApiKey).trim())
      );
      if (aiEnabled && hasApiKey && text && String(text).trim().length > 0) {
        const fullUser = await User.findById(existingUser._id).populate('position', 'title name').populate('city', 'name region').populate('institution', 'name').lean();
        const profile = fullUser || existingUser;
        const userContext = {
          userCity: profile.city?.name || 'Не вказано',
          userPosition: profile.position?.title || profile.position?.name || 'Не вказано',
          userInstitution: profile.institution?.name || '',
          userName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email,
          userEmail: profile.email
        };
        const session = {
          mode: 'ai',
          step: 'gathering_information',
          ai_attempts: 0,
          ai_questions_count: 0,
          dialog_history: [],
          userContext,
          ticketData: { createdBy: existingUser._id, photos: [], documents: [] },
          ticketDraft: null
        };
        this.userSessions.set(chatId, session);
        await this.handleMessageInAiMode(chatId, text.trim(), session, existingUser);
        return;
      }

      // Якщо AI вимкнений і користувач написав текст — підказка та кнопка «Створити тікет» (робота лише через кнопки)
      if (text && String(text).trim().length > 0) {
        await this.sendMessage(chatId,
          `🤖 AI зараз недоступний. Спробуйте пізніше або використайте стандартну процедуру подачі звернення.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📝 Створити тікет', callback_data: 'create_ticket' }],
                [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]
              ]
            }
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
      await this.handleLoginTextInput(chatId, userId, text, session, msg);
      return;
    }

    // Перевіряємо, чи користувач в процесі реєстрації
    // Конвертуємо userId в рядок для пошуку
    const pendingRegistration = await PendingRegistration.findOne({ 
      $or: [
        { telegramId: String(userId) },
        { telegramId: userId }
      ]
    });
    if (pendingRegistration) {
      await this.handleRegistrationTextInput(chatId, userId, text, pendingRegistration);
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

  // Обробник текстових повідомлень під час реєстрації
  async handleRegistrationTextInput(chatId, userId, text, pendingRegistration) {
    try {
      const step = pendingRegistration.step;
      let isValid = true;
      let errorMessage = '';

      switch (step) {
        case 'firstName': {
          const trimmedFirstName = text.trim();
          if (!trimmedFirstName || trimmedFirstName.length === 0) {
            isValid = false;
            errorMessage = '❌ *Помилка*\n\nІм\'я не може бути порожнім.\n\n💡 Введіть ваше ім\'я:';
          } else if (this.validateName(text)) {
            pendingRegistration.data.firstName = trimmedFirstName;
            pendingRegistration.step = 'lastName';
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректне ім\'я*\n\nІм\'я повинно:\n• Містити тільки літери (українські або латинські)\n• Бути довжиною від 2 до 50 символів\n• Може містити апостроф, дефіс або пробіл\n\n💡 *Приклад:* Олександр, Іван, John\n\nСпробуйте ще раз:';
          }
          break;
        }

        case 'lastName': {
          const trimmedLastName = text.trim();
          if (!trimmedLastName || trimmedLastName.length === 0) {
            isValid = false;
            errorMessage = '❌ *Помилка*\n\nПрізвище не може бути порожнім.\n\n💡 Введіть ваше прізвище:';
          } else if (this.validateName(text)) {
            pendingRegistration.data.lastName = trimmedLastName;
            pendingRegistration.step = 'email';
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректне прізвище*\n\nПрізвище повинно:\n• Містити тільки літери (українські або латинські)\n• Бути довжиною від 2 до 50 символів\n• Може містити апостроф, дефіс або пробіл\n\n💡 *Приклад:* Петренко, Іванов, Smith\n\nСпробуйте ще раз:';
          }
          break;
        }

        case 'email': {
          const trimmedEmail = text.trim();
          if (!trimmedEmail || trimmedEmail.length === 0) {
            isValid = false;
            errorMessage = '❌ *Помилка*\n\nEmail не може бути порожнім.\n\n💡 Введіть ваш email:';
          } else if (this.validateEmail(text)) {
            // Перевіряємо, чи email вже не використовується
            const existingUser = await User.findOne({ email: trimmedEmail.toLowerCase() });
            if (existingUser) {
              isValid = false;
              errorMessage = '❌ *Email вже використовується*\n\nКористувач з таким email вже зареєстрований в системі.\n\n💡 Введіть інший email:';
            } else {
              pendingRegistration.data.email = trimmedEmail.toLowerCase();
              pendingRegistration.step = 'login';
            }
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректний email*\n\nEmail повинен містити:\n• Символ @\n• Домен з крапкою\n• Коректний формат\n\n💡 *Приклад:* user@example.com, ivan.petrov@company.ua\n\nСпробуйте ще раз:';
          }
          break;
        }

        case 'login': {
          const trimmedLogin = text.trim();
          if (!trimmedLogin || trimmedLogin.length === 0) {
            isValid = false;
            errorMessage = '❌ *Помилка*\n\nЛогін не може бути порожнім.\n\n💡 Введіть ваш логін:';
          } else if (trimmedLogin.length < 3) {
            isValid = false;
            errorMessage = '❌ *Некоректний логін*\n\nЛогін занадто короткий.\n\nЛогін повинен:\n• Містити мінімум 3 символи\n• Складатися тільки з англійських літер (a-z, A-Z)\n• Може містити цифри (0-9) та підкреслення (_)\n• Не може містити кирилицю або інші символи\n• Тільки англійська мова\n\n💡 *Приклад:* my_login123, user_name, admin2024\n\nСпробуйте ще раз:';
          } else if (trimmedLogin.length > 50) {
            isValid = false;
            errorMessage = '❌ *Некоректний логін*\n\nЛогін занадто довгий.\n\nЛогін повинен:\n• Містити максимум 50 символів\n• Складатися тільки з англійських літер (a-z, A-Z)\n• Може містити цифри (0-9) та підкреслення (_)\n• Тільки англійська мова\n\n💡 Спробуйте ще раз:';
          } else if (/[а-яА-ЯіІїЇєЄ]/.test(trimmedLogin)) {
            isValid = false;
            errorMessage = '❌ *Некоректний логін*\n\nЛогін не може містити кирилицю.\n\nЛогін повинен:\n• Складатися тільки з англійських літер (a-z, A-Z)\n• Може містити цифри (0-9) та підкреслення (_)\n• Не може містити українські літери\n• Тільки англійська мова\n\n💡 *Приклад:* my_login123, user_name, admin2024\n\nСпробуйте ще раз:';
          } else if (!/[a-zA-Z]/.test(trimmedLogin)) {
            isValid = false;
            errorMessage = '❌ *Некоректний логін*\n\nЛогін повинен містити хоча б одну англійську літеру.\n\nЛогін повинен:\n• Містити хоча б одну англійську літеру (a-z, A-Z)\n• Може містити цифри (0-9) та підкреслення (_)\n• Тільки англійська мова\n\n💡 *Приклад:* my_login123, user_name, admin2024\n\nСпробуйте ще раз:';
          } else if (!/^[a-zA-Z0-9_]+$/.test(trimmedLogin)) {
            isValid = false;
            errorMessage = '❌ *Некоректний логін*\n\nЛогін містить заборонені символи.\n\nЛогін повинен:\n• Складатися тільки з англійських літер (a-z, A-Z)\n• Може містити цифри (0-9) та підкреслення (_)\n• Не може містити пробіли, дефіси, крапки та інші символи\n• Тільки англійська мова\n\n💡 *Приклад:* my_login123, user_name, admin2024\n\nСпробуйте ще раз:';
          } else if (this.validateLogin(text)) {
            const normalizedLogin = trimmedLogin.toLowerCase();
            // Перевіряємо, чи логін вже не використовується
            const existingUser = await User.findOne({ login: normalizedLogin });
            if (existingUser) {
              isValid = false;
              errorMessage = '❌ *Логін вже використовується*\n\nКористувач з таким логіном вже зареєстрований в системі.\n\n💡 Введіть інший логін (тільки англійська мова):';
            } else {
              pendingRegistration.data.login = normalizedLogin;
              pendingRegistration.step = 'phone';
            }
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректний логін*\n\nЛогін повинен:\n• Містити мінімум 3 символи\n• Містити максимум 50 символів\n• Складатися тільки з англійських літер, цифр та підкреслення\n• Тільки англійська мова\n\n💡 *Приклад:* my_login123, user_name, admin2024\n\nСпробуйте ще раз:';
          }
          break;
        }

        case 'phone': {
          const trimmedPhone = text.trim();
          if (!trimmedPhone || trimmedPhone.length === 0) {
            isValid = false;
            errorMessage = '❌ *Помилка*\n\nНомер телефону не може бути порожнім.\n\n💡 Введіть ваш номер телефону:';
          } else if (this.validatePhone(text)) {
            pendingRegistration.data.phone = trimmedPhone;
            pendingRegistration.step = 'password';
            // Приховуємо клавіатуру після успішного введення номера
            await this.sendMessage(chatId, 
              `✅ <b>Номер телефону прийнято!</b>\n` +
              `📱 ${this.escapeHtml(trimmedPhone)}`,
              {
                parse_mode: 'HTML',
                reply_markup: {
                  remove_keyboard: true
                }
              }
            );
          } else {
            isValid = false;
            const cleanedPhone = trimmedPhone.replace(/[\s-()]/g, '');
            if (cleanedPhone.length < 10) {
              errorMessage = '❌ *Некоректний номер телефону*\n\nНомер занадто короткий.\n\nНомер повинен:\n• Містити від 10 до 15 цифр\n• Може починатися з + (наприклад, +380)\n\n💡 *Приклад:* +380501234567, 0501234567\n\nСпробуйте ще раз:';
            } else if (cleanedPhone.length > 15) {
              errorMessage = '❌ *Некоректний номер телефону*\n\nНомер занадто довгий.\n\nНомер повинен:\n• Містити від 10 до 15 цифр\n• Може починатися з + (наприклад, +380)\n\n💡 *Приклад:* +380501234567, 0501234567\n\nСпробуйте ще раз:';
            } else if (!/^\+?[0-9]+$/.test(cleanedPhone)) {
              errorMessage = '❌ *Некоректний номер телефону*\n\nНомер містить недозволені символи.\n\nНомер повинен:\n• Містити тільки цифри\n• Може починатися з + (наприклад, +380)\n• Може містити пробіли, дефіси, дужки для форматування\n\n💡 *Приклад:* +380501234567, 0501234567, +38 (050) 123-45-67\n\nСпробуйте ще раз:';
            } else {
              errorMessage = '❌ *Некоректний номер телефону*\n\nНомер повинен:\n• Містити від 10 до 15 цифр\n• Може починатися з + (наприклад, +380)\n\n💡 *Приклад:* +380501234567, 0501234567\n\nСпробуйте ще раз:';
            }
          }
          break;
        }

        case 'password': {
          if (!text || text.length === 0) {
            isValid = false;
            errorMessage = '❌ *Помилка*\n\nПароль не може бути порожнім.\n\n💡 Введіть ваш пароль:';
          } else if (text.length < 6) {
            isValid = false;
            errorMessage = '❌ *Слабкий пароль*\n\nПароль занадто короткий.\n\nПароль повинен:\n• Містити мінімум 6 символів\n• Принаймні одну латинську літеру (a-z, A-Z)\n• Принаймні одну цифру (0-9)\n• Не може містити кирилицю\n\n💡 *Приклад:* MyPass123, Password2024\n\nСпробуйте ще раз:';
          } else if (/[а-яА-ЯіІїЇєЄ]/.test(text)) {
            isValid = false;
            errorMessage = '❌ *Некоректний пароль*\n\nПароль не може містити кирилицю.\n\nПароль повинен:\n• Містити тільки латинські літери (a-z, A-Z)\n• Може містити цифри (0-9) та спеціальні символи\n• Не може містити українські літери\n\n💡 *Приклад:* MyPass123, Password2024\n\nСпробуйте ще раз:';
          } else if (!/[a-zA-Z]/.test(text)) {
            isValid = false;
            errorMessage = '❌ *Слабкий пароль*\n\nПароль повинен містити хоча б одну латинську літеру.\n\nПароль повинен:\n• Містити мінімум 6 символів\n• Принаймні одну латинську літеру (a-z, A-Z)\n• Принаймні одну цифру (0-9)\n\n💡 *Приклад:* MyPass123, Password2024\n\nСпробуйте ще раз:';
          } else if (!/\d/.test(text)) {
            isValid = false;
            errorMessage = '❌ *Слабкий пароль*\n\nПароль повинен містити хоча б одну цифру.\n\nПароль повинен:\n• Містити мінімум 6 символів\n• Принаймні одну латинську літеру (a-z, A-Z)\n• Принаймні одну цифру (0-9)\n\n💡 *Приклад:* MyPass123, Password2024\n\nСпробуйте ще раз:';
          } else if (this.validatePassword(text)) {
            pendingRegistration.data.password = text; // В реальному проекті потрібно хешувати
            pendingRegistration.step = 'city';
          } else {
            isValid = false;
            errorMessage = '❌ *Слабкий пароль*\n\nПароль повинен містити:\n• Мінімум 6 символів\n• Принаймні одну латинську літеру (a-z, A-Z)\n• Принаймні одну цифру (0-9)\n• Не може містити кирилицю\n\n💡 *Приклад:* MyPass123, Password2024\n\nСпробуйте ще раз:';
          }
          break;
        }

        case 'department': {
          if (this.validateDepartment(text)) {
            pendingRegistration.data.department = text.trim();
            pendingRegistration.step = 'completed';
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректна назва відділу*\n\nНазва відділу повинна бути довжиною від 2 до 100 символів.\n\n💡 Спробуйте ще раз:';
          }
          break;
        }

        default:
          await this.sendMessage(chatId, '❌ Помилка в процесі реєстрації. Спробуйте почати заново.');
          return;
      }

      if (isValid) {
        await pendingRegistration.save();
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
      } else {
        // Конвертуємо Markdown на HTML для повідомлень про помилки, щоб уникнути проблем з парсингом
        const htmlMessage = this.markdownToHtml(errorMessage);
        await this.sendMessage(chatId, htmlMessage, { parse_mode: 'HTML' });
      }

    } catch (error) {
      logger.error('Помилка обробки реєстраційного введення:', error);
      await this.sendMessage(chatId, 
        '❌ *Помилка*\n\nВиникла технічна помилка. Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)',
        { parse_mode: 'Markdown' }
      );
    }
  }

  // Екранування спеціальних символів Markdown для Telegram
  escapeMarkdown(text) {
    if (!text || typeof text !== 'string') {return text;}
    // Екрануємо спеціальні символи Markdown: * _ [ ] ( ) ~ ` >
    return text
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>');
  }

  // Екранування спеціальних символів HTML для Telegram
  escapeHtml(text) {
    if (!text || typeof text !== 'string') {return text;}
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Конвертація Markdown на HTML для Telegram (базова)
  markdownToHtml(text) {
    if (!text || typeof text !== 'string') {return text;}
    return text
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')  // **text** -> <b>text</b>
      .replace(/\*(.+?)\*/g, '<b>$1</b>')      // *text* -> <b>text</b>
      .replace(/_(.+?)_/g, '<i>$1</i>')        // _text_ -> <i>text</i>
      .replace(/`(.+?)`/g, '<code>$1</code>'); // `text` -> <code>text</code>
  }

  // Методи валідації
  validateName(name) {
    if (!name || typeof name !== 'string') {return false;}
    const trimmed = name.trim();
    return trimmed.length >= 2 && trimmed.length <= 50 && /^[a-zA-Zа-яА-ЯіІїЇєЄ''\s-]+$/.test(trimmed);
  }

  validateEmail(email) {
    if (!email || typeof email !== 'string') {return false;}
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  validateLogin(login) {
    if (!login || typeof login !== 'string') {return false;}
    const trimmed = login.trim();
    // Мінімум 3 символи, максимум 50, тільки латиниця, цифри та підкреслення
    // Перевіряємо, що немає кирилиці та інших спеціальних символів
    if (trimmed.length < 3 || trimmed.length > 50) {return false;}
    // Перевіряємо, що є хоча б одна латинська літера
    if (!/[a-zA-Z]/.test(trimmed)) {return false;}
    // Перевіряємо, що немає кирилиці
    if (/[а-яА-ЯіІїЇєЄ]/.test(trimmed)) {return false;}
    // Перевіряємо, що тільки дозволені символи
    return /^[a-zA-Z0-9_]+$/.test(trimmed);
  }

  validatePhone(phone) {
    if (!phone || typeof phone !== 'string') {return false;}
    const phoneRegex = /^\+?[1-9]\d{9,14}$/;
    return phoneRegex.test(phone.replace(/[\s-()]/g, ''));
  }

  validatePassword(password) {
    if (!password || typeof password !== 'string') {return false;}
    // Пароль повинен містити тільки латинські літери, цифри та дозволені символи
    // Мінімум 6 символів, хоча б одна латинська літера та одна цифра
    if (password.length < 6) {return false;}
    // Перевіряємо, що немає кирилиці
    if (/[а-яА-ЯіІїЇєЄ]/.test(password)) {return false;}
    // Перевіряємо, що є хоча б одна латинська літера
    if (!/[a-zA-Z]/.test(password)) {return false;}
    // Перевіряємо, що є хоча б одна цифра
    if (!/\d/.test(password)) {return false;}
    return true;
  }

  validateDepartment(department) {
    if (!department || typeof department !== 'string') {return false;}
    const trimmed = department.trim();
    return trimmed.length >= 2 && trimmed.length <= 100;
  }

  async handleTicketCreationStep(chatId, text, session) {
    try {
      switch (session.step) {
        case 'gathering_information': {
          // Редагування з підтвердження: «нічого не змінювати» — повертаємо до екрану підтвердження
          if (session.editingFromConfirm && session.ticketDraft) {
            const t = (text || '').toLowerCase().trim();
            const nothingToChange = /^(нічого|ничого|nothing|ні|нi|пропустити|залишити як є|залишити|все ок|все добре|ок|окей|добре|норм|нормально)$/.test(t) || t === 'нч' || t === 'нчого';
            if (nothingToChange) {
              session.step = 'confirm_ticket';
              session.editingFromConfirm = false;
              const categoryEmoji = this.getCategoryEmoji(session.ticketDraft.subcategory);
              const summaryMessage =
                `✅ *Дякую за інформацію!*\n\n` +
                `📋 *РЕЗЮМЕ ТІКЕТА:*\n\n` +
                `📌 *Заголовок:*\n${session.ticketDraft.title || '—'}\n\n` +
                `📝 *Опис:*\n${session.ticketDraft.description || '—'}\n\n` +
                `${categoryEmoji} *Категорія:* ${session.ticketDraft.subcategory || '—'}\n\n` +
                `💡 Все правильно?`;
              await this.sendMessage(chatId, summaryMessage, {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
                    [{ text: '✏️ Щось не так, виправити', callback_data: 'edit_ticket_info' }],
                    [{ text: '❌ Скасувати', callback_data: 'cancel_ticket' }]
                  ]
                }
              });
              break;
            }
            session.editingFromConfirm = false;
          }
          // Збір інформації без AI: додаємо відповідь і показуємо резюме для підтвердження
          if (!session.ticketDraft || !Array.isArray(session.ticketDraft.collectedInfo)) {
            break;
          }
          logger.info(`Збір інформації, етап ${session.stage}`);
          session.ticketDraft.collectedInfo.push(text);
          if (session.aiDialogId) {
            await this.addMessageToAIDialog(session.aiDialogId, 'user', text);
          }
          const fullDescription = `${session.ticketDraft.initialMessage}\n\nДодаткова інформація:\n${session.ticketDraft.collectedInfo.join('\n')}`;
          session.ticketDraft.title = session.ticketDraft.title || session.ticketDraft.initialMessage.slice(0, 50) || 'Проблема';
          session.ticketDraft.description = fullDescription;
          session.ticketDraft.priority = 'medium';
          session.step = 'confirm_ticket';
          const categoryEmoji = this.getCategoryEmoji(session.ticketDraft.subcategory);
          const summaryMessage =
            `✅ *Дякую за інформацію!*\n\n` +
            `📋 *РЕЗЮМЕ ТІКЕТА:*\n\n` +
            `📌 *Заголовок:*\n${session.ticketDraft.title}\n\n` +
            `📝 *Опис:*\n${session.ticketDraft.description}\n\n` +
            `${categoryEmoji} *Категорія:* ${session.ticketDraft.subcategory}\n\n` +
            `💡 Все правильно?`;
          await this.sendMessage(chatId, summaryMessage, {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
                [{ text: '✏️ Щось не так, виправити', callback_data: 'edit_ticket_info' }],
                [{ text: '❌ Скасувати', callback_data: 'cancel_ticket' }]
              ]
            }
          });
          break;
        }
        
        case 'confirm_ticket': {
          // Користувач підтвердив створення або редагує
          // Цей етап обробляється через callback кнопки
          break;
        }

        case 'title':
          session.ticketData.title = text;
          session.step = 'description';
          await this.sendMessage(chatId, 
            'Крок 2/4: Введіть опис проблеми:', {
              reply_markup: {
                inline_keyboard: [[{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]]
              }
            }
          );
          break;

        case 'description':
          session.ticketData.description = text;
          
          // Переходимо до додавання фото/файлів
          session.step = 'photo';
          await this.sendMessage(chatId, 
            `📎 *Крок 3/4:* Бажаєте додати фото або файли до заявки?`, {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '📷 Додати фото', callback_data: 'attach_photo' },
                    { text: '📎 Додати файл', callback_data: 'attach_document' }
                  ],
                  [{ text: '⏭️ Пропустити', callback_data: 'skip_photo' }],
                  [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
                ]
              }
            }
          );
          break;

  


         case 'priority':
           // Логіка для пріоритету - очікуємо callback
           break;
      }
    } catch (error) {
      logger.error('Помилка обробки кроку створення тікету:', error);
      await this.sendMessage(chatId, 'Виникла помилка. Спробуйте ще раз.');
    }
  }

  // Обробка фото
  async handlePhoto(msg) {
    const chatId = msg.chat.id;
    const session = this.userSessions.get(chatId);

    if (session && session.step === 'photo') {
      await this.handleTicketPhoto(chatId, msg.photo, msg.caption);
    } else {
      await this.sendMessage(chatId, 'Фото можна прикріпляти тільки під час створення тікету.');
    }
  }

  /**
   * У AI-режимі: завантажує фото, аналізує через vision (інструкція з інтернету/помилки), пропонує «Допомогло» / «Ні, створити тікет».
   */
  async handlePhotoInAiMode(chatId, photos, caption, session, user) {
    if (!session.dialog_history) session.dialog_history = [];
    const lastUserMsg = session.dialog_history.filter(m => m.role === 'user').pop();
    const problemDescription = (caption && String(caption).trim()) || (lastUserMsg && lastUserMsg.content) || 'Користувач надіслав фото по технічній проблемі.';
    session.dialog_history.push({ role: 'user', content: `[Фото] ${caption || problemDescription}` });

    await this.sendTyping(chatId);
    if (!photos || photos.length === 0) {
      await this.sendMessage(chatId, 'Не вдалося отримати фото. Спробуйте надіслати ще раз або опишіть проблему текстом.');
      return;
    }
    const photo = photos[photos.length - 1];
    const fileId = photo.file_id;
    let localPath;
    try {
      const file = await this.bot.getFile(fileId);
      if (!file || !file.file_path) {
        await this.sendMessage(chatId, 'Помилка отримання фото. Спробуйте ще раз.');
        return;
      }
      const ext = path.extname(file.file_path).toLowerCase() || '.jpg';
      localPath = await this.downloadTelegramFileByFileId(fileId, ext);
    } catch (err) {
      logger.error('Помилка завантаження фото в AI-режимі', { chatId, err: err.message });
      await this.sendMessage(chatId, 'Помилка завантаження фото. Опишіть проблему текстом або спробуйте надіслати фото знову.');
      return;
    }
    let analysisText = null;
    try {
      analysisText = await aiFirstLineService.analyzePhoto(localPath, problemDescription, session.userContext);
    } catch (err) {
      logger.error('AI: помилка analyzePhoto', err);
    } finally {
      try {
        if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
      } catch (_) {}
    }
    if (analysisText && analysisText.trim()) {
      session.step = 'awaiting_tip_feedback';
      session.dialog_history.push({ role: 'assistant', content: analysisText });
      botConversationService.appendMessage(chatId, user, 'assistant', analysisText).catch(() => {});
      await this.sendMessage(chatId, analysisText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Допомогло', callback_data: 'tip_helped' }],
            [{ text: '❌ Ні, створити тікет', callback_data: 'tip_not_helped' }],
            [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
          ]
        }
      });
    } else {
      session.step = 'awaiting_tip_feedback';
      await this.sendMessage(chatId,
        'Не вдалося проаналізувати фото (або використано провайдера без підтримки зображень). Опишіть проблему текстом або натисніть «Ні, створити тікет», і я зберу деталі для заявки.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Допомогло', callback_data: 'tip_helped' }],
              [{ text: '❌ Ні, створити тікет', callback_data: 'tip_not_helped' }],
              [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
            ]
          }
        }
      );
    }
  }

  async handleDocument(msg) {
    const chatId = msg.chat.id;
    const session = this.userSessions.get(chatId);

    if (session && session.step === 'photo') {
      await this.handleTicketDocument(chatId, msg.document, msg.caption);
    } else {
      await this.sendMessage(chatId, 'Файли можна прикріпляти тільки під час створення тікету.');
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
        await this.sendMessage(chatId, 'Помилка: не вдалося отримати інформацію про файл. Спробуйте надіслати ще раз.');
        return;
      }

      const fileId = document.file_id;
      const fileSizeBytes = document.file_size || 0;
      const maxSizeBytes = 50 * 1024 * 1024; // 50MB

      if (fileSizeBytes > maxSizeBytes) {
        await this.sendMessage(chatId, 
          `❌ Файл занадто великий!\n\n` +
          `Розмір: ${formatFileSize(fileSizeBytes)}\n` +
          `Максимальний розмір: ${formatFileSize(maxSizeBytes)}\n\n` +
          `Будь ласка, надішліть файл меншого розміру.`
        );
        return;
      }

      // Отримуємо інформацію про файл
      let file;
      try {
        file = await this.bot.getFile(fileId);
      } catch (error) {
        logger.error('Помилка отримання інформації про файл', { fileId, error: error.message });
        await this.sendMessage(chatId, 'Помилка: не вдалося отримати інформацію про файл. Спробуйте надіслати ще раз.');
        return;
      }

      if (!file || !file.file_path) {
        logger.error('Файл не містить file_path', { fileId, file });
        await this.sendMessage(chatId, 'Помилка: не вдалося отримати шлях до файлу. Спробуйте надіслати ще раз.');
        return;
      }

      // Визначаємо розширення файлу
      const filePath = file.file_path;
      const fileName = document.file_name || path.basename(filePath);
      const fileExtension = path.extname(fileName).toLowerCase() || path.extname(filePath).toLowerCase() || '.bin';

      // Ініціалізуємо масив документів, якщо його немає
      if (!session.ticketData.documents) {
        session.ticketData.documents = [];
      }

      // Перевіряємо кількість файлів (загальна кількість фото + документів)
      const totalFiles = (session.ticketData.photos?.length || 0) + (session.ticketData.documents?.length || 0);
      if (totalFiles >= 10) {
        await this.sendMessage(chatId, 
          `❌ Досягнуто максимальну кількість файлів!\n\n` +
          `Максимум: 10 файлів на тікет\n` +
          `Поточна кількість: ${totalFiles}\n\n` +
          `Натисніть "Завершити" для продовження.`
        );
        return;
      }
      
      // Завантажуємо та зберігаємо файл
      let savedPath;
      try {
        savedPath = await this.downloadTelegramFileByFileId(fileId, fileExtension);
        logger.info('Файл успішно завантажено', { filePath, savedPath, fileId, fileName });
      } catch (downloadError) {
        logger.error('Помилка завантаження файлу з Telegram', {
          filePath,
          fileId,
          fileName,
          error: downloadError.message,
          stack: downloadError.stack
        });
        await this.sendMessage(chatId, 
          `❌ Помилка завантаження файлу!\n\n` +
          `Не вдалося завантажити файл з Telegram серверів.\n` +
          `Спробуйте надіслати файл ще раз або зверніться до адміністратора.`
        );
        return;
      }
      
      // Додаємо файл до сесії
      session.ticketData.documents.push({
        fileId: fileId,
        path: savedPath,
        fileName: fileName,
        caption: caption || '',
        size: fileSizeBytes,
        extension: fileExtension,
        mimeType: document.mime_type || 'application/octet-stream'
      });

      await this.sendMessage(chatId, 
        `✅ Файл додано! (${totalFiles + 1}/10)\n\n` +
        `📄 Назва: ${fileName}\n` +
        `📏 Розмір: ${formatFileSize(fileSizeBytes)}\n` +
        `📋 Формат: ${fileExtension.toUpperCase() || 'невідомий'}\n\n` +
        'Хочете додати ще файли?', {
          reply_markup: {
              inline_keyboard: [
                [
                  { text: '📎 Додати ще файл', callback_data: 'add_more_photos' },
                  { text: '✅ Завершити', callback_data: 'finish_ticket' }
                ],
                [
                  { text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }
                ]
              ]
            }
          }
        );
    } catch (error) {
      logger.error('Помилка обробки документа:', {
        error: error.message,
        stack: error.stack,
        chatId
      });
      await this.sendMessage(chatId, 
        `❌ Помилка обробки файлу!\n\n` +
        `Виникла несподівана помилка. Спробуйте надіслати файл ще раз.\n` +
        `Якщо проблема повторюється, зверніться до адміністратора.`
      );
    }
  }

  async handleTicketPhoto(chatId, photos, caption) {
     try {
       const session = this.userSessions.get(chatId);
       if (!session) {
         logger.warn('Спроба додати фото без активної сесії', { chatId });
         await this.sendMessage(chatId, 'Ви не в процесі створення тікету. Використайте /start для початку.');
         return;
       }

       if (!photos || photos.length === 0) {
         logger.warn('Отримано порожній масив фото', { chatId });
         await this.sendMessage(chatId, 'Не вдалося отримати фото. Спробуйте надіслати ще раз.');
         return;
       }

       // Беремо найбільше фото
       const photo = photos[photos.length - 1];
       if (!photo || !photo.file_id) {
         logger.error('Фото не містить file_id', { chatId, photos });
         await this.sendMessage(chatId, 'Помилка: фото не містить необхідних даних. Спробуйте надіслати ще раз.');
         return;
       }

       const fileId = photo.file_id;

       // Перевіряємо розмір фото
       let file;
       try {
         file = await this.bot.getFile(fileId);
       } catch (error) {
         logger.error('Помилка отримання інформації про файл з Telegram', { fileId, error: error.message });
         await this.sendMessage(chatId, 'Помилка отримання інформації про фото. Спробуйте надіслати ще раз.');
         return;
       }

       if (!file || !file.file_path) {
         logger.error('Файл не містить file_path', { fileId, file });
         await this.sendMessage(chatId, 'Помилка: не вдалося отримати шлях до файлу. Спробуйте надіслати ще раз.');
         return;
       }

       const fileSizeBytes = file.file_size || 0;
       const maxSizeBytes = 50 * 1024 * 1024; // 50MB

       if (fileSizeBytes > maxSizeBytes) {
         await this.sendMessage(chatId, 
           `❌ Файл занадто великий!\n\n` +
           `Розмір: ${formatFileSize(fileSizeBytes)}\n` +
           `Максимальний розмір: ${formatFileSize(maxSizeBytes)}\n\n` +
           `Будь ласка, надішліть файл меншого розміру.`
         );
         return;
       }

       // Перевіряємо тип файлу
       const filePath = file.file_path;
       const fileExtension = path.extname(filePath).toLowerCase();
       const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

       if (!allowedExtensions.includes(fileExtension)) {
         await this.sendMessage(chatId, 
           `❌ Непідтримуваний тип файлу!\n\n` +
           `Підтримувані формати: JPG, JPEG, PNG, GIF, WebP\n` +
           `Ваш файл: ${fileExtension || 'невідомий'}\n\n` +
           `Будь ласка, надішліть фото у підтримуваному форматі.`
         );
         return;
       }

       // Перевіряємо кількість фото
       if (!session.ticketData.photos) {
         session.ticketData.photos = [];
       }

       if (session.ticketData.photos.length >= 5) {
         await this.sendMessage(chatId, 
           `❌ Досягнуто максимальну кількість фото!\n\n` +
           `Максимум: 5 фото на тікет\n` +
           `Поточна кількість: ${session.ticketData.photos.length}\n\n` +
           `Натисніть "Завершити" для продовження.`
         );
         return;
       }
       
       // Завантажуємо та зберігаємо фото
       let savedPath;
       try {
         // Використовуємо fileId для завантаження через бота
         savedPath = await this.downloadTelegramFileByFileId(fileId, fileExtension);
         logger.info('Фото успішно завантажено', { filePath, savedPath, fileId });
       } catch (downloadError) {
         logger.error('Помилка завантаження фото з Telegram', {
           filePath,
           fileId,
           error: downloadError.message,
           stack: downloadError.stack
         });
         await this.sendMessage(chatId, 
           `❌ Помилка завантаження фото!\n\n` +
           `Не вдалося завантажити фото з Telegram серверів.\n` +
           `Спробуйте надіслати фото ще раз або зверніться до адміністратора.`
         );
         return;
       }
       
       // Додаємо фото до сесії
       session.ticketData.photos.push({
         fileId: fileId,
         path: savedPath,
         caption: caption || '',
         size: fileSizeBytes,
         extension: fileExtension
       });

       await this.sendMessage(chatId, 
         `✅ Фото додано! (${session.ticketData.photos.length}/5)\n\n` +
         `📏 Розмір: ${formatFileSize(fileSizeBytes)}\n` +
         `📄 Формат: ${fileExtension.toUpperCase()}\n\n` +
         'Хочете додати ще фото?', {
           reply_markup: {
               inline_keyboard: [
                 [
                   { text: '📷 Додати ще фото', callback_data: 'add_more_photos' },
                   { text: '✅ Завершити', callback_data: 'finish_ticket' }
                 ],
                 [
                   { text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }
                 ]
               ]
             }
           }
         );
     } catch (error) {
       logger.error('Помилка обробки фото:', {
         error: error.message,
         stack: error.stack,
         chatId
       });
       await this.sendMessage(chatId, 
         `❌ Помилка обробки фото!\n\n` +
         `Виникла несподівана помилка. Спробуйте надіслати фото ще раз.\n` +
         `Якщо проблема повторюється, зверніться до адміністратора.`
       );
     }
   }

  async handleContact(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Перевіряємо, чи користувач вже зареєстрований
      // Конвертуємо userId в рядок, оскільки telegramId зберігається як String
      const existingUser = await User.findOne({ 
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId }
        ]
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
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId }
        ]
      });
      
      if (!pendingRegistration) {
        await this.sendMessage(chatId, 'Ви не в процесі реєстрації. Використайте /start для початку.');
        return;
      }

      if (pendingRegistration.step !== 'phone') {
        await this.sendMessage(chatId, 'Номер телефону можна поділитися тільки на етапі введення номера.');
        return;
      }

      // Отримуємо номер телефону з контакту
      const contact = msg.contact;
      if (!contact || !contact.phone_number) {
        await this.sendMessage(chatId, '❌ Не вдалося отримати номер телефону. Спробуйте ввести номер вручну.');
        return;
      }

      let phoneNumber = contact.phone_number;

      // Якщо номер не починається з +, додаємо +
      if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+' + phoneNumber;
      }

      // Валідуємо номер телефону
      if (!this.validatePhone(phoneNumber)) {
        await this.sendMessage(chatId, 
          `❌ *Некоректний номер телефону*\n\n` +
          `Отриманий номер: ${phoneNumber}\n\n` +
          `Номер повинен містити від 10 до 15 цифр та починатися з +.\n\n` +
          `💡 Спробуйте ввести номер вручну:`,
          {
            reply_markup: {
              keyboard: [
                [{
                  text: '📱 Поділитися номером',
                  request_contact: true
                }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );
        return;
      }

      // Зберігаємо номер телефону
      pendingRegistration.data.phone = phoneNumber;
      pendingRegistration.step = 'password';
      await pendingRegistration.save();

      // Приховуємо клавіатуру і переходимо до наступного кроку
      await this.sendMessage(chatId, 
        `✅ <b>Номер телефону отримано!</b>\n` +
        `📱 ${phoneNumber}`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            remove_keyboard: true
          }
        }
      );

      // Переходимо до наступного кроку (пароль)
      await this.askForPassword(chatId);

    } catch (error) {
      logger.error('Помилка обробки контакту:', error);
      await this.sendMessage(chatId, '❌ Помилка обробки номеру телефону. Спробуйте ще раз.');
    }
  }

  downloadTelegramFileByFileId(fileId, fileExtension = '.jpg') {
    return new Promise((resolve, reject) => {
      if (!this.bot) {
        reject(new Error('Telegram бот не ініціалізований'));
        return;
      }

      // Створюємо папку для фото якщо не існує
      const uploadsDir = path.join(__dirname, '../uploads/telegram-files');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const fileName = `${Date.now()}_file${fileExtension}`;
      const localPath = path.join(uploadsDir, fileName);
      const file = fs.createWriteStream(localPath);

      try {
        // Використовуємо вбудований метод бота для завантаження
        // getFileStream повертає stream напряму, не Promise
        const stream = this.bot.getFileStream(fileId);
        
        stream.pipe(file);
        
        file.on('finish', () => {
          file.close();
          
          // Перевіряємо, чи файл не порожній
          const stats = fs.statSync(localPath);
          if (stats.size === 0) {
            fs.unlink(localPath, () => {});
            logger.error('Завантажений файл має нульовий розмір', {
              fileId,
              localPath
            });
            reject(new Error('Завантажений файл має нульовий розмір'));
            return;
          }

          logger.info('Файл успішно завантажено з Telegram через getFileStream', {
            fileId,
            localPath,
            size: stats.size
          });
          
          resolve(localPath);
        });

        file.on('error', (error) => {
          file.close();
          fs.unlink(localPath, () => {});
          logger.error('Помилка запису файлу', {
            fileId,
            localPath,
            error: error.message
          });
          reject(error);
        });

        stream.on('error', (error) => {
          file.close();
          fs.unlink(localPath, () => {});
          logger.error('Помилка потоку при завантаженні файлу з Telegram', {
            fileId,
            error: error.message
          });
          reject(error);
        });
      } catch (error) {
        logger.error('Помилка отримання потоку файлу з Telegram', {
          fileId,
          error: error.message,
          stack: error.stack
        });
        reject(error);
      }
    });
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

      https.get(url, (response) => {
        // Перевіряємо статус код відповіді
        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(localPath, () => {});
          logger.error(`Помилка завантаження файлу з Telegram: статус ${response.statusCode}`, {
            filePath,
            url,
            statusCode: response.statusCode,
            statusMessage: response.statusMessage
          });
          reject(new Error(`Помилка завантаження файлу: ${response.statusCode} ${response.statusMessage}`));
          return;
        }

        // Перевіряємо Content-Length
        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        let _downloadedBytes = 0;

        response.on('data', (chunk) => {
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
              contentLength
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
              actual: stats.size
            });
          }

          logger.info('Файл успішно завантажено з Telegram', {
            filePath,
            localPath,
            size: stats.size,
            contentLength
          });
          
          resolve(localPath);
        });

        file.on('error', (error) => {
          file.close();
          fs.unlink(localPath, () => {});
          logger.error('Помилка запису файлу', {
            filePath,
            localPath,
            error: error.message
          });
          reject(error);
        });
      }).on('error', (error) => {
        fs.unlink(localPath, () => {}); // Видаляємо файл при помилці
        logger.error('Помилка HTTP запиту при завантаженні файлу з Telegram', {
          filePath,
          url,
          error: error.message
        });
        reject(error);
      });
    });
   }

   // Callback обробники для фото
  async handleAttachPhotoCallback(chatId, _user) {
    await this.sendMessage(chatId, 
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

    await this.sendMessage(chatId, 
      `📎 *Додавання файлу*\n\n` +
      `Надішліть файл, який хочете прикріпити до заявки.\n\n` +
      `📏 *Максимальний розмір:* 50 МБ\n` +
      `📋 *Підтримувані формати:* Всі типи файлів\n\n` +
      `💡 Ви можете додати до 10 файлів (фото + документи разом).`
    );
  }

  async handleSkipPhotoCallback(chatId, _user) {
    const session = this.userSessions.get(chatId);
    if (session) {
      session.ticketData.priority = session.ticketData.priority || 'medium';
      await this.completeTicketCreation(chatId, _user, session);
    }
  }

  async handleAddMorePhotosCallback(chatId, _user) {
    await this.sendMessage(chatId, 
      '📷 Надішліть ще одне фото або натисніть "Завершити" для продовження.'
    );
  }

  async handleFinishTicketCallback(chatId, _user) {
    const session = this.userSessions.get(chatId);
    if (session) {
      session.ticketData.priority = session.ticketData.priority || 'medium';
      await this.completeTicketCreation(chatId, _user, session);
    }
  }

  async handleCancelTicketCallback(chatId, user) {
    // 🆕 Завершуємо AI діалог як "cancelled" перед видаленням сесії
    const session = this.userSessions.get(chatId);
    if (session && session.aiDialogId) {
      await this.completeAIDialog(session.aiDialogId, 'cancelled');
    }
    
    // Видаляємо сесію створення тікету
    this.userSessions.delete(chatId);
    
    // Показуємо головне меню
    await this.showUserDashboard(chatId, user);
  }



  async handleStatisticsCallback(chatId, user) {
    try {
      const totalTickets = await Ticket.countDocuments({ createdBy: user._id });
      const openTickets = await Ticket.countDocuments({ 
        createdBy: user._id, 
        status: 'open'
      });
      const inProgressTickets = await Ticket.countDocuments({ 
        createdBy: user._id, 
        status: 'in_progress'
      });
      const closedTickets = await Ticket.countDocuments({ 
        createdBy: user._id, 
        status: { $in: ['closed', 'resolved'] }
      });
      
      // Статистика за останній місяць
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const ticketsLastMonth = await Ticket.countDocuments({ 
        createdBy: user._id,
        createdAt: { $gte: oneMonthAgo }
      });

      // Середній час закриття тікетів (в днях)
      const closedTicketsWithDates = await Ticket.find({ 
        createdBy: user._id, 
        status: { $in: ['closed', 'resolved'] },
        closedAt: { $exists: true }
      })
        .select('createdAt closedAt')
        .limit(100)
        .lean();
      
      let avgDays = 0;
      if (closedTicketsWithDates.length > 0) {
        const totalDays = closedTicketsWithDates.reduce((sum, ticket) => {
          const days = (new Date(ticket.closedAt) - new Date(ticket.createdAt)) / (1000 * 60 * 60 * 24);
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
          inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]]
        },
        parse_mode: 'Markdown'
      });
    } catch (error) {
      logger.error('Помилка отримання статистики:', error);
      await this.sendMessage(chatId, 
        `❌ *Помилка завантаження статистики*\n\n` +
        `Не вдалося завантажити дані статистики.\n\n` +
        `🔄 Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  /** Перевірка використання токенів OpenAI — тільки для користувача 6070910226. */
  async handleCheckTokensCallback(chatId, user) {
    try {
      const telegramIdStr = String(user?.telegramId ?? user?.telegramChatId ?? chatId);
      if (telegramIdStr !== TelegramService.INTERNET_REQUESTS_EXEMPT_TELEGRAM_ID) {
        await this.sendMessage(chatId, '❌ Ця функція недоступна.');
        return;
      }
      const usage = aiFirstLineService.getTokenUsage();
      const settings = await aiFirstLineService.getAISettings();
      const limit = settings && typeof settings.monthlyTokenLimit === 'number' && settings.monthlyTokenLimit > 0 ? settings.monthlyTokenLimit : 0;
      const monthlyTotal = usage.monthlyTotalTokens || 0;
      let msg =
        `🔢 *Використання токенів AI (OpenAI)*\n\n` +
        `📥 Вхідні (prompt): ${usage.promptTokens.toLocaleString()}\n` +
        `📤 Вихідні (completion): ${usage.completionTokens.toLocaleString()}\n` +
        `📊 Всього (з перезапуску): ${usage.totalTokens.toLocaleString()}\n` +
        `🔄 Запитів: ${usage.requestCount}\n\n` +
        `📅 *Цього місяця (${usage.monthlyMonth || '—'}):* ${monthlyTotal.toLocaleString()} токенів`;
      if (limit > 0) {
        const remaining = Math.max(0, limit - monthlyTotal);
        msg += `\n\n📌 *Ваш місячний ліміт:* ${limit.toLocaleString()}\n` +
          `✅ *Залишилось по квоті:* ${remaining.toLocaleString()} токенів`;
      }
      const topUp = settings && typeof settings.topUpAmount === 'number' && settings.topUpAmount > 0 ? settings.topUpAmount : 0;
      const balance = settings && typeof settings.remainingBalance === 'number' ? settings.remainingBalance : null;
      if (topUp > 0 || (balance !== null && balance >= 0)) {
        msg += '\n\n💰 *По сумі:*';
        if (topUp > 0) msg += ` поповнення $${topUp.toFixed(2)}`;
        if (balance !== null && balance >= 0) msg += (topUp > 0 ? ' |' : '') + ` залишок $${Number(balance).toFixed(2)}`;
      }
      msg += `\n\n_Лічильник сесії — з перезапуску сервера. Місячний — зберігається._`;
      await this.sendMessage(chatId, msg, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Скинути лічильник', callback_data: 'reset_tokens' }],
            [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]
          ]
        }
      });
    } catch (error) {
      logger.error('Помилка handleCheckTokensCallback:', error);
      await this.sendMessage(chatId, 'Виникла помилка при отриманні даних.');
    }
  }

  async handleCheckApiLimitCallback(chatId, user) {
    try {
      const isAdmin = user.role === 'admin' || user.role === 'super_admin' || user.role === 'administrator';
      if (!isAdmin) {
        await this.sendMessage(chatId, 
          `❌ *Доступ заборонено*\n\nЦя функція доступна тільки адміністраторам.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      await this.sendMessage(chatId, 'AI інтеграція вимкнена.', {
        reply_markup: {
          inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]]
        }
      });
    } catch (error) {
      logger.error('Помилка handleCheckApiLimitCallback:', error);
      await this.sendMessage(chatId, 'Виникла помилка.', { parse_mode: 'Markdown' });
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
        inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back' }]]
      },
      parse_mode: 'Markdown'
    });
  }

  async handleStatusCommand(chatId, user) {
    try {
      const openTickets = await Ticket.find({ 
        createdBy: user._id, 
        status: 'open'
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title status createdAt')
        .lean();

      const inProgressTickets = await Ticket.find({ 
        createdBy: user._id, 
        status: 'in_progress'
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title status createdAt')
        .lean();

      let text = `⚡ *Швидкий статус тікетів*\n\n`;

      if (openTickets.length > 0) {
        text += `🔓 *Відкриті тікети (${openTickets.length}):*\n`;
        openTickets.forEach((ticket, index) => {
          const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
          text += `${index + 1}. ${this.truncateButtonText(ticket.title, 40)} - \`${date}\`\n`;
        });
        text += `\n`;
      }

      if (inProgressTickets.length > 0) {
        text += `⚙️ *У роботі (${inProgressTickets.length}):*\n`;
        inProgressTickets.forEach((ticket, index) => {
          const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
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
              { text: '📊 Статистика', callback_data: 'statistics' }
            ],
            [
              { text: '🏠 Головне меню', callback_data: 'back_to_menu' }
            ]
          ]
        },
        parse_mode: 'Markdown'
      });
    } catch (error) {
      logger.error('Помилка отримання статусу тікетів:', error);
      await this.sendMessage(chatId, 
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




   async completeTicketCreation(chatId, user, session) {
    try {
      const validTypes = ['incident', 'request', 'problem', 'change'];
      const ticketType = validTypes.includes(session.ticketData.type) ? session.ticketData.type : 'problem';
      const ticketData = {
        title: session.ticketData.title,
        description: session.ticketData.description,
        priority: session.ticketData.priority,
        createdBy: user._id,
        city: user.city,
        status: 'open',
        ...(session.ticketData.subcategory != null && String(session.ticketData.subcategory).trim() && { subcategory: String(session.ticketData.subcategory).trim().slice(0, 100) }),
        type: ticketType,
        metadata: {
          source: session.mode === 'ai' ? 'telegram_ai' : 'telegram'
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
              caption: photo.caption
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
              '.mov': 'video/quicktime'
            };
            
            const mimeType = mimeTypes[doc.extension.toLowerCase()] || doc.mimeType || 'application/octet-stream';
            
            return {
              filename: path.basename(doc.path),
              originalName: doc.fileName || doc.caption || path.basename(doc.path),
              mimetype: mimeType,
              size: fileSize,
              path: doc.path,
              uploadedBy: user._id,
              caption: doc.caption
            };
          })
        ]
      };

      const ticket = new Ticket(ticketData);
      await ticket.save();

      // Зберігаємо діалог з ботом у тікет та привʼязуємо розмову (для навчання AI)
      if (session.mode === 'ai' && session.dialog_history && session.dialog_history.length > 0) {
        botConversationService.linkTicketAndSaveDialog(chatId, user, ticket._id, session.dialog_history).catch(() => {});
      }

       // Заповнюємо дані для WebSocket сповіщення
       await ticket.populate([
         { path: 'createdBy', select: 'firstName lastName email' },
         { path: 'city', select: 'name region' }
       ]);

      // Відправляємо WebSocket сповіщення про новий тікет
      try {
        ticketWebSocketService.notifyNewTicket(ticket);
        logger.info('✅ WebSocket сповіщення про новий тікет відправлено (Telegram)');
      } catch (wsError) {
        logger.error('❌ Помилка відправки WebSocket сповіщення про новий тікет (Telegram):', wsError);
      }

      // Відправка FCM сповіщення адміністраторам про новий тікет
      try {
        logger.info('📱 Спроба відправки FCM сповіщення адміністраторам про новий тікет (Telegram)');
        const fcmService = require('./fcmService');
        const adminCount = await fcmService.sendToAdmins({
          title: '🎫 Новий тікет',
          body: `Створено новий тікет: ${ticket.title}`,
          type: 'ticket_created',
          data: {
            ticketId: ticket._id.toString(),
            ticketTitle: ticket.title,
            ticketStatus: ticket.status,
            ticketPriority: ticket.priority,
            createdBy: ticket.createdBy?.firstName && ticket.createdBy?.lastName 
              ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}`
              : 'Невідомий користувач'
          }
        });
        logger.info(`✅ FCM сповіщення про новий тікет відправлено ${adminCount} адміністраторам (Telegram)`);
      } catch (error) {
        logger.error('❌ Помилка відправки FCM сповіщення про новий тікет (Telegram):', error);
        logger.error('   Stack:', error.stack);
        // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
      }
      
      // Відправка FCM сповіщення призначеному користувачу (якщо тікет призначено при створенні)
      if (ticket.assignedTo) {
        try {
          const fcmService = require('./fcmService');
          await fcmService.sendToUser(ticket.assignedTo.toString(), {
            title: '🎫 Новий тікет призначено вам',
            body: `Вам призначено тікет: ${ticket.title}`,
            type: 'ticket_assigned',
            data: {
              ticketId: ticket._id.toString(),
              ticketTitle: ticket.title,
              ticketStatus: ticket.status,
              ticketPriority: ticket.priority,
              createdBy: ticket.createdBy?.firstName && ticket.createdBy?.lastName 
                ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}`
                : 'Невідомий користувач'
            }
          });
          logger.info('✅ FCM сповіщення про призначення тікету відправлено користувачу (Telegram)');
        } catch (error) {
          logger.error('❌ Помилка відправки FCM сповіщення про призначення (Telegram):', error);
        }
      }

      // Відправка Telegram сповіщення про новий тікет в групу
      try {
        logger.info('📢 Спроба відправки Telegram сповіщення в групу про новий тікет (Telegram)');
        await this.sendNewTicketNotificationToGroup(ticket, user);
        logger.info('✅ Telegram сповіщення в групу відправлено (Telegram)');
      } catch (error) {
        logger.error('❌ Помилка відправки Telegram сповіщення в групу (Telegram):', error);
        logger.error('   Stack:', error.stack);
        // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
      }

      // 🆕 Завершуємо AI діалог перед очищенням сесії
      if (session.aiDialogId) {
        await this.completeAIDialog(session.aiDialogId, 'ticket_created', ticket._id);
      }
      
      // Очищуємо сесію
      this.userSessions.delete(chatId);

      const confirmText = 
        `🎉 *Тікет успішно створено!*\n` +
        `🆔 \`${ticket._id}\`\n` +
        `⏳ Очікуйте відповідь адміністратора`;

       await this.sendMessage(chatId, confirmText, {
         reply_markup: {
           inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]]
         }
       });

       logger.info(`Тікет створено через Telegram: ${ticket._id} користувачем ${user.email}`);
     } catch (error) {
       logger.error('Помилка створення тікету:', error);
       await this.sendMessage(chatId, 
         `❌ *Помилка створення тікету*\n\n` +
         `Виникла технічна помилка при створенні тікету.\n\n` +
         `🔄 Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
         { parse_mode: 'Markdown' }
       );
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
      
      // Відправляємо повідомлення про відхилення
      let message = 
        `❌ *Запит на посаду відхилено*\n\n` +
        `💼 *Посада:* ${this.escapeMarkdown(positionRequest.title)}\n\n`;

      if (reason) {
        message += `📝 *Причина:* ${this.escapeMarkdown(reason)}\n\n`;
      }

      await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });

      // Якщо є активна реєстрація, показуємо список доступних посад
      if (positionRequest.pendingRegistrationId && userId) {
        const pendingRegistration = await PendingRegistration.findById(positionRequest.pendingRegistrationId);
        
        if (pendingRegistration) {
          // Оновлюємо крок реєстрації на 'position', щоб користувач міг вибрати посаду
          pendingRegistration.step = 'position';
          await pendingRegistration.save();
          
          // Показуємо список доступних посад
          await this.sendPositionSelection(chatId, userId, pendingRegistration);
          
          logger.info('✅ Показано список посад після відхилення запиту', {
            chatId,
            userId,
            requestId: positionRequest._id,
            pendingRegistrationId: pendingRegistration._id
          });
          return;
        }
      }

      // Якщо немає активної реєстрації, просто показуємо повідомлення
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

      // Відправка FCM сповіщення всім адміністраторам
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

      // Створення сповіщення в базі даних для адмін-панелі
      try {
        // Знаходимо всіх активних адміністраторів
        const admins = await User.find({
          role: { $in: ['admin', 'super_admin', 'administrator'] },
          isActive: true
        }).select('_id');

        if (admins.length > 0) {
          const notifications = admins.map(admin => ({
            recipient: admin._id,
            userId: admin._id,
            category: 'system',
            type: 'system_update', // Changed from 'system' to 'system_update' which is valid
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

      // Відправляємо повідомлення кожному адміну особисто
      try {
        // Знаходимо всіх активних адміністраторів з Telegram ID
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

        // Формуємо повідомлення з кнопками для швидкого підтвердження/відхилення
        const message = 
          `📝 *Новий запит на додавання посади*\n\n` +
          `💼 *Посада:* ${this.escapeMarkdown(positionName)}\n` +
          `👤 *Telegram ID:* \`${telegramId}\`\n` +
          `🆔 *ID запиту:* \`${requestId}\`\n\n` +
          `Для додавання посади використайте адмін панель або API.`;

        // Відправляємо кожному адміну
        let sentCount = 0;
        for (const admin of admins) {
          try {
            await this.sendMessage(String(admin.telegramId), message, { 
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { 
                      text: '✅ Додати посаду', 
                      callback_data: `approve_position_${requestId}` 
                    },
                    { 
                      text: '❌ Відхилити', 
                      callback_data: `reject_position_${requestId}` 
                    }
                  ]
                ]
              }
            });
            sentCount++;
            logger.info(`✅ Сповіщення про запит на посаду відправлено адміну ${admin.email}`, {
              adminId: admin._id,
              telegramId: admin.telegramId,
              requestId
            });
          } catch (sendError) {
            logger.error(`❌ Помилка відправки сповіщення адміну ${admin.email}:`, {
              error: sendError.message,
              adminId: admin._id,
              telegramId: admin.telegramId,
              requestId
            });
          }
        }

        logger.info(`✅ Сповіщення про запит на посаду відправлено ${sentCount} з ${admins.length} адмінів`, {
          requestId,
          sentCount,
          totalAdmins: admins.length
        });
      } catch (sendError) {
        logger.error('❌ Помилка відправки сповіщення про запит на посаду адмінам:', {
          error: sendError.message,
          stack: sendError.stack,
          requestId
        });
      }
    } catch (error) {
      logger.error('❌ Помилка відправки сповіщення про запит на посаду:', {
        error: error.message,
        stack: error.stack,
        positionRequestId: positionRequest?._id
      });
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

      // Отримуємо chatId з бази даних (налаштування з адмін панелі)
      let groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
      logger.info('🔍 Перевірка chatId:', {
        fromEnv: !!groupChatId,
        envValue: groupChatId ? 'встановлено' : 'не встановлено'
      });
      
      if (!groupChatId) {
        try {
          logger.info('🔍 Пошук TelegramConfig в базі даних...');
          const telegramConfig = await TelegramConfig.findOne({ key: 'default' });
          logger.info('📋 Результат пошуку TelegramConfig:', {
            found: !!telegramConfig,
            hasChatId: !!(telegramConfig && telegramConfig.chatId),
            chatIdValue: telegramConfig?.chatId ? 'встановлено' : 'не встановлено'
          });
          
          if (telegramConfig && telegramConfig.chatId && telegramConfig.chatId.trim()) {
            groupChatId = telegramConfig.chatId.trim();
            logger.info('✅ ChatId отримано з бази даних:', groupChatId);
          } else {
            logger.warn('⚠️ TelegramConfig знайдено, але chatId порожній або відсутній');
          }
        } catch (configError) {
          logger.error('❌ Помилка отримання TelegramConfig:', {
            error: configError.message,
            stack: configError.stack
          });
        }
      } else {
        logger.info('✅ ChatId отримано з змінної оточення:', groupChatId);
      }

      if (!groupChatId) {
        logger.warn('❌ TELEGRAM_GROUP_CHAT_ID не встановлено (ні в env, ні в БД)');
        logger.warn('💡 Перевірте налаштування в адмін панелі або встановіть змінну оточення');
        return;
      }
      
      logger.info('✅ Використовується groupChatId:', groupChatId);

      logger.info('📋 Заповнення даних тікету...');
      await ticket.populate([
        { path: 'createdBy', select: 'firstName lastName email login telegramId' },
        { path: 'city', select: 'name region' }
      ]);
      logger.info('✅ Дані тікету заповнено', {
        createdBy: ticket.createdBy?._id,
        city: ticket.city?.name
      });

      logger.info('📝 Формування повідомлення...');
      
      const message = 
        `🎫 *Новий тікет створено*\n` +
        `📋 ${ticket.title}\n` +
        `🏙️ ${ticket.city?.name || 'Не вказано'} | 🆔 \`${ticket._id}\``;

      logger.info('📤 Відправка повідомлення в групу...', {
        groupChatId,
        messageLength: message.length,
        messagePreview: message.substring(0, 100)
      });
      
      try {
        const result = await this.sendMessage(groupChatId, message, { parse_mode: 'Markdown' });
        logger.info('✅ Сповіщення про новий тікет відправлено в групу Telegram', {
          groupChatId,
          ticketId: ticket._id,
          messageId: result?.message_id
        });
      } catch (sendError) {
        logger.error('❌ Помилка відправки повідомлення в групу:', {
          error: sendError.message,
          stack: sendError.stack,
          response: sendError.response?.data,
          groupChatId,
          ticketId: ticket._id
        });
        // Не пробуємо відправити без Markdown, якщо помилка парсингу
        if (sendError.message && sendError.message.includes('parse')) {
          logger.info('🔄 Спроба відправки без Markdown...');
          try {
            const plainMessage = message.replace(/\*/g, '').replace(/`/g, '');
            const result = await this.sendMessage(groupChatId, plainMessage);
            logger.info('✅ Сповіщення відправлено без Markdown', {
              groupChatId,
              messageId: result?.message_id
            });
          } catch (plainError) {
            logger.error('❌ Помилка відправки без Markdown:', plainError.message);
            throw plainError;
          }
        } else {
          throw sendError;
        }
      }
    } catch (error) {
      logger.error('❌ Помилка відправки сповіщення про новий тікет в групу:', {
        error: error.message,
        stack: error.stack,
        ticketId: ticket?._id,
        userId: user?._id
      });
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

      // Отримуємо chatId з бази даних (налаштування з адмін панелі)
      let groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
      if (!groupChatId) {
        try {
          const telegramConfig = await TelegramConfig.findOne({ key: 'default' });
          if (telegramConfig && telegramConfig.chatId && telegramConfig.chatId.trim()) {
            groupChatId = telegramConfig.chatId.trim();
            logger.info('✅ ChatId отримано з бази даних для статусу:', groupChatId);
          }
        } catch (configError) {
          logger.error('❌ Помилка отримання TelegramConfig:', configError);
        }
      }

      if (!groupChatId) {
        logger.warn('TELEGRAM_GROUP_CHAT_ID не встановлено (ні в env, ні в БД)');
        return;
      }

      await ticket.populate([
        { path: 'city', select: 'name region' }
      ]);

      // Якщо тікет закривається (closed або resolved), відправляємо спрощене повідомлення
      if (newStatus === 'closed' || newStatus === 'resolved') {
        const message = 
          `🎫 *Тікет виконаний*\n` +
          `📋 ${ticket.title}\n` +
          `🏙️ ${ticket.city?.name || 'Не вказано'} | 🆔 \`${ticket._id}\``;

        await this.sendMessage(groupChatId, message, { parse_mode: 'Markdown' });
        logger.info('✅ Сповіщення про закриття тікету відправлено в групу Telegram');
      } else {
        // Для інших змін статусу відправляємо повне повідомлення (якщо потрібно)
        // Або можна просто не відправляти для інших статусів
        logger.info('ℹ️ Зміна статусу на', newStatus, '- сповіщення в групу не відправляється');
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

      // Завантажуємо тікет з повною інформацією
      await ticket.populate([
        { path: 'createdBy', select: 'firstName lastName email telegramId telegramChatId' }
      ]);

      // Перевіряємо, чи користувач має Telegram ID або Chat ID
      const user = ticket.createdBy;
      if (!user) {
        logger.warn('Користувач, який створив тікет, не знайдений');
        return;
      }

      // Конвертуємо chatId в рядок для сумісності
      const chatId = user.telegramChatId ? String(user.telegramChatId) : (user.telegramId ? String(user.telegramId) : null);
      if (!chatId) {
        logger.info(`Користувач ${user.email} не має Telegram ID для сповіщень`);
        return;
      }

      // Формуємо повідомлення
      const statusText = this.getStatusText(ticket.status);
      const statusEmoji = this.getStatusEmoji(ticket.status);

      let message = '';
      if (type === 'updated') {
        message = 
          `🔄 *Статус тікету змінено*\n` +
          `📋 ${ticket.title}\n` +
          `🆔 \`${ticket._id}\`\n` +
          `\n${statusEmoji} *${statusText}*\n` +
          `⚡ ${this.getPriorityText(ticket.priority)}`;
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
      const user = ticket.createdBy;
      if (!user) {
        logger.warn('Користувач, який створив тікет, не знайдений');
        return;
      }

      // Отримуємо Telegram chat ID
      const chatId = user.telegramChatId ? String(user.telegramChatId) : (user.telegramId ? String(user.telegramId) : null);
      if (!chatId) {
        logger.info(`Користувач ${user.email} не має Telegram ID для SLA сповіщень`);
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
        `${priorityEmoji} *Пріоритет:* ${this.getPriorityText(ticket.priority)}\n` +
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
            [{ text: '💬 Зв\'язатися з підтримкою', url: 'https://t.me/Kultup' }]
          ]
        }
      });

      logger.info(`✅ Попередження про дедлайн відправлено користувачу ${user.email} (залишилось: ${remainingHours}h)`);
    } catch (error) {
      logger.error('Помилка відправки попередження про дедлайн:', error);
    }
  }

  getStatusText(status) {
    const statusMap = {
      'open': 'Відкрито',
      'in_progress': 'В роботі',
      'resolved': 'Вирішено',
      'closed': 'Закрито',
      'pending': 'Очікує'
    };
    return statusMap[status] || status;
  }

  getStatusEmoji(status) {
    const emojiMap = {
      'open': '🔓',
      'in_progress': '⚙️',
      'resolved': '✅',
      'closed': '🔒',
      'pending': '⏳'
    };
    return emojiMap[status] || '📋';
  }

  getPriorityText(priority) {
    const priorityMap = {
      'low': '🟢 Низький',
      'medium': '🟡 Середній',
      'high': '🔴 Високий',
      'urgent': '🔴🔴 Критичний'
    };
    return priorityMap[priority] || priority;
  }

  getCategoryEmoji(category) {
    const categoryMap = {
      'Hardware': '🖥️',
      'Software': '💻',
      'Network': '🌐',
      'Access': '🔐',
      'Other': '📋'
    };
    return categoryMap[category] || '📋';
  }

  getPriorityPromptText() {
    return `⚡ *Оберіть пріоритет тікету*\n` +
      `Пріоритет визначає швидкість обробки вашого запиту.`;
  }

  getCancelButtonText() {
    return '❌ Скасувати';
  }

  formatInstructionsAsList(instructions) {
    if (!instructions || !instructions.trim()) {
      return null;
    }
    
    // Розбиваємо по рядках та фільтруємо порожні
    const lines = instructions.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (lines.length === 0) {
      return null;
    }
    
    // Додаємо нумерацію
    return lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
  }

  /**
   * Обрізає текст кнопки, якщо він перевищує максимальну довжину
   * Telegram має обмеження на довжину тексту кнопки (64 символи)
   * Використовуємо спеціальні Unicode символи для візуального ефекту бігучої строки
   */
  truncateButtonText(text, maxLength = 60) {
    if (!text || typeof text !== 'string') {
      return text;
    }
    
    if (text.length <= maxLength) {
      return text;
    }
    
    // Обрізаємо текст, залишаючи місце для спеціальних символів
    const truncated = text.substring(0, maxLength - 5);
    
    // Використовуємо спеціальні Unicode символи для візуального ефекту бігучої строки
    // ➡️ для вказівки, що текст продовжується (створює ефект руху)
    return truncated + ' ➡️';
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


  async handleUserRegistrationCallback(chatId, userId) {
    try {
      // Перевіряємо, чи користувач вже зареєстрований
      const existingUser = await User.findOne({ 
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId }
        ]
      });
      
      if (existingUser) {
        await this.sendMessage(chatId, 
          `✅ *Ви вже зареєстровані!*\n\n` +
          `Ваш обліковий запис вже існує в системі.\n\n` +
          `Використайте /start для перегляду меню.`
        );
        return;
      }

      // Перевіряємо, чи є активна реєстрація
      let pendingRegistration = await PendingRegistration.findOne({ 
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId }
        ]
      });

      if (!pendingRegistration) {
        // Видаляємо старі незавершені реєстрації для цього користувача
        await PendingRegistration.deleteMany({
          $or: [
            { telegramId: String(userId) },
            { telegramId: userId }
          ]
        });
        
        pendingRegistration = new PendingRegistration({
          telegramId: String(userId),
          telegramChatId: String(chatId),
          step: 'firstName',
          data: {}
        });
        await pendingRegistration.save();
        logger.info('Created new PendingRegistration for user:', userId);
      } else {
        // Якщо є незавершена реєстрація, продовжуємо з того місця, де зупинилися
        logger.info(`Resuming existing registration from step: ${pendingRegistration.step || 'undefined'}`, {
          userId,
          step: pendingRegistration.step,
          data: pendingRegistration.data
        });
        
        // Якщо step відсутній, встановлюємо початковий крок
        if (!pendingRegistration.step) {
          pendingRegistration.step = 'firstName';
          await pendingRegistration.save();
          logger.info('Fixed missing step, set to firstName');
        }
      }

      await this.processRegistrationStep(chatId, userId, pendingRegistration);
    } catch (error) {
      logger.error('Помилка обробки реєстрації:', error);
      await this.sendMessage(chatId, 
        '❌ *Помилка*\n\nВиникла технічна помилка. Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)',
        { parse_mode: 'Markdown' }
      );
    }
  }

  async processRegistrationStep(chatId, userId, pendingRegistration) {
    try {
      const step = pendingRegistration.step;
      
      switch (step) {
        case 'firstName':
          await this.sendMessage(chatId, 
            `📝 <b>Реєстрація в системі</b>\n` +
            `👤 <b>Крок 1/9:</b> Введіть ваше ім'я\n` +
            `💡 Ім'я повинно містити тільки літери та бути довжиною від 2 до 50 символів`,
            { parse_mode: 'HTML' }
          );
          break;
          
        case 'lastName': {
          const firstNameValue = (pendingRegistration.data.firstName || '').replace(/[<>&"]/g, (match) => {
            const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
            return map[match];
          });
          await this.sendMessage(chatId, 
            `✅ <b>Ім'я прийнято!</b>\n` +
            `👤 ${firstNameValue}\n` +
            `\n👤 <b>Крок 2/9:</b> Введіть ваше прізвище\n` +
            `💡 Прізвище повинно містити тільки літери та бути довжиною від 2 до 50 символів`,
            { parse_mode: 'HTML' }
          );
          break;
        }
          
        case 'email': {
          const lastNameValue = (pendingRegistration.data.lastName || '').replace(/[<>&"]/g, (match) => {
            const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
            return map[match];
          });
          await this.sendMessage(chatId, 
            `✅ <b>Прізвище прийнято!</b>\n` +
            `👤 ${lastNameValue}\n` +
            `\n📧 <b>Крок 3/9:</b> Введіть вашу електронну адресу\n` +
            `💡 Приклад: user@example.com`,
            { parse_mode: 'HTML' }
          );
          break;
        }
          
        case 'login': {
          const emailValue = (pendingRegistration.data.email || '').replace(/[<>&"]/g, (match) => {
            const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
            return map[match];
          });
          await this.sendMessage(chatId, 
            `✅ <b>Email прийнято!</b>\n` +
            `📧 ${emailValue}\n` +
            `\n👤 <b>Крок 4/9:</b> Введіть ваш логін\n` +
            `💡 Логін повинен:\n` +
            `• Містити мінімум 3 символи\n` +
            `• Містити максимум 50 символів\n` +
            `• Складатися тільки з латинських літер, цифр та підкреслення\n` +
            `💡 <b>Приклад:</b> my_login123`,
            { parse_mode: 'HTML' }
          );
          break;
        }
          
        case 'phone': {
          const loginValue = (pendingRegistration.data.login || '').replace(/[<>&"]/g, (match) => {
            const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
            return map[match];
          });
          await this.sendMessage(chatId, 
            `✅ <b>Логін прийнято!</b>\n` +
            `👤 ${loginValue}\n` +
            `\n📱 <b>Крок 5/9:</b> Введіть ваш номер телефону\n` +
            `💡 Приклад: +380501234567\n` +
            `Або натисніть кнопку нижче, щоб поділитися номером:`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                keyboard: [
                  [{
                    text: '📱 Поділитися номером',
                    request_contact: true
                  }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            }
          );
          break;
        }
          
        case 'password': {
          const phoneNumber = pendingRegistration.data.phone || '';
          await this.sendMessage(chatId, 
            `✅ <b>Номер телефону прийнято!</b>\n` +
            `📱 ${phoneNumber}\n` +
            `\n🔐 <b>Крок 6/9:</b> Введіть пароль\n` +
            `💡 Пароль повинен містити:\n` +
            `• Мінімум 6 символів\n` +
            `• Принаймні одну літеру\n` +
            `• Принаймні одну цифру\n` +
            `💡 <b>Приклад:</b> MyPass123\n\n` +
            `⚠️ <b>ВАЖЛИВО: Запам'ятайте ваш пароль!</b>\n` +
            `Він знадобиться для входу в систему.`,
            { parse_mode: 'HTML' }
          );
          break;
        }
          
        case 'city':
          await this.sendCitySelection(chatId, userId);
          break;
          
        case 'position':
          await this.sendPositionSelection(chatId, userId, pendingRegistration);
          break;

        case 'institution':
          await this.sendInstitutionSelection(chatId, userId, pendingRegistration);
          break;
          
        case 'completed':
          await this.completeRegistration(chatId, userId, pendingRegistration);
          break;
          
        default:
          await this.sendMessage(chatId, '❌ Помилка в процесі реєстрації. Спробуйте почати заново.');
      }
    } catch (error) {
      logger.error('Помилка обробки кроку реєстрації:', error);
      await this.sendMessage(chatId, 
        '❌ *Помилка*\n\nВиникла технічна помилка. Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)',
        { parse_mode: 'Markdown' }
      );
    }
  }

  async sendCitySelection(chatId, _userId) {
    try {
      const cities = await City.find({ isActive: true })
        .select('name region _id')
        .sort({ name: 1 })
        .limit(50)
        .lean();

      if (cities.length === 0) {
        await this.sendMessage(chatId, 
          `❌ *Немає доступних міст*\n\n` +
          `Зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Отримуємо список міст, які мають заклади
      const cityIds = cities.map(city => city._id);
      const institutionsWithCities = await Institution.find({
        isActive: true,
        isPublic: true,
        'address.city': { $in: cityIds }
      })
        .select('address.city')
        .lean();

      // Створюємо Set з ID міст, які мають заклади
      const citiesWithInstitutions = new Set();
      institutionsWithCities.forEach(inst => {
        if (inst.address && inst.address.city) {
          const cityId = inst.address.city.toString();
          citiesWithInstitutions.add(cityId);
        }
      });

      logger.info('Cities with institutions:', {
        totalCities: cities.length,
        citiesWithInstitutions: citiesWithInstitutions.size,
        cityIds: Array.from(citiesWithInstitutions)
      });

      const keyboard = [];
      cities.forEach(city => {
        const cityIdStr = city._id.toString();
        const hasInstitutions = citiesWithInstitutions.has(cityIdStr);
        // Додаємо іконку закладу, якщо місто має заклади
        const cityText = hasInstitutions 
          ? `🏙️ ${city.name} 🏢`
          : `🏙️ ${city.name}`;
        
        keyboard.push({
          text: cityText,
          callback_data: `city_${city._id}`
        });
      });
      
      // Розбиваємо кнопки міст на рядки по 2
      const cityKeyboard = [];
      for (let i = 0; i < keyboard.length; i += 2) {
        cityKeyboard.push(keyboard.slice(i, i + 2));
      }

      await this.sendMessage(chatId, 
        `✅ *Пароль прийнято!*\n` +
        `🔐 \`********\`\n` +
        `\n🏙️ *Крок 7/9:* Оберіть ваше місто\n` +
        `💡 Міста з іконкою 🏢 мають доступні заклади`,
        {
          reply_markup: {
            inline_keyboard: cityKeyboard
          }
        }
      );
    } catch (error) {
      logger.error('Помилка отримання списку міст:', error);
      await this.sendMessage(chatId, 'Помилка завантаження списку міст. Спробуйте ще раз.');
    }
  }

  async sendPositionSelection(chatId, _userId, pendingRegistration) {
    try {
      const institutionId = pendingRegistration?.data?.institutionId;
      
      // Виключаємо посаду "адміністратор системи"
      const filter = { 
        isActive: true,
        isPublic: true,
        title: {
          $not: {
            $regex: /адміністратор системи|администратор системы|system administrator/i
          }
        }
      };

      // Якщо обрано заклад, показуємо тільки посади, прив'язані до цього закладу
      if (institutionId && mongoose.Types.ObjectId.isValid(institutionId)) {
        filter.institutions = new mongoose.Types.ObjectId(institutionId);
      }

      let positions = await Position.find(filter)
        .select('title')
        .sort({ title: 1 })
        .limit(50)
        .lean();

      // Якщо для закладу немає прив'язаних посад, показуємо всі публічні посади
      if (positions.length === 0 && institutionId) {
        logger.info('No positions found for institution, showing all public positions');
        const allFilter = { 
          isActive: true,
          isPublic: true,
          title: {
            $not: {
              $regex: /адміністратор системи|администратор системы|system administrator/i
            }
          }
        };
        positions = await Position.find(allFilter)
          .select('title')
          .sort({ title: 1 })
          .limit(50)
          .lean();
      }

      if (positions.length === 0) {
        await this.sendMessage(chatId, 
          `❌ *Немає доступних посад*\n\n` +
          `Зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const keyboard = [];
      positions.forEach(position => {
        keyboard.push([{
          text: `💼 ${position.title || position.name}`,
          callback_data: `position_${position._id}`
        }]);
      });


      const institutionMessage = institutionId ? '\n🏢 Показано посади для обраного закладу' : '';
      
      await this.sendMessage(chatId, 
        `✅ *Заклад обрано!*\n` +
        `🏢 Заклад вибрано${institutionMessage}\n` +
        `\n💼 *Крок 9/9:* Оберіть вашу посаду`,
        {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
    } catch (error) {
      logger.error('Помилка отримання списку посад:', error);
      await this.sendMessage(chatId, 'Помилка завантаження списку посад. Спробуйте ще раз.');
    }
  }

  async sendInstitutionSelection(chatId, userId, pendingRegistration) {
    try {
      const cityId = pendingRegistration.data.cityId;
      
      logger.info('sendInstitutionSelection called:', {
        userId,
        cityId,
        cityIdType: typeof cityId,
        hasCityId: !!cityId
      });
      
      // Отримуємо заклади для вибраного міста (якщо місто вибрано)
      const filter = { isActive: true, isPublic: true };
      if (cityId) {
        // Конвертуємо cityId в ObjectId, якщо це рядок
        if (mongoose.Types.ObjectId.isValid(cityId)) {
          filter['address.city'] = new mongoose.Types.ObjectId(cityId);
        } else {
          filter['address.city'] = cityId;
        }
      }
      
      logger.info('Institution filter:', filter);
      
      const institutions = await Institution.find(filter)
        .select('name type address.city')
        .sort({ name: 1 })
        .limit(50)
        .lean();

      logger.info('Found institutions:', {
        count: institutions.length,
        cityId: cityId,
        institutions: institutions.map(i => ({ name: i.name, city: i.address?.city }))
      });

      const keyboard = [];
      
      // Додаємо заклади до клавіатури
      if (institutions.length > 0) {
        institutions.forEach(institution => {
          keyboard.push([{
            text: `🏢 ${institution.name}${institution.type ? ` (${institution.type})` : ''}`,
            callback_data: `institution_${institution._id}`
          }]);
        });
      }
      
      // Додаємо кнопку "Пропустити" в кінці
      keyboard.push([{
        text: '⏭️ Пропустити (необов\'язково)',
        callback_data: 'skip_institution'
      }]);

      let messageText = `✅ *Місто обрано!*\n` +
        `🏙️ Місто вибрано\n` +
        `\n🏢 *Крок 8/9:* Оберіть заклад (необов'язково)`;
      
      if (institutions.length === 0 && cityId) {
        messageText += `\n⚠️ Немає доступних закладів для вибраного міста`;
        messageText += `\n💡 Ви можете пропустити цей крок та перейти до вибору посади.`;
      } else {
        messageText += `\n💡 Ви можете пропустити цей крок, якщо не працюєте в конкретному закладі.`;
      }

      await this.sendMessage(chatId, messageText, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (error) {
      logger.error('Помилка отримання списку закладів:', {
        error: error.message,
        stack: error.stack,
        userId,
        cityId: pendingRegistration.data.cityId
      });
      // Якщо помилка, пропускаємо крок закладу
      pendingRegistration.data.institutionId = null;
      pendingRegistration.step = 'completed';
      await pendingRegistration.save();
      await this.completeRegistration(chatId, userId, pendingRegistration);
    }
  }

  async handleRegistrationCallback(chatId, userId, data) {
    try {
      logger.info('handleRegistrationCallback called:', { userId, data, chatId });
      
      const pendingRegistration = await PendingRegistration.findOne({ 
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId }
        ]
      });

      if (!pendingRegistration) {
        logger.warn('PendingRegistration not found for userId:', userId);
        await this.sendMessage(chatId, 'Ви не в процесі реєстрації. Використайте /start для початку.');
        return;
      }

      logger.info('PendingRegistration found:', { 
        step: pendingRegistration.step, 
        hasData: !!pendingRegistration.data 
      });

      if (data.startsWith('city_')) {
        const cityId = data.replace('city_', '');
        pendingRegistration.data.cityId = cityId;
        pendingRegistration.step = 'institution'; // Спочатку показуємо заклади, потім посаду
        await pendingRegistration.save();
        logger.info('City selected:', { 
          cityId, 
          step: pendingRegistration.step, 
          hasCityId: !!pendingRegistration.data.cityId,
          dataKeys: Object.keys(pendingRegistration.data || {})
        });
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
      } else if (data.startsWith('position_')) {
        const positionId = data.replace('position_', '');
        logger.info('Position selected:', positionId);
        
        // Валідація: перевіряємо, чи positionId є валідним ObjectId
        if (!mongoose.Types.ObjectId.isValid(positionId)) {
          logger.error('Invalid positionId:', positionId);
          await this.sendMessage(chatId, '❌ Помилка: невалідний ідентифікатор посади. Спробуйте ще раз.');
          return;
        }
        
        pendingRegistration.data.positionId = positionId;
        pendingRegistration.step = 'completed'; // Після вибору посади завершуємо реєстрацію
        await pendingRegistration.save();
        logger.info('Position selected:', { 
          positionId, 
          step: pendingRegistration.step,
          hasCityId: !!pendingRegistration.data.cityId,
          cityId: pendingRegistration.data.cityId,
          hasPositionId: !!pendingRegistration.data.positionId,
          dataKeys: Object.keys(pendingRegistration.data || {})
        });
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
      } else if (data.startsWith('institution_')) {
        const institutionId = data.replace('institution_', '');
        pendingRegistration.data.institutionId = institutionId;
        pendingRegistration.step = 'position'; // Після вибору закладу показуємо посади
        await pendingRegistration.save();
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
      } else if (data === 'skip_institution') {
        pendingRegistration.data.institutionId = null;
        pendingRegistration.step = 'position'; // Після пропуску закладу показуємо посади
        await pendingRegistration.save();
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
      }
    } catch (error) {
      logger.error('Помилка обробки callback реєстрації:', error);
      await this.sendMessage(chatId, 'Помилка обробки вибору. Спробуйте ще раз.');
    }
  }

  async completeRegistration(chatId, userId, pendingRegistration) {
    try {
      const axios = require('axios');
      
      // Логуємо поточний стан даних перед деструктуризацією
      logger.info('completeRegistration called:', {
        step: pendingRegistration.step,
        dataKeys: Object.keys(pendingRegistration.data || {}),
        hasCityId: !!pendingRegistration.data?.cityId,
        cityId: pendingRegistration.data?.cityId,
        hasPositionId: !!pendingRegistration.data?.positionId,
        positionId: pendingRegistration.data?.positionId,
        fullData: JSON.stringify(pendingRegistration.data)
      });
      
      const { firstName, lastName, email, login, phone, password, cityId, positionId, institutionId } = pendingRegistration.data || {};

      // Перевіряємо обов'язкові поля перед реєстрацією
      if (!login) {
        logger.warn('Login not provided, returning to login step', {
          userId,
          step: pendingRegistration.step,
          dataKeys: Object.keys(pendingRegistration.data || {})
        });
        pendingRegistration.step = 'login';
        await pendingRegistration.save();
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
        return;
      }

      if (!cityId) {
        logger.warn('City not selected, returning to city selection step', {
          userId,
          step: pendingRegistration.step,
          dataKeys: Object.keys(pendingRegistration.data || {})
        });
        pendingRegistration.step = 'city';
        await pendingRegistration.save();
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
        return;
      }

      if (!positionId) {
        logger.warn('Position not selected, returning to position selection step', {
          userId,
          step: pendingRegistration.step,
          hasCityId: !!cityId
        });
        pendingRegistration.step = 'position';
        await pendingRegistration.save();
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
        return;
      }

      // Використовуємо API endpoint для реєстрації, як у мобільному додатку
      const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:5000/api';
      const registerData = {
        email: email.toLowerCase().trim(),
        login: login.toLowerCase().trim(),
        password: password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        position: positionId,
        department: (pendingRegistration.data.department || '').trim() || 'Не вказано', // Відділ не обов'язковий в боті
        city: cityId,
        phone: phone ? phone.trim() : undefined,
        telegramId: String(userId),
        institution: institutionId || undefined
      };
      
      logger.info('Registering user with data:', {
        email: registerData.email,
        hasCity: !!registerData.city,
        city: registerData.city,
        hasPosition: !!registerData.position,
        position: registerData.position,
        hasInstitution: !!registerData.institution,
        institution: registerData.institution
      });
      
      logger.info('Registering user with data:', {
        email: registerData.email,
        hasCity: !!registerData.city,
        hasPosition: !!registerData.position,
        hasInstitution: !!registerData.institution
      });

      try {
        const response = await axios.post(`${apiBaseUrl}/auth/register`, registerData);
        
        if (response.data.success) {
          // Видаляємо тимчасову реєстрацію
          await PendingRegistration.deleteOne({ _id: pendingRegistration._id });

          await this.sendMessage(chatId, 
            `🎉 *Реєстрація завершена!*\n` +
            `✅ Ваш обліковий запис створено\n` +
            `\n⏳ *Очікуйте підтвердження*\n` +
            `Ваша заявка на реєстрацію буде розглянута адміністратором.\n` +
            `Після підтвердження ви зможете використовувати всі функції бота.\n\n` +
            `📞 Адміністратор: [@Kultup](https://t.me/Kultup)`,
            { parse_mode: 'Markdown' }
          );

          logger.info(`Нова реєстрація через Telegram: ${email} (${userId})`);
        } else {
          throw new Error(response.data.message || 'Помилка реєстрації');
        }
      } catch (apiError) {
        const errorMessage = apiError.response?.data?.message || apiError.message || 'Помилка реєстрації';
        logger.error('Помилка API реєстрації:', apiError);
        await this.sendMessage(chatId, 
          `❌ *Помилка реєстрації*\n\n${errorMessage}\n\nСпробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Помилка завершення реєстрації:', error);
      await this.sendMessage(chatId, 
        '❌ *Помилка*\n\nВиникла технічна помилка при завершенні реєстрації. Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)',
        { parse_mode: 'Markdown' }
      );
    }
  }

  async askForPassword(chatId) {
      await this.sendMessage(chatId, 
        `🔐 <b>Крок 6/9:</b> Введіть пароль\n` +
        `💡 Пароль повинен містити:\n` +
        `• Мінімум 6 символів\n` +
        `• Принаймні одну літеру\n` +
        `• Принаймні одну цифру\n` +
        `💡 <b>Приклад:</b> MyPass123\n` +
        `⚠️ <b>ВАЖЛИВО: Запам'ятайте ваш пароль!</b> Він знадобиться для входу в систему.`,
      { parse_mode: 'HTML' }
    );
  }

  async handleUserLoginCallback(chatId, userId, callbackQuery = null) {
    try {
      // Перевіряємо, чи користувач вже зареєстрований
      const existingUser = await User.findOne({ 
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId }
        ]
      });
      
      if (existingUser) {
        await this.sendMessage(chatId, 
          `✅ *Ви вже авторизовані!*\n` +
          `Ваш обліковий запис вже підключено до Telegram\n` +
          `Використайте /start для перегляду меню`
        );
        return;
      }

      // Створюємо сесію для авторизації
      const usernameFromMsg = callbackQuery?.from?.username
        ? callbackQuery.from.username.replace(/^@/, '').toLowerCase()
        : null;
      
      const session = {
        type: 'login',
        step: 'login',
        data: {
          username: usernameFromMsg
        }
      };
      this.userSessions.set(chatId, session);

      await this.sendMessage(chatId, 
        `🔐 *Авторизація в системі*\n` +
        `📝 *Крок 1/2:* Введіть ваш логін\n` +
        `💡 Введіть логін, який ви використовуєте для входу в систему`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Скасувати', callback_data: 'cancel_login' }]
            ]
          }
        }
      );
    } catch (error) {
      logger.error('Помилка обробки авторизації:', error);
      await this.sendMessage(chatId, 
        '❌ *Помилка*\n\nВиникла технічна помилка. Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)',
        { parse_mode: 'Markdown' }
      );
    }
  }

  async handleLoginTextInput(chatId, userId, text, session, msg = null) {
    try {
      const step = session.step;
      let isValid = true;
      let errorMessage = '';

      // Оновлюємо username з повідомлення, якщо він є
      if (msg?.from?.username && !session.data.username) {
        session.data.username = msg.from.username.replace(/^@/, '').toLowerCase();
      }

      switch (step) {
        case 'login':
          if (text && text.trim().length >= 3) {
            session.data.login = text.trim().toLowerCase();
            session.step = 'password';
            await this.sendMessage(chatId, 
              `✅ *Логін прийнято!*\n` +
              `👤 \`${session.data.login}\`\n` +
              `\n🔐 *Крок 2/2:* Введіть ваш пароль\n` +
              `💡 Введіть пароль для входу в систему`
            );
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректний логін*\n\nЛогін повинен містити мінімум 3 символи.\n\n💡 Спробуйте ще раз:';
          }
          break;

        case 'password':
          if (text && text.length >= 6) {
            session.data.password = text;
            await this.completeLogin(chatId, userId, session);
            return;
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректний пароль*\n\nПароль повинен містити мінімум 6 символів.\n\n💡 Спробуйте ще раз:';
          }
          break;

        default:
          await this.sendMessage(chatId, '❌ Помилка в процесі авторизації. Спробуйте почати заново.');
          this.userSessions.delete(chatId);
          return;
      }

      if (!isValid) {
        await this.sendMessage(chatId, errorMessage);
      }
    } catch (error) {
      logger.error('Помилка обробки введення авторизації:', error);
      await this.sendMessage(chatId, 
        '❌ *Помилка*\n\nВиникла технічна помилка. Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)',
        { parse_mode: 'Markdown' }
      );
      this.userSessions.delete(chatId);
    }
  }

  async completeLogin(chatId, userId, session) {
    try {
      const { login, password } = session.data;
      const userIdString = String(userId);
      const chatIdString = String(chatId);

      // Шукаємо користувача за логіном
      const user = await User.findOne({ login: login.toLowerCase() })
        .select('+password')
        .populate('position', 'name')
        .populate('city', 'name');

      if (!user) {
        await this.sendMessage(chatId, 
          `❌ *Помилка авторизації*\n` +
          `Користувача з таким логіном не знайдено\n` +
          `💡 Перевірте правильність логіну та спробуйте ще раз`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Спробувати ще раз', callback_data: 'login_user' }],
                [{ text: '📝 Зареєструватися', callback_data: 'register_user' }]
              ]
            }
          }
        );
        this.userSessions.delete(chatId);
        return;
      }

      // Перевірка активності акаунта
      if (!user.isActive) {
        await this.sendMessage(chatId, 
          `🚫 *Доступ обмежено*\n\n` +
          `Ваш обліковий запис деактивовано.\n\n` +
          `📞 Зверніться до адміністратора для активації: [@Kultup](https://t.me/Kultup)`,
          { parse_mode: 'Markdown' }
        );
        this.userSessions.delete(chatId);
        return;
      }

      // Перевірка статусу реєстрації
      if (user.registrationStatus === 'pending') {
        await this.sendMessage(chatId, 
          `⏳ *Очікування підтвердження*\n\n` +
          `Ваша реєстрація очікує підтвердження адміністратора.\n\n` +
          `📞 Зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
          { parse_mode: 'Markdown' }
        );
        this.userSessions.delete(chatId);
        return;
      }

      // Перевірка пароля
      const isPasswordValid = await user.comparePassword(password);

      if (!isPasswordValid) {
        await this.sendMessage(chatId, 
          `❌ *Помилка авторизації*\n\n` +
          `Невірний пароль.\n\n` +
          `💡 Перевірте правильність пароля та спробуйте ще раз.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Спробувати ще раз', callback_data: 'login_user' }]
              ]
            }
          }
        );
        this.userSessions.delete(chatId);
        return;
      }

      // Оновлюємо дані Telegram для користувача
      user.telegramId = userIdString;
      user.telegramChatId = chatIdString;
      if (session.data.username) {
        user.telegramUsername = session.data.username;
      }
      user.lastLogin = new Date();
      await user.save();

      // Перезавантажуємо користувача з populate після збереження
      const updatedUser = await User.findById(user._id)
        .populate('position', 'name')
        .populate('city', 'name');

      // Очищуємо сесію
      this.userSessions.delete(chatId);

      logger.info('✅ Користувач успішно авторизований через Telegram:', {
        userId: updatedUser._id,
        email: updatedUser.email,
        login: updatedUser.login,
        telegramId: updatedUser.telegramId
      });

      await this.sendMessage(chatId, 
        `✅ *Авторизація успішна!*\n` +
        `🎉 Вітаємо, ${updatedUser.firstName}!\n` +
        `Ваш обліковий запис успішно підключено до Telegram бота`
      );

      // Показуємо dashboard
      await this.showUserDashboard(chatId, updatedUser);
    } catch (error) {
      logger.error('Помилка завершення авторизації:', error);
      await this.sendMessage(chatId, 
        '❌ *Помилка*\n\nВиникла технічна помилка при авторизації. Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)',
        { parse_mode: 'Markdown' }
      );
      this.userSessions.delete(chatId);
    }
  }

  handleFeedbackMessage(_chatId, _text, _user) {
    // Placeholder for feedback handling
    // This can be implemented based on your requirements
    return false;
  }

  /**
   * Встановити активний тікет для користувача (для обробки відповідей)
   */
  /**
   * Обробка callback для підтвердження/відхилення запиту на посаду
   */
  async handlePositionRequestCallback(callbackQuery) {
    try {
      const data = callbackQuery.data;
      const userId = callbackQuery.from.id;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;

      // Перевіряємо, чи користувач є адміністратором
      const user = await User.findOne({
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId }
        ]
      });

      if (!user || user.role !== 'admin') {
        await this.answerCallbackQuery(callbackQuery.id, 'Тільки адміністратори можуть обробляти запити на посади');
        return;
      }

      if (data.startsWith('approve_position_')) {
        const requestId = data.replace('approve_position_', '');
        const positionRequest = await PositionRequest.findById(requestId)
          .populate('pendingRegistrationId');

        if (!positionRequest) {
          await this.answerCallbackQuery(callbackQuery.id, 'Запит не знайдено');
          return;
        }

        if (positionRequest.status !== 'pending') {
          await this.answerCallbackQuery(callbackQuery.id, 'Запит вже оброблено');
          return;
        }

        // Перевіряємо, чи посада з такою назвою вже існує
        const existingPosition = await Position.findOne({ 
          title: { $regex: new RegExp(`^${positionRequest.title}$`, 'i') }
        });

        let createdPosition;
        if (existingPosition) {
          createdPosition = existingPosition;
          logger.info(`Посада "${positionRequest.title}" вже існує, використовуємо існуючу`);
        } else {
          // Створюємо нову посаду
          createdPosition = new Position({
            title: positionRequest.title,
            department: 'Загальний',
            isActive: true,
            isPublic: true,
            createdBy: user._id
          });
          await createdPosition.save();
          logger.info(`Створено нову посаду: ${createdPosition.title}`);
        }

        // Оновлюємо запит
        positionRequest.status = 'approved';
        positionRequest.approvedBy = user._id;
        positionRequest.approvedAt = new Date();
        positionRequest.createdPositionId = createdPosition._id;
        await positionRequest.save();

        // Відправляємо сповіщення користувачу
        await this.notifyUserAboutPositionApproval(positionRequest, createdPosition);


        await this.answerCallbackQuery(callbackQuery.id, 'Посаду додано успішно');
        // Оновлюємо повідомлення
        await this.bot.editMessageText(
          `✅ *Посаду додано!*\n\n` +
          `💼 ${createdPosition.title}\n` +
          `👤 Підтверджено: ${user.firstName} ${user.lastName}`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
          }
        );
      } else if (data.startsWith('reject_position_')) {
        const requestId = data.replace('reject_position_', '');
        const positionRequest = await PositionRequest.findById(requestId);

        if (!positionRequest) {
          await this.answerCallbackQuery(callbackQuery.id, 'Запит не знайдено');
          return;
        }

        if (positionRequest.status !== 'pending') {
          await this.answerCallbackQuery(callbackQuery.id, 'Запит вже оброблено');
          return;
        }

        // Оновлюємо запит
        positionRequest.status = 'rejected';
        positionRequest.rejectedBy = user._id;
        positionRequest.rejectedAt = new Date();
        positionRequest.rejectionReason = 'Відхилено адміністратором';
        await positionRequest.save();

        // Відправляємо сповіщення користувачу
        await this.notifyUserAboutPositionRejection(positionRequest, positionRequest.rejectionReason);

        await this.answerCallbackQuery(callbackQuery.id, 'Запит відхилено');
        // Оновлюємо повідомлення
        await this.bot.editMessageText(
          `❌ *Запит відхилено*\n\n` +
          `💼 ${positionRequest.title}\n` +
          `👤 Відхилено: ${user.firstName} ${user.lastName}`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
          }
        );
      }
    } catch (error) {
      logger.error('Помилка обробки callback запиту на посаду:', error);
      await this.answerCallbackQuery(callbackQuery.id, 'Виникла помилка');
    }
  }

  // Обробка голосових повідомлень (AI інтеграція вимкнена)
  /**
   * Обробка голосового повідомлення: завантаження → транскрипція (Whisper) → обробка як текст (AI/тікет).
   */
  async handleVoice(msg, user) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    if (!msg.voice?.file_id) {
      await this.sendMessage(chatId, 'Не вдалося отримати голосове повідомлення. Спробуйте ще раз або опишіть проблему текстом.');
      return;
    }
    await this.sendTyping(chatId);
    let localPath;
    try {
      localPath = await this.downloadTelegramFileByFileId(msg.voice.file_id, '.ogg');
    } catch (err) {
      logger.error('Помилка завантаження голосового файлу', { err: err.message });
      await this.sendMessage(chatId, 'Не вдалося завантажити голосове. Спробуйте надіслати текстом або /create для створення заявки.');
      return;
    }
    let text = null;
    try {
      text = await aiFirstLineService.transcribeVoiceToText(localPath);
    } finally {
      try {
        if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
      } catch (_) {}
    }
    if (!text || String(text).trim().length === 0) {
      await this.sendMessage(chatId, 'Не вдалося розпізнати мову. Напишіть, будь ласка, проблему текстом або спробуйте ще раз записати голосове.');
      return;
    }
    const syntheticMsg = {
      chat: msg.chat,
      from: msg.from || { id: userId },
      text: text.trim()
    };
    await this.handleTextMessage(syntheticMsg);
  }

  async showPrioritySelection(chatId, _session) {
    const keyboard = [
      [
        { text: '🟢 Низький', callback_data: 'priority_low' },
        { text: '🟡 Середній', callback_data: 'priority_medium' }
      ],
      [
        { text: '🔴 Високий', callback_data: 'priority_high' },
        { text: '🔥 Критичний', callback_data: 'priority_urgent' }
      ],
      [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
    ];

    await this.sendMessage(chatId, 
      `⚡ *Крок 4/4:* Оберіть пріоритет`, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      }
    );
  }

  async handleAIChat(msg, user) {
    const chatId = msg.chat.id;
    await this.sendMessage(chatId, 'Для створення заявки використайте команду /create.');
    await this.showUserDashboard(chatId, user);
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
      await this.handleMyTicketsCallback(chatId, user);
    } else if (previousScreen === 'ticket_history') {
      await this.handleTicketHistoryCallback(chatId, user);
    } else if (previousScreen === 'statistics') {
      await this.handleStatisticsCallback(chatId, user);
    } else if (previousScreen && previousScreen.startsWith('view_ticket_')) {
      const ticketId = previousScreen.replace('view_ticket_', '');
      await this.handleViewTicketCallback(chatId, user, ticketId);
    } else {
      // Якщо не вдалося визначити попередній екран, повертаємося до головного меню
      this.clearNavigationHistory(chatId);
      await this.showUserDashboard(chatId, user);
    }
  }

  // ═══════════════════════════════════════════════════════════
  async createAIDialog() {
    return null;
  }

  async addMessageToAIDialog() {
    return null;
  }

  async completeAIDialog() {
    return null;
  }

  async findActiveAIDialog() {
    return null;
  }
}

module.exports = TelegramService;
