const mongoose = require('mongoose');

const aiSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  provider: { type: String, enum: ['openai', 'gemini'], default: 'openai' },
  openaiApiKey: { type: String, trim: true, default: '' },
  geminiApiKey: { type: String, trim: true, default: '' },
  openaiModel: { type: String, trim: true, default: 'gpt-4o-mini' },
  geminiModel: { type: String, trim: true, default: 'gemini-1.5-flash' },
  enabled: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('AISettings', aiSettingsSchema);
