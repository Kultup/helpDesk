const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipmentController');
const { authenticateToken } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Всі роути вимагають автентифікації
router.use(authenticateToken);

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
