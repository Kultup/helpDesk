const axios = require('axios');
const logger = require('../utils/logger');

class ZabbixService {
  constructor() {
    this.url = null;
    this.originalToken = null;
    this.apiToken = null;
    this.isBearerAuth = false;
    this.username = null;
    this.password = null;
    this.sessionToken = null;
    this.isInitialized = false;
  }

  /**
   * Нормалізація URL (видалення зайвих слешів)
   * @param {String} url - URL для нормалізації
   * @returns {String} - Нормалізований URL
   */
  normalizeUrl(url) {
    if (!url) return null;
    // Видаляємо пробіли та зайві слеші в кінці
    return url.trim().replace(/\/+$/, '');
  }

  /**
   * Визначаємо, чи схожий токен на API-token (Bearer)
   * @param {String} token
   * @returns {Boolean}
   */
  isLikelyBearerToken(token) {
    return !!token && token.length >= 40 && !token.includes(' ');
  }

  /**
   * Виконуємо user.login для отримання сесійного токену
   * @param {Boolean} force - Чи потрібно форсувати новий логін
   * @returns {Promise<{success: boolean, token?: string, error?: string, code?: number}>}
   */
  async login(force = false) {
    if (!this.username || !this.password) {
      return {
        success: false,
        error: 'Username or password is not configured'
      };
    }

    if (!force && this.sessionToken) {
      return {
        success: true,
        token: this.sessionToken
      };
    }

    const apiUrl = `${this.url}/api_jsonrpc.php`;
    const requestData = {
      jsonrpc: '2.0',
      method: 'user.login',
      params: {
        user: this.username,
        password: this.password
      },
      id: Math.floor(Math.random() * 1000000)
    };

    try {
      const response = await axios.post(apiUrl, requestData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (response.data.error) {
        const error = new Error(response.data.error.message || 'Zabbix API user.login error');
        error.code = response.data.error.code;
        error.data = response.data.error.data;
        logger.error('Zabbix user.login returned error:', {
          code: error.code,
          message: error.message,
          data: error.data,
          fullResponse: JSON.stringify(response.data),
          requestUrl: apiUrl,
          requestData: JSON.stringify(requestData)
        });
        throw error;
      }

      const token = response.data.result;
      this.sessionToken = token;
      this.apiToken = token;

      return {
        success: true,
        token
      };
    } catch (error) {
      logger.error('Zabbix service: user.login failed', {
        error: error.message,
        code: error.code,
        responseStatus: error.response?.status,
        responseData: error.response?.data
      });
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * Отримуємо поточний токен для запиту
   * @param {Boolean} forceRelogin - Чи потрібно форсувати повторний логін
   * @returns {Promise<{token: string, isBearer: boolean}>}
   */
  async getCurrentAuthToken(forceRelogin = false) {
    let token = this.apiToken ? String(this.apiToken).trim() : '';

    if (!token || forceRelogin) {
      if (forceRelogin) {
        this.apiToken = null;
        this.sessionToken = null;
      }

      if (this.isBearerAuth && !forceRelogin && token) {
        // Маємо bearer токен, повертаємо його без змін
        return {
          token,
          isBearer: true
        };
      }

      if (this.username && this.password) {
        const loginResult = await this.login(true);
        if (!loginResult.success || !loginResult.token) {
          throw new Error(loginResult.error || 'Failed to obtain Zabbix auth token via user.login');
        }
        token = loginResult.token;
        this.isBearerAuth = false;
      }
    }

    token = token || (this.apiToken ? String(this.apiToken).trim() : '');

    if (!token) {
      throw new Error('Zabbix authentication token is not available');
    }

    return {
      token,
      isBearer: this.isBearerAuth && !!token
    };
  }

  /**
   * Ініціалізація сервісу з конфігурацією
   * @param {Object} config - Конфігурація Zabbix (ZabbixConfig model instance)
   * @returns {Boolean} - Чи успішно ініціалізовано
   */
  async initialize(config) {
    try {
      if (!config) {
        logger.warn('Zabbix service: No configuration provided');
        this.isInitialized = false;
        return false;
      }

      if (!config.enabled) {
        logger.warn('Zabbix service: Integration is disabled');
        this.isInitialized = false;
        return false;
      }

      // Нормалізуємо URL
      const rawUrl = config.url;
      this.url = this.normalizeUrl(rawUrl);
      this.originalToken = config.decryptToken ? config.decryptToken() : null;
      this.username = config.username ? config.username.trim() : null;
      this.password = config.decryptPassword ? config.decryptPassword() : null;
      this.apiToken = null;
      this.isBearerAuth = false;
      this.sessionToken = null;

      if (!this.url) {
        logger.warn('Zabbix service: Missing URL', { url: rawUrl });
        this.isInitialized = false;
        return false;
      }

      const trimmedToken = this.originalToken ? this.originalToken.trim() : '';
      
      // Спочатку намагаємося використати токен, якщо він є
      if (trimmedToken) {
        this.isBearerAuth = this.isLikelyBearerToken(trimmedToken);
        this.apiToken = trimmedToken;
      } else if (this.username && this.password) {
        const loginResult = await this.login();
        if (!loginResult.success) {
          logger.error('Zabbix service: Failed to obtain session token via user.login', {
            error: loginResult.error
          });
          this.isInitialized = false;
          return false;
        }
        this.apiToken = loginResult.token;
        this.isBearerAuth = false;
        this.sessionToken = loginResult.token;
      } else {
        logger.warn('Zabbix service: Missing authentication credentials (token or username/password)');
        this.isInitialized = false;
        return false;
      }

      // Перевіряємо формат URL
      try {
        new URL(this.url);
      } catch (urlError) {
        logger.error('Zabbix service: Invalid URL format', {
          url: this.url,
          error: urlError.message
        });
        this.isInitialized = false;
        return false;
      }

      // Встановлюємо isInitialized перед тестом, щоб testConnection міг працювати
      // Це безпечно, оскільки ми вже перевірили наявність URL та токену
      this.isInitialized = true;

      // Перевіряємо підключення
      const testResult = await this.testConnection();
      if (!testResult.success) {
        // Якщо Bearer токен не працює, але є username/password, спробуємо user.login
        if (this.isBearerAuth && this.username && this.password) {
          logger.warn('Zabbix service: Bearer token authentication failed, attempting user.login as fallback...');
          const loginResult = await this.login();
          if (loginResult.success && loginResult.token) {
            this.apiToken = loginResult.token;
            this.isBearerAuth = false;
            this.sessionToken = loginResult.token;
            // Повторно тестуємо підключення з сесійним токеном
            const retryTestResult = await this.testConnection();
            if (retryTestResult.success) {
              return true;
            }
          }
        }
        
        logger.error('Zabbix service: Connection test failed', {
          error: testResult.error,
          code: testResult.code,
          url: this.url
        });
        this.isInitialized = false;
        return false;
      }
      return true;
    } catch (error) {
      logger.error('❌ Error initializing Zabbix service:', {
        error: error.message,
        stack: error.stack,
        url: this.url
      });
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Виконання JSON-RPC запиту до Zabbix API
   * @param {String} method - Назва методу API
   * @param {Object} params - Параметри запиту
   * @param {Number} retries - Кількість повторних спроб
   * @returns {Object} - Результат запиту
   */
  async apiRequest(method, params = {}, retries = 3) {
    if (!this.isInitialized) {
      throw new Error('Zabbix service is not initialized');
    }

    const apiUrl = `${this.url}/api_jsonrpc.php`;

    let lastError = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const authContext = await this.getCurrentAuthToken();
        const headers = {
          'Content-Type': 'application/json'
        };
        const requestData = {
          jsonrpc: '2.0',
          method: method,
          params: params,
          id: Math.floor(Math.random() * 1000000)
        };

        // Для Bearer токенів використовуємо поле auth (не заголовок Authorization)
        // Zabbix API не підтримує Bearer токени в заголовку для JSON-RPC
        if (authContext.isBearer) {
          // Bearer токен передаємо в полі auth як session токен
          requestData.auth = authContext.token;
        } else {
        // Session токен завжди в полі auth
        requestData.auth = authContext.token;
        }

        const response = await axios.post(apiUrl, requestData, {
          headers,
          timeout: 30000 // 30 секунд
        });
        
        // Перевіряємо помилки в відповіді
        if (response.data?.error) {
          const error = new Error(response.data.error.message || 'Zabbix API error');
          error.code = response.data.error.code;
          error.data = response.data.error.data;
          logger.error('Zabbix API returned error:', {
            method: method,
            code: error.code,
            message: error.message,
            data: error.data
          });
          throw error;
        }

        return {
          success: true,
          data: response.data.result
        };
      } catch (error) {
        lastError = error;
        
        // Детальне логування помилки
        const errorDetails = {
          method: method,
          attempt: attempt,
          url: apiUrl,
          error: error.message,
          code: error.code,
          responseStatus: error.response?.status,
          responseData: error.response?.data
        };

        // Якщо помилка автентифікації або невалідний токен, не повторюємо
        if (error.response?.data?.error?.code === -32602 || 
            error.response?.data?.error?.code === -32500 ||
            error.response?.status === 401) {
          logger.error('Zabbix API authentication error:', errorDetails);
          throw error;
        }

        // Якщо помилка підключення (ECONNREFUSED, ETIMEDOUT, etc.)
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
          logger.error('Zabbix API connection error:', errorDetails);
          if (attempt < retries) {
            const delay = attempt * 1000;
            logger.warn(`Zabbix API connection failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } else {
          logger.error('Zabbix API request error:', errorDetails);

          const apiErrorCode = error.response?.data?.error?.code;
          const shouldAttemptRelogin = this.username && this.password &&
            (apiErrorCode === -32602 || apiErrorCode === -32500 || error.response?.status === 401);

          if (shouldAttemptRelogin) {
            logger.warn('Zabbix API authentication error detected, attempting to refresh session via user.login...');
            try {
              await this.getCurrentAuthToken(true);
              logger.info('Zabbix authentication refreshed successfully, retrying request...');
              if (attempt < retries) {
                const delay = attempt * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
              }
              attempt--;
              continue;
            } catch (loginError) {
              logger.error('Failed to refresh Zabbix authentication via user.login', {
                error: loginError.message
              });
              lastError = loginError;
            }
          }

          if (attempt < retries) {
            const delay = attempt * 1000;
            logger.warn(`Zabbix API request failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
    }

    logger.error('Zabbix API request failed after all retries:', {
      method: method,
      url: apiUrl,
      error: lastError?.message,
      code: lastError?.code
    });
    throw lastError;
  }

  /**
   * Тест підключення до Zabbix API
   * @returns {Object} - Результат тесту
   */
  async testConnection() {
    try {
      // Перевіряємо чи сервіс ініціалізований перед тестом
      if (!this.isInitialized) {
        return {
          success: false,
          error: 'Zabbix service is not initialized'
        };
      }

      // apiinfo.version не потребує автентифікації - викликаємо без токену
      const apiUrl = `${this.url}/api_jsonrpc.php`;
      const requestData = {
        jsonrpc: '2.0',
        method: 'apiinfo.version',
        params: {},
        id: Math.floor(Math.random() * 1000000)
      };

      const response = await axios.post(apiUrl, requestData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (response.data.error) {
        throw new Error(response.data.error.message || 'Zabbix API error');
      }

      const version = response.data.result;
      return {
        success: true,
        version
      };
    } catch (error) {
      logger.error('Zabbix connection test failed:', {
        error: error.message,
        code: error.code,
        url: this.url,
        responseStatus: error.response?.status,
        responseData: error.response?.data
      });
      return {
        success: false,
        error: error.message || 'Connection failed',
        code: error.code,
        responseStatus: error.response?.status,
        responseData: error.response?.data
      };
    }
  }

  /**
   * Отримання проблем (problems) з Zabbix
   * @param {Array} severities - Масив severity levels для фільтрації (0-4)
   * @param {Number} limit - Ліміт результатів
   * @returns {Object} - Результат з масивом проблем
   */
  async getProblems(severities = [3, 4], limit = 1000) {
    try {
      const params = {
        output: 'extend',
        selectAcknowledges: 'extend',
        selectTags: 'extend',
        selectSuppressionData: 'extend',
        sortfield: ['eventid'],
        sortorder: 'DESC',
        limit: limit
      };

      // Фільтр за severity
      if (severities && severities.length > 0) {
        params.severities = severities;
      }

      // Фільтр тільки активних проблем (не вирішених)
      params.filter = {
        value: 1 // 1 = PROBLEM, 0 = OK
      };

      const result = await this.apiRequest('problem.get', params);
      
      return {
        success: true,
        problems: result.data || []
      };
    } catch (error) {
      logger.error('Error getting problems from Zabbix:', {
        error: error.message,
        code: error.code,
        responseStatus: error.response?.status,
        responseData: error.response?.data
      });
      return {
        success: false,
        error: error.message || 'Failed to get problems',
        code: error.code,
        responseStatus: error.response?.status,
        responseData: error.response?.data
      };
    }
  }

  /**
   * Отримання інформації про тригери
   * @param {Array} triggerIds - Масив ID тригерів
   * @returns {Object} - Результат з масивом тригерів
   */
  async getTriggers(triggerIds = []) {
    try {
      const params = {
        output: 'extend',
        selectFunctions: 'extend',
        selectHosts: ['hostid', 'host', 'name'],
        selectItems: ['itemid', 'name', 'key_', 'value_type'],
        selectTags: 'extend',
        selectGroups: 'extend',
        selectDiscoveryRule: 'extend',
        selectLastEvent: 'extend'
      };

      if (triggerIds.length > 0) {
        params.triggerids = triggerIds;
      }

      const result = await this.apiRequest('trigger.get', params);
      
      return {
        success: true,
        triggers: result.data || []
      };
    } catch (error) {
      logger.error('Error getting triggers from Zabbix:', error);
      throw error;
    }
  }

  /**
   * Отримання інформації про хости
   * @param {Array} hostIds - Масив ID хостів
   * @returns {Object} - Результат з масивом хостів
   */
  async getHosts(hostIds = []) {
    try {
      const params = {
        output: 'extend',
        selectGroups: 'extend',
        selectInterfaces: 'extend',
        selectTags: 'extend',
        selectInventories: 'extend',
        selectMacros: 'extend'
      };

      if (hostIds.length > 0) {
        params.hostids = hostIds;
      }

      const result = await this.apiRequest('host.get', params);
      
      return {
        success: true,
        hosts: result.data || []
      };
    } catch (error) {
      logger.error('Error getting hosts from Zabbix:', error);
      throw error;
    }
  }

  /**
   * Отримання подій (events) з Zabbix
   * @param {Array} eventIds - Масив ID подій
   * @param {Object} options - Додаткові опції (time_from, time_till, object, etc.)
   * @returns {Object} - Результат з масивом подій
   */
  async getEvents(eventIds = [], options = {}) {
    try {
      const params = {
        output: 'extend',
        selectAcknowledges: 'extend',
        selectTags: 'extend',
        selectSuppressionData: 'extend',
        sortfield: ['clock'],
        sortorder: 'DESC',
        limit: options.limit || 1000
      };

      if (eventIds.length > 0) {
        params.eventids = eventIds;
      }

      if (options.time_from) {
        params.time_from = options.time_from;
      }

      if (options.time_till) {
        params.time_till = options.time_till;
      }

      if (options.object) {
        params.object = options.object; // 0 = trigger event
      }

      if (options.value) {
        params.value = options.value; // 1 = PROBLEM, 0 = OK
      }

      const result = await this.apiRequest('event.get', params);
      
      return {
        success: true,
        events: result.data || []
      };
    } catch (error) {
      logger.error('Error getting events from Zabbix:', error);
      throw error;
    }
  }

  /**
   * Підтвердження проблеми (acknowledge)
   * @param {String} eventId - ID події
   * @param {String} message - Повідомлення підтвердження
   * @param {Number} action - Дія (1 = close problem, 2 = acknowledge, 4 = add message, 8 = change severity, 16 = unacknowledge)
   * @returns {Object} - Результат операції
   */
  async acknowledgeProblem(eventId, message = '', action = 2) {
    try {
      const params = {
        eventids: [eventId],
        action: action,
        message: message
      };

      const result = await this.apiRequest('event.acknowledge', params);
      
      return {
        success: true,
        acknowledged: result.data.eventids || []
      };
    } catch (error) {
      logger.error('Error acknowledging problem in Zabbix:', error);
      throw error;
    }
  }

  /**
   * Отримання версії Zabbix API
   * @returns {Object} - Версія API
   */
  async getVersion() {
    try {
      const result = await this.apiRequest('apiinfo.version', {}, 1);
      return {
        success: true,
        version: result.data
      };
    } catch (error) {
      logger.error('Error getting Zabbix version:', error);
      throw error;
    }
  }

  /**
   * Отримання комбінованих даних про проблеми з інформацією про тригери та хости
   * @param {Array} severities - Масив severity levels
   * @param {Number} limit - Ліміт результатів
   * @returns {Object} - Комбіновані дані
   */
  async getProblemsWithDetails(severities = [3, 4], limit = 1000) {
    try {
      // Отримуємо проблеми
      const problemsResult = await this.getProblems(severities, limit);
      
      if (!problemsResult.success) {
        logger.error('Failed to get problems from Zabbix:', {
          error: problemsResult.error,
          code: problemsResult.code
        });
        return {
          success: false,
          error: problemsResult.error || 'Failed to get problems',
          code: problemsResult.code
        };
      }
      
      const problems = problemsResult.problems || [];

      if (problems.length === 0) {
        return {
          success: true,
          problems: [],
          triggers: [],
          hosts: []
        };
      }

      // Отримуємо унікальні ID тригерів та хостів
      const triggerIds = [...new Set(problems.map(p => p.objectid))];
      const hostIds = [];

      // Отримуємо тригери
      const triggersResult = await this.getTriggers(triggerIds);
      const triggers = triggersResult.triggers || [];

      // Отримуємо host IDs з тригерів
      triggers.forEach(trigger => {
        if (trigger.hosts && trigger.hosts.length > 0) {
          trigger.hosts.forEach(host => {
            if (!hostIds.includes(host.hostid)) {
              hostIds.push(host.hostid);
            }
          });
        }
      });

      // Отримуємо хости
      let hosts = [];
      if (hostIds.length > 0) {
        const hostsResult = await this.getHosts(hostIds);
        hosts = hostsResult.hosts || [];
      }

      // Об'єднуємо дані
      const problemsWithDetails = problems.map(problem => {
        const trigger = triggers.find(t => t.triggerid === problem.objectid) || null;
        let host = null;

        // Спробуємо знайти хост через тригер
        if (trigger && trigger.hosts && trigger.hosts.length > 0) {
          const hostId = trigger.hosts[0].hostid;
          host = hosts.find(h => h.hostid === hostId) || null;
        }

        // Якщо хост не знайдено через тригер, спробуємо через problem.hosts (якщо є)
        if (!host && problem.hosts && problem.hosts.length > 0) {
          const hostId = problem.hosts[0].hostid || problem.hosts[0];
          host = hosts.find(h => h.hostid === hostId) || null;
        }

        return {
          ...problem,
          trigger: trigger,
          host: host
        };
      });

      return {
        success: true,
        problems: problemsWithDetails,
        triggers: triggers,
        hosts: hosts
      };
    } catch (error) {
      logger.error('Error getting problems with details from Zabbix:', error);
      throw error;
    }
  }
}

// Експортуємо singleton instance
module.exports = new ZabbixService();

