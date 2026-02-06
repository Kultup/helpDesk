/**
 * Скрипт для видалення дефолтних промптів з BotSettings
 * 
 * Після виконання цього скрипта, всі промпти будуть налаштовуватися
 * тільки через веб-інтерфейс
 */

const mongoose = require('mongoose');
const BotSettings = require('../models/BotSettings');
const logger = require('../utils/logger');
require('dotenv').config();

async function removeDefaultPrompts() {
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
      // Видаляємо довгий дефолтний aiSystemPrompt, якщо він є
      if (setting.aiSystemPrompt && setting.aiSystemPrompt.length > 500) {
        logger.info(`🗑️ Видалення довгого дефолтного промпту для ${setting.key}`);
        setting.aiSystemPrompt = '';
      }

      // Видаляємо дефолтні AI промпти
      if (setting.aiPrompts) {
        if (setting.aiPrompts.intentAnalysis && setting.aiPrompts.intentAnalysis.length > 500) {
          logger.info(`🗑️ Видалення intentAnalysis промпту для ${setting.key}`);
          setting.aiPrompts.intentAnalysis = '';
        }

        if (setting.aiPrompts.questionGeneration && setting.aiPrompts.questionGeneration.length > 500) {
          logger.info(`🗑️ Видалення questionGeneration промпту для ${setting.key}`);
          setting.aiPrompts.questionGeneration = '';
        }

        if (setting.aiPrompts.ticketAnalysis && setting.aiPrompts.ticketAnalysis.length > 500) {
          logger.info(`🗑️ Видалення ticketAnalysis промпту для ${setting.key}`);
          setting.aiPrompts.ticketAnalysis = '';
        }
      }

      await setting.save();
      logger.info(`✅ Оновлено налаштування ${setting.key}`);
    }

    logger.info('✅ Міграція успішно завершена');
    logger.info('ℹ️ Тепер всі промпти налаштовуються через веб-інтерфейс');
  } catch (error) {
    logger.error('❌ Помилка міграції:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    logger.info('🔌 З\'єднання з MongoDB закрито');
  }
}

// Запускаємо міграцію
if (require.main === module) {
  removeDefaultPrompts()
    .then(() => {
      console.log('Міграція завершена - дефолтні промпти видалено');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Помилка міграції:', error);
      process.exit(1);
    });
}

module.exports = removeDefaultPrompts;
