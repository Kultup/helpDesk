const ZabbixAlert = require('../models/ZabbixAlert');
const ZabbixAlertGroup = require('../models/ZabbixAlertGroup');
const ZabbixConfig = require('../models/ZabbixConfig');
const zabbixService = require('./zabbixService');
const telegramService = require('./telegramServiceInstance');
const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');

class ZabbixAlertService {
  constructor() {
    this.isInitialized = false;
  }

  /**
   * Ініціалізація сервісу
   */
  async initialize() {
    try {
      let config = await ZabbixConfig.getActive();
      if (!config || !config.enabled) {
        logger.info('Zabbix Alert Service: Integration is disabled');
        this.isInitialized = false;
        return false;
      }

      // Отримуємо конфігурацію з токеном
      if (config._id) {
        config = await ZabbixConfig.findById(config._id).select('+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV') || config;
      }

      const initialized = await zabbixService.initialize(config);
      this.isInitialized = initialized;
      return initialized;
    } catch (error) {
      logger.error('Error initializing Zabbix Alert Service:', error);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Фільтрація критичних алертів (тільки High=3 та Disaster=4)
   * @param {Array} problems - Масив проблем з Zabbix
   * @returns {Array} - Відфільтровані критичні алерти
   */
  filterCriticalAlerts(problems) {
    if (!problems || problems.length === 0) {
      return [];
    }

    return problems.filter(problem => {
      const severity = parseInt(problem.severity) || 0;
      return severity === 3 || severity === 4; // High або Disaster
    });
  }

  /**
   * Перетворення проблеми Zabbix в модель ZabbixAlert
   * @param {Object} problem - Проблема з Zabbix
   * @param {Object} trigger - Тригер (опціонально)
   * @param {Object} host - Хост (опціонально)
   * @returns {Object} - Об'єкт для створення ZabbixAlert
   */
  transformProblemToAlert(problem, trigger = null, host = null) {
    const severity = parseInt(problem.severity) || 0;
    
    // Отримуємо час події
    let eventTime = new Date();
    if (problem.clock) {
      eventTime = new Date(parseInt(problem.clock) * 1000);
    } else if (problem.eventid && problem.eventid.includes('_')) {
      // Якщо eventid містить timestamp
      const parts = problem.eventid.split('_');
      if (parts.length > 1) {
        const timestamp = parseInt(parts[parts.length - 1]);
        if (!isNaN(timestamp)) {
          eventTime = new Date(timestamp * 1000);
        }
      }
    }
    
    // Визначаємо статус
    const status = problem.value === '1' || problem.value === 1 ? 'PROBLEM' : 'OK';
    
    // Отримуємо назву хоста
    let hostName = 'Unknown';
    let hostId = 'unknown';
    
    if (host) {
      hostName = host.host || host.name || 'Unknown';
      hostId = host.hostid || 'unknown';
    } else if (trigger && trigger.hosts && trigger.hosts.length > 0) {
      const triggerHost = trigger.hosts[0];
      hostName = triggerHost.host || triggerHost.name || 'Unknown';
      hostId = triggerHost.hostid || 'unknown';
    } else if (problem.hosts && problem.hosts.length > 0) {
      const problemHost = problem.hosts[0];
      hostName = problemHost.host || problemHost.name || (typeof problemHost === 'string' ? problemHost : 'Unknown');
      hostId = problemHost.hostid || (typeof problemHost === 'string' ? problemHost : 'unknown');
    }

    // Отримуємо ID тригера
    let triggerId = 'unknown';
    if (problem.objectid) {
      triggerId = problem.objectid;
    } else if (trigger && trigger.triggerid) {
      triggerId = trigger.triggerid;
    }

    // Отримуємо назву тригера
    let triggerName = 'Unknown Trigger';
    if (trigger && trigger.description) {
      triggerName = trigger.description;
    } else if (problem.name) {
      triggerName = problem.name;
    } else if (trigger && trigger.expression) {
      triggerName = trigger.expression;
    }

    // Отримуємо опис тригера
    let triggerDescription = '';
    if (trigger && trigger.comments) {
      triggerDescription = trigger.comments;
    }

    // Отримуємо alertId (унікальний ID події)
    let alertId = problem.eventid || problem.objectid || problem.problemid;
    if (!alertId && trigger) {
      // Якщо немає eventid, створюємо унікальний ID на основі triggerid та часу
      alertId = `${triggerId}_${eventTime.getTime()}`;
    }

    // Перевіряємо чи підтверджено
    const acknowledged = problem.acknowledged === '1' || problem.acknowledged === 1 || problem.acknowledged === true;
    let acknowledgedBy = null;
    let acknowledgedAt = null;

    if (acknowledged && problem.acknowledges && problem.acknowledges.length > 0) {
      const lastAck = problem.acknowledges[problem.acknowledges.length - 1];
      acknowledgedBy = lastAck.username || lastAck.alias || lastAck.userid || null;
      if (lastAck.clock) {
        acknowledgedAt = new Date(parseInt(lastAck.clock) * 1000);
      }
    }

    // Отримуємо повідомлення
    let message = '';
    if (problem.name) {
      message = problem.name;
    } else if (problem.opdata) {
      message = problem.opdata;
    } else if (triggerName !== 'Unknown Trigger') {
      message = triggerName;
    }

    return {
      alertId: String(alertId),
      triggerId: String(triggerId),
      hostId: String(hostId),
      host: hostName,
      triggerName: triggerName,
      triggerDescription: triggerDescription,
      severity: severity,
      status: status,
      message: message,
      eventTime: eventTime,
      updateTime: eventTime,
      acknowledged: acknowledged,
      acknowledgedAt: acknowledgedAt,
      acknowledgedBy: acknowledgedBy,
      resolved: status === 'OK',
      resolvedAt: status === 'OK' ? eventTime : null,
      zabbixData: problem,
      notificationSent: false
    };
  }

  /**
   * Збереження алертів в базу даних
   * @param {Array} alerts - Масив алертів для збереження
   * @returns {Object} - Результат збереження з списком нових alertId
   */
  async saveAlerts(alerts) {
    if (!alerts || alerts.length === 0) {
      return {
        saved: 0,
        updated: 0,
        newAlertIds: [],
        errors: []
      };
    }

    let saved = 0;
    let updated = 0;
    const newAlertIds = [];
    const errors = [];

    for (const alertData of alerts) {
      try {
        // Перевіряємо чи існує алерт з таким alertId
        const existingAlert = await ZabbixAlert.findOne({ alertId: alertData.alertId });

        if (existingAlert) {
          // Оновлюємо існуючий алерт
          existingAlert.status = alertData.status;
          existingAlert.updateTime = alertData.updateTime;
          existingAlert.acknowledged = alertData.acknowledged;
          existingAlert.acknowledgedAt = alertData.acknowledgedAt;
          existingAlert.acknowledgedBy = alertData.acknowledgedBy;
          existingAlert.resolved = alertData.resolved;
          existingAlert.resolvedAt = alertData.resolvedAt;
          existingAlert.zabbixData = alertData.zabbixData;
          existingAlert.message = alertData.message;

          await existingAlert.save();
          updated++;
        } else {
          // Створюємо новий алерт
          const alert = new ZabbixAlert(alertData);
          await alert.save();
          newAlertIds.push(alertData.alertId);
          saved++;
        }
      } catch (error) {
        logger.error(`Error saving alert ${alertData.alertId}:`, error);
        errors.push({
          alertId: alertData.alertId,
          error: error.message
        });
      }
    }

    return {
      saved,
      updated,
      newAlertIds,
      errors
    };
  }

  /**
   * Отримання груп для алерту
   * @param {Object} alert - Алерт
   * @returns {Array} - Масив груп, яким потрібно відправити сповіщення
   */
  async getAlertGroupsForAlert(alert) {
    try {
      const groups = await ZabbixAlertGroup.findActive();
      const matchingGroups = [];

      for (const group of groups) {
        if (group.checkAlertMatch(alert)) {
          matchingGroups.push(group);
        }
      }

      return matchingGroups;
    } catch (error) {
      logger.error('Error getting alert groups:', error);
      return [];
    }
  }

  /**
   * Форматування повідомлення для Telegram
   * @param {Object} alert - Алерт (може бути моделлю або об'єктом)
   * @returns {String} - Відформатоване повідомлення
   */
  formatAlertMessage(alert) {
    // Якщо alert має метод formatMessage (модель), використовуємо його
    if (alert && typeof alert.formatMessage === 'function') {
      return alert.formatMessage();
    }

    // Інакше форматуємо вручну
    const severityLabels = {
      0: 'Not classified',
      1: 'Information',
      2: 'Warning',
      3: 'High',
      4: 'Disaster'
    };

    const severityEmojis = {
      0: '⚪',
      1: 'ℹ️',
      2: '⚠️',
      3: '🔴',
      4: '🚨'
    };

    const severity = alert.severity || 0;
    const emoji = severityEmojis[severity] || '❓';
    const severityLabel = severityLabels[severity] || 'Unknown';
    const host = alert.host || 'Unknown';
    const triggerName = alert.triggerName || alert.trigger?.description || 'Unknown Trigger';
    const status = alert.status || 'PROBLEM';
    const eventTime = alert.eventTime 
      ? new Date(alert.eventTime).toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' })
      : new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' });
    const message = alert.message || '';
    const triggerDescription = alert.triggerDescription || alert.trigger?.comments || '';

    let formattedMessage = `${emoji} *Zabbix Alert: ${severityLabel}*\n\n`;
    formattedMessage += `🏷️ *Host:* ${host}\n`;
    formattedMessage += `⚙️ *Trigger:* ${triggerName}\n`;
    formattedMessage += `📊 *Status:* ${status}\n`;
    formattedMessage += `⏰ *Time:* ${eventTime}\n`;
    
    if (message) {
      formattedMessage += `\n📝 *Message:* ${message}`;
    }
    
    if (triggerDescription) {
      formattedMessage += `\n\n📄 *Description:* ${triggerDescription}`;
    }

    return formattedMessage;
  }

  /**
   * Відправка повідомлення в групу Telegram з кастомним токеном бота
   * @param {String} botToken - Токен бота (опціонально, якщо не вказано - використовується глобальний бот)
   * @param {String} groupId - ID групи Telegram
   * @param {String} message - Текст повідомлення
   * @returns {Promise<Object>} - Результат відправки
   */
  async sendMessageToGroup(botToken, groupId, message) {
    try {
      let bot = null;
      
      // Якщо вказано кастомний токен бота, створюємо новий екземпляр бота
      if (botToken && botToken.trim()) {
        bot = new TelegramBot(botToken.trim(), { polling: false });
      } else if (telegramService.bot) {
        // Використовуємо глобальний бот, якщо він ініціалізований
        bot = telegramService.bot;
      }
      
      if (!bot) {
        const errorMsg = botToken 
          ? 'Failed to create Telegram bot with provided token' 
          : 'Telegram bot not initialized and no bot token provided';
        logger.error(errorMsg, { groupId, hasBotToken: !!botToken });
        return { success: false, error: errorMsg };
      }
      
      // Спробуємо відправити з Markdown форматуванням
      try {
        const result = await bot.sendMessage(groupId, message, {
          parse_mode: 'Markdown'
        });
        
        return { success: true, messageId: result.message_id };
      } catch (markdownError) {
        // Якщо помилка пов'язана з форматуванням Markdown, спробуємо відправити без форматування
        if (markdownError.message && (
          markdownError.message.includes('parse') || 
          markdownError.message.includes('Markdown') ||
          markdownError.code === 400
        )) {
          logger.warn('Markdown formatting error, trying to send without Markdown', {
            groupId,
            error: markdownError.message
          });
          
          try {
            // Відправляємо без Markdown форматування
            const result = await bot.sendMessage(groupId, message, {
              parse_mode: 'HTML'
            });
            return { success: true, messageId: result.message_id, fallback: 'HTML' };
          } catch (htmlError) {
            // Якщо і HTML не працює, відправляємо як звичайний текст
            logger.warn('HTML formatting error, trying to send as plain text', {
              groupId,
              error: htmlError.message
            });
            
            try {
              // Відправляємо як звичайний текст без форматування
              const plainMessage = message.replace(/\*/g, '').replace(/_/g, '').replace(/`/g, '');
              const result = await bot.sendMessage(groupId, plainMessage);
              return { success: true, messageId: result.message_id, fallback: 'plain' };
            } catch (plainError) {
              throw plainError;
            }
          }
        } else {
          throw markdownError;
        }
      }
    } catch (error) {
      const errorDetails = {
        message: error.message || 'Unknown error',
        code: error.code,
        response: error.response?.data || error.response?.body || error.response
      };
      
      // Формуємо детальне повідомлення про помилку
      let errorMsg = errorDetails.message;
      if (errorDetails.response) {
        if (typeof errorDetails.response === 'object') {
          const desc = errorDetails.response.description || errorDetails.response.error_description || '';
          if (desc) {
            errorMsg += `: ${desc}`;
          }
          // Додаємо параметри помилки, якщо є
          if (errorDetails.response.parameters) {
            const params = errorDetails.response.parameters;
            if (params.migrate_to_chat_id) {
              errorMsg += ` (chat was migrated to: ${params.migrate_to_chat_id})`;
            }
            if (params.retry_after) {
              errorMsg += ` (retry after: ${params.retry_after} seconds)`;
            }
          }
        } else if (typeof errorDetails.response === 'string') {
          errorMsg += `: ${errorDetails.response}`;
        }
      }
      
      logger.error('Помилка відправки повідомлення в групу Telegram:', {
        groupId,
        hasBotToken: !!botToken,
        ...errorDetails
      });
      
      return { 
        success: false, 
        error: errorMsg,
        code: errorDetails.code,
        details: errorDetails.response
      };
    }
  }

  /**
   * Відправка сповіщень через Telegram
   * @param {Object} alert - Алерт (ZabbixAlert model instance)
   * @param {Array} groups - Групи адміністраторів
   * @returns {Object} - Результат відправки
   */
async sendNotifications(alert, groups) {
    const alertId = alert.alertId || alert._id;
    const alertSeverity = alert.severity || 'Unknown';
    const alertHost = alert.host || 'Unknown';
    
    logger.info(`📤 Starting notification sending for alert ${alertId}`, {
      alertId,
      severity: alertSeverity,
      host: alertHost,
      groupsCount: groups ? groups.length : 0
    });
    
    if (!groups || groups.length === 0) {
      logger.warn(`No groups found for alert ${alertId}`);
      return {
        sent: 0,
        failed: 0,
        total: 0
      };
    }

    // Перевіряємо чи є хоча б один спосіб відправки
    // Якщо є групи з Telegram групами (з токенами ботів або без) - можемо відправляти
    // Якщо немає груп з Telegram групами - потрібен глобальний бот для відправки окремим адміністраторам
    const hasGroupsWithTelegramGroups = groups.some(group => 
      group.telegram && group.telegram.groupId && group.telegram.groupId.trim()
    );
    const hasGroupsWithoutTelegramGroups = groups.some(group => 
      !group.telegram || !group.telegram.groupId || !group.telegram.groupId.trim()
    );
    
    logger.info(`Notification groups analysis:`, {
      hasGroupsWithTelegramGroups,
      hasGroupsWithoutTelegramGroups,
      telegramServiceInitialized: telegramService.isInitialized,
      telegramBotExists: !!telegramService.bot
    });
    
    // Якщо є групи з Telegram групами - можемо відправляти навіть без глобального бота
    // Якщо всі групи без Telegram груп - потрібен глобальний бот для відправки окремим адміністраторам
    if (!hasGroupsWithTelegramGroups && hasGroupsWithoutTelegramGroups) {
      if (!telegramService.isInitialized || !telegramService.bot) {
        logger.warn('Telegram service is not initialized, cannot send notifications to individual administrators', {
          isInitialized: telegramService.isInitialized,
          hasBot: !!telegramService.bot
        });
        return {
          sent: 0,
          failed: 0,
          total: 0,
          error: 'Telegram service not initialized'
        };
      }
    }

    let sent = 0;
    let failed = 0;
    const notifiedGroupIds = [];
    const errors = [];

    // Форматуємо повідомлення (використовуємо метод моделі, якщо доступний, або наш метод)
    let message;
    try {
      message = alert.formatMessage ? alert.formatMessage() : this.formatAlertMessage(alert);
      logger.debug(`Formatted alert message for ${alertId}`, {
        messageLength: message ? message.length : 0,
        hasFormatMessage: !!alert.formatMessage
      });
    } catch (formatError) {
      logger.error(`Error formatting alert message for ${alertId}:`, formatError);
      message = `Alert: ${alertHost} - ${alert.message || 'No message'}`;
    }

    // Відправляємо сповіщення кожній групі
    logger.info(`Processing ${groups.length} groups for alert ${alertId}`);
    for (const group of groups) {
        // Перевіряємо чи можна відправити сповіщення (з урахуванням інтервалу)
        if (!group.canSendNotification()) {
          logger.info(`Skipping notification for group ${group.name} due to min notification interval`, {
            groupId: group._id,
            lastNotificationAt: group.stats?.lastNotificationAt,
            minInterval: group.settings?.minNotificationInterval
          });
          continue;
        }

      try {
        const severityLabel = alert.severityLabel || 
          (alert.severity === 3 ? 'High' : alert.severity === 4 ? 'Disaster' : 'Unknown');
        const title = `Zabbix Alert: ${severityLabel}`;
        const fullMessage = `📢 ${title}\n\n${message}`;
        
        logger.info(`Sending notification to group ${group.name}`, {
          groupId: group._id,
          hasTelegramGroup: !!(group.telegram && group.telegram.groupId),
          hasBotToken: !!(group.telegram && group.telegram.botToken)
        });
        
        // Перевіряємо чи вказано ID групи Telegram
        if (group.telegram && group.telegram.groupId && group.telegram.groupId.trim()) {
          // Відправляємо сповіщення в групу Telegram
          const botToken = (group.telegram.botToken && group.telegram.botToken.trim()) ? group.telegram.botToken.trim() : null;
          const groupId = group.telegram.groupId.trim();
          
          try {
            const result = await this.sendMessageToGroup(botToken, groupId, fullMessage);
            
            if (result.success) {
              sent++;
              logger.info(`✅ Zabbix alert notification sent to Telegram group ${groupId}`, {
                groupName: group.name,
                messageId: result.messageId,
                alertId
              });
            } else {
              failed++;
              const errorMsg = result.error || 'Unknown error';
              errors.push({
                group: group.name,
                type: 'telegram_group',
                error: errorMsg,
                code: result.code,
                details: result.details
              });
              logger.error(`❌ Error sending notification to Telegram group ${groupId}`, {
                groupName: group.name,
                error: errorMsg,
                code: result.code,
                details: result.details,
                alertId
              });
            }
          } catch (error) {
            failed++;
            let errorMsg = error.message || 'Exception sending notification';
            
            // Додаємо деталі з response, якщо є
            if (error.response?.data || error.response?.body) {
              const responseData = error.response.data || error.response.body;
              if (typeof responseData === 'object' && responseData.description) {
                errorMsg += `: ${responseData.description}`;
              } else if (typeof responseData === 'string') {
                errorMsg += `: ${responseData}`;
              }
            }
            
            errors.push({
              group: group.name,
              type: 'telegram_group',
              error: errorMsg,
              code: error.code,
              details: error.response?.data || error.response?.body
            });
            logger.error(`❌ Exception sending notification to Telegram group ${groupId}`, {
              groupName: group.name,
              error: errorMsg,
              code: error.code,
              response: error.response?.data || error.response?.body,
              alertId
            });
          }
        } else {
          // Відправляємо сповіщення окремим адміністраторам
          logger.info(`Getting admins with Telegram for group ${group.name}`);
          const admins = await group.getAdminsWithTelegram();
          
          logger.info(`Found ${admins.length} admins with Telegram in group ${group.name}`, {
            adminCount: admins.length,
            adminEmails: admins.map(a => a.email)
          });

          if (admins.length === 0) {
            failed++;
            const errorMsg = `No admins with Telegram ID in group ${group.name} and no Telegram group ID specified`;
            errors.push({
              group: group.name,
              type: 'no_admins',
              error: errorMsg
            });
            logger.info(errorMsg);
            continue;
          }

          // Відправляємо сповіщення кожному адміністратору
          for (const admin of admins) {
            try {
              const telegramId = admin.telegramId;
              
              if (!telegramId) {
                failed++;
                const errorMsg = `Admin ${admin.email} has telegramUsername but no telegramId`;
                errors.push({
                  group: group.name,
                  type: 'admin_no_telegram_id',
                  admin: admin.email,
                  error: errorMsg
                });
                logger.warn(`${errorMsg}. Cannot send notification.`);
                continue;
              }
              
              await telegramService.sendNotification(telegramId, {
                title: title,
                message: message,
                type: 'zabbix_alert'
              });

              sent++;
              logger.info(`✅ Zabbix alert notification sent to admin ${admin.email}`, {
                telegramId,
                alertId
              });
            } catch (error) {
              failed++;
              const errorMsg = error.message || 'Error sending notification';
              errors.push({
                group: group.name,
                type: 'admin_notification',
                admin: admin.email,
                telegramId,
                error: errorMsg,
                code: error.code,
                details: error.response?.data
              });
              logger.error(`❌ Error sending notification to admin ${admin.email}`, {
                telegramId,
                error: errorMsg,
                code: error.code,
                response: error.response?.data,
                alertId
              });
            }
          }
        }

        // Оновлюємо статистику групи
        await group.recordNotification();
        notifiedGroupIds.push(group._id);
      } catch (error) {
        failed++;
        const errorMsg = error.message || 'Error processing group';
        errors.push({
          group: group.name,
          type: 'group_processing',
          error: errorMsg
        });
        logger.error(`Error processing group ${group.name}:`, error);
      }
    }

    // Оновлюємо алерт
    if (sent > 0) {
      await alert.markNotificationSent(notifiedGroupIds);
    }

    const result = {
      sent,
      failed,
      total: sent + failed,
      notifiedGroups: notifiedGroupIds,
      errors: errors.length > 0 ? errors : undefined
    };
    
    logger.info(`📊 Notification sending completed for alert ${alertId}`, {
      ...result,
      alertId
    });
    
    return result;
  }

  /**
   * Обробка нових алертів з Zabbix
   * @returns {Object} - Результат обробки
   */
  async processNewAlerts() {
    try {
      if (!this.isInitialized) {
        const initialized = await this.initialize();
        if (!initialized) {
          return {
            success: false,
            error: 'Zabbix Alert Service is not initialized'
          };
        }
      }

      // Отримуємо конфігурацію з токеном
      let config = await ZabbixConfig.getActive();
      if (!config || !config.enabled) {
        return {
          success: false,
          error: 'Zabbix integration is disabled'
        };
      }

      // Отримуємо конфігурацію з токеном для ініціалізації
      if (config._id) {
        config = await ZabbixConfig.findById(config._id).select('+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV') || config;
      }

      // Перевіряємо чи сервіс ініціалізований
      if (!zabbixService.isInitialized) {
        logger.warn('Zabbix service not initialized, attempting to initialize...');
        const initialized = await zabbixService.initialize(config);
        if (!initialized) {
          throw new Error('Failed to initialize Zabbix service');
        }
      }

      // Отримуємо проблеми з деталями (тільки критичні)
      const problemsResult = await zabbixService.getProblemsWithDetails([3, 4], 1000);

      if (!problemsResult.success) {
        logger.error('Failed to get problems from Zabbix:', {
          error: problemsResult.error,
          code: problemsResult.code
        });
        throw new Error(problemsResult.error || 'Failed to get problems from Zabbix');
      }

      const problems = problemsResult.problems || [];

      if (problems.length === 0) {
        await config.recordSuccess(0);
        return {
          success: true,
          alertsProcessed: 0,
          alertsSaved: 0,
          notificationsSent: 0
        };
      }

      // Фільтруємо критичні алерти (якщо ще не відфільтровані)
      const criticalProblems = this.filterCriticalAlerts(problems);

      if (criticalProblems.length === 0) {
        await config.recordSuccess(0);
        return {
          success: true,
          alertsProcessed: 0,
          alertsSaved: 0,
          notificationsSent: 0
        };
      }

      // Перетворюємо проблеми в алерти
      const alertsData = criticalProblems.map(problem => {
        return this.transformProblemToAlert(
          problem,
          problem.trigger || null,
          problem.host || null
        );
      });

      // Зберігаємо алерти
      const saveResult = await this.saveAlerts(alertsData);

      // Отримуємо нові алерти для сповіщень (тільки щойно створені)
      const newAlerts = await ZabbixAlert.find({
        alertId: { $in: saveResult.newAlertIds || [] },
        notificationSent: false,
        resolved: false,
        status: 'PROBLEM'
      });

      // Відправляємо сповіщення для нових алертів
      let totalNotificationsSent = 0;
      for (const alert of newAlerts) {
        const groups = await this.getAlertGroupsForAlert(alert);
        
        if (groups.length > 0) {
          // Оновлюємо статистику груп
          for (const group of groups) {
            await group.recordMatch();
          }

          const notificationResult = await this.sendNotifications(alert, groups);
          totalNotificationsSent += notificationResult.sent;
        }
      }

      // Оновлюємо статистику конфігурації
      await config.recordSuccess(newAlerts.length);

      return {
        success: true,
        alertsProcessed: criticalProblems.length,
        alertsSaved: saveResult.saved,
        alertsUpdated: saveResult.updated,
        notificationsSent: totalNotificationsSent,
        errors: saveResult.errors
      };
    } catch (error) {
      logger.error('Error processing Zabbix alerts:', error);

      // Оновлюємо статистику помилок
      try {
        const config = await ZabbixConfig.getActive();
        if (config) {
          await config.recordError(error);
        }
      } catch (configError) {
        logger.error('Error recording error in config:', configError);
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Оновлення статусу вирішених проблем
   * @returns {Object} - Результат оновлення
   */
  async updateResolvedAlerts() {
    try {
      // Отримуємо активні проблеми з Zabbix
      const problemsResult = await zabbixService.getProblems([3, 4], 1000);

      if (!problemsResult.success) {
        throw new Error('Failed to get problems from Zabbix');
      }

      const problems = problemsResult.problems || [];
      const activeProblemIds = problems
        .filter(p => p.value === '1')
        .map(p => p.eventid || p.objectid || p.problemid);

      // Отримуємо всі активні алерти з БД
      const activeAlerts = await ZabbixAlert.find({
        resolved: false,
        status: 'PROBLEM'
      });

      let resolvedCount = 0;

      // Перевіряємо які алерти вирішені
      for (const alert of activeAlerts) {
        if (!activeProblemIds.includes(alert.alertId)) {
          // Проблема вирішена в Zabbix
          await alert.markResolved();
          resolvedCount++;
        }
      }

      return {
        success: true,
        resolvedCount
      };
    } catch (error) {
      logger.error('Error updating resolved alerts:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Експортуємо singleton instance
module.exports = new ZabbixAlertService();

