const User = require('../models/User');
const logger = require('./logger');

/**
 * Очищення застарілих pending реєстрацій
 * Видаляє заявки на реєстрацію старші за вказаний період
 */
async function cleanupPendingRegistrations(daysOld = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Знаходимо застарілі pending реєстрації
    const oldPendingUsers = await User.find({
      registrationStatus: 'pending',
      createdAt: { $lt: cutoffDate }
    });

    if (oldPendingUsers.length === 0) {
      logger.info('Немає застарілих pending реєстрацій для очищення');
      return { cleaned: 0, details: [] };
    }

    // Видаляємо застарілі реєстрації
    const result = await User.deleteMany({
      registrationStatus: 'pending',
      createdAt: { $lt: cutoffDate }
    });

    const cleanedDetails = oldPendingUsers.map(user => ({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      createdAt: user.createdAt
    }));

    logger.info(`Очищено ${result.deletedCount} застарілих pending реєстрацій`, {
      daysOld,
      cutoffDate,
      cleanedUsers: cleanedDetails
    });

    return {
      cleaned: result.deletedCount,
      details: cleanedDetails
    };

  } catch (error) {
    logger.error('Помилка при очищенні pending реєстрацій:', error);
    throw error;
  }
}

/**
 * Очищення відхилених реєстрацій
 * Видаляє відхилені заявки старші за вказаний період
 */
async function cleanupRejectedRegistrations(daysOld = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Знаходимо застарілі rejected реєстрації
    const oldRejectedUsers = await User.find({
      registrationStatus: 'rejected',
      updatedAt: { $lt: cutoffDate }
    });

    if (oldRejectedUsers.length === 0) {
      logger.info('Немає застарілих rejected реєстрацій для очищення');
      return { cleaned: 0, details: [] };
    }

    // Видаляємо застарілі відхилені реєстрації
    const result = await User.deleteMany({
      registrationStatus: 'rejected',
      updatedAt: { $lt: cutoffDate }
    });

    const cleanedDetails = oldRejectedUsers.map(user => ({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      rejectedAt: user.updatedAt,
      rejectionReason: user.rejectionReason
    }));

    logger.info(`Очищено ${result.deletedCount} застарілих rejected реєстрацій`, {
      daysOld,
      cutoffDate,
      cleanedUsers: cleanedDetails
    });

    return {
      cleaned: result.deletedCount,
      details: cleanedDetails
    };

  } catch (error) {
    logger.error('Помилка при очищенні rejected реєстрацій:', error);
    throw error;
  }
}

/**
 * Повне очищення всіх застарілих реєстрацій
 */
async function cleanupAllOldRegistrations() {
  try {
    const pendingResult = await cleanupPendingRegistrations(30); // 30 днів для pending
    const rejectedResult = await cleanupRejectedRegistrations(90); // 90 днів для rejected

    return {
      pending: pendingResult,
      rejected: rejectedResult,
      total: pendingResult.cleaned + rejectedResult.cleaned
    };
  } catch (error) {
    logger.error('Помилка при повному очищенні реєстрацій:', error);
    throw error;
  }
}

module.exports = {
  cleanupPendingRegistrations,
  cleanupRejectedRegistrations,
  cleanupAllOldRegistrations
};