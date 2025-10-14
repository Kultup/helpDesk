const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { body, param, query } = require('express-validator');
const uploadController = require('../controllers/uploadController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { logAction } = require('../middleware/logger');

// Конфігурація multer для завантаження файлів
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    
    // Створюємо директорію якщо не існує
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }
    
    // Створюємо піддиректорії за типом файлу
    let subDir = 'others';
    if (file.mimetype.startsWith('image/')) {
      subDir = 'images';
    } else if (file.mimetype.startsWith('video/')) {
      subDir = 'videos';
    } else if (file.mimetype.includes('pdf')) {
      subDir = 'documents';
    } else if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet')) {
      subDir = 'spreadsheets';
    } else if (file.mimetype.includes('word') || file.mimetype.includes('document')) {
      subDir = 'documents';
    }
    
    const finalDir = path.join(uploadDir, subDir);
    try {
      await fs.access(finalDir);
    } catch {
      await fs.mkdir(finalDir, { recursive: true });
    }
    
    cb(null, finalDir);
  },
  filename: (req, file, cb) => {
    // Генеруємо унікальне ім'я файлу
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${sanitizedName}_${uniqueSuffix}${ext}`);
  }
});

// Фільтр файлів
const fileFilter = (req, file, cb) => {
  // Дозволені типи файлів
  const allowedTypes = [
    // Зображення
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    
    // Документи
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    
    // Текстові файли
    'text/plain',
    'text/csv',
    'application/json',
    'application/xml',
    
    // Архіви
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    
    // Відео
    'video/mp4',
    'video/avi',
    'video/mov',
    'video/wmv',
    
    // Аудіо
    'audio/mp3',
    'audio/wav',
    'audio/ogg'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Тип файлу ${file.mimetype} не підтримується`), false);
  }
};

// Налаштування multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB максимум
    files: 10 // Максимум 10 файлів за раз
  }
});

// Валідація для завантаження файлів
const uploadValidation = [
  body('description')
    .optional()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Опис повинен містити від 1 до 500 символів'),
  
  body('category')
    .optional()
    .isIn(['ticket_attachment', 'user_avatar', 'document', 'image', 'other'])
    .withMessage('Категорія повинна бути однією з: ticket_attachment, user_avatar, document, image, other'),
  
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic повинно бути boolean значенням'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Теги повинні бути масивом'),
  
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Кожен тег повинен містити від 1 до 50 символів')
];

// Валідація для оновлення файлу
const updateFileValidation = [
  body('filename')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Назва файлу повинна містити від 1 до 255 символів'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Опис повинен містити від 1 до 500 символів'),
  
  body('category')
    .optional()
    .isIn(['ticket_attachment', 'user_avatar', 'document', 'image', 'other'])
    .withMessage('Категорія повинна бути однією з: ticket_attachment, user_avatar, document, image, other'),
  
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic повинно бути boolean значенням'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Теги повинні бути масивом'),
  
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Кожен тег повинен містити від 1 до 50 символів')
];

// МАРШРУТИ

// Завантаження одного файлу
router.post('/single', 
  authenticateToken,
  upload.single('file'),
  uploadValidation,
  logAction('upload_single_file'),
  uploadController.uploadSingle
);

// Завантаження кількох файлів
router.post('/multiple', 
  authenticateToken,
  upload.array('files', 10),
  uploadValidation,
  logAction('upload_multiple_files'),
  uploadController.uploadMultiple
);

// Завантаження файлів з різними полями
router.post('/fields', 
  authenticateToken,
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'documents', maxCount: 5 },
    { name: 'images', maxCount: 10 }
  ]),
  uploadValidation,
  logAction('upload_file_fields'),
  uploadController.uploadFields
);

// Завантаження аватара користувача
router.post('/avatar', 
  authenticateToken,
  upload.single('avatar'),
  body('cropData')
    .optional()
    .isObject()
    .withMessage('Дані обрізки повинні бути об\'єктом'),
  body('cropData.x')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Координата X повинна бути невід\'ємним числом'),
  body('cropData.y')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Координата Y повинна бути невід\'ємним числом'),
  body('cropData.width')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Ширина повинна бути позитивним числом'),
  body('cropData.height')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Висота повинна бути позитивним числом'),
  logAction('upload_user_avatar'),
  uploadController.uploadAvatar
);

// Завантаження файлів для тикету
router.post('/ticket/:ticketId', 
  authenticateToken,
  param('ticketId')
    .isMongoId()
    .withMessage('Невірний ID тикету'),
  upload.array('attachments', 5),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Опис повинен містити від 1 до 500 символів'),
  logAction('upload_ticket_attachments'),
  uploadController.uploadTicketAttachments
);

// Отримання файлу
router.get('/file/:fileId', 
  param('fileId')
    .isMongoId()
    .withMessage('Невірний ID файлу'),
  query('download')
    .optional()
    .isBoolean()
    .withMessage('download повинно бути boolean значенням'),
  query('thumbnail')
    .optional()
    .isBoolean()
    .withMessage('thumbnail повинно бути boolean значенням'),
  query('size')
    .optional()
    .isIn(['small', 'medium', 'large'])
    .withMessage('Розмір повинен бути одним з: small, medium, large'),
  logAction('download_file'),
  uploadController.getFile
);

// Отримання інформації про файл
router.get('/info/:fileId', 
  authenticateToken,
  param('fileId')
    .isMongoId()
    .withMessage('Невірний ID файлу'),
  logAction('get_file_info'),
  uploadController.getFileInfo
);

// Список файлів користувача
router.get('/my-files', 
  authenticateToken,
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Номер сторінки повинен бути позитивним числом'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Ліміт повинен бути числом від 1 до 100'),
  query('category')
    .optional()
    .isIn(['ticket_attachment', 'user_avatar', 'document', 'image', 'other'])
    .withMessage('Категорія повинна бути однією з: ticket_attachment, user_avatar, document, image, other'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Пошуковий запит повинен містити від 2 до 100 символів'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'filename', 'size', 'downloads'])
    .withMessage('Сортування може бути за: createdAt, filename, size, downloads'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Порядок сортування може бути: asc або desc'),
  logAction('get_user_files'),
  uploadController.getUserFiles
);

// Список всіх файлів (тільки для адмінів)
router.get('/all', 
  authenticateToken,
  adminAuth,
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Номер сторінки повинен бути позитивним числом'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Ліміт повинен бути числом від 1 до 100'),
  query('category')
    .optional()
    .isIn(['ticket_attachment', 'user_avatar', 'document', 'image', 'other'])
    .withMessage('Категорія повинна бути однією з: ticket_attachment, user_avatar, document, image, other'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Пошуковий запит повинен містити від 2 до 100 символів'),
  query('userId')
    .optional()
    .isMongoId()
    .withMessage('Невірний ID користувача'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Дата початку повинна бути в форматі ISO 8601'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Дата кінця повинна бути в форматі ISO 8601'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'filename', 'size', 'downloads'])
    .withMessage('Сортування може бути за: createdAt, filename, size, downloads'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Порядок сортування може бути: asc або desc'),
  logAction('get_all_files'),
  uploadController.getAllFiles
);

// Оновлення інформації про файл
router.put('/:fileId', 
  authenticateToken,
  param('fileId')
    .isMongoId()
    .withMessage('Невірний ID файлу'),
  updateFileValidation,
  logAction('update_file_info'),
  uploadController.updateFile
);

// Видалення файлу
router.delete('/:fileId', 
  authenticateToken,
  param('fileId')
    .isMongoId()
    .withMessage('Невірний ID файлу'),
  logAction('delete_file'),
  uploadController.deleteFile
);

// Масове видалення файлів
router.delete('/bulk/delete', 
  authenticateToken,
  body('fileIds')
    .isArray({ min: 1, max: 50 })
    .withMessage('Повинен бути масив з 1-50 ID файлів'),
  body('fileIds.*')
    .isMongoId()
    .withMessage('Невірний ID файлу'),
  body('force')
    .optional()
    .isBoolean()
    .withMessage('force повинно бути boolean значенням'),
  logAction('bulk_delete_files'),
  uploadController.bulkDeleteFiles
);

// Створення мініатюри
router.post('/:fileId/thumbnail', 
  authenticateToken,
  param('fileId')
    .isMongoId()
    .withMessage('Невірний ID файлу'),
  body('size')
    .optional()
    .isIn(['small', 'medium', 'large'])
    .withMessage('Розмір повинен бути одним з: small, medium, large'),
  body('quality')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Якість повинна бути числом від 1 до 100'),
  logAction('create_thumbnail'),
  uploadController.createThumbnail
);

// Зміна розміру зображення
router.post('/:fileId/resize', 
  authenticateToken,
  param('fileId')
    .isMongoId()
    .withMessage('Невірний ID файлу'),
  body('width')
    .isInt({ min: 1, max: 4000 })
    .withMessage('Ширина повинна бути числом від 1 до 4000'),
  body('height')
    .isInt({ min: 1, max: 4000 })
    .withMessage('Висота повинна бути числом від 1 до 4000'),
  body('maintainAspectRatio')
    .optional()
    .isBoolean()
    .withMessage('maintainAspectRatio повинно бути boolean значенням'),
  body('quality')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Якість повинна бути числом від 1 до 100'),
  logAction('resize_image'),
  uploadController.resizeImage
);

// Обрізка зображення
router.post('/:fileId/crop', 
  authenticateToken,
  param('fileId')
    .isMongoId()
    .withMessage('Невірний ID файлу'),
  body('x')
    .isInt({ min: 0 })
    .withMessage('Координата X повинна бути невід\'ємним числом'),
  body('y')
    .isInt({ min: 0 })
    .withMessage('Координата Y повинна бути невід\'ємним числом'),
  body('width')
    .isInt({ min: 1 })
    .withMessage('Ширина повинна бути позитивним числом'),
  body('height')
    .isInt({ min: 1 })
    .withMessage('Висота повинна бути позитивним числом'),
  body('quality')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Якість повинна бути числом від 1 до 100'),
  logAction('crop_image'),
  uploadController.cropImage
);

// Статистика завантажень
router.get('/stats/overview', 
  authenticateToken,
  adminAuth,
  query('period')
    .optional()
    .isIn(['day', 'week', 'month', 'year'])
    .withMessage('Період повинен бути одним з: day, week, month, year'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Дата початку повинна бути в форматі ISO 8601'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Дата кінця повинна бути в форматі ISO 8601'),
  logAction('get_upload_stats'),
  uploadController.getUploadStatistics
);

// Статистика використання дискового простору
router.get('/stats/storage', 
  authenticateToken,
  adminAuth,
  query('groupBy')
    .optional()
    .isIn(['category', 'user', 'date'])
    .withMessage('Групування може бути за: category, user, date'),
  logAction('get_storage_stats'),
  uploadController.getStorageStatistics
);

// Топ файлів за завантаженнями
router.get('/stats/top-downloads', 
  authenticateToken,
  adminAuth,
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Ліміт повинен бути числом від 1 до 100'),
  query('period')
    .optional()
    .isIn(['day', 'week', 'month', 'year'])
    .withMessage('Період повинен бути одним з: day, week, month, year'),
  logAction('get_top_downloads'),
  uploadController.getTopDownloads
);

// Очищення старих файлів
router.post('/cleanup/old-files', 
  authenticateToken,
  adminAuth,
  body('olderThanDays')
    .isInt({ min: 1, max: 3650 })
    .withMessage('Кількість днів повинна бути від 1 до 3650'),
  body('categories')
    .optional()
    .isArray()
    .withMessage('Категорії повинні бути масивом'),
  body('categories.*')
    .optional()
    .isIn(['ticket_attachment', 'user_avatar', 'document', 'image', 'other'])
    .withMessage('Невірна категорія'),
  body('dryRun')
    .optional()
    .isBoolean()
    .withMessage('dryRun повинно бути boolean значенням'),
  logAction('cleanup_old_files'),
  uploadController.cleanupOldFiles
);

// Очищення неприв'язаних файлів
router.post('/cleanup/orphaned', 
  authenticateToken,
  adminAuth,
  body('dryRun')
    .optional()
    .isBoolean()
    .withMessage('dryRun повинно бути boolean значенням'),
  logAction('cleanup_orphaned_files'),
  uploadController.cleanupOrphanedFiles
);

// Перевірка цілісності файлів
router.post('/verify/integrity', 
  authenticateToken,
  adminAuth,
  body('fileIds')
    .optional()
    .isArray()
    .withMessage('ID файлів повинні бути масивом'),
  body('fileIds.*')
    .optional()
    .isMongoId()
    .withMessage('Невірний ID файлу'),
  body('fixIssues')
    .optional()
    .isBoolean()
    .withMessage('fixIssues повинно бути boolean значенням'),
  logAction('verify_file_integrity'),
  uploadController.verifyFileIntegrity
);

// Експорт списку файлів
router.get('/export/list', 
  authenticateToken,
  adminAuth,
  query('format')
    .optional()
    .isIn(['csv', 'excel'])
    .withMessage('Формат експорту може бути тільки csv або excel'),
  query('category')
    .optional()
    .isIn(['ticket_attachment', 'user_avatar', 'document', 'image', 'other'])
    .withMessage('Категорія повинна бути однією з: ticket_attachment, user_avatar, document, image, other'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Дата початку повинна бути в форматі ISO 8601'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Дата кінця повинна бути в форматі ISO 8601'),
  logAction('export_file_list'),
  uploadController.exportFileList
);

// Архівування файлів
router.post('/archive/create', 
  authenticateToken,
  adminAuth,
  body('fileIds')
    .isArray({ min: 1, max: 100 })
    .withMessage('Повинен бути масив з 1-100 ID файлів'),
  body('fileIds.*')
    .isMongoId()
    .withMessage('Невірний ID файлу'),
  body('archiveName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Назва архіву повинна містити від 1 до 100 символів'),
  body('format')
    .optional()
    .isIn(['zip', 'tar', 'tar.gz'])
    .withMessage('Формат архіву може бути: zip, tar, tar.gz'),
  logAction('create_file_archive'),
  uploadController.createArchive
);

// Обробка помилок завантаження
router.use((error, req, res, next) => {
  logger.error('Помилка завантаження файлу:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: 'Файл занадто великий',
        maxSize: '50MB'
      });
    }
    
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        message: 'Занадто багато файлів',
        maxFiles: 10
      });
    }
    
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        message: 'Неочікуване поле файлу'
      });
    }
  }
  
  if (error.message.includes('не підтримується')) {
    return res.status(400).json({
      message: error.message,
      allowedTypes: [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'text/csv', 'application/json'
      ]
    });
  }
  
  if (error.code === 'ENOENT') {
    return res.status(404).json({
      message: 'Файл не знайдено'
    });
  }
  
  if (error.code === 'ENOSPC') {
    return res.status(507).json({
      message: 'Недостатньо місця на диску'
    });
  }
  
  res.status(500).json({
    message: 'Помилка завантаження файлу',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Щось пішло не так'
  });
});

module.exports = router;