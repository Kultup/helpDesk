const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware для перевірки прав адміністратора
 * Використовується після auth middleware
 */
const adminAuth = async (req, res, next) => {
  try {
    // Перевіряємо, чи користувач вже аутентифікований
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Доступ заборонено. Потрібна аутентифікація.'
      });
    }

    // Перевіряємо роль користувача (admin, super_admin або administrator)
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'administrator') {
      return res.status(403).json({
        success: false,
        message: 'Доступ заборонено. Потрібні права адміністратора.'
      });
    }

    // Користувач є адміністратором, продовжуємо
    next();
  } catch (error) {
    logger.error('Помилка в adminAuth middleware:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера'
    });
  }
};

module.exports = adminAuth;