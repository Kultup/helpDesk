const TelegramConfig = require('../models/TelegramConfig');
const ActiveDirectoryConfig = require('../models/ActiveDirectoryConfig');
const logger = require('../utils/logger');
const telegramService = require('../services/telegramServiceInstance');
const activeDirectoryService = require('../services/activeDirectoryService');
const axios = require('axios');

/**
 * Отримати налаштування Telegram
 */
exports.getTelegramSettings = async (req, res) => {
  try {
    let config = await TelegramConfig.findOne({ key: 'default' });
    
    if (!config) {
      // Якщо немає в БД, створюємо з .env
      config = new TelegramConfig({
        key: 'default',
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        chatId: process.env.TELEGRAM_CHAT_ID || '',
        isEnabled: !!process.env.TELEGRAM_BOT_TOKEN
      });
      await config.save();
    }

    // Не повертаємо повний токен з міркувань безпеки
    const safeConfig = {
      ...config.toObject(),
      botToken: config.botToken ? `${config.botToken.substring(0, 10)}...` : '',
      hasToken: !!config.botToken
    };

    res.json({
      success: true,
      data: safeConfig
    });
  } catch (error) {
    logger.error('Помилка отримання налаштувань Telegram:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання налаштувань Telegram',
      error: error.message
    });
  }
};

/**
 * Оновити налаштування Telegram
 */
exports.updateTelegramSettings = async (req, res) => {
  try {
    const { botToken, chatId, webhookUrl, isEnabled } = req.body;

    let config = await TelegramConfig.findOne({ key: 'default' });

    if (!config) {
      config = new TelegramConfig({ key: 'default' });
    }

    // Оновлюємо тільки якщо передано новий токен
    if (botToken && botToken !== `${config.botToken?.substring(0, 10)}...`) {
      config.botToken = botToken;
    }

    if (chatId !== undefined) {
      config.chatId = chatId;
    }

    if (webhookUrl !== undefined) {
      config.webhookUrl = webhookUrl;
    }

    if (isEnabled !== undefined) {
      config.isEnabled = isEnabled;
    }

    await config.save();

    // Оновлюємо Telegram сервіс
    try {
      if (config.botToken && config.isEnabled) {
        // Оновлюємо process.env для сумісності
        process.env.TELEGRAM_BOT_TOKEN = config.botToken;
        if (config.chatId) {
          process.env.TELEGRAM_CHAT_ID = config.chatId;
        }

        // Переініціалізуємо бота
        await telegramService.initialize();
        logger.info('✅ Telegram бот переініціалізовано після оновлення налаштувань');
      } else {
        telegramService.bot = null;
        logger.info('ℹ️ Telegram бот вимкнено');
      }
    } catch (initError) {
      logger.error('Помилка переініціалізації Telegram бота:', initError);
      // Не повертаємо помилку, бо налаштування вже збережено
    }

    // Не повертаємо повний токен
    const safeConfig = {
      ...config.toObject(),
      botToken: config.botToken ? `${config.botToken.substring(0, 10)}...` : '',
      hasToken: !!config.botToken
    };

    res.json({
      success: true,
      message: 'Налаштування Telegram успішно оновлено',
      data: safeConfig
    });
  } catch (error) {
    logger.error('Помилка оновлення налаштувань Telegram:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка оновлення налаштувань Telegram',
      error: error.message
    });
  }
};

/**
 * Налаштувати webhook для Telegram бота
 */
exports.setupWebhook = async (req, res) => {
  try {
    const { baseUrl } = req.body;

    if (!baseUrl) {
      return res.status(400).json({
        success: false,
        message: 'Потрібно вказати baseUrl'
      });
    }

    let config = await TelegramConfig.findOne({ key: 'default' });
    
    if (!config) {
      // Створюємо конфігурацію, якщо її немає
      config = new TelegramConfig({ key: 'default' });
      // Спробуємо завантажити з .env
      if (process.env.TELEGRAM_BOT_TOKEN) {
        config.botToken = process.env.TELEGRAM_BOT_TOKEN;
      }
      await config.save();
    }
    
    if (!config.botToken || config.botToken.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Спочатку встановіть Bot Token'
      });
    }

    const botToken = config.botToken.trim();

    // Переконатися, що URL має https://
    let url = baseUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    // Видаляємо trailing slash
    url = url.replace(/\/$/, '');

    // Формуємо webhook URL
    let webhookUrl;
    if (url.endsWith('/api')) {
      webhookUrl = `${url}/telegram/webhook`;
    } else {
      webhookUrl = `${url}/api/telegram/webhook`;
    }

    try {
      logger.info(`🔧 Налаштовую webhook для бота...`);
      logger.info(`📡 Webhook URL: ${webhookUrl}`);

      // Перевіряємо поточний webhook
      const infoResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      let currentWebhook = null;
      if (infoResponse.data.ok && infoResponse.data.result.url) {
        currentWebhook = infoResponse.data.result.url;
        logger.info(`📋 Поточний webhook: ${currentWebhook}`);
      }

      // Встановлюємо webhook
      const response = await axios.post(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        url: webhookUrl
      });

      if (response.data.ok) {
        // Оновлюємо webhook URL в конфігурації
        config.webhookUrl = webhookUrl;
        await config.save();

        // Перевіряємо інформацію про webhook
        const finalInfo = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        const webhookInfo = finalInfo.data.ok ? finalInfo.data.result : null;

        logger.info('✅ Webhook успішно налаштовано!');

        res.json({
          success: true,
          message: 'Webhook успішно налаштовано',
          data: {
            webhookUrl,
            currentWebhook,
            webhookInfo
          }
        });
      } else {
        logger.error('❌ Помилка налаштування webhook:', response.data);
        res.status(400).json({
          success: false,
          message: response.data.description || 'Помилка налаштування webhook',
          error: response.data
        });
      }
    } catch (error) {
      logger.error('❌ Помилка налаштування webhook:', error);
      logger.error('❌ Stack trace:', error.stack);
      let errorMessage = error.message;
      
      if (error.response) {
        errorMessage = error.response.data?.description || error.message;
        if (error.response.data?.description) {
          if (error.response.data.description.includes('IP address') && error.response.data.description.includes('reserved')) {
            errorMessage = 'Telegram не приймає приватні IP адреси. Використайте публічний домен з HTTPS.';
          }
        }
      }

      res.status(500).json({
        success: false,
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  } catch (error) {
    logger.error('Помилка налаштування webhook:', error);
    logger.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Помилка налаштування webhook',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Внутрішня помилка сервера',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Отримати інформацію про поточний webhook
 */
exports.getWebhookInfo = async (req, res) => {
  try {
    let config = await TelegramConfig.findOne({ key: 'default' });
    
    if (!config) {
      // Створюємо конфігурацію, якщо її немає
      config = new TelegramConfig({ key: 'default' });
      // Спробуємо завантажити з .env
      if (process.env.TELEGRAM_BOT_TOKEN) {
        config.botToken = process.env.TELEGRAM_BOT_TOKEN;
      }
      await config.save();
    }
    
    if (!config.botToken || config.botToken.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Bot Token не встановлено'
      });
    }

    const botToken = config.botToken.trim();

    try {
      const infoResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      
      if (infoResponse.data.ok) {
        res.json({
          success: true,
          data: infoResponse.data.result
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Помилка отримання інформації про webhook',
          error: infoResponse.data
        });
      }
    } catch (error) {
      logger.error('Помилка отримання інформації про webhook:', error);
      logger.error('Stack trace:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Помилка отримання інформації про webhook',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Внутрішня помилка сервера',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  } catch (error) {
    logger.error('Помилка отримання інформації про webhook:', error);
    logger.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання інформації про webhook',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Внутрішня помилка сервера',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Отримати налаштування Active Directory
 */
exports.getActiveDirectorySettings = async (req, res) => {
  try {
    let config = await ActiveDirectoryConfig.findOne({ key: 'default' });
    
    if (!config) {
      // Якщо немає в БД, створюємо з .env
      config = new ActiveDirectoryConfig({
        key: 'default',
        enabled: process.env.AD_ENABLED === 'true',
        ldapUrl: process.env.AD_LDAP_URL || 'ldap://192.168.100.2:389',
        adminDn: process.env.AD_ADMIN_DN || '',
        adminPassword: process.env.AD_ADMIN_PASSWORD || '',
        userSearchBase: process.env.AD_USER_SEARCH_BASE || 'dc=dreamland,dc=loc',
        computerSearchBase: process.env.AD_COMPUTER_SEARCH_BASE || 'dc=dreamland,dc=loc',
        usernameAttribute: process.env.AD_USERNAME_ATTRIBUTE || 'sAMAccountName',
        timeout: parseInt(process.env.AD_TIMEOUT) || 5000,
        connectTimeout: parseInt(process.env.AD_CONNECT_TIMEOUT) || 10000,
        retryInterval: parseInt(process.env.AD_RETRY_INTERVAL) || 120000,
        maxRetries: parseInt(process.env.AD_MAX_RETRIES) || 3
      });
      await config.save();
    }

    // Не повертаємо пароль з міркувань безпеки
    const safeConfig = {
      ...config.toObject(),
      adminPassword: config.adminPassword ? '***' : '',
      hasPassword: !!config.adminPassword
    };

    res.json({
      success: true,
      data: safeConfig
    });
  } catch (error) {
    logger.error('Помилка отримання налаштувань Active Directory:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання налаштувань Active Directory',
      error: error.message
    });
  }
};

/**
 * Оновити налаштування Active Directory
 */
exports.updateActiveDirectorySettings = async (req, res) => {
  try {
    const {
      enabled,
      ldapUrl,
      adminDn,
      adminPassword,
      userSearchBase,
      computerSearchBase,
      usernameAttribute,
      timeout,
      connectTimeout,
      retryInterval,
      maxRetries
    } = req.body;

    let config = await ActiveDirectoryConfig.findOne({ key: 'default' });

    if (!config) {
      config = new ActiveDirectoryConfig({ key: 'default' });
    }

    if (enabled !== undefined) {
      config.enabled = enabled;
    }

    if (ldapUrl !== undefined) {
      config.ldapUrl = ldapUrl;
    }

    if (adminDn !== undefined) {
      config.adminDn = adminDn;
    }

    // Оновлюємо пароль тільки якщо передано новий (не '***')
    if (adminPassword !== undefined && adminPassword !== '***' && adminPassword !== '') {
      config.adminPassword = adminPassword;
    }

    if (userSearchBase !== undefined) {
      config.userSearchBase = userSearchBase;
    }

    if (computerSearchBase !== undefined) {
      config.computerSearchBase = computerSearchBase;
    }

    if (usernameAttribute !== undefined) {
      config.usernameAttribute = usernameAttribute;
    }

    if (timeout !== undefined) {
      config.timeout = timeout;
    }

    if (connectTimeout !== undefined) {
      config.connectTimeout = connectTimeout;
    }

    if (retryInterval !== undefined) {
      config.retryInterval = retryInterval;
    }

    if (maxRetries !== undefined) {
      config.maxRetries = maxRetries;
    }

    await config.save();

    // Оновлюємо process.env для сумісності
    process.env.AD_ENABLED = config.enabled ? 'true' : 'false';
    process.env.AD_LDAP_URL = config.ldapUrl;
    process.env.AD_ADMIN_DN = config.adminDn;
    process.env.AD_ADMIN_PASSWORD = config.adminPassword;
    process.env.AD_USER_SEARCH_BASE = config.userSearchBase;
    process.env.AD_COMPUTER_SEARCH_BASE = config.computerSearchBase;
    process.env.AD_USERNAME_ATTRIBUTE = config.usernameAttribute;
    process.env.AD_TIMEOUT = config.timeout.toString();
    process.env.AD_CONNECT_TIMEOUT = config.connectTimeout.toString();
    process.env.AD_RETRY_INTERVAL = config.retryInterval.toString();
    process.env.AD_MAX_RETRIES = config.maxRetries.toString();

    // Перезавантажуємо AD сервіс
    try {
      // Переініціалізуємо AD сервіс (потрібно оновити сервіс, щоб він читав з БД)
      await activeDirectoryService.reloadConfig();
      logger.info('✅ Active Directory сервіс перезавантажено після оновлення налаштувань');
    } catch (reloadError) {
      logger.error('Помилка перезавантаження Active Directory сервісу:', reloadError);
      // Не повертаємо помилку, бо налаштування вже збережено
    }

    // Не повертаємо пароль
    const safeConfig = {
      ...config.toObject(),
      adminPassword: '***',
      hasPassword: !!config.adminPassword
    };

    res.json({
      success: true,
      message: 'Налаштування Active Directory успішно оновлено',
      data: safeConfig
    });
  } catch (error) {
    logger.error('Помилка оновлення налаштувань Active Directory:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка оновлення налаштувань Active Directory',
      error: error.message
    });
  }
};

