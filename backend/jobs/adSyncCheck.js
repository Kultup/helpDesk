const cron = require('node-cron');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Щомісячна перевірка актуальності даних користувачів.
 * Надсилає кожному користувачу з telegramId його поточні дані
 * і пропонує оновити якщо щось змінилося.
 */
async function checkUserProfiles() {
  const telegramService = require('../services/telegramServiceInstance');

  logger.info('Profile check: початок щомісячної перевірки профілів');

  const users = await User.find({
    telegramId: { $exists: true, $ne: null },
    isActive: true,
  })
    .select('_id firstName lastName email phone department telegramId')
    .populate('city', 'name')
    .populate('position', 'name');

  let sent = 0;

  for (const user of users) {
    try {
      const cityName = user.city?.name || '—';
      const positionName = user.position?.name || '—';
      const department = user.department || '—';
      const phone = user.phone || '—';
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

      const msg =
        `🔔 <b>Щомісячна перевірка ваших даних</b>\n\n` +
        `👤 Ім'я: <b>${name}</b>\n` +
        `📍 Місто: <b>${cityName}</b>\n` +
        `🏢 Відділ: <b>${department}</b>\n` +
        `💼 Посада: <b>${positionName}</b>\n` +
        `📞 Телефон: <b>${phone}</b>\n\n` +
        `Дані актуальні?`;

      await telegramService.sendMessage(String(user.telegramId), msg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Все вірно', callback_data: 'profile_check_ok' },
              { text: '✏️ Оновити дані', callback_data: 'profile_update_menu' },
            ],
          ],
        },
      });

      sent++;
    } catch (err) {
      logger.warn(`Profile check: помилка для telegramId=${user.telegramId}: ${err.message}`);
    }
  }

  logger.info(`Profile check: відправлено ${sent} з ${users.length} користувачів`);
}

function setupAdSyncCheck() {
  // Запуск 1-го числа кожного місяця о 09:00
  cron.schedule('0 9 1 * *', () => {
    setImmediate(async () => {
      try {
        await checkUserProfiles();
      } catch (error) {
        logger.error('Profile check: помилка виконання:', error);
      }
    });
  });

  logger.info('✅ Profile check налаштовано (1-го числа місяця о 09:00)');
}

module.exports = { setupAdSyncCheck, checkUserProfiles };
