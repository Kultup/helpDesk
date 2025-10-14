const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Назва тегу є обов\'язковою'],
    unique: true,
    trim: true,
    maxlength: [50, 'Назва тегу не може перевищувати 50 символів'],
    minlength: [2, 'Назва тегу повинна містити принаймні 2 символи']
  },
  color: {
    type: String,
    required: [true, 'Колір тегу є обов\'язковим'],
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Колір повинен бути у форматі HEX']
  },
  description: {
    type: String,
    maxlength: [200, 'Опис не може перевищувати 200 символів'],
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  usageCount: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Індекси для оптимізації пошуку
tagSchema.index({ name: 1 });
tagSchema.index({ isActive: 1 });
tagSchema.index({ usageCount: -1 });

// Віртуальне поле для отримання тікетів з цим тегом
tagSchema.virtual('tickets', {
  ref: 'Ticket',
  localField: '_id',
  foreignField: 'tags'
});

// Методи моделі
tagSchema.methods.incrementUsage = function() {
  this.usageCount += 1;
  return this.save();
};

tagSchema.methods.decrementUsage = function() {
  if (this.usageCount > 0) {
    this.usageCount -= 1;
  }
  return this.save();
};

tagSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

tagSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

// Статичні методи
tagSchema.statics.findByName = function(name) {
  return this.findOne({ 
    name: new RegExp(name, 'i'), 
    isActive: true 
  });
};

tagSchema.statics.getMostUsed = function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ usageCount: -1 })
    .limit(limit);
};

tagSchema.statics.getByColor = function(color) {
  return this.find({ 
    color: color, 
    isActive: true 
  });
};

// Middleware для валідації перед збереженням
tagSchema.pre('save', function(next) {
  // Перетворюємо назву тегу на нижній регістр для уніфікації
  if (this.isModified('name')) {
    this.name = this.name.toLowerCase();
  }
  next();
});

// Middleware для видалення тегу з усіх тікетів при видаленні
tagSchema.pre('remove', async function(next) {
  try {
    const Ticket = mongoose.model('Ticket');
    await Ticket.updateMany(
      { tags: this._id },
      { $pull: { tags: this._id } }
    );
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Tag', tagSchema);