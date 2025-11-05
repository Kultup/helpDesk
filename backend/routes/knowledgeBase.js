const express = require('express');
const router = express.Router();
const { authenticateToken: auth } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const KnowledgeBase = require('../models/KnowledgeBase');
const kbSearchService = require('../services/kbSearchService');
const logger = require('../utils/logger');

/**
 * @route   GET /api/kb/articles
 * @desc    Отримати список статей KB
 * @access  Private
 */
router.get('/articles', auth, async (req, res) => {
  try {
    const {
      q = '',
      category,
      status,
      tags,
      page = 1,
      limit = 10,
      sortBy = 'relevance'
    } = req.query;

    const filters = {
      category: category || undefined,
      status: status || undefined,
      isPublic: true,
      tags: tags ? tags.split(',') : undefined
    };

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy
    };

    const result = await kbSearchService.searchArticles(q, filters, options);

    res.json({
      success: true,
      data: result.articles,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Error fetching KB articles:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання статей KB',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/kb/articles/:id
 * @desc    Отримати статтю KB за ID
 * @access  Private
 */
router.get('/articles/:id', auth, async (req, res) => {
  try {
    const article = await KnowledgeBase.findById(req.params.id)
      .populate('category', 'name color')
      .populate('author', 'email position')
      .populate('lastUpdatedBy', 'email position')
      .populate('relatedArticles', 'title status');

    if (!article || article.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена'
      });
    }

    // Збільшуємо кількість переглядів (тільки для published статей)
    if (article.status === 'published') {
      await article.incrementViews();
    }

    // Знаходимо пов'язані статті
    const relatedArticles = await kbSearchService.findRelatedArticles(req.params.id, 5);

    res.json({
      success: true,
      data: {
        ...article.toObject(),
        relatedArticles
      }
    });
  } catch (error) {
    logger.error('Error fetching KB article:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання статті KB',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/kb/articles
 * @desc    Створити нову статтю KB
 * @access  Private (Admin)
 */
router.post('/articles', auth, adminAuth, async (req, res) => {
  try {
    const articleData = {
      ...req.body,
      author: req.user._id
    };

    const article = new KnowledgeBase(articleData);
    await article.save();

    res.status(201).json({
      success: true,
      message: 'Стаття KB успішно створена',
      data: article
    });
  } catch (error) {
    logger.error('Error creating KB article:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка створення статті KB',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/kb/articles/:id
 * @desc    Оновити статтю KB
 * @access  Private (Admin)
 */
router.put('/articles/:id', auth, adminAuth, async (req, res) => {
  try {
    const article = await KnowledgeBase.findById(req.params.id);

    if (!article || article.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена'
      });
    }

    // Додаємо версію в історію перед оновленням
    await article.addVersion(req.user._id, req.body.reason || 'Оновлення статті');

    // Оновлюємо статтю
    Object.assign(article, req.body);
    article.lastUpdatedBy = req.user._id;
    await article.save();

    res.json({
      success: true,
      message: 'Стаття KB успішно оновлена',
      data: article
    });
  } catch (error) {
    logger.error('Error updating KB article:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка оновлення статті KB',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/kb/articles/:id
 * @desc    Видалити статтю KB
 * @access  Private (Admin)
 */
router.delete('/articles/:id', auth, adminAuth, async (req, res) => {
  try {
    const article = await KnowledgeBase.findById(req.params.id);

    if (!article || article.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена'
      });
    }

    await article.softDelete(req.user._id);

    res.json({
      success: true,
      message: 'Стаття KB успішно видалена'
    });
  } catch (error) {
    logger.error('Error deleting KB article:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка видалення статті KB',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/kb/search
 * @desc    Пошук статей KB
 * @access  Private
 */
router.get('/search', auth, async (req, res) => {
  try {
    const {
      q = '',
      category,
      status,
      tags,
      page = 1,
      limit = 10,
      sortBy = 'relevance'
    } = req.query;

    const filters = {
      category: category || undefined,
      status: status || undefined,
      isPublic: true,
      tags: tags ? tags.split(',') : undefined
    };

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy
    };

    const result = await kbSearchService.searchArticles(q, filters, options);

    res.json({
      success: true,
      data: result.articles,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Error searching KB articles:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка пошуку статей KB',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/kb/articles/:id/helpful
 * @desc    Позначити статтю як корисну
 * @access  Private
 */
router.post('/articles/:id/helpful', auth, async (req, res) => {
  try {
    const article = await KnowledgeBase.findById(req.params.id);

    if (!article || article.isDeleted || article.status !== 'published') {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена'
      });
    }

    await article.markHelpful();

    res.json({
      success: true,
      message: 'Статтю позначено як корисну',
      data: {
        helpfulCount: article.helpfulCount,
        notHelpfulCount: article.notHelpfulCount
      }
    });
  } catch (error) {
    logger.error('Error marking article as helpful:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка позначення статті',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/kb/articles/:id/not-helpful
 * @desc    Позначити статтю як некорисну
 * @access  Private
 */
router.post('/articles/:id/not-helpful', auth, async (req, res) => {
  try {
    const article = await KnowledgeBase.findById(req.params.id);

    if (!article || article.isDeleted || article.status !== 'published') {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена'
      });
    }

    await article.markNotHelpful();

    res.json({
      success: true,
      message: 'Статтю позначено як некорисну',
      data: {
        helpfulCount: article.helpfulCount,
        notHelpfulCount: article.notHelpfulCount
      }
    });
  } catch (error) {
    logger.error('Error marking article as not helpful:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка позначення статті',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/kb/categories
 * @desc    Отримати список категорій з кількістю статей
 * @access  Private
 */
router.get('/categories', auth, async (req, res) => {
  try {
    const Category = require('../models/Category');
    const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1 });

    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const count = await KnowledgeBase.countDocuments({
          category: category._id,
          status: 'published',
          isDeleted: false,
          isPublic: true
        });
        return {
          _id: category._id,
          name: category.name,
          color: category.color,
          icon: category.icon,
          articleCount: count
        };
      })
    );

    res.json({
      success: true,
      data: categoriesWithCount
    });
  } catch (error) {
    logger.error('Error fetching KB categories:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання категорій KB',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/kb/articles/generate-from-ticket/:ticketId
 * @desc    Згенерувати статтю KB з вирішеного тикету (для AI інтеграції)
 * @access  Private (Admin)
 */
router.post('/articles/generate-from-ticket/:ticketId', auth, adminAuth, async (req, res) => {
  try {
    const articleData = await kbSearchService.generateArticleFromTicket(req.params.ticketId);
    articleData.author = req.user._id;

    const article = new KnowledgeBase(articleData);
    await article.save();

    res.status(201).json({
      success: true,
      message: 'Стаття KB згенерована з тикету',
      data: article
    });
  } catch (error) {
    logger.error('Error generating article from ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка генерації статті KB',
      error: error.message
    });
  }
});

module.exports = router;

