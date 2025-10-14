const express = require('express');
const router = express.Router();
const telegramService = require('../services/telegramServiceInstance');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * @route   POST /api/telegram/webhook
 * @desc    Webhook для отримання повідомлень від Telegram
 * @access  Public
 */
router.post('/webhook', async (req, res) => {
  try {
    // Обробка webhook від Telegram
    const update = req.body;
    
    if (update.message) {
      // Логування отриманого повідомлення
      logger.telegram('Отримано повідомлення від Telegram', {
        chatId: update.message.chat.id,
        messageId: update.message.message_id,
        text: update.message.text?.substring(0, 100)
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Помилка обробки Telegram webhook:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Помилка обробки webhook' 
    });
  }
});

/**
 * @route   POST /api/telegram/link
 * @desc    Прив'язка Telegram акаунту до користувача
 * @access  Private
 */
router.post('/link', authenticateToken, async (req, res) => {
  try {
    const { telegramId, verificationCode } = req.body;
    const userId = req.user.id;

    // Валідація даних
    if (!telegramId || !verificationCode) {
      return res.status(400).json({
        success: false,
        message: 'Telegram ID та код верифікації є обов\'язковими'
      });
    }

    // Перевірка чи не прив'язаний вже цей Telegram ID
    const existingUser = await User.findOne({ telegramId });
    if (existingUser && existingUser._id.toString() !== userId) {
      return res.status(400).json({
        success: false,
        message: 'Цей Telegram акаунт вже прив\'язаний до іншого користувача'
      });
    }

    // Тут можна додати логіку верифікації коду
    // Наприклад, зберігати тимчасові коди в Redis або базі даних

    // Оновлення користувача
    const user = await User.findByIdAndUpdate(
      userId,
      { telegramId },
      { new: true }
    ).populate('position city');

    logger.auth(`Прив'язано Telegram акаунт`, {
      userId,
      telegramId
    });

    res.json({
      success: true,
      message: 'Telegram акаунт успішно прив\'язано',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        telegramId: user.telegramId
      }
    });

  } catch (error) {
    logger.error('Помилка прив\'язки Telegram акаунту:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера'
    });
  }
});

/**
 * @route   DELETE /api/telegram/unlink
 * @desc    Відв'язка Telegram акаунту від користувача
 * @access  Private
 */
router.delete('/unlink', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findByIdAndUpdate(
      userId,
      { $unset: { telegramId: 1 } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    logger.auth(`Відв'язано Telegram акаунт`, { userId });

    res.json({
      success: true,
      message: 'Telegram акаунт успішно відв\'язано'
    });

  } catch (error) {
    logger.error('Помилка відв\'язки Telegram акаунту:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера'
    });
  }
});

/**
 * @route   POST /api/telegram/send-notification
 * @desc    Відправка сповіщення через Telegram
 * @access  Private
 */
router.post('/send-notification', authenticateToken, async (req, res) => {
  try {
    // Перевірка прав адміністратора
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав доступу'
      });
    }

    const { userIds, message, type = 'info' } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Повідомлення є обов\'язковим'
      });
    }

    let users;
    if (userIds && userIds.length > 0) {
      // Відправка конкретним користувачам
      users = await User.find({ 
        _id: { $in: userIds },
        telegramId: { $exists: true, $ne: null }
      });
    } else {
      // Відправка всім користувачам з Telegram
      users = await User.find({ 
        telegramId: { $exists: true, $ne: null }
      });
    }

    const results = [];
    const typeEmojis = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      success: '✅'
    };

    const formattedMessage = `${typeEmojis[type] || 'ℹ️'} *Сповіщення*\n\n${message}`;

    for (const user of users) {
      try {
        if (telegramService.isInitialized) {
          await telegramService.bot.sendMessage(
            user.telegramId, 
            formattedMessage,
            { parse_mode: 'Markdown' }
          );
          results.push({ userId: user._id, status: 'sent' });
        } else {
          results.push({ userId: user._id, status: 'bot_not_initialized' });
        }
      } catch (error) {
        logger.error(`Помилка відправки повідомлення користувачу ${user._id}:`, error);
        results.push({ userId: user._id, status: 'error', error: error.message });
      }
    }

    logger.telegram('Масова розсилка сповіщень', {
      adminId: req.user.id,
      totalUsers: users.length,
      results
    });

    res.json({
      success: true,
      message: 'Сповіщення відправлено',
      results: {
        total: users.length,
        sent: results.filter(r => r.status === 'sent').length,
        failed: results.filter(r => r.status === 'error').length,
        details: results
      }
    });

  } catch (error) {
    logger.error('Помилка масової розсилки:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера'
    });
  }
});

/**
 * @route   GET /api/telegram/status
 * @desc    Отримання статусу Telegram інтеграції
 * @access  Private
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const status = {
      isInitialized: telegramService.isInitialized,
      hasToken: !!process.env.TELEGRAM_BOT_TOKEN,
      connectedUsers: await User.countDocuments({ 
        telegramId: { $exists: true, $ne: null }
      })
    };

    // Якщо бот ініціалізований, отримуємо додаткову інформацію
    if (telegramService.isInitialized && telegramService.bot) {
      try {
        const botInfo = await telegramService.bot.getMe();
        status.botInfo = {
          id: botInfo.id,
          username: botInfo.username,
          firstName: botInfo.first_name
        };
      } catch (error) {
        status.botError = error.message;
      }
    }

    res.json({
      success: true,
      status
    });

  } catch (error) {
    logger.error('Помилка перевірки статусу Telegram бота:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера'
    });
  }
});

/**
 * @route   POST /api/telegram/generate-link-code
 * @desc    Генерація коду для прив'язки Telegram
 * @access  Private
 */
router.post('/generate-link-code', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Генеруємо 6-значний код
    const linkCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Тут можна зберегти код в Redis з TTL або в базі даних
    // Для простоти зберігаємо в пам'яті (в продакшені краще використовувати Redis)
    
    // Можна відправити код через email або показати користувачу
    
    res.json({
      success: true,
      linkCode,
      message: 'Код для прив\'язки згенеровано',
      instructions: `Відправте команду /link ${linkCode} боту в Telegram для прив'язки акаунту`
    });

  } catch (error) {
    logger.error('Помилка генерації коду прив\'язки:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера'
    });
  }
});

module.exports = router;