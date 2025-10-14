const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const logger = require('./utils/logger');
require('dotenv').config();

const app = express();
const server = createServer(app);

// Middleware безпеки
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 хвилин
  max: 100, // максимум 100 запитів на IP
  message: 'Забагато запитів з цього IP, спробуйте пізніше.'
});
app.use('/api/', limiter);

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

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

// Ініціалізуємо WebSocket сервіс для реєстрації
const registrationWebSocketService = require('./services/registrationWebSocketService');
registrationWebSocketService.initialize(io);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Статичні файли
app.use('/uploads', express.static('uploads'));

// Підключення до MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => logger.info('✅ Підключено до MongoDB'))
.catch(err => logger.error('❌ Помилка підключення до MongoDB:', err));

// Маршрути
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/users', require('./routes/users'));
app.use('/api/cities', require('./routes/cities'));
app.use('/api/positions', require('./routes/positions'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/telegram', require('./routes/telegram'));
app.use('/api/ad', require('./routes/activeDirectory'));

// Обслуговування статичних файлів frontend (якщо існує білд)
const frontendBuildPath = path.join(__dirname, '../frontend/build');
if (require('fs').existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  
  // SPA підтримка - всі не-API маршрути повертають index.html
  app.get('*', (req, res) => {
    // Перевіряємо, чи це не API маршрут
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(frontendBuildPath, 'index.html'));
    } else {
      res.status(404).json({ 
        success: false, 
        message: 'API маршрут не знайдено' 
      });
    }
  });
} else {
  // Базовий маршрут якщо немає frontend білду
  app.get('/', (req, res) => {
    res.json({ 
      message: 'Help Desk API працює!', 
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      note: 'Frontend білд не знайдено. Запустіть npm run build у папці frontend.'
    });
  });

  // Обробка помилок 404
  app.use('*', (req, res) => {
    res.status(404).json({ 
      success: false, 
      message: 'Маршрут не знайдено' 
    });
  });
}

// Глобальна обробка помилок
app.use((err, req, res, next) => {
  logger.error('❌ Помилка сервера:', err.stack);
  
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Внутрішня помилка сервера' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;

// Socket.IO обробка підключень
io.on('connection', (socket) => {
  logger.info('👤 Користувач підключився:', socket.id);

  // Приєднання до кімнати адміністраторів для отримання сповіщень про реєстрацію
  socket.on('join-admin-room', () => {
    socket.join('admin-room');
    logger.info('👑 Адміністратор приєднався до кімнати сповіщень');
  });

  // Відключення
  socket.on('disconnect', () => {
    logger.info('👋 Користувач відключився:', socket.id);
  });
});

server.listen(PORT, () => {
  logger.info(`🚀 Сервер запущено на порту ${PORT}`);
  logger.info(`📱 Режим: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔌 WebSocket сервер готовий`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM отримано. Закриваю HTTP сервер...');
  server.close(() => {
    logger.info('HTTP сервер закрито.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT отримано. Закриваю HTTP сервер...');
  server.close(() => {
    logger.info('HTTP сервер закрито.');
    process.exit(0);
  });
});

// Обробка необроблених помилок
process.on('uncaughtException', (err) => {
  logger.error('Необроблена помилка:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.error('Необроблене відхилення Promise:', err);
  server.close(() => {
    process.exit(1);
  });
});

module.exports = server;