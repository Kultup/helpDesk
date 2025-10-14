const mongoose = require('mongoose');

const timeEntrySchema = new mongoose.Schema({
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: [true, 'Ticket is required']
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  startTime: {
    type: Date,
    required: [true, 'Start time is required']
  },
  endTime: {
    type: Date,
    default: null
  },
  duration: {
    type: Number, // в секундах
    min: [0, 'Duration cannot be negative'],
    default: 0
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  isActive: {
    type: Boolean,
    default: false
  },
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

// Індекси для оптимізації запитів
timeEntrySchema.index({ ticket: 1, user: 1 });
timeEntrySchema.index({ ticket: 1, isActive: 1 });
timeEntrySchema.index({ user: 1, createdAt: -1 });
timeEntrySchema.index({ startTime: 1, endTime: 1 });

// Віртуальні поля
timeEntrySchema.virtual('durationFormatted').get(function() {
  const hours = Math.floor(this.duration / 3600);
  const minutes = Math.floor((this.duration % 3600) / 60);
  return `${hours}г ${minutes}хв`;
});

// Методи схеми
timeEntrySchema.methods.stop = function() {
  if (this.isActive) {
    this.endTime = new Date();
    this.duration = Math.floor((this.endTime - this.startTime) / 1000);
    this.isActive = false;
  }
  return this;
};

timeEntrySchema.methods.calculateDuration = function() {
  if (this.startTime && this.endTime) {
    this.duration = Math.floor((this.endTime - this.startTime) / 1000);
  }
  return this.duration;
};

// Статичні методи
timeEntrySchema.statics.getActiveSession = function(ticketId, userId) {
  return this.findOne({
    ticket: ticketId,
    user: userId,
    isActive: true
  }).populate('user', 'email firstName lastName');
};

timeEntrySchema.statics.getTotalTimeForTicket = function(ticketId) {
  return this.aggregate([
    { $match: { ticket: new mongoose.Types.ObjectId(ticketId) } },
    { $group: { _id: null, totalDuration: { $sum: '$duration' } } }
  ]);
};

timeEntrySchema.statics.getUserTimeForTicket = function(ticketId, userId) {
  return this.aggregate([
    { 
      $match: { 
        ticket: new mongoose.Types.ObjectId(ticketId),
        user: new mongoose.Types.ObjectId(userId)
      } 
    },
    { $group: { _id: null, totalDuration: { $sum: '$duration' } } }
  ]);
};

// Middleware
timeEntrySchema.pre('save', function(next) {
  // Автоматично розрахувати тривалість, якщо є час початку та кінця
  if (this.startTime && this.endTime && !this.duration) {
    this.calculateDuration();
  }
  
  // Встановити updatedBy при оновленні
  if (this.isModified() && !this.isNew) {
    this.updatedBy = this.user;
  }
  
  next();
});

// Валідація: не може бути більше однієї активної сесії для користувача на тікет
timeEntrySchema.pre('save', async function(next) {
  if (this.isActive && this.isNew) {
    const existingActive = await this.constructor.findOne({
      ticket: this.ticket,
      user: this.user,
      isActive: true,
      _id: { $ne: this._id }
    });
    
    if (existingActive) {
      const error = new Error('У користувача вже є активна сесія для цього тікету');
      error.name = 'ValidationError';
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model('TimeEntry', timeEntrySchema);