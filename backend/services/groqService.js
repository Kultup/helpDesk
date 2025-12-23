const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const BotSettings = require('../models/BotSettings');
const Category = require('../models/Category');
const fs = require('fs');

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

  async getAIResponse(userMessage, conversationHistory = [], context = {}) {
    try {
      if (!this.client) {
        await this.initialize();
      }

      if (!this.client) {
        return null;
      }

      let systemPrompt = this.settings.aiSystemPrompt || 'Ви - корисний AI асистент служби підтримки. Відповідайте на питання користувачів коротко та зрозуміло українською мовою.';
      
      if (context.tickets && context.tickets.length > 0) {
        const ticketsInfo = context.tickets.map(t => 
          `- Тікет №${t.ticketNumber || t._id}: "${t.title}" (Статус: ${t.status}, Створено: ${new Date(t.createdAt).toLocaleDateString('uk-UA')})`
        ).join('\n');
        
        systemPrompt += `\n\nІнформація про тікети користувача:\n${ticketsInfo}\n\nЯкщо користувач запитує про статус своїх заявок, використовуй ці дані.`;
      }

      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        ...conversationHistory,
        {
          role: 'user',
          content: userMessage
        }
      ];

      const chatCompletion = await this.client.chat.completions.create({
        messages: messages,
        model: this.settings.groqModel || 'llama-3.3-70b-versatile',
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

  /**
   * Аналізує намір користувача та витягує дані для тікета
   */
  async analyzeIntent(userMessage) {
    try {
      if (!this.client) {
        await this.initialize();
      }

      if (!this.client) {
        return { isTicketIntent: false };
      }

      // Отримуємо активні категорії
      const activeCategories = await Category.find({ isActive: true }).select('name _id');
      const categoryList = activeCategories.map(c => `"${c.name}" (ID: ${c._id})`).join(', ');

      const systemPrompt = `
        Ви - аналізатор намірів користувача для системи HelpDesk. 
        Ваше завдання - визначити, чи хоче користувач створити заявку (тікет) або повідомити про проблему.
        
        Доступні категорії: [${categoryList}]
        Доступні пріоритети: "low", "medium", "high", "urgent"
        
        Поверніть відповідь ТІЛЬКИ у форматі JSON:
        {
          "isTicketIntent": boolean, // чи є намір створити тікет/повідомити про проблему
          "title": string | null,    // короткий заголовок (до 50 символів)
          "description": string | null, // детальний опис проблеми
          "categoryId": string | null, // ID категорії зі списку вище, яка найкраще підходить
          "priority": string | null, // пріоритет (low, medium, high, urgent)
          "confidence": number // впевненість від 0 до 1
        }
        
        Якщо користувач просто вітається або задає загальне питання, isTicketIntent = false.
        Якщо користувач описує технічну проблему (не працює інтернет, зламався принтер тощо), isTicketIntent = true.
        Для пріоритету: "high" - критично для роботи багатьох, "urgent" - аварія/зупинка роботи.
      `;

      const chatCompletion = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        model: 'llama-3.1-8b-instant', // Використовуємо меншу швидшу модель для аналізу
        temperature: 0.1, // Низька температура для стабільності JSON
        response_format: { type: 'json_object' }
      });

      const responseText = chatCompletion.choices[0]?.message?.content;
      if (!responseText) return { isTicketIntent: false };

      const result = JSON.parse(responseText);
      logger.info('Результат аналізу наміру AI:', result);
      return result;
    } catch (error) {
      logger.error('Помилка аналізу наміру через Groq:', error);
      return { isTicketIntent: false };
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

  /**
   * Транскрибує аудіофайл за допомогою Groq Whisper
   */
  async transcribeAudio(filePath) {
    try {
      if (!this.client) {
        await this.initialize();
      }

      if (!this.client) {
        return null;
      }

      const transcription = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: 'whisper-large-v3',
        response_format: 'json',
        language: 'uk' // Пріоритет для української
      });

      return transcription.text;
    } catch (error) {
      logger.error('Помилка транскрибації аудіо через Groq:', error);
      return null;
    }
  }
}

module.exports = new GroqService();
