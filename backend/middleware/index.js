// Імпортуємо всі middleware
const auth = require('./auth');
const logging = require('./logging');
const validation = require('./validation');
const cors = require('./cors');
const errorHandler = require('./errorHandler');
const cache = require('./cache');

// Експортуємо все в одному об'єкті для зручності
module.exports = {
  // Аутентифікація та авторизація
  ...auth,
  
  // Логування
  ...logging,
  
  // Валідація
  ...validation,
  
  // CORS
  cors,
  
  // Обробка помилок
  ...errorHandler,
  
  // Кешування
  ...cache
};