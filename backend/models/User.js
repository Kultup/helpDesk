const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoosePaginate = require('mongoose-paginate-v2');

const userSchema = new mongoose.Schema({
  // Основна інформація
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: function() {
      return !this.telegramId; // Пароль не обов'язковий якщо є Telegram ID
    },
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Не включати в запити за замовчуванням
  },
  
  // Персональні дані
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  middleName: {
    type: String,
    trim: true,
    maxlength: [50, 'Middle name cannot exceed 50 characters']
  },
  phone: {
    type: String,
    trim: true,
    match: [/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number']
  },
  avatar: {
    type: String,
    default: null
  },
  
  // Робоча інформація
  position: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Position',
    required: [true, 'Position is required']
  },
  department: {
    type: String,
    required: [true, 'Department is required'],
    trim: true
  },
  city: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    required: [true, 'City is required']
  },
  employeeId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  
  // Статус реєстрації
  registrationStatus: {
    type: String,
    enum: {
      values: ['pending', 'approved', 'rejected'],
      message: 'Registration status must be pending, approved, or rejected'
    },
    default: 'pending'
  },
  rejectionReason: {
    type: String,
    maxlength: [500, 'Rejection reason cannot exceed 500 characters']
  },
  
  // Система ролей та дозволів
  role: {
    type: String,
    enum: {
      values: ['admin', 'manager', 'agent', 'user'],
      message: 'Role must be admin, manager, agent, or user'
    },
    default: 'user'
  },
  permissions: [{
    type: String,
    enum: [
      'create_tickets', 'edit_tickets', 'delete_tickets', 'assign_tickets',
      'view_all_tickets', 'view_analytics', 'export_data', 'manage_users',
      'manage_cities', 'manage_positions', 'system_settings', 'telegram_admin'
    ]
  }],
  
  // Інтеграція з Telegram
  telegramId: {
    type: String,
    unique: true,
    sparse: true
  },
  telegramUsername: {
    type: String,
    sparse: true
  },
  telegramChatId: {
    type: String,
    sparse: true
  },
  telegramSettings: {
    notifications: {
      newTickets: { type: Boolean, default: true },
      assignedTickets: { type: Boolean, default: true },
      statusUpdates: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      deadlines: { type: Boolean, default: true }
    },
    language: {
      type: String,
      enum: ['uk', 'en', 'ru'],
      default: 'uk'
    },
    timezone: {
      type: String,
      default: 'Europe/Kiev'
    }
  },
  
  // Налаштування профілю
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    language: {
      type: String,
      enum: ['uk', 'en'],
      default: 'uk'
    },
    timezone: {
      type: String,
      default: 'Europe/Kiev'
    },
    dateFormat: {
      type: String,
      enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
      default: 'DD/MM/YYYY'
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '24h'
    },
    itemsPerPage: {
      type: Number,
      min: 10,
      max: 100,
      default: 25
    },
    emailNotifications: {
      newTickets: { type: Boolean, default: true },
      assignedTickets: { type: Boolean, default: true },
      statusUpdates: { type: Boolean, default: true },
      weeklyReports: { type: Boolean, default: false },
      systemUpdates: { type: Boolean, default: true }
    }
  },
  
  // Статус та активність
  isActive: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isTelegramVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: null
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  
  // Токени для відновлення та верифікації
  emailVerificationToken: {
    type: String,
    select: false
  },
  emailVerificationExpires: {
    type: Date,
    select: false
  },
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },
  
  // Refresh токени для JWT
  refreshTokens: [{
    token: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true
    },
    userAgent: {
      type: String,
      default: null
    },
    ip: {
      type: String,
      default: null
    }
  }],
  
  // Статистика користувача
  statistics: {
    ticketsCreated: { type: Number, default: 0 },
    ticketsAssigned: { type: Number, default: 0 },
    ticketsResolved: { type: Number, default: 0 },
    commentsPosted: { type: Number, default: 0 },
    averageResolutionTime: { type: Number, default: 0 } // в годинах
  },
  
  // Інформація про пристрої мобільного застосунку
  devices: [
    {
      deviceId: { type: String, required: true },
      platform: { type: String, enum: ['android', 'ios', 'web', 'other'], default: 'android' },
      manufacturer: { type: String, default: null },
      model: { type: String, default: null },
      osVersion: { type: String, default: null },
      sdkInt: { type: Number, default: null },
      appVersion: { type: String, default: null },
      pushToken: { type: String, default: null },
      firstLoginAt: { type: Date, default: Date.now },
      lastLoginAt: { type: Date, default: Date.now },
      lastIp: { type: String, default: null },
      label: { type: String, default: null },
      isActive: { type: Boolean, default: true }
    }
  ],
  
  // Метадані
  metadata: {
    registrationSource: {
      type: String,
      enum: ['web', 'telegram', 'admin', 'import'],
      default: 'web'
    },
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    referrer: {
      type: String,
      default: null
    }
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.emailVerificationToken;
      delete ret.emailVerificationExpires;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Віртуальні поля
userSchema.virtual('fullName').get(function() {
  const parts = [this.lastName, this.firstName, this.middleName].filter(Boolean);
  return parts.join(' ');
});

userSchema.virtual('initials').get(function() {
  const first = this.firstName ? this.firstName.charAt(0).toUpperCase() : '';
  const last = this.lastName ? this.lastName.charAt(0).toUpperCase() : '';
  return first + last;
});

userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.virtual('canLogin').get(function() {
  return this.isActive && !this.isLocked;
});

// hasPermission реалізовано як method нижче

userSchema.virtual('ticketsCreated', {
  ref: 'Ticket',
  localField: '_id',
  foreignField: 'createdBy',
  count: true
});

userSchema.virtual('ticketsAssigned', {
  ref: 'Ticket',
  localField: '_id',
  foreignField: 'assignedTo',
  count: true
});

// Індекси для оптимізації запитів
userSchema.index({ email: 1 });
userSchema.index({ telegramId: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ city: 1, department: 1 });
userSchema.index({ position: 1 });
userSchema.index({ lastActivity: -1 });
userSchema.index({ 'statistics.ticketsResolved': -1 });
userSchema.index({ 'devices.deviceId': 1 });

// Middleware для хешування пароля
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  if (this.password) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

// Middleware для оновлення статистики
userSchema.pre('save', function(next) {
  if (this.isModified('lastActivity')) {
    this.lastActivity = new Date();
  }
  next();
});

// Middleware для відстеження змін статусу користувача
userSchema.pre('save', async function(next) {
  // Перевіряємо чи це новий документ
  if (this.isNew) return next();
  
  // Отримуємо оригінальний документ з бази даних
  if (!this._originalDoc && (this.isModified('isActive') || this.isModified('role') || this.isModified('registrationStatus'))) {
    try {
      this._originalDoc = await this.constructor.findById(this._id).lean();
    } catch (error) {
      console.error('Помилка отримання оригінального документа:', error);
      return next();
    }
  }
  
  // Відстежуємо зміни статусу
  const statusChanges = {};
  
  if (this.isModified('isActive') && this._originalDoc) {
    statusChanges.isActive = {
      old: this._originalDoc.isActive,
      new: this.isActive
    };
  }
  
  if (this.isModified('role') && this._originalDoc) {
    statusChanges.role = {
      old: this._originalDoc.role,
      new: this.role
    };
  }
  
  if (this.isModified('registrationStatus') && this._originalDoc) {
    statusChanges.registrationStatus = {
      old: this._originalDoc.registrationStatus,
      new: this.registrationStatus
    };
  }
  
  // Зберігаємо зміни для post middleware
  if (Object.keys(statusChanges).length > 0) {
    this._statusChanges = statusChanges;
  }
  
  next();
});

// Post middleware для відправки сповіщень
userSchema.post('save', async function(doc) {
  if (doc._statusChanges) {
    try {
      // Імпортуємо сервіс сповіщень
      const notificationService = require('../services/userNotificationService');
      await notificationService.sendUserStatusChangeNotification(doc, doc._statusChanges);
      
      // Також сповіщаємо адміністраторів про важливі зміни
      if (doc._statusChanges.isActive || doc._statusChanges.role || doc._statusChanges.registrationStatus) {
        await notificationService.notifyAdminsAboutUserStatusChange(doc, doc._statusChanges);
      }
    } catch (error) {
      console.error('Помилка відправки сповіщення про зміну статусу користувача:', error);
    }
    
    // Очищуємо тимчасові дані
    delete doc._statusChanges;
  }
});

// Статичні методи
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByTelegramId = function(telegramId) {
  return this.findOne({ telegramId: telegramId.toString() });
};

userSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

userSchema.statics.findByRole = function(role) {
  return this.find({ role, isActive: true });
};

userSchema.statics.findByCity = function(cityId) {
  return this.find({ city: cityId, isActive: true });
};

userSchema.statics.findByDepartment = function(department) {
  return this.find({ department, isActive: true });
};

userSchema.statics.findByPosition = function(positionId) {
  return this.find({ position: positionId, isActive: true });
};

userSchema.statics.getStatistics = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
        verifiedUsers: { $sum: { $cond: ['$isEmailVerified', 1, 0] } },
        telegramUsers: { $sum: { $cond: [{ $ne: ['$telegramId', null] }, 1, 0] } },
        adminUsers: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
        managerUsers: { $sum: { $cond: [{ $eq: ['$role', 'manager'] }, 1, 0] } },
        agentUsers: { $sum: { $cond: [{ $eq: ['$role', 'agent'] }, 1, 0] } },
        regularUsers: { $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] } }
      }
    }
  ]);
};

userSchema.statics.findTopPerformers = function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ 'statistics.ticketsResolved': -1 })
    .limit(limit)
    .populate('position city');
};

// Методи екземпляра
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateEmailVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 години
  return token;
};

userSchema.methods.generatePasswordResetToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 хвилин
  return token;
};

userSchema.methods.verifyEmail = function() {
  this.isEmailVerified = true;
  this.emailVerificationToken = undefined;
  this.emailVerificationExpires = undefined;
  return this.save();
};

userSchema.methods.verifyTelegram = function() {
  this.isTelegramVerified = true;
  return this.save();
};

userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  this.lastActivity = new Date();
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  return this.save();
};

userSchema.methods.incrementLoginAttempts = function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 години
  }
  
  return this.updateOne(updates);
};

userSchema.methods.addPermission = function(permission) {
  if (!this.permissions.includes(permission)) {
    this.permissions.push(permission);
    return this.save();
  }
  return Promise.resolve(this);
};

userSchema.methods.removePermission = function(permission) {
  this.permissions = this.permissions.filter(p => p !== permission);
  return this.save();
};

userSchema.methods.hasPermission = function(permission) {
  if (this.role === 'admin') return true;
  return this.permissions.includes(permission);
};

userSchema.methods.updateStatistics = function(stats) {
  Object.keys(stats).forEach(key => {
    if (this.statistics[key] !== undefined) {
      this.statistics[key] = stats[key];
    }
  });
  return this.save();
};

userSchema.methods.deactivate = function() {
  this.isActive = false;
  this.lockUntil = undefined;
  this.loginAttempts = 0;
  return this.save();
};

userSchema.methods.activate = function() {
  this.isActive = true;
  this.lockUntil = undefined;
  this.loginAttempts = 0;
  return this.save();
};

userSchema.methods.updateTelegramSettings = function(settings) {
  this.telegramSettings = { ...this.telegramSettings, ...settings };
  return this.save();
};

userSchema.methods.updatePreferences = function(preferences) {
  this.preferences = { ...this.preferences, ...preferences };
  return this.save();
};

// Метод для порівняння паролів
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Додаємо плагін пагінації
userSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('User', userSchema);