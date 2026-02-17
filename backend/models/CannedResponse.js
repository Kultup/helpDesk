const mongoose = require('mongoose');

/**
 * Модель для шаблонів відповідей (Canned Responses)
 * Дозволяє адмінам швидко відповідати на типові питання
 */
const cannedResponseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Назва шаблону є обов'язковою"],
      trim: true,
      maxlength: [100, 'Назва не може перевищувати 100 символів'],
    },
    content: {
      type: String,
      required: [true, "Зміст шаблону є обов'язковим"],
      trim: true,
      maxlength: [2000, 'Зміст не може перевищувати 2000 символів'],
    },
    category: {
      type: String,
      enum: ['Hardware', 'Software', 'Network', 'Access', 'Other'],
      default: 'Other',
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    shortcuts: [
      {
        type: String,
        trim: true,
        lowercase: true,
        // Наприклад: '/printer-restart', '/пр'
      },
    ],
    language: {
      type: String,
      enum: ['uk', 'en', 'ru'],
      default: 'uk',
    },
    isPublic: {
      type: Boolean,
      default: true, // Доступно всім адмінам
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Статистика використання
    usageCount: {
      type: Number,
      default: 0,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    // Рейтинг корисності (від адмінів)
    helpfulCount: {
      type: Number,
      default: 0,
    },
    notHelpfulCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Віртуальне поле для рейтингу корисності
cannedResponseSchema.virtual('helpfulRating').get(function () {
  const total = this.helpfulCount + this.notHelpfulCount;
  if (total === 0) {
    return 0;
  }
  return Math.round((this.helpfulCount / total) * 100);
});

// Індекси для швидкого пошуку
cannedResponseSchema.index({ title: 'text', content: 'text', tags: 'text' });
cannedResponseSchema.index({ category: 1, isActive: 1 });
cannedResponseSchema.index({ shortcuts: 1 });
cannedResponseSchema.index({ usageCount: -1 });

// Статичні методи
cannedResponseSchema.statics.findByShortcut = function (shortcut) {
  return this.findOne({
    shortcuts: shortcut.toLowerCase(),
    isActive: true,
  });
};

cannedResponseSchema.statics.findByCategory = function (category) {
  return this.find({
    category,
    isActive: true,
  }).sort({ usageCount: -1 });
};

cannedResponseSchema.statics.getMostUsed = function (limit = 10) {
  return this.find({ isActive: true }).sort({ usageCount: -1 }).limit(limit);
};

cannedResponseSchema.statics.search = function (query) {
  return this.find({
    $text: { $search: query },
    isActive: true,
  }).sort({ score: { $meta: 'textScore' } });
};

// Методи екземпляра
cannedResponseSchema.methods.incrementUsage = function () {
  this.usageCount += 1;
  this.lastUsedAt = new Date();
  return this.save();
};

cannedResponseSchema.methods.markHelpful = function (isHelpful) {
  if (isHelpful) {
    this.helpfulCount += 1;
  } else {
    this.notHelpfulCount += 1;
  }
  return this.save();
};

module.exports = mongoose.model('CannedResponse', cannedResponseSchema);
