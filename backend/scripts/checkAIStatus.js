const mongoose = require('mongoose');
require('dotenv').config();
const BotSettings = require('../models/BotSettings');

async function checkAIStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk');
    console.log('✅ Підключено до MongoDB');

    const settings = await BotSettings.findOne({ key: 'default' });

    if (!settings) {
      console.log('❌ Налаштування бота не знайдено в БД');
      process.exit(1);
    }

    console.log('\n📊 Статус AI асистента:\n');
    console.log(`AI увімкнено: ${settings.aiEnabled ? '✅ ТАК' : '❌ НІ'}`);
    console.log(`Groq API ключ встановлено: ${settings.groqApiKey ? '✅ ТАК' : '❌ НІ'}`);

    if (settings.groqApiKey) {
      console.log(`Groq API ключ: ${settings.groqApiKey.substring(0, 10)}...`);
    }

    console.log(`Модель: ${settings.groqModel || 'llama3-8b-8192'}`);
    console.log(`\nСистемний промпт:\n${settings.aiSystemPrompt || 'Не встановлено'}`);

    if (!settings.aiEnabled) {
      console.log('\n⚠️ AI асистент ВИМКНЕНО. Увімкніть його в адмін панелі.');
    }

    if (!settings.groqApiKey) {
      console.log('\n⚠️ Groq API ключ НЕ ВСТАНОВЛЕНО. Додайте ключ в адмін панелі.');
      console.log('   Отримати ключ можна на: https://console.groq.com/keys');
    }

    if (settings.aiEnabled && settings.groqApiKey) {
      console.log('\n✅ AI асистент повністю налаштовано та готовий до роботи!');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Помилка:', error.message);
    process.exit(1);
  }
}

checkAIStatus();
