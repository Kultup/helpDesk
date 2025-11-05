const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Fallback для development режиму
  const defaultTarget = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : '';
  const target = process.env.PROXY_TARGET || 
    (process.env.REACT_APP_API_URL || defaultTarget).replace(/\/api\/?$/, '');
  
  if (!target) {
    console.warn('[PROXY SETUP] PROXY_TARGET/REACT_APP_API_URL не задані. Проксі для /api не буде налаштовано.');
    console.warn('[PROXY SETUP] Для development режиму використовується http://localhost:5000');
    return;
  }

  console.log(`[PROXY SETUP] Налаштовую проксі для /api -> ${target}`);
  
  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false,
      logLevel: 'debug',
      onProxyReq: (proxyReq, req, res) => {
        console.log(`[PROXY REQ] ${req.method} ${req.url} -> ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`);
        console.log(`[PROXY REQ] Headers:`, req.headers);
      },
      onProxyRes: (proxyRes, req, res) => {
        console.log(`[PROXY RES] ${proxyRes.statusCode} for ${req.method} ${req.url}`);
        console.log(`[PROXY RES] Headers:`, proxyRes.headers);
      },
      onError: (err, req, res) => {
        console.error(`[PROXY ERROR] ${req.method} ${req.url}:`, err.message);
        console.error(`[PROXY ERROR] Stack:`, err.stack);
      }
    })
  );
  
  console.log('[PROXY SETUP] Проксі налаштовано успішно');
};