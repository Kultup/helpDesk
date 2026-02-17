const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const Joi = require('joi');
const Institution = require('../models/Institution');
const institutionController = require('../controllers/institutionController');
const { authenticateToken, requirePermission, logUserAction } = require('../middleware/auth');
const logger = require('../utils/logger');

// Схеми валідації
const createInstitutionSchema = Joi.object({
  name: Joi.string().min(1).max(200).required().messages({
    'string.empty': 'Назва закладу не може бути порожньою',
    'any.required': "Назва закладу є обов'язковою",
  }),
  nameEn: Joi.string().max(200).allow('').optional(),
  type: Joi.string()
    .valid(
      'school',
      'university',
      'hospital',
      'clinic',
      'library',
      'museum',
      'theater',
      'cinema',
      'restaurant',
      'cafe',
      'hotel',
      'bank',
      'post_office',
      'police_station',
      'fire_station',
      'government',
      'court',
      'embassy',
      'shopping_center',
      'market',
      'pharmacy',
      'gas_station',
      'transport_hub',
      'airport',
      'train_station',
      'other'
    )
    .optional(),
  description: Joi.string().allow('').optional(),
  address: Joi.object({
    street: Joi.string().allow('').optional(),
    city: Joi.string().allow('').optional(),
    postalCode: Joi.string().allow('').optional(),
    district: Joi.string().allow('').optional(),
  }).optional(),
  coordinates: Joi.object({
    lat: Joi.number().optional(),
    lng: Joi.number().optional(),
  }).optional(),
  contact: Joi.object({
    phone: Joi.string().allow('').optional(),
    email: Joi.string().email().allow('').optional(),
    website: Joi.string().uri().allow('').optional(),
    fax: Joi.string().allow('').optional(),
  }).optional(),
  capacity: Joi.number().min(0).optional(),
  isActive: Joi.boolean().optional(),
  isPublic: Joi.boolean().optional(),
  isVerified: Joi.boolean().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
});

const updateInstitutionSchema = Joi.object({
  name: Joi.string().max(200).optional(),
  nameEn: Joi.string().max(200).allow('').optional(),
  type: Joi.string()
    .valid(
      'school',
      'university',
      'hospital',
      'clinic',
      'library',
      'museum',
      'theater',
      'cinema',
      'restaurant',
      'cafe',
      'hotel',
      'bank',
      'post_office',
      'police_station',
      'fire_station',
      'government',
      'court',
      'embassy',
      'shopping_center',
      'market',
      'pharmacy',
      'gas_station',
      'transport_hub',
      'airport',
      'train_station',
      'other'
    )
    .optional(),
  typeEn: Joi.string()
    .valid(
      'school',
      'university',
      'hospital',
      'clinic',
      'library',
      'museum',
      'theater',
      'cinema',
      'restaurant',
      'cafe',
      'hotel',
      'bank',
      'post_office',
      'police_station',
      'fire_station',
      'government',
      'court',
      'embassy',
      'shopping_center',
      'market',
      'pharmacy',
      'gas_station',
      'transport_hub',
      'airport',
      'train_station',
      'other'
    )
    .optional(),
  description: Joi.string().max(1000).allow('').optional(),
  descriptionEn: Joi.string().max(1000).allow('').optional(),
  address: Joi.object({
    street: Joi.string().max(200).allow('').optional().messages({
      'string.max': 'Адреса не може перевищувати 200 символів',
    }),
    streetEn: Joi.string().max(200).allow('').optional(),
    city: Joi.string().allow(null).optional(),
    postalCode: Joi.string()
      .pattern(/^\d{5}$/)
      .allow('')
      .optional()
      .messages({
        'string.pattern.base': 'Поштовий індекс повинен містити 5 цифр',
      }),
    district: Joi.string().max(100).allow('').optional(),
    districtEn: Joi.string().max(100).allow('').optional(),
  }).optional(),
  coordinates: Joi.object({
    lat: Joi.number().min(-90).max(90).optional().messages({
      'number.min': 'Широта повинна бути між -90 та 90',
      'number.max': 'Широта повинна бути між -90 та 90',
    }),
    lng: Joi.number().min(-180).max(180).optional().messages({
      'number.min': 'Довгота повинна бути між -180 та 180',
      'number.max': 'Довгота повинна бути між -180 та 180',
    }),
  }).optional(),
  contact: Joi.object({
    phone: Joi.string()
      .pattern(/^\+?[1-9]\d{1,14}$/)
      .optional()
      .messages({
        'string.pattern.base': 'Невірний формат номера телефону',
      }),
    email: Joi.string().email().optional().messages({
      'string.email': 'Невірний формат email',
    }),
    website: Joi.string().uri().optional().messages({
      'string.uri': 'Невірний формат веб-сайту',
    }),
    fax: Joi.string()
      .pattern(/^\+?[1-9]\d{1,14}$/)
      .optional()
      .messages({
        'string.pattern.base': 'Невірний формат номера факсу',
      }),
  }).optional(),
  workingHours: Joi.object()
    .pattern(
      Joi.string().valid(
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday'
      ),
      Joi.object({
        open: Joi.string()
          .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
          .optional(),
        close: Joi.string()
          .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
          .optional(),
        closed: Joi.boolean().default(false),
      })
    )
    .optional(),
  capacity: Joi.number().min(0).optional(),
  services: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().max(100).required(),
        nameEn: Joi.string().max(100).optional(),
        description: Joi.string().max(300).optional(),
        price: Joi.number().min(0).optional(),
        currency: Joi.string().valid('UAH', 'USD', 'EUR').default('UAH'),
      })
    )
    .optional(),
  tags: Joi.array().items(Joi.string().max(50)).optional(),
  isActive: Joi.boolean().optional(),
  isPublic: Joi.boolean().optional(),
  isVerified: Joi.boolean().optional(),
});

// Валідація Joi middleware
const validateJoi = schema => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
    }
    next();
  };
};

// Маршрути

// Публічний доступ до закладів (без автентифікації)
router.get('/public', async (req, res) => {
  try {
    // Валідація query параметрів
    const validationRules = [
      query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Сторінка повинна бути позитивним числом'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('Ліміт повинен бути від 1 до 1000'),
      query('type')
        .optional()
        .isIn([
          'school',
          'university',
          'hospital',
          'clinic',
          'library',
          'museum',
          'theater',
          'cinema',
          'restaurant',
          'cafe',
          'hotel',
          'bank',
          'post_office',
          'police_station',
          'fire_station',
          'government',
          'court',
          'embassy',
          'shopping_center',
          'market',
          'pharmacy',
          'gas_station',
          'transport_hub',
          'airport',
          'train_station',
          'other',
        ])
        .withMessage('Невірний тип закладу'),
      query('city').optional().isMongoId().withMessage('Невірний ID міста'),
      query('sortBy')
        .optional()
        .isIn(['name', 'type', 'createdAt', 'rating.average'])
        .withMessage('Невірне поле сортування'),
      query('sortOrder')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Порядок сортування повинен бути asc або desc'),
      query('lat')
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage('Широта повинна бути від -90 до 90'),
      query('lng')
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage('Довгота повинна бути від -180 до 180'),
      query('radius')
        .optional()
        .isFloat({ min: 0.1, max: 100 })
        .withMessage('Радіус повинен бути від 0.1 до 100 км'),
    ];

    // Виконуємо валідацію
    await Promise.all(validationRules.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації параметрів',
        errors: errors.array(),
      });
    }

    // Публічний доступ - показуємо тільки активні та публічні заклади
    const filters = {
      isActive: true,
      isPublic: true,
    };

    const {
      page = 1,
      limit = 20,
      type,
      city,
      sortBy = 'name',
      sortOrder = 'asc',
      lat,
      lng,
      radius,
      search,
    } = req.query;

    if (type) {
      filters.type = type;
    }
    if (city) {
      filters['address.city'] = city;
      logger.info(`🔍 Фільтруємо заклади по місту: ${city}`);
    }
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { nameEn: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    logger.info(`📋 Фільтри для пошуку закладів:`, JSON.stringify(filters));

    let institutionQuery = Institution.find(filters)
      .populate('address.city', 'name nameEn')
      .select('-__v -createdAt -updatedAt');

    // Геолокаційний пошук
    if (lat && lng && radius) {
      const radiusInRadians = parseFloat(radius) / 6371; // Конвертуємо км в радіани
      institutionQuery = institutionQuery.where('coordinates').near({
        center: [parseFloat(lng), parseFloat(lat)],
        maxDistance: radiusInRadians,
        spherical: true,
      });
    }

    // Сортування
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    institutionQuery = institutionQuery.sort(sortOptions);

    // Пагінація
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const institutions = await institutionQuery.skip(skip).limit(parseInt(limit));

    // Підрахунок загальної кількості
    const total = await Institution.countDocuments(filters);

    logger.info(`📊 Знайдено ${institutions.length} закладів (всього: ${total})`);
    if (city) {
      logger.info(
        `🏙️ Заклади для міста ${city}:`,
        institutions.map(i => ({ id: i._id, name: i.name, city: i.address?.city }))
      );
    }

    res.json({
      success: true,
      data: institutions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Error fetching public institutions:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні закладів',
      error: error.message,
    });
  }
});

// Отримати всі заклади (з автентифікацією)
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Валідація query параметрів
    const validationRules = [
      query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Сторінка повинна бути позитивним числом'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('Ліміт повинен бути від 1 до 1000'),
      query('type')
        .optional()
        .isIn([
          'school',
          'university',
          'hospital',
          'clinic',
          'library',
          'museum',
          'theater',
          'cinema',
          'restaurant',
          'cafe',
          'hotel',
          'bank',
          'post_office',
          'police_station',
          'fire_station',
          'government',
          'court',
          'embassy',
          'shopping_center',
          'market',
          'pharmacy',
          'gas_station',
          'transport_hub',
          'airport',
          'train_station',
          'other',
        ])
        .withMessage('Невірний тип закладу'),
      query('city').optional().isMongoId().withMessage('Невірний ID міста'),
      query('isVerified').optional().isBoolean().withMessage('isVerified повинен бути boolean'),
      query('isPublic').optional().isBoolean().withMessage('isPublic повинен бути boolean'),
      query('sortBy')
        .optional()
        .isIn(['name', 'type', 'createdAt', 'rating.average'])
        .withMessage('Невірне поле сортування'),
      query('sortOrder')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Порядок сортування повинен бути asc або desc'),
      query('lat')
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage('Широта повинна бути від -90 до 90'),
      query('lng')
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage('Довгота повинна бути від -180 до 180'),
      query('radius')
        .optional()
        .isFloat({ min: 0.1, max: 100 })
        .withMessage('Радіус повинен бути від 0.1 до 100 км'),
    ];

    // Виконуємо валідацію
    await Promise.all(validationRules.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації параметрів',
        errors: errors.array(),
      });
    }

    await institutionController.getAllInstitutions(req, res);
  } catch (error) {
    logger.error('Error in institutions route:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message,
    });
  }
});

// Експорт закладів
router.get(
  '/export',
  authenticateToken,
  requirePermission('manage_institutions'),
  [
    query('format')
      .optional()
      .isIn(['csv', 'excel'])
      .withMessage('Формат повинен бути csv або excel'),
    query('type')
      .optional()
      .isIn([
        'school',
        'university',
        'hospital',
        'clinic',
        'library',
        'museum',
        'theater',
        'cinema',
        'restaurant',
        'cafe',
        'hotel',
        'bank',
        'post_office',
        'police_station',
        'fire_station',
        'government',
        'court',
        'embassy',
        'shopping_center',
        'market',
        'pharmacy',
        'gas_station',
        'transport_hub',
        'airport',
        'train_station',
        'other',
      ])
      .withMessage('Невірний тип закладу'),
    query('city').optional().isMongoId().withMessage('Невірний ID міста'),
  ],
  institutionController.exportInstitutions
);

// Отримати статистику закладів
router.get(
  '/statistics',
  authenticateToken,
  requirePermission('view_analytics'),
  [
    query('type')
      .optional()
      .isIn([
        'school',
        'university',
        'hospital',
        'clinic',
        'library',
        'museum',
        'theater',
        'cinema',
        'restaurant',
        'cafe',
        'hotel',
        'bank',
        'post_office',
        'police_station',
        'fire_station',
        'government',
        'court',
        'embassy',
        'shopping_center',
        'market',
        'pharmacy',
        'gas_station',
        'transport_hub',
        'airport',
        'train_station',
        'other',
      ])
      .withMessage('Невірний тип закладу'),
    query('city').optional().isMongoId().withMessage('Невірний ID міста'),
    query('period')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Період повинен бути від 1 до 365 днів'),
  ],
  institutionController.getInstitutionStatistics
);

// Отримати типи закладів
router.get('/types', authenticateToken, institutionController.getInstitutionTypes);

// Пошук закладів
router.get(
  '/search',
  authenticateToken,
  [
    query('query')
      .isLength({ min: 2 })
      .withMessage('Пошуковий запит повинен містити принаймні 2 символи'),
    query('type')
      .optional()
      .isIn([
        'school',
        'university',
        'hospital',
        'clinic',
        'library',
        'museum',
        'theater',
        'cinema',
        'restaurant',
        'cafe',
        'hotel',
        'bank',
        'post_office',
        'police_station',
        'fire_station',
        'government',
        'court',
        'embassy',
        'shopping_center',
        'market',
        'pharmacy',
        'gas_station',
        'transport_hub',
        'airport',
        'train_station',
        'other',
      ])
      .withMessage('Невірний тип закладу'),
    query('city').optional().isMongoId().withMessage('Невірний ID міста'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Ліміт повинен бути від 1 до 50'),
    query('lat')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Широта повинна бути від -90 до 90'),
    query('lng')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Довгота повинна бути від -180 до 180'),
    query('radius')
      .optional()
      .isFloat({ min: 0.1, max: 50 })
      .withMessage('Радіус повинен бути від 0.1 до 50 км'),
  ],
  institutionController.searchInstitutions
);

// Отримати заклади поблизу
router.get(
  '/nearby',
  authenticateToken,
  [
    query('lat')
      .isFloat({ min: -90, max: 90 })
      .withMessage("Широта є обов'язковою та повинна бути від -90 до 90"),
    query('lng')
      .isFloat({ min: -180, max: 180 })
      .withMessage("Довгота є обов'язковою та повинна бути від -180 до 180"),
    query('radius')
      .optional()
      .isFloat({ min: 0.1, max: 100 })
      .withMessage('Радіус повинен бути від 0.1 до 100 км'),
    query('type')
      .optional()
      .isIn([
        'school',
        'university',
        'hospital',
        'clinic',
        'library',
        'museum',
        'theater',
        'cinema',
        'restaurant',
        'cafe',
        'hotel',
        'bank',
        'post_office',
        'police_station',
        'fire_station',
        'government',
        'court',
        'embassy',
        'shopping_center',
        'market',
        'pharmacy',
        'gas_station',
        'transport_hub',
        'airport',
        'train_station',
        'other',
      ])
      .withMessage('Невірний тип закладу'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Ліміт повинен бути від 1 до 50'),
  ],
  institutionController.getNearbyInstitutions
);

// Простий список закладів (для селектів) - ВАЖЛИВО: має бути перед /:id
router.get('/simple/list', async (req, res) => {
  try {
    const { type, city, limit = 100 } = req.query;

    const filters = { isActive: true, isPublic: true };
    if (type) {
      filters.type = type;
    }
    if (city) {
      filters['address.city'] = city;
    }

    const institutions = await Institution.find(filters)
      .select('name nameEn type address.city')
      .populate('address.city', 'name nameEn')
      .limit(parseInt(limit))
      .sort({ name: 1 });

    res.json({
      success: true,
      data: institutions,
    });
  } catch (error) {
    logger.error('Error fetching simple institutions list:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні списку закладів',
      error: error.message,
    });
  }
});

// Отримати заклад за ID
router.get(
  '/:id',
  authenticateToken,
  [
    param('id').isMongoId().withMessage('ID закладу повинен бути валідним'),
    query('withStatistics')
      .optional()
      .isBoolean()
      .withMessage('withStatistics повинен бути boolean'),
  ],
  institutionController.getInstitutionById
);

// Отримати статистику конкретного закладу
router.get(
  '/:id/statistics',
  authenticateToken,
  [param('id').isMongoId().withMessage('ID закладу повинен бути валідним')],
  async (req, res) => {
    try {
      const { id } = req.params;
      const institution = await Institution.findById(id);

      if (!institution) {
        return res.status(404).json({
          success: false,
          message: 'Заклад не знайдено',
        });
      }

      await institution.updateStatistics();

      res.json({
        success: true,
        data: institution.statistics,
      });
    } catch (error) {
      logger.error('Error fetching institution statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка при отриманні статистики закладу',
        error: error.message,
      });
    }
  }
);

// Створити новий заклад
router.post(
  '/',
  authenticateToken,
  requirePermission('manage_institutions'),
  validateJoi(createInstitutionSchema),
  logUserAction('створив заклад'),
  institutionController.createInstitution
);

// Оновити заклад
router.put(
  '/:id',
  authenticateToken,
  requirePermission('manage_institutions'),
  [param('id').isMongoId().withMessage('ID закладу повинен бути валідним')],
  validateJoi(updateInstitutionSchema),
  logUserAction('оновив заклад'),
  institutionController.updateInstitution
);

// Видалити заклад
router.delete(
  '/:id',
  authenticateToken,
  requirePermission('manage_institutions'),
  [param('id').isMongoId().withMessage('ID закладу повинен бути валідним')],
  logUserAction('видалив заклад'),
  institutionController.deleteInstitution
);

// Активувати/деактивувати заклад
router.patch(
  '/:id/toggle-active',
  authenticateToken,
  requirePermission('manage_institutions'),
  [param('id').isMongoId().withMessage('ID закладу повинен бути валідним')],
  logUserAction('змінив статус активності закладу'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const institution = await Institution.findById(id);
      if (!institution) {
        return res.status(404).json({
          success: false,
          message: 'Заклад не знайдено',
        });
      }

      institution.isActive = !institution.isActive;
      institution.lastModifiedBy = req.user.id;
      await institution.save();

      res.json({
        success: true,
        message: `Заклад ${institution.isActive ? 'активовано' : 'деактивовано'}`,
        data: institution,
      });
    } catch (error) {
      logger.error('Error toggling institution status:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка при зміні статусу закладу',
        error: error.message,
      });
    }
  }
);

// Масове видалення закладів
router.delete(
  '/bulk/delete',
  authenticateToken,
  requirePermission('manage_institutions'),
  [
    body('institutionIds')
      .isArray({ min: 1 })
      .withMessage('institutionIds повинен бути непустим масивом'),
    body('institutionIds.*').isMongoId().withMessage('Кожен ID закладу повинен бути валідним'),
  ],
  logUserAction('масово видалив заклади'),
  institutionController.bulkDeleteInstitutions
);

// Додати послугу до закладу
router.post(
  '/:id/services',
  authenticateToken,
  requirePermission('manage_institutions'),
  [
    param('id').isMongoId().withMessage('ID закладу повинен бути валідним'),
    body('name')
      .isLength({ min: 1, max: 100 })
      .withMessage("Назва послуги є обов'язковою та не може перевищувати 100 символів"),
    body('nameEn')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Англійська назва не може перевищувати 100 символів'),
    body('description')
      .optional()
      .isLength({ max: 300 })
      .withMessage('Опис не може перевищувати 300 символів'),
    body('price').optional().isFloat({ min: 0 }).withMessage("Ціна не може бути від'ємною"),
    body('currency')
      .optional()
      .isIn(['UAH', 'USD', 'EUR'])
      .withMessage('Валюта повинна бути UAH, USD або EUR'),
  ],
  logUserAction('додав послугу до закладу'),
  institutionController.addService
);

// Видалити послугу з закладу
router.delete(
  '/:id/services/:serviceId',
  authenticateToken,
  requirePermission('manage_institutions'),
  [
    param('id').isMongoId().withMessage('ID закладу повинен бути валідним'),
    param('serviceId').isMongoId().withMessage('ID послуги повинен бути валідним'),
  ],
  logUserAction('видалив послугу з закладу'),
  institutionController.removeService
);

module.exports = router;
