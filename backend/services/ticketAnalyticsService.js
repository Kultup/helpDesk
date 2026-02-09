const Ticket = require('../models/Ticket');
const logger = require('../utils/logger');

/**
 * Сервіс для розширеної аналітики тікетів
 */
class TicketAnalyticsService {
    /**
     * Прогноз навантаження на наступний період
     * @param {number} days - Кількість днів для прогнозу
     * @returns {Object} Прогноз
     */
    async forecastWorkload(days = 7) {
        try {
            // Аналізуємо історичні дані за останні 30 днів
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const historicalData = await Ticket.aggregate([
                {
                    $match: {
                        createdAt: { $gte: thirtyDaysAgo },
                        isDeleted: false
                    }
                },
                {
                    $group: {
                        _id: {
                            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                            dayOfWeek: { $dayOfWeek: '$createdAt' }
                        },
                        count: { $sum: 1 },
                        avgPriority: {
                            $avg: {
                                $switch: {
                                    branches: [
                                        { case: { $eq: ['$priority', 'urgent'] }, then: 4 },
                                        { case: { $eq: ['$priority', 'high'] }, then: 3 },
                                        { case: { $eq: ['$priority', 'medium'] }, then: 2 },
                                        { case: { $eq: ['$priority', 'low'] }, then: 1 }
                                    ],
                                    default: 2
                                }
                            }
                        }
                    }
                },
                { $sort: { '_id.date': 1 } }
            ]);

            // Розрахунок середнього по днях тижня
            const dayOfWeekStats = {};
            historicalData.forEach(item => {
                const dow = item._id.dayOfWeek;
                if (!dayOfWeekStats[dow]) {
                    dayOfWeekStats[dow] = { total: 0, count: 0 };
                }
                dayOfWeekStats[dow].total += item.count;
                dayOfWeekStats[dow].count += 1;
            });

            // Генерація прогнозу
            const forecast = [];
            const today = new Date();

            for (let i = 1; i <= days; i++) {
                const forecastDate = new Date(today);
                forecastDate.setDate(today.getDate() + i);
                const dow = forecastDate.getDay() || 7; // 0 = неділя -> 7

                const stats = dayOfWeekStats[dow];
                const avgTickets = stats ? Math.round(stats.total / stats.count) : 5;

                forecast.push({
                    date: forecastDate.toISOString().split('T')[0],
                    dayOfWeek: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][forecastDate.getDay()],
                    predictedTickets: avgTickets,
                    confidence: stats ? 'high' : 'low'
                });
            }

            return {
                forecast,
                historicalAverage: Math.round(
                    historicalData.reduce((sum, d) => sum + d.count, 0) / historicalData.length
                ),
                trend: this.calculateTrend(historicalData)
            };
        } catch (error) {
            logger.error('Помилка прогнозування навантаження:', error);
            throw error;
        }
    }

    /**
     * Розрахунок тренду (зростання/спадання)
     * @param {Array} data - Історичні дані
     * @returns {string} Тренд
     */
    calculateTrend(data) {
        if (data.length < 2) return 'stable';

        const firstHalf = data.slice(0, Math.floor(data.length / 2));
        const secondHalf = data.slice(Math.floor(data.length / 2));

        const firstAvg = firstHalf.reduce((sum, d) => sum + d.count, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, d) => sum + d.count, 0) / secondHalf.length;

        const change = ((secondAvg - firstAvg) / firstAvg) * 100;

        if (change > 10) return 'increasing';
        if (change < -10) return 'decreasing';
        return 'stable';
    }

    /**
     * Heatmap активності (години × дні тижня)
     * @param {number} days - Період для аналізу
     * @returns {Object} Heatmap дані
     */
    async getActivityHeatmap(days = 30) {
        try {
            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - days);

            const heatmapData = await Ticket.aggregate([
                {
                    $match: {
                        createdAt: { $gte: daysAgo },
                        isDeleted: false
                    }
                },
                {
                    $group: {
                        _id: {
                            dayOfWeek: { $dayOfWeek: '$createdAt' },
                            hour: { $hour: '$createdAt' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id.dayOfWeek': 1, '_id.hour': 1 } }
            ]);

            // Форматування для heatmap
            const heatmap = {};
            const daysOfWeek = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

            heatmapData.forEach(item => {
                const day = daysOfWeek[item._id.dayOfWeek - 1] || 'Нд';
                const hour = item._id.hour;

                if (!heatmap[day]) heatmap[day] = {};
                heatmap[day][hour] = item.count;
            });

            // Знаходимо пікові години
            const peakHours = heatmapData
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)
                .map(item => ({
                    day: daysOfWeek[item._id.dayOfWeek - 1] || 'Нд',
                    hour: `${item._id.hour}:00`,
                    count: item.count
                }));

            return {
                heatmap,
                peakHours,
                totalTickets: heatmapData.reduce((sum, d) => sum + d.count, 0)
            };
        } catch (error) {
            logger.error('Помилка створення heatmap:', error);
            throw error;
        }
    }

    /**
     * Тренди проблем (зростаючі/спадаючі категорії)
     * @param {number} days - Період для порівняння
     * @returns {Object} Тренди
     */
    async getProblemTrends(days = 30) {
        try {
            const now = new Date();
            const periodStart = new Date(now);
            periodStart.setDate(now.getDate() - days);

            const previousPeriodStart = new Date(periodStart);
            previousPeriodStart.setDate(periodStart.getDate() - days);

            // Поточний період
            const currentPeriod = await this.getCategoryStats(periodStart, now);

            // Попередній період
            const previousPeriod = await this.getCategoryStats(previousPeriodStart, periodStart);

            // Розрахунок змін
            const trends = [];

            for (const [category, currentCount] of Object.entries(currentPeriod)) {
                const previousCount = previousPeriod[category] || 0;
                const change = previousCount > 0
                    ? ((currentCount - previousCount) / previousCount) * 100
                    : 100;

                trends.push({
                    category,
                    currentCount,
                    previousCount,
                    change: Math.round(change),
                    trend: change > 10 ? 'increasing' : change < -10 ? 'decreasing' : 'stable'
                });
            }

            return trends.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
        } catch (error) {
            logger.error('Помилка аналізу трендів:', error);
            throw error;
        }
    }

    /**
     * Допоміжний метод для отримання статистики по категоріях
     */
    async getCategoryStats(startDate, endDate) {
        const stats = await Ticket.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lt: endDate },
                    isDeleted: false
                }
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            }
        ]);

        const result = {};
        stats.forEach(item => {
            result[item._id] = item.count;
        });
        return result;
    }

    /**
     * Детальна статистика продуктивності
     * @returns {Object} Статистика
     */
    async getPerformanceStats() {
        try {
            const stats = await Ticket.aggregate([
                { $match: { isDeleted: false } },
                {
                    $facet: {
                        overall: [
                            {
                                $group: {
                                    _id: null,
                                    totalTickets: { $sum: 1 },
                                    avgResolutionTime: { $avg: '$metrics.resolutionTime' },
                                    avgResponseTime: { $avg: '$metrics.responseTime' },
                                    reopenRate: {
                                        $avg: {
                                            $cond: [{ $gt: ['$metrics.reopenCount', 0] }, 1, 0]
                                        }
                                    }
                                }
                            }
                        ],
                        byPriority: [
                            {
                                $group: {
                                    _id: '$priority',
                                    count: { $sum: 1 },
                                    avgResolutionTime: { $avg: '$metrics.resolutionTime' }
                                }
                            }
                        ],
                        slaPerformance: [
                            {
                                $match: { 'sla.status': { $exists: true } }
                            },
                            {
                                $group: {
                                    _id: '$sla.status',
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        topPerformers: [
                            {
                                $match: {
                                    assignedTo: { $exists: true },
                                    status: { $in: ['resolved', 'closed'] }
                                }
                            },
                            {
                                $group: {
                                    _id: '$assignedTo',
                                    resolvedCount: { $sum: 1 },
                                    avgResolutionTime: { $avg: '$metrics.resolutionTime' }
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
                            { $unwind: '$user' },
                            { $sort: { resolvedCount: -1 } },
                            { $limit: 5 }
                        ]
                    }
                }
            ]);

            return stats[0];
        } catch (error) {
            logger.error('Помилка отримання статистики продуктивності:', error);
            throw error;
        }
    }

    /**
     * Експорт звіту в CSV формат
     * @param {Object} options - Опції фільтрації
     * @returns {string} CSV дані
     */
    async exportToCSV(options = {}) {
        try {
            const { startDate, endDate, category, priority } = options;

            const query = { isDeleted: false };
            if (startDate) query.createdAt = { $gte: new Date(startDate) };
            if (endDate) query.createdAt = { ...query.createdAt, $lte: new Date(endDate) };
            if (category) query.category = category;
            if (priority) query.priority = priority;

            const tickets = await Ticket.find(query)
                .populate('createdBy', 'firstName lastName email')
                .populate('assignedTo', 'firstName lastName email')
                .lean();

            // Формування CSV
            const headers = [
                'ID',
                'Номер',
                'Заголовок',
                'Категорія',
                'Підкатегорія',
                'Пріоритет',
                'Статус',
                'Створено',
                'Вирішено',
                'Час вирішення (год)',
                'Створив',
                'Призначено'
            ];

            const rows = tickets.map(ticket => [
                ticket._id,
                ticket.ticketNumber,
                `"${ticket.title.replace(/"/g, '""')}"`,
                ticket.category || '',
                ticket.subcategory || '',
                ticket.priority,
                ticket.status,
                ticket.createdAt.toISOString(),
                ticket.resolvedAt ? ticket.resolvedAt.toISOString() : '',
                ticket.metrics?.resolutionTime || '',
                ticket.createdBy ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}` : '',
                ticket.assignedTo ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}` : ''
            ]);

            const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

            return csv;
        } catch (error) {
            logger.error('Помилка експорту в CSV:', error);
            throw error;
        }
    }
}

module.exports = new TicketAnalyticsService();
