const Note = require('../models/Note');
const Ticket = require('../models/Ticket');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Отримати всі нотатки для тикету
const getNotesByTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { includeDeleted = false, type, author } = req.query;

    // Перевіряємо, чи існує тикет
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тикет не знайдено',
      });
    }

    // Будуємо фільтр
    const filter = { ticket: ticketId };

    if (!includeDeleted) {
      filter.isDeleted = false;
    }

    if (type) {
      filter.type = type;
    }

    if (author) {
      filter.author = author;
    }

    const notes = await Note.find(filter)
      .populate('author', 'name email avatar')
      .populate('editedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: notes,
      count: notes.length,
    });
  } catch (error) {
    logger.error('Error fetching notes:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні нотаток',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Отримати конкретну нотатку
const getNoteById = async (req, res) => {
  try {
    const { noteId } = req.params;

    const note = await Note.findById(noteId)
      .populate('author', 'name email avatar')
      .populate('editedBy', 'name email')
      .populate('ticket', 'title ticketNumber');

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку не знайдено',
      });
    }

    if (note.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку видалено',
      });
    }

    res.json({
      success: true,
      data: note,
    });
  } catch (error) {
    logger.error('Error fetching note:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні нотатки',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Створити нову нотатку
const createNote = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array(),
      });
    }

    const { ticketId } = req.params;
    const { content, type, isPrivate, priority, tags, reminderDate } = req.body;

    // Перевіряємо, чи існує тикет
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тикет не знайдено',
      });
    }

    const noteData = {
      content,
      ticket: ticketId,
      author: req.user.id,
      type: type || 'note',
      isPrivate: isPrivate !== undefined ? isPrivate : true,
      priority: priority || 'medium',
      tags: tags || [],
      reminderDate: reminderDate || null,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        source: 'web',
      },
    };

    const note = new Note(noteData);
    await note.save();

    // Популюємо дані для відповіді
    await note.populate('author', 'name email avatar');

    res.status(201).json({
      success: true,
      message: 'Нотатку створено успішно',
      data: note,
    });
  } catch (error) {
    logger.error('Error creating note:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при створенні нотатки',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Оновити нотатку
const updateNote = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array(),
      });
    }

    const { noteId } = req.params;
    const { content, type, isPrivate, priority, tags, reminderDate } = req.body;

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку не знайдено',
      });
    }

    if (note.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку видалено',
      });
    }

    // Перевіряємо права доступу
    if (note.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для редагування цієї нотатки',
      });
    }

    // Оновлюємо поля
    if (content !== undefined) {
      note.content = content;
    }
    if (type !== undefined) {
      note.type = type;
    }
    if (isPrivate !== undefined) {
      note.isPrivate = isPrivate;
    }
    if (priority !== undefined) {
      note.priority = priority;
    }
    if (tags !== undefined) {
      note.tags = tags;
    }
    if (reminderDate !== undefined) {
      note.reminderDate = reminderDate;
    }

    note.editedBy = req.user.id;
    note.editedAt = new Date();
    note.isEdited = true;

    await note.save();
    await note.populate('author', 'name email avatar');
    await note.populate('editedBy', 'name email');

    res.json({
      success: true,
      message: 'Нотатку оновлено успішно',
      data: note,
    });
  } catch (error) {
    logger.error('Error updating note:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при оновленні нотатки',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Видалити нотатку (soft delete)
const deleteNote = async (req, res) => {
  try {
    const { noteId } = req.params;

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку не знайдено',
      });
    }

    if (note.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку вже видалено',
      });
    }

    // Перевіряємо права доступу
    if (note.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для видалення цієї нотатки',
      });
    }

    await note.softDelete(req.user.id);

    res.json({
      success: true,
      message: 'Нотатку видалено успішно',
    });
  } catch (error) {
    logger.error('Error deleting note:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні нотатки',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Відновити видалену нотатку
const restoreNote = async (req, res) => {
  try {
    const { noteId } = req.params;

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку не знайдено',
      });
    }

    if (!note.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Нотатка не видалена',
      });
    }

    // Перевіряємо права доступу (тільки адміни можуть відновлювати)
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для відновлення нотатки',
      });
    }

    await note.restore();
    await note.populate('author', 'name email avatar');

    res.json({
      success: true,
      message: 'Нотатку відновлено успішно',
      data: note,
    });
  } catch (error) {
    logger.error('Error restoring note:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при відновленні нотатки',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Додати тег до нотатки
const addTag = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { tag } = req.body;

    if (!tag || typeof tag !== 'string') {
      return res.status(400).json({
        success: false,
        message: "Тег є обов'язковим і має бути рядком",
      });
    }

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку не знайдено',
      });
    }

    // Перевіряємо права доступу
    if (note.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для редагування цієї нотатки',
      });
    }

    await note.addTag(tag.trim());
    await note.populate('author', 'name email avatar');

    res.json({
      success: true,
      message: 'Тег додано успішно',
      data: note,
    });
  } catch (error) {
    logger.error('Error adding tag:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при додаванні тегу',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Видалити тег з нотатки
const removeTag = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { tag } = req.body;

    if (!tag || typeof tag !== 'string') {
      return res.status(400).json({
        success: false,
        message: "Тег є обов'язковим і має бути рядком",
      });
    }

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку не знайдено',
      });
    }

    // Перевіряємо права доступу
    if (note.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для редагування цієї нотатки',
      });
    }

    await note.removeTag(tag.trim());
    await note.populate('author', 'name email avatar');

    res.json({
      success: true,
      message: 'Тег видалено успішно',
      data: note,
    });
  } catch (error) {
    logger.error('Error removing tag:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні тегу',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Встановити нагадування
const setReminder = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { reminderDate } = req.body;

    if (!reminderDate) {
      return res.status(400).json({
        success: false,
        message: "Дата нагадування є обов'язковою",
      });
    }

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку не знайдено',
      });
    }

    // Перевіряємо права доступу
    if (note.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для редагування цієї нотатки',
      });
    }

    await note.setReminder(new Date(reminderDate));
    await note.populate('author', 'name email avatar');

    res.json({
      success: true,
      message: 'Нагадування встановлено успішно',
      data: note,
    });
  } catch (error) {
    logger.error('Error setting reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при встановленні нагадування',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Отримати статистику нотаток
const getNotesStatistics = async (req, res) => {
  try {
    const { ticketId } = req.params;

    // Перевіряємо, чи існує тикет
    if (ticketId) {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Тикет не знайдено',
        });
      }
    }

    const statistics = await Note.getStatistics(ticketId);

    res.json({
      success: true,
      data: statistics[0] || {
        total: 0,
        byType: [],
        byAuthor: [],
        recent: 0,
      },
    });
  } catch (error) {
    logger.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні статистики',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

module.exports = {
  getNotesByTicket,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  restoreNote,
  addTag,
  removeTag,
  setReminder,
  getNotesStatistics,
};
