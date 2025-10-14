const TicketTemplate = require('../models/TicketTemplate');
// const KnowledgeBase = require('../models/KnowledgeBase'); // Модуль не існує
const logger = require('../utils/logger');

// Отримати всі шаблони тікетів
const getTicketTemplates = async (req, res) => {
  try {
    const {
      category,
      active = 'true',
      page = 1,
      limit = 10,
      sortBy = 'popular'
    } = req.query;

    let query = {};
    
    if (active === 'true') {
      query.isActive = true;
    }
    
    if (category) {
      query.category = category;
    }

    let sort = {};
    switch (sortBy) {
      case 'popular':
        sort = { usageCount: -1 };
        break;
      case 'newest':
        sort = { createdAt: -1 };
        break;
      case 'alphabetical':
        sort = { title: 1 };
        break;
      default:
        sort = { usageCount: -1 };
    }

    const templates = await TicketTemplate.find(query)
      .populate('category', 'name color')
      .populate('author', 'email position')
      // .populate('relatedKnowledgeBase', 'title summary') // KnowledgeBase не існує
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await TicketTemplate.countDocuments(query);

    res.json({
      success: true,
      data: templates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching ticket templates:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання шаблонів тікетів',
      error: error.message
    });
  }
};

// Отримати шаблон за ID
const getTicketTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const template = await TicketTemplate.findById(id)
      .populate('category', 'name color')
      .populate('author', 'email position');
      // .populate('relatedKnowledgeBase', 'title summary difficulty estimatedTime'); // KnowledgeBase не існує

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Шаблон не знайдено'
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('Error fetching ticket template:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання шаблону',
      error: error.message
    });
  }
};

// Створити новий шаблон (тільки для адміністраторів)
const createTicketTemplate = async (req, res) => {
  try {
    const templateData = {
      ...req.body,
      author: req.user.id
    };

    const template = new TicketTemplate(templateData);
    await template.save();

    const populatedTemplate = await TicketTemplate.findById(template._id)
      .populate('category', 'name color')
      .populate('author', 'email position');

    res.status(201).json({
      success: true,
      data: populatedTemplate,
      message: 'Шаблон створено успішно'
    });
  } catch (error) {
    logger.error('Error creating ticket template:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка створення шаблону',
      error: error.message
    });
  }
};

// Оновити шаблон
const updateTicketTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      lastUpdatedBy: req.user.id
    };

    const template = await TicketTemplate.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('category', 'name color')
      .populate('author', 'email position')
      .populate('lastUpdatedBy', 'email position');

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Шаблон не знайдено'
      });
    }

    res.json({
      success: true,
      data: template,
      message: 'Шаблон оновлено успішно'
    });
  } catch (error) {
    logger.error('Error updating ticket template:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка оновлення шаблону',
      error: error.message
    });
  }
};

// Видалити шаблон
const deleteTicketTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await TicketTemplate.findByIdAndDelete(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Шаблон не знайдено'
      });
    }

    res.json({
      success: true,
      message: 'Шаблон видалено успішно'
    });
  } catch (error) {
    logger.error('Error deleting ticket template:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка видалення шаблону',
      error: error.message
    });
  }
};

// Використати шаблон (збільшити лічильник)
const useTicketTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await TicketTemplate.findById(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Шаблон не знайдено'
      });
    }

    await template.incrementUsage();

    res.json({
      success: true,
      message: 'Використання шаблону зафіксовано',
      data: { usageCount: template.usageCount }
    });
  } catch (error) {
    logger.error('Error using ticket template:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка використання шаблону',
      error: error.message
    });
  }
};

// Отримати популярні шаблони
const getPopularTicketTemplates = async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    const templates = await TicketTemplate.find({ isActive: true })
      .populate('category', 'name color')
      .sort({ usageCount: -1 })
      .limit(parseInt(limit))
      .select('title description usageCount category');

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    logger.error('Error fetching popular ticket templates:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання популярних шаблонів',
      error: error.message
    });
  }
};

// Отримати шаблони за категорією
const getTicketTemplatesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { limit = 10 } = req.query;

    const templates = await TicketTemplate.find({ 
      category: categoryId, 
      isActive: true 
    })
      .populate('category', 'name color')
      // .populate('relatedKnowledgeBase', 'title summary') // KnowledgeBase не існує
      .sort({ usageCount: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    logger.error('Error fetching templates by category:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання шаблонів за категорією',
      error: error.message
    });
  }
};

// Отримати шаблони для Telegram бота (спрощений формат)
const getTemplatesForTelegram = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const templates = await TicketTemplate.find({ isActive: true })
      .populate('category', 'name color')
      .sort({ usageCount: -1 })
      .limit(parseInt(limit))
      .select('title description category priority estimatedResolutionTime tags');

    // Форматуємо дані для зручного використання в Telegram боті
    const formattedTemplates = templates.map(template => ({
      id: template._id,
      title: template.title,
      description: template.description,
      category: template.category?.name || 'Без категорії',
      categoryColor: template.category?.color || '#95A5A6',
      priority: template.priority,
      estimatedTime: template.estimatedResolutionTime,
      tags: template.tags || []
    }));

    res.json({
      success: true,
      data: formattedTemplates,
      count: formattedTemplates.length
    });
  } catch (error) {
    logger.error('Error fetching templates for Telegram:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання шаблонів для Telegram',
      error: error.message
    });
  }
};

module.exports = {
  getTicketTemplates,
  getTicketTemplateById,
  createTicketTemplate,
  updateTicketTemplate,
  deleteTicketTemplate,
  useTicketTemplate,
  getPopularTicketTemplates,
  getTicketTemplatesByCategory,
  getTemplatesForTelegram
};
