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
