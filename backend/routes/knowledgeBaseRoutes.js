const express = require('express');
const router = express.Router();
const knowledgeBaseController = require('../controllers/knowledgeBaseController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Всі маршрути захищені
router.use(protect);

// Отримання списку документів
router.get('/', knowledgeBaseController.getAllDocuments);

// Завантаження нового документа (тільки адміни та менеджери)
router.post('/upload', authorize('admin', 'manager'), upload.single('file'), knowledgeBaseController.uploadDocument);

// Видалення документа (тільки адміни)
router.delete('/:id', authorize('admin'), knowledgeBaseController.deleteDocument);

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
