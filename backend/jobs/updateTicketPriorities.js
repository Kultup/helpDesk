const ticketPriorityService = require('../services/ticketPriorityService');
const logger = require('../utils/logger');

/**
 * Cron job для автоматичного оновлення пріоритетів тікетів
 * Запускається кожні 2 години
 */
async function updateTicketPriorities() {
  try {
    logger.info('⏰ Запуск автоматичного оновлення пріоритетів тікетів...');

    const result = await ticketPriorityService.updateAllTicketPriorities();

    logger.info(`✅ Автоматичне оновлення пріоритетів завершено:`, result);

    return result;
  } catch (error) {
    logger.error('❌ Помилка автоматичного оновлення пріоритетів:', error);
    throw error;
  }
}

/**
 * Налаштування cron job для оновлення пріоритетів
 * Запускається кожні 2 години
 */
function setupPriorityUpdateJob() {
  const cron = require('node-cron');

  // Кожні 2 години. setImmediate щоб не блокувати event loop (уникаємо "missed execution")
  cron.schedule('0 */2 * * *', () => {
    setImmediate(async () => {
      try {
        await updateTicketPriorities();
      } catch (error) {
        logger.error('❌ Помилка виконання priority update job:', error);
      }
    });
  });

  logger.info('✅ Priority update job налаштовано (кожні 2 години)');
}

module.exports = {
  updateTicketPriorities,
  setupPriorityUpdateJob,
};
