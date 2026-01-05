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
- Користувач: "My printer is broken"
  Ви: "Я розумію, що у вас зламався принтер. Спробуйте перевірити підключення. Якщо не допоможе, створіть заявку командою /create."
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
   * Аналізує тікет та надає рекомендації
   * @param {Object} ticket - Об'єкт тікета з полями title, description, status, priority, comments, history
   * @param {Object} context - Додатковий контекст (користувач, місто, заклад тощо)
   * @returns {Promise<Object>} - Результат аналізу з рекомендаціями
   */
  async analyzeTicket(ticket, context = {}) {
    try {
      if (!this.client) {
        await this.initialize();
      }

      if (!this.client) {
        return null;
      }

      const systemPrompt = `
Ви - експерт-аналітик системи HelpDesk. Ваше завдання - проаналізувати заявку (тікет) та надати корисні рекомендації для її вирішення.

ОСНОВНІ ЗАВДАННЯ:
1. Проаналізувати опис проблеми та визначити ймовірну причину
2. Запропонувати кроки для діагностики та вирішення
3. Визначити, чи потрібна додаткова інформація від користувача
4. Оцінити правильність встановленого пріоритету
5. Запропонувати категорію/підкатегорію, якщо не вказано
6. Надати рекомендації щодо призначення відповідального (якщо не призначено)

ФОРМАТ ВІДПОВІДІ (JSON):
{
  "summary": "Короткий опис проблеми та її суть",
  "rootCause": "Ймовірна причина проблеми",
  "diagnosticSteps": ["Крок 1", "Крок 2", "Крок 3"],
  "solutionSteps": ["Рішення 1", "Рішення 2"],
  "requiredInfo": ["Яка інформація потрібна від користувача"],
  "priorityAssessment": {
    "current": "low|medium|high|urgent",
    "recommended": "low|medium|high|urgent",
    "reason": "Чому рекомендовано змінити пріоритет"
  },
  "categoryRecommendation": {
    "category": "Hardware|Software|Network|Access|Other",
    "subcategory": "Конкретна підкатегорія",
    "reason": "Чому ця категорія"
  },
  "assignmentRecommendation": {
    "shouldAssign": true|false,
    "reason": "Чому потрібно/не потрібно призначати"
  },
  "estimatedComplexity": "low|medium|high",
  "estimatedTime": "Оцінка часу на вирішення",
  "relatedIssues": ["Можливі пов'язані проблеми"],
  "preventiveMeasures": ["Заходи для запобігання подібним проблемам"]
}

ВАЖЛИВО:
- Будьте конкретними та практичними
- Використовуйте технічну термінологію, але зрозумілу
- Якщо інформації недостатньо, вкажіть це
- Не вигадуйте проблеми, яких немає в описі
- МОВА: Відповідайте українською мовою
`;

      // Формуємо контекст тікета
      const ticketContext = `
АНАЛІЗ ЗАЯВКИ:

Заголовок: ${ticket.title || 'Не вказано'}
Опис: ${ticket.description || 'Не вказано'}
Статус: ${ticket.status || 'Не вказано'}
Пріоритет: ${ticket.priority || 'Не вказано'}
Тип: ${ticket.type || 'Не вказано'}
Категорія: ${ticket.subcategory || 'Не вказано'}
Створено: ${ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('uk-UA') : 'Не вказано'}
${ticket.dueDate ? `Термін виконання: ${new Date(ticket.dueDate).toLocaleString('uk-UA')}` : ''}
${ticket.assignedTo ? `Призначено: ${ticket.assignedTo.firstName || ''} ${ticket.assignedTo.lastName || ''}` : 'Не призначено'}
${ticket.createdBy ? `Автор: ${ticket.createdBy.firstName || ''} ${ticket.createdBy.lastName || ''}` : ''}
${ticket.city ? `Місто: ${ticket.city.name || ''}` : ''}
${ticket.institution ? `Заклад: ${ticket.institution.name || ''}` : ''}

${ticket.comments && ticket.comments.length > 0 ? `
КОМЕНТАРІ (${ticket.comments.length}):
${ticket.comments.map((c, i) => `${i + 1}. ${c.content} (${c.author?.firstName || 'Невідомо'} ${c.author?.lastName || ''}, ${new Date(c.createdAt).toLocaleString('uk-UA')})`).join('\n')}
` : ''}

${ticket.history && ticket.history.length > 0 ? `
ІСТОРІЯ ЗМІН:
${ticket.history.slice(-5).map(h => `- ${h.action}: ${h.changes || ''} (${new Date(h.timestamp).toLocaleString('uk-UA')})`).join('\n')}
` : ''}
`;

      const chatCompletion = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: ticketContext }
        ],
        model: this.settings.groqModel || 'llama-3.3-70b-versatile',
        temperature: 0.3, // Низька температура для більш точного аналізу
        max_tokens: 2048,
        response_format: { type: 'json_object' }
      });

      const responseText = chatCompletion.choices[0]?.message?.content;
      if (!responseText) {
        logger.warn('Groq повернув порожню відповідь при аналізі тікета');
        return null;
      }

      const result = JSON.parse(responseText);
      logger.info('Результат AI аналізу тікета:', { ticketId: ticket._id, result });
      return result;
    } catch (error) {
      logger.error('Помилка аналізу тікета через Groq:', error);
      return null;
    }
  }

  /**
   * Аналізує заявки (тікети) системи та надає інсайти
   * @param {Array} tickets - Масив тікетів для аналізу
   * @param {Object} analyticsData - Дані аналітики (статистика, тренди, метрики)
   * @param {Object} context - Додатковий контекст (дата діапазон, фільтри)
   * @returns {Promise<Object>} - Результат аналізу з інсайтами та рекомендаціями
   */
  async analyzeAnalytics(tickets = [], analyticsData = {}, context = {}) {
    try {
      if (!this.client) {
        await this.initialize();
      }

      if (!this.client) {
        return null;
      }

      const systemPrompt = `
Ви - експерт-аналітик системи HelpDesk. Ваше завдання - проаналізувати ЗАЯВКИ (ТІКЕТИ) системи та надати корисні інсайти та рекомендації для покращення роботи.

ОСНОВНІ ЗАВДАННЯ:
1. Проаналізувати описи заявок та виявити типові проблеми
2. Виявити проблемні зони та тренди на основі реальних заявок
3. Оцінити якість описів заявок та коментарів
4. Виявити повторювані проблеми та патерни
5. Запропонувати конкретні рекомендації для покращення обробки заявок
6. Визначити пріоритетні напрямки для оптимізації на основі аналізу заявок
7. Виявити аномалії або незвичайні патерни в заявках

ФОРМАТ ВІДПОВІДІ (JSON):
{
  "summary": "Короткий огляд стану заявок системи на основі аналізу реальних заявок",
  "keyInsights": ["Інсайт 1", "Інсайт 2", "Інсайт 3"],
  "commonProblems": [
    {
      "title": "Назва типової проблеми",
      "description": "Опис проблеми на основі аналізу заявок",
      "frequency": "Кількість подібних заявок",
      "examples": ["Приклад заявки 1", "Приклад заявки 2"],
      "recommendation": "Рекомендація для вирішення"
    }
  ],
  "qualityAnalysis": {
    "descriptionQuality": "Оцінка якості описів заявок (good|average|poor)",
    "descriptionIssues": ["Проблеми з описами заявок"],
    "commentQuality": "Оцінка якості коментарів та рішень (good|average|poor)",
    "commentIssues": ["Проблеми з коментарями"]
  },
  "trends": {
    "positive": ["Позитивні тренди на основі заявок"],
    "negative": ["Негативні тренди на основі заявок"],
    "neutral": ["Нейтральні спостереження"]
  },
  "problems": [
    {
      "title": "Назва проблеми",
      "description": "Опис проблеми на основі аналізу заявок",
      "severity": "low|medium|high|critical",
      "impact": "Вплив на систему",
      "recommendation": "Рекомендація для вирішення"
    }
  ],
  "recommendations": [
    {
      "category": "Категорія (performance|process|resources|quality|training)",
      "title": "Назва рекомендації",
      "description": "Детальний опис на основі аналізу заявок",
      "priority": "low|medium|high",
      "expectedImpact": "Очікуваний ефект"
    }
  ],
  "metrics": {
    "performance": "Оцінка продуктивності (good|average|poor)",
    "efficiency": "Оцінка ефективності (good|average|poor)",
    "quality": "Оцінка якості заявок (good|average|poor)",
    "overall": "Загальна оцінка (good|average|poor)"
  },
  "actionItems": [
    {
      "title": "Назва дії",
      "description": "Що потрібно зробити на основі аналізу заявок",
      "priority": "low|medium|high|urgent",
      "timeline": "Оцінка часу виконання"
    }
  ],
  "predictions": [
    "Прогноз 1 на основі аналізу заявок",
    "Прогноз 2"
  ]
}

ВАЖЛИВО:
- Будьте конкретними та практичними
- Використовуйте дані для підтвердження висновків
- Надавайте дії, які можна виконати
- МОВА: Відповідайте українською мовою
- Фокусуйтеся на покращенні продуктивності та якості
`;

      // Формуємо контекст з реальними заявками
      const ticketsSample = tickets.slice(0, 50); // Аналізуємо до 50 заявок для економії токенів
      
      const ticketsContext = ticketsSample.map((ticket, index) => {
        const comments = ticket.comments && ticket.comments.length > 0 
          ? ticket.comments.slice(0, 3).map(c => `  - ${c.content?.substring(0, 200)}`).join('\n')
          : '  (немає коментарів)';
        
        return `
ЗАЯВКА #${index + 1}:
- Заголовок: ${ticket.title || 'Не вказано'}
- Опис: ${(ticket.description || 'Не вказано').substring(0, 500)}
- Статус: ${ticket.status || 'Не вказано'}
- Пріоритет: ${ticket.priority || 'Не вказано'}
- Тип: ${ticket.type || 'Не вказано'}
- Категорія: ${ticket.subcategory || 'Не вказано'}
- Місто: ${ticket.city?.name || 'Не вказано'}
- Створено: ${ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString('uk-UA') : 'Не вказано'}
- Вирішено: ${ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleDateString('uk-UA') : 'Не вирішено'}
- Час вирішення: ${ticket.metrics?.resolutionTime ? `${Math.round(ticket.metrics.resolutionTime)} год` : 'Н/Д'}
- Коментарі (останні 3):
${comments}
`;
      }).join('\n---\n');

      const analyticsContext = `
АНАЛІЗ ЗАЯВОК (ТІКЕТІВ) СИСТЕМИ:

Період: ${context.startDate || 'Не вказано'} - ${context.endDate || 'Не вказано'}

ЗАГАЛЬНА СТАТИСТИКА:
- Всього заявок: ${analyticsData?.overview?.totalTickets || 0}
- Проаналізовано заявок: ${ticketsSample.length}
- Відкритих: ${analyticsData?.ticketsByStatus?.find(s => s._id === 'open')?.count || 0}
- В процесі: ${analyticsData?.ticketsByStatus?.find(s => s._id === 'in_progress')?.count || 0}
- Вирішених: ${analyticsData?.ticketsByStatus?.find(s => s._id === 'resolved')?.count || 0}
- Закритих: ${analyticsData?.ticketsByStatus?.find(s => s._id === 'closed')?.count || 0}

ПРІОРИТЕТИ:
- Низький: ${analyticsData?.ticketsByPriority?.find(p => p._id === 'low')?.count || 0}
- Середній: ${analyticsData?.ticketsByPriority?.find(p => p._id === 'medium')?.count || 0}
- Високий: ${analyticsData?.ticketsByPriority?.find(p => p._id === 'high')?.count || 0}

ПРОДУКТИВНІСТЬ:
- Середній час вирішення: ${analyticsData?.avgResolutionTime || 0} годин
- Коефіцієнт вирішення: ${analyticsData?.overview?.totalTickets > 0 
  ? Math.round(((analyticsData?.ticketsByStatus?.find(s => s._id === 'resolved')?.count || 0) / analyticsData.overview.totalTickets) * 100) 
  : 0}%

${ticketsContext}

ВАЖЛИВО: Проаналізуйте саме ЗАЯВКИ вище. Виявіть:
1. Типові проблеми та їх описи
2. Якість описів заявок (чи достатньо деталей)
3. Повторювані проблеми
4. Ефективність вирішення (чи є коментарі з рішеннями)
5. Патерни в заявках (які типи проблем найчастіші)
`;

      const chatCompletion = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: analyticsContext }
        ],
        model: this.settings.groqModel || 'llama-3.3-70b-versatile',
        temperature: 0.4, // Середня температура для балансу креативності та точності
        max_tokens: 2048,
        response_format: { type: 'json_object' }
      });

      const responseText = chatCompletion.choices[0]?.message?.content;
      if (!responseText) {
        logger.warn('Groq повернув порожню відповідь при аналізі аналітики');
        return null;
      }

      const result = JSON.parse(responseText);
      logger.info('Результат AI аналізу аналітики:', { result });
      return result;
    } catch (error) {
      logger.error('Помилка аналізу аналітики через Groq:', error);
      return null;
    }
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
