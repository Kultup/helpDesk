const User = require('../models/User');
const Position = require('../models/Position');
const City = require('../models/City');
const telegramService = require('../services/telegramServiceInstance');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Обробка вебхука від Telegram
exports.handleWebhook = async (req, res) => {
  try {
    const update = req.body;
    
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Помилка обробки Telegram вебхука:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка обробки вебхука'
    });
  }
};

// Обробка повідомлень
async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text;
  const userId = message.from.id;

  try {
    // Перевіряємо чи користувач авторизований
    const user = await User.findOne({ telegramId: userId });

    if (!user && !text?.startsWith('/start')) {
      await telegramService.sendMessage(chatId, 
        'Ви не авторизовані. Використайте команду /start для початку роботи.'
      );
      return;
    }

    // Обробка команд
    if (text?.startsWith('/')) {
      await handleCommand(chatId, text, userId, user);
    } else {
      // Обробка звичайних повідомлень
      await handleTextMessage(chatId, text, user);
    }
  } catch (error) {
    logger.error('Помилка обробки повідомлення:', error);
    await telegramService.sendMessage(chatId, 
      'Виникла помилка при обробці вашого повідомлення. Спробуйте пізніше.'
    );
  }
}

// Обробка команд
async function handleCommand(chatId, command, telegramId, user) {
  const [cmd, ...args] = command.split(' ');

  switch (cmd) {
    case '/start':
      await handleStartCommand(chatId, telegramId, args);
      break;
    
    case '/help':
      await handleHelpCommand(chatId, user);
      break;
    
    case '/profile':
      await handleProfileCommand(chatId, user);
      break;
    
    case '/tickets':
      await handleTicketsCommand(chatId, user);
      break;
    
    case '/create':
      await handleCreateTicketCommand(chatId, user, args.join(' '));
      break;
    
    case '/status':
      await handleStatusCommand(chatId, user, args[0]);
      break;
    
    case '/cities':
      await handleCitiesCommand(chatId, user);
      break;
    
    default:
      await telegramService.sendMessage(chatId, 
        'Невідома команда. Використайте /help для перегляду доступних команд.'
      );
  }
}

// Команда /start
async function handleStartCommand(chatId, telegramId, args) {
  const authToken = args[0];
  
  if (authToken) {
    // Спроба авторизації з токеном
    try {
      const user = await User.findOne({ authToken });
      if (user && !user.telegramId) {
        user.telegramId = telegramId;
        user.authToken = undefined; // Видаляємо токен після використання
        await user.save();
        
        await telegramService.sendMessage(chatId, 
          `Вітаємо, ${user.email}! Ваш акаунт успішно підключено до Telegram.`
        );
        await handleHelpCommand(chatId, user);
      } else {
        await telegramService.sendMessage(chatId, 
          'Невірний або застарілий токен авторизації.'
        );
      }
    } catch (error) {
      logger.error('Помилка авторизації через Telegram:', error);
      await telegramService.sendMessage(chatId, 
        'Помилка авторизації. Спробуйте отримати новий токен.'
      );
    }
  } else {
    await telegramService.sendMessage(chatId, 
      'Вітаємо в системі Help Desk!\n\n' +
      'Для авторизації отримайте токен у веб-інтерфейсі та використайте команду:\n' +
      '/start YOUR_TOKEN'
    );
  }
}

// Команда /help
async function handleHelpCommand(chatId, user) {
  const helpText = user ? 
    'Доступні команди:\n\n' +
    '/profile - Переглянути профіль\n' +
    '/tickets - Мої тикети\n' +
    '/create <опис> - Створити тикет\n' +
    '/status <ID> - Статус тикету\n' +
    '/cities - Список міст\n' +
    '/help - Ця довідка'
    :
    'Для використання бота спочатку авторизуйтесь:\n' +
    '/start YOUR_TOKEN\n\n' +
    'Токен можна отримати у веб-інтерфейсі системи.';

  await telegramService.sendMessage(chatId, helpText);
}

// Команда /profile
async function handleProfileCommand(chatId, user) {
  if (!user) {
    await telegramService.sendMessage(chatId, 'Ви не авторизовані.');
    return;
  }

  const profileText = 
    `👤 Ваш профіль:\n\n` +
    `📧 Email: ${user.email}\n` +
    `💼 Посада: ${user.position || 'Не вказано'}\n` +
    `🏙️ Місто: ${user.city || 'Не вказано'}\n` +
    `👑 Роль: ${user.role === 'admin' ? 'Адміністратор' : 'Користувач'}`;

  await telegramService.sendMessage(chatId, profileText);
}

// Команда /tickets
async function handleTicketsCommand(chatId, user) {
  if (!user) {
    await telegramService.sendMessage(chatId, 'Ви не авторизовані.');
    return;
  }

  try {
    const tickets = await Ticket.find({
      $or: [
        { createdBy: user._id },
        { assignedTo: user._id }
      ]
    })
    .populate('city', 'name')
    .sort({ createdAt: -1 })
    .limit(10);

    if (tickets.length === 0) {
      await telegramService.sendMessage(chatId, 'У вас немає тикетів.');
      return;
    }

    let ticketsText = '🎫 Ваші тикети:\n\n';
    
    tickets.forEach((ticket, index) => {
      const statusEmoji = getStatusEmoji(ticket.status);
      const priorityEmoji = getPriorityEmoji(ticket.priority);
      
      ticketsText += 
        `${index + 1}. ${statusEmoji} ${ticket.title}\n` +
        `   ID: ${ticket._id}\n` +
        `   ${priorityEmoji} Пріоритет: ${ticket.priority}\n` +
        `   🏙️ Місто: ${ticket.city?.name || 'Не вказано'}\n` +
        `   📅 Створено: ${ticket.createdAt.toLocaleDateString('uk-UA')}\n\n`;
    });

    await telegramService.sendMessage(chatId, ticketsText);
  } catch (error) {
    logger.error('Помилка отримання тикетів:', error);
    await telegramService.sendMessage(chatId, 'Помилка отримання тикетів.');
  }
}

// Команда /create
async function handleCreateTicketCommand(chatId, user, description) {
  if (!user) {
    await telegramService.sendMessage(chatId, 'Ви не авторизовані.');
    return;
  }

  if (!description || description.trim().length < 10) {
    await telegramService.sendMessage(chatId, 
      'Опис тикету занадто короткий. Мінімум 10 символів.\n' +
      'Використання: /create Опис проблеми'
    );
    return;
  }

  try {
    // Отримуємо місто користувача
    let userCity = null;
    if (user.city) {
      userCity = await City.findOne({ name: user.city });
    }

    const ticket = new Ticket({
      title: description.substring(0, 100), // Перші 100 символів як заголовок
      description: description,
      status: 'open',
      priority: 'medium',
      city: userCity?._id,
      createdBy: user._id,
      source: 'telegram'
    });

    await ticket.save();
    await ticket.populate('city', 'name');

    const successText = 
      `✅ Тикет створено успішно!\n\n` +
      `🆔 ID: ${ticket._id}\n` +
      `📝 Заголовок: ${ticket.title}\n` +
      `📊 Статус: Відкритий\n` +
      `⚡ Пріоритет: Середній\n` +
      `🏙️ Місто: ${ticket.city?.name || 'Не вказано'}`;

    await telegramService.sendMessage(chatId, successText);
  } catch (error) {
    logger.error('Помилка створення тикету:', error);
    await telegramService.sendMessage(chatId, 'Помилка створення тикету.');
  }
}

// Команда /status
async function handleStatusCommand(chatId, user, ticketId) {
  if (!user) {
    await telegramService.sendMessage(chatId, 'Ви не авторизовані.');
    return;
  }

  if (!ticketId) {
    await telegramService.sendMessage(chatId, 
      'Вкажіть ID тикету.\nВикористання: /status TICKET_ID'
    );
    return;
  }

  try {
    const ticket = await Ticket.findOne({
      _id: ticketId,
      $or: [
        { createdBy: user._id },
        { assignedTo: user._id }
      ]
    })
    .populate('city', 'name')
    .populate('assignedTo', 'email')
    .populate('createdBy', 'email');

    if (!ticket) {
      await telegramService.sendMessage(chatId, 'Тикет не знайдено або у вас немає доступу.');
      return;
    }

    const statusEmoji = getStatusEmoji(ticket.status);
    const priorityEmoji = getPriorityEmoji(ticket.priority);
    
    const statusText = 
      `🎫 Інформація про тикет:\n\n` +
      `🆔 ID: ${ticket._id}\n` +
      `📝 Заголовок: ${ticket.title}\n` +
      `📄 Опис: ${ticket.description}\n` +
      `${statusEmoji} Статус: ${getStatusText(ticket.status)}\n` +
      `${priorityEmoji} Пріоритет: ${getPriorityText(ticket.priority)}\n` +
      `🏙️ Місто: ${ticket.city?.name || 'Не вказано'}\n` +
      `👤 Створив: ${ticket.createdBy?.email}\n` +
      `👨‍💼 Призначено: ${ticket.assignedTo?.email || 'Не призначено'}\n` +
      `📅 Створено: ${ticket.createdAt.toLocaleString('uk-UA')}\n` +
      `${ticket.resolvedAt ? `✅ Вирішено: ${ticket.resolvedAt.toLocaleString('uk-UA')}` : ''}`;

    await telegramService.sendMessage(chatId, statusText);
  } catch (error) {
    logger.error('Помилка отримання статусу тикету:', error);
    await telegramService.sendMessage(chatId, 'Помилка отримання інформації про тикет.');
  }
}

// Команда /cities
async function handleCitiesCommand(chatId, user) {
  if (!user) {
    await telegramService.sendMessage(chatId, 'Ви не авторизовані.');
    return;
  }

  try {
    const cities = await City.find().sort({ name: 1 }).limit(20);
    
    if (cities.length === 0) {
      await telegramService.sendMessage(chatId, 'Список міст порожній.');
      return;
    }

    let citiesText = '🏙️ Доступні міста:\n\n';
    cities.forEach((city, index) => {
      citiesText += `${index + 1}. ${city.name}${city.region ? ` (${city.region})` : ''}\n`;
    });

    await telegramService.sendMessage(chatId, citiesText);
  } catch (error) {
    logger.error('Помилка отримання списку міст:', error);
    await telegramService.sendMessage(chatId, 'Помилка отримання списку міст.');
  }
}

// Обробка callback запитів
async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  try {
    const user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      await telegramService.answerCallbackQuery(callbackQuery.id, 'Ви не авторизовані');
      return;
    }

    // Обробка різних типів callback
    if (data.startsWith('ticket_')) {
      await handleTicketCallback(chatId, data, user, callbackQuery.id);
    } else if (data === 'back') {
      telegramService.popState(chatId);
      const currentState = telegramService.getCurrentState(chatId) || 'main';
      await telegramService.showMenuForState(chatId, currentState);
      await telegramService.answerCallbackQuery(callbackQuery.id, 'Повернено до попереднього меню');
    } else {
      await telegramService.answerCallbackQuery(callbackQuery.id);
    }
  } catch (error) {
    logger.error('Помилка обробки callback запиту:', error);
    await telegramService.answerCallbackQuery(callbackQuery.id, 'Помилка обробки запиту');
  }
}

// Обробка callback для тикетів
async function handleTicketCallback(chatId, data, user, callbackQueryId) {
  const [action, ticketId] = data.split('_').slice(1);

  try {
    const ticket = await Ticket.findById(ticketId);
    
    if (!ticket) {
      await telegramService.answerCallbackQuery(callbackQueryId, 'Тикет не знайдено');
      return;
    }

    switch (action) {
      case 'details':
        await handleStatusCommand(chatId, user, ticketId);
        break;
      
      case 'take':
        if (user.role === 'admin' || ticket.assignedTo?.toString() === user._id.toString()) {
          ticket.assignedTo = user._id;
          ticket.status = 'in_progress';
          await ticket.save();
          
          await telegramService.sendMessage(chatId, 
            `✅ Ви взяли тикет "${ticket.title}" в роботу.`
          );
        } else {
          await telegramService.answerCallbackQuery(callbackQueryId, 'Немає прав');
        }
        break;
    }
  } catch (error) {
    logger.error('Помилка обробки callback тикету:', error);
    await telegramService.answerCallbackQuery(callbackQueryId, 'Помилка обробки');
  }
}

// Обробка звичайних текстових повідомлень
async function handleTextMessage(chatId, text, user) {
  if (!user) {
    await telegramService.sendMessage(chatId, 'Ви не авторизовані.');
    return;
  }

  // Якщо повідомлення схоже на опис проблеми, пропонуємо створити тикет
  if (text && text.length > 20) {
    const keyboard = {
      inline_keyboard: [[
        {
          text: '🎫 Створити тикет',
          callback_data: `create_ticket_${text.substring(0, 50)}`
        }
      ]]
    };

    await telegramService.sendMessage(chatId, 
      'Схоже, ви описуєте проблему. Хочете створити тикет?',
      { reply_markup: keyboard }
    );
  } else {
    await telegramService.sendMessage(chatId, 
      'Я не розумію ваше повідомлення. Використайте /help для перегляду команд.'
    );
  }
}

// Допоміжні функції для емодзі та текстів
function getStatusEmoji(status) {
  const emojis = {
    open: '🔴',
    in_progress: '🟡',
    resolved: '🟢',
    closed: '⚫'
  };
  return emojis[status] || '❓';
}

function getPriorityEmoji(priority) {
  const emojis = {
    low: '🔵',
    medium: '🟡',
    high: '🔴'
  };
  return emojis[priority] || '❓';
}

function getStatusText(status) {
  const texts = {
    open: 'Відкритий',
    in_progress: 'В роботі',
    resolved: 'Вирішений',
    closed: 'Закритий'
  };
  return texts[status] || 'Невідомий';
}

function getPriorityText(priority) {
  const texts = {
    low: 'Низький',
    medium: 'Середній',
    high: 'Високий'
  };
  return texts[priority] || 'Невідомий';
}

// Генерація токену авторизації
exports.generateAuthToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const authToken = require('crypto').randomBytes(32).toString('hex');
    
    await User.findByIdAndUpdate(userId, { 
      authToken,
      authTokenExpires: new Date(Date.now() + 10 * 60 * 1000) // 10 хвилин
    });

    res.json({
      success: true,
      data: {
        token: authToken,
        expiresIn: '10 хвилин',
        instructions: `Використайте команду в Telegram: /start ${authToken}`
      }
    });
  } catch (error) {
    logger.error('Помилка генерації токену авторизації:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка генерації токену'
    });
  }
};

// Відключення Telegram
exports.disconnectTelegram = async (req, res) => {
  try {
    const userId = req.user.id;
    
    await User.findByIdAndUpdate(userId, { 
      telegramId: undefined,
      authToken: undefined,
      authTokenExpires: undefined
    });

    res.json({
      success: true,
      message: 'Telegram відключено від акаунту'
    });
  } catch (error) {
    logger.error('Помилка відключення Telegram:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка відключення Telegram'
    });
  }
};

// Статус підключення Telegram
exports.getTelegramStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('telegramId');
    
    res.json({
      success: true,
      data: {
        connected: !!user.telegramId,
        telegramId: user.telegramId
      }
    });
  } catch (error) {
    logger.error('Помилка перевірки статусу Telegram:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка перевірки статусу'
    });
  }
};
