const express = require('express');
const router = express.Router();
const knowledgeBaseController = require('../controllers/knowledgeBaseController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const kbSearchService = require('../services/kbSearchService');
const logger = require('../utils/logger');

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

// Створення нової статті
router.post('/articles', requireAdmin, knowledgeBaseController.createArticle);

// Оновлення статті
router.put('/articles/:id', requireAdmin, knowledgeBaseController.updateArticle);

// Завантаження нового документа (тільки адміни та менеджери)
// Використовуємо requireAdmin для спрощення, або можна додати кастомний middleware для менеджерів
router.post('/upload', requireAdmin, upload.single('file'), knowledgeBaseController.uploadDocument);

// Видалення документа (тільки адміни)
// Підтримуємо обидва варіанти шляху для сумісності
router.delete('/:id', requireAdmin, knowledgeBaseController.deleteDocument);
router.delete('/articles/:id', requireAdmin, knowledgeBaseController.deleteDocument);

// Отримання однієї статті (за ID)
router.get('/articles/:id', async (req, res) => {
  try {
    const KnowledgeBase = require('../models/KnowledgeBase');
    const article = await KnowledgeBase.findById(req.params.id)
      .populate('createdBy', 'email firstName lastName');
    
    if (!article) {
      return res.status(404).json({ success: false, message: 'Статтю не знайдено' });
    }
    
    // Інкремент переглядів
    article.views = (article.views || 0) + 1;
    await article.save({ validateBeforeSave: false }); // Пропускаємо валідацію для швидкості
    
    res.json({ success: true, data: article });
  } catch (error) {
    logger.error('Error fetching article:', error);
    res.status(500).json({ success: false, message: 'Помилка отримання статті' });
  }
});

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
