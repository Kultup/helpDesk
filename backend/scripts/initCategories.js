const mongoose = require('mongoose');
require('dotenv').config();

// Підключення до MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Category = require('../models/Category');
const User = require('../models/User');

const initialCategories = [
  {
    name: 'technical',
    description: 'Технічні питання та проблеми з обладнанням',
    color: '#3498DB',
    icon: 'wrench',
    sortOrder: 1,
    isActive: true
  },
  {
    name: 'account',
    description: 'Питання щодо облікових записів користувачів',
    color: '#9B59B6',
    icon: 'user',
    sortOrder: 2,
    isActive: true
  },
  {
    name: 'billing',
    description: 'Фінансові питання та розрахунки',
    color: '#E67E22',
    icon: 'credit-card',
    sortOrder: 3,
    isActive: true
  },
  {
    name: 'general',
    description: 'Загальні питання та інформаційні запити',
    color: '#95A5A6',
    icon: 'info-circle',
    sortOrder: 4,
    isActive: true
  }
];

async function initCategories() {
  try {
    console.log('🔄 Ініціалізація категорій...');

    // Перевіряємо, чи вже існують категорії
    const existingCategories = await Category.find();
    
    if (existingCategories.length > 0) {
      console.log('ℹ️  Категорії вже існують в базі даних');
      console.log(`📊 Знайдено ${existingCategories.length} категорій:`);
      existingCategories.forEach(cat => {
        console.log(`   - ${cat.name} (${cat.isActive ? 'активна' : 'неактивна'})`);
      });
      return;
    }

    // Знаходимо адміністратора для поля createdBy
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.log('⚠️  Адміністратор не знайдений. Створюємо категорії без прив\'язки до користувача...');
      // Тимчасово робимо поле createdBy необов'язковим
      const CategoryModel = mongoose.model('Category');
      CategoryModel.schema.path('createdBy').required(false);
    }

    // Створюємо початкові категорії
    for (const categoryData of initialCategories) {
      if (admin) {
        categoryData.createdBy = admin._id;
      }
      const category = new Category(categoryData);
      await category.save();
      console.log(`✅ Створено категорію: ${category.name}`);
    }

    console.log('🎉 Ініціалізація категорій завершена успішно!');
    
  } catch (error) {
    console.error('❌ Помилка при ініціалізації категорій:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Запуск ініціалізації
initCategories();