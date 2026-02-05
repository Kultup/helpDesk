const mongoose = require('mongoose');
const Equipment = require('../models/Equipment');
const { sendSuccess, sendError } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Отримати список обладнання з фільтрами та пагінацією
 */
exports.getEquipment = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      type,
      status,
      city,
      assignedTo,
      search
    } = req.query;

    const query = {};

    // Фільтри
    if (type) query.type = type;
    if (status) query.status = status;
    if (city) query.city = city;
    if (assignedTo) query.assignedTo = assignedTo;

    // Пошук
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
        { serialNumber: { $regex: search, $options: 'i' } },
        { inventoryNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [equipment, total] = await Promise.all([
      Equipment.find(query)
        .populate('city', 'name region')
        .populate('institution', 'name')
        .populate('assignedTo', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName')
        .populate('updatedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Equipment.countDocuments(query)
    ]);

    sendSuccess(res, {
      equipment,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Помилка отримання обладнання:', error);
    sendError(res, 'Помилка отримання списку обладнання', 500);
  }
};

/**
 * Отримати одиницю обладнання за ID
 */
exports.getEquipmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const equipment = await Equipment.findById(id)
      .populate('city', 'name region')
      .populate('institution', 'name')
      .populate('assignedTo', 'firstName lastName email phone')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .populate({
        path: 'relatedTickets',
        select: 'title status priority createdAt',
        options: { sort: { createdAt: -1 }, limit: 10 }
      })
      .lean();

    if (!equipment) {
      return sendError(res, 'Обладнання не знайдено', 404);
    }

    sendSuccess(res, equipment);
  } catch (error) {
    logger.error('Помилка отримання обладнання:', error);
    sendError(res, 'Помилка отримання обладнання', 500);
  }
};

/**
 * Створити нову одиницю обладнання
 */
exports.createEquipment = async (req, res) => {
  try {
    const equipmentData = {
      ...req.body,
      createdBy: req.user._id
    };

    const equipment = new Equipment(equipmentData);
    await equipment.save();

    await equipment.populate([
      { path: 'city', select: 'name' },
      { path: 'assignedTo', select: 'firstName lastName email' },
      { path: 'createdBy', select: 'firstName lastName' }
    ]);

    logger.info(`Створено нове обладнання: ${equipment.name} (${equipment._id}) користувачем ${req.user.email}`);
    sendSuccess(res, equipment, 201);
  } catch (error) {
    logger.error('Помилка створення обладнання:', error);
    
    if (error.code === 11000) {
      return sendError(res, 'Інвентарний номер вже існує', 400);
    }
    
    sendError(res, 'Помилка створення обладнання', 500);
  }
};

/**
 * Оновити обладнання
 */
exports.updateEquipment = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedBy: req.user._id
    };

    const equipment = await Equipment.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('city', 'name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName');

    if (!equipment) {
      return sendError(res, 'Обладнання не знайдено', 404);
    }

    logger.info(`Оновлено обладнання: ${equipment.name} (${equipment._id}) користувачем ${req.user.email}`);
    sendSuccess(res, equipment);
  } catch (error) {
    logger.error('Помилка оновлення обладнання:', error);
    
    if (error.code === 11000) {
      return sendError(res, 'Інвентарний номер вже існує', 400);
    }
    
    sendError(res, 'Помилка оновлення обладнання', 500);
  }
};

/**
 * Видалити обладнання
 */
exports.deleteEquipment = async (req, res) => {
  try {
    const { id } = req.params;

    const equipment = await Equipment.findByIdAndDelete(id);

    if (!equipment) {
      return sendError(res, 'Обладнання не знайдено', 404);
    }

    logger.info(`Видалено обладнання: ${equipment.name} (${equipment._id}) користувачем ${req.user.email}`);
    sendSuccess(res, { message: 'Обладнання видалено успішно' });
  } catch (error) {
    logger.error('Помилка видалення обладнання:', error);
    sendError(res, 'Помилка видалення обладнання', 500);
  }
};

/**
 * Отримати статистику обладнання
 */
exports.getEquipmentStats = async (req, res) => {
  try {
    const { city } = req.query;
    const cityId = city ? new mongoose.Types.ObjectId(city) : null;

    const stats = await Equipment.getStatsByCity(cityId);

    // Загальна статистика
    const totalStats = await Equipment.aggregate([
      { $match: cityId ? { city: cityId } : {} },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          repair: {
            $sum: { $cond: [{ $eq: ['$status', 'repair'] }, 1, 0] }
          },
          disposed: {
            $sum: { $cond: [{ $eq: ['$status', 'disposed'] }, 1, 0] }
          },
          underWarranty: {
            $sum: {
              $cond: [
                { $gt: ['$warrantyExpiry', new Date()] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    sendSuccess(res, {
      byType: stats,
      total: totalStats[0] || {
        total: 0,
        active: 0,
        repair: 0,
        disposed: 0,
        underWarranty: 0
      }
    });
  } catch (error) {
    logger.error('Помилка отримання статистики обладнання:', error);
    sendError(res, 'Помилка отримання статистики', 500);
  }
};

/**
 * Призначити обладнання користувачу
 */
exports.assignEquipment = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const equipment = await Equipment.findById(id);
    
    if (!equipment) {
      return sendError(res, 'Обладнання не знайдено', 404);
    }

    await equipment.assignToUser(userId);
    equipment.updatedBy = req.user._id;
    await equipment.save();

    await equipment.populate('assignedTo', 'firstName lastName email');

    logger.info(`Обладнання ${equipment.name} призначено користувачу ${userId}`);
    sendSuccess(res, equipment);
  } catch (error) {
    logger.error('Помилка призначення обладнання:', error);
    sendError(res, 'Помилка призначення обладнання', 500);
  }
};

/**
 * Змінити статус обладнання
 */
exports.changeEquipmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const equipment = await Equipment.findById(id);
    
    if (!equipment) {
      return sendError(res, 'Обладнання не знайдено', 404);
    }

    await equipment.changeStatus(status, req.user._id);
    await equipment.populate('updatedBy', 'firstName lastName');

    logger.info(`Статус обладнання ${equipment.name} змінено на ${status}`);
    sendSuccess(res, equipment);
  } catch (error) {
    logger.error('Помилка зміни статусу обладнання:', error);
    sendError(res, 'Помилка зміни статусу', 500);
  }
};
