/* eslint-disable no-console */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function checkAdmin() {
  try {
    console.log('Підключення до MongoDB...');

    await mongoose.connect('mongodb://localhost:27017/helpdesk', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Підключено до MongoDB\n');

    const User = require('../models/User');

    // Шукаємо адміністратора (без populate, оскільки моделі можуть бути не зареєстровані)
    const admin = await User.findOne({
      $or: [{ email: 'admin@test.com' }, { login: 'admin' }],
    }).select('+password');

    if (!admin) {
      console.log('❌ Адміністратор не знайдений!');
      console.log('💡 Запустіть: node scripts/createAdmin.js');
      return;
    }

    console.log('✅ Адміністратор знайдений:\n');
    console.log('📧 Email:', admin.email);
    console.log('👤 Login:', admin.login);
    console.log("👤 Ім'я:", admin.firstName, admin.lastName);
    console.log('🔑 Роль:', admin.role);
    console.log('🏢 Відділ:', admin.department || 'не вказано');
    console.log('📍 Місто ID:', admin.city || 'не вказано');
    console.log('💼 Посада ID:', admin.position || 'не вказано');
    console.log('✅ isActive:', admin.isActive);
    console.log('✅ registrationStatus:', admin.registrationStatus);
    console.log('✅ isEmailVerified:', admin.isEmailVerified);
    console.log('🔐 Пароль присутній:', !!admin.password);

    // Тестуємо пароль
    if (admin.password) {
      const isValid = await bcrypt.compare('admin123', admin.password);
      console.log('🔍 Пароль "admin123" валідний:', isValid ? '✅ Так' : '❌ Ні');
    }

    // Перевіряємо можливість входу
    console.log('\n📋 Перевірка можливості входу:');
    if (!admin.isActive) {
      console.log('❌ Акаунт неактивний (isActive: false)');
    }
    if (admin.registrationStatus !== 'approved') {
      console.log(`❌ Статус реєстрації: ${admin.registrationStatus} (має бути "approved")`);
    }
    if (!admin.password) {
      console.log('❌ Пароль відсутній');
    }

    if (admin.isActive && admin.registrationStatus === 'approved' && admin.password) {
      console.log('✅ Всі умови для входу виконані');
      console.log('\n📝 Облікові дані для входу:');
      console.log('   Login: admin');
      console.log('   Password: admin123');
    } else {
      console.log('\n❌ Є проблеми з налаштуванням адміністратора');
      console.log('💡 Запустіть: node scripts/createAdmin.js');
    }
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkAdmin();
