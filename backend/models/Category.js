const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Назва категорії є обов\'язковою'],
    unique: true,
    trim: true,
    maxlength: [50, 'Назва категорії не може перевищувати 50 символів']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Опис категорії не може перевищувати 200 символів']
  },
  color: {
    type: String,
    default: '#6B7280',
    match: [/^#[0-9A-F]{6}$/i, 'Колір повинен бути в форматі HEX']
  },
  icon: {
    type: String,
    trim: true,
    maxlength: [50, 'Назва іконки не може перевищувати 50 символів']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Індекси
categorySchema.index({ name: 1 });
categorySchema.index({ isActive: 1, sortOrder: 1 });

// Middleware для оновлення updatedAt
categorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Статичні методи
categorySchema.statics.getActiveCategories = function() {
  return this.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
};

categorySchema.statics.findByName = function(name) {
  return this.findOne({ name: new RegExp(`^${name}$`, 'i') });
};

// Методи екземпляра
categorySchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

categorySchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

module.exports = mongoose.model('Category', categorySchema);