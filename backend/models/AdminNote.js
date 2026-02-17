const mongoose = require('mongoose');

const adminNoteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Note title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    content: {
      type: String,
      required: [true, 'Note content is required'],
      trim: true,
      maxlength: [5000, 'Content cannot exceed 5000 characters'],
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Author is required'],
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high'],
        message: 'Priority must be one of: low, medium, high',
      },
      default: 'medium',
    },
    category: {
      type: String,
      enum: {
        values: ['personal', 'work', 'reminder', 'idea', 'todo', 'meeting', 'other'],
        message: 'Category must be one of: personal, work, reminder, idea, todo, meeting, other',
      },
      default: 'personal',
    },
    status: {
      type: String,
      enum: {
        values: ['todo', 'in_progress', 'done'],
        message: 'Status must be one of: todo, in_progress, done',
      },
      default: 'todo',
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: [50, 'Tag cannot exceed 50 characters'],
      },
    ],
    color: {
      type: String,
      enum: {
        values: ['blue', 'green', 'yellow', 'red', 'purple', 'pink', 'gray'],
        message: 'Color must be one of: blue, green, yellow, red, purple, pink, gray',
      },
      default: 'blue',
    },
    isPinned: {
      type: Boolean,
      default: false,
    },

    reminderDate: {
      type: Date,
      default: null,
    },
    isReminderSent: {
      type: Boolean,
      default: false,
    },
    attachments: [
      {
        filename: String,
        originalName: String,
        mimetype: String,
        size: Number,
        path: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    lastViewedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Віртуальні поля
adminNoteSchema.virtual('isRecent').get(function () {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.createdAt > oneDayAgo;
});

adminNoteSchema.virtual('hasReminder').get(function () {
  return this.reminderDate && this.reminderDate > new Date();
});

adminNoteSchema.virtual('isOverdue').get(function () {
  return this.reminderDate && this.reminderDate < new Date() && !this.isReminderSent;
});

adminNoteSchema.virtual('hasAttachments').get(function () {
  return this.attachments && this.attachments.length > 0;
});

adminNoteSchema.virtual('wordCount').get(function () {
  return this.content ? this.content.split(/\s+/).length : 0;
});

// Індекси
adminNoteSchema.index({ author: 1, createdAt: -1 });
adminNoteSchema.index({ priority: 1 });
adminNoteSchema.index({ category: 1 });
adminNoteSchema.index({ isPinned: 1, createdAt: -1 });

adminNoteSchema.index({ isDeleted: 1 });
adminNoteSchema.index({ tags: 1 });
adminNoteSchema.index({ status: 1 });
adminNoteSchema.index({ reminderDate: 1, isReminderSent: 1 });

// Текстовий пошук
adminNoteSchema.index({
  title: 'text',
  content: 'text',
  tags: 'text',
});

// Статичні методи
adminNoteSchema.statics.findByAuthor = function (authorId, options = {}) {
  const {
    includeDeleted = false,
    category = null,
    priority = null,
    limit = 50,
    skip = 0,
  } = options;

  const filter = { author: authorId };

  if (!includeDeleted) {
    filter.isDeleted = false;
  }

  if (category) {
    filter.category = category;
  }

  if (priority) {
    filter.priority = priority;
  }

  return this.find(filter)
    .populate('author', 'name email')
    .populate('editedBy', 'name email')
    .sort({ isPinned: -1, updatedAt: -1 })
    .limit(limit)
    .skip(skip);
};

adminNoteSchema.statics.findPinned = function (authorId) {
  return this.find({
    author: authorId,
    isPinned: true,
    isDeleted: false,
  })
    .populate('author', 'name email')
    .sort({ updatedAt: -1 });
};

adminNoteSchema.statics.findWithReminders = function () {
  const now = new Date();
  return this.find({
    reminderDate: { $lte: now },
    isReminderSent: false,
    isDeleted: false,
  })
    .populate('author', 'name email')
    .sort({ reminderDate: 1 });
};

adminNoteSchema.statics.searchNotes = function (authorId, searchTerm) {
  return this.find({
    $and: [
      { author: authorId },
      { isDeleted: false },
      {
        $or: [
          { title: { $regex: searchTerm, $options: 'i' } },
          { content: { $regex: searchTerm, $options: 'i' } },
          { tags: { $in: [new RegExp(searchTerm, 'i')] } },
        ],
      },
    ],
  })
    .populate('author', 'name email')
    .sort({ updatedAt: -1 });
};

adminNoteSchema.statics.getStatistics = function (authorId) {
  return this.aggregate([
    { $match: { author: mongoose.Types.ObjectId(authorId), isDeleted: false } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pinned: { $sum: { $cond: ['$isPinned', 1, 0] } },
        withReminders: { $sum: { $cond: [{ $ne: ['$reminderDate', null] }, 1, 0] } },
        byPriority: {
          $push: {
            priority: '$priority',
            count: 1,
          },
        },
        byCategory: {
          $push: {
            category: '$category',
            count: 1,
          },
        },
      },
    },
  ]);
};

// Методи екземпляра
adminNoteSchema.methods.pin = function () {
  this.isPinned = true;
  return this.save();
};

adminNoteSchema.methods.unpin = function () {
  this.isPinned = false;
  return this.save();
};

adminNoteSchema.methods.addTag = function (tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
  }
  return this.save();
};

adminNoteSchema.methods.removeTag = function (tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

adminNoteSchema.methods.setReminder = function (reminderDate) {
  this.reminderDate = reminderDate;
  this.isReminderSent = false;
  return this.save();
};

adminNoteSchema.methods.clearReminder = function () {
  this.reminderDate = null;
  this.isReminderSent = false;
  return this.save();
};

adminNoteSchema.methods.markReminderSent = function () {
  this.isReminderSent = true;
  return this.save();
};

adminNoteSchema.methods.incrementViewCount = function () {
  this.viewCount += 1;
  this.lastViewedAt = new Date();
  return this.save();
};

adminNoteSchema.methods.addAttachment = function (attachment) {
  this.attachments.push(attachment);
  return this.save();
};

adminNoteSchema.methods.removeAttachment = function (attachmentId) {
  this.attachments = this.attachments.filter(att => att._id.toString() !== attachmentId);
  return this.save();
};

adminNoteSchema.methods.softDelete = function (deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.isPinned = false; // Видалені нотатки не можуть бути закріпленими
  return this.save();
};

adminNoteSchema.methods.restore = function () {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

adminNoteSchema.methods.edit = function (updates, editedBy) {
  Object.assign(this, updates);
  this.isEdited = true;
  this.editedAt = new Date();
  this.editedBy = editedBy;
  return this.save();
};

// Middleware
adminNoteSchema.pre('save', function (next) {
  if (this.isModified('content') || this.isModified('title')) {
    this.updatedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('AdminNote', adminNoteSchema);
