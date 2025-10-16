const mongoose = require('mongoose');

const quickTipSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  steps: [{
    type: String,
    required: true,
    maxlength: 200
  }],
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  isActive: {
    type: Boolean,
    default: true
  },
  helpfulCount: {
    type: Number,
    default: 0
  },
  notHelpfulCount: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String,
    trim: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Індекси для швидкого пошуку
quickTipSchema.index({ category: 1, isActive: 1 });
quickTipSchema.index({ priority: -1 });
quickTipSchema.index({ tags: 1 });

// Віртуальне поле для рейтингу корисності
quickTipSchema.virtual('helpfulnessRatio').get(function() {
  const total = this.helpfulCount + this.notHelpfulCount;
  if (total === 0) return 0;
  return (this.helpfulCount / total) * 100;
});

// Статичний метод для отримання порад по категорії
quickTipSchema.statics.getByCategoryId = function(categoryId, limit = 5) {
  return this.find({ 
    category: categoryId, 
    isActive: true 
  })
  .sort({ priority: -1, helpfulCount: -1 })
  .limit(limit)
  .lean();
};

// Статичний метод для пошуку порад
quickTipSchema.statics.searchTips = function(query, categoryId = null) {
  const searchCriteria = {
    isActive: true,
    $or: [
      { title: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } },
      { tags: { $in: [new RegExp(query, 'i')] } }
    ]
  };

  if (categoryId) {
    searchCriteria.category = categoryId;
  }

  return this.find(searchCriteria)
    .sort({ priority: -1, helpfulCount: -1 })
    .lean();
};

module.exports = mongoose.model('QuickTip', quickTipSchema);