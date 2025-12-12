const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const ticketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    unique: true,
    required: false
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  status: {
    type: String,
    enum: {
      values: ['open', 'in_progress', 'resolved', 'closed', 'cancelled'],
      message: 'Status must be one of: open, in_progress, resolved, closed, cancelled'
    },
    default: 'open'
  },
  priority: {
    type: String,
    enum: {
      values: ['low', 'medium', 'high', 'urgent'],
      message: 'Priority must be one of: low, medium, high, urgent'
    },
    default: 'medium'
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: false
  },
  subcategory: {
    type: String,
    trim: true,
    maxlength: [100, 'Subcategory cannot exceed 100 characters']
  },
  type: {
    type: String,
    enum: ['incident', 'request', 'problem', 'change'],
    default: 'incident'
  },
  city: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    required: false
  },
  department: {
    type: String,
    trim: true,
    maxlength: [100, 'Department cannot exceed 100 characters']
  },
  location: {
    building: { type: String, trim: true },
    floor: { type: String, trim: true },
    room: { type: String, trim: true },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number }
    }
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },
  assignedAt: {
    type: Date,
    default: null
  },
  firstResponseAt: {
    type: Date,
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  closedAt: {
    type: Date,
    default: null
  },
  dueDate: {
    type: Date,
    default: null
  },
  estimatedHours: {
    type: Number,
    min: [0, 'Estimated hours cannot be negative'],
    default: null
  },
  actualHours: {
    type: Number,
    min: [0, 'Actual hours cannot be negative'],
    default: null
  },
  metrics: {
    responseTime: { type: Number, default: 0 }, // години
    resolutionTime: { type: Number, default: 0 }, // години
    reopenCount: { type: Number, default: 0 },
    escalationCount: { type: Number, default: 0 }
  },
  tags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tag'
  }],
  // Пов'язані статті KB
  relatedArticles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KnowledgeBase'
  }],
  attachments: [{
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    mimetype: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [1000, 'Comment cannot exceed 1000 characters']
    },
    isInternal: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    editedAt: {
      type: Date,
      default: null
    }
  }],
  watchers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Telegram інтеграція
  telegramData: {
    messageId: { type: String },
    chatId: { type: String },
    fromTelegram: { type: Boolean, default: false },
    lastTelegramUpdate: { type: Date }
  },
  
  // Історія змін статусів
  statusHistory: [{
    status: { type: String, required: true },
    changedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      required: true 
    },
    changedAt: { type: Date, default: Date.now },
    comment: { type: String, trim: true },
    reason: { type: String, trim: true }
  }],
  
  // Ескалація
  escalation: {
    level: { type: Number, default: 0 },
    escalatedAt: { type: Date },
    escalatedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    escalatedTo: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    reason: { type: String, trim: true },
    isEscalated: { type: Boolean, default: false }
  },
  
  // Email інтеграція
  emailThread: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmailThread',
    default: null
  },
  createdFromEmail: {
    type: Boolean,
    default: false
  },
  emailAddress: {
    type: String,
    trim: true,
    default: null
  },
  // Метадані
  metadata: {
    source: {
      type: String,
      enum: ['web', 'telegram', 'email', 'api', 'import', 'mobile'],
      default: 'web'
    },
    ipAddress: { type: String },
    userAgent: { type: String },
    deviceInfo: { type: String },
    browserInfo: { type: String }
  },
  
  // Рейтинг якості
  qualityRating: {
    hasRating: { type: Boolean, default: false },
    ratingRequested: { type: Boolean, default: false },
    requestedAt: { type: Date },
    rating: { 
      type: Number, 
      min: 1, 
      max: 5,
      default: null 
    },
    feedback: { 
      type: String, 
      trim: true,
      maxlength: [500, 'Відгук не може перевищувати 500 символів']
    },
    ratedAt: { type: Date },
    ratedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    }
  },
  
  // Видалення

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
ticketSchema.virtual('isOverdue').get(function() {
  if (!this.dueDate || this.status === 'closed' || this.status === 'resolved') {
    return false;
  }
  return new Date() > this.dueDate;
});

ticketSchema.virtual('timeToResolution').get(function() {
  if (!this.resolvedAt) return null;
  return Math.ceil((this.resolvedAt - this.createdAt) / (1000 * 60 * 60)); // години
});

ticketSchema.virtual('timeToFirstResponse').get(function() {
  if (!this.firstResponseAt) return null;
  return Math.ceil((this.firstResponseAt - this.createdAt) / (1000 * 60 * 60)); // години
});

ticketSchema.virtual('age').get(function() {
  const endDate = this.resolvedAt || this.closedAt || new Date();
  return Math.ceil((endDate - this.createdAt) / (1000 * 60 * 60 * 24)); // дні
});

ticketSchema.virtual('isActive').get(function() {
  return !['closed', 'cancelled'].includes(this.status) && !this.isDeleted;
});

ticketSchema.virtual('commentsCount', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'ticket',
  count: true
});

ticketSchema.virtual('attachmentsCount', {
  ref: 'Attachment',
  localField: '_id',
  foreignField: 'ticket',
  count: true
});

// Віртуальні поля для нотаток
ticketSchema.virtual('notes', {
  ref: 'Note',
  localField: '_id',
  foreignField: 'ticket'
});

ticketSchema.virtual('notesCount', {
  ref: 'Note',
  localField: '_id',
  foreignField: 'ticket',
  count: true
});

// Індекси для оптимізації запитів
ticketSchema.index({ ticketNumber: 1 });
ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ createdBy: 1, status: 1 });
ticketSchema.index({ assignedTo: 1, status: 1 });
ticketSchema.index({ city: 1, status: 1 });
ticketSchema.index({ category: 1, subcategory: 1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ dueDate: 1 });
ticketSchema.index({ tags: 1 });
ticketSchema.index({ isDeleted: 1 });

// Текстовий індекс для пошуку
ticketSchema.index({
  title: 'text',
  description: 'text',
  tags: 'text'
});

// Middleware для генерації номера тикету
ticketSchema.pre('save', async function(next) {
  if (this.isNew && !this.ticketNumber) {
    const year = new Date().getFullYear();
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      try {
        // Знаходимо останній тікет за поточний рік
        const lastTicket = await this.constructor.findOne({
          ticketNumber: { $regex: `^TK-${year}-` }
        }).sort({ ticketNumber: -1 });
        
        let nextNumber = 1;
        if (lastTicket && lastTicket.ticketNumber) {
          const lastNumber = parseInt(lastTicket.ticketNumber.split('-')[2]);
          nextNumber = lastNumber + 1;
        }
        
        this.ticketNumber = `TK-${year}-${String(nextNumber).padStart(6, '0')}`;
        
        // Перевіряємо унікальність перед збереженням
        const existingTicket = await this.constructor.findOne({ 
          ticketNumber: this.ticketNumber 
        });
        
        if (!existingTicket) {
          break; // Унікальний номер знайдено
        }
        
        attempts++;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          return next(new Error('Не вдалося згенерувати унікальний номер тікету'));
        }
      }
    }
    
    if (attempts >= maxAttempts) {
      return next(new Error('Не вдалося згенерувати унікальний номер тікету після максимальної кількості спроб'));
    }
  }
  next();
});

// Middleware для оновлення метрик
ticketSchema.pre('save', async function(next) {
  try {
    if (this.isModified('status')) {
      // Визначаємо хто змінив статус
      let changedBy = this.modifiedBy || this.assignedBy || this.createdBy;
      
      // Якщо changedBy не встановлено, використовуємо createdBy або system
      if (!changedBy && this.isNew) {
        changedBy = this.createdBy;
      }
      
      // Перевіряємо чи статус дійсно змінився
      let statusChanged = true;
      if (!this.isNew) {
        try {
          const oldTicket = await this.constructor.findById(this._id).lean();
          if (oldTicket && oldTicket.status === this.status) {
            statusChanged = false;
          }
        } catch (error) {
          // Якщо не вдалося завантажити старий документ, вважаємо що статус змінився
          statusChanged = true;
        }
      }
      
      // Додаємо запис в історію статусів тільки якщо статус змінився та changedBy встановлено
      if (statusChanged && changedBy) {
        // Перевіряємо чи останній запис в історії не має такий самий статус
        const lastHistory = this.statusHistory && this.statusHistory.length > 0 
          ? this.statusHistory[this.statusHistory.length - 1] 
          : null;
        
        if (!lastHistory || lastHistory.status !== this.status) {
          this.statusHistory.push({
            status: this.status,
            changedBy: changedBy,
            changedAt: new Date()
          });
        }
      } else if (statusChanged && !changedBy) {
        // Якщо статус змінився але changedBy не встановлено, логуємо попередження
        // та не додаємо запис в історію (щоб уникнути помилки валідації)
        console.warn(`Warning: Status changed for ticket ${this._id} but changedBy is not set`);
      }
      
      // Оновлюємо часові мітки
      if (this.status === 'resolved' && !this.resolvedAt) {
        this.resolvedAt = new Date();
        if (this.metrics) {
          this.metrics.resolutionTime = this.timeToResolution;
        }
      }
      
      if (this.status === 'closed' && !this.closedAt) {
        this.closedAt = new Date();
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Статичні методи
ticketSchema.statics.findByStatus = function(status) {
  return this.find({ status, isDeleted: false });
};

ticketSchema.statics.findByPriority = function(priority) {
  return this.find({ priority, isDeleted: false });
};

ticketSchema.statics.findByCategory = function(category) {
  return this.find({ category, isDeleted: false });
};

ticketSchema.statics.findByCity = function(cityId) {
  return this.find({ city: cityId, isDeleted: false });
};

ticketSchema.statics.findByUser = function(userId) {
  return this.find({
    $or: [
      { createdBy: userId },
      { assignedTo: userId }
    ],
    isDeleted: false
  });
};

ticketSchema.statics.findAssignedTo = function(userId) {
  return this.find({ assignedTo: userId, isDeleted: false });
};

ticketSchema.statics.findCreatedBy = function(userId) {
  return this.find({ createdBy: userId, isDeleted: false });
};

ticketSchema.statics.findOverdue = function() {
  return this.find({
    dueDate: { $lt: new Date() },
    status: { $nin: ['closed', 'resolved', 'cancelled'] },
    isDeleted: false
  });
};

ticketSchema.statics.findActive = function() {
  return this.find({
    status: { $nin: ['closed', 'cancelled'] },
    isDeleted: false
  });
};

ticketSchema.statics.getStatistics = function(filter = {}) {
  const matchStage = { isDeleted: false, ...filter };
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalTickets: { $sum: 1 },
        openTickets: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
        inProgressTickets: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
        resolvedTickets: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        closedTickets: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
        highPriorityTickets: { $sum: { $cond: [{ $in: ['$priority', ['high', 'urgent']] }, 1, 0] } },
        overdueTickets: { $sum: { $cond: [{ $and: [
          { $lt: ['$dueDate', new Date()] },
          { $nin: ['$status', ['closed', 'resolved', 'cancelled']] }
        ]}, 1, 0] } },
        averageResolutionTime: { $avg: '$metrics.resolutionTime' },
        averageResponseTime: { $avg: '$metrics.responseTime' }
      }
    }
  ]);
};

ticketSchema.statics.getStatisticsByCity = function() {
  return this.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: '$city',
        totalTickets: { $sum: 1 },
        openTickets: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
        resolvedTickets: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        averageResolutionTime: { $avg: '$metrics.resolutionTime' }
      }
    },
    {
      $lookup: {
        from: 'cities',
        localField: '_id',
        foreignField: '_id',
        as: 'cityInfo'
      }
    },
    { $unwind: '$cityInfo' }
  ]);
};

// Методи екземпляра
ticketSchema.methods.assign = function(userId, assignedBy) {
  this.assignedTo = userId;
  this.assignedBy = assignedBy;
  this.assignedAt = new Date();
  return this.save();
};

ticketSchema.methods.unassign = function() {
  this.assignedTo = null;
  this.assignedBy = null;
  this.assignedAt = null;
  return this.save();
};

ticketSchema.methods.changeStatus = function(newStatus, changedBy, comment = '') {
  const oldStatus = this.status;
  this.status = newStatus;
  
  this.statusHistory.push({
    status: newStatus,
    changedBy,
    changedAt: new Date(),
    comment
  });
  
  return this.save();
};

ticketSchema.methods.escalate = function(escalatedBy, escalatedTo, reason = '') {
  this.escalation.level += 1;
  this.escalation.escalatedAt = new Date();
  this.escalation.escalatedBy = escalatedBy;
  this.escalation.escalatedTo = escalatedTo;
  this.escalation.reason = reason;
  this.escalation.isEscalated = true;
  this.metrics.escalationCount += 1;
  
  return this.save();
};

ticketSchema.methods.addTag = function(tag) {
  if (!this.tags.includes(tag.toLowerCase())) {
    this.tags.push(tag.toLowerCase());
    return this.save();
  }
  return Promise.resolve(this);
};

ticketSchema.methods.removeTag = function(tag) {
  this.tags = this.tags.filter(t => t !== tag.toLowerCase());
  return this.save();
};

ticketSchema.methods.setDueDate = function(dueDate) {
  this.dueDate = dueDate;
  return this.save();
};



ticketSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

ticketSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

ticketSchema.methods.addComment = function(authorId, content, isInternal = false) {
  this.comments.push({
    author: authorId,
    content,
    isInternal,
    createdAt: new Date()
  });
  return this.save();
};

ticketSchema.methods.addWatcher = function(userId) {
  if (!this.watchers.includes(userId)) {
    this.watchers.push(userId);
    return this.save();
  }
  return Promise.resolve(this);
};

ticketSchema.methods.removeWatcher = function(userId) {
  this.watchers = this.watchers.filter(id => !id.equals(userId));
  return this.save();
};

// Middleware для логування змін
ticketSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Для нових тікетів логуємо створення
    this._isNewTicket = true;
    return next();
  }

  // Відстежуємо зміни для існуючих тікетів
  const modifiedFields = this.modifiedPaths();
  const changes = [];

  for (const field of modifiedFields) {
    if (field === 'updatedAt' || field === '__v') continue;

    const oldValue = this._original ? this._original[field] : null;
    const newValue = this[field];

    if (oldValue !== newValue) {
      changes.push({
        field,
        oldValue,
        newValue,
        action: this._getActionForField(field, oldValue, newValue)
      });
    }
  }

  this._pendingChanges = changes;
  next();
});

ticketSchema.post('save', async function(doc) {
  try {
    const TicketHistory = require('./TicketHistory');
    const user = this._currentUser || { _id: this.createdBy };

    if (this._isNewTicket) {
      // Логуємо створення тікету
      await TicketHistory.logChange(this._id, 'created', user, {
        description: `Тікет створено: ${this.title}`,
        metadata: {
          ticketNumber: this.ticketNumber,
          category: this.category,
          priority: this.priority,
          status: this.status
        }
      });
    } else if (this._pendingChanges && this._pendingChanges.length > 0) {
      // Логуємо зміни
      for (const change of this._pendingChanges) {
        await TicketHistory.logChange(this._id, change.action, user, {
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          description: this._getChangeDescription(change)
        });
      }
    }
  } catch (error) {
    console.error('Error logging ticket changes:', error);
  }
});

// Middleware для збереження оригінальних значень
ticketSchema.pre('findOneAndUpdate', async function() {
  const doc = await this.model.findOne(this.getQuery());
  if (doc) {
    this._original = doc.toObject();
  }
});

// Методи для визначення типу дії та опису
ticketSchema.methods._getActionForField = function(field, oldValue, newValue) {
  switch (field) {
    case 'status':
      return 'status_changed';
    case 'priority':
      return 'priority_changed';
    case 'assignedTo':
      return newValue ? 'assigned' : 'unassigned';
    case 'title':
      return 'title_changed';
    case 'description':
      return 'description_changed';
    case 'category':
      return 'category_changed';
    case 'dueDate':
      return 'due_date_changed';
    case 'tags':
      return 'tag_changed';
    default:
      return 'updated';
  }
};

ticketSchema.methods._getChangeDescription = function(change) {
  const { field, oldValue, newValue, action } = change;
  
  switch (action) {
    case 'status_changed':
      return `Статус змінено з "${oldValue}" на "${newValue}"`;
    case 'priority_changed':
      return `Пріоритет змінено з "${oldValue}" на "${newValue}"`;
    case 'assigned':
      return `Тікет призначено користувачу`;
    case 'unassigned':
      return `Призначення тікету скасовано`;
    case 'title_changed':
      return `Заголовок змінено`;
    case 'description_changed':
      return `Опис оновлено`;
    case 'category_changed':
      return `Категорію змінено з "${oldValue}" на "${newValue}"`;
    case 'due_date_changed':
      return `Термін виконання змінено`;
    default:
      return `Поле "${field}" оновлено`;
  }
};

// Метод для встановлення поточного користувача (для логування)
ticketSchema.methods.setCurrentUser = function(user) {
  this._currentUser = user;
  return this;
};

// Додаємо плагін для пагінації
ticketSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Ticket', ticketSchema);