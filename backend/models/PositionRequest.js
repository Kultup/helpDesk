const mongoose = require('mongoose');

const positionRequestSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Position title is required'],
    trim: true,
    maxlength: [100, 'Position title cannot exceed 100 characters']
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null якщо запит з Telegram (ще не зареєстрований користувач)
  },
  telegramId: {
    type: String,
    default: null // Telegram ID користувача, який зробив запит
  },
  telegramChatId: {
    type: String,
    default: null // Telegram Chat ID для відправки сповіщень
  },
  pendingRegistrationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PendingRegistration',
    default: null // Посилання на реєстрацію, якщо запит зроблено під час реєстрації
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Rejection reason cannot exceed 500 characters']
  },
  adminMessageId: {
    type: String,
    default: null // ID повідомлення в адмін чаті
  },
  createdPositionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Position',
    default: null // ID створеної посади після підтвердження
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Оновлюємо updatedAt при кожному збереженні
positionRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Індекси для оптимізації
positionRequestSchema.index({ status: 1 });
positionRequestSchema.index({ telegramId: 1 });
positionRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PositionRequest', positionRequestSchema);

