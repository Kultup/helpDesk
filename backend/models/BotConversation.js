const mongoose = require('mongoose');

const botConversationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  telegramChatId: {
    type: String,
    required: true,
    index: true
  },
  /** Якщо з діалогу створено тікет */
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    default: null,
    index: true
  },
  /** Короткий опис для списку (перше повідомлення або тема) */
  subject: {
    type: String,
    trim: true,
    maxlength: [200, 'Subject cannot exceed 200 characters'],
    default: ''
  },
  messageCount: {
    type: Number,
    default: 0
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

botConversationSchema.index({ lastMessageAt: -1 });
botConversationSchema.index({ user: 1, lastMessageAt: -1 });

module.exports = mongoose.model('BotConversation', botConversationSchema);
