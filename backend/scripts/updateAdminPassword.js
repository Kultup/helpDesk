const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Підключення до MongoDB
mongoose.connect('mongodb://localhost:27017/helpdesk', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function updateAdminPassword() {
  try {
    console.log('Підключення до MongoDB...');
    
    // Знаходимо користувача
    const user = await User.findOne({ email: 'admin@test.com' });
    
    if (!user) {
      console.log('❌ Користувача не знайдено');
      return;
    }
    
    console.log('✅ Користувач знайдений:', user.email);
    
    // Хешуємо новий пароль
    const hashedPassword = await bcrypt.hash('admin123', 12);
    console.log('🔐 Пароль захешований');
    
    // Оновлюємо пароль напряму в базі даних
    await User.findByIdAndUpdate(user._id, { 
      password: hashedPassword 
    });
    
    console.log('✅ Пароль оновлено успішно!');
    
    // Перевіряємо оновлення
    const updatedUser = await User.findById(user._id);
    const isValid = await bcrypt.compare('admin123', updatedUser.password);
    console.log('🔍 Перевірка пароля:', isValid ? '✅ Успішно' : '❌ Помилка');
    
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    mongoose.connection.close();
  }
}

updateAdminPassword();