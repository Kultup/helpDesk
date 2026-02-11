const KnowledgeBase = require('../models/KnowledgeBase');
const logger = require('../utils/logger');

class KBSearchService {
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
