const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Імпорт всіх роутерів
const authRoutes = require('./auth');
const userRoutes = require('./users');
const ticketRoutes = require('./tickets');
const commentRoutes = require('./comments');
const cityRoutes = require('./cities');
const positionRoutes = require('./positions');
const analyticsRoutes = require('./analytics');
const telegramRoutes = require('./telegram');
const uploadRoutes = require('./upload');
const tagRoutes = require('./tags');
const notificationRoutes = require('./notifications');
const activeDirectoryRoutes = require('./activeDirectory');
const quickTipRoutes = require('./quickTips');
const ticketTemplateRoutes = require('./ticketTemplates');
const categoryRoutes = require('./categories');
const ratingRoutes = require('./ratings');


// Middleware для логування запитів
router.use((req, res, next) => {
  logger.info(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Підключення маршрутів з префіксами

// Аутентифікація та авторизація
router.use('/auth', authRoutes);

// Користувачі
router.use('/users', userRoutes);

// Тикети
router.use('/tickets', ticketRoutes);

// Коментарі
router.use('/comments', commentRoutes);

// Міста
router.use('/cities', cityRoutes);

// Посади
router.use('/positions', positionRoutes);

// Аналітика
router.use('/analytics', analyticsRoutes);

// Telegram інтеграція
router.use('/telegram', telegramRoutes);

// Завантаження файлів
router.use('/upload', uploadRoutes);

// Теги
router.use('/tags', tagRoutes);

// Сповіщення
router.use('/notifications', notificationRoutes);

// Active Directory
router.use('/active-directory', activeDirectoryRoutes);

// Швидкі поради
router.use('/quick-tips', quickTipRoutes);

// Шаблони тикетів
router.use('/ticket-templates', ticketTemplateRoutes);

// Категорії
router.use('/categories', categoryRoutes);

// Рейтинги
router.use('/ratings', ratingRoutes);



// Головна сторінка API
router.get('/', (req, res) => {
  res.json({
    message: 'Help Desk API',
    version: '1.0.0',
    status: 'active',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      tickets: '/api/tickets',
      comments: '/api/comments',
      cities: '/api/cities',
      positions: '/api/positions',
      analytics: '/api/analytics',
      telegram: '/api/telegram',
      upload: '/api/upload',
      notifications: '/api/notifications',
      activeDirectory: '/api/active-directory',
      quickTips: '/api/quick-tips',
      ticketTemplates: '/api/ticket-templates',
      categories: '/api/categories',
      ratings: '/api/ratings',
      knowledgeBase: '/api/knowledge-base'
    },
    documentation: '/api/docs'
  });
});

// Перевірка здоров'я системи
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
});

// Статус сервісів
router.get('/status', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    
    const status = {
      api: 'operational',
      database: mongoose.connection.readyState === 1 ? 'operational' : 'down',
      timestamp: new Date().toISOString(),
      services: {
        authentication: 'operational',
        tickets: 'operational',
        analytics: 'operational',
        telegram: 'operational',
        notifications: 'operational'
      }
    };
    
    // Перевірка підключення до бази даних
    if (mongoose.connection.readyState !== 1) {
      status.api = 'degraded';
    }
    
    res.json(status);
  } catch (error) {
    res.status(500).json({
      api: 'down',
      database: 'unknown',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Метрики для моніторингу
router.get('/metrics', (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    version: {
      node: process.version,
      app: '1.0.0'
    },
    environment: process.env.NODE_ENV || 'development'
  };
  
  res.json(metrics);
});

// Обробка неіснуючих маршрутів
router.use('*', (req, res) => {
  res.status(404).json({
    message: 'Маршрут не знайдено',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      '/api/auth',
      '/api/users',
      '/api/tickets',
      '/api/comments',
      '/api/cities',
      '/api/positions',
      '/api/analytics',
      '/api/telegram',
      '/api/upload',
      '/api/notifications'
    ]
  });
});

// Глобальна обробка помилок
router.use((error, req, res, next) => {
  logger.error('Глобальна помилка API:', error);
  
  // Логування помилки
  const errorLog = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    error: error.message,
    stack: error.stack,
    user: req.user ? req.user.id : 'anonymous'
  };
  
  logger.error('Error Log:', errorLog);
  
  // Відповідь клієнту
  const response = {
    message: 'Внутрішня помилка сервера',
    timestamp: new Date().toISOString(),
    path: req.originalUrl
  };
  
  // Додаткова інформація в режимі розробки
  if (process.env.NODE_ENV === 'development') {
    response.error = error.message;
    response.stack = error.stack;
  }
  
  res.status(error.status || 500).json(response);
});

module.exports = router;