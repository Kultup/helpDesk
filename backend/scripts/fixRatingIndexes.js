const mongoose = require('mongoose');
require('dotenv').config();

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

async function fixRatingIndexes() {
  await connectDB();
  
  try {
    console.log('🔧 Виправляємо індекси для колекції ratings...');
    
    const db = mongoose.connection.db;
    const collection = db.collection('ratings');
    
    // Отримуємо список існуючих індексів
    const indexes = await collection.indexes();
    console.log('📋 Існуючі індекси:');
    indexes.forEach(index => {
      console.log(`   - ${index.name}: ${JSON.stringify(index.key)}`);
    });
    
    // Видаляємо старий унікальний індекс на ticket
    try {
      await collection.dropIndex({ ticket: 1 });
      console.log('✅ Видалено старий унікальний індекс на ticket');
    } catch (error) {
      if (error.code === 27) {
        console.log('⚠️ Індекс на ticket не знайдено (можливо вже видалено)');
      } else {
        console.log('❌ Помилка видалення індексу:', error.message);
      }
    }
    
    // Створюємо новий комбінований унікальний індекс
    try {
      await collection.createIndex({ ticket: 1, user: 1 }, { unique: true });
      console.log('✅ Створено новий комбінований унікальний індекс (ticket + user)');
    } catch (error) {
      if (error.code === 85) {
        console.log('⚠️ Індекс вже існує');
      } else {
        console.log('❌ Помилка створення індексу:', error.message);
      }
    }
    
    // Перевіряємо нові індекси
    const newIndexes = await collection.indexes();
    console.log('📋 Оновлені індекси:');
    newIndexes.forEach(index => {
      console.log(`   - ${index.name}: ${JSON.stringify(index.key)}`);
    });
    
    console.log('✅ Індекси успішно оновлено!');
    
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Відключено від MongoDB');
  }
}

fixRatingIndexes();