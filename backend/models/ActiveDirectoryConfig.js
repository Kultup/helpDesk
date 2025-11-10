const mongoose = require('mongoose');

const activeDirectoryConfigSchema = new mongoose.Schema({
  key: { 
    type: String, 
    default: 'default', 
    unique: true 
  },
  enabled: {
    type: Boolean,
    default: false
  },
  ldapUrl: {
    type: String,
    required: true,
    trim: true,
    default: 'ldap://192.168.100.2:389'
  },
  adminDn: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  adminPassword: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  userSearchBase: {
    type: String,
    required: true,
    trim: true,
    default: 'dc=dreamland,dc=loc'
  },
  computerSearchBase: {
    type: String,
    required: true,
    trim: true,
    default: 'dc=dreamland,dc=loc'
  },
  usernameAttribute: {
    type: String,
    default: 'sAMAccountName',
    trim: true
  },
  timeout: {
    type: Number,
    default: 5000
  },
  connectTimeout: {
    type: Number,
    default: 10000
  },
  retryInterval: {
    type: Number,
    default: 120000 // 2 хвилини
  },
  maxRetries: {
    type: Number,
    default: 3
  }
}, { 
  timestamps: true 
});

// Індекс для швидкого пошуку
activeDirectoryConfigSchema.index({ key: 1 });

module.exports = mongoose.model('ActiveDirectoryConfig', activeDirectoryConfigSchema);

