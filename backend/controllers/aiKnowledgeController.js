const AIKnowledge = require('../models/AIKnowledge');

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
    const item = new AIKnowledge({
      title,
      content,
      tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(s => s.trim()) : []),
      category,
      createdBy: req.user._id
    });
    await item.save();
    res.status(201).json({ success: true, data: item });
  }

  async update(req, res) {
    const { id } = req.params;
    const updates = req.body;
    const item = await AIKnowledge.findById(id);
    if (!item) return res.status(404).json({ success: false, message: 'Запис не знайдено' });
    ['title', 'content', 'category'].forEach(f => { if (updates[f] !== undefined) item[f] = updates[f]; });
    if (updates.tags !== undefined) item.tags = Array.isArray(updates.tags) ? updates.tags : String(updates.tags).split(',').map(s => s.trim());
    if (updates.isActive !== undefined) item.isActive = updates.isActive;
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
