const fs = require('fs');
const path = require('path');
const https = require('https');
const logger = require('../utils/logger');
const { uploadsPath } = require('../config/paths');

/**
 * Утиліти для TelegramService
 * Містить методи для валідації, форматування, екранування та роботи з файлами.
 */
class TelegramUtils {
  // ═══════════════════════════════════════
  //  TEXT PROCESSING & FORMATTING
  // ═══════════════════════════════════════

  /**
   * Нормалізує текст підказки: розбиває кроки на окремі рядки.
   * @param {string} text
   * @returns {string}
   */
  static normalizeQuickSolutionSteps(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }
    const t = text.trim();
    const stepMarkers = t.match(/\d+[.)]\s+/g);
    const hasMultipleSteps = stepMarkers && stepMarkers.length >= 2;
    const looksLikeInstruction = /(спробуйте|перевірте|зробіть|кроки|покроково|по черзі)/i.test(t);
    if (!hasMultipleSteps || !looksLikeInstruction) {
      return text;
    }
    return t
      .replace(/\s+(\d+[.)]\s+)/g, '\n$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Екранування спеціальних символів Markdown для Telegram
   */
  static escapeMarkdown(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }
    // Екрануємо спеціальні символи Markdown: * _ [ ] ( ) ~ ` >
    return text
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>');
  }

  /**
   * Екранування спеціальних символів HTML для Telegram
   */
  static escapeHtml(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Конвертація Markdown на HTML для Telegram (базова)
   */
  static markdownToHtml(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }
    return text
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') // **text** -> <b>text</b>
      .replace(/\*(.+?)\*/g, '<b>$1</b>') // *text* -> <b>text</b>
      .replace(/_(.+?)_/g, '<i>$1</i>') // _text_ -> <i>text</i>
      .replace(/`(.+?)`/g, '<code>$1</code>'); // `text` -> <code>text</code>
  }

  /**
   * Форматує список інструкцій
   */
  static formatInstructionsAsList(instructions) {
    if (!instructions || !instructions.trim()) {
      return null;
    }

    // Розбиваємо по рядках та фільтруємо порожні
    const lines = instructions
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      return null;
    }

    // Додаємо нумерацію
    return lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
  }

  /**
   * Обрізає текст кнопки, якщо він перевищує максимальну довжину (64 символи)
   */
  static truncateButtonText(text, maxLength = 60) {
    if (!text) {
      return '';
    }
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  // ═══════════════════════════════════════
  //  VALIDATION
  // ═══════════════════════════════════════

  static validateName(name) {
    if (!name || typeof name !== 'string') {
      return false;
    }
    const trimmed = name.trim();
    return (
      trimmed.length >= 2 && trimmed.length <= 50 && /^[a-zA-Zа-яА-ЯіІїЇєЄ''\s-]+$/.test(trimmed)
    );
  }

  static validateEmail(email) {
    if (!email || typeof email !== 'string') {
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  static validateLogin(login) {
    if (!login || typeof login !== 'string') {
      return false;
    }
    const trimmed = login.trim();
    // Мінімум 3 символи, максимум 50, тільки латиниця, цифри та підкреслення
    if (trimmed.length < 3 || trimmed.length > 50) {
      return false;
    }
    if (!/[a-zA-Z]/.test(trimmed)) {
      return false;
    }
    if (/[а-яА-ЯіІїЇєЄ]/.test(trimmed)) {
      return false;
    }
    return /^[a-zA-Z0-9_]+$/.test(trimmed);
  }

  static validatePhone(phone) {
    if (!phone || typeof phone !== 'string') {
      return false;
    }
    const phoneRegex = /^\+?[1-9]\d{9,14}$/;
    return phoneRegex.test(phone.replace(/[\s-()]/g, ''));
  }

  static validatePassword(password) {
    if (!password || typeof password !== 'string') {
      return false;
    }
    // Мінімум 6 символів
    return password.length >= 6;
  }

  static validateDepartment(department) {
    if (!department || typeof department !== 'string') {
      return false;
    }
    const trimmed = department.trim();
    return trimmed.length >= 2 && trimmed.length <= 100;
  }

  // ═══════════════════════════════════════
  //  STATUS & PRIORITY HELPERS
  // ═══════════════════════════════════════

  static getStatusText(status) {
    const statusMap = {
      open: 'Відкрито',
      in_progress: 'В роботі',
      resolved: 'Вирішено',
      closed: 'Закрито',
      pending: 'Очікує',
    };
    return statusMap[status] || status;
  }

  static getStatusEmoji(status) {
    const emojiMap = {
      open: '🔓',
      in_progress: '⚙️',
      resolved: '✅',
      closed: '🔒',
      pending: '⏳',
    };
    return emojiMap[status] || '📋';
  }

  static getPriorityText(priority) {
    const priorityMap = {
      low: '🟢 Низький',
      medium: '🟡 Середній',
      high: '🔴 Високий',
      urgent: '🔴🔴 Критичний',
    };
    return priorityMap[priority] || priority;
  }

  static getCategoryEmoji(category) {
    const categoryMap = {
      Hardware: '🖥️',
      Software: '💻',
      Network: '🌐',
      Access: '🔐',
      Other: '📋',
    };
    return categoryMap[category] || '📋';
  }

  static getPriorityPromptText() {
    return (
      `⚡ <b>Оберіть пріоритет тікету</b>\n` + `Пріоритет визначає швидкість обробки вашого запиту.`
    );
  }

  static getCancelButtonText() {
    return '❌ Скасувати';
  }

  /**
   * Формує inline_keyboard з максимум двома кнопками в ряді.
   * @param {Array<Object|Array<Object>>} buttons - плоский масив кнопок або масив рядків (буде зведено через flat)
   * @param {number} [perRow=2]
   * @returns {Array<Array<Object>>} inline_keyboard для reply_markup
   */
  static inlineKeyboardTwoPerRow(buttons, perRow = 2) {
    const flat = Array.isArray(buttons) ? buttons.flat() : [];
    const out = [];
    for (let i = 0; i < flat.length; i += perRow) {
      out.push(flat.slice(i, i + perRow));
    }
    return out;
  }

  // ═══════════════════════════════════════
  //  FILE OPERATIONS
  // ═══════════════════════════════════════

  /**
   * Завантажити файл з Telegram за fileId
   * @param {Object} bot - Інстанс TelegramBot
   * @param {string} fileId
   * @param {string} fileExtension
   * @returns {Promise<string>} Шлях до завантаженого файлу
   */
  static downloadTelegramFileByFileId(bot, fileId, fileExtension = '.jpg') {
    return new Promise((resolve, reject) => {
      if (!bot) {
        reject(new Error('Telegram бот не передано'));
        return;
      }

      const uploadsDir = path.join(uploadsPath, 'telegram-files');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const fileName = `${Date.now()}_file${fileExtension}`;
      const localPath = path.join(uploadsDir, fileName);
      const file = fs.createWriteStream(localPath);

      try {
        const stream = bot.getFileStream(fileId);

        stream.pipe(file);

        file.on('finish', () => {
          file.close();

          const stats = fs.statSync(localPath);
          if (stats.size === 0) {
            fs.unlink(localPath, () => {});
            logger.error('Завантажений файл має нульовий розмір', { fileId, localPath });
            reject(new Error('Завантажений файл має нульовий розмір'));
            return;
          }

          logger.info('Файл успішно завантажено з Telegram через getFileStream', {
            fileId,
            localPath,
            size: stats.size,
          });

          resolve(localPath);
        });

        file.on('error', error => {
          file.close();
          fs.unlink(localPath, () => {});
          logger.error('Помилка запису файлу', { fileId, localPath, error: error.message });
          reject(error);
        });

        stream.on('error', error => {
          file.close();
          fs.unlink(localPath, () => {});
          logger.error('Помилка потоку при завантаженні файлу з Telegram', {
            fileId,
            error: error.message,
          });
          reject(error);
        });
      } catch (error) {
        logger.error('Помилка отримання потоку файлу з Telegram', {
          fileId,
          error: error.message,
          stack: error.stack,
        });
        reject(error);
      }
    });
  }

  /**
   * Завантажити файл з Telegram за filePath
   * @param {string} filePath
   * @param {string} token - Telegram Bot Token (опціонально, береться з env)
   * @returns {Promise<string>} Шлях до завантаженого файлу
   */
  static downloadTelegramFile(filePath, token = process.env.TELEGRAM_BOT_TOKEN) {
    return new Promise((resolve, reject) => {
      const url = `https://api.telegram.org/file/bot${token}/${filePath}`;

      const uploadsDir = path.join(uploadsPath, 'telegram-files');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const fileName = `${Date.now()}_${path.basename(filePath)}`;
      const localPath = path.join(uploadsDir, fileName);
      const file = fs.createWriteStream(localPath);

      https
        .get(url, response => {
          if (response.statusCode !== 200) {
            file.close();
            fs.unlink(localPath, () => {});
            logger.error(`Помилка завантаження файлу з Telegram: статус ${response.statusCode}`, {
              filePath,
              url,
              statusCode: response.statusCode,
            });
            reject(new Error(`Помилка завантаження файлу: ${response.statusCode}`));
            return;
          }

          const contentLength = parseInt(response.headers['content-length'] || '0', 10);

          response.pipe(file);

          file.on('finish', () => {
            file.close();

            const stats = fs.statSync(localPath);
            if (stats.size === 0) {
              fs.unlink(localPath, () => {});
              logger.error('Завантажений файл має нульовий розмір', { filePath, localPath });
              reject(new Error('Завантажений файл має нульовий розмір'));
              return;
            }

            if (contentLength > 0 && stats.size !== contentLength) {
              logger.warn('Розмір завантаженого файлу не відповідає Content-Length', {
                filePath,
                localPath,
                expected: contentLength,
                actual: stats.size,
              });
            }

            logger.info('Файл успішно завантажено з Telegram', {
              filePath,
              localPath,
              size: stats.size,
              contentLength,
            });

            resolve(localPath);
          });

          file.on('error', error => {
            file.close();
            fs.unlink(localPath, () => {});
            logger.error('Помилка запису файлу', { filePath, localPath, error: error.message });
            reject(error);
          });
        })
        .on('error', error => {
          file.close();
          fs.unlink(localPath, () => {});
          logger.error('Помилка HTTP запиту при завантаженні файлу з Telegram', {
            filePath,
            url,
            error: error.message,
          });
          reject(error);
        });
    });
  }
}

module.exports = TelegramUtils;
