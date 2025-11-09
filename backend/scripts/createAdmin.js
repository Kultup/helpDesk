const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function createUsers() {
  try {
    console.log('Підключення до MongoDB...');
    
    // Підключення до MongoDB
    await mongoose.connect('mongodb://localhost:27017/helpdesk', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Підключено до MongoDB');
    
    // Видаляємо існуючих адміністраторів
    await mongoose.connection.db.collection('users').deleteMany({ 
      $or: [
        { email: 'kenny@test.com' },
        { email: 'kultup@test.com' }
      ]
    });
    console.log('🗑️ Старих адміністраторів видалено');
    
    // Хешуємо паролі
    const kennyHashedPassword = await bcrypt.hash('Xedfxtkkj!', 12);
    const kultupHashedPassword = await bcrypt.hash('Qa123456', 12);
    
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
        updatedAt: new Date()
      });
      city = await mongoose.connection.db.collection('cities').findOne({ _id: cityResult.insertedId });
      console.log('✅ Місто "Київ" створено');
    }
    
    // Створюємо або знаходимо посаду адміністратора
    let adminPosition = await mongoose.connection.db.collection('positions').findOne({ 
      $or: [
        { title: 'Адміністратор системи' },
        { name: 'Адміністратор системи' }
      ]
    });
    
    if (!adminPosition) {
      console.log('💼 Створюємо посаду "Адміністратор системи"...');
      const positionResult = await mongoose.connection.db.collection('positions').insertOne({
        title: 'Адміністратор системи',
        name: 'Адміністратор системи',
        description: 'Адміністратор системи з повними правами',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      adminPosition = await mongoose.connection.db.collection('positions').findOne({ _id: positionResult.insertedId });
      console.log('✅ Посаду "Адміністратор системи" створено');
    }
    
    console.log('🏙️ Знайдено місто:', city.name, '- ID:', city._id);
    console.log('💼 Знайдено посаду адміністратора:', adminPosition.title || adminPosition.name, '- ID:', adminPosition._id);
    
    // Створюємо першого адміністратора (kenny)
    const kennyData = {
      email: 'kenny@test.com',
      password: kennyHashedPassword,
      firstName: 'Kenny',
      lastName: 'Admin',
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
        totalRatings: 0
      },
      preferences: {
        theme: 'light',
        language: 'uk',
        timezone: 'Europe/Kiev',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24h'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Створюємо другого адміністратора (kultup)
    const kultupData = {
      email: 'kultup@test.com',
      password: kultupHashedPassword,
      firstName: 'Kultup',
      lastName: 'Admin',
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
        totalRatings: 0
      },
      preferences: {
        theme: 'light',
        language: 'uk',
        timezone: 'Europe/Kiev',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24h'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Додаємо адміністраторів до бази даних
    const kennyResult = await mongoose.connection.db.collection('users').insertOne(kennyData);
    console.log('✅ Адміністратора kenny створено');
    
    const kultupResult = await mongoose.connection.db.collection('users').insertOne(kultupData);
    console.log('✅ Адміністратора kultup створено');
    
    // Перевіряємо створення
    const User = require('../models/User');
    
    // Перевіряємо першого адміністратора (kenny)
    const newKenny = await User.findById(kennyResult.insertedId).select('+password');
    if (newKenny) {
      console.log('\n📊 Інформація про адміністратора kenny:');
      console.log('📧 Email:', newKenny.email);
      console.log('👤 Ім\'я:', newKenny.firstName, newKenny.lastName);
      console.log('🔑 Роль:', newKenny.role);
      console.log('🔐 Пароль присутній:', !!newKenny.password);
      
      // Тестуємо пароль
      const isValid = await newKenny.comparePassword('Xedfxtkkj!');
      console.log('🔍 Пароль валідний:', isValid ? '✅ Так' : '❌ Ні');
    }
    
    // Перевіряємо другого адміністратора (kultup)
    const newKultup = await User.findById(kultupResult.insertedId).select('+password');
    if (newKultup) {
      console.log('\n📊 Інформація про адміністратора kultup:');
      console.log('📧 Email:', newKultup.email);
      console.log('👤 Ім\'я:', newKultup.firstName, newKultup.lastName);
      console.log('🔑 Роль:', newKultup.role);
      console.log('🔐 Пароль присутній:', !!newKultup.password);
      
      // Тестуємо пароль
      const isValid = await newKultup.comparePassword('Qa123456');
      console.log('🔍 Пароль валідний:', isValid ? '✅ Так' : '❌ Ні');
    }
    
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    mongoose.connection.close();
  }
}

createUsers();