const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { kbUploadsPath, fileSearchPaths } = require('../config/paths');
const KnowledgeBase = require('../models/KnowledgeBase');
const aiFirstLineService = require('./aiFirstLineService');
const botConversationService = require('./botConversationService');
const TelegramUtils = require('./telegramUtils');
const kbRelevanceGuard = require('../utils/kbRelevanceGuard');

/** MIME type for KB attachment to avoid node-telegram-bot-api DeprecationWarning when sending files */
function getContentTypeForKbFile(filename, kind) {
  const ext = (path.extname(filename || '') || '').toLowerCase();
  if (kind === 'image') {
    const map = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    return map[ext] || 'image/jpeg';
  }
  if (kind === 'video') {
    const map = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
    return map[ext] || 'video/mp4';
  }
  return 'application/octet-stream';
}

/** Resolve full path for KB attachment: спочатку uploads/kb, потім пошук по fileSearchPaths (як у routes/files.js). */
function resolveKbAttachmentPath(filename) {
  if (!filename || typeof filename !== 'string') {
    return null;
  }
  const name = path.basename(filename);
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
    return null;
  }
  const primary = path.join(kbUploadsPath, name);
  if (fs.existsSync(primary) && fs.statSync(primary).isFile()) {
    return primary;
  }
  for (const dir of fileSearchPaths) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/** Чи текст відповіді вказує, що потрібне лише втручання адміна (немає самодопомоги). Тоді кнопку "Допомогло" не показуємо. */
function quickSolutionRequiresAdminOnly(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  const lower = text.toLowerCase();
  const adminPhrases = [
    'задача для адміністратора',
    'задача для адміна',
    'це задача для адміна',
    'створю заявку',
    'створю тікет',
    'адмін проведе',
    'адмін встановить',
    'адмін підключиться',
    'адмін візьме',
    'потрібне втручання адміна',
    'для адміністратора',
    'для адміна',
    'адміністратор встановить',
    'я створю заявку',
    'я створю тікет',
  ];
  return adminPhrases.some(phrase => lower.includes(phrase));
}

class TelegramAIService {
  constructor(telegramService) {
    this.telegramService = telegramService;
  }

  static get INTERNET_REQUESTS_LIMIT_PER_DAY() {
    return 5;
  }
  static get INTERNET_REQUESTS_EXEMPT_TELEGRAM_ID() {
    return '6070910226';
  }

  static get CITY_NAME_FOR_WEATHER() {
    return {
      київ: 'Kyiv',
      львів: 'Lviv',
      одеса: 'Odesa',
      харків: 'Kharkiv',
      дніпро: 'Dnipro',
      запоріжжя: 'Zaporizhzhia',
      вінниця: 'Vinnytsia',
      полтава: 'Poltava',
      чернігів: 'Chernihiv',
      'івано-франківськ': 'Ivano-Frankivsk',
      тернопіль: 'Ternopil',
      ужгород: 'Uzhhorod',
      луцьк: 'Lutsk',
      рівне: 'Rivne',
      черкаси: 'Cherkasy',
      кропивницький: 'Kropyvnytskyi',
      миколаїв: 'Mykolaiv',
      херсон: 'Kherson',
      маріуполь: 'Mariupol',
    };
  }

  canMakeInternetRequest(telegramId) {
    const id = String(telegramId);
    return id === TelegramAIService.INTERNET_REQUESTS_EXEMPT_TELEGRAM_ID;
  }

  recordInternetRequest(telegramId) {
    const id = String(telegramId);
    if (id === TelegramAIService.INTERNET_REQUESTS_EXEMPT_TELEGRAM_ID) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    let rec = this.telegramService.internetRequestCounts.get(id);
    if (!rec || rec.date !== today) {
      rec = { date: today, count: 0 };
    }
    rec.count += 1;
    this.telegramService.internetRequestCounts.set(id, rec);
  }

  fetchNbuUsdRate() {
    return new Promise(resolve => {
      const url = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json';
      https
        .get(url, res => {
          let data = '';
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const arr = JSON.parse(data);
              const item = Array.isArray(arr) && arr[0];
              if (item && typeof item.rate === 'number') {
                resolve({ rate: item.rate, date: item.exchangedate || '' });
              } else {
                resolve(null);
              }
            } catch (e) {
              logger.error('NBU rate parse error', e);
              resolve(null);
            }
          });
        })
        .on('error', err => {
          logger.error('NBU rate request error', err);
          resolve(null);
        });
    });
  }

  fetchWeatherForCity(cityName) {
    if (
      !cityName ||
      String(cityName).trim() === '' ||
      String(cityName).toLowerCase() === 'не вказано'
    ) {
      return Promise.resolve(null);
    }
    const name = String(cityName).trim();
    const nameLower = name.toLowerCase();
    const cityForApi = TelegramAIService.CITY_NAME_FOR_WEATHER[nameLower] || name;
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityForApi)}&count=1&language=uk`;
    return new Promise(resolve => {
      https
        .get(geoUrl, res => {
          let data = '';
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              const results = json.results;
              const first = Array.isArray(results) && results[0];
              if (
                !first ||
                typeof first.latitude !== 'number' ||
                typeof first.longitude !== 'number'
              ) {
                resolve(null);
                return;
              }
              const lat = first.latitude;
              const lon = first.longitude;
              const placeName = first.name || name;
              const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code`;
              https
                .get(forecastUrl, res2 => {
                  let data2 = '';
                  res2.on('data', chunk => {
                    data2 += chunk;
                  });
                  res2.on('end', () => {
                    try {
                      const f = JSON.parse(data2);
                      const cur = f.current;
                      if (!cur || typeof cur.temperature_2m !== 'number') {
                        resolve(null);
                        return;
                      }
                      const code = cur.weather_code;
                      const descMap = {
                        0: 'Ясно',
                        1: 'Переважно ясно',
                        2: 'Змінна хмарність',
                        3: 'Хмарно',
                        45: 'Туман',
                        48: 'Іній',
                        51: 'Морось',
                        53: 'Морось',
                        55: 'Морось',
                        61: 'Дощ',
                        63: 'Дощ',
                        65: 'Сильний дощ',
                        71: 'Сніг',
                        73: 'Сніг',
                        75: 'Сніг',
                        77: 'Сніг',
                        80: 'Злива',
                        81: 'Злива',
                        82: 'Злива',
                        85: 'Снігопад',
                        86: 'Снігопад',
                        95: 'Гроза',
                        96: 'Гроза з градом',
                        99: 'Гроза з градом',
                      };
                      const description = descMap[code] || 'Опади';
                      resolve({ temp: cur.temperature_2m, description, city: placeName });
                    } catch (e2) {
                      logger.error('Open-Meteo forecast parse error', e2);
                      resolve(null);
                    }
                  });
                })
                .on('error', err2 => {
                  logger.error('Open-Meteo forecast request error', err2);
                  resolve(null);
                });
            } catch (e) {
              logger.error('Open-Meteo geocoding parse error', e);
              resolve(null);
            }
          });
        })
        .on('error', err => {
          logger.error('Open-Meteo geocoding request error', err);
          resolve(null);
        });
    });
  }

  fetchTroubleshootingSnippet(query) {
    if (!query || String(query).trim() === '') {
      return Promise.resolve('');
    }
    const q = encodeURIComponent(String(query).trim().substring(0, 200));
    const url = `https://api.duckduckgo.com/?q=${q}&format=json`;
    return new Promise(resolve => {
      https
        .get(url, res => {
          let data = '';
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              const parts = [];
              if (json.AbstractText && String(json.AbstractText).trim()) {
                parts.push(String(json.AbstractText).trim().substring(0, 800));
              }
              if (Array.isArray(json.RelatedTopics) && json.RelatedTopics.length > 0) {
                const first = json.RelatedTopics[0];
                const text = first.Text || null;
                if (text && String(text).trim()) {
                  parts.push(String(text).trim().substring(0, 400));
                }
              }
              resolve(parts.join('\n\n').trim());
            } catch (e) {
              resolve('');
            }
          });
        })
        .on('error', () => resolve(''));
    });
  }

  /**
   * A.3: для звернення (appeal) опційно надіслати одну підказку з бази знань.
   * @param {string|number} chatId
   * @param {string} query - текст запиту користувача
   * @param {Object} [session] - сесія (для контексту діалогу, якщо query короткий: "ні", "ок")
   */
  async _sendKbHintForAppeal(chatId, query, session) {
    let q = (query || '').trim();
    if (!q) {
      return;
    }
    const uninformative = /^(ні|нi|так|ок|добре|нет|no|yes|ніт|окей|угу|ага|ну)$/i.test(q);
    if (uninformative && session && Array.isArray(session.dialog_history)) {
      const lastUser = [...session.dialog_history]
        .reverse()
        .find(m => m.role === 'user' && m.content && m.content.length > 15);
      if (lastUser && lastUser.content) {
        q = String(lastUser.content).trim();
      }
    }
    if (q.length <= 3) {
      return;
    }
    try {
      const kbEmbeddingService = require('./kbEmbeddingService');
      const thresholds = kbEmbeddingService.getScoreThresholds();
      const results = await kbEmbeddingService.findSimilarArticles(q, { topK: 2 });
      const hints = results.filter(r => r.score >= thresholds.medium).slice(0, 2);
      if (hints.length === 0) {
        const kbSearchService = require('./kbSearchService');
        const hintArticle = await kbSearchService.findBestMatchForBotTextOnly(q);
        if (!hintArticle) {
          return;
        }
        const title = hintArticle.title || 'Стаття';
        const content = (hintArticle.content && String(hintArticle.content).trim()) || '';
        if (!kbRelevanceGuard.isKbArticleRelevantToQuery(q, title, content.slice(0, 400))) {
          return;
        }
        const excerpt =
          content.length > 0
            ? content.slice(0, 250).replace(/\n+/g, ' ').trim() + (content.length > 250 ? '…' : '')
            : '';
        const hintMsg = excerpt
          ? `💡 Можливо, вам допоможе: «${title}»\n\n${excerpt}`
          : `💡 Можливо, вам допоможе стаття з бази знань: «${title}»`;
        await this.telegramService.sendMessage(chatId, hintMsg);
        return;
      }
      const relevantHints = hints.filter(r =>
        kbRelevanceGuard.isKbArticleRelevantToQuery(
          q,
          (r.article && r.article.title) || '',
          (r.article && r.article.content && String(r.article.content).trim().slice(0, 400)) || ''
        )
      );
      if (relevantHints.length === 0) {
        return;
      }
      const lines = relevantHints
        .slice(0, 2)
        .map(
          r =>
            `• «${(r.article.title || 'Стаття').slice(0, 80)}»${r.article.content ? ' — ' + String(r.article.content).trim().slice(0, 120).replace(/\n+/g, ' ') + '…' : ''}`
        );
      const hintMsg = `💡 Можливо, вам допоможе:\n\n${lines.join('\n\n')}`;
      await this.telegramService.sendMessage(chatId, hintMsg.slice(0, 1000));
    } catch (err) {
      logger.warn('KB hint for appeal failed', err);
    }
  }

  /**
   * Відправити статтю KB в чат за callback "Можливо, ви мали на увазі" (Частина C).
   * @param {string|number} chatId
   * @param {string} articleId - ID статті з БД
   * @param {object} user - користувач (для conversation log)
   */
  async handleKbArticleCallback(chatId, articleId, user) {
    if (!articleId) {
      return;
    }
    try {
      const article = await KnowledgeBase.findOne({
        _id: articleId,
        status: 'published',
        isActive: true,
      }).lean();
      if (!article) {
        await this.telegramService.sendMessage(chatId, 'Статтю не знайдено.');
        return;
      }
      const textParts = [article.title];
      if (article.content && String(article.content).trim()) {
        textParts.push(String(article.content).trim());
      }
      const articleText = TelegramUtils.normalizeQuickSolutionSteps(textParts.join('\n\n'));
      const session = this.telegramService.userSessions.get(chatId);
      if (session) {
        session.dialog_history = session.dialog_history || [];
        session.dialog_history.push({ role: 'assistant', content: articleText });
        session.step = 'awaiting_tip_feedback';
        this.telegramService.userSessions.set(chatId, session);
      }
      if (user) {
        botConversationService
          .appendMessage(chatId, user, 'assistant', articleText)
          .catch(() => {});
      }

      const requiresAdminOnly = quickSolutionRequiresAdminOnly(articleText);
      const keyboard = TelegramUtils.inlineKeyboardTwoPerRow(
        requiresAdminOnly
          ? [
              { text: '📝 Ні, створити тікет', callback_data: 'tip_not_helped' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]
          : [
              { text: '✅ Допомогло', callback_data: 'tip_helped' },
              { text: '📝 Ні, створити тікет', callback_data: 'tip_not_helped' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]
      );

      await this.telegramService.sendMessage(chatId, articleText, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
      const attachments = Array.isArray(article.attachments) ? article.attachments : [];
      for (const att of attachments) {
        const fp = att && (att.filePath || att.filepath);
        if (!fp || typeof fp !== 'string') {
          continue;
        }
        const fullPath = resolveKbAttachmentPath(fp);
        if (!fullPath) {
          continue;
        }
        const name = path.basename(fp);
        try {
          const type = String(att.type || '').toLowerCase();
          const stream = fs.createReadStream(fullPath);
          const fileOptions = {
            filename: name,
            contentType: getContentTypeForKbFile(name, type),
          };
          try {
            if (type === 'image') {
              await this.telegramService.bot.sendPhoto(chatId, stream, {}, fileOptions);
            } else if (type === 'video') {
              await this.telegramService.bot.sendVideo(chatId, stream, {}, fileOptions);
            }
          } finally {
            if (stream.destroy) {
              stream.destroy();
            }
          }
        } catch (err) {
          logger.warn('KB: не вдалося відправити вкладений файл', { fullPath, err: err.message });
        }
      }
    } catch (err) {
      logger.warn('KB callback: handleKbArticleCallback failed', { articleId, err: err.message });
      await this.telegramService.sendMessage(chatId, 'Не вдалося завантажити статтю.');
    }
  }

  async handleMessageInAiMode(chatId, text, session, user, Transcription = null) {
    try {
      if (Transcription) {
        await this.telegramService.sendTyping(chatId);
        const feedbackMsg = `Я прослухав ваше повідомлення: «${Transcription}». Спробую допомогти...`;
        await this.telegramService.sendMessage(chatId, feedbackMsg);
        await this._handleMessageInAiModeImpl(chatId, Transcription, session, user);
      } else {
        await this._handleMessageInAiModeImpl(chatId, text, session, user);
      }
    } catch (err) {
      logger.error('handleMessageInAiMode: помилка', {
        chatId,
        err: err.message,
        stack: err.stack,
      });
      try {
        await this.telegramService.sendMessage(
          chatId,
          'Щось пішло не так під час обробки. Спробуйте ще раз або створіть заявку вручну.',
          {
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: '📝 Створити тікет', callback_data: 'create_ticket' },
                { text: '🏠 Головне меню', callback_data: 'back_to_menu' },
              ]),
            },
          }
        );
      } catch (e) {
        logger.error('Не вдалося відправити fallback повідомлення', e);
      }
    }
  }

  async _handleMessageInAiModeImpl(chatId, text, session, user) {
    const CONFIDENCE_THRESHOLD = 0.6;
    const MAX_AI_QUESTIONS = 4;
    const MAX_AI_ATTEMPTS = 2;

    if (
      session.step === 'gathering_information' &&
      session.editingFromConfirm &&
      session.ticketDraft
    ) {
      const t = (text || '').toLowerCase().trim();
      const nothingToChange =
        /^(нічого|ничого|nothing|ні|нi|пропустити|залишити як є|залишити|все ок|все добре|ок|окей|добре|норм|нормально)$/.test(
          t
        ) ||
        t === 'нч' ||
        t === 'нчого';
      if (nothingToChange) {
        session.step = 'confirm_ticket';
        session.editingFromConfirm = false;
        const d = session.ticketDraft;
        await this.telegramService.sendTyping(chatId);
        const msg = `✅ <b>Перевірте, чи все правильно</b>\n\n📌 <b>Заголовок:</b>\n${TelegramUtils.escapeHtml(d.title || '—')}\n\n📝 <b>Опис:</b>\n${TelegramUtils.escapeHtml(d.description || '—')}\n\n📊 <b>Категорія:</b> ${TelegramUtils.escapeHtml(d.subcategory || '—')}\n⚡ <b>Пріоритет:</b> ${TelegramUtils.escapeHtml(d.priority || '—')}\n\nВсе правильно?`;
        await this.telegramService.sendMessage(chatId, msg, {
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
              { text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' },
              { text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]),
          },
          parse_mode: 'HTML',
        });
        return;
      }
      if (!session.dialog_history) {
        session.dialog_history = [];
      }
      session.dialog_history.push({ role: 'user', content: text });
      botConversationService
        .appendMessage(
          chatId,
          user,
          'user',
          text,
          null,
          (session.dialog_history.length === 1 ? text : '').slice(0, 200)
        )
        .catch(() => {});
      session.editingFromConfirm = false;
      await this.telegramService.sendTyping(chatId);
      let summaryAfterEdit;
      try {
        summaryAfterEdit = await aiFirstLineService.getTicketSummary(
          session.dialog_history,
          session.userContext,
          session.cachedPriority,
          session.cachedCategory
        );
      } catch (err) {
        logger.error('AI: getTicketSummary після редагування', err);
      }
      if (summaryAfterEdit) {
        session.step = 'confirm_ticket';
        session.ticketDraft = {
          ...session.ticketDraft,
          title: summaryAfterEdit.title,
          description: summaryAfterEdit.description,
          priority: summaryAfterEdit.priority,
          subcategory: summaryAfterEdit.category,
          type: session.ticketDraft.type || 'problem',
        };
        const d = session.ticketDraft;
        const msg = `✅ <b>Перевірте, чи все правильно</b>\n\n📌 <b>Заголовок:</b>\n${TelegramUtils.escapeHtml(d.title || '—')}\n\n📝 <b>Опис:</b>\n${TelegramUtils.escapeHtml(d.description || '—')}\n\n📊 <b>Категорія:</b> ${TelegramUtils.escapeHtml(d.subcategory || '—')}\n⚡ <b>Пріоритет:</b> ${TelegramUtils.escapeHtml(d.priority || '—')}\n\nВсе правильно?`;
        await this.telegramService.sendMessage(chatId, msg, {
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
              { text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' },
              { text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]),
          },
          parse_mode: 'HTML',
        });
        return;
      }
      await this.telegramService.sendMessage(
        chatId,
        'Не вдалося оновити заявку за цим текстом. Спробуйте ще раз або натисніть «Так, створити тікет» з попереднього кроку.',
        {
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
              { text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' },
              { text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]),
          },
        }
      );
      return;
    }

    if (!session.dialog_history) {
      session.dialog_history = [];
    }

    // Крок після "Ні, створити тікет": користувач надіслав опис помилки або фото — переходимо до підтвердження заявки
    if (session.step === 'awaiting_error_details_after_not_helped') {
      session.dialog_history.push({ role: 'user', content: text });
      botConversationService
        .appendMessage(chatId, user, 'user', text, null, String(text).slice(0, 200))
        .catch(() => {});
      await this._showTicketConfirmationFromDialog(chatId, session, user);
      return;
    }

    // Phase 1: Forced Detail Gathering for short initial messages — але спочатку перевіряємо KB
    const textLen = (text || '').trim().length;
    if (session.dialog_history.length === 0 && textLen < 40 && !session.detailsRequested) {
      let kbMatch = false;
      try {
        const kbSearchService = require('./kbSearchService');
        kbMatch = !!(await kbSearchService.findBestMatchForBot((text || '').trim()));
      } catch (_) {
        // ігноруємо помилку пошуку
      }
      if (!kbMatch) {
        session.dialog_history.push({ role: 'user', content: text });
        botConversationService
          .appendMessage(chatId, user, 'user', text, null, text.slice(0, 200))
          .catch(() => {});

        const filler = await aiFirstLineService.generateConversationalResponse(
          session.dialog_history,
          'request_details',
          session.userContext,
          session.cachedEmotionalTone
        );
        session.dialog_history.push({ role: 'assistant', content: filler });
        botConversationService.appendMessage(chatId, user, 'assistant', filler).catch(() => {});

        session.detailsRequested = true;
        await this.telegramService.sendMessage(chatId, filler);
        return;
      }
      // Є стаття в KB — не питаємо деталі, йдемо далі до analyzeIntent і відправимо статтю
    }

    if (session.detailsRequested) {
      delete session.detailsRequested;
    }

    session.dialog_history.push({ role: 'user', content: text });
    botConversationService
      .appendMessage(
        chatId,
        user,
        'user',
        text,
        null,
        (session.dialog_history.length === 1 ? text : '').slice(0, 200)
      )
      .catch(() => {});

    if (session.step === 'awaiting_tip_feedback') {
      const t = (text || '').toLowerCase().trim();
      const helped = /^(так|да|допомогло|ок|окей|все добре|все ок|супер|дякую)$/.test(t);
      const notHelped =
        /^(ні|нi|не допомогло|не вийшло|створити тікет|потрібен тікет|оформити заявку)$/.test(t) ||
        t.includes('не допомогло') ||
        t.includes('не вийшло');

      let resultAfterTip;

      if (helped) {
        session.step = null;
        const filler = await aiFirstLineService.generateConversationalResponse(
          session.dialog_history,
          'accept_thanks',
          session.userContext,
          session.cachedEmotionalTone
        );
        botConversationService.appendMessage(chatId, user, 'assistant', filler).catch(() => {});
        this.telegramService.userSessions.delete(chatId);
        await this.telegramService.sendMessage(chatId, filler, {
          reply_markup: {
            inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
          },
        });
        return;
      }
      if (notHelped) {
        session.step = 'gathering_information';
        session.afterTipNotHelped = true;
        await this.telegramService.sendTyping(chatId);
        try {
          resultAfterTip = await aiFirstLineService.analyzeIntent(
            session.dialog_history,
            session.userContext
          );
        } catch (err) {
          resultAfterTip = {
            requestType: 'appeal',
            requestTypeConfidence: 0.7,
            isTicketIntent: true,
            needsMoreInfo: true,
            missingInfo: ['деталі проблеми'],
            confidence: 0.7,
            quickSolution: null,
          };
        }

        // Phase 4: Conditional Computer Access Photo for software/access issues
        const isSoftwareIssue = ['Software', 'Printer', 'Access', 'Network'].includes(
          resultAfterTip.category
        );
        const hasNoPhoto =
          !session.userContext?.hasComputerAccessPhoto && !user.computerAccessPhoto;

        const filler = await aiFirstLineService.generateConversationalResponse(
          session.dialog_history,
          'start_gathering_info',
          session.userContext,
          resultAfterTip.emotionalTone
        );
        session.dialog_history.push({ role: 'assistant', content: filler });
        botConversationService.appendMessage(chatId, user, 'assistant', filler).catch(() => {});

        if (isSoftwareIssue && hasNoPhoto) {
          session.awaitingComputerAccessPhoto = true;
          const photoQuestion =
            'Щоб я міг підключитися та допомогти, надішліть, будь ласка, фото/скріншот вашого AnyDesk або TeamViewer з ID.';
          session.dialog_history.push({ role: 'assistant', content: photoQuestion });
          await this.telegramService.sendMessage(chatId, `${filler}\n\n${photoQuestion}`, {
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: '⏭️ Пропустити (без фото)', callback_data: 'skip_computer_access_photo' },
                { text: '❌ Скасувати', callback_data: 'cancel_ticket' },
              ]),
            },
          });
          return;
        }

        session.ai_questions_count = (session.ai_questions_count || 0) + 1;
        let question;
        try {
          question = await aiFirstLineService.generateNextQuestion(
            session.dialog_history,
            resultAfterTip.missingInfo || [],
            session.userContext,
            session.cachedEmotionalTone || 'neutral'
          );
        } catch (_) {
          // Ignore error and use default question
          question = 'Опишіть, будь ласка, що саме відбувається.';
        }
        session.dialog_history.push({ role: 'assistant', content: question });
        botConversationService.appendMessage(chatId, user, 'assistant', question).catch(() => {});
        const missing = resultAfterTip.missingInfo || [];
        session.awaitingComputerAccessPhoto = missing.some(m =>
          String(m).includes('фото доступу до ПК')
        );
        session.awaitingErrorPhoto = missing.some(m => String(m).includes('фото помилки'));
        session.lastMissingInfo = missing;
        if (session.awaitingErrorPhoto) {
          question =
            question +
            '\n\n📸 Надішліть, будь ласка, фото помилки (скріншот) — це допоможе швидше вирішити проблему.';
        }
        const buttonsAfterTip = [
          { text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' },
          { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
        ];
        if (session.awaitingComputerAccessPhoto) {
          buttonsAfterTip.unshift({
            text: '⏭️ Пропустити (без фото доступу)',
            callback_data: 'skip_computer_access_photo',
          });
        } else if (session.awaitingErrorPhoto) {
          buttonsAfterTip.unshift({
            text: '⏭️ Пропустити (без фото помилки)',
            callback_data: 'skip_error_photo',
          });
        }
        await this.telegramService.sendMessage(chatId, question, {
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow(buttonsAfterTip),
          },
        });
        return;
      }

      if (resultAfterTip.isUnsure) {
        const unsureActions = [
          { text: '👨‍💻 Запитати адміна', callback_data: 'create_ticket' },
          { text: '🔍 Пошук у базі знань', callback_data: 'search_kb' },
          { text: '❓ Інше питання', callback_data: 'back_to_menu' },
        ];
        await this.telegramService.sendMessage(
          chatId,
          resultAfterTip.offTopicResponse ||
            'Я не зовсім впевнений, що правильно зрозумів ваше питання. Спробуйте перефразувати або я можу створити заявку для адміністратора прямо зараз.',
          {
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow(unsureActions),
            },
          }
        );
        return;
      }

      session.step = 'gathering_information';
      session.afterTipNotHelped = true; // Якщо користувач замість кнопок просто відповів на питання — вважаємо що тіпс не закрив питання
    }

    // Рання обробка погоди та курсу — без виклику AI, щоб не задавати зайвих уточнюючих питань
    const textLower = (text || '').toLowerCase().trim();
    const isExchangeRateRequest =
      textLower.includes('курс') ||
      textLower.includes('долар') ||
      textLower.includes('євро') ||
      textLower.includes('валюта') ||
      textLower.includes('usd');
    const isWeatherRequest = textLower.includes('погода');
    const userCity =
      session.userContext && session.userContext.userCity
        ? String(session.userContext.userCity).trim()
        : '';
    const telegramId = String(user?.telegramId ?? user?.telegramChatId ?? chatId);

    if (isExchangeRateRequest) {
      if (!this.canMakeInternetRequest(telegramId)) {
        await this.telegramService.sendMessage(
          chatId,
          `Запити інформації з інтернету (курс, погода) для вас недоступні.\n\nЯкщо є технічна проблема — опишіть її, і я допоможу оформити заявку.`,
          {
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: 'Створити тікет', callback_data: 'create_ticket' },
                { text: 'Головне меню', callback_data: 'back_to_menu' },
              ]),
            },
          }
        );
        this.telegramService.userSessions.delete(chatId);
        return;
      }
      await this.telegramService.sendTyping(chatId);
      const nbu = await this.fetchNbuUsdRate();
      if (nbu) {
        this.recordInternetRequest(telegramId);
        const rateText = nbu.date ? `Курс USD за ${nbu.date}` : 'Курс USD (НБУ)';
        await this.telegramService.sendMessage(
          chatId,
          `💵 <b>${TelegramUtils.escapeHtml(rateText)}:</b> ${nbu.rate.toFixed(2)} грн\n\nЯкщо потрібна допомога з тікетом — пиши.`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: 'Створити тікет', callback_data: 'create_ticket' },
                { text: 'Головне меню', callback_data: 'back_to_menu' },
              ]),
            },
          }
        );
      } else {
        await this.telegramService.sendMessage(
          chatId,
          'Зараз не вдалося отримати курс. Спробуй пізніше або напиши, якщо є технічна проблема — допоможу з тікетом.',
          {
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: 'Створити тікет', callback_data: 'create_ticket' },
                { text: 'Головне меню', callback_data: 'back_to_menu' },
              ]),
            },
          }
        );
      }
      session.dialog_history.push({
        role: 'assistant',
        content: nbu ? `Курс USD: ${nbu.rate.toFixed(2)} грн` : 'Не вдалося отримати курс.',
      });
      this.telegramService.userSessions.delete(chatId);
      return;
    }

    if (isWeatherRequest) {
      if (!userCity || userCity.toLowerCase() === 'не вказано') {
        await this.telegramService.sendMessage(
          chatId,
          'Не знаю ваше місто. Вкажіть місто в профілі — тоді зможу показати погоду для вас.\n\nЯкщо є технічна проблема — опишіть її, допоможу з тікетом.',
          {
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: 'Створити тікет', callback_data: 'create_ticket' },
                { text: 'Головне меню', callback_data: 'back_to_menu' },
              ]),
            },
          }
        );
        this.telegramService.userSessions.delete(chatId);
        return;
      }
      if (!this.canMakeInternetRequest(telegramId)) {
        await this.telegramService.sendMessage(
          chatId,
          `Запити інформації з інтернету (курс, погода) для вас недоступні.\n\nЯкщо є технічна проблема — опишіть її, і я допоможу оформити заявку.`,
          {
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: 'Створити тікет', callback_data: 'create_ticket' },
                { text: 'Головне меню', callback_data: 'back_to_menu' },
              ]),
            },
          }
        );
        this.telegramService.userSessions.delete(chatId);
        return;
      }
      await this.telegramService.sendTyping(chatId);
      const weather = await this.fetchWeatherForCity(userCity);
      if (weather) {
        this.recordInternetRequest(telegramId);
        await this.telegramService.sendMessage(
          chatId,
          `🌤 <b>Погода в ${TelegramUtils.escapeHtml(weather.city)}:</b> ${TelegramUtils.escapeHtml(weather.description)}, ${Math.round(weather.temp)}°C\n\nЯкщо потрібна допомога з тікетом — пиши.`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: 'Створити тікет', callback_data: 'create_ticket' },
                { text: 'Головне меню', callback_data: 'back_to_menu' },
              ]),
            },
          }
        );
        session.dialog_history.push({
          role: 'assistant',
          content: `Погода в ${weather.city}: ${weather.description}, ${Math.round(weather.temp)}°C`,
        });
      } else {
        await this.telegramService.sendMessage(
          chatId,
          `Зараз не вдалося отримати погоду для ${userCity}. Спробуй пізніше або напиши, якщо є технічна проблема — допоможу з тікетом.`,
          {
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: 'Створити тікет', callback_data: 'create_ticket' },
                { text: 'Головне меню', callback_data: 'back_to_menu' },
              ]),
            },
          }
        );
      }
      this.telegramService.userSessions.delete(chatId);
      return;
    }

    await this.telegramService.sendTyping(chatId);
    const searchQuery = (text || '').trim()
      ? `${String(text).trim()} як виправити troubleshooting`
      : '';
    const webSearchContext = searchQuery ? await this.fetchTroubleshootingSnippet(searchQuery) : '';
    let result;
    try {
      result = await aiFirstLineService.analyzeIntent(
        session.dialog_history,
        session.userContext,
        webSearchContext,
        { userId: user?._id }
      );
    } catch (err) {
      logger.error('AI: помилка analyzeIntent', err);
      await this.telegramService.sendMessage(
        chatId,
        'Зараз не можу обробити. Спробуйте ще раз або натисніть «Заповнити по-старому».',
        {
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
              { text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]),
          },
        }
      );
      return;
    }

    if (
      session.userContext &&
      session.userContext.hasComputerAccessPhoto &&
      Array.isArray(result.missingInfo)
    ) {
      result.missingInfo = result.missingInfo.filter(
        m => !String(m).includes('фото доступу до ПК')
      );
      if (result.missingInfo.length === 0) {
        result.needsMoreInfo = false;
      }
    }

    if (result.confidence < CONFIDENCE_THRESHOLD) {
      session.ai_attempts = (session.ai_attempts || 0) + 1;
    }

    // Cache AI insights for later use in ticket summary and flow (question vs appeal)
    if (result.priority) {
      session.cachedPriority = result.priority;
    }
    if (result.category) {
      session.cachedCategory = result.category;
    }
    if (result.emotionalTone) {
      session.cachedEmotionalTone = result.emotionalTone;
    }
    if (result.requestType === 'question' || result.requestType === 'appeal') {
      session.cachedRequestType = result.requestType;
    }
    if (result.duplicateTicketId) {
      session.duplicateTicketId = result.duplicateTicketId;
    }

    if (!result.isTicketIntent) {
      // [KB ВИМКНЕНО] Стаття з бази знань — та сама логіка: Допомогло / Ні, створити тікет / Скасувати
      // eslint-disable-next-line no-constant-condition
      if (false && result.kbArticle && result.kbArticle.title) {
        const article = result.kbArticle;
        const textParts = [article.title];
        if (article.content && String(article.content).trim()) {
          textParts.push(String(article.content).trim());
        }
        const articleText = TelegramUtils.normalizeQuickSolutionSteps(textParts.join('\n\n'));
        session.dialog_history.push({ role: 'assistant', content: articleText });
        session.step = 'awaiting_tip_feedback';
        botConversationService
          .appendMessage(chatId, user, 'assistant', articleText)
          .catch(() => {});

        const requiresAdminOnly = quickSolutionRequiresAdminOnly(articleText);
        const keyboard = TelegramUtils.inlineKeyboardTwoPerRow(
          requiresAdminOnly
            ? [
                { text: '📝 Ні, створити тікет', callback_data: 'tip_not_helped' },
                {
                  text: this.telegramService.getCancelButtonText(),
                  callback_data: 'cancel_ticket',
                },
              ]
            : [
                { text: '✅ Допомогло', callback_data: 'tip_helped' },
                { text: '📝 Ні, створити тікет', callback_data: 'tip_not_helped' },
                {
                  text: this.telegramService.getCancelButtonText(),
                  callback_data: 'cancel_ticket',
                },
              ]
        );

        await this.telegramService.sendMessage(chatId, articleText, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        });

        const attachments = Array.isArray(article.attachments) ? article.attachments : [];
        for (const att of attachments) {
          const fp = att && (att.filePath || att.filepath);
          if (!fp || typeof fp !== 'string') {
            continue;
          }
          const fullPath = resolveKbAttachmentPath(fp);
          if (!fullPath) {
            logger.warn('KB: файл не знайдено', {
              filePath: fp,
              filename: path.basename(fp),
              kbUploadsPath,
            });
            continue;
          }
          const name = path.basename(fp);
          try {
            const type = String(att.type || '').toLowerCase();
            const stream = fs.createReadStream(fullPath);
            const fileOptions = {
              filename: name,
              contentType: getContentTypeForKbFile(name, type),
            };
            try {
              if (type === 'image') {
                await this.telegramService.bot.sendPhoto(chatId, stream, {}, fileOptions);
              } else if (type === 'video') {
                await this.telegramService.bot.sendVideo(chatId, stream, {}, fileOptions);
              }
            } finally {
              if (stream.destroy) {
                stream.destroy();
              }
            }
          } catch (err) {
            logger.warn('KB: не вдалося відправити вкладений файл', { fullPath, err: err.message });
          }
        }
        return;
      }

      // [KB ВИМКНЕНО] Середній score — "Можливо, ви мали на увазі:" з кнопками вибору статті
      // eslint-disable-next-line no-constant-condition
      if (false && result.kbArticleCandidates && result.kbArticleCandidates.length > 0) {
        const candidates = result.kbArticleCandidates.slice(0, 5);
        const keyboard = candidates.map(c => [
          {
            text:
              (c.title && c.title.length > 60 ? c.title.slice(0, 57) + '…' : c.title) || 'Стаття',
            callback_data: 'kb_article_' + (c.id || ''),
          },
        ]);
        keyboard.push(
          [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
          [{ text: 'Головне меню', callback_data: 'back_to_menu' }]
        );
        const hintText =
          'Можливо, ви мали на увазі одну з цих статей. Оберіть статтю — або «Створити тікет», якщо допомога з бази знань не підходить.';
        await this.telegramService.sendMessage(chatId, hintText, {
          reply_markup: { inline_keyboard: keyboard },
        });
        session.dialog_history.push({ role: 'assistant', content: hintText });
        botConversationService.appendMessage(chatId, user, 'assistant', hintText).catch(() => {});
        return;
      }

      // Якщо є quickSolution (наприклад інструкція "як роздрукувати Word") — та сама логіка: Допомогло / Ні, створити тікет / Скасувати
      const quickSol = result.quickSolution && String(result.quickSolution).trim();
      if (quickSol) {
        const normalized = TelegramUtils.normalizeQuickSolutionSteps(quickSol);
        session.dialog_history.push({ role: 'assistant', content: normalized });
        session.step = 'awaiting_tip_feedback';
        botConversationService.appendMessage(chatId, user, 'assistant', normalized).catch(() => {});

        const requiresAdminOnly = quickSolutionRequiresAdminOnly(normalized);
        const keyboard = TelegramUtils.inlineKeyboardTwoPerRow(
          requiresAdminOnly
            ? [
                { text: '📝 Ні, створити тікет', callback_data: 'tip_not_helped' },
                {
                  text: this.telegramService.getCancelButtonText(),
                  callback_data: 'cancel_ticket',
                },
              ]
            : [
                { text: '✅ Допомогло', callback_data: 'tip_helped' },
                { text: '📝 Ні, створити тікет', callback_data: 'tip_not_helped' },
                {
                  text: this.telegramService.getCancelButtonText(),
                  callback_data: 'cancel_ticket',
                },
              ]
        );

        await this.telegramService.sendMessage(chatId, normalized, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        });
        return;
      }
      // Інформаційна відповідь без заявки (наприклад графік підтримки, контакт) — відправити одразу
      const offTopic = result.offTopicResponse && String(result.offTopicResponse).trim();
      if (offTopic) {
        if (result.duplicateTicketId && user?._id) {
          try {
            const Ticket = require('../models/Ticket');
            const dupTicket = await Ticket.findById(result.duplicateTicketId);
            if (dupTicket && !dupTicket.watchers.some(w => String(w) === String(user._id))) {
              await dupTicket.addWatcher(user._id);
              logger.info('Користувача додано у копію дубліката', {
                ticketId: dupTicket._id,
                userId: user._id,
              });
            }
          } catch (err) {
            logger.warn('Не вдалося додати watcher до дубліката', { err: err?.message });
          }
        }
        const msg = offTopic.slice(0, 500);
        await this.telegramService.sendMessage(chatId, msg, {
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
              { text: 'Створити тікет', callback_data: 'create_ticket' },
              { text: 'Головне меню', callback_data: 'back_to_menu' },
            ]),
          },
        });
        session.dialog_history.push({ role: 'assistant', content: msg });
        botConversationService.appendMessage(chatId, user, 'assistant', msg).catch(() => {});
        return;
      }

      const telegramId = String(user?.telegramId ?? user?.telegramChatId ?? chatId);
      const textLower = (text || '').toLowerCase().trim();
      const isExchangeRateRequest =
        textLower.includes('курс') ||
        textLower.includes('долар') ||
        textLower.includes('євро') ||
        textLower.includes('валюта') ||
        textLower.includes('usd');
      const isWeatherRequest = textLower.includes('погода');
      const userCity =
        session.userContext && session.userContext.userCity
          ? String(session.userContext.userCity).trim()
          : '';

      if (isExchangeRateRequest) {
        if (!this.canMakeInternetRequest(telegramId)) {
          await this.telegramService.sendMessage(
            chatId,
            `Запити інформації з інтернету (курс, погода) для вас недоступні.\n\nЯкщо є технічна проблема — опишіть її, і я допоможу оформити заявку.`,
            {
              reply_markup: {
                inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                  { text: 'Створити тікет', callback_data: 'create_ticket' },
                  { text: 'Головне меню', callback_data: 'back_to_menu' },
                ]),
              },
            }
          );
          this.telegramService.userSessions.delete(chatId);
          return;
        }
        await this.telegramService.sendTyping(chatId);
        const nbu = await this.fetchNbuUsdRate();
        if (nbu) {
          this.recordInternetRequest(telegramId);
          const rateText = nbu.date ? `Курс USD за ${nbu.date}` : 'Курс USD (НБУ)';
          await this.telegramService.sendMessage(
            chatId,
            `💵 <b>${TelegramUtils.escapeHtml(rateText)}:</b> ${nbu.rate.toFixed(2)} грн\n\nЯкщо потрібна допомога з тікетом — пиши.`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                  { text: 'Створити тікет', callback_data: 'create_ticket' },
                  { text: 'Головне меню', callback_data: 'back_to_menu' },
                ]),
              },
            }
          );
        } else {
          const msg =
            result.offTopicResponse && String(result.offTopicResponse).trim()
              ? String(result.offTopicResponse).trim().slice(0, 500)
              : 'Зараз не вдалося отримати курс. Спробуй пізніше або напиши, якщо є технічна проблема — допоможу з тікетом.';
          await this.telegramService.sendMessage(chatId, msg, {
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: 'Створити тікет', callback_data: 'create_ticket' },
                { text: 'Головне меню', callback_data: 'back_to_menu' },
              ]),
            },
          });
        }
        this.telegramService.userSessions.delete(chatId);
        return;
      }

      if (isWeatherRequest) {
        if (!userCity || userCity.toLowerCase() === 'не вказано') {
          await this.telegramService.sendMessage(
            chatId,
            'Не знаю ваше місто. Вкажіть місто в профілі — тоді зможу показати погоду для вас.\n\nЯкщо є технічна проблема — опишіть її, допоможу з тікетом.',
            {
              reply_markup: {
                inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                  { text: 'Створити тікет', callback_data: 'create_ticket' },
                  { text: 'Головне меню', callback_data: 'back_to_menu' },
                ]),
              },
            }
          );
          this.telegramService.userSessions.delete(chatId);
          return;
        }
        if (!this.canMakeInternetRequest(telegramId)) {
          await this.telegramService.sendMessage(
            chatId,
            `Запити інформації з інтернету (курс, погода) для вас недоступні.\n\nЯкщо є технічна проблема — опишіть її, і я допоможу оформити заявку.`,
            {
              reply_markup: {
                inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                  { text: 'Створити тікет', callback_data: 'create_ticket' },
                  { text: 'Головне меню', callback_data: 'back_to_menu' },
                ]),
              },
            }
          );
          this.telegramService.userSessions.delete(chatId);
          return;
        }
        await this.telegramService.sendTyping(chatId);
        const weather = await this.fetchWeatherForCity(userCity);
        if (weather) {
          this.recordInternetRequest(telegramId);
          await this.telegramService.sendMessage(
            chatId,
            `🌤 <b>Погода в ${TelegramUtils.escapeHtml(weather.city)}:</b> ${TelegramUtils.escapeHtml(weather.description)}, ${Math.round(weather.temp)}°C\n\nЯкщо потрібна допомога з тікетом — пиши.`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                  { text: 'Створити тікет', callback_data: 'create_ticket' },
                  { text: 'Головне меню', callback_data: 'back_to_menu' },
                ]),
              },
            }
          );
        } else {
          const msg =
            result.offTopicResponse && String(result.offTopicResponse).trim()
              ? String(result.offTopicResponse).trim().slice(0, 500)
              : `Зараз не вдалося отримати погоду для ${userCity}. Спробуй пізніше або напиши, якщо є технічна проблема — допоможу з тікетом.`;
          await this.telegramService.sendMessage(chatId, msg, {
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: 'Створити тікет', callback_data: 'create_ticket' },
                { text: 'Головне меню', callback_data: 'back_to_menu' },
              ]),
            },
          });
        }
        this.telegramService.userSessions.delete(chatId);
        return;
      }

      if (!this.canMakeInternetRequest(telegramId)) {
        await this.telegramService.sendMessage(
          chatId,
          `Запити інформації з інтернету (курс, погода) для вас недоступні.\n\nЯкщо є технічна проблема — опишіть її, і я допоможу оформити заявку.`,
          {
            reply_markup: {
              inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
                { text: 'Створити тікет', callback_data: 'create_ticket' },
                { text: 'Головне меню', callback_data: 'back_to_menu' },
              ]),
            },
          }
        );
        this.telegramService.userSessions.delete(chatId);
        return;
      }
      // Fallback: якщо KB повернув question але текст — технічна проблема (принтер, інтернет) — використати Fast-Track
      // Та сама логіка кнопок, що й для AI: Допомогло / Ні, створити тікет / Скасувати
      const aiEnhancedService = require('./aiEnhancedService');
      const fastTrack = aiEnhancedService.findQuickSolution(text || '');
      if (fastTrack && fastTrack.hasQuickFix && fastTrack.solution) {
        const normalized = TelegramUtils.normalizeQuickSolutionSteps(fastTrack.solution);
        session.dialog_history.push({ role: 'assistant', content: normalized });
        session.step = 'awaiting_tip_feedback';
        botConversationService.appendMessage(chatId, user, 'assistant', normalized).catch(() => {});

        const requiresAdminOnly = quickSolutionRequiresAdminOnly(normalized);
        const keyboard = TelegramUtils.inlineKeyboardTwoPerRow(
          requiresAdminOnly
            ? [
                { text: '📝 Ні, створити тікет', callback_data: 'tip_not_helped' },
                {
                  text: this.telegramService.getCancelButtonText(),
                  callback_data: 'cancel_ticket',
                },
              ]
            : [
                { text: '✅ Допомогло', callback_data: 'tip_helped' },
                { text: '📝 Ні, створити тікет', callback_data: 'tip_not_helped' },
                {
                  text: this.telegramService.getCancelButtonText(),
                  callback_data: 'cancel_ticket',
                },
              ]
        );

        await this.telegramService.sendMessage(chatId, normalized, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        });
        return;
      }

      this.recordInternetRequest(telegramId);
      const msg =
        result.offTopicResponse && String(result.offTopicResponse).trim()
          ? String(result.offTopicResponse).trim().slice(0, 500)
          : await aiFirstLineService.generateConversationalResponse(
              session.dialog_history,
              'ask_for_details_fallback',
              session.userContext,
              result.emotionalTone
            );
      await this.telegramService.sendMessage(chatId, msg, {
        reply_markup: {
          inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
            { text: 'Створити тікет', callback_data: 'create_ticket' },
            { text: 'Головне меню', callback_data: 'back_to_menu' },
          ]),
        },
      });
      this.telegramService.userSessions.delete(chatId);
      return;
    }

    let quickSolutionText = result.quickSolution && String(result.quickSolution).trim();
    if (quickSolutionText) {
      quickSolutionText = TelegramUtils.normalizeQuickSolutionSteps(quickSolutionText);
    }

    // Special handling for auto-ticket quick solutions (Fast-Track)
    if (result.autoTicket && quickSolutionText) {
      await this.telegramService.sendMessage(chatId, quickSolutionText, { parse_mode: 'HTML' });
      // Fall through to ticket confirmation block
    }

    const skipQuickSolution = !!session.afterTipNotHelped;
    if (session.afterTipNotHelped) {
      delete session.afterTipNotHelped;
    }

    // Відображаємо швидке рішення, якщо воно є, навіть якщо потрібна додаткова інформація.
    // AI сам має включити питання в quickSolution, якщо needsMoreInfo: true (згідно з промптом).
    if (
      result.isTicketIntent &&
      quickSolutionText &&
      !result.autoTicket && // Skip this block if it's an auto-ticket
      session.step !== 'awaiting_tip_feedback' &&
      !skipQuickSolution
    ) {
      // Якщо AI каже, що треба більше інфо, оновлюємо стан сесії для прийому фото/інфо
      if (result.needsMoreInfo) {
        const missing = result.missingInfo || [];
        session.awaitingComputerAccessPhoto = missing.some(m =>
          String(m).includes('фото доступу до ПК')
        );
        session.awaitingErrorPhoto = missing.some(m => String(m).includes('фото помилки'));
        session.lastMissingInfo = missing;

        let messageToSend = quickSolutionText;
        if (session.awaitingErrorPhoto) {
          messageToSend =
            messageToSend +
            '\n\n📸 Надішліть, будь ласка, фото помилки (скріншот) — це допоможе швидше вирішити проблему.';
        }
        session.step = 'gathering_information';
        session.dialog_history.push({ role: 'assistant', content: messageToSend });

        const gatherButtons = [];
        if (session.awaitingComputerAccessPhoto) {
          gatherButtons.push({
            text: '⏭️ Пропустити (без фото доступу)',
            callback_data: 'skip_computer_access_photo',
          });
        } else if (session.awaitingErrorPhoto) {
          gatherButtons.push({
            text: '⏭️ Пропустити (без фото помилки)',
            callback_data: 'skip_error_photo',
          });
        }
        gatherButtons.push({
          text: this.telegramService.getCancelButtonText(),
          callback_data: 'cancel_ticket',
        });

        await this.telegramService.sendMessage(chatId, messageToSend, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow(gatherButtons),
          },
        });
        // [KB ВИМКНЕНО] if (result.requestType === 'appeal' || session.cachedRequestType === 'appeal') {
        //   await this._sendKbHintForAppeal(chatId, text, session);
        // }
        return;
      }

      session.dialog_history.push({ role: 'assistant', content: quickSolutionText });
      session.step = 'awaiting_tip_feedback';

      const requiresAdminOnly = quickSolutionRequiresAdminOnly(quickSolutionText);
      const keyboard = TelegramUtils.inlineKeyboardTwoPerRow(
        requiresAdminOnly
          ? [
              { text: '📝 Ні, створити тікет', callback_data: 'tip_not_helped' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]
          : [
              { text: '✅ Допомогло', callback_data: 'tip_helped' },
              { text: '📝 Ні, створити тікет', callback_data: 'tip_not_helped' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]
      );

      await this.telegramService.sendMessage(chatId, quickSolutionText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
      return;
    }

    if (!result.needsMoreInfo && (result.confidence || 0) >= CONFIDENCE_THRESHOLD) {
      const shown = await this._showTicketConfirmationFromDialog(chatId, session, user);
      if (shown) {
        return;
      }
    }

    if (
      result.needsMoreInfo &&
      ((session.ai_attempts || 0) >= MAX_AI_ATTEMPTS ||
        (session.ai_questions_count || 0) >= MAX_AI_QUESTIONS)
    ) {
      session.mode = 'choosing';
      const count = session.ai_questions_count || 0;
      await this.telegramService.sendMessage(
        chatId,
        `Я вже ${count} раз(и) уточнював і все ще не до кінця зрозумів. Давай так:\n\n` +
          `Оберіть дію:`,
        {
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
              { text: 'Продовжити зі мною', callback_data: 'ai_continue' },
              { text: 'Заповнити покроково (класика)', callback_data: 'ai_switch_to_classic' },
              { text: 'Скасувати заявку', callback_data: 'cancel_ticket' },
            ]),
          },
        }
      );
      return;
    }

    // Fallback: якщо немає quickSolution але є needsMoreInfo — спробувати Fast-Track для типових проблем (принтер, інтернет)
    if (!quickSolutionText && result.needsMoreInfo && text) {
      const aiEnhancedService = require('./aiEnhancedService');
      const fastTrack = aiEnhancedService.findQuickSolution(text, session.userContext || {});
      if (fastTrack && fastTrack.hasQuickFix && fastTrack.solution) {
        quickSolutionText = fastTrack.solution;
        if (quickSolutionText) {
          quickSolutionText = TelegramUtils.normalizeQuickSolutionSteps(quickSolutionText);
          const missing = result.missingInfo || [];
          session.awaitingErrorPhoto = missing.some(m => String(m).includes('фото помилки'));
          let messageToSend = quickSolutionText;
          if (session.awaitingErrorPhoto) {
            messageToSend += '\n\n📸 Надішліть, будь ласка, фото помилки (скріншот).';
          }
          session.step = 'gathering_information';
          session.lastMissingInfo = missing;
          const gatherButtons = [
            { text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' },
            { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
          ];
          if (session.awaitingErrorPhoto) {
            gatherButtons.unshift({
              text: '⏭️ Пропустити (без фото помилки)',
              callback_data: 'skip_error_photo',
            });
          }
          await this.telegramService.sendMessage(chatId, messageToSend, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow(gatherButtons) },
          });
          session.dialog_history.push({ role: 'assistant', content: messageToSend });
          return;
        }
      }
    }

    session.ai_questions_count = (session.ai_questions_count || 0) + 1;
    await this.telegramService.sendTyping(chatId);
    let question;
    try {
      question = await aiFirstLineService.generateNextQuestion(
        session.dialog_history,
        result.missingInfo || [],
        session.userContext,
        session.cachedEmotionalTone || 'neutral'
      );
    } catch (err) {
      logger.error('AI: помилка generateNextQuestion', err);
      question = 'Опишіть, будь ласка, проблему детальніше.';
    }
    session.dialog_history.push({ role: 'assistant', content: question });
    botConversationService.appendMessage(chatId, user, 'assistant', question).catch(() => {});

    const missing = result.missingInfo || [];
    session.awaitingComputerAccessPhoto = missing.some(m =>
      String(m).includes('фото доступу до ПК')
    );
    session.awaitingErrorPhoto = missing.some(m => String(m).includes('фото помилки'));
    session.lastMissingInfo = missing;

    if (session.awaitingErrorPhoto) {
      question =
        question +
        '\n\n📸 Надішліть, будь ласка, фото помилки (скріншот) — це допоможе швидше вирішити проблему.';
    }
    const baseButtons = [
      { text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' },
      { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
    ];
    if (session.awaitingComputerAccessPhoto) {
      baseButtons.unshift({
        text: '⏭️ Пропустити (без фото доступу)',
        callback_data: 'skip_computer_access_photo',
      });
    } else if (session.awaitingErrorPhoto) {
      baseButtons.unshift({
        text: '⏭️ Пропустити (без фото помилки)',
        callback_data: 'skip_error_photo',
      });
    }
    await this.telegramService.sendMessage(chatId, question, {
      reply_markup: { inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow(baseButtons) },
    });
    // [KB ВИМКНЕНО] if (result.requestType === 'appeal' || session.cachedRequestType === 'appeal') {
    //   await this._sendKbHintForAppeal(chatId, text, session);
    // }
  }

  async handlePhotoInAiMode(chatId, photos, caption, session, user) {
    if (!session.dialog_history) {
      session.dialog_history = [];
    }
    const lastUserMsg = session.dialog_history.filter(m => m.role === 'user').pop();
    const problemDescription =
      (caption && String(caption).trim()) ||
      (lastUserMsg && lastUserMsg.content) ||
      'Користувач надіслав фото по технічній проблемі.';
    session.dialog_history.push({
      role: 'user',
      content: `[Фото] ${caption || problemDescription}`,
    });

    await this.telegramService.sendTyping(chatId);
    if (!photos || photos.length === 0) {
      await this.telegramService.sendMessage(
        chatId,
        'Не вдалося отримати фото. Спробуйте надіслати ще раз або опишіть проблему текстом.'
      );
      return;
    }
    const photo = photos[photos.length - 1];
    const fileId = photo.file_id;

    // Після "Ні, створити тікет" користувач надіслав фото помилки — додаємо аналіз до діалогу і переходимо до підтвердження заявки
    if (session.step === 'awaiting_error_details_after_not_helped') {
      let localPathErr = null;
      try {
        const file = await this.telegramService.bot.getFile(fileId);
        if (file && file.file_path) {
          const ext = path.extname(file.file_path).toLowerCase() || '.jpg';
          localPathErr = await this.telegramService.downloadTelegramFileByFileId(fileId, ext);
          const analysisResultErr = await aiFirstLineService.analyzePhoto(
            localPathErr,
            problemDescription,
            session.userContext
          );
          const analysisTextErr =
            analysisResultErr?.text ||
            (typeof analysisResultErr === 'string' ? analysisResultErr : null);
          if (analysisTextErr && analysisTextErr.trim()) {
            session.dialog_history.push({ role: 'assistant', content: analysisTextErr });
            botConversationService
              .appendMessage(chatId, user, 'assistant', analysisTextErr)
              .catch(() => {});
          }
        }
      } catch (err) {
        logger.error('AI: помилка analyzePhoto після tip_not_helped', err);
      } finally {
        try {
          if (localPathErr && fs.existsSync(localPathErr)) {
            fs.unlinkSync(localPathErr);
          }
        } catch (_) {
          /* ignore cleanup error */
        }
      }
      await this._showTicketConfirmationFromDialog(chatId, session, user);
      return;
    }

    if (session.awaitingComputerAccessPhoto && user && user._id) {
      session.awaitingComputerAccessPhoto = false;
      const result = await this.telegramService._saveComputerAccessPhotoFromTelegram(
        chatId,
        fileId,
        user
      );
      if (!result || !result.success) {
        await this.telegramService.sendMessage(
          chatId,
          'Завантаження не вдалося — спробуйте прикріпити фото доступу ще раз.'
        );
        return;
      }
      if (session.userContext) {
        session.userContext.hasComputerAccessPhoto = true;
        if (result.analysis) {
          session.userContext.computerAccessAnalysis = result.analysis;
        }
      }
      let confirmText =
        "✅ Фото доступу до комп'ютера збережено у вашому профілі. Адмін зможе переглянути його в картці користувача.";
      if (result.analysis) {
        confirmText += `\n\n📋 Розпізнано: ${result.analysis}`;
      }
      confirmText +=
        '\n\nМожете продовжити опис проблеми або натиснути нижче для оформлення заявки.';
      await this.telegramService.sendMessage(chatId, confirmText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Сформувати заявку', callback_data: 'ai_generate_summary' }],
            [{ text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' }],
            [{ text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' }],
          ],
        },
      });
      return;
    }

    // Якщо це фото помилки або просто фото під час збору інфо
    if (session.awaitingErrorPhoto) {
      session.awaitingErrorPhoto = false;
    }

    let localPath;
    try {
      const file = await this.telegramService.bot.getFile(fileId);
      if (!file || !file.file_path) {
        await this.telegramService.sendMessage(chatId, 'Помилка отримання фото. Спробуйте ще раз.');
        return;
      }
      const ext = path.extname(file.file_path).toLowerCase() || '.jpg';
      localPath = await this.telegramService.downloadTelegramFileByFileId(fileId, ext);
    } catch (err) {
      logger.error('Помилка завантаження фото в AI-режимі', { chatId, err: err.message });
      const errorMsg = session.awaitingErrorPhoto
        ? 'Завантаження не вдалося — спробуйте прикріпити фото помилки ще раз.'
        : 'Завантаження не вдалося — спробуйте прикріпити фото ще раз.';
      await this.telegramService.sendMessage(chatId, errorMsg);
      return;
    }
    let analysisResult = null;
    let photoMetadata = null;
    try {
      analysisResult = await aiFirstLineService.analyzePhoto(
        localPath,
        problemDescription,
        session.userContext
      );
    } catch (err) {
      logger.error('AI: помилка analyzePhoto', err);
    } finally {
      try {
        if (localPath && fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      } catch (_) {
        // Ignore cleanup error
      }
    }
    const analysisText =
      analysisResult?.text || (typeof analysisResult === 'string' ? analysisResult : null);
    if (analysisResult?.metadata) {
      photoMetadata = analysisResult.metadata;
      session.photoMetadata = photoMetadata;

      // Оновлюємо контекст обладнання, якщо розпізнано модель
      if (photoMetadata.hardwareDetected) {
        if (!session.userContext) {
          session.userContext = {};
        }
        session.userContext.detectedHardware = photoMetadata.hardwareDetected;
        // Також додаємо в summary для промптів, щоб AI бачив це як "вже відоме"
        session.userContext.userEquipmentSummary = photoMetadata.hardwareDetected;
      }

      // Заповнюємо priority і category з metadata щоб getTicketSummary отримав правильні хінти
      const severityToPriority = { critical: 'urgent', high: 'high', medium: 'medium', low: 'low' };
      if (photoMetadata.severity && !session.cachedPriority) {
        session.cachedPriority = severityToPriority[photoMetadata.severity] || 'medium';
      }
      if (!session.cachedCategory) {
        const errorType = photoMetadata.errorType || '';
        const sw = (photoMetadata.softwareDetected || '').toLowerCase();
        if (/syrve|iiko|1с|bas|бас|медок|бухгалт/i.test(sw)) {
          session.cachedCategory = 'Software';
        } else if (/server_unavailable|network/.test(errorType)) {
          session.cachedCategory = 'Network';
        } else if (/license|driver|software_crash|access/.test(errorType)) {
          session.cachedCategory = 'Software';
        } else if (/hardware/.test(errorType)) {
          session.cachedCategory = 'Hardware';
        }
      }

      logger.info('AI: Photo metadata saved to session', {
        errorType: photoMetadata.errorType,
        softwareDetected: photoMetadata.softwareDetected,
        hardwareDetected: photoMetadata.hardwareDetected,
        actionRequired: photoMetadata.actionRequired,
        cachedPriority: session.cachedPriority,
        cachedCategory: session.cachedCategory,
      });
    }
    if (analysisText && analysisText.trim()) {
      const rawText = analysisText.trim();
      const createTicketDirectly = /\[Дія:\s*створити заявку\]/i.test(rawText);
      const hintOnly = /\[Дія:\s*підказка\]/i.test(rawText);
      const displayText = rawText
        .replace(/\s*\[Дія:\s*створити заявку\]\s*/gi, '')
        .replace(/\s*\[Дія:\s*підказка\]\s*/gi, '')
        .replace(/\s*\[Дія:\s*уточнення\]\s*/gi, '')
        .trim();
      session.dialog_history.push({ role: 'assistant', content: displayText });
      botConversationService.appendMessage(chatId, user, 'assistant', displayText).catch(() => {});

      const isClarification =
        photoMetadata?.actionRequired === 'clarify' || /\[Дія:\s*уточнення\]/i.test(rawText);

      if (createTicketDirectly) {
        const shown = await this._showTicketConfirmationFromDialog(chatId, session, user);
        if (!shown) {
          const fallback = TelegramUtils.normalizeQuickSolutionSteps(displayText);
          await this.telegramService.sendMessage(chatId, fallback, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📝 Створити тікет', callback_data: 'create_ticket' },
                  { text: '🏠 Головне меню', callback_data: 'back_to_menu' },
                ],
              ],
            },
          });
        }
        return;
      }

      if (hintOnly) {
        session.step = 'awaiting_tip_feedback';
        const normalizedHint = TelegramUtils.normalizeQuickSolutionSteps(displayText);
        await this.telegramService.sendMessage(chatId, normalizedHint, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📝 Створити тікет', callback_data: 'create_ticket' },
                { text: '🏠 Головне меню', callback_data: 'back_to_menu' },
              ],
            ],
          },
        });
        return;
      }

      if (isClarification) {
        session.step = 'gathering_information';
        session.awaitingErrorPhoto = true;
        const normalizedClarify = TelegramUtils.normalizeQuickSolutionSteps(displayText || rawText);
        await this.telegramService.sendMessage(chatId, normalizedClarify, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
              { text: '✏️ Описати текстом', callback_data: 'ai_switch_to_classic' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]),
          },
        });
        return;
      }

      session.step = 'awaiting_tip_feedback';
      const normalizedPhotoText = TelegramUtils.normalizeQuickSolutionSteps(displayText || rawText);
      const requiresAdminOnly = quickSolutionRequiresAdminOnly(displayText || rawText);
      const photoKeyboard = TelegramUtils.inlineKeyboardTwoPerRow(
        requiresAdminOnly
          ? [
              { text: '📝 Ні, створити тікет', callback_data: 'tip_not_helped' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]
          : [
              { text: '✅ Допомогло', callback_data: 'tip_helped' },
              { text: '📝 Ні, створити тікет', callback_data: 'tip_not_helped' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]
      );
      await this.telegramService.sendMessage(chatId, normalizedPhotoText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: photoKeyboard,
        },
      });
    } else {
      // analyzePhoto повернув null — фото не вдалось обробити (Gemini, помилка завантаження тощо)
      session.step = 'gathering_information';
      session.awaitingErrorPhoto = true;
      await this.telegramService.sendMessage(
        chatId,
        '📸 Не вдалося обробити фото. Спробуйте надіслати <b>чіткий скріншот</b> (не фото екрану здалеку), або опишіть проблему текстом.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
              { text: '✏️ Описати текстом', callback_data: 'ai_switch_to_classic' },
              { text: '📝 Створити тікет', callback_data: 'create_ticket' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]),
          },
        }
      );
    }
  }

  /**
   * Формує підсумок заявки з діалогу і показує екран підтвердження (Так, створити тікет / Щось змінити / Скасувати).
   * @returns {Promise<boolean>} true якщо підсумок отримано і повідомлення надіслано
   */
  async _showTicketConfirmationFromDialog(chatId, session, user) {
    await this.telegramService.sendTyping(chatId);
    const summary = await aiFirstLineService.getTicketSummary(
      session.dialog_history,
      session.userContext,
      session.cachedPriority,
      session.cachedCategory
    );
    if (!summary) {
      await this.telegramService.sendMessage(
        chatId,
        'Не вдалося сформувати тікет автоматично. Спробуйте описати проблему ще раз або заповніть вручну.',
        {
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
              { text: '✏️ Заповнити вручну', callback_data: 'ai_switch_to_classic' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]),
          },
        }
      );
      return false;
    }
    session.step = 'confirm_ticket';
    session.ticketDraft = {
      createdBy: user._id,
      title: summary.title,
      description: summary.description,
      priority: summary.priority,
      subcategory: summary.category,
      type: 'problem',
    };
    const msg = `✅ <b>Перевірте, чи все правильно</b>\n\n📌 <b>Заголовок:</b>\n${TelegramUtils.escapeHtml(summary.title)}\n\n📝 <b>Опис:</b>\n${TelegramUtils.escapeHtml(summary.description)}\n\n📊 <b>Категорія:</b> ${TelegramUtils.escapeHtml(summary.category)}\n⚡ <b>Пріоритет:</b> ${TelegramUtils.escapeHtml(summary.priority)}\n\nВсе правильно?`;
    await this.telegramService.sendMessage(chatId, msg, {
      reply_markup: {
        inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
          { text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' },
          { text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' },
          { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
        ]),
      },
      parse_mode: 'HTML',
    });
    return true;
  }

  /**
   * Після натискання "Пропустити (створити заявку без додатків)" — перейти до підтвердження заявки без нового опису/фото.
   */
  async proceedToTicketConfirmationAfterNotHelped(chatId, user) {
    const session = this.telegramService.userSessions.get(chatId);
    if (!session || session.step !== 'awaiting_error_details_after_not_helped') {
      return;
    }
    await this._showTicketConfirmationFromDialog(chatId, session, user);
  }

  async handleVoice(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    if (!msg.voice?.file_id) {
      await this.telegramService.sendMessage(
        chatId,
        'Не вдалося отримати голосове повідомлення. Спробуйте ще раз або опишіть проблему текстом.'
      );
      return;
    }
    await this.telegramService.sendTyping(chatId);
    let localPath;
    try {
      localPath = await this.telegramService.downloadTelegramFileByFileId(
        msg.voice.file_id,
        '.ogg'
      );
    } catch (err) {
      logger.error('Помилка завантаження голосового файлу', { err: err.message });
      await this.telegramService.sendMessage(
        chatId,
        'Не вдалося завантажити голосове. Спробуйте надіслати текстом або /create для створення заявки.'
      );
      return;
    }
    let text = null;
    try {
      text = await aiFirstLineService.transcribeVoiceToText(localPath);
    } finally {
      try {
        if (localPath && fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      } catch (_) {
        // Ignore cleanup error
      }
    }
    if (!text || String(text).trim().length === 0) {
      await this.telegramService.sendMessage(
        chatId,
        'Не вдалося розпізнати мову. Напишіть, будь ласка, проблему текстом або спробуйте ще раз записати голосове.'
      );
      return;
    }
    const syntheticMsg = {
      chat: msg.chat,
      from: msg.from || { id: userId },
      text: text.trim(),
    };
    await this.telegramService.handleTextMessage(syntheticMsg);
  }

  async handleAIChat(msg, user) {
    const chatId = msg.chat.id;
    await this.telegramService.sendMessage(
      chatId,
      'Для створення заявки використайте команду /create.'
    );
    await this.telegramService.showUserDashboard(chatId, user);
  }

  async handleCheckTokensCallback(chatId, user) {
    try {
      const telegramIdStr = String(user?.telegramId ?? user?.telegramChatId ?? chatId);
      if (telegramIdStr !== TelegramAIService.INTERNET_REQUESTS_EXEMPT_TELEGRAM_ID) {
        await this.telegramService.sendMessage(chatId, '❌ Ця функція недоступна.');
        return;
      }
      const usage = aiFirstLineService.getTokenUsage();
      const settings = await aiFirstLineService.getAISettings();
      const limit =
        settings && typeof settings.monthlyTokenLimit === 'number' && settings.monthlyTokenLimit > 0
          ? settings.monthlyTokenLimit
          : 0;
      const monthlyTotal = usage.monthlyTotalTokens || 0;
      let msg =
        `🔢 <b>Використання токенів AI (OpenAI)</b>\n\n` +
        `📥 Вхідні (prompt): ${usage.promptTokens.toLocaleString()}\n` +
        `📤 Вихідні (completion): ${usage.completionTokens.toLocaleString()}\n` +
        `📊 Всього (з перезапуску): ${usage.totalTokens.toLocaleString()}\n` +
        `🔄 Запитів: ${usage.requestCount}\n\n` +
        `📅 <b>Цього місяця (${usage.monthlyMonth || '—'}):</b> ${monthlyTotal.toLocaleString()} токенів`;
      if (limit > 0) {
        const remaining = Math.max(0, limit - monthlyTotal);
        msg +=
          `\n\n📌 <b>Ваш місячний ліміт:</b> ${limit.toLocaleString()}\n` +
          `✅ <b>Залишилось по квоті:</b> ${remaining.toLocaleString()} токенів`;
      }
      const topUp =
        settings && typeof settings.topUpAmount === 'number' && settings.topUpAmount > 0
          ? settings.topUpAmount
          : 0;
      const balance =
        settings && typeof settings.remainingBalance === 'number'
          ? settings.remainingBalance
          : null;
      if (topUp > 0 || (balance !== null && balance >= 0)) {
        msg += '\n\n💰 <b>По сумі:</b>';
        if (topUp > 0) {
          msg += ` поповнення $${topUp.toFixed(2)}`;
        }
        if (balance !== null && balance >= 0) {
          msg += (topUp > 0 ? ' |' : '') + ` залишок $${Number(balance).toFixed(2)}`;
        }
      }
      msg += `\n\n<i>Лічильник сесії — з перезапуску сервера. Місячний — зберігається.</i>`;
      await this.telegramService.sendMessage(chatId, msg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Скинути лічильник', callback_data: 'reset_tokens' }],
            [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }],
          ],
        },
      });
    } catch (error) {
      logger.error('Помилка handleCheckTokensCallback:', error);
      await this.telegramService.sendMessage(chatId, 'Виникла помилка при отриманні даних.');
    }
  }

  async handleCheckApiLimitCallback(chatId, user) {
    try {
      const isAdmin =
        user.role === 'admin' || user.role === 'super_admin' || user.role === 'administrator';
      if (!isAdmin) {
        await this.telegramService.sendMessage(
          chatId,
          `❌ <b>Доступ заборонено</b>\n\nЦя функція доступна тільки адміністраторам.`,
          { parse_mode: 'HTML' }
        );
        return;
      }
      await this.telegramService.sendMessage(chatId, 'AI інтеграція вимкнена.', {
        reply_markup: {
          inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
        },
      });
    } catch (error) {
      logger.error('Помилка handleCheckApiLimitCallback:', error);
      await this.telegramService.sendMessage(chatId, 'Виникла помилка.', {
        parse_mode: 'HTML',
      });
    }
  }

  createAIDialog() {
    return null;
  }

  addMessageToAIDialog() {
    return null;
  }

  completeAIDialog() {
    return null;
  }

  findActiveAIDialog() {
    return null;
  }

  async generateSummaryAndShowConfirmation(chatId, user) {
    const session = this.telegramService.userSessions.get(chatId);
    if (!session || !session.dialog_history) {
      await this.telegramService.sendMessage(
        chatId,
        'Не вдалося знайти сесію діалогу. Спробуйте почати знову.'
      );
      return;
    }

    await this.telegramService.sendTyping(chatId);
    let summary;
    try {
      summary = await aiFirstLineService.getTicketSummary(
        session.dialog_history,
        session.userContext
      );
    } catch (err) {
      logger.error('AI: помилка getTicketSummary', err);
    }

    if (summary) {
      session.step = 'confirm_ticket';
      session.ticketDraft = {
        createdBy: user._id,
        title: summary.title,
        description: summary.description,
        priority: summary.priority,
        subcategory: summary.category,
        type: 'problem',
      };
      const msg = `✅ <b>Перевірте, чи все правильно</b>\n\n📌 <b>Заголовок:</b>\n${TelegramUtils.escapeHtml(summary.title)}\n\n📝 <b>Опис:</b>\n${TelegramUtils.escapeHtml(summary.description)}\n\n📊 <b>Категорія:</b> ${TelegramUtils.escapeHtml(summary.category)}\n⚡ <b>Пріоритет:</b> ${TelegramUtils.escapeHtml(summary.priority)}\n\nВсе правильно?`;
      await this.telegramService.sendMessage(chatId, msg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
            [{ text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' }],
            [{ text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' }],
          ],
        },
      });
    } else {
      await this.telegramService.sendMessage(
        chatId,
        'Не вдалося автоматично сформувати заявку. Будь ласка, спробуйте «Заповнити по-старому» або опишіть проблему ще раз.',
        {
          reply_markup: {
            inline_keyboard: TelegramUtils.inlineKeyboardTwoPerRow([
              { text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' },
              { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
            ]),
          },
        }
      );
    }
  }
}

module.exports = TelegramAIService;
