const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

// Middleware для перевірки JWT токена
const authenticateToken = async (req, res, next) => {
  try {
    logger.info('🔐 authenticateToken middleware:', {
      method: req.method,
      url: req.url,
      hasAuthHeader: !!req.headers.authorization
    });

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      logger.info('❌ Токен відсутній');
      return res.status(401).json({
        success: false,
        message: 'Токен доступу не надано'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId)
      .populate('position')
      .populate('city')
      .select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }
    
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Акаунт деактивовано'
      });
    }
    
    // Перевірка статусу реєстрації
    if (user.registrationStatus === 'pending') {
      return res.status(401).json({
        success: false,
        message: 'Ваша заявка на реєстрацію очікує підтвердження адміністратора'
      });
    }
    
    // Перевірка статусу rejected видалена, оскільки відхилені користувачі видаляються з БД
    
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Невірний токен'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Токен прострочений'
      });
    }
    
    logger.error('Помилка аутентифікації:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при аутентифікації'
    });
  }
};

/** Чи є роль адміністраторською (повний доступ до панелі). */
function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin' || role === 'administrator';
}

// Middleware для перевірки ролі адміністратора
const requireAdmin = (req, res, next) => {
  if (!isAdminRole(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Доступ заборонено. Потрібні права адміністратора'
    });
  }
  next();
};

// Middleware для перевірки дозволів
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (isAdminRole(req.user.role)) {
      return next(); // Адміністратор має всі дозволи
    }
    
    if (!req.user.position) {
      return res.status(403).json({
        success: false,
        message: `Доступ заборонено. Позиція користувача не знайдена`
      });
    }

    // Розбираємо дозвіл на модуль та дію
    let module, action;
    if (permission.includes('_')) {
      // Формат: module_action (наприклад, view_analytics)
      const parts = permission.split('_');
      action = parts[0]; // view
      module = parts[1]; // analytics
    } else {
      // Якщо дозвіл не містить підкреслення, використовуємо як є
      module = permission;
      action = 'read'; // дія за замовчуванням
    }
    
    if (!req.user.position.hasPermission(module, action)) {
      return res.status(403).json({
        success: false,
        message: `Доступ заборонено. Потрібен дозвіл: ${module}.${action}`
      });
    }
    
    next();
  };
};

// Middleware для перевірки власності ресурсу або прав адміністратора
const requireOwnershipOrAdmin = (resourceField = 'createdBy') => {
  return (req, res, next) => {
    if (isAdminRole(req.user.role)) {
      return next();
    }
    
    // Перевіряємо власність ресурсу
    const resourceOwnerId = req.resource ? req.resource[resourceField] : null;
    
    if (!resourceOwnerId || resourceOwnerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Доступ заборонено. Ви можете редагувати тільки свої ресурси'
      });
    }
    
    next();
  };
};

// Middleware для логування дій користувачів
const logUserAction = (action) => {
  return (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Логуємо тільки успішні дії
      if (res.statusCode < 400) {
        logger.info(`📝 Дія користувача: ${req.user.email} виконав ${action} в ${new Date().toISOString()}`);
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

// Middleware для обмеження швидкості запитів для конкретного користувача
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();
  
  return (req, res, next) => {
    const userId = req.user._id.toString();
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!userRequests.has(userId)) {
      userRequests.set(userId, []);
    }
    
    const requests = userRequests.get(userId);
    
    // Видаляємо старі запити
    const validRequests = requests.filter(time => time > windowStart);
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Забагато запитів. Спробуйте пізніше'
      });
    }
    
    validRequests.push(now);
    userRequests.set(userId, validRequests);
    
    next();
  };
};

module.exports = {
  authenticateToken,
  auth: authenticateToken,
  isAdminRole,
  requireAdmin,
  requirePermission,
  requireOwnershipOrAdmin,
  logUserAction,
  userRateLimit
};