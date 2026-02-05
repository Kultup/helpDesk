const mongoose = require('mongoose');

/**
 * Схема для обліку інвентарного обладнання
 */
const equipmentSchema = new mongoose.Schema({
  // Основна інформація
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  type: {
    type: String,
    required: true,
    enum: ['computer', 'printer', 'phone', 'monitor', 'router', 'switch', 'ups', 'other'],
    index: true
  },

  brand: {
    type: String,
    trim: true
  },

  model: {
    type: String,
    trim: true
  },

  serialNumber: {
    type: String,
    trim: true,
    sparse: true,
    index: true
  },

  inventoryNumber: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
    index: true
  },

  // Локація
  city: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    required: true,
    index: true
  },

  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution'
  },

  location: {
    type: String,
    trim: true // Кабінет, відділ, поверх тощо
  },

  // Статус
  status: {
    type: String,
    required: true,
    enum: ['active', 'inactive', 'repair', 'disposed', 'storage'],
    default: 'active',
    index: true
  },

  // Дати
  purchaseDate: {
    type: Date,
    index: true
  },

  warrantyExpiry: {
    type: Date,
    index: true
  },

  // Призначення
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  // Технічні характеристики (гнучке поле)
  specifications: {
    type: Map,
    of: String,
    default: {}
    // Приклад: { "RAM": "16GB", "CPU": "Intel i7", "HDD": "512GB SSD" }
  },

  // Примітки
  notes: {
    type: String,
    trim: true
  },

  // Метадані
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Історія обслуговування (пов'язані тікети)
  relatedTickets: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket'
  }]
}, {
  timestamps: true
});

// Індекси для швидкого пошуку
equipmentSchema.index({ name: 'text', model: 'text', serialNumber: 'text' });
equipmentSchema.index({ type: 1, status: 1 });
equipmentSchema.index({ city: 1, status: 1 });
equipmentSchema.index({ assignedTo: 1, status: 1 });

// Віртуальні поля
equipmentSchema.virtual('isUnderWarranty').get(function() {
  if (!this.warrantyExpiry) return false;
  return new Date() < this.warrantyExpiry;
});

equipmentSchema.virtual('age').get(function() {
  if (!this.purchaseDate) return null;
  const now = new Date();
  const diff = now - this.purchaseDate;
  const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
  return years;
});

// Методи
equipmentSchema.methods.assignToUser = function(userId) {
  this.assignedTo = userId;
  return this.save();
};

equipmentSchema.methods.changeStatus = function(newStatus, userId) {
  this.status = newStatus;
  this.updatedBy = userId;
  return this.save();
};

equipmentSchema.methods.addTicket = function(ticketId) {
  if (!this.relatedTickets.includes(ticketId)) {
    this.relatedTickets.push(ticketId);
    return this.save();
  }
  return Promise.resolve(this);
};

// Статичні методи
equipmentSchema.statics.getByCity = function(cityId, filters = {}) {
  const query = { city: cityId, ...filters };
  return this.find(query)
    .populate('city', 'name')
    .populate('assignedTo', 'firstName lastName email')
    .sort({ createdAt: -1 });
};

equipmentSchema.statics.getByType = function(type, cityId = null) {
  const query = { type, status: 'active' };
  if (cityId) query.city = cityId;
  return this.find(query)
    .populate('city', 'name')
    .populate('assignedTo', 'firstName lastName email');
};

equipmentSchema.statics.getStatsByCity = async function(cityId) {
  return this.aggregate([
    { $match: cityId ? { city: cityId } : {} },
    {
      $group: {
        _id: '$type',
        total: { $sum: 1 },
        active: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        repair: {
          $sum: { $cond: [{ $eq: ['$status', 'repair'] }, 1, 0] }
        },
        disposed: {
          $sum: { $cond: [{ $eq: ['$status', 'disposed'] }, 1, 0] }
        }
      }
    }
  ]);
};

const Equipment = mongoose.model('Equipment', equipmentSchema);

module.exports = Equipment;
