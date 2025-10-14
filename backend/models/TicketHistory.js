const mongoose = require('mongoose');

const ticketHistorySchema = new mongoose.Schema({
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'created',
      'updated',
      'status_changed',
      'priority_changed',
      'assigned',
      'unassigned',
      'comment_added',
      'attachment_added',
      'attachment_removed',
      'tag_added',
      'tag_removed',
      'note_added',
      'note_updated',
      'note_removed',
      'time_logged',
      'due_date_changed',
      'category_changed',
      'title_changed',
      'description_changed',
      'watcher_added',
      'watcher_removed',
      'escalated',
      'reopened',
      'closed',
      'resolved'
    ]
  },
  field: {
    type: String,
    required: false // Поле, яке було змінено (status, priority, assignedTo, тощо)
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed, // Попереднє значення
    required: false
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed, // Нове значення
    required: false
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed, // Додаткові дані (наприклад, IP адреса, user agent)
    default: {}
  },
  isSystemGenerated: {
    type: Boolean,
    default: false // true для автоматичних змін (наприклад, SLA порушення)
  },
  isVisible: {
    type: Boolean,
    default: true // false для прихованих системних записів
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false // Використовуємо власне поле createdAt
});

// Індекси для оптимізації запитів
ticketHistorySchema.index({ ticket: 1, createdAt: -1 });
ticketHistorySchema.index({ user: 1, createdAt: -1 });
ticketHistorySchema.index({ action: 1, createdAt: -1 });

// Статичні методи
ticketHistorySchema.statics.logChange = async function(ticketId, action, user, options = {}) {
  const {
    field = null,
    oldValue = null,
    newValue = null,
    description = '',
    metadata = {},
    isSystemGenerated = false,
    isVisible = true
  } = options;

  const historyEntry = new this({
    ticket: ticketId,
    action,
    field,
    oldValue,
    newValue,
    user: user._id || user,
    description,
    metadata,
    isSystemGenerated,
    isVisible
  });

  return await historyEntry.save();
};

// Метод для отримання історії тікету з пагінацією
ticketHistorySchema.statics.getTicketHistory = async function(ticketId, options = {}) {
  const {
    page = 1,
    limit = 20,
    includeHidden = false,
    actions = null,
    user = null,
    startDate = null,
    endDate = null
  } = options;

  const query = { ticket: ticketId };
  
  if (!includeHidden) {
    query.isVisible = true;
  }
  
  if (actions && actions.length > 0) {
    query.action = { $in: actions };
  }
  
  if (user) {
    query.user = user;
  }
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;
  
  const [history, total] = await Promise.all([
    this.find(query)
      .populate('user', 'firstName lastName email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    history,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Метод для отримання статистики змін
ticketHistorySchema.statics.getChangeStats = async function(ticketId) {
  const stats = await this.aggregate([
    { $match: { ticket: new mongoose.Types.ObjectId(ticketId), isVisible: true } },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        lastChange: { $max: '$createdAt' },
        users: { $addToSet: '$user' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'users',
        foreignField: '_id',
        as: 'userDetails'
      }
    },
    {
      $project: {
        action: '$_id',
        count: 1,
        lastChange: 1,
        users: {
          $map: {
            input: '$userDetails',
            as: 'user',
            in: {
              _id: '$$user._id',
              firstName: '$$user.firstName',
              lastName: '$$user.lastName',
              email: '$$user.email'
            }
          }
        }
      }
    }
  ]);

  return stats;
};

// Віртуальні поля
ticketHistorySchema.virtual('formattedDescription').get(function() {
  // Форматування опису для відображення
  switch (this.action) {
    case 'status_changed':
      return `Статус змінено з "${this.oldValue}" на "${this.newValue}"`;
    case 'priority_changed':
      return `Пріоритет змінено з "${this.oldValue}" на "${this.newValue}"`;
    case 'assigned':
      return `Тікет призначено користувачу`;
    case 'unassigned':
      return `Призначення тікету скасовано`;
    case 'comment_added':
      return `Додано коментар`;
    case 'attachment_added':
      return `Додано файл: ${this.newValue}`;
    case 'tag_added':
      return `Додано тег: ${this.newValue}`;
    case 'tag_removed':
      return `Видалено тег: ${this.oldValue}`;
    default:
      return this.description || this.action;
  }
});

// Middleware для автоматичного логування змін
ticketHistorySchema.pre('save', function(next) {
  if (this.isNew && !this.description) {
    this.description = this.formattedDescription;
  }
  next();
});

module.exports = mongoose.model('TicketHistory', ticketHistorySchema);