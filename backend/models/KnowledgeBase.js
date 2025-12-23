const mongoose = require('mongoose');

const knowledgeBaseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true
  },
  content: {
    type: String,
    required: false // Текст, витягнутий з файлу або введений вручну
  },
  type: {
    type: String,
    enum: ['text', 'pdf', 'docx', 'image', 'spreadsheet'],
    default: 'text'
  },
  filePath: {
    type: String, // Шлях до файлу, якщо це завантаження
    required: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Індекс для повнотекстового пошуку
knowledgeBaseSchema.index({ title: 'text', content: 'text', tags: 'text' });

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
