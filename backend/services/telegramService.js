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
          await this.handleStartCommand(chatId, userId, msg.text);
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

  async handleStartCommand(chatId, userId) {
    try {
      // Конвертуємо userId та chatId в рядки для пошуку
      const userIdString = String(userId);
      const chatIdString = String(chatId);
      
      // Спочатку шукаємо за telegramId
      let user = await User.findOne({ 
        $or: [
          { telegramId: userIdString },
          { telegramId: userId }
        ]
      })
        .populate('position', 'name')
        .populate('city', 'name');
      
      // Якщо не знайдено за telegramId, спробуємо знайти за telegramChatId
      if (!user) {
        logger.info('Користувача не знайдено за telegramId, шукаємо за telegramChatId:', {
          userId,
          userIdString,
          chatId,
          chatIdString
        });
        
        user = await User.findOne({ 
          $or: [
            { telegramChatId: chatIdString },
            { telegramChatId: chatId }
          ]
        })
          .populate('position', 'name')
          .populate('city', 'name');
        
        // Якщо знайдено за telegramChatId, оновлюємо telegramId
        if (user && !user.telegramId) {
          logger.info('Знайдено користувача за telegramChatId, оновлюємо telegramId:', {
            userId: user._id,
            email: user.email,
            oldTelegramId: user.telegramId,
            newTelegramId: userIdString
          });
          user.telegramId = userIdString;
          await user.save();
        }
      }
      
      // Діагностичне логування
      logger.info('Пошук користувача за telegramId:', {
        userId,
        userIdString,
        chatId,
        chatIdString,
        userFound: !!user,
        userIdType: typeof userId,
        userTelegramId: user?.telegramId,
        userTelegramIdType: typeof user?.telegramId,
        userTelegramChatId: user?.telegramChatId,
        userTelegramChatIdType: typeof user?.telegramChatId,
        isActive: user?.isActive,
        registrationStatus: user?.registrationStatus,
        email: user?.email
      });
      
      if (user) {
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
        await this.sendMessage(chatId, 
          `🚫 *Доступ обмежено*\n\n` +
          `👋 Вітаємо! Для використання бота потрібно зареєструватися в системі.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📞 *Зверніться до адміністратора для отримання доступу:* [@Kultup](https://t.me/Kultup)`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📝 Зареєструватися', callback_data: 'register_user' }],
                [{ text: '📞 Зв\'язатися з адміністратором', url: 'https://t.me/Kultup' }]
              ]
            }
          }
        );
      }
    } catch (error) {
      logger.error('Помилка обробки команди /start:', error);
      await this.sendMessage(chatId, 
        `❌ *Помилка системи*\n\n` +
        `Виникла технічна помилка. Спробуйте ще раз через кілька хвилин.`
      );
    }
  }

  async showUserDashboard(chatId, user) {
    const welcomeText = 
      `🎉 *Вітаємо в системі підтримки!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👤 *Профіль користувача:*\n` +
      `📧 Email: \`${user.email}\`\n` +
      `💼 Посада: *${user.position?.name || 'Не вказано'}*\n` +
      `🏙️ Місто: *${user.city?.name || 'Не вказано'}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🎯 *Оберіть дію:*`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '📋 Мої тікети', callback_data: 'my_tickets' }],
        [{ text: '📝 Створити тікет', callback_data: 'create_ticket' }],
        [{ text: '📄 Створити з шаблону', callback_data: 'create_from_template' }],
        [{ text: '📊 Статистика', callback_data: 'statistics' }]
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
        } else if (data.startsWith('category_')) {
          const categoryId = data.replace('category_', '');
          await this.handleDynamicCategoryCallback(chatId, user, categoryId);
        } else if (data === 'priority_low') {
          await this.handlePriorityCallback(chatId, user, 'low');
        } else if (data === 'priority_medium') {
          await this.handlePriorityCallback(chatId, user, 'medium');
        } else if (data === 'priority_high') {
          await this.handlePriorityCallback(chatId, user, 'high');
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

      // Якщо користувач не зареєстрований, обробляємо callback-и для реєстрації
      if (data === 'register_user') {
        await this.handleUserRegistrationCallback(chatId, userId);
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

      // Якщо користувач не зареєстрований і це не callback для реєстрації
      await this.answerCallbackQuery(callbackQuery.id, 'Ви не авторизовані. Використайте /start для реєстрації.');
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
            inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back' }]]
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
      keyboard.push([{ text: '🔙 Назад', callback_data: 'back' }]);

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
              inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back' }]]
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
      keyboard.push([{ text: '🔙 Назад', callback_data: 'back' }]);

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
      const template = await TicketTemplate.findById(templateId).populate('category', 'name');
      
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

      let session = this.userSessions.get(chatId);
      if (!session) {
        // Якщо сесії немає (наприклад, користувач зайшов напряму у шаблони) — створюємо її
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

      if (session) {
        // Зберігаємо ID шаблону та переходимо до кроку фото, пропускаючи вибір пріоритету
        session.templateId = template._id;
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
      }
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
      const categoryButtons = await this.generateCategoryButtons();
      const categoriesCount = this.getAllCategories().length;
      const promptText = categoriesCount > 0 ? this.getCategoryPromptText() : 'Немає активних категорій. Зверніться до адміністратора: [@Kultup](https://t.me/Kultup)';
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
      const categoryButtons = await this.generateCategoryButtons();
      const categoriesCount = this.getAllCategories().length;
      const promptText = categoriesCount > 0 ? this.getCategoryPromptText() : 'Немає активних категорій. Зверніться до адміністратора: [@Kultup](https://t.me/Kultup)';
      await this.sendMessage(chatId, promptText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: categoryButtons
        }
      });
    }
  }

  async handleCancelTicketCallback(chatId, user) {
    this.userSessions.delete(chatId);
    await this.sendMessage(chatId, 
      `❌ *Створення тікету скасовано*\n\n` +
      `🔄 Повертаємося до головного меню`
    );
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
          inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back' }]]
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
      const message = `🆕 Новий тікет створено!\n\n` +
        `📋 ID: ${ticket._id}\n` +
        `📝 Заголовок: ${ticket.title}\n` +
        `👤 Створив: ${user.firstName} ${user.lastName}\n` +
        `📧 Email: ${user.email}\n` +
        `🏙️ Місто: ${ticket.city?.name || 'Не вказано'}\n` +
        `🏷️ Категорія: ${categoryText}\n` +
        `⚡ Пріоритет: ${this.getPriorityText(ticket.priority)}\n` +
        `📅 Створено: ${new Date(ticket.createdAt).toLocaleString('uk-UA')}`;

      await this.sendMessage(groupChatId, message);
      logger.info(`Сповіщення про новий тікет відправлено в групу: ${ticket._id}`);
    } catch (error) {
      logger.error('Помилка відправки сповіщення про новий тікет в групу:', error);
      throw error;
    }
  }

  /**
   * Відправка сповіщення про зміну статусу тікета в групу
   */
  async sendTicketStatusNotificationToGroup(ticket, previousStatus, newStatus, user) {
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
        { path: 'city', select: 'name region' }
      ]);

      const statusEmoji = this.getStatusEmoji(newStatus);
      const statusText = this.getStatusText(newStatus);
      const previousStatusText = this.getStatusText(previousStatus);

      let message = `${statusEmoji} Статус тікета змінено!\n\n` +
        `📋 ID: ${ticket._id}\n` +
        `📝 Заголовок: ${ticket.title}\n` +
        `👤 Створив: ${ticket.createdBy?.firstName} ${ticket.createdBy?.lastName}\n` +
        `🔄 Змінив: ${user.firstName} ${user.lastName}\n` +
        `📊 Статус: ${previousStatusText} → ${statusText}\n` +
        `🏙️ Місто: ${ticket.city?.name || 'Не вказано'}\n` +
        `⚡ Пріоритет: ${this.getPriorityText(ticket.priority)}`;

      if (ticket.assignedTo) {
        message += `\n👨‍💼 Призначено: ${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`;
      }

      await this.sendMessage(groupChatId, message);
      logger.info(`Сповіщення про зміну статусу тікета відправлено в групу: ${ticket._id}`);
    } catch (error) {
      logger.error('Помилка відправки сповіщення про зміну статусу в групу:', error);
      throw error;
    }
  }

  /**
   * Обробка відгуку користувача
   */
  async handleFeedbackCallback(chatId, data, user) {
    try {
      if (data === 'feedback_skip') {
        await this.sendMessage(chatId, 'Дякуємо за вашу оцінку!');
        return;
      }

      const ticketId = data.replace('feedback_', '');
      const ticket = await Ticket.findById(ticketId);
      
      if (!ticket) {
        await this.sendMessage(chatId, 'Тікет не знайдено.');
        return;
      }

      // Зберігаємо інформацію про очікування відгуку
      this.userSessions[chatId] = {
        action: 'waiting_feedback',
        ticketId: ticketId,
        userId: user._id
      };

      await this.sendMessage(chatId, 
        `💬 Будь ласка, напишіть ваш відгук про вирішення тікету:\n\n` +
        `📋 ${ticket.title}\n\n` +
        `Ваш відгук допоможе нам покращити якість обслуговування.`
      );
    } catch (error) {
      logger.error('Помилка обробки запиту на відгук:', error);
      await this.sendMessage(chatId, 'Виникла помилка при обробці запиту на відгук.');
    }
  }

  /**
   * Обробка текстового повідомлення з відгуком
   */
  async handleFeedbackMessage(chatId, text, user) {
    try {
      const session = this.userSessions[chatId];
      if (!session || session.action !== 'waiting_feedback') {
        return false; // Не обробляємо як відгук
      }

      const ticket = await Ticket.findById(session.ticketId);
      if (!ticket) {
        await this.sendMessage(chatId, 'Тікет не знайдено.');
        delete this.userSessions[chatId];
        return true;
      }

      // Збереження відгуку
      ticket.qualityRating.feedback = text;
      await ticket.save();

      await this.sendMessage(chatId, 
        `✅ Дякуємо за ваш відгук!\n\n` +
        `Ваші коментарі допоможуть нам покращити якість обслуговування.`
      );

      // Очищаємо сесію
      delete this.userSessions[chatId];
      
      logger.info(`Відгук збережено для тікету ${session.ticketId} від користувача ${user.email}`);
      return true; // Повідомлення оброблено як відгук
    } catch (error) {
      logger.error('Помилка збереження відгуку:', error);
      await this.sendMessage(chatId, 'Виникла помилка при збереженні відгуку.');
      delete this.userSessions[chatId];
      return true;
    }
  }

  /**
   * Відправка запиту на оцінку якості тікету
   */
  async sendQualityRatingRequest(ticket) {
    try {
      if (!this.bot) {
        logger.warn('Telegram бот не ініціалізований для відправки запиту на оцінку');
        return;
      }

      await ticket.populate([
        { path: 'createdBy', select: 'firstName lastName email telegramId' }
      ]);

      const user = ticket.createdBy;
      if (!user || !user.telegramId) {
        logger.info(`Користувач не має Telegram ID для запиту оцінки тікету ${ticket._id}`);
        return;
      }

      const message = `✅ Ваш тікет було закрито!\n\n` +
        `📋 ID: ${ticket._id}\n` +
        `📝 Заголовок: ${ticket.title}\n` +
        `📅 Закрито: ${new Date().toLocaleString('uk-UA')}\n\n` +
        `🌟 Чи хотіли б ви оцінити якість вирішення вашого тікету?`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '👍 Так, оцінити', callback_data: `rate_ticket_yes_${ticket._id}` },
            { text: '👎 Ні, дякую', callback_data: `rate_ticket_no_${ticket._id}` }
          ]
        ]
      };

      await this.sendMessage(user.telegramId, message, { reply_markup: keyboard });
      
      // Оновлюємо статус запиту на оцінку
      ticket.qualityRating.ratingRequested = true;
      ticket.qualityRating.requestedAt = new Date();
      await ticket.save();

      logger.info(`Запит на оцінку якості відправлено користувачу для тікету ${ticket._id}`);
    } catch (error) {
      logger.error('Помилка відправки запиту на оцінку якості:', error);
      throw error;
    }
  }

  /**
   * Обробка відповіді на запит оцінки якості
   */
  async handleQualityRatingResponse(chatId, data, user) {
    try {
      const [action, response, ticketId] = data.split('_').slice(1); // rate_ticket_yes_ticketId -> [ticket, yes, ticketId]
      
      if (action !== 'ticket') {
        logger.warn(`Невідома дія для оцінки: ${action}`);
        return;
      }

      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        await this.sendMessage(chatId, 'Тікет не знайдено.');
        return;
      }

      if (response === 'no') {
        // Користувач відмовився від оцінки
        await this.sendMessage(chatId, 'Дякуємо! Ваша відповідь збережена.');
        return;
      }

      if (response === 'yes') {
        // Користувач хоче оцінити - показуємо варіанти оцінок
        const message = `🌟 Оцініть якість вирішення вашого тікету:\n\n` +
          `📋 ${ticket.title}\n\n` +
          `Оберіть оцінку від 1 до 5 зірок:`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: '⭐', callback_data: `rating_1_${ticketId}` },
              { text: '⭐⭐', callback_data: `rating_2_${ticketId}` },
              { text: '⭐⭐⭐', callback_data: `rating_3_${ticketId}` }
            ],
            [
              { text: '⭐⭐⭐⭐', callback_data: `rating_4_${ticketId}` },
              { text: '⭐⭐⭐⭐⭐', callback_data: `rating_5_${ticketId}` }
            ],
            [
              { text: this.getCancelButtonText(), callback_data: `rate_ticket_no_${ticketId}` }
            ]
          ]
        };

        await this.sendMessage(chatId, message, { reply_markup: keyboard });
      }
    } catch (error) {
      logger.error('Помилка обробки відповіді на запит оцінки:', error);
      await this.sendMessage(chatId, 'Виникла помилка при обробці вашої відповіді.');
    }
  }

  /**
   * Обробка оцінки якості тікету
   */
  async handleQualityRating(chatId, data, user) {
    try {
      const [action, rating, ticketId] = data.split('_'); // rating_5_ticketId
      
      if (action !== 'rating') {
        logger.warn(`Невідома дія для рейтингу: ${action}`);
        return;
      }

      const ratingValue = parseInt(rating);
      if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
        await this.sendMessage(chatId, 'Невірна оцінка. Спробуйте ще раз.');
        return;
      }

      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        await this.sendMessage(chatId, 'Тікет не знайдено.');
        return;
      }

      // Збереження оцінки
      ticket.qualityRating.hasRating = true;
      ticket.qualityRating.rating = ratingValue;
      ticket.qualityRating.ratedAt = new Date();
      ticket.qualityRating.ratedBy = user._id;
      await ticket.save();

      const stars = '⭐'.repeat(ratingValue);
      let responseMessage = `Дякуємо за вашу оцінку!\n\n` +
        `🌟 Ваша оцінка: ${stars} (${ratingValue}/5)\n` +
        `📋 Тікет: ${ticket.title}`;

      // Пропонуємо залишити відгук для низьких оцінок
      if (ratingValue <= 3) {
        responseMessage += `\n\n💬 Чи хотіли б ви залишити відгук для покращення нашого сервісу?`;
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: '💬 Залишити відгук', callback_data: `feedback_${ticketId}` },
              { text: '❌ Ні, дякую', callback_data: 'feedback_skip' }
            ]
          ]
        };

        await this.sendMessage(chatId, responseMessage, { reply_markup: keyboard });
      } else {
        await this.sendMessage(chatId, responseMessage);
      }

      logger.info(`Оцінка ${ratingValue} збережена для тікету ${ticketId} користувачем ${user.email}`);
    } catch (error) {
      logger.error('Помилка збереження оцінки якості:', error);
      await this.sendMessage(chatId, 'Виникла помилка при збереженні оцінки.');
    }
  }

  /**
   * Відправка сповіщення користувачу про тікет
   */
  async sendTicketNotification(ticket, type) {
    try {
      if (!this.bot) {
        logger.warn('Telegram бот не ініціалізований для відправки сповіщення користувачу');
        return;
      }

      await ticket.populate([
        { path: 'createdBy', select: 'firstName lastName email telegramId' },
        { path: 'assignedTo', select: 'firstName lastName email telegramId' }
      ]);

      let targetUser = null;
      let message = '';

      switch (type) {
        case 'assigned':
          targetUser = ticket.assignedTo;
          if (targetUser && targetUser.telegramId) {
            message = `👨‍💼 Вам призначено новий тікет!\n\n` +
              `📋 ID: ${ticket._id}\n` +
              `📝 Заголовок: ${ticket.title}\n` +
              `⚡ Пріоритет: ${this.getPriorityText(ticket.priority)}\n` +
              `📅 Створено: ${new Date(ticket.createdAt).toLocaleString('uk-UA')}`;
          }
          break;

        case 'updated':
          targetUser = ticket.createdBy;
          if (targetUser && targetUser.telegramId) {
            const statusText = this.getStatusText(ticket.status);
            const statusEmoji = this.getStatusEmoji(ticket.status);
            
            message = `${statusEmoji} Статус вашого тікета оновлено!\n\n` +
              `📋 ID: ${ticket._id}\n` +
              `📝 Заголовок: ${ticket.title}\n` +
              `📊 Новий статус: ${statusText}\n` +
              `📅 Оновлено: ${new Date().toLocaleString('uk-UA')}`;
          }
          break;

        default:
          logger.warn(`Невідомий тип сповіщення: ${type}`);
          return;
      }

      if (targetUser && targetUser.telegramId && message) {
        await this.sendMessage(targetUser.telegramId, message);
        logger.info(`Сповіщення типу "${type}" відправлено користувачу ${targetUser.email}`);
      } else {
        logger.info(`Користувач не має Telegram ID або повідомлення порожнє для типу "${type}"`);
      }
    } catch (error) {
      logger.error(`Помилка відправки сповіщення користувачу (тип: ${type}):`, error);
      throw error;
    }
  }

  /**
   * Відправка загального сповіщення користувачу
   */
  async sendNotification(telegramId, notification) {
    try {
      if (!this.bot) {
        logger.warn('Telegram бот не ініціалізований для відправки сповіщення');
        return;
      }

      const message = `📢 ${notification.title}\n\n${notification.message}`;
      await this.sendMessage(telegramId, message);
      logger.info(`Загальне сповіщення відправлено користувачу з Telegram ID: ${telegramId}`);
    } catch (error) {
      logger.error('Помилка відправки загального сповіщення:', error);
      throw error;
    }
  }

  /**
   * Завантаження налаштувань бота з БД
   */
  async loadBotSettings() {
    try {
      const settings = await BotSettings.findOne({ key: 'default' });
      if (!settings) {
        logger.warn('BotSettings (key=default) не знайдено у БД. Використовуються значення за замовчуванням зі схеми.');
        this.botSettings = new BotSettings({ key: 'default' });
      } else {
        this.botSettings = settings;
        logger.info('✅ Налаштування бота завантажено з БД');
      }
    } catch (error) {
      logger.error('Помилка завантаження BotSettings:', error);
    }
  }

  getCategoryPromptText() {
    return this.botSettings?.categoryPromptText || 'Крок 4/5: Оберіть категорію:';
  }

  getPriorityPromptText() {
    return this.botSettings?.priorityPromptText || 'Крок 5/5: Оберіть пріоритет:';
  }

  getCancelButtonText() {
    return this.botSettings?.cancelButtonText || '❌ Скасувати';
  }

  /**
   * Допоміжні методи для форматування
   * (getCategoryText визначено вище і працює з БД та icon)
   */

  getPriorityText(priority) {
    const map = this.botSettings?.priorityTexts;
    try {
      if (map && typeof map.get === 'function') {
        return map.get(priority) || priority;
      }
      // Якщо карта відсутня, повертаємо ключ як текст
      return priority;
    } catch (err) {
      logger.warn('Помилка отримання тексту пріоритету з BotSettings:', err);
      return priority;
    }
  }

  getStatusText(status) {
    const map = this.botSettings?.statusTexts;
    try {
      if (map && typeof map.get === 'function') {
        return map.get(status) || status;
      }
      return status;
    } catch (err) {
      logger.warn('Помилка отримання статусу з BotSettings:', err);
      return status;
    }
  }

  getStatusEmoji(status) {
    const map = this.botSettings?.statusEmojis;
    try {
      if (map && typeof map.get === 'function') {
        return map.get(status) || '';
      }
      return '';
    } catch (err) {
      logger.warn('Помилка отримання емодзі статусу з BotSettings:', err);
      return '';
    }
  }

  // Завантаження категорій з бази даних
  async loadCategories() {
    try {
      const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
      this.categoryCache.clear();
      
      categories.forEach(category => {
        // Створюємо мапінг українська назва -> об'єкт категорії
        this.categoryCache.set(category.name, category);
      });
      
      console.log(`Завантажено ${categories.length} активних категорій`);
    } catch (error) {
      console.error('Помилка завантаження категорій:', error);
    }
  }

  // Отримання категорії за назвою
  getCategoryByName(categoryName) {
    return this.categoryCache.get(categoryName);
  }

  // Отримання всіх категорій
  getAllCategories() {
    return Array.from(this.categoryCache.values());
  }

  // Генерація кнопок категорій для Telegram (з підвантаженням при пустому кеші)
  async generateCategoryButtons() {
    let categories = this.getAllCategories();
    if (!categories || categories.length === 0) {
      // Ліниве завантаження з БД, якщо кеш порожній
      await this.loadCategories();
      categories = this.getAllCategories();
    }

    // Формуємо кнопки категорій, використовуючи іконку з БД, якщо є
    const categoryButtonsFlat = categories.map((category) => {
      const icon = category.icon && category.icon.trim() !== '' ? category.icon : '';
      const text = icon ? `${icon} ${category.name}` : category.name;
      return {
        text,
        callback_data: `category_${category._id}`
      };
    });

    // Динамічне групування за налаштуванням (розмір рядка)
    const rowSize = Math.max(1, Number(this.botSettings?.categoryButtonRowSize || 2));
    const rows = [];
    let currentRow = [];
    for (const btn of categoryButtonsFlat) {
      currentRow.push(btn);
      if (currentRow.length === rowSize) {
        rows.push(currentRow);
        currentRow = [];
      }
    }

    // Додаємо кнопку скасування, щоб загалом було компактно
    const cancelBtn = { text: this.getCancelButtonText(), callback_data: 'cancel_ticket' };
    if (currentRow.length === 1) {
      // Якщо останній ряд неповний — додаємо до нього кнопку скасування
      currentRow.push(cancelBtn);
      rows.push(currentRow);
    } else {
      if (currentRow.length === 2) {
        rows.push(currentRow);
      }
      // Інакше додаємо окремим рядком
      rows.push([cancelBtn]);
    }

    return rows;
  }

  // Видалено мапінг емодзі, іконки керуються з БД

  // Новий обробник для динамічних категорій
  async handleDynamicCategoryCallback(chatId, user, categoryId) {
    const session = this.userSessions.get(chatId);
    if (session) {
      try {
        const category = await Category.findById(categoryId);
        if (!category) {
          await this.sendMessage(chatId, 'Категорія не знайдена. Спробуйте ще раз.');
          return;
        }

        // Зберігаємо ID категорії з БД напряму
        session.ticketData.categoryId = categoryId;
        session.step = 'priority';
        
        await this.sendMessage(chatId, 
          this.getPriorityPromptText(), {
            reply_markup: {
              inline_keyboard: [
                [{ text: this.getPriorityText('Високий🔴'), callback_data: 'priority_high' }],
                [{ text: this.getPriorityText('Середній🟡'), callback_data: 'priority_medium' }],
                [{ text: this.getPriorityText('Низький🟢'), callback_data: 'priority_low' }],
                [{ text: this.getCancelButtonText(), callback_data: 'cancel_ticket' }]
              ]
            }
          }
        );
      } catch (error) {
        logger.error('Помилка обробки категорії:', error);
        await this.sendMessage(chatId, 'Помилка обробки категорії. Спробуйте ще раз.');
      }
    }
  }

  // Обробник реєстрації нового користувача
  async handleUserRegistrationCallback(chatId, userId) {
    try {
      // Перевіряємо, чи є вже активна реєстрація для цього користувача
      // Конвертуємо userId в рядок для пошуку
      let pendingRegistration = await PendingRegistration.findOne({ 
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId }
        ]
      });
      
      if (!pendingRegistration) {
        // Отримуємо інформацію про користувача з Telegram
        const chatInfo = await this.bot.getChat(userId);
        
        // Створюємо нову запис для покрокової реєстрації
        pendingRegistration = new PendingRegistration({
          telegramId: String(userId), // Конвертуємо в рядок, оскільки в схемі String
          step: 'firstName',
          telegramInfo: {
            firstName: chatInfo.first_name || '',
            lastName: chatInfo.last_name || '',
            username: chatInfo.username || ''
          }
        });
        await pendingRegistration.save();
      }

      // Починаємо або продовжуємо процес реєстрації
      await this.processRegistrationStep(chatId, userId, pendingRegistration);
      
    } catch (error) {
      logger.error('Помилка обробки реєстрації:', error);
      await this.sendMessage(chatId, 
        `❌ *Помилка реєстрації*\n\n` +
        `Виникла технічна помилка під час обробки вашої заявки.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📞 Будь ласка, зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  // Основний метод обробки кроків реєстрації
  async processRegistrationStep(chatId, userId, pendingRegistration) {
    const step = pendingRegistration.step;
    
    switch (step) {
      case 'firstName':
        await this.askForFirstName(chatId);
        break;
      case 'lastName':
        await this.askForLastName(chatId);
        break;
      case 'email':
        await this.askForEmail(chatId);
        break;
      case 'phone':
        await this.askForPhone(chatId);
        break;
      case 'password':
        await this.askForPassword(chatId);
        break;
      case 'city':
        await this.askForCity(chatId);
        break;
      case 'position':
        await this.askForPosition(chatId);
        break;
      case 'department':
        await this.askForDepartment(chatId);
        break;
      case 'completed':
        await this.completeRegistration(chatId, userId, pendingRegistration);
        break;
      default:
        await this.askForFirstName(chatId);
        break;
    }
  }

  // Методи для кожного кроку реєстрації
  async askForFirstName(chatId) {
    await this.sendMessage(chatId, 
      `📝 *Реєстрація - Крок 1/8*\n\n` +
      `👤 Будь ласка, введіть ваше *ім'я*:\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💡 *Приклад:* Олександр`
    );
  }

  async askForLastName(chatId) {
    await this.sendMessage(chatId, 
      `📝 *Реєстрація - Крок 2/8*\n\n` +
      `👤 Будь ласка, введіть ваше *прізвище*:\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💡 *Приклад:* Петренко`
    );
  }

  async askForEmail(chatId) {
    await this.sendMessage(chatId, 
      `📝 *Реєстрація - Крок 3/8*\n\n` +
      `📧 Будь ласка, введіть вашу *електронну пошту*:\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💡 *Приклад:* oleksandr.petrenko@example.com`
    );
  }

  async askForPhone(chatId) {
    await this.sendMessage(chatId, 
      `📝 *Реєстрація - Крок 4/8*\n\n` +
      `📱 Будь ласка, введіть ваш *номер телефону*:\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💡 *Приклад:* +380501234567`,
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
  }

  async askForPassword(chatId) {
    await this.sendMessage(chatId, 
      `📝 *Реєстрація - Крок 5/8*\n\n` +
      `🔐 Будь ласка, створіть *пароль* для входу в систему:\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `⚠️ *Вимоги до паролю:*\n` +
      `• Мінімум 6 символів\n` +
      `• Містить літери та цифри\n\n` +
      `💡 *Приклад:* MyPass123`
    );
  }

  async askForCity(chatId) {
    try {
      const cities = await City.find({}).sort({ name: 1 });
      
      if (cities.length === 0) {
        await this.sendMessage(chatId, 
          `❌ *Помилка*\n\n` +
          `Список міст не знайдено. Зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Створюємо кнопки для вибору міста (по 2 в ряду)
      const cityButtons = [];
      for (let i = 0; i < cities.length; i += 2) {
        const row = [];
        row.push({ text: cities[i].name, callback_data: `city_${cities[i]._id}` });
        if (cities[i + 1]) {
          row.push({ text: cities[i + 1].name, callback_data: `city_${cities[i + 1]._id}` });
        }
        cityButtons.push(row);
      }

      await this.sendMessage(chatId, 
        `📝 *Реєстрація - Крок 6/8*\n\n` +
        `🏙️ Будь ласка, оберіть ваше *місто*:`,
        {
          reply_markup: {
            inline_keyboard: cityButtons
          }
        }
      );
    } catch (error) {
      logger.error('Помилка завантаження міст:', error);
      await this.sendMessage(chatId, 
        `❌ *Помилка*\n\n` +
        `Не вдалося завантажити список міст. Спробуйте пізніше.`
      );
    }
  }

  async askForPosition(chatId) {
    try {
      // Завантажуємо всі активні посади, виключаючи "адміністратор системи"
      // Виключаємо посади з назвами, що містять "адміністратор системи" (різні варіанти написання)
      const adminPositionTitles = [
        'адміністратор системи',
        'Адміністратор системи',
        'АДМІНІСТРАТОР СИСТЕМИ',
        'администратор системы',
        'Администратор системы',
        'System Administrator',
        'system administrator',
        'SYSTEM ADMINISTRATOR'
      ];
      
      const positions = await Position.find({
        isActive: true,
        title: { $nin: adminPositionTitles }
      }).sort({ title: 1 });
      
      // Додаткова перевірка на нечутливість до регістру
      const filteredPositions = positions.filter(position => {
        const titleLower = position.title.toLowerCase();
        return !titleLower.includes('адміністратор системи') && 
               !titleLower.includes('администратор системы') &&
               !titleLower.includes('system administrator');
      });
      
      if (filteredPositions.length === 0) {
        await this.sendMessage(chatId, 
          `❌ *Помилка*\n\n` +
          `Список посад не знайдено. Зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Створюємо кнопки для вибору посади (по 1 в ряду для кращої читабельності)
      const positionButtons = filteredPositions.map(position => [
        { text: position.title, callback_data: `position_${position._id}` }
      ]);

      await this.sendMessage(chatId, 
        `📝 *Реєстрація - Крок 7/8*\n\n` +
        `💼 Будь ласка, оберіть вашу *посаду*:`,
        {
          reply_markup: {
            inline_keyboard: positionButtons
          }
        }
      );
    } catch (error) {
      logger.error('Помилка завантаження посад:', error);
      await this.sendMessage(chatId, 
        `❌ *Помилка*\n\n` +
        `Не вдалося завантажити список посад. Спробуйте пізніше.`
      );
    }
  }

  async askForDepartment(chatId) {
    await this.sendMessage(chatId, 
      `📝 *Реєстрація - Крок 8/8*\n\n` +
      `🏢 Будь ласка, введіть назву вашого *відділу/закладу*:\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💡 *Приклад:* Бухгалтерія, Банкетний менеджер`
    );
  }

  async completeRegistration(chatId, userId, pendingRegistration) {
    try {
      // Перезавантажуємо pendingRegistration з БД, щоб отримати актуальні дані
      const freshPendingRegistration = await PendingRegistration.findById(pendingRegistration._id);
      if (!freshPendingRegistration) {
        logger.error('PendingRegistration не знайдено при завершенні реєстрації:', { userId, pendingRegistrationId: pendingRegistration._id });
        await this.sendMessage(chatId, '❌ Помилка: сесія реєстрації не знайдена. Почніть реєстрацію спочатку.');
        return;
      }
      
      // Використовуємо свіжі дані
      pendingRegistration = freshPendingRegistration;

      // Логуємо спробу завершення реєстрації
      logger.info('Спроба завершення реєстрації:', JSON.stringify({
        userId,
        step: pendingRegistration.step,
        hasCityId: !!pendingRegistration.data.cityId,
        cityId: pendingRegistration.data.cityId,
        hasPositionId: !!pendingRegistration.data.positionId,
        positionId: pendingRegistration.data.positionId,
        hasDepartment: !!pendingRegistration.data.department,
        department: pendingRegistration.data.department,
        fullData: pendingRegistration.data
      }, null, 2));

      // Перевіряємо, чи вказано місто
      if (!pendingRegistration.data.cityId) {
        logger.warn('Місто не вказано для реєстрації:', {
          userId,
          pendingRegistrationId: pendingRegistration._id,
          data: pendingRegistration.data
        });
        
        // Повертаємо користувача до кроку вибору міста
        pendingRegistration.step = 'city';
        await pendingRegistration.save();
        
        await this.sendMessage(chatId, 
          `❌ *Помилка реєстрації*\n\n` +
          `Місто не вказано. Будь ласка, оберіть місто для продовження реєстрації.`,
          { parse_mode: 'Markdown' }
        );
        
        // Показуємо список міст для вибору
        await this.askForCity(chatId);
        return;
      }

      // Логуємо дані до збереження
      logger.info('Завершення реєстрації, дані (до збереження):', JSON.stringify({
        userId,
        email: pendingRegistration.data.email,
        firstName: pendingRegistration.data.firstName,
        lastName: pendingRegistration.data.lastName,
        phone: pendingRegistration.data.phone,
        cityId: pendingRegistration.data.cityId,
        positionId: pendingRegistration.data.positionId,
        department: pendingRegistration.data.department,
        fullData: pendingRegistration.data
      }, null, 2));

      // Генеруємо унікальний логін
      const { generateUniqueLogin } = require('../utils/helpers');
      const login = await generateUniqueLogin(
        pendingRegistration.data.email,
        pendingRegistration.telegramInfo.username,
        userId,
        async (loginToCheck) => {
          const user = await User.findOne({ login: loginToCheck });
          return !!user;
        }
      );
      
      // Створюємо нового користувача
      const newUser = new User({
        telegramId: String(userId), // Конвертуємо в рядок, оскільки в схемі String
        login: login,
        firstName: pendingRegistration.data.firstName,
        lastName: pendingRegistration.data.lastName,
        email: pendingRegistration.data.email,
        phone: pendingRegistration.data.phone,
        password: pendingRegistration.data.password, // В реальному проекті потрібно хешувати
        city: pendingRegistration.data.cityId,
        position: pendingRegistration.data.positionId,
        department: pendingRegistration.data.department,
        telegramUsername: pendingRegistration.telegramInfo.username,
        isActive: false // Потребує активації адміністратором
      });

      await newUser.save();

      // Логуємо дані після збереження
      logger.info('Завершення реєстрації, дані (після збереження):', JSON.stringify({
        userId: newUser._id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        phone: newUser.phone,
        city: newUser.city,
        position: newUser.position,
        department: newUser.department
      }, null, 2));

      // Видаляємо запис про тимчасову реєстрацію
      await PendingRegistration.deleteOne({ _id: pendingRegistration._id });

      // Відправка WebSocket сповіщення про нову реєстрацію
      try {
        const registrationWebSocketService = require('./registrationWebSocketService');
        const populatedUser = await User.findById(newUser._id)
          .populate('position')
          .populate('city')
          .select('-password');
        
        await registrationWebSocketService.notifyNewRegistrationRequest(populatedUser);
        logger.info('✅ WebSocket сповіщення про нову реєстрацію (Telegram) відправлено успішно');
        
        // Отримуємо оновлену кількість запитів на реєстрацію та відправляємо оновлення
        const pendingCount = await User.countDocuments({ registrationStatus: 'pending' });
        registrationWebSocketService.notifyRegistrationCountUpdate(pendingCount);
        logger.info('✅ WebSocket оновлення кількості реєстрацій (Telegram) відправлено:', pendingCount);
      } catch (error) {
        logger.error('❌ Помилка при відправці WebSocket сповіщення (Telegram):', error);
      }

      await this.sendMessage(chatId, 
        `✅ *Реєстрацію завершено!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🎉 Дякуємо за реєстрацію!\n\n` +
        `📋 *Ваші дані:*\n` +
        `👤 *Ім'я:* ${pendingRegistration.data.firstName}\n` +
        `👤 *Прізвище:* ${pendingRegistration.data.lastName}\n` +
        `📧 *Email:* ${pendingRegistration.data.email}\n` +
        `📱 *Телефон:* ${pendingRegistration.data.phone}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `⏳ *Ваш акаунт очікує активації адміністратором*\n\n` +
        `📞 Після активації ви зможете користуватися всіма функціями бота.`
      );

      // Логуємо успішну реєстрацію
      logger.info(`Користувач успішно зареєстрований: ${pendingRegistration.data.firstName} ${pendingRegistration.data.lastName} (${userId})`);

    } catch (error) {
      logger.error('Помилка завершення реєстрації:', error);
      await this.sendMessage(chatId, 
        `❌ *Помилка реєстрації*\n\n` +
        `Виникла помилка при збереженні ваших даних.\n\n` +
        `📞 Зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  // Обробник зв'язку з адміністратором
  async handleContactAdminCallback(chatId) {
    try {
      await this.sendMessage(chatId, 
        `📞 *Зв'язок з адміністратором*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👨‍💼 *Контактна інформація:*\n\n` +
        `📧 Email: admin@helpdesk.com\n` +
        `📱 Телефон: +380 XX XXX XX XX\n` +
        `💬 Telegram: @admin_helpdesk\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `⏰ *Робочі години:* Пн-Пт 9:00-18:00\n` +
        `🕐 *Час відповіді:* До 24 годин`
      );
    } catch (error) {
      logger.error('Помилка відображення контактів адміністратора:', error);
      await this.sendMessage(chatId, 
        `❌ *Помилка*\n\n` +
        `Не вдалося завантажити контактну інформацію.\n` +
        `Спробуйте ще раз пізніше.`
      );
    }
  }

  // Обробник callback-запитів для реєстрації (вибір міста та посади)
  async handleRegistrationCallback(chatId, userId, data) {
    try {
      logger.info('Обробка callback для реєстрації:', { userId, data, chatId });
      
      // Конвертуємо userId в рядок для пошуку
      const pendingRegistration = await PendingRegistration.findOne({ 
        $or: [
          { telegramId: String(userId) },
          { telegramId: userId }
        ]
      });
      
      if (!pendingRegistration) {
        logger.warn('Сесія реєстрації не знайдена для callback:', { userId, data });
        await this.sendMessage(chatId, '❌ Сесія реєстрації не знайдена. Почніть реєстрацію спочатку.');
        return;
      }

      if (data.startsWith('city_')) {
        const cityId = data.replace('city_', '');
        logger.info('Обробка вибору міста:', { userId, cityId, currentStep: pendingRegistration.step });
        
        const city = await City.findById(cityId);
        
        if (!city) {
          logger.warn('Місто не знайдено в БД:', { userId, cityId });
          await this.sendMessage(chatId, '❌ Місто не знайдено. Спробуйте ще раз.');
          return;
        }

        logger.info('Місто знайдено, зберігаю в pendingRegistration:', { 
          userId, 
          cityId, 
          cityName: city.name,
          beforeSave: {
            cityId: pendingRegistration.data.cityId,
            step: pendingRegistration.step
          }
        });

        pendingRegistration.data.cityId = cityId;
        pendingRegistration.step = 'position';
        await pendingRegistration.save();

        logger.info('Місто збережено в pendingRegistration:', {
          userId,
          cityId: pendingRegistration.data.cityId,
          step: pendingRegistration.step,
          afterSave: pendingRegistration.data
        });

        await this.sendMessage(chatId, `✅ Місто обрано: ${city.name}`);
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
        
      } else if (data.startsWith('position_')) {
        const positionId = data.replace('position_', '');
        const position = await Position.findById(positionId);
        
        if (!position) {
          await this.sendMessage(chatId, '❌ Посада не знайдена. Спробуйте ще раз.');
          return;
        }

        // Перевірка, чи не обрано посаду "адміністратор системи"
        const titleLower = position.title.toLowerCase();
        const isAdminPosition = titleLower.includes('адміністратор системи') || 
                               titleLower.includes('администратор системы') ||
                               titleLower.includes('system administrator');
        
        if (isAdminPosition) {
          await this.sendMessage(chatId, 
            `❌ *Помилка*\n\n` +
            `Ця посада недоступна для реєстрації через бота.\n\n` +
            `📞 Зверніться до адміністратора для отримання доступу: [@Kultup](https://t.me/Kultup)`,
            { parse_mode: 'Markdown' }
          );
          return;
        }

        pendingRegistration.data.positionId = positionId;
        pendingRegistration.step = 'department';
        await pendingRegistration.save();

        await this.sendMessage(chatId, `✅ Посада обрана: ${position.title}`);
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
      }

    } catch (error) {
      logger.error('Помилка при обробці callback реєстрації:', error);
      await this.sendMessage(chatId, '❌ Виникла помилка. Спробуйте ще раз.');
    }
  }

  /**
   * Відправка сповіщення про схвалення реєстрації
   * @param {Object} user - Користувач
   */
  async sendRegistrationApprovedNotification(user) {
    try {
      if (!user.telegramId) {
        logger.info(`Користувач ${user.email} не має Telegram ID для сповіщення про схвалення`);
        return;
      }

      const message = 
        `✅ *Реєстрацію схвалено!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🎉 Вітаємо! Ваша заявка на реєстрацію була схвалена адміністратором.\n\n` +
        `👤 *Ім'я:* ${user.firstName} ${user.lastName}\n` +
        `📧 *Email:* ${user.email}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🔐 Тепер ви можете увійти в систему, використовуючи свої облікові дані.\n\n` +
        `💡 Якщо у вас виникнуть питання, зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`;

      await this.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
      logger.info(`Сповіщення про схвалення реєстрації відправлено користувачу: ${user.email}`);
    } catch (error) {
      logger.error(`Помилка відправки сповіщення про схвалення реєстрації користувачу ${user.email}:`, error);
      throw error;
    }
  }

  /**
   * Відправка сповіщення про відхилення реєстрації
   * @param {Object} user - Користувач
   * @param {string} reason - Причина відхилення
   */
  async sendRegistrationRejectedNotification(user, reason) {
    try {
      if (!user.telegramId) {
        logger.info(`Користувач ${user.email} не має Telegram ID для сповіщення про відхилення`);
        return;
      }

      const message = 
        `❌ *Реєстрацію відхилено*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `😔 На жаль, ваша заявка на реєстрацію була відхилена адміністратором.\n\n` +
        `👤 *Ім'я:* ${user.firstName} ${user.lastName}\n` +
        `📧 *Email:* ${user.email}\n\n` +
        `📝 *Причина відхилення:*\n${reason || 'Причину не вказано'}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🔄 Ви можете спробувати зареєструватися знову, виправивши зазначені проблеми.\n\n` +
        `📞 Якщо у вас є питання, зверніться до адміністратора: [@Kultup](https://t.me/Kultup)`;

      await this.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
      logger.info(`Сповіщення про відхилення реєстрації відправлено користувачу: ${user.email}`);
    } catch (error) {
      logger.error(`Помилка відправки сповіщення про відхилення реєстрації користувачу ${user.email}:`, error);
      throw error;
    }
  }
}

module.exports = TelegramService;