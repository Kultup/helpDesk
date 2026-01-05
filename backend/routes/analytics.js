const express = require('express');
const logger = require('../utils/logger');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const City = require('../models/City');
const Position = require('../models/Position');
const { 
  authenticateToken, 
  requirePermission 
} = require('../middleware/auth');
const analyticsController = require('../controllers/analyticsController');

const router = express.Router();

// POST /api/analytics/analyze - AI аналіз статистики заявок
router.post('/analyze',
  authenticateToken,
  requirePermission('view_analytics'),
  async (req, res) => {
    try {
      const groqService = require('../services/groqService');
      
      if (!groqService.isEnabled()) {
        return res.status(503).json({
          success: false,
          message: 'AI асистент вимкнено. Увімкніть AI в налаштуваннях бота.'
        });
      }

      const { startDate, endDate } = req.body;

      // Створюємо фільтр дат
      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);
      
      const filter = {};
      if (Object.keys(dateFilter).length > 0) {
        filter.createdAt = dateFilter;
      }

      // Отримуємо реальні тікети для аналізу (до 100 найновіших)
      const tickets = await Ticket.find(filter)
        .populate('createdBy', 'firstName lastName email')
        .populate('city', 'name region')
        .populate({
          path: 'comments',
          populate: {
            path: 'author',
            select: 'firstName lastName email'
          },
          options: { sort: { createdAt: -1 }, limit: 5 }
        })
        .select('title description status priority type subcategory city createdAt resolvedAt metrics comments')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      // Отримуємо статистику для контексту
      const totalTickets = await Ticket.countDocuments(filter);
      const statusStats = await Ticket.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);
      const priorityStats = await Ticket.aggregate([
        { $match: filter },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]);
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
      ]);
      const ticketsByDay = await Ticket.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
      const topCities = await Ticket.aggregate([
        { $match: filter },
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
        { $limit: 10 },
        {
          $lookup: {
            from: 'cities',
            localField: '_id',
            foreignField: '_id',
            as: 'cityInfo'
          }
        },
        {
          $project: {
            count: 1,
            resolved: 1,
            cityName: { $arrayElemAt: ['$cityInfo.name', 0] }
          }
        }
      ]);

      const analyticsData = {
        overview: {
          totalTickets,
          activeUsers: await User.countDocuments({ isActive: true })
        },
        ticketsByStatus: statusStats,
        ticketsByPriority: priorityStats,
        avgResolutionTime: avgResolutionTime[0]?.avgTime || 0,
        ticketsByDay,
        topCities
      };

      // Викликаємо AI аналіз з реальними тікетами
      const analysis = await groqService.analyzeAnalytics(tickets, analyticsData, {
        startDate,
        endDate,
        user: req.user,
        timestamp: new Date()
      });

      if (!analysis) {
        return res.status(500).json({
          success: false,
          message: 'Не вдалося проаналізувати статистику. Спробуйте пізніше.'
        });
      }

      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      logger.error('Помилка AI аналізу аналітики:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера при аналізі статистики',
        error: error.message
      });
    }
  }
);

// @route   GET /api/analytics/overview
// @desc    Загальна статистика системи
// @access  Private
router.get('/overview', 
  authenticateToken,
  requirePermission('view_analytics'),
  analyticsController.getOverview
);

// @route   GET /api/analytics/cities
// @desc    Статистика по містах
// @access  Private
router.get('/cities', 
  authenticateToken,
  requirePermission('view_analytics'),
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      // Побудова фільтра дат
      const dateFilter = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
        if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
      }

      // Статистика тикетів по містах
      const ticketsByCity = await Ticket.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: '$city',
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
        {
          $lookup: {
            from: 'cities',
            localField: '_id',
            foreignField: '_id',
            as: 'city'
          }
        },
        {
          $project: {
            totalTickets: 1,
            openTickets: 1,
            inProgressTickets: 1,
            resolvedTickets: 1,
            closedTickets: 1,
            city: { $arrayElemAt: ['$city', 0] }
          }
        },
        { $sort: { totalTickets: -1 } }
      ]);

      // Статистика користувачів по містах
      const usersByCity = await User.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: '$city',
            userCount: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'cities',
            localField: '_id',
            foreignField: '_id',
            as: 'city'
          }
        },
        {
          $project: {
            userCount: 1,
            city: { $arrayElemAt: ['$city', 0] }
          }
        },
        { $sort: { userCount: -1 } }
      ]);

      // Дані для теплової карти
      const heatMapData = await City.aggregate([
        {
          $lookup: {
            from: 'tickets',
            let: { cityId: '$_id' },
            pipeline: [
              { 
                $match: { 
                  $expr: { $eq: ['$city', '$$cityId'] },
                  ...dateFilter
                }
              },
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 }
                }
              }
            ],
            as: 'tickets'
          }
        },
        {
          $project: {
            name: 1,
            region: 1,
            coordinates: 1,
            totalTickets: { $size: '$tickets' },
            ticketsByStatus: '$tickets'
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          ticketsByCity,
          usersByCity,
          heatMapData
        }
      });

    } catch (error) {
      logger.error('Помилка отримання статистики по містах:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера'
      });
    }
  }
);

// @route   GET /api/analytics/positions
// @desc    Статистика по посадах
// @access  Private
router.get('/positions', 
  authenticateToken,
  requirePermission('view_analytics'),
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      // Побудова фільтра дат
      const dateFilter = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
        if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
      }

      // Статистика по посадах (через користувачів)
      const statsByPosition = await User.aggregate([
        { $match: { isActive: true } },
        {
          $lookup: {
            from: 'tickets',
            let: { userId: '$_id' },
            pipeline: [
              { 
                $match: { 
                  $expr: { $eq: ['$assignedTo', '$$userId'] },
                  ...dateFilter
                }
              }
            ],
            as: 'assignedTickets'
          }
        },
        {
          $lookup: {
            from: 'tickets',
            let: { userId: '$_id' },
            pipeline: [
              { 
                $match: { 
                  $expr: { $eq: ['$createdBy', '$$userId'] },
                  ...dateFilter
                }
              }
            ],
            as: 'createdTickets'
          }
        },
        {
          $group: {
            _id: '$position',
            userCount: { $sum: 1 },
            totalAssignedTickets: { $sum: { $size: '$assignedTickets' } },
            totalCreatedTickets: { $sum: { $size: '$createdTickets' } },
            resolvedTickets: {
              $sum: {
                $size: {
                  $filter: {
                    input: '$assignedTickets',
                    cond: { $eq: ['$$this.status', 'resolved'] }
                  }
                }
              }
            }
          }
        },
        {
          $lookup: {
            from: 'positions',
            localField: '_id',
            foreignField: '_id',
            as: 'position'
          }
        },
        {
          $project: {
            userCount: 1,
            totalAssignedTickets: 1,
            totalCreatedTickets: 1,
            resolvedTickets: 1,
            resolutionRate: {
              $cond: [
                { $gt: ['$totalAssignedTickets', 0] },
                { $divide: ['$resolvedTickets', '$totalAssignedTickets'] },
                0
              ]
            },
            position: { $arrayElemAt: ['$position', 0] }
          }
        },
        { $sort: { totalAssignedTickets: -1 } }
      ]);

      // Статистика по відділах
      const statsByDepartment = await Position.aggregate([
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: 'position',
            as: 'users'
          }
        },
        {
          $unwind: '$users'
        },
        {
          $lookup: {
            from: 'tickets',
            let: { userId: '$users._id' },
            pipeline: [
              { 
                $match: { 
                  $expr: { $eq: ['$assignedTo', '$$userId'] },
                  ...dateFilter
                }
              }
            ],
            as: 'assignedTickets'
          }
        },
        {
          $group: {
            _id: '$department',
            userCount: { $sum: 1 },
            totalTickets: { $sum: { $size: '$assignedTickets' } },
            resolvedTickets: {
              $sum: {
                $size: {
                  $filter: {
                    input: '$assignedTickets',
                    cond: { $eq: ['$$this.status', 'resolved'] }
                  }
                }
              }
            }
          }
        },
        {
          $project: {
            userCount: 1,
            totalTickets: 1,
            resolvedTickets: 1,
            resolutionRate: {
              $cond: [
                { $gt: ['$totalTickets', 0] },
                { $divide: ['$resolvedTickets', '$totalTickets'] },
                0
              ]
            }
          }
        },
        { $sort: { totalTickets: -1 } }
      ]);

      res.json({
        success: true,
        data: {
          statsByPosition,
          statsByDepartment
        }
      });

    } catch (error) {
      logger.error('Помилка отримання статистики по посадах:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера'
      });
    }
  }
);

// @route   GET /api/analytics/performance
// @desc    Аналітика продуктивності
// @access  Private
router.get('/performance', 
  authenticateToken,
  requirePermission('view_analytics'),
  async (req, res) => {
    try {
      const { startDate, endDate, userId } = req.query;
      
      // Побудова фільтра дат
      const dateFilter = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
        if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
      }

      // Фільтр користувача
      const userFilter = userId ? { assignedTo: userId } : {};

      // Середній час вирішення по користувачах
      const avgResolutionByUser = await Ticket.aggregate([
        { 
          $match: { 
            ...dateFilter,
            ...userFilter,
            status: 'resolved',
            resolvedAt: { $exists: true },
            assignedTo: { $exists: true }
          }
        },
        {
          $project: {
            assignedTo: 1,
            resolutionTime: {
              $subtract: ['$resolvedAt', '$createdAt']
            }
          }
        },
        {
          $group: {
            _id: '$assignedTo',
            avgResolutionTime: { $avg: '$resolutionTime' },
            ticketCount: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $project: {
            avgResolutionTime: 1,
            ticketCount: 1,
            user: { $arrayElemAt: ['$user', 0] }
          }
        },
        { $sort: { avgResolutionTime: 1 } }
      ]);

      // Статистика прострочених тикетів
      const overdueTickets = await Ticket.aggregate([
        { 
          $match: { 
            ...dateFilter,
            ...userFilter,
            dueDate: { $exists: true, $lt: new Date() },
            status: { $in: ['open', 'in_progress'] }
          }
        },
        {
          $group: {
            _id: '$assignedTo',
            overdueCount: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $project: {
            overdueCount: 1,
            user: { $arrayElemAt: ['$user', 0] }
          }
        },
        { $sort: { overdueCount: -1 } }
      ]);

      // Тренд вирішення тикетів по тижнях
      const weeklyResolutionTrend = await Ticket.aggregate([
        { 
          $match: { 
            ...dateFilter,
            status: 'resolved',
            resolvedAt: { $exists: true }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$resolvedAt' },
              week: { $week: '$resolvedAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.week': 1 } }
      ]);

      res.json({
        success: true,
        data: {
          avgResolutionByUser,
          overdueTickets,
          weeklyResolutionTrend
        }
      });

    } catch (error) {
      logger.error('Помилка отримання аналітики продуктивності:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера'
      });
    }
  }
);

// @route   GET /api/analytics/export
// @desc    Експорт аналітичних даних
// @access  Private
router.get('/export', 
  authenticateToken,
  requirePermission('export_data'),
  async (req, res) => {
    try {
      const { format = 'json', type = 'overview', startDate, endDate } = req.query;
      
      // Побудова фільтра дат
      const dateFilter = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
        if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
      }

      let data = {};

      switch (type) {
        case 'tickets':
          data = await Ticket.find(dateFilter)
            .populate('assignedTo', 'firstName lastName email')
            .populate('createdBy', 'firstName lastName email')
            .populate('city', 'name region')
            .lean();
          break;

        case 'users':
          data = await User.find({ isActive: true })
            .populate('position', 'title department')
            .populate('city', 'name region')
            .select('-password')
            .lean();
          break;

        case 'cities':
          data = await City.find({ isActive: true }).lean();
          break;

        case 'overview':
        default:
          // Отримуємо загальну статистику для експорту
          const totalTickets = await Ticket.countDocuments(dateFilter);
          const ticketsByStatus = await Ticket.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ]);
          
          const ticketsByPriority = await Ticket.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$priority', count: { $sum: 1 } } }
          ]);
          
          data = {
            totalTickets,
            ticketsByStatus,
            ticketsByPriority,
            exportDate: new Date(),
            dateRange: { startDate, endDate }
          };
          break;
      }

      // Встановлення заголовків відповіді
      const filename = `${type}_export_${new Date().toISOString().split('T')[0]}`;
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        
        // Конвертація в CSV
        if (Array.isArray(data)) {
          const csv = convertToCSV(data);
          res.send('\uFEFF' + csv); // Додаємо BOM для правильного відображення українських символів
        } else if (type === 'overview') {
          // Спеціальна обробка для статистики
          const csv = convertStatisticsToCSV(data);
          res.send('\uFEFF' + csv);
        } else {
          res.status(400).json({
            success: false,
            message: 'CSV експорт доступний тільки для табличних даних'
          });
        }
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.json({
          success: true,
          data,
          exportInfo: {
            type,
            format,
            exportDate: new Date(),
            dateRange: { startDate, endDate }
          }
        });
      }

    } catch (error) {
      logger.error('Помилка експорту даних:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера'
      });
    }
  }
);

// Допоміжна функція для конвертації в CSV
function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      // Екранування коми та лапок
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });
  
  return [csvHeaders, ...csvRows].join('\n');
}

// Функція для конвертації статистики в CSV
function convertStatisticsToCSV(data) {
  let csv = 'Загальна статистика\n';
  csv += `Всього тикетів,${data.totalTickets}\n`;
  
  // Статистика по статусах
  const statusLabels = {
    'open': 'Відкритих',
    'in_progress': 'В роботі',
    'resolved': 'Вирішених',
    'closed': 'Закритих'
  };
  
  data.ticketsByStatus.forEach(item => {
    const label = statusLabels[item._id] || item._id;
    csv += `${label},${item.count}\n`;
  });
  
  csv += '\nПріоритети\n';
  
  // Статистика по пріоритетах
  const priorityLabels = {
    'high': 'Високий',
    'medium': 'Середній',
    'low': 'Низький'
  };
  
  if (data.ticketsByPriority) {
    data.ticketsByPriority.forEach(item => {
      const label = priorityLabels[item._id] || item._id;
      csv += `${label},${item.count}\n`;
    });
  }
  
  return csv;
}

// @route   GET /api/analytics/dashboard
// @desc    Метрики для дашборду
// @access  Private
router.get('/dashboard', 
  authenticateToken,
  requirePermission('view_analytics'),
  analyticsController.getDashboardMetrics
);

// @route   GET /api/analytics/user-registrations
// @desc    Детальна статистика реєстрацій користувачів
// @access  Private
router.get('/user-registrations', 
  authenticateToken,
  requirePermission('view_analytics'),
  analyticsController.getUserRegistrationStats
);

// @route   GET /api/analytics/user-registration-stats
// @desc    Детальна статистика реєстрацій користувачів (альтернативний маршрут)
// @access  Private
router.get('/user-registration-stats', 
  authenticateToken,
  requirePermission('view_analytics'),
  analyticsController.getUserRegistrationStats
);

// @route   GET /api/analytics/user-monthly-stats
// @desc    Статистика користувачів за місяць з приростом
// @access  Private
router.get('/user-monthly-stats', 
  authenticateToken,
  requirePermission('view_analytics'),
  analyticsController.getUserMonthlyStats
);

// @route   GET /api/analytics/charts/weekly-tickets
// @desc    Дані для міні-графіка тикетів за тиждень
// @access  Private
router.get('/charts/weekly-tickets', 
  authenticateToken,
  requirePermission('view_analytics'),
  analyticsController.getWeeklyTicketsChart
);



// @route   GET /api/analytics/charts/workload-by-day
// @desc    Дані для навантаження по днях тижня
// @access  Private
router.get('/charts/workload-by-day', 
  authenticateToken,
  requirePermission('view_analytics'),
  analyticsController.getWorkloadByDayOfWeek
);

// @route   GET /api/analytics/monthly-report
// @desc    Експорт звіту за минулий місяць з діаграмами
// @access  Private
router.get('/monthly-report', 
  authenticateToken,
  requirePermission('export_data'),
  analyticsController.exportMonthlyReport
);

module.exports = router;