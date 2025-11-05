const express = require('express');
const router = express.Router();
const { authenticateToken: auth } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const SLAPolicy = require('../models/SLAPolicy');
const Ticket = require('../models/Ticket');
const slaService = require('../services/slaService');
const logger = require('../utils/logger');

/**
 * @route   GET /api/sla/policies
 * @desc    Отримати список SLA політик
 * @access  Private (Admin)
 */
router.get('/policies', auth, adminAuth, async (req, res) => {
  try {
    const { category, active, page = 1, limit = 10 } = req.query;
    
    let query = {};
    
    if (category) {
      query.category = category;
    }
    
    if (active !== undefined) {
      query.isActive = active === 'true';
    }
    
    const policies = await SLAPolicy.find(query)
      .populate('category', 'name color')
      .populate('createdBy', 'email position')
      .populate('updatedBy', 'email position')
      .populate('warnings.levels.notifyUsers', 'email position')
      .populate('escalationLevels.assignTo', 'email position')
      .populate('escalationLevels.notifyUsers', 'email position')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    const total = await SLAPolicy.countDocuments(query);
    
    res.json({
      success: true,
      data: policies,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching SLA policies:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання SLA політик',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/sla/policies/:id
 * @desc    Отримати SLA політику за ID
 * @access  Private (Admin)
 */
router.get('/policies/:id', auth, adminAuth, async (req, res) => {
  try {
    const policy = await SLAPolicy.findById(req.params.id)
      .populate('category', 'name color')
      .populate('createdBy', 'email position')
      .populate('updatedBy', 'email position')
      .populate('warnings.levels.notifyUsers', 'email position')
      .populate('escalationLevels.assignTo', 'email position')
      .populate('escalationLevels.notifyUsers', 'email position');
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'SLA політика не знайдена'
      });
    }
    
    res.json({
      success: true,
      data: policy
    });
  } catch (error) {
    logger.error('Error fetching SLA policy:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання SLA політики',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/sla/policies
 * @desc    Створити нову SLA політику
 * @access  Private (Admin)
 */
router.post('/policies', auth, adminAuth, async (req, res) => {
  try {
    const policyData = {
      ...req.body,
      createdBy: req.user._id
    };
    
    // Якщо це дефолтна політика, знімаємо дефолтний статус з інших
    if (policyData.isDefault) {
      await SLAPolicy.updateMany(
        { isDefault: true },
        { $set: { isDefault: false } }
      );
    }
    
    const policy = new SLAPolicy(policyData);
    await policy.save();
    
    res.status(201).json({
      success: true,
      message: 'SLA політика успішно створена',
      data: policy
    });
  } catch (error) {
    logger.error('Error creating SLA policy:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка створення SLA політики',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/sla/policies/:id
 * @desc    Оновити SLA політику
 * @access  Private (Admin)
 */
router.put('/policies/:id', auth, adminAuth, async (req, res) => {
  try {
    const policy = await SLAPolicy.findById(req.params.id);
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'SLA політика не знайдена'
      });
    }
    
    // Якщо це дефолтна політика, знімаємо дефолтний статус з інших
    if (req.body.isDefault && !policy.isDefault) {
      await SLAPolicy.updateMany(
        { isDefault: true },
        { $set: { isDefault: false } }
      );
    }
    
    Object.assign(policy, req.body);
    policy.updatedBy = req.user._id;
    await policy.save();
    
    res.json({
      success: true,
      message: 'SLA політика успішно оновлена',
      data: policy
    });
  } catch (error) {
    logger.error('Error updating SLA policy:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка оновлення SLA політики',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/sla/policies/:id
 * @desc    Видалити SLA політику
 * @access  Private (Admin)
 */
router.delete('/policies/:id', auth, adminAuth, async (req, res) => {
  try {
    const policy = await SLAPolicy.findById(req.params.id);
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'SLA політика не знайдена'
      });
    }
    
    // Перевіряємо, чи використовується політика
    const ticketsUsingPolicy = await Ticket.countDocuments({ slaPolicy: policy._id });
    
    if (ticketsUsingPolicy > 0) {
      return res.status(400).json({
        success: false,
        message: `Неможливо видалити політику, оскільки вона використовується в ${ticketsUsingPolicy} тикетах`
      });
    }
    
    await policy.deleteOne();
    
    res.json({
      success: true,
      message: 'SLA політика успішно видалена'
    });
  } catch (error) {
    logger.error('Error deleting SLA policy:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка видалення SLA політики',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/sla/tickets/:id/status
 * @desc    Отримати статус SLA для тикету
 * @access  Private
 */
router.get('/tickets/:id/status', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('slaPolicy')
      .populate('assignedTo', 'email position')
      .populate('createdBy', 'email position');
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Тикет не знайдено'
      });
    }
    
    const breachCheck = await slaService.checkSLABreach(ticket);
    const slaPolicy = ticket.slaPolicy || await SLAPolicy.getDefaultPolicy();
    
    // Розраховуємо прогрес
    const now = new Date();
    const createdAt = ticket.createdAt || new Date();
    const resolutionTime = ticket.sla.resolutionTime || 72;
    const elapsed = (now - createdAt) / (1000 * 60 * 60); // години
    const percentage = Math.min(100, Math.round((elapsed / resolutionTime) * 100));
    
    // Розраховуємо дедлайн
    const resolutionDeadline = new Date(createdAt.getTime() + resolutionTime * 60 * 60 * 1000);
    const timeRemaining = Math.max(0, (resolutionDeadline - now) / (1000 * 60 * 60)); // години
    
    res.json({
      success: true,
      data: {
        ticket: {
          _id: ticket._id,
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          priority: ticket.priority
        },
        sla: {
          responseTime: ticket.sla.responseTime,
          resolutionTime: ticket.sla.resolutionTime,
          dueDate: ticket.dueDate,
          policy: slaPolicy ? {
            _id: slaPolicy._id,
            name: slaPolicy.name
          } : null
        },
        metrics: {
          responseTime: ticket.metrics.responseTime,
          resolutionTime: ticket.metrics.resolutionTime,
          escalationCount: ticket.metrics.escalationCount
        },
        status: {
          isBreached: breachCheck.isBreached,
          breachType: breachCheck.breachType,
          percentage: percentage,
          timeRemaining: timeRemaining,
          responseDeadline: new Date(createdAt.getTime() + (ticket.sla.responseTime || 24) * 60 * 60 * 1000),
          resolutionDeadline: resolutionDeadline,
          firstResponseAt: ticket.firstResponseAt,
          resolvedAt: ticket.resolvedAt || ticket.closedAt
        },
        warnings: ticket.slaWarningsSent || [],
        escalationHistory: ticket.escalationHistory || []
      }
    });
  } catch (error) {
    logger.error('Error fetching ticket SLA status:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання статусу SLA',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/sla/breaches
 * @desc    Отримати список порушень SLA
 * @access  Private (Admin)
 */
router.get('/breaches', auth, adminAuth, async (req, res) => {
  try {
    const { status, priority, page = 1, limit = 20 } = req.query;
    
    const tickets = await Ticket.find({
      status: { $nin: ['closed', 'resolved', 'cancelled'] },
      isDeleted: false
    })
      .populate('category', 'name color')
      .populate('assignedTo', 'email position')
      .populate('createdBy', 'email position')
      .populate('slaPolicy', 'name')
      .sort({ slaBreachAt: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    const breaches = [];
    
    for (const ticket of tickets) {
      const breachCheck = await slaService.checkSLABreach(ticket);
      
      if (breachCheck.isBreached) {
        // Фільтри
        if (status && ticket.status !== status) continue;
        if (priority && ticket.priority !== priority) continue;
        
        breaches.push({
          ticket: {
            _id: ticket._id,
            ticketNumber: ticket.ticketNumber,
            title: ticket.title,
            status: ticket.status,
            priority: ticket.priority,
            category: ticket.category,
            assignedTo: ticket.assignedTo,
            createdBy: ticket.createdBy,
            createdAt: ticket.createdAt
          },
          breach: {
            type: breachCheck.breachType,
            percentage: breachCheck.percentage,
            breachedAt: ticket.slaBreachAt
          },
          sla: {
            responseTime: ticket.sla.responseTime,
            resolutionTime: ticket.sla.resolutionTime,
            dueDate: ticket.dueDate,
            policy: ticket.slaPolicy
          }
        });
      }
    }
    
    res.json({
      success: true,
      data: breaches,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: breaches.length
      }
    });
  } catch (error) {
    logger.error('Error fetching SLA breaches:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання порушень SLA',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/sla/statistics
 * @desc    Отримати статистику по SLA
 * @access  Private (Admin)
 */
router.get('/statistics', auth, adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let matchQuery = { isDeleted: false };
    
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) {
        matchQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        matchQuery.createdAt.$lte = new Date(endDate);
      }
    }
    
    const tickets = await Ticket.find(matchQuery)
      .populate('slaPolicy', 'name');
    
    let totalTickets = 0;
    let breachedTickets = 0;
    let warnedTickets = 0;
    let escalatedTickets = 0;
    let totalResponseTime = 0;
    let totalResolutionTime = 0;
    let responseTimeCount = 0;
    let resolutionTimeCount = 0;
    
    const breachesByPriority = {
      low: 0,
      medium: 0,
      high: 0,
      urgent: 0
    };
    
    for (const ticket of tickets) {
      if (ticket.status === 'closed' || ticket.status === 'resolved' || ticket.status === 'cancelled') {
        totalTickets++;
        
        if (ticket.metrics.responseTime > 0) {
          totalResponseTime += ticket.metrics.responseTime;
          responseTimeCount++;
        }
        
        if (ticket.metrics.resolutionTime > 0) {
          totalResolutionTime += ticket.metrics.resolutionTime;
          resolutionTimeCount++;
        }
      } else {
        const breachCheck = await slaService.checkSLABreach(ticket);
        
        if (breachCheck.isBreached) {
          breachedTickets++;
          breachesByPriority[ticket.priority] = (breachesByPriority[ticket.priority] || 0) + 1;
        }
        
        if (ticket.slaWarningsSent && ticket.slaWarningsSent.length > 0) {
          warnedTickets++;
        }
        
        if (ticket.escalationHistory && ticket.escalationHistory.length > 0) {
          escalatedTickets++;
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        totalTickets,
        breachedTickets,
        warnedTickets,
        escalatedTickets,
        breachesByPriority,
        averageResponseTime: responseTimeCount > 0 
          ? Math.round((totalResponseTime / responseTimeCount) * 100) / 100 
          : 0,
        averageResolutionTime: resolutionTimeCount > 0 
          ? Math.round((totalResolutionTime / resolutionTimeCount) * 100) / 100 
          : 0,
        breachRate: totalTickets > 0 
          ? Math.round((breachedTickets / totalTickets) * 100) 
          : 0
      }
    });
  } catch (error) {
    logger.error('Error fetching SLA statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання статистики SLA',
      error: error.message
    });
  }
});

module.exports = router;

