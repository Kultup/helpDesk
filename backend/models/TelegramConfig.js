const mongoose = require('mongoose');

const telegramConfigSchema = new mongoose.Schema({
  key: { 
    type: String, 
    default: 'default', 
    unique: true 
  },
  botToken: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  chatId: {
    type: String,
    trim: true,
    default: ''
  },
  webhookUrl: {
    type: String,
    trim: true,
    default: ''
  },
  isEnabled: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true 
});

// Індекс для швидкого пошуку
telegramConfigSchema.index({ key: 1 });

module.exports = mongoose.model('TelegramConfig', telegramConfigSchema);

