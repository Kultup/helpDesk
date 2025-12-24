const mongoose = require('mongoose');

const aiKnowledgeSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  tags: [{ type: String, trim: true }],
  category: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

aiKnowledgeSchema.index({ title: 'text', content: 'text', tags: 'text' });

module.exports = mongoose.model('AIKnowledge', aiKnowledgeSchema);
