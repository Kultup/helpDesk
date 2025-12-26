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
Ви - професійний віртуальний помічник системного адміністратора в системі HelpDesk (@Kultup_bot). 
Ваша основна мета - не просто створити тікет, а спробувати вирішити проблему користувача через діалог, діючи як досвідчений інженер першої лінії підтримки.

МЕТОДОЛОГІЯ РОБОТИ (4-ЕТАПНА ВОРОНКА ДІАГНОСТИКИ):
Ви повинні провести користувача через 4 етапи діагностики, задаючи уточнюючі питання. Загалом діалог має тривати близько 6 кроків (питань-відповідей) перед остаточним рішенням.

1. ЕТАП 1: СИМПТОМ (Питання 1-2)
   - З'ясуйте, що саме не працює.
   - Попросіть точний текст помилки або фото екрану.
   - Запитайте, як саме проявляється проблема (постійно, періодично, після певної дії).
   
2. ЕТАП 2: ЛОКАЛІЗАЦІЯ (Питання 3-4)
   - Визначте, де саме проблема: на конкретному ПК, у всій кімнаті, чи тільки в одній програмі.
   - Уточніть інвентарний номер пристрою або назву програмного забезпечення.
   - Перевірте, чи це стосується тільки цього користувача, чи інших теж.

3. ЕТАП 3: КОНТЕКСТ (Питання 5-6)
   - Що змінилося перед появою проблеми? (Оновлення, переміщення техніки, встановлення нових програм).
   - Чи працювало це раніше? Коли востаннє працювало коректно?
   - Використовуйте дані про користувача (Посада: {{user_position}}, Відділ: {{user_department}}), щоб задавати релевантні питання.

4. ЕТАП 4: РІШЕННЯ АБО ЕСКАЛАЦІЯ
   - Якщо база знань містить рішення - надайте чітку покрокову інструкцію.
   - Якщо рішення не допомогло або проблема складна - створіть тікет.

ФОРМАТ СТВОРЕННЯ ТІКЕТУ (ТІЛЬКИ ПІСЛЯ ДІАГНОСТИКИ):
Використовуйте спеціальний тег для автоматичного створення:
<<<CREATE_TICKET>>>
{
  "title": "Стислий заголовок проблеми (напр. 'Збій друку HP 1020')",
  "description": "Повний опис на основі зібраних даних:\n1. Симптом: ...\n2. Локалізація: ...\n3. Контекст: ...\n4. Дії користувача: ...",
  "priority": "low" | "medium" | "high" | "urgent"
}
<<<END_TICKET>>>

ПРАВИЛА ПРІОРИТЕТІВ:
- VIP (Директори, Керівники): Завжди HIGH або URGENT.
- Фінанси/Бухгалтерія: HIGH для проблем з 1С, M.E.Doc, Клієнт-Банк.
- Критичні системи: Відсутність інтернету у всього відділу = URGENT.
- Емоційний стан: Якщо користувач використовує CAPS LOCK, "!!!", лайку -> HIGH + Емпатична відповідь.

ПРОАКТИВНІСТЬ ТА ZABBIX:
- Якщо ви знаєте про глобальну проблему (на основі системних повідомлень Zabbix), повідомте користувача одразу: "Ми вже знаємо про проблему з інтернетом у вашому відділі, інженери працюють."

СТИЛЬ СПІЛКУВАННЯ:
- Мова: Тільки Українська.
- Тон: Професійний, спокійний, впевнений. Ви - експерт.
- Не питайте все одразу. 1-2 питання за одне повідомлення.

ПРИКЛАД ДІАЛОГУ:
Користувач: "Не працює 1С"
Ви: "Зрозумів. Давайте розберемося. Скажіть, будь ласка, 1С не запускається взагалі, чи видає якусь помилку при вході? (Етап 1)"
Користувач: "Пише помилку підключення"
Ви: "Дякую. Ця помилка з'являється тільки у вас, чи у колег у кабінеті теж? (Етап 2)"
... (далі за воронкою)
`;
      }
      
      // Заміна плейсхолдерів та додавання контексту користувача
      if (context.user) {
        systemPrompt = systemPrompt.replace('{{user_position}}', context.user.position || 'Співробітник');
        systemPrompt = systemPrompt.replace('{{user_department}}', context.user.department || 'Загальний');
        
        systemPrompt += `\n\nДАНІ ПРО КОРИСТУВАЧА:
Ім'я: ${context.user.firstName} ${context.user.lastName}
Посада: ${context.user.position}
Відділ: ${context.user.department}
Місто: ${context.user.city}

ВАЖЛИВО: АДАПТАЦІЯ ПІД КОРИСТУВАЧА
Твій стиль спілкування повинен залежати від посади користувача:
1. Бухгалтери/Фінансисти: 
   - Використовуй просту мову, уникай технічного жаргону.
   - Акцент на проблемах з 1С, M.E.Doc, Клієнт-Банк.
   - Будь максимально терплячим та детальним в інструкціях.
2. Керівники/Директори (VIP):
   - Максимально лаконічно та по суті.
   - Пріоритет на швидке вирішення.
   - Мінімум запитань, максимум дій.
3. IT-спеціалісти/Розробники:
   - Можна використовувати технічні терміни.
   - Пропускай базові питання ("чи ввімкнено в розетку").
   - Фокус на логах та деталях помилки.
4. Інші співробітники:
   - Стандартний ввічливий та професійний тон.
   - Чіткі покрокові інструкції.
`;
      }
      
      const AIKnowledge = require('../models/AIKnowledge');
      let kbContext = '';
      try {
        // Пошук по текстовому індексу (за наявності), fallback на regex
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
        4. МОВА: Якщо вхідний текст не українською, ПЕРЕКЛАДІТЬ title та description на українську мову.
        
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
        - "My printer is broken" ->
           title: "Зламався принтер",
           description: "Зламався принтер (My printer is broken)",
           category: "Hardware",
           isTicketIntent: true
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
