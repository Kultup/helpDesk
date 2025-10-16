const QuickTip = require('../models/QuickTip');
const Category = require('../models/Category');
const logger = require('../utils/logger');

// Отримати швидкі поради по категорії
const getQuickTipsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { limit = 5 } = req.query;

    // Перевіряємо чи існує категорія
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Категорію не знайдено'
      });
    }

    const quickTips = await QuickTip.getByCategoryId(categoryId, parseInt(limit));

    res.json({
      success: true,
      data: quickTips,
      category: category.name
    });
  } catch (error) {
    logger.error('Помилка при отриманні швидких порад:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні швидких порад'
    });
  }
};

// Пошук швидких порад
const searchQuickTips = async (req, res) => {
  try {
    const { query, categoryId } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Запит повинен містити принаймні 2 символи'
      });
    }

    const quickTips = await QuickTip.searchTips(query.trim(), categoryId);

    res.json({
      success: true,
      data: quickTips,
      count: quickTips.length
    });
  } catch (error) {
    logger.error('Помилка при пошуку швидких порад:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при пошуку швидких порад'
    });
  }
};

// Оцінити корисність поради
const rateQuickTip = async (req, res) => {
  try {
    const { tipId } = req.params;
    const { isHelpful } = req.body;

    if (typeof isHelpful !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Параметр isHelpful повинен бути boolean'
      });
    }

    const quickTip = await QuickTip.findById(tipId);
    if (!quickTip) {
      return res.status(404).json({
        success: false,
        message: 'Швидку пораду не знайдено'
      });
    }

    if (isHelpful) {
      quickTip.helpfulCount += 1;
    } else {
      quickTip.notHelpfulCount += 1;
    }
    await quickTip.save();

    res.json({
      success: true,
      message: 'Дякуємо за оцінку!',
      data: {
        helpfulCount: quickTip.helpfulCount,
        notHelpfulCount: quickTip.notHelpfulCount,
        helpfulnessRatio: quickTip.helpfulnessRatio
      }
    });
  } catch (error) {
    logger.error('Помилка при оцінці швидкої поради:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при оцінці швидкої поради'
    });
  }
};

// Отримати всі швидкі поради (для адміністраторів)
const getAllQuickTips = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, isActive } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const quickTips = await QuickTip.find(filter)
      .populate('category', 'name')
      .populate('createdBy', 'firstName lastName')
      .populate('updatedBy', 'firstName lastName')
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await QuickTip.countDocuments(filter);

    res.json({
      success: true,
      data: quickTips,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    logger.error('Помилка при отриманні всіх швидких порад:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні швидких порад'
    });
  }
};

// Створити нову швидку пораду (для адміністраторів)
const createQuickTip = async (req, res) => {
  try {
    const { category, title, description, steps, priority, tags } = req.body;

    // Перевіряємо чи існує категорія
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(404).json({
        success: false,
        message: 'Категорію не знайдено'
      });
    }

    const quickTip = new QuickTip({
      category,
      title,
      description,
      steps,
      priority,
      tags,
      createdBy: req.user.id
    });

    await quickTip.save();
    await quickTip.populate('category', 'name');

    res.status(201).json({
      success: true,
      message: 'Швидку пораду створено успішно',
      data: quickTip
    });
  } catch (error) {
    logger.error('Помилка при створенні швидкої поради:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при створенні швидкої поради'
    });
  }
};

// Оновити швидку пораду (для адміністраторів)
const updateQuickTip = async (req, res) => {
  try {
    const { tipId } = req.params;
    const updateData = { ...req.body, updatedBy: req.user.id };

    const quickTip = await QuickTip.findByIdAndUpdate(
      tipId,
      updateData,
      { new: true, runValidators: true }
    ).populate('category', 'name');

    if (!quickTip) {
      return res.status(404).json({
        success: false,
        message: 'Швидку пораду не знайдено'
      });
    }

    res.json({
      success: true,
      message: 'Швидку пораду оновлено успішно',
      data: quickTip
    });
  } catch (error) {
    logger.error('Помилка при оновленні швидкої поради:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при оновленні швидкої поради'
    });
  }
};

// Видалити швидку пораду (для адміністраторів)
const deleteQuickTip = async (req, res) => {
  try {
    const { tipId } = req.params;

    const quickTip = await QuickTip.findByIdAndDelete(tipId);
    if (!quickTip) {
      return res.status(404).json({
        success: false,
        message: 'Швидку пораду не знайдено'
      });
    }

    res.json({
      success: true,
      message: 'Швидку пораду видалено успішно'
    });
  } catch (error) {
    logger.error('Помилка при видаленні швидкої поради:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при видаленні швидкої поради'
    });
  }
};

module.exports = {
  getQuickTipsByCategory,
  searchQuickTips,
  rateQuickTip,
  getAllQuickTips,
  createQuickTip,
  updateQuickTip,
  deleteQuickTip
};
