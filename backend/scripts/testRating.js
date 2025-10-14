const mongoose = require('mongoose');
require('dotenv').config();

// Підключаємо всі моделі
require('../models');

async function testRating() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Підключено до MongoDB');

    const Ticket = require('../models/Ticket');
    const User = require('../models/User');
    const Rating = require('../models/Rating');

    // Знаходимо перший тікет зі статусом resolved
    const ticket = await Ticket.findOne({ status: 'resolved' });
    if (!ticket) {
      console.log('❌ Не знайдено тікетів зі статусом "resolved"');
      process.exit(1);
    }

    console.log(`📋 Знайдено тікет: ${ticket.title} (ID: ${ticket._id})`);

    // Знаходимо або створюємо тестового користувача
    let user = await User.findOne({ email: 'test@example.com' });
    if (!user) {
      // Знаходимо першу позицію та місто
      const Position = require('../models/Position');
      const City = require('../models/City');
      
      const position = await Position.findOne();
      const city = await City.findOne();
      
      if (!position || !city) {
        console.log('❌ Не знайдено позицію або місто для створення користувача');
        process.exit(1);
      }

      user = new User({
        firstName: 'Тестовий',
        lastName: 'Користувач',
        email: 'test@example.com',
        password: 'test123',
        position: position._id,
        department: 'IT',
        city: city._id,
        role: 'user',
        isActive: true,
        registrationStatus: 'approved'
      });
      await user.save();
      console.log('👤 Створено тестового користувача');
    } else {
      console.log('👤 Знайдено тестового користувача');
    }

    // Перевіряємо, чи вже існує оцінка для цього тікета
    const existingRating = await Rating.findOne({ ticket: ticket._id });
    if (existingRating) {
      console.log('⭐ Оцінка для цього тікета вже існує');
      console.log(`Оцінка: ${existingRating.rating}/5, Коментар: ${existingRating.comment || 'Немає'}`);
      process.exit(0);
    }

    // Створюємо тестову оцінку
    const rating = new Rating({
      ticket: ticket._id,
      user: user._id,
      rating: 5,
      comment: 'Відмінна робота! Проблему вирішено швидко та якісно.',
      categories: {
        speed: 5,
        quality: 5,
        communication: 4,
        professionalism: 5
      },
      wouldRecommend: true
    });

    await rating.save();
    console.log('✅ Тестову оцінку створено успішно!');
    console.log(`⭐ Оцінка: ${rating.rating}/5`);
    console.log(`💬 Коментар: ${rating.comment}`);
    console.log(`📊 Категорії: Швидкість: ${rating.categories.speed}, Якість: ${rating.categories.quality}, Комунікація: ${rating.categories.communication}, Професіоналізм: ${rating.categories.professionalism}`);
    console.log(`👍 Рекомендує: ${rating.wouldRecommend ? 'Так' : 'Ні'}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Помилка:', error);
    process.exit(1);
  }
}

testRating();