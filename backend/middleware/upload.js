const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const logger = require('../utils/logger');

// Створюємо папки для завантажень
const uploadsDir = path.join(__dirname, '../uploads');
const tempDir = path.join(uploadsDir, 'temp');
const attachmentsDir = path.join(uploadsDir, 'attachments');
const avatarsDir = path.join(uploadsDir, 'avatars');

const ensureDirectories = async () => {
  const dirs = [uploadsDir, tempDir, attachmentsDir, avatarsDir];
  
  for (const dir of dirs) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }
};

// Ініціалізуємо папки при запуску
ensureDirectories().catch(logger.error);

// Дозволені типи файлів
const allowedMimeTypes = {
  images: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ],
  documents: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ],
  archives: [
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed'
  ]
};

const allAllowedTypes = [
  ...allowedMimeTypes.images,
  ...allowedMimeTypes.documents,
  ...allowedMimeTypes.archives
];

// Функція для генерації унікального імені файлу
const generateFileName = (originalName) => {
  const ext = path.extname(originalName);
  const name = path.basename(originalName, ext);
  const hash = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  
  return `${name}_${timestamp}_${hash}${ext}`;
};

// Налаштування зберігання для вкладень
const attachmentStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureDirectories();
    cb(null, attachmentsDir);
  },
  filename: (req, file, cb) => {
    const fileName = generateFileName(file.originalname);
    cb(null, fileName);
  }
});

// Налаштування зберігання для аватарів
const avatarStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureDirectories();
    cb(null, avatarsDir);
  },
  filename: (req, file, cb) => {
    const fileName = generateFileName(file.originalname);
    cb(null, fileName);
  }
});

// Фільтр файлів для вкладень
const attachmentFileFilter = (req, file, cb) => {
  if (allAllowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Тип файлу ${file.mimetype} не підтримується`), false);
  }
};

// Фільтр файлів для аватарів (тільки зображення)
const avatarFileFilter = (req, file, cb) => {
  if (allowedMimeTypes.images.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Для аватара можна завантажувати тільки зображення'), false);
  }
};

// Middleware для завантаження вкладень
const uploadAttachment = multer({
  storage: attachmentStorage,
  fileFilter: attachmentFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10 // Максимум 10 файлів за раз
  }
});

// Middleware для завантаження аватарів
const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  }
});

// Middleware для обробки помилок завантаження
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'Файл занадто великий'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Забагато файлів'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Неочікуване поле файлу'
        });
      default:
        return res.status(400).json({
          success: false,
          message: 'Помилка завантаження файлу'
        });
    }
  }
  
  if (err.message.includes('не підтримується') || err.message.includes('тільки зображення')) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  next(err);
};

// Middleware для валідації завантажених файлів
const validateUploadedFiles = (req, res, next) => {
  if (!req.files && !req.file) {
    return res.status(400).json({
      success: false,
      message: 'Файли не завантажено'
    });
  }
  
  const files = req.files || [req.file];
  
  // Додаткова перевірка розмірів та типів
  for (const file of files) {
    if (!file) continue;
    
    // Перевіряємо розширення файлу
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.txt', '.csv', '.zip', '.rar', '.7z'
    ];
    
    if (!allowedExtensions.includes(ext)) {
      return res.status(400).json({
        success: false,
        message: `Розширення файлу ${ext} не підтримується`
      });
    }
  }
  
  next();
};

// Функція для видалення файлу
const deleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    logger.info(`🗑️ Файл видалено: ${filePath}`);
  } catch (error) {
    logger.error(`❌ Помилка видалення файлу ${filePath}:`, error);
  }
};

// Middleware для очищення тимчасових файлів при помилці
const cleanupOnError = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Якщо сталася помилка, видаляємо завантажені файли
    if (res.statusCode >= 400) {
      const files = req.files || (req.file ? [req.file] : []);
      
      files.forEach(file => {
        if (file && file.path) {
          deleteFile(file.path);
        }
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = {
  uploadAttachment,
  uploadAvatar,
  handleUploadError,
  validateUploadedFiles,
  cleanupOnError,
  deleteFile,
  allowedMimeTypes,
  uploadsDir,
  attachmentsDir,
  avatarsDir
};