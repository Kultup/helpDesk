const mongoose = require('mongoose');

const groqApiUsageSchema = new mongoose.Schema({
  // Дата використання (для групування по днях)
  date: { 
    type: Date, 
    default: () => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    },
    index: true 
  },
  
  // Статистика по моделях
  modelUsage: {
    'llama-3.3-70b-versatile': {
      requestsCount: { type: Number, default: 0 },
      tokensUsed: { type: Number, default: 0 },
      lastRequest: { type: Date }
    },
    'whisper-large-v3': {
      requestsCount: { type: Number, default: 0 },
      audioSecondsUsed: { type: Number, default: 0 },
      lastRequest: { type: Date }
    }
  },
  
  // Ліміти з останнього запиту (з HTTP headers)
  rateLimits: {
    remainingRequests: { type: Number }, // RPD залишилось
    remainingTokens: { type: Number },   // TPM залишилось
    limitRequests: { type: Number },     // RPD ліміт
    limitTokens: { type: Number },       // TPM ліміт
    resetRequests: { type: String },     // Коли оновиться RPD
    resetTokens: { type: String },       // Коли оновиться TPM
    lastUpdated: { type: Date }
  },
  
  // Сповіщення
  notifications: {
    lowRequestsNotified: { type: Boolean, default: false }, // Сповіщення про 20% залишку запитів
    lowTokensNotified: { type: Boolean, default: false },   // Сповіщення про 20% залишку токенів
    criticalNotified: { type: Boolean, default: false },    // Критичне сповіщення (5%)
    lastNotificationDate: { type: Date }
  }
}, { 
  timestamps: true 
});

// Індекс для швидкого пошуку по даті
groqApiUsageSchema.index({ date: -1 });

// Статичний метод для отримання або створення запису на сьогодні
groqApiUsageSchema.statics.getTodayUsage = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let usage = await this.findOne({ date: today });
  
  if (!usage) {
    usage = await this.create({ date: today });
  }
  
  return usage;
};

// Метод для оновлення статистики використання
groqApiUsageSchema.methods.updateUsage = async function(model, data = {}) {
  const modelKey = `modelUsage.${model}`;
  
  if (model === 'whisper-large-v3') {
    this.set(`${modelKey}.requestsCount`, (this.get(`${modelKey}.requestsCount`) || 0) + 1);
    this.set(`${modelKey}.audioSecondsUsed`, (this.get(`${modelKey}.audioSecondsUsed`) || 0) + (data.audioSeconds || 0));
  } else {
    this.set(`${modelKey}.requestsCount`, (this.get(`${modelKey}.requestsCount`) || 0) + 1);
    this.set(`${modelKey}.tokensUsed`, (this.get(`${modelKey}.tokensUsed`) || 0) + (data.tokensUsed || 0));
  }
  
  this.set(`${modelKey}.lastRequest`, new Date());
  await this.save();
};

// Метод для оновлення лімітів з HTTP headers
groqApiUsageSchema.methods.updateRateLimits = async function(headers = {}) {
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
groqApiUsageSchema.methods.shouldNotify = function() {
  const { remainingRequests, limitRequests, remainingTokens, limitTokens } = this.rateLimits;
  
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
groqApiUsageSchema.methods.markNotified = async function(level) {
  if (level === 'critical') {
    this.notifications.criticalNotified = true;
  } else if (level === 'warning') {
    this.notifications.lowRequestsNotified = true;
    this.notifications.lowTokensNotified = true;
  }
  this.notifications.lastNotificationDate = new Date();
  await this.save();
};

module.exports = mongoose.model('GroqApiUsage', groqApiUsageSchema);
