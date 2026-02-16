const KnowledgeBase = require('../models/KnowledgeBase');
const logger = require('../utils/logger');
const kbEmbeddingService = require('./kbEmbeddingService');

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Короткі відповіді — не шукати в KB (інакше "ні" збігається з "україни") */
const UNINFORMATIVE_QUERIES = new Set([
  'ні',
  'нi',
  'так',
  'ок',
  'добре',
  'нет',
  'no',
  'yes',
  'ніт',
  'окей',
  'угу',
  'ага',
  'ну',
]);

/** Слова, які не використовуємо для пошуку за ключовими словами (українська). */
const STOP_WORDS = new Set([
  'не',
  'як',
  'що',
  'для',
  'в',
  'на',
  'з',
  'до',
  'по',
  'у',
  'та',
  'і',
  'але',
  'це',
  'то',
  'від',
  'за',
  'про',
  'без',
  'при',
  'мені',
  'мне',
  'його',
  'її',
  'їх',
  'моє',
  'можу',
  'може',
]);

/** Поширені помилки/варіанти написання → канонічна форма для збігу зі статтями KB. */
const WORD_NORMALIZE = {
  плф: 'пдф',
  pdf: 'пдф',
  віндовс: 'windows',
  виндовс: 'windows',
  віндів: 'windows',
};

/** Варіанти написання одного поняття (запит і варіанти в статтях KB). */
const WORD_VARIANTS = {
  відкрити: ['відкрити', 'відрити'],
  открыти: ['відкрити', 'відрити'],
  пдф: ['пдф', 'ПДФ', 'PDF', 'pdf'], // у статтях часто латиницею PDF
};

/**
 * Витягнути значимі слова з запиту (довжина >= 2, не стоп-слова), з нормалізацією помилок.
 * @param {string} query
 * @returns {string[]}
 */
function getSearchWords(query) {
  const raw = String(query)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
  const normalized = raw.map(w => WORD_NORMALIZE[w] || w);
  return [...new Set(normalized)];
}

class KBSearchService {
  /**
   * Знайти одну найкращу статтю для бота за запитом користувача.
   * 1) Семантичний пошук (embedding); якщо score >= порогу — повернути статтю;
   * 2) $text пошук; 3) fallback по повній фразі (regex); 4) fallback по словах.
   * @param {String} query - текст повідомлення користувача
   * @returns {Promise<Object|null>} - стаття або null
   */
  async findBestMatchForBot(query = '') {
    const q = String(query).trim();
    if (!q) {
      return null;
    }
    try {
      const thresholds = kbEmbeddingService.getScoreThresholds();
      const semanticResults = await kbEmbeddingService.findSimilarArticles(q, { topK: 1 });
      if (semanticResults.length > 0 && semanticResults[0].score >= thresholds.high) {
        logger.info(
          `📚 KB semantic match: "${semanticResults[0].article.title}" for query: ${q.substring(0, 60)} (score: ${semanticResults[0].score.toFixed(3)})`
        );
        return semanticResults[0].article;
      }

      const filters = { status: 'published', isActive: true };
      const options = { limit: 1, page: 1, sortBy: 'relevance' };
      const result = await this.searchArticles(q, filters, options);
      if (result.articles && result.articles.length > 0) {
        return result.articles[0];
      }
      const regex = new RegExp(escapeRegex(q), 'i');
      let fallback = await KnowledgeBase.findOne({
        status: 'published',
        isActive: true,
        $or: [{ title: regex }, { content: regex }, { tags: regex }],
      })
        .sort({ createdAt: -1 })
        .lean();
      if (fallback) {
        logger.info(
          `📚 KB fallback match (regex): "${fallback.title}" for query: ${q.substring(0, 60)}`
        );
        return fallback;
      }
      const words = getSearchWords(q);
      if (words.length >= 2) {
        const wordConditions = words.map(word => {
          const variants = WORD_VARIANTS[word] || [word];
          const variantRegexps = variants.flatMap(v => [
            { title: new RegExp(escapeRegex(v), 'i') },
            { content: new RegExp(escapeRegex(v), 'i') },
            { tags: new RegExp(escapeRegex(v), 'i') },
          ]);
          return { $or: variantRegexps };
        });
        fallback = await KnowledgeBase.findOne({
          status: 'published',
          isActive: true,
          $and: wordConditions,
        })
          .sort({ createdAt: -1 })
          .lean();
        if (fallback) {
          logger.info(
            `📚 KB fallback match (words): "${fallback.title}" for query: ${q.substring(0, 60)}`
          );
          return fallback;
        }
      }
      return null;
    } catch (err) {
      logger.error('KB findBestMatchForBot error', err);
      return null;
    }
  }

  /**
   * Пошук лише за текстом ($text + regex + слова), без семантики. Для fallback після семантичного пошуку.
   * @param {String} query
   * @returns {Promise<Object|null>}
   */
  async findBestMatchForBotTextOnly(query = '') {
    const q = String(query).trim().toLowerCase();
    if (!q) {
      return null;
    }
    if (q.length <= 3 || UNINFORMATIVE_QUERIES.has(q)) {
      return null;
    }
    try {
      const filters = { status: 'published', isActive: true };
      const options = { limit: 1, page: 1, sortBy: 'relevance' };
      const result = await this.searchArticles(q, filters, options);
      if (result.articles && result.articles.length > 0) {
        return result.articles[0];
      }
      const regex = new RegExp(escapeRegex(q), 'i');
      let fallback = await KnowledgeBase.findOne({
        status: 'published',
        isActive: true,
        $or: [{ title: regex }, { content: regex }, { tags: regex }],
      })
        .sort({ createdAt: -1 })
        .lean();
      if (fallback) {
        return fallback;
      }
      const words = getSearchWords(q);
      if (words.length >= 2) {
        const wordConditions = words.map(word => {
          const variants = WORD_VARIANTS[word] || [word];
          const variantRegexps = variants.flatMap(v => [
            { title: new RegExp(escapeRegex(v), 'i') },
            { content: new RegExp(escapeRegex(v), 'i') },
            { tags: new RegExp(escapeRegex(v), 'i') },
          ]);
          return { $or: variantRegexps };
        });
        fallback = await KnowledgeBase.findOne({
          status: 'published',
          isActive: true,
          $and: wordConditions,
        })
          .sort({ createdAt: -1 })
          .lean();
        if (fallback) {
          return fallback;
        }
      }
      return null;
    } catch (err) {
      logger.error('KB findBestMatchForBotTextOnly error', err);
      return null;
    }
  }

  /**
   * Пошук статей KB
   * @param {String} query - Пошуковий запит
   * @param {Object} filters - Фільтри (category, status, tags)
   * @param {Object} options - Опції (page, limit, sortBy)
   * @returns {Object} - Результати пошуку
   */
  async searchArticles(query = '', filters = {}, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'relevance', // relevance, popularity, date, helpful
      } = options;

      const searchQuery = { isActive: true };

      // Фільтр за статусом
      if (filters.status === 'all') {
        // Не додаємо фільтр за статусом (показуємо всі)
      } else if (filters.status && filters.status !== 'undefined' && filters.status !== 'null') {
        searchQuery.status = filters.status;
      } else {
        // Якщо статус не передано, за замовчуванням показуємо тільки published
        searchQuery.status = 'published';
      }

      if (filters.isPublic !== undefined) {
        searchQuery.isPublic = filters.isPublic;
      }

      if (filters.tags && filters.tags.length > 0) {
        searchQuery.tags = { $in: filters.tags };
      }

      // Full-text пошук
      if (query && query.trim()) {
        searchQuery.$text = { $search: query.trim() };
      }

      // Сортування
      let sort = {};
      switch (sortBy) {
        case 'relevance':
          if (query && query.trim()) {
            sort = { score: { $meta: 'textScore' } };
          } else {
            sort = { createdAt: -1 };
          }
          break;
        case 'popularity':
          sort = { views: -1, helpfulCount: -1 };
          break;
        case 'date':
          sort = { createdAt: -1 };
          break;
        case 'helpful':
          sort = { helpfulCount: -1, helpfulRate: -1 };
          break;
        default:
          sort = { createdAt: -1 };
      }

      // Виконуємо пошук
      let articles;
      if (query && query.trim() && sortBy === 'relevance') {
        articles = await KnowledgeBase.find(searchQuery, {
          score: { $meta: 'textScore' },
        })
          .populate('createdBy', 'email firstName lastName')
          .sort(sort)
          .limit(parseInt(limit))
          .skip((parseInt(page) - 1) * parseInt(limit));
      } else {
        articles = await KnowledgeBase.find(searchQuery)
          .populate('createdBy', 'email firstName lastName')
          .sort(sort)
          .limit(parseInt(limit))
          .skip((parseInt(page) - 1) * parseInt(limit));
      }

      const total = await KnowledgeBase.countDocuments(searchQuery);

      return {
        articles,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      };
    } catch (error) {
      logger.error('Error searching KB articles:', error);
      throw error;
    }
  }

  /**
   * Знайти пов'язані статті
   * @param {String} articleId - ID статті
   * @param {Number} limit - Максимальна кількість статей
   * @returns {Array} - Масив пов'язаних статей
   */
  async findRelatedArticles(articleId, limit = 5) {
    try {
      const article = await KnowledgeBase.findById(articleId);
      if (!article) {
        return [];
      }

      // Знаходимо статті з такими ж тегами
      const relatedQuery = {
        _id: { $ne: articleId },
        status: 'published',
        isActive: true,
        isPublic: true,
      };

      if (article.tags && article.tags.length > 0) {
        relatedQuery.tags = { $in: article.tags };
      }

      const relatedArticles = await KnowledgeBase.find(relatedQuery)
        .populate('createdBy', 'email firstName lastName')
        .sort({ views: -1, helpfulCount: -1 })
        .limit(limit);

      return relatedArticles;
    } catch (error) {
      logger.error('Error finding related articles:', error);
      return [];
    }
  }

  /**
   * Генерація статті KB з вирішеного тикету (для AI інтеграції)
   * @param {String} ticketId - ID тикету
   * @returns {Object} - Дані для статті KB
   */
  async generateArticleFromTicket(ticketId) {
    try {
      const Ticket = require('../models/Ticket');
      const ticket = await Ticket.findById(ticketId).populate('assignedTo', 'email position');

      if (!ticket || (ticket.status !== 'resolved' && ticket.status !== 'closed')) {
        throw new Error('Ticket not found or not resolved');
      }

      // Створюємо базову структуру статті
      const articleData = {
        title: `Рішення: ${ticket.title}`,
        content: `## Проблема\n\n${ticket.description}\n\n## Рішення\n\n${ticket.comments && ticket.comments.length > 0 ? ticket.comments[ticket.comments.length - 1].content : 'Рішення не вказано'}\n\n## Додаткова інформація\n\n- Тикет: ${ticket.ticketNumber}\n- Пріоритет: ${ticket.priority}\n- Статус: ${ticket.status}`,
        tags: ticket.tags || [],
        status: 'draft', // Стаття створюється як чернетка
        metadata: {
          source: 'ticket',
          sourceTicket: ticketId,
        },
      };

      return articleData;
    } catch (error) {
      logger.error('Error generating article from ticket:', error);
      throw error;
    }
  }

  /**
   * Отримати популярні статті
   * @param {Number} limit - Максимальна кількість статей
   * @returns {Array} - Масив популярних статей
   */
  async getPopularArticles(limit = 10) {
    try {
      return await KnowledgeBase.find({ status: 'published', isActive: true })
        .sort({ views: -1, helpfulCount: -1 })
        .limit(limit)
        .populate('createdBy', 'email firstName lastName');
    } catch (error) {
      logger.error('Error getting popular articles:', error);
      return [];
    }
  }

  /**
   * Отримати нещодавні статті
   * @param {Number} limit - Максимальна кількість статей
   * @returns {Array} - Масив нещодавніх статей
   */
  async getRecentArticles(limit = 10) {
    try {
      return await KnowledgeBase.find({ status: 'published', isActive: true })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('createdBy', 'email firstName lastName');
    } catch (error) {
      logger.error('Error getting recent articles:', error);
      return [];
    }
  }
}

module.exports = new KBSearchService();
