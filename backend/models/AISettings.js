const mongoose = require('mongoose');

const aiSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    provider: { type: String, enum: ['openai', 'gemini', 'groq'], default: 'openai' },
    openaiApiKey: { type: String, trim: true, default: '' },
    geminiApiKey: { type: String, trim: true, default: '' },
    groqApiKey: { type: String, trim: true, default: '' },
    openaiModel: { type: String, trim: true, default: 'gpt-4o-mini' },
    geminiModel: { type: String, trim: true, default: 'gemini-1.5-flash' },
    groqModel: { type: String, trim: true, default: 'llama-3.3-70b-versatile' },
    enabled: { type: Boolean, default: false },
    /** Місячний ліміт токенів (0 = без ліміту). Показується в боті як "залишилось по квоті". */
    monthlyTokenLimit: { type: Number, default: 0, min: 0 },
    /** Сума поповнення рахунку OpenAI (USD), для інформації. */
    topUpAmount: { type: Number, default: 0, min: 0 },
    /** Залишок по рахунку OpenAI (USD), оновлюється вручну для контролю. */
    remainingBalance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AISettings', aiSettingsSchema);
