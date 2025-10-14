const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Position = require('../models/Position');
const City = require('../models/City');

// Підключення до MongoDB
mongoose.connect('mongodb://localhost:27017/helpdesk', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function recreateAdmin() {
  try {
    console.log('Підключення до MongoDB...');
    
    // Видаляємо існуючого адміністратора
    await User.deleteOne({ email: 'admin@test.com' });
    console.log('🗑️ Старого адміністратора видалено');
    
    // Знаходимо або створюємо місто
    let defaultCity = await City.findOne({ name: 'Київ' });
    if (!defaultCity) {
      defaultCity = await City.create({
        name: 'Київ',
        region: 'Київська область',
        coordinates: { lat: 50.4501, lng: 30.5234 }
      });
      console.log('🏙️ Створено місто: Київ');
    }
    
    // Знаходимо або створюємо посаду
    let adminPosition = await Position.findOne({ title: 'Адміністратор системи' });
    if (!adminPosition) {
      // Створюємо тимчасового користувача для поля createdBy
      const tempUser = new User({
        email: 'temp@system.com',
        firstName: 'System',
        lastName: 'Admin',
        role: 'admin',
        city: defaultCity._id,
        department: 'System'
      });
      await tempUser.save({ validateBeforeSave: false });
      
      adminPosition = await Position.create({
        title: 'Адміністратор системи',
        description: 'Повний доступ до системи',
        department: 'IT відділ',
        level: 'director',
        category: 'management',
        permissions: [
          {
            module: 'tickets',
            actions: ['create', 'read', 'update', 'delete', 'assign', 'export']
          },
          {
            module: 'users',
            actions: ['create', 'read', 'update', 'delete']
          }
        ],
        createdBy: tempUser._id
      });
      
      // Видаляємо тимчасового користувача
      await User.findByIdAndDelete(tempUser._id);
      console.log('💼 Створено посаду: Адміністратор системи');
    }
    
    // Створюємо нового адміністратора БЕЗ використання схеми (щоб обійти валідацію)
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    const adminData = {
      email: 'admin@test.com',
      password: hashedPassword,
      firstName: 'Адмін',
      lastName: 'Системи',
      role: 'admin',
      position: adminPosition._id,
      city: defaultCity._id,
      department: 'IT відділ',
      permissions: [
        'create_tickets', 'edit_tickets', 'delete_tickets', 'assign_tickets',
        'view_all_tickets', 'view_analytics', 'export_data', 'manage_users',
        'manage_cities', 'manage_positions', 'system_settings', 'telegram_admin'
      ],
      isActive: true,
      isEmailVerified: true,
      statistics: {
        ticketsCreated: 0,
        ticketsResolved: 0,
        averageResolutionTime: 0,
        satisfactionRating: 5
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Вставляємо напряму в колекцію
    const result = await mongoose.connection.db.collection('users').insertOne(adminData);
    console.log('✅ Адміністратора створено напряму в базі даних');
    
    // Перевіряємо створення
    const newAdmin = await User.findById(result.insertedId);
    if (newAdmin) {
      console.log('📧 Email:', newAdmin.email);
      console.log('👤 Ім\'я:', newAdmin.firstName, newAdmin.lastName);
      console.log('🔑 Роль:', newAdmin.role);
      console.log('🔐 Пароль присутній:', !!newAdmin.password);
      
      // Тестуємо пароль
      const isValid = await bcrypt.compare('admin123', newAdmin.password);
      console.log('🔍 Пароль валідний:', isValid ? '✅ Так' : '❌ Ні');
    }
    
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    mongoose.connection.close();
  }
}

recreateAdmin();