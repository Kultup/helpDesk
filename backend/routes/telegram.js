const express = require('express');
const router = express.Router();
const telegramService = require('../services/telegramServiceInstance');
const User = require('../models/User');
const TelegramMessage = require('../models/TelegramMessage');
const ticketWebSocketService = require('../services/ticketWebSocketService');
const TelegramUtils = require('../services/telegramUtils');
const { authenticateToken, isAdminRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const { uploadsPath } = require('../config/paths');

// Налаштування multer для завантаження файлів
const telegramUploadPath = path.join(uploadsPath, 'telegram');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Перевіряємо наявність папки (створюється в app.js, але про всяк випадок)
    const fs = require('fs');
    if (!fs.existsSync(telegramUploadPath)) {
      fs.mkdirSync(telegramUploadPath, { recursive: true });
    }
    cb(null, telegramUploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/**
 * @route   GET /api/telegram/webhook
 * @desc    Тестовий endpoint для перевірки доступності webhook
 * @access  Public
 */
router.get('/webhook', (req, res) => {
  logger.info('✅ Webhook endpoint доступний (GET тест)', {
    url: req.url,
    headers: req.headers,
    ip: req.ip,
    forwarded: req.get('x-forwarded-for'),
  });
  res.status(200).json({
    success: true,
    message: 'Webhook endpoint доступний',
    timestamp: new Date().toISOString(),
    url: req.url,
    method: req.method,
    server: {
      uptime: process.uptime(),
      nodeVersion: process.version,
      env: process.env.NODE_ENV,
    },
  });
});

/**
 * @route   POST /api/telegram/webhook
 * @desc    Webhook для отримання повідомлень від Telegram
 * @access  Public
 */
router.post(
  '/webhook',
  (req, res, next) => {
    // Логуємо всі запити до webhook
    logger.info('📥 Webhook запит отримано', {
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.get('user-agent'),
        'content-type': req.get('content-type'),
        'x-forwarded-for': req.get('x-forwarded-for'),
        'x-real-ip': req.get('x-real-ip'),
      },
      body: req.body ? JSON.stringify(req.body).substring(0, 200) : 'empty',
    });
    next();
  },
  (req, res) => {
    // Відповідаємо одразу, щоб Telegram отримав швидку відповідь
    // Це запобігає таймаутам та 503 помилкам
    // Використовуємо try-catch для гарантії відповіді
    try {
      res.status(200).json({ success: true, received: true });

      // Обробка webhook від Telegram (асинхронно, після відповіді)
      setImmediate(() => {
        try {
          const update = req.body;

          if (!update) {
            logger.warn('⚠️ Webhook отримано без body');
            return;
          }

          logger.info('📥 Отримано webhook від Telegram', { update_id: update.update_id });

          if (update.message) {
            // Логування отриманого повідомлення
            logger.telegram('Отримано повідомлення від Telegram', {
              chatId: update.message.chat.id,
              messageId: update.message.message_id,
              text: update.message.text?.substring(0, 100),
            });

            // Передаємо повідомлення до telegramService для обробки
            // Не чекаємо завершення, щоб Telegram отримав швидку відповідь
            telegramService.handleMessage(update.message).catch(err => {
              logger.error('Помилка обробки повідомлення:', err);
            });
          }

          if (update.callback_query) {
            // Логування callback query
            logger.telegram('Отримано callback query від Telegram', {
              chatId: update.callback_query.message?.chat?.id,
              data: update.callback_query.data,
            });

            // Передаємо callback query до telegramService для обробки
            telegramService.handleCallbackQuery(update.callback_query).catch(err => {
              logger.error('Помилка обробки callback query:', err);
            });
          }
        } catch (error) {
          logger.error('Помилка обробки Telegram webhook:', error);
        }
      });
    } catch (error) {
      // Якщо навіть відповідь не вдалося відправити, логуємо помилку
      logger.error('Критична помилка при відправці відповіді webhook:', error);
      // Спробуємо відправити відповідь ще раз
      if (!res.headersSent) {
        res.status(200).json({ success: true, error: 'Internal error logged' });
      }
    }
  }
);

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
        message: "Telegram ID та код верифікації є обов'язковими",
      });
    }

    // Перевірка чи не прив'язаний вже цей Telegram ID
    const existingUser = await User.findOne({ telegramId });
    if (existingUser && existingUser._id.toString() !== userId) {
      return res.status(400).json({
        success: false,
        message: "Цей Telegram акаунт вже прив'язаний до іншого користувача",
      });
    }

    // Тут можна додати логіку верифікації коду
    // Наприклад, зберігати тимчасові коди в Redis або базі даних

    // Оновлення користувача
    const user = await User.findByIdAndUpdate(userId, { telegramId }, { new: true }).populate(
      'position city'
    );

    logger.auth(`Прив'язано Telegram акаунт`, {
      userId,
      telegramId,
    });

    res.json({
      success: true,
      message: "Telegram акаунт успішно прив'язано",
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        telegramId: user.telegramId,
      },
    });
  } catch (error) {
    logger.error("Помилка прив'язки Telegram акаунту:", error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
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

    const user = await User.findByIdAndUpdate(userId, { $unset: { telegramId: 1 } }, { new: true });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено',
      });
    }

    logger.auth(`Відв'язано Telegram акаунт`, { userId });

    res.json({
      success: true,
      message: "Telegram акаунт успішно відв'язано",
    });
  } catch (error) {
    logger.error("Помилка відв'язки Telegram акаунту:", error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
    });
  }
});

/**
 * @route   POST /api/telegram/send-notification
 * @desc    Відправка сповіщення через Telegram в групу
 * @access  Private
 */
router.post(
  '/send-notification',
  authenticateToken,
  upload.single('attachment'),
  async (req, res) => {
    try {
      if (!isAdminRole(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Недостатньо прав доступу',
        });
      }

      const { message, type = 'info', pin = false } = req.body;
      const attachment = req.file;

      if (!message && !attachment) {
        return res.status(400).json({
          success: false,
          message: "Повідомлення або файл є обов'язковим",
        });
      }

      if (!telegramService.isInitialized || !telegramService.bot) {
        return res.status(503).json({
          success: false,
          message: 'Telegram бот не ініціалізований',
        });
      }

      // Отримуємо chatId з бази даних або змінної оточення
      const TelegramConfig = require('../models/TelegramConfig');
      let groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;

      if (!groupChatId) {
        try {
          const telegramConfig = await TelegramConfig.findOne({ key: 'default' });
          if (telegramConfig && telegramConfig.chatId && telegramConfig.chatId.trim()) {
            groupChatId = telegramConfig.chatId.trim();
          }
        } catch (configError) {
          logger.error('Помилка отримання TelegramConfig:', configError);
        }
      }

      if (!groupChatId) {
        return res.status(400).json({
          success: false,
          message:
            'TELEGRAM_GROUP_CHAT_ID не встановлено. Перевірте налаштування в адмін панелі або встановіть змінну оточення.',
        });
      }

      const typeEmojis = {
        info: 'ℹ️',
        warning: '⚠️',
        error: '❌',
        success: '✅',
      };

      const escapeHtml = str => {
        if (!str) {
          return '';
        }
        return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      };

      const emoji = typeEmojis[type] || 'ℹ️';
      const formattedMessage = message
        ? `${emoji} <b>Сповіщення</b>\n\n${escapeHtml(message)}`
        : `${emoji} <b>Файл сповіщення</b>`;

      try {
        let result;
        const sendOptions = {
          parse_mode: 'HTML',
          pin: String(pin) === 'true' || pin === true,
        };

        if (attachment) {
          const fs = require('fs');
          const fileStream = fs.createReadStream(attachment.path);

          if (attachment.mimetype.startsWith('image/')) {
            result = await telegramService.sendPhoto(groupChatId, fileStream, {
              caption: formattedMessage,
              filename: attachment.originalname,
              contentType: attachment.mimetype,
              ...sendOptions,
            });
          } else {
            result = await telegramService.sendDocument(groupChatId, fileStream, {
              caption: formattedMessage,
              filename: attachment.originalname,
              contentType: attachment.mimetype,
              ...sendOptions,
            });
          }
        } else {
          result = await telegramService.sendMessage(groupChatId, formattedMessage, sendOptions);
        }

        logger.telegram('Швидке сповіщення відправлено в групу', {
          adminId: req.user.id,
          groupChatId,
          type,
          hasAttachment: !!attachment,
          pinned: sendOptions.pin,
        });

        res.json({
          success: true,
          message: 'Сповіщення відправлено в групу',
          data: {
            sent: true,
            groupChatId,
            messageId: result?.message_id,
          },
        });
      } catch (error) {
        logger.error('Помилка відправки повідомлення в групу:', error);
        res.status(500).json({
          success: false,
          message: 'Помилка відправки повідомлення в групу',
          error: error.message,
        });
      }
    } catch (error) {
      logger.error('Помилка відправки швидкого сповіщення:', error);
      res.status(500).json({
        success: false,
        message: 'Внутрішня помилка сервера',
      });
    }
  }
);

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
        telegramId: { $exists: true, $ne: null },
      }),
    };

    // Якщо бот ініціалізований, отримуємо додаткову інформацію
    if (telegramService.isInitialized && telegramService.bot) {
      try {
        const botInfo = await telegramService.bot.getMe();
        status.botInfo = {
          id: botInfo.id,
          username: botInfo.username,
          firstName: botInfo.first_name,
        };
      } catch (error) {
        status.botError = error.message;
      }
    }

    res.json({
      success: true,
      status,
    });
  } catch (error) {
    logger.error('Помилка перевірки статусу Telegram бота:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
    });
  }
});

/**
 * @route   GET /api/telegram/sessions-count
 * @desc    Кількість активних сесій бота. Тільки адмін.
 * @access  Private (admin)
 */
router.get('/sessions-count', authenticateToken, (req, res) => {
  try {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав доступу',
      });
    }
    const count = telegramService.userSessions.size;
    res.json({ success: true, count });
  } catch (error) {
    logger.error('Помилка отримання кількості сесій:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
    });
  }
});

/**
 * @route   POST /api/telegram/clear-sessions
 * @desc    Скинути всі активні сесії бота (AI/тікети). Тільки адмін.
 * @access  Private (admin)
 */
router.post('/clear-sessions', authenticateToken, (req, res) => {
  try {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав доступу',
      });
    }
    const count = telegramService.clearAllSessions();
    res.json({
      success: true,
      message: `Скинуто активних сесій: ${count}`,
      clearedCount: count,
    });
  } catch (error) {
    logger.error('Помилка скидання сесій Telegram:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
    });
  }
});

/**
 * @route   POST /api/telegram/generate-link-code
 * @desc    Генерація коду для прив'язки Telegram
 * @access  Private
 */
router.post('/generate-link-code', authenticateToken, (req, res) => {
  try {
    // Генеруємо 6-значний код
    const linkCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Тут можна зберегти код в Redis з TTL або в базі даних
    // Для простоти зберігаємо в пам'яті (в продакшені краще використовувати Redis)

    // Можна відправити код через email або показати користувачу

    res.json({
      success: true,
      linkCode,
      message: "Код для прив'язки згенеровано",
      instructions: `Відправте команду /link ${linkCode} боту в Telegram для прив'язки акаунту`,
    });
  } catch (error) {
    logger.error("Помилка генерації коду прив'язки:", error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
    });
  }
});

/**
 * @route   GET /api/telegram/users
 * @desc    Список користувачів із прив'язаним Telegram (для прямих повідомлень)
 * @access  Admin
 */
router.get('/users', authenticateToken, async (req, res) => {
  try {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Доступ заборонено' });
    }
    const users = await User.find({
      telegramId: { $exists: true, $ne: null },
      isActive: true,
    }).select('firstName lastName email telegramId telegramChatId department position institution');

    res.json({ success: true, data: users });
  } catch (error) {
    logger.error('Помилка отримання списку користувачів Telegram:', error);
    res.status(500).json({ success: false, message: 'Внутрішня помилка сервера' });
  }
});

/**
 * @route   GET /api/telegram/messages/:userId
 * @desc    Історія прямих повідомлень з користувачем
 * @access  Admin
 */
router.get('/messages/:userId', authenticateToken, async (req, res) => {
  try {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Доступ заборонено' });
    }
    const { userId } = req.params;
    const { search } = req.query;

    const msgs = await TelegramMessage.find({
      $or: [{ senderId: userId }, { recipientId: userId }],
      ...(search ? { content: { $regex: String(search).trim(), $options: 'i' } } : {}),
    })
      .sort({ sentAt: 1 })
      .limit(300)
      .populate('senderId', 'firstName lastName email')
      .populate('recipientId', 'firstName lastName email')
      .populate('ticketId', 'title ticketNumber');

    res.json({ success: true, data: msgs });
  } catch (error) {
    logger.error('Помилка отримання прямих повідомлень:', error);
    res.status(500).json({ success: false, message: 'Внутрішня помилка сервера' });
  }
});

/**
 * @route   POST /api/telegram/send-to-user/:userId
 * @desc    Відправка прямого повідомлення користувачу (не пов'язане з тікетом)
 * @access  Admin
 */
router.post('/send-to-user/:userId', authenticateToken, async (req, res) => {
  try {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Доступ заборонено' });
    }
    const { userId } = req.params;
    const { message } = req.body;

    if (!message || !String(message).trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'Повідомлення не може бути порожнім' });
    }

    const user = await User.findById(userId).select(
      'firstName lastName email telegramId telegramChatId'
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'Користувача не знайдено' });
    }

    const chatId = user.telegramChatId || user.telegramId;
    if (!chatId) {
      return res.status(400).json({ success: false, message: 'Користувач не підключив Telegram' });
    }

    if (!telegramService.isInitialized) {
      return res.status(503).json({ success: false, message: 'Telegram бот не ініціалізовано' });
    }

    const adminName =
      [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || req.user.email;
    const formattedText =
      `💬 <b>Повідомлення від ${TelegramUtils.escapeHtml(adminName)}</b>\n\n` +
      TelegramUtils.escapeHtml(String(message).trim());

    const sentMsg = await telegramService.bot.sendMessage(String(chatId), formattedText, {
      parse_mode: 'HTML',
    });

    // Mark this user's chatId as having an active DM from this admin
    telegramService.setActiveTicketForUser(String(chatId), null);
    if (user.telegramId && String(user.telegramId) !== String(chatId)) {
      telegramService.setActiveTicketForUser(String(user.telegramId), null);
    }

    const tmsg = await TelegramMessage.create({
      ticketId: null,
      senderId: req.user._id,
      recipientId: user._id,
      content: String(message).trim(),
      direction: 'admin_to_user',
      telegramChatId: String(chatId),
      telegramMessageId: sentMsg?.message_id ? String(sentMsg.message_id) : null,
      sentAt: new Date(),
      deliveredAt: new Date(),
    });

    await tmsg.populate('senderId', 'firstName lastName email');

    // Emit real-time update
    ticketWebSocketService.notifyNewDirectMessage(String(userId), tmsg);

    res.json({
      success: true,
      message: 'Повідомлення відправлено',
      data: { sentAt: new Date() },
    });
  } catch (error) {
    logger.error('Помилка відправки прямого повідомлення:', error);
    res.status(500).json({ success: false, message: 'Внутрішня помилка сервера' });
  }
});

/**
 * @route   POST /api/telegram/end-dialog/:userId
 * @desc    Завершення прямого діалогу адміна з користувачем (очищає активну сесію DM)
 * @access  Admin
 */
router.post('/end-dialog/:userId', authenticateToken, async (req, res) => {
  try {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Доступ заборонено' });
    }
    const { userId } = req.params;

    const user = await User.findById(userId).select('firstName lastName telegramId telegramChatId');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Користувача не знайдено' });
    }

    const chatId = user.telegramChatId || user.telegramId;

    // Очищаємо активну DM сесію
    if (chatId) {
      telegramService.clearActiveTicketForUser(String(chatId));
    }
    if (user.telegramId && String(user.telegramId) !== String(chatId)) {
      telegramService.clearActiveTicketForUser(String(user.telegramId));
    }

    // Повідомляємо користувача в боті
    if (chatId && telegramService.isInitialized && telegramService.bot) {
      try {
        await telegramService.bot.sendMessage(
          String(chatId),
          '🔚 Діалог з адміністратором завершено. Якщо у вас виникнуть питання — звертайтесь знову.',
          {
            reply_markup: {
              inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
            },
          }
        );
      } catch (err) {
        logger.warn('Не вдалось надіслати повідомлення про завершення діалогу:', err.message);
      }
    }

    res.json({ success: true, message: 'Діалог завершено' });
  } catch (error) {
    logger.error('Помилка завершення діалогу:', error);
    res.status(500).json({ success: false, message: 'Внутрішня помилка сервера' });
  }
});

module.exports = router;
