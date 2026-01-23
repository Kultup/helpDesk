const mongoose = require('mongoose');
const logger = require('../utils/logger');
const Ticket = require('../models/Ticket');

/**
 * Cron job для оновлення SLA статусів активних тікетів
 * Запускається кожні 15 хвилин
 */
async function updateSLAStatus() {
  try {
    logger.info('🔄 Початок оновлення SLA статусів...');

    // Знаходимо всі тікети з активним SLA (статус in_progress)
    const tickets = await Ticket.find({
      status: 'in_progress',
      'sla.startTime': { $ne: null },
      'sla.deadline': { $ne: null }
    });

    logger.info(`📊 Знайдено ${tickets.length} тікетів з активним SLA`);

    let updated = 0;
    let breached = 0;
    let atRisk = 0;

    for (const ticket of tickets) {
      const oldStatus = ticket.sla.status;
      
      // Оновлюємо SLA статус
      ticket.updateSLAStatus();
      
      // Зберігаємо якщо статус змінився
      if (oldStatus !== ticket.sla.status) {
        await ticket.save();
        updated++;
        
        if (ticket.sla.status === 'breached') {
          breached++;
          logger.warn(`🚨 SLA порушено для тікету ${ticket._id}: ${ticket.title}`);
        } else if (ticket.sla.status === 'at_risk') {
          atRisk++;
          logger.warn(`⚠️ SLA під ризиком для тікету ${ticket._id}: ${ticket.title} (${ticket.sla.remainingHours}h залишилось)`);
        }
      }
    }

    logger.info(`✅ Оновлення SLA завершено: ${updated} змінено, ${breached} порушено, ${atRisk} під ризиком`);

    return {
      total: tickets.length,
      updated,
      breached,
      atRisk
    };
  } catch (error) {
    logger.error('❌ Помилка оновлення SLA статусів:', error);
    throw error;
  }
}

// Експорт функції
module.exports = { updateSLAStatus };

// Якщо запускається безпосередньо (не через require)
if (require.main === module) {
  // Підключення до MongoDB
  require('dotenv').config();
  
  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
    .then(async () => {
      logger.info('✅ З\'єднано з MongoDB для оновлення SLA');
      await updateSLAStatus();
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Помилка підключення до MongoDB:', error);
      process.exit(1);
    });
}
