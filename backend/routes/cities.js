const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');
const cityController = require('../controllers/cityController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const logger = require('../utils/logger');

// Валідація для створення міста
const createCityValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Назва міста повинна містити від 2 до 100 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ\s\-']+$/)
    .withMessage('Назва міста може містити тільки літери, пробіли, дефіси та апострофи'),
  body('region')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Назва регіону повинна містити від 2 до 100 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ\s\-']+$/)
    .withMessage('Назва регіону може містити тільки літери, пробіли, дефіси та апострофи'),
  body('coordinates')
    .optional()
    .isObject()
    .withMessage('Координати повинні бути об\'єктом'),
  body('coordinates.lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Широта повинна бути числом від -90 до 90'),
  body('coordinates.lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Довгота повинна бути числом від -180 до 180'),
  body('population')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Населення повинно бути позитивним числом'),
  body('area')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Площа повинна бути позитивним числом'),
  body('timezone')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Часовий пояс повинен містити від 3 до 50 символів'),
  body('postalCode')
    .optional()
    .trim()
    .matches(/^\d{5}$/)
    .withMessage('Поштовий індекс повинен містити 5 цифр'),
  body('phoneCode')
    .optional()
    .trim()
    .matches(/^\d{2,4}$/)
    .withMessage('Телефонний код повинен містити від 2 до 4 цифр'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive повинен бути boolean')
];

// Валідація для оновлення міста
const updateCityValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Назва міста повинна містити від 2 до 100 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ\s\-']+$/)
    .withMessage('Назва міста може містити тільки літери, пробіли, дефіси та апострофи'),
  body('region')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Назва регіону повинна містити від 2 до 100 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ\s\-']+$/)
    .withMessage('Назва регіону може містити тільки літери, пробіли, дефіси та апострофи'),
  body('coordinates')
    .optional()
    .isObject()
    .withMessage('Координати повинні бути об\'єктом'),
  body('coordinates.lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Широта повинна бути числом від -90 до 90'),
  body('coordinates.lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Довгота повинна бути числом від -180 до 180'),
  body('population')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Населення повинно бути позитивним числом'),
  body('area')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Площа повинна бути позитивним числом'),
  body('timezone')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Часовий пояс повинен містити від 3 до 50 символів'),
  body('postalCode')
    .optional()
    .trim()
    .matches(/^\d{5}$/)
    .withMessage('Поштовий індекс повинен містити 5 цифр'),
  body('phoneCode')
    .optional()
    .trim()
    .matches(/^\d{2,4}$/)
    .withMessage('Телефонний код повинен містити від 2 до 4 цифр'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive повинен бути boolean')
];

// Валідація параметрів запиту
const queryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Сторінка повинна бути позитивним числом'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Ліміт повинен бути від 1 до 100'),
  query('sortBy')
    .optional()
    .isIn(['name', 'region', 'population', 'area', 'createdAt', 'updatedAt'])
    .withMessage('Невірне поле для сортування'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Порядок сортування повинен бути asc або desc'),
  query('region')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Регіон повинен містити мінімум 2 символи'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Пошуковий запит повинен містити мінімум 2 символи'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive повинен бути boolean'),
  query('minPopulation')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Мінімальне населення повинно бути позитивним числом'),
  query('maxPopulation')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Максимальне населення повинно бути позитивним числом')
];

// Валідація ID параметрів
const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Невірний ID міста')
];

// ОСНОВНІ МАРШРУТИ ДЛЯ МІСТ

// Отримати всі міста
router.get('/', authenticateToken, queryValidation, cityController.getAllCities);

// Отримати місто за ID
router.get('/:id', authenticateToken, idValidation, cityController.getCityById);

// Створити нове місто (тільки адміни)
router.post('/', authenticateToken, adminAuth, createCityValidation, cityController.createCity);

// Оновити місто (тільки адміни)
router.put('/:id', authenticateToken, adminAuth, idValidation, updateCityValidation, cityController.updateCity);

// Видалити місто (тільки адміни)
router.delete('/:id', authenticateToken, adminAuth, idValidation, cityController.deleteCity);

// ДОДАТКОВІ МАРШРУТИ

// Пошук міст
router.get('/search/query', authenticateToken, [
  query('q')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Пошуковий запит повинен містити мінімум 2 символи'),
  ...queryValidation
], cityController.searchCities);

// Отримати список регіонів
router.get('/regions/list', authenticateToken, cityController.getRegions);

// Отримати міста за регіоном
router.get('/region/:region', authenticateToken, [
  param('region')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Назва регіону повинна містити мінімум 2 символи'),
  ...queryValidation
], cityController.getCitiesByRegion);

// Отримати статистику міст (тільки адміни)
router.get('/statistics/overview', authenticateToken, adminAuth, cityController.getCityStatistics);

// Експорт міст (тільки адміни)
router.get('/export/data', authenticateToken, adminAuth, [
  query('format')
    .optional()
    .isIn(['csv', 'excel'])
    .withMessage('Формат повинен бути csv або excel'),
  query('includeInactive')
    .optional()
    .isBoolean()
    .withMessage('includeInactive повинен бути boolean'),
  query('includeStatistics')
    .optional()
    .isBoolean()
    .withMessage('includeStatistics повинен бути boolean')
], cityController.exportCities);

// Масове оновлення міст (тільки адміни)
router.patch('/bulk/update', authenticateToken, adminAuth, [
  body('cityIds')
    .isArray({ min: 1 })
    .withMessage('cityIds повинен бути непустим масивом'),
  body('cityIds.*')
    .isMongoId()
    .withMessage('Кожен ID міста повинен бути валідним'),
  body('updates')
    .isObject()
    .withMessage('updates повинен бути об\'єктом'),
  body('updates.region')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Назва регіону повинна містити від 2 до 100 символів'),
  body('updates.isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive повинен бути boolean'),
  body('updates.timezone')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Часовий пояс повинен містити від 3 до 50 символів')
], cityController.bulkUpdateCities);

// Масове видалення міст (тільки адміни)
router.delete('/bulk/delete', authenticateToken, adminAuth, [
  body('cityIds')
    .isArray({ min: 1 })
    .withMessage('cityIds повинен бути непустим масивом'),
  body('cityIds.*')
    .isMongoId()
    .withMessage('Кожен ID міста повинен бути валідним')
], cityController.bulkDeleteCities);

// Активувати/деактивувати місто (тільки адміни)
router.patch('/:id/toggle-status', authenticateToken, adminAuth, idValidation, cityController.toggleCityStatus);

// Отримати користувачів міста
router.get('/:id/users', authenticateToken, [
  ...idValidation,
  ...queryValidation
], cityController.getCityUsers);

// Отримати тикети міста
router.get('/:id/tickets', authenticateToken, [
  ...idValidation,
  ...queryValidation,
  query('status')
    .optional()
    .isIn(['open', 'in_progress', 'resolved', 'closed'])
    .withMessage('Невірний статус тикету'),
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Невірний пріоритет тикету'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Початкова дата повинна бути в форматі ISO8601'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Кінцева дата повинна бути в форматі ISO8601')
], cityController.getCityTickets);

// Отримати статистику міста
router.get('/:id/statistics', authenticateToken, idValidation, cityController.getCityDetailedStatistics);

// Імпорт міст з файлу (тільки адміни)
router.post('/import/data', authenticateToken, adminAuth, [
  body('format')
    .isIn(['csv', 'excel', 'json'])
    .withMessage('Формат повинен бути csv, excel або json'),
  body('data')
    .isArray({ min: 1 })
    .withMessage('Дані повинні бути непустим масивом'),
  body('overwrite')
    .optional()
    .isBoolean()
    .withMessage('overwrite повинен бути boolean'),
  body('validateOnly')
    .optional()
    .isBoolean()
    .withMessage('validateOnly повинен бути boolean')
], cityController.importCities);

// Валідація даних міст (тільки адміни)
router.post('/validate/data', authenticateToken, adminAuth, [
  body('cities')
    .isArray({ min: 1 })
    .withMessage('cities повинен бути непустим масивом'),
  body('cities.*.name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Назва міста повинна містити від 2 до 100 символів'),
  body('cities.*.region')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Назва регіону повинна містити від 2 до 100 символів')
], cityController.validateCityData);

// Отримати найближчі міста
router.get('/:id/nearby', authenticateToken, [
  ...idValidation,
  query('radius')
    .optional()
    .isFloat({ min: 1, max: 1000 })
    .withMessage('Радіус повинен бути від 1 до 1000 км'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Ліміт повинен бути від 1 до 50')
], cityController.getNearbyCities);

// Отримати міста з координатами для карти
router.get('/map/coordinates', authenticateToken, [
  query('bounds')
    .optional()
    .isObject()
    .withMessage('bounds повинен бути об\'єктом'),
  query('zoom')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Zoom повинен бути від 1 до 20')
], cityController.getCitiesForMap);

// Синхронізація з зовнішніми джерелами (тільки адміни)
router.post('/sync/external', authenticateToken, adminAuth, [
  body('source')
    .isIn(['government', 'openstreetmap', 'geonames'])
    .withMessage('Джерело повинно бути government, openstreetmap або geonames'),
  body('updateExisting')
    .optional()
    .isBoolean()
    .withMessage('updateExisting повинен бути boolean'),
  body('addNew')
    .optional()
    .isBoolean()
    .withMessage('addNew повинен бути boolean')
], cityController.syncWithExternalSource);

// Отримати історію змін міста (тільки адміни)
router.get('/:id/history', authenticateToken, adminAuth, [
  ...idValidation,
  ...queryValidation
], cityController.getCityHistory);

// Відновити видалене місто (тільки адміни)
router.post('/:id/restore', authenticateToken, adminAuth, idValidation, cityController.restoreCity);

// Простий ендпоінт для отримання списку міст (для Telegram бота та фронтенду)
router.get('/simple/list', async (req, res) => {
  try {
    const City = require('../models/City');
    
    const cities = await City.find({ isActive: { $ne: false } })
      .select('_id name region')
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      data: cities.map(city => ({
        id: city._id,
        name: city.name,
        region: city.region
      }))
    });
  } catch (error) {
    logger.error('Помилка отримання списку міст:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні списку міст'
    });
  }
});

module.exports = router;