const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const BotSettings = require('../models/BotSettings');

class GroqService {
  constructor() {
    this.client = null;
    this.settings = null;
  }

  async initialize() {
    try {
      this.settings = await BotSettings.findOne({ key: 'default' });

      if (!this.settings?.groqApiKey) {
        logger.warn('Groq API ключ не налаштовано');
        return false;
      }

      if (!this.settings.aiEnabled) {
        logger.info('AI асистент вимкнено в налаштуваннях');
        return false;
      }

      this.client = new Groq({
        apiKey: this.settings.groqApiKey
      });

      logger.info('✅ Groq AI сервіс ініціалізовано');
      return true;
    } catch (error) {
      logger.error('Помилка ініціалізації Groq сервісу:', error);
      return false;
    }
  }

  async getAIResponse(userMessage, conversationHistory = []) {
    try {
      if (!this.client) {
        await this.initialize();
      }

      if (!this.client) {
        return null;
      }

      const messages = [
        {
          role: 'system',
          content: this.settings.aiSystemPrompt || 'Ви - корисний AI асистент служби підтримки. Відповідайте на питання користувачів коротко та зрозуміло українською мовою.'
        },
        ...conversationHistory,
        {
          role: 'user',
          content: userMessage
        }
      ];

      const chatCompletion = await this.client.chat.completions.create({
        messages: messages,
        model: this.settings.groqModel || 'llama3-8b-8192',
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 1,
        stream: false
      });

      const response = chatCompletion.choices[0]?.message?.content;

      if (!response) {
        logger.warn('Groq повернув порожню відповідь');
        return null;
      }

      return response;
    } catch (error) {
      logger.error('Помилка отримання відповіді від Groq:', error);
      return null;
    }
  }

  async reloadSettings() {
    try {
      this.settings = await BotSettings.findOne({ key: 'default' });

      if (this.settings?.groqApiKey && this.settings.aiEnabled) {
        this.client = new Groq({
          apiKey: this.settings.groqApiKey
        });
        logger.info('✅ Налаштування Groq оновлено');
        return true;
      } else {
        this.client = null;
        logger.info('Groq AI вимкнено');
        return false;
      }
    } catch (error) {
      logger.error('Помилка перезавантаження налаштувань Groq:', error);
      return false;
    }
  }

  isEnabled() {
    return this.client !== null && this.settings?.aiEnabled === true;
  }
}

module.exports = new GroqService();
