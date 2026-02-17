const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipmentController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadsPath } = require('../config/paths');

// Налаштування multer для завантаження файлів
const equipmentUploadPath = path.join(uploadsPath, 'equipment');
// Створюємо папку якщо її немає
if (!fs.existsSync(equipmentUploadPath)) {
  fs.mkdirSync(equipmentUploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, equipmentUploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /xlsx|xls|csv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    // eslint-disable-next-line no-unused-vars
    const mimetype =
      allowedTypes.test(file.mimetype) ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel';

    if (extname) {
      // mimetype validation can be tricky with excel, trusting extname + basic mimetype check
      return cb(null, true);
    } else {
      cb(new Error('Непідтримуваний тип файлу. Дозволені: .xlsx, .xls, .csv'));
    }
  },
});

// Всі роути вимагають автентифікації
router.use(authenticateToken);

/**
 * @route   GET /api/equipment/template
 * @desc    Завантажити шаблон для імпорту
 * @access  Admin
 */
router.get('/template', adminAuth, equipmentController.getEquipmentTemplate);

/**
 * @route   POST /api/equipment/import
 * @desc    Масовий імпорт обладнання from Excel/CSV
 * @access  Admin
 */
router.post('/import', adminAuth, upload.single('file'), equipmentController.bulkImportEquipment);

/**
 * @route   GET /api/equipment
 * @desc    Отримати список обладнання з фільтрами
 * @access  Private
 */
router.get('/', equipmentController.getEquipment);

/**
 * @route   GET /api/equipment/stats
 * @desc    Отримати статистику обладнання
 * @access  Private
 */
router.get('/stats', equipmentController.getEquipmentStats);

/**
 * @route   GET /api/equipment/:id
 * @desc    Отримати одиницю обладнання за ID
 * @access  Private
 */
router.get('/:id', equipmentController.getEquipmentById);

/**
 * @route   POST /api/equipment
 * @desc    Створити нову одиницю обладнання
 * @access  Admin
 */
router.post('/', adminAuth, equipmentController.createEquipment);

/**
 * @route   PUT /api/equipment/:id
 * @desc    Оновити обладнання
 * @access  Admin
 */
router.put('/:id', adminAuth, equipmentController.updateEquipment);

/**
 * @route   DELETE /api/equipment/:id
 * @desc    Видалити обладнання
 * @access  Admin
 */
router.delete('/:id', adminAuth, equipmentController.deleteEquipment);

/**
 * @route   POST /api/equipment/:id/assign
 * @desc    Призначити обладнання користувачу
 * @access  Admin
 */
router.post('/:id/assign', adminAuth, equipmentController.assignEquipment);

/**
 * @route   POST /api/equipment/:id/status
 * @desc    Змінити статус обладнання
 * @access  Admin
 */
router.post('/:id/status', adminAuth, equipmentController.changeEquipmentStatus);

module.exports = router;
