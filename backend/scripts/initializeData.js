/**
 * Скрипт для ініціалізації базових даних системи
 * Запускається: node backend/scripts/initializeData.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const logger = require('../utils/logger');
const { seedCannedResponses } = require('../seeds/cannedResponses');

async function initializeData() {
    try {
        logger.info('🚀 Початок ініціалізації даних...');

        // Підключення до MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        logger.info('✅ Підключено до MongoDB');

        // Seed шаблонів відповідей
        logger.info('📝 Створення базових шаблонів відповідей...');
        await seedCannedResponses();

        logger.info('✅ Ініціалізація даних завершена успішно!');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Помилка ініціалізації даних:', error);
        process.exit(1);
    }
}

// Запуск
initializeData();
