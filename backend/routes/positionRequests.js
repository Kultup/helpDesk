const express = require('express');
const router = express.Router();
const PositionRequest = require('../models/PositionRequest');
const Position = require('../models/Position');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const logger = require('../utils/logger');
const telegramService = require('../services/telegramServiceInstance');

/**
 * @route   GET /api/position-requests
 * @desc    Отримати всі запити на додавання посади
 * @access  Private (Admin only)
 */
router.get('/', authenticateToken, requirePermission('manage_positions'), async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (status) {
      filter.status = status;
    }

    const [requests, total] = await Promise.all([
      PositionRequest.find(filter)
        .populate('requestedBy', 'firstName lastName email')
        .populate('pendingRegistrationId', 'telegramId telegramChatId')
        .populate('approvedBy', 'firstName lastName email')
        .populate('rejectedBy', 'firstName lastName email')
        .populate('createdPositionId', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      PositionRequest.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Помилка отримання запитів на посади:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера',
    });
  }
});

/**
 * @route   POST /api/position-requests/:id/approve
 * @desc    Підтвердити запит на додавання посади та створити посаду
 * @access  Private (Admin only)
 */
router.post(
  '/:id/approve',
  authenticateToken,
  requirePermission('manage_positions'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const positionRequest = await PositionRequest.findById(id).populate('pendingRegistrationId');

      if (!positionRequest) {
        return res.status(404).json({
          success: false,
          message: 'Запит на посаду не знайдено',
        });
      }

      if (positionRequest.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Запит вже оброблено',
        });
      }

      // Перевіряємо, чи посада з такою назвою вже існує
      const existingPosition = await Position.findOne({
        title: { $regex: new RegExp(`^${positionRequest.title}$`, 'i') },
      });

      let createdPosition;
      if (existingPosition) {
        // Якщо посада вже існує, використовуємо її
        createdPosition = existingPosition;
        logger.info(`Посада "${positionRequest.title}" вже існує, використовуємо існуючу`);
      } else {
        // Створюємо нову посаду
        createdPosition = new Position({
          title: positionRequest.title,
          department: 'Загальний', // Дефолтний відділ, можна змінити пізніше
          isActive: true,
          isPublic: true,
          createdBy: req.user._id,
        });
        await createdPosition.save();
        logger.info(`Створено нову посаду: ${createdPosition.title}`);
      }

      // Оновлюємо запит
      positionRequest.status = 'approved';
      positionRequest.approvedBy = req.user._id;
      positionRequest.approvedAt = new Date();
      positionRequest.createdPositionId = createdPosition._id;
      await positionRequest.save();

      // Відправляємо сповіщення користувачу через Telegram
      await telegramService.notifyUserAboutPositionApproval(positionRequest, createdPosition);

      res.json({
        success: true,
        message: 'Запит підтверджено, посада створена',
        data: {
          positionRequest,
          position: createdPosition,
        },
      });
    } catch (error) {
      logger.error('Помилка підтвердження запиту на посаду:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера',
      });
    }
  }
);

/**
 * @route   POST /api/position-requests/:id/reject
 * @desc    Відхилити запит на додавання посади
 * @access  Private (Admin only)
 */
router.post(
  '/:id/reject',
  authenticateToken,
  requirePermission('manage_positions'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const positionRequest = await PositionRequest.findById(id);

      if (!positionRequest) {
        return res.status(404).json({
          success: false,
          message: 'Запит на посаду не знайдено',
        });
      }

      if (positionRequest.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Запит вже оброблено',
        });
      }

      // Оновлюємо запит
      positionRequest.status = 'rejected';
      positionRequest.rejectedBy = req.user._id;
      positionRequest.rejectedAt = new Date();
      if (reason) {
        positionRequest.rejectionReason = reason;
      }
      await positionRequest.save();

      // Відправляємо сповіщення користувачу через Telegram
      await telegramService.notifyUserAboutPositionRejection(positionRequest, reason);

      res.json({
        success: true,
        message: 'Запит відхилено',
        data: positionRequest,
      });
    } catch (error) {
      logger.error('Помилка відхилення запиту на посаду:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера',
      });
    }
  }
);

module.exports = router;
