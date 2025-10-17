const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');

const router = express.Router();

// Завантаження Swagger документації
const swaggerDocument = YAML.load(path.join(__dirname, '..', 'swagger.yaml'));

// Формуємо servers динамічно на основі середовища або запиту
const resolveServers = (req) => {
  const servers = [];
  if (process.env.API_BASE_URL) {
    servers.push({ url: process.env.API_BASE_URL, description: 'Configured API base URL' });
  }
  const host = req.get('host');
  const proto = req.protocol;
  if (host) {
    servers.push({ url: `${proto}://${host}/api`, description: 'Derived from request host' });
  }
  return servers.length > 0 ? servers : [{ url: '/api', description: 'Relative base path' }];
};

// Налаштування Swagger UI
const swaggerOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #2c3e50; }
    .swagger-ui .scheme-container { background: #f8f9fa; padding: 10px; border-radius: 5px; }
  `,
  customSiteTitle: "Help Desk API Documentation",
  customfavIcon: "/favicon.ico",
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
    tryItOutEnabled: true
  }
};

// Маршрут для Swagger UI
router.use('/docs', swaggerUi.serve);
router.get('/docs', (req, res, next) => {
  const doc = { ...swaggerDocument, servers: resolveServers(req) };
  return swaggerUi.setup(doc, swaggerOptions)(req, res, next);
});

// Маршрут для отримання JSON схеми
router.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const doc = { ...swaggerDocument, servers: resolveServers(req) };
  res.send(doc);
});

// Маршрут для отримання YAML схеми
router.get('/swagger.yaml', (req, res) => {
  res.setHeader('Content-Type', 'text/yaml');
  res.sendFile(path.join(__dirname, '..', 'swagger.yaml'));
});

// Редірект з кореневого шляху на документацію
router.get('/', (req, res) => {
  res.redirect('/api/swagger/docs');
});

module.exports = router;