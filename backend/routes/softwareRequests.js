const express = require('express');
const router = express.Router();
const softwareRequestController = require('../controllers/softwareRequestController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Користувацькі маршрути
router.post('/', authenticateToken, softwareRequestController.createRequest);
router.get('/my', authenticateToken, softwareRequestController.getMyRequests);

// Адмін маршрути
router.get('/', authenticateToken, requireAdmin, softwareRequestController.getAllRequests);
router.get('/stats', authenticateToken, requireAdmin, softwareRequestController.getStatistics);
router.put(
  '/:id/approve',
  authenticateToken,
  requireAdmin,
  softwareRequestController.approveRequest
);
router.put('/:id/reject', authenticateToken, requireAdmin, softwareRequestController.rejectRequest);
router.put(
  '/:id/install',
  authenticateToken,
  requireAdmin,
  softwareRequestController.markAsInstalled
);

module.exports = router;
