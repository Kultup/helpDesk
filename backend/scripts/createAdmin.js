/* eslint-disable no-console */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function createUsers() {
  try {
    console.log('Підключення до MongoDB...');

    // Підключення до MongoDB
    await mongoose.connect('mongodb://localhost:27017/helpdesk', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Підключено до MongoDB');

    // Видаляємо існуючого адміністратора за email або login
    const deleteResult = await mongoose.connection.db.collection('users').deleteMany({
      $or: [{ email: 'admin@test.com' }, { login: 'admin' }],
    });
    console.log(`🗑️ Старого адміністратора видалено: ${deleteResult.deletedCount}`);

    // Хешуємо пароль
    const adminHashedPassword = await bcrypt.hash('admin123', 12);

    // Знаходимо або створюємо місто та посаду
    let city = await mongoose.connection.db.collection('cities').findOne({ name: 'Київ' });
    if (!city) {
      console.log('🏙️ Створюємо місто "Київ"...');
      const cityResult = await mongoose.connection.db.collection('cities').insertOne({
        name: 'Київ',
        region: 'Київська область',
        country: 'Україна',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      city = await mongoose.connection.db
        .collection('cities')
        .findOne({ _id: cityResult.insertedId });
      console.log('✅ Місто "Київ" створено');
    }

    // Створюємо або знаходимо посаду адміністратора
    let adminPosition = await mongoose.connection.db.collection('positions').findOne({
      $or: [{ title: 'Адміністратор системи' }, { name: 'Адміністратор системи' }],
    });

    if (!adminPosition) {
      console.log('💼 Створюємо посаду "Адміністратор системи"...');
      const positionResult = await mongoose.connection.db.collection('positions').insertOne({
        title: 'Адміністратор системи',
        name: 'Адміністратор системи',
        description: 'Адміністратор системи з повними правами',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      adminPosition = await mongoose.connection.db
        .collection('positions')
        .findOne({ _id: positionResult.insertedId });
      console.log('✅ Посаду "Адміністратор системи" створено');
    }

    console.log('🏙️ Знайдено місто:', city.name, '- ID:', city._id);
    console.log(
      '💼 Знайдено посаду адміністратора:',
      adminPosition.title || adminPosition.name,
      '- ID:',
      adminPosition._id
    );

    // Створюємо тестового адміністратора
    const adminData = {
      email: 'admin@test.com',
      login: 'admin',
      password: adminHashedPassword,
      firstName: 'Admin',
      lastName: 'Test',
      role: 'admin',
      department: 'IT відділ',
      city: city._id,
      position: adminPosition._id,
      isActive: true,
      isEmailVerified: true,
      registrationStatus: 'approved',
      statistics: {
        ticketsCreated: 0,
        ticketsResolved: 0,
        averageResolutionTime: 0,
        totalRatings: 0,
      },
      preferences: {
        theme: 'light',
        language: 'uk',
        timezone: 'Europe/Kiev',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24h',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Додаємо або оновлюємо адміністратора у базі даних (використовуємо upsert)
    const _adminResult = await mongoose.connection.db
      .collection('users')
      .updateOne(
        { $or: [{ email: 'admin@test.com' }, { login: 'admin' }] },
        { $set: adminData },
        { upsert: true }
      );
    console.log('✅ Адміністратора admin створено/оновлено');

    // Перевіряємо створення
    const User = require('../models/User');

    // Знаходимо користувача за email або login
    const newAdmin = await User.findOne({
      $or: [{ email: 'admin@test.com' }, { login: 'admin' }],
    }).select('+password');
    if (newAdmin) {
      console.log('\n📊 Інформація про адміністратора:');
      console.log('📧 Email:', newAdmin.email);
      console.log('👤 Login:', newAdmin.login);
      console.log("👤 Ім'я:", newAdmin.firstName, newAdmin.lastName);
      console.log('🔑 Роль:', newAdmin.role);
      console.log('🔐 Пароль присутній:', !!newAdmin.password);

      // Тестуємо пароль
      const isValid = await newAdmin.comparePassword('admin123');
      console.log('🔍 Пароль валідний:', isValid ? '✅ Так' : '❌ Ні');
      console.log('\n📝 Облікові дані для входу:');
      console.log('   Login: admin');
      console.log('   Password: admin123');
    } else {
      console.log('❌ Помилка: Адміністратор не знайдений після створення');
    }
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    mongoose.connection.close();
  }
}

createUsers();
