const mongoose = require('mongoose');

const escalationLevelSchema = new mongoose.Schema({
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  action: {
    type: String,
    enum: ['notify', 'escalate', 'assign', 'alert'],
    default: 'notify'
  },
  notifyUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  assignTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { _id: false });

const slaPolicySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Policy name is required'],
    trim: true,
    maxlength: [200, 'Policy name cannot exceed 200 characters'],
    unique: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  // SLA правила по пріоритетам
  priorities: {
    low: {
      responseTime: { type: Number, default: 48 }, // години
      resolutionTime: { type: Number, default: 120 }, // години
      enabled: { type: Boolean, default: true }
    },
    medium: {
      responseTime: { type: Number, default: 24 }, // години
      resolutionTime: { type: Number, default: 72 }, // години
      enabled: { type: Boolean, default: true }
    },
    high: {
      responseTime: { type: Number, default: 4 }, // години
      resolutionTime: { type: Number, default: 24 }, // години
      enabled: { type: Boolean, default: true }
    },
    urgent: {
      responseTime: { type: Number, default: 1 }, // години
      resolutionTime: { type: Number, default: 8 }, // години
      enabled: { type: Boolean, default: true }
    }
  },
  // Ескалаційні рівні
  escalationLevels: [escalationLevelSchema],
  // Правила автоматичної ескалації
  autoEscalation: {
    enabled: { type: Boolean, default: false },
    onResponseBreach: { type: Boolean, default: false },
    onResolutionBreach: { type: Boolean, default: true },
    escalationLevel: { type: Number, default: 1 }
  },
  // Налаштування попереджень
  warnings: {
    enabled: { type: Boolean, default: true },
    levels: [{
      percentage: { type: Number, required: true, min: 0, max: 100 },
      notifyUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      notifyChannels: [{
        type: String,
        enum: ['email', 'telegram', 'web'],
        default: 'web'
      }]
    }]
  },
  // Активність політики
  isActive: {
    type: Boolean,
    default: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  // Автор та історія
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Індекси
slaPolicySchema.index({ category: 1, isActive: 1 });
slaPolicySchema.index({ isDefault: 1 });
slaPolicySchema.index({ isActive: 1 });

// Методи
slaPolicySchema.methods.getSLAForPriority = function(priority) {
  const priorityConfig = this.priorities[priority];
  if (!priorityConfig || !priorityConfig.enabled) {
    // Повертаємо дефолтні значення для середнього пріоритету
    return {
      responseTime: 24,
      resolutionTime: 72
    };
  }
  return {
    responseTime: priorityConfig.responseTime,
    resolutionTime: priorityConfig.resolutionTime
  };
};

slaPolicySchema.methods.getEscalationLevel = function(percentage) {
  if (!this.escalationLevels || this.escalationLevels.length === 0) {
    return null;
  }
  
  // Сортуємо по відсотку (від найбільшого до найменшого)
  const sortedLevels = [...this.escalationLevels].sort((a, b) => b.percentage - a.percentage);
  
  // Знаходимо перший рівень, який перевищено
  for (const level of sortedLevels) {
    if (percentage >= level.percentage) {
      return level;
    }
  }
  
  return null;
};

slaPolicySchema.statics.getDefaultPolicy = async function() {
  const defaultPolicy = await this.findOne({ isDefault: true, isActive: true });
  if (defaultPolicy) {
    return defaultPolicy;
  }
  
  // Якщо немає дефолтної політики, повертаємо першу активну
  return await this.findOne({ isActive: true });
};

module.exports = mongoose.model('SLAPolicy', slaPolicySchema);

