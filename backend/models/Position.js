const mongoose = require('mongoose');

const positionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Position title is required'],
    unique: true,
    trim: true,
    maxlength: [100, 'Position title cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  department: {
    type: String,
    required: [true, 'Department is required'],
    trim: true,
    maxlength: [100, 'Department name cannot exceed 100 characters']
  },
  permissions: [{
    module: {
      type: String,
      required: true,
      enum: ['tickets', 'users', 'cities', 'positions', 'analytics', 'settings']
    },
    actions: [{
      type: String,
      enum: ['create', 'read', 'update', 'delete', 'assign', 'export']
    }]
  }],
  responsibilities: [{
    type: String,
    trim: true,
    maxlength: [200, 'Responsibility cannot exceed 200 characters']
  }],
  requirements: [{
    type: String,
    trim: true,
    maxlength: [200, 'Requirement cannot exceed 200 characters']
  }],
  skills: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    level: {
      type: String,
      enum: ['basic', 'intermediate', 'advanced', 'expert'],
      default: 'basic'
    },
    required: {
      type: Boolean,
      default: false
    }
  }],
  salary: {
    min: {
      type: Number,
      min: [0, 'Minimum salary cannot be negative']
    },
    max: {
      type: Number,
      min: [0, 'Maximum salary cannot be negative']
    },
    currency: {
      type: String,
      enum: ['UAH', 'USD', 'EUR'],
      default: 'UAH'
    }
  },
  workSchedule: {
    type: {
      type: String,
      enum: ['full-time', 'part-time', 'contract', 'remote', 'hybrid'],
      default: 'full-time'
    },
    hoursPerWeek: {
      type: Number,
      min: [1, 'Hours per week must be at least 1'],
      max: [168, 'Hours per week cannot exceed 168'],
      default: 40
    }
  },
  reportingTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Position',
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Видаляємо проблемні віртуальні поля, які можуть містити об'єкти
      delete ret.employeeCount;
      delete ret.fullTitle;
      delete ret.salaryRange;
      delete ret.id; // Mongoose автоматично додає це поле
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Віртуальні поля
positionSchema.virtual('fullTitle').get(function() {
  return this.title;
});

positionSchema.virtual('employeeCount', {
  ref: 'User',
  localField: '_id',
  foreignField: 'position',
  count: true
});

positionSchema.virtual('salaryRange').get(function() {
  if (this.salary && this.salary.min && this.salary.max) {
    return `${this.salary.min} - ${this.salary.max} ${this.salary.currency}`;
  }
  return null;
});

// Індекси для оптимізації запитів
positionSchema.index({ title: 1 });
positionSchema.index({ department: 1 });
positionSchema.index({ isActive: 1 });
positionSchema.index({ isPublic: 1 });
positionSchema.index({ reportingTo: 1 });

// Middleware для валідації зарплати
positionSchema.pre('save', function(next) {
  if (this.salary && this.salary.min && this.salary.max) {
    if (this.salary.min > this.salary.max) {
      return next(new Error('Minimum salary cannot be greater than maximum salary'));
    }
  }
  next();
});

// Статичні методи
positionSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ title: 1 });
};

positionSchema.statics.findByDepartment = function(department) {
  return this.find({ department, isActive: true }).sort({ title: 1 });
};

positionSchema.statics.findPublic = function() {
  return this.find({ isActive: true, isPublic: true }).sort({ title: 1 });
};

positionSchema.statics.getDepartments = function() {
  return this.distinct('department', { isActive: true });
};

positionSchema.statics.getHierarchy = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $lookup: {
        from: 'positions',
        localField: 'reportingTo',
        foreignField: '_id',
        as: 'manager'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: 'position',
        as: 'employees'
      }
    },
    {
      $project: {
        title: 1,
        department: 1,
        level: 1,
        manager: { $arrayElemAt: ['$manager.title', 0] },
        employeeCount: { $size: '$employees' }
      }
    },
    { $sort: { department: 1, level: 1 } }
  ]);
};

// Методи екземпляра
positionSchema.methods.hasPermission = function(module, action) {
  const permission = this.permissions.find(p => p.module === module);
  return permission && permission.actions.includes(action);
};

positionSchema.methods.addPermission = function(module, actions) {
  const existingPermission = this.permissions.find(p => p.module === module);
  
  if (existingPermission) {
    // Додаємо нові дії до існуючих
    actions.forEach(action => {
      if (!existingPermission.actions.includes(action)) {
        existingPermission.actions.push(action);
      }
    });
  } else {
    // Створюємо новий дозвіл
    this.permissions.push({ module, actions });
  }
  
  return this.save();
};

positionSchema.methods.removePermission = function(module, actions = null) {
  if (actions) {
    // Видаляємо конкретні дії
    const permission = this.permissions.find(p => p.module === module);
    if (permission) {
      permission.actions = permission.actions.filter(action => !actions.includes(action));
      if (permission.actions.length === 0) {
        this.permissions = this.permissions.filter(p => p.module !== module);
      }
    }
  } else {
    // Видаляємо весь модуль
    this.permissions = this.permissions.filter(p => p.module !== module);
  }
  
  return this.save();
};

positionSchema.methods.getSubordinates = function() {
  return this.constructor.find({ reportingTo: this._id, isActive: true });
};

positionSchema.methods.getEmployees = function() {
  const User = mongoose.model('User');
  return User.find({ position: this._id, isActive: true });
};

module.exports = mongoose.model('Position', positionSchema);