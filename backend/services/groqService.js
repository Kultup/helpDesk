const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const BotSettings = require('../models/BotSettings');
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

      let systemPrompt = this.settings.aiSystemPrompt;
      
      if (!systemPrompt) {
        systemPrompt = `
Ви - інтелектуальний асистент системи HelpDesk (@Kultup_bot). Ваша мета - допомагати користувачам вирішувати технічні питання та надавати інформацію про їхні заявки.

ОСНОВНІ ПРАВИЛА:
1. МОВА: Спілкуйтеся виключно українською мовою.
2. ТОН: Будьте ввічливим, професійним, лаконічним та емпатичним.
3. БАЗА ЗНАНЬ: Якщо у контексті є інформація з бази знань (Knowledge Base), ВИКОРИСТОВУЙТЕ її для відповіді. Це перевірена інформація.

ФУНКЦІОНАЛ БОТА (що ви можете порадити):
- 📝 Створити заявку: Команда /create або просто описати проблему (текстом чи голосом).
- 📋 Мої заявки: Команда /tickets - перегляд списку створених заявок та їх статусу.
- 🏠 Головне меню: Команда /start або /menu - повернення до початкового екрану.
- 📞 Контакти: Бот має кнопку "Поділитися контактом" для реєстрації.
- 🎤 Голосові: Бот розуміє голосові повідомлення та перетворює їх на текст.
- 📸 Фото: Можна додавати фото до заявок при створенні.

ЯК ВІДПОВІДАТИ:
- Якщо користувач повідомляє про проблему (наприклад, "не працює принтер"):
  1. Спочатку перевірте, чи є рішення в БАЗІ ЗНАНЬ (надається в контексті). Якщо є - дайте коротку інструкцію.
  2. Якщо рішення немає, попросіть деталі або запропонуйте створити заявку (/create).
  
- Якщо користувач запитує статус:
  1. Використовуйте надану вам інформацію про тікети (з контексту).
  2. Якщо інформації немає, порадьте використати команду /tickets.

- Якщо користувач хоче поговорити з людиною:
  1. Порадьте звернутися до адміністратора @Kultup.

ОБМЕЖЕННЯ:
- Ви НЕ можете прямо змінювати статус заявок, закривати їх чи видаляти.
- Ви НЕ можете змінювати паролі користувачів.
- Ви НЕ бачите особистих повідомлень інших користувачів.
- Не вигадуйте неіснуючі функції (наприклад, "зателефонувати через бота").

ПРИКЛАДИ ВІДПОВІДЕЙ:
- Користувач: "Не працює інтернет"
  Ви: (Якщо є в базі знань) "Згідно з інструкцією, спробуйте перезавантажити роутер Cisco (кнопка ззаду). Якщо не допоможе - створіть заявку."
  (Якщо немає) "Спробуйте перезавантажити роутер. Якщо не допоможе, я можу створити заявку. Опишіть детальніше, де саме немає інтернету, або введіть /create."
`;
      }
      
      // RAG: Пошук у базі знань
      const KnowledgeBase = require('../models/KnowledgeBase');
      let kbContext = '';
      try {
        // Простий пошук за ключовими словами (в ідеалі - векторний пошук)
        const keywords = userMessage.split(' ').filter(w => w.length > 3).slice(0, 5);
        if (keywords.length > 0) {
            const regex = new RegExp(keywords.join('|'), 'i');
            const docs = await KnowledgeBase.find({ 
                isActive: true,
                $or: [{ title: regex }, { content: regex }, { tags: regex }]
            }).limit(3);
            
            if (docs.length > 0) {
                kbContext = `\n\nДОВІДКОВА ІНФОРМАЦІЯ З БАЗИ ЗНАНЬ (Використовуйте це для відповіді):\n`;
                docs.forEach(doc => {
                    kbContext += `--- ${doc.title} ---\n${doc.content.substring(0, 500)}...\n\n`;
                });
            }
        }
      } catch (kbError) {
        logger.error('Помилка пошуку в базі знань:', kbError);
      }

      if (context.tickets && context.tickets.length > 0) {
        const ticketsInfo = context.tickets.map(t => 
          `- Тікет №${t.ticketNumber || t._id}: "${t.title}" (Статус: ${t.status}, Створено: ${new Date(t.createdAt).toLocaleDateString('uk-UA')})`
        ).join('\n');
        
        systemPrompt += `\n\nІнформація про тікети користувача:\n${ticketsInfo}\n\nЯкщо користувач запитує про статус своїх заявок, використовуй ці дані.`;
      }
      
      if (kbContext) {
          systemPrompt += kbContext;
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

      const systemPrompt = `
        Ви - аналізатор намірів користувача для системи HelpDesk. 
        Ваше завдання - точно проаналізувати повідомлення користувача та визначити, чи повідомляє він про проблему.
        
        ВАЖЛИВО:
        1. Заголовок (title) повинен ТОЧНО відображати суть проблеми.
        2. НЕ вигадуйте проблеми.
        3. Опис (description) повинен містити деталі.
        
        Доступні пріоритети: "low", "medium", "high", "urgent"
        
        Поверніть відповідь ТІЛЬКИ у форматі JSON:
        {
          "isTicketIntent": boolean,
          "title": string | null,
          "description": string | null,
          "priority": string | null,
          "confidence": number,
          "category": string | null, // Hardware, Software, Network, Access, Other
          "sentiment": string | null, // positive, neutral, negative
          "ticketType": string | null // incident (зламалося), request (потрібно щось нове)
        }
        
        Приклади:
        - "Не працює телефон, я дуже злий!" -> 
           title: "Не працює телефон", 
           category: "Hardware", 
           sentiment: "negative", 
           ticketType: "incident",
           priority: "high"
      `;

      const chatCompletion = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        model: 'llama-3.3-70b-versatile', // Використовуємо потужнішу модель для кращої точності
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
