const cron = require('node-cron');
const logger = require('../utils/logger');

/**
 * Закриття всіх сесій Telegram о 18:00 (кінець робочого дня).
 * Користувачі отримають повідомлення "Робочий день завершено..."
 */
function setupCloseSessionsAfterHours() {
  const telegramService = require('../services/telegramServiceInstance');

  // Щодня о 18:00 за київським часом
  cron.schedule(
    '0 18 * * *',
    () => {
      setImmediate(() => {
        try {
          logger.info('Запуск закриття сесій після робочих годин (18:00)');
          const count = telegramService.clearAllSessions({ reason: 'after_hours' });
          logger.info('Сесії після робочих годин закрито', { count });
        } catch (error) {
          logger.error('Помилка при закритті сесій після годин:', error);
        }
      });
    },
    {
      scheduled: true,
      timezone: 'Europe/Kiev',
    }
  );

  logger.info('Налаштовано закриття сесій після робочих годин (щодня о 18:00)');
}

module.exports = {
  setupCloseSessionsAfterHours,
};
