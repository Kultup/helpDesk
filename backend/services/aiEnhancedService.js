const logger = require('../utils/logger');

/**
 * Сервіс для покращення AI спілкування
 * Фаза 1: Проактивні підказки та розпізнавання емоцій
 */
class AIEnhancedService {
  constructor() {
    // База швидких рішень для типових проблем
    // ВАЖЛИВО: більш специфічні варіанти мають бути перед загальними (принтер кольором перед "принтер не друкує")
    this.quickSolutions = {
      'налаштування нового принтера': {
        keywords: [
          'налаштувати принтер',
          'новий принтер',
          'встановити принтер',
          'підключити принтер',
          'setup printer',
          'install printer',
          'new printer',
        ],
        solution: `Зрозуміло, вітаю з оновленням техніки! 🖨️
        
Для налаштування нового принтера потрібні права адміністратора (встановлення драйверів).

Щоб адмін все підготував, підкажіть:
1. **Модель принтера** (можна фото наклейки)
2. **Як плануєте підключити?** (USB кабель чи Wi-Fi)

Тільки-но відповісте — я створю заявку.`,
        category: 'Hardware',
        needsMoreInfo: true,
        missingInfo: ['модель принтера', 'тип підключення (USB/WiFi)'],
        estimatedTime: '15-20 хвилин',
        // Цей прапорець дозволяє пропустити стандартні "перезавантажте" поради
        isSetupIntent: true,
      },

      'принтер не друкує кольором / прочистка / драйвер': {
        keywords: [
          'синьою фарбою',
          'синім',
          'одним кольором',
          'прочистка труб',
          'прочистка трубок',
          'чорнильн',
          'драйвер принтера',
          'драйвер для принтера',
          'не друкує кольором',
          'не печатает цветом',
        ],
        solution: `Це потребує перевірки адміністратора (прочистка трубок, драйвер, картридж кольору).

Я створю заявку, і адмін підійде. Підкажіть, будь ласка:
• Місто
• Адресу (офіс / відділ)`,
        category: 'Hardware',
        estimatedTime: '1-2 години',
      },

      'принтер не друкує': {
        keywords: ['принтер', 'не друкує', 'не печатає'],
        solution: `Спробуйте швидке рішення:
1️⃣ Перевірте чи є папір у лотку
2️⃣ **Якщо принтер по кабелю** — перевірте чи шнур підключений до ПК
3️⃣ **Якщо принтер по Wi‑Fi** — переконайтесь, що ноутбук у тій самій мережі, що й принтер (той самий Wi‑Fi)
4️⃣ Перезавантажте принтер (вимкніть на 30 сек)
5️⃣ Очистіть чергу друку на комп'ютері (Пуск → Пристрої → Принтери)

Якщо не допоможе — створю тікет, і адмін підійде швидше 😊`,
        category: 'Hardware',
        estimatedTime: '2-5 хвилин',
      },

      'принтер застрягає папір': {
        keywords: ['папір застрягає', 'застряг папір', 'paper jam'],
        solution: `Швидке рішення для застряглого паперу:
1️⃣ Відкрийте всі кришки принтера
2️⃣ Обережно витягніть застряглий папір (тягніть за напрямком руху)
3️⃣ Перевірте чи немає залишків паперу всередині
4️⃣ Закрийте кришки та спробуйте надрукувати тестову сторінку

Якщо папір застрягає постійно — створю тікет для адміна 🔧`,
        category: 'Hardware',
        estimatedTime: '3-5 хвилин',
      },

      'інтернет не працює': {
        keywords: ['інтернет', 'не працює', 'немає звʼязку', 'wifi', 'wi-fi'],
        solution: `Спробуйте відновити інтернет:
1️⃣ Перезавантажте роутер (вимкніть на 30 сек, увімкніть)
2️⃣ Перевірте чи підключений мережевий кабель
3️⃣ Спробуйте підключитись до іншої Wi-Fi мережі
4️⃣ Перезавантажте комп'ютер

Якщо не допоможе — створю тікет для мережевого адміна 🌐`,
        category: 'Network',
        estimatedTime: '5-10 хвилин',
      },

      'забув пароль gmail': {
        keywords: [
          'пароль gmail',
          'забув пароль gmail',
          'gmail пароль',
          'пароль пошта',
          'забув пароль пошту',
          'google пароль',
          'відновити gmail',
        ],
        solution: `Для відновлення пароля Gmail спробуйте спочатку офіційну форму:
🔗 https://accounts.google.com/signin/recovery

1️⃣ Введіть email (Gmail)
2️⃣ Пройдіть перевірку (телефон або резервний email)
3️⃣ Створіть новий пароль

Якщо не виходить самостійно — створю заявку, і адмін допоможе через адмін-панель Workspace 🔐`,
        category: 'Access',
        estimatedTime: '5-10 хвилин',
      },

      'забув пароль': {
        keywords: ['забув пароль', 'не памʼятаю пароль', 'скинути пароль', 'reset password'],
        solution: `Спробуйте самостійно скинути пароль:
1️⃣ Натисніть "Забули пароль?" на сторінці входу
2️⃣ Введіть вашу email адресу
3️⃣ Перевірте пошту (також папку "Спам")
4️⃣ Перейдіть за посиланням та створіть новий пароль

Якщо лист не приходить — створю тікет для адміна 🔐`,
        category: 'Access',
        estimatedTime: '2-3 хвилини',
      },

      "комп'ютер повільно працює": {
        keywords: ['повільно', 'гальмує', 'зависає', 'тормозить'],
        solution: `Спробуйте прискорити роботу:
1️⃣ Закрийте непотрібні програми (Ctrl+Shift+Esc → Диспетчер завдань)
2️⃣ Перезавантажте комп'ютер
3️⃣ Перевірте чи не заповнений диск C: (має бути мінімум 10% вільного місця)
4️⃣ Закрийте зайві вкладки в браузері

Якщо не допоможе — створю тікет, адмін перевірить систему 💻`,
        category: 'Hardware',
        estimatedTime: '5 хвилин',
      },

      '1с не запускається': {
        keywords: ['1с', '1c', 'не запускається', 'не відкривається'],
        solution: `Спробуйте запустити 1С:
1️⃣ Перезавантажте комп'ютер
2️⃣ Запустіть 1С від імені адміністратора (правою кнопкою → Запустити від імені адміністратора)
3️⃣ Перевірте чи є інтернет (1С потребує звʼязок з сервером)

Якщо не допоможе — створю тікет, адмін перевірить ліцензію та підключення 📊`,
        category: 'Software',
        estimatedTime: '3-5 хвилин',
      },

      'не відкривається файл': {
        keywords: ['не відкривається файл', 'не можу відкрити', 'помилка файлу'],
        solution: `Спробуйте відкрити файл:
1️⃣ Перевірте розширення файлу (.docx, .xlsx, .pdf)
2️⃣ Спробуйте відкрити іншою програмою (правою кнопкою → Відкрити за допомогою)
3️⃣ Перезавантажте програму
4️⃣ Спробуйте скопіювати файл в іншу папку

Якщо не допоможе — створю тікет, можливо файл пошкоджений 📄`,
        category: 'Software',
        estimatedTime: '2-3 хвилини',
      },

      'потрібні права адміністратора': {
        keywords: [
          'права адміністратора',
          'адміністративні права',
          'run as administrator',
          'запустити від імені адміністратора',
          'не можу встановити',
          'доступ заборонено',
          'access denied',
          'домен',
        ],
        solution: `⚠️ Комп'ютери в домені мають обмеження безпеки.

Для адміністративних задач (встановлення програм, зміна налаштувань системи):
1️⃣ НЕ намагайтесь обійти захист самостійно
2️⃣ Створю тікет для адміна - він виконає задачу віддалено
3️⃣ Або адмін надасть тимчасові права, якщо потрібно

Це нормально і потрібно для безпеки мережі! 🔒

Опишіть що саме потрібно зробити, і я створю тікет`,
        category: 'Access',
        estimatedTime: '15-30 хвилин (очікування адміна)',
      },

      'встановлення програм': {
        keywords: [
          'встановити',
          'поставити',
          'інсталювати',
          'install',
          'setup',
          'скачати програму',
          'потрібен офіс',
          'потрібен word',
          'потрібен excel',
          'потрібен chrome',
        ],
        solution: `Зрозуміло, потрібно встановити програму. 🖥️

1️⃣ Я створю заявку для системного адміністратора.
2️⃣ Він підключиться віддалено і все налаштує.
3️⃣ Вам не потрібно нічого завантажувати самостійно (це безпечніше!).

Просто підтвердіть створення заявку 👇`,
        category: 'Software',
        estimatedTime: '10-20 хвилин',
      },

      'оновлення програм': {
        keywords: [
          'оновити',
          'оновлення',
          'update',
          'upgrade',
          'patch',
          'медок',
          'medoc',
          '1с',
          'бас',
          'bas',
          'fredo',
        ],
        solution: `Зрозуміло, потрібне оновлення ПЗ. 🔄

Це задача для адміністратора (щоб все пройшло коректно і нічого не збилось).
Я зараз створю заявку, і адмін проведе оновлення у найближчий час.

Тисніть "Створити тікет" 👇`,
        category: 'Software',
        estimatedTime: '15-30 хвилин',
      },

      'заміна картриджа': {
        keywords: [
          'картридж',
          'тонер',
          'закінчилась фарба',
          'замінити картридж',
          'поміняти картридж',
          'немає фарби',
          'світлий друк',
        ],
        solution: `Закінчився тонер? Зрозумів. 🖨️

Створюю заявку на заміну картриджа.
Системний адміністратор прийде і замінить його.

*Підказка:* Якщо на принтері пише "Мало тонеру", але він ще друкує — можна трохи, потрусити картридж (бережно!), це дасть ще 20-30 сторінок 😉`,
        category: 'Hardware',
        estimatedTime: 'Протягом дня',
      },

      'доступ до папки': {
        keywords: [
          'доступ до папки',
          'спільна папка',
          'мережева папка',
          'не бачу папку',
          'підключити диск',
          'мережевий диск',
        ],
        solution: `Потрібен доступ до мережевої папки? 📂

Я створю заявку для адміна. Йому потрібно буде знати:
1. До якої саме папки потрібен доступ
2. Для кого (вас чи колеги)

Але краще просто створимо тікет, і він сам уточнить, якщо треба.`,
        category: 'Access',
        estimatedTime: '10-15 хвилин',
      },

      new_accountant: {
        keywords: ['новий бухгалтер', 'нового бухгалтера', 'оформити бухгалтера'],
        solution:
          'Для оформлення нового співробітника потрібні його дані. Підкажіть, будь ласка, як звати нового бухгалтера?',
        category: 'Access',
        needsMoreInfo: true, // Custom flag to trigger gathering_information
        missingInfo: ['ПІБ нового співробітника'],
        estimatedTime: '15-20 хвилин',
      },

      setup_accountant: {
        keywords: [
          'налаштувати ноутбук для бухгалтера',
          'ноутбук бухгалтеру',
          'підготувати ноутбук бухгалтеру',
        ],
        solution: `Зрозуміло. 💻
        
Створюю заявку на налаштування ноутбука для бухгалтера (стандартний набір ПЗ + M.E.Doc).
Системний адміністратор візьме в роботу.`,
        category: 'Hardware',
        autoTicket: true,
        estimatedTime: '1-2 години',
      },

      // Інформаційні відповіді без створення заявки (informationalOnly: true)
      'графік роботи підтримки': {
        keywords: [
          'графік роботи підтримки',
          'коли працює техпідтримка',
          'коли працює підтримка',
          'режим роботи підтримки',
          'години роботи підтримки',
        ],
        solution:
          'Техпідтримка працює в робочі години (пн–пт). Заявки обробляються по черзі. Якщо є термінова проблема — опишіть її, і я створю заявку з відповідним пріоритетом.',
        category: 'Other',
        estimatedTime: null,
        informationalOnly: true,
      },
      'хто відповідає за підтримку': {
        keywords: [
          'хто відповідає за підтримку',
          'до кого звертатися',
          'контакт підтримки',
          'хто обробляє заявки',
        ],
        solution:
          'За технічні питання звертайтеся через цей чат — я допоможу оформити заявку або підкажу кроки. Адмін обробляє заявки по черзі. Опишіть проблему, і я її передам.',
        category: 'Other',
        estimatedTime: null,
        informationalOnly: true,
      },
    };

    // Ключові слова для визначення емоційного стану
    this.emotionKeywords = {
      urgent: {
        keywords: [
          'терміново',
          'швидко',
          'зараз',
          'негайно',
          'критично',
          'аварія',
          'не працює взагалі',
          'клієнти чекають',
          'каса',
          'термінова',
        ],
        priority: 'urgent',
        tone: 'urgent',
      },
      frustrated: {
        keywords: [
          'знову',
          'вже',
          'постійно',
          'завжди',
          'достало',
          'третій раз',
          'щодня',
          'кожен день',
        ],
        priority: 'high',
        tone: 'frustrated',
      },
      calm: {
        keywords: ['будь ласка', 'коли зможете', 'не поспішайте', 'якщо можна'],
        priority: 'medium',
        tone: 'calm',
      },
    };
  }

  /**
   * Пошук швидкого рішення для проблеми
   * @param {string} problemText - Текст проблеми
   * @param {Object} [userContext] - Контекст користувача (для пропуску вже відомої інфи)
   * @returns {Object|null} Швидке рішення або null
   */
  findQuickSolution(problemText, userContext = {}) {
    if (!problemText) {
      return null;
    }

    const text = problemText.toLowerCase();

    for (const [key, solution] of Object.entries(this.quickSolutions)) {
      // Перевіряємо чи текст містить хоча б одне ключове слово
      const hasKeyword = solution.keywords.some(keyword => text.includes(keyword.toLowerCase()));

      if (hasKeyword) {
        logger.info(`💡 Знайдено швидке рішення: ${key}`);

        let finalSolution = solution.solution;
        let finalMissingInfo = [...(solution.missingInfo || [])];

        // Специальна логіка для нового принтера: якщо модель уже відома (з фото або контексту)
        if (key === 'налаштування нового принтера') {
          const modelKnown =
            userContext.detectedHardware ||
            userContext.userEquipmentSummary ||
            / (g\d{4}|l\d{4}|laserjet|canon|hp|epson|brother|pantum) /i.test(text);

          if (modelKnown) {
            const detectedModel =
              userContext.detectedHardware || userContext.userEquipmentSummary || 'принтера';
            finalSolution = `Дякую, модель ${detectedModel} зафіксовано! 🖨️\n\nОстаннє уточнення: як плануєте підключити принтер — через **USB кабель** чи по **Wi-Fi**?\n\nТільки-но відповісте — я створю заявку.`;
            finalMissingInfo = ['тип підключення (USB/WiFi)'];
          }
        }

        const result = {
          problemType: key,
          solution: finalSolution,
          category: solution.category,
          estimatedTime: solution.estimatedTime,
          hasQuickFix: true,
          needsMoreInfo: finalMissingInfo.length > 0,
          missingInfo: finalMissingInfo,
          autoTicket: solution.autoTicket,
        };
        if (solution.informationalOnly) {
          result.informationalOnly = true;
        }
        return result;
      }
    }

    return null;
  }

  /**
   * Аналіз емоційного стану користувача
   * @param {string} text - Текст повідомлення
   * @returns {Object} Емоційний стан та рекомендований пріоритет
   */
  analyzeEmotion(text) {
    if (!text) {
      return {
        emotion: 'calm',
        priority: 'medium',
        confidence: 0.5,
      };
    }

    const lowerText = text.toLowerCase();

    // Перевірка на caps lock (крик)
    const capsRatio = (text.match(/[A-ZА-ЯІЇЄҐ]/g) || []).length / text.length;
    const isShouting = capsRatio > 0.5 && text.length > 10;

    // Перевірка на багато знаків оклику
    const exclamationCount = (text.match(/!/g) || []).length;
    const hasMultipleExclamation = exclamationCount >= 2;

    // Перевірка ключових слів
    for (const [emotion, data] of Object.entries(this.emotionKeywords)) {
      const matchCount = data.keywords.filter(keyword => lowerText.includes(keyword)).length;

      if (matchCount > 0 || (emotion === 'urgent' && (isShouting || hasMultipleExclamation))) {
        logger.info(
          `🎯 Визначено емоцію: ${emotion} (matches: ${matchCount}, shouting: ${isShouting})`
        );

        return {
          emotion: emotion,
          priority: data.priority,
          tone: data.tone,
          confidence: Math.min(0.9, 0.6 + matchCount * 0.1),
          indicators: {
            keywordMatches: matchCount,
            isShouting,
            hasMultipleExclamation,
          },
        };
      }
    }

    // За замовчуванням - спокійний стан
    return {
      emotion: 'calm',
      priority: 'medium',
      tone: 'calm',
      confidence: 0.7,
      indicators: {
        keywordMatches: 0,
        isShouting: false,
        hasMultipleExclamation: false,
      },
    };
  }

  /**
   * Генерація відповіді з урахуванням емоцій
   * @param {Object} emotionData - Дані про емоції
   * @param {string} baseResponse - Базова відповідь
   * @returns {string} Адаптована відповідь
   */
  adaptResponseToEmotion(emotionData, baseResponse) {
    const { emotion } = emotionData;

    const emotionalPrefixes = {
      urgent: ['Розумію терміновість! 🚨', 'Це критично, розумію! ⚡', 'Зараз швидко допоможу! 🔥'],
      frustrated: [
        'Розумію, що це дратує 😔',
        'Так, це неприємно коли постійно 😞',
        'Розумію ваше розчарування 💔',
      ],
      calm: ['', 'Звісно допоможу 😊', 'Без проблем! 👍'],
    };

    const prefixes = emotionalPrefixes[emotion] || emotionalPrefixes.calm;
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

    if (prefix) {
      return `${prefix}\n\n${baseResponse}`;
    }

    return baseResponse;
  }

  /**
   * Комплексний аналіз повідомлення
   * @param {string} text - Текст повідомлення
   * @returns {Object} Результат аналізу
   */
  analyzeMessage(text) {
    const quickSolution = this.findQuickSolution(text);
    const emotion = this.analyzeEmotion(text);

    return {
      quickSolution,
      emotion,
      hasQuickFix: quickSolution !== null,
      suggestedPriority: emotion.priority,
      recommendedTone: emotion.tone,
    };
  }

  /**
   * Отримати всі доступні швидкі рішення
   * @returns {Array} Список швидких рішень
   */
  getAllQuickSolutions() {
    return Object.entries(this.quickSolutions).map(([key, solution]) => ({
      problemType: key,
      keywords: solution.keywords,
      category: solution.category,
      estimatedTime: solution.estimatedTime,
      solution: solution.solution,
    }));
  }

  /**
   * Пошук рішення в інтернеті через Gemini з Google Search
   * @param {string} problemText - Опис проблеми
   * @returns {Object|null} Знайдене рішення або null
   */
  async searchInternetSolution(problemText) {
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

      // Використовуємо модель з підтримкою Google Search
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        tools: [
          {
            googleSearch: {},
          },
        ],
      });

      const prompt = `Ти - експерт IT підтримки. Знайди АКТУАЛЬНЕ рішення для цієї проблеми:

"${problemText}"

ІНСТРУКЦІЇ:
1. Використай Google Search для пошуку актуальної інформації
2. Знайди офіційні джерела (Microsoft, виробники ПЗ)
3. Створи СТИСЛЕ покрокове рішення (максимум 4-5 кроків)
4. Вкажи джерело інформації

ФОРМАТ ВІДПОВІДІ (JSON):
{
  "hasSolution": true/false,
  "solution": "Покрокове рішення з emoji",
  "source": "Назва джерела (рік)",
  "confidence": 0.0-1.0,
  "category": "Hardware/Software/Network/Access/Other"
}

Якщо не знайшов рішення - hasSolution: false`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();

      // Очищаємо від markdown
      text = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(text);

      if (parsed.hasSolution && parsed.confidence >= 0.7) {
        logger.info(`🌐 Знайдено рішення в інтернеті: ${parsed.source}`);
        return {
          solution: parsed.solution,
          source: parsed.source,
          category: parsed.category,
          confidence: parsed.confidence,
          fromInternet: true,
        };
      }

      return null;
    } catch (error) {
      logger.error('Помилка пошуку в інтернеті:', error);
      return null;
    }
  }

  /**
   * Розширений аналіз повідомлення з пошуком в інтернеті
   * @param {string} text - Текст повідомлення
   * @returns {Object} Результат аналізу
   */
  /**
   * Аналізує тікет для експорту (короткий зміст, настрій, теми, рекомендації)
   * @param {Object} ticket - Об'єкт тікета
   * @returns {Promise<Object>} - Результат аналізу
   */
  async analyzeTicketForExport(ticket) {
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

      const prompt = `
        Проаналізуй цей тікет підтримки та поверни JSON з наступними полями:
        1. "summary": Короткий зміст проблеми (1 речення).
        2. "sentiment": Настрій користувача (Positive, Neutral, Negative, Frustrated).
        3. "topics": Масив ключових тем (до 3 штук).
        4. "recommendation": Рекомендована дія для вирішення (1 речення).

        Тікет:
        Заголовок: ${ticket.title}
        Опис: ${ticket.description}
        Пріоритет: ${ticket.priority}
        Статус: ${ticket.status}
      `;

      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();

      // Очистка markdown якщо є
      text = text
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      try {
        return JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse AI export analysis JSON:', e);
        return {
          summary: 'Помилка аналізу',
          sentiment: 'N/A',
          topics: [],
          recommendation: 'N/A',
        };
      }
    } catch (error) {
      console.error('AI Export Analysis Error:', error);
      return {
        summary: 'Помилка сервісу AI',
        sentiment: 'N/A',
        topics: [],
        recommendation: 'N/A',
      };
    }
  }

  async analyzeMessageWithInternet(text) {
    // Спочатку перевіряємо статичну базу
    const quickSolution = this.findQuickSolution(text);
    const emotion = this.analyzeEmotion(text);

    // Якщо є швидке рішення - повертаємо його
    if (quickSolution) {
      return {
        quickSolution,
        emotion,
        hasQuickFix: true,
        suggestedPriority: emotion.priority,
        recommendedTone: emotion.tone,
        source: 'static',
      };
    }

    // Якщо немає - шукаємо в інтернеті
    logger.info('💡 Статичне рішення не знайдено, шукаю в інтернеті...');
    const internetSolution = await this.searchInternetSolution(text);

    if (internetSolution) {
      return {
        quickSolution: {
          problemType: 'internet_search',
          solution: `${internetSolution.solution}\n\n📚 Джерело: ${internetSolution.source}`,
          category: internetSolution.category,
          hasQuickFix: true,
          fromInternet: true,
        },
        emotion,
        hasQuickFix: true,
        suggestedPriority: emotion.priority,
        recommendedTone: emotion.tone,
        source: 'internet',
      };
    }

    // Якщо нічого не знайдено
    return {
      quickSolution: null,
      emotion,
      hasQuickFix: false,
      suggestedPriority: emotion.priority,
      recommendedTone: emotion.tone,
      source: 'none',
    };
  }
}

module.exports = new AIEnhancedService();
