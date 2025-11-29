const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Joi = require('joi');
const { body, query, param } = require('express-validator');
const Ticket = require('../models/Ticket');
const City = require('../models/City');
const Category = require('../models/Category');
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
  category: Joi.string().valid('technical', 'account', 'billing', 'general').default('general'),
  city: Joi.string().required().messages({
    'any.required': 'Місто є обов\'язковим'
  }),
  assignedTo: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  estimatedTime: Joi.number().min(0).optional(),
  dueDate: Joi.date().optional()
});

const updateTicketSchema = Joi.object({
  title: Joi.string().max(200).optional(),
  description: Joi.string().max(2000).optional(),
  status: Joi.string().valid('open', 'in_progress', 'resolved', 'closed').optional(),
  priority: Joi.string().valid('low', 'medium', 'high').optional(),
  category: Joi.string().valid('technical', 'account', 'billing', 'general').optional(),
  assignedTo: Joi.string().allow(null).optional(),
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
      category,
      city,
      assignedTo,
      createdBy,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Побудова фільтрів
    const filters = {};
    
    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    if (category) filters.category = category;
    if (city) filters.city = city;
    if (assignedTo) filters.assignedTo = assignedTo;
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
            $or: [
              { createdBy: req.user._id },
              { assignedTo: req.user._id }
            ]
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
        filters.$or = [
          { createdBy: req.user._id },
          { assignedTo: req.user._id }
        ];
      }
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      populate: [
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'assignedTo', select: 'firstName lastName email' },
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
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
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
        ticket.createdBy._id.toString() !== req.user._id.toString() &&
        (!ticket.assignedTo || ticket.assignedTo._id.toString() !== req.user._id.toString())) {
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

      // Конвертація category зі строки в ObjectId
      let categoryId = value.category;
      if (typeof value.category === 'string' && !mongoose.Types.ObjectId.isValid(value.category)) {
        // Мапінг англійських назв enum на українські назви категорій в базі
        const categoryNameMap = {
          'technical': ['Технічні', 'Технічні питання', 'Технічні проблеми'],
          'account': ['Акаунт', 'Обліковий запис', 'Авторизація'],
          'billing': ['Фінанси', 'Біллінг'],
          'general': ['Загальні', 'Загальні питання', 'Інструкції']
        };
        
        const categoryNames = categoryNameMap[value.category.toLowerCase()] || [];
        
        // Спочатку шукаємо точний збіг
        let category = await Category.findOne({ 
          name: { $in: categoryNames },
          isActive: true 
        });
        
        // Якщо не знайдено, шукаємо по частковому збігу (на початку назви)
        if (!category && categoryNames.length > 0) {
          const regexPatterns = categoryNames.map(name => new RegExp(`^${name}`, 'i'));
          category = await Category.findOne({ 
            name: { $regex: regexPatterns[0] },
            isActive: true 
          });
        }
        
        // Якщо все ще не знайдено, спробуємо знайти за англійською назвою
        if (!category) {
          category = await Category.findOne({ 
            name: new RegExp(`^${value.category.toLowerCase()}$`, 'i'),
            isActive: true 
          });
        }
        
        if (!category) {
          logger.warn('❌ Категорія не знайдена:', value.category);
          logger.warn('❌ Шукали за назвами:', categoryNames);
          // Логуємо всі доступні категорії для діагностики
          const allCategories = await Category.find({ isActive: true }).select('name');
          logger.warn('❌ Доступні категорії в базі:', allCategories.map(c => c.name));
          return res.status(400).json({
            success: false,
            message: `Категорія "${value.category}" не знайдена. Переконайтеся, що категорії ініціалізовані в базі даних.`
          });
        }
        
        categoryId = category._id;
        logger.info('✅ Категорія знайдена за назвою:', { 
          category: value.category, 
          categoryId: category._id,
          foundName: category.name 
        });
      } else if (typeof value.category === 'string' && mongoose.Types.ObjectId.isValid(value.category)) {
        // Якщо category - це валідний ObjectId
        categoryId = new mongoose.Types.ObjectId(value.category);
      }

      // Обробка вкладених файлів
      const attachments = req.files ? req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      })) : [];

      // Створення тикету
      const ticket = new Ticket({
        ...value,
        category: categoryId, // Використовуємо конвертований categoryId
        createdBy: req.user._id,
        attachments,
        source: 'web'
      });

      await ticket.save();
      logger.info('✅ Тикет успішно створено:', ticket._id);

      // Заповнення полів для відповіді
      await ticket.populate([
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'assignedTo', select: 'firstName lastName email' },
        { path: 'city', select: 'name region' },
        { path: 'category', select: 'name color' }
      ]);

      // Відправка Telegram сповіщення про новий тікет
      try {
        await telegramService.sendNewTicketNotificationToGroup(ticket, req.user);
        logger.info('✅ Telegram сповіщення про новий тікет відправлено');
      } catch (error) {
        logger.error('❌ Помилка відправки Telegram сповіщення про новий тікет:', error);
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

      // Відправка FCM сповіщення адміністраторам про новий тікет
      try {
        const fcmService = require('../services/fcmService');
        await fcmService.sendToAdmins({
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
        logger.info('✅ FCM сповіщення про новий тікет відправлено адміністраторам');
      } catch (error) {
        logger.error('❌ Помилка відправки FCM сповіщення про новий тікет:', error);
        // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
      }
      
      // Відправка FCM сповіщення призначеному користувачу (якщо тікет призначено при створенні)
      if (ticket.assignedTo) {
        try {
          const fcmService = require('../services/fcmService');
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
          logger.info('✅ FCM сповіщення про призначення тікету відправлено користувачу');
        } catch (error) {
          logger.error('❌ Помилка відправки FCM сповіщення про призначення:', error);
        }
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

      // Перевірка доступу
      if (req.user.role !== 'admin' && 
          ticket.createdBy.toString() !== req.user._id.toString() &&
          (!ticket.assignedTo || ticket.assignedTo.toString() !== req.user._id.toString())) {
        return res.status(403).json({
          success: false,
          message: 'Доступ заборонено'
        });
      }

      // Збереження попереднього статусу для перевірки змін
      const previousStatus = ticket.status;
      logger.info(`🚀 Оновлення тікету ${req.params.id}: попередній статус="${previousStatus}", новий статус="${value.status || 'не змінено'}"`);

      // Оновлення тикету
      Object.assign(ticket, value);
      await ticket.save();

      // Перевірка зміни статусу та відправка сповіщень
      if (value.status && value.status !== previousStatus) {
        logger.info(`✅ Статус тікету змінився з "${previousStatus}" на "${value.status}". Відправляю сповіщення...`);
        try {
          // Відправка сповіщення в групу
          await telegramService.sendTicketStatusNotificationToGroup(
            ticket,
            previousStatus,
            value.status,
            req.user
          );
          
          // Відправка сповіщення користувачеві
          await telegramService.sendTicketNotification(ticket, 'updated');
          logger.info(`📤 Сповіщення про зміну статусу відправлено успішно`);
        } catch (error) {
          logger.error('❌ Помилка відправки Telegram сповіщення:', error);
          // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
        }
        
        // Відправка FCM сповіщення автору та призначеному користувачу про зміну статусу
        try {
          const fcmService = require('../services/fcmService');
          const statusText = {
            'open': 'Відкрито',
            'in_progress': 'В роботі',
            'resolved': 'Вирішено',
            'closed': 'Закрито'
          };
          
          const recipients = [];
          if (ticket.createdBy) recipients.push(ticket.createdBy.toString());
          if (ticket.assignedTo) recipients.push(ticket.assignedTo.toString());
          
          // Видаляємо дублікати
          const uniqueRecipients = [...new Set(recipients)];
          
          for (const userId of uniqueRecipients) {
            await fcmService.sendToUser(userId, {
              title: '🔄 Статус тікету змінено',
              body: `Тікет "${ticket.title}" тепер має статус: ${statusText[value.status] || value.status}`,
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
          }
          logger.info('✅ FCM сповіщення про зміну статусу відправлено');
        } catch (error) {
          logger.error('❌ Помилка відправки FCM сповіщення про зміну статусу:', error);
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
        { path: 'assignedTo', select: 'firstName lastName email' },
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
          ticket.createdBy.toString() !== req.user._id.toString() &&
          (!ticket.assignedTo || ticket.assignedTo.toString() !== req.user._id.toString())) {
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

      // Відправка FCM сповіщення автору тікету та призначеному користувачу про новий коментар
      try {
        const fcmService = require('../services/fcmService');
        const recipients = [];
        if (ticket.createdBy) recipients.push(ticket.createdBy.toString());
        if (ticket.assignedTo) recipients.push(ticket.assignedTo.toString());
        
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

module.exports = router;