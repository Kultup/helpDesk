const User = require('../models/User');
const Position = require('../models/Position');
const City = require('../models/City');
const Ticket = require('../models/Ticket');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const telegramService = require('../services/telegramServiceInstance');
const registrationWebSocketService = require('../services/registrationWebSocketService');
const logger = require('../utils/logger');

// Отримати всіх користувачів з фільтрацією та пагінацією
exports.getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      role,
      position,
      city,
      isActive,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для перегляду списку користувачів'
      });
    }

    // Побудова фільтрів
    const filters = {};
    
    if (role) filters.role = role;
    if (position) filters.position = position;
    if (city) filters.city = city;
    // За замовчуванням показуємо тільки активних користувачів
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    } else {
      filters.isActive = true; // За замовчуванням тільки активні
    }
    
    // Пошук по тексту
    if (search) {
      filters.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { telegramUsername: { $regex: search, $options: 'i' } }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      populate: [
        { path: 'position', select: 'title department level' },
        { path: 'city', select: 'name region' }
      ],
      select: '-password -emailVerificationToken -passwordResetToken'
    };

    const users = await User.paginate(filters, options);

    res.json({
      success: true,
      data: users.docs,
      pagination: {
        currentPage: users.page,
        totalPages: users.totalPages,
        totalItems: users.totalDocs,
        hasNext: users.hasNextPage,
        hasPrev: users.hasPrevPage
      }
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні користувачів',
      error: error.message
    });
  }
};


// Отримати користувача за ID
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID користувача'
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin' && req.user._id.toString() !== id) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для перегляду цього користувача'
      });
    }

    const user = await User.findById(id)
      .populate('position', 'title department level permissions')
      .populate('city', 'name region coordinates')
      .select('-password -emailVerificationToken -passwordResetToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    // Отримати статистику користувача
    const [createdTickets, assignedTickets] = await Promise.all([
      Ticket.countDocuments({ createdBy: id }),
      Ticket.countDocuments({ assignedTo: id })
    ]);

    res.json({
      success: true,
      data: {
        ...user.toObject(),
        statistics: {
          createdTickets,
          assignedTickets
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні користувача',
      error: error.message
    });
  }
};

// Створити нового користувача
exports.createUser = async (req, res) => {
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
        message: 'Немає прав для створення користувачів'
      });
    }

    logger.info('📝 Дані для створення користувача:', req.body);
    
    const {
      firstName,
      lastName,
      email,
      password,
      role = 'user',
      department,
      position,
      city,
      telegramUsername,
      phone,
      isActive,
      permissions = []
    } = req.body;
    
    logger.info('🏢 Department value:', department);

    // Перевірка унікальності email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Користувач з таким email вже існує'
      });
    }

    // Перевірка існування посади
    if (position) {
      const positionExists = await Position.findById(position);
      if (!positionExists) {
        return res.status(400).json({
          success: false,
          message: 'Вказана посада не існує'
        });
      }
    }

    // Перевірка існування міста
    if (city) {
      const cityExists = await City.findById(city);
      if (!cityExists) {
        return res.status(400).json({
          success: false,
          message: 'Вказане місто не існує'
        });
      }
    }

    // Валідація permissions
    const validPermissions = [
      'create_tickets', 'edit_tickets', 'delete_tickets', 'assign_tickets',
      'view_all_tickets', 'view_analytics', 'export_data', 'manage_users',
      'manage_cities', 'manage_positions', 'system_settings', 'telegram_admin'
    ];
    
    const filteredPermissions = Array.isArray(permissions) 
      ? permissions.filter(p => validPermissions.includes(p))
      : [];

    const user = new User({
      firstName,
      lastName,
      email,
      password, // Пароль буде захешований в middleware моделі
      role,
      department,
      position,
      city,
      telegramUsername,
      phone,
      isActive: typeof isActive === 'boolean' ? isActive : true,
      isEmailVerified: true, // Адмін створює підтверджених користувачів
      registrationStatus: 'approved',
      permissions: filteredPermissions,
      createdBy: req.user._id
    });

    await user.save();

    // Заповнити дані для відповіді
    await user.populate([
      { path: 'position', select: 'title department' },
      { path: 'city', select: 'name region' }
    ]);

    // Видалити пароль з відповіді
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: 'Користувача успішно створено',
      data: userResponse
    });
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при створенні користувача',
      error: error.message
    });
  }
};

// Оновити користувача
exports.updateUser = async (req, res) => {
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
        message: 'Невірний ID користувача'
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin' && req.user._id.toString() !== id) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для редагування цього користувача'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    const {
      firstName,
      lastName,
      email,
      role,
      position,
      city,
      telegramUsername,
      phone,
      isActive,
      avatar,
      permissions
    } = req.body;

    // Перевірка унікальності email (якщо змінюється)
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Користувач з таким email вже існує'
        });
      }
    }

    // Тільки адміни можуть змінювати роль та статус активності
    if (req.user.role !== 'admin') {
      if (role !== undefined || isActive !== undefined) {
        return res.status(403).json({
          success: false,
          message: 'Немає прав для зміни ролі або статусу активності'
        });
      }
    }

    // Оновлення полів
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (email !== undefined) user.email = email;
    if (telegramUsername !== undefined) user.telegramUsername = telegramUsername;
    if (phone !== undefined) user.phone = phone;
    if (avatar !== undefined) user.avatar = avatar;
    
    // Поля, які може змінювати тільки адмін
    if (req.user.role === 'admin') {
      if (role !== undefined) user.role = role;
      
      // Оновлення permissions
      if (permissions !== undefined) {
        const validPermissions = [
          'create_tickets', 'edit_tickets', 'delete_tickets', 'assign_tickets',
          'view_all_tickets', 'view_analytics', 'export_data', 'manage_users',
          'manage_cities', 'manage_positions', 'system_settings', 'telegram_admin'
        ];
        
        // Якщо роль admin, то permissions не потрібні (адмін має всі права)
        if (role === 'admin') {
          user.permissions = [];
        } else {
          const filteredPermissions = Array.isArray(permissions) 
            ? permissions.filter(p => validPermissions.includes(p))
            : [];
          user.permissions = filteredPermissions;
        }
      }
      
      if (isActive !== undefined) user.isActive = isActive;
      if (position !== undefined) {
        if (position) {
          const positionExists = await Position.findById(position);
          if (!positionExists) {
            return res.status(400).json({
              success: false,
              message: 'Вказана посада не існує'
            });
          }
        }
        user.position = position;
      }
      if (city !== undefined) {
        if (city) {
          const cityExists = await City.findById(city);
          if (!cityExists) {
            return res.status(400).json({
              success: false,
              message: 'Вказане місто не існує'
            });
          }
        }
        user.city = city;
      }
    }

    user.lastModifiedBy = req.user._id;
    await user.save();

    // Заповнити дані для відповіді
    await user.populate([
      { path: 'position', select: 'title department' },
      { path: 'city', select: 'name region' }
    ]);

    // Видалити пароль з відповіді
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.emailVerificationToken;
    delete userResponse.passwordResetToken;

    res.json({
      success: true,
      message: 'Користувача успішно оновлено',
      data: userResponse
    });
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при оновленні користувача',
      error: error.message
    });
  }
};

// Видалити користувача (м'яке видалення)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID користувача'
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для видалення користувачів'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    // Не можна видалити самого себе
    if (user._id.equals(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'Не можна видалити самого себе'
      });
    }

    // Перевіряємо чи є у користувача активні тікети
    const Ticket = require('../models/Ticket');
    const activeTicketsCount = await Ticket.countDocuments({
      $or: [
        { createdBy: id },
        { assignedTo: id }
      ],
      status: { $in: ['open', 'in_progress'] }
    });

    if (activeTicketsCount > 0) {
      // М'яке видалення якщо є активні тікети
      user.isActive = false;
      user.deletedAt = new Date();
      user.deletedBy = req.user._id;
      await user.save();

      res.json({
        success: true,
        message: `Користувача деактивовано (має ${activeTicketsCount} активних тікетів)`
      });
    } else {
      // Повне видалення якщо немає активних тікетів
      await User.findByIdAndDelete(id);
      
      res.json({
        success: true,
        message: 'Користувача повністю видалено з системи'
      });
    }
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні користувача',
      error: error.message
    });
  }
};

// Деактивувати/активувати користувача
exports.toggleUserActive = async (req, res) => {
  try {
    logger.info('🔄 toggleUserActive викликано:', {
      userId: req.params.id,
      currentUser: req.user ? { id: req.user._id, role: req.user.role, email: req.user.email } : 'не знайдено',
      headers: req.headers.authorization ? 'токен присутній' : 'токен відсутній'
    });

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.info('❌ Невірний ID користувача:', id);
      return res.status(400).json({
        success: false,
        message: 'Невірний ID користувача'
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      logger.info('❌ Недостатньо прав:', { userRole: req.user.role, required: 'admin' });
      return res.status(403).json({
        success: false,
        message: 'Немає прав для зміни статусу користувачів'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    // Не можна деактивувати самого себе
    if (user._id.equals(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'Не можна змінити статус самого себе'
      });
    }

    // Перемикаємо статус активності
    const newActiveStatus = !user.isActive;
    user.isActive = newActiveStatus;
    
    if (newActiveStatus) {
      // Активуємо користувача
      user.deletedAt = null;
      user.deletedBy = null;
    } else {
      // Деактивуємо користувача
      user.deletedAt = new Date();
      user.deletedBy = req.user._id;
    }
    
    await user.save();

    res.json({
      success: true,
      message: newActiveStatus ? 'Користувача успішно активовано' : 'Користувача успішно деактивовано',
      data: {
        userId: user._id,
        isActive: user.isActive
      }
    });
  } catch (error) {
    logger.error('Error toggling user active status:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при зміні статусу користувача',
      error: error.message
    });
  }
};

// Масова зміна статусу користувачів
exports.bulkToggleUsers = async (req, res) => {
  try {
    logger.info('🔄 bulkToggleUsers викликано:', {
      userIds: req.body.userIds,
      action: req.body.action,
      currentUser: req.user ? { id: req.user._id, role: req.user.role, email: req.user.email } : 'не знайдено'
    });

    const { userIds, action } = req.body;

    // Валідація вхідних даних
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Необхідно вказати список ID користувачів'
      });
    }

    if (!['activate', 'deactivate'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Дія повинна бути "activate" або "deactivate"'
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      logger.info('❌ Недостатньо прав:', { userRole: req.user.role, required: 'admin' });
      return res.status(403).json({
        success: false,
        message: 'Немає прав для масової зміни статусу користувачів'
      });
    }

    // Валідація всіх ID
    const invalidIds = userIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Невірні ID користувачів: ${invalidIds.join(', ')}`
      });
    }

    // Знаходимо користувачів
    const users = await User.find({ _id: { $in: userIds } });
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Користувачів не знайдено'
      });
    }

    // Перевіряємо, чи не намагається адміністратор змінити свій власний статус
    const currentUserId = req.user._id.toString();
    const selfModification = userIds.includes(currentUserId);
    
    if (selfModification) {
      return res.status(400).json({
        success: false,
        message: 'Не можна змінити власний статус в масовій операції'
      });
    }

    const isActivating = action === 'activate';
    const updateData = {
      isActive: isActivating,
      ...(isActivating 
        ? { deletedAt: null, deletedBy: null }
        : { deletedAt: new Date(), deletedBy: req.user._id }
      )
    };

    // Виконуємо масове оновлення
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      updateData
    );

    // Отримуємо оновлених користувачів для відповіді
    const updatedUsers = await User.find({ _id: { $in: userIds } })
      .select('_id firstName lastName email isActive')
      .lean();

    res.json({
      success: true,
      message: `Успішно ${isActivating ? 'активовано' : 'деактивовано'} ${result.modifiedCount} користувачів`,
      data: {
        action,
        modifiedCount: result.modifiedCount,
        users: updatedUsers
      }
    });

  } catch (error) {
    logger.error('Error in bulk toggle users:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при масовій зміні статусу користувачів',
      error: error.message
    });
  }
};

// Змінити пароль
exports.changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID користувача'
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin' && req.user._id.toString() !== id) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для зміни пароля цього користувача'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    // Перевірка поточного пароля (тільки для власного акаунту)
    if (req.user._id.toString() === id) {
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Поточний пароль невірний'
        });
      }
    }

    // Валідація нового пароля
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Новий пароль повинен містити мінімум 6 символів'
      });
    }

    // Хешування нового пароля
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    user.password = hashedPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Пароль успішно змінено'
    });
  } catch (error) {
    logger.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при зміні пароля',
      error: error.message
    });
  }
};

// Отримати профіль поточного користувача
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('position', 'title department level permissions')
      .populate('city', 'name region coordinates')
      .select('-password -emailVerificationToken -passwordResetToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    // Отримати статистику користувача
    const [createdTickets, assignedTickets, recentActivity] = await Promise.all([
      Ticket.countDocuments({ createdBy: user._id }),
      Ticket.countDocuments({ assignedTo: user._id }),
      Ticket.find({
        $or: [
          { createdBy: user._id },
          { assignedTo: user._id }
        ]
      })
        .sort({ updatedAt: -1 })
        .limit(5)
        .populate('city', 'name')
        .select('title status priority updatedAt')
    ]);

    res.json({
      success: true,
      data: {
        ...user.toObject(),
        statistics: {
          createdTickets,
          assignedTickets
        },
        recentActivity
      }
    });
  } catch (error) {
    logger.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні профілю',
      error: error.message
    });
  }
};

// Оновити профіль поточного користувача
exports.updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    const {
      firstName,
      lastName,
      telegramUsername,
      phone,
      avatar
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    // Оновлення дозволених полів
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (telegramUsername !== undefined) user.telegramUsername = telegramUsername;
    if (phone !== undefined) user.phone = phone;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    // Заповнити дані для відповіді
    await user.populate([
      { path: 'position', select: 'title department' },
      { path: 'city', select: 'name region' }
    ]);

    // Видалити пароль з відповіді
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.emailVerificationToken;
    delete userResponse.passwordResetToken;

    res.json({
      success: true,
      message: 'Профіль успішно оновлено',
      data: userResponse
    });
  } catch (error) {
    logger.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при оновленні профілю',
      error: error.message
    });
  }
};

// Отримати статистику користувачів
exports.getUserStatistics = async (req, res) => {
  try {
    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для перегляду статистики користувачів'
      });
    }

    const statistics = await User.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
          adminUsers: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
          regularUsers: { $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] } },
          verifiedUsers: { $sum: { $cond: ['$emailVerified', 1, 0] } },
          usersWithTelegram: { 
            $sum: { 
              $cond: [
                { $and: [{ $ne: ['$telegramId', null] }, { $ne: ['$telegramId', ''] }] }, 
                1, 
                0
              ] 
            } 
          }
        }
      }
    ]);

    const stats = statistics[0] || {
      totalUsers: 0,
      activeUsers: 0,
      adminUsers: 0,
      regularUsers: 0,
      verifiedUsers: 0,
      usersWithTelegram: 0
    };

    // Статистика по містах
    const cityStats = await User.aggregate([
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
      {
        $group: {
          _id: '$city',
          cityName: { $first: '$cityInfo.name' },
          userCount: { $sum: 1 }
        }
      },
      { $sort: { userCount: -1 } },
      { $limit: 10 }
    ]);

    // Статистика по посадах
    const positionStats = await User.aggregate([
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
      {
        $group: {
          _id: '$position',
          positionTitle: { $first: '$positionInfo.title' },
          userCount: { $sum: 1 }
        }
      },
      { $sort: { userCount: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        general: stats,
        byCity: cityStats,
        byPosition: positionStats,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    logger.error('Error fetching user statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні статистики користувачів',
      error: error.message
    });
  }
};

// Отримати список адміністраторів для присвоєння тікетів
exports.getAdmins = async (req, res) => {
  try {
    const admins = await User.find({
      role: 'admin',
      isActive: true
    })
    .select('_id firstName lastName email position')
    .populate('position', 'title department')
    .sort({ firstName: 1, lastName: 1 });

    res.json({
      success: true,
      data: admins
    });
  } catch (error) {
    logger.error('Error fetching admins:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні списку адміністраторів',
      error: error.message
    });
  }
};

// Отримати список користувачів з pending статусом
exports.getPendingRegistrations = async (req, res) => {
  try {
    logger.info('🔍 getPendingRegistrations called');
    logger.info('👤 User:', req.user?.email, req.user?.role);
    logger.info('📋 Query params:', req.query);
    
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      populate: [
        { path: 'position', select: 'title department' },
        { path: 'city', select: 'name region' }
      ],
      select: '-password'
    };

    const pendingUsers = await User.paginate(
      { registrationStatus: 'pending' },
      options
    );

    res.json({
      success: true,
      data: pendingUsers.docs,
      pagination: {
        currentPage: pendingUsers.page,
        totalPages: pendingUsers.totalPages,
        totalItems: pendingUsers.totalDocs,
        hasNextPage: pendingUsers.hasNextPage,
        hasPrevPage: pendingUsers.hasPrevPage
      }
    });
  } catch (error) {
    logger.error('Error fetching pending registrations:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні списку заявок на реєстрацію',
      error: error.message
    });
  }
};

// Підтвердити реєстрацію користувача
exports.approveRegistration = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    if (user.registrationStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Реєстрація вже була оброблена'
      });
    }

    user.registrationStatus = 'approved';
    user.isActive = true;
    await user.save();

    // Відправити сповіщення в Telegram
    try {
      await telegramService.sendRegistrationApprovedNotification(user);
    } catch (telegramError) {
      logger.error('Помилка відправки Telegram сповіщення:', telegramError);
      // Не зупиняємо виконання, якщо Telegram сповіщення не вдалося
    }

    // Відправити WebSocket сповіщення
     try {
       registrationWebSocketService.notifyRegistrationStatusChange({
         _id: user._id,
         firstName: user.firstName,
         lastName: user.lastName,
         email: user.email
       }, 'pending', 'approved');

       // Отримати оновлену кількість запитів на реєстрацію
       const pendingCount = await User.countDocuments({ registrationStatus: 'pending' });
       registrationWebSocketService.notifyRegistrationCountUpdate(pendingCount);
     } catch (wsError) {
       logger.error('Помилка відправки WebSocket сповіщення:', wsError);
     }

    // Отримати оновленого користувача з заповненими полями
    const updatedUser = await User.findById(id)
      .populate('position', 'title department')
      .populate('city', 'name region')
      .select('-password');

    res.json({
      success: true,
      message: 'Реєстрацію користувача підтверджено',
      data: updatedUser
    });
  } catch (error) {
    logger.error('Error approving registration:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при підтвердженні реєстрації',
      error: error.message
    });
  }
};

// Відхилити реєстрацію користувача
exports.rejectRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    if (user.registrationStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Реєстрація вже була оброблена'
      });
    }

    // Зберігаємо дані користувача для сповіщень перед видаленням
    const userDataForNotification = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      telegramId: user.telegramId
    };

    // Відправити сповіщення в Telegram перед видаленням
    try {
      await telegramService.sendRegistrationRejectedNotification(user, reason);
    } catch (telegramError) {
      logger.error('Помилка відправки Telegram сповіщення:', telegramError);
      // Не зупиняємо виконання, якщо Telegram сповіщення не вдалося
    }

    // Відправити WebSocket сповіщення перед видаленням
     try {
       registrationWebSocketService.notifyRegistrationStatusChange(userDataForNotification, 'pending', 'rejected');

       // Отримати оновлену кількість запитів на реєстрацію (після видалення)
       const pendingCount = await User.countDocuments({ registrationStatus: 'pending' }) - 1; // -1 бо користувач ще не видалений
       registrationWebSocketService.notifyRegistrationCountUpdate(Math.max(0, pendingCount));
     } catch (wsError) {
       logger.error('Помилка відправки WebSocket сповіщення:', wsError);
     }

    // Видаляємо користувача з бази даних замість збереження зі статусом rejected
    await User.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Реєстрацію користувача відхилено та видалено з системи',
      data: { deletedUserId: id }
    });
  } catch (error) {
    logger.error('Error rejecting registration:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при відхиленні реєстрації',
      error: error.message
    });
  }
};

// Очистити застарілі реєстрації
exports.cleanupRegistrations = async (req, res) => {
  try {
    const { runCleanupNow } = require('../jobs/cleanupJob');
    
    const result = await runCleanupNow();
    
    res.json({
      success: true,
      message: `Очищення завершено. Видалено ${result.total} записів`,
      data: {
        pending: {
          cleaned: result.pending.cleaned,
          details: result.pending.details
        },
        rejected: {
          cleaned: result.rejected.cleaned,
          details: result.rejected.details
        },
        total: result.total
      }
    });
  } catch (error) {
    logger.error('Error cleaning up registrations:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при очищенні реєстрацій',
      error: error.message
    });
  }
};

// Повне видалення користувача (force delete)
exports.forceDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID користувача'
      });
    }

    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для видалення користувачів'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    // Не можна видалити самого себе
    if (user._id.equals(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'Не можна видалити самого себе'
      });
    }

    // Перевіряємо чи є у користувача активні тікети
    const Ticket = require('../models/Ticket');
    const activeTicketsCount = await Ticket.countDocuments({
      $or: [
        { createdBy: id },
        { assignedTo: id }
      ],
      status: { $in: ['open', 'in_progress'] }
    });

    const allTicketsCount = await Ticket.countDocuments({
      $or: [
        { createdBy: id },
        { assignedTo: id }
      ]
    });

    // Зберігаємо інформацію про користувача для логування
    const userInfo = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    };

    // Повне видалення користувача з бази даних
    await User.findByIdAndDelete(id);
    
    logger.info(`🗑️ Користувача повністю видалено:`, {
      ...userInfo,
      activeTickets: activeTicketsCount,
      totalTickets: allTicketsCount,
      deletedBy: req.user.email
    });

    res.json({
      success: true,
      message: activeTicketsCount > 0 
        ? `Користувача повністю видалено з системи (було ${activeTicketsCount} активних тікетів та ${allTicketsCount} загалом)`
        : 'Користувача повністю видалено з системи',
      data: {
        deletedUser: userInfo,
        activeTicketsCount,
        totalTicketsCount: allTicketsCount
      }
    });
  } catch (error) {
    logger.error('Error force deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при повному видаленні користувача',
      error: error.message
    });
  }
};
