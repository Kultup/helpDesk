const mongoose = require('mongoose');

const ticketTemplateSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  estimatedResolutionTime: {
    type: Number, // в годинах
    default: 24
  },
  tags: [{
    type: String,
    trim: true
  }],
  fields: [{
    name: {
      type: String,
      required: true
    },
    label: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['text', 'textarea', 'select', 'checkbox', 'radio', 'file'],
      required: true
    },
    required: {
      type: Boolean,
      default: false
    },
    options: [String], // для select, radio
    placeholder: String,
    validation: {
      minLength: Number,
      maxLength: Number,
      pattern: String
    }
  }],
  instructions: {
    type: String,
    default: ''
  },

  isActive: {
    type: Boolean,
    default: true
  },
  usageCount: {
    type: Number,
    default: 0
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Індекси
ticketTemplateSchema.index({ category: 1 });
ticketTemplateSchema.index({ isActive: 1 });
ticketTemplateSchema.index({ usageCount: -1 });
ticketTemplateSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Метод для збільшення лічильника використання
ticketTemplateSchema.methods.incrementUsage = function() {
  this.usageCount += 1;
  return this.save();
};

module.exports = mongoose.model('TicketTemplate', ticketTemplateSchema);