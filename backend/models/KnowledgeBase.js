const mongoose = require('mongoose');

const knowledgeBaseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    content: {
      type: String,
      required: false, // Текст, витягнутий з файлу або введений вручну
    },
    type: {
      type: String,
      enum: ['text', 'pdf', 'docx', 'image', 'spreadsheet', 'video'],
      default: 'text',
    },
    filePath: {
      type: String, // Шлях до файлу, якщо це завантаження
      required: false,
    },
    // Медіа (фото, відео) для відправки користувачу в боті
    attachments: [
      {
        type: { type: String, enum: ['image', 'video'], required: true },
        filePath: { type: String, required: true },
        url: { type: String },
        originalName: { type: String },
      },
    ],
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    category: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    helpfulCount: {
      type: Number,
      default: 0,
    },
    notHelpfulCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    shareToken: {
      type: String,
      sparse: true,
      unique: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Індекс для повнотекстового пошуку
knowledgeBaseSchema.index({ title: 'text', content: 'text', tags: 'text' });

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
