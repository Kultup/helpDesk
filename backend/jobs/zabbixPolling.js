const cron = require('node-cron');
const zabbixAlertService = require('../services/zabbixAlertService');
const ZabbixConfig = require('../models/ZabbixConfig');
const logger = require('../utils/logger');

let pollingJob = null;

/**
 * Налаштування cron job для опитування Zabbix API
 */
function setupZabbixPolling() {
  // Спочатку перевіряємо конфігурацію
  ZabbixConfig.getActive()
    .then(config => {
      if (!config || !config.enabled) {
        logger.info('Zabbix polling: Integration is disabled, skipping job setup');
        return;
      }

      const pollInterval = config.pollInterval || 5; // хвилини

      // Конвертуємо інтервал в cron формат
      // Наприклад, кожні 5 хвилин: '*/5 * * * *'
      const cronPattern = `*/${pollInterval} * * * *`;

      logger.info(`Setting up Zabbix polling job with interval: ${pollInterval} minutes`);

      // Зупиняємо попередній job, якщо він існує
      if (pollingJob) {
        pollingJob.stop();
      }

      // Створюємо новий cron job. setImmediate щоб не блокувати event loop (уникаємо "missed execution")
      pollingJob = cron.schedule(
        cronPattern,
        () => {
          setImmediate(async () => {
            try {
              // Перевіряємо чи інтеграція все ще увімкнена
              let activeConfig = await ZabbixConfig.getActive();
              if (!activeConfig || !activeConfig.enabled) {
                logger.info('Zabbix integration is disabled, skipping polling');
                return;
              }

              // Отримуємо конфігурацію з токеном (processNewAlerts сам завантажить, але для логування)
              if (activeConfig._id) {
                activeConfig =
                  (await ZabbixConfig.findById(activeConfig._id).select(
                    '+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV'
                  )) || activeConfig;
              }

              // Обробляємо нові алерти
              const result = await zabbixAlertService.processNewAlerts();

              if (result.success) {
                // Оновлюємо статус вирішених алертів
                try {
                  await zabbixAlertService.updateResolvedAlerts();
                } catch (resolveError) {
                  logger.error('Error updating resolved alerts:', resolveError);
                }
              } else {
                logger.error('❌ Zabbix polling failed:', result.error);
              }
            } catch (error) {
              logger.error('❌ Error in Zabbix polling:', error);
            }
          });
        },
        {
          scheduled: true,
          timezone: 'Europe/Kiev',
        }
      );

      logger.info(`✅ Zabbix polling job scheduled (every ${pollInterval} minutes)`);
    })
    .catch(error => {
      logger.error('Error setting up Zabbix polling job:', error);
    });
}

/**
 * Оновлення cron job при зміні конфігурації
 */
function updatePollingJob() {
  logger.info('Updating Zabbix polling job...');

  // Зупиняємо поточний job
  if (pollingJob) {
    pollingJob.stop();
    pollingJob = null;
  }

  // Налаштовуємо новий job
  setupZabbixPolling();
}

/**
 * Зупинка polling job
 */
function stopPollingJob() {
  if (pollingJob) {
    pollingJob.stop();
    pollingJob = null;
    logger.info('Zabbix polling job stopped');
  }
}

/**
 * Ручний запуск опитування (для тестування або API)
 */
async function pollNow() {
  try {
    logger.info('Manual Zabbix polling triggered...');

    // Перевіряємо чи інтеграція увімкнена
    let config = await ZabbixConfig.getActive();
    if (!config || !config.enabled) {
      return {
        success: false,
        error: 'Zabbix integration is disabled',
      };
    }

    // Отримуємо конфігурацію з токеном
    if (config._id) {
      config =
        (await ZabbixConfig.findById(config._id).select(
          '+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV'
        )) || config;
    }

    // Обробляємо нові алерти
    const result = await zabbixAlertService.processNewAlerts();

    // Оновлюємо статус вирішених алертів
    if (result.success) {
      try {
        await zabbixAlertService.updateResolvedAlerts();
      } catch (resolveError) {
        logger.error('Error updating resolved alerts:', resolveError);
      }
    }

    return result;
  } catch (error) {
    logger.error('Error in manual Zabbix polling:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  setupZabbixPolling,
  updatePollingJob,
  stopPollingJob,
  pollNow,
};
