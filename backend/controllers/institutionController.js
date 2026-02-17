const { validationResult } = require('express-validator');
const Institution = require('../models/Institution');
const City = require('../models/City');
const Ticket = require('../models/Ticket');
const mongoose = require('mongoose');
const csv = require('json2csv').parse;
const ExcelJS = require('exceljs');
const logger = require('../utils/logger');

// Отримати всі заклади
const getAllInstitutions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      city,
      isVerified,
      isPublic,
      search,
      sortBy = 'name',
      sortOrder = 'asc',
      withStatistics = false,
      lat,
      lng,
      radius = 10,
    } = req.query;

    // Побудова фільтрів
    const filters = { isActive: true };

    if (type) {
      filters.type = type;
    }
    if (city) {
      filters['address.city'] = city;
    }
    if (isVerified !== undefined) {
      filters.isVerified = isVerified === 'true';
    }
    if (isPublic !== undefined) {
      filters.isPublic = isPublic === 'true';
    }

    // Пошук по назві закладу
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { nameEn: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'address.street': { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      populate: [
        { path: 'address.city', select: 'name nameEn region' },
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'lastModifiedBy', select: 'firstName lastName email' },
      ],
    };

    // Якщо вказані координати, використовуємо геопошук
    if (lat && lng) {
      const nearbyInstitutions = await Institution.findNearby(
        parseFloat(lat),
        parseFloat(lng),
        parseFloat(radius)
      );

      const institutionIds = nearbyInstitutions.map(inst => inst._id);
      filters._id = { $in: institutionIds };
    }

    const institutions = await Institution.paginate(filters, options);

    // Додаємо статистику якщо потрібно
    if (withStatistics === 'true') {
      for (const institution of institutions.docs) {
        await institution.updateStatistics();
      }
    }

    res.json({
      success: true,
      data: institutions.docs,
      pagination: {
        currentPage: institutions.page,
        totalPages: institutions.totalPages,
        totalItems: institutions.totalDocs,
        itemsPerPage: institutions.limit,
        hasNextPage: institutions.hasNextPage,
        hasPrevPage: institutions.hasPrevPage,
      },
    });
  } catch (error) {
    logger.error('Error fetching institutions:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні закладів',
      error: error.message,
    });
  }
};

// Експорт закладів
const exportInstitutions = async (req, res) => {
  try {
    const { format = 'csv', type, city, isVerified } = req.query;

    const filters = { isActive: true };
    if (type) {
      filters.type = type;
    }
    if (city) {
      filters['address.city'] = city;
    }
    if (isVerified !== undefined) {
      filters.isVerified = isVerified === 'true';
    }

    const institutions = await Institution.find(filters)
      .populate('address.city', 'name region')
      .populate('createdBy', 'firstName lastName')
      .lean();

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Заклади');

      // Заголовки
      worksheet.columns = [
        { header: 'Назва', key: 'name', width: 30 },
        { header: 'Тип', key: 'type', width: 20 },
        { header: 'Адреса', key: 'address', width: 40 },
        { header: 'Місто', key: 'city', width: 20 },
        { header: 'Телефон', key: 'phone', width: 15 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Веб-сайт', key: 'website', width: 30 },
        { header: 'Рейтинг', key: 'rating', width: 10 },
        { header: 'Верифіковано', key: 'verified', width: 15 },
        { header: 'Створено', key: 'createdAt', width: 20 },
      ];

      // Дані
      institutions.forEach(institution => {
        worksheet.addRow({
          name: institution.name,
          type: institution.type,
          address: institution.address.street,
          city: institution.address.city?.name || '',
          phone: institution.contact?.phone || '',
          email: institution.contact?.email || '',
          website: institution.contact?.website || '',
          rating: institution.rating?.average || 0,
          verified: institution.isVerified ? 'Так' : 'Ні',
          createdAt: new Date(institution.createdAt).toLocaleDateString('uk-UA'),
        });
      });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=institutions.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } else {
      // CSV формат
      const csvData = institutions.map(institution => ({
        Назва: institution.name,
        Тип: institution.type,
        Адреса: institution.address.street,
        Місто: institution.address.city?.name || '',
        Телефон: institution.contact?.phone || '',
        Email: institution.contact?.email || '',
        'Веб-сайт': institution.contact?.website || '',
        Рейтинг: institution.rating?.average || 0,
        Верифіковано: institution.isVerified ? 'Так' : 'Ні',
        Створено: new Date(institution.createdAt).toLocaleDateString('uk-UA'),
      }));

      const csvString = csv(csvData);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=institutions.csv');
      res.send('\uFEFF' + csvString); // BOM для правильного відображення українських символів
    }
  } catch (error) {
    logger.error('Error exporting institutions:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при експорті закладів',
      error: error.message,
    });
  }
};

// Отримати заклад за ID
const getInstitutionById = async (req, res) => {
  try {
    const { id } = req.params;
    const { withStatistics = false } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID закладу',
      });
    }

    const institution = await Institution.findById(id)
      .populate('address.city', 'name nameEn region')
      .populate('createdBy', 'firstName lastName email')
      .populate('lastModifiedBy', 'firstName lastName email');

    if (!institution) {
      return res.status(404).json({
        success: false,
        message: 'Заклад не знайдено',
      });
    }

    if (withStatistics === 'true') {
      await institution.updateStatistics();
    }

    res.json({
      success: true,
      data: institution,
    });
  } catch (error) {
    logger.error('Error fetching institution by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні закладу',
      error: error.message,
    });
  }
};

// Створити новий заклад
const createInstitution = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array(),
      });
    }

    const institutionData = {
      ...req.body,
      createdBy: req.user.id,
    };

    // Перевіряємо чи існує місто
    if (institutionData.address?.city) {
      const city = await City.findById(institutionData.address.city);
      if (!city) {
        return res.status(400).json({
          success: false,
          message: 'Вказане місто не існує',
        });
      }
    }

    // Перевіряємо унікальність назви
    const existingInstitution = await Institution.findOne({
      name: institutionData.name,
      isActive: true,
    });

    if (existingInstitution) {
      return res.status(400).json({
        success: false,
        message: 'Заклад з такою назвою вже існує',
      });
    }

    const institution = new Institution(institutionData);
    await institution.save();

    await institution.populate([
      { path: 'address.city', select: 'name nameEn region' },
      { path: 'createdBy', select: 'firstName lastName email' },
    ]);

    logger.info(`Institution created: ${institution.name} by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Заклад успішно створено',
      data: institution,
    });
  } catch (error) {
    logger.error('Error creating institution:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Заклад з такою назвою вже існує',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Помилка при створенні закладу',
      error: error.message,
    });
  }
};

// Оновити заклад
const updateInstitution = async (req, res) => {
  try {
    const { id } = req.params;
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array(),
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID закладу',
      });
    }

    const institution = await Institution.findById(id);
    if (!institution) {
      return res.status(404).json({
        success: false,
        message: 'Заклад не знайдено',
      });
    }

    // Перевіряємо чи існує місто якщо воно оновлюється
    if (
      req.body.address?.city &&
      req.body.address.city !== null &&
      req.body.address.city !== undefined
    ) {
      const city = await City.findById(req.body.address.city);
      if (!city) {
        return res.status(400).json({
          success: false,
          message: 'Вказане місто не існує',
        });
      }
    }

    // Якщо передається address, але не всі поля, зберігаємо існуючі значення
    if (req.body.address && institution.address) {
      req.body.address = {
        ...institution.address.toObject(),
        ...req.body.address,
      };
      // Якщо city передається як undefined, видаляємо його
      if (req.body.address.city === undefined || req.body.address.city === null) {
        req.body.address.city = null;
      }
    }

    // Якщо передається coordinates, але не всі поля, зберігаємо існуючі значення
    if (req.body.coordinates && institution.coordinates) {
      req.body.coordinates = {
        ...institution.coordinates.toObject(),
        ...req.body.coordinates,
      };
    }

    // Перевіряємо унікальність назви якщо вона змінюється
    if (req.body.name && req.body.name !== institution.name) {
      const existingInstitution = await Institution.findOne({
        name: req.body.name,
        _id: { $ne: id },
        isActive: true,
      });

      if (existingInstitution) {
        return res.status(400).json({
          success: false,
          message: 'Заклад з такою назвою вже існує',
        });
      }
    }

    const updateData = {
      ...req.body,
      lastModifiedBy: req.user.id,
    };

    const updatedInstitution = await Institution.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate([
      { path: 'address.city', select: 'name nameEn region' },
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'lastModifiedBy', select: 'firstName lastName email' },
    ]);

    logger.info(`Institution updated: ${updatedInstitution.name} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Заклад успішно оновлено',
      data: updatedInstitution,
    });
  } catch (error) {
    logger.error('Error updating institution:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Заклад з такою назвою вже існує',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Помилка при оновленні закладу',
      error: error.message,
    });
  }
};

// Видалити заклад
const deleteInstitution = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID закладу',
      });
    }

    const institution = await Institution.findById(id);
    if (!institution) {
      return res.status(404).json({
        success: false,
        message: 'Заклад не знайдено',
      });
    }

    // Перевіряємо чи є пов'язані тікети
    const relatedTickets = await Ticket.countDocuments({ institution: id });
    if (relatedTickets > 0) {
      return res.status(400).json({
        success: false,
        message: `Неможливо видалити заклад. З ним пов'язано ${relatedTickets} тікетів. Спочатку деактивуйте заклад.`,
      });
    }

    await Institution.findByIdAndDelete(id);

    logger.info(`Institution deleted: ${institution.name} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Заклад успішно видалено',
    });
  } catch (error) {
    logger.error('Error deleting institution:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні закладу',
      error: error.message,
    });
  }
};

// Отримати типи закладів
const getInstitutionTypes = async (req, res) => {
  try {
    const types = await Institution.getTypes();

    res.json({
      success: true,
      data: types,
    });
  } catch (error) {
    logger.error('Error fetching institution types:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні типів закладів',
      error: error.message,
    });
  }
};

// Пошук закладів
const searchInstitutions = async (req, res) => {
  try {
    const { query, type, city, limit = 10, lat, lng, radius = 5 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Пошуковий запит повинен містити принаймні 2 символи',
      });
    }

    const filters = {
      isActive: true,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { nameEn: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { 'address.street': { $regex: query, $options: 'i' } },
        { tags: { $in: [new RegExp(query, 'i')] } },
      ],
    };

    if (type) {
      filters.type = type;
    }
    if (city) {
      filters['address.city'] = city;
    }

    let institutions;

    if (lat && lng) {
      // Геопошук
      institutions = await Institution.findNearby(
        parseFloat(lat),
        parseFloat(lng),
        parseFloat(radius)
      );

      // Фільтруємо результати геопошуку за текстовим запитом
      institutions = institutions.filter(
        inst =>
          inst.name.toLowerCase().includes(query.toLowerCase()) ||
          (inst.nameEn && inst.nameEn.toLowerCase().includes(query.toLowerCase())) ||
          (inst.description && inst.description.toLowerCase().includes(query.toLowerCase()))
      );

      institutions = institutions.slice(0, parseInt(limit));
    } else {
      institutions = await Institution.find(filters)
        .populate('address.city', 'name nameEn')
        .limit(parseInt(limit))
        .sort({ name: 1 });
    }

    res.json({
      success: true,
      data: institutions,
    });
  } catch (error) {
    logger.error('Error searching institutions:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при пошуку закладів',
      error: error.message,
    });
  }
};

// Отримати заклади поблизу
const getNearbyInstitutions = async (req, res) => {
  try {
    const { lat, lng, radius = 10, type, limit = 20 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Координати (lat, lng) є обов'язковими",
      });
    }

    let institutions = await Institution.findNearby(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(radius)
    );

    if (type) {
      institutions = institutions.filter(inst => inst.type === type);
    }

    institutions = institutions.slice(0, parseInt(limit));

    // Додаємо інформацію про місто
    await Institution.populate(institutions, {
      path: 'address.city',
      select: 'name nameEn region',
    });

    res.json({
      success: true,
      data: institutions,
    });
  } catch (error) {
    logger.error('Error fetching nearby institutions:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні закладів поблизу',
      error: error.message,
    });
  }
};

// Отримати статистику закладів
const getInstitutionStatistics = async (req, res) => {
  try {
    const { type, city, period = '30' } = req.query;

    const filters = { isActive: true };
    if (type) {
      filters.type = type;
    }
    if (city) {
      filters['address.city'] = city;
    }

    // Загальна статистика
    const generalStats = await Institution.getStatistics();

    // Статистика по типах
    const typeStats = await Institution.aggregate([
      { $match: filters },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          averageRating: { $avg: '$rating.average' },
          totalTickets: { $sum: '$statistics.totalTickets' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Статистика по містах
    const cityStats = await Institution.aggregate([
      { $match: filters },
      {
        $lookup: {
          from: 'cities',
          localField: 'address.city',
          foreignField: '_id',
          as: 'cityInfo',
        },
      },
      { $unwind: '$cityInfo' },
      {
        $group: {
          _id: '$cityInfo._id',
          cityName: { $first: '$cityInfo.name' },
          count: { $sum: 1 },
          averageRating: { $avg: '$rating.average' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Статистика за період
    const periodDate = new Date();
    periodDate.setDate(periodDate.getDate() - parseInt(period));

    const periodStats = await Institution.aggregate([
      {
        $match: {
          ...filters,
          createdAt: { $gte: periodDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: {
        general: generalStats[0] || {},
        byType: typeStats,
        byCity: cityStats,
        byPeriod: periodStats,
      },
    });
  } catch (error) {
    logger.error('Error fetching institution statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні статистики закладів',
      error: error.message,
    });
  }
};

// Масове видалення закладів
const bulkDeleteInstitutions = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array(),
      });
    }

    const { institutionIds } = req.body;

    // Перевіряємо чи всі ID валідні
    const invalidIds = institutionIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Деякі ID закладів невірні',
        invalidIds,
      });
    }

    // Перевіряємо чи є пов'язані тікети
    const relatedTickets = await Ticket.countDocuments({
      institution: { $in: institutionIds },
    });

    if (relatedTickets > 0) {
      return res.status(400).json({
        success: false,
        message: `Неможливо видалити заклади. З ними пов'язано ${relatedTickets} тікетів.`,
      });
    }

    const result = await Institution.deleteMany({
      _id: { $in: institutionIds },
    });

    logger.info(
      `Bulk delete institutions: ${result.deletedCount} institutions deleted by user ${req.user.id}`
    );

    res.json({
      success: true,
      message: `Успішно видалено ${result.deletedCount} закладів`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    logger.error('Error bulk deleting institutions:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при масовому видаленні закладів',
      error: error.message,
    });
  }
};

// Додати послугу до закладу
const addService = async (req, res) => {
  try {
    const { id } = req.params;
    const serviceData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID закладу',
      });
    }

    const institution = await Institution.findById(id);
    if (!institution) {
      return res.status(404).json({
        success: false,
        message: 'Заклад не знайдено',
      });
    }

    await institution.addService(serviceData);

    res.json({
      success: true,
      message: 'Послугу успішно додано',
      data: institution,
    });
  } catch (error) {
    logger.error('Error adding service:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при додаванні послуги',
      error: error.message,
    });
  }
};

// Видалити послугу з закладу
const removeService = async (req, res) => {
  try {
    const { id, serviceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(serviceId)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID закладу або послуги',
      });
    }

    const institution = await Institution.findById(id);
    if (!institution) {
      return res.status(404).json({
        success: false,
        message: 'Заклад не знайдено',
      });
    }

    await institution.removeService(serviceId);

    res.json({
      success: true,
      message: 'Послугу успішно видалено',
      data: institution,
    });
  } catch (error) {
    logger.error('Error removing service:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні послуги',
      error: error.message,
    });
  }
};

module.exports = {
  getAllInstitutions,
  getInstitutionById,
  createInstitution,
  updateInstitution,
  deleteInstitution,
  searchInstitutions,
  getInstitutionTypes,
  getNearbyInstitutions,
  getInstitutionStatistics,
  exportInstitutions,
  bulkDeleteInstitutions,
  addService,
  removeService,
};
