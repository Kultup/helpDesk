const mongoose = require('mongoose');

const emailSettingsSchema = new mongoose.Schema({
  // SMTP налаштування
  smtp: {
    host: {
      type: String,
      required: true,
      trim: true
    },
    port: {
      type: Number,
      required: true,
      default: 587
    },
    secure: {
      type: Boolean,
      default: false
    },
    user: {
      type: String,
      required: true,
      trim: true
    },
    password: {
      type: String,
      required: true
      // Пароль буде шифрований
    },
    from: {
      type: String,
      required: true,
      trim: true
    },
    fromName: {
      type: String,
      trim: true,
      default: 'Help Desk System'
    }
  },
  // IMAP/POP3 налаштування для вхідних листів
  imap: {
    enabled: {
      type: Boolean,
      default: false
    },
    host: {
      type: String,
      trim: true
    },
    port: {
      type: Number,
      default: 993
    },
    secure: {
      type: Boolean,
      default: true
    },
    user: {
      type: String,
      trim: true
    },
    password: {
      type: String
      // Пароль буде шифрований
    },
    mailbox: {
      type: String,
      default: 'INBOX'
    }
  },
  pop3: {
    enabled: {
      type: Boolean,
      default: false
    },
    host: {
      type: String,
      trim: true
    },
    port: {
      type: Number,
      default: 995
    },
    secure: {
      type: Boolean,
      default: true
    },
    user: {
      type: String,
      trim: true
    },
    password: {
      type: String
      // Пароль буде шифрований
    }
  },
  // Email адреса для створення тикетів
  ticketEmail: {
    type: String,
    required: true,
    trim: true
  },
  // Правила автоматичної категорізації
  autoCategorization: {
    enabled: {
      type: Boolean,
      default: false
    },
    rules: [{
      condition: {
        type: {
          type: String,
          enum: ['subject', 'from', 'body'],
          required: true
        },
        operator: {
          type: String,
          enum: ['contains', 'equals', 'startsWith', 'endsWith', 'regex'],
          required: true
        },
        value: {
          type: String,
          required: true
        }
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
      }
    }]
  },
  // Налаштування черги
  queue: {
    enabled: {
      type: Boolean,
      default: false
    },
    maxConcurrent: {
      type: Number,
      default: 5
    },
    retryAttempts: {
      type: Number,
      default: 3
    },
    retryDelay: {
      type: Number,
      default: 60000 // 1 хвилина
    }
  },
  // Активність
  isActive: {
    type: Boolean,
    default: true
  },
  // Автор налаштувань
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
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Індекси
emailSettingsSchema.index({ isActive: 1 });

// Методи
emailSettingsSchema.methods.testConnection = async function() {
  try {
    // Тестуємо SMTP підключення
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: this.smtp.host,
      port: this.smtp.port,
      secure: this.smtp.secure,
      auth: {
        user: this.smtp.user,
        pass: this.smtp.password
      }
    });

    await transporter.verify();
    return { success: true, message: 'SMTP connection successful' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// Статичні методи
emailSettingsSchema.statics.getActive = async function() {
  const settings = await this.findOne({ isActive: true });
  if (settings) {
    return settings;
  }
  
  // Якщо немає активних налаштувань, створюємо дефолтні з environment variables
  const defaultSettings = new this({
    smtp: {
      host: process.env.EMAIL_HOST || '',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: parseInt(process.env.EMAIL_PORT || '587') === 465,
      user: process.env.EMAIL_USER || '',
      password: process.env.EMAIL_PASS || '',
      from: process.env.EMAIL_USER || '',
      fromName: 'Help Desk System'
    },
    ticketEmail: process.env.EMAIL_USER || '',
    isActive: true
  });

  return defaultSettings;
};

module.exports = mongoose.model('EmailSettings', emailSettingsSchema);

