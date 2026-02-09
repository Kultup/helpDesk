
const AISettings = require('../models/AISettings');
const { INTENT_ANALYSIS, NEXT_QUESTION, TICKET_SUMMARY, fillPrompt, MAX_TOKENS, INTENT_ANALYSIS_TEMPERATURE } = require('../prompts/aiFirstLinePrompts');
const logger = require('../utils/logger');

let cachedSettings = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 хв

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
  if (!Array.isArray(dialogHistory) || dialogHistory.length === 0) return '(порожньо)';
  return dialogHistory
    .map((m) => (m.role === 'user' ? `Користувач: ${m.content}` : `Бот: ${m.content}`))
    .join('\n');
}

function formatUserContext(userContext) {
  if (!userContext || typeof userContext !== 'object') return '(немає)';
  const parts = [];
  if (userContext.userCity) parts.push(`Місто: ${userContext.userCity}`);
  if (userContext.userPosition) parts.push(`Посада: ${userContext.userPosition}`);
  if (userContext.userInstitution) parts.push(`Заклад: ${userContext.userInstitution}`);
  if (userContext.userName) parts.push(`ПІБ: ${userContext.userName}`);
  return parts.length ? parts.join(', ') : '(немає)';
}

/**
 * Виклик 1: аналіз наміру та достатності інформації.
 * @returns {Promise<{ isTicketIntent: boolean, needsMoreInfo: boolean, category?: string, missingInfo: string[], confidence: number }>}
 */
async function analyzeIntent(dialogHistory, userContext) {
  const settings = await getAISettings();
  if (!settings || !settings.enabled) {
    return { isTicketIntent: false, needsMoreInfo: false, missingInfo: [], confidence: 0 };
  }

  const apiKey = settings.provider === 'groq' ? settings.groqApiKey : settings.openaiApiKey;
  if (!apiKey || !apiKey.trim()) {
    logger.warn('AI: відсутній API-ключ для провайдера', settings.provider);
    return { isTicketIntent: false, needsMoreInfo: false, missingInfo: [], confidence: 0 };
  }

  const systemPrompt = fillPrompt(INTENT_ANALYSIS, {
    userContext: formatUserContext(userContext),
    dialogHistory: formatDialogHistory(dialogHistory)
  });

  const userMessage = `Історія діалогу:\n${formatDialogHistory(dialogHistory)}`;

  const temperature = typeof INTENT_ANALYSIS_TEMPERATURE === 'number' ? INTENT_ANALYSIS_TEMPERATURE : 0.55;
  const response = await callChatCompletion(settings, systemPrompt, userMessage, MAX_TOKENS.INTENT_ANALYSIS, true, temperature);
  if (!response) return { isTicketIntent: false, needsMoreInfo: false, missingInfo: [], confidence: 0, offTopicResponse: null };

  const parsed = parseJsonFromResponse(response);
  if (!parsed || typeof parsed !== 'object') {
    logger.error('AI: не вдалося розпарсити результат analyzeIntent');
    return { isTicketIntent: true, needsMoreInfo: true, missingInfo: [], confidence: 0.5, offTopicResponse: null };
  }
  const offTopicResponse = parsed.offTopicResponse != null && String(parsed.offTopicResponse).trim() ? String(parsed.offTopicResponse).trim() : null;
  return {
    isTicketIntent: !!parsed.isTicketIntent,
    needsMoreInfo: !!parsed.needsMoreInfo,
    category: parsed.category || null,
    missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo : [],
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
    offTopicResponse
  };
}

/**
 * Виклик 2: генерація одного уточнюючого питання.
 * @returns {Promise<string>}
 */
async function generateNextQuestion(dialogHistory, missingInfo, userContext) {
  const settings = await getAISettings();
  if (!settings || !settings.enabled) return 'Опишіть, будь ласка, проблему детальніше.';

  const apiKey = settings.provider === 'groq' ? settings.groqApiKey : settings.openaiApiKey;
  if (!apiKey || !apiKey.trim()) return 'Опишіть, будь ласка, проблему детальніше.';

  const systemPrompt = fillPrompt(NEXT_QUESTION, {
    userContext: formatUserContext(userContext)
  });

  const missingStr = Array.isArray(missingInfo) && missingInfo.length ? missingInfo.join(', ') : 'деталі проблеми';
  const userMessage = `Історія діалогу:\n${formatDialogHistory(dialogHistory)}\n\nЧого бракує: ${missingStr}. Згенеруй одне коротке питання українською.`;

  const response = await callChatCompletion(settings, systemPrompt, userMessage, MAX_TOKENS.NEXT_QUESTION, false);
  if (!response || typeof response !== 'string') return 'Що саме не працює? Опишіть детальніше.';
  return response.trim().slice(0, 300);
}

/**
 * Виклик 3: підсумок тікета (title, description, category, priority).
 * @returns {Promise<{ title: string, description: string, category: string, priority: string }|null>}
 */
async function getTicketSummary(dialogHistory, userContext) {
  const settings = await getAISettings();
  if (!settings || !settings.enabled) return null;

  const apiKey = settings.provider === 'groq' ? settings.groqApiKey : settings.openaiApiKey;
  if (!apiKey || !apiKey.trim()) return null;

  const systemPrompt = fillPrompt(TICKET_SUMMARY, {
    userContext: formatUserContext(userContext)
  });

  const userMessage = `Діалог:\n${formatDialogHistory(dialogHistory)}\n\nСформуй готовий тікет (JSON: title, description, category, priority).`;

  const response = await callChatCompletion(settings, systemPrompt, userMessage, MAX_TOKENS.TICKET_SUMMARY, true);
  if (!response) return null;

  const parsed = parseJsonFromResponse(response);
  if (!parsed || typeof parsed !== 'object') {
    logger.error('AI: не вдалося розпарсити результат getTicketSummary');
    return null;
  }
  const priority = ['low', 'medium', 'high', 'urgent'].includes(parsed.priority) ? parsed.priority : 'medium';
  return {
    title: String(parsed.title || 'Проблема').slice(0, 200),
    description: String(parsed.description || ''),
    category: String(parsed.category || 'Інше').slice(0, 100),
    priority
  };
}

/**
 * Загальний виклик chat completion (Groq або OpenAI).
 * @param {Object} settings - AISettings з БД
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {number} maxTokens
 * @param {boolean} jsonMode - чи очікувати JSON (response_format)
 * @param {number} [temperature=0.3] - температура (0.4–0.7 для живіших відповідей оффтопу)
 * @returns {Promise<string|null>}
 */
async function callChatCompletion(settings, systemPrompt, userMessage, maxTokens, jsonMode, temperature = 0.3) {
  const temp = typeof temperature === 'number' ? Math.max(0, Math.min(2, temperature)) : 0.3;
  try {
    if (settings.provider === 'groq') {
      const Groq = require('groq-sdk');
      const groq = new Groq({ apiKey: settings.groqApiKey });
      const groqOpts = {
        model: settings.groqModel || 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: maxTokens || 350,
        temperature: temp
      };
      if (jsonMode) groqOpts.response_format = { type: 'json_object' };
      const completion = await groq.chat.completions.create(groqOpts);
      const content = completion?.choices?.[0]?.message?.content;
      return content ? String(content).trim() : null;
    }

    const OpenAI = require('openai').default;
    const openai = new OpenAI({ apiKey: settings.openaiApiKey });
    const opts = {
      model: settings.openaiModel || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: maxTokens || 350,
      temperature: temp
    };
    if (jsonMode) opts.response_format = { type: 'json_object' };
    const completion = await openai.chat.completions.create(opts);
    const content = completion?.choices?.[0]?.message?.content;
    return content ? String(content).trim() : null;
  } catch (err) {
    logger.error('AI: помилка виклику провайдера', { provider: settings?.provider, message: err.message });
    return null;
  }
}

/**
 * Парсить JSON з відповіді LLM (Groq може повертати ```json ... ``` або текст з JSON всередині).
 * @param {string} response - сирий текст відповіді
 * @returns {Object|null} - розпарсений об'єкт або null
 */
function parseJsonFromResponse(response) {
  if (response == null || typeof response !== 'string') return null;
  const raw = response.trim();
  try {
    return JSON.parse(raw);
  } catch (_) {}
  const withoutMarkdown = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    return JSON.parse(withoutMarkdown);
  } catch (_) {}
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(raw.slice(first, last + 1));
    } catch (_) {}
  }
  return null;
}

function invalidateCache() {
  cachedSettings = null;
  cachedAt = 0;
}

module.exports = {
  getAISettings,
  analyzeIntent,
  generateNextQuestion,
  getTicketSummary,
  formatUserContext,
  invalidateCache
};
