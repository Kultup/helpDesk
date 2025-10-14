const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./logger');

/**
 * Генерація випадкового токену
 * @param {number} length - довжина токену
 * @returns {string} - випадковий токен
 */
const generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Генерація унікального імені файлу
 * @param {string} originalName - оригінальне ім'я файлу
 * @returns {string} - унікальне ім'я файлу
 */
const generateUniqueFileName = (originalName) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  const extension = path.extname(originalName);
  const baseName = path.basename(originalName, extension);
  
  return `${baseName}_${timestamp}_${random}${extension}`;
};

/**
 * Перевірка типу файлу
 * @param {string} fileName - ім'я файлу
 * @param {string[]} allowedTypes - дозволені типи файлів
 * @returns {boolean} - чи дозволений тип файлу
 */
const isAllowedFileType = (fileName, allowedTypes = []) => {
  const extension = path.extname(fileName).toLowerCase().substring(1);
  return allowedTypes.includes(extension);
};

/**
 * Форматування розміру файлу
 * @param {number} bytes - розмір в байтах
 * @returns {string} - відформатований розмір
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Створення директорії якщо вона не існує
 * @param {string} dirPath - шлях до директорії
 */
const ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch (error) {
    await fs.mkdir(dirPath, { recursive: true });
  }
};

/**
 * Видалення файлу
 * @param {string} filePath - шлях до файлу
 */
const deleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Файл не існує або помилка видалення
    logger.warn(`Не вдалося видалити файл: ${filePath}`, error.message);
  }
};

/**
 * Пагінація результатів
 * @param {Object} query - Mongoose query
 * @param {number} page - номер сторінки
 * @param {number} limit - кількість елементів на сторінці
 * @returns {Object} - результати з метаданими пагінації
 */
const paginate = async (query, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  
  const [results, total] = await Promise.all([
    query.skip(skip).limit(limit),
    query.model.countDocuments(query.getQuery())
  ]);
  
  const totalPages = Math.ceil(total / limit);
  
  return {
    data: results,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
};

/**
 * Форматування дати для відображення
 * @param {Date} date - дата
 * @param {string} locale - локаль
 * @returns {string} - відформатована дата
 */
const formatDate = (date, locale = 'uk-UA') => {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
};

/**
 * Обчислення часу виконання
 * @param {Date} startDate - дата початку
 * @param {Date} endDate - дата завершення
 * @returns {Object} - час виконання в різних одиницях
 */
const calculateDuration = (startDate, endDate = new Date()) => {
  const diffMs = endDate - startDate;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  return {
    milliseconds: diffMs,
    minutes: diffMinutes,
    hours: diffHours,
    days: diffDays,
    formatted: diffDays > 0 
      ? `${diffDays} дн. ${diffHours % 24} год.`
      : diffHours > 0 
        ? `${diffHours} год. ${diffMinutes % 60} хв.`
        : `${diffMinutes} хв.`
  };
};

/**
 * Санітизація HTML
 * @param {string} html - HTML рядок
 * @returns {string} - очищений HTML
 */
const sanitizeHtml = (html) => {
  if (!html) return '';
  
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
};

/**
 * Генерація slug з тексту
 * @param {string} text - текст
 * @returns {string} - slug
 */
const generateSlug = (text) => {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Перевірка чи є об'єкт порожнім
 * @param {Object} obj - об'єкт
 * @returns {boolean} - чи порожній об'єкт
 */
const isEmpty = (obj) => {
  return obj === null || obj === undefined || 
    (typeof obj === 'object' && Object.keys(obj).length === 0) ||
    (typeof obj === 'string' && obj.trim().length === 0);
};

/**
 * Глибоке клонування об'єкта
 * @param {any} obj - об'єкт для клонування
 * @returns {any} - клонований об'єкт
 */
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
};

/**
 * Затримка виконання
 * @param {number} ms - мілісекунди
 * @returns {Promise} - проміс з затримкою
 */
const delay = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry функція з експоненційним backoff
 * @param {Function} fn - функція для виконання
 * @param {number} maxRetries - максимальна кількість спроб
 * @param {number} baseDelay - базова затримка
 * @returns {Promise} - результат виконання функції
 */
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i === maxRetries) {
        throw lastError;
      }
      
      const delayTime = baseDelay * Math.pow(2, i);
      await delay(delayTime);
    }
  }
};

module.exports = {
  generateToken,
  generateUniqueFileName,
  isAllowedFileType,
  formatFileSize,
  ensureDirectoryExists,
  deleteFile,
  paginate,
  formatDate,
  calculateDuration,
  sanitizeHtml,
  generateSlug,
  isEmpty,
  deepClone,
  delay,
  retryWithBackoff
};