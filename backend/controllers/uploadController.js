const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const Attachment = require('../models/Attachment');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Конфігурація multer для зберігання файлів
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Фільтр файлів
const fileFilter = (req, file, cb) => {
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
    'text/csv'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Непідтримуваний тип файлу'), false);
  }
};

// Налаштування multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // максимум 5 файлів за раз
  }
});

// Middleware для обробки помилок multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Файл занадто великий. Максимальний розмір: 10MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Занадто багато файлів. Максимум: 5 файлів'
      });
    }
  }
  
  if (error.message === 'Непідтримуваний тип файлу') {
    return res.status(400).json({
      success: false,
      message: 'Непідтримуваний тип файлу'
    });
  }

  next(error);
};

// Завантаження одного файлу
exports.uploadSingle = [
  upload.single('file'),
  handleMulterError,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Файл не завантажено'
        });
      }

      const { ticketId, description } = req.body;

      // Перевіряємо чи існує тикет (якщо вказано)
      if (ticketId) {
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
          // Видаляємо завантажений файл
          await fs.unlink(req.file.path);
          return res.status(404).json({
            success: false,
            message: 'Тикет не знайдено'
          });
        }
      }

      const attachment = new Attachment({
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        ticketId: ticketId || null,
        uploadedBy: req.user.id,
        description: description || null
      });

      await attachment.save();

      res.status(201).json({
        success: true,
        data: {
          id: attachment._id,
          filename: attachment.filename,
          originalName: attachment.originalName,
          size: attachment.size,
          mimetype: attachment.mimetype,
          uploadedAt: attachment.uploadedAt
        },
        message: 'Файл успішно завантажено'
      });
    } catch (error) {
      // Видаляємо файл у разі помилки
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          logger.error('Помилка видалення файлу:', unlinkError);
        }
      }

      logger.error('Помилка завантаження файлу:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера при завантаженні файлу'
      });
    }
  }
];

// Завантаження кількох файлів
exports.uploadMultiple = [
  upload.array('files', 5),
  handleMulterError,
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Файли не завантажено'
        });
      }

      const { ticketId, description } = req.body;

      // Перевіряємо чи існує тикет (якщо вказано)
      if (ticketId) {
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
          // Видаляємо всі завантажені файли
          for (const file of req.files) {
            try {
              await fs.unlink(file.path);
            } catch (unlinkError) {
              logger.error('Помилка видалення файлу:', unlinkError);
            }
          }
          return res.status(404).json({
            success: false,
            message: 'Тикет не знайдено'
          });
        }
      }

      const attachments = [];
      const uploadedFiles = [];

      for (const file of req.files) {
        try {
          const attachment = new Attachment({
            filename: file.filename,
            originalName: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            path: file.path,
            ticketId: ticketId || null,
            uploadedBy: req.user.id,
            description: description || null
          });

          await attachment.save();
          attachments.push(attachment);
          uploadedFiles.push({
            id: attachment._id,
            filename: attachment.filename,
            originalName: attachment.originalName,
            size: attachment.size,
            mimetype: attachment.mimetype,
            uploadedAt: attachment.uploadedAt
          });
        } catch (error) {
          logger.error('Помилка збереження файлу в БД:', error);
          // Видаляємо файл якщо не вдалося зберегти в БД
          try {
            await fs.unlink(file.path);
          } catch (unlinkError) {
            logger.error('Помилка видалення файлу:', unlinkError);
          }
        }
      }

      res.status(201).json({
        success: true,
        data: {
          files: uploadedFiles,
          totalUploaded: uploadedFiles.length,
          totalRequested: req.files.length
        },
        message: `Успішно завантажено ${uploadedFiles.length} з ${req.files.length} файлів`
      });
    } catch (error) {
      // Видаляємо всі файли у разі помилки
      if (req.files) {
        for (const file of req.files) {
          try {
            await fs.unlink(file.path);
          } catch (unlinkError) {
            logger.error('Помилка видалення файлу:', unlinkError);
          }
        }
      }

      logger.error('Помилка завантаження файлів:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера при завантаженні файлів'
      });
    }
  }
];

// Завантаження аватару користувача
exports.uploadAvatar = [
  upload.single('avatar'),
  handleMulterError,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Файл аватару не завантажено'
        });
      }

      // Перевіряємо чи це зображення
      if (!req.file.mimetype.startsWith('image/')) {
        await fs.unlink(req.file.path);
        return res.status(400).json({
          success: false,
          message: 'Аватар має бути зображенням'
        });
      }

      const userId = req.user.id;
      const user = await User.findById(userId);

      // Видаляємо старий аватар якщо є
      if (user.avatar) {
        try {
          const oldAvatarPath = path.join(__dirname, '../uploads', user.avatar);
          await fs.unlink(oldAvatarPath);
        } catch (error) {
          logger.error('Помилка видалення старого аватару:', error);
        }
      }

      // Оновлюємо користувача
      user.avatar = req.file.filename;
      await user.save();

      res.json({
        success: true,
        data: {
          avatar: req.file.filename,
          url: `/uploads/${req.file.filename}`
        },
        message: 'Аватар успішно оновлено'
      });
    } catch (error) {
      // Видаляємо файл у разі помилки
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          logger.error('Помилка видалення файлу:', unlinkError);
        }
      }

      logger.error('Помилка завантаження аватару:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка сервера при завантаженні аватару'
      });
    }
  }
];

// Отримати файл
exports.getFile = async (req, res) => {
  try {
    const { id } = req.params;
    
    const attachment = await Attachment.findById(id);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Файл не знайдено'
      });
    }

    // Перевіряємо права доступу
    if (attachment.ticketId) {
      const ticket = await Ticket.findById(attachment.ticketId);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Пов\'язаний тикет не знайдено'
        });
      }

      // Перевіряємо чи має користувач доступ до тикету
      const hasAccess = 
        req.user.role === 'admin' ||
        ticket.createdBy.toString() === req.user.id ||
        ticket.assignedTo?.toString() === req.user.id;

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Немає доступу до файлу'
        });
      }
    } else {
      // Якщо файл не прив'язаний до тикету, перевіряємо чи це власник
      if (attachment.uploadedBy.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Немає доступу до файлу'
        });
      }
    }

    // Перевіряємо чи існує файл на диску
    try {
      await fs.access(attachment.path);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Файл не знайдено на диску'
      });
    }

    // Встановлюємо заголовки
    res.setHeader('Content-Type', attachment.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`);
    
    // Відправляємо файл
    res.sendFile(path.resolve(attachment.path));
  } catch (error) {
    logger.error('Помилка отримання файлу:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні файлу'
    });
  }
};

// Отримати список файлів
exports.getFiles = async (req, res) => {
  try {
    const { ticketId, page = 1, limit = 20 } = req.query;
    
    const filter = {};
    
    if (ticketId) {
      // Перевіряємо доступ до тикету
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Тикет не знайдено'
        });
      }

      const hasAccess = 
        req.user.role === 'admin' ||
        ticket.createdBy.toString() === req.user.id ||
        ticket.assignedTo?.toString() === req.user.id;

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Немає доступу до файлів тикету'
        });
      }

      filter.ticketId = ticketId;
    } else {
      // Якщо не вказано тикет, показуємо тільки файли користувача (крім адміна)
      if (req.user.role !== 'admin') {
        filter.uploadedBy = req.user.id;
      }
    }

    const files = await Attachment.find(filter)
      .populate('uploadedBy', 'email')
      .populate('ticketId', 'title')
      .sort({ uploadedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Attachment.countDocuments(filter);

    res.json({
      success: true,
      data: {
        files: files.map(file => ({
          id: file._id,
          filename: file.filename,
          originalName: file.originalName,
          mimetype: file.mimetype,
          size: file.size,
          description: file.description,
          uploadedAt: file.uploadedAt,
          uploadedBy: file.uploadedBy,
          ticket: file.ticketId
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Помилка отримання списку файлів:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні списку файлів'
    });
  }
};

// Видалити файл
exports.deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    
    const attachment = await Attachment.findById(id);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Файл не знайдено'
      });
    }

    // Перевіряємо права на видалення
    const canDelete = 
      req.user.role === 'admin' ||
      attachment.uploadedBy.toString() === req.user.id;

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав на видалення файлу'
      });
    }

    // Видаляємо файл з диску
    try {
      await fs.unlink(attachment.path);
    } catch (error) {
      logger.error('Помилка видалення файлу з диску:', error);
    }

    // Видаляємо запис з БД
    await Attachment.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Файл успішно видалено'
    });
  } catch (error) {
    logger.error('Помилка видалення файлу:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при видаленні файлу'
    });
  }
};

// Оновити опис файлу
exports.updateFileDescription = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилки валідації',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { description } = req.body;
    
    const attachment = await Attachment.findById(id);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Файл не знайдено'
      });
    }

    // Перевіряємо права на редагування
    const canEdit = 
      req.user.role === 'admin' ||
      attachment.uploadedBy.toString() === req.user.id;

    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: 'Немає прав на редагування файлу'
      });
    }

    attachment.description = description;
    await attachment.save();

    res.json({
      success: true,
      data: {
        id: attachment._id,
        description: attachment.description
      },
      message: 'Опис файлу оновлено'
    });
  } catch (error) {
    logger.error('Помилка оновлення опису файлу:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при оновленні опису файлу'
    });
  }
};

// Статистика файлів
exports.getFileStats = async (req, res) => {
  try {
    const filter = {};
    
    // Якщо не адмін, показуємо тільки статистику власних файлів
    if (req.user.role !== 'admin') {
      filter.uploadedBy = req.user.id;
    }

    const stats = await Attachment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalFiles: { $sum: 1 },
          totalSize: { $sum: '$size' },
          avgSize: { $avg: '$size' },
          byMimetype: {
            $push: '$mimetype'
          }
        }
      }
    ]);

    // Статистика по типах файлів
    const mimetypeStats = {};
    if (stats[0]?.byMimetype) {
      stats[0].byMimetype.forEach(mimetype => {
        mimetypeStats[mimetype] = (mimetypeStats[mimetype] || 0) + 1;
      });
    }

    res.json({
      success: true,
      data: {
        totalFiles: stats[0]?.totalFiles || 0,
        totalSize: stats[0]?.totalSize || 0,
        avgSize: stats[0]?.avgSize || 0,
        byMimetype: mimetypeStats
      }
    });
  } catch (error) {
    logger.error('Помилка отримання статистики файлів:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні статистики файлів'
    });
  }
};
