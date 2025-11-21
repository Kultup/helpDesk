const Ticket = require('../models/Ticket');
const User = require('../models/User');
const City = require('../models/City');
const Comment = require('../models/Comment');
const Position = require('../models/Position');
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
    const activeUsers = await User.countDocuments({ isActive: true });
    const totalUsers = await User.countDocuments();
    const totalCities = await City.countDocuments({ isActive: true });
    const totalPositions = await Position.countDocuments({ isActive: true });

    // Статистика реєстрацій
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const registrationStatusStats = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        } 
      },
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

    // Щоденна статистика тикетів (для тренду часу)
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const trendStartDate = startDate ? new Date(startDate) : defaultStartDate;
    const trendEndDate = endDate ? new Date(endDate) : now;
    
    // Створені тикети за день
    const ticketsByDay = await Ticket.aggregate([
      {
        $match: {
          createdAt: { 
            $gte: trendStartDate,
            $lte: trendEndDate
          }
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
          resolvedAt: { 
            $exists: true, 
            $gte: trendStartDate,
            $lte: trendEndDate
          },
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

    // Статистика по категоріях
    const categoryStats = await Ticket.aggregate([
      { $match: filter },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Топ вирішувачів
    const topResolvers = await Ticket.aggregate([
      {
        $match: {
          ...filter,
          status: 'resolved',
          assignedTo: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$assignedTo',
          resolvedCount: { $sum: 1 }
        }
      },
      { $sort: { resolvedCount: -1 } },
      { $limit: 10 }
    ]);

    // Заповнюємо дані користувачів
    const topResolversWithUsers = await Promise.all(
      topResolvers.map(async (item) => {
        const user = await User.findById(item._id).select('firstName lastName email').lean();
        return {
          _id: item._id,
          resolvedCount: item.resolvedCount,
          user: user || { firstName: 'Невідомий', lastName: '', email: '' }
        };
      })
    );

    res.json({
      success: true,
      data: {
        overview: {
          totalTickets,
          totalUsers,
          activeUsers,
          totalCities,
          totalPositions
        },
        ticketsByStatus: statusStats,
        ticketsByPriority: priorityStats,
        ticketsByCategory: categoryStats,
        ticketsByDay,
        resolvedTicketsByDay,
        avgResolutionTime: avgResolutionTime[0]?.avgTime || 0,
        topResolvers: topResolversWithUsers,
        registrationStatusStats,
        dailyRegistrations
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

    // Топ міста за кількістю тикетів
    const topCities = await Ticket.aggregate([
      {
        $group: {
          _id: '$city',
          count: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
          }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Заповнюємо назви міст
    const topCitiesWithNames = await Promise.all(
      topCities.map(async (item) => {
        const city = await City.findById(item._id).select('name').lean();
        return {
          cityId: item._id,
          cityName: city?.name || 'Невідоме місто',
          count: item.count,
          resolved: item.resolved || 0
        };
      })
    );

    res.json({
      success: true,
      data: {
        today: todayMetrics[0] || { created: 0, resolved: 0 },
        week: weekMetrics[0] || { created: 0, resolved: 0 },
        month: monthMetrics[0] || { created: 0, resolved: 0 },
        topCities: topCitiesWithNames,
        dailyMetrics: []
      }
    });
  } catch (error) {
    logger.error('Помилка отримання метрик дашборду:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні метрик'
    });
  }
};

exports.getUserRegistrationStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const totalUsers = await User.countDocuments();
    const usersInPeriod = await User.countDocuments(dateFilter);

    // Статистика по джерелах реєстрації
    const registrationSources = await User.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$metadata.registrationSource',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

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
    const { startDate, endDate } = req.query;
    
    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      // Встановлюємо час на початок та кінець дня
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else {
      // За замовчуванням - останні 7 днів
      end = new Date();
      end.setHours(23, 59, 59, 999);
      start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
    }

    const dailyTickets = await Ticket.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
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

    // Створюємо масив з усіма днями в діапазоні
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const daysToShow = Math.min(Math.max(daysDiff + 1, 1), 30); // Мінімум 1 день, максимум 30
    
    const weekData = [];
    for (let i = 0; i < daysToShow; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      date.setHours(0, 0, 0, 0);
      const dateStr = date.toISOString().split('T')[0];
      const dayData = dailyTickets.find(d => d._id === dateStr);
      
      weekData.push({
        date: dateStr,
        dayNumber: date.getDay(),
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

// Розподіл за категоріями
exports.getCategoryDistribution = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const Category = require('../models/Category');
    
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const categoryDistribution = await Ticket.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Отримуємо назви категорій
    const categoryIds = categoryDistribution.map(item => item._id).filter(Boolean);
    
    // Розділяємо на валідні ObjectId та рядки
    const mongoose = require('mongoose');
    const validObjectIds = [];
    const stringCategories = [];
    
    categoryIds.forEach(catId => {
      if (mongoose.Types.ObjectId.isValid(catId) && typeof catId !== 'string') {
        validObjectIds.push(catId);
      } else if (mongoose.Types.ObjectId.isValid(catId) && typeof catId === 'string' && catId.length === 24) {
        validObjectIds.push(new mongoose.Types.ObjectId(catId));
      } else {
        // Це рядок (наприклад, "technical", "general", "billing")
        stringCategories.push(catId);
      }
    });
    
    // Отримуємо категорії з бази даних для валідних ObjectId
    const categoryMap = {};
    if (validObjectIds.length > 0) {
      const categories = await Category.find({ _id: { $in: validObjectIds } }).select('_id name');
      categories.forEach(cat => {
        categoryMap[cat._id.toString()] = cat.name;
      });
    }
    
    // Для рядкових категорій намагаємося знайти їх за назвою або використовуємо як є
    if (stringCategories.length > 0) {
      const categoriesByName = await Category.find({ 
        $or: [
          { name: { $in: stringCategories } },
          { slug: { $in: stringCategories } }
        ]
      }).select('_id name slug');
      
      categoriesByName.forEach(cat => {
        // Мапінг за назвою
        if (stringCategories.includes(cat.name)) {
          categoryMap[cat.name] = cat.name;
        }
        // Мапінг за slug
        if (cat.slug && stringCategories.includes(cat.slug)) {
          categoryMap[cat.slug] = cat.name;
        }
      });
      
      // Для рядків, які не знайдені в базі, використовуємо їх як назви
      stringCategories.forEach(strCat => {
        if (!categoryMap[strCat]) {
          // Капіталізуємо першу літеру для кращого відображення
          categoryMap[strCat] = strCat.charAt(0).toUpperCase() + strCat.slice(1);
        }
      });
    }

    // Формуємо результат з назвами категорій та відсотками
    const totalTickets = categoryDistribution.reduce((sum, item) => sum + item.count, 0);
    const result = categoryDistribution.map(item => {
      const categoryId = item._id?.toString() || item._id;
      const categoryName = categoryMap[categoryId] || 
                          categoryMap[item._id] || 
                          (typeof item._id === 'string' ? item._id.charAt(0).toUpperCase() + item._id.slice(1) : 'Невідома категорія');
      
      return {
        category: categoryName,
        count: item.count,
        percentage: totalTickets > 0 ? Math.round((item.count / totalTickets) * 100) : 0
      };
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Помилка отримання розподілу за категоріями:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера'
    });
  }
};

// Навантаження по днях тижня
exports.getWorkloadByDayOfWeek = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    // MongoDB $dayOfWeek повертає 1 (неділя) - 7 (субота)
    // JavaScript getDay() повертає 0 (неділя) - 6 (субота)
    // Конвертуємо MongoDB день до JavaScript формату (dayNumber - 1) % 7
    
    const workloadByDay = await Ticket.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            $dayOfWeek: '$createdAt'
          },
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

    // Створюємо масив для всіх 7 днів тижня (0-6 для JavaScript)
    const allDays = Array.from({ length: 7 }, (_, i) => ({
      dayNumber: i, // JavaScript формат: 0=неділя, 6=субота
      totalTickets: 0,
      openTickets: 0,
      inProgressTickets: 0,
      resolvedTickets: 0
    }));

    // Заповнюємо дані з агрегації
    // MongoDB день 1 (неділя) -> JavaScript 0
    // MongoDB день 7 (субота) -> JavaScript 6
    workloadByDay.forEach(item => {
      const mongoDay = item._id; // 1-7
      const jsDay = (mongoDay - 1) % 7; // 0-6
      
      if (allDays[jsDay]) {
        allDays[jsDay].totalTickets = item.totalTickets || 0;
        allDays[jsDay].openTickets = item.openTickets || 0;
        allDays[jsDay].inProgressTickets = item.inProgressTickets || 0;
        allDays[jsDay].resolvedTickets = item.resolvedTickets || 0;
      }
    });

    res.json({
      success: true,
      data: allDays
    });
  } catch (error) {
    logger.error('Помилка отримання навантаження по днях тижня:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера'
    });
  }
};

// Експорт звіту за минулий місяць з діаграмами
// Статистика користувачів за місяць
exports.getUserMonthlyStats = async (req, res) => {
  try {
    const now = new Date();
    
    // Поточний місяць
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    // Попередній місяць
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    
    // Кількість користувачів за поточний місяць
    const currentMonthUsers = await User.countDocuments({
      createdAt: {
        $gte: currentMonthStart,
        $lte: currentMonthEnd
      }
    });
    
    // Кількість користувачів за попередній місяць
    const previousMonthUsers = await User.countDocuments({
      createdAt: {
        $gte: previousMonthStart,
        $lte: previousMonthEnd
      }
    });
    
    // Загальна кількість користувачів
    const totalUsers = await User.countDocuments();
    
    // Розрахунок приросту
    let growth = 0;
    if (previousMonthUsers > 0) {
      growth = ((currentMonthUsers - previousMonthUsers) / previousMonthUsers) * 100;
    } else if (currentMonthUsers > 0) {
      growth = 100; // Якщо попереднього місяця не було, а зараз є
    }
    
    // Форматування назв місяців
    const currentMonthName = currentMonthStart.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
    const previousMonthName = previousMonthStart.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
    
    res.json({
      success: true,
      data: {
        currentMonth: {
          count: currentMonthUsers,
          name: currentMonthName,
          start: currentMonthStart.toISOString(),
          end: currentMonthEnd.toISOString()
        },
        previousMonth: {
          count: previousMonthUsers,
          name: previousMonthName,
          start: previousMonthStart.toISOString(),
          end: previousMonthEnd.toISOString()
        },
        totalUsers,
        growth: Math.round(growth * 100) / 100, // Округлення до 2 знаків після коми
        growthAbsolute: currentMonthUsers - previousMonthUsers
      }
    });
  } catch (error) {
    logger.error('Помилка отримання статистики користувачів за місяць:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання статистики користувачів'
    });
  }
};

exports.exportMonthlyReport = async (req, res) => {
  try {
    const now = new Date();
    
    // Визначаємо минулий місяць
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    
    // Визначаємо попередній місяць для порівняння
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
    
    // Фільтри для минулого місяця
    const lastMonthFilter = {
      createdAt: {
        $gte: lastMonthStart,
        $lte: lastMonthEnd
      }
    };
    
    // Фільтри для попереднього місяця
    const previousMonthFilter = {
      createdAt: {
        $gte: previousMonthStart,
        $lte: previousMonthEnd
      }
    };
    
    // Збираємо дані для минулого місяця
    const [
      lastMonthTotal,
      lastMonthStatusStats,
      lastMonthPriorityStats,
      lastMonthByDay,
      lastMonthResolved,
      lastMonthByCity,
      lastMonthAvgResolution,
      lastMonthByCategory
    ] = await Promise.all([
      // Загальна кількість
      Ticket.countDocuments(lastMonthFilter),
      
      // Статистика по статусах
      Ticket.aggregate([
        { $match: lastMonthFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
      // Статистика по пріоритетах
      Ticket.aggregate([
        { $match: lastMonthFilter },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]),
      
      // Щоденна статистика
      Ticket.aggregate([
        { $match: lastMonthFilter },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Вирішені тикети
      Ticket.countDocuments({
        ...lastMonthFilter,
        status: 'resolved'
      }),
      
      // По містах
      Ticket.aggregate([
        { $match: lastMonthFilter },
        {
          $group: {
            _id: '$city',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      
      // Середній час вирішення
      Ticket.aggregate([
        {
          $match: {
            ...lastMonthFilter,
            status: 'resolved',
            resolvedAt: { $exists: true }
          }
        },
        {
          $project: {
            resolutionTime: {
              $divide: [
                { $subtract: ['$resolvedAt', '$createdAt'] },
                1000 * 60 * 60 // години
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
      ]),
      
      // По категоріях
      Ticket.aggregate([
        { $match: lastMonthFilter },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ])
    ]);
    
    // Збираємо дані для попереднього місяця для порівняння
    const [
      previousMonthTotal,
      previousMonthResolved,
      previousMonthAvgResolution
    ] = await Promise.all([
      Ticket.countDocuments(previousMonthFilter),
      Ticket.countDocuments({
        ...previousMonthFilter,
        status: 'resolved'
      }),
      Ticket.aggregate([
        {
          $match: {
            ...previousMonthFilter,
            status: 'resolved',
            resolvedAt: { $exists: true }
          }
        },
        {
          $project: {
            resolutionTime: {
              $divide: [
                { $subtract: ['$resolvedAt', '$createdAt'] },
                1000 * 60 * 60
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
      ])
    ]);
    
    // Заповнюємо міста
    const citiesWithNames = await Promise.all(
      lastMonthByCity.map(async (item) => {
        const city = await City.findById(item._id).select('name region').lean();
        return {
          name: city?.name || 'Невідоме місто',
          region: city?.region || '',
          count: item.count
        };
      })
    );
    
    // Формуємо дані для діаграм
    const reportData = {
      period: {
        lastMonth: {
          start: lastMonthStart.toISOString().split('T')[0],
          end: lastMonthEnd.toISOString().split('T')[0],
          label: lastMonthStart.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
        },
        previousMonth: {
          start: previousMonthStart.toISOString().split('T')[0],
          end: previousMonthEnd.toISOString().split('T')[0],
          label: previousMonthStart.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
        }
      },
      summary: {
        lastMonth: {
          total: lastMonthTotal,
          resolved: lastMonthResolved,
          avgResolutionTime: lastMonthAvgResolution[0]?.avgTime || 0,
          resolutionRate: lastMonthTotal > 0 ? (lastMonthResolved / lastMonthTotal * 100) : 0
        },
        previousMonth: {
          total: previousMonthTotal,
          resolved: previousMonthResolved,
          avgResolutionTime: previousMonthAvgResolution[0]?.avgTime || 0,
          resolutionRate: previousMonthTotal > 0 ? (previousMonthResolved / previousMonthTotal * 100) : 0
        },
        comparison: {
          totalChange: lastMonthTotal - previousMonthTotal,
          totalChangePercent: previousMonthTotal > 0 
            ? ((lastMonthTotal - previousMonthTotal) / previousMonthTotal * 100) 
            : 0,
          resolvedChange: lastMonthResolved - previousMonthResolved,
          resolvedChangePercent: previousMonthResolved > 0
            ? ((lastMonthResolved - previousMonthResolved) / previousMonthResolved * 100)
            : 0,
          avgResolutionTimeChange: (lastMonthAvgResolution[0]?.avgTime || 0) - (previousMonthAvgResolution[0]?.avgTime || 0)
        }
      },
      charts: {
        statusDistribution: lastMonthStatusStats.map(item => ({
          label: item._id,
          value: item.count
        })),
        priorityDistribution: lastMonthPriorityStats.map(item => ({
          label: item._id,
          value: item.count
        })),
        dailyTrend: lastMonthByDay.map(item => ({
          date: item._id,
          count: item.count
        })),
        citiesDistribution: citiesWithNames,
        categoriesDistribution: lastMonthByCategory.map(item => ({
          label: item._id || 'Не вказано',
          value: item.count
        }))
      },
      generatedAt: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: reportData
    });
  } catch (error) {
    logger.error('Помилка експорту звіту за місяць:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при експорті звіту',
      error: error.message
    });
  }
};
