/* eslint-disable no-console */
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function checkAndCreateIndexes() {
  try {
    // Підключення до бази даних
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Підключено до MongoDB');

    // Перевіряємо існуючі індекси
    const indexes = await User.collection.getIndexes();
    console.log('\n📋 Існуючі індекси:');
    Object.keys(indexes).forEach(indexName => {
      console.log(`  - ${indexName}:`, indexes[indexName]);
    });

    // Перевіряємо чи є унікальний індекс для email
    const emailIndexExists = Object.keys(indexes).some(
      indexName => indexes[indexName].some && indexes[indexName].some(field => field[0] === 'email')
    );

    if (emailIndexExists) {
      console.log('\n✅ Унікальний індекс для email вже існує');
    } else {
      console.log('\n⚠️  Унікальний індекс для email не знайдено');
      console.log('🔧 Створюємо унікальний індекс для email...');

      try {
        await User.collection.createIndex({ email: 1 }, { unique: true });
        console.log('✅ Унікальний індекс для email створено успішно');
      } catch (error) {
        if (error.code === 11000) {
          console.log('⚠️  Не вдалося створити індекс через існуючі дублікати');
          console.log('🔧 Спочатку потрібно видалити дублікати');
        } else {
          throw error;
        }
      }
    }

    // Перевіряємо індекси після створення
    const updatedIndexes = await User.collection.getIndexes();
    console.log('\n📋 Оновлені індекси:');
    Object.keys(updatedIndexes).forEach(indexName => {
      console.log(`  - ${indexName}:`, updatedIndexes[indexName]);
    });

    await mongoose.disconnect();
    console.log('\n✅ Відключено від MongoDB');
  } catch (error) {
    console.error('❌ Помилка:', error);
    process.exit(1);
  }
}

checkAndCreateIndexes();
