const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Note content is required'],
    trim: true,
    maxlength: [5000, 'Note cannot exceed 5000 characters']
  },
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: [true, 'Ticket reference is required']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Author is required']
  },
  type: {
    type: String,
    enum: {
      values: ['note', 'reminder', 'solution', 'investigation'],
      message: 'Invalid note type'
    },
    default: 'note'
  },
  isPrivate: {
    type: Boolean,
    default: true // Нотатки за замовчуванням приватні
  },
  priority: {
    type: String,
    enum: {
      values: ['low', 'medium', 'high'],
      message: 'Priority must be one of: low, medium, high'
    },
    default: 'medium'
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  editedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reminderDate: {
    type: Date,
    default: null
  },
  isReminderSent: {
    type: Boolean,
    default: false
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    source: {
      type: String,
      enum: ['web', 'telegram', 'api', 'system'],
      default: 'web'
    }
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Віртуальні поля
noteSchema.virtual('isRecent').get(function() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.createdAt > oneDayAgo;
});

noteSchema.virtual('canEdit').get(function() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return this.createdAt > oneHourAgo && !this.isEdited;
});

noteSchema.virtual('hasReminder').get(function() {
  return this.reminderDate && this.reminderDate > new Date();
});

// Індекси
noteSchema.index({ ticket: 1, createdAt: -1 });
noteSchema.index({ author: 1, createdAt: -1 });
noteSchema.index({ type: 1 });
noteSchema.index({ isDeleted: 1 });
noteSchema.index({ reminderDate: 1, isReminderSent: 1 });
noteSchema.index({ tags: 1 });

// Текстовий пошук
noteSchema.index({
  content: 'text',
  tags: 'text'
});

// Middleware
noteSchema.pre('save', function(next) {
  if (this.isModified('content') && !this.isNew) {
    this.isEdited = true;
    this.editedAt = new Date();
  }
  next();
});

// Статичні методи
noteSchema.statics.findByTicket = function(ticketId, includeDeleted = false) {
  const filter = { ticket: ticketId };
  if (!includeDeleted) {
    filter.isDeleted = false;
  }
  return this.find(filter)
    .populate('author', 'name email')
    .sort({ createdAt: -1 });
};

noteSchema.statics.findByAuthor = function(authorId, limit = 50) {
  return this.find({ 
    author: authorId, 
    isDeleted: false 
  })
    .populate('ticket', 'title ticketNumber')
    .sort({ createdAt: -1 })
    .limit(limit);
};

noteSchema.statics.findByType = function(type, ticketId = null) {
  const filter = { type, isDeleted: false };
  if (ticketId) {
    filter.ticket = ticketId;
  }
  return this.find(filter)
    .populate('author', 'name email')
    .populate('ticket', 'title ticketNumber')
    .sort({ createdAt: -1 });
};

noteSchema.statics.findWithReminders = function() {
  return this.find({
    reminderDate: { $lte: new Date() },
    isReminderSent: false,
    isDeleted: false
  })
    .populate('author', 'name email')
    .populate('ticket', 'title ticketNumber');
};

noteSchema.statics.getStatistics = function(ticketId = null) {
  const matchStage = { isDeleted: false };
  if (ticketId) {
    matchStage.ticket = new mongoose.Types.ObjectId(ticketId);
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        byType: {
          $push: {
            type: '$type',
            count: 1
          }
        },
        byAuthor: {
          $push: {
            author: '$author',
            count: 1
          }
        },
        recent: {
          $sum: {
            $cond: [
              { $gte: ['$createdAt', new Date(Date.now() - 24 * 60 * 60 * 1000)] },
              1,
              0
            ]
          }
        }
      }
    }
  ]);
};

// Методи екземпляра
noteSchema.methods.setReminder = function(reminderDate) {
  this.reminderDate = reminderDate;
  this.isReminderSent = false;
  return this.save();
};

noteSchema.methods.markReminderSent = function() {
  this.isReminderSent = true;
  return this.save();
};

noteSchema.methods.addTag = function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
  }
  return this.save();
};

noteSchema.methods.removeTag = function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

noteSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

noteSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

noteSchema.methods.edit = function(newContent, editedBy) {
  this.content = newContent;
  this.editedBy = editedBy;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Note', noteSchema);