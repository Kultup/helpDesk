const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');
const emailService = require('../services/emailService');
const emailReceiveService = require('../services/emailReceiveService');
const EmailThread = require('../models/EmailThread');
const EmailSettings = require('../models/EmailSettings');
const Ticket = require('../models/Ticket');
const logger = require('../utils/logger');

/**
 * @route   POST /api/email/send
 * @desc    Відправити email
 * @access  Private
 */
router.post('/send', auth, async (req, res) => {
  try {
    const { to, subject, html, text, cc, bcc, attachments, replyTo } = req.body;

    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({
        success: false,
        message: 'Потрібно вказати to, subject та html або text'
      });
    }

    const result = await emailService.sendEmail(
      to,
      subject,
      html || '',
      text || '',
      {
        cc,
        bcc,
        attachments,
        replyTo
      }
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Email успішно відправлено',
        data: {
          messageId: result.messageId
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message || 'Помилка відправки email'
      });
    }
  } catch (error) {
    logger.error('Error sending email:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка відправки email',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/email/threads
 * @desc    Отримати список email threads
 * @access  Private
 */
router.get('/threads', auth, async (req, res) => {
  try {
    const { ticketId, page = 1, limit = 20 } = req.query;

    let query = {};
    if (ticketId) {
      query.ticket = ticketId;
    }

    const threads = await EmailThread.find(query)
      .populate('ticket', 'ticketNumber title status')
      .sort({ receivedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await EmailThread.countDocuments(query);

    res.json({
      success: true,
      data: threads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching email threads:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання email threads',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/email/threads/:id
 * @desc    Отримати email thread за ID
 * @access  Private
 */
router.get('/threads/:id', auth, async (req, res) => {
  try {
    const thread = await EmailThread.findById(req.params.id)
      .populate('ticket', 'ticketNumber title status')
      .populate('from', 'email position')
      .populate('to', 'email position');

    if (!thread) {
      return res.status(404).json({
        success: false,
        message: 'Email thread не знайдено'
      });
    }

    // Отримуємо всю історію thread
    const threadHistory = await EmailThread.findByThreadId(thread.threadId);

    res.json({
      success: true,
      data: {
        ...thread.toObject(),
        history: threadHistory
      }
    });
  } catch (error) {
    logger.error('Error fetching email thread:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання email thread',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/email/settings
 * @desc    Отримати email налаштування
 * @access  Private (Admin)
 */
router.get('/settings', auth, adminAuth, async (req, res) => {
  try {
    const settings = await EmailSettings.getActive();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Email налаштування не знайдені'
      });
    }

    // Не повертаємо паролі
    const settingsData = settings.toObject();
    if (settingsData.smtp && settingsData.smtp.password) {
      settingsData.smtp.password = '***';
    }
    if (settingsData.imap && settingsData.imap.password) {
      settingsData.imap.password = '***';
    }
    if (settingsData.pop3 && settingsData.pop3.password) {
      settingsData.pop3.password = '***';
    }

    res.json({
      success: true,
      data: settingsData
    });
  } catch (error) {
    logger.error('Error fetching email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання email налаштувань',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/email/settings
 * @desc    Оновити email налаштування
 * @access  Private (Admin)
 */
router.post('/settings', auth, adminAuth, async (req, res) => {
  try {
    let settings = await EmailSettings.getActive();

    if (!settings) {
      // Створюємо нові налаштування
      settings = new EmailSettings({
        ...req.body,
        createdBy: req.user._id
      });
    } else {
      // Оновлюємо існуючі налаштування
      Object.assign(settings, req.body);
      settings.updatedBy = req.user._id;
    }

    await settings.save();

    // Переініціалізуємо email сервіси
    await emailService.initialize();
    if (settings.imap && settings.imap.enabled) {
      await emailReceiveService.initialize(settings);
    }

    // Не повертаємо паролі
    const settingsData = settings.toObject();
    if (settingsData.smtp && settingsData.smtp.password) {
      settingsData.smtp.password = '***';
    }
    if (settingsData.imap && settingsData.imap.password) {
      settingsData.imap.password = '***';
    }
    if (settingsData.pop3 && settingsData.pop3.password) {
      settingsData.pop3.password = '***';
    }

    res.json({
      success: true,
      message: 'Email налаштування успішно оновлено',
      data: settingsData
    });
  } catch (error) {
    logger.error('Error updating email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка оновлення email налаштувань',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/email/test
 * @desc    Відправити тестовий email
 * @access  Private (Admin)
 */
router.post('/test', auth, adminAuth, async (req, res) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        message: 'Потрібно вказати email адресу для тесту'
      });
    }

    const result = await emailService.testEmail(to);

    if (result.success) {
      res.json({
        success: true,
        message: 'Тестовий email успішно відправлено',
        data: {
          messageId: result.messageId
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message || 'Помилка відправки тестового email'
      });
    }
  } catch (error) {
    logger.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка відправки тестового email',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/email/test-connection
 * @desc    Тестувати підключення до email сервера
 * @access  Private (Admin)
 */
router.post('/test-connection', auth, adminAuth, async (req, res) => {
  try {
    const settings = await EmailSettings.getActive();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Email налаштування не знайдені'
      });
    }

    const result = await settings.testConnection();

    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    logger.error('Error testing email connection:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка тестування підключення',
      error: error.message
    });
  }
});

module.exports = router;

