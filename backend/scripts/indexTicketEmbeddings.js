/**
 * Первинна індексація закритих тікетів для семантичного пошуку (контекст AI).
 * Запуск: node backend/scripts/indexTicketEmbeddings.js
 * Потрібен .env з MONGODB_URI та OpenAI API ключ в AISettings (default).
 */
/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const database = require('../config/database');
const Ticket = require('../models/Ticket');
const ticketEmbeddingService = require('../services/ticketEmbeddingService');

(async () => {
  try {
    await database.connect();

    const settings = await require('../services/kbEmbeddingService').getEmbeddingSettings();
    if (!settings) {
      console.error(
        'OpenAI API ключ не налаштовано (AISettings key=default). Індексацію пропущено.'
      );
      await database.disconnect();
      process.exit(1);
    }

    const tickets = await Ticket.find({
      status: { $in: ['resolved', 'closed'] },
      isDeleted: { $ne: true },
      $or: [
        { resolutionSummary: { $exists: true, $nin: [null, ''] } },
        { aiDialogHistory: { $exists: true, $not: { $size: 0 } } },
      ],
    })
      .select('title description resolutionSummary subcategory status')
      .lean();

    console.log(`Знайдено закритих тікетів з контентом: ${tickets.length}`);

    let ok = 0;
    let fail = 0;
    for (const ticket of tickets) {
      const success = await ticketEmbeddingService.indexTicket(ticket._id);
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
    console.error('Помилка індексації тікетів:', error);
    await database.disconnect().catch(() => {});
    process.exit(1);
  }
})();
