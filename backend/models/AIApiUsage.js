const mongoose = require('mongoose');

const aiApiUsageSchema = new mongoose.Schema({
  // Провайдер AI (groq, openai)
  provider: {
    type: String,
    enum: ['groq', 'openai'],
    required: true,
    default: 'groq'
  },

  // Дата використання (для групування по днях)
  date: { 
    type: Date, 
    default: () => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    },
    index: true 
  },
  
  // Загальна статистика
  requestCount: { type: Number, default: 0 },
  tokensUsed: { type: Number, default: 0 },
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  
  // Статистика по моделях (динамічне поле)
  modelUsage: {
    type: Map,
    of: {
      requestsCount: { type: Number, default: 0 },
      tokensUsed: { type: Number, default: 0 },
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
      audioSecondsUsed: { type: Number, default: 0 },
      lastRequest: { type: Date }
    },
    default: {}
  },
  
  // Ліміти з останнього запиту (для Groq - з HTTP headers, для OpenAI - інші джерела)
  rateLimits: {
    remainingRequests: { type: Number },
    remainingTokens: { type: Number },
    limitRequests: { type: Number },
    limitTokens: { type: Number },
    resetRequests: { type: String },
    resetTokens: { type: String },
    lastUpdated: { type: Date }
  },
  
  // Сповіщення
  notifications: {
    lowRequestsNotified: { type: Boolean, default: false },
    lowTokensNotified: { type: Boolean, default: false },
    criticalNotified: { type: Boolean, default: false },
    lastNotificationDate: { type: Date }
  }
}, { 
  timestamps: true 
});

// Індекс для швидкого пошуку по даті та провайдеру
aiApiUsageSchema.index({ provider: 1, date: -1 });

// Статичний метод для отримання або створення запису на сьогодні
aiApiUsageSchema.statics.getTodayUsage = async function(provider = 'groq') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let usage = await this.findOne({ provider, date: today });
  
  if (!usage) {
    usage = await this.create({ provider, date: today });
  }
  
  return usage;
};

// Метод для оновлення статистики використання
aiApiUsageSchema.methods.updateUsage = async function(model, data = {}) {
  // Оновлюємо загальну статистику
  this.requestCount += 1;
  this.tokensUsed += data.tokensUsed || 0;
  this.promptTokens += data.promptTokens || 0;
  this.completionTokens += data.completionTokens || 0;

  // Оновлюємо статистику по моделі
  if (!this.modelUsage) {
    this.modelUsage = new Map();
  }

  const currentModelUsage = this.modelUsage.get(model) || {
    requestsCount: 0,
    tokensUsed: 0,
    promptTokens: 0,
    completionTokens: 0,
    audioSecondsUsed: 0
  };

  currentModelUsage.requestsCount += 1;
  currentModelUsage.tokensUsed += data.tokensUsed || 0;
  currentModelUsage.promptTokens += data.promptTokens || 0;
  currentModelUsage.completionTokens += data.completionTokens || 0;
  currentModelUsage.audioSecondsUsed += data.audioSeconds || 0;
  currentModelUsage.lastRequest = new Date();

  this.modelUsage.set(model, currentModelUsage);
  this.markModified('modelUsage');
  
  await this.save();
};

// Метод для оновлення лімітів з HTTP headers (для Groq)
aiApiUsageSchema.methods.updateRateLimits = async function(headers = {}) {
  this.rateLimits = {
    remainingRequests: parseInt(headers['x-ratelimit-remaining-requests']) || null,
    remainingTokens: parseInt(headers['x-ratelimit-remaining-tokens']) || null,
    limitRequests: parseInt(headers['x-ratelimit-limit-requests']) || null,
    limitTokens: parseInt(headers['x-ratelimit-limit-tokens']) || null,
    resetRequests: headers['x-ratelimit-reset-requests'] || null,
    resetTokens: headers['x-ratelimit-reset-tokens'] || null,
    lastUpdated: new Date()
  };
  await this.save();
};

// Метод для перевірки чи потрібно сповіщення
aiApiUsageSchema.methods.shouldNotify = function() {
  const { remainingRequests, limitRequests, remainingTokens, limitTokens } = this.rateLimits || {};
  
  if (!remainingRequests || !limitRequests) return null;
  
  const requestsPercentage = (remainingRequests / limitRequests) * 100;
  const tokensPercentage = remainingTokens && limitTokens ? (remainingTokens / limitTokens) * 100 : 100;
  
  // Критичний рівень - 5%
  if ((requestsPercentage <= 5 || tokensPercentage <= 5) && !this.notifications.criticalNotified) {
    return {
      level: 'critical',
      requestsPercentage: requestsPercentage.toFixed(1),
      tokensPercentage: tokensPercentage.toFixed(1),
      remainingRequests,
      remainingTokens
    };
  }
  
  // Попередження - 20%
  if ((requestsPercentage <= 20 || tokensPercentage <= 20) && !this.notifications.lowRequestsNotified) {
    return {
      level: 'warning',
      requestsPercentage: requestsPercentage.toFixed(1),
      tokensPercentage: tokensPercentage.toFixed(1),
      remainingRequests,
      remainingTokens
    };
  }
  
  return null;
};

// Метод для позначення що сповіщення відправлено
aiApiUsageSchema.methods.markNotified = async function(level) {
  if (level === 'critical') {
    this.notifications.criticalNotified = true;
  } else if (level === 'warning') {
    this.notifications.lowRequestsNotified = true;
    this.notifications.lowTokensNotified = true;
  }
  this.notifications.lastNotificationDate = new Date();
  await this.save();
};

module.exports = mongoose.model('AIApiUsage', aiApiUsageSchema);
