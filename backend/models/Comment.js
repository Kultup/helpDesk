const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    trim: true,
    maxlength: [2000, 'Comment cannot exceed 2000 characters']
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
      values: ['comment', 'status_change', 'assignment', 'priority_change', 'system'],
      message: 'Invalid comment type'
    },
    default: 'comment'
  },
  isInternal: {
    type: Boolean,
    default: false
  },
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
      required: true,
      max: [10485760, 'File size cannot exceed 10MB'] // 10MB
    },
    path: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  mentions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notified: {
      type: Boolean,
      default: false
    }
  }],
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      enum: ['👍', '👎', '❤️', '😊', '😢', '😡', '🎉', '🤔'],
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  metadata: {
    ipAddress: String,
    userAgent: String,
    source: {
      type: String,
      enum: ['web', 'telegram', 'api', 'system'],
      default: 'web'
    },
    telegramMessageId: Number
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
commentSchema.virtual('isRecent').get(function() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return this.createdAt > oneHourAgo;
});

commentSchema.virtual('canEdit').get(function() {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  return this.createdAt > twoHoursAgo && !this.isDeleted;
});

commentSchema.virtual('attachmentCount').get(function() {
  return this.attachments ? this.attachments.length : 0;
});

commentSchema.virtual('reactionCount').get(function() {
  return this.reactions ? this.reactions.length : 0;
});

// Індекси для оптимізації запитів
commentSchema.index({ ticket: 1, createdAt: -1 });
commentSchema.index({ author: 1, createdAt: -1 });
commentSchema.index({ type: 1 });
commentSchema.index({ isDeleted: 1 });
commentSchema.index({ 'mentions.user': 1 });

// Middleware для обробки видалення
commentSchema.pre('save', function(next) {
  if (this.isModified('content') && !this.isNew) {
    this.isEdited = true;
    this.editedAt = new Date();
  }
  next();
});

// Статичні методи
commentSchema.statics.findByTicket = function(ticketId, includeDeleted = false) {
  const query = { ticket: ticketId };
  if (!includeDeleted) {
    query.isDeleted = false;
  }
  return this.find(query)
    .populate('author', 'firstName lastName email avatar')
    .populate('editedBy', 'firstName lastName')
    .populate('deletedBy', 'firstName lastName')
    .populate('mentions.user', 'firstName lastName email')
    .populate('reactions.user', 'firstName lastName')
    .sort({ createdAt: 1 });
};

commentSchema.statics.findByAuthor = function(authorId, limit = 50) {
  return this.find({ author: authorId, isDeleted: false })
    .populate('ticket', 'title ticketNumber status')
    .sort({ createdAt: -1 })
    .limit(limit);
};

commentSchema.statics.findRecent = function(hours = 24, limit = 100) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({ 
    createdAt: { $gte: since },
    isDeleted: false,
    type: 'comment'
  })
    .populate('author', 'firstName lastName')
    .populate('ticket', 'title ticketNumber')
    .sort({ createdAt: -1 })
    .limit(limit);
};

commentSchema.statics.findWithAttachments = function(ticketId = null) {
  const query = {
    'attachments.0': { $exists: true },
    isDeleted: false
  };
  
  if (ticketId) {
    query.ticket = ticketId;
  }
  
  return this.find(query)
    .populate('author', 'firstName lastName')
    .populate('ticket', 'title ticketNumber')
    .sort({ createdAt: -1 });
};

commentSchema.statics.getStatistics = function(ticketId = null) {
  const matchStage = { isDeleted: false };
  if (ticketId) {
    matchStage.ticket = new mongoose.Types.ObjectId(ticketId);
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalComments: { $sum: 1 },
        totalAttachments: { $sum: { $size: '$attachments' } },
        totalReactions: { $sum: { $size: '$reactions' } },
        commentsByType: {
          $push: {
            type: '$type',
            count: 1
          }
        },
        avgCommentsPerDay: {
          $avg: {
            $divide: [
              { $subtract: [new Date(), '$createdAt'] },
              1000 * 60 * 60 * 24
            ]
          }
        }
      }
    }
  ]);
};

// Методи екземпляра
commentSchema.methods.addReaction = function(userId, emoji) {
  // Видаляємо попередню реакцію користувача
  this.reactions = this.reactions.filter(r => !r.user.equals(userId));
  
  // Додаємо нову реакцію
  this.reactions.push({
    user: userId,
    emoji: emoji
  });
  
  return this.save();
};

commentSchema.methods.removeReaction = function(userId) {
  this.reactions = this.reactions.filter(r => !r.user.equals(userId));
  return this.save();
};

commentSchema.methods.addMention = function(userId) {
  const existingMention = this.mentions.find(m => m.user.equals(userId));
  if (!existingMention) {
    this.mentions.push({ user: userId });
    return this.save();
  }
  return Promise.resolve(this);
};

commentSchema.methods.markMentionAsNotified = function(userId) {
  const mention = this.mentions.find(m => m.user.equals(userId));
  if (mention) {
    mention.notified = true;
    return this.save();
  }
  return Promise.resolve(this);
};

commentSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

commentSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

commentSchema.methods.edit = function(newContent, editedBy) {
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  this.editedBy = editedBy;
  return this.save();
};

commentSchema.methods.getReactionSummary = function() {
  const summary = {};
  this.reactions.forEach(reaction => {
    summary[reaction.emoji] = (summary[reaction.emoji] || 0) + 1;
  });
  return summary;
};

module.exports = mongoose.model('Comment', commentSchema);