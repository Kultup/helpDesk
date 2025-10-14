const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Підключено до MongoDB');
  } catch (error) {
    console.error('Помилка підключення до MongoDB:', error);
    process.exit(1);
  }
};

const createAdmin = async () => {
  try {
    await connectDB();
    
    // Видаляємо існуючого адміністратора
    await mongoose.connection.db.collection('users').deleteMany({ email: 'admin@test.com' });
    console.log('Старого адміністратора видалено');
    
    // Хешуємо пароль
    const hashedPassword = await bcrypt.hash('admin123', 12);
    console.log('Пароль захешовано');
    
    // Створюємо адміністратора
    const adminData = {
      email: 'admin@test.com',
      password: hashedPassword,
      firstName: 'Адмін',
      lastName: 'Системи',
      role: 'admin',
      department: 'IT відділ',
      city: new mongoose.Types.ObjectId(), // Тимчасовий ObjectId
      position: new mongoose.Types.ObjectId(), // Тимчасовий ObjectId
      registrationStatus: 'approved',
      isActive: true,
      isEmailVerified: true,
      permissions: ['view_analytics'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await mongoose.connection.db.collection('users').insertOne(adminData);
    console.log('✅ Адміністратора створено:', result.insertedId);
    
    // Перевіряємо
    const admin = await mongoose.connection.db.collection('users').findOne({ _id: result.insertedId });
    console.log('📧 Email:', admin.email);
    console.log('🔐 Пароль збережено:', !!admin.password);
    
    // Тестуємо пароль
    const isValid = await bcrypt.compare('admin123', admin.password);
    console.log('🔍 Пароль валідний:', isValid ? '✅ Так' : '❌ Ні');
    
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    mongoose.connection.close();
  }
};

createAdmin();