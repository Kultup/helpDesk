const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { uploadsPath, kbUploadsPath } = require('../config/paths');

// Папки створюються при старті в app.js з config/paths. Тут лише визначаємо призначення.

// Налаштування сховища
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let destDir = uploadsPath;
    if (req.baseUrl && req.baseUrl.includes('/kb')) {
      destDir = kbUploadsPath;
    } else if (req.baseUrl && req.baseUrl.includes('/tickets')) {
      destDir = path.join(uploadsPath, 'tickets');
    } else if (req.baseUrl && req.baseUrl.includes('/users')) {
      destDir = path.join(uploadsPath, 'avatars');
    }
    cb(null, destDir);
  },
  filename: function (req, file, cb) {
    // Генеруємо унікальне ім'я файлу
    const uniqueSuffix = uuidv4();
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// Фільтр файлів
const fileFilter = (req, file, cb) => {
  // Дозволені типи файлів для KB
  if (req.baseUrl && req.baseUrl.includes('/kb')) {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
    ];

    // Перевірка розширення файлу, якщо mime-type generic
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = [
      '.pdf',
      '.doc',
      '.docx',
      '.txt',
      '.xls',
      '.xlsx',
      '.jpg',
      '.jpeg',
      '.png',
    ];

    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error('Непідтримуваний тип файлу. Дозволені: PDF, DOC, DOCX, TXT, XLS, XLSX, JPG, PNG'),
        false
      );
    }
  } else {
    // Для інших завантажень дозволяємо все (або можна додати інші правила)
    cb(null, true);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB ліміт
  },
});

module.exports = upload;
