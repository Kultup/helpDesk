const Ticket = require('../models/Ticket');
const aiFirstLineService = require('../services/aiFirstLineService');
const logger = require('../utils/logger');

/**
 * Що використовує AI для навчання (контекст): закриті тікети з рішеннями та діалоги.
 * GET /api/ai/knowledge
 */
exports.getKnowledge = async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 20));

    const resolvedTickets = await Ticket.find({
      status: { $in: ['resolved', 'closed'] },
      isDeleted: { $ne: true },
      $or: [
        { resolutionSummary: { $exists: true, $nin: [null, ''] } },
        { aiDialogHistory: { $exists: true, $not: { $size: 0 } } },
      ],
    })
      .sort({ resolvedAt: -1, closedAt: -1, updatedAt: -1 })
      .limit(limit)
      .select(
        'ticketNumber title description resolutionSummary subcategory status resolvedAt closedAt aiDialogHistory metadata createdAt'
      )
      .populate('createdBy', 'firstName lastName email')
      .lean();

    const formatted = resolvedTickets.map(t => ({
      id: t._id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      description: t.description
        ? t.description.slice(0, 300) + (t.description.length > 300 ? '…' : '')
        : '',
      resolutionSummary: t.resolutionSummary || null,
      subcategory: t.subcategory,
      status: t.status,
      resolvedAt: t.resolvedAt,
      closedAt: t.closedAt,
      createdAt: t.createdAt,
      source: t.metadata?.source,
      hasAiDialog: Array.isArray(t.aiDialogHistory) && t.aiDialogHistory.length > 0,
      dialogLength: Array.isArray(t.aiDialogHistory) ? t.aiDialogHistory.length : 0,
      createdBy: t.createdBy
        ? {
            name: [t.createdBy.firstName, t.createdBy.lastName].filter(Boolean).join(' '),
            email: t.createdBy.email,
          }
        : null,
    }));

    const similarTicketsText = await aiFirstLineService.getSimilarResolvedTickets(5);

    res.json({
      success: true,
      data: {
        usedForContext: similarTicketsText,
        resolvedTickets: formatted,
        count: formatted.length,
      },
    });
  } catch (err) {
    logger.error('aiKnowledgeController.getKnowledge', err);
    res
      .status(500)
      .json({ success: false, message: 'Помилка отримання даних', error: err.message });
  }
};
