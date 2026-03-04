const AIFeedback = require('../models/AIFeedback');
const logger = require('../utils/logger');

/**
 * Створити фідбек
 * POST /api/ai/feedback
 */
const createFeedback = async (req, res) => {
  try {
    const {
      conversationId,
      messageId,
      rating,
      feedback,
      category,
      aiResponse,
      userMessage,
      telegramId,
    } = req.body;

    if (!conversationId || !messageId || !rating) {
      return res.status(400).json({
        success: false,
        message: "conversationId, messageId та rating обов'язкові",
      });
    }

    const newFeedback = await AIFeedback.create({
      conversationId,
      userId: req.user._id,
      telegramId: telegramId || req.user.telegramId,
      messageId,
      rating,
      feedback,
      category,
      aiResponse,
      userMessage,
    });

    logger.info(`AI Feedback: створено фідбек ${newFeedback._id}`);

    res.status(201).json({
      success: true,
      data: newFeedback,
    });
  } catch (error) {
    logger.error('AI Feedback: помилка створення', error);
    res.status(500).json({
      success: false,
      message: 'Не вдалося створити фідбек',
    });
  }
};

/**
 * Отримати фідбеки користувача
 * GET /api/ai/feedback/my
 */
const getMyFeedback = async (req, res) => {
  try {
    const feedbacks = await AIFeedback.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('conversationId', 'messages');

    res.json({
      success: true,
      data: feedbacks,
    });
  } catch (error) {
    logger.error('AI Feedback: помилка отримання', error);
    res.status(500).json({
      success: false,
      message: 'Не вдалося отримати фідбеки',
    });
  }
};

/**
 * Отримати статистику фідбеків (для адмінів)
 * GET /api/ai/feedback/stats
 */
const getFeedbackStats = async (req, res) => {
  try {
    const stats = await AIFeedback.aggregate([
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: -1 },
      },
    ]);

    const total = stats.reduce((sum, s) => sum + s.count, 0);
    const avgRating =
      total > 0 ? (stats.reduce((sum, s) => sum + s._id * s.count, 0) / total).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        distribution: stats,
        total,
        averageRating: avgRating,
      },
    });
  } catch (error) {
    logger.error('AI Feedback: помилка статистики', error);
    res.status(500).json({
      success: false,
      message: 'Не вдалося отримати статистику',
    });
  }
};

/**
 * Позначити фідбек як опрацьований
 * PUT /api/ai/feedback/:id/resolve
 */
const resolveFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const feedback = await AIFeedback.findByIdAndUpdate(
      id,
      {
        resolved: true,
        adminNote,
      },
      { new: true }
    );

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Фідбек не знайдено',
      });
    }

    logger.info(`AI Feedback: опрацьовано ${id}`);

    res.json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    logger.error('AI Feedback: помилка оновлення', error);
    res.status(500).json({
      success: false,
      message: 'Не вдалося оновити фідбек',
    });
  }
};

module.exports = {
  createFeedback,
  getMyFeedback,
  getFeedbackStats,
  resolveFeedback,
};
