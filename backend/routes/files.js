const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const { fileSearchPaths } = require('../config/paths');
const crypto = require('crypto');

// Generate secure token for document access
const generateSecureToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Store tokens in memory (can be moved to DB later)
const secureTokens = new Map();

// POST - Generate secure view link
router.post('/project-docs/secure-link', async (req, res) => {
  try {
    const token = generateSecureToken();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    secureTokens.set(token, {
      filename: 'TS.md',
      expiresAt,
      createdAt: Date.now(),
    });

    logger.info(`Secure link created: ${token}`);
    res.json({
      success: true,
      token,
      url: `/docs/secure/${token}`,
      expiresAt,
    });
  } catch (error) {
    logger.error('Error creating secure link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create secure link',
    });
  }
});

// GET - Access document via secure token
router.get('/project-docs/secure/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const tokenData = secureTokens.get(token);

    if (!tokenData) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired link',
      });
    }

    if (Date.now() > tokenData.expiresAt) {
      secureTokens.delete(token);
      return res.status(403).json({
        success: false,
        message: 'Link has expired',
      });
    }

    const docsPath = path.join(__dirname, '../../frontend/public/docs', tokenData.filename);

    try {
      await fs.access(docsPath);
    } catch {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    const content = await fs.readFile(docsPath, 'utf8');

    res.json({
      success: true,
      content,
      title: 'Проєктне ТЗ',
    });
  } catch (error) {
    logger.error('Error accessing secure document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to access document',
    });
  }
});

// POST - Save project docs (TS.md)
router.post('/project-docs', async (req, res) => {
  try {
    const { content, filename } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Content is required',
      });
    }

    const safeFilename = filename || 'TS.md';
    const docsPath = path.join(__dirname, '../../frontend/public/docs', safeFilename);

    // Ensure directory exists
    const docsDir = path.dirname(docsPath);
    await fs.mkdir(docsDir, { recursive: true });

    // Write the content to file
    await fs.writeFile(docsPath, content, 'utf8');

    logger.info(`Project docs saved: ${safeFilename}`);
    res.json({
      success: true,
      message: 'Documentation saved successfully',
    });
  } catch (error) {
    logger.error('Error saving project docs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save documentation',
    });
  }
});

// Маршрут для доступу до файлів
router.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    logger.info(`Запит на файл: ${filename}, повний URL: ${req.originalUrl}`);

    // Безпека: перевіряємо що filename не містить небезпечних символів
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        message: "Невірне ім'я файлу",
      });
    }

    // Шукаємо файл у каталогах з config/paths (порядок: підпапки, потім корінь uploads)
    const possiblePaths = fileSearchPaths.map(dir => path.join(dir, filename));

    let filePath = null;
    let fileStats = null;

    // Перевіряємо кожен можливий шлях
    for (const possiblePath of possiblePaths) {
      try {
        fileStats = await fs.stat(possiblePath);
        if (fileStats.isFile()) {
          filePath = possiblePath;
          logger.info(`Файл знайдено: ${possiblePath}`);
          break;
        }
      } catch (error) {
        // Файл не знайдено в цій папці, продовжуємо пошук
        continue;
      }
    }

    if (!filePath) {
      logger.warn(`Файл не знайдено: ${filename}, перевірені шляхи:`, possiblePaths);
      return res.status(404).json({
        success: false,
        message: 'Файл не знайдено',
      });
    }

    // Визначаємо MIME тип на основі розширення файлу
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';

    switch (ext) {
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.webp':
        contentType = 'image/webp';
        break;
      case '.pdf':
        contentType = 'application/pdf';
        break;
      case '.txt':
        contentType = 'text/plain';
        break;
      case '.doc':
        contentType = 'application/msword';
        break;
      case '.docx':
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case '.mp4':
        contentType = 'video/mp4';
        break;
      case '.webm':
        contentType = 'video/webm';
        break;
      case '.mov':
        contentType = 'video/quicktime';
        break;
    }

    // Встановлюємо заголовки
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileStats.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Кешування на рік

    // Відправляємо файл
    res.sendFile(filePath);

    logger.info(`Файл відправлено: ${filename}`);
  } catch (error) {
    logger.error('Помилка при відправці файлу:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні файлу',
    });
  }
});

module.exports = router;
