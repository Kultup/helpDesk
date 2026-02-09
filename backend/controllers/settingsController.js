const TelegramConfig = require('../models/TelegramConfig');
const ActiveDirectoryConfig = require('../models/ActiveDirectoryConfig');
const BotSettings = require('../models/BotSettings');
const AISettings = require('../models/AISettings');
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
      // Видаляємо всі зайві пробіли та невидимі символи
      const cleanedToken = botToken.trim();

      // Перевіряємо формат токена (має бути: числа:буквиЦифри)
      const tokenPattern = /^\d+:[A-Za-z0-9_-]+$/;
      if (!tokenPattern.test(cleanedToken)) {
        return res.status(400).json({
          success: false,
          message: 'Невірний формат токена. Токен має бути у форматі: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz'
        });
      }

      config.botToken = cleanedToken;
      logger.info(`🔑 Оновлюю токен бота: ${cleanedToken.substring(0, 10)}...`);
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
    let url = baseUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    // Нормалізуємо URL: прибираємо зайві шляхи, якщо користувач ввів повний webhook
    // Видаляємо trailing slash
    url = url.replace(/\/$/, '');
    // Прибираємо повторювані або зайві шляхи, якщо були введені
    url = url
      .replace(/\/(api\/telegram\/webhook)$/i, '')
      .replace(/\/(telegram\/webhook)$/i, '')
      .replace(/\/(api\/telegram)$/i, '')
      .replace(/\/(telegram)$/i, '')
      .replace(/\/(api)$/i, '');

    // Формуємо webhook URL з нормалізованого базового URL
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

/**
 * Отримати налаштування бота
 */
exports.getBotSettings = async (req, res) => {
  try {
    let settings = await BotSettings.findOne({ key: 'default' });

    if (!settings) {
      settings = new BotSettings({ key: 'default' });
      await settings.save();
    }

    const safeSettings = settings.toObject();

    res.json({
      success: true,
      data: safeSettings
    });
  } catch (error) {
    logger.error('Помилка отримання налаштувань бота:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання налаштувань бота',
      error: error.message
    });
  }
};

/**
 * Оновити налаштування бота
 */
exports.updateBotSettings = async (req, res) => {
  try {
    const {
      cancelButtonText,
      categoryPromptText,
      priorityPromptText,
      categoryButtonRowSize,
      priorityTexts,
      statusTexts,
      statusEmojis
    } = req.body;

    let settings = await BotSettings.findOne({ key: 'default' });

    if (!settings) {
      settings = new BotSettings({ key: 'default' });
    }

    // Оновлюємо налаштування бота
    if (cancelButtonText !== undefined) {
      settings.cancelButtonText = cancelButtonText;
    }

    if (categoryPromptText !== undefined) {
      settings.categoryPromptText = categoryPromptText;
    }

    if (priorityPromptText !== undefined) {
      settings.priorityPromptText = priorityPromptText;
    }

    if (categoryButtonRowSize !== undefined) {
      settings.categoryButtonRowSize = categoryButtonRowSize;
    }

    if (priorityTexts !== undefined) {
      settings.priorityTexts = priorityTexts;
    }

    if (statusTexts !== undefined) {
      settings.statusTexts = statusTexts;
    }

    if (statusEmojis !== undefined) {
      settings.statusEmojis = statusEmojis;
    }

    await settings.save();

    res.json({
      success: true,
      message: 'Налаштування бота успішно оновлено',
      data: settings.toObject()
    });
  } catch (error) {
    logger.error('Помилка оновлення налаштувань бота:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка оновлення налаштувань бота',
      error: error.message
    });
  }
};

/**
 * Отримати налаштування AI
 */
exports.getAiSettings = async (req, res) => {
  try {
    let settings = await AISettings.findOne({ key: 'default' });

    if (!settings) {
      settings = new AISettings({
        key: 'default',
        provider: process.env.AI_PROVIDER || 'openai',
        openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        openaiApiKey: process.env.OPENAI_API_KEY || '',
        geminiApiKey: process.env.GEMINI_API_KEY || '',
        enabled: false
      });
      await settings.save();
    }

    const obj = settings.toObject();
    const safe = {
      ...obj,
      hasOpenaiKey: !!(obj.openaiApiKey && obj.openaiApiKey.trim()),
      hasGeminiKey: !!(obj.geminiApiKey && obj.geminiApiKey.trim()),
      openaiApiKey: undefined,
      geminiApiKey: undefined
    };
    delete safe.openaiApiKey;
    delete safe.geminiApiKey;

    res.json({
      success: true,
      data: safe
    });
  } catch (error) {
    logger.error('Помилка отримання налаштувань AI:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання налаштувань AI',
      error: error.message
    });
  }
};

/**
 * Оновити налаштування AI
 */
exports.updateAiSettings = async (req, res) => {
  try {
    const { provider, openaiApiKey, geminiApiKey, openaiModel, geminiModel, enabled, monthlyTokenLimit, topUpAmount, remainingBalance } = req.body;

    let settings = await AISettings.findOne({ key: 'default' });

    if (!settings) {
      settings = new AISettings({ key: 'default' });
    }

    if (provider !== undefined) {
      if (!['openai', 'gemini'].includes(provider)) {
        return res.status(400).json({
          success: false,
          message: 'Провайдер має бути openai або gemini'
        });
      }
      settings.provider = provider;
    }

    if (typeof openaiApiKey === 'string' && openaiApiKey.trim() !== '' && !openaiApiKey.startsWith('••')) {
      settings.openaiApiKey = openaiApiKey.trim();
    }
    if (typeof geminiApiKey === 'string' && geminiApiKey.trim() !== '' && !geminiApiKey.startsWith('••')) {
      settings.geminiApiKey = geminiApiKey.trim();
    }

    if (openaiModel !== undefined) {
      settings.openaiModel = openaiModel.trim() || 'gpt-4o-mini';
    }
    if (geminiModel !== undefined) {
      settings.geminiModel = geminiModel.trim() || 'gemini-1.5-flash';
    }
    if (enabled !== undefined) {
      settings.enabled = !!enabled;
    }
    if (monthlyTokenLimit !== undefined) {
      const val = parseInt(monthlyTokenLimit, 10);
      settings.monthlyTokenLimit = Number.isNaN(val) || val < 0 ? 0 : val;
    }
    if (topUpAmount !== undefined) {
      const val = parseFloat(topUpAmount);
      settings.topUpAmount = Number.isNaN(val) || val < 0 ? 0 : val;
    }
    if (remainingBalance !== undefined) {
      const val = parseFloat(remainingBalance);
      settings.remainingBalance = Number.isNaN(val) || val < 0 ? 0 : val;
    }

    await settings.save();

    const obj = settings.toObject();
    const safe = {
      ...obj,
      hasOpenaiKey: !!(obj.openaiApiKey && obj.openaiApiKey.trim()),
      hasGeminiKey: !!(obj.geminiApiKey && obj.geminiApiKey.trim()),
      openaiApiKey: undefined,
      geminiApiKey: undefined
    };
    delete safe.openaiApiKey;
    delete safe.geminiApiKey;

    res.json({
      success: true,
      message: 'Налаштування AI успішно збережено',
      data: safe
    });
  } catch (error) {
    logger.error('Помилка оновлення налаштувань AI:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка оновлення налаштувань AI',
      error: error.message
    });
  }
};

/**
 * Отримати залишок кредитів OpenAI (неофіційні ендпоінти credit_grants та pending_usage).
 * Працює не у всіх акаунтів; при помилці повертає success: false.
 */
exports.getOpenAIBalance = async (req, res) => {
  try {
    const settings = await AISettings.findOne({ key: 'default' }).lean();
    const apiKey = settings && settings.openaiApiKey && String(settings.openaiApiKey).trim();
    if (!apiKey) {
      return res.status(400).json({ success: false, message: 'OpenAI API ключ не налаштовано' });
    }
    const headers = { Authorization: `Bearer ${apiKey}` };
    let totalGranted = null;
    let totalUsed = null;
    let totalAvailable = null;
    let pendingUsageCents = null;
    try {
      const grantsRes = await axios.get('https://api.openai.com/dashboard/billing/credit_grants', { headers, timeout: 10000 });
      const data = grantsRes.data;
      if (data && typeof data === 'object') {
        totalGranted = data.total_granted;
        totalUsed = data.total_used;
        totalAvailable = data.total_available;
      }
    } catch (e) {
      const status = e.response?.status;
      const msg = e.response?.data?.error?.message || e.message;
      logger.warn('OpenAI credit_grants (unofficial) failed', { status, message: msg });
      return res.status(502).json({
        success: false,
        message: 'Не вдалося отримати залишок (ендпоінт OpenAI не підтримується або ключ без доступу). Можна вводити залишок вручну.',
        detail: msg
      });
    }
    try {
      const pendingRes = await axios.get('https://api.openai.com/dashboard/billing/pending_usage', { headers, timeout: 8000 });
      if (pendingRes.data != null && typeof pendingRes.data === 'object' && typeof pendingRes.data.pending_usage === 'number') {
        pendingUsageCents = pendingRes.data.pending_usage;
      }
    } catch (_) {
      // pending_usage опційно
    }
    return res.json({
      success: true,
      data: {
        total_granted: totalGranted,
        total_used: totalUsed,
        total_available: totalAvailable,
        pending_usage_cents: pendingUsageCents,
        note: 'Неофіційні ендпоінти OpenAI; можуть змінитися.'
      }
    });
  } catch (error) {
    logger.error('Помилка отримання залишку OpenAI', error);
    return res.status(500).json({
      success: false,
      message: 'Помилка отримання залишку',
      error: error.message
    });
  }
};
