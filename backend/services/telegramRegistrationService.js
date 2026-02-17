const logger = require('../utils/logger');
const TelegramUtils = require('./telegramUtils');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const City = require('../models/City');
const Position = require('../models/Position');
const Institution = require('../models/Institution');
const PositionRequest = require('../models/PositionRequest');
const mongoose = require('mongoose');
const axios = require('axios');

class TelegramRegistrationService {
  constructor(telegramService) {
    this.telegramService = telegramService;
  }

  get bot() {
    return this.telegramService.bot;
  }

  sendMessage(chatId, text, options) {
    return this.telegramService.sendMessage(chatId, text, options);
  }

  async handleUserRegistrationCallback(chatId, userId) {
    try {
      // Перевіряємо, чи користувач вже зареєстрований
      const existingUser = await User.findOne({
        $or: [{ telegramId: String(userId) }, { telegramId: userId }],
      });

      if (existingUser) {
        await this.sendMessage(
          chatId,
          `✅ <b>Ви вже зареєстровані!</b>\n\n` +
            `Ваш обліковий запис вже існує в системі.\n\n` +
            `Використайте /start для перегляду меню.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Перевіряємо, чи є активна реєстрація
      let pendingRegistration = await PendingRegistration.findOne({
        $or: [{ telegramId: String(userId) }, { telegramId: userId }],
      });

      if (!pendingRegistration) {
        // Видаляємо старі незавершені реєстрації для цього користувача
        await PendingRegistration.deleteMany({
          $or: [{ telegramId: String(userId) }, { telegramId: userId }],
        });

        pendingRegistration = new PendingRegistration({
          telegramId: String(userId),
          telegramChatId: String(chatId),
          step: 'firstName',
          data: {},
        });
        await pendingRegistration.save();
        logger.info('Created new PendingRegistration for user:', userId);
      } else {
        // Якщо є незавершена реєстрація, продовжуємо з того місця, де зупинилися
        logger.info(
          `Resuming existing registration from step: ${pendingRegistration.step || 'undefined'}`,
          {
            userId,
            step: pendingRegistration.step,
            data: pendingRegistration.data,
          }
        );

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
      await this.sendMessage(
        chatId,
        '❌ <b>Помилка</b>\n\nВиникла технічна помилка. Спробуйте ще раз або зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>',
        { parse_mode: 'HTML' }
      );
    }
  }

  async processRegistrationStep(chatId, userId, pendingRegistration) {
    try {
      const step = pendingRegistration.step;

      switch (step) {
        case 'firstName':
          await this.sendMessage(
            chatId,
            `📝 <b>Реєстрація в системі</b>\n` +
              `👤 <b>Крок 1/9:</b> Введіть ваше ім'я\n` +
              `💡 Ім'я повинно містити тільки літери та бути довжиною від 2 до 50 символів`,
            { parse_mode: 'HTML' }
          );
          break;

        case 'lastName': {
          const firstNameValue = TelegramUtils.escapeHtml(pendingRegistration.data.firstName || '');
          await this.sendMessage(
            chatId,
            `✅ <b>Ім'я прийнято!</b>\n` +
              `👤 ${firstNameValue}\n` +
              `\n👤 <b>Крок 2/9:</b> Введіть ваше прізвище\n` +
              `💡 Прізвище повинно містити тільки літери та бути довжиною від 2 до 50 символів`,
            { parse_mode: 'HTML' }
          );
          break;
        }

        case 'email': {
          const lastNameValue = TelegramUtils.escapeHtml(pendingRegistration.data.lastName || '');
          await this.sendMessage(
            chatId,
            `✅ <b>Прізвище прийнято!</b>\n` +
              `👤 ${lastNameValue}\n` +
              `\n📧 <b>Крок 3/9:</b> Введіть вашу електронну адресу\n` +
              `💡 Приклад: user@example.com`,
            { parse_mode: 'HTML' }
          );
          break;
        }

        case 'login': {
          const emailValue = TelegramUtils.escapeHtml(pendingRegistration.data.email || '');
          await this.sendMessage(
            chatId,
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
          const loginValue = TelegramUtils.escapeHtml(pendingRegistration.data.login || '');
          await this.sendMessage(
            chatId,
            `✅ <b>Логін прийнято!</b>\n` +
              `👤 ${loginValue}\n` +
              `\n📱 <b>Крок 5/9:</b> Введіть ваш номер телефону\n` +
              `💡 Приклад: +380501234567\n` +
              `Або натисніть кнопку нижче, щоб поділитися номером:`,
            {
              parse_mode: 'HTML',
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
          break;
        }

        case 'password': {
          const phoneNumber = pendingRegistration.data.phone || '';
          await this.sendMessage(
            chatId,
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
          await this.sendMessage(
            chatId,
            '❌ <b>Помилка</b> в процесі реєстрації. Спробуйте почати заново.',
            { parse_mode: 'HTML' }
          );
      }
    } catch (error) {
      logger.error('Помилка обробки кроку реєстрації:', error);
      await this.sendMessage(
        chatId,
        '❌ <b>Помилка</b>\n\nВиникла технічна помилка. Спробуйте ще раз або зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>',
        { parse_mode: 'HTML' }
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
        await this.sendMessage(
          chatId,
          `❌ <b>Немає доступних міст</b>\n\n` +
            `Зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Отримуємо список міст, які мають заклади
      const cityIds = cities.map(city => city._id);
      const institutionsWithCities = await Institution.find({
        isActive: true,
        isPublic: true,
        'address.city': { $in: cityIds },
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
        cityIds: Array.from(citiesWithInstitutions),
      });

      const keyboard = [];
      cities.forEach(city => {
        const cityIdStr = city._id.toString();
        const hasInstitutions = citiesWithInstitutions.has(cityIdStr);
        // Додаємо іконку закладу, якщо місто має заклади
        const cityText = hasInstitutions ? `🏙️ ${city.name} 🏢` : `🏙️ ${city.name}`;

        keyboard.push({
          text: cityText,
          callback_data: `city_${city._id}`,
        });
      });

      // Розбиваємо кнопки міст на рядки по 2
      const cityKeyboard = [];
      for (let i = 0; i < keyboard.length; i += 2) {
        cityKeyboard.push(keyboard.slice(i, i + 2));
      }

      await this.sendMessage(
        chatId,
        `✅ <b>Пароль прийнято!</b>\n` +
          `🔐 <code>********</code>\n` +
          `\n🏙️ <b>Крок 7/9:</b> Оберіть ваше місто\n` +
          `💡 Міста з іконкою 🏢 мають доступні заклади`,
        {
          reply_markup: {
            inline_keyboard: cityKeyboard,
          },
          parse_mode: 'HTML',
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
            $regex: /адміністратор системи|администратор системы|system administrator/i,
          },
        },
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
              $regex: /адміністратор системи|администратор системы|system administrator/i,
            },
          },
        };
        positions = await Position.find(allFilter)
          .select('title')
          .sort({ title: 1 })
          .limit(50)
          .lean();
      }

      if (positions.length === 0) {
        await this.sendMessage(
          chatId,
          `❌ <b>Немає доступних посад</b>\n\n` +
            `Зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const keyboard = [];
      positions.forEach(position => {
        keyboard.push([
          {
            text: `💼 ${position.title || position.name}`,
            callback_data: `position_${position._id}`,
          },
        ]);
      });

      const institutionMessage = institutionId ? '\n🏢 Показано посади для обраного закладу' : '';

      await this.sendMessage(
        chatId,
        `✅ <b>Заклад обрано!</b>\n` +
          `🏢 Заклад вибрано${institutionMessage}\n` +
          `\n💼 <b>Крок 9/9:</b> Оберіть вашу посаду`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: keyboard,
          },
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
        hasCityId: !!cityId,
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
        institutions: institutions.map(i => ({ name: i.name, city: i.address?.city })),
      });

      const keyboard = [];

      // Додаємо заклади до клавіатури
      if (institutions.length > 0) {
        institutions.forEach(institution => {
          keyboard.push([
            {
              text: `🏢 ${institution.name}${institution.type ? ` (${institution.type})` : ''}`,
              callback_data: `institution_${institution._id}`,
            },
          ]);
        });
      }

      // Додаємо кнопку "Пропустити" в кінці
      keyboard.push([
        {
          text: "⏭️ Пропустити (необов'язково)",
          callback_data: 'skip_institution',
        },
      ]);

      let messageText =
        `✅ <b>Місто обрано!</b>\n` +
        `🏙️ Місто вибрано\n` +
        `\n🏢 <b>Крок 8/9:</b> Оберіть заклад (необов'язково)`;

      if (institutions.length === 0 && cityId) {
        messageText += `\n⚠️ Немає доступних закладів для вибраного міста`;
        messageText += `\n💡 Ви можете пропустити цей крок та перейти до вибору посади.`;
      } else {
        messageText += `\n💡 Ви можете пропустити цей крок, якщо не працюєте в конкретному закладі.`;
      }

      await this.sendMessage(chatId, messageText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
    } catch (error) {
      logger.error('Помилка отримання списку закладів:', {
        error: error.message,
        stack: error.stack,
        userId,
        cityId: pendingRegistration.data.cityId,
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
        $or: [{ telegramId: String(userId) }, { telegramId: userId }],
      });

      if (!pendingRegistration) {
        logger.warn('PendingRegistration not found for userId:', userId);
        await this.sendMessage(
          chatId,
          'Ви не в процесі реєстрації. Використайте /start для початку.'
        );
        return;
      }

      logger.info('PendingRegistration found:', {
        step: pendingRegistration.step,
        hasData: !!pendingRegistration.data,
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
          dataKeys: Object.keys(pendingRegistration.data || {}),
        });
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
      } else if (data.startsWith('position_')) {
        const positionId = data.replace('position_', '');
        logger.info('Position selected:', positionId);

        // Валідація: перевіряємо, чи positionId є валідним ObjectId
        if (!mongoose.Types.ObjectId.isValid(positionId)) {
          logger.error('Invalid positionId:', positionId);
          await this.sendMessage(
            chatId,
            '❌ Помилка: невалідний ідентифікатор посади. Спробуйте ще раз.'
          );
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
          dataKeys: Object.keys(pendingRegistration.data || {}),
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
      // Логуємо поточний стан даних перед деструктуризацією
      logger.info('completeRegistration called:', {
        step: pendingRegistration.step,
        dataKeys: Object.keys(pendingRegistration.data || {}),
        hasCityId: !!pendingRegistration.data?.cityId,
        cityId: pendingRegistration.data?.cityId,
        hasPositionId: !!pendingRegistration.data?.positionId,
        positionId: pendingRegistration.data?.positionId,
        fullData: JSON.stringify(pendingRegistration.data),
      });

      const {
        firstName,
        lastName,
        email,
        login,
        phone,
        password,
        cityId,
        positionId,
        institutionId,
      } = pendingRegistration.data || {};

      // Перевіряємо обов'язкові поля перед реєстрацією
      if (!login) {
        logger.warn('Login not provided, returning to login step', {
          userId,
          step: pendingRegistration.step,
          dataKeys: Object.keys(pendingRegistration.data || {}),
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
          dataKeys: Object.keys(pendingRegistration.data || {}),
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
          hasCityId: !!cityId,
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
        institution: institutionId || undefined,
      };

      logger.info('Registering user with data:', {
        email: registerData.email,
        hasCity: !!registerData.city,
        city: registerData.city,
        hasPosition: !!registerData.position,
        position: registerData.position,
        hasInstitution: !!registerData.institution,
        institution: registerData.institution,
      });

      try {
        const response = await axios.post(`${apiBaseUrl}/auth/register`, registerData);

        if (response.data.success) {
          // Видаляємо тимчасову реєстрацію
          await PendingRegistration.deleteOne({ _id: pendingRegistration._id });

          await this.sendMessage(
            chatId,
            `🎉 <b>Реєстрація завершена!</b>\n` +
              `✅ Ваш обліковий запис створено\n` +
              `\n⏳ <b>Очікуйте підтвердження</b>\n` +
              `Ваша заявка на реєстрацію буде розглянута адміністратором.\n` +
              `Після підтвердження ви зможете використовувати всі функції бота.\n\n` +
              `📞 Адміністратор: <a href="https://t.me/Kultup">@Kultup</a>`,
            { parse_mode: 'HTML' }
          );

          logger.info(`Нова реєстрація через Telegram: ${email} (${userId})`);
        } else {
          throw new Error(response.data.message || 'Помилка реєстрації');
        }
      } catch (apiError) {
        const errorMessage =
          apiError.response?.data?.message || apiError.message || 'Помилка реєстрації';
        logger.error('Помилка API реєстрації:', apiError);
        await this.sendMessage(
          chatId,
          `❌ <b>Помилка реєстрації</b>\n\n${TelegramUtils.escapeHtml(errorMessage)}\n\nСпробуйте ще раз або зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (error) {
      logger.error('Помилка завершення реєстрації:', error);
      await this.sendMessage(
        chatId,
        '❌ <b>Помилка</b>\n\nВиникла технічна помилка при завершенні реєстрації. Спробуйте ще раз або зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>',
        { parse_mode: 'HTML' }
      );
    }
  }

  async askForPassword(chatId) {
    await this.sendMessage(
      chatId,
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

  async handleContact(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Перевіряємо, чи користувач вже зареєстрований
      const existingUser = await User.findOne({
        $or: [{ telegramId: String(userId) }, { telegramId: userId }],
      })
        .populate('position', 'name')
        .populate('city', 'name');

      // Якщо користувач вже зареєстрований, показуємо головне меню
      if (existingUser) {
        await this.telegramService.showUserDashboard(chatId, existingUser);
        return;
      }

      // Перевіряємо, чи користувач в процесі реєстрації на етапі phone
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
      if (!TelegramUtils.validatePhone(phoneNumber)) {
        await this.sendMessage(
          chatId,
          `❌ <b>Некоректний номер телефону</b>\n\n` +
            `Отриманий номер: ${TelegramUtils.escapeHtml(phoneNumber)}\n\n` +
            `Номер повинен містити від 10 до 15 цифр та починатися з +.\n\n` +
            `💡 Спробуйте ввести номер вручну:`,
          {
            parse_mode: 'HTML',
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

  async handleUserLoginCallback(chatId, userId, callbackQuery = null) {
    try {
      // Перевіряємо, чи користувач вже зареєстрований
      const existingUser = await User.findOne({
        $or: [{ telegramId: String(userId) }, { telegramId: userId }],
      });

      if (existingUser) {
        await this.sendMessage(
          chatId,
          `✅ <b>Ви вже авторизовані!</b>\n` +
            `Ваш обліковий запис вже підключено до Telegram\n` +
            `Використайте /start для перегляду меню`,
          { parse_mode: 'HTML' }
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
          username: usernameFromMsg,
        },
      };
      this.telegramService.userSessions.set(chatId, session);

      await this.sendMessage(
        chatId,
        `🔐 *Авторизація в системі*\n` +
          `📝 *Крок 1/2:* Введіть ваш логін\n` +
          `💡 Введіть логін, який ви використовуєте для входу в систему`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '❌ Скасувати', callback_data: 'cancel_login' }]],
          },
        }
      );
    } catch (error) {
      logger.error('Помилка обробки авторизації:', error);
      await this.sendMessage(
        chatId,
        '❌ <b>Помилка</b>\n\nВиникла технічна помилка. Спробуйте ще раз або зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>',
        { parse_mode: 'HTML' }
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
            await this.sendMessage(
              chatId,
              `✅ <b>Логін прийнято!</b>\n` +
                `👤 <code>${TelegramUtils.escapeHtml(session.data.login)}</code>\n` +
                `\n🔐 <b>Крок 2/2:</b> Введіть ваш пароль\n` +
                `💡 Введіть пароль для входу в систему`,
              { parse_mode: 'HTML' }
            );
          } else {
            isValid = false;
            errorMessage =
              '❌ *Некоректний логін*\n\nЛогін повинен містити мінімум 3 символи.\n\n💡 Спробуйте ще раз:';
          }
          break;

        case 'password':
          if (text && text.length >= 6) {
            session.data.password = text;
            await this.completeLogin(chatId, userId, session);
            return;
          } else {
            isValid = false;
            errorMessage =
              '❌ *Некоректний пароль*\n\nПароль повинен містити мінімум 6 символів.\n\n💡 Спробуйте ще раз:';
          }
          break;

        default:
          await this.sendMessage(
            chatId,
            '❌ Помилка в процесі авторизації. Спробуйте почати заново.'
          );
          this.telegramService.userSessions.delete(chatId);
          return;
      }

      if (!isValid) {
        await this.sendMessage(chatId, errorMessage);
      }
    } catch (error) {
      logger.error('Помилка обробки введення авторизації:', error);
      await this.sendMessage(
        chatId,
        '❌ <b>Помилка</b>\n\nВиникла технічна помилка. Спробуйте ще раз або зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>',
        { parse_mode: 'HTML' }
      );
      this.telegramService.userSessions.delete(chatId);
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
        await this.sendMessage(
          chatId,
          `❌ <b>Помилка авторизації</b>\n` +
            `Користувача з таким логіном не знайдено\n` +
            `💡 Перевірте правильність логіну та спробуйте ще раз`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Спробувати ще раз', callback_data: 'login_user' }],
                [{ text: '📝 Зареєструватися', callback_data: 'register_user' }],
              ],
            },
          }
        );
        this.telegramService.userSessions.delete(chatId);
        return;
      }

      // Перевірка активності акаунта
      if (!user.isActive) {
        await this.sendMessage(
          chatId,
          `🚫 <b>Доступ обмежено</b>\n\n` +
            `Ваш обліковий запис деактивовано.\n\n` +
            `📞 Зверніться до адміністратора для активації: <a href="https://t.me/Kultup">@Kultup</a>`,
          { parse_mode: 'HTML' }
        );
        this.telegramService.userSessions.delete(chatId);
        return;
      }

      // Перевірка статусу реєстрації
      if (user.registrationStatus === 'pending') {
        await this.sendMessage(
          chatId,
          `⏳ <b>Очікування підтвердження</b>\n\n` +
            `Ваша реєстрація очікує підтвердження адміністратора.\n\n` +
            `📞 Зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>`,
          { parse_mode: 'HTML' }
        );
        this.telegramService.userSessions.delete(chatId);
        return;
      }

      // Перевірка пароля
      const isPasswordValid = await user.comparePassword(password);

      if (!isPasswordValid) {
        await this.sendMessage(
          chatId,
          `❌ <b>Помилка авторизації</b>\n\n` +
            `Невірний пароль.\n\n` +
            `💡 Перевірте правильність пароля та спробуйте ще раз.`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔄 Спробувати ще раз', callback_data: 'login_user' }]],
            },
          }
        );
        this.telegramService.userSessions.delete(chatId);
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
      this.telegramService.userSessions.delete(chatId);

      logger.info('✅ Користувач успішно авторизований через Telegram:', {
        userId: updatedUser._id,
        email: updatedUser.email,
        login: updatedUser.login,
        telegramId: updatedUser.telegramId,
      });

      await this.sendMessage(
        chatId,
        `✅ <b>Авторизація успішна!</b>\n` +
          `🎉 Вітаємо, ${TelegramUtils.escapeHtml(updatedUser.firstName)}!\n` +
          `Ваш обліковий запис успішно підключено до Telegram бота`,
        { parse_mode: 'HTML' }
      );

      // Показуємо dashboard
      await this.telegramService.showUserDashboard(chatId, updatedUser);
    } catch (error) {
      logger.error('Помилка завершення авторизації:', error);
      await this.sendMessage(
        chatId,
        '❌ <b>Помилка</b>\n\nВиникла технічна помилка при авторизації. Спробуйте ще раз або зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>',
        { parse_mode: 'HTML' }
      );
      this.telegramService.userSessions.delete(chatId);
    }
  }

  async handlePositionRequestCallback(callbackQuery) {
    try {
      const data = callbackQuery.data;
      const userId = callbackQuery.from.id;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;

      // Перевіряємо, чи користувач є адміністратором
      const user = await User.findOne({
        $or: [{ telegramId: String(userId) }, { telegramId: userId }],
      });

      if (!user || user.role !== 'admin') {
        await this.telegramService.answerCallbackQuery(
          callbackQuery.id,
          'Тільки адміністратори можуть обробляти запити на посади'
        );
        return;
      }

      if (data.startsWith('approve_position_')) {
        const requestId = data.replace('approve_position_', '');
        const positionRequest =
          await PositionRequest.findById(requestId).populate('pendingRegistrationId');

        if (!positionRequest) {
          await this.telegramService.answerCallbackQuery(callbackQuery.id, 'Запит не знайдено');
          return;
        }

        if (positionRequest.status !== 'pending') {
          await this.telegramService.answerCallbackQuery(callbackQuery.id, 'Запит вже оброблено');
          return;
        }

        // Перевіряємо, чи посада з такою назвою вже існує
        const existingPosition = await Position.findOne({
          title: { $regex: new RegExp(`^${positionRequest.title}$`, 'i') },
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
            createdBy: user._id,
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
        await this.telegramService.notificationService.notifyUserAboutPositionApproval(
          positionRequest,
          createdPosition
        );

        await this.telegramService.answerCallbackQuery(callbackQuery.id, 'Посаду додано успішно');
        // Оновлюємо повідомлення
        await this.bot.editMessageText(
          `✅ <b>Посаду додано!</b>\n\n` +
            `💼 ${TelegramUtils.escapeHtml(createdPosition.title)}\n` +
            `👤 Підтверджено: ${TelegramUtils.escapeHtml(user.firstName)} ${TelegramUtils.escapeHtml(user.lastName)}`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
          }
        );
      } else if (data.startsWith('reject_position_')) {
        const requestId = data.replace('reject_position_', '');
        const positionRequest = await PositionRequest.findById(requestId);

        if (!positionRequest) {
          await this.telegramService.answerCallbackQuery(callbackQuery.id, 'Запит не знайдено');
          return;
        }

        if (positionRequest.status !== 'pending') {
          await this.telegramService.answerCallbackQuery(callbackQuery.id, 'Запит вже оброблено');
          return;
        }

        // Оновлюємо запит
        positionRequest.status = 'rejected';
        positionRequest.rejectedBy = user._id;
        positionRequest.rejectedAt = new Date();
        positionRequest.rejectionReason = 'Відхилено адміністратором';
        await positionRequest.save();

        // Відправляємо сповіщення користувачу
        await this.telegramService.notificationService.notifyUserAboutPositionRejection(
          positionRequest,
          positionRequest.rejectionReason
        );

        await this.telegramService.answerCallbackQuery(callbackQuery.id, 'Запит відхилено');
        // Оновлюємо повідомлення
        await this.bot.editMessageText(
          `❌ <b>Запит відхилено</b>\n\n` +
            `💼 ${TelegramUtils.escapeHtml(positionRequest.title)}\n` +
            `👤 Відхилено: ${TelegramUtils.escapeHtml(user.firstName)} ${TelegramUtils.escapeHtml(user.lastName)}`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
          }
        );
      }
    } catch (error) {
      logger.error('Помилка обробки callback запиту на посаду:', error);
      await this.telegramService.answerCallbackQuery(callbackQuery.id, 'Виникла помилка');
    }
  }

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
            errorMessage = "❌ *Помилка*\n\nІм'я не може бути порожнім.\n\n💡 Введіть ваше ім'я:";
          } else if (TelegramUtils.validateName(text)) {
            pendingRegistration.data.firstName = trimmedFirstName;
            pendingRegistration.step = 'lastName';
          } else {
            isValid = false;
            errorMessage =
              "❌ *Некоректне ім'я*\n\nІм'я повинно:\n• Містити тільки літери (українські або латинські)\n• Бути довжиною від 2 до 50 символів\n• Може містити апостроф, дефіс або пробіл\n\n💡 *Приклад:* Олександр, Іван, John\n\nСпробуйте ще раз:";
          }
          break;
        }

        case 'lastName': {
          const trimmedLastName = text.trim();
          if (!trimmedLastName || trimmedLastName.length === 0) {
            isValid = false;
            errorMessage =
              '❌ *Помилка*\n\nПрізвище не може бути порожнім.\n\n💡 Введіть ваше прізвище:';
          } else if (TelegramUtils.validateName(text)) {
            pendingRegistration.data.lastName = trimmedLastName;
            pendingRegistration.step = 'email';
          } else {
            isValid = false;
            errorMessage =
              '❌ *Некоректне прізвище*\n\nПрізвище повинно:\n• Містити тільки літери (українські або латинські)\n• Бути довжиною від 2 до 50 символів\n• Може містити апостроф, дефіс або пробіл\n\n💡 *Приклад:* Петренко, Іванов, Smith\n\nСпробуйте ще раз:';
          }
          break;
        }

        case 'email': {
          const trimmedEmail = text.trim();
          if (!trimmedEmail || trimmedEmail.length === 0) {
            isValid = false;
            errorMessage = '❌ *Помилка*\n\nEmail не може бути порожнім.\n\n💡 Введіть ваш email:';
          } else if (TelegramUtils.validateEmail(text)) {
            // Перевіряємо, чи email вже не використовується
            const existingUser = await User.findOne({ email: trimmedEmail.toLowerCase() });
            if (existingUser) {
              isValid = false;
              errorMessage =
                '❌ *Email вже використовується*\n\nКористувач з таким email вже зареєстрований в системі.\n\n💡 Введіть інший email:';
            } else {
              pendingRegistration.data.email = trimmedEmail.toLowerCase();
              pendingRegistration.step = 'login';
            }
          } else {
            isValid = false;
            errorMessage =
              '❌ *Некоректний email*\n\nEmail повинен містити:\n• Символ @\n• Домен з крапкою\n• Коректний формат\n\n💡 *Приклад:* user@example.com, ivan.petrov@company.ua\n\nСпробуйте ще раз:';
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
            errorMessage =
              '❌ *Некоректний логін*\n\nЛогін занадто короткий.\n\nЛогін повинен:\n• Містити мінімум 3 символи\n• Складатися тільки з англійських літер (a-z, A-Z)\n• Може містити цифри (0-9) та підкреслення (_)\n• Не може містити кирилицю або інші символи\n• Тільки англійська мова\n\n💡 *Приклад:* my_login123, user_name, admin2024\n\nСпробуйте ще раз:';
          } else if (trimmedLogin.length > 50) {
            isValid = false;
            errorMessage =
              '❌ *Некоректний логін*\n\nЛогін занадто довгий.\n\nЛогін повинен:\n• Містити максимум 50 символів\n• Складатися тільки з англійських літер (a-z, A-Z)\n• Може містити цифри (0-9) та підкреслення (_)\n• Тільки англійська мова\n\n💡 Спробуйте ще раз:';
          } else if (/[а-яА-ЯіІїЇєЄ]/.test(trimmedLogin)) {
            isValid = false;
            errorMessage =
              '❌ *Некоректний логін*\n\nЛогін не може містити кирилицю.\n\nЛогін повинен:\n• Складатися тільки з англійських літер (a-z, A-Z)\n• Може містити цифри (0-9) та підкреслення (_)\n• Не може містити українські літери\n• Тільки англійська мова\n\n💡 *Приклад:* my_login123, user_name, admin2024\n\nСпробуйте ще раз:';
          } else if (!/[a-zA-Z]/.test(trimmedLogin)) {
            isValid = false;
            errorMessage =
              '❌ *Некоректний логін*\n\nЛогін повинен містити хоча б одну англійську літеру.\n\nЛогін повинен:\n• Містити хоча б одну англійську літеру (a-z, A-Z)\n• Може містити цифри (0-9) та підкреслення (_)\n• Тільки англійська мова\n\n💡 *Приклад:* my_login123, user_name, admin2024\n\nСпробуйте ще раз:';
          } else if (!/^[a-zA-Z0-9_]+$/.test(trimmedLogin)) {
            isValid = false;
            errorMessage =
              '❌ *Некоректний логін*\n\nЛогін містить заборонені символи.\n\nЛогін повинен:\n• Складатися тільки з англійських літер (a-z, A-Z)\n• Може містити цифри (0-9) та підкреслення (_)\n• Не може містити пробіли, дефіси, крапки та інші символи\n• Тільки англійська мова\n\n💡 *Приклад:* my_login123, user_name, admin2024\n\nСпробуйте ще раз:';
          } else if (TelegramUtils.validateLogin(text)) {
            const normalizedLogin = trimmedLogin.toLowerCase();
            // Перевіряємо, чи логін вже не використовується
            const existingUser = await User.findOne({ login: normalizedLogin });
            if (existingUser) {
              isValid = false;
              errorMessage =
                '❌ *Логін вже використовується*\n\nКористувач з таким логіном вже зареєстрований в системі.\n\n💡 Введіть інший логін (тільки англійська мова):';
            } else {
              pendingRegistration.data.login = normalizedLogin;
              pendingRegistration.step = 'phone';
            }
          } else {
            isValid = false;
            errorMessage =
              '❌ *Некоректний логін*\n\nЛогін повинен:\n• Містити мінімум 3 символи\n• Містити максимум 50 символів\n• Складатися тільки з англійських літер, цифр та підкреслення\n• Тільки англійська мова\n\n💡 *Приклад:* my_login123, user_name, admin2024\n\nСпробуйте ще раз:';
          }
          break;
        }

        case 'phone': {
          const trimmedPhone = text.trim();
          if (!trimmedPhone || trimmedPhone.length === 0) {
            isValid = false;
            errorMessage =
              '❌ *Помилка*\n\nНомер телефону не може бути порожнім.\n\n💡 Введіть ваш номер телефону:';
          } else if (TelegramUtils.validatePhone(text)) {
            pendingRegistration.data.phone = trimmedPhone;
            pendingRegistration.step = 'password';
            // Приховуємо клавіатуру після успішного введення номера
            await this.sendMessage(
              chatId,
              `✅ <b>Номер телефону прийнято!</b>\n` +
                `📱 ${TelegramUtils.escapeHtml(trimmedPhone)}`,
              {
                parse_mode: 'HTML',
                reply_markup: {
                  remove_keyboard: true,
                },
              }
            );
          } else {
            isValid = false;
            const cleanedPhone = trimmedPhone.replace(/[\s-()]/g, '');
            if (cleanedPhone.length < 10) {
              errorMessage =
                '❌ *Некоректний номер телефону*\n\nНомер занадто короткий.\n\nНомер повинен:\n• Містити від 10 до 15 цифр\n• Може починатися з + (наприклад, +380)\n\n💡 *Приклад:* +380501234567, 0501234567\n\nСпробуйте ще раз:';
            } else if (cleanedPhone.length > 15) {
              errorMessage =
                '❌ *Некоректний номер телефону*\n\nНомер занадто довгий.\n\nНомер повинен:\n• Містити від 10 до 15 цифр\n• Може починатися з + (наприклад, +380)\n\n💡 *Приклад:* +380501234567, 0501234567\n\nСпробуйте ще раз:';
            } else if (!/^\+?[0-9]+$/.test(cleanedPhone)) {
              errorMessage =
                '❌ *Некоректний номер телефону*\n\nНомер містить недозволені символи.\n\nНомер повинен:\n• Містити тільки цифри\n• Може починатися з + (наприклад, +380)\n• Може містити пробіли, дефіси, дужки для форматування\n\n💡 *Приклад:* +380501234567, 0501234567, +38 (050) 123-45-67\n\nСпробуйте ще раз:';
            } else {
              errorMessage =
                '❌ *Некоректний номер телефону*\n\nНомер повинен:\n• Містити від 10 до 15 цифр\n• Може починатися з + (наприклад, +380)\n\n💡 *Приклад:* +380501234567, 0501234567\n\nСпробуйте ще раз:';
            }
          }
          break;
        }

        case 'password': {
          if (!text || text.length === 0) {
            isValid = false;
            errorMessage =
              '❌ *Помилка*\n\nПароль не може бути порожнім.\n\n💡 Введіть ваш пароль:';
          } else if (text.length < 6) {
            isValid = false;
            errorMessage =
              '❌ *Слабкий пароль*\n\nПароль занадто короткий.\n\nПароль повинен:\n• Містити мінімум 6 символів\n• Принаймні одну латинську літеру (a-z, A-Z)\n• Принаймні одну цифру (0-9)\n• Не може містити кирилицю\n\n💡 *Приклад:* MyPass123, Password2024\n\nСпробуйте ще раз:';
          } else if (/[а-яА-ЯіІїЇєЄ]/.test(text)) {
            isValid = false;
            errorMessage =
              '❌ *Некоректний пароль*\n\nПароль не може містити кирилицю.\n\nПароль повинен:\n• Містити тільки латинські літери (a-z, A-Z)\n• Може містити цифри (0-9) та спеціальні символи\n• Не може містити українські літери\n\n💡 *Приклад:* MyPass123, Password2024\n\nСпробуйте ще раз:';
          } else if (!/[a-zA-Z]/.test(text)) {
            isValid = false;
            errorMessage =
              '❌ *Слабкий пароль*\n\nПароль повинен містити хоча б одну латинську літеру.\n\nПароль повинен:\n• Містити мінімум 6 символів\n• Принаймні одну латинську літеру (a-z, A-Z)\n• Принаймні одну цифру (0-9)\n\n💡 *Приклад:* MyPass123, Password2024\n\nСпробуйте ще раз:';
          } else if (!/\d/.test(text)) {
            isValid = false;
            errorMessage =
              '❌ *Слабкий пароль*\n\nПароль повинен містити хоча б одну цифру.\n\nПароль повинен:\n• Містити мінімум 6 символів\n• Принаймні одну латинську літеру (a-z, A-Z)\n• Принаймні одну цифру (0-9)\n\n💡 *Приклад:* MyPass123, Password2024\n\nСпробуйте ще раз:';
          } else if (TelegramUtils.validatePassword(text)) {
            pendingRegistration.data.password = text; // В реальному проекті потрібно хешувати
            pendingRegistration.step = 'city';
          } else {
            isValid = false;
            errorMessage =
              '❌ *Слабкий пароль*\n\nПароль повинен містити:\n• Мінімум 6 символів\n• Принаймні одну латинську літеру (a-z, A-Z)\n• Принаймні одну цифру (0-9)\n• Не може містити кирилицю\n\n💡 *Приклад:* MyPass123, Password2024\n\nСпробуйте ще раз:';
          }
          break;
        }

        case 'department': {
          if (TelegramUtils.validateDepartment(text)) {
            pendingRegistration.data.department = text.trim();
            pendingRegistration.step = 'completed';
          } else {
            isValid = false;
            errorMessage =
              '❌ *Некоректна назва відділу*\n\nНазва відділу повинна бути довжиною від 2 до 100 символів.\n\n💡 Спробуйте ще раз:';
          }
          break;
        }

        default:
          await this.sendMessage(
            chatId,
            '❌ Помилка в процесі реєстрації. Спробуйте почати заново.'
          );
          return;
      }

      if (isValid) {
        await pendingRegistration.save();
        await this.processRegistrationStep(chatId, userId, pendingRegistration);
      } else {
        // Конвертуємо Markdown на HTML для повідомлень про помилки, щоб уникнути проблем з парсингом
        const htmlMessage = TelegramUtils.markdownToHtml(errorMessage);
        await this.sendMessage(chatId, htmlMessage, { parse_mode: 'HTML' });
      }
    } catch (error) {
      logger.error('Помилка обробки реєстраційного введення:', error);
      await this.sendMessage(
        chatId,
        '❌ <b>Помилка</b>\n\nВиникла технічна помилка. Спробуйте ще раз або зверніться до адміністратора: <a href="https://t.me/Kultup">@Kultup</a>',
        { parse_mode: 'HTML' }
      );
    }
  }
}

module.exports = TelegramRegistrationService;
