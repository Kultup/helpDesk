/**
 * Семантичний пошук по базі знань: OpenAI Embeddings + косинусна схожість у Node.js.
 * Модель: text-embedding-3-small (1536 вимірів).
 */
const OpenAI = require('openai').default;
const AISettings = require('../models/AISettings');
const KnowledgeBase = require('../models/KnowledgeBase');
const logger = require('../utils/logger');

const EMBEDDING_MODEL = 'text-embedding-3-small';
/** Максимальна довжина тексту для індексації (OpenAI limit 8191 tokens ~ 20k chars, беремо безпечний обріз). */
const MAX_TEXT_LENGTH = 8000;

/** Пороги для бота: високий = одразу стаття, середній = "Можливо, ви мали на увазі", низький = fallback на $text. */
const SCORE_HIGH = 0.78;
const SCORE_MEDIUM = 0.5;

/**
 * Отримати налаштування AI (OpenAI ключ для embeddings).
 * @returns {Promise<{ openaiApiKey: string }|null>}
 */
async function getEmbeddingSettings() {
  const settings = await AISettings.findOne({ key: 'default' }).lean();
  if (!settings || !settings.openaiApiKey || !String(settings.openaiApiKey).trim()) {
    return null;
  }
  return { openaiApiKey: settings.openaiApiKey.trim() };
}

/**
 * Текст для індексації статті: title + content (обрізаний).
 * @param {{ title?: string, content?: string, tags?: string[] }} article
 * @returns {string}
 */
function getIndexableText(article) {
  const parts = [];
  if (article.title && String(article.title).trim()) {
    parts.push(String(article.title).trim());
  }
  if (article.content && String(article.content).trim()) {
    parts.push(String(article.content).trim());
  }
  if (article.tags && Array.isArray(article.tags) && article.tags.length > 0) {
    parts.push(
      article.tags
        .map(t => (t && String(t).trim()) || '')
        .filter(Boolean)
        .join(' ')
    );
  }
  const text = parts.join('\n\n').trim();
  return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
}

/**
 * Отримати вектор (embedding) для тексту через OpenAI.
 * @param {string} text
 * @param {string} apiKey
 * @returns {Promise<number[]|null>}
 */
async function getEmbedding(text, apiKey) {
  const t = String(text || '').trim();
  if (!t) {
    return null;
  }
  try {
    const openai = new OpenAI({ apiKey });
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: t,
    });
    const vec = res?.data?.[0]?.embedding;
    return Array.isArray(vec) ? vec : null;
  } catch (err) {
    logger.warn('KB embedding: getEmbedding failed', { message: err.message });
    return null;
  }
}

/**
 * Проіндексувати статтю: згенерувати embedding і зберегти в документі.
 * @param {string|import('mongoose').Types.ObjectId|object} articleOrId - ID або документ статті
 * @returns {Promise<boolean>} - true якщо індексація успішна
 */
async function indexArticle(articleOrId) {
  let article;
  if (typeof articleOrId === 'string' || articleOrId?.constructor?.name === 'ObjectId') {
    article = await KnowledgeBase.findById(articleOrId).lean();
  } else if (articleOrId && typeof articleOrId === 'object') {
    article = articleOrId;
  }
  if (!article) {
    logger.warn('KB embedding: indexArticle — статтю не знайдено');
    return false;
  }

  const settings = await getEmbeddingSettings();
  if (!settings) {
    logger.warn('KB embedding: немає OpenAI API ключа, пропускаємо індексацію');
    return false;
  }

  const text = getIndexableText(article);
  if (!text) {
    logger.warn('KB embedding: порожній текст для статті', { id: article._id?.toString() });
    return false;
  }

  const embedding = await getEmbedding(text, settings.openaiApiKey);
  if (!embedding || embedding.length === 0) {
    return false;
  }

  const id = article._id?.toString ? article._id.toString() : article._id;
  await KnowledgeBase.updateOne({ _id: id }, { $set: { embedding } });
  logger.info('KB embedding: проіндексовано статтю', { id, title: article.title?.slice(0, 50) });
  return true;
}

/**
 * Косинусна схожість (вектори вважаються нормалізованими — OpenAI так повертає).
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
 * Семантичний пошук: знайти статті, найближчі до запиту за косинусною схожістю.
 * @param {string} query - текст запиту користувача
 * @param {{ topK?: number }} options - topK (за замовчуванням 5)
 * @returns {Promise<Array<{ article: object, score: number }>>}
 */
async function findSimilarArticles(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) {
    return [];
  }

  const settings = await getEmbeddingSettings();
  if (!settings) {
    return [];
  }

  const embedding = await getEmbedding(q, settings.openaiApiKey);
  if (!embedding || embedding.length === 0) {
    return [];
  }

  const topK = Math.min(Math.max(Number(options.topK) || 5, 1), 20);
  const articles = await KnowledgeBase.find({
    status: 'published',
    isActive: true,
    embedding: { $exists: true, $ne: null },
  })
    .select('+embedding')
    .lean();

  const withScores = articles
    .map(doc => {
      const vec = doc.embedding;
      if (!vec || vec.length !== embedding.length) {
        return null;
      }
      const score = cosineSimilarity(embedding, vec);
      const { embedding: _, ...rest } = doc;
      return { article: rest, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return withScores;
}

/**
 * Пороги score для прийняття рішень у боті.
 */
function getScoreThresholds() {
  return { high: SCORE_HIGH, medium: SCORE_MEDIUM };
}

module.exports = {
  getEmbedding,
  getIndexableText,
  indexArticle,
  findSimilarArticles,
  getScoreThresholds,
  getEmbeddingSettings,
};
