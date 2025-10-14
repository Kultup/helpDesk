const mongoose = require('mongoose');
const Rating = require('../models/Rating');

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

// Функція для оновлення існуючих рейтингів
const updateExistingRatings = async () => {
  try {
    console.log('🔍 Пошук існуючих рейтингів...');
    
    const ratings = await Rating.find();
    console.log(`📊 Знайдено ${ratings.length} рейтингів`);
    
    if (ratings.length === 0) {
      console.log('❌ Немає рейтингів для оновлення');
      return;
    }
    
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
    
    let updatedCount = 0;
    
    for (let i = 0; i < ratings.length; i++) {
      const rating = ratings[i];
      
      // Оновлюємо рейтинг з повними даними
      const updatedRating = await Rating.findByIdAndUpdate(
        rating._id,
        {
          categories: {
            speed: Math.floor(Math.random() * 5) + 1,
            quality: Math.floor(Math.random() * 5) + 1,
            communication: Math.floor(Math.random() * 5) + 1,
            professionalism: Math.floor(Math.random() * 5) + 1
          },
          comment: comments[i % comments.length],
          wouldRecommend: Math.random() > 0.3 // 70% рекомендують
        },
        { new: true }
      );
      
      if (updatedRating) {
        updatedCount++;
        console.log(`✅ Оновлено рейтинг ${i + 1}: ${rating.rating} зірок`);
      }
    }
    
    console.log(`🎉 Успішно оновлено ${updatedCount} рейтингів!`);
    
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
          },
          withComments: {
            $sum: {
              $cond: [{ $ne: ['$comment', null] }, 1, 0]
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
      console.log(`З коментарями: ${stat.withComments}/${stat.totalRatings} (${((stat.withComments/stat.totalRatings)*100).toFixed(1)}%)`);
      console.log(`Середні оцінки категорій:`);
      console.log(`  Швидкість: ${stat.averageSpeed ? stat.averageSpeed.toFixed(1) : 'N/A'}`);
      console.log(`  Якість: ${stat.averageQuality ? stat.averageQuality.toFixed(1) : 'N/A'}`);
      console.log(`  Комунікація: ${stat.averageCommunication ? stat.averageCommunication.toFixed(1) : 'N/A'}`);
      console.log(`  Професіоналізм: ${stat.averageProfessionalism ? stat.averageProfessionalism.toFixed(1) : 'N/A'}`);
    }
    
  } catch (error) {
    console.error('❌ Помилка при оновленні рейтингів:', error);
  }
};

// Запуск скрипта
const main = async () => {
  await connectDB();
  await updateExistingRatings();
  await mongoose.disconnect();
  console.log('👋 Відключено від MongoDB');
  process.exit(0);
};

main().catch(error => {
  console.error('❌ Критична помилка:', error);
  process.exit(1);
});