const mongoose = require('mongoose');

const aiFeedbackSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BotConversation',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    telegramId: {
      type: String,
      required: true,
    },
    messageId: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    feedback: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    category: {
      type: String,
      enum: [
        'too_formal',
        'not_helpful',
        'wrong_category',
        'wrong_priority',
        'good',
        'excellent',
        'other',
      ],
    },
    aiResponse: {
      type: String,
      maxlength: 2000,
    },
    userMessage: {
      type: String,
      maxlength: 500,
    },
    resolved: {
      type: Boolean,
      default: false,
    },
    adminNote: {
      type: String,
      maxlength: 500,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Ідекси для швидкого пошуку
aiFeedbackSchema.index({ userId: 1, createdAt: -1 });
aiFeedbackSchema.index({ conversationId: 1 });
aiFeedbackSchema.index({ rating: 1 });
aiFeedbackSchema.index({ resolved: 1 });

module.exports = mongoose.model('AIFeedback', aiFeedbackSchema);
