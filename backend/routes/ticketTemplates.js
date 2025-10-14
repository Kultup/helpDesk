const express = require('express');
const router = express.Router();
const {
  getTicketTemplates,
  getTicketTemplateById,
  createTicketTemplate,
  updateTicketTemplate,
  deleteTicketTemplate,
  useTicketTemplate,
  getPopularTicketTemplates,
  getTicketTemplatesByCategory,
  getTemplatesForTelegram
} = require('../controllers/ticketTemplateController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Публічні маршрути (доступні всім користувачам)
router.get('/', authenticateToken, getTicketTemplates);
router.get('/popular', authenticateToken, getPopularTicketTemplates);
router.get('/telegram/:id', getTicketTemplateById); // Без авторизації для Telegram бота
router.get('/telegram', getTemplatesForTelegram); // Без авторизації для Telegram бота
router.get('/category/:categoryId', authenticateToken, getTicketTemplatesByCategory);
router.get('/:id', authenticateToken, getTicketTemplateById);

// Маршрути для використання шаблонів
router.post('/:id/use', authenticateToken, useTicketTemplate);

// Адміністративні маршрути (тільки для адміністраторів)
router.post('/', authenticateToken, adminAuth, createTicketTemplate);
router.put('/:id', authenticateToken, adminAuth, updateTicketTemplate);
router.delete('/:id', authenticateToken, adminAuth, deleteTicketTemplate);

module.exports = router;