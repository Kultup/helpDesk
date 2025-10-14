const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const User = require('../models/User');
const City = require('../models/City');
const Position = require('../models/Position');
const Ticket = require('../models/Ticket');

class TelegramService {
  constructor() {
    this.isInitialized = false;
    this.bot = null;
    this.userSessions = new Map();
    this.userStates = new Map();
  }

  async initialize() {
    try {
      const TelegramBot = require('node-telegram-bot-api');
      
      // Отримуємо налаштування бота з .env файлу
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      
      if (!botToken) {
        logger.warn('⚠️ Telegram bot token не знайдено в .env файлі');
        return false;
      }

      // Ініціалізуємо бота з токеном
      this.bot = new TelegramBot(botToken, { polling: true });
      this.isInitialized = true;

      // Налаштовуємо обробники подій
      this.setupEventHandlers();

      logger.telegram('✅ Telegram бот успішно ініціалізовано');
      return true;
    } catch (error) {
      logger.error('❌ Помилка ініціалізації Telegram бота:', error);
      this.isInitialized = false;
      return false;
    }
  }

  setupEventHandlers() {
    if (!this.bot) return;

    // Обробники повідомлень тепер працюють через webhook
    // Залишаємо цей метод для сумісності, але обробники видалені
    logger.info('Event handlers налаштовані для роботи через webhook');
  }

  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Обробка контактів (номер телефону)
    if (msg.contact) {
      await this.handleContact(msg);
      return;
    }

    if (!text) return;

    // Обробка команд
    if (text.startsWith('/')) {
      await this.handleCommand(chatId, text);
      return;
    }

    // Обробка текстових повідомлень в залежності від поточного стану
    const currentState = this.getCurrentState(chatId);
    if (currentState === 'registration') {
      const session = this.userSessions.get(chatId);
      if (session) {
        await this.handleRegistrationStep(chatId, text, session);
      } else {
        // Якщо сесія не знайдена, повертаємося до початку
        await this.bot.sendMessage(chatId, 
          'Сесія реєстрації втрачена. Почніть спочатку з команди /start'
        );
        this.popState(chatId);
      }
    } else {
      // За замовчуванням пропонуємо використати команди
      await this.bot.sendMessage(chatId, 
        'Для початку роботи використайте команду /start'
      );
    }
  }

  async handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    const data = query.data;

    // Підтверджуємо отримання callback
    await this.bot.answerCallbackQuery(query.id);

    // Обробляємо різні типи callback
    if (data === 'main_menu') {
      await this.handleStartCommand(chatId);
    } else if (data === 'my_tickets') {
      await this.handleMyTicketsCallback(chatId);
    } else if (data === 'create_ticket') {
      await this.handleCreateTicketCallback(chatId);
    } else if (data === 'settings') {
      await this.handleSettingsCallback(chatId);
    } else if (data === 'registration') {
      await this.handleRegisterCallback(chatId);
    } else if (data === 'cancel') {
      await this.handleCancelCallback(chatId);
    } else if (data.startsWith('view_ticket_')) {
      const user = await this.findUserByTelegramId(chatId);
      await this.handleViewTicketCallback(chatId, data, user);
    } else if (data === 'check_status') {
      await this.handleCheckStatusCallback(chatId);
    } else if (data === 'contact_support') {
      await this.handleContactSupportCallback(chatId);
    } else if (data === 'help_info') {
      await this.handleHelpInfoCallback(chatId);
    } else if (data === 'statistics') {
      await this.handleStatisticsCallback(chatId);
    } else if (data.startsWith('city_')) {
      const user = await this.findUserByTelegramId(chatId);
      await this.handleCityCallback(chatId, data, user);
    } else if (data.startsWith('position_')) {
      const user = await this.findUserByTelegramId(chatId);
      await this.handlePositionCallback(chatId, data, user);
    }
    // Додати інші обробники за потреби
  }

  async handleCommand(chatId, command) {
    switch (command) {
      case '/start':
        await this.handleStartCommand(chatId);
        break;
      case '/help':
        await this.bot.sendMessage(chatId, 
          'Доступні команди:\n' +
          '/start - Почати роботу\n' +
          '/help - Показати це повідомлення'
        );
        break;
      default:
        // Для невідомих команд пропонуємо використати /start
        await this.bot.sendMessage(chatId, 
          'Невідома команда. Використайте /start для початку роботи або /help для довідки.'
        );
    }
  }

  /**
   * Обробка команди /start з перевіркою статусу реєстрації
   */
  async handleStartCommand(chatId) {
    try {
      // Перевіряємо чи користувач зареєстрований
      const user = await this.findUserByTelegramId(chatId);
      
      // Додаємо логування для діагностики
      logger.info(`handleStartCommand для chatId: ${chatId}`);
      if (user) {
        logger.info(`Знайдено користувача: ${user.firstName} ${user.lastName}, registrationStatus: ${user.registrationStatus}, isActive: ${user.isActive}`);
      } else {
        logger.info(`Користувача з telegramId ${chatId} не знайдено`);
      }
      
      if (user && user.registrationStatus === 'approved') {
        // Користувач зареєстрований та підтверджений - показуємо дашборд
        await this.showUserDashboard(chatId, user);
      } else if (user && user.registrationStatus === 'pending') {
        // Користувач зареєстрований, але очікує підтвердження
        await this.showPendingMessage(chatId);
      } else {
        // Користувач не зареєстрований - пропонуємо реєстрацію
        await this.showRegistrationOffer(chatId);
      }
    } catch (error) {
      logger.error('Помилка в handleStartCommand:', error);
      await this.bot.sendMessage(chatId, 'Виникла помилка. Спробуйте ще раз.');
    }
   }

  /**
   * Показ дашборду для зареєстрованих користувачів
   */
  async showUserDashboard(chatId, user) {
    try {
      logger.info(`showUserDashboard викликано для chatId: ${chatId}, користувач: ${user.firstName} ${user.lastName}`);
      
      const welcomeMessage = `🎉 Вітаємо, ${user.firstName} ${user.lastName}!\n\n` +
        `👤 Ваш профіль:\n` +
        `📧 Email: ${user.email}\n` +
        `🏢 Заклад: ${user.department}\n` +
        `📍 Місто: ${user.city?.name || 'Не вказано'}\n` +
        `💼 Посада: ${user.position?.title || 'Не вказано'}\n\n` +
        `Оберіть дію:`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '🎫 Мої тікети', callback_data: 'my_tickets' }],
          [{ text: '📝 Створити тікет', callback_data: 'create_ticket' }],в
          [{ text: '⚙️ Налаштування', callback_data: 'settings' }],
          [{ text: '📊 Статистика', callback_data: 'statistics' }]
        ]
      };

      await this.bot.sendMessage(chatId, welcomeMessage, { reply_markup: keyboard });
      logger.info(`showUserDashboard успішно відправлено для chatId: ${chatId}`);
    } catch (error) {
      logger.error(`Помилка в showUserDashboard для chatId: ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Показ повідомлення про очікування підтвердження
   */
  async showPendingMessage(chatId) {
    const message = `⏳ Ваша заявка на реєстрацію очікує підтвердження адміністратора.\n\n` +
      `📋 Статус: В обробці\n` +
      `🕐 Зазвичай розгляд займає до 24 годин.\n\n` +
      `Ви отримаєте повідомлення, коли заявка буде розглянута.\n\n` +
      `Дякуємо за терпіння! 🙏`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔄 Перевірити статус', callback_data: 'check_status' }],
        [{ text: '📞 Зв\'язатися з підтримкою', callback_data: 'contact_support' }]
      ]
    };

    await this.bot.sendMessage(chatId, message, { reply_markup: keyboard });
  }

  /**
   * Показ пропозиції реєстрації для нових користувачів
   */
  async showRegistrationOffer(chatId) {
    try {
      logger.info(`showRegistrationOffer викликано для chatId: ${chatId}`);
      
      const message = `👋 Вітаємо в системі технічної підтримки!\n\n` +
        `🔐 Для використання бота необхідно пройти реєстрацію.\n\n` +
        `📝 Процес реєстрації включає:\n` +
        `• Введення особистих даних\n` +
        `• Вибір міста та посади\n` +
        `• Вказання закладу\n` +
        `• Підтвердження контактних даних\n\n` +
        `⏱️ Займе всього кілька хвилин.\n\n` +
        `Розпочати реєстрацію?`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '✅ Розпочати реєстрацію', callback_data: 'registration' }],
          [{ text: '❓ Довідка', callback_data: 'help_info' }],
          [{ text: '📞 Зв\'язатися з підтримкою', callback_data: 'contact_support' }]
        ]
      };

      await this.bot.sendMessage(chatId, message, { reply_markup: keyboard });
      logger.info(`showRegistrationOffer успішно відправлено для chatId: ${chatId}`);
    } catch (error) {
      logger.error(`Помилка в showRegistrationOffer для chatId: ${chatId}:`, error);
      throw error;
    }
  }

  pushState(chatId, state) {
    let states = this.userStates.get(chatId);
    if (!states) {
      states = [];
      this.userStates.set(chatId, states);
    }
    states.push(state);
  }

  popState(chatId) {
    const states = this.userStates.get(chatId);
    if (states && states.length > 0) {
      return states.pop();
    }
    return null;
  }

  getCurrentState(chatId) {
    const states = this.userStates.get(chatId);
    return states && states.length > 0 ? states[states.length - 1] : 'main';
  }

  async showMainMenu(chatId, user) {
    this.pushState(chatId, 'create_ticket');
    const keyboard = {
      inline_keyboard: [
        [{ text: 'Мої тікети', callback_data: 'my_tickets' }],
        [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
        [{ text: 'Налаштування', callback_data: 'settings' }],
      ]
    };
    if (!user) {
      keyboard.inline_keyboard.push([{ text: 'Реєстрація', callback_data: 'registration' }]);
    }
    await this.bot.sendMessage(chatId, 'Головне меню:', { reply_markup: keyboard });
  }

  async showMenuForState(chatId, state) {
    const user = await this.findUserByTelegramId(chatId);
    switch (state) {
      case 'main':
        await this.showMainMenu(chatId, user);
        break;
      case 'registration':
        await this.handleRegisterCallback(chatId, user);
        break;
      case 'my_tickets':
        await this.handleMyTicketsCallback(chatId, user);
        break;
      case 'create_ticket':
        await this.handleCreateTicketCallback(chatId, user);
        break;
      case 'settings':
        await this.handleSettingsCallback(chatId, user);
        break;
      default:
        await this.showMainMenu(chatId, user);
    }
  }

  /**
   * Початок роботи
   */  async start() {
    // Перевіряємо ініціалізацію бота
    if (!this.isInitialized || !this.bot) {
      logger.error('Telegram Bot - Помилка відправки повідомлення про реєстрацію:', error);
      return;
    }

    try {
      await this.bot.startPolling();
      this.isInitialized = true;
      logger.telegram('Telegram бот запущено');
    } catch (error) {
      logger.error('Telegram Bot - Помилка відправки повідомлення про реєстрацію:', error);
      return;
    }
  }

  /**
   * Обробка реєстрації
   */
  async handleRegistrationStep(chatId, text, session) {
    try {
      switch (session.step) {
        case 'firstName':
          if (text.trim() === '') {
            await this.bot.sendMessage(chatId, 
              '❌ Ім\'я не може бути порожнім. Спробуйте ще раз:', {
                reply_markup: this.getNavigationKeyboard()
              }
            );
            return;
          }
          session.data.firstName = text;
          session.step = 'lastName';
          
          // Зберігаємо оновлену сесію
          this.userSessions.set(chatId, session);
          
          await this.bot.sendMessage(chatId, 
            '👤 Введіть ваше прізвище:', {
              reply_markup: this.getNavigationKeyboard()
            }
          );
          break;

        case 'lastName':
          if (text.trim() === '') {
            await this.bot.sendMessage(chatId, 
              '❌ Прізвище не може бути порожнім. Спробуйте ще раз:', {
                reply_markup: this.getNavigationKeyboard()
              }
            );
            return;
          }
          session.data.lastName = text;
          session.step = 'email';
          
          // Зберігаємо оновлену сесію
          this.userSessions.set(chatId, session);
          
          await this.bot.sendMessage(chatId, 
            '📧 Введіть ваш email:', {
              reply_markup: this.getNavigationKeyboard()
            }
          );
          break;

        case 'email':
          // Валідація email
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(text.trim())) {
            await this.bot.sendMessage(chatId, 
              '❌ Невірний формат email. Спробуйте ще раз:', {
                reply_markup: this.getNavigationKeyboard()
              }
            );
            return;
          }
          session.data.email = text.trim();
          session.step = 'password';
          
          // Зберігаємо оновлену сесію
          this.userSessions.set(chatId, session);
          
          await this.bot.sendMessage(chatId, 
            '🔒 Введіть пароль (мінімум 6 символів):', {
              reply_markup: this.getNavigationKeyboard()
            }
          );
          break;

        case 'password':
          if (text.trim().length < 6) {
            await this.bot.sendMessage(chatId, 
              '❌ Пароль повинен містити мінімум 6 символів. Спробуйте ще раз:', {
                reply_markup: this.getNavigationKeyboard()
              }
            );
            return;
          }
          session.data.password = text.trim();
          session.step = 'city';
          
          // Зберігаємо оновлену сесію
          this.userSessions.set(chatId, session);
          
          // Завантажуємо список міст та показуємо клавіатуру
          const cities = await this.loadCities();
          if (cities.length > 0) {
            await this.bot.sendMessage(chatId, 
              '🏙️ Оберіть ваше місто:', {
                reply_markup: this.getCitiesKeyboard(cities)
              }
            );
          } else {
            await this.bot.sendMessage(chatId, 
              '🏙️ Введіть ваше місто:', {
                reply_markup: this.getNavigationKeyboard()
              }
            );
          }
          break;

        case 'city':
          // Цей крок тепер обробляється тільки через клавіатури
          await this.bot.sendMessage(chatId, 
            '🏙️ Будь ласка, оберіть місто з клавіатури вище.', {
              reply_markup: this.getNavigationKeyboard()
            }
          );
          break;

        case 'position':
          // Цей крок тепер обробляється тільки через клавіатури
          await this.bot.sendMessage(chatId, 
            '💼 Будь ласка, оберіть посаду з клавіатури вище.', {
              reply_markup: this.getNavigationKeyboard()
            }
          );
          break;

        case 'department':
          if (text.trim() === '') {
            await this.bot.sendMessage(chatId, 
              '❌ Заклад не може бути порожнім. Спробуйте ще раз:', {
                reply_markup: this.getNavigationKeyboard()
              }
            );
            return;
          }
          session.data.department = text;
          session.step = 'phone';
          
          // Зберігаємо оновлену сесію
          this.userSessions.set(chatId, session);
          
          // Запитуємо номер телефону через кнопку "Поділитися контактом"
          await this.bot.sendMessage(chatId, 
            '📱 Поділіться вашим номером телефону:', {
              reply_markup: {
                keyboard: [
                  [{ text: '📱 Поділитися контактом', request_contact: true }],
                  [{ text: '🔙 Назад', callback_data: 'back' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            }
          );
          break;

        case 'phone':
          // Цей крок обробляється через кнопку "Поділитися контактом"
          await this.bot.sendMessage(chatId, 
            '📱 Будь ласка, скористайтеся кнопкою "Поділитися контактом" нижче.', {
              reply_markup: {
                keyboard: [
                  [{ text: '📱 Поділитися контактом', request_contact: true }],
                  [{ text: '🔙 Назад', callback_data: 'back' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            }
          );
          break;
      }
    } catch (error) {
      logger.error('Помилка в handleRegistrationStep:', error);
      await this.bot.sendMessage(chatId, 'Виникла помилка. Повертаюся до попереднього меню.');
      this.popState(chatId);
      await this.showMenuForState(chatId, this.getCurrentState(chatId) || 'main');
    }
  }

  /**
   * Завершення реєстрації
   */
  async completeRegistration(chatId, session) {
    try {
      // Конвертуємо текстові значення в ObjectId
      const registrationData = {
        ...session.data,
        telegramId: chatId.toString()
      };

      // Видаляємо positionId та cityId, оскільки вони не потрібні для API
      delete registrationData.positionId;
      delete registrationData.cityId;

      // Знаходимо ObjectId для посади
      if (registrationData.position) {
        const position = await Position.findOne({ title: registrationData.position });
        if (position) {
          registrationData.position = position._id;
        } else {
          await this.bot.sendMessage(chatId, 
            `❌ Посада "${registrationData.position}" не знайдена. Спробуйте ще раз.`, {
              reply_markup: this.getNavigationKeyboard()
            }
          );
          return;
        }
      }

      // Знаходимо ObjectId для міста
      if (registrationData.city) {
        const city = await City.findOne({ name: registrationData.city });
        if (city) {
          registrationData.city = city._id;
        } else {
          await this.bot.sendMessage(chatId, 
            `❌ Місто "${registrationData.city}" не знайдено. Спробуйте ще раз.`, {
              reply_markup: this.getNavigationKeyboard()
            }
          );
          return;
        }
      }

      const response = await fetch(`${process.env.API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData)
      });

      if (response.ok) {
        this.userSessions.delete(chatId);
        await this.bot.sendMessage(chatId, 
          '✅ Заявка на реєстрацію успішно подана!\n\n' +
          '⏳ Ваша заявка очікує підтвердження адміністратора.\n' +
          'Ви отримаєте повідомлення, коли заявка буде розглянута.\n\n' +
          'Дякуємо за терпіння!', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🏠 Головне меню', callback_data: 'main_menu' }]
              ]
            }
          }
        );
      } else {
        const error = await response.json();
        await this.bot.sendMessage(chatId, 
          `❌ Помилка реєстрації: ${error.message || 'Невідома помилка'}`, {
            reply_markup: this.getNavigationKeyboard()
          }
        );
      }
    } catch (error) {
      logger.error('Помилка завершення реєстрації:', error);
      await this.bot.sendMessage(chatId, 'Помилка сервера. Спробуйте пізніше.');
    }
  }

  /**
   * Обробка кроків створення тікету
   */
  async handleTicketCreationStep(chatId, text, session) {
    try {
      switch (session.step) {
        case 'title':
          if (text.length < 5) {
            await this.bot.sendMessage(chatId, 
              '❌ Заголовок повинен містити мінімум 5 символів. Спробуйте ще раз:', {
                reply_markup: this.getNavigationKeyboard()
              }
            );
            return;
          }

          session.data.title = text;
          session.step = 'description';
          
          await this.bot.sendMessage(chatId, 
            '📝 Введіть опис проблеми:', {
              reply_markup: this.getNavigationKeyboard()
            }
          );
          break;

        case 'description':
          if (text.length < 10) {
            await this.bot.sendMessage(chatId, 
              '❌ Опис повинен містити мінімум 10 символів. Спробуйте ще раз:', {
                reply_markup: this.getNavigationKeyboard()
              }
            );
            return;
          }

          session.data.description = text;
          session.step = 'category';
          
          await this.bot.sendMessage(chatId, 
            '📂 Оберіть категорію тікету:', {
              reply_markup: this.getCategoryKeyboard()
            }
          );
          break;
      }
    } catch (error) {
      logger.error('Помилка в handleTicketCreationStep:', error);
      await this.bot.sendMessage(chatId, 'Виникла помилка. Спробуйте ще раз.');
    }
  }

  /**
   * Обробка вибору категорії тікету
   */
  async handleCategoryCallback(chatId, data, user) {
    const session = this.userSessions.get(chatId);
    if (!session || session.action !== 'create_ticket') {
      return;
    }

    const category = data.replace('category_', '');
    session.data.category = category;
    session.step = 'priority';
    
    await this.bot.sendMessage(chatId, 
      '⚡ Оберіть пріоритет тікету:', {
        reply_markup: this.getTicketCreationKeyboard()
      }
    );
  }

  /**
   * Обробка вибору пріоритету тікету
   */
  async handlePriorityCallback(chatId, data, user) {
    const session = this.userSessions.get(chatId);
    if (!session || session.action !== 'create_ticket') {
      return;
    }

    const priority = data.replace('priority_', '');
    session.data.priority = priority;
    
    await this.completeTicketCreation(chatId, session, user);
  }

  /**
   * Завершення створення тікету
   */
  async completeTicketCreation(chatId, session, user) {
    try {
      const ticketData = {
        ...session.data,
        city: user.city?._id || user.city?.id || user.city // Передаємо ID міста
      };

      // Детальне логування для діагностики
      logger.info('Telegram Bot - Створення тікету:', {
        chatId,
        ticketData: JSON.stringify(ticketData, null, 2),
        sessionData: JSON.stringify(session.data, null, 2)
      });

      const response = await fetch(`${process.env.API_BASE_URL}/tickets`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify(ticketData)
      });

      if (response.ok) {
        const ticket = await response.json();
        this.userSessions.delete(chatId);
        
        const priorityEmoji = this.getPriorityEmoji(ticket.priority);
        await this.bot.sendMessage(chatId, 
          `✅ Тікет успішно створено!\n\n` +
          `🎫 ID: ${ticket._id}\n` +
          `📋 Заголовок: ${ticket.title}\n` +
          `${priorityEmoji} Пріоритет: ${this.getPriorityText(ticket.priority)}\n` +
          `📅 Створено: ${this.formatDate(ticket.createdAt)}`, {
            reply_markup: this.getNavigationKeyboard()
          }
        );
      } else {
        const error = await response.json();
        logger.error('Telegram Bot - Помилка створення тікету:', {
          status: response.status,
          error: error,
          ticketData: JSON.stringify(ticketData, null, 2)
        });
        
        await this.bot.sendMessage(chatId, 
          `❌ Помилка створення тікету: ${error.message || 'Невідома помилка'}`, {
            reply_markup: this.getNavigationKeyboard()
          }
        );
      }
    } catch (error) {
      logger.error('Помилка завершення створення тікету:', error);
      await this.bot.sendMessage(chatId, 'Помилка сервера. Спробуйте пізніше.');
    }
  }

  /**
   * Обробка кроку коментування
   */
  async handleCommentStep(chatId, text, session) {
    try {
      const { ticketId } = session.data;
      const user = await this.findUserByTelegramId(chatId);

      const commentData = {
        content: text,
        author: user._id
      };

      const response = await fetch(`${process.env.API_BASE_URL}/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify(commentData)
      });

      if (response.ok) {
        this.userSessions.delete(chatId);
        await this.bot.sendMessage(chatId, 
          '✅ Коментар успішно додано!', {
            reply_markup: this.getNavigationKeyboard()
          }
        );
      } else {
        await this.bot.sendMessage(chatId, 
          '❌ Помилка додавання коментаря. Спробуйте ще раз.', {
            reply_markup: this.getNavigationKeyboard()
          }
        );
      }
    } catch (error) {
      logger.error('Помилка додавання коментаря:', error);
      await this.bot.sendMessage(chatId, 'Помилка сервера. Спробуйте пізніше.');
    }
  }

  /**
   * Відображення тікетів користувача з фільтром
   */
  async displayUserTickets(chatId, userId, status = null) {
    try {
      let url = `${process.env.API_BASE_URL}/tickets?createdBy=${userId}`;
      if (status) {
        url += `&status=${status}`;
      }

      const response = await fetch(url);
      
      if (response.ok) {
        const tickets = await response.json();
        
        if (tickets.length === 0) {
          const statusText = status ? this.getStatusText(status) : 'всіх статусів';
          await this.bot.sendMessage(chatId, 
            `📋 Тікетів зі статусом "${statusText}" не знайдено.`, {
              reply_markup: this.getNavigationKeyboard()
            }
          );
          return;
        }

        const ticketsList = tickets.slice(0, 10).map(ticket => {
          const statusEmoji = this.getStatusEmoji(ticket.status);
          const priorityEmoji = this.getPriorityEmoji(ticket.priority);
          return `${statusEmoji} ${ticket.title}\n${priorityEmoji} ${this.getPriorityText(ticket.priority)} | 📅 ${this.formatDate(ticket.createdAt)}`;
        }).join('\n\n');

        const keyboard = {
          inline_keyboard: [
            ...tickets.slice(0, 5).map(ticket => [{
              text: `👁️ ${ticket.title.substring(0, 30)}${ticket.title.length > 30 ? '...' : ''}`,
              callback_data: `view_ticket_${ticket._id}`
            }]),
            [
              { text: '🔙 Назад', callback_data: 'my_tickets' },
              { text: '🏠 Головне меню', callback_data: 'main_menu' }
            ]
          ]
        };

        await this.bot.sendMessage(chatId, 
          `📋 Ваші тікети:\n\n${ticketsList}`, {
            reply_markup: keyboard
          }
        );
      } else {
        await this.bot.sendMessage(chatId, 'Помилка завантаження тікетів! ⚠️');
      }
    } catch (error) {
      logger.error('Помилка відображення тікетів:', error);
      await this.bot.sendMessage(chatId, 'Помилка сервера. Спробуйте пізніше.');
    }
  }

  /**
   * Форматування деталей тікету
   */
  formatTicketDetails(ticket) {
    const statusEmoji = this.getStatusEmoji(ticket.status);
    const priorityEmoji = this.getPriorityEmoji(ticket.priority);
    
    return `🎫 Деталі тікету\n\n` +
      `📋 Заголовок: ${ticket.title}\n` +
      `📝 Опис: ${ticket.description}\n` +
      `${statusEmoji} Статус: ${this.getStatusText(ticket.status)}\n` +
      `${priorityEmoji} Пріоритет: ${this.getPriorityText(ticket.priority)}\n` +
      `📅 Створено: ${this.formatDate(ticket.createdAt)}\n` +
      `👤 Автор: ${ticket.createdBy?.email || 'Невідомо'}` +
      (ticket.assignedTo ? `\n🔧 Призначено: ${ticket.assignedTo.email}` : '') +
      (ticket.resolvedAt ? `\n✅ Вирішено: ${this.formatDate(ticket.resolvedAt)}` : '');
  }

  /**
   * Обробка реєстрації через callback
   */
  async handleRegisterCallback(chatId, user) {
    if (user) {
      await this.bot.sendMessage(chatId, 'Ви вже зареєстровані! ✅', {
        reply_markup: this.getNavigationKeyboard()
      });
      return;
    }

    this.pushState(chatId, 'registration');
    this.userSessions.set(chatId, {
      action: 'registration',
      step: 'firstName',
      data: {}
    });

    await this.bot.sendMessage(chatId, 
      '📝 Почнемо реєстрацію!\n\n👤 Введіть ваше ім\'я:', {
        reply_markup: this.getNavigationKeyboard()
      }
    );
  }

  /**
   * Обробка "Мої тікети" через callback
   */
  async handleMyTicketsCallback(chatId, user) {
    if (!user) {
      await this.bot.sendMessage(chatId, 'Спочатку потрібно зареєструватися! 🔐', {
        reply_markup: this.getMainMenuKeyboard(null)
      });
      return;
    }

    this.pushState(chatId, 'my_tickets');
    await this.bot.sendMessage(chatId, 
      'Оберіть фільтр для перегляду тікетів:', {
        reply_markup: this.getTicketsViewKeyboard()
      }
    );
  }

  /**
   * Обробка створення тікету через callback
   */
  async handleCreateTicketCallback(chatId, user) {
    if (!user) {
      await this.bot.sendMessage(chatId, 'Спочатку потрібно зареєструватися! 🔐', {
        reply_markup: this.getMainMenuKeyboard(null)
      });
      return;
    }

    // Показуємо варіанти створення тікету
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📋 Використати шаблон', callback_data: 'create_with_template' },
          { text: '✏️ Створити вручну', callback_data: 'create_manual' }
        ],
        [
          { text: '🔙 Назад', callback_data: 'main_menu' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId,
      '🎫 *Створення нового тикету*\n\n' +
      'Оберіть спосіб створення тікету:',
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  /**
   * Обробка налаштувань через callback
   */
  async handleSettingsCallback(chatId, user) {
    if (!user) {
      await this.bot.sendMessage(chatId, 'Спочатку потрібно зареєструватися! 🔐', {
        reply_markup: this.getMainMenuKeyboard(null)
      });
      return;
    }

    this.pushState(chatId, 'settings');
    const settingsText = `⚙️ Налаштування профілю\n\n` +
      `📧 Email: ${user.email}\n` +
      `👤 Посада: ${user.position || 'Не вказано'}\n` +
      `🏙️ Місто: ${user.city || 'Не вказано'}\n` +
      `🆔 Telegram ID: ${user.telegramId}`;

    await this.bot.sendMessage(chatId, settingsText, {
      reply_markup: this.getNavigationKeyboard()
    });
  }

  /**
   * Обробка фільтрації тікетів
   */
  async handleTicketFilterCallback(chatId, filterData, user) {
    if (!user) {
      await this.bot.sendMessage(chatId, 'Помилка доступу! 🚫');
      return;
    }

    const statusMap = {
      'tickets_all': null,
      'tickets_open': 'open',
      'tickets_in_progress': 'in_progress',
      'tickets_resolved': 'resolved',
      'tickets_closed': 'closed'
    };

    const status = statusMap[filterData];
    await this.displayUserTickets(chatId, user._id, status);
  }

  /**
   * Обробка скасування
   */
  async handleCancelCallback(chatId) {
    this.userSessions.delete(chatId);
    this.popState(chatId);
    const currentState = this.getCurrentState(chatId) || 'main';
    await this.showMenuForState(chatId, currentState);
  }

  /**
   * Обробка перегляду конкретного тікету
   */
  async handleViewTicketCallback(chatId, data, user) {
    const ticketId = data.replace('view_ticket_', '');
    
    try {
      const response = await fetch(`${process.env.API_BASE_URL}/tickets/${ticketId}`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      
      if (response.ok) {
        const ticket = await response.json();
        const ticketText = this.formatTicketDetails(ticket);
        
        await this.bot.sendMessage(chatId, ticketText, {
          reply_markup: this.getTicketActionKeyboard(ticketId)
        });
      } else {
        await this.bot.sendMessage(chatId, 'Тікет не знайдено! ❌');
      }
    } catch (error) {
      logger.error('Помилка отримання тікету:', error);
      await this.bot.sendMessage(chatId, 'Помилка завантаження тікету! ⚠️');
    }
  }

  /**
   * Обробка коментування тікету
   */
  async handleCommentTicketCallback(chatId, data, user) {
    const ticketId = data.replace('comment_ticket_', '');
    
    this.userSessions.set(chatId, {
      action: 'comment_ticket',
      step: 'comment',
      data: { ticketId }
    });

    await this.bot.sendMessage(chatId, 
      '💬 Введіть ваш коментар до тікету:', {
        reply_markup: this.getNavigationKeyboard()
      }
    );
  }

  /**
   * Обробка вибору посади
   */
  async handlePositionCallback(chatId, data, user) {
    const positionId = data.replace('position_', '');
    const session = this.userSessions.get(chatId);
    
    if (!session || session.action !== 'registration' || session.step !== 'position') {
       await this.bot.sendMessage(chatId, 'Помилка: неправильний стан реєстрації.');
       return;
     }

    try {
      // Знаходимо посаду за ID
      const position = await Position.findById(positionId);
      if (!position) {
        await this.bot.sendMessage(chatId, 'Помилка: посада не знайдена.');
        return;
      }

      session.data.position = position.title;
      session.data.positionId = positionId;
      session.step = 'department';
      
      // Зберігаємо оновлену сесію
      this.userSessions.set(chatId, session);
      
      await this.bot.sendMessage(chatId, 
        `✅ Обрано посаду: ${position.title}\n\n🏢 Введіть ваш заклад:`, {
          reply_markup: this.getNavigationKeyboard()
        }
      );
    } catch (error) {
      logger.error('Помилка в handlePositionCallback:', error);
      await this.bot.sendMessage(chatId, 'Виникла помилка. Спробуйте ще раз.');
    }
  }

  /**
   * Обробка вибору міста
   */
  async handleCityCallback(chatId, data, user) {
    const cityId = data.replace('city_', '');
    const session = this.userSessions.get(chatId);
    
    if (!session || session.action !== 'registration' || session.step !== 'city') {
       await this.bot.sendMessage(chatId, 'Помилка: неправильний стан реєстрації.');
       return;
     }

    try {
      // Знаходимо місто за ID
      const city = await City.findById(cityId);
      if (!city) {
        await this.bot.sendMessage(chatId, 'Помилка: місто не знайдено.');
        return;
      }

      session.data.city = city.name;
      session.data.cityId = cityId;
      session.step = 'position';
      
      // Зберігаємо оновлену сесію
      this.userSessions.set(chatId, session);
      
      // Завантажуємо список посад та показуємо клавіатуру
      const positions = await this.loadPositions();
      if (positions.length > 0) {
        await this.bot.sendMessage(chatId, 
          `✅ Обрано місто: ${city.name}\n\n💼 Оберіть вашу посаду:`, {
            reply_markup: this.getPositionsKeyboard(positions)
          }
        );
      } else {
        await this.bot.sendMessage(chatId, 
          `✅ Обрано місто: ${city.name}\n\n💼 Введіть вашу посаду:`, {
            reply_markup: this.getNavigationKeyboard()
          }
        );
      }
    } catch (error) {
      logger.error('Помилка в handleCityCallback:', error);
      await this.bot.sendMessage(chatId, 'Виникла помилка. Спробуйте ще раз.');
    }
  }

  /**
   * Обробка повідомлень в рамках сесії
   */
  async handleSessionMessage(msg, session) {
    // Перевірка на існування необхідних об'єктів
    if (!msg || !msg.chat || !session) {
      logger.error('handleSessionMessage: Відсутні необхідні параметри', { msg, session });
      return;
    }

    const chatId = msg.chat.id;
    const text = msg.text;

    logger.info(`handleSessionMessage: Отримано повідомлення від користувача ${chatId}`, {
      text: text,
      sessionAction: session.action,
      sessionStep: session.step,
      sessionData: session.data
    });

    // Перевірка на існування тексту повідомлення
    if (!text) {
      logger.warn(`handleSessionMessage: Відсутній текст повідомлення для користувача ${chatId}`);
      await this.bot.sendMessage(chatId, 'Будь ласка, надішліть текстове повідомлення.');
      return;
    }

    try {
      logger.info(`handleSessionMessage: Обробка дії "${session.action}" для користувача ${chatId}`);
      
      if (session.action === 'registration') {
        logger.info(`handleSessionMessage: Викликаю handleRegistrationStep для користувача ${chatId}`);
        await this.handleRegistrationStep(chatId, text, session);
      } else if (session.action === 'create_ticket') {
        logger.info(`handleSessionMessage: Викликаю handleTicketCreationStep для користувача ${chatId}`);
        await this.handleTicketCreationStep(chatId, text, session);
      } else if (session.type === 'comment') {
         logger.info(`handleSessionMessage: Викликаю handleCommentStep для користувача ${chatId}`);
         await this.handleCommentStep(chatId, text, session);
      } else {
        logger.warn(`handleSessionMessage: Невідома дія "${session.action}" для користувача ${chatId}`);
      }
    } catch (error) {
      logger.error('Помилка в handleSessionMessage:', error);
      await this.bot.sendMessage(chatId, 'Виникла помилка. Спробуйте ще раз або скасуйте операцію.');
    }
  }

  /**
   * Швидке створення тикету з повідомлення
   */
  async handleQuickTicket(msg) {
    const chatId = msg.chat.id;
    const user = await this.findUserByTelegramId(chatId);

    if (!user) {
      await this.bot.sendMessage(chatId, 
        'Для створення тикету спочатку зареєструйтеся: /register'
      );
      return;
    }

    try {
      const ticket = new Ticket({
        title: msg.text.substring(0, 100),
        description: msg.text,
        createdBy: user._id,
        city: user.city,
        status: 'open',
        priority: 'medium'
      });

      await ticket.save();

      await this.bot.sendMessage(chatId,
        `✅ Тикет створено!\n\n` +
        `**ID:** ${ticket._id}\n` +
        `**Заголовок:** ${ticket.title}\n` +
        `**Статус:** Відкритий\n` +
        `**Пріоритет:** Середній`,
        { parse_mode: 'Markdown' }
      );

      logger.telegram(`Створено тикет через Telegram: ${ticket._id}`, { 
        userId: user._id, 
        chatId 
      });

    } catch (error) {
      logger.error('Помилка створення тикету через Telegram:', error);
      await this.bot.sendMessage(chatId, 
        'Помилка створення тикету. Спробуйте пізніше. ❌'
      );
    }
  }

  /**
   * Пошук користувача за Telegram ID та генерація токену
   */
  async findUserByTelegramId(telegramId) {
    const user = await User.findOne({ telegramId })
      .populate('position', 'name')
      .populate('city', 'name');
    
    if (user) {
      // Генеруємо JWT токен для користувача
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      
      // Додаємо токен до об'єкта користувача (не зберігаємо в БД)
      user.token = token;
    }
    
    return user;
  }

  /**
   * Отримання емодзі для статусу
   */
  getStatusEmoji(status) {
    const emojis = {
      'open': '🔴',
      'in_progress': '🟡',
      'resolved': '🟢',
      'closed': '⚫'
    };
    return emojis[status] || '❓';
  }

  /**
   * Отримання емодзі для пріоритету
   */
  getPriorityEmoji(priority) {
    const emojis = {
      'low': '🔵',
      'medium': '🟡',
      'high': '🔴'
    };
    return emojis[priority] || '❓';
  }

  /**
   * Отримання тексту статусу
   */
  getStatusText(status) {
    const texts = {
      'open': 'Відкритий',
      'in_progress': 'В роботі',
      'resolved': 'Вирішений',
      'closed': 'Закритий'
    };
    return texts[status] || 'Невідомий';
  }

  /**
   * Отримати текст пріоритету
   */
  getPriorityText(priority) {
    const priorities = {
      'low': 'Низький',
      'medium': 'Середній', 
      'high': 'Високий'
    };
    return priorities[priority] || priority;
  }

  /**
   * Форматування дати
   */
  formatDate(date) {
    return new Date(date).toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Відправка сповіщення про зміну статусу тикету
   */
  async sendTicketNotification(ticket, action = 'updated') {
    if (!this.isInitialized) return;

    try {
      const user = await User.findById(ticket.createdBy);
      if (!user || !user.telegramId) return;

      const actionText = {
        'created': 'створено',
        'updated': 'оновлено',
        'assigned': 'призначено',
        'resolved': 'вирішено',
        'closed': 'закрито'
      };

      const message = 
        `🔔 *Сповіщення про тикет*\n\n` +
        `Ваш тикет **${ticket.title}** ${actionText[action] || 'змінено'}.\n\n` +
        `**Статус:** ${this.getStatusText(ticket.status)}\n` +
        `**ID:** ${ticket._id}`;

      await this.bot.sendMessage(user.telegramId, message, { 
        parse_mode: 'Markdown' 
      });

    } catch (error) {
      logger.error('Помилка відправки Telegram сповіщення:', error);
    }
  }

  /**
   * Сповіщення про схвалення реєстрації
   */
  async sendRegistrationApprovedNotification(user) {
    if (!this.isInitialized || !user.telegramId) return;

    try {
      const message = 
        `🎉 *Вітаємо!*\n\n` +
        `Ваша заявка на реєстрацію була схвалена адміністратором.\n\n` +
        `Тепер ви можете користуватися всіма функціями системи Help Desk.\n\n` +
        `Для початку роботи скористайтеся командою /start`;

      await this.bot.sendMessage(user.telegramId, message, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Почати роботу', callback_data: 'main_menu' }]
          ]
        }
      });

    } catch (error) {
      logger.error('Помилка відправки сповіщення про схвалення реєстрації:', error);
    }
  }

  /**
   * Сповіщення про відхилення реєстрації
   */
  async sendRegistrationRejectedNotification(user, reason = '') {
    if (!this.isInitialized || !user.telegramId) return;

    try {
      let message = 
        `❌ *Заявка відхилена*\n\n` +
        `На жаль, ваша заявка на реєстрацію була відхилена адміністратором.\n\n`;

      if (reason) {
        message += `**Причина:** ${reason}\n\n`;
      }

      message += `Ви можете подати нову заявку, виправивши зазначені недоліки.\n\n` +
                 `Для повторної реєстрації скористайтеся командою /register`;

      await this.bot.sendMessage(user.telegramId, message, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Повторна реєстрація', callback_data: 'register' }]
          ]
        }
      });

    } catch (error) {
      logger.error('Помилка відправки сповіщення про відхилення реєстрації:', error);
    }
  }

  /**
   * Обробка створення тікету з шаблоном
   */
  async handleCreateWithTemplateCallback(chatId, user) {
    // Перевіряємо ініціалізацію бота
    if (!this.isInitialized || !this.bot) {
      logger.error('Telegram Bot - Помилка створення тікету з шаблону: Бот не ініціалізований');
      return;
    }

    if (!user) {
      try {
        await this.bot.sendMessage(chatId, 'Спочатку потрібно зареєструватися! 🔐', {
          reply_markup: this.getMainMenuKeyboard(null)
        });
      } catch (error) {
        logger.error('Telegram Bot - Помилка відправки повідомлення про реєстрацію:', error);
      }
      return;
    }

    try {
      // Отримуємо шаблони з API
      const templates = await this.getTemplatesFromAPI();
      
      if (!templates || templates.length === 0) {
        await this.bot.sendMessage(chatId, 
          '📋 Наразі немає доступних шаблонів.\n\n' +
          'Створіть тікет вручну:', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✏️ Створити вручну', callback_data: 'create_manual' }],
                [{ text: '🔙 Назад', callback_data: 'main_menu' }]
              ]
            }
          }
        );
        return;
      }

      // Створюємо клавіатуру з шаблонами
      const keyboard = this.createTemplatesKeyboard(templates);
      
      await this.bot.sendMessage(chatId,
        '📋 *Оберіть шаблон для створення тікету:*\n\n' +
        'Натисніть на один з шаблонів нижче:', {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );

    } catch (error) {
      logger.error('Telegram Bot - Помилка створення тікету з шаблону:', error);
      try {
        await this.bot.sendMessage(chatId, 
          '❌ Помилка отримання шаблонів. Спробуйте створити тікет вручну.', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✏️ Створити вручну', callback_data: 'create_manual' }],
                [{ text: '🔙 Назад', callback_data: 'main_menu' }]
              ]
            }
          }
        );
      } catch (sendError) {
        logger.error('Telegram Bot - Помилка відправки повідомлення про помилку:', sendError);
      }
    }
  }

  /**
   * Обробка створення тікету вручну
   */
  async handleCreateManualCallback(chatId, user) {
    if (!user) {
      await this.bot.sendMessage(chatId, 'Спочатку потрібно зареєструватися! 🔐', {
        reply_markup: this.getMainMenuKeyboard(null)
      });
      return;
    }

    this.userSessions.set(chatId, {
      action: 'create_ticket',
      step: 'title',
      data: { userId: user._id }
    });

    await this.bot.sendMessage(chatId, 
      '✏️ *Створення тікету вручну*\n\n' +
      'Введіть заголовок тікету:', {
        parse_mode: 'Markdown',
        reply_markup: this.getNavigationKeyboard()
      }
    );
  }

  /**
   * Обробка вибору шаблону
   */
  async handleTemplateCallback(chatId, data, user) {
    // Перевіряємо ініціалізацію бота
    if (!this.isInitialized || !this.bot) {
      logger.error('Telegram Bot - Помилка обробки шаблону: Бот не ініціалізований');
      return;
    }

    if (!user) {
      try {
        await this.bot.sendMessage(chatId, 'Помилка доступу! 🚫');
      } catch (error) {
        logger.error('Telegram Bot - Помилка відправки повідомлення про доступ:', error);
      }
      return;
    }

    const templateId = data.replace('template_', '');
    
    try {
      // Отримуємо деталі шаблону
      const template = await this.getTemplateById(templateId);
      
      if (!template) {
        try {
          await this.bot.sendMessage(chatId, 'Шаблон не знайдено! ❌');
        } catch (error) {
          logger.error('Telegram Bot - Помилка відправки повідомлення про відсутність шаблону:', error);
        }
        return;
      }

      // Створюємо сесію з даними шаблону
      this.userSessions.set(chatId, {
        action: 'create_ticket_from_template',
        step: 'confirm',
        data: {
          userId: user._id,
          template: template,
          title: template.title,
          description: template.description,
          priority: template.priority
        }
      });

      // Показуємо попередній перегляд тікету
      const priorityEmoji = this.getPriorityEmoji(template.priority);
      const categoryName = template.category?.name || 'Не вказано';
      const estimatedTime = template.estimatedResolutionTime || 'Не вказано';
      const message = 
        `📋 *Попередній перегляд тікету*\n\n` +
        `**Шаблон:** ${template.title}\n` +
        `**Категорія:** ${categoryName}\n` +
        `${priorityEmoji} **Пріоритет:** ${this.getPriorityText(template.priority)}\n` +
        `⏱️ **Орієнтовний час:** ${estimatedTime}г\n\n` +
        `**Опис:**\n${template.description}\n\n` +
        `Створити тікет з цими даними?`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Створити', callback_data: 'confirm_template_ticket' },
            { text: '✏️ Редагувати', callback_data: 'edit_template_ticket' }
          ],
          [
            { text: '🔙 Назад до шаблонів', callback_data: 'create_with_template' }
          ]
        ]
      };

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

    } catch (error) {
      logger.error('Telegram Bot - Помилка обробки шаблону:', error);
      try {
        await this.bot.sendMessage(chatId, 'Помилка обробки шаблону! ❌');
      } catch (sendError) {
        logger.error('Telegram Bot - Помилка відправки повідомлення про помилку обробки шаблону:', sendError);
      }
    }
  }

  /**
   * Отримання шаблонів з API
   */
  async getTemplatesFromAPI() {
    try {
      const response = await fetch(`${process.env.API_BASE_URL}/ticket-templates/telegram`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.data || [];
      }
      
      return [];
    } catch (error) {
      logger.error('Помилка отримання шаблонів з API:', error);
      return [];
    }
  }

  /**
   * Отримання шаблону за ID
   */
  async getTemplateById(templateId) {
    try {
      const response = await fetch(`${process.env.API_BASE_URL}/ticket-templates/telegram/${templateId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.data || null;
      }
      
      return null;
    } catch (error) {
      logger.error('Помилка отримання шаблону за ID:', error);
      return null;
    }
  }

  /**
   * Створення клавіатури з шаблонами
   */
  createTemplatesKeyboard(templates) {
    const buttons = [];
    
    // Групуємо шаблони по 2 в ряд
    for (let i = 0; i < templates.length; i += 2) {
      const row = [];
      
      // Перший шаблон в ряду
      const template1 = templates[i];
      row.push({
        text: `📋 ${template1.title}`,
        callback_data: `template_${template1.id}`
      });
      
      // Другий шаблон в ряду (якщо є)
      if (i + 1 < templates.length) {
        const template2 = templates[i + 1];
        row.push({
          text: `📋 ${template2.title}`,
          callback_data: `template_${template2.id}`
        });
      }
      
      buttons.push(row);
    }

    // Додаємо кнопки навігації
    buttons.push([
      { text: '✏️ Створити вручну', callback_data: 'create_manual' },
      { text: '🔙 Назад', callback_data: 'main_menu' }
    ]);

    return { inline_keyboard: buttons };
  }

  /**
   * Отримання емодзі для пріоритету
   */
  getPriorityEmoji(priority) {
    switch (priority) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  }

  /**
   * Отримання тексту пріоритету
   */
  getPriorityText(priority) {
    switch (priority) {
      case 'high': return 'Високий';
      case 'medium': return 'Середній';
      case 'low': return 'Низький';
      default: return 'Не визначено';
    }
  }

  /**
   * Обробка підтвердження створення тікету з шаблону
   */
  async handleConfirmTemplateTicket(chatId, user) {
    // Перевіряємо ініціалізацію бота
    if (!this.isInitialized || !this.bot) {
      logger.error('Telegram Bot - Помилка підтвердження створення тікету з шаблону: Бот не ініціалізований');
      return;
    }

    const session = this.userSessions.get(chatId);
    
    if (!session || session.action !== 'create_ticket_from_template') {
      try {
        await this.bot.sendMessage(chatId, 'Помилка сесії! Спробуйте ще раз.');
      } catch (error) {
        logger.error('Telegram Bot - Помилка відправки повідомлення про помилку сесії:', error);
      }
      return;
    }

    try {
      // Мапінг українських назв категорій до англійських ключів
      const categoryMapping = {
        'Технічні': 'technical',
        'Акаунт': 'account', 
        'Фінанси': 'billing',
        'Загальні': 'general'
      };

      // Отримуємо англійський ключ категорії
      const categoryName = session.data.template.category?.name || 'Загальні';
      const categoryKey = categoryMapping[categoryName] || 'general';

      // Створюємо тікет з даними шаблону
      const ticketData = {
        title: session.data.title,
        description: session.data.description,
        priority: session.data.priority,
        category: categoryKey,
        city: user.city?._id || user.city?.id || user.city // Передаємо ID міста
      };

      // Логування для діагностики
      logger.info('🎫 TEMPLATE TICKET DATA:', JSON.stringify(ticketData, null, 2));
      logger.info('🏷️ TEMPLATE CATEGORY:', session.data.template.category);
      logger.info('🔄 CATEGORY MAPPING:', `${categoryName} -> ${categoryKey}`);
      logger.info('📝 SESSION DATA:', JSON.stringify(session.data, null, 2));
      
      logger.info('Telegram Bot - Створення тікету з шаблону:', {
        chatId,
        ticketData: JSON.stringify(ticketData, null, 2),
        templateCategory: session.data.template.category
      });

      const response = await fetch(`${process.env.API_BASE_URL}/tickets`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ticketData)
      });

      if (response.ok) {
        const result = await response.json();
        const ticket = result.data;
        
        // Очищуємо сесію
        this.userSessions.delete(chatId);
        
        const priorityEmoji = this.getPriorityEmoji(ticket.priority);
        const message = 
          `✅ *Тікет успішно створено!*\n\n` +
          `🎫 **ID:** #${ticket.ticketNumber}\n` +
          `📋 **Заголовок:** ${ticket.title}\n` +
          `${priorityEmoji} **Пріоритет:** ${this.getPriorityText(ticket.priority)}\n` +
          `📅 **Створено:** ${new Date(ticket.createdAt).toLocaleString('uk-UA')}\n\n` +
          `Ваш тікет прийнято в обробку!`;

        await this.bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          reply_markup: this.getMainMenuKeyboard(user)
        });

      } else {
        const error = await response.json();
        logger.error('❌ TEMPLATE TICKET ERROR:', {
          status: response.status,
          error: error,
          ticketData: JSON.stringify(ticketData, null, 2)
        });
        
        logger.error('Telegram Bot - Помилка створення тікету з шаблону:', {
          status: response.status,
          error: error,
          ticketData: JSON.stringify(ticketData, null, 2)
        });
        
        await this.bot.sendMessage(chatId, 
          `❌ Помилка створення тікету: ${error.message || 'Невідома помилка'}`, {
            reply_markup: this.getMainMenuKeyboard(user)
          }
        );
      }

    } catch (error) {
      logger.error('Telegram Bot - Помилка створення тікету з шаблону:', error);
      try {
        await this.bot.sendMessage(chatId, 
          '❌ Помилка створення тікету. Спробуйте ще раз.', {
            reply_markup: this.getMainMenuKeyboard(user)
          }
        );
      } catch (sendError) {
        logger.error('Telegram Bot - Помилка відправки повідомлення про помилку створення тікету:', sendError);
      }
    }
  }

  /**
   * Обробка редагування тікету з шаблону
   */
  async handleEditTemplateTicket(chatId, user) {
    // Перевіряємо ініціалізацію бота
    if (!this.isInitialized || !this.bot) {
      logger.error('Telegram Bot - Помилка редагування тікету з шаблону: Бот не ініціалізований');
      return;
    }

    const session = this.userSessions.get(chatId);
    
    if (!session || session.action !== 'create_ticket_from_template') {
      try {
        await this.bot.sendMessage(chatId, 'Помилка сесії! Спробуйте ще раз.');
      } catch (error) {
        logger.error('Telegram Bot - Помилка відправки повідомлення про помилку сесії при редагуванні:', error);
      }
      return;
    }

    // Переводимо в режим редагування
    session.action = 'edit_template_ticket';
    session.step = 'choose_field';
    this.userSessions.set(chatId, session);

    const message = 
      `✏️ *Редагування тікету*\n\n` +
      `Що ви хочете змінити?`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📝 Заголовок', callback_data: 'edit_title' },
          { text: '📄 Опис', callback_data: 'edit_description' }
        ],
        [
          { text: '⚡ Пріоритет', callback_data: 'edit_priority' }
        ],
        [
          { text: '✅ Зберегти зміни', callback_data: 'confirm_template_ticket' },
          { text: '🔙 Назад', callback_data: 'create_with_template' }
        ]
      ]
    };

    try {
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      logger.error('Telegram Bot - Помилка відправки повідомлення редагування тікету:', error);
    }
  }

  /**
   * Відправка сповіщення в групу про зміну статусу тікета
   */
  async sendTicketStatusNotificationToGroup(ticket, oldStatus, newStatus, user) {
    if (!this.isInitialized) return;

    try {
      const groupId = process.env.TELEGRAM_GROUP_ID;
      if (!groupId) {
        logger.warn('TELEGRAM_GROUP_ID не налаштовано');
        return;
      }

      // Емодзі для статусів
      const statusEmojis = {
        'open': '🔴',
        'in_progress': '🟡', 
        'resolved': '🟢',
        'closed': '⚫'
      };

      // Переклад статусів
      const statusTranslations = {
        'open': 'Відкритий',
        'in_progress': 'В роботі',
        'resolved': 'Вирішений',
        'closed': 'Закритий'
      };

      const oldStatusText = statusTranslations[oldStatus] || oldStatus;
      const newStatusText = statusTranslations[newStatus] || newStatus;
      const oldEmoji = statusEmojis[oldStatus] || '⚪';
      const newEmoji = statusEmojis[newStatus] || '⚪';

      const message = 
        `🔄 *Зміна статусу тікета*\n\n` +
        `📋 **Тікет:** #${ticket._id.toString().slice(-6)}\n` +
        `📝 **Заголовок:** ${ticket.title}\n\n` +
        `${oldEmoji} **Було:** ${oldStatusText}\n` +
        `${newEmoji} **Стало:** ${newStatusText}\n\n` +
        `👤 **Змінив:** ${user.firstName} ${user.lastName}\n` +
        `🏢 **Посада:** ${user.position}\n` +
        `🏙️ **Місто:** ${user.city}\n\n` +
        `🕐 **Час:** ${new Date().toLocaleString('uk-UA')}`;

      const keyboard = {
        inline_keyboard: [
          [
            { 
              text: '👁️ Переглянути тікет', 
              url: `${process.env.FRONTEND_URL}/tickets/${ticket._id}` 
            }
          ]
        ]
      };

      await this.bot.sendMessage(groupId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      logger.info(`Відправлено сповіщення в групу про зміну статусу тікета ${ticket._id}`);

    } catch (error) {
      logger.error('Помилка відправки сповіщення в групу:', error);
    }
  }

  /**
   * Відправка сповіщення в групу про створення нового тікета
   */
  async sendNewTicketNotificationToGroup(ticket, user) {
    logger.info('🔔 Спроба відправки сповіщення про новий тікет:', ticket._id);
    
    if (!this.isInitialized) {
      logger.warn('❌ Telegram бот не ініціалізований');
      return;
    }

    try {
      const groupId = process.env.TELEGRAM_GROUP_ID;
      logger.info('📱 Group ID:', groupId);
      
      if (!groupId) {
        logger.warn('TELEGRAM_GROUP_ID не налаштовано');
        return;
      }

      // Емодзі для пріоритетів
      const priorityEmojis = {
        'low': '🟢',
        'medium': '🟡',
        'high': '🔴'
      };

      // Переклад пріоритетів
      const priorityTranslations = {
        'low': 'Низький',
        'medium': 'Середній', 
        'high': 'Високий'
      };

      const priorityText = priorityTranslations[ticket.priority] || ticket.priority;
      const priorityEmoji = priorityEmojis[ticket.priority] || '⚪';

      const message = 
        `🆕 *Новий тікет створено*\n\n` +
        `📋 **Тікет:** #${ticket._id.toString().slice(-6)}\n` +
        `📝 **Заголовок:** ${ticket.title}\n` +
        `📄 **Опис:** ${ticket.description.length > 100 ? ticket.description.substring(0, 100) + '...' : ticket.description}\n\n` +
        `${priorityEmoji} **Пріоритет:** ${priorityText}\n` +
        `🔴 **Статус:** Відкритий\n\n` +
        `👤 **Створив:** ${user.firstName} ${user.lastName}\n` +
        `🏢 **Посада:** ${user.position}\n` +
        `🏙️ **Місто:** ${user.city}\n\n` +
        `🕐 **Час:** ${new Date().toLocaleString('uk-UA')}`;

      const keyboard = {
        inline_keyboard: [
          [
            { 
              text: '👁️ Переглянути тікет', 
              url: `${process.env.FRONTEND_URL}/tickets/${ticket._id}` 
            }
          ]
        ]
      };

      logger.info('📤 Відправляю повідомлення в групу...');
      
      await this.bot.sendMessage(groupId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      logger.info('✅ Сповіщення відправлено успішно');
      logger.info(`Відправлено сповіщення в групу про новий тікет ${ticket._id}`);

    } catch (error) {
      logger.error('❌ Помилка відправки сповіщення про новий тікет в групу:', error);
      logger.error('Помилка відправки сповіщення про новий тікет в групу:', error);
    }
  }

  /**
   * Відправка загального сповіщення користувачу
   * @param {string} telegramId - Telegram ID користувача
   * @param {Object} notification - Об'єкт сповіщення
   * @param {string} notification.title - Заголовок сповіщення
   * @param {string} notification.message - Текст сповіщення
   * @param {string} notification.type - Тип сповіщення
   */
  async sendNotification(telegramId, notification) {
    if (!this.isInitialized || !this.bot) {
      logger.warn('Telegram бот не ініціалізований для відправки сповіщення');
      return;
    }

    try {
      const { title, message, type } = notification;
      
      // Вибираємо емодзі в залежності від типу сповіщення
      const typeEmojis = {
        'user_status_change': '👤',
        'user_role_change': '🔄',
        'user_registration_status_change': '📝',
        'user_activated': '✅',
        'user_deactivated': '❌',
        'user_approved': '🎉',
        'user_rejected': '⛔',
        'ticket_created': '🎫',
        'ticket_updated': '🔄',
        'system_maintenance': '⚙️',
        'urgent_notification': '🚨'
      };

      const emoji = typeEmojis[type] || '📢';
      const notificationText = `${emoji} *${title}*\n\n${message}`;

      await this.bot.sendMessage(telegramId, notificationText, {
        parse_mode: 'Markdown'
      });

      logger.info(`Сповіщення відправлено користувачу ${telegramId}: ${title}`);

    } catch (error) {
      logger.error(`Помилка відправки сповіщення користувачу ${telegramId}:`, error);
    }
  }

  /**
   * Зупиняє бота
   */
  async stopBot() {
    try {
      if (this.bot) {
        await this.bot.stopPolling();
        this.bot = null;
        this.isInitialized = false;
        this.userSessions.clear();
        this.userStates.clear();
        logger.telegram('✅ Telegram бот зупинено');
      }
    } catch (error) {
      logger.error('❌ Помилка зупинки Telegram бота:', error);
      throw error;
    }
  }

  /**
   * Обробка контактів (номер телефону)
   */
  async handleContact(msg) {
    const chatId = msg.chat.id;
    const contact = msg.contact;
    const session = this.userSessions.get(chatId);

    if (!session || session.action !== 'registration' || session.step !== 'phone') {
      await this.bot.sendMessage(chatId, 'Помилка: неправильний стан реєстрації.');
      return;
    }

    try {
      // Зберігаємо номер телефону
      session.data.phone = contact.phone_number;
      
      // Зберігаємо оновлену сесію
      this.userSessions.set(chatId, session);
      
      await this.bot.sendMessage(chatId, 
        `✅ Номер телефону збережено: ${contact.phone_number}\n\n🔄 Завершуємо реєстрацію...`, {
          reply_markup: this.getNavigationKeyboard()
        }
      );

      // Завершуємо реєстрацію
      await this.completeRegistration(chatId, session);
    } catch (error) {
      logger.error('Помилка в handleContact:', error);
      await this.bot.sendMessage(chatId, 'Виникла помилка. Спробуйте ще раз.');
    }
  }

  /**
   * Ініціалізує бота з новими налаштуваннями
   */
  async initializeBot(settings) {
    try {
      if (!settings || !settings.botToken) {
        throw new Error('Токен бота не надано');
      }

      const TelegramBot = require('node-telegram-bot-api');
      
      // Ініціалізуємо бота з новим токеном
      this.bot = new TelegramBot(settings.botToken, { polling: true });
      this.isInitialized = true;

      // Налаштовуємо обробники подій
      this.setupEventHandlers();

      logger.telegram('✅ Telegram бот успішно переініціалізовано');
      return true;
    } catch (error) {
      logger.error('❌ Помилка переініціалізації Telegram бота:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Створює навігаційну клавіатуру з кнопкою "Назад"
   */
  getNavigationKeyboard() {
    return {
      inline_keyboard: [
        [{ text: '🔙 Назад', callback_data: 'back' }],
        [{ text: '🏠 Головне меню', callback_data: 'main_menu' }]
      ]
    };
  }

  /**
   * Створює клавіатуру з містами
   */
  getCitiesKeyboard(cities) {
    const buttons = [];
    for (let i = 0; i < cities.length; i += 2) {
      const row = [];
      row.push({ text: cities[i].name, callback_data: `city_${cities[i]._id}` });
      if (cities[i + 1]) {
        row.push({ text: cities[i + 1].name, callback_data: `city_${cities[i + 1]._id}` });
      }
      buttons.push(row);
    }
    buttons.push([{ text: '🔙 Назад', callback_data: 'back' }]);
    return { inline_keyboard: buttons };
  }

  /**
   * Створює клавіатуру з посадами
   */
  getPositionsKeyboard(positions) {
    const buttons = [];
    for (let i = 0; i < positions.length; i += 2) {
      const row = [];
      row.push({ text: positions[i].title, callback_data: `position_${positions[i]._id}` });
      if (positions[i + 1]) {
        row.push({ text: positions[i + 1].title, callback_data: `position_${positions[i + 1]._id}` });
      }
      buttons.push(row);
    }
    buttons.push([{ text: '🔙 Назад', callback_data: 'back' }]);
    return { inline_keyboard: buttons };
  }

  /**
   * Створює клавіатуру категорій
   */
  getCategoryKeyboard() {
    return {
      inline_keyboard: [
        [{ text: '💻 Технічна підтримка', callback_data: 'category_technical' }],
        [{ text: '📋 Загальні питання', callback_data: 'category_general' }],
        [{ text: '🔙 Назад', callback_data: 'back' }]
      ]
    };
  }

  /**
   * Створює клавіатуру для створення тікету
   */
  getTicketCreationKeyboard() {
    return {
      inline_keyboard: [
        [{ text: '🔙 Назад', callback_data: 'back' }],
        [{ text: '🏠 Головне меню', callback_data: 'main_menu' }]
      ]
    };
  }

  /**
   * Створює головну клавіатуру меню
   */
  getMainMenuKeyboard(user) {
    const keyboard = {
      inline_keyboard: [
        [{ text: '🎫 Мої тікети', callback_data: 'my_tickets' }],
        [{ text: '📝 Створити тікет', callback_data: 'create_ticket' }]
      ]
    };

    if (!user) {
      keyboard.inline_keyboard.push([{ text: 'Реєстрація', callback_data: 'registration' }]);
    }

    return keyboard;
  }

  /**
   * Створює клавіатуру для перегляду тікетів
   */
  getTicketsViewKeyboard() {
    return {
      inline_keyboard: [
        [{ text: '🔙 Назад', callback_data: 'back' }],
        [{ text: '🏠 Головне меню', callback_data: 'main_menu' }]
      ]
    };
  }

  /**
   * Створює клавіатуру дій для тікету
   */
  getTicketActionKeyboard(ticketId) {
    return {
      inline_keyboard: [
        [{ text: '💬 Додати коментар', callback_data: `add_comment_${ticketId}` }],
        [{ text: '🔙 Назад', callback_data: 'my_tickets' }],
        [{ text: '🏠 Головне меню', callback_data: 'main_menu' }]
      ]
    };
  }

  /**
   * Обробка перевірки статусу реєстрації
   */
  async handleCheckStatusCallback(chatId) {
    try {
      // Додаємо логування для діагностики
      logger.info(`handleCheckStatusCallback для chatId: ${chatId}`);
      
      const user = await this.findUserByTelegramId(chatId);
      
      if (!user) {
        logger.warn(`Користувача з telegramId ${chatId} не знайдено при перевірці статусу`);
        await this.showRegistrationOffer(chatId);
        return;
      }

      logger.info(`Перевірка статусу для користувача: ${user.firstName} ${user.lastName}, registrationStatus: ${user.registrationStatus}, isActive: ${user.isActive}`);

      if (user.registrationStatus === 'approved') {
        logger.info(`Користувач ${user.firstName} ${user.lastName} підтверджений - показуємо дашборд`);
        await this.showUserDashboard(chatId, user);
      } else if (user.registrationStatus === 'pending') {
        logger.info(`Користувач ${user.firstName} ${user.lastName} очікує підтвердження - показуємо повідомлення очікування`);
        await this.showPendingMessage(chatId);
      } else {
        logger.info(`Користувач ${user.firstName} ${user.lastName} має статус ${user.registrationStatus} - показуємо повідомлення про відхилення`);
        const message = `❌ Ваша заявка була відхилена.\n\n` +
          `📝 Ви можете подати нову заявку на реєстрацію.\n\n` +
          `Для отримання додаткової інформації зверніться до підтримки.`;
        
        const keyboard = {
          inline_keyboard: [
          [{ text: '✅ Подати нову заявку', callback_data: 'registration' }],
          [{ text: '📞 Зв\'язатися з підтримкою', callback_data: 'contact_support' }]
        ]
      };

      await this.bot.sendMessage(chatId, message, { reply_markup: keyboard });
      }
    } catch (error) {
      logger.error('Помилка в handleCheckStatusCallback:', error);
      await this.bot.sendMessage(chatId, 'Виникла помилка при перевірці статусу. Спробуйте ще раз.');
    }
  }

  /**
   * Обробка зв'язку з підтримкою
   */
  async handleContactSupportCallback(chatId) {
    const message = `📞 Зв'язок з технічною підтримкою:\n\n` +
      `📧 Email: support@techsupport.com\n` +
      `📱 Телефон: +380 (XX) XXX-XX-XX\n` +
      `🕐 Години роботи: Пн-Пт 9:00-18:00\n\n` +
      `💬 Або залиште повідомлення тут, і ми зв'яжемося з вами найближчим часом.`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '💬 Залишити повідомлення', callback_data: 'leave_message' }],
        [{ text: '🔙 Назад', callback_data: 'main_menu' }]
      ]
    };

    await this.bot.sendMessage(chatId, message, { reply_markup: keyboard });
  }

  /**
   * Обробка довідкової інформації
   */
  async handleHelpInfoCallback(chatId) {
    const message = `❓ Довідкова інформація:\n\n` +
      `🤖 Цей бот призначений для подачі та відстеження заявок технічної підтримки.\n\n` +
      `📋 Основні функції:\n` +
      `• Реєстрація в системі\n` +
      `• Створення тікетів\n` +
      `• Відстеження статусу заявок\n` +
      `• Перегляд історії звернень\n` +
      `• Налаштування профілю\n\n` +
      `🔐 Для роботи необхідна реєстрація та підтвердження адміністратора.\n\n` +
      `❓ Маєте питання? Зверніться до підтримки!`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '✅ Розпочати реєстрацію', callback_data: 'registration' }],
        [{ text: '📞 Зв\'язатися з підтримкою', callback_data: 'contact_support' }],
        [{ text: '🔙 Назад', callback_data: 'main_menu' }]
      ]
    };

    await this.bot.sendMessage(chatId, message, { reply_markup: keyboard });
  }

  /**
   * Завантажує список активних міст
   */
  async loadCities() {
    try {
      const cities = await City.find({ isActive: { $ne: false } })
        .select('name region _id')
        .sort({ name: 1 })
        .lean();
      return cities;
    } catch (error) {
      logger.error('Помилка завантаження міст:', error);
      return [];
    }
  }

  /**
   * Завантажує список активних посад
   */
  async loadPositions() {
    try {
      const positions = await Position.find({ isActive: { $ne: false } })
        .select('title department _id')
        .sort({ title: 1 })
        .lean();
      return positions;
    } catch (error) {
      logger.error('Помилка завантаження посад:', error);
      return [];
    }
  }

  /**
   * Обробка статистики користувача
   */
  async handleStatisticsCallback(chatId) {
    try {
      const user = await this.findUserByTelegramId(chatId);
      
      if (!user || user.registrationStatus !== 'approved') {
        await this.bot.sendMessage(chatId, 'Доступ заборонено. Необхідна реєстрація.');
        return;
      }

      // Отримуємо статистику тікетів користувача
      const tickets = await Ticket.find({ userId: user._id });
      
      const totalTickets = tickets.length;
      const openTickets = tickets.filter(t => t.status === 'open').length;
      const inProgressTickets = tickets.filter(t => t.status === 'in_progress').length;
      const closedTickets = tickets.filter(t => t.status === 'closed').length;
      
      const message = `📊 Ваша статистика:\n\n` +
        `📋 Всього тікетів: ${totalTickets}\n` +
        `🟢 Відкритих: ${openTickets}\n` +
        `🟡 В роботі: ${inProgressTickets}\n` +
        `🔴 Закритих: ${closedTickets}\n\n` +
        `📅 Останній тікет: ${tickets.length > 0 ? new Date(tickets[tickets.length - 1].createdAt).toLocaleDateString('uk-UA') : 'Немає'}`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '🎫 Мої тікети', callback_data: 'my_tickets' }],
          [{ text: '📝 Створити тікет', callback_data: 'create_ticket' }],
          [{ text: '🔙 Назад', callback_data: 'main_menu' }]
        ]
      };

      await this.bot.sendMessage(chatId, message, { reply_markup: keyboard });
    } catch (error) {
      console.error('Помилка при отриманні статистики:', error);
      await this.bot.sendMessage(chatId, 'Виникла помилка при отриманні статистики.');
    }
  }
}

module.exports = TelegramService;