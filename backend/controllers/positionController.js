const { validationResult } = require('express-validator');
const Position = require('../models/Position');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const mongoose = require('mongoose');
const csv = require('json2csv').parse;
const ExcelJS = require('exceljs');
const logger = require('../utils/logger');

// Отримати всі посади
const getAllPositions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      department,
      level,
      category,
      search,
      sortBy = 'title',
      sortOrder = 'asc',
      withStatistics = false,
      isPublic
    } = req.query;

    // Побудова фільтрів
    const filters = { isActive: true };
    
    if (department) filters.department = department;
    if (level) filters.level = level;
    if (category) filters.category = category;
    if (isPublic !== undefined) filters.isPublic = isPublic === 'true';
    
    // Пошук по назві посади
    if (search) {
      filters.$or = [
        { title: { $regex: search, $options: 'i' } },
        { titleEn: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } },
        { departmentEn: { $regex: search, $options: 'i' } }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
    };

    const positions = await Position.paginate(filters, options);

    // Додати статистику якщо потрібно
    if (withStatistics === 'true') {
      for (let position of positions.docs) {
        const [userCount, ticketCount] = await Promise.all([
          User.countDocuments({ position: position._id, isActive: true }),
          Ticket.countDocuments({ 
            $or: [
              { 'createdBy': { $in: await User.find({ position: position._id }).distinct('_id') } },
              { 'assignedTo': { $in: await User.find({ position: position._id }).distinct('_id') } }
            ]
          })
        ]);
        
        position._doc.statistics = {
          userCount,
          ticketCount
        };
      }
    }

    res.json({
      success: true,
      data: positions.docs,
      pagination: {
        currentPage: positions.page,
        totalPages: positions.totalPages,
        totalItems: positions.totalDocs,
        hasNext: positions.hasNextPage,
        hasPrev: positions.hasPrevPage
      }
    });
  } catch (error) {
    logger.error('Error fetching positions:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні посад',
      error: error.message
    });
  }
};

// Експорт посад
const exportPositions = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Помилка валідації',
        errors: errors.array()
      });
    }

    const { 
      format = 'csv', 
      includeInactive = false, 
      includeStatistics = false,
      includeEmployees = false 
    } = req.query;

    const filter = {};
    if (!includeInactive) filter.isActive = true;

    let positions = await Position.find(filter)
      .populate('parentPosition', 'title department')
      .populate('createdBy', 'email firstName lastName')
      .sort({ department: 1, title: 1 });

    // Додаємо додаткову інформацію якщо потрібно
    if (includeStatistics || includeEmployees) {
      positions = await Promise.all(
        positions.map(async (pos) => {
          const positionData = pos.toObject();
          
          if (includeEmployees) {
            const employees = await User.find({ position: pos._id, isActive: true })
              .select('firstName lastName email');
            positionData.employees = employees;
            positionData.employeeCount = employees.length;
          }
          
          if (includeStatistics) {
            const ticketStats = await Ticket.aggregate([
              {
                $lookup: {
                  from: 'users',
                  localField: 'assignedTo',
                  foreignField: '_id',
                  as: 'assignedUser'
                }
              },
              {
                $match: {
                  'assignedUser.position': pos._id
                }
              },
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 }
                }
              }
            ]);
            
            positionData.ticketStats = ticketStats.reduce((acc, stat) => {
              acc[stat._id] = stat.count;
              return acc;
            }, {});
          }
          
          return positionData;
        })
      );
    }

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Посади');

      // Заголовки
      const headers = [
        'ID', 'Назва', 'Департамент', 'Рівень', 'Опис', 'Тип роботи', 'Графік роботи',
        'Мін. зарплата', 'Макс. зарплата', 'Валюта', 'Макс. співробітників', 
        'Активна', 'Батьківська посада', 'Створено', 'Оновлено'
      ];

      if (includeEmployees) {
        headers.push('Кількість співробітників', 'Співробітники');
      }

      if (includeStatistics) {
        headers.push('Відкриті тикети', 'В роботі', 'Вирішені', 'Закриті');
      }

      worksheet.addRow(headers);

      // Дані
      positions.forEach(pos => {
        const row = [
          pos._id.toString(),
          pos.title,
          pos.department,
          pos.level,
          pos.description || '',
          pos.workType,
          pos.workSchedule,
          pos.salary?.min || '',
          pos.salary?.max || '',
          pos.salary?.currency || '',
          pos.maxEmployees || '',
          pos.isActive ? 'Так' : 'Ні',
          pos.parentPosition?.title || '',
          pos.createdAt?.toLocaleDateString('uk-UA') || '',
          pos.updatedAt?.toLocaleDateString('uk-UA') || ''
        ];

        if (includeEmployees) {
          row.push(
            pos.employeeCount || 0,
            pos.employees?.map(emp => `${emp.firstName} ${emp.lastName} (${emp.email})`).join('; ') || ''
          );
        }

        if (includeStatistics) {
          row.push(
            pos.ticketStats?.open || 0,
            pos.ticketStats?.in_progress || 0,
            pos.ticketStats?.resolved || 0,
            pos.ticketStats?.closed || 0
          );
        }

        worksheet.addRow(row);
      });

      // Стилізація заголовків
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=positions_${new Date().toISOString().split('T')[0]}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } else {
      // CSV формат
      const csvData = positions.map(pos => {
        const data = {
          id: pos._id.toString(),
          title: pos.title,
          department: pos.department,
          level: pos.level,
          description: pos.description || '',
          workType: pos.workType,
          workSchedule: pos.workSchedule,
          minSalary: pos.salary?.min || '',
          maxSalary: pos.salary?.max || '',
          currency: pos.salary?.currency || '',
          maxEmployees: pos.maxEmployees || '',
          isActive: pos.isActive ? 'Так' : 'Ні',
          parentPosition: pos.parentPosition?.title || '',
          createdAt: pos.createdAt?.toLocaleDateString('uk-UA') || '',
          updatedAt: pos.updatedAt?.toLocaleDateString('uk-UA') || ''
        };

        if (includeEmployees) {
          data.employeeCount = pos.employeeCount || 0;
          data.employees = pos.employees?.map(emp => `${emp.firstName} ${emp.lastName} (${emp.email})`).join('; ') || '';
        }

        if (includeStatistics) {
          data.openTickets = pos.ticketStats?.open || 0;
          data.inProgressTickets = pos.ticketStats?.in_progress || 0;
          data.resolvedTickets = pos.ticketStats?.resolved || 0;
          data.closedTickets = pos.ticketStats?.closed || 0;
        }

        return data;
      });

      const csvString = csv(csvData);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=positions_${new Date().toISOString().split('T')[0]}.csv`);
      res.write('\uFEFF'); // BOM для правильного відображення українських символів
      res.end(csvString);
    }
  } catch (error) {
    logger.error('Помилка при експорті посад:', error);
    res.status(500).json({ 
      message: 'Помилка сервера при експорті посад', 
      error: error.message 
    });
  }
};

// Отримати посаду за ID
const getPositionById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID посади'
      });
    }

    const position = await Position.findById(id);

    if (!position) {
      return res.status(404).json({
        success: false,
        message: 'Посаду не знайдено'
      });
    }

    // Отримати статистику посади
    const users = await User.find({ position: id, isActive: true })
      .select('firstName lastName email')
      .limit(10);

    const [userCount, ticketCount, subordinates] = await Promise.all([
      User.countDocuments({ position: id, isActive: true }),
      Ticket.countDocuments({ 
        $or: [
          { 'createdBy': { $in: await User.find({ position: id }).distinct('_id') } },
          { 'assignedTo': { $in: await User.find({ position: id }).distinct('_id') } }
        ]
      }),
      position.getSubordinates()
    ]);

    // Статистика по тикетах користувачів цієї посади
    const userIds = await User.find({ position: id }).distinct('_id');
    const ticketStatusStats = await Ticket.aggregate([
      { 
        $match: { 
          $or: [
            { createdBy: { $in: userIds } },
            { assignedTo: { $in: userIds } }
          ]
        }
      },
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
        ...position.toObject(),
        statistics: {
          userCount,
          ticketCount,
          ticketStatusStats: ticketStatusStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
          users: users.slice(0, 5), // Показати тільки перших 5 користувачів
          subordinatePositions: subordinates.length
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching position:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні посади',
      error: error.message
    });
  }
};

// Створити нову посаду
const createPosition = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
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
        message: 'Немає прав для створення посад'
      });
    }

    const {
      title,
      titleEn,
      department,
      departmentEn,
      level,
      category,
      responsibilities,
      requirements,
      skills,
      salary,
      workSchedule,
      reportingTo,
      permissions,
      isPublic,
      description
    } = req.body;

    // Перевірка унікальності назви посади в межах департаменту
    const existingPosition = await Position.findOne({ 
      title: { $regex: new RegExp(`^${title}$`, 'i') },
      department: { $regex: new RegExp(`^${department}$`, 'i') }
    });
    
    if (existingPosition) {
      return res.status(400).json({
        success: false,
        message: 'Посада з такою назвою вже існує в цьому департаменті'
      });
    }

    // Перевірка існування керівної посади
    if (reportingTo && reportingTo.trim() !== '') {
      const managerPosition = await Position.findById(reportingTo);
      if (!managerPosition) {
        return res.status(400).json({
          success: false,
          message: 'Вказана керівна посада не існує'
        });
      }
    }

    // Обробка reportingTo - якщо порожній рядок, встановлюємо null
    const processedReportingTo = reportingTo && reportingTo.trim() !== '' ? reportingTo : null;

    const position = new Position({
      title,
      titleEn,
      department,
      departmentEn,
      level,
      category,
      responsibilities,
      requirements,
      skills,
      salary,
      workSchedule,
      reportingTo: processedReportingTo,
      permissions: permissions || [],
      isPublic: isPublic !== undefined ? isPublic : true,
      description,
      createdBy: req.user._id
    });

    await position.save();

    res.status(201).json({
      success: true,
      message: 'Посаду успішно створено',
      data: position
    });
  } catch (error) {
    logger.error('Error creating position:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при створенні посади',
      error: error.message
    });
  }
};

// Оновити посаду
const updatePosition = async (req, res) => {
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
        message: 'Невірний ID посади'
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для редагування посад'
      });
    }

    const position = await Position.findById(id);
    if (!position) {
      return res.status(404).json({
        success: false,
        message: 'Посаду не знайдено'
      });
    }

    const {
      title,
      titleEn,
      department,
      departmentEn,
      level,
      category,
      responsibilities,
      requirements,
      skills,
      salary,
      workSchedule,
      reportingTo,
      permissions,
      isPublic,
      isActive,
      description
    } = req.body;

    // Перевірка унікальності назви посади (якщо змінюється)
    if ((title && title !== position.title) || (department && department !== position.department)) {
      const existingPosition = await Position.findOne({ 
        title: { $regex: new RegExp(`^${title || position.title}$`, 'i') },
        department: { $regex: new RegExp(`^${department || position.department}$`, 'i') },
        _id: { $ne: id }
      });
      
      if (existingPosition) {
        return res.status(400).json({
          success: false,
          message: 'Посада з такою назвою вже існує в цьому департаменті'
        });
      }
    }

    // Обробка reportingTo - якщо порожній рядок, встановлюємо null
    const processedReportingTo = reportingTo !== undefined ? 
      (reportingTo && reportingTo.trim() !== '' ? reportingTo : null) : 
      undefined;

    // Перевірка існування керівної посади
    if (processedReportingTo && processedReportingTo !== position.reportingTo?.toString()) {
      if (processedReportingTo === id) {
        return res.status(400).json({
          success: false,
          message: 'Посада не може звітувати сама собі'
        });
      }

      const managerPosition = await Position.findById(processedReportingTo);
      if (!managerPosition) {
        return res.status(400).json({
          success: false,
          message: 'Вказана керівна посада не існує'
        });
      }
    }

    // Оновлення полів
    if (title !== undefined) position.title = title;
    if (titleEn !== undefined) position.titleEn = titleEn;
    if (department !== undefined) position.department = department;
    if (departmentEn !== undefined) position.departmentEn = departmentEn;
    if (level !== undefined) position.level = level;
    if (category !== undefined) position.category = category;
    if (responsibilities !== undefined) position.responsibilities = responsibilities;
    if (requirements !== undefined) position.requirements = requirements;
    if (skills !== undefined) position.skills = skills;
    if (salary !== undefined) position.salary = salary;
    if (workSchedule !== undefined) position.workSchedule = workSchedule;
    if (processedReportingTo !== undefined) position.reportingTo = processedReportingTo;
    if (permissions !== undefined) position.permissions = permissions;
    if (isPublic !== undefined) position.isPublic = isPublic;
    if (isActive !== undefined) position.isActive = isActive;
    if (description !== undefined) position.description = description;

    position.lastModifiedBy = req.user._id;
    await position.save();

    res.json({
      success: true,
      message: 'Посаду успішно оновлено',
      data: position
    });
  } catch (error) {
    logger.error('Error updating position:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при оновленні посади',
      error: error.message
    });
  }
};

// Видалити посаду
const deletePosition = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID посади'
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для видалення посад'
      });
    }

    const position = await Position.findById(id);
    if (!position) {
      return res.status(404).json({
        success: false,
        message: 'Посаду не знайдено'
      });
    }

    // Перевірка чи є користувачі пов'язані з цією посадою
    const userCount = await User.countDocuments({ position: id });
    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Не можна видалити посаду. З нею пов'язано ${userCount} користувачів. Спочатку деактивуйте посаду.`
      });
    }

    // Перевірка чи є підлеглі посади
    const subordinateCount = await Position.countDocuments({ reportingTo: id });
    if (subordinateCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Не можна видалити посаду. Вона має ${subordinateCount} підлеглих посад. Спочатку змініть їх керівництво.`
      });
    }

    await Position.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Посаду успішно видалено'
    });
  } catch (error) {
    logger.error('Error deleting position:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні посади',
      error: error.message
    });
  }
};

// Отримати список департаментів
const getDepartments = async (req, res) => {
  try {
    const departments = await Position.getDepartments();
    
    res.json({
      success: true,
      data: departments
    });
  } catch (error) {
    logger.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні департаментів',
      error: error.message
    });
  }
};

// Пошук посад
const searchPositions = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Помилка валідації',
        errors: errors.array()
      });
    }

    const { q, page = 1, limit = 10, department, level } = req.query;

    const filter = {
      $or: [
        { title: new RegExp(q, 'i') },
        { department: new RegExp(q, 'i') },
        { description: new RegExp(q, 'i') },
        { requirements: { $in: [new RegExp(q, 'i')] } },
        { responsibilities: { $in: [new RegExp(q, 'i')] } }
      ]
    };

    if (department) filter.department = new RegExp(department, 'i');
    if (level) filter.level = level;

    const positions = await Position.find(filter)
      .populate('parentPosition', 'title department')
      .sort({ title: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Position.countDocuments(filter);

    res.json({
      positions,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    logger.error('Помилка при пошуку посад:', error);
    res.status(500).json({ 
      message: 'Помилка сервера при пошуку посад', 
      error: error.message 
    });
  }
};

// Отримати ієрархію посад
const getPositionHierarchy = async (req, res) => {
  try {
    const { department } = req.query;
    
    const hierarchy = await Position.getHierarchy(department);
    
    res.json({
      success: true,
      data: hierarchy
    });
  } catch (error) {
    logger.error('Error fetching position hierarchy:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні ієрархії посад',
      error: error.message
    });
  }
};

// Отримати підлеглі посади
const getSubordinates = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID посади'
      });
    }

    const position = await Position.findById(id);
    if (!position) {
      return res.status(404).json({
        success: false,
        message: 'Посаду не знайдено'
      });
    }

    const subordinates = await position.getSubordinates();
    
    res.json({
      success: true,
      data: subordinates
    });
  } catch (error) {
    logger.error('Error fetching subordinates:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні підлеглих посад',
      error: error.message
    });
  }
};

// Отримати співробітників посади
const getPositionEmployees = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID посади'
      });
    }

    const position = await Position.findById(id);
    if (!position) {
      return res.status(404).json({
        success: false,
        message: 'Посаду не знайдено'
      });
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { firstName: 1 },
      populate: [
        { path: 'city', select: 'name region' }
      ],
      select: '-password -emailVerificationToken -passwordResetToken'
    };

    const employees = await User.paginate(
      { position: id, isActive: true }, 
      options
    );
    
    res.json({
      success: true,
      data: employees.docs,
      pagination: {
        currentPage: employees.page,
        totalPages: employees.totalPages,
        totalItems: employees.totalDocs,
        hasNext: employees.hasNextPage,
        hasPrev: employees.hasPrevPage
      }
    });
  } catch (error) {
    logger.error('Error fetching position employees:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні співробітників посади',
      error: error.message
    });
  }
};

// Отримати статистику посад
const getPositionStatistics = async (req, res) => {
  try {
    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для перегляду статистики посад'
      });
    }

    const { department, level, category } = req.query;

    // Загальна статистика
    const generalStats = await Position.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          totalPositions: { $sum: 1 },
          publicPositions: { $sum: { $cond: ['$isPublic', 1, 0] } },
          avgSalaryMin: { $avg: '$salary.min' },
          avgSalaryMax: { $avg: '$salary.max' }
        }
      }
    ]);

    // Статистика по департаментах
    const departmentStats = await Position.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$department',
          positionCount: { $sum: 1 },
          avgSalaryMin: { $avg: '$salary.min' },
          avgSalaryMax: { $avg: '$salary.max' }
        }
      },
      { $sort: { positionCount: -1 } }
    ]);

    // Статистика по рівнях
    const levelStats = await Position.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$level',
          positionCount: { $sum: 1 },
          avgSalaryMin: { $avg: '$salary.min' },
          avgSalaryMax: { $avg: '$salary.max' }
        }
      },
      { $sort: { positionCount: -1 } }
    ]);

    // Топ посад за кількістю співробітників
    const positionEmployeeStats = await User.aggregate([
      { $match: { isActive: true, position: { $ne: null } } },
      {
        $lookup: {
          from: 'positions',
          localField: 'position',
          foreignField: '_id',
          as: 'positionInfo'
        }
      },
      { $unwind: '$positionInfo' },
      ...(department ? [{ $match: { 'positionInfo.department': department } }] : []),
      ...(level ? [{ $match: { 'positionInfo.level': level } }] : []),
      ...(category ? [{ $match: { 'positionInfo.category': category } }] : []),
      {
        $group: {
          _id: '$position',
          positionTitle: { $first: '$positionInfo.title' },
          department: { $first: '$positionInfo.department' },
          level: { $first: '$positionInfo.level' },
          employeeCount: { $sum: 1 }
        }
      },
      { $sort: { employeeCount: -1 } },
      { $limit: 10 }
    ]);

    const stats = generalStats[0] || {
      totalPositions: 0,
      publicPositions: 0,
      avgSalaryMin: 0,
      avgSalaryMax: 0
    };

    res.json({
      success: true,
      data: {
        general: stats,
        byDepartment: departmentStats,
        byLevel: levelStats,
        topPositionsByEmployees: positionEmployeeStats,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    logger.error('Error fetching position statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні статистики посад',
      error: error.message
    });
  }
};

// Масове видалення посад
const bulkDeletePositions = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    const { positionIds } = req.body;

    // Перевірка чи існують посади
    const positions = await Position.find({ _id: { $in: positionIds } });
    if (positions.length !== positionIds.length) {
      return res.status(404).json({
        success: false,
        message: 'Деякі посади не знайдено'
      });
    }

    // Перевірка чи є користувачі пов'язані з цими посадами
    const userCount = await User.countDocuments({ position: { $in: positionIds } });
    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Неможливо видалити посади, оскільки з ними пов\'язані користувачі'
      });
    }

    // Видалення посад
    const result = await Position.deleteMany({ _id: { $in: positionIds } });

    res.json({
      success: true,
      message: `Успішно видалено ${result.deletedCount} посад`,
      data: {
        deletedCount: result.deletedCount
      }
    });

  } catch (error) {
    logger.error('Помилка масового видалення посад:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при масовому видаленні',
      error: error.message
    });
  }
};

module.exports = {
  getAllPositions,
  getPositionById,
  createPosition,
  updatePosition,
  deletePosition,
  searchPositions,
  getDepartments,
  getPositionHierarchy,
  getSubordinates,
  getPositionEmployees,
  getPositionStatistics,
  exportPositions,
  bulkDeletePositions
};
