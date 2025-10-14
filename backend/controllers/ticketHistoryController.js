const TicketHistory = require('../models/TicketHistory');
const Ticket = require('../models/Ticket');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Отримати історію змін тікету
exports.getTicketHistory = async (req, res) => {
  try {
    const { id: ticketId } = req.params;
    const {
      page = 1,
      limit = 20,
      includeHidden = false,
      actions,
      user,
      startDate,
      endDate
    } = req.query;

    // Перевіряємо, чи існує тікет
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тікет не знайдено'
      });
    }

    // Перевіряємо права доступу
    if (req.user.role !== 'admin' && 
        !ticket.assignedTo?.equals(req.user._id) && 
        !ticket.createdBy.equals(req.user._id) &&
        !ticket.watchers.includes(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для перегляду історії тікету'
      });
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      includeHidden: includeHidden === 'true' && req.user.role === 'admin',
      actions: actions ? actions.split(',') : null,
      user: user || null,
      startDate: startDate || null,
      endDate: endDate || null
    };

    const result = await TicketHistory.getTicketHistory(ticketId, options);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Error fetching ticket history:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні історії тікету',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Отримати статистику змін тікету
exports.getTicketChangeStats = async (req, res) => {
  try {
    const { id: ticketId } = req.params;

    // Перевіряємо, чи існує тікет
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тікет не знайдено'
      });
    }

    // Перевіряємо права доступу
    if (req.user.role !== 'admin' && 
        !ticket.assignedTo?.equals(req.user._id) && 
        !ticket.createdBy.equals(req.user._id) &&
        !ticket.watchers.includes(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для перегляду статистики тікету'
      });
    }

    const stats = await TicketHistory.getChangeStats(ticketId);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Error fetching ticket change stats:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні статистики змін тікету',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Додати запис до історії вручну (для адміністраторів)
exports.addHistoryEntry = async (req, res) => {
  try {
    // Перевіряємо валідацію
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    const { ticketId } = req.params;
    const { action, description, metadata = {}, isVisible = true } = req.body;

    // Тільки адміністратори можуть додавати записи вручну
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для додавання записів до історії'
      });
    }

    // Перевіряємо, чи існує тікет
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тікет не знайдено'
      });
    }

    const historyEntry = await TicketHistory.logChange(ticketId, action, req.user, {
      description,
      metadata,
      isVisible,
      isSystemGenerated: false
    });

    res.status(201).json({
      success: true,
      data: historyEntry,
      message: 'Запис додано до історії тікету'
    });

  } catch (error) {
    logger.error('Error adding history entry:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при додаванні запису до історії',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Оновити видимість запису історії
exports.updateHistoryVisibility = async (req, res) => {
  try {
    const { historyId } = req.params;
    const { isVisible } = req.body;

    // Тільки адміністратори можуть змінювати видимість
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для зміни видимості записів історії'
      });
    }

    const historyEntry = await TicketHistory.findByIdAndUpdate(
      historyId,
      { isVisible },
      { new: true }
    ).populate('user', 'firstName lastName email');

    if (!historyEntry) {
      return res.status(404).json({
        success: false,
        message: 'Запис історії не знайдено'
      });
    }

    res.json({
      success: true,
      data: historyEntry,
      message: 'Видимість запису оновлено'
    });

  } catch (error) {
    logger.error('Error updating history visibility:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при оновленні видимості запису',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Видалити запис з історії (тільки для адміністраторів)
exports.deleteHistoryEntry = async (req, res) => {
  try {
    const { historyId } = req.params;

    // Тільки адміністратори можуть видаляти записи
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для видалення записів історії'
      });
    }

    const historyEntry = await TicketHistory.findByIdAndDelete(historyId);

    if (!historyEntry) {
      return res.status(404).json({
        success: false,
        message: 'Запис історії не знайдено'
      });
    }

    res.json({
      success: true,
      message: 'Запис видалено з історії тікету'
    });

  } catch (error) {
    logger.error('Error deleting history entry:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні запису з історії',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
