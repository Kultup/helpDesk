const ZabbixConfig = require('../models/ZabbixConfig');
const ZabbixAlert = require('../models/ZabbixAlert');
const ZabbixAlertGroup = require('../models/ZabbixAlertGroup');
const zabbixService = require('../services/zabbixService');
const zabbixAlertService = require('../services/zabbixAlertService');
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
      config = await ZabbixConfig.findById(config._id).select('+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV') || config;
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
        alertsProcessed: 0
      },
      createdAt: configObj.createdAt || new Date(),
      updatedAt: configObj.updatedAt || new Date(),
      hasToken: hasToken,
      hasPassword: hasPassword
    };

    res.json({
      success: true,
      data: safeConfig
    });
  } catch (error) {
    logger.error('Error getting Zabbix config:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting Zabbix configuration',
      error: error.message
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
        errors: errors.array()
      });
    }

    const { url, apiToken, enabled, pollInterval, username, password } = req.body;

    logger.info(`Updating Zabbix config - Request body - hasUrl: ${url !== undefined}`);
    logger.info(`Updating Zabbix config - Request body - url: ${url || '(empty or undefined)'}`);
    logger.info(`Updating Zabbix config - Request body - urlType: ${typeof url}`);
    logger.info(`Updating Zabbix config - Request body - urlLength: ${url?.length || 0}`);
    logger.info(`Updating Zabbix config - Request body - hasToken: ${apiToken !== undefined && apiToken !== ''}`);
    logger.info(`Updating Zabbix config - Request body - tokenLength: ${apiToken?.length || 0}`);
    logger.info(`Updating Zabbix config - Request body - username: ${username !== undefined ? username : '(not provided)'}`);
    logger.info(`Updating Zabbix config - Request body - passwordProvided: ${password !== undefined}`);
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
        isEmpty: trimmedUrl === ''
      });
    } else {
      logger.warn('URL is undefined in request body');
    }

    if (apiToken !== undefined && apiToken !== '') {
      logger.info('Encrypting and saving Zabbix API token...');
      config.encryptToken(apiToken);
      logger.info('Zabbix API token encrypted successfully', {
        hasEncrypted: !!config.apiTokenEncrypted,
        hasIV: !!config.apiTokenIV
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
    const savedConfig = await ZabbixConfig.findById(config._id).select('+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV');
    logger.info('Zabbix config saved', {
      _id: savedConfig?._id?.toString(),
      hasToken: !!(savedConfig?.apiTokenEncrypted && savedConfig?.apiTokenIV),
      hasPassword: !!(savedConfig?.passwordEncrypted && savedConfig?.passwordIV),
      url: savedConfig?.url,
      urlLength: savedConfig?.url?.length || 0,
      enabled: savedConfig?.enabled,
      pollInterval: savedConfig?.pollInterval
    });

    // Оновлюємо Zabbix service
    try {
      if (config.enabled) {
        // Отримуємо свіжу конфігурацію з токеном для ініціалізації
        const configForInit = await ZabbixConfig.findById(config._id).select('+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV');
        logger.info('Initializing Zabbix service with config', {
          url: configForInit?.url,
          hasToken: !!(configForInit?.apiTokenEncrypted && configForInit?.apiTokenIV),
          hasPassword: !!(configForInit?.passwordEncrypted && configForInit?.passwordIV),
          enabled: configForInit?.enabled
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
      hasPassword: !!config.passwordEncrypted
    };

    res.json({
      success: true,
      message: 'Zabbix configuration updated successfully',
      data: safeConfig
    });
  } catch (error) {
    logger.error('Error updating Zabbix config:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating Zabbix configuration',
      error: error.message
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
      config = await ZabbixConfig.findById(config._id).select('+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV') || config;
    }

    // Перевіряємо наявність URL та токену/логіну
    if (!config.url || !config.url.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Zabbix URL is required',
        error: 'Please configure Zabbix URL in settings'
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
        error: 'Please configure Zabbix API token or username/password in settings and save the configuration'
      });
    }

    // Ініціалізуємо сервіс з поточною конфігурацією
    const initialized = await zabbixService.initialize(config);

    if (!initialized) {
      return res.status(500).json({
        success: false,
        message: 'Failed to initialize Zabbix service'
      });
    }

    // Тестуємо підключення
    const testResult = await zabbixService.testConnection();

    if (testResult.success) {
      res.json({
        success: true,
        message: 'Connection to Zabbix successful',
        data: {
          version: testResult.version
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Connection to Zabbix failed',
        error: testResult.error,
        code: testResult.code
      });
    }
  } catch (error) {
    logger.error('Error testing Zabbix connection:', error);
    res.status(500).json({
      success: false,
      message: 'Error testing Zabbix connection',
      error: error.message
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
        error: 'Please enable Zabbix integration in settings before polling'
      });
    }

    // Отримуємо конфігурацію з токеном
    if (config._id) {
      config = await ZabbixConfig.findById(config._id).select('+apiTokenEncrypted +apiTokenIV +passwordEncrypted +passwordIV') || config;
    }

    // Перевіряємо чи є URL та креденшіали
    if (!config.url || !config.url.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Zabbix configuration is incomplete',
        error: 'Please configure Zabbix URL in settings'
      });
    }

    const hasToken = !!(config.apiTokenEncrypted && config.apiTokenIV);
    const hasCredentials = !!(config.username && config.username.trim() && config.passwordEncrypted && config.passwordIV);

    if (!hasToken && !hasCredentials) {
      return res.status(400).json({
        success: false,
        message: 'Zabbix configuration is incomplete',
        error: 'Please configure Zabbix API token or username/password in settings'
      });
    }

    const result = await pollNow();

    if (result.success) {
      res.json({
        success: true,
        message: 'Zabbix polling completed',
        data: result
      });
    } else {
      // Якщо помилка через вимкнену інтеграцію, повертаємо 400
      if (result.error && result.error.includes('disabled')) {
        return res.status(400).json({
          success: false,
          message: 'Zabbix integration is disabled',
          error: result.error
        });
      }
      
      // Інші помилки - 500
      res.status(500).json({
        success: false,
        message: 'Zabbix polling failed',
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Error in manual Zabbix polling:', error);
    res.status(500).json({
      success: false,
      message: 'Error in manual Zabbix polling',
      error: error.message
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

    const alerts = await ZabbixAlert.find(filter)
      .sort({ eventTime: -1 })
      .limit(limit)
      .skip(skip);

    const total = await ZabbixAlert.countDocuments(filter);

    res.json({
      success: true,
      data: {
        alerts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error getting Zabbix alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting Zabbix alerts',
      error: error.message
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
        message: 'Alert not found'
      });
    }

    res.json({
      success: true,
      data: alert
    });
  } catch (error) {
    logger.error('Error getting Zabbix alert:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting Zabbix alert',
      error: error.message
    });
  }
};

/**
 * Отримати список груп
 */
exports.getGroups = async (req, res) => {
  try {
    const groups = await ZabbixAlertGroup.find()
      .populate('adminIds', 'firstName lastName email telegramId role')
      .sort({ priority: -1, createdAt: -1 });

    res.json({
      success: true,
      data: groups
    });
  } catch (error) {
    logger.error('Error getting Zabbix alert groups:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting Zabbix alert groups',
      error: error.message
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
        errors: errors.array()
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
      settings
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
      settings: settings || {}
    });

    await group.save();
    await group.populate('adminIds', 'firstName lastName email telegramId role');

    res.status(201).json({
      success: true,
      message: 'Zabbix alert group created successfully',
      data: group
    });
  } catch (error) {
    logger.error('Error creating Zabbix alert group:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating Zabbix alert group',
      error: error.message
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
        errors: errors.array()
      });
    }

    const group = await ZabbixAlertGroup.findById(req.params.id);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
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
      settings
    } = req.body;

    if (name !== undefined) group.name = name;
    if (description !== undefined) group.description = description;
    if (adminIds !== undefined) group.adminIds = adminIds;
    if (triggerIds !== undefined) group.triggerIds = triggerIds;
    if (hostPatterns !== undefined) group.hostPatterns = hostPatterns;
    if (severityLevels !== undefined) group.severityLevels = severityLevels;
    if (enabled !== undefined) group.enabled = enabled;
    if (priority !== undefined) group.priority = priority;
    if (settings !== undefined) group.settings = { ...group.settings, ...settings };

    await group.save();
    await group.populate('adminIds', 'firstName lastName email telegramId role');

    res.json({
      success: true,
      message: 'Zabbix alert group updated successfully',
      data: group
    });
  } catch (error) {
    logger.error('Error updating Zabbix alert group:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating Zabbix alert group',
      error: error.message
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
        message: 'Group not found'
      });
    }

    await group.deleteOne();

    res.json({
      success: true,
      message: 'Zabbix alert group deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting Zabbix alert group:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting Zabbix alert group',
      error: error.message
    });
  }
};

