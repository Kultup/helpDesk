const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: {
      values: [
        'daily_summary', 'weekly_summary', 'monthly_summary',
        'ticket_metrics', 'user_activity', 'city_performance',
        'response_time', 'resolution_time', 'satisfaction_score',
        'system_usage', 'error_tracking', 'performance_metrics',
        'export_activity', 'login_activity', 'api_usage'
      ],
      message: 'Invalid analytics type'
    },
    required: true
  },
  period: {
    start: {
      type: Date,
      required: true
    },
    end: {
      type: Date,
      required: true
    },
    granularity: {
      type: String,
      enum: ['hour', 'day', 'week', 'month', 'quarter', 'year'],
      default: 'day'
    }
  },
  scope: {
    global: {
      type: Boolean,
      default: true
    },
    city: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City',
      default: null
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    department: {
      type: String,
      default: null
    },
    position: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Position',
      default: null
    }
  },
  metrics: {
    // Загальні метрики
    totalTickets: {
      type: Number,
      default: 0
    },
    newTickets: {
      type: Number,
      default: 0
    },
    resolvedTickets: {
      type: Number,
      default: 0
    },
    closedTickets: {
      type: Number,
      default: 0
    },
    
    // Метрики за статусами
    statusBreakdown: {
      open: { type: Number, default: 0 },
      in_progress: { type: Number, default: 0 },
      resolved: { type: Number, default: 0 },
      closed: { type: Number, default: 0 }
    },
    
    // Метрики за пріоритетами
    priorityBreakdown: {
      low: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      high: { type: Number, default: 0 },
      urgent: { type: Number, default: 0 }
    },
    
    // Метрики за категоріями
    categoryBreakdown: {
      technical: { type: Number, default: 0 },
      account: { type: Number, default: 0 },
      billing: { type: Number, default: 0 },
      general: { type: Number, default: 0 }
    },
    
    // Часові метрики (в годинах)
    averageResponseTime: {
      type: Number,
      default: 0
    },
    averageResolutionTime: {
      type: Number,
      default: 0
    },
    medianResponseTime: {
      type: Number,
      default: 0
    },
    medianResolutionTime: {
      type: Number,
      default: 0
    },
    
    // SLA метрики
    slaCompliance: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    overdueTickets: {
      type: Number,
      default: 0
    },
    
    // Метрики користувачів
    activeUsers: {
      type: Number,
      default: 0
    },
    newUsers: {
      type: Number,
      default: 0
    },
    userLogins: {
      type: Number,
      default: 0
    },
    
    // Метрики задоволеності
    satisfactionScore: {
      average: { type: Number, min: 1, max: 5, default: 0 },
      responses: { type: Number, default: 0 },
      distribution: {
        score1: { type: Number, default: 0 },
        score2: { type: Number, default: 0 },
        score3: { type: Number, default: 0 },
        score4: { type: Number, default: 0 },
        score5: { type: Number, default: 0 }
      }
    },
    
    // Метрики продуктивності
    ticketsPerUser: {
      type: Number,
      default: 0
    },
    commentsPerTicket: {
      type: Number,
      default: 0
    },
    attachmentsPerTicket: {
      type: Number,
      default: 0
    },
    
    // Системні метрики
    systemUptime: {
      type: Number,
      default: 100
    },
    apiCalls: {
      type: Number,
      default: 0
    },
    errorRate: {
      type: Number,
      default: 0
    },
    
    // Метрики експорту
    exports: {
      total: { type: Number, default: 0 },
      csv: { type: Number, default: 0 },
      excel: { type: Number, default: 0 },
      pdf: { type: Number, default: 0 }
    }
  },
  
  // Детальні дані для графіків
  timeSeries: [{
    timestamp: {
      type: Date,
      required: true
    },
    value: {
      type: Number,
      required: true
    },
    metric: {
      type: String,
      required: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }],
  
  // Топ-списки
  topLists: {
    topUsers: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      value: Number,
      metric: String
    }],
    topCities: [{
      city: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'City'
      },
      value: Number,
      metric: String
    }],
    topCategories: [{
      category: String,
      value: Number
    }]
  },
  
  // Порівняння з попереднім періодом
  comparison: {
    previousPeriod: {
      start: Date,
      end: Date
    },
    changes: {
      totalTickets: {
        absolute: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 }
      },
      resolvedTickets: {
        absolute: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 }
      },
      averageResolutionTime: {
        absolute: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 }
      },
      satisfactionScore: {
        absolute: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 }
      }
    }
  },
  
  // Прогнози
  forecasts: [{
    metric: {
      type: String,
      required: true
    },
    period: {
      type: String,
      enum: ['next_week', 'next_month', 'next_quarter'],
      required: true
    },
    predictedValue: {
      type: Number,
      required: true
    },
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    algorithm: {
      type: String,
      default: 'linear_regression'
    }
  }],
  
  // Метадані
  metadata: {
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    generationTime: {
      type: Number, // час генерації в мілісекундах
      default: 0
    },
    dataQuality: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    samplingRate: {
      type: Number,
      min: 0,
      max: 1,
      default: 1
    },
    version: {
      type: String,
      default: '1.0'
    }
  },
  
  // Налаштування кешування
  cacheSettings: {
    ttl: {
      type: Number,
      default: 3600 // 1 година в секундах
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    },
    autoRefresh: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Віртуальні поля
analyticsSchema.virtual('isExpired').get(function() {
  if (!this.cacheSettings.ttl) return false;
  const expiryTime = new Date(this.cacheSettings.lastUpdated.getTime() + this.cacheSettings.ttl * 1000);
  return new Date() > expiryTime;
});

analyticsSchema.virtual('periodDuration').get(function() {
  return Math.ceil((this.period.end - this.period.start) / (1000 * 60 * 60 * 24)); // в днях
});

analyticsSchema.virtual('resolutionRate').get(function() {
  if (this.metrics.totalTickets === 0) return 0;
  return Math.round((this.metrics.resolvedTickets / this.metrics.totalTickets) * 100);
});

analyticsSchema.virtual('averageTicketsPerDay').get(function() {
  const days = this.periodDuration;
  return days > 0 ? Math.round(this.metrics.totalTickets / days) : 0;
});

// Індекси для оптимізації запитів
analyticsSchema.index({ type: 1, 'period.start': -1 });
analyticsSchema.index({ 'scope.city': 1, type: 1 });
analyticsSchema.index({ 'scope.user': 1, type: 1 });
analyticsSchema.index({ 'scope.global': 1, type: 1 });
analyticsSchema.index({ 'period.start': 1, 'period.end': 1 });
analyticsSchema.index({ 'cacheSettings.lastUpdated': 1 });
analyticsSchema.index({ createdAt: -1 });

// TTL індекс для автоматичного видалення застарілих записів
analyticsSchema.index({ 
  'cacheSettings.lastUpdated': 1 
}, { 
  expireAfterSeconds: 2592000 // 30 днів
});

// Статичні методи
analyticsSchema.statics.findByPeriod = function(start, end, type = null) {
  const query = {
    'period.start': { $gte: start },
    'period.end': { $lte: end }
  };
  
  if (type) query.type = type;
  
  return this.find(query).sort({ 'period.start': -1 });
};

analyticsSchema.statics.findByScope = function(scope, type = null) {
  const query = {};
  
  if (scope.global) query['scope.global'] = true;
  if (scope.city) query['scope.city'] = scope.city;
  if (scope.user) query['scope.user'] = scope.user;
  if (scope.department) query['scope.department'] = scope.department;
  if (scope.position) query['scope.position'] = scope.position;
  
  if (type) query.type = type;
  
  return this.find(query).sort({ createdAt: -1 });
};

analyticsSchema.statics.findLatest = function(type, scope = null) {
  const query = { type };
  
  if (scope) {
    Object.keys(scope).forEach(key => {
      if (scope[key] !== null && scope[key] !== undefined) {
        query[`scope.${key}`] = scope[key];
      }
    });
  }
  
  return this.findOne(query).sort({ createdAt: -1 });
};

analyticsSchema.statics.findExpired = function() {
  return this.find({
    'cacheSettings.autoRefresh': true
  }).then(records => {
    return records.filter(record => record.isExpired);
  });
};

analyticsSchema.statics.generateDashboardData = function(scope = {}, period = 30) {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - period * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        'period.start': { $gte: startDate },
        'period.end': { $lte: endDate },
        ...scope
      }
    },
    {
      $group: {
        _id: '$type',
        latestRecord: { $last: '$$ROOT' },
        totalRecords: { $sum: 1 }
      }
    },
    {
      $replaceRoot: { newRoot: '$latestRecord' }
    }
  ]);
};

// Методи екземпляра
analyticsSchema.methods.refresh = function() {
  this.cacheSettings.lastUpdated = new Date();
  return this.save();
};

analyticsSchema.methods.addTimeSeries = function(timestamp, value, metric, metadata = {}) {
  this.timeSeries.push({
    timestamp,
    value,
    metric,
    metadata
  });
  return this.save();
};

analyticsSchema.methods.updateMetric = function(metricPath, value) {
  this.set(`metrics.${metricPath}`, value);
  return this.save();
};

analyticsSchema.methods.addForecast = function(metric, period, predictedValue, confidence, algorithm = 'linear_regression') {
  this.forecasts.push({
    metric,
    period,
    predictedValue,
    confidence,
    algorithm
  });
  return this.save();
};

analyticsSchema.methods.calculateTrends = function() {
  const trends = {};
  
  // Розрахунок трендів на основі часових рядів
  const metricGroups = {};
  this.timeSeries.forEach(point => {
    if (!metricGroups[point.metric]) {
      metricGroups[point.metric] = [];
    }
    metricGroups[point.metric].push(point);
  });
  
  Object.keys(metricGroups).forEach(metric => {
    const points = metricGroups[metric].sort((a, b) => a.timestamp - b.timestamp);
    if (points.length >= 2) {
      const firstValue = points[0].value;
      const lastValue = points[points.length - 1].value;
      const change = lastValue - firstValue;
      const percentageChange = firstValue !== 0 ? (change / firstValue) * 100 : 0;
      
      trends[metric] = {
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
        change,
        percentageChange: Math.round(percentageChange * 100) / 100
      };
    }
  });
  
  return trends;
};

analyticsSchema.methods.exportToCSV = function() {
  const data = [];
  
  // Експорт основних метрик
  Object.keys(this.metrics).forEach(key => {
    if (typeof this.metrics[key] === 'number') {
      data.push({
        metric: key,
        value: this.metrics[key],
        period: `${this.period.start.toISOString()} - ${this.period.end.toISOString()}`
      });
    }
  });
  
  return data;
};

module.exports = mongoose.model('Analytics', analyticsSchema);