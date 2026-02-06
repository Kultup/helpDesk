const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken: auth } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const KnowledgeBase = require('../models/KnowledgeBase');
const kbSearchService = require('../services/kbSearchService');
const logger = require('../utils/logger');

// Налаштування multer для завантаження файлів KB
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/kb');
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'kb-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10 // максимум 10 файлів за раз
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Непідтримуваний тип файлу. Дозволені: зображення, PDF, DOC, TXT, ZIP, RAR'));
    }
  }
});

/**
 * @route   GET /api/kb/articles
 * @desc    Отримати список статей KB
 * @access  Private
 */
router.get('/articles', auth, async (req, res) => {
  try {
    const {
      q = '',
      status,
      tags,
      page = 1,
      limit = 10,
      sortBy = 'relevance'
    } = req.query;

    const filters = {
      status: (status && status !== 'undefined' && status !== 'null') ? status : undefined,
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
    // Передаємо userId, щоб не рахувати повторні перегляди від того самого користувача
    if (article.status === 'published') {
      const userId = req.user?._id || null;
      await article.incrementViews(userId);
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
 * @route   GET /api/kb/articles/share/:token
 * @desc    Отримати статтю KB за токеном поділу (публічний доступ)
 * @access  Public
 */
router.get('/articles/share/:token', async (req, res) => {
  try {
    const article = await KnowledgeBase.findOne({ 
      shareToken: req.params.token,
      isDeleted: false,
      status: 'published'
    })
      .populate('author', 'email position')
      .populate('lastUpdatedBy', 'email position')
      .populate('relatedArticles', 'title status');

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена або недоступна'
      });
    }

    // Збільшуємо кількість переглядів
    // Для публічного доступу не передаємо userId (завжди рахуємо перегляд)
    await article.incrementViews(null);

    // Знаходимо пов'язані статті
    const relatedArticles = await kbSearchService.findRelatedArticles(article._id.toString(), 5);

    res.json({
      success: true,
      data: {
        ...article.toObject(),
        relatedArticles
      }
    });
  } catch (error) {
    logger.error('Error fetching shared KB article:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання статті KB',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/kb/articles/:id/share-token
 * @desc    Генерувати або отримати токен поділу для статті
 * @access  Private (Admin)
 */
router.post('/articles/:id/share-token', auth, adminAuth, async (req, res) => {
  try {
    const article = await KnowledgeBase.findById(req.params.id);

    if (!article || article.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена'
      });
    }

    // Визначаємо frontend URL
    // В development використовуємо localhost:3000, в production - з env або з FRONTEND_URL
    let frontendUrl;
    if (process.env.NODE_ENV === 'development') {
      frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    } else {
      frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    }

    // Якщо токен вже є, повертаємо його
    if (article.shareToken) {
      return res.json({
        success: true,
        data: {
          shareToken: article.shareToken,
          shareUrl: `${frontendUrl}/share/kb/${article.shareToken}`
        }
      });
    }

    // Генеруємо новий токен
    const token = await article.generateShareToken();

    res.json({
      success: true,
      data: {
        shareToken: token,
        shareUrl: `${frontendUrl}/share/kb/${token}`
      }
    });
  } catch (error) {
    logger.error('Error generating share token:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка генерації токену поділу',
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
      status,
      tags,
      page = 1,
      limit = 10,
      sortBy = 'relevance'
    } = req.query;

    const filters = {
      status: (status && status !== 'undefined' && status !== 'null') ? status : undefined,
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

/**
 * @route   POST /api/kb/generate-faq
 * @desc    Згенерувати FAQ статті на основі аналізу заявок
 * @access  Private (Admin)
 */
router.post('/generate-faq', auth, adminAuth, async (req, res) => {
  try {
    const aiService = require('../services/aiService');
    
    if (!aiService.isEnabled()) {
      return res.status(503).json({
        success: false,
        message: 'AI асистент вимкнено. Увімкніть AI в налаштуваннях бота.'
      });
    }

    const { startDate, endDate, minFrequency = 2, maxItems = 20, autoSave = false } = req.body;

    // Створюємо фільтр дат
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    
    const filter = {};
    if (Object.keys(dateFilter).length > 0) {
      filter.createdAt = dateFilter;
    }

    // Отримуємо тікети з коментарями (вирішені або закриті)
    const Ticket = require('../models/Ticket');
    const tickets = await Ticket.find({
      ...filter,
      status: { $in: ['resolved', 'closed'] },
      'comments.0': { $exists: true } // Тільки тікети з коментарями
    })
      .populate('createdBy', 'firstName lastName email')
      .populate({
        path: 'comments',
        populate: {
          path: 'author',
          select: 'firstName lastName email'
        }
      })
      .select('title description status priority type subcategory city createdAt resolvedAt comments')
      .sort({ createdAt: -1 })
      .limit(200) // Обмежуємо для швидкості
      .lean();

    if (!tickets || tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Не знайдено вирішених заявок з коментарями для генерації FAQ.'
      });
    }

    // Генеруємо FAQ
    const faqResult = await aiService.generateFAQ(tickets, {
      minFrequency: parseInt(minFrequency),
      maxItems: parseInt(maxItems)
    });

    if (!faqResult || !faqResult.faqItems || faqResult.faqItems.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Не вдалося згенерувати FAQ. Спробуйте змінити параметри або перевірте наявність вирішених заявок.'
      });
    }

    // Якщо autoSave, зберігаємо FAQ в KnowledgeBase
    let savedArticles = [];
    if (autoSave && req.user) {
      for (const faqItem of faqResult.faqItems) {
        const article = new KnowledgeBase({
          title: faqItem.question,
          content: `## Питання\n\n${faqItem.question}\n\n## Відповідь\n\n${faqItem.answer}\n\n${faqItem.examples && faqItem.examples.length > 0 ? `\n## Приклади заявок\n\n${faqItem.examples.map((ex, i) => `${i + 1}. ${ex}`).join('\n')}` : ''}`,
          type: 'text',
          tags: ['FAQ', 'AI Generated', ...(faqItem.tags || []), faqItem.category],
          category: faqItem.category || 'FAQ',
          status: 'draft', // Створюємо як чернетку для перегляду
          isPublic: true,
          createdBy: req.user._id,
          metadata: {
            source: 'ai_faq_generation',
            frequency: faqItem.frequency,
            priority: faqItem.priority,
            generatedAt: new Date().toISOString()
          }
        });
        await article.save();
        savedArticles.push(article._id);
      }
    }

    res.json({
      success: true,
      data: {
        ...faqResult,
        savedArticles: autoSave ? savedArticles : null,
        analyzedTickets: tickets.length
      }
    });
  } catch (error) {
    logger.error('Помилка генерації FAQ:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при генерації FAQ',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/kb/upload
 * @desc    Завантажити файли для статті KB
 * @access  Private (Admin)
 */
router.post('/upload', auth, adminAuth, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Файли не надано'
      });
    }

    const uploadedFiles = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      uploadedBy: req.user._id,
      uploadedAt: new Date()
    }));

    // Формуємо URL для доступу до файлів
    const filesWithUrl = uploadedFiles.map(file => ({
      ...file,
      url: `/api/files/${file.filename}`
    }));

    res.json({
      success: true,
      message: 'Файли успішно завантажено',
      data: filesWithUrl
    });
  } catch (error) {
    logger.error('Error uploading KB files:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка завантаження файлів',
      error: error.message
    });
  }
});

module.exports = router;

