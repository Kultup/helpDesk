const Tag = require('../models/Tag');
const Ticket = require('../models/Ticket');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Отримати всі теги
exports.getTags = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      sortBy = 'name',
      sortOrder = 'asc',
      isActive = true,
    } = req.query;

    // Побудова фільтрів
    const filters = {};

    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }

    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Сортування
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      populate: {
        path: 'createdBy',
        select: 'email position',
      },
    };

    const tags = await Tag.find(filters)
      .populate(options.populate)
      .sort(options.sort)
      .limit(options.limit * options.page)
      .skip((options.page - 1) * options.limit);

    const total = await Tag.countDocuments(filters);

    res.json({
      tags,
      totalPages: Math.ceil(total / options.limit),
      currentPage: options.page,
      total,
    });
  } catch (error) {
    logger.error('Помилка отримання тегів:', error);
    res.status(500).json({
      message: 'Помилка сервера при отриманні тегів',
      error: error.message,
    });
  }
};

// Отримати тег за ID
exports.getTagById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Невірний ID тегу' });
    }

    const tag = await Tag.findById(id).populate('createdBy', 'email position');

    if (!tag) {
      return res.status(404).json({ message: 'Тег не знайдено' });
    }

    res.json(tag);
  } catch (error) {
    logger.error('Помилка отримання тегу:', error);
    res.status(500).json({
      message: 'Помилка сервера при отриманні тегу',
      error: error.message,
    });
  }
};

// Створити новий тег
exports.createTag = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Помилки валідації',
        errors: errors.array(),
      });
    }

    const { name, color, description } = req.body;

    // Перевірка на унікальність назви
    const existingTag = await Tag.findByName(name);
    if (existingTag) {
      return res.status(400).json({
        message: 'Тег з такою назвою вже існує',
      });
    }

    const tag = new Tag({
      name: name.toLowerCase(),
      color,
      description,
      createdBy: req.user.id,
    });

    await tag.save();

    const populatedTag = await Tag.findById(tag._id).populate('createdBy', 'email position');

    res.status(201).json(populatedTag);
  } catch (error) {
    logger.error('Помилка створення тегу:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        message: 'Тег з такою назвою вже існує',
      });
    }

    res.status(500).json({
      message: 'Помилка сервера при створенні тегу',
      error: error.message,
    });
  }
};

// Оновити тег
exports.updateTag = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Помилки валідації',
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const { name, color, description, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Невірний ID тегу' });
    }

    const tag = await Tag.findById(id);
    if (!tag) {
      return res.status(404).json({ message: 'Тег не знайдено' });
    }

    // Перевірка на унікальність назви (якщо змінюється)
    if (name && name.toLowerCase() !== tag.name) {
      const existingTag = await Tag.findByName(name);
      if (existingTag) {
        return res.status(400).json({
          message: 'Тег з такою назвою вже існує',
        });
      }
    }

    // Оновлення полів
    if (name) {
      tag.name = name.toLowerCase();
    }
    if (color) {
      tag.color = color;
    }
    if (description !== undefined) {
      tag.description = description;
    }
    if (isActive !== undefined) {
      tag.isActive = isActive;
    }

    await tag.save();

    const populatedTag = await Tag.findById(tag._id).populate('createdBy', 'email position');

    res.json(populatedTag);
  } catch (error) {
    logger.error('Помилка оновлення тегу:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        message: 'Тег з такою назвою вже існує',
      });
    }

    res.status(500).json({
      message: 'Помилка сервера при оновленні тегу',
      error: error.message,
    });
  }
};

// Видалити тег
exports.deleteTag = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Невірний ID тегу' });
    }

    const tag = await Tag.findById(id);
    if (!tag) {
      return res.status(404).json({ message: 'Тег не знайдено' });
    }

    // Видалити тег з усіх тікетів
    await Ticket.updateMany({ tags: id }, { $pull: { tags: id } });

    await Tag.findByIdAndDelete(id);

    res.json({ message: 'Тег успішно видалено' });
  } catch (error) {
    logger.error('Помилка видалення тегу:', error);
    res.status(500).json({
      message: 'Помилка сервера при видаленні тегу',
      error: error.message,
    });
  }
};

// Додати тег до тікету
exports.addTagToTicket = async (req, res) => {
  try {
    const { ticketId, tagId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(ticketId) || !mongoose.Types.ObjectId.isValid(tagId)) {
      return res.status(400).json({ message: 'Невірний ID тікету або тегу' });
    }

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: 'Тікет не знайдено' });
    }

    const tag = await Tag.findById(tagId);
    if (!tag) {
      return res.status(404).json({ message: 'Тег не знайдено' });
    }

    // Перевірити, чи тег вже додано
    if (ticket.tags && ticket.tags.includes(tagId)) {
      return res.status(400).json({ message: 'Тег вже додано до тікету' });
    }

    // Додати тег до тікету
    if (!ticket.tags) {
      ticket.tags = [];
    }
    ticket.tags.push(tagId);
    await ticket.save();

    // Збільшити лічильник використання тегу
    await tag.incrementUsage();

    res.json({ message: 'Тег успішно додано до тікету' });
  } catch (error) {
    logger.error('Помилка додавання тегу до тікету:', error);
    res.status(500).json({
      message: 'Помилка сервера при додаванні тегу до тікету',
      error: error.message,
    });
  }
};

// Видалити тег з тікету
exports.removeTagFromTicket = async (req, res) => {
  try {
    const { ticketId, tagId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(ticketId) || !mongoose.Types.ObjectId.isValid(tagId)) {
      return res.status(400).json({ message: 'Невірний ID тікету або тегу' });
    }

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: 'Тікет не знайдено' });
    }

    const tag = await Tag.findById(tagId);
    if (!tag) {
      return res.status(404).json({ message: 'Тег не знайдено' });
    }

    // Видалити тег з тікету
    if (ticket.tags) {
      ticket.tags = ticket.tags.filter(t => t.toString() !== tagId);
      await ticket.save();

      // Зменшити лічильник використання тегу
      await tag.decrementUsage();
    }

    res.json({ message: 'Тег успішно видалено з тікету' });
  } catch (error) {
    logger.error('Помилка видалення тегу з тікету:', error);
    res.status(500).json({
      message: 'Помилка сервера при видаленні тегу з тікету',
      error: error.message,
    });
  }
};

// Отримати теги тікету
exports.getTicketTags = async (req, res) => {
  try {
    const { ticketId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(400).json({ message: 'Невірний ID тікету' });
    }

    const ticket = await Ticket.findById(ticketId).populate(
      'tags',
      'name color description usageCount'
    );

    if (!ticket) {
      return res.status(404).json({ message: 'Тікет не знайдено' });
    }

    res.json(ticket.tags || []);
  } catch (error) {
    logger.error('Помилка отримання тегів тікету:', error);
    res.status(500).json({
      message: 'Помилка сервера при отриманні тегів тікету',
      error: error.message,
    });
  }
};

// Отримати найпопулярніші теги
exports.getMostUsedTags = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const tags = await Tag.getMostUsed(parseInt(limit));

    res.json(tags);
  } catch (error) {
    logger.error('Помилка отримання популярних тегів:', error);
    res.status(500).json({
      message: 'Помилка сервера при отриманні популярних тегів',
      error: error.message,
    });
  }
};

// Пошук тегів
exports.searchTags = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        message: 'Пошуковий запит повинен містити принаймні 2 символи',
      });
    }

    const tags = await Tag.find({
      name: { $regex: q.trim(), $options: 'i' },
      isActive: true,
    })
      .sort({ usageCount: -1, name: 1 })
      .limit(parseInt(limit))
      .select('name color description usageCount');

    res.json(tags);
  } catch (error) {
    logger.error('Помилка пошуку тегів:', error);
    res.status(500).json({
      message: 'Помилка сервера при пошуку тегів',
      error: error.message,
    });
  }
};
