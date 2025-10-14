const Event = require('../models/Event');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Отримати всі події користувача
const getEvents = async (req, res) => {
  try {
    const { startDate, endDate, dateFrom, dateTo, type, status, limit = 50, skip = 0 } = req.query;
    const userId = req.user.id;

    let filter = { isDeleted: false };

    // Фільтр по даті (підтримуємо обидва формати параметрів)
    const fromDate = dateFrom || startDate;
    const toDate = dateTo || endDate;
    
    if (fromDate && toDate) {
      filter.date = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate)
      };
    } else if (fromDate) {
      filter.date = { $gte: new Date(fromDate) };
    } else if (toDate) {
      filter.date = { $lte: new Date(toDate) };
    }

    // Фільтр по типу
    if (type) {
      filter.type = type;
    }

    // Фільтр по статусу
    if (status) {
      filter.status = status;
    }

    const events = await Event.find(filter)
      .populate('author', 'name email')
      .populate('attendees', 'name email')
      .sort({ date: 1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    res.json({
      success: true,
      data: events,
      count: events.length
    });

  } catch (error) {
    logger.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні подій'
    });
  }
};

// Отримати подію за ID
const getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID події'
      });
    }

    const event = await Event.findOne({
      _id: id,
      author: userId,
      isDeleted: false
    })
      .populate('author', 'name email')
      .populate('attendees', 'name email');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Подію не знайдено'
      });
    }

    res.json({
      success: true,
      data: event
    });

  } catch (error) {
    logger.error('Error fetching event:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні події'
    });
  }
};

// Створити нову подію
const createEvent = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    const {
      title,
      description,
      date,
      type,
      priority,
      isAllDay,
      startTime,
      endTime,
      location,
      attendees,
      reminderMinutes,
      tags
    } = req.body;

    const event = new Event({
      title,
      description,
      date: new Date(date),
      type,
      priority,
      author: req.user.id,
      isAllDay,
      startTime,
      endTime,
      location,
      attendees: attendees || [],
      reminderMinutes: reminderMinutes || 0,
      tags: tags || []
    });

    await event.save();
    await event.populate('author', 'name email');
    await event.populate('attendees', 'name email');

    logger.info(`Event created: ${event._id} by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Подію успішно створено',
      data: event
    });

  } catch (error) {
    logger.error('Error creating event:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при створенні події'
    });
  }
};

// Оновити подію
const updateEvent = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID події'
      });
    }

    const event = await Event.findOne({
      _id: id,
      author: userId,
      isDeleted: false
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Подію не знайдено'
      });
    }

    const {
      title,
      description,
      date,
      type,
      priority,
      isAllDay,
      startTime,
      endTime,
      location,
      attendees,
      reminderMinutes,
      tags,
      status
    } = req.body;

    // Оновлюємо поля
    if (title !== undefined) event.title = title;
    if (description !== undefined) event.description = description;
    if (date !== undefined) event.date = new Date(date);
    if (type !== undefined) event.type = type;
    if (priority !== undefined) event.priority = priority;
    if (isAllDay !== undefined) event.isAllDay = isAllDay;
    if (startTime !== undefined) event.startTime = startTime;
    if (endTime !== undefined) event.endTime = endTime;
    if (location !== undefined) event.location = location;
    if (attendees !== undefined) event.attendees = attendees;
    if (reminderMinutes !== undefined) event.reminderMinutes = reminderMinutes;
    if (tags !== undefined) event.tags = tags;
    if (status !== undefined) event.status = status;

    // Скидаємо нагадування якщо дата змінилась
    if (date !== undefined) {
      event.isReminderSent = false;
    }

    await event.save();
    await event.populate('author', 'name email');
    await event.populate('attendees', 'name email');

    logger.info(`Event updated: ${event._id} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Подію успішно оновлено',
      data: event
    });

  } catch (error) {
    logger.error('Error updating event:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при оновленні події'
    });
  }
};

// Видалити подію
const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID події'
      });
    }

    const event = await Event.findOne({
      _id: id,
      author: userId,
      isDeleted: false
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Подію не знайдено'
      });
    }

    await event.softDelete(userId);

    logger.info(`Event deleted: ${event._id} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Подію успішно видалено'
    });

  } catch (error) {
    logger.error('Error deleting event:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні події'
    });
  }
};

// Отримати майбутні події
const getUpcomingEvents = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const userId = req.user.id;

    const events = await Event.findUpcoming(userId, parseInt(limit));

    res.json({
      success: true,
      data: events,
      count: events.length
    });

  } catch (error) {
    logger.error('Error fetching upcoming events:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні майбутніх подій'
    });
  }
};

// Додати учасника до події
const addAttendee = async (req, res) => {
  try {
    const { id } = req.params;
    const { attendeeId } = req.body;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(attendeeId)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID'
      });
    }

    const event = await Event.findOne({
      _id: id,
      author: userId,
      isDeleted: false
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Подію не знайдено'
      });
    }

    await event.addAttendee(attendeeId);
    await event.populate('attendees', 'name email');

    res.json({
      success: true,
      message: 'Учасника додано',
      data: event
    });

  } catch (error) {
    logger.error('Error adding attendee:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при додаванні учасника'
    });
  }
};

// Видалити учасника з події
const removeAttendee = async (req, res) => {
  try {
    const { id, attendeeId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(attendeeId)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID'
      });
    }

    const event = await Event.findOne({
      _id: id,
      author: userId,
      isDeleted: false
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Подію не знайдено'
      });
    }

    await event.removeAttendee(attendeeId);
    await event.populate('attendees', 'name email');

    res.json({
      success: true,
      message: 'Учасника видалено',
      data: event
    });

  } catch (error) {
    logger.error('Error removing attendee:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні учасника'
    });
  }
};

// Позначити подію як завершену
const markCompleted = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID події'
      });
    }

    const event = await Event.findOne({
      _id: id,
      author: userId,
      isDeleted: false
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Подію не знайдено'
      });
    }

    await event.markCompleted();

    res.json({
      success: true,
      message: 'Подію позначено як завершену',
      data: event
    });

  } catch (error) {
    logger.error('Error marking event as completed:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при позначенні події як завершеної'
    });
  }
};

// Скасувати подію
const cancelEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID події'
      });
    }

    const event = await Event.findOne({
      _id: id,
      author: userId,
      isDeleted: false
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Подію не знайдено'
      });
    }

    await event.cancel();

    res.json({
      success: true,
      message: 'Подію скасовано',
      data: event
    });

  } catch (error) {
    logger.error('Error cancelling event:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при скасуванні події'
    });
  }
};

module.exports = {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getUpcomingEvents,
  addAttendee,
  removeAttendee,
  markAsCompleted: markCompleted,
  cancelEvent
};