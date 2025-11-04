const mongoose = require('mongoose');

const emailThreadSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  inReplyTo: {
    type: String,
    default: null,
    trim: true
  },
  threadId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  from: {
    email: {
      type: String,
      required: true,
      trim: true
    },
    name: {
      type: String,
      trim: true
    }
  },
  to: [{
    email: {
      type: String,
      required: true,
      trim: true
    },
    name: {
      type: String,
      trim: true
    }
  }],
  cc: [{
    email: {
      type: String,
      trim: true
    },
    name: {
      type: String,
      trim: true
    }
  }],
  bcc: [{
    email: {
      type: String,
      trim: true
    },
    name: {
      type: String,
      trim: true
    }
  }],
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: [500, 'Subject cannot exceed 500 characters']
  },
  body: {
    html: {
      type: String,
      default: ''
    },
    text: {
      type: String,
      default: ''
    }
  },
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    default: null,
    index: true
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
      required: true
    },
    path: {
      type: String,
      required: true
    }
  }],
  isInternal: {
    type: Boolean,
    default: false
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true
  },
  // Метадані
  receivedAt: {
    type: Date,
    default: Date.now
  },
  sentAt: {
    type: Date,
    default: Date.now
  },
  headers: {
    type: Map,
    of: String,
    default: {}
  },
  // Статус обробки
  isProcessed: {
    type: Boolean,
    default: false
  },
  processedAt: {
    type: Date,
    default: null
  },
  // Помилки
  error: {
    type: String,
    default: null
  },
  retryCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Індекси
emailThreadSchema.index({ ticket: 1, receivedAt: -1 });
emailThreadSchema.index({ threadId: 1, receivedAt: -1 });
emailThreadSchema.index({ 'from.email': 1 });
emailThreadSchema.index({ direction: 1, isProcessed: 1 });

// Методи
emailThreadSchema.methods.addToTicket = function(ticketId) {
  this.ticket = ticketId;
  this.isProcessed = true;
  this.processedAt = new Date();
  return this.save();
};

emailThreadSchema.methods.markAsProcessed = function() {
  this.isProcessed = true;
  this.processedAt = new Date();
  return this.save();
};

emailThreadSchema.methods.incrementRetry = function() {
  this.retryCount += 1;
  return this.save();
};

emailThreadSchema.methods.setError = function(errorMessage) {
  this.error = errorMessage;
  this.incrementRetry();
  return this.save();
};

// Статичні методи
emailThreadSchema.statics.findByThreadId = function(threadId) {
  return this.find({ threadId }).sort({ receivedAt: 1 });
};

emailThreadSchema.statics.findByTicket = function(ticketId) {
  return this.find({ ticket: ticketId }).sort({ receivedAt: 1 });
};

emailThreadSchema.statics.findUnprocessed = function(limit = 10) {
  return this.find({ isProcessed: false }).limit(limit).sort({ receivedAt: 1 });
};

module.exports = mongoose.model('EmailThread', emailThreadSchema);

