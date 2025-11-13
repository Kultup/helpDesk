const mongoose = require('mongoose');
const crypto = require('crypto');

const zabbixConfigSchema = new mongoose.Schema({
  // URL Zabbix сервера
  url: {
    type: String,
    required: false, // Зробили необов'язковим для початкової конфігурації
    trim: true,
    default: '',
    validate: {
      validator: function(v) {
        // Валідація тільки якщо значення встановлено
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'URL must be a valid HTTP/HTTPS URL'
    }
  },
  // API токен (зашифрований)
  apiTokenEncrypted: {
    type: String,
    required: false, // Зробили необов'язковим для початкової конфігурації
    select: false, // Не включати в запити за замовчуванням
    default: null
  },
  // IV для шифрування (Initialization Vector)
  apiTokenIV: {
    type: String,
    required: false, // Зробили необов'язковим
    select: false,
    default: null
  },
  // Ім'я користувача для user.login
  username: {
    type: String,
    trim: true,
    default: ''
  },
  // Пароль (зашифрований)
  passwordEncrypted: {
    type: String,
    required: false,
    select: false,
    default: null
  },
  // IV для паролю
  passwordIV: {
    type: String,
    required: false,
    select: false,
    default: null
  },
  // Увімкнено/вимкнено інтеграцію
  enabled: {
    type: Boolean,
    default: false
  },
  // Інтервал опитування в хвилинах
  pollInterval: {
    type: Number,
    default: 5,
    min: [1, 'Poll interval must be at least 1 minute'],
    max: [60, 'Poll interval cannot exceed 60 minutes']
  },
  // Останнє опитування
  lastPollAt: {
    type: Date,
    default: null
  },
  // Остання помилка
  lastError: {
    type: String,
    default: null
  },
  // Час останньої помилки
  lastErrorAt: {
    type: Date,
    default: null
  },
  // Статистика
  stats: {
    totalPolls: {
      type: Number,
      default: 0
    },
    successfulPolls: {
      type: Number,
      default: 0
    },
    failedPolls: {
      type: Number,
      default: 0
    },
    alertsProcessed: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Індекси
zabbixConfigSchema.index({ enabled: 1 });

// Метод для отримання ключа шифрування
function getEncryptionKey() {
  // Використовуємо JWT_SECRET або створюємо ключ з нього
  const secret = process.env.JWT_SECRET || 'default-secret-key-change-in-production';
  return crypto.createHash('sha256').update(secret).digest();
}

// Метод для шифрування API токену
zabbixConfigSchema.methods.encryptToken = function(token) {
  const algorithm = 'aes-256-cbc';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  this.apiTokenEncrypted = encrypted;
  this.apiTokenIV = iv.toString('hex');
  
  return this;
};

// Метод для розшифрування API токену
zabbixConfigSchema.methods.decryptToken = function() {
  if (!this.apiTokenEncrypted || !this.apiTokenIV) {
    return null;
  }
  
  try {
    const algorithm = 'aes-256-cbc';
    const key = getEncryptionKey();
    const iv = Buffer.from(this.apiTokenIV, 'hex');
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(this.apiTokenEncrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    return null;
  }
};

// Метод для шифрування паролю
zabbixConfigSchema.methods.encryptPassword = function(password) {
  const algorithm = 'aes-256-cbc';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  this.passwordEncrypted = encrypted;
  this.passwordIV = iv.toString('hex');

  return this;
};

// Метод для розшифрування паролю
zabbixConfigSchema.methods.decryptPassword = function() {
  if (!this.passwordEncrypted || !this.passwordIV) {
    return null;
  }

  try {
    const algorithm = 'aes-256-cbc';
    const key = getEncryptionKey();
    const iv = Buffer.from(this.passwordIV, 'hex');

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(this.passwordEncrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    return null;
  }
};

// Віртуальне поле для API токену (тільки для читання через метод)
zabbixConfigSchema.virtual('apiToken').get(function() {
  return this.decryptToken();
}).set(function(token) {
  if (token) {
    this.encryptToken(token);
  }
});

// Віртуальне поле для паролю
zabbixConfigSchema.virtual('password').get(function() {
  return this.decryptPassword();
}).set(function(password) {
  if (password) {
    this.encryptPassword(password);
  }
});

// Middleware для автоматичного шифрування перед збереженням
zabbixConfigSchema.pre('save', function(next) {
  // Якщо apiToken встановлено безпосередньо (через virtual setter), воно вже зашифроване
  // Якщо ні, але є apiTokenEncrypted, все добре
  next();
});

// Статичний метод для отримання активної конфігурації
zabbixConfigSchema.statics.getActive = async function() {
  const config = await this.findOne({ enabled: true });
  return config;
};

// Статичний метод для отримання або створення конфігурації за замовчуванням
zabbixConfigSchema.statics.getOrCreateDefault = async function() {
  try {
    let config = await this.findOne();
    
    if (!config) {
      // Створюємо конфігурацію з environment variables або порожні значення
      const zabbixUrl = process.env.ZABBIX_URL || '';
      const zabbixToken = process.env.ZABBIX_API_TOKEN || '';
      const zabbixUsername = process.env.ZABBIX_USERNAME || '';
      const zabbixPassword = process.env.ZABBIX_PASSWORD || '';
      
      // Створюємо базову конфігурацію
      config = new this({
        url: zabbixUrl,
        enabled: process.env.ZABBIX_ENABLED === 'true' || false,
        pollInterval: parseInt(process.env.ZABBIX_POLL_INTERVAL || '5', 10),
        username: zabbixUsername
      });
      
      // Шифруємо токен тільки якщо він встановлений
      if (zabbixToken) {
        config.encryptToken(zabbixToken);
      }

       // Шифруємо пароль тільки якщо він встановлений
       if (zabbixPassword) {
        config.encryptPassword(zabbixPassword);
      }
      
      // Зберігаємо конфігурацію (навіть з порожніми полями)
      await config.save();
    }
    
    return config;
  } catch (error) {
    // Якщо виникла помилка, логуємо та повертаємо порожню конфігурацію
    console.error('Error in getOrCreateDefault:', error);
    // Спробуємо все одно отримати існуючу конфігурацію
    const existingConfig = await this.findOne();
    if (existingConfig) {
      return existingConfig;
    }
    // Якщо конфігурації немає, створюємо нову без збереження (буде збережена при наступному оновленні)
    return new this({
      url: '',
      enabled: false,
      pollInterval: 5
    });
  }
};

// Метод для оновлення статистики
zabbixConfigSchema.methods.updateStats = function(stats) {
  if (stats.totalPolls !== undefined) this.stats.totalPolls = stats.totalPolls;
  if (stats.successfulPolls !== undefined) this.stats.successfulPolls = stats.successfulPolls;
  if (stats.failedPolls !== undefined) this.stats.failedPolls = stats.failedPolls;
  if (stats.alertsProcessed !== undefined) this.stats.alertsProcessed = stats.alertsProcessed;
  return this.save();
};

// Метод для запису помилки
zabbixConfigSchema.methods.recordError = function(error) {
  this.lastError = error.message || String(error);
  this.lastErrorAt = new Date();
  if (this.stats) {
    this.stats.failedPolls = (this.stats.failedPolls || 0) + 1;
  }
  return this.save();
};

// Метод для запису успішного опитування
zabbixConfigSchema.methods.recordSuccess = function(alertsProcessed = 0) {
  this.lastPollAt = new Date();
  this.lastError = null;
  this.lastErrorAt = null;
  if (this.stats) {
    this.stats.totalPolls = (this.stats.totalPolls || 0) + 1;
    this.stats.successfulPolls = (this.stats.successfulPolls || 0) + 1;
    this.stats.alertsProcessed = (this.stats.alertsProcessed || 0) + alertsProcessed;
  }
  return this.save();
};

module.exports = mongoose.model('ZabbixConfig', zabbixConfigSchema);

