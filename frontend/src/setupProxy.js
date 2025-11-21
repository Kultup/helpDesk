const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // У development режимі завжди використовуємо localhost, навіть якщо REACT_APP_API_URL встановлено
  let target;
  if (process.env.NODE_ENV === 'development') {
    // У development режимі завжди використовуємо localhost:5000
    target = process.env.PROXY_TARGET || 'http://localhost:5000';
    console.log('[PROXY SETUP] Development режим: використовується localhost:5000');
  } else {
    // У production використовуємо змінну середовища або fallback
    const defaultTarget = '';
    target = process.env.PROXY_TARGET || 
      (process.env.REACT_APP_API_URL || defaultTarget).replace(/\/api\/?$/, '');
  }
  
  if (!target) {
    console.warn('[PROXY SETUP] PROXY_TARGET/REACT_APP_API_URL не задані. Проксі для /api не буде налаштовано.');
    return;
  }

  console.log(`[PROXY SETUP] Налаштовую проксі для /api -> ${target}`);
  
  // Проксі для API
  // Використовуємо функцію для перевірки, щоб зберегти повний шлях
  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false,
      logLevel: 'debug',
      // Використовуємо pathRewrite, щоб не видаляти /api
      // Але насправді нам потрібно додати /api назад, оскільки Express його видаляє
      pathRewrite: function (path, req) {
        // path вже без /api (наприклад, /auth/login)
        // Повертаємо шлях з /api
        return '/api' + path;
      },
      onProxyReq: (proxyReq, req, res) => {
        // Логуємо для діагностики
        console.log(`[PROXY REQ] ${req.method} ${req.originalUrl || req.url}`);
        console.log(`[PROXY REQ] req.url: ${req.url}, proxyReq.path: ${proxyReq.path}`);
      },
      onProxyRes: (proxyRes, req, res) => {
        console.log(`[PROXY RES] ${proxyRes.statusCode} for ${req.method} ${req.originalUrl || req.url}`);
      },
      onError: (err, req, res) => {
        console.error(`[PROXY ERROR] ${req.method} ${req.originalUrl || req.url}:`, err.message);
        if (err.stack) {
          console.error(`[PROXY ERROR] Stack:`, err.stack);
        }
      }
    })
  );
  
  // Проксі для статичних файлів (/uploads)
  app.use(
    '/uploads',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false,
      logLevel: 'debug',
      onProxyReq: (proxyReq, req, res) => {
        console.log(`[PROXY REQ UPLOADS] ${req.method} ${req.url} -> ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`);
      },
      onError: (err, req, res) => {
        console.error(`[PROXY ERROR UPLOADS] ${req.method} ${req.url}:`, err.message);
      }
    })
  );
  
  console.log('[PROXY SETUP] Проксі налаштовано успішно');
};