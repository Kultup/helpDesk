const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const databaseController = require('../controllers/databaseController');

// Всі роути доступні тільки для адміністраторів
router.use(authenticateToken);
router.use(adminAuth);

// Отримати список всіх колекцій
router.get('/collections', databaseController.getCollections);

// Отримати структуру конкретної колекції
router.get('/collections/:collectionName/structure', databaseController.getCollectionStructure);

// Отримати документи з колекції
router.get('/collections/:collectionName/documents', databaseController.getCollectionDocuments);

// Видалити колекцію (адміністратор)
router.delete('/collections/:collectionName', databaseController.deleteCollection);

module.exports = router;

