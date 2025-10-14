const TelegramService = require('./telegramService');

// Створюємо глобальний екземпляр TelegramService
const telegramServiceInstance = new TelegramService();

module.exports = telegramServiceInstance;