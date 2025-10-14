const express = require('express');
const router = express.Router();
const Joi = require('joi');
const ratingController = require('../controllers/ratingController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Локальний валідатор на базі Joi (оскільки validate не експортується з middleware/validation)
const validate = (schema, property = 'body') => (req, res, next) => {
  const data = req[property] || {};
  const { error, value } = schema.validate(data, { abortEarly: false, allowUnknown: true });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Помилки валідації',
      errors: error.details.map(d => ({ field: d.path.join('.'), message: d.message }))
    });
  }
  // Замінюємо валідовані дані (за потреби)
  req[property] = value;
  next();
};

// Схема валідації для створення рейтингу
const createRatingSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required()
    .messages({
      'number.base': 'Рейтинг повинен бути числом',
      'number.integer': 'Рейтинг повинен бути цілим числом',
      'number.min': 'Рейтинг не може бути менше 1',
      'number.max': 'Рейтинг не може бути більше 5',
      'any.required': 'Рейтинг є обов\'язковим полем'
    }),
  

  
  categories: Joi.object({
    speed: Joi.number().integer().min(1).max(5).optional(),
    quality: Joi.number().integer().min(1).max(5).optional(),
    communication: Joi.number().integer().min(1).max(5).optional(),
    professionalism: Joi.number().integer().min(1).max(5).optional()
  }).optional(),
  
  wouldRecommend: Joi.boolean().optional()
});

// Схема валідації для оновлення рейтингу
const updateRatingSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).optional(),

  categories: Joi.object({
    speed: Joi.number().integer().min(1).max(5).optional(),
    quality: Joi.number().integer().min(1).max(5).optional(),
    communication: Joi.number().integer().min(1).max(5).optional(),
    professionalism: Joi.number().integer().min(1).max(5).optional()
  }).optional(),
  wouldRecommend: Joi.boolean().optional()
});

// Створити рейтинг для тікета
// POST /api/ratings/ticket/:ticketId
router.post('/ticket/:ticketId', 
  authenticateToken, 
  validate(createRatingSchema), 
  ratingController.createRating
);

// Отримати рейтинг тікета
// GET /api/ratings/ticket/:ticketId
router.get('/ticket/:ticketId', 
  authenticateToken, 
  ratingController.getRatingByTicket
);

// Отримати всі рейтинги (тільки для адміністраторів)
// GET /api/ratings
router.get('/', 
  authenticateToken, 
  adminAuth, 
  ratingController.getAllRatings
);

// Отримати статистику рейтингів (тільки для адміністраторів)
// GET /api/ratings/stats
router.get('/stats', 
  authenticateToken, 
  adminAuth, 
  ratingController.getRatingStats
);

// Оновити рейтинг
// PUT /api/ratings/:ratingId
router.put('/:ratingId', 
  authenticateToken, 
  validate(updateRatingSchema), 
  ratingController.updateRating
);

// Видалити рейтинг
// DELETE /api/ratings/:ratingId
router.delete('/:ratingId', 
  authenticateToken, 
  ratingController.deleteRating
);

module.exports = router;