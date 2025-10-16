const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function createAdmin() {
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
        { email: 'admin@test.com' },
        { email: 'gorodok048@gmail.com' }
      ]
    });
    console.log('🗑️ Старих адміністраторів видалено');
    
    // Хешуємо пароль
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    // Знаходимо існуючі місто та посаду
    const city = await mongoose.connection.db.collection('cities').findOne({ name: 'Київ' });
    const position = await mongoose.connection.db.collection('positions').findOne({ 
      $or: [
        { title: 'Адміністратор системи' },
        { name: 'Адміністратор' }
      ]
    });
    
    if (!city) {
      throw new Error('Місто "Київ" не знайдено в базі даних');
    }
    
    if (!position) {
      throw new Error('Посада "Адміністратор" не знайдена в базі даних');
    }
    
    console.log('🏙️ Знайдено місто:', city.name, '- ID:', city._id);
    console.log('💼 Знайдено посаду:', position.title || position.name, '- ID:', position._id);
    
    // Створюємо адміністратора напряму в колекції
    const adminData = {
      email: 'gorodok048@gmail.com',
      password: hashedPassword,
      firstName: 'Адмін',
      lastName: 'Системи',
      role: 'admin',
      department: 'IT відділ',
      city: city._id,
      position: position._id,
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
    
    const result = await mongoose.connection.db.collection('users').insertOne(adminData);
    console.log('✅ Адміністратора створено');
    
    // Перевіряємо створення
    const User = require('../models/User');
    const newAdmin = await User.findById(result.insertedId).select('+password');
    if (newAdmin) {
      console.log('📧 Email:', newAdmin.email);
      console.log('👤 Ім\'я:', newAdmin.firstName, newAdmin.lastName);
      console.log('🔑 Роль:', newAdmin.role);
      console.log('🔐 Пароль присутній:', !!newAdmin.password);
      
      // Тестуємо пароль
      const isValid = await newAdmin.comparePassword('admin123');
      console.log('🔍 Пароль валідний:', isValid ? '✅ Так' : '❌ Ні');
    }
    
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    mongoose.connection.close();
  }
}

createAdmin();