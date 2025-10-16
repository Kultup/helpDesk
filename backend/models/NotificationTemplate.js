const mongoose = require('mongoose');

const notificationTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  type: {
    type: String,
    enum: ['email', 'telegram', 'web', 'sms'],
    required: true
  },
  category: {
    type: String,
    enum: ['ticket', 'user', 'system', 'security', 'maintenance'],
    required: true
  },
  subject: {
    type: String,
    trim: true,
    maxlength: 200,
    default: null
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000
  },
  variables: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

notificationTemplateSchema.index({ type: 1, category: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);