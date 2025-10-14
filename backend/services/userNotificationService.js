const telegramService = require('./telegramServiceInstance');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

class UserNotificationService {
  /**
   * Відправка сповіщення про зміну статусу користувача
   * @param {Object} user - Користувач
   * @param {Object} statusChanges - Об'єкт зі змінами статусу
   */
  async sendUserStatusChangeNotification(user, statusChanges) {
    try {
      // Перевіряємо чи користувач має Telegram ID
      if (!user.telegramId) {
        logger.info(`Користувач ${user.email} не має Telegram ID для сповіщень`);
        return;
      }

      // Перевіряємо налаштування сповіщень користувача
      if (!this.shouldSendNotification(user, statusChanges)) {
        logger.info(`Сповіщення для користувача ${user.email} вимкнені в налаштуваннях`);
        return;
      }

      // Формуємо повідомлення для кожної зміни
      for (const [field, change] of Object.entries(statusChanges)) {
        const message = this.formatStatusChangeMessage(user, field, change);
        const notificationType = this.getNotificationType(field);

        // Відправляємо в Telegram
        await this.sendTelegramNotification(user, message, notificationType);

        // Зберігаємо сповіщення в базі даних
        await this.saveNotificationToDatabase(user, field, change, notificationType);
      }

      logger.info(`Сповіщення про зміну статусу відправлені користувачу ${user.email}`);
    } catch (error) {
      logger.error('Помилка відправки сповіщення про зміну статусу користувача:', error);
      throw error;
    }
  }

  /**
   * Перевіряє чи потрібно відправляти сповіщення
   * @param {Object} user - Користувач
   * @param {Object} statusChanges - Зміни статусу
   * @returns {boolean}
   */
  shouldSendNotification(user, statusChanges) {
    // Перевіряємо загальні налаштування Telegram сповіщень
    if (!user.telegramSettings?.notifications) {
      return true; // За замовчуванням відправляємо
    }

    const telegramNotifications = user.telegramSettings.notifications;

    // Перевіряємо специфічні налаштування для кожного типу зміни
    for (const field of Object.keys(statusChanges)) {
      switch (field) {
        case 'isActive':
          if (telegramNotifications.statusUpdates !== false) return true;
          break;
        case 'role':
          if (telegramNotifications.statusUpdates !== false) return true;
          break;
        case 'registrationStatus':
          if (telegramNotifications.statusUpdates !== false) return true;
          break;
        default:
          return true;
      }
    }

    return false;
  }

  /**
   * Формує повідомлення про зміну статусу
   * @param {Object} user - Користувач
   * @param {string} field - Поле що змінилося
   * @param {Object} change - Об'єкт зі старим та новим значенням
   * @returns {string}
   */
  formatStatusChangeMessage(user, field, change) {
    const userName = `${user.firstName} ${user.lastName}`;
    
    switch (field) {
      case 'isActive':
        return this.formatActiveStatusMessage(userName, change);
      case 'role':
        return this.formatRoleChangeMessage(userName, change);
      case 'registrationStatus':
        return this.formatRegistrationStatusMessage(userName, change);
      default:
        return `🔔 *Зміна статусу користувача*\n\n` +
               `Користувач: *${userName}*\n` +
               `Поле: ${field}\n` +
               `Було: ${change.old}\n` +
               `Стало: ${change.new}`;
    }
  }

  /**
   * Формує повідомлення про зміну активності
   */
  formatActiveStatusMessage(userName, change) {
    const statusText = change.new ? 'активований' : 'деактивований';
    const emoji = change.new ? '✅' : '❌';
    
    return `${emoji} *Зміна статусу активності*\n\n` +
           `Користувач *${userName}* був ${statusText}.\n\n` +
           `Новий статус: ${change.new ? 'Активний' : 'Неактивний'}`;
  }

  /**
   * Формує повідомлення про зміну ролі
   */
  formatRoleChangeMessage(userName, change) {
    const roleNames = {
      'admin': 'Адміністратор',
      'user': 'Користувач'
    };

    return `👤 *Зміна ролі користувача*\n\n` +
           `Користувач: *${userName}*\n` +
           `Попередня роль: ${roleNames[change.old] || change.old}\n` +
           `Нова роль: ${roleNames[change.new] || change.new}`;
  }

  /**
   * Формує повідомлення про зміну статусу реєстрації
   */
  formatRegistrationStatusMessage(userName, change) {
    const statusNames = {
      'pending': 'Очікує підтвердження',
      'approved': 'Підтверджено',
      'rejected': 'Відхилено'
    };

    const emoji = change.new === 'approved' ? '✅' : 
                  change.new === 'rejected' ? '❌' : '⏳';

    return `${emoji} *Зміна статусу реєстрації*\n\n` +
           `Користувач: *${userName}*\n` +
           `Попередній статус: ${statusNames[change.old] || change.old}\n` +
           `Новий статус: ${statusNames[change.new] || change.new}`;
  }

  /**
   * Визначає тип сповіщення
   */
  getNotificationType(field) {
    switch (field) {
      case 'isActive':
        return 'user_status_change';
      case 'role':
        return 'user_role_change';
      case 'registrationStatus':
        return 'user_registration_status_change';
      default:
        return 'user_status_change';
    }
  }

  /**
   * Відправляє сповіщення в Telegram
   */
  async sendTelegramNotification(user, message, type) {
    try {
      if (!telegramService.isInitialized) {
        logger.warn('Telegram сервіс не ініціалізований');
        return;
      }

      await telegramService.sendNotification(user.telegramId, {
        title: 'Зміна статусу користувача',
        message: message,
        type: type
      });

      logger.info(`Telegram сповіщення відправлено користувачу ${user.email}`);
    } catch (error) {
      logger.error(`Помилка відправки Telegram сповіщення користувачу ${user.email}:`, error);
      throw error;
    }
  }

  /**
   * Зберігає сповіщення в базі даних
   */
  async saveNotificationToDatabase(user, field, change, type) {
    try {
      const notification = new Notification({
        userId: user._id,
        type: type,
        title: 'Зміна статусу користувача',
        message: this.formatStatusChangeMessage(user, field, change),
        priority: 'medium',
        sentToTelegram: true,
        metadata: {
          field: field,
          oldValue: change.old,
          newValue: change.new,
          userEmail: user.email
        }
      });

      await notification.save();
      logger.info(`Сповіщення збережено в базі даних для користувача ${user.email}`);
    } catch (error) {
      logger.error(`Помилка збереження сповіщення в базі даних для користувача ${user.email}:`, error);
      // Не кидаємо помилку, щоб не зупиняти процес
    }
  }

  /**
   * Відправка сповіщення адміністраторам про зміну статусу користувача
   */
  async notifyAdminsAboutUserStatusChange(user, statusChanges) {
    try {
      const User = require('../models/User');
      
      // Отримуємо всіх активних адміністраторів з Telegram ID
      const admins = await User.find({
        role: 'admin',
        isActive: true,
        telegramId: { $exists: true, $ne: null }
      });

      if (admins.length === 0) {
        logger.info('Немає адміністраторів з Telegram для сповіщень');
        return;
      }

      const userName = `${user.firstName} ${user.lastName}`;
      
      for (const admin of admins) {
        // Перевіряємо налаштування адміністратора
        if (!this.shouldSendAdminNotification(admin)) {
          continue;
        }

        for (const [field, change] of Object.entries(statusChanges)) {
          const message = this.formatAdminNotificationMessage(userName, user.email, field, change);
          
          try {
            await telegramService.sendNotification(admin.telegramId, {
              title: 'Зміна статусу користувача (Адмін)',
              message: message,
              type: 'admin_user_status_change'
            });

            // Зберігаємо сповіщення для адміністратора
            await this.saveAdminNotificationToDatabase(admin, user, field, change);
          } catch (error) {
            logger.error(`Помилка відправки сповіщення адміністратору ${admin.email}:`, error);
          }
        }
      }

      logger.info(`Сповіщення про зміну статусу користувача ${user.email} відправлені адміністраторам`);
    } catch (error) {
      logger.error('Помилка відправки сповіщень адміністраторам:', error);
    }
  }

  /**
   * Перевіряє чи потрібно відправляти сповіщення адміністратору
   */
  shouldSendAdminNotification(admin) {
    // Перевіряємо налаштування адміністратора
    if (admin.telegramSettings?.notifications?.statusUpdates === false) {
      return false;
    }
    return true;
  }

  /**
   * Формує повідомлення для адміністраторів
   */
  formatAdminNotificationMessage(userName, userEmail, field, change) {
    const fieldNames = {
      'isActive': 'Активність',
      'role': 'Роль',
      'registrationStatus': 'Статус реєстрації'
    };

    return `🔧 *Адмін сповіщення*\n\n` +
           `Змінено статус користувача:\n` +
           `👤 *${userName}* (${userEmail})\n\n` +
           `📋 Поле: ${fieldNames[field] || field}\n` +
           `📤 Було: ${change.old}\n` +
           `📥 Стало: ${change.new}\n\n` +
           `⏰ Час: ${new Date().toLocaleString('uk-UA')}`;
  }

  /**
   * Зберігає сповіщення для адміністратора
   */
  async saveAdminNotificationToDatabase(admin, user, field, change) {
    try {
      const notification = new Notification({
        userId: admin._id,
        type: 'admin_user_status_change',
        title: 'Зміна статусу користувача (Адмін)',
        message: this.formatAdminNotificationMessage(
          `${user.firstName} ${user.lastName}`,
          user.email,
          field,
          change
        ),
        priority: 'medium',
        sentToTelegram: true,
        metadata: {
          targetUserId: user._id,
          targetUserEmail: user.email,
          field: field,
          oldValue: change.old,
          newValue: change.new
        }
      });

      await notification.save();
    } catch (error) {
      logger.error(`Помилка збереження адмін сповіщення для ${admin.email}:`, error);
    }
  }
}

module.exports = new UserNotificationService();