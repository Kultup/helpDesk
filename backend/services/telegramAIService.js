const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { kbUploadsPath } = require('../config/paths');
const aiFirstLineService = require('./aiFirstLineService');
const botConversationService = require('./botConversationService');
const TelegramUtils = require('./telegramUtils');

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
   */
  async _sendKbHintForAppeal(chatId, query) {
    const q = (query || '').trim();
    if (!q) {
      return;
    }
    try {
      const kbSearchService = require('./kbSearchService');
      const hintArticle = await kbSearchService.findBestMatchForBot(q);
      if (!hintArticle) {
        return;
      }
      const title = hintArticle.title || 'Стаття';
      const content = (hintArticle.content && String(hintArticle.content).trim()) || '';
      const excerpt =
        content.length > 0
          ? content.slice(0, 250).replace(/\n+/g, ' ').trim() + (content.length > 250 ? '…' : '')
          : '';
      const hintMsg = excerpt
        ? `💡 Можливо, вам допоможе: «${title}»\n\n${excerpt}`
        : `💡 Можливо, вам допоможе стаття з бази знань: «${title}»`;
      await this.telegramService.sendMessage(chatId, hintMsg);
    } catch (err) {
      logger.warn('KB hint for appeal failed', err);
    }
  }

  async handleMessageInAiMode(chatId, text, session, user) {
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
        const msg = `✅ *Перевірте, чи все правильно*\n\n📌 *Заголовок:*\n${d.title || '—'}\n\n📝 *Опис:*\n${d.description || '—'}\n\n📊 *Категорія:* ${d.subcategory || '—'}\n⚡ *Пріоритет:* ${d.priority || '—'}\n\nВсе правильно?`;
        await this.telegramService.sendMessage(chatId, msg, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
              [{ text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' }],
              [
                {
                  text: this.telegramService.getCancelButtonText(),
                  callback_data: 'cancel_ticket',
                },
              ],
            ],
          },
          parse_mode: 'Markdown',
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
        const msg = `✅ *Перевірте, чи все правильно*\n\n📌 *Заголовок:*\n${d.title || '—'}\n\n📝 *Опис:*\n${d.description || '—'}\n\n📊 *Категорія:* ${d.subcategory || '—'}\n⚡ *Пріоритет:* ${d.priority || '—'}\n\nВсе правильно?`;
        await this.telegramService.sendMessage(chatId, msg, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
              [{ text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' }],
              [
                {
                  text: this.telegramService.getCancelButtonText(),
                  callback_data: 'cancel_ticket',
                },
              ],
            ],
          },
          parse_mode: 'Markdown',
        });
        return;
      }
      await this.telegramService.sendMessage(
        chatId,
        'Не вдалося оновити заявку за цим текстом. Спробуйте ще раз або натисніть «Так, створити тікет» з попереднього кроку.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
              [{ text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' }],
              [
                {
                  text: this.telegramService.getCancelButtonText(),
                  callback_data: 'cancel_ticket',
                },
              ],
            ],
          },
        }
      );
      return;
    }

    if (!session.dialog_history) {
      session.dialog_history = [];
    }

    // Phase 1: Forced Detail Gathering for short initial messages
    const textLen = (text || '').trim().length;
    if (session.dialog_history.length === 0 && textLen < 40 && !session.detailsRequested) {
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
      if (helped) {
        session.step = null;
        this.telegramService.userSessions.delete(chatId);
        const filler = await aiFirstLineService.generateConversationalResponse(
          session.dialog_history,
          'accept_thanks',
          session.userContext,
          session.cachedEmotionalTone
        );
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
        let resultAfterTip;
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
              inline_keyboard: [
                [{ text: '⏭️ Пропустити (без фото)', callback_data: 'skip_computer_access_photo' }],
                [{ text: '❌ Скасувати', callback_data: 'cancel_ticket' }],
              ],
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
            session.userContext
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
        const keyboardAfterTip = [
          [{ text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' }],
          [{ text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' }],
        ];
        if (session.awaitingComputerAccessPhoto) {
          keyboardAfterTip.unshift([
            {
              text: '⏭️ Пропустити (без фото доступу)',
              callback_data: 'skip_computer_access_photo',
            },
          ]);
        } else if (session.awaitingErrorPhoto) {
          keyboardAfterTip.unshift([
            { text: '⏭️ Пропустити (без фото помилки)', callback_data: 'skip_error_photo' },
          ]);
        }
        await this.telegramService.sendMessage(chatId, question, {
          reply_markup: { inline_keyboard: keyboardAfterTip },
        });
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
              inline_keyboard: [
                [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
              ],
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
          `💵 *${rateText}:* ${nbu.rate.toFixed(2)} грн\n\nЯкщо потрібна допомога з тікетом — пиши.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
              ],
            },
          }
        );
      } else {
        await this.telegramService.sendMessage(
          chatId,
          'Зараз не вдалося отримати курс. Спробуй пізніше або напиши, якщо є технічна проблема — допоможу з тікетом.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
              ],
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
              inline_keyboard: [
                [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
              ],
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
              inline_keyboard: [
                [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
              ],
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
          `🌤 *Погода в ${weather.city}:* ${weather.description}, ${Math.round(weather.temp)}°C\n\nЯкщо потрібна допомога з тікетом — пиши.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
              ],
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
              inline_keyboard: [
                [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
              ],
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
        webSearchContext
      );
    } catch (err) {
      logger.error('AI: помилка analyzeIntent', err);
      await this.telegramService.sendMessage(
        chatId,
        'Зараз не можу обробити. Спробуйте ще раз або натисніть «Заповнити по-старому».',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' }],
              [
                {
                  text: this.telegramService.getCancelButtonText(),
                  callback_data: 'cancel_ticket',
                },
              ],
            ],
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

    if (!result.isTicketIntent) {
      // Стаття з бази знань — відправити заголовок + текст, потім фото/відео
      if (result.kbArticle && result.kbArticle.title) {
        const article = result.kbArticle;
        const textParts = [article.title];
        if (article.content && String(article.content).trim()) {
          textParts.push(String(article.content).trim());
        }
        const articleText = TelegramUtils.normalizeQuickSolutionSteps(textParts.join('\n\n'));
        await this.telegramService.sendMessage(chatId, articleText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
              [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
            ],
          },
        });
        session.dialog_history.push({ role: 'assistant', content: articleText });
        botConversationService
          .appendMessage(chatId, user, 'assistant', articleText)
          .catch(() => {});

        const attachments = Array.isArray(article.attachments) ? article.attachments : [];
        for (const att of attachments) {
          const fp = att && (att.filePath || att.filepath);
          if (!fp || typeof fp !== 'string') {
            continue;
          }
          const name = path.basename(fp);
          const fullPath = path.join(kbUploadsPath, name);
          try {
            if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
              logger.warn('KB: файл не знайдено', { fullPath, filename: name });
              continue;
            }
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

      // Якщо є quickSolution (наприклад інструкція "як роздрукувати Word") — відправити його, не питати уточнень
      const quickSol = result.quickSolution && String(result.quickSolution).trim();
      if (quickSol) {
        const normalized = TelegramUtils.normalizeQuickSolutionSteps(quickSol);
        await this.telegramService.sendMessage(chatId, normalized, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
              [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
            ],
          },
        });
        session.dialog_history.push({ role: 'assistant', content: normalized });
        botConversationService.appendMessage(chatId, user, 'assistant', normalized).catch(() => {});
        return;
      }
      // Інформаційна відповідь без заявки (наприклад графік підтримки, контакт) — відправити одразу
      const offTopic = result.offTopicResponse && String(result.offTopicResponse).trim();
      if (offTopic) {
        const msg = offTopic.slice(0, 500);
        await this.telegramService.sendMessage(chatId, msg, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
              [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
            ],
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
                inline_keyboard: [
                  [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                  [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
                ],
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
            `💵 *${rateText}:* ${nbu.rate.toFixed(2)} грн\n\nЯкщо потрібна допомога з тікетом — пиши.`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                  [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
                ],
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
              inline_keyboard: [
                [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
              ],
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
                inline_keyboard: [
                  [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                  [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
                ],
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
                inline_keyboard: [
                  [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                  [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
                ],
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
            `🌤 *Погода в ${weather.city}:* ${weather.description}, ${Math.round(weather.temp)}°C\n\nЯкщо потрібна допомога з тікетом — пиши.`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                  [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
                ],
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
              inline_keyboard: [
                [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
              ],
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
              inline_keyboard: [
                [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
                [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
              ],
            },
          }
        );
        this.telegramService.userSessions.delete(chatId);
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
          inline_keyboard: [
            [{ text: 'Створити тікет', callback_data: 'create_ticket' }],
            [{ text: 'Головне меню', callback_data: 'back_to_menu' }],
          ],
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
      await this.telegramService.sendMessage(chatId, quickSolutionText, { parse_mode: 'Markdown' });
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

        const keyboard = [];
        // Якщо ми очікуємо фото, додаємо кнопку пропуску
        if (session.awaitingComputerAccessPhoto) {
          keyboard.push([
            {
              text: '⏭️ Пропустити (без фото доступу)',
              callback_data: 'skip_computer_access_photo',
            },
          ]);
        } else if (session.awaitingErrorPhoto) {
          keyboard.push([
            { text: '⏭️ Пропустити (без фото помилки)', callback_data: 'skip_error_photo' },
          ]);
        }
        keyboard.push([
          { text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' },
        ]);

        await this.telegramService.sendMessage(chatId, messageToSend, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: keyboard,
          },
        });
        if (result.requestType === 'appeal' || session.cachedRequestType === 'appeal') {
          await this._sendKbHintForAppeal(chatId, text);
        }
        return;
      }

      session.dialog_history.push({ role: 'assistant', content: quickSolutionText });
      session.step = 'awaiting_tip_feedback';

      const keyboard = [
        [{ text: '✅ Допомогло', callback_data: 'tip_helped' }],
        [{ text: '❌ Ні, створити тікет', callback_data: 'tip_not_helped' }],
        [{ text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' }],
      ];

      await this.telegramService.sendMessage(chatId, quickSolutionText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
      return;
    }

    if (!result.needsMoreInfo && (result.confidence || 0) >= CONFIDENCE_THRESHOLD) {
      await this.telegramService.sendTyping(chatId);
      const summary = await aiFirstLineService.getTicketSummary(
        session.dialog_history,
        session.userContext,
        session.cachedPriority,
        session.cachedCategory
      );
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
        const msg = `✅ *Перевірте, чи все правильно*\n\n📌 *Заголовок:*\n${summary.title}\n\n📝 *Опис:*\n${summary.description}\n\n📊 *Категорія:* ${summary.category}\n⚡ *Пріоритет:* ${summary.priority}\n\nВсе правильно?`;
        await this.telegramService.sendMessage(chatId, msg, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Так, створити тікет', callback_data: 'confirm_create_ticket' }],
              [{ text: '✏️ Щось змінити', callback_data: 'edit_ticket_info' }],
              [
                {
                  text: this.telegramService.getCancelButtonText(),
                  callback_data: 'cancel_ticket',
                },
              ],
            ],
          },
          parse_mode: 'Markdown',
        });
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
            inline_keyboard: [
              [{ text: 'Продовжити зі мною', callback_data: 'ai_continue' }],
              [{ text: 'Заповнити покроково (класика)', callback_data: 'ai_switch_to_classic' }],
              [{ text: 'Скасувати заявку', callback_data: 'cancel_ticket' }],
            ],
          },
        }
      );
      return;
    }

    session.ai_questions_count = (session.ai_questions_count || 0) + 1;
    await this.telegramService.sendTyping(chatId);
    let question;
    try {
      question = await aiFirstLineService.generateNextQuestion(
        session.dialog_history,
        result.missingInfo || [],
        session.userContext
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
    const keyboard = [
      [{ text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' }],
      [{ text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' }],
    ];
    if (session.awaitingComputerAccessPhoto) {
      keyboard.unshift([
        { text: '⏭️ Пропустити (без фото доступу)', callback_data: 'skip_computer_access_photo' },
      ]);
    } else if (session.awaitingErrorPhoto) {
      keyboard.unshift([
        { text: '⏭️ Пропустити (без фото помилки)', callback_data: 'skip_error_photo' },
      ]);
    }
    await this.telegramService.sendMessage(chatId, question, {
      reply_markup: { inline_keyboard: keyboard },
    });
    if (result.requestType === 'appeal' || session.cachedRequestType === 'appeal') {
      await this._sendKbHintForAppeal(chatId, text);
    }
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
    let analysisText = null;
    try {
      analysisText = await aiFirstLineService.analyzePhoto(
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
    if (analysisText && analysisText.trim()) {
      session.step = 'awaiting_tip_feedback';
      const normalizedPhotoText = TelegramUtils.normalizeQuickSolutionSteps(analysisText.trim());
      session.dialog_history.push({ role: 'assistant', content: analysisText });
      botConversationService.appendMessage(chatId, user, 'assistant', analysisText).catch(() => {});
      await this.telegramService.sendMessage(chatId, normalizedPhotoText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Допомогло', callback_data: 'tip_helped' }],
            [{ text: '❌ Ні, створити тікет', callback_data: 'tip_not_helped' }],
            [{ text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' }],
          ],
        },
      });
    } else {
      session.step = 'awaiting_tip_feedback';
      const filler = await aiFirstLineService.generateConversationalResponse(
        session.dialog_history,
        'ask_for_details_fallback',
        session.userContext,
        session.cachedEmotionalTone
      );
      await this.telegramService.sendMessage(chatId, filler, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Допомогло', callback_data: 'tip_helped' }],
            [{ text: '❌ Ні, створити тікет', callback_data: 'tip_not_helped' }],
            [{ text: this.telegramService.getCancelButtonText(), callback_data: 'cancel_ticket' }],
          ],
        },
      });
    }
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
        `🔢 *Використання токенів AI (OpenAI)*\n\n` +
        `📥 Вхідні (prompt): ${usage.promptTokens.toLocaleString()}\n` +
        `📤 Вихідні (completion): ${usage.completionTokens.toLocaleString()}\n` +
        `📊 Всього (з перезапуску): ${usage.totalTokens.toLocaleString()}\n` +
        `🔄 Запитів: ${usage.requestCount}\n\n` +
        `📅 *Цього місяця (${usage.monthlyMonth || '—'}):* ${monthlyTotal.toLocaleString()} токенів`;
      if (limit > 0) {
        const remaining = Math.max(0, limit - monthlyTotal);
        msg +=
          `\n\n📌 *Ваш місячний ліміт:* ${limit.toLocaleString()}\n` +
          `✅ *Залишилось по квоті:* ${remaining.toLocaleString()} токенів`;
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
        msg += '\n\n💰 *По сумі:*';
        if (topUp > 0) {
          msg += ` поповнення $${topUp.toFixed(2)}`;
        }
        if (balance !== null && balance >= 0) {
          msg += (topUp > 0 ? ' |' : '') + ` залишок $${Number(balance).toFixed(2)}`;
        }
      }
      msg += `\n\n_Лічильник сесії — з перезапуску сервера. Місячний — зберігається._`;
      await this.telegramService.sendMessage(chatId, msg, {
        parse_mode: 'Markdown',
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
          `❌ *Доступ заборонено*\n\nЦя функція доступна тільки адміністраторам.`,
          { parse_mode: 'Markdown' }
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
        parse_mode: 'Markdown',
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
      const msg = `✅ *Перевірте, чи все правильно*\n\n📌 *Заголовок:*\n${summary.title}\n\n📝 *Опис:*\n${summary.description}\n\n📊 *Категорія:* ${summary.category}\n⚡ *Пріоритет:* ${summary.priority}\n\nВсе правильно?`;
      await this.telegramService.sendMessage(chatId, msg, {
        parse_mode: 'Markdown',
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
            inline_keyboard: [
              [{ text: 'Заповнити по-старому', callback_data: 'ai_switch_to_classic' }],
              [
                {
                  text: this.telegramService.getCancelButtonText(),
                  callback_data: 'cancel_ticket',
                },
              ],
            ],
          },
        }
      );
    }
  }
}

module.exports = TelegramAIService;
