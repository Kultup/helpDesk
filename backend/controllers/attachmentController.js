const Attachment = require('../models/Attachment');
const Ticket = require('../models/Ticket');
const Comment = require('../models/Comment');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const logger = require('../utils/logger');
const { uploadsPath } = require('../config/paths');

// Вкладення до тікетів/коментарів зберігаються в uploads/attachments (config/paths)
const attachmentsDir = path.join(uploadsPath, 'attachments');

// Налаштування multer для завантаження файлів (папка створюється при старті в app.js)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, attachmentsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const fileFilter = (req, file, cb) => {
  // Дозволені типи файлів
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-rar-compressed',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Непідтримуваний тип файлу'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5, // максимум 5 файлів за раз
  },
});

// Middleware для завантаження файлів
exports.uploadFiles = upload.array('files', 5);

// Завантажити файли
exports.uploadAttachments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Файли не надано',
      });
    }

    const { ticketId, commentId, category = 'general' } = req.body;

    // Перевірка прав доступу
    if (ticketId) {
      if (!mongoose.Types.ObjectId.isValid(ticketId)) {
        return res.status(400).json({
          success: false,
          message: 'Невірний ID тикету',
        });
      }

      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Тикет не знайдено',
        });
      }

      const canUpload =
        ticket.createdBy.equals(req.user._id) ||
        ticket.assignedTo?.equals(req.user._id) ||
        req.user.role === 'admin';

      if (!canUpload) {
        return res.status(403).json({
          success: false,
          message: 'Немає прав для завантаження файлів до цього тикету',
        });
      }
    }

    if (commentId) {
      if (!mongoose.Types.ObjectId.isValid(commentId)) {
        return res.status(400).json({
          success: false,
          message: 'Невірний ID коментаря',
        });
      }

      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: 'Коментар не знайдено',
        });
      }

      if (!comment.author.equals(req.user._id) && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Немає прав для завантаження файлів до цього коментаря',
        });
      }
    }

    const attachments = [];

    for (const file of req.files) {
      // Генерація хешу файлу
      const fileBuffer = await fs.readFile(file.path);
      const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');

      // Перевірка на дублікати
      const existingFile = await Attachment.findOne({ hash });
      if (existingFile) {
        // Видалити завантажений файл, оскільки він дублікат
        await fs.unlink(file.path);

        // Додати посилання на існуючий файл
        if (ticketId) {
          existingFile.ticket = ticketId;
        }
        if (commentId) {
          existingFile.comment = commentId;
        }
        await existingFile.save();

        attachments.push(existingFile);
        continue;
      }

      const attachment = new Attachment({
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: file.path,
        url: `/uploads/${file.filename}`,
        hash,
        ticket: ticketId || null,
        comment: commentId || null,
        uploadedBy: req.user._id,
        category,
      });

      await attachment.save();
      attachments.push(attachment);
    }

    // Заповнити дані для відповіді
    await Attachment.populate(attachments, [
      { path: 'uploadedBy', select: 'firstName lastName email' },
      { path: 'ticket', select: 'title' },
      { path: 'comment', select: 'content' },
    ]);

    res.status(201).json({
      success: true,
      message: `Успішно завантажено ${attachments.length} файл(ів)`,
      data: attachments,
    });
  } catch (error) {
    logger.error('Error uploading attachments:', error);

    // Видалити завантажені файли у разі помилки
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          logger.error('Error deleting file:', unlinkError);
        }
      }
    }

    res.status(500).json({
      success: false,
      message: 'Помилка при завантаженні файлів',
      error: error.message,
    });
  }
};

// Отримати вкладення
exports.getAttachments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      ticketId,
      commentId,
      userId,
      category,
      mimeType,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // Побудова фільтрів
    const filters = { isDeleted: false };

    if (ticketId) {
      if (!mongoose.Types.ObjectId.isValid(ticketId)) {
        return res.status(400).json({
          success: false,
          message: 'Невірний ID тикету',
        });
      }
      filters.ticket = ticketId;
    }

    if (commentId) {
      if (!mongoose.Types.ObjectId.isValid(commentId)) {
        return res.status(400).json({
          success: false,
          message: 'Невірний ID коментаря',
        });
      }
      filters.comment = commentId;
    }

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Невірний ID користувача',
        });
      }
      filters.uploadedBy = userId;
    }

    if (category) {
      filters.category = category;
    }
    if (mimeType) {
      filters.mimeType = new RegExp(mimeType, 'i');
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      populate: [
        { path: 'uploadedBy', select: 'firstName lastName email' },
        { path: 'ticket', select: 'title status' },
        { path: 'comment', select: 'content' },
      ],
    };

    const attachments = await Attachment.paginate(filters, options);

    res.json({
      success: true,
      data: attachments.docs,
      pagination: {
        currentPage: attachments.page,
        totalPages: attachments.totalPages,
        totalItems: attachments.totalDocs,
        hasNext: attachments.hasNextPage,
        hasPrev: attachments.hasPrevPage,
      },
    });
  } catch (error) {
    logger.error('Error fetching attachments:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні вкладень',
      error: error.message,
    });
  }
};

// Отримати вкладення за ID
exports.getAttachmentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID вкладення',
      });
    }

    const attachment = await Attachment.findById(id)
      .populate('uploadedBy', 'firstName lastName email')
      .populate('ticket', 'title status')
      .populate('comment', 'content');

    if (!attachment || attachment.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Вкладення не знайдено',
      });
    }

    // Збільшити лічильник завантажень
    await attachment.incrementDownloadCount();

    res.json({
      success: true,
      data: attachment,
    });
  } catch (error) {
    logger.error('Error fetching attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні вкладення',
      error: error.message,
    });
  }
};

// Завантажити файл
exports.downloadAttachment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID вкладення',
      });
    }

    const attachment = await Attachment.findById(id);

    if (!attachment || attachment.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Файл не знайдено',
      });
    }

    // Перевірка існування файлу
    try {
      await fs.access(attachment.path);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Файл не існує на сервері',
      });
    }

    // Збільшити лічильник завантажень
    await attachment.incrementDownloadCount();

    // Встановити заголовки для завантаження
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`);
    res.setHeader('Content-Type', attachment.mimeType);

    // Відправити файл
    res.sendFile(path.resolve(attachment.path));
  } catch (error) {
    logger.error('Error downloading attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при завантаженні файлу',
      error: error.message,
    });
  }
};

// Видалити вкладення
exports.deleteAttachment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID вкладення',
      });
    }

    const attachment = await Attachment.findById(id);

    if (!attachment || attachment.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Вкладення не знайдено',
      });
    }

    // Перевірка прав доступу
    const canDelete = attachment.uploadedBy.equals(req.user._id) || req.user.role === 'admin';
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для видалення цього вкладення',
      });
    }

    // М'яке видалення
    await attachment.softDelete();

    res.json({
      success: true,
      message: 'Вкладення успішно видалено',
    });
  } catch (error) {
    logger.error('Error deleting attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при видаленні вкладення',
      error: error.message,
    });
  }
};

// Відновити видалене вкладення
exports.restoreAttachment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID вкладення',
      });
    }

    // Тільки адміни можуть відновлювати вкладення
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для відновлення вкладень',
      });
    }

    const attachment = await Attachment.findById(id);

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Вкладення не знайдено',
      });
    }

    if (!attachment.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Вкладення не видалено',
      });
    }

    // Відновлення
    await attachment.restore();

    res.json({
      success: true,
      message: 'Вкладення успішно відновлено',
      data: attachment,
    });
  } catch (error) {
    logger.error('Error restoring attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при відновленні вкладення',
      error: error.message,
    });
  }
};

// Оновити метадані вкладення
exports.updateAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array(),
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Невірний ID вкладення',
      });
    }

    const attachment = await Attachment.findById(id);

    if (!attachment || attachment.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Вкладення не знайдено',
      });
    }

    // Перевірка прав доступу
    const canUpdate = attachment.uploadedBy.equals(req.user._id) || req.user.role === 'admin';
    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для оновлення цього вкладення',
      });
    }

    const { category, tags, description, expiresAt } = req.body;

    if (category) {
      attachment.category = category;
    }
    if (tags) {
      attachment.tags = tags;
    }
    if (description) {
      attachment.metadata.description = description;
    }
    if (expiresAt) {
      await attachment.setExpirationDate(new Date(expiresAt));
    }

    await attachment.save();

    // Заповнити дані для відповіді
    await attachment.populate([
      { path: 'uploadedBy', select: 'firstName lastName email' },
      { path: 'ticket', select: 'title status' },
      { path: 'comment', select: 'content' },
    ]);

    res.json({
      success: true,
      message: 'Вкладення успішно оновлено',
      data: attachment,
    });
  } catch (error) {
    logger.error('Error updating attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при оновленні вкладення',
      error: error.message,
    });
  }
};

// Отримати статистику вкладень
exports.getAttachmentStatistics = async (req, res) => {
  try {
    // Перевірка прав доступу
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для перегляду статистики вкладень',
      });
    }

    const { startDate, endDate, userId } = req.query;

    // Побудова фільтрів
    const filters = { isDeleted: false };

    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) {
        filters.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filters.createdAt.$lte = new Date(endDate);
      }
    }

    if (userId) {
      filters.uploadedBy = userId;
    }

    // Використання статичних методів з моделі
    const [generalStats, categoryStats, typeStats, userStats, duplicates] = await Promise.all([
      Attachment.getStatistics(filters),
      Attachment.findByCategory(),
      Attachment.aggregate([
        { $match: filters },
        {
          $group: {
            _id: '$fileType',
            count: { $sum: 1 },
            totalSize: { $sum: '$size' },
          },
        },
        { $sort: { count: -1 } },
      ]),
      Attachment.aggregate([
        { $match: filters },
        {
          $lookup: {
            from: 'users',
            localField: 'uploadedBy',
            foreignField: '_id',
            as: 'userInfo',
          },
        },
        { $unwind: '$userInfo' },
        {
          $group: {
            _id: '$uploadedBy',
            userName: { $first: { $concat: ['$userInfo.firstName', ' ', '$userInfo.lastName'] } },
            fileCount: { $sum: 1 },
            totalSize: { $sum: '$size' },
          },
        },
        { $sort: { fileCount: -1 } },
        { $limit: 10 },
      ]),
      Attachment.findDuplicates(),
    ]);

    res.json({
      success: true,
      data: {
        general: generalStats,
        byCategory: categoryStats,
        byType: typeStats,
        topUsers: userStats,
        duplicates: duplicates.slice(0, 10), // Топ 10 дублікатів
        filters: {
          startDate,
          endDate,
          userId,
        },
        generatedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error('Error fetching attachment statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні статистики вкладень',
      error: error.message,
    });
  }
};

// Очистити застарілі файли
exports.cleanupExpiredFiles = async (req, res) => {
  try {
    // Тільки адміни можуть виконувати очищення
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Немає прав для очищення файлів',
      });
    }

    const expiredFiles = await Attachment.findExpired();
    let deletedCount = 0;

    for (const file of expiredFiles) {
      try {
        // Видалити фізичний файл
        await fs.unlink(file.path);
        // М'яке видалення з бази даних
        await file.softDelete();
        deletedCount++;
      } catch (error) {
        logger.error(`Error deleting file ${file.filename}:`, error);
      }
    }

    res.json({
      success: true,
      message: `Успішно видалено ${deletedCount} застарілих файлів`,
      data: {
        totalExpired: expiredFiles.length,
        deleted: deletedCount,
        failed: expiredFiles.length - deletedCount,
      },
    });
  } catch (error) {
    logger.error('Error cleaning up expired files:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при очищенні застарілих файлів',
      error: error.message,
    });
  }
};
