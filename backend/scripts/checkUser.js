/* eslint-disable no-console */
const mongoose = require('mongoose');
const User = require('../models/User');
// Import models to ensure they are registered
require('../models/City');
require('../models/Position');
require('../models/Institution');

const identifier = process.argv[2];

if (!identifier) {
  console.log('Використання: node scripts/checkUser.js <email|login|telegramId>');
  process.exit(1);
}

async function checkUser() {
  try {
    console.log('Підключення до MongoDB...');
    await mongoose.connect('mongodb://localhost:27017/helpdesk', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Підключено');

    const user = await User.findOne({
      $or: [
        { email: identifier },
        { login: identifier },
        { telegramId: identifier },
        { telegramChatId: identifier },
      ],
    })
      .populate('position')
      .populate('city')
      .populate('institution');

    if (!user) {
      console.log(`❌ Користувача не знайдено за ідентифікатором: ${identifier}`);
    } else {
      console.log('\n📊 Інформація про користувача:');
      console.log(`ID: ${user._id}`);
      console.log(`Email: ${user.email}`);
      console.log(`Login: ${user.login}`);
      console.log(`Ім'я: ${user.firstName} ${user.lastName}`);
      console.log(
        `Роль: ${user.role} ${user.role === 'admin' || user.role === 'manager' ? '✅ (Має право імпорту)' : '❌ (НЕМАЄ права імпорту)'}`
      );
      console.log(`Telegram ID: ${user.telegramId || 'Не вказано'}`);
      console.log(`Telegram Chat ID: ${user.telegramChatId || 'Не вказано'}`);
      console.log(`Посада: ${user.position ? user.position.title : 'Не вказано'}`);
      console.log(`Місто: ${user.city ? user.city.name : 'Не вказано'}`);
    }
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkUser();
