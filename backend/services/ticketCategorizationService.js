const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

/**
 * Сервіс для автоматичної категоризації тікетів за допомогою AI
 */
class TicketCategorizationService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

    // Ієрархічна структура категорій
    this.categoryTree = {
      Hardware: {
        description: 'Апаратне забезпечення',
        subcategories: {
          Принтер: ['Не друкує', 'Застряг папір', 'Проблеми з якістю друку', 'Підключення'],
          "Комп'ютер": ['Не вмикається', 'Повільно працює', 'Зависає', 'Перезавантажується'],
          Монітор: ['Не працює', 'Артефакти на екрані', 'Неправильна роздільна здатність'],
          'Клавіатура/Миша': ['Не працює', 'Не реагує', 'Пошкоджена'],
          'Мережеве обладнання': ['Роутер', 'Комутатор', 'Кабелі'],
          'Інше обладнання': ['Сканер', 'Веб-камера', 'Навушники', 'Інше'],
        },
      },
      Software: {
        description: 'Програмне забезпечення',
        subcategories: {
          'Microsoft Office': ['Word', 'Excel', 'PowerPoint', 'Outlook', 'Інше'],
          '1С': ['Не запускається', 'Помилки', 'Доступ', 'Оновлення'],
          Браузер: ['Chrome', 'Firefox', 'Edge', 'Інше'],
          Антивірус: ['Оновлення', 'Сканування', 'Блокування'],
          'Операційна система': ['Windows', 'Оновлення', 'Налаштування'],
          'Спеціалізоване ПЗ': ['Бухгалтерія', 'CRM', 'ERP', 'Інше'],
        },
      },
      Network: {
        description: 'Мережа та інтернет',
        subcategories: {
          Інтернет: ['Немає підключення', 'Повільний', 'Нестабільний'],
          'Wi-Fi': ['Не підключається', 'Слабкий сигнал', 'Пароль'],
          'Локальна мережа': ['Доступ до ресурсів', 'Мережеві диски', 'Принтери'],
          VPN: ['Підключення', 'Налаштування', 'Помилки'],
          Email: ['Не отримую пошту', 'Не відправляється', 'Спам'],
        },
      },
      Access: {
        description: 'Доступи та облікові записи',
        subcategories: {
          Пароль: ['Забув пароль', 'Скидання', 'Зміна'],
          'Облікові записи': ['Створення', 'Блокування', 'Видалення'],
          'Права доступу': ['Файли', 'Папки', 'Програми', 'Системи'],
          'Active Directory': ['Доступ до домену', 'Групи', 'Політики'],
        },
      },
      Other: {
        description: 'Інше',
        subcategories: {
          Консультація: ['Як зробити', 'Навчання', 'Рекомендації'],
          'Запит на обладнання': ['Нове обладнання', 'Заміна', 'Ремонт'],
          Інше: ['Не підходить до інших категорій'],
        },
      },
    };
  }

  /**
   * Створення промпту для AI категоризації
   * @param {string} title - Заголовок тікету
   * @param {string} description - Опис тікету
   * @returns {string} Промпт для AI
   */
  createCategorizationPrompt(title, description) {
    const categoriesText = Object.entries(this.categoryTree)
      .map(([category, data]) => {
        const subcats = Object.entries(data.subcategories)
          .map(([subcat, items]) => `  - ${subcat}: ${items.join(', ')}`)
          .join('\n');
        return `${category} (${data.description}):\n${subcats}`;
      })
      .join('\n\n');

    return `Ти - експерт з IT підтримки. Проаналізуй тікет та визнач найбільш підходящу категорію та підкатегорію.

КАТЕГОРІЇ ТА ПІДКАТЕГОРІЇ:
${categoriesText}

ТІКЕТ:
Заголовок: ${title}
Опис: ${description || 'Немає опису'}

ІНСТРУКЦІЇ:
1. Уважно проаналізуй заголовок та опис тікету
2. Визнач основну проблему
3. Вибери ОДНУ найбільш підходящу категорію
4. Вибери ОДНУ найбільш підходящу підкатегорію
5. Якщо не впевнений - обери "Other" / "Інше"

ВІДПОВІДЬ НАДАЙ У ФОРМАТІ JSON (тільки JSON, без додаткового тексту):
{
  "category": "назва категорії",
  "subcategory": "назва підкатегорії",
  "confidence": 0.95,
  "reasoning": "коротке пояснення чому обрано саме цю категорію"
}`;
  }

  /**
   * Категоризація тікету за допомогою AI
   * @param {string} title - Заголовок тікету
   * @param {string} description - Опис тікету
   * @returns {Object} Результат категоризації
   */
  async categorizeTicket(title, description) {
    try {
      const prompt = this.createCategorizationPrompt(title, description);

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();

      // Очищаємо відповідь від markdown форматування
      text = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const categorization = JSON.parse(text);

      // Валідація результату
      if (!this.categoryTree[categorization.category]) {
        logger.warn(`AI повернув невалідну категорію: ${categorization.category}`);
        return {
          category: 'Other',
          subcategory: 'Інше',
          confidence: 0.5,
          reasoning: 'Автоматична категоризація не змогла визначити категорію',
        };
      }

      // Перевірка підкатегорії
      const validSubcategories = Object.keys(
        this.categoryTree[categorization.category].subcategories
      );
      if (!validSubcategories.includes(categorization.subcategory)) {
        logger.warn(`AI повернув невалідну підкатегорію: ${categorization.subcategory}`);
        categorization.subcategory = validSubcategories[0]; // Перша доступна
      }

      logger.info(
        `✅ Категоризація: ${categorization.category} → ${categorization.subcategory} (${Math.round(categorization.confidence * 100)}%)`
      );

      return categorization;
    } catch (error) {
      logger.error('Помилка AI категоризації:', error);

      // Fallback на базову категоризацію за ключовими словами
      return this.fallbackCategorization(title, description);
    }
  }

  /**
   * Fallback категоризація за ключовими словами
   * @param {string} title - Заголовок
   * @param {string} description - Опис
   * @returns {Object} Результат категоризації
   */
  fallbackCategorization(title, description) {
    const text = `${title} ${description || ''}`.toLowerCase();

    // Ключові слова для категорій
    const keywords = {
      Hardware: [
        'принтер',
        "комп'ютер",
        'монітор',
        'клавіатура',
        'миша',
        'обладнання',
        'не вмикається',
        'зламався',
      ],
      Software: [
        'програма',
        'office',
        'word',
        'excel',
        '1с',
        'браузер',
        'антивірус',
        'windows',
        'не запускається',
      ],
      Network: ['інтернет', 'мережа', 'wi-fi', 'wifi', 'підключення', 'vpn', 'пошта', 'email'],
      Access: ['пароль', 'доступ', 'логін', 'облікові записи', 'права', 'active directory'],
    };

    for (const [category, words] of Object.entries(keywords)) {
      if (words.some(word => text.includes(word))) {
        const subcategories = Object.keys(this.categoryTree[category].subcategories);
        return {
          category,
          subcategory: subcategories[0],
          confidence: 0.6,
          reasoning: 'Визначено за ключовими словами (fallback)',
        };
      }
    }

    return {
      category: 'Other',
      subcategory: 'Інше',
      confidence: 0.5,
      reasoning: 'Не вдалося визначити категорію',
    };
  }

  /**
   * Масова рекатегоризація існуючих тікетів
   * @param {number} limit - Максимальна кількість тікетів
   * @returns {Object} Статистика
   */
  async recategorizeExistingTickets(limit = 100) {
    try {
      const Ticket = require('../models/Ticket');

      logger.info(`🔄 Початок рекатегоризації тікетів (макс ${limit})...`);

      // Знаходимо тікети без підкатегорії або з категорією "Other"
      const tickets = await Ticket.find({
        $or: [{ subcategory: { $exists: false } }, { subcategory: null }, { category: 'Other' }],
        isDeleted: false,
      }).limit(limit);

      logger.info(`📊 Знайдено ${tickets.length} тікетів для рекатегоризації`);

      let updated = 0;
      let failed = 0;

      for (const ticket of tickets) {
        try {
          const result = await this.categorizeTicket(ticket.title, ticket.description);

          // Оновлюємо тільки якщо впевненість > 70%
          if (result.confidence >= 0.7) {
            ticket.category = result.category;
            ticket.subcategory = result.subcategory;

            if (!ticket.metadata) {
              ticket.metadata = {};
            }
            ticket.metadata.autoCategorization = {
              confidence: result.confidence,
              reasoning: result.reasoning,
              categorizedAt: new Date(),
            };

            await ticket.save();
            updated++;

            logger.info(
              `✅ Рекатегоризовано тікет ${ticket.ticketNumber}: ${result.category} → ${result.subcategory}`
            );
          }

          // Затримка щоб не перевантажити API
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          failed++;
          logger.error(`Помилка рекатегоризації тікету ${ticket._id}:`, error);
        }
      }

      logger.info(`✅ Рекатегоризація завершена: ${updated} оновлено, ${failed} помилок`);

      return {
        total: tickets.length,
        updated,
        failed,
      };
    } catch (error) {
      logger.error('Критична помилка рекатегоризації:', error);
      throw error;
    }
  }

  /**
   * Отримати структуру категорій
   * @returns {Object} Дерево категорій
   */
  getCategoryTree() {
    return this.categoryTree;
  }
}

module.exports = new TicketCategorizationService();
