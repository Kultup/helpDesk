const mongoose = require('mongoose');

const quickTipSchema = new mongoose.Schema({
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
quickTipSchema.index({ isActive: 1 });
quickTipSchema.index({ priority: -1 });
quickTipSchema.index({ tags: 1 });

// Віртуальне поле для рейтингу корисності
quickTipSchema.virtual('helpfulnessRatio').get(function() {
  const total = this.helpfulCount + this.notHelpfulCount;
  if (total === 0) return 0;
  return (this.helpfulCount / total) * 100;
});

// Статичний метод для пошуку порад
quickTipSchema.statics.searchTips = function(query) {
  const searchCriteria = {
    isActive: true,
    $or: [
      { title: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } },
      { tags: { $in: [new RegExp(query, 'i')] } }
    ]
  };

  return this.find(searchCriteria)
    .sort({ priority: -1, helpfulCount: -1 })
    .lean();
};

module.exports = mongoose.model('QuickTip', quickTipSchema);