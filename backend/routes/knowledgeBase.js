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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'kb-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB (для відео)
    files: 10,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|zip|rar|mp4|webm|mov/;
    const ext = path.extname(file.originalname).toLowerCase();
    const extname = allowedTypes.test(ext);
    const mimetype = allowedTypes.test(file.mimetype);
    const isVideo = /^video\//.test(file.mimetype);
    if ((mimetype || isVideo) && extname) {
      return cb(null, true);
    }
    cb(
      new Error(
        'Непідтримуваний тип файлу. Дозволені: зображення, відео (MP4, WebM), PDF, DOC, TXT, ZIP, RAR'
      )
    );
  },
});

/**
 * @route   GET /api/kb/articles
 * @desc    Отримати список статей KB
 * @access  Private
 */
router.get('/articles', auth, async (req, res) => {
  try {
    const { q = '', status, tags, page = 1, limit = 10, sortBy = 'relevance', all } = req.query;

    const filters = {
      status: status && status !== 'undefined' && status !== 'null' ? status : undefined,
      isPublic: all === '1' ? undefined : true,
      tags: tags ? tags.split(',') : undefined,
    };

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
    };

    const result = await kbSearchService.searchArticles(q, filters, options);

    res.json({
      success: true,
      data: result.articles,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error fetching KB articles:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання статей KB',
      error: error.message,
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
      .populate('createdBy', 'email firstName lastName')
      .populate('lastUpdatedBy', 'email firstName lastName');

    if (!article || !article.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена',
      });
    }

    if (article.status === 'published') {
      article.views = (article.views || 0) + 1;
      await article.save();
    }

    // Знаходимо пов'язані статті
    const relatedArticles = await kbSearchService.findRelatedArticles(req.params.id, 5);

    res.json({
      success: true,
      data: {
        ...article.toObject(),
        relatedArticles,
      },
    });
  } catch (error) {
    logger.error('Error fetching KB article:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання статті KB',
      error: error.message,
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
      isActive: true,
      status: 'published',
    })
      .populate('createdBy', 'email firstName lastName')
      .populate('lastUpdatedBy', 'email firstName lastName');

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена або недоступна',
      });
    }

    article.views = (article.views || 0) + 1;
    await article.save();

    // Знаходимо пов'язані статті
    const relatedArticles = await kbSearchService.findRelatedArticles(article._id.toString(), 5);

    res.json({
      success: true,
      data: {
        ...article.toObject(),
        relatedArticles,
      },
    });
  } catch (error) {
    logger.error('Error fetching shared KB article:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання статті KB',
      error: error.message,
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

    if (!article || !article.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена',
      });
    }

    const frontendUrl =
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000'
        : `${req.protocol}://${req.get('host')}`);

    if (article.shareToken) {
      return res.json({
        success: true,
        data: {
          shareToken: article.shareToken,
          shareUrl: `${frontendUrl}/share/kb/${article.shareToken}`,
        },
      });
    }

    const crypto = require('crypto');
    const token = crypto.randomBytes(24).toString('hex');
    article.shareToken = token;
    await article.save();

    res.json({
      success: true,
      data: {
        shareToken: token,
        shareUrl: `${frontendUrl}/share/kb/${token}`,
      },
    });
  } catch (error) {
    logger.error('Error generating share token:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка генерації токену поділу',
      error: error.message,
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
      createdBy: req.user._id,
    };

    const article = new KnowledgeBase(articleData);
    await article.save();

    res.status(201).json({
      success: true,
      message: 'Стаття KB успішно створена',
      data: article,
    });
  } catch (error) {
    logger.error('Error creating KB article:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка створення статті KB',
      error: error.message,
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

    if (!article || !article.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена',
      });
    }

    Object.assign(article, req.body);
    article.lastUpdatedBy = req.user._id;
    await article.save();

    res.json({
      success: true,
      message: 'Стаття KB успішно оновлена',
      data: article,
    });
  } catch (error) {
    logger.error('Error updating KB article:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка оновлення статті KB',
      error: error.message,
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

    if (!article || !article.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена',
      });
    }

    article.isActive = false;
    article.lastUpdatedBy = req.user._id;
    await article.save();

    res.json({
      success: true,
      message: 'Стаття KB успішно видалена',
    });
  } catch (error) {
    logger.error('Error deleting KB article:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка видалення статті KB',
      error: error.message,
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
    const { q = '', status, tags, page = 1, limit = 10, sortBy = 'relevance' } = req.query;

    const filters = {
      status: status && status !== 'undefined' && status !== 'null' ? status : undefined,
      isPublic: true,
      tags: tags ? tags.split(',') : undefined,
    };

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
    };

    const result = await kbSearchService.searchArticles(q, filters, options);

    res.json({
      success: true,
      data: result.articles,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error searching KB articles:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка пошуку статей KB',
      error: error.message,
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

    if (!article || !article.isActive || article.status !== 'published') {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена',
      });
    }

    article.helpfulCount = (article.helpfulCount || 0) + 1;
    await article.save();

    res.json({
      success: true,
      message: 'Статтю позначено як корисну',
      data: {
        helpfulCount: article.helpfulCount,
        notHelpfulCount: article.notHelpfulCount,
      },
    });
  } catch (error) {
    logger.error('Error marking article as helpful:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка позначення статті',
      error: error.message,
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

    if (!article || !article.isActive || article.status !== 'published') {
      return res.status(404).json({
        success: false,
        message: 'Стаття не знайдена',
      });
    }

    article.notHelpfulCount = (article.notHelpfulCount || 0) + 1;
    await article.save();

    res.json({
      success: true,
      message: 'Статтю позначено як некорисну',
      data: {
        helpfulCount: article.helpfulCount,
        notHelpfulCount: article.notHelpfulCount,
      },
    });
  } catch (error) {
    logger.error('Error marking article as not helpful:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка позначення статті',
      error: error.message,
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
    articleData.createdBy = req.user._id;

    const article = new KnowledgeBase(articleData);
    await article.save();

    res.status(201).json({
      success: true,
      message: 'Стаття KB згенерована з тикету',
      data: article,
    });
  } catch (error) {
    logger.error('Error generating article from ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка генерації статті KB',
      error: error.message,
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
    return res.status(503).json({
      success: false,
      message: 'AI інтеграція вимкнена.',
    });
  } catch (error) {
    logger.error('Помилка генерації FAQ:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при генерації FAQ',
      error: error.message,
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
        message: 'Файли не надано',
      });
    }

    const isImage = f => /^image\//.test(f.mimetype);
    const isVideo = f => /^video\//.test(f.mimetype);
    const baseUrl = process.env.BACKEND_URL || process.env.API_URL || '';

    const filesWithUrl = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      url: `${baseUrl}/api/files/${file.filename}`.replace(/\/+/g, '/'),
      // Для збереження в article.attachments
      type: isVideo(file) ? 'video' : isImage(file) ? 'image' : null,
      filePath: file.filename,
    }));

    res.json({
      success: true,
      message: 'Файли успішно завантажено',
      data: filesWithUrl,
    });
  } catch (error) {
    logger.error('Error uploading KB files:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка завантаження файлів',
      error: error.message,
    });
  }
});

module.exports = router;
