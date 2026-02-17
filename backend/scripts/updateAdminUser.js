/* eslint-disable no-console */
const mongoose = require('mongoose');
require('dotenv').config();

async function updateAdminUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk');
    console.log('✅ Підключено до MongoDB');

    const result = await mongoose.connection.db.collection('users').updateOne(
      { email: 'admin@test.com' },
      {
        $set: {
          position: new mongoose.Types.ObjectId('68d12f7dfcd8b34432b5f899'),
          city: new mongoose.Types.ObjectId('68d11daa8ee8dc826f3d8f37'),
        },
      }
    );

    console.log('📝 Результат оновлення:', result);

    // Перевіряємо оновленого користувача
    const user = await mongoose.connection.db
      .collection('users')
      .findOne({ email: 'admin@test.com' });
    console.log('👤 Оновлений користувач:', user);
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Відключено від MongoDB');
  }
}

updateAdminUser();
