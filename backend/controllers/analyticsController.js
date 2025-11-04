const Ticket = require('../models/Ticket');
const User = require('../models/User');
const City = require('../models/City');
const Comment = require('../models/Comment');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Отримати загальну статистику
exports.getOverview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Базовий фільтр за датами
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    
    const filter = {};
    if (Object.keys(dateFilter).length > 0) {
      filter.createdAt = dateFilter;
    }

    // Загальна кількість тикетів
    const totalTickets = await Ticket.countDocuments(filter);
    
    // Статистика по статусах
    const statusStats = await Ticket.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Статистика по пріоритетах
    const priorityStats = await Ticket.aggregate([
      { $match: filter },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    // Середній час вирішення
    const avgResolutionTime = await Ticket.aggregate([
      { 
        $match: { 
          ...filter, 
          status: 'resolved',
          resolvedAt: { $exists: true }
        } 
      },
      {
        $project: {
          resolutionTime: {
            $divide: [
              { $subtract: ['$resolvedAt', '$createdAt'] },
              1000 * 60 * 60 // конвертація в години
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgTime: { $avg: '$resolutionTime' }
        }
      }
    ]);

    // Активні користувачі
    const activeUsers = await User.countDocuments({ 
      lastLogin: { 
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // останні 30 днів
      } 
    });

    // Статистика користувачів
    const userFilter = {};
    if (Object.keys(dateFilter).length > 0) {
      userFilter.createdAt = dateFilter;
    }

    // Загальна кількість користувачів
    const totalUsers = await User.countDocuments(userFilter);

    // Статистика по джерелах реєстрації
    const registrationSourceStats = await User.aggregate([
      { $match: userFilter },
      { 
        $group: { 
          _id: '$metadata.registrationSource', 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } }
    ]);

    // Прирост користувачів за останні 30 днів
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newUsersLast30Days = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Прирост користувачів за останні 7 днів
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsersLast7Days = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Статистика по статусах реєстрації
    const registrationStatusStats = await User.aggregate([
      { $match: userFilter },
      { 
        $group: { 
          _id: '$registrationStatus', 
          count: { $sum: 1 } 
        } 
      }
    ]);

    // Щоденна статистика реєстрацій за останні 30 днів
    const dailyRegistrations = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Щоденна статистика тикетів за останні 14 днів (для тренду часу)
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    
    // Створені тикети за день
    const ticketsByDay = await Ticket.aggregate([
      {
        $match: {
          createdAt: { $gte: fourteenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Вирішені тикети за день (за датою вирішення)
    const resolvedTicketsByDay = await Ticket.aggregate([
      {
        $match: {
          resolvedAt: { $exists: true, $gte: fourteenDaysAgo },
          status: 'resolved'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$resolvedAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalTickets,
          activeUsers,
          highPriorityTickets: priorityStats.find(p => p._id === 'high')?.count || 0
        },
        ticketsByStatus: statusStats,
        ticketsByPriority: priorityStats,
        ticketsByDay,
        resolvedTicketsByDay,
        avgResolutionTime: avgResolutionTime[0]?.avgTime ? Math.round(avgResolutionTime[0].avgTime * 100) / 100 : 0,
        userStats: {
          totalUsers,
          newUsersLast30Days,
          newUsersLast7Days,
          registrationSourceStats,
          registrationStatusStats,
          dailyRegistrations
        }
      }
    });
  } catch (error) {
    logger.error('Помилка отримання загальної статистики:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні статистики'
    });
  }
};

// Статистика по містах
exports.getCitiesStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    
    const matchFilter = {};
    if (Object.keys(dateFilter).length > 0) {
      matchFilter.createdAt = dateFilter;
    }

    const citiesStats = await Ticket.aggregate([
      { $match: matchFilter },
      {
        $lookup: {
          from: 'cities',
          localField: 'city',
          foreignField: '_id',
          as: 'cityInfo'
        }
      },
      { $unwind: '$cityInfo' },
      {
        $group: {
          _id: '$city',
          cityName: { $first: '$cityInfo.name' },
          region: { $first: '$cityInfo.region' },
          coordinates: { $first: '$cityInfo.coordinates' },
          totalTickets: { $sum: 1 },
          openTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] }
          },
          inProgressTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          },
          resolvedTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
          },
          closedTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] }
          }
        }
      },
      { $sort: { totalTickets: -1 } }
    ]);

    res.json({
      success: true,
      data: citiesStats
    });
  } catch (error) {
    logger.error('Помилка отримання статистики по містах:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні статистики по містах'
    });
  }
};

// Статистика по користувачах
exports.getUsersStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    
    const matchFilter = {};
    if (Object.keys(dateFilter).length > 0) {
      matchFilter.createdAt = dateFilter;
    }

    const usersStats = await Ticket.aggregate([
      { $match: matchFilter },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedTo',
          foreignField: '_id',
          as: 'assignedUser'
        }
      },
      { $unwind: { path: '$assignedUser', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$assignedTo',
          userName: { $first: '$assignedUser.email' },
          position: { $first: '$assignedUser.position' },
          totalAssigned: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
          },
          avgResolutionTime: {
            $avg: {
              $cond: [
                { $and: [{ $eq: ['$status', 'resolved'] }, { $ne: ['$resolvedAt', null] }] },
                {
                  $divide: [
                    { $subtract: ['$resolvedAt', '$createdAt'] },
                    1000 * 60 * 60 // години
                  ]
                },
                null
              ]
            }
          }
        }
      },
      {
        $project: {
          userName: 1,
          position: 1,
          totalAssigned: 1,
          resolved: 1,
          resolutionRate: {
            $cond: [
              { $gt: ['$totalAssigned', 0] },
              { $multiply: [{ $divide: ['$resolved', '$totalAssigned'] }, 100] },
              0
            ]
          },
          avgResolutionTime: { $ifNull: ['$avgResolutionTime', 0] }
        }
      },
      { $sort: { resolutionRate: -1 } }
    ]);

    res.json({
      success: true,
      data: usersStats
    });
  } catch (error) {
    logger.error('Помилка отримання статистики по користувачах:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні статистики по користувачах'
    });
  }
};

// Тренди по часу
exports.getTimelineStats = async (req, res) => {
  try {
    const { period = 'month', startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    
    const matchFilter = {};
    if (Object.keys(dateFilter).length > 0) {
      matchFilter.createdAt = dateFilter;
    }

    // Визначаємо формат групування за періодом
    let dateFormat;
    switch (period) {
      case 'day':
        dateFormat = '%Y-%m-%d';
        break;
      case 'week':
        dateFormat = '%Y-%U';
        break;
      case 'month':
        dateFormat = '%Y-%m';
        break;
      case 'year':
        dateFormat = '%Y';
        break;
      default:
        dateFormat = '%Y-%m';
    }

    const timelineStats = await Ticket.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          created: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: timelineStats
    });
  } catch (error) {
    logger.error('Помилка отримання статистики по часу:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні статистики по часу'
    });
  }
};

// Експорт даних
exports.exportData = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    const { format = 'json', type = 'tickets', startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    
    const filter = {};
    if (Object.keys(dateFilter).length > 0) {
      filter.createdAt = dateFilter;
    }

    let data;
    let filename;

    switch (type) {
      case 'tickets':
        data = await Ticket.find(filter)
          .populate('city', 'name region')
          .populate('assignedTo', 'email position')
          .populate('createdBy', 'email')
          .lean();
        filename = `tickets_export_${Date.now()}`;
        break;
      
      case 'analytics':
        data = await exports.getOverview({ query: req.query }, { json: (data) => data });
        filename = `analytics_export_${Date.now()}`;
        break;
      
      default:
        return res.status(400).json({
          success: false,
          message: 'Невідомий тип експорту'
        });
    }

    // Встановлюємо заголовки відповіді
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      
      // Тут має бути логіка конвертації в CSV
      // Для простоти повертаємо JSON
      res.json(data);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json({
        success: true,
        data,
        exportedAt: new Date(),
        totalRecords: Array.isArray(data) ? data.length : 1
      });
    }
  } catch (error) {
    logger.error('Помилка експорту даних:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при експорті даних'
    });
  }
};

// Дашборд метрики
exports.getDashboardMetrics = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Метрики за сьогодні
    const todayMetrics = await Ticket.aggregate([
      { $match: { createdAt: { $gte: startOfDay } } },
      {
        $group: {
          _id: null,
          created: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
          }
        }
      }
    ]);

    // Метрики за тиждень
    const weekMetrics = await Ticket.aggregate([
      { $match: { createdAt: { $gte: startOfWeek } } },
      {
        $group: {
          _id: null,
          created: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
          }
        }
      }
    ]);

    // Метрики за місяць
    const monthMetrics = await Ticket.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      {
        $group: {
          _id: null,
          created: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
          }
        }
      }
    ]);

    // Топ міста за кількістю тикетів з реальними даними вирішених
    const topCities = await Ticket.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      {
        $lookup: {
          from: 'cities',
          localField: 'city',
          foreignField: '_id',
          as: 'cityInfo'
        }
      },
      { $unwind: '$cityInfo' },
      {
        $group: {
          _id: '$city',
          cityName: { $first: '$cityInfo.name' },
          count: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
          }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      success: true,
      data: {
        dailyMetrics: todayMetrics[0] || { created: 0, resolved: 0 },
        weeklyMetrics: weekMetrics[0] || { created: 0, resolved: 0 },
        monthlyMetrics: monthMetrics[0] || { created: 0, resolved: 0 },
        topCities
      }
    });
  } catch (error) {
    logger.error('Помилка отримання метрик дашборду:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні метрик дашборду'
    });
  }
};

// Детальна статистика реєстрацій користувачів
exports.getUserRegistrationStats = async (req, res) => {
  try {
    const { startDate, endDate, period = '30d' } = req.query;
    
    // Створюємо фільтр дат
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // За замовчуванням - останні 30 днів
      const daysAgo = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      dateFilter.createdAt = {
        $gte: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
      };
    }

    // Загальна статистика
    const totalUsers = await User.countDocuments();
    const usersInPeriod = await User.countDocuments(dateFilter);
    
    // Статистика по джерелах реєстрації
    const registrationSources = await User.aggregate([
      { $match: dateFilter },
      { 
        $group: { 
          _id: '$metadata.registrationSource', 
          count: { $sum: 1 },
          percentage: { $sum: 1 }
        } 
      },
      { $sort: { count: -1 } }
    ]);

    // Обчислюємо відсотки
    registrationSources.forEach(source => {
      source.percentage = usersInPeriod > 0 ? Math.round((source.count / usersInPeriod) * 100) : 0;
    });

    // Статистика по статусах реєстрації
    const registrationStatuses = await User.aggregate([
      { $match: dateFilter },
      { 
        $group: { 
          _id: '$registrationStatus', 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } }
    ]);

    // Щоденна статистика реєстрацій
    const dailyStats = await User.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 },
          sources: {
            $push: '$metadata.registrationSource'
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Статистика по містах
    const cityStats = await User.aggregate([
      { $match: dateFilter },
      { 
        $group: { 
          _id: '$city', 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Прирост по періодах
    const now = new Date();
    const last7Days = await User.countDocuments({
      createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
    });
    const last30Days = await User.countDocuments({
      createdAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }
    });
    const last90Days = await User.countDocuments({
      createdAt: { $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) }
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalUsers,
          usersInPeriod,
          growthRates: {
            last7Days,
            last30Days,
            last90Days
          }
        },
        registrationSources,
        registrationStatuses,
        dailyStats,
        cityStats
      }
    });

  } catch (error) {
    logger.error('Помилка отримання статистики реєстрацій:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання статистики реєстрацій'
    });
  }
};

// Отримати дані для міні-графіка тикетів за тиждень
exports.getWeeklyTicketsChart = async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const dailyTickets = await Ticket.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Створюємо масив з усіма днями тижня
    const weekData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayData = dailyTickets.find(d => d._id === dateStr);
      
      weekData.push({
        date: dateStr,
        dayNumber: date.getDay(), // Повертаємо номер дня (0-6)
        count: dayData ? dayData.count : 0
      });
    }

    res.json({
      success: true,
      data: weekData
    });

  } catch (error) {
    logger.error('Помилка отримання тижневої статистики тикетів:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання тижневої статистики тикетів'
    });
  }
};

// Отримати дані для розподілу за категоріями
exports.getCategoryDistribution = async (req, res) => {
  try {
    // Мапа для перекладу строкових значень категорій
    const categoryNameMap = {
      'technical': 'Технічні питання',
      'account': 'Акаунт',
      'billing': 'Фінанси',
      'general': 'Загальні питання'
    };

    const categoryStats = await Ticket.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Обчислюємо відсотки та перекладаємо назви
    const totalTickets = categoryStats.reduce((sum, cat) => sum + cat.count, 0);
    const categoryData = categoryStats.map(cat => ({
      category: categoryNameMap[cat._id] || cat._id || 'Без категорії',
      count: cat.count,
      percentage: totalTickets > 0 ? Math.round((cat.count / totalTickets) * 100) : 0
    }));

    res.json({
      success: true,
      data: categoryData
    });

  } catch (error) {
    logger.error('Помилка отримання розподілу за категоріями:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання розподілу за категоріями'
    });
  }
};

// Отримати дані для навантаження по днях тижня
exports.getWorkloadByDayOfWeek = async (req, res) => {
  try {
    const workloadStats = await Ticket.aggregate([
      {
        $project: {
          dayOfWeek: { $dayOfWeek: '$createdAt' },
          status: 1
        }
      },
      {
        $group: {
          _id: '$dayOfWeek',
          totalTickets: { $sum: 1 },
          openTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] }
          },
          inProgressTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          },
          resolvedTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    console.log('Raw MongoDB workload stats:', workloadStats);

    // Створюємо дані для днів тижня у правильному порядку (JavaScript: 0=неділя, 1=понеділок, ..., 6=субота)
    const workloadData = [];

    // Створюємо масив у порядку JavaScript днів тижня (0-6)
    for (let jsDay = 0; jsDay <= 6; jsDay++) {
      // Конвертуємо JavaScript dayNumber до MongoDB dayOfWeek
      // JavaScript: 0=неділя, 1=понеділок, ..., 6=субота
      // MongoDB: 1=неділя, 2=понеділок, ..., 7=субота
      const mongoDay = jsDay + 1;
      const dayData = workloadStats.find(d => d._id === mongoDay);
      
      const dayEntry = {
        dayNumber: jsDay,
        totalTickets: dayData ? dayData.totalTickets : 0,
        openTickets: dayData ? dayData.openTickets : 0,
        inProgressTickets: dayData ? dayData.inProgressTickets : 0,
        resolvedTickets: dayData ? dayData.resolvedTickets : 0
      };
      
      workloadData.push(dayEntry);
    }

    res.json({
      success: true,
      data: workloadData
    });

  } catch (error) {
    logger.error('Помилка отримання навантаження по днях тижня:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання навантаження по днях тижня'
    });
  }
};