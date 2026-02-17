const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    type: {
      type: String,
      enum: {
        values: [
          'ticket_created',
          'ticket_updated',
          'ticket_assigned',
          'ticket_resolved',
          'ticket_closed',
          'comment_added',
          'mention',
          'deadline_approaching',
          'deadline_passed',
          'system_maintenance',
          'system_update',
          'security_alert',
          'user_registered',
          'user_login',
          'password_changed',
          'user_status_change',
          'user_role_change',
          'user_registration_status_change',
          'user_activated',
          'user_deactivated',
          'user_approved',
          'user_rejected',
          'report_ready',
          'export_completed',
          'backup_completed',
          'custom',
          'announcement',
        ],
        message: 'Invalid notification type',
      },
      required: true,
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'urgent'],
        message: 'Priority must be one of: low, medium, high, urgent',
      },
      default: 'medium',
    },
    category: {
      type: String,
      enum: {
        values: ['ticket', 'system', 'user', 'security', 'report', 'general'],
        message: 'Invalid notification category',
      },
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient is required'],
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null для системних сповіщень
    },
    relatedTicket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      default: null,
    },
    relatedComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
    relatedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    channels: [
      {
        type: {
          type: String,
          enum: ['web', 'email', 'telegram', 'sms', 'push'],
          required: true,
        },
        status: {
          type: String,
          enum: ['pending', 'sent', 'delivered', 'failed', 'read'],
          default: 'pending',
        },
        sentAt: {
          type: Date,
          default: null,
        },
        deliveredAt: {
          type: Date,
          default: null,
        },
        readAt: {
          type: Date,
          default: null,
        },
        error: {
          type: String,
          default: null,
        },
        externalId: {
          type: String, // ID повідомлення в зовнішній системі (Telegram, email service)
          default: null,
        },
      },
    ],
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    actionUrl: {
      type: String,
      default: null,
    },
    actionText: {
      type: String,
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: function () {
        // За замовчуванням сповіщення зберігаються 30 днів
        return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      },
    },
    // Поле userId для сумісності з контролером (alias для recipient)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false, // Не обов'язкове, синхронізується з recipient
    },
    // Поле read для сумісності з контролером (alias для isRead)
    read: {
      type: Boolean,
      default: false,
      required: false, // Не обов'язкове, синхронізується з isRead
    },
    scheduledFor: {
      type: Date,
      default: null,
    },
    isScheduled: {
      type: Boolean,
      default: false,
    },
    retryCount: {
      type: Number,
      default: 0,
      max: 5,
    },
    lastRetryAt: {
      type: Date,
      default: null,
    },
    metadata: {
      ipAddress: String,
      userAgent: String,
      source: {
        type: String,
        enum: ['web', 'api', 'system', 'telegram'],
        default: 'system',
      },
      batchId: String, // для групових сповіщень
      templateId: String,
      variables: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Віртуальні поля
notificationSchema.virtual('isExpired').get(function () {
  return this.expiresAt && this.expiresAt < new Date();
});

notificationSchema.virtual('isOverdue').get(function () {
  return this.scheduledFor && this.scheduledFor < new Date() && !this.isRead;
});

notificationSchema.virtual('age').get(function () {
  const now = new Date();
  const created = this.createdAt || now;
  const diffMs = now - created;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} днів тому`;
  }
  if (diffHours > 0) {
    return `${diffHours} годин тому`;
  }
  return 'щойно';
});

notificationSchema.virtual('channelStatus').get(function () {
  const status = {};
  this.channels.forEach(channel => {
    status[channel.type] = channel.status;
  });
  return status;
});

// Індекси для оптимізації запитів
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 }); // Додатковий індекс для userId
notificationSchema.index({ type: 1 });
notificationSchema.index({ priority: 1 });
notificationSchema.index({ category: 1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ read: 1 }); // Додатковий індекс для read
notificationSchema.index({ expiresAt: 1 });
notificationSchema.index({ scheduledFor: 1 });
notificationSchema.index({ relatedTicket: 1 });
notificationSchema.index({ 'channels.type': 1, 'channels.status': 1 });
notificationSchema.index({ 'metadata.batchId': 1 });

// TTL індекс для автоматичного видалення застарілих сповіщень
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Middleware для синхронізації userId та recipient
notificationSchema.pre('save', function (next) {
  // Якщо встановлено userId, але не recipient - синхронізуємо
  if (this.userId && !this.recipient) {
    this.recipient = this.userId;
  }
  // Якщо встановлено recipient, але не userId - синхронізуємо
  if (this.recipient && !this.userId) {
    this.userId = this.recipient;
  }
  // Обробка читання
  if (this.isModified('isRead') && this.isRead && !this.readAt) {
    this.readAt = new Date();
  }
  // Синхронізація read та isRead
  if (this.isModified('read') && this.read !== undefined) {
    this.isRead = this.read;
  }
  if (this.isModified('isRead') && this.isRead !== undefined) {
    this.read = this.isRead;
  }
  next();
});

// Статичні методи
notificationSchema.statics.findByUser = function (userId, options = {}) {
  const { includeRead = true, category = null, type = null, limit = 50, skip = 0 } = options;

  const query = { recipient: userId };

  if (!includeRead) {
    query.isRead = false;
  }
  if (type) {
    query.type = type;
  }
  if (category) {
    query.category = category;
  }

  return this.find(query)
    .populate('sender', 'firstName lastName avatar')
    .populate('relatedTicket', 'title ticketNumber status')
    .populate('relatedComment', 'content')
    .populate('relatedUser', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

notificationSchema.statics.findUnread = function (userId) {
  return this.find({
    recipient: userId,
    isRead: false,
    isArchived: false,
  })
    .populate('sender', 'firstName lastName')
    .populate('relatedTicket', 'title ticketNumber')
    .sort({ createdAt: -1 });
};

notificationSchema.statics.findByTicket = function (ticketId) {
  return this.find({ relatedTicket: ticketId })
    .populate('recipient', 'firstName lastName email')
    .populate('sender', 'firstName lastName')
    .sort({ createdAt: -1 });
};

notificationSchema.statics.findScheduled = function () {
  return this.find({
    isScheduled: true,
    scheduledFor: { $lte: new Date() },
    'channels.status': 'pending',
  }).sort({ scheduledFor: 1 });
};

notificationSchema.statics.findFailed = function () {
  return this.find({
    'channels.status': 'failed',
    retryCount: { $lt: 5 },
  }).sort({ lastRetryAt: 1 });
};

notificationSchema.statics.getStatistics = function (userId = null, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const matchStage = { createdAt: { $gte: since } };

  if (userId) {
    matchStage.recipient = new mongoose.Types.ObjectId(userId);
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        read: { $sum: { $cond: ['$isRead', 1, 0] } },
        unread: { $sum: { $cond: ['$isRead', 0, 1] } },
        byType: {
          $push: {
            type: '$type',
            count: 1,
          },
        },
        byPriority: {
          $push: {
            priority: '$priority',
            count: 1,
          },
        },
      },
    },
  ]);
};

notificationSchema.statics.createBatch = function (notifications, batchId = null) {
  if (!batchId) {
    batchId = new mongoose.Types.ObjectId().toString();
  }

  const notificationsWithBatch = notifications.map(notification => ({
    ...notification,
    metadata: {
      ...notification.metadata,
      batchId,
    },
  }));

  return this.insertMany(notificationsWithBatch);
};

// Методи екземпляра
notificationSchema.methods.markAsRead = function () {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsUnread = function () {
  this.isRead = false;
  this.readAt = null;
  return this.save();
};

notificationSchema.methods.addChannel = function (type, status = 'pending') {
  const existingChannel = this.channels.find(c => c.type === type);
  if (!existingChannel) {
    this.channels.push({ type, status });
    return this.save();
  }
  return Promise.resolve(this);
};

notificationSchema.methods.updateChannelStatus = function (
  type,
  status,
  error = null,
  externalId = null
) {
  const channel = this.channels.find(c => c.type === type);
  if (channel) {
    channel.status = status;
    channel.error = error;
    channel.externalId = externalId;

    const now = new Date();
    if (status === 'sent' && !channel.sentAt) {
      channel.sentAt = now;
    } else if (status === 'delivered' && !channel.deliveredAt) {
      channel.deliveredAt = now;
    } else if (status === 'read' && !channel.readAt) {
      channel.readAt = now;
    }

    return this.save();
  }
  return Promise.resolve(this);
};

notificationSchema.methods.retry = function () {
  if (this.retryCount < 5) {
    this.retryCount += 1;
    this.lastRetryAt = new Date();

    // Скидаємо статус каналів з помилками
    this.channels.forEach(channel => {
      if (channel.status === 'failed') {
        channel.status = 'pending';
        channel.error = null;
      }
    });

    return this.save();
  }
  return Promise.resolve(this);
};

notificationSchema.methods.schedule = function (scheduledFor) {
  this.scheduledFor = scheduledFor;
  this.isScheduled = true;
  return this.save();
};

notificationSchema.methods.unschedule = function () {
  this.scheduledFor = null;
  this.isScheduled = false;
  return this.save();
};

module.exports = mongoose.model('Notification', notificationSchema);
