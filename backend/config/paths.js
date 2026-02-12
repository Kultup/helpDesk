const path = require('path');

const backendRoot = path.join(__dirname, '..');

/** Корінь каталогу завантажень (усі файли з веб-форм, Telegram, KB тощо). */
const uploadsPath = path.resolve(backendRoot, 'uploads');

/** Підкаталоги uploads — збігаються з routes/files.js та місцями збереження файлів. */
const UPLOAD_SUBDIRS = [
  'tickets', // вкладення до тікетів (routes/tickets.js)
  'telegram-files', // файли з Telegram (telegramService, telegramUtils, telegramTicketService)
  'telegram-photos', // фото з Telegram
  'attachments', // вкладення коментарів тощо
  'avatars', // аватарки користувачів
  'computer-access', // фото доступу до ПК (профіль користувача)
  'kb', // матеріали бази знань (routes/knowledgeBase.js, telegramAIService.js)
];

/** Абсолютний шлях до каталогу завантажень статей KB (фото/відео). */
const kbUploadsPath = path.resolve(uploadsPath, 'kb');

/** Каталог для даних (наприклад token_usage.json — aiFirstLineService.js). */
const dataPath = path.resolve(backendRoot, 'data');

/** Каталог для логів (audit, errors, security, telegram — middleware/logging.js, app.js). */
const logsPath = path.resolve(backendRoot, 'logs');

/** Повні шляхи до кожного підкаталогу uploads (для створення при старті та перевірок). */
const uploadDirPaths = [uploadsPath, ...UPLOAD_SUBDIRS.map(sub => path.join(uploadsPath, sub))];

/** Порядок пошуку файлів у routes/files.js: спочатку підпапки, потім корінь uploads. */
const fileSearchPaths = [...UPLOAD_SUBDIRS.map(sub => path.join(uploadsPath, sub)), uploadsPath];

module.exports = {
  backendRoot,
  uploadsPath,
  UPLOAD_SUBDIRS,
  kbUploadsPath,
  dataPath,
  logsPath,
  uploadDirPaths,
  fileSearchPaths,
};
