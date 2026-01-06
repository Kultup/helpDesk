const Comment = require('../models/Comment');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Отримати всі коментарі (тільки для адміністраторів)
exports.getAllComments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      populate: [
        { path: 'author', select: 'firstName lastName email' },
        { path: 'ticket', select: 'title status' }
      ]
    };

    const filters = { isDeleted: false };
    const comments = await Comment.paginate(filters, options);

    res.json({
      success: true,
      data: comments.docs,
      pagination: {
        currentPage: comments.page,
        totalPages: comments.totalPages,
        totalItems: comments.totalDocs,
        hasNext: comments.hasNextPage,
        hasPrev: comments.hasPrevPage
      }
    });
  } catch (error) {
    logger.error('Error fetching all comments:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні коментарів',
      error: error.message
    });
  }
};

// Отримати коментарі для модерації
exports.getModerationQueue = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'author', select: 'firstName lastName email' },
        { path: 'ticket', select: 'title status' }
      ]
    };

    const filters = { 
      isDeleted: false,
      needsModeration: true
    };

    const comments = await Comment.paginate(filters, options);

    res.json({
      success: true,
      data: comments.docs,
      pagination: {
        currentPage: comments.page,
        totalPages: comments.totalPages,
        totalItems: comments.totalDocs
      }
    });
  } catch (error) {
    logger.error('Error fetching moderation queue:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні черги модерації',
      error: error.message
    });
  }
};

// Отримати коментар за ID
exports.getCommentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const comment = await Comment.findById(id)
      .populate('author', 'firstName lastName email')
      .populate('ticket', 'title status');

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Коментар не знайдено'
      });
    }

    res.json({
      success: true,
      data: comment
    });
  } catch (error) {
    logger.error('Error fetching comment:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні коментаря',
      error: error.message
    });
  }
};

// Модерувати коментар
exports.moderateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;
    
    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Коментар не знайдено'
      });
    }

    if (action === 'approve') {
      comment.needsModeration = false;
      comment.moderatedBy = req.user.id;
      comment.moderatedAt = new Date();
    } else if (action === 'reject') {
      comment.isDeleted = true;
      comment.deletedBy = req.user.id;
      comment.deletedAt = new Date();
      comment.deletionReason = reason;
    }

    await comment.save();

    res.json({
      success: true,
      message: `Коментар ${action === 'approve' ? 'схвалено' : 'відхилено'}`,
      data: comment
    });
  } catch (error) {
    logger.error('Error moderating comment:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при модерації коментаря',
      error: error.message
    });
  }
};

// Масове видалення коментарів
exports.bulkDeleteComments = async (req, res) => {
  try {
    const { commentIds, reason } = req.body;
    
    const result = await Comment.updateMany(
      { _id: { $in: commentIds } },
      {
        isDeleted: true,
        deletedBy: req.user.id,
        deletedAt: new Date(),
        deletionReason: reason
      }
    );

    res.json({
      success: true,
      message: `Видалено ${result.modifiedCount} коментарів`,
      data: { deletedCount: result.modifiedCount }
    });
  } catch (error) {
    logger.error('Error bulk deleting comments:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при масовому видаленні коментарів',
      error: error.message
    });
  }
};

// Масова модерація коментарів
exports.bulkModerateComments = async (req, res) => {
  try {
    const { commentIds, action, reason } = req.body;
    
    let updateData = {};
    if (action === 'approve') {
      updateData = {
        needsModeration: false,
        moderatedBy: req.user.id,
        moderatedAt: new Date()
      };
    } else if (action === 'reject') {
      updateData = {
        isDeleted: true,
        deletedBy: req.user.id,
        deletedAt: new Date(),
        deletionReason: reason
      };
    }

    const result = await Comment.updateMany(
      { _id: { $in: commentIds } },
      updateData
    );

    res.json({
      success: true,
      message: `${action === 'approve' ? 'Схвалено' : 'Відхилено'} ${result.modifiedCount} коментарів`,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    logger.error('Error bulk moderating comments:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при масовій модерації коментарів',
      error: error.message
    });
  }
};

// Масове відновлення коментарів
exports.bulkRestoreComments = async (req, res) => {
  try {
    const { commentIds } = req.body;
    
    const result = await Comment.updateMany(
      { _id: { $in: commentIds } },
      {
        isDeleted: false,
        $unset: {
          deletedBy: 1,
          deletedAt: 1,
          deletionReason: 1
        }
      }
    );

    res.json({
      success: true,
      message: `Відновлено ${result.modifiedCount} коментарів`,
      data: { restoredCount: result.modifiedCount }
    });
  } catch (error) {
    logger.error('Error bulk restoring comments:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при масовому відновленні коментарів',
      error: error.message
    });
  }
};

// Експорт коментарів
exports.exportComments = async (req, res) => {
  try {
    const { format = 'json', startDate, endDate, ticketId } = req.query;
    
    const filters = { isDeleted: false };
    
    if (startDate && endDate) {
      filters.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (ticketId) {
      filters.ticket = ticketId;
    }

    const comments = await Comment.find(filters)
      .populate('author', 'firstName lastName email')
      .populate('ticket', 'title status')
      .sort({ createdAt: -1 });

    if (format === 'csv') {
      // Тут би мала бути логіка для CSV експорту
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=comments.csv');
    }

    res.json({
      success: true,
      data: comments,
      exportedAt: new Date(),
      totalCount: comments.length
    });
  } catch (error) {
    logger.error('Error exporting comments:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при експорті коментарів',
      error: error.message
    });
  }
};

// Пошук коментарів
exports.searchComments = async (req, res) => {
  try {
    const { 
      query: searchQuery, 
      page = 1, 
      limit = 10,
      ticketId,
      authorId,
      startDate,
      endDate
    } = req.query;

    const filters = { isDeleted: false };
    
    if (searchQuery) {
      filters.$text = { $search: searchQuery };
    }
    
    if (ticketId) filters.ticket = ticketId;
    if (authorId) filters.author = authorId;
    
    if (startDate && endDate) {
      filters.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: searchQuery ? { score: { $meta: 'textScore' } } : { createdAt: -1 },
      populate: [
        { path: 'author', select: 'firstName lastName email' },
        { path: 'ticket', select: 'title status' }
      ]
    };

    const comments = await Comment.paginate(filters, options);

    res.json({
      success: true,
      data: comments.docs,
      pagination: {
        currentPage: comments.page,
        totalPages: comments.totalPages,
        totalItems: comments.totalDocs
      }
    });
  } catch (error) {
    logger.error('Error searching comments:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при пошуку коментарів',
      error: error.message
    });
  }
};

// Отримати тренди коментарів
exports.getCommentTrends = async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    let startDate;
    switch (period) {
      case '24h':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    const trends = await Comment.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: trends,
      period,
      generatedAt: new Date()
    });
  } catch (error) {
    logger.error('Error fetching comment trends:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні трендів коментарів',
      error: error.message
    });
  }
};

// Отримати коментарі тикету
exports.getTicketComments = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const {
      page = 1,
      limit = 10,
      type,
      sortBy = 'createdAt',
      sortOrder = 'asc'
    } = req.query;

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID тикету'
      });
    }

    // Перевірка існування тикету
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тикет не знайдено'
      });
    }

    // Перевірка прав доступу до тикету
    const canViewTicket = ticket.createdBy.equals(req.user._id) || 
                         ticket.assignedTo?.equals(req.user._id) || 
                         req.user.role === 'admin';

    if (!canViewTicket) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для перегляду коментарів цього тикету'
      });
    }

    // Побудова фільтрів
    const filters = { 
      ticket: ticketId,
      isDeleted: false
    };
    
    if (type) filters.type = type;

    // Приховати внутрішні коментарі для звичайних користувачів
    if (req.user.role !== 'admin') {
      filters.isInternal = false;
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      populate: [
        { 
          path: 'author', 
          select: 'firstName lastName email avatar',
          populate: {
            path: 'position',
            select: 'title department'
          }
        },
        { path: 'attachments', select: 'filename originalName size mimeType' },
        { path: 'mentions', select: 'firstName lastName email' },
        { path: 'editedBy', select: 'firstName lastName' }
      ]
    };

    const comments = await Comment.paginate(filters, options);

    res.json({
      success: true,
      data: comments.docs,
      pagination: {
        currentPage: comments.page,
        totalPages: comments.totalPages,
        totalItems: comments.totalDocs,
        hasNext: comments.hasNextPage,
        hasPrev: comments.hasPrevPage
      }
    });
  } catch (error) {
    logger.error('Error fetching ticket comments:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні коментарів',
      error: error.message
    });
  }
};

// Створити коментар
exports.createComment = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID тикету'
      });
    }

    // Перевірка існування тикету
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тикет не знайдено'
      });
    }

    // Перевірка прав доступу до тикету
    const canCommentTicket = ticket.createdBy.equals(req.user._id) || 
                            ticket.assignedTo?.equals(req.user._id) || 
                            req.user.role === 'admin';

    if (!canCommentTicket) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для коментування цього тикету'
      });
    }

    const {
      content,
      type = 'comment',
      isInternal = false,
      attachments = [],
      mentions = []
    } = req.body;

    // Тільки адміни можуть створювати внутрішні коментарі
    const finalIsInternal = req.user.role === 'admin' ? isInternal : false;

    const comment = new Comment({
      content,
      ticket: ticketId,
      author: req.user._id,
      type,
      isInternal: finalIsInternal,
      attachments,
      mentions
    });

    await comment.save();

    // Оновити час останньої активності тикету
    ticket.updatedAt = new Date();
    await ticket.save();

    // Заповнити дані для відповіді
    await comment.populate([
      { 
        path: 'author', 
        select: 'firstName lastName email avatar',
        populate: {
          path: 'position',
          select: 'title department'
        }
      },
      { path: 'attachments', select: 'filename originalName size mimeType' },
      { path: 'mentions', select: 'firstName lastName email' }
    ]);
    
    // Заповнити тікет для отримання інформації про автора та призначеного
    logger.info('🔔 Перед populate тікету для сповіщень', {
      ticketId: ticket._id.toString(),
      commentId: comment._id.toString(),
      authorId: req.user._id.toString()
    });
    
    await ticket.populate([
      { path: 'createdBy', select: '_id' },
      { path: 'assignedTo', select: '_id' }
    ]);
    
    logger.info('🔔 Після populate тікету для сповіщень', {
      ticketId: ticket._id.toString(),
      hasCreatedBy: !!ticket.createdBy,
      hasAssignedTo: !!ticket.assignedTo
    });

    // Відправка FCM сповіщення автору тікету та призначеному користувачу про новий коментар
    // Відправка сповіщень через FCM та Telegram
    logger.info('🔔 Початок відправки сповіщень про коментар (до try блоку)', {
      ticketId: ticket._id.toString(),
      commentId: comment._id.toString(),
      authorId: req.user._id.toString(),
      authorRole: req.user.role,
      ticketCreatedBy: ticket.createdBy ? (ticket.createdBy._id ? ticket.createdBy._id.toString() : ticket.createdBy.toString()) : 'null',
      ticketAssignedTo: ticket.assignedTo ? (ticket.assignedTo._id ? ticket.assignedTo._id.toString() : ticket.assignedTo.toString()) : 'null'
    });
    
    try {
      logger.info('🔔 Завантаження сервісів для сповіщень');
      const fcmService = require('../services/fcmService');
      const telegramService = require('../services/telegramServiceInstance');
      const User = require('../models/User');

      logger.info('✅ Сервіси завантажено, початок відправки сповіщень про коментар', {
        ticketId: ticket._id.toString(),
        commentId: comment._id.toString(),
        authorId: req.user._id.toString(),
        telegramServiceInitialized: telegramService.isInitialized,
        telegramBotExists: !!telegramService.bot
      });
      
      const recipients = [];
      // Перевіряємо, чи createdBy вже populate'ний або це ObjectId
      if (ticket.createdBy) {
        const createdById = ticket.createdBy._id ? ticket.createdBy._id.toString() : ticket.createdBy.toString();
        recipients.push(createdById);
      }
      if (ticket.assignedTo) {
        const assignedToId = ticket.assignedTo._id ? ticket.assignedTo._id.toString() : ticket.assignedTo.toString();
        recipients.push(assignedToId);
      }
      
      // Видаляємо автора коментаря зі списку отримувачів (він сам додав коментар)
      const commentAuthorId = req.user._id.toString();
      const uniqueRecipients = [...new Set(recipients)].filter(id => id !== commentAuthorId);
      
      logger.info('Відправка коментарів в Telegram:', {
        recipients: recipients,
        uniqueRecipients: uniqueRecipients,
        uniqueRecipientsCount: uniqueRecipients.length,
        commentAuthorId: commentAuthorId,
        ticketId: ticket._id.toString(),
        isInternal: finalIsInternal
      });
      if (uniqueRecipients.length === 0) {
        logger.warn('⚠️ Список отримувачів порожній, Telegram не буде відправлено', {
          ticketId: ticket._id.toString(),
          commentId: comment._id.toString(),
          authorId: commentAuthorId
        });
      }
      
      const authorName = comment.author?.firstName && comment.author?.lastName
        ? `${comment.author.firstName} ${comment.author.lastName}`
        : 'Користувач';
      
      const isAdminComment = req.user.role === 'admin' || req.user.role === 'manager';
      const roleLabel = isAdminComment ? '👨‍💼 Адміністратор' : '👤 Користувач';
      
      // Отримуємо повну інформацію про тікет для Telegram
      await ticket.populate([
        { path: 'createdBy', select: 'firstName lastName email telegramId telegramChatId' },
        { path: 'assignedTo', select: 'firstName lastName email telegramId telegramChatId' }
      ]);
      
      logger.info(`Початок циклу відправки для ${uniqueRecipients.length} отримувачів`);
      
      for (const userId of uniqueRecipients) {
        logger.info(`Обробка отримувача ${userId} для коментаря`);
        // FCM сповіщення
        try {
          await fcmService.sendToUser(userId, {
            title: '💬 Новий коментар до тікету',
            body: `${authorName} додав коментар до тікету "${ticket.title}"`,
            type: 'ticket_comment',
            data: {
              ticketId: ticket._id.toString(),
              ticketTitle: ticket.title,
              commentId: comment._id.toString(),
              commentAuthor: authorName,
              commentPreview: content.substring(0, 100)
            }
          });
        } catch (fcmError) {
          logger.error(`❌ Помилка відправки FCM сповіщення для користувача ${userId}:`, fcmError);
        }
        
        // Telegram сповіщення
        try {
          const recipientUser = await User.findById(userId).select('telegramId telegramChatId email firstName lastName');
          
          logger.info(`Перевірка отримувача для Telegram:`, {
            userId: userId,
            recipientUser: recipientUser ? {
              email: recipientUser.email,
              telegramId: recipientUser.telegramId,
              telegramChatId: recipientUser.telegramChatId,
              hasTelegramId: !!recipientUser.telegramId
            } : null
          });
          
          // Перевіряємо обидва варіанти - telegramId та telegramChatId
          const telegramId = recipientUser?.telegramId || recipientUser?.telegramChatId;
          
          if (recipientUser && telegramId && !finalIsInternal) {
            // Перевіряємо, чи бот ініціалізований
            if (!telegramService.isInitialized || !telegramService.bot) {
              logger.warn(`⚠️ Telegram бот не ініціалізований для відправки коментаря користувачу ${recipientUser.email}`);
            } else {
              // Формуємо повідомлення для Telegram
              const ticketNumber = ticket.ticketNumber || ticket._id.toString().substring(0, 8);
              
              // Встановлюємо активний тікет для користувача, щоб він міг відповідати
              telegramService.setActiveTicketForUser(telegramId, ticket._id.toString());
              
              const message = 
                `💬 *Новий коментар до тікету*\n\n` +
                `📋 *Тікет:* ${ticket.title}\n` +
                `🆔 \`${ticketNumber}\`\n\n` +
                `${roleLabel}: *${authorName}*\n\n` +
                `💭 *Коментар:*\n${content}\n\n` +
                `---\n` +
                `💡 Ви можете відповісти на цей коментар, надіславши повідомлення в цьому чаті.\n` +
                `Або надішліть /menu для виходу.`;
              
              try {
                await telegramService.sendMessage(
                  telegramId,
                  message,
                  { parse_mode: 'Markdown' }
                );
                
                logger.info(`✅ Telegram сповіщення про коментар відправлено користувачу ${recipientUser.email} (telegramId: ${telegramId})`);
              } catch (sendError) {
                logger.error(`❌ Помилка виклику sendMessage для користувача ${recipientUser.email}:`, {
                  error: sendError.message,
                  stack: sendError.stack,
                  telegramId: telegramId
                });
              }
            }
          } else if (recipientUser && !telegramId) {
            logger.warn(`⚠️ Користувач ${recipientUser.email} (${userId}) не має telegramId або telegramChatId`);
          } else if (!recipientUser) {
            logger.warn(`⚠️ Користувач з ID ${userId} не знайдено`);
          }
        } catch (telegramError) {
          logger.error(`❌ Помилка відправки Telegram сповіщення для користувача ${userId}:`, telegramError);
          logger.error('Деталі помилки:', telegramError.stack || telegramError.message);
        }
      }
      
      logger.info(`✅ Завершено обробку відправки коментарів для ${uniqueRecipients.length} отримувачів`);
      logger.info('✅ Сповіщення про новий коментар відправлено');
    } catch (error) {
      logger.error('❌ Помилка відправки сповіщень про коментар:', error);
      logger.error('❌ Деталі помилки відправки сповіщень:', {
        message: error.message,
        stack: error.stack,
        ticketId: ticket._id.toString(),
        commentId: comment._id.toString()
      });
    }

    res.status(201).json({
      success: true,
      message: 'Коментар успішно створено',
      data: comment
    });
  } catch (error) {
    logger.error('Error creating comment:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при створенні коментаря',
      error: error.message
    });
  }
};

// Оновити коментар
exports.updateComment = async (req, res) => {
  try {
    const { id } = req.params;
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
        message: 'Невірний ID коментаря'
      });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Коментар не знайдено'
      });
    }

    if (comment.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Не можна редагувати видалений коментар'
      });
    }

    // Перевірка прав доступу
    const canEdit = comment.author.equals(req.user._id) || req.user.role === 'admin';
    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для редагування цього коментаря'
      });
    }

    const { content, isInternal, attachments, mentions } = req.body;

    // Використати метод edit з моделі
    await comment.edit(content, req.user._id, {
      isInternal: req.user.role === 'admin' ? isInternal : comment.isInternal,
      attachments,
      mentions
    });

    // Заповнити дані для відповіді
    await comment.populate([
      { 
        path: 'author', 
        select: 'firstName lastName email avatar',
        populate: {
          path: 'position',
          select: 'title department'
        }
      },
      { path: 'attachments', select: 'filename originalName size mimeType' },
      { path: 'mentions', select: 'firstName lastName email' },
      { path: 'editedBy', select: 'firstName lastName' }
    ]);

    res.json({
      success: true,
      message: 'Коментар успішно оновлено',
      data: comment
    });
  } catch (error) {
    logger.error('Error updating comment:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при оновленні коментаря',
      error: error.message
    });
  }
};

// Видалити коментар (м'яке видалення)
exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID коментаря'
      });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Коментар не знайдено'
      });
    }

    if (comment.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Коментар вже видалено'
      });
    }

    // Перевірка прав доступу
    const canDelete = comment.author.equals(req.user._id) || req.user.role === 'admin';
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для видалення цього коментаря'
      });
    }

    // М'яке видалення
    await comment.softDelete(req.user._id);

    res.json({
      success: true,
      message: 'Коментар успішно видалено'
    });
  } catch (error) {
    logger.error('Error deleting comment:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні коментаря',
      error: error.message
    });
  }
};

// Відновити видалений коментар
exports.restoreComment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID коментаря'
      });
    }

    // Тільки адміни можуть відновлювати коментарі
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для відновлення коментарів'
      });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Коментар не знайдено'
      });
    }

    if (!comment.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Коментар не видалено'
      });
    }

    // Відновлення
    await comment.restore();

    // Заповнити дані для відповіді
    await comment.populate([
      { 
        path: 'author', 
        select: 'firstName lastName email avatar',
        populate: {
          path: 'position',
          select: 'title department'
        }
      },
      { path: 'attachments', select: 'filename originalName size mimeType' },
      { path: 'mentions', select: 'firstName lastName email' }
    ]);

    res.json({
      success: true,
      message: 'Коментар успішно відновлено',
      data: comment
    });
  } catch (error) {
    logger.error('Error restoring comment:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при відновленні коментаря',
      error: error.message
    });
  }
};

// Додати реакцію до коментаря
exports.addReaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID коментаря'
      });
    }

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: 'Emoji обов\'язковий'
      });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Коментар не знайдено'
      });
    }

    if (comment.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Не можна додавати реакції до видаленого коментаря'
      });
    }

    await comment.addReaction(req.user._id, emoji);

    res.json({
      success: true,
      message: 'Реакцію додано',
      data: {
        reactions: comment.reactions,
        reactionSummary: comment.getReactionSummary()
      }
    });
  } catch (error) {
    logger.error('Error adding reaction:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при додаванні реакції',
      error: error.message
    });
  }
};

// Видалити реакцію з коментаря
exports.removeReaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID коментаря'
      });
    }

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: 'Emoji обов\'язковий'
      });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Коментар не знайдено'
      });
    }

    await comment.removeReaction(req.user._id, emoji);

    res.json({
      success: true,
      message: 'Реакцію видалено',
      data: {
        reactions: comment.reactions,
        reactionSummary: comment.getReactionSummary()
      }
    });
  } catch (error) {
    logger.error('Error removing reaction:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні реакції',
      error: error.message
    });
  }
};

// Отримати коментарі користувача
exports.getUserComments = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID користувача'
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin' && req.user._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для перегляду коментарів цього користувача'
      });
    }

    const filters = { 
      author: userId,
      isDeleted: false
    };

    // Приховати внутрішні коментарі для звичайних користувачів
    if (req.user.role !== 'admin') {
      filters.isInternal = false;
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      populate: [
        { 
          path: 'ticket', 
          select: 'title status priority',
          populate: {
            path: 'city',
            select: 'name'
          }
        },
        { path: 'attachments', select: 'filename originalName size mimeType' }
      ]
    };

    const comments = await Comment.paginate(filters, options);

    res.json({
      success: true,
      data: comments.docs,
      pagination: {
        currentPage: comments.page,
        totalPages: comments.totalPages,
        totalItems: comments.totalDocs,
        hasNext: comments.hasNextPage,
        hasPrev: comments.hasPrevPage
      }
    });
  } catch (error) {
    logger.error('Error fetching user comments:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні коментарів користувача',
      error: error.message
    });
  }
};

// Отримати статистику коментарів
exports.getCommentStatistics = async (req, res) => {
  try {
    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для перегляду статистики коментарів'
      });
    }

    const { startDate, endDate, userId, ticketId } = req.query;

    // Побудова фільтрів
    const filters = { isDeleted: false };
    
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }
    
    if (userId) filters.author = userId;
    if (ticketId) filters.ticket = ticketId;

    // Загальна статистика
    const generalStats = await Comment.aggregate([
      { $match: filters },
      {
        $group: {
          _id: null,
          totalComments: { $sum: 1 },
          internalComments: { $sum: { $cond: ['$isInternal', 1, 0] } },
          editedComments: { $sum: { $cond: ['$isEdited', 1, 0] } },
          commentsWithAttachments: { 
            $sum: { 
              $cond: [{ $gt: [{ $size: '$attachments' }, 0] }, 1, 0] 
            } 
          },
          commentsWithReactions: { 
            $sum: { 
              $cond: [{ $gt: [{ $size: '$reactions' }, 0] }, 1, 0] 
            } 
          }
        }
      }
    ]);

    // Статистика по типах коментарів
    const typeStats = await Comment.aggregate([
      { $match: filters },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Топ користувачів за кількістю коментарів
    const userStats = await Comment.aggregate([
      { $match: filters },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'authorInfo'
        }
      },
      { $unwind: '$authorInfo' },
      {
        $group: {
          _id: '$author',
          authorName: { $first: { $concat: ['$authorInfo.firstName', ' ', '$authorInfo.lastName'] } },
          commentCount: { $sum: 1 },
          internalComments: { $sum: { $cond: ['$isInternal', 1, 0] } }
        }
      },
      { $sort: { commentCount: -1 } },
      { $limit: 10 }
    ]);

    const stats = generalStats[0] || {
      totalComments: 0,
      internalComments: 0,
      editedComments: 0,
      commentsWithAttachments: 0,
      commentsWithReactions: 0
    };

    res.json({
      success: true,
      data: {
        general: stats,
        byType: typeStats,
        topUsers: userStats,
        filters: {
          startDate,
          endDate,
          userId,
          ticketId
        },
        generatedAt: new Date()
      }
    });
  } catch (error) {
    logger.error('Error fetching comment statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні статистики коментарів',
      error: error.message
    });
  }
};
