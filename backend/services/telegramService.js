const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const City = require('../models/City');
const Position = require('../models/Position');
const TicketTemplate = require('../models/TicketTemplate');
const PendingRegistration = require('../models/PendingRegistration');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const https = require('https');
const Category = require('../models/Category');
const BotSettings = require('../models/BotSettings');
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
    this.loadCategories(); // Завантажуємо категорії при ініціалізації
    this.loadBotSettings(); // Завантажуємо налаштування бота
  }

  async initialize() {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        logger.error('TELEGRAM_BOT_TOKEN не встановлено');
        this.isInitialized = false;
        return;
      }

      this.bot = new TelegramBot(token, { polling: false });
      this.isInitialized = true; // Встановлюємо флаг після успішної ініціалізації
      logger.info('✅ Telegram бот ініціалізовано');

      // Оновлюємо кеш категорій після ініціалізації бота
      try {
        await this.loadBotSettings();
        await this.loadCategories();
        logger.info('✅ Категорії оновлено після ініціалізації');
      } catch (catErr) {
        logger.warn('⚠️ Не вдалося оновити категорії після ініціалізації:', catErr);
      }
    } catch (error) {
      logger.error('Помилка ініціалізації Telegram бота:', error);
      this.isInitialized = false;
    }
  }

  async sendMessage(chatId, text, options = {}) {
    try {
      if (!this.bot) {
        logger.error('Telegram бот не ініціалізовано');
        return;
      }
      // Додаємо підтримку Markdown форматування за замовчуванням
      const defaultOptions = { parse_mode: 'Markdown', ...options };
      logger.debug(`Відправляю повідомлення в чат ${chatId}`, { text: text?.substring(0, 50) });
      const result = await this.bot.sendMessage(chatId, text, defaultOptions);
      logger.debug(`Повідомлення успішно відправлено в чат ${chatId}`, { messageId: result.message_id });
      return result;
    } catch (error) {
      logger.error('Помилка відправки повідомлення:', {
        chatId,
        error: error.message,
        stack: error.stack,
        response: error.response?.data
      });
      throw error;
    }
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
      
      logger.info(`Отримано повідомлення від користувача ${userId} в чаті ${chatId}`, {
        text: msg.text?.substring(0, 100),
        hasPhoto: !!msg.photo,
        hasContact: !!msg.contact
      });

      // Перевірка, чи користувач вже зареєстрований
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
          `🚫 *Доступ обмежено*\n\n` +
          `👋 Вітаємо! Для використання бота потрібно зареєструватися в системі.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📞 *Зверніться до адміністратора для отримання доступу:* [@Kultup](https://t.me/Kultup)`,
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
        .populate('position', 'name')
        .populate('city', 'name');
    }
    
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Не вказано';
    const positionName = (user.position && typeof user.position === 'object' ? user.position.name : user.position) || 'Не вказано';
    const cityName = (user.city && typeof user.city === 'object' ? user.city.name : user.city) || 'Не вказано';
    
    const welcomeText = 
      `🎉 *Вітаємо в системі підтримки!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👤 *Профіль користувача:*\n` +
      `👤 Ім'я: *${fullName}*\n` +
      `📧 Email: \`${user.email}\`\n` +
      `💼 Посада: *${positionName}*\n` +
      `🏙️ Місто: *${cityName}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🎯 *Оберіть дію:*`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📝 Створити тікет', callback_data: 'create_ticket' },
          { text: '📋 Мої тікети', callback_data: 'my_tickets' }
        ],
        [
          { text: '📄 Створити з шаблону', callback_data: 'create_from_template' },
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

    try {
      logger.info('Обробка callback query:', { userId, data, chatId, messageId });

      // Спочатку перевіряємо, чи користувач вже зареєстрований
      // Конвертуємо userId в рядок для пошуку
      const user = await User.findOne({ 
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId }
        ]
      })
        .populate('position', 'name')
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
      } else if (data === 'create_ticket') {
        await this.handleCreateTicketCallback(chatId, user);
      } else if (data === 'create_from_template') {
        await this.handleCreateFromTemplateCallback(chatId, user);
      } else if (data === 'statistics') {
        await this.handleStatisticsCallback(chatId, user);
      } else if (data === 'back') {
        await this.showUserDashboard(chatId, user);
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
         } else if (data === 'template_add_photo') {
          await this.handleTemplateAddPhotoCallback(chatId, user);
        } else if (data === 'template_create_without_photo') {
          await this.handleTemplateCreateWithoutPhotoCallback(chatId, user);
        } else if (data.startsWith('template_helped_')) {
           const templateId = data.replace('template_helped_', '');
           await this.handleTemplateHelpedCallback(chatId, user, templateId);
           await this.answerCallbackQuery(callbackQuery.id);
        } else if (data.startsWith('template_send_ticket_')) {
           const templateId = data.replace('template_send_ticket_', '');
           await this.handleTemplateSendTicketCallback(chatId, user, templateId);
           await this.answerCallbackQuery(callbackQuery.id);
        } else if (data.startsWith('template_')) {
           const templateId = data.replace('template_', '');
           await this.handleTemplateSelectionCallback(chatId, user, templateId);
        } else if (data === 'create_from_template') {
          await this.handleCreateFromTemplateCallback(chatId, user);
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

      // Обробка callback-запитів для реєстрації (вибір міста та посади)
      if (data.startsWith('city_') || data.startsWith('position_')) {
        logger.info('Виявлено callback для реєстрації (місто/посада):', { userId, data });
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
          `📋 *Мої тікети*\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📄 У вас поки що немає тікетів\n\n` +
          `💡 Створіть новий тікет, щоб отримати допомогу!`, {
          reply_markup: {
            inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back' }]]
          }
        });
        return;
      }

      let text = 
        `📋 *Ваші тікети*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      const keyboard = [];

      tickets.forEach((ticket, index) => {
        const status = this.getStatusEmoji(ticket.status);
        text += `${index + 1}. ${status} *${ticket.title}*\n`;
        text += `   📊 Статус: *${this.getStatusText(ticket.status)}*\n`;
        text += `   📅 Створено: \`${ticket.createdAt.toLocaleDateString('uk-UA')}\`\n\n`;
        
        keyboard.push([{
          text: `📄 ${ticket.title.substring(0, 30)}...`,
          callback_data: `view_ticket_${ticket._id}`
        }]);
      });

      text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
      keyboard.push([{ text: '🏠 Головне меню', callback_data: 'back' }]);

      await this.sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (error) {
      logger.error('Помилка отримання тікетів:', error);
      await this.sendMessage(chatId, 
        `❌ *Помилка завантаження тікетів*\n\n` +
        `Не вдалося завантажити список тікетів.\n\n` +
        `🔄 Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
        { parse_mode: 'Markdown' }
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
      `📝 *Створення нового тікету*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📋 *Крок 1/5:* Введіть заголовок тікету\n\n` +
      `💡 Опишіть коротко суть проблеми`, {
        reply_markup: {
          inline_keyboard: [[{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]]
        }
      }
    );
  }

  async handleCreateFromTemplateCallback(chatId, user) {
    try {
      // Створюємо або відновлюємо сесію для шаблонного потоку
      let session = this.userSessions.get(chatId);
      if (!session) {
        session = {
          step: 'template_select',
          ticketData: {
            title: '',
            description: '',
            priority: 'medium',
            categoryId: null,
            photos: []
          },
          isTemplate: true
        };
        this.userSessions.set(chatId, session);
      }

      // Отримуємо шаблони для Telegram
      const templates = await TicketTemplate.find({ isActive: true })
        .populate('category', 'name icon color')
        .sort({ title: 1 })
        .limit(10)
        .lean();

      if (templates.length === 0) {
        await this.sendMessage(chatId, 
          `❌ *Немає доступних шаблонів*\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📋 Наразі немає активних шаблонів тікетів\n\n` +
          `👨‍💼 Зверніться до адміністратора для створення шаблонів: [@Kultup](https://t.me/Kultup)`, {
          parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back' }]]
            }
          }
        );
        return;
      }

      // Збираємо всі category IDs для одного запиту (якщо populate не спрацював)
      const categoryIds = new Set();
      templates.forEach(template => {
        if (template.category && typeof template.category === 'object' && !template.category.name && template.category._id) {
          categoryIds.add(template.category._id.toString());
        } else if (!template.category || (typeof template.category === 'object' && !template.category.name)) {
          // Якщо category - це ObjectId рядок
          const catId = typeof template.category === 'string' ? template.category : (template.category?._id?.toString() || null);
          if (catId) {
            categoryIds.add(catId);
          }
        }
      });

      // Завантажуємо категорії одним запитом, якщо є такі, що не популюються
      const categoriesMap = new Map();
      if (categoryIds.size > 0) {
        const categories = await Category.find({ _id: { $in: Array.from(categoryIds).map(id => new mongoose.Types.ObjectId(id)) } })
          .select('name icon color')
          .lean();
        categories.forEach(cat => {
          categoriesMap.set(cat._id.toString(), cat);
        });
      }

      let text = 
        `📄 *Оберіть шаблон для створення тікету*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      const keyboard = [];

      for (const [index, template] of templates.entries()) {
        text += `${index + 1}. 📋 *${template.title}*\n`;
        if (template.description) {
          text += `   📝 ${template.description.substring(0, 50)}...\n`;
        }
        // Перевіряємо чи існує категорія та чи вона популюється
        let categoryText = 'Невідома категорія';
        if (template.category) {
          // Якщо категорія вже популюється з полями name, icon, color
          if (template.category.name) {
            const icon = template.category.icon && template.category.icon.trim() !== '' ? template.category.icon : '';
            categoryText = icon ? `${icon} ${template.category.name}` : template.category.name;
          } else if (template.category._id) {
            // Якщо populate не спрацював, використовуємо мапу категорій
            const catId = template.category._id.toString();
            const category = categoriesMap.get(catId);
            if (category) {
              const icon = category.icon && category.icon.trim() !== '' ? category.icon : '';
              categoryText = icon ? `${icon} ${category.name}` : category.name;
            } else {
              // Якщо не знайдено в мапі, пробуємо через getCategoryText
              categoryText = await this.getCategoryText(catId);
            }
          } else if (typeof template.category === 'string') {
            // Якщо category зберігається як рядок (ObjectId)
            const category = categoriesMap.get(template.category);
            if (category) {
              const icon = category.icon && category.icon.trim() !== '' ? category.icon : '';
              categoryText = icon ? `${icon} ${category.name}` : category.name;
            } else {
              categoryText = await this.getCategoryText(template.category);
            }
          }
        } else {
          logger.warn(`Категорія не знайдена для шаблону ${template._id}`);
        }
        text += `   🏷️ ${categoryText} | ⚡ *${this.getPriorityText(template.priority)}*\n\n`;
        
        keyboard.push([{
          text: `📄 ${template.title}`,
          callback_data: `template_${template._id}`
        }]);
      }

      text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
      keyboard.push([{ text: '🏠 Головне меню', callback_data: 'back' }]);

      await this.sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (error) {
      logger.error('Помилка отримання шаблонів:', error);
      await this.sendMessage(chatId, 
        `❌ *Помилка завантаження шаблонів*\n\n` +
        `Не вдалося завантажити список шаблонів.\n\n` +
        `🔄 Спробуйте ще раз або зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  async handleTemplateSelectionCallback(chatId, user, templateId) {
    try {
      const template = await TicketTemplate.findById(templateId)
        .populate('category', 'name icon color');
      
      if (!template || !template.isActive) {
        await this.sendMessage(chatId, 
          `❌ *Шаблон недоступний*\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📋 Шаблон не знайдено або неактивний\n\n` +
          `🔄 Оберіть інший шаблон зі списку`, {
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Назад до шаблонів', callback_data: 'create_from_template' }]]
            }
          }
        );
        return;
      }

      // Зберігаємо templateId в сесії для подальшого використання
      let session = this.userSessions.get(chatId);
      if (!session) {
        session = {
          step: 'template_detail',
          ticketData: {
            title: '',
            description: '',
            priority: 'medium',
            categoryId: null,
            photos: []
          },
          isTemplate: true
        };
        this.userSessions.set(chatId, session);
      }
      session.templateId = template._id;

      // Форматуємо категорію
      const categoryName = template.category && typeof template.category === 'object' 
        ? template.category.name 
        : await this.getCategoryText(template.category) || 'Невідома категорія';
      
      // Форматуємо пріоритет
      const priorityText = this.getPriorityText(template.priority);
      
      // Форматуємо instructions як нумерований список
      const formattedInstructions = this.formatInstructionsAsList(template.instructions);
      
      // Формуємо текст повідомлення
      let messageText = 
        `📋 *${template.title}*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📝 *Опис:*\n${template.description}\n\n`;
      
      // Додаємо instructions, якщо вони є
      if (formattedInstructions) {
        messageText += 
          `🔧 *Кроки для вирішення:*\n${formattedInstructions}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      } else {
        messageText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      }
      
      messageText += 
        `🏷️ Категорія: *${categoryName}*\n` +
        `⚡ Пріоритет: *${priorityText}*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

      // Формуємо кнопки
      const keyboard = [
        [
          { text: '✅ Допомогло', callback_data: `template_helped_${template._id}` },
          { text: '📤 Відправити тікет', callback_data: `template_send_ticket_${template._id}` }
        ],
        [{ text: '🔙 Назад до шаблонів', callback_data: 'create_from_template' }]
      ];

      await this.sendMessage(chatId, messageText, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (error) {
      logger.error('Помилка обробки шаблону:', error);
      await this.sendMessage(chatId, 'Помилка обробки шаблону. Спробуйте ще раз.');
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
              pendingRegistration.step = 'phone';
            }
          } else {
            isValid = false;
            errorMessage = '❌ *Некоректний email*\n\nВведіть коректну електронну адресу.\n\n💡 *Приклад:* user@example.com\n\nСпробуйте ще раз:';
          }
          break;

        case 'phone':
          if (this.validatePhone(text)) {
            pendingRegistration.data.phone = text.trim();
            pendingRegistration.step = 'password';
            // Приховуємо клавіатуру після успішного введення номера
            await this.sendMessage(chatId, 
              `✅ *Номер телефону прийнято!*\n\n` +
              `📱 *Номер:* ${text.trim()}\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
              {
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
            'Крок 2/5: Введіть опис проблеми:', {
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
            'Крок 3/5: Прикріпіть фото (необов\'язково)\n\n' +
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
           // Логіка для категорії - очікуємо callback
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
        `✅ *Номер телефону отримано!*\n\n` +
        `📱 *Номер:* ${phoneNumber}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        {
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
      session.step = 'category';
      // Оновлюємо кеш категорій перед показом
      await this.loadCategories();
      const categoryButtons = await this.generateCategoryButtons();
      const categoriesCount = this.getAllCategories().length;
      const promptText = categoriesCount > 0 ? this.getCategoryPromptText() : 'Немає активних категорій. Зверніться до адміністратора: [@Kultup](https://t.me/Kultup)';
      
      // Додаємо кнопку скасування
      if (categoryButtons.length > 0) {
        categoryButtons.push([{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]);
      }
      
      await this.sendMessage(chatId, promptText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: categoryButtons
        }
      });
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
      session.step = 'category';
      // Оновлюємо кеш категорій перед показом
      await this.loadCategories();
      const categoryButtons = await this.generateCategoryButtons();
      const categoriesCount = this.getAllCategories().length;
      const promptText = categoriesCount > 0 ? this.getCategoryPromptText() : 'Немає активних категорій. Зверніться до адміністратора: [@Kultup](https://t.me/Kultup)';
      
      // Додаємо кнопку скасування
      if (categoryButtons.length > 0) {
        categoryButtons.push([{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]);
      }
      
      await this.sendMessage(chatId, promptText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: categoryButtons
        }
      });
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
        status: 'closed' 
      });

      const text = 
        `📊 *Ваша статистика*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📋 *Всього тікетів:* \`${totalTickets}\`\n` +
        `🔓 *Відкритих:* \`${openTickets}\`\n` +
        `✅ *Закритих:* \`${closedTickets}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

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
       const ticketData = {
         title: session.ticketData.title,
         description: session.ticketData.description,
         category: session.ticketData.categoryId,
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

       // Очищуємо сесію
       this.userSessions.delete(chatId);

      let confirmText = 
        `🎉 *Тікет успішно створено!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🆔 *ID тікету:* \`${ticket._id}\`\n\n` +
        `⏳ *Очікуйте відповідь адміністратора*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

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

  

   // Обробники для шаблонів
   async handleTemplateHelpedCallback(chatId, user, templateId) {
     try {
       // Очищаємо сесію
       this.userSessions.delete(chatId);
       
       // Показуємо повідомлення про те, що інформація допомогла
       await this.sendMessage(chatId,
         `✅ *Дякуємо за відгук!*\n\n` +
         `Ми раді, що інформація допомогла вам вирішити проблему.\n\n` +
         `Якщо у вас виникнуть інші питання, звертайтеся до нас!`
       );
       
       // Повертаємо користувача на дашборд
       await this.showUserDashboard(chatId, user);
     } catch (error) {
       logger.error('Помилка обробки "Допомогло":', error);
       await this.sendMessage(chatId, 'Виникла помилка. Спробуйте ще раз.');
     }
   }

   async handleTemplateSendTicketCallback(chatId, user, templateId) {
     try {
       // Завантажуємо шаблон з бази
       const template = await TicketTemplate.findById(templateId)
         .populate('category', 'name');
       
       if (!template || !template.isActive) {
         await this.sendMessage(chatId,
           `❌ *Шаблон недоступний*\n\n` +
           `Шаблон не знайдено або неактивний.`
         );
         return;
       }

       // Створюємо або оновлюємо сесію
       let session = this.userSessions.get(chatId);
       if (!session) {
         session = {
           step: 'photo',
           ticketData: {
             title: '',
             description: '',
             priority: 'medium',
             categoryId: null,
             photos: []
           },
           isTemplate: true
         };
         this.userSessions.set(chatId, session);
       }

       // Зберігаємо дані шаблону в сесію
       session.templateId = template._id;
       session.ticketData.title = template.title;
       session.ticketData.description = template.description;
       session.ticketData.priority = template.priority;
       session.ticketData.categoryId = template.category?._id || template.category;
       session.step = 'photo';
       session.isTemplate = true;

       // Переходимо до кроку додавання фото
       await this.sendMessage(chatId,
         `📷 *Хочете додати фото до тікету?* (необов'язково)\n\n` +
         `Фото допоможе краще зрозуміти проблему.`, {
           reply_markup: {
             inline_keyboard: [
               [{ text: '📷 Прикріпити фото', callback_data: 'template_add_photo' }],
               [{ text: '⏭️ Пропустити', callback_data: 'template_create_without_photo' }],
               [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
             ]
           }
         }
       );
     } catch (error) {
       logger.error('Помилка обробки "Відправити тікет":', error);
       await this.sendMessage(chatId, 'Виникла помилка. Спробуйте ще раз.');
     }
   }

   async handleTemplateAddPhotoCallback(chatId, user) {
     const session = this.userSessions.get(chatId);
     if (session && session.isTemplate) {
       session.step = 'photo';
       await this.sendMessage(chatId, 
         '📷 Надішліть фото для прикріплення до тікету з шаблону.\n\n' +
         'Ви можете додати підпис до фото для додаткової інформації.'
       );
     }
   }

   async handleTemplateCreateWithoutPhotoCallback(chatId, user) {
     const session = this.userSessions.get(chatId);
     if (session && session.isTemplate) {
       await this.completeTemplateTicketCreation(chatId, user, session);
     }
   }

   async completeTemplateTicketCreation(chatId, user, session) {
     try {
       const ticketData = {
         title: session.ticketData.title,
         description: session.ticketData.description,
         category: session.ticketData.categoryId,
         priority: session.ticketData.priority,
         createdBy: user._id,
         city: user.city,
         status: 'open',
         metadata: {
           source: 'telegram',
           templateId: session.templateId
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
             mimetype: 'image/jpeg',
             size: fileSize,
             path: photo.path,
             uploadedBy: user._id,
             caption: photo.caption
           };
         })
       };

       // Додаємо кастомні поля з шаблону
       if (session.ticketData.customFields && session.ticketData.customFields.length > 0) {
         ticketData.customFields = session.ticketData.customFields;
       }

       // Debug logging
       logger.info('Ticket data before creation:', JSON.stringify(ticketData, null, 2));
       logger.info('Session data:', JSON.stringify(session, null, 2));

       const ticket = new Ticket(ticketData);
       await ticket.save();

       // Очищуємо сесію
       this.userSessions.delete(chatId);

       let confirmText = `✅ Тікет з шаблону успішно створено!\n\n` +
         `📋 Заголовок: ${ticket.title}\n` +
         `📝 Опис: ${ticket.description}\n` +
         `🏷️ Категорія: ${await this.getCategoryText(ticket.category)}\n` +
         `⚡ Пріоритет: ${this.getPriorityText(ticket.priority)}\n` +
         `🆔 ID тікету: ${ticket._id}`;

       if (session.ticketData.photos.length > 0) {
         confirmText += `\n📷 Прикріплено фото: ${session.ticketData.photos.length}`;
       }

       await this.sendMessage(chatId, confirmText, {
         reply_markup: {
           inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back' }]]
         }
       });

       logger.info(`Тікет з шаблону створено через Telegram: ${ticket._id} користувачем ${user.email}, шаблон: ${session.templateId}`);
     } catch (error) {
       logger.error('Помилка створення тікету з шаблону:', error);
       await this.sendMessage(chatId, 'Помилка створення тікету з шаблону. Спробуйте ще раз.');
     }
   }


  /**
   * Відправка сповіщення про новий тікет в групу
   */
  async sendNewTicketNotificationToGroup(ticket, user) {
    try {
      if (!this.bot) {
        logger.warn('Telegram бот не ініціалізований для відправки сповіщення про новий тікет');
        return;
      }

      const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
      if (!groupChatId) {
        logger.warn('TELEGRAM_GROUP_CHAT_ID не встановлено');
        return;
      }

      await ticket.populate([
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'city', select: 'name region' },
        { path: 'category', select: 'name' }
      ]);

      const categoryText = await this.getCategoryText(ticket.category._id);
      const priorityText = this.getPriorityText(ticket.priority);
      const statusText = this.getStatusText(ticket.status);
      
      const message = 
        `🎫 *Новий тікет створено*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📋 *Заголовок:* ${ticket.title}\n` +
        `📝 *Опис:* ${ticket.description || 'Без опису'}\n\n` +
        `👤 *Автор:* ${ticket.createdBy?.firstName || ''} ${ticket.createdBy?.lastName || ''}\n` +
        `📧 *Email:* \`${ticket.createdBy?.email || 'Невідомий'}\`\n` +
        `🏙️ *Місто:* ${ticket.city?.name || 'Не вказано'}\n` +
        `🏷️ *Категорія:* ${categoryText}\n` +
        `⚡ *Пріоритет:* ${priorityText}\n` +
        `📊 *Статус:* ${statusText}\n` +
        `🆔 *ID тікету:* \`${ticket._id}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

      await this.sendMessage(groupChatId, message, { parse_mode: 'Markdown' });
      logger.info('✅ Сповіщення про новий тікет відправлено в групу Telegram');
    } catch (error) {
      logger.error('Помилка відправки сповіщення про новий тікет в групу:', error);
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

      const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
      if (!groupChatId) {
        logger.warn('TELEGRAM_GROUP_CHAT_ID не встановлено');
        return;
      }

      await ticket.populate([
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'assignedTo', select: 'firstName lastName email' },
        { path: 'city', select: 'name region' },
        { path: 'category', select: 'name' }
      ]);

      const categoryText = await this.getCategoryText(ticket.category?._id || ticket.category);
      const priorityText = this.getPriorityText(ticket.priority);
      const previousStatusText = this.getStatusText(previousStatus);
      const newStatusText = this.getStatusText(newStatus);
      const previousStatusEmoji = this.getStatusEmoji(previousStatus);
      const newStatusEmoji = this.getStatusEmoji(newStatus);
      
      const message = 
        `🔄 *Статус тікету змінено*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📋 *Заголовок:* ${ticket.title}\n` +
        `🆔 *ID тікету:* \`${ticket._id}\`\n\n` +
        `${previousStatusEmoji} *Попередній статус:* ${previousStatusText}\n` +
        `${newStatusEmoji} *Новий статус:* ${newStatusText}\n\n` +
        `👤 *Автор:* ${ticket.createdBy?.firstName || ''} ${ticket.createdBy?.lastName || ''}\n` +
        `📧 *Email:* \`${ticket.createdBy?.email || 'Невідомий'}\`\n` +
        `🏙️ *Місто:* ${ticket.city?.name || 'Не вказано'}\n` +
        `🏷️ *Категорія:* ${categoryText}\n` +
        `⚡ *Пріоритет:* ${priorityText}\n` +
        `👨‍💼 *Змінено:* ${changedBy?.firstName || ''} ${changedBy?.lastName || ''}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

      await this.sendMessage(groupChatId, message, { parse_mode: 'Markdown' });
      logger.info('✅ Сповіщення про зміну статусу тікету відправлено в групу Telegram');
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
      const categoryText = await this.getCategoryText(ticket.category?._id || ticket.category);

      let message = '';
      if (type === 'updated') {
        message = 
          `🔄 *Статус вашого тікету змінено*\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📋 *Заголовок:* ${ticket.title}\n` +
          `🆔 *ID тікету:* \`${ticket._id}\`\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `✨ *НОВИЙ СТАТУС:*\n` +
          `${statusEmoji} *${statusText}*\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `🏷️ *Категорія:* ${categoryText}\n` +
          `⚡ *Пріоритет:* ${this.getPriorityText(ticket.priority)}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `💡 Ви можете переглянути деталі тікету в системі.`;
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
    return `🏷️ *Оберіть категорію тікету*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Категорія допоможе швидше обробити ваш запит.`;
  }

  getPriorityPromptText() {
    return `⚡ *Оберіть пріоритет тікету*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
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
          const buttonText1 = text1.length > 30 ? text1.substring(0, 27) + '...' : text1;
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
          const buttonText2 = text2.length > 30 ? text2.substring(0, 27) + '...' : text2;
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
      
      // Якщо це шаблонний тікет, пропускаємо вибір пріоритету
      if (session.isTemplate && session.templateId) {
        const template = await TicketTemplate.findById(session.templateId);
        if (template) {
          session.ticketData.title = template.title;
          session.ticketData.description = template.description;
          session.ticketData.priority = template.priority;
          session.ticketData.categoryId = template.category || categoryId;
          session.step = 'photo';
          
          await this.sendMessage(chatId,
            '📷 Хочете додати фото до тікету? (необов\'язково)', {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📷 Прикріпити фото', callback_data: 'template_add_photo' }],
                  [{ text: '⏭️ Пропустити', callback_data: 'template_create_without_photo' }],
                  [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
                ]
              }
            }
          );
          return;
        }
      }
      
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
        pendingRegistration = new PendingRegistration({
          telegramId: String(userId),
          telegramChatId: String(chatId),
          step: 'firstName',
          data: {}
        });
        await pendingRegistration.save();
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
            `📝 *Реєстрація в системі*\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `👤 *Крок 1/7:* Введіть ваше ім'я\n\n` +
            `💡 Ім'я повинно містити тільки літери та бути довжиною від 2 до 50 символів.`
          );
          break;
          
        case 'lastName':
          await this.sendMessage(chatId, 
            `✅ *Ім'я прийнято!*\n\n` +
            `👤 *Ім'я:* ${pendingRegistration.data.firstName}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `👤 *Крок 2/7:* Введіть ваше прізвище\n\n` +
            `💡 Прізвище повинно містити тільки літери та бути довжиною від 2 до 50 символів.`
          );
          break;
          
        case 'email':
          await this.sendMessage(chatId, 
            `✅ *Прізвище прийнято!*\n\n` +
            `👤 *Прізвище:* ${pendingRegistration.data.lastName}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📧 *Крок 3/7:* Введіть вашу електронну адресу\n\n` +
            `💡 *Приклад:* user@example.com`
          );
          break;
          
        case 'phone':
          await this.sendMessage(chatId, 
            `✅ *Email прийнято!*\n\n` +
            `📧 *Email:* \`${pendingRegistration.data.email}\`\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📱 *Крок 4/7:* Введіть ваш номер телефону\n\n` +
            `💡 *Приклад:* +380501234567\n\n` +
            `Або натисніть кнопку нижче, щоб поділитися номером:`,
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
          break;
          
        case 'password':
          await this.sendMessage(chatId, 
            `✅ *Номер телефону прийнято!*\n\n` +
            `📱 *Номер:* ${pendingRegistration.data.phone}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🔐 *Крок 5/7:* Введіть пароль\n\n` +
            `💡 Пароль повинен містити:\n` +
            `• Мінімум 6 символів\n` +
            `• Принаймні одну літеру\n` +
            `• Принаймні одну цифру\n\n` +
            `💡 *Приклад:* MyPass123`
          );
          break;
          
        case 'city':
          await this.sendCitySelection(chatId, userId);
          break;
          
        case 'position':
          await this.sendPositionSelection(chatId, userId);
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
        `✅ *Пароль прийнято!*\n\n` +
        `🔐 *Пароль:* \`********\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🏙️ *Крок 6/7:* Оберіть ваше місто`,
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
      const positions = await Position.find({ isActive: true })
        .select('name')
        .sort({ name: 1 })
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
          text: `💼 ${position.name}`,
          callback_data: `position_${position._id}`
        }]);
      });

      await this.sendMessage(chatId, 
        `✅ *Місто обрано!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💼 *Крок 7/7:* Оберіть вашу посаду`,
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

  async handleRegistrationCallback(chatId, userId, data) {
    try {
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

      if (data.startsWith('city_')) {
        const cityId = data.replace('city_', '');
        pendingRegistration.data.city = cityId;
        pendingRegistration.step = 'position';
        await pendingRegistration.save();
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
      } else if (data.startsWith('position_')) {
        const positionId = data.replace('position_', '');
        pendingRegistration.data.position = positionId;
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
      const { firstName, lastName, email, phone, password, city, position } = pendingRegistration.data;

      // Створюємо нового користувача
      const user = new User({
        firstName,
        lastName,
        email,
        phone,
        password, // В реальному проекті потрібно хешувати
        city,
        position,
        telegramId: String(userId),
        telegramChatId: String(chatId),
        telegramUsername: pendingRegistration.telegramUsername,
        isActive: false, // Потребує активації адміністратором
        registrationStatus: 'pending'
      });

      await user.save();
      
      // Видаляємо тимчасову реєстрацію
      await PendingRegistration.deleteOne({ _id: pendingRegistration._id });

      await this.sendMessage(chatId, 
        `🎉 *Реєстрація завершена!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `✅ Ваш обліковий запис створено.\n\n` +
        `⏳ *Очікуйте активації*\n\n` +
        `Ваш обліковий запис потребує активації адміністратором.\n\n` +
        `📞 Зверніться до адміністратора для активації: [@Kultup](https://t.me/Kultup)\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'Markdown' }
      );

      logger.info(`Нова реєстрація через Telegram: ${email} (${userId})`);
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
      `🔐 *Крок 5/7:* Введіть пароль\n\n` +
      `💡 Пароль повинен містити:\n` +
      `• Мінімум 6 символів\n` +
      `• Принаймні одну літеру\n` +
      `• Принаймні одну цифру\n\n` +
      `💡 *Приклад:* MyPass123`
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
          `✅ *Ви вже авторизовані!*\n\n` +
          `Ваш обліковий запис вже підключено до Telegram.\n\n` +
          `Використайте /start для перегляду меню.`
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
        `🔐 *Авторизація в системі*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📝 *Крок 1/2:* Введіть ваш логін\n\n` +
        `💡 Введіть логін, який ви використовуєте для входу в систему.`,
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
              `✅ *Логін прийнято!*\n\n` +
              `👤 *Логін:* \`${session.data.login}\`\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `🔐 *Крок 2/2:* Введіть ваш пароль\n\n` +
              `💡 Введіть пароль для входу в систему.`
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
          `❌ *Помилка авторизації*\n\n` +
          `Користувача з таким логіном не знайдено.\n\n` +
          `💡 Перевірте правильність логіну та спробуйте ще раз.`,
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
        `✅ *Авторизація успішна!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🎉 Вітаємо, ${updatedUser.firstName}!\n\n` +
        `Ваш обліковий запис успішно підключено до Telegram бота.`
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