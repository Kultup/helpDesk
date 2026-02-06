const mongoose = require('mongoose');

const botSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  cancelButtonText: { type: String, trim: true },
  priorityPromptText: { type: String, trim: true },
  priorityTexts: { type: Map, of: String, default: {} },
  statusTexts: { type: Map, of: String, default: {} },
  statusEmojis: { type: Map, of: String, default: {} },
  
  // Вибір AI провайдера
  aiProvider: { 
    type: String, 
    enum: ['groq', 'openai'], 
    default: 'groq',
    trim: true 
  },
  
  // Groq налаштування
  groqApiKey: { type: String, trim: true },
  groqModel: { type: String, trim: true, default: 'llama-3.3-70b-versatile' },
  
  // OpenAI налаштування
  openaiApiKey: { type: String, trim: true },
  openaiModel: { type: String, trim: true, default: 'gpt-4o-mini' },
  
  // Загальні налаштування AI
  aiEnabled: { type: Boolean, default: false },
  aiSystemPrompt: { type: String, trim: true, default: '' },
  
  // AI Промпти для різних сценаріїв
  aiPrompts: {
    // Промпт для аналізу наміру користувача
    intentAnalysis: { 
      type: String, 
      trim: true,
      default: '' // Буде використовуватись дефолтний з коду якщо порожній
    },
    
    // Промпт для генерації уточнюючих питань
    questionGeneration: { 
      type: String, 
      trim: true,
      default: ''
    },
    
    // Промпт для аналізу тікета та SLA
    ticketAnalysis: { 
      type: String, 
      trim: true,
      default: ''
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('BotSettings', botSettingsSchema);