const AIDialogHistory = require('../models/AIDialogHistory');
const logger = require('../utils/logger');

/**
 * Отримати список AI діалогів з фільтрами
 */
exports.getAIDialogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      outcome,
      userId,
      dateFrom,
      dateTo,
      search
    } = req.query;

    const query = {};

    // Фільтри
    if (status) query.status = status;
    if (outcome) query.outcome = outcome;
    if (userId) query.user = userId;
    
    if (dateFrom || dateTo) {
      query.startedAt = {};
      if (dateFrom) query.startedAt.$gte = new Date(dateFrom);
      if (dateTo) query.startedAt.$lte = new Date(dateTo);
    }

    // Пошук по username або імені
    if (search) {
      query.$or = [
        { telegramUsername: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
        { 'messages.content': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [dialogs, total] = await Promise.all([
      AIDialogHistory.find(query)
        .populate('user', 'username fullName telegramId')
        .populate('createdTicket', 'ticketNumber title status')
        .sort({ startedAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      AIDialogHistory.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        dialogs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Помилка отримання AI діалогів:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання AI діалогів',
      error: error.message
    });
  }
};

/**
 * Отримати конкретний AI діалог за ID
 */
exports.getAIDialogById = async (req, res) => {
  try {
    const { id } = req.params;

    const dialog = await AIDialogHistory.findById(id)
      .populate('user', 'username fullName telegramId email phone city institution position')
      .populate('createdTicket', 'ticketNumber title description status priority category subcategory createdAt')
      .lean();

    if (!dialog) {
      return res.status(404).json({
        success: false,
        message: 'AI діалог не знайдено'
      });
    }

    res.json({
      success: true,
      data: dialog
    });
  } catch (error) {
    logger.error('Помилка отримання AI діалогу:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання AI діалогу',
      error: error.message
    });
  }
};

/**
 * Отримати статистику AI діалогів
 */
exports.getAIDialogStats = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;

    const from = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = dateTo ? new Date(dateTo) : new Date();

    const stats = await AIDialogHistory.getStats(from, to);

    // Загальна кількість діалогів
    const totalDialogs = await AIDialogHistory.countDocuments({
      createdAt: { $gte: from, $lte: to }
    });

    // Кількість створених тікетів
    const ticketsCreated = await AIDialogHistory.countDocuments({
      createdAt: { $gte: from, $lte: to },
      outcome: 'ticket_created',
      createdTicket: { $ne: null }
    });

    // Середня тривалість діалогів
    const avgDuration = await AIDialogHistory.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, duration: { $gt: 0 } } },
      { $group: { _id: null, avgDuration: { $avg: '$duration' } } }
    ]);

    // Діалоги по статусах
    const byStatus = await AIDialogHistory.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Діалоги по результатах
    const byOutcome = await AIDialogHistory.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, outcome: { $ne: null } } },
      { $group: { _id: '$outcome', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        total: totalDialogs,
        ticketsCreated,
        avgDuration: avgDuration[0]?.avgDuration || 0,
        byStatus: byStatus.reduce((acc, item) => { acc[item._id] = item.count; return acc; }, {}),
        byOutcome: byOutcome.reduce((acc, item) => { acc[item._id] = item.count; return acc; }, {}),
        details: stats
      }
    });
  } catch (error) {
    logger.error('Помилка отримання статистики AI діалогів:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання статистики',
      error: error.message
    });
  }
};

/**
 * Видалити AI діалог (тільки для адміністраторів)
 */
exports.deleteAIDialog = async (req, res) => {
  try {
    const { id } = req.params;

    const dialog = await AIDialogHistory.findByIdAndDelete(id);

    if (!dialog) {
      return res.status(404).json({
        success: false,
        message: 'AI діалог не знайдено'
      });
    }

    logger.info(`🗑️ AI діалог ${id} видалено адміністратором ${req.user.username}`);

    res.json({
      success: true,
      message: 'AI діалог успішно видалено'
    });
  } catch (error) {
    logger.error('Помилка видалення AI діалогу:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка видалення AI діалогу',
      error: error.message
    });
  }
};
