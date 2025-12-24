const AIKnowledge = require('../models/AIKnowledge');
const Attachment = require('../models/Attachment');
const fs = require('fs').promises;
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const path = require('path');

class AIKnowledgeController {
  async list(req, res) {
    const { q, category, tags, page = 1, limit = 10 } = req.query;
    const query = { isActive: true };
    if (category) query.category = category;
    if (tags) query.tags = { $in: tags.split(',') };
    if (q && q.trim()) query.$text = { $search: q.trim() };
    const items = await AIKnowledge.find(query)
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    const total = await AIKnowledge.countDocuments(query);
    res.json({ success: true, data: items, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
  }

  async getById(req, res) {
    const item = await AIKnowledge.findById(req.params.id).populate('createdBy', 'email firstName lastName');
    if (!item) return res.status(404).json({ success: false, message: 'Запис не знайдено' });
    res.json({ success: true, data: item });
  }

  async create(req, res) {
    const { title, content, tags, category } = req.body;
    if (!title || !content) return res.status(400).json({ success: false, message: 'Поля title та content обов\'язкові' });
    const files = Array.isArray(req.files) ? req.files : [];
    const attachments = [];
    const extractedTexts = [];
    const getCategory = m => m.startsWith('image/') ? 'image' : m.startsWith('video/') ? 'video' : m.startsWith('audio/') ? 'audio' : (m === 'application/pdf' || m === 'application/msword' || m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || m === 'application/vnd.ms-excel' || m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || m === 'text/plain' || m === 'text/csv') ? 'document' : (m.includes('zip') || m.includes('rar') || m.includes('7z')) ? 'archive' : 'other';
    for (const file of files) {
      const buffer = await fs.readFile(file.path);
      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
      const categoryValue = getCategory(file.mimetype);
      const attachment = new Attachment({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        url: `/uploads/${file.filename}`,
        uploadedBy: req.user._id,
        category: categoryValue,
        metadata: { checksum }
      });
      await attachment.save();
      attachments.push(attachment._id);
      if (file.mimetype === 'application/pdf') {
        const parsed = await pdfParse(buffer);
        if (parsed && parsed.text) extractedTexts.push(parsed.text);
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ path: file.path });
        if (result && result.value) extractedTexts.push(result.value);
      } else if (file.mimetype === 'text/plain' || file.mimetype === 'text/csv') {
        extractedTexts.push(buffer.toString('utf8'));
      } else if (file.mimetype === 'application/vnd.ms-excel' || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        const wb = xlsx.readFile(file.path);
        const sheets = wb.SheetNames || [];
        let txt = '';
        for (const name of sheets) {
          const sheet = wb.Sheets[name];
          if (sheet) {
            txt += xlsx.utils.sheet_to_csv(sheet) + '\n';
          }
        }
        if (txt) extractedTexts.push(txt);
      }
    }
    const combinedContent = [content, ...extractedTexts].filter(Boolean).join('\n\n');
    const item = new AIKnowledge({
      title,
      content: combinedContent,
      tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(s => s.trim()) : []),
      category,
      createdBy: req.user._id,
      attachments
    });
    await item.save();
    res.status(201).json({ success: true, data: item });
  }

  async update(req, res) {
    const { id } = req.params;
    const updates = req.body;
    const item = await AIKnowledge.findById(id);
    if (!item) return res.status(404).json({ success: false, message: 'Запис не знайдено' });
    ['title', 'category'].forEach(f => { if (updates[f] !== undefined) item[f] = updates[f]; });
    if (updates.tags !== undefined) item.tags = Array.isArray(updates.tags) ? updates.tags : String(updates.tags).split(',').map(s => s.trim());
    if (updates.isActive !== undefined) item.isActive = updates.isActive;
    const files = Array.isArray(req.files) ? req.files : [];
    const newAttachmentIds = [];
    const extractedTexts = [];
    const getCategory = m => m.startsWith('image/') ? 'image' : m.startsWith('video/') ? 'video' : m.startsWith('audio/') ? 'audio' : (m === 'application/pdf' || m === 'application/msword' || m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || m === 'application/vnd.ms-excel' || m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || m === 'text/plain' || m === 'text/csv') ? 'document' : (m.includes('zip') || m.includes('rar') || m.includes('7z')) ? 'archive' : 'other';
    for (const file of files) {
      const buffer = await fs.readFile(file.path);
      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
      const categoryValue = getCategory(file.mimetype);
      const attachment = new Attachment({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        url: `/uploads/${file.filename}`,
        uploadedBy: req.user._id,
        category: categoryValue,
        metadata: { checksum }
      });
      await attachment.save();
      newAttachmentIds.push(attachment._id);
      if (file.mimetype === 'application/pdf') {
        const parsed = await pdfParse(buffer);
        if (parsed && parsed.text) extractedTexts.push(parsed.text);
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ path: file.path });
        if (result && result.value) extractedTexts.push(result.value);
      } else if (file.mimetype === 'text/plain' || file.mimetype === 'text/csv') {
        extractedTexts.push(buffer.toString('utf8'));
      } else if (file.mimetype === 'application/vnd.ms-excel' || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        const wb = xlsx.readFile(file.path);
        const sheets = wb.SheetNames || [];
        let txt = '';
        for (const name of sheets) {
          const sheet = wb.Sheets[name];
          if (sheet) {
            txt += xlsx.utils.sheet_to_csv(sheet) + '\n';
          }
        }
        if (txt) extractedTexts.push(txt);
      }
    }
    if (newAttachmentIds.length > 0) {
      item.attachments = Array.isArray(item.attachments) ? item.attachments.concat(newAttachmentIds) : newAttachmentIds;
    }
    const baseContent = updates.content !== undefined ? updates.content : item.content;
    const combinedContent = [baseContent, ...extractedTexts].filter(Boolean).join('\n\n');
    item.content = combinedContent;
    await item.save();
    res.json({ success: true, data: item });
  }

  async remove(req, res) {
    const { id } = req.params;
    const item = await AIKnowledge.findById(id);
    if (!item) return res.status(404).json({ success: false, message: 'Запис не знайдено' });
    item.isActive = false;
    await item.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'Запис видалено' });
  }
}

module.exports = new AIKnowledgeController();
