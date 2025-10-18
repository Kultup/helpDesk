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
    
    // Видаляємо існуючих адміністраторів та користувачів
    await mongoose.connection.db.collection('users').deleteMany({ 
      $or: [
        { email: 'admin@test.com' },
        { email: 'user@test.com' },
        { email: 'gorodok048@gmail.com' }
      ]
    });
    console.log('🗑️ Старих користувачів видалено');
    
    // Хешуємо паролі
    const adminHashedPassword = await bcrypt.hash('admin123', 12);
    const userHashedPassword = await bcrypt.hash('user123', 12);
    
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
    
    // Створюємо або знаходимо посаду користувача
    let userPosition = await mongoose.connection.db.collection('positions').findOne({ 
      $or: [
        { title: 'Користувач' },
        { name: 'Користувач' }
      ]
    });
    
    if (!userPosition) {
      console.log('💼 Створюємо посаду "Користувач"...');
      const positionResult = await mongoose.connection.db.collection('positions').insertOne({
        title: 'Користувач',
        name: 'Користувач',
        description: 'Звичайний користувач системи',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      userPosition = await mongoose.connection.db.collection('positions').findOne({ _id: positionResult.insertedId });
      console.log('✅ Посаду "Користувач" створено');
    }
    
    console.log('🏙️ Знайдено місто:', city.name, '- ID:', city._id);
    console.log('💼 Знайдено посаду адміністратора:', adminPosition.title || adminPosition.name, '- ID:', adminPosition._id);
    console.log('💼 Знайдено посаду користувача:', userPosition.title || userPosition.name, '- ID:', userPosition._id);
    
    // Створюємо адміністратора напряму в колекції
    const adminData = {
      email: 'admin@test.com',
      password: adminHashedPassword,
      firstName: 'Адмін',
      lastName: 'Системи',
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
    
    // Створюємо звичайного користувача
    const userData = {
      email: 'user@test.com',
      password: userHashedPassword,
      firstName: 'Звичайний',
      lastName: 'Користувач',
      role: 'user',
      department: 'Загальний відділ',
      city: city._id,
      position: userPosition._id,
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
    
    // Додаємо користувачів до бази даних
    const adminResult = await mongoose.connection.db.collection('users').insertOne(adminData);
    console.log('✅ Адміністратора створено');
    
    const userResult = await mongoose.connection.db.collection('users').insertOne(userData);
    console.log('✅ Користувача створено');
    
    // Перевіряємо створення
    const User = require('../models/User');
    
    // Перевіряємо адміністратора
    const newAdmin = await User.findById(adminResult.insertedId).select('+password');
    if (newAdmin) {
      console.log('\n📊 Інформація про адміністратора:');
      console.log('📧 Email:', newAdmin.email);
      console.log('👤 Ім\'я:', newAdmin.firstName, newAdmin.lastName);
      console.log('🔑 Роль:', newAdmin.role);
      console.log('🔐 Пароль присутній:', !!newAdmin.password);
      
      // Тестуємо пароль
      const isValid = await newAdmin.comparePassword('admin123');
      console.log('🔍 Пароль валідний:', isValid ? '✅ Так' : '❌ Ні');
    }
    
    // Перевіряємо користувача
    const newUser = await User.findById(userResult.insertedId).select('+password');
    if (newUser) {
      console.log('\n📊 Інформація про користувача:');
      console.log('📧 Email:', newUser.email);
      console.log('👤 Ім\'я:', newUser.firstName, newUser.lastName);
      console.log('🔑 Роль:', newUser.role);
      console.log('🔐 Пароль присутній:', !!newUser.password);
      
      // Тестуємо пароль
      const isValid = await newUser.comparePassword('user123');
      console.log('🔍 Пароль валідний:', isValid ? '✅ Так' : '❌ Ні');
    }
    
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    mongoose.connection.close();
  }
}

createUsers();