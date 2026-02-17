const BotConversation = require('../models/BotConversation');
const BotConversationMessage = require('../models/BotConversationMessage');
const logger = require('../utils/logger');

/**
 * Список розмов з ботом (адмін).
 * GET /api/conversations?page=1&limit=20&userId=...
 */
exports.list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const userId = req.query.userId || null;
    const skip = (page - 1) * limit;

    const filter = {};
    if (userId) {
      filter.user = userId;
    }

    const [conversations, total] = await Promise.all([
      BotConversation.find(filter)
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'firstName lastName email')
        .populate('ticket', 'ticketNumber title status')
        .lean(),
      BotConversation.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: conversations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error('conversationsController.list', err);
    res
      .status(500)
      .json({ success: false, message: 'Помилка отримання списку розмов', error: err.message });
  }
};

/**
 * Одна розмова з повідомленнями.
 * GET /api/conversations/:id
 */
exports.getById = async (req, res) => {
  try {
    const conversation = await BotConversation.findById(req.params.id)
      .populate('user', 'firstName lastName email telegramId telegramChatId')
      .populate('ticket', 'ticketNumber title status createdAt')
      .lean();
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Розмову не знайдено' });
    }

    const messages = await BotConversationMessage.find({ conversation: req.params.id })
      .sort({ createdAt: 1 })
      .select('role content createdAt')
      .lean();

    res.json({
      success: true,
      data: {
        ...conversation,
        messages,
      },
    });
  } catch (err) {
    logger.error('conversationsController.getById', err);
    res
      .status(500)
      .json({ success: false, message: 'Помилка отримання розмови', error: err.message });
  }
};
