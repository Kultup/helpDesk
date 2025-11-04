const cron = require('node-cron');
const slaService = require('../services/slaService');
const telegramService = require('../services/telegramServiceInstance');
const logger = require('../utils/logger');

/**
 * Налаштування cron job для моніторингу SLA
 * Запускається кожні 5 хвилин
 */
function setupSLAMonitor() {
  // Запускаємо перевірку SLA кожні 5 хвилин
  cron.schedule('*/5 * * * *', async () => {
    try {
      logger.info('🔍 Starting SLA monitoring check...');
      
      const result = await slaService.checkAllTickets();
      
      logger.info(`✅ SLA monitoring completed:`, {
        ticketsChecked: result.ticketsChecked,
        breachesFound: result.breachesFound,
        warningsSent: result.warningsSent,
        escalationsPerformed: result.escalationsPerformed
      });

      // Відправляємо сповіщення про критичні порушення
      if (result.breachesFound > 0) {
        await notifySLABreaches(result.breachesFound);
      }
    } catch (error) {
      logger.error('❌ Error in SLA monitoring:', error);
    }
  });

  logger.info('✅ SLA monitoring job scheduled (every 5 minutes)');
}

/**
 * Відправити сповіщення про порушення SLA
 * @param {Number} breachesCount - Кількість порушень
 */
async function notifySLABreaches(breachesCount) {
  try {
    // Отримуємо адміністраторів для сповіщення
    const User = require('../models/User');
    const admins = await User.find({ 
      role: { $in: ['admin', 'super_admin'] },
      isActive: true
    });

    if (admins.length === 0) {
      return;
    }

    // Відправляємо сповіщення через Telegram (якщо налаштовано)
    try {
      const message = `⚠️ Увага! Виявлено ${breachesCount} порушення SLA. Перевірте тикети в системі.`;
      
      // Відправляємо в групу (якщо налаштовано)
      if (telegramService && telegramService.sendMessageToGroup) {
        await telegramService.sendMessageToGroup(message);
      }
    } catch (telegramError) {
      logger.warn('Failed to send Telegram notification:', telegramError);
    }

    logger.info(`📧 SLA breach notification sent to ${admins.length} admins`);
  } catch (error) {
    logger.error('Error sending SLA breach notifications:', error);
  }
}

module.exports = {
  setupSLAMonitor
};

