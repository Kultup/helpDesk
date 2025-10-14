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
    'any.required': 'Email є обов\'язковим'
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Пароль повинен містити мінімум 6 символів',
    'any.required': 'Пароль є обов\'язковим'
  }),
  firstName: Joi.string().max(50).required().messages({
    'string.max': 'Ім\'я не може перевищувати 50 символів',
    'any.required': 'Ім\'я є обов\'язковим'
  }),
  lastName: Joi.string().max(50).required().messages({
    'string.max': 'Прізвище не може перевищувати 50 символів',
    'any.required': 'Прізвище є обов\'язковим'
  }),
  position: Joi.string().required().messages({
    'any.required': 'Посада є обов\'язковою'
  }),
  department: Joi.string().required().messages({
    'any.required': 'Відділ є обов\'язковим'
  }),
  city: Joi.string().required().messages({
    'any.required': 'Місто є обов\'язковим'
  }),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional().messages({
    'string.pattern.base': 'Невірний формат номера телефону'
  }),
  telegramId: Joi.string().optional().messages({
    'string.base': 'Telegram ID повинен бути рядком'
  })
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Невірний формат email',
    'any.required': 'Email є обов\'язковим'
  }),
  password: Joi.string().required().messages({
    'any.required': 'Пароль є обов\'язковим'
  })
});

// Функція для генерації JWT токена
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
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
        message: error.details[0].message
      });
    }

    const { email, password, firstName, lastName, position, department, city, phone, telegramId } = value;

    // Перевірка чи користувач вже існує (включаючи неактивних та pending)
    const existingUser = await User.findOne({ 
      email: email.toLowerCase() 
    });
    
    if (existingUser) {
      // Якщо користувач існує і має статус pending
      if (existingUser.registrationStatus === 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Заявка з цим email вже подана і очікує розгляду адміністратора'
        });
      }
      
      // Якщо користувач існує і має статус rejected
      if (existingUser.registrationStatus === 'rejected') {
        return res.status(400).json({
          success: false,
          message: 'Реєстрація з цим email була відхилена. Зверніться до адміністратора'
        });
      }
      
      // Якщо користувач існує і активний
      if (existingUser.isActive && existingUser.registrationStatus === 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Користувач з таким email вже зареєстрований'
        });
      }
      
      // Якщо користувач існує але неактивний (м'яко видалений)
      if (!existingUser.isActive && existingUser.deletedAt) {
        return res.status(400).json({
          success: false,
          message: 'Цей email був раніше використаний. Зверніться до адміністратора для відновлення доступу'
        });
      }
    }

    // Створення нового користувача зі статусом pending
    const user = new User({
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      position,
      department,
      city,
      phone,
      telegramId,
      registrationStatus: 'pending',
      isActive: false
    });

    await user.save();
    logger.info('💾 Користувач збережений в базі даних:', user.email);

    // Відправка WebSocket сповіщення про нову реєстрацію
    try {
      logger.info('📡 Спроба відправити WebSocket сповіщення про нову реєстрацію');
      logger.info('🔍 WebSocket сервіс ініціалізований:', !!registrationWebSocketService.io);
      
      await registrationWebSocketService.notifyNewRegistrationRequest(user);
      logger.info('✅ WebSocket сповіщення про нову реєстрацію відправлено успішно');
    } catch (error) {
      logger.error('❌ Помилка при відправці WebSocket сповіщення:', error);
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
        user: populatedUser
      }
    });

  } catch (error) {
    logger.error('Помилка реєстрації:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при реєстрації'
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
        message: error.details[0].message
      });
    }

    const { email, password } = value;

    // Пошук користувача
    const user = await User.findOne({ email })
      .select('+password')
      .populate('position')
      .populate('city');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Невірний email або пароль'
      });
    }

    // Перевірка статусу реєстрації
    if (user.registrationStatus === 'pending') {
      return res.status(401).json({
        success: false,
        message: 'Ваша реєстрація очікує підтвердження адміністратора'
      });
    }

    // Перевірка статусу rejected видалена, оскільки відхилені користувачі видаляються з БД

    // Перевірка активності акаунта
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Акаунт деактивовано'
      });
    }

    // Перевірка пароля
    const bcrypt = require('bcryptjs');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Невірний email або пароль'
      });
    }

    // Оновлення часу останнього входу
    user.lastLogin = new Date();
    await user.save();

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
          lastLogin: user.lastLogin
        }
      }
    });

  } catch (error) {
    logger.error('Помилка авторизації:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при авторизації'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Отримання інформації про поточного користувача
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
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
      updatedAt: req.user.updatedAt
    };

    res.json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    logger.error('Помилка отримання профілю:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Оновлення токена
// @access  Private
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const token = generateToken(req.user._id);
    
    res.json({
      success: true,
      message: 'Токен успішно оновлено',
      data: {
        token
      }
    });
  } catch (error) {
    logger.error('Помилка оновлення токена:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Вихід з системи
// @access  Private
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // В реальному додатку тут можна додати токен до чорного списку
    // або зберегти інформацію про вихід в базі даних
    
    res.json({
      success: true,
      message: 'Успішний вихід з системи'
    });
  } catch (error) {
    logger.error('Помилка виходу:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера'
    });
  }
});

module.exports = router;