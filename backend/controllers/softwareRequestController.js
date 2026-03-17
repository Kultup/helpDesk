const SoftwareRequest = require('../models/SoftwareRequest');
const logger = require('../utils/logger');
const ticketWebSocketService = require('../services/ticketWebSocketService');
const activeDirectoryService = require('../services/activeDirectoryService');
const telegramServiceInstance = require('../services/telegramServiceInstance');

/**
 * Створити запит на встановлення ПЗ
 * POST /api/software-requests
 */
const createRequest = async (req, res) => {
  try {
    const { softwareName, reason, softwarePhoto, aiAnalysis } = req.body;

    if (!softwareName) {
      return res.status(400).json({
        success: false,
        message: "Назва програми обов'язкова",
      });
    }

    // Створення запиту
    const request = await SoftwareRequest.create({
      user: req.user._id,
      telegramId: req.user.telegramId || 'unknown',
      softwareName,
      reason: reason || '',
      softwarePhoto: softwarePhoto || null,
      aiAnalysis: aiAnalysis || null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 днів
    });

    logger.info(`Software Request: створено запит ${request._id} від ${req.user.email}`);

    // Сповістити адмінів у реальному часі
    ticketWebSocketService.notifyNewSoftwareRequest(request);

    res.status(201).json({
      success: true,
      data: request,
    });
  } catch (error) {
    logger.error('Software Request: помилка створення', error);
    res.status(500).json({
      success: false,
      message: 'Не вдалося створити запит',
    });
  }
};

/**
 * Отримати свої запити
 * GET /api/software-requests/my
 */
const getMyRequests = async (req, res) => {
  try {
    const requests = await SoftwareRequest.find({
      $or: [{ user: req.user._id }, { telegramId: req.user.telegramId }],
    })
      .sort({ requestedAt: -1 })
      .limit(20);

    res.json({
      success: true,
      data: requests,
    });
  } catch (error) {
    logger.error('Software Request: помилка отримання', error);
    res.status(500).json({
      success: false,
      message: 'Не вдалося отримати запити',
    });
  }
};

/**
 * Отримати всі запити (адмін)
 * GET /api/software-requests
 */
const getAllRequests = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const requests = await SoftwareRequest.find(query)
      .populate('user', 'firstName lastName email telegramId')
      .sort({ requestedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await SoftwareRequest.countDocuments(query);

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
    logger.error('Software Request: помилка отримання всіх', error);
    res.status(500).json({
      success: false,
      message: 'Не вдалося отримати запити',
    });
  }
};

/**
 * Схвалити запит — відкрити доступ в AD і повідомити користувача через Telegram
 * PUT /api/software-requests/:id/approve
 */
const approveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const request = await SoftwareRequest.findById(id).populate('user', 'firstName lastName');
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Запит не знайдено',
      });
    }

    const adUsername = process.env.AD_ACCESS_USERNAME;
    const adPassword = process.env.AD_ACCESS_PASSWORD;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 години

    // Активувати обліковий запис в AD
    let adResult = null;
    if (adUsername) {
      try {
        adResult = await activeDirectoryService.enableUser(adUsername);
        logger.info(`Software Request: AD enableUser result for ${adUsername}:`, adResult);
      } catch (adErr) {
        logger.warn(
          `Software Request: не вдалося активувати AD акаунт ${adUsername}:`,
          adErr.message
        );
      }
    }

    request.status = 'approved';
    request.testUserCreated = true;
    request.testUserCredentials = {
      username: adUsername || 'test',
      password: adPassword || '',
      expiresAt,
    };
    request.adminNote = adminNote || '';
    request.resolvedAt = new Date();
    await request.save();

    logger.info(`Software Request: схвалено запит ${id}, відкрито доступ для ${adUsername}`);

    // Відправити credentials користувачу в Telegram
    const telegramId = request.telegramId;
    if (telegramId && adUsername && adPassword) {
      try {
        const softwareName = request.softwareName || 'програма';
        const msg =
          `✅ <b>Доступ надано!</b>\n\n` +
          `📦 Програма: <code>${softwareName}</code>\n\n` +
          `🔑 <b>Дані для входу:</b>\n` +
          `👤 Логін: <code>${adUsername}</code>\n` +
          `🔒 Пароль: <code>${adPassword}</code>\n\n` +
          `⏳ Доступ дійсний 24 години.\n` +
          `Після завершення роботи зверніться до адміністратора.`;
        await telegramServiceInstance.sendMessage(telegramId, msg, { parse_mode: 'HTML' });
      } catch (tgErr) {
        logger.warn(
          `Software Request: не вдалося відправити Telegram повідомлення:`,
          tgErr.message
        );
      }
    }

    res.json({
      success: true,
      data: {
        request,
        credentials: {
          username: adUsername || 'test',
          password: adPassword || '',
          expiresAt,
        },
        adResult,
      },
    });
  } catch (error) {
    logger.error('Software Request: помилка схвалення', error);
    res.status(500).json({
      success: false,
      message: 'Не вдалося схвалити запит',
    });
  }
};

/**
 * Відхилити запит
 * PUT /api/software-requests/:id/reject
 */
const rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const request = await SoftwareRequest.findById(id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Запит не знайдено',
      });
    }

    request.status = 'rejected';
    request.adminNote = adminNote || '';
    request.resolvedAt = new Date();
    await request.save();

    logger.info(`Software Request: відхилено запит ${id}`);

    res.json({
      success: true,
      data: request,
    });
  } catch (error) {
    logger.error('Software Request: помилка відхилення', error);
    res.status(500).json({
      success: false,
      message: 'Не вдалося відхилити запит',
    });
  }
};

/**
 * Отримати статистику запитів (адмін)
 * GET /api/software-requests/stats
 */
const getStatistics = async (req, res) => {
  try {
    const stats = await SoftwareRequest.getStatistics();

    const total = await SoftwareRequest.countDocuments();
    const pending = await SoftwareRequest.countDocuments({ status: 'pending' });
    const approved = await SoftwareRequest.countDocuments({ status: 'approved' });
    const rejected = await SoftwareRequest.countDocuments({ status: 'rejected' });
    const installed = await SoftwareRequest.countDocuments({ status: 'installed' });

    res.json({
      success: true,
      data: {
        bySoftware: stats,
        summary: {
          total,
          pending,
          approved,
          rejected,
          installed,
        },
      },
    });
  } catch (error) {
    logger.error('Software Request: помилка статистики', error);
    res.status(500).json({
      success: false,
      message: 'Не вдалося отримати статистику',
    });
  }
};

/**
 * Позначити як встановлено
 * PUT /api/software-requests/:id/install
 */
const markAsInstalled = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await SoftwareRequest.findById(id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Запит не знайдено',
      });
    }

    request.status = 'installed';
    request.resolvedAt = new Date();
    await request.save();

    logger.info(`Software Request: встановлено ${id}`);

    res.json({
      success: true,
      data: request,
    });
  } catch (error) {
    logger.error('Software Request: помилка встановлення', error);
    res.status(500).json({
      success: false,
      message: 'Не вдалося позначити як встановлено',
    });
  }
};

module.exports = {
  createRequest,
  getMyRequests,
  getAllRequests,
  approveRequest,
  rejectRequest,
  getStatistics,
  markAsInstalled,
};
