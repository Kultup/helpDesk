const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Category = require('../models/Category');
const Ticket = require('../models/Ticket');
const logger = require('../utils/logger');

// Отримати всі категорії
exports.getCategories = async (req, res) => {
  try {
    const { includeInactive = false } = req.query;
    
    const filter = includeInactive === 'true' ? {} : { isActive: true };
    const categories = await Category.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .sort({ sortOrder: 1, name: 1 });

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні категорій',
      error: error.message
    });
  }
};

// Отримати категорію за ID
exports.getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID категорії'
      });
    }

    const category = await Category.findById(id)
      .populate('createdBy', 'firstName lastName email');

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Категорію не знайдено'
      });
    }

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    logger.error('Error fetching category:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні категорії',
      error: error.message
    });
  }
};

// Створити нову категорію
exports.createCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    const { name, description, color, icon, sortOrder } = req.body;

    // Перевірка на унікальність назви
    const existingCategory = await Category.findByName(name);
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Категорія з такою назвою вже існує'
      });
    }

    const category = new Category({
      name,
      description,
      color,
      icon,
      sortOrder,
      createdBy: req.user._id
    });

    await category.save();
    await category.populate('createdBy', 'firstName lastName email');

    res.status(201).json({
      success: true,
      data: category,
      message: 'Категорію успішно створено'
    });
  } catch (error) {
    logger.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при створенні категорії',
      error: error.message
    });
  }
};

// Оновити категорію
exports.updateCategory = async (req, res) => {
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
        message: 'Невірний ID категорії'
      });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Категорію не знайдено'
      });
    }

    const { name, description, color, icon, sortOrder, isActive } = req.body;

    // Перевірка на унікальність назви (якщо назва змінюється)
    if (name && name !== category.name) {
      const existingCategory = await Category.findByName(name);
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Категорія з такою назвою вже існує'
        });
      }
    }

    // Оновлення полів
    if (name !== undefined) category.name = name;
    if (description !== undefined) category.description = description;
    if (color !== undefined) category.color = color;
    if (icon !== undefined) category.icon = icon;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();
    await category.populate('createdBy', 'firstName lastName email');

    res.json({
      success: true,
      data: category,
      message: 'Категорію успішно оновлено'
    });
  } catch (error) {
    logger.error('Error updating category:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при оновленні категорії',
      error: error.message
    });
  }
};

// Видалити категорію
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID категорії'
      });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Категорію не знайдено'
      });
    }

    // Мапінг назв категорій на англійські ключі
    const categoryMapping = {
      'Технічні': 'technical',
      'Акаунт': 'account', 
      'Фінанси': 'billing',
      'Загальні': 'general'
    };

    // Отримуємо англійський ключ категорії
    const categoryKey = categoryMapping[category.name] || category.name.toLowerCase();

    // Перевірка, чи використовується категорія в тікетах
    const ticketsCount = await Ticket.countDocuments({ 
      category: categoryKey,
      isDeleted: false 
    });

    if (ticketsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Неможливо видалити категорію. Вона використовується в ${ticketsCount} тікетах. Спочатку деактивуйте категорію або перенесіть тікети в іншу категорію.`
      });
    }

    await Category.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Категорію успішно видалено'
    });
  } catch (error) {
    logger.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні категорії',
      error: error.message
    });
  }
};

// Деактивувати категорію
exports.deactivateCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID категорії'
      });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Категорію не знайдено'
      });
    }

    await category.deactivate();
    await category.populate('createdBy', 'firstName lastName email');

    res.json({
      success: true,
      data: category,
      message: 'Категорію успішно деактивовано'
    });
  } catch (error) {
    logger.error('Error deactivating category:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при деактивації категорії',
      error: error.message
    });
  }
};

// Активувати категорію
exports.activateCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID категорії'
      });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Категорію не знайдено'
      });
    }

    await category.activate();
    await category.populate('createdBy', 'firstName lastName email');

    res.json({
      success: true,
      data: category,
      message: 'Категорію успішно активовано'
    });
  } catch (error) {
    logger.error('Error activating category:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при активації категорії',
      error: error.message
    });
  }
};

// Отримати статистику використання категорій
exports.getCategoryStats = async (req, res) => {
  try {
    const stats = await Ticket.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$category',
          totalTickets: { $sum: 1 },
          openTickets: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          inProgressTickets: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          resolvedTickets: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          closedTickets: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } }
        }
      },
      { $sort: { totalTickets: -1 } }
    ]);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching category stats:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні статистики категорій',
      error: error.message
    });
  }
};
