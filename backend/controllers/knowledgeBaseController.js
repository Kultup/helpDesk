const KnowledgeBase = require('../models/KnowledgeBase');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const Tesseract = require('tesseract.js');
const logger = require('../utils/logger');

class KnowledgeBaseController {
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
          const { data: { text } } = await Tesseract.recognize(file.path, 'ukr+eng');
          content = text;
        } else if (ext === '.txt') {
          type = 'text';
          content = fs.readFileSync(file.path, 'utf8');
        }
      } catch (parseError) {
        logger.error('Помилка парсингу файлу:', parseError);
        return res.status(500).json({ success: false, message: 'Помилка обробки файлу' });
      }

      const kbEntry = new KnowledgeBase({
        title: title || file.originalname,
        content: content,
        type: type,
        filePath: file.path,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        createdBy: userId
      });

      await kbEntry.save();

      res.status(201).json({
        success: true,
        data: kbEntry,
        message: 'Документ успішно додано до бази знань'
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
      await document.save();

      res.json({ success: true, message: 'Документ видалено (переміщено в архів)' });
    } catch (error) {
      logger.error('Error deleting document:', error);
      res.status(500).json({ success: false, message: 'Помилка видалення документа' });
    }
  }
}

module.exports = new KnowledgeBaseController();
