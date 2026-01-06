const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

// Маршрут для доступу до файлів
router.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    logger.info(`Запит на файл: ${filename}, повний URL: ${req.originalUrl}`);
    
    // Безпека: перевіряємо що filename не містить небезпечних символів
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        message: 'Невірне ім\'я файлу'
      });
    }

    // Шукаємо файл в різних папках
    const possiblePaths = [
      path.join(__dirname, '../uploads/tickets', filename), // Файли з тікетів
      path.join(__dirname, '../uploads/telegram-files', filename), // Файли з Telegram (документи та фото)
      path.join(__dirname, '../uploads/telegram-photos', filename), // Старі фото з Telegram (для сумісності)
      path.join(__dirname, '../uploads/attachments', filename),
      path.join(__dirname, '../uploads/avatars', filename),
      path.join(__dirname, '../uploads/kb', filename), // Файли з KB
      path.join(__dirname, '../uploads', filename)
    ];

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
        message: 'Файл не знайдено'
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
      message: 'Помилка сервера при отриманні файлу'
    });
  }
});

module.exports = router;