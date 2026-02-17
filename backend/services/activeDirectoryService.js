const ldap = require('ldapjs');
const logger = require('../utils/logger');
const ActiveDirectoryConfig = require('../models/ActiveDirectoryConfig');

class ActiveDirectoryService {
  constructor() {
    // Ініціалізуємо з .env, потім завантажимо з БД при першому використанні
    this.enabled = process.env.AD_ENABLED === 'true';
    this.config = {
      ldapOpts: {
        url: process.env.AD_LDAP_URL || 'ldap://192.168.100.2:389',
        timeout: parseInt(process.env.AD_TIMEOUT) || 5000,
        connectTimeout: parseInt(process.env.AD_CONNECT_TIMEOUT) || 10000,
        reconnect: true,
      },
      adminDn: process.env.AD_ADMIN_DN || 'dpytlyk-da@dreamland.loc',
      adminPassword: process.env.AD_ADMIN_PASSWORD || 'Qa123456',
      userSearchBase: process.env.AD_USER_SEARCH_BASE || 'dc=dreamland,dc=loc',
      computerSearchBase: process.env.AD_COMPUTER_SEARCH_BASE || 'dc=dreamland,dc=loc',
      usernameAttribute: process.env.AD_USERNAME_ATTRIBUTE || 'sAMAccountName',
      username: 'dpytlyk-da',
      userDn: process.env.AD_ADMIN_DN || 'dpytlyk-da@dreamland.loc',
    };
    this.connectionState = {
      isAvailable: this.enabled,
      lastFailure: null,
      retryAfter: parseInt(process.env.AD_RETRY_INTERVAL) || 2 * 60 * 1000,
      consecutiveFailures: 0,
      maxRetries: parseInt(process.env.AD_MAX_RETRIES) || 3,
    };
    this.cache = {
      users: { data: [], lastUpdate: null, ttl: 5 * 60 * 1000 },
      computers: { data: [], lastUpdate: null, ttl: 5 * 60 * 1000 },
    };
    this._configLoaded = false;
    // Завантажуємо конфігурацію з БД асинхронно
    this.loadConfig().catch(err => {
      logger.error('Помилка завантаження конфігурації AD з БД:', err);
    });
  }

  async loadConfig() {
    if (this._configLoaded) {
      return; // Вже завантажено
    }
    try {
      // Спочатку пробуємо завантажити з БД
      const config = await ActiveDirectoryConfig.findOne({ key: 'default' });

      if (config) {
        this.enabled = config.enabled;
        this.config = {
          ldapOpts: {
            url: config.ldapUrl,
            timeout: config.timeout,
            connectTimeout: config.connectTimeout,
            reconnect: true,
          },
          adminDn: config.adminDn,
          adminPassword: config.adminPassword,
          userSearchBase: config.userSearchBase,
          computerSearchBase: config.computerSearchBase,
          usernameAttribute: config.usernameAttribute,
          username: config.adminDn.split('@')[0] || 'admin',
          userDn: config.adminDn,
        };
        this.connectionState = {
          isAvailable: config.enabled,
          lastFailure: null,
          retryAfter: config.retryInterval,
          consecutiveFailures: 0,
          maxRetries: config.maxRetries,
        };
      } else {
        // Якщо немає в БД, використовуємо .env
        this.enabled = process.env.AD_ENABLED === 'true';
        this.config = {
          ldapOpts: {
            url: process.env.AD_LDAP_URL || 'ldap://192.168.100.2:389',
            timeout: parseInt(process.env.AD_TIMEOUT) || 5000,
            connectTimeout: parseInt(process.env.AD_CONNECT_TIMEOUT) || 10000,
            reconnect: true,
          },
          adminDn: process.env.AD_ADMIN_DN || 'dpytlyk-da@dreamland.loc',
          adminPassword: process.env.AD_ADMIN_PASSWORD || 'Qa123456',
          userSearchBase: process.env.AD_USER_SEARCH_BASE || 'dc=dreamland,dc=loc',
          computerSearchBase: process.env.AD_COMPUTER_SEARCH_BASE || 'dc=dreamland,dc=loc',
          usernameAttribute: process.env.AD_USERNAME_ATTRIBUTE || 'sAMAccountName',
          username: 'dpytlyk-da',
          userDn: process.env.AD_ADMIN_DN || 'dpytlyk-da@dreamland.loc',
        };
        this.connectionState = {
          isAvailable: this.enabled,
          lastFailure: null,
          retryAfter: parseInt(process.env.AD_RETRY_INTERVAL) || 2 * 60 * 1000,
          consecutiveFailures: 0,
          maxRetries: parseInt(process.env.AD_MAX_RETRIES) || 3,
        };
      }
    } catch (error) {
      logger.error('Помилка завантаження конфігурації Active Directory:', error);
      // Fallback на .env
      this.enabled = process.env.AD_ENABLED === 'true';
      this.config = {
        ldapOpts: {
          url: process.env.AD_LDAP_URL || 'ldap://192.168.100.2:389',
          timeout: parseInt(process.env.AD_TIMEOUT) || 5000,
          connectTimeout: parseInt(process.env.AD_CONNECT_TIMEOUT) || 10000,
          reconnect: true,
        },
        adminDn: process.env.AD_ADMIN_DN || 'dpytlyk-da@dreamland.loc',
        adminPassword: process.env.AD_ADMIN_PASSWORD || 'Qa123456',
        userSearchBase: process.env.AD_USER_SEARCH_BASE || 'dc=dreamland,dc=loc',
        computerSearchBase: process.env.AD_COMPUTER_SEARCH_BASE || 'dc=dreamland,dc=loc',
        usernameAttribute: process.env.AD_USERNAME_ATTRIBUTE || 'sAMAccountName',
        username: 'dpytlyk-da',
        userDn: process.env.AD_ADMIN_DN || 'dpytlyk-da@dreamland.loc',
      };
      this.connectionState = {
        isAvailable: this.enabled,
        lastFailure: null,
        retryAfter: parseInt(process.env.AD_RETRY_INTERVAL) || 2 * 60 * 1000,
        consecutiveFailures: 0,
        maxRetries: parseInt(process.env.AD_MAX_RETRIES) || 3,
      };
    }

    this._configLoaded = true;
  }

  async reloadConfig() {
    this._configLoaded = false;
    await this.loadConfig();
    logger.info('✅ Конфігурація Active Directory перезавантажена');
  }

  // Перевірка чи доступний AD
  isADAvailable() {
    // Якщо AD вимкнений, повертаємо false
    if (!this.enabled) {
      return false;
    }

    if (!this.connectionState.isAvailable) {
      const timeSinceFailure = Date.now() - this.connectionState.lastFailure;
      if (timeSinceFailure > this.connectionState.retryAfter) {
        // Час для повторної спроби
        this.connectionState.isAvailable = true;
        this.connectionState.consecutiveFailures = 0;
      }
    }
    return this.connectionState.isAvailable;
  }

  // Позначити AD як недоступний
  markADUnavailable(error) {
    this.connectionState.isAvailable = false;
    this.connectionState.lastFailure = Date.now();
    this.connectionState.consecutiveFailures++;

    // Експоненційне збільшення часу очікування
    const baseRetryTime = this.connectionState.retryAfter;
    this.connectionState.retryAfter = Math.min(
      baseRetryTime * Math.pow(2, this.connectionState.consecutiveFailures - 1),
      30 * 60 * 1000 // максимум 30 хвилин
    );

    // Логуємо тільки перші кілька помилок або кожну 10-ту, щоб зменшити спам
    if (
      this.connectionState.consecutiveFailures <= 3 ||
      this.connectionState.consecutiveFailures % 10 === 0
    ) {
      logger.warn(
        `AD недоступний (спроба ${this.connectionState.consecutiveFailures}). Наступна спроба через ${this.connectionState.retryAfter / 1000} секунд:`,
        error.message
      );
    }
  }

  // Перевірка кешу
  isCacheValid(cacheKey) {
    const cache = this.cache[cacheKey];
    if (!cache.lastUpdate) {
      return false;
    }
    return Date.now() - cache.lastUpdate < cache.ttl;
  }

  // Оновлення кешу
  updateCache(cacheKey, data) {
    this.cache[cacheKey] = {
      data: data,
      lastUpdate: Date.now(),
      ttl: this.cache[cacheKey].ttl,
    };
  }

  // Створення LDAP клієнта
  createClient() {
    return new Promise((resolve, reject) => {
      const client = ldap.createClient({
        url: this.config.ldapOpts.url,
        timeout: this.config.ldapOpts.timeout,
        connectTimeout: this.config.ldapOpts.connectTimeout,
        reconnect: this.config.ldapOpts.reconnect,
      });

      client.on('error', err => {
        logger.error('LDAP Client Error:', err);
        reject(err);
      });

      client.on('connect', () => {
        logger.info('LDAP Client connected');
        resolve(client);
      });
    });
  }

  // Аутентифікація в AD
  async authenticate() {
    try {
      const client = await this.createClient();

      return new Promise((resolve, reject) => {
        client.bind(this.config.adminDn, this.config.adminPassword, err => {
          if (err) {
            logger.error('AD Authentication failed:', err);
            client.unbind();
            reject(err);
          } else {
            logger.info('AD Authentication successful');
            resolve(client);
          }
        });
      });
    } catch (error) {
      logger.error('Error creating LDAP client:', error);
      throw error;
    }
  }

  // Отримання всіх користувачів з AD
  async getUsers() {
    // Перевіряємо кеш спочатку
    if (this.isCacheValid('users')) {
      logger.info('Returning cached AD users');
      return this.cache.users.data;
    }

    // Перевіряємо чи доступний AD
    if (!this.isADAvailable()) {
      logger.info('AD unavailable, returning cached data or empty array');
      return this.cache.users.data || [];
    }

    let client;
    try {
      client = await this.authenticate();

      const searchOptions = {
        filter: '(&(objectClass=user)(objectCategory=person))',
        scope: 'sub',
        sizeLimit: 1000, // Обмежуємо кількість результатів
        paged: true, // Використовуємо пагінацію
        attributes: [
          'sAMAccountName',
          'displayName',
          'mail',
          'department',
          'title',
          'telephoneNumber',
          'whenCreated',
          'lastLogon',
          'userAccountControl',
          'distinguishedName',
        ],
      };

      return new Promise((resolve, reject) => {
        const users = [];

        // Додаємо обробник помилок з'єднання
        client.on('error', err => {
          logger.error('LDAP connection error during search:', err);
          reject(err);
        });

        client.on('close', () => {
          logger.info('LDAP connection closed during search');
        });

        client.search(this.config.userSearchBase, searchOptions, (err, res) => {
          if (err) {
            logger.error('User search error:', err);
            reject(err);
            return;
          }

          res.on('searchEntry', entry => {
            try {
              // Функція для отримання значення атрибуту
              const getAttrValue = attrName => {
                const attr = entry.attributes.find(a => a.type === attrName);
                if (!attr) {
                  return null;
                }
                // Використовуємо .values замість застарілого .vals
                const values = attr.values || attr.vals || [];
                return values.length > 0 ? values[0] : null;
              };

              const user = {
                username: getAttrValue('sAMAccountName'),
                displayName: getAttrValue('displayName'),
                email: getAttrValue('mail'),
                department: getAttrValue('department'),
                title: getAttrValue('title'),
                phone: getAttrValue('telephoneNumber'),
                created: getAttrValue('whenCreated'),
                lastLogon: getAttrValue('lastLogon'),
                enabled: !(parseInt(getAttrValue('userAccountControl') || '0') & 2), // Перевірка чи активний акаунт
                dn: getAttrValue('distinguishedName') || entry.objectName,
              };

              // Додаємо тільки якщо є username
              if (user.username) {
                users.push(user);
              }
            } catch (entryError) {
              logger.error('Error processing user entry:', entryError);
            }
          });

          res.on('error', err => {
            logger.error('Search error:', err);
            reject(err);
          });

          res.on('end', _result => {
            logger.info(`Found ${users.length} users`);
            // Кешуємо результат
            this.updateCache('users', users);
            // Позначаємо AD як доступний
            this.connectionState.isAvailable = true;
            this.connectionState.consecutiveFailures = 0;

            // Закриваємо з'єднання тільки після завершення пошуку
            if (client) {
              client.unbind(() => {
                logger.info('LDAP client unbound after search');
              });
            }
            resolve(users);
          });
        });
      });
    } catch (error) {
      logger.error('Error getting users:', error);
      // Позначаємо AD як недоступний
      this.markADUnavailable();

      // Закриваємо з'єднання у випадку помилки
      if (client) {
        try {
          client.unbind();
        } catch (unbindError) {
          logger.error('Error unbinding client:', unbindError);
        }
      }

      // Повертаємо кешовані дані замість помилки
      if (this.cache.users.data && this.cache.users.data.length > 0) {
        logger.info('Returning cached users due to AD error');
        return this.cache.users.data;
      }

      // Якщо немає кешованих даних, повертаємо порожній масив
      logger.info('No cached users available, returning empty array');
      return [];
    }
  }

  // Отримання всіх комп'ютерів з AD
  async getComputers() {
    // Перевіряємо кеш спочатку
    if (this.isCacheValid('computers')) {
      logger.info('Returning cached AD computers');
      return this.cache.computers.data;
    }

    // Перевіряємо чи доступний AD
    if (!this.isADAvailable()) {
      logger.info('AD unavailable, returning cached data or empty array');
      return this.cache.computers.data || [];
    }

    let client;
    try {
      client = await this.authenticate();

      const searchOptions = {
        filter: '(objectClass=computer)',
        scope: 'sub',
        sizeLimit: 1000, // Обмежуємо кількість результатів
        paged: true, // Використовуємо пагінацію
        attributes: [
          'name',
          'dNSHostName',
          'operatingSystem',
          'operatingSystemVersion',
          'whenCreated',
          'lastLogon',
          'userAccountControl',
          'distinguishedName',
          'description',
        ],
      };

      return new Promise((resolve, reject) => {
        const computers = [];

        // Додаємо обробник помилок з'єднання
        client.on('error', err => {
          logger.error('LDAP connection error during computer search:', err);
          reject(err);
        });

        client.on('close', () => {
          logger.info('LDAP connection closed during computer search');
        });

        client.search(this.config.computerSearchBase, searchOptions, (err, res) => {
          if (err) {
            logger.error('Computer search error:', err);
            reject(err);
            return;
          }

          res.on('searchEntry', entry => {
            try {
              // Функція для отримання значення атрибуту
              const getAttrValue = attrName => {
                const attr = entry.attributes.find(a => a.type === attrName);
                if (!attr) {
                  return null;
                }
                // Використовуємо .values замість застарілого .vals
                const values = attr.values || attr.vals || [];
                return values.length > 0 ? values[0] : null;
              };

              const computer = {
                name: getAttrValue('name'),
                dnsName: getAttrValue('dNSHostName'),
                operatingSystem: getAttrValue('operatingSystem'),
                osVersion: getAttrValue('operatingSystemVersion'),
                created: getAttrValue('whenCreated'),
                lastLogon: getAttrValue('lastLogon'),
                enabled: !(parseInt(getAttrValue('userAccountControl') || '0') & 2),
                dn: getAttrValue('distinguishedName') || entry.objectName,
                description: getAttrValue('description'),
              };

              // Додаємо тільки якщо є name
              if (computer.name) {
                computers.push(computer);
              }
            } catch (entryError) {
              logger.error('Error processing computer entry:', entryError);
            }
          });

          res.on('error', err => {
            logger.error('Search error:', err);
            reject(err);
          });

          res.on('end', _result => {
            logger.info(`Found ${computers.length} computers`);
            // Кешуємо результат
            this.updateCache('computers', computers);
            // Позначаємо AD як доступний
            this.connectionState.isAvailable = true;
            this.connectionState.consecutiveFailures = 0;

            // Закриваємо з'єднання тільки після завершення пошуку
            if (client) {
              client.unbind(() => {
                logger.info('LDAP client unbound after computer search');
              });
            }
            resolve(computers);
          });
        });
      });
    } catch (error) {
      logger.error('Error getting computers:', error);
      // Позначаємо AD як недоступний
      this.markADUnavailable();

      // Закриваємо з'єднання у випадку помилки
      if (client) {
        try {
          client.unbind();
        } catch (unbindError) {
          logger.error('Error unbinding client:', unbindError);
        }
      }

      // Повертаємо кешовані дані замість помилки
      if (this.cache.computers.data && this.cache.computers.data.length > 0) {
        logger.info('Returning cached computers due to AD error');
        return this.cache.computers.data;
      }

      // Якщо немає кешованих даних, повертаємо порожній масив
      logger.info('No cached computers available, returning empty array');
      return [];
    }
  }

  // Пошук користувача за ім'ям
  async searchUser(username) {
    let client;
    try {
      client = await this.authenticate();

      const searchOptions = {
        filter: `(&(objectClass=user)(objectCategory=person)(sAMAccountName=${username}))`,
        scope: 'sub',
        sizeLimit: 10, // Для пошуку конкретного користувача достатньо малого ліміту
        attributes: [
          'sAMAccountName',
          'displayName',
          'mail',
          'department',
          'title',
          'telephoneNumber',
          'whenCreated',
          'lastLogon',
          'userAccountControl',
          'distinguishedName',
        ],
      };

      return new Promise((resolve, reject) => {
        // Додаємо обробник помилок з'єднання
        client.on('error', err => {
          logger.error('LDAP connection error during user search:', err);
          reject(err);
        });

        client.on('close', () => {
          logger.info('LDAP connection closed during user search');
        });

        client.search(this.config.userSearchBase, searchOptions, (err, res) => {
          if (err) {
            reject(err);
            return;
          }

          let user = null;
          res.on('searchEntry', entry => {
            try {
              // Функція для отримання значення атрибуту
              const getAttrValue = attrName => {
                const attr = entry.attributes.find(a => a.type === attrName);
                if (!attr) {
                  return null;
                }
                // Використовуємо .values замість застарілого .vals
                const values = attr.values || attr.vals || [];
                return values.length > 0 ? values[0] : null;
              };

              user = {
                username: getAttrValue('sAMAccountName'),
                displayName: getAttrValue('displayName'),
                email: getAttrValue('mail'),
                department: getAttrValue('department'),
                title: getAttrValue('title'),
                phone: getAttrValue('telephoneNumber'),
                created: getAttrValue('whenCreated'),
                lastLogon: getAttrValue('lastLogon'),
                enabled: !(parseInt(getAttrValue('userAccountControl') || '0') & 2),
                dn: getAttrValue('distinguishedName') || entry.objectName,
              };
            } catch (entryError) {
              logger.error('Error processing user search entry:', entryError);
            }
          });

          res.on('error', err => {
            logger.error('Search error:', err);
            reject(err);
          });

          res.on('end', _result => {
            // Закриваємо з'єднання тільки після завершення пошуку
            if (client) {
              client.unbind(() => {
                logger.info('LDAP client unbound after user search');
              });
            }
            resolve(user);
          });
        });
      });
    } catch (error) {
      logger.error('Error searching user:', error);

      // Закриваємо з'єднання у випадку помилки
      if (client) {
        try {
          client.unbind();
        } catch (unbindError) {
          logger.error('Error unbinding client:', unbindError);
        }
      }
      throw error;
    }
  }

  // Тестування підключення до AD
  async testConnection() {
    let client;
    try {
      logger.info('Testing AD connection with config:', {
        url: this.config.ldapOpts.url,
        adminDn: this.config.adminDn,
        userSearchBase: this.config.userSearchBase,
        timeout: this.config.ldapOpts.timeout,
      });

      client = await this.authenticate();
      logger.info('AD authentication successful, testing user search...');

      // Тестуємо простий пошук користувачів без створення нового клієнта
      const searchOptions = {
        filter: '(&(objectClass=user)(objectCategory=person))',
        scope: 'sub',
        attributes: ['sAMAccountName', 'displayName'],
        sizeLimit: 10, // Обмежуємо кількість для тесту
        paged: true, // Додаємо пагінацію
      };

      return new Promise((resolve, reject) => {
        const users = [];

        client.search(this.config.userSearchBase, searchOptions, (err, res) => {
          if (err) {
            logger.error('Search error:', err);
            client.unbind();
            reject(err);
            return;
          }

          res.on('searchEntry', entry => {
            users.push(entry.object);
          });

          res.on('error', err => {
            logger.error('Search result error:', err);
            client.unbind();
            reject(err);
          });

          res.on('end', _result => {
            client.unbind();
            logger.info(`Found ${users.length} users in AD test`);
            resolve({
              success: true,
              message: `Connection to Active Directory successful. Found ${users.length} users.`,
              userCount: users.length,
            });
          });
        });
      });
    } catch (error) {
      logger.error('AD Connection test failed:', error);
      if (client) {
        try {
          client.unbind();
        } catch (unbindError) {
          logger.error('Error unbinding client:', unbindError);
        }
      }
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
        error: error.toString(),
      };
    }
  }
}

module.exports = new ActiveDirectoryService();
