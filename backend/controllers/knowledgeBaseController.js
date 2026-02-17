const KnowledgeBase = require('../models/KnowledgeBase');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const Tesseract = require('tesseract.js');
const logger = require('../utils/logger');

class KnowledgeBaseController {
  // Створення нової статті
  async createArticle(req, res) {
    try {
      const { title, content, tags, category, isPublic, status } = req.body;
      const userId = req.user._id;

      if (!title) {
        return res.status(400).json({ success: false, message: "Заголовок обов'язковий" });
      }

      const kbEntry = new KnowledgeBase({
        title,
        content,
        type: 'text', // Звичайні статті мають тип text
        tags: tags || [],
        category,
        isPublic: isPublic !== undefined ? isPublic : true,
        status: status || 'published',
        createdBy: userId,
      });

      await kbEntry.save();

      res.status(201).json({
        success: true,
        data: kbEntry,
        message: 'Статтю успішно створено',
      });
    } catch (error) {
      logger.error('Error creating article:', error);
      res.status(500).json({ success: false, message: 'Помилка створення статті' });
    }
  }

  // Оновлення статті
  async updateArticle(req, res) {
    try {
      const { id } = req.params;
      const { title, content, tags, category, isPublic, status } = req.body;

      const article = await KnowledgeBase.findById(id);

      if (!article) {
        return res.status(404).json({ success: false, message: 'Статтю не знайдено' });
      }

      // Оновлюємо поля
      if (title) {
        article.title = title;
      }
      if (content !== undefined) {
        article.content = content;
      }
      if (tags) {
        article.tags = tags;
      }
      if (category) {
        article.category = category;
      }
      if (isPublic !== undefined) {
        article.isPublic = isPublic;
      }
      if (status) {
        article.status = status;
      }

      await article.save();

      res.json({
        success: true,
        data: article,
        message: 'Статтю успішно оновлено',
      });
    } catch (error) {
      logger.error('Error updating article:', error);
      res.status(500).json({ success: false, message: 'Помилка оновлення статті' });
    }
  }

  // Завантаження та обробка файлу
  async uploadDocument(req, res) {
    try {
      const { title, tags } = req.body;
      const file = req.file;
      const userId = req.user._id;

      if (!file) {
        return res.status(400).json({ success: false, message: 'Файл не завантажено' });
      }

      let content = '';
      let type = 'text';

      // Визначаємо тип та парсимо вміст
      const ext = path.extname(file.originalname).toLowerCase();

      try {
        if (ext === '.pdf') {
          type = 'pdf';
          const dataBuffer = fs.readFileSync(file.path);
          const data = await pdf(dataBuffer);
          content = data.text;
        } else if (ext === '.docx') {
          type = 'docx';
          const result = await mammoth.extractRawText({ path: file.path });
          content = result.value;
        } else if (ext === '.xlsx' || ext === '.xls') {
          type = 'spreadsheet';
          const workbook = xlsx.readFile(file.path);
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          content = JSON.stringify(xlsx.utils.sheet_to_json(sheet));
        } else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
          type = 'image';
          const {
            data: { text },
          } = await Tesseract.recognize(file.path, 'ukr+eng');
          content = text;
        } else if (ext === '.txt') {
          type = 'text';
          content = fs.readFileSync(file.path, 'utf8');
        }
      } catch (parseError) {
        logger.error('Помилка парсингу файлу:', parseError);
        // Не перериваємо завантаження, якщо не вдалося розпізнати текст
        content = '';
        // return res.status(500).json({ success: false, message: 'Помилка обробки файлу' });
      }

      const kbEntry = new KnowledgeBase({
        title: title || file.originalname,
        content: content,
        type: type,
        filePath: file.path,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        createdBy: userId,
      });

      await kbEntry.save();

      res.status(201).json({
        success: true,
        data: kbEntry,
        message: 'Документ успішно додано до бази знань',
      });
    } catch (error) {
      logger.error('Error uploading document:', error);
      res.status(500).json({ success: false, message: 'Внутрішня помилка сервера' });
    }
  }

  // Отримання всіх документів
  async getAllDocuments(req, res) {
    try {
      const documents = await KnowledgeBase.find({ isActive: true })
        .select('title type tags createdAt')
        .sort({ createdAt: -1 });

      res.json({ success: true, data: documents });
    } catch (error) {
      logger.error('Error fetching documents:', error);
      res.status(500).json({ success: false, message: 'Помилка отримання документів' });
    }
  }

  // Видалення документа (Soft Delete)
  async deleteDocument(req, res) {
    try {
      const { id } = req.params;
      const document = await KnowledgeBase.findById(id);

      if (!document) {
        return res.status(404).json({ success: false, message: 'Документ не знайдено' });
      }

      // Soft delete: просто деактивуємо, не видаляємо з БД і не видаляємо файл
      // Якщо треба буде повне видалення - можна додати окремий метод
      document.isActive = false;
      await document.save({ validateBeforeSave: false });

      res.json({ success: true, message: 'Документ видалено (переміщено в архів)' });
    } catch (error) {
      logger.error('Error deleting document:', error);
      res.status(500).json({ success: false, message: 'Помилка видалення документа' });
    }
  }
}

module.exports = new KnowledgeBaseController();
