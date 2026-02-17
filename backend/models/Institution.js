const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const institutionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Institution name is required'],
      unique: true,
      trim: true,
      maxlength: [200, 'Institution name cannot exceed 200 characters'],
    },
    nameEn: {
      type: String,
      trim: true,
      maxlength: [200, 'English name cannot exceed 200 characters'],
    },
    type: {
      type: String,
      enum: [
        'school',
        'university',
        'hospital',
        'clinic',
        'library',
        'museum',
        'theater',
        'cinema',
        'restaurant',
        'cafe',
        'hotel',
        'bank',
        'post_office',
        'police_station',
        'fire_station',
        'government',
        'court',
        'embassy',
        'shopping_center',
        'market',
        'pharmacy',
        'gas_station',
        'transport_hub',
        'airport',
        'train_station',
        'other',
      ],
      default: 'other',
    },
    typeEn: {
      type: String,
      enum: [
        'school',
        'university',
        'hospital',
        'clinic',
        'library',
        'museum',
        'theater',
        'cinema',
        'restaurant',
        'cafe',
        'hotel',
        'bank',
        'post_office',
        'police_station',
        'fire_station',
        'government',
        'court',
        'embassy',
        'shopping_center',
        'market',
        'pharmacy',
        'gas_station',
        'transport_hub',
        'airport',
        'train_station',
        'other',
      ],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    descriptionEn: {
      type: String,
      trim: true,
      maxlength: [1000, 'English description cannot exceed 1000 characters'],
    },
    address: {
      street: {
        type: String,
        trim: true,
        maxlength: [200, 'Street address cannot exceed 200 characters'],
      },
      streetEn: {
        type: String,
        trim: true,
        maxlength: [200, 'English street address cannot exceed 200 characters'],
      },
      city: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'City',
      },
      postalCode: {
        type: String,
        match: [/^\d{5}$/, 'Postal code must be 5 digits'],
      },
      district: {
        type: String,
        trim: true,
        maxlength: [100, 'District name cannot exceed 100 characters'],
      },
      districtEn: {
        type: String,
        trim: true,
        maxlength: [100, 'English district name cannot exceed 100 characters'],
      },
    },
    coordinates: {
      lat: {
        type: Number,
        min: [-90, 'Latitude must be between -90 and 90'],
        max: [90, 'Latitude must be between -90 and 90'],
      },
      lng: {
        type: Number,
        min: [-180, 'Longitude must be between -180 and 180'],
        max: [180, 'Longitude must be between -180 and 180'],
      },
    },
    contact: {
      phone: {
        type: String,
        match: [/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'],
      },
      email: {
        type: String,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email format'],
      },
      website: {
        type: String,
        match: [/^https?:\/\/.+/, 'Website must be a valid URL'],
      },
      fax: {
        type: String,
        match: [/^\+?[1-9]\d{1,14}$/, 'Invalid fax number format'],
      },
    },
    workingHours: {
      monday: {
        open: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        close: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        closed: { type: Boolean, default: false },
      },
      tuesday: {
        open: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        close: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        closed: { type: Boolean, default: false },
      },
      wednesday: {
        open: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        close: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        closed: { type: Boolean, default: false },
      },
      thursday: {
        open: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        close: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        closed: { type: Boolean, default: false },
      },
      friday: {
        open: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        close: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        closed: { type: Boolean, default: false },
      },
      saturday: {
        open: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        close: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        closed: { type: Boolean, default: true },
      },
      sunday: {
        open: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        close: { type: String, match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'] },
        closed: { type: Boolean, default: true },
      },
    },
    capacity: {
      type: Number,
      min: [0, 'Capacity cannot be negative'],
      default: null,
    },
    services: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
          maxlength: [100, 'Service name cannot exceed 100 characters'],
        },
        nameEn: {
          type: String,
          trim: true,
          maxlength: [100, 'English service name cannot exceed 100 characters'],
        },
        description: {
          type: String,
          trim: true,
          maxlength: [300, 'Service description cannot exceed 300 characters'],
        },
        price: {
          type: Number,
          min: [0, 'Price cannot be negative'],
        },
        currency: {
          type: String,
          enum: ['UAH', 'USD', 'EUR'],
          default: 'UAH',
        },
      },
    ],
    rating: {
      average: {
        type: Number,
        min: [0, 'Rating cannot be negative'],
        max: [5, 'Rating cannot exceed 5'],
        default: 0,
      },
      count: {
        type: Number,
        min: [0, 'Rating count cannot be negative'],
        default: 0,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: [50, 'Tag cannot exceed 50 characters'],
      },
    ],
    statistics: {
      totalTickets: {
        type: Number,
        default: 0,
      },
      openTickets: {
        type: Number,
        default: 0,
      },
      resolvedTickets: {
        type: Number,
        default: 0,
      },
      averageResolutionTime: {
        type: Number,
        default: 0,
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Віртуальні поля
institutionSchema.virtual('fullName').get(function () {
  return `${this.name} (${this.type})`;
});

institutionSchema.virtual('fullAddress').get(function () {
  return `${this.address.street}, ${this.address.city}`;
});

institutionSchema.virtual('ticketResolutionRate').get(function () {
  if (this.statistics.totalTickets === 0) {
    return 0;
  }
  return ((this.statistics.resolvedTickets / this.statistics.totalTickets) * 100).toFixed(2);
});

institutionSchema.virtual('isOpen').get(function () {
  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = dayNames[now.getDay()];
  const currentTime = now.toTimeString().slice(0, 5);

  const todayHours = this.workingHours[today];
  if (!todayHours || todayHours.closed) {
    return false;
  }

  return currentTime >= todayHours.open && currentTime <= todayHours.close;
});

// Індекси
institutionSchema.index({ name: 1 });
institutionSchema.index({ nameEn: 1 });
institutionSchema.index({ type: 1 });
institutionSchema.index({ 'address.city': 1 });
institutionSchema.index({ isActive: 1 });
institutionSchema.index({ isPublic: 1 });
institutionSchema.index({ isVerified: 1 });
institutionSchema.index({ 'coordinates.lat': 1, 'coordinates.lng': 1 });
institutionSchema.index({ 'statistics.totalTickets': -1 });
institutionSchema.index({ 'rating.average': -1 });
institutionSchema.index({ tags: 1 });

// Middleware
institutionSchema.pre('save', function (next) {
  if (this.isModified('name') || this.isModified('type')) {
    this.lastModifiedBy = this.createdBy;
  }

  // Автоматично встановлюємо typeEn якщо не вказано
  if (!this.typeEn && this.type) {
    this.typeEn = this.type;
  }

  next();
});

// Статичні методи
institutionSchema.statics.findActive = function () {
  return this.find({ isActive: true });
};

institutionSchema.statics.findByType = function (type) {
  return this.find({ type, isActive: true });
};

institutionSchema.statics.findByCity = function (cityId) {
  return this.find({ 'address.city': cityId, isActive: true });
};

institutionSchema.statics.findPublic = function () {
  return this.find({ isPublic: true, isActive: true });
};

institutionSchema.statics.findVerified = function () {
  return this.find({ isVerified: true, isActive: true });
};

institutionSchema.statics.findNearby = function (lat, lng, maxDistance = 10) {
  return this.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distance',
        maxDistance: maxDistance * 1000, // конвертуємо км в метри
        spherical: true,
        query: { isActive: true },
      },
    },
  ]);
};

institutionSchema.statics.getTypes = function () {
  return this.distinct('type');
};

institutionSchema.statics.getStatistics = function () {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalInstitutions: { $sum: 1 },
        verifiedInstitutions: { $sum: { $cond: ['$isVerified', 1, 0] } },
        publicInstitutions: { $sum: { $cond: ['$isPublic', 1, 0] } },
        averageRating: { $avg: '$rating.average' },
        totalTickets: { $sum: '$statistics.totalTickets' },
        totalResolvedTickets: { $sum: '$statistics.resolvedTickets' },
      },
    },
  ]);
};

// Методи екземпляра
institutionSchema.methods.updateStatistics = async function () {
  const Ticket = mongoose.model('Ticket');

  const stats = await Ticket.aggregate([
    { $match: { institution: this._id } },
    {
      $group: {
        _id: null,
        totalTickets: { $sum: 1 },
        openTickets: { $sum: { $cond: [{ $in: ['$status', ['open', 'in_progress']] }, 1, 0] } },
        resolvedTickets: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        avgResolutionTime: { $avg: '$resolutionTime' },
      },
    },
  ]);

  if (stats.length > 0) {
    this.statistics = {
      totalTickets: stats[0].totalTickets || 0,
      openTickets: stats[0].openTickets || 0,
      resolvedTickets: stats[0].resolvedTickets || 0,
      averageResolutionTime: stats[0].avgResolutionTime || 0,
      lastUpdated: new Date(),
    };

    await this.save();
  }
};

institutionSchema.methods.getDistance = function (lat, lng) {
  const R = 6371; // Радіус Землі в км
  const dLat = ((lat - this.coordinates.lat) * Math.PI) / 180;
  const dLng = ((lng - this.coordinates.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((this.coordinates.lat * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

institutionSchema.methods.addService = function (service) {
  this.services.push(service);
  return this.save();
};

institutionSchema.methods.removeService = function (serviceId) {
  this.services.id(serviceId).remove();
  return this.save();
};

institutionSchema.methods.updateRating = function (newRating) {
  const totalRating = this.rating.average * this.rating.count + newRating;
  this.rating.count += 1;
  this.rating.average = totalRating / this.rating.count;
  return this.save();
};

// Плагіни
institutionSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Institution', institutionSchema);
