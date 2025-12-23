const mongoose = require('mongoose');

const botSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  cancelButtonText: { type: String, trim: true },
  categoryPromptText: { type: String, trim: true },
  priorityPromptText: { type: String, trim: true },
  categoryButtonRowSize: { type: Number, default: 2 },
  priorityTexts: { type: Map, of: String, default: {} },
  statusTexts: { type: Map, of: String, default: {} },
  statusEmojis: { type: Map, of: String, default: {} },
  groqApiKey: { type: String, trim: true },
  groqModel: { type: String, trim: true, default: 'llama-3.3-70b-versatile' },
  aiEnabled: { type: Boolean, default: false },
  aiSystemPrompt: { type: String, trim: true, default: 'Ви - корисний AI асистент служби підтримки. Відповідайте на питання користувачів коротко та зрозуміло українською мовою.' }
}, { timestamps: true });

module.exports = mongoose.model('BotSettings', botSettingsSchema);