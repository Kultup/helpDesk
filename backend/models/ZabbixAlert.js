const mongoose = require('mongoose');

const zabbixAlertSchema = new mongoose.Schema({
  // Унікальний ID алерту з Zabbix (eventid або problemid)
  alertId: {
    type: String,
    required: [true, 'Alert ID is required'],
    unique: true,
    trim: true
  },
  // ID тригера з Zabbix
  triggerId: {
    type: String,
    required: [true, 'Trigger ID is required'],
    trim: true,
    index: true
  },
  // ID хоста з Zabbix
  hostId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  // Назва хоста
  host: {
    type: String,
    required: [true, 'Host name is required'],
    trim: true,
    index: true
  },
  // Назва тригера
  triggerName: {
    type: String,
    required: [true, 'Trigger name is required'],
    trim: true
  },
  // Опис тригера
  triggerDescription: {
    type: String,
    trim: true,
    default: ''
  },
  // Severity (0=Not classified, 1=Information, 2=Warning, 3=High, 4=Disaster)
  severity: {
    type: Number,
    required: [true, 'Severity is required'],
    enum: [0, 1, 2, 3, 4],
    index: true
  },
  // Статус (0=OK, 1=PROBLEM)
  status: {
    type: String,
    required: true,
    enum: ['OK', 'PROBLEM'],
    default: 'PROBLEM',
    index: true
  },
  // Повідомлення
  message: {
    type: String,
    trim: true,
    default: ''
  },
  // Час появи проблеми в Zabbix
  eventTime: {
    type: Date,
    required: true
  },
  // Час оновлення в Zabbix
  updateTime: {
    type: Date,
    default: Date.now
  },
  // Підтверджено
  acknowledged: {
    type: Boolean,
    default: false,
    index: true
  },
  // Час підтвердження
  acknowledgedAt: {
    type: Date,
    default: null
  },
  // Користувач, який підтвердив
  acknowledgedBy: {
    type: String,
    default: null
  },
  // Вирішено
  resolved: {
    type: Boolean,
    default: false,
    index: true
  },
  // Час вирішення
  resolvedAt: {
    type: Date,
    default: null
  },
  // Сирові дані з Zabbix (для діагностики)
  zabbixData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Чи відправлено сповіщення
  notificationSent: {
    type: Boolean,
    default: false
  },
  // Час відправки сповіщення
  notificationSentAt: {
    type: Date,
    default: null
  },
  // Групи, яким відправлено сповіщення
  notifiedGroups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ZabbixAlertGroup'
  }],
  // Додаткові дані
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Віртуальні поля
zabbixAlertSchema.virtual('severityLabel').get(function() {
  const labels = {
    0: 'Not classified',
    1: 'Information',
    2: 'Warning',
    3: 'High',
    4: 'Disaster'
  };
  return labels[this.severity] || 'Unknown';
});

zabbixAlertSchema.virtual('severityEmoji').get(function() {
  const emojis = {
    0: '⚪',
    1: 'ℹ️',
    2: '⚠️',
    3: '🔴',
    4: '🚨'
  };
  return emojis[this.severity] || '❓';
});

zabbixAlertSchema.virtual('isCritical').get(function() {
  return this.severity === 3 || this.severity === 4;
});

zabbixAlertSchema.virtual('isActive').get(function() {
  return this.status === 'PROBLEM' && !this.resolved;
});

zabbixAlertSchema.virtual('duration').get(function() {
  if (this.resolved && this.resolvedAt) {
    return this.resolvedAt - this.eventTime;
  }
  return Date.now() - this.eventTime;
});

// Індекси
zabbixAlertSchema.index({ alertId: 1 }, { unique: true });
zabbixAlertSchema.index({ triggerId: 1 });
zabbixAlertSchema.index({ hostId: 1 });
zabbixAlertSchema.index({ host: 1 });
zabbixAlertSchema.index({ severity: 1 });
zabbixAlertSchema.index({ status: 1 });
zabbixAlertSchema.index({ resolved: 1 });
zabbixAlertSchema.index({ acknowledged: 1 });
zabbixAlertSchema.index({ eventTime: -1 });
zabbixAlertSchema.index({ createdAt: -1 });
zabbixAlertSchema.index({ status: 1, severity: 1, resolved: 1 });
zabbixAlertSchema.index({ notificationSent: 1, createdAt: -1 });

// Текстовий пошук
zabbixAlertSchema.index({
  host: 'text',
  triggerName: 'text',
  triggerDescription: 'text',
  message: 'text'
});

// Статичні методи
zabbixAlertSchema.statics.findActive = function() {
  return this.find({
    status: 'PROBLEM',
    resolved: false
  }).sort({ eventTime: -1 });
};

zabbixAlertSchema.statics.findCritical = function() {
  return this.find({
    severity: { $in: [3, 4] },
    status: 'PROBLEM',
    resolved: false
  }).sort({ eventTime: -1 });
};

zabbixAlertSchema.statics.findByHost = function(host) {
  return this.find({ host }).sort({ eventTime: -1 });
};

zabbixAlertSchema.statics.findByTrigger = function(triggerId) {
  return this.find({ triggerId }).sort({ eventTime: -1 });
};

zabbixAlertSchema.statics.findUnresolved = function() {
  return this.find({
    resolved: false,
    status: 'PROBLEM'
  }).sort({ eventTime: -1 });
};

zabbixAlertSchema.statics.findRecent = function(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    eventTime: { $gte: since }
  }).sort({ eventTime: -1 });
};

// Методи екземпляра
zabbixAlertSchema.methods.markAcknowledged = function(acknowledgedBy = null) {
  this.acknowledged = true;
  this.acknowledgedAt = new Date();
  if (acknowledgedBy) {
    this.acknowledgedBy = acknowledgedBy;
  }
  return this.save();
};

zabbixAlertSchema.methods.markResolved = function() {
  this.resolved = true;
  this.resolvedAt = new Date();
  this.status = 'OK';
  return this.save();
};

zabbixAlertSchema.methods.markNotificationSent = function(groupIds = []) {
  this.notificationSent = true;
  this.notificationSentAt = new Date();
  if (groupIds.length > 0) {
    this.notifiedGroups = groupIds;
  }
  return this.save();
};

// Метод для форматування повідомлення
zabbixAlertSchema.methods.formatMessage = function() {
  const emoji = this.severityEmoji;
  const severityLabel = this.severityLabel;
  const time = this.eventTime.toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' });
  
  return `${emoji} *Zabbix Alert: ${severityLabel}*\n\n` +
         `🏷️ *Host:* ${this.host}\n` +
         `⚙️ *Trigger:* ${this.triggerName}\n` +
         `📊 *Status:* ${this.status}\n` +
         `⏰ *Time:* ${time}\n` +
         (this.message ? `\n📝 *Message:* ${this.message}` : '') +
         (this.triggerDescription ? `\n\n📄 *Description:* ${this.triggerDescription}` : '');
};

module.exports = mongoose.model('ZabbixAlert', zabbixAlertSchema);

