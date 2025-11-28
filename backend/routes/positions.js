const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');
const Joi = require('joi');
const Position = require('../models/Position');
const positionController = require('../controllers/positionController');
const { authenticateToken, requirePermission, logUserAction } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const logger = require('../utils/logger');

// Схеми валідації
const createPositionSchema = Joi.object({
  title: Joi.string().max(100).required().messages({
    'string.max': 'Назва посади не може перевищувати 100 символів',
    'any.required': 'Назва посади є обов\'язковою'
  }),
  description: Joi.string().max(500).allow('').optional(),
  department: Joi.string().max(100).required().messages({
    'string.max': 'Назва відділу не може перевищувати 100 символів',
    'any.required': 'Відділ є обов\'язковим'
  }),
  permissions: Joi.array().items(
    Joi.object({
      module: Joi.string().required(),
      actions: Joi.array().items(Joi.string()).required()
    })
  ).optional(),
  responsibilities: Joi.array().items(Joi.string()).optional(),
  requirements: Joi.array().items(Joi.string()).optional(),
  skills: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      level: Joi.string().valid('basic', 'intermediate', 'advanced', 'expert').required(),
      required: Joi.boolean().required()
    })
  ).optional(),
  salary: Joi.object({
    min: Joi.number().min(0).optional(),
    max: Joi.number().min(0).optional(),
    currency: Joi.string().valid('UAH', 'USD', 'EUR').default('UAH')
  }).optional(),
  workSchedule: Joi.object({
    type: Joi.string().valid('full-time', 'part-time', 'contract', 'remote', 'hybrid').required(),
    hoursPerWeek: Joi.number().min(1).max(168).required()
  }).optional(),
  reportingTo: Joi.string().allow('').optional(),
  isActive: Joi.boolean().optional(),
  isPublic: Joi.boolean().optional()
});

const updatePositionSchema = Joi.object({
  title: Joi.string().max(100).optional(),
  description: Joi.string().max(500).allow('').optional(),
  department: Joi.string().max(100).optional(),
  permissions: Joi.array().items(
    Joi.object({
      module: Joi.string().required(),
      actions: Joi.array().items(Joi.string()).required()
    })
  ).optional(),
  responsibilities: Joi.array().items(Joi.string()).optional(),
  requirements: Joi.array().items(Joi.string()).optional(),
  skills: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      level: Joi.string().valid('basic', 'intermediate', 'advanced', 'expert').required(),
      required: Joi.boolean().required()
    })
  ).optional(),
  salary: Joi.object({
    min: Joi.number().min(0).optional(),
    max: Joi.number().min(0).optional(),
    currency: Joi.string().valid('UAH', 'USD', 'EUR').optional()
  }).optional(),
  workSchedule: Joi.object({
    type: Joi.string().valid('full-time', 'part-time', 'contract', 'remote', 'hybrid').required(),
    hoursPerWeek: Joi.number().min(1).max(168).required()
  }).optional(),
  reportingTo: Joi.string().allow('').optional(),
  isActive: Joi.boolean().optional(),
  isPublic: Joi.boolean().optional()
});

// @route   GET /api/positions
// @desc    Отримання списку посад
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      department,
      search,
      isActive,
      sortBy = 'title',
      sortOrder = 'asc'
    } = req.query;

    // Побудова фільтрів
    const filters = {};
    
    logger.info('Query params:', { page, limit, department, search, isActive, sortBy, sortOrder });
    
    if (department) filters.department = department;
    // Якщо isActive не передано, показуємо тільки активні посади
    // Якщо передано 'false', показуємо неактивні
    // Якщо передано 'true' або 'all', показуємо відповідно
    if (isActive === undefined || isActive === 'true') {
      filters.isActive = true;
    } else if (isActive === 'false') {
      filters.isActive = false;
    }
    // Якщо isActive === 'all', не додаємо фільтр
    
    logger.info('Filters:', filters);
    
    // Пошук по назві посади
    if (search) {
      filters.title = { $regex: search, $options: 'i' };
    }

    // Виключаємо посаду "адміністратор системи" для звичайних користувачів
    // Адміністратори мають бачити всі посади
    if (req.user.role !== 'admin') {
      // Додаємо фільтр для виключення посади "адміністратор системи"
      // Використовуємо $not для regex, щоб виключити посади з такою назвою
      filters.$and = filters.$and || [];
      filters.$and.push({
        title: {
          $not: {
            $regex: /адміністратор системи|администратор системы|system administrator/i
          }
        }
      });
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
    };

    let positions = await Position.find(filters)
      .sort(options.sort)
      .limit(options.limit * options.page)
      .skip((options.page - 1) * options.limit);

    // Додаткова фільтрація для звичайних користувачів (на випадок, якщо regex не спрацював)
    if (req.user.role !== 'admin') {
      positions = positions.filter(position => {
        const titleLower = position.title.toLowerCase();
        return !titleLower.includes('адміністратор системи') && 
               !titleLower.includes('администратор системы') &&
               !titleLower.includes('system administrator');
      });
    }

    const total = await Position.countDocuments(filters);

    res.json({
      success: true,
      data: {
        positions,
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          pages: Math.ceil(total / options.limit)
        }
      }
    });

  } catch (error) {
    logger.error('Помилка отримання посад:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера'
    });
  }
});

// @route   GET /api/positions/:id
// @desc    Отримання конкретної посади
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const position = await Position.findById(req.params.id);
    
    if (!position) {
      return res.status(404).json({
        success: false,
        message: 'Посада не знайдена'
      });
    }
    
    // Перевірка, чи звичайний користувач намагається отримати посаду "адміністратор системи"
    if (req.user.role !== 'admin') {
      const titleLower = position.title.toLowerCase();
      const isAdminPosition = titleLower.includes('адміністратор системи') || 
                             titleLower.includes('администратор системы') ||
                             titleLower.includes('system administrator');
      
      if (isAdminPosition) {
        return res.status(403).json({
          success: false,
          message: 'Доступ заборонено'
        });
      }
    }

    res.json({
      success: true,
      data: position
    });

  } catch (error) {
    logger.error('Помилка отримання посади:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера'
    });
  }
});

// @route   GET /api/positions/:id/statistics
// @desc    Отримання статистики посади
// @access  Private
router.get('/:id/statistics', authenticateToken, async (req, res) => {
  try {
    const position = await Position.findById(req.params.id);

    if (!position) {
      return res.status(404).json({
        success: false,
        message: 'Посаду не знайдено'
      });
    }

    const statistics = await position.getStatistics();

    res.json({
      success: true,
      data: {
        position: {
          _id: position._id,
          title: position.title,
          department: position.department
        },
        statistics
      }
    });

  } catch (error) {
    logger.error('Помилка отримання статистики посади:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера'
    });
  }
});

// @route   POST /api/positions
// @desc    Створення нової посади
// @access  Private (Admin only)
router.post('/', 
  authenticateToken,
  requirePermission('manage_positions'),
  logUserAction('створив посаду'),
  async (req, res) => {
    try {
      // Валідація даних
      const { error, value } = createPositionSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message
        });
      }

      // Перевірка унікальності назви
      const existingPosition = await Position.findOne({ title: value.title });
      if (existingPosition) {
        return res.status(400).json({
          success: false,
          message: 'Посада з такою назвою вже існує'
        });
      }

      // Детальне логування для діагностики
      logger.debug('🔍 Оригінальні дані запиту:', JSON.stringify(req.body, null, 2));
    logger.debug('🔍 Валідовані дані:', JSON.stringify(value, null, 2));
    logger.debug('🔍 reportingTo значення:', value.reportingTo);
    logger.debug('🔍 reportingTo тип:', typeof value.reportingTo);

      // Обробка reportingTo - якщо порожній рядок, встановлюємо null
      const processedValue = {
        ...value,
        reportingTo: value.reportingTo && value.reportingTo.trim() !== '' ? value.reportingTo : null
      };

      logger.debug('🔍 Оброблені дані:', JSON.stringify(processedValue, null, 2));

      // Створення посади
      const position = new Position({
        ...processedValue,
        createdBy: req.user._id
      });
      await position.save();

      res.status(201).json({
        success: true,
        message: 'Посаду успішно створено',
        data: position
      });

    } catch (error) {
      logger.error('Помилка створення посади:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера'
      });
    }
  }
);

// @route   PUT /api/positions/:id
// @desc    Оновлення посади
// @access  Private (Admin only)
router.put('/:id', 
  authenticateToken,
  requirePermission('manage_positions'),
  logUserAction('оновив посаду'),
  async (req, res) => {
    try {
      // Валідація даних
      const { error, value } = updatePositionSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message
        });
      }

      const position = await Position.findById(req.params.id);
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Посаду не знайдено'
        });
      }

      // Перевірка унікальності назви (якщо змінюється)
      if (value.title && value.title !== position.title) {
        const existingPosition = await Position.findOne({ title: value.title });
        if (existingPosition) {
          return res.status(400).json({
            success: false,
            message: 'Посада з такою назвою вже існує'
          });
        }
      }

      // Обробка reportingTo - якщо порожній рядок, встановлюємо null
      const processedValue = {
        ...value,
        reportingTo: value.reportingTo !== undefined ? 
          (value.reportingTo && value.reportingTo.trim() !== '' ? value.reportingTo : null) : 
          undefined
      };

      // Оновлення посади
      Object.assign(position, processedValue);
      await position.save();

      res.json({
        success: true,
        message: 'Посаду успішно оновлено',
        data: position
      });

    } catch (error) {
      logger.error('Помилка оновлення посади:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера'
      });
    }
  }
);

// @route   DELETE /api/positions/:id
// @desc    Видалення посади
// @access  Private (Admin only)
router.delete('/:id', 
  authenticateToken,
  requirePermission('manage_positions'),
  logUserAction('видалив посаду'),
  async (req, res) => {
    try {
      const position = await Position.findById(req.params.id);
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Посаду не знайдено'
        });
      }

      // Перевірка чи є користувачі пов'язані з цією посадою
      const User = require('../models/User');
      const userCount = await User.countDocuments({ position: position._id });

      if (userCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Неможливо видалити посаду, оскільки з нею пов\'язані користувачі'
        });
      }

      await position.deleteOne();

      res.json({
        success: true,
        message: 'Посаду успішно видалено'
      });

    } catch (error) {
      logger.error('Помилка видалення посади:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера'
      });
    }
  }
);

// Активувати позицію
router.patch('/:id/activate', 
  authenticateToken,
  requirePermission('manage_positions'),
  [
    param('id')
      .isMongoId()
      .withMessage('ID позиції повинен бути валідним')
  ],
  logUserAction('активував позицію'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const position = await Position.findById(id);
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Позицію не знайдено'
        });
      }

      position.isActive = true;
      position.updatedAt = new Date();
      await position.save();

      res.json({
        success: true,
        message: 'Позицію успішно активовано',
        data: position
      });
    } catch (error) {
      logger.error('Помилка активації позиції:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера при активації позиції'
      });
    }
  }
);

// @route   GET /api/positions/departments/list
// @desc    Отримання списку відділів
// @access  Private
router.get('/departments/list', authenticateToken, async (req, res) => {
  try {
    const departments = await Position.distinct('department', { isActive: true });
    
    res.json({
      success: true,
      data: departments.sort()
    });

  } catch (error) {
    logger.error('Помилка отримання відділів:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера'
    });
  }
});

// @route   DELETE /api/positions/bulk/delete
// @desc    Масове видалення посад
// @access  Private (Admin only)
router.delete('/bulk/delete', 
  authenticateToken,
  requirePermission('manage_positions'),
  [
    body('positionIds')
      .isArray({ min: 1 })
      .withMessage('positionIds повинен бути непустим масивом'),
    body('positionIds.*')
      .isMongoId()
      .withMessage('Кожен ID посади повинен бути валідним')
  ],
  logUserAction('масово видалив посади'),
  positionController.bulkDeletePositions
);

// @route   GET /api/positions/permissions/list
// @desc    Отримання списку доступних дозволів
// @access  Private (Admin only)
router.get('/permissions/list', 
  authenticateToken,
  requirePermission('manage_positions'),
  async (req, res) => {
    try {
      const permissions = [
        {
          module: 'tickets',
          actions: ['create', 'read', 'update', 'delete', 'assign', 'close']
        },
        {
          module: 'users',
          actions: ['create', 'read', 'update', 'delete', 'manage_roles']
        },
        {
          module: 'positions',
          actions: ['create', 'read', 'update', 'delete', 'manage_permissions']
        },
        {
          module: 'analytics',
          actions: ['read', 'export']
        }
      ];

      res.json({
        success: true,
        data: permissions
      });
    } catch (error) {
      logger.error('Помилка отримання списку дозволів:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера при отриманні списку дозволів'
      });
    }
  }
);

// Простий ендпоінт для отримання списку посад (для Telegram бота та фронтенду)
router.get('/simple/list', async (req, res) => {
  try {
    // Виключаємо посаду "адміністратор системи"
    const positions = await Position.find({ 
      isActive: { $ne: false },
      title: {
        $not: {
          $regex: /адміністратор системи|администратор системы|system administrator/i
        }
      }
    })
      .select('_id title department')
      .sort({ title: 1 })
      .lean();

    res.json({
      success: true,
      data: positions.map(pos => ({
        id: pos._id,
        title: pos.title,
        department: pos.department
      }))
    });
  } catch (error) {
    logger.error('Помилка отримання списку посад:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні списку посад'
    });
  }
});

module.exports = router;