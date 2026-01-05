const mongoose = require('mongoose');

const telegramMessageSchema = new mongoose.Schema({
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: [4000, 'Повідомлення не може перевищувати 4000 символів']
  },
  direction: {
    type: String,
    enum: ['admin_to_user', 'user_to_admin'],
    required: true
  },
  telegramMessageId: {
    type: String,
    default: null // ID повідомлення в Telegram
  },
  telegramChatId: {
    type: String,
    default: null
  },
  commentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
  sentAt: {
    type: Date,
    default: Date.now
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  // Метадані для додаткової інформації
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Індекси для швидкого пошуку
telegramMessageSchema.index({ ticketId: 1, createdAt: -1 });
telegramMessageSchema.index({ senderId: 1, createdAt: -1 });
telegramMessageSchema.index({ recipientId: 1, createdAt: -1 });
telegramMessageSchema.index({ ticketId: 1, direction: 1 });

// Віртуальне поле для перевірки, чи повідомлення недавнє
telegramMessageSchema.virtual('isRecent').get(function() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.createdAt > fiveMinutesAgo;
});

module.exports = mongoose.model('TelegramMessage', telegramMessageSchema);

