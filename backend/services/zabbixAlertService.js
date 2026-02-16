const ZabbixAlert = require('../models/ZabbixAlert');
const ZabbixAlertGroup = require('../models/ZabbixAlertGroup');
const ZabbixConfig = require('../models/ZabbixConfig');
const zabbixService = require('./zabbixService');
const telegramService = require('./telegramServiceInstance');
const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');

/**
 * Утиліта для retry з exponential backoff
 */
class RetryUtils {
  static async withRetry(operation, options = {}) {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      exponentialBase = 2,
      timeout = 30000, // Timeout для однієї спроби
      retryCondition = _error => true, // За замовчуванням повторювати всі помилки
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Додаємо timeout для операції
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Operation timeout')), timeout);
        });

        return await Promise.race([operation(), timeoutPromise]);
      } catch (error) {
        lastError = error;

        // Якщо це остання спроба або помилка не підлягає повтору
        if (attempt === maxRetries || !retryCondition(error)) {
          throw error;
        }

        // Розраховуємо затримку з exponential backoff + jitter
        const delay = Math.min(
          baseDelay * Math.pow(exponentialBase, attempt) + Math.random() * 1000,
          maxDelay
        );

        logger.warn(
          `Operation failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`,
          {
            error: error.message,
            operation: operation.name || 'anonymous',
            timeout,
          }
        );

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  static isRetryableError(error) {
    // Повторювати помилки мережі, таймаути, але не бізнес-логіку
    const retryableCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE'];
    const retryableMessages = ['timeout', 'network', 'connection', 'socket'];

    if (error.code && retryableCodes.includes(error.code)) {
      return true;
    }

    if (error.message) {
      const message = error.message.toLowerCase();
      return retryableMessages.some(keyword => message.includes(keyword));
    }

    return false;
  }
}

/**
 * Circuit Breaker для захисту від постійних помилок
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5; // Кількість помилок для відкриття
    this.recoveryTimeout = options.recoveryTimeout || 60000; // Час на відновлення (мс)
    this.monitoringPeriod = options.monitoringPeriod || 60000; // Період моніторингу (мс)

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    this.nextAttemptTime = null;
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
      // Переходимо в HALF_OPEN для тестування
      this.state = 'HALF_OPEN';
      logger.info('Circuit breaker moving to HALF_OPEN state for testing');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.successCount++;

    if (this.state === 'HALF_OPEN') {
      // Якщо успішно, повертаємося до CLOSED
      this.state = 'CLOSED';
      logger.info('Circuit breaker recovered, moving to CLOSED state');
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.recoveryTimeout;
      logger.warn(
        `Circuit breaker opened after ${this.failureCount} failures, next attempt at ${new Date(this.nextAttemptTime)}`
      );
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  // Періодичне скидання лічильників
  resetCounters() {
    if (
      this.state === 'CLOSED' &&
      Date.now() - (this.lastFailureTime || 0) > this.monitoringPeriod
    ) {
      this.failureCount = 0;
      this.successCount = 0;
    }
  }
}

class ZabbixAlertService {
  constructor() {
    this.isInitialized = false;
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 хвилина
      monitoringPeriod: 300000, // 5 хвилин
    });

    // Таймер для періодичного скидання лічильників circuit breaker
    this.circuitBreakerResetTimer = setInterval(() => {
      this.circuitBreaker.resetCounters();
    }, 60000); // Кожну хвилину
  }

  /**
   * Отримати стан circuit breaker
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getState();
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
        config =
          (await ZabbixConfig.findById(config._id).select(
            '+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV'
          )) || config;
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
      hostName =
        problemHost.host ||
        problemHost.name ||
        (typeof problemHost === 'string' ? problemHost : 'Unknown');
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
    const acknowledged =
      problem.acknowledged === '1' || problem.acknowledged === 1 || problem.acknowledged === true;
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
      notificationSent: false,
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
        errors: [],
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
          error: error.message,
        });
      }
    }

    return {
      saved,
      updated,
      newAlertIds,
      errors,
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

      logger.info(`🔍 Checking alert ${alert.alertId} against ${groups.length} groups`, {
        alertId: alert.alertId,
        host: alert.host,
        severity: alert.severity,
        triggerId: alert.triggerId,
        triggerName: alert.triggerName,
        groupsCount: groups.length,
      });

      for (const group of groups) {
        const matches = group.checkAlertMatch(alert);
        logger.info(`🔍 Group "${group.name}" match result: ${matches}`, {
          groupId: group._id,
          groupName: group.name,
          enabled: group.enabled,
          severityLevels: group.severityLevels,
          hostPatterns: group.hostPatterns,
          triggerIds: group.triggerIds,
          alertSeverity: alert.severity,
          alertHost: alert.host,
          alertTriggerId: alert.triggerId,
          hasTelegramGroup: !!(group.telegram && group.telegram.groupId),
          telegramGroupId: group.telegram?.groupId,
        });

        if (matches) {
          matchingGroups.push(group);
          logger.info(`✅ Alert ${alert.alertId} matches group "${group.name}"`);
        }
      }

      logger.info(`Found ${matchingGroups.length} matching groups for alert ${alert.alertId}`, {
        alertId: alert.alertId,
        matchingGroups: matchingGroups.map(g => g.name),
      });

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
      4: 'Disaster',
    };

    const severityEmojis = {
      0: '⚪',
      1: 'ℹ️',
      2: '⚠️',
      3: '🔴',
      4: '🚨',
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
   * AI Enrichment алерту — збагачення опису для Telegram нотифікації.
   * Тікети НЕ створюються — лише інформування адміна.
   * @param {Object} alert - ZabbixAlert model instance
   * @returns {Promise<Object|null>} - AI analysis result or null
   */
  async analyzeAlertWithAI(alert) {
    try {
      const aiFirstLineService = require('./aiFirstLineService');

      const recentAlerts = await ZabbixAlert.find({
        host: alert.host,
        eventTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        alertId: { $ne: alert.alertId },
      })
        .sort({ eventTime: -1 })
        .limit(10)
        .lean();

      const analysis = await aiFirstLineService.analyzeZabbixAlert(alert, {
        recentAlerts,
      });

      if (!analysis) {
        logger.info(`AI: Zabbix alert analysis returned null for ${alert.alertId}`);
        return null;
      }

      alert.metadata = {
        ...(alert.metadata || {}),
        aiAnalysis: {
          isCritical: analysis.isCritical,
          isDuplicate: analysis.isDuplicate,
          duplicateAlertId: analysis.duplicateAlertId,
          isRecurring: analysis.isRecurring,
          impactAssessment: analysis.impactAssessment,
          descriptionUk: analysis.descriptionUk,
          possibleCauses: analysis.possibleCauses,
          recommendedActions: analysis.recommendedActions,
          analyzedAt: new Date(),
        },
      };
      await alert.save();

      logger.info(`🤖 AI Zabbix enrichment for ${alert.alertId}`, {
        isDuplicate: analysis.isDuplicate,
        isRecurring: analysis.isRecurring,
        impactAssessment: analysis.impactAssessment,
      });

      return analysis;
    } catch (err) {
      logger.error(`AI Zabbix analysis error for ${alert.alertId}:`, err);
      return null;
    }
  }

  /**
   * Форматування повідомлення з AI enrichment для Telegram.
   * Тікети НЕ створюються — лише інформативне повідомлення для адміна.
   * @param {Object} alert - ZabbixAlert
   * @param {Object|null} aiAnalysis - AI analysis result
   * @returns {String}
   */
  formatEnrichedAlertMessage(alert, aiAnalysis) {
    if (!aiAnalysis || !aiAnalysis.telegramSummary) {
      return this.formatAlertMessage(alert);
    }

    const severityEmojis = { 0: '⚪', 1: 'ℹ️', 2: '⚠️', 3: '🔴', 4: '🚨' };
    const severity = alert.severity || 0;
    const emoji = severityEmojis[severity] || '❓';
    const severityLabel = alert.severityLabel || 'Unknown';
    const eventTime = alert.eventTime
      ? new Date(alert.eventTime).toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' })
      : new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' });

    const impactEmojis = { critical: '🔥', high: '🔴', medium: '🟡', low: '🟢' };
    const impactEmoji = impactEmojis[aiAnalysis.impactAssessment] || '❓';

    let msg = `${emoji} *Zabbix: ${severityLabel}*\n\n`;
    msg += `🏷️ *Host:* ${alert.host}\n`;
    msg += `⚙️ *Trigger:* ${alert.triggerName}\n`;
    msg += `⏰ *Час:* ${eventTime}\n`;
    msg += `${impactEmoji} *Вплив:* ${aiAnalysis.impactAssessment}\n`;

    if (aiAnalysis.isRecurring) {
      msg += `\n⚠️ *ПОВТОРЮВАНИЙ АЛЕРТ*\n`;
    }

    msg += `\n💡 *AI аналіз:*\n${aiAnalysis.telegramSummary}\n`;

    if (aiAnalysis.isDuplicate && aiAnalysis.duplicateAlertId) {
      msg += `\n📋 *Дублікат алерту:* #${aiAnalysis.duplicateAlertId} (нотифікація повторна)`;
    }

    return msg;
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
      logger.info(`📤 Attempting to send message to Telegram group`, {
        groupId,
        groupIdType: typeof groupId,
        groupIdLength: groupId ? String(groupId).length : 0,
        botTokenPrefix: botToken ? botToken.substring(0, 10) + '...' : 'null',
        botTokenLength: botToken ? botToken.length : 0,
        hasBotToken: !!(botToken && botToken.trim()),
        telegramServiceInitialized: telegramService.isInitialized,
        hasGlobalBot: !!telegramService.bot,
        messageLength: message ? message.length : 0,
      });

      let bot = null;

      // Якщо вказано кастомний токен бота, створюємо новий екземпляр бота
      if (botToken && botToken.trim()) {
        const cleanToken = botToken.trim();
        const tokenParts = cleanToken.split(':');
        logger.info(`Creating new Telegram bot instance with custom token`, {
          tokenBotId: tokenParts[0],
          tokenLength: cleanToken.length,
          tokenFormat:
            tokenParts.length === 2 ? 'valid (id:hash)' : `invalid (${tokenParts.length} parts)`,
          targetGroupId: groupId,
        });
        bot = new TelegramBot(cleanToken, { polling: false });
      } else if (telegramService.bot) {
        // Використовуємо глобальний бот, якщо він ініціалізований
        logger.info(`Using global Telegram bot instance`);
        bot = telegramService.bot;
      }

      if (!bot) {
        const errorMsg = botToken
          ? 'Failed to create Telegram bot with provided token'
          : 'Telegram bot not initialized and no bot token provided';
        logger.error(`❌ ${errorMsg}`, { groupId, hasBotToken: !!botToken });
        return { success: false, error: errorMsg };
      }

      logger.info(`✅ Telegram bot ready, sending message to group`, {
        groupId,
        botUsername: bot.options?.username || 'unknown',
      });

      // Спробуємо відправити з Markdown форматуванням
      try {
        logger.info(`📨 Sending message with Markdown formatting to group ${groupId}`);
        const result = await bot.sendMessage(String(groupId), message, {
          parse_mode: 'Markdown',
        });

        logger.info(`✅ Message successfully sent to Telegram group ${groupId}`, {
          messageId: result.message_id,
          chatId: result.chat?.id,
          chatTitle: result.chat?.title,
        });

        return { success: true, messageId: result.message_id };
      } catch (markdownError) {
        // Якщо помилка пов'язана з форматуванням Markdown, спробуємо відправити без форматування
        if (
          markdownError.message &&
          (markdownError.message.includes('parse') ||
            markdownError.message.includes('Markdown') ||
            markdownError.code === 400)
        ) {
          logger.warn('Markdown formatting error, trying to send without Markdown', {
            groupId,
            error: markdownError.message,
          });

          try {
            // Відправляємо без Markdown форматування
            const result = await bot.sendMessage(groupId, message, {
              parse_mode: 'HTML',
            });
            return { success: true, messageId: result.message_id, fallback: 'HTML' };
          } catch (htmlError) {
            // Якщо і HTML не працює, відправляємо як звичайний текст
            logger.warn('HTML formatting error, trying to send as plain text', {
              groupId,
              error: htmlError.message,
            });

            // Відправляємо як звичайний текст без форматування
            const plainMessage = message.replace(/\*/g, '').replace(/_/g, '').replace(/`/g, '');
            const result = await bot.sendMessage(groupId, plainMessage);
            return { success: true, messageId: result.message_id, fallback: 'plain' };
          }
        } else {
          throw markdownError;
        }
      }
    } catch (error) {
      const errorDetails = {
        message: error.message || 'Unknown error',
        code: error.code,
        response: error.response?.data || error.response?.body || error.response,
      };

      // Формуємо детальне повідомлення про помилку
      let errorMsg = errorDetails.message;
      if (errorDetails.response) {
        if (typeof errorDetails.response === 'object') {
          const desc =
            errorDetails.response.description || errorDetails.response.error_description || '';
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
        ...errorDetails,
      });

      return {
        success: false,
        error: errorMsg,
        code: errorDetails.code,
        details: errorDetails.response,
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
      groupsCount: groups ? groups.length : 0,
    });

    if (!groups || groups.length === 0) {
      logger.warn(`No groups found for alert ${alertId}`);
      return {
        sent: 0,
        failed: 0,
        total: 0,
      };
    }

    // Перевіряємо чи є хоча б один спосіб відправки
    // Якщо є групи з Telegram групами (з токенами ботів або без) - можемо відправляти
    // Якщо немає груп з Telegram групами - потрібен глобальний бот для відправки окремим адміністраторам
    const hasGroupsWithTelegramGroups = groups.some(
      group => group.telegram && group.telegram.groupId && group.telegram.groupId.trim()
    );
    const hasGroupsWithoutTelegramGroups = groups.some(
      group => !group.telegram || !group.telegram.groupId || !group.telegram.groupId.trim()
    );

    logger.info(`Notification groups analysis:`, {
      hasGroupsWithTelegramGroups,
      hasGroupsWithoutTelegramGroups,
      telegramServiceInitialized: telegramService.isInitialized,
      telegramBotExists: !!telegramService.bot,
    });

    // Якщо є групи з Telegram групами - можемо відправляти навіть без глобального бота
    // Якщо всі групи без Telegram груп - потрібен глобальний бот для відправки окремим адміністраторам
    if (!hasGroupsWithTelegramGroups && hasGroupsWithoutTelegramGroups) {
      if (!telegramService.isInitialized || !telegramService.bot) {
        logger.warn(
          'Telegram service is not initialized, cannot send notifications to individual administrators',
          {
            isInitialized: telegramService.isInitialized,
            hasBot: !!telegramService.bot,
          }
        );
        return {
          sent: 0,
          failed: 0,
          total: 0,
          error: 'Telegram service not initialized',
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
        hasFormatMessage: !!alert.formatMessage,
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
        logger.info(
          `Skipping notification for group ${group.name} due to min notification interval`,
          {
            groupId: group._id,
            lastNotificationAt: group.stats?.lastNotificationAt,
            minInterval: group.settings?.minNotificationInterval,
          }
        );
        continue;
      }

      try {
        const severityLabel =
          alert.severityLabel ||
          (alert.severity === 3 ? 'High' : alert.severity === 4 ? 'Disaster' : 'Unknown');
        const title = `Zabbix Alert: ${severityLabel}`;
        const fullMessage = `📢 ${title}\n\n${message}`;

        logger.info(`Sending notification to group ${group.name}`, {
          groupId: group._id,
          telegramGroupId: group.telegram?.groupId,
          telegramBotTokenPrefix: group.telegram?.botToken
            ? group.telegram.botToken.substring(0, 10) + '...'
            : 'null',
          hasTelegramGroup: !!(group.telegram && group.telegram.groupId),
          hasBotToken: !!(group.telegram && group.telegram.botToken),
          telegramObject: JSON.stringify(group.telegram),
        });

        // Перевіряємо чи вказано ID групи Telegram
        if (group.telegram && group.telegram.groupId && group.telegram.groupId.trim()) {
          // Відправляємо сповіщення в групу Telegram
          const botToken =
            group.telegram.botToken && group.telegram.botToken.trim()
              ? group.telegram.botToken.trim()
              : null;
          const groupId = group.telegram.groupId.trim();

          try {
            const result = await this.sendMessageToGroup(botToken, groupId, fullMessage);

            if (result.success) {
              sent++;
              logger.info(`✅ Zabbix alert notification sent to Telegram group ${groupId}`, {
                groupName: group.name,
                messageId: result.messageId,
                alertId,
              });
            } else {
              failed++;
              const errorMsg = result.error || 'Unknown error';
              errors.push({
                group: group.name,
                type: 'telegram_group',
                error: errorMsg,
                code: result.code,
                details: result.details,
              });
              logger.error(`❌ Error sending notification to Telegram group ${groupId}`, {
                groupName: group.name,
                error: errorMsg,
                code: result.code,
                details: result.details,
                alertId,
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
              details: error.response?.data || error.response?.body,
            });
            logger.error(`❌ Exception sending notification to Telegram group ${groupId}`, {
              groupName: group.name,
              error: errorMsg,
              code: error.code,
              response: error.response?.data || error.response?.body,
              alertId,
            });
          }
        } else {
          // Відправляємо сповіщення окремим адміністраторам
          logger.info(`Getting admins with Telegram for group ${group.name}`);
          const admins = await group.getAdminsWithTelegram();

          logger.info(`Found ${admins.length} admins with Telegram in group ${group.name}`, {
            adminCount: admins.length,
            adminEmails: admins.map(a => a.email),
          });

          if (admins.length === 0) {
            failed++;
            const errorMsg = `No admins with Telegram ID in group ${group.name} and no Telegram group ID specified`;
            errors.push({
              group: group.name,
              type: 'no_admins',
              error: errorMsg,
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
                  error: errorMsg,
                });
                logger.warn(`${errorMsg}. Cannot send notification.`);
                continue;
              }

              await telegramService.sendNotification(telegramId, {
                title: title,
                message: message,
                type: 'zabbix_alert',
              });

              sent++;
              logger.info(`✅ Zabbix alert notification sent to admin ${admin.email}`, {
                telegramId,
                alertId,
              });
            } catch (error) {
              failed++;
              const errorMsg = error.message || 'Error sending notification';
              errors.push({
                group: group.name,
                type: 'admin_notification',
                admin: admin.email,
                telegramId: admin.telegramId,
                error: errorMsg,
                code: error.code,
                details: error.response?.data,
              });
              logger.error(`❌ Error sending notification to admin ${admin.email}`, {
                telegramId: admin.telegramId,
                error: errorMsg,
                code: error.code,
                response: error.response?.data,
                alertId,
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
          error: errorMsg,
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
      errors: errors.length > 0 ? errors : undefined,
    };

    logger.info(`📊 Notification sending completed for alert ${alertId}`, {
      ...result,
      alertId,
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
          // Перевіряємо конфігурацію для більш детального повідомлення
          const config = await ZabbixConfig.getActive();
          if (!config || !config.enabled) {
            return {
              success: false,
              error: 'Zabbix integration is disabled. Please enable it in settings.',
            };
          }

          if (!config.url || !config.url.trim()) {
            return {
              success: false,
              error: 'Zabbix URL is not configured. Please configure Zabbix URL in settings.',
            };
          }

          const hasToken = !!(config.apiTokenEncrypted && config.apiTokenIV);
          const hasCredentials = !!(
            config.username &&
            config.username.trim() &&
            config.passwordEncrypted &&
            config.passwordIV
          );

          if (!hasToken && !hasCredentials) {
            return {
              success: false,
              error:
                'Zabbix credentials are required. Please configure Zabbix API token or username/password in settings.',
            };
          }

          return {
            success: false,
            error:
              'Zabbix Alert Service is not initialized. Please check Zabbix configuration and credentials.',
          };
        }
      }

      // Отримуємо конфігурацію з токеном
      let config = await ZabbixConfig.getActive();
      if (!config || !config.enabled) {
        return {
          success: false,
          error: 'Zabbix integration is disabled',
        };
      }

      // Отримуємо конфігурацію з токеном для ініціалізації
      if (config._id) {
        config =
          (await ZabbixConfig.findById(config._id).select(
            '+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV'
          )) || config;
      }

      // Перевіряємо чи сервіс ініціалізований
      if (!zabbixService.isInitialized) {
        logger.warn('Zabbix service not initialized, attempting to initialize...');
        const initialized = await zabbixService.initialize(config);
        if (!initialized) {
          throw new Error('Failed to initialize Zabbix service');
        }
      }

      // Отримуємо всі активні групи для визначення потрібних severity levels
      const activeGroups = await ZabbixAlertGroup.find({ enabled: true });
      const requiredSeverities = new Set();

      // Збираємо всі severity levels з активних груп
      activeGroups.forEach(group => {
        if (group.severityLevels && group.severityLevels.length > 0) {
          group.severityLevels.forEach(sev => requiredSeverities.add(sev));
        }
      });

      // Якщо немає груп з вказаними severity levels, використовуємо всі (0-4)
      // Якщо є групи, але вони не вказали severity levels, також використовуємо всі
      const severitiesToFetch =
        requiredSeverities.size > 0 ? Array.from(requiredSeverities) : [0, 1, 2, 3, 4];

      logger.info(`Fetching Zabbix problems with severities: ${severitiesToFetch.join(', ')}`, {
        activeGroupsCount: activeGroups.length,
        requiredSeverities: Array.from(requiredSeverities),
      });

      // Отримуємо проблеми з деталями для потрібних severity levels з retry та circuit breaker
      const problemsResult = await this.circuitBreaker.execute(() =>
        RetryUtils.withRetry(() => zabbixService.getProblemsWithDetails(severitiesToFetch, 1000), {
          maxRetries: 3,
          baseDelay: 2000,
          retryCondition: RetryUtils.isRetryableError,
        })
      );

      if (!problemsResult.success) {
        logger.error('Failed to get problems from Zabbix after retries:', {
          error: problemsResult.error,
          code: problemsResult.code,
          circuitBreakerState: this.circuitBreaker.getState(),
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
          notificationsSent: 0,
        };
      }

      // Фільтруємо алерти за severity levels (якщо потрібно)
      // Якщо є групи з вказаними severity levels, фільтруємо тільки їх
      let filteredProblems = problems;
      if (requiredSeverities.size > 0) {
        filteredProblems = problems.filter(problem => {
          const severity = parseInt(problem.severity) || 0;
          return requiredSeverities.has(severity);
        });
      }

      if (filteredProblems.length === 0) {
        await config.recordSuccess(0);
        return {
          success: true,
          alertsProcessed: 0,
          alertsSaved: 0,
          notificationsSent: 0,
        };
      }

      // Перетворюємо проблеми в алерти
      const alertsData = filteredProblems.map(problem => {
        return this.transformProblemToAlert(problem, problem.trigger || null, problem.host || null);
      });

      // Зберігаємо алерти
      const saveResult = await this.saveAlerts(alertsData);

      // Отримуємо нові алерти для сповіщень (тільки щойно створені)
      const newAlerts = await ZabbixAlert.find({
        alertId: { $in: saveResult.newAlertIds || [] },
        notificationSent: false,
        resolved: false,
        status: 'PROBLEM',
      });

      // Також перевіряємо оновлені алерти, які могли змінити статус на PROBLEM
      // і ще не мають відправлених сповіщень
      const updatedAlertIds =
        saveResult.updated > 0
          ? await ZabbixAlert.find({
              alertId: { $in: alertsData.map(a => a.alertId) },
              _id: { $nin: newAlerts.map(a => a._id) }, // Виключаємо вже знайдені нові
              notificationSent: false,
              resolved: false,
              status: 'PROBLEM',
            }).distinct('alertId')
          : [];

      const updatedAlerts =
        updatedAlertIds.length > 0
          ? await ZabbixAlert.find({
              alertId: { $in: updatedAlertIds },
              notificationSent: false,
              resolved: false,
              status: 'PROBLEM',
            })
          : [];

      // Об'єднуємо нові та оновлені алерти для сповіщень
      const alertsToNotify = [...newAlerts, ...updatedAlerts];

      logger.info(`📬 Processing ${alertsToNotify.length} alerts for notifications`, {
        newAlerts: newAlerts.length,
        updatedAlerts: updatedAlerts.length,
      });

      // AI Enrichment + Notifications (тікети НЕ створюються — тільки інформування)
      let totalNotificationsSent = 0;
      for (const alert of alertsToNotify) {
        logger.info(`📨 Processing alert ${alert.alertId} for AI enrichment + notification`, {
          alertId: alert.alertId,
          host: alert.host,
          severity: alert.severity,
          triggerName: alert.triggerName,
        });

        // --- AI ENRICHMENT (збагачення опису для адміна) ---
        let aiAnalysis = null;
        try {
          aiAnalysis = await this.analyzeAlertWithAI(alert);
        } catch (aiErr) {
          logger.warn(`AI enrichment failed for alert ${alert.alertId}, sending raw notification`, {
            error: aiErr.message,
          });
        }

        // --- DUPLICATE: лише логуємо, нотифікація все одно йде ---
        if (aiAnalysis && aiAnalysis.isDuplicate) {
          logger.info(`📋 Alert ${alert.alertId} is a duplicate of ${aiAnalysis.duplicateAlertId}`);
        }

        // --- NOTIFICATIONS (з AI enrichment якщо доступний) ---
        let groups = await this.getAlertGroupsForAlert(alert);

        // Фільтр onlyCritical: якщо AI каже що алерт НЕ критичний — відсіюємо групи з onlyCritical=true
        if (aiAnalysis && !aiAnalysis.isCritical) {
          const beforeCount = groups.length;
          groups = groups.filter(g => !g.settings?.onlyCritical);
          if (beforeCount > groups.length) {
            logger.info(
              `🔇 Filtered out ${beforeCount - groups.length} groups (onlyCritical) for non-critical alert ${alert.alertId}`
            );
          }
        }

        if (groups.length > 0) {
          logger.info(`✅ Found ${groups.length} matching groups for alert ${alert.alertId}`);

          for (const group of groups) {
            await group.recordMatch();
          }

          if (aiAnalysis && aiAnalysis.telegramSummary) {
            const enrichedMessage = this.formatEnrichedAlertMessage(alert, aiAnalysis);
            const originalFormatMessage = alert.formatMessage;
            alert.formatMessage = () => enrichedMessage;

            const notificationResult = await this.sendNotifications(alert, groups);
            totalNotificationsSent += notificationResult.sent;

            alert.formatMessage = originalFormatMessage;

            logger.info(
              `📊 AI-enriched notification for ${alert.alertId}: sent=${notificationResult.sent}, failed=${notificationResult.failed}`
            );
          } else {
            const notificationResult = await this.sendNotifications(alert, groups);
            totalNotificationsSent += notificationResult.sent;

            logger.info(
              `📊 Raw notification for ${alert.alertId}: sent=${notificationResult.sent}, failed=${notificationResult.failed}`
            );
          }
        } else {
          logger.warn(`⚠️ No matching groups for alert ${alert.alertId}`, {
            host: alert.host,
            severity: alert.severity,
          });
        }
      }

      // Оновлюємо статистику конфігурації
      await config.recordSuccess(newAlerts.length);

      return {
        success: true,
        alertsProcessed: filteredProblems.length,
        alertsSaved: saveResult.saved,
        alertsUpdated: saveResult.updated,
        notificationsSent: totalNotificationsSent,
        errors: saveResult.errors,
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
        error: error.message,
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
        status: 'PROBLEM',
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
        resolvedCount,
      };
    } catch (error) {
      logger.error('Error updating resolved alerts:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Експортуємо singleton instance
module.exports = new ZabbixAlertService();
