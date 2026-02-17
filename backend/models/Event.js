const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: '',
    },
    date: {
      type: Date,
      required: [true, 'Event date is required'],
    },
    type: {
      type: String,
      enum: {
        values: ['deadline', 'meeting', 'reminder', 'holiday', 'task', 'appointment'],
        message: 'Type must be one of: deadline, meeting, reminder, holiday, task, appointment',
      },
      default: 'reminder',
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'urgent'],
        message: 'Priority must be one of: low, medium, high, urgent',
      },
      default: 'medium',
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Author is required'],
    },
    isAllDay: {
      type: Boolean,
      default: true,
    },
    startTime: {
      type: String, // Format: "HH:MM"
      default: null,
    },
    endTime: {
      type: String, // Format: "HH:MM"
      default: null,
    },
    location: {
      type: String,
      trim: true,
      maxlength: [200, 'Location cannot exceed 200 characters'],
      default: '',
    },
    attendees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    reminderMinutes: {
      type: Number,
      default: 0, // 0 = no reminder
      min: [0, 'Reminder minutes cannot be negative'],
    },
    isReminderSent: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: {
        values: ['scheduled', 'completed', 'cancelled'],
        message: 'Status must be one of: scheduled, completed, cancelled',
      },
      default: 'scheduled',
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: [50, 'Tag cannot exceed 50 characters'],
      },
    ],
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrencePattern: {
      type: String,
      required: false,
      default: null,
      validate: {
        validator: function (value) {
          // Allow null, undefined, or empty string
          if (value === null || value === undefined || value === '') {
            return true;
          }
          // If value is provided, it must be one of the allowed values
          return ['daily', 'weekly', 'monthly', 'yearly'].includes(value);
        },
        message: 'Recurrence pattern must be one of: daily, weekly, monthly, yearly',
      },
    },
    recurrenceEnd: {
      type: Date,
      default: null,
    },
    parentEvent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
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
eventSchema.virtual('isUpcoming').get(function () {
  return this.date > new Date() && this.status === 'scheduled';
});

eventSchema.virtual('isPast').get(function () {
  return this.date < new Date();
});

eventSchema.virtual('isToday').get(function () {
  const today = new Date();
  const eventDate = new Date(this.date);
  return eventDate.toDateString() === today.toDateString();
});

eventSchema.virtual('hasReminder').get(function () {
  return this.reminderMinutes > 0;
});

// Індекси
eventSchema.index({ date: 1 });
eventSchema.index({ author: 1, date: -1 });
eventSchema.index({ type: 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ isDeleted: 1 });
eventSchema.index({ tags: 1 });
eventSchema.index({ reminderMinutes: 1, isReminderSent: 1, date: 1 });

// Текстовий пошук
eventSchema.index({
  title: 'text',
  description: 'text',
  location: 'text',
  tags: 'text',
});

// Статичні методи
eventSchema.statics.findByAuthor = function (authorId, startDate = null, endDate = null) {
  const filter = { author: authorId, isDeleted: false };

  if (startDate && endDate) {
    filter.date = { $gte: startDate, $lte: endDate };
  } else if (startDate) {
    filter.date = { $gte: startDate };
  } else if (endDate) {
    filter.date = { $lte: endDate };
  }

  return this.find(filter)
    .populate('author', 'name email')
    .populate('attendees', 'name email')
    .sort({ date: 1 });
};

eventSchema.statics.findByDateRange = function (startDate, endDate, authorId = null) {
  const filter = {
    date: { $gte: startDate, $lte: endDate },
    isDeleted: false,
  };

  if (authorId) {
    filter.author = authorId;
  }

  return this.find(filter)
    .populate('author', 'name email')
    .populate('attendees', 'name email')
    .sort({ date: 1 });
};

eventSchema.statics.findUpcoming = function (authorId, limit = 10) {
  return this.find({
    author: authorId,
    date: { $gte: new Date() },
    status: 'scheduled',
    isDeleted: false,
  })
    .populate('author', 'name email')
    .populate('attendees', 'name email')
    .sort({ date: 1 })
    .limit(limit);
};

eventSchema.statics.findWithReminders = function () {
  const now = new Date();
  return this.find({
    reminderMinutes: { $gt: 0 },
    isReminderSent: false,
    status: 'scheduled',
    isDeleted: false,
    date: { $gte: now },
  })
    .populate('author', 'name email')
    .sort({ date: 1 });
};

// Методи екземпляра
eventSchema.methods.markCompleted = function () {
  this.status = 'completed';
  return this.save();
};

eventSchema.methods.cancel = function () {
  this.status = 'cancelled';
  return this.save();
};

eventSchema.methods.addAttendee = function (userId) {
  if (!this.attendees.includes(userId)) {
    this.attendees.push(userId);
  }
  return this.save();
};

eventSchema.methods.removeAttendee = function (userId) {
  this.attendees = this.attendees.filter(id => !id.equals(userId));
  return this.save();
};

eventSchema.methods.addTag = function (tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
  }
  return this.save();
};

eventSchema.methods.removeTag = function (tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

eventSchema.methods.softDelete = function (deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

eventSchema.methods.restore = function () {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

eventSchema.methods.markReminderSent = function () {
  this.isReminderSent = true;
  return this.save();
};

module.exports = mongoose.model('Event', eventSchema);
