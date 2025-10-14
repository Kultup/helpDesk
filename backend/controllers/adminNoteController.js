const AdminNote = require('../models/AdminNote');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Отримати всі нотатки користувача
const getAdminNotes = async (req, res) => {
  try {
    const {
      category,
      priority,
      search,
      limit = 50,
      skip = 0
    } = req.query;
    const userId = req.user.id;

    let notes;

    if (search) {
      // Пошук по тексту
      notes = await AdminNote.searchNotes(userId, search);
    } else {
      // Звичайний запит з фільтрами
      const options = {
        category,
        priority,
        limit: parseInt(limit),
        skip: parseInt(skip)
      };

      notes = await AdminNote.findByAuthor(userId, options);
    }

    res.json({
      success: true,
      data: notes,
      count: notes.length
    });

  } catch (error) {
    logger.error('Error fetching admin notes:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні нотаток'
    });
  }
};

// Отримати нотатку за ID
const getAdminNoteById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID нотатки'
      });
    }

    const note = await AdminNote.findOne({
      _id: id,
      author: userId,
      isDeleted: false
    })
      .populate('author', 'name email')
      .populate('editedBy', 'name email');

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку не знайдено'
      });
    }

    // Збільшуємо лічильник переглядів
    await note.incrementViewCount();

    res.json({
      success: true,
      data: note
    });

  } catch (error) {
    logger.error('Error fetching admin note:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні нотатки'
    });
  }
};

// Створити нову нотатку
const createAdminNote = async (req, res) => {
  try {
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
      content,
      priority,
      category,
      tags,
      color,
      reminderDate
    } = req.body;

    const note = new AdminNote({
      title,
      content,
      priority,
      category,
      tags: tags || [],
      color,
      author: req.user.id,
      reminderDate: reminderDate ? new Date(reminderDate) : null
    });

    await note.save();
    await note.populate('author', 'name email');

    logger.info(`Admin note created: ${note._id} by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Нотатку успішно створено',
      data: note
    });

  } catch (error) {
    logger.error('Error creating admin note:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при створенні нотатки'
    });
  }
};

// Оновити нотатку
const updateAdminNote = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID нотатки'
      });
    }

    const note = await AdminNote.findOne({
      _id: id,
      author: userId,
      isDeleted: false
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку не знайдено'
      });
    }

    const {
      title,
      content,
      priority,
      category,
      tags,
      color,
      reminderDate
    } = req.body;

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (priority !== undefined) updates.priority = priority;
    if (category !== undefined) updates.category = category;
    if (tags !== undefined) updates.tags = tags;
    if (color !== undefined) updates.color = color;
    if (reminderDate !== undefined) {
      updates.reminderDate = reminderDate ? new Date(reminderDate) : null;
      updates.isReminderSent = false;
    }

    await note.edit(updates, userId);
    await note.populate('author', 'name email');
    await note.populate('editedBy', 'name email');

    logger.info(`Admin note updated: ${note._id} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Нотатку успішно оновлено',
      data: note
    });

  } catch (error) {
    logger.error('Error updating admin note:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при оновленні нотатки'
    });
  }
};

// Видалити нотатку
const deleteAdminNote = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID нотатки'
      });
    }

    const note = await AdminNote.findOne({
      _id: id,
      author: userId,
      isDeleted: false
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку не знайдено'
      });
    }

    await note.softDelete(userId);

    logger.info(`Admin note deleted: ${note._id} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Нотатку успішно видалено'
    });

  } catch (error) {
    logger.error('Error deleting admin note:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні нотатки'
    });
  }
};

// Закріпити/відкріпити нотатку
const togglePin = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID нотатки'
      });
    }

    const note = await AdminNote.findOne({
      _id: id,
      author: userId,
      isDeleted: false
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку не знайдено'
      });
    }

    if (note.isPinned) {
      await note.unpin();
    } else {
      await note.pin();
    }

    res.json({
      success: true,
      message: note.isPinned ? 'Нотатку закріплено' : 'Нотатку відкріплено',
      data: note
    });

  } catch (error) {
    logger.error('Error toggling pin:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при зміні статусу закріплення'
    });
  }
};

// Отримати закріплені нотатки
const getPinnedNotes = async (req, res) => {
  try {
    const userId = req.user.id;

    const notes = await AdminNote.findPinned(userId);

    res.json({
      success: true,
      data: notes,
      count: notes.length
    });

  } catch (error) {
    logger.error('Error fetching pinned notes:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні закріплених нотаток'
    });
  }
};

// Додати тег до нотатки
const addTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { tag } = req.body;
    const userId = req.user.id;

    if (!tag || !tag.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Тег не може бути порожнім'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID нотатки'
      });
    }

    const note = await AdminNote.findOne({
      _id: id,
      author: userId,
      isDeleted: false
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку не знайдено'
      });
    }

    await note.addTag(tag.trim());

    res.json({
      success: true,
      message: 'Тег додано',
      data: note
    });

  } catch (error) {
    logger.error('Error adding tag:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при додаванні тегу'
    });
  }
};

// Видалити тег з нотатки
const removeTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { tag } = req.body;
    const userId = req.user.id;

    if (!tag) {
      return res.status(400).json({
        success: false,
        message: 'Тег не вказано'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID нотатки'
      });
    }

    const note = await AdminNote.findOne({
      _id: id,
      author: userId,
      isDeleted: false
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Нотатку не знайдено'
      });
    }

    await note.removeTag(tag);

    res.json({
      success: true,
      message: 'Тег видалено',
      data: note
    });

  } catch (error) {
    logger.error('Error removing tag:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні тегу'
    });
  }
};

// Отримати статистику нотаток
const getNotesStatistics = async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await AdminNote.getStatistics(userId);

    res.json({
      success: true,
      data: stats[0] || {
        total: 0,
        pinned: 0,
        withReminders: 0,
        byPriority: [],
        byCategory: []
      }
    });

  } catch (error) {
    logger.error('Error fetching notes statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні статистики'
    });
  }
};

module.exports = {
  getAdminNotes,
  getAdminNoteById,
  createAdminNote,
  updateAdminNote,
  deleteAdminNote,
  togglePin,
  getPinnedNotes,
  addTag,
  removeTag,
  getNotesStatistics
};