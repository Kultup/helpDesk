const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const citySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'City name is required'],
    unique: true,
    trim: true,
    maxlength: [100, 'City name cannot exceed 100 characters']
  },
  nameEn: {
    type: String,
    trim: true,
    maxlength: [100, 'English name cannot exceed 100 characters']
  },
  region: {
    type: String,
    required: [true, 'Region is required'],
    trim: true,
    maxlength: [100, 'Region name cannot exceed 100 characters']
  },
  regionEn: {
    type: String,
    trim: true,
    maxlength: [100, 'English region name cannot exceed 100 characters']
  },
  coordinates: {
    lat: {
      type: Number,
      required: [true, 'Latitude is required'],
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90']
    },
    lng: {
      type: Number,
      required: [true, 'Longitude is required'],
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180']
    }
  },
  population: {
    type: Number,
    min: [0, 'Population cannot be negative'],
    default: null
  },
  area: {
    type: Number,
    min: [0, 'Area cannot be negative'],
    default: null
  },
  timezone: {
    type: String,
    default: 'Europe/Kiev'
  },
  postalCodes: [{
    type: String,
    match: [/^\d{5}$/, 'Postal code must be 5 digits']
  }],
  phoneCode: {
    type: String,
    match: [/^\d{2,4}$/, 'Phone code must be 2-4 digits']
  },
  isCapital: {
    type: Boolean,
    default: false
  },
  isRegionalCenter: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  website: {
    type: String,
    match: [/^https?:\/\/.+/, 'Website must be a valid URL']
  },
  mayor: {
    name: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email format']
    },
    phone: {
      type: String,
      match: [/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format']
    }
  },
  statistics: {
    totalTickets: {
      type: Number,
      default: 0
    },
    openTickets: {
      type: Number,
      default: 0
    },
    resolvedTickets: {
      type: Number,
      default: 0
    },
    averageResolutionTime: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Віртуальні поля
citySchema.virtual('fullName').get(function() {
  return this.nameEn ? `${this.name} (${this.nameEn})` : this.name;
});

citySchema.virtual('fullRegion').get(function() {
  return this.regionEn ? `${this.region} (${this.regionEn})` : this.region;
});

citySchema.virtual('ticketResolutionRate').get(function() {
  if (this.statistics.totalTickets === 0) return 0;
  return Math.round((this.statistics.resolvedTickets / this.statistics.totalTickets) * 100);
});

// Індекси для оптимізації запитів
citySchema.index({ name: 1 });
citySchema.index({ nameEn: 1 });
citySchema.index({ region: 1 });
citySchema.index({ isActive: 1 });
citySchema.index({ isCapital: 1 });
citySchema.index({ isRegionalCenter: 1 });
citySchema.index({ 'coordinates.lat': 1, 'coordinates.lng': 1 });
citySchema.index({ 'statistics.totalTickets': -1 });

// Middleware для валідації координат України
citySchema.pre('save', function(next) {
  // Перевірка чи координати знаходяться в межах України
  const { lat, lng } = this.coordinates;
  
  // Приблизні межі України
  const ukraineBounds = {
    north: 52.4,
    south: 44.2,
    east: 40.2,
    west: 22.1
  };
  
  if (lat < ukraineBounds.south || lat > ukraineBounds.north ||
      lng < ukraineBounds.west || lng > ukraineBounds.east) {
    return next(new Error('Coordinates must be within Ukraine boundaries'));
  }
  
  next();
});

// Статичні методи
citySchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ name: 1 });
};

citySchema.statics.findByRegion = function(region) {
  return this.find({ region, isActive: true }).sort({ name: 1 });
};

citySchema.statics.findCapitals = function() {
  return this.find({ isCapital: true, isActive: true }).sort({ name: 1 });
};

citySchema.statics.findRegionalCenters = function() {
  return this.find({ isRegionalCenter: true, isActive: true }).sort({ name: 1 });
};

citySchema.statics.findNearby = function(lat, lng, maxDistance = 50) {
  return this.find({
    isActive: true,
    'coordinates.lat': {
      $gte: lat - (maxDistance / 111), // приблизно 1 градус = 111 км
      $lte: lat + (maxDistance / 111)
    },
    'coordinates.lng': {
      $gte: lng - (maxDistance / (111 * Math.cos(lat * Math.PI / 180))),
      $lte: lng + (maxDistance / (111 * Math.cos(lat * Math.PI / 180)))
    }
  });
};

citySchema.statics.getRegions = function() {
  return this.distinct('region', { isActive: true });
};

citySchema.statics.getStatistics = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$region',
        cities: { $sum: 1 },
        totalTickets: { $sum: '$statistics.totalTickets' },
        openTickets: { $sum: '$statistics.openTickets' },
        resolvedTickets: { $sum: '$statistics.resolvedTickets' },
        avgResolutionTime: { $avg: '$statistics.averageResolutionTime' }
      }
    },
    { $sort: { totalTickets: -1 } }
  ]);
};

// Методи екземпляра
citySchema.methods.updateStatistics = async function() {
  const Ticket = mongoose.model('Ticket');
  
  const stats = await Ticket.aggregate([
    { $match: { city: this._id } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        avgTime: { $avg: '$timeToResolve' }
      }
    }
  ]);
  
  if (stats.length > 0) {
    this.statistics = {
      totalTickets: stats[0].total,
      openTickets: stats[0].open,
      resolvedTickets: stats[0].resolved,
      averageResolutionTime: Math.round(stats[0].avgTime || 0),
      lastUpdated: new Date()
    };
    
    return this.save();
  }
  
  return this;
};

citySchema.methods.getDistance = function(lat, lng) {
  const R = 6371; // Радіус Землі в км
  const dLat = (lat - this.coordinates.lat) * Math.PI / 180;
  const dLng = (lng - this.coordinates.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(this.coordinates.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Додаємо плагін пагінації
citySchema.plugin(mongoosePaginate);

module.exports = mongoose.model('City', citySchema);