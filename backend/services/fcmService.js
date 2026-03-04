const admin = require('firebase-admin');
const logger = require('../utils/logger');
const User = require('../models/User');

class FCMService {
  constructor() {
    this.isInitialized = false;
    this._initializeFirebase();
  }

  _initializeFirebase() {
    try {
      // Перевіряємо, чи Firebase вже ініціалізовано
      if (admin.apps.length === 0) {
        // Шукаємо service account key
        const fs = require('fs');
        const path = require('path');

        // Перевіряємо різні можливі шляхи
        const possiblePaths = [
          process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
          path.resolve(__dirname, '../.firebase/heldeskm-service-account.json'),
          path.resolve(__dirname, '../../.firebase/heldeskm-service-account.json'),
          path.resolve(process.cwd(), '.firebase/heldeskm-service-account.json'),
          './.firebase/heldeskm-service-account.json',
        ].filter(p => p !== null && p !== undefined);

        let serviceAccountFullPath = null;
        for (const serviceAccountPath of possiblePaths) {
          const fullPath = path.resolve(serviceAccountPath);
          if (fs.existsSync(fullPath)) {
            serviceAccountFullPath = fullPath;
            break;
          }
        }

        if (serviceAccountFullPath) {
          try {
            const serviceAccount = require(serviceAccountFullPath);
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
            });
            this.isInitialized = true;
            logger.info('✅ Firebase Admin SDK ініціалізовано для FCM');
          } catch (error) {
            logger.error('❌ Помилка ініціалізації Firebase з service account:', error);
            this.isInitialized = false;
          }
        } else {
          logger.warn(
            '⚠️ Firebase service account key не знайдено. FCM сповіщення не будуть працювати.'
          );
          logger.warn(`   Перевірені шляхи: ${possiblePaths.join(', ')}`);
          logger.warn(
            '   Встановіть змінну середовища FIREBASE_SERVICE_ACCOUNT_PATH або розмістіть файл в .firebase/heldeskm-service-account.json'
          );
        }
      } else {
        this.isInitialized = true;
        logger.info('✅ Firebase Admin SDK вже ініціалізовано');
      }
    } catch (error) {
      logger.error('❌ Помилка ініціалізації Firebase Admin SDK:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Відправити FCM сповіщення користувачу
   * @param {String} userId - ID користувача
   * @param {Object} notification - Об'єкт сповіщення {title, body, data}
   * @returns {Promise<boolean>}
   */
  async sendToUser(userId, notification) {
    if (!this.isInitialized) {
      logger.warn('⚠️ FCM не ініціалізовано, сповіщення не відправлено');
      return false;
    }

    try {
      const user = await User.findById(userId).select('devices email');
      if (!user || !user.devices || user.devices.length === 0) {
        logger.warn(
          `⚠️ Користувач ${userId} (${user?.email || 'N/A'}) не має зареєстрованих пристроїв`
        );
        return false;
      }

      // Отримуємо всі активні push токени
      const pushTokens = user.devices
        .filter(device => device.isActive && device.pushToken && device.pushToken.trim() !== '')
        .map(device => device.pushToken);

      if (pushTokens.length === 0) {
        logger.warn(
          `⚠️ Користувач ${userId} (${user.email || 'N/A'}) не має активних push токенів`
        );
        const devicesInfo = user.devices.map(d => ({
          isActive: d.isActive,
          hasToken: !!d.pushToken,
          tokenLength: d.pushToken?.length || 0,
        }));
        logger.info('   Пристрої користувача: ' + JSON.stringify(devicesInfo));
        return false;
      }

      logger.info(
        `📤 Відправка FCM сповіщення користувачу ${user.email || userId}: ${pushTokens.length} токен(ів)`
      );

      const message = {
        notification: {
          title: notification.title || 'HelDesKM',
          body: notification.body || '',
        },
        data: {
          ...notification.data,
          type: notification.type || 'notification',
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'helpdesk_channel',
            defaultSound: true,
            defaultVibrateTimings: true,
            visibility: 'public',
            notificationPriority: 'PRIORITY_MAX', // Максимальний пріоритет для звуку та heads-up
            tag: 'helpdesk_notification', // Тег для групування
            clickAction: 'FLUTTER_NOTIFICATION_CLICK', // Дія при кліку
            sticky: false, // Не постійне сповіщення
            localOnly: false, // Показувати на всіх пристроях
            defaultLightSettings: true, // Використовувати світло за замовчуванням
            lightSettings: {
              color: '#FF0000', // Червоний колір у форматі #RRGGBB
              lightOnDurationMillis: 1000,
              lightOffDurationMillis: 500,
            },
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      // Відправляємо сповіщення на всі пристрої користувача
      const results = await Promise.allSettled(
        pushTokens.map(token =>
          admin.messaging().send({
            ...message,
            token: token,
          })
        )
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      logger.info(
        `✅ FCM сповіщення відправлено користувачу ${user.email || userId}: ${successCount} успішно, ${failureCount} помилок`
      );

      // Видаляємо невалідні токени
      if (failureCount > 0) {
        const invalidTokens = [];
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            const error = result.reason;
            logger.error(`❌ Помилка відправки FCM на токен ${index + 1}:`, {
              code: error.code,
              message: error.message,
              stack: error.stack,
            });
            if (
              error.code === 'messaging/invalid-registration-token' ||
              error.code === 'messaging/registration-token-not-registered'
            ) {
              invalidTokens.push(pushTokens[index]);
            }
          }
        });

        if (invalidTokens.length > 0) {
          await this._removeInvalidTokens(userId, invalidTokens);
        }
      }

      return successCount > 0;
    } catch (error) {
      logger.error(`❌ Помилка відправки FCM сповіщення користувачу ${userId}:`, error);
      return false;
    }
  }

  /**
   * Відправити FCM сповіщення всім адміністраторам
   * @param {Object} notification - Об'єкт сповіщення {title, body, data}
   * @returns {Promise<number>} - Кількість успішно відправлених сповіщень
   */
  async sendToAdmins(notification) {
    if (!this.isInitialized) {
      logger.warn('⚠️ FCM не ініціалізовано, сповіщення не відправлено');
      return 0;
    }

    try {
      // Спочатку знаходимо всіх адміністраторів
      const allAdmins = await User.find({
        role: { $in: ['admin', 'super_admin', 'administrator'] },
        isActive: true,
      }).select('_id email firstName lastName role devices');

      logger.info(`🔍 Знайдено ${allAdmins.length} адміністраторів для відправки FCM сповіщень`);

      if (allAdmins.length === 0) {
        logger.warn('⚠️ Не знайдено активних адміністраторів');
        return 0;
      }

      // Фільтруємо адміністраторів з активними токенами
      const adminsWithTokens = allAdmins.filter(admin => {
        if (!admin.devices || !Array.isArray(admin.devices)) {
          return false;
        }
        return admin.devices.some(
          device => device.isActive && device.pushToken && device.pushToken.trim() !== ''
        );
      });

      logger.info(
        `📱 Знайдено ${adminsWithTokens.length} адміністраторів з активними push токенами`
      );

      if (adminsWithTokens.length === 0) {
        logger.warn('⚠️ Не знайдено адміністраторів з активними push токенами');
        // Логуємо деталі для діагностики
        allAdmins.forEach(admin => {
          const tokenCount = admin.devices?.filter(d => d.pushToken).length || 0;
          const activeTokenCount =
            admin.devices?.filter(d => d.isActive && d.pushToken).length || 0;
          logger.info(
            `   Адмін ${admin.email}: ${tokenCount} токенів, ${activeTokenCount} активних`
          );
        });
        return 0;
      }

      let successCount = 0;
      for (const admin of adminsWithTokens) {
        const sent = await this.sendToUser(admin._id.toString(), notification);
        if (sent) {
          successCount++;
          logger.info(`   ✅ Сповіщення відправлено адміністратору ${admin.email}`);
        } else {
          logger.warn(`   ⚠️ Не вдалося відправити сповіщення адміністратору ${admin.email}`);
        }
      }

      logger.info(
        `✅ FCM сповіщення відправлено ${successCount} з ${adminsWithTokens.length} адміністраторам`
      );
      return successCount;
    } catch (error) {
      logger.error('❌ Помилка відправки FCM сповіщень адміністраторам:', error);
      logger.error('   Stack:', error.stack);
      return 0;
    }
  }

  /**
   * Видалити невалідні токени
   * @private
   */
  async _removeInvalidTokens(userId, invalidTokens) {
    try {
      await User.updateOne(
        { _id: userId },
        {
          $set: {
            'devices.$[elem].isActive': false,
          },
        },
        {
          arrayFilters: [{ 'elem.pushToken': { $in: invalidTokens } }],
        }
      );
      logger.info(
        `🗑️ Видалено ${invalidTokens.length} невалідних токенів для користувача ${userId}`
      );
    } catch (error) {
      logger.error('❌ Помилка видалення невалідних токенів:', error);
    }
  }
}

// Експортуємо singleton
const fcmService = new FCMService();
module.exports = fcmService;
