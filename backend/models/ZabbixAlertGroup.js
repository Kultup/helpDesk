const mongoose = require('mongoose');

const zabbixAlertGroupSchema = new mongoose.Schema({
  // Назва групи
  name: {
    type: String,
    required: [true, 'Group name is required'],
    trim: true,
    maxlength: [100, 'Group name cannot exceed 100 characters']
  },
  // Опис групи
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: ''
  },
  // Адміністратори в групі
  adminIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  // ID тригерів для фільтрації (порожній масив = всі тригери)
  triggerIds: [{
    type: String,
    trim: true
  }],
  // Патерни назв хостів для фільтрації (регулярні вирази)
  hostPatterns: [{
    type: String,
    trim: true
  }],
  // Рівні важливості (severity levels) для фільтрації
  severityLevels: [{
    type: Number,
    enum: [0, 1, 2, 3, 4]
  }],
  // Увімкнено/вимкнено групу
  enabled: {
    type: Boolean,
    default: true,
    index: true
  },
  // Пріоритет групи (для визначення порядку перевірки)
  priority: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  // Додаткові налаштування
  settings: {
    // Чи відправляти сповіщення для вирішених проблем
    notifyOnResolve: {
      type: Boolean,
      default: false
    },
    // Чи відправляти сповіщення для підтверджених проблем
    notifyOnAcknowledge: {
      type: Boolean,
      default: false
    },
    // Мінімальний інтервал між сповіщеннями (хвилини)
    minNotificationInterval: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  // Статистика
  stats: {
    alertsMatched: {
      type: Number,
      default: 0
    },
    notificationsSent: {
      type: Number,
      default: 0
    },
    lastNotificationAt: {
      type: Date,
      default: null
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Віртуальні поля
zabbixAlertGroupSchema.virtual('adminCount').get(function() {
  return this.adminIds ? this.adminIds.length : 0;
});

// Індекси
zabbixAlertGroupSchema.index({ enabled: 1, priority: -1 });
zabbixAlertGroupSchema.index({ adminIds: 1 });
zabbixAlertGroupSchema.index({ triggerIds: 1 });
zabbixAlertGroupSchema.index({ severityLevels: 1 });

// Текстовий пошук
zabbixAlertGroupSchema.index({
  name: 'text',
  description: 'text'
});

// Статичні методи
zabbixAlertGroupSchema.statics.findActive = function() {
  return this.find({ enabled: true })
    .populate('adminIds', 'firstName lastName email telegramId role')
    .sort({ priority: -1, createdAt: -1 });
};

zabbixAlertGroupSchema.statics.findByAdmin = function(adminId) {
  return this.find({
    enabled: true,
    adminIds: adminId
  })
    .populate('adminIds', 'firstName lastName email telegramId role')
    .sort({ priority: -1 });
};

// Метод для перевірки чи алерт відповідає групі
zabbixAlertGroupSchema.methods.checkAlertMatch = function(alert) {
  // Перевірка чи група увімкнена
  if (!this.enabled) {
    return false;
  }
  
  // Перевірка severity levels
  if (this.severityLevels && this.severityLevels.length > 0) {
    if (!this.severityLevels.includes(alert.severity)) {
      return false;
    }
  }
  
  // Перевірка trigger IDs
  if (this.triggerIds && this.triggerIds.length > 0) {
    if (!this.triggerIds.includes(alert.triggerId)) {
      return false;
    }
  }
  
  // Перевірка host patterns
  if (this.hostPatterns && this.hostPatterns.length > 0) {
    const hostMatches = this.hostPatterns.some(pattern => {
      try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(alert.host);
      } catch (error) {
        // Якщо pattern не є валідним regex, використовуємо просте порівняння
        return alert.host.toLowerCase().includes(pattern.toLowerCase());
      }
    });
    
    if (!hostMatches) {
      return false;
    }
  }
  
  return true;
};

// Метод для отримання адміністраторів з Telegram ID
zabbixAlertGroupSchema.methods.getAdminsWithTelegram = async function() {
  const User = require('./User');
  const admins = await User.find({
    _id: { $in: this.adminIds },
    telegramId: { $exists: true, $ne: null },
    isActive: true
  }).select('firstName lastName email telegramId role');
  
  return admins;
};

// Метод для перевірки чи можна відправити сповіщення (з урахуванням інтервалу)
zabbixAlertGroupSchema.methods.canSendNotification = function() {
  if (!this.settings.minNotificationInterval || this.settings.minNotificationInterval === 0) {
    return true;
  }
  
  if (!this.stats.lastNotificationAt) {
    return true;
  }
  
  const minIntervalMs = this.settings.minNotificationInterval * 60 * 1000;
  const timeSinceLastNotification = Date.now() - this.stats.lastNotificationAt.getTime();
  
  return timeSinceLastNotification >= minIntervalMs;
};

// Метод для оновлення статистики
zabbixAlertGroupSchema.methods.recordMatch = function() {
  if (!this.stats) {
    this.stats = {};
  }
  this.stats.alertsMatched = (this.stats.alertsMatched || 0) + 1;
  return this.save();
};

zabbixAlertGroupSchema.methods.recordNotification = function() {
  if (!this.stats) {
    this.stats = {};
  }
  this.stats.notificationsSent = (this.stats.notificationsSent || 0) + 1;
  this.stats.lastNotificationAt = new Date();
  return this.save();
};

module.exports = mongoose.model('ZabbixAlertGroup', zabbixAlertGroupSchema);

