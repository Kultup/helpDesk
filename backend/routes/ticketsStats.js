const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * @route   GET /api/tickets/stats/top-issues
 * @desc    Отримати топ-10 найчастіших проблем
 * @access  Private (Admin)
 */
router.get('/top-issues', authenticateToken, async (req, res) => {
    try {
        const { period = '7' } = req.query; // За скільки днів (7, 30, 90)

        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(period));

        const topIssues = await Ticket.aggregate([
            {
                $match: {
                    createdAt: { $gte: daysAgo },
                    isDeleted: false
                }
            },
            {
                $group: {
                    _id: {
                        category: '$category',
                        subcategory: '$subcategory'
                    },
                    count: { $sum: 1 },
                    avgResolutionTime: { $avg: '$metrics.resolutionTime' },
                    resolvedCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
                    },
                    openCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] }
                    },
                    examples: {
                        $push: {
                            title: '$title',
                            priority: '$priority',
                            status: '$status'
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    category: '$_id.category',
                    subcategory: '$_id.subcategory',
                    count: 1,
                    avgResolutionTime: { $round: ['$avgResolutionTime', 1] },
                    resolvedCount: 1,
                    openCount: 1,
                    resolutionRate: {
                        $round: [
                            { $multiply: [{ $divide: ['$resolvedCount', '$count'] }, 100] },
                            1
                        ]
                    },
                    examples: { $slice: ['$examples', 3] } // Перші 3 приклади
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            success: true,
            data: {
                period: parseInt(period),
                issues: topIssues,
                total: topIssues.reduce((sum, issue) => sum + issue.count, 0)
            }
        });
    } catch (error) {
        logger.error('Помилка отримання топ проблем:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера'
        });
    }
});

/**
 * @route   GET /api/tickets/stats/summary
 * @desc    Отримати загальну статистику тікетів
 * @access  Private
 */
router.get('/summary', authenticateToken, async (req, res) => {
    try {
        const stats = await Ticket.aggregate([
            { $match: { isDeleted: false } },
            {
                $facet: {
                    byStatus: [
                        {
                            $group: {
                                _id: '$status',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    byPriority: [
                        {
                            $group: {
                                _id: '$priority',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    overall: [
                        {
                            $group: {
                                _id: null,
                                total: { $sum: 1 },
                                avgResolutionTime: { $avg: '$metrics.resolutionTime' },
                                avgResponseTime: { $avg: '$metrics.responseTime' }
                            }
                        }
                    ],
                    sla: [
                        {
                            $match: { 'sla.status': { $exists: true } }
                        },
                        {
                            $group: {
                                _id: '$sla.status',
                                count: { $sum: 1 }
                            }
                        }
                    ]
                }
            }
        ]);

        res.json({
            success: true,
            data: stats[0]
        });
    } catch (error) {
        logger.error('Помилка отримання статистики:', error);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера'
        });
    }
});

module.exports = router;
