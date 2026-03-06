const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const registrationWebSocketService = require('../services/registrationWebSocketService');

const router = express.Router();

// Схеми валідації
const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Невірний формат email',
    'any.required': "Email є обов'язковим",
  }),
  login: Joi.string()
    .min(3)
    .max(50)
    .pattern(/^[a-zA-Z0-9_]+$/)
    .required()
    .messages({
      'string.min': 'Логін повинен містити мінімум 3 символи',
      'string.max': 'Логін не може перевищувати 50 символів',
      'string.pattern.base': 'Логін може містити тільки латинські літери, цифри та підкреслення',
      'any.required': "Логін є обов'язковим",
    }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Пароль повинен містити мінімум 6 символів',
    'any.required': "Пароль є обов'язковим",
  }),
  firstName: Joi.string().max(50).required().messages({
    'string.max': "Ім'я не може перевищувати 50 символів",
    'any.required': "Ім'я є обов'язковим",
  }),
  lastName: Joi.string().max(50).required().messages({
    'string.max': 'Прізвище не може перевищувати 50 символів',
    'any.required': "Прізвище є обов'язковим",
  }),
  position: Joi.string().required().messages({
    'any.required': "Посада є обов'язковою",
  }),
  department: Joi.string().allow('').optional().default('').messages({
    'string.base': 'Відділ повинен бути рядком',
  }),
  city: Joi.string().required().messages({
    'any.required': "Місто є обов'язковим",
  }),
  phone: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Невірний формат номера телефону',
    }),
  telegramId: Joi.string().optional().messages({
    'string.base': 'Telegram ID повинен бути рядком',
  }),
  institution: Joi.string().optional().messages({
    'string.base': 'Institution ID повинен бути рядком',
  }),
});

const loginSchema = Joi.object({
  login: Joi.string().min(3).max(50).required().messages({
    'string.min': 'Логін повинен містити мінімум 3 символи',
    'string.max': 'Логін не може перевищувати 50 символів',
    'any.required': "Логін є обов'язковим",
  }),
  password: Joi.string().required().messages({
    'any.required': "Пароль є обов'язковим",
  }),
  device: Joi.object({
    deviceId: Joi.string().min(3).max(200).required(),
    platform: Joi.string().valid('android', 'ios', 'web', 'other').optional(),
    manufacturer: Joi.string().allow(null, '').optional(),
    model: Joi.string().allow(null, '').optional(),
    osVersion: Joi.string().allow(null, '').optional(),
    sdkInt: Joi.number().integer().allow(null).optional(),
    appVersion: Joi.string().allow(null, '').optional(),
    pushToken: Joi.string().allow(null, '').optional(),
    label: Joi.string().allow(null, '').optional(),
  }).optional(),
});

// Функція для генерації JWT токена
const generateToken = userId => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '3650d',
  });
};

// @route   POST /api/auth/register
// @desc    Реєстрація нового користувача
// @access  Public
router.post('/register', async (req, res) => {
  try {
    logger.info('🚀 Початок процесу реєстрації користувача');

    // Валідація даних
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const {
      email,
      login: providedLogin,
      password,
      firstName,
      lastName,
      position,
      department,
      city,
      phone,
      telegramId,
      institution,
    } = value;

    // Перевірка чи користувач вже існує (включаючи неактивних та pending)
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      // Якщо користувач існує і має статус pending
      if (existingUser.registrationStatus === 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Заявка з цим email вже подана і очікує розгляду адміністратора',
        });
      }

      // Якщо користувач існує і має статус rejected
      if (existingUser.registrationStatus === 'rejected') {
        return res.status(400).json({
          success: false,
          message: 'Реєстрація з цим email була відхилена. Зверніться до адміністратора',
        });
      }

      // Якщо користувач існує і активний
      if (existingUser.isActive && existingUser.registrationStatus === 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Користувач з таким email вже зареєстрований',
        });
      }

      // Якщо користувач існує але неактивний (м'яко видалений)
      if (!existingUser.isActive && existingUser.deletedAt) {
        return res.status(400).json({
          success: false,
          message:
            'Цей email був раніше використаний. Зверніться до адміністратора для відновлення доступу',
        });
      }
    }

    // Перевірка унікальності логіну
    const normalizedLogin = providedLogin.toLowerCase().trim();
    const existingUserWithLogin = await User.findOne({ login: normalizedLogin });

    if (existingUserWithLogin) {
      return res.status(400).json({
        success: false,
        message: 'Користувач з таким логіном вже існує',
      });
    }

    // Створення нового користувача зі статусом pending
    const user = new User({
      email: email.toLowerCase(),
      login: normalizedLogin,
      password,
      firstName,
      lastName,
      position,
      department: department || undefined, // Якщо порожній рядок, використовуємо undefined для значення за замовчуванням
      city,
      phone,
      telegramId,
      institution: institution || undefined,
      registrationStatus: 'pending',
      isActive: false,
    });

    await user.save();
    logger.info('💾 Користувач збережений в базі даних:', user.email);

    // Відправка WebSocket сповіщення про нову реєстрацію
    try {
      logger.info('📡 Спроба відправити WebSocket сповіщення про нову реєстрацію');
      logger.info('🔍 WebSocket сервіс ініціалізований:', !!registrationWebSocketService.io);

      await registrationWebSocketService.notifyNewRegistrationRequest(user);
      logger.info('✅ WebSocket сповіщення про нову реєстрацію відправлено успішно');

      // Отримуємо оновлену кількість запитів на реєстрацію та відправляємо оновлення
      const pendingCount = await User.countDocuments({ registrationStatus: 'pending' });
      registrationWebSocketService.notifyRegistrationCountUpdate(pendingCount);
      logger.info('✅ WebSocket оновлення кількості реєстрацій відправлено:', pendingCount);
    } catch (error) {
      logger.error('❌ Помилка при відправці WebSocket сповіщення:', error);
    }

    // Відправка FCM сповіщення адміністраторам про нову реєстрацію
    try {
      logger.info('📱 Спроба відправки FCM сповіщення адміністраторам про нову реєстрацію');
      const fcmService = require('../services/fcmService');
      const adminCount = await fcmService.sendToAdmins({
        title: '👤 Новий запит на реєстрацію',
        body: `${user.firstName} ${user.lastName} (${user.email}) подала заявку на реєстрацію`,
        type: 'registration_request',
        data: {
          userId: user._id.toString(),
          userEmail: user.email,
          userName: `${user.firstName} ${user.lastName}`,
          registrationStatus: user.registrationStatus,
        },
      });
      logger.info(
        `✅ FCM сповіщення про нову реєстрацію відправлено ${adminCount} адміністраторам`
      );
    } catch (error) {
      logger.error('❌ Помилка відправки FCM сповіщення про нову реєстрацію:', error);
      logger.error('   Stack:', error.stack);
      // Не зупиняємо виконання, якщо сповіщення не вдалося відправити
    }

    // Отримання користувача з заповненими полями
    const populatedUser = await User.findById(user._id)
      .populate('position')
      .populate('city')
      .select('-password');

    res.status(201).json({
      success: true,
      message: 'Заявку на реєстрацію подано. Очікуйте підтвердження від адміністратора.',
      data: {
        user: populatedUser,
      },
    });
  } catch (error) {
    logger.error('Помилка реєстрації:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при реєстрації',
    });
  }
});

// @route   POST /api/auth/login
// @desc    Авторизація користувача
// @access  Public
router.post('/login', async (req, res) => {
  try {
    // Валідація даних
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { login, password, device } = value;

    // Пошук користувача за логіном (логін завжди в нижньому регістрі)
    const user = await User.findOne({ login: login.toLowerCase() })
      .select('+password')
      .populate('position')
      .populate('city');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Невірний логін або пароль',
      });
    }

    // Перевірка статусу реєстрації
    if (user.registrationStatus === 'pending') {
      return res.status(401).json({
        success: false,
        message: 'Ваша реєстрація очікує підтвердження адміністратора',
      });
    }

    // Перевірка активності акаунта
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Акаунт деактивовано',
      });
    }

    // Перевірка пароля
    const bcrypt = require('bcryptjs');
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Невірний логін або пароль',
      });
    }

    // Оновлення часу останнього входу
    user.lastLogin = new Date();

    // Якщо передали інформацію про пристрій — оновлюємо/додаємо її
    try {
      if (device && device.deviceId) {
        if (!Array.isArray(user.devices)) {
          user.devices = [];
        }
        const now = new Date();
        const clientIp =
          req.headers['x-forwarded-for']?.split(',')[0] ||
          req.ip ||
          req.connection?.remoteAddress ||
          null;

        const idx = user.devices.findIndex(d => d.deviceId === device.deviceId);
        if (idx >= 0) {
          user.devices[idx] = {
            ...(user.devices[idx].toObject?.() || user.devices[idx]),
            platform: device.platform || user.devices[idx].platform,
            manufacturer: device.manufacturer ?? user.devices[idx].manufacturer,
            model: device.model ?? user.devices[idx].model,
            osVersion: device.osVersion ?? user.devices[idx].osVersion,
            sdkInt: device.sdkInt ?? user.devices[idx].sdkInt,
            appVersion: device.appVersion ?? user.devices[idx].appVersion,
            pushToken: device.pushToken ?? user.devices[idx].pushToken,
            label: device.label ?? user.devices[idx].label,
            lastLoginAt: now,
            lastIp: clientIp,
            isActive: true,
          };
        } else {
          user.devices.push({
            deviceId: device.deviceId,
            platform: device.platform || 'android',
            manufacturer: device.manufacturer ?? null,
            model: device.model ?? null,
            osVersion: device.osVersion ?? null,
            sdkInt: device.sdkInt ?? null,
            appVersion: device.appVersion ?? null,
            pushToken: device.pushToken ?? null,
            label: device.label ?? null,
            firstLoginAt: now,
            lastLoginAt: now,
            lastIp: clientIp,
            isActive: true,
          });
        }
      }
    } catch (devErr) {
      logger.error('Помилка оновлення інформації про пристрій під час входу:', devErr);
    }

    // Використовуємо updateOne замість save для уникнення проблем з populate
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          lastLogin: user.lastLogin,
          devices: user.devices || [],
        },
      }
    );

    // Генерація токена
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Успішна авторизація',
      data: {
        token,
        user: {
          _id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          department: user.department,
          position: user.position,
          city: user.city,
          isActive: user.isActive,
          lastLogin: user.lastLogin,
        },
      },
    });
  } catch (error) {
    logger.error('Помилка авторизації:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при авторизації',
      error:
        process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
          ? error.message
          : undefined,
      stack:
        process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
          ? error.stack
          : undefined,
    });
  }
});

// @route   PUT /api/auth/device
// @desc    Оновлення інформації про пристрій (включно з FCM токеном)
// @access  Private
router.put('/device', authenticateToken, async (req, res) => {
  try {
    const { device } = req.body;

    if (!device || !device.deviceId) {
      return res.status(400).json({
        success: false,
        message: "Інформація про пристрій обов'язкова",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено',
      });
    }

    if (!Array.isArray(user.devices)) {
      user.devices = [];
    }
    const now = new Date();
    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.ip ||
      req.connection?.remoteAddress ||
      null;

    const idx = user.devices.findIndex(d => d.deviceId === device.deviceId);
    if (idx >= 0) {
      user.devices[idx] = {
        ...(user.devices[idx].toObject?.() || user.devices[idx]),
        platform: device.platform || user.devices[idx].platform,
        manufacturer: device.manufacturer ?? user.devices[idx].manufacturer,
        model: device.model ?? user.devices[idx].model,
        osVersion: device.osVersion ?? user.devices[idx].osVersion,
        sdkInt: device.sdkInt ?? user.devices[idx].sdkInt,
        appVersion: device.appVersion ?? user.devices[idx].appVersion,
        pushToken: device.pushToken ?? user.devices[idx].pushToken,
        label: device.label ?? user.devices[idx].label,
        lastLoginAt: now,
        lastIp: clientIp,
        isActive: true,
      };
    } else {
      user.devices.push({
        deviceId: device.deviceId,
        platform: device.platform || 'android',
        manufacturer: device.manufacturer ?? null,
        model: device.model ?? null,
        osVersion: device.osVersion ?? null,
        sdkInt: device.sdkInt ?? null,
        appVersion: device.appVersion ?? null,
        pushToken: device.pushToken ?? null,
        label: device.label ?? null,
        firstLoginAt: now,
        lastLoginAt: now,
        lastIp: clientIp,
        isActive: true,
      });
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          devices: user.devices || [],
        },
      }
    );

    res.json({
      success: true,
      message: 'Інформацію про пристрій оновлено',
    });
  } catch (error) {
    logger.error('Помилка оновлення інформації про пристрій:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при оновленні інформації про пристрій',
    });
  }
});

// @route   GET /api/auth/me
// @desc    Отримання інформації про поточного користувача
// @access  Private
router.get('/me', authenticateToken, (req, res) => {
  try {
    // Створюємо об'єкт користувача без пароля
    const userWithoutPassword = {
      _id: req.user._id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      position: req.user.position,
      city: req.user.city,
      telegramId: req.user.telegramId,
      isActive: req.user.isActive,
      lastLogin: req.user.lastLogin,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt,
    };

    res.json({
      success: true,
      data: userWithoutPassword,
    });
  } catch (error) {
    logger.error('Помилка отримання профілю:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Оновлення токена
// @access  Private
router.post('/refresh', authenticateToken, (req, res) => {
  try {
    const token = generateToken(req.user._id);

    res.json({
      success: true,
      message: 'Токен успішно оновлено',
      data: {
        token,
      },
    });
  } catch (error) {
    logger.error('Помилка оновлення токена:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

// @route   GET /api/auth/check-registration-status
// @desc    Перевірка статусу реєстрації за email (публічний endpoint)
// @access  Public
router.get('/check-registration-status', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email є обов'язковим",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      'registrationStatus isActive'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача з таким email не знайдено',
      });
    }

    res.json({
      success: true,
      data: {
        registrationStatus: user.registrationStatus,
        isActive: user.isActive,
        isApproved: user.registrationStatus === 'approved' && user.isActive,
      },
    });
  } catch (error) {
    logger.error('Помилка перевірки статусу реєстрації:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при перевірці статусу реєстрації',
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Вихід з системи
// @access  Private
router.post('/logout', authenticateToken, (req, res) => {
  try {
    // В реальному додатку тут можна додати токен до чорного списку
    // або зберегти інформацію про вихід в базі даних

    res.json({
      success: true,
      message: 'Успішний вихід з системи',
    });
  } catch (error) {
    logger.error('Помилка виходу:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

// @route   GET /api/auth/register/positions
// @desc    Отримати список активних посад для реєстрації (публічний)
// @access  Public
router.get('/register/positions', async (req, res) => {
  try {
    const Position = require('../models/Position');
    // Виключаємо посаду "адміністратор системи" зі списку для реєстрації
    const positions = await Position.find({
      isActive: true,
      title: {
        $not: {
          $regex: /адміністратор системи|администратор системы|system administrator/i,
        },
      },
    })
      .select('_id title')
      .sort({ title: 1 });

    res.json({
      success: true,
      data: positions,
    });
  } catch (error) {
    logger.error('Помилка отримання посад для реєстрації:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

// @route   GET /api/auth/register/cities
// @desc    Отримати список міст для реєстрації (публічний)
// @access  Public
router.get('/register/cities', async (req, res) => {
  try {
    const City = require('../models/City');
    const cities = await City.find().select('_id name region').sort({ name: 1 });

    res.json({
      success: true,
      data: cities,
    });
  } catch (error) {
    logger.error('Помилка отримання міст для реєстрації:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

// @route   GET /api/auth/register/institutions
// @desc    Отримати список активних закладів для реєстрації (публічний)
// @access  Public
router.get('/register/institutions', async (req, res) => {
  try {
    const Institution = require('../models/Institution');
    const institutions = await Institution.find({ isActive: true })
      .select('_id name')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: institutions,
    });
  } catch (error) {
    logger.error('Помилка отримання закладів для реєстрації:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

module.exports = router;
