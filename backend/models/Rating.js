const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  // Посилання на тікет
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: true
  },
  
  // Користувач, який залишив оцінку (автор тікета)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Оцінка від 1 до 5 зірок
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  

  
  // Категорії оцінки
  categories: {
    // Швидкість вирішення
    speed: {
      type: Number,
      min: 1,
      max: 5
    },
    
    // Якість рішення
    quality: {
      type: Number,
      min: 1,
      max: 5
    },
    
    // Комунікація
    communication: {
      type: Number,
      min: 1,
      max: 5
    },
    
    // Професіоналізм
    professionalism: {
      type: Number,
      min: 1,
      max: 5
    }
  },
  
  // Чи рекомендує користувач службу підтримки
  wouldRecommend: {
    type: Boolean,
    default: null
  },
  
  // Джерело рейтингу
  source: {
    type: String,
    enum: ['web', 'telegram'],
    default: 'web'
  },
  
  // Коментар до оцінки
  comment: {
    type: String,
    maxlength: 1000
  },
  
  // Дата створення оцінки
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // Дата оновлення
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Індекси для оптимізації запитів
ratingSchema.index({ ticket: 1, user: 1 }, { unique: true }); // Один рейтинг на тікет від одного користувача
ratingSchema.index({ ticket: 1 });
ratingSchema.index({ user: 1 });
ratingSchema.index({ rating: 1 });
ratingSchema.index({ createdAt: -1 });

// Віртуальне поле для середньої оцінки по категоріях
ratingSchema.virtual('averageCategoryRating').get(function() {
  const categories = this.categories;
  if (!categories) return null;
  
  const ratings = [
    categories.speed,
    categories.quality,
    categories.communication,
    categories.professionalism
  ].filter(rating => rating !== undefined && rating !== null);
  
  if (ratings.length === 0) return null;
  
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
});

// Middleware для оновлення updatedAt
ratingSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Статичний метод для отримання середнього рейтингу
ratingSchema.statics.getAverageRating = async function() {
  const result = await this.aggregate([
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalRatings: { $sum: 1 },
        averageSpeed: { $avg: '$categories.speed' },
        averageQuality: { $avg: '$categories.quality' },
        averageCommunication: { $avg: '$categories.communication' },
        averageProfessionalism: { $avg: '$categories.professionalism' }
      }
    }
  ]);
  
  return result.length > 0 ? result[0] : null;
};

// Статичний метод для отримання рейтингу за період
ratingSchema.statics.getRatingsByPeriod = async function(startDate, endDate) {
  return await this.find({
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  }).populate('ticket user');
};

// Метод для отримання детальної статистики
ratingSchema.statics.getDetailedStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
  
  const total = await this.countDocuments();
  const average = await this.getAverageRating();
  
  return {
    distribution: stats,
    total,
    average
  };
};

module.exports = mongoose.model('Rating', ratingSchema);