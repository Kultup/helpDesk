const mongoose = require('mongoose');

/**
 * Схема для збереження історії AI діалогів
 * Зберігає всі повідомлення між користувачем та AI ботом
 */
const aiDialogHistorySchema = new mongoose.Schema({
  // Посилання на користувача
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Telegram username для швидкого пошуку
  telegramUsername: {
    type: String,
    index: true
  },

  // Ім'я користувача для відображення
  userName: {
    type: String,
    required: true
  },

  // Місто та заклад (якщо вказано)
  location: {
    city: String,
    institution: String
  },

  // Масив повідомлень діалогу
  messages: [{
    role: {
      type: String,
      enum: ['user', 'ai', 'system'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    // Додаткові метадані
    metadata: {
      intentAnalysis: Object,  // Результат analyzeIntent
      confidence: Number,
      category: String
    }
  }],

  // Чи був створений тікет з цього діалогу
  createdTicket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: false
  },

  // Статус діалогу
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned'],
    default: 'active',
    index: true
  },

  // Результат діалогу
  outcome: {
    type: String,
    enum: ['ticket_created', 'consultation', 'cancelled', 'timeout'],
    required: false  // Не обов'язкове, буде undefined до завершення
  },

  // Тривалість діалогу (в секундах)
  duration: {
    type: Number,
    default: 0
  },

  // Кількість повідомлень користувача
  userMessagesCount: {
    type: Number,
    default: 0
  },

  // Кількість питань AI
  aiQuestionsCount: {
    type: Number,
    default: 0
  },

  // Дата початку діалогу
  startedAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Дата завершення діалогу
  completedAt: {
    type: Date,
    required: false
  },

  // Оцінка користувача (якщо додамо в майбутньому)
  userRating: {
    type: Number,
    min: 1,
    max: 5,
    required: false
  }
}, {
  timestamps: true
});

// Індекси для швидкого пошуку
aiDialogHistorySchema.index({ createdAt: -1 });
aiDialogHistorySchema.index({ status: 1, createdAt: -1 });
aiDialogHistorySchema.index({ user: 1, createdAt: -1 });
aiDialogHistorySchema.index({ outcome: 1 });

// Віртуальне поле для швидкого доступу до першого повідомлення
aiDialogHistorySchema.virtual('firstUserMessage').get(function() {
  const userMessage = this.messages.find(m => m.role === 'user');
  return userMessage ? userMessage.content : '';
});

// Метод для додавання нового повідомлення
aiDialogHistorySchema.methods.addMessage = function(role, content, metadata = null) {
  this.messages.push({
    role,
    content,
    timestamp: new Date(),
    metadata
  });

  // Оновлення лічильників
  if (role === 'user') {
    this.userMessagesCount++;
  } else if (role === 'ai') {
    this.aiQuestionsCount++;
  }

  return this.save();
};

// Метод для завершення діалогу
aiDialogHistorySchema.methods.complete = function(outcome, ticketId = null) {
  this.status = 'completed';
  this.outcome = outcome;
  this.completedAt = new Date();
  
  if (ticketId) {
    this.createdTicket = ticketId;
  }

  // Розрахунок тривалості
  if (this.startedAt && this.completedAt) {
    this.duration = Math.floor((this.completedAt - this.startedAt) / 1000);
  }

  return this.save();
};

// Статичний метод для пошуку активних діалогів користувача
aiDialogHistorySchema.statics.findActiveDialog = function(userId) {
  return this.findOne({ user: userId, status: 'active' }).sort({ startedAt: -1 });
};

// Статичний метод для отримання статистики
aiDialogHistorySchema.statics.getStats = async function(dateFrom, dateTo) {
  const match = {
    createdAt: {
      $gte: dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      $lte: dateTo || new Date()
    }
  };

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$outcome',
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' },
        avgUserMessages: { $avg: '$userMessagesCount' },
        avgAIQuestions: { $avg: '$aiQuestionsCount' }
      }
    }
  ]);
};

const AIDialogHistory = mongoose.model('AIDialogHistory', aiDialogHistorySchema);

module.exports = AIDialogHistory;
