const Rating = require('../models/Rating');
const Ticket = require('../models/Ticket');
const logger = require('../utils/logger');

// Створити новий рейтинг
const createRating = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { rating, categories, wouldRecommend } = req.body;
    const userId = req.user.id;

    logger.info(`🌟 Створення рейтингу для тікета ${ticketId} від користувача ${userId}`);

    // Перевіряємо, чи існує тікет
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тікет не знайдено'
      });
    }

    // Перевіряємо, чи користувач є автором тікета
    if (ticket.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Ви можете оцінити тільки свої тікети'
      });
    }

    // Перевіряємо, чи тікет закритий
    if (ticket.status !== 'Вирішений' && ticket.status !== 'Закритий') {
      return res.status(400).json({
        success: false,
        message: 'Можна оцінити тільки закриті або вирішені тікети'
      });
    }

    // Перевіряємо, чи вже існує рейтинг для цього тікета
    const existingRating = await Rating.findOne({ ticket: ticketId });
    if (existingRating) {
      return res.status(400).json({
        success: false,
        message: 'Рейтинг для цього тікета вже існує'
      });
    }

    // Створюємо новий рейтинг
    const newRating = new Rating({
      ticket: ticketId,
      user: userId,
      rating,
      categories,
      wouldRecommend
    });

    await newRating.save();

    // Заповнюємо дані для відповіді
    await newRating.populate(['ticket', 'user']);

    logger.info(`✅ Рейтинг створено успішно для тікета ${ticketId}`);

    res.status(201).json({
      success: true,
      message: 'Рейтинг створено успішно',
      data: newRating
    });

  } catch (error) {
    logger.error('❌ Помилка при створенні рейтингу:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

// Отримати рейтинг тікета
const getRatingByTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const rating = await Rating.findOne({ ticket: ticketId })
      .populate('user', 'firstName lastName email')
      .populate('ticket', 'title status');

    if (!rating) {
      return res.status(404).json({
        success: false,
        message: 'Рейтинг не знайдено'
      });
    }

    res.json({
      success: true,
      data: rating
    });

  } catch (error) {
    logger.error('❌ Помилка при отриманні рейтингу:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

// Отримати всі рейтинги (для адміністраторів)
const getAllRatings = async (req, res) => {
  try {
    const { page = 1, limit = 10, rating: ratingFilter, startDate, endDate, source } = req.query;

    const query = {};

    // Фільтр по рейтингу
    if (ratingFilter) {
      query.rating = parseInt(ratingFilter);
    }

    // Фільтр по джерелу
    if (source) {
      query.source = source;
    }

    // Фільтр по даті
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const ratings = await Rating.find(query)
      .populate('user', 'firstName lastName email')
      .populate('ticket', 'title status category')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Rating.countDocuments(query);

    res.json({
      success: true,
      data: {
        ratings,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    logger.error('❌ Помилка при отриманні рейтингів:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

// Отримати статистику рейтингів
const getRatingStats = async (req, res) => {
  try {
    const { period = '30', source } = req.query; // За замовчуванням 30 днів

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Базовий фільтр для джерела та періоду
    const periodFilter = {
      createdAt: { $gte: startDate, $lte: new Date() }
    };
    const sourceFilter = source ? { source } : {};
    const combinedFilter = { ...periodFilter, ...sourceFilter };

    // Загальна статистика з фільтром по джерелу та періоду
    const generalStats = await Rating.aggregate([
      { $match: combinedFilter },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalRatings: { $sum: 1 },
          averageSpeed: { $avg: '$categories.speed' },
          averageQuality: { $avg: '$categories.quality' },
          averageCommunication: { $avg: '$categories.communication' },
          averageProfessionalism: { $avg: '$categories.professionalism' }
        }
      }
    ]);
    
    const generalStatsResult = generalStats.length > 0 ? generalStats[0] : {
      _id: null,
      averageRating: 0,
      totalRatings: 0,
      averageSpeed: null,
      averageQuality: null,
      averageCommunication: null,
      averageProfessionalism: null
    };

    // Розподіл рейтингів з фільтром по джерелу та періоду
    const distributionStats = await Rating.aggregate([
      { $match: combinedFilter },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Статистика за період з фільтром по джерелу та періоду
    const periodQuery = combinedFilter;
    const periodRatings = await Rating.find(periodQuery);


    // Статистика по категоріях з фільтром по джерелу та періоду
    const categoryStats = await Rating.aggregate([
      { $match: combinedFilter },
      {
        $group: {
          _id: null,
          avgSpeed: { $avg: '$categories.speed' },
          avgQuality: { $avg: '$categories.quality' },
          avgCommunication: { $avg: '$categories.communication' },
          avgProfessionalism: { $avg: '$categories.professionalism' }
        }
      }
    ]);

    // Рекомендації з фільтром по джерелу та періоду (тільки позитивні)
    const recommendationStats = await Rating.aggregate([
      { 
        $match: { 
          ...combinedFilter,
          wouldRecommend: true 
        } 
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        general: {
          distribution: distributionStats,
          total: generalStatsResult.totalRatings,
          average: generalStatsResult
        },
        period: {
          days: parseInt(period),
          ratings: periodRatings.length,
          average: periodRatings.length > 0 
            ? periodRatings.reduce((sum, r) => sum + r.rating, 0) / periodRatings.length 
            : 0
        },
        detailed: distributionStats.map(item => ({
          _id: item._id,
          count: item.count,
          percentage: generalStatsResult.totalRatings > 0 
            ? (item.count / generalStatsResult.totalRatings) * 100 
            : 0
        })),
        categories: categoryStats[0] || {},
        recommendations: recommendationStats
      }
    });

  } catch (error) {
    logger.error('❌ Помилка при отриманні статистики рейтингів:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

// Оновити рейтинг
const updateRating = async (req, res) => {
  try {
    const { ratingId } = req.params;
    const { rating, categories, wouldRecommend } = req.body;
    const userId = req.user.id;

    const existingRating = await Rating.findById(ratingId);
    if (!existingRating) {
      return res.status(404).json({
        success: false,
        message: 'Рейтинг не знайдено'
      });
    }

    // Перевіряємо, чи користувач є автором рейтингу
    if (existingRating.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Ви можете редагувати тільки свої рейтинги'
      });
    }

    // Оновлюємо рейтинг
    existingRating.rating = rating || existingRating.rating;
    existingRating.categories = categories || existingRating.categories;
    existingRating.wouldRecommend = wouldRecommend !== undefined ? wouldRecommend : existingRating.wouldRecommend;

    await existingRating.save();
    await existingRating.populate(['ticket', 'user']);

    logger.info(`✅ Рейтинг ${ratingId} оновлено успішно`);

    res.json({
      success: true,
      message: 'Рейтинг оновлено успішно',
      data: existingRating
    });

  } catch (error) {
    logger.error('❌ Помилка при оновленні рейтингу:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

// Видалити рейтинг
const deleteRating = async (req, res) => {
  try {
    const { ratingId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const rating = await Rating.findById(ratingId);
    if (!rating) {
      return res.status(404).json({
        success: false,
        message: 'Рейтинг не знайдено'
      });
    }

    // Перевіряємо права доступу
    if (rating.user.toString() !== userId && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для видалення цього рейтингу'
      });
    }

    await Rating.findByIdAndDelete(ratingId);

    logger.info(`✅ Рейтинг ${ratingId} видалено успішно`);

    res.json({
      success: true,
      message: 'Рейтинг видалено успішно'
    });

  } catch (error) {
    logger.error('❌ Помилка при видаленні рейтингу:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

module.exports = {
  createRating,
  getRatingByTicket,
  getAllRatings,
  getRatingStats,
  updateRating,
  deleteRating
};