const mongoose = require('mongoose');

const aiSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  provider: { type: String, enum: ['groq', 'openai'], default: 'groq' },
  groqApiKey: { type: String, trim: true, default: '' },
  openaiApiKey: { type: String, trim: true, default: '' },
  groqModel: { type: String, trim: true, default: 'llama-3.3-70b-versatile' },
  openaiModel: { type: String, trim: true, default: 'gpt-4o-mini' },
  enabled: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('AISettings', aiSettingsSchema);
