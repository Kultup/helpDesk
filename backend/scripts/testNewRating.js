const mongoose = require('mongoose');
require('dotenv').config();
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

async function testNewRating() {
  await connectDB();
  
  try {
    console.log('🧪 Тестуємо створення нової оцінки...');
    
    // Симулюємо callback data з рейтингом 3
    const callbackData = 'rate_68d5340d74a2451a0116b1be_3';
    console.log('📞 Callback data:', callbackData);
    
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
          
          // Шукаємо або створюємо тестового користувача
          let testUser = await User.findOne({ email: 'test2@example.com' });
          
          if (!testUser) {
            testUser = new User({
              email: 'test2@example.com',
              password: 'testpassword123',
              firstName: 'Тест',
              lastName: 'Користувач2',
              position: '507f1f77bcf86cd799439011', // Використовуємо ID першої позиції
              department: 'IT',
              city: '507f1f77bcf86cd799439012', // Використовуємо ID першого міста
              registrationStatus: 'approved'
            });
            
            await testUser.save();
            console.log(`✅ Новий тестовий користувач створено: ${testUser.email}`);
          } else {
            console.log(`✅ Використовуємо існуючого користувача: ${testUser.email}`);
          }
          
          // Перевіряємо чи вже існує оцінка від цього користувача
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
              comment: `Тестова оцінка через Telegram бота (${rating}/5) - користувач 2`,
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
            console.log(`   - Користувач: ${testUser.email}`);
            console.log(`   - Джерело: Telegram`);
            console.log(`   - Рекомендація: ${rating >= 4 ? 'Так' : 'Ні'}`);
          }
          
          // Перевіряємо загальну кількість оцінок для цього тікета
          const totalRatings = await Rating.countDocuments({ ticket: ticketId });
          console.log(`📊 Загальна кількість оцінок для тікета: ${totalRatings}`);
          
        } else {
          console.log('❌ Тікет не знайдено');
        }
      } else {
        console.log('❌ Неправильний формат callback data');
      }
    } else {
      console.log('❌ Callback data не є оцінкою');
    }
    
    console.log('✅ Тест створення нової оцінки завершено успішно!');
    
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Відключено від MongoDB');
  }
}

testNewRating();