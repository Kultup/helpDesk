const mongoose = require('mongoose');

const softwareRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    telegramId: {
      type: String,
      required: true,
    },
    softwareName: {
      type: String,
      required: true,
      trim: true,
    },
    softwarePhoto: {
      type: String,
      required: false,
    },
    reason: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'installed', 'expired'],
      default: 'pending',
    },
    testUserCreated: {
      type: Boolean,
      default: false,
    },
    testUserCredentials: {
      username: String,
      password: String,
      expiresAt: Date,
    },
    aiAnalysis: {
      isSafe: Boolean,
      category: String,
      requiresLicense: Boolean,
      notes: String,
    },
    adminNote: {
      type: String,
      trim: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Індекс для пошуку запитів користувача
softwareRequestSchema.index({ user: 1, requestedAt: -1 });
softwareRequestSchema.index({ telegramId: 1, requestedAt: -1 });
softwareRequestSchema.index({ status: 1 });
softwareRequestSchema.index({ requestedAt: 1 });

// Метод для перевірки чи може користувач подати новий запит
softwareRequestSchema.statics.canUserMakeRequest = async function (userId, telegramId) {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentRequests = await this.countDocuments({
    $or: [{ user: userId }, { telegramId }],
    requestedAt: { $gte: oneWeekAgo },
  });

  return recentRequests < 1; // 1 запит на тиждень
};

// Метод для отримання статистики
softwareRequestSchema.statics.getStatistics = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$softwareName',
        count: { $sum: 1 },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
        },
        approved: {
          $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] },
        },
        rejected: {
          $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
        },
        installed: {
          $sum: { $cond: [{ $eq: ['$status', 'installed'] }, 1, 0] },
        },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 50 },
  ]);

  return stats;
};

module.exports = mongoose.model('SoftwareRequest', softwareRequestSchema);
