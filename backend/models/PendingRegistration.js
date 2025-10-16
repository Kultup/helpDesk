const mongoose = require('mongoose');

const pendingRegistrationSchema = new mongoose.Schema({
  telegramId: {
    type: String,
    required: true,
    unique: true
  },
  step: {
    type: String,
    required: true,
    enum: ['firstName', 'lastName', 'email', 'phone', 'password', 'city', 'position', 'department', 'completed'],
    default: 'firstName'
  },
  data: {
    firstName: {
      type: String,
      trim: true
    },
    lastName: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      trim: true
    },
    password: {
      type: String
    },
    cityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City'
    },
    positionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Position'
    },
    department: {
      type: String,
      trim: true
    }
  },
  telegramInfo: {
    username: String,
    firstName: String,
    lastName: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Автоматичне видалення через 24 години
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Оновлюємо updatedAt при кожному збереженні
pendingRegistrationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Індекси для оптимізації
pendingRegistrationSchema.index({ telegramId: 1 });
pendingRegistrationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);