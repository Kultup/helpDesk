// Обробка deprecation warnings від залежностей
// Приховуємо попередження про util._extend від залежностей (yamljs, imap, тощо)
const originalEmitWarning = process.emitWarning;
process.emitWarning = function(warning, type, code, ctor) {
  if (type === 'DeprecationWarning' && 
      (warning && warning.includes && warning.includes('util._extend'))) {
    return; // Ігноруємо це попередження
  }
  if (typeof warning === 'string' && warning.includes('util._extend')) {
    return; // Ігноруємо це попередження
  }
  return originalEmitWarning.apply(process, arguments);
};

// Також обробляємо через process.on('warning')
process.on('warning', (warning) => {
  // Ігноруємо попередження про util._extend від залежностей
  if (warning.name === 'DeprecationWarning' && 
      (warning.message && warning.message.includes('util._extend'))) {
    return; // Не показуємо це попередження
  }
  // Показуємо інші попередження
  if (process.env.NODE_ENV === 'development') {
    console.warn(warning.name, warning.message);
  }
});

const express = require('express');
const mongoose = require('mongoose');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const logger = require('./utils/logger');
require('dotenv').config();

// Валідація environment variables
const { validateEnv } = require('./config/env');
try {
  validateEnv();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

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

// Налаштування trust proxy для express-rate-limit
// Встановлюємо trust proxy, якщо додаток працює за проксі (nginx, load balancer)
app.set('trust proxy', 1); // Довіряємо першому проксі
// Вимикаємо ETag для динамічних відповідей, щоб уникнути 304 та показувати актуальні дані
app.set('etag', false);

// Socket.IO конфігурація
// Використовуємо ту саму логіку для origins, що й для HTTP CORS
const parseOrigins = (originString) => {
  if (!originString) return [];
  return originString
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
};

// Додаткові завжди дозволені origins (локальні мережі та production домени)
const additionalSocketOrigins = [
  'http://192.168.100.15:3000',
  'https://helpdesk.krainamriy.fun'
];

const allowedSocketOrigins = [
  process.env.FRONTEND_URL,
  ...parseOrigins(process.env.CORS_ORIGIN),
  ...additionalSocketOrigins
].filter(Boolean);

const isSocketOriginAllowed = (origin) => {
  if (!origin) return true;
  
  // Дозволяємо localhost
  const isLocalhost = origin.startsWith('http://localhost:') || 
                     origin.startsWith('http://127.0.0.1:') ||
                     origin.includes('localhost');
  if (isLocalhost) return true;
  
  // Точна відповідність
  if (allowedSocketOrigins.includes(origin)) return true;
  
  // Перевірка на піддомени
  for (const allowedOrigin of allowedSocketOrigins) {
    try {
      const allowedUrl = new URL(allowedOrigin);
      const originUrl = new URL(origin);
      if (originUrl.hostname === allowedUrl.hostname || 
          originUrl.hostname.endsWith('.' + allowedUrl.hostname)) {
        return true;
      }
    } catch (e) {
      if (origin.includes(allowedOrigin) || allowedOrigin.includes(origin)) {
        return true;
      }
    }
  }
  
  return false;
};

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isSocketOriginAllowed(origin)) {
        callback(null, true);
      } else {
        logger.warn(`🚫 [Socket.IO] CORS заблокував запит з домену: ${origin}`);
        logger.warn(`   Дозволені origins: ${allowedSocketOrigins.join(', ') || 'не налаштовані'}`);
        callback(new Error('Заборонено CORS політикою'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  maxHttpBufferSize: 1e6, // 1MB обмеження для запобігання проблем з великими пакетами
  pingTimeout: 60000,
  pingInterval: 25000,
  // Вимкнути бінарний парсер, якщо він викликає проблеми
  allowEIO3: false
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
.then(async () => {
  console.log('✅ Підключено до MongoDB');
  // Ініціалізуємо всі моделі
  require('./models');
  console.log('✅ Моделі ініціалізовано');
  
  // Ініціалізуємо Redis кеш
  const cacheService = require('./services/cacheService');
  await cacheService.initialize();
  
  // Ініціалізуємо Telegram бота
  const telegramService = require('./services/telegramServiceInstance');
  telegramService.initialize();
  console.log('✅ Telegram бот ініціалізовано');
  
  // Ініціалізуємо автоматичне очищення застарілих реєстрацій
  const { setupCleanupJob } = require('./jobs/cleanupJob');
  setupCleanupJob();
  logger.info('✅ Автоматичне очищення реєстрацій налаштовано');
  
  
  
  // Ініціалізуємо Zabbix polling
  const { setupZabbixPolling } = require('./jobs/zabbixPolling');
  setupZabbixPolling();
  logger.info('✅ Zabbix polling налаштовано');
  
  // Ініціалізуємо WebSocket сервіс для реєстрації
  const registrationWebSocketService = require('./services/registrationWebSocketService');
  registrationWebSocketService.initialize(io);
  logger.info('✅ WebSocket сервіс для реєстрації ініціалізовано');
  
  // Ініціалізуємо WebSocket сервіс для логів
  const logWebSocketService = require('./services/logWebSocketService');
  logWebSocketService.initialize(io);
  logger.info('✅ WebSocket сервіс для логів ініціалізовано');
  
  // Ініціалізуємо WebSocket сервіс для тікетів
  const ticketWebSocketService = require('./services/ticketWebSocketService');
  ticketWebSocketService.initialize(io);
  logger.info('✅ WebSocket сервіс для тікетів ініціалізовано');
  
  // Ініціалізуємо WebSocket сервіс для міст
  const cityWebSocketService = require('./services/cityWebSocketService');
  cityWebSocketService.initialize(io);
  logger.info('✅ WebSocket сервіс для міст ініціалізовано');
  
  // Ініціалізуємо WebSocket сервіс для сповіщень про помилки
  const errorNotificationService = require('./services/errorNotificationService');
  errorNotificationService.initialize(io);
  logger.info('✅ Error Notification Service ініціалізовано');
  
  // WebSocket обробка підключень
  io.on('connection', (socket) => {
    logger.info('👤 Користувач підключився:', socket.id);
    
    // Обробка помилок підключення
    socket.on('error', (error) => {
      logger.error('Socket.IO error:', error);
    });
    
    // Приєднання до кімнати адміністраторів для сповіщень про реєстрацію
    socket.on('join-admin-room', () => {
      socket.join('admin-room');
      logger.info('🔐 Адміністратор приєднався до кімнати сповіщень:', socket.id);
    });

    // Приєднання до кімнати користувача для персональних сповіщень (наприклад, запит на оцінку)
    socket.on('join-user-room', (userId) => {
      if (userId) {
        socket.join(`user-${userId}`);
        logger.info(`👤 Користувач ${userId} приєднався до своєї кімнати:`, socket.id);
      }
    });

    // Відправка історії логів новому клієнту (з обмеженням розміру)
    socket.on('request-log-history', () => {
      try {
        const logHistory = logWebSocketService.getLogHistory();
        // Обмежуємо розмір історії логів, щоб уникнути проблем з парсингом
        const limitedHistory = logHistory.slice(-100); // Останні 100 записів
        socket.emit('log-history', limitedHistory);
      } catch (error) {
        logger.error('Error sending log history:', error);
      }
    });

    // Обробка логів від фронтенду (з валідацією)
    socket.on('frontend-log', (data) => {
      try {
        // Перевіряємо, чи дані не містять цикличних посилань
        if (data && typeof data === 'object') {
          // Обмежуємо глибину вкладеності через JSON serialization
          const sanitizedData = JSON.parse(JSON.stringify(data, null, 2));
          logWebSocketService.broadcastFrontendLog(
            sanitizedData.level, 
            sanitizedData.message, 
            sanitizedData.details
          );
        }
      } catch (error) {
        logger.error('Error processing frontend log:', error);
      }
    });
    
    socket.on('disconnect', () => {
      logger.info('👋 Користувач відключився:', socket.id);
    });
  });
  
  // Глобальна обробка помилок Socket.IO
  io.engine.on('connection_error', (err) => {
    logger.error('Socket.IO connection error:', err);
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
// Telegram webhook має бути доступний без загального rate limiting
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
const uploadsPath = path.join(__dirname, 'uploads');
logger.info(`📁 Статичні файли доступні за шляхом: /uploads -> ${uploadsPath}`);
app.use('/uploads', express.static(uploadsPath, {
  maxAge: '1d', // Кешування на 1 день
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Дозволяємо CORS для статичних файлів
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
  }
}));

// Маршрути API
app.use('/api/swagger', require('./routes/swagger')); // Swagger документація
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/ticket-history', require('./routes/ticketHistory')); // Історія тікетів
app.use('/api/users', require('./routes/users'));
app.use('/api/cities', require('./routes/cities'));
app.use('/api/positions', require('./routes/positions'));
app.use('/api/position-requests', require('./routes/positionRequests'));
app.use('/api/institutions', require('./routes/institutions'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/active-directory', require('./routes/activeDirectory'));
app.use('/api/settings', require('./routes/settings')); // Налаштування системи
app.use('/api/kb', require('./routes/knowledgeBaseRoutes')); // База знань (Knowledge Base)
app.use('/api/zabbix', require('./routes/zabbix')); // Zabbix інтеграція
// Сповіщення
app.use('/api/notifications', require('./routes/notifications'));

// Теги та швидкі поради
app.use('/api/tags', require('./routes/tags'));
app.use('/api/quick-tips', require('./routes/quickTips'));

app.use('/api/events', require('./routes/events')); // Календар подій
app.use('/api/admin-notes', require('./routes/adminNotes')); // Особисті нотатки адміністратора

// Telegram webhook
app.use('/api/telegram', require('./routes/telegram'));

// Файли
app.use('/api/files', require('./routes/files'));

// Структура бази даних (тільки для адміністраторів)
app.use('/api/database', require('./routes/database'));

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

// Обробка favicon.ico (ігноруємо запити, щоб не логувати помилки)
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Обробка публічних frontend роутів (для поділу статей)
// Якщо запит йде на /share/*, це frontend роут, повертаємо 404 з повідомленням
app.use('/share', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Це frontend роут. Будь ласка, відкрийте цю сторінку через frontend (http://localhost:3000/share/kb/:token)',
    frontendUrl: `http://localhost:${process.env.FRONTEND_PORT || 3000}${req.originalUrl}`
  });
});

// Обробка неіснуючих маршрутів
app.use(notFoundHandler);

// Глобальна обробка помилок
app.use(globalErrorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  logger.info(`🚀 Сервер запущено на порту ${PORT}`);
  logger.info(`📊 Режим: ${process.env.NODE_ENV || 'development'}`);
  const apiBase = process.env.API_BASE_URL || '(не налаштовано, використовуйте API_BASE_URL)';
  logger.info(`🌐 API базова адреса: ${apiBase}`);
  logger.info(
    `🔌 Дозволені CORS origins для WebSocket: ${
      allowedSocketOrigins.length ? allowedSocketOrigins.join(', ') : 'будь-яке (DEV або не налаштовано)'
    }`
  );
  
  // Логуємо старт сервера у щоденний audit лог
  try {
    const { auditLogger } = require('./middleware/logging');
    const fs = require('fs').promises;
    const path = require('path');
    const logsDir = path.join(__dirname, 'logs');
    
    // Функція для отримання локальної дати
    const getLocalDateString = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    await fs.mkdir(logsDir, { recursive: true });
    const auditFile = path.join(logsDir, `audit-${getLocalDateString()}.log`);
    const startupLog = {
      timestamp: new Date().toISOString(),
      action: 'SERVER_START',
      details: {
        port: PORT,
        nodeEnv: process.env.NODE_ENV || 'development',
        apiBase: apiBase,
        pid: process.pid
      }
    };
    await fs.appendFile(auditFile, JSON.stringify(startupLog) + '\n');
  } catch (error) {
    // Не критична помилка, просто логуємо
    logger.warn('Не вдалося записати старт сервера в audit log:', error.message);
  }
});

// Graceful shutdown
const { gracefulShutdownHandler } = require('./middleware');
gracefulShutdownHandler(server);

module.exports = app;
