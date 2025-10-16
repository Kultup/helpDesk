const express = require('express');
const mongoose = require('mongoose');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const logger = require('./utils/logger');
require('dotenv').config();

// Імпортуємо middleware
const {
  cors,
  securityHeaders,
  sanitizeData,
  rateLimits,
  requestLogger,
  globalErrorHandler,
  notFoundHandler,
  unhandledRejectionHandler,
  uncaughtExceptionHandler
} = require('./middleware');

const app = express();
const server = createServer(app);

// Socket.IO конфігурація
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Зберігаємо io в app для використання в інших частинах додатку
app.set('io', io);

// Обробники для необроблених помилок
unhandledRejectionHandler();
uncaughtExceptionHandler();

// Підключення до MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Підключено до MongoDB');
  // Ініціалізуємо всі моделі
  require('./models');
  console.log('✅ Моделі ініціалізовано');
  
  // Ініціалізуємо Telegram бота
  const telegramService = require('./services/telegramServiceInstance');
  telegramService.initialize();
  console.log('✅ Telegram бот ініціалізовано');
  
  // Ініціалізуємо автоматичне очищення застарілих реєстрацій
  const { setupCleanupJob } = require('./jobs/cleanupJob');
  setupCleanupJob();
  logger.info('✅ Автоматичне очищення реєстрацій налаштовано');
  
  // Ініціалізуємо WebSocket сервіс для реєстрації
  const registrationWebSocketService = require('./services/registrationWebSocketService');
  registrationWebSocketService.initialize(io);
  logger.info('✅ WebSocket сервіс для реєстрації ініціалізовано');
  
  // WebSocket обробка підключень
  io.on('connection', (socket) => {
    logger.info('👤 Користувач підключився:', socket.id);
    
    // Приєднання до кімнати адміністраторів для сповіщень про реєстрацію
    socket.on('join-admin-room', () => {
      socket.join('admin-room');
      logger.info('🔐 Адміністратор приєднався до кімнати сповіщень:', socket.id);
    });
    
    socket.on('disconnect', () => {
      logger.info('👋 Користувач відключився:', socket.id);
    });
  });
})
.catch(err => logger.error('❌ Помилка підключення до MongoDB:', err));

// Middleware для логування запитів
app.use(requestLogger);

// Middleware для безпеки
app.use(securityHeaders);

// CORS налаштування
app.use(cors);

// Санітизація даних
app.use(sanitizeData);

// Rate limiting для різних ендпоінтів
app.use('/api/', rateLimits.general);
app.use('/api/auth/', rateLimits.auth);
app.use('/api/upload/', rateLimits.upload);
app.use('/api/telegram/', rateLimits.telegram);
app.use('/api/analytics/', rateLimits.analytics);

// CORS налаштування (залишаємо для сумісності)
// app.use(cors({
//   origin: process.env.FRONTEND_URL || 'http://localhost:3000',
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// }));

// Стиснення відповідей
app.use(compression());

// Логування
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Парсинг JSON та URL-encoded даних
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Статичні файли
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Маршрути API
app.use('/api/swagger', require('./routes/swagger')); // Swagger документація
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/ticket-history', require('./routes/ticketHistory')); // Історія тікетів
app.use('/api/users', require('./routes/users'));
app.use('/api/cities', require('./routes/cities'));
app.use('/api/positions', require('./routes/positions'));
app.use('/api/institutions', require('./routes/institutions'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/active-directory', require('./routes/activeDirectory'));
// Сповіщення
app.use('/api/notifications', require('./routes/notifications'));

app.use('/api/ticket-templates', require('./routes/ticketTemplates'));
app.use('/api/events', require('./routes/events')); // Календар подій
app.use('/api/admin-notes', require('./routes/adminNotes')); // Особисті нотатки адміністратора

// Telegram webhook
app.use('/api/telegram', require('./routes/telegram'));

// Файли
app.use('/api/files', require('./routes/files'));

// Базовий маршрут
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Help Desk API працює',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Тестовий ендпоінт для перевірки API
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API endpoint working',
    timestamp: new Date().toISOString(),
    middleware: {
      cors: 'enabled',
      security: 'enabled',
      compression: 'enabled'
    }
  });
});

// Маршрут для перевірки здоров'я системи
app.get('/health', async (req, res) => {
  try {
    // Перевірка підключення до бази даних
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : 'disconnected';
    
    // Базова статистика
    const User = require('./models/User');
    const Ticket = require('./models/Ticket');
    
    const [userCount, ticketCount] = await Promise.all([
      User.countDocuments(),
      Ticket.countDocuments()
    ]);

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        state: dbState
      },
      statistics: {
        users: userCount,
        tickets: ticketCount
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Обробка неіснуючих маршрутів
app.use(notFoundHandler);

// Глобальна обробка помилок
app.use(globalErrorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`🚀 Сервер запущено на порту ${PORT}`);
  logger.info(`📊 Режим: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🌐 API доступне за адресою: http://localhost:${PORT}`);
  logger.info(`🔌 WebSocket доступний за адресою: ws://localhost:${PORT}`);
});

// Graceful shutdown
const { gracefulShutdownHandler } = require('./middleware');
gracefulShutdownHandler(server);

module.exports = app;