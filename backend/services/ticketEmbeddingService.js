/**
 * Семантичний пошук по закритих тікетах (контекст для AI).
 * Використовує той самий OpenAI text-embedding-3-small, що й kbEmbeddingService.
 */
const Ticket = require('../models/Ticket');
const logger = require('../utils/logger');
const kbEmbeddingService = require('./kbEmbeddingService');

const MAX_TEXT_LENGTH = 8000;

/** Мінімальна оцінка для включення тікета в контекст AI (Етап 2б). Тікети без оцінки вважаються нейтральними (включаються). */
const MIN_RATING_FOR_CONTEXT = 4;

/** Ваги за оцінкою для сортування (Етап 2б): кращі тікети піднімаються вище. */
const RATING_WEIGHT = {
  5: 1.2,
  4: 1.0,
  3: 0.8,
  2: 0.5,
  1: 0.5,
};
function getRatingWeight(ticket) {
  if (
    !ticket?.qualityRating?.hasRating ||
    ticket.qualityRating.rating === null ||
    ticket.qualityRating.rating === undefined
  ) {
    return 1.0;
  }
  return RATING_WEIGHT[ticket.qualityRating.rating] ?? 1.0;
}

/**
 * Текст тікета для індексації: title + description + resolutionSummary (обрізаний).
 * @param {{ title?: string, description?: string, resolutionSummary?: string }} ticket
 * @returns {string}
 */
function getIndexableTextForTicket(ticket) {
  const parts = [];
  if (ticket.title && String(ticket.title).trim()) {
    parts.push(String(ticket.title).trim());
  }
  if (ticket.description && String(ticket.description).trim()) {
    parts.push(String(ticket.description).trim());
  }
  if (ticket.resolutionSummary && String(ticket.resolutionSummary).trim()) {
    parts.push(String(ticket.resolutionSummary).trim());
  }
  const text = parts.join('\n\n').trim();
  return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
}

/**
 * Косинусна схожість (вектори нормалізовані).
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Проіндексувати тікет: згенерувати embedding і зберегти в документі.
 * Індексуємо лише resolved/closed тікети з resolutionSummary або aiDialogHistory.
 * @param {string|import('mongoose').Types.ObjectId|object} ticketOrId
 * @returns {Promise<boolean>}
 */
async function indexTicket(ticketOrId) {
  let ticket;
  if (typeof ticketOrId === 'string' || ticketOrId?.constructor?.name === 'ObjectId') {
    ticket = await Ticket.findById(ticketOrId).lean();
  } else if (ticketOrId && typeof ticketOrId === 'object') {
    ticket = ticketOrId;
  }
  if (!ticket) {
    logger.warn('Ticket embedding: indexTicket — тікет не знайдено');
    return false;
  }
  if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
    return false;
  }
  const hasContent =
    (ticket.resolutionSummary && String(ticket.resolutionSummary).trim()) ||
    (Array.isArray(ticket.aiDialogHistory) && ticket.aiDialogHistory.length > 0);
  if (!hasContent) {
    return false;
  }

  const settings = await kbEmbeddingService.getEmbeddingSettings();
  if (!settings) {
    logger.warn('Ticket embedding: немає OpenAI API ключа');
    return false;
  }

  const text = getIndexableTextForTicket(ticket);
  if (!text) {
    return false;
  }

  const embedding = await kbEmbeddingService.getEmbedding(text, settings.openaiApiKey);
  if (!embedding || embedding.length === 0) {
    return false;
  }

  const id = ticket._id?.toString ? ticket._id.toString() : ticket._id;
  await Ticket.updateOne({ _id: id }, { $set: { embedding } });
  logger.info('Ticket embedding: проіндексовано тікет', { id, title: ticket.title?.slice(0, 50) });
  return true;
}

/**
 * Знайти закриті тікети, найближчі до запиту за косинусною схожістю.
 * @param {string} query - текст запиту (напр. останнє повідомлення користувача)
 * @param {{ topK?: number }} options
 * @returns {Promise<Array<{ ticket: object, score: number }>>}
 */
async function findSimilarTickets(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) {
    return [];
  }

  const settings = await kbEmbeddingService.getEmbeddingSettings();
  if (!settings) {
    return [];
  }

  const embedding = await kbEmbeddingService.getEmbedding(q, settings.openaiApiKey);
  if (!embedding || embedding.length === 0) {
    return [];
  }

  const topK = Math.min(Math.max(Number(options.topK) || 5, 1), 20);
  const tickets = await Ticket.find({
    status: { $in: ['resolved', 'closed'] },
    isDeleted: { $ne: true },
    embedding: { $exists: true, $ne: null },
  })
    .select('+embedding title description resolutionSummary subcategory qualityRating')
    .lean();

  const withScores = tickets
    .map(doc => {
      const vec = doc.embedding;
      if (!vec || vec.length !== embedding.length) {
        return null;
      }
      const rawScore = cosineSimilarity(embedding, vec);
      const { embedding: _, ...rest } = doc;
      const weight = getRatingWeight(rest);
      const score = rawScore * weight;
      return { ticket: rest, score };
    })
    .filter(Boolean)
    .filter(
      item =>
        !item.ticket.qualityRating?.hasRating ||
        (item.ticket.qualityRating?.rating !== null &&
          item.ticket.qualityRating?.rating !== undefined &&
          item.ticket.qualityRating.rating >= MIN_RATING_FOR_CONTEXT)
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return withScores;
}

module.exports = {
  getIndexableTextForTicket,
  indexTicket,
  findSimilarTickets,
};
