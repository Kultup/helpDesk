// Тестове середовище налаштування
require('dotenv').config({ path: '.env.test' });

// Мок для logger щоб не засмічувати вивід тестів
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Глобальні моки для сервісів (щоб не повторювати в кожному тесті)
jest.mock('../services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  sendRegistrationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true)
}), { virtual: true });

jest.mock('../services/telegramService', () => ({
  verifyTelegramAuth: jest.fn().mockResolvedValue(true),
  sendNotification: jest.fn().mockResolvedValue(true),
  sendMessage: jest.fn().mockResolvedValue(true)
}), { virtual: true });

jest.mock('../services/registrationWebSocketService', () => ({
  notifyNewRegistrationRequest: jest.fn().mockResolvedValue(true),
  notifyRegistrationStatusChange: jest.fn().mockResolvedValue(true)
}), { virtual: true });

jest.mock('../services/ticketWebSocketService', () => ({
  notifyTicketUpdate: jest.fn().mockResolvedValue(true),
  notifyTicketCreated: jest.fn().mockResolvedValue(true),
  broadcastTicketUpdate: jest.fn().mockResolvedValue(true),
  broadcastNewTicket: jest.fn().mockResolvedValue(true),
  notifyNewTicket: jest.fn().mockResolvedValue(true)
}), { virtual: true });

jest.mock('../services/telegramServiceInstance', () => ({
  sendNotification: jest.fn().mockResolvedValue(true),
  sendNewTicketNotificationToGroup: jest.fn().mockResolvedValue(true),
  sendMessage: jest.fn().mockResolvedValue(true)
}), { virtual: true });

jest.mock('../services/logWebSocketService', () => ({
  broadcastLog: jest.fn().mockResolvedValue(true)
}), { virtual: true });

jest.mock('../services/userNotificationService', () => ({
  createNotification: jest.fn().mockResolvedValue(true),
  sendNotification: jest.fn().mockResolvedValue(true)
}), { virtual: true });

// Глобальні змінні для тестів
// Встановлюємо як development для показу детальних помилок
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-purposes-only';
process.env.JWT_EXPIRES_IN = '24h';
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/helpdesk_test';

// Додаткові змінні середовища для тестів (якщо потрібні)
process.env.PORT = process.env.PORT || '3000';
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-bot-token';

// Глобальні допоміжні функції для пропуску тестів
// Використання: it.skipIf(condition)('test name', ...) або describe.skipIf(condition)('suite name', ...)
global.it.skipIf = (condition) => condition ? it.skip : it;
global.describe.skipIf = (condition) => condition ? describe.skip : describe;
global.test.skipIf = (condition) => condition ? test.skip : test;

// Пропуск тестів через змінну середовища SKIP_*_TESTS
const skipIntegrationTests = process.env.SKIP_INTEGRATION_TESTS === 'true';
const skipUnitTests = process.env.SKIP_UNIT_TESTS === 'true';

// Експортуємо функції для використання в тестах
global.skipIfIntegration = skipIntegrationTests;
global.skipIfUnit = skipUnitTests;

// Придушення console.log під час тестів (опціонально)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

