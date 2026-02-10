
const path = require('path');
const fs = require('fs');
const AISettings = require('../models/AISettings');
const Ticket = require('../models/Ticket');
const { INTENT_ANALYSIS, NEXT_QUESTION, TICKET_SUMMARY, PHOTO_ANALYSIS, COMPUTER_ACCESS_ANALYSIS, fillPrompt, MAX_TOKENS, INTENT_ANALYSIS_TEMPERATURE } = require('../prompts/aiFirstLinePrompts');
const logger = require('../utils/logger');
const aiResponseValidator = require('../utils/aiResponseValidator');
const { AIServiceError } = require('../utils/customErrors');
const metricsCollector = require('./metricsCollector');
const retryHelper = require('../utils/retryHelper');

let cachedSettings = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 хв

/** Накопичувач використання токенів OpenAI (з моменту перезапуску). */
let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 };

const TOKEN_USAGE_FILE = path.join(__dirname, '..', 'data', 'token_usage.json');

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function readMonthlyUsage() {
  try {
    const raw = fs.readFileSync(TOKEN_USAGE_FILE, 'utf8');
    const data = JSON.parse(raw);
    const month = getCurrentMonth();
    if (data.month === month) {
      return { month: data.month, promptTokens: data.promptTokens || 0, completionTokens: data.completionTokens || 0, totalTokens: data.totalTokens || 0 };
    }
  } catch (_) { }
  return { month: getCurrentMonth(), promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function addMonthlyUsage(promptTokens, completionTokens, totalTokens) {
  const month = getCurrentMonth();
  let data = readMonthlyUsage();
  if (data.month !== month) data = { month, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  data.promptTokens += promptTokens;
  data.completionTokens += completionTokens;
  data.totalTokens += totalTokens;
  try {
    const dir = path.dirname(TOKEN_USAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
  if (userContext.hasComputerAccessPhoto) parts.push('Фото доступу до ПК: збережено в профілі');
  if (userContext.computerAccessAnalysis) parts.push(`Розпізнано доступ: ${userContext.computerAccessAnalysis}`);
  return parts.length ? parts.join(', ') : '(немає)';
}

/** Подібні закриті тікети для навчання AI (контекст). */
async function getSimilarResolvedTickets(limit = 5) {
  try {
    const tickets = await Ticket.find({
      status: { $in: ['resolved', 'closed'] },
      isDeleted: { $ne: true },
      $or: [
        { resolutionSummary: { $exists: true, $ne: null, $ne: '' } },
        { aiDialogHistory: { $exists: true, $not: { $size: 0 } } }
      ]
    })
      .sort({ resolvedAt: -1, closedAt: -1, updatedAt: -1 })
      .limit(limit)
      .select('title description resolutionSummary subcategory')
      .lean();
    if (!tickets || tickets.length === 0) return '(немає)';
    return tickets.map(t => {
      const res = t.resolutionSummary || '(рішення не описано)';
      return `[${t.subcategory || '—'}] ${t.title}\nОпис: ${(t.description || '').slice(0, 150)}…\nРішення: ${res.slice(0, 300)}`;
    }).join('\n\n---\n\n');
  } catch (err) {
    logger.error('AI: getSimilarResolvedTickets', err);
    return '(немає)';
  }
}

/**
 * Виклик 1: аналіз наміру та достатності інформації.
 * @param {Array} dialogHistory
 * @param {Object} userContext
 * @param {string} [webSearchContext] - опційний фрагмент з пошуку в інтернеті (troubleshooting) для формування quickSolution
 * @returns {Promise<{ isTicketIntent: boolean, needsMoreInfo: boolean, category?: string, missingInfo: string[], confidence: number, priority?: string, emotionalTone?: string, quickSolution?: string }>}
 */
async function analyzeIntent(dialogHistory, userContext, webSearchContext = '') {
  const settings = await getAISettings();
  if (!settings || !settings.enabled) {
    return { isTicketIntent: false, needsMoreInfo: false, missingInfo: [], confidence: 0 };
  }

  let apiKey;
  if (settings.provider === 'openai') apiKey = settings.openaiApiKey;
  else if (settings.provider === 'gemini') apiKey = settings.geminiApiKey;

  if (!apiKey || !apiKey.trim()) {
    logger.warn('AI: відсутній API-ключ для провайдера', settings.provider);
    return { isTicketIntent: false, needsMoreInfo: false, missingInfo: [], confidence: 0 };
  }

  // Отримуємо список доступних швидких рішень
  const aiEnhancedService = require('./aiEnhancedService');
  const quickSolutions = aiEnhancedService.getAllQuickSolutions();
  const quickSolutionsText = quickSolutions.map(s =>
    `- ${s.problemType}: ${s.keywords.join(', ')}`
  ).join('\n');

  const similarTickets = await getSimilarResolvedTickets(5);
  const systemPrompt = fillPrompt(INTENT_ANALYSIS, {
    userContext: formatUserContext(userContext),
    dialogHistory: formatDialogHistory(dialogHistory),
    quickSolutions: quickSolutionsText,
    webSearchContext: webSearchContext ? String(webSearchContext).trim() : '',
    similarTickets
  });

  const userMessage = `Історія діалогу:\n${formatDialogHistory(dialogHistory)}`;

  const temperature = typeof INTENT_ANALYSIS_TEMPERATURE === 'number' ? INTENT_ANALYSIS_TEMPERATURE : 0.55;

  // Виклик AI з retry механізмом
  const response = await retryHelper.retryAIRequest(
    () => callChatCompletion(settings, systemPrompt, userMessage, MAX_TOKENS.INTENT_ANALYSIS, true, temperature),
    'analyzeIntent'
  );

  if (!response) return { isTicketIntent: false, needsMoreInfo: false, missingInfo: [], confidence: 0, offTopicResponse: null };

  const responseStr = String(response).trim();
  logger.info(`🤖 AI RAW RESPONSE (${responseStr.length} chars): ${responseStr.substring(0, 600)}`);

  const parsed = parseJsonFromResponse(responseStr);
  if (!parsed || typeof parsed !== 'object') {
    logger.error(`❌ AI: не вдалося розпарсити результат analyzeIntent. Відповідь (${responseStr.length}): ${responseStr.substring(0, 800)}`);
    return { isTicketIntent: true, needsMoreInfo: true, missingInfo: [], confidence: 0.5, offTopicResponse: null };
  }
  const offTopicResponse = parsed.offTopicResponse != null && String(parsed.offTopicResponse).trim() ? String(parsed.offTopicResponse).trim() : null;

  // Записати AI відповідь
  metricsCollector.recordAIResponse(parsed);

  // Валідація quickSolution якщо є
  let validatedQuickSolution = parsed.quickSolution || null;
  if (validatedQuickSolution) {
    const validation = aiResponseValidator.validate(validatedQuickSolution, 'quickSolution');
    if (!validation.valid) {
      metricsCollector.recordValidationFailure('quickSolution', validation.reason);
      logger.warn('AI quickSolution validation failed', {
        reason: validation.reason,
        original: validatedQuickSolution.substring(0, 100)
      });
      // Використовуємо fallback
      validatedQuickSolution = null;
    }
  }

  return {
    isTicketIntent: !!parsed.isTicketIntent,
    needsMoreInfo: !!parsed.needsMoreInfo,
    category: parsed.category || null,
    missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo : [],
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
    priority: parsed.priority || 'medium',
    emotionalTone: parsed.emotionalTone || 'calm',
    quickSolution: validatedQuickSolution,
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

  const apiKey = settings.provider === 'gemini' ? settings.geminiApiKey : settings.openaiApiKey;
  if (!apiKey || !apiKey.trim()) return 'Опишіть, будь ласка, проблему детальніше.';

  const missingStr = Array.isArray(missingInfo) && missingInfo.length ? missingInfo.join(', ') : 'деталі проблеми';
  const systemPrompt = fillPrompt(NEXT_QUESTION, {
    userContext: formatUserContext(userContext),
    missingInfo: missingStr
  });

  const userMessage = `Історія діалогу:\n${formatDialogHistory(dialogHistory)}\n\nЧого бракує: ${missingStr}. Згенеруй одне коротке питання українською.`;

  // Виклик AI з retry механізмом
  const response = await retryHelper.retryAIRequest(
    () => callChatCompletion(settings, systemPrompt, userMessage, MAX_TOKENS.NEXT_QUESTION, false),
    'generateNextQuestion'
  );

  if (!response || typeof response !== 'string') return 'Що саме не працює? Опишіть детальніше.';

  const trimmedResponse = response.trim().slice(0, 300);

  // Валідація питання
  const validation = aiResponseValidator.validate(trimmedResponse, 'nextQuestion');
  if (!validation.valid) {
    metricsCollector.recordValidationFailure('nextQuestion', validation.reason);
    logger.warn('AI nextQuestion validation failed', {
      reason: validation.reason,
      original: trimmedResponse
    });
    return aiResponseValidator.getFallbackQuestion();
  }

  return trimmedResponse;
}

/**
 * Виклик 3: підсумок тікета (title, description, category, priority).
 * @returns {Promise<{ title: string, description: string, category: string, priority: string }|null>}
 */
async function getTicketSummary(dialogHistory, userContext) {
  const settings = await getAISettings();
  if (!settings || !settings.enabled) return null;

  const apiKey = settings.provider === 'gemini' ? settings.geminiApiKey : settings.openaiApiKey;
  if (!apiKey || !apiKey.trim()) return null;

  const systemPrompt = fillPrompt(TICKET_SUMMARY, {
    userContext: formatUserContext(userContext)
  });

  const userMessage = `Діалог:\n${formatDialogHistory(dialogHistory)}\n\nСформуй готовий тікет (JSON: title, description, category, priority).`;

  // Виклик AI з retry механізмом
  const response = await retryHelper.retryAIRequest(
    () => callChatCompletion(settings, systemPrompt, userMessage, MAX_TOKENS.TICKET_SUMMARY, true),
    'getTicketSummary'
  );

  if (!response) return null;

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
      parsed
    });
    // Використовуємо fallback
    const lastUserMessage = dialogHistory.filter(m => m.role === 'user').pop()?.content || 'Проблема';
    return aiResponseValidator.getFallbackTicketSummary(lastUserMessage);
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
 * Загальний виклик chat completion (OpenAI або Gemini).
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
    if (settings.provider === 'gemini') {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
      const model = genAI.getGenerativeModel({
        model: settings.geminiModel || 'gemini-1.5-flash'
      });
      const chat = model.startChat({
        history: [{ role: 'user', parts: [{ text: systemPrompt }] }]
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
        { role: 'user', content: userMessage + (jsonMode ? '\n\nВідповідь має бути лише одним валідним JSON-об\'єктом (без тексту до або після).' : '') }
      ],
      max_tokens: maxTokens || 350,
      temperature: temp
    };
    if (jsonMode) opts.response_format = { type: 'json_object' };
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
    logger.error('AI: помилка виклику провайдера', { provider: settings?.provider, message: err.message });
    return null;
  }
}

/**
 * Парсить JSON з відповіді LLM (може повертати ```json ... ``` або текст з JSON всередині).
 * @param {string} response - сирий текст відповіді
 * @returns {Object|null} - розпарсений об'єкт або null
 */
function parseJsonFromResponse(response) {
  if (response == null || typeof response !== 'string') return null;
  const raw = String(response).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) { }
  const withoutMarkdown = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    return JSON.parse(withoutMarkdown);
  } catch (_) { }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(raw.slice(first, last + 1));
    } catch (_) { }
  }
  // Спроба знайти JSON-об'єкт серед тексту
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (_) { }
  }
  // Обрізана відповідь (немає закриваючої }): пробуємо дописати недостатнє
  if (raw.startsWith('{') && !raw.trim().endsWith('}')) {
    const closed = tryCloseTruncatedJson(raw);
    if (closed) {
      try {
        return JSON.parse(closed);
      } catch (_) { }
    }
  }
  return null;
}

/**
 * Спроба дописати закриваючі дужки/лапки до обрізаного JSON (наприклад через max_tokens).
 */
function tryCloseTruncatedJson(raw) {
  const s = raw.trim();
  if (!s.startsWith('{')) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (!inString) {
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '"') inString = true;
    } else if (c === '"') inString = false;
  }
  if (depth <= 0) return null;
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
    monthlyMonth: monthly.month
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
      language: 'uk'
    });
    const text = transcription && typeof transcription.text === 'string' ? transcription.text.trim() : null;
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
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';
    base64 = fs.readFileSync(imagePath, { encoding: 'base64' });
  } catch (err) {
    logger.error('AI: не вдалося прочитати фото для аналізу', { imagePath, message: err.message });
    return null;
  }
  const imageUrl = `data:${mimeType};base64,${base64}`;
  const systemPrompt = fillPrompt(PHOTO_ANALYSIS, {
    problemDescription: problemDescription || 'Користувач не описав проблему.',
    userContext: formatUserContext(userContext)
  });
  try {
    const OpenAI = require('openai').default;
    const openai = new OpenAI({ apiKey: settings.openaiApiKey.trim() });
    const response = await openai.chat.completions.create({
      model: settings.openaiModel && settings.openaiModel.includes('gpt-4') ? settings.openaiModel : 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Проаналізуй фото та дай інструкцію. Ось зображення:' },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: MAX_TOKENS.PHOTO_ANALYSIS || 400,
      temperature: 0.4
    });
    const u = response?.usage;
    if (u && typeof u.prompt_tokens === 'number') {
      tokenUsage.promptTokens += u.prompt_tokens;
      tokenUsage.completionTokens += u.completion_tokens || 0;
      tokenUsage.totalTokens += u.total_tokens || u.prompt_tokens + (u.completion_tokens || 0);
      tokenUsage.requestCount += 1;
      addMonthlyUsage(u.prompt_tokens, u.completion_tokens || 0, u.total_tokens || u.prompt_tokens + (u.completion_tokens || 0));
    }
    const text = response?.choices?.[0]?.message?.content;
    return text ? String(text).trim() : null;
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
  if (!settings || !settings.enabled || settings.provider !== 'openai') return null;
  if (!settings.openaiApiKey || !String(settings.openaiApiKey).trim()) return null;
  if (!imagePath || !fs.existsSync(imagePath)) return null;
  let base64;
  let mimeType = 'image/jpeg';
  try {
    const ext = path.extname(imagePath).toLowerCase();
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';
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
      model: settings.openaiModel && settings.openaiModel.includes('gpt-4') ? settings.openaiModel : 'gpt-4o-mini',
      messages: [
        { role: 'system', content: COMPUTER_ACCESS_ANALYSIS },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Проаналізуй це фото доступу до комп\'ютера. Визнач програму та ID якщо видно.' },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: MAX_TOKENS.COMPUTER_ACCESS_ANALYSIS || 150,
      temperature: 0.2
    });
    const u = response?.usage;
    if (u && typeof u.prompt_tokens === 'number') {
      tokenUsage.promptTokens += u.prompt_tokens;
      tokenUsage.completionTokens += u.completion_tokens || 0;
      tokenUsage.totalTokens += u.total_tokens || u.prompt_tokens + (u.completion_tokens || 0);
      tokenUsage.requestCount += 1;
      addMonthlyUsage(u.prompt_tokens, u.completion_tokens || 0, u.total_tokens || u.prompt_tokens + (u.completion_tokens || 0));
    }
    const text = response?.choices?.[0]?.message?.content;
    return text ? String(text).trim() : null;
  } catch (err) {
    logger.error('AI: помилка аналізу фото доступу (vision)', { message: err.message });
    return null;
  }
}

module.exports = {
  getAISettings,
  analyzeIntent,
  generateNextQuestion,
  getTicketSummary,
  analyzePhoto,
  analyzeComputerAccessPhoto,
  getSimilarResolvedTickets,
  formatUserContext,
  invalidateCache,
  getTokenUsage,
  resetTokenUsage,
  transcribeVoiceToText
};
