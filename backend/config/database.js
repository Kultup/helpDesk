const mongoose = require('mongoose');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.connection = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk';
      
      const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: process.env.NODE_ENV === 'production' ? 20 : 10,
        minPoolSize: process.env.NODE_ENV === 'production' ? 5 : 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        
        maxIdleTimeMS: 30000,
        connectTimeoutMS: 10000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        w: 'majority',
        readPreference: 'primary',
        compressors: ['zlib'],
        zlibCompressionLevel: 6
      };

      this.connection = await mongoose.connect(mongoUri, options);
      this.isConnected = true;

      logger.db('MongoDB connected successfully', {
        host: this.connection.connection.host,
        port: this.connection.connection.port,
        database: this.connection.connection.name
      });

      // Обробка подій підключення
      mongoose.connection.on('error', (error) => {
        logger.error('MongoDB connection error:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
        this.isConnected = true;
      });

      return this.connection;
    } catch (error) {
      logger.error('Failed to connect to MongoDB:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.connection) {
        await mongoose.disconnect();
        this.isConnected = false;
        logger.info('MongoDB disconnected gracefully');
      }
    } catch (error) {
      logger.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  }

  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: 'disconnected', message: 'Database not connected' };
      }

      // Перевірка підключення через ping
      await mongoose.connection.db.admin().ping();
      
      return {
        status: 'healthy',
        message: 'Database connection is healthy',
        details: this.getConnectionStatus()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Database health check failed',
        error: error.message
      };
    }
  }
}

// Створення singleton екземпляра
const database = new Database();

module.exports = database;