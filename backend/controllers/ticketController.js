const Ticket = require('../models/Ticket');
const User = require('../models/User');
const City = require('../models/City');
const Comment = require('../models/Comment');
const Attachment = require('../models/Attachment');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const telegramService = require('../services/telegramServiceInstance');
const ticketWebSocketService = require('../services/ticketWebSocketService');
const logger = require('../utils/logger');
logger.info('📱 telegramService імпортовано:', typeof telegramService);

// Отримати всі тикети з фільтрацією та пагінацією
exports.getTickets = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      priority,
      city,
      assignedTo,
      createdBy,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      dateFrom,
      dateTo
    } = req.query;

    // Побудова фільтрів
    const filters = {};
    
    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    if (city) filters.city = city;
    if (assignedTo) filters.assignedTo = assignedTo;
    if (createdBy) filters.createdBy = createdBy;
    
    // Пошук по тексту
    if (search) {
      const searchConditions = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { ticketNumber: { $regex: search, $options: 'i' } }
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
      // Перевірка прав доступу (якщо немає пошуку)
      if (req.user.role !== 'admin') {
        // Звичайні користувачі бачать тільки свої тикети або призначені їм
        filters.createdBy = req.user._id;
      }
    }
    
    // Фільтр по датах
    if (dateFrom || dateTo) {
      filters.createdAt = {};
      if (dateFrom) filters.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filters.createdAt.$lte = new Date(dateTo);
    }

    logger.info('Filters before access check:', JSON.stringify(filters));
    logger.info('User:', { role: req.user.role, id: req.user._id.toString() });

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      populate: [
        { path: 'createdBy', select: 'firstName lastName email position' },
        { path: 'city', select: 'name region' }
      ]
    };

    const tickets = await Ticket.paginate(filters, options);

    logger.info('Tickets fetched:', { total: tickets.totalDocs, page: tickets.page, filters: JSON.stringify(filters) });

    // Перетворюємо Mongoose документи в прості об'єкти для правильної JSON серіалізації
    const ticketsData = tickets.docs.map(ticket => ticket.toObject());

    res.json({
      success: true,
      data: ticketsData,
      pagination: {
        totalItems: tickets.totalDocs,
        currentPage: tickets.page,
        totalPages: tickets.totalPages,
        itemsPerPage: tickets.limit,
        hasNext: tickets.hasNextPage,
        hasPrev: tickets.hasPrevPage
      }
    });
  } catch (error) {
    logger.error('Error fetching tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні тикетів',
      error: error.message
    });
  }
};

// Отримати тикет за ID
exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID тикету'
      });
    }

    const ticket = await Ticket.findById(id)
      .populate('createdBy', 'firstName lastName email position city avatar telegramId telegramChatId')
      .populate('city', 'name region coordinates')
      .populate('watchers', 'firstName lastName email')
      .populate('createdBy.position', 'title')
      .populate('createdBy.city', 'name');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тикет не знайдено'
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin' && 
        !ticket.createdBy.equals(req.user._id) && 
        !ticket.watchers.some(watcher => watcher._id.equals(req.user._id))) {
      return res.status(403).json({
        success: false,
        message: 'Немає доступу до цього тикету'
      });
    }

    // Отримати коментарі та вкладення
    const [comments, attachments] = await Promise.all([
      Comment.findByTicket(id),
      Attachment.findByTicket(id)
    ]);

    res.json({
      success: true,
      data: {
        ...ticket.toObject(),
        comments,
        attachments
      }
    });
  } catch (error) {
    logger.error('Error fetching ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні тикету',
      error: error.message
    });
  }
};

// Створити новий тикет
exports.createTicket = async (req, res) => {
  try {
    logger.info('🎫 Початок створення тікету, дані:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    const {
      title,
      description,
      priority = 'medium',
      subcategory,
      city,
      assignedTo,
      dueDate,
      estimatedHours,
      tags
    } = req.body;

    // Перевірка існування міста
    if (city) {
      const cityExists = await City.findById(city);
      if (!cityExists) {
        return res.status(400).json({
          success: false,
          message: 'Вказане місто не існує'
        });
      }
    }

    const ticket = new Ticket({
      title,
      description,
      priority,
      subcategory,
      city,
      createdBy: req.user._id,
      dueDate: dueDate ? new Date(dueDate) : null,
      estimatedHours,
      tags: tags || []
    });

    await ticket.save();
    logger.info('✅ Тікет збережено в базі даних:', ticket._id);


    // Відправка сповіщення в Telegram групу про новий тікет
    logger.info('🎯 Викликаю функцію відправки сповіщення для тікету:', ticket._id);
    logger.info('📱 telegramService тип:', typeof telegramService);
    logger.info('📱 telegramService методи:', Object.getOwnPropertyNames(Object.getPrototypeOf(telegramService)));
    
    try {
      logger.info('🚀 Починаю відправку сповіщення...');
      await telegramService.sendNewTicketNotificationToGroup(ticket, req.user);
      logger.info('✅ Сповіщення відправлено успішно');
    } catch (error) {
      logger.error('❌ Помилка відправки Telegram сповіщення про новий тікет:', error);
      // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
    }

    // Відправка WebSocket сповіщення про новий тікет
    try {
      await ticket.populate([
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'city', select: 'name region' }
      ]);
      
      ticketWebSocketService.notifyNewTicket(ticket);
      logger.info('✅ WebSocket сповіщення про новий тікет відправлено');
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket сповіщення про новий тікет:', error);
    }

    // Заповнити дані для відповіді (вже заповнено вище для WebSocket)
    res.status(201).json({
      success: true,
      message: 'Тикет успішно створено',
      data: ticket
    });
  } catch (error) {
    logger.error('Error creating ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при створенні тикету',
      error: error.message
    });
  }
};

// Оновити тикет
exports.updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`🚀 updateTicket викликано для тікету ${id} користувачем ${req.user.email}`);
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID тикету'
      });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тикет не знайдено'
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin' && 
        !ticket.createdBy.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для редагування цього тикету'
      });
    }

    const {
      title,
      description,
      status,
      priority,
      subcategory,
      city,
      assignedTo,
      dueDate,
      estimatedHours,
      actualHours,
      tags
    } = req.body;

    // Збереження попереднього стану для логування змін
    const previousState = {
      status: ticket.status,
      priority: ticket.priority
    };

    // Оновлення полів
    if (title !== undefined) ticket.title = title;
    if (description !== undefined) ticket.description = description;
    if (priority !== undefined) ticket.priority = priority;
    if (subcategory !== undefined) ticket.subcategory = subcategory;
    if (city !== undefined) ticket.city = city;
    if (dueDate !== undefined) ticket.dueDate = dueDate ? new Date(dueDate) : null;
    if (estimatedHours !== undefined) ticket.estimatedHours = estimatedHours;
    if (actualHours !== undefined) ticket.actualHours = actualHours;
    if (tags !== undefined) ticket.tags = tags;

    // Обробка зміни статусу
    if (status !== undefined && status !== ticket.status) {
      ticket.status = status;
      if (status === 'resolved') {
        ticket.resolvedAt = new Date();
      } else if (status === 'closed') {
        ticket.closedAt = new Date();
      }
    }


    await ticket.save();


    // Якщо це перша відповідь, встановлюємо firstResponseAt
    if (status !== undefined && status !== previousState.status) {
      if (status === 'in_progress' && !ticket.firstResponseAt) {
        ticket.firstResponseAt = new Date();
        await ticket.save();
      }
    }

    // Створення системних коментарів для важливих змін
    const systemComments = [];
    
    if (status && status !== previousState.status) {
      systemComments.push({
        content: `Статус змінено з "${previousState.status}" на "${status}"`,
        ticket: ticket._id,
        author: req.user._id,
        type: 'status_change'
      });
    }


    if (priority && priority !== previousState.priority) {
      systemComments.push({
        content: `Пріоритет змінено з "${previousState.priority}" на "${priority}"`,
        ticket: ticket._id,
        author: req.user._id,
        type: 'priority_change'
      });
    }

    if (systemComments.length > 0) {
      await Comment.insertMany(systemComments);
    }

    // Відправка сповіщення в Telegram групу при зміні статусу
    logger.info(`🔍 Перевірка зміни статусу: поточний="${status}", попередній="${previousState.status}"`);
    
    if (status && status !== previousState.status) {
      logger.info(`✅ Статус змінився! Відправляю сповіщення...`);
      try {
        await telegramService.sendTicketStatusNotificationToGroup(
          ticket,
          previousState.status,
          status,
          req.user
        );
        
        // Відправка сповіщення користувачеві про зміну статусу
        await telegramService.sendTicketNotification(ticket, 'updated');
      } catch (error) {
        logger.error('Помилка відправки Telegram сповіщення:', error);
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
        
        // Видаляємо дублікати
        const uniqueRecipients = [...new Set(recipients)];
        
        for (const userId of uniqueRecipients) {
          await fcmService.sendToUser(userId, {
            title: '🔄 Статус тікету змінено',
            body: `Тікет "${ticket.title}" тепер має статус: ${statusText[status] || status}`,
            type: 'ticket_status_changed',
            data: {
              ticketId: ticket._id.toString(),
              ticketTitle: ticket.title,
              previousStatus: previousState.status,
              newStatus: status,
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
      logger.info(`❌ Статус не змінився, сповіщення не відправляється`);
    }

    // Заповнити дані для відповіді
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
    logger.error('Error updating ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при оновленні тикету',
      error: error.message
    });
  }
};

// Видалити тикет
exports.deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID тикету'
      });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тикет не знайдено'
      });
    }

    // Перевірка прав доступу (тільки адміни або автори можуть видаляти)
    if (req.user.role !== 'admin' && !ticket.createdBy.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для видалення цього тикету'
      });
    }

    await ticket.deleteOne();

    res.json({
      success: true,
      message: 'Тикет успішно видалено'
    });
  } catch (error) {
    logger.error('Error deleting ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні тикету',
      error: error.message
    });
  }
};

// Додати спостерігача до тикету
exports.addWatcher = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тикет не знайдено'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Користувач не знайдено'
      });
    }

    await ticket.addWatcher(userId);

    res.json({
      success: true,
      message: 'Спостерігача додано до тикету'
    });
  } catch (error) {
    logger.error('Error adding watcher:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при додаванні спостерігача',
      error: error.message
    });
  }
};

// Видалити спостерігача з тикету
exports.removeWatcher = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тикет не знайдено'
      });
    }

    await ticket.removeWatcher(userId);

    res.json({
      success: true,
      message: 'Спостерігача видалено з тикету'
    });
  } catch (error) {
    logger.error('Error removing watcher:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні спостерігача',
      error: error.message
    });
  }
};

// Отримати статистику тикетів
exports.getTicketStatistics = async (req, res) => {
  try {
    const { period = '30d', city } = req.query;
    
    // Визначення періоду
    const now = new Date();
    let startDate;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const matchStage = {
      createdAt: { $gte: startDate }
    };

    if (city) matchStage.city = new mongoose.Types.ObjectId(city);

    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      matchStage.createdBy = req.user._id;
    }

    const statistics = await Ticket.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
          high: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } },
          medium: { $sum: { $cond: [{ $eq: ['$priority', 'medium'] }, 1, 0] } },
          low: { $sum: { $cond: [{ $eq: ['$priority', 'low'] }, 1, 0] } },
          avgResolutionTime: {
            $avg: {
              $cond: [
                { $and: [{ $ne: ['$resolvedAt', null] }, { $ne: ['$createdAt', null] }] },
                { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 1000 * 60 * 60] },
                null
              ]
            }
          }
        }
      }
    ]);

    const stats = statistics[0] || {
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0,
      high: 0,
      medium: 0,
      low: 0,
      avgResolutionTime: 0
    };

    res.json({
      success: true,
      data: {
        period,
        statistics: stats,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    logger.error('Error fetching ticket statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні статистики',
      error: error.message
    });
  }
};





// Експорт тікетів
exports.exportTickets = async (req, res) => {
  try {
    const {
      format = 'csv', // csv або excel
      status,
      priority,
      city,
      assignedTo,
      createdBy,
      dateFrom,
      dateTo,
      includeComments = false,
      includeAttachments = false
    } = req.query;

    // Побудова фільтрів (аналогічно до getTickets)
    const filters = {};
    
    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    if (city) filters.city = city;
    if (assignedTo) filters.assignedTo = assignedTo;
    if (createdBy) filters.createdBy = createdBy;
    
    // Фільтр по датах
    if (dateFrom || dateTo) {
      filters.createdAt = {};
      if (dateFrom) filters.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filters.createdAt.$lte = new Date(dateTo);
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      filters.createdBy = req.user._id;
    }

    // Отримання тікетів з повною інформацією
    const tickets = await Ticket.find(filters)
      .populate({
        path: 'createdBy',
        select: 'firstName lastName email position city',
        populate: [
          {
            path: 'city',
            select: 'name region'
          },
          {
            path: 'position',
            select: 'title'
          }
        ]
      })
      .populate('city', 'name region')
      .populate('tags', 'name color')
      .sort({ createdAt: -1 })
      .lean();

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Не знайдено тікетів для експорту'
      });
    }

    // Функція для обчислення метрик тікету
    const calculateTicketMetrics = (ticket) => {
      const metrics = {
        responseTime: 0,
        resolutionTime: 0,
        isOverdue: false,
        daysOpen: 0,
        statusChanges: 0,
        lastActivity: null,
        escalationLevel: 0,
        reopenCount: 0
      };

      const now = new Date();
      const createdAt = new Date(ticket.createdAt);
      
      // Обчислення днів з моменту створення
      metrics.daysOpen = Math.ceil((now - createdAt) / (1000 * 60 * 60 * 24));
      
      // Час відповіді (до першої відповіді)
      if (ticket.firstResponseAt) {
        const responseTime = (new Date(ticket.firstResponseAt) - createdAt) / (1000 * 60 * 60);
        metrics.responseTime = Math.round(responseTime * 100) / 100;
      }
      
      // Час вирішення
      if (ticket.resolvedAt) {
        const resolutionTime = (new Date(ticket.resolvedAt) - createdAt) / (1000 * 60 * 60);
        metrics.resolutionTime = Math.round(resolutionTime * 100) / 100;
      } else if (['resolved', 'closed'].includes(ticket.status)) {
        const resolutionTime = (now - createdAt) / (1000 * 60 * 60);
        metrics.resolutionTime = Math.round(resolutionTime * 100) / 100;
      }
      
      
      // Кількість змін статусу
      if (ticket.statusHistory && ticket.statusHistory.length > 0) {
        metrics.statusChanges = ticket.statusHistory.length;
        metrics.lastActivity = ticket.statusHistory[ticket.statusHistory.length - 1].changedAt;
      }
      
      // Рівень ескалації
      if (ticket.escalation) {
        metrics.escalationLevel = ticket.escalation.level || 0;
      }
      
      // Кількість повторних відкриттів
      if (ticket.statusHistory) {
        metrics.reopenCount = ticket.statusHistory.filter(h => 
          h.status === 'open' && ticket.statusHistory.indexOf(h) > 0
        ).length;
      }
      
      return metrics;
    };

    // Підготовка даних для експорту
    const exportData = tickets.map(ticket => {
      const calculatedMetrics = calculateTicketMetrics(ticket);
      
      const baseData = {
        // Основна інформація про тікет
        'Номер тікету': ticket.ticketNumber || 'Не присвоєно',
        'Назва тікету': ticket.title,
        'Автор': ticket.createdBy ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}` : 'Невідомо',
        'Email автора': ticket.createdBy ? ticket.createdBy.email : 'Невідомо',
        'Посада автора': ticket.createdBy && ticket.createdBy.position ? ticket.createdBy.position.title : 'Не вказано',
        'Місто автора': ticket.createdBy && ticket.createdBy.city ? ticket.createdBy.city.name : 'Не вказано',
        'Дата та час створення': formatDateTime(ticket.createdAt),
        
        // Статус та пріоритет
        'Статус': getStatusLabel(ticket.status),
        'Пріоритет': getPriorityLabel(ticket.priority),
        
        // Опис та категорія
        'Опис': ticket.description,
        'Підкатегорія': ticket.subcategory || 'Не вказано',
        'Тип': getTypeLabel(ticket.type),
        
        // Місцезнаходження
        'Місто': ticket.city ? ticket.city.name : 'Не вказано',
        'Регіон': ticket.city ? ticket.city.region : 'Не вказано',
        'Відділ': ticket.department || 'Не вказано',
        
        
        // Часові мітки
        'Дата та час першої відповіді': ticket.firstResponseAt ? formatDateTime(ticket.firstResponseAt) : 'Немає відповіді',
        'Дата та час вирішення': ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : 'Не вирішено',
        'Дата та час закриття': ticket.closedAt ? formatDateTime(ticket.closedAt) : 'Не закрито',
        'Термін виконання': ticket.dueDate ? formatDateTime(ticket.dueDate) : 'Не встановлено',
        
        // Базові метрики
        'Планові години': ticket.estimatedHours || 'Не вказано',
        'Фактичні години': ticket.actualHours || 'Не вказано',
        
        // Обчислені метрики
        'Час відповіді (год)': calculatedMetrics.responseTime,
        'Час вирішення (год)': calculatedMetrics.resolutionTime,
        'Днів відкритий': calculatedMetrics.daysOpen,
        'Прострочений': calculatedMetrics.isOverdue ? 'Так' : 'Ні',
        
        // Статистика активності
        'Кількість змін статусу': calculatedMetrics.statusChanges,
        'Кількість повторних відкриттів': calculatedMetrics.reopenCount,
        'Рівень ескалації': calculatedMetrics.escalationLevel,
        'Остання активність': calculatedMetrics.lastActivity ? formatDateTime(calculatedMetrics.lastActivity) : 'Немає',
        
        // Додаткова інформація
        'Теги': ticket.tags ? ticket.tags.map(tag => tag.name).join(', ') : 'Немає',
        'Джерело': ticket.metadata?.source || 'web',
        'Кількість коментарів': ticket.comments ? ticket.comments.length : 0,
        'Кількість вкладень': ticket.attachments ? ticket.attachments.length : 0,
        'Кількість спостерігачів': ticket.watchers ? ticket.watchers.length : 0
      };

      // Додавання коментарів якщо потрібно
      if (includeComments === 'true' && ticket.comments && ticket.comments.length > 0) {
        baseData['Коментарі'] = ticket.comments.map(comment => 
          `[${formatDateTime(comment.createdAt)}] ${comment.author?.firstName || 'Невідомо'}: ${comment.content}`
        ).join(' | ');
      }

      // Додавання вкладень якщо потрібно
      if (includeAttachments === 'true' && ticket.attachments && ticket.attachments.length > 0) {
        baseData['Вкладення'] = ticket.attachments.map(att => att.originalName).join(', ');
      }

      return baseData;
    });

    // Генерація файлу в залежності від формату
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Тікети');

      // Додавання заголовків
      const headers = Object.keys(exportData[0]);
      worksheet.addRow(headers);

      // Стилізація заголовків
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2C3E50' }
      };
      headerRow.font = { color: { argb: 'FFFFFFFF' }, bold: true };

      // Додавання даних
      exportData.forEach(row => {
        worksheet.addRow(Object.values(row));
      });

      // Автоматичне налаштування ширини колонок
      worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = Math.min(maxLength + 2, 50);
      });

      // Встановлення заголовків відповіді
      const filename = `tickets_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Відправка файлу
      await workbook.xlsx.write(res);
      res.end();

    } else {
      // CSV експорт
      const fields = Object.keys(exportData[0]);
      const json2csvParser = new Parser({ fields, delimiter: ';' });
      const csv = json2csvParser.parse(exportData);

      const filename = `tickets_export_${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Додавання BOM для правильного відображення українських символів
      res.write('\uFEFF');
      res.end(csv);
    }

  } catch (error) {
    logger.error('Error exporting tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при експорті тікетів',
      error: error.message
    });
  }
};

// Допоміжні функції для форматування
function getStatusLabel(status) {
  const statusLabels = {
    'open': 'Відкритий',
    'in_progress': 'В роботі',
    'resolved': 'Вирішений',
    'closed': 'Закритий',
    'cancelled': 'Скасований'
  };
  return statusLabels[status] || status;
}

function getPriorityLabel(priority) {
  const priorityLabels = {
    'low': 'Низький',
    'medium': 'Середній',
    'high': 'Високий',
    'urgent': 'Терміновий'
  };
  return priorityLabels[priority] || priority;
}

function getTypeLabel(type) {
  const typeLabels = {
    'incident': 'Інцидент',
    'request': 'Запит',
    'problem': 'Проблема',
    'change': 'Зміна'
  };
  return typeLabels[type] || type;
}

function formatDate(date) {
  if (!date) return 'Не вказано';
  return new Date(date).toLocaleDateString('uk-UA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function formatTime(date) {
  if (!date) return 'Не вказано';
  return new Date(date).toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatDateTime(date) {
  if (!date) return 'Не вказано';
  return new Date(date).toLocaleString('uk-UA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}
