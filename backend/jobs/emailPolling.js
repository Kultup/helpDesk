const cron = require('node-cron');
const emailReceiveService = require('../services/emailReceiveService');
const logger = require('../utils/logger');

/**
 * Налаштування cron job для перевірки email
 * Запускається кожні 5 хвилин
 */
function setupEmailPolling() {
  // Запускаємо перевірку email кожні 5 хвилин
  cron.schedule('*/5 * * * *', async () => {
    try {
      logger.info('📧 Starting email polling check...');
      
      const result = await emailReceiveService.processNewEmails();
      
      logger.info(`✅ Email polling completed:`, {
        emailsProcessed: result.emailsProcessed,
        ticketsCreated: result.ticketsCreated,
        ticketsUpdated: result.ticketsUpdated,
        errors: result.errors
      });
    } catch (error) {
      logger.error('❌ Error in email polling:', error);
    }
  });

  logger.info('✅ Email polling job scheduled (every 5 minutes)');
}

/**
 * Ініціалізація email сервісу
 */
async function initializeEmailService() {
  try {
    const emailService = require('../services/emailService');
    await emailService.initialize();
    
    const EmailSettings = require('../models/EmailSettings');
    const settings = await EmailSettings.getActive();
    
    if (settings && settings.imap && settings.imap.enabled) {
      await emailReceiveService.initialize(settings);
    }
  } catch (error) {
    logger.error('❌ Error initializing email service:', error);
  }
}

module.exports = {
  setupEmailPolling,
  initializeEmailService
};

