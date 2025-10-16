const mongoose = require('mongoose');

const botSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  cancelButtonText: { type: String, trim: true },
  categoryPromptText: { type: String, trim: true },
  priorityPromptText: { type: String, trim: true },
  categoryButtonRowSize: { type: Number, default: 2 },
  priorityTexts: { type: Map, of: String, default: {} },
  statusTexts: { type: Map, of: String, default: {} },
  statusEmojis: { type: Map, of: String, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('BotSettings', botSettingsSchema);