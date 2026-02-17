/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const database = require('../config/database');
const KnowledgeBase = require('../models/KnowledgeBase');
const kbEmbeddingService = require('../services/kbEmbeddingService');

(async () => {
  try {
    await database.connect();

    const settings = await kbEmbeddingService.getEmbeddingSettings();
    if (!settings) {
      console.error(
        'OpenAI API ключ не налаштовано (AISettings key=default). Індексацію пропущено.'
      );
      await database.disconnect();
      process.exit(1);
    }

    const articles = await KnowledgeBase.find({
      status: 'published',
      isActive: true,
    }).lean();

    console.log(`Знайдено опублікованих статей: ${articles.length}`);

    let ok = 0;
    let fail = 0;
    for (const article of articles) {
      const success = await kbEmbeddingService.indexArticle(article);
      if (success) {
        ok++;
      } else {
        fail++;
      }
    }

    console.log(`Готово: успішно ${ok}, помилок/пропусків ${fail}`);
    await database.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Помилка індексації KB:', error);
    await database.disconnect().catch(() => {});
    process.exit(1);
  }
})();
