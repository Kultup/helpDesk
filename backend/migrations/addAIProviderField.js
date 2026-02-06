/**
 * Міграція: Додаємо поле aiProvider в BotSettings
 * 
 * Цей скрипт додає поле aiProvider (groq/openai) та поля для OpenAI
 * до існуючих налаштувань бота.
 */

const mongoose = require('mongoose');
const BotSettings = require('../models/BotSettings');
const logger = require('../utils/logger');
require('dotenv').config();

async function migrate() {
  try {
    // Підключення до MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    logger.info('✅ Підключено до MongoDB');

    // Знаходимо всі налаштування
    const settings = await BotSettings.find({});

    logger.info(`📊 Знайдено ${settings.length} налаштувань`);

    for (const setting of settings) {
      let updated = false;

      // Додаємо aiProvider якщо його немає
      if (!setting.aiProvider) {
        setting.aiProvider = 'groq'; // За замовчуванням використовуємо Groq
        updated = true;
        logger.info(`➕ Додано aiProvider = 'groq' для ${setting.key}`);
      }

      // Додаємо openaiModel якщо його немає
      if (!setting.openaiModel) {
        setting.openaiModel = 'gpt-4o-mini';
        updated = true;
        logger.info(`➕ Додано openaiModel = 'gpt-4o-mini' для ${setting.key}`);
      }

      if (updated) {
        await setting.save();
        logger.info(`✅ Оновлено налаштування ${setting.key}`);
      } else {
        logger.info(`⏭️ Налаштування ${setting.key} вже актуальні`);
      }
    }

    logger.info('✅ Міграція успішно завершена');
  } catch (error) {
    logger.error('❌ Помилка міграції:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    logger.info('🔌 З'єднання з MongoDB закрито');
  }
}

// Запускаємо міграцію
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Міграція завершена');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Помилка міграції:', error);
      process.exit(1);
    });
}

module.exports = migrate;
