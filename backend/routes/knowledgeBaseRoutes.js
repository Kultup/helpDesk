const express = require('express');
const router = express.Router();
const knowledgeBaseController = require('../controllers/knowledgeBaseController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const KBSearchService = require('../services/kbSearchService');
const logger = require('../utils/logger');

// Ініціалізація сервісу пошуку
const kbSearchService = new KBSearchService();

// Всі маршрути захищені
router.use(authenticateToken);

// Пошук статей
router.get('/articles', async (req, res) => {
  try {
    const { q, status, category, tags, page, limit, sortBy, isPublic } = req.query;
    
    const filters = {
      status: status !== 'all' ? status : undefined,
      category,
      tags: tags ? tags.split(',') : undefined,
      isPublic: isPublic === 'true' ? true : undefined
    };
    
    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      sortBy
    };
    
    const result = await kbSearchService.searchArticles(q, filters, options);
    
    res.json({
      success: true,
      data: result.articles,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Error searching articles:', error);
    res.status(500).json({ success: false, message: 'Помилка пошуку статей' });
  }
});

// Отримання списку документів (для адмінки)
router.get('/', knowledgeBaseController.getAllDocuments);

// Завантаження нового документа (тільки адміни та менеджери)
// Використовуємо requireAdmin для спрощення, або можна додати кастомний middleware для менеджерів
router.post('/upload', requireAdmin, upload.single('file'), knowledgeBaseController.uploadDocument);

// Видалення документа (тільки адміни)
router.delete('/:id', requireAdmin, knowledgeBaseController.deleteDocument);

// Маршрут для категорій (поки повертає статичний список або унікальні теги)
router.get('/categories', async (req, res) => {
    try {
        const KnowledgeBase = require('../models/KnowledgeBase');
        // Отримуємо унікальні теги як "категорії"
        const tags = await KnowledgeBase.distinct('tags');
        res.json({ success: true, data: tags });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Помилка отримання категорій' });
    }
});

module.exports = router;
