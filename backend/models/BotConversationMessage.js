const mongoose = require('mongoose');

const botConversationMessageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BotConversation',
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: [8000, 'Content cannot exceed 8000 characters']
  },
  /** ID повідомлення в Telegram (якщо є) */
  telegramMessageId: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

botConversationMessageSchema.index({ conversation: 1, createdAt: 1 });

module.exports = mongoose.model('BotConversationMessage', botConversationMessageSchema);
