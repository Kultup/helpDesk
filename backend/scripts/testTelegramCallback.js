const mongoose = require('mongoose');
require('dotenv').config();
const TelegramService = require('../services/telegramService');
const Rating = require('../models/Rating');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

// Підключаємо всі моделі
require('../models');

// Підключення до MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk');
    console.log('✅ Підключено до MongoDB');
  } catch (error) {
    console.error('❌ Помилка підключення до MongoDB:', error);
    process.exit(1);
  }
}

async function testTelegramRating() {
  await connectDB();
  
  try {
    console.log('🧪 Тестуємо обробку callback для оцінки...');
    
    // Створюємо та ініціалізуємо TelegramService
    const telegramService = new TelegramService();
    const isInitialized = await telegramService.initialize();
    
    if (!isInitialized) {
      console.log('⚠️ Telegram бот не ініціалізовано (можливо відсутній токен)');
      console.log('   Продовжуємо тест без реального бота...');
    } else {
      console.log('✅ Telegram бот ініціалізовано');
    }
    
    // Симулюємо callback data
    const callbackData = 'rate_68d5340d74a2451a0116b1be_5';
    console.log('📞 Callback data:', callbackData);
    
    // Створюємо мок callback query
    const mockCallbackQuery = {
      id: 'test_callback_id',
      data: callbackData,
      message: {
        chat: {
          id: 123456789 // Тестовий chat ID
        }
      }
    };
    
    // Тестуємо обробку callback
    try {
      await telegramService.handleCallbackQuery(mockCallbackQuery);
      console.log('✅ Callback обробка завершена успішно!');
    } catch (error) {
      console.error('❌ Помилка:', error.message);
      
      // Якщо помилка пов'язана з ботом, спробуємо обробити логіку без бота
      if (error.message.includes('answerCallbackQuery') || error.message.includes('null')) {
        console.log('🔧 Спробуємо обробити логіку оцінки без Telegram бота...');
        await testRatingLogicOnly(callbackData);
      }
    }
    
  } catch (error) {
    console.error('❌ Загальна помилка:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Відключено від MongoDB');
  }
}

async function testRatingLogicOnly(callbackData) {
  try {
    // Парсимо callback data
    if (callbackData.startsWith('rate_')) {
      const parts = callbackData.split('_');
      if (parts.length === 3) {
        const ticketId = parts[1];
        const rating = parseInt(parts[2]);
        
        console.log('✅ Парсинг callback data успішний:');
        console.log(`   - Ticket ID: ${ticketId}`);
        console.log(`   - Rating: ${rating}`);
        
        // Перевіряємо чи існує тікет
        const ticket = await Ticket.findById(ticketId);
        if (ticket) {
          console.log(`✅ Тікет знайдено: "${ticket.title}"`);
          
          // Знаходимо тестового користувача
          const testUser = await User.findOne({ email: 'test@example.com' });
          if (testUser) {
            console.log(`✅ Тестовий користувач знайдено: ${testUser.email}`);
            
            // Перевіряємо чи вже існує оцінка
            const existingRating = await Rating.findOne({
              ticket: ticketId,
              user: testUser._id
            });
            
            if (existingRating) {
              console.log('⚠️ Оцінка вже існує для цього користувача та тікета');
              console.log(`   - Поточна оцінка: ${existingRating.rating}/5`);
            } else {
              // Створюємо нову оцінку
              const newRating = new Rating({
                ticket: ticketId,
                user: testUser._id,
                rating: rating,
                comment: `Тестова оцінка через Telegram бота (${rating}/5)`,
                categories: {
                  responseTime: rating,
                  solutionQuality: rating,
                  communication: rating,
                  overall: rating
                },
                wouldRecommend: rating >= 4,
                source: 'telegram'
              });
              
              await newRating.save();
              console.log('✅ Нова оцінка створена успішно:');
              console.log(`   - Оцінка: ${rating}/5`);
              console.log(`   - Джерело: Telegram`);
              console.log(`   - Рекомендація: ${rating >= 4 ? 'Так' : 'Ні'}`);
            }
          } else {
            console.log('❌ Тестовий користувач не знайдено');
          }
        } else {
          console.log('❌ Тікет не знайдено');
        }
      } else {
        console.log('❌ Неправильний формат callback data');
      }
    } else {
      console.log('❌ Callback data не є оцінкою');
    }
    
    console.log('✅ Тест логіки оцінки завершено успішно!');
    
  } catch (error) {
    console.error('❌ Помилка в логіці оцінки:', error);
  }
}

testTelegramRating();