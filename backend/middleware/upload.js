const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Перевіряємо існування папок для завантаження
const uploadDirs = [
  'uploads',
  'uploads/kb',
  'uploads/tickets',
  'uploads/avatars'
];

uploadDirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Налаштування сховища
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'uploads/';
    
    // Визначаємо підпапку на основі типу маршруту або типу файлу
    if (req.baseUrl && req.baseUrl.includes('/kb')) {
      uploadPath += 'kb/';
    } else if (req.baseUrl && req.baseUrl.includes('/tickets')) {
      uploadPath += 'tickets/';
    } else if (req.baseUrl && req.baseUrl.includes('/users')) {
      uploadPath += 'avatars/';
    } else {
      // За замовчуванням
      uploadPath += '';
    }
    
    cb(null, path.join(__dirname, '..', uploadPath));
  },
  filename: function (req, file, cb) {
    // Генеруємо унікальне ім'я файлу
    const uniqueSuffix = uuidv4();
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
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
      'image/png'
    ];
    
    // Перевірка розширення файлу, якщо mime-type generic
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx', '.jpg', '.jpeg', '.png'];

    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Непідтримуваний тип файлу. Дозволені: PDF, DOC, DOCX, TXT, XLS, XLSX, JPG, PNG'), false);
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
    fileSize: 10 * 1024 * 1024 // 10MB ліміт
  }
});

module.exports = upload;
