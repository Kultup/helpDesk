const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const City = require('../models/City');
const Position = require('../models/Position');
const Institution = require('../models/Institution');
const PendingRegistration = require('../models/PendingRegistration');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const https = require('https');
const Category = require('../models/Category');
const BotSettings = require('../models/BotSettings');
const TelegramConfig = require('../models/TelegramConfig');
const { formatFileSize } = require('../utils/helpers');
const ticketWebSocketService = require('./ticketWebSocketService');

class TelegramService {
  constructor() {
    this.bot = null;
    this.isInitialized = false; // Додаємо флаг ініціалізації
    this.userSessions = new Map();
    this.userStates = new Map();
    this.stateStack = new Map();
    this.categoryCache = new Map(); // Кеш для категорій
    this.botSettings = null; // Налаштування бота з БД
    this.mode = 'webhook';
    this.loadCategories(); // Завантажуємо категорії при ініціалізації
    this.loadBotSettings(); // Завантажуємо налаштування бота
  }

  async initialize() {
    try {
      let cfg = null;
      try {
        cfg = await TelegramConfig.findOne({ key: 'default' });
      } catch (e) {}
      const token = (cfg?.botToken && cfg.botToken.trim()) || process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        logger.error('TELEGRAM_BOT_TOKEN не встановлено');
        this.isInitialized = false;
        return;
      }

      const hasWebhookUrl = !!(cfg?.webhookUrl && cfg.webhookUrl.trim());
      const usePolling = !hasWebhookUrl;
      this.mode = usePolling ? 'polling' : 'webhook';
      this.bot = new TelegramBot(token, usePolling ? { polling: { interval: 1000, params: { timeout: 10 } } } : { polling: false });
      if (usePolling) {
        this.bot.on('message', (msg) => this.handleMessage(msg));
        this.bot.on('callback_query', (cq) => this.handleCallbackQuery(cq));
        this.bot.on('polling_error', (err) => {
          logger.error('Помилка polling:', err);
        });
        logger.info('✅ Telegram бот запущено у режимі polling');
      } else {
        logger.info('✅ Telegram бот запущено у режимі webhook');
      }
      this.isInitialized = true;

      try {
        await this.loadBotSettings();
        await this.loadCategories();
      } catch (catErr) {
        logger.warn('⚠️ Не вдалося оновити категорії після ініціалізації:', catErr);
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

      const message = `Реєстрацію підтверджено`;

      await this.sendMessage(String(user.telegramId), message);

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

  async sendMessage(chatId, text, options = {}) {
    if (!this.bot) {
      logger.error('Telegram бот не ініціалізовано');
      return;
    }
    const defaultOptions = { parse_mode: 'Markdown', ...options };
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
        // Обробка фото для зареєстрованих користувачів
        if (msg.photo) {
          await this.handlePhoto(msg);
          return;
        }

        // Обробка контактів для зареєстрованих користувачів
        if (msg.contact) {
          await this.handleContact(msg);
          return;
        }

        // Якщо це не команда, показуємо головне меню або обробляємо повідомлення
        if (!msg.text?.startsWith('/')) {
          // Перевіряємо, чи є активна сесія для створення тікету
          const session = this.userSessions.get(chatId);
          if (session) {
            await this.handleTextMessage(msg);
            return;
          }
          // Якщо немає активної сесії, показуємо головне меню
          await this.showUserDashboard(chatId, existingUser);
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
                  [{ text: '🔐 Авторизуватися', callback_data: 'login_user' }],
                [{ text: '📝 Зареєструватися', callback_data: 'register_user' }],
                [{ text: '📞 Зв\'язатися з адміністратором', url: 'https://t.me/Kultup' }]
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
    // Перезавантажуємо користувача з populate, якщо дані не завантажені
    if (!user.position || !user.city || typeof user.position === 'string' || typeof user.city === 'string') {
      user = await User.findById(user._id)
        .populate('position', 'title')
        .populate('city', 'name');
    }
    
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Не вказано';
    const positionName = (user.position && typeof user.position === 'object' ? user.position.title : user.position) || 'Не вказано';
    const cityName = (user.city && typeof user.city === 'object' ? user.city.name : user.city) || 'Не вказано';
    
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
          { text: '📜 Історія тікетів', callback_data: 'ticket_history' }
        ],
        [
          { text: '📊 Статистика', callback_data: 'statistics' }
        ]
      ]
    };

    await this.sendMessage(chatId, welcomeText, { reply_markup: keyboard });
  }

  async handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const chatType = callbackQuery.message.chat.type;

    // Заборона обробки callback-запитів з груп - тільки приватні чати
    if (chatType !== 'private') {
      logger.info(`Callback query ігноровано - не приватний чат (тип: ${chatType})`, {
        chatId,
        userId,
        data,
        chatType
      });
      await this.answerCallbackQuery(callbackQuery.id, 'Бот працює тільки в приватних чатах');
      return; // Ігноруємо callback-запити з груп, супергруп та каналів
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
        await this.handleMyTicketsCallback(chatId, user);
      } else if (data === 'ticket_history') {
        await this.handleTicketHistoryCallback(chatId, user);
      } else if (data.startsWith('view_ticket_')) {
        const ticketId = data.replace('view_ticket_', '');
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
        await this.handleStatisticsCallback(chatId, user);
      } else if (data === 'back') {
        await this.showUserDashboard(chatId, user);
      } else if (data.startsWith('rate_ticket_')) {
        const parts = data.split('_');
        const ticketId = parts[2];
        const rating = parseInt(parts[3], 10);
        await this.handleRateTicketCallback(chatId, user, ticketId, rating);
        await this.answerCallbackQuery(callbackQuery.id, 'Дякуємо за оцінку');
      } else if (data === 'attach_photo') {
        await this.handleAttachPhotoCallback(chatId, user);
      } else if (data === 'skip_photo') {
        await this.handleSkipPhotoCallback(chatId, user);
      } else if (data === 'add_more_photos') {
        await this.handleAddMorePhotosCallback(chatId, user);
      } else if (data === 'finish_ticket') {
        await this.handleFinishTicketCallback(chatId, user);
      } else if (data === 'cancel_ticket') {
        await this.handleCancelTicketCallback(chatId, user);
        await this.answerCallbackQuery(callbackQuery.id);
      } else if (data.startsWith('category_')) {
        const categoryId = data.replace('category_', '');
        await this.handleDynamicCategoryCallback(chatId, user, categoryId);
      } else if (data === 'priority_low') {
           await this.handlePriorityCallback(chatId, user, 'low');
         } else if (data === 'priority_medium') {
           await this.handlePriorityCallback(chatId, user, 'medium');
         } else if (data === 'priority_high') {
           await this.handlePriorityCallback(chatId, user, 'high');
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
            inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back' }]]
          }
        });
        return;
      }

      let text = `📋 *Ваші тікети*\n`;
      
      const keyboard = [];

      tickets.forEach((ticket, index) => {
        const emoji = this.getStatusEmoji(ticket.status);
        const statusText = this.getStatusText(ticket.status);
        const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const title = this.truncateButtonText(ticket.title, 50);
        text += `\n${index + 1}. ${emoji} *${title}* — ${statusText}, \`${date}\``;
        keyboard.push([{ text: '🔎 Деталі', callback_data: `view_ticket_${ticket._id}` }]);
      });
      keyboard.push([{ text: '🏠 Головне меню', callback_data: 'back' }]);

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
        .populate('category', 'name')
        .lean();

      if (tickets.length === 0) {
        await this.sendMessage(chatId, 
          `📜 *Історія тікетів*\n` +
          `📄 У вас поки що немає тікетів\n` +
          `💡 Створіть новий тікет для отримання допомоги`, {
          reply_markup: {
            inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back' }]]
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
        keyboard.push([{
          text: this.truncateButtonText(`🔄 Повторити: ${ticket.title}`, 50),
          callback_data: `recreate_ticket_${ticket._id}`
        }]);
      });

      text += `\n\n💡 Натисніть кнопку, щоб створити новий тікет на основі попереднього`;
      
      keyboard.push([{ text: '🏠 Головне меню', callback_data: 'back' }]);

      await this.sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: keyboard },
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
        .populate('category', 'name')
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
          categoryId: originalTicket.category?._id || originalTicket.category || null,
          photos: [],
          isRecreated: true,
          originalTicketId: ticketId
        }
      };
      
      this.userSessions.set(chatId, session);

      // Показуємо форму з заповненими даними
      let message = 
        `🔄 *Повторне створення тікету*\n` +
        `📋 *Заголовок:* \`${originalTicket.title}\`\n` +
        `📝 *Опис:* \`${originalTicket.description || 'Без опису'}\`\n` +
        `\n✏️ Ви можете змінити заголовок або описати нову проблему\n` +
        `📋 *Крок 1/4:* Введіть заголовок тікету\n` +
        `💡 Опишіть коротко суть проблеми`;

      await this.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Використати попередній заголовок', callback_data: 'use_previous_title' }],
            [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
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
      const ticket = await Ticket.findById(ticketId)
        .populate('city', 'name')
        .populate('category', 'name')
        .lean();

      if (!ticket) {
        await this.sendMessage(chatId,
          `❌ *Тікет не знайдено*\n\n` +
          `Оригінальний тікет не знайдено в системі.`
        );
        return;
      }

      if (String(ticket.createdBy) !== String(user._id)) {
        await this.sendMessage(chatId,
          `❌ *Доступ заборонено*\n\n` +
          `Цей тікет не належить вам.`
        );
        return;
      }

      const statusEmoji = this.getStatusEmoji(ticket.status);
      const statusText = this.getStatusText(ticket.status);
      const date = new Date(ticket.createdAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const priorityText = this.getPriorityText(ticket.priority);

      const message =
        `🎫 *Деталі тікету*\n` +
        `📋 ${ticket.title}\n` +
        `📊 ${statusEmoji} ${statusText} | ⚡ ${priorityText}\n` +
        `🏙️ ${ticket.city?.name || 'Не вказано'} | 📅 \`${date}\`\n` +
        `🆔 \`${ticket._id}\``;

      await this.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: this.truncateButtonText(`🔄 Повторити: ${ticket.title}`, 50), callback_data: `recreate_ticket_${ticket._id}` }],
            [{ text: '🏠 Головне меню', callback_data: 'back' }]
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
      const user = await User.findById(ticket.createdBy).select('telegramId firstName lastName email');
      if (!user || !user.telegramId) {
        return;
      }

      const emoji = this.getStatusEmoji(ticket.status);
      const statusText = this.getStatusText(ticket.status);
      const title = this.truncateButtonText(ticket.title, 60);
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

      const stars = '★★★★★'.slice(0, ticket.qualityRating.rating);
      await this.sendMessage(chatId, `✅ *Дякуємо за вашу оцінку!*\n\nВаша оцінка: ${stars}`);
    } catch (error) {
      logger.error('Помилка обробки оцінки якості:', error);
      await this.sendMessage(chatId, `❌ *Помилка збереження оцінки*`);
    }
  }

  async handleUsePreviousTitleCallback(chatId, user) {
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
              [{ text: '✅ Використати попередній опис', callback_data: 'use_previous_description' }],
              [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
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

  async handleUsePreviousDescriptionCallback(chatId, user) {
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
      session.step = 'photo';
      
      await this.sendMessage(chatId,
        `✅ *Опис використано*\n` +
        `📝 ${session.ticketData.description.substring(0, 100)}${session.ticketData.description.length > 100 ? '...' : ''}\n` +
        `\n📷 *Крок 3/4:* Прикріпіть фото (необов'язково)\n` +
        `💡 Ви можете прикріпити фото для кращого опису проблеми`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📷 Прикріпити фото', callback_data: 'attach_photo' }],
              [{ text: '⏭️ Пропустити', callback_data: 'skip_photo' }],
              [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
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

  async handleCreateTicketCallback(chatId, user) {
    const session = {
      step: 'title',
      ticketData: {
        createdBy: user._id,
        photos: []
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
        case 'firstName':
          if (this.validateName(text)) {
            pendingRegistration.data.firstName = text.trim();
            pendingRegistration.step = 'lastName';
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректне ім\'я*\n\nІм\'я повинно містити тільки літери та бути довжиною від 2 до 50 символів.\n\n💡 Спробуйте ще раз:';
          }
          break;

        case 'lastName':
          if (this.validateName(text)) {
            pendingRegistration.data.lastName = text.trim();
            pendingRegistration.step = 'email';
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректне прізвище*\n\nПрізвище повинно містити тільки літери та бути довжиною від 2 до 50 символів.\n\n💡 Спробуйте ще раз:';
          }
          break;

        case 'email':
          if (this.validateEmail(text)) {
            // Перевіряємо, чи email вже не використовується
            const existingUser = await User.findOne({ email: text.toLowerCase().trim() });
            if (existingUser) {
              isValid = false;
              errorMessage = '❌ *Email вже використовується*\n\nКористувач з таким email вже зареєстрований в системі.\n\n💡 Введіть інший email:';
            } else {
              pendingRegistration.data.email = text.toLowerCase().trim();
              pendingRegistration.step = 'login';
            }
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректний email*\n\nВведіть коректну електронну адресу.\n\n💡 *Приклад:* user@example.com\n\nСпробуйте ще раз:';
          }
          break;

        case 'login':
          if (this.validateLogin(text)) {
            const normalizedLogin = text.trim().toLowerCase();
            // Перевіряємо, чи логін вже не використовується
            const existingUser = await User.findOne({ login: normalizedLogin });
            if (existingUser) {
              isValid = false;
              errorMessage = '❌ *Логін вже використовується*\n\nКористувач з таким логіном вже зареєстрований в системі.\n\n💡 Введіть інший логін:';
            } else {
              pendingRegistration.data.login = normalizedLogin;
              pendingRegistration.step = 'phone';
            }
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректний логін*\n\nЛогін повинен:\n• Містити мінімум 3 символи\n• Містити максимум 50 символів\n• Складатися тільки з латинських літер, цифр та підкреслення\n\n💡 *Приклад:* my_login123\n\nСпробуйте ще раз:';
          }
          break;

        case 'phone':
          if (this.validatePhone(text)) {
            pendingRegistration.data.phone = text.trim();
            pendingRegistration.step = 'password';
            // Приховуємо клавіатуру після успішного введення номера
            await this.sendMessage(chatId, 
              `✅ <b>Номер телефону прийнято!</b>\n` +
              `📱 ${text.trim()}`,
              {
                parse_mode: 'HTML',
                reply_markup: {
                  remove_keyboard: true
                }
              }
            );
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректний номер телефону*\n\nНомер повинен містити від 10 до 15 цифр та може починатися з +.\n\n💡 *Приклад:* +380501234567\n\nСпробуйте ще раз:';
          }
          break;

        case 'password':
          if (this.validatePassword(text)) {
            pendingRegistration.data.password = text; // В реальному проекті потрібно хешувати
            pendingRegistration.step = 'city';
          } else {
            isValid = false;
            errorMessage = '❌ *Слабкий пароль*\n\nПароль повинен містити:\n• Мінімум 6 символів\n• Принаймні одну літеру\n• Принаймні одну цифру\n\n💡 *Приклад:* MyPass123\n\nСпробуйте ще раз:';
          }
          break;

        case 'department':
          if (this.validateDepartment(text)) {
            pendingRegistration.data.department = text.trim();
            pendingRegistration.step = 'completed';
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректна назва відділу*\n\nНазва відділу повинна бути довжиною від 2 до 100 символів.\n\n💡 Спробуйте ще раз:';
          }
          break;

        default:
          await this.sendMessage(chatId, '❌ Помилка в процесі реєстрації. Спробуйте почати заново.');
          return;
      }

      if (isValid) {
        await pendingRegistration.save();
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
      } else {
        await this.sendMessage(chatId, errorMessage);
      }

    } catch (error) {
      logger.error('Помилка обробки реєстраційного введення:', error);
      await this.sendMessage(chatId, 
        '❌ *Помилка*\n\nВиникла технічна помилка. Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)',
        { parse_mode: 'Markdown' }
      );
    }
  }

  // Методи валідації
  validateName(name) {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    return trimmed.length >= 2 && trimmed.length <= 50 && /^[a-zA-Zа-яА-ЯіІїЇєЄ''\s-]+$/.test(trimmed);
  }

  validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  validateLogin(login) {
    if (!login || typeof login !== 'string') return false;
    const trimmed = login.trim();
    // Мінімум 3 символи, максимум 50, тільки латиниця, цифри та підкреслення
    return trimmed.length >= 3 && trimmed.length <= 50 && /^[a-zA-Z0-9_]+$/.test(trimmed);
  }

  validatePhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const phoneRegex = /^\+?[1-9]\d{9,14}$/;
    return phoneRegex.test(phone.replace(/[\s-()]/g, ''));
  }

  validatePassword(password) {
    if (!password || typeof password !== 'string') return false;
    return password.length >= 6 && /[a-zA-Zа-яА-ЯіІїЇєЄ]/.test(password) && /\d/.test(password);
  }

  validateDepartment(department) {
    if (!department || typeof department !== 'string') return false;
    const trimmed = department.trim();
    return trimmed.length >= 2 && trimmed.length <= 100;
  }

  async handleTicketCreationStep(chatId, text, session) {
    try {
      switch (session.step) {
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
          session.step = 'photo';
          await this.sendMessage(chatId, 
            'Крок 3/4: Прикріпіть фото (необов\'язково)\n\n' +
            'Ви можете прикріпити фото для кращого опису проблеми.', {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📷 Прикріпити фото', callback_data: 'attach_photo' }],
                  [{ text: '⏭️ Пропустити', callback_data: 'skip_photo' }],
                  [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
                ]
              }
            }
          );
          break;

        case 'category':
           // Логіка для категорії - пропущено, не використовується
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

  async handleTicketPhoto(chatId, photos, caption) {
     try {
       const session = this.userSessions.get(chatId);
       if (!session) return;

       // Беремо найбільше фото
       const photo = photos[photos.length - 1];
       const fileId = photo.file_id;

       // Перевіряємо розмір фото
       const file = await this.bot.getFile(fileId);
       const fileSizeBytes = file.file_size;
       const maxSizeBytes = 20 * 1024 * 1024; // 20MB

       if (fileSizeBytes > maxSizeBytes) {
         await this.sendMessage(chatId, 
           `❌ Фото занадто велике!\n\n` +
           `Розмір: ${formatFileSize(fileSizeBytes)}\n` +
      `Максимальний розмір: ${formatFileSize(maxSizeBytes)}\n\n` +
           `Будь ласка, надішліть фото меншого розміру.`
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
       const savedPath = await this.downloadTelegramFile(filePath);
       
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
                 [{ text: '📷 Додати ще фото', callback_data: 'add_more_photos' }],
                 [{ text: '✅ Завершити', callback_data: 'finish_ticket' }],
                 [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
               ]
             }
           }
         );
     } catch (error) {
       logger.error('Помилка обробки фото:', error);
       await this.sendMessage(chatId, 'Помилка обробки фото. Спробуйте ще раз.');
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

  async downloadTelegramFile(filePath) {
    return new Promise((resolve, reject) => {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
      
      // Створюємо папку для фото якщо не існує
      const uploadsDir = path.join(__dirname, '../uploads/telegram-photos');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const fileName = `${Date.now()}_${path.basename(filePath)}`;
      const localPath = path.join(uploadsDir, fileName);
      const file = fs.createWriteStream(localPath);

      https.get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(localPath);
        });
      }).on('error', (error) => {
        fs.unlink(localPath, () => {}); // Видаляємо файл при помилці
        reject(error);
      });
    });
   }

   // Callback обробники для фото
  async handleAttachPhotoCallback(chatId, user) {
    await this.sendMessage(chatId, 
      '📷 Надішліть фото для прикріплення до тікету.\n\n' +
      'Ви можете додати підпис до фото для додаткової інформації.'
    );
  }

  async handleSkipPhotoCallback(chatId, user) {
    const session = this.userSessions.get(chatId);
    if (session) {
      // Пропускаємо вибір категорії, переходимо одразу на пріоритет
      session.step = 'priority';
      session.ticketData.categoryId = null; // Категорія не обов'язкова
      
      await this.sendMessage(chatId, 
        this.getPriorityPromptText(), {
          reply_markup: {
            inline_keyboard: [
              [{ text: this.getPriorityText('high'), callback_data: 'priority_high' }],
              [{ text: this.getPriorityText('medium'), callback_data: 'priority_medium' }],
              [{ text: this.getPriorityText('low'), callback_data: 'priority_low' }],
              [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
            ]
          }
        }
      );
    }
  }

  async handleAddMorePhotosCallback(chatId, user) {
    await this.sendMessage(chatId, 
      '📷 Надішліть ще одне фото або натисніть "Завершити" для продовження.'
    );
  }

  async handleFinishTicketCallback(chatId, user) {
    const session = this.userSessions.get(chatId);
    if (session) {
      // Пропускаємо вибір категорії, переходимо одразу на пріоритет
      session.step = 'priority';
      session.ticketData.categoryId = null; // Категорія не обов'язкова
      
      await this.sendMessage(chatId, 
        this.getPriorityPromptText(), {
          reply_markup: {
            inline_keyboard: [
              [{ text: this.getPriorityText('high'), callback_data: 'priority_high' }],
              [{ text: this.getPriorityText('medium'), callback_data: 'priority_medium' }],
              [{ text: this.getPriorityText('low'), callback_data: 'priority_low' }],
              [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
            ]
          }
        }
      );
    }
  }

  async handleCancelTicketCallback(chatId, user) {
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
        status: { $in: ['open', 'in_progress'] } 
      });
      const closedTickets = await Ticket.countDocuments({ 
        createdBy: user._id, 
        status: { $in: ['closed', 'resolved'] }
      });

      const text = 
        `📊 *Ваша статистика*\n` +
        `📋 Всього: \`${totalTickets}\` | 🔓 Відкритих: \`${openTickets}\` | ✅ Закритих: \`${closedTickets}\``;

      await this.sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back' }]]
        }
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

  async answerCallbackQuery(callbackQueryId, text = '') {
    try {
      await this.bot.answerCallbackQuery(callbackQueryId, { text });
    } catch (error) {
      logger.error('Помилка відповіді на callback query:', error);
    }
  }


  // Обробники для категорій та пріоритетів
   async handleCategoryCallback(chatId, user, categoryId) {
     const session = this.userSessions.get(chatId);
     if (session) {
       session.ticketData.categoryId = categoryId;
       session.step = 'priority';
       
       await this.sendMessage(chatId, 
         this.getPriorityPromptText(), {
           reply_markup: {
             inline_keyboard: [
               [{ text: this.getPriorityText('high'), callback_data: 'priority_high' }],
               [{ text: this.getPriorityText('medium'), callback_data: 'priority_medium' }],
               [{ text: this.getPriorityText('low'), callback_data: 'priority_low' }],
               [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
             ]
           }
         }
       );
     }
   }

   async handlePriorityCallback(chatId, user, priority) {
     const session = this.userSessions.get(chatId);
     if (session) {
       session.ticketData.priority = priority;
       await this.completeTicketCreation(chatId, user, session);
     }
   }

   async completeTicketCreation(chatId, user, session) {
     try {
       // Якщо категорія не вказана, використовуємо дефолтну або першу доступну
       let categoryId = session.ticketData.categoryId;
       if (!categoryId) {
         // Шукаємо першу активну категорію як дефолтну
         const defaultCategory = await Category.findOne({ isActive: true }).sort({ name: 1 });
         if (defaultCategory) {
           categoryId = defaultCategory._id;
         }
       }
       
       const ticketData = {
         title: session.ticketData.title,
         description: session.ticketData.description,
         category: categoryId,
         priority: session.ticketData.priority,
         createdBy: user._id,
         city: user.city,
         status: 'open',
         metadata: {
           source: 'telegram'
         },
         attachments: session.ticketData.photos.map(photo => {
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
         })
       };

       const ticket = new Ticket(ticketData);
       await ticket.save();

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

      // Очищуємо сесію
      this.userSessions.delete(chatId);

      let confirmText = 
        `🎉 *Тікет успішно створено!*\n` +
        `🆔 \`${ticket._id}\`\n` +
        `⏳ Очікуйте відповідь адміністратора`;

       await this.sendMessage(chatId, confirmText, {
         reply_markup: {
           inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back' }]]
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

  async getCategoryText(categoryId) {
    try {
      if (typeof categoryId === 'string' && categoryId.length === 24) {
        // ObjectId – шукаємо в БД та використовуємо icon, якщо задано
        const category = await Category.findById(categoryId);
        if (!category) return 'Невідома категорія';
        const icon = category.icon && category.icon.trim() !== '' ? category.icon : '';
        return icon ? `${icon} ${category.name}` : category.name;
      }

      // Підтримка старого формату: шукаємо категорію за назвою
      const byName = await Category.findByName(categoryId);
      if (byName) {
        const icon = byName.icon && byName.icon.trim() !== '' ? byName.icon : '';
        return icon ? `${icon} ${byName.name}` : byName.name;
      }

      return 'Невідома категорія';
    } catch (error) {
      logger.error('Помилка отримання тексту категорії:', error);
      return 'Невідома категорія';
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
        { path: 'city', select: 'name region' },
        { path: 'category', select: 'name' }
      ]);
      logger.info('✅ Дані тікету заповнено', {
        createdBy: ticket.createdBy?._id,
        city: ticket.city?.name,
        category: ticket.category?.name
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
        userId: user?._id,
        groupChatId: typeof groupChatId !== 'undefined' ? groupChatId : 'не встановлено'
      });
    }
  }

  /**
   * Відправка сповіщення про зміну статусу тікету в групу
   */
  async sendTicketStatusNotificationToGroup(ticket, previousStatus, newStatus, changedBy) {
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
        { path: 'createdBy', select: 'firstName lastName email telegramId telegramChatId' },
        { path: 'category', select: 'name' }
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

  getCategoryPromptText() {
    return `🏷️ *Оберіть категорію тікету*\n` +
      `Категорія допоможе швидше обробити ваш запит.`;
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

  async generateCategoryButtons() {
    try {
      const categories = this.getAllCategories();
      const buttons = [];
      
      // Якщо категорій немає, повертаємо порожній масив
      if (!categories || categories.length === 0) {
        logger.warn('Немає категорій для відображення');
        return buttons;
      }
      
      // Групуємо категорії по дві в рядку для кращого відображення
      for (let i = 0; i < categories.length; i += 2) {
        const row = [];
        
        // Перша категорія в рядку
        const category1 = categories[i];
        if (category1 && category1._id) {
          const icon1 = category1.icon && category1.icon.trim() !== '' ? category1.icon : '';
          const text1 = icon1 ? `${icon1} ${category1.name}` : category1.name;
          // Обмежуємо довжину тексту кнопки (Telegram має обмеження)
          const buttonText1 = this.truncateButtonText(text1, 30);
          row.push({
            text: buttonText1,
            callback_data: `category_${category1._id}`
          });
        }
        
        // Друга категорія в рядку (якщо є)
        const category2 = categories[i + 1];
        if (category2 && category2._id) {
          const icon2 = category2.icon && category2.icon.trim() !== '' ? category2.icon : '';
          const text2 = icon2 ? `${icon2} ${category2.name}` : category2.name;
          // Обмежуємо довжину тексту кнопки (Telegram має обмеження)
          const buttonText2 = this.truncateButtonText(text2, 30);
          row.push({
            text: buttonText2,
            callback_data: `category_${category2._id}`
          });
        }
        
        if (row.length > 0) {
          buttons.push(row);
        }
      }
      
      logger.debug(`Згенеровано ${buttons.length} рядків кнопок категорій`);
      return buttons;
    } catch (error) {
      logger.error('Помилка генерації кнопок категорій:', error);
      return [];
    }
  }

  getAllCategories() {
    return Array.from(this.categoryCache.values());
  }

  async loadCategories() {
    try {
      const categories = await Category.find({ isActive: true })
        .select('name icon color')
        .sort({ name: 1 })
        .lean();
      
      this.categoryCache.clear();
      categories.forEach(cat => {
        this.categoryCache.set(cat._id.toString(), cat);
      });
      
      logger.debug(`Завантажено ${categories.length} категорій в кеш`);
    } catch (error) {
      logger.error('Помилка завантаження категорій:', error);
    }
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

  async handleDynamicCategoryCallback(chatId, user, categoryId) {
    const session = this.userSessions.get(chatId);
    if (session) {
      session.ticketData.categoryId = categoryId;
      session.step = 'priority';
      await this.sendMessage(chatId, 
        this.getPriorityPromptText(), {
          reply_markup: {
            inline_keyboard: [
              [{ text: this.getPriorityText('high'), callback_data: 'priority_high' }],
              [{ text: this.getPriorityText('medium'), callback_data: 'priority_medium' }],
              [{ text: this.getPriorityText('low'), callback_data: 'priority_low' }],
              [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
            ]
          }
        }
      );
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
        logger.info('Resuming existing registration from step:', pendingRegistration.step);
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
          
        case 'lastName':
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
          
        case 'email':
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
          
        case 'login':
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
          
        case 'phone':
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
          
        case 'password':
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
          
        case 'city':
          await this.sendCitySelection(chatId, userId);
          break;
          
        case 'position':
          await this.sendPositionSelection(chatId, userId);
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

  async sendCitySelection(chatId, userId) {
    try {
      const cities = await City.find({ isActive: true })
        .select('name region')
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

      const keyboard = [];
      cities.forEach(city => {
        keyboard.push([{
          text: `🏙️ ${city.name}${city.region ? ` (${city.region})` : ''}`,
          callback_data: `city_${city._id}`
        }]);
      });

      await this.sendMessage(chatId, 
        `✅ *Пароль прийнято!*\n` +
        `🔐 \`********\`\n` +
        `\n🏙️ *Крок 7/9:* Оберіть ваше місто`,
        {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
    } catch (error) {
      logger.error('Помилка отримання списку міст:', error);
      await this.sendMessage(chatId, 'Помилка завантаження списку міст. Спробуйте ще раз.');
    }
  }

  async sendPositionSelection(chatId, userId) {
    try {
      // Виключаємо посаду "адміністратор системи"
      const positions = await Position.find({ 
        isActive: true,
        title: {
          $not: {
            $regex: /адміністратор системи|администратор системы|system administrator/i
          }
        }
      })
        .select('title')
        .sort({ title: 1 })
        .limit(50)
        .lean();

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

      await this.sendMessage(chatId, 
        `✅ *Місто обрано!*\n` +
        `💼 *Крок 8/9:* Оберіть вашу посаду`,
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
      const mongoose = require('mongoose');
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
      
      let institutions = await Institution.find(filter)
        .select('name type address.city')
        .sort({ name: 1 })
        .limit(50)
        .lean();

      logger.info('Found institutions:', {
        count: institutions.length,
        cityId: cityId,
        institutions: institutions.map(i => ({ name: i.name, city: i.address?.city }))
      });
      
      // Якщо для вибраного міста немає закладів, показуємо всі публічні заклади
      if (institutions.length === 0 && cityId) {
        logger.info('No institutions found for city, showing all public institutions');
        institutions = await Institution.find({ isActive: true, isPublic: true })
          .select('name type address.city')
          .sort({ name: 1 })
          .limit(50)
          .lean();
        logger.info('Found all public institutions:', {
          count: institutions.length
        });
      }

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

      let messageText = `✅ *Посада обрана!*\n` +
        `💼 ${pendingRegistration.data.positionId ? 'Обрано' : 'Не обрано'}\n` +
        `\n🏢 *Крок 9/9:* Оберіть заклад (необов'язково)`;
      
      if (institutions.length === 0) {
        messageText += `\n⚠️ Немає доступних закладів для вибраного міста`;
      }
      
      messageText += `\n💡 Ви можете пропустити цей крок, якщо не працюєте в конкретному закладі.`;

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
        pendingRegistration.step = 'position';
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
        pendingRegistration.data.positionId = positionId;
        pendingRegistration.step = 'institution';
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
        pendingRegistration.step = 'completed';
        await pendingRegistration.save();
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
      } else if (data === 'skip_institution') {
        pendingRegistration.data.institutionId = null;
        pendingRegistration.step = 'completed';
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
            `\n⏳ *Очікуйте активації*\n` +
            `Ваш обліковий запис потребує активації адміністратором\n` +
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
      const bcrypt = require('bcryptjs');
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

  async handleFeedbackMessage(chatId, text, user) {
    // Placeholder for feedback handling
    // This can be implemented based on your requirements
    return false;
  }
}

module.exports = TelegramService;
