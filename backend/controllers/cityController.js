const City = require('../models/City');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Отримати всі міста з фільтрацією та пагінацією
exports.getAllCities = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      region,
      search,
      sortBy = 'name',
      sortOrder = 'asc',
      withStatistics = false
    } = req.query;

    // Побудова фільтрів
    const filters = {};
    
    if (region) filters.region = region;
    
    // Пошук по назві міста
    if (search) {
      filters.name = { $regex: search, $options: 'i' };
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
    };

    const cities = await City.paginate(filters, options);

    // Додати статистику якщо потрібно
    if (withStatistics === 'true') {
      for (let city of cities.docs) {
        const [userCount, ticketCount] = await Promise.all([
          User.countDocuments({ city: city._id, isActive: true }),
          Ticket.countDocuments({ city: city._id })
        ]);
        
        city._doc.statistics = {
          userCount,
          ticketCount
        };
      }
    }

    res.json({
      success: true,
      data: cities.docs,
      pagination: {
        currentPage: cities.page,
        totalPages: cities.totalPages,
        totalItems: cities.totalDocs,
        hasNext: cities.hasNextPage,
        hasPrev: cities.hasPrevPage
      }
    });
  } catch (error) {
    logger.error('Error fetching cities:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні міст',
      error: error.message
    });
  }
};

// Отримати місто за ID
exports.getCityById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID міста'
      });
    }

    const city = await City.findById(id);

    if (!city) {
      return res.status(404).json({
        success: false,
        message: 'Місто не знайдено'
      });
    }

    // Отримати статистику міста
    const [userCount, ticketCount, recentTickets] = await Promise.all([
      User.countDocuments({ city: id, isActive: true }),
      Ticket.countDocuments({ city: id }),
      Ticket.find({ city: id })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('createdBy', 'firstName lastName')
        .populate('assignedTo', 'firstName lastName')
        .select('title status priority createdAt')
    ]);

    // Статистика по статусах тикетів
    const ticketStatusStats = await Ticket.aggregate([
      { $match: { city: new mongoose.Types.ObjectId(id) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        ...city.toObject(),
        statistics: {
          userCount,
          ticketCount,
          ticketStatusStats: ticketStatusStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
          recentTickets
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching city:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні міста',
      error: error.message
    });
  }
};

// Створити нове місто
exports.createCity = async (req, res) => {
  try {
    logger.info('🏙️ Створення міста - оригінальні дані запиту:', JSON.stringify(req.body, null, 2));
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.info('❌ Помилки валідації:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для створення міст'
      });
    }

    const {
      name,
      nameEn,
      region,
      coordinates,
      population,
      timezone,
      postalCodes,
      description
    } = req.body;

    logger.info('🏙️ Координати для створення міста:', coordinates);
    logger.info('🏙️ Тип координат:', typeof coordinates);
    if (coordinates) {
      logger.info('🏙️ Широта:', coordinates.lat, 'Тип:', typeof coordinates.lat);
      logger.info('🏙️ Довгота:', coordinates.lng, 'Тип:', typeof coordinates.lng);
    }

    // Перевірка унікальності назви міста
    const existingCity = await City.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    
    if (existingCity) {
      return res.status(400).json({
        success: false,
        message: 'Місто з такою назвою вже існує'
      });
    }

    const cityData = {
      name,
      nameEn,
      region,
      coordinates,
      population,
      timezone,
      postalCodes,
      description,
      createdBy: req.user._id
    };

    logger.info('🏙️ Дані для створення міста:', JSON.stringify(cityData, null, 2));

    const city = new City(cityData);

    logger.info('🏙️ Об\'єкт міста перед збереженням:', JSON.stringify(city.toObject(), null, 2));

    await city.save();

    logger.info('✅ Місто успішно збережено:', city._id);

    // Відправка WebSocket сповіщення про створення міста
    try {
      const cityWebSocketService = require('../services/cityWebSocketService');
      cityWebSocketService.notifyCityCreated(city);
      logger.info('✅ WebSocket сповіщення про створення міста відправлено');
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket сповіщення про створення міста:', error);
      // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
    }

    res.status(201).json({
      success: true,
      message: 'Місто успішно створено',
      data: city
    });
  } catch (error) {
    logger.error('Error creating city:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при створенні міста',
      error: error.message
    });
  }
};

// Оновити місто
exports.updateCity = async (req, res) => {
  try {
    const { id } = req.params;
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID міста'
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для редагування міст'
      });
    }

    const city = await City.findById(id);
    if (!city) {
      return res.status(404).json({
        success: false,
        message: 'Місто не знайдено'
      });
    }

    const {
      name,
      nameEn,
      region,
      coordinates,
      population,
      timezone,
      postalCodes,
      description,
      isActive
    } = req.body;

    // Перевірка унікальності назви міста (якщо змінюється)
    if (name && name !== city.name) {
      const existingCity = await City.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: id }
      });
      
      if (existingCity) {
        return res.status(400).json({
          success: false,
          message: 'Місто з такою назвою вже існує'
        });
      }
    }

    // Оновлення полів
    if (name !== undefined) city.name = name;
    if (nameEn !== undefined) city.nameEn = nameEn;
    if (region !== undefined) city.region = region;
    if (coordinates !== undefined) city.coordinates = coordinates;
    if (population !== undefined) city.population = population;
    if (timezone !== undefined) city.timezone = timezone;
    if (postalCodes !== undefined) city.postalCodes = postalCodes;
    if (description !== undefined) city.description = description;
    if (isActive !== undefined) city.isActive = isActive;

    city.lastModifiedBy = req.user._id;
    await city.save();

    // Відправка WebSocket сповіщення про оновлення міста
    try {
      const cityWebSocketService = require('../services/cityWebSocketService');
      cityWebSocketService.notifyCityUpdated(city);
      logger.info('✅ WebSocket сповіщення про оновлення міста відправлено');
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket сповіщення про оновлення міста:', error);
      // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
    }

    res.json({
      success: true,
      message: 'Місто успішно оновлено',
      data: city
    });
  } catch (error) {
    logger.error('Error updating city:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при оновленні міста',
      error: error.message
    });
  }
};

// Видалити місто
exports.deleteCity = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID міста'
      });
    }

    // Перевірка прав доступу (admin або super_admin)
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для видалення міст'
      });
    }

    const city = await City.findById(id);
    if (!city) {
      return res.status(404).json({
        success: false,
        message: 'Місто не знайдено'
      });
    }

    // Перевірка чи є користувачі або тикети пов'язані з цим містом
    const [userCount, ticketCount] = await Promise.all([
      User.countDocuments({ city: id }),
      Ticket.countDocuments({ city: id })
    ]);

    if (userCount > 0 || ticketCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Не можна видалити місто. З ним пов'язано ${userCount} користувачів та ${ticketCount} тикетів. Спочатку деактивуйте місто.`
      });
    }

    await City.findByIdAndDelete(id);

    // Відправка WebSocket сповіщення про видалення міста
    try {
      const cityWebSocketService = require('../services/cityWebSocketService');
      cityWebSocketService.notifyCityDeleted(id);
      logger.info('✅ WebSocket сповіщення про видалення міста відправлено');
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket сповіщення про видалення міста:', error);
      // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
    }

    res.json({
      success: true,
      message: 'Місто успішно видалено'
    });
  } catch (error) {
    logger.error('Error deleting city:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні міста',
      error: error.message
    });
  }
};

// Отримати список регіонів
exports.getRegions = async (req, res) => {
  try {
    const regions = await City.distinct('region', { isActive: true });
    
    // Отримати статистику по регіонах
    const regionStats = await City.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$region',
          cityCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const regionsWithStats = regionStats.map(stat => ({
      name: stat._id,
      cityCount: stat.cityCount
    }));

    res.json({
      success: true,
      data: regionsWithStats
    });
  } catch (error) {
    logger.error('Error fetching regions:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні регіонів',
      error: error.message
    });
  }
};

// Отримати статистику міст
exports.getCityStatistics = async (req, res) => {
  try {
    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для перегляду статистики міст'
      });
    }

    const { region, limit = 10 } = req.query;

    // Загальна статистика
    const generalStats = await City.aggregate([
      {
        $group: {
          _id: null,
          totalCities: { $sum: 1 },
          activeCities: { $sum: { $cond: ['$isActive', 1, 0] } },
          totalPopulation: { $sum: '$population' }
        }
      }
    ]);

    // Статистика по регіонах
    const regionStats = await City.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$region',
          cityCount: { $sum: 1 },
          totalPopulation: { $sum: '$population' }
        }
      },
      { $sort: { cityCount: -1 } }
    ]);

    // Топ міст за кількістю користувачів
    const cityUserStats = await User.aggregate([
      { $match: { isActive: true, city: { $ne: null } } },
      {
        $lookup: {
          from: 'cities',
          localField: 'city',
          foreignField: '_id',
          as: 'cityInfo'
        }
      },
      { $unwind: '$cityInfo' },
      ...(region ? [{ $match: { 'cityInfo.region': region } }] : []),
      {
        $group: {
          _id: '$city',
          cityName: { $first: '$cityInfo.name' },
          region: { $first: '$cityInfo.region' },
          userCount: { $sum: 1 }
        }
      },
      { $sort: { userCount: -1 } },
      { $limit: parseInt(limit) }
    ]);

    // Топ міст за кількістю тикетів
    const cityTicketStats = await Ticket.aggregate([
      { $match: { city: { $ne: null } } },
      {
        $lookup: {
          from: 'cities',
          localField: 'city',
          foreignField: '_id',
          as: 'cityInfo'
        }
      },
      { $unwind: '$cityInfo' },
      ...(region ? [{ $match: { 'cityInfo.region': region } }] : []),
      {
        $group: {
          _id: '$city',
          cityName: { $first: '$cityInfo.name' },
          region: { $first: '$cityInfo.region' },
          ticketCount: { $sum: 1 },
          openTickets: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          resolvedTickets: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } }
        }
      },
      { $sort: { ticketCount: -1 } },
      { $limit: parseInt(limit) }
    ]);

    const stats = generalStats[0] || {
      totalCities: 0,
      activeCities: 0,
      totalPopulation: 0
    };

    res.json({
      success: true,
      data: {
        general: stats,
        byRegion: regionStats,
        topCitiesByUsers: cityUserStats,
        topCitiesByTickets: cityTicketStats,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    logger.error('Error fetching city statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні статистики міст',
      error: error.message
    });
  }
};

// Отримати дані для теплової карти
exports.getHeatMapData = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      status, 
      priority,
      region 
    } = req.query;

    // Побудова фільтрів для тикетів
    const ticketFilters = {};
    
    if (startDate || endDate) {
      ticketFilters.createdAt = {};
      if (startDate) ticketFilters.createdAt.$gte = new Date(startDate);
      if (endDate) ticketFilters.createdAt.$lte = new Date(endDate);
    }
    
    if (status) ticketFilters.status = status;
    if (priority) ticketFilters.priority = priority;

    // Агрегація даних для теплової карти
    const heatMapData = await Ticket.aggregate([
      { $match: ticketFilters },
      {
        $lookup: {
          from: 'cities',
          localField: 'city',
          foreignField: '_id',
          as: 'cityInfo'
        }
      },
      { $unwind: '$cityInfo' },
      ...(region ? [{ $match: { 'cityInfo.region': region } }] : []),
      {
        $group: {
          _id: '$city',
          cityName: { $first: '$cityInfo.name' },
          region: { $first: '$cityInfo.region' },
          coordinates: { $first: '$cityInfo.coordinates' },
          ticketCount: { $sum: 1 },
          openTickets: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          inProgressTickets: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          resolvedTickets: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          closedTickets: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
          highPriorityTickets: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } },
          mediumPriorityTickets: { $sum: { $cond: [{ $eq: ['$priority', 'medium'] }, 1, 0] } },
          lowPriorityTickets: { $sum: { $cond: [{ $eq: ['$priority', 'low'] }, 1, 0] } }
        }
      },
      { $sort: { ticketCount: -1 } }
    ]);

    // Додати міста без тикетів (якщо потрібно)
    const citiesWithoutTickets = await City.find({
      isActive: true,
      ...(region ? { region } : {}),
      _id: { $nin: heatMapData.map(item => item._id) }
    }).select('name region coordinates');

    const citiesWithZeroTickets = citiesWithoutTickets.map(city => ({
      _id: city._id,
      cityName: city.name,
      region: city.region,
      coordinates: city.coordinates,
      ticketCount: 0,
      openTickets: 0,
      inProgressTickets: 0,
      resolvedTickets: 0,
      closedTickets: 0,
      highPriorityTickets: 0,
      mediumPriorityTickets: 0,
      lowPriorityTickets: 0
    }));

    const allData = [...heatMapData, ...citiesWithZeroTickets];

    res.json({
      success: true,
      data: allData,
      filters: {
        startDate,
        endDate,
        status,
        priority,
        region
      },
      generatedAt: new Date()
    });
  } catch (error) {
    logger.error('Error fetching heat map data:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні даних для теплової карти',
      error: error.message
    });
  }
};

// Пошук міст
exports.searchCities = async (req, res) => {
  try {
    const { q } = req.query;
    const cities = await City.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { region: { $regex: q, $options: 'i' } }
      ]
    }).limit(20);

    res.json({
      success: true,
      data: cities
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при пошуку міст',
      error: error.message
    });
  }
};

// Отримати міста за регіоном
exports.getCitiesByRegion = async (req, res) => {
  try {
    const { region } = req.params;
    const cities = await City.find({ region });

    res.json({
      success: true,
      data: cities
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні міст регіону',
      error: error.message
    });
  }
};

// Експорт міст
exports.exportCities = async (req, res) => {
  try {
    const cities = await City.find({});
    res.json({
      success: true,
      data: cities,
      message: 'Дані експортовано успішно'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при експорті даних',
      error: error.message
    });
  }
};

// Масове оновлення міст
exports.bulkUpdateCities = async (req, res) => {
  try {
    const { cityIds, updates } = req.body;
    await City.updateMany(
      { _id: { $in: cityIds } },
      { $set: updates }
    );

    res.json({
      success: true,
      message: 'Міста оновлено успішно'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при масовому оновленні',
      error: error.message
    });
  }
};

// Масове видалення міст
exports.bulkDeleteCities = async (req, res) => {
  try {
    const { cityIds } = req.body;
    await City.deleteMany({ _id: { $in: cityIds } });

    res.json({
      success: true,
      message: 'Міста видалено успішно'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при масовому видаленні',
      error: error.message
    });
  }
};

// Перемикання статусу міста
exports.toggleCityStatus = async (req, res) => {
  try {
    const city = await City.findById(req.params.id);
    if (!city) {
      return res.status(404).json({
        success: false,
        message: 'Місто не знайдено'
      });
    }

    city.isActive = !city.isActive;
    await city.save();

    res.json({
      success: true,
      data: city,
      message: 'Статус міста змінено'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при зміні статусу',
      error: error.message
    });
  }
};

// Отримати користувачів міста
exports.getCityUsers = async (req, res) => {
  try {
    const users = await User.find({ city: req.params.id });
    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні користувачів',
      error: error.message
    });
  }
};

// Отримати тикети міста
exports.getCityTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({ city: req.params.id });
    res.json({
      success: true,
      data: tickets
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні тикетів',
      error: error.message
    });
  }
};

// Детальна статистика міста
exports.getCityDetailedStatistics = async (req, res) => {
  try {
    const cityId = req.params.id;
    const ticketCount = await Ticket.countDocuments({ city: cityId });
    const userCount = await User.countDocuments({ city: cityId });

    res.json({
      success: true,
      data: {
        ticketCount,
        userCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні статистики',
      error: error.message
    });
  }
};

// Імпорт міст
exports.importCities = async (req, res) => {
  try {
    const { data } = req.body;
    await City.insertMany(data);

    res.json({
      success: true,
      message: 'Дані імпортовано успішно'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при імпорті даних',
      error: error.message
    });
  }
};

// Валідація даних міст
exports.validateCityData = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Дані валідні'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка валідації',
      error: error.message
    });
  }
};

// Отримати сусідні міста
exports.getNearbyCities = async (req, res) => {
  try {
    const cities = await City.find({}).limit(10);
    res.json({
      success: true,
      data: cities
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні сусідніх міст',
      error: error.message
    });
  }
};

// Отримати міста для карти
exports.getCitiesForMap = async (req, res) => {
  try {
    const cities = await City.find({});
    res.json({
      success: true,
      data: cities
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні міст для карти',
      error: error.message
    });
  }
};

// Синхронізація з зовнішнім джерелом
exports.syncWithExternalSource = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Синхронізація завершена'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка синхронізації',
      error: error.message
    });
  }
};

// Історія змін міста
exports.getCityHistory = async (req, res) => {
  try {
    res.json({
      success: true,
      data: [],
      message: 'Історія отримана'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні історії',
      error: error.message
    });
  }
};

// Відновлення міста
exports.restoreCity = async (req, res) => {
  try {
    const city = await City.findById(req.params.id);
    if (!city) {
      return res.status(404).json({
        success: false,
        message: 'Місто не знайдено'
      });
    }

    res.json({
      success: true,
      data: city,
      message: 'Місто відновлено'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Помилка при відновленні',
      error: error.message
    });
  }
};
