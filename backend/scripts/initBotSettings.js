/* eslint-disable no-console */
require('dotenv').config();
const database = require('../config/database');
const BotSettings = require('../models/BotSettings');

(async () => {
  try {
    await database.connect();

    const existing = await BotSettings.findOne({ key: 'default' });
    if (existing) {
      console.log('BotSettings already exists. Skipping initialization.');
      console.log(JSON.stringify(existing.toObject(), null, 2));
      process.exit(0);
    }

    const settings = new BotSettings({
      key: 'default',
      cancelButtonText: '❌ Скасувати',
      priorityPromptText: 'Крок 5/5: Оберіть пріоритет:',
      priorityTexts: new Map([
        ['low', '🟢 Низький'],
        ['medium', '🟡 Середній'],
        ['high', '🔴 Високий'],
      ]),
      statusTexts: new Map([
        ['open', 'Відкритий'],
        ['in_progress', 'В роботі'],
        ['pending', 'Очікує'],
        ['resolved', 'Вирішений'],
        ['closed', 'Закритий'],
      ]),
      statusEmojis: new Map([
        ['open', '🆕'],
        ['in_progress', '⚙️'],
        ['pending', '⏳'],
        ['resolved', '✅'],
        ['closed', '🔒'],
      ]),
    });

    await settings.save();
    console.log('BotSettings initialized successfully');
    console.log(JSON.stringify(settings.toObject(), null, 2));
    await database.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize BotSettings:', error);
    process.exit(1);
  }
})();
