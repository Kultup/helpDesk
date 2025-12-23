const mongoose = require('mongoose');

const botSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  cancelButtonText: { type: String, trim: true },
  priorityPromptText: { type: String, trim: true },
  priorityTexts: { type: Map, of: String, default: {} },
  statusTexts: { type: Map, of: String, default: {} },
  statusEmojis: { type: Map, of: String, default: {} },
  groqApiKey: { type: String, trim: true },
  groqModel: { type: String, trim: true, default: 'llama-3.3-70b-versatile' },
  aiEnabled: { type: Boolean, default: false },
  aiSystemPrompt: { type: String, trim: true, default: 'Ви - корисний AI асистент служби підтримки HelpDesk. Ваше завдання - допомагати користувачам вирішувати технічні питання. Якщо ви бачите, що користувач описує проблему, яку потрібно зафіксувати як офіційну заявку (тікет), активно пропонуйте її створити. Ви можете сказати щось на кшталт: "Я можу створити для вас офіційний тікет, щоб технічні спеціалісти зайнялися цим". Також повідомляйте користувачу, що він може створити тікет просто написавши "Створи тікет: [назва проблеми]". Відповідайте ввічливо, коротко та зрозуміло українською мовою. Використовуйте Markdown для форматування.' }
}, { timestamps: true });

module.exports = mongoose.model('BotSettings', botSettingsSchema);