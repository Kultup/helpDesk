const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { cacheMiddleware, invalidateCache, cacheKeyGenerators } = require('../middleware/cache');

// Налаштування multer для завантаження іконок категорій
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/category-icons');
    try {
      await fs.mkdir(uploadPath, { recursive: true });
    } catch (err) {
      // Директорія вже існує
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'category-icon-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Дозволені тільки зображення (jpeg, jpg, png, gif, svg, webp)'));
    }
  }
});

// Валідація для створення/оновлення категорії
const categoryValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Назва категорії повинна містити від 2 до 50 символів')
    .matches(/^[a-zA-Zа-яА-ЯіІїЇєЄ0-9\s\-_]+$/)
    .withMessage('Назва категорії може містити лише літери, цифри, пробіли, дефіси та підкреслення'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Опис не може перевищувати 500 символів'),
  
  body('color')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Колір повинен бути у форматі HEX (#RRGGBB або #RGB)'),
  
  body('icon')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('URL іконки не може перевищувати 500 символів')
    .custom((value) => {
      // Якщо це URL (починається з http:// або https:// або з /uploads)
      if (value && (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/uploads'))) {
        return true;
      }
      // Або це короткий текст/емодзі/назва іконки (до 50 символів)
      if (value && value.length <= 50) {
        return true;
      }
      // Якщо значення порожнє, це теж добре (опціональне поле)
      if (!value) {
        return true;
      }
      return false;
    })
    .withMessage('Іконка повинна бути URL (починається з http://, https:// або /uploads) або коротким текстом (до 50 символів)'),
  
  body('sortOrder')
    .optional()
    .isInt({ min: 0, max: 999 })
    .withMessage('Порядок сортування повинен бути числом від 0 до 999'),
  
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('Статус активності повинен бути булевим значенням')
];

// Отримати всі категорії (доступно всім авторизованим користувачам)
// Кешуємо на 5 хвилин (300 секунд)
router.get('/', 
  authenticateToken, 
  cacheMiddleware(300, cacheKeyGenerators.categories),
  categoryController.getCategories
);

// Отримати статистику категорій (доступно всім авторизованим користувачам)
// Кешуємо на 10 хвилин (600 секунд)
router.get('/stats/usage', 
  authenticateToken, 
  cacheMiddleware(600, cacheKeyGenerators.stats),
  categoryController.getCategoryStats
);

// Отримати категорію за ID (доступно всім авторизованим користувачам)
// Кешуємо на 5 хвилин
router.get('/:id', 
  authenticateToken, 
  cacheMiddleware(300, cacheKeyGenerators.category),
  categoryController.getCategoryById
);

// Завантажити іконку категорії (тільки адміністратори)
router.post('/upload-icon',
  authenticateToken,
  adminAuth,
  upload.single('icon'),
  categoryController.uploadIcon
);

// Створити нову категорію (тільки адміністратори)
// Інвалідуємо кеш категорій після створення
router.post('/', 
  authenticateToken, 
  adminAuth, 
  categoryValidation, 
  invalidateCache('cache:categories:*'),
  categoryController.createCategory
);

// Оновити категорію (тільки адміністратори)
// Інвалідуємо кеш конкретної категорії та списку
router.put('/:id', 
  authenticateToken, 
  adminAuth, 
  categoryValidation, 
  invalidateCache((req) => `cache:category:${req.params.id}`),
  invalidateCache('cache:categories:*'),
  categoryController.updateCategory
);

// Видалити категорію (тільки адміністратори)
// Інвалідуємо кеш після видалення
router.delete('/:id', 
  authenticateToken, 
  adminAuth, 
  invalidateCache((req) => `cache:category:${req.params.id}`),
  invalidateCache('cache:categories:*'),
  categoryController.deleteCategory
);

// Деактивувати категорію (тільки адміністратори)
router.patch('/:id/deactivate', 
  authenticateToken, 
  adminAuth, 
  invalidateCache((req) => `cache:category:${req.params.id}`),
  invalidateCache('cache:categories:*'),
  categoryController.deactivateCategory
);

// Активувати категорію (тільки адміністратори)
router.patch('/:id/activate', 
  authenticateToken, 
  adminAuth, 
  invalidateCache((req) => `cache:category:${req.params.id}`),
  invalidateCache('cache:categories:*'),
  categoryController.activateCategory
);

module.exports = router;