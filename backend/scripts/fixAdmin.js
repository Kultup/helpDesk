const mongoose = require('mongoose');
const User = require('../models/User');
const Position = require('../models/Position');
const City = require('../models/City');

async function fixAdmin() {
  try {
    console.log('Підключення до MongoDB...');
    
    await mongoose.connect('mongodb://localhost:27017/helpdesk', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Підключено до MongoDB');
    
    // Знаходимо адміністратора
    const admin = await User.findOne({ email: 'admin@test.com' });
    if (!admin) {
      console.log('❌ Адміністратор не знайдений');
      return;
    }
    
    // Знаходимо місто Київ
    let city = await City.findOne({ name: 'Київ' });
    if (!city) {
      console.log('Створюю місто Київ...');
      city = await City.create({
        name: 'Київ',
        region: 'Київська область',
        coordinates: { lat: 50.4501, lng: 30.5234 }
      });
    }
    
    // Знаходимо або створюємо позицію адміністратора
    let position = await Position.findOne({ title: 'Адміністратор системи' });
    if (!position) {
      console.log('Створюю позицію адміністратора...');
      position = await Position.create({
        title: 'Адміністратор системи',
        description: 'Системний адміністратор Help Desk',
        department: 'IT відділ',
        level: 'manager',
        category: 'general',
        permissions: [{
          module: 'all',
          actions: ['create', 'read', 'update', 'delete']
        }],
        createdBy: admin._id
      });
    }
    
    // Оновлюємо адміністратора
    admin.position = position._id;
    admin.city = city._id;
    
    await admin.save();
    
    console.log('✅ Адміністратора оновлено');
    console.log('📧 Email:', admin.email);
    console.log('🏙️ Місто:', city.name);
    console.log('💼 Позиція:', position.title);
    
    // Перевіряємо оновлення
    const updatedAdmin = await User.findById(admin._id).populate('position city');
    console.log('🔍 Перевірка:');
    console.log('   Position populated:', !!updatedAdmin.position);
    console.log('   City populated:', !!updatedAdmin.city);
    
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    mongoose.connection.close();
  }
}

fixAdmin();