const mongoose = require('mongoose');
const Equipment = require('../models/Equipment');
const { sendSuccess, sendError } = require('../utils/response');
const logger = require('../utils/logger');
const ExcelJS = require('exceljs');
const equipmentService = require('../services/equipmentService');

// ... (existing code)

/**
 * Завантажити шаблон для масового імпорту
 */
exports.getEquipmentTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Шаблон імпорту');

    // Налаштування колонок
    worksheet.columns = [
      { header: 'Назва обладнання *', key: 'name', width: 30 },
      { header: 'Тип обладнання *', key: 'type', width: 20 },
      { header: 'Виробник (Бренд)', key: 'brand', width: 20 },
      { header: 'Модель пристрою', key: 'model', width: 25 },
      { header: 'Серійний номер (S/N)', key: 'serialNumber', width: 25 },
      { header: 'Інвентарний номер (Inv)', key: 'inventoryNumber', width: 25 },
      { header: 'Місто (розташування)', key: 'city', width: 20 },
      { header: 'Заклад (офіс)', key: 'institution', width: 30 },
      { header: 'Детальна локація (кабінет)', key: 'location', width: 25 },
      { header: 'Статус *', key: 'status', width: 15 },
      { header: 'Дата покупки (РРРР-ММ-ДД)', key: 'purchaseDate', width: 25 },
      { header: 'Додаткові примітки', key: 'notes', width: 30 },
    ];

    // Стилізація заголовка
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Додавання підказок (як коментарі до заголовків)
    // Додавання підказок (як коментарі до заголовків)
    worksheet.getCell('A1').note = 'Назва обладнання (наприклад: HP ProBook 450 G8)';
    worksheet.getCell('B1').note =
      'Тип обладнання (виберіть зі списку): computer, printer, phone, monitor, router, switch, ups, other';
    worksheet.getCell('C1').note = 'Виробник (наприклад: HP, Dell, Lenovo)';
    worksheet.getCell('D1').note = 'Модель (наприклад: Latitude 5420)';
    worksheet.getCell('E1').note = 'Серійний номер (залиште пустим, якщо немає)';
    worksheet.getCell('F1').note = 'Інвентарний номер (залиште пустим для автогенерації)';
    worksheet.getCell('G1').note = 'Назва міста (має співпадати з назвою в системі)';
    worksheet.getCell('H1').note = 'Назва закладу (має співпадати з назвою в системі)';
    worksheet.getCell('I1').note = 'Конкретне місцезнаходження (наприклад: Кабінет 201)';
    worksheet.getCell('J1').note =
      'Статус (виберіть зі списку): working (В роботі), not_working (Не працює), new (Новий), used (Б/У)';
    worksheet.getCell('K1').note = 'Дата покупки у форматі: YYYY-MM-DD (наприклад: 2023-12-31)';
    worksheet.getCell('L1').note = 'Додаткові примітки або опис';

    // Додання прикладу даних
    worksheet.addRow({
      name: 'HP ProBook 450 G8',
      type: 'computer',
      brand: 'HP',
      model: 'ProBook 450 G8',
      serialNumber: '5CD1234567',
      inventoryNumber: '', // Залишити пустим для автогенерації
      city: 'Київ',
      institution: 'Головний офіс',
      location: 'IT відділ',
      status: 'working',
      purchaseDate: '2023-01-15',
      notes: 'Видано новому співробітнику',
    });

    // Додаємо випадаючі списки (Data Validation) для колонок B (Type) та J (Status)
    // Налаштовуємо для перших 500 рядків (після заголовка)
    for (let i = 2; i <= 500; i++) {
      // Випадаючий список для Типу (Колонка B)
      worksheet.getCell(`B${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"computer,printer,phone,monitor,router,switch,ups,other"'],
        showErrorMessage: true,
        errorTitle: 'Невірний тип',
        error: 'Будь ласка, оберіть тип зі списку',
      };

      // Випадаючий список для Статусу (Колонка J)
      worksheet.getCell(`J${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"working,not_working,new,used"'],
        showErrorMessage: true,
        errorTitle: 'Невірний статус',
        error: 'Будь ласка, оберіть статус зі списку',
      };
    }

    // Налаштування відповіді
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + 'equipment_import_template.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Помилка генерації шаблону:', error);
    sendError(res, 'Помилка генерації шаблону', 500);
  }
};

/**
 * Масовий імпорт обладнання
 */
exports.bulkImportEquipment = async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 'Файл не завантажено', 400);
    }

    const results = await equipmentService.importEquipment(req.file.path, req.user);

    if (results.failed > 0) {
      res.json({
        success: true,
        message: `Імпорт завершено. Успішно: ${results.success}, Помилок: ${results.failed}`,
        data: results,
      });
    } else {
      sendSuccess(res, {
        message: `Імпорт успішно завершено. Додано: ${results.success} записів.`,
        stats: results,
      });
    }
  } catch (error) {
    logger.error('Помилка масового імпорту:', error);
    sendError(res, error.message || 'Помилка обробки файлу імпорту', 500);
  }
};

/**
 * Отримати список обладнання з фільтрами та пагінацією
 */
exports.getEquipment = async (req, res) => {
  try {
    const { page = 1, limit = 50, type, status, city, institution, assignedTo, search } = req.query;

    const query = {};

    // Фільтри
    if (type) {
      query.type = type;
    }
    if (status) {
      query.status = status;
    }
    if (city) {
      query.city = city;
    }
    if (institution) {
      query.institution = institution;
    }
    if (assignedTo) {
      query.assignedTo = assignedTo;
    }

    // Пошук
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
        { serialNumber: { $regex: search, $options: 'i' } },
        { inventoryNumber: { $regex: search, $options: 'i' } },
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
      Equipment.countDocuments(query),
    ]);

    sendSuccess(res, {
      equipment,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
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
        options: { sort: { createdAt: -1 }, limit: 10 },
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
      createdBy: req.user._id,
    };

    // Видаляємо inventoryNumber - він генерується автоматично
    delete equipmentData.inventoryNumber;

    // Очищаємо порожні рядки для ObjectId полів
    const objectIdFields = ['city', 'institution', 'assignedTo'];
    objectIdFields.forEach(field => {
      if (equipmentData[field] === '' || equipmentData[field] === null) {
        delete equipmentData[field];
      }
    });

    const equipment = new Equipment(equipmentData);
    await equipment.save();

    await equipment.populate([
      { path: 'city', select: 'name' },
      { path: 'institution', select: 'name' },
      { path: 'assignedTo', select: 'firstName lastName email' },
      { path: 'createdBy', select: 'firstName lastName' },
    ]);

    logger.info(
      `Створено нове обладнання: ${equipment.name} (${equipment._id}) користувачем ${req.user.email}`
    );
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
      updatedBy: req.user._id,
    };

    // Очищаємо порожні рядки для ObjectId полів
    const objectIdFields = ['city', 'institution', 'assignedTo'];
    objectIdFields.forEach(field => {
      if (updateData[field] === '' || updateData[field] === null) {
        delete updateData[field];
      }
    });

    const equipment = await Equipment.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate('city', 'name')
      .populate('institution', 'name')
      .populate('assignedTo', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName');

    if (!equipment) {
      return sendError(res, 'Обладнання не знайдено', 404);
    }

    logger.info(
      `Оновлено обладнання: ${equipment.name} (${equipment._id}) користувачем ${req.user.email}`
    );
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

    logger.info(
      `Видалено обладнання: ${equipment.name} (${equipment._id}) користувачем ${req.user.email}`
    );
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
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
          },
          repair: {
            $sum: { $cond: [{ $eq: ['$status', 'repair'] }, 1, 0] },
          },
          disposed: {
            $sum: { $cond: [{ $eq: ['$status', 'disposed'] }, 1, 0] },
          },
          underWarranty: {
            $sum: {
              $cond: [{ $gt: ['$warrantyExpiry', new Date()] }, 1, 0],
            },
          },
        },
      },
    ]);

    sendSuccess(res, {
      byType: stats,
      total: totalStats[0] || {
        total: 0,
        active: 0,
        repair: 0,
        disposed: 0,
        underWarranty: 0,
      },
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
