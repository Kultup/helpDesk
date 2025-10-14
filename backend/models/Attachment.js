const mongoose = require('mongoose');
const path = require('path');

const attachmentSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: [true, 'Filename is required'],
    trim: true
  },
  originalName: {
    type: String,
    required: [true, 'Original filename is required'],
    trim: true,
    maxlength: [255, 'Original filename cannot exceed 255 characters']
  },
  mimetype: {
    type: String,
    required: [true, 'MIME type is required'],
    validate: {
      validator: function(v) {
        const allowedTypes = [
          'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
          'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain', 'text/csv', 'application/json', 'application/xml',
          'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
          'video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo',
          'audio/mpeg', 'audio/wav', 'audio/ogg'
        ];
        return allowedTypes.includes(v);
      },
      message: 'File type not allowed'
    }
  },
  size: {
    type: Number,
    required: [true, 'File size is required'],
    min: [1, 'File size must be greater than 0'],
    max: [52428800, 'File size cannot exceed 50MB'] // 50MB
  },
  path: {
    type: String,
    required: [true, 'File path is required']
  },
  url: {
    type: String,
    required: false
  },
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: false
  },
  comment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    required: false
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Uploader is required']
  },
  category: {
    type: String,
    enum: {
      values: ['document', 'image', 'video', 'audio', 'archive', 'other'],
      message: 'Invalid file category'
    },
    required: true
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  downloadCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastDownloadedAt: {
    type: Date,
    default: null
  },
  lastDownloadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  metadata: {
    width: Number,
    height: Number,
    duration: Number, // для відео/аудіо в секундах
    pages: Number, // для PDF
    encoding: String,
    compression: String,
    checksum: String // MD5 або SHA256
  },
  thumbnailPath: {
    type: String,
    default: null
  },
  isProcessed: {
    type: Boolean,
    default: false
  },
  processingError: {
    type: String,
    default: null
  },
  virusScanStatus: {
    type: String,
    enum: ['pending', 'clean', 'infected', 'error'],
    default: 'pending'
  },
  virusScanResult: {
    type: String,
    default: null
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
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
  },
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Віртуальні поля
attachmentSchema.virtual('extension').get(function() {
  return path.extname(this.originalName).toLowerCase();
});

attachmentSchema.virtual('sizeFormatted').get(function() {
  const bytes = this.size;
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

attachmentSchema.virtual('isImage').get(function() {
  return this.mimetype.startsWith('image/');
});

attachmentSchema.virtual('isVideo').get(function() {
  return this.mimetype.startsWith('video/');
});

attachmentSchema.virtual('isAudio').get(function() {
  return this.mimetype.startsWith('audio/');
});

attachmentSchema.virtual('isDocument').get(function() {
  const docTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ];
  return docTypes.includes(this.mimetype);
});

attachmentSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

attachmentSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.expiresAt) return null;
  const now = new Date();
  const diffTime = this.expiresAt - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Індекси для оптимізації запитів
attachmentSchema.index({ ticket: 1, createdAt: -1 });
attachmentSchema.index({ comment: 1 });
attachmentSchema.index({ uploadedBy: 1, createdAt: -1 });
attachmentSchema.index({ mimetype: 1 });
attachmentSchema.index({ category: 1 });
attachmentSchema.index({ isDeleted: 1 });
attachmentSchema.index({ expiresAt: 1 });
attachmentSchema.index({ virusScanStatus: 1 });
attachmentSchema.index({ checksum: 1 }, { sparse: true });

// Middleware для автоматичного визначення категорії
attachmentSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('mimetype')) {
    if (this.mimetype.startsWith('image/')) {
      this.category = 'image';
    } else if (this.mimetype.startsWith('video/')) {
      this.category = 'video';
    } else if (this.mimetype.startsWith('audio/')) {
      this.category = 'audio';
    } else if (this.isDocument) {
      this.category = 'document';
    } else if (this.mimetype.includes('zip') || this.mimetype.includes('rar') || this.mimetype.includes('7z')) {
      this.category = 'archive';
    } else {
      this.category = 'other';
    }
  }
  next();
});

// Middleware для TTL (автоматичне видалення застарілих файлів)
attachmentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Статичні методи
attachmentSchema.statics.findByTicket = function(ticketId, includeDeleted = false) {
  const query = { ticket: ticketId };
  if (!includeDeleted) {
    query.isDeleted = false;
  }
  return this.find(query)
    .populate('uploadedBy', 'firstName lastName email')
    .sort({ createdAt: -1 });
};

attachmentSchema.statics.findByComment = function(commentId) {
  return this.find({ comment: commentId, isDeleted: false })
    .populate('uploadedBy', 'firstName lastName email')
    .sort({ createdAt: -1 });
};

attachmentSchema.statics.findByUser = function(userId, limit = 50) {
  return this.find({ uploadedBy: userId, isDeleted: false })
    .populate('ticket', 'title ticketNumber')
    .populate('comment', 'content')
    .sort({ createdAt: -1 })
    .limit(limit);
};

attachmentSchema.statics.findByCategory = function(category, limit = 100) {
  return this.find({ category, isDeleted: false })
    .populate('uploadedBy', 'firstName lastName')
    .populate('ticket', 'title ticketNumber')
    .sort({ createdAt: -1 })
    .limit(limit);
};

attachmentSchema.statics.findExpiring = function(days = 7) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + days);
  
  return this.find({
    expiresAt: { $lte: expiryDate, $gt: new Date() },
    isDeleted: false
  })
    .populate('uploadedBy', 'firstName lastName email')
    .populate('ticket', 'title ticketNumber')
    .sort({ expiresAt: 1 });
};

attachmentSchema.statics.getStorageStatistics = function() {
  return this.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalSize: { $sum: '$size' },
        avgSize: { $avg: '$size' },
        totalDownloads: { $sum: '$downloadCount' }
      }
    },
    {
      $project: {
        category: '$_id',
        count: 1,
        totalSize: 1,
        totalSizeFormatted: {
          $concat: [
            { $toString: { $round: [{ $divide: ['$totalSize', 1048576] }, 2] } },
            ' MB'
          ]
        },
        avgSize: { $round: ['$avgSize', 0] },
        totalDownloads: 1
      }
    },
    { $sort: { totalSize: -1 } }
  ]);
};

attachmentSchema.statics.findDuplicates = function() {
  return this.aggregate([
    { $match: { isDeleted: false, 'metadata.checksum': { $exists: true } } },
    {
      $group: {
        _id: '$metadata.checksum',
        count: { $sum: 1 },
        files: { $push: { id: '$_id', filename: '$filename', size: '$size' } }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } }
  ]);
};

// Методи екземпляра
attachmentSchema.methods.incrementDownload = function(userId = null) {
  this.downloadCount += 1;
  this.lastDownloadedAt = new Date();
  if (userId) {
    this.lastDownloadedBy = userId;
  }
  return this.save();
};

attachmentSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

attachmentSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

attachmentSchema.methods.setExpiry = function(days) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + days);
  this.expiresAt = expiryDate;
  return this.save();
};

attachmentSchema.methods.addTag = function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return this.save();
  }
  return Promise.resolve(this);
};

attachmentSchema.methods.removeTag = function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

attachmentSchema.methods.updateVirusScan = function(status, result = null) {
  this.virusScanStatus = status;
  this.virusScanResult = result;
  return this.save();
};

attachmentSchema.methods.generateThumbnail = function(thumbnailPath) {
  this.thumbnailPath = thumbnailPath;
  this.isProcessed = true;
  return this.save();
};

attachmentSchema.methods.setProcessingError = function(error) {
  this.processingError = error;
  this.isProcessed = false;
  return this.save();
};

module.exports = mongoose.model('Attachment', attachmentSchema);