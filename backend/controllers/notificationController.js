const Notification = require('../models/Notification');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const telegramService = require('../services/telegramServiceInstance');
const logger = require('../utils/logger');

// Отримати всі сповіщення користувача
exports.getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, read } = req.query;
    const userId = req.user.id;

    // Фільтри
    const filter = { userId };
    if (type) filter.type = type;
    if (read !== undefined) filter.read = read === 'true';

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('relatedTicket', 'title status')
      .lean();

    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({ 
      userId, 
      read: false 
    });

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        unreadCount
      }
    });
  } catch (error) {
    logger.error('Помилка отримання сповіщень:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні сповіщень'
    });
  }
};

// Створити нове сповіщення
exports.createNotification = async (req, res) => {
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
      userId, 
      type, 
      title, 
      message, 
      relatedTicket,
      priority = 'medium',
      sendTelegram = false 
    } = req.body;

    // Перевіряємо чи існує користувач
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    const notification = new Notification({
      userId,
      type,
      title,
      message,
      relatedTicket,
      priority,
      createdBy: req.user.id
    });

    await notification.save();

    // Відправляємо в Telegram якщо потрібно
    if (sendTelegram && user.telegramId) {
      try {
        await telegramService.sendNotification(user.telegramId, {
          title,
          message,
          type
        });
        notification.sentToTelegram = true;
        await notification.save();
      } catch (telegramError) {
        logger.error('Помилка відправки в Telegram:', telegramError);
      }
    }

    await notification.populate('relatedTicket', 'title status');

    res.status(201).json({
      success: true,
      data: notification,
      message: 'Сповіщення створено успішно'
    });
  } catch (error) {
    logger.error('Помилка створення сповіщення:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при створенні сповіщення'
    });
  }
};

// Масове створення сповіщень
exports.createBulkNotifications = async (req, res) => {
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
      userIds, 
      type, 
      title, 
      message, 
      relatedTicket,
      priority = 'medium',
      sendTelegram = false 
    } = req.body;

    // Перевіряємо користувачів
    const users = await User.find({ _id: { $in: userIds } });
    if (users.length !== userIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Деякі користувачі не знайдені'
      });
    }

    const notifications = userIds.map(userId => ({
      userId,
      type,
      title,
      message,
      relatedTicket,
      priority,
      createdBy: req.user.id
    }));

    const createdNotifications = await Notification.insertMany(notifications);

    // Відправляємо в Telegram якщо потрібно
    if (sendTelegram) {
      const telegramPromises = users
        .filter(user => user.telegramId)
        .map(async (user) => {
          try {
            await telegramService.sendNotification(user.telegramId, {
              title,
              message,
              type
            });
            return user._id;
          } catch (error) {
            logger.error(`Помилка відправки в Telegram для користувача ${user._id}:`, error);
            return null;
          }
        });

      const sentToTelegram = await Promise.all(telegramPromises);
      const successfulSends = sentToTelegram.filter(id => id !== null);

      // Оновлюємо статус відправки
      if (successfulSends.length > 0) {
        await Notification.updateMany(
          { 
            userId: { $in: successfulSends },
            createdBy: req.user.id,
            createdAt: { $gte: new Date(Date.now() - 1000) } // останні секунди
          },
          { sentToTelegram: true }
        );
      }
    }

    res.status(201).json({
      success: true,
      data: {
        created: createdNotifications.length,
        notifications: createdNotifications
      },
      message: `Створено ${createdNotifications.length} сповіщень`
    });
  } catch (error) {
    logger.error('Помилка масового створення сповіщень:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при створенні сповіщень'
    });
  }
};

// Позначити сповіщення як прочитане
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { read: true, readAt: new Date() },
      { new: true }
    ).populate('relatedTicket', 'title status');

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Сповіщення не знайдено'
      });
    }

    res.json({
      success: true,
      data: notification,
      message: 'Сповіщення позначено як прочитане'
    });
  } catch (error) {
    logger.error('Помилка позначення сповіщення як прочитаного:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при оновленні сповіщення'
    });
  }
};

// Позначити всі сповіщення як прочитані
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await Notification.updateMany(
      { userId, read: false },
      { read: true, readAt: new Date() }
    );

    res.json({
      success: true,
      data: {
        modifiedCount: result.modifiedCount
      },
      message: `Позначено ${result.modifiedCount} сповіщень як прочитані`
    });
  } catch (error) {
    logger.error('Помилка позначення всіх сповіщень як прочитаних:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при оновленні сповіщень'
    });
  }
};

// Видалити сповіщення
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOneAndDelete({ _id: id, userId });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Сповіщення не знайдено'
      });
    }

    res.json({
      success: true,
      message: 'Сповіщення видалено успішно'
    });
  } catch (error) {
    logger.error('Помилка видалення сповіщення:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при видаленні сповіщення'
    });
  }
};

// Отримати налаштування сповіщень користувача
exports.getNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('notificationSettings');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    const defaultSettings = {
      email: true,
      telegram: true,
      types: {
        ticket_created: true,
        ticket_updated: true,
        ticket_assigned: true,
        ticket_resolved: true,
        comment_added: true,
        system: true
      }
    };

    res.json({
      success: true,
      data: user.notificationSettings || defaultSettings
    });
  } catch (error) {
    logger.error('Помилка отримання налаштувань сповіщень:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні налаштувань'
    });
  }
};

// Оновити налаштування сповіщень
exports.updateNotificationSettings = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const settings = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { notificationSettings: settings },
      { new: true }
    ).select('notificationSettings');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    res.json({
      success: true,
      data: user.notificationSettings,
      message: 'Налаштування сповіщень оновлено'
    });
  } catch (error) {
    logger.error('Помилка оновлення налаштувань сповіщень:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при оновленні налаштувань'
    });
  }
};

// Тестове сповіщення
exports.sendTestNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type = 'telegram' } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    if (type === 'telegram') {
      if (!user.telegramId) {
        return res.status(400).json({
          success: false,
          message: 'Telegram не підключений до акаунту'
        });
      }

      try {
        await telegramService.sendNotification(user.telegramId, {
          title: 'Тестове сповіщення',
          message: 'Це тестове сповіщення для перевірки роботи системи',
          type: 'info'
        });

        res.json({
          success: true,
          message: 'Тестове сповіщення відправлено в Telegram'
        });
      } catch (telegramError) {
        logger.error('Помилка відправки тестового сповіщення в Telegram:', telegramError);
        res.status(500).json({
          success: false,
          message: 'Помилка відправки в Telegram'
        });
      }
    } else {
      res.status(400).json({
        success: false,
        message: 'Невідомий тип тестового сповіщення'
      });
    }
  } catch (error) {
    logger.error('Помилка відправки тестового сповіщення:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при відправці тестового сповіщення'
    });
  }
};

// Очистити старі сповіщення
exports.cleanupOldNotifications = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await Notification.deleteMany({
      createdAt: { $lt: cutoffDate },
      read: true
    });

    res.json({
      success: true,
      data: {
        deletedCount: result.deletedCount
      },
      message: `Видалено ${result.deletedCount} старих сповіщень`
    });
  } catch (error) {
    logger.error('Помилка очищення старих сповіщень:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при очищенні сповіщень'
    });
  }
};

// Статистика сповіщень
exports.getNotificationStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await Notification.aggregate([
      { $match: { userId: userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          unread: {
            $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] }
          },
          byType: {
            $push: {
              type: '$type',
              read: '$read'
            }
          }
        }
      }
    ]);

    const typeStats = {};
    if (stats[0]?.byType) {
      stats[0].byType.forEach(item => {
        if (!typeStats[item.type]) {
          typeStats[item.type] = { total: 0, unread: 0 };
        }
        typeStats[item.type].total++;
        if (!item.read) {
          typeStats[item.type].unread++;
        }
      });
    }

    res.json({
      success: true,
      data: {
        total: stats[0]?.total || 0,
        unread: stats[0]?.unread || 0,
        byType: typeStats
      }
    });
  } catch (error) {
    logger.error('Помилка отримання статистики сповіщень:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні статистики'
    });
  }
};
