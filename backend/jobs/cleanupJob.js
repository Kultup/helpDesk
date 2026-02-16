const cron = require('node-cron');
const { cleanupAllOldRegistrations } = require('../utils/cleanupPendingRegistrations');
const logger = require('../utils/logger');

/**
 * Налаштування автоматичного очищення застарілих реєстрацій
 * Запускається щодня о 02:00
 */
function setupCleanupJob() {
  // Запуск щодня о 02:00. setImmediate щоб не блокувати event loop (уникаємо "missed execution")
  cron.schedule(
    '0 2 * * *',
    () => {
      setImmediate(async () => {
        try {
          logger.info('Початок автоматичного очищення застарілих реєстрацій');

          const result = await cleanupAllOldRegistrations();

          if (result.total > 0) {
            logger.info(`Автоматичне очищення завершено. Видалено ${result.total} записів`, {
              pending: result.pending.cleaned,
              rejected: result.rejected.cleaned,
            });
          } else {
            logger.info('Автоматичне очищення завершено. Немає записів для видалення');
          }
        } catch (error) {
          logger.error('Помилка при автоматичному очищенні:', error);
        }
      });
    },
    {
      scheduled: true,
      timezone: 'Europe/Kiev',
    }
  );

  logger.info('Налаштовано автоматичне очищення застарілих реєстрацій (щодня о 02:00)');
}

/**
 * Ручний запуск очищення (для тестування)
 */
async function runCleanupNow() {
  try {
    logger.info('Ручний запуск очищення застарілих реєстрацій');

    const result = await cleanupAllOldRegistrations();

    logger.info(`Ручне очищення завершено. Видалено ${result.total} записів`, {
      pending: result.pending.cleaned,
      rejected: result.rejected.cleaned,
      details: {
        pendingDetails: result.pending.details,
        rejectedDetails: result.rejected.details,
      },
    });

    return result;
  } catch (error) {
    logger.error('Помилка при ручному очищенні:', error);
    throw error;
  }
}

module.exports = {
  setupCleanupJob,
  runCleanupNow,
};
