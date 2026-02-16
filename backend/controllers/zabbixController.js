const ZabbixConfig = require('../models/ZabbixConfig');
const ZabbixAlert = require('../models/ZabbixAlert');
const ZabbixAlertGroup = require('../models/ZabbixAlertGroup');
const zabbixService = require('../services/zabbixService');
const zabbixAlertService = require('../services/zabbixAlertService');
const telegramService = require('../services/telegramServiceInstance');
const { updatePollingJob } = require('../jobs/zabbixPolling');
const { pollNow } = require('../jobs/zabbixPolling');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * Отримати налаштування Zabbix
 */
exports.getConfig = async (req, res) => {
  try {
    // Отримуємо або створюємо конфігурацію
    let config = await ZabbixConfig.getOrCreateDefault();

    // Якщо конфігурація має _id, отримуємо її з явним вибором зашифрованого токену для перевірки
    if (config._id) {
      config =
        (await ZabbixConfig.findById(config._id).select(
          '+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV'
        )) || config;
    }

    // Перевіряємо наявність токену/паролю
    const hasToken = !!(config.apiTokenEncrypted && config.apiTokenIV);
    const hasPassword = !!(config.passwordEncrypted && config.passwordIV);

    // Створюємо безпечну конфігурацію без токену
    const configObj = config.toObject ? config.toObject() : config;
    const safeConfig = {
      _id: configObj._id || null,
      url: configObj.url || '',
      username: configObj.username || '',
      enabled: configObj.enabled !== undefined ? configObj.enabled : false,
      pollInterval: configObj.pollInterval || 5,
      lastPollAt: configObj.lastPollAt || null,
      lastError: configObj.lastError || null,
      lastErrorAt: configObj.lastErrorAt || null,
      stats: configObj.stats || {
        totalPolls: 0,
        successfulPolls: 0,
        failedPolls: 0,
        alertsProcessed: 0,
      },
      createdAt: configObj.createdAt || new Date(),
      updatedAt: configObj.updatedAt || new Date(),
      hasToken: hasToken,
      hasPassword: hasPassword,
    };

    res.json({
      success: true,
      data: safeConfig,
    });
  } catch (error) {
    logger.error('Error getting Zabbix config:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting Zabbix configuration',
      error: error.message,
    });
  }
};

/**
 * Оновити налаштування Zabbix
 */
exports.updateConfig = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array(),
      });
    }

    const { url, apiToken, enabled, pollInterval, username, password } = req.body;

    logger.info(`Updating Zabbix config - Request body - hasUrl: ${url !== undefined}`);
    logger.info(`Updating Zabbix config - Request body - url: ${url || '(empty or undefined)'}`);
    logger.info(`Updating Zabbix config - Request body - urlType: ${typeof url}`);
    logger.info(`Updating Zabbix config - Request body - urlLength: ${url?.length || 0}`);
    logger.info(
      `Updating Zabbix config - Request body - hasToken: ${apiToken !== undefined && apiToken !== ''}`
    );
    logger.info(`Updating Zabbix config - Request body - tokenLength: ${apiToken?.length || 0}`);
    logger.info(
      `Updating Zabbix config - Request body - username: ${username !== undefined ? username : '(not provided)'}`
    );
    logger.info(
      `Updating Zabbix config - Request body - passwordProvided: ${password !== undefined}`
    );
    logger.info(`Updating Zabbix config - Request body - enabled: ${enabled}`);
    logger.info(`Updating Zabbix config - Request body - pollInterval: ${pollInterval}`);
    logger.info(`Updating Zabbix config - Request body - fullBody: ${JSON.stringify(req.body)}`);

    let config = await ZabbixConfig.findOne();

    if (!config) {
      config = new ZabbixConfig();
    }

    if (url !== undefined) {
      const trimmedUrl = url ? url.trim() : '';
      config.url = trimmedUrl;
      logger.info('URL set in config', {
        originalUrl: url,
        trimmedUrl: trimmedUrl,
        urlLength: trimmedUrl.length,
        isEmpty: trimmedUrl === '',
      });
    } else {
      logger.warn('URL is undefined in request body');
    }

    if (apiToken !== undefined && apiToken !== '') {
      logger.info('Encrypting and saving Zabbix API token...');
      config.encryptToken(apiToken);
      logger.info('Zabbix API token encrypted successfully', {
        hasEncrypted: !!config.apiTokenEncrypted,
        hasIV: !!config.apiTokenIV,
      });
    } else if (apiToken === '') {
      // Якщо передано порожній рядок, видаляємо токен
      logger.info('Removing Zabbix API token...');
      config.apiTokenEncrypted = null;
      config.apiTokenIV = null;
    }

    if (username !== undefined) {
      config.username = username ? username.trim() : '';
    }

    if (password !== undefined) {
      if (password === '') {
        logger.info('Removing stored Zabbix password...');
        config.passwordEncrypted = null;
        config.passwordIV = null;
      } else {
        logger.info('Encrypting and saving Zabbix password...');
        config.encryptPassword(password);
      }
    }

    if (enabled !== undefined) {
      config.enabled = enabled;
    }

    if (pollInterval !== undefined) {
      config.pollInterval = pollInterval;
    }

    await config.save();

    // Перевіряємо чи все збережено правильно
    const savedConfig = await ZabbixConfig.findById(config._id).select(
      '+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV'
    );
    logger.info('Zabbix config saved', {
      _id: savedConfig?._id?.toString(),
      hasToken: !!(savedConfig?.apiTokenEncrypted && savedConfig?.apiTokenIV),
      hasPassword: !!(savedConfig?.passwordEncrypted && savedConfig?.passwordIV),
      url: savedConfig?.url,
      urlLength: savedConfig?.url?.length || 0,
      enabled: savedConfig?.enabled,
      pollInterval: savedConfig?.pollInterval,
    });

    // Оновлюємо Zabbix service
    try {
      if (config.enabled) {
        // Отримуємо свіжу конфігурацію з токеном для ініціалізації
        const configForInit = await ZabbixConfig.findById(config._id).select(
          '+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV'
        );
        logger.info('Initializing Zabbix service with config', {
          url: configForInit?.url,
          hasToken: !!(configForInit?.apiTokenEncrypted && configForInit?.apiTokenIV),
          hasPassword: !!(configForInit?.passwordEncrypted && configForInit?.passwordIV),
          enabled: configForInit?.enabled,
        });
        await zabbixService.initialize(configForInit || config);
        logger.info('✅ Zabbix service reinitialized after config update');
      }
    } catch (initError) {
      logger.error('Error reinitializing Zabbix service:', initError);
    }

    // Оновлюємо polling job
    try {
      await updatePollingJob();
    } catch (jobError) {
      logger.error('Error updating polling job:', jobError);
    }

    // Не повертаємо зашифрований токен
    const safeConfig = {
      ...config.toObject(),
      apiToken: null,
      apiTokenEncrypted: null,
      apiTokenIV: null,
      password: null,
      passwordEncrypted: null,
      passwordIV: null,
      hasToken: !!config.apiTokenEncrypted,
      hasPassword: !!config.passwordEncrypted,
    };

    res.json({
      success: true,
      message: 'Zabbix configuration updated successfully',
      data: safeConfig,
    });
  } catch (error) {
    logger.error('Error updating Zabbix config:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating Zabbix configuration',
      error: error.message,
    });
  }
};

/**
 * Тест підключення до Zabbix
 */
exports.testConnection = async (req, res) => {
  try {
    // Отримуємо конфігурацію з явним вибором зашифрованих полів
    let config = await ZabbixConfig.getOrCreateDefault();

    // Якщо конфігурація має _id, отримуємо її з явним вибором зашифрованого токену
    if (config._id) {
      config =
        (await ZabbixConfig.findById(config._id).select(
          '+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV'
        )) || config;
    }

    // Перевіряємо наявність URL та токену/логіну
    if (!config.url || !config.url.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Zabbix URL is required',
        error: 'Please configure Zabbix URL in settings',
      });
    }

    // Перевіряємо наявність токену (як зашифрованого, так і через метод decryptToken)
    const hasToken = !!(config.apiTokenEncrypted && config.apiTokenIV);
    const decryptedToken = config.decryptToken ? config.decryptToken() : null;
    const hasPassword = !!(config.passwordEncrypted && config.passwordIV);
    const decryptedPassword = config.decryptPassword ? config.decryptPassword() : null;
    const hasUsername = !!(config.username && config.username.trim());

    if ((!hasToken || !decryptedToken) && !(hasUsername && hasPassword && decryptedPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Zabbix credentials are required',
        error:
          'Please configure Zabbix API token or username/password in settings and save the configuration',
      });
    }

    // Ініціалізуємо сервіс з поточною конфігурацією
    const initialized = await zabbixService.initialize(config);

    if (!initialized) {
      return res.status(500).json({
        success: false,
        message: 'Failed to initialize Zabbix service',
      });
    }

    // Тестуємо підключення
    const testResult = await zabbixService.testConnection();

    if (testResult.success) {
      res.json({
        success: true,
        message: 'Connection to Zabbix successful',
        data: {
          version: testResult.version,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Connection to Zabbix failed',
        error: testResult.error,
        code: testResult.code,
      });
    }
  } catch (error) {
    logger.error('Error testing Zabbix connection:', error);
    res.status(500).json({
      success: false,
      message: 'Error testing Zabbix connection',
      error: error.message,
    });
  }
};

/**
 * Ручний запуск опитування
 */
exports.pollNow = async (req, res) => {
  try {
    // Перевіряємо чи інтеграція увімкнена
    let config = await ZabbixConfig.getActive();
    if (!config || !config.enabled) {
      return res.status(400).json({
        success: false,
        message: 'Zabbix integration is disabled',
        error: 'Please enable Zabbix integration in settings before polling',
      });
    }

    // Отримуємо конфігурацію з токеном
    if (config._id) {
      config =
        (await ZabbixConfig.findById(config._id).select(
          '+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV'
        )) || config;
    }

    // Перевіряємо чи є URL та креденшіали
    if (!config.url || !config.url.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Zabbix configuration is incomplete',
        error: 'Please configure Zabbix URL in settings',
      });
    }

    const hasToken = !!(config.apiTokenEncrypted && config.apiTokenIV);
    const hasCredentials = !!(
      config.username &&
      config.username.trim() &&
      config.passwordEncrypted &&
      config.passwordIV
    );

    if (!hasToken && !hasCredentials) {
      return res.status(400).json({
        success: false,
        message: 'Zabbix configuration is incomplete',
        error: 'Please configure Zabbix API token or username/password in settings',
      });
    }

    const result = await pollNow();

    if (result.success) {
      res.json({
        success: true,
        message: 'Zabbix polling completed',
        data: result,
      });
    } else {
      // Якщо помилка через вимкнену інтеграцію або відсутні креденшіали, повертаємо 400
      if (
        result.error &&
        (result.error.includes('disabled') ||
          result.error.includes('credentials') ||
          result.error.includes('URL') ||
          result.error.includes('not configured'))
      ) {
        return res.status(400).json({
          success: false,
          message: result.error.includes('disabled')
            ? 'Zabbix integration is disabled'
            : 'Zabbix configuration is incomplete',
          error: result.error,
        });
      }

      // Інші помилки - 500
      res.status(500).json({
        success: false,
        message: 'Zabbix polling failed',
        error: result.error || 'Unknown error occurred',
      });
    }
  } catch (error) {
    logger.error('Error in manual Zabbix polling:', error);
    res.status(500).json({
      success: false,
      message: 'Error in manual Zabbix polling',
      error: error.message,
    });
  }
};

/**
 * Отримати список алертів
 */
exports.getAlerts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Фільтри
    const filter = {};
    if (req.query.severity) {
      filter.severity = parseInt(req.query.severity);
    }
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.resolved !== undefined) {
      filter.resolved = req.query.resolved === 'true';
    }
    if (req.query.host) {
      filter.host = { $regex: req.query.host, $options: 'i' };
    }

    const alerts = await ZabbixAlert.find(filter).sort({ eventTime: -1 }).limit(limit).skip(skip);

    const total = await ZabbixAlert.countDocuments(filter);

    res.json({
      success: true,
      data: {
        alerts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error('Error getting Zabbix alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting Zabbix alerts',
      error: error.message,
    });
  }
};

/**
 * Отримати деталі алерту
 */
exports.getAlert = async (req, res) => {
  try {
    const alert = await ZabbixAlert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found',
      });
    }

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    logger.error('Error getting Zabbix alert:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting Zabbix alert',
      error: error.message,
    });
  }
};

/**
 * Отримати список груп
 */
exports.getGroups = async (req, res) => {
  try {
    const groups = await ZabbixAlertGroup.find()
      .populate('adminIds', 'firstName lastName email telegramId telegramUsername role')
      .sort({ priority: -1, createdAt: -1 });

    res.json({
      success: true,
      data: groups,
    });
  } catch (error) {
    logger.error('Error getting Zabbix alert groups:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting Zabbix alert groups',
      error: error.message,
    });
  }
};

/**
 * Створити групу
 */
exports.createGroup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array(),
      });
    }

    const {
      name,
      description,
      adminIds,
      triggerIds,
      hostPatterns,
      severityLevels,
      enabled,
      priority,
      settings,
      telegram,
    } = req.body;

    const group = new ZabbixAlertGroup({
      name,
      description: description || '',
      adminIds: adminIds || [],
      triggerIds: triggerIds || [],
      hostPatterns: hostPatterns || [],
      severityLevels: severityLevels || [],
      enabled: enabled !== undefined ? enabled : true,
      priority: priority || 0,
      settings: settings || {},
      telegram: telegram || {},
    });

    await group.save();
    await group.populate('adminIds', 'firstName lastName email telegramId telegramUsername role');

    res.status(201).json({
      success: true,
      message: 'Zabbix alert group created successfully',
      data: group,
    });
  } catch (error) {
    logger.error('Error creating Zabbix alert group:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating Zabbix alert group',
      error: error.message,
    });
  }
};

/**
 * Оновити групу
 */
exports.updateGroup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array(),
      });
    }

    const group = await ZabbixAlertGroup.findById(req.params.id);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    const {
      name,
      description,
      adminIds,
      triggerIds,
      hostPatterns,
      severityLevels,
      enabled,
      priority,
      settings,
      telegram,
    } = req.body;

    if (name !== undefined) {
      group.name = name;
    }
    if (description !== undefined) {
      group.description = description;
    }
    if (adminIds !== undefined) {
      group.adminIds = adminIds;
    }
    if (triggerIds !== undefined) {
      group.triggerIds = triggerIds;
    }
    if (hostPatterns !== undefined) {
      group.hostPatterns = hostPatterns;
    }
    if (severityLevels !== undefined) {
      group.severityLevels = severityLevels;
    }
    if (enabled !== undefined) {
      group.enabled = enabled;
    }
    if (priority !== undefined) {
      group.priority = priority;
    }
    if (settings !== undefined) {
      group.settings = { ...group.settings, ...settings };
    }
    if (telegram !== undefined) {
      group.telegram = { ...group.telegram, ...telegram };
    }

    await group.save();
    await group.populate('adminIds', 'firstName lastName email telegramId telegramUsername role');

    res.json({
      success: true,
      message: 'Zabbix alert group updated successfully',
      data: group,
    });
  } catch (error) {
    logger.error('Error updating Zabbix alert group:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating Zabbix alert group',
      error: error.message,
    });
  }
};

/**
 * Видалити групу
 */
exports.deleteGroup = async (req, res) => {
  try {
    const group = await ZabbixAlertGroup.findById(req.params.id);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    await group.deleteOne();

    res.json({
      success: true,
      message: 'Zabbix alert group deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting Zabbix alert group:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting Zabbix alert group',
      error: error.message,
    });
  }
};

/**
 * Тестування відправки алерту
 */
exports.testAlert = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array(),
      });
    }

    const { groupId, alertId } = req.body;

    let alert;
    let groups;

    // Якщо вказано alertId, використовуємо існуючий алерт
    if (alertId) {
      alert = await ZabbixAlert.findById(alertId);
      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found',
        });
      }
    } else {
      // Створюємо тестовий алерт
      const testTimestamp = Date.now();
      alert = new ZabbixAlert({
        alertId: `test_${testTimestamp}`,
        triggerId: `test_trigger_${testTimestamp}`,
        hostId: `test_host_${testTimestamp}`,
        host: 'Test Host',
        triggerName: 'Test Trigger',
        severity: 4, // Disaster
        severityLabel: 'Disaster',
        status: 'PROBLEM',
        message: 'This is a test alert to verify Telegram notification system',
        eventTime: new Date(),
        zabbixData: {
          test: true,
        },
      });
    }

    // Отримуємо групи для алерту
    if (groupId) {
      const group = await ZabbixAlertGroup.findById(groupId);
      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found',
        });
      }
      groups = [group];
    } else {
      // Отримуємо всі активні групи, які відповідають алерту
      groups = await zabbixAlertService.getAlertGroupsForAlert(alert);

      if (groups.length === 0) {
        // Якщо немає груп, отримуємо всі активні групи для тестування
        groups = await ZabbixAlertGroup.find({ enabled: true });

        if (groups.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'No active alert groups found. Please create at least one alert group.',
          });
        }
      }
    }

    logger.info(`Testing alert notification`, {
      alertId: alert.alertId || alert._id,
      groupsCount: groups.length,
      groupIds: groups.map(g => g._id),
    });

    // Відправляємо сповіщення
    const result = await zabbixAlertService.sendNotifications(alert, groups);

    res.json({
      success: true,
      message: 'Test alert notification sent',
      data: {
        alert: {
          id: alert._id || alert.alertId,
          host: alert.host,
          severity: alert.severity,
          triggerName: alert.triggerName,
        },
        groups: groups.map(g => ({
          id: g._id,
          name: g.name,
          hasTelegramGroup: !!(g.telegram && g.telegram.groupId),
          hasBotToken: !!(g.telegram && g.telegram.botToken),
        })),
        result,
      },
    });
  } catch (error) {
    logger.error('Error testing alert notification:', error);
    res.status(500).json({
      success: false,
      message: 'Error testing alert notification',
      error: error.message,
    });
  }
};

/**
 * Діагностика алерту - перевірка, чому сповіщення не надійшло
 */
exports.checkAlert = async (req, res) => {
  try {
    const { host, triggerName, eventTime, alertId } = req.body;

    if (!host && !alertId) {
      return res.status(400).json({
        success: false,
        message: 'Host name or alertId is required',
        error: 'Please provide either host+triggerName+eventTime or alertId',
      });
    }

    let alert;

    // Знаходимо алерт за ID або за параметрами
    if (alertId) {
      alert = await ZabbixAlert.findOne({
        $or: [{ _id: alertId }, { alertId: alertId }],
      });
    } else {
      // Шукаємо за параметрами
      const query = { host: host };

      if (triggerName) {
        query.triggerName = triggerName;
      }

      if (eventTime) {
        // Шукаємо алерт з eventTime в межах ±5 хвилин від вказаного часу
        const searchTime = new Date(eventTime);
        const timeRange = 5 * 60 * 1000; // 5 хвилин в мілісекундах
        query.eventTime = {
          $gte: new Date(searchTime.getTime() - timeRange),
          $lte: new Date(searchTime.getTime() + timeRange),
        };
      }

      // Спочатку шукаємо найближчий за часом
      alert = await ZabbixAlert.findOne(query).sort({ eventTime: -1 });

      // Якщо не знайшли точно, шукаємо всі алерти для цього хоста
      if (!alert && host) {
        const allAlerts = await ZabbixAlert.find({ host: host })
          .sort({ eventTime: -1 })
          .limit(10)
          .select('alertId host triggerName eventTime status severity notificationSent');

        return res.json({
          success: true,
          message: 'Alert not found with exact parameters, but found recent alerts for this host',
          data: {
            alert: null,
            foundAlerts: allAlerts,
            diagnostics: {
              searched: { host, triggerName, eventTime },
              foundCount: allAlerts.length,
            },
          },
        });
      }
    }

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found in database',
        error:
          'The alert might not have been fetched from Zabbix yet, or the search parameters are incorrect',
        searched: { host, triggerName, eventTime, alertId },
      });
    }

    // Перевіряємо чи є групи для цього алерту
    const groups = await zabbixAlertService.getAlertGroupsForAlert(alert);

    // Отримуємо детальну інформацію про групи
    const groupDetails = [];
    for (const group of groups) {
      const admins = await group.getAdminsWithTelegram();
      groupDetails.push({
        id: group._id,
        name: group.name,
        enabled: group.enabled,
        hasTelegramGroup: !!(group.telegram && group.telegram.groupId),
        hasBotToken: !!(group.telegram && group.telegram.botToken),
        adminCount: group.adminIds?.length || 0,
        adminsWithTelegramCount: admins.length,
        adminsWithTelegram: admins.map(a => ({
          email: a.email,
          telegramId: a.telegramId,
          telegramUsername: a.telegramUsername,
        })),
        canSendNotification: group.canSendNotification(),
        lastNotificationAt: group.stats?.lastNotificationAt,
        minNotificationInterval: group.settings?.minNotificationInterval,
      });
    }

    // Перевіряємо чи працює Telegram сервіс
    const telegramStatus = {
      isInitialized: telegramService.isInitialized || false,
      hasBot: !!telegramService.bot,
      botTokenSet: !!process.env.TELEGRAM_BOT_TOKEN,
    };

    // Визначаємо причину, чому сповіщення могло не надійти
    const diagnostics = {
      alertFound: true,
      alertId: alert.alertId,
      alertStatus: alert.status,
      alertResolved: alert.resolved,
      notificationSent: alert.notificationSent,
      eventTime: alert.eventTime,
      severity: alert.severity,
      groupsFound: groups.length,
      groupsDetails: groupDetails,
      telegramStatus: telegramStatus,
      issues: [],
    };

    // Перевіряємо проблеми
    if (alert.notificationSent) {
      diagnostics.issues.push({
        type: 'info',
        message:
          'Notification was marked as sent. Check Telegram logs if message was not received.',
      });
    } else {
      diagnostics.issues.push({
        type: 'warning',
        message: 'Notification was not sent. Possible reasons:',
      });
    }

    if (groups.length === 0) {
      diagnostics.issues.push({
        type: 'error',
        message:
          'No matching alert groups found for this alert. Check group filters (severity, host patterns, trigger IDs).',
        solution: "Create or update an alert group that matches this alert's criteria",
      });
    }

    for (const group of groupDetails) {
      if (!group.enabled) {
        diagnostics.issues.push({
          type: 'warning',
          message: `Group "${group.name}" is disabled`,
        });
      }

      if (!group.hasTelegramGroup && group.adminsWithTelegramCount === 0) {
        diagnostics.issues.push({
          type: 'error',
          message: `Group "${group.name}" has no Telegram group ID and no admins with Telegram IDs`,
          solution:
            'Either add a Telegram group ID to the group, or ensure admins have Telegram IDs in their profiles',
        });
      }

      if (!group.hasTelegramGroup && !telegramStatus.isInitialized) {
        diagnostics.issues.push({
          type: 'error',
          message: `Group "${group.name}" sends to individual admins, but Telegram service is not initialized`,
          solution: 'Initialize Telegram service or configure a Telegram group ID for the group',
        });
      }

      if (!group.canSendNotification) {
        diagnostics.issues.push({
          type: 'warning',
          message: `Group "${group.name}" cannot send notification due to min notification interval`,
          details: {
            lastNotificationAt: group.lastNotificationAt,
            minInterval: group.minNotificationInterval,
          },
        });
      }
    }

    res.json({
      success: true,
      message: 'Alert diagnostics completed',
      data: {
        alert: {
          id: alert._id,
          alertId: alert.alertId,
          host: alert.host,
          triggerName: alert.triggerName,
          severity: alert.severity,
          status: alert.status,
          resolved: alert.resolved,
          notificationSent: alert.notificationSent,
          eventTime: alert.eventTime,
          createdAt: alert.createdAt,
        },
        diagnostics,
      },
    });
  } catch (error) {
    logger.error('Error checking alert:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking alert',
      error: error.message,
    });
  }
};

/**
 * Отримати статус інтеграції Zabbix та Telegram
 */
exports.getStatus = async (req, res) => {
  try {
    const config = await ZabbixConfig.getActive();
    const groups = await ZabbixAlertGroup.find({ enabled: true });

    // Отримуємо статистику адміністраторів з Telegram
    let totalAdminsWithTelegram = 0;
    const groupStats = [];

    for (const group of groups) {
      const admins = await group.getAdminsWithTelegram();
      totalAdminsWithTelegram += admins.length;

      groupStats.push({
        id: group._id,
        name: group.name,
        adminCount: group.adminIds?.length || 0,
        adminsWithTelegramCount: admins.length,
        hasTelegramGroup: !!(group.telegram && group.telegram.groupId),
        hasBotToken: !!(group.telegram && group.telegram.botToken),
      });
    }

    // Отримуємо останні алерти для статистики
    const recentAlerts = await ZabbixAlert.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('alertId host severity status notificationSent createdAt');

    const status = {
      zabbix: {
        enabled: config ? config.enabled : false,
        hasConfig: !!config,
        hasToken: !!(config?.apiTokenEncrypted && config?.apiTokenIV),
        isInitialized: zabbixService.isInitialized,
        lastPollAt: config?.lastPollAt || null,
        lastError: config?.lastError || null,
        lastErrorAt: config?.lastErrorAt || null,
        stats: config?.stats || {
          totalPolls: 0,
          successfulPolls: 0,
          failedPolls: 0,
          alertsProcessed: 0,
        },
      },
      telegram: {
        isInitialized: telegramService.isInitialized || false,
        hasBot: !!telegramService.bot,
        botTokenSet: !!process.env.TELEGRAM_BOT_TOKEN,
      },
      alertGroups: {
        total: groups.length,
        active: groups.filter(g => g.enabled).length,
        totalAdminsWithTelegram,
        groups: groupStats,
      },
      recentAlerts: {
        total: await ZabbixAlert.countDocuments(),
        recent: recentAlerts,
        withNotifications: await ZabbixAlert.countDocuments({ notificationSent: true }),
        withoutNotifications: await ZabbixAlert.countDocuments({ notificationSent: false }),
      },
    };

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Error getting Zabbix status:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting status',
      error: error.message,
    });
  }
};

/**
 * Отримати всі хости (пристрої) з мережі з IP-адресами
 */
exports.getHosts = async (req, res) => {
  try {
    const config = await ZabbixConfig.getActive();
    if (!config || !config.enabled) {
      return res.status(400).json({
        success: false,
        message: 'Zabbix integration is not enabled',
      });
    }

    const { groupIds, search, monitored } = req.query;

    const options = {};
    if (groupIds) {
      options.groupIds = Array.isArray(groupIds) ? groupIds : groupIds.split(',');
    }
    if (search) {
      options.search = search;
    }
    if (monitored !== undefined) {
      options.monitored = monitored !== 'false';
    }

    const result = await zabbixService.getAllHosts(options);

    res.json({
      success: true,
      total: result.total,
      data: result.hosts,
    });
  } catch (error) {
    logger.error('Error getting Zabbix hosts:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting hosts from Zabbix',
      error: error.message,
    });
  }
};

/**
 * Отримати групи хостів з Zabbix
 */
exports.getHostGroups = async (req, res) => {
  try {
    const config = await ZabbixConfig.getActive();
    if (!config || !config.enabled) {
      return res.status(400).json({
        success: false,
        message: 'Zabbix integration is not enabled',
      });
    }

    const result = await zabbixService.getHostGroups();

    res.json({
      success: true,
      total: result.total,
      data: result.groups,
    });
  } catch (error) {
    logger.error('Error getting Zabbix host groups:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting host groups from Zabbix',
      error: error.message,
    });
  }
};
