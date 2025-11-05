const mongoose = require('mongoose');
const logger = require('../utils/logger');
const models = require('../models');

/**
 * Отримати список всіх колекцій в базі даних
 */
exports.getCollections = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    const collectionsInfo = await Promise.all(
      collections.map(async (collection) => {
        const count = await db.collection(collection.name).countDocuments();
        const stats = await db.collection(collection.name).stats();
        
        return {
          name: collection.name,
          count,
          size: stats.size || 0,
          avgObjSize: stats.avgObjSize || 0,
          storageSize: stats.storageSize || 0,
          indexes: stats.nindexes || 0
        };
      })
    );

    res.json({
      success: true,
      data: collectionsInfo.sort((a, b) => a.name.localeCompare(b.name))
    });
  } catch (error) {
    logger.error('Помилка отримання списку колекцій:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання списку колекцій',
      error: error.message
    });
  }
};

/**
 * Отримати структуру конкретної колекції
 */
exports.getCollectionStructure = async (req, res) => {
  try {
    const { collectionName } = req.params;
    const db = mongoose.connection.db;
    
    // Перевірка, чи існує колекція
    const collections = await db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Колекцію не знайдено'
      });
    }

    // Отримуємо приклад документа
    const sampleDoc = await db.collection(collectionName).findOne({});
    
    // Отримуємо індекси
    const indexes = await db.collection(collectionName).indexes();
    
    // Отримуємо статистику
    const stats = await db.collection(collectionName).stats();
    
    // Знаходимо модель, якщо вона існує
    let modelSchema = null;
    const modelNames = Object.keys(models);
    for (const modelName of modelNames) {
      const model = models[modelName];
      if (model && model.collection && model.collection.name === collectionName) {
        // Отримуємо схему з моделі
        const schema = model.schema;
        const schemaPaths = schema.paths;
        
        modelSchema = {
          modelName: model.modelName,
          paths: Object.keys(schemaPaths).map(pathName => {
            const path = schemaPaths[pathName];
            return {
              name: pathName,
              type: path.instance || path.constructor.name,
              required: path.isRequired || false,
              default: path.defaultValue,
              enum: path.enumValues || null,
              ref: path.options?.ref || null,
              index: path.options?.index || false,
              unique: path.options?.unique || false,
              sparse: path.options?.sparse || false,
              description: path.options?.description || null
            };
          })
        };
        break;
      }
    }

    res.json({
      success: true,
      data: {
        name: collectionName,
        count: stats.count || 0,
        size: stats.size || 0,
        avgObjSize: stats.avgObjSize || 0,
        storageSize: stats.storageSize || 0,
        indexes: indexes.map(idx => ({
          name: idx.name,
          key: idx.key,
          unique: idx.unique || false,
          sparse: idx.sparse || false
        })),
        sampleDocument: sampleDoc,
        schema: modelSchema
      }
    });
  } catch (error) {
    logger.error('Помилка отримання структури колекції:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання структури колекції',
      error: error.message
    });
  }
};

/**
 * Отримати приклади документів з колекції
 */
exports.getCollectionDocuments = async (req, res) => {
  try {
    const { collectionName } = req.params;
    const { limit = 10, skip = 0 } = req.query;
    const db = mongoose.connection.db;
    
    // Перевірка, чи існує колекція
    const collections = await db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Колекцію не знайдено'
      });
    }

    const documents = await db.collection(collectionName)
      .find({})
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .toArray();
    
    const total = await db.collection(collectionName).countDocuments();

    res.json({
      success: true,
      data: {
        documents,
        total,
        limit: parseInt(limit),
        skip: parseInt(skip)
      }
    });
  } catch (error) {
    logger.error('Помилка отримання документів:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання документів',
      error: error.message
    });
  }
};

