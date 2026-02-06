const OpenAI = require('openai');
const logger = require('../utils/logger');
const BotSettings = require('../models/BotSettings');
const AIApiUsage = require('../models/AIApiUsage');
const slaLearningService = require('./slaLearningService');
const fs = require('fs');

class OpenAIService {
  constructor() {
    this.client = null;
    this.settings = null;
    this.adminTelegramId = '6070910226'; // ID адміна для сповіщень
  }

  async initialize() {
    try {
      this.settings = await BotSettings.findOne({ key: 'default' });

      if (!this.settings?.openaiApiKey) {
        logger.warn('OpenAI API ключ не налаштовано');
        return false;
      }

      if (!this.settings.aiEnabled) {
        logger.info('AI асистент вимкнено в налаштуваннях');
        return false;
      }

      this.client = new OpenAI({
        apiKey: this.settings.openaiApiKey
      });

      logger.info('✅ OpenAI сервіс ініціалізовано');
      
      // Логуємо чи є кастомні промпти
      if (this.settings.aiPrompts) {
        const customPrompts = [];
        if (this.settings.aiPrompts.intentAnalysis) customPrompts.push('intentAnalysis');
        if (this.settings.aiPrompts.questionGeneration) customPrompts.push('questionGeneration');
        if (this.settings.aiPrompts.ticketAnalysis) customPrompts.push('ticketAnalysis');
        
        if (customPrompts.length > 0) {
          logger.info(`📝 Використовуються кастомні промпти: ${customPrompts.join(', ')}`);
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Помилка ініціалізації OpenAI сервісу:', error);
      return false;
    }
  }

  isEnabled() {
    return !!this.client && !!this.settings?.openaiApiKey && this.settings?.aiEnabled;
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
1. МОВА: Спілкуйтеся виключно українською мовою. Якщо користувач пише іншою мовою (англійська, російська тощо) - відповідайте українською, але розумійте суть запиту.
2. ПЕРЕКЛАД: Якщо користувач просить створити заявку іншою мовою, перекладіть опис проблеми на українську перед створенням, але в дужках залиште оригінал.
3. ТОН: Будьте ввічливим, професійним, лаконічним та емпатичним.
4. БАЗА ЗНАНЬ: Якщо у контексті є інформація з бази знань (Knowledge Base), ВИКОРИСТОВУЙТЕ її для відповіді. Це перевірена інформація.

ФУНКЦІОНАЛ БОТА (що ви можете порадити):
- 📝 Створити заявку: Команда /create або просто описати проблему (текстом чи голосом).
- 📋 Мої заявки: Команда /tickets - перегляд списку створених заявок та їх статусу.
- 🏠 Головне меню: Команда /start або /menu - повернення до початкового екрану.
- 📞 Контакти: Бот має кнопку "Поділитися контактом" для реєстрації.
- 🎤 Голосові: Бот розуміє голосові повідомлення та перетворює їх на текст.
- 📸 Фото: Можна додавати фото до заявок при створенні.
`;
      }
      
      // Додаємо контекст з AI Knowledge Base
      const AIKnowledge = require('../models/AIKnowledge');
      let kbContext = '';
      try {
        const q = userMessage.trim();
        let docs = [];
        if (q.length > 3) {
          try {
            docs = await AIKnowledge.find({ isActive: true, $text: { $search: q } })
              .sort({ score: { $meta: 'textScore' }, updatedAt: -1 })
              .limit(3);
          } catch (_err) {
            const keywords = q.split(' ').filter(w => w.length > 3).slice(0, 5);
            if (keywords.length > 0) {
              const regex = new RegExp(keywords.join('|'), 'i');
              docs = await AIKnowledge.find({ isActive: true, $or: [{ title: regex }, { content: regex }, { tags: regex }] }).limit(3);
            }
          }
        }
        if (docs.length > 0) {
          kbContext = `\n\nДОВІДКОВА ІНФОРМАЦІЯ З AI ЗНАНЬ (використай це для відповіді):\n`;
          docs.forEach(doc => {
            const snippet = typeof doc.content === 'string' ? doc.content.substring(0, 500) : '';
            kbContext += `--- ${doc.title} ---\n${snippet}...\n\n`;
          });
        }
      } catch (kbError) {
        logger.error('Помилка пошуку AI знань:', kbError);
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
        model: this.settings.openaiModel || 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 1
      });

      const response = chatCompletion.choices[0]?.message?.content;

      if (!response) {
        logger.warn('OpenAI повернув порожню відповідь');
        return null;
      }

      // Трекінг використання API
      await this.trackApiUsage(
        this.settings.openaiModel || 'gpt-4o-mini', 
        chatCompletion,
        { tokensUsed: chatCompletion.usage?.total_tokens || 0 }
      );

      return response;
    } catch (error) {
      logger.error('Помилка отримання відповіді від OpenAI:', error);
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

      const customPrompt = this.settings?.aiPrompts?.intentAnalysis;
      const systemPrompt = customPrompt || `
Ви - аналізатор намірів користувача для системи HelpDesk. 
Ваше завдання - точно проаналізувати повідомлення користувача та визначити, чи повідомляє він про проблему.

Поверніть результат у форматі JSON:
{
  "isTicketIntent": true/false,
  "title": "короткий опис проблеми",
  "description": "детальний опис",
  "priority": "low/medium/high/critical",
  "category": "hardware/software/network/other"
}
`;

      const chatCompletion = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        model: this.settings.openaiModel || 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const responseText = chatCompletion.choices[0]?.message?.content;
      const result = JSON.parse(responseText);

      await this.trackApiUsage(
        this.settings.openaiModel || 'gpt-4o-mini',
        chatCompletion,
        { tokensUsed: chatCompletion.usage?.total_tokens || 0 }
      );

      return result;
    } catch (error) {
      logger.error('Помилка аналізу наміру через OpenAI:', error);
      return { isTicketIntent: false };
    }
  }

  /**
   * Генерує наступне питання для уточнення проблеми
   */
  async generateNextQuestion(conversation, ticketData = {}) {
    try {
      if (!this.client) {
        await this.initialize();
      }

      if (!this.client) {
        return null;
      }

      const customPrompt = this.settings?.aiPrompts?.questionGeneration;
      const systemPrompt = customPrompt || `
Ви - асистент, який допомагає користувачу створити детальну заявку.
Проаналізуйте діалог та згенеруйте ОДНЕ найважливіше уточнююче питання.
Питання має бути конкретним та допомагати зібрати важливу інформацію для вирішення проблеми.
`;

      const context = `
Поточні дані заявки:
${JSON.stringify(ticketData, null, 2)}

Діалог:
${conversation}
`;

      const chatCompletion = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: context }
        ],
        model: this.settings.openaiModel || 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 200
      });

      const question = chatCompletion.choices[0]?.message?.content;

      await this.trackApiUsage(
        this.settings.openaiModel || 'gpt-4o-mini',
        chatCompletion,
        { tokensUsed: chatCompletion.usage?.total_tokens || 0 }
      );

      return question;
    } catch (error) {
      logger.error('Помилка генерації питання через OpenAI:', error);
      return null;
    }
  }

  /**
   * Аналізує тікет та генерує рекомендації
   */
  async analyzeTicket(ticket, options = {}) {
    try {
      if (!this.client) {
        await this.initialize();
      }

      if (!this.client) {
        return null;
      }

      const customPrompt = this.settings?.aiPrompts?.ticketAnalysis;
      const systemPrompt = customPrompt || `
Проаналізуйте технічну заявку та поверніть результат у форматі JSON:
{
  "suggestedCategory": "категорія",
  "suggestedPriority": "пріоритет",
  "suggestedSLA": "SLA в годинах",
  "recommendedActions": ["дія1", "дія2"],
  "possibleSolution": "можливе рішення",
  "tags": ["тег1", "тег2"]
}
`;

      const ticketInfo = `
Заявка:
Заголовок: ${ticket.title}
Опис: ${ticket.description}
${ticket.category ? `Категорія: ${ticket.category}` : ''}
${ticket.priority ? `Пріоритет: ${ticket.priority}` : ''}
`;

      const chatCompletion = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: ticketInfo }
        ],
        model: this.settings.openaiModel || 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const responseText = chatCompletion.choices[0]?.message?.content;
      const analysis = JSON.parse(responseText);

      await this.trackApiUsage(
        this.settings.openaiModel || 'gpt-4o-mini',
        chatCompletion,
        { tokensUsed: chatCompletion.usage?.total_tokens || 0 }
      );

      return analysis;
    } catch (error) {
      logger.error('Помилка аналізу тікета через OpenAI:', error);
      return null;
    }
  }

  /**
   * Генерує звіт на основі аналітики
   */
  async generateReport(tickets, analyticsData, options = {}) {
    try {
      if (!this.client) {
        await this.initialize();
      }

      if (!this.client) {
        return null;
      }

      const systemPrompt = `
Ви - аналітик системи HelpDesk. Згенеруйте детальний звіт українською мовою на основі даних.
Включіть статистику, тренди, рекомендації та висновки.
`;

      const dataContext = `
Загальна статистика:
- Всього заявок: ${tickets.length}
- Аналітика: ${JSON.stringify(analyticsData, null, 2)}
`;

      const chatCompletion = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: dataContext }
        ],
        model: this.settings.openaiModel || 'gpt-4o',
        temperature: 0.7,
        max_tokens: 2000
      });

      const report = chatCompletion.choices[0]?.message?.content;

      await this.trackApiUsage(
        this.settings.openaiModel || 'gpt-4o',
        chatCompletion,
        { tokensUsed: chatCompletion.usage?.total_tokens || 0 }
      );

      return report;
    } catch (error) {
      logger.error('Помилка генерації звіту через OpenAI:', error);
      return null;
    }
  }

  /**
   * Генерує FAQ на основі тікетів
   */
  async generateFAQ(tickets, options = {}) {
    try {
      if (!this.client) {
        await this.initialize();
      }

      if (!this.client) {
        return null;
      }

      const systemPrompt = `
Згенеруйте FAQ українською мовою на основі найчастіших проблем з тікетів.
Поверніть у форматі JSON:
{
  "faq": [
    {
      "question": "питання",
      "answer": "відповідь",
      "category": "категорія"
    }
  ]
}
`;

      const ticketsData = tickets.slice(0, 50).map(t => ({
        title: t.title,
        description: t.description,
        category: t.category
      }));

      const chatCompletion = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(ticketsData, null, 2) }
        ],
        model: this.settings.openaiModel || 'gpt-4o',
        temperature: 0.7,
        response_format: { type: 'json_object' }
      });

      const responseText = chatCompletion.choices[0]?.message?.content;
      const result = JSON.parse(responseText);

      await this.trackApiUsage(
        this.settings.openaiModel || 'gpt-4o',
        chatCompletion,
        { tokensUsed: chatCompletion.usage?.total_tokens || 0 }
      );

      return result;
    } catch (error) {
      logger.error('Помилка генерації FAQ через OpenAI:', error);
      return null;
    }
  }

  /**
   * Транскрибує аудіофайл за допомогою OpenAI Whisper
   */
  async transcribeAudio(filePath) {
    try {
      if (!this.client) {
        await this.initialize();
      }

      if (!this.client) {
        throw new Error('OpenAI клієнт не ініціалізовано');
      }

      const transcription = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: 'whisper-1',
        language: 'uk'
      });

      // Трекінг (Whisper не повертає usage, тому встановлюємо приблизно)
      await this.trackApiUsage('whisper-1', null, { tokensUsed: 0 });

      return transcription.text;
    } catch (error) {
      logger.error('Помилка транскрибації аудіо через OpenAI:', error);
      throw error;
    }
  }

  /**
   * Аналізує аналітичні дані
   */
  async analyzeAnalytics(tickets, analyticsData, options = {}) {
    try {
      if (!this.client) {
        await this.initialize();
      }

      if (!this.client) {
        return null;
      }

      const systemPrompt = `
Проаналізуйте аналітику HelpDesk та поверніть insights у форматі JSON українською:
{
  "trends": ["тренд1", "тренд2"],
  "insights": ["інсайт1", "інсайт2"],
  "recommendations": ["рекомендація1", "рекомендація2"],
  "summary": "короткий висновок"
}
`;

      const dataContext = `
Дані для аналізу:
${JSON.stringify({ ticketsCount: tickets.length, analytics: analyticsData }, null, 2)}
`;

      const chatCompletion = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: dataContext }
        ],
        model: this.settings.openaiModel || 'gpt-4o-mini',
        temperature: 0.5,
        response_format: { type: 'json_object' }
      });

      const responseText = chatCompletion.choices[0]?.message?.content;
      const analysis = JSON.parse(responseText);

      await this.trackApiUsage(
        this.settings.openaiModel || 'gpt-4o-mini',
        chatCompletion,
        { tokensUsed: chatCompletion.usage?.total_tokens || 0 }
      );

      return analysis;
    } catch (error) {
      logger.error('Помилка аналізу аналітики через OpenAI:', error);
      return null;
    }
  }

  /**
   * Перезавантажує налаштування
   */
  async reloadSettings() {
    try {
      this.settings = await BotSettings.findOne({ key: 'default' });
      
      if (this.settings?.openaiApiKey && this.settings.aiEnabled) {
        this.client = new OpenAI({
          apiKey: this.settings.openaiApiKey
        });
        logger.info('✅ Налаштування OpenAI оновлено');
      } else {
        this.client = null;
        logger.info('OpenAI AI вимкнено');
      }
    } catch (error) {
      logger.error('Помилка перезавантаження налаштувань OpenAI:', error);
    }
  }

  /**
   * Трекінг використання API
   */
  async trackApiUsage(model, completion, additionalData = {}) {
    try {
      const usage = await AIApiUsage.getTodayUsage('openai');
      
      const tokensUsed = completion?.usage?.total_tokens || additionalData.tokensUsed || 0;
      const promptTokens = completion?.usage?.prompt_tokens || 0;
      const completionTokens = completion?.usage?.completion_tokens || 0;

      await usage.updateUsage(model, {
        tokensUsed,
        promptTokens,
        completionTokens
      });

      // Перевірка лімітів (якщо потрібно)
      if (usage.shouldNotify()) {
        await this.sendLimitNotification(usage);
        await usage.markNotified('warning');
      }

    } catch (error) {
      logger.error('Помилка трекінгу використання OpenAI API:', error);
    }
  }

  /**
   * Відправляє сповіщення про ліміти
   */
  async sendLimitNotification(usageData) {
    try {
      const telegramService = require('./telegramService');
      if (!telegramService.bot) return;

      let message = `⚠️ <b>Попередження: Ліміт OpenAI API</b>\n\n`;
      message += `Використано:\n`;
      message += `📊 Токени: ${usageData.tokensUsed.toLocaleString()}\n`;
      message += `📈 Запити: ${usageData.requestCount}\n\n`;
      message += `Рекомендуємо контролювати використання API.`;

      await telegramService.bot.sendMessage(this.adminTelegramId, message, {
        parse_mode: 'HTML'
      });

      logger.info('📨 Відправлено сповіщення про ліміт OpenAI API');
    } catch (error) {
      logger.error('Помилка відправки сповіщення про ліміт:', error);
    }
  }

  /**
   * Отримує статистику використання
   */
  async getUsageStats(days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = await AIApiUsage.find({
        provider: 'openai',
        date: { $gte: startDate }
      }).sort({ date: -1 });

      return stats;
    } catch (error) {
      logger.error('Помилка отримання статистики OpenAI:', error);
      return [];
    }
  }
}

module.exports = new OpenAIService();
