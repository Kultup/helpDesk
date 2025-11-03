const { errorLogger } = require('./logging');
const logger = require('../utils/logger');

// Клас для кастомних помилок
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Обробка помилок MongoDB
const handleMongoError = (err) => {
  if (err.name === 'CastError') {
    return new AppError(`Невірний ${err.path}: ${err.value}`, 400);
  }
  
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    return new AppError(`${field} '${value}' вже існує`, 400);
  }
  
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(val => val.message);
    return new AppError(`Помилки валідації: ${errors.join('. ')}`, 400);
  }
  
  return err;
};

// Обробка помилок JWT
const handleJWTError = () => {
  return new AppError('Невірний токен. Будь ласка, увійдіть знову', 401);
};

const handleJWTExpiredError = () => {
  return new AppError('Токен прострочений. Будь ласка, увійдіть знову', 401);
};

// Відправка помилки в розробці
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    error: err,
    message: err.message,
    stack: err.stack
  });
};

// Відправка помилки в продакшні
const sendErrorProd = (err, res) => {
  // Операційні помилки: відправляємо повідомлення клієнту
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message
    });
  } else {
    // Програмні помилки: не розкриваємо деталі
    logger.error('💥 ПОМИЛКА:', err);
    
    res.status(500).json({
      success: false,
      message: 'Щось пішло не так!'
    });
  }
};

// Головний middleware для обробки помилок
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  // Логуємо помилку
  errorLogger(err, req, res, () => {});
  
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err };
    error.message = err.message;
    
    // Обробляємо різні типи помилок
    if (error.name === 'CastError' || error.name === 'ValidationError' || error.code === 11000) {
      error = handleMongoError(error);
    }
    
    if (error.name === 'JsonWebTokenError') {
      error = handleJWTError();
    }
    
    if (error.name === 'TokenExpiredError') {
      error = handleJWTExpiredError();
    }
    
    sendErrorProd(error, res);
  }
};

// Middleware для обробки неіснуючих маршрутів
const notFoundHandler = (req, res, next) => {
  const err = new AppError(`Маршрут ${req.originalUrl} не знайдено`, 404);
  next(err);
};

// Middleware для обробки необроблених Promise rejection
const unhandledRejectionHandler = () => {
  process.on('unhandledRejection', (err, promise) => {
    logger.error('💥 Необроблене Promise rejection:', err.name, err.message);
    logger.error('Promise:', promise);
    
    // Закриваємо сервер gracefully
    process.exit(1);
  });
};

// Middleware для обробки необроблених винятків
const uncaughtExceptionHandler = () => {
  process.on('uncaughtException', (err) => {
    logger.error('💥 Необроблений виняток:', err.name, err.message);
    logger.error(err.stack);
    
    // Закриваємо процес негайно
    process.exit(1);
  });
};

// Middleware для graceful shutdown
const gracefulShutdownHandler = (server) => {
  const shutdown = (signal) => {
    logger.info(`\n🛑 Отримано сигнал ${signal}. Закриваємо сервер...`);
    
    server.close(() => {
      logger.info('✅ HTTP сервер закрито');
      process.exit(0);
    });
    
    // Примусове закриття через 10 секунд
    setTimeout(() => {
      logger.error('❌ Примусове закриття сервера');
      process.exit(1);
    }, 10000);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

// Middleware для перехоплення асинхронних помилок
const catchAsync = (fn) => {
  return (req, res, next) => {
    const safeNext = typeof next === 'function' ? next : (err) => { throw err; };

    return Promise.resolve(fn(req, res, safeNext)).catch(safeNext);
  };
};

// Middleware для валідації існування ресурсу
const validateResourceExists = (Model, resourceName = 'Ресурс') => {
  return catchAsync(async (req, res, next) => {
    const resource = await Model.findById(req.params.id);
    
    if (!resource) {
      return next(new AppError(`${resourceName} з ID ${req.params.id} не знайдено`, 404));
    }
    
    req.resource = resource;
    next();
  });
};

// Middleware для перевірки прав доступу до ресурсу
const checkResourceAccess = (resourceField = 'createdBy') => {
  return (req, res, next) => {
    const resource = req.resource;
    const user = req.user;
    
    // Адміністратор має доступ до всіх ресурсів
    if (user.role === 'admin') {
      return next();
    }
    
    // Перевіряємо власність ресурсу
    const resourceOwnerId = resource[resourceField];
    
    if (!resourceOwnerId || resourceOwnerId.toString() !== user._id.toString()) {
      return next(new AppError('У вас немає прав доступу до цього ресурсу', 403));
    }
    
    next();
  };
};

module.exports = {
  AppError,
  globalErrorHandler,
  notFoundHandler,
  unhandledRejectionHandler,
  uncaughtExceptionHandler,
  gracefulShutdownHandler,
  catchAsync,
  validateResourceExists,
  checkResourceAccess
};