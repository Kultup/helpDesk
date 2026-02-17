const express = require('express');
const router = express.Router();
const CannedResponse = require('../models/CannedResponse');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * @route   GET /api/canned-responses
 * @desc    Отримати всі шаблони відповідей
 * @access  Private (Admin)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category, search, limit = 50 } = req.query;

    const query = { isActive: true };

    if (category) {
      query.category = category;
    }

    let responses;
    if (search) {
      responses = await CannedResponse.search(search).limit(parseInt(limit));
    } else {
      responses = await CannedResponse.find(query)
        .sort({ usageCount: -1 })
        .limit(parseInt(limit))
        .populate('createdBy', 'firstName lastName');
    }

    res.json({
      success: true,
      data: responses,
    });
  } catch (error) {
    logger.error('Помилка отримання шаблонів:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

/**
 * @route   GET /api/canned-responses/most-used
 * @desc    Отримати найпопулярніші шаблони
 * @access  Private (Admin)
 */
router.get('/most-used', authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const responses = await CannedResponse.getMostUsed(parseInt(limit));

    res.json({
      success: true,
      data: responses,
    });
  } catch (error) {
    logger.error('Помилка отримання популярних шаблонів:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

/**
 * @route   GET /api/canned-responses/by-shortcut/:shortcut
 * @desc    Знайти шаблон за shortcuts
 * @access  Private (Admin)
 */
router.get('/by-shortcut/:shortcut', authenticateToken, async (req, res) => {
  try {
    const response = await CannedResponse.findByShortcut(req.params.shortcut);

    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Шаблон не знайдено',
      });
    }

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    logger.error('Помилка пошуку шаблону за shortcuts:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

/**
 * @route   GET /api/canned-responses/:id
 * @desc    Отримати конкретний шаблон
 * @access  Private (Admin)
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const response = await CannedResponse.findById(req.params.id).populate(
      'createdBy',
      'firstName lastName'
    );

    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Шаблон не знайдено',
      });
    }

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    logger.error('Помилка отримання шаблону:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

/**
 * @route   POST /api/canned-responses
 * @desc    Створити новий шаблон
 * @access  Private (Admin)
 */
router.post('/', authenticateToken, requirePermission('manage_settings'), async (req, res) => {
  try {
    const { title, content, category, tags, shortcuts, language, isPublic } = req.body;

    // Валідація
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Назва та зміст є обов'язковими",
      });
    }

    const response = new CannedResponse({
      title,
      content,
      category,
      tags,
      shortcuts,
      language,
      isPublic,
      createdBy: req.user._id,
    });

    await response.save();

    logger.info(`Створено шаблон відповіді: ${title} (${response._id})`);

    res.status(201).json({
      success: true,
      message: 'Шаблон успішно створено',
      data: response,
    });
  } catch (error) {
    logger.error('Помилка створення шаблону:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Помилка сервера',
    });
  }
});

/**
 * @route   PUT /api/canned-responses/:id
 * @desc    Оновити шаблон
 * @access  Private (Admin)
 */
router.put('/:id', authenticateToken, requirePermission('manage_settings'), async (req, res) => {
  try {
    const { title, content, category, tags, shortcuts, language, isPublic } = req.body;

    const response = await CannedResponse.findById(req.params.id);

    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Шаблон не знайдено',
      });
    }

    // Оновлення полів
    if (title) {
      response.title = title;
    }
    if (content) {
      response.content = content;
    }
    if (category) {
      response.category = category;
    }
    if (tags) {
      response.tags = tags;
    }
    if (shortcuts) {
      response.shortcuts = shortcuts;
    }
    if (language) {
      response.language = language;
    }
    if (typeof isPublic !== 'undefined') {
      response.isPublic = isPublic;
    }

    await response.save();

    logger.info(`Оновлено шаблон відповіді: ${response._id}`);

    res.json({
      success: true,
      message: 'Шаблон успішно оновлено',
      data: response,
    });
  } catch (error) {
    logger.error('Помилка оновлення шаблону:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

/**
 * @route   POST /api/canned-responses/:id/use
 * @desc    Відмітити використання шаблону
 * @access  Private (Admin)
 */
router.post('/:id/use', authenticateToken, async (req, res) => {
  try {
    const response = await CannedResponse.findById(req.params.id);

    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Шаблон не знайдено',
      });
    }

    await response.incrementUsage();

    res.json({
      success: true,
      message: 'Використання зареєстровано',
      data: {
        usageCount: response.usageCount,
        lastUsedAt: response.lastUsedAt,
      },
    });
  } catch (error) {
    logger.error('Помилка реєстрації використання:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

/**
 * @route   POST /api/canned-responses/:id/feedback
 * @desc    Відмітити корисність шаблону
 * @access  Private (Admin)
 */
router.post('/:id/feedback', authenticateToken, async (req, res) => {
  try {
    const { isHelpful } = req.body;

    if (typeof isHelpful !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isHelpful має бути boolean',
      });
    }

    const response = await CannedResponse.findById(req.params.id);

    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Шаблон не знайдено',
      });
    }

    await response.markHelpful(isHelpful);

    res.json({
      success: true,
      message: 'Відгук збережено',
      data: {
        helpfulCount: response.helpfulCount,
        notHelpfulCount: response.notHelpfulCount,
        helpfulRating: response.helpfulRating,
      },
    });
  } catch (error) {
    logger.error('Помилка збереження відгуку:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

/**
 * @route   DELETE /api/canned-responses/:id
 * @desc    Видалити шаблон (soft delete)
 * @access  Private (Admin)
 */
router.delete('/:id', authenticateToken, requirePermission('manage_settings'), async (req, res) => {
  try {
    const response = await CannedResponse.findById(req.params.id);

    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Шаблон не знайдено',
      });
    }

    response.isActive = false;
    await response.save();

    logger.info(`Видалено шаблон відповіді: ${response._id}`);

    res.json({
      success: true,
      message: 'Шаблон успішно видалено',
    });
  } catch (error) {
    logger.error('Помилка видалення шаблону:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

module.exports = router;
