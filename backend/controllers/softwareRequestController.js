const SoftwareRequest = require('../models/SoftwareRequest');
const logger = require('../utils/logger');
const crypto = require('crypto');

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

    // Перевірка чи може користувач подати запит (1 на тиждень)
    const canRequest = await SoftwareRequest.canUserMakeRequest(req.user._id, req.user.telegramId);

    if (!canRequest) {
      return res.status(429).json({
        success: false,
        message:
          'Ви вже подавали запит протягом останнього тижня. Наступний запит можна подати через 7 днів.',
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
 * Схвалити запит і створити тестового користувача
 * PUT /api/software-requests/:id/approve
 */
const approveRequest = async (req, res) => {
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

    // Генерація тестових облікових даних
    const testUsername = `test_${crypto.randomBytes(4).toString('hex')}`;
    const testPassword = crypto.randomBytes(8).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 години

    // TODO: Тут виклик сервісу для створення користувача в AD
    // const adUser = await activeDirectoryService.createTestUser({
    //   username: testUsername,
    //   password: testPassword,
    //   expiresAt,
    //   permissions: ['local_admin'],
    // });

    request.status = 'approved';
    request.testUserCreated = true;
    request.testUserCredentials = {
      username: testUsername,
      password: testPassword,
      expiresAt,
    };
    request.adminNote = adminNote || '';
    request.resolvedAt = new Date();
    await request.save();

    logger.info(
      `Software Request: схвалено запит ${id}, створено тест користувача ${testUsername}`
    );

    // TODO: Відправити credentials користувачу в Telegram
    // await telegramService.sendMessage(request.telegramId, ...)

    res.json({
      success: true,
      data: {
        request,
        credentials: {
          username: testUsername,
          password: testPassword,
          expiresAt,
        },
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
