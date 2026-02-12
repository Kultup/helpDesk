/**
 * Перевірка релевантності статті KB до запиту користувача за темою.
 * Якщо запит явно про одну тему (наприклад оновлення Windows), а стаття — про іншу (друк),
 * статтю не повертаємо, щоб уникнути хибних відповідей.
 */

const logger = require('./logger');

/** Теми та ключові слова (нижній регістр). Якщо в тексті є таке слово — приписуємо тему. */
const TOPIC_KEYWORDS = {
  windows_update: [
    'оновлення',
    'віндоус',
    'windows',
    'перевстановити',
    'перевстановлення',
    'зависло',
    'update',
    'оновлення зависло',
    'не встановлюється',
    'помилка оновлення',
  ],
  printing: [
    'друк',
    'роздрукувати',
    'принтер',
    'надрукувати',
    'роздрукування',
    'print',
    'printer',
    'як роздрукувати',
    'друкувати',
    'принтер не друкує',
    'документ word',
    'ctrl+p',
  ],
  network: [
    'інтернет',
    'мережа',
    'роутер',
    'wifi',
    'wi-fi',
    'vpn',
    'підключення',
    'інтернет не працює',
    'немає інтернету',
    'мікротік',
    'mikrotik',
  ],
  access: [
    'доступ',
    'пароль',
    'обліковий запис',
    'заблокований',
    'права',
    'вхід',
    'логін',
    'створити користувача',
    'надати доступ',
  ],
  email: ['outlook', 'пошта', 'email', 'листи', 'не відправляє', 'не отримує'],
  hardware: [
    'монітор',
    "комп'ютер",
    'клавіатура',
    'миша',
    'ноутбук',
    'пк не вмикається',
    'каса',
    'обладнання',
  ],
  software: [
    '1с',
    '1c',
    'медок',
    'встановити',
    'програма',
    'застосунок',
    'chrome',
    'хром',
    'помилка програми',
    'не встановлюється',
  ],
  performance: ['гальмує', 'повільно', 'тупить', 'лаг', 'повільний', 'freez'],
};

/**
 * Визначає, які теми присутні в тексті (за ключовими словами).
 * @param {string} text
 * @returns {string[]} масив id тем
 */
function getTopicSignatures(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  const normalized = text.toLowerCase();
  const found = [];
  for (const [topicId, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const hasMatch = keywords.some(kw => {
      if (kw.length <= 2) {
        return false;
      }
      return normalized.includes(kw);
    });
    if (hasMatch) {
      found.push(topicId);
    }
  }
  return found;
}

/**
 * Перевіряє, чи стаття KB релевантна до запиту користувача за темою.
 * Якщо запит і стаття явно про різні теми — повертає false.
 *
 * @param {string} userQuery — останнє повідомлення користувача
 * @param {string} articleTitle — заголовок статті
 * @param {string} [articleContentSnippet] — початок контенту (до ~300 символів)
 * @returns {boolean} true = можна повертати статтю, false = теми не збігаються
 */
function isKbArticleRelevantToQuery(userQuery, articleTitle, articleContentSnippet = '') {
  const q = String(userQuery || '').trim();
  const title = String(articleTitle || '').trim();
  const snippet = String(articleContentSnippet || '').slice(0, 400);

  if (!q) {
    return true;
  }

  const userTopics = getTopicSignatures(q);
  const articleText = `${title} ${snippet}`.trim();
  const articleTopics = getTopicSignatures(articleText);

  // Якщо не вдалося визначити тему в запиті або в статті — не блокуємо (покладаємось на семантичний score)
  if (userTopics.length === 0 || articleTopics.length === 0) {
    return true;
  }

  // Є перетин тем — релевантно
  const overlap = userTopics.filter(t => articleTopics.includes(t));
  if (overlap.length > 0) {
    return true;
  }

  // Немає перетину: запит про одну тему, стаття про іншу — не релевантно
  logger.info('KB relevance guard: теми не збігаються', {
    userTopics,
    articleTopics,
    queryPreview: q.slice(0, 80),
    articleTitle: title.slice(0, 60),
  });
  return false;
}

module.exports = {
  isKbArticleRelevantToQuery,
  getTopicSignatures,
};
