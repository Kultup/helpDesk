const { TimeEntry, Ticket } = require('../models');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Почати відстеження часу
const startTimeTracking = async (req, res) => {
  try {
    const { id: ticketId } = req.params;
    const userId = req.user.id;
    const { description } = req.body;

    // Перевірити, чи існує тікет
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тікет не знайдено'
      });
    }

    // Перевірити, чи немає активної сесії для цього користувача на цьому тікеті
    const existingActiveSession = await TimeEntry.getActiveSession(ticketId, userId);
    if (existingActiveSession) {
      return res.status(400).json({
        success: false,
        message: 'У вас вже є активна сесія відстеження часу для цього тікету',
        activeSession: existingActiveSession
      });
    }

    // Створити новий запис часу
    const timeEntry = new TimeEntry({
      ticket: ticketId,
      user: userId,
      startTime: new Date(),
      description: description || '',
      isActive: true,
      createdBy: userId
    });

    await timeEntry.save();

    // Повернути створений запис з популяцією
    const populatedTimeEntry = await TimeEntry.findById(timeEntry._id)
      .populate('user', 'email firstName lastName')
      .populate('ticket', 'title status');

    res.status(201).json({
      success: true,
      message: 'Відстеження часу розпочато',
      data: populatedTimeEntry
    });

  } catch (error) {
    logger.error('Помилка при початку відстеження часу:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Зупинити відстеження часу
const stopTimeTracking = async (req, res) => {
  try {
    const { id: ticketId } = req.params;
    const userId = req.user.id;

    // Знайти активну сесію
    const activeSession = await TimeEntry.getActiveSession(ticketId, userId);
    if (!activeSession) {
      return res.status(404).json({
        success: false,
        message: 'Активна сесія відстеження часу не знайдена'
      });
    }

    // Зупинити сесію
    activeSession.stop();
    activeSession.updatedBy = userId;
    await activeSession.save();

    // Повернути оновлений запис
    const populatedTimeEntry = await TimeEntry.findById(activeSession._id)
      .populate('user', 'email firstName lastName')
      .populate('ticket', 'title status');

    res.json({
      success: true,
      message: 'Відстеження часу зупинено',
      data: populatedTimeEntry
    });

  } catch (error) {
    logger.error('Помилка при зупинці відстеження часу:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Отримати записи часу для тікету
const getTimeEntries = async (req, res) => {
  try {
    const { id: ticketId } = req.params;
    const { page = 1, limit = 10, userId } = req.query;

    // Перевірити, чи існує тікет
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тікет не знайдено'
      });
    }

    // Побудувати фільтр
    const filter = { ticket: ticketId };
    if (userId) {
      filter.user = userId;
    }

    // Отримати записи з пагінацією
    const skip = (page - 1) * limit;
    const timeEntries = await TimeEntry.find(filter)
      .populate('user', 'email firstName lastName')
      .populate('createdBy', 'email firstName lastName')
      .populate('updatedBy', 'email firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Підрахувати загальну кількість
    const total = await TimeEntry.countDocuments(filter);

    // Отримати загальний час для тікету
    const totalTimeResult = await TimeEntry.getTotalTimeForTicket(ticketId);
    const totalTime = totalTimeResult.length > 0 ? totalTimeResult[0].totalDuration : 0;

    res.json({
      success: true,
      data: {
        timeEntries,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        },
        totalTime,
        totalTimeFormatted: formatDuration(totalTime)
      }
    });

  } catch (error) {
    logger.error('Помилка при отриманні записів часу:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Отримати активну сесію для тікету
const getActiveSession = async (req, res) => {
  try {
    const { id: ticketId } = req.params;
    const userId = req.user.id;

    const activeSession = await TimeEntry.getActiveSession(ticketId, userId);

    if (!activeSession) {
      return res.json({
        success: true,
        data: null,
        message: 'Активна сесія не знайдена'
      });
    }

    res.json({
      success: true,
      data: activeSession
    });

  } catch (error) {
    logger.error('Помилка при отриманні активної сесії:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Видалити запис часу
const deleteTimeEntry = async (req, res) => {
  try {
    const { id: ticketId, entryId } = req.params;
    const userId = req.user.id;

    const timeEntry = await TimeEntry.findOne({
      _id: entryId,
      ticket: ticketId
    });

    if (!timeEntry) {
      return res.status(404).json({
        success: false,
        message: 'Запис часу не знайдено'
      });
    }

    // Перевірити права доступу (тільки власник або адмін)
    if (timeEntry.user.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для видалення цього запису'
      });
    }

    // Не дозволяти видаляти активні сесії
    if (timeEntry.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Неможливо видалити активну сесію. Спочатку зупиніть відстеження часу.'
      });
    }

    await TimeEntry.findByIdAndDelete(entryId);

    res.json({
      success: true,
      message: 'Запис часу видалено'
    });

  } catch (error) {
    logger.error('Помилка при видаленні запису часу:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Оновити опис запису часу
const updateTimeEntry = async (req, res) => {
  try {
    const { id: ticketId, entryId } = req.params;
    const { description } = req.body;
    const userId = req.user.id;

    const timeEntry = await TimeEntry.findOne({
      _id: entryId,
      ticket: ticketId
    });

    if (!timeEntry) {
      return res.status(404).json({
        success: false,
        message: 'Запис часу не знайдено'
      });
    }

    // Перевірити права доступу
    if (timeEntry.user.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для редагування цього запису'
      });
    }

    timeEntry.description = description;
    timeEntry.updatedBy = userId;
    await timeEntry.save();

    const populatedTimeEntry = await TimeEntry.findById(timeEntry._id)
      .populate('user', 'email firstName lastName')
      .populate('createdBy', 'email firstName lastName')
      .populate('updatedBy', 'email firstName lastName');

    res.json({
      success: true,
      message: 'Запис часу оновлено',
      data: populatedTimeEntry
    });

  } catch (error) {
    logger.error('Помилка при оновленні запису часу:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Допоміжна функція для форматування тривалості
const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}г ${minutes}хв`;
};

module.exports = {
  startTimeTracking,
  stopTimeTracking,
  getTimeEntries,
  getActiveSession,
  deleteTimeEntry,
  updateTimeEntry
};
