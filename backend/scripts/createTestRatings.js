const mongoose = require('mongoose');
const Rating = require('../models/Rating');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

// Підключення до бази даних
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk');
    console.log('✅ Підключено до MongoDB');
  } catch (error) {
    console.error('❌ Помилка підключення до MongoDB:', error);
    process.exit(1);
  }
};

// Функція для створення тестових рейтингів
const createTestRatings = async () => {
  try {
    console.log('🔍 Пошук існуючих тікетів та користувачів...');
    
    // Знаходимо існуючі тікети зі статусом "resolved" або "closed"
    const tickets = await Ticket.find({
      status: { $in: ['resolved', 'closed'] }
    }).populate('createdBy').limit(10);
    
    if (tickets.length === 0) {
      console.log('❌ Не знайдено тікетів зі статусом "resolved" або "closed"');
      
      // Створимо кілька тестових тікетів
      const users = await User.find().limit(3);
      const cities = await mongoose.model('City').find().limit(1);
      
      if (users.length === 0) {
        console.log('❌ Не знайдено користувачів');
        return;
      }
      
      if (cities.length === 0) {
        console.log('❌ Не знайдено міст');
        return;
      }
      
      console.log('📝 Створюємо тестові тікети...');
      const testTickets = [];
      for (let i = 0; i < 5; i++) {
        const ticket = new Ticket({
          title: `Тестовий тікет ${i + 1}`,
          description: `Опис тестового тікета ${i + 1}`,
          createdBy: users[i % users.length]._id,
          status: 'resolved',
          priority: ['low', 'medium', 'high'][i % 3],
          category: ['technical', 'account', 'billing', 'general'][i % 4],
          city: cities[0]._id
        });
        await ticket.save();
        testTickets.push(ticket);
      }
      tickets.push(...testTickets);
    }
    
    console.log(`📊 Знайдено ${tickets.length} тікетів для створення рейтингів`);
    
    // Видаляємо існуючі рейтинги для цих тікетів
    const ticketIds = tickets.map(t => t._id);
    await Rating.deleteMany({ ticket: { $in: ticketIds } });
    console.log('🗑️ Видалено існуючі рейтинги');
    
    // Створюємо нові рейтинги з повними даними
    const testRatings = [];
    const comments = [
      'Дуже швидко вирішили проблему, дякую!',
      'Відмінна робота, все зрозуміло пояснили',
      'Трохи довго чекав, але результат задовольняє',
      'Професійний підхід, рекомендую',
      'Все добре, але можна було б швидше',
      'Чудова підтримка, дуже задоволений',
      'Нормально, без особливих зауважень',
      'Відмінно! Перевершили очікування',
      null, // Без коментаря
      'Добре, але є куди рости'
    ];
    
    for (let i = 0; i < Math.min(tickets.length, 10); i++) {
      const ticket = tickets[i];
      
      // Перевіряємо, чи є createdBy
      if (!ticket.createdBy) {
        console.log(`⚠️ Пропускаємо тікет ${ticket.title} - немає createdBy`);
        continue;
      }
      
      const rating = Math.floor(Math.random() * 5) + 1; // 1-5
      
      const testRating = new Rating({
        ticket: ticket._id,
        user: ticket.createdBy._id || ticket.createdBy,
        rating: rating,
        categories: {
          speed: Math.floor(Math.random() * 5) + 1,
          quality: Math.floor(Math.random() * 5) + 1,
          communication: Math.floor(Math.random() * 5) + 1,
          professionalism: Math.floor(Math.random() * 5) + 1
        },
        comment: comments[i % comments.length],
        wouldRecommend: Math.random() > 0.3 // 70% рекомендують
      });
      
      await testRating.save();
      testRatings.push(testRating);
      console.log(`✅ Створено рейтинг ${i + 1}: ${rating} зірок для тікета "${ticket.title}"`);
    }
    
    console.log(`🎉 Успішно створено ${testRatings.length} тестових рейтингів!`);
    
    // Показуємо статистику
    const stats = await Rating.aggregate([
      {
        $group: {
          _id: null,
          totalRatings: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          averageSpeed: { $avg: '$categories.speed' },
          averageQuality: { $avg: '$categories.quality' },
          averageCommunication: { $avg: '$categories.communication' },
          averageProfessionalism: { $avg: '$categories.professionalism' },
          recommendCount: {
            $sum: {
              $cond: [{ $eq: ['$wouldRecommend', true] }, 1, 0]
            }
          }
        }
      }
    ]);
    
    if (stats.length > 0) {
      const stat = stats[0];
      console.log('\n📈 Статистика рейтингів:');
      console.log(`Загальна кількість: ${stat.totalRatings}`);
      console.log(`Середній рейтинг: ${stat.averageRating.toFixed(1)}`);
      console.log(`Рекомендують: ${stat.recommendCount}/${stat.totalRatings} (${((stat.recommendCount/stat.totalRatings)*100).toFixed(1)}%)`);
      console.log(`Середні оцінки категорій:`);
      console.log(`  Швидкість: ${stat.averageSpeed.toFixed(1)}`);
      console.log(`  Якість: ${stat.averageQuality.toFixed(1)}`);
      console.log(`  Комунікація: ${stat.averageCommunication.toFixed(1)}`);
      console.log(`  Професіоналізм: ${stat.averageProfessionalism.toFixed(1)}`);
    }
    
  } catch (error) {
    console.error('❌ Помилка при створенні тестових рейтингів:', error);
  }
};

// Запуск скрипта
const main = async () => {
  await connectDB();
  await createTestRatings();
  await mongoose.disconnect();
  console.log('👋 Відключено від MongoDB');
  process.exit(0);
};

main().catch(error => {
  console.error('❌ Критична помилка:', error);
  process.exit(1);
});