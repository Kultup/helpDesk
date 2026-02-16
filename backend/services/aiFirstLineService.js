const path = require('path');
const fs = require('fs');
const { dataPath } = require('../config/paths');
const AISettings = require('../models/AISettings');
const Ticket = require('../models/Ticket');
const {
  INTENT_ANALYSIS,
  INTENT_ANALYSIS_LIGHT,
  selectIntentPrompt,
  SIMILAR_TICKETS_RELEVANCE_CHECK,
  KB_ARTICLE_RELEVANCE_CHECK,
  NEXT_QUESTION,
  TICKET_SUMMARY,
  PHOTO_ANALYSIS,
  COMPUTER_ACCESS_ANALYSIS,
  STATISTICS_ANALYSIS,
  RATING_EMOTION,
  ZABBIX_ALERT_ANALYSIS,
  TICKET_UPDATE_NOTIFICATION,
  CONVERSATION_SUMMARY,
  AUTO_RESOLUTION_CHECK,
  SLA_BREACH_DETECTION,
  PROACTIVE_ISSUE_DETECTION,
  KB_ARTICLE_GENERATION,
  fillPrompt,
  MAX_TOKENS,
  TEMPERATURES,
  INTENT_ANALYSIS_TEMPERATURE,
} = require('../prompts/aiFirstLinePrompts');
const logger = require('../utils/logger');
const aiResponseValidator = require('../utils/aiResponseValidator');
const kbRelevanceGuard = require('../utils/kbRelevanceGuard');
const metricsCollector = require('./metricsCollector');
const retryHelper = require('../utils/retryHelper');

let cachedSettings = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 хв

/** Накопичувач використання токенів OpenAI (з моменту перезапуску). */
let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 };

const TOKEN_USAGE_FILE = path.join(dataPath, 'token_usage.json');

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function readMonthlyUsage() {
  try {
    const raw = fs.readFileSync(TOKEN_USAGE_FILE, 'utf8');
    const data = JSON.parse(raw);
    const month = getCurrentMonth();
    if (data.month === month) {
      return {
        month: data.month,
        promptTokens: data.promptTokens || 0,
        completionTokens: data.completionTokens || 0,
        totalTokens: data.totalTokens || 0,
      };
    }
  } catch (_) {
    // Ignore read errors at startup
  }
  return { month: getCurrentMonth(), promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function addMonthlyUsage(promptTokens, completionTokens, totalTokens) {
  const month = getCurrentMonth();
  let data = readMonthlyUsage();
  if (data.month !== month) {
    data = { month, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }
  data.promptTokens += promptTokens;
  data.completionTokens += completionTokens;
  data.totalTokens += totalTokens;
  try {
    const dir = path.dirname(TOKEN_USAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TOKEN_USAGE_FILE, JSON.stringify(data), 'utf8');
  } catch (err) {
    logger.error('AI: не вдалося зберегти monthly token usage', err);
  }
}

async function getAISettings() {
  if (cachedSettings && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedSettings;
  }
  const settings = await AISettings.findOne({ key: 'default' }).lean();
  cachedSettings = settings;
  cachedAt = Date.now();
  return settings;
}

function formatDialogHistory(dialogHistory) {
  if (!Array.isArray(dialogHistory) || dialogHistory.length === 0) {
    return '(порожньо)';
  }
  return dialogHistory
    .map(m => (m.role === 'user' ? `Користувач: ${m.content}` : `Бот: ${m.content}`))
    .join('\n');
}

/**
 * Час до закриття закладу. Графік: пн 12-21, вт-нд 10-21.
 * Для SMART-ESCALATION: якщо < 2 год до закриття → High→Urgent.
 * @returns {string}
 */
function getTimeContextForPrompt() {
  const now = new Date();
  let hours, minutes, day;
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Kyiv',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    const parts = fmt.formatToParts(now);
    hours = parseInt(parts.find(p => p.type === 'hour').value, 10);
    minutes = parseInt(parts.find(p => p.type === 'minute').value, 10);
    const wd = (parts.find(p => p.type === 'weekday') || {}).value || '';
    day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
    if (day < 0) {
      day = now.getUTCDay();
    }
  } catch (_) {
    hours = now.getHours();
    minutes = now.getMinutes();
    day = now.getDay();
  }
  const currentMins = hours * 60 + minutes;
  const CLOSE_MINS = 21 * 60; // 21:00
  const openMins = day === 1 ? 12 * 60 : 10 * 60; // Mon 12:00, else 10:00
  if (currentMins < openMins) {
    return `Зараз: ${hours}:${String(minutes).padStart(2, '0')}, заклад ще не відкритий (відкриття о ${Math.floor(openMins / 60)}:00).`;
  }
  if (currentMins >= CLOSE_MINS) {
    return `Зараз: ${hours}:${String(minutes).padStart(2, '0')}, заклад закрито на сьогодні.`;
  }

  const minsUntilClose = CLOSE_MINS - currentMins;
  const hoursLeft = Math.floor(minsUntilClose / 60);
  const minsLeft = minsUntilClose % 60;
  const closeStr = `Заклад закривається о 21:00`;
  if (minsUntilClose < 120) {
    return `Зараз: ${hours}:${String(minutes).padStart(2, '0')}. ${closeStr} (через ${hoursLeft} год ${minsLeft} хв) — менше 2 годин до закриття! Рекомендується urgent.`;
  }
  return `Зараз: ${hours}:${String(minutes).padStart(2, '0')}. ${closeStr} (через ${hoursLeft} год ${minsLeft} хв).`;
}

function formatUserContext(userContext) {
  if (!userContext || typeof userContext !== 'object') {
    return '(немає)';
  }
  const parts = [];
  if (userContext.userCity) {
    parts.push(`Місто: ${userContext.userCity}`);
  }
  if (userContext.userPosition) {
    parts.push(`Посада: ${userContext.userPosition}`);
  }
  if (userContext.userInstitution) {
    parts.push(`Заклад: ${userContext.userInstitution}`);
  }
  if (userContext.userName) {
    parts.push(`ПІБ: ${userContext.userName}`);
  }
  if (userContext.hasComputerAccessPhoto) {
    parts.push('Фото доступу до ПК: збережено в профілі');
  }
  if (userContext.computerAccessAnalysis) {
    parts.push(`Розпізнано доступ: ${userContext.computerAccessAnalysis}`);
  }
  if (userContext.userEquipmentSummary) {
    parts.push(`💻 Обладнання: ${userContext.userEquipmentSummary}`);
  }
  return parts.length ? parts.join(', ') : '(немає)';
}

/** Мережевий шторм: 3+ тікети з одного міста про інтернет за 10 хв. */
async function getNetworkStormContext(userCityId) {
  if (!userCityId) {
    return null;
  }
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  try {
    const count = await Ticket.countDocuments({
      createdAt: { $gte: tenMinAgo },
      city: userCityId,
      status: { $in: ['open', 'in_progress'] },
      $or: [
        { subcategory: { $regex: /network|інтернет|мереж|internet/i } },
        { title: { $regex: /інтернет|зв'язок|інтернету|мереж|wifi|wi-fi|зв.?язку/i } },
      ],
    });
    if (count >= 3) {
      return `MEREЖЕВИЙ ШТОРМ (network storm detected): ${count} заявок з цього міста про інтернет за останні 10 хв.`;
    }
  } catch (err) {
    logger.warn('getNetworkStormContext failed', err);
  }
  return null;
}

/** Активна заявка користувача (для анти-спаму). */
async function getActiveTicketForUser(userId) {
  if (!userId) {
    return null;
  }
  try {
    const ticket = await Ticket.findOne({
      createdBy: userId,
      status: { $in: ['open', 'in_progress'] },
    })
      .sort({ createdAt: -1 })
      .select('ticketNumber')
      .lean();
    return ticket;
  } catch (err) {
    logger.warn('getActiveTicketForUser failed', err);
  }
  return null;
}

/** Дублікат: та сама локація (місто+заклад) + категорія за останні 10 хв. Повертає { context, ticketId }. */
async function getDuplicateTicketContext(userCityId, userInstitutionId, categoryHint, problemText) {
  if (!userCityId) {
    return null;
  }
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  try {
    const matchStage = {
      createdAt: { $gte: tenMinAgo },
      city: userCityId,
      status: { $in: ['open', 'in_progress'] },
    };
    if (categoryHint) {
      const cat = String(categoryHint).toLowerCase();
      if (cat.includes('print') || cat.includes('принтер') || cat.includes('hardware')) {
        matchStage.$or = [
          { subcategory: { $regex: /print|принтер|hardware|друк/i } },
          { title: { $regex: /принтер|друк|друку/i } },
        ];
      }
    } else if (problemText && /принтер|друк/i.test(problemText)) {
      matchStage.$or = [
        { subcategory: { $regex: /print|принтер|hardware|друк/i } },
        { title: { $regex: /принтер|друк|друку/i } },
      ];
    }
    let tickets = await Ticket.find(matchStage)
      .populate('createdBy', 'city institution firstName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('ticketNumber createdAt title createdBy _id')
      .lean();
    if (userInstitutionId && tickets.length) {
      tickets = tickets.filter(
        t => t.createdBy && String(t.createdBy.institution) === String(userInstitutionId)
      );
    }
    if (tickets.length > 0) {
      const t = tickets[0];
      const minsAgo = Math.round((Date.now() - new Date(t.createdAt).getTime()) / 60000);
      return {
        context: `ДУБЛІКАТ: Користувач ${t.createdBy?.firstName || 'хтось'} вже створив заявку №${t.ticketNumber} ${minsAgo} хв тому (та сама локація+категорія). НЕ створювати нову. Відповідь: "О, бачу вже створили заявку по цьому ${minsAgo} хв тому. Я додам вас у копію, щоб ви теж бачили статус. Новий тікет не створюю, щоб не плутати чергу 😊"`,
        ticketId: t._id,
      };
    }
  } catch (err) {
    logger.warn('getDuplicateTicketContext failed', err);
  }
  return null;
}

/** Орієнтовна черга для SLA (кількість open+in_progress, час ~12 хв/заявку). */
async function getQueueContext() {
  try {
    const count = await Ticket.countDocuments({
      status: { $in: ['open', 'in_progress'] },
    });
    const minutes = Math.max(15, Math.min(120, count * 12));
    return { count, minutes };
  } catch (err) {
    logger.warn('getQueueContext failed', err);
  }
  return { count: 2, minutes: 40 };
}

/**
 * Форматувати список тікетів в один текст для контексту AI.
 * @param {Array<{ title?: string, description?: string, resolutionSummary?: string, subcategory?: string }>} tickets
 * @returns {string}
 */
function formatTicketsForContext(tickets) {
  if (!tickets || tickets.length === 0) {
    return '(немає)';
  }
  return tickets
    .map(t => {
      const res = t.resolutionSummary || '(рішення не описано)';
      return `[${t.subcategory || '—'}] ${t.title}\nОпис: ${(t.description || '').slice(0, 150)}…\nРішення: ${res.slice(0, 300)}`;
    })
    .join('\n\n---\n\n');
}

/** Подібні закриті тікети для контексту AI. Якщо передано query — семантичний пошук; інакше fallback на останні за датою. */
async function getSimilarResolvedTickets(limit = 5, query = '') {
  const limitNum = Math.min(Math.max(Number(limit) || 5, 1), 20);
  try {
    const q = String(query || '').trim();
    if (q) {
      try {
        const ticketEmbeddingService = require('./ticketEmbeddingService');
        const similar = await ticketEmbeddingService.findSimilarTickets(q, { topK: limitNum });
        if (similar && similar.length > 0) {
          const tickets = similar.map(s => s.ticket);
          logger.info(
            `AI: контекст тікетів — семантичний пошук, знайдено ${tickets.length} (best score: ${similar[0].score.toFixed(3)})`
          );
          return formatTicketsForContext(tickets);
        }
      } catch (err) {
        logger.warn('AI: getSimilarResolvedTickets semantic failed, fallback to date', err);
      }
    }
    const tickets = await Ticket.find({
      status: { $in: ['resolved', 'closed'] },
      isDeleted: { $ne: true },
      $or: [
        { resolutionSummary: { $exists: true, $nin: [null, ''] } },
        { aiDialogHistory: { $exists: true, $not: { $size: 0 } } },
      ],
      $and: [
        {
          $or: [
            { 'qualityRating.hasRating': { $ne: true } },
            { 'qualityRating.rating': { $gte: 4 } },
          ],
        },
      ],
    })
      .sort({ resolvedAt: -1, closedAt: -1, updatedAt: -1 })
      .limit(limitNum)
      .select('title description resolutionSummary subcategory')
      .lean();
    return formatTicketsForContext(tickets);
  } catch (err) {
    logger.error('AI: getSimilarResolvedTickets', err);
    return '(немає)';
  }
}

const EMPTY_TICKETS_PLACEHOLDER = '(немає)';

/** Максимум додаткових пошуків за один запит (Етап 3 — Agentic RAG). */
const MAX_AGENTIC_ITERATIONS = 2;

/**
 * Додатковий контекст для агентського циклу (Етап 3): пошук по KB або тікетах.
 * @param {'kb'|'tickets'} source
 * @param {string} query
 * @returns {Promise<string>}
 */
async function fetchExtraContextForAgentic(source, query) {
  const q = String(query || '').trim();
  if (!q) {
    return '';
  }
  try {
    if (source === 'tickets') {
      const ticketEmbeddingService = require('./ticketEmbeddingService');
      const similar = await ticketEmbeddingService.findSimilarTickets(q, { topK: 10 });
      if (similar && similar.length > 0) {
        const tickets = similar.map(s => s.ticket);
        return formatTicketsForContext(tickets);
      }
      return '';
    }
    if (source === 'kb') {
      const kbEmbeddingService = require('./kbEmbeddingService');
      const results = await kbEmbeddingService.findSimilarArticles(q, { topK: 5 });
      if (results && results.length > 0) {
        return results
          .map(r => {
            const a = r.article || r;
            const title = a.title || 'Стаття';
            const content = (a.content || '').slice(0, 600).trim();
            return `[KB] ${title}\n${content}`;
          })
          .join('\n\n---\n\n');
      }
      const kbSearchService = require('./kbSearchService');
      const article = await kbSearchService.findBestMatchForBotTextOnly(q);
      if (article) {
        const plain = article.toObject ? article.toObject() : article;
        const content = (plain.content || '').slice(0, 600).trim();
        return `[KB] ${plain.title || 'Стаття'}\n${content}`;
      }
      return '';
    }
  } catch (err) {
    logger.warn('AI: fetchExtraContextForAgentic failed', { source, err: err.message });
    return '';
  }
  return '';
}

/**
 * Self-correction (Етап 2): перевірка релевантності контексту минулих тікетів до запиту користувача.
 * Якщо AI відповідає «Ні» — контекст не підставляємо в INTENT_ANALYSIS.
 * @param {Object} settings - AISettings
 * @param {string} userMessage - останнє повідомлення користувача
 * @param {string} similarTicketsText - текст блоку similarTickets
 * @returns {Promise<{ relevant: boolean, reason?: string }>}
 */
async function checkSimilarTicketsRelevance(settings, userMessage, similarTicketsText) {
  if (
    !similarTicketsText ||
    similarTicketsText === EMPTY_TICKETS_PLACEHOLDER ||
    String(similarTicketsText).trim().length < 50
  ) {
    return { relevant: true };
  }
  const maxTokens = MAX_TOKENS.SIMILAR_TICKETS_RELEVANCE_CHECK || 80;
  const systemPrompt = fillPrompt(SIMILAR_TICKETS_RELEVANCE_CHECK, {
    userMessage: userMessage || '(порожньо)',
    similarTickets: similarTicketsText,
  });
  const userPrompt = 'Answer with YES or NO and optional short reason.';
  try {
    const response = await callChatCompletion(
      settings,
      systemPrompt,
      userPrompt,
      maxTokens,
      false,
      0.2
    );
    if (!response || typeof response !== 'string') {
      return { relevant: true };
    }
    const upper = response.trim().toUpperCase();
    const isNo =
      upper.startsWith('NO') ||
      upper.startsWith('НІ') ||
      upper.includes(' NO ') ||
      upper.includes(' НІ ');
    const reasonMatch = response.match(/\b(?:NO|Ні)\s*[:\s]*(.+)/i);
    const reason = reasonMatch ? reasonMatch[1].trim().slice(0, 200) : undefined;
    return { relevant: !isNo, reason: isNo ? reason : undefined };
  } catch (err) {
    logger.warn('AI: checkSimilarTicketsRelevance failed, keeping context', err);
    return { relevant: true };
  }
}

/**
 * Перевірка релевантності статті KB до запиту через AI. При відсутності API або помилці — fallback на правило (kbRelevanceGuard).
 * @param {Object|null} settings - AISettings
 * @param {string} userQuery - повідомлення користувача
 * @param {string} articleTitle - заголовок статті
 * @param {string} [articleContentSnippet] - початок контенту статті
 * @returns {Promise<boolean>} true = релевантно, false = ні
 */
async function checkKbArticleRelevanceWithAI(
  settings,
  userQuery,
  articleTitle,
  articleContentSnippet = ''
) {
  const snippet = String(articleContentSnippet || '')
    .slice(0, 400)
    .trim();
  const fallback = () =>
    kbRelevanceGuard.isKbArticleRelevantToQuery(userQuery, articleTitle, articleContentSnippet);

  if (!settings) {
    return fallback();
  }
  const apiKey =
    settings.provider === 'openai'
      ? settings.openaiApiKey
      : settings.provider === 'gemini'
        ? settings.geminiApiKey
        : '';
  if (!apiKey || !String(apiKey).trim()) {
    return fallback();
  }

  const maxTokens = MAX_TOKENS.KB_ARTICLE_RELEVANCE_CHECK || 60;
  const systemPrompt = fillPrompt(KB_ARTICLE_RELEVANCE_CHECK, {
    userQuery: String(userQuery || '').trim(),
    articleTitle: String(articleTitle || '').trim(),
    articleSnippet: snippet || '(немає фрагменту)',
  });
  const userPrompt = 'Answer with YES or NO.';

  try {
    const response = await callChatCompletion(
      settings,
      systemPrompt,
      userPrompt,
      maxTokens,
      false,
      0.2
    );
    if (!response || typeof response !== 'string') {
      logger.warn('AI: KB relevance check empty response, using rule-based fallback');
      return fallback();
    }
    const upper = response.trim().toUpperCase();
    const isNo =
      upper.startsWith('NO') ||
      upper.startsWith('НІ') ||
      upper.includes(' NO ') ||
      upper.includes(' НІ ');
    const relevant = !isNo;
    logger.info('KB relevance: AI ->', relevant ? 'relevant' : 'not relevant', {
      queryPreview: String(userQuery).slice(0, 50),
      articleTitle: String(articleTitle).slice(0, 50),
    });
    return relevant;
  } catch (err) {
    logger.warn('AI: checkKbArticleRelevanceWithAI failed, using rule-based fallback', {
      message: err.message,
    });
    return fallback();
  }
}

const ANXIOUS_REPEAT_PATTERNS = [
  /^ау\s*$/i,
  /^де\s+ви\??\s*$/i,
  /^ало\s*$/i,
  /^альо\s*$/i,
  /^ви\s+тут\??\s*$/i,
  /^хтось\s+є\??\s*$/i,
  /^є\s+хто\s*$/i,
];

/**
 * Отримує контекст здоров'я сервера для промптів.
 * Якщо все healthy — повертає порожній рядок (нічого не кажемо юзеру).
 * Якщо є unhealthy/warning — повертає рядок з деталями для AI.
 * @returns {Promise<string>}
 */
async function getServerHealthContext() {
  try {
    const { healthCheckService } = require('../middleware/healthCheck');
    const healthStatus = await healthCheckService.runAllChecks();

    if (healthStatus.status === 'healthy') {
      return '';
    }

    const parts = [`Server status: ${healthStatus.status}`];
    const checks = healthStatus.checks || {};

    if (checks.database) {
      parts.push(
        `Database: ${checks.database.status}${checks.database.error ? ' (' + checks.database.error + ')' : ''}`
      );
    }
    if (checks.cpu) {
      parts.push(`CPU Load: ${checks.cpu.details?.usage ?? '?'}%`);
    }
    if (checks.memory) {
      parts.push(`Memory: ${checks.memory.details?.systemMemoryUsage ?? '?'}%`);
    }
    if (checks.uptime) {
      parts.push(`Uptime: ${checks.uptime.details?.formatted ?? '?'}`);
    }
    if (checks.ssl && checks.ssl.status !== 'healthy') {
      const days = checks.ssl.details?.daysUntilExpiry;
      parts.push(
        `SSL: ${checks.ssl.status}${days !== null && days !== undefined ? ' (expires in ' + days + ' days)' : ''}`
      );
    }

    return parts.join('\n');
  } catch (err) {
    logger.warn('getServerHealthContext failed', { message: err.message });
    return '';
  }
}

/**
 * Виклик 1: аналіз наміру та достатності інформації.
 * @param {Array} dialogHistory
 * @param {Object} userContext
 * @param {string} [webSearchContext] - опційний фрагмент з пошуку в інтернеті (troubleshooting) для формування quickSolution
 * @param {Object} [options] - { userId } для anti-spam (activeTicketInfo)
 * @returns {Promise<{...}>}
 */
async function analyzeIntent(dialogHistory, userContext, webSearchContext = '', options = {}) {
  const settings = await getAISettings();
  if (!settings || !settings.enabled) {
    return {
      requestType: 'question',
      requestTypeConfidence: 0,
      isTicketIntent: false,
      needsMoreInfo: false,
      missingInfo: [],
      confidence: 0,
    };
  }

  let apiKey;
  if (settings.provider === 'openai') {
    apiKey = settings.openaiApiKey;
  } else if (settings.provider === 'gemini') {
    apiKey = settings.geminiApiKey;
  }

  if (!apiKey || !apiKey.trim()) {
    logger.warn('AI: відсутній API-ключ для провайдера', settings.provider);
    return {
      requestType: 'question',
      requestTypeConfidence: 0,
      isTicketIntent: false,
      needsMoreInfo: false,
      missingInfo: [],
      confidence: 0,
    };
  }

  // ━━━━ LIGHT CLASSIFICATION (saves ~60% tokens for simple messages) ━━━━
  const promptMode = selectIntentPrompt({
    dialogHistory,
    isFirstMessage: dialogHistory.filter(m => m.role === 'user').length <= 1,
  });

  if (promptMode === 'light') {
    try {
      const serverHealthContext = await getServerHealthContext();
      const lightPrompt = fillPrompt(INTENT_ANALYSIS_LIGHT, {
        userContext: formatUserContext(userContext),
        timeContext: getTimeContextForPrompt(),
        dialogHistory: formatDialogHistory(dialogHistory),
        serverHealthContext: serverHealthContext || '✅ Все працює нормально',
      });

      const lightResponse = await callChatCompletion(
        settings,
        lightPrompt,
        dialogHistory.length > 0 ? dialogHistory[dialogHistory.length - 1].content : '',
        MAX_TOKENS.INTENT_ANALYSIS_LIGHT,
        true,
        TEMPERATURES.INTENT_ANALYSIS_LIGHT
      );

      if (lightResponse) {
        const lightParsed = parseJsonFromResponse(lightResponse);
        if (lightParsed && !lightParsed.needsFullAnalysis) {
          logger.info('AI: Light classification resolved (saved tokens)', {
            requestType: lightParsed.requestType,
            confidence: lightParsed.requestTypeConfidence,
          });
          return {
            requestType: lightParsed.requestType || 'greeting',
            requestTypeConfidence: parseFloat(lightParsed.requestTypeConfidence) || 0.8,
            requestTypeReason: 'light_classification',
            isTicketIntent: !!lightParsed.isTicketIntent,
            needsMoreInfo: !!lightParsed.needsMoreInfo,
            missingInfo: [],
            category: lightParsed.category || '',
            confidence: parseFloat(lightParsed.confidence) || 0.8,
            priority: lightParsed.priority || 'low',
            emotionalTone: lightParsed.emotionalTone || 'neutral',
            quickSolution: lightParsed.quickSolution || '',
            offTopicResponse: lightParsed.offTopicResponse || '',
            needMoreContext: false,
            moreContextSource: 'none',
            promptMode: 'light',
          };
        }
        // If needsFullAnalysis is true, fall through to full analysis
        logger.info('AI: Light classification detected IT problem, switching to full analysis');
      }
    } catch (lightErr) {
      logger.warn('AI: Light classification failed, falling back to full', {
        error: lightErr.message,
      });
    }
  }
  // ━━━━ END LIGHT CLASSIFICATION ━━━━

  // Отримуємо список доступних швидких рішень
  const aiEnhancedService = require('./aiEnhancedService');
  const quickSolutions = aiEnhancedService.getAllQuickSolutions();
  const quickSolutionsText = quickSolutions
    .map(s => `- ${s.problemType}: ${s.keywords.join(', ')}`)
    .join('\n');

  // --- KNOWLEDGE BASE SEARCH (Частина C: семантичний пошук + пороги high/medium, fallback на $text) ---
  if (dialogHistory.length > 0) {
    const lastMsg = dialogHistory[dialogHistory.length - 1];
    if (
      lastMsg &&
      lastMsg.role === 'user' &&
      lastMsg.content &&
      String(lastMsg.content).trim().length > 0
    ) {
      const query = String(lastMsg.content).trim();
      const kbSearchService = require('./kbSearchService');
      const kbEmbeddingService = require('./kbEmbeddingService');
      const baseReturn = {
        requestType: 'question',
        requestTypeConfidence: 1.0,
        isTicketIntent: false,
        needsMoreInfo: false,
        category: null,
        missingInfo: [],
        confidence: 1.0,
        priority: 'low',
        emotionalTone: 'calm',
        quickSolution: null,
        autoTicket: false,
        offTopicResponse: null,
      };

      try {
        const kbSettings = await getAISettings();
        const thresholds = kbEmbeddingService.getScoreThresholds();
        const semanticResults = await kbEmbeddingService.findSimilarArticles(query, { topK: 5 });
        if (semanticResults.length > 0) {
          const best = semanticResults[0];
          if (best.score >= thresholds.high) {
            const plain = best.article;
            const relevant = await checkKbArticleRelevanceWithAI(
              kbSettings,
              query,
              plain.title,
              plain.content
            );
            if (relevant) {
              logger.info(
                `📚 KB semantic (high): "${plain.title}" for query: ${query.substring(0, 80)} (score: ${best.score.toFixed(3)})`
              );
              return {
                ...baseReturn,
                kbArticle: {
                  id: plain._id?.toString(),
                  title: plain.title,
                  content: plain.content || '',
                  attachments: Array.isArray(plain.attachments)
                    ? plain.attachments.map(a => ({ type: a.type, filePath: a.filePath }))
                    : [],
                },
              };
            }
            // Тема не збігається — шукаємо наступний релевантний результат у топі
            for (let i = 1; i < semanticResults.length; i++) {
              const next = semanticResults[i];
              if (next.score < thresholds.medium) {
                break;
              }
              const nextPlain = next.article;
              if (
                await checkKbArticleRelevanceWithAI(
                  kbSettings,
                  query,
                  nextPlain.title,
                  nextPlain.content
                )
              ) {
                logger.info(
                  `📚 KB semantic (high, fallback): "${nextPlain.title}" for query: ${query.substring(0, 80)} (score: ${next.score.toFixed(3)})`
                );
                return {
                  ...baseReturn,
                  kbArticle: {
                    id: nextPlain._id?.toString(),
                    title: nextPlain.title,
                    content: nextPlain.content || '',
                    attachments: Array.isArray(nextPlain.attachments)
                      ? nextPlain.attachments.map(a => ({ type: a.type, filePath: a.filePath }))
                      : [],
                  },
                };
              }
            }
          }
          if (best.score >= thresholds.medium) {
            const relevantCandidates = [];
            for (const r of semanticResults.slice(0, 5)) {
              const isRelevant = await checkKbArticleRelevanceWithAI(
                kbSettings,
                query,
                r.article.title,
                r.article.content
              );
              if (isRelevant) {
                relevantCandidates.push({
                  id: r.article._id?.toString(),
                  title: r.article.title || 'Стаття',
                });
                if (relevantCandidates.length >= 3) {
                  break;
                }
              }
            }
            if (relevantCandidates.length > 0) {
              logger.info(
                `📚 KB semantic (medium): ${relevantCandidates.length} релевантних кандидатів for query: ${query.substring(0, 60)} (best score: ${best.score.toFixed(3)})`
              );
              return {
                ...baseReturn,
                kbArticleCandidates: relevantCandidates,
              };
            }
          }
        }
        const article = await kbSearchService.findBestMatchForBotTextOnly(query);
        if (article) {
          const plain = article.toObject ? article.toObject() : article;
          if (await checkKbArticleRelevanceWithAI(kbSettings, query, plain.title, plain.content)) {
            logger.info(
              `📚 KB fallback (text): "${plain.title}" for query: ${query.substring(0, 80)}`
            );
            return {
              ...baseReturn,
              kbArticle: {
                id: plain._id?.toString(),
                title: plain.title,
                content: plain.content || '',
                attachments: Array.isArray(plain.attachments)
                  ? plain.attachments.map(a => ({ type: a.type, filePath: a.filePath }))
                  : [],
              },
            };
          }
        }
      } catch (err) {
        logger.warn('KB search in analyzeIntent failed', err);
        try {
          const kbSettingsCatch = await getAISettings();
          const article = await kbSearchService.findBestMatchForBot(query);
          if (article) {
            const plain = article.toObject ? article.toObject() : article;
            if (
              await checkKbArticleRelevanceWithAI(
                kbSettingsCatch,
                query,
                plain.title,
                plain.content
              )
            ) {
              return {
                ...baseReturn,
                kbArticle: {
                  id: plain._id?.toString(),
                  title: plain.title,
                  content: plain.content || '',
                  attachments: Array.isArray(plain.attachments)
                    ? plain.attachments.map(a => ({ type: a.type, filePath: a.filePath }))
                    : [],
                },
              };
            }
          }
        } catch (_) {
          // fallback findBestMatchForBot failed, continue to Fast-Track/LLM
        }
      }
    }
  }
  // --- END KNOWLEDGE BASE SEARCH ---

  // --- FAST-TRACK CHECK ---
  // Якщо це чіткий запит з quickSolutions, повертаємо результат одразу без LLM (лише якщо немає статті в KB)
  if (dialogHistory.length > 0) {
    const lastMsg = dialogHistory[dialogHistory.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      const fastTrack = aiEnhancedService.findQuickSolution(lastMsg.content);
      if (fastTrack && fastTrack.hasQuickFix) {
        if (fastTrack.informationalOnly) {
          logger.info(`⚡ AI Fast-Track (informational): ${fastTrack.problemType}`);
          return {
            requestType: 'question',
            requestTypeConfidence: 1.0,
            isTicketIntent: false,
            needsMoreInfo: false,
            category: null,
            missingInfo: [],
            confidence: 1.0,
            priority: 'low',
            emotionalTone: 'calm',
            quickSolution: null,
            autoTicket: false,
            offTopicResponse: fastTrack.solution || null,
          };
        }
        logger.info(`⚡ AI Fast-Track triggered: ${fastTrack.problemType}`);
        return {
          requestType: fastTrack.autoTicket ? 'appeal' : 'question',
          requestTypeConfidence: 1.0,
          isTicketIntent: true,
          needsMoreInfo: fastTrack.needsMoreInfo || false,
          category: fastTrack.category || 'Other',
          missingInfo: fastTrack.missingInfo || [],
          confidence: 1.0,
          priority: 'medium',
          emotionalTone: 'calm',
          quickSolution: fastTrack.solution,
          autoTicket: fastTrack.autoTicket || false,
          offTopicResponse: null,
        };
      }
    }
  }
  // --- END FAST-TRACK ---

  const lastUserMsg =
    dialogHistory.length > 0 && dialogHistory[dialogHistory.length - 1]?.role === 'user'
      ? String(dialogHistory[dialogHistory.length - 1].content || '').trim()
      : '';
  const similarTickets = await getSimilarResolvedTickets(5, lastUserMsg);
  const relevance = await checkSimilarTicketsRelevance(settings, lastUserMsg, similarTickets);
  const similarTicketsForPrompt = relevance.relevant ? similarTickets : EMPTY_TICKETS_PLACEHOLDER;
  if (!relevance.relevant) {
    logger.info('AI: similar tickets context rejected (self-correction)', {
      reason: relevance.reason || 'no reason',
    });
  }

  const userMessage = `Історія діалогу:\n${formatDialogHistory(dialogHistory)}`;
  const temperature =
    typeof INTENT_ANALYSIS_TEMPERATURE === 'number' ? INTENT_ANALYSIS_TEMPERATURE : 0.55;

  let extraContextBlock = '';
  let duplicateTicketId = null;
  const userId = options.userId;
  if (userContext?.userCityId) {
    const storm = await getNetworkStormContext(userContext.userCityId);
    if (storm) {
      extraContextBlock += `\n${storm}`;
    }
    const dup = await getDuplicateTicketContext(
      userContext.userCityId,
      userContext.userInstitutionId,
      null,
      lastUserMsg
    );
    if (dup) {
      extraContextBlock += `\n${dup.context}`;
      duplicateTicketId = dup.ticketId;
    }
  }
  let activeTicketInfoStr = '(немає)';
  if (userId) {
    const active = await getActiveTicketForUser(userId);
    const lastMsg = dialogHistory.filter(m => m.role === 'user').pop()?.content || '';
    const isAnxious = ANXIOUS_REPEAT_PATTERNS.some(r => r.test(String(lastMsg).trim()));
    if (active?.ticketNumber && isAnxious) {
      activeTicketInfoStr = `Користувач має активну заявку №${active.ticketNumber}. НЕ створювати нову.`;
    }
  }

  const serverHealthContext = await getServerHealthContext();
  let parsed = null;

  for (let iter = 0; iter < MAX_AGENTIC_ITERATIONS; iter++) {
    const agenticSecondPass = iter > 0 ? 'true' : 'false';
    const systemPrompt = fillPrompt(INTENT_ANALYSIS, {
      userContext: formatUserContext(userContext),
      timeContext: getTimeContextForPrompt(),
      dialogHistory: formatDialogHistory(dialogHistory),
      quickSolutions: quickSolutionsText,
      webSearchContext: webSearchContext ? String(webSearchContext).trim() : '',
      similarTickets: similarTicketsForPrompt,
      activeTicketInfo: activeTicketInfoStr,
      extraContextBlock: extraContextBlock
        ? `\nAdditional context (requested):\n${extraContextBlock}`
        : '',
      serverHealthContext: serverHealthContext || '(all systems healthy)',
      agenticSecondPass,
    });

    const response = await retryHelper.retryAIRequest(
      () =>
        callChatCompletion(
          settings,
          systemPrompt,
          userMessage,
          MAX_TOKENS.INTENT_ANALYSIS,
          true,
          temperature
        ),
      'analyzeIntent'
    );

    if (!response) {
      return {
        requestType: 'question',
        requestTypeConfidence: 0,
        isTicketIntent: false,
        needsMoreInfo: false,
        missingInfo: [],
        confidence: 0,
        offTopicResponse: null,
      };
    }

    const responseStr = String(response).trim();
    logger.info(
      `🤖 AI RAW RESPONSE (${responseStr.length} chars): ${responseStr.substring(0, 600)}`
    );

    parsed = parseJsonFromResponse(responseStr);
    if (!parsed || typeof parsed !== 'object') {
      logger.error(
        `❌ AI: не вдалося розпарсити результат analyzeIntent. Відповідь (${responseStr.length}): ${responseStr.substring(0, 800)}`
      );
      return {
        requestType: 'appeal',
        requestTypeConfidence: 0.5,
        isTicketIntent: true,
        needsMoreInfo: true,
        missingInfo: [],
        confidence: 0.5,
        offTopicResponse: null,
      };
    }

    const needMore = !!parsed.needMoreContext;
    const source =
      parsed.moreContextSource === 'kb' || parsed.moreContextSource === 'tickets'
        ? parsed.moreContextSource
        : null;

    if (iter < MAX_AGENTIC_ITERATIONS - 1 && needMore && source) {
      extraContextBlock = await fetchExtraContextForAgentic(source, lastUserMsg);
      if (!extraContextBlock || extraContextBlock.length < 20) {
        logger.info('AI: agentic requested more context but none found', { source });
        break;
      }
      logger.info('AI: agentic second pass', { source, extraLength: extraContextBlock.length });
      continue;
    }

    break;
  }

  if (!parsed) {
    return {
      requestType: 'question',
      requestTypeConfidence: 0,
      isTicketIntent: false,
      needsMoreInfo: false,
      missingInfo: [],
      confidence: 0,
      offTopicResponse: null,
    };
  }

  const offTopicResponse =
    parsed.offTopicResponse !== null && String(parsed.offTopicResponse).trim() !== ''
      ? String(parsed.offTopicResponse).trim()
      : null;

  metricsCollector.recordAIResponse(parsed);

  let validatedQuickSolution = parsed.quickSolution || null;
  if (validatedQuickSolution) {
    const validation = aiResponseValidator.validate(validatedQuickSolution, 'quickSolution');
    if (!validation.valid) {
      metricsCollector.recordValidationFailure('quickSolution', validation.reason);
      logger.warn('AI quickSolution validation failed', {
        reason: validation.reason,
        original: validatedQuickSolution.substring(0, 100),
      });
      validatedQuickSolution = null;
    }
  }

  const requestType =
    parsed.requestType === 'appeal' || parsed.requestType === 'question'
      ? parsed.requestType
      : 'question';
  const requestTypeConfidence =
    typeof parsed.requestTypeConfidence === 'number'
      ? Math.max(0, Math.min(1, parsed.requestTypeConfidence))
      : 0.7;

  const adminMetadata =
    parsed.admin_metadata && typeof parsed.admin_metadata === 'object'
      ? {
          server_status_note: parsed.admin_metadata.server_status_note || null,
          user_hardware_context: parsed.admin_metadata.user_hardware_context || null,
          remote_tool_hint: parsed.admin_metadata.remote_tool_hint || null,
          self_healing_attempted: !!parsed.admin_metadata.self_healing_attempted,
        }
      : null;

  return {
    requestType,
    requestTypeConfidence,
    requestTypeReason: parsed.requestTypeReason || null,
    isTicketIntent: !!parsed.isTicketIntent,
    needsMoreInfo: !!parsed.needsMoreInfo,
    category: parsed.category || null,
    missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo : [],
    confidence:
      typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
    priority: parsed.priority || 'medium',
    emotionalTone: parsed.emotionalTone || 'calm',
    quickSolution: validatedQuickSolution,
    offTopicResponse,
    kbArticle: null,
    duplicateTicketId: duplicateTicketId || undefined,
    admin_metadata: adminMetadata,
  };
}

/**
 * Виклик 2: генерація одного уточнюючого питання.
 * @returns {Promise<string>}
 */
async function generateNextQuestion(dialogHistory, missingInfo, userContext) {
  const settings = await getAISettings();
  if (!settings || !settings.enabled) {
    return 'Опишіть, будь ласка, проблему детальніше.';
  }

  const apiKey = settings.provider === 'gemini' ? settings.geminiApiKey : settings.openaiApiKey;
  if (!apiKey || !apiKey.trim()) {
    return 'Опишіть, будь ласка, проблему детальніше.';
  }

  const missingStr =
    Array.isArray(missingInfo) && missingInfo.length ? missingInfo.join(', ') : 'деталі проблеми';
  const systemPrompt = fillPrompt(NEXT_QUESTION, {
    userContext: formatUserContext(userContext),
    missingInfo: missingStr,
  });

  const userMessage = `Історія діалогу:\n${formatDialogHistory(dialogHistory)}\n\nЧого бракує: ${missingStr}. Згенеруй одне коротке питання українською.`;

  // Виклик AI з retry механізмом
  const response = await retryHelper.retryAIRequest(
    () => callChatCompletion(settings, systemPrompt, userMessage, MAX_TOKENS.NEXT_QUESTION, false),
    'generateNextQuestion'
  );

  if (!response || typeof response !== 'string') {
    return 'Що саме не працює? Опишіть детальніше.';
  }

  const trimmedResponse = response.trim().slice(0, 300);

  // Валідація питання
  const validation = aiResponseValidator.validate(trimmedResponse, 'nextQuestion');
  if (!validation.valid) {
    metricsCollector.recordValidationFailure('nextQuestion', validation.reason);
    logger.warn('AI nextQuestion validation failed', {
      reason: validation.reason,
      original: trimmedResponse,
    });
    return aiResponseValidator.getFallbackQuestion();
  }

  return trimmedResponse;
}

/**
 * Виклик 3: підсумок тікета (title, description, category, priority).
 * @returns {Promise<{ title: string, description: string, category: string, priority: string }|null>}
 */
async function getTicketSummary(dialogHistory, userContext, priorityHint = '', categoryHint = '') {
  const settings = await getAISettings();
  if (!settings || !settings.enabled) {
    return null;
  }

  const apiKey = settings.provider === 'gemini' ? settings.geminiApiKey : settings.openaiApiKey;
  if (!apiKey || !apiKey.trim()) {
    return null;
  }

  const lastUserMsg =
    dialogHistory.length > 0 && dialogHistory[dialogHistory.length - 1]?.role === 'user'
      ? String(dialogHistory[dialogHistory.length - 1].content || '').trim()
      : '';
  const similarTicketsSummary = await getSimilarResolvedTickets(3, lastUserMsg);
  const relevanceSummary = await checkSimilarTicketsRelevance(
    settings,
    lastUserMsg,
    similarTicketsSummary
  );
  const similarTicketsForSummary = relevanceSummary.relevant
    ? similarTicketsSummary
    : EMPTY_TICKETS_PLACEHOLDER;
  const serverHealthContext = await getServerHealthContext();
  const systemPrompt = fillPrompt(TICKET_SUMMARY, {
    userContext: formatUserContext(userContext),
    dialogHistory: formatDialogHistory(dialogHistory),
    priority: priorityHint || 'medium',
    category: categoryHint || 'Other',
    similarTickets: similarTicketsForSummary,
    recognized_access_info: userContext?.computerAccessAnalysis ?? '',
    serverHealthContext: serverHealthContext || '',
  });

  const userMessage = `Діалог:\n${formatDialogHistory(dialogHistory)}\n\nСформуй готовий тікет (JSON: title, description, category, priority, environment_clues).`;

  // Виклик AI з retry механізмом
  const response = await retryHelper.retryAIRequest(
    () => callChatCompletion(settings, systemPrompt, userMessage, MAX_TOKENS.TICKET_SUMMARY, true),
    'getTicketSummary'
  );

  if (!response) {
    return null;
  }

  const parsed = parseJsonFromResponse(response);
  if (!parsed || typeof parsed !== 'object') {
    logger.error('AI: не вдалося розпарсити результат getTicketSummary');
    return null;
  }

  // Валідація підсумку тікета
  const validation = aiResponseValidator.validate(parsed, 'ticketSummary');
  if (!validation.valid) {
    metricsCollector.recordValidationFailure('ticketSummary', validation.reason);
    logger.warn('AI ticketSummary validation failed', {
      reason: validation.reason,
      parsed,
    });
    // Використовуємо fallback
    const lastUserMessage =
      dialogHistory.filter(m => m.role === 'user').pop()?.content || 'Проблема';
    return aiResponseValidator.getFallbackTicketSummary(lastUserMessage);
  }

  const priority = ['low', 'medium', 'high', 'urgent'].includes(parsed.priority)
    ? parsed.priority
    : 'medium';
  let description = String(parsed.description || '');
  if (parsed.environment_clues && typeof parsed.environment_clues === 'object') {
    description += `\n\n---\n🔧 [Metadata для адміна] environment_clues: ${JSON.stringify(parsed.environment_clues)}`;
  }
  return {
    title: String(parsed.title || 'Проблема').slice(0, 200),
    description,
    category: String(parsed.category || 'Інше').slice(0, 100),
    priority,
    environment_clues: parsed.environment_clues || null,
  };
}

/**
 * Загальний виклик chat completion (OpenAI або Gemini).
 * @param {Object} settings - AISettings з БД
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {number} maxTokens
 * @param {boolean} jsonMode - чи очікувати JSON (response_format)
 * @param {number} [temperature=0.3] - температура (0.4–0.7 для живіших відповідей оффтопу)
 * @returns {Promise<string|null>}
 */
async function callChatCompletion(
  settings,
  systemPrompt,
  userMessage,
  maxTokens,
  jsonMode,
  temperature = 0.3
) {
  const temp = typeof temperature === 'number' ? Math.max(0, Math.min(2, temperature)) : 0.3;
  try {
    if (settings.provider === 'gemini') {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
      const model = genAI.getGenerativeModel({
        model: settings.geminiModel || 'gemini-1.5-flash',
      });
      const chat = model.startChat({
        history: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      });
      const result = await chat.sendMessage(userMessage);
      const output = result.response.text();
      return output ? output.trim() : null;
    }

    const OpenAI = require('openai').default;
    const openai = new OpenAI({ apiKey: settings.openaiApiKey });
    const opts = {
      model: settings.openaiModel || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            userMessage +
            (jsonMode
              ? "\n\nВідповідь має бути лише одним валідним JSON-об'єктом (без тексту до або після)."
              : ''),
        },
      ],
      max_tokens: maxTokens || 350,
      temperature: temp,
    };
    if (jsonMode) {
      opts.response_format = { type: 'json_object' };
    }
    const openaiCompletion = await openai.chat.completions.create(opts);
    const u = openaiCompletion?.usage;
    if (u && typeof u.prompt_tokens === 'number') {
      const pt = u.prompt_tokens;
      const ct = u.completion_tokens || 0;
      const tt = u.total_tokens || pt + ct;
      tokenUsage.promptTokens += pt;
      tokenUsage.completionTokens += ct;
      tokenUsage.totalTokens += tt;
      tokenUsage.requestCount += 1;
      addMonthlyUsage(pt, ct, tt);
    }
    const openaiContent = openaiCompletion?.choices?.[0]?.message?.content;
    return openaiContent ? String(openaiContent).trim() : null;
  } catch (err) {
    metricsCollector.recordAIError(err, `callChatCompletion - provider: ${settings?.provider}`);
    logger.error('AI: помилка виклику провайдера', {
      provider: settings?.provider,
      message: err.message,
    });
    return null;
  }
}

/**
 * Парсить JSON з відповіді LLM (може повертати ```json ... ``` або текст з JSON всередині).
 * @param {string} response - сирий текст відповіді
 * @returns {Object|null} - розпарсений об'єкт або null
 */
function parseJsonFromResponse(response) {
  if (response === null || typeof response !== 'string') {
    return null;
  }
  const raw = String(response).trim();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (_) {
    // Продовжуємо парсинг, якщо це не чистий JSON
  }
  const withoutMarkdown = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(withoutMarkdown);
  } catch (_) {
    // Продовжуємо пошук JSON усередині тексту
  }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(raw.slice(first, last + 1));
    } catch (_) {
      // Продовжуємо пошук, якщо зріз не є валідним JSON
    }
  }
  // Спроба знайти JSON-об'єкт серед тексту
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (_) {
      // Продовжуємо пошук
    }
  }
  // Обрізана відповідь (немає закриваючої }): пробуємо дописати недостатнє
  if (raw.startsWith('{') && !raw.trim().endsWith('}')) {
    const closed = tryCloseTruncatedJson(raw);
    if (closed) {
      try {
        return JSON.parse(closed);
      } catch (_) {
        // Остання спроба парсингу не вдалася
      }
    }
  }
  return null;
}

/**
 * Спроба дописати закриваючі дужки/лапки до обрізаного JSON (наприклад через max_tokens).
 */
function tryCloseTruncatedJson(raw) {
  const s = raw.trim();
  if (!s.startsWith('{')) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (!inString) {
      if (c === '{') {
        depth++;
      } else if (c === '}') {
        depth--;
      } else if (c === '"') {
        inString = true;
      }
    } else if (c === '"') {
      inString = false;
    }
  }
  if (depth <= 0) {
    return null;
  }
  let suffix = inString ? '"' : '';
  if (!s.includes('offTopicResponse')) {
    suffix += (s.trimEnd().endsWith(',') ? '' : ', ') + '"offTopicResponse": null';
  }
  suffix += '}'.repeat(depth);
  return s + suffix;
}

function invalidateCache() {
  cachedSettings = null;
  cachedAt = 0;
}

/** Повертає поточне використання токенів OpenAI (сесія + місяць). */
function getTokenUsage() {
  const monthly = readMonthlyUsage();
  return {
    ...tokenUsage,
    monthlyPromptTokens: monthly.promptTokens,
    monthlyCompletionTokens: monthly.completionTokens,
    monthlyTotalTokens: monthly.totalTokens,
    monthlyMonth: monthly.month,
  };
}

/** Скидає лічильник токенів (опційно). */
function resetTokenUsage() {
  tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 };
}

/**
 * Транскрибує голосовий файл (OGG/MP3 тощо) в текст через OpenAI Whisper.
 * @param {string} filePath - шлях до файлу на диску
 * @returns {Promise<string|null>} - розпізнаний текст або null при помилці
 */
async function transcribeVoiceToText(filePath) {
  const settings = await getAISettings();
  if (!settings || !settings.openaiApiKey || !String(settings.openaiApiKey).trim()) {
    logger.warn('AI: немає OpenAI API ключа для Whisper');
    return null;
  }
  try {
    const OpenAI = require('openai').default;
    const openai = new OpenAI({ apiKey: settings.openaiApiKey.trim() });
    const stream = fs.createReadStream(filePath);
    const transcription = await openai.audio.transcriptions.create({
      file: stream,
      model: 'whisper-1',
      language: 'uk',
    });
    const text =
      transcription && typeof transcription.text === 'string' ? transcription.text.trim() : null;
    return text || null;
  } catch (err) {
    logger.error('AI: помилка Whisper транскрипції', { message: err.message, filePath });
    return null;
  }
}

/**
 * Аналіз фото (скріншот помилки, роутер тощо) для інструкції з вирішення; якщо не допоможе — запросити створити тікет.
 * Працює тільки з OpenAI (моделі з підтримкою vision). Якщо провайдер Gemini — повертає null.
 * @param {string} imagePath - шлях до файлу зображення на диску
 * @param {string} problemDescription - опис проблеми від користувача (з діалогу або підпис)
 * @param {Object} userContext - контекст користувача (місто, заклад тощо)
 * @returns {Promise<string|null>} - текст відповіді (інструкція + "якщо не допоможе — створю тікет") або null
 */
async function analyzePhoto(imagePath, problemDescription, userContext) {
  const settings = await getAISettings();
  if (!settings || !settings.enabled || settings.provider !== 'openai') {
    return null;
  }
  if (!settings.openaiApiKey || !String(settings.openaiApiKey).trim()) {
    logger.warn('AI: немає OpenAI API ключа для аналізу фото');
    return null;
  }
  if (!imagePath || !fs.existsSync(imagePath)) {
    return null;
  }
  let base64;
  let mimeType = 'image/jpeg';
  try {
    const ext = path.extname(imagePath).toLowerCase();
    if (ext === '.png') {
      mimeType = 'image/png';
    } else if (ext === '.gif') {
      mimeType = 'image/gif';
    } else if (ext === '.webp') {
      mimeType = 'image/webp';
    }
    base64 = fs.readFileSync(imagePath, { encoding: 'base64' });
  } catch (err) {
    logger.error('AI: не вдалося прочитати фото для аналізу', { imagePath, message: err.message });
    return null;
  }
  const imageUrl = `data:${mimeType};base64,${base64}`;
  const systemPrompt = fillPrompt(PHOTO_ANALYSIS, {
    problemDescription: problemDescription || 'Користувач не описав проблему.',
    userContext: formatUserContext(userContext),
  });
  try {
    const OpenAI = require('openai').default;
    const openai = new OpenAI({ apiKey: settings.openaiApiKey.trim() });
    const response = await openai.chat.completions.create({
      model:
        settings.openaiModel && settings.openaiModel.includes('gpt-4')
          ? settings.openaiModel
          : 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Проаналізуй ТІЛЬКИ те, що видно на цьому фото. Одне фото = одна помилка. НЕ додавай BAF, Windows Update чи інші проблеми, якщо їх немає на зображенні. Ось фото:',
            },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: MAX_TOKENS.PHOTO_ANALYSIS || 400,
      temperature: 0.4,
    });
    const u = response?.usage;
    if (u && typeof u.prompt_tokens === 'number') {
      tokenUsage.promptTokens += u.prompt_tokens;
      tokenUsage.completionTokens += u.completion_tokens || 0;
      tokenUsage.totalTokens += u.total_tokens || u.prompt_tokens + (u.completion_tokens || 0);
      tokenUsage.requestCount += 1;
      addMonthlyUsage(
        u.prompt_tokens,
        u.completion_tokens || 0,
        u.total_tokens || u.prompt_tokens + (u.completion_tokens || 0)
      );
    }
    const text = response?.choices?.[0]?.message?.content;
    if (!text) {
      return null;
    }

    const fullText = String(text).trim();

    // Parse structured metadata if present
    const metadataSeparator = '---METADATA---';
    const metadataIndex = fullText.indexOf(metadataSeparator);

    if (metadataIndex !== -1) {
      const userMessage = fullText.substring(0, metadataIndex).trim();
      const metadataStr = fullText.substring(metadataIndex + metadataSeparator.length).trim();

      let metadata = null;
      try {
        metadata = JSON.parse(metadataStr);
        logger.info('AI: Photo analysis metadata parsed', {
          errorType: metadata.errorType,
          softwareDetected: metadata.softwareDetected,
          hardwareDetected: metadata.hardwareDetected,
          actionRequired: metadata.actionRequired,
          severity: metadata.severity,
        });
      } catch (_parseErr) {
        logger.warn('AI: Failed to parse photo metadata, returning text only');
      }

      return {
        text: userMessage,
        metadata: metadata || null,
      };
    }

    return { text: fullText, metadata: null };
  } catch (err) {
    logger.error('AI: помилка аналізу фото (vision)', { message: err.message });
    return null;
  }
}

/**
 * Аналіз фото доступу до ПК: розпізнає AnyDesk, TeamViewer та інші програми віддаленого доступу та їх ID.
 * Працює тільки з OpenAI (vision). Результат зберігається в профілі (computerAccessAnalysis).
 * @param {string} imagePath - шлях до збереженого фото
 * @returns {Promise<string|null>} - один рядок типу "AnyDesk: 123 456 789; TeamViewer: 987 654 321" або null
 */
async function analyzeComputerAccessPhoto(imagePath) {
  const settings = await getAISettings();
  if (!settings || !settings.enabled || settings.provider !== 'openai') {
    return null;
  }
  if (!settings.openaiApiKey || !String(settings.openaiApiKey).trim()) {
    return null;
  }
  if (!imagePath || !fs.existsSync(imagePath)) {
    return null;
  }
  let base64;
  let mimeType = 'image/jpeg';
  try {
    const ext = path.extname(imagePath).toLowerCase();
    if (ext === '.png') {
      mimeType = 'image/png';
    } else if (ext === '.gif') {
      mimeType = 'image/gif';
    } else if (ext === '.webp') {
      mimeType = 'image/webp';
    }
    base64 = fs.readFileSync(imagePath, { encoding: 'base64' });
  } catch (err) {
    logger.error('AI: не вдалося прочитати фото доступу', { imagePath, message: err.message });
    return null;
  }
  const imageUrl = `data:${mimeType};base64,${base64}`;
  try {
    const OpenAI = require('openai').default;
    const openai = new OpenAI({ apiKey: settings.openaiApiKey.trim() });
    const response = await openai.chat.completions.create({
      model:
        settings.openaiModel && settings.openaiModel.includes('gpt-4')
          ? settings.openaiModel
          : 'gpt-4o-mini',
      messages: [
        { role: 'system', content: COMPUTER_ACCESS_ANALYSIS },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: "Проаналізуй це фото доступу до комп'ютера. Визнач програму та ID якщо видно.",
            },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: MAX_TOKENS.COMPUTER_ACCESS_ANALYSIS || 150,
      temperature: 0.2,
    });
    const u = response?.usage;
    if (u && typeof u.prompt_tokens === 'number') {
      tokenUsage.promptTokens += u.prompt_tokens;
      tokenUsage.completionTokens += u.completion_tokens || 0;
      tokenUsage.totalTokens += u.total_tokens || u.prompt_tokens + (u.completion_tokens || 0);
      tokenUsage.requestCount += 1;
      addMonthlyUsage(
        u.prompt_tokens,
        u.completion_tokens || 0,
        u.total_tokens || u.prompt_tokens + (u.completion_tokens || 0)
      );
    }
    const text = response?.choices?.[0]?.message?.content;
    return text ? String(text).trim() : null;
  } catch (err) {
    logger.error('AI: помилка аналізу фото доступу (vision)', { message: err.message });
    return null;
  }
}

/**
 * Виклик 4: генерація природної перехідної фрази (filler/transition).
 * @param {Array} dialogHistory
 * @param {string} transitionType - тип переходу: 'accept_thanks', 'start_gathering_info', 'confirm_photo_saved', 'ask_for_details_fallback', 'request_details', 'session_closed'
 * @param {Object} userContext
 * @returns {Promise<string>}
 */
async function generateConversationalResponse(
  dialogHistory,
  transitionType = 'request_details',
  userContext,
  emotionalTone = 'neutral',
  extraOptions = {}
) {
  const settings = await getAISettings();
  if (!settings || !settings.enabled) {
    return 'Гаразд, зрозумів.';
  }

  const apiKey = settings.provider === 'gemini' ? settings.geminiApiKey : settings.openaiApiKey;
  if (!apiKey || !apiKey.trim()) {
    return 'Гаразд, зрозумів.';
  }

  let queueVars = { queueContext: '(немає)', queueCount: '2-4', queueMinutes: '40' };
  if (transitionType === 'session_closed' && extraOptions.priority === 'medium') {
    const q = await getQueueContext();
    queueVars = {
      queueContext: `Перед користувачем в черзі ${q.count} заявок, орієнтовний час — ${q.minutes} хв`,
      queueCount: String(q.count),
      queueMinutes: String(q.minutes),
    };
  }

  const { CONVERSATIONAL_TRANSITION, TEMPERATURES } = require('../prompts/aiFirstLinePrompts');
  const systemPrompt = fillPrompt(CONVERSATIONAL_TRANSITION, {
    userContext: formatUserContext(userContext),
    dialogHistory: formatDialogHistory(dialogHistory),
    transitionType,
    emotionalTone,
    ...queueVars,
  });

  const userMessage = `Згенеруй фразу для типу: ${transitionType}`;

  // Виклик AI з retry механізмом
  const response = await retryHelper.retryAIRequest(
    () =>
      callChatCompletion(
        settings,
        systemPrompt,
        userMessage,
        MAX_TOKENS.CONVERSATIONAL_TRANSITION,
        false,
        TEMPERATURES.CONVERSATIONAL_TRANSITION
      ),
    'generateConversationalResponse'
  );

  if (!response || typeof response !== 'string') {
    // Fallbacks
    switch (transitionType) {
      case 'accept_thanks':
        return 'Завжди радий допомогти! 😊';
      case 'start_gathering_info':
        return 'Добре, тоді давайте зберемо деталі для заявки.';
      case 'confirm_photo_saved':
        return 'Дякую, фото отримав. Рухаємось далі.';
      case 'request_details':
        return 'Опишіть, будь ласка, проблему детальніше.';
      case 'session_closed':
        return 'Добре, якщо щось — звертайтесь!';
      default:
        return 'Зрозумів, продовжуємо.';
    }
  }

  return response.trim().slice(0, 300);
}

/**
 * Генерація емоційної відповіді на оцінку якості тікета (1-5).
 * Кожен раз різна фраза.
 * @param {number} rating - оцінка 1-5
 * @returns {Promise<string>}
 */
async function generateRatingEmotionResponse(rating) {
  const settings = await getAISettings();
  if (!settings || !settings.enabled) {
    const fallbacks = {
      5: 'Дякуємо за оцінку! Радий, що допоміг! 😊',
      4: 'Дякуємо! Гарного дня!',
      3: 'Дякуємо за зворотний звʼязок.',
      2: 'Вибачте за незручності. Покращимо роботу.',
      1: 'Вибачте. Дякуємо за чесність. 🙏',
    };
    return fallbacks[rating] || fallbacks[5];
  }

  const apiKey = settings.provider === 'gemini' ? settings.geminiApiKey : settings.openaiApiKey;
  if (!apiKey || !apiKey.trim()) {
    return 'Дякуємо за оцінку!';
  }

  const systemPrompt = fillPrompt(RATING_EMOTION, {
    rating: String(Math.max(1, Math.min(5, rating))),
  });
  const userMessage = `Згенеруй унікальну емоційну відповідь для оцінки ${rating}.`;

  const response = await retryHelper.retryAIRequest(
    () =>
      callChatCompletion(
        settings,
        systemPrompt,
        userMessage,
        MAX_TOKENS.RATING_EMOTION || 80,
        false,
        TEMPERATURES.RATING_EMOTION || 0.9
      ),
    'generateRatingEmotionResponse'
  );

  if (!response || typeof response !== 'string') {
    const fallbacks = {
      5: 'Дякуємо! Радий допомогти! 😊',
      4: 'Дякуємо!',
      3: 'Дякуємо.',
      2: 'Вибачте.',
      1: 'Вибачте за незручності. 🙏',
    };
    return fallbacks[rating] || 'Дякуємо за оцінку!';
  }

  return response.trim().slice(0, 200);
}

/**
 * Генерація аналізу статистики.
 * @param {Object} statsData - дані статистики для аналізу
 * @param {string} dateRange - діапазон дат у форматі рядка
 * @returns {Promise<string|null>} - текст аналізу
 */
async function generateStatisticsAnalysis(statsData, dateRange = 'не вказано') {
  const settings = await getAISettings();
  if (!settings || !settings.enabled) {
    return null;
  }

  const systemPrompt = fillPrompt(STATISTICS_ANALYSIS, {
    statsData: JSON.stringify(statsData, null, 2),
    dateRange,
  });

  const userMessage = `Проаналізуй ці дані та дай професійний висновок українською мовою.`;
  const temperature = TEMPERATURES?.STATISTICS_ANALYSIS || 0.3;

  const response = await retryHelper.retryAIRequest(
    () =>
      callChatCompletion(
        settings,
        systemPrompt,
        userMessage,
        MAX_TOKENS.STATISTICS_ANALYSIS || 1500,
        false,
        temperature
      ),
    'generateStatisticsAnalysis'
  );

  if (!response) {
    return null;
  }

  try {
    // Очищуємо відповідь від можливих markdown-тегів ```json ... ```
    const cleanResponse = String(response)
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleanResponse);
  } catch (error) {
    logger.error('Помилка парсингу JSON в generateStatisticsAnalysis:', error);
    // Якщо не вдалося спарсити як JSON, повертаємо як текст у полі summary
    return {
      summary: String(response).trim(),
      keyInsights: [],
      trends: { positive: [], negative: [], neutral: [] },
      recommendations: [],
      metrics: { performance: '', efficiency: '', quality: '' },
    };
  }
}

/**
 * Згенерувати зміст, категорію та теги для статті KB за заголовком (з використанням контексту з інтернету).
 * @param {string} title - заголовок статті
 * @param {string} [webSnippet] - опційний фрагмент з пошуку в інтернеті
 * @returns {Promise<{ content: string, category: string, tags: string }|null>}
 */
async function generateKbArticleFromTitle(title, webSnippet = '') {
  const settings = await getAISettings();
  if (!settings || !settings.enabled) {
    return null;
  }
  const apiKey = settings.provider === 'openai' ? settings.openaiApiKey : settings.geminiApiKey;
  if (!apiKey || !String(apiKey).trim()) {
    return null;
  }
  const systemPrompt =
    `Ти допомагаєш заповнити статтю бази знань. За заголовком статті (та опційно контекстом з інтернету) згенеруй:
- content: короткий текст статті/інструкції українською (2-6 абзаців), корисний для користувача. Якщо є контекст з інтернету — використай його, але перефразуй і структуруй.
- category: одна категорія (одне слово або коротка фраза, українською), наприклад "Друк", "Паролі", "Доступ".
- tags: кілька тегів через кому (українською), наприклад "друк, принтер, документ".

Поверни лише один валідний JSON-об'єкт без додаткового тексту, у форматі:
{"content": "...", "category": "...", "tags": "тег1, тег2, тег3"}`.trim();

  const userParts = [`Заголовок статті: ${title}`];
  if (webSnippet && String(webSnippet).trim()) {
    userParts.push(
      `Контекст з інтернету (можна використати для наповнення):\n${String(webSnippet).trim().slice(0, 1500)}`
    );
  }
  const userMessage = userParts.join('\n\n');

  const response = await callChatCompletion(
    settings,
    systemPrompt,
    userMessage,
    MAX_TOKENS.KB_ARTICLE_GENERATION || 1000,
    true,
    0.5
  );
  if (!response) {
    return null;
  }
  const parsed = parseJsonFromResponse(response);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const content = typeof parsed.content === 'string' ? parsed.content.trim() : '';
  const category = typeof parsed.category === 'string' ? parsed.category.trim() : '';
  const tags =
    typeof parsed.tags === 'string'
      ? parsed.tags.trim()
      : Array.isArray(parsed.tags)
        ? parsed.tags
            .map(t => String(t).trim())
            .filter(Boolean)
            .join(', ')
        : '';
  return { content, category, tags };
}

/**
 * AI аналіз Zabbix алерту — Triage + Enrichment.
 * Визначає чи створювати тікет, збагачує опис, дає рекомендації.
 * @param {Object} alert - ZabbixAlert object (or plain object with alert data)
 * @param {Object} [options] - { recentAlerts: [] }
 * @returns {Promise<Object|null>} - AI analysis result or null if AI disabled
 */
async function analyzeZabbixAlert(alert, options = {}) {
  const settings = await getAISettings();
  if (!settings || !settings.enabled) {
    logger.info('AI: Zabbix alert analysis skipped — AI disabled');
    return null;
  }

  const apiKey = settings.provider === 'gemini' ? settings.geminiApiKey : settings.openaiApiKey;
  if (!apiKey || !apiKey.trim()) {
    logger.warn('AI: Zabbix alert analysis skipped — no API key');
    return null;
  }

  const severityLabels = {
    0: 'Not classified',
    1: 'Information',
    2: 'Warning',
    3: 'High',
    4: 'Disaster',
  };

  const recentAlerts = options.recentAlerts || [];
  let recentAlertsContext = '(немає)';
  if (recentAlerts.length > 0) {
    recentAlertsContext = recentAlerts
      .map(
        a =>
          `- Alert #${a.alertId}: trigger="${a.triggerName}", severity=${a.severity}, status=${a.status}, resolved=${a.resolved}, time=${a.eventTime}`
      )
      .join('\n');
  }

  const eventTime = alert.eventTime
    ? new Date(alert.eventTime).toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' })
    : new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' });

  const systemPrompt = fillPrompt(ZABBIX_ALERT_ANALYSIS, {
    alertHost: alert.host || 'Unknown',
    alertTrigger: alert.triggerName || 'Unknown Trigger',
    alertSeverity: String(alert.severity ?? 0),
    alertSeverityLabel: severityLabels[alert.severity] || 'Unknown',
    alertStatus: alert.status || 'PROBLEM',
    alertMessage: alert.message || '',
    alertTriggerDescription: alert.triggerDescription || '',
    alertEventTime: eventTime,
    recentAlertsContext,
  });

  const userMessage = `Проаналізуй цей Zabbix алерт і дай відповідь у JSON.`;

  try {
    const response = await retryHelper.retryAIRequest(
      () =>
        callChatCompletion(
          settings,
          systemPrompt,
          userMessage,
          MAX_TOKENS.ZABBIX_ALERT_ANALYSIS,
          true,
          TEMPERATURES.ZABBIX_ALERT_ANALYSIS
        ),
      'analyzeZabbixAlert'
    );

    if (!response) {
      logger.warn('AI: analyzeZabbixAlert — empty response');
      return null;
    }

    const parsed = parseJsonFromResponse(String(response).trim());
    if (!parsed || typeof parsed !== 'object') {
      logger.error('AI: analyzeZabbixAlert — failed to parse JSON', {
        response: String(response).substring(0, 500),
      });
      return null;
    }

    return {
      isCritical: !!parsed.isCritical,
      isDuplicate: !!parsed.isDuplicate,
      duplicateAlertId: parsed.duplicateAlertId || null,
      isRecurring: !!parsed.isRecurring,
      rootCause: parsed.rootCause || null,
      relatedAlertIds: Array.isArray(parsed.relatedAlertIds) ? parsed.relatedAlertIds : [],
      impactAssessment: ['critical', 'high', 'medium', 'low'].includes(parsed.impactAssessment)
        ? parsed.impactAssessment
        : 'medium',
      descriptionUk: String(parsed.descriptionUk || ''),
      possibleCauses: Array.isArray(parsed.possibleCauses) ? parsed.possibleCauses : [],
      recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [],
      telegramSummary: String(parsed.telegramSummary || ''),
    };
  } catch (err) {
    logger.error('AI: analyzeZabbixAlert error', { message: err.message });
    return null;
  }
}

// ============================================================
// TICKET_UPDATE_NOTIFICATION
// ============================================================
async function generateTicketUpdateNotification(ticketData, statusChange) {
  try {
    const settings = await getAISettings();
    if (!settings?.enabled) {
      return null;
    }

    const systemPrompt = fillPrompt(TICKET_UPDATE_NOTIFICATION, {
      ticketTitle: ticketData.title || '',
      previousStatus: statusChange.from || '',
      newStatus: statusChange.to || '',
      adminComment: statusChange.comment || '(без коментаря)',
      ticketPriority: ticketData.priority || '',
      ticketCategory: ticketData.category || '',
      adminName: statusChange.adminName || 'Адміністратор',
      userName: ticketData.userName || 'Користувач',
      ticketCreatedAt: ticketData.createdAt
        ? new Date(ticketData.createdAt).toLocaleString('uk-UA')
        : '',
    });

    const response = await retryHelper.retryAIRequest(
      () =>
        callChatCompletion(
          settings,
          systemPrompt,
          `Згенеруй повідомлення для користувача про зміну статусу з "${statusChange.from}" на "${statusChange.to}"`,
          MAX_TOKENS.TICKET_UPDATE_NOTIFICATION,
          false,
          TEMPERATURES.TICKET_UPDATE_NOTIFICATION
        ),
      'generateTicketUpdateNotification'
    );

    if (!response || typeof response !== 'string') {
      return null;
    }

    return response.trim();
  } catch (err) {
    logger.error('AI: generateTicketUpdateNotification error', { message: err.message });
    return null;
  }
}

// ============================================================
// CONVERSATION_SUMMARY
// ============================================================
async function generateConversationSummary(dialogHistory, userContext, ticketInfo = {}) {
  try {
    const settings = await getAISettings();
    if (!settings?.enabled) {
      return null;
    }

    const systemPrompt = fillPrompt(CONVERSATION_SUMMARY, {
      dialogHistory: formatDialogHistory(dialogHistory),
      userContext: formatUserContext(userContext),
      category: ticketInfo.category || 'Не визначено',
      priority: ticketInfo.priority || 'medium',
    });

    const response = await retryHelper.retryAIRequest(
      () =>
        callChatCompletion(
          settings,
          systemPrompt,
          'Підсумуй цю розмову для адміністратора',
          MAX_TOKENS.CONVERSATION_SUMMARY,
          true,
          TEMPERATURES.CONVERSATION_SUMMARY
        ),
      'generateConversationSummary'
    );

    if (!response) {
      return null;
    }

    const parsed = parseJsonFromResponse(response);
    if (!parsed) {
      logger.warn('AI: Failed to parse conversation summary JSON');
      return null;
    }

    return {
      problemStatement: String(parsed.problemStatement || ''),
      keyDetails: Array.isArray(parsed.keyDetails) ? parsed.keyDetails : [],
      userTriedSteps: Array.isArray(parsed.userTriedSteps) ? parsed.userTriedSteps : [],
      remoteAccessInfo: parsed.remoteAccessInfo || null,
      userMood: ['calm', 'frustrated', 'angry', 'confused', 'urgent'].includes(parsed.userMood)
        ? parsed.userMood
        : 'calm',
      recommendedAction: String(parsed.recommendedAction || ''),
      adminNotes: String(parsed.adminNotes || ''),
    };
  } catch (err) {
    logger.error('AI: generateConversationSummary error', { message: err.message });
    return null;
  }
}

// ============================================================
// AUTO_RESOLUTION_CHECK
// ============================================================
async function checkAutoResolution(recentMessages, ticketInfo = {}) {
  try {
    const settings = await getAISettings();
    if (!settings?.enabled) {
      return null;
    }

    const messagesText = recentMessages
      .map(m => `${m.role === 'user' ? 'Юзер' : 'Бот'}: ${m.content}`)
      .join('\n');

    const systemPrompt = fillPrompt(AUTO_RESOLUTION_CHECK, {
      recentMessages: messagesText,
      category: ticketInfo.category || '',
      hadQuickSolution: ticketInfo.hadQuickSolution ? 'true' : 'false',
    });

    const response = await retryHelper.retryAIRequest(
      () =>
        callChatCompletion(
          settings,
          systemPrompt,
          'Визнач, чи вирішена проблема',
          MAX_TOKENS.AUTO_RESOLUTION_CHECK,
          true,
          TEMPERATURES.AUTO_RESOLUTION_CHECK
        ),
      'checkAutoResolution'
    );

    if (!response) {
      return null;
    }

    const parsed = parseJsonFromResponse(response);
    if (!parsed) {
      return null;
    }

    return {
      status: ['RESOLVED', 'NOT_RESOLVED', 'UNCLEAR'].includes(parsed.status)
        ? parsed.status
        : 'UNCLEAR',
      confidence: Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0)),
      reason: String(parsed.reason || ''),
      userSentiment: ['positive', 'neutral', 'negative'].includes(parsed.userSentiment)
        ? parsed.userSentiment
        : 'neutral',
    };
  } catch (err) {
    logger.error('AI: checkAutoResolution error', { message: err.message });
    return null;
  }
}

// ============================================================
// SLA_BREACH_DETECTION
// ============================================================
async function detectSlaBreaches(tickets) {
  try {
    const settings = await getAISettings();
    if (!settings?.enabled) {
      return null;
    }

    const ticketQueue = tickets
      .map(
        t =>
          `[${t._id}] "${t.title}" | Priority: ${t.priority} | Status: ${t.status} | Created: ${new Date(t.createdAt).toLocaleString('uk-UA')} | Category: ${t.category || 'N/A'}`
      )
      .join('\n');

    const systemPrompt = fillPrompt(SLA_BREACH_DETECTION, {
      ticketQueue,
      currentTime: new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }),
    });

    const response = await retryHelper.retryAIRequest(
      () =>
        callChatCompletion(
          settings,
          systemPrompt,
          'Проаналізуй чергу тікетів на порушення SLA',
          MAX_TOKENS.SLA_BREACH_DETECTION,
          true,
          TEMPERATURES.SLA_BREACH_DETECTION
        ),
      'detectSlaBreaches'
    );

    if (!response) {
      return null;
    }

    const parsed = parseJsonFromResponse(response);
    if (!parsed) {
      return null;
    }

    return {
      breached: Array.isArray(parsed.breached) ? parsed.breached : [],
      atRisk: Array.isArray(parsed.atRisk) ? parsed.atRisk : [],
      summary: String(parsed.summary || ''),
      recommendedOrder: Array.isArray(parsed.recommendedOrder) ? parsed.recommendedOrder : [],
      alertLevel: ['critical', 'warning', 'normal'].includes(parsed.alertLevel)
        ? parsed.alertLevel
        : 'normal',
    };
  } catch (err) {
    logger.error('AI: detectSlaBreaches error', { message: err.message });
    return null;
  }
}

// ============================================================
// PROACTIVE_ISSUE_DETECTION
// ============================================================
async function detectProactiveIssues(trendData, hostInfo) {
  try {
    const settings = await getAISettings();
    if (!settings?.enabled) {
      return null;
    }

    const systemPrompt = fillPrompt(PROACTIVE_ISSUE_DETECTION, {
      trendData: typeof trendData === 'string' ? trendData : JSON.stringify(trendData, null, 2),
      hostInfo: typeof hostInfo === 'string' ? hostInfo : JSON.stringify(hostInfo, null, 2),
    });

    const response = await retryHelper.retryAIRequest(
      () =>
        callChatCompletion(
          settings,
          systemPrompt,
          'Проаналізуй тренди та прогнозуй проблеми',
          MAX_TOKENS.PROACTIVE_ISSUE_DETECTION,
          true,
          TEMPERATURES.PROACTIVE_ISSUE_DETECTION
        ),
      'detectProactiveIssues'
    );

    if (!response) {
      return null;
    }

    const parsed = parseJsonFromResponse(response);
    if (!parsed) {
      return null;
    }

    return {
      predictions: Array.isArray(parsed.predictions) ? parsed.predictions : [],
      summary: String(parsed.summary || ''),
      hostsMostAtRisk: Array.isArray(parsed.hostsMostAtRisk) ? parsed.hostsMostAtRisk : [],
    };
  } catch (err) {
    logger.error('AI: detectProactiveIssues error', { message: err.message });
    return null;
  }
}

// ============================================================
// KB_ARTICLE_GENERATION (повна версія)
// ============================================================
async function generateKbArticleFromTicket(ticket, dialogHistory = []) {
  try {
    const settings = await getAISettings();
    if (!settings?.enabled) {
      return null;
    }

    const systemPrompt = fillPrompt(KB_ARTICLE_GENERATION, {
      ticketTitle: ticket.title || '',
      ticketCategory: ticket.category || '',
      ticketDescription: ticket.description || '',
      ticketResolution: ticket.resolution || ticket.adminNotes || '',
      dialogHistory: dialogHistory.length > 0 ? formatDialogHistory(dialogHistory) : '(немає)',
      webContext: '(немає)',
    });

    const response = await retryHelper.retryAIRequest(
      () =>
        callChatCompletion(
          settings,
          systemPrompt,
          'Створи статтю бази знань з цього вирішеного тікета',
          MAX_TOKENS.KB_ARTICLE_GENERATION,
          true,
          TEMPERATURES.KB_ARTICLE_GENERATION
        ),
      'generateKbArticleFromTicket'
    );

    if (!response) {
      return null;
    }

    const parsed = parseJsonFromResponse(response);
    if (!parsed) {
      return null;
    }

    return {
      title: String(parsed.title || ticket.title || ''),
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      content: String(parsed.content || ''),
      difficulty: ['easy', 'medium', 'advanced'].includes(parsed.difficulty)
        ? parsed.difficulty
        : 'medium',
      applicableTo: String(parsed.applicableTo || ''),
    };
  } catch (err) {
    logger.error('AI: generateKbArticleFromTicket error', { message: err.message });
    return null;
  }
}

module.exports = {
  getAISettings,
  analyzeIntent,
  generateNextQuestion,
  getTicketSummary,
  generateConversationalResponse,
  generateRatingEmotionResponse,
  analyzePhoto,
  analyzeComputerAccessPhoto,
  getSimilarResolvedTickets,
  formatUserContext,
  invalidateCache,
  getTokenUsage,
  resetTokenUsage,
  transcribeVoiceToText,
  generateStatisticsAnalysis,
  generateKbArticleFromTitle,
  analyzeZabbixAlert,
  // New functions
  generateTicketUpdateNotification,
  generateConversationSummary,
  checkAutoResolution,
  detectSlaBreaches,
  detectProactiveIssues,
  generateKbArticleFromTicket,
};
