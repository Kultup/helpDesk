const mongoose = require('mongoose');

const knowledgeBaseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    trim: true,
    maxlength: [50000, 'Content cannot exceed 50000 characters']
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  subcategory: {
    type: String,
    trim: true,
    maxlength: [100, 'Subcategory cannot exceed 100 characters']
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  views: {
    type: Number,
    default: 0
  },
  helpfulCount: {
    type: Number,
    default: 0
  },
  notHelpfulCount: {
    type: Number,
    default: 0
  },
  relatedArticles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KnowledgeBase'
  }],
  attachments: [{
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    mimetype: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  searchKeywords: [{
    type: String,
    trim: true,
    maxlength: [50, 'Keyword cannot exceed 50 characters']
  }],
  isPublic: {
    type: Boolean,
    default: true
  },
  shareToken: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  version: {
    type: Number,
    default: 1
  },
  // Історія версій
  versionHistory: [{
    version: { type: Number, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedAt: { type: Date, default: Date.now },
    reason: { type: String, trim: true }
  }],
  // Метадані
  metadata: {
    source: {
      type: String,
      enum: ['manual', 'ticket', 'import'],
      default: 'manual'
    },
    sourceTicket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket'
    },
    language: {
      type: String,
      default: 'uk'
    }
  },
  // Видалення
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Індекси для швидкого пошуку
knowledgeBaseSchema.index({ title: 'text', content: 'text', tags: 'text', searchKeywords: 'text' });
knowledgeBaseSchema.index({ category: 1, status: 1 });
knowledgeBaseSchema.index({ status: 1, isPublic: 1 });
knowledgeBaseSchema.index({ author: 1 });
knowledgeBaseSchema.index({ tags: 1 });
knowledgeBaseSchema.index({ createdAt: -1 });
knowledgeBaseSchema.index({ views: -1 });
knowledgeBaseSchema.index({ helpfulCount: -1 });
knowledgeBaseSchema.index({ shareToken: 1 });

// Віртуальні поля
knowledgeBaseSchema.virtual('helpfulRate').get(function() {
  const total = this.helpfulCount + this.notHelpfulCount;
  if (total === 0) return 0;
  return Math.round((this.helpfulCount / total) * 100);
});

knowledgeBaseSchema.virtual('isPopular').get(function() {
  return this.views > 100 || this.helpfulCount > 10;
});

// Методи
knowledgeBaseSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

knowledgeBaseSchema.methods.markHelpful = function() {
  this.helpfulCount += 1;
  return this.save();
};

knowledgeBaseSchema.methods.markNotHelpful = function() {
  this.notHelpfulCount += 1;
  return this.save();
};

knowledgeBaseSchema.methods.addVersion = function(updatedBy, reason = '') {
  this.versionHistory.push({
    version: this.version,
    title: this.title,
    content: this.content,
    updatedBy,
    updatedAt: new Date(),
    reason
  });
  this.version += 1;
  return this.save();
};

knowledgeBaseSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

knowledgeBaseSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

knowledgeBaseSchema.methods.generateShareToken = async function() {
  const crypto = require('crypto');
  // Генеруємо унікальний токен
  let token;
  let exists = true;
  
  while (exists) {
    token = crypto.randomBytes(32).toString('hex');
    const existing = await this.constructor.findOne({ shareToken: token });
    exists = !!existing;
  }
  
  this.shareToken = token;
  await this.save();
  return token;
};

// Статичні методи
knowledgeBaseSchema.statics.findPublished = function(query = {}) {
  return this.find({ ...query, status: 'published', isDeleted: false, isPublic: true });
};

knowledgeBaseSchema.statics.findPopular = function(limit = 10) {
  return this.find({ status: 'published', isDeleted: false, isPublic: true })
    .sort({ views: -1, helpfulCount: -1 })
    .limit(limit);
};

knowledgeBaseSchema.statics.findRecent = function(limit = 10) {
  return this.find({ status: 'published', isDeleted: false, isPublic: true })
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);

