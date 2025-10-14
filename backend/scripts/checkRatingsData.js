const mongoose = require('mongoose');
require('dotenv').config();

// Підключаємо всі моделі
require('../models');

async function checkRatingsData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk');
    console.log('✅ Підключено до MongoDB');

    const Rating = require('../models/Rating');
    const Ticket = require('../models/Ticket');
    const User = require('../models/User');

    // Перевіряємо загальну кількість рейтингів
    const totalRatings = await Rating.countDocuments();
    console.log(`📊 Загальна кількість рейтингів: ${totalRatings}`);

    // Перевіряємо рейтинги за останні 30 днів
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentRatings = await Rating.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });
    console.log(`📅 Рейтинги за останні 30 днів: ${recentRatings}`);

    // Перевіряємо середній рейтинг
    const avgResult = await Rating.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalCount: { $sum: 1 }
        }
      }
    ]);
    
    if (avgResult.length > 0) {
      console.log(`⭐ Середній рейтинг за 30 днів: ${avgResult[0].averageRating?.toFixed(1) || 'N/A'}`);
    } else {
      console.log('⭐ Середній рейтинг: немає даних');
    }

    // Перевіряємо рекомендації
    const recommendStats = await Rating.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          wouldRecommend: true
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 }
        }
      }
    ]);
    
    const recommendCount = recommendStats.length > 0 ? recommendStats[0].count : 0;
    console.log(`👍 Кількість рекомендацій за 30 днів: ${recommendCount}`);
    
    if (recentRatings > 0) {
      const recommendPercentage = ((recommendCount / recentRatings) * 100).toFixed(1);
      console.log(`📈 Відсоток рекомендацій: ${recommendPercentage}%`);
    }

    // Перевіряємо рейтинги з коментарями
    const ratingsWithComments = await Rating.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
      comment: { $exists: true, $ne: '', $ne: null }
    });
    console.log(`💬 Рейтинги з коментарями за 30 днів: ${ratingsWithComments}`);

    // Показуємо останні 5 рейтингів
    console.log('\n📋 Останні 5 рейтингів:');
    const latestRatings = await Rating.find()
      .populate('ticket', 'title')
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(5);

    if (latestRatings.length === 0) {
      console.log('Рейтингів не знайдено');
    } else {
      latestRatings.forEach((rating, index) => {
        console.log(`${index + 1}. Тікет: ${rating.ticket?.title || 'N/A'}`);
        console.log(`   Користувач: ${rating.user?.firstName || 'N/A'} ${rating.user?.lastName || ''} (${rating.user?.email || 'N/A'})`);
        console.log(`   Рейтинг: ${rating.rating}/5`);
        console.log(`   Рекомендує: ${rating.wouldRecommend === true ? 'Так' : rating.wouldRecommend === false ? 'Ні' : 'Не вказано'}`);
        console.log(`   Джерело: ${rating.source || 'N/A'}`);
        console.log(`   Дата: ${rating.createdAt?.toLocaleDateString('uk-UA') || 'N/A'}`);
        console.log('');
      });
    }

    // Перевіряємо розподіл за джерелами
    console.log('📊 Розподіл за джерелами:');
    const sourceStats = await Rating.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 }
        }
      }
    ]);
    
    if (sourceStats.length === 0) {
      console.log('Немає даних за джерелами');
    } else {
      sourceStats.forEach(stat => {
        console.log(`   ${stat._id || 'Не вказано'}: ${stat.count}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Помилка:', error);
    process.exit(1);
  }
}

checkRatingsData();