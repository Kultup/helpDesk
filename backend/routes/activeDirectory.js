const express = require('express');
const router = express.Router();
const activeDirectoryController = require('../controllers/activeDirectoryController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Всі маршрути потребують аутентифікації та адміністраторських прав
router.use(authenticateToken);
router.use(adminAuth);

// GET /api/ad/users - отримати всіх користувачів
router.get('/users', activeDirectoryController.getUsers);

// GET /api/ad/computers - отримати всі комп'ютери
router.get('/computers', activeDirectoryController.getComputers);

// GET /api/ad/users/search/:username - пошук користувача
router.get('/users/search/:username', activeDirectoryController.searchUser);

// GET /api/ad/test - тестування підключення
router.get('/test', activeDirectoryController.testConnection);

// GET /api/ad/statistics - статистика AD
router.get('/statistics', activeDirectoryController.getStatistics);

module.exports = router;