const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Joi = require('joi');
const { body, query, param, validationResult } = require('express-validator');
const Ticket = require('../models/Ticket');
const City = require('../models/City');
const ticketController = require('../controllers/ticketController');
const commentController = require('../controllers/commentController');
const attachmentController = require('../controllers/attachmentController');
const timeEntryController = require('../controllers/timeEntryController');
const tagController = require('../controllers/tagController');
const { authenticateToken, logUserAction, requirePermission } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { rateLimits } = require('../middleware');
const telegramService = require('../services/telegramServiceInstance');
const ticketWebSocketService = require('../services/ticketWebSocketService');

// Налаштування multer для завантаження файлів
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/tickets');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB
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
  }
});

// Схеми валідації
const createTicketSchema = Joi.object({
  title: Joi.string().max(200).required().messages({
    'string.max': 'Заголовок не може перевищувати 200 символів',
    'any.required': 'Заголовок є обов\'язковим'
  }),
  description: Joi.string().max(2000).required().messages({
    'string.max': 'Опис не може перевищувати 2000 символів',
    'any.required': 'Опис є обов\'язковим'
  }),
  priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
  city: Joi.string().optional().allow(null),
  tags: Joi.array().items(Joi.string()).optional(),
  estimatedTime: Joi.number().min(0).optional(),
  dueDate: Joi.date().optional()
});

const updateTicketSchema = Joi.object({
  title: Joi.string().max(200).optional(),
  description: Joi.string().max(2000).optional(),
  status: Joi.string().valid('open', 'in_progress', 'resolved', 'closed').optional(),
  priority: Joi.string().valid('low', 'medium', 'high').optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  estimatedTime: Joi.number().min(0).allow(null).optional(),
  actualTime: Joi.number().min(0).allow(null).optional(),
  dueDate: Joi.date().allow(null).optional()
});

const commentSchema = Joi.object({
  content: Joi.string().max(1000).required().messages({
    'string.max': 'Коментар не може перевищувати 1000 символів',
    'any.required': 'Зміст коментаря є обов\'язковим'
  }),
  isInternal: Joi.boolean().default(false)
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
      sortOrder = 'desc'
    } = req.query;

    // Побудова фільтрів
    const filters = {};
    
    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    if (city) filters.city = city;
    if (createdBy) filters.createdBy = createdBy;
    
    // Пошук по заголовку та опису
    if (search) {
      const searchConditions = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
      
      // Якщо є обмеження доступу, об'єднуємо їх з пошуком
      if (req.user.role !== 'admin') {
        // Для не-адмінів пошук має працювати тільки для їх тікетів
        filters.$and = [
          {
            createdBy: req.user._id
          },
          {
            $or: searchConditions
          }
        ];
      } else {
        // Для адмінів просто додаємо пошук
        filters.$or = searchConditions;
      }
    } else {
      // Обмеження доступу для звичайних користувачів (якщо немає пошуку)
      if (req.user.role !== 'admin') {
        filters.createdBy = req.user._id;
      }
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      populate: [
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'city', select: 'name region' }
      ]
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
        hasPrev: tickets.hasPrevPage
      }
    });

  } catch (error) {
    logger.error('Помилка отримання тикетів:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера'
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
        message: 'Тикет не знайдено'
      });
    }

    // Перевірка доступу
    if (req.user.role !== 'admin' && 
        ticket.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Доступ заборонено'
      });
    }

    res.json({
      success: true,
      data: ticket
    });

  } catch (error) {
    logger.error('Помилка отримання тикету:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера'
    });
  }
});

// @route   POST /api/tickets
// @desc    Створення нового тикету
// @access  Private
router.post('/', 
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
          errors: error.details
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
            message: 'Вказане місто не існує'
          });
        }
      }

      // Обробка вкладених файлів
      const attachments = req.files ? req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
        uploadedBy: req.user._id, // Додаємо uploadedBy для кожного вкладення
        uploadedAt: new Date()
      })) : [];

      // Визначаємо місто: якщо не вказано в формі, використовуємо місто з профілю користувача (як в боті)
      let cityId = value.city;
      if (!cityId && req.user.city) {
        cityId = req.user.city;
        logger.info('🏙️ Місто не вказано в формі, використовуємо місто з профілю користувача:', cityId);
      }

      // Визначаємо джерело створення тікету
      let source = 'web'; // За замовчуванням - веб (для веб-інтерфейсу)
      
      // Якщо source передано в запиті (для мобільного додатку), використовуємо його
      if (value.source && (value.source === 'mobile' || value.source === 'web' || value.source === 'telegram')) {
        source = value.source;
        logger.info(`📱 Визначено джерело з запиту: ${source}`);
      } else {
        // Перевіряємо User-Agent для визначення мобільного додатку
        const userAgent = req.get('user-agent') || '';
        const isMobileApp = userAgent.includes('okhttp') || userAgent.includes('MobileApp') || userAgent.includes('Android') && userAgent.includes('HelpDesk');
        
        if (isMobileApp) {
          source = 'mobile';
          logger.info('📱 Визначено джерело: мобільний додаток (за User-Agent)');
        } else {
          // Для веб-інтерфейсу завжди 'web'
          source = 'web';
          logger.info('🌐 Визначено джерело: веб (веб-інтерфейс)');
        }
      }

      // Створення тикету (узгоджено з логікою Telegram бота)
      const ticketData = {
        ...value,
        title: value.title,
        description: value.description,
        priority: value.priority || 'medium',
        city: cityId, // Використовуємо місто з профілю, якщо не вказано
        status: 'open', // Явно встановлюємо статус (як в боті)
        createdBy: req.user._id,
        attachments,
        metadata: {
          source: source // 'web' або 'mobile' в залежності від наявності активних пристроїв
        }
      };      
      const ticket = new Ticket(ticketData);

      await ticket.save();
      logger.info('✅ Тикет успішно створено:', ticket._id);

      // Заповнення полів для відповіді
      await ticket.populate([
        { path: 'createdBy', select: 'firstName lastName email telegramId' },
        { path: 'assignedTo', select: 'firstName lastName email' },
        { path: 'city', select: 'name region' }
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
            createdBy: ticket.createdBy?.firstName && ticket.createdBy?.lastName 
              ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}`
              : 'Невідомий користувач'
          }
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
        data: ticket
      });

    } catch (error) {
      logger.error('❌ Помилка створення тикету:', error);
      logger.error('❌ Stack trace:', error.stack);
      res.status(500).json({
        success: false,
        message: error.message || 'Помилка сервера',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// @route   PUT /api/tickets/:id
// @desc    Оновлення тикету
// @access  Private
router.put('/:id', 
  authenticateToken,
  logUserAction('оновив тикет'),
  async (req, res) => {
    try {
      logger.info(`🎯 ПОЧАТОК updateTicket для тікета ${req.params.id}, body:`, JSON.stringify(req.body));
      // Валідація даних
      const { error, value } = updateTicketSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message
        });
      }

      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Тикет не знайдено'
        });
      }

      // Перевірка доступу: тільки адміністратор може редагувати заявки
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Тільки адміністратор може редагувати заявки'
        });
      }

      // Перевірка: тільки адміністратор може змінювати статус
      if (value.status && value.status !== ticket.status && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Тільки адміністратор може змінювати статус тікету'
        });
      }

      // Перевірка: тільки адміністратор може змінювати пріоритет
      if (value.priority && value.priority !== ticket.priority && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Тільки адміністратор може змінювати пріоритет тікету'
        });
      }

      // Збереження попереднього статусу для перевірки змін
      const previousStatus = ticket.status;
      logger.info(`🚀 Оновлення тікету ${req.params.id}: попередній статус="${previousStatus}", новий статус="${value.status || 'не змінено'}"`);

      // Оновлення тикету (виключаємо status та priority, якщо користувач не адмін)
      const updateData = { ...value };
      if (req.user.role !== 'admin') {
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

      // Перевірка зміни статусу та відправка сповіщень
      if (value.status && value.status !== previousStatus) {
        logger.info(`✅ Статус тікету змінився з "${previousStatus}" на "${value.status}". Відправляю сповіщення...`);
        
        // Визначаємо джерело створення тікету
        const ticketSource = ticket.metadata?.source || 'web';
        const isTicketClosed = value.status === 'resolved' || value.status === 'closed';
        
        // Завантажуємо повну інформацію про автора для відправки сповіщень
        await ticket.populate([
          { path: 'createdBy', select: 'firstName lastName email telegramId' }
        ]);
        
        if (isTicketClosed) {
          // При закритті тікету - відправляємо сповіщення в відповідний месенджер залежно від джерела
          if (ticketSource === 'telegram') {
            // Тікет створено з Telegram - відправляємо сповіщення в Telegram користувачу
            if (ticket.createdBy?.telegramId) {
              try {
                const statusText = value.status === 'resolved' ? 'Вирішено' : 'Закрито';
                const statusEmoji = value.status === 'resolved' ? '✅' : '🔒';
                const message = 
                  `${statusEmoji} *Тікет ${statusText.toLowerCase()}*\n` +
                  `📋 ${ticket.title}\n` +
                  `🆔 \`${ticket._id}\`\n` +
                  `\n${statusEmoji} *${statusText}*`;
                
                await telegramService.sendMessage(ticket.createdBy.telegramId, message, { parse_mode: 'Markdown' });
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
                await fcmService.sendToUser(ticket.createdBy.toString(), {
                  title: `🎫 Тікет ${statusText.toLowerCase()}`,
                  body: `Тікет "${ticket.title}" має статус: ${statusText}`,
                  type: 'ticket_status_changed',
                  data: {
                    ticketId: ticket._id.toString(),
                    ticketTitle: ticket.title,
                    previousStatus: previousStatus,
                    newStatus: value.status,
                    changedBy: req.user.firstName && req.user.lastName 
                      ? `${req.user.firstName} ${req.user.lastName}`
                      : 'Адміністратор'
                  }
                });
                logger.info('✅ FCM сповіщення про закриття тікету відправлено користувачу (mobile)');
              } catch (error) {
                logger.error('❌ Помилка відправки FCM сповіщення користувачу (mobile):', error);
              }
            }
          } else {
            // Тікет створено з веб-інтерфейсу - відправляємо в групу Telegram та FCM (якщо є пристрій)
            try {
              await telegramService.sendTicketStatusNotificationToGroup(
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
                await fcmService.sendToUser(ticket.createdBy.toString(), {
                  title: `🎫 Тікет ${statusText.toLowerCase()}`,
                  body: `Тікет "${ticket.title}" має статус: ${statusText}`,
                  type: 'ticket_status_changed',
                  data: {
                    ticketId: ticket._id.toString(),
                    ticketTitle: ticket.title,
                    previousStatus: previousStatus,
                    newStatus: value.status,
                    changedBy: req.user.firstName && req.user.lastName 
                      ? `${req.user.firstName} ${req.user.lastName}`
                      : 'Адміністратор'
                  }
                });
                logger.info('✅ FCM сповіщення про закриття тікету відправлено користувачу (web)');
              } catch (error) {
                logger.error('❌ Помилка відправки FCM сповіщення користувачу (web):', error);
              }
            }
          }
        } else {
          // Для інших змін статусу - відправляємо в групу для всіх джерел
          try {
            await telegramService.sendTicketStatusNotificationToGroup(
              ticket,
              previousStatus,
              value.status,
              req.user
            );
            logger.info(`📤 Сповіщення про зміну статусу відправлено в групу`);
          } catch (error) {
            logger.error('❌ Помилка відправки Telegram сповіщення в групу:', error);
          }
        }
      } else {
        logger.info(`❌ Статус тікету не змінився, сповіщення не відправляється`);
      }

      // Перевірка на закриття тікета для відправки запиту на оцінку через Telegram
      const isTicketClosed = value.status && (value.status === 'resolved' || value.status === 'closed');
      const wasTicketOpen = previousStatus && previousStatus !== 'resolved' && previousStatus !== 'closed';
      
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
          logger.info(`🔍 Статус qualityRating: ratingRequested=${ticket.qualityRating.ratingRequested}, hasRating=${ticket.qualityRating.hasRating}`);
          
          // Перевіряємо, чи не було вже відправлено запит на оцінку
          if (!ticket.qualityRating.ratingRequested) {
            await telegramService.sendQualityRatingRequest(ticket);
            
            // Позначаємо, що запит на оцінку відправлено
            ticket.qualityRating.ratingRequested = true;
            ticket.qualityRating.requestedAt = new Date();
            await ticket.save();
            
            logger.info(`✅ Запит на оцінку якості відправлено успішно`);
          } else {
            logger.info(`ℹ️ Запит на оцінку вже було відправлено раніше (requestedAt: ${ticket.qualityRating.requestedAt})`);
          }
        } catch (error) {
          logger.error('❌ Помилка відправки запиту на оцінку якості:', error);
          // Не зупиняємо виконання, якщо запит на оцінку не вдалося відправити
        }
      }
      // Заповнення полів для відповіді
      await ticket.populate([
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'city', select: 'name region' }
      ]);

      res.json({
        success: true,
        message: 'Тикет успішно оновлено',
        data: ticket
      });

    } catch (error) {
      logger.error('Помилка оновлення тикету:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера'
      });
    }
  }
);

// @route   DELETE /api/tickets/bulk/delete
// @desc    Масове видалення тікетів
// @access  Private (Admin only)
router.delete('/bulk/delete',
  authenticateToken,
  requirePermission('delete_tickets'),
  [
    body('ticketIds')
      .isArray({ min: 1 })
      .withMessage('ticketIds повинен бути непустим масивом'),
    body('ticketIds.*')
      .isMongoId()
      .withMessage('Кожен ID тікету повинен бути валідним')
  ],
  logUserAction('масово видалив тікети'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Помилки валідації',
          errors: errors.array()
        });
      }

      const { ticketIds } = req.body;

      // Перевірка чи існують тікети
      const tickets = await Ticket.find({ _id: { $in: ticketIds } });
      if (tickets.length !== ticketIds.length) {
        return res.status(404).json({
          success: false,
          message: 'Деякі тікети не знайдено'
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
          deletedCount: result.deletedCount
        }
      });

    } catch (error) {
      logger.error('Помилка масового видалення тікетів:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера при масовому видаленні',
        error: error.message
      });
    }
  }
);

// @route   DELETE /api/tickets/:id
// @desc    Видалення тикету
// @access  Private (Admin only)
router.delete('/:id', 
  authenticateToken,
  requirePermission('delete_tickets'),
  logUserAction('видалив тикет'),
  async (req, res) => {
    try {
      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Тикет не знайдено'
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
        message: 'Тикет успішно видалено'
      });

    } catch (error) {
      logger.error('Помилка видалення тикету:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера'
      });
    }
  }
);

// @route   POST /api/tickets/:id/comments
// @desc    Додавання коментаря до тикету
// @access  Private
router.post('/:id/comments',
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
          message: error.details[0].message
        });
      }

      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Тикет не знайдено'
        });
      }

      // Перевірка доступу
      if (req.user.role !== 'admin' && 
          ticket.createdBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Доступ заборонено'
        });
      }

      // Обробка вкладених файлів
      const attachments = req.files ? req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      })) : [];

      // Додавання коментаря
      const comment = {
        author: req.user._id,
        content: value.content,
        isInternal: value.isInternal,
        attachments
      };

      ticket.comments.push(comment);
      await ticket.save();

      // Заповнення автора коментаря
      await ticket.populate('comments.author', 'firstName lastName email');

      const newComment = ticket.comments[ticket.comments.length - 1];

      // Відправка FCM сповіщення автору тікету про новий коментар
      try {
        const fcmService = require('../services/fcmService');
        const recipients = [];
        if (ticket.createdBy) recipients.push(ticket.createdBy.toString());
        
        // Видаляємо автора коментаря зі списку отримувачів (він сам додав коментар)
        const commentAuthorId = req.user._id.toString();
        const uniqueRecipients = [...new Set(recipients)].filter(id => id !== commentAuthorId);
        
        for (const userId of uniqueRecipients) {
          await fcmService.sendToUser(userId, {
            title: '💬 Новий коментар до тікету',
            body: `${req.user.firstName} ${req.user.lastName} додав коментар до тікету "${ticket.title}"`,
            type: 'ticket_comment',
            data: {
              ticketId: ticket._id.toString(),
              ticketTitle: ticket.title,
              commentId: newComment._id.toString(),
              commentAuthor: `${req.user.firstName} ${req.user.lastName}`,
              commentPreview: value.content.substring(0, 100)
            }
          });
        }
        logger.info('✅ FCM сповіщення про новий коментар відправлено');
      } catch (error) {
        logger.error('❌ Помилка відправки FCM сповіщення про коментар:', error);
      }

      res.status(201).json({
        success: true,
        message: 'Коментар успішно додано',
        data: newComment
      });

    } catch (error) {
      logger.error('Помилка додавання коментаря:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера'
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
        message: 'Оцінка повинна бути від 1 до 5'
      });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тікет не знайдено'
      });
    }

    // Перевірка доступу - тільки автор тікету може оцінити
    if (String(ticket.createdBy) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Доступ заборонено. Тільки автор тікету може оцінити якість вирішення'
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
        feedback: ticket.qualityRating.feedback
      }
    });
  } catch (error) {
    logger.error('Помилка збереження оцінки тікету:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера'
    });
  }
});

// POST /api/tickets/:id/send-telegram-message - Відправити повідомлення користувачу через Telegram
router.post('/:id/send-telegram-message', 
  authenticateToken, 
  requirePermission('tickets.manage'),
  async (req, res) => {
    try {
      const { content, message } = req.body;
      const messageContent = content || message; // Підтримка обох варіантів для сумісності
      
      if (!messageContent || !messageContent.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Повідомлення не може бути порожнім'
        });
      }

      if (messageContent.length > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Повідомлення не може перевищувати 1000 символів'
        });
      }

      const ticket = await Ticket.findById(req.params.id)
        .populate('createdBy', 'firstName lastName email telegramId telegramChatId');
      
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Тікет не знайдено'
        });
      }

      // Перевірка, чи користувач має Telegram ID
      const user = ticket.createdBy;
      if (!user || (!user.telegramId && !user.telegramChatId)) {
        return res.status(400).json({
          success: false,
          message: 'Користувач не має Telegram ID для відправки повідомлення'
        });
      }

      // Відправляємо повідомлення через Telegram
      const chatId = user.telegramChatId || user.telegramId;
      const telegramMessage = 
        `💬 *Повідомлення від адміністратора*\n\n` +
        `📋 *Тікет:* ${ticket.title}\n` +
        `🆔 \`${ticket._id}\`\n\n` +
        `${messageContent.trim()}\n\n` +
        `💡 Ви можете відповісти на це повідомлення, і ваша відповідь буде додана як коментар до тікету.`;

      try {
        const result = await telegramService.sendMessage(chatId, telegramMessage, { parse_mode: 'Markdown' });
        
        // Зберігаємо повідомлення в окрему колекцію TelegramMessage
        const TelegramMessage = require('../models/TelegramMessage');
        const telegramMsg = new TelegramMessage({
          ticketId: ticket._id,
          senderId: req.user._id,
          recipientId: user._id,
          content: messageContent.trim(),
          direction: 'admin_to_user',
          telegramMessageId: result?.message_id?.toString() || null,
          telegramChatId: String(chatId),
          sentAt: new Date(),
          deliveredAt: new Date()
        });
        await telegramMsg.save();

        // Відправляємо WebSocket сповіщення про нове повідомлення
        try {
          await telegramMsg.populate([
            { path: 'senderId', select: 'firstName lastName email' },
            { path: 'recipientId', select: 'firstName lastName email' }
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
          await telegramService.setActiveTicketForUser(String(user.telegramId), ticket._id.toString());
        }
        
        // Також встановлюємо за userId (якщо потрібно)
        const userId = user.telegramId || chatId;
        if (String(userId) !== String(chatId)) {
          await telegramService.setActiveTicketForUser(String(userId), ticket._id.toString());
        }

        logger.info(`Повідомлення відправлено користувачу ${user.email} через Telegram для тікету ${ticket._id}`, {
          chatId: String(chatId),
          telegramId: user.telegramId,
          telegramChatId: user.telegramChatId,
          ticketId: ticket._id.toString()
        });
        
        res.json({
          success: true,
          message: 'Повідомлення успішно відправлено через Telegram',
          data: {
            ticketId: ticket._id,
            sentAt: new Date()
          }
        });
      } catch (telegramError) {
        logger.error('Помилка відправки повідомлення через Telegram:', telegramError);
        return res.status(500).json({
          success: false,
          message: 'Помилка відправки повідомлення через Telegram',
          error: telegramError.message
        });
      }
    } catch (error) {
      logger.error('Помилка відправки повідомлення через Telegram:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера'
      });
    }
  }
);

// POST /api/tickets/:id/analyze - Аналіз тікета через AI
router.post('/:id/analyze',
  authenticateToken,
  requirePermission('view_tickets'),
  param('id').isMongoId().withMessage('Невірний ID тікету'),
  async (req, res) => {
    try {
      const groqService = require('../services/groqService');
      
      if (!groqService.isEnabled()) {
        return res.status(503).json({
          success: false,
          message: 'AI асистент вимкнено. Увімкніть AI в налаштуваннях бота.'
        });
      }

      const ticket = await Ticket.findById(req.params.id)
        .populate('createdBy', 'firstName lastName email position')
        .populate('assignedTo', 'firstName lastName email position')
        .populate('city', 'name region')
        .populate('institution', 'name')
        .populate({
          path: 'comments',
          populate: {
            path: 'author',
            select: 'firstName lastName email'
          },
          options: { sort: { createdAt: -1 } }
        });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Тікет не знайдено'
        });
      }

      // Отримуємо історію змін тікета
      const TicketHistory = require('../models/TicketHistory');
      const history = await TicketHistory.find({ ticketId: ticket._id })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean();

      const ticketWithHistory = {
        ...ticket.toObject(),
        history: history
      };

      // Викликаємо AI аналіз
      const analysis = await groqService.analyzeTicket(ticketWithHistory, {
        user: req.user,
        timestamp: new Date()
      });

      if (!analysis) {
        return res.status(500).json({
          success: false,
          message: 'Не вдалося проаналізувати тікет. Спробуйте пізніше.'
        });
      }

      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      logger.error('Помилка AI аналізу тікета:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера при аналізі тікета',
        error: error.message
      });
    }
  }
);

// GET /api/tickets/:id/telegram-messages - Отримати всі Telegram повідомлення для тікету
router.get('/:id/telegram-messages',
  authenticateToken,
  async (req, res) => {
    try {
      const TelegramMessage = require('../models/TelegramMessage');
      const ticket = await Ticket.findById(req.params.id);
      
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Тікет не знайдено'
        });
      }

      // Перевірка доступу: тільки адміни або автор тікету можуть переглядати повідомлення
      const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
      const isCreator = String(ticket.createdBy) === String(req.user._id);
      
      if (!isAdmin && !isCreator) {
        return res.status(403).json({
          success: false,
          message: 'Доступ заборонено'
        });
      }

      // Отримуємо всі повідомлення для тікету, відсортовані за датою
      const messages = await TelegramMessage.find({ ticketId: ticket._id })
        .populate('senderId', 'firstName lastName email avatar')
        .populate('recipientId', 'firstName lastName email avatar')
        .sort({ createdAt: 1 }); // Сортування за датою (від старіших до новіших)

      res.json({
        success: true,
        data: messages
      });
    } catch (error) {
      logger.error('Помилка отримання Telegram повідомлень:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера'
      });
    }
  }
);

module.exports = router;