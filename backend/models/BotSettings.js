const mongoose = require('mongoose');

const botSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    cancelButtonText: { type: String, trim: true },
    priorityPromptText: { type: String, trim: true },
    priorityTexts: { type: Map, of: String, default: {} },
    statusTexts: { type: Map, of: String, default: {} },
    statusEmojis: { type: Map, of: String, default: {} },
    // Для оцінки тікета: { "1": { gifs: ["url"], stickers: ["file_id"] }, "2": {...}, ... }
    ratingMedia: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BotSettings', botSettingsSchema);
