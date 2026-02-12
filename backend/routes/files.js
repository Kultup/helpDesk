const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const { fileSearchPaths } = require('../config/paths');

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
