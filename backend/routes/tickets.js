const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const TelegramUtils = require('../services/telegramUtils');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Joi = require('joi');
const { uploadsPath } = require('../config/paths');
const { body, param, validationResult } = require('express-validator');
const Ticket = require('../models/Ticket');
const City = require('../models/City');
const ticketController = require('../controllers/ticketController');
const timeEntryController = require('../controllers/timeEntryController');
const tagController = require('../controllers/tagController');
const {
  authenticateToken,
  logUserAction,
  requirePermission,
  isAdminRole,
} = require('../middleware/auth');
const { rateLimits } = require('../middleware');
const telegramService = require('../services/telegramServiceInstance');
const ticketWebSocketService = require('../services/ticketWebSocketService');

// Налаштування multer для завантаження файлів (шлях з config/paths, папки створюються при старті в app.js)
const ticketsUploadPath = path.join(uploadsPath, 'tickets');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ticketsUploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Непідтримуваний тип файлу'));
    }
  },
});

// Схеми валідації
const createTicketSchema = Joi.object({
  title: Joi.string().max(200).required().messages({
    'string.max': 'Заголовок не може перевищувати 200 символів',
    'any.required': "Заголовок є обов'язковим",
  }),
  description: Joi.string().max(2000).required().messages({
    'string.max': 'Опис не може перевищувати 2000 символів',
    'any.required': "Опис є обов'язковим",
  }),
  priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
  city: Joi.string().optional().allow(null),
  createdBy: Joi.string().optional().allow(null),
  tags: Joi.array().items(Joi.string()).optional(),
  estimatedTime: Joi.number().min(0).optional(),
  dueDate: Joi.date().optional(),
});

const updateTicketSchema = Joi.object({
  title: Joi.string().max(200).optional(),
  description: Joi.string().max(2000).optional(),
  status: Joi.string().valid('open', 'in_progress', 'resolved', 'closed').optional(),
  priority: Joi.string().valid('low', 'medium', 'high').optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  estimatedTime: Joi.number().min(0).allow(null).optional(),
  actualTime: Joi.number().min(0).allow(null).optional(),
  dueDate: Joi.date().allow(null).optional(),
});

const commentSchema = Joi.object({
  content: Joi.string().max(1000).required().messages({
    'string.max': 'Коментар не може перевищувати 1000 символів',
    'any.required': "Зміст коментаря є обов'язковим",
  }),
  isInternal: Joi.boolean().default(false),
});

// @route   GET /api/tickets
// @desc    Отримання списку тикетів з фільтрацією та пагінацією
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      priority,
      city,
      createdBy,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // Побудова фільтрів
    const filters = {};

    if (status) {
      filters.status = status;
    }
    if (priority) {
      filters.priority = priority;
    }
    if (city) {
      filters.city = city;
    }
    if (createdBy) {
      filters.createdBy = createdBy;
    }

    // Пошук по заголовку та опису
    if (search) {
      const searchConditions = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];

      // Якщо є обмеження доступу, об'єднуємо їх з пошуком
      if (!isAdminRole(req.user.role)) {
        // Для не-адмінів пошук тільки по їх тікетах
        filters.$and = [
          {
            createdBy: req.user._id,
          },
          {
            $or: searchConditions,
          },
        ];
      } else {
        // Для адмінів просто додаємо пошук
        filters.$or = searchConditions;
      }
    } else {
      // Обмеження доступу для звичайних користувачів
      if (!isAdminRole(req.user.role)) {
        filters.createdBy = req.user._id;
      }
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      populate: [
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'city', select: 'name region' },
      ],
    };

    const tickets = await Ticket.paginate(filters, options);

    res.json({
      success: true,
      data: tickets.docs,
      pagination: {
        currentPage: tickets.page,
        totalPages: tickets.totalPages,
        totalItems: tickets.totalDocs,
        hasNext: tickets.hasNextPage,
        hasPrev: tickets.hasPrevPage,
      },
    });
  } catch (error) {
    logger.error('Помилка отримання тикетів:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

// Експорт тікетів
router.get('/export', authenticateToken, ticketController.exportTickets);

// @route   GET /api/tickets/stats
// @desc    Отримання статистики тікетів
// @access  Private
router.get('/stats', authenticateToken, ticketController.getTicketStatistics);

// @route   GET /api/tickets/:id
// @desc    Отримання конкретного тикету
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email telegramId telegramChatId')
      .populate('city', 'name region')
      .populate('comments.author', 'firstName lastName email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тикет не знайдено',
      });
    }

    // Перевірка доступу: адмін бачить усі, користувач — лише свої
    if (
      !isAdminRole(req.user.role) &&
      ticket.createdBy._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Доступ заборонено',
      });
    }

    res.json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    logger.error('Помилка отримання тикету:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

// @route   POST /api/tickets
// @desc    Створення нового тикету
// @access  Private
router.post(
  '/',
  authenticateToken,
  rateLimits.createTicket,
  upload.array('attachments', 5),
  logUserAction('створив тикет'),
  async (req, res) => {
    try {
      logger.info('📥 Запит на створення тикету');
      logger.info('📥 req.body:', JSON.stringify(req.body));
      logger.info('📥 req.files:', req.files ? `${req.files.length} файлів` : 'немає файлів');

      // Валідація даних
      const { error, value } = createTicketSchema.validate(req.body);
      if (error) {
        logger.warn('❌ Помилка валідації:', JSON.stringify(error.details, null, 2));
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
          errors: error.details,
        });
      }

      logger.info('✅ Валідація пройдена успішно, value:', JSON.stringify(value, null, 2));

      // Перевірка існування міста
      if (value.city) {
        const cityExists = await City.findById(value.city);
        if (!cityExists) {
          logger.warn('❌ Місто не знайдено:', value.city);
          return res.status(400).json({
            success: false,
            message: 'Вказане місто не існує',
          });
        }
      }

      // Обробка вкладених файлів
      const attachments = req.files
        ? req.files.map(file => ({
          filename: file.filename,
          originalName: file.originalname,
          path: file.path,
          size: file.size,
          mimetype: file.mimetype,
          uploadedBy: req.user._id, // Додаємо uploadedBy для кожного вкладення
          uploadedAt: new Date(),
        }))
        : [];

      // Визначаємо місто: якщо не вказано в формі, використовуємо місто з профілю користувача (як в боті)
      let cityId = value.city;
      if (!cityId && req.user.city) {
        cityId = req.user.city;
        logger.info(
          '🏙️ Місто не вказано в формі, використовуємо місто з профілю користувача:',
          cityId
        );
      }

      // Визначаємо джерело створення тікету
      let source = 'web'; // За замовчуванням - веб (для веб-інтерфейсу)

      // Якщо source передано в запиті (для мобільного додатку), використовуємо його
      if (
        value.source &&
        (value.source === 'mobile' || value.source === 'web' || value.source === 'telegram')
      ) {
        source = value.source;
        logger.info(`📱 Визначено джерело з запиту: ${source}`);
      } else {
        // Перевіряємо User-Agent для визначення мобільного додатку
        const userAgent = req.get('user-agent') || '';
        const isMobileApp =
          userAgent.includes('okhttp') ||
          userAgent.includes('MobileApp') ||
          (userAgent.includes('Android') && userAgent.includes('HelpDesk'));

        if (isMobileApp) {
          source = 'mobile';
          logger.info('📱 Визначено джерело: мобільний додаток (за User-Agent)');
        } else {
          // Для веб-інтерфейсу завжди 'web'
          source = 'web';
          logger.info('🌐 Визначено джерело: веб (веб-інтерфейс)');
        }
      }

      // Автоматична категоризація якщо не вказано категорію
      let category = value.category;
      let subcategory = value.subcategory;

      if (!category || category === 'Other') {
        try {
          const ticketCategorizationService = require('../services/ticketCategorizationService');
          const categorization = await ticketCategorizationService.categorizeTicket(
            value.title,
            value.description
          );

          // Використовуємо AI категоризацію якщо впевненість > 70%
          if (categorization.confidence >= 0.7) {
            category = categorization.category;
            subcategory = categorization.subcategory;
            logger.info(
              `🤖 AI категоризація: ${category} → ${subcategory} (${Math.round(categorization.confidence * 100)}%)`
            );
          }
        } catch (error) {
          logger.warn('Помилка автоматичної категоризації:', error.message);
          // Продовжуємо без категоризації
        }
      }

      // Створення тикету (узгоджено з логікою Telegram бота)
      const ticketData = {
        ...value,
        title: value.title,
        description: value.description,
        priority: value.priority || 'medium',
        category: category || 'Other',
        subcategory: subcategory || null,
        city: cityId, // Використовуємо місто з профілю, якщо не вказано
        status: 'open', // Явно встановлюємо статус (як в боті)
        createdBy: req.user._id,
        attachments,
        metadata: {
          source: source, // 'web' або 'mobile' в залежності від наявності активних пристроїв
        },
      };
      const ticket = new Ticket(ticketData);

      await ticket.save();
      logger.info('✅ Тикет успішно створено:', ticket._id);

      // Заповнення полів для відповіді
      await ticket.populate([
        { path: 'createdBy', select: 'firstName lastName email telegramId' },
        { path: 'assignedTo', select: 'firstName lastName email' },
        { path: 'city', select: 'name region' },
      ]);

      // При створенні тікету - ВСІ тікети отримують сповіщення в Telegram групу
      try {
        await telegramService.sendNewTicketNotificationToGroup(ticket, req.user);
        logger.info('✅ Telegram сповіщення про новий тікет відправлено в групу');
      } catch (error) {
        logger.error('❌ Помилка відправки Telegram сповіщення в групу:', error);
        // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
      }

      // Відправка WebSocket сповіщення про новий тікет
      try {
        ticketWebSocketService.notifyNewTicket(ticket);
        logger.info('✅ WebSocket сповіщення про новий тікет відправлено');
      } catch (error) {
        logger.error('❌ Помилка відправки WebSocket сповіщення про новий тікет:', error);
        // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
      }

      // Відправка FCM сповіщення адміністраторам про новий тікет (для всіх джерел)
      try {
        logger.info('📱 Спроба відправки FCM сповіщення адміністраторам про новий тікет');
        const fcmService = require('../services/fcmService');
        const adminCount = await fcmService.sendToAdmins({
          title: '🎫 Новий тікет',
          body: `Створено новий тікет: ${ticket.title}`,
          type: 'ticket_created',
          data: {
            ticketId: ticket._id.toString(),
            ticketTitle: ticket.title,
            ticketStatus: ticket.status,
            ticketPriority: ticket.priority,
            createdBy:
              ticket.createdBy?.firstName && ticket.createdBy?.lastName
                ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}`
                : 'Невідомий користувач',
          },
        });
        logger.info(`✅ FCM сповіщення про новий тікет відправлено ${adminCount} адміністраторам`);
      } catch (error) {
        logger.error('❌ Помилка відправки FCM сповіщення про новий тікет:', error);
        logger.error('   Stack:', error.stack);
        // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
      }

      res.status(201).json({
        success: true,
        message: 'Тикет успішно створено',
        data: ticket,
      });
    } catch (error) {
      logger.error('❌ Помилка створення тикету:', error);
      logger.error('❌ Stack trace:', error.stack);
      res.status(500).json({
        success: false,
        message: error.message || 'Помилка сервера',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @route   PUT /api/tickets/:id
// @desc    Оновлення тикету
// @access  Private
router.put('/:id', authenticateToken, logUserAction('оновив тикет'), async (req, res) => {
  try {
    logger.info(
      `🎯 ПОЧАТОК updateTicket для тікета ${req.params.id}, body:`,
      JSON.stringify(req.body)
    );
    // Валідація даних
    const { error, value } = updateTicketSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тикет не знайдено',
      });
    }

    // Перевірка доступу: тільки адміністратор може редагувати заявки
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Тільки адміністратор може редагувати заявки',
      });
    }

    // Перевірка: тільки адміністратор може змінювати статус
    if (value.status && value.status !== ticket.status && !isAdminRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Тільки адміністратор може змінювати статус тікету',
      });
    }

    // Перевірка: тільки адміністратор може змінювати пріоритет
    if (value.priority && value.priority !== ticket.priority && !isAdminRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Тільки адміністратор може змінювати пріоритет тікету',
      });
    }

    // Збереження попереднього статусу для перевірки змін
    const previousStatus = ticket.status;
    logger.info(
      `🚀 Оновлення тікету ${req.params.id}: попередній статус="${previousStatus}", новий статус="${value.status || 'не змінено'}"`
    );

    // При повторному відкритті тікета (resolved/closed → open/in_progress) скидаємо прапорець запиту на оцінку
    const wasClosed = previousStatus === 'resolved' || previousStatus === 'closed';
    const isReopening =
      wasClosed && value.status && value.status !== 'resolved' && value.status !== 'closed';
    if (isReopening && ticket.qualityRating) {
      ticket.qualityRating.ratingRequested = false;
      ticket.qualityRating.requestedAt = undefined;
      logger.info(
        `📋 Тікет відкрито повторно — скинуто ratingRequested для можливості нової оцінки при закритті`
      );
    }

    // Оновлення тикету (виключаємо status та priority, якщо користувач не адмін)
    const updateData = { ...value };
    if (!isAdminRole(req.user.role)) {
      if (value.status) {
        // Видаляємо status з даних оновлення для не-адмінів
        delete updateData.status;
        logger.info('⚠️ Спроба змінити статус не-адміністратором - статус не оновлено');
      }
      if (value.priority) {
        // Видаляємо priority з даних оновлення для не-адмінів
        delete updateData.priority;
        logger.info('⚠️ Спроба змінити пріоритет не-адміністратором - пріоритет не оновлено');
      }
    }

    // Оновлення тикету
    Object.assign(ticket, updateData);
    await ticket.save();

    if (
      (ticket.status === 'resolved' || ticket.status === 'closed') &&
      (ticket.resolutionSummary || (ticket.aiDialogHistory && ticket.aiDialogHistory.length > 0))
    ) {
      const ticketEmbeddingService = require('../services/ticketEmbeddingService');
      ticketEmbeddingService
        .indexTicket(ticket)
        .catch(err => logger.warn('Ticket embedding index after save', err));
    }

    // Перевірка зміни статусу та відправка сповіщень
    if (value.status && value.status !== previousStatus) {
      logger.info(
        `✅ Статус тікету змінився з "${previousStatus}" на "${value.status}". Відправляю сповіщення...`
      );

      // Визначаємо джерело створення тікету
      const ticketSource = ticket.metadata?.source || 'web';
      const isTicketClosed = value.status === 'resolved' || value.status === 'closed';

      // Завантажуємо повну інформацію про автора для відправки сповіщень
      await ticket.populate([{ path: 'createdBy', select: 'firstName lastName email telegramId' }]);

      if (isTicketClosed) {
        // При закритті тікету - відправляємо сповіщення в відповідний месенджер залежно від джерела
        if (ticketSource === 'telegram') {
          // Тікет створено з Telegram - відправляємо сповіщення в Telegram користувачу
          if (ticket.createdBy?.telegramId) {
            try {
              const statusText = value.status === 'resolved' ? 'Вирішено' : 'Закрито';
              const statusEmoji = value.status === 'resolved' ? '✅' : '🔒';
              const message =
                `${statusEmoji} <b>Тікет ${statusText.toLowerCase()}</b>\n` +
                `📋 ${TelegramUtils.escapeHtml(ticket.title)}\n` +
                `🆔 <code>${TelegramUtils.escapeHtml(ticket._id)}</code>\n` +
                `\n${statusEmoji} <b>${TelegramUtils.escapeHtml(statusText)}</b>`;

              await telegramService.sendMessage(ticket.createdBy.telegramId, message, {
                parse_mode: 'HTML',
              });
              logger.info('✅ Telegram сповіщення про закриття тікету відправлено користувачу');
            } catch (error) {
              logger.error('❌ Помилка відправки Telegram сповіщення користувачу:', error);
            }
          }
        } else if (ticketSource === 'mobile') {
          // Тікет створено з мобільного додатку - відправляємо FCM сповіщення користувачу
          if (ticket.createdBy) {
            try {
              const fcmService = require('../services/fcmService');
              const statusText = value.status === 'resolved' ? 'Вирішено' : 'Закрито';
              await fcmService.sendToUser((ticket.createdBy._id || ticket.createdBy).toString(), {
                title: `🎫 Тікет ${statusText.toLowerCase()}`,
                body: `Тікет "${ticket.title}" має статус: ${statusText}`,
                type: 'ticket_status_changed',
                data: {
                  ticketId: ticket._id.toString(),
                  ticketTitle: ticket.title,
                  previousStatus: previousStatus,
                  newStatus: value.status,
                  changedBy:
                    req.user.firstName && req.user.lastName
                      ? `${req.user.firstName} ${req.user.lastName}`
                      : 'Адміністратор',
                },
              });
              logger.info('✅ FCM сповіщення про закриття тікету відправлено користувачу (mobile)');
            } catch (error) {
              logger.error('❌ Помилка відправки FCM сповіщення користувачу (mobile):', error);
            }
          }
        } else {
          // Тікет створено з веб-інтерфейсу - відправляємо в групу Telegram та FCM (якщо є пристрій)
          try {
            await telegramService.notificationService.sendTicketStatusNotificationToGroup(
              ticket,
              previousStatus,
              value.status,
              req.user
            );
            logger.info('✅ Telegram сповіщення про закриття тікету відправлено в групу (web)');
          } catch (error) {
            logger.error('❌ Помилка відправки Telegram сповіщення в групу (web):', error);
          }

          // Відправляємо FCM сповіщення користувачу, якщо він має пристрій
          if (ticket.createdBy) {
            try {
              const fcmService = require('../services/fcmService');
              const statusText = value.status === 'resolved' ? 'Вирішено' : 'Закрито';
              await fcmService.sendToUser((ticket.createdBy._id || ticket.createdBy).toString(), {
                title: `🎫 Тікет ${statusText.toLowerCase()}`,
                body: `Тікет "${ticket.title}" має статус: ${statusText}`,
                type: 'ticket_status_changed',
                data: {
                  ticketId: ticket._id.toString(),
                  ticketTitle: ticket.title,
                  previousStatus: previousStatus,
                  newStatus: value.status,
                  changedBy:
                    req.user.firstName && req.user.lastName
                      ? `${req.user.firstName} ${req.user.lastName}`
                      : 'Адміністратор',
                },
              });
              logger.info('✅ FCM сповіщення про закриття тікету відправлено користувачу (web)');
            } catch (error) {
              logger.error('❌ Помилка відправки FCM сповіщення користувачу (web):', error);
            }
          }
        }
      } else {
        // Для інших змін статусу - відправляємо в групу та сповіщення автору тікета
        try {
          await telegramService.notificationService.sendTicketStatusNotificationToGroup(
            ticket,
            previousStatus,
            value.status,
            req.user
          );
          logger.info(`📤 Сповіщення про зміну статусу відправлено в групу`);

          // Сповіщення автору тікета про зміну статусу (Telegram + FCM)
          if (ticket.createdBy) {
            logger.info(
              `📤 Відправка сповіщення автору тікета userId=${(ticket.createdBy._id || ticket.createdBy).toString()}, ticketId=${ticket._id}`
            );
            try {
              await telegramService.notificationService.sendTicketNotification(ticket, 'updated');
            } catch (tgErr) {
              logger.error('❌ Помилка відправки Telegram сповіщення автору тікета:', tgErr);
            }
            try {
              const fcmService = require('../services/fcmService');
              const statusText = {
                open: 'Відкрито',
                in_progress: 'В роботі',
                resolved: 'Вирішено',
                closed: 'Закрито',
              };
              await fcmService.sendToUser((ticket.createdBy._id || ticket.createdBy).toString(), {
                title: '🔄 Статус тікету змінено',
                body: `Тікет "${ticket.title}" тепер має статус: ${statusText[value.status] || value.status}`,
                type: 'ticket_status_changed',
                data: {
                  ticketId: ticket._id.toString(),
                  ticketTitle: ticket.title,
                  previousStatus: previousStatus,
                  newStatus: value.status,
                  changedBy:
                    req.user.firstName && req.user.lastName
                      ? `${req.user.firstName} ${req.user.lastName}`
                      : 'Адміністратор',
                },
              });
            } catch (fcmErr) {
              logger.error('❌ Помилка відправки FCM сповіщення автору тікета:', fcmErr);
            }
          } else {
            logger.info(
              `📤 Автор тікета відсутній (createdBy пустий), сповіщення не відправляється, ticketId=${ticket._id}`
            );
          }
        } catch (error) {
          logger.error('❌ Помилка відправки Telegram сповіщення в групу:', error);
        }
      }
    } else {
      logger.info(`❌ Статус тікету не змінився, сповіщення не відправляється`);
    }

    // Перевірка на закриття тікета для відправки запиту на оцінку через Telegram
    const isTicketClosed =
      value.status && (value.status === 'resolved' || value.status === 'closed');
    const wasTicketOpen =
      previousStatus && previousStatus !== 'resolved' && previousStatus !== 'closed';

    logger.info(`🔍 Перевірка умов для відправки оцінки:`);
    logger.info(`   - value.status: ${value.status}`);
    logger.info(`   - previousStatus: ${previousStatus}`);
    logger.info(`   - isTicketClosed: ${isTicketClosed}`);
    logger.info(`   - wasTicketOpen: ${wasTicketOpen}`);
    logger.info(`   - Умова виконується: ${isTicketClosed && wasTicketOpen}`);

    // Відправка запиту на оцінку якості при закритті тікету
    if (isTicketClosed && wasTicketOpen) {
      try {
        logger.info(`📊 Відправка запиту на оцінку якості для тікету ${req.params.id}`);
        logger.info(
          `🔍 Статус qualityRating: ratingRequested=${ticket.qualityRating.ratingRequested}, hasRating=${ticket.qualityRating.hasRating}`
        );

        // Перевіряємо, чи не було вже відправлено запит на оцінку
        if (!ticket.qualityRating.ratingRequested) {
          await telegramService.ticketService.sendQualityRatingRequest(ticket);

          // Позначаємо, що запит на оцінку відправлено
          ticket.qualityRating.ratingRequested = true;
          ticket.qualityRating.requestedAt = new Date();
          await ticket.save();

          logger.info(`✅ Запит на оцінку якості відправлено успішно`);
        } else {
          logger.info(
            `ℹ️ Запит на оцінку вже було відправлено раніше (requestedAt: ${ticket.qualityRating.requestedAt})`
          );
        }
      } catch (error) {
        logger.error('❌ Помилка відправки запиту на оцінку якості:', error);
        // Не зупиняємо виконання, якщо запит на оцінку не вдалося відправити
      }
    }
    // Заповнення полів для відповіді
    await ticket.populate([
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'city', select: 'name region' },
    ]);

    res.json({
      success: true,
      message: 'Тикет успішно оновлено',
      data: ticket,
    });
  } catch (error) {
    logger.error('Помилка оновлення тикету:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

// @route   DELETE /api/tickets/bulk/delete
// @desc    Масове видалення тікетів
// @access  Private (Admin only)
router.delete(
  '/bulk/delete',
  authenticateToken,
  requirePermission('delete_tickets'),
  [
    body('ticketIds').isArray({ min: 1 }).withMessage('ticketIds повинен бути непустим масивом'),
    body('ticketIds.*').isMongoId().withMessage('Кожен ID тікету повинен бути валідним'),
  ],
  logUserAction('масово видалив тікети'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Помилки валідації',
          errors: errors.array(),
        });
      }

      const { ticketIds } = req.body;

      // Перевірка чи існують тікети
      const tickets = await Ticket.find({ _id: { $in: ticketIds } });
      if (tickets.length !== ticketIds.length) {
        return res.status(404).json({
          success: false,
          message: 'Деякі тікети не знайдено',
        });
      }

      // Видалення файлів для всіх тікетів
      tickets.forEach(ticket => {
        ticket.attachments.forEach(attachment => {
          if (fs.existsSync(attachment.path)) {
            try {
              fs.unlinkSync(attachment.path);
            } catch (fileError) {
              logger.error(`Помилка видалення файлу ${attachment.path}:`, fileError);
            }
          }
        });
      });

      // Видалення тікетів
      const result = await Ticket.deleteMany({ _id: { $in: ticketIds } });

      res.json({
        success: true,
        message: `Успішно видалено ${result.deletedCount} тікетів`,
        data: {
          deletedCount: result.deletedCount,
        },
      });
    } catch (error) {
      logger.error('Помилка масового видалення тікетів:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера при масовому видаленні',
        error: error.message,
      });
    }
  }
);

// @route   DELETE /api/tickets/:id
// @desc    Видалення тикету
// @access  Private (Admin only)
router.delete(
  '/:id',
  authenticateToken,
  requirePermission('delete_tickets'),
  logUserAction('видалив тикет'),
  async (req, res) => {
    try {
      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Тикет не знайдено',
        });
      }

      // Видалення файлів
      ticket.attachments.forEach(attachment => {
        if (fs.existsSync(attachment.path)) {
          fs.unlinkSync(attachment.path);
        }
      });

      await ticket.deleteOne();

      res.json({
        success: true,
        message: 'Тикет успішно видалено',
      });
    } catch (error) {
      logger.error('Помилка видалення тикету:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера',
      });
    }
  }
);

// @route   POST /api/tickets/:id/comments
// @desc    Додавання коментаря до тикету
// @access  Private
router.post(
  '/:id/comments',
  authenticateToken,
  upload.array('attachments', 3),
  logUserAction('додав коментар'),
  async (req, res) => {
    try {
      // Валідація даних
      const { error, value } = commentSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Тикет не знайдено',
        });
      }

      // Перевірка доступу
      if (
        !isAdminRole(req.user.role) &&
        (ticket.createdBy._id || ticket.createdBy).toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: 'Доступ заборонено',
        });
      }

      // Обробка вкладених файлів
      const attachments = req.files
        ? req.files.map(file => ({
          filename: file.filename,
          originalName: file.originalname,
          path: file.path,
          size: file.size,
          mimetype: file.mimetype,
        }))
        : [];

      // Підтримка шаблонів відповідей (Canned Responses)
      let finalContent = value.content;
      const { cannedResponseId } = req.body;

      // Якщо використано шаблон за ID
      if (cannedResponseId) {
        const CannedResponse = require('../models/CannedResponse');
        const template = await CannedResponse.findById(cannedResponseId);

        if (template) {
          finalContent = template.content;
          // Реєструємо використання
          await template.incrementUsage();
          logger.info(`Використано шаблон відповіді: ${template.title} (${template._id})`);
        }
      }

      // Або якщо використано shortcuts (наприклад: "/printer-restart")
      if (value.content && value.content.trim().startsWith('/')) {
        const CannedResponse = require('../models/CannedResponse');
        const template = await CannedResponse.findByShortcut(value.content.trim());

        if (template) {
          finalContent = template.content;
          await template.incrementUsage();
          logger.info(`Використано шаблон через shortcut: ${value.content} → ${template.title}`);
        }
      }

      // Додавання коментаря
      const comment = {
        author: req.user._id,
        content: finalContent,
        isInternal: value.isInternal,
        attachments,
      };

      ticket.comments.push(comment);
      await ticket.save();

      // Заповнення автора коментаря та автора тікету
      await ticket.populate([
        { path: 'comments.author', select: 'firstName lastName email' },
        { path: 'createdBy', select: '_id email firstName lastName' },
      ]);

      const newComment = ticket.comments[ticket.comments.length - 1];

      // Відправка FCM та Telegram сповіщень про новий коментар
      try {
        const fcmService = require('../services/fcmService');
        const telegramService = require('../services/telegramServiceInstance');
        const User = require('../models/User');

        const recipients = [];
        const commentAuthorId = req.user._id.toString();

        // Отримуємо ID автора тікету
        // Перевіряємо різні формати createdBy (може бути ObjectId або вже populate'ний об'єкт)
        let ticketCreatedById = null;
        if (ticket.createdBy) {
          if (typeof ticket.createdBy === 'object' && ticket.createdBy._id) {
            ticketCreatedById = ticket.createdBy._id.toString();
          } else {
            ticketCreatedById = (ticket.createdBy._id || ticket.createdBy).toString();
          }
        }

        logger.info(`🔔 Детальна інформація про тікет:`, {
          ticketId: ticket._id.toString(),
          createdByType: typeof ticket.createdBy,
          createdByValue: ticket.createdBy,
          createdById: ticketCreatedById,
          commentAuthorId: commentAuthorId,
        });

        let ticketAssignedToId = null;
        if (ticket.assignedTo) {
          if (typeof ticket.assignedTo === 'object' && ticket.assignedTo._id) {
            ticketAssignedToId = ticket.assignedTo._id.toString();
          } else {
            ticketAssignedToId = ticket.assignedTo.toString();
          }
        }

        logger.info(`🔔 Формування списку отримувачів для тікету ${ticket._id.toString()}`);
        logger.info(`🔔 Автор коментаря: ${commentAuthorId} (${req.user.email})`);
        logger.info(`🔔 Автор тікету: ${ticketCreatedById || 'не вказано'}`);
        logger.info(`🔔 Призначений користувач: ${ticketAssignedToId || 'не вказано'}`);
        logger.info(
          `🔔 Порівняння: createdBy === author? ${ticketCreatedById === commentAuthorId}, assignedTo === author? ${ticketAssignedToId === commentAuthorId}`
        );

        // Додаємо автора тікету до списку отримувачів (якщо він не є автором коментаря)
        if (ticketCreatedById && ticketCreatedById !== commentAuthorId) {
          recipients.push(ticketCreatedById);
          logger.info(`✅ Додано автора тікету до списку отримувачів: ${ticketCreatedById}`);
        } else if (ticketCreatedById === commentAuthorId) {
          logger.info(`ℹ️ Автор тікету збігається з автором коментаря, не додаємо до списку`);
        } else {
          logger.warn(`⚠️ Автор тікету не знайдено (ticket.createdBy = ${ticket.createdBy})`);
        }

        // Додаємо призначеного користувача до списку отримувачів (якщо він не є автором коментаря)
        if (ticketAssignedToId && ticketAssignedToId !== commentAuthorId) {
          recipients.push(ticketAssignedToId);
          logger.info(
            `✅ Додано призначеного користувача до списку отримувачів: ${ticketAssignedToId}`
          );
        } else if (ticketAssignedToId === commentAuthorId) {
          logger.info(
            `ℹ️ Призначений користувач збігається з автором коментаря, не додаємо до списку`
          );
        }

        // Якщо коментар додав користувач (не адмін), додаємо всіх адмінів до списку отримувачів
        const isAdminComment = isAdminRole(req.user.role) || req.user.role === 'manager';
        if (!isAdminComment) {
          logger.info(`🔔 Коментар додав користувач, додаємо всіх адмінів до списку отримувачів`);
          try {
            const admins = await User.find({
              role: { $in: ['admin', 'manager'] },
              _id: { $ne: commentAuthorId }, // Виключаємо автора коментаря
            }).select('_id');

            for (const admin of admins) {
              recipients.push(admin._id.toString());
            }
            logger.info(`✅ Додано ${admins.length} адмінів до списку отримувачів`);
          } catch (adminError) {
            logger.error(`❌ Помилка отримання списку адмінів:`, adminError);
          }
        } else {
          logger.info(`ℹ️ Коментар додав адмін, не додаємо інших адмінів до списку`);
        }

        // Видаляємо дублікати
        const uniqueRecipients = [...new Set(recipients)];
        logger.info(
          `🔔 Фінальний список отримувачів: ${uniqueRecipients.length} користувачів`,
          uniqueRecipients
        );

        logger.info('🔔 Відправка сповіщень про коментар:', {
          ticketId: ticket._id.toString(),
          commentId: newComment._id.toString(),
          recipients: uniqueRecipients,
          uniqueRecipientsCount: uniqueRecipients.length,
          isInternal: value.isInternal,
          commentAuthorId: commentAuthorId,
        });

        if (uniqueRecipients.length === 0) {
          logger.warn('⚠️ Список отримувачів порожній, сповіщення не будуть відправлені');
        }

        // Заповнюємо тікет для отримання інформації про користувачів
        const populatePaths = [
          { path: 'createdBy', select: 'telegramId telegramChatId email firstName lastName' },
        ];

        // Перевіряємо, чи існує поле assignedTo в схемі перед populate
        if (ticket.schema.paths.assignedTo) {
          populatePaths.push({
            path: 'assignedTo',
            select: 'telegramId telegramChatId email firstName lastName',
          });
        }

        await ticket.populate(populatePaths);

        const authorName = `${req.user.firstName} ${req.user.lastName}`;
        // isAdminComment вже оголошено вище
        const roleLabel = isAdminComment ? '👨‍💼 Адміністратор' : '👤 Користувач';

        logger.info('🔔 Перевірка Telegram сервісу:', {
          isInitialized: telegramService.isInitialized,
          hasBot: !!telegramService.bot,
        });

        for (const userId of uniqueRecipients) {
          logger.info(`🔔 Обробка отримувача ${userId} для коментаря`);

          // FCM сповіщення
          try {
            await fcmService.sendToUser(userId, {
              title: '💬 Новий коментар до тікету',
              body: `${authorName} додав коментар до тікету "${ticket.title}"`,
              type: 'ticket_comment',
              data: {
                ticketId: ticket._id.toString(),
                ticketTitle: ticket.title,
                commentId: newComment._id.toString(),
                commentAuthor: authorName,
                commentPreview: value.content.substring(0, 100),
              },
            });
          } catch (fcmError) {
            logger.error(
              `❌ Помилка відправки FCM сповіщення для користувача ${userId}:`,
              fcmError
            );
          }

          // Telegram сповіщення
          try {
            logger.info(`🔔 Пошук користувача ${userId} для Telegram сповіщення`);
            const recipientUser = await User.findById(userId).select(
              'telegramId telegramChatId email firstName lastName'
            );

            logger.info(`🔔 Дані користувача для Telegram:`, {
              userId: userId,
              recipientUser: recipientUser
                ? {
                  email: recipientUser.email,
                  telegramId: recipientUser.telegramId,
                  telegramChatId: recipientUser.telegramChatId,
                  hasTelegramId: !!recipientUser.telegramId,
                  hasTelegramChatId: !!recipientUser.telegramChatId,
                }
                : null,
            });

            const telegramId = recipientUser?.telegramId || recipientUser?.telegramChatId;

            if (recipientUser && telegramId && !value.isInternal) {
              if (!telegramService.isInitialized || !telegramService.bot) {
                logger.warn(
                  `⚠️ Telegram бот не ініціалізований для відправки коментаря користувачу ${recipientUser.email}`,
                  {
                    isInitialized: telegramService.isInitialized,
                    hasBot: !!telegramService.bot,
                  }
                );
              } else {
                logger.info(
                  `🔔 Відправка Telegram сповіщення користувачу ${recipientUser.email} (telegramId: ${telegramId})`
                );

                // Встановлюємо активний тікет для користувача
                telegramService.setActiveTicketForUser(telegramId, ticket._id.toString());

                const ticketNumber = ticket.ticketNumber || ticket._id.toString().substring(0, 8);
                const message =
                  `💬 <b>Новий коментар до тікету</b>\n\n` +
                  `📋 <b>Тікет:</b> ${TelegramUtils.escapeHtml(ticket.title)}\n` +
                  `🆔 <code>${TelegramUtils.escapeHtml(ticketNumber)}</code>\n\n` +
                  `${TelegramUtils.escapeHtml(roleLabel)}: <b>${TelegramUtils.escapeHtml(authorName)}</b>\n\n` +
                  `💭 <b>Коментар:</b>\n${TelegramUtils.escapeHtml(value.content)}\n\n` +
                  `---\n` +
                  `💡 Ви можете відповісти на цей коментар, надіславши повідомлення в цьому чаті.\n` +
                  `Або надішліть /menu для виходу.`;

                try {
                  await telegramService.sendMessage(telegramId, message, {
                    parse_mode: 'HTML',
                  });

                  logger.info(
                    `✅ Telegram сповіщення про коментар відправлено користувачу ${recipientUser.email} (telegramId: ${telegramId})`
                  );
                } catch (sendError) {
                  logger.error(
                    `❌ Помилка виклику sendMessage для користувача ${recipientUser.email}:`,
                    {
                      error: sendError.message,
                      stack: sendError.stack,
                      telegramId: telegramId,
                    }
                  );
                }
              }
            } else {
              if (!recipientUser) {
                logger.warn(`⚠️ Користувач з ID ${userId} не знайдено`);
              } else if (!telegramId) {
                logger.warn(
                  `⚠️ Користувач ${recipientUser.email} (${userId}) не має telegramId або telegramChatId`
                );
              } else if (value.isInternal) {
                logger.info(`ℹ️ Коментар внутрішній, Telegram сповіщення не відправляється`);
              }
            }
          } catch (telegramError) {
            logger.error(`❌ Помилка відправки Telegram сповіщення для користувача ${userId}:`, {
              error: telegramError.message,
              stack: telegramError.stack,
            });
          }
        }

        logger.info('✅ Сповіщення про новий коментар відправлено');
      } catch (error) {
        logger.error('❌ Помилка відправки сповіщень про коментар:', error);
      }

      res.status(201).json({
        success: true,
        message: 'Коментар успішно додано',
        data: newComment,
      });
    } catch (error) {
      logger.error('Помилка додавання коментаря:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера',
      });
    }
  }
);

// Маршрути для відстеження часу
// Почати відстеження часу для тікету
router.post('/:id/time-entries/start', authenticateToken, timeEntryController.startTimeTracking);

// Зупинити відстеження часу для тікету
router.post('/:id/time-entries/stop', authenticateToken, timeEntryController.stopTimeTracking);

// Отримати записи часу для тікету
router.get('/:id/time-entries', authenticateToken, timeEntryController.getTimeEntries);

// Отримати активну сесію для тікету
router.get('/:id/time-entries/active', authenticateToken, timeEntryController.getActiveSession);

// Оновити запис часу
router.put('/:id/time-entries/:entryId', authenticateToken, timeEntryController.updateTimeEntry);

// Видалити запис часу
router.delete('/:id/time-entries/:entryId', authenticateToken, timeEntryController.deleteTimeEntry);

// Маршрути для роботи з тегами тікетів
// Додати тег до тікету
router.post('/:ticketId/tags/:tagId', authenticateToken, tagController.addTagToTicket);

// Видалити тег з тікету
router.delete('/:ticketId/tags/:tagId', authenticateToken, tagController.removeTagFromTicket);

// Отримати теги тікету
router.get('/:ticketId/tags', authenticateToken, tagController.getTicketTags);

// Маршрути для роботи з нотатками тікетів
const noteController = require('../controllers/noteController');

// Отримати всі нотатки тікету
router.get('/:id/notes', authenticateToken, noteController.getNotesByTicket);

// Отримати конкретну нотатку
router.get('/:id/notes/:noteId', authenticateToken, noteController.getNoteById);

// Створити нову нотатку
router.post('/:id/notes', authenticateToken, noteController.createNote);

// Оновити нотатку
router.put('/:id/notes/:noteId', authenticateToken, noteController.updateNote);

// Видалити нотатку (soft delete)
router.delete('/:id/notes/:noteId', authenticateToken, noteController.deleteNote);

// Відновити видалену нотатку
router.patch('/:id/notes/:noteId/restore', authenticateToken, noteController.restoreNote);

// Додати тег до нотатки
router.post('/:id/notes/:noteId/tags', authenticateToken, noteController.addTag);

// Видалити тег з нотатки
router.delete('/:id/notes/:noteId/tags/:tag', authenticateToken, noteController.removeTag);

// Встановити нагадування для нотатки
router.patch('/:id/notes/:noteId/reminder', authenticateToken, noteController.setReminder);

// Отримати статистику нотаток
router.get('/:id/notes/statistics', authenticateToken, noteController.getNotesStatistics);

// Маршрути історії тікетів
const ticketHistoryController = require('../controllers/ticketHistoryController');

// GET /api/tickets/:id/history - Отримати історію змін тікету
router.get('/:id/history', authenticateToken, ticketHistoryController.getTicketHistory);

// GET /api/tickets/:id/history/stats - Отримати статистику змін тікету
router.get('/:id/history/stats', authenticateToken, ticketHistoryController.getTicketChangeStats);

// POST /api/tickets/:id/rate - Оцінити якість вирішення тікету
router.post('/:id/rate', authenticateToken, async (req, res) => {
  try {
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Оцінка повинна бути від 1 до 5',
      });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тікет не знайдено',
      });
    }

    // Перевірка доступу - тільки автор тікету може оцінити
    if (String(ticket.createdBy) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Доступ заборонено. Тільки автор тікету може оцінити якість вирішення',
      });
    }

    // Оновлюємо оцінку
    ticket.qualityRating.hasRating = true;
    ticket.qualityRating.rating = Math.max(1, Math.min(5, parseInt(rating, 10)));
    ticket.qualityRating.ratedAt = new Date();
    ticket.qualityRating.ratedBy = req.user._id;
    if (feedback) {
      ticket.qualityRating.feedback = feedback.substring(0, 500);
    }
    await ticket.save();

    res.json({
      success: true,
      message: 'Оцінка успішно збережена',
      data: {
        rating: ticket.qualityRating.rating,
        feedback: ticket.qualityRating.feedback,
      },
    });
  } catch (error) {
    logger.error('Помилка збереження оцінки тікету:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

// POST /api/tickets/:id/send-telegram-message - Відправити повідомлення користувачу через Telegram
router.post(
  '/:id/send-telegram-message',
  authenticateToken,
  requirePermission('tickets.manage'),
  upload.single('attachment'),
  async (req, res) => {
    try {
      const { content, message, pin = false } = req.body;
      const messageContent = content || message; // Підтримка обох варіантів для сумісності
      const attachment = req.file;

      if ((!messageContent || !messageContent.trim()) && !attachment) {
        return res.status(400).json({
          success: false,
          message: 'Повідомлення або файл не може бути порожнім',
        });
      }

      if (messageContent && messageContent.length > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Повідомлення не може перевищувати 1000 символів',
        });
      }

      const ticket = await Ticket.findById(req.params.id).populate(
        'createdBy',
        'firstName lastName email telegramId telegramChatId'
      );

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Тікет не знайдено',
        });
      }

      // Перевірка, чи користувач має Telegram ID
      const user = ticket.createdBy;
      if (!user || (!user.telegramId && !user.telegramChatId)) {
        return res.status(400).json({
          success: false,
          message: 'Користувач не має Telegram ID для відправки повідомлення',
        });
      }

      // Відправляємо повідомлення через Telegram
      const chatId = user.telegramChatId || user.telegramId;
      const telegramHeader = `💬 <b>Повідомлення від адміністратора</b>\n📋 <b>Тікет:</b> ${TelegramUtils.escapeHtml(ticket.title)}\n🆔 <code>${TelegramUtils.escapeHtml(ticket._id)}</code>\n\n`;
      const telegramFooter = `\n\n💡 Ви можете відповісти на це повідомлення, і ваша відповідь буде додана як коментар до тікету.`;

      const fullText = messageContent ? TelegramUtils.escapeHtml(messageContent.trim()) : '';
      const telegramMessage = telegramHeader + fullText + telegramFooter;

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
            result = await telegramService.sendPhoto(chatId, fileStream, {
              caption: telegramMessage,
              filename: attachment.originalname,
              contentType: attachment.mimetype,
              ...sendOptions,
            });
          } else {
            result = await telegramService.sendDocument(chatId, fileStream, {
              caption: telegramMessage,
              filename: attachment.originalname,
              contentType: attachment.mimetype,
              ...sendOptions,
            });
          }
        } else {
          result = await telegramService.sendMessage(chatId, telegramMessage, sendOptions);
        }

        // Зберігаємо повідомлення в окрему колекцію TelegramMessage
        const TelegramMessage = require('../models/TelegramMessage');
        const telegramMsg = new TelegramMessage({
          ticketId: ticket._id,
          senderId: req.user._id,
          recipientId: user._id,
          content:
            messageContent?.trim() || (attachment ? `[Файл: ${attachment.originalname}]` : ''),
          direction: 'admin_to_user',
          telegramMessageId: result?.message_id?.toString() || null,
          telegramChatId: String(chatId),
          sentAt: new Date(),
          deliveredAt: new Date(),
          metadata: {
            hasAttachment: !!attachment,
            attachmentName: attachment?.originalname,
            attachmentType: attachment?.mimetype,
            pinned: sendOptions.pin,
          },
        });
        await telegramMsg.save();

        // Відправляємо WebSocket сповіщення про нове повідомлення
        try {
          await telegramMsg.populate([
            { path: 'senderId', select: 'firstName lastName email' },
            { path: 'recipientId', select: 'firstName lastName email' },
          ]);
          ticketWebSocketService.notifyNewTelegramMessage(ticket._id.toString(), telegramMsg);
        } catch (wsError) {
          logger.error('Помилка відправки WebSocket сповіщення:', wsError);
        }

        // Зберігаємо інформацію про активний тікет для користувача (для обробки відповідей)
        // Встановлюємо активний тікет для обох варіантів chatId (telegramChatId та telegramId)
        await telegramService.setActiveTicketForUser(String(chatId), ticket._id.toString());

        // Також встановлюємо за telegramId, якщо він відрізняється від chatId
        if (user.telegramId && String(user.telegramId) !== String(chatId)) {
          await telegramService.setActiveTicketForUser(
            String(user.telegramId),
            ticket._id.toString()
          );
        }

        // Також встановлюємо за userId (якщо потрібно)
        const userId = user.telegramId || chatId;
        if (String(userId) !== String(chatId)) {
          await telegramService.setActiveTicketForUser(String(userId), ticket._id.toString());
        }

        logger.info(
          `Повідомлення відправлено користувачу ${user.email} через Telegram для тікету ${ticket._id}`,
          {
            chatId: String(chatId),
            telegramId: user.telegramId,
            telegramChatId: user.telegramChatId,
            ticketId: ticket._id.toString(),
          }
        );

        res.json({
          success: true,
          message: 'Повідомлення успішно відправлено через Telegram',
          data: {
            ticketId: ticket._id,
            sentAt: new Date(),
          },
        });
      } catch (telegramError) {
        logger.error('Помилка відправки повідомлення через Telegram:', telegramError);
        return res.status(500).json({
          success: false,
          message: 'Помилка відправки повідомлення через Telegram',
          error: telegramError.message,
        });
      }
    } catch (error) {
      logger.error('Помилка відправки повідомлення через Telegram:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера',
      });
    }
  }
);

// POST /api/tickets/:id/analyze - Аналіз тікета через AI
router.post(
  '/:id/analyze',
  authenticateToken,
  requirePermission('view_tickets'),
  param('id').isMongoId().withMessage('Невірний ID тікету'),
  (req, res) => {
    try {
      return res.status(503).json({
        success: false,
        message: 'AI інтеграція вимкнена.',
      });
    } catch (error) {
      logger.error('Помилка analyze тікета:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера',
        error: error.message,
      });
    }
  }
);

// GET /api/tickets/:id/telegram-messages - Отримати всі Telegram повідомлення для тікету
router.get('/:id/telegram-messages', authenticateToken, async (req, res) => {
  try {
    const TelegramMessage = require('../models/TelegramMessage');
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тікет не знайдено',
      });
    }

    // Перевірка доступу: тільки адміни або автор тікету можуть переглядати повідомлення
    const isAdmin = isAdminRole(req.user.role);
    const isCreator = String(ticket.createdBy) === String(req.user._id);

    if (!isAdmin && !isCreator) {
      return res.status(403).json({
        success: false,
        message: 'Доступ заборонено',
      });
    }

    // Отримуємо всі повідомлення для тікету, відсортовані за датою
    const messages = await TelegramMessage.find({ ticketId: ticket._id })
      .populate('senderId', 'firstName lastName email avatar')
      .populate('recipientId', 'firstName lastName email avatar')
      .sort({ createdAt: 1 }); // Сортування за датою (від старіших до новіших)

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    logger.error('Помилка отримання Telegram повідомлень:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

module.exports = router;
